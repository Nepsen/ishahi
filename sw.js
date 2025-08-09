const CACHE_NAME = 'auto-offline-v2';
let CORE_RESOURCES = []; // autooffline.js থেকে অ্যাড হবে

self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_RESOURCES') {
    CORE_RESOURCES = event.data.resources;
    console.log('[SW] Received resources list:', CORE_RESOURCES);
    caches.open(CACHE_NAME).then(cache => {
      CORE_RESOURCES.forEach(url => {
        cache.add(url)
          .then(() => console.log('[SW] Cached:', url))
          .catch(err => console.warn('[SW] Failed to cache:', url, err));
      });
    });
  }
});

self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[SW] Deleting old cache:', key);
          return caches.delete(key);
        }
      }))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        console.log('[SW] Serving from cache:', event.request.url);
        return cached;
      }
      console.log('[SW] Fetching from network:', event.request.url);
      return fetch(event.request)
        .then(networkRes => {
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, networkRes.clone());
              console.log('[SW] Cached new from network:', event.request.url);
            });
          return networkRes;
        })
        .catch(err => {
          console.warn('[SW] Fetch failed (offline?):', event.request.url);
          return cached;
        });
    })
  );
});
