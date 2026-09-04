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

export const BUILD = 'props v40';

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

/* ===========================================================================
   THREE PALMS, NOT ONE SCALED THREE WAYS.

   Every palm in the scene was one geometry — eleven fronds at fixed angles — with a uniform
   per-instance scale of 0.80 to 1.28 on top. Uniform scale is the problem: it changes how BIG a
   palm is and cannot change what KIND of palm it is, so the crown-to-trunk ratio was identical on
   all two thousand of them and the same eleven fronds sat at the same eleven bearings. At two
   thousand instances that is not a tree, it is a stamp, and the eye finds a repeated stamp long
   before it counts how many there are.

   A young date palm is not a small mature one. It is a short thick stub carrying a tight upright
   crown; the trunk lengthens and thins with age while the crown spreads and droops. Those are
   different SHAPES, which means different geometries — three of them, at 8, 11 and 14 fronds.

   The bearing offset is per-variant too. Without it the three share a first frond pointing the
   same way, and a mixed avenue still shows a rhythm.
   =========================================================================== */
function crownGeometry(n, droop, phase){
  const parts = [];
  for (let i = 0; i < n; i++){
    const f = frondGeometry();
    // Alternate the droop. A crown where every frond leaves at the same angle reads as an
    // umbrella; real palms have a ragged upper tier and a heavier lower one.
    f.rotateZ(-0.10 + (i % 2) * 0.34 * droop);
    f.rotateY(i * (Math.PI * 2 / n) + (i % 3) * 0.09 + phase);
    parts.push(f);
  }
  const g = mergeGeometries(parts);
  g.scale(0.85, 0.85, 0.85);
  return g;
}

const PALM_H = 15 * U_PER_M;                       // a mature trunk, 1.92 units

/* trunkH, topR, botR, fronds, crownScale, droop, phase — a real growth sequence rather than three
   arbitrary sizes. The young palm's trunk is 40 per cent of the mature one but its trunk is
   THICKER at the top relative to its height, and its crown is upright and tight. */
const PALM_KINDS = [
  { key:'mature', h:1.00, top:0.075, bot:0.125, n:14, cs:1.00, droop:1.00, ph:0.0  },
  { key:'medium', h:0.74, top:0.082, bot:0.120, n:11, cs:0.82, droop:0.78, ph:0.7  },
  { key:'young',  h:0.42, top:0.095, bot:0.115, n: 8, cs:0.60, droop:0.42, ph:1.9  },
];

const PALM_GEO = PALM_KINDS.map(k => {
  const th = PALM_H * k.h;
  /* A SIX-SIDED TRUNK IS A HEXAGON, and on a lit cylinder that is six flat facets with hard
     shading steps down every one. Ten reads as round at the distance these are actually seen
     from, and costs eight triangles on a geometry that is instanced. */
  const t = new THREE.CylinderGeometry(k.top, k.bot, th, 10, 1);
  t.translate(0, th / 2, 0);
  const c = crownGeometry(k.n, k.droop, k.ph);
  c.scale(k.cs, k.cs, k.cs);
  c.translate(0, th, 0);
  return mergeGeometries([t, c], true);
});

/* ---------- lamp column ----------
   The head is a separate group so it can be given an emissive material. At night these are the
   lamp pools; in daylight they are small dark boxes and cost nothing. */
const LAMP_H = 10 * U_PER_M;                       // 1.28 units
const postGeo = new THREE.CylinderGeometry(0.026, 0.040, LAMP_H, 5, 1);
postGeo.translate(0, LAMP_H / 2, 0);
const headGeo = new THREE.BoxGeometry(0.16, 0.055, 0.10);
headGeo.translate(0, LAMP_H + 0.02, 0);
const lampGeo = mergeGeometries([postGeo, headGeo], true);

/* ---------- traffic signal ----------

   A junction reads as a junction because of the hardware standing at it. The painted stop bars and
   zebras added in world v65 say where the traffic stops; the signal heads say WHY, and at the
   place camera they are the difference between a crossing and two roads laid over each other.

   TWO PARTS, TWO MATERIALS, ONE MESH EACH. The mast is dark metal and the lamp cluster is
   emissive, which is exactly the lamp column's arrangement, so this reuses matPost and a signal
   lamp rather than inventing a second lighting path — and at night the heads come on with
   everything else for free.

   A MAST ARM, not just a pole. A vertical post with a box on top reads as a parking meter; the
   cantilever out over the carriageway is the silhouette everyone recognises, and it is two boxes.
   The head hangs at the arm's end, which is where the lens actually is. */
/* TALLER AND FATTER THAN LIFE, deliberately. A 6.2-metre mast with a 40-centimetre lens is
   correct and, at the place camera, about two pixels of light — which is why they were "hiding".
   Everything else in this scene that has to read at distance is exaggerated for the same reason:
   the palm crowns are seven metres across, the lamp heads are oversized, the kerbs are wider than
   kerbs. 8.5 metres with a lens twice the width is still small against a 40-metre podium and is
   the smallest thing that survives being drawn at this range. */
const SIG_H   = 8.5 * U_PER_M;
const SIG_ARM = 4.6 * U_PER_M;
const sigMast = new THREE.CylinderGeometry(0.022, 0.030, SIG_H, 6, 1);
sigMast.translate(0, SIG_H / 2, 0);
const sigArm  = new THREE.BoxGeometry(SIG_ARM, 0.030, 0.030);
sigArm.translate(SIG_ARM / 2, SIG_H - 0.02, 0);
const sigBack = new THREE.BoxGeometry(0.090, 0.245, 0.070);   // three lenses at 0.075 plus a margin
sigBack.translate(SIG_ARM * 0.92, SIG_H - 0.115, 0);
const signalGeo = mergeGeometries([sigMast, sigArm, sigBack], true);

/* THREE ASPECTS, AND THEY HAVE TO BE THREE MESHES.

   The first pass drew one amber box and argued that nobody resolves which lens is lit. That is
   true of a still frame and false of a moving one: a junction where the lights never change is
   more obviously wrong than one whose lenses are a pixel too small, because the eye is far more
   sensitive to a thing that should move and does not.

   Emissive colour cannot vary per instance — setColorAt writes instanceColor, which multiplies
   the DIFFUSE and leaves the emissive alone — so a per-signal colour is not available on one mesh.
   Three meshes, one per aspect, each carrying every signal, and an instance is HIDDEN BY SCALING
   IT TO ZERO. That makes switching an aspect a matrix write rather than a material change, which
   is the only version of this that stays inside one draw call per aspect. */
const LENS = [
  { key:'red',   y: 0.075, hex:0xFF4A2E },
  { key:'amber', y: 0.000, hex:0xFFB040 },
  { key:'green', y:-0.075, hex:0x3BE87A },
];
const signalLensGeo = LENS.map(l => {
  const g = new THREE.BoxGeometry(0.070, 0.062, 0.040);
  // On the FACE of the backboard, not inside it: the board is 0.070 deep, so half of that plus
  // half the lens. A lens buried in its own housing is invisible from every angle, which is the
  // kind of thing that reads as "the lights are not working" rather than as a bug.
  g.translate(SIG_ARM * 0.92, SIG_H - 0.115 + l.y, 0.070 / 2 + 0.040 / 2);
  return g;
});

/* ---------- car ---------- */
const carBody  = new THREE.BoxGeometry(4.6 * U_PER_M, 1.15 * U_PER_M, 1.85 * U_PER_M);
carBody.translate(0, 0.62 * U_PER_M, 0);
const carCabin = new THREE.BoxGeometry(2.3 * U_PER_M, 0.85 * U_PER_M, 1.60 * U_PER_M);
carCabin.translate(-0.15 * U_PER_M, 1.45 * U_PER_M, 0);
const carGeo = mergeGeometries([carBody, carCabin]);
/* HEAD AND TAIL LIGHTS for the moving cars (props v34): four small emissive faces on the car's
   own frame — two warm at the front, two red at the back — merged with two material groups so
   the whole set is one nightOnly instanced mesh sharing the car's matrices. Not tone mapped, so
   they clear the bloom threshold at dusk the way the lamp heads do. */
