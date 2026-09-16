import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
function worker({ offline = false, failInstall = false } = {}) {
    const handlers = new Map();
    const removed = [], precached = [];
    let activated = false;
    const cached = new Response('cached app');
    const cache = {
        async addAll(paths) { if (failInstall) throw new Error('Asset unavailable'); precached.push(...paths); },
        async match() { return cached.clone(); }, async put() {}
    };
    const context = vm.createContext({
        console: { error() {} }, URL,
        self: {
            location: { origin: 'https://example.test' }, registration: { scope: 'https://example.test/prompt-app/' },
            addEventListener: (name, cb) => handlers.set(name, cb),
            skipWaiting: async () => { activated = true; }, clients: { claim: async () => {} }
        },
        caches: {
            open: async () => cache, match: async () => cached.clone(),
            keys: async () => ['prompt-forge-v4.1.0', 'prompt-forge-v4.1.1', 'another-app-cache'],
            delete: async name => { removed.push(name); return true; }
        },
        fetch: async () => { if (offline) throw new Error('Offline'); return new Response('fresh app'); }
    });
    vm.runInContext(source, context);
    return { handlers, removed, precached, get activated() { return activated; } };
}

test('offline installation includes every app script', async () => {
    const w = worker(); let done;
    w.handlers.get('install')({ waitUntil(p) { done = p; } }); await done;
    for (const file of ['app.js', 'storage-manager.js', 'model-registry.js', 'version-checker.js']) {
        assert.ok(w.precached.includes('./' + file), file);
    }
});

test('an incomplete installation does not replace the working cache', async () => {
    const w = worker({ failInstall: true }); let done;
    w.handlers.get('install')({ waitUntil(p) { done = p; } });
    await assert.rejects(done, /Asset unavailable/);
    assert.equal(w.activated, false);
});

test('activation removes only older Prompt Forge caches', async () => {
    const w = worker(); let done;
    w.handlers.get('activate')({ waitUntil(p) { done = p; } }); await done;
    assert.deepEqual(w.removed, ['prompt-forge-v4.1.0']);
});

for (const offline of [false, true]) {
    test(offline ? 'offline app uses its cached script' : 'online app gets fresh code', async () => {
        const w = worker({ offline }); let response;
        w.handlers.get('fetch')({ request: new Request('https://example.test/prompt-app/app.js'), respondWith(p) { response = p; } });
        assert.equal(await (await response).text(), offline ? 'cached app' : 'fresh app');
    });
}

test('the app cache does not intercept other pages or external services', () => {
    const w = worker();
    for (const url of ['https://example.test/', 'https://example.test/art/', 'http://localhost:11434/api/tags']) {
        let intercepted = false;
        w.handlers.get('fetch')({ request: new Request(url), respondWith() { intercepted = true; } });
        assert.equal(intercepted, false, url);
    }
});
