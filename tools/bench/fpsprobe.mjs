/* WHAT THE WORLD ACTUALLY RUNS AT, ON SOMETHING LIKE A PHONE.

   The owner's screen recordings show the home page stalling repeatedly once the world is up, and
   the recordings alone cannot settle why: freezedetect finds ~0.4 s windows of total stillness
   over and over, while mpdecimate counts about twenty changed frames a second. Both are true of
   the same file — one measures "nothing moved at all", the other "some pixel differs" — and a
   compressed 1080x2520 capture of a slowly panning camera is exactly where those two diverge.

   So this asks the renderer instead. world-nav exposes renderer.info.render.frame; sampling it
   once a second gives real frames per second, and doing that under CDP CPU throttling gives it on
   something with a phone's budget rather than a runner's. A dip in the series is a stall, and its
   position in time says what caused it — the island build pump runs on a 1.4 s cadence after
   Corniche, so pump stalls appear as a regular comb rather than as a low flat line. */
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
const RATE = Number(process.env.CPU_THROTTLE || 4);
const SECS = Number(process.env.SECS || 45);
const browser = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage']});
const page = await browser.newPage({viewport:{width:412,height:915}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.message).slice(0,140)));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
console.log(`CPU throttling x${RATE}, sampling ${SECS}s`);
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp`,{waitUntil:'commit',timeout:180000});
let readyAt = null;
page.on('console', () => {});
await page.waitForFunction(()=>window.W2H&&window.W2H.frames,null,{timeout:180000});
console.log(`W2H present at ${((Date.now()-t0)/1000).toFixed(1)}s`);
let prev = await page.evaluate(()=>window.W2H.frames());
const series = [];
for (let i = 0; i < SECS; i++){
  await page.waitForTimeout(1000);
  const now = await page.evaluate(()=>({ f:window.W2H.frames(),
    built:window.W2H.DISTRICTS.filter(d=>d.built).length, n:window.W2H.DISTRICTS.length }));
  series.push({ t:i+1, fps: now.f - prev, built: now.built, of: now.n });
  prev = now.f;
}
const line = series.map(s => `${String(s.t).padStart(2)}s ${String(s.fps).padStart(3)}fps built ${s.built}/${s.of}`);
for (let i = 0; i < line.length; i += 3) console.log(line.slice(i, i+3).join('   |   '));
const active = series.filter(s => s.t > 5);
const med = active.map(s=>s.fps).sort((a,b)=>a-b)[Math.floor(active.length/2)];
console.log(`median fps after 5s: ${med};  seconds under 10 fps: ${active.filter(s=>s.fps<10).length}/${active.length}`);
await browser.close(); server.close();