const carLightGeo = (() => {
  const U = U_PER_M;
  const mk = (x, z) => { const g = new THREE.BoxGeometry(0.12 * U, 0.22 * U, 0.34 * U); g.translate(x, 0.70 * U, z); return g; };
  const head = mergeGeometries([mk( 2.32 * U,  0.62 * U), mk( 2.32 * U, -0.62 * U)]);
  const tail = mergeGeometries([mk(-2.32 * U,  0.62 * U), mk(-2.32 * U, -0.62 * U)]);
  return mergeGeometries([head, tail], true);
})();
const matHeadlight = new THREE.MeshBasicMaterial({ color: 0xFFF1C2, toneMapped: false });
const matTaillight = new THREE.MeshBasicMaterial({ color: 0xFF2A18, toneMapped: false });
/* LIGHT POOLS FOR THE MOVING CARS (props v36). The lamp pools are what make the roads read from
   the city camera — a 30 m disc of additive warmth on the ground — and a head lamp the size of a
   shoebox is nothing at that range. So each car drags a beam pool ahead of it and a red pool
   behind, flat on the ground, on the same matrices as the body; nightOnly like the lamp pools. */
const carPoolGeo = (() => {
  const beam = new THREE.PlaneGeometry(1.5, 2.6); beam.rotateX(-Math.PI / 2); beam.translate(1.7, 0.05, 0);
  const tail = new THREE.PlaneGeometry(0.9, 0.9); tail.rotateX(-Math.PI / 2); tail.translate(-0.7, 0.05, 0);
  return mergeGeometries([beam, tail], true);
})();
/* SIGNAL HALOS: a flat additive disc at head height in the aspect's colour, toggled with the lens
   so a junction shows its state from the city camera, where the lens itself is under a pixel. */
const haloGeo = (() => { const g = new THREE.PlaneGeometry(1.8, 1.8); g.rotateX(-Math.PI / 2); g.translate(0, 0.9, 0); return g; })();

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
const matCarBeam   = new THREE.MeshBasicMaterial({ ...poolBase, color: 0xFFE6B8, opacity: 0.62 });
const matCarTail   = new THREE.MeshBasicMaterial({ ...poolBase, color: 0xFF3A28, opacity: 0.55 });
const matHalo = [0xFF3A2A, 0xFFB030, 0x30FF70].map(c => new THREE.MeshBasicMaterial({ ...poolBase, color: c, opacity: 0.75 }));

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
/* Amber rather than a red/green mix. Instancing shares one material across every head, so a
   three-colour signal would need three meshes for a detail that is under a pixel at district
   range — and an amber cluster is what a signal looks like from any distance where you cannot
   read which aspect is lit. */
const matSignal = LENS.map(l => new THREE.MeshStandardMaterial({
  color:0x1A1610, roughness:0.35, emissive:l.hex, emissiveIntensity:3.6 }));
const matCar   = new THREE.MeshStandardMaterial({ color:0xBFC4C8, roughness:0.42, metalness:0.25 });
const matBoat  = new THREE.MeshStandardMaterial({ color:0xE2E4E0, roughness:0.5 });
/* ---------- construction (props v39) ----------
   A tower crane: mast, jib, counter-jib and a red aircraft light at the top; a site cabin; a sand
   heap. Instanced per island from plan.sites. The light is emissive on its own material so it
   reads at night without a lamp pool. */
const craneGeo = (() => {
  const U = U_PER_M, H = 48 * U;
  const mast = new THREE.BoxGeometry(1.8 * U, H, 1.8 * U); mast.translate(0, H / 2, 0);
  const jib  = new THREE.BoxGeometry(42 * U, 1.2 * U, 1.4 * U); jib.translate(14 * U, H, 0);
  const cjib = new THREE.BoxGeometry(12 * U, 1.6 * U, 1.6 * U); cjib.translate(-6 * U, H - 0.4 * U, 0);
  const cab  = new THREE.BoxGeometry(2.6 * U, 2.6 * U, 2.6 * U); cab.translate(1.6 * U, H - 2.2 * U, 0);
  const body = mergeGeometries([mast, jib, cjib, cab]);
  const lamp = new THREE.BoxGeometry(0.9 * U, 0.9 * U, 0.9 * U); lamp.translate(0, H + 1.4 * U, 0);
  return mergeGeometries([body, lamp], true);
})();
const matCrane = new THREE.MeshStandardMaterial({ color:0xFFC61A, roughness:0.6, metalness:0.15 });
/* A HALF-BUILT FRAME: bare concrete, a unit box scaled to the plot and to however many storeys
   are up, sometimes with a narrower core rising above the slabs. */
const frameGeo = (() => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; })();
const matFrame = new THREE.MeshStandardMaterial({ color:0x9C9689, roughness:1, metalness:0 });
const matCraneLamp = new THREE.MeshStandardMaterial({ color:0x300000, emissive:0xFF2418, emissiveIntensity:2.2, toneMapped:false });
const cabinGeo = (() => { const g = new THREE.BoxGeometry(7 * U_PER_M, 3 * U_PER_M, 3 * U_PER_M); g.translate(0, 1.5 * U_PER_M, 0); return g; })();
const matCabin = new THREE.MeshStandardMaterial({ color:0xE8E4DA, roughness:0.85 });
const heapGeo = (() => { const g = new THREE.ConeGeometry(7 * U_PER_M, 4 * U_PER_M, 7, 1); g.translate(0, 2 * U_PER_M, 0); return g; })();
const matHeap = new THREE.MeshStandardMaterial({ color:0xC8B48E, roughness:1 });

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

/* Every InstancedMesh in this file is built the same way: one scratch Object3D, one scratch
   Color, one function that fills the instance buffer and hands the mesh to its layer. It used
   to be written out inside addProps because addProps was the only caller; addParkProps below is
   the second, and two copies of the same fifteen lines is the wrong way to keep them in step. */
function makeBuilder(layer){
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
  return { build, M, col };
}

/* Ray-cast point-in-polygon, same test w2h-world.js already carries under the same name for the
   ground meshes. Kept local rather than imported: one eight-line function is not worth a shared
   module, and addParkProps needs it before the ground meshes exist on a fresh island. */
