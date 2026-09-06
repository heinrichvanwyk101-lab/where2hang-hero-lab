import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname; const ROOT=path.resolve(__dir, '../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server=http.createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/world-nav.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  let b=fs.readFileSync(f); const ext=path.extname(f);
  if(ext==='.html') b=b.toString().replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(b); });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:1900}});
page.on('console',m=>{ if(/^lamps:|^props:/.test(m.text())) console.log('CONSOLE', m.text().slice(0,300)); });
const ID=process.argv[2]||'saadiyat';
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=night&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.evaluate(i=>window.W2H.go(i), ID);
await page.waitForFunction(i=>window.W2H.DISTRICTS.find(d=>d.id===i).built,ID,{timeout:200000}).catch(()=>console.log('not built'));
const info=await page.evaluate(async i=>{ const T=await import('three'); const d=window.W2H.DISTRICTS.find(x=>x.id===i); const arts=(d.roads&&d.roads.drawArterials)||[]; const byCls={}; for(const a of arts){ const c=a.cls||(a.major?'major':'minor'); byCls[c]=(byCls[c]||0)+1; }
  const out={byCls, propCount: window.W2H.propCount||null, inst:[], pts:[]};
  d.detail.traverse(o=>{ if(!o.isInstancedMesh) return; const rec={name:o.name||'', count:o.count, nightOnly:!!(o.userData&&o.userData.nightOnly), geo:o.geometry.type, inBox:0}; 
    if(o.userData&&o.userData.nightOnly){ const A=o.instanceMatrix.array; for(let k=0;k<o.count;k++){ const x=A[k*16+12], z=A[k*16+14]; if(x>-440&&x<-300&&z>125&&z<265) rec.inBox++; if(o.geometry.type==='PlaneGeometry'&&o.count>2000&&x>-470&&x<-250&&z>90&&z<330) out.pts.push([Math.round(x*10)/10,Math.round(z*10)/10]); } }
    out.inst.push(rec); });
  out.sample=[]; d.detail.traverse(o=>{ if(o.isInstancedMesh && o.geometry.type==='PlaneGeometry' && o.count>2000){ const A=o.instanceMatrix.array; for(let k=0;k<6;k++) out.sample.push([+A[k*16+12].toFixed(1),+A[k*16+13].toFixed(2),+A[k*16+14].toFixed(1)]); let zeros=0; for(let k=0;k<o.count;k++){ if(A[k*16]===0&&A[k*16+5]===0) zeros++; } out.sample.push(['count',o.count,'buf',o.instanceMatrix.count,'zeros',zeros,'opacity',o.material.opacity,'color',o.material.color.getHexString(),'parent', o.parent&&o.parent.name]); } });
  out.vis=[]; d.detail.traverse(o=>{ if(o.isInstancedMesh && o.userData && o.userData.nightOnly){ let v=o.visible, q=o; const chain=[]; while(q){ chain.push(q.visible); q=q.parent; } o.updateMatrixWorld(true); const A=o.instanceMatrix.array; const wy=new Float32Array(3); const e=o.matrixWorld.elements; let ymin=1e9,ymax=-1e9; for(let k=0;k<o.count;k++){ const y=A[k*16+13]; if(y<ymin)ymin=y; if(y>ymax)ymax=y; } out.vis.push({ymin,ymax,geo:o.geometry.type,count:o.count,visible:o.visible,chainAllVisible:chain.every(x=>x),opacity:o.material.opacity,worldY:e[13], inst0y:A[13], layers:o.layers.mask, frustum:o.frustumCulled}); } });
  return out; }, ID);
fs.writeFileSync(path.join(__dir,'out','lamps-'+ID+'.json'), JSON.stringify(info)); console.log(JSON.stringify(info.sample)); console.log('lamps in district', info.pts.length, 'inst', info.inst.filter(r=>r.nightOnly).map(r=>[r.geo,r.count,r.inBox]));
await browser.close(); server.close();
