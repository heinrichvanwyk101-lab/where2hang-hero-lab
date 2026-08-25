/* PASTE TARGET: where2hang-hero-lab/w2h-city.js
   =============================================================================================
   BUILDING KIT. Everything that makes a building or a landmark, and nothing that knows about
   islands, cameras or navigation.

   Split out because the single file had grown past what is practical to paste by hand on a
   phone, which is the real authoring constraint on this project. Three modules means a change
   to a landmark touches 330 lines instead of 950, and the other two files never move.

   The seeded RNG lives here and is SHARED. Module evaluation order therefore determines the
   layout: import order changes the city. That is fine and deterministic, but it is the reason
   the seed is exported rather than re-created per module — two independent sequences would
   make the skyline reshuffle depending on which file happened to load first.
   ============================================================================================= */
import * as THREE from 'three';

/* BUILD STAMP. Shown in the #debug overlay alongside the stamps from the other three files.
   Three deploys in a row were diagnosed from screenshots that turned out to be a stale cache,
   which costs a full cycle each time and, worse, produces confident wrong conclusions about
   code that was never running. One line per module ends that argument in one screenshot. */
export const BUILD = 'city v71';

/* THE PALACE FOOTPRINT, EXPORTED, because w2h-world.js sizes the estate reservation and the lawn
   against it and has now got that wrong twice by reading a stale comment instead of the geometry.
   Half-span 24.6 in x and 6.0 in z, offset 0.4 south of the anchor. One constant, consumed
   wherever the building's extent is needed. */
/* NOW THE REAL RING'S OWN EXTENT. Was 49.2 x 12.0 — the hand-authored bar's bounding box. The
   traced footprint measures 64.3 x 49.3 units, so the estate reservation and the lawn in
   w2h-world.js were sized against a building four times shallower than the one that is there.
   dz goes to 0 because the ring is symmetric about the anchor in both axes. */
/* MASS-LOD HINTS, EXPORTED, BECAUSE THE PROXY LAYER KEPT DRIFTING OFF THE DETAIL LAYER.

   w2h-world.js builds a low-detail proxy for each landmark and its own note states the contract:
   "tapping must ADD, never move." It was broken on two of four. Measured:

       Etihad   towers jump up to 122 m and grow up to 69 m between the layers
       Palace   mass 25 x 11 against a detail footprint of 64.3 x 49.3
       ADNOC    matches
       Qasr     no proxy at all — it simply vanishes at mass range

   The Etihad case is the instructive one. w2h-world carries its own ETIHAD_SPEC with a comment
   saying it is "the SAME dx and dz as w2h-city.js's etihadTowers spec", and it has not been since
   city v63 moved those towers onto surveyed positions. Two tables, one of them asserting it
   agrees with the other, and nothing checking. That is not a mistake anyone made; it is what
   duplicated constants do.

   So the layout leaves this module as data. One table, consumed by both layers. */
export const ETIHAD_LAYOUT = [
  { dx: -5.83, dz: -7.87, h: 35.59, r: 2.65 },   // T1, 277.6 m
  { dx:  1.82, dz: -9.22, h: 30.00, r: 2.52 },   // T4, 234.0 m
  { dx:  0.58, dz:  0.75, h: 33.37, r: 2.92 },   // T3, 260.3 m
  { dx: -2.02, dz:  8.86, h: 39.14, r: 3.08 },   // T2, 305.3 m
  { dx:  5.45, dz:  7.48, h: 27.88, r: 2.38 },   // T5, 217.5 m
];

/* The palace ring's rotation and its grand dome, for the proxy to stand a box and a bump on. */
export const PALACE_MASS = { rot: 0.524, domeDx: 2.70, domeDz: 7.90, domeApex: 9.22 };

/* Qasr Al Watan. The bbox is NOT centred on the anchor — the flanking palaces sit unevenly
   either side — so the proxy needs the offset or it lands 74 m west of the building. */
export const QASR_FOOT = { w: 87.7, d: 69.6, dx: -9.50, dz: -4.23 };
export const QASR_MASS = { wing: 3.85, domeDx: -0.25, domeDz: 15.25, domeApex: 9.22 };

export const PALACE_FOOT = { w:64.3, d:49.3, dz:0.0 };

export const C = {
  night:   0x0B1620,
  haze:    0x241D15,
  mass:    0x151A1F,
  masswarm:0x241E17,
  gold:    0xE8B547,
  teal:    0x00C2A8,
  water:   0x0A141B,
};

