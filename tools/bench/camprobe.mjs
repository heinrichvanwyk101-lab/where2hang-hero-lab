/* WHAT EACH DISTRICT'S RAIL SHOT ACTUALLY FRAMES.

   The owner's read of the home rail was that Al Maryah is the standard — "you have arrived" —
   and that Zayed City, Saadiyat and Corniche are all too far off. Re-pinning those by eye is how
   the current numbers were arrived at in the first place; this measures instead. For every
   district it prints the displayed radius (d.r times the basemap's damping scale), the pinned
   camera distance, and the ratio between them, which is the only number that decides how much of
   the viewport the island fills. Match Al Maryah's ratio and you match Al Maryah's framing. */
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
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:412,height:915}});
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
/* WHAT THE PHONE ACTUALLY SHOWS. The island's own drawn coastline is projected through the live
   camera after the shot has settled, which gives the one number the owner is judging: how much of
   a 412 x 915 viewport the island covers, and where in it the island sits. Reasoning about
   r / dist got this wrong — Corniche has the largest ratio of the nine and reads as the most
   distant, because its radius describes a 19 km island whose interesting half is a corner of it. */
const out = [];
for (const id of ['maryah','reem','yas','raha','masdar','zayed','saadiyat','corniche','airport']){
  await page.evaluate(i => window.W2H.go(i), id);
  await page.waitForTimeout(2600);
  const m = await page.evaluate(() => {
    const W2H = window.W2H, THREE = window.THREE_NS;
    const d = W2H.DISTRICTS.find(x => x.group && x.group.visible !== false && x.__active) || null;
    return null;
  }).catch(()=>null);
  const r = await page.evaluate(i => {
    const d = window.W2H.DISTRICTS.find(x => x.id === i);
    const cam = window.W2H.camera;
    const g = d.group; if (!g) return { id:i, err:'no group' };
    /* Every vertex of the island's ground mesh is more than is needed; its bounding box in world
       space, projected corner by corner, is the same answer for this purpose and costs nothing. */
    const box = new (Object.getPrototypeOf(g.position).constructor === Object ? Object : Object)();
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9, any=false;
    const v = { x:0, y:0, z:0 };
    const pts = [];
    const R = d.r * (d.dispScale || 1);
    for (let a = 0; a < 32; a++){
      const t = a / 32 * Math.PI * 2;
      pts.push([d.x + Math.cos(t) * R, 3, d.z + Math.sin(t) * R]);
    }
    for (const p of pts){
      const vec = new cam.position.constructor(p[0], p[1], p[2]);
      vec.project(cam);
      const sx = (vec.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-vec.y * 0.5 + 0.5) * window.innerHeight;
      if (vec.z > 1) continue;                 // behind the camera
      any = true;
      if (sx < x0) x0 = sx; if (sx > x1) x1 = sx;
      if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    }
    if (!any) return { id:i, err:'off screen' };
    return { id:i, x0, y0, x1, y1, W:window.innerWidth, H:window.innerHeight,
             dist:window.W2H.cur.dist, elev:window.W2H.cur.elev, fov:window.W2H.cur.fov,
             pinned: !!d.cam };
  }, id);
  out.push(r);
}
console.log('id          pinned  width%  height%  centreY%  top%   bottom%');
for (const r of out){
  if (r.err){ console.log(r.id.padEnd(11), r.err); continue; }
  const w = (r.x1 - r.x0) / r.W * 100, h = (r.y1 - r.y0) / r.H * 100;
  const cy = ((r.y0 + r.y1) / 2) / r.H * 100;
  console.log(r.id.padEnd(11), (r.pinned?'yes':'no ').padEnd(7),
    w.toFixed(0).padStart(6), h.toFixed(0).padStart(8), cy.toFixed(0).padStart(9),
    (r.y0 / r.H * 100).toFixed(0).padStart(6), (r.y1 / r.H * 100).toFixed(0).padStart(8));
}
await browser.close(); server.close();
