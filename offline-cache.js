const CACHE_NAME = 'offline-cache-v1';
const UPDATE_INTERVAL = 60000; // 1 min
const urlsToCache = new Set();

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());

      // Also save to localStorage for fallback
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/html') || contentType.includes('text/plain')) {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        try {
          // Use localStorage key as URL string
          localStorage.setItem(request.url, text);
        } catch (e) {
          // localStorage quota exceeded or blocked, ignore
          console.warn('localStorage save failed for', request.url, e);
        }
      }

      return response;
    }
  } catch (e) {
    // console.warn('Fetch failed, fallback to cache:', e);
  }
  return caches.match(request);
}

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
    const clientsList = await self.clients.matchAll({ type: 'window' });
    if (clientsList.length === 0) return;

    const pageUrl = clientsList[0].url;
    urlsToCache.add(pageUrl);

    try {
      const response = await fetch(pageUrl);
      const text = await response.text();

      // Extract URLs from href/src
      const regex = /(?:href|src)=["']([^"']+)["']/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        let url = match[1];
        const absoluteUrl = resolveUrl(url, pageUrl);
        if (absoluteUrl.startsWith(self.location.origin)) {
          urlsToCache.add(absoluteUrl);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch main page during install', e);
    }

    // Cache all discovered URLs
    await Promise.all(Array.from(urlsToCache).map(url => fetchAndCache(url).catch(() => {})));

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
    if (event.request.method !== 'GET') {
      // Pass through non-GET requests
      return fetch(event.request);
    }

    try {
      // Try network first
      const networkResponse = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, networkResponse.clone());

      // Also update localStorage if possible
      const contentType = networkResponse.headers.get('Content-Type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/html') || contentType.includes('text/plain')) {
        const text = await networkResponse.clone().text();
        try {
          localStorage.setItem(event.request.url, text);
        } catch {
          // Ignore quota errors
        }
      }

      return networkResponse;
    } catch (err) {
      // Offline fallback: try cache first
      const cachedResponse = await caches.match(event.request);
      if (cachedResponse) return cachedResponse;

      // If no cache, try localStorage fallback
      try {
        const cachedText = localStorage.getItem(event.request.url);
        if (cachedText) {
          // Create a Response object from cached text
          return new Response(cachedText, {
            headers: { 'Content-Type': 'text/html' } // You may want to detect type dynamically
          });
        }
      } catch {
        // ignore localStorage errors
      }

      // No cache or localStorage, return offline message
      return new Response('You are offline and the requested resource is not cached.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' })
      });
    }
  })());
});

// Periodic cache update
setInterval(async () => {
  if (self.navigator?.onLine ?? true) {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urlsToCache) {
      try {
        const response = await fetch(url);
        if (response && response.status === 200) {
          await cache.put(url, response.clone());

          // Also update localStorage
          const contentType = response.headers.get('Content-Type') || '';
          if (contentType.includes('application/json') || contentType.includes('text/html') || contentType.includes('text/plain')) {
            const text = await response.clone().text();
            try {
              localStorage.setItem(url, text);
            } catch {}
          }
        }
      } catch {}
    }
  }
}, UPDATE_INTERVAL);
