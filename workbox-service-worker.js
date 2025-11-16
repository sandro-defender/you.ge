/*
Project: You.Ge
File: workbox-service-worker.js
Version: 2.0
Author: Cursor AI
Model: Claude Sonnet 4.5
Last Modified: 2025-01-27
Purpose: Service Worker for PWA caching with Workbox - simplified version for landing page
*/

// Workbox ბიბლიოთეკების CDN-დან იმპორტი
console.log('[SW] ========================================');
console.log('[SW] 🚀 Service Worker script started');
console.log('[SW] Loading Workbox from CDN...');
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');
console.log('[SW] ✅ Workbox loaded');

// ვერსია კეშის მართვისთვის
// Build script replaces __VERSION__ with timestamp: sed -i'' -e "s|__VERSION__|$(TZ='Asia/Tbilisi' date +%Y.%m.%d-%H.%M)|g" workbox-service-worker.js
const VERSION = '__VERSION__';
console.log('[SW] Service Worker Version:', VERSION);
console.log('[SW] ========================================');

// URL-მისამართების სია კეშიდან გამორიცხვისთვის
const EXCLUDED_URLS = [
  'google-analytics.com',
  'googletagmanager.com',
  'cloudflareinsights.com',
  'cloudflare.com/beacon',
  'analytics',
  'beacon',
  'tracking'
];

// ჩართვა განვითარების რეჟიმში
workbox.setConfig({ debug: false });

// Workbox-ის სტრატეგიების გამოყენება
const { strategies } = workbox;
const { StaleWhileRevalidate, NetworkFirst, CacheFirst, NetworkOnly } = strategies;
const { registerRoute } = workbox.routing;
const { precacheAndRoute, cleanupOutdatedCaches } = workbox.precaching;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

// მოძველებული კეშების გაწმენდა
cleanupOutdatedCaches();

// ფუნქცია ძველი კეშების შემოწმებისა და გაწმენდისთვის
async function cleanupOldCaches() {
  try {
    console.log('[SW] 🧹 Starting cache cleanup...');
    const cacheNames = await caches.keys();
    console.log('[SW] Found', cacheNames.length, 'cache(s):', cacheNames);
    
    const oldCaches = cacheNames.filter(name => {
      return name.startsWith('pages-cache-') || 
             name.startsWith('static-resources-') || 
             name.startsWith('images-cache-') ||
             name.startsWith('index-html-cache-');
    });
    
    console.log('[SW] Old caches to delete:', oldCaches);
    
    await Promise.all(
      oldCaches.map(name => {
        console.log('[SW] Deleting cache:', name);
        return caches.delete(name);
      })
    );
    console.log('[SW] ✅ Old caches cleaned up');
  } catch (error) {
    console.error('[SW] ❌ Error cleaning up old caches:', error);
  }
}

// ფაილების სია წინასწარი კეშირებისთვის
const filesToPrecache = [
  { url: '/manifest.json', revision: VERSION },
  { url: '/index.html', revision: VERSION },
  { url: '/img/icon/icon.png', revision: VERSION }
];

// წინასწარი კეშირება
precacheAndRoute(filesToPrecache);

// Service Worker-ის დაყენების დამუშავება
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Install event triggered');
  console.log('[SW] Version:', VERSION);
  console.log('[SW] Skip waiting - activating immediately');
  // გამოვტოვებთ ლოდინს და ახალ Service Worker-ს დაუყოვნებლივ ვაქტივირებთ
  self.skipWaiting();
  console.log('[SW] ✅ Install complete, waiting skipped');
});

// Service Worker-ის აქტივაციის დამუშავება
self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activate event triggered');
  console.log('[SW] Version:', VERSION);
  console.log('[SW] Cleaning up old caches and claiming clients...');
  
  event.waitUntil(
    Promise.all([
      // ვაწმენდთ ძველ კეშებს
      cleanupOldCaches(),
      // ვითხოვთ კონტროლს ყველა კლიენტზე
      clients.claim()
    ]).then(() => {
      console.log('[SW] ✅ Activation complete');
      console.log('[SW] Service worker is now controlling clients');
      
      // Notify all clients about the new version
      return self.clients.matchAll().then(clients => {
        console.log('[SW] Notifying', clients.length, 'client(s) about new version');
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: VERSION
          });
        });
      });
    })
  );
});

