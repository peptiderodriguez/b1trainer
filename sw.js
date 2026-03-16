// =============================================================================
// Service Worker — B1/B2 Goethe Trainer (offline support)
// =============================================================================

const CACHE_VERSION = 'b1trainer-v6';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/app.js',
  './js/vocabulary.js',
  './js/grammar.js',
  './js/reading.js',
  './js/listening.js',
  './js/writing.js',
  './js/exam.js',
  './js/fsp.js',
  './data/nouns.json',
  './data/verbs.json',
  './data/other.json',
  './data/grammar.json',
  './data/reading.json',
  './data/medical.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ---------------------------------------------------------------------------
// Install — pre-cache all assets
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Activate immediately instead of waiting for existing tabs to close
  self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Activate — clean up old cache versions
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ---------------------------------------------------------------------------
// Fetch — network-first for HTML, cache-first for everything else
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // HTML pages: try network first, fall back to cache
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cache with fresh copy
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // All other assets (JS, CSS, JSON): cache-first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache the new resource for next time
        const clone = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
