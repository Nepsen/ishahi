const CACHE_NAME = 'offline-mirror-auto-v1';
const UPDATE_INTERVAL = 10000; // প্রতি 10 সেকেন্ডে আপডেট
let isOnline = true;

// লগার
const logger = {
  log: (...a) => console.log('%c[SW]', 'color: #4CAF50;', new Date().toISOString(), ...a),
  warn: (...a) => console.warn('%c[SW]', 'color: #FFC107;', new Date().toISOString(), ...a),
  error: (...a) => console.error('%c[SW]', 'color: #F44336;', new Date().toISOString(), ...a),
  debug: (...a) => console.debug('%c[SW]', 'color: #2196F3;', new Date().toISOString(), ...a)
};

// পেজ থেকে সব লিংক খোঁজা
async function discoverResources(pageUrl) {
  try {
    logger.debug(`Discovering resources for: ${pageUrl}`);
    const response = await fetch(pageUrl);
    const text = await response.text();

    const patterns = [
      /(?:href|src)=["']([^"']+)["']/g,        // HTML tags
      /url\(["']?([^"')]+)["']?\)/g,           // CSS urls
      /["']([^"']+\.(?:js|css|png|jpg|jpeg|gif|svg|webp|json|woff2?))["']/g // common files
    ];

    const found = new Set([pageUrl]);

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const url = resolveUrl(match[1], pageUrl);
        if (url.startsWith(self.location.origin)) {
          found.add(url.split('#')[0].split('?')[0]);
        }
      }
    }
    return found;
  } catch (e) {
    logger.warn(`Resource discovery failed for ${pageUrl}:`, e);
    return new Set();
  }
}

function resolveUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

// রিসোর্স ক্যাশে রাখা
async function cacheResource(url) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(url, { cache: 'reload' });
    if (res.ok) {
      await cache.put(url, res.clone());
      logger.debug(`Cached: ${url}`);
      return true;
    }
  } catch (e) {
    logger.warn(`Failed to cache: ${url}`, e);
  }
  return false;
}

// সব রিসোর্স অটো ক্যাশ করা
async function autoCacheAll() {
  if (!isOnline) return;
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    const urls = await discoverResources(client.url);
    for (const url of urls) {
      await cacheResource(url);
    }
  }
}

// ইনস্টল ইভেন্টে অটো ক্যাশ শুরু
self.addEventListener('install', event => {
  logger.log('Installing auto cache SW...');
  event.waitUntil((async () => {
    await autoCacheAll();
    self.skipWaiting();
  })());
});

// অ্যাক্টিভেট
self.addEventListener('activate', event => {
  logger.log('Activating auto cache SW...');
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)));
    self.clients.claim();
  })());
});

// ফেচ ইভেন্ট — অফলাইন হলে ক্যাশ ব্যবহার
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, res.clone());
      return res;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        return new Response('<h1>Offline</h1><p>Cached version not available.</p>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      return new Response('Offline', { status: 503 });
    }
  })());
});

// অনলাইন/অফলাইন ডিটেকশন
self.addEventListener('online', () => { isOnline = true; autoCacheAll(); });
self.addEventListener('offline', () => { isOnline = false; });

// পিরিয়ডিক আপডেট
setInterval(autoCacheAll, UPDATE_INTERVAL);
