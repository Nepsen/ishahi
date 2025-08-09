
(function () {
  const CACHE_NAME = 'auto-snap-cache-v2';
  const REFRESH_INTERVAL = 60000; // 60 sec

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

      self.addEventListener('install', e => {
        e.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => cache.addAll(RESOURCES))
            .then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', e => {
        e.waitUntil(
          caches.keys().then(keys =>
            Promise.all(keys.map(key => key !== CACHE_NAME && caches.delete(key)))
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', e => {
        e.respondWith(
          caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(networkRes => {
              if (networkRes && networkRes.status === 200 && e.request.method === 'GET') {
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
              }
              return networkRes;
            });
          }).catch(() => caches.match(RESOURCES[0])) // offline fallback to main page
        );
      });

      // Background update every fetch
      self.addEventListener('message', e => {
        if (e.data === 'update-cache') {
          fetchAllAndUpdate();
        }
      });

      function fetchAllAndUpdate() {
        caches.open(CACHE_NAME).then(cache => {
          RESOURCES.forEach(url => {
            fetch(url).then(res => {
              if (res.ok) cache.put(url, res.clone());
            }).catch(() => {});
          });
        });
      }
    `;

    const blob = new Blob([swCode], { type: 'application/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob))
      .then(() => console.log('[AutoSnap] SW registered'))
      .catch(err => console.error('[AutoSnap] SW failed:', err));
  }

  function init() {
    const resources = collectResources();
    registerServiceWorker(resources);

    // Tell SW to refresh cache every 60s if online
    setInterval(() => {
      if (navigator.onLine && navigator.serviceWorker.controller) {
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
