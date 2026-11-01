// Service worker for Meal Planner.
// The build step fills in VERSION and PRECACHE (see vite.config.ts).
// Strategy: store every app file at install time, then always answer from
// that store. The app works offline after the first load. Your meal data is
// NOT here: it is in IndexedDB, which this file never touches.

const VERSION = 'c1922aab06b7';
const CACHE = 'meal-planner-' + VERSION;
const PRECACHE = [
  "./assets/index-CVJNgbSX.js",
  "./assets/index-DxMtA56-.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('meal-planner-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// The page sends this when you tap "Update" in the app.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    const indexUrl = new URL('./index.html', self.registration.scope).href;
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(indexUrl, { ignoreVary: true }).then((hit) => hit || fetch(request)),
      ),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(request)),
    ),
  );
});
