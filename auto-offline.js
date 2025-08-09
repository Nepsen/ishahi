if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ishahi/auto-offline.js')
    .then(() => console.log('Offline service worker registered'))
    .catch(e => console.error('Service worker registration failed:', e));
}
