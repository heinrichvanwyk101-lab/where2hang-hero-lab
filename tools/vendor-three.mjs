// SELF-HOST THREE (11 Sep 2026). The world imported three from jsdelivr, so every cold load paid a
// second origin's connect and the service worker could not own the files. This copies the exact
// closure the world imports — three.module.js and the addons it uses, plus everything those
// import — from an npm tarball into vendor/three/, so the world is one origin, one cache, and
// installs whole on a phone (sw.js). Run: node tools/vendor-three.mjs path/to/three-0.169.0.tgz
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execSync } from 'node:child_process';
const tgz = process.argv[2]; if (!tgz) { console.error('usage: node tools/vendor-three.mjs three-<ver>.tgz'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-')); execSync(`tar -xzf ${JSON.stringify(tgz)} -C ${tmp}`);
const PKG = path.join(tmp, 'package'); const OUT = path.resolve('vendor/three');
const ENTRIES = ['build/three.module.js', 'examples/jsm/postprocessing/EffectComposer.js', 'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/ShaderPass.js', 'examples/jsm/postprocessing/UnrealBloomPass.js', 'examples/jsm/postprocessing/SMAAPass.js',
  'examples/jsm/postprocessing/OutputPass.js', 'examples/jsm/utils/BufferGeometryUtils.js'];
const seen = new Set(); const queue = [...ENTRIES];
while (queue.length) {
  const rel = queue.shift(); if (seen.has(rel)) continue; seen.add(rel);
  const src = fs.readFileSync(path.join(PKG, rel), 'utf8');
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1] || m[2] || m[3]; if (!spec || spec === 'three') continue;
    if (spec.startsWith('three/addons/')) { queue.push('examples/jsm/' + spec.slice('three/addons/'.length)); continue; }
    if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)));
  }
}
fs.rmSync(OUT, { recursive: true, force: true });
for (const rel of seen) { const dst = path.join(OUT, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(PKG, rel), dst); }
const ver = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(OUT, 'FILES.json'), JSON.stringify({ version: ver, files: [...seen].sort() }, null, 1) + '\n');
console.log(`three ${ver}: ${seen.size} files → vendor/three/`); for (const f of [...seen].sort()) console.log('  ' + f);
