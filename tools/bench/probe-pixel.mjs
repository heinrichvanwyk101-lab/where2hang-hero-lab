/* PROBE A PIXEL: same bootstrap and camera args as closeup.mjs, then raycast the scene at a pixel
   and say what is there. Usage: node tools/bench/probe-pixel.mjs <id> <x> <z> <dist> <elev> <ang> <px> <py> */
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const __dir = new URL('.', import.meta.url).pathname; const ROOT = path.resolve(__dir, '../..');
const [id, X, Z, DIST, ELEV, ANG, PXL, PYL] = process.argv.slice(2);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{ const u=new URL(req.url,'http://x'); let f=path.join(ROOT,decodeURIComponent(u.pathname)); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;} let body=fs.readFileSync(f); if(f.endsWith('.html')) body=body.toString().replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/'); res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'}); res.end(body); });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({ viewport:{ width:1280, height:854 }, deviceScaleFactor:1 });
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:240000}).catch(()=>{});
await page.evaluate(i=>window.W2H.go(i), id); await page.waitForTimeout(2500);
await page.evaluate(([x,z,dist,elev,ang])=>{ const g=window.W2H.goal,c=window.W2H.cur; g.target.set(x,3,z); g.dist=dist; g.elev=elev; g.angle=ang; g.fov=42; c.target.copy(g.target); c.dist=g.dist; c.elev=g.elev; c.angle=g.angle; c.fov=g.fov; }, [+X,+Z,+DIST,+ELEV,+ANG]);
await page.waitForTimeout(6000);
const out = await page.evaluate(([px,py])=>{
  const THREE = window.THREE || null; const cam = window.W2H.camera, scene = window.W2H.scene;
  const ndc = { x: (px/window.innerWidth)*2-1, y: -(py/window.innerHeight)*2+1 };
  const Ray = cam.constructor.name; // just for the log
  const rc = new (Object.getPrototypeOf(cam).constructor === undefined ? null : window.__RC || (window.__RC = new (function(){ return null; })));
  return null;
}, [+PXL,+PYL]).catch(()=>null);
// three is a module import; expose a raycaster through the page's own module scope via a dynamic import
const hits = await page.evaluate(async ([px,py])=>{
  const THREE = await import('/node_modules/three/build/three.module.js');
  const cam = window.W2H.camera, scene = window.W2H.scene;
  const rc = new THREE.Raycaster(); rc.params.Line = { threshold: 3 }; rc.params.Points = { threshold: 3 }; rc.setFromCamera(new THREE.Vector2((px/window.innerWidth)*2-1, -(py/window.innerHeight)*2+1), cam);
  const hs = rc.intersectObjects(scene.children, true).slice(0, 6);
  return hs.map(h => { const o=h.object; const chain=[]; let p=o; while(p){ chain.push((p.name||p.type)+(p.userData&&p.userData.district?'['+p.userData.district.id+']':'')); p=p.parent; }
    const m=Array.isArray(o.material)?o.material[0]:o.material; return { d:+h.distance.toFixed(1), pt:[+h.point.x.toFixed(1),+h.point.y.toFixed(2),+h.point.z.toFixed(1)], chain:chain.slice(0,5).join(' < '), geom:o.geometry&&o.geometry.type, mat:m&&(m.name||m.type), color:m&&m.color?'#'+m.color.getHexString():'', inst:o.isInstancedMesh?o.count:undefined, id:h.instanceId }; });
}, [+PXL,+PYL]);
console.log(JSON.stringify(hits, null, 1));
await browser.close(); server.close();
