/* THE WHOLE DIORAMA FROM ABOVE, LABELLED.

   WHY THIS EXISTS. The owner reports faults by circling a shape on a phone screenshot — "the red
   piece of land should not be built" — and the world view is a perspective shot of nine islands
   laid out on a composed map, so naming the circled shape is guesswork unless you have a plan of
   the layout to hold it against. Twice in one session that guesswork went the wrong way.

   Draws every baked outline at its DIORAMA position in scene units, filled per district and
   labelled, north up. It reads data/index.json only — no browser, no world build, under a second
   — so it costs nothing to check "which island is that?" before starting work on the wrong one.

   The transform is the one the basemap uses: scene = DIORAMA[id] + (metres - extent centre) over
   M_PER_UNIT, with north flipped. DAMP_P is 1, so dispScale is 1 for every island and there is no
   per-island scaling to apply; if DAMP_P ever moves off 1 this needs the damping factor too.

   Usage: node tools/bench/diorama-map.mjs [out.png] */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUT = process.argv[2] || path.join(ROOT, 'tools/bench/out/diorama-map.png');
const M_PER_UNIT = 7.8;
/* Kept in step with DIORAMA in w2h-basemap.js by hand. A drift here mislabels a shape, which is
   the one thing this tool exists to prevent, so check it against the module when it matters. */
const DIORAMA = {
  corniche: [    0,     0 ], maryah:   [  -42,  -476 ], reem:     [  190,  -256 ],
  saadiyat: [  535, -1102 ], yas:      [ 1981,  -263 ], raha:     [ 1786,   319 ],
  zayed:    [ 1584,   761 ], masdar:   [ 2174,   542 ], airport:  [ 2526,   272 ],
};
const COL = { corniche:'#d9c9a6', maryah:'#e5a3a3', reem:'#a3c9e5', saadiyat:'#c8e5a3',
              yas:'#e5d3a3', raha:'#e5a3d3', zayed:'#a3e5c9', masdar:'#c9a3e5', airport:'#e5c9a3' };

const idx = JSON.parse(fs.readFileSync(`${ROOT}/data/index.json`, 'utf8'));
const shapes = [];
for (const isl of idx.islands){
  const d = DIORAMA[isl.id];
  if (!d || !isl.extent || !isl.outline || !isl.outline.length) continue;
  const { cx, cy } = isl.extent;
  const rings = Array.isArray(isl.outline[0][0]) ? isl.outline : [isl.outline];
  shapes.push({ id: isl.id, c: d,
    rings: rings.map(r => r.map(([x, y]) => [d[0] + (x - cx) / M_PER_UNIT, d[1] - (y - cy) / M_PER_UNIT])) });
}
if (!shapes.length) throw new Error('no islands with an outline in data/index.json');

let X0 = Infinity, X1 = -Infinity, Z0 = Infinity, Z1 = -Infinity;
for (const s of shapes) for (const r of s.rings) for (const [x, z] of r){
  if (x < X0) X0 = x; if (x > X1) X1 = x; if (z < Z0) Z0 = z; if (z > Z1) Z1 = z;
}
const PAD = 80; X0 -= PAD; X1 += PAD; Z0 -= PAD; Z1 += PAD;
const W = 1500, H = Math.round(W * (Z1 - Z0) / (X1 - X0));
const PX = x => (x - X0) / (X1 - X0) * W, PY = z => (z - Z0) / (Z1 - Z0) * H;

const p = [`<rect width="${W}" height="${H}" fill="#0b2a3a"/>`];
for (const s of shapes){
  for (const r of s.rings)
    p.push(`<polygon points="${r.map(q => `${PX(q[0]).toFixed(1)},${PY(q[1]).toFixed(1)}`).join(' ')}" ` +
           `fill="${COL[s.id] || '#ccc'}" stroke="#333" stroke-width="1"/>`);
  p.push(`<text x="${PX(s.c[0]).toFixed(0)}" y="${PY(s.c[1]).toFixed(0)}" font-family="monospace" ` +
         `font-size="26" font-weight="bold" fill="#fff" stroke="#000" stroke-width="4" ` +
         `paint-order="stroke" text-anchor="middle">${s.id}</text>`);
}
p.push(`<text x="14" y="34" font-family="monospace" font-size="22" fill="#fff">` +
       `the diorama from above — north is UP, east is RIGHT — scene units</text>`);
const tmp = path.join(ROOT, 'tools/bench/out/diorama-map.svg');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
fs.writeFileSync(tmp, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${p.join('')}</svg>`);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file://' + tmp);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`${OUT}  ${W}x${H}  ${shapes.length} districts`);
