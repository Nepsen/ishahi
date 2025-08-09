// offline-manager.js - Single File Offline Solution
(function() {
  console.log('[Offline Manager] Initializing...');
  
  const CACHE_NAME = 'offline-cache-v1';
  const OFFLINE_URL = 'offline-fallback.html';
  let isOnline = navigator.onLine;
  
  // Listen for online/offline status changes
  window.addEventListener('online', () => {
    isOnline = true;
    console.log('[Offline Manager] Connection restored');
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    console.log('[Offline Manager] Connection lost');
    showOfflineWarning();
  });

  // Show offline warning banner
  function showOfflineWarning() {
    const warning = document.createElement('div');
    warning.style = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 10px 20px;
      background: #ff9800;
      color: white;
      border-radius: 5px;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    warning.textContent = 'You are currently offline. Some features may not work.';
    document.body.appendChild(warning);
    
    setTimeout(() => {
      document.body.removeChild(warning);
    }, 5000);
  }

  // Cache all critical resources
  async function cacheResources() {
    if (!('caches' in window)) {
      console.warn('[Offline Manager] Cache API not supported');
      return;
    }

    try {
      const cache = await caches.open(CACHE_NAME);
      const currentPage = window.location.href.split('#')[0].split('?')[0];
      
      // Get all resources from the page
      const resources = [currentPage];
      document.querySelectorAll(`
        link[rel=stylesheet][href],
        script[src],
        img[src],
        video[src],
        audio[src],
        source[src],
        iframe[src],
        embed[src],
        object[data],
        link[rel=icon][href],
        link[rel=manifest][href]
      `).forEach(el => {
        const url = el.href || el.src || el.data;
        if (url) resources.push(new URL(url, location.href).href);
      });

      // Add to cache
      await cache.addAll([...new Set(resources)]);
      console.log('[Offline Manager] Resources cached:', resources);
      
      // Create offline fallback
      const fallbackHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Offline Mode</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>You're Offline</h1>
          <p>This page has been cached for offline viewing.</p>
          <p>Some dynamic content may not be available.</p>
          <button onclick="location.reload()">Try Again</button>
        </body>
        </html>
      `;
      
      await cache.put(
        new Request(OFFLINE_URL),
        new Response(fallbackHTML, {
          headers: { 'Content-Type': 'text/html' }
        })
      );
      
    } catch (err) {
      console.error('[Offline Manager] Caching failed:', err);
    }
  }

  // Intercept fetch requests
  async function handleFetch(request) {
    try {
      if (!isOnline) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) {
          console.log('[Offline Manager] Serving from cache:', request.url);
          return cached;
        }
        // Return offline page for document requests
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      }
      // Try network request
      const response = await fetch(request);
      
      // Cache successful responses
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      
      return response;
      
    } catch (err) {
      console.log('[Offline Manager] Network error, serving from cache:', request.url);
      const cache = await caches.open(CACHE_NAME);
      return cache.match(request) || caches.match(OFFLINE_URL);
    }
  }

  // Initialize everything
  async function init() {
    console.log('[Offline Manager] Starting initialization...');
    
    // Cache resources immediately
    await cacheResources();
    
    // Set up fetch interception
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register(
          URL.createObjectURL(new Blob([
            `self.addEventListener('fetch', (e) => {
              e.respondWith(
                caches.match(e.request).then((r) => {
                  return r || fetch(e.request).then((response) => {
                    return caches.open('${CACHE_NAME}').then((cache) => {
                      cache.put(e.request, response.clone());
                      return response;
                    });
                  });
                })
              );
            });`
          ], { type: 'application/javascript' }))
        );
        console.log('[Offline Manager] Service Worker registered');
      } catch (err) {
        console.warn('[Offline Manager] Service Worker registration failed:', err);
      }
    }
    
    // Override fetch for pages without Service Worker support
    if (!('serviceWorker' in navigator)) {
      console.log('[Offline Manager] Using fetch override instead of Service Worker');
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        return handleFetch(new Request(...args));
      };
    }
    
    // Show status
    if (!isOnline) {
      showOfflineWarning();
      console.log('[Offline Manager] Currently offline - serving cached content');
    } else {
      console.log('[Offline Manager] Currently online - caching resources');
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