function pointInRing(ring, x, y){
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

/* =============================================================================================
   REAL PARKLAND, TOPPED UP.

   addProps above only ever saw plan.parks — invented circular blobs from the ground-plan
   painter, sized and counted by guesswork because nothing else existed yet. groundFeaturesFor in
   w2h-world.js now draws the actual OSM park rings from the bake, and this is the planting pass
   that follows them into the same shapes: same palm and shrub geometry, same shared materials,
   scattered inside a real polygon by ray-casting instead of jittered inside a fake circle.

   RUNS SEPARATELY FROM addProps, LATER, because it has to. addProps runs synchronously while an
   island is first built, off plan.parks alone; the real rings only exist once addGroundFeatures
   has awaited the basemap fetch, which on the calling side (world-nav.html) is unavoidably after
   buildIsland has already returned. Same reason the ground meshes themselves are a top-up and
   not part of the original build.

   THREE OF THE FOUR REAL KINDS PLANT. `canopy` — forest and nature_reserve — does not: it is
   mangrove and plantation, not municipal landscaping, and it is not a small category. Corniche's
   canopy rings alone total 1,247 hectares, more than half of everything green on the island.
   Treating that like a park and dropping a coconut palm every few hundred square metres would be
   wrong to look at, and it would be the single largest instance count in the scene for the
   privilege. groundFeaturesFor already gives canopy the correct mesh and the correct dark tone;
   that is the whole of what it should get.

   BUDGET IS GLOBAL AND RINGS ARE SORTED LARGEST FIRST within their kind, for the same reason:
   Corniche's real `lawn` kind (park, garden, common, recreation_ground, village_green) is 624
   hectares across 260 separate rings, and landscaping every one of them at a density that reads
   as tended would be tens of thousands of instances before a single dry-ground ring is reached.
   Sorted large to small, a fixed budget spends itself on the parks a person would actually
   notice and runs out on the slivers, which is the outcome that matters and not the total. */
function addParkProps(d, plan, rings, budget = {}, onIsle){
  const B = Object.assign({ palms:1800, shrubs:2800 }, budget);
  const R = plan.rndProps;
  const r = d.r;
  /* onIsle DEFAULTS TO "everywhere is land" rather than being required, so a caller — or a test
     harness — that hasn't wired it through yet degrades to the old behaviour instead of
     throwing. That silence is a real cost: the bug this parameter exists to fix (palms placed
     inside a park ring that itself crosses the true coastline — 176 of Corniche's 1,320 real
     park rings do, measured against the actual bake) comes back the moment this default is
     what's actually running, with nothing telling you it happened. */
  const onLand = onIsle || (() => true);
  /* OWN GROUP, RETURNED RATHER THAN ADDED, matching groundFeaturesFor's own contract exactly.
     This runs from addGroundFeatures, after an island's original snapshot/register/apply pass
     has already happened — so whatever it builds needs to go through that pass a second time,
     on its own, once these meshes exist. A group the caller can hand to snapshotMats and
     registerLift is how the ground meshes solved the identical problem; new instanced meshes
     dropped straight into d.detail with no group to name would solve it a second, different
     way, and two solutions to one problem is how the ordering bug in the code comment above
     addGroundFeatures happened the first time. */
  const group = new THREE.Group();
  group.name = 'parkProps';
  const { build, M } = makeBuilder(group);

  const palms = [], shrubs = [];
  const LAWN = { park:1, garden:1, common:1, recreation_ground:1, village_green:1 };
  const DRY  = { grass:1, meadow:1 };

  /* METRES, LIKE EVERY OTHER PROP DIMENSION IN THIS FILE, converted once via U_PER_M and left
     that way until the final push. A cluster spread written as a bare normalised number is
     wrong the moment two islands are compared: Corniche's radius is four times Maryah's, so a
     spread of 0.010 normalised units is a 12 m grove on one island and a 1.6 m knot of trunks
     touching each other on the other. Working in metres and normalising only at the end, the way
     the verge width in w2h-world.js already had to learn to, keeps a cluster the same real size
     everywhere it is planted. */
  const CLUSTER_R  = 6   * U_PER_M;   // spread of a palm cluster around its seed
  const BED_R      = 4   * U_PER_M;   // spread of a shrub bed around its seed
  const HEDGE_IN   = 2.5 * U_PER_M;   // how far inside the touchline the pitch hedge sits
  const HEDGE_STEP = 6   * U_PER_M;   // spacing along a pitch's edge

  function samplePoint(ring, bbox){
    for (let t = 0; t < 24; t++){
      const x = bbox[0] + R() * (bbox[2] - bbox[0]);
      const y = bbox[1] + R() * (bbox[3] - bbox[1]);
      if (pointInRing(ring, x, y)) return [x, y];
    }
    return null;                              // a ring too thin for its own bounding box to help
  }
  // ABSOLUTE island units in, NORMALISED units out — the one point every coordinate in this
  // function crosses from "real metres, real shape" into what build()'s place() callbacks and
  // every other list in this file already expect.
  //
  // THE STORED y IS NEGATED, AND THAT NEGATION IS LOAD-BEARING. Every build() callback below
  // places with `M.position.set(p.x * r, Y, -p.y * r)` — the SAME formula addProps above uses
  // for plan.parks, because that is where this function's first draft copied it from. But
  // plan.parks coordinates and these ring coordinates are not in the same convention: a real
  // ring's second coordinate IS the world Z already (traced through groundFeaturesFor: the
  // flip in prepGreenRing and the flip on mesh push cancel, so ring[i][1] lands on screen
  // exactly where it's written). Storing ay/r and letting the placement formula negate it a
  // SECOND time put every real-park palm and shrub at the mirror of the point that had just
  // been validated as being inside the ring and on land — confirmed by placing the SAME
  // accepted point at its un-mirrored position and watching Corniche's water-landing rate on
  // the real coastline drop from 61.6% to 16.3%. Negating here, once, before the placement
  // formula negates again, is what makes the two cancel and put the palm where onLand said it
  // was.
  //
  // onLand IS CHECKED HERE, NOT INSIDE pointInRing's callers — one choke point every placed
  // point passes through, palm, shrub, or hedge, rather than four separate call sites that could
  // individually drift out of sync. Ring membership says the point is inside the park; onLand
  // says the park itself hasn't wandered past the coast at this particular corner. Both have to
  // be true, and only onLand knows about the coastline. Checked BEFORE the negation, in the same
  // (worldX, worldZ) convention groundFeaturesFor's own onIsle already uses on ring vertices.
  const push = (arr, ax, ay, extra) => {
    if (!onLand(ax, ay)) return;
    arr.push(Object.assign({ x: ax / r, y: -ay / r }, extra));
  };

  const buckets = { lawn:[], dry:[], pitch:[] };
  for (const rec of rings){
    const kind = rec.kind;
    const bucket = LAWN[kind] ? 'lawn' : DRY[kind] ? 'dry' : kind === 'pitch' ? 'pitch' : null;
    if (!bucket || rec.length < 4) continue;               // canopy, and anything unclassified
    let x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
    for (const [x, y] of rec){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    buckets[bucket].push({ ring: rec, bbox:[x0,y0,x1,y1], areaM2: rec.areaM2 || 0 });
  }
  for (const k in buckets) buckets[k].sort((a, b) => b.areaM2 - a.areaM2);

  // ---- lawn: palm clusters and shrub beds, following the ring's own shape ----
  for (const rec of buckets.lawn){
    if (palms.length >= B.palms && shrubs.length >= B.shrubs) break;
    const { ring, bbox, areaM2 } = rec;
    /* THE CAP WAS THE BUG. A flat "at most 6 clusters" regardless of area gave Corniche's
       largest real park — 46.5 hectares, easily the most visually dominant lawn on the island —
       at most 36 palms across half a million square metres: one tree per 13,000 m2, invisible
       from any distance this scene is ever viewed at. Scaling with area and lifting the ceiling
       well above what any single ring will actually reach is what makes "sorted largest first"
       mean anything — the global budget below is the real backstop on total instance count, not
       a per-ring cap that quietly punished the one park a camera would actually frame. */
    const nClusters = Math.min(40, 1 + Math.floor(areaM2 / 2500));
    for (let c = 0; c < nClusters && palms.length < B.palms; c++){
      const seed = samplePoint(ring, bbox);
      if (!seed) continue;
      const n = 3 + Math.floor(R() * 4);
      for (let i = 0; i < n && palms.length < B.palms; i++){
        const a = R() * 6.2832, rr = R() * CLUSTER_R;
        const px = seed[0] + Math.cos(a) * rr, py = seed[1] + Math.sin(a) * rr;
        if (pointInRing(ring, px, py))
          push(palms, px, py, { kind: R() < 0.34 ? 0 : (R() < 0.70 ? 1 : 2) });
      }
    }
    const nBeds = Math.min(60, 1 + Math.floor(areaM2 / 3000));
    for (let b = 0; b < nBeds && shrubs.length < B.shrubs; b++){
      const seed = samplePoint(ring, bbox);
      if (!seed) continue;
      const n = 4 + Math.floor(R() * 6);
      for (let i = 0; i < n && shrubs.length < B.shrubs; i++){
        const a = R() * 6.2832, rr = R() * BED_R;
        const px = seed[0] + Math.cos(a) * rr, py = seed[1] + Math.sin(a) * rr;
        if (pointInRing(ring, px, py)) push(shrubs, px, py, { s: 0.6 + R() * 0.6 });
      }
    }
  }

  // ---- dry ground: sparse shrub clusters, no palms — a meadow is not a garden ----
  for (const rec of buckets.dry){
    if (shrubs.length >= B.shrubs) break;
    const { ring, bbox, areaM2 } = rec;
    const nBeds = Math.min(20, Math.floor(areaM2 / 6000));
    for (let b = 0; b < nBeds && shrubs.length < B.shrubs; b++){
      const seed = samplePoint(ring, bbox);
      if (!seed) continue;
      const n = 3 + Math.floor(R() * 4);
      for (let i = 0; i < n && shrubs.length < B.shrubs; i++){
        const a = R() * 6.2832, rr = R() * CLUSTER_R;
        const px = seed[0] + Math.cos(a) * rr, py = seed[1] + Math.sin(a) * rr;
        if (pointInRing(ring, px, py)) push(shrubs, px, py, { s: 0.55 + R() * 0.5 });
      }
    }
  }

  // ---- pitches: a hedge round the touchline, nothing standing on the field itself ----
  for (const rec of buckets.pitch){
    if (shrubs.length >= B.shrubs) break;
    const loop = rec.ring.concat([rec.ring[0]]);
    walk(loop, HEDGE_STEP, (x, y, tx, ty, i) => {
      if (shrubs.length >= B.shrubs || i % 2) return;      // a hedge, not a wall
      const nx = -ty, ny = tx;
      const px = x - nx * HEDGE_IN, py = y - ny * HEDGE_IN;
      if (pointInRing(rec.ring, px, py)) push(shrubs, px, py, { s: 0.5 + R() * 0.35 });
    });
  }

  const Y = plan.ground;
  build(shrubGeo, matShrub, shrubs, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, R() * 6.2832, 0);
    M.scale.set(p.s, p.s * (0.7 + R() * 0.6), p.s);
  });
  PALM_GEO.forEach((geo, k) => {
    const list = palms.filter(p => (p.kind || 0) === k);
    build(geo, [matBark, matFrond], list, (p) => {
      const s = 0.88 + R() * 0.26;
      M.position.set(p.x * r, Y, -p.y * r);
      M.rotation.set((R() - 0.5) * 0.16, R() * 6.2832, (R() - 0.5) * 0.16);
      M.scale.set(s * (0.94 + R() * 0.14), s * (0.88 + R() * 0.34), s * (0.94 + R() * 0.14));
    });
  });

  return { group, palms: palms.length, shrubs: shrubs.length };
}

