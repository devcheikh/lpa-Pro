const CACHE_NAME = 'lpapro-v3';
const assets = [
  './',
  './index.html',
  './CSS/style.css',
  './manifest.json',
  './js/utils.js',
  './js/api.js',
  './js/auth.js',
  './js/app.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});