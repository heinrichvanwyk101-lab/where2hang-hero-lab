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
const members = [1,2,3,4].map(i=>({venueId:'m'+i, name:'Shop '+i, category:'Cafe', rating:4.2}));
const pts = [
  {id:'yas', x:18538, z:-396, dest:'Yas Mall', name:'Yas Mall', members},
  {id:'yas', x:18000, z:-1200, venueId:'s1', name:'Solo venue', category:'Bar'},
];
await page.evaluate(()=>window.postMessage({w2h:true,type:"setDistrict",id:"yas"},"*"));
await page.waitForTimeout(1500);
await page.evaluate(pts=>window.postMessage({w2h:true,type:"setResultsReal",label:"Yas Island",island:"yas",points:pts},"*"), pts);
page.on("console", m=>{ if(/setResultsReal|descend|warn/i.test(m.text())) console.log("CONSOLE2", m.text().slice(0,200)); });
await page.waitForTimeout(22000);
const pins = await page.evaluate(()=>[...document.getElementById('pinLayer').children].map(e=>e.className+':'+e.textContent));
console.log('pins', JSON.stringify(pins));
const g0 = await page.evaluate(()=>({d:Math.round(window.W2H.goal.dist), tx:Math.round(window.W2H.goal.target.x)}));
await page.evaluate(()=>{ const el=[...document.getElementById('pinLayer').children].find(e=>e.className.includes('dest')); el && el.click(); });
await page.waitForTimeout(1000);
const g1 = await page.evaluate(()=>({d:Math.round(window.W2H.goal.dist), tx:Math.round(window.W2H.goal.target.x), cardOn: document.getElementById('venueCard').classList.contains('on')}));
console.log('first tap: before', JSON.stringify(g0), 'after', JSON.stringify(g1));
await page.evaluate(()=>{ const g=window.W2H.goal, c=window.W2H.cur; c.target.copy(g.target); c.dist=g.dist; c.elev=g.elev; c.angle=g.angle; });
await page.waitForTimeout(8000);
await page.evaluate(()=>{ const el=[...document.getElementById('pinLayer').children].find(e=>e.className.includes('dest')); el && el.click(); });
await page.waitForTimeout(1000);
const card = await page.evaluate(()=>({on: document.getElementById('venueCard').classList.contains('on'), name: document.getElementById('vcName').textContent, meta: document.getElementById('vcMeta').textContent, rows: document.querySelectorAll('#vcList .vcRow').length}));
console.log('second tap card', JSON.stringify(card));
console.log('errors:', errs.length, errs.slice(0,3).join(' | '));
await browser.close(); server.close();
