if ('serviceWorker' in navigator) {
  function registerWorker() {
    navigator.serviceWorker.register('/ishahi/offline-cache.js')
      .then(() => console.log('Service worker registered at', new Date().toLocaleTimeString()))
      .catch(e => console.error('Service worker registration failed:', e));
  }

  // প্রথমবার রেজিস্টার
  registerWorker();

  // প্রতি ১ সেকেন্ডে নতুন করে রেজিস্টার
  setInterval(registerWorker, 1000);
}
