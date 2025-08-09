(function(){
  const REFRESH_INTERVAL = 60000; // 60 সেকেন্ড
  const SW_PATH = 'https://nepsen.github.io/ishahi/sw.js'; // GitHub Pages-এ sw.js এর URL

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
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoOffline] ❌ Service Worker not supported');
      return;
    }

    navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      .then(reg => {
        console.log('[AutoOffline] ✅ SW registered:', SW_PATH);
        if (reg.active) {
          reg.active.postMessage({ type: 'CACHE_RESOURCES', resources });
          console.log('[AutoOffline] 📦 Sent resources list to SW:', resources);
        } else {
          console.warn('[AutoOffline] ⚠️ SW not active yet, retrying in 2s...');
          setTimeout(() => {
            reg.active?.postMessage({ type: 'CACHE_RESOURCES', resources });
          }, 2000);
        }
      })
      .catch(err => console.error('[AutoOffline] ❌ SW registration failed:', err));
  }

  function init() {
    const resources = collectResources();
    console.log('[AutoOffline] 🌐 Initial resources to cache:', resources);
    registerServiceWorker(resources);

    setInterval(() => {
      if (navigator.onLine) {
        const updatedResources = collectResources();
        console.log('[AutoOffline] 🔄 Refreshing cache with updated resources:', updatedResources);
        registerServiceWorker(updatedResources);
      } else {
        console.log('[AutoOffline] 📴 Offline — skipping refresh');
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
