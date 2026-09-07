// Reproduces the Search framing: sends a spread of result pins the way the app does and prints the
// camera the world composes for them, then screenshots. node tools/bench/resultsprobe.mjs
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname; const ROOT=path.resolve(__dir, '../..'); const OUT = path.join(__dir, 'out') + '/';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server=http.createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/world-nav.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  let b=fs.readFileSync(f); const ext=path.extname(f);
  if(ext==='.html') b=b.toString().replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(b); });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:412,height:915}});
page.on('console',m=>{ const t=m.text(); if(/setResultsReal|descend|Error|error|Context|context/.test(t)) console.log('CONSOLE', t.slice(0,200)); });
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=2,null,{timeout:200000}).catch(()=>console.log('not all built'));
await page.waitForTimeout(3000);
const cam0 = await page.evaluate(()=>{ const g=window.W2H.goal; return {dist:Math.round(g.dist),elev:Math.round(g.elev),target:[Math.round(g.target.x),Math.round(g.target.z)]}; });
console.log('before', JSON.stringify(cam0));
// pins the way the app sends them: real metres + island id — take two islands' centres from the basemap index
const sent = await page.evaluate(()=>{
  const idx = window.__basemapIndex; const pts=[];
  for (const isl of idx.islands){ if(!['corniche','yas','reem'].includes(isl.id)) continue; const [ox,oy]=window.BMAP ? window.BMAP.islandOrigin(isl) : [0,0]; pts.push({id:isl.id, x:isl.extent? (isl.extent.cx||ox) : ox, z: isl.extent? (isl.extent.cy||oy) : oy, venueId:'v'+isl.id, name:isl.id}); }
  window.postMessage({w2h:true, type:'setResultsReal', points:pts, label:'Search'}, '*');
  return pts;
});
console.log('sent', JSON.stringify(sent));
const read = () => page.evaluate(()=>{ const g=window.W2H.goal, c=window.W2H.cur; const cam=window.W2H.camera; const r=window.W2H.renderer; let lost=null; try { lost = r ? r.getContext().isContextLost() : null; } catch(e){ lost='?'; }
  let vis=0, hid=0; for (const d of window.W2H.DISTRICTS){ if (d.group && d.group.visible) vis++; else hid++; }
  const gl=document.getElementById('gl'); return {goal:{dist:Math.round(g.dist),elev:Math.round(g.elev),fov:g.fov,angle:+g.angle.toFixed(2),target:[Math.round(g.target.x),Math.round(g.target.y),Math.round(g.target.z)]}, cur:{dist:Math.round(c.dist),elev:Math.round(c.elev)}, far: cam? Math.round(cam.far) : null, camY: cam? Math.round(cam.position.y):null, lost, islandsVisible:vis, islandsHidden:hid, glClass: gl? gl.className : null, state: window.W2H.state}; });
for (const t of [300, 2600, 4600, 8000]){ await page.waitForTimeout(t===300?300:2200); console.log('t+'+t, JSON.stringify(await read())); }
try { await page.screenshot({path: OUT+'results_spread.png', timeout: 120000}); console.log('shot ok'); } catch(e){ console.log('shot failed', e.message.slice(0,80)); }
// phase 2: a single grouped pin on Corniche, the way a name search for one mall arrives
await page.evaluate(()=>{ const idx=window.__basemapIndex; const isl=idx.islands.find(i=>i.id==='corniche'); window.postMessage({w2h:true, type:'setResultsReal', points:[{id:'corniche', x: isl.extent.cx, z: isl.extent.cy, venueId:'v1', name:'one mall', dest:'one mall', members:[{venueId:'a'},{venueId:'b'}]}], label:'Search'}, '*'); });
for (const t of [300, 2600, 6000]){ await page.waitForTimeout(t===300?300:2500); console.log('single t+'+t, JSON.stringify(await read())); }
try { await page.screenshot({path: OUT+'results_single.png', timeout: 120000}); console.log('shot2 ok'); } catch(e){ console.log('shot2 failed', e.message.slice(0,80)); }
// phase 3: the same pin nudged 20 m — a refinement — must not move the camera
const before3 = await read();
await page.evaluate(()=>{ const idx=window.__basemapIndex; const isl=idx.islands.find(i=>i.id==='corniche'); window.postMessage({w2h:true, type:'setResultsReal', points:[{id:'corniche', x: isl.extent.cx + 20, z: isl.extent.cy, venueId:'v1', name:'one mall'}], label:'Search'}, '*'); });
await page.waitForTimeout(2500); const after3 = await read(); console.log('refine moved camera:', JSON.stringify(before3.goal) !== JSON.stringify(after3.goal), JSON.stringify(after3.goal));
await browser.close(); server.close();
