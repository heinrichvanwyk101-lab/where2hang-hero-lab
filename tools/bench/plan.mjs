/* OUR DATA AS A FLAT PLAN, FRAMED LIKE A SATELLITE SCREENSHOT.

   Every check so far has compared our two layers against EACH OTHER — buildings against roads,
   venues against both — and that can say they disagree but never which one is right. Twice it
   produced a confident answer that turned out to be an artefact of the measure: the venue test
   showed the same bias on Yas, which is correctly registered, and the directionality test was
   reading island elongation rather than misregistration.

   This draws the coastline, the roads and the footprints straight out of the baked JSON, at a
   lat/lng window, so it can be put beside a Google satellite view of the same window. That is a
   comparison against ground truth rather than an inference from statistics, and it is what should
   have been done first.

   Usage: node tools/bench/plan.mjs <island> <lat0> <lng0> <lat1> <lng1> [out.png] */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const [id, la0, lo0, la1, lo1] = process.argv.slice(2);
const OUT = process.argv[7] || path.join(ROOT, 'tools/bench/out', `plan-${id}.png`);
if (!id || !la1) { console.log('usage: plan.mjs <island> <lat0> <lng0> <lat1> <lng1> [out.png]'); process.exit(1); }

const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [(lo - LON0) * Math.PI / 180 * R * K, (la - LAT0) * Math.PI / 180 * R];

const [x0, y0] = fwd(+la0, +lo0), [x1, y1] = fwd(+la1, +lo1);
const W = 1000, H = Math.round(W * Math.abs(y1 - y0) / Math.abs(x1 - x0));
const PX = x => (x - Math.min(x0, x1)) / Math.abs(x1 - x0) * W;
const PY = y => H - (y - Math.min(y0, y1)) / Math.abs(y1 - y0) * H;   // north up

const isle = JSON.parse(fs.readFileSync(`${ROOT}/data/isle-${id}.json`, 'utf8'));
const fp = JSON.parse(fs.readFileSync(`${ROOT}/data/fp-${id}.json`, 'utf8')).buildings;
const rdFile = JSON.parse(fs.readFileSync(`${ROOT}/data/roads-${id}.json`, 'utf8'));
const o = isle.outline, rings = Array.isArray(o[0][0]) ? o : [o];

const parts = [];
parts.push(`<rect width="${W}" height="${H}" fill="#0b2a3a"/>`);            // sea
for (const r of rings) {                                                    // land
  parts.push(`<polygon points="${r.map(p => `${PX(p[0]).toFixed(1)},${PY(p[1]).toFixed(1)}`).join(' ')}" fill="#d9c9a6" stroke="#8a7856" stroke-width="1"/>`);
}
for (const w of (isle.water || [])) {
  if (!Array.isArray(w) || w.length < 3) continue;
  parts.push(`<polygon points="${w.map(p => `${PX(p[0]).toFixed(1)},${PY(p[1]).toFixed(1)}`).join(' ')}" fill="#0b2a3a"/>`);
}
const WID = { ring: 4, major: 3.4, minor: 2.2, local: 1.3 };
for (const r of (rdFile.roads || [])) {                                     // roads
  const pts = (r.pts || []).map(p => `${PX(p[0]).toFixed(1)},${PY(p[1]).toFixed(1)}`).join(' ');
  if (!pts) continue;
  parts.push(`<polyline points="${pts}" fill="none" stroke="#3b3b3b" stroke-width="${WID[r.cls] || 1.3}" stroke-linecap="round"/>`);
}
let shown = 0;
for (const b of fp) {                                                       // footprints
  const px = PX(b.x), py = PY(b.y);
  if (px < -50 || px > W + 50 || py < -50 || py > H + 50) continue;
  shown++;
  const w = Math.max(2, (b.w || 20) / Math.abs(x1 - x0) * W);
  const d = Math.max(2, (b.d || 20) / Math.abs(y1 - y0) * H);
  const rot = -(b.rot || 0) * 180 / Math.PI;
  parts.push(`<rect x="${(px - w / 2).toFixed(1)}" y="${(py - d / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${d.toFixed(1)}" ` +
             `transform="rotate(${rot.toFixed(1)} ${px.toFixed(1)} ${py.toFixed(1)})" fill="#c1362f" fill-opacity="0.85"/>`);
}
parts.push(`<text x="10" y="${H - 12}" font-family="monospace" font-size="15" fill="#fff">` +
           `${id}  lat ${la0}..${la1}  lng ${lo0}..${lo1}  ${shown} footprints  red = buildings, dark = roads</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
const tmp = path.join(ROOT, 'tools/bench/out', `plan-${id}.svg`);
fs.writeFileSync(tmp, svg);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file://' + tmp);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`${OUT}  ${W}x${H}  ${shown} footprints in frame`);
