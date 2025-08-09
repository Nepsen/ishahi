const CACHE_NAME = 'auto-cache-v2';
const UPDATE_INTERVAL = 1000; // 1 second updates when online
const urlsToCache = new Set();
let isOnline = true;

// Enhanced resource discovery
async function discoverResources(pageUrl) {
  try {
    const response = await fetch(pageUrl);
    const text = await response.text();
    
    // Extract all potential resources
    const resourcePatterns = [
      /(?:href|src)=["']([^"']+)["']/g,        // HTML tags
      /url\(["']?([^"')]+)["']?\)/g,           // CSS urls
      /fetch\(["']([^"']+)["']\)/g,            // Fetch calls
      /["']([^"']+\.(?:js|css|png|jpg|jpeg|gif|svg|webp|json))["']/g // Common file extensions
    ];
    
    const discoveredUrls = new Set();
    
    for (const pattern of resourcePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const url = resolveUrl(match[1], pageUrl);
        if (url.startsWith(self.location.origin)) {
          discoveredUrls.add(url);
        }
      }
    }
    
    return discoveredUrls;
  } catch (e) {
    console.warn('Resource discovery failed:', e);
    return new Set();
  }
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

async function cacheResources() {
  if (!isOnline) return;
  
  const cache = await caches.open(CACHE_NAME);
  const clients = await self.clients.matchAll();
  
  // Always include the current page
  if (clients.length > 0) {
    urlsToCache.add(clients[0].url);
  }
  
  // Discover and cache new resources
  for (const url of Array.from(urlsToCache)) {
    try {
      const discovered = await discoverResources(url);
      discovered.forEach(u => urlsToCache.add(u));
    } catch (e) {
      console.warn('Discovery failed for', url, e);
    }
  }
  
  // Cache all known resources
  await Promise.all(Array.from(urlsToCache).map(async url => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
        
        // Update localStorage for text-based resources
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.match(/^(text|application\/json)/)) {
          const text = await response.text();
          try {
            localStorage.setItem(url, text);
          } catch (e) {
            console.warn('localStorage quota exceeded for', url);
          }
        }
      }
    } catch (e) {
      console.warn('Cache update failed for', url, e);
    }
  }));
}

// Network status detection
function updateNetworkStatus() {
  isOnline = self.navigator?.onLine ?? true;
  if (isOnline) {
    cacheResources();
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await cacheResources();
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)
    );
    self.clients.claim();
    updateNetworkStatus();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith((async () => {
    const request = event.request;
    const url = request.url;
    
    // Try network first when online
    if (isOnline) {
      try {
        const networkResponse = await fetch(request);
        
        // Cache the response
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
        
        // Update localStorage for text resources
        const contentType = networkResponse.headers.get('Content-Type') || '';
        if (contentType.match(/^(text|application\/json)/)) {
          const text = await networkResponse.text();
          try {
            localStorage.setItem(url, text);
          } catch {}
        }
        
        return networkResponse;
      } catch (e) {
        isOnline = false;
      }
    }
    
    // Offline fallback
    try {
      // Try cache first
      const cachedResponse = await caches.match(request);
      if (cachedResponse) return cachedResponse;
      
      // Then try localStorage
      const cachedText = localStorage.getItem(url);
      if (cachedText) {
        return new Response(cachedText, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    } catch (e) {
      console.warn('Offline fallback failed:', e);
    }
    
    // Final fallback
    return new Response('Offline - Content not available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  })());
});

// Event listeners for network status
self.addEventListener('online', updateNetworkStatus);
self.addEventListener('offline', updateNetworkStatus);

// Continuous updates when online
function startUpdateInterval() {
  setInterval(() => {
    if (isOnline) {
      cacheResources();
    }
  }, UPDATE_INTERVAL);
}

// Initialize
self.addEventListener('message', event => {
  if (event.data === 'init') {
    updateNetworkStatus();
    startUpdateInterval();
  }
});

// Start the update cycle
updateNetworkStatus();
startUpdateInterval();
