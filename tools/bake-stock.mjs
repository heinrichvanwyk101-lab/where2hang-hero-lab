/* THE ISLAND BAKE (world v348 / nav v256; every island and the compact record since v349).

   Runs the world once on the bench with the bake switched off (?nobake), waits for every island to
   be finished — generated fabric, the real footprints and the cull — and writes what stands there
   to data/, so a phone loads finished data instead of building an island:

     data/stock-<id>.json   buckets (layer, material family, window class, profile), rings,
                            the surveyed height bands, the overlay stats, the build stamps
     data/stock-<id>.bin    int16 x7 per instance (x z in 1/16 unit, y in 1/256, yaw as a fraction
                            of pi, scales unsigned in 1/256), then one byte per colour channel
     data/ground-<id>-p.webp  the full-resolution ground as a phone paints it (9 m/px)
     data/ground-<id>-d.webp  the same at the desktop resolution (6 m/px)

   Re-run after any change to w2h-world.js, w2h-city.js, w2h-districts.js, w2h-basemap.js or a
   data bake; world-nav.html refuses a bake whose stamps do not match and builds live instead.

     node tools/bake-stock.mjs            (one bench render at a time; three to five minutes) */
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
/* Every island built and every footprint pass settled, the way errcheck3 waits. */
await page.waitForFunction(() => window.W2H.DISTRICTS.every(d => d.built), null, { timeout: 300000 });
await page.waitForFunction(() => window.W2H.DISTRICTS.every(d => ['on', 'none', 'thin'].includes(window.W2H.fp(d.id))), null, { timeout: 180000 });
/* The rest pass and its cull: fillCorniche runs on an idle callback and cullFabric runs on
   whichever of the two lands second. Wait for the console line, then a beat. */
await page.waitForFunction(() => window.W2H.DISTRICTS.find(d => d.id === 'corniche').mass.children.some(o => o.isInstancedMesh), null, { timeout: 120000 });
await page.waitForTimeout(4000);
const stamps = await page.evaluate(() => window.W2H.build);
console.log('stamps', stamps);
const ISLANDS = await page.evaluate(() => window.W2H.DISTRICTS.map(d => d.id));