let seed = 20260728;
export function rnd(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
export function reseed(v){ seed = v; }

/* A FACTORY, not top-level constants. windowTexture needs the renderer's max anisotropy, and
   the renderer does not exist at module-evaluation time. Calling createCityKit(renderer) once
   the context is up keeps that dependency explicit instead of hiding it in a global. */
export function createCityKit(renderer){
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

/* WINDOWS ARE HORIZONTAL, AND THE FIRST VERSION WAS NOISE.

   Independent per-window random lighting produces a field of unrelated dots, and at the place
   camera that reads as dirt on the glass rather than as a building. Two things fix it, and
   neither is expensive:

   1. FLOOR LINES. A continuous faint horizontal line on every storey, lit or not. Real curtain
      wall has a spandrel band at every slab edge and it is visible from a mile away — it is the
      strongest single cue that a surface is a building. Vertical mullions get a fainter line;
      they matter less because they are usually closer together than the eye can separate.

   2. RUNS, NOT DOTS. Offices are lit in blocks — a whole floor, a corner, a bank of four. The
      loop now decides "is this run lit" and then paints two to five adjacent cells, so the
      lights group into horizontal streaks along the floor lines instead of scattering. */
function windowTexture(cols, rows, litChance, warm){
  const cv = document.createElement('canvas');
  cv.width = cols * 4; cv.height = rows * 4;
  const g = cv.getContext('2d');
  g.fillStyle = '#05080b'; g.fillRect(0, 0, cv.width, cv.height);

  g.fillStyle = 'rgba(190,205,215,0.10)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * 4 + 3, cv.width, 1);
  g.fillStyle = 'rgba(190,205,215,0.045)';
  for (let x = 0; x < cols; x++) g.fillRect(x * 4 + 3, 0, 1, cv.height);

  for (let y = 0; y < rows; y++){
    let x = 0;
    while (x < cols){
      // The run length is what turns dots into banding, so the per-cell chance is scaled down
      // to keep the overall lit fraction roughly where it was.
      if (Math.random() < litChance * 0.55){
        const run = 2 + Math.floor(Math.random() * 4);
        const base = 0.45 + Math.random() * 0.55;
        for (let k = 0; k < run && x < cols; k++, x++){
          const a = Math.min(1, base * (0.82 + Math.random() * 0.36));
          g.fillStyle = warm
            ? 'rgba(232,181,71,' + a.toFixed(2) + ')'
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
  // A tower face seen from 1.5km is minified hard and viewed at an angle. Without anisotropic
  // filtering the GPU takes one texel per pixel from a mip chain chosen for the WORST axis, so
  // window rows smear along the steep direction. This is the wire-wool aliasing the comment
  // above fought with tile counts; tile counts were only half of it.
  t.anisotropy = MAX_ANISO;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}
// Sparser and dimmer. At 0.34/0.42 every tower glittered evenly and read as scribble rather
// than as a lit building; a night skyline is mostly dark with pockets of light.
const TEX_TOWER = windowTexture(14, 46, 0.17, false);
const TEX_BLOCK = windowTexture(18, 14, 0.22, true);

// repX/repY are TILE COUNTS, and getting them wrong is not a cosmetic error. The first pass
// used h/1.5, putting roughly 1,150 window rows on a 380m tower: far below one pixel per row at
// this distance, so every building aliased into wire wool.
// h/16 WAS STILL 40 PER CENT TOO MANY. One tile is 46 rows; at a 4 m floor that is 184 m, and
// at 7.8 m per unit that is 23.6 units per tile — not 16. The old divisor put 92 floors on
// Etihad's tallest tower, a 2.6 m storey height, which is why the glass read as fine speckle
// rather than as floors. h/24 gives a 4 m storey and lets the banding show.
// Cached. Every building was cloning its own texture and material, which took draw calls from
// 44 to 240. Repeats are quantised so near-identical buildings share one material.
/* DUSK COLOURS FOR THE LANDMARKS.

   world-nav.html v23 stopped forcing every non-glass material to one hex at dusk and started
   honouring m.userData.duskColor instead. Until now this file declared none, so Etihad's mass,
   ADNOC and Emirates Palace all came out of the lift as the same DUSK_STONE as the generated
   fabric — three buildings that carry the island's identity, rendered in the default.

   Keyed by the NIGHT hex, because that is what cityMaterial is already given and what the cache
   key is built from. Anything absent still falls back, so this list can grow one entry at a time.
   Etihad is deliberately not here: it is glass, and glass gets a material treatment rather than a
   colour. */
const DUSK_BY_NIGHT = {
  /* WAS 0xC7B49A, AND IT MADE ADNOC A BEACON. That is a pale warm tan, and once world v51 gave
     the surrounding fabric lit facades the tower became the one large unbroken light surface in a
     blue-grey city — brighter than anything near it and reading as bare stone rather than as the
     bronze-glass tower it is. The real building is markedly DARKER than the concrete around it,
     which is the whole reason it stands out on the Corniche. */
  /* THE BRONZE PREMISE WAS WRONG, AND EVERY COLOUR DECISION ABOVE WAS DOWNSTREAM OF IT. Checked
     against photographs rather than remembered: ADNOC HQ's frame is BETHEL WHITE GRANITE, a pale
     grey-white dimension stone, and the only glass on the building is the curtain wall recessed
     between the two granite end walls. There is no bronze anywhere on it.

     The old note here is still right about the failure it describes — a pale warm tan on the
     WHOLE tower did make it a beacon. That is no longer the risk, because pale stone is now only
     the frame: two end blades and a lintel, roughly a third of the visible face, with dark blue
     glass filling the rest. A pale frame around a dark field is the real building's actual
     contrast and cannot read as one large unbroken light surface, which is what went wrong. */
  0x121A24: 0xA9B6BE,   // ADNOC curtain wall: blue-grey glass, cooler and darker than Etihad's
  0x151A1F: 0xD3C4A6,   // generic mass: the same precast concrete the fabric uses, so they agree
  0x111C22: 0xB9BCC0,   // Etihad's solar glass reads as brushed metal against a low sun
  /* THE BRONZE ETIHAD TOWER IS GONE, and it never existed. The entry here reasoned from real
     photographs — one warm tower does stand apart from four cool ones in shot after shot — but
     the warm building is a neighbour of the complex, not a member of it. All five Etihad towers
     carry the same grey-blue coated curtain wall, specified for uniformity. Second time in one
     session that a photographed observation was recorded as a fact about the wrong building. */
};

/* DAY COLOURS, WHICH DID NOT EXIST AND SHOULD HAVE.

   world v53 gave the generated fabric day materials so the five wall types stay five wall types
   under the sun. The LANDMARKS were left behind: nothing in this file sets userData.dayMats, so
   the view switcher hands every one of them its fallback dayMat — a single flat 0xC9C2B2 with no
   map at all. In Day, ADNOC and the palace are therefore untextured pale boxes standing in a
   fabric that now has glazing, floor lines and five distinct wall colours. The landmarks look
   less resolved than the background city, which is precisely backwards. */
const DAY_BY_NIGHT = {
  0x121A24: 0x8FA6B4,   // ADNOC glass: deep blue-grey, plainly darker than its own stone frame
  0x151A1F: 0xD2CBBE,   // generic mass: matches the fabric's precast
  0x111C22: 0xA8BAC4,   // Etihad: the same blue-green glass the fabric's towers use
};

/* The daylight counterpart of the window texture: a pale wall with DARK glazing, because in
   daylight a window is a hole in a bright facade rather than a light source. Mean brightness near
   1.0 so it modulates the colour above rather than replacing it. */
function facadeDayTexture(cols, rows){
  const cv = document.createElement('canvas');
  cv.width = cols * 4; cv.height = rows * 4;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(120,116,110,0.55)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * 4 + 3, cv.width, 1);
  g.fillStyle = 'rgba(120,116,110,0.30)';
  for (let x = 0; x < cols; x++) g.fillRect(x * 4 + 3, 0, 1, cv.height);
  // Deterministic, like everything else here: a landmark that reshuffles its glazing on reload
  // makes two screenshots incomparable.
  let h = 0x2545F491;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      g.fillStyle = 'rgba(74,84,92,' + (0.30 + rnd() * 0.16).toFixed(2) + ')';
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
// Matched to the two window textures so the repeat counts computed at every call site stay valid
// for the day map without a second set of arithmetic.
const DAY_TOWER = facadeDayTexture(14, 46);
const DAY_BLOCK = facadeDayTexture(18, 14);

/* ARCH FACADE — for the two traced palaces, which had no window rhythm at all. Their walls used
   the same flat "stone" material as their domes, so at any distance closer than the horizon shot
   they read as smooth blocks: correct silhouette, no architecture. TEX_TOWER and TEX_BLOCK are
   both a curtain-wall grid — square panes on a skyscraper rhythm — and putting either on a
   classical stone facade would read as a glass building wearing a palace's proportions.

   HIGHER RESOLUTION THAN THE TOWER TEXTURES, DELIBERATELY. Those are 4 px per cell because a
   tower is seen from 1.5 km and a texel is already sub-pixel at that range. These buildings sit
   in their own place camera at a few hundred units, close enough that an arched window is worth
   more than four pixels: 10 px per cell draws a recognisable pointed arch rather than a blur.

   ONE WINDOW PER CELL, NOT A RANDOM RUN. windowTexture's lit-run logic makes sense for an office
   tower where floors light unevenly; a palace facade is a fixed masonry rhythm, arch after arch,
   with only WHICH ones are lit varying at night. Position and shape are identical between the
   day and night versions for that reason — only fill and glow differ. */
function archTexture(cols, rows, litChance){
  const cv = document.createElement('canvas');
  const CW = 10;
  cv.width = cols * CW; cv.height = rows * CW;
  const g = cv.getContext('2d');
  g.fillStyle = '#050403'; g.fillRect(0, 0, cv.width, cv.height);
  let h = 0x9E3779B9;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const cx = x * CW + CW/2, top = y * CW + CW*0.30, bot = y * CW + CW*0.92;
      const hw = CW * 0.26, lit = rnd() < litChance;
      g.fillStyle = lit ? 'rgba(232,190,110,' + (0.55 + rnd()*0.35).toFixed(2) + ')'
                         : 'rgba(150,165,175,0.05)';
      g.beginPath();
      g.moveTo(cx - hw, bot);
      g.lineTo(cx - hw, top + hw);
      g.quadraticCurveTo(cx - hw, top, cx, top);
      g.quadraticCurveTo(cx + hw, top, cx + hw, top + hw);
      g.lineTo(cx + hw, bot);
      g.closePath(); g.fill();
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
function archDayTexture(cols, rows){
  const cv = document.createElement('canvas');
  const CW = 10;
  cv.width = cols * CW; cv.height = rows * CW;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
  // A thin string-course at the foot of every row — the cue that this is coursed stone, not a
  // single poured surface.
  g.fillStyle = 'rgba(120,110,96,0.35)';
  for (let y = 0; y < rows; y++) g.fillRect(0, y * CW + CW - 1, cv.width, 1);
  let h = 0x9E3779B9;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  for (let y = 0; y < rows; y++){
    for (let x = 0; x < cols; x++){
      const cx = x * CW + CW/2, top = y * CW + CW*0.30, bot = y * CW + CW*0.92;
      const hw = CW * 0.26;
      // The recess: darker in the middle of the opening, a paler rim either side standing in
      // for the moulded surround real arched windows are cut with.
      g.fillStyle = 'rgba(150,140,124,0.55)';
      g.beginPath();
      g.moveTo(cx - hw - 1, bot); g.lineTo(cx - hw - 1, top + hw);
      g.quadraticCurveTo(cx - hw - 1, top - 1, cx, top - 1);
      g.quadraticCurveTo(cx + hw + 1, top - 1, cx + hw + 1, top + hw);
      g.lineTo(cx + hw + 1, bot);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(60,58,52,' + (0.55 + rnd()*0.15).toFixed(2) + ')';
      g.beginPath();
      g.moveTo(cx - hw, bot); g.lineTo(cx - hw, top + hw);
      g.quadraticCurveTo(cx - hw, top, cx, top);
      g.quadraticCurveTo(cx + hw, top, cx + hw, top + hw);
      g.lineTo(cx + hw, bot);
      g.closePath(); g.fill();
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
/* 14 x 46, matching TEX_TOWER's own dimensions exactly, on purpose: writeSlabUVs computes its
   tile size from SLAB_BAY_M and a HARDCODED 14 x 46 cell count, not from whatever texture is
   bound. Any other cell count would still be metre-correct in the UVs but would tile the wrong
   number of window cells into that space — matching the count is what keeps one window per
   4-metre bay rather than a fraction of one. */
const TEX_ARCH = archTexture(14, 46, 0.16);
const DAY_ARCH = archDayTexture(14, 46);

/* One helper, used by both traced palaces, so the facade treatment cannot drift between them.
   Hand-built rather than routed through cityMaterial: that function's TEX_TOWER/TEX_BLOCK
   ternary picks the day map by identity, and a third texture would silently fall through to the
   wrong one. Mirrors cityMaterial's day/dusk wiring by hand instead. */
function palaceFacadeMat(colourDay, colourDusk, emissiveIntensity){
  /* DUSK AND NIGHT HAD NO ARCHES AT ALL, ONLY GLOW DOTS — because this base material carried
     emissiveMap and nothing else, which is the SAME pattern cityMaterial() uses for every tower
     on the island (checked: ADNOC and Etihad's base materials are emissiveMap-only too). Windows
     appearing only as sparse night glints and vanishing to a flat colour at dusk is a city-wide
     trait, not something specific to this building — it was simply invisible here before because
     the palace had no facade detail in ANY mode to lose.

     DAY_ARCH ADDED AS THE BASE map TOO, not a new texture. It is already built to sit on white
     and multiply toward its own colour, which is exactly what a base material needs: at dusk the
     recesses shade against colourDusk under the dusk sun, at night applyLift's albedo boost
     (x5 for stone) lifts the same recesses to a readable dark relief, and the emissiveMap keeps
     doing its own job of picking out which few windows are lit. Three renders, one relief. */
  const m = new THREE.MeshStandardMaterial({
    color: 0x120F0A, roughness: 0.82, metalness: 0.02, map: DAY_ARCH,
    emissive: 0xffffff, emissiveMap: TEX_ARCH, emissiveIntensity });
  m.userData.glassOverride = false;
  m.userData.duskColor = colourDusk;
  m.userData.dayMats = new THREE.MeshStandardMaterial({
    color: colourDay, roughness: 0.82, metalness: 0.0, map: DAY_ARCH });
  return m;
}

const matCache = new Map();
function cityMaterial(tex, repX, repY, emissive, colour){
  const key = (tex === TEX_TOWER ? 'T' : 'B') + repX + '_' + repY + '_' +
              emissive.toFixed(2) + '_' + (colour === undefined ? 'd' : colour);
  const hit = matCache.get(key);
  if (hit) return hit;
  // clone() copies filter settings, but set them explicitly: a clone that loses anisotropy is a
  // silent regression that only shows up as smeared windows on the far rows.
  const t = tex.clone();
  t.anisotropy = MAX_ANISO;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true; t.repeat.set(repX, repY);
  const m = new THREE.MeshStandardMaterial({
    color: colour === undefined ? C.mass : colour,
    roughness: 0.72, metalness: 0.14,
    emissive: 0xffffff, emissiveMap: t, emissiveIntensity: emissive,
  });
  const base = colour === undefined ? C.mass : colour;
  const dc = DUSK_BY_NIGHT[base];
  if (dc !== undefined) m.userData.duskColor = dc;

  /* The Day counterpart, built here so it shares this call's repeat counts exactly. The day map
     is a different texture but the SAME tiling: get that wrong and the glazing changes size
     between modes on the same building, which reads as the building changing scale. */
  const dt = (tex === TEX_TOWER ? DAY_TOWER : DAY_BLOCK).clone();
  dt.anisotropy = MAX_ANISO;
  dt.minFilter = THREE.LinearMipmapLinearFilter;
  dt.needsUpdate = true; dt.repeat.set(repX, repY);
  m.userData.dayMats = new THREE.MeshStandardMaterial({
    color: DAY_BY_NIGHT[base] !== undefined ? DAY_BY_NIGHT[base] : 0xC9C2B2,
    roughness: 0.86, metalness: 0.0, map: dt,
  });

  matCache.set(key, m);
  return m;
}


/* ===========================================================================
   LANDMARKS — SILHOUETTE FIRST.

   Brief, taken literally: converted to flat black, this must still read as Abu Dhabi. So the
   effort here goes into PROFILE, not surface. The first pass built everything from the same
   tapered cylinder, which is why it read as a generic dark city — five identical primitives
   cannot carry recognition however well they are lit.

   Tap SILHOUETTE to test exactly that: every material flattens to black against a pale sky.
   If a landmark is not recognisable in that mode, no amount of lighting in build two saves it.

   Real heights in metres are noted; divide by 10 for units. Proportions are compressed
   deliberately — curate, do not model.
   =========================================================================== */

/* A tower whose profile CURVES. Etihad Towers lean and swell and are cut off at a slant at the
   crown; that diagonal top edge is the single most recognisable thing about them, and a flat
   cap throws it away. Built by displacing the vertices of a cylinder:
     swell  — radius bulge through the middle of the rise
     lean   — lateral drift, weighted to the top so the tower curves rather than tilts
     shear  — the slanted crown, applied only near the top so the base stays plumb
     ell    — elliptical footprint                                                            */
function curvedTower(h, rBot, rTop, swell, lean, shear, ell, segs, storeyM){
  const radial = segs || 44, heightSegs = 24;
  const g = new THREE.CylinderGeometry(rTop, rBot, h, radial, heightSegs, false);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++){
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // CLAMPED, and the clamp is load-bearing. Vertex positions are Float32; for a height whose
    // half is not exactly representable (27.7 -> 13.85) the bottom cap lands a few ten-millionths
    // BELOW -h/2, so t comes out very slightly negative. Math.pow(negative, 1.7) is NaN, that NaN
    // writes straight into the position buffer, and three then throws on computeBoundingSphere.
    // Silent for the old heights (30, 33, 28 — halves exact) and triggered the moment the real
    // Etihad ratios went in. Clamping costs nothing and removes a whole class of edge case.
    const t = Math.min(1, Math.max(0, (y + h/2) / h));   // 0 at base, 1 at crown
    /* THE PLAN IS A LENS, NOT AN ELLIPSE, AND THAT IS MOST OF WHY THESE READ AS UNDER-MODELLED.

       An ellipse meets its own long axis TANGENTIALLY: near the tip z falls off as the square
       root of the distance from it, so the end is a smooth round nose. Every photograph of these
       towers shows the opposite — two curved faces meeting in a hard vertical arris that catches
       the sun as a bright line the full height of the building. That line is the single strongest
       cue that the tower has two faces rather than being a fat cylinder, and a tangential ellipse
       cannot produce it at any radius.

       Multiplying z by |sin| of the original angle is the cheapest correction that does. It
       leaves the widest point untouched — |sin| is 1 at 90 degrees — and takes the fall-off at
       the tips from square-root to linear, which is a corner. LENS is the blend, so 0 restores
       the old ellipse exactly if this is ever wrong.

       Taken from the ORIGINAL cylinder angle, before swell and lean have touched anything. Lean
       shifts x by a per-height constant, so an angle recovered afterwards would drift round the
       tower as it rises and the arris would spiral. */
    const ang = Math.atan2(z, x), sa = Math.abs(Math.sin(ang));
    const LENS = 0.75;
    const k = 1 + swell * Math.sin(Math.PI * t);
    x *= k; z *= k * ell * ((1 - LENS) + LENS * sa);
    x += lean * Math.pow(t, 1.7);
    /* THE CROWN IS THE WHOLE POINT OF THIS TOWER AND t^7 THREW IT AWAY. Measured on the built
       geometry: the slant was reaching a correct 19-23 degrees, but t^7 is still under 0.02 at
       t = 0.6 and under 0.21 at t = 0.8, so the entire cut lived in the top two per cent of the
       height. Total drop across the crown came to 0.5-0.7 units on towers 28 to 39 units tall.
       At any camera in this scene that is a rounded-off flat cap, which is what the bench render
       shows and what the reference photographs plainly are not.

       t^5 spreads the same cut over roughly the top fifth. Combined with the 1.85x on the shear
       constants, the tallest tower's crown now drops about 4.8 units across its width — a real
       blade against the sky rather than a chamfered edge. The angle is unchanged in kind; what
       changes is how much of the tower participates in it. */
    y += shear * (x / Math.max(rBot, 0.001)) * Math.pow(t, 5);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();

  /* THE WINDOWS THAT LOOKED CARVED FROM ROCK, POINTY, RIGHT AT THE CROWN — this is why. The lean
     is uniform per height-ring (same t, same offset for every vertex around it), so it never
     touches the UVs; the SHEAR is not — it scales with (x / rBot), which is different at every
     point AROUND a ring, so vertices that started at the identical height end up at different
     actual Y once shear runs. And shear scales with t^7: nearly flat for most of the tower, then
     rising fast in roughly the top fifth — so ADJACENT height rings near the crown can end up
     with substantially different shear amounts, while the texture's V coordinate still assumes
     the original, perfectly even ring spacing from before any of this ran. The rows of windows
     get crowded together unevenly exactly where the shear is steepest, which is the crown — a
     jagged, hand-cut look on the one feature (window rhythm) that most needs to read as machined.

     The slant itself is not the bug — "slanted crowns" is the documented, correct, intentional
     shape for this tower. Only the texture's ignorance of that shape is being fixed here.

     Recomputed PER COLUMN, not globally: CylinderGeometry's torso is a (radial+1) x (heightSegs+1)
     grid, indexed row-major, so column c's vertices sit at c, c+(radial+1), c+2(radial+1)... Each
     column traces one continuous vertical strip up the tower — exactly the strip a single line of
     windows runs up — so restretching V within that column's own real Y range (not the whole
     tower's) is what actually matches a real vertical window-line's real, individual length. Cap
     vertices sit past the torso grid's own vertex count and are left alone; they already fold to
     the texture's centre and were never the problem. */
  /* AND THE UVs GO INTO METRES, WHICH IS THE FIX ROUNDEDSLAB ALREADY HAS AND THIS NEVER GOT.

     writeSlabUVs was written because ADNOC's windows came out eight centimetres apart, and its
     conclusion was that bay and storey are REAL QUANTITIES and must be sized in world units
     rather than by a tile count guessed at the call site. That fix was applied to the slab and
     the cylinder was left on the old scheme, so Etihad kept a repeat of (2, round(h/24)).

     MEASURED, ON THE FIVE TOWERS AS SHIPPED:

         T1  46 rows over 279 m  =  6.06 m per storey
         T4  46 rows over 234 m  =  5.09
         T3  46 rows over 260 m  =  5.66
         T2  92 rows over 307 m  =  3.33
         T5  46 rows over 217 m  =  4.73

     round(h/24) is 1 for four towers and 2 for T2, so T2 alone gets twice the rows and its
     windows come out at little over half the size of its neighbour's. Five buildings standing
     together with an 82 per cent spread in storey height between them, and a 6 m storey on a
     residential tower. No colour work could have fixed that and none of it was ever the problem.

     STOREY IS PER TOWER AND REAL. Each tower's published height over its published floor count:
     T1 277.6/69, T2 305.3/80, T3 260.3/60, T4 234.0/66, T5 217.5/61 — between 3.55 and 4.34 m,
     and the office tower genuinely does have the tallest floors. That is a real difference
     between these buildings and it costs nothing to carry.

     U IS ARC LENGTH, NOT ANGLE, for the same reason the slab's is. CylinderGeometry's u is
     uniform in ANGLE, and at ell 0.62 the pointed ends of the lens occupy a large share of the
     angle and almost none of the length — so an angular u crushes the glazing into the two
     vertical arrises, which are exactly the edges that read against the sky.

     V IS STILL PER COLUMN, and that part was already right — see the note above on shear. What
     changes is that a column now measures its own length in metres instead of normalising to
     0..1, so a tall column and a short one get the same storey rather than the same row count. */
  const cols = radial + 1, rows = heightSegs + 1, torsoCount = cols * rows;
  const TW = 14 * (SLAB_BAY_M / M_PER_U);                       // one tile across, in units
  const TH = 46 * ((storeyM || SLAB_BAY_M) / M_PER_U);          // one tile up, in units

  /* Arc length round the widest ring. One reference contour for the whole tower: swell is 0.16,
     so ring perimeters vary by a few per cent and a per-ring contour would buy nothing. */
  const midRow = Math.round(rows / 2);
  const cum = new Float64Array(cols);
  for (let c = 1; c < cols; c++){
    const a = midRow * cols + c - 1, b = midRow * cols + c;
    cum[c] = cum[c-1] + Math.hypot(pos.getX(b) - pos.getX(a), pos.getZ(b) - pos.getZ(a));
  }

  for (let c = 0; c < cols; c++){
    let ymin = Infinity;
    for (let r = 0; r < rows; r++) ymin = Math.min(ymin, pos.getY(r * cols + c));
    for (let r = 0; r < rows; r++){
      const idx = r * cols + c;
      if (idx >= torsoCount) continue;
      uv.setX(idx, cum[c] / TW);
      uv.setY(idx, (pos.getY(idx) - ymin) / TH);
    }
  }
  uv.needsUpdate = true;
  return g;
}

/* A rounded-corner slab. ADNOC HQ is not a box and not a cylinder — it is a broad rectangle with
   softened corners and a curved crown, and that in-between quality is what identifies it. */
function roundedSlab(w, d, h, r, seg){
  const sh = new THREE.Shape();
  const hw = w/2 - r, hd = d/2 - r;
  sh.moveTo(-hw, -d/2);
  sh.lineTo(hw, -d/2);  sh.quadraticCurveTo(w/2, -d/2, w/2, -hd);
  sh.lineTo(w/2, hd);   sh.quadraticCurveTo(w/2, d/2, hw, d/2);
  sh.lineTo(-hw, d/2);  sh.quadraticCurveTo(-w/2, d/2, -w/2, hd);
  sh.lineTo(-w/2, -hd); sh.quadraticCurveTo(-w/2, -d/2, -hw, -d/2);
  /* curveSegments applies to each of the FOUR corner quadratics, so 7 was 28 segments round the
     whole slab — an ADNOC corner radius of 1.7 units drawn with seven chords, visibly faceted at
     the place camera on the tallest object on the island. 16 costs a few hundred triangles on
     three meshes. */
  const g = new THREE.ExtrudeGeometry(sh, { depth:h, bevelEnabled:false, curveSegments: seg || 16 });
  g.rotateX(-Math.PI/2);
  g.computeVertexNormals();
  writeSlabUVs(g, sh, seg || 16, h);
  return g;
}

/* ===========================================================================
   ADNOC'S WINDOWS WERE 8 CENTIMETRES APART.

   ExtrudeGeometry's default WorldUVGenerator writes RAW SHAPE COORDINATES into the uv attribute.
   Measured on the real geometry: u runs -3.80 to 3.80 and v runs -43.00 to 2.40 — the shape's own
   half-width and the extrude depth, in world units, not a normalised 0 to 1. The repeat of (3, 2)
   at the call site was chosen as though those were normalised, so it multiplied a 45-unit v span
   by two: ninety tiles of forty-six rows each, or 4,177 window rows over a 44-unit tower.

   That is a storey height of eight centimetres. Far below one pixel per row at any camera in this
   scene, so it minifies straight to its own mean and the tower renders as a flat untextured
   column — which is exactly what the close-range Day shot shows, next to fabric buildings whose
   glazing reads perfectly. w2h-world.js has this same failure written up on the ground painter,
   in the same words: the failure is silent and total, and every pass of colour work fails to
   shift it because the colour was never the problem.

   THE FIX IS TO WRITE THE UVs IN METRES. Bay and storey are real quantities, so the tile is sized
   in world units from the texture's own cell counts and a 4 m target, and the call site's repeat
   goes to (1, 1). Verified against three 169: 86 rows over the shaft and 43 bays round the
   perimeter, which is 4.00 m and 4.00 m.

   THE SEAM NEEDS REPAIRING AND IT IS NOT OPTIONAL. The contour closes, so the last wall quad runs
   from u = perimeter back to u = 0 and draws the whole texture into one face, mirrored. The
   geometry is non-indexed, so the repair is local: any wall triangle spanning more than half the
   perimeter has its low corners pushed up by one full wrap. Two triangles on ADNOC, and without
   it there is a visible band of compressed glazing down one corner.
   =========================================================================== */
const SLAB_BAY_M = 4.0;                       // metres per window bay and per storey
const M_PER_U    = 7.8;                       // the scene's one scale constant, stated once here
function writeSlabUVs(g, sh, seg, h){
  // TEX_TOWER and DAY_TOWER are both 14 columns by 46 rows, so one tile is that many bays.
  const F = SLAB_BAY_M / M_PER_U;
  const TW = 14 * F, TH = 46 * F;

  const pts = sh.extractPoints(seg).shape;
  const cum = [0];
  let per = 0;
  for (let i = 0; i < pts.length - 1; i++){ per += pts[i].distanceTo(pts[i+1]); cum.push(per); }

  // Arc length round the contour, not angle: on a rounded rectangle the corners occupy a large
  // share of the angular sweep and almost none of the length, so angle would crush the glazing
  // into the corners and stretch it along the flats.
  const uAt = (x, z) => {
    let best = Infinity, bu = 0;
    for (let i = 0; i < pts.length - 1; i++){
      const ax = pts[i].x, ay = pts[i].y;
      const dx = pts[i+1].x - ax, dy = pts[i+1].y - ay, L2 = dx*dx + dy*dy;
      let t = L2 > 0 ? ((x - ax)*dx + (z - ay)*dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + t*dx - x, py = ay + t*dy - z, d2 = px*px + py*py;
      if (d2 < best){ best = d2; bu = cum[i] + t * Math.sqrt(L2); }
    }
    return bu;
  };

  const pos = g.attributes.position, nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  let ymin = Infinity;
  for (let i = 0; i < pos.count; i++) ymin = Math.min(ymin, pos.getY(i));
  for (let i = 0; i < pos.count; i++){
    // Caps fold to the middle of the texture. A roof is not a facade and a window grid laid
    // across it in plan is the giveaway on every top-down shot.
    if (Math.abs(nrm.getY(i)) > 0.7){ uv[i*2] = 0.5; uv[i*2+1] = 0.5; continue; }
    uv[i*2]     = uAt(pos.getX(i), pos.getZ(i)) / TW;
    uv[i*2 + 1] = (pos.getY(i) - ymin) / TH;
  }

  const wrap = per / TW, half = wrap / 2;
  for (let t = 0; t + 2 < pos.count; t += 3){
    if (Math.abs(nrm.getY(t)) > 0.7) continue;
    const a = uv[t*2], b = uv[(t+1)*2], c = uv[(t+2)*2];
    if (Math.max(a, b, c) - Math.min(a, b, c) <= half) continue;
    for (let k = 0; k < 3; k++) if (uv[(t+k)*2] < half) uv[(t+k)*2] += wrap;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/* ETIHAD TOWERS — five curved towers, unequal heights, all leaning the same way with slanted
   crowns. Real: 277, 305, 260, 234, 218 m, and those exact ratios are used below because the
   descending stagger from the second tower is the thing people actually remember.

   SPACING IS THE WHOLE PROBLEM. The previous cluster used 5.5-6.5 units between centres against
   bodies about 5.3 wide, leaving barely a unit of sky between neighbours — so at 1.5km they
   fused into a single textured mass and the count was unreadable. You cannot recognise Etihad
   Towers without counting five, which means the GAPS carry as much identity as the profiles.
   Centres now sit 7.5-8.5 apart on slimmer bodies, giving roughly 4 units of visible sky
   between each pair. Also flattened the depth scatter: the real towers stand on a gentle arc,
   and randomised z was making near ones eclipse far ones from half the orbit. */
function etihadTowers(x0, z0){
  const g = new THREE.Group();
  /* REPLACED A GUESSED LINE-UP WITH THE FIVE TOWERS' OWN VERIFIED POSITIONS.
     The old spec spread five towers evenly along a straight line, 32.5 units end to end, heights
     stepping down monotonically from one end to the other. Neither part was measured: this
     cluster's real footprints were already found and matched individually earlier — five untagged
     bake records whose heights (218, 234, 260, 305, 277 m) land within a metre or two of the five
     real tower heights (217.5, 234.0, 260.3, 305.3, 277.6 m), each near the tower's own real GPS
     position, not one shared guess. Using their actual relative positions instead of the eyeballed
     line: the real spread is 11-18 units, not 32, and it is genuinely two-dimensional — a loose
     arc, not a row — with T2 (the real tallest, 305 m) the one that reads as set apart in a
     photograph, which turns out to be perspective more than an actual gap this size.

     THE OLD HEIGHTS WERE ALSO WRONG, ON TOP OF THE ARRANGEMENT. The tallest tower topped out at
     30.5 units (238 m); the real tallest is 305 m, 39.1 units — under-scaled by a third at the
     top of the range, which is the number that sets how this cluster reads against everything
     else on the skyline. Both the position and the height data came from the same verified match,
     so fixing one without the other would have left a real tower's identity attached to a made-up
     number.

     Radii from each tower's own real width (w/7.8/2), not a shared guess either. Lean and shear
     keep the ORIGINAL relationship — taller gets more of both — just remapped onto the real
     height order (T2 tallest through T1 shortest) instead of the old position-based order, since
     that pattern read as a genuine artistic choice about the skyline's silhouette, not survey
     data, and is worth keeping on its own terms. */
  /* T1 AND T5 WERE BUILT AT EACH OTHER'S SIZE, AND THE FILE SAID SO ALL ALONG. Every row carries
     the real height in its own comment, and two of them disagreed with the number beside them:
     T1 was labelled 277.6 m and built at 27.95 u = 218 m; T5 was labelled 217.5 m and built at
     35.51 u = 277 m. The other three land within half a metre. Two rows, crossed.

     THE RADII WERE CROSSED WITH THEM, which is what identifies this as one transcription fault
     rather than two. Checked independently against published floor areas — divide gross area by
     floor count and you get each tower's real plate:

         T1  1028 m2   T2 1047   T3 1237   T4 755   T5 739

     Against the lens footprint each radius implies (pi.r^2.ell at 7.8 m/u), T4 came out 2 m2 off
     its real plate — so the radius data is sound — while T1 sat 356 m2 under and T5 94 m2 over,
     in opposite directions. T1's real plate is LARGER than T5's and the model had it smaller.
     Height and radius sit on the same row, so both moved together and both move back together.

     STILL OPEN, DELIBERATELY NOT TOUCHED: T2 and T3 are crossed by the same test, though far
     less severely — T3 has the largest real plate of the five (it is the office tower, 60 floors
     and 74,198 m2) and the model gives the biggest radius to T2. Swapping them improves the fit.
     It is not being done here, because the test assumes a lens with ell exactly 0.62 and a
     uniform core, and a 113 m2 residual is well inside what that assumption can invent. A number
     changed on a hunch is exactly what produced the fault above. Resolve it against the bake
     records, not against this arithmetic.

     dx AND dz COME FROM THE SAME ROWS AND ARE THEREFORE ALSO SUSPECT. They are left alone because
     nothing here can check them — that needs the pick tool against real GPS. Worth doing.

     SHEAR IS SCALED 1.85x FROM THE OLD LADDER. See the crown note in curvedTower: the ratio
     between towers was a deliberate silhouette choice and is preserved exactly; only the overall
     magnitude has changed, because the old one produced no visible slant at all. */
  const GLASS = 0x111C22;
  /* SOURCED FROM THE EXPORTED TABLE, so the mass proxy in w2h-world.js and the geometry here
     cannot disagree again. colour and floors are joined on here because they are this layer's
     business and the proxy has no use for either. */
  const FLOORS = [69, 66, 60, 80, 61];
  const spec = ETIHAD_LAYOUT.map((t, i) =>
    ({ dx:t.dx, dz:t.dz, h:t.h, r:t.r, lean:[0.9,0.7,0.8,1.0,0.6][i],
       shear:[2.04,1.67,1.85,2.41,1.48][i], colour:GLASS, floors:FLOORS[i] }));
  const _retired = [
    { dx: -5.83, dz: -7.87, h: 35.59, r: 2.65, lean: 0.9, shear: 2.04, floors: 69, colour: GLASS },   // T1, 277.6 m real -- the hotel tower
    { dx:  1.82, dz: -9.22, h: 30.00, r: 2.52, lean: 0.7, shear: 1.67, floors: 66, colour: GLASS },   // T4, 234.0 m real
    { dx:  0.58, dz:  0.75, h: 33.37, r: 2.92, lean: 0.8, shear: 1.85, floors: 60, colour: GLASS },   // T3, 260.3 m real
    { dx: -2.02, dz:  8.86, h: 39.14, r: 3.08, lean: 1.0, shear: 2.41, floors: 80, colour: GLASS },   // T2, 305.3 m real -- the actual tallest
    { dx:  5.45, dz:  7.48, h: 27.88, r: 2.38, lean: 0.6, shear: 1.48, floors: 61, colour: GLASS },   // T5, 217.5 m real
  ];
  spec.forEach((s, i) => {
    // rTop at 0.42 of the base turned these into obelisks. The real towers barely narrow —
    // they are broad curved slabs, and the width is as much of the signature as the lean.
    /* 26 RADIAL SEGMENTS ON THE SIGNATURE SILHOUETTE OF THE CITY. Etihad's towers are lens-shaped
       in plan and the ellipse factor is 0.62, so the tight ends of that lens get the same angular
       spacing as the broad flanks and are where the faceting shows — and the tight ends are
       exactly the edges that read against the sky. 44 segments and 24 height rings; these are
       five meshes in the whole scene, and they are the five the eye goes to first. */
    /* h IS THE ARCHITECTURAL HEIGHT, AND THE SHAFT IS BUILT SHORTER BY THE SHEAR TO REACH IT.

       The shear raises one side of the crown and lowers the other, so a cylinder of height h
       ends up with a TIP at h + shear. The table has always been read as real heights — every
       row carries the metre figure in its comment — and every row has quietly built that much
       too tall. It was 11 m on the old constants and went to 20 m the moment the crown was made
       visible, which is what surfaced it.

       Subtracting here rather than pre-subtracting in the table keeps the rows readable as the
       real published heights, so the next person to check a row against Wikipedia gets the
       answer they expect instead of a number that needs a correction applied in their head.
       That readability is precisely what caught the T1/T5 swap. */
    const shaft = s.h - s.shear;
    /* Storey from the tower's own published floor count, so the glazing rhythm differs between
       these five the way it really does. */
    const geo = curvedTower(shaft, s.r, s.r * 0.74, 0.16, s.lean, s.shear, 0.62, 44,
                            (s.h * M_PER_U) / s.floors);
    /* THERE IS NO BRONZE TOWER, AND T1 WAS GIVEN ONE. The retired note claimed every reference
       shot of this cluster shows a warm bronze tower standing apart from four cooler ones, and
       that observation was real — but the bronze building in those shots is a NEIGHBOUR, not one
       of the five. It is rounder, differently massed, and stands clear of the group in every
       frame. Published description of the complex is a grey-blue coated curtain wall on each
       tower, specified for uniformity across all five. So s.colour is one constant now. The
       field is kept rather than removed: a per-tower hook is the right shape for this table, it
       was simply filled with a wrong value.

       The lesson is the one the ADNOC bronze taught in the same session — an observation about
       a photograph was written down as a fact about a building, and everything downstream was
       then tuned to be consistent with it. */
    // Emissive stepped 0.90 -> 0.78 so the warm palace holds the eye FIRST and the cluster
    // second. Light hierarchy is about relative order, not absolute brightness.
    /* REPEAT (1, 1). The tiling is baked into the geometry's UVs in metres now, exactly as on
       ADNOC — a repeat here would multiply a scale that is already correct. */
    const m = new THREE.Mesh(geo, cityMaterial(TEX_TOWER, 1, 1, 0.78, s.colour));
    m.position.set(x0 + s.dx, shaft/2, z0 + s.dz);
    m.rotation.y = 0.10 + i * 0.06;
    m.userData.hero = true;
    g.add(m);
  });
  return g;
}

/* THE REAL FOOTPRINT, 67 POINTS, TAKEN FROM data/isle-corniche.json.

   THE OLD PALACE WAS A STRAIGHT BAR AND THE REAL BUILDING IS A ROTATED CHEVRON. Every other
   fault in this builder was downstream of that. Measured against the bake's own record — the
   Overture/OSM polygon sitting 3.2 m from LM.palace, area 104,825 m2 oriented box:

       across    model 384 m      real 502 m
       depth     model  87 m      real 384 m        4.4x too shallow
       rotation  model   0 deg    real  30 deg
       plan      rectangle        67-point chevron

   The ring fills 56 per cent of its own bounding box. A bar fills 100. That number alone says
   the plan is splayed around courtyards, and it is why the west third of the old model stood
   OUTSIDE the real building while the entire southern range was missing.

   THE RING WAS ALREADY IN THE REPO. 126 of Corniche's 20,262 building records carry a `p`
   polygon; this is one of them. Nothing needed surveying, drawing or estimating — the previous
   version was hand-authored beside real data that was never read.

   SIMPLIFIED AT 0.4 UNITS, 77 points to 67, which loses 5 m2 of 58,846. Transcribed as a
   constant in local units relative to the anchor, the same way grandMosque carries SITE_POLY
   and HARDSCAPE_POLY. One landmark, one table.

   ROTATION IS NOT APPLIED AS A TRANSFORM. The ring is already in scene coordinates, so the
   30 degrees is baked into the points. Only the central block and the dome line need the angle,
   because those are the two things placed along the building's own axis rather than traced. */
const PALACE_ROT = 0.524;              // 30.0 deg, from the record's own rot field
const PALACE_RING = [
    [-25.85,  7.99], [-27.17,  5.86], [-28.51,  6.68], [-28.23,  7.14],
    [-32.15,  8.83], [-30.77, 10.97], [-30.13, 10.60], [-29.24, 12.04],
    [-28.54, 11.65], [-24.83, 18.32], [-23.71, 17.68], [-22.19, 20.38],
    [-15.49, 16.65], [-13.31, 20.50], [-12.15, 19.83], [ -9.32, 24.63],
    [  1.04, 18.51], [  2.63, 18.45], [ 17.19,  9.81], [ 17.68,  8.19],
    [ 29.05,  1.19], [ 24.24, -6.68], [ 32.15,-11.53], [ 30.41,-14.38],
    [ 31.08,-14.79], [ 27.38,-20.83], [ 26.90,-20.54], [ 26.18,-21.72],
    [ 26.64,-22.91], [ 25.62,-24.63], [ 20.47,-21.51], [ 21.44,-19.92],
    [ 22.68,-19.64], [ 23.55,-18.17], [ 22.83,-17.74], [ 25.72,-12.90],
    [ 19.88, -9.59], [ 19.96, -9.01], [ 15.50, -6.00], [ 14.35, -7.90],
    [ 12.95, -7.04], [ 14.18, -5.04], [ 10.53, -2.81], [  7.13, -8.33],
    [  8.82, -9.38], [  7.53,-11.45], [  5.73,-10.32], [  6.14, -9.65],
    [  1.64, -6.83], [  3.42, -4.00], [  2.86, -3.64], [ -2.85, -0.22],
    [ -4.54, -3.03], [ -9.00, -0.33], [ -9.49, -1.13], [-11.40,  0.01],
    [ -6.04,  6.92], [ -8.73,  8.49], [ -9.90,  6.47], [-11.59,  7.45],
    [-10.46,  9.42], [-13.83, 11.36], [-14.81,  9.67], [-22.10, 14.54],
    [-25.15,  9.58], [-25.74,  9.94], [-26.62,  8.45],
];

/* THE ESTATE ROUTES, TRACED BY HAND IN geojson.io AND CONVERTED HERE.

   THEY ARE NOT IN ANY DATA SET AND THAT IS THE POINT. The bake carries the palace's footprint and
   the greenspace around it, but the estate's own drives and axes are absent from the road records
   entirely — which is why w2h-props plants ZERO palms here. Palms are placed by walking
   plan.ring and plan.arterials; with no road inside the estate the placer never walks it, and the
   aerial's most recognisable landscape feature — formal allees, hundreds of trees in strict rows
   — could not appear at any setting. These lines are what the placer was missing.

   PROJECTED WITH THE BAKE'S OWN PROJECTOR so they land in the same frame as everything else:
   equirectangular about 24.49 N / 54.42 E scaled by cos(lat0), minus the Corniche centre, over
   7.8, z = -y. Checked by plotting against the traced building ring before use.

   ELEVEN FEATURES CAME IN AND EIGHT SURVIVED. Two were duplicate two-point lines, one was a
   single point, and the two features exported as Polygons carry only two distinct vertices each,
   so they are lines wearing a polygon's type. Nothing here is a closed area — there is still no
   forecourt fill, and the paving below is therefore ribbons along routes rather than a plaza.

   SIMPLIFIED AT 0.30 UNITS. 528 units of route, 4.1 km at true scale. */
const PALACE_PATHS = [
  [[  1.55, 18.86], [ -5.66, 49.51],],
  [[ 15.89,  8.78], [ 48.62, 17.71],],
  [[ 50.53,-11.60], [ 36.98, -0.96], [ 34.91,  6.62], [ 32.62, 18.79], [ 27.14, 27.46], [ 19.90, 33.06], [ 11.66, 37.34], [  3.00, 36.70], [ -7.11, 36.70], [-11.70, 32.57], [-19.50, 32.57], [-26.39, 35.78], [-34.27, 41.06], [-42.01, 39.00], [-46.14, 30.27],],
  [[ 28.61,  2.85], [ 29.97,  9.87], [ 28.06, 17.79], [ 23.94, 24.81], [ 18.79, 29.38], [ 12.80, 31.67], [ -0.33, 33.06], [ -5.52, 30.40], [ -7.79, 24.30],],
  [[ 28.46, 16.89], [ 20.91, 16.49], [ 13.33, 19.02], [  7.82, 24.53], [  3.46, 31.42],],
  [[ 36.19,  5.83], [ 48.98, 14.69], [ 47.77, 20.63], [ 51.90, 22.69], [ 53.25, 25.67], [ 25.73, 50.48],],
  [[ 16.88, 28.32], [ 21.14, 29.12], [ 22.28, 33.03], [ 25.04, 37.85], [ 24.42, 42.89], [ 22.73, 48.08], [ 24.38, 53.10], [ 20.89, 56.61], [ 19.05, 52.69], [ 18.61, 47.72], [ 20.30, 44.00], [ 21.00, 38.81], [ 16.31, 28.66],],
  [[-10.92, 34.81], [ -8.48, 49.10], [-11.93, 56.91], [ -8.48, 59.21], [ -5.04, 48.18],],
];

function emiratesPalace(x0, z0){
  const g = new THREE.Group();

  /* THE PALACE WAS ORANGE AND THE BUILDING IS BLUSH BEIGE. The palette this replaces was chasing
     a real problem — the palace had drifted to the same value as the fabric's white render and
     lost the separation that identified it — and reached for the wrong lever, pulling warm AND
     red until the stone was terracotta.

     MEASURED OFF AN AERIAL, white-balanced first: 3,069 near-neutral bright pixels in the same
     frame have a median of #EDEAE5, giving gains of 0.99 / 1.00 / 1.02. The photograph was
     already neutral, so the samples stand as read.

         facade, lit        #D6B9AB    R-B  +43   R-G  +29
         facade, shaded     #C6AA9F    R-B  +39   R-G  +28
         upper terrace      #E6D2C9    R-B  +29   R-G  +20
         grand dome         #D5D3D2    R-B   +3   R-G   +2
         small dome         #E7DDD8    R-B  +15   R-G  +10

         was: stone         #C98055    R-B +116   R-G  +73
         was: domes         #F2E6C6    R-B  +44   R-G  +12

     The stone was two and a half times too saturated.

     SEPARATION COMES FROM HUE, NOT SATURATION, and that is the lesson worth keeping. The fabric's
     warmest day tone is limestone render at 0xE2D6BB, R-G +12 — a YELLOW beige. The palace at
     R-G +29 is a PINK beige. Those two are easy to tell apart at any distance and neither has to
     be lurid to do it. Forcing the gap with chroma was solving a hue problem with the wrong lever,
     and it is why one correction produced the next.

     AND THE DOMES ARE NEUTRAL, R-B +3 on the grand one. They were a cream as warm as the real
     WALLS are. The gold everyone remembers is the night floodlighting and it already lives in the
     emissive; the daytime shells are pale stone and lead, cooler than what they stand on. */
  const stone = new THREE.MeshStandardMaterial({
    color:0x191009, roughness:0.92, metalness:0.03, emissive:0xE8B547, emissiveIntensity:0.025 });
  stone.userData.duskColor = 0xD3B4A4;
  stone.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xD6B9AB, roughness:0.92, metalness:0.03 });
  const arch = new THREE.MeshStandardMaterial({
    color:0x1A150E, roughness:0.9, emissive:0xE8B547, emissiveIntensity:0.10 });
  arch.userData.duskColor = 0xE3CEC4;
  arch.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE6D2C9, roughness:0.9 });
  const glow = new THREE.MeshStandardMaterial({
    color:0x2A2216, roughness:0.7, emissive:0xE8B547, emissiveIntensity:0.34 });
  glow.userData.duskColor = 0xE0D6CC;
  glow.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xDCD8D6, roughness:0.7 });

  /* H_WING IS THE RECORD'S OWN HEIGHT. The bake gives this footprint h 25.6 m, which is 3.28
     units — so the old hand-set 3.4 was very nearly right and is simply replaced by the
     surveyed figure. The centre steps above it; nothing else does. */
  const H_WING = 3.28, H_MAIN = 4.60;
  const CX = 4.44, CZ = 4.57;          // area centroid of the ring
  const AX = Math.cos(PALACE_ROT), AZ = -Math.sin(PALACE_ROT);   // along the long axis

  /* THE WALL WAS A SINGLE FLAT EXTRUSION AND READ AS A BLOCK. Correct silhouette, no
     architecture — the traced ring gave the right SHAPE, and shape was never what made this
     look unfinished. A base course, a window rhythm and a cornice are what separate a footprint
     from a facade, and none of the three were here.

     PLINTH — BODY — CORNICE, the same three-part composition the arcade and the domes already
     use in miniature. All three share the traced ring exactly, so nothing can drift out of
     alignment with the wall it dresses; only the extrude depth and the y offset differ. */
  const PLINTH_H = 0.42, CORNICE_H = 0.20;
  const plinthMat = new THREE.MeshStandardMaterial({ color:0x100D09, roughness:0.94, metalness:0 });
  plinthMat.userData.glassOverride = false;
  plinthMat.userData.duskColor = 0xB39C88;
  plinthMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xBFA890, roughness:0.94 });
  const corniceMat = new THREE.MeshStandardMaterial({
    color:0x1C1812, roughness:0.7, emissive:0xE8D9A8, emissiveIntensity:0.05 });
  corniceMat.userData.glassOverride = false;
  corniceMat.userData.duskColor = 0xE9E2D6;
  corniceMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xEDE7DC, roughness:0.7 });
  const facadeMat = palaceFacadeMat(0xD6B9AB, 0xD3B4A4, 0.30);

  /* Shape y maps to world -z on extrude, the same convention roundedSlab uses, so the ring's z
     is negated going in and comes back out correct. Built once and reused for all three bands —
     writeSlabUVs needs the exact Shape a geometry was extruded from, not a copy of its points. */
  const sh = new THREE.Shape();
  PALACE_RING.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));

  function tracedBand(h, mat, yOff, withUV){
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI/2); geo.computeVertexNormals();
    if (withUV) writeSlabUVs(geo, sh, 12, h);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x0, yOff, z0); g.add(m);
    return m;
  }
  tracedBand(PLINTH_H, plinthMat, 0);
  const body = tracedBand(H_WING - PLINTH_H - CORNICE_H, facadeMat, PLINTH_H, true);
  body.userData.hero = true;
  tracedBand(CORNICE_H, corniceMat, H_WING - CORNICE_H);

  /* The domed centre, and the ONE piece that carries the rotation explicitly. Sized to sit
     clear inside the ring — checked, all four corners land at least 1.5 units in. */
  const MW = 17.0, MD = 9.5;
  const main = new THREE.Mesh(new THREE.BoxGeometry(MW, H_MAIN, MD), stone);
  main.position.set(x0 + CX, H_MAIN/2, z0 + CZ);
  main.rotation.y = PALACE_ROT; g.add(main);

  /* roofAt REBUILT FOR A SHAPE THAT IS NOT A ROW OF BOXES. The x-range scan that replaced the
     hy table cannot survive a rotated plan, so the probe is now a real containment test: inside
     the centre block's own rotated frame it returns the centre's height, inside the traced ring
     the wing's, and outside neither, zero. Same contract as before — a dome asks the building
     how high it is rather than being told — and it now holds for any plan shape. */
  function inRing(px, pz){
    let c = false;
    for (let i = 0, j = PALACE_RING.length - 1; i < PALACE_RING.length; j = i++){
      const [xi, zi] = PALACE_RING[i], [xj, zj] = PALACE_RING[j];
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  function roofAt(px, pz){
    const dx = px - CX, dz = pz - CZ;
    const u = dx * AX + dz * AZ, v = -dx * AZ + dz * AX;
    if (Math.abs(u) <= MW/2 && Math.abs(v) <= MD/2) return H_MAIN;
    return inRing(px, pz) ? H_WING : 0;
  }

  /* DOME SEATS ARE SOLVED AGAINST THE POLYGON, NOT SPACED ALONG A LINE.

     The offsets-along-the-axis scheme died with the straight bar and it took two attempts to
     notice. Scaling the old 0 / 9 / 17 / 22.5 rhythm onto the longer building put the outer pair
     0.09 units inside the boundary — technically contained, so a point-in-polygon test passed —
     and then most of a 1.5-unit dome hung out over the edge in mid air. Containment of the
     CENTRE is not containment of the dome.

     Past u = 21 the axis leaves the building altogether: clearance along the centre line falls
     to 0.8 at u = 22 and 0.03 at u = 28, because the real wings splay away from the axis and the
     line runs down a narrow arm between two courtyards. No offset on that line can carry a dome.

     So each seat is the point of MAXIMUM CLEARANCE within its own bay — the plan swept in 26
     bands along the building's axis, the best point taken from each, then thinned to a minimum
     7-unit separation. Nine seats, and every radius is set from its own seat's clearance, so a
     dome cannot be wider than the mass it stands on. The grand dome is simply the seat with the
     most room, which lands at 8.79 units of clearance near the centroid — where the real one is,
     arrived at without being told. */
  const PALACE_DOMES = [
    [-28.20,  9.70, 1.10],
    [-21.30, 16.90, 1.37],
    [-13.50, 14.50, 1.61],
    [ -4.50, 13.90, 1.90],
    [  2.70,  7.90, 3.40],
    [  9.90,  4.90, 1.90],
    [ 18.30,  0.10, 1.90],
    [ 22.50, -8.30, 1.31],
    [ 28.50,-12.50, 1.44],
  ];

  function dome(px, pz, r){
    const roof = roofAt(px, pz), drumH = Math.max(0.35, r * 0.22), base = roof + drumH;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r*0.88, r*0.88, drumH, 20), stone);
    drum.position.set(x0 + px, roof + drumH/2, z0 + pz); g.add(drum);
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 13, 0, Math.PI*2, 0, Math.PI/2), glow);
    d.position.set(x0 + px, base, z0 + pz); d.userData.hero = true; g.add(d);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), glow);
    fin.position.set(x0 + px, base + r + 0.35, z0 + pz); g.add(fin);
  }
  PALACE_DOMES.forEach(([px, pz, r]) => dome(px, pz, r));

  /* PAVING AND PALMS ALONG THE TRACED ROUTES.

     ONE MESH FOR ALL THE PAVING and TWO INSTANCED MESHES FOR ALL THE PLANTING, which is the only
     reason this is affordable. 528 units of route at 2.4-unit spacing on both sides comes to
     roughly 440 trees; as individual meshes that is 880 draw calls on one landmark, against a
     scene that runs about 1,300 in total. Instanced, it is two.

     THE PALM IS DUPLICATED FROM w2h-props AND THAT IS A KNOWN COST. The props kit owns the real
     one, but it places trees by walking roads and has no hook for "plant along this polyline", so
     either this file grows a palm or the props kit grows an API. This is the smaller change and
     the note is here so the drift is visible when the registry lands. */
  const paveMat = new THREE.MeshStandardMaterial({ color:0x141210, roughness:0.94, metalness:0 });
  paveMat.userData.glassOverride = false;
  paveMat.userData.duskColor = 0xCBBDB2;
  paveMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xD3C6BC, roughness:0.94 });

  const HALF = 0.8;                       // 6.2 m each side of the centreline
  const pv = [], pi = [];
  PALACE_PATHS.forEach(path => {
    for (let i = 0; i + 1 < path.length; i++){
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 1e-4) continue;
      const nx = -dz / L * HALF, nz = dx / L * HALF, b = pv.length / 3;
      pv.push(x0 + ax + nx, 0.03, z0 + az + nz,  x0 + ax - nx, 0.03, z0 + az - nz,
              x0 + bx + nx, 0.03, z0 + bz + nz,  x0 + bx - nx, 0.03, z0 + bz - nz);
      pi.push(b, b+1, b+2, b+1, b+3, b+2);
    }
  });
  if (pv.length){
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pv, 3));
    pg.setIndex(pi); pg.computeVertexNormals();
    const pave = new THREE.Mesh(pg, paveMat);
    /* The ribbons are coplanar with the island's top face and 3 cm will not separate them at this
       frustum — the same depth-precision trap w2h-world's flatSet documents. Bias the test. */
    paveMat.polygonOffset = true; paveMat.polygonOffsetFactor = -2; paveMat.polygonOffsetUnits = -2;
    g.add(pave);
  }

  /* Seats walked at a fixed spacing on both verges, skipped where they would fall inside the
     building — a palm through a wall is worse than a gap in an avenue. */
  const seats = [];
  PALACE_PATHS.forEach(path => {
    let carry = 0;
    for (let i = 0; i + 1 < path.length; i++){
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 1e-4) continue;
      const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
      for (let t = carry; t < L; t += 2.4){
        const cxp = ax + ux * t, czp = az + uz * t;
        [1, -1].forEach(sg => {
          const px = cxp + nx * 1.45 * sg, pz = czp + nz * 1.45 * sg;
          if (inRing(px, pz)) return;
          seats.push([px, pz]);
        });
      }
      carry = (carry - L) % 2.4; if (carry < 0) carry += 2.4;
    }
  });

  if (seats.length){
    const trunkMat = new THREE.MeshStandardMaterial({ color:0x14110C, roughness:0.95 });
    trunkMat.userData.glassOverride = false;
    trunkMat.userData.duskColor = 0x9C8A70;
    trunkMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xA89478, roughness:0.95 });
    const crownMat = new THREE.MeshStandardMaterial({ color:0x0E1408, roughness:0.9 });
    crownMat.userData.glassOverride = false;
    crownMat.userData.duskColor = 0x5F6A36;
    crownMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x6E7A3E, roughness:0.9 });

    const trunkG = new THREE.CylinderGeometry(0.055, 0.085, 1.15, 5);
    trunkG.translate(0, 0.575, 0);
    const crownG = new THREE.IcosahedronGeometry(0.42, 0);
    crownG.scale(1, 0.55, 1); crownG.translate(0, 1.28, 0);
    const trunks = new THREE.InstancedMesh(trunkG, trunkMat, seats.length);
    const crowns = new THREE.InstancedMesh(crownG, crownMat, seats.length);
    const m4 = new THREE.Matrix4();
    seats.forEach(([px, pz], i) => {
      /* Deterministic jitter. A perfectly periodic row of identical trees is the comb the props
         kit already warns about; hashing the seat keeps two screenshots comparable. */
      const h = Math.sin(px * 12.9898 + pz * 78.233) * 43758.5453;
      const j = h - Math.floor(h), sc = 0.86 + j * 0.32;
      m4.makeRotationY(j * Math.PI * 2);
      m4.scale(new THREE.Vector3(sc, sc, sc));
      m4.setPosition(x0 + px, 0, z0 + pz);
      trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    });
    trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
    g.add(trunks); g.add(crowns);
  }

  /* THE ARCADE FOLLOWS THE RING NOW. It used to be a straight row of 26 posts on a straight
     building; there is no straight face left to put them on. Walked along the ring's own
     boundary and dropped only on the garden side — the half of the perimeter facing away from
     the sea — which is where the real colonnade is. */
  let acc = 0;
  for (let i = 0; i < PALACE_RING.length; i++){
    const a = PALACE_RING[i], b = PALACE_RING[(i + 1) % PALACE_RING.length];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = acc; t < seg; t += 2.2){
      const f = t / seg, px = a[0] + (b[0] - a[0]) * f, pz = a[1] + (b[1] - a[1]) * f;
      const dx = px - CX, dz = pz - CZ;
      if (-dx * AZ + dz * AX < 2.0) continue;          // sea side, skip
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, 0.55), arch);
      c.position.set(x0 + px, 1.3, z0 + pz); c.rotation.y = PALACE_ROT; g.add(c);
    }
    acc = (acc - seg) % 2.2; if (acc < 0) acc += 2.2;
  }
  return g;
}

