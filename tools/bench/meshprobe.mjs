/* MESH PROBE — names what is actually standing at a spot, when the survey has nothing there.
   The Yas water park pass hit a large amber slab beside the park that matched no building, park,
   plaza or parking polygon, which means it is a kit mesh; screen-space guessing had already cost
   two wrong readings, so this asks the scene instead. Prints the biggest meshes near an island
   coordinate with their size, centre in island units and day colour.
   Usage: node tools/bench/meshprobe.mjs <island> <ux> <uz> <radius-units> */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u==='/' ? '/world-nav.html' : u);
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
const page = await browser.newPage({viewport:{width:600,height:600}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,200)));
const ID = process.argv[2] || 'yas', UX = +process.argv[3], UZ = +process.argv[4], RAD = +process.argv[5] || 60;
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=window.W2H.DISTRICTS.length,null,{timeout:200000}).catch(()=>console.log('not all built'));
const out = await page.evaluate(([id,ux,uz,rad])=>{
  const d = window.W2H.DISTRICTS.find(x=>x.id===id);
  const s = d.dispScale||1, c = Math.cos(d.rot), n = Math.sin(d.rot);
  const toW = (px,pz)=>[ d.x + (px*c + pz*n)*s, d.z + (-px*n + pz*c)*s ];
  const [tx,tz] = toW(ux,uz); const R = rad*s;
  const rows = [];
  const THREE = window.THREE || null;
  const walk = (o, chain) => {
    const name = o.userData && (o.userData.kitName || o.userData.hero) ? String(o.userData.kitName||'hero') : null;
    const ch = name ? name : chain;
    if (o.isMesh && o.geometry){
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox.clone();
      const p = new o.position.constructor();
      o.getWorldPosition(p);
      if (Math.hypot(p.x-tx, p.z-tz) < R){
        const sc = o.getWorldScale ? o.getWorldScale(new o.position.constructor()) : {x:1,y:1,z:1};
        const w = (bb.max.x-bb.min.x)*sc.x, h=(bb.max.y-bb.min.y)*sc.y, dd=(bb.max.z-bb.min.z)*sc.z;
        const m = Array.isArray(o.material)? o.material[0] : o.material;
        const col = m && m.userData && m.userData.dayMats && m.userData.dayMats.color ? m.userData.dayMats.color.getHexString()
                  : (m && m.color ? m.color.getHexString() : '?');
        rows.push({ area:+(w*dd).toFixed(1), w:+w.toFixed(1), h:+h.toFixed(1), d:+dd.toFixed(1),
                    x:+p.x.toFixed(0), z:+p.z.toFixed(0), col, kit: ch || o.name || o.type });
      }
    }
    (o.children||[]).forEach(k=>walk(k, ch));
  };
  walk(d.group, null);
  rows.sort((a,b)=>b.area-a.area);
  // island units for the top rows
  const toU = (wx,wz)=>{ const dx=(wx-d.x)/s, dz=(wz-d.z)/s; return [ +(dx*c - dz*n).toFixed(1), +(dx*n + dz*c).toFixed(1) ]; };
  return rows.slice(0,18).map(r=>({...r, u:toU(r.x,r.z)}));
}, [ID, UX, UZ, RAD]);
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
