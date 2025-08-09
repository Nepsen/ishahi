const CACHE_NAME = 'offline-cache-v1';
const UPDATE_INTERVAL = 60000;
let urlsToCache = new Set();

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
      return response;
    }
  } catch {}
  return caches.match(request);
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch('/ishahi/index.html');
      const text = await response.text();

      urlsToCache.add('/ishahi/index.html');

      const regex = /(?:href|src)="([^"]+)"/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        let url = match[1];
        if (!url.startsWith('http') && !url.startsWith('//')) {
          if (!url.startsWith('/')) url = '/ishahi/' + url;
          urlsToCache.add(url);
        }
      }

      await Promise.all(
        Array.from(urlsToCache).map(url => fetchAndCache(url).catch(() => {}))
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
      self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (event.request.method === 'GET') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return caches.match(event.request) || new Response('Offline', { status: 503 });
      }
    })()
  );
});

setInterval(async () => {
  if (self.navigator?.onLine ?? true) {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urlsToCache) {
      try {
        const response = await fetch(url);
        if (response && response.status === 200) {
          await cache.put(url, response.clone());
        }
      } catch {}
    }
  }
}, UPDATE_INTERVAL);