/* ADNOC HQ — real: 342 m, and the tallest thing in the frame by a clear margin.
   The old version was 9.5 wide and 42 tall — a 4.4:1 slab, which is the proportion of an
   ordinary office block and reads as anonymous however well it is lit. The real building is
   markedly slimmer than that and its identity is the CROWN: the shaft runs clean and then stops
   in a stepped, lit cap that overhangs slightly. That silhouette notch is the recognition cue,
   so it is exaggerated here — two steps rather than one, and the upper step wider than the
   shaft so it throws a distinct shoulder against the sky. Nobody complains that a landmark is
   too recognisable. */
/* FERRARI WORLD AND YAS MALL — built as a pair, because they are one complex.

   THEY TOUCH. The mall's eastern edge runs into the roof's western points; the two are joined by
   a bridge and read as a single mass from every angle. Building one and leaving the other a flat
   OSM extrusion would look worse than leaving both flat, because a modelled roof beside a grey
   slab draws attention to the slab.

   SIZED TO THE ANCHOR GAP, NOT TO TRUE METRES, and this is the compromise worth naming. The two
   anchors sit 20.9 units — 163 m — apart, while the real buildings are about 550 m centre to
   centre. The anchors were placed for label legibility and checked against the coastline, so
   moving them risks putting something in the water for a cosmetic gain. A true-scale roof at
   R_OUT 45 would reach 24 units PAST the mall's centre and swallow it whole.

   So the pair is built to abut at the gap it actually has: R_OUT 13 and a mall half-length of 8
   come to 21 against 20.9. The complex reads correctly relative to itself, which is what the eye
   checks, and is small relative to the island, which almost nothing checks. The diorama already
   compresses buildings about 2.6x against the ground — Emirates Palace is 384 m for a real 1,000
   — so this is the established direction, just further along it.

   IF THE ANCHORS EVER MOVE APART, both sizes can grow together. They are two constants. */

