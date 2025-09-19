const CACHE_NAME = 'permanent-offline-v1';
const UPDATE_INTERVAL = 30000; // 30 seconds updates when online
const urlsToCache = new Set();
let isOnline = true;

// Enhanced logger with colors and timestamps
const logger = {
  log: (...args) => {
    const message = `[SW] ${new Date().toISOString()} ${args.join(' ')}`;
    console.log('%c[SW]', 'color: #4CAF50;', new Date().toISOString(), ...args);
    sendMessageToClients({ type: 'LOG', message });
  },
  warn: (...args) => console.warn('%c[SW]', 'color: #FFC107;', new Date().toISOString(), ...args),
  error: (...args) => console.error('%c[SW]', 'color: #F44336;', new Date().toISOString(), ...args),
  debug: (...args) => console.debug('%c[SW]', 'color: #2196F3;', new Date().toISOString(), ...args)
};

// Send message to all clients
function sendMessageToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

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
        // Cache all resources, not just same-origin
        discoveredUrls.add(url.split('#')[0].split('?')[0]); // Remove fragments and queries
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
    // Check if we already have this resource cached
    const db = await openIndexedDB();
    const tx = db.transaction(['resources'], 'readonly');
    const store = tx.objectStore('resources');
    const stored = await store.get(url);
    
    // Check if we need to update it
    const headers = new Headers();
    if (stored && stored.headers && stored.headers.etag) {
      headers.set('If-None-Match', stored.headers.etag);
    }
    
    const response = await fetch(url, {
      headers: headers.size > 0 ? headers : undefined,
      cache: 'no-cache'
    });
    
    if (response.status === 304) {
      logger.debug(`Resource not modified: ${url}`);
      return true; // Still valid
    }
    
    if (response.ok) {
      // Update IndexedDB for persistence
      await updateIndexedDB(url, response);
      logger.debug(`Cached resource: ${url}`);
      return true;
    }
  } catch (e) {
    logger.warn(`Cache update failed for ${url}:`, e);
  }
  return false;
}

// Use IndexedDB for permanent storage
async function updateIndexedDB(url, response) {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(['resources'], 'readwrite');
    const store = tx.objectStore('resources');
    
    const blob = await response.blob();
    const headers = {};
    
    // Store important headers
    if (response.headers.get('etag')) {
      headers.etag = response.headers.get('etag');
    }
    if (response.headers.get('last-modified')) {
      headers.lastModified = response.headers.get('last-modified');
    }
    if (response.headers.get('content-type')) {
      headers.contentType = response.headers.get('content-type');
    }
    
    await store.put({
      url: url,
      data: blob,
      timestamp: Date.now(),
      headers: headers,
      size: blob.size
    });
    
    logger.debug(`Stored in IndexedDB: ${url}`);
  } catch (e) {
    logger.warn(`IndexedDB storage failed for ${url}:`, e);
  }
}

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PermanentOfflineDB', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('resources')) {
        const store = db.createObjectStore('resources', { keyPath: 'url' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      
      // Add size field if it doesn't exist (for v2)
      if (event.oldVersion < 2) {
        const store = event.currentTarget.transaction.objectStore('resources');
        if (!store.indexNames.contains('size')) {
          store.createIndex('size', 'size', { unique: false });
        }
      }
    };
  });
}

async function getCachedResources() {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction(['resources'], 'readonly');
    const store = tx.objectStore('resources');
    const allResources = await store.getAll();
    
    return allResources.map(resource => ({
      url: resource.url,
      type: resource.headers.contentType || 'unknown',
      size: resource.size || 0
    }));
  } catch (e) {
    logger.error('Error getting cached resources:', e);
    return [];
  }
}

async function getStorageUsage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const percent = (estimate.usage / estimate.quota * 100);
      
      return {
        used: estimate.usage,
        quota: estimate.quota,
        percent: percent
      };
    }
  } catch (e) {
    logger.error('Error getting storage estimate:', e);
  }
  
  return {
    used: 0,
    quota: 0,
    percent: 0
  };
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
  const BATCH_SIZE = 5;
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
    await openIndexedDB(); // Initialize IndexedDB
    await cacheResources();
    self.skipWaiting();
    logger.log('Installation complete');
  })());
});

self.addEventListener('activate', event => {
  logger.log('Activating service worker');
  event.waitUntil((async () => {
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
        
        // Update IndexedDB for persistence
        await updateIndexedDB(url, networkResponse.clone());
        logger.debug(`Updated cache from network: ${url}`);
        
        return networkResponse;
      } catch (e) {
        logger.warn(`Network request failed for ${url}:`, e);
        isOnline = false;
      }
    }
    
    // Offline fallback - try IndexedDB
    try {
      const db = await openIndexedDB();
      const tx = db.transaction(['resources'], 'readonly');
      const store = tx.objectStore('resources');
      const stored = await store.get(url);
      
      if (stored) {
        logger.debug(`Serving from IndexedDB: ${url}`);
        return new Response(stored.data, {
          headers: new Headers({
            'Content-Type': stored.headers.contentType || 'text/plain'
          })
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

// Handle messages from clients
self.addEventListener('message', event => {
  const data = event.data;
  
  if (data.type === 'SET_ONLINE_STATUS') {
    isOnline = data.online;
    logger.log(`Manual online status change: ${isOnline ? 'online' : 'offline'}`);
  } else if (data.type === 'UPDATE_RESOURCES') {
    logger.log('Manual cache update requested');
    cacheResources();
  } else if (data.type === 'CLEAR_CACHE') {
    logger.log('Clearing cache requested');
    clearCache();
  } else if (data.type === 'GET_CACHED_RESOURCES') {
    getCachedResources().then(resources => {
      event.ports[0].postMessage({
        type: 'CACHED_RESOURCES',
        resources: resources
      });
    });
  } else if (data.type === 'GET_STORAGE_USAGE') {
    getStorageUsage().then(usage => {
      event.ports[0].postMessage({
        type: 'STORAGE_USAGE',
        usage: usage
      });
    });
  } else if (data.type === 'CACHE_PAGE') {
    logger.log(`Caching page: ${data.url}`);
    urlsToCache.add(data.url);
    cacheResources();
  }
});

async function clearCache() {
  try {
    // Clear IndexedDB
    const db = await openIndexedDB();
    const tx = db.transaction(['resources'], 'readwrite');
    const store = tx.objectStore('resources');
    await store.clear();
    
    // Clear in-memory Set
    urlsToCache.clear();
    
    logger.log('Cache cleared successfully');
  } catch (e) {
    logger.error('Error clearing cache:', e);
  }
}

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
logger.log('Service worker starting');
updateNetworkStatus();
startUpdateInterval();
