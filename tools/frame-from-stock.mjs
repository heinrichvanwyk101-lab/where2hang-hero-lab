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
/* TWO THINGS BROKE THIS SINCE IT WAS WRITTEN, AND BOTH ARE FIXED HERE.

   FIRST, isle.buildings IS EMPTY NOW. The bake splits footprints into data/fp-<id>.json so the
   island shell stays small, and the key was left in place as an empty array — so this rasterised
   nothing and threw "no buildings to trace" rather than reporting a moved file. Read the split
   file when the shell has none.

   SECOND, AND THIS IS THE REAL FAULT: tracing the BAKED island is a feedback loop. Those
   footprints have already been clipped to within CLIP_MARGIN_M of the frame this trace is meant
   to replace, so a pass can only ever push the boundary out by that margin, and the run recorded
   as converging after three passes ("a third pass moves 1") was the loop throttling itself. It is
   visible on the ground: Zayed City's north edge stops mid-suburb with streets and stock 500 m
   beyond it, and Overture shows continuous land for another 1.6 km after that.

   W2H_STOCK points at an unclipped export of the fetch box — the raw building centroids the bake
   itself sees and throws away, fetched by .github/workflows/overture-window.yml with stock=true.
   Trace from that and the boundary can reach the actual edge of the city in one pass. */
let pts;
if (process.env.W2H_STOCK){
  const raw = JSON.parse(fs.readFileSync(process.env.W2H_STOCK, 'utf8'));
  const K2 = Math.cos(OLAT * Math.PI / 180), D = Math.PI / 180;
  pts = raw.pts.map(([lon, lat]) => [(lon - OLON) * D * R * K2, (lat - OLAT) * D * R]);
  process.stderr.write(`  ${pts.length} unclipped centroids from ${process.env.W2H_STOCK}\n`);
} else {
  let stock = isle.buildings;
  if (!stock || !stock.length){
    const fp = new URL(`../data/fp-${id}.json`, import.meta.url);
    stock = JSON.parse(fs.readFileSync(fp, 'utf8')).buildings;
    process.stderr.write(`  ${stock.length} footprints from fp-${id}.json (the shell carries none)\n`);
    process.stderr.write(`  NOTE: these are CLIPPED to the current frame — set W2H_STOCK to trace honestly\n`);
  }
  pts = stock.map(b => [b.x, b.y]);
}

/* VENUES SEED THE RASTER TOO, AND LEAVING THEM OUT COST 43 OF THEM.

   The whole reason these districts exist is to give venues a home, so a frame traced only from
   building footprints is measuring the wrong thing: it drew Zayed City tight enough to exclude
   The Boundary, the Athletics Club, Wave Bar and forty others that sit on graded parcels and
   sports ground where Overture has no footprint to rasterise. They classified into the district
   by its bounding box and then fell outside its outline, which means no pin at all — the exact
   failure the district was added to fix.

   W2H_SEEDS takes a JSON array of [x, y] in emirate metres and adds them to the raster before the
   close, so the boundary covers where people actually go as well as where buildings stand. */
if (process.env.W2H_SEEDS){
  const seeds = JSON.parse(fs.readFileSync(process.env.W2H_SEEDS, 'utf8'));
  const e2 = idx.islands.find(i => i.id === id).extent;
  const near = seeds.filter(([x,y]) => x >= e2.x0-1500 && x <= e2.x1+1500 && y >= e2.y0-1500 && y <= e2.y1+1500);
  pts = pts.concat(near);
  process.stderr.write(`  ${near.length} venue seeds added to ${isle.buildings.length} footprints\n`);
}
/* THE INTENT BOX, AND IT IS NOT A FAILING OF THE TRACE THAT IT NEEDS ONE.

   On an island the stock defines its own boundary: the sea ends it. On the mainland it does not —
   Zayed City's fabric runs unbroken into Khalifa City, Mussafah and the Corniche, so the largest
   connected blob of an unclipped window is the window, not a district. Where a district ENDS is a
   decision about what the model should show; all a trace can do is follow the real edge of the
   city wherever one exists inside that decision.

   So W2H_BOX states the decision — "s,w,n,e" in degrees — and the trace refines the edge within
   it. Where the city genuinely stops inside the box the boundary follows the buildings; where it
   runs on past, the boundary is the box, which is what every mainland frame here already is. That
   is a smaller claim than "traced from the stock" and it is the true one.

   Generalises W2H_CLIP_W below, which does the same job for one edge and is kept because Zayed
   City's west limit is a district hand-off rather than an extent. */
