const CACHE_NAME = 'jasa_aplikasi_v41';
const urlsToCache = [
  '/Jasa-Pembuatan-Aplikasi/',
  '/Jasa-Pembuatan-Aplikasi/index.html',
  '/Jasa-Pembuatan-Aplikasi/style.css',
  '/Jasa-Pembuatan-Aplikasi/manifest.json',
  '/Jasa-Pembuatan-Aplikasi/icon-192.png',
  '/Jasa-Pembuatan-Aplikasi/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
