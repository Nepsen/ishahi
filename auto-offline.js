// autooffline.js
(() => {
  const CACHE_NAME = 'autooffline-cache-v1';
  const REFRESH_INTERVAL = 60000; // 60 seconds

  // Collect all resources to cache dynamically from the page
  function collectResources() {
    const urls = new Set([location.href.split(/[?#]/)[0]]); // page itself

    document.querySelectorAll(`
      link[href], script[src], img[src], source[src],
      video[src], audio[src], iframe[src], embed[src],
      object[data], link[rel*="icon"][href], link[rel="manifest"][href]
    `).forEach(el => {
      let url = el.href || el.src || el.data;
      if (url) {
        try {
          url = new URL(url, location.href).href.split(/[?#]/)[0];
          urls.add(url);
        } catch(e) {}
      }
    });

    console.log('[AutoOffline] Resources to cache:', Array.from(urls));
    return Array.from(urls);
  }

  // Register Service Worker from inline script blob
  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoOffline] Service Worker not supported');
      return;
    }

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const RESOURCES = ${JSON.stringify(resources)};

      self.addEventListener('install', e => {
        console.log('[SW] Installing and caching resources...');
        e.waitUntil(
          caches.open(CACHE_NAME).then(cache => cache.addAll(RESOURCES)).then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', e => {
        console.log('[SW] Activating and cleaning old caches...');
        e.waitUntil(
          caches.keys().then(keys =>
            Promise.all(keys.map(key => {
              if (key !== CACHE_NAME) {
                console.log('[SW] Deleting old cache:', key);
                return caches.delete(key);
              }
            }))
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', e => {
        e.respondWith(
          caches.match(e.request).then(cachedResponse => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache:', e.request.url);
              return cachedResponse;
            }
            return fetch(e.request).then(networkResponse => {
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              caches.open(CACHE_NAME).then(cache => {
                cache.put(e.request, networkResponse.clone());
                console.log('[SW] Cached new resource:', e.request.url);
              });
              return networkResponse;
            }).catch(() => {
              console.log('[SW] Fetch failed, offline or resource missing:', e.request.url);
              return cachedResponse;
            });
          })
        );
      });
    `;

    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);

    navigator.serviceWorker.register(swUrl).then(() => {
      console.log('[AutoOffline] Service Worker registered');
    }).catch(err => {
      console.error('[AutoOffline] SW registration failed:', err);
    });
  }

  function init() {
    if (!navigator.serviceWorker) {
      console.warn('[AutoOffline] Service Worker not supported');
      return;
    }

    let resources = collectResources();
    registerServiceWorker(resources);

    setInterval(() => {
      if (navigator.onLine) {
        console.log('[AutoOffline] Refreshing cache...');
        resources = collectResources();
        registerServiceWorker(resources);
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
