/* PASTE TARGET: where2hang-hero-lab/w2h-props.js
   =============================================================================================
   PROPS. Palms, street lamps, cars, boats.

   WHY THIS FILE EXISTS AT ALL, and why it jumped the queue ahead of real coastlines.

   Cover the palms, lamp columns, kerbs, cars and boats in the reference render and what is left
   collapses to roughly what we already had: pale massing on pale ground. The palms alone are
   doing more work than every tower behind them. A miniature reads as a place because of the
   things a person would walk past, not because of the things a person would photograph — the
   towers give it a name, the props give it a scale, and without the second the first has
   nothing to be measured against.

   EVERYTHING IS INSTANCED AND EVERYTHING IS SHARED. One palm geometry, built once, drawn four
   hundred times per island in two draw calls. The geometries live at module scope in the kit so
   five islands cost one palm, not five.

   MERGED WITH GROUPS. mergeGeometries(parts, true) keeps a material group per part, so a palm is
   ONE InstancedMesh carrying [bark, frond] rather than two meshes whose transforms have to be
   kept in step by hand. That "kept in step by hand" is exactly the class of bug that put the
   window bands half a floor out in an earlier build.

   PROPS GO IN THE DETAIL LAYER ONLY. At world scale a palm is a third of a pixel and a car is
   less than that, so paying for them there would be paying for invisible geometry at precisely
   the moment five islands are on screen at once. The LOD swap already exists; this is what it
   is for.
   ============================================================================================= */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BUILD = 'props v16';

/* Shortest distance from a point to a closed polyline. The prop kit needs one now because the
   beach gave the coastline a width, and "outside the island" stopped meaning "in the sea". */
