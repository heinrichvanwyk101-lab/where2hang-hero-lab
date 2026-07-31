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

   ---------------------------------------------------------------------------------------------
   STEP 3 — REAL COASTLINES, and the one thing the world render made undeniable.

   In the Day world view all five islands were ELLIPSES. Not approximately: the ring road traced a
   perfect concentric oval on every one of them, and with the labels covered there was no way to
   tell Yas from Saadiyat from Corniche. Eight to eleven control points, all of them convex, run
   through a smoothing spline, is a recipe for an oval however carefully the points are chosen —
   and at world scale the SHAPE OF THE LAND is the only identity an island has, because at that
   distance the buildings are three pixels tall.

   Three things changed together, because changing any one alone breaks the other two.

   1. THE OUTLINES are 17 to 32 points now and, more importantly, they are no longer all convex.
      Corniche gets the Al Bateen creek, Yas the marina inlet, Reem the southern bay, Saadiyat a
      genuinely straight beach. These are authored from the real geography rather than surveyed
      from it — the shapes are recognisable, not accurate, and Plan mode is the check.

   2. THE SMOOTHER is Chaikin, not splineThru. A spline overshoots its control polygon and would
      have crossed the walls of the Yas inlet; corner cutting is strictly inside it and cannot.

   3. THE RING ROAD is offset inward by a FIXED DISTANCE along each sample's own normal, rather
      than scaled radially toward the island centre. The old radial scale gave Corniche a road
      8.7 units inland at the west tip and 3.5 on the north shore, from one number. The same fix
      is applied to the coast park, which had the same defect and for the same reason.

   Everything that reads the coastline was re-pointed at a real distance test as well: the
   "scale the point out by 1.09 and see if it is still inside" trick is correct on a blob and
   wrong beside every notch, because it measures toward the island centre rather than toward the
   nearest shore.

   ---------------------------------------------------------------------------------------------
   THE GROUND ITSELF is one canvas texture per island, painted from the SAME cell list the
   fabric generator produced, so roads land between blocks and pavement lands under buildings by
   construction rather than by luck. It costs one texture and zero extra draw calls: the island
   mesh already existed, and ExtrudeGeometry already emits two material groups (0 = the caps,
   1 = the bevelled sides), so the ground goes on group 0 and the beach edge on group 1.
   ============================================================================================= */
import * as THREE from 'three';
export const BUILD = 'world v42';

/* THE DATUM. Derived, never typed twice. */
export const ISLE_DEPTH   = 2.4;
export const ISLE_BEVEL_T = 0.5;
export const ISLE_BEVEL_S = 1.6;
export const GROUND = ISLE_DEPTH + ISLE_BEVEL_T;   // 2.9 — the top face of every island

export function buildWorld(scene, kit, opts = {}){
const MAX_ANISO = opts.maxAnisotropy || 4;
/* The prop kit is OPTIONAL. Pass it and the islands get palms, lamps, cars and boats; leave it
   out and everything else still builds. Same argument as the city kit: a module that can be
   omitted can be bisected when something breaks. */
const props = opts.props || null;

/* C AND rnd ARRIVE AS ARGUMENTS NOW, and this file imports nothing local at all.

   They used to come from a static `import ... from './w2h-city.js'`, which meant the cache-
   busting query string had to be written identically here and in world-nav.html — and if the
   two ever drifted, the browser would load the city kit TWICE and hand out two independent
   copies of the seeded RNG. The header of that file is explicit that the shared sequence is
   what makes the skyline deterministic; two of them would have reshuffled the city between the
   landmarks and the fabric, silently.

   That is a bad failure mode to leave lying around to save one parameter. With no local import
   here the version string exists in exactly one place, world-nav.html, and a drop that changes
   one module is a one-file paste instead of four. */
const C   = opts.C;
const rnd = opts.rnd;
if (!C || !rnd) throw new Error('buildWorld: pass C and rnd from w2h-city.js via opts');

const world = new THREE.Group();
scene.add(world);

/* ---------- the sea that connects everything ----------

   TWO PLANES, and the second one is not decoration.

   The animated water is 3,200 across, so its edge is 1,600 units out. At dusk the camera can see
   the horizon, and a ray leaving the world camera 8 degrees below horizontal does not reach y=0
   until 2,846 units — well past that edge. Everything beyond it was falling through to the
   skybox, and since the skybox below the horizon was painted as ground, the far half of every
   frame came out as brown haze with no waterline anywhere in it. That is most of why the first
   dusk render read as one flat sepia wash.

   Enlarging the animated plane is the wrong fix: the wave loop walks every vertex on the CPU and
   recomputes normals each frame, so a plane big enough to reach the horizon at this resolution
   would cost twenty thousand vertices a frame on a phone. Instead a second, static, unlit-ish
   plane sits just below it and runs out to 14,000. It never animates, it is one draw call, and
   by the time it is visible it is far enough away that the fog has most of it anyway. */
/* A TILING RIPPLE NORMAL, GENERATED RATHER THAN LOADED.

   The animated plane is 3200 units across 70 segments: 46 units, 357 metres, between vertices.
   So the wave loop can only ever produce enormous smooth swells, and between them the surface is
   a perfect mirror — which is most of why the sea reads as dark glass rather than as water.

   Fine detail belongs in a normal map, not in geometry. This one is built the same way the
   ground canvases are, on a 2D context at load, so there is no asset to fetch and nothing to go
   stale. Tileability is the only constraint that matters and it comes free: every component uses
   INTEGER frequencies across the canvas, so the height field is periodic by construction and the
   seams cannot show however far it repeats.

   Exported, because the material it belongs on is not this one. world-nav.html swaps in its own
   water material per view mode, so a normal map assigned here would only ever be visible at
   night. The shell assigns it to all four. */
function makeWaterNormal(N = 512){
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);

  /* A SPECTRUM, NOT SIX WAVES, and the corduroy is why.

     The first version used six components with the two lowest carrying almost all the amplitude,
     which is a recipe for exactly what shipped: one dominant diagonal crest repeated across the
     whole sea. Water has no dominant direction and no dominant wavelength — it has many, with
     energy falling off as frequency rises. So this walks a ring of directions, gives each a
     1/f amplitude, and detunes both the angle and the phase per component so nothing lines up
     into a stripe. Integer frequencies are still forced at the end, because that is the only
     thing keeping the tile seamless. */
  const waves = [];
  let seed = 0x9E3779B9;
  const rr = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let k = 0; k < 26; k++){
    /* 3 TO 16 CYCLES, DOWN FROM 2 TO 24. In motion the fine end of the spectrum is what gives the
       repeat away: at a 123-unit tile the smallest components were 5 units across, so they slid
       past the camera fast enough to read as a moving pattern rather than as water. Dropping the
       top of the band and enlarging the tile below makes the same energy sit in longer waves,
       which move more slowly across the frame and read as swell. */
    const f = 3 + Math.pow(k / 25, 1.5) * 13;              // 3..16 cycles across the tile
    /* HEADINGS COVER A HALF PLANE, not a full one: (fx, fy) and (-fx, -fy) are the same wave
       with a phase shift, so walking the full circle spends half the components duplicating
       directions already taken. The golden ratio steps through [0, pi) without ever revisiting,
       which is the property that keeps two crests from lining up into a stripe. */
    const th = (k * 1.9416 + rr() * 0.35) % Math.PI;
    let fx = Math.round(Math.cos(th) * f), fy = Math.round(Math.sin(th) * f);
    if (fx === 0 && fy === 0) fy = 1;
    waves.push([fx, fy, Math.pow(2 / f, 0.85), rr() * 6.283]);
  }

  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    let h = 0;
    for (const [fx, fy, a, ph] of waves)
      h += a * Math.sin(2 * Math.PI * (fx * x + fy * y) / N + ph);
    H[y * N + x] = h;
  }
  const S = 1.35;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++){
    const l = H[y * N + ((x - 1 + N) % N)], r = H[y * N + ((x + 1) % N)];
    const u = H[((y - 1 + N) % N) * N + x], dn = H[((y + 1) % N) * N + x];
    let nx = -(r - l) * S, ny = -(dn - u) * S, nz = 1;
    const L = Math.hypot(nx, ny, nz);
    const i = (y * N + x) * 4;
    img.data[i]     = (nx / L * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / L * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / L * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  /* REPEAT 140 WAS THE OTHER HALF OF IT. A 22.9-unit tile on a 3200-unit plane seen from the
     world camera is a handful of pixels per tile, which is not detail — it is a moire generator,
     and the wide diagonal banding in the world render was the beat between the tile and the
     pixel grid rather than anything in the texture. 26 gives a 123-unit tile with the finest
     component at 5 units, and it is filtered rather than aliased. */
  /* 17, NOT 26. A 188-unit tile instead of 123: the seam recurs half again as far apart, which
     is what the eye was catching as the camera moved. Wavelengths now run 63 down to 12 units —
     490 metres to 90 — which is swell and chop rather than ripple, and correct for a body of
     water this size. */
  t.repeat.set(17, 17);
  t.anisotropy = MAX_ANISO;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
const waterNormal = makeWaterNormal();

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(3200, 3200, 70, 70),
  new THREE.MeshStandardMaterial({ color:0x050A10, roughness:0.58, metalness:0.05,
    envMapIntensity:0.95, normalMap:waterNormal,
    normalScale:new THREE.Vector2(0.42, 0.42) })
);
water.rotation.x = -Math.PI/2;
/* NO SHADOWS ON THE SEA. The dusk sun sits 13 degrees up, so every island throws a shadow two
   hundred units long, and on the water those landed as hard dark slabs floating next to the
   land — an island casting a solid rectangle across a reflective surface reads as a rendering
   fault, not as evening. Water at a grazing angle is mostly reflecting the sky anyway, and the
   sky is not in shadow. */
water.receiveShadow = false;
scene.add(water);

const farSea = new THREE.Mesh(
  new THREE.PlaneGeometry(14000, 14000, 1, 1),
  new THREE.MeshStandardMaterial({ color:0x050A10, roughness:0.62, metalness:0.05 })
);
farSea.rotation.x = -Math.PI/2;
/* -1.15, NOT -0.45, AND THE OLD COMMENT WAS WRONG ON ITS OWN TERMS.

   It said "clearly under the wave troughs". The wave loop in world-nav.html is
   sin(...)*0.55 + sin(...)*0.42, which reaches -0.97 — so the flat plane sat half a unit ABOVE
   the deepest water and punched through it. At any instant about 17 per cent of the animated
   plane is below -0.45, which is the large dark shape with the curved edge across the near water
   in the district render.

   It was invisible until this week for a reason worth recording: the shell assigns farSea the
   SAME material as the near water, so while both were flat and unmapped the intersection had
   nothing to give it away. Adding a normal map gave the near surface a specular response that
   the flat plane does not share, and a seam that had been there all along became a hole.

   -1.15 clears the trough by 0.18. The step this leaves at the 3200-unit boundary is 1.15 units
   seen from at least 1,600 away through 40 per cent fog. */
farSea.position.y = -1.15;
farSea.receiveShadow = false;
farSea.castShadow = false;
scene.add(farSea);
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
  /* ABU DHABI ISLAND. Long WSW-ENE wedge. Three features carry the recognition: the west tip at
     the Breakwater, the long shallow arc of the Corniche along the whole north shore, and the
     Al Bateen creek biting north into the south-west coast. The creek is the important one — it
     is the first genuinely CONCAVE feature in this world, and it is what the ring-road offset
     below had to be rewritten to survive. */
  corniche: [
    [-1.00,-0.02],[-0.93, 0.10],[-0.82, 0.22],[-0.68, 0.29],[-0.52, 0.33],
    [-0.34, 0.35],[-0.15, 0.34],[ 0.04, 0.31],[ 0.22, 0.27],[ 0.40, 0.22],
    [ 0.56, 0.18],[ 0.70, 0.12],[ 0.82, 0.04],[ 0.92,-0.08],[ 1.00,-0.22],
    [ 0.94,-0.36],[ 0.80,-0.44],[ 0.62,-0.50],[ 0.42,-0.54],[ 0.20,-0.56],
    [-0.02,-0.55],[-0.20,-0.52],[-0.34,-0.48],
    [-0.47,-0.47],[-0.51,-0.36],[-0.55,-0.28],[-0.62,-0.30],[-0.64,-0.42],
    [-0.72,-0.48],[-0.85,-0.44],[-0.94,-0.28],[-0.99,-0.14],
  ],
  /* AL MARYAH. Small, dense, reclaimed, and honestly close to a rounded rectangle in life — so
     the identity here is the CORNERS, not a silhouette. Straighter flanks with distinct corner
     points give Chaikin a rounded rectangle to smooth; an evenly spaced ring gives it an
     ellipse, which is what every island in this world used to be. */
  maryah: [
    [-0.30, 1.00],[ 0.10, 0.96],[ 0.44, 0.82],[ 0.72, 0.56],[ 0.86, 0.22],
    [ 0.86,-0.16],[ 0.72,-0.52],[ 0.44,-0.80],[ 0.08,-0.95],[-0.28,-1.00],
    [-0.58,-0.88],[-0.76,-0.62],[-0.82,-0.30],[-0.82, 0.06],[-0.78, 0.40],
    [-0.64, 0.70],[-0.48, 0.90],
  ],
  /* AL REEM. Long, thin, and bitten into from the south by a wide open bay. The bay is broad
     enough that the ring road follows it round rather than cutting across the mouth, which is
     the other half of the offset test: one island where a concavity is KEPT, one where it is
     cut. */
  reem: [
    [-1.00, 0.06],[-0.86, 0.26],[-0.66, 0.40],[-0.42, 0.48],[-0.16, 0.52],
    [ 0.12, 0.52],[ 0.40, 0.48],[ 0.66, 0.38],[ 0.86, 0.22],[ 0.98, 0.00],
    [ 0.94,-0.22],[ 0.76,-0.38],[ 0.52,-0.46],[ 0.26,-0.50],
    [ 0.06,-0.44],[-0.06,-0.28],[-0.18,-0.20],[-0.32,-0.28],[-0.44,-0.42],
    [-0.60,-0.50],[-0.78,-0.44],[-0.92,-0.24],
  ],
  /* SAADIYAT. Broad, and defined by ONE STRAIGHT LINE: the north-west beach runs nearly ruler
     straight for two thirds of the island. The six points along it are deliberately collinear —
     a straight coast is a feature, and jittering it "for naturalism" is what turned this island
     into an oval in the first place. */
  saadiyat: [
    [-1.00, 0.10],[-0.72, 0.19],[-0.44, 0.27],[-0.14, 0.36],[ 0.16, 0.45],
    [ 0.46, 0.54],[ 0.70, 0.48],[ 0.90, 0.30],[ 1.00, 0.04],[ 0.96,-0.22],
    [ 0.82,-0.42],[ 0.60,-0.54],[ 0.34,-0.58],[ 0.10,-0.52],[-0.04,-0.40],
    [-0.16,-0.46],[-0.30,-0.58],[-0.52,-0.62],[-0.74,-0.52],[-0.90,-0.34],
    [-0.98,-0.12],
  ],
  /* YAS. The marina inlet, driven deep into the south-west and narrow all the way up. Nothing
     else in this world tests the geometry as hard: the inlet is narrower than twice the ring
     offset, so a naive inward scale folds the road back over itself inside it. The offset here
     detects that and cuts the ring into open runs across the mouth instead — which is also what
     the real road does, because you cannot drive across a marina. */
  yas: [
    [-0.94, 0.18],[-0.72, 0.44],[-0.42, 0.62],[-0.08, 0.70],[ 0.26, 0.66],
    [ 0.58, 0.52],[ 0.84, 0.30],[ 0.98, 0.02],[ 0.94,-0.28],[ 0.76,-0.52],
    [ 0.48,-0.68],[ 0.16,-0.74],[-0.12,-0.70],
    [-0.26,-0.62],[-0.30,-0.46],[-0.29,-0.26],[-0.33,-0.12],[-0.42,-0.14],
    [-0.44,-0.30],[-0.47,-0.48],[-0.56,-0.58],[-0.74,-0.58],[-0.92,-0.36],
    [-1.00,-0.10],
  ],
};

