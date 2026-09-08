// Prints the world-space box of the group each named kit piece sits in, converted back to
// island units, so two kit pieces (or a kit piece and a lot) can be checked for overlap
// numerically instead of by eye.  node tools/bench/kitbox.mjs <island> <kitName> [<kitName> ...]
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname; const ROOT=path.resolve(__dir, '../..');
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/world-nav.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  let b=fs.readFileSync(f); const ext=path.extname(f);
  if(ext==='.html') b=b.toString().replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js').replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200,{'Content-Type':MIME[ext]||'application/octet-stream'}); res.end(b);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:900,height:1900}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
const ID = process.argv[2] || 'yas'; const NAMES = process.argv.slice(3);
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=window.W2H.DISTRICTS.length,null,{timeout:200000}).catch(()=>console.log('not all built'));
const out = await page.evaluate(async ([id, names])=>{
  const dd=window.W2H.DISTRICTS.find(x=>x.id===id); const placesSeen=(dd.places||[]).filter(p=>/Ferrari|Yas Mall|Waterworld/.test(p.label)).map(p=>({label:p.label,x:p.x,z:p.z}));
  const THREE = await import('three');
  const d=window.W2H.DISTRICTS.find(x=>x.id===id); const s=d.dispScale||1, c=Math.cos(d.rot), n=Math.sin(d.rot);
  const toIsland=(wx,wz)=>{ const dx=(wx-d.x)/s, dz=(wz-d.z)/s; return [dx*c - dz*n, dx*n + dz*c]; };
  const res={};
  for (const name of names){
    let hero=null; d.group.traverse(o=>{ if(!hero && o.userData && o.userData.kitName===name) hero=o; });
    if(!hero){ res[name]='not found'; continue; }
    // walk up to the child of the detail group (the kit's own group)
    let g=hero; while(g.parent && g.parent.parent && g.parent.parent!==d.group && g.parent!==d.group) g=g.parent;
    g.updateMatrixWorld(true); const b=new THREE.Box3().setFromObject(g);
    const a=toIsland(b.min.x,b.min.z), z=toIsland(b.max.x,b.max.z);
    const wp=new THREE.Vector3(); g.getWorldPosition(wp); const gp=toIsland(wp.x,wp.z);
    const big=[]; g.traverse(o=>{ if(!o.isMesh) return; const bb=new THREE.Box3().setFromObject(o); const sz=bb.getSize(new THREE.Vector3()); const c=bb.getCenter(new THREE.Vector3()); const ci=toIsland(c.x,c.z); big.push({ size:[+sz.x.toFixed(1),+sz.y.toFixed(1),+sz.z.toFixed(1)], at:[+ci[0].toFixed(1),+ci[1].toFixed(1)], top:+bb.max.y.toFixed(1), colour:'#'+(o.material&&o.material.color?o.material.color.getHexString():'?'), geo:o.geometry.type }); });
    big.sort((p,q)=>q.size[0]*q.size[2]-p.size[0]*p.size[2]);
    res[name]={ x0:+Math.min(a[0],z[0]).toFixed(1), x1:+Math.max(a[0],z[0]).toFixed(1), z0:+Math.min(a[1],z[1]).toFixed(1), z1:+Math.max(a[1],z[1]).toFixed(1), meshes:big.length, groupAt:[+gp[0].toFixed(1),+gp[1].toFixed(1)], rotY:+g.rotation.y.toFixed(3), largest: big.slice(0,6), _g:g, _b:b };
  }
  // OVERLAP: sample the first kit's world box on a grid and cast straight down at each point
  // against every other named kit's meshes. A rotated slab's true footprint, not its AABB.
  if (names.length > 1 && res[names[0]] && res[names[0]]._g){
    const A = res[names[0]], ray = new THREE.Raycaster(); const hits = {};
    for (const other of names.slice(1)){
      if (!res[other] || !res[other]._g) continue;
      const meshes=[]; res[other]._g.traverse(o=>{ if(o.isMesh) meshes.push(o); });
      let n=0, hit=0, xs=[]; const per={};
      for (let x=A._b.min.x; x<=A._b.max.x; x+=1.5) for (let z=A._b.min.z; z<=A._b.max.z; z+=1.5){
        n++; ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0,-1,0));
        const h = ray.intersectObjects(meshes, false);
        if (h.length){ hit++; xs.push(toIsland(x,z)); const m=h[0].object; const k=m.uuid; if(!per[k]){ const bb=new THREE.Box3().setFromObject(m); const sz=bb.getSize(new THREE.Vector3()); per[k]={ geometry:m.geometry.type, size_units:[+sz.x.toFixed(1),+sz.y.toFixed(1),+sz.z.toFixed(1)], top_y:+bb.max.y.toFixed(2), colour:'#'+(m.material&&m.material.color?m.material.color.getHexString():'?'), hits:0 }; } per[k].hits++; }
      }
      hits[other] = { samples:n, under:hit, share:+(hit/n).toFixed(3), islandX: xs.length ? [+Math.min(...xs.map(p=>p[0])).toFixed(1), +Math.max(...xs.map(p=>p[0])).toFixed(1)] : null, islandZ: xs.length ? [+Math.min(...xs.map(p=>p[1])).toFixed(1), +Math.max(...xs.map(p=>p[1])).toFixed(1)] : null, meshesHit: Object.values(per).sort((a,b)=>b.hits-a.hits).slice(0,8) };
    }
    res.overlapOfFirstWith = hits;
  }
  for (const k of Object.keys(res)) if (res[k] && typeof res[k]==='object'){ delete res[k]._g; delete res[k]._b; }
  res.placesSeen = placesSeen;
  return res;
}, [ID, NAMES]);
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
