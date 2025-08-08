(function(){
  const CACHE_NAME = 'auto-snap-cache-v1';
  const REFRESH_INTERVAL = 60000; // প্রতি মিনিটে আপডেট

  // রিসোর্স কালেক্ট
  function collectResources() {
    const urls = new Set([location.href.split(/[?#]/)[0]]);
    document.querySelectorAll(`
      link[href], script[src], img[src], source[src],
      video[src], audio[src], iframe[src], embed[src],
      object[data], link[rel*="icon"][href], link[rel="manifest"][href]
    `).forEach(el => {
      const url = el.href || el.src || el.data;
      if (url) {
        try { urls.add(new URL(url, location.href).href.split(/[?#]/)[0]); } catch{}
      }
    });
    return Array.from(urls);
  }

  // সার্ভিস ওয়ার্কার রেজিস্টার
  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoSnap] Service Worker সমর্থিত নয়');
      return;
    }

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
          caches.match(e.request).then(res => res || fetch(e.request).then(networkRes => {
            // অনলাইনে থাকলে নতুন রিসোর্স আপডেট
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, networkRes.clone()));
            return networkRes;
          }).catch(() => res))
        );
      });
    `;

    const blob = new Blob([swCode], {type: 'application/javascript'});
    navigator.serviceWorker.register(URL.createObjectURL(blob))
      .then(() => console.log('[AutoSnap] Service Worker রেজিস্টার হয়েছে'))
      .catch(err => console.error('[AutoSnap] SW রেজিস্টার ব্যর্থ:', err));
  }

  function init() {
    const resources = collectResources();
    console.log('[AutoSnap] Resources:', resources);
    registerServiceWorker(resources);

    // প্রতি মিনিটে আপডেট
    setInterval(() => {
      if (navigator.onLine) {
        const updatedResources = collectResources();
        registerServiceWorker(updatedResources);
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
