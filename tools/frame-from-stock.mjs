/* A DISTRICT FRAME TRACED FROM ITS OWN BUILDINGS.

   The mainland districts were framed with hand-typed rectangles, and where a rectangle does not
   meet real coastline the ground simply stops on a ruled line — Zayed City's south and east edges
   read as a cut rather than an edge. Al Raha does not have this problem because its frame is 21
   points traced along the shore and the E10.

   Tracing by eye does not scale and I have already mis-drawn three frames in this file's history.
   So the boundary comes from the stock instead: rasterise the surveyed footprints, close the gaps
   between streets, take the largest blob and walk its edge. What comes out follows where the city
   actually is, which is the same thing a careful hand-trace would be reaching for, and it cannot
   enclose desert the way a bounding box does.

   Run: node tools/frame-from-stock.mjs <id> [cell_m] [dilate_cells] [simplify_m]
   Prints an outlineLL ready to paste into ISLANDS in bake-city.mjs. Writes nothing. */
import fs from 'node:fs';
const R = 6378137, OLAT = 24.49, OLON = 54.42, C = Math.cos(OLAT * Math.PI / 180);
const toLat = y => y / ((Math.PI/180) * R) + OLAT;
const toLon = x => x / ((Math.PI/180) * R * C) + OLON;

const id = process.argv[2] || 'zayed';
const CELL = +(process.argv[3] || 150);      // metres
const DIL  = +(process.argv[4] || 2);        // cells of dilation — bridges streets and car parks
const SIMP = +(process.argv[5] || 220);      // metres of simplification tolerance

const isle = JSON.parse(fs.readFileSync(new URL(`../data/isle-${id}.json`, import.meta.url), 'utf8'));
const idx  = JSON.parse(fs.readFileSync(new URL('../data/index.json', import.meta.url), 'utf8'));
/* THE PAYLOAD IS ABSOLUTE METRES, not island-local scene units. buildingsUnits in w2h-basemap.js
   is what produces the local x/z/dp form, and it runs at load time in the browser — the artefact
   on disk keeps the bake's own frame: x, y in emirate metres, w and d in metres. The first cut of
   this script read b.z and b.dp, got undefined, and rasterised 6,297 footprints into zero cells
   without complaining, because Math.floor(NaN) indexes nothing. */
const pts = isle.buildings.map(b => [b.x, b.y]);
if (!pts.length) throw new Error(id + ': no buildings to trace');

const x0 = Math.min(...pts.map(p=>p[0])) - CELL*(DIL+2), x1 = Math.max(...pts.map(p=>p[0])) + CELL*(DIL+2);
const y0 = Math.min(...pts.map(p=>p[1])) - CELL*(DIL+2), y1 = Math.max(...pts.map(p=>p[1])) + CELL*(DIL+2);
const W = Math.ceil((x1-x0)/CELL), H = Math.ceil((y1-y0)/CELL);
let g = new Uint8Array(W*H);
for (const [x,y] of pts) g[Math.min(H-1,Math.floor((y-y0)/CELL))*W + Math.min(W-1,Math.floor((x-x0)/CELL))] = 1;
const solid = g.reduce((a,b)=>a+b,0);

/* Dilate, then erode by one less — a morphological close, so streets and car parks are bridged
   without the whole blob swelling by the full dilation radius. */
const grow = (src, n) => { let a = src;
  for (let k=0;k<n;k++){ const b = new Uint8Array(W*H);
    for (let j=0;j<H;j++) for (let i=0;i<W;i++){ if(!a[j*W+i]) continue;
      for (let dj=-1;dj<=1;dj++) for (let di=-1;di<=1;di++){
        const nj=j+dj, ni=i+di; if(nj<0||nj>=H||ni<0||ni>=W) continue; b[nj*W+ni]=1; } }
    a=b; } return a; };
const shrink = (src, n) => { let a = src;
  for (let k=0;k<n;k++){ const b = new Uint8Array(W*H);
    for (let j=0;j<H;j++) for (let i=0;i<W;i++){ if(!a[j*W+i]) continue;
      let all=1; for (let dj=-1;dj<=1&&all;dj++) for (let di=-1;di<=1;di++){
        const nj=j+dj, ni=i+di; if(nj<0||nj>=H||ni<0||ni>=W||!a[nj*W+ni]){all=0;break;} }
      b[j*W+i]=all; }
    a=b; } return a; };
g = shrink(grow(g, DIL), Math.max(0, DIL-1));