/* The roof profile: asymmetric, flat, three-toned at the edge.

   NOT A REGULAR STAR. Five equal points is the tell of a generated shape, and the real roof has
   one long western point with the other four noticeably shorter and unequal. The amplitude table
   is what stops this reading as a logo.

   FLAT. 8.7:1 span to height. Every instinct says lift it and every photograph says do not — it
   is a shallow shell lying on the desert, and a taller version reads as a circus tent.

   THREE TONES AT THE EDGE. Red top, a thin pale stripe, black underside. The dark edge is what
   gives the star an outline at distance; the pale stripe between is what stops the dark reading
   as shadow. Two material groups plus the rim ring, all on one geometry so they cannot drift. */
function ferrariWorld(x0, z0, facing){
  /* FERRARI WORLD ABU DHABI — Benoy, 2010. Rebuilt from published dimensions after the previous
     model passed every numeric check written for it and came out a starfish.

     IT HAS THREE POINTS, NOT FIVE. data/city-reference.js said five and that is simply wrong.
     Benoy's own description is a three-pointed star: an enclosed core with three "tri-form" arms
     at 120 degrees. Five points is not a stylisation of three, it is a different building. The
     reference has been corrected; this is the note that says why, because the wrong number was
     believed for a whole session on the strength of being written down.

     PUBLISHED, ALL OF IT:
       ~700 m across / 665 m tip to tip     2,200 m roof edge perimeter
       45 m building height, 48 m at peak   200,000 m2 roof surface
       funnel 100 m dia top, 17 m at base   logo 65 x 48.5 m

     THAT IS 13.4:1. The old model was 26 u across and 4.1 u tall — 5.6:1, three and a half times
     too small and two and a half times too tall for its own span, which is why it read as a
     circus tent. Benoy describe it as "ground hugging, peeling up from the landscape in flowing
     lines like a red sand dune"; at 5.6:1 nothing hugs anything.

     R_IN AND LOBE_P ARE THE ONLY TWO CONSTANTS NOT ON A FACTSHEET, and they are the two that
     decide broad arms versus spikes — the exact thing that went wrong. They were fitted by sweep
     against the published perimeter and roof area rather than chosen: the solution lands at
     681 m across, 2,193 m perimeter, 189,700 m2 plan area, against 700 / 2,200 / ~190,000. */
  const g = new THREE.Group();

  const M = 7.8;                    // must agree with M_PER_UNIT in w2h-world.js

  /* THE OUTLINE IS MEASURED, NOT PARAMETERISED, AND IT IS A TRI-FORM WHOSE ARM TIPS FORK.

     That last clause is the whole story. Benoy publish "three tri-form arms at 120 degrees".
     Overhead captures plainly show five or six sharp points. Both are true: there are THREE arms
     at 120 degrees, and each arm tip splits into two thin horns. Every previous attempt here
     picked one half of that and built it - five equal lobes, then three fat blobs, then five
     swept spikes - and all three were starfish, because all three were symmetrical and this
     building is not.

     SOURCE. Segmented off the yasisland.com island plan, where the building is drawn in a flat
     highlight over itself alone. An earlier table came from a Google Maps capture and was
     quietly corrupted: the label text sat on the west arm and the closing needed to bridge it
     also swallowed nearby red rollercoaster track, inventing arms.

     CROSS-VALIDATED, which is why this one can be trusted. Circular cross-correlation against
     the independent Google Maps profile peaks at 0.922, and the two agree to a mean of 17 m once
     the map's 265-degree rotation is removed. The correlation also has secondary peaks at
     exactly 120-degree intervals - a shape only correlates with itself like that if it really is
     three-fold. Arms land at compass 70, 190 and 310 with radii 341, 369 and 347 m.

     Sampled every 5 degrees FROM THE FUNNEL, which is not the centroid. Measuring from the
     funnel carries that offset into the model for free, and the funnel is the group's origin, so
     no caller has to know. Funnel measures 96 m across here against a published 100.

     ORIENTATION IS FIXED TO TRUE BEARINGS; the third argument is IGNORED, kept only so the
     existing call site stays valid. Yas Mall does not need it - a valley faces the mall in
     reality, and w2h-world.js finds it by probing this roof rather than by being told. */
  /* ORIENTATION IS REGISTERED ON THE COASTLINE, NOT ON CORRELATION.

     An earlier version of this table was rotated by a figure taken from cross-correlating two
     capture sources, reported at 0.922 and treated as proof. It was not proof. A three-fold
     shape self-correlates almost equally at 0, 120 and 240 degrees - the three candidate shifts
     scored 0.895, 0.868 and 0.922, which is noise. Correlation can establish that the arm count
     is three. It can never establish which way round the building sits.

     The rotation is fixed instead from the island's northern BAY, a deep asymmetric notch with
     no rotational symmetry to hide in, by a two-point similarity fit against the bake's own
     coordinates. That gives 287 degrees where 265 was shipped, and agrees independently on
     scale to within 4 per cent. Arms land near compass 95, 210 and 355.

     GENERAL RULE: never accept a symmetry-blind statistic as evidence about the orientation of
     a symmetric object. Register on something asymmetric. */
  const PLAN = [
      281,   405,   251,   233,   264,   388,
      262,   217,   186,   171,   161,   155,
      149,   147,   144,   145,   144,   148,
      153,   156,   168,   185,   204,   239,
      356,   274,   227,   234,   289,   339,
      225,   196,   176,   160,   153,   149,
      144,   143,   141,   142,   142,   145,
      147,   153,   159,   173,   193,   221,
      312,   318,   236,   225,   262,   373,
      250,   210,   186,   167,   159,   151,
      147,   145,   143,   142,   144,   146,
      151,   156,   163,   174,   194,   220,
  ];
  const PEAK = 48 / M;
  const EDGE_V = 14 / M, EDGE_T = 3 / M;
  const FUN_T = 53 / M, FUN_B = 8.5 / M;      // 106 m across, as measured
  const LOGO_L = 65 / M, LOGO_W = 48.5 / M;
  const segA = 288, segR = 28, RIM = 2, STRIPE = 1;

  /* The descent from crown to edge. A double curve, because that is literally the design brief -
     the section is the Ferrari GT side profile. smootherstep is convex then concave and flattens
     at both ends, giving the plateau around the funnel and the long ground-hugging run to the
     tips. A power curve could do neither. */
  const dune = u => { const v = Math.min(1, Math.max(0, Math.pow(u, 0.82)));
                      return 1 - (v * v * v * (v * (v * 6 - 15) + 10)); };

  /* Catmull-Rom through the samples, wrapped. Linear interpolation leaves visible facets on the
     long flanks, where consecutive samples differ by forty metres. */
  const extent = th => {
    const n = PLAN.length, f = (th / (Math.PI * 2)) * n;
    const i1 = ((Math.floor(f) % n) + n) % n, t = f - Math.floor(f);
    const p0 = PLAN[(i1 - 1 + n) % n], p1 = PLAN[i1], p2 = PLAN[(i1 + 1) % n], p3 = PLAN[(i1 + 2) % n];
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t) / M;
  };
  const R_MIN = Math.min.apply(null, PLAN) / M, R_MAX = Math.max.apply(null, PLAN) / M;
  const edgeAt = E => { const reach = Math.min(1, Math.max(0, (E - R_MIN) / (R_MAX - R_MIN)));
                        return EDGE_V + (EDGE_T - EDGE_V) * reach; };

  const pos = [];
  for (let i = 0; i <= segA; i++){
    const th = (i / segA) * Math.PI * 2;
    for (let j = 0; j <= segR; j++){
      const u = j / segR;
      /* A slight twist toward the tips only. The measured plan already carries the arms' own
         curvature, so the old global SWEEP would double it. */
      const E = extent(th + 0.10 * u * u);
      /* THE INNER BOUNDARY IS A CIRCLE, NOT A SCALED LOBE. The old model shrank the whole star to
         make its hole, so the opening was itself three-pointed and swung between 40 and 115 m of
         radius. The funnel is a circular 100 m opening; against a lobed hole it pokes through the
         roof in the valleys. */
      const r = FUN_T + (E - FUN_T) * u;
      const edge = edgeAt(E);
      pos.push(Math.cos(th) * r, edge + (PEAK - edge) * dune(u), Math.sin(th) * r);
    }
  }

  const row = segR + 1, red = [], pale = [], dark = [];
  for (let i = 0; i < segA; i++){
    for (let j = 0; j < segR; j++){
      const a = i * row + j, b = a + row;
      const q = [a, b, a + 1, b, b + 1, a + 1];
      if (j >= segR - RIM) dark.push(...q);
      else if (j >= segR - RIM - STRIPE) pale.push(...q);
      else red.push(...q);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex([...red, ...pale, ...dark]);
  geo.addGroup(0, red.length, 0);
  geo.addGroup(red.length, pale.length, 1);
  geo.addGroup(red.length + pale.length, dark.length, 2);
  geo.computeVertexNormals();

  const mRed = new THREE.MeshStandardMaterial({
    color:0x3A0A11, roughness:0.55, metalness:0.06,
    emissive:0xC8102E, emissiveIntensity:0.30, side:THREE.DoubleSide });
  mRed.userData.duskColor = 0xC8102E;
  mRed.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xC8102E, roughness:0.55, metalness:0.06, side:THREE.DoubleSide });

  const mPale = new THREE.MeshStandardMaterial({
    color:0x2A2A2C, roughness:0.5, emissive:0xE8E4DC, emissiveIntensity:0.22,
    side:THREE.DoubleSide });
  mPale.userData.duskColor = 0xE8E4DC;
  mPale.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xE8E4DC, roughness:0.5, side:THREE.DoubleSide });

  const mDark = new THREE.MeshStandardMaterial({
    color:0x0B0B0C, roughness:0.85, side:THREE.DoubleSide });
  mDark.userData.duskColor = 0x1A1A1C;
  mDark.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0x1A1A1C, roughness:0.85, side:THREE.DoubleSide });

  const roof = new THREE.Mesh(geo, [mRed, mPale, mDark]);
  roof.userData.hero = true;
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);

  /* THE FUNNEL. 100 m across at the roof, 17 m at its base — a wide glazed cone driven down into
     the building, not the small collar the old model had. At this span it is the second-largest
     thing in the silhouette and it is what stops the crown reading as a solid dome. Sunk very
     slightly so its rim is not coincident with the roof's inner edge, which z-fights. */
  const fun = new THREE.Mesh(
    new THREE.CylinderGeometry(FUN_T * 0.985, FUN_B, PEAK * 0.86, 40, 1, true),
    new THREE.MeshStandardMaterial({ color:0x9FB0BC, roughness:0.35, metalness:0.35,
                                     side:THREE.DoubleSide }));
  fun.position.y = PEAK - PEAK * 0.43 - 0.04;
  g.add(fun);

  /* THE LOGO. 65 x 48.5 m of gold on a red field, legible from a great deal further out than any
     of the geometry — which is exactly why Benoy put it there, for aircraft on approach. Placed
     ON an arm at a height read off the roof's own surface functions; the old one used a typed y
     and a typed radius and hung half off the edge. */
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(LOGO_L, LOGO_W),
    new THREE.MeshStandardMaterial({ color:0x3A2E08, roughness:0.5,
      emissive:0xE8B547, emissiveIntensity:0.55, side:THREE.DoubleSide }));
  sh.rotation.x = -Math.PI / 2;
  {
    const bear = 106 * Math.PI / 180;         // measured: the logo's own hole in the capture
    const E = extent(bear), uL = Math.min(0.95, Math.max(0.05, (145 / M - FUN_T) / (E - FUN_T)));
    const rL = FUN_T + (E - FUN_T) * uL, edge = edgeAt(E);
    sh.position.set(Math.cos(bear) * rL, edge + (PEAK - edge) * dune(uL) + 0.06,
                    Math.sin(bear) * rL);
    sh.rotation.z = -bear;
  }
  sh.material.userData = { duskColor:0xE8B547,
    dayMats:new THREE.MeshStandardMaterial({ color:0xE8B547, roughness:0.5,
                                             side:THREE.DoubleSide }) };
  g.add(sh);

  /* The enclosed core under the crown, so the funnel lands on a building rather than on sea.
     RADIUS IS BOUNDED BY THE VALLEY, NOT BY R_IN. R_IN is the roof's radius in the valleys, so a
     deck at R_IN * 1.05 is wider than the roof at its narrowest and pushes out through it — which
     is what the black streaks radiating from the crown were. */
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(FUN_T * 1.55, FUN_T * 1.55, EDGE_V * 1.3, 32),
    new THREE.MeshStandardMaterial({ color:0x1B1E22, roughness:0.9 }));
  deck.position.y = EDGE_V * 0.65;
  deck.receiveShadow = true;
  g.add(deck);

  g.position.set(x0, 0, z0);
  return g;
}

/* YAS MALL — a sprawl, deliberately.

   The reference shows no single mass: a jumble of grey boxes at slightly different heights with a
   pale skylight ridge running through the middle and car decks on the western side. A mall
   rendered as one clean rectangle is the thing that makes a generated city look generated, and
   this is the largest roof on the island after Ferrari World.

   ORIENTED EAST-WEST, long axis toward the roof, because that is how it meets it. */
/* ETIHAD ARENA, Yas Bay. HOK, 2021.

   MEASURED FOOTPRINT, INFERRED HEIGHT. The bake carries 158 x 151 m at rot 0.49, four metres from
   the landmark anchor, and that is what the plan is built to. It also carries h 25, which is not
   used: an 18,000-seat bowl needs more than 25 m of clear height before any roof structure, and
   the elevations show a wall, a deep fascia and a shallow hat above it. 42 m to the crown is the
   one number here that is not surveyed.

   THE MASSING TOOK SIX GOES AND THE FAULT WAS ALWAYS THE SAME. Early versions tapered from 0.58
   of the radius at the base to 1.00 at the eave, which is a BOWL — and no amount of recolouring
   stops a bowl reading as a coin. The elevations show a slab: base very nearly as wide as eave,
   leaning out about ten per cent over the whole height, with a shallow hipped hat that is roughly
   a third of the total. Massing first, materials second; done the other way round it cost hours.

   GOLD SHELL, DARK GROUND FLOOR. One elevation sheet shows a charcoal roof with a gold fascia
   band and I rebuilt to it; a second sheet and every photograph show the whole shell in the same
   bronze shingle, roof included, with dark only at ground level and in the entrance recess. The
   photographs win — the same rule Ferrari World taught, which I failed to apply to a drawing.

   NIGHT IS HALF THE BUILDING. Warm amber washing up the shingle courses and COOL WHITE strips
   down every corner fold: two opposed colour temperatures, and the thing that makes this
   recognisable after dark. The strips carry a DAY material and merely stop being emissive rather
   than disappearing: in daylight they are recessed shadow grooves, which is architecture, and a
   building must not change shape between view modes. None of it is verifiable on the bench, which reads colour and ignores emissive. */
function etihadArena(x0, z0){
  const g = new THREE.Group();
  const M = 7.8;
  const R = 79 / M, H_MAIN = 27 / M, H_PLIN = 3 / M, CHAMF = 15 / M, ROOF_R = 0.50, SEG = 8;
  /* Near vertical. The lean is ten per cent over the whole height, not forty-two. */
  const PROFILE = [[0.00, 0.90], [0.35, 0.96], [0.70, 1.00], [1.00, 1.00]];
  const rAt = t => {
    for (let i = 1; i < PROFILE.length; i++){
      if (t <= PROFILE[i][0]){
        const [t0, r0] = PROFILE[i - 1], [t1, r1] = PROFILE[i];
        return R * (r0 + (r1 - r0) * (t - t0) / (t1 - t0));
      }
    }
    return R;
  };

  /* duskColor and dayMats on the MATERIAL, which is the kit's convention; world-nav.html's
     snapshotMats promotes it onto the mesh, because applyView reads it from there. */
  const mk = (dusk, day, rough, metal, emis, ei) => {
    const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough, metalness:metal || 0 });
    if (emis !== undefined){ m.emissive = new THREE.Color(emis); m.emissiveIntensity = ei; }
    m.userData.duskColor = dusk;
    m.userData.dayMats = new THREE.MeshStandardMaterial({
      color:day, roughness:rough, metalness:metal || 0 });
    /* Plan and Check, same reason as the other mk() helpers in this file. */
    m.userData.planMats = new THREE.MeshBasicMaterial({ color:day });
    return m;
  };
  const wallG  = mk(0x1B2126, 0x2B3238, 0.35, 0.25);
  const gold   = mk(0x6B5127, 0xB08A45, 0.50, 0.35, 0xC96A1E, 0.42);
  const goldL  = mk(0x7C6033, 0xC2A05A, 0.45, 0.35, 0xE0842C, 0.50);
  const roofL  = mk(0x74582A, 0xBD9A50, 0.60, 0.25, 0xB55E1A, 0.30);
  const panel  = mk(0x7D6234, 0xC8A961, 0.60, 0.20, 0xA85416, 0.22);
  const podium = mk(0x5E5B54, 0x9C988F, 0.95, 0);
  const wallD  = mk(0x664D25, 0xA8843F, 0.55, 0.35);
  const screen = mk(0x141A20, 0x1D242B, 0.20, 0.45, 0xBFD8EA, 0.85);

  const ring = (rB, rT, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, SEG, 1, true), mat);
    m.position.y = y; m.rotation.y = Math.PI / SEG;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(rAt(0) * 1.14, rAt(0) * 1.16, H_PLIN, SEG), podium);
  plinth.position.y = H_PLIN / 2; plinth.rotation.y = Math.PI / SEG;
  plinth.receiveShadow = true;
  g.add(plinth);

  const N = 10, bodyH = H_MAIN - H_PLIN;
  for (let i = 0; i < N; i++){
    const t0 = i / N, t1 = (i + 1) / N;
    ring(rAt(t0), rAt(t1), bodyH / N, H_PLIN + bodyH * (t0 + t1) / 2,
         i <= 2 ? wallG : i % 2 ? gold : goldL);
  }

  ring(R, R * ROOF_R, CHAMF, H_MAIN + CHAMF / 2, roofL);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(R * ROOF_R, R * ROOF_R, 0.6 / M, SEG), panel);
  cap.position.y = H_MAIN + CHAMF; cap.rotation.y = Math.PI / SEG;
  cap.receiveShadow = true;
  g.add(cap);

  /* THE ENTRANCE, ON A FACET CENTRE AND NOT AT A ROUND AZIMUTH. The courses are octagons turned
     by PI/8; a round number of degrees lands on an EDGE and folds the screen round a corner. */
  const ENT = Math.PI / SEG;
  const face  = t => rAt(t) * Math.cos(Math.PI / SEG);
  const halfW = t => rAt(t) * Math.sin(Math.PI / SEG);
  const ent = new THREE.Group();
  ent.rotation.y = ENT;
  const recessT = 0.62, rH = bodyH * recessT, rW = halfW(recessT * 0.5) * 1.86;

  const recess = new THREE.Mesh(new THREE.BoxGeometry(rW, rH, 1.0 / M), wallG);
  recess.position.set(0, H_PLIN + rH / 2, face(recessT * 0.5) - 3.2 / M);
  ent.add(recess);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(40 / M, 11 / M), screen);
  scr.position.set(0, H_PLIN + rH * 0.62, face(recessT * 0.5) - 3.0 / M);
  ent.add(scr);
  const colH = rH * 0.46;
  for (let i = -3; i <= 3; i++){
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.6 / M, colH, 1.6 / M), wallG);
    c.position.set(i * rW / 7.4, H_PLIN + colH / 2, face(0.1) - 1.0 / M);
    ent.add(c);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(rW * 1.06, 1.8 / M, 16 / M), wallD);
  canopy.position.set(0, H_PLIN + colH, face(0.1) + 5.5 / M);
  ent.add(canopy);
  /* NO FORECOURT SLAB. A 34 m apron took the footprint from 152 to 182 m, and the footprint sizes
     the KIT_ZONES exclusion — so paving the ground painter already draws would have deleted a
     strip of real Yas Bay buildings. Landmarks stop at the building. */
  g.add(ent);

  /* THE STRIPS EXIST IN EVERY VIEW. They were nightOnly, which made them vanish in Day and Check
     — and that is the one place this building physically CHANGED between modes rather than merely
     shading differently. In daylight they are recessed shadow grooves in the shingle, which is
     real architecture; only the glow is nocturnal. So they keep a day material and simply stop
     being emissive, like everything else in the scene.

     The lamp pools in w2h-props.js are the only legitimate nightOnly meshes: they stand in for
     628 point lights and have no daytime existence at all. These are not that. */
  const strip = new THREE.MeshStandardMaterial({
    color:0x223046, emissive:0xBFD2FF, emissiveIntensity:1.5, roughness:0.4 });
  strip.userData.duskColor = 0x223046;
  strip.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x6E5A34, roughness:0.7 });
  for (let k = 0; k < SEG; k++){
    const a = ENT + (k + 0.5) * Math.PI * 2 / SEG;
    const t0 = 0.26, t1 = 0.90, h = bodyH * (t1 - t0);
    const r = rAt((t0 + t1) / 2) * 1.004;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.7 / M, h, 0.7 / M), strip);
    m.position.set(Math.sin(a) * r, H_PLIN + bodyH * (t0 + t1) / 2, Math.cos(a) * r);
    m.rotation.y = -a;
    m.userData.noShadow = true;
    g.add(m);
  }

  g.position.set(x0, 0, z0);
  return g;
}

