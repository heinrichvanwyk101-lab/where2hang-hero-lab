import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname; const OUT = path.join(__dir, 'out') + '/';
const ROOT=path.resolve(__dir, '../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);
  const f=path.join(ROOT,u==='/'?'/world-nav.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  let b=fs.readFileSync(f); const ext=path.extname(f);
  if(ext==='.html') b=b.toString()
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(b);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:1900}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,4).join(' | ')));
page.on('console',m=>{ if(m.type()==='error'||/fail|Error|error/.test(m.text())) console.log('CONSOLE', m.text().slice(0,300)); });
const ID = process.argv[2] || 'yas'; const LABEL = process.argv[3]; const LX = +process.argv[7], LZ = +process.argv[8]; const DIST = +process.argv[4] || 260; const ELEV = +process.argv[5] || 120; const ANG = +process.argv[6] || 2.4;
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:200000}).catch(()=>console.log('not all built'));
await page.evaluate(()=>{ const s=window.W2H.DISTRICTS[0].group.parent.parent; (function w(o){ if(o.isMesh&&o.userData&&o.userData.warmHidden){o.userData.warmHidden=false;o.visible=true;} (o.children||[]).forEach(w); })(s); });
await page.evaluate(i=>window.W2H.go(i), ID); await page.waitForTimeout(1500);
// snap the camera to its goal so the shot is the settled one
await page.evaluate(()=>{ const g=window.W2H.goal, c=window.W2H.cur; c.target.copy(g.target); c.dist=g.dist; c.elev=g.elev; c.angle=g.angle; c.fov=g.fov; });
await page.waitForTimeout(6000);
const info = await page.evaluate(i=>{ const d=window.W2H.DISTRICTS.find(x=>x.id===i); const g=window.W2H.goal; return { angle: Math.round(g.angle*180/Math.PI), dist: Math.round(g.dist), elev: Math.round(g.elev), target:[Math.round(g.target.x),Math.round(g.target.z)], centre:[Math.round(d.x),Math.round(d.z)], R: Math.round(d.r*(d.dispScale||1)) }; }, ID);
console.log(ID, JSON.stringify(info));
const P = OUT;
const PP = OUT;
const at = await page.evaluate(([id, label, lx, lz])=>{ const d=window.W2H.DISTRICTS.find(x=>x.id===id); const pl=(d.places||[]).find(p=>p.label===label) || (isFinite(lx) ? {x:lx, z:lz, h:8} : null); if(!pl) return null; const s=d.dispScale||1, c=Math.cos(d.rot), n=Math.sin(d.rot); return { x: d.x + (pl.x*c + pl.z*n)*s, z: d.z + (-pl.x*n + pl.z*c)*s, y: 2.9 + (pl.h||6)*s*0.4 }; }, [ID, LABEL, LX, LZ]);
console.log('place', LABEL, JSON.stringify(at));
if (at){
  await page.evaluate(([l,dist,elev,ang])=>{ const g=window.W2H.goal, c=window.W2H.cur; g.target.set(l.x, l.y, l.z); g.dist=dist; g.elev=elev; g.angle=ang; g.fov=42; c.target.copy(g.target); c.dist=g.dist; c.elev=g.elev; c.angle=g.angle; c.fov=g.fov; }, [at, DIST, ELEV, ANG]);
  await page.waitForTimeout(7000); await page.screenshot({ timeout: 150000, path: PP + 'place-' + LABEL.replace(/\W+/g,'_') + '.png' });
}
await browser.close(); server.close();
