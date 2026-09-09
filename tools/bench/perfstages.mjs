/* WHERE DOES buildWorld SPEND ITS FIVE SECONDS?

   Two warm loads on the owner's phone put buildWorld at 5,070 and 5,221 ms of a 7.4 and 8.1
   second page, with the network at zero and the renderer at a quarter of a second. So the load is
   not download-bound and it is not draw-bound: it is the world building itself, and that is the
   only place worth optimising.

   w2h-world has carried PERF — millisecond totals and call counts per wrapped stage — the whole
   time, and nav v236 forwards the top eight to the parent page. Neither is readable from here.
   This pulls the whole table out of the page after the build settles and prints it sorted, with
   the unaccounted remainder named honestly rather than hidden.

   A NOTE ON WHAT THE NUMBERS MEAN HERE. This runs under swiftshader, a software rasteriser, so
   absolute milliseconds are far slower than the phone and GPU-bound work is inflated the most.
   The RANKING of CPU stages is still the thing to act on, and the call counts are exact. Treat
   this as "which stage, and how many times", not "how many ms on a Samsung".

   Usage: node tools/bench/perfstages.mjs [--night] [--q=gpx=18]
     --q appends a query parameter, so the ground-resolution dial can be swept without a deploy. */
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

const view = process.argv.includes('--night') ? '&view=night' : '';
const extra = (process.argv.find(a => a.startsWith('--q=')) || '').slice(4);
const url = `http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp${view}${extra ? '&' + extra : ''}`;
console.log('url:', url.replace(/^http:\/\/127\.0\.0\.1:\d+/, ''));
page.on('console', m => { const t = m.text(); if (t.startsWith('ground ')) console.log('  ' + t); });
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.W2H && window.W2H.DISTRICTS, null, { timeout: 120000 });
await page.waitForFunction(() => window.W2H.DISTRICTS.filter(d => d.built).length >= window.W2H.DISTRICTS.length,
  null, { timeout: 300000 }).catch(() => console.log('(not every district built before the timeout)'));
await page.waitForTimeout(8000);

const r = await page.evaluate(() => {
  const P = window.W2H && window.W2H.PERF;
  if (!P) return { err: 'PERF not exposed on window.W2H' };
  const rows = Object.keys(P).filter(k => k[0] !== '#')
    .map(k => ({ stage: k, ms: P[k], calls: P['#' + k] || null }))
    .sort((a, b) => b.ms - a.ms);
  return { rows, total: P['#total'] || null, built: window.W2H.DISTRICTS.filter(d => d.built).length };
});

if (r.err) { console.log(r.err); }
else {
  const named = r.rows.reduce((a, x) => a + x.ms, 0);
  const denom = r.total || named;
  console.log(`buildWorld stages · ${r.built} districts built · software rasteriser, so rank not absolute ms\n`);
  console.log('      ms    share   calls   ms/call  stage');
  for (const x of r.rows) {
    if (x.ms < 1) continue;
    console.log(`  ${String(Math.round(x.ms)).padStart(6)}  ${String((x.ms / denom * 100).toFixed(1) + '%').padStart(6)}  ` +
      `${String(x.calls ?? '').padStart(6)}  ${String(x.calls ? (x.ms / x.calls).toFixed(2) : '').padStart(8)}  ${x.stage}`);
  }
  if (r.total) {
    const rest = Math.max(0, r.total - named);
    console.log(`  ${String(Math.round(rest)).padStart(6)}  ${String((rest / denom * 100).toFixed(1) + '%').padStart(6)}` +
      `                    (unwrapped — geometry construction and upload)`);
    console.log(`  ${String(Math.round(r.total)).padStart(6)}  100.0%                    TOTAL`);
  }
}

await browser.close();
server.close();
