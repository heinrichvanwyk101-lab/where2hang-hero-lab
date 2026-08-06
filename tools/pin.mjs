#!/usr/bin/env node
/* PIN — lat/lon from a dropped pin, straight to island coordinates.

   WHY THIS EXISTS. A whole session went into a pool that was the right size and the wrong place,
   twice, because the conversion was done by hand each time and got the same thing wrong each time:
   ISLAND UNITS ARE NOT METRES. They are metres divided by M_PER_UNIT, which is 7.8. A 24 m offset
   is 3.1 units. Applied as 24 it moves a building 187 m and puts it in the sea, which is exactly
   what happened.

   The transform is not a guess and never was — it is sitting in data/index.json. Every island
   carries extent.cx / extent.cy, and:

     island x =  (bake x - cx) / M_PER_UNIT
     island z = -(bake y - cy) / M_PER_UNIT        z is negated; island z runs opposite to bake y

   and bake metres come off the shared origin in index.json:

     bake x = (lon - originLon) * 111320 * cos(originLat)
     bake y = (lat - originLat) * 110574

   USAGE
     node tools/pin.mjs yas 24.458751 54.601365              one pin
     node tools/pin.mjs yas 24.4587,54.6013 24.4589,54.6011  several, plus their bounding box
     node tools/pin.mjs --test                               the self-test, which is the point

   THE SELF-TEST IS THE POINT. It converts the Hilton's centre and checks it lands on the literal
   already in w2h-world.js. If someone changes M_PER_UNIT, re-bakes with a different origin, or
   moves an island, this fails loudly instead of quietly producing plausible wrong numbers — which
   is the failure mode that cost the session. Run it before trusting any output. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const IDX = JSON.parse(readFileSync(join(HERE, '..', 'data', 'index.json'), 'utf8'));
const M_PER_UNIT = 7.8;          // must match w2h-world.js:1255

const isle = id => {
  const d = IDX.islands.find(i => i.id === id);
  if (!d) throw new Error(`no island "${id}" — have: ${IDX.islands.map(i => i.id).join(', ')}`);
  return d;
};

export function llToBake(lat, lon){
  const o = IDX.origin;
  return { x: (lon - o.lon) * 111320 * Math.cos(o.lat * Math.PI / 180),
           y: (lat - o.lat) * 110574 };
}

export function bakeToIsland(id, bx, by){
  const e = isle(id).extent;
  return { x: (bx - e.cx) / M_PER_UNIT, z: -(by - e.cy) / M_PER_UNIT };
}

export function pin(id, lat, lon){
  const b = llToBake(lat, lon);
  const i = bakeToIsland(id, b.x, b.y);
  return { bakeX:b.x, bakeY:b.y, x:i.x, z:i.z };
}

/* Metres, for anything that wants a size rather than a position. Sizes do NOT get divided:
   the ground-feature pool loop takes w and h in metres and divides internally. Positions do.
   Getting those two the same way round is the other half of the same mistake. */
export const unitsToM = u => u * M_PER_UNIT;
export const mToUnits = m => m / M_PER_UNIT;

function selfTest(){
  const cases = [
    /* The Hilton, whose island literal is in w2h-world.js and was fitted from eight surveyed
       points. If this drifts, the transform or the bake has changed under us. */
    { name:'Hilton Yas Bay centre', id:'yas', bake:[18353.4, -3428.1], want:[-23.7, 388.7] },
  ];
  let bad = 0;
  for (const c of cases){
    const got = bakeToIsland(c.id, c.bake[0], c.bake[1]);
    const dx = Math.abs(got.x - c.want[0]), dz = Math.abs(got.z - c.want[1]);
    const ok = dx < 0.05 && dz < 0.05;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
    console.log(`      bake ${c.bake}  ->  island ${got.x.toFixed(1)}, ${got.z.toFixed(1)}` +
                `   want ${c.want}`);
  }
  console.log(bad ? `\n${bad} FAILED — do not trust conversions until this passes`
                  : '\nall pass');
  process.exit(bad ? 1 : 0);
}

const argv = process.argv.slice(2);
if (argv[0] === '--test' || argv[0] === '-t') selfTest();
else if (argv.length < 2){
  console.log('usage: node tools/pin.mjs <island> <lat> <lon> [lat,lon ...]');
  console.log('       node tools/pin.mjs --test');
  process.exit(1);
} else {
  const id = argv[0];
  const rest = argv.slice(1);
  /* Accept both "lat lon" and "lat,lon", because a pin copied off Google Maps arrives comma-
     separated and retyping it is one more chance to transpose a digit. */
  const pairs = [];
  const flat = rest.join(' ').split(/[\s]+/).filter(Boolean);
  for (const tok of flat){
    if (tok.includes(',')){ const [a, b] = tok.split(','); pairs.push([+a, +b]); }
    else pairs.push(tok);
  }
  const pts = [];
  for (let i = 0; i < pairs.length; i++){
    if (Array.isArray(pairs[i])) pts.push(pairs[i]);
    else { pts.push([+pairs[i], +pairs[i + 1]]); i++; }
  }
  console.log(`island ${id}   M_PER_UNIT ${M_PER_UNIT}\n`);
  const out = pts.map(([la, lo]) => ({ la, lo, ...pin(id, la, lo) }));
  for (const p of out){
    console.log(`  ${p.la},${p.lo}   bake ${p.bakeX.toFixed(1)}, ${p.bakeY.toFixed(1)}` +
                `   island ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
  }
  if (out.length > 1){
    const xs = out.map(p => p.x), zs = out.map(p => p.z);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const z0 = Math.min(...zs), z1 = Math.max(...zs);
    console.log(`\n  centre  island ${((x0 + x1) / 2).toFixed(2)}, ${((z0 + z1) / 2).toFixed(2)}`);
    console.log(`  size    ${unitsToM(x1 - x0).toFixed(1)} x ${unitsToM(z1 - z0).toFixed(1)} m` +
                `   (${(x1 - x0).toFixed(2)} x ${(z1 - z0).toFixed(2)} units)`);
    console.log('\n  NOTE sizes are quoted in METRES and positions in UNITS, because that is what');
    console.log('       the ground-feature pool loop takes: w/h in metres, px/pz in units.');
  }
}
