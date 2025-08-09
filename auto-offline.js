(function () {
  const CACHE_NAME = 'site-offline-cache-v1';
  const REFRESH_INTERVAL = 60000; // 60 সেকেন্ড

  function collectResources() {
    const urls = new Set([location.href.split(/[?#]/)[0]]);
    document.querySelectorAll(`
      link[href], script[src], img[src], source[src],
      video[src], audio[src], iframe[src], embed[src],
      object[data], link[rel*="icon"][href], link[rel="manifest"][href]
    `).forEach(el => {
      const url = el.href || el.src || el.data;
      if (url) {
        try {
          urls.add(new URL(url, location.href).href.split(/[?#]/)[0]);
        } catch {}
      }
    });
    return Array.from(urls);
  }

  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) return;

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const RESOURCES = ${JSON.stringify(resources)};

      async function cacheAll() {
        const cache = await caches.open(CACHE_NAME);
        for (const url of RESOURCES) {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (res.ok) {
              await cache.put(url, res.clone());
              console.log('[SW] Cached:', url);
            }
          } catch (err) {
            console.warn('[SW] Failed to cache:', url, err);
          }
        }
      }

      self.addEventListener('install', e => {
        console.log('[SW] Installing...');
        e.waitUntil(cacheAll().then(() => self.skipWaiting()));
      });

      self.addEventListener('activate', e => {
        console.log('[SW] Activating...');
        e.waitUntil(
          caches.keys().then(keys =>
            Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', e => {
        e.respondWith(
          caches.match(e.request).then(cached => {
            if (cached) {
              console.log('[SW] Serving from cache:', e.request.url);
              return cached;
            }
            return fetch(e.request).then(networkRes => {
              if (networkRes.ok && e.request.method === 'GET') {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(e.request, networkRes.clone());
                  console.log('[SW] Fetched & cached:', e.request.url);
                });
              }
              return networkRes;
            }).catch(() => caches.match(RESOURCES[0])); // main page fallback
          })
        );
      });

      self.addEventListener('message', e => {
        if (e.data === 'update-cache') {
          console.log('[SW] Updating cache...');
          cacheAll();
        }
      });
    `;

    const blob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob), { scope: '/' })
      .then(() => console.log('[AutoOffline] SW registered for entire site'))
      .catch(err => console.error('[AutoOffline] SW failed:', err));
  }

  function init() {
    const resources = collectResources();
    console.log('[AutoOffline] Initial resources:', resources);
    registerServiceWorker(resources);

    setInterval(() => {
      if (navigator.onLine && navigator.serviceWorker.controller) {
        console.log('[AutoOffline] Sending update request...');
        navigator.serviceWorker.controller.postMessage('update-cache');
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
