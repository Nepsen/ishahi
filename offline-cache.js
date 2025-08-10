const CACHE_NAME = 'offline-mirror-v3';
const UPDATE_INTERVAL = 1000; // 1 second updates when online
const urlsToCache = new Set();
let isOnline = true;

// Enhanced logger with colors and timestamps
const logger = {
  log: (...args) => console.log('%c[SW]', 'color: #4CAF50;', new Date().toISOString(), ...args),
  warn: (...args) => console.warn('%c[SW]', 'color: #FFC107;', new Date().toISOString(), ...args),
  error: (...args) => console.error('%c[SW]', 'color: #F44336;', new Date().toISOString(), ...args),
  debug: (...args) => console.debug('%c[SW]', 'color: #2196F3;', new Date().toISOString(), ...args)
};

// Enhanced resource discovery
async function discoverResources(pageUrl) {
  try {
    logger.debug(`Discovering resources for: ${pageUrl}`);
    const response = await fetch(pageUrl);
    const text = await response.text();
    
    const resourcePatterns = [
      /(?:href|src)=["']([^"']+)["']/g,        // HTML tags
      /url\(["']?([^"')]+)["']?\)/g,           // CSS urls
      /(?:fetch|axios\.get)\(["']([^"']+)["']\)/g, // API calls
      /["']([^"']+\.(?:js|css|png|jpg|jpeg|gif|svg|webp|json|woff2?))["']/g // Common files
    ];
    
    const discoveredUrls = new Set();
    
    for (const pattern of resourcePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const url = resolveUrl(match[1], pageUrl);
        if (url.startsWith(self.location.origin) || 
            url.startsWith('http') && new URL(url).hostname === new URL(pageUrl).hostname) {
          discoveredUrls.add(url.split('#')[0].split('?')[0]); // Remove fragments and queries
        }
      }
    }
    
    logger.debug(`Discovered ${discoveredUrls.size} resources for ${pageUrl}`);
    return discoveredUrls;
  } catch (e) {
    logger.warn(`Resource discovery failed for ${pageUrl}:`, e);
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

async function cacheResource(url) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' }, // Bypass HTTP cache
      cache: 'reload' // Force network request
    });
    
    if (response.ok) {
      await cache.put(url, response.clone());
      logger.debug(`Cached: ${url}`);
      
      // Update localStorage for text resources
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.match(/^(text|application\/json)/)) {
        const text = await response.text();
        try {
          localStorage.setItem(url, text);
          logger.debug(`Updated localStorage for: ${url}`);
        } catch (e) {
          logger.warn(`localStorage quota exceeded for ${url}`);
        }
      }
      return true;
    }
  } catch (e) {
    logger.warn(`Cache update failed for ${url}:`, e);
  }
  return false;
}

async function cacheResources() {
  if (!isOnline) {
    logger.debug('Skipping cache update - offline');
    return;
  }
  
  logger.debug('Starting cache update cycle');
  const clients = await self.clients.matchAll();
  const currentUrl = clients[0]?.url || self.location.href;
  
  // Always include current page
  urlsToCache.add(currentUrl);
  
  // Discover new resources
  const discoveryPromises = Array.from(urlsToCache).map(url => 
    discoverResources(url).then(discovered => {
      discovered.forEach(u => urlsToCache.add(u));
    })
  );
  
  await Promise.all(discoveryPromises);
  logger.debug(`Total resources to cache: ${urlsToCache.size}`);
  
  // Cache all resources in parallel with rate limiting
  const BATCH_SIZE = 10;
  const allUrls = Array.from(urlsToCache);
  
  for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
    const batch = allUrls.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(cacheResource));
    logger.debug(`Processed batch ${i/BATCH_SIZE + 1}/${Math.ceil(allUrls.length/BATCH_SIZE)}`);
  }
  
  logger.debug('Cache update completed');
}

// Network status detection
function updateNetworkStatus() {
  const wasOnline = isOnline;
  isOnline = self.navigator?.onLine ?? true;
  
  if (isOnline && !wasOnline) {
    logger.log('Network status: Online');
    cacheResources();
  } else if (!isOnline && wasOnline) {
    logger.log('Network status: Offline');
  }
}

self.addEventListener('install', event => {
  logger.log('Installing service worker');
  event.waitUntil((async () => {
    await cacheResources();
    self.skipWaiting();
    logger.log('Installation complete');
  })());
});

self.addEventListener('activate', event => {
  logger.log('Activating service worker');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) {
          logger.debug(`Deleting old cache: ${key}`);
          return caches.delete(key);
        }
      })
    );
    self.clients.claim();
    updateNetworkStatus();
    logger.log('Activation complete');
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = request.url;
  
  // Skip non-GET requests and chrome-extension requests
  if (request.method !== 'GET' || url.startsWith('chrome-extension://')) {
    return;
  }
  
  logger.debug(`Fetch: ${url}`);
  
  event.respondWith((async () => {
    // Network-first strategy with aggressive caching
    if (isOnline) {
      try {
        const networkResponse = await fetch(request);
        
        // Cache the response
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, networkResponse.clone());
        logger.debug(`Updated cache from network: ${url}`);
        
        // Update localStorage for text resources
        const contentType = networkResponse.headers.get('Content-Type') || '';
        if (contentType.match(/^(text|application\/json)/)) {
          const text = await networkResponse.text();
          try {
            localStorage.setItem(url, text);
            logger.debug(`Updated localStorage from network: ${url}`);
          } catch (e) {
            logger.warn(`localStorage update failed for ${url}`);
          }
        }
        
        return networkResponse;
      } catch (e) {
        logger.warn(`Network request failed for ${url}:`, e);
        isOnline = false;
      }
    }
    
    // Offline fallback
    try {
      // Try cache first
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        logger.debug(`Serving from cache: ${url}`);
        return cachedResponse;
      }
      
      // Then try localStorage for text resources
      const cachedText = localStorage.getItem(url);
      if (cachedText) {
        logger.debug(`Serving from localStorage: ${url}`);
        return new Response(cachedText, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      
      // For HTML navigation requests, return a generic offline page
      if (request.mode === 'navigate') {
        logger.debug(`Returning offline page for: ${url}`);
        return new Response(
          `<h1>Offline</h1><p>You're offline. Cached content will be shown when available.</p>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }
    } catch (e) {
      logger.error(`Offline fallback failed for ${url}:`, e);
    }
    
    // Final fallback
    logger.warn(`No cached version available for ${url}`);
    return new Response('Offline - Content not available', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  })());
});

// Event listeners for network status
self.addEventListener('online', () => {
  logger.log('Online event received');
  updateNetworkStatus();
});

self.addEventListener('offline', () => {
  logger.log('Offline event received');
  updateNetworkStatus();
});

// Continuous updates when online
function startUpdateInterval() {
  setInterval(() => {
    if (isOnline) {
      logger.debug('Running periodic cache update');
      cacheResources();
    }
  }, UPDATE_INTERVAL);
}

// Initialize
self.addEventListener('message', event => {
  if (event.data === 'init') {
    logger.log('Initialization requested');
    updateNetworkStatus();
    startUpdateInterval();
  }
});

// Start the service worker
logger.log('Service worker starting');
updateNetworkStatus();
startUpdateInterval();
