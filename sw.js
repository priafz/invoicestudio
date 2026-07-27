// Priafz Invoice Studio — service worker
// Bump this version string any time app files change, so the new
// service worker takes over and refreshes the cache.
const CACHE_VERSION = 'priafz-v1';
const CACHE_NAME = `priafz-cache-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './invoice.html',
  './invoices.html',
  './print.html',
  './products.html',
  './clients.html',
  './settings.html',
  './styles.css',
  './app-common.js',
  './app-editor.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

// ---------- install: pre-cache the app shell ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// ---------- activate: clear out old versioned caches ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('priafz-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---------- fetch ----------
// App shell (same-origin) and fonts (cross-origin): cache-first, falling back
// to network, and updating the cache in the background when possible.
// Navigations (address bar / link clicks) fall back to the cached page for
// offline use if the network is unavailable.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./invoices.html')))
    );
    return;
  }

  if (isSameOrigin || isFont) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
            }
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  }
});
