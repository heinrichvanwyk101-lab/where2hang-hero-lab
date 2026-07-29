/* PASTE TARGET: where2hang-hero-lab/w2h-world.js
   =============================================================================================
   THE WORLD. Island outlines, the ground surface, the urban fabric generator, the district
   table, and the assembly of all five islands. Knows about geography; knows nothing about
   cameras or UI.

   Takes the city kit as an argument rather than importing it directly, so the landmark builders
   can be swapped or stubbed without touching this file.

   ---------------------------------------------------------------------------------------------
   STEP 2 — GROUND, and the two faults it exposed before a single road was drawn.

   FAULT ONE: THE GROUND DATUM WAS NEVER AGREED.
   The island is an ExtrudeGeometry with depth 2.4 and bevelThickness 0.5. Bevelled extrusions
   run from -bevelThickness to depth+bevelThickness, so after rotateX(-90) the TOP SURFACE OF
   EVERY ISLAND SITS AT y = 2.9. Meanwhile the urban fabric was placed at y = 1.4 and every
   landmark group at y = 0. So the whole city was buried: the fabric by 1.5 units, the landmarks
   by 2.9. Emirates Palace is a 6.6-unit building — its main block, wings, arcade, drums and
   corner pavilions were entirely underground and only the dome caps showed. It was reading as a
   row of domes sitting on bare sand, which is why it never looked like the building.
   Fixed by deriving GROUND from the extrusion parameters instead of guessing it, and putting
   everything on it. Change the depth or the bevel and the city follows.

   FAULT TWO: MOST OF CORNICHE WAS STANDING IN THE SEA.
   The landmarks kept the coordinates they were authored with in home-world.html, which had no
   island boundary — so nothing ever stopped them drifting off the edge. Corniche's outline runs
   from about z = -30 (north coast) to z = +39 (south coast), a band 69 units deep. The content
   ran from z = +12 to z = -70, a band 82 units deep centred 30 units north of the island. ADNOC
   HQ sat 43 units offshore, the low-rise band and both city rows were in open water, and Etihad
   was on the waterline. You cannot paint pavement under a building that is floating.
   Everything is re-placed against the actual coastline, and every position in this file was
   checked against a point-in-polygon test rather than placed by eye.

   THE GROUND ITSELF is one canvas texture per island, painted from the SAME cell list the
   fabric generator produced, so roads land between blocks and pavement lands under buildings by
   construction rather than by luck. It costs one texture and zero extra draw calls: the island
   mesh already existed, and ExtrudeGeometry already emits two material groups (0 = the caps,
   1 = the bevelled sides), so the ground goes on group 0 and the beach edge on group 1.
   ============================================================================================= */
import * as THREE from 'three';
import { C, rnd } from './w2h-city.js';

/* THE DATUM. Derived, never typed twice. */
export const ISLE_DEPTH   = 2.4;
export const ISLE_BEVEL_T = 0.5;
export const ISLE_BEVEL_S = 1.6;
export const GROUND = ISLE_DEPTH + ISLE_BEVEL_T;   // 2.9 — the top face of every island

export function buildWorld(scene, kit, opts = {}){
const MAX_ANISO = opts.maxAnisotropy || 4;

const world = new THREE.Group();
scene.add(world);

/* ---------- the sea that connects everything ---------- */
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(3200, 3200, 70, 70),
  new THREE.MeshStandardMaterial({ color:0x050A10, roughness:0.58, metalness:0.05,
    envMapIntensity:0.95 })
);
water.rotation.x = -Math.PI/2;
water.receiveShadow = true;
scene.add(water);
const waterPos  = water.geometry.attributes.position;
const waterBase = Float32Array.from(waterPos.array);

/* ===========================================================================
   ISLAND OUTLINES.

   At world scale the SHAPE OF THE LAND carries more identity than the buildings on it. Points
   are normalised to -1..1 and scaled by each district's radius, so an island can be resized
   without redrawing it. The bevel reads as a shallow beach shelf where the land meets water.

   NOTE ON AXES: ExtrudeGeometry builds in XY and extrudes along +Z. After rotateX(-90) the
   extrusion points up and the shape's +Y maps to -Z. So in these tables, +Y is NORTH, and a
   local z of -30 is 30 units toward the north coast.
   =========================================================================== */
const ISLE_SHAPES = {
  // Long west-east wedge with a concave northern edge — the corniche curve itself.
  corniche: [[-1.00,0.02],[-0.78,0.28],[-0.38,0.40],[0.08,0.36],[0.54,0.28],
             [0.92,0.10],[1.00,-0.20],[0.56,-0.44],[0.00,-0.52],[-0.56,-0.44],[-0.90,-0.24]],
  // Small and compact, almost rectangular. Reads as the dense financial block it is.
  maryah:   [[-1.00,0.22],[-0.62,0.60],[0.18,0.68],[0.84,0.44],[1.00,0.00],
             [0.80,-0.50],[0.10,-0.70],[-0.66,-0.54],[-1.00,-0.20]],
  // Elongated and curved, running north-east. The long thin one.
  reem:     [[-1.00,-0.28],[-0.72,0.14],[-0.20,0.44],[0.42,0.54],[0.86,0.34],
             [1.00,-0.06],[0.70,-0.46],[0.10,-0.60],[-0.52,-0.56]],
  // Broad, with a long straight north-west edge standing in for the beach.
  saadiyat: [[-1.00,0.18],[-0.48,0.52],[0.22,0.62],[0.80,0.40],[1.00,0.00],
             [0.68,-0.46],[0.00,-0.66],[-0.70,-0.46]],
  // Rounded mass with a bite out of the south-west: the marina inlet.
  yas:      [[-0.94,0.12],[-0.58,0.46],[0.02,0.60],[0.62,0.48],[0.96,0.14],
             [0.88,-0.32],[0.38,-0.60],[-0.16,-0.58],[-0.40,-0.30],[-0.62,-0.40],[-0.90,-0.16]],
};

