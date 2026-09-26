// SYNTHWING 64 service worker: network-first with an offline fallback, so an
// installed home-screen copy keeps working without a connection but always
// picks up new versions when online.
const CACHE = 'synthwing64-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  './js/util.js', './js/gl.js', './js/mesh.js', './js/font.js', './js/models.js', './js/audio.js', './js/songs.js', './js/input.js',
  './js/world.js', './js/fx.js', './js/entities.js', './js/bosses.js', './js/stages.js', './js/game.js', './js/hud.js', './js/main.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))));
});
