const CACHE_NAME = 'jasa_aplikasi_cache_v8';
const ASSETS_TO_CACHE = [
  '/Jasa-Pembuatan-Aplikasi/',
  '/Jasa-Pembuatan-Aplikasi/index.html',
  '/Jasa-Pembuatan-Aplikasi/style.css',
  '/Jasa-Pembuatan-Aplikasi/manifest.json',
  '/Jasa-Pembuatan-Aplikasi/icon-192.png',
  '/Jasa-Pembuatan-Aplikasi/icon-512.png'
];

// Proses Instalasi Service Worker & Caching File
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Menyimpan aset ke dalam cache...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Proses Aktivasi Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Menghapus cache lama...');
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Strategi Cache-First: Ambil dari cache dulu, jika gagal baru ambil dari internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      })
  );
});
