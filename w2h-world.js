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
export const BUILD = 'world v179';

/* THE DATUM. Derived, never typed twice. */
export const ISLE_DEPTH   = 2.4;
export const ISLE_BEVEL_T = 0.5;
export const ISLE_BEVEL_S = 1.6;
export const GROUND = ISLE_DEPTH + ISLE_BEVEL_T;   // 2.9 — the top face of every island

/* LOCAL GRAIN: WHAT SIZE THE NEIGHBOURS ARE, NOT JUST WHETHER THERE ARE ANY.

   cullFabric already asks the payload "is a real building near this generated one" and answers
   with a distance. The payload has always carried w, dp and h alongside x and z, and nothing has
   ever read them. That is the whole bug on Saadiyat: the villa estates get generated stock at the
   grain the SUPERBLOCK chose - 30-plus metre plots laid along a street frontage - and a street
   wall is exactly wrong where the real neighbours are 17 m detached houses.

   PURE, EXPORTED AND UNIT-TESTABLE, so the decision can be argued with in the container instead
   of inspected on a phone. Given the generated box and a summary of the real stock around it,
   return the box it should have been, or null to leave it alone.

   IT ONLY EVER SHRINKS, AND ONLY EVER INSIDE THE OLD PLAN EXTENT. Growing a box would put it
   through a real facade that CULL_R sized the clearance for. The offset is bounded so that
   newHalf + |offset| <= oldHalf for every s, which keeps that guarantee arithmetic rather than
   hopeful.

   SILENT WHERE THE SIGNAL IS WEAK. Fewer than GRAIN_MIN_N neighbours is noise; real stock bigger
   than GRAIN_MAX_S is a district that genuinely builds big and must not be shrunk to villas. Al
   Maryah and the Cultural District both fall out here and are untouched. */
export const GRAIN_MIN_N  = 4;
export const GRAIN_MAX_S  = 30 / 7.8;    // island units. Above this the neighbours are not villas.
export const GRAIN_FLOOR  = 0.34;        // never shrink past a third; below that it is confetti
export const GRAIN_H_MULT = 1.25;
export const GRAIN_H_MIN  = 7 / 7.8;     // two storeys, so nothing becomes a slab
const GRAIN_JIT = 5 * Math.PI / 180;

