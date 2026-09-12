/* TERMINAL A, TRACED FROM ITS OWN SURVEYED FOOTPRINT.

   Zayed International's terminal comes out of the bake as OSM relation -20328079: one ring of 157
   vertices, 1191 x 1082 m, 230,726 m2. Extruded flat that ring is a dark comb — the X-plan reads,
   but every one of the fifty-odd teeth along the pier flanks is drawn as a 53 m wall, and the
   building has no roof, no glass and no identity.

   THE TEETH ARE NOT NOISE, THEY ARE THE GATES. Each notch is one aircraft stand: the setback
   between two nose-in parking positions, surveyed. So the same operation that cleans the outline
   also enumerates the stands, and neither has to be invented:

     closed        = raster of the ring, morphologically closed at 40 m  -> the true envelope
     closed - raw  = the notches                                        -> one blob per stand
     dist(closed)  = distance to the envelope edge                      -> the fat middle is the
                                                                           processor, the thin
                                                                           arms are the piers

   Everything this file emits is measured. Nothing here is placed by eye, and re-running it after a
   re-bake is how the kit follows the survey rather than drifting from it.

   Output is kit-local metres with NORTH NEGATED — the bake stores p as offsets with +y north, and
   every kit in w2h-city.js places through an at() whose second argument runs to +z, which is
   south. Flipping here means the kit can carry ROT 0 and sit exactly on the footprint it came
   from. Getting this backwards mirrors the building about its long axis and nothing downstream
   would complain. */
import { readFile, writeFile } from 'node:fs/promises';

const CELL = 8;         // raster cell, metres
const DIL  = 5;         // close radius in cells — 40 m, wide enough to bridge a stand notch
const CORE_THR = 0.52;  // share of the maximum half-width that counts as processor, not pier

/* The footprints moved out of isle-airport.json into fp-airport.json when the islands were baked
   (world v348); the ring is read from wherever it is. */
const j = await (async () => { for (const f of ['../data/fp-airport.json', '../data/isle-airport.json']){ const d = JSON.parse(await readFile(new URL(f, import.meta.url), 'utf8')); if ((d.buildings || []).some(x => x.osm === -20328079)) return d; } return {}; })();
const b = (j.buildings || []).find(x => x.osm === -20328079);
if (!b || !b.p) throw new Error('terminal-a-trace: relation -20328079 has no ring in the bake');
const P = b.p;

const xs = P.map(q => q[0]), ys = P.map(q => q[1]);
const x0 = Math.min(...xs) - 60, y0 = Math.min(...ys) - 60;
const NX = Math.ceil((Math.max(...xs) + 60 - x0) / CELL);
const NY = Math.ceil((Math.max(...ys) + 60 - y0) / CELL);
const at = (c, r) => [x0 + (c + 0.5) * CELL, y0 + (r + 0.5) * CELL];

function inPoly(px, py){
  let n = false;
  for (let i = 0, k = P.length - 1; i < P.length; k = i++){
    const a = P[i], d = P[k];
    if ((a[1] > py) !== (d[1] > py) && px < (d[0]-a[0]) * (py-a[1]) / (d[1]-a[1]) + a[0]) n = !n;
  }
  return n;
}
const raw = new Uint8Array(NX * NY);
for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++){
  const [px, py] = at(c, r); if (inPoly(px, py)) raw[r*NX+c] = 1;
}

function morph(src, rad, grow){
  const out = new Uint8Array(NX * NY);
  for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++){
    let hit = false;
    for (let dr = -rad; dr <= rad && !hit; dr++) for (let dc = -rad; dc <= rad && !hit; dc++){
      if (dr*dr + dc*dc > rad*rad) continue;
      const rr = r + dr, cc = c + dc;
      const v = (rr < 0 || rr >= NY || cc < 0 || cc >= NX) ? 0 : src[rr*NX+cc];
      if (grow ? v === 1 : v === 0) hit = true;
    }
    out[r*NX+c] = grow ? (hit ? 1 : 0) : (hit ? 0 : 1);
  }
  return out;
}
const closed = morph(morph(raw, DIL, true), DIL, false);

