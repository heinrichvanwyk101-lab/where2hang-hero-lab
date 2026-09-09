/* DOES THE OPENING LOAD STAY LIGHT, AND DO THE THREE STILL ARRIVE WHEN ASKED?
   Both halves matter: deferring a district is only correct if a rail tap still gets you a built
   one. Reports the settled build set at load, then taps each deferred district and re-reads it. */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const MIME = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.ndjson':'text/plain','.png':'image/png'};
const server = http.createServer((req,res)=>{
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? '/world-nav.html' : u);
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
const page = await browser.newPage({viewport:{width:420,height:900}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
const read = () => page.evaluate(()=>({
  built: window.W2H.DISTRICTS.filter(d=>d.built).map(d=>d.id).join(','),
  pending: window.W2H.DISTRICTS.filter(d=>d.pending).map(d=>d.id).join(','),
}));
const t0 = Date.now(); let last='';
for (let i=0;i<8;i++){
  const s = await read();
  if (s.built !== last){ console.log('t+'+((Date.now()-t0)/1000).toFixed(0)+'s built: '+s.built); last = s.built; }
  await page.waitForTimeout(5000);
}
console.log('--- settled ---', JSON.stringify(await read()));
for (const id of ['zayed','masdar','airport']){
  const t = Date.now();
  await page.evaluate(i=>window.W2H.go(i), id);
  await page.waitForFunction(i=>{ const d=window.W2H.DISTRICTS.find(x=>x.id===i); return d && d.built; }, id, {timeout:120000})
    .then(()=>console.log('tap '+id+': built in '+((Date.now()-t)/1000).toFixed(1)+'s'))
    .catch(()=>console.log('tap '+id+': DID NOT BUILD'));
}
await browser.close(); server.close();
