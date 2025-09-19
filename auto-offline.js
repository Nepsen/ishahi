<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Permanent Offline Cache</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        header {
            background: #3498db;
            color: white;
            padding: 30px;
            text-align: center;
        }
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .description {
            font-size: 1.1rem;
            opacity: 0.9;
            max-width: 800px;
            margin: 0 auto;
        }
        .content {
            padding: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        @media (max-width: 768px) {
            .content {
                grid-template-columns: 1fr;
            }
        }
        .card {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
        }
        h2 {
            color: #3498db;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #eaecef;
        }
        .status {
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-weight: bold;
        }
        .online {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .offline {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        button {
            background: #3498db;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin: 5px;
            transition: background 0.3s;
        }
        button:hover {
            background: #2980b9;
        }
        .log-container {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 8px;
            height: 200px;
            overflow-y: auto;
            font-family: monospace;
            white-space: pre-wrap;
        }
        .resources {
            max-height: 300px;
            overflow-y: auto;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #f2f2f2;
        }
        .instructions {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
        }
        footer {
            text-align: center;
            padding: 20px;
            color: #6c757d;
            font-size: 0.9rem;
        }
        .progress-container {
            margin: 15px 0;
        }
        progress {
            width: 100%;
            height: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Permanent Offline Cache</h1>
            <p class="description">Service worker with permanent storage that works like YouTube's offline feature</p>
        </header>

        <div class="content">
            <div class="card">
                <h2>Service Worker Status</h2>
                <div id="status" class="status">Checking status...</div>
                <div class="progress-container">
                    <div>Storage Usage:</div>
                    <progress id="storageProgress" value="0" max="100"></progress>
                    <span id="storageText">0%</span>
                </div>
                <div class="buttons">
                    <button id="toggleOnline">Go Offline</button>
                    <button id="updateResources">Update Resources</button>
                    <button id="clearCache">Clear Cache</button>
                    <button id="downloadPage">Download This Page</button>
                </div>
                
                <div class="instructions">
                    <h3>How It Works</h3>
                    <p>1. Caches all resources permanently (like YouTube)</p>
                    <p>2. Automatically updates when online</p>
                    <p>3. Uses IndexedDB for persistent storage</p>
                    <p>4. Works completely offline after first visit</p>
                </div>
            </div>
            
            <div class="card">
                <h2>Cached Resources</h2>
                <div id="resourceCount">Loading...</div>
                <div class="resources">
                    <table>
                        <thead>
                            <tr>
                                <th>URL</th>
                                <th>Type</th>
                                <th>Size</th>
                            </tr>
                        </thead>
                        <tbody id="resourcesList">
                            <tr><td colspan="3">Loading resources...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="card" style="grid-column: 1 / -1;">
                <h2>Activity Log</h2>
                <div class="log-container" id="log"></div>
            </div>
        </div>

        <footer>
            <p>This service worker caches resources permanently and updates them when online</p>
        </footer>
    </div>

    <script>
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
            navigator.serviceWorker.register('sw.js').then(registration => {
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
    </script>
</body>
</html>
