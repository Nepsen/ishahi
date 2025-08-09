(function() {
  const CACHE_NAME = 'auto-snap-cache-v4';
  const REFRESH_INTERVAL = 60000; // 60 seconds

  // Enhanced resource collector that automatically detects TailwindCSS
  function collectResources() {
    const urls = new Set([
      // Cache current page and fallback
      location.href.split(/[?#]/)[0],
      new URL('/', location.href).href
    ]);

    // Find all resources in DOM
    const resourceElements = [
      ...document.querySelectorAll('link[href]'),
      ...document.querySelectorAll('script[src]'),
      ...document.querySelectorAll('img[src]'),
      ...document.querySelectorAll('source[src]'),
      ...document.querySelectorAll('video[src]'),
      ...document.querySelectorAll('audio[src]'),
      ...document.querySelectorAll('iframe[src]'),
      ...document.querySelectorAll('embed[src]'),
      ...document.querySelectorAll('object[data]')
    ];

    resourceElements.forEach(el => {
      const url = el.href || el.src || el.data;
      if (url && isValidUrl(url)) {
        try {
          const cleanUrl = new URL(url, location.href).href.split(/[?#]/)[0];
          urls.add(cleanUrl);
          
          // Automatically detect and cache TailwindCSS from any URL pattern
          if (cleanUrl.includes('tailwindcss.com')) {
            const tailwindUrl = new URL(cleanUrl);
            // Cache both the specific version and the base URL
            urls.add(`https://${tailwindUrl.hostname}`);
            urls.add(cleanUrl);
          }
        } catch(e) {
          console.warn('[AutoSnap] Invalid URL:', url);
        }
      }
    });

    return Array.from(urls);
  }

  function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Improved Service Worker with automatic TailwindCSS handling
  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) return;

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const CACHE_PATTERNS = ${JSON.stringify(['tailwindcss.com'])};

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => cache.addAll(${JSON.stringify(resources)}))
            .then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(keys => Promise.all(
            keys.map(key => key !== CACHE_NAME && caches.delete(key))
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        const request = event.request;
        if (request.method !== 'GET') return;

        // Special handling for TailwindCSS requests
        const isTailwind = CACHE_PATTERNS.some(pattern => 
          request.url.includes(pattern)
        );

        event.respondWith(
          caches.match(request).then(cached => {
            // For TailwindCSS, return cached version immediately while updating
            if (isTailwind && cached) {
              // Update cache in background
              fetch(request)
                .then(networkResponse => {
                  if (networkResponse.ok) {
                    caches.open(CACHE_NAME)
                      .then(cache => cache.put(request, networkResponse));
                  }
                })
                .catch(() => {});
              return cached;
            }
            
            // For other resources, try network first
            return fetch(request)
              .then(networkResponse => {
                // Cache successful responses
                if (networkResponse.ok) {
                  const clone = networkResponse.clone();
                  caches.open(CACHE_NAME)
                    .then(cache => cache.put(request, clone));
                }
                return networkResponse;
              })
              .catch(() => cached || caches.match('/'));
          })
        );
      });

      // Auto-update all cached resources periodically
      self.addEventListener('message', event => {
        if (event.data === 'update') {
          caches.open(CACHE_NAME).then(cache => {
            cache.keys().then(requests => {
              requests.forEach(request => {
                fetch(request)
                  .then(response => {
                    if (response.ok) cache.put(request, response);
                  })
                  .catch(() => {});
              });
            });
          });
        }
      });
    `;

    const blob = new Blob([swCode], {type: 'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(blob))
      .then(reg => {
        console.log('[AutoSnap] Service Worker registered');
        // Set up periodic updates
        setInterval(() => {
          reg.active && reg.active.postMessage('update');
        }, ${REFRESH_INTERVAL});
      })
      .catch(console.error);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const resources = collectResources();
    console.log('[AutoSnap] Caching resources:', resources);
    registerServiceWorker(resources);
  }
})();
