        // UI management
        const logContainer = document.getElementById('log');
        const statusDiv = document.getElementById('status');
        const resourcesList = document.getElementById('resourcesList');
        const resourceCount = document.getElementById('resourceCount');
        const storageProgress = document.getElementById('storageProgress');
        const storageText = document.getElementById('storageText');
        
        function log(message) {
            const timestamp = new Date().toLocaleTimeString();
            logContainer.innerHTML += `[${timestamp}] ${message}\n`;
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        function updateStatus(online) {
            statusDiv.textContent = online ? 'Online - Resources will be updated automatically' : 'Offline - Using cached resources';
            statusDiv.className = `status ${online ? 'online' : 'offline'}`;
            document.getElementById('toggleOnline').textContent = online ? 'Go Offline' : 'Go Online';
        }
        
        // Simulate online/offline status for demonstration
        document.getElementById('toggleOnline').addEventListener('click', function() {
            const currentlyOnline = statusDiv.classList.contains('online');
            updateStatus(!currentlyOnline);
            
            // Send message to service worker
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SET_ONLINE_STATUS',
                    online: !currentlyOnline
                });
            }
            
            log(`Manually set status to: ${!currentlyOnline ? 'online' : 'offline'}`);
        });
        
        document.getElementById('updateResources').addEventListener('click', function() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'UPDATE_RESOURCES'
                });
                log('Manual update requested');
            }
        });
        
        document.getElementById('clearCache').addEventListener('click', function() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CLEAR_CACHE'
                });
                log('Cache clear requested');
            }
        });
        
        document.getElementById('downloadPage').addEventListener('click', function() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'CACHE_PAGE',
                    url: window.location.href
                });
                log('Page download requested');
            }
        });
        
        // Initialize
        updateStatus(navigator.onLine);
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            updateStatus(true);
            log('Browser is online');
        });
        
        window.addEventListener('offline', () => {
            updateStatus(false);
            log('Browser is offline');
        });
        
        // Request cached resources from service worker
        function requestCachedResources() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'GET_CACHED_RESOURCES'
                });
            }
        }
        
        // Request storage usage from service worker
        function requestStorageUsage() {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'GET_STORAGE_USAGE'
                });
            }
        }
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'CACHED_RESOURCES') {
                const resources = event.data.resources;
                resourceCount.textContent = `Total cached resources: ${resources.length}`;
                
                resourcesList.innerHTML = '';
                resources.forEach(resource => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${resource.url}</td>
                        <td>${resource.type}</td>
                        <td>${formatBytes(resource.size)}</td>
                    `;
                    resourcesList.appendChild(row);
                });
            } else if (event.data.type === 'LOG') {
                log(event.data.message);
            } else if (event.data.type === 'STORAGE_USAGE') {
                const usage = event.data.usage;
                storageProgress.value = usage.percent;
                storageText.textContent = `${usage.percent.toFixed(1)}% (${formatBytes(usage.used)} of ${formatBytes(usage.quota)})`;
            }
        });
        
        // Format bytes to human readable format
        function formatBytes(bytes, decimals = 2) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const dm = decimals < 0 ? 0 : decimals;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        }
        
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('offline-cache.js').then(registration => {
                log('Service Worker registered successfully');
                
                // Request cached resources after a short delay
                setTimeout(() => {
                    requestCachedResources();
                    requestStorageUsage();
                    
                    // Request storage usage periodically
                    setInterval(requestStorageUsage, 5000);
                }, 1000);
            }).catch(error => {
                log('Service Worker registration failed: ' + error.message);
            });
        } else {
            log('Service Workers are not supported in this browser');
        }
