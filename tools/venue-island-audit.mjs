/* DOES EACH VENUE'S COORDINATE ACTUALLY LIE ON THE ISLAND ITS AREA LABEL CLAIMS?

   Not a spread heuristic — a hard containment test against the same baked outlines the world's own
   locateReal uses. If a venue filed under "mamsha" is not inside Saadiyat's outline, then either
   its coordinate is wrong or its area is, and either way the world will fly somewhere the card
   does not describe. */
import fs from 'node:fs';

const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [ (lo - LON0) * Math.PI / 180 * R * K, (la - LAT0) * Math.PI / 180 * R ];
const inside = (rg, p) => { let c = false;
  for (let i = 0, j = rg.length - 1; i < rg.length; j = i++){ const a = rg[i], b = rg[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]) + a[0]) c = !c; }
  return c; };
/* Distance to the nearest edge, so "just offshore by 40 m" is not reported as "wrong island". */
const distTo = (rg, px, py) => { let best = Infinity;
  for (let i = 0, j = rg.length - 1; i < rg.length; j = i++){
    const ax = rg[j][0], ay = rg[j][1], dx = rg[i][0]-ax, dy = rg[i][1]-ay;
    const L2 = dx*dx + dy*dy; let t = L2 > 0 ? ((px-ax)*dx + (py-ay)*dy)/L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t*dx - px, qy = ay + t*dy - py;
    best = Math.min(best, Math.hypot(qx, qy)); }
  return best; };

const AREAS = { corniche:['corniche','khalidiyah','albateen','downtown','alzahiya','mangroves'],
  maryah:['almaryah'], reem:['alreem'], saadiyat:['saadiyat','mamsha'],
  yas:['yasmerina','yasbay'], raha:['alraha'], zayed:['rabdan','khalifacity'],
  masdar:['masdar'], airport:['almatar'] };
const areaToIsland = {};
for (const [isle, list] of Object.entries(AREAS)) for (const a of list) areaToIsland[a] = isle;

const rings = {};
for (const id of Object.keys(AREAS)){
  const j = JSON.parse(fs.readFileSync(`data/isle-${id}.json`, 'utf8'));
  rings[id] = Array.isArray(j.outline[0][0]) ? j.outline : [j.outline];
}

const raw = fs.readFileSync(process.argv[2], 'utf8');
const start = raw.indexOf('['), end = raw.lastIndexOf(']');
const rows = JSON.parse(raw.slice(start, end + 1));
console.log(`venues examined: ${rows.length}\n`);

const byArea = {};
const offenders = [];
for (const v of rows){
  const isle = areaToIsland[v.area_clean];
  if (!isle) continue;
  const P = fwd(Number(v.lat), Number(v.lng));
  const on = rings[isle].some(r => inside(r, P));
  const off = on ? 0 : Math.round(Math.min(...rings[isle].map(r => distTo(r, P[0], P[1]))));
  byArea[v.area_clean] = byArea[v.area_clean] || { n:0, bad:0, isle };
  byArea[v.area_clean].n++;
  if (!on && off > 150){ byArea[v.area_clean].bad++; offenders.push({ ...v, isle, off }); }
}
console.log('area            island      venues   off-island (>150 m)   worst');
for (const [a, s] of Object.entries(byArea).sort((x,y)=>y[1].bad-x[1].bad)){
  const worst = offenders.filter(o=>o.area_clean===a).sort((p,q)=>q.off-p.off)[0];
  console.log('  ' + a.padEnd(14) + s.isle.padEnd(11) + String(s.n).padStart(6) +
    String(s.bad).padStart(16) + (s.bad ? `   ${(worst.off/1000).toFixed(1)} km` : ''));
}
console.log(`\nTOTAL off their own island by more than 150 m: ${offenders.length} of ${rows.length}`);
console.log('\nfurthest 15:');
for (const o of offenders.sort((a,b)=>b.off-a.off).slice(0,15))
  console.log(`  ${String(o.off/1000).padStart(6)} km  ${o.area_clean.padEnd(12)} ${String(o.name).slice(0,44)}`);
