(function(){
  const RESOURCE_INDEX_KEY = 'autosnap:resources';
  const PREFIX = 'autosnap:res:';
  const REFRESH_INTERVAL = 60000; // 1 মিনিট

  function isFetchable(url) {
    try {
      const u = new URL(url, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === location.origin;
    } catch { return false; }
  }

  function collectResourceUrls() {
    const urls = new Set();
    document.querySelectorAll(`
      link[href], script[src], img[src], source[src], video[src], audio[src],
      iframe[src], embed[src], object[data], link[rel*="icon"][href], link[rel="manifest"][href]
    `).forEach(el => {
      const url = el.href || el.src || el.data;
      if (url) try { urls.add(new URL(url, location.href).href.split(/[?#]/)[0]); } catch{}
    });
    return Array.from(urls).filter(isFetchable);
  }

  async function fetchAsDataURL(url) {
    try {
      console.log(`[AutoSnap] Downloading: ${url}`);
      const res = await fetch(url, {cache: 'no-store', mode: 'same-origin'});
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn(`[AutoSnap] Error downloading ${url}`, e);
      return null;
    }
  }

  async function saveAllResources() {
    console.log('[AutoSnap] Scanning resources...');
    const resourceUrls = collectResourceUrls();
    localStorage.setItem(RESOURCE_INDEX_KEY, JSON.stringify(resourceUrls));

    for (const url of resourceUrls) {
      const key = PREFIX + url;
      const dataUrl = await fetchAsDataURL(url);
      if (dataUrl) {
        localStorage.setItem(key, dataUrl);
        console.log(`[AutoSnap] Saved: ${url}`);
      }
    }
    console.log('[AutoSnap] Snapshot saved!');
  }

  function loadFromLocal() {
    console.log('[AutoSnap] Offline mode: Loading cached resources...');
    const resourceUrls = JSON.parse(localStorage.getItem(RESOURCE_INDEX_KEY) || '[]');

    resourceUrls.forEach(url => {
      const dataUrl = localStorage.getItem(PREFIX + url);
      if (!dataUrl) return;

      document.querySelectorAll(`[src="${url}"], [href="${url}"]`).forEach(el => {
        if (el.src) el.src = dataUrl;
        if (el.href) el.href = dataUrl;
      });
      console.log(`[AutoSnap] Loaded cached: ${url}`);
    });
  }

  function init() {
    if (navigator.onLine) {
      saveAllResources();
      setInterval(() => {
        if (navigator.onLine) saveAllResources();
      }, REFRESH_INTERVAL);
    } else {
      loadFromLocal(); // শুধু রিসোর্স লোড, পেজ রিলোড না
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
