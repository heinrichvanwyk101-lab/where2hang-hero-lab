/* THE RAIL SHOT AS THE PHONE GETS IT.

   The owner judged the home rail district by district — Al Maryah "you have arrived", Corniche
   "still looking at it from an aircraft" — and that judgement is about one thing: how much of a
   phone viewport the district fills and where in it it sits. So this takes the real shot at the
   real size, in the app's own embed mode, one PNG per district. No projection maths, no ratios:
   the picture is the measurement. */
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
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
/* The owner's phone is a 412 x 915 CSS viewport; the world sits under a header and above the tab
   bar, but the iframe is the full height and the camera composes for that, so full height it is. */
const page = await browser.newPage({viewport:{width:412,height:915}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,120)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:300000}).catch(()=>console.log('not all built'));
await page.evaluate(()=>{ const s=window.W2H.DISTRICTS[0].group.parent.parent; (function w(o){ if(o.isMesh&&o.userData&&o.userData.warmHidden){o.userData.warmHidden=false;o.visible=true;} (o.children||[]).forEach(w); })(s); });
const IDS = (process.argv[2] || 'maryah,corniche,saadiyat,zayed,airport').split(',');
for (const id of IDS){
  await page.evaluate(i => window.W2H.go(i), id);
  /* SNAP, DO NOT WAIT. The first cut of this waited eight seconds for the camera lerp and shot Al
     Maryah from four thousand units up, still on its way in from the world overview — a picture of
     Abu Dhabi Island labelled maryah. The ease is exponential, so "nearly there" takes as long as
     you give it. setDistrict has already written the composed shot into goal; copying it into cur
     is the settled frame by definition, and it is what districtshot.mjs does for the same reason. */
  await page.evaluate(() => { const g = window.W2H.goal, c = window.W2H.cur;
    c.target.copy(g.target); c.dist = g.dist; c.elev = g.elev; c.angle = g.angle; c.fov = g.fov; });
  await page.waitForTimeout(2500);
  const cam = await page.evaluate(() => ({ dist:Math.round(window.W2H.cur.dist),
    elev:Math.round(window.W2H.cur.elev), fov:window.W2H.cur.fov,
    ang:Math.round(window.W2H.cur.angle*180/Math.PI) }));
  await page.screenshot({ timeout:150000, path: OUT + 'rail-' + id + '.png' });
  console.log('shot', id, JSON.stringify(cam));
}
await browser.close(); server.close();