/* Distance to the outside, in cells. Two sweeps of a chamfer pass is enough here — the shape is
   about forty cells across at its widest and the error of the two-pass approximation is under one
   cell, well inside the resolution the outline is simplified to anyway. */
const dist = new Float64Array(NX * NY).fill(1e9);
for (let i = 0; i < dist.length; i++) if (!closed[i]) dist[i] = 0;
const NB = [[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,1.4142],[1,1,1.4142],[-1,1,1.4142],[1,-1,1.4142]];
for (let pass = 0; pass < 2; pass++){
  const rows = pass ? [...Array(NY).keys()].reverse() : [...Array(NY).keys()];
  for (const r of rows){
    const cols = pass ? [...Array(NX).keys()].reverse() : [...Array(NX).keys()];
    for (const c of cols){
      let d = dist[r*NX+c];
      for (const [dr, dc, w] of NB){
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= NY || cc < 0 || cc >= NX) continue;
        d = Math.min(d, dist[rr*NX+cc] + w);
      }
      dist[r*NX+c] = d;
    }
  }
}
let maxd = 0; for (const d of dist) if (d < 1e9) maxd = Math.max(maxd, d);
const core = new Uint8Array(NX * NY);
for (let i = 0; i < core.length; i++) if (closed[i] && dist[i] > maxd * CORE_THR) core[i] = 1;

/* ---- Moore boundary walk of the largest blob, then Douglas-Peucker, then one Chaikin round. */
function largest(mask){
  const lab = new Int32Array(NX*NY).fill(-1); let best = null, id = 0;
  for (let i = 0; i < mask.length; i++){
    if (!mask[i] || lab[i] >= 0) continue;
    const q = [i]; lab[i] = id; const cells = [];
    while (q.length){
      const k = q.pop(); cells.push(k);
      const r = (k / NX) | 0, c = k % NX;
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
        const rr = r+dr, cc = c+dc; if (rr<0||rr>=NY||cc<0||cc>=NX) continue;
        const kk = rr*NX+cc; if (mask[kk] && lab[kk] < 0){ lab[kk] = id; q.push(kk); }
      }
    }
    if (!best || cells.length > best.length) best = cells;
    id++;
  }
  const out = new Uint8Array(NX*NY); for (const k of best || []) out[k] = 1;
  return { mask: out, n: (best || []).length };
}
function trace(mask){
  let start = -1;
  for (let i = 0; i < mask.length && start < 0; i++) if (mask[i]) start = i;
  const get = (c, r) => (r<0||r>=NY||c<0||c>=NX) ? 0 : mask[r*NX+c];
  const D = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
  let cr = (start/NX)|0, cc = start%NX, dir = 6, out = [];
  const first = [cc, cr]; let guard = 0;
  do {
    out.push([cc, cr]);
    let moved = false;
    for (let k = 0; k < 8; k++){
      const nd = (dir + 6 + k) % 8, [dc, dr] = D[nd];
      if (get(cc+dc, cr+dr)){ cc += dc; cr += dr; dir = nd; moved = true; break; }
    }
    if (!moved) break;
  } while ((cc !== first[0] || cr !== first[1]) && ++guard < 200000);
  return out.map(([c, r]) => at(c, r));
}
function dp(pts, eps){
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length-1] = 1;
  const stack = [[0, pts.length-1]];
  while (stack.length){
    const [a, z] = stack.pop();
    let worst = 0, wi = -1;
    const [ax, ay] = pts[a], [zx, zy] = pts[z];
    const dx = zx-ax, dy = zy-ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a+1; i < z; i++){
      const d = Math.abs((pts[i][0]-ax)*dy - (pts[i][1]-ay)*dx) / L;
      if (d > worst){ worst = d; wi = i; }
    }
    if (worst > eps && wi > 0){ keep[wi] = 1; stack.push([a, wi], [wi, z]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function chaikin(pts){
  const out = [];
  for (let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i+1) % pts.length];
    out.push([a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25]);
    out.push([a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75]);
  }
  return out;
}
const envelope = chaikin(dp(trace(largest(closed).mask), 19));
/* THE APRON IS A TRUE OFFSET OF THE ENVELOPE, NOT THE ENVELOPE SCALED UP.

   Scaling a starfish about its centroid grows the arms far more than the flanks: at the 1.35 that
   would clear a 60 m stand off the side of a pier, the four arms each grow by about 245 m and the
   apron stops looking like pavement and starts looking like a second building. A dilation moves
   every edge the same distance, which is what an apron is — paved ground a fixed way out from the
   stand line. 12 cells is 96 m: past the parked aircraft at 60-odd metres, with a taxiway's width
   to spare. */
