/* CARD ART FOR THE AREA RAIL, TAKEN FROM THE WORLD ITSELF.

   Six of the rail's islands have a photograph. Zayed City and Zayed International have none, and
   Masdar has only the 900x600 page PNG. Rather than put a stand-in city skyline on three cards and
   call it done, these are shot from the model the card actually flies you to — which is the one
   image guaranteed to be of the right place.

   One browser, one world build, N shots: the build is the expensive part and doing it per district
   would cost three of them. */
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
/* 1280 x 854 is the rail card's 3:2 at twice the 640 x 427 the webps ship at, so the downsample to
   card size has something to lose rather than nothing. */
const page = await browser.newPage({viewport:{width:1280,height:854}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
const IDS = (process.argv[2] || 'zayed,masdar,airport').split(',');
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=${process.env.VIEW||'day'}&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=window.W2H.DISTRICTS.length,null,{timeout:300000}).catch(()=>console.log('not all built'));
await page.evaluate(()=>{ const s=window.W2H.DISTRICTS[0].group.parent.parent; (function w(o){ if(o.isMesh&&o.userData&&o.userData.warmHidden){o.userData.warmHidden=false;o.visible=true;} (o.children||[]).forEach(w); })(s); });
/* NOTHING BUT THE WORLD IN THE PICTURE. embed=1 already drops the rail, but the Back pill and the
   two control buttons stay, and they were baked into the first set of cards. */
await page.addStyleTag({ content: '#back, button, .back, .pill { display: none !important; }' });
for (const id of IDS){
  await page.evaluate(i=>window.W2H.go(i), id);
  await page.waitForTimeout(1500);
  /* FRAMED FROM THE DISTRICT'S OWN RADIUS, NOT BY SCALING ITS AUTHORED SHOT.

     The first pass multiplied each district's nav dist and elev by a constant and the islands came
     out as specks: those numbers are composed for a phone in portrait with UI over the frame and a
     card wants the ground filling it, so the right factor differs per district and there is no one
     constant that works. dist = R / tan(fov/2) puts a sphere of radius R exactly across the frame;
     1.15 leaves a little air round it. R is the island's real displayed radius, which the world
     already knows. */
  await page.evaluate(i=>{
    const d = window.W2H.DISTRICTS.find(x => x.id === i);
    const R = d.r * (d.dispScale || 1);
    const fov = 42, dist = R / Math.tan(fov * Math.PI / 360) * 1.15;
    const g = window.W2H.goal, c = window.W2H.cur;
    g.target.set(d.x, 3, d.z);
    g.fov = fov; g.dist = dist; g.elev = dist * 0.62;
    c.target.copy(g.target); c.dist = g.dist; c.elev = g.elev; c.angle = g.angle; c.fov = g.fov;
  }, id);
  await page.waitForTimeout(9000);
  await page.screenshot({ timeout:150000, path: OUT + 'card-' + id + '.png' });
  console.log('shot', id);
}
await browser.close(); server.close();
