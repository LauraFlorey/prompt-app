import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../storage-manager.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const clone = value => JSON.parse(JSON.stringify(value));

function storage({ permission = 'granted', writeError = false, localOnly = false } = {}) {
    const local = new Map();
    let data = { version: '3.0', lastSaved: '2026-09-15T12:00:00Z', data: {
        promptLibrary: [{ id: 1, name: 'Existing prompt' }], srefLibrary: [{ id: 2 }],
        modelRegistry: [{ id: 'custom-model' }], modelRegistrySeedVersion: 'test-seed'
    } };
    let writes = 0;
    let restored;
    let handleRequested;
    const handleReady = new Promise(resolve => { handleRequested = resolve; });
    const handle = {
        name: 'Test data',
        queryPermission: async () => permission,
        requestPermission: async () => (permission = 'granted'),
        async getFileHandle() {
            if (permission !== 'granted') throw new Error('Permission required');
            return {
                getFile: async () => ({ text: async () => JSON.stringify(data) }),
                createWritable: async () => ({
                    async write(text) {
                        if (writeError) throw new Error('Disk unavailable');
                        writes++;
                        data = JSON.parse(text);
                    },
                    async close() {}
                })
            };
        }
    };
    const context = vm.createContext({
        console: quiet,
        window: localOnly ? {} : { showDirectoryPicker: async () => handle },
        localStorage: {
            getItem: key => local.get(key) ?? null,
            setItem: (key, value) => local.set(key, value),
            removeItem: key => local.delete(key)
        },
        indexedDB: { open() {
            const request = {};
            queueMicrotask(() => {
                request.result = { transaction: () => ({ objectStore: () => ({ get() {
                    const get = {};
                    restored = () => { get.result = handle; get.onsuccess(); };
                    handleRequested();
                    return get;
                } }) }) };
                request.onsuccess();
            });
            return request;
        } }
    });
    vm.runInContext(source, context);
    return {
        manager: context.window.StorageManager, local,
        get data() { return data; }, get writes() { return writes; },
        async restore() { await handleReady; restored(); await context.window.StorageManager.ready; }
    };
}

test('waits for the restored folder before loading existing libraries', async () => {
    const s = storage();
    let ready = false;
    s.manager.ready.then(() => { ready = true; });
    assert.equal(s.manager.isReady(), false);
    await Promise.resolve();
    assert.equal(ready, false);
    await s.restore();
    assert.equal(s.manager.isReady(), true);
    assert.deepEqual(clone((await s.manager.loadAll()).promptLibrary), s.data.data.promptLibrary);
    assert.equal(s.writes, 0);
});

test('permission can be renewed without writing over the saved library', async () => {
    const s = storage({ permission: 'prompt' });
    await s.restore();
    assert.equal(s.manager.isReady(), false);
    assert.equal(await s.manager.saveAll({ promptLibrary: [] }), false);
    assert.equal(s.writes, 0);
    assert.equal(await s.manager.requestPermission(), true);
    assert.deepEqual(clone((await s.manager.loadAll()).promptLibrary), [{ id: 1, name: 'Existing prompt' }]);
    assert.equal(s.writes, 0);
});

test('saving one setting preserves existing prompts and the model seed version', async () => {
    const s = storage();
    await s.restore();
    assert.equal(await s.manager.save('manualInformation', 'Updated notes'), true);
    assert.equal(s.data.data.manualInformation, 'Updated notes');
    assert.deepEqual(s.data.data.promptLibrary, [{ id: 1, name: 'Existing prompt' }]);
    assert.equal(s.data.data.modelRegistrySeedVersion, 'test-seed');
});

test('a failed folder write keeps a browser recovery copy but reports failure', async () => {
    const s = storage({ writeError: true });
    await s.restore();
    const previous = clone(s.data);
    const lastSavedBefore = s.manager.getStorageInfo().lastSaved;
    const value = { ...previous.data, promptLibrary: [{ id: 3, name: 'New prompt' }] };
    assert.equal(await s.manager.saveAll(value), false);
    assert.deepEqual(s.data, previous);
    assert.deepEqual(JSON.parse(s.local.get('promptLibrary')), value.promptLibrary);
    assert.equal(s.manager.getStorageInfo().lastSaved, lastSavedBefore);
});

test('browser-only storage still round-trips saved prompts', async () => {
    const s = storage({ localOnly: true });
    await s.manager.ready;
    assert.equal(await s.manager.save('promptLibrary', [{ id: 4 }]), true);
    assert.deepEqual(clone(await s.manager.load('promptLibrary')), [{ id: 4 }]);
});

function appContext(saveResult) {
    const callbacks = new Map();
    const context = vm.createContext({
        console: quiet, window: {}, document: { addEventListener: (event, cb) => callbacks.set(event, cb) },
        StorageManager: { saveAll: async () => saveResult },
        localStorage: { setItem() {}, getItem() { return null; } },
        setTimeout, clearTimeout, setInterval, clearInterval
    });
    vm.runInContext(appSource, context);
    return { context, callbacks, prototype: context.window.PromptGenerator.prototype };
}

test('a false save result leaves the app unsaved and enables Retry', async () => {
    const { prototype } = appContext(false);
    let markedSaved = false;
    const app = {
        hasUnsavedChanges: true, uploadedDocuments: [], saveSettings: {},
        getCurrentAppState: () => ({ promptLibrary: [{ id: 1 }] }),
        markAsSaved() { markedSaved = true; }, updateSaveStatus() {}, updateStorageHealth() {}
    };
    await prototype._executeSave.call(app);
    assert.equal(markedSaved, false);
    assert.equal(app.hasUnsavedChanges, true);
    assert.equal(app._lastSaveFailed, true);
    assert.equal(app._saveRetryPending, true);
});

test('successful saves clear the failure state', async () => {
    const { prototype } = appContext(true);
    let markedSaved = false;
    const app = {
        uploadedDocuments: [], saveSettings: {}, _lastSaveFailed: true, _saveRetryPending: true,
        getCurrentAppState: () => ({}), markAsSaved() { markedSaved = true; }
    };
    await prototype._executeSave.call(app);
    assert.equal(markedSaved, true);
    assert.equal(app._lastSaveFailed, false);
    assert.equal(app._saveRetryPending, false);
});

test('startup waits for storage restoration before model and app initialization', async () => {
    const { context, callbacks, prototype } = appContext(true);
    const calls = [];
    let resolveReady;
    context.StorageManager.ready = new Promise(resolve => { resolveReady = resolve; });
    context.ModelRegistry = { init: async () => calls.push('models') };
    context.VersionChecker = { init: async () => calls.push('versions') };
    prototype.init = async () => calls.push('app');
    const startup = callbacks.get('DOMContentLoaded')();
    await Promise.resolve();
    assert.deepEqual(calls, []);
    resolveReady();
    await startup;
    assert.deepEqual(calls, ['models', 'versions', 'app']);
});