const apron = chaikin(dp(trace(largest(morph(closed, 12, true)).mask), 22));
const coreRing = chaikin(dp(trace(largest(core).mask), 14));

function inRing(ring, px, py){
  let n = false;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++){
    const a = ring[i], d = ring[k];
    if ((a[1] > py) !== (d[1] > py) && px < (d[0]-a[0]) * (py-a[1]) / (d[1]-a[1]) + a[0]) n = !n;
  }
  return n;
}

/* ---- THE STANDS. Each connected blob of (closed AND NOT raw) is one gap in the surveyed ring —
   the parking position between two gate lounges. Blobs of a single cell are rounding on the
   raster, not architecture, and the three largest are the open corners where two piers meet, so
   the filter keeps everything between 11 and 63 m across and drops 26 of the 80.

   THE AIRCRAFT DOES NOT GO AT THE BLOB CENTROID. That point is inside the closed envelope — the
   closing is what put it there — so a plane placed on it is parked inside the terminal. It is
   walked out along the outward normal until it leaves the envelope, and then a half-length
   further, which is where a nose-in stand actually puts the fuselage. The heading is the reverse
   of that walk: the nose points back at the gate it is docked to. */
const notch = new Uint8Array(NX*NY);
for (let i = 0; i < notch.length; i++) if (closed[i] && !raw[i]) notch[i] = 1;
const insideClosed = (px, py) => {
  const c = Math.round((px - x0) / CELL - 0.5), r = Math.round((py - y0) / CELL - 0.5);
  return (r < 0 || r >= NY || c < 0 || c >= NX) ? 0 : closed[r*NX+c];
};
const seen = new Uint8Array(NX*NY); const stands = []; let dropped = 0;
for (let i = 0; i < notch.length; i++){
  if (!notch[i] || seen[i]) continue;
  const q = [i]; seen[i] = 1; const cells = [];
  while (q.length){
    const k = q.pop(); cells.push(k);
    const r = (k/NX)|0, c = k%NX;
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const rr = r+dr, cc = c+dc; if (rr<0||rr>=NY||cc<0||cc>=NX) continue;
      const kk = rr*NX+cc; if (notch[kk] && !seen[kk]){ seen[kk] = 1; q.push(kk); }
    }
  }
  const span = Math.sqrt(cells.length * CELL * CELL);
  if (span < 11 || span > 63){ dropped++; continue; }
  let sx = 0, sy = 0; for (const k of cells){ const [px, py] = at(k%NX, (k/NX)|0); sx += px; sy += py; }
  const cx = sx/cells.length, cy = sy/cells.length;
  /* Outward normal: away from the nearest cell of the deep interior. */
  let bi = -1, bd = 1e9;
  for (let k = 0; k < closed.length; k++){
    if (dist[k] < 4) continue;
    const [px, py] = at(k%NX, (k/NX)|0);
    const d = (px-cx)**2 + (py-cy)**2;
    if (d < bd){ bd = d; bi = k; }
  }
  if (bi < 0){ dropped++; continue; }
  const [ix, iy] = at(bi%NX, (bi/NX)|0);
  const ang = Math.atan2(cy-iy, cx-ix);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  /* March out of the envelope, then a fuselage half-length onto the apron. */
  let t = 0; while (t < 400 && insideClosed(cx + ux*t, cy + uy*t)) t += 4;
  if (t >= 400){ dropped++; continue; }
  const HALF = 21;                                  // 42 m body: a narrowbody, which most of these are
  /* AND THEN CHECKED AGAINST THE RING THAT WILL ACTUALLY BE DRAWN, not the raster it came from.
     The march leaves `closed` cell by cell, but the envelope is that raster simplified and then
     smoothed, and smoothing moves an edge by up to a cell — enough, where a pier meets the
     processor at an acute angle, to put a stand back inside the building it just left. Caught one
     of fifty-four this way, which is exactly the class of error a plan view does not show. */
  let px = cx + ux*(t + HALF), py = cy + uy*(t + HALF), guard2 = 0;
  while (inRing(envelope, px, py) && guard2++ < 50){ px += ux*4; py += uy*4; }
  if (guard2 >= 50){ dropped++; continue; }
  stands.push({ x:+px.toFixed(1), y:+py.toFixed(1), a:+ang.toFixed(3), m:+span.toFixed(0) });
}

