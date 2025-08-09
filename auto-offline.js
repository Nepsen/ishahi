 function() {
  const CACHE_NAME = 'neo-dot-cache-v1';
  const REFRESH_INTERVAL = 60000; // 60 seconds
  const OFFLINE_URL = '/offline.html'; // Optional fallback page

  // Get all resources needed for offline use
  function getResourcesToCache() {
    const resources = [
      // Current page
      window.location.href.split('?')[0].split('#')[0],
      
      // Main HTML page (your NeoDot app)
      'https://nepsen.github.io/NeoDot/dot.html',
      
      // TailwindCSS (automatically detected)
      ...Array.from(document.querySelectorAll('link[href], script[src]'))
        .map(el => el.href || el.src)
        .filter(url => url && url.includes('tailwindcss.com'))
    ];

    // Add other assets like CSS, JS, images
    const assets = Array.from(document.querySelectorAll(`
      link[rel="stylesheet"][href],
      script[src],
      img[src],
      link[rel="icon"][href]
    `)).map(el => el.href || el.src);

    return [...new Set([...resources, ...assets])].filter(Boolean);
  }

  // Register Service Worker
  function registerSW() {
    if (!navigator.serviceWorker) {
      console.warn('Service Worker not supported');
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('Service Worker registered');
        
        // Periodic updates
        setInterval(() => {
          if (navigator.onLine) reg.update();
        }, REFRESH_INTERVAL);
      })
      .catch(err => console.error('SW registration failed:', err));
  }

  // Create Service Worker file dynamically
  function createServiceWorker() {
    const resources = getResourcesToCache();
    console.log('Caching these resources:', resources);

    const swCode = `
      const CACHE_NAME = '${CACHE_NAME}';
      const RESOURCES = ${JSON.stringify(resources)};
      const OFFLINE_URL = '${OFFLINE_URL}';

      self.addEventListener('install', event => {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then(cache => cache.addAll(RESOURCES))
            .then(self.skipWaiting())
        );
      });

      self.addEventListener('activate', event => {
        event.waitUntil(
          caches.keys().then(keys => 
            Promise.all(
              keys.map(key => key !== CACHE_NAME && caches.delete(key))
            )
          ).then(() => self.clients.claim())
        );
      });

      self.addEventListener('fetch', event => {
        if (event.request.method !== 'GET') return;

        event.respondWith(
          caches.match(event.request)
            .then(cached => {
              // Return cached if found
              if (cached) return cached;
              
              // Otherwise fetch with network
              return fetch(event.request)
                .then(response => {
                  // Cache successful responses
                  if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME)
                      .then(cache => cache.put(event.request, clone));
                  }
                  return response;
                })
                .catch(() => {
                  // If offline and HTML page requested, return cached version
                  if (event.request.mode === 'navigate') {
                    return caches.match('https://nepsen.github.io/NeoDot/dot.html');
                  }
                  return caches.match(OFFLINE_URL); // Fallback offline page
                });
            })
        );
      });
    `;

    // Create a blob URL for the service worker
    const blob = new Blob([swCode], {type: 'application/javascript'});
    const swUrl = URL.createObjectURL(blob);
    
    // Override navigator.serviceWorker.register to use our blob URL
    const originalRegister = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function() {
      return originalRegister.apply(this, [swUrl, arguments[1]]);
    };
  }

  // Initialize
  function init() {
    createServiceWorker();
    registerSW();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