/* Largest connected blob, so an outlying compound does not drag the frame across empty ground. */
const lab = new Int32Array(W*H).fill(-1); let best=[], nb=0;
for (let s=0;s<W*H;s++){ if(!g[s]||lab[s]>=0) continue;
  const q=[s], cur=[]; lab[s]=nb;
  while(q.length){ const c=q.pop(); cur.push(c);
    const ci=c%W, cj=(c-ci)/W;
    for (let dj=-1;dj<=1;dj++) for (let di=-1;di<=1;di++){
      const nj=cj+dj, ni=ci+di; if(nj<0||nj>=H||ni<0||ni>=W) continue;
      const t=nj*W+ni; if(g[t]&&lab[t]<0){lab[t]=nb;q.push(t);} } }
  if (cur.length>best.length) best=cur; nb++; }
const keep = new Uint8Array(W*H); for (const c of best) keep[c]=1;

/* Walk the boundary: square-tracing (Moore neighbourhood) round the outside of the blob. */
const at=(i,j)=> (i<0||i>=W||j<0||j>=H) ? 0 : keep[j*W+i];
let sx=-1, sy=-1;
outer: for (let j=0;j<H;j++) for (let i=0;i<W;i++) if(at(i,j)){ sx=i; sy=j; break outer; }
const N8=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const ring=[]; let cx=sx, cy=sy, dir=6;
for (let guard=0; guard<W*H*8; guard++){
  ring.push([cx,cy]);
  let moved=false;
  for (let k=0;k<8;k++){ const d=(dir+5+k)%8; const [dx,dy]=N8[d];
    if (at(cx+dx, cy+dy)){ cx+=dx; cy+=dy; dir=d; moved=true; break; } }
  if (!moved) break;
  if (cx===sx && cy===sy) break;
}
/* Douglas-Peucker in metres. */
const dp=(p,tol)=>{ if(p.length<3) return p;
  const d=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;
    let t=L?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L:0;t=t<0?0:t>1?1:t;
    return Math.hypot(q[0]-(a[0]+dx*t), q[1]-(a[1]+dy*t));};
  let mi=0,md=0; for(let i=1;i<p.length-1;i++){const v=d(p[i],p[0],p[p.length-1]); if(v>md){md=v;mi=i;}}
  if(md<=tol) return [p[0],p[p.length-1]];
  return dp(p.slice(0,mi+1),tol).slice(0,-1).concat(dp(p.slice(mi),tol)); };
let world = ring.map(([i,j]) => [x0 + (i+0.5)*CELL, y0 + (j+0.5)*CELL]);

/* A HARD WEST LIMIT, because the stock does not know where the neighbouring district ends. Zayed
   City's built area runs on past Corniche's fetch box and the trace followed it, which would have
   handed the Grand Mosque precinct to two districts at once — the exact fault the frame was
   trimmed to 54.4900 to fix in the first place. W2H_CLIP_W is that limit, in longitude. */
if (process.env.W2H_CLIP_W){
  const lim = (+process.env.W2H_CLIP_W - OLON) * (Math.PI/180) * R * C;
  world = world.map(([x,y]) => [Math.max(x, lim), y]);
}
let simp = dp(world, SIMP);

/* CHAIKIN, BECAUSE A GRID TRACE IS A STAIRCASE. The boundary comes off a raster, so every segment
   is axis-aligned and the result reads as a ruled line the same way the rectangle did — worse, in
   fact, since it is now several of them. Two rounds of corner-cutting turns the steps into a
   boundary that reads as an edge of a city rather than an edge of a grid, and moves no vertex more
   than half a cell. */
for (let k = 0; k < 2; k++){
  const out = [];
  for (let i = 0; i < simp.length; i++){
    const a = simp[i], b = simp[(i+1) % simp.length];
    out.push([a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25]);
    out.push([a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75]);
  }
  simp = out;
}
simp = dp(simp, SIMP * 0.35);

const area = P => { let s=0; for(let i=0;i<P.length;i++){const q=P[(i+1)%P.length]; s+=P[i][0]*q[1]-q[0]*P[i][1];} return Math.abs(s/2)/1e6; };
console.log(`${id}: ${pts.length} footprints, ${solid} cells solid at ${CELL} m, close ${DIL}`);
console.log(`  boundary ${ring.length} cells -> ${simp.length} vertices at ${SIMP} m tolerance`);
console.log(`  traced area ${area(simp).toFixed(1)} km2`);
console.log('\n    outlineLL: [');
for (let i=0;i<simp.length;i+=3){
  console.log('      ' + simp.slice(i,i+3).map(([x,y]) =>
    '['+toLon(x).toFixed(4)+','+toLat(y).toFixed(4)+']').join(', ') + ',');
}
console.log('    ],');
