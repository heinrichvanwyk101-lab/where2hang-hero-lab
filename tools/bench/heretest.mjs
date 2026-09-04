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
const errs=[]; page.on('pageerror',e=>errs.push(String(e.message).slice(0,200)));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1&cam=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:200000}).catch(()=>console.log('not all built'));
// on-model: Yas Mall's landmark (18978, -528); off-model: Khalifa City (24.42 N, 54.60 E) clamped to Yas's south edge
await page.evaluate(()=>window.postMessage({w2h:true,type:"setHere",id:"yas",x:18978,z:-528,off:false},"*"));
await page.waitForTimeout(6000);
const pin1 = await page.evaluate(()=>{ const el=document.querySelector('.w2hPin.here'); return el ? {text: el.textContent, display: el.style.display, left: el.style.left} : null; });
console.log('here pin on-model', JSON.stringify(pin1));
await page.evaluate(()=>window.postMessage({w2h:true,type:"goHere"},"*"));
await page.waitForTimeout(1500);
const g1 = await page.evaluate(()=>({d:Math.round(window.W2H.goal.dist), tx:Math.round(window.W2H.goal.target.x), tz:Math.round(window.W2H.goal.target.z), crumb: document.getElementById('crumb').textContent}));
console.log('goHere goal', JSON.stringify(g1));
await page.evaluate(()=>window.postMessage({w2h:true,type:"setHere",id:"yas",x:18240,z:-4064,off:true,distKm:3.7,bearing:"S"},"*"));
await page.evaluate(()=>window.postMessage({w2h:true,type:"goHere"},"*"));
await page.waitForTimeout(6000);
const pin2 = await page.evaluate(()=>{ const el=document.querySelector('.w2hPin.here'); return {text: el && el.textContent, cardOn: document.getElementById('venueCard').classList.contains('on'), name: document.getElementById('vcName').textContent, meta: document.getElementById('vcMeta').textContent}; });
console.log('off-model', JSON.stringify(pin2));
console.log('errors:', errs.length, errs.slice(0,3).join(' | '));
await browser.close(); server.close();