if (process.env.W2H_BOX){
  const [bs, bw, bn, be] = process.env.W2H_BOX.split(',').map(Number);
  const K3 = Math.cos(OLAT * Math.PI / 180), D3 = Math.PI / 180;
  const [mx0, my0] = [(bw - OLON) * D3 * R * K3, (bs - OLAT) * D3 * R];
  const [mx1, my1] = [(be - OLON) * D3 * R * K3, (bn - OLAT) * D3 * R];
  const before = pts.length;
  pts = pts.filter(([x, y]) => x >= mx0 && x <= mx1 && y >= my0 && y <= my1);
  process.stderr.write(`  intent box ${bs},${bw},${bn},${be} keeps ${pts.length} of ${before}\n`);
}
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

/* THE BOUNDARY AS CELL EDGES, NOT AS A WALK — AND THE WALK IS WHY THIS IS BEING REWRITTEN.

   The previous version square-traced the blob with a Moore neighbourhood, which works on a compact
   shape and fails silently on a complicated one: on the unclipped Zayed City stock it returned
   after three cells and reported a two-vertex boundary enclosing no area, having found a spur it
   could walk out of and straight back into. A trace that can return "0.0 km2" without erroring is
   not a tool anybody can rely on twice.

   So the boundary is CONSTRUCTED rather than walked. Every side of every solid cell whose
   neighbour is empty is a piece of the boundary, exactly and by definition; emit each as a
   directed segment oriented counter-clockwise around solid ground, then chain them head to tail.
   There is no traversal state to get stuck in, spurs and one-cell isthmuses come out correctly,
   and holes fall out as their own rings for free.

   Cell (i,j) spans x in [i, i+1] and y in [j, j+1] cells from the raster origin; corners are held
   as integers so chaining is an exact key lookup rather than a distance test. */
const solidAt = (i,j) => (i<0||i>=W||j<0||j>=H) ? 0 : keep[j*W+i];
const segs = new Map();                       // "x,y" of the tail -> [head]
for (let j=0;j<H;j++) for (let i=0;i<W;i++){
  if (!solidAt(i,j)) continue;
  if (!solidAt(i,   j-1)) segs.set(`${i},${j}`,     [i+1, j    ]);   // bottom, left to right
  if (!solidAt(i+1, j  )) segs.set(`${i+1},${j}`,   [i+1, j+1  ]);   // right, up
  if (!solidAt(i,   j+1)) segs.set(`${i+1},${j+1}`, [i,   j+1  ]);   // top, right to left
  if (!solidAt(i-1, j  )) segs.set(`${i},${j+1}`,   [i,   j    ]);   // left, down
}
const rings = [];
while (segs.size){
  const startKey = segs.keys().next().value;
  let [cx, cy] = startKey.split(',').map(Number);
  const ring = [];
  for (;;){
    const k = `${cx},${cy}`;
    const nxt = segs.get(k);
    if (!nxt) break;
    segs.delete(k);
    ring.push([cx, cy]);
    [cx, cy] = nxt;
    if (cx === +startKey.split(',')[0] && cy === +startKey.split(',')[1]) break;
  }
  if (ring.length >= 4) rings.push(ring);
}
/* The outer boundary is the ring of greatest area. A hole is a ring of the opposite winding, and
   a district frame is a single closed shape, so the holes are dropped rather than carried — the
   bake's own coastline clip is what puts water back inside a district. */
const ringArea = P => { let a=0; for(let i=0;i<P.length;i++){const q=P[(i+1)%P.length]; a+=P[i][0]*q[1]-q[0]*P[i][1];} return a/2; };
rings.sort((a,b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
const ring = rings[0] || [];
if (!ring.length) throw new Error(id + ': the stock rasterised to no boundary at all');
process.stderr.write(`  ${rings.length} boundary ring(s), outer has ${ring.length} corners\n`);

/* Douglas-Peucker in metres. */
const dp=(p,tol)=>{ if(p.length<3) return p;
  const d=(q,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy;
    let t=L?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L:0;t=t<0?0:t>1?1:t;
    return Math.hypot(q[0]-(a[0]+dx*t), q[1]-(a[1]+dy*t));};
  let mi=0,md=0; for(let i=1;i<p.length-1;i++){const v=d(p[i],p[0],p[p.length-1]); if(v>md){md=v;mi=i;}}
  if(md<=tol) return [p[0],p[p.length-1]];
  return dp(p.slice(0,mi+1),tol).slice(0,-1).concat(dp(p.slice(mi),tol)); };
/* Corners, not cell centres: the ring is made of cell EDGES now, so a corner is already the
   boundary's own position and the half-cell offset the walk needed would push it outward. */
let world = ring.map(([i,j]) => [x0 + i*CELL, y0 + j*CELL]);

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