/* ---- THE ROOF, AS A MESH OVER THE WHOLE ENVELOPE (city v178) ----------------------------------

   The first kit put the wave roof on TERM_CORE alone — a 240 m blob at the junction — and flat
   metal over the piers. From the app's camera that rendered as a pale flat X with a bump in the
   middle: the one thing every photograph of this terminal is about was missing from most of the
   building. In the photographs the roof is continuous. It vaults across each pier, ripples along
   its length, and swells over the hub where the glass runs full height beneath it.

   A height field needs vertices inside the outline, and every path three.js offers for a shape
   triangulates its boundary only. So the roof is triangulated here: the envelope resampled at
   ROOF_EDGE metres, a grid of interior points ROOF_CELL apart, a Delaunay triangulation of the lot
   (Bowyer-Watson; two thousand points is nothing offline) and the triangles whose centroid falls
   outside the envelope dropped — that is what cuts the convex hull back to the X. Every vertex
   carries its distance to the edge in metres, read off the distance field the trace already has,
   because that distance is the vault: zero at the eave, greatest down the spine of a pier and at
   the centre of the hub. The kit turns it into height; nothing about the shape of the roof is
   decided here. */
const ROOF_EDGE = 11, ROOF_CELL = 11;
function resample(ring, step){
  const out = [];
  for (let i = 0; i < ring.length; i++){
    const a = ring[i], b = ring[(i+1) % ring.length];
    const L = Math.hypot(b[0]-a[0], b[1]-a[1]), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0]-a[0]) * k / n, a[1] + (b[1]-a[1]) * k / n]);
  }
  return out;
}
const distAt = (px, py) => {
  const c = Math.floor((px - x0) / CELL), r = Math.floor((py - y0) / CELL);
  if (c < 0 || r < 0 || c >= NX || r >= NY) return 0;
  const d = dist[r*NX+c]; return d < 1e9 ? d * CELL : 0;
};
const segDist = (ring, px, py) => {
  let best = 1e9;
  for (let i = 0, k = ring.length - 1; i < ring.length; k = i++){
    const a = ring[k], b = ring[i], vx = b[0]-a[0], vy = b[1]-a[1];
    const t = Math.max(0, Math.min(1, ((px-a[0])*vx + (py-a[1])*vy) / (vx*vx + vy*vy || 1)));
    best = Math.min(best, Math.hypot(px - a[0] - vx*t, py - a[1] - vy*t));
  }
  return best;
};
const roofPts = resample(envelope, ROOF_EDGE).map(p => [p[0], p[1], 0]);
{
  const ex = envelope.map(p => p[0]), ey = envelope.map(p => p[1]);
  const gx0 = Math.min(...ex), gx1 = Math.max(...ex), gy0 = Math.min(...ey), gy1 = Math.max(...ey);
  for (let gy = gy0 + ROOF_CELL/2; gy < gy1; gy += ROOF_CELL)
    for (let gx = gx0 + ROOF_CELL/2; gx < gx1; gx += ROOF_CELL){
      // a half-cell stagger on alternate rows, so the triangles are closer to equilateral
      const sx = gx + ((Math.round((gy - gy0) / ROOF_CELL) % 2) ? ROOF_CELL/2 : 0);
      if (!inRing(envelope, sx, gy)) continue;
      if (segDist(envelope, sx, gy) < ROOF_EDGE * 0.8) continue;   // too close to a boundary vertex
      roofPts.push([sx, gy, distAt(sx, gy)]);
    }
}
function delaunay(pts){
  const n = pts.length;
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (const p of pts){ mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); }
  const dx = mxx - mnx, dy = mxy - mny, dm = Math.max(dx, dy), mx = (mnx + mxx) / 2, my = (mny + mxy) / 2;
  const P = pts.map(p => [p[0], p[1]]);
  P.push([mx - 20*dm, my - dm], [mx, my + 20*dm], [mx + 20*dm, my - dm]);
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
    const d = 2 * (ax*(by-cy) + bx*(cy-ay) + cx*(ay-by));
    if (Math.abs(d) < 1e-12) return null;
    const ux = ((ax*ax+ay*ay)*(by-cy) + (bx*bx+by*by)*(cy-ay) + (cx*cx+cy*cy)*(ay-by)) / d;
    const uy = ((ax*ax+ay*ay)*(cx-bx) + (bx*bx+by*by)*(ax-cx) + (cx*cx+cy*cy)*(bx-ax)) / d;
    return [ux, uy, (ax-ux)**2 + (ay-uy)**2];
  };
  let tris = [[n, n+1, n+2, circ(n, n+1, n+2)]];
  for (let i = 0; i < n; i++){
    const [px, py] = P[i], bad = [], keep = [];
    for (const t of tris) ((px - t[3][0])**2 + (py - t[3][1])**2 < t[3][2] ? bad : keep).push(t);
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t[0],t[1]],[t[1],t[2]],[t[2],t[0]]]){
      const k = a < b ? a + ':' + b : b + ':' + a;
      edges.set(k, edges.has(k) ? null : [a, b]);
    }
    tris = keep;
    for (const e of edges.values()){ if (!e) continue; const cc = circ(e[0], e[1], i); if (cc) tris.push([e[0], e[1], i, cc]); }
  }
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n).map(t => [t[0], t[1], t[2]]);
}
const roofTri = delaunay(roofPts).filter(([a, b, c]) => {
  const cx = (roofPts[a][0] + roofPts[b][0] + roofPts[c][0]) / 3, cy = (roofPts[a][1] + roofPts[b][1] + roofPts[c][1]) / 3;
  return inRing(envelope, cx, cy);
});
/* Wound counter-clockwise in raster (x, y). The kit maps y to -z, and in three's right-handed
   frame that order gives (b-a) x (c-a) a positive y: the face points up. The kit checks the sum
   of its normals anyway, so a slip here would show as a flipped roof rather than a black one. */
