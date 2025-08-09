const CACHE_NAME = 'offline-cache-v1';
const UPDATE_INTERVAL = 60000; // 1 min
const urlsToCache = new Set();

////////////////////////////////////////////////////
// IndexedDB Helpers
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('offlineDataDB', 1);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data', { keyPath: 'key' });
      }
    };
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e);
  });
}

async function readFromIndexedDB(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readonly');
    const store = tx.objectStore('data');
    const getReq = store.get(key);
    getReq.onsuccess = () => resolve(getReq.result?.value);
    getReq.onerror = () => reject(getReq.error);
  });
}

async function saveToIndexedDB(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('data', 'readwrite');
    const store = tx.objectStore('data');
    const putReq = store.put({ key, value });
    putReq.onsuccess = () => resolve();
    putReq.onerror = () => reject(putReq.error);
  });
}

////////////////////////////////////////////////////
// Fetch and cache helper
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

////////////////////////////////////////////////////
// Install event - cache page and linked assets
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Find controlled page URL(s)
    const clients = await self.clients.matchAll({type: 'window'});
    if (clients.length === 0) return; // no clients yet

    const pageUrl = clients[0].url;

    // Cache main page
    const mainResponse = await fetch(pageUrl);
    const text = await mainResponse.text();

    urlsToCache.add(pageUrl);

    // Find all linked assets (href/src)
    const regex = /(?:href|src)=["']([^"']+)["']/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      let url = match[1];
      const absoluteUrl = resolveUrl(url, pageUrl);
      if (absoluteUrl.startsWith(self.location.origin)) {
        urlsToCache.add(absoluteUrl);
      }
    }

    // Cache all found URLs
    await Promise.all(
      Array.from(urlsToCache).map(url => fetchAndCache(url).catch(() => {}))
    );

    self.skipWaiting();
  })());
});

////////////////////////////////////////////////////
// Activate event - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(key => (key !== CACHE_NAME) ? caches.delete(key) : null)
    );
    self.clients.claim();
  })());
});

////////////////////////////////////////////////////
// Fetch event - serve from network, cache updated; fallback to cache or IndexedDB
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Example: intercept API JSON calls (adjust your path as needed)
  if (url.pathname.startsWith('/api/data')) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.status === 200) {
          const data = await networkResponse.clone().json();
          await saveToIndexedDB('apiData', data);
        }
        return networkResponse;
      } catch {
        const cachedData = await readFromIndexedDB('apiData');
        if (cachedData) {
          return new Response(JSON.stringify(cachedData), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Offline & no cached data', { status: 503 });
      }
    })());
    return;
  }

  // Default fetch behavior - network first, fallback to cache
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

////////////////////////////////////////////////////
// Periodic cache update every minute
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
