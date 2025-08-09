(function() {
  const REFRESH_INTERVAL = 60000; // 60 সেকেন্ডে একবার আপডেট করে
  const SW_PATH = '/sw.js'; // Service Worker ফাইল (GitHub Pages-এ একই ফোল্ডারে রাখুন)

  // ওয়েবসাইটের সকল প্রয়োজনীয় রিসোর্স সংগ্রহ করে
  function collectResources() {
    const urls = new Set([location.href.split(/[?#]/)[0]]);
    document.querySelectorAll(`
      link[href], script[src], img[src], source[src],
      video[src], audio[src], iframe[src], embed[src],
      object[data], link[rel*="icon"][href], link[rel="manifest"][href]
    `).forEach((el) => {
      const url = el.href || el.src || el.data;
      if (url) {
        try {
          urls.add(new URL(url, location.href).href.split(/[?#]/)[0]);
        } catch (e) {}
      }
    });
    return Array.from(urls);
  }

  // Service Worker রেজিস্টার করে
  function registerServiceWorker(resources) {
    if (!('serviceWorker' in navigator)) {
      console.warn('[AutoOffline] ❌ Service Worker সাপোর্ট করে না!');
      return;
    }

    navigator.serviceWorker.register(SW_PATH, { scope: '/' })
      .then((reg) => {
        console.log('[AutoOffline] ✅ Service Worker রেজিস্টার্ড!', reg.scope);
        if (reg.active) {
          reg.active.postMessage({ type: 'CACHE_RESOURCES', resources });
          console.log('[AutoOffline] 📦 রিসোর্স লিস্ট পাঠানো হয়েছে:', resources);
        } else {
          console.log('[AutoOffline] ⏳ Service Worker এখনো এক্টিভ হয়নি, ২ সেকেন্ড পরে আবার চেষ্টা...');
          setTimeout(() => {
            reg.active?.postMessage({ type: 'CACHE_RESOURCES', resources });
          }, 2000);
        }
      })
      .catch((err) => {
        console.error('[AutoOffline] ❌ রেজিস্ট্রেশন ফেইল্ড:', err);
      });
  }

  // মেইন ইনিশিয়ালাইজেশন ফাংশন
  function init() {
    const resources = collectResources();
    console.log('[AutoOffline] 🌐 ক্যাশে করার রিসোর্স:', resources);
    registerServiceWorker(resources);

    // নিয়মিত আপডেট করার জন্য ইন্টারভাল সেট করা
    setInterval(() => {
      if (navigator.onLine) {
        const updatedResources = collectResources();
        console.log('[AutoOffline] 🔄 রিসোর্স লিস্ট আপডেট করা হচ্ছে...', updatedResources);
        registerServiceWorker(updatedResources);
      } else {
        console.log('[AutoOffline] 📴 অফলাইন — আপডেট করা হচ্ছে না।');
      }
    }, REFRESH_INTERVAL);
  }

  // DOM লোড হলে স্ক্রিপ্ট চালু করা
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
