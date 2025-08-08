
(function() {
  // Configuration
  const CACHE_VERSION = 'v1';
  const CACHE_PREFIX = 'autocache-';
  const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
  const CACHE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24h

  // Store discovered resources
  let discoveredResources = new Set();

  // List of URL patterns to exclude from caching (API, admin, SW scripts)
  const excludePatterns = [
    /^data:/,
    /^blob:/,
    /\/api\//i,
    /\/admin\//i,
    /service-worker\.js$/i,
    /sw\.js$/i,
  ];

  // Check if a URL should be excluded from caching
  function isExcludedUrl(url) {
    return excludePatterns.some(pattern => pattern.test(url));
  }

  // Validate URLs for caching (exclude data:, blob:, api calls, etc)
  function isValidUrl(url) {
    try {
      const u = new URL(url);
      if (!u.protocol.startsWith('http')) return false;
      if (isExcludedUrl(url)) return false;
      return true;
    } catch {
      return false;
    }
  }

  // Discover all page resources, including CSS urls
  function discoverResources() {
    discoveredResources.clear();

    // Add current page URL (without query/hash)
    discoveredResources.add(window.location.href.split(/[#?]/)[0]);

    // Elements with URLs
    const selectors = [
      'link[rel="stylesheet"][href]',
      'script[src]',
      'img[src]',
      'source[src]',
      'video[src]',
      'audio[src]',
      'iframe[src]',
      'embed[src]',
      'object[data]',
      'link[rel*="icon"][href]',
      'link[rel="manifest"][href]',
      'link[rel="preload"][href]',
      'link[rel="prefetch"][href]'
    ].join(',');

    document.querySelectorAll(selectors).forEach(el => {
      const url = el.href || el.src || el.dataset.src || el.data;
      if (url && isValidUrl(url)) {
        try {
          discoveredResources.add(new URL(url, window.location.href).href);
        } catch {}
      }
    });

    // Extract URLs from CSS (background images, fonts)
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        if (sheet.href && isValidUrl(sheet.href)) {
          discoveredResources.add(sheet.href);
        }
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (!rule.style) return;

          // background-image URLs
          const bg = rule.style.backgroundImage;
          if (bg && bg.includes('url(')) {
            const urls = bg.match(/url\(["']?(.*?)["']?\)/g);
            if (urls) {
              urls.forEach(u => {
                const url = u.replace(/url\(["']?/, '').replace(/["']?\)/, '');
                if (isValidUrl(url)) {
                  try {
                    discoveredResources.add(new URL(url, sheet.href || window.location.href).href);
                  } catch {}
                }
              });
            }
          }

          // font-face src URLs
          if (rule.cssText && rule.cssText.includes('@font-face')) {
            const src = rule.style.getPropertyValue('src');
            if (src && src.includes('url(')) {
              const fontUrls = src.match(/url\(["']?(.*?)["']?\)/g);
              if (fontUrls) {
                fontUrls.forEach(u => {
                  const url = u.replace(/url\(["']?/, '').replace(/["']?\)/, '');
                  if (isValidUrl(url)) {
                    try {
                      discoveredResources.add(new URL(url, sheet.href || window.location.href).href);
                    } catch {}
                  }
                });
              }
            }
          }
        });
      } catch (e) {
        // CORS restrictions, ignore
      }
    });

    console.log('[AutoCache] Discovered resources:', Array.from(discoveredResources));
  }

  // Install or update service worker with discovered resources
  async function installServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoCache] Service Worker not supported');
      return;
    }

    const resourcesArray = Array.from(discoveredResources);

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const RESOURCES = ${JSON.stringify(resourcesArray)};

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache =>
            cache.addAll(RESOURCES).catch(err => {
              console.error('[AutoCache SW] Cache addAll failed:', err);
              return Promise.all(
                RESOURCES.map(r => cache.add(r).catch(e => console.warn('[AutoCache SW] Failed:', r, e)))
              );
            })
          ).then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(keys =>
            Promise.all(keys.map(key => {
              if (key.startsWith('${CACHE_PREFIX}') && key !== CACHE_NAME) {
                console.log('[AutoCache SW] Deleting old cache:', key);
                return caches.delete(key);
              }
              return null;
            }))
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        event.respondWith(
          caches.match(event.request).then(response => response || fetch(event.request))
        );
      });
    `;

    const prevBlobUrl = localStorage.getItem('autocache-sw-blob-url');
    let blobUrl = prevBlobUrl;

    if (!blobUrl || localStorage.getItem('autocache-cache-version') !== CACHE_VERSION) {
      const blob = new Blob([swCode], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      localStorage.setItem('autocache-sw-blob-url', blobUrl);
      localStorage.setItem('autocache-cache-version', CACHE_VERSION);
      console.log('[AutoCache] Created new SW blob URL');
    }

    try {
      const reg = await navigator.serviceWorker.register(blobUrl);
      console.log('[AutoCache] Service Worker registered with scope:', reg.scope);
    } catch (err) {
      console.error('[AutoCache] SW registration failed:', err);
    }
  }

  // Initialize cache system
  function init() {
    discoverResources();
    installServiceWorker();

    setInterval(() => {
      console.log('[AutoCache] Refreshing cache...');
      discoverResources();
      installServiceWorker();
    }, CACHE_REFRESH_INTERVAL);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
