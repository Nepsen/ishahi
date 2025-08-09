(function() {
  const CACHE_NAME = 'auto-snap-cache-v3';
  const REFRESH_INTERVAL = 60000; // 60 seconds
  const MAX_CACHE_AGE = 86400000; // 24 hours in ms

  // Auto-detect and cache all external resources
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
          
          // Special handling for tailwindcss
          if (cleanUrl.includes('cdn.tailwindcss.com')) {
            urls.add('https://cdn.tailwindcss.com');
            urls.add('https://cdn.tailwindcss.com/3.4.1'); // Common version
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

  // Register Service Worker with enhanced caching
  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) return;

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const MAX_AGE = ${MAX_CACHE_AGE};

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => {
              return cache.addAll(${JSON.stringify(resources)})
                .catch(err => {
                  console.log('[AutoSnap] Cache addAll error:', err);
                });
            })
            .then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(keys => Promise.all(
            keys.map(key => {
              if (key !== CACHE_NAME) {
                console.log('[AutoSnap] Removing old cache:', key);
                return caches.delete(key);
              }
            })
          )).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        if (event.request.method !== 'GET') return;

        // Network-first with cache fallback strategy
        event.respondWith(
          fetch(event.request)
            .then(networkResponse => {
              // Cache successful responses
              if (networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, clone));
              }
              return networkResponse;
            })
            .catch(() => {
              // Offline fallback to cache
              return caches.match(event.request)
                .then(cached => cached || caches.match('/'));
            })
        );
      });

      // Auto-update cache in background
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
        // Send update message every REFRESH_INTERVAL
        setInterval(() => {
          reg.active && reg.active.postMessage('update');
        }, ${REFRESH_INTERVAL});
      })
      .catch(err => console.error('[AutoSnap] SW registration failed:', err));
  }

  // Initialize
  function init() {
    const resources = collectResources();
    console.log('[AutoSnap] Caching resources:', resources);
    registerServiceWorker(resources);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
