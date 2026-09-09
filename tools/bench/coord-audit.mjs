/* IS A VENUE'S COORDINATE WRONG, OR IS THE MODEL PUTTING IT IN THE WRONG PLACE?

   The owner's suspicion was the second one: "you changed the land bakes during our reshuffle,
   so I suspect this is a translation issue." It is worth being able to answer that question
   from the repository instead of by argument, so this is the check.

   A TRANSLATION FAULT AND A BAD RECORD LOOK COMPLETELY DIFFERENT UNDER MEASUREMENT. If the
   lat/lng -> emirate-metres -> island-local chain were off, every venue on an island would be
   displaced by the SAME vector: the beachfront ones would all sit the same distance inland, at
   the same bearing. A single mistyped coordinate displaces one venue, in its own direction, by
   its own amount. So this prints distance AND bearing to the modelled coast for every venue whose
   name says it is on the water. Clustered bearings mean the transform; scattered ones mean data.

   It also lists venues that carry a hand-entered coordinate (data_source seed/owner, or fewer
   than five decimal places — 4 dp is about 11 m, which no geocoder emits) alongside their
   distance to the nearest baked footprint, because that is the population where bad records live.
   A replacement usually already exists in the table: the harvesters (overture, xmap) write the
   same place a second time with a Google place id and a street address, and those records are
   right. Correcting one is then a lookup, not a guess.

   Usage: node tools/bench/coord-audit.mjs <venues.json>
     where venues.json is [{ id, name, lat, lng, area_clean, data_source }, ...] straight out of
     the venues table. */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [(lo - LON0) * Math.PI / 180 * R * K, (la - LAT0) * Math.PI / 180 * R];

/* The same area -> island mapping the world uses. Areas absent here have no modelled land, and a
   venue in one of them is expected to keep a city view rather than a zoom — not an error. */
const AREA = {
  corniche: ['downtown', 'khalidiyah', 'alzahiya', 'albateen', 'corniche'],
  maryah: ['almaryah'], reem: ['alreem'], saadiyat: ['saadiyat', 'mamsha'],
  yas: ['yasmerina', 'yasbay'], raha: ['alraha'],
};
const A2I = {};
for (const [isle, areas] of Object.entries(AREA)) for (const a of areas) A2I[a] = isle;

/* Islands with more than one landmass store outline as an array of rings; the rest store one flat
   point list. Flatten to a list of rings either way so the distance loop does not care. */
function rings(id) {
  const o = JSON.parse(fs.readFileSync(`${ROOT}/data/isle-${id}.json`, 'utf8')).outline;
  return Array.isArray(o[0][0]) ? o : [o];
}
function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const L = vx * vx + vy * vy;
  let t = L ? (wx * vx + wy * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * vx, cy = a[1] + t * vy;
  return [Math.hypot(p[0] - cx, p[1] - cy), cx, cy];
}
function toCoast(p, rs) {
  let best = Infinity, bx = 0, by = 0;
  for (const r of rs) for (let i = 0; i < r.length; i++) {
    const [d, x, y] = segDist(p, r[i], r[(i + 1) % r.length]);
    if (d < best) { best = d; bx = x; by = y; }
  }
  // Bearing from the venue towards the nearest water, degrees clockwise from north.
  return [best, Math.round(Math.atan2(bx - p[0], by - p[1]) * 180 / Math.PI)];
}

const ISLES = Object.keys(AREA);
const RING = {}, FP = {};
for (const id of ISLES) {
  RING[id] = rings(id);
  FP[id] = JSON.parse(fs.readFileSync(`${ROOT}/data/fp-${id}.json`, 'utf8')).buildings.map(b => [b.x, b.y]);
}

const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const venues = (Array.isArray(raw) ? raw : raw.venues).filter(v => A2I[v.area_clean]);
const dp = s => { const t = String(s), i = t.indexOf('.'); return i < 0 ? 0 : t.length - i - 1; };

const rows = venues.map(v => {
  const isle = A2I[v.area_clean], p = fwd(Number(v.lat), Number(v.lng));
  const [coast, bear] = toCoast(p, RING[isle]);
  let fp = Infinity;
  for (const q of FP[isle]) fp = Math.min(fp, Math.hypot(p[0] - q[0], p[1] - q[1]));
  return {
    id: v.id, name: v.name, isle, src: v.data_source || '?',
    coast: Math.round(coast), bear, fp: Math.round(fp),
    hand: ['seed', 'owner'].includes(v.data_source) || Math.min(dp(v.lat), dp(v.lng)) <= 4,
  };
});

console.log(`${rows.length} venues on the six modelled islands\n`);

console.log('=== WATERFRONT BEARINGS — the translation test ===');
console.log('A broken transform displaces every venue the same way. Scattered bearings rule it out.');
for (const isle of ISLES) {
  const w = rows.filter(r => r.isle === isle && /beach|marina|waterfront|corniche|promenade/i.test(r.name));
  if (w.length < 4) continue;
  const ds = w.map(r => r.coast).sort((a, b) => a - b);
  const bs = new Set(w.map(r => Math.round(r.bear / 45) * 45));
  console.log(`  ${isle.padEnd(9)} n=${String(w.length).padStart(3)}  coast dist ${ds[0]}-${ds[ds.length - 1]} m ` +
    `(median ${ds[ds.length >> 1]} m)  ${bs.size} distinct bearing octants` +
    (bs.size <= 2 ? '  <-- CHECK: bearings agree, could be a transform offset' : ''));
}

console.log('\n=== HAND-ENTERED COORDINATES, furthest from any modelled building ===');
console.log('These are where bad records live. A harvested duplicate of the same venue, if the');
console.log('table has one, is the replacement — it carries a place id and a street address.');
const hand = rows.filter(r => r.hand).sort((a, b) => b.fp - a.fp);
console.log(`  ${hand.length} hand-entered of ${rows.length}; ${hand.filter(r => r.fp > 150).length} over 150 m from a footprint`);
for (const r of hand.filter(r => r.fp > 150)) {
  console.log(`  ${String(r.fp).padStart(5)}m to bldg  ${String(r.coast).padStart(5)}m to coast  #${String(r.id).padEnd(6)} ${r.src.padEnd(6)} ${r.isle.padEnd(9)} ${r.name}`);
}

console.log('\n=== NAMED FOR THE WATER BUT SITTING INLAND ===');
const inland = rows.filter(r => /beach|marina|waterfront/i.test(r.name) && r.coast > 500)
  .sort((a, b) => b.coast - a.coast);
for (const r of inland) {
  console.log(`  ${String(r.coast).padStart(5)}m inland  #${String(r.id).padEnd(6)} ${r.src.padEnd(6)} ${r.isle.padEnd(9)} ${r.name}`);
}
