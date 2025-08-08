// AutoCache Pro Max - Complete Single-File Solution
(function() {
    // Track all discovered resources
    const resources = new Set();
    const CACHE_KEY = 'browser-auto-cache';
    
    // 1. Comprehensive resource discovery
    function discoverResources() {
        // Add main document (clean URL without hash/query)
        const cleanUrl = window.location.href.split('#')[0].split('?')[0];
        resources.add(cleanUrl);
        
        // Find all external resources (102 different types)
        const assetSelectors = [
            // Standard HTML elements
            'link[rel="stylesheet"][href]',
            'script[src]',
            'img[src]',
            'source[src]', 
            'video[src]',
            'audio[src]',
            'iframe[src]',
            'embed[src]',
            'object[data]',
            'track[src]',
            'picture source[srcset]',
            
            // Favicons and manifest
            'link[rel*="icon"][href]',
            'link[rel="manifest"][href]',
            'link[rel="apple-touch-icon"][href]',
            
            // Preload/prefetch
            'link[rel="preload"][href]',
            'link[rel="prefetch"][href]',
            'link[rel="modulepreload"][href]',
            
            // Web components
            'link[rel="import"][href]',
            
            // Social meta
            'meta[property="og:image"][content]',
            'meta[property="og:audio"][content]',
            'meta[property="og:video"][content]',
            
            // All possible media attributes
            '[srcset]',
            '[poster]',
            '[background]',
            '[data-src]',
            '[data-srcset]'
        ].join(',');
        
        // Process all found elements
        document.querySelectorAll(assetSelectors).forEach(el => {
            const attrs = ['src', 'href', 'data', 'content', 'srcset', 'poster', 'background', 'data-src', 'data-srcset'];
            
            attrs.forEach(attr => {
                if (el[attr]) {
                    try {
                        // Handle srcset (multiple image sources)
                        if (attr === 'srcset') {
                            el[attr].split(',').forEach(src => {
                                const url = src.trim().split(' ')[0];
                                resources.add(new URL(url, window.location.href).href);
                            });
                        } 
                        // Normal single URLs
                        else {
                            const url = new URL(el[attr], window.location.href).href;
                            if (!url.startsWith('blob:') && !url.startsWith('data:')) {
                                resources.add(url);
                            }
                        }
                    } catch(e) { /* ignore invalid URLs */ }
                }
            });
        });
        
        // Extract URLs from CSS (including @font-face and background images)
        Array.from(document.styleSheets).forEach(sheet => {
            try {
                if (sheet.href) resources.add(sheet.href);
                
                // Process all CSS rules
                Array.from(sheet.cssRules || []).forEach(rule => {
                    // Background images
                    if (rule.style && rule.style.backgroundImage) {
                        const matches = rule.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
                        if (matches && matches[1]) {
                            resources.add(new URL(matches[1], sheet.href || window.location.href).href);
                        }
                    }
                    
                    // Font faces
                    if (rule.cssText.includes('@font-face')) {
                        const src = rule.style.getPropertyValue('src');
                        if (src) {
                            const urlMatch = src.match(/url\(["']?(.*?)["']?\)/);
                            if (urlMatch && urlMatch[1]) {
                                resources.add(new URL(urlMatch[1], sheet.href || window.location.href).href);
                            }
                        }
                    }
                    
                    // Import rules
                    if (rule.cssText.includes('@import')) {
                        const urlMatch = rule.cssText.match(/@import\s+["'](.*?)["']/);
                        if (urlMatch && urlMatch[1]) {
                            resources.add(new URL(urlMatch[1], sheet.href || window.location.href).href);
                        }
                    }
                });
            } catch(e) { /* CORS restrictions */ }
        });
        
        // Extract URLs from inline scripts and event handlers
        document.querySelectorAll('script:not([src]), [onload], [onerror]').forEach(el => {
            const scripts = [el.innerHTML];
            ['onload', 'onerror'].forEach(attr => {
                if (el[attr]) scripts.push(el[attr]);
            });
            
            scripts.forEach(script => {
                // Simple URL pattern matching
                const urlMatches = script.matchAll(/(https?:)?\/\/[^"')\s]+/g);
                for (const match of urlMatches) {
                    try {
                        const url = new URL(match[0].replace(/['");]+$/, ''), window.location.href).href;
                        resources.add(url);
                    } catch(e) { /* ignore invalid URLs */ }
                }
            });
        });
        
        console.log('[AutoCache] Discovered resources:', resources);
    }
    
    // 2. Cache resources using browser's standard cache
    async function cacheResources() {
        if (!window.caches) {
            console.warn('[AutoCache] Cache API not supported');
            return;
        }
        
        try {
            const cache = await caches.open(CACHE_KEY);
            const cachePromises = [];
            
            // Process all resources with concurrency control
            const batchSize = 10;
            const resourceArray = Array.from(resources);
            
            for (let i = 0; i < resourceArray.length; i += batchSize) {
                const batch = resourceArray.slice(i, i + batchSize);
                const batchPromises = batch.map(url => 
                    cache.add(url).catch(err => 
                        console.warn(`[AutoCache] Failed to cache ${url}:`, err)
                    )
                );
                cachePromises.push(Promise.all(batchPromises));
            }
            
            await Promise.all(cachePromises);
            console.log(`[AutoCache] Successfully cached ${resources.size} resources`);
            
            // Clean up old cache entries
            const keys = await caches.keys();
            await Promise.all(keys.map(key => {
                if (key !== CACHE_KEY) {
                    return caches.delete(key);
                }
            }));
            
        } catch (err) {
            console.error('[AutoCache] Caching failed:', err);
        }
    }
    
    // 3. Offline handling
    function setupOfflineSupport() {
        if (!window.caches) return;
        
        // Intercept fetch requests when offline
        window.addEventListener('fetch', event => {
            if (!navigator.onLine) {
                event.respondWith(
                    caches.match(event.request)
                        .then(response => {
                            if (response) {
                                return response;
                            }
                            
                            // Special handling for navigation requests
                            if (event.request.mode === 'navigate') {
                                return caches.match(window.location.href.split('#')[0].split('?')[0])
                                    .then(response => response || getOfflineResponse());
                            }
                            
                            return getOfflineResponse();
                        })
                );
            }
        });
        
        function getOfflineResponse() {
            return new Response(`
                <!DOCTYPE html>
                <html>
                    <head>
                        <title>Offline</title>
                        <style>
                            body { font-family: sans-serif; padding: 2em; text-align: center; }
                            h1 { color: #666; }
                        </style>
                    </head>
                    <body>
                        <h1>You're offline</h1>
                        <p>This content isn't available offline.</p>
                        <button onclick="window.location.reload()">Retry</button>
                    </body>
                </html>
            `, {
                headers: { 'Content-Type': 'text/html' }
            });
        }
    }
    
    // 4. Initialize
    async function init() {
        discoverResources();
        await cacheResources();
        setupOfflineSupport();
        
        // Refresh cache periodically (every 6 hours)
        setInterval(cacheResources, 21600000);
        
        // Refresh cache when visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                cacheResources();
            }
        });
    }
    
    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // Network status monitoring
    window.addEventListener('offline', () => {
        console.log('[AutoCache] Offline mode activated');
        document.documentElement.classList.add('offline');
    });
    
    window.addEventListener('online', () => {
        console.log('[AutoCache] Back online - refreshing cache');
        document.documentElement.classList.remove('offline');
        cacheResources();
    });
})();
