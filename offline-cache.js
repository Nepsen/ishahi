const CACHE_NAME = 'offline-cache-v1';
const UPDATE_INTERVAL = 60000; // 1 min
const urlsToCache = new Set();

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
      return response;
    }
  } catch {}
  return caches.match(request);
}

// Helper to resolve relative URLs against base URL
function resolveUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Get the URL of the page this SW controls (its scope)
    // This is usually the directory containing the SW script
    const clients = await self.clients.matchAll({type: 'window'});
    if (clients.length === 0) return; // no clients yet

    const pageUrl = clients[0].url;

    // Cache the main page
    const mainResponse = await fetch(pageUrl);
    const text = await mainResponse.text();

    urlsToCache.add(pageUrl);

    // Extract all linked assets (href/src) from HTML
    const regex = /(?:href|src)=["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      let url = match[1];
      // Convert relative URLs to absolute
      const absoluteUrl = resolveUrl(url, pageUrl);
      if (absoluteUrl.startsWith(self.location.origin)) {
        urlsToCache.add(absoluteUrl);
      }
    }

    // Cache all discovered URLs
    await Promise.all(
      Array.from(urlsToCache).map(url => fetchAndCache(url).catch(() => {}))
    );

    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(key => (key !== CACHE_NAME) ? caches.delete(key) : null)
    );
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
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
  })());
});

// Update cache every minute
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
