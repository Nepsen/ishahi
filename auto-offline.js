// Simple registration that works with any page
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/ishahi/auto-offline.js')
      .then(reg => {
        console.log('ServiceWorker registration successful');
        
        // Check for updates every hour
        setInterval(() => reg.update(), 60 * 60 * 1000);
      })
      .catch(err => {
        console.error('ServiceWorker registration failed:', err);
      });
  });
}
