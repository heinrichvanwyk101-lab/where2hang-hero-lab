/* THE RAIL SHOT WITH ITS PINS, WHICH IS THE ONLY VERSION OF IT ANYONE SEES.

   The home rail does not stop at setDistrict. It sends the island's own venues through
   setResultsReal, and frameAllResults then composes the camera on those pins — so shooting
   W2H.go(id) alone measures a shot the phone never shows. That mistake cost a full round: the
   district cameras looked right in the bench and wrong on the owner's screen because the bench
   was looking at a different function's output.

   Points go in as EMIRATE METRES, the same frame data/venues.ndjson is in and the same frame the
   app sends, so this drives the real path end to end. The app additionally filters to
   destination-grade venues and groups them into containers; the spatial spread — which is all the
   framing depends on — is the same shape.

   SETTLED FRAMES ONLY. The camera ease is exponential, so waiting for it is waiting for an
   asymptote; goal already holds the composed shot, and copying it into cur IS the settled frame.
   Shooting mid-flight produced a picture of Abu Dhabi Island labelled "maryah". */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname; const OUT = path.join(__dir, 'out') + '/';
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

/* venues.ndjson is lat/lon; the bake's own projection turns it into the emirate metres every
   consumer works in. Same origin and same earth radius as tools/bake-city.mjs. */
const R_EARTH = 6378137, LAT0 = 24.49, LON0 = 54.42, K = Math.cos(LAT0 * Math.PI / 180);
const fwd = (lat, lon) => [ (lon - LON0) * Math.PI / 180 * R_EARTH * K,
                            (lat - LAT0) * Math.PI / 180 * R_EARTH ];
const venues = fs.readFileSync(path.join(ROOT, 'data/venues.ndjson'), 'utf8')
  .trim().split('\n').map(JSON.parse)
  .filter(v => Number.isFinite(v.lat) && Number.isFinite(v.lon))
  .map(v => { const [x, z] = fwd(v.lat, v.lon); return { x, z, name: v.k || 'venue' }; });

const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:412,height:915}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,140)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:300000}).catch(()=>console.log('not all built'));

const IDS = (process.argv[2] || 'maryah,corniche,saadiyat,zayed,yas,reem').split(',');
const tag = process.argv[3] || 'pins';
for (const id of IDS){
  await page.evaluate(i => window.W2H.go(i), id);
  await page.waitForTimeout(1200);
  const info = await page.evaluate(({ i, pts }) => {
    window.postMessage({ w2h:true, type:'setResultsReal',
      points: pts.map(p => ({ id:i, x:p.x, z:p.z, name:p.name })), label:i, island:i }, '*');
    return null;
  }, { i:id, pts: venues });
  await page.waitForTimeout(1500);
  const cam = await page.evaluate(() => { const g = window.W2H.goal, c = window.W2H.cur;
    c.target.copy(g.target); c.dist = g.dist; c.elev = g.elev; c.angle = g.angle; c.fov = g.fov;
    const k = window.W2H.core ? window.W2H.core() : null;
    return { dist:Math.round(g.dist), halfW:k&&Math.round(k.halfW), halfL:k&&Math.round(k.halfL),
             halfDiag:k&&Math.round(k.halfDiag), islandR:k&&Math.round(k.islandR),
             n:k&&k.n, of:k&&k.of }; });
  await page.waitForTimeout(1800);
  await page.screenshot({ timeout:150000, path: OUT + tag + '-' + id + '.png' });
  console.log('shot', id, JSON.stringify(cam));
}
await browser.close(); server.close();