function isleShape(id, r){
  const pts = ISLE_SHAPES[id];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0]*r, pts[0][1]*r);
  // splineThru rather than lineTo: a hand-drawn coastline should not have visible straight
  // segments, and 11 points through a spline gives a smooth outline for almost nothing.
  shape.splineThru(pts.slice(1).map(p => new THREE.Vector2(p[0]*r, p[1]*r))
    .concat([new THREE.Vector2(pts[0][0]*r, pts[0][1]*r)]));
  return shape;
}

/* THE OUTLINE, SAMPLED ONCE, AND EVERYTHING USES THE SAME ONE.

   Previously the geometry was built from the SPLINE and the inside-test ran against the eleven
   RAW CONTROL POINTS — two different coastlines. The spline bulges outside its control polygon
   on convex runs and cuts inside it on concave ones, so buildings passed a test against a shape
   that was not the shape being drawn. Sampling the real curve once fixes the disagreement and
   gives the ground painter a path it can stroke.

   getSpacedPoints, not getPoints: evenly spaced by arc length, which is what lets a stretch of
   coast be named as a fraction (the Corniche park below is outline 0.07 to 0.40) instead of by
   hunting for indices. Note that getPoints on a SplineCurve returns divisions * pointCount —
   2,880 points at the default — and a point-in-polygon test runs thousands of times during
   fabric generation. 180 is plenty and roughly sixteen times cheaper. */
const outlineCache = new Map();
function isleOutline(id){
  let o = outlineCache.get(id);
  if (!o){ o = isleShape(id, 1).getSpacedPoints(180); outlineCache.set(id, o); }
  return o;
}

function islandGeometry(id, r){
  const g = new THREE.ExtrudeGeometry(isleShape(id, r), {
    depth: ISLE_DEPTH, curveSegments: 14,
    bevelEnabled: true, bevelThickness: ISLE_BEVEL_T, bevelSize: ISLE_BEVEL_S, bevelSegments: 2,
  });
  g.rotateX(-Math.PI/2);
  g.computeVertexNormals();
  return g;
}

