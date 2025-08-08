
(function(){
  const RESOURCE_INDEX_KEY = 'autosnap:resources';
  const PREFIX = 'autosnap:res:';
  const HTML_KEY = 'autosnap:html';

  function isFetchable(url) {
    try {
      const u = new URL(url, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === location.origin;
    } catch { return false; }
  }

  function collectResourceUrls() {
    const urls = new Set();
    // বর্তমান HTML পেজও সেভ করব
    urls.add(window.location.href.split(/[#?]/)[0]);

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
      if (!res.ok) {
        console.warn(`[AutoSnap] Failed: ${url} (${res.status})`);
        return null;
      }
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
    console.clear();
    console.log('[AutoSnap] Scanning resources...');
    const resourceUrls = collectResourceUrls();
    localStorage.setItem(RESOURCE_INDEX_KEY, JSON.stringify(resourceUrls));

    // HTML কনটেন্টও সেভ
    localStorage.setItem(HTML_KEY, document.documentElement.outerHTML);

    for (const url of resourceUrls) {
      if (url === window.location.href.split(/[#?]/)[0]) continue; // HTML skip
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
    console.clear();
    console.log('[AutoSnap] Offline mode: Loading from localStorage...');

    // HTML কনটেন্ট লোড
    const savedHTML = localStorage.getItem(HTML_KEY);
    if (savedHTML) {
      document.open();
      document.write(savedHTML);
      document.close();
      console.log('[AutoSnap] HTML loaded from local storage');
    }

    const resourceUrls = JSON.parse(localStorage.getItem(RESOURCE_INDEX_KEY) || '[]');
    resourceUrls.forEach(url => {
      const key = PREFIX + url;
      const dataUrl = localStorage.getItem(key);
      if (dataUrl) {
        console.log(`[AutoSnap] Loaded: ${url}`);
      }
    });
  }

  function init() {
    if (navigator.onLine) {
      saveAllResources();
    } else {
      loadFromLocal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
