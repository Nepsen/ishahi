const CACHE_VERSION = 'auto-cache-v1';
const CACHE_NAME = `${CACHE_VERSION}-${self.registration.scope}`;
const MAX_CACHE_ITEMS = 100; // Limit cache size
const MAX_CACHE_AGE = 365 * 24 * 60 * 60 * 1000; // 1 week

// Auto-detected cacheable content types
const AUTO_CACHE_TYPES = [
  'text/html',
  'text/css',
  'application/javascript',
  'image/',
  'font/',
  'application/json'
];

// Track seen requests for auto-caching
const seenRequests = new Set();

self.addEventListener('install', event => {
  // Skip waiting to activate immediately
  self.skipWaiting();
  console.log('Auto-offline service worker installed');
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Clean up old caches
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (key.startsWith('auto-cache-') && key !== CACHE_NAME) {
        return caches.delete(key);
      }
    }));
    
    // Claim all clients immediately
    await self.clients.claim();
    console.log('Auto-offline service worker activated');
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests and chrome-extension URLs
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Skip third-party requests unless they match cacheable types
  const isSameOrigin = url.origin === location.origin;
  const isCacheableType = AUTO_CACHE_TYPES.some(type => 
    request.headers.get('Accept')?.includes(type)
  );
  
  if (!isSameOrigin && !isCacheableType) {
    return;
  }
  
  // Track this request for future auto-caching
  if (!seenRequests.has(request.url)) {
    seenRequests.add(request.url);
    if (seenRequests.size > MAX_CACHE_ITEMS) {
      // Remove oldest entry if we exceed limit
      const oldest = seenRequests.values().next().value;
      seenRequests.delete(oldest);
    }
  }
  
  // Network-first strategy with fallback to cache
  event.respondWith((async () => {
    try {
      // Try network first
      const networkResponse = await fetch(request);
      
      // Cache successful responses
      if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone()).catch(() => {});
      }
      
      return networkResponse;
    } catch (err) {
      // Network failed - try cache
      const cachedResponse = await caches.match(request);
      
      if (cachedResponse) {
        return cachedResponse;
      }
      
      // For HTML requests, return a simple offline page
      if (request.headers.get('Accept')?.includes('text/html')) {
        return new Response(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Offline</title>
              <style>
                body { font-family: sans-serif; text-align: center; padding: 2em; }
              </style>
            </head>
            <body>
              <h1>You're offline</h1>
              <p>This page will be available when you reconnect to the internet.</p>
            </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      return new Response('Offline', { status: 503 });
    }
  })());
});

// Background cache updating
self.addEventListener('message', event => {
  if (event.data === 'updateCache') {
    updateCache();
  }
});

async function updateCache() {
  if (!await isOnline()) return;
  
  const cache = await caches.open(CACHE_NAME);
  const now = Date.now();
  
  // Update all seen requests
  for (const url of seenRequests) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch (err) {
      console.log(`Failed to update ${url}:`, err);
    }
  }
  
  // Clean old cache entries
  const requests = await cache.keys();
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    
    const date = new Date(response.headers.get('date') || now);
    const age = now - date.getTime();
    
    if (age > MAX_CACHE_AGE) {
      await cache.delete(request);
      seenRequests.delete(request.url);
    }
  }
}

async function isOnline() {
  try {
    const response = await fetch(location.origin, {
      method: 'HEAD',
      cache: 'no-store',
      timeout: 3000
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Update cache every hour
setInterval(updateCache, 60 * 60 * 1000);