// Rejection sampling, so buildings land ON the island rather than in the sea.
function insideIsle(id, nx, ny){
  const pts = isleOutline(id);
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++){
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > ny) !== (yj > ny)) && (nx < (xj - xi) * (ny - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* ===========================================================================
   GROUND SURFACES.

   These are canvas colours that get MULTIPLIED by the material tint, exactly like the fabric's
   instanceColor. Same lesson, same reason: write the finished night colour into the texture and
   Day mode multiplies a pale stone material by a dark map and lands on charcoal. Keep the map
   in a fairly bright, fairly narrow band, carry the HUE here and the LEVEL on the material, and
   both modes work off one canvas.
   =========================================================================== */
const SURF = {
  sand:     '#B7A78B',
  sandDk:   '#A2937A',
  sandLt:   '#CEC0A3',
  beach:    '#D6C7A8',
  lawn:     'rgba(110,141,87,',
  lawnLt:   'rgba(130,161,103,',
  street:   '#666B71',
  road:     '#565B61',
  paving:   '#A5A296',
  pavingLt: '#B6B3A6',
  kerb:     '#CFCCC2',
  line:     'rgba(230,226,212,0.85)',
};

// Texture covers a little more than the island so the beach edge is never clipped by the canvas.
const GROUND_PAD = 1.18;

/* A SEPARATE RANDOM SEQUENCE, deliberately. The shared rnd() from w2h-city decides the skyline,
   and the header of that file is explicit that draw ORDER determines layout. Painting the ground
   from the shared sequence would mean every tweak to a road reshuffled every building. */
function localRnd(seed){
  let x = (seed >>> 0) || 1;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
function hashId(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shade(hex, k){
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) * k) | 0;
  const g = Math.min(255, ((n >>  8) & 255) * k) | 0;
  const b = Math.min(255, ( n        & 255) * k) | 0;
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
function roundRect(g, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.lineTo(x + w - rr, y); g.quadraticCurveTo(x + w, y, x + w, y + rr);
  g.lineTo(x + w, y + h - rr); g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  g.lineTo(x + rr, y + h); g.quadraticCurveTo(x, y + h, x, y + h - rr);
  g.lineTo(x, y + rr); g.quadraticCurveTo(x, y, x + rr, y);
  g.closePath();
}

/* THE PAINTER.

   UV NOTE, because getting this wrong produces a ground that slides off the island and is
   maddening to debug. ExtrudeGeometry's default top-face UV is the raw shape coordinate — u is
   local x, v is the shape's y, which after the rotation is -z. So repeat = 1/(2R) and
   offset = 0.5 maps the island into 0..1 with no custom UV generator, and because R is a fixed
   multiple of the island radius the canvas mapping is IDENTICAL for all five islands regardless
   of size. Everything below is therefore written in normalised island units. */
function paintGround(d, cells, pitch){
  const S = d.r >= 50 ? 1024 : 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');

  const U  = S * 0.5 / GROUND_PAD;          // pixels per normalised island unit
  const PX = n => S * 0.5 + n * U;
  const PY = n => S * 0.5 - n * U;          // +Y is north, canvas y runs the other way
  const R  = localRnd(hashId(d.id));
  const outline = isleOutline(d.id);
  const N = outline.length;

  function pathOutline(s, from, to){
    const a = from === undefined ? 0 : Math.round(from * (N - 1));
    const b = to   === undefined ? N - 1 : Math.round(to * (N - 1));
    g.beginPath();
    for (let i = a; i <= b; i++){
      const X = PX(outline[i].x * s), Y = PY(outline[i].y * s);
      i === a ? g.moveTo(X, Y) : g.lineTo(X, Y);
    }
    if (from === undefined) g.closePath();
  }

  /* 1. SAND, everywhere. Everything else is something laid on top of the desert, which is the
        correct order of operations for this city and reads that way. */
  g.fillStyle = SURF.sand;
  g.fillRect(0, 0, S, S);

  // Clip to the coastline once. Nothing painted after this can bleed into the sea.
  g.save();
  pathOutline(1.0);
  g.clip();

  // 2. Blotchy sand variation. A single flat tone over a 150-unit island reads as paper.
  for (let i = 0; i < 44; i++){
    const x = PX((R()*2 - 1)), y = PY((R()*2 - 1)), rr = U * (0.06 + R() * 0.18);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, R() < 0.5 ? 'rgba(162,147,122,0.40)' : 'rgba(206,192,163,0.34)');
    grd.addColorStop(1, 'rgba(162,147,122,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
  }

  // 3. Beach. A pale band inside the waterline, plus a brighter wet line right at the edge.
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = SURF.beach;  g.lineWidth = U * 0.080; pathOutline(1.0); g.stroke();
  g.strokeStyle = SURF.sandLt; g.lineWidth = U * 0.026; pathOutline(0.972); g.stroke();

  /* 4. PARKS, in the holes the fabric left. Building an occupancy set from the actual cells and
        then filling what is left over is the only way parkland lands where there is genuinely
        no city — scattering green blobs at random puts lawns through the middle of blocks. */
  const q = 0.05;
  const occ = new Set();
  cells.forEach(c => {
    const cx = Math.round(c.jx / q), cy = Math.round(c.jy / q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) occ.add((cx+a) + ',' + (cy+b));
  });
  for (let nx = -0.95; nx <= 0.95; nx += q){
    for (let ny = -0.95; ny <= 0.95; ny += q){
      if (occ.has(Math.round(nx/q) + ',' + Math.round(ny/q))) continue;
      if (!insideIsle(d.id, nx * 1.07, ny * 1.07)) continue;
      if (R() > 0.58) continue;
      const x = PX(nx + (R()-0.5)*q), y = PY(ny + (R()-0.5)*q);
      const rr = U * q * (1.2 + R() * 1.0);
      const grd = g.createRadialGradient(x, y, rr*0.15, x, y, rr);
      grd.addColorStop(0, SURF.lawnLt + '0.90)');
      grd.addColorStop(1, SURF.lawn   + '0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
    }
  }

  /* 5. THE CITY FLOOR, painted from the fabric's own cells.

        Two passes. First a tarmac rect at 1.24 of the block pitch, so neighbouring cells always
        overlap however far the jitter pushed them and no sand slivers open up mid-block. Then
        the paved lot at 0.78, centred on the cell. What is left between the lots IS the street,
        the same width the fabric used for its gap, and it is a street rather than a painted
        line because it was never painted at all. */
  const bp = pitch * U;
  g.fillStyle = SURF.street;
  cells.forEach(c => {
    g.fillRect(PX(c.jx) - bp*0.62, PY(c.jy) - bp*0.62, bp*1.24, bp*1.24);
  });
  const kerbW = Math.max(1, U * 0.0045);
  cells.forEach(c => {
    const s = bp * 0.78, X = PX(c.jx) - s/2, Y = PY(c.jy) - s/2;
    g.fillStyle = shade(SURF.paving, 0.90 + R() * 0.20);
    g.fillRect(X, Y, s, s);
    g.strokeStyle = SURF.kerb; g.lineWidth = kerbW;
    g.strokeRect(X + kerbW/2, Y + kerbW/2, s - kerbW, s - kerbW);
  });

  /* 6. DISTRICT PATCHES. Ground under the hand-built landmarks, where there are no fabric cells
        to paint from. Written in LOCAL UNITS in the district table, next to the landmark they
        belong to, because a forecourt that has to be kept in step with a building by hand should
        at least be readable on the same screen as it. */
  (d.ground || []).forEach(p => {
    const w = (p.w / d.r) * U, h = (p.d / d.r) * U;
    g.save();
    g.translate(PX(p.x / d.r), PY(-p.z / d.r));
    if (p.rot) g.rotate(-p.rot);
    if (p.kind === 'lawn'){
      const grd = g.createLinearGradient(0, -h/2, 0, h/2);
      grd.addColorStop(0.00, SURF.lawn   + '0)');
      grd.addColorStop(0.28, SURF.lawnLt + '0.92)');
      grd.addColorStop(0.72, SURF.lawnLt + '0.92)');
      grd.addColorStop(1.00, SURF.lawn   + '0)');
      g.fillStyle = grd;
      roundRect(g, -w/2, -h/2, w, h, Math.min(w, h) * 0.30); g.fill();
    } else {
      g.fillStyle = p.kind === 'sand' ? SURF.sandDk : SURF.pavingLt;
      roundRect(g, -w/2, -h/2, w, h, Math.min(w, h) * 0.12); g.fill();
      g.strokeStyle = SURF.kerb; g.lineWidth = kerbW * 1.6;
      roundRect(g, -w/2, -h/2, w, h, Math.min(w, h) * 0.12); g.stroke();
    }
    g.restore();
  });

  /* 7. THE COASTAL PARK. A stroke along a NAMED STRETCH of coastline rather than a rectangle:
        the Corniche park follows a curve, and no axis-aligned box put along it stays on the
        island — the north shore is 30 units out at the middle and 16 at the western end. */
  if (d.coastPark){
    const [a, b, wid] = d.coastPark;
    g.lineCap = 'round';
    g.strokeStyle = SURF.lawnLt + '0.55)'; g.lineWidth = U * wid * 1.35;
    pathOutline(0.925, a, b); g.stroke();
    g.strokeStyle = SURF.lawnLt + '0.92)'; g.lineWidth = U * wid;
    pathOutline(0.925, a, b); g.stroke();
  }

  /* 8. ROADS, laid LAST so they cut through the fabric the way a real arterial does. Kerb first
        and slightly wider, then the carriageway on top of it, then a dashed centre line: three
        strokes of the same path, which is how you get a road with edges for the price of one. */
  function road(pathFn, wid){
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.strokeStyle = SURF.kerb; g.lineWidth = U * wid * 1.20; pathFn(); g.stroke();
    g.strokeStyle = SURF.road; g.lineWidth = U * wid;        pathFn(); g.stroke();
    g.strokeStyle = SURF.line; g.lineWidth = Math.max(1, U * wid * 0.10);
    g.setLineDash([U * 0.030, U * 0.026]);
    pathFn(); g.stroke();
    g.setLineDash([]);
  }

  // The ring road. On Corniche its northern half IS the Corniche.
  road(() => pathOutline(0.885), 0.040);

  // Arterials out of the core, and a roundabout where they meet. The roundabout is not
  // decoration — it is the single most Abu Dhabi thing that can be drawn in six lines.
  const core = d.coreN || [0, 0];
  for (let i = 0; i < 3; i++){
    const a  = (i / 3) * Math.PI * 2 + R() * 0.7;
    const ex = core[0] + Math.cos(a) * 1.30, ey = core[1] + Math.sin(a) * 1.30;
    const mx = core[0] + Math.cos(a) * 0.62 + (R() - 0.5) * 0.30;
    const my = core[1] + Math.sin(a) * 0.62 + (R() - 0.5) * 0.30;
    road(() => {
      g.beginPath();
      g.moveTo(PX(core[0]), PY(core[1]));
      g.quadraticCurveTo(PX(mx), PY(my), PX(ex), PY(ey));
    }, 0.034);
  }
  const cr = U * 0.040;
  g.fillStyle = SURF.kerb; g.beginPath(); g.arc(PX(core[0]), PY(core[1]), cr*1.18, 0, 6.2832); g.fill();
  g.fillStyle = SURF.road; g.beginPath(); g.arc(PX(core[0]), PY(core[1]), cr,      0, 6.2832); g.fill();
  g.fillStyle = SURF.lawnLt + '0.95)';
  g.beginPath(); g.arc(PX(core[0]), PY(core[1]), cr*0.46, 0, 6.2832); g.fill();

  g.restore();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;                 // the ground is viewed at a grazing angle by design
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  const span = d.r * 2 * GROUND_PAD;
  t.repeat.set(1 / span, 1 / span);
  t.offset.set(0.5, 0.5);
  t.needsUpdate = true;
  return t;
}

/* Land tints. The map carries hue and pattern; these carry LEVEL, one per view mode. The night
   value is set so map-mean times tint lands where the old flat 0x424E58 land did — that number
   was hard won against a dim hemisphere sky and there was no reason to relitigate it. */
const matBeach    = new THREE.MeshStandardMaterial({ color:0x6E6A5E, roughness:1, metalness:0 });
const matLandFlat = new THREE.MeshStandardMaterial({ color:0x424E58, roughness:1, metalness:0 });

const matPlaceStone = new THREE.MeshStandardMaterial({ color:0x161C22, roughness:0.9 });
const matPlaceGlass = new THREE.MeshStandardMaterial({ color:0x111C22, roughness:0.35, metalness:0.1 });
const matLitWarm = new THREE.MeshStandardMaterial({
  color:0x0E141A, roughness:0.5, emissive:0xE8B547, emissiveIntensity:0.5 });
const matLitCool = new THREE.MeshStandardMaterial({
  color:0x0E141A, roughness:0.5, emissive:0x8FD3E8, emissiveIntensity:0.45 });

/* ===========================================================================
   THE FIVE DISTRICTS

   Positions are intuitively geographic, heavily compressed, and lean north-south for the
   portrait frame. Real separations run to tens of kilometres, but nobody navigates a map like
   this by distance — they navigate by relative position, and relative position is preserved.

   Local coordinates below are all POST-CHECK: every landmark, row and patch was tested against
   the sampled coastline before it went in the table.
   =========================================================================== */
const DISTRICTS = [
  { id:'corniche', name:'Corniche',   x:-44, z:  58, r:76, rot: 0.10, tint:C.gold,
    built:true,
    /* Re-placed onto the island. Emirates Palace west, Etihad centre, ADNOC at the eastern end,
       all in a band just inland of the north coast, with the supporting city behind them to the
       south. h is the height the camera aims at — a 44-unit tower and a 7-unit palace want very
       different look-at points. */
    places:[
      { label:'Emirates Palace', x:-42, z:  0, h: 7,  r: 46 },
      { label:'Etihad Towers',   x: -4, z:-16, h:18,  r: 52 },
      { label:'ADNOC HQ',        x: 48, z: -6, h:26,  r: 50 },
    ],
    coreN:[-0.05, -0.34],
    coastPark:[0.07, 0.40, 0.055],
    ground:[
      { kind:'paving', x:-42, z:  1, w:58, d:13 },   // palace forecourt
      { kind:'paving', x: -4, z:-15, w:40, d:13 },   // Etihad plaza
      { kind:'paving', x: 48, z: -6, w:17, d:13 },   // ADNOC apron
      // The mixed-tower row behind the landmarks. Sloped to match cityRow's zSlope, and
      // deliberately longer than the island — patches are painted inside the coastline clip,
      // so overshoot is trimmed for free and no patch has to be fitted to the coast by hand.
      { kind:'paving', x:  2, z:  4, w:150, d:24, rot: 0.08 },
    ] },
  { id:'maryah',   name:'Al Maryah',  x: -6, z:  -4, r:34, rot: 0.30, tint:0x8FD3E8,
    built:false, coreN:[0.0, 0.0], places:[
      { label:'The Galleria', x:-10, z:  6, h:10, r:30 },
      { label:'Rosewood',     x: 12, z:-10, h:12, r:30 },
      { label:'Waterfront',   x:  2, z: 18, h: 5, r:30 },
    ] },
  { id:'reem',     name:'Al Reem',    x: 58, z:  46, r:44, rot:-0.20, tint:0xBFD3E0,
    built:false, coreN:[-0.25, 0.05], places:[
      { label:'Reem Central', x:  0, z:  0, h:12, r:36 },
      { label:'Shams Boutik', x: 22, z: 10, h:10, r:34 },
      { label:'Gate Towers',  x:-22, z: -8, h:16, r:36 },
    ] },
  { id:'saadiyat', name:'Saadiyat',   x:-28, z:-104, r:56, rot: 0.15, tint:0xDDD3C0,
    built:false, coreN:[0.15, 0.10], coastPark:[0.02, 0.30, 0.070], places:[
      { label:'Louvre Abu Dhabi', x: 18, z: 14, h: 6, r:40 },
      { label:'Saadiyat Beach',   x:-24, z: 22, h: 3, r:44 },
      { label:'Manarat',          x:  4, z:-18, h: 6, r:38 },
    ] },
  { id:'yas',      name:'Yas Island', x: 82, z:-186, r:62, rot:-0.10, tint:C.gold,
    built:false, coreN:[0.20, -0.10], places:[
      { label:'Yas Marina',    x:-28, z: 22, h: 5, r:42 },
      { label:'Yas Mall',      x: 10, z: -6, h: 8, r:40 },
      { label:'Ferrari World', x: 34, z:-20, h: 9, r:40 },
    ] },
];

const pickTargets = [];

DISTRICTS.forEach(d => {
  const g = new THREE.Group();
  g.name = d.id;
  // AUTHORED AT LOCAL ORIGIN, positioned by the container.
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rot;
  world.add(g);

  const mass   = new THREE.Group(); mass.name = 'mass';
  const detail = new THREE.Group(); detail.name = 'detail';
  detail.visible = false;
  g.add(mass, detail);
  d.group = g; d.mass = mass; d.detail = detail;

  /* Island platform, in both layers so the ground never disappears during the LOD swap. TWO
     MATERIAL SLOTS: ExtrudeGeometry emits group 0 for the caps and group 1 for the bevelled
     sides, so the painted ground and the beach edge are separable without a second mesh. Slot 0
     starts flat and is replaced once the fabric has told us where the blocks are. */
  const isleGeo = islandGeometry(d.id, d.r);
  d.isleMeshes = [];
  [mass, detail].forEach(layer => {
    const isle = new THREE.Mesh(isleGeo, [matLandFlat, matBeach]);
    isle.receiveShadow = true;
    isle.castShadow = true;
    layer.add(isle);
    d.isleMeshes.push(isle);
  });

  // Generous invisible hit disc, sitting just clear of the ground. A fingertip is about 9mm;
  // targets matched to the visual edge feel broken on a phone.
  const pick = new THREE.Mesh(new THREE.CircleGeometry(d.r * 1.2, 20),
    new THREE.MeshBasicMaterial({ visible:false }));
  pick.rotation.x = -Math.PI/2;
  pick.position.y = GROUND + 0.4;
  pick.userData.district = d;
  g.add(pick);
  pickTargets.push(pick);

  d.placeAnchors = d.places.map(pl => ({ ...pl, district:d }));
});

/* ===========================================================================
   URBAN FABRIC.

   What makes a city read as a city is the RELATIONSHIP between buildings, not the buildings:
   grid alignment, density, and a height gradient falling away from a core. All three are
   enforced here, and the whole thing is instanced because density is only affordable that way.

   It now RETURNS ITS CELLS, which is the hinge of the whole ground step: the pavement is
   painted from the same list that placed the buildings, so the two cannot drift apart.
   =========================================================================== */
const fabricGeo = new THREE.BoxGeometry(1, 1, 1);
fabricGeo.translate(0, 0.5, 0);          // base at origin so Y scale grows upward

function urbanFabric(d, layer, opts){
  const { density, coreX = 0, coreZ = 0, tallest, innerHole = 0, cool = false,
          cap = Infinity, avoidY = null } = opts;

  // Block pitch in normalised island units. Smaller pitch = finer grain = denser city.
  const pitch = 0.085 / density;
  const cells = [];
  for (let nx = -0.95; nx <= 0.95; nx += pitch){
    for (let ny = -0.95; ny <= 0.95; ny += pitch){
      // Jitter the CELL, not the building, so blocks stay aligned but the grid is not a
      // chessboard. A perfectly regular grid reads as Manhattan, which Abu Dhabi is not.
      const jx = nx + (rnd() - 0.5) * pitch * 0.35;
      const jy = ny + (rnd() - 0.5) * pitch * 0.35;
      if (!insideIsle(d.id, jx, jy)) continue;
      // Keep the coast clear so buildings do not straddle the waterline.
      if (!insideIsle(d.id, jx * 1.09, jy * 1.09)) continue;
      /* avoidY is a BAND, not a disc. innerHole worked when the hand-built content sat in a
         circle at the island's centre; Corniche's landmarks run right across the island in a
         strip along the north shore, and no radius excludes that without also deleting half the
         supporting city. */
      if (avoidY && jy > avoidY[0] && jy < avoidY[1]) continue;
      if (innerHole > 0 && Math.hypot(jx, jy) < innerHole) continue;
      if (rnd() > 0.88) continue;                      // occasional gap: a square, a car park
      cells.push({ jx, jy });
    }
  }

  const stoneM = new THREE.InstancedMesh(fabricGeo, matPlaceStone, cells.length);
  const glassM = new THREE.InstancedMesh(fabricGeo, matPlaceGlass, cells.length);
  const bandM  = new THREE.InstancedMesh(fabricGeo, cool ? matLitCool : matLitWarm, cells.length);
  stoneM.castShadow = glassM.castShadow = true;
  stoneM.receiveShadow = glassM.receiveShadow = true;

  const M = new THREE.Object3D();
  const col = new THREE.Color();
  let si = 0, gi = 0, bi = 0;
  const gap = 0.22;                       // street width as a fraction of the block

  /* A MULTIPLIER NEAR WHITE, not an absolute colour. instanceColor MULTIPLIES the material's
     diffuse rather than replacing it, so the base material carries the hue in whichever view
     mode is active and the instance buffer carries only the VARIATION. */
  function tint(amount, warmBias){
    const v = 1 + (rnd() - 0.5) * amount;
    col.setRGB(
      Math.min(1.35, v * (1 + warmBias * 0.05)),
      Math.min(1.35, v),
      Math.min(1.35, v * (1 - warmBias * 0.06))
    );
    return col;
  }

  cells.forEach(c => {
    const x = c.jx * d.r, z = -c.jy * d.r;
    const block = pitch * d.r;
    const w = block * (1 - gap) * (0.7 + rnd() * 0.3);
    const dp = block * (1 - gap) * (0.7 + rnd() * 0.3);

    // Height falls away from the core. The exponent controls how abruptly downtown ends.
    const dc = Math.hypot(c.jx - coreX, c.jy - coreZ);
    const fall = Math.max(0, 1 - Math.pow(dc / 0.9, 1.5));
    // Capped: a landmark that is not the tallest thing near it stops being a landmark.
    const h = Math.min(cap, 3 + tallest * fall * (0.25 + Math.pow(rnd(), 2.2) * 0.95));

    M.position.set(x, GROUND, z);
    M.rotation.set(0, 0, 0);              // grid-aligned: the whole point
    M.scale.set(w, h, dp);
    M.updateMatrix();
    // ONE draw of the dice, not two.
    const isGlass = rnd() < 0.35;
    if (isGlass){
      glassM.setMatrixAt(gi, M.matrix);
      glassM.setColorAt(gi, tint(0.30, 0.2));   // glass varies less: it is one product
      gi++;
    } else {
      stoneM.setMatrixAt(si, M.matrix);
      stoneM.setColorAt(si, tint(0.42, 1.0));   // concrete varies more, and warm
      si++;
    }

    if (h > tallest * 0.28){
      M.position.set(x, GROUND + h * 0.62, z);
      M.scale.set(w * 1.015, h * 0.30, dp * 0.72);
      M.updateMatrix();
      bandM.setMatrixAt(bi, M.matrix);
      // Windows are never uniformly lit. Varying the band brightness per building is what
      // stops a night skyline reading as a single applied stripe.
      bandM.setColorAt(bi, tint(0.70, 0.4));    // window brightness, not window colour
      bi++;
    }
  });

  stoneM.count = si; glassM.count = gi; bandM.count = bi;
  stoneM.instanceMatrix.needsUpdate = true;
  glassM.instanceMatrix.needsUpdate = true;
  bandM.instanceMatrix.needsUpdate = true;
  if (stoneM.instanceColor) stoneM.instanceColor.needsUpdate = true;
  if (glassM.instanceColor) glassM.instanceColor.needsUpdate = true;
  if (bandM.instanceColor)  bandM.instanceColor.needsUpdate  = true;
  layer.add(stoneM, glassM, bandM);
  return { cells, pitch };
}

/* ---------- CORNICHE: the finished island ----------

   Everything in this block is authored in local units against the coastline measured above.
   The usable band, north coast to south coast, by x:

       x  -64   -48   -32    -16     0     16     32     48     64
       N  -17   -26   -30    -30   -28   -26    -23    -19    -12
       S   22    32    36     39     39    39     36     32     25

   Which is what dictates the composition: the landmarks sit in a strip around z = -16 to 0
   where the island is deepest, the low-rise band goes seaward of them, and the supporting city
   fills the wide southern half. Note how much shallower the two ends are — that is why nothing
   important is placed beyond x = ±52. */
const corniche = DISTRICTS.find(d => d.id === 'corniche');
{
  const D = corniche.detail;

  /* The land shelf is GONE. It was a 150 x 78 box sitting at y 0.3 to 1.5 — entirely inside the
     island, which now provides a real ground plane with a real coastline. It was left over from
     home-world.html, where there was no island at all. */

  const palace = kit.emiratesPalace(-42, 0);
  const etihad = kit.etihadTowers(-4, -16);
  const adnoc  = kit.adnocHQ(48, -6);
  // The kit builds every landmark with its base at y = 0. One group offset each puts them on
  // the island instead of 2.9 units inside it.
  [palace, etihad, adnoc].forEach(o => { o.position.y = GROUND; D.add(o); });

  // Low-rise seaward of the towers: the scale contrast that makes the cluster read as enormous.
  const low = kit.lowRise(16, -40, 26, -18, 3, 0.55);
  // A second row of mixed tower types behind the landmarks, giving the skyline profiles the
  // box-only instanced fabric cannot produce. zSlope pulled back to 0.08 — at 0.30 the ends of
  // a 128-unit row swing 19 units in z and walk straight off the coast.
  const row = kit.cityRow(22, -62, 66, 4, 5, 4, 18, 0.62, 0.08, 0.22);
  [low, row].forEach(o => { o.position.y = GROUND; D.add(o); });

  /* CORNICHE MASS — the silhouette shown when this island is NOT active. Same two-part
     treatment as the detail layer and the same footprints, so the world-scale silhouette is a
     compressed portrait of what is actually down there:

       Emirates Palace   one long low warm mass, west
       Etihad Towers     five slim towers with the real height stagger, centre
       ADNOC HQ          one tall slim slab, east
       supporting city   a scatter of low blocks to the south

     Five separate slim towers rather than one lump matters even at this size: the gaps are what
     make the cluster countable, and countability is the whole identity of Etihad. */
  const cm = corniche.mass;
  const massDark  = new THREE.MeshStandardMaterial({ color:0x161C22, roughness:0.9 });
  const massGlass = new THREE.MeshStandardMaterial({ color:0x111C22, roughness:0.4, metalness:0.1 });
  const bandWarm  = new THREE.MeshStandardMaterial({
    color:0x0E141A, roughness:0.6, emissive:C.gold, emissiveIntensity:0.42 });
  const bandCool  = new THREE.MeshStandardMaterial({
    color:0x0E141A, roughness:0.6, emissive:0x8FD3E8, emissiveIntensity:0.34 });

  function massBlock(x, z, w, h, dp, glass, warm, bandFrac){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), glass ? massGlass : massDark);
    m.position.set(x, GROUND + h/2, z);
    m.castShadow = true; m.receiveShadow = true;
    cm.add(m);
    if (bandFrac > 0){
      const bh = h * bandFrac;
      const band = new THREE.Mesh(new THREE.BoxGeometry(w*1.02, bh, dp*0.76), warm ? bandWarm : bandCool);
      band.position.set(x, GROUND + h - bh*0.55, z);
      cm.add(band);
    }
  }

  // Emirates Palace: wide, low, warm. Its horizontality is what makes the cluster read tall.
  massBlock(-42,  0, 30, 6.5, 11, false, true, 0.34);
  massBlock(-50,  2,  8, 9.0,  8, false, true, 0.40);   // the dome mass, slightly taller

  // Etihad Towers: real spacing and real height ratios, slim and cool.
  [[-21,27.7],[-12.5,30.5],[-4,26.0],[4,23.4],[11.5,21.8]].forEach(t => {
    massBlock(t[0], -16, 4.2, t[1], 4.2, true, false, 0.30);
  });

  // ADNOC HQ: the tall slim anchor at the eastern end.
  massBlock(48, -6, 7.6, 44, 4.8, true, false, 0.14);

  // Supporting skyline, south of the heroes where the island is deep.
  [[-34,10,14,11],[-12,6,11,14],[16,8,13,9],[28,14,10,16],
   [-58,8,12,8],[58,4,11,12],[6,26,16,5],[-20,28,14,4]].forEach(b => {
    massBlock(b[0], b[1], b[2], b[3], b[2]*0.8, false, b[3] < 8, 0.26);
  });
}

/* ---------- the four placeholders ---------- */
DISTRICTS.filter(d => !d.built).forEach(d => {
  const cool = d.tint === 0x8FD3E8 || d.tint === 0xBFD3E0;
  // Per-district character: where downtown sits, and how tall it gets there.
  const tallest = { maryah:40, reem:44, saadiyat:14, yas:18 }[d.id];

  urbanFabric(d, d.mass,   { density:0.62, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool });
  const built = urbanFabric(d, d.detail,
                           { density:1.00, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool });
  d.fabric = built;

  const glow = new THREE.PointLight(d.tint, 0, 150, 2);
  glow.position.set(0, GROUND + 20, 0);
  d.detail.add(glow);
  d.glow = glow;
});

/* Corniche gets fabric too, but only SOUTH of the landmark strip. That is also true to the
   place: the corniche towers stand in front of a dense low-rise island, and the fabric behind
   them is most of what makes them read as a downtown rather than as objects on sand.
   cap 19 keeps every generated building below Etihad's shortest tower (21.8) and well below
   ADNOC (44), so the three landmarks own the skyline from any angle. */
/* DENSITY 1.6, NOT 0.95, and the reason is worth writing down. The exclusion band leaves the
   fabric a strip about 24 units deep along the southern shore — a quarter of what it had when
   it could sprawl over the whole island. At the old pitch that strip held two and a half rows
   of blocks and two dozen buildings, which reads as a handful of sheds rather than as a city
   behind a skyline. Halving the pitch puts six finer rows in the same strip, and the grain is
   right anyway: this is the low-rise island the towers stand in front of, not a second
   downtown. Instancing means the extra buildings cost nothing in draw calls. */
const cornicheFabric = urbanFabric(corniche, corniche.detail,
  { density:1.60, coreX:-0.05, coreZ:-0.34, tallest:22, avoidY:[-0.20, 1.0], cap:19 });
urbanFabric(corniche, corniche.mass,
  { density:0.90, coreX:-0.05, coreZ:-0.34, tallest:22, avoidY:[-0.20, 1.0], cap:19 });
corniche.fabric = cornicheFabric;

// Corniche gets its glow too, so all five behave identically to the state machine.
const cglow = new THREE.PointLight(C.gold, 0, 170, 2);
cglow.position.set(0, GROUND + 22, -10);
corniche.detail.add(cglow);
corniche.glow = cglow;

/* ---------- paint the ground, once the fabric knows where the blocks are ----------

   Deliberately the last thing that happens. The painter needs the cell list, the cell list only
   exists after generation, and doing it in one sweep at the end means there is exactly one place
   to look when a road lands in the wrong district. */
const dayGround = new THREE.MeshStandardMaterial({ color:0xD8D2C4, roughness:0.92, metalness:0 });
const dayBeach  = new THREE.MeshStandardMaterial({ color:0xE0D4B8, roughness:1, metalness:0 });

DISTRICTS.forEach(d => {
  const f = d.fabric;
  if (!f) return;
  const tex = paintGround(d, f.cells, f.pitch);
  const night = new THREE.MeshStandardMaterial({
    color:0x68737E, roughness:1, metalness:0, map:tex });
  const day = dayGround.clone(); day.map = tex;
  d.isleMeshes.forEach(m => {
    m.material = [night, matBeach];
    // Handed to the view switcher so Day mode keeps the roads. Losing the ground plan in the
    // one mode that exists to judge layout would be perverse.
    m.userData.dayMats = [day, dayBeach];
    m.userData.ground  = true;
  });
});

/* ---------- shadow flags, one sweep ---------- */
world.traverse(o => {
  if (!o.isMesh) return;
  o.castShadow = true;
  o.receiveShadow = true;
});
water.castShadow = false;

return { world, water, waterPos, waterBase, DISTRICTS, pickTargets, corniche, GROUND };
}
