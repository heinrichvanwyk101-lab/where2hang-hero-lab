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
const r = await page.evaluate(()=>{
  const {renderer, composer, bloom, scene, camera} = window.W2H;
  const out = {};
  const bright = () => { const c=renderer.domElement; const k=document.createElement('canvas'); k.width=90; k.height=180; const g=k.getContext('2d'); g.drawImage(c,0,0,90,180); const d=g.getImageData(0,0,90,180).data; let s=0; for(let i=0;i<d.length;i+=4) s+=d[i]+d[i+1]+d[i+2]; return Math.round(s/(d.length/4)/3); };
  const half = h => { const e=(h>>10)&31, m=h&1023, sg=h>>15?-1:1; if(e===31) return m?NaN:sg*Infinity; if(e===0) return sg*m*Math.pow(2,-24); return sg*(1+m/1024)*Math.pow(2,e-15); };
  const scan = rt => { const w=rt.width, h=rt.height; const buf=new Uint16Array(w*h*4); renderer.readRenderTargetPixels(rt,0,0,w,h,buf); let nan=0,inf=0,mx=0,over=0; for(let i=0;i<buf.length;i++){ if((i&3)===3) continue; const v=half(buf[i]); if(Number.isNaN(v)) nan++; else if(!Number.isFinite(v)) inf++; else { if(v>mx) mx=v; if(v>16) over++; } } return {w,h,nan,inf,max:+mx.toFixed(1),over}; };
  out.type = composer.readBuffer.texture.type;
  // 1. full chain as shipped
  composer.render(); out.bloomOn = bright();
  // 2. scene pass only, read back the read buffer
  const rp = composer.passes[0]; rp.render(renderer, composer.writeBuffer, composer.readBuffer, 0, false); renderer.setRenderTarget(null);
  out.scene = scan(composer.readBuffer);
  // 3. bloom internal targets after a full render
  composer.render(); out.bright = scan(bloom.renderTargetBright); out.mip0 = scan(bloom.renderTargetsVertical[0]); out.readAfterBloom = scan(composer.readBuffer);
  // 4. bloom off
  bloom.enabled=false; composer.render(); out.bloomOff = bright(); bloom.enabled=true;
  composer.render(); out.png = renderer.domElement.toDataURL('image/png');
  return out;
});
fs.writeFileSync((process.env.S||'/tmp')+'/bf-'+VIEW+'.png', Buffer.from(r.png.split(',')[1],'base64')); delete r.png; console.log(VIEW, JSON.stringify(r));
await browser.close(); server.close();
