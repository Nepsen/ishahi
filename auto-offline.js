(function(){
  const SNAPSHOT_KEY = 'autosnap:html';
  const RESOURCE_INDEX_KEY = 'autosnap:resources';
  const PREFIX = 'autosnap:res:'; // per-resource key
  const MAX_BYTES_ALERT = 4.5 * 1024 * 1024; // warn near ~4.5MB

  // Helper: is same-origin and HTTP(S)
  function isFetchable(url) {
    try {
      const u = new URL(url, location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === location.origin;
    } catch(e) { return false; }
  }

  // Find candidate resource URLs in the current document HTML
  function collectResourceUrls(docHtml) {
    const urls = new Set();

    // Elements to scan
    document.querySelectorAll('link[href], script[src], img[src], source[src], video[src], audio[src], iframe[src], embed[src], object[data]').forEach(el => {
      const url = el.href || el.src || el.dataset.src || el.data;
      if (url) try { urls.add(new URL(url, location.href).href); } catch(e){}
    });

    // Also extract url(...) from style tags and external CSS (best-effort)
    // Inline <style> tags:
    document.querySelectorAll('style').forEach(s => {
      const m = s.textContent.matchAll(/url\(["']?(.*?)["']?\)/g);
      for (const it of m) {
        try { urls.add(new URL(it[1], location.href).href); } catch(e){}
      }
    });

    // Try document.stylesheets (may be CORS-protected)
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        if (sheet.href) urls.add(sheet.href);
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule.cssText) {
            const matches = rule.cssText.matchAll(/url\(["']?(.*?)["']?\)/g);
            for (const mm of matches) {
              try { urls.add(new URL(mm[1], sheet.href || location.href).href); } catch(e){}
            }
          }
        });
      } catch(e) {
        // ignore CORS-protected stylesheets
      }
    });

    // Remove same-page hash/query variants (normalize)
    return Array.from(urls).map(u => u.split('#')[0]).map(u => u.split('?')[0]);
  }

  // Fetch a URL as data URL (base64). If fails, return null
  async function fetchAsDataURL(url) {
    try {
      const res = await fetch(url, {cache: 'no-store', mode: 'same-origin'});
      if (!res.ok) { console.warn('[AutoSnap] fetch failed', url, res.status); return null; }
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // data:... base64
        reader.onerror = () => reject(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('[AutoSnap] fetch error', url, e);
      return null;
    }
  }

  // Save full snapshot: inline resources into HTML and store separately for inspection
  async function saveSnapshot() {
    try {
      console.log('[AutoSnap] Starting snapshot...');
      const originalHtml = document.documentElement.outerHTML;
      const resourceUrls = collectResourceUrls(originalHtml).filter(isFetchable);

      // store list (for DevTools visibility)
      localStorage.setItem(RESOURCE_INDEX_KEY, JSON.stringify(resourceUrls));

      // Fetch and store resources one-by-one (so one failure won't block others)
      let totalBytes = 0;
      for (const url of resourceUrls) {
        try {
          const key = PREFIX + url;
          if (localStorage.getItem(key)) {
            // already saved
            console.log('[AutoSnap] already stored', url);
            continue;
          }
          console.log('[AutoSnap] fetching', url);
          const dataUrl = await fetchAsDataURL(url);
          if (!dataUrl) {
            console.warn('[AutoSnap] skip (failed):', url);
            continue;
          }
          // estimate bytes
          totalBytes += dataUrl.length;
          if (totalBytes > MAX_BYTES_ALERT) {
            console.warn('[AutoSnap] approaching storage limits (approx)', totalBytes);
          }
          localStorage.setItem(key, dataUrl);
          console.log('[AutoSnap] saved', url);
        } catch (e) {
          console.warn('[AutoSnap] resource store error', url, e);
        }
      }

      // Now replace occurrences of resource URLs in the HTML with data URLs where available
      let modifiedHtml = originalHtml;
      const savedList = JSON.parse(localStorage.getItem(RESOURCE_INDEX_KEY) || '[]');
      for (const url of savedList) {
        const key = PREFIX + url;
        const dataUrl = localStorage.getItem(key);
        if (dataUrl) {
          // replace exact matches — best-effort (href/src attributes)
          const esc = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const attrPattern = new RegExp(`(["'])${esc}(["'])`, 'g');
          modifiedHtml = modifiedHtml.replace(attrPattern, `$1${dataUrl}$2`);
          // also try unquoted occurrences (rare)
          modifiedHtml = modifiedHtml.split(url).join(dataUrl);
        }
      }

      // Save modified HTML snapshot
      localStorage.setItem(SNAPSHOT_KEY, modifiedHtml);
      console.log('[AutoSnap] Snapshot saved. Resources:', savedList.length);
      alert('AutoSnapshot: পেজ লোকালি সংরক্ষণ করা হয়েছে। এখন আপনি অফলাইনে লোড পরীক্ষা করতে পারবেন।');

    } catch (e) {
      console.error('[AutoSnap] Snapshot failed', e);
      alert('AutoSnapshot: স্ন্যাপশট করতে সমস্যা হয়েছে — কনসোল দেখুন।');
    }
  }

  // Restore snapshot (full HTML) when offline
  function restoreSnapshotIfOffline() {
    if (navigator.onLine) return; // only restore when offline
    const snap = localStorage.getItem(SNAPSHOT_KEY);
    if (!snap) {
      console.warn('[AutoSnap] No snapshot found in localStorage.');
      return;
    }
    console.log('[AutoSnap] Restoring snapshot from localStorage...');
    // Overwrite document with snapshot HTML
    document.open();
    document.write(snap);
    document.close();
  }

  // Initialize: if online show a small UI control to save; if offline try restore
  function init() {
    // If offline at load time, try restore immediately
    if (!navigator.onLine) {
      restoreSnapshotIfOffline();
      return;
    }

    // Create small floating control to trigger save
    const btn = document.createElement('button');
    btn.textContent = 'Save Page Offline';
    btn.title = 'Click to save this page and its resources to localStorage for offline viewing';
    Object.assign(btn.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      zIndex: '999999',
      padding: '8px 12px',
      background: '#0b79ff',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      boxShadow: '0 3px 8px rgba(0,0,0,0.2)',
      cursor: 'pointer',
      fontSize: '13px'
    });
    document.body.appendChild(btn);

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      await saveSnapshot();
      btn.textContent = 'Saved ✓';
      setTimeout(()=> { btn.textContent = 'Save Page Offline'; btn.disabled = false; }, 2500);
    });

    // Also listen to "online/offline" to auto-restore
    window.addEventListener('offline', () => {
      console.log('[AutoSnap] went offline — attempting restore');
      restoreSnapshotIfOffline();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
