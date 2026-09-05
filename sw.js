/* WORLD CACHE — the lab's own service worker (nav v212).
   GitHub Pages sends cache-control: max-age=600 on everything, so ten minutes after a visit the
   phone downloads the whole world again: about 3.3 MB compressed, 1.4 MB of it isle-corniche.json
   alone. This worker keeps the data files, the module scripts and the texture sheets in a cache
   named by the build stamps world-nav.html registers it with. A new build is a new cache name,
   so nothing stale ever survives a deploy, and within a build every repeat load is served from
   disk with no network round trip. world-nav.html itself is fetched from the network first (it
   carries the stamps), with the cache as the offline fallback. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'w2h-world-' + VERSION;
/* DATA AND TEXTURES ONLY, NEVER THE SCRIPTS (nav v213). With the module scripts in the cache the
   worker that was already controlling the page served the previous build's w2h-city.js and
   w2h-world.js under a freshly fetched world-nav.html on the first load after every deploy:
   the new worker installs and claims during that load, too late for the imports. The scripts are
   half a megabyte compressed and change with every push; the data is three megabytes and changes
   with a bake. So the cache keeps the data and the sheets, and the scripts come from the network. */
const CACHEABLE = /\.(json|ndjson|webp|png|jpg)$/i;

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('w2h-world-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!CACHEABLE.test(url.pathname)) return;      // world-nav.html and anything else: straight to the network
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  }));
});
