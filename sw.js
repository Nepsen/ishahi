const CACHE_NAME = 'auto-offline-v1';
let CORE_RESOURCES = []; // রিসোর্স লিস্ট স্টোর করার জন্য

// মেসেজ হ্যান্ডেলিং (রিসোর্স লিস্ট পেলে ক্যাশে করে)
self.addEventListener('message', (event) => {
  if (event.data.type === 'CACHE_RESOURCES') {
    CORE_RESOURCES = event.data.resources;
    console.log('[SW] রিসোর্স লিস্ট পেয়েছি:', CORE_RESOURCES);
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(CORE_RESOURCES);
      }).then(() => {
        console.log('[SW] সব রিসোর্স ক্যাশে করা হয়েছে!');
      }).catch((err) => {
        console.error('[SW] ক্যাশে করতে সমস্যা:', err);
      })
    );
  }
});

// ইনস্টলেশন স্টেপ
self.addEventListener('install', (event) => {
  console.log('[SW] ইনস্টল হচ্ছে...');
  event.waitUntil(self.skipWaiting()); // অবিলম্বে এক্টিভেট করতে
});

// এক্টিভেশন স্টেপ (পুরানো ক্যাশে ডিলিট করে)
self.addEventListener('activate', (event) => {
  console.log('[SW] এক্টিভেট হচ্ছে...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] পুরানো ক্যাশে ডিলিট করা হচ্ছে:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim()) // সব ক্লায়েন্টে নিয়ন্ত্রণ নেয়া
  );
});

// ফেচ ইভেন্ট হ্যান্ডেলিং (অফলাইনে ক্যাশে থেকে ডাটা দেয়)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // ক্যাশে থেকে ডাটা দেয় (যদি থাকে)
      if (cachedResponse) {
        console.log('[SW] ক্যাশে থেকে ডাটা দেয়া হচ্ছে:', event.request.url);
        return cachedResponse;
      }
      // নেটওয়ার্ক থেকে ফেচ করার চেষ্টা করে
      return fetch(event.request).then((networkResponse) => {
        // নতুন ডাটা ক্যাশে করে
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          console.log('[SW] নতুন ডাটা ক্যাশে করা হয়েছে:', event.request.url);
        });
        return networkResponse;
      }).catch(() => {
        // অফলাইনে থাকলে একটি সাধারণ ফ্যালব্যাক রেস্পন্স দেয়
        return new Response('<h1>অফলাইন মোড</h1><p>ইন্টারনেট সংযোগ নেই, পরে চেষ্টা করুন।</p>', {
          headers: { 'Content-Type': 'text/html' },
        });
      });
    })
  );
});
