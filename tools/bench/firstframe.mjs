/* HOW LONG UNTIL SOMETHING IS ON SCREEN?

   perfstages.mjs answers "where does buildWorld spend its time". This answers the question the
   owner actually asked, which is not the same one: how long does a person hold a blank phone.
   Total build time and time-to-first-frame come apart the moment any work is deferred — deferring
   makes the total WORSE and the wait better — so optimising against the total would reject exactly
   the changes worth making.

   It reports the page's own PH phase marks, which are wall-clock milliseconds charged to each
   stage of startup, plus the moment the renderer drew frame one, plus the moment every district
   reported built. Under a software rasteriser the absolute numbers are far slower than a phone;
   the RATIO between two runs of this tool is the thing to read.

   Usage: node tools/bench/firstframe.mjs [--q=prog]
     --q appends a query parameter — prog for the progressive reveal, gpx=N for ground resolution. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';

const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.ndjson': 'text/plain', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? '/world-nav.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  let b = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') b = b.toString()
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js', '/node_modules/three/build/three.module.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/', '/node_modules/three/examples/jsm/');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(b);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
page.on('pageerror', e => console.log('PAGEERROR', String(e.message).slice(0, 160)));

const extra = (process.argv.find(a => a.startsWith('--q=')) || '').slice(4);
const url = `http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp${extra ? '&' + extra : ''}`;
console.log('query:', extra || '(default)');

const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.W2H && typeof window.W2H.frames === 'function', null, { timeout: 120000 });
await page.waitForFunction(() => window.W2H.frames() >= 1, null, { timeout: 240000 }).catch(() => {});
const tFrame = Date.now() - t0;
/* The EAGER districts only. zayed, masdar and the airport are built on demand, so waiting for
   DISTRICTS.length here just burns the timeout and reports a meaningless number. */
await page.waitForFunction(() => window.W2H.DISTRICTS.filter(d => d.built).length >= 6,
  null, { timeout: 240000 }).catch(() => {});
const tBuilt = Date.now() - t0;

const ph = await page.evaluate(() => {
  const P = window.__PH || null;
  return { ph: P, built: window.W2H.DISTRICTS.filter(d => d.built).length, frames: window.W2H.frames() };
});

console.log(`  first frame drawn      ${String(tFrame).padStart(7)} ms`);
console.log(`  every district built   ${String(tBuilt).padStart(7)} ms   (${ph.built} districts, ${ph.frames} frames)`);
if (ph.ph) {
  console.log('\n  phase marks (ms charged to each startup stage):');
  Object.entries(ph.ph).filter(([k]) => k[0] !== '#').sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([k, v]) => console.log(`    ${String(Math.round(v)).padStart(7)}  ${k}`));
} else {
  console.log('\n  (PH not exposed on window.__PH — only the two wall-clock numbers above)');
}

await browser.close();
server.close();