/* CHAIKIN, NOT A SPLINE, AND THIS IS NOT A STYLE PREFERENCE.

   splineThru was fine on eleven control points and is unusable on thirty-two. Catmull-Rom
   overshoots its control polygon on convex runs and cuts inside it on concave ones; at low point
   counts that reads as "hand drawn", but drive it through the walls of a narrow inlet and the
   two sides cross. Yas would have knotted at the head of the marina.

   Chaikin is corner cutting: every output point is a convex combination of two inputs, so the
   result is strictly INSIDE the control polygon and can never overshoot. Two passes quadruples
   the point count and rounds the corners by about a quarter of the shortest edge, which is
   exactly the amount of softening a stylised coast wants.

   It also means the collinear runs stay collinear. Saadiyat's beach survives as a straight line,
   which no spline through the same points would have allowed. */
function chaikin(pts, passes){
  let p = pts.map(a => [a[0], a[1]]);
  for (let k = 0; k < passes; k++){
    const out = [];
    for (let i = 0; i < p.length; i++){
      const a = p[i], b = p[(i + 1) % p.length];
      out.push([a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25]);
      out.push([a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75]);
    }
    p = out;
  }
  return p;
}
/* THE SHAPE'S OWN HALF-EXTENTS. Everything below that used to assume an island filled -1..1 on
   both axes now asks for these instead. No island has ever filled both: Corniche is 1.00 wide and
   0.56 deep, which is the whole reason two thirds of its ground canvas was painting open sea. */
const bboxCache = new Map();
function isleHalf(id){
  let b = bboxCache.get(id);
  if (!b){
    let hx = 0, hy = 0;
    isleSmooth(id).forEach(p => { hx = Math.max(hx, Math.abs(p[0])); hy = Math.max(hy, Math.abs(p[1])); });
    b = { x: hx, y: hy };
    bboxCache.set(id, b);
  }
  return b;
}

const smoothCache = new Map();
function isleSmooth(id){
  let sm = smoothCache.get(id);
  if (!sm){ sm = chaikin(ISLE_SHAPES[id], 2); smoothCache.set(id, sm); }
  return sm;
}

function isleShape(id, r){
  const pts = isleSmooth(id);
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0]*r, pts[0][1]*r);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0]*r, pts[i][1]*r);
  shape.closePath();
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

/* GROUND UVs ARE BAKED INTO THE VERTICES, not applied as a texture transform.

   This was repeat = 1/span with offset = 0.5 on the texture, which is the tidy way to do it and
   is the one link in the chain I could not verify from outside a browser. It matters because the
   failure is silent and total: ExtrudeGeometry's default top-face UV is the raw shape coordinate,
   so u runs from -76 to 78. If the transform reaches the shader you get 0.076 to 0.934 and the
   island samples its own painted plan. If it does NOT, every vertex clamps to the canvas edge —
   and the canvas edge is the pure sand of the base fill, so the island renders as one flat tan
   tone with no roads, no apron and no parkland. Which is precisely what four passes of palette
   and exposure work failed to shift.

   Rasterising the painter with a real 2D canvas proved the texture itself is fine: 2,467 distinct
   colours, tarmac at 4.8 per cent, paving at 9.6, and the 74 per cent pure sand is exactly the
   area outside the coastline where it belongs. So the picture is right and the addressing was the
   suspect. A custom UVGenerator writes 0..1 straight into the attribute buffer, the texture keeps
   default repeat and offset, and there is no longer a mechanism to be wrong. */