/* YAS BAY PIER — the covered-market pier at Yas Bay Waterfront.

   NOT IN THE BAKE, AND IT CANNOT BE. It stands over water, and the footprint pass clips to the
   coastline: only 13 buildings on the whole of Yas fall outside the shore and none of them is
   this. So it is the one thing on this waterfront that has to be hand-built — the hotels, the
   arena forecourt and the F&B pavilions are all real surveyed footprints already.

   IT IS NOT OVER WATER AND IT IS NOT MISSING FROM THE BAKE. Both halves of the original premise
   were wrong. Four surveyed coordinates across Yas Bay all fall INSIDE the resampled outline:
   Asia Asia 24.458075/54.600032 (26 m from the coast), the Waterfront View Point at the tip
   24.456604/54.600592 (31 m), the Hilton 24.459403/54.600993 and Etihad Arena 24.460418/54.604002.
   Pier71 is a reclaimed promontory - LAND with buildings standing on it - and the bake carries
   both: the outline turns south around it, and nine footprints sit on it, the largest 71 x 35 m.
   The name is what misled this: it is addressed as "The Pier, Yas Bay" and it is not a pier.

   THE ACTUAL PIER IS A SEPARATE, SMALLER STRUCTURE alongside - the jetty with the moorings on it.
   That one is over water, so the footprint pass does clip it, and it is the only thing here that
   would ever need hand-building. It needs its own coordinates; nothing below describes it.

   AND THE SCALE WAS A QUARTER TOO BIG. The old header said the centre lands 611 m from Etihad
   Arena, registered off a north-up capture at 0.68 m/px. From the coordinates that distance is
   452 m. Same rotated capture that put the pier 519 m inland - Google draws the compass rosette
   only when the map is ROTATED, and it was drawn. So every quantity taken off that image is about
   25 per cent oversized, and the sizes below have been divided through by 0.74 to match. 143 m was
   never a width either: an axis-aligned box read off a ROTATED long rectangle always comes back
   fatter and squarer than the rectangle.

   THIS FUNCTION IS NO LONGER PLACED. w2h-world.js stopped calling it - the bake draws this
   waterfront correctly on its own. It is kept because Pier71 is a fair landmark candidate, and if
   it is ever wanted as one it goes on the promontory centre with a KIT_ZONE to suppress the nine
   footprints underneath, NOT seaward into open water. */
function yasBayPier(x0, z0, facing){
  /* WHITE AND CREAM, NOT RAINBOW. The first version gave this a row of red, ochre and teal
     awnings, which comes from Aldar's early marketing render — a scheme that was never built. The
     photographs and the current renders show the opposite: a pale concrete deck, white blocks,
     and one big CREAM FABRIC CANOPY on timber posts. The only strong colour on the whole pier is
     the art panels at the seaward end.

     Two renders of the same building, years apart, and I built the one that does not exist. Same
     failure as the Yas Mall circular finned roof — build to photographs of the finished thing. */
  const g = new THREE.Group();
  const M = 7.8;
  const L = 185 / M, W = 92 / M, DECK = 1.4 / M;

  const mk = (dusk, day, rough, emis, ei) => {
    const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough == null ? 0.8 : rough });
    if (emis !== undefined){ m.emissive = new THREE.Color(emis); m.emissiveIntensity = ei; }
    m.userData.duskColor = dusk;
    m.userData.dayMats = new THREE.MeshStandardMaterial({
      color:day, roughness:rough == null ? 0.8 : rough });
    /* PLAN AND CHECK, WHICH EVERY KIT MATERIAL WAS MISSING. Nineteen mk() materials across this
       file declared dayMats and duskColor and nothing else, so in Plan and Check the landmarks
       had no material to switch to and appeared in some view modes but not others — the pools
       inside the Hilton being the case that finally showed it.

       MeshBasic on the day colour, matching what flatSet does for ground features: Plan is an
       unlit drawing, and a lit solid standing on an unlit plan reads as a different drawing. */
    m.userData.planMats = new THREE.MeshBasicMaterial({ color:day });
    return m;
  };
  const deckM  = mk(0x736E64, 0xC9C3B6, 0.95);
  const white  = mk(0x8A857A, 0xEDE9E0, 0.8,  0xFFE9C6, 0.10);
  const fabric = mk(0x847C6C, 0xE8E0CE, 0.85, 0xFFE2B4, 0.14);
  const timber = mk(0x5B4934, 0xB0906A, 0.9);
  const glassM = mk(0x1E262C, 0x33414A, 0.30);
  const pileM  = mk(0x2A2721, 0x4A453C, 0.9);
  /* The art panels: the one place the pier carries strong colour, on the seaward frontage. */
  const art    = [mk(0x5E2A22, 0xB8503C, 0.7), mk(0x1E4646, 0x2F7F7C, 0.7),
                  mk(0x63501A, 0xC49A34, 0.7)];

  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, DECK, W), deckM);
  deck.position.y = DECK / 2; deck.receiveShadow = true;
  g.add(deck);

  for (let i = -6; i <= 6; i++){
    for (const zz of [-W / 2 + 0.25, W / 2 - 0.25]){
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.2 / M, 0.28), pileM);
      p.position.set(i * L / 13.5, -1.2 / M, zz);
      g.add(p);
    }
  }

  /* THE GANGWAY. A narrow boardwalk running back to the promenade — in every capture the pier is
     reached along it, and without it the deck is an island rather than a pier. */
  const gang = new THREE.Mesh(new THREE.BoxGeometry(9 / M, DECK * 0.8, 62 / M), deckM);
  gang.position.set(-L / 2 - 4 / M, DECK * 0.4, -W / 2 - 26 / M);
  gang.receiveShadow = true;
  g.add(gang);

  /* The market hall at the inland end: one long flat-roofed white block. */
  const hall = new THREE.Mesh(new THREE.BoxGeometry(74 / M, 10 / M, 52 / M), white);
  hall.position.set(-L / 2 + 42 / M, DECK + 5 / M, -6 / M);
  hall.castShadow = true; hall.receiveShadow = true;
  g.add(hall);

  /* THE CANOPY, WHICH IS THE BUILDING. A broad cream fabric roof on timber posts over an open
     terrace — pale, floating, and the thing you actually recognise from the water. */
  const cano = new THREE.Mesh(new THREE.BoxGeometry(64 / M, 1.0 / M, 44 / M), fabric);
  cano.position.set(6 / M, DECK + 11.5 / M, 2 / M);
  cano.castShadow = true;
  g.add(cano);
  for (let i = -3; i <= 3; i++){
    for (const zz of [-19 / M, 19 / M]){
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 11 / M, 0.22), timber);
      post.position.set(6 / M + i * 10 / M, DECK + 5.5 / M, 2 / M + zz);
      g.add(post);
    }
  }
  const under = new THREE.Mesh(new THREE.BoxGeometry(52 / M, 6 / M, 20 / M), glassM);
  under.position.set(2 / M, DECK + 3 / M, 6 / M);
  g.add(under);

  /* Two low white blocks and the plaza at the seaward end, with the art panels facing out. */
  for (const [dx, dz, w, dp] of [[L * 0.32, -14 / M, 30 / M, 24 / M],
                                 [L * 0.38,  16 / M, 26 / M, 20 / M]]){
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 8 / M, dp), white);
    b.position.set(dx, DECK + 4 / M, dz);
    b.castShadow = true;
    g.add(b);
  }
  for (let i = 0; i < 3; i++){
    const pnl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6 / M, 13 / M), art[i]);
    pnl.position.set(L / 2 - 4 / M, DECK + 3 / M, (i - 1) * 16 / M);
    g.add(pnl);
  }

  /* THE PLAN SCALE CORRECTION, IN ONE PLACE. Every horizontal metre figure above was authored to
     hit the 189 x 143 m bounding box from the rotated capture, so they are all wrong by the same
     factor and the composition between them is fine. 0.74 is 452/611 — the coordinate distance to
     Etihad Arena over the claimed one. Applied to x and z only: the heights were not taken off
     that image and a 10 m market hall is a 10 m market hall. Span goes 194 x 149 -> 144 x 110 m.

     One scalar rather than twenty retyped literals because the literals are not independently
     sourced — they share a single error, and a single error deserves a single correction that can
     be deleted outright the day a real survey arrives. */
  g.scale.x = g.scale.z = 0.74;

  if (facing !== undefined) g.rotation.y = -facing;
  g.position.set(x0, 0, z0);
  return g;
}

/* HILTON ABU DHABI YAS ISLAND — and every number in it is derived, not eyeballed.

   WHY IT IS BUILT AT ALL. The bake has it as ONE oriented box, 270 x 136 m at a flat 40 m, and
   that box is the whole plot: podium, forecourt and car deck conflated into the hotel. Eleven
   surveyed points inside it say the building is a long spine with a wing, not a slab.

   THE PLAN COMES FROM THE POINTS. Eight of them fall on the built mass — eforea spa (two), the
   Emirates NBD ATM in the lobby, the Sofia and Quag Rubi treatment rooms, and three dropped pins.
   Fitted, they give a long axis at 11.8 degrees from east and a footprint 169 x 49 m. The bake's
   own box is at 13.6 degrees: two independent sources, two degrees apart, so the orientation is
   settled. Three further points — Bayside Burger, Bua Thai, Grand Massage — sit 80 to 90 m off
   that spine on the beach side and are NOT in the hotel; they are the waterfront F&B row, and
   including them is what makes a fit like this go square and wrong.

   Inside the eight there is structure worth keeping. Five run the full length at v = -5 to -24;
   three (ATM, Quag Rubi, Sofia) sit at v = +17 to +25 over a 69 m stretch. That is a spine with a
   wing off the back of it, and that is what is built.

   THE HEIGHT IS DERIVED FROM THE ROOM COUNT, which is the one published hard number: 545 rooms.
   A 169 m spine on a double-loaded corridor at a 4.4 m room module, less fifteen per cent for
   cores and service, is 65 rooms a floor. 545 / 65 is 9 guest floors. The ballrooms are on Floor
   2, so two podium floors under them: ELEVEN storeys. At 3.6 m that is 39.6 m, and the bake
   carries 40 m for this footprint from a source that knows nothing about the room count. Two
   derivations, four tenths of a metre apart.

   HORIZONTAL BANDING, BECAUSE THE ROOMS HAVE BALCONIES. Floor-to-ceiling glazing with a furnished
   balcony to every room is in the room description, so the long elevations read as nine stacked
   bands rather than a glass curtain. That is the one facade decision here, and it is sourced.

   WHAT THIS IS NOT: a segmented plan. The masses are placed from a point envelope, not traced off
   a survey, so the wing lengths are the soft numbers. If a plan ever arrives, replace the table
   below rather than nudging it. */
function hiltonYasBay(x0, z0, facing){
  const g = new THREE.Group();
  const M = 7.8;
  const F = 3.6 / M;                 // one storey, and the only vertical unit used here

  const mk = (dusk, day, rough, emis, ei) => {
    const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough == null ? 0.8 : rough });
    if (emis !== undefined){ m.emissive = new THREE.Color(emis); m.emissiveIntensity = ei; }
    m.userData.duskColor = dusk;
    m.userData.dayMats = new THREE.MeshStandardMaterial({
      color:day, roughness:rough == null ? 0.8 : rough });
    /* PLAN AND CHECK, WHICH EVERY KIT MATERIAL WAS MISSING. Nineteen mk() materials across this
       file declared dayMats and duskColor and nothing else, so in Plan and Check the landmarks
       had no material to switch to and appeared in some view modes but not others — the pools
       inside the Hilton being the case that finally showed it.

       MeshBasic on the day colour, matching what flatSet does for ground features: Plan is an
       unlit drawing, and a lit solid standing on an unlit plan reads as a different drawing. */
    m.userData.planMats = new THREE.MeshBasicMaterial({ color:day });
    return m;
  };
  /* Pale precast against dark glazing — the Yas Bay palette, and the same family the arena and
     the promontory blocks already use, so the waterfront reads as one scheme. */
  const stone  = mk(0x8C877B, 0xE4DED0, 0.85, 0xFFE9C6, 0.08);
  const band   = mk(0x736E63, 0xC8C0AE, 0.80, 0xFFE4BC, 0.10);
  const glassM = mk(0x1F282E, 0x36444D, 0.30, 0x9FD4E4, 0.16);
  const podM   = mk(0x7E796E, 0xD6CFC0, 0.90, 0xFFE9C6, 0.06);

  /* THE E, READ OFF ELEVEN REGISTERED POINTS RATHER THAN TRACED OFF THE DRAWING.

     The sheet cannot be traced: its north arrow is 90 degrees out. The numbered run 1-4-5-6-7-8-9
     reads top to bottom on the page and goes almost due EAST on the ground, so on that page east
     points down and north points right. But it does not need tracing, because every landmark on
     it carries a coordinate and coordinates do not care which way the page is turned.

     In this hotel frame — +u east along the long axis, -v the sea, +v Yas Drive — the eleven
     points fall into three clean rows, and the rows ARE the E:

       INLAND SPINE   v +17..+25   ATM u -44,   point 6 u -13,   Sofia u +25
       INNER MASS     v -5..-10    point 5 u -45,  point 7 u +32,  point 8 u +54
       ARM TIPS       v -21..-24   point 4 u -89,                  point 9 u +80

     Points 4 and 9 are the ends of two arms reaching seaward, not the ends of a bar — which is
     exactly what a straight spine driven through the middle of them got wrong. The pool courtyard
     sits between them, which is why point 7 is called pool side.

     AND THE RESTAURANTS ARE NOT THE HOTEL. Bua Thai, L'Antica and Bayside Burger land at v -74 to
     -80, a full 50 m seaward of the hotel's own edge. That is the promenade row the layout draws
     in orange, built here as its own thing so the hotel stops swallowing it.

     LOCAL +z IS THE SEA, so local z is -v. Island z is the negative of bake y, which puts a local
     +z vector on the cross-axis component pointing away from the island. Written down because it
     was got backwards for a whole deploy and the wings reached inland across Yas Drive. */

  /* THE PODIUM, two storeys, over the registered extent u -100..+95, v -32..+32. */
  /* THE PODIUM IS THE BAKE FOOTPRINT, 270 x 136, CENTRED ON THE ANCHOR. It was 270 x 175 centred
     at -12, which overhung the real footprint by 20 m on the seaward side before the anchor was
     ever moved. The ground plate under this landmark is correct, so the podium matches it. */
  const pod = new THREE.Mesh(new THREE.BoxGeometry(270 / M, 2 * F, 136 / M), podM);
  pod.position.set(0, F, 0);
  pod.castShadow = true; pod.receiveShadow = true;
  g.add(pod);

  /* THE SPINE, on the inland row the ATM, point 6 and Sofia describe. Eleven storeys — 545 rooms
     over a 169 m double-loaded corridor is nine guest floors, and the ballrooms are on Floor 2. */
  /* STEPPED, NOT FLAT, and the step is symmetric about the centre. The three-view reference shows
     the mass rising to a tall central block and falling away twice on both sides — tall centre,
     lower flanks, low end pavilions. The old single 176 m box at a uniform eleven storeys is the
     one thing the reference contradicts outright, and it is what made the horizon render read as
     a wall.

     THE CENTRE IS 69 M BECAUSE THE SURVEY SAYS SO. The three inland points — ATM, point 6, Sofia
     — span exactly that, and the reference's tall block covers about the middle third of a 176 m
     frontage. Two sources, same answer, so the tall part is 69 m and not a guess.

     Eleven storeys stays: 545 rooms over a double-loaded 169 m corridor is nine guest floors and
     the ballrooms are on Floor 2. The flanks take eight and the end pavilions four, which is the
     reference's profile read off the front elevation. */
  /* A U OPENING TO THE SEA, and this supersedes the E.

     THE PLAN CAME FROM A TRACE ON THE IMAGERY, the first ground truth this building has had. Two
     closed loops: an outer perimeter, and an inner one around the pool-and-garden court. The mass
     wraps that court on the inland side and both ends and thins almost to nothing on the seaward
     side. A courtyard block, not a spine with arms.

     IT RECONCILES THE SURVEY RATHER THAN CONTRADICTING IT. The eleven points fall in two rows
     because a U has two rows: the inland wing at v +17..+25, and the seaward edge at v -5..-24
     with points 4 and 9 at u -89 and +80 as the arm ends. A straight-line fit driven through
     those rows lands in the courtyard, which is how a 175 m deep building became a 49 m bar.

     AND IT RESCUES THE BAKE, which this function was written to override on the grounds that its
     270 x 136 m box "conflates podium, forecourt and car deck into the hotel". The trace says the
     box had the extent right. Scaled against the lagoon pool the outer footprint reads about
     270 x 175 m. Long axis from the bake, where two sources already agreed within two degrees;
     the 175 m depth is the soft number and the one to replace if a measurement arrives.

     WHY THE RENDER LOOKED LIKE A CONTINUOUS FRONTAGE. From the water you see the tall inland wing
     ACROSS the open court with the terrace and pools in front. That reads as one long elevation
     with recesses — which is what made first a crescent and then an E look reasonable. */
  const HT = 11 * F;
  const HF = 8 * F;
  const HE = 4 * F;
  const seg = (w, h, du, dz, d) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w / M, h, d / M), stone);
    b.position.set(du / M, h / 2, dz / M);
    b.castShadow = true; b.receiveShadow = true;
    g.add(b);
  };

  /* THE INLAND WING, 270 m, stepped as the front elevation shows: tall centre over the surveyed
     69 m stretch, flanks at eight, end pavilions at four. 50 m deep, centred at z -50, so its
     seaward face at -25 looks across the court. */
  seg(69,  HT,    0, -38, 60);
  seg(70,  HF,  -69, -38, 60);
  seg(70,  HF,   69, -38, 60);
  seg(31,  HE, -119, -38, 60);
  seg(31,  HE,  119, -38, 60);

  /* THE TWO ARMS closing the U, running seaward down each end. Points 4 and 9 are the tips. */
  seg(39, HF, -115, 30, 60);
  seg(39, HF,  115, 30, 60);

  /* THE SEAWARD LINK across the mouth — a two-storey terrace edge, not a wall, so it never blocks
     the wing behind it from the water. The trace has the south band at about a fifth of the north
     band's depth and the render shows a low terrace there with the pools in front. */
  seg(192, 2 * F, 0, 63, 10);

  /* BANDS ON THE ARMS' INNER AND OUTER FACES, six floors each above the podium. */
  for (const a of [-115, 115]){
    for (let i = 0; i < 6; i++){
      const y = 2 * F + i * F + F * 0.5;
      for (const du of [a - 20.4, a + 20.4]){
        const bd = new THREE.Mesh(new THREE.BoxGeometry(1.8 / M, F * 0.16, 60 / M), band);
        bd.position.set(du / M, y, 30 / M);
        g.add(bd);
      }
    }
  }

  /* THE INLAND WING'S BANDS FACE THE COURT AND THE SEA BEYOND IT, at z -25. Nine on the tall
     centre, six on the flanks. This is the elevation the reference photographs. */
  for (const w of [{ u:0, n:9, l:69 }, { u:-69, n:6, l:70 }, { u:69, n:6, l:70 }]){
    for (let i = 0; i < w.n; i++){
      const y = 2 * F + i * F + F * 0.5;
      const bd = new THREE.Mesh(new THREE.BoxGeometry(w.l / M, F * 0.16, 1.8 / M), band);
      bd.position.set(w.u / M, y, -7.9 / M);
      g.add(bd);
      const wg = new THREE.Mesh(new THREE.BoxGeometry((w.l - 4) / M, F * 0.62, 0.4 / M), glassM);
      wg.position.set(w.u / M, y + F * 0.06, -6.8 / M);
      g.add(wg);
    }
  }

  /* NO POOL IS BUILT HERE, AND THAT IS DELIBERATE.

     The ground feature system already owns this courtyard's pool — Yas bakes 296 pool pins and one
     of them is this basin, which is why a correctly shaped hole appears in the deck without this
     function drawing anything. Building a head-and-leg approximation on top of it put two pools in
     the same courtyard, a traced one and a pinned one, clashing.

     The pinned one wins: it comes from the same survey the seven pool pins came from rather than
     from boxes fitted by eye, and it is a free-form outline where these were rectangles. If its
     SCALE is wrong that is a ground-feature fix, not a landmark one, and doing it here would only
     hide the real fault under a second object.

     WHAT THE SEVEN PINS ARE STILL FOR. 30 m across by 47 m long, centred at bake
     (18362.6, -3452.5), long axis seaward. They are the check on the ground feature's scale and
     they are what re-centred the U in this function — the court runs z 0 to +60 because the pool
     has to sit inside it. Kept in writing here because the geometry no longer records them. */

  /* THE PROMENADE RESTAURANT ROW at v -77, where Bua Thai, L'Antica and Bayside Burger register.
     Single storey at 3.6 m. Four units of jittered width under one canopy, so it reads as a row of
     separate places rather than as one long shed — believable rather than perfect. */
  for (const [i, du] of [-34, -4, 32, 61].entries()){
    const u = new THREE.Mesh(new THREE.BoxGeometry((16 + (i % 2 ? 5 : 0)) / M, F, 13 / M), stone);
    u.position.set(du / M, F / 2, 77 / M);
    u.castShadow = true; u.receiveShadow = true;
    g.add(u);
  }
  const can = new THREE.Mesh(new THREE.BoxGeometry(120 / M, 0.5 / M, 17 / M), podM);
  can.position.set(14 / M, F * 1.12, 77 / M);
  can.castShadow = true;
  g.add(can);

  if (facing !== undefined) g.rotation.y = -facing;
  g.position.set(x0, 0, z0);
  return g;
}

/* CAFE DEL MAR ABU DHABI — the circular deck at the Hilton's waterline.

   IT IS ON THE SHORE, NOT ON PILES OVER OPEN WATER. The three-view render shows it standing out
   in the sea on a pile ring off the end of the hotel; satellite shows a circle set into the edge
   where the free-form lagoon pool meets the beach, with a rock groyne running seaward from it.
   Same wide-lens flattening that turned this hotel into a crescent. The render is good for what
   stands on the deck and useless for where the deck is.

   WHAT THE SATELLITE GIVES DIRECTLY: a circle, a radial deck pattern, a ring of pale tensile
   canopies over its seaward half, and the groyne. Those are built. What it does not give is a
   dimension, so the radius is the one soft number here and it is stated rather than buried —
   24 m, read off the circle against the lagoon pool beside it, which is itself about 80 m on its
   long axis. If a measurement ever arrives, change R and nothing else.

   ITS OWN GROUND PLATE. The deck carries its own apron and waterline so it does not depend on
   whatever the band system paints underneath, which is the rule that keeps a landmark judgeable
   on the bench alone. */
