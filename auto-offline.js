
(function() {
  const CACHE_VERSION = 'v1';
  const CACHE_NAME = 'autocache-' + CACHE_VERSION;

  const excludePatterns = [
    /^data:/,
    /^blob:/,
    /\/api\//i,
    /\/admin\//i,
    /service-worker\.js$/i,
    /sw\.js$/i,
  ];

  function isExcludedUrl(url) {
    return excludePatterns.some(pattern => pattern.test(url));
  }

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

  // Discover URLs on page
  function discoverResources() {
    const resources = new Set();

    resources.add(window.location.href.split(/[#?]/)[0]);

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
          resources.add(new URL(url, window.location.href).href);
        } catch {}
      }
    });

    // CSS resources (background images, fonts)
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        if (sheet.href && isValidUrl(sheet.href)) resources.add(sheet.href);

        Array.from(sheet.cssRules || []).forEach(rule => {
          if (!rule.style) return;

          const bg = rule.style.backgroundImage;
          if (bg && bg.includes('url(')) {
            const matches = bg.match(/url\(["']?(.*?)["']?\)/g);
            if (matches) {
              matches.forEach(u => {
                const url = u.replace(/url\(["']?/, '').replace(/["']?\)/, '');
                if (isValidUrl(url)) {
                  try {
                    resources.add(new URL(url, sheet.href || window.location.href).href);
                  } catch {}
                }
              });
            }
          }

          if (rule.cssText.includes('@font-face')) {
            const src = rule.style.getPropertyValue('src');
            if (src) {
              const matches = src.match(/url\(["']?(.*?)["']?\)/g);
              if (matches) {
                matches.forEach(u => {
                  const url = u.replace(/url\(["']?/, '').replace(/["']?\)/, '');
                  if (isValidUrl(url)) {
                    try {
                      resources.add(new URL(url, sheet.href || window.location.href).href);
                    } catch {}
                  }
                });
              }
            }
          }
        });
      } catch {}
    });

    return Array.from(resources);
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoCache] Service Worker not supported');
      return;
    }

    const resourcesToCache = discoverResources();

    // Compose service worker code dynamically:
    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const PRECACHE_URLS = ${JSON.stringify(resourcesToCache)};

      self.addEventListener('install', event => {
        console.log('[AutoCache SW] Install event');
        event.waitUntil(
          caches.open(CACHE_NAME).then(cache => 
            Promise.all(
              PRECACHE_URLS.map(url => 
                cache.add(url).catch(err => {
                  console.warn('[AutoCache SW] Failed to cache:', url, err);
                })
              )
            )
          ).then(() => self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        console.log('[AutoCache SW] Activate event');
        event.waitUntil(
          caches.keys().then(keys => 
            Promise.all(
              keys.map(key => {
                if (key !== CACHE_NAME && key.startsWith('autocache-')) {
                  console.log('[AutoCache SW] Deleting old cache:', key);
                  return caches.delete(key);
                }
                return null;
              })
            )
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        if (event.request.method !== 'GET') return;

        event.respondWith(
          caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
              return networkResponse;
            }).catch(() => {
              // Optionally return fallback page/image here
              return new Response('Offline and resource not cached.', { status: 503, statusText: 'Service Unavailable' });
            });
          })
        );
      });
    `;

    const blob = new Blob([swCode], { type: 'application/javascript' });
    const swUrl = URL.createObjectURL(blob);

    try {
      const registration = await navigator.serviceWorker.register(swUrl);
      console.log('[AutoCache] Service Worker registered with scope:', registration.scope);
    } catch (e) {
      console.error('[AutoCache] SW registration failed:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
    });
  } else {
    registerServiceWorker();
  }
})();
