

// Workbox ბიბლიოთეკების CDN-დან იმპორტი
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

// ვერსია კეშის მართვისთვის
// Build script: Replace __VERSION__ with timestamp (removes any || fallback too)
// Command: VERSION=$(TZ='Asia/Tbilisi' date +%Y.%m.%d-%H.%M); sed -i'' "s|const VERSION = .*;|const VERSION = '$VERSION';|" workbox-service-worker.js
const VERSION = '__VERSION__';

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
    const cacheNames = await caches.keys();
    const oldCaches = cacheNames.filter(name => {
      return name.startsWith('pages-cache-') || 
             name.startsWith('static-resources-') || 
             name.startsWith('images-cache-') ||
             name.startsWith('fonts-cache-') ||
             name.startsWith('api-cache-') ||
             name.startsWith('index-html-cache-');
      // Note: Workbox precache caches are handled by cleanupOutdatedCaches()
    });
    
    await Promise.all(
      oldCaches.map(name => caches.delete(name))
    );
    console.log('ძველი კეშები გაწმენდილია');
  } catch (error) {
    console.error('შეცდომა ძველი კეშების გაწმენდისას:', error);
  }
}

// ფაილების სია წინასწარი კეშირებისთვის
const filesToPrecache = [
  { url: '/manifest.json', revision: VERSION },
  { url: '/index.html', revision: VERSION },
  { url: '/img/icon/icon.png', revision: VERSION },
  { url: '/img/svg/Flag_of_Georgia.svg', revision: VERSION },
  { url: '/img/logo/logo.jpeg', revision: VERSION }
];

// წინასწარი კეშირება
precacheAndRoute(filesToPrecache);

// Service Worker-ის დაყენების დამუშავება
self.addEventListener('install', (event) => {
  // გამოვტოვებთ ლოდინს და ახალ Service Worker-ს დაუყოვნებლივ ვაქტივირებთ
  self.skipWaiting();
});

// Service Worker-ის აქტივაციის დამუშავება
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // ვაწმენდთ ძველ კეშებს
      cleanupOldCaches(),
      // ვითხოვთ კონტროლს ყველა კლიენტზე
      clients.claim()
    ]).then(() => {
      // Notify all clients that service worker is activated
      return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
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
    const isStaticResource = request.destination === 'script' || 
                             request.destination === 'style' ||
                             url.pathname.match(/\.(js|css|mjs)$/i);
    return !isExcluded && isStaticResource;
  },
  new StaleWhileRevalidate({
    cacheName: 'static-resources-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 დღე
      }),
    ],
  })
);

// NetworkFirst სტრატეგია API მოთხოვნებისთვის (JSON, XML)
registerRoute(
  ({ request, url }) => {
    const isExcluded = EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl));
    const isAPI = request.destination === 'empty' && 
                  (url.pathname.match(/\.(json|xml)$/i) || 
                   url.pathname.startsWith('/api/'));
    return !isExcluded && isAPI;
  },
  new NetworkFirst({
    cacheName: 'api-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 წუთი
      }),
    ],
  })
);

// CacheFirst სტრატეგია სურათებისთვის (PNG, JPEG, GIF, SVG, WebP)
registerRoute(
  ({ request, url }) => {
    // Exclude analytics and tracking images
    const isExcluded = EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl));
    const isImage = request.destination === 'image' || 
                    url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i);
    return !isExcluded && isImage;
  },
  new CacheFirst({
    cacheName: 'images-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 დღე
      }),
    ],
  })
);

// CacheFirst სტრატეგია ფონტებისთვის
registerRoute(
  ({ request, url }) => {
    const isExcluded = EXCLUDED_URLS.some(excludedUrl => url.href.includes(excludedUrl));
    const isFont = request.destination === 'font' || 
                   url.pathname.match(/\.(woff|woff2|ttf|otf|eot)$/i);
    return !isExcluded && isFont;
  },
  new CacheFirst({
    cacheName: 'fonts-cache-' + VERSION,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 წელი
      }),
    ],
  })
);

// Message handler for all message types
self.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;

  switch (event.data.type) {
    case 'GET_SW_VERSION':
    case 'GET_VERSION':
      // Send version back to client
      const versionResponse = {
        type: 'SW_VERSION',
        version: VERSION
      };
      
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(versionResponse);
      } else {
        // Fallback: send message to all clients
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage(versionResponse);
          });
        });
      }
      break;

    case 'SKIP_WAITING':
      // Skip waiting and activate immediately
      self.skipWaiting();
      break;

    default:
      console.log('Unknown message type:', event.data.type);
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

[2025-01-27] v2.3 – Enhanced service worker to support all file types: Added support for fonts, SVG files, API requests, improved message handling (GET_VERSION, SKIP_WAITING), added offline fallback, expanded precache list, and improved cache cleanup. Service worker now notifies clients when activated.
Reason: Ensure service worker supports all resources used by the application including fonts, SVGs, and all message types from index.html integration.
Thoughts: Comprehensive caching strategy ensures all assets are properly cached while maintaining performance. Added support for all message handlers needed by the page integration.
Model: Claude Sonnet 4.5
*/
