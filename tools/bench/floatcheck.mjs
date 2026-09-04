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
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:200000}).catch(()=>console.log('not all built'));
const ray = await page.evaluate(()=>{
  const W=window.W2H, THREE=W.THREE||null; const res=[];
  const scene=W.scene; scene.updateMatrixWorld(true);
  const rc=new (W.camera.constructor.prototype.constructor===Object?null:Object)();
  return null;
});
const hits = await page.evaluate(async ()=>{
  const W=window.W2H; const mod = await import('/node_modules/three/build/three.module.js');
  const out={};
  for (const [nm,x,z] of [['rahaMall',1946,326],['rahaMallEdge',1960,318],['aldar',1989,241],['rahaFabric',2050,300]]){
    const rc=new mod.Raycaster(new mod.Vector3(x,80,z), new mod.Vector3(0,-1,0)); rc.camera=W.camera; const grp=W.DISTRICTS.find(d=>d.id==='raha').group;
    const hs=rc.intersectObject(grp,true).filter(h=>h.object.visible).slice(0,6).map(h=>({y:+h.point.y.toFixed(2), name:h.object.name||h.object.parent?.name||'?', kit:h.object.userData?.kitName||'', hero:!!h.object.userData?.hero}));
    out[nm]=hs;
  }
  return out;
});
console.log('HITS', JSON.stringify(hits));
const out = await page.evaluate(()=>{
  const W=window.W2H, res={};
  for (const id of ['raha','corniche','yas']){
    const d=W.DISTRICTS.find(x=>x.id===id); d.group.updateMatrixWorld(true);
    const heroes=[]; d.detail.traverse(o=>{ if(o.isMesh&&o.userData&&o.userData.hero){ o.geometry.computeBoundingBox(); const bb=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); heroes.push({name:o.userData.kitName||o.parent?.name||'?', minY:+bb.min.y.toFixed(2), maxY:+bb.max.y.toFixed(2), x:+((bb.min.x+bb.max.x)/2).toFixed(0), z:+((bb.min.z+bb.max.z)/2).toFixed(0)}); } });
    // island top: max y of meshes named like isle / slab in the group's mass
    let top=null; d.group.traverse(o=>{ if(o.isMesh && /isle|slab|island/i.test(o.name||'')){ o.geometry.computeBoundingBox(); const bb=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); top=Math.max(top??-1e9,bb.max.y);} });
    res[id]={scale:d.dispScale||1, groupY:d.group.position.y, detailY:d.detail.position.y, isleTop:top, heroes:heroes.slice(0,6)};
  }
  return res;
});
console.log(JSON.stringify(out,null,1));
await browser.close(); server.close();
