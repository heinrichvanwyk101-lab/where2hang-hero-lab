/* A CLOSE-UP OF ONE SPOT, FROM A CAMERA YOU STATE.

   districtshot frames a whole island and worldview frames the archipelago; neither can look at a
   single interchange. This builds the world, goes to a district, then puts the camera exactly
   where the arguments say — target in scene units, distance, elevation, bearing — and shoots.
   Run it before and after a painter change with the same numbers and the pair is the evidence.

   Scene units from lat/lng: x = DIORAMA[id].x + (lng-54.42)*pi/180*R*cos(24.49deg) - extent.cx
   over 7.8; z = DIORAMA[id].z - ((lat-24.49)*pi/180*R - extent.cy) over 7.8. See diorama-map.mjs.

   Usage: node tools/bench/closeup.mjs <id> <x> <z> <dist> <elev> <angleRad> <out.png> */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const [id, X, Z, DIST, ELEV, ANG, OUTARG] = process.argv.slice(2);
if (!id || !OUTARG) { console.log('usage: closeup.mjs <id> <x> <z> <dist> <elev> <angleRad> <out.png>'); process.exit(1); }
const OUT = path.isAbsolute(OUTARG) ? OUTARG : path.join(ROOT, OUTARG);
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
const page = await browser.newPage({viewport:{width:1280,height:854}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,160)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:240000}).catch(()=>console.log('not all eager districts built'));
await page.evaluate(i=>window.W2H.go(i), id);
await page.waitForTimeout(2500);
await page.evaluate(()=>{ const s=window.W2H.DISTRICTS[0].group.parent.parent; (function w(o){ if(o.isMesh&&o.userData&&o.userData.warmHidden){o.userData.warmHidden=false;o.visible=true;} (o.children||[]).forEach(w); })(s); });
await page.addStyleTag({ content: '#back, button, .back, .pill { display: none !important; }' });
await page.evaluate(([x,z,dist,elev,ang])=>{
  const g = window.W2H.goal, c = window.W2H.cur;
  g.target.set(x, 3, z); g.dist = dist; g.elev = elev; g.angle = ang; g.fov = 42;
  c.target.copy(g.target); c.dist = g.dist; c.elev = g.elev; c.angle = g.angle; c.fov = g.fov;
}, [+X, +Z, +DIST, +ELEV, +ANG]);
await page.waitForTimeout(9000);
await page.screenshot({ timeout:150000, path: OUT });
await browser.close(); server.close();
console.log('shot', OUT);