for (const t of roofTri){
  const a = roofPts[t[0]], b = roofPts[t[1]], c = roofPts[t[2]];
  if ((b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]) < 0){ const k = t[1]; t[1] = t[2]; t[2] = k; }
}
const roofEdge = resample(envelope, ROOF_EDGE).length;   // the first roofEdge points are the eave, in ring order
let hubC = 0; for (let i = 0; i < dist.length; i++) if (closed[i] && dist[i] < 1e9 && dist[i] > dist[hubC]) hubC = i;
const hub = at(hubC % NX, Math.floor(hubC / NX));

const flip = r => r.map(([x, y]) => [+x.toFixed(1), +(-y).toFixed(1)]);
const out = {
  note: 'generated by tools/terminal-a-trace.mjs — kit-local metres, +z south. Do not hand-edit.',
  osm: b.osm, rot: b.rot, h: b.h,
  envelope: flip(envelope),
  apron: flip(apron),
  core: flip(coreRing),
  stands: stands.map(s => ({ x:s.x, z:+(-s.y).toFixed(1), a:+(-s.a).toFixed(3), m:s.m })),
  roof: { edge: roofEdge, pts: roofPts.map(p => [+p[0].toFixed(1), +(-p[1]).toFixed(1), +p[2].toFixed(1)]), tri: roofTri.flat() },
  hub: [+hub[0].toFixed(1), +(-hub[1]).toFixed(1), +(maxd*CELL).toFixed(1)],
};
await writeFile(new URL('../data/terminal-a.json', import.meta.url), JSON.stringify(out) + '\n');

