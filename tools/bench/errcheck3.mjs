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
const page=await browser.newPage({viewport:{width:900,height:1600}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,4).join(' | ')));
page.on('console',m=>{ if(m.type()==='error'||/fail|Error|error/.test(m.text())) console.log('CONSOLE', m.text().slice(0,300)); });
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,300)+'\n'+String(e.stack||'').split('\n').slice(0,6).join('\n')));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=night`,{waitUntil:'load',timeout:120000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:90000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:200000}).catch(()=>console.log('not all built'));
console.log('built:', await page.evaluate(()=>window.W2H.DISTRICTS.map(d=>d.id+':'+(d.built?1:0)).join(' ')));
// REVEAL EVERYTHING BEFORE LISTENING FOR RENDER ERRORS. Warm-up hides every mesh and reveals a
// few per frame; on swiftshader the queue never empties inside this check, so a mesh that
// throws when drawn (a bad material) was never drawn here. Pull the whole queue now.
await page.evaluate(()=>{ const s=window.W2H.scene; s.traverse(o=>{ if(o.isMesh&&o.userData&&o.userData.warmHidden){ o.userData.warmHidden=false; o.visible=true; } }); });
await page.waitForTimeout(25000);
const holes = await page.evaluate(()=>{ const out=[]; const s=window.W2H.DISTRICTS[0].group.parent.parent;
  (function w(o,path){ if(!o){ out.push('HOLE at '+path); return; } (o.children||[]).forEach((c,i)=>w(c,path+'/'+(o.name||o.type)+'['+i+']')); })(s,'');
  return out.slice(0,10); });
console.log('holes:', JSON.stringify(holes));
// STRUCTURAL CHECK: every mesh must carry a real Material. A Mesh assigned as a material (the
// Etihad Towers clone bug, city v108-v112) renders on some three builds and throws
// customProgramCacheKey on others, so the render loop alone is not a reliable gate for it.
const bad = await page.evaluate(()=>{ const out=[]; window.W2H.scene.traverse(o=>{ if(!o.isMesh) return; const ms=Array.isArray(o.material)?o.material:[o.material]; for (const m of ms){ if(!m||!m.isMaterial){ out.push((o.userData&&o.userData.kitName)||o.name||o.type); break; } } const sets=o.userData||{}; for (const k of ['dayMats','duskMats','planMats','origMat']){ const v=sets[k]; if(v!=null){ const vs=Array.isArray(v)?v:[v]; for (const m of vs) if(!m||!m.isMaterial){ out.push(k+':'+((o.userData&&o.userData.kitName)||o.name||o.type)); break; } } } }); return out; });
console.log('badMaterials:', bad.length, JSON.stringify(bad.slice(0,8)));
console.log('errors:', errs.length); for (const e of errs.slice(0,3)) console.log(e);
console.log('err box:', await page.evaluate(()=>(document.getElementById('err')||{}).textContent||'').then(t=>t.slice(0,300)));
await browser.close(); server.close();
