/* PASTE TARGET: where2hang-hero-lab/bench/preview.mjs
 *
 * Renders one landmark from three angles so its shape can be JUDGED rather than inferred.
 *
 *   cd bench && npm i three && node preview.mjs ../landmarks/lm-ferrari-world.js
 *
 * WHY THIS EXISTS. Ferrari World passed every numeric check that was written for it — span 202 m,
 * peak 27 m, 7.6:1, five points, longest 1.53x the shortest, no NaN vertices — and still came out
 * a starfish. Span, ratio and point count do not describe a shape. Only looking at it does.
 *
 * The landmark file must export `build(THREE)` returning a Group with its base at y = 0.
 */
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { render } from './render.mjs';

const target = process.argv[2];
if (!target){ console.error('usage: node preview.mjs <landmark-file.js>'); process.exit(1); }

const mod = await import(path.resolve(target));
const build = mod.build || mod.default;
if (typeof build !== 'function'){ console.error('file must export build(THREE)'); process.exit(1); }

const g = build(THREE);
const name = path.basename(target).replace(/\.m?js$/, '');

/* Three angles, and each answers a different question.
     plan     is the shape right?
     oblique  does it have mass, or is it a sheet?
     horizon  does it read at distance, which is where a landmark earns its cost? */
const views = [
  ['plan',    { az: 42, el: 62 }],
  ['oblique', { az: 34, el: 28 }],
  ['horizon', { az: 20, el:  8 }],
];
for (const [tag, opt] of views){
  fs.writeFileSync(`${name}-${tag}.png`, render(g, opt));
  console.log(`  ${name}-${tag}.png`);
}

const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3());
const M = 7.8;   // the scene's one scale constant
console.log(`\n  span ${s.x.toFixed(1)} x ${s.z.toFixed(1)} u  = ${(s.x*M).toFixed(0)} x ${(s.z*M).toFixed(0)} m`);
console.log(`  height ${s.y.toFixed(1)} u = ${(s.y*M).toFixed(0)} m   ratio ${(Math.max(s.x,s.z)/s.y).toFixed(1)}:1`);
console.log(`  FOOT = { w:${s.x.toFixed(1)}, d:${s.z.toFixed(1)} }   // for KIT_ZONES`);
