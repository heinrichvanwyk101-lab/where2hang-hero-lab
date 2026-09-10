/* TAP WIRING CHECK: in world view, tap the centre of each island and report where the world went.
   Same bootstrap as closeup.mjs. Usage: node tools/bench/tapcheck.mjs [id,id,...] */
import { chromium } from 'playwright-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  const u = new URL(req.url, 'http://x'); let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(f);
  if (f.endsWith('.html')) body = body.toString()
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js','/node_modules/three/build/three.module.js')
    .replace('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/','/node_modules/three/examples/jsm/');
  res.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); res.end(body);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port = server.address().port;
const IDS = (process.argv[2] || 'reem,maryah,corniche,saadiyat,yas,raha,zayed,masdar,airport').split(',');
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport:{ width:Number(process.env.W2H_W||412), height:915 }, deviceScaleFactor:1 });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=day&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
await page.waitForFunction(()=>window.W2H.DISTRICTS.filter(d=>d.built).length>=6,null,{timeout:240000}).catch(()=>console.log('not all eager districts built'));
await page.waitForTimeout(4000);
for (const id of IDS){
  await page.evaluate(()=>window.W2H.world());
  await page.waitForTimeout(3500);
  const pt = await page.evaluate(id=>{
    const d = window.W2H.DISTRICTS.find(x=>x.id===id); if (!d || !d.group) return null;
    /* A point ON THE LAND, not the group origin — Al Raha's origin is in its lagoon. The first
       place anchor is always on the island; fall back to the origin where there is none. */
    const V = d.group.position.constructor;
    let w;
    if (d.placeAnchors && d.placeAnchors.length && window.W2H.anchorWorld){ const a = window.W2H.anchorWorld(d, d.placeAnchors[0]); w = new V(a.x, a.y, a.z); }
    else w = d.group.getWorldPosition(new V());
    const v = w.clone().project(window.W2H.camera);
    return { x:(v.x*0.5+0.5)*window.innerWidth, y:(-v.y*0.5+0.5)*window.innerHeight, behind: v.z>1 };
  }, id);
  if (!pt || pt.behind || pt.x<0 || pt.x>Number(process.env.W2H_W||412) || pt.y<0 || pt.y>915){ console.log(id.padEnd(9), 'centre off screen', JSON.stringify(pt)); continue; }
  const under = await page.evaluate(([x,y])=>{ const el=document.elementFromPoint(x,y); return el ? (el.tagName+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:'')) : 'none'; }, [pt.x, pt.y]);
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(1500);
  const got = await page.evaluate(()=>[window.W2H.district(), window.W2H.state()]);
  console.log(id.padEnd(9), 'tap at', pt.x.toFixed(0), pt.y.toFixed(0), 'on', under, '->', got[0], got[0]===id ? 'OK' : 'WRONG');
}
await browser.close(); server.close();
