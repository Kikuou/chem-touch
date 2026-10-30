// Service worker (spec §6: offline use). Once a page has been opened, it
// keeps working when the classroom Wi-Fi is slow or gone.
//   - app files and data (HTML, JS, CSS, JSON, SDF): network first, so a
//     new version is used as soon as it is online; the cached copy is used
//     when the network fails or takes longer than NETWORK_TIMEOUT_MS
//   - vendor/ (libraries, versioned folder names): cache first
// The page sends the URLs it has already loaded (performance entries) so
// that they are cached on the first visit too (see js/main.js).
const VERSION = 'v5';
const APP_CACHE = `chemtouch-app-${VERSION}`;
const LIB_CACHE = 'chemtouch-lib';
const NETWORK_TIMEOUT_MS = 4000;
const PRECACHE = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'data/compounds.json',
  'data/categories.json',
  'data/comparisons.json',
  'data/functional_groups.json',
  'data/series.json',
  'data/elements.json',
  'data/schedule.json',
  'data/practice.json',
];

const isLib = (url) => new URL(url).pathname.includes('/vendor/');

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    // one missing file must not stop the installation
    await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('chemtouch-app-') && k !== APP_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

async function put(cacheName, req, res) {
  if (res && res.status === 200 && res.type === 'basic') {
    const cache = await caches.open(cacheName);
    await cache.put(req, res.clone());
  }
  return res;
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return put(LIB_CACHE, req, await fetch(req));
}

async function networkFirst(req) {
  const net = fetch(req).then((res) => put(APP_CACHE, req, res));
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([net, timeout]);
    if (res) return res;
  } catch (e) {
    // offline: fall through to the cache
  }
  const hit = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const shell = await caches.match('index.html');
    if (shell) return shell;
  }
  return net; // slow network and nothing cached: keep waiting
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(isLib(req.url) ? cacheFirst(req) : networkFirst(req));
});

// URLs the page loaded before this worker took control
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'cache' || !Array.isArray(e.data.urls)) return;
  e.waitUntil((async () => {
    for (const u of e.data.urls.slice(0, 300)) {
      try {
        if (new URL(u).origin !== self.location.origin || await caches.match(u)) continue;
        const res = await fetch(u);
        await put(isLib(u) ? LIB_CACHE : APP_CACHE, u, res);
      } catch (err) {
        // ignore: the file is cached the next time it is used
      }
    }
  })());
});
