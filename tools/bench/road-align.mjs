/* DO THE BUILDINGS SIT ON THE STREETS?

   The owner's report was "on Raha roads and buildings not aligning", and Al Raha is the island
   re-baked most recently, so the first job is to find out whether that is a real, measurable
   offset or a look. Buildings come from Overture and roads from OpenStreetMap — two different
   surveys — so they can disagree without anything in this repository being wrong, and the only way
   to tell a source disagreement from a transform bug is to measure every island the same way and
   compare. A transform bug hits one island; a source disagreement hits all of them about equally.

   The measure is the distance from each building's centre to the nearest road centreline, in real
   metres. It is never zero: a building stands back from the kerb. What matters is the SHAPE of the
   distribution — a median around fifteen to thirty metres is a normal street setback, and a median
   that is much larger on one island, or a long tail that island alone has, is the signature of
   geometry that has been shifted.

   Usage: node tools/bench/road-align.mjs [island ...] */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const ISLES = process.argv.length > 2
  ? process.argv.slice(2)
  : ['corniche', 'maryah', 'reem', 'saadiyat', 'yas', 'raha'];

function segDist(p, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], wx = p[0] - a[0], wy = p[1] - a[1];
  const L = vx * vx + vy * vy;
  let t = L ? (wx * vx + wy * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

console.log('building centre to nearest road centreline, real metres\n');
console.log('island      buildings   roads    p25    p50    p75    p90    max   >150m   directional bias');

for (const id of ISLES) {
  const fp = JSON.parse(fs.readFileSync(`${ROOT}/data/fp-${id}.json`, 'utf8')).buildings;
  const rd = JSON.parse(fs.readFileSync(`${ROOT}/data/roads-${id}.json`, 'utf8'));
  const segs = [];
  for (const r of (rd.roads || [])) {
    const pts = r.pts || [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1]]);
  }
  if (!segs.length) { console.log(`${id.padEnd(11)} no road segments`); continue; }

  /* A grid over the segments, so each building looks at its own neighbourhood rather than at
     every road on a nineteen-kilometre island. */
  const CELL = 200, grid = new Map();
  segs.forEach((s, i) => {
    const x0 = Math.min(s[0][0], s[1][0]), x1 = Math.max(s[0][0], s[1][0]);
    const y0 = Math.min(s[0][1], s[1][1]), y1 = Math.max(s[0][1], s[1][1]);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) {
        const k = `${cx},${cy}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  });

  const ds = [], vx = [], vy = [];
  for (const b of fp) {
    const p = [b.x, b.y];
    let best = Infinity, bx = 0, by = 0;
    for (let rad = 0; rad <= 6 && !(best < rad * CELL); rad++) {
      const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
      for (let i = cx - rad; i <= cx + rad; i++) for (let j = cy - rad; j <= cy + rad; j++) {
        if (rad && Math.max(Math.abs(i - cx), Math.abs(j - cy)) !== rad) continue;
        for (const k of (grid.get(`${i},${j}`) || [])) {
          const a = segs[k][0], c = segs[k][1];
          const ax = c[0] - a[0], ay = c[1] - a[1];
          const L = ax * ax + ay * ay;
          let t = L ? ((p[0] - a[0]) * ax + (p[1] - a[1]) * ay) / L : 0;
          t = Math.max(0, Math.min(1, t));
          const qx = a[0] + t * ax, qy = a[1] + t * ay;
          const d = Math.hypot(p[0] - qx, p[1] - qy);
          if (d < best) { best = d; bx = p[0] - qx; by = p[1] - qy; }
        }
      }
    }
    if (isFinite(best)) { ds.push(best); vx.push(bx); vy.push(by); }
  }
  ds.sort((a, b) => a - b);
  const q = f => Math.round(ds[Math.min(ds.length - 1, Math.floor(ds.length * f))]);
  const far = ds.filter(d => d > 150).length;
  /* THE DECISIVE TEST. A building stands back from its street in a direction that depends on which
     side of the street it is on, so across a whole island those offset vectors should cancel: the
     mean lands near zero and the ratio below stays small. A displaced island cannot cancel — every
     building is pushed the same way, the mean grows towards the median distance, and the ratio
     approaches one. This is the same argument the venue bearing test used, and for the same
     reason: an offset has a direction and a setback does not. */
  const mx = vx.reduce((a, b) => a + b, 0) / vx.length;
  const my = vy.reduce((a, b) => a + b, 0) / vy.length;
  const meanLen = Math.hypot(mx, my);
  const ratio = meanLen / (ds.reduce((a, b) => a + b, 0) / ds.length);
  console.log(`${id.padEnd(11)} ${String(fp.length).padStart(8)} ${String(segs.length).padStart(7)} ` +
    `${String(q(0.25)).padStart(6)} ${String(q(0.50)).padStart(6)} ${String(q(0.75)).padStart(6)} ` +
    `${String(q(0.90)).padStart(6)} ${String(Math.round(ds[ds.length - 1])).padStart(6)} ` +
    `${String((far / ds.length * 100).toFixed(1) + '%').padStart(6)}` +
    `   mean offset ${meanLen.toFixed(1).padStart(6)} m towards ` +
    `${String(Math.round(Math.atan2(mx, my) * 180 / Math.PI)).padStart(4)} deg, directionality ${ratio.toFixed(3)}`);
}
