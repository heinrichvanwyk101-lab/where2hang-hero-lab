/* DOES EVERY VENUE TRANSLATE TO THE RIGHT POINT?

   The narrow version of this question — "is the lat/lng -> emirate metres -> island-local chain
   intact" — is answered by coord-audit.mjs, and the answer is yes. This is the broad version the
   owner actually wants: for EVERY venue whose coordinate falls on modelled land, does the point
   the model puts it on look like somewhere that venue could be?

   The model is the reference, and it is a good one: it is baked from the same survey the
   buildings come from, so it knows where the buildings, beaches, parks, water, golf and car parks
   are. A venue that lands on a building is almost certainly right. A venue that lands 400 m from
   any building, in the middle of a golf course, or in open water, is almost certainly wrong — and
   which of those it is says something about how it went wrong.

   THIS CANNOT PROVE A COORDINATE IS RIGHT. A restaurant on the wrong building of the right block
   passes every test here. What it does is bound the problem: it separates the venues that are
   provably fine from the ones that need a real geocode, so the expensive check runs over dozens
   rather than thousands.

   Input is the compact export written by the audit query — one "id,latE5,lngE5" per line, where
   latE5 = round((lat - 24) * 1e5). Names and sources are deliberately not in it; they are fetched
   for the failures afterwards, so the bulk transfer stays small.

   ONE CLASS OF VENUE MUST NOT BE JUDGED BY ITS DISTANCE TO A BUILDING. A beach, a park, a canal,
   a bridge, a golf clubhouse out on the fairway, and the twenty-odd jet-ski operators working off
   the Al Zahiyah slipway are all exactly where they should be and none of them stands on a
   footprint. Scoring them against buildings produced eighty "errors" that were nothing of the
   kind. So the name and address decide which test applies: outdoor venues are asked only whether
   they are on or beside modelled land, indoor ones whether they are near something built.

   Usage: node tools/bench/venue-translate-audit.mjs <export.csv> <names.tsv> [--json out.json]
     names.tsv is "id<TAB>name<TAB>address<TAB>data_source<TAB>category" for the same ids. */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [(lo - LON0) * Math.PI / 180 * R * K, (la - LAT0) * Math.PI / 180 * R];
const ISLES = ['corniche', 'maryah', 'reem', 'saadiyat', 'yas', 'raha'];

/* ---------- model ---------- */
const M = {};
for (const id of ISLES) {
  const isle = JSON.parse(fs.readFileSync(`${ROOT}/data/isle-${id}.json`, 'utf8'));
  const fp = JSON.parse(fs.readFileSync(`${ROOT}/data/fp-${id}.json`, 'utf8')).buildings;
  const o = isle.outline;
  M[id] = {
    rings: Array.isArray(o[0][0]) ? o : [o],
    fp: fp.map(b => [b.x, b.y, Math.max(b.w || 0, b.d || 0) / 2]),
    // Polygon layers, each an array of closed rings. parks carry {k,a,r}; the rest are bare rings.
    parks: (isle.parks || []).map(p => p.r || p).filter(r => Array.isArray(r) && r.length > 2),
    beaches: (isle.beaches || []).filter(r => Array.isArray(r) && r.length > 2),
    water: (isle.water || []).filter(r => Array.isArray(r) && r.length > 2),
    golf: (isle.golf || []).filter(r => Array.isArray(r) && r.length > 2),
    parking: (isle.parking || []).filter(r => Array.isArray(r) && r.length > 2),
  };
  /* A uniform grid over the footprints so nearest-building is a look at nine cells rather than a
     scan of 20,000. CELL is comfortably larger than the largest radius we ever query. */
  const CELL = 250, g = new Map();
  M[id].cell = CELL; M[id].grid = g;
  M[id].fp.forEach((b, i) => {
    const k = `${Math.floor(b[0] / CELL)},${Math.floor(b[1] / CELL)}`;
    (g.get(k) || g.set(k, []).get(k)).push(i);
  });
}

