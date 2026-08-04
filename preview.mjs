/* PASTE TARGET: where2hang-hero-lab/preview.mjs
 *
 * Renders one landmark from three angles so its shape can be JUDGED rather than inferred.
 *
 *   npm i three
 *   node preview.mjs w2h-city.js#ferrariWorld        <- render what actually ships
 *   node preview.mjs landmarks/lm-emirates-palace.js <- render a standalone landmark file
 *
 * WHY THIS EXISTS. Ferrari World passed every numeric check that was written for it — span,
 * peak, ratio, point count, longest-to-shortest, no NaN vertices — and still came out a
 * starfish. Then it turned out the reference it was built to said "five-point star" and the real
 * building has three. Neither fault was reachable by arithmetic. Span, ratio and point count do
 * not describe a shape; only looking at it does.
 *
 * THE `file#fn` FORM IS THE IMPORTANT ONE. It lifts a named builder out of w2h-city.js and
 * renders it directly, so the bench tests the code that ships instead of a copy of it. A
 * standalone landmarks/ file is a second place the dimensions live, and this repo has been bitten
 * by that four times — anchors, GROUND, road widths, KIT_ZONES. Until the landmark registry
 * lands, prefer the `#` form and keep one copy.
 *
 * A standalone file must export `build(THREE)` returning a Group with its base at y = 0.
 */
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { render } from './render.mjs';

const target = process.argv[2];
if (!target){
  console.error('usage: node preview.mjs <file.js|file.js#functionName>');
  process.exit(1);
}

let build, name;

if (target.includes('#')){
  /* Lift `function NAME(x0, z0){ ... }` out of a module that is not importable on its own —
     w2h-city.js expects a THREE it is given, and pulls in browser-only things at module scope. */
  const [file, fn] = target.split('#');
  const src = fs.readFileSync(path.resolve(file), 'utf8');
  const open = `function ${fn}(`;
  const i = src.indexOf(open);
  if (i < 0){ console.error(`no function ${fn} in ${file}`); process.exit(1); }
  const argEnd = src.indexOf('{', i);
  const end = src.indexOf('\n}\n', argEnd);
  if (end < 0){ console.error(`could not find the end of ${fn} — is it at top level?`); process.exit(1); }
  const body = src.slice(argEnd + 1, end);
  /* `facing` is declared too, and undefined on purpose. Every kit builder that takes it guards
     with `if (facing !== undefined)`, so the bench gets the unrotated form — which is the one
     worth judging. Without the declaration the guard itself throws on a bare ReferenceError and
     the function cannot be benched at all. */
  build = new Function('THREE', `const x0 = 0, z0 = 0, facing = undefined;\n${body}\n`);
  name = fn;
} else {
  const mod = await import(path.resolve(target));
  build = mod.build || mod.default;
  if (typeof build !== 'function'){ console.error('file must export build(THREE)'); process.exit(1); }
  name = path.basename(target).replace(/\.m?js$/, '');
}

const g = build(THREE);

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
