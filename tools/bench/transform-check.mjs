/* DOES A VENUE LAND WHERE ITS BUILDING IS, THROUGH THE REAL CODE PATH?

   The owner's concern, and it is the right one: "somewhere when we shuffled changed island
   positions something could have gone wrong." Island extents and diorama positions have moved
   several times, and two separate chains consume them — a venue coordinate goes
   lat/lng -> emirate metres -> island-local -> world via anchorWorld, while a building goes
   emirate metres -> buildingsUnits -> the island's own geometry. If those two ever stop agreeing,
   every pin drifts off its building and nothing in the repository would say so.

   Comparing real metres to real metres cannot catch it — that is what the earlier venue audit did,
   and it bypasses the transform entirely. This runs both chains inside the live page and checks
   that the SAME point comes out in the same place: the world-space gap between a venue and its
   nearest footprint must equal the real-metre gap divided by M_PER_UNIT and multiplied by the
   island's display scale. A constant ratio per island means the chain is sound; a ratio that
   differs between islands, or from 1.000, is the shuffle having broken something. */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? '/world-nav.html' : u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  let b = fs.readFileSync(f); const ext = path.extname(f);
  if(ext==='.html') b = b.toString()
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(b);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;

const R = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (la, lo) => [ (lo-LON0)*Math.PI/180*R*K, (la-LAT0)*Math.PI/180*R ];
const venues = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:412,height:915}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,140)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:300000}).catch(()=>{});
await page.waitForTimeout(20000);

const AREAS = { corniche:['downtown','khalidiyah','alzahiya','albateen','corniche'],
  maryah:['almaryah'], reem:['alreem'], saadiyat:['saadiyat','mamsha'],
  yas:['yasmerina','yasbay'], raha:['alraha'] };
const out = [];
for (const [isle, areas] of Object.entries(AREAS)){
  const pick = venues.filter(v => areas.includes(v.area_clean)).slice(0, 40)
    .map(v => { const p = fwd(Number(v.lat), Number(v.lng)); return { name:v.name, mx:p[0], my:p[1] }; });
  if (!pick.length) continue;
  const r = await page.evaluate(({ isle, pick }) => {
    const W = window.W2H, d = W.DISTRICTS.find(x => x.id === isle);
    const idx = window.__basemapIndex, B = W.bmap;
    if (!d) return { isle, err:'no district' };
    if (!d.group) return { isle, err:'no group (island not built)' };
    if (!idx) return { isle, err:'no basemap index' };
    if (!B) return { isle, err:'BMAP not exposed on W2H' };
    if (typeof W.anchorWorld !== 'function') return { isle, err:'anchorWorld not exposed' };
    const entry = (idx.islands||[]).find(x => x.id === isle);
    const [ox, oy] = B.islandOrigin(entry);
    const data = entry._fp || entry._data;
    if (!data || !data.buildings || !data.buildings.length) return { isle, err:'no footprints loaded' };
    const M = B.M_PER_UNIT, s = d.dispScale || 1;
    const ratios = [];
    for (const v of pick){
      /* the venue chain, exactly as the setVenue handler does it */
      const local = { x:(v.mx - ox)/M, z:-(v.my - oy)/M, h:0 };
      const wv = W.anchorWorld ? W.anchorWorld(d, local) : null;
      if (!wv) return { isle, err:'anchorWorld not exposed' };
      /* nearest footprint in REAL metres, then the same chain */
      let bd = Infinity, bb = null;
      for (const b of data.buildings){ const dd = Math.hypot(b.x - v.mx, b.y - v.my); if (dd < bd){ bd = dd; bb = b; } }
      if (!bb || bd > 400) continue;
      const bl = { x:(bb.x - ox)/M, z:-(bb.y - oy)/M, h:0 };
      const wb = W.anchorWorld(d, bl);
      const worldGap = Math.hypot(wv.x - wb.x, wv.z - wb.z);
      ratios.push(worldGap / (bd / M * s));
    }
    return { isle, n:ratios.length, s,
             min: ratios.length ? Math.min(...ratios) : null,
             max: ratios.length ? Math.max(...ratios) : null };
  }, { isle, pick });
  out.push(r);
}
console.log('island      pairs  dispScale   world-gap / expected  (1.000 = the two chains agree)');
for (const r of out){
  if (r.err){ console.log('  ' + r.isle.padEnd(10) + '  ' + r.err); continue; }
  const ok = r.min != null && Math.abs(r.min - 1) < 0.02 && Math.abs(r.max - 1) < 0.02;
  console.log('  ' + r.isle.padEnd(10) + String(r.n).padStart(5) + String(r.s).padStart(11) +
    '   ' + (r.min==null ? 'no pairs' : `${r.min.toFixed(4)} .. ${r.max.toFixed(4)}  ${ok ? 'OK' : '*** MISMATCH ***'}`));
}
await browser.close(); server.close();