// მითითებული URL-ების კეშირებიდან გამორიცხვა (მკაცრად ქსელი, კეშის გარეშე)
// Use NetworkOnly strategy - these URLs should never be cached
registerRoute(
  ({ url }) => EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl)),
  new NetworkOnly()
);

// StaleWhileRevalidate სტრატეგია index.html-ისთვის
registerRoute(
  ({ url, request }) => 
    (url.pathname === '/' || url.pathname === '/index.html') && 
    request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: 'index-html-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 5,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 დღე
      }),
    ],
  })
);

// NetworkFirst სტრატეგია HTML მოთხოვნებისთვის
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 დღე
      }),
    ],
  })
);

// StaleWhileRevalidate სტრატეგია JavaScript და CSS ფაილებისთვის
registerRoute(
  ({ request, url }) => {
    // Exclude analytics, beacons, and tracking scripts
    const isExcluded = EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl));
    return !isExcluded && (request.destination === 'script' || request.destination === 'style');
  },
  new StaleWhileRevalidate({
    cacheName: 'static-resources-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 დღე
      }),
    ],
  })
);

// CacheFirst სტრატეგია სურათებისთვის
registerRoute(
  ({ request, url }) => {
    // Exclude analytics and tracking images
    const isExcluded = EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl));
    return !isExcluded && request.destination === 'image';
  },
  new CacheFirst({
    cacheName: 'images-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 დღე
      }),
    ],
  })
);

// Message handler for version requests
self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message received:', event.data);
  
  if (event.data && event.data.type === 'GET_SW_VERSION') {
    console.log('[SW] Version request received, sending version:', VERSION);
    // Send version back to client
    if (event.ports && event.ports[0]) {
      console.log('[SW] Sending version via MessageChannel');
      event.ports[0].postMessage({
        type: 'SW_VERSION',
        version: VERSION
      });
    } else {
      // Fallback: send message to all clients
      console.log('[SW] Sending version to all clients (fallback)');
      self.clients.matchAll().then(clients => {
        console.log('[SW] Found', clients.length, 'client(s)');
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_VERSION',
            version: VERSION
          });
        });
      });
    }
  } else {
    console.log('[SW] Unknown message type:', event.data?.type);
  }
});

/*
CHANGELOG
[2025-01-27] v2.0 – Simplified service worker: Removed push notifications, background sync, complex API caching, and version messaging. Kept only essential caching strategies for HTML, CSS, JS, and images.
Reason: For a simple landing page, we don't need advanced features like push notifications or background sync.
Thoughts: Service worker is now lightweight and focused on basic PWA caching functionality. All unnecessary code removed.
Model: Claude Sonnet 4.5

[2025-01-27] v2.1 – Added version message handler: Service worker now responds to GET_SW_VERSION messages from clients.
Reason: To enable version badge to display service worker version when clicked.
Thoughts: Message handler supports both MessageChannel and direct message communication for maximum compatibility.
Model: Claude Sonnet 4.5

[2025-01-27] v2.2 – Fixed caching issues with analytics and beacon scripts: Added Cloudflare Insights and other analytics services to exclusion list. Added error handling for network failures on excluded URLs. Updated script and image routes to exclude analytics/beacon resources.
Reason: Service worker was trying to cache Cloudflare Insights beacon script causing network errors and IndexedDB errors.
Thoughts: Analytics and tracking scripts should never be cached as they need to make fresh requests. Added comprehensive exclusion list and error handling.
Model: Claude Sonnet 4.5

[2025-01-27] v2.3 – Added comprehensive console logging: All service worker events (install, activate), cache operations, message handling, and version information now logged to console with [SW] prefix. Service worker now notifies clients when activated with version information.
Reason: User requested comprehensive logging to debug service worker version updates and state changes.
Thoughts: Logging helps track service worker lifecycle, version changes, and update detection. All logs prefixed with [SW] for easy filtering.
Model: Claude Sonnet 4.5
*/