/* Deterministic per-position, so a reload does not reshuffle the estate. */
function grainHash(x, z){
  let h = Math.imul(Math.round(x * 977) ^ Math.imul(Math.round(z * 977), 0x9E3779B1), 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function grainFit(genW, genD, genH, grain, x, z){
  if (!grain || grain.n < GRAIN_MIN_N || !(grain.pw > 0)) return null;
  if (grain.pw > GRAIN_MAX_S) return null;
  /* A BUILDING THAT IS ALREADY A HOUSE IS LEFT ALONE, AND THIS IS NOT AN OPTIMISATION.

     Generated villa stock now carries a clay roof built at generation time as a SEPARATE instanced
     mesh. Shrinking the wall here and not the roof would leave the cap floating proud of the box
     it belongs to. The roof cannot be resized in step because it is not index-aligned with the
     wall — it is position-aligned, which is what makes the cull work and what makes a paired
     resize impossible.

     Nothing is lost. Grain existed to drag oversized generated plots down to the local scale, and
     below VILLA_ABS_M the generation-time rules have already done that properly, with the right
     facade and the right window class instead of a shrunken tower. */
  if (genH * 7.8 <= 12) return null;
  const genPlan = (genW + genD) / 2;
  if (!(genPlan > grain.pw)) return null;              // neighbours are bigger; nothing to do
  const s = Math.max(GRAIN_FLOOR, grain.pw / genPlan);
  if (s > 0.94) return null;                           // within noise, not worth a recompose
  let h = genH;
  if (grain.ph > 0) h = Math.min(genH, Math.max(GRAIN_H_MIN, grain.ph * GRAIN_H_MULT));
  const r1 = grainHash(x, z), r2 = grainHash(z, x);
  const slack = (1 - s) * 0.55;
  return {
    w: genW * s, d: genD * s, h,
    dx: (r1 - 0.5) * genW * slack,
    dz: (r2 - 0.5) * genD * slack,
    dRot: (r1 + r2 - 1) * GRAIN_JIT * (1 - s) / (1 - GRAIN_FLOOR),
  };
}

export function buildWorld(scene, kit, opts = {}){
const MAX_ANISO = opts.maxAnisotropy || 4;
/* The prop kit is OPTIONAL. Pass it and the islands get palms, lamps, cars and boats; leave it
   out and everything else still builds. Same argument as the city kit: a module that can be
   omitted can be bisected when something breaks. */
const props = opts.props || null;

/* PER-DISTRICT CHARACTER, OPTIONAL, AND NOT AN IMPORT. Block sizes, height ceilings and the
   vacancy mask live in w2h-districts.js so they can be tuned without opening a 5,450-line file.
   It arrives through opts for the same reason C and rnd do: a static specifier cannot carry ?v=,
   and a local module fetched without one is served from cache forever.

   ABSENT, EVERY LOOKUP BELOW FALLS BACK to the constants that were here before. Paste this file
   alone and nothing should move — that is the test. */
const DIS = opts.districts || null;

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

/* THE BASEMAP, IF THERE IS ONE. A table keyed by island id, each entry carrying a normalised real
   coastline, a true radius in scene units, a damped display scale and a diorama position — built
   by w2h-basemap.js from the artefact tools/bake-city.mjs commits.

   OPTIONAL BY DESIGN. Absent, every line below behaves exactly as v77 did and the hand-drawn
   ISLE_SHAPES still run the scene. That is not politeness about deploy order: it is the only way
   to put a change this large in front of a renderer and be able to tell, in one toggle, whether a
   fault came from the data or from everything else. */
const BASE = opts.basemap || null;
/* Read here rather than passed through opts: it governs one line in one function and threading it
   through the module boundary would be more surface than the flag is worth. */
const NO_CLIP = typeof location !== 'undefined' && location.search.includes('noclip');
/* ?nokit — ONE LOAD TO NAME THE FLOATERS.

   The clip cleared the sea buildings, so whatever is still hanging is not a footprint that failed
   the coastline test. The remaining candidate is the hand-built kit: Emirates Palace, Etihad
   Towers, ADNOC HQ, the lowRise block and the cityRow are placed at AUTHORED coordinates —
   LM.palace.x and literals like (16, -40, 26, -18) — with position.y forced to GROUND. Those
   literals were written for a diorama island a few hundred units across. Corniche is now 2,440
   units of real coastline, and the bake rebased the LABELS onto real landmark positions without
   touching the geometry that was authored to sit under them.

   That is a hypothesis, and it has been wrong twice today when I have stated it as fact. So it is
   a switch instead: turn the kit off and look. If the floaters go with it, they are authored
   geometry on stale coordinates and the fix is to rebase the kit onto the baked landmarks the way
   the anchors already were. If they survive, they are footprints and the cause is elsewhere. */
const NO_KIT = typeof location !== 'undefined' && location.search.includes('nokit');

/* ?lambert — swap the purely diffuse materials from Standard to Lambert.

   compile came back at 22,326 ms with prog at 67, which is about 330 ms per shader program: normal
   for a mobile GL driver linking a heavy one. Not the program COUNT, then, but the size of each,
   and this file declares 34 MeshStandardMaterials and no Lambert or Phong at all.

   MeshStandardMaterial is three.js's PBR shader and by a wide margin the most expensive it has to
   compile. Most of these declare metalness 0 and roughness near 1, which is a plain diffuse
   surface — Lambert renders it almost identically and compiles a fraction of the code.

   ONLY THE ONES THAT CAN'T BE MUTATED LATER. applyLift writes roughness, metalness and
   envMapIntensity on every registered building and glass material at each view change, and those
   properties do not exist on Lambert. So the swap is restricted to metalness 0 with roughness at
   or above 0.85 — sand, rock, stone, decking, terrain — and every façade stays Standard.

   Behind a flag because it is a look change as well as a speed one, and one reload with and one
   without settles both questions at once. */
const LAMBERT = typeof location !== 'undefined' && location.search.includes('lambert');

function stdMat(o){
  const diffuse = (!o.metalness || o.metalness === 0) && (o.roughness == null || o.roughness >= 0.85);
  if (!LAMBERT || !diffuse) return new THREE.MeshStandardMaterial(o);
  const { roughness, metalness, envMapIntensity, ...rest } = o;
  return new THREE.MeshLambertMaterial(rest);
}

/* ?fp — read here as well as in the nav, because two decisions about the hand-built kit have to be
   made at BUILD time and cannot be taken back afterwards: whether the generic filler is added at
   all, and where the landmark exclusion zones fall. The nav owns the footprint policy; this module
   owns the geometry, and the geometry has to be authored differently rather than masked. */
const FP_MODE = typeof location !== 'undefined' && location.search.includes('fp');

/* ?vac — THE VACANCY MASK, OFF BY DEFAULT AND DELIBERATELY SO.

   Holding ground empty is the one change in this pass that interacts with parkland: groundPlan
   fills every cell-free area with lawns on purpose, so a mask that removes cells and nothing else
   turns Saadiyat green. The park suppression below is the fix, and a flag is how you find out in
   one reload whether it worked rather than in a day of bisecting commits. Same argument as ?fp,
   ?nokit, ?noclip and ?drawn. */
const VAC_ON = typeof location !== 'undefined' && location.search.includes('vac');
/* YAS BAY DIAGNOSTICS, TWO FLAGS, AND THE NAMES ARE DELIBERATELY LONG. `fp` already proves that a
   short flag becomes a substring of another query string sooner or later.
     ?bayall    skips the onIsle clip on the bay cells only. Nothing else in the file changes.
     ?baydebug  paints the four bands magenta / cyan / lime / orange in all three light states.
   Together they answer, in ONE load, a question two rounds of counters did not: whether the block
   runs, whether the clip is what empties it, and whether the surfaces are simply sand on sand. */
const BAY_ALL   = typeof location !== 'undefined' && location.search.includes('bayall');
const BAY_DEBUG = typeof location !== 'undefined' && location.search.includes('baydebug');

/* Island-local rectangles where an authored landmark stands and a surveyed footprint must not.
   Populated when the kit is built, read by footprintsFor.

   EXPORTED, WHICH IT WAS NOT. That was fine while only footprintsFor (in this same file) read it
   — real survey buildings correctly disappear under a landmark. Generated fabric never got the
   same courtesy: world-nav.html's cullFabric only tests proximity to real surveyed footprints,
   and a modern precinct like the mosque's has almost none nearby to trigger that test, so filler
   buildings happily populate ground a hand-built landmark or a traced precinct shape already
   covers. Exporting this is what lets cullFabric ask the same question footprintsFor already
   answers correctly. Empty for every island with no kit, which is every island except Corniche
   today. */
export const KIT_ZONES = {};

/* Surveyed heights from every island so far, binned by footprint area, so a band too thin on one
   island can borrow the same band from the others. Filled by footprintsFor as each island lands;
   Corniche's 3,460 arrive first and carry most of it. See poolFor for why this is the right
   fallback and the island-wide pool was the wrong one. */
const GLOBAL_BANDS = [];

/* STAGE TIMING, AND IT IS HERE BECAUSE SIXTEEN SECONDS IS TOO SLOW TO GUESS AT.

   The real data made the scene forty times heavier and the build went from imperceptible to
   sixteen seconds. There are five plausible culprits — the fabric loop, the ground canvas, the
   coastline resample, the road skeleton, the geometry upload — and I have opinions about which,
   which is exactly the reason to measure instead. Every wrong guess here costs another sixteen
   second round trip on a phone.

   Wrapping the named stages rather than threading marks through them: the timing is additive,
   removable in one block, and cannot drift out of step with the code it measures. performance.now
   is monotonic and sub-millisecond, and the wrapper costs a few microseconds against stages that
   run for hundreds of milliseconds. */
const PERF = {};
/* THE COUNT KEY IS BUILT ONCE, NOT ON EVERY CALL.

   `'#' + name` inside the wrapper allocated a fresh string per invocation. On a stage that runs
   once per island that is nothing; on anything hot it is a garbage generator sitting inside the
   measurement, and a profiler then reports the instrument as the cost. Hoisted. */
const timed = (name, fn) => {
  const ck = '#' + name;
  return function(...a){
    const t0 = performance.now();
    const r = fn.apply(this, a);
    PERF[name] = (PERF[name] || 0) + (performance.now() - t0);
    PERF[ck] = (PERF[ck] || 0) + 1;
    return r;
  };
};
const T0 = performance.now();

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
  /* Same argument as paintGround below, and this one never wanted a GPU surface either: its
     pixels are assembled with createImageData and putImageData, both of which are CPU work. */
  const g = cv.getContext('2d', { willReadFrequently: true });
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
/* 256, DOWN FROM 512, AND THE SPECTRUM IS WHY IT COSTS NOTHING.

   This is 26 wave components evaluated per pixel, so 512 squared is 6.8 million sine pairs and a
   profile put it at 11.8 per cent of the longest task in the load. The band runs 3 to 16 cycles
   across the tile: at 256 that is still sixteen pixels per wavelength at the fine end, eight times
   Nyquist, and the field is smooth by construction. Halving the side quarters the work and the
   normal map is visually the same thing. */
const waterNormal = makeWaterNormal(256);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(3200, 3200, 70, 70),
  stdMat({ color:0x050A10, roughness:0.58, metalness:0.05,
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
  stdMat({ color:0x050A10, roughness:0.62, metalness:0.05 })
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
/* ===========================================================================
   LANDMARK ANCHORS.

   ADNOC WAS STANDING IN THE ROAD, and had been since it was placed. Its centre sits 1.6 units
   from the ring-road centreline against a kerb half-width of 2.4 — so the centreline runs INSIDE
   the tower's footprint, and the painter draws tarmac straight through the plot a 44-unit tower
   is standing on. Its 4.5-unit half-diagonal overlaps the kerb by 5.3 units, and it clears the
   coastline by 0.4, which is why the base reads as if it is on the water's edge.

   The fabric has been tested against the roads since the beginning — onRoad is the reason the
   generated city has clean streets — but the three hand-placed landmarks never were. massBlock
   and the city kit take a literal x and z and put a building there. A rule that only applies to
   the generated half of the city is not a rule.

   THE ANCHOR IS NOW ONE CONSTANT, which is the other half of the fault: (48, -6) was written out
   five separate times — the place camera, the avoid rectangle, the ground-paint apron, the detail
   kit call and the mass block. Moving it meant finding all five and any one missed puts the apron
   in a different place from the tower. Derived from a single source, that cannot happen.

   ADNOC'S NEW ANCHOR was solved rather than nudged: a search over the eastern third for the point
   that maximises the SMALLER of its two clearances, with a hard floor of three units on both and
   a penalty on displacement. (42.25, 7.25) — 14.4 units from the old spot — gives 14.8 units of
   spare coast clearance and 6.0 of spare road clearance, and stays clear even if the footprint
   grows to 11 x 9. The nearest merely-legal point, (44, 1.5), had 0.0 units of road margin and
   failed the moment the footprint widened at all; a fix with no headroom is a fix that comes back.

   Etihad and the palace overlap the kerb too, by 3.3 and 8.5 units, and both are LEFT ALONE. The
   distinction is that their centres are outside the casing — a tower whose plaza meets the kerb
   is what a city looks like, and the palace's own apron paving is drawn over that ground anyway.
   Only ADNOC had a road running through its middle.
   =========================================================================== */
/* THE ETIHAD CLUSTER LAYOUT, declared once and consumed three times: the mass blocks, the plaza
   paving, and the audit. It was already duplicated between this file and w2h-city.js; there is no
   need for it to be duplicated a third time inside the districts table as a hand-fitted rectangle
   that then has to be remembered whenever the anchor moves. */
const ETIHAD_SPEC = [
  { dx:-17.0, dz: 3.0, h:27.7, r:2.85 },
  { dx: -8.5, dz: 0.8, h:30.5, r:3.00 },
  { dx:  0.0, dz: 0.0, h:26.0, r:2.80 },
  { dx:  8.0, dz: 0.8, h:23.4, r:2.65 },
  { dx: 15.5, dz: 3.0, h:21.8, r:2.50 },
];

/* The plaza is the cluster's own bounding box plus a margin, computed rather than fitted. ELL is
   the towers' plan ellipse factor from w2h-city.js, so the depth is the real depth of the lens
   rather than its width. */
const ETIHAD_PLAZA = (() => {
  const ELL = 0.62, M = 3.0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  ETIHAD_SPEC.forEach(s => {
    x0 = Math.min(x0, s.dx - s.r);       x1 = Math.max(x1, s.dx + s.r);
    z0 = Math.min(z0, s.dz - s.r * ELL); z1 = Math.max(z1, s.dz + s.r * ELL);
  });
  return { dx:(x0 + x1) / 2, dz:(z0 + z1) / 2, w:(x1 - x0) + 2 * M, d:(z1 - z0) + 2 * M };
})();

/* ISLAND SCALE, THE OTHER HALF OF THE FIX.

   With roads finally held in metres, enlarging an island buys blocks instead of buying wider
   roads. At the old size Corniche is 1.17 km long and holds seven superblocks — a village plan
   drawn at true building scale, which is why the city never read as a city however the fabric was
   tuned. The real island is 11 km; nine times is not available in a five-island diorama, but the
   grain is. Measured:

       scale   length    blocks   plots   instances
        1.0    1.17 km      7       41       135
        1.5    1.76 km     17      119       390
        2.0    2.35 km     36      240       747
        2.5    2.93 km     59      444      1397
        3.0    3.52 km     91      681      2133

   2.5 is the pick. Fifty-nine blocks is a downtown you can read a plan from, and at 2.93 km the
   island is a quarter of Abu Dhabi's real length rather than a ninth — still a miniature, but one
   whose streets and blocks are at their true size relative to the towers standing on them.

   APPLIED TO r AND TO THE ISLAND POSITIONS TOGETHER, so the archipelago keeps its composition and
   only its scale changes. Everything downstream is already derived from d.r: the camera distances,
   the shadow fit, the fog, the coastline point count, the road widths and the grid. What is NOT
   scaled is anything sized to a BUILDING — the Etihad spec, the avoid rectangles, the ground pads,
   the beach — because those are at true scale already and that is the entire point. */
const ISLE_SCALE = 2.5;

/* THE PALACE FOOTPRINT AND ITS ESTATE, and this is the third time the estate has been wrong by
   hand. v74 read a comment saying the palace was thirty units wide and reserved 36; v75 read the
   same comment, reserved 40 and claimed thirteen units of clearance. The geometry in w2h-city.js
   is 49.2 across. Both versions reserved LESS ground than the building stands on plus a verge,
   which is why low-rise kept arriving at its wall however the heights were tuned.

   PALACE_FOOT is exported from the city kit as of city v15 and arrives through opts like C and
   rnd. The literal is a fallback so this drop does not require a world-nav.html drop with it;
   once the kit is passed the fallback is dead and the number lives in one file, beside the
   geometry that defines it.

   THE ESTATE IS ASYMMETRIC ON PURPOSE. The real one is: gardens and beach west and north, Etihad
   Towers standing immediately east with a thin band of city between. Etihad's own reservation
   begins 43 units from the palace anchor, so a symmetric estate wide enough for the western
   gardens would run into it. Shifted 7 west, this leaves twenty units of open ground on the
   garden side, six on the Etihad side, and fabric between the two landmarks — which is what the
   aerials show. */
const PALACE_FOOT   = opts.PALACE_FOOT || { w:49.2, d:12.0, dz:0.4 };
const PALACE_ESTATE = { dx:-7, w:76, d:34 };

/* Positions ON the island, so they scale with it — unlike the buildings standing on them, which
   are already at true scale and must not. */
const LM = {
  palace: { x:-42 * ISLE_SCALE, z:  0 * ISLE_SCALE },
  /* MOVED 14.4 UNITS — 112 METRES — OFF THE RING ROAD. Four of the five towers were standing in
     it, and three had the CENTRELINE running through them: measured road distance 0.0 against a
     2.4-unit kerb half-width. Exactly the ADNOC fault, in the one cluster the whole district is
     composed around, and it survived the ADNOC fix because I checked the tower I had been told
     about and not the other two.

     Solved the same way: nearest anchor clearing a three-unit floor on both coast and road.
     Every tower now has 6.3 units or more of spare road clearance and 12.8 of coast. It also
     happens to be geographically right — Etihad Towers stands immediately beside Emirates Palace
     on the real Corniche, and the pair now read as the pair they are. Verified clear of the
     palace: 3.0 units between the nearest tower and the palace block. */
  etihad: { x: -17.5 * ISLE_SCALE, z:-11 * ISLE_SCALE },
  adnoc:  { x: 42.25 * ISLE_SCALE, z: 7.25 * ISLE_SCALE },
  /* THE GRAND MOSQUE HAS NO NAMED LANDMARK ENTRY, BUT IT DOES HAVE A REAL FOOTPRINT — found late,
     because it carries none of the tags that would have surfaced it earlier. Corniche's Overpass
     landmark table has nothing under "mosque" or "Sheikh Zayed" (checked), and neither does a
     search across every building's sub/vk/cls tag for anything religious or worship-related
     (checked — 453 hits, all ordinary neighbourhood mosques under 55m across). This one has none
     of that: id 0a986630-31c3-4c49-ab30-7f3732a6d0ca, w 424.6 x d 316.3 — within a few metres of
     the real complex's known ~418m facade width — a 46-point irregular outline consistent with an
     actual architectural survey rather than a placeholder box, and sub/vk/cls/h all null, which is
     exactly the signature of a structure too unusual for the classifier rather than a mosque that
     was never captured. The first placement here was a hand-derived coastline estimate, honest
     about being one; this replaces it with the surveyed position directly. Converted from the raw
     record (x:6399.8, y:-9034.4) the same way every other landmark's coordinates are. */
  /* CORRECTED AGAIN, this time from an on-device pick tap rather than a bake-data footprint
     match. The survey-footprint centroid above placed the anchor at (1157, 856); tapping the
     mosque directly in nav v121's point mode put it at (1051, 804) — about 118 units off, which
     reads as a real discrepancy at this building's scale, not noise. Taking the tap as ground
     truth since it is a direct observation against the rendered scene rather than an inference
     from an untagged bake record. */
  mosque: { x: 1051, z: 804 },
};

/* THE ANCHORS COME FROM THE MAP WHEN THERE IS ONE, and v79 showed why they must.

   These three were authored as absolute units against a drawn coastline: -105, -44 and +105 on an
   island 380 units across. The real island is 2,440 across, so all three sat inside two per cent of
   its centre, on top of one another — one tap target where there should be three, and the palace
   unreachable. Scaling them by the radius ratio would have separated them and left all three
   standing in the wrong place, because they were positioned against a shape that no longer exists.

   The names are OSM's, matched exactly by the bake. A landmark the bake could not find keeps its
   authored position and says so below, which is the only honest failure mode: a missing anchor
   that silently defaults to the island centre is how a landmark ends up in the sea. */
const LM_OSM = { palace:'Emirates Palace', etihad:'Etihad Towers', adnoc:'ADNOC Headquarters' };
if (BASE && BASE.corniche && BASE.corniche.landmarks){
  const found = BASE.corniche.landmarks;
  for (const [key, name] of Object.entries(LM_OSM)){
    if (found[name]) LM[key] = { x:found[name].x, z:found[name].z };
    else console.warn('w2h-world: no baked anchor for ' + name + ' — keeping the authored one');
  }
}

/* The place table's labels are shorthand and OSM's are formal, so the ones that differ are mapped
   here rather than renamed in either place: the labels are what the UI prints and the names are
   what the data calls them, and neither should bend to the other. */
/* SUPERSEDED BY AN osm FIELD ON THE PLACE ITSELF, and kept only for anything that still has
   neither. A side table matching on display label meant the two could drift silently: the bake
   was returning Zayed National Museum and Berklee Abu Dhabi for Saadiyat while the scene asked
   for Saadiyat Beach, which OSM has never been asked for, and the miss looked identical to a
   failed Overpass lookup. The canonical key now sits next to the label it belongs to. */
const PLACE_OSM = {
  'ADNOC HQ':'ADNOC Headquarters', 'Ferrari World':'Ferrari World Abu Dhabi',
  'Yas Marina':'Yas Marina Circuit', 'Manarat':'Manarat Al Saadiyat',
  'The Galleria':'The Galleria Al Maryah Island',
};

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
/* THE REAL COASTLINE IS NOT SMOOTHED, and that is the whole difference between the two paths.

   Chaikin exists because ISLE_SHAPES is seventeen to thirty-two points drawn by hand, and corners
   at that spacing read as a polygon rather than a shore. A surveyed outline arrives with over a
   thousand points already simplified to a two-metre tolerance in the bake; it has no corners to
   round, and running Chaikin over it would cut every genuine feature — the Breakwater tip, the
   mouth of the Bateen creek, the marina entrances — by a quarter of its depth, twice.

   Smoothing invented geometry is defensible. Smoothing surveyed geometry is discarding it. */
function isleSmooth(id){
  let sm = smoothCache.get(id);
  if (!sm){
    sm = (BASE && BASE[id] && BASE[id].shape) ? BASE[id].shape : chaikin(ISLE_SHAPES[id], 2);
    smoothCache.set(id, sm);
  }
  return sm;
}

function isleShape(id, r){
  // The SAME points the inside-test and the road inset use. Drawing one coastline and reasoning
  // about another is the fault this file has already paid for once.
  const pts = isleCoast(id);
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
/* ===========================================================================
   COASTLINE RESOLUTION.

   The coastline is the most-looked-at line in the diorama and it was 128 points on Corniche —
   a 23 metre segment, with Al Maryah and Saadiyat at 31. The palm crowns are 7 metres across, so
   the shore was faceted at four times the size of the trees standing on it, and every render
   since the beginning has shown a polygon where a beach should be.

   getSpacedPoints(180) did not help and could not: isleShape builds the outline with lineTo over
   the Chaikin points, so the Shape is a POLYLINE. Resampling a polyline at 180 points only inserts
   collinear points along segments that were already straight. The number 180 has been buying
   nothing for a long time.

   INTERPOLATION, NOT MORE SMOOTHING. The obvious fix — more Chaikin passes — is wrong: Chaikin
   APPROXIMATES, cutting corners on each pass, so every pass shrinks the island and rounds off the
   west tip at the Breakwater, which is one of the three features the shape exists to carry. A
   closed centripetal Catmull-Rom passes THROUGH every existing point instead, so the shape is
   preserved exactly and only its resolution changes. Measured: enclosed area moves by 0.06 to
   0.15 per cent, and the maximum distance from any original control point to the new polyline is
   0.03 units. It is the same coastline, drawn smoothly.

   CENTRIPETAL rather than uniform parameterisation. Uniform Catmull-Rom overshoots and can loop
   where consecutive segment lengths differ sharply — which is exactly the Al Bateen creek, a
   tight inlet sitting next to a long straight run of Corniche.

   ONE OUTLINE STILL. It would be cheaper to give the geometry a fine curve and leave the
   inside-test on the coarse one, and that is precisely the bug this file already fixed once: two
   different coastlines, with buildings passing a test against a shape that was not being drawn.
   The analysis cost is a point-in-polygon per fabric cell, which is load-time and measured in
   milliseconds; the divergence would be permanent. Same points for both.

   THE COUNT IS DERIVED, per the rule that has governed shoreline modules and repeat counts since
   the beginning: perimeter divided by the target segment. COAST_SEG_M is the one number to move. */
const COAST_SEG_M = 6;                  // metres of coastline per segment
const GROUND_W    = 896;                // ground canvas width in pixels; see paintGround

function closedSpline(pts, n){
  const N = pts.length;
  const P = i => pts[((i % N) + N) % N];
  const at = (i, t) => {
    const p0 = P(i-1), p1 = P(i), p2 = P(i+1), p3 = P(i+2);
    const d = (a, b) => Math.sqrt(Math.hypot(b[0]-a[0], b[1]-a[1])) || 1e-6;   // alpha 0.5
    const t0 = 0, t1 = t0 + d(p0,p1), t2 = t1 + d(p1,p2), t3 = t2 + d(p2,p3);
    const tt = t1 + (t2 - t1) * t;
    const lerp = (a, b, ta, tb) => {
      const k = (tb - tt) / (tb - ta), m = (tt - ta) / (tb - ta);
      return [a[0]*k + b[0]*m, a[1]*k + b[1]*m];
    };
    const A1 = lerp(p0,p1,t0,t1), A2 = lerp(p1,p2,t1,t2), A3 = lerp(p2,p3,t2,t3);
    return lerp(lerp(A1,A2,t0,t2), lerp(A2,A3,t1,t3), t1, t2);
  };
  // Arc-length table, so the output is evenly spaced round the whole loop rather than evenly
  // spaced within each source segment — the same distinction getSpacedPoints exists for.
  const sub = 8, table = [];
  let acc = 0;
  for (let i = 0; i < N; i++){
    let prev = at(i, 0);
    for (let k = 1; k <= sub; k++){
      const q = at(i, k/sub);
      acc += Math.hypot(q[0]-prev[0], q[1]-prev[1]);
      table.push({ len:acc, i, t:k/sub });
      prev = q;
    }
  }
  const out = [];
  let k = 0;
  for (let j = 0; j < n; j++){
    const want = acc * j / n;
    while (k < table.length - 1 && table[k].len < want) k++;
    out.push(at(table[k].i, table[k].t));
  }
  return out;
}

const coastCache = new Map();
function isleCoast(id){
  let c = coastCache.get(id);
  if (!c){
    const sm = isleSmooth(id);
    let per = 0;
    for (let i = 0; i < sm.length; i++){
      const a = sm[i], b = sm[(i+1) % sm.length];
      per += Math.hypot(b[0]-a[0], b[1]-a[1]);
    }
    /* per is in normalised island-radius units, so it has to be scaled by THIS island's radius
       to become a real length — a normalised perimeter says nothing about how long the shore is.
       DISTRICTS is declared further down the file; that is fine because this runs at build time,
       not at module evaluation, and the fallback covers an id that is not a district at all. */
    const R = (DISTRICTS.find(x => x.id === id) || {}).r || 60;
    /* CAPPED, AND v78 HUNG FOR WANT OF THIS. The formula asks for one sample every six metres,
       which was 96 points on a drawn island of 1.2 km and becomes about twelve thousand on a real
       coastline of nineteen. Every one of those is a segment that insideIsle and distToOutline
       scan per plot candidate, and the fabric now offers hundreds of thousands of candidates.

       2,400 points on Corniche is one sample every eight metres — finer than the two-metre
       simplification the bake already applied is worth at 7.8 metres to the unit, and the cap
       only ever bites on the largest island. */
    const n = Math.min(2400, Math.max(96, Math.ceil(per * R * 7.8 / COAST_SEG_M)));
    c = closedSpline(sm, n);
    /* THE CLOSING DUPLICATE, AND v54 DROPPED IT.

       getSpacedPoints returns divisions + 1 points with the last equal to the first, and half
       this file is written against that contract: `const n = o.length - 1` appears at the beach
       ring, the road inset, the ground painter and the shore placement, every one of them
       meaning "the number of SEGMENTS". closedSpline returns n DISTINCT points, so every one of
       those consumers silently started dropping the last real point and closing the ring a
       segment short — a 0.95-unit chord across the join, which is 7.4 metres of coastline that
       simply is not there.

       Appending the duplicate restores the contract rather than editing five call sites to a new
       one. It is also the safer direction: a consumer written against either convention behaves
       correctly on a closed array, and none of them has to be found. */
    c.push(c[0]);
    coastCache.set(id, c);
  }
  return c;
}

const outlineCache = new Map();
function isleOutline(id){
  let o = outlineCache.get(id);
  if (!o){ o = isleCoast(id).map(p => ({ x:p[0], y:p[1] })); outlineCache.set(id, o); }
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
/* A UNIFORM GRID OVER THE COASTLINE, because both tests below are called per plot candidate and
   both were linear in the number of coastline segments.

   v78 made that arithmetic fatal. The block loop is sized by reach / superblock in normalised
   units, so growing the island radius from 190 to 1,220 took KU from about 11 to 69 — roughly
   five hundred times the plot candidates — while the outline went from 96 segments to thousands.
   Half a billion segment tests, and the tab stopped responding. The old numbers hid a cost that
   was always quadratic; the real ones do not.

   The grid is built once per island, keyed on the same closed outline both tests already used, so
   it cannot describe a different shape from the one being drawn — which is the fault this file
   has paid for before. Cell size targets a handful of segments per cell; queries touch a ring of
   cells rather than the whole coast.

   insideIsle stays an exact crossing count. Only segments whose y range spans the test row can
   contribute a crossing, so the grid is indexed by ROW for it and by cell for distance. Same
   segments, two indexes, one build. */
const gridCache = new Map();
function isleGridOf(id){
  let g = gridCache.get(id);
  if (g) return g;
  /* Timed here rather than by the wrapper, so only the build is measured. See the note where the
     stages are wrapped for why this one cannot go through timed(). */
  const _t = performance.now();
  const pts = outlineClosed(id);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const n = pts.length - 1;
  /* Aim for about four segments a cell. Fewer and the grid itself dominates; more and the query
     degenerates towards the linear scan it replaced. */
  const nc   = Math.max(8, Math.min(160, Math.round(Math.sqrt(n / 4))));
  const cw   = (x1 - x0) / nc || 1, ch = (y1 - y0) / nc || 1;
  const cells = new Array(nc * nc);
  const rows  = new Array(nc);
  const put = (arr, k, v) => { (arr[k] || (arr[k] = [])).push(v); };
  const ci = v => v < 0 ? 0 : v >= nc ? nc - 1 : v;

  for (let i = 0; i < n; i++){
    const ax = pts[i][0], ay = pts[i][1], bx = pts[i+1][0], by = pts[i+1][1];
    const gx0 = ci(Math.floor((Math.min(ax, bx) - x0) / cw));
    const gx1 = ci(Math.floor((Math.max(ax, bx) - x0) / cw));
    const gy0 = ci(Math.floor((Math.min(ay, by) - y0) / ch));
    const gy1 = ci(Math.floor((Math.max(ay, by) - y0) / ch));
    for (let gy = gy0; gy <= gy1; gy++){
      put(rows, gy, i);
      for (let gx = gx0; gx <= gx1; gx++) put(cells, gy * nc + gx, i);
    }
  }
  g = { pts, n, x0, y0, cw, ch, nc, cells, rows };
  gridCache.set(id, g);
  PERF.isleGridOf = (PERF.isleGridOf || 0) + (performance.now() - _t);
  PERF['#isleGridOf'] = (PERF['#isleGridOf'] || 0) + 1;
  return g;
}

function insideIsle(id, nx, ny){
  const g = isleGridOf(id);
  const gy = Math.floor((ny - g.y0) / g.ch);
  if (gy < 0 || gy >= g.nc) return false;          // outside the bounding box entirely
  const list = g.rows[gy];
  if (!list) return false;
  const P = g.pts;
  let inside = false;
  for (let k = 0; k < list.length; k++){
    const i = list[k];
    const xi = P[i][0], yi = P[i][1], xj = P[i+1][0], yj = P[i+1][1];
    if (((yi > ny) !== (yj > ny)) && (nx < (xj - xi) * (ny - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* Distance to the coast, searched outward one ring of cells at a time. The loop stops as soon as
   the best distance found is closer than the nearest unexamined ring can possibly be, so a point
   well inland examines a handful of cells and a point near the shore examines nine. */
function distToOutlineFast(id, x, y){
  const g = isleGridOf(id), P = g.pts;
  const cx = Math.floor((x - g.x0) / g.cw), cy = Math.floor((y - g.y0) / g.ch);
  const step = Math.min(g.cw, g.ch);
  let best = Infinity;
  for (let ring = 0; ring < g.nc; ring++){
    /* Everything in this ring is at least (ring-1) cells away, so once best beats that no further
       ring can improve it. */
    if (best < (ring - 1) * step) break;
    for (let gy = cy - ring; gy <= cy + ring; gy++){
      if (gy < 0 || gy >= g.nc) continue;
      for (let gx = cx - ring; gx <= cx + ring; gx++){
        if (gx < 0 || gx >= g.nc) continue;
        // Only the perimeter of the ring is new.
        if (ring > 0 && Math.abs(gy - cy) !== ring && Math.abs(gx - cx) !== ring) continue;
        const list = g.cells[gy * g.nc + gx];
        if (!list) continue;
        for (let k = 0; k < list.length; k++){
          const i = list[k];
          const ax = P[i][0], ay = P[i][1];
          const dx = P[i+1][0] - ax, dy = P[i+1][1] - ay;
          const L2 = dx*dx + dy*dy;
          let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + t*dx - x, py = ay + t*dy - y;
          const d = Math.sqrt(px*px + py*py);
          if (d < best) best = d;
        }
      }
    }
  }
  return best;
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
function distToOutline(id, x, y){ return distToOutlineFast(id, x, y); }

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

// RING_INSET is now derived per district from RING_INSET_M; see ringInset().
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
  /* THE CYCLE TRACK IS RED-BROWN, and that colour is doing recognition work rather than decoration:
     coloured surfacing is how a segregated track is distinguished from a footway everywhere it is
     built, and on the Corniche it is the strongest single line of colour on the island. Warm enough
     to read against grey tarmac and pale paving, dark enough not to compete with the lit windows. */
  cycle:    '#8A5340',
  foot:     '#CFC7B2',          // a shade under the plot paving, so a footway is not a forecourt
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
/* ROAD WIDTHS IN METRES, AND THIS WAS THE ROOT OF THE LAYOUT PROBLEM.

   These were normalised fractions of the island radius — 0.052 and 0.044 — which means the same
   street came out 31 metres wide on Corniche and 19 on Al Maryah, purely because one island is
   bigger than the other. Roads do not work that way; a dual carriageway is a dual carriageway.

   Worse, it made the island unfixable by scaling. Enlarging an island to hold a proper downtown
   widened its roads in exact step, so the block-to-street ratio never moved and not one extra
   block fitted. Every other quantity in this file that means something physical — storey height,
   bay width, superblock, plot depth, coastline segment — is already held in metres, and the roads
   were the last thing still expressed as a share of an island. */
const M_PER_UNIT  = 7.8;                     // the scene's one scale constant
/* ROAD_LOCAL_M is new. 10 metres is a two-way residential street with no parking lane — narrow
   enough that a block of them reads as a grain rather than as a field of tarmac, wide enough to
   survive the kerb casing at district range. */
const ROAD_RING_M = 31, ROAD_MAJOR_M = 28, ROAD_ART_M = 18, ROAD_LOCAL_M = 10;

/* THE ROUNDABOUT, AND I GOT THIS ONE WRONG IN v60. Converting the roads to metres, I read the old
   `CORE_R = 0.040 * 1.18` as though it were already a metre figure and wrote 118. It is normalised:
   at the old r=76 it was a 28-metre kerb radius, which is a large but real roundabout. 118 metres
   is a 236-metre circle, and with the island then scaled to r=190 the painter's own `U * 0.040`
   grew to a 59-metre carriageway on top of it — which is the necklace of enormous discs round the
   coastal park.

   Both figures are now the one number in metres. 24 m of carriageway inside a 28 m kerb is what
   the original produced at the original scale, so this restores a shape that was right rather than
   inventing a new one. */
const ROUNDABOUT_M = 24;
const CORE_R_M     = ROUNDABOUT_M * 1.18;
const roadW = (d, m) => m / (M_PER_UNIT * d.r);      // metres -> normalised, per district
const COAST_CLEAR = 0.050;                   // no building closer than this to the waterline
/* THE BEACH WIDTH, HOISTED, because three things have to agree about it: the skirt geometry, the
   plan handed to the prop kit so boats do not moor on dry sand, and the spacing of the islands
   themselves. */
/* THE SEAFRONT, IN METRES — the last three quantities still expressed as a share of an island.

   BEACH_W is in WORLD units and RING_INSET and COAST_PARK_IN are NORMALISED, so scaling the
   islands 2.5x in v60 grew the park and the setback while leaving the sand exactly where it was.
   Measured on Corniche: a 94 m beach that did not move, a park that went 23 m to 56, and a ring
   setback that went 50 m to 126. That is why the green band now reads as a golf course and why
   there is a long empty walk between the buildings and the water.

   All three in metres, at the figures the real Corniche actually has: a wide public beach, a
   generous but walkable park, and a seafront road close enough to the sand that the two read as
   one promenade. */
const BEACH_M       = 90;
const COAST_PARK_M  = 46;
const RING_INSET_M  = 78;

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

/* THE LANDMARK SKIRT, and why the avoid rectangle could never have done this job.

   A reservation is binary: inside it nothing is built, outside it the fabric runs at the full
   district cap. Around a TALL landmark that is enough — ADNOC is 44 units and Etihad's shortest
   tower is 21.8, so a 26-unit neighbour standing at the rectangle's edge still reads as fabric.
   Around a LOW one it is not. Emirates Palace is 6.5 units, and v74 put the district cap at 26
   with the falloff at the palace's own position measuring 0.38 — so the stock immediately outside
   its reservation runs from 6.3 to 18.6 units. Three times the height of the building it is meant
   to be framing, standing three units from its wall.

   v74's note argued the falloff was already protecting the palace and shrank the rectangle from
   62 to 36 on that basis. The falloff reaches zero at dc 0.9; the palace sits at 0.65. It was
   never protected — the wide rectangle had been doing the work, and removing it removed the only
   thing holding the towers off.

   The fix is a RAMP rather than a bigger hole. Inside r0 the cap is the landmark's own scale;
   from r0 to r1 it smoothsteps back to the district cap. The fabric stays continuous — no bald
   third of the island, which is the fault the v74 note was right about — and the skyline profile
   comes out as the place actually reads: low around the palace, rising eastward into Etihad and
   on to ADNOC. Distances are world units in the table and normalised here, like every other
   building-sized figure in this file.

   IT CANNOT MOVE THE RANDOM STREAM. capH enters buildingSpec through one Math.min below the
   unconditional draw block, so a per-cell cap changes heights and nothing else. Mass and detail
   both go through urbanFabric, both compute it from position alone, and the two layers stay the
   same city. */
function lowRiseN(d){
  if (!d._lowRiseN){
    d._lowRiseN = (d.lowRise || []).map(l => ({
      x: l.x / d.r, y: -l.z / d.r, r0: l.r0 / d.r, r1: l.r1 / d.r, h: l.h,
    }));
  }
  return d._lowRiseN;
}
function cellCap(d, nx, ny, cap){
  const Z = lowRiseN(d);
  /* Infinity, not cap, because this is now a soft target multiplied into the height rather than a
     ceiling handed to Math.min. Returning cap here would scale every plot on every island by the
     roll a second time and halve the skyline. */
  if (!Z.length) return Infinity;
  let c = Infinity;
  for (let i = 0; i < Z.length; i++){
    const l = Z[i];
    const dd = Math.hypot(nx - l.x, ny - l.y);
    if (dd >= l.r1) continue;
    const t = dd <= l.r0 ? 0 : (dd - l.r0) / (l.r1 - l.r0);
    c = Math.min(c, l.h + (cap - l.h) * (t * t * (3 - 2 * t)));
  }
  return c;
}

function roadSkeleton(d){
  const rndPlan = localRnd(hashId(d.id));
  const outline = isleOutline(d.id);
  const core    = d.coreN || [0, 0];
  const inside  = (nx, ny) => insideIsle(d.id, nx, ny);

  const ring = insetRing(d.id, roadW(d, RING_INSET_M));  // an ARRAY of open runs, not one closed loop

  /* ===========================================================================
     THE SUPERBLOCK GRID.

     Three curved arterials radiating from a core is a European market town, not Abu Dhabi. The
     island's downtown is one of the most rigid orthogonal plans anywhere: a grid of superblocks
     bounded by numbered streets, held at a constant angle across the whole island, running
     parallel and perpendicular to the Corniche. That grid IS the recognition — more than any
     single tower, it is what an aerial photograph of Abu Dhabi looks like.

     It also fixes the fault underneath the last four rounds of layout work. The old fabric laid a
     lattice over the whole island and DELETED the cells that hit a road. That is collision
     avoidance, not town planning: nothing fronts a street, nothing aligns to one, and a block is
     bounded by wherever the lattice happened to survive rather than by the roads around it. Once
     the streets are generated first and the buildings derived from the space between them, the
     roads become the structure instead of a painted decoration threaded through a field of
     towers.

     STRAIGHT LINES, CLIPPED TO THE ISLAND. Each street is one family member swept across the
     island and cut wherever it leaves land or enters a reserved band. A line that survives in two
     separate pieces is returned as two runs, which is correct — that is a street interrupted by a
     palace, and the painter and onRoad both already take an array of open runs.

     ANGLE. Taken from the district's own rot so the grid sits with the island rather than with
     the world axes, which is what keeps the blocks parallel to the Corniche.
     =========================================================================== */
  const arterials = [];
  const crossings = [];
  const ringJunctions = [];
  const gridRefs = [];
  {
    const th = (d.gridRot !== undefined ? d.gridRot : d.rot || 0);
    const ca = Math.cos(th), sa = Math.sin(th);
    // Normalised grid pitches. SB is the superblock centre-to-centre spacing.
    /* THE SUPERBLOCK IS THE STREET GRID, so roads and plots move together or the fabric ends up
       laid across carriageways. Same lookup in urbanFabric below. */
    const _sbR = d.sb || (DIS ? DIS.fabricFor(d.id).sb : SUPERBLOCK_M);
    const su = roadW(d, _sbR[0]);
    const sv = roadW(d, _sbR[1]);

    /* Sweep far enough to cross the island whatever the angle: the half-diagonal of the
       normalised bounding box, rounded out to a whole number of pitches so the grid is
       symmetric about the core rather than about an arbitrary edge. */
    const reach = 1.45;
    /* A GRID STREET STOPS AT THE RING ROAD. It was clipped at RING_INSET * 0.55, which is 69 metres
       in from the coast against a ring whose inner kerb is at 145 — so every street crossed the
       Corniche, ran seventy-five metres across the coastal park and stopped in the sand. A street
       that crosses the seafront road and then simply ends is the most obviously wrong thing in an
       aerial view, because no city has ever built one.

       The terminus is the ring's inner kerb, derived from the ring's own width rather than from a
       fraction of the inset — the two are different quantities and only one of them is a road. */
    const stopAt = roadW(d, RING_INSET_M) + roadW(d, ROAD_RING_M) * 0.5 * ROAD_KERB;
    const line = (fixed, along, horiz, major) => {
      // Walk the line in small steps, emitting runs of consecutive points that are on land.
      const runs = [];
      let cur = [];
      const N = 220;
      for (let i = 0; i <= N; i++){
        const t = -reach + 2 * reach * i / N;
        const u = horiz ? t : fixed, v = horiz ? fixed : t;
        const x = core[0] + u * ca - v * sa;
        const y = core[1] + u * sa + v * ca;
        const ok = inside(x, y) && distToOutline(d.id, x, y) > stopAt
                   && !inAvoid(d, x, y, 0.012);
        if (ok) cur.push([x, y]);
        else { if (cur.length > 3) runs.push(cur); cur = []; }
      }
      if (cur.length > 3) runs.push(cur);
      /* A property on the array rather than a parallel structure: every consumer of `arterials`
         already takes a list of point runs, and a fourth return value would have to be threaded
         through the painter, onRoad and the props placer to reach the two places that want it. */
      runs.forEach(r => { r.major = major; arterials.push(r); });

      /* GRID REFERENCES. A label at each end of every major line, just outside the coast, so any
         point on the island can be named as the pair of majors it lies between — "Corniche C4".

         This exists because identifying a spot from a screenshot has cost several rounds: a pale
         slab near ADNOC, buildings apparently over a road, arrowheads on the ring. Each time the
         answer was findable but only after guessing which object was meant. Letters on one family
         and numbers on the other turn "that thing there" into a coordinate, and because the letter
         IS the grid index the label maps straight back to the (a, b) loop that generated the
         block. */
      if (major && runs.length){
        const lab = horiz ? String(Math.round(fixed / sv) + 6)
                          : String.fromCharCode(65 + Math.round(fixed / su) + 6);
        [[runs[0], 0], [runs[runs.length - 1], -1]].forEach(([r, at]) => {
          const p = at === 0 ? r[0] : r[r.length - 1];
          const q = at === 0 ? r[Math.min(4, r.length - 1)] : r[Math.max(0, r.length - 5)];
          // Pushed outward along the line so the label sits off the land, not on the fabric.
          const dx = p[0] - q[0], dy = p[1] - q[1], L = Math.hypot(dx, dy) || 1;
          gridRefs.push({ x: p[0] + dx / L * 0.085, y: p[1] + dy / L * 0.085, label: lab });
        });
      }
    };
    /* STREET HIERARCHY. Every third line is a major, which at this block size puts a dual
       carriageway roughly every 600 metres — the spacing of Abu Dhabi's numbered main streets
       against its side streets. Without a hierarchy a grid reads as graph paper: thirty-five
       identical lines carry no information about how the city is used. */
    for (let k = -Math.ceil(reach / sv); k <= Math.ceil(reach / sv); k++) line(k * sv, 0, true,  k % 3 === 0);
    for (let k = -Math.ceil(reach / su); k <= Math.ceil(reach / su); k++) line(k * su, 0, false, k % 3 === 0);

    /* THE CROSSINGS, TAKEN FROM THE LATTICE RATHER THAN SEARCHED FOR. The grid is orthogonal in
       (u, v), so every street intersection is at a known pair of indices — there is no reason to
       run thirty-five polylines against each other looking for what the construction already
       knows. Each carries the grid angle and whether both arms are majors, which is what decides
       how a junction is marked. */
    /* THE RING JUNCTIONS, ADDED TO THE SAME LIST. A major street meeting the Corniche is a formal
       signalised crossroads and has to be marked and signalled like one — but it is not a lattice
       intersection, so the (a, b) loop below never saw it and every one of them was getting a
       give-way bar and no hardware.

       Only the majors. A minor street meeting the ring gets a slip lane instead, which is the
       whole point of the distinction: side streets MERGE onto a seafront road, they do not stop
       at it. */
    /* BOTH ENDS OF EVERY RUN, AND ONLY IF IT REALLY REACHES THE RING.

       A street crosses the island, so a major line meets the Corniche TWICE — and this only ever
       looked at r[length - 1]. Measured: 30 ends were being handled and 31 were not, so almost
       exactly half of every dual carriageway arrived at the seafront with no junction, no signals
       and no markings at all. That is the asymmetry in the renders.

       And the far end is not always the ring. A run cut short by the palace or the Etihad plaza
       ends in the middle of the island, and taking its last point on faith planted 3 fully
       signalised junctions in open ground. Both ends are now tested against the ring's actual
       distance, so an end that is not a junction is not treated as one. */
    const ringDistN = p => {
      let b = Infinity;
      ring.forEach(run => { for (let i = 0; i < run.length - 1; i++)
        b = Math.min(b, distToPolyline(p[0], p[1], [run[i], run[i+1]])); });
      return b;
    };
    const RING_END = roadW(d, ROAD_RING_M) * 0.5 * ROAD_KERB + roadW(d, 22);
    const ends = [];
    arterials.filter(r => r.major).forEach(r => {
      if (ringDistN(r[r.length - 1]) <= RING_END) ends.push(r[r.length - 1]);
      if (ringDistN(r[0])               <= RING_END) ends.push(r[0]);
    });
    ringJunctions.push(...ends.map(e => {
      /* TWO AXES, NOT FOUR ARMS AT NINETY DEGREES. A lattice crossing is two streets at the grid
         angle, so one number describes it. A ring junction is a grid street meeting a CURVE, and
         the ring's local tangent has nothing to do with the grid — assuming a right angle there
         would put two of the four zebras and two of the four signal heads out over the water.
         Every crossing therefore carries th and th2, and a lattice crossing simply has
         th2 = th + 90. */
      let bd = Infinity, tp = null, tn = null;
      ring.forEach(run => {
        for (let i = 0; i < run.length - 1; i++){
          const dx = run[i][0] - e[0], dy = run[i][1] - e[1], dd = dx*dx + dy*dy;
          if (dd < bd){ bd = dd; tp = run[i]; tn = run[i+1]; }
        }
      });
      const th2 = tp && tn ? Math.atan2(tn[1] - tp[1], tn[0] - tp[0]) : th + Math.PI / 2;
      return { x:e[0], y:e[1], th, th2, major:true, ring:true };
    }));

    for (let a = -Math.ceil(reach / su); a <= Math.ceil(reach / su); a++){
      for (let b = -Math.ceil(reach / sv); b <= Math.ceil(reach / sv); b++){
        const u = a * su, v = b * sv;
        const x = core[0] + u * ca - v * sa, y = core[1] + u * sa + v * ca;
        if (!inside(x, y)) continue;
        if (distToOutline(d.id, x, y) < stopAt) continue;
        if (inAvoid(d, x, y, 0.012)) continue;
        /* BOTH arms, not either. A signal goes where two main roads meet; a main road crossing a
           side street is a give-way, and every junction in the city being signalised is the same
           kind of over-application as the necklace of roundabouts. Either-arm flagged 146 of 270
           crossings; both-arms gives 30, which is a main-road grid every 600 metres crossing
           another one — the real spacing. */
        crossings.push({ x, y, th, th2: th + Math.PI / 2,
                         major: (a % 3 === 0) && (b % 3 === 0) });
      }
    }
  }
  return { ring, arterials, crossings: crossings.concat(ringJunctions), gridRefs, core, rndPlan };
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

/* THE SUPERBLOCK, IN METRES, because that is the only unit in which it means anything. Abu Dhabi's
   downtown blocks run roughly 200 by 130 metres between street centrelines, and holding that in
   metres rather than in normalised island units is what makes the grain the same on a 76-unit
   island and a 46-unit one. Al Maryah with Corniche's normalised pitch would have blocks two
   thirds the size for no reason other than being a smaller island. */
const SUPERBLOCK_M = [200, 130];

/* THE PLOT, ALSO IN METRES. A 30 to 46 metre frontage on a 34 metre depth is a Gulf tower plot —
   deep enough for a floorplate, narrow enough that a block edge carries five or six buildings
   rather than one slab. PAVEMENT_M is the setback from the kerb: it is what stops a tower growing
   out of the tarmac, and it is added to the same ROAD_ART clearance figure onRoad tests against,
   so the two cannot drift apart. */
const PLOT_FRONT_M = [30, 46];
const PLOT_DEPTH_M = 34;
const PAVEMENT_M   = 9;
const coreR = d => roadW(d, CORE_R_M);       // roundabout outer kerb, matching the painter

/* ---------- THE ROAD TEST, INDEXED ------------------------------------------------------------

   MEASURED, NOT SUSPECTED. A performance trace of the load put distToPolyline at 46.8 per cent of
   a 6.1 second task and 66.1 per cent of a 4.6 second one — the two longest main-thread tasks in
   the whole recording. Both are urbanFabric, and it reaches distToPolyline through onRoad.

   The old test walked every ring segment and every arterial for every candidate plot, and walked
   every point of each polyline computing an exact minimum distance — when the only question ever
   asked is "is anything closer than this threshold". Plots times roads times points, with no index
   and no early exit, on an island 19 km across.

   So the segments go in a uniform grid once, each stored with the clearance it needs, and each
   binned into every cell its clearance region touches. A query then looks at the cells within pad
   of the point and stops at the first hit. Same answer, and the honest reason it is the same answer
   is that a segment whose clearance region can reach the query point is guaranteed to be in one of
   the bins that region covers — the expansion happens at insert time, not at query time.

   Built lazily and cached on d.roads, because it is only ever asked for by the fabric and an island
   that never runs the fabric should not pay for it. R.arterials is the GENERATED skeleton and is
   written once at build; drawArterials, the real network, is a different field this never sees. */
function roadGrid(d){
  const R = d.roads;
  if (R._grid) return R._grid;
  const segs = [];
  const push = (pts, clear) => {
    for (let i = 0; i < pts.length - 1; i++)
      segs.push([pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1], clear]);
  };
  /* THE REAL NETWORK, WHERE THERE IS ONE. This index used to see only the generated skeleton —
     the comment above still records that as a fact and it was one — while the PAINTER at
     paintGround took drawRing/drawArterials, the imported Overture centrelines. Two street systems:
     one drawn, one deciding where buildings stand, with nothing making them agree.

     That is the whole misalignment. Generated stock landed in real streets and real footprints
     landed across generated blocks, and cullFabric's 14 m radius was a fudge for it rather than a
     fix. Buildings placed against the same centrelines that get drawn need no fudge, and the
     Overture footprints were surveyed against those streets in the first place.

     Fallback, not replacement: an island with no imported network keeps the generated skeleton and
     behaves exactly as before. Corniche ships 10,664 segments and Yas 2,526; an island with none
     falls through to R.ring / R.arterials untouched. */
  const ringClear = roadW(d, ROAD_RING_M) * 0.5 * ROAD_KERB;
  const useRing = (R.drawRing && R.drawRing.length) ? R.drawRing : (R.ring || []);
  const useArts = (R.drawArterials && R.drawArterials.length) ? R.drawArterials
                                                              : (R.arterials || []);
  for (const r of useRing) push(r, ringClear);
  for (const a of useArts)
    push(a, roadW(d, a.major ? ROAD_MAJOR_M : ROAD_ART_M) * 0.5 * ROAD_KERB);

  let maxClear = 0;
  for (const s of segs) if (s[4] > maxClear) maxClear = s[4];
  /* Cell size against the widest clearance rather than a constant. Too small and a wide road is
     inserted into hundreds of bins; too large and every query scans half the island. */
  const cell = Math.max(maxClear * 2, 0.01);
  const bins = new Map();
  for (let k = 0; k < segs.length; k++){
    const s = segs[k], c = s[4];
    const i0 = Math.floor((Math.min(s[0], s[2]) - c) / cell), i1 = Math.floor((Math.max(s[0], s[2]) + c) / cell);
    const j0 = Math.floor((Math.min(s[1], s[3]) - c) / cell), j1 = Math.floor((Math.max(s[1], s[3]) + c) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++){
      const key = i * 73856093 ^ j * 19349663;
      let b = bins.get(key);
      if (!b) bins.set(key, b = []);
      b.push(k);
    }
  }
  return (R._grid = { segs, cell, bins });
}

function onRoad(d, x, y, pitch){
  const R = d.roads;
  if (!R) return false;
  const pad = pitch * 0.62;
  const g = roadGrid(d);
  const { segs, cell, bins } = g;
  const i0 = Math.floor((x - pad) / cell), i1 = Math.floor((x + pad) / cell);
  const j0 = Math.floor((y - pad) / cell), j1 = Math.floor((y + pad) / cell);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++){
    const b = bins.get(i * 73856093 ^ j * 19349663);
    if (!b) continue;
    for (let n = 0; n < b.length; n++){
      const s = segs[b[n]];
      const ax = s[0], ay = s[1], dx = s[2] - ax, dy = s[3] - ay;
      const L2 = dx*dx + dy*dy;
      let t = L2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t*dx - x, py = ay + t*dy - y;
      const lim = s[4] + pad;
      /* Squared, so the inner loop never calls sqrt. It runs tens of millions of times. */
      if (px*px + py*py < lim*lim) return true;
    }
  }
  if (R.core && Math.hypot(x - R.core[0], y - R.core[1]) < coreR(d) + pad) return true;
  return false;
}

function groundPlan(d, cells, blocks){
  const seed     = hashId(d.id);
  const rndPlan  = localRnd(seed ^ 0x2545F491);
  const outline  = isleOutline(d.id);
  const inside   = (nx, ny) => insideIsle(d.id, nx, ny);
  const N        = outline.length;
  /* The painter takes the real network when there is one; d.roads.ring and .arterials stay as the
     generated skeleton the fabric was built against. See the note where drawArterials is set. */
  const ring      = d.roads.drawRing      || d.roads.ring;
  const arterials = d.roads.drawArterials || d.roads.arterials;
  const { core } = d.roads;

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
      /* PLATTED GROUND IS NOT PARKLAND, and this line is why the vacancy mask can ship at all.
         The lawn filler greens ground the generator could not describe, and it reads a cleared
         plot as exactly that — Saadiyat at 0.35 would come back two thirds lawn. */
      if (VAC_ON && DIS && DIS.vacantAt(d.id, nx, ny)) continue;
      if (distToOutline(d.id, nx, ny) < 0.045) continue;   // real margin, not a radial scale
      if (inPatch(nx, ny)) continue;
      // A lawn's own half-size is its clearance; there is no lattice pitch to borrow any more.
      if (onRoad(d, nx, ny, q * 1.6)) continue;    // no lawns in the carriageway either
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
    for (let i = a; i <= b; i++) coastLine.push(inwardAt(d.id, outline, i, roadW(d, COAST_PARK_M)));
  }

  return {
    outline, core, inside, ring, arterials, crossings:d.roads.crossings, parks, coastLine, cells, blocks,
    parkN: parks.length,     // on the overlay: the lawn-flood detector for ?vac
    beachN: roadW(d, BEACH_M),
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
  /* GROUND_W IS THE EXPERIMENT. compileAsync came back at 26 ms, so the ten seconds before the
     first frame is not shader compilation — it is upload, and the five ground canvases are about
     ten of the scene's seventeen megapixels. Each is a canvas-backed texture, which on Android
     Chrome is the slowest kind there is: rasterise, transfer, then generate a full mip chain.

     896 halves the pixels. If the first frame drops by several seconds this is confirmed and the
     number becomes a real setting to tune against legibility; if it does not, the cost is the
     other 320 textures and this goes back to 1536, where four rounds of legibility work put it. */
  const h  = isleHalf(d.id);
  /* THE CANVAS IS SIZED BY GROUND RESOLUTION, NOT BY A CONSTANT.

     GROUND_W was 896 pixels for every island. Al Maryah is 2.4 km across, so that is 2.7 metres to
     the pixel and a road is a road. Corniche is 19 km across, so it is 21 metres to the pixel — and
     a 31 m carriageway paints 1.46 pixels wide, a 28 m major 1.32, an 18 m arterial 0.85 and a 10 m
     street 0.47. strokePx floors at 0.8, so on the one island that matters most every class came out
     as the same one-pixel hairline. Four road widths, one line.

     That is why the street network has always looked right on the small islands and absent on the
     big one, and why adding 6,217 local streets greyed the ground instead of drawing a city.

     Six metres to the pixel is the target: enough that a 10 m street is a couple of pixels and a
     dual carriageway has a median you can see. Clamped at both ends — 896 because below it the
     small islands gain nothing from a canvas finer than their own coastline, 3072 because Corniche
     would otherwise ask for 3172 and each step costs memory as the square. At 3072 Corniche paints
     at 6.2 m to the pixel: ring 5.0, major 4.5, minor 2.9, local 1.6. */
  /* ?gpx=N — the ground resolution target, in metres per pixel, from the URL.

     It is here because the cost of this number is not measurable from inside the code that sets it.
     Raising the canvas to 3072 took firstFrame from about 12 seconds to 23, and NONE of that shows
     in the phase list: paintGround is 157 ms, upload 81, and the stages together account for under
     five seconds of the twenty-three. The rest is texture creation and mipmap generation on an
     eight megapixel canvas, happening inside the browser where this file cannot instrument it.

     So the only honest way to find the knee is to try values and read firstFrame, and doing that
     as a deploy per attempt is three minutes a data point. From the URL it is a reload.

     Six is the default because it is what the road widths were tuned against. But the cartographic
     floors in MIN_PX mean resolution no longer decides whether a road is VISIBLE — only how fine
     the ground grain is — so a coarser canvas now costs much less than it did an hour ago. Ten
     would put Corniche at about 1850 pixels and a third of the texture. */
  const TARGET_M_PER_PX = (() => {
    const m = typeof location !== 'undefined' && location.search.match(/[?&]gpx=(\d+(?:\.\d+)?)/);
    const v = m ? parseFloat(m[1]) : 6;
    return isFinite(v) && v >= 2 && v <= 40 ? v : 6;
  })();
  const spanM = 2 * d.r * M_PER_UNIT * h.x * GROUND_PAD;
  const W  = d.r >= 50 ? Math.min(3072, Math.max(GROUND_W, Math.round(spanM / TARGET_M_PER_PX)))
                       : 768;
  const H  = Math.max(64, Math.round(W * h.y / h.x));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  /* CPU-BACKED, AND THIS IS WHERE THE TWENTY-ONE SECONDS WAS.

     fl_world0 — a render with world hidden AND the sky dome hidden, drawing literally nothing —
     cost 21,041 ms, while the very next render with the dome in it cost 1 ms. So the cost is not a
     draw, not geometry, not a texture any draw samples. It is a GPU synchronisation that the first
     render call after buildWorld forces, paying for something allocated outside the scene graph.

     A 2D canvas is GPU-backed by default. buildWorld makes about 8 Mpx of them, the GPU process
     queues a surface for each, and the next WebGL sync drains the lot. That fits every reading:
     independent of what is drawn, independent of visibility, and it explains the old result that
     cutting ground texture from 9 Mpx to 2 moved firstFrame by three seconds.

     willReadFrequently backs the canvas in system memory instead. These are written once and read
     once, as a texture source, and are never composited — so there was never anything for a GPU
     surface to do. */
  const g = cv.getContext('2d', { willReadFrequently: true });
  console.info('ground ' + d.id + ': ' + W + 'x' + H + ' px, ' +
               (spanM / W).toFixed(1) + ' m/px  (gpx target ' + TARGET_M_PER_PX + ')');

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

  /* GROUND VARIATION, AND IT IS ONE FILL THAT WAS DOING ALL THE WORK.

     Every island began as a single flat #B7A78B, and everything painted afterwards — roads,
     parks, patches — is an object ON that field rather than a variation OF it. So the moment the
     lighting got good enough to see the ground properly, the ground read as one material, because
     it was one material.

     Reclaimed land is not one material. It is compacted fill where the plant ran, wind-blown sand
     where it did not, gravel haul routes that were never taken up, and paler dust on the high
     ground. None of it is dramatic and none of it should be: these are five to eight per cent
     shifts, laid as soft blobs at a scale of tens of metres, and the whole point is that you
     cannot see any individual one.

     Painted before the roads and the parks so it sits UNDER them, which is also true to the
     order it happened in. Costs nothing: fifty-four radial fills at load, no texture, no memory,
     and the canvas was already being drawn. */
  {
    /* Five tones around the base: two compacted and darker, one gravelled and cooler, two
       wind-blown and paler. Nothing here is more than about eight per cent off #B7A78B. */
    const TONE = [SURF.sandDk, '#AFA083', '#A89A80', SURF.sandLt, '#C6B99E'];
    const span = Math.max(W, H);
    for (let i = 0; i < 54; i++){
      const cx = R() * W, cy = R() * H;
      const rr = span * (0.05 + R() * 0.15);
      const col = TONE[(R() * TONE.length) | 0];
      const gr = g.createRadialGradient(cx, cy, rr * 0.12, cx, cy, rr);
      gr.addColorStop(0, col);
      gr.addColorStop(1, 'rgba(0,0,0,0)');   // alpha carries the falloff, so no edge lands
      g.globalAlpha = 0.05 + R() * 0.06;
      g.fillStyle = gr;
      g.beginPath(); g.arc(cx, cy, rr, 0, 6.2832); g.fill();
    }
    /* HAUL ROUTES. Two or three long soft streaks in one direction: the tracks the plant left,
       which is the one piece of ground grain on reclaimed land that has a DIRECTION and is
       therefore the one the eye reads as history rather than as noise. */
    const ang = R() * Math.PI;
    for (let i = 0; i < 3; i++){
      const cx = W * (0.2 + R() * 0.6), cy = H * (0.2 + R() * 0.6);
      const L = span * (0.35 + R() * 0.3), wdt = span * (0.012 + R() * 0.02);
      g.save();
      g.translate(cx, cy); g.rotate(ang + (R() - 0.5) * 0.35);
      const gr = g.createLinearGradient(0, -wdt, 0, wdt);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.5, '#A2947A');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.07;
      g.fillStyle = gr;
      g.fillRect(-L/2, -wdt, L, wdt * 2);
      g.restore();
    }
    g.globalAlpha = 1;
  }

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

  /* 4. Parks, straight from the plan — UNLESS THE ISLAND HAS REAL ONES.

        These blobs exist because the bake used to return almost no parkland: its query asked only
        for ways, and the branch gated on el.geometry, so every multipolygon park was dropped
        twice over and the largest green area on Yas was 29 hectares. That is fixed, and the real
        polygons now arrive as meshes in groundFeaturesFor.

        Drawing both would green the same ground twice — and worse, in two different shapes, so
        the seams between them would read as a rendering fault rather than as landscaping. The
        count comes from the index because it is the only thing available this early: the real
        polygons load asynchronously, long after this texture is painted. */
  const realParks = BASE && BASE[d.id] && BASE[d.id].nParks > 20;
  if (!realParks) plan.parks.forEach(p => {
    const x = PX(p.x), y = PY(p.y), rr = U * p.r;
    const grd = g.createRadialGradient(x, y, rr*0.15, x, y, rr);
    grd.addColorStop(0, SURF.lawnLt + '0.90)');
    grd.addColorStop(1, SURF.lawn   + '0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, rr, 0, 6.2832); g.fill();
  });

  /* 5. THE CITY FLOOR, painted from the blocks and the plots.

        This used to reconstruct the whole street layout from one number: every cell got a tarmac
        square at 1.24 of the lattice pitch, and whatever the squares failed to cover was declared
        to be the street. That worked while a plot was an identical axis-aligned square on a
        regular grid, and stopped meaning anything the moment plots gained their own frontage,
        depth and rotation.

        Two passes still, but from the real shapes. The BLOCK is filled once as its apron — which
        is what the interior of an Abu Dhabi superblock actually is, a car park behind the towers
        — and then each PLOT is laid on top of it, rotated to its street. What is left between the
        blocks is the carriageway, and it is a street because nothing was painted over it. */
  const kerbW = Math.max(1, U * 0.0045);
  g.fillStyle = SURF.street;
  (plan.blocks || []).forEach(q => {
    g.beginPath();
    g.moveTo(PX(q[0][0]), PY(q[0][1]));
    for (let i = 1; i < q.length; i++) g.lineTo(PX(q[i][0]), PY(q[i][1]));
    g.closePath(); g.fill();
  });
  plan.cells.forEach(c => {
    /* PY negates, so a rotation that is anticlockwise in world space is clockwise on the canvas.
       Getting this sign wrong lays every plot across its own frontage instead of along it, and it
       is invisible on a square plot — which is exactly the kind of thing the old lattice hid. */
    const w = (c.wN || 0) * U, h = (c.dN || 0) * U;
    if (!w || !h) return;
    g.save();
    g.translate(PX(c.jx), PY(c.jy));
    g.rotate(-(c.rot || 0));
    g.fillStyle = shade(SURF.paving, 0.90 + R() * 0.20);
    g.fillRect(-w/2, -h/2, w, h);
    g.strokeStyle = SURF.kerb; g.lineWidth = kerbW;
    g.strokeRect(-w/2 + kerbW/2, -h/2 + kerbW/2, w - kerbW, h - kerbW);
    g.restore();
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

  /* ===========================================================================
     ASPHALT IS NOT ONE COLOUR, and this is the strongest single reason the roads read as drawn
     while the landscaping and the city read as grown.

     Every carriageway in the scene was one flat SURF.road along its entire length. Real tarmac is
     a patchwork: it is laid in runs, resurfaced in sections decades apart, patched at trenches,
     and bleached unevenly by the sun. From above that is the dominant texture of a road — more
     than the markings, which is why a satellite photo of a motorway is a mosaic of grey-browns
     rather than a grey ribbon.

     So a carriageway is stroked in SEGMENTS with a jittered shade instead of once. Segment length
     is derived from the surfacing run — about 120 metres, which is a day's paving — and the shade
     walks rather than jumps, because a resurfaced section abuts the old one and the two differ by
     a little, not by a lot. Two per cent of segments take a bigger step: that is the recent patch.

     Deterministic through rndPaint, like every other pattern in the painter, so the same city
     resurfaces the same way on every reload. */
  const SURFACE_RUN_M = 120;
  function strokeAsphalt(pts, style, width){
    if (pts.length < 2) return;
    /* DERIVED FROM THE PATH'S OWN LENGTH, not from its point count. My first attempt mixed
       normalised units, metres and an invented 0.06 and produced a segment longer than the street,
       so every road came out in exactly one tone — the bug the whole function exists to fix,
       reintroduced inside the fix. pts are in canvas pixels and U is pixels per normalised unit,
       so the conversion back to metres is one division and two multiplications, all of them
       quantities this file already holds. */
    let px = 0;
    for (let i = 0; i < pts.length - 1; i++)
      px += Math.hypot(pts[i+1][0] - pts[i][0], pts[i+1][1] - pts[i][1]);
    const metres = px / U * d.r * M_PER_UNIT;
    const runs = Math.max(1, Math.round(metres / SURFACE_RUN_M));
    const seg = Math.max(1, Math.ceil((pts.length - 1) / runs));
    /* TWO SCALES OF AGEING, and the first version only had one.

       A ±5 per cent walk along a single street is invisible: the whole network still averaged to
       one grey because every street STARTED at the same tone. What the eye reads from the air is
       that THIS street was resurfaced and the one beside it was not — so the base tone is drawn
       per street, over a wide range, and the segment walk then varies within it.

       0.74 to 1.22 is a real spread: fresh binder against twenty-year-old oxidised tarmac is
       darker by about that much, and putting the whole range on screen at once is what makes the
       network look maintained by a council rather than printed. */
    let tone = 0.74 + R() * 0.48;                     // this street's own age
    for (let i = 0; i < pts.length - 1; i += seg){
      // Overlap by one point so consecutive runs share a joint and no sand shows between them.
      const run = pts.slice(i, Math.min(pts.length, i + seg + 1));
      if (run.length < 2) break;
      tone += (R() - 0.5) * 0.11;                     // section to section within the street
      if (R() < 0.06) tone += (R() - 0.5) * 0.34;     // a patch, or a recently relaid length
      tone = Math.max(0.70, Math.min(1.26, tone));
      strokePx(run, shade(style, tone), width);
    }
  }

  /* PRIMARY. Two carriageways with a median between them, so the geometry is: kerb casing, one
     tarmac band per direction, a planted median filling the gap, then markings. Drawing the
     tarmac as two bands rather than one wide band with a median painted over it means the median
     has real kerbs on both faces, which is what it looks like from above. */
  /* CARTOGRAPHIC MINIMUM WIDTHS, IN CANVAS PIXELS.

     Every printed map exaggerates roads. At 1:20,000 a real 10 m street would be half a millimetre
     of ink and no cartographer draws it that way — they draw it at two, because a road's job on a
     map is to be legible rather than to be to scale. This is a map.

     Corniche paints at 6.2 metres to the pixel, so its true widths come out at 5.0, 4.5, 2.9 and
     1.6 pixels: correct, and unreadable. The floors below take those to roughly double, which is a
     restrained exaggeration by cartographic standards, and they leave the small islands almost
     untouched — Al Maryah's true widths are already 11.4, 10.3, 6.6 and 3.7.

     The floors keep the classes in nearly the same ratio as the real widths, 10:9:6:3.5 against
     31:28:18:10, so the hierarchy survives the exaggeration instead of being flattened by it. And
     they are a floor, never a ceiling: an island fine enough to draw a road at true width still
     does. Everything derived from W — median, edge lines, footways, parking bays — is a fraction
     of it, so it all scales with the exaggeration rather than drifting off the carriageway. */
  const MIN_PX = { ring: 10, major: 9, minor: 6, local: 3.5 };
  const corridor = (m, minPx) => Math.max(minPx, U * roadW(d, m));

  function roadPrimary(pts){
    const W = corridor(ROAD_RING_M, MIN_PX.ring);   // full corridor, kerb to kerb
    const med = W * 0.16;                         // planted median
    const car = (W - med) / 2;                    // each carriageway
    const halfC = (med + car) / 2;                // centre of each carriageway from the axis
    g.lineCap = 'butt'; g.lineJoin = 'round';
    strokePx(offsetPath(pts, 0), SURF.kerb, W * ROAD_KERB);
    [-1, 1].forEach(sgn => {
      /* THE SHOULDER, outside the carriageway and inside the kerb casing. It is the strip that
         makes a road sit IN the ground rather than on it: grit and dust swept off the lanes,
         paler and warmer than the tarmac, and the thing whose absence made every edge a hard
         line between black and sand. */
      strokePx(offsetPath(pts, sgn * (halfC + car * 0.56)), SURF.sandDk, car * 0.30);

      /* FOOTWAY AND CYCLE TRACK. The Corniche's cycle track is one of the most recognisable
         things about the road — an eight-kilometre red-brown ribbon running the whole seafront
         with a pale paved footway beside it — and its absence is a large part of why the ring
         reads as a carriageway rather than as the Corniche.

         Both sit OUTSIDE the kerb casing, so they are on the verge where they belong rather than
         eating carriageway. Widths in metres like everything else that is a real dimension. */
      const vergeO = W * ROAD_KERB * 0.5;
      const cycW = U * roadW(d, 3.0), footW = U * roadW(d, 4.0);
      strokePx(offsetPath(pts, sgn * (vergeO + cycW * 0.7)),  SURF.cycle, cycW);
      strokePx(offsetPath(pts, sgn * (vergeO + cycW * 1.5 + footW * 0.6)), SURF.foot, footW);
      strokeAsphalt(offsetPath(pts, sgn * halfC), SURF.road, car);
      // Edge line hard against the kerb, dashed divider down the middle of the two lanes.
      strokePx(offsetPath(pts, sgn * (halfC + car * 0.40)), SURF.line, Math.max(1, W * 0.035));
      strokePx(offsetPath(pts, sgn * halfC), SURF.line, Math.max(1, W * 0.030),
               [U * 0.026, U * 0.030]);
    });
    // The median: kerb faces the full length, but the PLANTING breaks for turning bays.
    strokePx(offsetPath(pts, 0), SURF.kerb, med);
    /* A continuous green strip down a dual carriageway is the giveaway. A real median is
       interrupted every few hundred metres by a U-turn slot, and the planting stops short of each
       one — so the green is a series of beds, not a ribbon. Bed length is derived from the run. */
    {
      const mp = offsetPath(pts, 0);
      const bed = Math.max(3, Math.round(mp.length / 7));
      for (let i = 0; i < mp.length - 1; i += bed){
        const run = mp.slice(i, Math.min(mp.length, i + Math.round(bed * 0.74)));
        if (run.length > 1) strokePx(run, SURF.lawn + '0.92)', med * 0.52);
      }
    }
  }

  /* SECONDARY. One carriageway, still kerbed, edge lines and a dashed centre. Narrower casing
     than the ring so the hierarchy shows even where the two run parallel. */
  function roadSecondary(pts){
    const W = pts.major ? corridor(ROAD_MAJOR_M, MIN_PX.major)
                        : corridor(ROAD_ART_M,   MIN_PX.minor);
    g.lineCap = 'butt'; g.lineJoin = 'round';
    strokePx(offsetPath(pts, 0), SURF.kerb, W * ROAD_KERB);
    strokeAsphalt(offsetPath(pts, 0), SURF.road, W);
    [-1, 1].forEach(sgn => strokePx(offsetPath(pts, sgn * W * 0.40), SURF.line,
                                    Math.max(1, W * 0.045)));
    strokePx(offsetPath(pts, 0), SURF.line, Math.max(1, W * 0.040), [U * 0.022, U * 0.026]);

    /* PARKING BAYS. A side street in Abu Dhabi is lined with echelon parking, and the ticks
       between the bays are the finest regular detail visible from the district camera — the thing
       that says "cars park here" without drawing a single car.

       Placed in RUNS with gaps rather than continuously, because a bay run stops at every
       crossing and driveway, and a perfectly continuous comb would be the same repetition the
       palms were just taken off. */
    /* A side street gets a footway on both sides and no cycle track: the track is a seafront and
       main-road facility, and putting one down every residential street would be as wrong as
       leaving it off the Corniche. */
    {
      const vergeO = W * ROAD_KERB * 0.5, footW = U * roadW(d, 3.0);
      [-1, 1].forEach(sgn =>
        strokePx(offsetPath(pts, sgn * (vergeO + footW * 0.6)), SURF.foot, footW));
    }

    const bay = offsetPath(pts, 0);
    const kw = Math.max(0.8, W * 0.05);
    g.strokeStyle = SURF.line; g.lineWidth = kw;
    g.beginPath();
    for (let i = 1; i < bay.length - 1; i++){
      if (R() < 0.30) continue;                       // a crossing, an entrance, a hydrant
      const ax = bay[i+1][0] - bay[i-1][0], ay = bay[i+1][1] - bay[i-1][1];
      const L = Math.hypot(ax, ay) || 1;
      const nx = -ay / L, ny = ax / L;
      const sgn = (i % 2) ? 1 : -1;
      const in0 = W * 0.52, in1 = W * 0.52 + W * 0.42;
      g.moveTo(bay[i][0] + nx * in0 * sgn, bay[i][1] + ny * in0 * sgn);
      g.lineTo(bay[i][0] + nx * in1 * sgn, bay[i][1] + ny * in1 * sgn);
    }
    g.stroke();
  }

  /* SERVICE ROADS ARE GONE, and their absence is the point.

     They existed because the lattice had no streets: a service road was defined as "the gap
     between plots", drawn as a cross centred half a pitch off each cell, and it was the only
     thing in the whole plan that read as a street network. The grid supplies real streets now —
     thirty-five runs on Corniche against three curved arterials — so a painted cross through the
     middle of a superblock would be a second, fictional network laid over the true one.

     What the block interior wants instead is nothing: it is already filled as apron above, which
     is what a superblock courtyard is. */

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
  /* ringJunction is gone. It answered "which index of this run is nearest the ring", which was the
     right question while streets overran the seafront and had to be cut back. Now that the
     skeleton terminates them at the kerb, both ends ARE the junction and the question is instead
     "is this end actually at the ring" — which is a distance test, not a search, and lives at the
     two places that ask it. */


  // ---- draw, coarsest first so markings always land on top of tarmac ----
  /* A major street is drawn as a PRIMARY — dual carriageway, median, shoulders — and a side street
     as a secondary with parking bays.

     NO TRUNCATION ANY MORE. This used to slice the run at ringJunction's index, which dates from
     when streets ran past the ring and had to be cut back. v66 made them terminate at the ring's
     inner kerb in the SKELETON, so the run is already exactly the right length — and the slice was
     now a hazard rather than a help, because ringJunction searches from 40 per cent along and
     returns the nearest index to the ring, which on a curved shore can be a MIDDLE point. When it
     was, the street lost its far half and quietly stopped in the fabric. */
  /* LOCAL. Carriageway, kerb and nothing else.

     A residential street is not a narrow arterial, and drawing it as one was never an option — it
     is the ABSENCE of the furniture that identifies it. No median, no dashed centre, no edge lines,
     no cycle track, no parking comb: at 7.8 metres to the unit a 10 m street is a couple of pixels
     of tarmac, and every one of those details would land on top of the next.

     Which is also why they can be afforded at all. Corniche has 6,217 local ways against 4,447
     arterials, and roadSecondary makes eleven strokes per road; this makes two. */
  function roadLocal(pts){
    const W = corridor(ROAD_LOCAL_M, MIN_PX.local);
    g.lineCap = 'round'; g.lineJoin = 'round';
    strokePx(offsetPath(pts, 0), SURF.kerb, W * ROAD_KERB);
    strokeAsphalt(offsetPath(pts, 0), SURF.road, W);
  }

  /* THE CLASS DISPATCH.

     The generated skeleton sets a boolean `major` on each run, and roadsNormalised sets the same
     boolean on the real network from `cls === 'major'` — so major roads have always dispatched to
     roadPrimary correctly, on both networks. What the boolean cannot express is a third class, and
     with local streets in the artefact false no longer means minor.

     So cls is read first and the boolean is the fallback. The generated skeleton has no cls and
     keeps working untouched; the real network has one and gets three widths instead of two. */
  const strokeFor = a => a.cls === 'major' ? roadPrimary
                       : a.cls === 'minor' ? roadSecondary
                       : a.cls === 'local' ? roadLocal
                       : a.major ? roadPrimary : roadSecondary;
  /* Locals first, so an arterial crossing a side street is drawn over it rather than under it —
     which is the junction priority you actually see from above, and free at this order. */
  plan.arterials.forEach(a => { if (strokeFor(a) === roadLocal) roadLocal(a); });
  plan.arterials.forEach(a => { const f = strokeFor(a); if (f !== roadLocal) f(a); });
  plan.ring.forEach(seg => roadPrimary(seg));

  /* ===========================================================================
     SLIP LANES.

     Where a major street meets the Corniche, the turning traffic does not go round the roundabout
     — it peels off early onto a segregated lane, and the wedge of ground left between that lane
     and the junction becomes a kerbed nose island. That triangle is the single most recognisable
     piece of traffic engineering from the air, and its absence is a large part of why the
     junctions still read as two strokes crossing rather than as a junction.

     THE GEOMETRY IS A FILLET, WHICH MEANS IT IS DERIVED RATHER THAN DRAWN. A slip lane is the arc
     that leaves the side street at SLIP_R before the corner, meets the ring at SLIP_R after it,
     and is tangent to both — so a quadratic Bézier with its control point AT the corner is
     exactly right, and needs no fitting. Both turning directions get one, which is why the ring
     tangent is taken rather than assumed.

     SLIP_R IS IN METRES and clamped against the corner it has to fit in: the plots are set back
     frontN from the street centreline and the ring kerb reaches its own half-width, so the free
     corner is the gap between them. A fillet larger than that would put tarmac under a building,
     which is the fault this build has already paid for four times. */
  const SLIP_R_M = 34;
  /* A FLOOR, NOT A TASTE JUDGEMENT. The street stops at the ring's inner kerb, so a fillet shorter
     than that half-width leaves a gap between the end of the street and the start of the slip —
     the same dead end, moved to the other end of the curve. Ring half-kerb plus a car length. */
  const SLIP_MIN_M = ROAD_RING_M * 0.5 * ROAD_KERB + 6;

  /* Distance from a point to the nearest plot edge, in normalised units. Negative inside a plot.
     The painter has plan.cells, so the slip lane can be fitted against the buildings that actually
     exist rather than against an assumed corner. */
  function plotClear(nx, ny){
    let best = Infinity;
    const cells = plan.cells;
    for (let i = 0; i < cells.length; i++){
      const c = cells[i];
      const dx = nx - c.jx, dy = ny - c.jy;
      // Cheap reject before the rotation: nothing further than a plot diagonal can be the nearest.
      const rr = (c.wN + c.dN) * 0.75;
      if (dx*dx + dy*dy > rr*rr + best*best) continue;
      const cr = Math.cos(c.rot), sr = Math.sin(c.rot);
      const lx = Math.abs(dx * cr - dy * sr) - c.wN / 2;
      const ly = Math.abs(dx * sr + dy * cr) - c.dN / 2;
      best = Math.min(best, Math.max(lx, ly));
    }
    return best;
  }

  /* SLIPS AT BOTH ENDS TOO, for the same reason: a minor street also crosses the island and also
     meets the ring twice. `step` is +1 at the far end and -1 at the near one, which is all that
     changes — the approach direction is read three points back along the street either way. */
  function slipLanes(a, bi, step){
    const p0i = bi - 3 * step;
    if (p0i < 0 || p0i >= a.length) return;
    const e = a[bi];
    // Street direction, pointing INTO the junction.
    const p0 = a[p0i];
    let sx = e[0] - p0[0], sy = e[1] - p0[1];
    const sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;

    // Ring tangent at the nearest ring point, found the same way ringJunction found the corner.
    let best = Infinity, rp = null, rn = null;
    plan.ring.forEach(run => {
      for (let i = 0; i < run.length - 1; i++){
        const dx = run[i][0] - e[0], dy = run[i][1] - e[1];
        const dd = dx*dx + dy*dy;
        if (dd < best){ best = dd; rp = run[i]; rn = run[Math.min(i + 1, run.length - 1)]; }
      }
    });
    if (!rp || rp === rn) return;
    let tx = rn[0] - rp[0], ty = rn[1] - rp[1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;

    /* THE CORNER IS ON THE RING, NOT ON THE STREET, and getting that wrong is what made these
       dead-end.

       v66 made grid streets terminate at the ring's INNER KERB, so a street's last point sits
       18.6 metres short of the ring centreline. The fillet was then built as e plus offsets, which
       put its far end 18.6 metres out in the verge — running parallel to the Corniche and stopping
       in the shoulder. From the plan camera that is exactly "an internal road running dead into
       main", because that is what it was.

       A fillet joins two CENTRELINES. The corner is the nearest point on the ring polyline, and
       both arms are measured from it, so all three control points lie on roads that exist. */
    const corner = rp;

    const laneN = roadW(d, 9);                    // one lane of segregated tarmac
    const lane  = U * laneN;
    /* THE RADIUS IS FITTED, NOT CHOSEN, and 34 metres was too big: measured against the real
       plots, sixteen samples put tarmac fifteen metres inside a building. The free corner varies —
       the ring curves, and a plot may sit closer on one junction than another — so a single
       constant cannot be right everywhere. Largest radius that clears, stepped down from the
       nominal, which is the same shape of answer as the ADNOC and Etihad anchors: solve it
       against the geometry rather than nudge it until it looks right. */
    const cN = [corner[0], corner[1]];
    const sN = [sx, sy], tN = [tx, ty];

    /* ONE SLIP, NOT TWO. Both turning directions gave 144 wedges round five islands and, more to
       the point, is not what gets built: a side street joining a seafront artery gets a free-flow
       merge in the DIRECTION OF TRAVEL, and the opposing turn either waits at the give-way or is
       banned outright. The UAE drives on the right, so the merge is the right turn.

       The sign is derived from the geometry rather than picked: cross the street's inbound
       direction with the ring's tangent and take the sign, so the slip is on the correct side
       whichever way round the ring the polyline happens to run at this junction. Getting that from
       a constant would put half of them on the wrong side of the road. */
    const handed = (sx * ty - sy * tx) >= 0 ? 1 : -1;
    [handed].forEach(sgn => {
      let Rm = SLIP_R_M;
      for (; Rm >= SLIP_MIN_M; Rm -= 2){
        const Rn = roadW(d, Rm);
        const aN = [cN[0] - sN[0]*Rn, cN[1] - sN[1]*Rn];
        const bN = [cN[0] + tN[0]*Rn*sgn, cN[1] + tN[1]*Rn*sgn];
        let ok = true;
        for (let k = 0; k <= 12 && ok; k++){
          const t = k / 12, u = 1 - t;
          const X = u*u*aN[0] + 2*u*t*cN[0] + t*t*bN[0];
          const Y = u*u*aN[1] + 2*u*t*cN[1] + t*t*bN[1];
          if (plotClear(X, Y) < laneN * 0.6 + roadW(d, 3)) ok = false;   // lane half-width + kerb
        }
        if (ok) break;
      }
      if (Rm < SLIP_MIN_M) return;                // no room here
      const Rpx = U * roadW(d, Rm);
      const cx = PX(corner[0]), cy = PY(corner[1]);
      // Start back along the street from the corner, end away along the ring.
      const ax = cx - sx * Rpx,       ay = cy - sy * Rpx;
      const bx = cx + tx * Rpx * sgn, by = cy + ty * Rpx * sgn;
      const pts = [];
      for (let k = 0; k <= 12; k++){
        const t = k / 12, u = 1 - t;
        pts.push([u*u*ax + 2*u*t*cx + t*t*bx, u*u*ay + 2*u*t*cy + t*t*by]);
      }
      strokePx(pts, SURF.kerb, lane * ROAD_KERB);
      strokeAsphalt(pts, SURF.road, lane);
      strokePx(pts, SURF.line, Math.max(1, lane * 0.10), [U * 0.020, U * 0.024]);

      /* THE NOSE ISLAND. The area between the fillet and the corner, filled as kerbed paving. It
         is drawn from the SAME three points the curve was built from, so the island cannot drift
         away from the lane that defines it. */
      /* THE NOSE ISLAND, INSET AND TONED DOWN.

         It was filled with SURF.pavingLt at luminance 0.88 — the brightest surface anywhere on the
         island — across the whole 34-metre wedge, with a 0.92 kerb outlining it. Against tarmac at
         0.22 that inverts the whole junction: from the plan camera it reads as a white arrowhead
         with a thin dark lane around it, which is the opposite of what a slip lane looks like.

         Two corrections. It shrinks toward its own centroid so there is tarmac on BOTH sides of it
         — an island with road only on one side is a verge, not an island — and it takes the
         ordinary paving tone, a little darker again, because a traffic island is concrete and dust,
         not a lightbox. */
      const tri = [[ax, ay], pts[6], [bx, by], [cx, cy]];
      const gx = (tri[0][0] + tri[1][0] + tri[2][0] + tri[3][0]) / 4;
      const gy = (tri[0][1] + tri[1][1] + tri[2][1] + tri[3][1]) / 4;
      const K = 0.62;                            // shrink toward the centroid
      const inset = p => [gx + (p[0] - gx) * K, gy + (p[1] - gy) * K];
      const isl = [inset([ax, ay])].concat(
        [2, 4, 6, 8, 10].map(k => inset(pts[k])), [inset([bx, by]), inset([cx, cy])]);
      g.beginPath();
      g.moveTo(isl[0][0], isl[0][1]);
      for (let k = 1; k < isl.length; k++) g.lineTo(isl[k][0], isl[k][1]);
      g.closePath();
      g.fillStyle = shade(SURF.paving, 0.88); g.fill();
      g.strokeStyle = SURF.kerb; g.lineWidth = Math.max(1, U * 0.0032); g.stroke();
    });
  }

  /* ===========================================================================
     JUNCTIONS. Every grid crossing was two strokes laid over each other and nothing else — no stop
     line, no crossing, no indication that anything happens there. From the air a junction is
     mostly WHITE PAINT, and its absence is why the grid still read as ruled lines.

     Drawn from the crossings list the skeleton already computed off the lattice, so this is not
     searching thirty-five polylines for intersections that the construction knew about all along.

     A zebra on every approach at a major crossing, a stop bar only at a minor one — which is the
     real hierarchy: signalised junctions get crossings, side-street junctions get give-way. */
  /* THE JUNCTION PAD, drawn before the markings and after the carriageways.

     Two streets crossing were exactly that — two strokes laid over each other — and once each
     street got its own asphalt age the overlap became visible as a rectangular patch of whichever
     street happened to be painted second. From the plan view that is the dominant artefact at
     every crossing: not a junction, a printing error.

     A real intersection is resurfaced as one piece, so it is one pad in one tone, sized from both
     roads' kerb widths and rotated to the grid. Drawn over the two carriageways, under the paint.

     CORNER FILLETS. The kerb line at a junction is a quarter circle, never a right angle — a
     square corner is the single clearest sign that a road network was drawn rather than built.
     Four arcs of the same radius the pad is sized from. */
  function junctionPads(){
    const aw = U * roadW(d, ROAD_ART_M)   * 0.5 * ROAD_KERB;
    const mw = U * roadW(d, ROAD_MAJOR_M) * 0.5 * ROAD_KERB;
    const fil = U * roadW(d, 11);                 // kerb corner radius
    (plan.crossings || []).forEach(c => {
      const hw = c.major ? mw : aw;
      const px = PX(c.x), py = PY(c.y);
      g.save();
      g.translate(px, py);
      // Rotated to the RING at a ring junction: the pad is the piece of carriageway the two roads
      // share, and at the seafront that piece belongs to the Corniche.
      g.rotate(-(c.ring && c.th2 !== undefined ? c.th2 : c.th));
      // The pad, in a tone of its own so it reads as one resurfaced square.
      g.fillStyle = shade(SURF.road, 0.96);
      g.fillRect(-hw, -hw, hw * 2, hw * 2);
      /* The four corners: fill the wedge OUTSIDE the arc with kerb, which rounds the tarmac
         without having to redraw the tarmac itself. */
      g.fillStyle = SURF.kerb;
      for (let q = 0; q < 4; q++){
        const sx = (q === 0 || q === 3) ? 1 : -1;
        const sy = (q < 2) ? 1 : -1;
        g.beginPath();
        g.moveTo(sx * hw, sy * hw);
        g.lineTo(sx * hw, sy * (hw - fil));
        g.arc(sx * (hw - fil), sy * (hw - fil), fil,
              sy > 0 ? 0 : -Math.PI / 2, sy > 0 ? Math.PI / 2 : 0, sx * sy < 0);
        g.closePath(); g.fill();
      }
      g.restore();
    });
  }
  junctionPads();

  function junctions(){
    const cw = U * roadW(d, ROAD_ART_M) * 0.5 * ROAD_KERB;
    (plan.crossings || []).forEach(c => {
      const px = PX(c.x), py = PY(c.y);
      const setback = cw * 1.20;
      const axes = [c.th, c.th2 === undefined ? c.th + Math.PI / 2 : c.th2];
      for (let q = 0; q < 4; q++){
        // PY negates, so the canvas angle runs the other way round from the world one. Arms 0 and
        // 2 run along the first axis, 1 and 3 along the second — which for a ring junction is the
        // ring's own tangent rather than a right angle off the street.
        const a = -axes[q % 2] + (q >= 2 ? Math.PI : 0);
        const dx = Math.cos(a), dy = Math.sin(a);
        const nx = -dy, ny = dx;
        const bx = px + dx * setback, by = py + dy * setback;
        // The street ARRIVES at a ring junction and does not continue past it, so arm 2 — the
        // continuation of the street on the far side — does not exist. Marking it puts a zebra in
        // the coastal park.
        if (c.ring && q === 2) continue;
        if (c.major){
          /* A zebra: bars ACROSS the direction of travel, drawn along the approach. Six bars is
             what fits a two-lane arm at this scale, and they are derived from the road half-width
             rather than counted out, so a wider arm gets more of them. */
          const halfW = cw * 0.86;
          const bars = Math.max(4, Math.round(halfW / (U * roadW(d, 1.4))));
          g.strokeStyle = SURF.line; g.lineWidth = Math.max(1, U * roadW(d, 0.9));
          g.beginPath();
          for (let i = 0; i < bars; i++){
            const t = (-0.5 + (i + 0.5) / bars) * halfW * 2;
            g.moveTo(bx + nx * t, by + ny * t);
            g.lineTo(bx + nx * t + dx * cw * 0.55, by + ny * t + dy * cw * 0.55);
          }
          g.stroke();
        } else {
          // Give-way: a single bar across the near half of the arm.
          g.strokeStyle = SURF.line; g.lineWidth = Math.max(1, U * roadW(d, 1.1));
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + nx * cw * 0.80, by + ny * cw * 0.80);
          g.stroke();
        }
      }
    });
  }
  junctions();

  const core = plan.core;
  const cr = U * roadW(d, ROUNDABOUT_M);
  const coreApp = plan.arterials.map(a => {
    const p = a[Math.min(3, a.length - 1)];
    return Math.atan2(p[1] - core[1], p[0] - core[0]);
  });
  /* ONE PER MAJOR STREET, NOT ONE PER STREET. This placed a roundabout wherever an arterial met
     the ring, which was four of them when there were three curved arterials and became thirty-six
     the moment the grid arrived — a necklace of identical discs round the whole island, several of
     them sitting in the coastal park. A roundabout is a junction of two important roads, so it
     belongs where a MAJOR meets the ring and nowhere else. */
  /* SLIPS ON THE MINOR STREETS, FORMAL JUNCTIONS ON THE MAJORS — and I had this exactly inverted.

     v64 put slip lanes on the majors because those were the important roads, which is the wrong
     reading of what a slip lane is FOR. A slip lane exists so that traffic can join a road without
     stopping, which is what a side street does when it meets a seafront artery. A main road
     crossing another main road is the opposite case: it stops, it is signalised, and it gets a
     square junction with paint and hardware.

     So the minors slip in, the majors are formal crossings — and the majors are now entries in the
     crossings list, so the junction pad, the zebras and the four signal heads all reach them
     through machinery that already exists rather than through a special case here.

     THE ARTERIAL ROUNDABOUTS ARE GONE with the same reasoning. A roundabout is a third kind of
     junction and there is no room for one where a major meets the ring once that junction is
     signalised. The core roundabout stays: it is the one place with the space for it. */
  {
    const RING_END = roadW(d, ROAD_RING_M) * 0.5 * ROAD_KERB + roadW(d, 22);
    const ringDistN = p => {
      let b = Infinity;
      plan.ring.forEach(run => { for (let i = 0; i < run.length - 1; i++)
        b = Math.min(b, distToPolyline(p[0], p[1], [run[i], run[i+1]])); });
      return b;
    };
    plan.arterials.forEach(a => {
      if (a.major || a.length < 5) return;
      if (ringDistN(a[a.length - 1]) <= RING_END) slipLanes(a, a.length - 1,  1);
      if (ringDistN(a[0])            <= RING_END) slipLanes(a, 0,            -1);
    });
  }
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
const matBeach    = stdMat({ color:0x3E3B32, roughness:1, metalness:0 });
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
    /* WINDING, CHECKED RATHER THAN ASSUMED — and it was wrong, exactly as the beach skirt's was.
       All sixteen faces pointed inward, signed volume -0.37, so FrontSide culled the whole module
       from any camera above it. The breakwaters were not dark; they were the holes you could see
       the water through. This is the second hand-built geometry in the file and the second one to
       come out inside-out, which is a good argument for taking the cross product every time
       rather than reasoning about the ring direction. */
    for (let i = 0; i < 6; i++){
      const j = (i+1)%6;
      idx.push(i, i+6, j+6, i, j+6, j);
    }
    for (let i = 1; i < 5; i++) idx.push(6, i+7, i+6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();

  const deck = box(1, 0.28, 1.0, 1.05);          // jetty: the deck plate itself

  /* PILES. A jetty deck is a plate held up by legs, and without them it is a plank hovering over
     the sea — which is exactly how the Corniche jetty has read in every top-down shot.

     Authored as a UNIT column, one wide and one tall, so the placement code can scale it in world
     units directly. That matters because the deck plate is scaled non-uniformly by (len, 1, wide)
     — 26 by 5 on Corniche — so a leg merged into the plate's own geometry would come out five
     times wider in one axis than the other. The piles are therefore placed as their own instances
     rather than being part of the deck, which is also what lets the count be derived. */
  const pile = (() => {
    const g = new THREE.CylinderGeometry(0.5, 0.42, 1, 8, 1);
    g.translate(0, 0.5, 0);                     // origin at the foot, so y is the seabed
    return g;
  })();
  return { step, quay, finger, mound, deck, pile };
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
  stone: { night: stdMat({ color:0x33322C, roughness:0.94 }),
           day:   stdMat({ color:0xBFB6A2, roughness:0.94 }),
           dusk:  stdMat({ color:0xAFA48D, roughness:0.94 }) },
  rock:  { night: stdMat({ color:0x2A2823, roughness:1.0 }),
           day:   stdMat({ color:0x9A9384, roughness:1.0 }),
           dusk:  stdMat({ color:0x8C8371, roughness:1.0 }) },
  deck:  { night: stdMat({ color:0x3A3830, roughness:0.8 }),
           day:   stdMat({ color:0xD6CDB6, roughness:0.8 }),
           dusk:  stdMat({ color:0xC6BBA1, roughness:0.8 }) },
};

const beachSand = {
  night: stdMat({ color:0x5A5548, roughness:1, metalness:0, vertexColors:true }),
  day:   stdMat({ color:0xC9B896, roughness:1, metalness:0, vertexColors:true }),
  dusk:  stdMat({ color:0xB8A582, roughness:1, metalness:0, vertexColors:true }),
};
const matLandFlat = stdMat({ color:0x424E58, roughness:1, metalness:0 });

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
const matPlaceStone = stdMat({ color:0x161C22, roughness:0.9 });
matPlaceStone.userData.duskColor = 0xD3C4A6;      // precast concrete, neutral

const matStoneRend  = stdMat({ color:0x1A1A20, roughness:0.99, metalness:0.0 });
matStoneRend.userData.duskColor  = 0xE0C79A;      // warm limestone

const matStoneClad  = stdMat({ color:0x171B21, roughness:0.26, metalness:0.62 });
matStoneClad.userData.duskColor  = 0xB9BCC0;      // brushed aluminium

/* PAINTED WHITE RENDER, AND THE MISSING MAJORITY FINISH.

   The five families here cover limestone, precast, aluminium and two glasses, and between them
   they cannot produce the commonest wall in Abu Dhabi: plain white or off-white painted render.
   Al Markaziyah is overwhelmingly that — white and pale grey mid-rise, block after block of it,
   with the warm stone reserved for the older and the more expensive. Every aerial shows it.

   Its absence is why the island reads gold. Not because the gold is wrong — warm limestone is
   genuinely there — but because it was the only thing on offer at low rise, and low rise is most
   of an island.

   Night hex keeps b/r at 1.12, well inside the 1.75 the glass classifier tests, so this stays out
   of the glass path like every other body material. */
const matStoneWhite = stdMat({ color:0x1A1B1D, roughness:0.95, metalness:0.0 });
matStoneWhite.userData.duskColor = 0xE9E4DA;      // painted white render, barely warmed by the dusk

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
const matGlassBronze = stdMat({ color:0x101A22, roughness:0.35, metalness:0.44 });
Object.assign(matGlassBronze.userData, { duskColor:0xC9B79C, duskRough:0.35, duskMetal:0.44, duskEnv:1.15 });

const matRoofDeck = stdMat({ color:0x101216, roughness:0.97, metalness:0.02 });
matRoofDeck.userData.duskColor = 0x8E8878;        // ballast and plant, the darkest thing up there

/* CLAY TILE, WHICH IS THE THING THAT MAKES A VILLA ESTATE READ AS ONE.

   Every Saadiyat satellite says the same: Beach Villas, Hidd Al Saadiyat and the Lagoons are
   identifiable from altitude by a WARM ROOF PLANE over a pale wall, not by their massing. Our
   low stock is flat-topped in a single sand tone, so at district range it dissolves into the
   ground it stands on — which is exactly the complaint, and no amount of resizing the box fixes
   it because the box was never the signal.

   matRoofDeck is the wrong material for this and stays where it is: bitumen and ballast is what
   sits on a commercial roof, and it is nearly black. A house has fired clay on it.

   TWO TONES, NOT ONE. A real estate is not uniform - the Beach Villas run a deeper terracotta and
   the Lagoons a paler sand-tile - and a single hex over fifteen hundred roofs reads as a printed
   pattern rather than as a neighbourhood. Two buckets is two draw calls, which is the cheapest
   variation available anywhere in this file. */
const matRoofTile  = stdMat({ color:0x1A1210, roughness:0.94, metalness:0.02 });
matRoofTile.userData.duskColor  = 0xA9663F;       // fired terracotta, the deeper of the two
const matRoofTileL = stdMat({ color:0x1C1714, roughness:0.94, metalness:0.02 });
matRoofTileL.userData.duskColor = 0xC0906A;       // sand-tile, the Lagoons tone
const matPlaceGlass = stdMat({ color:0x111C22, roughness:0.35, metalness:0.1 });
/* ===========================================================================
   FACADE WINDOWS, AND THE END OF THE BAND.

   The rings were wrong and the reference photograph says so plainly: on a real tower the lit
   floors run the FULL HEIGHT of the glass, sparse and irregular. Measured down one of the
   reference towers, the lit-pixel share sits between 22 and 29 per cent at every level from crown
   to podium — no concentration anywhere, no gaps. There is nothing in that image a ring could
   approximate. v48 made the ring visible from four sides and v49 gave it a window texture, and
   both made it a better-drawn ring; the deployed screenshots show the result reads as tape
   wrapped round the buildings, at dusk especially, where it sits against pale stone.

   So the map goes on the BUILDING, not on a collar around it, and the band system is deleted
   outright. This costs nothing: no extra instances, no extra triangles, and one fewer mesh per
   island than v50 had. It is strictly cheaper than what it replaces, which is unusual enough to
   be worth stating.

   WHY THIS ONLY BECAME POSSIBLE NOW. An emissive map needs UVs, and the fabric prism had none
   until v49 — it was eight quads with position and nothing else. The arc-length seam work done
   for the band strip is what this is built on.

   THE ROW COUNT PROBLEM, WHICH IS THE ONLY HARD PART. One geometry is shared by every building
   and scaled, so v runs 0 to 1 over whatever height the instance happens to be. A fixed texture
   would put the same number of storeys on a three-unit shed and a forty-four-unit tower — the
   shed at half a metre a floor, the tower at eleven. city.js hit this exact wall and solved it
   per-landmark with texture.repeat, which instancing cannot do.

   The answer is to CLASS BY ABSOLUTE INSTANCE HEIGHT and hold one material per class. Absolute,
   not by tier: tier is measured against the district's `tallest`, so Corniche's tall stock is
   twelve units and Al Reem's is forty-four, and a tier-based split would put the same storey
   count on both. Storey height is a real quantity in metres and has to be classed as one.

   Classed on the INSTANCE, not the building, which falls out for free from the fact that walkSpec
   already emits podium, stages and crown separately. A podium takes the low class and the shaft
   above it takes the tall one, automatically, and a two-stage tower does not get its floor count
   doubled — which it would if the class were a property of the spec. */
const FLOOR_U = 7.8;                    // metres per world unit
const FLOOR_M = 4.0;                    // the storey height we are aiming at

/* FOUR CLASSES, SPACED GEOMETRICALLY, and the row counts derived rather than chosen — the rule
   this file has applied to shoreline modules and repeat counts since the beginning, and which I
   broke here on the first attempt by picking three round numbers. Three linearly spaced classes
   gave a median storey of 2.3 m and a fifth percentile of 0.2 m, because the spread of instance
   heights inside one class was five to one and the small end is crowded.

   Bounds double, so the worst case inside any class is a factor of two on storey height. Rows
   come from the GEOMETRIC MEAN of each class's bounds, which is the height that minimises the
   worst-case ratio across the class rather than the arithmetic mean, which favours the top end. */
const WBOUND = [3, 7, 16, Infinity];
const WCLASS = WBOUND.map((hi, i) => {
  const lo = i === 0 ? 1.2 : WBOUND[i - 1];
  const mid = isFinite(hi) ? Math.sqrt(lo * hi) : lo * 1.7;
  return { max: hi, rows: Math.max(3, Math.round(mid * FLOOR_U / FLOOR_M)) };
});
const wClass = h => { for (let i = 0; i < WCLASS.length; i++) if (h < WCLASS[i].max) return i;
                      return WCLASS.length - 1; };
/* THE ONE ABSOLUTE HEIGHT IN A FILE OTHERWISE BUILT ENTIRELY ON PROPORTIONS. Three storeys and a
   parapet. Above it the relative rules are right and stay in charge; below it the building is a
   house and no proportion of an island ceiling has anything useful to say about it. */
const VILLA_ABS_M = 12;

/* Lifted from w2h-city.js, which worked this out the expensive way and whose reasoning holds
   here unchanged:

   1. FLOOR LINES. A continuous faint horizontal line on every storey, lit or not. Real curtain
      wall has a spandrel band at every slab edge and it is visible from a mile away — it is the
      strongest single cue that a surface is a building.
   2. RUNS, NOT DOTS. Offices are lit in blocks. Painting two to five adjacent cells groups the
      lights into horizontal streaks along the floor lines instead of scattering them, which at
      the place camera is the difference between a building and dirt on the glass.
   3. ANISOTROPY. A tower face seen at a shallow angle is minified hard along one axis; without
      it the GPU picks a mip for the worst axis and the window rows smear.

   DETERMINISTIC, unlike the original. Every other pattern in this file is seeded and this one has
   to be too, or the city relights itself on every reload and no two screenshots can be compared.
   16 columns because u is arc length round the WHOLE perimeter: a typical block is eight units
   round, so sixteen bays is about half a unit each, matching the storey height. */
function fabricWindows(rows, warm){
  const cols = 16;
  const cv = document.createElement('canvas');
  cv.width = cols * 4; cv.height = rows * 4;
  const g = cv.getContext('2d');
  g.fillStyle = '#05080b'; g.fillRect(0, 0, cv.width, cv.height);

  let hsh = 0x9E3779B1 ^ (rows * 2654435761) ^ (warm ? 0x5bf03635 : 0);
  const rnd = () => { hsh = (Math.imul(hsh, 1664525) + 1013904223) >>> 0; return hsh / 4294967296; };

  g.fillStyle = 'rgba(190,205,215,0.10)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * 4 + 3, cv.width, 1);
  g.fillStyle = 'rgba(190,205,215,0.045)';
  for (let x = 0; x < cols; x++) g.fillRect(x * 4 + 3, 0, 1, cv.height);

  for (let y = 0; y < rows; y++){
    let x = 0;
    while (x < cols){
      if (rnd() < 0.17 * 0.55){
        const run = 2 + Math.floor(rnd() * 4);
        const base = 0.45 + rnd() * 0.55;
        for (let k = 0; k < run && x < cols; k++, x++){
          const a = Math.min(1, base * (0.82 + rnd() * 0.36));
          g.fillStyle = warm ? 'rgba(232,181,71,' + a.toFixed(2) + ')'
                             : 'rgba(214,226,232,' + (a * 0.82).toFixed(2) + ')';
          g.fillRect(x * 4 + 1, y * 4 + 1, 2, 2.5);
        }
      } else x++;
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = MAX_ANISO;
  return t;
}

/* DAYTIME IS WHERE THE SAND CASTLES COME FROM, and it is not only the missing windows.

   The view switcher hands every mesh without a `dayMats` override the shell's single `dayMat` —
   one flat 0xC9C2B2 at roughness 0.88. The fabric has never set that override, so in Day the
   limestone, the precast, the brushed aluminium, the blue-green glass and the bronze all collapse
   into ONE colour. Every distinction the material work buys at dusk and night disappears the
   moment the sun comes up, and what is left is a pile of identical tan blocks. The windows are
   the visible half of the complaint; the material collapse is the half that made it look like
   sand rather than like a city with no windows.

   TWO FIXES, ONE MECHANISM. A day albedo map that darkens the glazing, and a per-family day
   colour so the five wall types stay five wall types. Both ride on `dayMats`, which is a per-MESH
   userData override, so this costs no extra draw calls at all — the bucket structure built for
   the night materials already gives every material-and-class pair its own mesh to hang them on.

   THE MAP MODULATES, IT DOES NOT REPLACE. Mean brightness near 1.0, so the family colour still
   sets the tone and the per-instance tint still multiplies on top exactly as it does at night.
   Glazing is drawn DARKER than the wall, which is what glass does in daylight — it is a hole in
   a bright facade, not a light source. That is the opposite of the emissive map and the reason
   it has to be a second texture rather than the same one reused. */
function fabricFacadeDay(rows){
  const cols = 16;
  const cv = document.createElement('canvas');
  cv.width = cols * 4; cv.height = rows * 4;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);

  // Spandrel and mullion lines, the strongest cue that a surface is a building.
  g.fillStyle = 'rgba(120,116,110,0.55)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * 4 + 3, cv.width, 1);
  g.fillStyle = 'rgba(120,116,110,0.30)';
  for (let x = 0; x < cols; x++) g.fillRect(x * 4 + 3, 0, 1, cv.height);

  /* Glazing. Deterministic, and deliberately NOT the same pattern as the night map: a window is
     dark by day whether or not anyone is in it, so this is a full grid with a little variation
     rather than the sparse lit runs. */
  let h = 0x2545F491;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const a = 0.30 + rnd() * 0.16;
      g.fillStyle = 'rgba(74,84,92,' + a.toFixed(2) + ')';
      g.fillRect(x * 4 + 1, y * 4 + 1, 2, 2.5);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = MAX_ANISO;
  return t;
}
const DAY_TEX = WCLASS.map(c => fabricFacadeDay(c.rows));

/* The five wall types as they read at midday. These are the DAY equivalents of the duskColor
   entries the lift already honours, and they exist for the same reason: a skyline of one material
   is the loudest fault in any render of it. */
const DAY_FAMILY = {
  white:  0xEDEBE6,      // painted white render, the commonest wall on the island
  rend:   0xE2D6BB,      // warm limestone render
  stone:  0xD2CBBE,      // precast concrete, neutral
  clad:   0xC4C8CC,      // brushed aluminium, faintly cool
  glass:  0xA8BAC4,      // blue-green solar glass, darker than the stone around it
  bronze: 0xBCA88C,      // bronze coating, warm and duller
  roof:   0x9A9384,      // ballast and plant
  tile:   0xB5714A,      // fired clay, the Beach Villas roof
  tileL:  0xC9A177,      // sand tile, the Lagoons roof
};
function dayFacade(family, tex){
  const m = stdMat({
    color: DAY_FAMILY[family], roughness: 0.86, metalness: 0.0 });
  if (tex) m.map = tex;
  return m;
}

/* One texture per class per temperature./* One texture per class per temperature. Warm is the default city; cool is the option the
   district registry already carried for the glassier islands, and it now selects a texture
   rather than a whole separate material. */
const WIN_TEX = WCLASS.map((c, i) => [fabricWindows(c.rows, true), fabricWindows(c.rows, false)]);

/* GLAZED VARIANTS OF EVERY BODY MATERIAL.

   Cloned rather than modified in place, and the userData copied by hand: duskColor, the dusk
   material overrides and glassOverride all have to survive, or the lift stops honouring the
   palette work and every building goes back to beige. Object.assign on a fresh object rather
   than sharing the reference, so a later edit to one cannot reach the original.

   emissiveIntensity 0.80 is the NIGHT figure; the shell scales it by NIGHT_EMI at night and by
   0.42 at dusk, which is what keeps blue hour reading as daylight with lights coming on rather
   than as a dark city. */
function glazed(base, tex){
  const m = base.clone();
  m.emissive = new THREE.Color(0xffffff);
  m.emissiveMap = tex;
  m.emissiveIntensity = 0.80;
  m.userData = Object.assign({}, base.userData);
  return m;
}

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
  { id:'corniche', name:'Corniche',   x:-40*ISLE_SCALE, z:66*ISLE_SCALE, r:76*ISLE_SCALE, rot: 0.10, tint:C.gold,
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
      /* DERIVED, like the ADNOC entry. These were literals, so moving a landmark would have left
         its place camera aimed at the ground it used to stand on — the same five-copies fault
         that put ADNOC in the road, one edit from happening again. */
      { label:'Emirates Palace', osm:'Emirates Palace',    x:LM.palace.x, z:LM.palace.z, h: 7, r:32 },
      { label:'Etihad Towers',   osm:'Etihad Towers',      x:LM.etihad.x, z:LM.etihad.z, h:18, r:28 },
      { label:'ADNOC HQ',        osm:'ADNOC Headquarters', x: LM.adnoc.x, z: LM.adnoc.z, h:26, r:22 },
      /* No osm match will ever come back for this one — see LM.mosque above — so it never gets
         overwritten by the bake refit and always frames from the hand-placed anchor. h and r are
         framing choices, not measurements: r wide enough to hold all four corners in shot, h set
         from the built model's own eye-line rather than guessed. */
      /* r AND h ARE MEASURED FROM THE BUILT MODEL, NOT GUESSED, and had to be re-measured once
         already: the first rebuild deepened the prayer hall and grew the whole complex to 41 x
         50.6 units with its true centre 2.5 units south of the root anchor, and the place shot
         still framed on the old smaller footprint — camera aimed at the empty courtyard end with
         every dome and all four minarets standing outside the frame. z below carries that offset;
         r is the model's own half-diagonal (32.6) with a small margin, not the previous 26. */
      { label:'Grand Mosque', osm:'Sheikh Zayed Grand Mosque',
        x: LM.mosque.x, z: LM.mosque.z + 2.5, h:9, r:34 },
      /* Both returned by the bake and neither was being asked for. Qasr Al Hosn is the oldest
         building in the city and the east end of the shot; Marina Mall is the Breakwater, which
         is the west end. Together they widen the Corniche framing from the palace-to-ADNOC span
         to the whole waterfront the reference photograph shows. x and z are placeholders — the
         bake overwrites both, and if it ever stops, marks says 3/5 rather than lying. */
      { label:'Qasr Al Hosn',    osm:'Qasr Al Hosn',       x:  60, z: -18, h: 6, r:30 },
      { label:'Marina Mall',     osm:'Marina Mall',        x:-120, z: -30, h: 9, r:34 },
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
      /* 40 x 26, UP FROM 36 x 24, and only that. The rectangle is sized to the palace and its
         forecourt, which is all a reservation should ever be; the clearance that makes it read as
         a landmark is the skirt below, not a wider hole. */
      { x:LM.palace.x + PALACE_ESTATE.dx, z:LM.palace.z + PALACE_FOOT.dz,
        w:PALACE_ESTATE.w, d:PALACE_ESTATE.d },       // Emirates Palace and its estate
      { x:LM.etihad.x, z:LM.etihad.z, w:48, d:20 },   // Etihad Towers and the plaza
      { x: LM.adnoc.x, z: LM.adnoc.z, w:20, d:20 },   // ADNOC HQ and its apron
    ],
    /* THE SKIRT. One entry, and only the palace needs one: Etihad's shortest tower is 21.8 units
       and ADNOC is 44, so both stand clear of a 26-unit neighbour on their own.

       r0 40 clears the reservation's corner — it grew with the estate, since a skirt starting
       inside the rectangle it is protecting ramps over ground nothing stands on and wastes half
       its run. r1 62 is measured rather than chosen — the palace and
       Etihad are 67 units apart, so the ramp reaches the Etihad cluster's edge and stops, and the
       towers that are supposed to rise there are untouched. h 7.0 sits just above the palace's
       6.5 so the nearest fabric reads as a wall of the estate rather than as a rival. */
    lowRise:[
      { x:LM.palace.x + PALACE_ESTATE.dx, z:LM.palace.z, r0:40, r1:62, h:7.0 },
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
      /* PULLED IN FROM 16 AND SHORTENED FROM 26, on the argument already made for the breakwaters
         two lines below: a structure belongs in a defensible relationship to the beach it stands
         on. At off 16 with len 26 the deck ran from 3 to 29 units out — 133 metres of it past the
         toe of a 94-metre beach, which is a causeway to nowhere rather than a jetty. At 10 and 18
         it runs from 1 to 19: it starts at the promenade and finishes 55 metres past the sand. */
      { kind:'deck',  t:0.235,          off:10.0, y:0.0,  len:18.0, wide:5.0, turn:true, piles:true },
      /* PULLED IN FROM 24 AND 31 UNITS TO 14 AND 18. The beach skirt already reaches 12 units
         out, so a breakwater at 24 sat a dozen units clear of it in open water and read as three
         pieces of debris floating off the west tip rather than as protection for a shore. A
         breakwater belongs at the toe of the beach it is protecting; anything further and there
         is nothing between it and the land to explain why it is there. */
      { kind:'mound', t:0.985,          off:14.0, y:-0.4, len:34.0, h:2.1, wide:9.0 },
      { kind:'mound', t:0.015,          off:18.0, y:-0.4, len:22.0, h:1.7, wide:7.0 },
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
      /* ANOTHER COPY OF THE SAME FAULT, and this one was live. v55 moved Etihad 110 metres and
         updated the anchor, the avoid rectangle, the mass blocks and the place camera — and
         missed the ground painter entirely. So the plaza stayed at the old anchor: a 40 by 13
         paved rectangle sitting empty in the middle of the fabric with only two of the five
         towers standing on it, and the other three on bare desert.

         Derived now, from the cluster's own bounds, so it cannot be left behind again. */
      /* The lawn runs to four units inside the reservation that protects it, so what gets painted
         is the estate rather than a verge around the building. The forecourt is sized to the
         palace front, not to the lawn. */
      { kind:'lawn',   x:LM.palace.x + PALACE_ESTATE.dx, z:LM.palace.z + PALACE_FOOT.dz,
                       w:PALACE_ESTATE.w - 8, d:PALACE_ESTATE.d - 8 },
      { kind:'paving', x:LM.palace.x, z:LM.palace.z + 5.5, w:PALACE_FOOT.w * 0.7, d:14 },
      { kind:'paving', x:LM.etihad.x + ETIHAD_PLAZA.dx, z:LM.etihad.z + ETIHAD_PLAZA.dz,
                       w:ETIHAD_PLAZA.w, d:ETIHAD_PLAZA.d },   // Etihad plaza
      { kind:'paving', x: LM.adnoc.x, z: LM.adnoc.z, w:17, d:13 },   // ADNOC apron
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
  { id:'maryah',   name:'Al Maryah',  x:2*ISLE_SCALE, z:-22*ISLE_SCALE, r:34*ISLE_SCALE, rot: 0.30, tint:0x8FD3E8,
    shore:[{ kind:'quay', t:0.60, t1:0.76, reps:5, off:2.0, y:2.40, len:6.2, wide:1.0 }],
    built:false, coreN:[0.0, 0.0], places:[
      /* Rosewood and Waterfront were never in the bake's landmark table, so they could not have
         resolved however the lookup was written — they sat at these authored coordinates, which
         were set for an island a fraction of this one's size, which is why all three labels
         printed on top of each other. Replaced with the two Al Maryah landmarks the bake does
         return. */
      { label:'The Galleria', osm:'The Galleria Al Maryah Island', x:-10, z:  6, h:10, r:30 },
      { label:'ADGM',         osm:'Abu Dhabi Global Market',       x: 12, z:-10, h:12, r:30 },
      { label:'Cleveland Clinic', osm:'Cleveland Clinic Abu Dhabi', x: 2, z: 18, h: 8, r:32 },
    ] },
  /* MOVED EAST BY EIGHT. The beach width was never a design choice — it was set by the tightest
     channel in the world, Corniche to Al Reem at 22.8 units. Two beaches have to fit in that with
     water left between them, so the skirt could not exceed about 11 and 8 was the safe number.
     Buying the width meant buying the channel first. Nothing depends on Reem's exact position:
     the camera heading is derived from it, and every rule on the island is relative to its own
     centre. */
  { id:'reem',     name:'Al Reem',    x:88*ISLE_SCALE, z:34*ISLE_SCALE, r:44*ISLE_SCALE, rot:-0.20, tint:0xBFD3E0,
    built:false, coreN:[-0.25, 0.05], places:[
      /* THE ONE ISLAND THE BAKE CANNOT CARRY YET. Of the three names asked for, Overpass returns
         only Sky Tower — Gate Towers and Reem Mall are in the bake's LANDMARKS table and come
         back empty, which the Action log records as a MISSING line. Reem Central and Shams Boutik
         were never asked for at all.

         So this island declares what actually resolves and nothing else. One anchor is below the
         two the shot needs, so Al Reem falls back to framing its coastline, which is honest:
         better a wide island than three labels stacked on its centre pretending to be venues. */
      { label:'Sky Tower',   osm:'Sky Tower',   x:  0, z:  0, h:16, r:36 },
      { label:'Gate Towers', osm:'Gate Towers', x:-22, z: -8, h:16, r:36 },
    ] },
  /* AND SAADIYAT OUT BY EIGHT, for the same reason. Widening the skirt shifts which pair is
     tightest: Reem moving east fixed Corniche to Reem, and Al Maryah to Saadiyat then became the
     binding constraint at 3.0 units of water between two beaches. This puts every channel in the
     world at 4.8 or better. */
  /* CONDITION THREE: THE SOFT EDGE. Saadiyat's north-west run is the one genuinely straight coast
     in the world and it is a beach, so it gets almost nothing — six low groynes at right angles
     to the sand, which is what actually punctuates a beach of that length. The rest stays
     painter-only, as the brief asks. */
  { id:'saadiyat', name:'Saadiyat',   x:-44*ISLE_SCALE, z:-116*ISLE_SCALE, r:56*ISLE_SCALE, rot: 0.15, tint:0xDDD3C0,
    shore:[
      /* Saadiyat's straight run is the NORTH-WEST coast, t 0.02 to 0.28 by the same measurement.
         Groynes are shorter and lower than v41's: fourteen units out was a pier, not a groyne. */
      { kind:'mound', t:0.05, t1:0.26, reps:7, off: 6.0, y:-0.5, len:9.0, h:0.8, wide:2.2, turn:true },
    ],
    built:false, coreN:[0.15, 0.10], coastPark:[0.02, 0.28, 0.070], places:[
      /* Louvre Abu Dhabi IS in the bake's table and does not come back — that is an Overpass
         lookup to fix, not a name to change here, so it stays declared and reads as a miss until
         it resolves. Saadiyat Beach was never asked for; Zayed National Museum and Berklee both
         return and were going unused. */
      { label:'Louvre Abu Dhabi', osm:'Louvre Abu Dhabi',      x: 18, z: 14, h: 6, r:40 },
      { label:'Zayed Museum',     osm:'Zayed National Museum', x:-24, z: 22, h:10, r:40 },
      { label:'Manarat',          osm:'Manarat Al Saadiyat',   x:  4, z:-18, h: 6, r:38 },
      { label:'Berklee',          osm:'Berklee Abu Dhabi',     x: 28, z:-10, h: 6, r:34 },
    ] },
  /* CONDITION TWO: THE MARINA. A quay wall down one wall of the inlet with pontoon fingers off
     it, and a mound across the mouth. The inlet is the only place on any island where the coast
     is already concave, so it is the only place a marina reads as a marina rather than as
     furniture parked on an open shore. */
  { id:'yas',      name:'Yas Island', x:78*ISLE_SCALE, z:-196*ISLE_SCALE, r:62*ISLE_SCALE, rot:-0.10, tint:C.gold,
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
      /* Five of six, and the two additions were sitting in the bake unasked-for. Yas Waterworld
         and SeaWorld are the reason anyone goes to this island who is not going to the circuit,
         so leaving them out of the shot was leaving out half the subject. Etihad Arena is in the
         bake's table too; it is held back only to keep the label count at five, which is already
         where collisions start. */
      { label:'Yas Marina',    osm:'Yas Marina Circuit',      x:-10, z: 18, h: 5, r:42 },
      { label:'Yas Mall',      osm:'Yas Mall',                x: 10, z: -6, h: 8, r:40 },
      { label:'Ferrari World', osm:'Ferrari World Abu Dhabi', x: 30, z:-12, h: 9, r:40 },
      { label:'Yas Waterworld', osm:'Yas Waterworld',         x: -4, z:-24, h: 6, r:38 },
      { label:'SeaWorld',      osm:'SeaWorld Abu Dhabi',      x: 22, z: 14, h: 8, r:38 },
    ] },
];

/* SIZE AND PLACE THE ISLANDS FROM THE DATA, before anything reads either.

   r IS THE ONE THAT MATTERS. Every dimension in this file that means something in the real world —
   the superblock, the plot, the road widths, the beach, the ring inset — is stated in metres and
   converted through roadW, which divides by d.r. So the radius is not a size, it is the exchange
   rate between metres and normalised island space, and it has been wrong by a factor of three
   since the outlines were drawn by eye. Correcting it does not stretch the city: it leaves every
   street the width it always claimed to be and gives the island the number of them it actually
   holds. Corniche goes from 190 units to about 1,220, and the fabric from roughly 275 plots to
   ten thousand — against 18,776 real buildings, which is the first time those two numbers have
   been in the same neighbourhood.

   ROTATION GOES TO ZERO, AND THE GRID ANGLE MUST NOT GO WITH IT. d.rot existed to orient a shape
   that was authored square; a surveyed outline is already on its true bearing and rotating it
   again would turn the island off north. But d.rot is ALSO the fallback the fabric uses for its
   street angle when no gridRot is set, so zeroing it alone would silently swing every street on
   three islands round to due east. The grid angle is pinned first, then the island rotation is
   cleared. */
if (BASE){
  for (const d of DISTRICTS){
    const b = BASE[d.id];
    if (!b) continue;
    d.r = b.r;
    d.x = b.x; d.z = b.z;
    if (d.gridRot === undefined) d.gridRot = d.rot || 0;
    d.rot = 0;

    /* Every place the bake could name moves with its landmark. r is the camera's framing radius
       and stays authored — that is a composition decision about how tightly to hold a building in
       frame, and no dataset has an opinion about it. */
    const marks = b.landmarks || {};
    for (const pl of d.places || []){
      const m = marks[pl.osm || PLACE_OSM[pl.label] || pl.label];
      if (m){ pl.x = m.x; pl.z = m.z; pl.baked = true; }
      else pl.baked = false;
    }
    /* HOW MANY OF THEM THE BAKE ACTUALLY NAMED, because an anchor that fell through is not
       obviously wrong — it just sits where it was authored, and the authored coordinates are
       stale. They were written when an island was about 190 units across; Saadiyat's real radius
       is nearer 700. So an unmatched anchor lands within about 3 per cent of the island centre,
       and three of them land on top of each other there. That is the label clumping, and it is a
       separate fault from the display scale — fixing the scale moves a clump, it does not spread
       one. Nothing downstream could tell a surveyed position from a stale literal, so it is
       recorded here and shown on the overlay. */
    d.marksHit = (d.places || []).filter(p => p.baked).length;
    d.marksOf  = (d.places || []).length;
    /* The damped display scale. A uniform scale over the whole island is indistinguishable from
       viewing it from further away — nothing inside it distorts — so this is the only place the
       diorama's compression of the archipelago exists, and it is one number to animate away. */
    d.dispScale = b.scale;
  }
}

/* Wrapped after every declaration and before the first call. These are function declarations, so
   the binding is assignable and every existing call site picks the wrapper up unchanged. */
isleCoast    = timed('isleCoast',    isleCoast);
/* isleGridOf IS NOT WRAPPED, AND THAT IS THE POINT.

   It is a memoised getter: a Map read on every call but the first. insideIsle and
   distToOutlineFast both call it on EVERY invocation, and those two run per candidate plot —
   millions of times per island. Wrapping it put a rest-array allocation, two performance.now()
   calls and a string concatenation in front of a Map.get.

   A profile of the load put the wrapper at 21.8 per cent of the longest task, ahead of every real
   function in the build. The measurement was the third biggest cost in the thing it measured.

   The stage number is not lost. What anyone ever wanted from `isleGridOf` on the overlay is how
   long the GRID TOOK TO BUILD, not how long a cache hit takes, so the function times its own miss
   path and the hits cost nothing. */
isleShape    = timed('isleShape',    isleShape);
roadSkeleton = timed('roadSkeleton', roadSkeleton);
groundPlan   = timed('groundPlan',   groundPlan);
paintGround  = timed('paintGround',  paintGround);
urbanFabric  = timed('urbanFabric',  urbanFabric);

/* THE SEA HAS TO REACH THE ISLANDS, and at true scale it stopped doing so.

   The water plane is 3,200 units across, which comfortably held an archipelago 800 wide. Yas now
   sits 2,300 units east with a displayed radius near 900, so the far corner of the world is over
   3,200 from the centre and the ocean simply ends before it — a hard edge in open water, which
   reads as a bug in a way that almost nothing else does.

   Scaled rather than rebuilt, because the wave animation in world-nav.html holds a reference to
   this geometry's position attribute and its untouched copy. Rebuilding the geometry would leave
   both pointing at an array that is no longer attached to anything, and the sea would go flat with
   no error to explain it. */
{
  let far = 0;
  for (const d of DISTRICTS) far = Math.max(far, Math.hypot(d.x, d.z) + d.r * (d.dispScale || 1));
  const k = Math.max(1, (far * 2.6) / 3200);
  water.scale.set(k, 1, k);
  farSea.scale.set(Math.max(1, k * 0.6), 1, Math.max(1, k * 0.6));
}

/* THE OPENING SHOT, WHICH IS NOT THE DISTRICT SHOT.

   The district camera frames d.r, and d.r is now the whole landmass — nineteen kilometres from the
   Breakwater to the Mussafah channel. Fitting that puts the island across the frame as a sliver
   with sea above and below it, and stacks all three landmark labels into one clump at the west
   end. The arithmetic behind 5.7r is right; what changed is what r means.

   The Corniche the hero wants is the four kilometres from the Breakwater to ADNOC. So a shot is
   declared per district — a centre and a framing radius in scene units — and where one exists the
   opening camera uses it instead of the island's own radius. Absent, nothing changes.

   Derived from the landmark anchors rather than typed, so it follows the bake: the centre is the
   midpoint of the palace and ADNOC, and the radius is the distance between them with a margin.
   Re-bake the city and the shot re-aims itself. */
/* A SHOT FOR EVERY ISLAND, because framing d.r is wrong at both ends of the size range and the
   attract loop flies through all of it.

   Corniche is nineteen kilometres and the subject is four of them. Al Maryah is 2.4 kilometres and
   d.r * 5.7 puts the camera INSIDE the towers looking up — the same arithmetic failing in the
   opposite direction, because a small island's radius is smaller than the distance needed to see
   anything at all.

   So the framing radius is clamped to a floor. Below about 320 units the shot stops shrinking with
   the island and holds a distance that keeps the camera outside the city looking at it, which is
   the only thing the loop is for. */
/* THE FLOOR MOVED, AND THIS IS WHY IT IS NOT HERE ANY MORE.
   A minimum framing radius stops a small island pulling the camera inside its own towers.
   But it was applied to d.r, and d.r is in ISLAND units while the thing the camera is
   looking at has been magnified by the group's dispScale — so on Al Maryah the floor and
   the damping multiplied together and framed a radius twice the size of the island on
   screen. The floor is a camera concern in displayed units and now lives in world-nav.html
   as SHOT_MIN_DISP. What is declared here is the SUBJECT, in the island's own frame. */
/* THE SHOT IS THE VENUES, ON EVERY ISLAND — which is what Corniche already did and nowhere else
   did. Corniche framed the span from Emirates Palace to ADNOC and every other island framed its
   own coastline, so the flight arrived at Saadiyat looking at a landmass with the Louvre somewhere
   in it and at Yas looking at a landmass with Ferrari World somewhere in it. The island is the
   setting; the venues are the subject, and they are the only reason anyone is being flown there.

   Generalised rather than special-cased five ways: the centre is the mean of the island's baked
   anchors and the radius is the distance from that centre to the furthest of them, with the same
   1.05 margin Corniche was tuned to. Re-bake and every shot re-aims itself.

   TWO GUARDS, BOTH EARNED. Anchors that the bake did not name keep their authored coordinates,
   which are stale — written for islands about 190 units across and now sitting inside islands
   three to seven times that. Framing on those would put the camera in a tight huddle at the
   island's centre looking at nothing. So unbaked anchors do not vote, and if what is left spans
   less than a fifth of the island the whole thing falls back to the coastline: a small spread is
   far more likely to mean bad data than a genuinely compact subject. */
const SHOT_MIN_SPREAD = 0.28;               // of the island's own radius, against the framed r
for (const d of DISTRICTS){
  const pts = (d.places || []).filter(p => p.baked !== false && (p.x || p.z));
  d.shot = { x:0, z:0, r:d.r };
  if (pts.length < 2) continue;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length;
  let far = 0;
  for (const p of pts) far = Math.max(far, Math.hypot(p.x - cx, p.z - cz));
  /* TIMES 2.1, NOT 1.05, AND THE FACTOR OF TWO IS THE WHOLE POINT.

     Corniche's tuned figure was hypot(adnoc - palace) * 1.05 — the full SPAN between the two
     landmarks. far is measured from the centroid, which for two points is half that span, so
     carrying 1.05 across halved Corniche's framing radius and stood the camera at half the
     distance on the one island whose shot had already been tuned by eye. 2.1 is 2 x 1.05, which
     reproduces the old number exactly on two anchors and generalises honestly to more. */
  const r = far * 2.1;
  if (r < d.r * SHOT_MIN_SPREAD) continue;
  d.shot = { x:cx, z:cz, r };
}

/* REAL CENTRELINES, ATTACHED WHEN THEY EXIST RATHER THAN WHEN THE ISLAND IS DECLARED.

   This ran once, inline, in the district loop below — which happens during buildWorld, which
   happens a few milliseconds after sceneIslands is built, which is after Corniche's roads have
   been awaited and while the other four are still in flight. So the test read null for four
   islands out of five and never ran again. Corniche painted its real network; Yas, Saadiyat,
   Reem and Al Maryah were STRUCTURALLY incapable of it, and would have gone on painting a
   generated ring-and-spokes lattice however long you waited or however fast the fetch was.

   That is why "is stage 2 working" had two different answers depending on which island you
   looked at, and why the honest test is Corniche and only Corniche on the old build.

   Idempotent, so calling it twice costs a property write. The generated skeleton is untouched:
   ring and arterials still feed onRoad and the fabric, draw* feed the painter. */
function attachRealRoads(d){
  const b = BASE && BASE[d.id];
  if (!b || !b.roads || !d.roads) return false;
  d.roads.drawRing = [];                 // no separate ring: the real Corniche road is a major
  d.roads.drawArterials = b.roads;
  /* Junction pads, signals and zebras were placed at generated crossings, which the real network
     does not have. Empty rather than left in place: a signalised junction drawn where two real
     roads do not meet is worse than no signal at all. Real junctions come with stage 3. */
  d.roads.crossings = [];
  return true;
}

const pickTargets = [];

DISTRICTS.forEach(d => {
  const g = new THREE.Group();
  g.name = d.id;
  // AUTHORED AT LOCAL ORIGIN, positioned by the container.
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rot;
  if (d.dispScale) g.scale.setScalar(d.dispScale);
  world.add(g);

  const mass   = new THREE.Group(); mass.name = 'mass';
  const detail = new THREE.Group(); detail.name = 'detail';
  detail.visible = false;
  g.add(mass, detail);
  /* THE GLOW LIGHT IS CREATED HERE, FOR EVERY ISLAND, BEFORE ANY OF THEM IS BUILT.

     It used to be created inside buildFabricFor, which is deferred — so each island added a
     PointLight to the scene the moment it was built. three.js compiles the light count into every
     shader as NUM_POINT_LIGHTS, so adding one invalidates the entire material set and the whole
     lot is compiled again from scratch.

     A dump of the program cache is unambiguous about it: 49 of the 85 programs are ordinary
     MeshStandard, and they split five ways on exactly one field — the light count — 9 programs at
     0 lights, 18 at 1, 7 at 2, 8 at 3, 7 at 4. Four islands built, five recompiles of everything.
     That is the twenty seconds, and it is why prog climbs from 53 to 96 as the flight goes round
     rather than settling after the first island.

     ADDED TO d.group, NOT d.detail, AND THAT MATTERS AS MUCH AS THE TIMING. three.js gathers
     lights while walking VISIBLE objects, and applyLOD toggles detail every time the camera enters
     or leaves an island — so a light in there changes the count on every LOD switch and triggers
     the same full recompile mid-flight. In the group it is always visible, and the count is a constant
     from the first frame to the last.

     Intensity 0 until applyLOD wants it, exactly as before: this changes when the light EXISTS,
     not when it shines. */
  /* THE LIGHT LIVES IN `world`, NOT IN THE ISLAND GROUP, AND THAT IS THE THIRD ATTEMPT AT THIS.

     First it was created inside the deferred build, so each island added a PointLight as it was
     built and NUM_POINT_LIGHTS climbed 0,1,2,3,4 — five full recompiles of every material.

     Then it moved here, into d.group, created for all five islands up front. Better, but the shell
     hides a pending island with `group.visible = false`, and three.js returns early from
     projectObject on an invisible object — so the light went with it and the count still climbed.
     Hiding mass and detail instead kept the count constant and took the program set from 74 to 32,
     but it broke the islands: the prefetch path hid the contents and only the attract reveal put
     them back, so any island built ahead of the camera stayed empty.

     A light that must never be hidden does not belong inside the thing that gets hidden. In
     `world` it is outside every visibility rule in the shell — group hide, LOD swap, view switch —
     and NUM_POINT_LIGHTS is five from the first frame to the last with no cooperation required
     from anyone.

     Positioned in world space rather than group space, which is the same point: the group carries
     a Y rotation and a point on the Y axis is invariant under it, so only the offset and the
     display scale matter. Range scales with the island for the same reason. */
  const gscale = d.dispScale || 1;
  const glow = new THREE.PointLight(d.tint, 0, 150 * gscale, 2);
  glow.position.set(d.x, (GROUND + 20) * gscale, d.z);
  world.add(glow);
  d.glow = glow;

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
    const BW = roadW(d, BEACH_M);
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

    /* REPS ARE DERIVED HERE, NOT READ FROM THE TABLE.

       The rule has been written down in this file since v40 — set rep counts from span divided by
       length, never choose them — and the data had drifted straight back off it. Measured against
       the real arc length: the Corniche steps ask for twelve and want twelve, but the quay asks
       for five where the run holds ten, and the mound run asks for seven where it holds nine. A
       rule enforced by a comment above a literal is not enforced.

       Measuring the arc length here also makes every run immune to the coastline resolution,
       which has now changed twice. A t-fraction is a position on a curve; how many points that
       curve is sampled at should never reach the answer. */
    let perim = 0;
    for (let i = 0; i < n; i++) perim += Math.hypot(o[i+1].x - o[i].x, o[i+1].y - o[i].y);
    perim *= d.r;
    const REPS = d.shore.map(sp =>
      sp.t1 === undefined ? 1
        : Math.max(1, Math.round(Math.abs(sp.t1 - sp.t) * perim / sp.len)));

    /* Piles are spaced along the module's own long axis, so the count comes from len, not from a
       coastline fraction — same rule, different span. Two rows, one down each side. */
    const PILE_SPACING = 4.5;                 // world units between pile rows, about 35 m
    const PILE_FOOT    = -1.9;               // seabed: below the water plane, so no leg floats
    const PILE_R       = 0.42;               // a 3.3 m column, which is a jetty pile at this scale
    const pilesFor = sp => sp.piles ? 2 * Math.max(2, Math.round(sp.len / PILE_SPACING)) : 0;

    const need = {};
    d.shore.forEach((sp, k) => {
      need[sp.kind] = (need[sp.kind] || 0) + REPS[k];
      const np = pilesFor(sp) * REPS[k];
      if (np) need.pile = (need.pile || 0) + np;
    });
    const MAT = { step:'stone', quay:'stone', finger:'deck', mound:'rock', deck:'deck', pile:'rock' };
    for (const k in need){
      const m = new THREE.InstancedMesh(shoreGeo[k], shoreMat[MAT[k]].night, need[k]);
      m.userData.dayMats  = shoreMat[MAT[k]].day;
      m.userData.duskMats = shoreMat[MAT[k]].dusk;
      m.count = 0;
      groups[k] = m;
      g.add(m);
    }
    d.shore.forEach((sp, k) => {
      const reps = REPS[k];
      for (let r = 0; r < reps; r++){
        /* CENTRES AT (r + 0.5) / reps, NOT r / (reps - 1).

           The reps counts are derived as span / length — the file's rule, and correct — but the
           interpolation then spread those modules from t to t1 INCLUSIVE, which is reps - 1
           gaps for reps modules. On Corniche's steps that is a 116.6-unit run holding twelve
           9.4-unit segments at 10.6-unit spacing: a 1.2-unit hole between every pair, 9 metres
           of missing staircase twelve times over, which is why the flight reads as a row of
           separate dark bars lying on the sand rather than as steps. Al Maryah's quay was worse
           — 6.2-unit segments at 10.7-unit spacing, 42 per cent gaps.

           Tiling wants reps intervals, not reps - 1, with the modules sitting at the CENTRE of
           each interval so the run starts and ends half a module inside its own bounds instead
           of hanging half a module past each end. */
        const f  = reps === 1 ? sp.t
                 : sp.t + (sp.t1 - sp.t) * ((r + 0.5) / reps);
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
        const rot = sp.turn ? ang + Math.PI/2 : ang;
        M2.rotation.set(0, rot, 0);
        M2.scale.set(sp.len, sp.h || 1, sp.wide);
        M2.updateMatrix();
        im.setMatrixAt(im.count++, M2.matrix);

        if (sp.piles){
          /* The module's local +X after a Y rotation of rot is (cos rot, 0, -sin rot), and its
             local +Z is (sin rot, 0, cos rot). Deriving both from the same angle the plate used is
             the only way the legs cannot end up under a different jetty than the one they hold up.

             Rows sit at (i + 0.5) / rows along the length, the same centred tiling the shore runs
             now use, so the end pairs stand inside the deck rather than off its ends. */
          const rows = Math.max(2, Math.round(sp.len / PILE_SPACING));
          const cx = Math.cos(rot), sx = Math.sin(rot);
          const pm = groups.pile;
          for (let i = 0; i < rows; i++){
            const u = (-0.5 + (i + 0.5) / rows) * sp.len;
            for (const v of [-sp.wide * 0.34, sp.wide * 0.34]){
              M2.position.set(px * d.r + u * cx + v * sx, PILE_FOOT,
                              -py * d.r - u * sx + v * cx);
              M2.rotation.set(0, 0, 0);
              M2.scale.set(PILE_R, sp.y - PILE_FOOT + 1.2, PILE_R);
              M2.updateMatrix();
              pm.setMatrixAt(pm.count++, M2.matrix);
            }
          }
        }
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

  /* REAL CENTRELINES, FOR DRAWING ONLY, and the "only" is the whole design.

     The baked network is what the island actually looks like: the Corniche itself, the Markaziyah
     grid, the slip roads onto the bridges, every junction where it really is. Painting that
     instead of a generated ring-and-arterial lattice is the single largest visible gap left.

     BUT THE GENERATED SKELETON STAYS FOR THE FABRIC. onRoad tests every plot candidate against
     every road polyline, and there are hundreds of thousands of candidates: swapping twenty
     generated arterials for fifteen hundred real ways would put the quadratic cost straight back
     into the build that a spatial grid was written to remove. The buildings will not sit against
     the real streets until stage 3 replaces the fabric with real footprints — at which point the
     footprints ARE aligned to the streets, by construction, and the exclusion test is not needed
     at all.

     So: drawRing and drawArterials for the painter, ring and arterials for the generator. Two
     networks briefly coexisting is the honest cost of doing this in stages rather than in one
     unverifiable drop. */
  /* Attempted here for Corniche, whose roads were awaited before the build, and attempted AGAIN
     at the top of buildGroundFor for everything else. See attachRealRoads. */
  attachRealRoads(d);

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
/* ===========================================================================
   PROFILE FAMILY.

   Every fabric building in v49 is the same solid: a chamfered box with a five per cent taper,
   scaled. The stage system articulates it into podium, shaft and crown, which are STEPS — and
   steps are the one thing Abu Dhabi's towers mostly do not do. Measuring the reference
   photograph's barrel tower down its silhouette gives widths of 15, 24, 42, 51, 53, 55, 56 —
   a CONTINUOUS CURVE narrowing to a rounded top, with no step anywhere in it. Etihad is a sail:
   pinched at the base, bulging through the lower third, tapering to a slim crown. Stacking
   rectangles will never produce either of those, no matter how the fractions are tuned.

   So the section is now swept along a RADIUS CURVE rather than between two levels. Same chamfered
   octagon, same arc-length UVs, same winding; the only change is that the ring is sampled at
   several heights instead of two, and each sample carries its own x and z scale.

   NORMALISED TO A MAXIMUM OF EXACTLY 1, WHICH IS THE SAFETY PROPERTY. onRoad's clearance is sized
   from the plot's half-diagonal, and every argument about kerbs from v47 depends on the footprint
   never exceeding the plot. A curve whose widest point is 1.0 is inscribed in the same box the
   old prism occupied, so a bulging tower is still narrower than its plot everywhere. Nothing
   about the road maths has to be revisited — which is the whole reason the curves are written as
   shapes first and normalised afterwards rather than being hand-tuned to fit.

   SIDE COUNT IS THE COST. A box is 32 triangles; an eight-ring sweep is 144. Profiles are
   therefore given only to the tall stock, where the silhouette is what the eye is reading, and
   only to a share of it — a district where every tower curves looks like a theme park.
   =========================================================================== */
const SECTION = (() => {
  const C = 0.22 * 0.5, H = 0.5;
  /* The chamfered square, written out in order rather than generated per quadrant. A loop over
     [±1, ±1] emits the eight points in an order that is NOT angular, and indexing a ring in the
     wrong order gives a self-intersecting bow-tie prism that still passes a syntax check and
     still renders — just wrongly, and only at certain angles. Explicit is cheaper to verify. */
  const ring = [
    [ H, -H + C], [ H,  H - C], [ H - C,  H], [-H + C,  H],
    [-H,  H - C], [-H, -H + C], [-H + C, -H], [ H - C, -H],
  ];
  /* u IS ARC LENGTH ROUND THE PERIMETER, not vertex index. The chamfer segments are a fifth the
     length of the wall segments, so indexing would give them the same slice of texture as a full
     wall and the windows would bunch at every corner. */
  let per = 0; const seg = [0];
  for (let i = 0; i < 8; i++){
    const a = ring[i], b = ring[(i + 1) % 8];
    per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(per);
  }
  return { ring, seg, per };
})();

/* Radius curves. t runs 0 at the pavement to 1 at the parapet; each returns [sx, sz] before
   normalisation. Keep them as readable shapes — the normaliser handles the scaling. */
const PROFILE_CURVE = {
  // The original solid, and still the great majority of the city.
  box:   { rings: 1, f: t => [1 - 0.05 * t, 1 - 0.05 * t] },

  /* ETIHAD. Pinched at the base, widest at about a third, then a long taper to a slim rounded
     top. The asymmetry matters: a symmetrical lens reads as a rugby ball, and what makes these
     towers is that the bulge sits LOW and the taper above it is much longer than the flare below.
     The two axes differ slightly so the plan is a soft lens rather than a circle. */
  sail:  { rings: 8, f: t => { const k = Math.sin(Math.PI * Math.pow(t, 0.62));
                               return [0.70 + 0.34 * k - 0.16 * t, 0.74 + 0.28 * k - 0.20 * t]; } },

  /* THE BARREL, measured off the reference: a wide shaft holding almost constant through the
     middle and drawing in over the top third. Narrower at the very base than at mid, which is
     what gives it the vase line rather than a cooling-tower one. */
  vase:  { rings: 8, f: t => { const c = 1 - Math.pow(Math.max(0, t - 0.30) / 0.70, 1.8) * 0.52;
                               const base = 0.86 + 0.14 * Math.min(1, t / 0.30);
                               const r = Math.min(base, c); return [r, r]; } },

  /* A CONTINUOUS TAPER with no bulge — the plain obelisk that sits behind the sculpted towers in
     every skyline and stops the profiled stock all looking related. */
  spire: { rings: 6, f: t => { const r = 1 - 0.46 * Math.pow(t, 1.25); return [r, r]; } },
};

function buildProfileGeo(curve, rings){
  const { ring, seg, per } = SECTION;
  // Sample first, then normalise, so the curves above can be written as shapes and the guarantee
  // that the widest point is exactly 1.0 comes out of the arithmetic rather than out of tuning.
  const lv = [];
  for (let i = 0; i <= rings; i++){ const t = i / rings; lv.push([t, ...curve(t)]); }
  const mx = Math.max(...lv.map(l => Math.max(l[1], l[2])));
  lv.forEach(l => { l[1] /= mx; l[2] /= mx; });

  const pos = [], uv = [], idx = [];
  const push = (x, y, z, u, v) => { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1; };

  /* THE SEAM GETS ITS OWN COLUMN. Sharing vertex zero between the first and last side quad forces
     u to run 0.875 back to 0 across that one face, which draws the entire texture into it,
     mirrored. Nine columns for eight faces; the ninth is vertex zero again at u = 1. */
  const rows = lv.map(([t, sx, sz]) => {
    const r = [];
    for (let i = 0; i <= 8; i++){
      const p = ring[i % 8];
      r.push(push(p[0] * sx, t, p[1] * sz, seg[i] / per, t));
    }
    return r;
  });
  for (let k = 0; k < rings; k++){
    const lo = rows[k], hi = rows[k + 1];
    for (let i = 0; i < 8; i++){
      idx.push(lo[i], hi[i], hi[i + 1], lo[i], hi[i + 1], lo[i + 1]);
    }
  }
  // Caps carry their own vertices at the centre of the map, so nothing about the top and bottom
  // faces disturbs the side coordinates.
  const mk = (t, sx, sz) => ({ c: push(0, t, 0, 0.5, 0.5),
                               r: ring.map(p => push(p[0] * sx, t, p[1] * sz, 0.5, 0.5)) });
  const B = mk(0, lv[0][1], lv[0][2]), T = mk(1, lv[rings][1], lv[rings][2]);
  for (let i = 0; i < 8; i++){
    const j = (i + 1) % 8;
    idx.push(B.c, B.r[i], B.r[j]);
    idx.push(T.c, T.r[j], T.r[i]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PROFILES = {};
Object.entries(PROFILE_CURVE).forEach(([k, v]) => { PROFILES[k] = buildProfileGeo(v.f, v.rings); });
/* Normalised curves kept alongside the geometry, because the lit rings have to sample the shaft's
   ACTUAL width at their own height. Wrapping a 1.02 ring round a sail at nine tenths of its
   height, where the shaft is at half width, would put a lit collar twice the size of the tower
   it belongs to. */
const PROFILE_W = {};
Object.entries(PROFILE_CURVE).forEach(([k, v]) => {
  const s = []; for (let i = 0; i <= 24; i++){ const t = i / 24; s.push(v.f(t)); }
  const mx = Math.max(...s.map(p => Math.max(p[0], p[1])));
  PROFILE_W[k] = t => { const p = v.f(Math.max(0, Math.min(1, t))); return [p[0] / mx, p[1] / mx]; };
});
const fabricGeo = PROFILES.box;

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

/* ===========================================================================
   BUILDING PROFILES — PODIUM, SETBACK, CROWN.

   THE PREREQUISITE, WHICH WAS NOT DONE. v45 claimed the two layers were one city because both
   calls seed from the island id. They do — and then diverge on the very next line, because
   `if (h < minH) return` sits ABOVE the glass roll, the tint rolls, the plant-room rolls and the
   band rolls. A building the mass layer skips consumes between three and fourteen fewer numbers
   than the same building consumed in the detail layer, so from the first short block onwards the
   two streams are offset and every plot after it gets a different height, aspect and material.
   Simulated over Corniche at density 1.85: 600 of 600 mass buildings differ from their detail
   twin. Not most of them. All of them, from cell two.

   The comment above the gate says every rnd() has already been spent. It was true when it was
   written and stopped being true the moment anything was added below the gate, which is exactly
   what this file has been doing for ten versions. A rule that has to be re-checked by hand on
   every edit is not a rule.

   SO THE STREAM NO LONGER SEES THE FILTER AT ALL. urbanFabric now runs in three passes:

     1. cells   — the grid, coast, road and avoid tests. Unchanged, and already identical
                  between layers because none of those tests knows about minH.
     2. specs   — buildingSpec() is called once per cell, in order, and consumes the ENTIRE
                  remaining stream. It has no minH parameter and no lod parameter. It cannot
                  branch on them because it cannot see them.
     3. emit    — minH filters the finished specs and lod decides how much of each one to draw.
                  No random numbers are drawn here at all.

   Adding a feature now means adding a field to the R block at the top of buildingSpec. There is
   no ordering hazard left to get wrong.

   WHAT THE PROFILES ARE.

   A tower is not an extruded rectangle with a taper on it. It is a broad base you can walk into,
   a shaft that steps in as it rises, and a top that is doing something other than stopping. All
   three are silhouette, which is the only thing that survives being 200 pixels tall in the world
   view — material and colour do not.

   PODIUM, AND WHY IT DOES NOT GROW. The obvious podium is wider than the tower. It cannot be:
   onRoad's clearance is pitch * 0.62, derived from the worst-case plot half-diagonal of
   pitch * 0.5406 plus a margin, and a footprint widened even ten per cent puts the corner of a
   square plot on the kerb — the identical bug that shipped twice already. So the PODIUM TAKES
   THE PLOT and the SHAFT INSETS INTO IT, 0.60 to 0.82. Same ground covered, no new clearance
   case, and a more slender tower, which is what Abu Dhabi actually looks like. The low-rise
   plinth is allowed a small step out and is clamped by fitPlot() against the same diagonal the
   road pad was sized for, so it grows only where the plot is a slab with room to spare.

   SETBACKS are separate instances at separate world heights, so nothing is measured in the
   geometry's Y and nothing is stretched by the building's height — the constraint that killed
   plinths and parapets inside fabricGeo. One to three stages, each 0.74 to 0.88 of the one
   below, cumulative width floored at 0.42 of the plot so a three-stage tower does not finish as
   a pencil.

   CROWNS: a parapet on everything low, a tapered cap on most towers, a mast on the tallest.
   Masonry crowns take the roof deck and glass crowns take the cladding, so the top edge of every
   building gets a line of a different material from the wall under it. That line is the whole
   point, exactly as the corner chamfer is.

   LOD, AND THE CONTRACT IT HAS TO KEEP. Tapping an island must ADD, never move. The mass layer
   therefore draws the stages only, and absorbs the podium height into stage one and the crown
   height into the top stage, so its massing is the same solid to the millimetre. Zooming in
   splits that solid into base, shaft and top and hides the join inside the podium. A mast is not
   absorbed — it is a needle, it is not mass, and at world scale it is sub-pixel.

   COST. Mass goes from about 1.7 instances per building to 2.2; detail from 1.7 to about 3.6.
   Triangles are unchanged per instance at 32. The two-pass allocation means every InstancedMesh
   is created at its exact final count rather than at cells.length, which is where the memory for
   the extra instances comes from — the old code over-allocated seven meshes to full cell count
   each and used a fraction of five of them.
   =========================================================================== */

/* The mass-layer floor, written here as a constant and NOT read from opts.minH. Which tier a
   building falls into has to be identical in both layers or the two articulate differently, and
   minH is the one option that differs between the two calls. */
const LOWRISE = 5.4;

/* The largest footprint diagonal onRoad's pad was sized for, as a multiple of the block: the
   widest plot is block * (1 - gap) * 0.98 square, so its diagonal is that times root two. Any
   footprint kept under this is covered by a clearance that has already been tested. */
const PLOT_DIAG = 1.081;

/* Height over narrowest plan dimension. See the note at the height calculation. */
const SLENDER = 22;

function fitPlot(W, D, block){
  const lim = block * PLOT_DIAG, dg = Math.hypot(W, D);
  const k = dg > lim ? lim / dg : 1;
  return [W * k, D * k];
}

/* instanceColor MULTIPLIES the material diffuse, so this carries variation only and works
   unchanged against the night hex, against duskColor and against whatever a future view mode
   does. Same arithmetic as v45's tint(); it takes its two numbers as arguments now because the
   spec draws them long before anything is being written to a buffer. */
function tintFrom(col, t){
  const v = 1 + (t.v - 0.5) * t.amount;
  const w = t.warm * (-0.45 + t.w * 2.25);
  col.setRGB(
    Math.min(1.35, v * (1 + w * 0.05)),
    Math.min(1.35, v),
    Math.min(1.35, v * (1 - w * 0.06))
  );
  return col;
}

function buildingSpec(rnd, ctx){
  const { jx, jy, x, z, rot, plotW, plotD, tallest, capH, coreX, coreZ,
          softH = Infinity } = ctx;
  // The block figure the podium and setback maths are written against is the plot's smaller
  // dimension: those rules are about how far a mass may step relative to its own ground.
  const block = Math.min(plotW, plotD);

  /* ONE UNCONDITIONAL DRAW. Every number this building will ever need is taken here, in a fixed
     order, with no branch above it. Nothing below may call rnd(). This is the whole mechanism —
     the count of numbers consumed per cell is a constant and cannot be made to depend on the
     building, the layer or the options. */
  const R = {
    shape:rnd(),  aw:rnd(),     ad:rnd(),     hRoll:rnd(),
    glass:rnd(),  glassKind:rnd(), tintV:rnd(), tintW:rnd(),
    pod:rnd(),    podH:rnd(),   podW:rnd(),   inset:rnd(),
    sb:rnd(),     sbA:rnd(),    sbB:rnd(),    sbRa:rnd(),  sbRb:rnd(),
    crown:rnd(),  crownH:rnd(), crownW:rnd(),
    plant:rnd(),  plantW:rnd(), plantD:rnd(), plantH:rnd(), plantX:rnd(), plantZ:rnd(),
    prof:rnd(),   plantV:rnd(), plantWm:rnd(),
  };

  /* Site coverage: the share of the plot the building may occupy, the rest being the gap to the
     boundary. It replaces the old `gap` fraction, which was a street width — the streets are real
     now and this is a party-wall setback, which is a different thing at a different size. */
  const COVER = 0.86;

  /* ASPECT. One roll decides slab, turned slab or ordinary block, and the two dimensions are
     then set against each other — independent rolls regress to square, which is what made the
     fabric read as crystal growth. Three numbers spent in every branch, unlike v45, which spent
     three or five depending on the branch. */
  /* THE PLOT IS GIVEN NOW, so the aspect roll no longer invents a shape from nothing — it decides
     how much of a real plot the building takes. A tower on a deep plot leaves a yard behind it; a
     slab fills the frontage. Both are drawn from the plot's own proportions, which is why a
     narrow corner plot can no longer produce a wide slab that overhangs its neighbour. */
  let aw, ad;
  if (R.shape < 0.26){ aw = 0.90 + R.aw * 0.08; ad = 0.46 + R.ad * 0.24; }
  else if (R.shape < 0.44){ aw = 0.50 + R.aw * 0.24; ad = 0.88 + R.ad * 0.09; }
  else { aw = 0.74 + R.aw * 0.22; ad = 0.74 + R.ad * 0.22; }
  const w = plotW * COVER * aw, dp = plotD * COVER * ad;

  // Height falls away from the core. The exponent controls how abruptly downtown ends, and the
  // cap keeps a landmark taller than the fabric standing next to it.
  const dc   = Math.hypot(jx - coreX, jy - coreZ);
  const fall = Math.max(0, 1 - Math.pow(dc / 0.9, 1.5));
  /* A THIRD CEILING, AND IT IS NOT NEW DAMAGE — it is an old fault this version made visible.
     `tallest` is chosen per district with no reference to the block pitch, so Al Reem asks for
     44 units of height on a 2.65-unit plot: a slenderness of 17 at the median and 53 at the
     worst. That is a wire, not a building, and it is why Al Reem has always read as a hairbrush
     in the world view. Articulation multiplied it — a top stage is narrower still — which is how
     it finally became impossible to ignore.
     SLENDER is deliberately loose. Al Reem genuinely is a forest of slim towers and clamping to
     anything realistic (nine or ten) would halve the island and destroy its character. At 22 it
     bites only on the outliers: nothing at the median moves. Raise it to Infinity to see the
     unclamped skyline, or drop it towards 12 if the diorama should read as buildings rather than
     as a cluster of masts. */
  /* THE SKIRT IS A TARGET, NOT A CEILING, and v75 got that wrong.

     v75 passed the landmark skirt in as capH, so Math.min clamped every plot inside r0 to the
     same number: median 7.1 and tallest 7.1, identical. A clamp cannot lower a skyline, only
     flatten one, and the ring around the palace came out as a carpet of matched blocks. This file
     has warned about that twice for the district cap; I applied the same fault at landmark scale.

     softH scales the ROLL instead. Stock inside the skirt runs 0.30 to 1.00 of the target, so at
     7.0 units it spreads 2.1 to 7.0 with the spread of rolls the rest of the island has.

     Default Infinity, and Infinity times anything positive is Infinity, so a plot with no skirt
     over it drops out of the Math.min without a branch — which keeps the promise made above the
     draw block: no branch, no stream change, both layers the same city.

     capH STAYS AT THE DISTRICT CAP. The crown rules below test h < capH to decide whether a tower
     was cut off by the ceiling; feeding them a landmark skirt would report every low building
     near the palace as trimmed when it was not. */
  const h    = Math.min(capH, SLENDER * Math.min(w, dp),
                        3 + tallest * fall * (0.25 + Math.pow(R.hRoll, 2.2) * 0.95),
                        softH * (0.30 + Math.pow(R.hRoll, 2.2) * 0.70));

  const frac = h / tallest;
  const tier = h < LOWRISE ? 0 : frac < 0.42 ? 1 : 2;

  /* WHICH BUILDINGS ARE SCULPTED.

     Only the tall stock, and only a fifth of that. Everything the reference shows curving is a
     landmark tower; the fabric around them is boxes, and a district where every tower is a sail
     stops reading as a city. The R.prof thresholds are the parameter to move if it looks thin or
     busy. DECIDED HERE, above the material, because the material now depends on it. */
  const prof = tier === 2 && frac > 0.52
    ? (R.prof < 0.66 ? 'box' : R.prof < 0.80 ? 'sail' : R.prof < 0.91 ? 'vase' : 'spire')
    : 'box';
  const sculpt = prof !== 'box';

  /* MATERIAL FOLLOWS HEIGHT, unchanged in intent from v45: glass on the tall stock, render on
     the low, and bronze on the shorter of the glass towers because the tint dates the building.
     Varying finish with height reads as eras; varying it at random reads as noise. */
  /* SCULPTED TOWERS ARE ALWAYS CURTAIN WALL, and that is an architectural fact before it is an
     optimisation: masonry does not curve. Every swept tower in the reference — the sails, the
     barrel, the leaning pair — is glass, because a continuously varying profile can only be clad
     in a unitised system refabricated per floor. A rendered-block vase would look wrong for a
     reason the viewer could not name.

     It also halves the bucket count. Instancing is per geometry, so each profile needs its own
     mesh in every material it appears in; holding the swept stock to two materials means three
     profiles cost six buckets instead of eighteen. Both arguments point the same way, which is
     the only kind of optimisation worth taking. */
  /* HEIGHT PICKED THE FINISH OUTRIGHT, AND SEVENTY PER CENT OF THE ISLAND CAME OUT GOLD.

     The rule was one material per height band, and with the falloff putting most of Corniche below
     frac 0.36 that meant one band did most of the work: 70 per cent warm limestone, 11 per cent
     precast, 2 per cent aluminium. The note above matPlaceStone says precast is "the default, and
     the largest share" — that was the intent and the height rule quietly overrode it. A single
     finish across seven buildings in ten is why the island reads as a sand-coloured diorama rather
     than as Abu Dhabi, and no amount of lighting fixes a palette fault.

     Height still sets the BAND — that part was right, and varying finish with height reads as
     eras where varying it at random reads as noise. What changes is that a band now holds a mix
     rather than a single material, weighted the way the aerials actually look: white render
     commonest, precast close behind, warm limestone the minority it really is.

     THE ROLL IS R.glass, RENORMALISED, and no new draw is taken. R.glass has already been spent
     on the glass test by the time we get here, and on this branch it is known to lie above the
     threshold — so rescaling it to [0, 1) gives a clean uniform for free. Adding a roll to the
     block above would have shuffled every building on every island for a palette change. */
  /* AN ABSOLUTE FLOOR UNDER THE FACADE RULE, WHICH IT HAS NEVER HAD.

     Every branch below is RELATIVE to the island ceiling — h > tallest * 0.50, glass at 0.62 of
     the roll. That is a good reading of a skyline and a nonsensical one of a suburb, because a
     proportion of whatever exists always gets curtain wall. Lower GEN_TALLEST as far as you like
     and the same fraction of the remaining stock is still glass: the result is not villas, it is
     towers at 1:6 scale. Saadiyat has been showing exactly that, and shrinking the boxes in
     cullFabric made it worse rather than better — a shrunk instance cannot leave the InstancedMesh
     it was allocated in, so it kept the tower facade and the tower window spacing and became a
     mini high-rise.

     A house is not a small tower. Below VILLA_ABS_M it is render or white, never glass, never
     bronze, never clad, and its windows come from the lowest class regardless of what the island
     around it is doing. Absolute metres, because 9 m is 9 m on Saadiyat and on Corniche alike. */
  const villaAbs = h * M_PER_UNIT <= VILLA_ABS_M && !sculpt;
  const gThresh = h > tallest * 0.50 ? 0.62 : 0.10;
  const isGlass = !villaAbs && (sculpt || R.glass < gThresh);
  const u = (R.glass - gThresh) / (1 - gThresh);
  let mat, tAmount, tWarm;
  if (isGlass){
    if (R.glassKind < (h > tallest * 0.72 ? 0.14 : 0.55)){ mat = 'bronze'; tAmount = 0.26; tWarm = 0.9; }
    else                                                 { mat = 'glass';  tAmount = 0.30; tWarm = 0.2; }
  } else if (villaAbs){
    /* Three warm renders, weighted toward white, which is what an Abu Dhabi villa wall is. No
       clad: brushed aluminium on a house is a shed. */
    if      (u < 0.50){ mat = 'white'; tAmount = 0.34; tWarm = 0.70; }
    else if (u < 0.82){ mat = 'rend';  tAmount = 0.46; tWarm = 1.15; }
    else              { mat = 'stone'; tAmount = 0.40; tWarm = 1.00; }
  } else if (frac < 0.36){
    if      (u < 0.44){ mat = 'white'; tAmount = 0.34; tWarm = 0.70; }
    else if (u < 0.78){ mat = 'stone'; tAmount = 0.42; tWarm = 1.00; }
    else              { mat = 'rend';  tAmount = 0.46; tWarm = 1.15; }
  } else if (frac < 0.62){
    if      (u < 0.34){ mat = 'white'; tAmount = 0.32; tWarm = 0.70; }
    else if (u < 0.72){ mat = 'stone'; tAmount = 0.42; tWarm = 1.00; }
    else              { mat = 'clad';  tAmount = 0.30; tWarm = 0.55; }
  } else {
    if      (u < 0.30){ mat = 'stone'; tAmount = 0.38; tWarm = 0.95; }
    else              { mat = 'clad';  tAmount = 0.30; tWarm = 0.55; }
  }
  const tint = { v:R.tintV, w:R.tintW, amount:tAmount, warm:tWarm };

  /* ---- PODIUM ----
     Tier 2 takes the plot and insets the shaft. Tier 1 gets a plinth that may step OUT a little,
     clamped by fitPlot so it only happens on plots with diagonal to spare. Tier 0 gets neither:
     a two-storey villa with a podium is a joke, and these are the buildings the world view never
     sees anyway. */
  let podium = null, inset = 1;
  if (tier === 2 && R.pod < 0.82){
    const ph = Math.min(h * 0.28, 0.90 + R.podH * 1.30);
    const [pw, pd] = fitPlot(w * (1.00 + R.podW * 0.06), dp * (1.00 + R.podW * 0.06), block);
    podium = { h:ph, w:pw, d:pd };
    /* 0.60 TO 0.82 WAS TOO MUCH, and the first render said so plainly: forty per cent of the
       plan lost at the podium, another fifteen at each setback, and the district read as a pin
       cushion rather than a city. A podium tower in Abu Dhabi keeps most of its plate. */
    inset  = 0.78 + R.inset * 0.14;
  } else if (tier === 1 && R.pod < 0.55){
    const ph = Math.min(h * 0.34, 0.50 + R.podH * 0.60);
    const [pw, pd] = fitPlot(w * (1.05 + R.podW * 0.07), dp * (1.05 + R.podW * 0.07), block);
    podium = { h:ph, w:pw, d:pd };
  }

  /* ---- SHAFT STAGES ----
     Heights are split from the bottom up, footprint steps in at each join, and the cumulative
     width is floored so a three-stage tower does not taper away to nothing. */
  const podH   = podium ? podium.h : 0;
  const shaftH = h - podH;
  /* A SCULPTED TOWER GETS ONE STAGE, ALWAYS. Setbacks and a swept profile are two different
     languages for the same job, and using both on one building gives a stepped sail, which is
     neither. */
  let nStage = 1;
  if (sculpt)          nStage = 1;
  else if (tier === 2) nStage = frac > 0.62 ? (R.sb < 0.22 ? 1 : R.sb < 0.86 ? 2 : 3)
                                            : (R.sb < 0.58 ? 1 : 2);
  else if (tier === 1) nStage = R.sb < 0.82 ? 1 : 2;

  const stages = [];
  let y = podH, left = shaftH, sw = w * inset, sd = dp * inset, cum = inset;
  for (let s = 0; s < nStage; s++){
    const sh = s === nStage - 1 ? left
             : s === 0          ? left * (0.44 + R.sbA * 0.22)
                                : left * (0.55 + R.sbB * 0.22);
    stages.push({ y, h:sh, w:sw, d:sd });
    y += sh; left -= sh;
    /* Gentler steps and a much higher floor. 0.42 meant a three-stage tower finished at under
       half its plate, which compounds with the podium inset and with fabricGeo's own five per
       cent taper — three reductions stacked on one silhouette. */
    const step = Math.max(0.62 / cum, s === 0 ? 0.86 + R.sbRa * 0.07 : 0.88 + R.sbRb * 0.06);
    cum *= Math.min(1, step); sw *= Math.min(1, step); sd *= Math.min(1, step);
  }
  const top = stages[stages.length - 1];

  /* ---- CROWN ----
     A mast on the tallest, a tapered cap on most towers, a parapet on everything else. The
     material is deliberately not the wall's: a dark deck on masonry, bright cladding on glass,
     so the top edge always carries a line. */
  let crown = null;
  /* MASTS ONLY WHERE ONE IS EARNED. frac is h / tallest, and a CAPPED building sits at a fixed
     h — Corniche's cap of 12 against a tallest of 16 puts every capped block at frac 0.75, above
     the old 0.72 gate, so the mast landed on exactly the stock the cap exists to hold DOWN. Rate
     cut as well: 45 needles on one island is a hairbrush, not a skyline. */
  /* A SCULPTED TOP IS ALREADY A CROWN. The whole point of the taper is that the building resolves
     itself, and setting a parapet ring or a cap block on top of it puts a flat lid on the one
     silhouette that did not need one. Masts are still allowed — a needle on a tapered top is what
     the reference actually shows — and everything else is left alone. */
  if (sculpt && !(frac > 0.80 && h < capH - 1e-6 && R.crown < 0.45)){
    crown = null;
  } else if (tier === 2 && frac > 0.80 && h < capH - 1e-6 && R.crown < 0.28){
    const s = 0.07 + R.crownW * 0.05;
    /* Scaled to the building and then clamped, not a flat range. A flat 1.4-to-3.6 needle is a
       third of the height of a capped Corniche tower and eight per cent of ADNOC — the same
       object reading as two different things depending on which island it landed on. */
    crown = { kind:'mast', h:Math.min(3.6, Math.max(0.9, h * (0.08 + R.crownH * 0.10))),
              w:top.w * s, d:top.d * s, mat:'clad' };
  } else if (tier === 2 && R.crown < 0.74){
    const s = 0.64 + R.crownW * 0.20;
    crown = { kind:'cap', h:0.35 + R.crownH * 0.85, w:top.w * s, d:top.d * s,
              mat:isGlass ? 'clad' : 'roof' };
  } else if (tier > 0 || R.crown < 0.70){
    crown = { kind:'parapet', h:0.14 + R.crownH * (tier === 0 ? 0.10 : 0.18),
              w:top.w * 1.05, d:top.d * 1.05, mat:isGlass ? 'clad' : 'roof' };
  }

  /* ---- ROOF PLANT ----
     Flatness is footprint against height: a wide low lid is the case the eye objects to, and a
     plant room is what stops that lid being a plane. Only under a parapet — a cap or a mast is
     already the incident, and two objects on one roof reads as clutter. Height is capped at 2.2
     units now: v45 scaled it with h, which put an eight-unit shed on top of a 44-unit tower. */
  let plant = null;
  const flat = Math.min(top.w, top.d) / h;
  if ((!crown || crown.kind === 'parapet') && flat > 0.22 && R.plant < 0.72){
    const rw = top.w * (0.26 + R.plantW * 0.20);
    const rd = top.d * (0.26 + R.plantD * 0.20);
    plant = { w:rw, d:rd,
              h:Math.min(2.2, Math.max(0.45, h * (0.10 + R.plantH * 0.09))),
              ox:(R.plantX - 0.5) * (top.w - rw) * 0.8,
              oz:(R.plantZ - 0.5) * (top.d - rd) * 0.8,
              tint:{ v:R.plantV, w:R.plantWm, amount:0.30, warm:0.7 } };
  }

  return { x, z, rot, h, w, dp, tier, mat, tint, prof, podium, stages, crown, plant };
}

/* THE ONE WALKER, used by both the tally and the write so the two cannot disagree about how many
   instances a building needs. fn takes an object rather than eight positional arguments, because
   the last time this file passed a footprint and a depth in the wrong order it took a round to
   find. */
function walkSpec(sp, lod, fn){
  const mass  = lod === 'mass';
  const nTop  = sp.stages.length - 1;
  // Mass absorbs the podium into stage one and a parapet or cap into the top stage, so its
  // massing matches the articulated version exactly. A mast is not mass and is simply dropped.
  const absB  = mass && sp.podium ? sp.podium.h : 0;
  const absT  = mass && sp.crown && sp.crown.kind !== 'mast' ? sp.crown.h : 0;

  if (!mass && sp.podium){
    fn({ t:sp.mat, y:0, w:sp.podium.w, h:sp.podium.h, d:sp.podium.d, tint:sp.tint });
  }
  /* ONLY THE SHAFT IS SWEPT. A podium, a crown and a plant room are boxes on any building — the
     profile describes the tower, not everything attached to it — so `g` defaults to box
     everywhere and is set on the stages alone. The mass layer absorbs a podium into stage one as
     before, and on a sculpted tower that means the swept solid starts at the pavement instead of
     at the podium top: a one-stage building has nowhere else to put the absorbed height. It is a
     slightly fatter base at world zoom, and at world zoom the podium is under a pixel anyway. */
  sp.stages.forEach((s, i) => {
    fn({ t:sp.mat, g:sp.prof,
         y: i === 0 ? s.y - absB : s.y,
         w: s.w, d: s.d,
         h: s.h + (i === 0 ? absB : 0) + (i === nTop ? absT : 0),
         tint:sp.tint });
  });
  /* A CROWN IS NOT A FACADE. Parapets, caps and masts are metal and concrete, and they are the
     smallest instances in the scene — a 0.4-unit parapet handed the low class was getting twelve
     storeys across thirty centimetres, which is the 0.2 m tail in the measurements. `raw` sends
     it to the unglazed base material instead. */
  if (!mass && sp.crown){
    fn({ t:sp.crown.mat, raw:true, y:top_y(sp), w:sp.crown.w, h:sp.crown.h, d:sp.crown.d,
         tint:sp.tint });
  }
  if (!mass && sp.plant){
    fn({ t:'roof', y:top_y(sp), w:sp.plant.w, h:sp.plant.h, d:sp.plant.d,
         ox:sp.plant.ox, oz:sp.plant.oz, tint:sp.plant.tint });
  }
}
function top_y(sp){ const t = sp.stages[sp.stages.length - 1]; return t.y + t.h; }

/* Keyed on the cool flag alone; see the note at the call site. */
const FABRIC_MATS = new Map();
function fabricMats(cool){
  const k = cool ? 'cool' : 'warm';
  if (FABRIC_MATS.has(k)) return FABRIC_MATS.get(k);
  const base = { white:matStoneWhite, rend:matStoneRend, stone:matPlaceStone, clad:matStoneClad,
                 glass:matPlaceGlass, bronze:matGlassBronze };
  const out = {};
  /* tile and tileL join roof on the UNGLAZED side of this. A window texture on a pitched clay
     roof would put lit floors up the slope, which is the sort of thing that is invisible in a
     thumbnail and unmistakable the moment anyone looks at a house. */
  const BARE = { roof:1, tile:1, tileL:1 };
  Object.entries(Object.assign({ roof:matRoofDeck, tile:matRoofTile, tileL:matRoofTileL }, base))
        .forEach(([n, m]) => {
    out[n] = WCLASS.map((_, i) => BARE[n] ? m : glazed(m, WIN_TEX[i][cool ? 1 : 0]));
    out[n].raw = m;                       // crowns, plant rooms and anything else not a wall
    // The Day counterparts, hung on the same buckets and therefore free.
    out[n].day = WCLASS.map((_, i) => dayFacade(n, BARE[n] ? null : DAY_TEX[i]));
    out[n].dayRaw = dayFacade(n, null);
  });
  FABRIC_MATS.set(k, out);
  return out;
}

/* THE YAS BAY SITE, IN ISLAND UNITS. The padded convex hull of 55 surveyed pins (the car park is
   a separate plot and is excluded). 26.3 ha, which is the ground the land-use bands are computed
   over — outside it the island keeps its ordinary paint. */
const SITE_YASBAY = [[-88.17,416.83],[-80.86,428.85],[-36.22,430.96],[-27.01,429.10],[25.71,396.12],
                     [23.05,383.86],[15.77,369.39],[-40.64,379.21],[-52.20,382.54]];

function urbanFabric(d, layer, opts){
  const { coreX = 0, coreZ = 0, tallest, innerHole = 0, cool = false,
          cap = Infinity, avoid = false, minH = 0 } = opts;
  /* The grid is anchored on the district's core so the streets and the height falloff agree about
     where downtown is. `density` is no longer read: grain is now a metre figure on the superblock,
     not a normalised multiplier, and leaving the option in the call sites is harmless. */
  const core0 = d.coreN || [0, 0];
  /* Derived, so the two existing call sites need no change: the mass layer is exactly the one
     that sets a floor. Pass lod explicitly to override. */
  const lod = opts.lod || (minH > 0 ? 'mass' : 'detail');

  /* Shadows the module-level rnd. Seeded from the island id alone, so the seed does not depend on
     call order — adding an island upstream must not reshuffle every island after it. */
  const rnd = fabricRnd(d.id);

  /* ---------- PASS 1: BLOCKS, THEN PLOTS ----------

     PLOTS COME FROM THE STREETS, NOT FROM A LATTICE. The grid built in roadSkeleton defines
     superblocks; this walks each one and lays plots around its PERIMETER, facing outward onto the
     street that bounds it. That is how the block is occupied in Abu Dhabi — towers on the street
     frontage, the middle of the block given over to parking and low-rise — and it is the reason
     the roads finally read as structure rather than as paint.

     THE CENTRE IS LEFT EMPTY ON PURPOSE. A superblock filled solid is a mesa; the courtyard is
     what makes a block a block, and at this scale it also reads as the car parks that actually
     occupy those interiors.

     THE ANGLE IS THE GRID'S, so every building on a street is parallel to it and to its
     neighbours. The old lattice used rotation zero and called it grid-aligned, which was true of
     a lattice and false of a city. */
  const th = (d.gridRot !== undefined ? d.gridRot : d.rot || 0);
  const CA = Math.cos(th), SA = Math.sin(th);
  const toWorldN = (u, v) => [core0[0] + u * CA - v * SA, core0[1] + u * SA + v * CA];

  const _fab = DIS ? DIS.fabricFor(d.id) : null;
  const _sbF = d.sb || (_fab ? _fab.sb : SUPERBLOCK_M);
  const su = roadW(d, _sbF[0]);
  const sv = roadW(d, _sbF[1]);

  /* Street half-width plus a pavement, in normalised units: the distance from the street
     centreline to the front of a plot. Taken from the same ROAD_ART figure onRoad clears against,
     so a plot laid at exactly this distance passes the road test by construction rather than by
     being nudged until it does. */
  /* Set back from the WIDEST street a plot might face, since a block edge does not know in advance
     whether its bounding line is a major. Half a metre of extra pavement on a side street is not a
     fault; a tower in a dual carriageway is. */
  const frontN = roadW(d, ROAD_MAJOR_M) * 0.5 * ROAD_KERB + roadW(d, PAVEMENT_M);
  /* PLOT SIZE PER DISTRICT, and this is the one that fixes the corduroy. A 30 to 46 metre
     frontage on a 34 metre depth repeated along every block edge gives parallel bars.
     NOTE THIS DRIVES THE PAINTED GROUND, NOT THE BUILDINGS: the generated fabric's meshes are
     masked on every island that swapped to real footprints; its cells still feed groundPlan and
     the prop placer. */
  const _pf = _fab ? _fab.plotFront : PLOT_FRONT_M;
  const plotDN = roadW(d, _fab ? _fab.plotDepth : PLOT_DEPTH_M);
  const frontMin = roadW(d, _pf[0]);
  const frontMax = roadW(d, _pf[1]);

  /* VILLA PITCH, IN METRES, AND NOTHING TO DO WITH THE SUPERBLOCK.

     Saadiyat Lagoons runs roughly 17 m frontages on 20 m plots in parallel ranks with a service
     lane behind each pair. The superblock's own numbers — 22 to 34 m fronts on a 26 m depth — are
     a Gulf apartment plot and produce the block this generator has always produced. */
  /* GOLF AND THE LARGE PARKS, AS POLYGONS, RESOLVED ONCE PER ISLAND RATHER THAN PER PLOT.
     Guarded: a cached w2h-districts.js without greenAt builds exactly as before. */
  const GREEN = (DIS && DIS.greenAt) ? ((nx, ny) => DIS.greenAt(d.id, nx, ny)) : (() => false);

  const VF = roadW(d, 17), VD = roadW(d, 20), VL = roadW(d, 9);

  /* THE BLOCK CORE IS EMPTY, AND ON A VILLA ISLAND THAT IS THE WHOLE BUG.

     Four frontages 26 m deep around a 280 x 200 m block leave a void of 228 x 148 m in the middle.
     That void is the black rectangle: buildings ringing the street, nothing behind them. A correct
     CBD block and a nonsensical villa estate — and untouchable by roofs, facades, heights or
     ceilings, because all of those describe what a building LOOKS like and this is a decision
     about where the generator puts one.

     ASKED OF THE BAKE, NOT OF A CIRCLE. v167 and v168 gated this on hand-clustered lowRise blobs,
     which is the best that could be done while urbanFabric ran before the footprints loaded. It
     overshot at the edges, and it left Hidd Al Saadiyat — an entire villa spit — on the perimeter
     model because nobody had drawn a circle round it. DIS.villaAt answers from a mask precomputed
     off the real footprints, so the question is now "are there houses here" rather than "is this
     inside a shape somebody drew", and it covers every island at once.

     GUARDED, because a cached w2h-districts.js without the mask must still build a city. Absent,
     every block takes the perimeter branch exactly as it did before. */
  const villaHere = (DIS && DIS.villaAt) ? ((nx, ny) => DIS.villaAt(d.id, nx, ny)) : (() => false);

  const cells = [];
  /* The block outlines go back with the cells. The ground painter used to reconstruct the street
     layout from a single `pitch`, which was possible only while every plot was an identical square
     on a lattice; now that a plot has its own frontage, depth and rotation, the painter has to be
     told the shape rather than allowed to infer it. */
  const blocks = [];
  const reach = 1.45;
  const KU = Math.ceil(reach / su), KV = Math.ceil(reach / sv);
  for (let a = -KU; a < KU; a++){
    for (let b = -KV; b < KV; b++){
      // Block interior in grid space, inset from both bounding streets.
      const u0 = a * su + frontN, u1 = (a + 1) * su - frontN;
      const v0 = b * sv + frontN, v1 = (b + 1) * sv - frontN;
      if (u1 - u0 < plotDN * 2.2 || v1 - v0 < plotDN * 2.2) continue;
      // The block's four corners, island-normalised, for the painter's apron.
      const quad = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([qu, qv]) => toWorldN(qu, qv));
      let used = false;

      const [bcx, bcy] = toWorldN((u0 + u1) / 2, (v0 + v1) / 2);
      if (villaHere(bcx, bcy)){
        /* RANKS ACROSS THE WHOLE BLOCK, not a ring around it. Rows run along u and step in v by a
           plot depth plus a lane, so the block fills edge to edge the way the satellite shows.
           Every guard below is the same one the perimeter path uses and in the same order —
           coastline, avoid list, inner hole, road, cleared plot, then the vacancy mask, which must
           stay last so it consumes no random numbers and mass and detail take the same branch. */
        for (let vv = v0 + VD / 2; vv <= v1 - VD / 2; vv += VD + VL){
          const nP = Math.max(1, Math.floor((u1 - u0) / VF));
          const fw = (u1 - u0) / nP;
          for (let i = 0; i < nP; i++){
            const uu = u0 + (i + 0.5) * fw;
            const [jx, jy] = toWorldN(uu, vv);
            if (!insideIsle(d.id, jx, jy)) continue;
            if (distToOutline(d.id, jx, jy) < COAST_CLEAR + VD * 0.6) continue;
            if (avoid && inAvoid(d, jx, jy, VD * 0.5)) continue;
            if (innerHole > 0 && Math.hypot(jx, jy) < innerHole) continue;
            if (onRoad(d, jx, jy, VD)) continue;
            if (GREEN(jx, jy)) continue;             // the fairway is not a plot
            if (rnd() > 0.94) continue;              // fewer gaps than a tower block; estates are full
            if (VAC_ON && DIS && DIS.vacantAt(d.id, jx, jy)) continue;
            used = true;
            cells.push({ jx, jy, rot:th, wN:fw, dN:VD, w:fw * d.r, dp:VD * d.r, vil:true });
          }
        }
        if (used) blocks.push(quad);
        continue;
      }

      /* ---------- THE CORE, WHICH HAS ALWAYS BEEN NOTHING ----------

         A ring of plots one plotDepth deep around a superblock leaves the middle empty, and the
         middle is large: 228 x 148 m on Saadiyat, 3.4 hectares, 132 x 62 on Corniche, 140 x 40 on
         Al Maryah. In plan that void is the black rectangle with a fine fringe of buildings round
         it that has been in every screenshot since the footprint import. No city block is hollow.
         A real one has a car park, a service yard, a courtyard, some back-of-house sheds — and
         crucially it has SOMETHING, so the eye reads a block rather than a hole.

         BACK-OF-HOUSE, NOT MORE STREET FRONTAGE. What goes in a core is not another row of the
         same buildings: it is lower, smaller, plainer and more loosely spaced than anything on the
         perimeter. A grid of low boxes at a quarter to a third of the block's ceiling, with gaps,
         which is what a service yard looks like from 400 m up.

         SKIPPED ENTIRELY WHERE THE CORE IS SMALL. Below CORE_MIN in either direction there is no
         room for anything but the ring, and filling it would close a courtyard that should stay
         open. Yas's 420 x 300 block with 140 m plots has a core of 140 x 20 and takes nothing.

         EVERY GUARD THE PERIMETER USES, IN THE SAME ORDER, and the vacancy mask last so it
         consumes no random numbers and mass and detail take the same branch. */
      if (!villaHere(bcx, bcy)){
        const cu0 = u0 + plotDN, cu1 = u1 - plotDN;
        const cv0 = v0 + plotDN, cv1 = v1 - plotDN;
        const CORE_MIN = roadW(d, 55);
        if (cu1 - cu0 > CORE_MIN && cv1 - cv0 > CORE_MIN){
          /* Sized off the block's own plot depth rather than a constant, so a district with big
             plots gets big outbuildings and Corniche's fine grain stays fine. */
          const bw = plotDN * 0.42, gap = plotDN * 0.26;
          const nu = Math.max(1, Math.floor((cu1 - cu0) / (bw + gap)));
          const nv = Math.max(1, Math.floor((cv1 - cv0) / (bw + gap)));
          const su = (cu1 - cu0) / nu, sv = (cv1 - cv0) / nv;
          for (let a = 0; a < nu; a++) for (let b = 0; b < nv; b++){
            const u = cu0 + (a + 0.5) * su, v = cv0 + (b + 0.5) * sv;
            const [jx, jy] = toWorldN(u, v);
            if (!insideIsle(d.id, jx, jy)) continue;
            if (distToOutline(d.id, jx, jy) < COAST_CLEAR + plotDN * 0.6) continue;
            if (avoid && inAvoid(d, jx, jy, plotDN * 0.5)) continue;
            if (innerHole > 0 && Math.hypot(jx, jy) < innerHole) continue;
            if (onRoad(d, jx, jy, plotDN * 0.6)) continue;
            if (GREEN(jx, jy)) continue;
            /* HALF THE CORE IS OPEN GROUND. A yard that is fully built is just a second block;
               the gaps are what make it read as back-of-house. */
            if (rnd() > 0.52) continue;
            if (VAC_ON && DIS && DIS.vacantAt(d.id, jx, jy)) continue;
            used = true;
            cells.push({ jx, jy, rot:th,
                         wN:su * 0.74, dN:sv * 0.74,
                         w:su * 0.74 * d.r, dp:sv * 0.74 * d.r, core:true });
          }
        }
      }

      /* Each of the four frontages, laid as a run of plots. side 0 and 2 face along u, 1 and 3
         along v; the building's long axis follows the street it fronts, which is why the
         rotation differs by a quarter turn between the two pairs. */
      for (let side = 0; side < 4; side++){
        const along = (side % 2 === 0) ? (u1 - u0) : (v1 - v0);
        // DERIVED, not chosen: fit whole plots into the frontage and let the width absorb the
        // remainder, so a frontage never ends with a sliver or a gap.
        const nP = Math.max(1, Math.floor(along / ((frontMin + frontMax) / 2)));
        const fw = along / nP;
        if (fw < frontMin * 0.7) continue;
        for (let i = 0; i < nP; i++){
          const t = (side % 2 === 0 ? u0 : v0) + (i + 0.5) * fw;
          let u, v, rot;
          if (side === 0){ u = t; v = v0 + plotDN / 2;  rot = th; }
          else if (side === 2){ u = t; v = v1 - plotDN / 2; rot = th; }
          else if (side === 1){ v = t; u = u1 - plotDN / 2; rot = th + Math.PI / 2; }
          else { v = t; u = u0 + plotDN / 2; rot = th + Math.PI / 2; }

          const [jx, jy] = toWorldN(u, v);
          if (!insideIsle(d.id, jx, jy)) continue;
          if (distToOutline(d.id, jx, jy) < COAST_CLEAR + plotDN * 0.6) continue;
          if (avoid && inAvoid(d, jx, jy, plotDN * 0.5)) continue;
          if (innerHole > 0 && Math.hypot(jx, jy) < innerHole) continue;
          if (onRoad(d, jx, jy, plotDN)) continue;
        /* AND THE PERIMETER PATH TOO, WHICH IS WHERE THE HOUSES ON THE GOLF COURSE CAME FROM.
           Removing golf from VILLA_MASK stopped the villa BRANCH building there and changed
           nothing on screen, because those buildings were never villa-branch buildings: an
           ordinary block comes out under 12 m against Saadiyat's 39 m ceiling and anything under
           12 m is handed a clay roof. Both branches need the test; one of them is not a fix. */
        if (GREEN(jx, jy)) continue;      // THE ROAD STILL WINS, as a backstop
          if (rnd() > 0.90) continue;                   // the occasional cleared plot
          /* PLATTED AND EMPTY. Deterministic in (id, jx, jy) and consumes no random numbers, so
             mass and detail take the same branch and stay the same city — the contract at line
             1322. It sits AFTER the rnd() call for exactly that reason. groundPlan runs the same
             test when it places parkland, or this would clear the plots and then lawn them. */
          if (VAC_ON && DIS && DIS.vacantAt(d.id, jx, jy)) continue;
          // Frontage across the street, depth back from it: the two are not interchangeable.
          used = true;
          cells.push({ jx, jy, rot,
                       wN:(side % 2 === 0 ? fw : plotDN),
                       dN:(side % 2 === 0 ? plotDN : fw),
                       w:(side % 2 === 0 ? fw : plotDN) * d.r,
                       dp:(side % 2 === 0 ? plotDN : fw) * d.r });
        }
      }
      if (used) blocks.push(quad);
    }
  }

  /* ---------- PASS 2: SPECS ----------
     The entire remaining stream is consumed here, one fixed-size draw per plot, with no
     knowledge of minH or lod. This is what makes the two layers the same city. */
  /* THE MASK GOVERNS HEIGHT AS WELL AS LAYOUT, and it must, or a ranked block outside the old
     hand-drawn blobs would come out as 39 m slabs in rows — which is worse than the void it
     replaced. VILLA_CAP is under VILLA_ABS_M by design, so a ranked plot lands on the render
     facade, the ground-floor window class and the clay roof without any of them being asked
     separately. This is why the three lowRise circles on Saadiyat could be deleted: they were
     doing this job for three estates, and the mask does it for every estate on every island. */
  const VILLA_CAP = 11 / M_PER_UNIT;
  const CORE_FLOOR = 7 / M_PER_UNIT, CORE_ABS = 16 / M_PER_UNIT;
  const coreCap = cap => Math.max(CORE_FLOOR, Math.min(CORE_ABS, cap * 0.32));
  const specs = cells.map(c => buildingSpec(rnd, {
    jx:c.jx, jy:c.jy, x:c.jx * d.r, z:-c.jy * d.r, rot:c.rot,
    plotW:c.w, plotD:c.dp, tallest,
    /* CORE_CAP is a FRACTION of the island ceiling, not a fixed height, because back-of-house is
       relative: a service block behind a Corniche tower is taller than a whole villa. A third,
       floored at two storeys so nothing becomes a slab. */
    /* A FRACTION OF THE ISLAND CEILING, AND THEN AN ABSOLUTE LID. Back-of-house is relative — a
       service block behind a Corniche tower is taller than a whole villa — but the fraction alone
       is not enough: a third of Al Reem's 296 m ceiling is 95 m, which is a tower standing in a
       service yard. CORE_ABS is what a yard actually contains: sheds, plant, a car park deck,
       three or four storeys. Floored at two so nothing becomes a slab. */
    capH:  c.vil  ? Math.min(cap, VILLA_CAP)
         : c.core ? coreCap(cap) : cap,
    softH: c.vil  ? Math.min(cellCap(d, c.jx, c.jy, cap), VILLA_CAP)
         : c.core ? Math.min(coreCap(cap), Math.max(CORE_FLOOR, cellCap(d, c.jx, c.jy, cap)))
                  : cellCap(d, c.jx, c.jy, cap),
    coreX, coreZ }));

  /* ---------- PASS 3: TALLY, ALLOCATE, EMIT ----------
     No random numbers below this line. */
  /* THE REGION FILTER, AND WHY IT IS HERE AND NOT TWENTY LINES EARLIER.

     Corniche is nineteen kilometres long and the opening shot is four of them. The rest of the
     island is 18,776 buildings the camera cannot see, and `?drawn` proved they are the cost:
     the same code on a scene a tenth the size draws its first frame in 794 ms instead of 5,788.

     THE FILTER CANNOT MOVE INTO PASS 1. The seeded stream is consumed one fixed block per plot,
     in order, and the two layers agree only because both consume it identically. Skipping a plot
     earlier would skip its draws and every building after it would change — a different city, not
     a smaller one. So every spec is still generated, exactly as before, and only the EMIT is
     filtered. That costs the same CPU in urbanFabric and removes the geometry, which is where the
     first frame actually goes. */
  const keep = specs.filter(sp => sp.h >= minH && (!opts.region || opts.region(sp)));

  /* ONE MESH PER MATERIAL AND GEOMETRY PAIR, ALLOCATED LAZILY.

     Instancing is per geometry, so a swept tower cannot share a mesh with a box even in the same
     stone. The naive version of this is materials times profiles — twenty-eight buckets, most of
     them empty, and twenty-eight draw calls whether or not anything is in them. Counting first
     and creating only the pairs that have instances means an island with no bronze sails simply
     has no such mesh, and the draw-call line stays a measure of what is actually being drawn.

     KEY ORDER IS FIXED as material then geometry, because it is also the allocation order and
     two passes have to agree on it exactly. */
  /* THE GLAZED VARIANTS, BUILT ONCE PER ISLAND AND MEMOISED.

     Six body materials times three storey classes is eighteen clones, and building them per
     island would be eighteen more every time an island is assembled. Cached on the cool flag
     because that is the only thing that varies between islands — everything else about a glazed
     material is a function of its base and its class.

     ROOF IS NEVER GLAZED, and neither is anything flagged `raw`. Plant rooms, parapets, caps and
     masts are bitumen, concrete and metal; lighting them would put windows on the one set of
     surfaces that are definitively not facades. */
  /* ARITHMETIC ONLY, WHEN THE MESHES ARE GOING TO BE HIDDEN ANYWAY.

     THE ROW THAT MADE THIS OBVIOUS: `saad 1842>1841/500r m25 fab18782 hid59/0v`. The last field is
     fabric currently VISIBLE, and it is zero. Not "mostly hidden" — none of it. On every island
     with real footprints the entire generated fabric was built and then hidden in full: 18,782
     instances on Saadiyat, 3,519 on Reem, geometry and materials and draw-call setup for a city
     that is never drawn.

     WHY IT COULD NOT SIMPLY BE SKIPPED, until now. urbanFabric returns { cells, blocks } and
     buildGroundFor reads them — `const f = d.fabric; if (!f) return;`. The block layout, the
     paving and the road grid are all derived from that arithmetic, so skipping the call took the
     ground with it. That trap already cost one attempt at deferring Corniche's mass.

     The split is clean because the two halves never touch: everything above this line computes
     cells and blocks, everything below builds InstancedMeshes, and the mesh half reads neither.
     So `meshes:false` returns the same arithmetic and builds no geometry at all.

     THIS REPLACES hideFabric RATHER THAN HELPING IT. Generating in order to hide was always the
     wrong shape — the hide ratios told the story, 59 meshes retired against 1,841 real footprints
     landing, because there was nothing to retire that mattered. */
  if (opts.meshes === false) return { cells, blocks };

  const MATS = fabricMats(cool);

  const need = new Map();
  // Class is decided on the INSTANCE height, so a podium and the shaft above it get different
  // storey counts without the spec having to know anything about it.
  /* THE WINDOW CLASS TAKES THE SAME ABSOLUTE FLOOR. Bucketing a 9 m house into the class its
     height would otherwise earn is what put five rows of lit office glazing on two storeys. */
  const key = o => o.t + '#' + (o.raw || o.t === 'roof' ? 'r'
                    : (o.h * M_PER_UNIT <= VILLA_ABS_M ? 0 : wClass(o.h))) + '|' + (o.g || 'box');
  keep.forEach(sp => walkSpec(sp, lod, o => { const k = key(o); need.set(k, (need.get(k) || 0) + 1); }));

  const meshes = new Map();
  need.forEach((n, k) => {
    const [tc, g] = k.split('|');
    const [t, c] = tc.split('#');
    const m = new THREE.InstancedMesh(PROFILES[g], c === 'r' ? MATS[t].raw : MATS[t][+c], n);
    /* Without this the switcher falls back to its own single dayMat and the whole city goes one
       colour in Day. Set per mesh, so it costs nothing beyond the material objects themselves. */
    m.userData.dayMats = c === 'r' ? MATS[t].dayRaw : MATS[t].day[+c];
    m.castShadow = true; m.receiveShadow = true;
    meshes.set(k, m);
  });

  const M   = new THREE.Object3D();
  const col = new THREE.Color();
  const idx = new Map();
  const villaRoofs = [];

  keep.forEach(sp => walkSpec(sp, lod, o => {
    /* The plant room's offset is in the BUILDING's frame, so it has to be rotated with it. Adding
       it in world axes put roof plant off the side of every rotated tower. */
    const cr = Math.cos(sp.rot), sr = Math.sin(sp.rot);
    const ox = o.ox || 0, oz = o.oz || 0;
    M.position.set(sp.x + ox * cr - oz * sr, GROUND + o.y, sp.z + ox * sr + oz * cr);
    M.rotation.set(0, -sp.rot, 0);        // aligned to the STREET, which is the whole point now
    M.scale.set(o.w, o.h, o.d);
    M.updateMatrix();
    const k = key(o), m = meshes.get(k), i = idx.get(k) || 0;
    idx.set(k, i + 1);
    m.setMatrixAt(i, M.matrix);
    m.setColorAt(i, tintFrom(col, o.tint));
    /* A HOUSE, AND THEREFORE A ROOF. Plain boxes only: a plant room, a parapet or a podium tier is
       low by nature and putting clay tiles on one would cap a tower with a cottage. */
    if (!o.raw && o.t !== 'roof' && (o.g || 'box') === 'box' &&
        o.h * M_PER_UNIT <= VILLA_ABS_M){
      villaRoofs.push({ x:M.position.x, z:M.position.z, y:M.position.y + o.h,
                        w:o.w, d:o.d, rot:sp.rot });
    }
  }));

  /* ---------- THE SAME CLAY ROOFS, ON THE GENERATED STOCK ----------

     footprintsFor got these first and it was not enough: Saadiyat carries 10,956 generated
     instances against 1,841 real, so roofing only the real ones roofed one building in seven and
     the island still read as towers with a terracotta patch in the middle of it.

     COLLECTED IN THE WRITE LOOP ABOVE, not walked again, because walkSpec is the expensive part
     and it has already run twice by this line.

     ORDERING DOES NOT MATTER TO THE CULL. cullFabric decides per instance from its POSITION, and
     a roof stands at its building's x and z, so it lives or dies with the wall beneath it without
     any index correspondence between the two meshes. That is the property that makes this safe;
     without it the roofs would need to be culled in lockstep and they are not. */
  if (villaRoofs.length){
    const split = [[], []];
    for (const r of villaRoofs){
      let q = Math.imul(Math.round(r.x * 733) ^ Math.imul(Math.round(r.z * 733), 0x9E3779B1), 0x85EBCA6B);
      q ^= q >>> 15;
      split[(q >>> 0) % 100 < 58 ? 0 : 1].push(r);
    }
    ['tile', 'tileL'].forEach((fam, t) => {
      if (!split[t].length) return;
      const rm = new THREE.InstancedMesh(ROOF_GEO, MATS[fam].raw, split[t].length);
      rm.userData.dayMats = MATS[fam].dayRaw;
      rm.castShadow = true; rm.receiveShadow = true;
      rm.name = 'roofs';
      const R = new THREE.Object3D();
      split[t].forEach((r, i) => {
        const short = Math.min(r.w, r.d);
        const pitch = Math.max(1.6 / M_PER_UNIT, Math.min(3.6 / M_PER_UNIT, short * 0.30));
        R.position.set(r.x, r.y, r.z);
        R.rotation.set(0, -r.rot, 0);
        R.scale.set(r.w * 1.08, pitch, r.d * 1.08);
        R.updateMatrix();
        rm.setMatrixAt(i, R.matrix);
      });
      layer.add(rm);
    });
  }

  meshes.forEach((m, k) => {
    m.count = idx.get(k) || 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    layer.add(m);
  });

  return { cells, blocks };
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

  const palace = kit.emiratesPalace(LM.palace.x, LM.palace.z);
  const etihad = kit.etihadTowers(LM.etihad.x, LM.etihad.z);
  const adnoc  = kit.adnocHQ(LM.adnoc.x, LM.adnoc.z);
  /* THE MOSQUE, BUILT THEN TURNED 90 DEGREES CLOCKWISE AROUND ITS OWN ANCHOR.

     Every mesh inside grandMosque() carries an ABSOLUTE position — x0+dx, not a relative offset
     under a group transform — because that is what the z0-doubling bug fix demanded: coordinates
     had to be checkable against the real anchor directly. The cost of that is that the returned
     group has no meaningful local origin to rotate around; a bare `mosque.rotation.y = ...` would
     spin the whole precinct around WORLD (0,0,0), flinging a building anchored near (1111,883)
     somewhere else on the map entirely rather than turning it in place.

     So it is wrapped: the raw group is shifted by -LM.mosque so its anchor lands at the wrapper's
     own local origin, the wrapper is placed at LM.mosque, and the wrapper is what gets rotated.
     Verified before shipping, not assumed — a point 60 units due east of the anchor maps to 60
     units due south of it under this exact transform, confirming the turn is clockwise on this
     scene's +x-east/+z-south convention, not the 90 degrees the wrong way. */
  const mosqueRaw = kit.grandMosque(LM.mosque.x, LM.mosque.z);
  mosqueRaw.position.set(-LM.mosque.x, 0, -LM.mosque.z);
  const mosque = new THREE.Group();
  mosque.add(mosqueRaw);
  mosque.position.set(LM.mosque.x, 0, LM.mosque.z);
  mosque.rotation.y = -Math.PI / 2;
  // The kit builds every landmark with its base at y = 0. One group offset each puts them on
  // the island instead of 2.9 units inside it.
  if (!NO_KIT) [palace, etihad, adnoc, mosque].forEach(o => { o.position.y = GROUND; D.add(o); });

  /* THE HAND-BUILT LANDMARK WINS, AND THE FOOTPRINT UNDERNEATH IT YIELDS.

     OSM holds Emirates Palace, Etihad Towers and ADNOC HQ as extruded boxes, and once the real
     footprints arrived they stood in the same ground as the authored versions — two ADNOC HQs
     interpenetrating, one of them a flat slab. Deleting the authored one is the wrong way to
     resolve it: the recognisable silhouette is the whole reason a visitor knows where they are,
     and a box with a height tag is not a silhouette.

     So the zone is recorded here, where the authored coordinates exist, and footprintsFor drops
     anything standing in it. MEASURED FROM THE OBJECT, NOT WRITTEN DOWN. A literal rectangle per
     landmark would be a fourth place the palace's dimensions live, and it would be wrong the
     first time the kit changed. updateMatrixWorld before the box because the group has not been
     added to a parent yet, which is exactly why the box comes out in island-local coordinates —
     the frame the footprint specs are already in. */
  KIT_ZONES[corniche.id] = [];
  if (!NO_KIT) for (const o of [palace, etihad, adnoc, mosque]){
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    if (!isFinite(b.min.x)) continue;
    /* Two units of margin, about sixteen metres. The authored landmark and the surveyed footprint
       agree on roughly where the building is and not on its exact edge, so a zone drawn tight to
       the kit leaves a sliver of the real one poking out of one side — which reads worse than
       either fault alone because it looks like a rendering error rather than a decision. */
    KIT_ZONES[corniche.id].push({ x0:b.min.x - 2, x1:b.max.x + 2, z0:b.min.z - 2, z1:b.max.z + 2 });
  }

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
  /* GONE WHEN THE FOOTPRINTS ARE ON, and not merely hidden.

     These 44 buildings exist to fill ground the generator could not describe. That ground now has
     20,245 surveyed buildings on it, and low and row stand in the middle of them at coordinates
     that were authored when nothing real was there. They are Groups of plain Meshes, so hideFabric
     — which only looks at InstancedMesh — has never once been able to see them, which is why they
     survived every pass of the masking work.

     Not added at all rather than added and hidden, because a landmark is worth keeping and a
     filler block is not, and the distinction is the whole point of this change. */
  if (!NO_KIT && !FP_MODE) [low, row].forEach(o => { o.position.y = GROUND; D.add(o); });

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
  const massDark  = stdMat({ color:0x161C22, roughness:0.9 });
  const massGlass = stdMat({ color:0x111C22, roughness:0.4, metalness:0.1 });
  const bandWarm  = stdMat({
    color:0x0E141A, roughness:0.6, emissive:C.gold, emissiveIntensity:0.42 });
  const bandCool  = stdMat({
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
  /* Derived from the anchor, and 30 wide was wrong anyway: the detail palace reaches 12.4 units
     either side of centre once the wings are counted, so a 30-wide mass block overhung its own
     detail version by 2.6 units at each end and grew the island's west end on zoom-out. */
  massBlock(LM.palace.x,     LM.palace.z,     25, 6.5, 11, false, true, 0.34);
  massBlock(LM.palace.x - 8, LM.palace.z + 2,  8, 9.0,  8, false, true, 0.40);   // the dome mass

  // Etihad Towers: real spacing and real height ratios, slim and cool.
  /* THE MASS CLUSTER HAD NO DEPTH SCATTER AND THE DETAIL ONE DOES, so the outer towers jumped
     3.0 units — 23 metres — the instant an island was tapped. That is the LOD contract broken in
     the most visible object in the scene: tapping must ADD, never move.

     This list is now the SAME dx and dz as w2h-city.js's etihadTowers spec, so the two layers
     stand on one set of coordinates. It is duplicated across two modules, which is not ideal, but
     the alternative is world.js importing a geometry kit's internal layout table; the guard is
     that they are written identically and the audit measures the displacement. */
  ETIHAD_SPEC.forEach(t => {
    massBlock(LM.etihad.x + t.dx, LM.etihad.z + t.dz, 4.2, t.h, 4.2, true, false, 0.30);
  });

  // ADNOC HQ: the tall slim anchor at the eastern end.
  massBlock(LM.adnoc.x, LM.adnoc.z, 7.6, 44, 4.8, true, false, 0.14);

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

/* ===========================================================================
   YAS — THE FIRST HAND-BUILT LANDMARKS OUTSIDE THE CORNICHE.

   FERRARI WORLD AND YAS MALL TOGETHER, because they are one complex. The mall's eastern edge runs
   into the roof's western points and the two are joined; modelling one and leaving the other a
   flat OSM extrusion would look worse than leaving both flat, since a shaped roof beside a grey
   slab draws the eye straight to the slab.

   KIT_ZONES[yas.id] IS AS MUCH THE POINT AS THE MODELS ARE.

   Only Corniche initialised its zone list, because only Corniche had a kit. Every other island
   fell through to `KIT_ZONES[d.id] || []` and dropped nothing — correct while there was nothing
   to drop. The moment a hand-built landmark stands on Yas without a zone, the OSM box stands
   inside it: two Ferrari Worlds interpenetrating, one of them a flat slab. That is exactly the
   ADNOC fault, and it will recur on Saadiyat with the Louvre and on Reem with the Gate Towers in
   the same shape for the same reason.

   MEASURED FROM THE OBJECTS, NOT WRITTEN DOWN, so the zone cannot drift from the geometry.

   THE ANCHORS ARE NOT NEW NUMBERS. Both come from the island's own places table, where Ferrari
   World and Yas Mall have been declared since the marks were wired. The models are built to the
   anchors rather than beside them, so the labels and the roofs cannot disagree. */
const yas = DISTRICTS.find(d => d.id === 'yas');
KIT_ZONES[yas.id] = [];
if (!NO_KIT && kit.ferrariWorld && kit.yasMall){
  const at = nm => (yas.places || []).find(pl => pl.label === nm);
  const built = [];
  const fwA = at('Ferrari World'), ymA = at('Yas Mall');
  if (fwA && ymA){
    /* FERRARI WORLD AND YAS MALL ARE ONE STRUCTURE, AND THE BAKE PROVES IT. Overture returns them
       as a SINGLE merged polygon, 785 x 679 m — only about a hundred metres larger than Ferrari
       World on its own. A mall hanging off an arm tip would have added four hundred. So the mall
       tucks into a VALLEY between two arms, and both the roof's orientation and the mall's
       position follow from that rather than from two independent anchors.

       WHY THE MALL IS NOT PLACED ON ITS OWN ANCHOR. Its baked point is 184 m from Ferrari World's,
       and the mall is about 400 m long — so a mall centred there has half of itself inside the
       roof, which is exactly what happened. That point is a label node somewhere in the merged
       complex, not the mall's centroid. Placing the model on it put the car decks through the
       middle of Ferrari World. The anchor still sets the DIRECTION, which is all it can be
       trusted for; the distance is measured off the roof.

       MEASURED FROM THE OBJECT, NOT WRITTEN DOWN — same rule as the zones below. The valley edge
       is found by probing the built roof along the bearing, so if the tri-form's constants ever
       change the mall follows it instead of drifting. */
    const bear = Math.atan2(ymA.z - fwA.z, ymA.x - fwA.x);
    const fwG = kit.ferrariWorld(fwA.x, fwA.z, bear);
    built.push(fwG);

    fwG.updateMatrixWorld(true);
    let edge = 0;
    fwG.traverse(o => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const pa = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pa.count; i++){
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        const dx = v.x - fwA.x, dz = v.z - fwA.z;
        const dth = Math.atan2(Math.sin(Math.atan2(dz, dx) - bear),
                               Math.cos(Math.atan2(dz, dx) - bear));
        if (Math.abs(dth) < 0.04) edge = Math.max(edge, Math.hypot(dx, dz));
      }
    });

    /* The retail end meets the roof; the car decks face away, which is the way round they are. */
    const probe = kit.yasMall(0, 0, 0);
    probe.updateMatrixWorld(true);
    const near = new THREE.Box3().setFromObject(probe).max.x;
    const R = (edge || 17.3) + near;
    built.push(kit.yasMall(fwA.x + Math.cos(bear) * R, fwA.z + Math.sin(bear) * R,
                           bear + Math.PI));
  } else if (fwA){
    built.push(kit.ferrariWorld(fwA.x, fwA.z));
  }

  /* ETIHAD ARENA, PLACED FROM THE BAKE AND NOT FROM THE PLACE TABLE. It has no `places` entry on
     purpose — the table is held at five so the labels do not collide — but the bake carries its
     anchor, and Corniche already reads its landmarks that way for Emirates Palace, Etihad Towers
     and ADNOC. No new coordinate is invented; if the anchor is missing the arena simply does not
     appear, which is the right failure for a building nobody has asked to see yet. */
  const eaA = BASE && BASE[yas.id] && BASE[yas.id].landmarks
            ? BASE[yas.id].landmarks['Etihad Arena'] : null;
  if (eaA && kit.etihadArena) built.push(kit.etihadArena(eaA.x, eaA.z));
  else if (!eaA) console.warn('w2h-world: no baked anchor for Etihad Arena — not placed');

  /* THE HILTON, AND IT IS A LITERAL BECAUSE THE BAKE HAS NO ANCHOR FOR IT. Not in d.landmarks —
     Yas carries six and this is not one — so unlike the arena there is nothing to read.

     THE FIGURES COME FROM EIGHT SURVEYED POINTS ON THE BUILT MASS, fitted: centre at bake
     (18353.4, -3428.1) m, which is island (-23.7, 388.7), long axis 11.8 degrees from east. The
     bake's own conflated box for the same plot sits at 13.6 degrees, so the orientation has two
     independent sources agreeing to within two degrees. Facing is the negative of the bake-frame
     bearing because island z runs opposite to bake y.

     IT GOES THROUGH `built`, WHICH IS THE WHOLE POINT. That loop pushes a KIT_ZONE, and this is
     the one landmark on Yas that genuinely needs one: the footprint underneath is 270 x 136 m of
     conflated plot at a flat 40 m, and without the zone the authored hotel would stand inside a
     slab of its own forecourt. The pier never did this, and the pier was never right. */
  /* z STAYS AT 388.7. It was moved to 412.7 on the pool pins and that was the wrong correction:
     the ground footprint here is right, so the anchor was right, and shifting it put the mass half
     over the water. The pool pins were true — they meant the COURT sits 26 m seaward within the
     building, not that the building sits 24 m seaward in the world. Fixed in the geometry instead,
     where it belonged. */
  if (kit.hiltonYasBay) built.push(kit.hiltonYasBay(-23.7, 388.7, -0.2057));

  /* THE JETTY, AND IT DELIBERATELY DOES NOT GO THROUGH `built`.

     Everything in that array gets a KIT_ZONE, which is right for a landmark that replaces the
     footprints under it and wrong for this one. Five real footprints stand on this deck already —
     the 71 x 35 m Bushra/Siddharta block and four smaller ones — and they are correct. A zone here
     would delete the restaurants in order to draw the thing they stand on.

     So it is added straight to the detail layer at GROUND: the deck goes UNDER what the bake
     already draws, and the finger berths go beside it. Purely additive, nothing drawn twice.
     Island (-33.55, 416.63) and facing 1.3535 come from the four surveyed corners. */
  if (kit.yasBayJetty){
    const j = kit.yasBayJetty(-33.55, 416.63, 1.3535);
    j.position.y = GROUND;
    yas.detail.add(j);
  }

  /* THE YAS BAY PIER IS NOT PLACED, AND THE REASON IT WAS EVER PLACED HERE WAS A NAME.

     Every version of this block pushed a hand-built deck SEAWARD from the surveyed root until it
     cleared the outline, on the premise that the pier stands over water and the footprint pass
     therefore cannot carry it. Four coordinates across Yas Bay say otherwise. All four are INSIDE
     the resampled outline: Asia Asia 24.458075/54.600032 sits 26 m from the coast, the Waterfront
     View Point at the tip 24.456604/54.600592 is 31 m from it, and the Hilton and Etihad Arena are
     115 to 145 m inside. Pier71 is a reclaimed promontory. The outline already turns south around
     it and nine baked footprints already stand on it, the largest 71 x 35 m.

     So the bake has been drawing this waterfront correctly the whole time, and the deck was a
     second copy of it dropped in the bay alongside. THAT is why nothing read: not the y value, not
     the kit guard, not the seaward search — the search worked, and it worked its way off the land
     the building actually occupies.

     WHAT IS STILL MISSING is the real pier — the jetty with the moorings, immediately alongside
     the promontory. That one IS over water and the footprint pass does clip it, so it is the one
     structure on this waterfront that will need hand-building. It is a different and much smaller
     thing than kit.yasBayPier describes, and it needs its own two coordinates.

     kit.yasBayPier is left in the kit, unplaced. If Pier71 is ever wanted as an authored landmark
     rather than as footprints, it goes on the promontory centre — bake (18325, -3617) m, island
     (-27.3, 412.9) units — and it goes in KIT_ZONES so the nine footprints beneath it are
     suppressed, which is what every other landmark in this function does and what this one never
     did. Its scale is corrected in w2h-city.js; it was 25 per cent oversized. */

  for (const o of built){
    o.position.y = GROUND;
    yas.detail.add(o);
    o.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(o);
    /* Two units of margin, about sixteen metres, for the reason the Corniche zones carry it: the
       authored roof and the surveyed outline agree on roughly where a building is and not on its
       exact edge, and a zone drawn tight leaves a sliver of the flat one poking out — which reads
       worse than either fault alone because it looks like a rendering error rather than a
       decision. */
    if (isFinite(b.min.x)){
      KIT_ZONES[yas.id].push({ x0:b.min.x - 2, x1:b.max.x + 2, z0:b.min.z - 2, z1:b.max.z + 2 });
    }
  }
}

/* ---------- the four placeholders ---------- */
/* PER-ISLAND, AND CALLABLE LATER. Was a forEach; the body is unchanged. */

/* ===========================================================================
   STAGE 3a. REAL BUILDING FOOTPRINTS.

   The bake has been writing oriented boxes into every island payload for some time and nothing
   has ever fetched them: loadIsland and buildingsUnits are both exported by w2h-basemap.js and
   neither is called anywhere. So this is the first time the scene has seen a real building.

   WHAT THIS IS NOT. It does not replace the generated fabric. urbanFabric still runs and still
   returns its cells and blocks, because groundPlan reads those to decide where parks go and where
   pavement is painted, and footprints give you buildings rather than empty space. Solving the
   ground from real footprints is the larger half of stage 3 and it is deliberately not in this
   deploy: two changes with very different failure shapes, landing together, is how three separate
   faults today became one unattributable symptom. Footprints either land on the coastline or they
   do not, and that is checkable in one look.

   So ?fp hides the fabric's MESHES and shows these instead, while the fabric's arithmetic carries
   on feeding the painter. The cost is that urbanFabric's time stays on the clock. That is the
   honest price of not breaking the ground, and it comes off once the ground no longer needs it.

   HEIGHTS. About a fifth of the stock carries a real height from OSM. The rest gets the same
   shape of model the fabric uses — a cap that falls away from the district core, softened by the
   low-rise zones through cellCap — rather than a constant, because a constant would flatten every
   skyline in the city to one number and look instantly wrong next to the 3,807 that are right.
   Which is which is recorded and shown, since a modelled height and a surveyed one are otherwise
   indistinguishable and only one of them is evidence. */
/* ===========================================================================
   GROUND FEATURES — THE GOLF COURSE AND THE RACE CIRCUIT.

   FLAT MESHES, NOT PAINT, AND THAT WAS A DELIBERATE FORK. Both could have gone into the ground
   canvas, which is where they conceptually belong. They did not, because paintGround runs at
   island BUILD time and the island payload arrives asynchronously — so painting them would have
   required loading the payload before the build, and a prefetch race of exactly that shape
   already made Al Maryah render generated-or-real non-deterministically per load. These take the
   path footprintsFor already proves works: build the island, then add to it.

   A dark ribbon with kerbs reads the same whether it is canvas or geometry, and geometry can do
   two things canvas cannot at this scale — real kerb edges, and the run-off apron sitting under
   the track rather than being composited with it.

   COORDINATES. golfUnits and racewayUnits return WORLD-space units on the island's own frame,
   the same convention buildingsUnits uses, so the coastline test converts the same way
   footprintsFor's does: nx = x / d.r, ny = -z / d.r.
   =========================================================================== */

/* One ribbon. Offsets each point along the averaged normal of its adjacent segments, which miters
   the joints well enough at this width and avoids the pinching a per-segment normal gives on the
   hairpins — and this circuit has several. */
function ribbon(pts, half, y, set){
  const n = pts.length;
  if (n < 2) return null;
  const pos = [], idx = [];
  for (let i = 0; i < n; i++){
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const nx = -dz, nz = dx;                  // left normal
    pos.push(pts[i][0] + nx * half, y, pts[i][1] + nz * half);
    pos.push(pts[i][0] - nx * half, y, pts[i][1] - nz * half);
  }
  /* WINDING, VERIFIED BY CROSS PRODUCT AND NOT BY READING IT. The first version wound these
     clockwise seen from above, so computeVertexNormals gave every ribbon a normal of (0,-1,0) and
     MeshStandardMaterial's default FrontSide culled the lot. Every gate passed, all fourteen ways
     built, gfState said 'on', and the circuit was invisible because it was facing the seabed.

     The parkland shapes came out the other way up — ShapeGeometry plus the y -> -z remap happens
     to land normals at (0,+1,0) — which is why the greenery appeared and the track never did.
     Same file, same pass, opposite winding, and only one of them checkable by looking. */
  for (let i = 0; i < n - 1; i++){
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, set.base);
  m.receiveShadow = true;
  return tagGround(m, set);
}

/* A FULL MATERIAL SET, NOT ONE MATERIAL, AND THE FIRST VERSION OF THIS WAS WRONG IN THREE WAYS.

   applyView reads dayMats, duskMats, planMats and `ground` off the MESH. The first flatMat hung
   dayMats on the MATERIAL, which every other call site in this file does not — so in Day these
   features fell through to the switcher's generic pale dayMat and lost their colour entirely.

   Worse at dusk. registerLift skips any mesh carrying duskMats; without one, every ribbon and
   fairway was registered and repainted with DUSK_STONE along with the city. That is why Yas read
   uniformly brown at dusk and green at night — same geometry, two different materials, and only
   one of them mine.

   And with no `ground` flag they were hidden outright in Plan, which is the one view built for
   judging exactly this: whether a painted street and the thing standing on it register.

   Six views, and a mesh has to answer for all of them. */
/* THREE COLOURS, NOT TWO, AND THEY ARE DERIVED FROM THE GROUND RATHER THAN CHOSEN.

   The first version gave night and dusk one shared value, picked by eye. The island ground under
   these features is 0xD8D2C4 in Day, 0xC6B99E at dusk and 0x68737E at night — it swings hard — so
   one value cannot hold a constant relationship to it, and the parkland duly vanished at dusk
   while reading fine in Day and Check. Measured: the lawn should sit at 0.51/0.67/0.42 of the
   ground per channel, and it was shipping at 0.23/0.38/0.25. About half as bright as it should be,
   which at dusk is the difference between grass and a hole in the island.

   So every ground feature now declares its DAY colour, and its dusk and night values are that
   colour's per-channel ratio to the day ground, applied to the dusk and night ground. The
   relationship is then identical in all three, which is what makes the greenery read the same
   everywhere instead of only where it was eyeballed. */
function flatSet(night, dusk, day, rough, bias){
  const r = rough == null ? 0.9 : rough;
  /* POLYGON OFFSET, BECAUSE THE Y GAP IS FAR BELOW DEPTH PRECISION.

     These features were lifted 3 to 14 cm above the island's top face and that is nowhere near
     enough. With a 1..9258 frustum on a 24-bit buffer, one depth step is 7 cm at 400 units, 46 cm
     at 1,000 and 5.2 METRES at the district camera's 3,334 — so the ground and the greenery
     resolve to the same depth value and the hardware flickers between them. That is the fritzing,
     and it is geometry, not colour: no palette change could ever have fixed it.

     Raising the meshes is not the answer either, because the offset would have to be metres and
     the parkland would visibly float. polygonOffset biases the depth TEST rather than the
     position, so it is scale-independent and the features stay flush.

     `bias` also preserves the stacking order — run-off under kerb under asphalt — which the tiny
     y offsets alone can no longer be trusted to do. */
  const po = { polygonOffset:true,
               polygonOffsetFactor:-(bias || 1), polygonOffsetUnits:-(bias || 1) * 2 };
  const base = new THREE.MeshStandardMaterial({ color:night, roughness:r, ...po });
  base.userData.duskColor = dusk;
  const duskM = new THREE.MeshStandardMaterial({ color:dusk, roughness:r, ...po });
  duskM.userData.duskColor = dusk;
  return {
    base,
    dayM:  new THREE.MeshStandardMaterial({ color:day, roughness:r, ...po }),
    duskM,
    /* MeshBasic for Plan and Check, matching what the island ground does: no light, no shadow, no
       exposure. A lit green polygon lying on an unlit plan texture reads as a different drawing. */
    planM: new THREE.MeshBasicMaterial({ color:day, ...po }),
  };
}

/* LIT AT DUSK AND NIGHT, DARK BY DAY. The Abu Dhabi Grand Prix is a twilight race and the circuit
   is floodlit: in every night capture the painted run-off is not merely visible, it is the
   BRIGHTEST thing in the frame — a glowing teal ribbon with white kerbs, against a black island.

   That solves the dusk problem properly rather than by tinting. Correcting the albedo got the
   relationship to the ground right, but a horizontal surface at dusk takes grazing light from a
   sun thirteen degrees up, so everything on the ground goes dim whatever colour it is. Emission
   does not care about incidence.

   Applied to the NIGHT and DUSK materials only. The day material is left alone, because in
   daylight the run-off is just blue paint. */
function glow(set, hex, iNight, iDusk){
  set.base.emissive = new THREE.Color(hex);  set.base.emissiveIntensity = iNight;
  set.duskM.emissive = new THREE.Color(hex); set.duskM.emissiveIntensity = iDusk;
  return set;
}

/* Every ground-feature mesh is tagged the same way, in one place, because doing it at each
   construction site is how three of the four fields got missed the first time. */
function tagGround(mesh, set){
  mesh.userData.dayMats  = set.dayM;
  mesh.userData.duskMats = set.duskM;
  mesh.userData.planMats = set.planM;
  mesh.userData.ground   = true;
  return mesh;
}

function groundFeaturesFor(d, feats){
  if (!feats) return null;
  const g = new THREE.Group();
  g.name = 'groundFeatures';
  const onIsle = (x, z) => insideIsle(d.id, x / d.r, -z / d.r);

  /* ---- the golf course ---- */
  const fairway = flatSet(0x354E32, 0x657E3F, 0x6E8F4E, 0.9, 2);
  let golfN = 0;
  for (const ring of (feats.golf || [])){
    if (ring.length < 4) continue;
    let inside = 0;
    for (const p of ring) if (onIsle(p[0], p[1])) inside++;
    /* A course that is mostly outside the shore is a course the bake picked up from the
       neighbouring island's bounding box, not one of ours. Majority test rather than all, because
       a links course legitimately runs right down to the waterline and clips it. */
    if (inside < ring.length * 0.5) continue;
    const shape = new THREE.Shape();
    shape.moveTo(ring[0][0], -ring[0][1]);
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, fairway.base);
    m.position.y = GROUND + 0.008;
    m.receiveShadow = true;
    g.add(tagGround(m, fairway)); golfN++;
  }

  /* ---- real parkland ----
     TINTED BY KIND, NOT FILTERED BY SIZE, and the measurement is why. Corniche carries 2,227 ha
     of green against 9,163 ha of land - 24 per cent - and Yas 22 per cent. For a city irrigated
     as heavily as this one that is roughly right, so a size cap was solving the wrong problem: an
     earlier version dropped anything over 12 ha and still kept 1,319 of 1,321 rings, because the
     blankets are individually small and collectively large.

     WHAT WOULD ACTUALLY HAVE LOOKED WRONG is the composition. Corniche's single biggest polygon
     is a 986 ha `nature_reserve` - the mangroves - and Yas's is 194 ha of `meadow`. Painting
     either the same mown green as a city park is the fault. Three tones instead:

       lawn    park, garden, common, recreation_ground, village_green, pitch
       dry     grass, meadow          - irrigated verge and dry ground, yellower
       canopy  forest, nature_reserve - mangrove and plantation, darker

     UNKNOWN KINDS ARE DROPPED, and that is a real filter rather than a defensive one: the bake's
     branch ends in a `|| t.landuse` catch-all, which let `landuse=commercial` and
     `outdoor_seating` through. Neither is green. An explicit map means a surprise tag is invisible
     rather than bright green, and it costs no re-bake to change.

     THREE MERGED GEOMETRIES, NOT 1,321 MESHES. That many draw calls on the heaviest island in the
     scene is not a trade worth discussing. */
  const TONE = { park:0, garden:0, common:0, recreation_ground:0, village_green:0, pitch:0,
                 grass:1, meadow:1,
                 forest:2, nature_reserve:2 };
  const greenMat = [ flatSet(0x354D35, 0x667B42, 0x6F8C52, 0.9, 1),   // mown
                     flatSet(0x414B3A, 0x7C7949, 0x87895A, 0.9, 1),   // dry
                     flatSet(0x243B27, 0x445E30, 0x4A6B3C, 0.9, 1) ]; // canopy
  const gv = [[], [], []], gi = [[], [], []];
  let parkN = 0;
  for (const ring of (feats.parks || [])){
    const t = TONE[ring.kind];
    if (t === undefined || ring.length < 4) continue;
    let inside = 0;
    for (const p of ring) if (onIsle(p[0], p[1])) inside++;
    if (inside < ring.length * 0.5) continue;
    const shape = new THREE.Shape();
    shape.moveTo(ring[0][0], -ring[0][1]);
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
    shape.closePath();
    let geo;
    try { geo = new THREE.ShapeGeometry(shape); } catch (e){ continue; }
    const pos = geo.attributes.position, ix = geo.index;
    if (!pos || !ix){ geo.dispose(); continue; }
    const base = gv[t].length / 3;
    /* ShapeGeometry lays out in XY; this reads it straight into world XZ, so shape-y becomes -z.
       Getting that sign wrong mirrors the parkland north to south, which still looks plausible
       and is therefore the failure worth naming. */
    for (let i = 0; i < pos.count; i++)
      gv[t].push(pos.getX(i), GROUND + 0.006 - t * 0.001, -pos.getY(i));
    for (let i = 0; i < ix.count; i++) gi[t].push(base + ix.getX(i));
    geo.dispose();
    parkN++;
  }
  for (let t = 0; t < 3; t++){
    if (!gv[t].length) continue;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(gv[t], 3));
    pg.setIndex(gi[t]);
    pg.computeVertexNormals();
    const pm = new THREE.Mesh(pg, greenMat[t].base);
    pm.receiveShadow = true;
    g.add(tagGround(pm, greenMat[t]));
  }

  /* ---- the circuit ----
     ALTERNATE LAYOUTS ARE DROPPED. Yas returns 13.3 km of raceway, of which only 5.3 km is the
     Grand Prix circuit; 5.0 km of it is the shorter configurations, which run over the SAME
     tarmac. Drawing them lays four circuits on top of each other and the ribbon z-fights itself. */
  const asphalt = flatSet(0x1C212A, 0x353635, 0x3A3D42, 0.95, 5);
  /* The kerbs read as a bright white outline under the floods; the run-off is the teal ribbon
     that identifies this circuit from the air. Dusk is roughly half of night, because the sky
     still carries some light and a fully lit track before dark reads as a mistake. */
  const kerb    = glow(flatSet(0x74808D, 0xDCCEB1, 0xF0EADC, 0.8, 4),  0xFFF0D8, 0.55, 0.28);
  const runoff  = glow(flatSet(0x235B82, 0x4392A4, 0x49A6CB, 0.85, 3), 0x2FD5D0, 0.95, 0.45);
  /* WIDER THAN LIFE, DELIBERATELY. Drawn at its true 15 m the circuit was invisible: every gate
     passed, all fourteen ways built, and at district range a 15 m ribbon on a 7.3 km island is a
     hairline that reads as one more dark road among ten thousand. What identifies this circuit
     from the air is the BLUE RUN-OFF, so it is the widest band and carries the colour; the kerb
     is the bright edge that gives the loop its outline. Same argument as Ferrari World's black
     rim — at this scale the edge makes a shape legible, not the fill. */
  const W = { circuit:[1.15, 1.75, 4.20], pit:[0.85, 1.15, 2.10], kart:[0.50, 0.70, 0] };
  let trackN = 0;
  for (const way of (feats.raceway || [])){
    const w = W[way.kind];
    if (!w || way.length < 2) continue;
    const mid = way[Math.floor(way.length / 2)];
    if (!onIsle(mid[0], mid[1])) continue;
    if (w[2]){ const r = ribbon(way, w[2], GROUND + 0.010, runoff); if (r) g.add(r); }
    const k = ribbon(way, w[1], GROUND + 0.014, kerb);    if (k) g.add(k);
    const a = ribbon(way, w[0], GROUND + 0.018, asphalt); if (a) g.add(a);
    trackN++;
  }

  d.golfN = golfN; d.trackN = trackN; d.parkRealN = parkN;
  /* ---- YAS BAY: LAND USE, AND IT LIVES HERE BECAUSE IT IS A GROUND FEATURE ----

     THE FIRST VERSION OF THIS WAS ATTACHED IN THE LANDMARK PASS AND DREW NOTHING. Not broken —
     UNREGISTERED. Every ground feature in this file is added to a group that world-nav then puts
     through `snapshotMats(g); registerLift(g); applyView(view)`, and meshes that skip those three
     calls get swept by applyView into a state that never renders. Nothing throws, nothing warns,
     and the counters all look healthy. Building it in the right place is the fix; there was never
     anything wrong with the geometry.

     THE BANDS ARE MEASURED. Fifty-nine surveyed pins across this waterfront, sorted by distance
     to the baked coastline, fall into groups with EMPTY GAPS between them — nothing between 40
     and 46 m, nothing between 79 and 88 m. So the thresholds sit in space the data does not
     occupy, which is the only kind of threshold worth writing down:

       BEACH        outer 22 m of the shore band
       PROMENADE    22 to 43 m, paved
       DECK/GARDEN  43 to 83 m, pool terraces and planting
       BUILT        beyond 83 m, painted not extruded

     THE CHANNEL IS THE EXCEPTION. Between the pier and the shore the edge is quay wall, paved to
     the waterline, which is why Asia Asia stands 25 m out on hard standing rather than on sand.
     Without it the whole marina edge came back as beach, which it plainly is not. */
  if (d.id === 'yas' && SITE_YASBAY && outlineClosed(d.id)){
    const ring = outlineClosed(d.id).map(p => [p[0] * d.r, -p[1] * d.r]);
    const CO = [];
    for (let i = 0; i < ring.length; i++){
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * M_PER_UNIT / 8));
      for (let t = 0; t < n; t++) CO.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]);
    }
    const nearM = (x, z) => { let m = Infinity;
      for (const q of CO){ const dx = q[0] - x, dz = q[1] - z, dd = dx * dx + dz * dz; if (dd < m) m = dd; }
      return Math.sqrt(m) * M_PER_UNIT; };
    const inPoly = (P, x, z) => { let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++){
        const xi = P[i][0], zi = P[i][1], xj = P[j][0], zj = P[j][1];
        if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c; }
      return c; };

    const CELL = 5 / M_PER_UNIT;
    const cells = [[], [], [], [], []];
    /* Counted BEFORE the clip, because `b` absent has meant two different things all evening —
       block never ran, and block ran and kept nothing — and the counter could not tell them apart. */
    let siteN = 0;
    let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
    for (const p of SITE_YASBAY){ bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]);
                                  bz0 = Math.min(bz0, p[1]); bz1 = Math.max(bz1, p[1]); }
    for (let x = bx0; x < bx1; x += CELL) for (let z = bz0; z < bz1; z += CELL){
      const mx = x + CELL / 2, mz = z + CELL / 2;
      if (!inPoly(SITE_YASBAY, mx, mz)) continue;
      /* THE PIER IS NOT GROUND. The baked coastline carries the Yas Bay Waterfront deck as part of
         the island, so the shoreline bulges 17 units south between x -38 and -24 where the real
         thing is a structure standing on piles over open water. The outline itself is not mine to
         rewrite here, but paving it made it read as reclaimed land, which is what showed. The
         cells are withheld so the deck sits on its own footprint instead. */
      if (mx > -38 && mx < -24 && mz > 412) continue;
      siteN++;
      if (!BAY_ALL && !onIsle(mx, mz)) continue;
      const dd = nearM(mx, mz);
      let b;
      if (dd < 43){
        const chan = mx > -53.6 && mx < -22.8 && mz > 397.4 && mz < 420.5;
        b = (dd < 22 && !chan) ? 0 : 1;
      } else if (dd < 83){
        /* NOT A LAWN. Everything from the buildings down to the sand is hard landscaping — the
           green band read as parkland and it is concrete. What breaks it is a planted ribbon
           rather than an expanse: one strip, 60 to 68 m out, which is where the tree line runs. */
        b = (dd >= 60 && dd < 68) ? 4 : 2;
      } else b = 3;
      cells[b].push([x, z]);
    }
    /* Sand, paving, planted deck, built ground. Keyed off the island's own day/dusk/night ramp
       through flatSet, so they move with it instead of being three colours picked once. */
    const BAY = BAY_DEBUG
      ? [flatSet(0xFF00AA, 0xFF00AA, 0xFF00AA, 0.95, 6),
         flatSet(0x00E5FF, 0x00E5FF, 0x00E5FF, 0.95, 6),
         flatSet(0x7CFF00, 0x7CFF00, 0x7CFF00, 0.95, 6),
         flatSet(0xFF8A00, 0xFF8A00, 0xFF8A00, 0.95, 6),
         flatSet(0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0.95, 6)]
      /* THE SAND WAS LOSING TO THE GROUND IT SITS ON. Every one of these was within a few per cent
         of the island's own painted sand, so four correct surfaces read as one. The beach is now
         pushed light and warm, the promenade and the deck are separated from each other, and the
         planted ribbon is the only green left. */
      : [flatSet(0x7C7160, 0xDCC9A4, 0xF3E4C2, 0.95, 6),
         flatSet(0x5F6670, 0xB6AE9E, 0xD8D2C4, 0.92, 6),
         flatSet(0x4A5158, 0x9E9A90, 0xBFBAAE, 0.90, 6),
         flatSet(0x596069, 0xADA694, 0xC8C2B2, 0.90, 6),
         flatSet(0x36452F, 0x63734A, 0x6E8154, 0.90, 6)];
    let bayN = 0;
    cells.forEach((cs, i) => {
      if (!cs.length) return;
      const pos = new Float32Array(cs.length * 18), nor = new Float32Array(cs.length * 18);
      /* THE LEDGE, AND WHY THE SAND STOPPED SHORT OF THE WATER. Every island is an ExtrudeGeometry
         with bevelSize 1.6 units, so its flat top ends 12.5 m INSIDE the coastline and a sloped
         bevel carries the last 12.5 m down half a unit to the waterline. A flat plate at GROUND
         therefore ends 12.5 m short of the sea and floats over the slope on the way. Each vertex
         inside that margin is now dropped onto the bevel instead, so the beach runs into the water
         the way a beach does. Only the outer bands are draped — nothing 43 m inland is near it. */
      const drape = (vx, vz) => {
        if (i > 1) return 0;
        const du = nearM(vx, vz) / M_PER_UNIT;
        return du >= ISLE_BEVEL_S ? 0 : -ISLE_BEVEL_T * (1 - du / ISLE_BEVEL_S);
      };
      cs.forEach(([x, z], j) => {
        const o = j * 18, X = x + CELL, Z = z + CELL;
        const yA = drape(x, z), yB = drape(X, z), yC = drape(X, Z), yD = drape(x, Z);
        /* WINDING, AND IT IS THE WHOLE FAULT. The first version wound both triangles
           (x,z)-(X,z)-(X,Z), whose cross product is -Y: every quad faced DOWNWARD while its
           written vertex normal said up. flatSet materials are MeshStandardMaterial with no
           `side`, so they are FrontSide, and the GPU culled all 6,934 cells from any camera
           above the ground. Nothing threw, the counter was correct, the clip was correct, and
           the surfaces were built exactly where they belong — facing the seabed. The pools
           survived because PlaneGeometry winds itself. */
        const q = [x,yA,z, x,yD,Z, X,yC,Z, x,yA,z, X,yC,Z, X,yB,z];
        for (let t = 0; t < 18; t++){ pos[o + t] = q[t]; nor[o + t] = t % 3 === 1 ? 1 : 0; }
      });
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bg.setAttribute('normal',   new THREE.BufferAttribute(nor, 3));
      const m = new THREE.Mesh(bg, BAY[i].base);
      m.position.y = GROUND + 0.004;
      m.receiveShadow = true;
      g.add(tagGround(m, BAY[i])); bayN += cs.length;
    });

    /* THE CAR PARK. Four surveyed corners: 99 x 227 m, diagonals 246 and 248 against a predicted
       248, so it closes as a true rectangle. Its own plot, outside the band structure. */
    const CPk = [[-45.90,392.10],[-43.05,404.42],[-71.57,410.41],[-74.42,399.00]];
    const cpc = CPk.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    const cpTh = Math.atan2(CPk[3][1] - CPk[0][1], CPk[3][0] - CPk[0][0]);
    const tar = flatSet(0x22262B, 0x44484D, 0x4B5056, 0.95, 6);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(227 / M_PER_UNIT, 99 / M_PER_UNIT), tar.base);
    cp.rotation.x = -Math.PI / 2; cp.rotation.z = -cpTh;
    cp.position.set(cpc[0], GROUND + 0.006, cpc[1]);
    cp.receiveShadow = true;
    g.add(tagGround(cp, tar));
    const line = flatSet(0x6A6E72, 0xB8BCC0, 0xD2D6DA, 0.9, 7);
    for (let i = -2.5; i <= 2.5; i++){
      const st = new THREE.Mesh(new THREE.PlaneGeometry(219 / M_PER_UNIT, 0.9 / M_PER_UNIT), line.base);
      st.rotation.x = -Math.PI / 2; st.rotation.z = -cpTh;
      const c2 = Math.cos(cpTh), s2 = Math.sin(cpTh), off = i * 15.5 / M_PER_UNIT;
      st.position.set(cpc[0] - off * s2, GROUND + 0.008, cpc[1] + off * c2);
      g.add(tagGround(st, line));
    }

    /* THE POOLS, WHICH WERE DRAWN ON THE PLAN AND NEVER BUILT. Three of them: the two Hilton
       courtyards between the arms of the E, and the sea-edge pool at the headland — the one that
       reads as an infinity edge in every photograph of this hotel. Water, so they get their own
       ramp rather than the ground's: bright in Day, dark and reflective at night. */
    const wat = flatSet(0x14313B, 0x2E7E92, 0x37A6C0, 0.25, 8);

    /* CAFE DEL MAR BEACH CLUB, SURVEYED. Fourteen dropped pins around the peninsula, converted
       through the frame index.json declares — origin lat 24.49, lon 54.42, metres east and north:

         x = (lon - 54.42) * 101313        local_x = (x - 18538.2) / 7.8
         y = (lat - 24.49) * 110540        local_z = -(y + 396.5) / 7.8

       Taken as a convex hull they close at 276 m round and 0.48 ha, and the hull contains both the
       pool pin and Google's own Cafe del Mar label while excluding the bar building to landward —
       three consistency checks the plan artefact failed. The bake carries this peninsula as five
       fragments with NO HEIGHT on any of them, which is why it renders as flat clutter; the deck,
       the pool and the pavilion are all ground-plane, so they read without needing one. */
    const CLUB = [[-26.06,403.34], [-23.66,401.70], [-14.28,399.38], [-13.05,404.80],
                  [-14.07,407.09], [-21.76,408.18], [-22.81,408.32], [-24.32,406.48]];
    const deck = flatSet(0x6A6157, 0xC3B9A6, 0xE2D8C4, 0.90, 7);
    const cs = new THREE.Shape();
    cs.moveTo(CLUB[0][0], -CLUB[0][1]);
    for (let i = 1; i < CLUB.length; i++) cs.lineTo(CLUB[i][0], -CLUB[i][1]);
    cs.closePath();
    const dm = new THREE.Mesh(new THREE.ShapeGeometry(cs), deck.base);
    dm.rotation.x = -Math.PI / 2;
    dm.position.y = GROUND + 0.020;
    g.add(tagGround(dm, deck));

    /* The circular pavilion at the seaward tip, on Google's label point. Radius from the spread of
       the five pins that ring it, which measure about 30 m across. */
    const pav = flatSet(0x5A5347, 0xA79374, 0xC4AE8A, 0.92, 7);
    const pv = new THREE.Mesh(new THREE.CircleGeometry(15 / M_PER_UNIT, 40), pav.base);
    pv.rotation.x = -Math.PI / 2;
    pv.position.set(-15.0, GROUND + 0.026, 405.4);
    g.add(tagGround(pv, pav));

    /* THE BAR RANGE, AT ONE STOREY. The developer render settles the number the bake could not:
       everything on this peninsula is low, a single-storey white range with a shaded terrace along
       the landward edge, and nothing tall on the club at all. Five metres, not the eight I guessed.
       Corners surveyed as 89 x 21.5 m on the hotel's own bearing, centred (-19.9, 399.0). */
    /* NOT flatSet. That builder is for decals lying on the island: it applies negative polygonOffset
       and its Plan/Check key is MeshBasicMaterial, deliberately unlit so a plan reads as a drawing.
       On a box every face then returns the same flat colour and the thing is indistinguishable from
       a plane viewed from above — which is exactly what it looked like. A building wants shading in
       all four keys and no depth bias, so the set is built by hand here. */
    const barSet = (n, dk, dy) => {
      const mk = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.86 });
      const base = mk(n); base.userData.duskColor = dk;
      const duskM = mk(dk); duskM.userData.duskColor = dk;
      return { base, dayM: mk(dy), duskM, planM: mk(dy) };
    };
    const barMat = barSet(0x3E3A34, 0xBFB6A8, 0xEFEAE0);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(89 / M_PER_UNIT, 5 / M_PER_UNIT, 21.5 / M_PER_UNIT), barMat.base);
    bar.rotation.y = 0.2374;
    bar.position.set(-19.9, GROUND + 2.5 / M_PER_UNIT, 399.0);
    g.add(tagGround(bar, barMat));

    /* THE COURTYARD POOL, ON SEVEN PINS, AND IT WAS WRONG THREE WAYS.

       It read 64 x 22 m at y 0.010. Seven pins dropped around the basin bound it at 30 across by
       47 long, centred at bake (18362.6, -3452.5) — island (-14.5, 413.1). So:

         SIZE      64 x 22 -> 30 x 47. Not a refinement; the old figures were a guess.
         DIRECTION the long axis runs SEAWARD, across the building, not along it. Swapping w and h
                   is the whole fix, and it is why the pool read as a bar lying the wrong way.
         HEIGHT    0.010 units is 8 cm above ground, and the hotel podium is a 7.2 m deck. The pool
                   sat six metres inside it and vanished behind the mass at any oblique angle.
                   Raised to sit on the deck it belongs to.

       POSITION -22.5 / 391.8, THE SEVEN PINS CONVERTED PROPERLY. An earlier pass put this at
       -14.5 / 413.1, seaward of the Cafe del Mar lagoon at 405.3, which cannot be right — the
       courtyard basin is inland of that lagoon. The fault was the conversion, not the pins:
       ISLAND UNITS ARE METRES / 7.8, and the offsets were being applied as metres. A 24 m shift
       became 187 m. Same error moved the whole hotel into the sea earlier in the same session.

       Now done by tools/pin.mjs, which reads extent.cx/cy out of index.json and self-tests against
       this building's own literal. Never convert one of these by hand again.

       STILL A RECTANGLE, AND THAT IS THE REMAINING FAULT. The trace shows a broad inland head with
       a notch, narrowing to a leg — a free-form outline, like the lagoon pool below it. Both want
       shape geometry rather than PlaneGeometry, which is a change to this loop and not to a number
       in it, so it is left visible here rather than half-done. */
    const SHORE_TH = -0.2967, HOTEL_TH = -0.2374;
    const DECK_Y = 7.4 / M_PER_UNIT;
    for (const [px, pz, w, h, th, y] of [[-22.5, 391.8, 30, 47, HOTEL_TH, DECK_Y],
                                         [-18.8, 405.3, 80, 46, SHORE_TH, 0.032]]){
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(w / M_PER_UNIT, h / M_PER_UNIT), wat.base);
      pm.rotation.x = -Math.PI / 2; pm.rotation.z = -th;
      pm.position.set(px, GROUND + y, pz);
      g.add(tagGround(pm, wat));
    }

    d.baySurf = bayN + '/' + siteN;
  }

  return (golfN || trackN || parkN || d.baySurf) ? g : null;
}

/* A HIPPED ROOF, ONE UNIT BOX, BUILT ONCE.

   Base 1 x 1 in xz centred on the origin, apex at y = 1, ridge running along local x from -0.25
   to +0.25. Eight triangles. Scaled per instance to the building's own w, dp and a pitch derived
   from its short side, so a wide villa gets a shallow roof and a narrow one a steeper one, which
   is what actually happens when the pitch is fixed and the span is not.

   WINDING VERIFIED BY CROSS PRODUCT, NOT BY EYE. The bay surfaces cost most of a session to
   exactly this fault - quads wound so every normal faced the seabed under a FrontSide material,
   which renders as nothing at all with no error anywhere. Each of the four planes below was
   checked by taking (b - a) x (c - a) and confirming the sign points away from the ridge. */
function hipRoofGeo(){
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, -0.5,   0.5, 0, -0.5,   0.5, 0,  0.5,  -0.5, 0,  0.5,   // 0..3 eaves
    -0.25, 1, 0,     0.25, 1, 0,                                      // 4,5 ridge
  ];
  const f = [
    3, 2, 5,  3, 5, 4,      // the +z slope
    1, 0, 4,  1, 4, 5,      // the -z slope
    1, 5, 2,                // the +x hip
    0, 3, 4,                // the -x hip
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(f);
  g.computeVertexNormals();
  return g;
}
const ROOF_GEO = hipRoofGeo();

/* WHAT COUNTS AS A HOUSE. Both gates, because either alone is wrong: a 12 m warehouse is low and
   is not a villa, and a 400 m2 shop unit is small and is not one either.

   800 m2 and 12 m catch 1,485 of Saadiyat's 1,842 footprints - 81 per cent - which matches what
   the satellite shows, an island that is overwhelmingly villa carpet with a cultural district and
   some resorts on it. A venue join vetoes: if the bake knows people GO there it is a restaurant or
   a clinic, not a house, whatever its size. */
const VILLA_AREA = 800, VILLA_H = 12;

function footprintsFor(d, list){
  if (!list || !list.length) return null;
  const cool = d.tint === 0x8FD3E8 || d.tint === 0xBFD3E0;
  const MATS = fabricMats(cool);
  /* THE CEILING FOR INVENTING A HEIGHT ON A REAL FOOTPRINT — a different quantity from the
     generated-stock ceiling in buildFabricFor, though both were called `tallest`. Corniche ships
     3,460 surveyed heights against 20,236 buildings, so five in six of the island's skyline comes
     from this number. */
  const tallest = DIS ? DIS.fpTallest(d.id)
                      : ({ corniche:52, maryah:40, reem:44, saadiyat:14, yas:18 }[d.id] || 24);
  let clash = 0;
  const core = d.coreN || [0, 0];
  const rnd = localRnd(hashId(d.id) ^ 0x5BD1E995);

  /* Two passes for the same reason urbanFabric uses two: an InstancedMesh needs its count at
     construction, so everything is sized before anything is written. */
  /* ---------- THE HEIGHT MODEL IS THE ISLAND'S OWN SURVEYED STOCK ----------

     Five in six buildings on Corniche arrive without a height and something has to invent one. The
     inherited model was urbanFabric's falloff — distance from the core against a district ceiling —
     which worked while a plot's size and its height were chosen together and stopped working the
     moment real footprints arrived, because a 130 m² shophouse and a 4,000 m² podium then had equal
     claim on a 52-unit ceiling. tallest is 52 and M_PER_UNIT is 7.8, so the FLOOR under that model
     at the island's edge was 49 metres and in the core 223. Hence a field of needles.

     The obvious repair is a curve through footprint area, and it is wrong. Corniche's 3,807
     surveyed buildings say height rises with area to about 600–1,200 m² and then FALLS: median 6 m
     under 300 m², 22 m at 300–600, 49 m at 600–1,200, and 15 m above 3,000, because the largest
     footprints in a city are malls, terminals and warehouses. No monotonic function of area
     reproduces that, and every one I would have written was monotonic.

     So nothing is fitted. The surveyed buildings on THIS island are binned by footprint, and an
     unsurveyed building draws a height from the bin its own footprint falls in. The spread comes
     free and it is the real spread — Corniche's 300–600 band has a median of 22 m and a ninetieth
     percentile of 80, so a few genuinely tall slabs appear among the low stock exactly as often as
     they actually do. It improves on its own as OSM and Overture improve, and it cannot be wrong
     about a city in a way that city's own data does not already say. */
  const HB = [0, 150, 300, 600, 1200, 3000, Infinity];
  const bandOf = a => { for (let i = 1; i < HB.length; i++) if (a < HB[i]) return i - 1;
                        return HB.length - 2; };
  const areaOf = b => Math.max(1, (b.w || 0) * (b.dp || 0)) * M_PER_UNIT * M_PER_UNIT;
  const bands = HB.slice(0, -1).map(() => []);
  const anyReal = [];
  for (const b of list){
    if (b.h == null || b.h * M_PER_UNIT <= 2) continue;
    bands[bandOf(areaOf(b))].push(b.h);
    anyReal.push(b.h);
  }
  bands.forEach(v => v.sort((p, q) => p - q));
  anyReal.sort((p, q) => p - q);
  /* Eight is enough to carry a spread and few enough that only genuinely empty bands fall through
     to the island-wide pool. Twenty island-wide is the point below which resampling is just
     repeating three numbers, and the old falloff — wrong but continuous — is the better failure. */
  /* THE FALLBACK WAS THE FAULT, NOT THE BANDING. A band needs eight samples; Yas has ONE in
     0-150 m2 and ONE in 150-400, so its villas fell through to the island-wide pool — and that
     pool is 32 buildings with a median of 27 m, because Overture measured Yas's arenas and hotels
     and none of its houses. A 299 m2 villa then drew its height from a hotel.

     That bias is systematic, not a Yas accident. Median footprint of a MEASURED building: Maryah
     3,493 m2, Reem 2,181, Yas 4,094. Median of an UNMEASURED one: 116, 134, 299. Overture measures
     the big ones everywhere, so every island's own pool over-represents exactly what the missing
     buildings are not.

     So a thin band now falls through to THE SAME BAND ON THE OTHER ISLANDS before it falls through
     to this island's mixed pool. Corniche alone ships 3,460 surveyed heights and its small bands
     are dense — median 6 m under 300 m2 — which is a far better answer for a Yas villa than 27.
     Cross-island is defensible here in a way it would not be for, say, a skyline: a 250 m2
     building in Abu Dhabi is a house or a shop wherever on the archipelago it stands.

     Order still matters and still works: Corniche builds first and fills the global bands before
     any outer island asks. If it ever does not, the old island-wide fallback is still underneath. */
  HB.slice(0, -1).forEach((_, i) => { if (!GLOBAL_BANDS[i]) GLOBAL_BANDS[i] = []; });
  bands.forEach((v, i) => { for (const h of v) GLOBAL_BANDS[i].push(h); });
  GLOBAL_BANDS.forEach(v => v.sort((p, q) => p - q));

  const poolFor = a => { const i = bandOf(a);
                         const b = bands[i];
                         if (b.length >= 8) return b;
                         const g = GLOBAL_BANDS[i];
                         if (g && g.length >= 8) return g;
                         return anyReal.length >= 20 ? anyReal : null; };

  /* PLOT OUTLINES ARE NOT BUILDINGS, AND OVERTURE CANNOT TELL YOU WHICH IS WHICH.

     The conflation returns a box per source polygon, and some of those polygons are the PLOT: a
     785 x 679 m rectangle on Yas at a flat 40 m, another at 713 x 694 with SIXTY-ONE mapped
     buildings standing inside it. Extruded, they are half a million square metres of wall over
     the district they are supposed to contain. On the Yas Bay plan they are the reason there are
     buildings standing where the drawing shows promenade.

     THE TEST IS CONTAINMENT, NOT AREA. Area alone cannot separate a mall from a plot — both are
     enormous. But a real building does not have OTHER MAPPED BUILDINGS INSIDE ITS OWN OUTLINE,
     and a plot nearly always does. Two is enough to be sure; one is a porch or a lean-to.

     AND THE HEIGHT SAVES THE TOWERS. A 256 x 50 m box on Reem holds four small footprints and is
     264 m tall — that is a real tower over a real podium, and hiding it would be the worst
     outcome this rule can produce. Anything with a surveyed height above 45 m is kept whatever
     it contains.

     WHY HIDING IS SAFE: the contained buildings still draw. Losing the wrapper leaves the real
     ones standing, so the failure mode is a gap rather than a hole. 89 boxes across five islands,
     out of 26,325.

     THE SECOND CLASS IS OPEN GROUND WITH A FENCE ROUND IT. A leisure venue over 10,000 m2 is a
     pool deck, a beach club or a park — the bucket is park, beach, recreation, club, theme_park,
     waterpark, zoo, aquarium, and every one of those is open air. There are three in the whole
     city and the next largest leisure box is 4,789 m2, so the threshold sits in empty space
     rather than on a judgement. One of the three is the 168 x 118 m box at 15 m standing on the
     Hilton's pools. */
  const MERGE_MIN_M2 = 4000, MERGE_HOLDS = 2, MERGE_TALL_M = 45;
  /* LOWER THAN MERGE_MIN_M2, AND IT CAN AFFORD TO BE. The containment rule has one gate and needs
     a large area to stay safe; the parcel rule below has three, so it can reach further down
     without taking anything real. Measured at each step: 3,000 m2 flags 0.9 per cent of Saadiyat's
     footprints, 1.7 of Corniche's and 1.2 of Yas's. 2,000 nearly doubles that for another four
     hectares on Saadiyat, which is a poor trade against the risk of flattening ordinary stock. */
  const PARCEL_MIN_M2 = 3000;
  const GROUNDS_M2 = 10000;
  const merged = new Set();
  {
    const CELL = 120 / M_PER_UNIT, G = new Map();
    list.forEach((b, i) => {
      const gx = Math.floor(b.x / CELL), gy = Math.floor(b.z / CELL);
      for (let p = -3; p <= 3; p++) for (let q = -3; q <= 3; q++){
        const k = (gx + p) + ',' + (gy + q);
        let a = G.get(k); if (!a) G.set(k, a = []); a.push(i);
      }
    });
    const areaM2 = b => (b.w || 0) * (b.dp || 0) * M_PER_UNIT * M_PER_UNIT;
    list.forEach((b, i) => {
      const A = areaM2(b);
      if (b.vk === 'leisure' && A > GROUNDS_M2){ merged.add(i); return; }
      if (A < MERGE_MIN_M2) return;
      if (b.h != null && b.h * M_PER_UNIT > MERGE_TALL_M) return;
      const c = Math.cos(-b.rot), s = Math.sin(-b.rot);
      const cand = G.get(Math.floor(b.x / CELL) + ',' + Math.floor(b.z / CELL)) || [];
      let n = 0;
      for (const j of cand){
        if (j === i) continue;
        const o = list[j];
        if (areaM2(o) > A) continue;
        const dx = o.x - b.x, dz = o.z - b.z;
        const u = dx * c - dz * s, w = dx * s + dz * c;
        if (Math.abs(u) <= b.w / 2 && Math.abs(w) <= b.dp / 2){ if (++n >= MERGE_HOLDS) break; }
      }
      if (n >= MERGE_HOLDS) merged.add(i);
      /* THE VACANT PARCEL, WHICH CONTAINMENT CANNOT SEE.

         The test above asks whether other mapped buildings stand inside this outline, and that is
         a good question about a plot with something on it and a useless one about a plot with
         NOTHING on it. Saadiyat is covered in surveyed empty parcels — the sand rectangles between
         the museums — and every one of them contains zero buildings, passes the test and extrudes
         as a solid block. 45 of Saadiyat's 76 large footprints escape this way, 42 hectares of
         ground standing up as building, and the same class runs to 211 hectares across the five
         islands. It has been there since the footprint import.

         THREE NEGATIVES, ALL REQUIRED, BECAUSE ANY ONE ALONE WOULD TAKE SOMETHING REAL.

           no surveyed height — Overture measures the big ones. A mall, a terminal, a museum comes
             back with a height; a parcel does not. This is the load-bearing one.
           no ring           — the 186 buildings carrying a polygon outline are the hand-checked
             landmarks and are drawn as extrusions, not boxes. Never touch them.
           no venue joined   — if the bake knows people GO there, something is standing on it,
             whatever Overture failed to measure.

         AND THE ACTION IS THE PODIUM, NOT DELETION, for the reason Yas Bay taught: hiding a merge
         removed the site. A parcel flattened to 6 m is hard standing, which is what it is. */
      if (A >= PARCEL_MIN_M2 && b.h == null && !b.p && !(b.v > 0)) merged.add(i);
    });
  }
  let hidMerge = 0;

  const specs = [];
  let real = 0;
  /* Read once. KIT_ZONES is populated when the island's kit is built, which is strictly before any
     footprint payload can resolve, so an empty list here means the island has no hand-built
     landmarks rather than that the kit has not run yet. */
  const zones = KIT_ZONES[d.id] || [];
  let zoned = 0;
  for (let bi = 0; bi < list.length; bi++){
    const b = list[bi];
    /* THE PLOT OUTLINES ARE FLATTENED, NOT DELETED, AND THE FIRST VERSION DELETED THEM.

       Hiding was argued as safe because the contained buildings still draw. Drawn against the Yas
       Bay layout that argument collapses: the four merges over that waterfront are 120,000 m2 and
       between them they contain FIVE, TWO, FOUR and ZERO small footprints. Removing them removed
       the site. The strip between the hotel and the arena went bare, which is exactly the note
       that came back — the full footprint not built as per the layout.

       A plot merge is not nothing. It is the PODIUM: the deck, the terraces and the retail base
       that the layout draws as one continuous built platform with buildings standing on it. So it
       keeps its footprint and loses only its false height. Six metres is two storeys of base, and
       the real buildings inside it still stand on top at their own heights.

       Fenced open ground goes lower still. A pool deck or a beach club is a surface, not a base,
       so 1.5 m — enough to read as paving rather than as water. */
    if (merged.has(bi)) hidMerge++;
    const nx = b.x / d.r, ny = -b.z / d.r;
    /* THE COASTLINE TEST, WHICH THIS NEVER HAD AND urbanFabric ALWAYS DID.

       The generator tests every plot against insideIsle before it emits. footprintsFor placed
       whatever the payload contained, and the bake selects buildings by BOUNDING BOX — so piers,
       reclaimed edges and anything OSM holds inside the box but outside the shore came with them.

       Both symptoms are this one cause. Well outside the outline a building stands in open water.
       JUST outside it still sits at GROUND while the ground beneath it is the beach skirt sloping
       away, so it hangs in the air over the sand. Same test fixes both.

       The frame is measured, not argued: Corniche passes 17,772 of 18,776 against this convention
       and 8,964 against the flipped one, so the normalisation is right and the thousand that fail
       are genuinely off the island. That measurement is the only reason this line is here — the
       earlier version of it was reasoned about and thrown away twice.

       ?noclip disables it, because a filter that removes a thousand objects should stay
       switchable and because the comparison is what proved it in the first place. */
    if (!NO_CLIP && !insideIsle(d.id, nx, ny)) continue;

    /* CLASH COUNT. A real building standing on ground the vacancy mask cleared is the one failure
       this pass can produce that a screenshot will not show. Counted, not judged; nothing is
       removed on the strength of it. */
    if (VAC_ON && DIS && DIS.vacantAt(d.id, nx, ny)) clash++;

    /* AND THE SECOND CLIP: ground an authored landmark already occupies.

       Same shape of test as the coastline one and for the same reason — the payload describes
       everything that is there, and some of what is there has already been built by hand and built
       better. ADNOC HQ, Etihad Towers and Emirates Palace each exist twice the moment footprints
       arrive, and OSM's version is a flat extrusion of the outline standing inside a modelled
       silhouette. Whichever one you delete you lose nothing; whichever one you keep, keeping both
       is the only genuinely wrong answer, and it is what was happening.

       Counted, not silent. zoned goes on the fp overlay row, so an exclusion that starts eating
       half an island is visible as a number rather than as a suspicion about a screenshot. */
    if (zones.length){
      let blocked = false;
      for (const z of zones){
        if (b.x >= z.x0 && b.x <= z.x1 && b.z >= z.z0 && b.z <= z.z1){ blocked = true; break; }
      }
      if (blocked){ zoned++; continue; }
    }
    /* THE GATE WAS IN THE WRONG UNIT, BY A FACTOR OF 7.8.

       h arrives from buildingsUnits already divided by M_PER_UNIT, so `h > 1` was asking for
       7.8 METRES. Every OSM building shorter than that had its surveyed height discarded and
       replaced by the model — every villa, every single-storey retail unit, every podium, every
       building=roof. Not the whole city: wherever the stock is mid-rise the gate never fires,
       which is why Yas improved so clearly when real heights arrived and this went unnoticed.
       It bites exactly on the low fabric, which is exactly where a plateau appears.

       2 metres, because below that it is a wall or a bad tag rather than a building. */
    let h = b.h, isReal = h != null && h * M_PER_UNIT > 2;
    if (isReal) real++;
    else {
      /* THE FALLOFF WAS ORPHANED THE DAY REAL FOOTPRINTS ARRIVED.

         It came from urbanFabric, where a plot's size and its height were chosen together — a tall
         block got a big plot by construction, so a model that knew only WHERE a building stood
         could infer how tall it was. Real footprints break that link completely: a 130 m²
         shophouse and a 4,000 m² podium arrive at the same coordinate with the same claim on the
         district ceiling.

         And the ceiling is enormous. tallest is 52 units on Corniche, M_PER_UNIT is 7.8, so at the
         island's EDGE the cap was 89 m and the floor beneath it — cap x 0.55 — was 49 metres.
         Sixteen storeys, for the shortest modelled building anywhere on the island. In the core the
         floor was 223 m. Five in six of Corniche's buildings are modelled, so five in six were
         being handed a height between 49 m and 446 m regardless of what they are. That is the
         bristle-brush: not a city, a field of needles at roughly one height.

         So the footprint gets a veto. Area is a far better predictor of what a building IS than
         position is — a small base cannot carry a tower, for reasons of lifts and cores rather
         than of taste — and the falloff drops to a gentle modifier that keeps the core reading
         taller than the edge for two buildings of the same size.

         WHY THIS CANNOT FLATTEN ANYTHING REAL: it only runs where no surveyed height exists, and
         surveyed heights cluster on exactly the buildings that genuinely are tall. Corniche's 3,460
         real heights are its towers. Al Maryah's are all of them. What is left for the model is the
         ordinary stock, and the ordinary stock is short. */
      const dd = Math.min(1, Math.hypot(nx - core[0], ny - core[1]) / 1.45);
      const fall = 1 - dd * dd;
      const pool = poolFor(areaOf(b));
      if (pool){
        /* Drawn, not derived. rnd() is the same seeded generator the rest of this function uses, so
           a reload rebuilds the identical city. */
        h = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
        /* A LEAN, NOT A FALLOFF. The band already encodes what kind of building this is; position
           only says that two of the same kind read a little taller downtown than on the edge. 0.85
           to 1.15 rather than 0.22 to 1.0, because it is now adjusting a measured number instead of
           being the entire estimate. */
        h *= 0.85 + 0.30 * fall;
        /* The local ceiling still binds. A low-rise zone means low rise whatever the island's
           surveyed stock says about buildings of this size elsewhere on it. */
        h = Math.max(0.4, Math.min(h, cellCap(d, nx, ny, tallest)));
      } else {
        /* THE OLD MODEL, KEPT FOR THE ISLAND THAT HAS NO SURVEYED STOCK TO RESAMPLE. Wrong in the
           way described above, and still better than a flat city: it is continuous, it respects the
           low-rise zones, and it never produces nothing. Nothing reaches it today — every island
           carries at least fifty-six surveyed heights — but an island added tomorrow might. */
        const cap = Math.min(tallest * (0.22 + 0.78 * fall), cellCap(d, nx, ny, tallest));
        h = Math.max(0.4, cap * (0.55 + rnd() * 0.55));
      }
    }
    /* A RESTAURANT IS ONE STOREY, AND THE MODEL HAD NO WAY TO KNOW THAT. Where no surveyed height
       exists the height comes from the area pool, which is a fair reading of ordinary stock and a
       poor one of a beachfront F&B unit: Yas Bay's dining boxes were being handed ten and fifteen
       metres and standing over the promenade like offices.

       3.6 m, one floor, applied only where the venue join says dining AND the footprint is small
       enough that the venue IS the building — the same two gates the facade uses, so a unit cannot
       be a restaurant for its walls and a warehouse for its height. A surveyed height still wins:
       if the bake measured it, the bake is right and this never runs. */
    /* The podium clamp, applied last so nothing above can put the false height back. `grounds` is
       the leisure case, which is a surface rather than a base. */
    if (merged.has(bi)){
      const grounds = b.vk === 'leisure';
      h = (grounds ? 1.5 : 6) / M_PER_UNIT;
    }
    const dineArea = Math.max(1.2, b.w) * Math.max(1.2, b.dp) * M_PER_UNIT * M_PER_UNIT;
    if (b.vk === 'dine' && b.h == null && dineArea <= 2500 && (b.v || 0) < 4){
      h = 3.6 / M_PER_UNIT;
    }
    specs.push({ x:b.x, z:b.z, w:Math.max(1.2, b.w), dp:Math.max(1.2, b.dp), rot:b.rot, h,
                 v:b.v || 0, vk:b.vk || null, p:b.p || null });
  }

  /* Bucketed by material and window class exactly as the fabric is, so a footprint and a
     generated block standing next to each other are lit by the same shader and the Day/Dusk
     switcher finds dayMats where it expects to. Type is picked from height: tall is glass, mid
     is clad, low is render, which is the same reading the fabric applies. */
  /* FACADE FROM WHAT THE BUILDING IS FOR, FALLING BACK TO HEIGHT.

     Height alone was the whole rule: tall is glass, mid is cladding, low is render. It is a fair
     reading of a skyline and it cannot tell a beachfront hotel from a warehouse of the same
     height, which is why Yas Bay rendered the same grey as an industrial estate and why the one
     district this product exists to show looked like nowhere in particular.

     The bake now joins 10,420 venues to the footprints by coordinate. 2,063 buildings come back
     carrying at least one, and the identifications are right without a name lookup anywhere: Yas
     Mall is the 713 m box holding 143 venues of which 130 are dining, the Galleria is 63 dining
     on Al Maryah, Corniche has 1,320 dining buildings, 212 places of worship and 182 sports
     venues. Overture describes where people SLEEP; this describes where people GO.

     ONLY 8 PER CENT OF BUILDINGS CARRY ONE, AND THAT IS THE POINT. The other 92 per cent stay on
     the height rule and read as quiet residential mass — which is exactly what they are — so the
     places you can actually go to stand out against them instead of competing with them.

     dine also gets a brighter window class than its height would earn. A restaurant floor is lit
     when the offices above it are dark, and at dusk that is the single strongest signal that a
     building is somewhere rather than something. Clamped to the top class so a tall one cannot
     run off the end of the table. */
  const VK_MAT = { dine:'white', culture:'stone', worship:'stone',
                   sport:'clad', leisure:'rend', other:null };
  /* SAME ABSOLUTE FLOOR AS THE GENERATED STOCK, AND FOR THE SAME REASON. This rule is relative to
     the island ceiling too, so on an island whose ceiling is low a villa still qualified for
     cladding. Below VILLA_ABS_M it is render, full stop. */
  const typeOf = h => h * M_PER_UNIT <= VILLA_ABS_M ? 'rend'
                    : h > tallest * 0.62 ? 'glass' : h > tallest * 0.3 ? 'clad' : 'rend';
  /* THE VENUE TELLS YOU WHAT IS INSIDE, NOT WHAT THE BUILDING IS, AND ABOVE A CERTAIN SIZE THOSE
     ARE DIFFERENT QUESTIONS. The join is by coordinate, so whichever venue lands in a footprint
     wins it. That is right for a 550 m2 building — the median vk footprint, and at that size the
     restaurant IS the building. It is wrong for the Hilton at Yas Bay: 270 x 136 m, ten venues
     inside it, every one of them a restaurant, bar or lounge because the dataset carries no
     lodging class. So a 40 m hotel was drawing as white render with restaurant window spacing.

     It is not one building. 117 footprints over 6,000 m2 wear a restaurant facade, and the worst
     is 785 x 679 m with 143 venues joined to it — half a million square metres of mall, rendered
     as a diner.

     TWO SIGNALS, EITHER SUFFICIENT. Too big to be one venue, or too many venues to be one venue.
     Above either, fall back to typeOf(h), which reads the building's own mass. 2,500 m2 sits near
     the 85th percentile of vk footprints, so the ones this takes away are the ones that were
     never a single tenancy. About a fifth of joined footprints change; the other four fifths keep
     the mechanism exactly as it was. */
  const VK_MAX_M2 = 2500, VK_MAX_V = 4;
  const vkOf   = sp => (sp.w * sp.dp * M_PER_UNIT * M_PER_UNIT > VK_MAX_M2 || sp.v >= VK_MAX_V)
                     ? null : sp.vk;
  const matOf  = sp => (vkOf(sp) && VK_MAT[vkOf(sp)]) || typeOf(sp.h);
  /* THE VILLA FLOOR BEATS BOTH BRANCHES. A house gets class 0 windows whether or not a restaurant
     is joined to it — the dine bump exists to light a ground-floor unit under offices, and there
     are no offices above a villa. */
  const winOf  = sp => sp.h * M_PER_UNIT <= VILLA_ABS_M ? 0
                     : vkOf(sp) === 'dine'
                     ? Math.min(WCLASS.length - 1, wClass(sp.h) + 1)
                     : wClass(sp.h);
  /* SPLIT: RINGS ARE NOT INSTANCED. An InstancedMesh shares one geometry across every instance and
     varies only the matrix, which is exactly right for a box and impossible for a footprint that
     has its own outline. The 186 buildings carrying a ring get one mesh each — a rounding error
     against 26,325, and the only ones anybody looks at closely.

     Both paths must agree on the bucket key, because the instanced buckets are ALLOCATED from the
     first count. Sizing the buckets over all specs and then drawing some of them elsewhere would
     leave holes: allocated slots never written, which render as unit boxes at the origin. So the
     count below runs over `boxed` alone. */
  const ringed = specs.filter(sp => sp.p && sp.p.length >= 3 && sp.h > 0);
  const boxed  = ringed.length ? specs.filter(sp => !(sp.p && sp.p.length >= 3 && sp.h > 0)) : specs;

  const need = new Map();
  for (const sp of boxed){ const k = matOf(sp) + '#' + winOf(sp);
    need.set(k, (need.get(k) || 0) + 1); }

  const meshes = new Map();
  need.forEach((n, k) => {
    const [t, c] = k.split('#');
    const m = new THREE.InstancedMesh(PROFILES.box, MATS[t][+c], n);
    m.userData.dayMats = MATS[t].day[+c];
    m.castShadow = true; m.receiveShadow = true;
    meshes.set(k, m);
  });

  const M = new THREE.Object3D(), idx = new Map();
  for (const sp of boxed){
    /* GROUND, NOT GROUND + h/2. The profile geometry is built with its rings at y = t for t in
       0..1 — its origin is at the BASE, not the centre. urbanFabric has always written
       `GROUND + o.y` with no half-height term because there is no half-height to add, and this
       line assumed a centred box.

       Every footprint was therefore lifted by half its own height. A 200 m tower floated 100 m;
       a 20 m block floated 10 m; wide low buildings floated a little and read as raised ground.
       Both symptoms, one term, and the error scaled with height exactly as the screenshots did.

       It survived this long because it is invisible from any distance where the gap is smaller
       than a pixel, and the district and world shots are all at that distance. It only shows at
       place range, which is where it was eventually seen. */
    M.position.set(sp.x, GROUND, sp.z);
    M.rotation.set(0, -sp.rot, 0);
    M.scale.set(sp.w, sp.h, sp.dp);
    M.updateMatrix();
    /* THE SAME KEY THE BUCKETS WERE SIZED WITH. Two call sites, and they must agree exactly — an
       InstancedMesh is allocated from the first count, so a key computed differently here writes
       into a bucket that was never created. */
    const k = matOf(sp) + '#' + winOf(sp), m = meshes.get(k), i = idx.get(k) || 0;
    idx.set(k, i + 1);
    m.setMatrixAt(i, M.matrix);
    /* NO PER-INSTANCE COLOUR, DELIBERATELY, AFTER GETTING IT WRONG.

       tintFrom takes a tint OBJECT — v, amount, warm, w — and it was handed the number 1. Every
       field came back undefined, v computed to NaN, and setRGB(NaN,NaN,NaN) gave all 18,776
       footprints a NaN instance colour, which the GPU renders black. Dusk hid it completely: black
       buildings in a dark scene read as an empty island, which is exactly how it was reported and
       exactly how I first read it. Day showed it in one look.

       Not replaced with a guessed tint object. The fabric's variation is a function of the
       generator's seeded stream and its fields have meanings I would be inferring rather than
       reading. Omitting the call is unambiguously correct — the instances take their material's
       own colour, and they are already bucketed by material and window class, so the variation
       that matters is still there. Per-instance variation is a thing to add on purpose later,
       from the same stream the fabric uses, not a thing to approximate now. */
  }

  const g = new THREE.Group();
  g.name = 'footprints';

  /* ---------- CLAY ROOFS ON THE HOUSES ----------

     ONE EXTRA PASS OVER THE SAME `boxed` ARRAY, and two draw calls per island. Not folded into the
     wall buckets, because an InstancedMesh takes one geometry and a roof is not a box; and not a
     material group on the box, because InstancedMesh + multi-material is the sort of thing that
     works on desktop and finds a driver on the Adreno.

     THE ROOF IS THE ONLY THING THAT IDENTIFIES A VILLA AT DISTRICT RANGE. Saadiyat is 81 per cent
     villa-scale footprints and it was reading as a grey field, because a flat-topped box in the
     island's own sand tone is indistinguishable from the ground whatever size it is. Two sessions
     were spent on the size.

     THE TONE IS DETERMINISTIC IN POSITION, not drawn from a stream, so it does not depend on the
     order the specs happen to arrive in and a reload rebuilds the identical estate. */
  const villas = boxed.filter(sp => !sp.vk &&
    sp.h * M_PER_UNIT <= VILLA_H &&
    sp.w * sp.dp * M_PER_UNIT * M_PER_UNIT <= VILLA_AREA);
  if (villas.length){
    const tone = sp => {
      let q = Math.imul(Math.round(sp.x * 733) ^ Math.imul(Math.round(sp.z * 733), 0x9E3779B1), 0x85EBCA6B);
      q ^= q >>> 15;
      return (q >>> 0) % 100 < 58 ? 0 : 1;      // 58/42 toward the deeper terracotta
    };
    const split = [[], []];
    for (const sp of villas) split[tone(sp)].push(sp);
    ['tile', 'tileL'].forEach((fam, t) => {
      if (!split[t].length) return;
      const rm = new THREE.InstancedMesh(ROOF_GEO, MATS[fam].raw, split[t].length);
      rm.userData.dayMats = MATS[fam].dayRaw;
      rm.castShadow = true; rm.receiveShadow = true;
      rm.name = 'roofs';
      const R = new THREE.Object3D();
      split[t].forEach((sp, i) => {
        /* PITCH FROM THE SHORT SIDE. A fixed angle over a varying span is what a real roof does,
           so the tall narrow ones get a steeper cap and the wide ones a shallower. Clamped both
           ways: below 1.6 m it is a kerb and above 3.6 m it is a barn. */
        const short = Math.min(sp.w, sp.dp);
        const pitch = Math.max(1.6 / M_PER_UNIT, Math.min(3.6 / M_PER_UNIT, short * 0.30));
        /* EAVES. 8 per cent over the wall on each side, which is the shadow line that separates
           roof from wall when the sun is anywhere but overhead. Without it the cap reads as a
           coloured top face rather than as a roof. */
        R.position.set(sp.x, GROUND + sp.h, sp.z);
        R.rotation.set(0, -sp.rot, 0);
        R.scale.set(sp.w * 1.08, pitch, sp.dp * 1.08);
        R.updateMatrix();
        rm.setMatrixAt(i, R.matrix);
      });
      g.add(rm);
    });
    d.fpRoof = villas.length;
  }

  /* THE RINGED ONES, EXTRUDED. The shape is written (x, -z) and the geometry rotated -PI/2 about
     X, which is the same convention the golf course and the bay deck use: a shape point (sx, sy)
     lands at world (sx, 0, -sy), so the ring's z must be negated going in and comes back out
     correct. Extrusion runs along the shape's +Z, which that rotation turns into +Y, so `depth` is
     simply the height in units and the base sits on GROUND with no half-height term — the same
     thing the box path had to learn.

     `rot` is deliberately NOT applied. The ring arrives in the island frame already oriented; the
     box needs its rotation because a box has none of its own. Applying both would turn every
     landmark by its own bearing twice. */
  for (const sp of ringed){
    const sh = new THREE.Shape();
    sh.moveTo(sp.p[0][0], -sp.p[0][1]);
    for (let i = 1; i < sp.p.length; i++) sh.lineTo(sp.p[i][0], -sp.p[i][1]);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: sp.h, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const t = matOf(sp), c = winOf(sp);
    const rm = new THREE.Mesh(geo, MATS[t][+c]);
    rm.userData.dayMats = MATS[t].day[+c];
    rm.castShadow = true; rm.receiveShadow = true;
    rm.position.set(sp.x, GROUND, sp.z);
    g.add(rm);
  }

  meshes.forEach((m, k) => {
    m.count = idx.get(k) || 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    g.add(m);
  });
  d.fpCount = specs.length; d.fpReal = real; d.fpZoned = zoned; d.fpClash = clash;
  /* PLOT OUTLINES AND FENCED OPEN GROUND, HIDDEN. On the overlay as `m` beside `z`, because the
     two exclusions have opposite failure shapes: z eating the island means a kit zone is too
     generous, m eating it means the containment rule is catching real buildings. Telling them
     apart at a glance is the whole reason they are counted separately. */
  d.fpMerged = hidMerge;
  return g;
}


function buildFabricFor(d){
  const cool = d.tint === 0x8FD3E8 || d.tint === 0xBFD3E0;
  // Per-district character: where downtown sits, and how tall it gets there.
  /* THE CEILING FOR GENERATED STOCK. Saadiyat asked for 109 m on an island whose real tallest is
     about 55. Invisible today — these meshes are masked wherever footprints landed. */
  const tallest = DIS ? DIS.genTallest(d.id)
                      : ({ maryah:40, reem:44, saadiyat:14, yas:18 }[d.id]);

  /* DENSITY UP, because the road network now takes its cut first. Reserving the ring and the
     arterials removed about forty per cent of the blocks — correctly, that ground is carriageway
     — but the islands came out thin. A finer pitch wins twice: more blocks fit in what is left,
     AND the clearance shrinks with the pitch, since half of it is the building's own overhang.
     Instancing means the extra count is free in draw calls. */
  /* SAME DENSITY, SAME SEED, DIFFERENT FLOOR. The layers are the same city; mass simply omits
     anything under minH, so the world view holds the massing and zooming in fills the gaps. */
  /* THE FABRIC IS BUILT ON EVERY ISLAND AGAIN, and v156's meshes:false is withdrawn.

     That flag skipped generating stock wherever real footprints were coming, on the evidence that
     the fabric was being hidden in full — `hid59/0v`, zero visible against 18,782 built. Correct
     about the waste and wrong about the cure: the payload does not cover these islands. Saadiyat
     has 1,841 real buildings against 18,782 generated, so not generating left it scarce, while Yas
     has 3,803 real against 1,079 generated and barely noticed. Opposite failures, same flag.

     cullFabric in world-nav.html now zeroes only the instances a real building stands on, so the
     generated stock survives in the gaps and the two layers stop being an either/or. Which means
     the meshes have to exist to be culled. The arithmetic-only path stays in urbanFabric — it is
     correct and it costs nothing unused — but nothing asks for it today.

     SAME DENSITY, SAME SEED, DIFFERENT FLOOR. The layers are the same city; mass simply omits
     anything under minH, so the world view holds the massing and zooming in fills the gaps. */
  urbanFabric(d, d.mass,   { density:1.30, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool,
                             minH:5.4 });
  const built = urbanFabric(d, d.detail,
                           { density:1.30, coreX:d.coreN[0], coreZ:d.coreN[1], tallest, cool });
  d.fabric = built;

}

/* THE FOUR OUTER ISLANDS ARE NOT BUILT AT LOAD, and this is the largest lever left.

   Measurement, not instinct: compile 26 ms, upload 53, shadowPass 2, postFX 3 — the GPU is not the
   problem. buildWorld is 3.2 seconds and the gap before the first frame is another 7.3, and that
   gap contains no JavaScript of ours at all. It is the runtime and the driver digesting what was
   just handed to them, and it scales with how much scene exists when the first frame is drawn.

   Corniche is the opening shot. Saadiyat, Yas, Reem and Al Maryah are four fifths of the object
   count and, at world zoom, four silhouettes — the fabric inside them is invisible until the
   camera goes there, and going there is a deliberate act that can carry a build.

   The coastline, the platform and the beach are NOT deferred: those are what the world view
   actually shows, and they are built in the loop far above this one. Only the city on top waits.

   deferIslands:false restores the old behaviour in one option, which matters because "it was fine
   before the deferral" needs to be testable without a revert. */
const DEFER = opts.deferIslands !== false;

DISTRICTS.filter(d => !d.built).forEach(d => {
  if (DEFER){ d.pending = true; return; }
  buildFabricFor(d);
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
/* THE OPENING REGION. A radius about the shot the camera actually opens on, generous enough that
   panning does not immediately run out of city. Everything outside it is built by buildRest below,
   under an attract-loop leg or a user's first move — either way, while the camera is elsewhere. */
const CORNICHE_REGION = (() => {
  const sh = corniche.shot;
  if (!sh) return null;
  const rr = (sh.r * 1.6) ** 2;
  return sp => (sp.x - sh.x) ** 2 + (sp.z - sh.z) ** 2 < rr;
})();

const cornicheFabric = urbanFabric(corniche, corniche.detail,
  /* THE CAP WAS FLATTENING THE DOWNTOWN, and that is the carpet in every dusk shot.

     tallest 16 with cap 12 means the cap bites wherever the falloff exceeds 0.63 — which is most
     of the island — so the entire core clipped to one height and the skyline lost its shape. A cap
     exists to stop the fabric competing with ADNOC at 44 units, not to iron the city flat.

     tallest 34 and cap 26 puts the generated stock at 203 m against ADNOC's 343 and Etihad's 305,
     which is the real relationship: a dense field of 100-200 m towers with three landmarks
     standing clear of it. The cap now bites only at fall > 0.64 of a much taller curve, so it
     trims the tallest few rather than levelling the lot. */
  { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:34, avoid:true, cap:26,
    region:CORNICHE_REGION });
corniche.fabric = cornicheFabric;

/* THE WORLD-VIEW BUILDING LAYER, SEPARABLE FROM THE REST OF THE BUILD.

   The first draw after buildWorld pays for everything buildWorld allocated — 18 seconds of it —
   and there is no seam inside buildWorld to paint through. This is the one seam that can be cut
   without moving anything else: the mass call's return value is unused, unlike the detail call
   above, whose cells and blocks are corniche.fabric and are what groundPlan paints the ground
   from. Defer the detail call and the ground goes with it; defer this one and only the world-zoom
   buildings move.

   Not a behaviour change unless the caller asks: with deferCornicheMass unset this runs exactly
   where it always did, in the same order, with the same arguments. */
function buildCornicheMass(){
  if (cornicheMassDone) return false;
  cornicheMassDone = true;
  urbanFabric(corniche, corniche.mass,
    /* Same density and the same seed as the detail call above, so this is the SAME CITY. The two
       layers differ only by minH: the world view keeps the tall ones and tapping in adds the short
       ones between them without moving anything.

       minH IS A FIXED 5.4 UNITS and that is deliberate — it is a real height, about 42 metres,
       below which a building is not worth drawing at world zoom. It is NOT a fraction of `tallest`,
       so raising the height model changes which share of the stock survives rather than changing
       the threshold, which is the correct behaviour: a 42-metre building is equally invisible from
       orbit whatever the tallest tower on the island happens to be. */
    { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:34, avoid:true,
      cap:26, minH:5.4, region:CORNICHE_REGION });
  return true;
}
let cornicheMassDone = false;
if (!opts.deferCornicheMass) buildCornicheMass();

// Corniche gets its glow too, so all five behave identically to the state machine.
/* CORNICHE'S GLOW IS THE ONE EVERY ISLAND ALREADY HAS, RECONFIGURED — not a second light.

   It used to be built here and added to corniche.detail, which is now two faults rather than one:
   a light inside the LOD toggle changes the visible light count every time the camera enters or
   leaves the island, and with the generic glow now created for every district up front this would
   have put TWO point lights on Corniche and pushed NUM_POINT_LIGHTS to six for the whole scene.

   Colour, height, offset and range are Corniche's own; only the light object is shared. */
const cglow = corniche.glow;
cglow.color.setHex(C.gold);
cglow.distance = 170;
cglow.position.set(0, GROUND + 22, -10);

/* ---------- paint the ground, once the fabric knows where the blocks are ----------

   Deliberately the last thing that happens. The painter needs the cell list, the cell list only
   exists after generation, and doing it in one sweep at the end means there is exactly one place
   to look when a road lands in the wrong district. */
const dayGround  = stdMat({ color:0xD8D2C4, roughness:0.92, metalness:0 });
const dayBeach   = stdMat({ color:0xAB9A7C, roughness:1, metalness:0 });
const duskGround = stdMat({ color:0xC6B99E, roughness:0.94, metalness:0 });
const duskBeach  = stdMat({ color:0x9C8C6F, roughness:1, metalness:0 });

let propCount = { palms:0, lamps:0, cars:0, boats:0, shrubs:0, signals:0 };
const signalTicks = [];
/* PER-ISLAND, AND CALLABLE LATER. Was a forEach; the body is unchanged. */
function buildGroundFor(d){
  const f = d.fabric;
  if (!f) return;
  /* THE LAST MOMENT THE ANSWER CAN CHANGE. The ground canvas is painted below and there is no
     repainting it afterwards, so the real network is claimed here rather than at declaration —
     by now the deferred islands have had a leg of the attract loop to finish their fetch.
     If it has still not landed the island paints generated roads, which is the documented
     degradation, not a failure. */
  d.roadsReal = attachRealRoads(d);
  console.info('roads ' + d.id + ': ' + (d.roadsReal
    ? (d.roads.drawArterials.length + ' real centrelines') : 'generated skeleton'));
  const plan = groundPlan(d, f.cells, f.blocks);
  d.plan = plan;

  /* ---------- grid reference labels, Plan view only ----------

     One tiny canvas per label rather than a shared atlas: there are about a dozen per island, each
     is 64 by 32, and an atlas would need UV bookkeeping to save well under a megabyte. Sprites, so
     they face the camera at any orbit angle and stay readable from directly above, which is the
     one view they exist for.

     Sized in WORLD units off the island radius, not in pixels, so a label is the same physical
     size on a 190-unit island and an 85-unit one — a screen-space label would be unreadable on the
     large islands and enormous on the small. */
  (d.roads.gridRefs || []).forEach(g => {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 32;
    const c2 = cv.getContext('2d');
    c2.fillStyle = 'rgba(16,20,24,0.82)';
    c2.fillRect(0, 0, 64, 32);
    c2.fillStyle = '#7FE3C8';
    c2.font = 'bold 22px monospace';
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(g.label, 32, 17);
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map:tx, depthTest:false, transparent:true }));
    sp.position.set(g.x * d.r, GROUND + 2, -g.y * d.r);
    const sc = d.r * 0.075;
    sp.scale.set(sc, sc * 0.5, 1);
    sp.userData.planOnly = true;
    sp.renderOrder = 20;
    d.group.add(sp);
  });
  const tex = paintGround(d, plan);
  /* Props into the DETAIL layer only. At world scale a palm is a third of a pixel; paying for
     four hundred of them per island at exactly the moment five islands are on screen would be
     paying for invisible geometry. The LOD swap already exists and this is what it is for. */
  if (props){
    const n = props.addProps(d, d.detail, plan);
    /* tickSignals is a FUNCTION, not a count, so the blind key sum would turn propCount.signals
       into NaN the moment it tried to add it. Collected separately and called from the frame
       loop. Guarded because an older props module has neither. */
    if (n.tickSignals){ signalTicks.push(n.tickSignals); delete n.tickSignals; }
    Object.keys(n).forEach(k => propCount[k] = (propCount[k] || 0) + n[k]);
  }
  const night = stdMat({
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
}

DISTRICTS.forEach(d => { if (!d.pending) buildGroundFor(d); });

/* ---------- shadow flags, one sweep ---------- */
world.traverse(o => {
  if (!o.isMesh || o.userData.helper) return;
  const on = !o.userData.noShadow;
  o.castShadow = on;
  o.receiveShadow = on;
});
water.castShadow = false;

/* THE BREAKDOWN. Sorted by cost, with call counts, and the remainder named honestly: whatever the
   wrapped stages do not account for is geometry construction, instancing and upload, and calling
   that "other" rather than leaving it out is the difference between a measurement and a flattering
   one. */
try {
  const total = performance.now() - T0;
  const rows = Object.keys(PERF).filter(k => k[0] !== '#')
    .map(k => ({ stage:k, ms:Math.round(PERF[k]), calls:PERF['#' + k],
                 pct:Math.round(PERF[k] / total * 100) }))
    .sort((a, b) => b.ms - a.ms);
  const named = rows.reduce((a, r) => a + r.ms, 0);
  rows.push({ stage:'(everything else)', ms:Math.round(total - named), calls:1,
              pct:Math.round((total - named) / total * 100) });
  PERF['#total'] = total;      // so the on-screen overlay can name the remainder honestly
  console.info('buildWorld ' + Math.round(total) + ' ms');
  console.table ? console.table(rows) : rows.forEach(r =>
    console.info('  ' + r.stage.padEnd(14) + String(r.ms).padStart(6) + ' ms  ' +
                 String(r.pct).padStart(3) + '%  x' + r.calls));
} catch (e){ /* timing must never break the build */ }

/* CALLED BY world-nav.html WHEN THE CAMERA COMMITS TO AN ISLAND. Idempotent, and returns whether
   it did anything, so the caller can decide to show a spinner only when there is work. */
/* THE REST OF THE CORNICHE. Same call, same seed, same specs; the region is inverted so this emits
   exactly what the first pass left out and nothing twice.

   Pass 1 and 2 run again, which is about 1.4 seconds of arithmetic for a result already computed
   once. Caching the specs instead would be faster and would mean holding forty thousand objects
   alive for the whole session to save a second that happens while the camera is flying. The
   arithmetic is deterministic; the memory is not free. */
let cornicheRestDone = !CORNICHE_REGION;
function buildCornicheRest(){
  if (cornicheRestDone) return false;
  cornicheRestDone = true;
  const outside = sp => !CORNICHE_REGION(sp);
  const t = performance.now();
  urbanFabric(corniche, corniche.mass,
    { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:34, avoid:true,
      cap:26, minH:5.4, region:outside });
  urbanFabric(corniche, corniche.detail,
    { density:1.85, coreX:corniche.coreN[0], coreZ:corniche.coreN[1], tallest:34, avoid:true,
      cap:26, region:outside });
  console.info('buildCornicheRest ' + Math.round(performance.now() - t) + ' ms');
  return true;
}

function buildIsland(id){
  const d = DISTRICTS.find(x => x.id === id);
  if (!d || !d.pending) return false;
  d.pending = false;
  const t = performance.now();
  buildFabricFor(d);
  buildGroundFor(d);
  /* NO LONGER A PLACEHOLDER. `built` is what the breadcrumb reads to decide between "Tap a place"
     and "Placeholder island", and it was a static property of the table describing whether an
     island had hand-authored content. Deferred building made it a lifecycle fact instead: these
     islands now acquire their city at run time and the label has to follow. */
  d.built = true;
  console.info('buildIsland ' + id + ' ' + Math.round(performance.now() - t) + ' ms');
  return true;
}

return { world, water, farSea, waterPos, waterBase, waterNormal, DISTRICTS, pickTargets, PERF,
         buildIsland, buildCornicheRest, buildCornicheMass, footprintsFor, groundFeaturesFor,
         corniche, GROUND, propCount,
         /* One call for the whole archipelago. The per-district ticks are closures over their own
            signal lists, so the shell does not need to know how many districts there are or which
            of them have junctions. */
         tickSignals: t => { for (let i = 0; i < signalTicks.length; i++) signalTicks[i](t); } };
}
