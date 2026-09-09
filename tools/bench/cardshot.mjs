/* RAIL CARD ART: A DESTINATION, NOT A MAP.

   The first set was rejected on sight and the critique was right on every count — pulled too wide,
   pale daylight, water and empty sand doing most of the work, the subject a speck, and all three
   interchangeable at card size. That set was framed to prove the geometry exists. A rail card has
   the opposite job: it has to sell the character of a place at about 380 x 220 px, where anything
   that is not the subject is noise.

   Four things changed, and none of them is the source. There is no photography of these three
   districts; the model is what exists. What was wrong was the treatment.

     TARGET   the district's own dense core, computed from its baked footprints rather than its
              centre. Zayed City's centre is half water and empty parcels; its BUILT ground is
              elsewhere, and that is what the card is about.
     DISTANCE close enough that the subject fills the frame and the boundary runs off the edges.
              Showing where a district stops is a map's job.
     LIGHT    dusk. The palette the rest of the rail already lives in, and the only one of the
              three that gives a low sun, long shadows and a sky worth having behind a skyline.
     PITCH    a low oblique, 15-25 degrees, so buildings have elevation and the ground has depth.
              Top-down flattens a city into a plan drawing.

   Each entry below is deliberate rather than a formula, because the three subjects are different
   shapes: a wide even grid, a tight cluster, and one large building. */
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium } from 'playwright-core';
const __dir = new URL('.', import.meta.url).pathname;
const ROOT = path.resolve(__dir, '../..');
const OUT  = path.join(__dir, 'out') + '/';

/* ax/az: the dense core in island units (tools computed it from the bake — see the header).
   dist/elev: scene units. fov: degrees. ang: camera bearing, chosen per subject so the light
   rakes across the frame rather than flattening it. */
const CARDS = {
  // A big even grid: sit low and far enough back that streets and blocks run to every edge.
  zayed:   { ax:-251.3, az:156.3, dist:340, elev:105, ang:2.05, fov:40 },
  // 74% of the built area is in six cells: get close, keep the pitch low, let the cluster fill.
  masdar:  { ax:25.3,  az:-28.7, dist:150, elev:44,  ang:2.35, fov:40 },
  // One building is the subject. Close, oblique enough to read the X and the shell's curve,
  // high enough that the apron and the parked aircraft are in frame under it.
  airport: { ax:-23.6, az:-18.3, dist:300, elev:96,  ang:2.55, fov:40 },
};

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
/* 1280 x 854 is the card's 3:2 at double the 640 x 427 the webps ship at, so the downsample has
   something to lose rather than nothing. */
const page = await browser.newPage({viewport:{width:1280,height:854}});
page.on('pageerror',e=>console.log('PAGEERROR', String(e.stack||e.message).split('\n').slice(0,3).join(' | ')));
const VIEW = process.env.VIEW || 'dusk';
const IDS = (process.argv[2] || Object.keys(CARDS).join(',')).split(',');

await page.goto(`http://127.0.0.1:${port}/world-nav.html?embed=1&rail=0&fp&view=${VIEW}&nowarm=1`,{waitUntil:'load',timeout:180000});
await page.waitForFunction(()=>window.W2H&&window.W2H.DISTRICTS,null,{timeout:120000});
/* The three mainland districts are onDemand now, so a card shot has to ask for them explicitly —
   go() is the same deliberate visit a rail tap makes. */
/* NO waitForFunction ON A BUILD COUNT, AND NO PRE-WARM LOOP. The three mainland districts are
   onDemand, so any wait for "all built" can never be satisfied and burns its whole timeout; and
   a page.evaluate issued while a district is mid-build does not come back, which is what hung
   the first version of this file for twenty minutes. Fixed sleeps only — those are answered by
   the harness, not by the page's main thread. One district per run, so one build is in flight
   at a time and the wait can be sized for it. */
await page.waitForTimeout(12000);
await page.evaluate(()=>{ const s=window.W2H.DISTRICTS[0].group.parent.parent; (function w(o){ if(o.isMesh&&o.userData&&o.userData.warmHidden){o.userData.warmHidden=false;o.visible=true;} (o.children||[]).forEach(w); })(s); });
// embed=1 leaves the Back pill and the two control chips on screen; they were baked into the last set.
await page.addStyleTag({content:'#back,.views,.chip,#hud,#err{display:none !important}'});

for (const id of IDS){
  const c = CARDS[id]; if (!c) continue;
  await page.evaluate(i=>window.W2H.go(i), id);
  await page.waitForTimeout(30000);   // the on-demand build is synchronous; do not talk to the page during it
  await page.evaluate(([id, c])=>{
    const d = window.W2H.DISTRICTS.find(x=>x.id===id);
    const s = d.dispScale || 1;
    const g = window.W2H.goal, cur = window.W2H.cur;
    g.target.set(d.x + c.ax * s, 3, d.z + c.az * s);
    g.dist = c.dist; g.elev = c.elev; g.angle = c.ang; g.fov = c.fov;
    cur.target.copy(g.target); cur.dist=g.dist; cur.elev=g.elev; cur.angle=g.angle; cur.fov=g.fov;
  }, [id, c]);
  await page.waitForTimeout(9000);
  await page.screenshot({ timeout:150000, path: OUT + 'card2-' + id + '.png' });
  console.log('shot', id, VIEW);
}
await browser.close(); server.close();
