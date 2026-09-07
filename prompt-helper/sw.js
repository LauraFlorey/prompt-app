// Service Worker for Prompt Forge PWA
const CACHE_NAME = 'prompt-forge-v4.1.0';
const PRECACHE = [
    './',
    './index.html',
    './app.js',
    '../tailwind.css',
    '../styles/app.css',
    '../styles/fonts.css',
    '../styles/bootstrap-icons.css',
    './manifest.json',
    './sw.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
            .catch((error) => console.error('Service Worker: precache failed', error))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

function isAppShellRequest(url) {
    const path = url.pathname;
    if (path.endsWith('/') || path.endsWith('.html')) return true;
    if (path.endsWith('.js') || path.endsWith('.css') || path.endsWith('.json')) return true;
    if (path.endsWith('/sw.js') || path.endsWith('manifest.json')) return true;
    return false;
}

async function networkFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok && (fresh.type === 'basic' || fresh.type === 'cors')) {
            cache.put(request, fresh.clone());
        }
        return fresh;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate' || request.destination === 'document') {
            return cache.match('./index.html');
        }
        throw error;
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok && (response.type === 'basic' || response.type === 'cors')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
    }
    return response;
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;

    const url = new URL(event.request.url);

    if (url.pathname.endsWith('/sw.js')) {
        event.respondWith(fetch(event.request));
        return;
    }

    if (url.origin === self.location.origin && isAppShellRequest(url)) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request).catch(() => caches.match(event.request)));
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