const exportStock = async id => await page.evaluate(id => {
  const W = window.W2H, d = W.DISTRICTS.find(x => x.id === id);
  const THREE_M4 = d.group.matrixWorld.constructor;
  const m = new THREE_M4();
  const buckets = [], rings = [], recs = [], cols = [];
  let dropped = 0, tilted = 0, clipped = 0;
  const q = (v, k, lo, hi) => { const r = Math.round(v * k); if (r < lo || r > hi) clipped++; return Math.max(lo, Math.min(hi, r)); };
  const take = (o, layer) => {
    const b = o.userData.bake;
    const rec = { layer, t: b.t, c: b.c, g: b.g, name: o.name || '', n: 0, off: recs.length / 7 };
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
    for (const r of rows){
      recs.push(q(r[0], 16, -32767, 32767), q(r[1], 256, -32767, 32767), q(r[2], 16, -32767, 32767),
                q(r[3] / Math.PI, 32767, -32767, 32767),
                q(r[4], 256, 0, 65535), q(r[5], 256, 0, 65535), q(r[6], 256, 0, 65535));
    }
    if (o.instanceColor && rows.length){
      rec.coff = cols.length / 3;
      const a = o.instanceColor.array;
      /* Tints can sit above 1.0 (a lifted channel), so each bucket carries the scale its bytes
         are relative to; the loader multiplies back. */
      let cs = 1; for (const r of rows){ const i = r[7] * 3; cs = Math.max(cs, a[i], a[i + 1], a[i + 2]); }
      rec.cs = Math.round(cs * 1000) / 1000;
      for (const r of rows){ const i = r[7] * 3; cols.push(q(a[i] / rec.cs, 255, 0, 255), q(a[i + 1] / rec.cs, 255, 0, 255), q(a[i + 2] / rec.cs, 255, 0, 255)); }
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
  /* One buffer: the int16 records, then the colour bytes (scales are written as unsigned into
     the int16 slots; the loader reads them back with & 0xffff). */
  const records = recs.length / 7;
  const colorOff = records * 7 * 2;
  /* THE BEACH LATTICE (world v350), after the colours: one class byte per lattice vertex (0 none,
     1 beach, 2 quay), then for the kept vertices in lattice order a height (int16, 1/256 of a
     local unit) and a shade (uint8, 1/128). The head carries the lattice origin and pitch, so
     the phone rebuilds the band's mesh without one coast-distance test. */
  const L = W.beachLattice(id);
  let beach = null, clsOff = 0, yOff = 0, shOff = 0, total = colorOff + cols.length, nB = 0, NV = 0;
  if (L){
    NV = L.W * (L.NY + 1);
    for (let k = 0; k < NV; k++) if (L.vIdx[k] >= 0) nB++;
    clsOff = total; yOff = clsOff + NV; if (yOff & 1) yOff++; shOff = yOff + nB * 2; total = shOff + nB;
    beach = { bx0: L.bx0, by0: L.by0, csx: L.csx, csy: L.csy, NX: L.NX, NY: L.NY, cellW: L.cellW,
              n: nB, clsOff, yOff, shOff, coastBeachPct: L.coastBeachPct };
  }
  const buf = new ArrayBuffer(total);
  const R = new Int16Array(buf, 0, records * 7);
  for (let i = 0; i < recs.length; i++) R[i] = recs[i] > 32767 ? recs[i] - 65536 : recs[i];
  new Uint8Array(buf, colorOff).set(cols);
  let yClip = 0;
  if (L){
    const C = new Uint8Array(buf, clsOff, NV), Yv = new Int16Array(buf, yOff, nB), S = new Uint8Array(buf, shOff, nB);
    let k = 0;
    for (let v = 0; v < NV; v++){
      const at = L.vIdx[v]; if (at < 0) continue;
      C[v] = L.vCls[v];
      const yy = Math.round(L.pos[at * 3 + 1] * 256); if (yy < -32768 || yy > 32767) yClip++;
      Yv[k] = Math.max(-32768, Math.min(32767, yy));
      S[k] = Math.max(0, Math.min(255, Math.round(L.col[at * 3] * 128)));
      k++;
    }
  }
  let bin = ''; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { buckets, rings, bands: d.fpBands || [], stats, dropped, tilted, clipped: clipped + yClip, records, colorOff, bytes: buf.byteLength, beach, bin: btoa(bin) };
}, id);

const ground = async (id, tag, width, height) => {
  const vp = page.viewportSize();
  if (!vp || vp.width !== width){ await page.setViewportSize({ width, height }); await page.waitForTimeout(300); }
  const b64 = await page.evaluate(async id => {
    const cv = window.W2H.groundCanvas(id);
    const blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.9));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), w: cv.width, h: cv.height };
  }, id);
  const buf = Buffer.from(b64.b64, 'base64');
  fs.writeFileSync(path.join(ROOT, 'data', `ground-${id}-${tag}.webp`), buf);
  console.log(`ground-${id}-${tag}.webp ${b64.w}x${b64.h} ${Math.round(buf.length / 1024)} KB`);
  return { w: b64.w, h: b64.h, kb: Math.round(buf.length / 1024) };
};
const [nav, city, world, props] = stamps.split(' / ');
const idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
const basemap = fs.readFileSync(path.join(ROOT, 'w2h-basemap.js'), 'utf8').match(/export const BUILD = '([^']+)'/)[1];
const stampsHead = { world, city, basemap, data: idx.bake || idx.stamp || idx.generated || null };

const stock = {};
for (const id of ISLANDS){
  const out = await exportStock(id);
  if (out.tilted) throw new Error('bake ' + id + ': ' + out.tilted + ' instances are not Y-only rotations');
  if (out.clipped) console.log('  ' + id + ': ' + out.clipped + ' values clipped to the int16 range');
  stock[id] = out;
  console.log(id + ': buckets', out.buckets.length, 'instances', out.buckets.reduce((s, b) => s + b.n, 0), 'rings', out.rings.length, 'culled left out', out.dropped, 'beach verts', out.beach ? out.beach.n : 0, 'bytes', out.bytes);
}
/* The grounds at both sizes: every island at the phone width, then every island at the desktop
   width, so the viewport changes twice rather than twice per island. */
const grounds = {};
for (const id of ISLANDS){ grounds[id] = { p: await ground(id, 'p', 411, 870) }; }
for (const id of ISLANDS){ grounds[id].d = await ground(id, 'd', 1400, 900); }

for (const id of ISLANDS){
  const out = stock[id];
  const head = { island: id, baked: new Date().toISOString(), format: 'q16', stamps: stampsHead,
    records: out.records, colorOff: out.colorOff, bytes: out.bytes,
    buckets: out.buckets, rings: out.rings, bands: out.bands, stats: out.stats, ground: grounds[id], beach: out.beach };
  fs.writeFileSync(path.join(ROOT, `data/stock-${id}.json`), JSON.stringify(head));
  fs.writeFileSync(path.join(ROOT, `data/stock-${id}.bin`), Buffer.from(out.bin, 'base64'));
  console.log(`stock-${id}.json`, Math.round(fs.statSync(path.join(ROOT, `data/stock-${id}.json`)).size / 1024), 'KB;',
              `stock-${id}.bin`, Math.round(fs.statSync(path.join(ROOT, `data/stock-${id}.bin`)).size / 1024), 'KB');
}
await browser.close(); server.close();