/* AND THE SAME NUMBERS AS AN ES MODULE, WHICH IS WHAT THE KIT ACTUALLY IMPORTS.

   w2h-city.js says at its head that the file was split because a single module had grown past
   what is practical to paste by hand on a phone, and that is the real authoring constraint here.
   Two hundred and twenty-eight coordinate pairs pasted into it would undo a chunk of that split
   for numbers no one will ever read, let alone edit — they are output, not source. So they live
   in their own generated file, w2h-city.js imports three names from it, and re-running this
   script after a re-bake updates the kit without anyone opening the kit. */
const fmt = r => r.map(p => '[' + p[0] + ',' + p[1] + ']').join(',');
const js = `/* GENERATED by tools/terminal-a-trace.mjs from data/fp-airport.json — DO NOT HAND-EDIT.
   Zayed International Terminal A, traced from OSM relation ${out.osm}. Kit-local metres, +x east,
   +z south, origin at the surveyed footprint's centre. Re-run the script after any airport bake.

   TERM_ENVELOPE  the building outline with its raster-scale notches closed — the X-plan as a solid
   TERM_APRON     that envelope offset outward by 96 m — the paved ground the aircraft stand on
   TERM_CORE      the processor, found as the part of that envelope more than ${(CORE_THR*100)|0}% of the way
                  to its widest half-width (${(maxd*CELL).toFixed(0)} m) from any edge — this is what carries the wave roof
   TERM_STANDS    one entry per closed notch: an aircraft parked nose-in on the apron, { x, z, a } with
                  a the outward bearing of the stand, so the nose points back along it
   TERM_ROOF      the envelope triangulated: pts as [x, z, d] with d the distance to the edge in
                  metres (the vault), the first "edge" of them the eave in ring order, tri as index
                  triples wound to face up — the kit lifts each vertex by a height field of (x, z, d)
   TERM_HUB       [x, z, r]: the point of the envelope furthest from any edge and that distance —
                  the centre of the processor, where the roof swells */
export const TERM_ENVELOPE = [${fmt(out.envelope)}];
export const TERM_APRON = [${fmt(out.apron)}];
export const TERM_CORE = [${fmt(out.core)}];
export const TERM_STANDS = [${out.stands.map(s => `{x:${s.x},z:${s.z},a:${s.a}}`).join(',')}];
export const TERM_ROOF = { edge: ${out.roof.edge}, pts: [${out.roof.pts.map(p => '[' + p.join(',') + ']').join(',')}], tri: [${out.roof.tri.join(',')}] };
export const TERM_HUB = [${out.hub.join(',')}];
`;
await writeFile(new URL('../w2h-terminal-a.js', import.meta.url), js);
console.log('envelope', out.envelope.length, 'apron', out.apron.length, 'core', out.core.length,
            'stands', out.stands.length, '(' + dropped + ' blobs dropped)',
            '| core half-width', (maxd*CELL).toFixed(0) + 'm', '| roof', out.roof.pts.length, 'pts', roofTri.length, 'tris, hub', out.hub.join(','));
