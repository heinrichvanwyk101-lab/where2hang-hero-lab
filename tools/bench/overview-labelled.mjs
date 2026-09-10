/* THE PHONE'S OVERVIEW, WITH EVERY DISTRICT NAMED ON IT.

   WHY THIS EXISTS. The owner reports faults by circling a shape on a screenshot of the world
   overview, and that overview is a perspective shot of nine islands on a composed layout, seen at
   an angle. diorama-map.mjs draws the layout from above; this is the other half — the same view
   the phone shows, in the phone's portrait aspect, with each district's centre projected through
   the real camera and labelled. A circled shape is then read off, not reasoned about.

   Three wrong identifications in one session came from doing this in the head.

   Usage: node tools/bench/overview-labelled.mjs [out.png] */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const OUT = process.argv[2] || path.join(__dir, 'out', 'overview-labelled.png');
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
/* The phone. 412 x 915 CSS px is the Samsung the owner shoots on. */
const W = 412, H = 915;
const page = await browser.newPage({viewport:{width:W,height:H}, deviceScaleFactor: 2});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,160)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:240000}).catch(()=>console.log('not all eager districts built'));
await page.evaluate(()=>window.W2H.world());
await page.evaluate(()=>{ const g=window.W2H.goal, c=window.W2H.cur; c.target.copy(g.target); c.dist=g.dist; c.elev=g.elev; c.angle=g.angle; c.fov=g.fov; });
await page.waitForTimeout(7000);
await page.addStyleTag({ content: '#back, button, .back, .pill { display: none !important; }' });
/* Project each district centre through the real camera. */
const labels = await page.evaluate(([W,H])=>{
  const cam = window.W2H.camera; cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return window.W2H.DISTRICTS.map(d=>{
    const v = { x:d.x, y:0, z:d.z };
    // manual project: world -> clip
    const m = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const cx = m[0]*v.x + m[4]*v.y + m[8]*v.z + m[12];
    const cy = m[1]*v.x + m[5]*v.y + m[9]*v.z + m[13];
    const cz = m[2]*v.x + m[6]*v.y + m[10]*v.z + m[14];
    const px = p[0]*cx + p[4]*cy + p[8]*cz + p[12];
    const py = p[1]*cx + p[5]*cy + p[9]*cz + p[13];
    const pw = p[3]*cx + p[7]*cy + p[11]*cz + p[15];
    return { id:d.id, sx:(px/pw*0.5+0.5)*W, sy:(1-(py/pw*0.5+0.5))*H, behind: pw<=0 };
  });
}, [W,H]);
const raw = OUT.replace(/\.png$/, '.raw.png');
await page.screenshot({ path: raw });
await browser.close(); server.close();
fs.writeFileSync(OUT.replace(/\.png$/, '.labels.json'), JSON.stringify(labels, null, 1));
console.log(JSON.stringify(labels.map(l=>[l.id, Math.round(l.sx), Math.round(l.sy), l.behind?'BEHIND':''])));
console.log('raw frame:', raw, '— labels in', OUT.replace(/\.png$/, '.labels.json'));