function cafeDelMar(x0, z0, facing){
  const g = new THREE.Group();
  const M = 7.8;

  const mk = (dusk, day, rough, emis, ei) => {
    const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough == null ? 0.8 : rough });
    if (emis !== undefined){ m.emissive = new THREE.Color(emis); m.emissiveIntensity = ei; }
    m.userData.duskColor = dusk;
    m.userData.dayMats = new THREE.MeshStandardMaterial({
      color:day, roughness:rough == null ? 0.8 : rough });
    m.userData.planMats = new THREE.MeshBasicMaterial({ color:day });
    return m;
  };
  const deckM   = mk(0x6B5A46, 0xB89A72, 0.90, 0xFFD9A0, 0.06);   // timber
  const sailM   = mk(0xA8A296, 0xF2EDE2, 0.70, 0xFFF0D8, 0.14);   // tensile fabric
  const stone   = mk(0x8C877B, 0xE4DED0, 0.85, 0xFFE9C6, 0.08);
  const rockM   = mk(0x5E5950, 0x9C948494 & 0xFFFFFF, 0.95);

  const R = 24 / M;                  // the one soft number
  const DECK_Y = 1.4 / M;

  /* THE DECK, and the radial pattern is the thing that identifies it from the air. Twenty-four
     slats rather than a texture, because at hero distance the radial lines are the read and a
     texture on a 48 m disc would be invisible. */
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, DECK_Y, 40), deckM);
  disc.position.set(0, DECK_Y / 2, 0);
  disc.castShadow = true; disc.receiveShadow = true;
  g.add(disc);
  for (let i = 0; i < 24; i++){
    const a = (i / 24) * Math.PI * 2;
    const sl = new THREE.Mesh(new THREE.BoxGeometry(R * 0.94, 0.12 / M, 0.5 / M), stone);
    sl.position.set(Math.cos(a) * R * 0.5, DECK_Y + 0.05 / M, Math.sin(a) * R * 0.5);
    sl.rotation.y = -a;
    g.add(sl);
  }

  /* THE CANOPIES. Five, over the seaward half, which is where the satellite shows them and where
     the render shows them too — the one thing the two sources agree on without qualification.
     Four-sided cones read as tensioned sails at this scale; a real hypar would be a lot of
     triangles for a shape that is 12 m across in a scene measured in kilometres. */
  for (let i = 0; i < 5; i++){
    const a = Math.PI * (0.15 + (i / 4) * 0.7);
    const r = R * 0.55;
    const sail = new THREE.Mesh(new THREE.ConeGeometry(7.5 / M, 4.2 / M, 4), sailM);
    sail.position.set(Math.cos(a) * r, DECK_Y + 5.6 / M, Math.sin(a) * r);
    sail.rotation.y = a;
    sail.castShadow = true;
    g.add(sail);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22 / M, 0.22 / M, 5.6 / M, 6), stone);
    mast.position.set(Math.cos(a) * r, DECK_Y + 2.8 / M, Math.sin(a) * r);
    g.add(mast);
  }

  /* THE BALUSTRADE, a low ring, and the seaward gap where the steps go down to the groyne. */
  for (let i = 0; i < 40; i++){
    const a = (i / 40) * Math.PI * 2;
    if (a > Math.PI * 0.42 && a < Math.PI * 0.58) continue;
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3 / M, 1.1 / M, R * 0.17), stone);
    p.position.set(Math.cos(a) * R * 0.97, DECK_Y + 0.55 / M, Math.sin(a) * R * 0.97);
    p.rotation.y = -a;
    g.add(p);
  }

  /* THE APRON AND THE GROYNE. The apron is this landmark's own ground, so the deck never floats
     on whatever the band system happens to paint. The groyne runs seaward, which is local +z. */
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.22, R * 1.22, 0.5 / M, 32), stone);
  apron.position.set(0, 0.25 / M, 0);
  apron.receiveShadow = true;
  g.add(apron);
  for (let i = 0; i < 7; i++){
    const rk = new THREE.Mesh(new THREE.BoxGeometry((5 - i * 0.4) / M, (2.2 - i * 0.2) / M,
                                                    (5 - i * 0.4) / M), rockM);
    rk.position.set((i % 2 ? 1.6 : -1.6) / M, 0.6 / M, (R * 1.2 + i * 5.5 / M));
    rk.rotation.y = i * 0.7;
    rk.castShadow = true;
    g.add(rk);
  }

  if (facing !== undefined) g.rotation.y = -facing;
  g.position.set(x0, 0, z0);
  return g;
}

/* THE YAS BAY JETTY — four surveyed corners, and the first thing here with a real footprint.

   THE CORNERS ARE MEASURED, NOT REGISTERED. 24.458035/54.600551, 24.456468/54.600270,
   24.457872/54.599922 and 24.456605/54.600899. Through the bake's own projection they form a
   rectangle: sides 66 and 162 m, diagonals 177 and 172 against a rectangle's predicted 175. That
   closes, so it is a rectangle and not a trapezium read off a rotated image. Long axis -77.55 deg
   from east, which is one of the two directions the whole Yas Bay building grid runs on. Centre
   at bake (18276.5, -3646.3) = island (-33.55, 416.63).

   WHAT WAS WRONG BEFORE: these corners were read as confirming the coastline and nothing was
   built. The outline does agree with them to within 4 m — but agreeing about where the EDGE is
   says nothing about what stands on it, and what stands on it is a jetty with finger berths, not
   a piece of beach. The bake has no berths because they float and the footprint pass clips to the
   shore.

   THE BUILDINGS ON IT ARE NOT BUILT HERE, DELIBERATELY. Five real footprints already stand on
   this deck — the 71 x 35 m Bushra/Siddharta block and four smaller ones — and they draw from the
   bake. This adds the deck under them and the berths beside them and nothing else, so there is no
   KIT_ZONE and nothing is drawn twice. Additive, which is the only safe way to touch ground that
   already has real geometry on it.

   THE BERTHS GO ON THE SEAWARD SIDE. Local +z is the water: island z is the negative of bake y,
   so a local +z vector under rotation.y = TH lands on the cross-axis component that points away
   from the island. Same derivation as the Hilton, and the Hilton had it backwards for a deploy. */
function yasBayJetty(x0, z0, facing){
  const g = new THREE.Group();
  const M = 7.8;
  const L = 162 / M, W = 66 / M;

  const mk = (dusk, day, rough) => {
    const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough == null ? 0.9 : rough });
    m.userData.duskColor = dusk;
    m.userData.dayMats = new THREE.MeshStandardMaterial({
      color:day, roughness:rough == null ? 0.9 : rough });
    /* Plan and Check, same reason as the other mk() helpers in this file. */
    m.userData.planMats = new THREE.MeshBasicMaterial({ color:day });
    return m;
  };
  const deckM = mk(0x6E6A60, 0xC2BCAE, 0.95);
  const timber = mk(0x5A4B38, 0xA98B64, 0.9);
  const pileM  = mk(0x2B2822, 0x4C473E, 0.9);

  /* The deck. Low and flat — it is a surface, and the buildings that give it height come from the
     bake and stand on top of this. */
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6 / M, W), deckM);
  deck.position.y = 0.8 / M; deck.receiveShadow = true;
  g.add(deck);

  /* Piles down both long edges, on the 16 m bay the berths use. */
  for (let i = -5; i <= 5; i++){
    for (const zz of [-W / 2 + 0.3 / M, W / 2 - 0.3 / M]){
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.5 / M, 5 / M, 0.5 / M), pileM);
      p.position.set(i * 16 / M, -1.6 / M, zz);
      g.add(p);
    }
  }

  /* NINE FINGER BERTHS, seaward side, on a 16 m bay. Timber, low to the water, and the thing that
     makes this read as a marina rather than as a slab of pale concrete in the bay. */
  for (let i = -4; i <= 4; i++){
    const f = new THREE.Mesh(new THREE.BoxGeometry(2.6 / M, 0.7 / M, 26 / M), timber);
    f.position.set(i * 16 / M, 0.5 / M, W / 2 + 13 / M);
    f.receiveShadow = true;
    g.add(f);
    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.4 / M, 1.9 / M, 0.4 / M), pileM);
    cleat.position.set(i * 16 / M, 0.9 / M, W / 2 + 26 / M);
    g.add(cleat);
  }
  /* The walkway the fingers hang off, so they are not nine loose planks. */
  const walk = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, 0.7 / M, 3.2 / M), timber);
  walk.position.set(0, 0.5 / M, W / 2 + 1.6 / M);
  walk.receiveShadow = true;
  g.add(walk);

  if (facing !== undefined) g.rotation.y = -facing;
  g.position.set(x0, 0, z0);
  return g;
}

function yasMall(x0, z0, facing){
  /* YAS MALL, built form - not the competition render.

     WORTH NAMING: the widely-circulated night render of this mall shows a huge circular roof with
     radial fins. That was never built. The aerials of the finished building show something quite
     different, and this is built to those: a broadly SYMMETRIC complex on a north-south axis,
     with a glazed pyramid over the central atrium, retail wings radiating from it, and very large
     flat multi-storey car decks filling the ground around the whole thing. The decks are not
     scenery - in the photographs they take up more ground than the retail does, and a model
     without them reads as a single block dropped in sand.

     THE PREVIOUS MODEL WAS AN IRREGULAR SPRAWL. That was authored from obliques, on the reasoning
     that a real mall would not be symmetrical. This one plainly is: the entrance court, the
     atrium, the wings and the decks are all arranged about one axis.

     ORIENTATION. Local +x points at Ferrari World, which stands off the mall's NORTH face, so the
     axis of symmetry IS local x and the grand entrance court sits at -x, furthest from the roof.

     Metres throughout, converted once. Provisional in a way ferrariWorld is not: it has no flat
     map highlight to segment, so this is proportioned from photographs rather than measured. */
  const g = new THREE.Group();
  const M = 7.8;

  const body = new THREE.MeshStandardMaterial({
    color:0x181C20, roughness:0.85, emissive:0xE8B547, emissiveIntensity:0.06 });
  body.userData.duskColor = 0xB9B4A8;
  body.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xB9B4A8, roughness:0.85 });

  const glass = new THREE.MeshStandardMaterial({
    color:0x1C2A30, roughness:0.35, metalness:0.2,
    emissive:0xBFE4EC, emissiveIntensity:0.30 });
  glass.userData.duskColor = 0xD6EAF0;
  glass.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xD6EAF0, roughness:0.35, metalness:0.2 });

  const deckMat = new THREE.MeshStandardMaterial({ color:0x14181C, roughness:0.95 });
  deckMat.userData.duskColor = 0x9A968C;
  deckMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x9A968C, roughness:0.95 });

  const dark = new THREE.MeshStandardMaterial({ color:0x101317, roughness:0.9 });
  dark.userData.duskColor = 0x6E6A64;
  dark.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x6E6A64, roughness:0.9 });

  const box = (mat, dx, dz, w, h, dp) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, dp / M), mat);
    m.position.set(dx / M, h / M / 2, dz / M);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m); return m;
  };

  /* Retail core: the atrium, four wings on the axes, four blocks on the diagonals. */
  box(body,    0,    0, 150, 28, 150);
  box(body,  135,    0, 120, 24, 120);   box(body, -135,   0, 120, 24, 120);
  box(body,    0,  140, 115, 24, 125);   box(body,    0,-140, 115, 24, 125);
  box(body,  115,  120, 110, 20, 110);   box(body, -115, 120, 110, 20, 110);
  box(body,  115, -120, 110, 20, 110);   box(body, -115,-120, 110, 20, 110);

  /* The pyramid over the atrium. Four radial segments IS a pyramid, and turning it 45 degrees
     squares it to the block beneath. */
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(72 / M, 16 / M, 4), glass);
  pyr.position.set(0, (28 + 8) / M, 0);
  pyr.rotation.y = Math.PI / 4;
  g.add(pyr);

  /* Car decks. Low, flat, and larger than anything else on the site. */
  for (const [dx, dz, w, dp] of [
      [ 255,  245, 210, 190], [-255,  245, 210, 190],
      [ 255, -245, 210, 190], [-255, -245, 210, 190],
      [   0,  300, 180, 140], [   0, -300, 180, 140]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, 13 / M, dp / M), deckMat);
    m.position.set(dx / M, 13 / M / 2, dz / M);
    m.receiveShadow = true;
    g.add(m);
  }

  /* The big dark-roofed box on the east flank - the cinema-and-warehouse end, and the one thing
     on the site that breaks the symmetry in the photographs. */
  box(dark, -70, 250, 190, 27, 160);

  /* The entrance pavilion and its court, at the far end from Ferrari World. */
  const oval = new THREE.Mesh(new THREE.CylinderGeometry(58 / M, 62 / M, 17 / M, 28), body);
  oval.position.set(-250 / M, 17 / M / 2, 0);
  oval.scale.z = 0.62;
  g.add(oval);
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(46 / M, 46 / M, 3 / M, 28), glass);
  canopy.position.set(-250 / M, 18.5 / M, 0);
  canopy.scale.z = 0.62;
  g.add(canopy);

  /* The link to Ferrari World. The two buildings are physically connected, and without this the
     mall reads as merely near the roof rather than joined to it. */
  box(body, 225, 0, 90, 22, 80);

  g.userData.half = 330 / M;
  /* `facing` is the bearing back to Ferrari World; local +x is turned to face it. */
  if (facing !== undefined) g.rotation.y = -facing;
  g.position.set(x0, 0, z0);
  return g;
}

/* QASR AL WATAN — THE PRESIDENTIAL PALACE. Three real rings, straight out of the bake.

   THE HANDOVER ANCHOR LANDED ON THE BUILDING EXACTLY: local (-1150.6, 79.8) sits on a
   453.3 x 405.4 m record carrying a 118-POINT POLYGON, with two 170 m flanking records either
   side carrying 51 points each. Nothing needed surveying. Same lesson as Emirates Palace — the
   footprints were in data/isle-corniche.json the whole time.

   THE MAIN RING IS A DUMBBELL, and that matters for where things go. It is two masses joined by
   a thin neck, spanning z -32.5 to +30.6, and the anchor is the OBB centre — which puts it IN
   THE NECK, on the link corridor rather than on either palace. A dome placed at the anchor would
   have floated over a passage. The seat is solved from the polygon's clearance field instead and
   lands at (-0.25, 15.25) with 10.41 units of room, in the southern mass.

   All three rings fill 37-39 per cent of their own bounding boxes. Like the palace, that is the
   signature of a courtyarded plan and the reason a box would have been wrong.

   ONE DOME, AND ONLY ONE. data/city-reference.js is explicit: this reads as a horizontal bar
   with a single bump and is "easily confused with Emirates Palace unless the stepped flank domes
   are omitted here". Emirates Palace has nine seats; this has one. That contrast is the whole
   point of building it.

   PROPORTIONS FROM city-reference.js, unit = wingHeight ~30 m: dome apex 2.40 (72 m), dome width
   1.23 (37 m diameter). The stack below reproduces 72 m by construction rather than by a literal.

   pavilionScale 1.30 IS NOT USED AS A HEIGHT. The reference does not say which dimension it
   scales, and at 1.30 x wingHeight the flanking blocks would stand taller than the main range
   they flank, which no photograph supports. Read as a plan figure and therefore already carried
   by the real rings; the flanks are set slightly BELOW the main wings instead. Flagged rather
   than silently reinterpreted. */
const QASR_MAIN = [
    [-19.77,-17.39], [-18.57,-13.30], [-16.68,-13.85], [-13.25, -2.24],
    [ -7.55, -3.92], [ -8.73, -3.26], [ -6.05,  5.80], [ -8.08,  6.41],
    [ -8.31,  5.64], [ -9.53,  5.99], [ -8.68,  8.85], [-10.05,  9.26],
    [ -9.63, 10.74], [-14.00, 12.03], [-12.86, 15.92], [-14.04, 16.26],
    [-14.52, 14.69], [-15.04, 14.84], [-15.30, 13.98], [-16.05, 14.20],
    [-16.37, 13.12], [-22.80, 15.03], [-22.48, 16.11], [-23.48, 16.39],
    [-23.22, 17.26], [-24.12, 17.53], [-23.32, 20.23], [-25.78, 20.96],
    [-25.30, 22.57], [-22.85, 21.84], [-22.26, 23.85], [-21.35, 23.58],
    [-21.05, 24.60], [-20.05, 24.30], [-19.77, 25.26], [-13.35, 23.37],
    [-13.63, 22.41], [-12.87, 22.17], [-13.18, 21.17], [-12.64, 21.01],
    [-12.98, 19.88], [-11.78, 19.52], [-10.68, 23.25], [ -8.81, 22.70],
    [ -8.00, 25.43], [ -6.99, 25.14], [ -6.25, 27.64], [  1.70, 25.69],
    [  3.15, 30.57], [  5.89, 29.76], [  4.45, 24.88], [  5.27, 24.64],
    [  5.15, 24.26], [ 12.43, 22.11], [ 11.69, 19.61], [ 12.70, 19.32],
    [ 11.89, 16.58], [ 13.70, 16.05], [ 12.33, 11.39], [ 13.51, 11.03],
    [ 14.52, 14.48], [ 23.02, 11.97], [ 22.06,  8.74], [ 24.81,  7.93],
    [ 24.39,  6.57], [ 21.66,  7.38], [ 20.55,  3.60], [ 12.05,  6.11],
    [ 12.97,  9.25], [ 11.81,  9.60], [ 10.38,  4.82], [  5.41,  6.29],
    [  4.98,  4.82], [  4.14,  5.06], [  3.29,  2.21], [  2.19,  2.53],
    [  2.41,  3.30], [  0.37,  3.91], [ -2.31, -5.17], [ -4.32, -4.88],
    [  1.37, -6.56], [ -1.59,-18.31], [  0.06,-18.79], [ -1.16,-22.89],
    [  1.11,-23.57], [  0.69,-24.99], [ -1.58,-24.31], [ -2.76,-28.29],
    [ -5.57,-27.45], [ -5.32,-26.66], [ -7.25,-26.09], [ -7.87,-28.24],
    [-10.71,-27.40], [-11.34,-29.51], [-10.17,-29.85], [-10.64,-31.44],
    [-11.31,-31.24], [-11.69,-32.52], [-13.09,-32.09], [-12.96,-31.68],
    [-16.45,-31.11], [-16.07,-29.83], [-15.49,-30.01], [-14.40,-26.31],
    [-17.05,-25.52], [-16.43,-23.39], [-18.27,-22.84], [-18.50,-23.62],
    [-21.36,-22.77], [-20.19,-18.81], [-22.52,-18.12], [-22.11,-16.70],
];
const QASR_FLANK_W = [
    [-48.94,-16.22], [-51.11,-15.58], [-50.49,-13.48], [-51.53,-13.17],
    [-50.80,-10.67], [-50.13,-10.86], [-49.67, -9.27], [-53.37, -7.66],
    [-52.34, -4.12], [-49.76, -4.89], [-49.55, -4.17], [-48.84, -4.39],
    [-47.99, -1.49], [-45.77, -2.15], [-44.62,  1.75], [-37.48, -0.36],
    [-37.75, -1.29], [-44.08,  0.60], [-45.82, -5.33], [-44.80, -5.63],
    [-45.68, -8.59], [-44.89,-10.08], [-44.25, -9.75], [-43.99,-10.22],
    [-41.57, -8.48], [-40.67,-10.16], [-43.50,-11.15], [-43.02,-12.04],
    [-43.62,-12.36], [-43.34,-12.88], [-39.99,-13.88], [-40.27,-14.80],
    [-34.59,-16.48], [-32.67, -9.99], [-31.67,-10.29], [-33.94,-17.94],
    [-37.30,-16.94], [-37.98,-19.24], [-41.30,-18.25], [-41.55,-19.12],
    [-42.30,-18.90], [-43.13,-21.72], [-46.41,-20.75], [-45.58,-16.76],
    [-47.05,-16.33], [-47.45,-17.68], [-49.22,-17.16],
];
const QASR_FLANK_E = [
    [ 27.63,-35.26], [ 26.96,-37.36], [ 24.81,-36.68], [ 24.51,-37.61],
    [ 22.75,-37.06], [ 23.18,-35.70], [ 21.72,-35.25], [ 20.18,-39.02],
    [ 16.91,-37.99], [ 17.79,-35.18], [ 17.05,-34.95], [ 17.33,-34.08],
    [ 14.02,-33.04], [ 14.74,-30.77], [ 11.41,-29.72], [ 13.81,-22.11],
    [ 14.79,-22.42], [ 12.77,-28.86], [ 18.41,-30.65], [ 18.70,-29.72],
    [ 22.02,-30.77], [ 22.54,-30.51], [ 22.23,-29.90], [ 23.13,-29.43],
    [ 21.34,-27.03], [ 23.01,-26.13], [ 24.05,-28.94], [ 24.54,-28.68],
    [ 24.87,-29.33], [ 26.36,-28.53], [ 27.29,-25.58], [ 28.32,-25.90],
    [ 29.98,-21.22], [ 23.87,-19.33], [ 24.27,-18.07], [ 31.07,-20.22],
    [ 30.04,-23.24], [ 32.24,-23.93], [ 31.33,-26.80], [ 32.04,-27.03],
    [ 31.82,-27.74], [ 34.37,-28.54], [ 33.27,-32.06], [ 29.29,-31.33],
    [ 28.79,-32.90], [ 29.45,-33.11], [ 28.66,-35.59],
];

