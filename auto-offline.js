if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ishahi/offline-cache.js')
    .then(() => console.log('Offline service worker registered'))
    .catch(e => console.error('Service worker registration failed:', e));
}