/* =============================================================================================
   THE PLACER
   ============================================================================================= */
function addProps(d, layer, plan, budget = {}){
  const XS_ = plan.xsec;
  const B = Object.assign({ palms:420, lamps:280, cars:70, boats:14, shrubs:300 }, budget);

  /* ---- THE LAMP BUDGET IS SIZED FROM THE ROADS, NOT SET TO A NUMBER ----

     280 was never going to light a city. Corniche carries 367 km of major road; at 32 m on one
     side that is 11,458 columns, so a flat budget of 280 lit about two and a half per cent of it
     and stopped — and which two and a half per cent depended on the order the bake happened to
     emit polylines in, which is why the seafront was dark while random back streets were not.

     A budget that is a constant is really a statement that the developer does not know how much
     road there is. We do know: it is baked, it is measured here in the same units the walk uses,
     and the count that follows is simply length over spacing.

     THE CEILING IS ABOUT FRAME TIME, NOT TIDINESS. Lamps are instanced — one draw call however
     many there are — so the cost is the instance buffer and the emissive quads at night, not
     draw calls. Corniche's majors come to roughly eleven thousand instances, which against a
     scene already carrying between five and nine million triangles is real but affordable. The
     ceiling exists so that an island with pathological data cannot take the frame down.

     ?lamps=N overrides it, in the same spirit as ?cycw and ?cycol: the honest way to settle how
     much lighting is too much is to look at it. */
  if (XS_ && plan.mainRoadLen){
    const need = Math.ceil(plan.mainRoadLen / XS_.stepLamp);
    const m = typeof location !== 'undefined' && location.search.match(/[?&]lamps=(\d+)/);
    const ceil = m ? Math.min(40000, parseInt(m[1], 10)) : 12000;
    B.lamps = Math.max(B.lamps, Math.min(need, ceil));
    /* PALMS TOO (props v37). A flat 420 lit the first few polylines and left every boulevard after
       them bare — "long boulevards, roadside landscape missing". Sized from the main-road length
       at the palm step, both sides at two-thirds take-up, capped where the frond geometry (264
       triangles a tree) starts to cost more than the buildings. */
    const needPalms = Math.ceil(plan.mainRoadLen / XS_.stepPalm * 1.35);
    B.palms = Math.max(B.palms, Math.min(needPalms, 2600));
  }
  // Metres from the junction centre to the signal mast, across and along the approach.
  const SIGNAL_SETBACK = 16 / 7.8 / d.r;
  // Clear radius round a crossing centre in which no lamp, palm or car may stand.
  const JUNCTION_KEEP  = 26 / 7.8 / d.r;
  const XS = plan.crossings || [];
  function nearCrossing(nx, ny, rad){
    for (let i = 0; i < XS.length; i++){
      const dx = nx - XS[i].x, dy = ny - XS[i].y;
      if (dx*dx + dy*dy < rad*rad) return true;
    }
    return false;
  }
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
  /* THE CROSS-SECTION COMES FROM THE PAINTER NOW, and the two hardcoded widths this replaced are
     why lamps and palms have never sat where the road is drawn. `w: 0.040` for the ring and
     `0.034` for an arterial were fixed numbers in normalised units, while paintGround floors every
     road at MIN_PX and therefore draws it at a width that varies per island — about twice true
     scale on Corniche, near true on Al Maryah. Two answers to one question, so the props landed in
     the carriageway on one island and out in the sand on another, and no adjustment to those two
     constants could be right on both.

     plan.xsec carries the offsets already multiplied by the exaggeration the paint actually used.
     Fallback to the old constants if an older world file is loaded, so this file does not require
     them to move together. */
  const roads = plan.ring.map(pts => ({ pts, w: 0.040, cls: 'major' }))
    .concat(plan.arterials.map(a => ({ pts: a, w: 0.034, cls: a.cls || (a.major ? 'major' : 'minor') })));

  /* MAJOR ROADS FIRST, AND THIS IS WHY THE CORNICHE HAD NO LIGHTING AT ALL.

     The lamp budget is a few hundred per island. Corniche now carries 10,664 real centrelines and
     this loop walked them in array order, so the budget was exhausted somewhere in the first few
     hundred polylines the bake happened to emit — residential streets, mostly, scattered wherever
     they fell. The seafront never got any because the loop never reached it, not because the
     offsets were wrong.

     Sorting by class spends the budget where lighting reads: arterials and the ring, then minor
     roads, then locals if anything is left. */
  /* ---- THE SEAFRONT TRACK IS LIT FIRST, BEFORE ANY ROAD ----

     Placed ahead of the road walk rather than after it, because "after" is how the Corniche ended
     up dark: whatever runs last gets whatever budget is left, and on this island there is never
     any left. A share is taken off the top instead — a third of the lamps — so the one continuous
     ten-kilometre run in the scene is lit whatever else happens.

     ONE SIDE ONLY, landward, which is both what was asked for and what is built: a promenade lamp
     stands between the track and the road, not out on the water side where it would light the sea.
     The landward side is the one the road is on, and since these chains run along the coast the
     normal pointing away from the water is the one whose neighbouring ground is inside the island
     — the same test the painter's seawardSign uses, applied per column rather than per polyline
     because a 10 km chain changes which way the sea lies several times over. */
  const pathLamps = [];
  const chains = plan.cycleChains || [];
  if (chains.length && XS_){
    /* SPACING IS DERIVED FROM THE LENGTH, NOT FIXED, and a fixed one is why the lighting stopped
       half way along the promenade.

       The first version took a third of the lamp budget as a hard count and walked at the nominal
       25 m. Corniche's track is 10.2 km, which needs about four hundred columns; the count allowed
       roughly ninety. So it lit the first two and a half kilometres perfectly and then simply
       stopped, mid-run, which reads as a bug in the data rather than as a budget — and it is worse
       than sparse lighting, because a line that ends in the middle of nowhere draws the eye
       straight to it.

       Measuring the whole run first and dividing gives continuous coverage at whatever spacing the
       budget affords. Floored at the nominal so a short track on a small island is not lit tighter
       than reality; unbounded above, because a thin, even line the full length of the seafront is
       always better than a dense one that gives up. */
    let totalLen = 0;
    for (const c of chains)
      for (let i = 1; i < c.length; i++)
        totalLen += Math.hypot(c[i][0] - c[i-1][0], c[i][1] - c[i-1][1]);
    /* THE SPACING IS THE TARGET AND THE COUNT FOLLOWS, which is the opposite of the last version
       and the reason one end came out sparse.

       Deriving step from a fixed allotment sounded right but the arithmetic does not survive the
       real numbers: Corniche carries 59 km of cycle chain and the allotment was about 112 columns,
       so the spacing solved to roughly 520 metres. That is not lighting, it is an occasional lamp.

       Fixing the spacing instead and letting the count be whatever the length demands gives 59 km
       at 70 m, about 840 columns. Lamps are instanced — one geometry, one draw — so the cost of
       that is the instance buffer rather than draw calls, and the seafront is the one run in the
       scene where a continuous line of light is the entire point.

       The hard ceiling is a guard against a future island with an absurd amount of chain, not a
       budget: it sits well above what any of the six currently needs. */
    const stepPath = XS_.pathStepLamp * 2.8;          // 25 m nominal -> 70 m on the seafront
    const cap = 900;
    let placed = 0;
    for (const chain of chains){
      if (placed >= cap) break;
      walk(chain, stepPath, (x, y, tx, ty) => {
        if (placed >= cap) return;
        const nx = -ty, ny = tx;
        const off = XS_.pathLamp;
        /* Try the side whose ground is on the island; if both or neither are, fall back to a
           consistent side rather than skipping, so a run through a park still gets a column line
           instead of a gap. */
        const aIn = inside((x + nx * off) * 1.02, (y + ny * off) * 1.02);
        const bIn = inside((x - nx * off) * 1.02, (y - ny * off) * 1.02);
        const sgn = (aIn && !bIn) ? 1 : (bIn && !aIn) ? -1 : 1;
        const lx = x + nx * off * sgn, ly = y + ny * off * sgn;
        if (!inside(lx * 1.02, ly * 1.02)) return;
        lamps.push({ x:lx, y:ly, rot: Math.atan2(tx, ty) });
        pathLamps.push([lx, ly]);
        placed++;
      });
    }
  }

  /* ---- AND NOW THE ROAD PASS MUST NOT LIGHT THE SAME CORRIDOR TWICE ----

     Two placers were running over the same ground: this chain pass, and the road walk below
     lighting the ring road the track runs beside. Where the Corniche track sits alongside the
     carriageway — which is most of its length — that put two column lines a few metres apart,
     visibly denser than anywhere else on the island and wrong in a way that reads immediately.

     The cross-section says one line lights both, so the chain pass wins and the road pass yields.
     Tested by distance rather than by trying to decide in advance which roads run beside a track,
     because the answer changes along a single polyline. */
  const PAIR_KEEP = 46 / 7.8 / d.r;                  // metres, converted the same way as the rest
  function nearPathLamp(nx, ny){
    for (let i = 0; i < pathLamps.length; i++){
      const dx = nx - pathLamps[i][0], dy = ny - pathLamps[i][1];
      if (dx*dx + dy*dy < PAIR_KEEP*PAIR_KEEP) return true;
    }
    return false;
  }

  const RANK = { major: 0, minor: 1, local: 2 };
  roads.sort((a, b) => (RANK[a.cls] ?? 1) - (RANK[b.cls] ?? 1));

  roads.forEach(rd => {
    /* ONE SIDE PER ROAD, FIXED FOR ITS WHOLE LENGTH.

       This was `s = (i % 2) ? 1 : -1` — the column flipping sides at every step. That is a
       two-row line by construction, roughly 46 m apart across the corridor, and it had been there
       since long before any of the cross-section work. It survived three rounds of fixing the
       doubling because Corniche is dominated by the seafront chain lamps and hides it; Al Raha and
       Al Maryah have no long chain, so the road lamps are the whole of the lighting and the
       alternation is all there is to see.

       Real street lighting runs down one side and stays there. The side is picked once from the
       road's net bearing rather than at random, so two parallel streets are lit on the same
       geographic side instead of facing each other, and it is deterministic — the same road lights
       the same way on every rebuild.

       SPACING IS UNCHANGED AT 32 m AND THE COUNT IS UNCHANGED TOO. Every lamp that used to exist
       still exists; they are all on one side now instead of half on each. Per-side density
       therefore doubles, from a lamp every 64 m to every 32 m, which is what single-sided lighting
       actually looks like on a real carriageway. */
    const sideFor = pts => {
      const a = pts[0], b = pts[pts.length - 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      return (Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 1 : -1) : (dy >= 0 ? 1 : -1));
    };
    /* A ONE-WAY CARRIAGEWAY IS LIT FROM ITS OUTER KERB (v33): the right of travel, since the UAE
       drives on the right, which puts the columns in the transit strip on the far side from the
       median. Two-way roads keep the bearing rule. */
    const s = rd.pts.oneway ? -1 : sideFor(rd.pts);
    /* Half the painted corridor of THIS class (world v265), falling back to the ring's for an
       older world file. */
    const half = (XS_ && XS_.halfBy && XS_.halfBy[rd.cls] !== undefined) ? XS_.halfBy[rd.cls]
               : XS_ ? XS_.halfRoad : null;
    const stepL = XS_ ? XS_.stepLamp : 0.052;
    walk(rd.pts, stepL, (x, y, tx, ty, i) => {
      const nx = -ty, ny = tx;
      /* Kerb face plus the verge offset, which is the table's own definition. The old o1/o2 were
         multiples of a made-up corridor width and meant nothing in metres. */
      const o1 = XS_ ? (half + XS_.verge) : rd.w * 1.45;
      const o2 = XS_ ? (half + (XS_.palm !== undefined ? XS_.palm : XS_.green)) : rd.w * 2.35;
      const lx = x + nx * o1 * s, ly = y + ny * o1 * s;
      /* NOT IN THE JUNCTION. Lamps are walked along the road at a fixed spacing with no idea
         where the crossings are, so roughly one in eight landed inside an intersection — standing
         in the carriageway, which is visible from the plan camera and wrong from every other one.
         A junction is lit from its signal masts and its corners, never from its middle. */
      if (lamps.length < B.lamps && inside(lx * 1.02, ly * 1.02) && !nearCrossing(lx, ly, JUNCTION_KEEP)
          && !nearPathLamp(lx, ly))
        lamps.push({ x:lx, y:ly, rot: Math.atan2(tx, ty) });
      /* THE AVENUE WAS A PAIR AT EVERY STEP, both sides, at exactly the same offset — which is
         the single most visible repetition in the scene, because a road is a straight line and a
         perfectly periodic thing on a straight line is a comb.

         Real planting has gaps where a driveway or a junction interrupts it, runs of two or three
         where one has been replaced, and a metre or two of slop in the setback. Each side is now
         rolled independently, a third of the steps are skipped, and where planting does happen it
         is sometimes a small group rather than a single tree. */
      /* PALMS STAND IN THE TRANSIT STRIP OF MAJORS AND MINORS. A local street has no strip. */
      if (rd.cls === 'local') return;
      [1, -1].forEach(sgn => {
        if (R() < 0.34) return;                        // a gap: a crossing, an entrance
        const n = R() < 0.18 ? 2 + Math.floor(R() * 2) : 1;
        for (let k = 0; k < n; k++){
          if (palms.length >= B.palms) break;
          // Jitter along the road as well as across it, so a group is a group and not a row.
          const jt = (k - (n - 1) / 2) * 0.016 + (R() - 0.5) * 0.010;
          const off = o2 * (0.93 + R() * 0.16);
          const px = x + nx * off * sgn + tx * jt;
          const py = y + ny * off * sgn + ty * jt;
          /* A PALM IN A JUNCTION IS WORSE THAN A LAMP IN ONE. A lamp column is thin and reads as
             street furniture wherever it stands; a palm is a seven-metre crown sitting in the
             middle of an intersection, blocking the sightline the junction exists to keep open.
             Same keep-clear radius, applied for the stronger reason. */
          if (inside(px * 1.02, py * 1.02) && !nearCrossing(px, py, JUNCTION_KEEP))
            palms.push({ x:px, y:py, kind: R() < 0.62 ? 0 : (R() < 0.72 ? 2 : 1) });
        }
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
      /* PARKED CARS ARE PARKED, so one sitting in the middle of a signalised crossing is the most
         obviously wrong object in the scene once the signals are there to be obeyed. A slightly
         tighter radius than the lamps and palms: a car stopped AT the line is correct and only
         one inside the junction box is not. */
      if (nearCrossing(cx, cy, JUNCTION_KEEP * 0.78)) return;
      cars.push({ x:cx, y:cy, rot: Math.atan2(tx, ty) + (s < 0 ? Math.PI : 0) });
    });
  });

  /* PARKED CARS IN THE SURVEYED CAR PARKS (props v35). Rows along each lot's long axis, cars nose-in
     at a 2.7 m bay pitch, rows 8 m apart with alternating facing so each aisle has cars on both
     sides, about half the bays taken. Static, like the kerbside cars, and capped so a stadium car
     park does not eat the instance buffer. */
  {
    const lots = plan.parkingLots || [];
    const perM_ = 1 / (d.r * 7.8);
    const rowPitch = 8 * perM_, bayPitch = 2.7 * perM_;
    const LOT_CAP = 900;
    let placed = 0;
    for (const ring of lots){
      if (placed >= LOT_CAP) break;
      let best = 0, ux = 1, uy = 0;
      for (let i = 0; i < ring.length; i++){
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L > best){ best = L; ux = (b[0] - a[0]) / L; uy = (b[1] - a[1]) / L; }
      }
      const vx = -uy, vy = ux;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const q of ring){ const u = q[0] * ux + q[1] * uy, v = q[0] * vx + q[1] * vy;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
      let row = 0;
      for (let v = v0 + rowPitch * 0.6; v < v1 - rowPitch * 0.3; v += rowPitch, row++){
        const face = (row % 2) ? 1 : -1;
        for (let u = u0 + bayPitch * 0.8; u < u1 - bayPitch * 0.5; u += bayPitch){
          if (R() > 0.52) continue;
          const x = ux * u + vx * v, y = uy * u + vy * v;
          if (!pointInRing(ring, x, y) || !inside(x, y)) continue;
          if (placed >= LOT_CAP) break;
          cars.push({ x, y, rot: Math.atan2(vx * face, vy * face) });
          placed++;
        }
      }
    }
  }

  // Park palms, clustered. Parkland with evenly spaced trees reads as an orchard.
  plan.parks.forEach(p => {
    const n = 2 + Math.floor(R() * 4);
    for (let i = 0; i < n && palms.length < B.palms; i++){
      const a = R() * 6.2832, rr = p.r * (0.25 + R() * 0.8);
      const px = p.x + Math.cos(a) * rr, py = p.y + Math.sin(a) * rr;
      /* Parkland skews YOUNGER than an avenue: a park is planted at once and thins over decades,
         whereas a street is replanted tree by tree. Different mixes in different places is most of
         what stops the three variants reading as a shuffled deck. */
      if (inside(px * 1.03, py * 1.03) && !nearCrossing(px, py, JUNCTION_KEEP))
        palms.push({ x:px, y:py, kind: R() < 0.34 ? 0 : (R() < 0.70 ? 1 : 2) });
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
      if (inside(px * 1.02, py * 1.02) && !nearCrossing(px, py, JUNCTION_KEEP))
        palms.push({ x:px, y:py, kind: R() < 0.55 ? 0 : (R() < 0.80 ? 1 : 2) });
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

  /* SIGNALS AT THE MAJOR CROSSINGS ONLY, which is the same hierarchy the painted markings use: a
     signalised junction gets zebras and heads, a side-street junction gets a give-way bar and
     nothing standing. Four heads per junction, one per approach, each on the near right-hand kerb
     with its arm reaching out over the traffic it controls.

     Guarded, because plan.crossings arrived in world v65 and props must not require it — an older
     world.js would otherwise take the whole scene down rather than lose one prop. */
  /* FOUR HEADS AT EVERY CROSSING, not one junction in nine.

     v67 signalised only major-by-major, which is defensible traffic engineering and gave 26
     junctions across the whole archipelago — eight on Corniche. On screen that is nothing: you
     have to hunt for them. The honest reading is that this is a diorama of a Gulf city, where
     essentially every grid intersection IS signalised, and that the earlier restraint was solving
     a problem (the roundabout necklace) that does not apply to something four metres tall.

     270 crossings, 1,080 masts, about 65,000 triangles across five islands — against a p95 of
     12 ms in the heaviest view, which is the measurement that makes this an easy call. */
  const signals = [];
  XS.forEach((c, ji) => {
    /* EVERY JUNCTION RUNS ON ITS OWN CLOCK. A city where all the lights change together is a
       parade, not traffic — and it is the specific thing that gives away a scripted scene. Each
       junction gets a random phase and its own period, so at any instant the island shows a
       scatter of reds and greens rather than a state. */
    const phase  = R();
    const period = 9 + R() * 7;                   // seconds for a full two-way cycle
    const setback = SIGNAL_SETBACK;
    /* THE SAME TWO AXES THE PAINTER USES. A ring junction is a grid street meeting a curve, so its
       second axis is the ring's tangent and not a right angle off the first — signals placed on an
       assumed 90 degrees would stand in the coastal park at every seafront junction. */
    const axes = [c.th, c.th2 === undefined ? c.th + Math.PI / 2 : c.th2];
    /* A REAL JUNCTION LISTS ITS ARMS (world v264) and gets one head per arm, whatever their
       number or angle; the generated lattice still gives two axes and four arms. An arm's aspect
       group is whichever of the two axes it runs closer to, so opposite arms still share a phase
       and the perpendicular pair gets the complement. */
    const armN = c.arms ? c.arms.length : 4;
    for (let q = 0; q < armN; q++){
      // Arm 2 is the street continuing past a ring junction, and it does not.
      if (!c.arms && c.ring && q === 2) continue;
      const a = c.arms ? c.arms[q] : axes[q % 2] + (q >= 2 ? Math.PI : 0);
      const axisOf = c.arms ? (Math.abs(Math.sin(a - c.th)) < Math.abs(Math.sin(a - axes[1])) ? 0 : 1) : q % 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      // Right-hand kerb of this approach: along the arm's own direction, offset across it.
      const nx = -dy, ny = dx;
      const sx = c.x + dx * setback + nx * setback;
      const sy = c.y + dy * setback + ny * setback;
      if (!inside(sx, sy)) continue;
      /* The arm points back across the carriageway it faces, which is the -n direction. `axis` is
         which of the two crossing streets this head controls: opposite arms share an aspect and
         the perpendicular pair is its complement, which is what makes a junction legible rather
         than four independent lights. */
      signals.push({ x:sx, y:sy, rot: Math.atan2(-nx, -ny), axis: axisOf, phase, period });
    }
  });

  /* ---------- build the instanced meshes ---------- */
  const { build, M, col } = makeBuilder(layer);
  const Y = plan.ground;

  build(shrubGeo, matShrub, shrubs, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, R() * 6.2832, 0);
    M.scale.set(p.s, p.s * (0.7 + R() * 0.6), p.s);
  });

  /* ONE MESH PER VARIANT. Instancing is per geometry, so three shapes is three draw calls where
     there was one — the cheapest possible price for the variation, and three calls against the
     three hundred this district already issues.

     The per-instance scale stays, but NARROWER than before: it was doing all the variation work
     and had to span 0.80 to 1.28 to manage it. With the shape carrying the difference, scale goes
     back to being what it should be — two trees of the same age are not the same height, but they
     are not half again as tall either. */
  PALM_GEO.forEach((geo, k) => {
    const list = palms.filter(p => (p.kind || 0) === k);
    build(geo, [matBark, matFrond], list, (p) => {
      const s = 0.88 + R() * 0.26;
      M.position.set(p.x * r, Y, -p.y * r);
      M.rotation.set((R() - 0.5) * 0.16, R() * 6.2832, (R() - 0.5) * 0.16);
      // Height and girth vary independently: a wind-drawn palm is tall and thin, a sheltered one
      // squat. A single uniform factor cannot say that.
      M.scale.set(s * (0.94 + R() * 0.14), s * (0.88 + R() * 0.34), s * (0.94 + R() * 0.14));
    });
  });

  build(signalGeo, matPost, signals, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, p.rot, 0);
    M.scale.set(1, 1, 1);
  });
  /* The three aspect meshes are kept so the tick can rewrite their matrices. Every instance is
     written at full scale here and the tick immediately corrects it, so a signal is never left in
     an undefined state even if the tick is never called — an older nav that does not know about
     signals gets all three lit, which is visibly wrong but not broken. */
  const lensMeshes = signalLensGeo.map((geo, k) => build(geo, matSignal[k], signals, (p) => {
    M.position.set(p.x * r, Y, -p.y * r);
    M.rotation.set(0, p.rot, 0);
    M.scale.set(1, 1, 1);
  }));
  const haloMeshes = matHalo.map(mat => {
    const hm = build(haloGeo, mat, signals, (p) => {
      M.position.set(p.x * r, Y, -p.y * r);
      M.rotation.set(0, p.rot, 0);
      M.scale.set(1, 1, 1);
    });
    if (hm){ hm.castShadow = hm.receiveShadow = false; hm.userData.litMat = false;
             hm.userData.nightOnly = true; hm.userData.duskMats = mat; }
    return hm;
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

  /* CONSTRUCTION SITES (props v39): on each pad a crane at a corner for about a third of them,
     one or two cabins along an edge, a sand heap or two inside. */
  {
    const sites = plan.sites || [];
    const cranes = [], cabins = [], heaps = [], frames = [];
    const U = U_PER_M;
    for (const st of sites){
      const c = Math.cos(st.rot), s = Math.sin(st.rot);
      const at = (u, v) => [st.x + u * c - v * s, st.y + u * s + v * c];
      /* THE BUILDING GOING UP (props v40): two in three sites carry a bare frame at some stage —
         a slab or two, a mid-rise shell, or a tower core with the crane beside it. Plot in the
         pad's own frame, height in storeys of 3.2 m. */
      const stage = R();
      if (stage < 0.66){
        const storeys = stage < 0.22 ? 1 + Math.floor(R() * 3) : stage < 0.5 ? 4 + Math.floor(R() * 8) : 10 + Math.floor(R() * 18);
        const fw = st.w * (0.35 + R() * 0.25), fd = st.h * (0.35 + R() * 0.25);
        const q = at((R() - 0.5) * st.w * 0.2, (R() - 0.5) * st.h * 0.2);
        frames.push({ x:q[0], y:q[1], rot: st.rot, w: fw, d: fd, h: storeys * 3.2 * U });
        if (storeys >= 10 && R() < 0.6) frames.push({ x:q[0], y:q[1], rot: st.rot, w: fw * 0.35, d: fd * 0.35, h: (storeys + 4 + Math.floor(R() * 6)) * 3.2 * U });
        // a crane stands by anything above a few storeys
        if (storeys >= 4){ const cq = at((R() < 0.5 ? -1 : 1) * st.w * 0.36, (R() < 0.5 ? -1 : 1) * st.h * 0.34); cranes.push({ x:cq[0], y:cq[1], rot: R() * 6.2832 }); }
      } else if (R() < 0.3){
        const cq = at((R() < 0.5 ? -1 : 1) * st.w * 0.36, (R() < 0.5 ? -1 : 1) * st.h * 0.34); cranes.push({ x:cq[0], y:cq[1], rot: R() * 6.2832 });
      }
      const cb = at(-st.w * 0.3, -st.h * 0.42); cabins.push({ x:cb[0], y:cb[1], rot: st.rot });
      if (R() < 0.7){ const q = at(st.w * 0.3, (R() - 0.5) * st.h * 0.5); heaps.push({ x:q[0], y:q[1], s: 0.6 + R() * 0.8 }); }
    }
    build(frameGeo, matFrame, frames, (p) => { M.position.set(p.x * r, Y, -p.y * r); M.rotation.set(0, p.rot, 0); M.scale.set(p.w * r, p.h, p.d * r); });
    build(craneGeo, [matCrane, matCraneLamp], cranes, (p) => { M.position.set(p.x * r, Y, -p.y * r); M.rotation.set(0, p.rot, 0); M.scale.set(1, 1, 1); });
    build(cabinGeo, matCabin, cabins, (p) => { M.position.set(p.x * r, Y, -p.y * r); M.rotation.set(0, p.rot, 0); M.scale.set(1, 1, 1); });
    build(heapGeo, matHeap, heaps, (p) => { M.position.set(p.x * r, Y, -p.y * r); M.rotation.set(0, R() * 6.2832, 0); M.scale.set(p.s, p.s, p.s); });
    if (sites.length) console.info('construction props ' + d.id + ': frames ' + frames.length + ', cranes ' + cranes.length + ', cabins ' + cabins.length + ', heaps ' + heaps.length);
  }

  /* ---------- TRAFFIC (props v34) ----------

     MOVING CARS, ON THE SAME CENTRELINES THE GROUND PAINTS. Each vehicle is bound to one road
     polyline with a direction and a distance along it, advances every frame at that class's
     speed, and at the end of the road hands over to a road that shares the node it arrived at —
     the junction table realCrossings builds from the same shared nodes — so a car turns at a
     junction rather than vanishing. Only when nothing continues does it respawn elsewhere.

     RIGHT-HAND TRAFFIC. On a two-way road the car keeps to the right of travel; on a one-way
     carriageway it takes a random lane across the width. Lane offsets come from the painted
     corridor of the class, the same plan.xsec.halfBy the lamps use, so a car is on the tarmac
     the painter drew and not on the transit strip beside it.

     The count follows the road length — one car per 140 m of major and minor road, capped — and
     the cost is that many matrix writes a frame on two instanced meshes: the car bodies, which
     exist in every view, and the head and tail lights, which are nightOnly quads riding on the
     same matrices. Stopping at a red signal is deliberately not here yet: continuous flow first,
     then the junction rule. */
  const traffic = [];
  /* ON-ISLAND ROADS ONLY (props v36). The sidecar holds every road in the island's fetch box, and
     Al Maryah's box reaches across the channel: without this the traffic drove those roads over
     open water, headlights and all. A road qualifies when four in five of its samples are on the
     island — the same test the lamps and kerbside cars have always made per point. */
  const trafficRoads = roads.filter(rd => {
    if (rd.cls === 'local' || rd.pts.length < 2) return false;
    let n = 0, ok = 0;
    const step = Math.max(1, Math.floor(rd.pts.length / 8));
    for (let i = 0; i < rd.pts.length; i += step){ n++; if (inside(rd.pts[i][0], rd.pts[i][1])) ok++; }
    return ok >= n * 0.8;
  });
  const trafficCum = new Map();
  const trafficNodes = new Map();
  const ROAD_KERB_F = 1.20;                                 // the painter's kerb casing factor
  const perM = 1 / (d.r * 7.8);                             // normalised units per metre
  const cumOf = pts => {
    let c = trafficCum.get(pts);
    if (!c){ c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i-1] + Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1])); trafficCum.set(pts, c); }
    return c;
  };
  const nkey = p => Math.round(p[0] * 2e5) + ',' + Math.round(p[1] * 2e5);
  const laneOf = rd => {
    const half = (XS_.halfBy && XS_.halfBy[rd.cls] !== undefined) ? XS_.halfBy[rd.cls] : XS_.halfRoad;
    const road = half / ROAD_KERB_F;                        // kerb casing off: the tarmac half-width
    if (rd.pts.oneway){
      const lanes = Math.max(1, Math.min(6, (rd.pts.lanes | 0) || 2));
      const k = Math.floor(Math.random() * lanes);
      return -road + road * (2 * k + 1) / lanes;             // across the carriageway, any lane
    }
    return -road * 0.5;                                       // right of travel: -n is the right
  };
  const trafficSpawn = (v, rd, dir, s) => {
    v.rd = rd; v.dir = dir; v.s = s;
    v.speed = ((rd.cls === 'major' ? 16 : 11) * (0.85 + Math.random() * 0.3)) * perM;   // m/s -> units/s
    v.lane = laneOf(rd);   // the tangent is already flipped by dir, so -n is the right of travel either way
  };
  if (XS_ && trafficRoads.length){
    let total = 0;
    for (const rd of trafficRoads) total += cumOf(rd.pts).slice(-1)[0];
    const N = Math.min(260, Math.max(24, Math.round(total / (140 * perM))));
    for (const rd of trafficRoads){
      const a0 = rd.pts[0], b0 = rd.pts[rd.pts.length - 1];
      (trafficNodes.get(nkey(a0)) || trafficNodes.set(nkey(a0), []).get(nkey(a0))).push({ rd, dir: 1 });
      if (!rd.pts.oneway) (trafficNodes.get(nkey(b0)) || trafficNodes.set(nkey(b0), []).get(nkey(b0))).push({ rd, dir: -1 });
    }
    for (let i = 0; i < N; i++){
      const rd = trafficRoads[Math.floor(R() * trafficRoads.length)];
      const c = cumOf(rd.pts);
      const v = {};
      trafficSpawn(v, rd, rd.pts.oneway || R() < 0.5 ? 1 : -1, R() * c[c.length - 1]);
      traffic.push(v);
    }
  }
  const trafficMesh = build(carGeo, matCar, traffic, () => {
    M.position.set(0, -1000, 0); M.rotation.set(0, 0, 0); M.scale.set(1, 1, 1);
  }, () => {
    const v = R();
    const k = v < 0.62 ? 1.05 : v < 0.86 ? 0.78 : 0.42;
    return col.setRGB(k, k * 0.99, k * 0.97);
  });
  const lightsMesh = build(carLightGeo, [matHeadlight, matTaillight], traffic, () => {
    M.position.set(0, -1000, 0); M.rotation.set(0, 0, 0); M.scale.set(1, 1, 1);
  });
  const carPoolMesh = build(carPoolGeo, [matCarBeam, matCarTail], traffic, () => {
    M.position.set(0, -1000, 0); M.rotation.set(0, 0, 0); M.scale.set(1, 1, 1);
  });
  if (carPoolMesh){
    carPoolMesh.frustumCulled = false;
    carPoolMesh.castShadow = carPoolMesh.receiveShadow = false;
    carPoolMesh.userData.litMat = false;
    carPoolMesh.userData.nightOnly = true;
    carPoolMesh.userData.duskMats = [matCarBeam, matCarTail];
  }
  if (trafficMesh){ trafficMesh.frustumCulled = false; }
  if (lightsMesh){
    lightsMesh.frustumCulled = false;
    lightsMesh.castShadow = lightsMesh.receiveShadow = false;
    lightsMesh.userData.litMat = false;
    lightsMesh.userData.nightOnly = true;
    lightsMesh.userData.duskMats = [matHeadlight, matTaillight];
  }
  const TM = new THREE.Object3D(), TP = new THREE.Object3D();
  /* VISIBILITY SCALE (props v38): 1 at district range, up to 3.5 from the city camera, applied to
     the light pools only — the car bodies keep their size. */
  const visScale = camDist => Math.min(3.5, Math.max(1, (camDist || 0) / 700));
  function tickTraffic(t, dt, camDist){
    if (!traffic.length || !trafficMesh) return;
    const vis = visScale(camDist);
    for (let i = 0; i < traffic.length; i++){
      const v = traffic[i];
      const pts = v.rd.pts;
      const c = cumOf(pts);
      const L = c[c.length - 1];
      v.s += v.speed * dt * v.dir;
      if (v.s > L || v.s < 0){
        /* arrived at a node: continue on a road that leaves it, else start again elsewhere */
        const node = v.dir > 0 ? pts[pts.length - 1] : pts[0];
        const outs = (trafficNodes.get(nkey(node)) || []).filter(o => o.rd !== v.rd);
        if (outs.length){
          const o = outs[Math.floor(Math.random() * outs.length)];
          const oc = cumOf(o.rd.pts);
          trafficSpawn(v, o.rd, o.dir, o.dir > 0 ? 0 : oc[oc.length - 1]);
        } else {
          const rd = trafficRoads[Math.floor(Math.random() * trafficRoads.length)];
          const dir = rd.pts.oneway || Math.random() < 0.5 ? 1 : -1;
          trafficSpawn(v, rd, dir, dir > 0 ? 0 : cumOf(rd.pts).slice(-1)[0]);
        }
        continue;
      }
      // locate the segment
      let k = 1; while (k < c.length - 1 && c[k] < v.s) k++;
      const s0 = c[k-1], s1 = c[k], f = s1 > s0 ? (v.s - s0) / (s1 - s0) : 0;
      const a = pts[k-1], b = pts[k];
      let tx = (b[0] - a[0]) * v.dir, ty = (b[1] - a[1]) * v.dir;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const nx = -ty, ny = tx;                                 // left of travel
      const x = a[0] + (b[0] - a[0]) * f + nx * v.lane;
      const y = a[1] + (b[1] - a[1]) * f + ny * v.lane;
      TM.position.set(x * r, Y + 0.01, -y * r);
      TM.rotation.set(0, Math.atan2(tx, ty), 0);
      TM.scale.set(1, 1, 1);
      TM.updateMatrix();
      trafficMesh.setMatrixAt(i, TM.matrix);
      if (lightsMesh) lightsMesh.setMatrixAt(i, TM.matrix);
      if (carPoolMesh){
        TP.position.copy(TM.position); TP.rotation.copy(TM.rotation); TP.scale.set(vis, 1, vis);
        TP.updateMatrix();
        carPoolMesh.setMatrixAt(i, TP.matrix);
      }
    }
    trafficMesh.instanceMatrix.needsUpdate = true;
    if (lightsMesh) lightsMesh.instanceMatrix.needsUpdate = true;
    if (carPoolMesh) carPoolMesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------- the signal clock ----------

     Called from the frame loop, but it only WRITES when an aspect actually changes: a junction
     sits in one state for several seconds, so rewriting 312 matrices every frame would be pure
     waste. Tracking the previous aspect per signal turns a per-frame cost into an event.

     STANDARD TIMINGS as fractions of the cycle: green for 40 per cent, amber for 7, then red
     while the other axis has its turn. Amber only on the way to red — a UK-style red-and-amber
     start would need a fourth state and reads as a flicker at this scale. */
  const prev = new Int8Array(signals.length).fill(-1);
  const SM = new THREE.Object3D();
  const HM = new THREE.Object3D();
  function tickSignals(t, camDist){
    if (!signals.length) return;
    const vis = Math.min(3.5, Math.max(1, (camDist || 0) / 700));
    const dirty = [false, false, false];
    for (let i = 0; i < signals.length; i++){
      const s = signals[i];
      let u = ((t / s.period) + s.phase + (s.axis ? 0.5 : 0)) % 1;
      const aspect = u < 0.40 ? 2 : u < 0.47 ? 1 : 0;      // green, amber, red
      if (aspect === prev[i]) continue;
      prev[i] = aspect;
      for (let k = 0; k < 3; k++){
        const m = lensMeshes[k];
        if (!m) continue;
        SM.position.set(s.x * r, Y, -s.y * r);
        SM.rotation.set(0, s.rot, 0);
        // Zero scale rather than a visibility flag: an InstancedMesh has no per-instance visible.
        const on = (k === aspect) ? 1 : 0;
        SM.scale.set(on, on, on);
        SM.updateMatrix();
        m.setMatrixAt(i, SM.matrix);
        if (haloMeshes[k]){
          HM.position.copy(SM.position); HM.rotation.copy(SM.rotation); HM.scale.set(on * vis, on, on * vis);
          HM.updateMatrix();
          haloMeshes[k].setMatrixAt(i, HM.matrix);
        }
        dirty[k] = true;
      }
    }
    for (let k = 0; k < 3; k++)
      if (dirty[k] && lensMeshes[k]){
        lensMeshes[k].instanceMatrix.needsUpdate = true;
        if (haloMeshes[k]) haloMeshes[k].instanceMatrix.needsUpdate = true;
      }
  }
  tickSignals(0);

  return { palms: palms.length, lamps: lamps.length, cars: cars.length, boats: boats.length,
           shrubs: shrubs.length, signals: signals.length, traffic: traffic.length,
           tickSignals, tickTraffic };
}

return { addProps, addParkProps,
         materials: { matBark, matFrond, matPost, matGlow, matCar, matBoat, matShrub } };
}
