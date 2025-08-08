// Auto-Offline.js - Single file solution
(function() {
    // Cache name with version
    const CACHE_NAME = 'auto-offline-cache-v3';
    
    // List of resources we've found
    let discoveredResources = new Set();
    
    // Function to extract all resources from the page
    function discoverResources() {
        // Add the current page URL (without hash)
        discoveredResources.add(window.location.href.split('#')[0]);
        
        // Find all external resources
        const tags = [
            { selector: 'link[rel="stylesheet"]', attr: 'href' },
            { selector: 'script[src]', attr: 'src' },
            { selector: 'img[src]', attr: 'src' },
            { selector: 'source[src]', attr: 'src' },
            { selector: 'video[src]', attr: 'src' },
            { selector: 'audio[src]', attr: 'src' },
            { selector: 'iframe[src]', attr: 'src' },
            { selector: 'embed[src]', attr: 'src' },
            { selector: 'object[data]', attr: 'data' }
        ];
        
        tags.forEach(({selector, attr}) => {
            document.querySelectorAll(selector).forEach(el => {
                const url = el.getAttribute(attr);
                if (url && !url.startsWith('data:')) {
                    discoveredResources.add(new URL(url, window.location.href).href);
                }
            });
        });
        
        // Also cache web fonts from CSS
        Array.from(document.styleSheets).forEach(sheet => {
            try {
                if (sheet.href) discoveredResources.add(sheet.href);
                Array.from(sheet.cssRules || []).forEach(rule => {
                    if (rule.style && rule.style.backgroundImage) {
                        const matches = rule.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                        if (matches && matches[1]) {
                            discoveredResources.add(new URL(matches[1], sheet.href || window.location.href).href);
                        }
                    }
                });
            } catch (e) { /* Cross-origin restrictions may prevent access */ }
        });
        
        console.log('Discovered resources:', discoveredResources);
    }
    
    // Install Service Worker and cache resources
    function installServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register(URL.createObjectURL(new Blob([
                `self.addEventListener('install', (e) => {
                    e.waitUntil((async () => {
                        const cache = await caches.open('${CACHE_NAME}');
                        const resources = ${JSON.stringify(Array.from(discoveredResources))};
                        await cache.addAll(resources);
                    })());
                });
                
                self.addEventListener('fetch', (e) => {
                    e.respondWith((async () => {
                        const cached = await caches.match(e.request);
                        if (cached) return cached;
                    })());
                });`
            ], { type: 'application/javascript' })))
            .then(reg => console.log('ServiceWorker registered'))
            .catch(err => console.log('ServiceWorker registration failed:', err));
        }
    }
    
    // Run when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            discoverResources();
            installServiceWorker();
        });
    } else {
        discoverResources();
        installServiceWorker();
    }
    
    // Show offline status
    window.addEventListener('offline', () => {
        console.log('You are now offline - cached resources will be used');
    });
})();
