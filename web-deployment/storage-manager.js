/**
 * StorageManager — unified persistence layer for PromptForge.
 * Auto-detects runtime: Electron IPC → File System Access API → localStorage.
 */
(function () {
    'use strict';

    const DATA_KEYS = [
        'promptLibrary', 'srefLibrary', 'manualInformation',
        'textNotes', 'customOptions', 'llmSettings', 'modelRegistry',
        'versionCheckCache', 'pendingUpdateBadge', 'dismissedMentions'
    ];

    const FILE_NAME = 'promptforge-data.json';
    const DATA_VERSION = '3.0';
    const IDB_NAME = 'PromptForgeFS';
    const IDB_STORE = 'handles';
    const IDB_KEY = 'pf_fs_handle';

    // ── Mode detection ──────────────────────────────────────────────

    function detectMode() {
        if (typeof window.electronAPI !== 'undefined') return 'electron';
        if ('showDirectoryPicker' in window) return 'filesystem';
        return 'localstorage';
    }

    const mode = detectMode();

    // ── IndexedDB helpers (for persisting FileSystemDirectoryHandle) ─

    function openIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(IDB_STORE);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbGet(key) {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async function idbSet(key, value) {
        const db = await openIDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ── Internal state ──────────────────────────────────────────────

    let _dirHandle = null;
    let _lastSaved = null;
    let _folderName = null;
    let _ready = (mode === 'localstorage');

    // ── File System Access helpers ──────────────────────────────────

    async function verifyPermission(handle, readWrite) {
        const opts = readWrite ? { mode: 'readwrite' } : {};
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

    async function restoreHandle() {
        if (mode !== 'filesystem') return;
        try {
            const handle = await idbGet(IDB_KEY);
            if (handle) {
                _dirHandle = handle;
                _folderName = handle.name;
                _ready = true;
            }
        } catch { /* IndexedDB unavailable — stay not-ready */ }
    }

    async function readFile() {
        if (!_dirHandle) return null;
        try {
            const fileHandle = await _dirHandle.getFileHandle(FILE_NAME);
            const file = await fileHandle.getFile();
            const text = await file.text();
            return JSON.parse(text);
        } catch (e) {
            if (e.name === 'NotFoundError') return null;
            console.warn('StorageManager: read error', e);
            return null;
        }
    }

    async function writeFile(envelope) {
        if (!_dirHandle) return false;
        try {
            if (!(await verifyPermission(_dirHandle, true))) return false;
            const fileHandle = await _dirHandle.getFileHandle(FILE_NAME, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(envelope, null, 2));
            await writable.close();
            _lastSaved = envelope.lastSaved;
            return true;
        } catch (e) {
            console.warn('StorageManager: filesystem write failed, falling back to localStorage', e);
            try {
                for (const key of DATA_KEYS) {
                    if (envelope.data && key in envelope.data && envelope.data[key] !== undefined) {
                        localStorage.setItem(key, JSON.stringify(envelope.data[key]));
                    }
                }
                _lastSaved = envelope.lastSaved || new Date().toISOString();
                return true;
            } catch (lsErr) {
                console.error('StorageManager: write error', lsErr);
                return false;
            }
        }
    }

    // ── Electron helpers (stubs — wired up in PF-CONFIG-2) ─────────

    async function electronRead() {
        try { return await window.electronAPI.readData(); }
        catch { return null; }
    }

    async function electronWrite(envelope) {
        try {
            await window.electronAPI.writeData(envelope);
            _lastSaved = envelope.lastSaved;
            return true;
        } catch { return false; }
    }

    // ── Envelope builder ────────────────────────────────────────────

    function buildEnvelope(dataObject) {
        const ts = new Date().toISOString();
        return {
            version: DATA_VERSION,
            lastSaved: ts,
            data: dataObject
        };
    }

    // ── Migration check ─────────────────────────────────────────────

    function localStorageHasData() {
        return DATA_KEYS.some(k => localStorage.getItem(k) !== null);
    }

    function migrationNeeded() {
        if (mode === 'localstorage') return false;
        if (localStorage.getItem('pf_migration_offered')) return false;
        return localStorageHasData();
    }

    function loadFromLocalStorage() {
        const result = {};
        for (const key of DATA_KEYS) {
            const raw = localStorage.getItem(key);
            try { result[key] = raw ? JSON.parse(raw) : null; }
            catch { result[key] = raw; }
        }
        return result;
    }

    // ── Public API ──────────────────────────────────────────────────

    const StorageManager = {

        getMode() {
            return mode;
        },

        isReady() {
            if (mode === 'localstorage') return true;
            if (mode === 'electron') return true;
            return _ready && _dirHandle !== null;
        },

        async checkPermission() {
            if (mode !== 'filesystem' || !_dirHandle) return 'no-handle';
            try {
                const perm = await _dirHandle.queryPermission({ mode: 'readwrite' });
                return perm; // 'granted' | 'prompt' | 'denied'
            } catch {
                return 'error';
            }
        },

        async requestPermission() {
            if (mode !== 'filesystem' || !_dirHandle) return false;
            try {
                const perm = await _dirHandle.requestPermission({ mode: 'readwrite' });
                return perm === 'granted';
            } catch {
                return false;
            }
        },

        async chooseFolder() {
            if (mode !== 'filesystem') return false;
            try {
                _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                _folderName = _dirHandle.name;
                _ready = true;
                await idbSet(IDB_KEY, _dirHandle);
                return true;
            } catch (e) {
                if (e.name !== 'AbortError') console.warn('StorageManager: folder pick failed', e);
                return false;
            }
        },

        async load(key) {
            if (mode === 'localstorage') {
                const raw = localStorage.getItem(key);
                try { return raw ? JSON.parse(raw) : null; }
                catch { return raw; }
            }

            if (mode === 'electron') {
                const envelope = await electronRead();
                return envelope?.data?.[key] ?? null;
            }

            // filesystem
            if (!this.isReady()) return null;
            const envelope = await readFile();
            return envelope?.data?.[key] ?? null;
        },

        async save(key, value) {
            if (mode === 'localstorage') {
                try {
                    localStorage.setItem(key, JSON.stringify(value));
                    _lastSaved = new Date().toISOString();
                    return true;
                } catch { return false; }
            }

            // For filesystem/electron: load existing, merge, write back
            const existing = await this.loadAll();
            existing[key] = value;
            return this.saveAll(existing);
        },

        async saveAll(dataObject) {
            if (mode === 'localstorage') {
                try {
                    for (const key of DATA_KEYS) {
                        if (key in dataObject && dataObject[key] !== undefined) {
                            localStorage.setItem(key, JSON.stringify(dataObject[key]));
                        }
                    }
                    _lastSaved = new Date().toISOString();
                    return true;
                } catch { return false; }
            }

            const envelope = buildEnvelope(dataObject);

            if (mode === 'electron') return electronWrite(envelope);
            if (!this.isReady()) return false;
            return writeFile(envelope);
        },

        async loadAll() {
            if (mode === 'localstorage') {
                return loadFromLocalStorage();
            }

            let envelope = null;

            if (mode === 'electron') {
                envelope = await electronRead();
            } else if (this.isReady()) {
                envelope = await readFile();
            }

            if (envelope?.data) {
                const result = {};
                for (const key of DATA_KEYS) {
                    result[key] = envelope.data[key] ?? null;
                }
                _lastSaved = envelope.lastSaved || null;
                return result;
            }

            // No file-based data yet — check for migration
            if (migrationNeeded()) {
                localStorage.setItem('pf_migration_offered', '1');
                console.info('StorageManager: localStorage data detected — available for migration');
                return loadFromLocalStorage();
            }

            const empty = {};
            for (const key of DATA_KEYS) empty[key] = null;
            return empty;
        },

        getStorageInfo() {
            let estimatedSize = 0;

            if (mode === 'localstorage') {
                for (const key of DATA_KEYS) {
                    const v = localStorage.getItem(key);
                    if (v) estimatedSize += v.length * 2; // UTF-16
                }
            }

            return {
                mode,
                folderName: _folderName,
                lastSaved: _lastSaved,
                estimatedSize,
                ready: this.isReady()
            };
        },

        hasLocalStorageData() {
            return localStorageHasData();
        },

        getLocalStorageSummary() {
            let promptCount = 0;
            let srefCount = 0;
            try {
                const pl = localStorage.getItem('promptLibrary');
                if (pl) promptCount = JSON.parse(pl).length || 0;
            } catch { /* ignore */ }
            try {
                const sl = localStorage.getItem('srefLibrary');
                if (sl) srefCount = JSON.parse(sl).length || 0;
            } catch { /* ignore */ }
            return { promptCount, srefCount, hasData: localStorageHasData() };
        },

        async migrateFromLocalStorage() {
            if (mode === 'localstorage') return { success: false, error: 'Already using localStorage' };
            if (!localStorageHasData()) return { success: false, error: 'No localStorage data found' };

            const data = loadFromLocalStorage();
            const ok = await this.saveAll(data);
            return { success: ok, data };
        },

        clearLocalStorageData() {
            for (const key of DATA_KEYS) {
                localStorage.removeItem(key);
            }
            localStorage.removeItem('pf_migration_offered');
        }
    };

    // ── Init ────────────────────────────────────────────────────────

    async function init() {
        await restoreHandle();
        console.debug(`StorageManager ready \u2014 mode: ${mode}`);
    }

    init();

    window.StorageManager = StorageManager;
})();
