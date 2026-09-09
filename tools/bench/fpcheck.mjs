/* DID THE FOOTPRINTS ACTUALLY ARRIVE AFTER THE SPLIT.

   The buildings moved out of isle-<id>.json into fp-<id>.json so the island can be drawn before
   they land. errcheck3 proves the world still builds; it says nothing about whether the twenty
   thousand buildings ever turn up, and "the island appears instantly and stays empty" would pass
   every check this repository has.

   So this asks for the two numbers that can only both exist if the sidecar was fetched, parsed and
   consumed: fpState (pending / on / none) and d.fpRaw, which addFootprints sets to the payload
   length BEFORE the coastline clip. */
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
const page = await browser.newPage({viewport:{width:412,height:915}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,140)));
const fetched = [];
page.on('response', r => { const u = r.url(); if (/\/(fp|isle)-[a-z]+\.json/.test(u)) fetched.push(`${r.status()} ${u.split('/').pop().split('?')[0]}`); });
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForTimeout(30000);
const rows = await page.evaluate(()=>window.W2H.DISTRICTS.map(d=>({ id:d.id, built:!!d.built, fpRaw:d.fpRaw||0 })));
console.log('district   built  fpRaw (buildings consumed from the sidecar)');
for (const r of rows) console.log('  '+r.id.padEnd(10), String(r.built).padEnd(6), r.fpRaw);
console.log('\npayload requests:'); for (const f of [...new Set(fetched)]) console.log('  ' + f);
await browser.close(); server.close();