function qasrAlWatan(x0, z0){
  const g = new THREE.Group();

  /* Pale, and deliberately paler than Emirates Palace. city-reference gives body #E0DAD0 and
     dome #D8CDBA. The palace down the coast is a pink beige at R-G +29; this is near-neutral
     limestone at R-G +6, so the two never read as the same building even at horizon distance. */
  const stone = new THREE.MeshStandardMaterial({
    color:0x16150F, roughness:0.9, metalness:0.02, emissive:0xE8D9A8, emissiveIntensity:0.03 });
  stone.userData.glassOverride = false;
  stone.userData.duskColor = 0xD9D2C6;
  stone.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE0DAD0, roughness:0.9 });

  const domeMat = new THREE.MeshStandardMaterial({
    color:0x201B10, roughness:0.66, emissive:0xE8B547, emissiveIntensity:0.30 });
  domeMat.userData.glassOverride = false;
  domeMat.userData.duskColor = 0xE2D6BE;
  domeMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xD8CDBA, roughness:0.66 });

  const H_WING = 3.85;            // 30 m, the reference's own unit
  const H_PAV  = 3.30;            // 26 m, below the range it flanks

  /* THE THREE RINGS WERE ONE FLAT COLOUR EACH AND READ AS BLOCKS, the identical fault Emirates
     Palace had and the identical fix: plinth, textured facade, cornice, stacked on the same
     traced footprint so nothing can drift off the wall it dresses.

     THE SAME ARCH TEXTURE AS THE PALACE, on purpose. city-reference.js calls this building "long
     colonnaded wings" — the same architectural language as Emirates Palace, paler and plainer —
     not a different style. A second, invented facade pattern here would assert a distinction
     between the two buildings that nothing in the reference supports. */
  const PLINTH_H = 0.38, CORNICE_H = 0.18;
  const plinthMat = new THREE.MeshStandardMaterial({ color:0x0E0C08, roughness:0.94, metalness:0 });
  plinthMat.userData.glassOverride = false;
  plinthMat.userData.duskColor = 0xC2B5A2;
  plinthMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCABDA8, roughness:0.94 });
  const corniceMat = new THREE.MeshStandardMaterial({
    color:0x1A160F, roughness:0.68, emissive:0xE8D9A8, emissiveIntensity:0.04 });
  corniceMat.userData.glassOverride = false;
  corniceMat.userData.duskColor = 0xEDE7DC;
  corniceMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF0EBE1, roughness:0.68 });
  const facadeMat = palaceFacadeMat(0xE0DAD0, 0xD9D2C6, 0.24);

  function traced(ring, h){
    const sh = new THREE.Shape();
    ring.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
    function band(bh, mat, yOff, withUV){
      const geo = new THREE.ExtrudeGeometry(sh, { depth: bh, bevelEnabled: false });
      geo.rotateX(-Math.PI/2); geo.computeVertexNormals();
      if (withUV) writeSlabUVs(geo, sh, 12, bh);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x0, yOff, z0); g.add(m);
      return m;
    }
    band(PLINTH_H, plinthMat, 0);
    const body = band(h - PLINTH_H - CORNICE_H, facadeMat, PLINTH_H, true);
    body.userData.hero = true;
    band(CORNICE_H, corniceMat, h - CORNICE_H);
  }
  traced(QASR_MAIN, H_WING);
  traced(QASR_FLANK_W, H_PAV);
  traced(QASR_FLANK_E, H_PAV);

  /* THE DOME STACK, built to reach 72 m rather than told to. hall 1.20 + drum 1.80 + radius 2.37
     on a 3.85 roof gives an apex of 9.22 units — 71.9 m against the reference's 72.0. */
  const SX = -0.25, SZ = 15.25;
  const hallT = H_WING + 1.20, drumT = hallT + 1.80, R_DOME = 2.37;
  const hall = new THREE.Mesh(new THREE.CylinderGeometry(4.20, 4.40, 1.20, 24), stone);
  hall.position.set(x0 + SX, H_WING + 0.60, z0 + SZ); g.add(hall);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.90, 3.05, 1.80, 24), stone);
  drum.position.set(x0 + SX, hallT + 0.90, z0 + SZ); g.add(drum);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R_DOME, 26, 15, 0, Math.PI*2, 0, Math.PI/2), domeMat);
  dome.position.set(x0 + SX, drumT, z0 + SZ); dome.userData.hero = true; g.add(dome);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.20, 1.10, 8), domeMat);
  fin.position.set(x0 + SX, drumT + R_DOME + 0.45, z0 + SZ); g.add(fin);

  return g;
}

/* ADNOC HQ — HOK, 342 m, 65 floors, completed 2015. REBUILT FROM PHOTOGRAPHS, because the
   previous version had the building's topology wrong and no amount of proportion work on it
   would have helped.

   WHAT WAS BUILT: a shaft that stopped at 34, two separate legs standing on it with a gap
   between them, a waist and a stepped cap — 49 units of tuning fork. Rendered on the island it
   read as two chimneys with a slab balanced on top.

   WHAT IS ACTUALLY THERE: ONE SLAB, WITH A HOLE PUNCHED NEAR THE TOP. That is the whole
   correction and it is a topology error, not a dimension error. The building is a single
   continuous rectangular slab from ground to roof. Two solid granite END WALLS form its short
   edges and run the full height. A glass curtain wall fills the span between them and stops
   about eight storeys short of the roof. A granite LINTEL spans the two end walls at roof
   level. The opening is the void left between the top of the glass and the underside of that
   lintel — framed on three sides, floored by the glass volume's own roof.

   THE OLD MODEL MADE THE GAP RUN ALL THE WAY DOWN. The previous session's note reasoned that
   two legs were safer than a shape-with-hole extrusion because the arc-length UV mapper only
   walks the outer contour. That reasoning was sound and the conclusion still holds — there is
   no hole-in-a-shape here either. But two legs solved the UV problem by building a different
   building. Four solid pieces solve it as well and build the right one.

   MATERIAL. Bethel White granite on the frame, blue-grey glass between. The old model was
   bronze glass everywhere, with the window texture wrapped over surfaces that are blank stone
   in reality — which is why the close shot reads as a woven basket rather than as a building.
   The frame carries no window map at all, deliberately: the real end walls are unbroken.

   HEIGHT IS BACK TO 44 UNITS. w2h-world.js states ADNOC at 44 in three separate places and
   sizes other things against that figure; the legs had grown it to 49 without those comments
   being touched. 44 x 7.8 = 343 m against a real 342.

   VERIFIED NUMERICALLY, not by eye: blade outer face and lintel outer face both land at local
   x 3.800, and the glass outer face and the blade inner face both land at local x 2.450, so
   frame and infill are flush by construction rather than by two constants happening to agree. */
function adnocHQ(x0, z0){
  const g = new THREE.Group();
  const rot = 0.20;

  /* THE FIVE CONSTANTS, ALL IN UNITS, ALL DERIVED FROM THE REAL BUILDING AT 7.8 m PER UNIT.
       H_TOP    44.0  = 343 m, the architectural top
       H_GLASS  35.6  = 278 m, where the curtain wall stops
       H_BEAM   41.4  = 323 m, the lintel soffit — so the void is 45 m, the lintel 20 m

     THE VOID AND LINTEL WERE BOTH TOO SHALLOW ON THE FIRST PASS and the bench render is what
     caught it. 29 m and 18 m put the opening at 8.4 per cent of the height against roughly 12
     measured off the CTBUH elevation, and at horizon distance — the view that decides whether a
     landmark earns its cost — it shrank to a pinhole and the tower read as a plain slab again.
     45 m is about nine storeys at this building's 5.3 m floor-to-floor, which is what the
     photographs show.
       W / D   7.6 / 4.8 = 59 x 37 m slab, unchanged from the old shaft and about right
       BLADE    1.35  = 10.5 m, the granite end wall thickness in plan  */
  const H_TOP = 44.0, H_GLASS = 35.6, H_BEAM = 41.4;
  const W = 7.6, D = 4.8, BLADE = 1.35, INSET = 0.28;

  /* Offsets are rotated with the tower rather than added to x0 in world space. A mesh's own
     rotation.y turns its geometry about ITS OWN position and does not move that position, so an
     unrotated offset would slide the blades off the slab's rotated face. Same reasoning, and the
     same two lines, as the version this replaces — that part was correct. */
  const bladeOff = (W - BLADE) / 2;
  const bx = bladeOff * Math.cos(rot), bz = -bladeOff * Math.sin(rot);

  /* BETHEL WHITE GRANITE, AND IT IS WHITE. The first pass hedged at 0xCFC6B6 / 0xDCD8CE — a warm
     grey-tan, chosen out of caution about the old beacon failure — and on the bench it read as
     weathered concrete. Every photograph of this building shows a bright near-white stone that
     is plainly lighter than the precast around it. Hedging the colour to avoid an old mistake
     reproduced a different one.

     WHY THE BEACON FAILURE DOES NOT RETURN. The note in DUSK_BY_NIGHT records a pale tan making
     ADNOC the brightest thing on the Corniche. That was a pale tone on the WHOLE tower. Here it
     is the frame only — two end walls and a lintel, roughly a third of the visible face, with
     dark blue glass filling the rest. A bright frame around a dark field is this building's real
     contrast and cannot become one large unbroken light surface, which is what actually failed.

     SITED AGAINST THE FABRIC RATHER THAN PICKED. w2h-world.js's DAY_FAMILY puts painted white
     render at 0xEDEBE6 and precast at 0xD2CBBE; matStoneWhite carries dusk 0xE9E4DA. The values
     below sit just inside the file's existing white, so this is the brightest stone on the
     island by a small margin rather than a new extreme — which is the relationship the real
     building has to its neighbours.

     No map: the end walls and the lintel are blank stone, and putting the tower window texture
     on them is what made the previous model read as woven.

     Lit at night rather than dark. The frame is what is floodlit on the real building after
     dark, and it is the frame — not the glass — that carries the silhouette, so the emissive
     goes here, and it is raised with the albedo so the two agree. */
  const graniteMat = new THREE.MeshStandardMaterial({
    color: 0x24272B, roughness: 0.74, metalness: 0.0,
    emissive: 0xD4DFE6, emissiveIntensity: 0.13 });
  graniteMat.userData.glassOverride = false;
  graniteMat.userData.duskColor = 0xE7E3DA;
  graniteMat.userData.dayMats = new THREE.MeshStandardMaterial({
    color: 0xECEAE4, roughness: 0.74, metalness: 0.0 });

  /* THE TWO END WALLS, full height, one at each end of the long axis. Corner radius 0.25 rather
     than the old shaft's 1.7: the real building is crisply orthogonal in every photograph, and
     1.7 on a 1.35-wide blade would have rounded it into a column. Kept off zero only so the
     vertical arrises do not alias into a hard line at distance. */
  [1, -1].forEach(s => {
    const blade = new THREE.Mesh(roundedSlab(BLADE, D, H_TOP, 0.25, 10), graniteMat);
    blade.position.set(x0 + s * bx, 0, z0 + s * bz);
    blade.rotation.y = rot;
    blade.userData.hero = true;
    g.add(blade);
  });

  /* THE CURTAIN WALL, spanning the gap between the blades and stopping short of the roof. Inset
     0.28 in depth on both faces so the granite reads as a frame standing proud of the glass —
     that shadow reveal is what stops the slab flattening into one plane at midday. */
  const glass = new THREE.Mesh(
    roundedSlab(W - 2 * BLADE, D - 2 * INSET, H_GLASS, 0.18, 8),
    cityMaterial(TEX_TOWER, 1, 1, 0.55, 0x121A24));
  glass.position.set(x0, 0, z0);
  glass.rotation.y = rot;
  glass.userData.hero = true;
  g.add(glass);

  /* THE LINTEL. Full slab width and depth, so it lands flush on both blades and closes the
     opening. This is the single most recognisable thing about the building and the one element
     the old model had, in effect, floating on stilts. */
  const lintel = new THREE.Mesh(roundedSlab(W, D, H_TOP - H_BEAM, 0.25, 10), graniteMat);
  lintel.position.set(x0, H_BEAM, z0);
  lintel.rotation.y = rot;
  lintel.userData.hero = true;
  g.add(lintel);

  return g;
}

/* ===========================================================================
   SUPPORTING CITY. Four distinct tower languages rather than one, so the skyline stops
   repeating. Deterministic seed: a skyline that reshuffles between refreshes makes it
   impossible to judge whether a change helped.
   =========================================================================== */

function boxTower(w, h, d, em){
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    cityMaterial(h > 9 ? TEX_TOWER : TEX_BLOCK, Math.max(1, Math.round(w/2.6)), Math.max(1, Math.round(h/24)), em));
}
function setbackTower(w, h, d, em){
  const g = new THREE.Group();
  let hh = 0;
  for (let i = 0; i < 3; i++){
    const f = 1 - i * 0.24, seg = h * (0.46 - i * 0.10);
    const m = boxTower(w * f, seg, d * f, em);
    m.position.y = hh + seg/2; hh += seg; g.add(m);
  }
  return g;
}
function slabTower(w, h, d, em){
  return boxTower(w * 1.9, h, d * 0.45, em);
}
function taperTower(w, h, d, em){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(w*0.30, w*0.50, h, 16, 1),
    cityMaterial(TEX_TOWER, 2, Math.max(1, Math.round(h/24)), em));
  m.position.y = h/2; m.scale.z = 0.8;
  return m;
}

/* zSlope tilts the row in depth: the western end sits nearer the camera, the eastern end
   recedes. A shoreline running parallel to the camera gives every building the same distance,
   which is precisely why the skyline read as one rigid object however hard it was orbited.
   gap opens holes in the row — Abu Dhabi is defined as much by its empty ground as its towers,
   and an unbroken wall of buildings is the fastest way to look like a game level. */
function cityRow(count, xMin, xMax, z, zJit, hMin, hMax, em, zSlope, gap){
  const g = new THREE.Group();
  const xMid = (xMin + xMax) / 2;
  const slope = zSlope === undefined ? 0 : zSlope;
  const holes = gap === undefined ? 0.12 : gap;
  for (let i = 0; i < count; i++){
    if (rnd() < holes) continue;
    const h = hMin + Math.pow(rnd(), 1.5) * (hMax - hMin);   // skewed: many low, few tall
    const w = 2.0 + rnd() * 3.2;
    const d = 2.0 + rnd() * 2.8;
    const px = xMin + (xMax - xMin) * (i / (count - 1)) + (rnd() - 0.5) * 4;
    const pick = rnd();
    let m;
    if (h < 6)          m = boxTower(w * 1.4, h, d * 1.4, em);
    else if (pick < 0.28) m = setbackTower(w, h, d, em);
    else if (pick < 0.50) m = slabTower(w, h, d, em);
    else if (pick < 0.72) { m = taperTower(w, h, d, em); }
    else                { m = boxTower(w, h, d, em); m.position.y = h/2; }
    if (m.isMesh && m.geometry.type === 'BoxGeometry') m.position.y = h/2;
    m.position.x = px;
    m.position.z = z + (px - xMid) * -slope + (rnd() - 0.5) * zJit;
    m.rotation.y = (rnd() - 0.5) * 0.6;
    g.add(m);
  }
  return g;
}

/* LOW-RISE. The brief's scale contrast: villas and two-storey mass at the water's edge make the
   towers behind them read as enormous. Without this band everything is the same size and the
   city has no sense of scale at all. */
function lowRise(count, xMin, xMax, z, zJit, em){
  const g = new THREE.Group();
  for (let i = 0; i < count; i++){
    if (rnd() < 0.18) continue;
    const h = 0.7 + rnd() * 1.5;
    const m = boxTower(2.2 + rnd()*3.4, h, 2.0 + rnd()*2.6, em);
    m.position.set(xMin + (xMax-xMin) * (i/(count-1)) + (rnd()-0.5)*3, h/2, z + (rnd()-0.5)*zJit);
    m.rotation.y = (rnd()-0.5) * 0.9;
    g.add(m);
  }
  return g;
}
/* SHEIKH ZAYED GRAND MOSQUE — the second landmark this scene needs and the first that has no
   island of its own. The real complex sits on the mainland at the Maqta crossing, off every one
   of the five islands this model draws. Placed on Corniche's own south-eastern tip, seventy-five
   units in from the coastline point nearest that real direction — as close to correct as a model
   with no mainland ground can get, and pulled IN from the shore rather than out over open water,
   since nothing exists past the coastline to stand the building on.

   PROPORTIONS ARE THE WHOLE JOB. From the orbit reference: arcade height is the base unit,
   minarets stand 4.86 of it, the main dome crowns at 3.86, the facade runs 19.0 wide, the
   courtyard void is half the plan. Every dimension below is that unit times its ratio, not a
   number chosen by eye — the silhouette rule the reference gives is explicit: four tall verticals
   bracketing a low horizontal mass with a dome cluster offset to one side, and the minaret-to-
   arcade ratio is what makes it read at forty pixels wide. Get the ratio right and the absolute
   size is a composition choice, the same trade the palace already makes at 384 m for a real 1,000.

   A HOLLOW SQUARE, NOT A BOX. Four wings frame an open courtyard rather than one solid mass — the
   plan is a sahn open to the sky with the prayer hall on one side, and building it solid would
   lose the one feature every photograph of this building leads with. The south wing carries the
   dome cluster and stands taller than the other three, which stay at the base arcade height. */