function islandGeometry(id, r){
  /* TWO SPANS NOW, ONE PER AXIS, and the canvas below is cut to the same aspect so that pixels
     per unit stays EQUAL on both. That last part is not optional: map the island into a square
     canvas with different spans and every road stroke, kerb and roundabout comes out elliptical,
     because a lineWidth is measured in canvas pixels and those pixels would no longer be square
     on the ground. Crop the canvas instead of stretching the mapping and the geometry is
     untouched — the texture simply stops storing sea. */
  const h = isleHalf(id);
  const spanX = r * 2 * h.x * GROUND_PAD;
  const spanY = r * 2 * h.y * GROUND_PAD;
  const UVGen = {
    generateTopUV(geometry, vertices, iA, iB, iC){
      return [iA, iB, iC].map(i => new THREE.Vector2(
        vertices[i*3]     / spanX + 0.5,
        vertices[i*3 + 1] / spanY + 0.5));
    },
    // The bevelled sides carry no map, so anything valid will do.
    generateSideWallUV(){
      return [new THREE.Vector2(0,0), new THREE.Vector2(1,0),
              new THREE.Vector2(1,1), new THREE.Vector2(0,1)];
    },
  };
  const g = new THREE.ExtrudeGeometry(isleShape(id, r), {
    depth: ISLE_DEPTH, curveSegments: 14,
    bevelEnabled: true, bevelThickness: ISLE_BEVEL_T, bevelSize: ISLE_BEVEL_S, bevelSegments: 2,
    UVGenerator: UVGen,
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

/* DISTANCE TO THE COAST, replacing every "scale the point out by 1.09 and re-test" in this file.

   That trick works on a convex blob and is wrong the moment a coastline has a notch: scaling a
   point radially about the island centre moves it ACROSS the mouth of an inlet rather than away
   from the nearest shore, so a building beside the Yas marina passed a clearance test measured
   against the far bank. It also gave a clearance that varied with position — 1.09 of a point 76
   units out is a 6.8-unit margin, 1.09 of a point 20 units out is 1.8.

   A real distance to the sampled outline is one polyline test, gives the same margin everywhere,
   and is correct in a concavity by construction. */
const closedCache = new Map();
function outlineClosed(id){
  let c = closedCache.get(id);
  if (!c){
    c = isleOutline(id).map(p => [p.x, p.y]);
    // getSpacedPoints returns divisions+1 points and the last is the first, so this is closed.
    closedCache.set(id, c);
  }
  return c;
}
function distToOutline(id, x, y){ return distToPolyline(x, y, outlineClosed(id)); }

/* ===========================================================================
   THE INWARD OFFSET, and why the ring road needed one.

   The ring was outline.map(p => [p.x * 0.885, p.y * 0.885]) — a radial scale toward the island
   centre. On Corniche that insets the coast by 8.7 units on the long axis and 3.5 on the short,
   because a percentage of a large radius is not a percentage of a small one. Worse, on a
   concave coast it folds: scale both walls of an inlet toward a centre that lies OUTSIDE the
   inlet and they cross each other.

   This offsets every sample along its own inward normal by a FIXED distance instead, which is
   what "the road runs sixty metres inland" actually means. The normal direction is chosen by
   testing which side lands inside the polygon, so it needs no orientation convention and cannot
   be got backwards.

   THE FOLD TEST IS ONE LINE AND IT IS THE WHOLE TRICK. An offset point that has crossed to the
   far wall of a notch is, by definition, closer than `inset` to some other part of the original
   coastline. So: drop any offset point whose distance to the original outline is materially less
   than the inset it was given. In an inlet narrower than 2 * inset every point in the throat
   fails, and what is left is two runs that stop either side of the mouth.

   RETURNS AN ARRAY OF POLYLINES, NOT ONE CLOSED LOOP. That is the honest shape of the result and
   it is also the real road: nothing drives across the mouth of a marina. Where nothing was
   pruned the single run is closed back on itself, so a simple island still gets a ring.
   =========================================================================== */
/* One sample, offset inward. Shared by the ring and by the coast park, because the park was
   scaling radially too — outline[i] * 0.925 — and had exactly the same defect: on Corniche that
   is 2.8 units inland on the north shore and 8.7 at the west tip, so a strip described as a
   constant width was in fact three times wider at one end than the other. */
function inwardAt(id, pts, i, dist){
  const n = pts.length - 1;
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  let tx = b.x - a.x, ty = b.y - a.y;
  const L = Math.hypot(tx, ty) || 1;
  tx /= L; ty /= L;
  const nx = -ty, ny = tx;
  let px = pts[i].x + nx * dist, py = pts[i].y + ny * dist;
  if (!insideIsle(id, px, py)){ px = pts[i].x - nx * dist; py = pts[i].y - ny * dist; }
  return [px, py];
}

/* The same sample, pushed the other way. inwardAt keeps whichever side lands inside the polygon;
   this keeps whichever lands outside, which is all the difference between a ring road and a
   beach. */
function outwardAt(id, pts, i, dist){
  const n = pts.length - 1;
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  let tx = b.x - a.x, ty = b.y - a.y;
  const L = Math.hypot(tx, ty) || 1;
  tx /= L; ty /= L;
  const nx = -ty, ny = tx;
  let px = pts[i].x + nx * dist, py = pts[i].y + ny * dist;
  if (insideIsle(id, px, py)){ px = pts[i].x - nx * dist; py = pts[i].y - ny * dist; }
  return [px, py];
}

/* HOW FAR THE BEACH CAN ACTUALLY REACH AT ONE SAMPLE.

   Offsetting outward has the mirror of the ring road's problem. At a CONCAVE point the outward
   normals of neighbouring samples converge, and at the head of a narrow inlet they cross to the
   far bank entirely — which put two of Yas's beach vertices INSIDE the island, sand growing up
   through the land at the top of the marina, and squeezed Saadiyat's outer ring down to 0.037
   units between adjacent points, a hair from folding.

   The ring road could drop the folded samples and return open runs. A skirt cannot: every ring
   needs the same vertex count or the strip between them has nothing to index. So this clamps
   instead of pruning. It backs the distance off until the point is genuinely outside and
   genuinely that far from the shore, and returns the largest distance that survives.

   Which is also the physically right answer. A beach in a tight inlet IS narrower, and pinching
   to nothing at the head of a channel is what the real coast does. */
function beachReach(id, pts, i, want){
  let dcur = want;
  for (let k = 0; k < 5; k++){
    const [px, py] = outwardAt(id, pts, i, dcur);
    if (!insideIsle(id, px, py) && distToOutline(id, px, py) > dcur * 0.80) return dcur;
    dcur *= 0.5;
  }
  return 0;
}

const RING_INSET = 0.085;      // normalised island units — about 6.5 on Corniche, 5.3 on Yas
const RING_MIN   = 10;         // a surviving run shorter than this is debris, not a road

function insetRing(id, inset){
  const o = isleOutline(id);
  const n = o.length - 1;                       // last point repeats the first
  const poly = [];
  for (let i = 0; i < n; i++) poly.push([o[i].x, o[i].y]);
  const closed = poly.concat([poly[0]]);

  const off = [];
  for (let i = 0; i < n; i++){
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const L = Math.hypot(tx, ty) || 1;
    tx /= L; ty /= L;
    let nx = -ty, ny = tx;
    let px = poly[i][0] + nx * inset, py = poly[i][1] + ny * inset;
    if (!insideIsle(id, px, py)){
      px = poly[i][0] - nx * inset; py = poly[i][1] - ny * inset;
    }
    const good = insideIsle(id, px, py) &&
                 distToPolyline(px, py, closed) > inset * 0.92;
    off.push(good ? [px, py] : null);
  }

  // Walk the circle from the first gap, so a run that straddles index 0 is not split in two.
  let start = 0;
  while (start < n && off[start] !== null) start++;
  if (start === n){                              // nothing pruned: a clean closed ring
    const loop = off.slice();
    loop.push(loop[0].slice());
    return [loop];
  }
  const segs = [];
  let run = [];
  for (let k = 0; k <= n; k++){
    const p = off[(start + k) % n];
    if (p) run.push(p);
    else { if (run.length >= RING_MIN) segs.push(run); run = []; }
  }
  if (run.length >= RING_MIN) segs.push(run);
  return segs;
}

/* ===========================================================================
   GROUND SURFACES.

   These are canvas colours that get MULTIPLIED by the material tint, exactly like the fabric's
   instanceColor. Same lesson, same reason: write the finished night colour into the texture and
   Day mode multiplies a pale stone material by a dark map and lands on charcoal. Keep the map
   in a fairly bright, fairly narrow band, carry the HUE here and the LEVEL on the material, and
   both modes work off one canvas.
   =========================================================================== */
/* A VALUE LADDER, NOT A SET OF COLOURS. This is the third pass at this palette and the first
   two were both wrong in the same way, which the Day render at place level finally made obvious:
   the ground looked like one unbroken cream plain with the palace standing on nothing.

   Multiply the old palette by the Day ground tint and take the luminance of each:

       sand   0.545      paving  0.546      lawn  0.511

   Three surfaces, three different hues, ONE brightness. Human vision reads layout and form from
   luminance; hue does almost nothing for shape at a distance. A plan drawn in equal-luminance
   colours is invisible however different the colours are, and only the tarmac — the one thing
   that happened to be darker — was ever showing up.

   So the palette is now spaced by VALUE first and hue second, with a deliberate ladder:

       beach 0.76 > pavingLt 0.72 > paving 0.65 > sand 0.55 > lawn 0.40 > street 0.27 > road 0.21

   which is also roughly true: dry beach sand really is brighter than desert, concrete really is
   brighter than sand, and grass really is much darker than all of them. The greens go back DOWN
   from the last pass — they were lifted to stop parkland reading as a stain, but the fix for
   that was never to brighten the grass, it was to brighten everything the grass sits against. */
const SURF = {
  sand:     '#B7A78B',
  sandDk:   '#9E8F74',
  sandLt:   '#DDD1B4',
  beach:    '#E4D8BC',
  lawn:     'rgba(74,104,52,',
  lawnLt:   'rgba(96,132,66,',
  // A little darker again now that Day is no longer over-exposed. Tarmac is the bottom rung of
  // the ladder and the one surface whose job is to draw a line, so it can afford to be the
  // darkest thing on the island by a clear margin.
  street:   '#454C53',
  road:     '#33383E',
  apron:    '196,188,168',      // the developed ground the whole city sits on
  paving:   '#D7D1BE',
  pavingLt: '#E6E0CE',
  kerb:     '#EFEBDF',
  line:     'rgba(250,246,236,0.92)',
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

/* THE PLAN, SEPARATED FROM THE PAINT.

   The painter used to invent the road network and the parkland as it drew them, which was fine
   while pixels were the only consumer. They are not any more: every palm, lamp and car has to
   stand beside a road that actually exists and inside a park that actually exists, and a prop
   placer that re-derives the layout from its own random sequence will agree with the canvas for
   about one commit.

   So the layout is computed ONCE, as data, and handed to both. groundPlan knows where things
   are; paintGround decides what colour they are; the prop kit decides what stands next to them.
   Nothing downstream is allowed to invent geometry.

   TWO SEPARATE RANDOM SEQUENCES come out of here, deliberately. Tuning a road colour must not
   move a palm tree, and adding a palm must not repaint a car park. Anything that changes layout
   goes through rndPlan; the other two are downstream and independent. */
/* THE ROAD SKELETON COMES FIRST, and everything else is placed around it.

   Roads were being drawn LAST — over the blocks, so they read correctly on the canvas — but the
   buildings had already been placed by a generator that knew nothing about them. So a road would
   run straight under a row of towers, which is the one mistake that cannot be argued as stylised:
   a city can be compressed, abstracted or recoloured, but a carriageway with a building standing
   in it is simply wrong.

   The fix is an ordering one rather than a drawing one. Ring and arterials depend only on the
   coastline and the district core — never on the cells — so they can be computed first, handed to
   the fabric generator as an exclusion, and only then painted. Same principle as using real map
   data for the skeleton and generating the fabric inside it: the network is the armature, and
   nothing that stands up gets to ignore it.
   =========================================================================== */
const ROAD_RING = 0.052, ROAD_ART = 0.044;   // normalised widths, shared by paint and clearance
const COAST_CLEAR = 0.050;                   // no building closer than this to the waterline
/* THE BEACH WIDTH, HOISTED, because three things have to agree about it: the skirt geometry, the
   plan handed to the prop kit so boats do not moor on dry sand, and the spacing of the islands
   themselves. */
const BEACH_W = 12;                          // world units, before per-sample clamping
const COAST_PARK_IN = 0.038;                 // the seafront park sits between the beach and the ring

/* EXCLUSION IS A SET OF ROOMS, NOT A WALL.

   Corniche reserved its landmark band as avoidY:[-0.20, 1.0] — a strip right across the island,
   sixty per cent of its depth, off limits to the fabric generator. Combined with two large
   painted patches that covered the same strip, the entire northern half of the island was three
   landmarks standing on flat colour. In Plan it read as a cream void; in Day the west third was
   bare sand. The band was doing far more work than it was asked to.

   Every landmark actually occupies a rectangle a few tens of units across. Reserving those, and
   nothing else, lets the fabric come up between Etihad and ADNOC and round behind the palace —
   which is what is there in life. Emirates Palace does not read as a landmark because it stands
   alone; it reads as one because it is long and low and warm in front of a dense city, and it
   had nothing to be in front of.

   Authored in LOCAL UNITS beside the landmark each one belongs to, same convention as the ground
   patches, for the same reason: a reservation kept in step with a building by hand should be
   readable on the same screen as it. */
function normRects(d){
  if (!d._avoidN){
    d._avoidN = (d.avoid || []).map(a => ({
      x0: (a.x - a.w/2) / d.r, x1: (a.x + a.w/2) / d.r,
      y0: (-a.z - a.d/2) / d.r, y1: (-a.z + a.d/2) / d.r,
    }));
  }
  return d._avoidN;
}
function inAvoid(d, nx, ny, pad){
  const R = normRects(d), m = pad || 0;
  for (let i = 0; i < R.length; i++){
    const b = R[i];
    if (nx > b.x0 - m && nx < b.x1 + m && ny > b.y0 - m && ny < b.y1 + m) return true;
  }
  return false;
}

function roadSkeleton(d){
  const rndPlan = localRnd(hashId(d.id));
  const outline = isleOutline(d.id);
  const core    = d.coreN || [0, 0];
  const inside  = (nx, ny) => insideIsle(d.id, nx, ny);

  const ring = insetRing(d.id, RING_INSET);   // an ARRAY of open runs, not one closed loop

  /* Arterials out of the core, TRIMMED at the coastline and at the district's reserved band.
     The coast trim is obvious — the painter draws inside a clip so it could get away with running
     into the sea, but a car placed on the clipped part would be a car in the water. The band trim
     is Corniche's: its landmarks occupy a strip right across the island, and an arterial driven
     through Emirates Palace is no better than a tower standing in a road. */
  const arterials = [];
  for (let i = 0; i < 3; i++){
    const a  = (i / 3) * Math.PI * 2 + rndPlan() * 0.7;
    const ex = core[0] + Math.cos(a) * 1.30, ey = core[1] + Math.sin(a) * 1.30;
    const mx = core[0] + Math.cos(a) * 0.62 + (rndPlan() - 0.5) * 0.30;
    const my = core[1] + Math.sin(a) * 0.62 + (rndPlan() - 0.5) * 0.30;
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 1/28){
      const u = 1 - t;
      const x = u*u*core[0] + 2*u*t*mx + t*t*ex;
      const y = u*u*core[1] + 2*u*t*my + t*t*ey;
      if (!inside(x, y)) break;
      if (inAvoid(d, x, y, 0.01)) break;   // no arterial through the palace or the Etihad plaza
      pts.push([x, y]);
    }
    if (pts.length > 1) arterials.push(pts);
  }
  return { ring, arterials, core, rndPlan };
}

/* Point to polyline, squared until the last step. Called for every candidate block against every
   road segment, so it is the hot loop in world construction — about two million distance tests
   across five islands and two LOD layers, which measures at well under a tenth of a second. */
function distToPolyline(x, y, pts){
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++){
    const ax = pts[i][0], ay = pts[i][1];
    const dx = pts[i+1][0] - ax, dy = pts[i+1][1] - ay;
    const L2 = dx*dx + dy*dy;
    let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t*dx - x, py = ay + t*dy - y;
    const d2 = px*px + py*py;
    if (d2 < best) best = d2;
  }
  return Math.sqrt(best);
}

/* Clearance is the road's own half-width plus its kerb, plus half a block for the building that
   would otherwise overhang it. Written once so the painted width and the reserved width can
   never drift apart — which is exactly how a road ends up under a tower. */
/* THE ROAD TEST WAS TREATING BUILDINGS AS POINTS.

   It compared the CELL CENTRE against the carriageway and cleared it by ROAD_RING * 0.60, which
   is 0.0312 — barely more than the road's own half-width of 0.026. The building then grew a
   footprint around that centre and the corner nearest the road went wherever it went.

   Working the worst case: the widest plot is block * (1 - gap) * 0.98, and its worst approach is
   the DIAGONAL half-extent, which is that over root two. On a placeholder island at the mass
   pitch that is 2.45 units of building against 3.79 units of clearance and a 1.46-unit road
   half-width — the corner ends up 0.12 units INSIDE the carriageway. Not close: overlapping.
   Corniche's mass layer cleared it by 0.03 units, which is 20 centimetres and luck.

   So the clearance is the visible edge of the road, plus the largest half-diagonal a plot of
   this pitch can produce, plus a margin.

   AND THE VISIBLE EDGE IS THE KERB, NOT THE CARRIAGEWAY. v33 got the footprint half right and
   then made a new mistake: it measured from ROAD_RING * 0.5, which is half the tarmac. The
   painter strokes a kerb casing UNDER the carriageway at 1.20 times the width, so what the eye
   sees as the road edge is at 0.60 of it. Building up to 0.5 leaves the corner standing on the
   kerb — still obviously touching the road, which is exactly what it looked like. The original
   0.60 was right about the width all along and wrong only about treating the plot as a point.

   THE ROUNDABOUT NEEDED ONE TOO. It is a filled disc at plan.core with an outer kerb at 0.0472
   normalised, and nothing has ever tested against it — onRoad only ever knew about polylines,
   so the single most conspicuous piece of road on the island was the one thing buildings were
   free to stand in. */
const ROAD_KERB = 1.20;                      // the casing the painter strokes under the tarmac
const CORE_R    = 0.040 * 1.18;              // roundabout outer kerb, matching the painter

function onRoad(d, x, y, pitch){
  const R = d.roads;
  if (!R) return false;
  const pad = pitch * 0.62;
  for (let i = 0; i < R.ring.length; i++){
    if (distToPolyline(x, y, R.ring[i]) < ROAD_RING * 0.5 * ROAD_KERB + pad) return true;
  }
  for (let i = 0; i < R.arterials.length; i++){
    if (distToPolyline(x, y, R.arterials[i]) < ROAD_ART * 0.5 * ROAD_KERB + pad) return true;
  }
  if (R.core && Math.hypot(x - R.core[0], y - R.core[1]) < CORE_R + pad) return true;
  return false;
}

function groundPlan(d, cells, pitch){
  const seed     = hashId(d.id);
  const rndPlan  = localRnd(seed ^ 0x2545F491);
  const outline  = isleOutline(d.id);
  const inside   = (nx, ny) => insideIsle(d.id, nx, ny);
  const N        = outline.length;
  const { ring, arterials, core } = d.roads;

  /* Parks, in the holes the fabric left. Building an occupancy set from the actual cells and
     filling what is left over is the only way parkland lands where there is genuinely no city —
     scattering green at random puts lawns through the middle of blocks. */
  const q = 0.05;
  const occ = new Set();
  cells.forEach(c => {
    const cx = Math.round(c.jx / q), cy = Math.round(c.jy / q);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) occ.add((cx+a) + ',' + (cy+b));
  });
  /* HAND-AUTHORED GROUND WINS. Corniche's fabric is confined to a southern strip, so by the
     "no cells here" test the entire landmark band counts as empty and was generating 165 park
     blobs across it — which the painter then covered with forecourt patches, but which the prop
     placer read as an instruction to stand palm trees in the middle of the Etihad plaza. If a
     patch has been placed by hand, parkland does not get a vote there. Axis-aligned and slightly
     inflated: the rotation on the row strip is five degrees and not worth a matrix for. */
  const patches = (d.ground || []).map(p => ({
    x0: (p.x - p.w/2) / d.r, x1: (p.x + p.w/2) / d.r,
    y0: (-p.z - p.d/2) / d.r, y1: (-p.z + p.d/2) / d.r,
  }));
  const inPatch = (nx, ny) => patches.some(b =>
    nx > b.x0 - q && nx < b.x1 + q && ny > b.y0 - q && ny < b.y1 + q);

  const parks = [];
  for (let nx = -0.95; nx <= 0.95; nx += q){
    for (let ny = -0.95; ny <= 0.95; ny += q){
      if (occ.has(Math.round(nx/q) + ',' + Math.round(ny/q))) continue;
      if (distToOutline(d.id, nx, ny) < 0.045) continue;   // real margin, not a radial scale
      if (inPatch(nx, ny)) continue;
      if (onRoad(d, nx, ny, pitch)) continue;      // no lawns in the carriageway either
      if (rndPlan() > 0.58) continue;
      parks.push({ x: nx + (rndPlan()-0.5)*q, y: ny + (rndPlan()-0.5)*q,
                   r: q * (1.2 + rndPlan() * 1.0) });
    }
  }

  // The coast park, as a polyline the avenue of palms can follow.
  let coastLine = null;
  if (d.coastPark){
    const a = Math.round(d.coastPark[0] * (N - 1));
    const b = Math.round(d.coastPark[1] * (N - 1));
    coastLine = [];
    for (let i = a; i <= b; i++) coastLine.push(inwardAt(d.id, outline, i, COAST_PARK_IN));
  }

  return {
    outline, core, inside, ring, arterials, parks, coastLine, cells, pitch,
    beachN: BEACH_W / d.r,
    coastPark: d.coastPark, ground: GROUND,
    rndPaint: localRnd(seed ^ 0x9E3779B1),
    rndProps: localRnd(seed ^ 0x85EBCA6B),
  };
}

/* THE PAINTER.

   UV NOTE, because getting this wrong produces a ground that slides off the island and is
   maddening to debug. ExtrudeGeometry's default top-face UV is the raw shape coordinate — u is
   local x, v is the shape's y, which after the rotation is -z. So repeat = 1/(2R) and
   offset = 0.5 maps the island into 0..1 with no custom UV generator, and because R is a fixed
   multiple of the island radius the canvas mapping is IDENTICAL for all five islands regardless
   of size. Everything below is therefore written in normalised island units. */
function paintGround(d, plan){
  /* THE CANVAS IS CUT TO THE ISLAND, and this is where the ground plan gets its resolution back.

     Corniche's top cap used to land on canvas pixels 78..956 by 337..738 of a 1024 square: 878
     by 401, or 32.6 per cent of the texture. The other two thirds were the pure sand outside the
     coastline — memory spent storing open sea at full resolution.

     Width now sets the density and height follows the shape's own aspect, so pixels per unit is
     identical on both axes and nothing is stretched. At W 1536 Corniche comes out 1536 x 860 and
     the short axis — the one the roads run across, and the one four rounds of legibility work
     were fought on — goes from 401 usable pixels to 860. */
  const h  = isleHalf(d.id);
  const W  = d.r >= 50 ? 1536 : 768;
  const H  = Math.max(64, Math.round(W * h.y / h.x));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');

  const U  = W * 0.5 / (h.x * GROUND_PAD);  // pixels per normalised island unit, both axes
  const PX = n => W * 0.5 + n * U;
  const PY = n => H * 0.5 - n * U;          // +Y is north, canvas y runs the other way
  const R  = plan.rndPaint;
  const outline = plan.outline;
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
  function pathPoly(pts){
    g.beginPath();
    pts.forEach((p, i) => { const X = PX(p[0]), Y = PY(p[1]); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
  }

  /* 1. SAND, everywhere. Everything else is something laid on top of the desert, which is the
        correct order of operations for this city and reads that way. */
  g.fillStyle = SURF.sand;
  g.fillRect(0, 0, W, H);

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

  /* 3b. THE URBAN APRON, and this is the thing that was actually missing.

     Three passes at the palette all assumed the ground plan was failing to RENDER. It was not.
     The material carries the map in every mode, the district camera resolves it at roughly four
     texels per pixel with sixteen-times anisotropy, and the roads really are there — a hard look
     at the Day render finds the arterial sweeping past ADNOC and the green under the palace
     palms. The plan was rendering. It was just THIN: bare desert everywhere, with roads drawn on
     top and buildings standing directly on sand.

     Which is backwards. On a developed island, paved ground is the DEFAULT and sand is the
     exception — it survives at the beach, on waste plots and out at the edges. So the interior
     now gets an apron laid over the sand before anything else is drawn, ramped in over four
     concentric fills so there is no hard ring where it starts. Everything after this — parks,
     blocks, patches, roads — lands on developed ground instead of on desert, and the tarmac
     finally has something to be dark against.

     Coast stays sand: the outermost ring is at 0.95, so the beach band is untouched. */
  [[0.95, 0.30], [0.90, 0.34], [0.84, 0.40], [0.76, 0.45]].forEach(([sc, a]) => {
    g.fillStyle = 'rgba(' + SURF.apron + ',' + a + ')';
    pathOutline(sc); g.fill();
  });

  // 4. Parks, straight from the plan.
  plan.parks.forEach(p => {
    const x = PX(p.x), y = PY(p.y), rr = U * p.r;
    const grd = g.createRadialGradient(x, y, rr*0.15, x, y, rr);
    grd.addColorStop(0, SURF.lawnLt + '0.90)');
    grd.addColorStop(1, SURF.lawn   + '0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
  });

  /* 5. THE CITY FLOOR, painted from the fabric's own cells.

        Two passes. First a tarmac rect at 1.24 of the block pitch, so neighbouring cells always
        overlap however far the jitter pushed them and no sand slivers open up mid-block. Then
        the paved lot at 0.78, centred on the cell. What is left between the lots IS the street,
        the same width the fabric used for its gap, and it is a street rather than a painted
        line because it was never painted at all. */
  const bp = plan.pitch * U;
  g.fillStyle = SURF.street;
  plan.cells.forEach(c => {
    g.fillRect(PX(c.jx) - bp*0.62, PY(c.jy) - bp*0.62, bp*1.24, bp*1.24);
  });
  const kerbW = Math.max(1, U * 0.0045);
  plan.cells.forEach(c => {
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

  /* 7. THE COAST PARK. A stroke along a NAMED STRETCH of coastline rather than a rectangle: the
        Corniche park follows a curve, and no axis-aligned box put along it stays on the island —
        the north shore is 30 units out at the middle and 16 at the western end. */
  if (plan.coastLine){
    const wid = d.coastPark[2];
    g.lineCap = 'round';
    g.strokeStyle = SURF.lawnLt + '0.55)'; g.lineWidth = U * wid * 1.35;
    pathPoly(plan.coastLine); g.stroke();
    g.strokeStyle = SURF.lawnLt + '0.92)'; g.lineWidth = U * wid;
    pathPoly(plan.coastLine); g.stroke();
  }

  /* 8. ROADS, laid LAST so they cut through the fabric the way a real arterial does. Kerb first
        and slightly wider, then the carriageway on top of it, then a dashed centre line: three
        strokes of the same path, which is how you get a road with edges for the price of one. */
  /* ===========================================================================
     ROADS, IN THREE TIERS.

     Everything below is 2D drawing on a canvas that already exists. No mesh, no draw call, no
     triangle — which matters at a moment when the triangle count is the number under pressure,
     and is also why this is the cheapest remaining item on the list by a wide margin.

     The old version drew one stroke per road: a kerb casing, tarmac over it, and a dashed line
     down the middle whatever the road was. That gives every carriageway the same rank, and rank
     is most of what makes a road network read as a city rather than as a diagram. Three tiers
     now, and they differ in width, in casing and in what is painted on them:

       PRIMARY    the ring. Dual carriageway with a planted median, an edge line each side and a
                  dashed lane divider within each direction.
       SECONDARY  the arterials. Single carriageway, kerbed, edge lines, dashed centre.
       SERVICE    the block grid. Thin, uncased, unmarked — which is what a service road is.

     ONE HELPER DRAWS ALL THE MARKINGS, by walking a polyline and emitting a parallel offset of
     it. Offsetting in canvas space rather than in island space is deliberate: line widths and
     dash lengths are pixel quantities, the offsets have to match them, and doing the arithmetic
     twice in two coordinate systems is how kerbs and markings drift apart.
     =========================================================================== */

  // A polyline, offset sideways by `off` canvas pixels. Normals from the neighbours, so corners
  // stay parallel instead of pinching.
  function offsetPath(pts, off){
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++){
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let tx = PX(b[0]) - PX(a[0]), ty = PY(b[1]) - PY(a[1]);
      const L = Math.hypot(tx, ty) || 1;
      out.push([PX(pts[i][0]) - ty / L * off, PY(pts[i][1]) + tx / L * off]);
    }
    return out;
  }
  function strokePx(pts, style, width, dash){
    if (pts.length < 2) return;
    g.strokeStyle = style; g.lineWidth = Math.max(0.8, width);
    g.setLineDash(dash || []);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.stroke();
    g.setLineDash([]);
  }

  /* PRIMARY. Two carriageways with a median between them, so the geometry is: kerb casing, one
     tarmac band per direction, a planted median filling the gap, then markings. Drawing the
     tarmac as two bands rather than one wide band with a median painted over it means the median
     has real kerbs on both faces, which is what it looks like from above. */
  function roadPrimary(pts){
    const W = U * ROAD_RING;                      // full corridor, kerb to kerb
    const med = W * 0.16;                         // planted median
    const car = (W - med) / 2;                    // each carriageway
    const halfC = (med + car) / 2;                // centre of each carriageway from the axis
    g.lineCap = 'butt'; g.lineJoin = 'round';
    strokePx(offsetPath(pts, 0), SURF.kerb, W * ROAD_KERB);
    [-1, 1].forEach(sgn => {
      strokePx(offsetPath(pts, sgn * halfC), SURF.road, car);
      // Edge line hard against the kerb, dashed divider down the middle of the two lanes.
      strokePx(offsetPath(pts, sgn * (halfC + car * 0.40)), SURF.line, Math.max(1, W * 0.035));
      strokePx(offsetPath(pts, sgn * halfC), SURF.line, Math.max(1, W * 0.030),
               [U * 0.026, U * 0.030]);
    });
    // The median itself: kerb faces with planting between them.
    strokePx(offsetPath(pts, 0), SURF.kerb, med);
    strokePx(offsetPath(pts, 0), SURF.lawn + '0.92)', med * 0.52);
  }

  /* SECONDARY. One carriageway, still kerbed, edge lines and a dashed centre. Narrower casing
     than the ring so the hierarchy shows even where the two run parallel. */
  function roadSecondary(pts){
    const W = U * ROAD_ART;
    g.lineCap = 'butt'; g.lineJoin = 'round';
    strokePx(offsetPath(pts, 0), SURF.kerb, W * ROAD_KERB);
    strokePx(offsetPath(pts, 0), SURF.road, W);
    [-1, 1].forEach(sgn => strokePx(offsetPath(pts, sgn * W * 0.40), SURF.line,
                                    Math.max(1, W * 0.045)));
    strokePx(offsetPath(pts, 0), SURF.line, Math.max(1, W * 0.040), [U * 0.022, U * 0.026]);
  }

  /* SERVICE. Drawn from the block grid rather than from the skeleton, because that is what a
     service road is: the gap between plots. No casing and no markings — a painted lane the width
     of a car and a half, which at district range is a texture rather than a road, and that is
     exactly its job in the hierarchy. */
  function roadService(){
    const cells = plan.cells, pitch = plan.pitch;
    if (!cells || !cells.length || !pitch) return;
    const W = Math.max(1.2, U * pitch * 0.16);
    g.strokeStyle = SURF.street; g.lineWidth = W; g.lineCap = 'round';
    g.beginPath();
    /* DRAWN ON THE PLOT BOUNDARY, NOT THROUGH THE PLOT.

       v36 centred the cross on the cell, which is where the BUILDING is. The footprint is 0.78
       of the block, so all but the last 7 per cent of each arm was underneath a building and the
       only thing that reached daylight was a pair of stubs at the tips — noise on the apron
       rather than a grid. A service road runs between plots. Offsetting by half a pitch puts it
       exactly there, and the run then reaches the neighbouring boundary instead of stopping
       inside the neighbouring building. */
    const step = pitch, off = pitch * 0.5;
    for (let k = 0; k < cells.length; k++){
      const bx = cells[k].jx + off, by = cells[k].jy + off;
      g.moveTo(PX(bx - step * 0.52), PY(by)); g.lineTo(PX(bx + step * 0.52), PY(by));
      g.moveTo(PX(bx), PY(by - step * 0.52)); g.lineTo(PX(bx), PY(by + step * 0.52));
    }
    g.stroke();
    g.lineCap = 'butt';
  }

  /* A ROUNDABOUT, AND THE SLIP LANES INTO IT. The hatching is the detail that reads as traffic
     engineering rather than as a drawn circle: a wedge of parallel strokes on the approach side,
     which is how a nose island between the through lane and the slip is marked. */
  function roundabout(cx, cy, r, approaches){
    const px = PX(cx), py = PY(cy);
    g.fillStyle = SURF.kerb; g.beginPath(); g.arc(px, py, r * ROAD_KERB, 0, 6.2832); g.fill();
    g.fillStyle = SURF.road; g.beginPath(); g.arc(px, py, r, 0, 6.2832); g.fill();
    // Lane divider around the circulatory carriageway.
    g.strokeStyle = SURF.line; g.lineWidth = Math.max(1, r * 0.05);
    g.setLineDash([r * 0.30, r * 0.34]);
    g.beginPath(); g.arc(px, py, r * 0.70, 0, 6.2832); g.stroke();
    g.setLineDash([]);
    g.fillStyle = SURF.kerb; g.beginPath(); g.arc(px, py, r * 0.46 * ROAD_KERB, 0, 6.2832); g.fill();
    g.fillStyle = SURF.lawn + '0.95)';
    g.beginPath(); g.arc(px, py, r * 0.46, 0, 6.2832); g.fill();

    (approaches || []).forEach(ang => {
      // Hatched nose on the near side of each approach. Strokes run across the wedge, shortening
      // toward the point, which is what makes it read as a taper rather than as a patch.
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const tx = -ny, ty = nx;
      g.strokeStyle = SURF.line; g.lineWidth = Math.max(0.8, r * 0.045);
      for (let t = 0; t < 1; t += 0.16){
        const d0 = r * (1.10 + t * 1.35);
        const halfW = r * 0.34 * (1 - t);
        const bx = px + nx * d0, by = py - ny * d0;   // canvas y runs the other way
        g.beginPath();
        g.moveTo(bx - tx * halfW, by + ty * halfW);
        g.lineTo(bx + tx * halfW, by - ty * halfW);
        g.stroke();
      }
    });
  }

  /* WHERE AN ARTERIAL ACTUALLY MEETS THE RING, which is not where it ends.

     v36 put the junction roundabout on the arterial's LAST point. But the skeleton walks an
     arterial outward from the core until it leaves the island or hits a reserved rectangle — so
     the last point is the coastline, and the ring road is inset 0.085 from that. Every junction
     roundabout was landing on the beach, about six units beyond the road it was meant to be
     joining.

     The junction is the point on the arterial CLOSEST TO THE RING. Found by search rather than
     assumed, and the arterial is then painted only as far as that point, so it stops at the
     roundabout instead of running through it and out over the sand. The skeleton itself is
     untouched: buildings still keep clear of the full length, which is what onRoad already
     tests and what stops a plot appearing in the gap. */
  function ringJunction(a){
    let best = Infinity, bi = a.length - 1;
    for (let i = Math.floor(a.length * 0.4); i < a.length; i++){
      let d = Infinity;
      for (let r = 0; r < plan.ring.length; r++) d = Math.min(d, distToPolyline(a[i][0], a[i][1], plan.ring[r]));
      if (d < best){ best = d; bi = i; }
    }
    return bi;
  }

  // ---- draw, coarsest first so markings always land on top of tarmac ----
  roadService();
  const junc = plan.arterials.map(ringJunction);
  plan.arterials.forEach((a, i) => roadSecondary(a.slice(0, junc[i] + 1)));
  plan.ring.forEach(seg => roadPrimary(seg));

  const core = plan.core;
  const cr = U * 0.040;
  const coreApp = plan.arterials.map(a => {
    const p = a[Math.min(3, a.length - 1)];
    return Math.atan2(p[1] - core[1], p[0] - core[0]);
  });
  plan.arterials.forEach((a, i) => {
    const bi = junc[i];
    if (bi < 4) return;
    const e = a[bi], b = a[bi - 3];
    roundabout(e[0], e[1], cr * 0.72, [Math.atan2(b[1] - e[1], b[0] - e[0])]);
  });
  roundabout(core[0], core[1], cr, coreApp);

  g.restore();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;                 // the ground is viewed at a grazing angle by design
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true;
  // No repeat, no offset. islandGeometry bakes 0..1 into the uv attribute instead.
  t.needsUpdate = true;
  return t;
}


/* Land tints. The map carries hue and pattern; these carry LEVEL, one per view mode. The night
   value is set so map-mean times tint lands where the old flat 0x424E58 land did — that number
   was hard won against a dim hemisphere sky and there was no reason to relitigate it. */
/* THE BEACH IS THE ONLY THING THAT SHOWS THE ISLAND IS RAISED, so it must never match the top.

   Every island stands 2.9 units above the water and the bevelled side is the only surface that
   says so. In Day the side was 0xE0D4B8 against a ground of 0xD8D2C4 — three per cent apart in
   luminance — so the step vanished and the island read as a sandbank flush with the sea, while
   dusk and night showed it as a proper shelf. Same geometry, different contrast. All three modes
   now put the side clearly below the top, which is also physically right: a sloping shelf faces
   away from the sky and catches less of it than flat ground does.

   Worth recording while it is in view: 2.9 units at 7.8 m per unit is 22.6 m of freeboard, and
   Abu Dhabi's islands sit two to four metres above the sea. The cliff is a deliberate diorama
   convention rather than an oversight, but it is a convention, and dropping ISLE_DEPTH would
   carry the whole city with it since GROUND is derived from it. */
const matBeach    = new THREE.MeshStandardMaterial({ color:0x3E3B32, roughness:1, metalness:0 });
matBeach.userData.duskColor = 0x9C8C6F;           // the platform's wet lower edge, unchanged in effect

/* THE BEACH SKIRT'S THREE MODES. Same three colours the platform's bevel already uses, so the
   skirt and the bevel above it cannot disagree, plus vertexColors so the wet-sand banding rides
   on top of whichever mode is live. The colours here are the base and the vertex colour is a
   MULTIPLIER, exactly as instanceColor is on the fabric. */
/* SAND IS ITS OWN COLOUR NOW, not a multiplier off the bevel's.

   v24 based these on matBeach, which is the dark brown of the platform's UNDERWATER edge, and
   then tried to claw a pale beach back out of it with vertex colours up at 1.55. Multipliers
   that large are a sign the base is wrong: they blow out the lit faces while the shaded ones
   stay brown, so the skirt read as more pedestal on one side and nothing on the other. A beach
   is a pale surface. Start from a pale surface and let the vertex colours do what they are for,
   which is banding within it. */
/* ===========================================================================
   SHORELINE MODULES.

   The only geometry exemption in the build, and deliberately a small one. Everything else on the
   coast is painted, and long continuous stretches stay painted — these exist only where a real
   waterfront changes the SILHOUETTE, which paint cannot do, or creates a condition the eye
   recognises instantly.

   Five modules, low segment counts, each instanced once per district that uses it. A district
   asks for the types it needs and gets one InstancedMesh per type, so the count scales with the
   number of CONDITIONS rather than with the number of placements.

   Placement is by outline fraction and a signed offset, the same coordinates the beach skirt
   uses, so a quay and the sand it replaces cannot disagree about where the water is. */
const shoreGeo = (() => {
  const box = (w, h, d, y) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y + h/2, 0); return g; };

  /* STEPS. The formal Corniche condition: three tiers falling from the promenade to the sand.
     Built as one geometry rather than three instances so a run reads as a continuous flight. */
  const step = mergeShore([box(1, 0.50, 0.9, 0), box(1, 0.34, 0.62, 0.50), box(1, 0.30, 0.38, 0.84)]);

  /* QUAY. A vertical face with a coping lip. The lip is the whole point — a plain wall reads as
     a cut, and the 0.12 overhang is what casts the line of shadow that says harbour. */
  const quay = mergeShore([box(1, 2.6, 1.0, -1.8), box(1.02, 0.26, 1.24, 0.80)]);

  /* FINGER. A marina pontoon: thin, low, and long enough to berth against. */
  const finger = box(1, 0.22, 1.0, 0.10);

  /* MOUND. A breakwater, six-sided and tapered so it reads as tipped rock rather than as a wall.
     The one module that exists purely to break the outline. */
  const mound = (() => {
    const pos = [], idx = [];
    const ring = [[0.5,0],[0.30,0.42],[-0.30,0.42],[-0.5,0],[-0.30,-0.42],[0.30,-0.42]];
    ring.forEach(p => pos.push(p[0], 0, p[1]));
    ring.forEach(p => pos.push(p[0]*0.44, 1, p[1]*0.44));
    for (let i = 0; i < 6; i++){
      const j = (i+1)%6;
      idx.push(i, j+6, i+6, i, j, j+6);
    }
    for (let i = 1; i < 5; i++) idx.push(6, i+6, i+7);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();

  const deck = box(1, 0.28, 1.0, 1.05);          // jetty: a plate standing clear of the water
  return { step, quay, finger, mound, deck };
})();

/* Tiny local merge so the modules can be authored as a few boxes without pulling in
   BufferGeometryUtils, which this file has never imported. */
function mergeShore(list){
  let vc = 0; const pos = [], nor = [], idx = [];
  list.forEach(g => {
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    for (let i = 0; i < p.length; i++){ pos.push(p[i]); nor.push(n[i]); }
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + vc);
    vc += p.length / 3;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/* Three surfaces, matching the three conditions the brief asks to be visibly different. Same
   night/day/dusk shape as the beach, since they sit on the same edge and go through the same
   view switcher. */
const shoreMat = {
  stone: { night: new THREE.MeshStandardMaterial({ color:0x33322C, roughness:0.94 }),
           day:   new THREE.MeshStandardMaterial({ color:0xBFB6A2, roughness:0.94 }),
           dusk:  new THREE.MeshStandardMaterial({ color:0xAFA48D, roughness:0.94 }) },
  rock:  { night: new THREE.MeshStandardMaterial({ color:0x2A2823, roughness:1.0 }),
           day:   new THREE.MeshStandardMaterial({ color:0x9A9384, roughness:1.0 }),
           dusk:  new THREE.MeshStandardMaterial({ color:0x8C8371, roughness:1.0 }) },
  deck:  { night: new THREE.MeshStandardMaterial({ color:0x3A3830, roughness:0.8 }),
           day:   new THREE.MeshStandardMaterial({ color:0xD6CDB6, roughness:0.8 }),
           dusk:  new THREE.MeshStandardMaterial({ color:0xC6BBA1, roughness:0.8 }) },
};

const beachSand = {
  night: new THREE.MeshStandardMaterial({ color:0x5A5548, roughness:1, metalness:0, vertexColors:true }),
  day:   new THREE.MeshStandardMaterial({ color:0xC9B896, roughness:1, metalness:0, vertexColors:true }),
  dusk:  new THREE.MeshStandardMaterial({ color:0xB8A582, roughness:1, metalness:0, vertexColors:true }),
};
const matLandFlat = new THREE.MeshStandardMaterial({ color:0x424E58, roughness:1, metalness:0 });

/* FOUR SURFACES, AND NOW THEY CAN ACTUALLY BE FOUR COLOURS.

   v22 gave the fabric three stone finishes that differed only in roughness, and the comment
   above them explained why: applyLift set every non-glass material in the scene to one hex, so
   colour was the one channel that could not survive into dusk. That was true and it was the
   reason the render reads beige — not that the palette was thin, but that dusk collapsed it.

   nav v23 changes the rule. A material carrying userData.duskColor keeps its own hue through the
   lift; anything without one still gets DUSK_STONE exactly as before. So the finishes get real
   materials now:

     LIMESTONE   warm, matte, the low-rise. Abu Dhabi's older stock is a sandy cream that goes
                 distinctly orange under a low sun, which is the warmest thing in the palette.
     CONCRETE    precast, neutral and slightly cool. The default, and the largest share.
     ALUMINIUM   brushed cladding on the towers. Low roughness, real metalness, and a hue that is
                 almost grey — a metal reads as metal through its SPECULAR response, not its
                 diffuse colour, which is why the previous "polished" bucket at metalness 0.08
                 read as shiny stone rather than as panel.

   Night colours stay near-black and close together, because at night these surfaces are lit by
   window spill and should not have opinions. The glass classifier decides on the NIGHT hex, so
   every one of these keeps b <= 1.75r and stays out of the glass path. */
const matPlaceStone = new THREE.MeshStandardMaterial({ color:0x161C22, roughness:0.9 });
matPlaceStone.userData.duskColor = 0xD3C4A6;      // precast concrete, neutral

const matStoneRend  = new THREE.MeshStandardMaterial({ color:0x1A1A20, roughness:0.99, metalness:0.0 });
matStoneRend.userData.duskColor  = 0xE0C79A;      // warm limestone

const matStoneClad  = new THREE.MeshStandardMaterial({ color:0x171B21, roughness:0.26, metalness:0.62 });
matStoneClad.userData.duskColor  = 0xB9BCC0;      // brushed aluminium

/* A SECOND GLAZING, AND A ROOF THAT IS NOT A WALL.

   Two additions, both aimed at the same thing: the render now lights well enough that every
   building sharing one surface is the loudest fault in it.

   BRONZE GLASS. Gulf curtain wall is not all one tint — the blue-green solar glass on Etihad's
   generation sits beside a lot of bronze and grey from the decade before it, and the difference
   is not only colour: bronze coatings are less specular, so they hold a duller, warmer sky. That
   needs per-material roughness and metalness at dusk, which the lift did not allow until nav v31
   because there was only ever one glass. Two now, split 62/38.

   ROOF DECK. The plant rooms were built from matPlaceStone, so every roof was the same concrete
   as the wall below it and read as an extrusion of the same block. Real roofs are the darkest
   surface on a building — bitumen, gravel, ballast — and giving them their own material puts a
   dark cap on two buildings in five, which is most of what stops a skyline reading as one
   material seen from above.

   Both keep blue-over-red on the NIGHT hex on the correct side of 1.75, since that is still what
   the lift classifies on. */
const matGlassBronze = new THREE.MeshStandardMaterial({ color:0x101A22, roughness:0.35, metalness:0.44 });
Object.assign(matGlassBronze.userData, { duskColor:0xC9B79C, duskRough:0.35, duskMetal:0.44, duskEnv:1.15 });

const matRoofDeck = new THREE.MeshStandardMaterial({ color:0x101216, roughness:0.97, metalness:0.02 });
matRoofDeck.userData.duskColor = 0x8E8878;        // ballast and plant, the darkest thing up there
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

   POSITIONS RESPACED. Corniche and Al Reem were sharing land — literally, the two outlines
   intersected — and Corniche and Al Maryah had ten units of open water between them, which at
   world scale is nothing and read as one lumpy blob rather than as three islands. Judging that
   by radius is misleading, because these outlines do not fill their radius: the honest test is
   polygon to polygon, and by that test the minimum channel between any two islands is now 13.7
   units, with Corniche to Al Maryah opened up to more than twenty-six. The total land extent
   barely moved (262 units wide before, 254 after), so the portrait framing is unaffected.
   =========================================================================== */
const DISTRICTS = [
  { id:'corniche', name:'Corniche',   x:-40, z:  66, r:76, rot: 0.10, tint:C.gold,
    built:true,
    /* Re-placed onto the island. Emirates Palace west, Etihad centre, ADNOC at the eastern end,
       all in a band just inland of the north coast, with the supporting city behind them to the
       south. h is the height the camera aims at — a 44-unit tower and a 7-unit palace want very
       different look-at points. */
    /* r IS A RADIUS AND I HAD BEEN WRITING DIAMETERS. dist = r / tan(hFov/2), so r 46 for a
       building 46 units WIDE frames a 92-unit box and leaves the palace filling half the frame
       from 289 units away — which is why the place view still looked like a district view. At
       r 32 the palace is 72 per cent of the frame width from 201 units, ADNOC at r 22 is 46 per
       cent of the frame HEIGHT from 138. That is the reference's framing, and it is the only
       state close enough for the props to be the subject. */
    places:[
      { label:'Emirates Palace', x:-42, z:  0, h: 7,  r: 32 },
      { label:'Etihad Towers',   x: -4, z:-16, h:18,  r: 28 },
      { label:'ADNOC HQ',        x: 48, z: -6, h:26,  r: 22 },
    ],
    /* THE HEIGHT CORE, AND IT WAS ON THE WRONG SHORE.

       jy is north-positive, so [-0.05, -0.34] put the falloff centre against the SOUTH coast —
       the creek side. Every landmark is north of it: Etihad at +0.21, ADNOC at +0.08, the palace
       at 0. Running the falloff, southern blocks came out at fall 0.98 and capped at 12 almost
       everywhere while the north shore sat at 0.30 and topped out around 8.7. The tallest
       generated towers stood on the creek and the promenade got the short ones, which is backwards
       from the place: the Corniche skyline faces north over the water.

       It was not wrong when it was written. The fabric was a southern strip then, so the core sat
       in the middle of the only ground the fabric had and the asymmetry had nothing to act on.
       v19 gave the fabric the whole island and turned a harmless number into a visible one.

       [0.10, 0.02] puts it between Etihad and ADNOC, where downtown actually is. Known and
       intended side effect: the west tip falls to 0, so the Bateen end goes near-flat low-rise.
       Khalidiya genuinely is lower than the central Corniche, and it gives the palace a quiet
       western horizon to sit against instead of competing towers. */
    coreN:[0.10, 0.02],
    /* The reservations, declared here rather than only at the urbanFabric call site because the
       road skeleton needs them too — arterials break on entry, so none drives through Emirates
       Palace or the Etihad plaza. One rectangle per piece of hand-built content, sized to what
       that content actually covers. */
    /* THREE RECTANGLES, ONE PER HAND-BUILT LANDMARK, and no more than that.

       v18 had five. The two extra ones were strips — a 74 x 10 seaward band and an 84 x 22 tower
       row — and they protected PAINTED GROUND rather than any built geometry. Nothing stands on
       either. They were the old exclusion band's job carried forward into rectangle form without
       being re-examined, and between them they covered a third of the island. Five rects reserved
       69 per cent of Corniche, which is MORE than the band they were brought in to replace. */
    avoid:[
      /* 36 WIDE, DOWN FROM 62, AND THE SAME MISTAKE AS THE v18 STRIPS AT SMALLER SCALE.

         The palace is built from x -57 to -27: thirty units. The reservation ran -74 to -12,
         which is sixty-two, and the difference was not clearance — it was two bands of buildable
         ground held empty for nothing. West of the palace, 175 square units, about fourteen
         blocks. Between the palace and Etihad, 821 square units and sixty-seven blocks. A
         hundred blocks reserved to protect a building that touches none of them, on an island
         carrying 254.

         That is why the west third still reads bare in Plan and why the dusk render shows sand
         between the palace and the water. The falloff already does the protecting out there: at
         the west tip fall is 0, so anything the fabric puts down is 3.0 units against the
         palace's 6.5 and cannot compete with it. The rectangle was doing a second job that was
         already being done. */
      { x:-42, z:  0, w:36, d:24 },   // Emirates Palace and its forecourt
      { x: -4, z:-16, w:48, d:20 },   // Etihad Towers and the plaza
      { x: 48, z: -6, w:20, d:20 },   // ADNOC HQ and its apron
    ],
    // Re-derived against the new outline. Index 0 is the west tip and the samples run east
    // along the north shore, so this is the Corniche itself, end to end.
    coastPark:[0.05, 0.40, 0.055],
    /* CONDITION ONE: THE FORMAL PROMENADE. A flight of steps down the north shore, a pier out
       into the gulf, and rock breakwaters off the west tip — which is what the west tip of Abu
       Dhabi island is actually called. Thirty-two step segments, one draw call. */
    shore:[
      /* REPS ARE SET FROM THE RUN LENGTH, NOT CHOSEN. Corniche's perimeter is 376 units, so t
         0.07 to 0.38 is 117 units of coast; at 9.4 units a segment that is twelve. v40 asked for
         thirty-two and laid 301 units of step into a 117-unit run — a 2.6x overlap, which is why
         it read as a solid wall rather than a flight. Every run below is now span / len. */
      { kind:'step',  t:0.07, t1:0.38, reps:12, off: 3.4, y:1.55, len:9.4, wide:1.0 },
      { kind:'deck',  t:0.235,          off:16.0, y:0.0,  len:26.0, wide:5.0, turn:true },
      { kind:'mound', t:0.985,          off:24.0, y:-0.4, len:34.0, h:2.1, wide:9.0 },
      { kind:'mound', t:0.015,          off:31.0, y:-0.4, len:22.0, h:1.7, wide:7.0 },
    ],
    ground:[
      // Palace GROUNDS, not a forecourt. Emirates Palace stands in a large landscaped estate
      // and reads as a landmark because of the space around it, not its height — at 6.6 units
      // it is half the height of the fabric capping it, so clearance is the only tool left.
      /* 56 x 26, DOWN FROM 80 x 30. The estate was wider than the palace needed and wider than
         the island could spare — at 80 units it reached from x -86, which is off the west coast,
         to x -6, which is under Etihad's plaza. Clearance is still the tool that makes a 6.6-unit
         building a landmark; it just does not need to be the only thing on that third of the
         island. */
      // Estate and forecourt follow the reservation in. A lawn wider than the ground the palace
      // is allowed to own is just a pale rectangle with a hard edge, which is how Plan read it.
      { kind:'lawn',   x:-42, z:  1, w:38, d:24 },
      { kind:'paving', x:-42, z:  1, w:34, d:13 },
      { kind:'paving', x: -4, z:-15, w:40, d:13 },   // Etihad plaza
      { kind:'paving', x: 48, z: -6, w:17, d:13 },   // ADNOC apron
      // The low-rise band on the seaward side had no ground under it at all — twenty buildings
      // standing on open desert between the corniche road and the towers.
      // The mixed-tower row behind the landmarks. Sloped to match cityRow's zSlope, and
      // deliberately longer than the island — patches are painted inside the coastline clip,
      // so overshoot is trimmed for free and no patch has to be fitted to the coast by hand.
      /* The seaward band and the tower row are GONE, not trimmed. Both were painted to put
         something on ground the fabric was forbidden to touch; the fabric reaches it now, and an
         apron under a real city block is only a paler street. */
    ] },
  // A short quay on the south face: Al Maryah is reclaimed business waterfront with a hard edge.
  { id:'maryah',   name:'Al Maryah',  x:  2, z: -22, r:34, rot: 0.30, tint:0x8FD3E8,
    shore:[{ kind:'quay', t:0.60, t1:0.76, reps:5, off:2.0, y:2.40, len:6.2, wide:1.0 }],
    built:false, coreN:[0.0, 0.0], places:[
      { label:'The Galleria', x:-10, z:  6, h:10, r:30 },
      { label:'Rosewood',     x: 12, z:-10, h:12, r:30 },
      { label:'Waterfront',   x:  2, z: 18, h: 5, r:30 },
    ] },
  /* MOVED EAST BY EIGHT. The beach width was never a design choice — it was set by the tightest
     channel in the world, Corniche to Al Reem at 22.8 units. Two beaches have to fit in that with
     water left between them, so the skirt could not exceed about 11 and 8 was the safe number.
     Buying the width meant buying the channel first. Nothing depends on Reem's exact position:
     the camera heading is derived from it, and every rule on the island is relative to its own
     centre. */
  { id:'reem',     name:'Al Reem',    x: 88, z:  34, r:44, rot:-0.20, tint:0xBFD3E0,
    built:false, coreN:[-0.25, 0.05], places:[
      { label:'Reem Central', x:  0, z:  0, h:12, r:36 },
      { label:'Shams Boutik', x: 22, z: 10, h:10, r:34 },
      { label:'Gate Towers',  x:-22, z: -8, h:16, r:36 },
    ] },
  /* AND SAADIYAT OUT BY EIGHT, for the same reason. Widening the skirt shifts which pair is
     tightest: Reem moving east fixed Corniche to Reem, and Al Maryah to Saadiyat then became the
     binding constraint at 3.0 units of water between two beaches. This puts every channel in the
     world at 4.8 or better. */
  /* CONDITION THREE: THE SOFT EDGE. Saadiyat's north-west run is the one genuinely straight coast
     in the world and it is a beach, so it gets almost nothing — six low groynes at right angles
     to the sand, which is what actually punctuates a beach of that length. The rest stays
     painter-only, as the brief asks. */
  { id:'saadiyat', name:'Saadiyat',   x:-44, z:-116, r:56, rot: 0.15, tint:0xDDD3C0,
    shore:[
      /* Saadiyat's straight run is the NORTH-WEST coast, t 0.02 to 0.28 by the same measurement.
         Groynes are shorter and lower than v41's: fourteen units out was a pier, not a groyne. */
      { kind:'mound', t:0.05, t1:0.26, reps:7, off: 6.0, y:-0.5, len:9.0, h:0.8, wide:2.2, turn:true },
    ],
    built:false, coreN:[0.15, 0.10], coastPark:[0.02, 0.28, 0.070], places:[
      { label:'Louvre Abu Dhabi', x: 18, z: 14, h: 6, r:40 },
      { label:'Saadiyat Beach',   x:-24, z: 22, h: 3, r:44 },
      { label:'Manarat',          x:  4, z:-18, h: 6, r:38 },
    ] },
  /* CONDITION TWO: THE MARINA. A quay wall down one wall of the inlet with pontoon fingers off
     it, and a mound across the mouth. The inlet is the only place on any island where the coast
     is already concave, so it is the only place a marina reads as a marina rather than as
     furniture parked on an open shore. */
  { id:'yas',      name:'Yas Island', x: 78, z:-196, r:62, rot:-0.10, tint:C.gold,
    shore:[
      /* THE INLET IS AT t 0.65 TO 0.81, NOT 0.55 TO 0.62. I guessed the fractions from the shape
         array, but the outline is resampled at equal ARC LENGTH, so an index in that array is not
         a fraction of the perimeter — the inlet is eight of twenty-four points and about a sixth
         of the coast, and it sits a good deal further round than counting points suggests. The
         marina was therefore built on the open southern shore: a comb of pontoons sticking into
         the Gulf with no harbour behind them.

         Found by search now rather than by eye. The inlet is exactly the stretch where the beach
         skirt's own reach test has to clamp, because that is the definition of a concave coast —
         so the same measurement that stops the sand folding tells you where the marina goes. */
      { kind:'quay',   t:0.665, t1:0.790, reps: 6, off: 2.2, y:2.40, len:8.0, wide:1.0 },
      { kind:'finger', t:0.680, t1:0.775, reps: 5, off: 8.0, y:0.28, len:10.0, wide:2.4, turn:true },
      { kind:'mound',  t:0.630,            off:10.0, y:-0.4, len:22.0, h:1.8, wide:7.0 },
    ],
    built:false, coreN:[0.20, -0.10], places:[
      /* BOTH MOVED, because the marina inlet is now real water. Yas Marina was at x -28,
         which the new outline puts in the middle of the channel, and Ferrari World at x 34 sat
         exactly on the north waterline. Anchors are checked against the sampled coastline, the
         same rule every other position in this table follows. */
      { label:'Yas Marina',    x:-10, z: 18, h: 5, r:42 },
      { label:'Yas Mall',      x: 10, z: -6, h: 8, r:40 },
      { label:'Ferrari World', x: 30, z:-12, h: 9, r:40 },
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

  /* THE BEACH, WHICH EXISTS TO STOP THE ISLAND LOOKING LIKE A CAKE STAND.

     The platform is an extrusion: ISLE_DEPTH 2.4 plus a 0.5 bevel, so every island is a 2.9-unit
     vertical wall standing in the sea. At 7.8 metres to the unit that is a twenty-three metre
     cliff running the entire coastline, and it is the single strongest cue that these are
     objects sitting on a pedestal rather than land meeting water.

     A skirt fixes it without touching the platform. Rings of the coastline pushed progressively
     OUTWARD and DOWN, from the top edge to well under the wave troughs, so what you see from a
     low camera is sand sloping into water and the wall is behind it. Nothing else needs to know:
     every placement rule in this file measures against the outline, and the beach lives entirely
     outside it.

     WIDTH IS SET BY THE TIGHTEST CHANNEL, NOT BY TASTE. Corniche and Al Reem pass within 22.8
     units of each other. Two 8-unit beaches leave 6.8 units of open water between them, which
     still reads as a strait; anything past 11 and they would merge into a sandbar joining two
     islands that are meant to be separate.

     THE PROFILE IS FIVE RINGS, and the two near y = 0 are the ones doing the work. A pale band
     just above the waterline and a dark one just below it is what the eye reads as wet sand, and
     it costs a vertex colour rather than a texture. The lowest ring sits at -1.2, below the
     -0.97 wave trough, so the sand always terminates under water rather than in mid-air. */
  {
    /* THE FIRST PROFILE WAS INVISIBLE, FOR TWO REASONS WORTH RECORDING.

       It started at GROUND, 2.9 — but ExtrudeGeometry insets the top cap by bevelSize, so the
       island's widest point is the outline at ISLE_DEPTH, 2.4. The skirt therefore began half a
       unit ABOVE the edge it was supposed to continue, floating clear of the land.

       And it was the wrong colour. The base is matBeach, the same dark brown as the platform's
       bevel, so a slope shaded 0.98 to 1.05 came out as more brown pedestal. A beach reads as a
       beach because it is PALER than the land behind it and the water in front of it. The dry
       sand is 1.55 now, not 1.0 — half again as bright as the bevel it grows out of.

       THE WET BAND WAS 0.9 UNITS WIDE, which is sub-pixel at district range. It is 1.4 now, and
       the promenade is the other half of the answer: a near-flat pale strip at the top of the
       skirt with a kerb dropping off it, which is what the Corniche actually has and what makes
       the eye read land, then edge, then sand, then sea. */
    /* TWELVE UNITS, AND A FOAM LINE.

       At 8 the skirt was 5 per cent of a 152-unit island: structurally right, since the cliff and
       the black rim are both gone, but too narrow to say beach. The dry sand now runs 3.2 units
       at about 1:3.6, which reads as walkable rather than as an edge treatment.

       THE FOAM LINE IS THE CUE THAT WAS MISSING. Sand grading pale to dark is a gradient, and the
       eye takes gradients for shading. A BRIGHT band with a dark one immediately under it is a
       waterline, and nothing else looks like that. It sits at y 0.06, just above the mean
       surface, one unit wide, and it is the brightest thing in the profile. */
    /* THE HEIGHT COMES OFF AT THE BACK, NOT AT THE WATER, and the first three profiles all had
       this backwards.

       Every one of them held its height across most of the width and then dumped the last unit
       or so into the sea. Four units back from the waterline v27 still stood 1.06 units up, so
       the final approach averaged 1:3.8 — and a shelf with a 1:4 face at the end of it is a
       CLIFF WITH A TERRACE ON TOP, which is what the red mark is pointing at. Widening from 8 to
       12 made the terrace bigger without touching the face.

       A real beach loses its height immediately behind the berm and then runs almost flat to the
       water. So the steep part moves up under the promenade, where a sea wall belongs and where
       it reads as one, and the last four units come in at 1:8.6. Same total width, same total
       drop, the fall redistributed: 1.55 units of it now happens in the first 1.9 units of run
       rather than being spread down to the shore. */
    const BW = BEACH_W / d.r;
    const P = [                                            // offset in world units, height, shade
      /* THE INNER RING WAS IN MID-AIR, AND THAT IS THE WHOLE REASON NONE OF THIS HAS BEEN
         VISIBLE FOR FOUR DROPS.

         The platform is an ExtrudeGeometry with bevelSize 1.6, and a bevel does not leave the
         outline where the shape put it: the caps and the body sit at DIFFERENT radii, 1.6 units
         apart. v23 attached the skirt at GROUND, v25 "corrected" it to ISLE_DEPTH, and both were
         guesses about which of the two the bevel widens. Whichever it is, an inner ring placed
         exactly on the outline at either height is 1.6 units off the edge it is supposed to
         continue — buried inside the platform, or hanging under an overhanging rim where a
         camera looking down at 25 degrees cannot see it. That is what the render has been
         showing all along: the rounded lip at the island edge is the platform's OWN bevel, and
         the beach has been tucked behind it.

         So stop guessing. The first ring goes 1.8 units INSIDE the outline at GROUND, which is on
         the top face under any reading of the bevel, and the second goes 1.8 units OUTSIDE it,
         which clears the widest the body can possibly be. The skirt now overlaps the platform
         instead of trying to meet it, and an overlap cannot leave a gap.

         Offsets are absolute world units from the outline now, signed, rather than a fraction of
         a width — because the two rings that matter are defined by bevelSize, which is a fixed
         distance and not a proportion of anything. */
      [-1.8, GROUND, 1.00],   // on the top face, inside the outline: overlap, do not abut
      [ 1.8, 2.55,   1.06],   // clear of the bevel at its widest; promenade starts here
      [ 2.2, 1.55,   0.74],   // sea wall
      [ 3.6, 0.75,   1.10],
      [ 5.6, 0.35,   1.28],   // berm
      [ 7.8, 0.16,   1.55],   // FOAM, upper edge
      [ 8.6, 0.10,   1.55],   // FOAM, lower edge
      [ 9.4, 0.00,   0.78],   // wet
      [10.8, -0.35,  0.58],
      [12.0, -0.95,  0.38],
    ];
    const o = isleOutline(d.id);
    const n = o.length - 1;
    /* Reach is solved ONCE per sample and every ring then scales the same clamped distance, so
       the five rings can never cross each other however tight the coast gets — they all lie
       along one direction from one origin. */
    const reach = [];
    for (let i = 0; i < n; i++) reach.push(beachReach(d.id, o, i, BW));
    const pos = [], col = [], idx = [];
    P.forEach(([off, y, sh]) => {
      for (let i = 0; i < n; i++){
        // reach[i] is the largest OUTWARD distance this sample can take before folding, so the
        // pinch at an inlet stays proportional. Inward offsets need no clamp: the island is
        // always wider than 1.8 units.
        const f = reach[i] / BW;
        const [px, py] = off < 0 ? inwardAt(d.id, o, i, -off / d.r)
                                 : outwardAt(d.id, o, i, (off / d.r) * f);
        pos.push(px * d.r, y, -py * d.r);
        col.push(sh, sh, sh);
      }
    });
    /* THE STRIP WAS FACING THE SEABED. This is why nothing has been visible for five drops, and
       every explanation before it was wrong because they were all explanations of an appearance.

       Reconstructing the geometry outside three and taking the cross product of each triangle:
       3,181 of 3,240 faces pointed DOWN. MeshStandardMaterial is side: FrontSide by default, so
       every one of them was back-face culled from any camera above the water. The beach has been
       built correctly, positioned correctly, coloured correctly and shaded correctly since v23,
       and drawing nothing at all.

       The cause is the outline's handedness. ISLE_SHAPES runs clockwise in shape space, and the
       mapping to world negates Y into Z — a reflection, which flips the sense of every winding
       that goes through it. So a triangle order that is correct on paper comes out inverted in
       the scene, and no amount of reasoning about which way the ring "goes" would have settled
       it. Only the cross product settles it.

       The winding is flipped here rather than by setting side: DoubleSide. Double-siding hides
       a wrong normal instead of fixing it, and this surface is lit — it needs to face the sun
       to be shaded as sand rather than as the underside of a shelf. */
    for (let r = 0; r < P.length - 1; r++){
      for (let i = 0; i < n; i++){
        const j = (i + 1) % n, a = r * n, b = (r + 1) * n;
        idx.push(a + i, b + j, b + i, a + i, a + j, b + j);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    bg.setIndex(idx);
    bg.computeVertexNormals();
    const beach = new THREE.Mesh(bg, beachSand.night);
    /* dayMats and duskMats are not optional. A mesh carrying neither is handed the switcher's
       generic pale dayMat in Day, and setting duskMats is also what keeps this out of the lift
       registry — which would otherwise repaint the sand with DUSK_STONE along with the city.
       userData.ground is deliberately NOT set: Plan is a drawing of the ground plan, and the
       beach is outside every line on it. */
    beach.userData.dayMats  = beachSand.day;
    beach.userData.duskMats = beachSand.dusk;
    /* NO SHADOWS ON THE BEACH, for the reason already written above the sea.

       The dusk sun sits thirteen degrees up, so an island shadows its own seaward skirt for the
       whole width of it on the away side — physically correct and, in the render, a black rim
       around the island reading as exactly the pedestal edge the beach was built to remove. The
       water opted out of shadow receipt for the same reason and the same sun. A narrow strip of
       nearly flat pale sand has nothing to gain from shadowing and everything to lose.

       Casting is off too: a skirt this shallow throws nothing anyone would see, and every
       triangle offered to the shadow pass is paid for at both light sources. This must be set
       AFTER the one-sweep traverse further down, which turns both flags on for everything —
       hence the flag on the object rather than a call here. */
    beach.userData.noShadow = true;
    g.add(beach);
  }

  /* ---- shoreline modules -------------------------------------------------------------------
     One InstancedMesh per module TYPE this district asks for, so the mesh count tracks the number
     of conditions rather than the number of placements. A run of forty quay segments is still one
     draw call.

     Everything is positioned from an outline fraction and a signed offset in world units, with
     the module rotated to the local tangent. Same coordinates as the beach, so a quay and the
     sand it stands in cannot disagree about where the water is. */
  if (d.shore && d.shore.length){
    const o = isleOutline(d.id), n = o.length - 1;
    const M2 = new THREE.Object3D();
    const groups = {};
    const need = {};
    d.shore.forEach(sp => { need[sp.kind] = (need[sp.kind] || 0) + (sp.reps || 1); });
    const MAT = { step:'stone', quay:'stone', finger:'deck', mound:'rock', deck:'deck' };
    for (const k in need){
      const m = new THREE.InstancedMesh(shoreGeo[k], shoreMat[MAT[k]].night, need[k]);
      m.userData.dayMats  = shoreMat[MAT[k]].day;
      m.userData.duskMats = shoreMat[MAT[k]].dusk;
      m.count = 0;
      groups[k] = m;
      g.add(m);
    }
    d.shore.forEach(sp => {
      const reps = sp.reps || 1;
      for (let r = 0; r < reps; r++){
        const f  = reps === 1 ? sp.t : sp.t + (sp.t1 - sp.t) * (r / (reps - 1 || 1));
        const i  = Math.round(((f % 1) + 1) % 1 * n) % n;
        const [px, py] = sp.off < 0 ? inwardAt(d.id, o, i, -sp.off / d.r)
                                    : outwardAt(d.id, o, i,  sp.off / d.r);
        // Tangent from the outline neighbours, so a module always lies along the coast.
        const a = o[(i - 1 + n) % n], b = o[(i + 1) % n];
        const ang = Math.atan2(-(b.y - a.y), b.x - a.x);
        const im = groups[sp.kind];
        M2.position.set(px * d.r, sp.y, -py * d.r);
        /* len IS ALWAYS THE MODULE'S LONG AXIS AND wide IS ALWAYS ACROSS IT, whichever way the
           module is turned. Without this the two meanings swap the moment turn is set, and every
           perpendicular piece in v40 was laid out the wrong way round: the Saadiyat groynes came
           out as one 17-unit bar lying ALONG the beach instead of six 3-unit fingers crossing it,
           and the Yas pontoons and the Corniche pier did the same. A run of shore-parallel
           modules and a run of shore-perpendicular ones should be described in the same terms. */
        M2.rotation.set(0, sp.turn ? ang + Math.PI/2 : ang, 0);
        M2.scale.set(sp.len, sp.h || 1, sp.wide);
        M2.updateMatrix();
        im.setMatrixAt(im.count++, M2.matrix);
      }
    });
    for (const k in groups){
      groups[k].instanceMatrix.needsUpdate = true;
      groups[k].castShadow = groups[k].receiveShadow = true;
    }
  }

  /* Generous invisible hit disc, sitting just clear of the ground. A fingertip is about 9mm;
     targets matched to the visual edge feel broken on a phone.

     FLAGGED helper, AND THIS WAS THE BUG THAT COST FIVE ROUNDS.

     It is a horizontal circle of radius 1.2r, parked 0.4 units above the ground, kept off screen
     only by material.visible = false. But the view switcher walks every mesh in the world and
     assigns it a mode material — so in Day the disc was handed dayMat, a perfectly visible flat
     stone, and rendered as a solid lid over the entire island. Everything followed from that: no
     roads, no parkland, no palace grounds, and an island that appeared to sit flush with the sea
     because the disc is WIDER than the coastline and hid the beach shelf too.

     Every diagnosis along the way was of the wrong surface. The ground texture was correct from
     the first commit — Plan mode, which hides anything without a ground flag, shows the full road
     network — and four passes of palette, exposure and apron work were spent on a plan that was
     being covered up. The flag is what stops a helper from ever being painted again. */
  const pick = new THREE.Mesh(new THREE.CircleGeometry(d.r * 1.2, 20),
    new THREE.MeshBasicMaterial({ visible:false }));
  pick.rotation.x = -Math.PI/2;
  pick.position.y = GROUND + 0.4;
  pick.userData.district = d;
  pick.userData.helper = true;
  pick.castShadow = false;
  pick.receiveShadow = false;
  g.add(pick);
  pickTargets.push(pick);

  // Before any fabric exists, so the generator can be told where the roads are.
  d.roads = roadSkeleton(d);

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
/* THE FABRIC IS NO LONGER A BOX, and this is the prerequisite for spending anything on
   materials.

   Every one of the ~1,400 generated buildings was BoxGeometry(1,1,1): twelve triangles, four
   square corners, parallel walls. A better material on that gives you a shinier box. Roughness
   needs an EDGE to read on — the reason Etihad's five towers are the most convincing thing in
   the scene is that they taper and catch a highlight down one face, not that their material is
   special.

   TWO FEATURES, AND BOTH ARE CHOSEN TO SURVIVE NON-UNIFORM INSTANCE SCALE. Each instance scales
   this by (w, h, dp) independently, so anything measured in Y is stretched by the building's
   height: a plinth or a parapet at a fixed fraction would give ADNOC at 44 units a four-unit
   band and a five-unit shed a half-unit one. Nothing vertical, therefore.

   1. CHAMFERED VERTICAL CORNERS at 14 per cent of the footprint. Scales with w and dp, which is
      what you want — a wider building gets a proportionally wider chamfer. At a low sun the
      chamfer face takes light at a third angle from the two walls it joins, so every building
      gets a bright or dark line down each corner. That line is the whole point.

   2. A 5 PER CENT TAPER, top narrower than base. Proportional, so it is scale-safe too. It also
      breaks the one thing that most gave away the old fabric: a field of extruded rectangles all
      with exactly parallel vertical edges reads as a bar chart.

   32 triangles against 12. About 28k extra across a district, against 92k. */
const fabricGeo = (() => {
  const C = 0.22 * 0.5, H = 0.5, T = 0.95;
  /* The chamfered square, written out in order rather than generated per quadrant. A loop over
     [±1, ±1] emits the eight points in an order that is NOT angular, and indexing a ring in the
     wrong order gives a self-intersecting bow-tie prism that still passes a syntax check and
     still renders — just wrongly, and only at certain angles. Explicit is cheaper to verify. */
  const ring = [
    [ H, -H + C], [ H,  H - C], [ H - C,  H], [-H + C,  H],
    [-H,  H - C], [-H, -H + C], [-H + C, -H], [ H - C, -H],
  ];
  const pos = [], idx = [];
  const push = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1; };
  const bot = ring.map(p => push(p[0], 0, p[1]));
  const top = ring.map(p => push(p[0] * T, 1, p[1] * T));
  for (let i = 0; i < 8; i++){
    const j = (i + 1) % 8;
    idx.push(bot[i], top[i], top[j], bot[i], top[j], bot[j]);
  }
  const cb = push(0, 0, 0), ct = push(0, 1, 0);
  for (let i = 0; i < 8; i++){
    const j = (i + 1) % 8;
    idx.push(cb, bot[i], bot[j]);
    idx.push(ct, top[j], top[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
})();

/* ONE CITY, DRAWN TWICE — WHICH IT WAS NOT, AND THAT IS THE WHOLE LOD PROBLEM.

   mass and detail were two separate urbanFabric calls at two densities, drawing from the shared
   sequence. Two calls, two different draws: the world view was one city and the district view
   was a DIFFERENT ONE. Tapping an island did not add detail to what you were looking at, it
   replaced every building on it. No amount of matching the two densities could fix that, which
   is why 1.25 -> 1.60 helped so little.

   The fix is a local generator seeded from the island id alone. Both calls then walk the same
   grid and make the same rolls, so they build the identical city, and the layers differ by ONE
   thing: mass skips anything shorter than minH. Zooming in now adds the small buildings between
   the ones already on screen and moves nothing.

   Seeded from the id, not from a counter, so the seed does not depend on call order — otherwise
   adding an island upstream would reshuffle every island after it. */
function fabricRnd(id){
  let h = 2166136261;
  for (let i = 0; i < id.length; i++){ h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  h >>>= 0;
  return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
}

function urbanFabric(d, layer, opts){
  const { density, coreX = 0, coreZ = 0, tallest, innerHole = 0, cool = false,
          cap = Infinity, avoid = false, minH = 0 } = opts;

  /* SHADOWS THE MODULE-LEVEL rnd FOR THE LENGTH OF THIS FUNCTION. Everything below is written
     against `rnd` and none of it needs to change; it simply draws from a stream that restarts
     at the same place for both layers of the same island. */
  const rnd = fabricRnd(d.id);

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
      // Keep the coast clear so buildings do not straddle the waterline. Measured as a real
      // distance to the outline now: the old radial scale gave a margin that grew with distance
      // from the island centre and pointed the wrong way inside every notch.
      if (distToOutline(d.id, jx, jy) < COAST_CLEAR + pitch * 0.30) continue;
      /* Per-landmark rectangles, not a band. The band version reserved sixty per cent of
         Corniche's depth to protect three buildings that between them occupy about a fifth of
         it, and the difference was the empty northern half. */
      if (avoid && inAvoid(d, jx, jy, pitch * 0.5)) continue;
      if (innerHole > 0 && Math.hypot(jx, jy) < innerHole) continue;
      // THE ROAD WINS. Placed before the fabric, so the fabric has to make room for it.
      if (onRoad(d, jx, jy, pitch)) continue;
      if (rnd() > 0.88) continue;                      // occasional gap: a square, a car park
      cells.push({ jx, jy });
    }
  }

  /* ROOFS, WHICH WERE THE REAL COMPLAINT.

     The wide low blocks read as pale rectangles because that is exactly what they are from
     above: a single flat face the size of the whole plot, catching the sun with nothing on it to
     break the light. Height variation does not help them — they are wide, not tall — and neither
     does material, because the fault is that the silhouette has no incident.

     A plant room fixes it for one instanced mesh and 32 triangles. Real buildings put their
     lifts, tanks and air handling in a box on the roof, offset from centre because it follows
     the core rather than the outline, and that box is what stops a roof being a plane. It reuses
     fabricGeo, so it arrives chamfered and tapered like everything else.

     WEIGHTED TOWARDS THE WIDE ONES. A slender tower does not need one and would only look
     cluttered; a plot whose footprint is large against its height is precisely the case the eye
     is objecting to. */
  const roofM  = new THREE.InstancedMesh(fabricGeo, matRoofDeck, cells.length);
  const rendM  = new THREE.InstancedMesh(fabricGeo, matStoneRend,  cells.length);
  const stoneM = new THREE.InstancedMesh(fabricGeo, matPlaceStone, cells.length);
  const cladM  = new THREE.InstancedMesh(fabricGeo, matStoneClad,  cells.length);
  const glassM = new THREE.InstancedMesh(fabricGeo, matPlaceGlass,  cells.length);
  const bronzeM = new THREE.InstancedMesh(fabricGeo, matGlassBronze, cells.length);
  const bandM  = new THREE.InstancedMesh(fabricGeo, cool ? matLitCool : matLitWarm, cells.length);
  [roofM, rendM, stoneM, cladM, glassM, bronzeM].forEach(m => { m.castShadow = true; m.receiveShadow = true; });

  const M = new THREE.Object3D();
  const col = new THREE.Color();
  let si = 0, gi = 0, bi = 0, ri = 0, ci = 0, fi = 0, zi = 0;
  const gap = 0.22;                       // street width as a fraction of the block

  /* A MULTIPLIER NEAR WHITE, not an absolute colour. instanceColor MULTIPLIES the material's
     diffuse rather than replacing it, so the base material carries the hue in whichever view
     mode is active and the instance buffer carries only the VARIATION. */
  /* WARMTH IS NOW PER BUILDING, WHICH IT WAS NOT.

     The old version rolled one number, v, and applied a FIXED warm ratio to it: R = 1.05v,
     G = v, B = 0.94v. Every stone instance therefore had exactly the same hue and differed only
     in brightness, which is precisely why the fabric read as one sand colour with the lights
     turned up and down. A hue needs its own roll.

     w runs slightly negative at the bottom of its range, so a few buildings come out cool grey
     against the sand. Abu Dhabi has plenty of white and grey towers and the contrast is what
     makes the warm ones read as warm. Since instanceColor MULTIPLIES, this is relative: it
     works the same against the night hex and against DUSK_STONE without knowing either. */
  function tint(amount, warmBias){
    const v = 1 + (rnd() - 0.5) * amount;
    const w = warmBias * (-0.45 + rnd() * 2.25);
    col.setRGB(
      Math.min(1.35, v * (1 + w * 0.05)),
      Math.min(1.35, v),
      Math.min(1.35, v * (1 - w * 0.06))
    );
    return col;
  }

  cells.forEach(c => {
    const x = c.jx * d.r, z = -c.jy * d.r;
    const block = pitch * d.r;
    /* ASPECT, not just size. Every block being a near-square box was making the fabric read as
       crystal growth rather than as buildings — the Day render showed it plainly. One roll
       decides whether this plot is a slab, a wide low mass or an ordinary block, and the two
       dimensions are then set AGAINST each other rather than drawn independently. Independent
       rolls regress to square; that is what was happening. */
    const shape = rnd();
    let aw = 0.72 + rnd() * 0.26, ad = 0.72 + rnd() * 0.26;
    if (shape < 0.26){ aw = 0.92 + rnd() * 0.06; ad = 0.34 + rnd() * 0.20; }        // slab
    else if (shape < 0.44){ aw = 0.34 + rnd() * 0.20; ad = 0.92 + rnd() * 0.06; }   // slab, turned
    const w  = block * (1 - gap) * aw;
    const dp = block * (1 - gap) * ad;

    // Height falls away from the core. The exponent controls how abruptly downtown ends.
    const dc = Math.hypot(c.jx - coreX, c.jy - coreZ);
    const fall = Math.max(0, 1 - Math.pow(dc / 0.9, 1.5));
    // Capped: a landmark that is not the tallest thing near it stops being a landmark.
    const h = Math.min(cap, 3 + tallest * fall * (0.25 + Math.pow(rnd(), 2.2) * 0.95));

    /* THE ONLY DIFFERENCE BETWEEN THE TWO LAYERS, and it is tested here rather than earlier on
       purpose. Every rnd() above has already been spent, so the stream sits in exactly the same
       place whether this building is emitted or skipped. Move the test one line up and the mass
       layer desynchronises from the detail layer and they are two different cities again —
       which is the bug this whole structure exists to remove. */
    if (h < minH) return;

    M.position.set(x, GROUND, z);
    M.rotation.set(0, 0, 0);              // grid-aligned: the whole point
    M.scale.set(w, h, dp);
    M.updateMatrix();
    /* GLASS FOLLOWS HEIGHT. A flat 35 per cent chance put curtain wall on one villa in three,
       so a third of every low-rise band was rendering as mirrored towers and, once dusk started
       tinting glass separately, a third of the island turned a different colour from the rest
       for no reason a viewer could read. Tall buildings are glass, low ones are masonry — which
       is both what the reference shows and what Abu Dhabi looks like.
       Still ONE draw of the dice, not two: calling rnd() twice let the mesh and the index
       disagree, which silently overwrites instances and leaves holes in the other buffer. */
    const isGlass = rnd() < (h > tallest * 0.50 ? 0.62 : 0.10);
    if (isGlass){
      /* WHICH GLASS. Not a free roll: bronze goes on the SHORTER of the glass towers, because
         the tint dates the building and the older stock is the lower stock. Same reasoning as
         the stone tiers, and it means the two tints separate by height rather than scattering,
         which is what reads as eras instead of noise. */
      if (rnd() < (h > tallest * 0.72 ? 0.14 : 0.55)){
        bronzeM.setMatrixAt(zi, M.matrix);
        bronzeM.setColorAt(zi, tint(0.26, 0.9));
        zi++;
      } else {
        glassM.setMatrixAt(gi, M.matrix);
        glassM.setColorAt(gi, tint(0.30, 0.2));   // glass varies less: it is one product
        gi++;
      }
    } else {
      /* Finish follows height, exactly as glass does, and for the same reason: a material that
         varies at random across neighbouring plots reads as noise, while one that varies with
         height reads as the city having been built in eras. ONE roll already spent above decides
         glass; this needs none, since h is already known. */
      const frac = h / tallest;
      if (frac < 0.36){
        rendM.setMatrixAt(ri, M.matrix);
        rendM.setColorAt(ri, tint(0.46, 1.15));   // render and plaster: warmest and most varied
        ri++;
      } else if (frac < 0.62){
        stoneM.setMatrixAt(si, M.matrix);
        stoneM.setColorAt(si, tint(0.42, 1.0));   // precast concrete
        si++;
      } else {
        cladM.setMatrixAt(ci, M.matrix);
        cladM.setColorAt(ci, tint(0.30, 0.55));   // polished cladding: tighter, cooler
        ci++;
      }
    }

    /* Flatness is footprint against height. A 3-unit-wide block 12 tall is a tower and wants
       nothing; the same width at 4 tall is a shed with a big lid, and that is what gets a plant
       room. The threshold is 0.22 rather than something that sounds flatter, because the height
       distribution is heavily weighted to the tall end and 0.42 caught only 15 per cent of the
       stock — the wide blocks being complained about are not rare, they are simply the ones with
       the largest visible area. */
    const flat = Math.min(w, dp) / h;
    if (flat > 0.22 && rnd() < 0.72){
      const rw = w  * (0.26 + rnd() * 0.20);
      const rd = dp * (0.26 + rnd() * 0.20);
      const rh = Math.max(0.45, h * (0.10 + rnd() * 0.09));
      // Offset toward one quadrant rather than centred: a service core is never in the middle.
      M.position.set(x + (rnd() - 0.5) * (w - rw) * 0.8, GROUND + h,
                     z + (rnd() - 0.5) * (dp - rd) * 0.8);
      M.rotation.set(0, 0, 0);
      M.scale.set(rw, rh, rd);
      M.updateMatrix();
      roofM.setMatrixAt(fi, M.matrix);
      roofM.setColorAt(fi, tint(0.30, 0.7));
      fi++;
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

  roofM.count = fi; rendM.count = ri; stoneM.count = si; cladM.count = ci;
  glassM.count = gi; bronzeM.count = zi; bandM.count = bi;
  [roofM, rendM, stoneM, cladM, glassM, bronzeM, bandM].forEach(m => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  layer.add(roofM, rendM, stoneM, cladM, glassM, bronzeM, bandM);
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
  /* A second row of mixed tower types behind the landmarks, giving the skyline profiles the
     box-only instanced fabric cannot produce. zSlope pulled back to 0.08 — at 0.30 the ends of
     a 128-unit row swing 19 units in z and walk straight off the coast.

     STARTS AT x = -6, NOT -62. The row was running from -62 to 66 at z = 4, and Emirates Palace
     occupies x -66 to -18 at z -3.3 to 4.0 — so for forty-four units of its width the row was
     standing inside the palace. It is the same fault as the fabric cap in a different costume:
     a landmark stops being a landmark the moment something ordinary is allowed to share its
     ground. The western third of the island is now palace grounds and nothing else, which is
     also what is actually there. */
  const row = kit.cityRow(18, -6, 66, 4, 5, 4, 13, 0.62, 0.08, 0.22);
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

  /* THE SUPPORTING SKYLINE IS GONE, AND IT IS WHAT THE BIG BLOCKS WERE.

     Eight hand-placed masses, 10 to 16 units wide. The generated fabric's largest possible plot
     is 2.67 units, so these were five to six times the size of anything around them — which is
     exactly what reads as a block rather than a building, and exactly what was circled.

     They earned their place when the mass layer was a coarse independent city and needed help
     carrying a skyline. v33 changed that: mass is now the detail city filtered by height, so the
     supporting skyline is already there, at the right scale, and these were sitting on top of it
     at six times the grain. Two of them, [6,26,16,5] and [-20,28,14,4], are also 4 and 5 units
     tall against 16 and 14 wide — flat lids, and both close enough to the southern ring road to
     be among the road encroachments, since massBlock has never been tested against anything.

     The three landmark portraits stay. Those reserve their ground through the avoid rects and
     they are the point of the mass layer. */
}

/* ---------- the four placeholders ---------- */
DISTRICTS.filter(d => !d.built).forEach(d => {
  const cool = d.tint === 0x8FD3E8 || d.tint === 0xBFD3E0;
  // Per-district character: where downtown sits, and how tall it gets there.
  const tallest = { maryah:40, reem:44, saadiyat:14, yas:18 }[d.id];

  /* DENSITY UP, because the road network now takes its cut first. Reserving the ring and the
     arterials removed about forty per cent of the blocks — correctly, that ground is carriageway
     — but the islands came out thin. A finer pitch wins twice: more blocks fit in what is left,
     AND the clearance shrinks with the pitch, since half of it is the building's own overhang.
     Instancing means the extra count is free in draw calls. */
  /* SAME DENSITY, SAME SEED, DIFFERENT FLOOR. The layers are the same city; mass simply omits
     anything under minH, so the world view holds the massing and zooming in fills the gaps. */
  urbanFabric(d, d.mass,   { density:1.30, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool, minH:5.4 });
  const built = urbanFabric(d, d.detail,
                           { density:1.30, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool });
  d.fabric = built;

  const glow = new THREE.PointLight(d.tint, 0, 150, 2);
  glow.position.set(0, GROUND + 20, 0);
  d.detail.add(glow);
  d.glow = glow;
});

/* Corniche gets fabric across the whole island, minus three reserved rectangles. The towers
   standing in front of a dense low-rise city is most of what makes them read as a downtown
   rather than as objects on sand.

   DENSITY 1.85, AND THE ARITHMETIC THAT SHOULD HAVE BEEN RUN BEFORE 1.30 WAS.

   v18 cut this from 2.10 to 1.30 on the reasoning that the fabric had gained two and a half times
   the ground and would otherwise read as graph paper. The first half of that was simply false:
   the five exclusion rectangles covered 69 per cent of the island, more than the band they
   replaced, so the fabric gained almost nothing — and the density cut then took the cell count
   from 206 to 69. Two changes that both removed buildings, one of them believed to be adding
   them. The Day world view showed the result honestly: fat pale slabs scattered on green.

   Three landmark rects leave 64 per cent of the island open, and 1.85 puts about 254 cells on it
   against v17's 206 in a strip. So the local grain is close to what the strip had while the city
   now covers the whole island. Block pitch 3.5 units, a 27-metre block — finer than v18's 39, and
   not the 24 that made a mesh.

   THE GREEN WAS THE SAME MISTAKE SEEN FROM THE OTHER SIDE. Parkland is painted first and the
   fabric's own cells are paved on top of it, so the amount of green showing is set by how much
   city is standing on the island. The park layer is dense enough to tint the whole of Corniche
   and always has been — 69 cells simply stopped covering it. It needs no fix; it needs a city.

   CAP 12 STAYS. Etihad's shortest tower is 21.8 and ADNOC is 44, so the margin that makes the
   three landmarks legible as landmarks is unchanged. */
/* READ FROM coreN, not retyped. The core was written out twice — once in the district table and
   once here — and the two copies were free to drift, which is most of how the south-shore core
   survived unnoticed through four drops. One source. */
const cornicheFabric = urbanFabric(corniche, corniche.detail,
  { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:16, avoid:true, cap:12 });
urbanFabric(corniche, corniche.mass,
  /* Same density and the same seed as the detail call above, so this is the SAME CITY. The two
     layers differ only by minH: the world view keeps about 72 per cent of the buildings, the
     tall ones, and tapping in adds the short ones between them without moving anything. */
  { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:16, avoid:true,
    cap:12, minH:5.4 });
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
const dayGround  = new THREE.MeshStandardMaterial({ color:0xD8D2C4, roughness:0.92, metalness:0 });
const dayBeach   = new THREE.MeshStandardMaterial({ color:0xAB9A7C, roughness:1, metalness:0 });
const duskGround = new THREE.MeshStandardMaterial({ color:0xC6B99E, roughness:0.94, metalness:0 });
const duskBeach  = new THREE.MeshStandardMaterial({ color:0x9C8C6F, roughness:1, metalness:0 });

let propCount = { palms:0, lamps:0, cars:0, boats:0 };
DISTRICTS.forEach(d => {
  const f = d.fabric;
  if (!f) return;
  const plan = groundPlan(d, f.cells, f.pitch);
  d.plan = plan;
  const tex = paintGround(d, plan);
  /* Props into the DETAIL layer only. At world scale a palm is a third of a pixel; paying for
     four hundred of them per island at exactly the moment five islands are on screen would be
     paying for invisible geometry. The LOD swap already exists and this is what it is for. */
  if (props){
    const n = props.addProps(d, d.detail, plan);
    Object.keys(n).forEach(k => propCount[k] += n[k]);
  }
  const night = new THREE.MeshStandardMaterial({
    color:0x68737E, roughness:1, metalness:0, map:tex });
  const day  = dayGround.clone();  day.map  = tex;
  const dusk = duskGround.clone(); dusk.map = tex;
  /* PLAN MODE MATERIALS. MeshBasic, so no light, no shadow, no material tint and no exposure —
     just the painted canvas projected onto the island. Four rounds have now been spent arguing
     from screenshots about whether this texture reaches the screen; every part of the chain has
     been verified in isolation and it should. This removes the argument: if Plan shows roads,
     the texture is fine and the fault is in lighting or contrast. If Plan shows flat sand, the
     fault is in the addressing and nothing about the palette will ever help. */
  const planTop  = new THREE.MeshBasicMaterial({ map: tex });
  const planSide = new THREE.MeshBasicMaterial({ color: 0x2A3038 });
  d.isleMeshes.forEach(m => {
    m.material = [night, matBeach];
    /* Handed to the view switcher, one ground material per lighting mode, all sharing ONE
       canvas. The map carries hue and pattern; these carry level. Losing the ground plan in Day
       — the one mode that exists to judge layout — would be perverse, and losing it at dusk
       would delete the roads the props are standing beside. */
    m.userData.dayMats  = [day,  dayBeach];
    m.userData.duskMats = [dusk, duskBeach];
    m.userData.planMats = [planTop, planSide];
    m.userData.ground   = true;
  });
});

/* ---------- shadow flags, one sweep ---------- */
world.traverse(o => {
  if (!o.isMesh || o.userData.helper) return;
  const on = !o.userData.noShadow;
  o.castShadow = on;
  o.receiveShadow = on;
});
water.castShadow = false;

return { world, water, farSea, waterPos, waterBase, waterNormal, DISTRICTS, pickTargets,
         corniche, GROUND, propCount };
}
