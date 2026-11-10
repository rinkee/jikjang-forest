/*
 * 직장의 숲 — service worker: the app keeps working without a network after one visit.
 *
 * Network first, so a changed file shows up at once; when the network is gone or slow
 * (more than 3 s, a subway tunnel), the copy kept from last time is used. Everything this
 * site serves for the app is kept, and so are the fonts. Dev pages and the studio's save
 * endpoint are left alone.
 * Bump CACHE when the list below changes.
 */
const CACHE = 'ccws-v1';
const SHELL = [
  './',
  './index.html',
  './day.html',
  './manifest.json',
  './css/style.css',
  './css/day.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/cc.js',
  './js/char3d.js',
  './js/tuning.js',
  './js/mascot.js',
  './js/sfx.js',
  './js/parts/hair.js',
  './js/parts/face.js',
  './js/parts/clothes.js',
  './js/parts/extras.js',
  './js/day/app.js',
  './js/day/clock.js',
  './js/day/world.js',
  './js/day/sky.js',
  './js/day/kit.js',
  './js/day/office.js',
  './js/day/subway.js',
  './js/day/home.js',
  './vendor/three/three.module.js',
  './vendor/three/addons/environments/RoomEnvironment.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SLOW_MS = 3000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same && /\/(dev|tools|__studio)\//.test(url.pathname)) return;
  if (!same && !FONT_HOSTS.includes(url.hostname)) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  });
  net.catch(() => {});
  try {
    const res = await Promise.race([net, new Promise((r) => setTimeout(r, SLOW_MS, null))]);
    if (res) return res;
  } catch (err) {
    /* offline: fall through to the kept copy */
  }
  const kept = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
  return kept || net;
}