function grandMosque(x0, z0){
  const g = new THREE.Group();
  /* PALER THROUGHOUT, ON PURPOSE. The first version's stone sat close to the fabric's own warm
     render tone and disappeared into it in a dusk screenshot. This is white marble, not sandstone
     — cooler and paler than anything else on the island, the same separating logic the palace
     uses in the other direction (warm where the fabric is pale, this building goes pale where the
     fabric is warm). */
  const stone = new THREE.MeshStandardMaterial({
    color:0x18181A, roughness:0.8, metalness:0.02, emissive:0xE8E8EA, emissiveIntensity:0.05 });
  stone.userData.duskColor = 0xEDEDEE;
  stone.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF4F4F2, roughness:0.8 });
  const arch = new THREE.MeshStandardMaterial({
    color:0x1C1C1E, roughness:0.78, emissive:0xF0F0EE, emissiveIntensity:0.10 });
  arch.userData.duskColor = 0xF4F3EE;
  arch.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF9F8F4, roughness:0.78 });
  const glow = new THREE.MeshStandardMaterial({
    color:0x241E0E, roughness:0.6, emissive:0xE8B547, emissiveIntensity:0.36 });
  glow.userData.duskColor = 0xF6E2A8;
  glow.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF3E0A6, roughness:0.6 });
  const paving = new THREE.MeshStandardMaterial({
    color:0x242220, roughness:0.75, emissive:0xEAE6DA, emissiveIntensity:0.13 });
  paving.userData.duskColor = 0xE6E1D2;
  paving.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xECE7DA, roughness:0.75 });
  const pool = new THREE.MeshStandardMaterial({
    color:0x0C2A33, roughness:0.25, metalness:0.1, emissive:0x1E5866, emissiveIntensity:0.20 });
  pool.userData.duskColor = 0x3E97A8;
  pool.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x4FA9BC, roughness:0.2 });
  /* ASPHALT AND LINE MARKING, FOR THE SITE LAYER SPECIFICALLY — "parking should be parking",
     not the same pale hardscape tone the site ground and the garden layer both already used.
     Genuinely dark, roughness high (matte tarmac, not wet-look), against a bright near-white
     marking colour so the stripes actually read as paint on asphalt rather than another shade
     of the same grey. */
  const asphalt = new THREE.MeshStandardMaterial({
    color:0x121214, roughness:0.92, emissive:0x0A0A0B, emissiveIntensity:0.05 });
  asphalt.userData.duskColor = 0x1C1C1F;
  asphalt.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x232326, roughness:0.92 });
  const lineMark = new THREE.MeshStandardMaterial({
    color:0xE8E4D8, roughness:0.55, emissive:0xE8E4D8, emissiveIntensity:0.25 });
  lineMark.userData.duskColor = 0xF2EFE6;
  lineMark.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF5F2EA, roughness:0.5 });
  /* GARDEN PLANTING, FOR PORTIONS OF THE HARDSCAPE LAYER — "gardens should have garden portions",
     not one uniform paved tone across the whole traced shape. Green enough to read as planting
     against the arch material's pale cream, not so saturated it looks like a lawn from a
     different, more temperate climate. */
  const gardenBed = new THREE.MeshStandardMaterial({
    color:0x3A4A32, roughness:0.85, emissive:0x2C3826, emissiveIntensity:0.08 });
  gardenBed.userData.duskColor = 0x465A3C;
  gardenBed.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x4C5F40, roughness:0.85 });
  const shrubMat = new THREE.MeshStandardMaterial({
    color:0x4A5C3E, roughness:0.8, emissive:0x323F2A, emissiveIntensity:0.10 });
  shrubMat.userData.duskColor = 0x566B48;
  shrubMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x5C7050, roughness:0.8 });

  /* REBUILT AGAINST THE ORBIT SET DIRECTLY, not against the first pass's proportions. Three
     things the first version had wrong, each visible in every reference frame at once:

     THE DOME CLUSTER COVERS MOST OF THE PRAYER HALL ROOF. Not three domes — a big central dome,
     two large flanks nearly its own size, four more at a smaller grade, and two domed corner
     turrets bracketing the whole cluster. It reads as a field of domes, not an accent.

     THE MINARETS ARE NEEDLES. Real proportion is close to 30 diameters tall; the first pass built
     them at 13, which reads as a squat post with a pointed cap rather than a tower. Thinned hard.

     THE PRAYER HALL IS A DEEP BLOCK, NOT A FRAME THE SAME THICKNESS AS THE OTHER THREE SIDES. The
     plan view shows it roughly as deep as the courtyard is wide — a real mass with its own
     corners, not a colonnade matching the north wing's thickness. The footprint is no longer
     square because of this; the real building's isn't either. */
  const AH   = 2.0;
  const PLAN = AH * 19.0;               // 38.0 — east-west width, unchanged
  const COURT = AH * 9.5;               // 19.0 — the open sahn
  const WING = (PLAN - COURT) / 2;      // 9.5  — north / east / west thickness
  const HALL = AH * 8.4;                // 16.8 — prayer hall depth, nearly the courtyard's width

  const MH   = AH * 7.2;                // 14.4 — taller than the first pass, needle-proportioned
  const MW   = MH * 0.040;              // ~30:1 height to width — the real minaret's own ratio
  const INSET = AH * 0.9;

  const MAIN_R  = AH * 1.9;             // main dome, larger and the visual anchor
  const FLANK_R = MAIN_R * 0.74;        // two large flanks, close to the main in scale
  const MID_R   = MAIN_R * 0.40;        // four mid domes filling the cluster
  const TURRET_R = MAIN_R * 0.30;       // two domed corner turrets on the hall itself
  const SMALL_R = MAIN_R * 0.15;        // arcade parapet rhythm

  const PLAT_H = 0.3, BASE_Y = PLAT_H;
  const southZ = z0 + COURT / 2 + HALL / 2;

  const plat = new THREE.Mesh(new THREE.BoxGeometry(PLAN + 3, PLAT_H, COURT + WING + HALL + 3), stone);
  plat.position.set(x0, PLAT_H / 2, z0 + (HALL - WING) / 2); g.add(plat);

  /* THE FRAME. South is now HALL deep, not WING — a genuinely different mass from the other
     three, which is the point: the prayer hall is the building and the other three sides are
     the wall that closes the courtyard round it. */
  const south = new THREE.Mesh(new THREE.BoxGeometry(PLAN, AH * 2.0, HALL), stone);
  south.position.set(x0, BASE_Y + AH * 1.0, southZ); g.add(south);
  const north = new THREE.Mesh(new THREE.BoxGeometry(PLAN, AH, WING), stone);
  north.position.set(x0, BASE_Y + AH * 0.5, z0 - (COURT + WING) / 2); g.add(north);
  const eastZ0 = z0 - (COURT + WING) / 2, eastZ1 = southZ + HALL / 2;
  const east = new THREE.Mesh(new THREE.BoxGeometry(WING, AH, eastZ1 - eastZ0), stone);
  east.position.set(x0 + (COURT + WING) / 2, BASE_Y + AH * 0.5, (eastZ0 + eastZ1) / 2); g.add(east);
  const west = new THREE.Mesh(new THREE.BoxGeometry(WING, AH, eastZ1 - eastZ0), stone);
  west.position.set(x0 - (COURT + WING) / 2, BASE_Y + AH * 0.5, (eastZ0 + eastZ1) / 2); g.add(west);

  const yard = new THREE.Mesh(new THREE.BoxGeometry(COURT, 0.1, COURT), paving);
  yard.position.set(x0, BASE_Y + 0.05, z0); g.add(yard);

  [[PLAN, southZ, 'x'], [PLAN, z0 - (COURT + WING) / 2, 'x'],
   [COURT, x0 + (COURT + WING) / 2, 'z'], [COURT, x0 - (COURT + WING) / 2, 'z']]
    .forEach(([span, edge, axis]) => {
      const n = Math.round(span / 1.6);
      for (let i = 0; i < n; i++){
        const t = (i + 0.5) / n * span - span / 2;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, AH * 1.6, 0.22), arch);
        if (axis === 'x') p.position.set(x0 + t, BASE_Y + AH * 0.8, edge - WING * 0.3);
        else               p.position.set(edge, BASE_Y + AH * 0.45, z0 + t);
        g.add(p);
      }
    });

  /* dome() PLACES A HEMISPHERE AND A DRUM AT hy — IT NEVER CONNECTED EITHER TO THE ROOF.

     hy for the main cluster came from hallH + r*1.7, an offset invented in the rebuild and never
     checked against hallH itself. hallH is 4.0; that formula puts the main drum's underside near
     9.9 — 5.9 units of daylight between the wing roof and the dome, which is exactly the floating
     look in the render: domes standing on nothing, the building mass ending well short of them.

     riseFrom FIXES THE CAUSE RATHER THAN THE SYMPTOM. Passed the height of the roof the dome
     actually stands on, it builds a riser cylinder that closes the gap outright — geometrically
     guaranteed to touch both ends, rather than a second offset tuned by eye that could as easily
     under- or overshoot. Real domes on real roofs always have this transitional drum; it was
     never a detail to skip, it was the piece doing the load-bearing work in the silhouette. */
  function dome(dx, dz, r, hy, riseFrom){
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI*2, 0, Math.PI/2), glow);
    d.position.set(x0 + dx, BASE_Y + hy, z0 + dz); d.userData.hero = true; g.add(d);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r*0.86, r*0.86, 0.5, 18), stone);
    drum.position.set(x0 + dx, BASE_Y + hy - 0.25, z0 + dz); g.add(drum);
    if (riseFrom !== undefined && riseFrom < hy - 0.5){
      const riserH = hy - 0.5 - riseFrom;
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(r*0.86, r*0.95, riserH, 18), stone);
      riser.position.set(x0 + dx, BASE_Y + riseFrom + riserH / 2, z0 + dz); g.add(riser);
    }
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 8), glow);
    fin.position.set(x0 + dx, BASE_Y + hy + r + 0.22, z0 + dz); g.add(fin);
  }

  /* THE CLUSTER. Main dome centred on the hall; two large flanks either side, close to it in
     scale rather than a fraction of it; four mid domes stepping down behind them so the roof
     reads as a field rather than three balls in a row; two domed turrets at the hall's own front
     corners, distinct from the four tall minarets at the plan's outer corners. */
  /* southZ IS ABSOLUTE — z0 + (COURT+WING)/2 — AND dome() ADDS z0 ITSELF (z0 + dz). Passed
     straight through, that double-counts z0: invisible at the bench's z0=0, where 0+southZ and
     southZ-z0 give the same number, and wrong by z0 itself — nearly 900 units, at the real anchor.
     The turret and parapet dome calls already subtract z0 correctly a few lines below; these four
     did not, which is why the whole main cluster rendered off in open water on the live site while
     the bench, tested only at the origin, never could have shown it. sZ is that correction. */
  const hallH = AH * 2.0, sZ = southZ - z0;
  dome(0, sZ, MAIN_R, hallH + MAIN_R * 1.7, hallH);
  dome(-MAIN_R * 1.55, sZ - HALL * 0.05, FLANK_R, hallH + FLANK_R * 1.5, hallH);
  dome( MAIN_R * 1.55, sZ - HALL * 0.05, FLANK_R, hallH + FLANK_R * 1.5, hallH);
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sz]) => {
    dome(sx * MAIN_R * 2.7, sZ + sz * HALL * 0.28, MID_R, hallH + MID_R * 1.4, hallH);
  });
  [-1, 1].forEach(sgn => {
    const tx = sgn * (PLAN / 2 - WING * 0.7), tz = southZ + HALL / 2 - WING * 0.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(TURRET_R * 1.05, TURRET_R * 1.15, AH * 1.4, 12), stone);
    base.position.set(x0 + tx, BASE_Y + AH * 0.7, tz); g.add(base);
    dome(tx, tz - z0, TURRET_R, AH * 1.4 + TURRET_R, AH * 1.4);
  });

  /* PARAPET RHYTHM, denser than the first pass — the reference shows the whole hall roofline
     studded near edge to edge, and the arcade wings carry a lighter version of the same rhythm. */
  [[PLAN, southZ, 'x', hallH], [PLAN, z0 - (COURT + WING) / 2, 'x', AH],
   [COURT, x0 + (COURT + WING) / 2, 'z', AH], [COURT, x0 - (COURT + WING) / 2, 'z', AH]]
    .forEach(([span, edge, axis, wh]) => {
      const n = Math.max(6, Math.round(span / 3.2));
      for (let i = 0; i < n; i++){
        const t = (i + 0.5) / n * span - span / 2;
        /* Parapet domes sit proud of the roofline they crown, not buried in it — hy is now the
           roof height PLUS a small rise, matching the same riseFrom logic as the main cluster
           rather than a bare offset that happened to leave these embedded. */
        const hy = wh + SMALL_R * 0.6;
        if (axis === 'x') dome(t, edge - z0, SMALL_R, hy, wh);
        else               dome(edge - x0, t, SMALL_R, hy, wh);
      }
    });

  /* MINARETS — needle-thin, four times the segments' worth of height over width the first pass
     had. Square shaft, octagonal drum, a gallery band, a cylindrical lantern, gold finial. */
  function minaret(dx, dz){
    const w = MW;
    const shaftH = MH * 0.50, octH = MH * 0.18, galleryH = MH * 0.05,
          lanternH = MH * 0.17, finH = MH * 0.10;
    let y = 0;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, shaftH, w), stone);
    shaft.position.set(x0 + dx, BASE_Y + y + shaftH / 2, z0 + dz); g.add(shaft); y += shaftH;
    const oct = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.46, w * 0.5, octH, 8), stone);
    oct.position.set(x0 + dx, BASE_Y + y + octH / 2, z0 + dz); g.add(oct); y += octH;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.42, galleryH, 12), arch);
    gallery.position.set(x0 + dx, BASE_Y + y + galleryH / 2, z0 + dz); g.add(gallery); y += galleryH;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.26, w * 0.34, lanternH, 14), stone);
    lantern.position.set(x0 + dx, BASE_Y + y + lanternH / 2, z0 + dz); g.add(lantern); y += lanternH;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.30, finH, 12), glow);
    cap.position.set(x0 + dx, BASE_Y + y + finH / 2, z0 + dz); g.add(cap); y += finH;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(w * 0.05, MH * 0.03, 6), glow);
    spike.position.set(x0 + dx, BASE_Y + y + MH * 0.015, z0 + dz); g.add(spike);
  }
  /* SAME BUG AS THE DOME CLUSTER, IN A FUNCTION I DID NOT CHECK WHEN I FIXED THAT ONE. mNz and
     mSz are both absolute z-coordinates — mNz starts from z0, mSz starts from southZ, which is
     itself z0-based — and minaret() adds z0 again internally, same as dome() did. Two north
     minarets landed near z0's own offset short of where they should be and two south minarets
     landed nearly z0 short past southZ; at the bench's z0=0 both errors vanish, which is why
     four full minarets were missing from the live site with nothing showing in an isolated test
     built at the origin. Subtracting z0 here matches the correction already applied to the dome
     calls a few lines above. */
  const mcx = PLAN / 2 - INSET;
  const mNz = (z0 - (COURT + WING) / 2 + INSET) - z0, mSz = (southZ + HALL / 2 - INSET) - z0;
  [[-mcx, mNz], [mcx, mNz], [-mcx, mSz], [mcx, mSz]].forEach(([dx, dz]) => minaret(dx, dz));

  [-1, 1].forEach(sgn => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(PLAN * 0.16, 0.08, WING * 0.7), pool);
    p.position.set(x0 + sgn * PLAN * 0.24, BASE_Y + 0.04, z0 - (COURT + WING) / 2 - WING * 0.55);
    g.add(p);
  });

  /* ---------- THE PRECINCT ----------

     Removed for now (see below) — this heading marks where the building's own geometry ends
     and precinct-scale guesses used to begin. Left in place so a future addition lands in the
     same spot with the same discipline: measured, not guessed. */
  /* PRECINCT REMOVED — FORECOURT, FOUNTAIN, DRIVE, AND GARDENS.

     The forecourt (a 47-unit paved disc) and the drive extending from it both reached well past
     the building's own footprint and directly into where the real interchange road actually
     sits on the basemap — confirmed by tracing the rendered shape and checking its bounds
     against the coded geometry: the disc alone spans x:1059-1106, the drive x:1101-1134, and
     the real road is right there too. None of that was measured from anything; it was a
     plausible-sounding plaza that happened to collide with real infrastructure.

     Gardens go too, on the same logic as the parking removal: they were built as a "flank the
     parking lot" companion piece that no longer has a lot to flank, and their own position was
     never independently checked against a reference either. Rather than leave a second unverified
     guess standing after the first one turned out wrong, this waits for real data same as the
     parking. What's left below is the building itself — platform, courtyard, hall, minarets,
     domes, and the two reflecting pools that are part of the hall's own wings — nothing that
     was guessed at precinct scale. */

  /* REAL PRECINCT DATA, TWO LAYERS, BOTH FROM geojson.io TRACES ON SATELLITE IMAGERY.

     Same conversion for both: tools/bake-city.mjs's shared-origin equirectangular projector
     (lat0/lon0 = 24.49/54.42), Corniche's own extent.cx/cy from data/index.json, and the scene's
     M_PER_UNIT = 7.8 — the codebase's own documented pipeline, not a guess. Checked against a
     traced polygon of the building itself before being trusted: that one's centroid landed at
     (1050.8, 804.9) against the tap-verified anchor of (1051, 804), under a unit of error, no
     correction factor needed anywhere.

     A SMALL RESIDUAL TILT AND SEVERAL VERTICES TOO CLOSE TO REAL ROADS — BOTH CHECKED AGAINST
     data/roads-corniche.json DIRECTLY, NOT ESTIMATED. A 1-degree clockwise rotation is baked
     into every offset below (this scene's +x-east/+z-south convention: x'=x·cosθ-z·sinθ,
     z'=x·sinθ+z·cosθ), cutting major-road crossings from 8 to 6 — real, but not the whole
     story. A SINGLE pull-back pass (each close vertex pushed to a fixed 3-unit clearance along
     its nearest major road's own perpendicular) got crossings to 5 and looked done, but wasn't:
     three vertices were still at 0.7 units, essentially touching the road, because pulling one
     point clear of one road can land it closer to a second road the single pass never re-checked.
     Fixed properly with an ITERATED correction instead — re-measure against every major road
     after each pass, keep pushing anything still under a 4-unit clearance, repeat until a full
     pass moves nothing and the segment-intersection test independently confirms zero crossings.
     Converged in 2 iterations. One vertex moved substantially more than the rest (about 10 units,
     roughly 78 real metres) to actually clear the road rather than just approach it — worth a
     visual sanity check against the reference photo specifically there, since it's the one point
     where "matches the trace" and "doesn't cross a live road" pulled hardest against each other,
     and the second was treated as non-negotiable. `cls==='major'` only, throughout — internal
     site driveways are expected to cross a boundary trace and were never counted as violations.
     The hardscape/garden layer needed none of this: zero major-road crossings at 1 degree,
     checked the same way, unchanged.

     THE SHAPE-TO-GROUND ROTATION FLIPS NORTH-SOUTH BY DEFAULT. THREE.Shape builds in its own XY
     plane; rotateX(-PI/2) to lay it flat sends shape-Y to WORLD -Z, not +Z, verified directly
     against THREE.Geometry's own math before trusting it, not assumed. Every offset below has
     its dz term negated at the Vector2 stage for exactly that reason — leave that out and the
     whole precinct mirrors across the building's east-west axis. */
  function tracedGround(offsets, mat, y){
    const shape = new THREE.Shape(offsets.map(([dx, dz]) => new THREE.Vector2(dz, dx)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x0, y, z0);
    g.add(mesh);
  }

  /* POINT-IN-POLYGON, IN THE SAME REAL-WORLD-ALIGNED (dx,dz) SPACE THE offsets ARRAYS THEMSELVES
     USE — standard ray-cast, nothing scene-specific. Needed because scattering markings or
     shrubs across a traced polygon's bounding box would put half of them outside the actual
     traced shape; this keeps only the ones genuinely inside it. */
  function pointInPoly(px, pz, poly){
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
      const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
      const hit = ((zi > pz) !== (zj > pz)) &&
        (px < (xj - xi) * (pz - zi) / (zj - zi) + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  /* WORLD-ALIGNED OFFSET -> RAW OFFSET, THE SAME INVERSE USED FOR THE TRACED SHAPES THEMSELVES.
     Anything placed with x0+dx_raw, z0+dz_raw (the pattern every other mesh in this function
     already uses) gets the wrapper's rotation applied once, same as the building. A point already
     expressed in real-world-aligned terms — which is what pointInPoly needs to test sensibly
     against the traced polygons above — needs the inverse first: world_rel = (-rawZ, rawX), so
     rawX = worldZ, rawZ = -worldX. Same relation verified against THREE.Group's real matrix math
     when tracedGround itself was built; reused here rather than re-derived. */
  function worldToRaw(wx, wz){ return [wz, -wx]; }

  /* PARKING MARKINGS — SHORT PAINTED STROKES ON THE ASPHALT, STYLISED RATHER THAN SURVEYED.
     No trace exists yet for where real stall lines actually run, so this is a regular grid of
     bay dividers at a scale that reads as "marked parking" from altitude, clipped to the site
     polygon so nothing paints itself onto ground outside the traced shape. Not a claim about
     real stall positions — a visual language, same spirit as the old parking lot's tree grid
     before it was pulled for being unmeasured. */
  function parkingMarkings(poly){
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const x0b = Math.min(...xs), x1b = Math.max(...xs);
    const z0b = Math.min(...zs), z1b = Math.max(...zs);
    const rowGap = 6.0, strokeGap = 3.0, strokeLen = 2.2, strokeW = 0.18;
    for (let rz = z0b + rowGap / 2; rz < z1b; rz += rowGap){
      for (let rx = x0b + strokeGap / 2; rx < x1b; rx += strokeGap){
        if (!pointInPoly(rx, rz, poly)) continue;
        const [rawX, rawZ] = worldToRaw(rx, rz);
        const stroke = new THREE.Mesh(new THREE.BoxGeometry(strokeW, 0.03, strokeLen), lineMark);
        stroke.position.set(x0 + rawX, BASE_Y + 0.017, z0 + rawZ);
        g.add(stroke);
      }
    }
  }

  /* GARDEN PATCHES WITHIN THE HARDSCAPE LAYER — bed + shrub clusters over PART of the traced
     shape, not all of it, so "hardscape and gardens" actually reads as both rather than one
     paved tone. No sub-boundary exists yet for exactly which portion is planting versus paving,
     so this samples a grid across the polygon and keeps roughly a third of the inside points,
     clustered rather than scattered uniformly — a checkerboard-ish stride reads as deliberate
     beds, a random third reads as noise.

     DETERMINISTIC, NOT Math.random() — this file already has a convention for exactly this
     (grainHash: "deterministic per-position, so a reload does not reshuffle the estate") and a
     garden that rearranges itself on every load would be worse than the plain paving it replaces.
     Same trick: hash the cell position into a stable pseudo-random unit interval. */
  function cellRnd(gx, gz, salt){
    const h = Math.imul(Math.round(gx * 977) ^ Math.imul(Math.round(gz * 977) + salt, 0x9E3779B1), 0x85EBCA6B);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  function gardenPatches(poly){
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    const x0b = Math.min(...xs), x1b = Math.max(...xs);
    const z0b = Math.min(...zs), z1b = Math.max(...zs);
    const cell = 5.5;
    let col = 0;
    for (let gz = z0b + cell / 2; gz < z1b; gz += cell){
      col++;
      for (let gx = x0b + cell / 2; gx < x1b; gx += cell){
        col++;
        if (col % 3 !== 0) continue;               // keep roughly a third of the grid cells
        if (!pointInPoly(gx, gz, poly)) continue;
        const [rawX, rawZ] = worldToRaw(gx, gz);
        const bed = new THREE.Mesh(new THREE.CircleGeometry(cell * 0.42, 10), gardenBed);
        bed.rotation.x = -Math.PI / 2;
        bed.position.set(x0 + rawX, BASE_Y + 0.021, z0 + rawZ);
        g.add(bed);
        const shrubN = 3 + Math.floor(cellRnd(gx, gz, 1) * 3);
        for (let s = 0; s < shrubN; s++){
          const a = cellRnd(gx, gz, 10 + s) * Math.PI * 2, r = cellRnd(gx, gz, 20 + s) * cell * 0.32;
          const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.38 + cellRnd(gx, gz, 30 + s) * 0.2, 7, 6), shrubMat);
          shrub.position.set(x0 + rawX + Math.cos(a) * r, BASE_Y + 0.24, z0 + rawZ + Math.sin(a) * r);
          g.add(shrub);
        }
      }
    }
  }

  /* LAYER 1 — THE SITE BOUNDARY, NOW ASPHALT WITH PAINTED MARKINGS. Runs mostly west and north
     of the building, which is real, not an artifact: it is the edge of the whole compound
     relative to where the building sits within it, not a shape centred on the mosque. Cleared
     from every real major road by a genuinely generous margin (half the actual 28 m corridor
     width plus a 6-unit safety margin, ~7.8 units total) rather than a fine-tuned minimum —
     checked with the segment-intersection test against data/roads-corniche.json, zero crossings,
     same as before, just with room to spare this time instead of just clearing. */
  const SITE_POLY = [
    [22.89,-64.79],[12.54,-71.98],[12.13,-72.03],[-5.02,-69.9],[-5.31,-69.76],
    [-28.29,-58.85],[-28.62,-58.72],[-46.26,-52.35],[-46.47,-52.29],[-30.88,1.03],
    [-30.98,0.73],[-41.21,62.45],[-41.21,62.45],[9.5,74.33],[9.13,74.31],
    [21.42,71.6],[21.61,71.47],[29.85,61.23],[29.94,61.05],[35.12,43.82],
    [35.16,43.65],
  ];
  tracedGround(SITE_POLY, asphalt, BASE_Y + 0.015);
  parkingMarkings(SITE_POLY);

  /* LAYER 2 — HARDSCAPE AND GARDENS. The closer, organic boundary hugging the building on three
     sides — the ornamental paving and planting immediately around the mosque, inside the site
     edge above. `arch` base for the paving; gardenPatches lays actual planted beds over part of
     the same traced shape rather than leaving it one uniform paved tone. */
  const HARDSCAPE_POLY = [
    [25.93,21.87],[-1.37,28.67],[-1.39,28.63],[-9.95,34.87],[-10.18,34.85],
    [-20.86,34.86],[-21.18,34.66],[-26.52,31.52],[-26.62,31.38],[-31.85,23.67],
    [-31.97,23.47],[-26.87,14.4],[-26.89,14.28],[-25.1,4.61],[-25.28,4.47],
    [-27.36,-2.79],[-27.46,-3.1],[-25.23,-9.63],[-25.33,-9.43],[-24.24,-14.5],
    [-24.37,-14.63],[-31.02,-20.37],[-31.21,-20.54],[-28.89,-26.99],[-29.07,-27.16],
    [-21.58,-27.15],[-21.83,-27.33],[-11.83,-24.16],[-12.05,-24.26],[-1.64,-24.98],
    [-1.9,-25.25],[9.33,-25.97],[9.12,-26.2],[16.65,-29.01],[16.4,-28.98],
    [14.26,-46.76],[14.11,-46.97],[18.3,-50.75],[18.23,-50.96],[30.79,-53.36],
    [30.72,-53.34],[36.57,-8.08],[36.3,-8.36],[20.08,-4.66],[20.04,-4.88],
    [14.93,-3.22],[14.8,-3.23],[15.96,1.56],[15.87,1.42],[33.5,-1.84],
    [33.3,-2.04],[37.78,-1.65],[37.64,-1.96],[37.73,10.59],[37.71,10.49],
    [30.74,13.29],[30.71,13.26],[24.85,14.25],[24.62,14.02],
  ];
  tracedGround(HARDSCAPE_POLY, arch, BASE_Y + 0.02);
  gardenPatches(HARDSCAPE_POLY);

  return g;
}




return { TEX_TOWER, TEX_BLOCK, cityMaterial, curvedTower, roundedSlab,
         etihadTowers, emiratesPalace, qasrAlWatan, adnocHQ, grandMosque, ferrariWorld, yasMall, etihadArena, yasBayPier,
         hiltonYasBay, cafeDelMar, yasBayJetty, boxTower, setbackTower, slabTower, taperTower, cityRow, lowRise };
}
