import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const ROOT='/home/user/where2hang-hero-lab';
const VIEW=process.argv[2]||'night';
const MIME={'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{ const u=decodeURIComponent(req.url.split('?')[0]); const f=path.join(ROOT,u==='/'?'/world-nav.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); res.end(fs.readFileSync(f)); });
await new Promise(r=>server.listen(0,'127.0.0.1',r)); const port=server.address().port;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:450,height:900}});
page.on('response',r=>{ if(r.status()>=400) console.log('HTTP', r.status(), r.url()); });
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,200))); page.on('console',m=>{ if(m.type()==='error'||/shader|Shader|GLSL/.test(m.text())) console.log('CONSOLE', m.text().slice(0,400)); });
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=${VIEW}`,{waitUntil:'load',timeout:120000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS&&window.W2H.renderer,null,{timeout:90000});
await page.waitForTimeout(20000);
const r = await page.evaluate(async ()=>{
  const {renderer, composer, scene, camera} = window.W2H; const THREE = window.W2H.THREE || null;
  const half = h => { const e=(h>>10)&31, m=h&1023; if(e===31) return m?NaN:Infinity; if(e===0) return m*Math.pow(2,-24); return (1+m/1024)*Math.pow(2,e-15); };
  const rt = composer.readBuffer, w=rt.width, h=rt.height; const buf=new Uint16Array(w*h*4);
  const frames=[]; const spots={};
  for (let f=0; f<12; f++){
    await new Promise(r=>requestAnimationFrame(r));
    const rp = composer.passes[0]; rp.render(renderer, composer.writeBuffer, composer.readBuffer, 0, false); renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(rt,0,0,w,h,buf);
    let n=0;
    for (let i=0;i<w*h;i++){ const r=buf[i*4],g=buf[i*4+1],b=buf[i*4+2]; if(((r>>10)&31)===31||((g>>10)&31)===31||((b>>10)&31)===31){ n++; const x=i%w, y=h-1-Math.floor(i/w); const k=x+','+y; spots[k]=(spots[k]||0)+1; } }
    frames.push(n);
  }
  // name what sits under the worst spots
  const ray = new (Object.getPrototypeOf(camera).constructor === undefined ? null : Object)();
  const names=[]; const keys=Object.keys(spots).sort((a,b)=>spots[b]-spots[a]).slice(0,8);
  const Ray = camera.constructor.__proto__; 
  for (const k of keys){ const [x,y]=k.split(',').map(Number);
    const rc = new window.W2H.THREE.Raycaster();
    let hit='?';
    try { const nx=(x+0.5)/w*2-1, ny=-((y+0.5)/h*2-1); rc.setFromCamera({x:nx,y:ny}, camera); const hs=rc.intersectObjects(scene.children,true); const o=hs[0]&&hs[0].object; hit = o ? ((o.name||o.type)+' mat='+([].concat(o.material)[0]||{}).type+' par='+(o.parent&&o.parent.name)) : 'none'; } catch(e){ hit='rc:'+e.message; }
    names.push(k+' x'+spots[k]+' -> '+hit); }
  return {w,h,frames,names};
});
console.log(VIEW, JSON.stringify(r,null,1));
await browser.close(); server.close();
