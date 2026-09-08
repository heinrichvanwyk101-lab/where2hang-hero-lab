/* Regenerates tools/island-move-data.json, which is inlined into tools/island-move.html.
   Run after a re-bake:  node tools/island-move-data.mjs   then paste the JSON over the
   `const DATA = {...}` literal at the top of island-move.html's script block.

   Builds the blob straight out of the SAME sources the world uses:
   data/index.json for the outlines and extents, w2h-basemap.js for M_PER_UNIT, damping() and
   the live DIORAMA table. Nothing here is re-typed by hand, so the tool cannot drift from the
   model it is previewing. */
import fs from 'node:fs';
import { M_PER_UNIT, DAMP_P, SCALE_CAP, damping, reference, islandOrigin, DIORAMA } from '../w2h-basemap.js';

const idx = JSON.parse(fs.readFileSync(new URL('../data/index.json', import.meta.url), 'utf8'));
const m2u = m => m / M_PER_UNIT;
const ringsOf = o => (!o || !o.length) ? [] : (Array.isArray(o[0][0]) ? o : [o]);

const NAMES = { corniche:'Corniche', maryah:'Al Maryah', reem:'Al Reem',
                saadiyat:'Saadiyat', yas:'Yas', raha:'Al Raha' };

// The damping table at every p the tool offers, so the browser never re-implements the formula.
const PS = [];
for (let p = 0.30; p <= 0.9001; p += 0.01) PS.push(Math.round(p * 100) / 100);
const dampByP = {};
for (const p of PS) dampByP[p.toFixed(2)] = damping(idx, p);

const decim = (ring, cap) => {
  if (ring.length <= cap) return ring;
  const step = Math.ceil(ring.length / cap);
  const out = [];
  for (let i = 0; i < ring.length; i += step) out.push(ring[i]);
  return out;
};
const r1 = ([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10];

const islands = [];
for (const e of idx.islands || []) {
  if (!e.extent) continue;
  const [ox, oy] = islandOrigin(e);
  // Island-local scene units, exactly outlineUnits(): +x east, north flipped to -z.
  const rings = ringsOf(e.outline).map(r => r.map(([x, y]) => r1([m2u(x - ox), -m2u(y - oy)])));
  islands.push({
    id: e.id,
    name: NAMES[e.id] || e.id,
    extent: { cx: e.extent.cx, cy: e.extent.cy, w: e.extent.w, d: e.extent.d },
    spanM: Math.max(e.extent.w, e.extent.d),
    // True position of the island centre in scene units, north-negative — transform()'s trueP.
    truePos: r1([m2u(ox), -m2u(oy)]),
    current: DIORAMA[e.id] || [0, 0],
    rings,
    coarse: rings.map(r => decim(r, 220)),
  });
}

const out = {
  M_PER_UNIT, DAMP_P, SCALE_CAP,
  referenceId: reference(idx).id,
  dampByP,
  islands,
  generated: new Date().toISOString().slice(0, 10),
};
const OUT = new URL('island-move-data.json', import.meta.url);
fs.writeFileSync(OUT, JSON.stringify(out));
const n = islands.reduce((a, i) => a + i.rings.reduce((b, r) => b + r.length, 0), 0);
console.log('islands', islands.length, 'outline points', n,
            'size', (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');
console.log('reference', out.referenceId, 'damping@1/3', JSON.stringify(dampByP['0.33']));
