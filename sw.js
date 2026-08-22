/* =========================================================
   sw.js — service worker
   App shell sa cachuje pri inštalácii (appka funguje offline),
   fonty sa cachujú za behu. Dáta sú v localStorage, teda offline vždy.
   ========================================================= */
/* Pri každom nasadení novej verzie zvýšte číslo — prehliadač si tým
   vyžiada čerstvé súbory a starú cache zmaže. */
const CACHE = 'klubook-v24';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/config.js',
  './js/api.js',
  './js/sync.js',
  './js/contact.js',
  './js/ui.js',
  './js/router.js',
  './js/views/login.js',
  './js/views/training.js',
  './js/views/students.js',
  './js/views/payments.js',
  './js/views/reports.js',
  './js/views/settings.js',
  './js/views/points.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // fonty Google: cache-first (po prvom načítaní fungujú offline)
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit || fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }).catch(() => hit),
      ),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // navigácia: sieť, pri výpadku app shell z cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html')),
    );
    return;
  }

  // ostatné: cache-first s tichou aktualizáciou
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    }),
  );
});
