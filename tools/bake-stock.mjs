/* THE CORNICHE BAKE (world v348 / nav v256).

   Runs the world once on the bench with the bake switched off (?nobake), waits for Corniche to be
   finished — generated fabric, the rest pass, the real footprints and the cull — and writes what
   stands there to data/, so a phone loads finished data instead of building the island:

     data/stock-corniche.json   buckets (layer, material family, window class, profile), rings,
                                the surveyed height bands, the overlay stats, the build stamps
     data/stock-corniche.bin    Float32: seven per instance (x y z yaw sx sy sz), then colours
     data/ground-corniche-p.webp  the full-resolution ground as a phone paints it (9 m/px)
     data/ground-corniche-d.webp  the same at the desktop resolution (6 m/px)

   Re-run after any change to w2h-world.js, w2h-city.js, w2h-districts.js, w2h-basemap.js or a
   data bake; world-nav.html refuses a bake whose stamps do not match and builds live instead.

     node tools/bake-stock.mjs            (one bench render at a time; about two minutes) */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.ndjson':'text/plain',
               '.png':'image/png', '.webp':'image/webp', '.bin':'application/octet-stream' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? '/world-nav.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 411, height: 870 }, deviceScaleFactor: 1 });
const seen = new Set();
page.on('console', m => { const t = m.text(); if (/footprints corniche|buildCornicheRest|ground corniche|roads corniche|baked/.test(t)){ seen.add(t.split(':')[0].split(' ')[0]); console.log('  ' + t.slice(0, 120)); } });
page.on('pageerror', e => console.log('PAGEERROR', String(e.message).slice(0, 200)));
/* Not the embed: the embed defers the world-zoom mass until after the first paint and the bake
   wants the whole island up. ?fp is what the app passes; ?nobake keeps this run live. */
await page.goto(`http://127.0.0.1:${port}/world-nav.html?rail=0&fp&view=day&nobake`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.W2H && window.W2H.DISTRICTS, null, { timeout: 120000 });
await page.waitForFunction(() => window.W2H.fp && window.W2H.fp('corniche') === 'on', null, { timeout: 180000 });
/* The rest pass and its cull: fillCorniche runs on an idle callback and cullFabric runs on
   whichever of the two lands second. Wait for the console line, then a beat. */
await page.waitForFunction(() => window.W2H.DISTRICTS.find(d => d.id === 'corniche').mass.children.some(o => o.isInstancedMesh), null, { timeout: 120000 });
await page.waitForTimeout(4000);
const stamps = await page.evaluate(() => window.W2H.build);
console.log('stamps', stamps);

const out = await page.evaluate(() => {
  const W = window.W2H, d = W.DISTRICTS.find(x => x.id === 'corniche');
  const THREE_M4 = d.group.matrixWorld.constructor;
  const m = new THREE_M4();
  const buckets = [], rings = [], floats = [];
  let dropped = 0, tilted = 0;
  const take = (o, layer) => {
    const b = o.userData.bake;
    const rec = { layer, t: b.t, c: b.c, g: b.g, name: o.name || '', n: 0, off: floats.length };
    const rows = [];
    for (let i = 0; i < o.count; i++){
      o.getMatrixAt(i, m);
      const e = m.elements;
      if (e[0] === 0 && e[5] === 0 && e[10] === 0){ dropped++; continue; }       // culled: scale zero
      /* Decompose by hand for a Y-only rotation: the basis columns are the scaled axes. */
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      if (Math.abs(e[1]) > 1e-4 * sx || Math.abs(e[9]) > 1e-4 * sz || Math.abs(e[4]) > 1e-4 * sy || Math.abs(e[6]) > 1e-4 * sy) tilted++;
      const yaw = Math.atan2(-e[2] / sx, e[0] / sx);     // rotation about Y: x axis = (cos, 0, -sin)
      rows.push([e[12], e[13], e[14], yaw, sx, sy, sz, i]);
    }
    rec.n = rows.length;
    for (const r of rows) for (let k = 0; k < 7; k++) floats.push(r[k]);
    if (o.instanceColor && rows.length){
      rec.coff = floats.length;
      const a = o.instanceColor.array;
      for (const r of rows){ const i = r[7] * 3; floats.push(a[i], a[i + 1], a[i + 2]); }
    }
    if (rec.n) buckets.push(rec);
  };
  for (const [layer, L] of [['mass', d.mass], ['detail', d.detail]]){
    for (const o of L.children){
      if (o.name === 'footprints'){
        for (const q of o.children){
          if (q.isInstancedMesh && q.userData.bake) take(q, 'fp');
          else if (q.userData.bake && q.userData.bake.ring) rings.push(q.userData.bake.ring);
        }
        continue;
      }
      if (o.isInstancedMesh && o.userData.bake && !o.userData.prop && o.name !== 'bridges') take(o, layer);
    }
  }
  const stats = {};
  for (const k of ['fpCount','fpReal','fpZoned','fpClash','fpMerged','fpRoof','fpRaw','fpFab','fpCull','fpKept','fpGrain']) if (d[k] != null) stats[k] = d[k];
  const F = new Float32Array(floats);
  let bin = ''; const u8 = new Uint8Array(F.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { buckets, rings, bands: d.fpBands || [], stats, dropped, tilted, floats: floats.length, bin: btoa(bin) };
});
if (out.tilted) throw new Error('bake: ' + out.tilted + ' instances are not Y-only rotations; the seven-float form cannot carry them');
console.log('buckets', out.buckets.length, 'instances', out.buckets.reduce((s, b) => s + b.n, 0), 'rings', out.rings.length, 'culled instances left out', out.dropped, 'floats', out.floats);

const ground = async (tag, width, height) => {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  const b64 = await page.evaluate(async () => {
    const cv = window.W2H.groundCanvas('corniche');
    const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), w: cv.width, h: cv.height };
  });
  const buf = Buffer.from(b64.b64, 'base64');
  fs.writeFileSync(path.join(ROOT, 'data', `ground-corniche-${tag}.webp`), buf);
  console.log(`ground-corniche-${tag}.webp ${b64.w}x${b64.h} ${Math.round(buf.length / 1024)} KB`);
  return { w: b64.w, h: b64.h, kb: Math.round(buf.length / 1024) };
};
const gp = await ground('p', 411, 870);
const gd = await ground('d', 1400, 900);

const [nav, city, world, props] = stamps.split(' / ');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const basemap = fs.readFileSync(path.join(ROOT, 'w2h-basemap.js'), 'utf8').match(/export const BUILD = '([^']+)'/)[1];
const head = { island: 'corniche', baked: new Date().toISOString(),
  stamps: { world, city, basemap, data: idx.bake || idx.stamp || idx.generated || null },
  floats: out.floats, buckets: out.buckets, rings: out.rings, bands: out.bands, stats: out.stats,
  ground: { p: gp, d: gd } };
fs.writeFileSync(path.join(ROOT, 'data/stock-corniche.json'), JSON.stringify(head));
fs.writeFileSync(path.join(ROOT, 'data/stock-corniche.bin'), Buffer.from(out.bin, 'base64'));
console.log('stock-corniche.json', Math.round(fs.statSync(path.join(ROOT, 'data/stock-corniche.json')).size / 1024), 'KB;',
            'stock-corniche.bin', Math.round(fs.statSync(path.join(ROOT, 'data/stock-corniche.bin')).size / 1024), 'KB');
await browser.close(); server.close();
