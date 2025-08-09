(function () {
  const SW_PATH = '/sw.js'; // GitHub Pages-এর রুটে রাখো
  const REFRESH_INTERVAL = 60000;

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

    navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      .then(() => {
        console.log('[AutoOffline] SW registered from', SW_PATH);
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'update-resources',
            resources
          });
        }
      })
      .catch(err => console.error('[AutoOffline] SW failed:', err));
  }

  function init() {
    const resources = collectResources();
    console.log('[AutoOffline] Initial resources:', resources);
    registerServiceWorker(resources);

    setInterval(() => {
      if (navigator.onLine && navigator.serviceWorker.controller) {
        console.log('[AutoOffline] Sending resource update...');
        navigator.serviceWorker.controller.postMessage({
          type: 'update-resources',
          resources: collectResources()
        });
      }
    }, REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