function segDist(x, y, pts){
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++){
    const ax = pts[i][0], ay = pts[i][1];
    const dx = pts[i+1][0] - ax, dy = pts[i+1][1] - ay;
    const L2 = dx*dx + dy*dy;
    let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t*dx - x, py = ay + t*dy - y;
    const d = px*px + py*py;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* SCALE, fixed once and obeyed everywhere below.

   ADNOC HQ is 342 m at 44 units, so ONE UNIT IS ABOUT 7.8 METRES. Every prop dimension in this
   file is a real measurement divided by that. Guessing prop sizes by eye against a stylised city
   is how miniatures end up with cars the size of buses: the buildings are already compressed, so
   the eye has no reliable reference and will happily accept something 60% wrong.

       palm          15 m tall          1.9 units
       lamp column   10 m               1.3 units
       car            4.6 m long        0.59 units
       boat          12 m               1.55 units                                             */
const U_PER_M = 1 / 7.8;

export function createPropKit(){

/* ---------- palm ----------
   A frond is a flat ribbon that rises, flattens and then droops — five stations along its length
   with a half-width that swells and tapers. Drawn double-sided, because a frond has no thickness
   and half of them face away from any given camera. */
function frondGeometry(){
  /* WIDER FRONDS. The first pass sized these off a real frond and they came out sub-pixel: at
     district distance a palm is about ten screen pixels tall and a frond four hundredths of a
     unit wide is a fraction of one, so antialiasing simply deleted the crown and left a stick.
     A miniature exaggerates silhouette for exactly this reason — the crown is now roughly seven
     metres across, which is a real palm crown and which also happens to be the smallest thing
     that survives being drawn at this size. */
  /* NINE STATIONS, NOT FIVE. The droop is the shape of a frond and five stations render it as
     three straight chords with two kinks — at place distance a palm is a couple of hundred pixels
     and the kinks are plainly visible. Nine gives a curve. It is eight triangles a frond instead
     of four, against a directive to spend geometry where it shows, and a palm crown is about the
     most-looked-at small object in the scene. */
  const st = [[0.00, 0.000, 0.032],
              [0.16, 0.048, 0.066],
              [0.30, 0.075, 0.090],
              [0.46, 0.072, 0.084],
              [0.62, 0.055, 0.070],
              [0.76, 0.010, 0.055],
              [0.90,-0.100, 0.034],
              [0.99,-0.195, 0.020],
              [1.06,-0.300, 0.000]];
  const pos = [], uv = [], idx = [];
  st.forEach(([x, y, w], i) => {
    pos.push(x, y, -w, x, y, w);
    // UVs ARE NOT OPTIONAL HERE even though nothing samples a texture off a frond.
    // mergeGeometries requires every input to carry the SAME attribute set, and a
    // CylinderGeometry trunk brings position, normal and uv. Merge a uv-less crown into it and
    // the call returns null with a console warning, which then surfaces as an InstancedMesh
    // holding a null geometry — a failure a long way from its cause.
    const t = i / (st.length - 1);
    uv.push(t, 0, t, 1);
  });
  for (let i = 0; i < st.length - 1; i++){
    const a = i * 2;
    idx.push(a, a+1, a+2, a+1, a+3, a+2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function crownGeometry(n){
  const parts = [];
  for (let i = 0; i < n; i++){
    const f = frondGeometry();
    // Alternate the droop. A crown where every frond leaves at the same angle reads as an
    // umbrella; real palms have a ragged upper tier and a heavier lower one.
    f.rotateZ(-0.10 + (i % 2) * 0.34);
    f.rotateY(i * (Math.PI * 2 / n) + (i % 3) * 0.09);
    parts.push(f);
  }
  const g = mergeGeometries(parts);
  g.scale(0.85, 0.85, 0.85);
  return g;
}

const PALM_H = 15 * U_PER_M;                       // trunk height, 1.92 units
/* A SIX-SIDED TRUNK IS A HEXAGON, and on a lit cylinder that is six flat facets with hard
   shading steps down every one. Ten reads as round at the distance these are actually seen from.
   Four extra side quads on a geometry that is instanced, so the cost is eight triangles times the
   palm count and nothing at all in draw calls. */
const trunkGeo = new THREE.CylinderGeometry(0.075, 0.125, PALM_H, 10, 1);
trunkGeo.translate(0, PALM_H / 2, 0);
/* ELEVEN FRONDS. A date palm carries thirty or more and seven reads as a spider — the gaps
   between fronds are wider than the fronds. Eleven is where the crown closes up into a canopy
   from the district camera while still showing separate leaves from the place camera. */
const crownGeo = crownGeometry(11);
crownGeo.translate(0, PALM_H, 0);
const palmGeo = mergeGeometries([trunkGeo, crownGeo], true);

/* ---------- lamp column ----------
   The head is a separate group so it can be given an emissive material. At night these are the
   lamp pools; in daylight they are small dark boxes and cost nothing. */
const LAMP_H = 10 * U_PER_M;                       // 1.28 units
const postGeo = new THREE.CylinderGeometry(0.026, 0.040, LAMP_H, 5, 1);
postGeo.translate(0, LAMP_H / 2, 0);
const headGeo = new THREE.BoxGeometry(0.16, 0.055, 0.10);
headGeo.translate(0, LAMP_H + 0.02, 0);
const lampGeo = mergeGeometries([postGeo, headGeo], true);

/* ---------- car ---------- */
const carBody  = new THREE.BoxGeometry(4.6 * U_PER_M, 1.15 * U_PER_M, 1.85 * U_PER_M);
carBody.translate(0, 0.62 * U_PER_M, 0);
const carCabin = new THREE.BoxGeometry(2.3 * U_PER_M, 0.85 * U_PER_M, 1.60 * U_PER_M);
carCabin.translate(-0.15 * U_PER_M, 1.45 * U_PER_M, 0);
const carGeo = mergeGeometries([carBody, carCabin]);

/* ---------- shrub ----------

   THE CHEAP HALF OF VEGETATION, AND THE REASON IT IS NOT MORE PALMS.

   A palm is 92 triangles — 56 of crown and 36 of trunk — so the 888 already in the scene are
   about 82,000 of them. Doubling the count to get a landscaped read would cost more than the
   entire shoreline pass, the roof decks and the material library put together.

   Massed low planting does most of the same work for a twentieth of the price. What reads as
   "landscaped" at district range is not individual trees, it is the GROUND being green and
   uneven under them; a six-sided dome at twelve triangles supplies that, and four of them cost
   less than half a frond. Palms stay where they are and keep doing the silhouette. */
const shrubGeo = (() => {
  const g = new THREE.CylinderGeometry(0.0, 0.115, 0.20, 6, 1);
  g.translate(0, 0.10, 0);
  g.scale(1, 1, 1.15);                       // very slightly oval, so a cluster is not six-fold
  return g;
})();
/* ONE COLOUR FOR EVERY MODE, and 0x1B2415 was the wrong one. Props carry userData.litMat, which
   means the dusk lift skips them entirely and they keep this exact colour in Night, Dusk and Day
   alike — so a duskColor on a prop material does nothing at all, and a near-black green that
   works after dark comes out as a black stain at noon. The comment above matFrond says the same
   thing about the palms: a low warm sun and a dark green read as black spikes.

   0x4C7038 is a shade under the fronds, which is right — massed low planting sits in its own
   shadow and should read a step darker than the canopy above it. */
const matShrub = new THREE.MeshStandardMaterial({ color:0x4C7038, roughness:0.95, metalness:0 });

/* ---------- lamp light pools ----------

   628 lamp columns that emit nothing. In the reference render the promenade and the roads are
   pooled with warm light and that is most of what makes the land read as inhabited after dark;
   in the build the ground simply goes black between the buildings and the lamps are furniture.

   REAL LIGHTS ARE NOT AN OPTION AND IT IS NOT CLOSE. WebGL forward rendering evaluates every
   light for every fragment of every lit material, so a scene with 628 point lights does not run
   slowly, it fails to compile — three writes the count into the shader source.

   An additive quad on the ground is the same effect for one draw call. It is not lighting: it
   lights nothing, casts nothing and responds to nothing. It is a painted pool that happens to
   sit where a pool would be, which at this scale is indistinguishable from the real thing and
   roughly a millionth of the cost. */
function makePool(N = 128){
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(N/2, N/2, 0, N/2, N/2, N/2);
  /* The falloff is deliberately not linear and not 1/r^2. A physical pool from a 5-metre column
     has a hot core and a long dim skirt; a linear ramp reads as a sticker and an inverse square
     is all core and no skirt at this size. Four stops, hand-placed. */
  gr.addColorStop(0.00, 'rgba(255,255,255,1.00)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.62)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.20)');
  gr.addColorStop(0.75, 'rgba(255,255,255,0.05)');
  gr.addColorStop(1.00, 'rgba(255,255,255,0.00)');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const poolTex = makePool();
const poolGeo = new THREE.PlaneGeometry(1, 1);
poolGeo.rotateX(-Math.PI / 2);              // flat on the ground, +Y up
/* Additive, depthWrite off. Additive because light adds; two overlapping pools along a road
   should brighten where they meet rather than one winning. depthWrite off because 628 coplanar
   transparent quads that write depth will fight each other for the rest of time. */
const poolBase = { map: poolTex, transparent: true, blending: THREE.AdditiveBlending,
                   depthWrite: false, toneMapped: true, side: THREE.FrontSide };
const matPoolNight = new THREE.MeshBasicMaterial({ ...poolBase, color: 0xFFB35C, opacity: 0.85 });
/* Dusk is a lit sky, so the pool that reads at night has to drop or it goes garish. 0.34 dropped
   it too far: in the dusk place render it was not subtle, it was absent. 0.52 is the compromise —
   present on the promenade, not competing with the sun. */
const matPoolDusk  = new THREE.MeshBasicMaterial({ ...poolBase, color: 0xFFC27A, opacity: 0.52 });

/* ---------- boat ----------
   A hull with a raked bow, done by shearing the front of a box rather than modelling one. At
   1.5 units long the bow is four pixels; what matters is that it is not symmetrical, because a
   symmetrical hull reads as a floating crate. */
const hull = new THREE.BoxGeometry(12 * U_PER_M, 1.5 * U_PER_M, 3.6 * U_PER_M, 3, 1, 1);
{
  const p = hull.attributes.position;
  for (let i = 0; i < p.count; i++){
    const x = p.getX(i);
    const t = Math.max(0, (x / (6 * U_PER_M)));     // 0 amidships, 1 at the bow
    p.setZ(i, p.getZ(i) * (1 - 0.72 * t * t));
    if (p.getY(i) < 0) p.setY(i, p.getY(i) * (1 - 0.5 * t));
  }
  hull.computeVertexNormals();
}
hull.translate(0, 0.75 * U_PER_M, 0);
const boatCabin = new THREE.BoxGeometry(3.4 * U_PER_M, 1.6 * U_PER_M, 2.4 * U_PER_M);
boatCabin.translate(-1.4 * U_PER_M, 2.2 * U_PER_M, 0);
const boatGeo = mergeGeometries([hull, boatCabin]);

/* ---------- materials ----------
   FLAGGED litMat. The view switcher paints almost every mesh with a flat diagnostic material in
   Day and lifts every base colour in Dusk; props opt out of both. A palm frond is already the
   colour a palm frond should be under any light in this scene, and turning it into pale stone in
   the one mode built to judge a daytime render would be a strange thing to have built. */
const matBark  = new THREE.MeshStandardMaterial({ color:0x6E5B45, roughness:0.94 });
// Lifted for the same reason as the lawn: a low warm sun and a dark green read as black
// spikes, and the palms along the shore were coming out as bare masts.
const matFrond = new THREE.MeshStandardMaterial({ color:0x5E8F45, roughness:0.86,
  side: THREE.DoubleSide });
const matPost  = new THREE.MeshStandardMaterial({ color:0x3A4048, roughness:0.6, metalness:0.4 });
// Emissive well above 1. The bloom threshold at dusk is 0.82, so a lamp head has to clear that
// on its own to produce a pool of light rather than just a pale box.
const matGlow  = new THREE.MeshStandardMaterial({ color:0xF2E6C8, roughness:0.4,
  emissive:0xFFD8A0, emissiveIntensity:1.8 });
const matCar   = new THREE.MeshStandardMaterial({ color:0xBFC4C8, roughness:0.42, metalness:0.25 });
const matBoat  = new THREE.MeshStandardMaterial({ color:0xE2E4E0, roughness:0.5 });

/* ---------- polyline walking ----------
   Props follow the SAME road polylines the ground painter strokes, so a lamp is never in the
   middle of a carriageway and a palm is never in a lane. Both consumers read one plan; that is
   the entire reason groundPlan was split out of the painter. */
function walk(pts, step, fn){
  if (!pts || pts.length < 2) return;
  let carry = 0, k = 0;
  for (let i = 0; i < pts.length - 1; i++){
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i+1][0], by = pts[i+1][1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const tx = dx / len, ty = dy / len;
    let s = step - carry;
    while (s <= len){
      fn(ax + tx * s, ay + ty * s, tx, ty, k++);
      s += step;
    }
    carry = (len - (s - step));
  }
}

/* =============================================================================================
   THE PLACER
   ============================================================================================= */
function addProps(d, layer, plan, budget = {}){
  const B = Object.assign({ palms:420, lamps:280, cars:70, boats:14, shrubs:300 }, budget);
  const R = plan.rndProps;
  const r = d.r;
  const inside = plan.inside;

  const palms = [], lamps = [], cars = [], boats = [], shrubs = [];

  /* plan.ring IS NOW AN ARRAY OF RUNS, not one closed loop.

     The ring road is built by offsetting the coastline inward by a fixed distance, and inside an
     inlet narrower than twice that distance the offset folds back over itself. Those points are
     pruned, which leaves the ring as two or more open runs that stop either side of the mouth —
     correct, since nothing drives across a marina. Every run is walked exactly as the single
     loop used to be, so lamps, palms and traffic simply stop at the water instead of marching
     across it. */
  const roads = plan.ring.map(pts => ({ pts, w: 0.040 }))
    .concat(plan.arterials.map(a => ({ pts: a, w: 0.034 })));

  roads.forEach(rd => {
    // Lamps alternate sides; palms go in pairs on the verge outside them. Spacing is in
    // NORMALISED island units, so a small island gets proportionally fewer, not smaller.
    walk(rd.pts, 0.052, (x, y, tx, ty, i) => {
      const nx = -ty, ny = tx;
      const s = (i % 2) ? 1 : -1;
      const o1 = rd.w * 1.45, o2 = rd.w * 2.35;
      const lx = x + nx * o1 * s, ly = y + ny * o1 * s;
      if (lamps.length < B.lamps && inside(lx * 1.02, ly * 1.02))
        lamps.push({ x:lx, y:ly, rot: Math.atan2(tx, ty) });
      [[x + nx*o2, y + ny*o2], [x - nx*o2, y - ny*o2]].forEach(p => {
        if (palms.length < B.palms && inside(p[0] * 1.02, p[1] * 1.02))
          palms.push({ x:p[0], y:p[1] });
      });
    });

    // Traffic. Position along the road, offset to a lane, facing along the tangent.
    walk(rd.pts, 0.052, (x, y, tx, ty, i) => {
      if (cars.length >= B.cars) return;
      if (R() > 0.16) return;
      const nx = -ty, ny = tx;
      const s = R() < 0.5 ? 1 : -1;
      const o = rd.w * 0.42 * s;
      const cx = x + nx * o, cy = y + ny * o;
      if (!inside(cx, cy)) return;
      cars.push({ x:cx, y:cy, rot: Math.atan2(tx, ty) + (s < 0 ? Math.PI : 0) });
    });
  });

  // Park palms, clustered. Parkland with evenly spaced trees reads as an orchard.
  plan.parks.forEach(p => {
    const n = 2 + Math.floor(R() * 4);
    for (let i = 0; i < n && palms.length < B.palms; i++){
      const a = R() * 6.2832, rr = p.r * (0.25 + R() * 0.8);
      const px = p.x + Math.cos(a) * rr, py = p.y + Math.sin(a) * rr;
      if (inside(px * 1.03, py * 1.03)) palms.push({ x:px, y:py });
    }
  });

  /* SHRUBS GO WHERE THE PARKS ALREADY ARE, densely and in clumps, because the park blobs are
     already the answer to "where is this island landscaped" — the painter drew them and nothing
     three-dimensional has ever stood in them. Clustered around a few seed points per park rather
     than scattered: planting is done in beds. */
  plan.parks.forEach(p => {
    const beds = 2 + Math.floor(R() * 3);
    for (let b = 0; b < beds; b++){
      const ba = R() * 6.2832, br = p.r * (0.2 + R() * 0.6);
      const bx = p.x + Math.cos(ba) * br, by = p.y + Math.sin(ba) * br;
      const n = 4 + Math.floor(R() * 7);
      for (let i = 0; i < n && shrubs.length < B.shrubs; i++){
        const a = R() * 6.2832, rr = p.r * 0.16 * Math.sqrt(R());
        const px = bx + Math.cos(a) * rr, py = by + Math.sin(a) * rr;
        if (inside(px * 1.03, py * 1.03)) shrubs.push({ x:px, y:py, s:0.7 + R() * 0.75 });
      }
    }
  });

  // And a thin line of them along the coast park, inside the palm avenue.
  if (plan.coastLine){
    walk(plan.coastLine, 0.018, (x, y, tx, ty, i) => {
      if (shrubs.length >= B.shrubs) return;
      const nx = -ty, ny = tx;
      const o = 0.014 + R() * 0.016;
      const px = x + nx * o, py = y + ny * o;
      if (inside(px * 1.02, py * 1.02)) shrubs.push({ x:px, y:py, s:0.6 + R() * 0.6 });
    });
  }

  /* ROAD VERGES, WHICH IS WHERE THE PLANTING ACTUALLY IS.

     The park pass only reached 239 shrubs across all five islands against a budget of 1,500,
     because it is bounded by however many park blobs the ground plan happened to leave and those
     are sparse on the four placeholder islands. The ring road is not sparse — every island has
     one, it is the longest continuous line on the map, and in Abu Dhabi the strip between the
     kerb and the plot line is planted for its entire length. Walking it fills the budget from a
     source that always exists.

     Offset past the kerb at 0.60 of the road width, matching what onRoad already clears, so a
     shrub cannot land on tarmac. Alternating sides with a jittered offset, because a single file
     down one edge reads as a hedge. */
  plan.ring.forEach(seg => {
    walk(seg, 0.020, (x, y, tx, ty, i) => {
      if (shrubs.length >= B.shrubs) return;
      const nx = -ty, ny = tx;
      const side = (i % 2) ? 1 : -1;
      const o = (0.034 + R() * 0.020) * side;
      const px = x + nx * o, py = y + ny * o;
      if (inside(px * 1.03, py * 1.03)) shrubs.push({ x:px, y:py, s:0.55 + R() * 0.55 });
    });
  });

  // The coast park gets a proper avenue of them — that stretch of shoreline is the one place
  // where a regular rhythm is right rather than wrong.
  if (plan.coastLine){
    walk(plan.coastLine, 0.040, (x, y, tx, ty, i) => {
      if (palms.length >= B.palms) return;
      const nx = -ty, ny = tx;
      const o = 0.030 * ((i % 2) ? 1 : -1);
      const px = x + nx * o, py = y + ny * o;
      if (inside(px * 1.02, py * 1.02)) palms.push({ x:px, y:py });
    });
  }

  /* Boats sit OUTSIDE the coastline, on the water, and are the only prop that does. They are
     what stops the sea reading as an empty backdrop, and at world scale they are the only thing
     that gives the water a size. */
  const ring = plan.outline;
  /* THE BEACH PUT BOATS ON DRY SAND, and the radial scale is why.

     s between 1.12 and 1.42 is a scale ABOUT THE ISLAND CENTRE, so how far out it actually
     moves a point depends on how far out that point already was. On Corniche's long axis 1.12
     is nine units of clearance; on the short axis the same number is five. Five was tolerable
     when the coast ended in a wall. It is not when there is a twelve-unit beach there, and the
     symptom would have been a fleet moored above the waterline.

     A real distance to the coastline fixes it, the same correction the ring road and the
     building clearance already had. plan.beachN is the skirt width in this island's normalised
     units, so the test reads the same on every island whatever its radius. */
  const closed = ring.map(p => [p.x, p.y]);
  closed.push(closed[0]);
  const seaRoom = (plan.beachN || 0) + 0.035;
  for (let i = 0, tries = 0; i < B.boats && tries < B.boats * 12; tries++){
    const p = ring[Math.floor(R() * ring.length)];
    const s = 1.12 + R() * 0.34;
    const bx = p.x * s, by = p.y * s;
    // Scaling a point off a CONCAVE stretch of coast can push it back over land — Corniche's
    // northern edge curves inward, which is the whole reason that outline was drawn. Test it.
    if (inside(bx, by)) continue;
    if (segDist(bx, by, closed) < seaRoom) continue;      // in the water, not on the beach
    boats.push({ x: bx, y: by, rot: R() * 6.2832 });
    i++;
  }

  /* ---------- build the instanced meshes ---------- */
  const M = new THREE.Object3D();
  const col = new THREE.Color();

  function build(geo, mat, list, place, colourise){
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.castShadow = true; im.receiveShadow = true;
    im.userData.litMat = true;
    list.forEach((it, i) => {
      place(it, i);
      M.updateMatrix();
      im.setMatrixAt(i, M.matrix);
      if (colourise) im.setColorAt(i, colourise(it, i));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    layer.add(im);
    return im;
  }

  const Y = plan.ground;

  build(shrubGeo, matShrub, shrubs, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, R() * 6.2832, 0);
    M.scale.set(p.s, p.s * (0.7 + R() * 0.6), p.s);
  });

  build(palmGeo, [matBark, matFrond], palms, (p) => {
    const s = 0.80 + R() * 0.48;
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set((R() - 0.5) * 0.14, R() * 6.2832, (R() - 0.5) * 0.14);
    M.scale.set(s, s * (0.9 + R() * 0.3), s);
  });

  build(lampGeo, [matPost, matGlow], lamps, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, p.rot, 0);
    M.scale.set(1, 1, 1);
  });

  /* One pool per lamp, on the ground under it. 0.06 above the surface: enough to clear the
     painted road without floating, and far below anything the eye resolves at district range.
     The size jitter matters more than it sounds — 628 identical discs along a kerb line read as
     a dotted rule rather than as lighting. */
  const pools = build(poolGeo, matPoolNight, lamps, (p) => {
    const s = 3.4 + R() * 1.5;
    M.position.set(p.x * r, Y + 0.06, -p.y * r);
    M.rotation.set(0, 0, 0);
    M.scale.set(s, 1, s);
  });
  if (pools){
    pools.castShadow = pools.receiveShadow = false;
    /* NOT litMat. That flag means "keep your own material in every mode except silhouette",
       which for an additive quad would put a flat black disc under every lamp in the one view
       built to read massing. nightOnly is the shell's flag for a mesh that should simply not
       exist outside night and dusk. */
    pools.userData.litMat = false;
    pools.userData.nightOnly = true;
    pools.userData.duskMats = matPoolDusk;
    pools.renderOrder = 2;
  }

  build(carGeo, matCar, cars, (p) => {
    M.position.set(p.x * r, Y + 0.01, -p.y * r);
    M.rotation.set(0, p.rot, 0);
    M.scale.set(1, 1, 1);
  }, () => {
    // Mostly white and silver, because that is what the car park of any Gulf city looks like,
    // with the occasional darker one so the row is not a single value.
    const v = R();
    const k = v < 0.62 ? 1.05 : v < 0.86 ? 0.78 : 0.42;
    return col.setRGB(k, k * 0.99, k * 0.97);
  });

  build(boatGeo, matBoat, boats, (p) => {
    M.position.set(p.x * r, 0.22, -p.y * r);
    M.rotation.set(0, p.rot, 0);
    const s = 0.75 + R() * 0.75;
    M.scale.set(s, s, s);
  });

  return { palms: palms.length, lamps: lamps.length, cars: cars.length, boats: boats.length,
           shrubs: shrubs.length };
}

return { addProps, materials: { matBark, matFrond, matPost, matGlow, matCar, matBoat, matShrub } };
}
