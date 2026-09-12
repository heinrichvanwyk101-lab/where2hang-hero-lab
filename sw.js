/* THE WORLD, INSTALLED (nav v248). GitHub Pages sends cache-control: max-age=600 on everything,
   so without this worker the phone downloads the whole world again ten minutes after a visit:
   about 3.3 MB compressed, 1.4 MB of it isle-corniche.json. Since nav v212 the worker kept the
   data and the texture sheets, lazily, as the page fetched them; the modules were never cached
   because the page asked for them under a fresh Date.now() every load (nav v213 kept them out on
   purpose, after a stale script was served under a new page).

   Now the embed asks for its modules under the nav stamp (world-nav.html), so a module URL
   changes exactly when the build does, and this worker can hold the whole world:
     install   the page and its modules (small, needed first), then skipWaiting
     activate  drop every other build's cache, claim the open pages
     warm      (a message from the page once the opening shot has settled) every island's data,
               the sky sheets, the rail script and the vendored three — fetched one at a time,
               skipping what is already there, so the first open is not slowed and the second
               open is served from disk in full, online or not
     fetch     same-origin GET only: modules and vendored files cache-first by exact URL (the
               query is the version), data and images cache-first ignoring the query, the page
               network-first with the cache as the offline fallback
   The cache is named by the build stamps world-nav.html registers with (?v=), so a new build is a
   new cache and nothing stale survives a deploy. */
const P = new URL(self.location.href).searchParams;
const VERSION = P.get('v') || 'dev';
const MODV = P.get('m') || '';                    // the ?v= value the page used for its modules
const CACHE = 'w2h-world-' + VERSION;

const MODULES = ['w2h-city.js', 'w2h-world.js', 'w2h-props.js', 'w2h-basemap.js', 'w2h-districts.js', 'w2h-beach-masks.js'];
const STATIC_MODULES = ['w2h-terminal-a.js', 'area-rail.js'];   // imported without a version; keyed by exact URL, refetched with every new build
const ISLANDS = ['corniche', 'maryah', 'reem', 'saadiyat', 'yas', 'raha', 'zayed', 'masdar', 'airport'];
const DATA = ['data/index.json', 'data/venues.ndjson', 'data/shopfronts.json', 'data/terminal-a.json',
  /* The bakes (nav v256, every island since v257): what each island is built from, so they are
     the first things a warm cache should hold. */
  ...ISLANDS.flatMap(i => [`data/stock-${i}.json`, `data/stock-${i}.bin`, `data/ground-${i}-p.webp`, `data/ground-${i}-d.webp`]),
  ...ISLANDS.flatMap(i => [`data/isle-${i}.json`, `data/roads-${i}.json`, `data/fp-${i}.json`])];
const SHEETS = ['Hero-morning.webp', 'Hero-afternoon.webp', 'Hero-night.webp', 'Hero-pano-day.webp', 'Hero-pano-night.webp', 'Hero-pano-sunset.webp', 'Hero-skyline.webp'];
const PAGE = 'world-nav.html';

const IS_CODE = /\.js$/i;
const IS_ASSET = /\.(json|ndjson|webp|png|jpg|bin)$/i;

const modUrl = m => m + (MODV ? '?v=' + MODV : '');

async function addMissing(cache, urls) {
  for (const u of urls) {
    try {
      const req = new Request(u, { cache: 'no-cache' });
      if (await cache.match(req, { ignoreSearch: !IS_CODE.test(new URL(u, self.location.href).pathname) })) continue;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res);
    } catch { /* one missing file must not stop the rest */ }
  }
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await addMissing(c, [PAGE, ...MODULES.map(modUrl), ...STATIC_MODULES]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('w2h-world-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function warm() {
  const c = await caches.open(CACHE);
  let vendor = [];
  try { const r = await fetch('vendor/three/FILES.json', { cache: 'no-cache' }); if (r.ok) vendor = (await r.json()).files.map(f => 'vendor/three/' + f); } catch {}
  await addMissing(c, [...DATA, ...SHEETS, ...vendor]);
}
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'warm') e.waitUntil(warm());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.endsWith('/' + PAGE)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()).catch(() => {}); return res; }
      catch { return (await c.match(req, { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }
  const code = IS_CODE.test(path);
  if (!code && !IS_ASSET.test(path)) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: !code });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  }));
});
