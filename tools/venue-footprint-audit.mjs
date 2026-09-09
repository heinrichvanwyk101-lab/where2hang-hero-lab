/* IS EACH VENUE'S COORDINATE ACTUALLY ON A BUILDING?

   The owner's invariant, stated plainly: "Venues each with real coordinates. Those coordinates are
   transposed to model and should be exactly where we have footprints and or hand built venues."

   An earlier audit tested whether a venue's coordinate fell inside the OUTLINE of the island its
   area claims. That test is far too coarse to be worth running: Saadiyat is nine kilometres
   across, so Saadiyat Beach Club passed it while sitting 1,305 m from the coastline, 1,154 m from
   the nearest beach and 241 m from the nearest building — a beach club stored a kilometre inland.
   Containment says "somewhere on this island". The question is "on which building".

   So this measures the distance from every venue to the nearest baked footprint. A venue that is
   hundreds of metres from any building is not somewhere the camera can meaningfully fly, whatever
   its area label says. */
import fs from 'node:fs';

const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [ (lo - LON0) * Math.PI / 180 * R * K, (la - LAT0) * Math.PI / 180 * R ];

const AREAS = { corniche:['corniche','khalidiyah','albateen','downtown','alzahiya','mangroves'],
  maryah:['almaryah'], reem:['alreem'], saadiyat:['saadiyat','mamsha'],
  yas:['yasmerina','yasbay'], raha:['alraha'], zayed:['rabdan','khalifacity'],
  masdar:['masdar'], airport:['almatar'] };
const areaToIsland = {};
for (const [i, l] of Object.entries(AREAS)) for (const a of l) areaToIsland[a] = i;

/* Every footprint from every island, in one flat list with a coarse grid index — 6,500 venues
   against 34,000 buildings is 220 million pair tests brute force, and a 250 m cell makes it a
   handful per venue. */
const CELL = 250, grid = new Map();
let nFp = 0;
for (const id of Object.keys(AREAS)){
  const f = `data/fp-${id}.json`;
  if (!fs.existsSync(f)) continue;
  for (const b of JSON.parse(fs.readFileSync(f, 'utf8')).buildings || []){
    const k = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(b); nFp++;
  }
}
const nearest = (px, py) => {
  let best = Infinity, bb = null;
  const gx = Math.floor(px / CELL), gy = Math.floor(py / CELL);
  for (let r = 1; r <= 8; r++){
    for (let i = gx - r; i <= gx + r; i++) for (let k = gy - r; k <= gy + r; k++){
      const cell = grid.get(`${i},${k}`); if (!cell) continue;
      for (const b of cell){ const d = Math.hypot(b.x - px, b.y - py); if (d < best){ best = d; bb = b; } }
    }
    if (best < r * CELL) break;      // nothing in a further ring can beat this
  }
  return { d: best, b: bb };
};

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(`${rows.length} venues against ${nFp} footprints\n`);

const BANDS = [25, 50, 100, 250, 500, 1000];
const hist = new Array(BANDS.length + 1).fill(0);
const byArea = {}, far = [];
for (const v of rows){
  if (!areaToIsland[v.area_clean]) continue;
  const P = fwd(Number(v.lat), Number(v.lng));
  const { d } = nearest(P[0], P[1]);
  let bi = BANDS.findIndex(b => d <= b); if (bi < 0) bi = BANDS.length;
  hist[bi]++;
  const a = byArea[v.area_clean] || (byArea[v.area_clean] = { n:0, far:0, sum:0 });
  a.n++; a.sum += d; if (d > 250) a.far++;
  if (d > 250) far.push({ ...v, d: Math.round(d) });
}
const tot = hist.reduce((a,b)=>a+b,0);
console.log('distance from a venue to the NEAREST footprint');
BANDS.forEach((b,i)=>console.log(`  <= ${String(b).padStart(4)} m  ${String(hist[i]).padStart(5)}  ${(hist[i]/tot*100).toFixed(1)}%`));
console.log(`   > 1000 m  ${String(hist[BANDS.length]).padStart(5)}  ${(hist[BANDS.length]/tot*100).toFixed(1)}%`);

console.log('\narea            venues   >250 m from any building   mean m');
for (const [a, s] of Object.entries(byArea).sort((x,y)=>y[1].far/y[1].n - x[1].far/x[1].n))
  console.log('  ' + a.padEnd(14) + String(s.n).padStart(6) + String(s.far).padStart(12) +
    ` (${(s.far/s.n*100).toFixed(0)}%)`.padStart(8) + String(Math.round(s.sum/s.n)).padStart(9));

console.log('\nfurthest 15 from any building:');
for (const f of far.sort((a,b)=>b.d-a.d).slice(0,15))
  console.log(`  ${String(f.d).padStart(5)} m  ${f.area_clean.padEnd(12)} ${String(f.name).slice(0,44)}`);
