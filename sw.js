const CACHE_NAME = 'site-offline-cache-v4';
const RESOURCES = []; // পেজ থেকে JS এই লিস্ট পূরণ করবে

async function cacheFile(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url, res.clone());
      console.log('[SW] Cached:', url);
    }
  } catch (err) {
    console.error('[SW] Error caching:', url, err);
  }
}

async function cacheAllResources() {
  for (const url of RESOURCES) {
    await cacheFile(url);
  }
}

self.addEventListener('install', e => {
  console.log('[SW] Installing...');
  e.waitUntil(cacheAllResources().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  console.log('[SW] Activating...');
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) {
        console.log('[SW] Serving from cache:', e.request.url);
        return cached;
      }
      return fetch(e.request).then(networkRes => {
        if (networkRes.ok && e.request.method === 'GET') {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, networkRes.clone());
            console.log('[SW] Fetched & cached at runtime:', e.request.url);
          });
        }
        return networkRes;
      }).catch(() => caches.match(RESOURCES[0]));
    })
  );
});

self.addEventListener('message', e => {
  if (e.data.type === 'update-resources') {
    RESOURCES.length = 0;
    RESOURCES.push(...e.data.resources);
    cacheAllResources();
  }
});