function inRing(p, r) {
  let c = false;
  for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
    if ((r[i][1] > p[1]) !== (r[k][1] > p[1]) &&
        p[0] < (r[k][0] - r[i][0]) * (p[1] - r[i][1]) / (r[k][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}
const inAny = (p, rs) => rs.some(r => inRing(p, r));

function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const L = vx * vx + vy * vy;
  let t = L ? (wx * vx + wy * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}
function ringDist(p, rs) {
  let best = Infinity;
  for (const r of rs) for (let i = 0; i < r.length; i++) best = Math.min(best, segDist(p, r[i], r[(i + 1) % r.length]));
  return best;
}

/* Distance to the NEAREST BUILDING EDGE, not its centre: a venue inside a 200 m mall reads as 0,
   which is the honest answer, where centre distance would flag it as 100 m adrift. */
function toBuilding(p, m) {
  const c = Math.floor(p[0] / m.cell), d = Math.floor(p[1] / m.cell);
  let best = Infinity;
  for (let rad = 0; rad <= 4 && !(best < rad * m.cell); rad++) {
    for (let i = c - rad; i <= c + rad; i++) for (let j = d - rad; j <= d + rad; j++) {
      if (rad && Math.max(Math.abs(i - c), Math.abs(j - d)) !== rad) continue;
      for (const k of (m.grid.get(`${i},${j}`) || [])) {
        const b = m.fp[k];
        best = Math.min(best, Math.max(0, Math.hypot(p[0] - b[0], p[1] - b[1]) - b[2]));
      }
    }
  }
  return best;
}

/* ---------- venues ---------- */
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => {
  const [id, la, lo] = l.split(',');
  return { id: +id, lat: 24 + (+la) / 1e5, lng: 54 + (+lo) / 1e5 };
});

/* Venues that live outdoors by nature. Matched against name, address and category together,
   because the giveaway is as often in the address ("Yas Links", "Slipway") as in the name. */
const OUTDOOR = /\b(beach|park|garden|lake|canal|lagoon|corniche|boardwalk|promenade|island|bridge|mangrove|marina|slipway|pier|jetty|quay|harbou?r|jet ?ski|kite ?surf|kite|water ?sports?|watersports|boat|yacht|cruise|dhow|sail|diving|dive|fishing|golf|links|fairway|course|playground|pitch|court|track|field|circuit|raceway|zoo|desert|safari|camp)\b/i;
const META = new Map();
for (const line of fs.readFileSync(process.argv[3], 'utf8').trim().split('\n')) {
  const [id, name = '', address = '', src = '', cat = ''] = line.split('\t');
  META.set(+id, { name, address, src, cat, outdoor: OUTDOOR.test(`${name} ${address} ${cat}`) });
}

const out = [];
for (const v of rows) {
  const p = fwd(v.lat, v.lng);
  /* Which island is this on? The outline test decides, exactly as the world's locateReal does.
     Falling inside nothing is itself a finding, so the nearest island is recorded with it. */
  let isle = null, coast = Infinity, onLand = false;
  for (const id of ISLES) {
    const m = M[id];
    const inside = m.rings.some(r => inRing(p, r));
    const d = ringDist(p, m.rings);
    if (inside) { isle = id; coast = d; onLand = true; break; }
    if (d < coast) { isle = id; coast = d; }
  }
  const m = M[isle];
  const bld = toBuilding(p, m);
  const on = inAny(p, m.water) ? 'water'
    : inAny(p, m.beaches) ? 'beach'
    : inAny(p, m.golf) ? 'golf'
    : inAny(p, m.parking) ? 'parking'
    : inAny(p, m.parks) ? 'park'
    : bld <= 0 ? 'building' : 'open';

  /* VERDICT. A venue on or beside a building is doing what a venue does. Beaches, parks and car
     parks are legitimate hosts too — a beach club, a park kiosk, a valet stand — so those only
     fail when they are also nowhere near anything built. Open ground far from a building is the
     signal that matters, and water or golf is the strongest signal of all. */
  const meta = META.get(v.id) || { name: '', outdoor: false, src: '?' };
  let verdict, why;
  if (meta.outdoor) {
    /* An outdoor venue is asked one question only: is it on, or within a short walk of, land the
       model has built? A beach reads as 'beach' or as open ground just inland of the coast, and
       both are right. Only being properly out at sea, or far past the modelled edge, is wrong. */
    if (!onLand && coast > 400) { verdict = 'BAD'; why = `outdoor venue ${Math.round(coast)} m past the modelled coast`; }
    else if (on === 'water' && coast > 150) { verdict = 'SUSPECT'; why = `outdoor venue ${Math.round(coast)} m inside open water`; }
    else { verdict = 'OK'; why = `outdoor venue, ${on}`; }
  }
  else if (!onLand && coast > 120) { verdict = 'BAD'; why = `off modelled land by ${Math.round(coast)} m`; }
  else if (on === 'water') { verdict = 'BAD'; why = 'inside a water polygon'; }
  else if (on === 'golf' && bld > 150) { verdict = 'BAD'; why = `on the golf course, ${Math.round(bld)} m from a building`; }
  else if (bld > 400) { verdict = 'BAD'; why = `${Math.round(bld)} m from any building (${on})`; }
  else if (bld > 150) { verdict = 'SUSPECT'; why = `${Math.round(bld)} m from any building (${on})`; }
  else { verdict = 'OK'; why = on === 'building' ? 'on a building' : `${Math.round(bld)} m from a building (${on})`; }

  out.push({ id: v.id, isle, onLand, coast: Math.round(coast), bld: Math.round(bld), on,
             verdict, why, name: meta.name, src: meta.src, outdoor: meta.outdoor });
}

/* ---------- report ---------- */
const by = k => out.filter(r => r.verdict === k);
console.log(`${out.length} venues whose coordinate falls in a modelled island's bounding box\n`);
console.log('VERDICT      count   share');
for (const k of ['OK', 'SUSPECT', 'BAD']) {
  console.log(`  ${k.padEnd(9)} ${String(by(k).length).padStart(6)}  ${(by(k).length / out.length * 100).toFixed(1)}%`);
}

console.log('\nBY ISLAND        n     OK  SUSPECT    BAD');
for (const id of ISLES) {
  const s = out.filter(r => r.isle === id);
  if (!s.length) continue;
  console.log(`  ${id.padEnd(10)} ${String(s.length).padStart(5)} ${String(s.filter(r => r.verdict === 'OK').length).padStart(6)} ` +
    `${String(s.filter(r => r.verdict === 'SUSPECT').length).padStart(8)} ${String(s.filter(r => r.verdict === 'BAD').length).padStart(6)}`);
}

console.log('\nWHAT THE MODEL HAS UNDER EACH VENUE');
const layers = {};
out.forEach(r => { layers[r.on] = (layers[r.on] || 0) + 1; });
Object.entries(layers).sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log(`  ${k.padEnd(10)} ${String(n).padStart(6)}  ${(n / out.length * 100).toFixed(1)}%`));

console.log('\nOUTDOOR VENUES (beaches, parks, marinas, golf, water sports) held to the land test only');
console.log(`  ${out.filter(r => r.outdoor).length} of ${out.length}`);

console.log('\nEVERY REMAINING FAILURE');
for (const r of out.filter(x => x.verdict !== 'OK').sort((a, b) => (a.verdict < b.verdict ? -1 : 1) || b.bld - a.bld)) {
  console.log(`  ${r.verdict.padEnd(8)} #${String(r.id).padEnd(6)} ${r.isle.padEnd(9)} ${r.src.padEnd(11)} ${r.name.slice(0, 40).padEnd(41)} ${r.why}`);
}

const i = process.argv.indexOf('--json');
if (i > 0) {
  fs.writeFileSync(process.argv[i + 1], JSON.stringify(out));
  console.log(`\nfull per-venue result -> ${process.argv[i + 1]}`);
}
