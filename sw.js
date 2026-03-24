// Service Worker for Prompt Helper PWA
const CACHE_NAME = 'ai-prompt-generator-v3.0.0';
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './tailwind.css',
    './styles/app.css',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
    console.log('Service Worker: Install event');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: All files cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activate event');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Claiming clients');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http requests
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                if (response) {
                    console.log('Service Worker: Serving from cache', event.request.url);
                    return response;
                }

                console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request).then((response) => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response for caching
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                }).catch((error) => {
                    console.error('Service Worker: Fetch failed', error);
                    
                    // Return a custom offline page or cached content
                    if (event.request.destination === 'document') {
                        return caches.match('./index.html');
                    }
                    
                    throw error;
                });
            })
    );
});

// Handle background sync (for future use)
self.addEventListener('sync', (event) => {
    console.log('Service Worker: Background sync', event.tag);
    
    if (event.tag === 'background-sync') {
        event.waitUntil(
            // Perform background sync tasks here
            Promise.resolve()
        );
    }
});

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
    console.log('Service Worker: Push event', event);
    
    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: './assets/icon-192x192.png',
        badge: './assets/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'Open App',
                icon: './assets/icon-96x96.png'
            },
            {
                action: 'close',
                title: 'Close',
                icon: './assets/icon-96x96.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('Prompt Helper', options)
    );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification click', event);
    
    event.notification.close();

    if (event.action === 'explore') {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});
