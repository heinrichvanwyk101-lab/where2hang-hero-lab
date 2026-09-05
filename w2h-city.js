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
export const BUILD = 'city v121';

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
  /* 0x1E1B16, NOT 0x151A1F, AND THE CITY TAKES A x5 ALBEDO LIFT AT NIGHT.

     This is the colour of every generated tower in the scene, and it was authored blue-biased:
     (21, 26, 31), which looks like a sensible near-black cool concrete and is invisible as a tint.
     Lifted five times it is (105, 130, 155) — blue over red by fifty — and that is the slate-teal
     the towers on Al Reem and Al Maryah have been reading as through six attempts at fixing it.

     The same fault was corrected across all six facade families in w2h-world.js at world v236 and
     the towers did not change, because THESE towers are not built there. Al Reem's roads are
     GENERATED and its skyline comes from cityRow and the boxTower family in this file, which have
     their own palette and were never touched. The world file's stamp moved through six versions
     while city stayed at v94, which was the tell.

     Warm-neutral at the same luminance: (30, 27, 22), lifting to (150, 135, 110). Brightness
     unchanged, hue crossed over. */
  mass:    0x1E1B16,
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
  0x1F1C17: 0xA9B6BE,   // ADNOC curtain wall: blue-grey glass, cooler and darker than Etihad's
  0x1E1B16: 0xD3C4A6,   // generic mass: the same precast concrete the fabric uses, so they agree
  0x1B1813: 0xB9BCC0,   // Etihad's solar glass reads as brushed metal against a low sun
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
  0x1F1C17: 0x8FA6B4,   // ADNOC glass: deep blue-grey, plainly darker than its own stone frame
  0x1E1B16: 0xD2CBBE,   // generic mass: matches the fabric's precast
  0x1B1813: 0xB6AE9E,   // Etihad: the same bronze-neutral glass the fabric's towers use
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
      /* LIGHTER RECESSES THAN THE FIRST PASS (0.55 rim, 0.55-0.70 opening). At district range
         the openings are a pixel wide and the texture averages to its recess colour, which
         turned both palaces chocolate brown by day. Halved, the average stays the wall colour. */
      g.fillStyle = 'rgba(150,140,124,0.30)';
      g.beginPath();
      g.moveTo(cx - hw - 1, bot); g.lineTo(cx - hw - 1, top + hw);
      g.quadraticCurveTo(cx - hw - 1, top - 1, cx, top - 1);
      g.quadraticCurveTo(cx + hw + 1, top - 1, cx + hw + 1, top + hw);
      g.lineTo(cx + hw + 1, bot);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(60,58,52,' + (0.28 + rnd()*0.10).toFixed(2) + ')';
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
  /* Matches matPlaceGlass in w2h-world.js, which moved off blue-green for the same reason. */
  const GLASS = 0x1B1813;
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
    /* PALE SILVER-BLUE BY DAY, ITS OWN MATERIAL. cityMaterial's day swap tints the window sheet
       with DAY_BY_NIGHT's dark glass tone, so the five most photographed towers in the city
       rendered as brown slabs by daylight. The real curtain wall is a light grey-blue that reads
       almost white against the sea; the arris and the swept crowns only show when the faces are
       bright enough to shade differently. Low metalness, same lesson as Nation Towers — a
       reflective material goes dark under this sky. */
    const day = new THREE.MeshStandardMaterial({ color:0xCDD9E1, roughness:0.38, metalness:0.08 });
    day.userData.glassOverride = false;
    /* CLONE THE MATERIAL, NOT THE MESH. The first version of this line cloned `m` — a Mesh — and
       assigned it as the material, which day view survived (the swap reads dayMats off whatever
       is there) and night view did not: three's program cache asks the material for
       customProgramCacheKey and a Mesh has none. Visible on the phone as the red error panel. */
    const em = m.material.clone(); em.userData = { ...m.material.userData, dayMats: day, duskColor: 0xB8C7D1, glassOverride:false };
    m.material = em;
    m.position.set(x0 + s.dx, shaft/2, z0 + s.dz);
    /* A FAN, NOT A ROW. Each lens turns a little further than the last so the five faces catch
       the light differently and the cluster reads as five towers rather than one repeated. */
    m.rotation.y = [0.05, 0.32, -0.18, 0.48, 0.20][i];
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
  /* THE GRAND DOME IS THE ONE PIECE ALLOWED TO BE GOLD BY DAY. The measured aerial gave it a
     neutral grey, and that stays true of the 114 small domes; but a grey ball on a pink building
     is not what anyone remembers, and the model has to be recognised from a phone at district
     range. The real dome is silver, gold and glass mosaic that flashes warm in low sun, so the
     day colour is a muted old gold — warm, not lurid. */
  const grand = new THREE.MeshStandardMaterial({
    color:0x2A2216, roughness:0.5, metalness:0.2, emissive:0xE8B547, emissiveIntensity:0.40 });
  grand.userData.duskColor = 0xD9B76A;
  grand.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xD4B36C, roughness:0.45, metalness:0.25 });

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
  /* CENTRED ON THE GRAND DOME'S OWN SEAT, NOT THE RING CENTROID — the dome sat two units off
     the block's axis, which is why it read as a ball dropped near the middle rather than the
     crown of a central pavilion. The block is stepped: the main mass, a set-back upper storey and
     the drum plinth, so the centre climbs to the dome the way the real one does. Containment
     re-checked against the ring at the new centre: all four corners inside, 0.47 units at the
     tightest. */
  const MW = 16.0, MD = 9.5, T2_H = 1.15, T3_H = 0.9;
  const GX = 2.70, GZ = 7.90;          // PALACE_DOMES[4], the grand dome's seat
  const main = new THREE.Mesh(new THREE.BoxGeometry(MW, H_MAIN, MD), stone);
  main.position.set(x0 + GX, H_MAIN/2, z0 + GZ);
  main.rotation.y = PALACE_ROT; g.add(main);
  const tier2 = new THREE.Mesh(new THREE.BoxGeometry(MW * 0.64, T2_H, MD * 0.82), arch);
  tier2.position.set(x0 + GX, H_MAIN + T2_H / 2, z0 + GZ);
  tier2.rotation.y = PALACE_ROT; g.add(tier2);
  const tier3 = new THREE.Mesh(new THREE.CylinderGeometry(3.85, 4.1, T3_H, 24), stone);
  tier3.position.set(x0 + GX, H_MAIN + T2_H + T3_H / 2, z0 + GZ); g.add(tier3);
  /* Corner turrets on the main block, the four small domed pavilions that frame the grand dome. */
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([su, sv]) => {
    const u = su * (MW / 2 - 1.3), v = sv * (MD / 2 - 1.1);
    const px = GX + u * AX - v * AZ, pz = GZ + u * AZ + v * AX;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.1, 12), arch);
    t.position.set(x0 + px, H_MAIN + 0.55, z0 + pz); g.add(t);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 8, 0, Math.PI*2, 0, Math.PI/2), glow);
    d.position.set(x0 + px, H_MAIN + 1.1, z0 + pz); g.add(d);
  });

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
    const dx = px - GX, dz = pz - GZ;
    const u = dx * AX + dz * AZ, v = -dx * AZ + dz * AX;
    if (Math.hypot(u, v) <= 3.85) return H_MAIN + T2_H + T3_H;
    if (Math.abs(u) <= MW * 0.32 && Math.abs(v) <= MD * 0.41) return H_MAIN + T2_H;
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
    [  2.70,  7.90, 4.10],
    [  9.90,  4.90, 1.90],
    [ 18.30,  0.10, 1.90],
    [ 22.50, -8.30, 1.31],
    [ 28.50,-12.50, 1.44],
  ];

  function dome(px, pz, r){
    const roof = roofAt(px, pz), drumH = Math.max(0.35, r * 0.22), base = roof + drumH;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r*0.88, r*0.88, drumH, 20), stone);
    drum.position.set(x0 + px, roof + drumH/2, z0 + pz); g.add(drum);
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 13, 0, Math.PI*2, 0, Math.PI/2), r > 3 ? grand : glow);
    d.position.set(x0 + px, base, z0 + pz); d.userData.hero = true; g.add(d);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), glow);
    fin.position.set(x0 + px, base + r + 0.35, z0 + pz); g.add(fin);
  }
  PALACE_DOMES.forEach(([px, pz, r]) => dome(px, pz, r));

  /* THE 114 DOMES. The wings' parapets are studded with small domes end to end — it is the
     texture that says "palace" before the grand dome is even in view. Walked along the traced
     ring at a steady spacing, set half a unit in from the edge so they sit on the roof rather
     than on the cornice, skipped where the seat would fall under the centre block. */
  { let acc = 0, n = 0;
    for (let i = 0; i < PALACE_RING.length; i++){
      const a = PALACE_RING[i], b = PALACE_RING[(i + 1) % PALACE_RING.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = acc; t < seg; t += 3.0){
        const f = t / seg, ex = a[0] + (b[0] - a[0]) * f, ez = a[1] + (b[1] - a[1]) * f;
        // step inward: the point 0.7 units toward the ring centroid that is still inside
        const dx = CX - ex, dz = CZ - ez, L = Math.hypot(dx, dz) || 1;
        const px = ex + dx / L * 0.7, pz = ez + dz / L * 0.7;
        if (!inRing(px, pz) || roofAt(px, pz) > H_WING) continue;
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI*2, 0, Math.PI/2), glow);
        d.position.set(x0 + px, H_WING + 0.12, z0 + pz); g.add(d);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10), stone);
        drum.position.set(x0 + px, H_WING + 0.0, z0 + pz); g.add(drum);
        if (++n > 140) break;
      }
      acc = (acc - seg) % 3.0; if (acc < 0) acc += 3.0;
    }
  }

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
  /* DoubleSide here too, not just on paveMat itself. Day and Check both swap the mesh's material
     to this exact object — o.material = o.userData.dayMats — rather than tinting paveMat in
     place, which is why setting .side on paveMat alone fixed Dusk (Dusk falls back to the
     original material when no duskMats exists) and nothing else. Missed this the first time by
     checking that the fix worked without checking which of the four view modes actually exercise
     which material object. */
  paveMat.userData.dayMats.side = THREE.DoubleSide;

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
    /* AND ON dayMats TOO — same gap as the DoubleSide fix, same root cause: Day and Check swap
       to a wholly separate material object, so a property set only on paveMat itself never
       reaches the one those two modes actually render with. Missed this the first time despite
       having just fixed the identical class of bug for .side, because I checked "is DoubleSide
       set on both objects" and stopped rather than asking what else the base material carries
       that the swapped one does not. This is very likely the actual cause of "half shows at Day
       and Check" — z-fighting against the ground plane reads as patchy, partial visibility
       rather than a clean on/off, which fits that description better than a binary bug would. */
    paveMat.userData.dayMats.polygonOffset = true;
    paveMat.userData.dayMats.polygonOffsetFactor = -2;
    paveMat.userData.dayMats.polygonOffsetUnits = -2;
    g.add(pave);
  }

  /* THE PLAZA FILL — the piece the ribbons-not-a-plaza comment above named as still missing.
     PALACE_PATHS[3] and [4] are not decoration: plotted together they are the real motor-court
     roundabout and its fountain island, traced the same way PALACE_RING was, and closing each as
     a polygon (they are open route lines, not closed shapes, so the last point is joined straight
     back to the first) turns out to need no correction to read as one — checked by rendering the
     closed pair as a flat 2D fill before this went anywhere near a THREE.Shape: a clean crescent
     plaza with a nested island, no self-intersection, sitting right at the entrance notch between
     the building's two forward wings, which is where the real porte-cochère actually opens onto
     the fountain in every aerial reference. Reuses paveMat rather than a new material so the fill
     and the ribbons already drawn above read as one continuous paved surface, not two abutting
     tones with a seam between them. */
  function closedTracedGround(offsets, mat, yOff){
    /* -pz, NOT pz. Missed this the first time despite naming the function after the pattern it
       was supposed to follow: tracedBand's own comment states it plainly — "Shape y maps to
       world -z on extrude... so the ring's z is negated going in and comes back out correct."
       Without the negation this still compiles, still renders a mesh, and still looks roughly
       plausible on a quick check — which is exactly how it shipped wrong. A live pick confirmed
       it: rendered near (-993,66) against a real target of (-990,111), off by a mirror flip on
       z that reads to the eye as a rotation-and-shift on an asymmetric shape like this crescent,
       not as the reflection it actually is. */
    const shape = new THREE.Shape(offsets.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x0, yOff, z0);
    g.add(mesh);
    return mesh;
  }
  /* DoubleSide on both — a flat ShapeGeometry fill is winding-sensitive in a way the ribbon
     paving above is not (ExtrudeGeometry gives it both a front and back cap regardless of
     winding; ShapeGeometry gives only one face). Checked the actual winding of PALACE_PATHS[3]
     and [4] in the exact (px,-pz) space fed to Vector2 above: both come out clockwise, negative
     signed area, and tracing that through rotateX(-Math.PI/2) puts the front face pointing at
     world -Y — straight down, invisible from any normal camera angle, which is exactly the
     symptom reported: palms correctly tracing the real path shapes, no paved surface visible at
     all. Reversing the point order per-shape would also fix it and was the other option; this is
     the one that does not depend on getting a hand-derived winding correct a second time today. */
  paveMat.side = THREE.DoubleSide;
  closedTracedGround(PALACE_PATHS[3], paveMat, 0.028);
  const fountainMat = new THREE.MeshStandardMaterial({
    color:0x1B3040, roughness:0.35, metalness:0.05, envMapIntensity:0.9 });
  fountainMat.userData.glassOverride = false;
  fountainMat.userData.duskColor = 0x2E5A78;
  fountainMat.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0x3F7A9C, roughness:0.3, metalness:0.05 });
  fountainMat.side = THREE.DoubleSide;
  fountainMat.userData.dayMats.side = THREE.DoubleSide;
  /* Same polygonOffset gap as paveMat, applied preemptively here rather than waiting for a
     second report — the fountain sits even closer to the ground plane (y 0.034) than the ribbon
     paving this pattern was first written for. */
  fountainMat.polygonOffset = true;
  fountainMat.polygonOffsetFactor = -2; fountainMat.polygonOffsetUnits = -2;
  fountainMat.userData.dayMats.polygonOffset = true;
  fountainMat.userData.dayMats.polygonOffsetFactor = -2;
  fountainMat.userData.dayMats.polygonOffsetUnits = -2;
  closedTracedGround(PALACE_PATHS[4], fountainMat, 0.034);
  /* A rim, not a wall — the fountain island sits proud of the plaza by less than the shrub
     height used elsewhere on this landmark, matching how the ribbons themselves stay coplanar
     with the ground rather than kerbed. */

  /* THE GARDEN STRIP — the gap between the building's own traced edge and the plaza's traced
     edge, which the two real shapes above bound on both sides without any invented rectangle:
     inside PALACE_PATHS[3]'s bounding box, outside both PALACE_RING and the plaza polygon
     itself. Diamond beds rather than gardenPatches' round clusters, because Grand Mosque's
     organic planting and the palace's formal parterre are different gardens on purpose — this
     estate reads as clipped hedges in a grid in every aerial, not shrubs in circles. */
  const gardenMat = new THREE.MeshStandardMaterial({ color:0x263A1E, roughness:0.85, metalness:0 });
  gardenMat.userData.glassOverride = false;
  gardenMat.userData.duskColor = 0x3C5A2E;
  gardenMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x44662E, roughness:0.85 });
  function pointInClosed(px, pz, poly){
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  {
    const plaza = PALACE_PATHS[3];
    const xs = plaza.map(p => p[0]), zs = plaza.map(p => p[1]);
    const gx0 = Math.min(...xs), gx1 = Math.max(...xs);
    const gz0 = Math.min(...zs), gz1 = Math.max(...zs);
    const cell = 3.2;
    const bedG = new THREE.BoxGeometry(cell * 0.62, 0.36, cell * 0.62);
    let placed = 0;
    for (let pz = gz0; pz < gz1; pz += cell){
      for (let px2 = gx0; px2 < gx1; px2 += cell){
        const cxp = px2 + cell / 2, czp = pz + cell / 2;
        if (inRing(cxp, czp)) continue;                        // never inside the building
        if (pointInClosed(cxp, czp, plaza)) continue;           // never inside the plaza fill
        if (!pointInClosed(cxp, czp, PALACE_RING)) {
          // Only the narrow ring of ground actually between the two traced shapes, not the
          // whole plaza bounding box — a diamond grid across all of that would bury the ribbons
          // and the fountain in planting rather than framing them.
          const nearBuilding = inRing(cxp + 2.5, czp) || inRing(cxp - 2.5, czp) ||
                                inRing(cxp, czp + 2.5) || inRing(cxp, czp - 2.5);
          if (!nearBuilding) continue;
        }
        const bed = new THREE.Mesh(bedG, gardenMat);
        bed.position.set(x0 + cxp, 0.20, z0 + czp);
        bed.rotation.y = Math.PI / 4;
        g.add(bed);
        placed++;
        if (placed > 260) break;                                // a hard ceiling, not a tuned ideal
      }
      if (placed > 260) break;
    }
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

  /* Piles down both long edges, on the 16 m bay the berths use.

     ONE InstancedMesh, NOT 22 MESHES — and the geometry is built once rather than 22 times. Every
     pile is the same box in the same material differing only by position, which is precisely the
     case InstancedMesh exists for. The old form paid 22 draw calls AND allocated 22 identical
     BoxGeometry objects, on a structure that is 504 triangles in total. Positions below are
     unchanged, instance for instance, so the built shape is identical. */
  const pileGeo = new THREE.BoxGeometry(0.5 / M, 5 / M, 0.5 / M);
  const piles = new THREE.InstancedMesh(pileGeo, pileM, 22);   // 11 bays x 2 edges
  {
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = -5; i <= 5; i++){
      for (const zz of [-W / 2 + 0.3 / M, W / 2 - 0.3 / M]){
        m4.makeTranslation(i * 16 / M, -1.6 / M, zz);
        piles.setMatrixAt(n++, m4);
      }
    }
    piles.count = n;
  }
  g.add(piles);

  /* NINE FINGER BERTHS, seaward side, on a 16 m bay. Timber, low to the water, and the thing that
     makes this read as a marina rather than as a slab of pale concrete in the bay.

     One InstancedMesh each for the fingers and their cleats, same reasoning as the piles: nine
     identical boxes apiece, differing only in x. receiveShadow is carried onto the finger instance
     because the individual finger meshes had it and an InstancedMesh does not inherit it. */
  const fingerGeo = new THREE.BoxGeometry(2.6 / M, 0.7 / M, 26 / M);
  const cleatGeo  = new THREE.BoxGeometry(0.4 / M, 1.9 / M, 0.4 / M);
  const fingers = new THREE.InstancedMesh(fingerGeo, timber, 9);
  const cleats  = new THREE.InstancedMesh(cleatGeo,  pileM,  9);
  fingers.receiveShadow = true;
  {
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let i = -4; i <= 4; i++){
      m4.makeTranslation(i * 16 / M, 0.5 / M, W / 2 + 13 / M);
      fingers.setMatrixAt(n, m4);
      m4.makeTranslation(i * 16 / M, 0.9 / M, W / 2 + 26 / M);
      cleats.setMatrixAt(n, m4);
      n++;
    }
    fingers.count = n; cleats.count = n;
  }
  g.add(fingers);
  g.add(cleats);
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
  /* CREAM, NOT GREY. The grey read as a warehouse from the Yas shot; the real cladding is a
     warm off-white precast, and the car decks below sit a step darker than it. */
  body.userData.duskColor = 0xDCD3C2;
  body.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE4DCCB, roughness:0.85 });

  const glass = new THREE.MeshStandardMaterial({
    color:0x1C2A30, roughness:0.35, metalness:0.2,
    emissive:0xBFE4EC, emissiveIntensity:0.30 });
  glass.userData.duskColor = 0xD6EAF0;
  glass.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xD6EAF0, roughness:0.35, metalness:0.2 });

  const deckMat = new THREE.MeshStandardMaterial({ color:0x14181C, roughness:0.95 });
  deckMat.userData.duskColor = 0xB5AFA2;
  deckMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xBDB7A9, roughness:0.95 });

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
  /* THE GLAZED SPINES. The mall's two main galleries run out from the atrium under continuous
     barrel-vaulted skylights, and they are what the aerials show first: two bright lines crossing
     at the pyramid. Half-cylinders lying on the roof, in the same glass as the pyramid. */
  [[0, 380], [Math.PI / 2, 400]].forEach(([ry, len]) => {
    const v = new THREE.Mesh(new THREE.CylinderGeometry(11 / M, 11 / M, len / M, 14, 1, false, 0, Math.PI), glass);
    v.rotation.set(0, ry, Math.PI / 2, 'YZX');
    v.position.set(0, 28 / M, 0);
    g.add(v);
  });
  /* Deck parapets: a pale kerb round each car deck so the decks read as structures with an edge
     rather than as darker ground. */
  const kerb = new THREE.MeshStandardMaterial({ color:0x2A2823, roughness:0.9 });
  kerb.userData.duskColor = 0xE0DACD;
  kerb.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xEAE4D6, roughness:0.9 });

  /* Car decks. Low, flat, and larger than anything else on the site. */
  for (const [dx, dz, w, dp] of [
      [ 255,  245, 210, 190], [-255,  245, 210, 190],
      [ 255, -245, 210, 190], [-255, -245, 210, 190],
      [   0,  300, 180, 140], [   0, -300, 180, 140]]){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, 13 / M, dp / M), deckMat);
    m.position.set(dx / M, 13 / M / 2, dz / M);
    m.receiveShadow = true;
    g.add(m);
    for (const [kx, kz, kw, kd] of [[0, dp / 2, w, 2.5], [0, -dp / 2, w, 2.5], [w / 2, 0, 2.5, dp], [-w / 2, 0, 2.5, dp]]){
      const k = new THREE.Mesh(new THREE.BoxGeometry(kw / M, 1.6 / M, kd / M), kerb);
      k.position.set((dx + kx) / M, 13.8 / M, (dz + kz) / M); g.add(k);
    }
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

  /* THE TWO SMALLER DOMES. Each flanking pavilion carries its own dome over its centre — in the
     photographs the three domes in a row across the front are what says "Qasr Al Watan" rather
     than "another palace". Seated on each flank ring's own centroid so they cannot miss the
     roof, on a drum, at a little over half the great dome's radius. */
  [QASR_FLANK_W, QASR_FLANK_E].forEach(ring => {
    let cx = 0, cz = 0; ring.forEach(([px, pz]) => { cx += px; cz += pz; });
    cx /= ring.length; cz /= ring.length;
    const rr = R_DOME * 0.58, dh = 0.9;
    const dr = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.92, rr * 1.0, dh, 20), stone);
    dr.position.set(x0 + cx, H_PAV + dh / 2, z0 + cz); g.add(dr);
    const dm = new THREE.Mesh(new THREE.SphereGeometry(rr, 20, 12, 0, Math.PI*2, 0, Math.PI/2), domeMat);
    dm.position.set(x0 + cx, H_PAV + dh, z0 + cz); g.add(dm);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 8), domeMat);
    f2.position.set(x0 + cx, H_PAV + dh + rr + 0.3, z0 + cz); g.add(f2);
  });

  /* THE ARCADE. The ground floor of every wing is a colonnade of white arches; walked along the
     main ring and both flanks at a steady spacing, on the forecourt side only (+z), the same
     rule the palace uses for its garden-side colonnade. Each column stands a little proud of the
     wall so the shadow line reads. */
  const colMat = corniceMat;
  [[QASR_MAIN, 14], [QASR_FLANK_W, -12], [QASR_FLANK_E, -26]].forEach(([ring, minZ]) => {
    let cx = 0, cz = 0; ring.forEach(([px, pz]) => { cx += px; cz += pz; });
    cx /= ring.length; cz /= ring.length;
    let acc = 0;
    for (let i = 0; i < ring.length; i++){
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = acc; t < seg; t += 1.6){
        const f = t / seg, px = a[0] + (b[0] - a[0]) * f, pz = a[1] + (b[1] - a[1]) * f;
        if (pz < minZ) continue;
        const nx = px - cx, nz = pz - cz, L = Math.hypot(nx, nz) || 1;
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.9, 0.42), colMat);
        c.position.set(x0 + px + nx / L * 0.28, 0.95, z0 + pz + nz / L * 0.28); g.add(c);
      }
      acc = (acc - seg) % 1.6; if (acc < 0) acc += 1.6;
    }
  });

  /* THE FORECOURT — AND UNLIKE THE PALACE, THERE IS NO PALACE_PATHS TABLE HERE TO RECOVER.
     Nothing traced this estate's own drives the way geojson.io traced the palace's, so this is
     a genuine parametric construction sized off QASR_MAIN's own measured footprint, not a
     rediscovery of hidden real data — a meaningfully lower-confidence piece of work than the
     palace forecourt was, and worth saying so rather than presenting it with the same certainty.

     THE ORIENTATION IS AN ASSUMPTION, NAMED AS ONE. QASR_MAIN's own traced ring reaches its
     deepest point on the +z side (z=30.57), which is also where the dome sits (domeDz=15.25) —
     consistent with the dome standing over the forecourt-facing side the way Emirates Palace's
     does, but inferred from the building's own shape rather than confirmed against a second
     independent source the way the palace forecourt's direction was. Built on the +z side on
     that basis; if a live pick shows it facing the wrong way, the fix is a single sign flip on
     every dz below, the same class of correction the palace forecourt itself needed.

     SAME SIGN CONVENTION AS traced() ABOVE — Vector2(px, -pz) — copied deliberately this time
     rather than re-derived, after getting exactly this wrong on the palace forecourt by writing
     a comment that claimed the pattern without actually copying the line that makes it work. */
  const paveMat = new THREE.MeshStandardMaterial({ color:0x141210, roughness:0.94, metalness:0 });
  paveMat.userData.glassOverride = false;
  paveMat.userData.duskColor = 0xCBBDB2;
  paveMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xD3C6BC, roughness:0.94 });
  function closedGround(offsets, mat, yOff){
    const shape = new THREE.Shape(offsets.map(([px, pz]) => new THREE.Vector2(px, -pz)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x0, yOff, z0);
    g.add(mesh);
  }
  /* A wide axis plus a plaza circle, the same composition the palace forecourt uses, scaled to
     this building's own larger footprint (87.7 wide against the palace's 64.3) rather than
     copying the palace's absolute dimensions onto a different building. */
  const FRONT_Z = 31.0;                    // just past QASR_MAIN's own deepest traced point
  const AXIS_HW = 14.0, PLAZA_R = 20.0;
  const plazaCz = FRONT_Z + 8 + PLAZA_R;
  /* QASR_ROT — measured, not assumed, after the axis-aligned version reported as visibly off.
     QASR_MAIN carries no named rotation constant the way PALACE_ROT exists for the palace, which
     reads as "axis-aligned" but is not: found by taking every edge of QASR_MAIN, sorting by
     length, and checking the angle of the longest ones. They cluster in two tight, genuinely
     perpendicular groups (73.5-75.9 degrees and 163.5-166.2 degrees, 90.0 degrees apart) rather
     than scattering, which is what a real rectilinear building's own long walls should do and a
     coincidence would not. The dominant cluster averages 163.55 degrees against this shape's own
     axis-aligned assumption of 180 — a -16.45 degree rotation, matching two independent live
     pick-tool measurements (roughly -14 and -15.5 degrees) closely enough that three separate
     measurements now agree rather than one guess standing alone. Checked as a 2D render against
     QASR_MAIN's own outline before this went into real geometry: the paved axis lands directly
     against the building's own protruding link to the dome block, not floating off at an angle. */
  const QASR_ROT = -0.28713159522809534;
  const qc = Math.cos(QASR_ROT), qs = Math.sin(QASR_ROT);
  function qrot(dx, dz){ return [dx * qc - dz * qs, dx * qs + dz * qc]; }
  const axisPoly = [
    [-AXIS_HW, FRONT_Z], [AXIS_HW, FRONT_Z], [AXIS_HW, plazaCz], [-AXIS_HW, plazaCz],
  ].map(([dx, dz]) => qrot(dx, dz));
  /* DoubleSide for the same reason the palace forecourt needed it — checked, both axisPoly and
     plazaCircle come out clockwise in this exact coordinate space too, same invisible-from-above
     result via rotateX(-Math.PI/2). Set once, before either shape is built, since paveMat is
     shared between them. */
  paveMat.side = THREE.DoubleSide;
  paveMat.userData.dayMats.side = THREE.DoubleSide;
  /* polygonOffset, applied proactively this time rather than after a second bug report — the
     palace forecourt turned out to need this on both the base material and its dayMats variant
     (Day and Check swap to dayMats entirely, so a property set only on the base never reaches
     what those two modes actually render with), and this shape sits at the same y 0.028, close
     enough to the ground plane to be exposed to the identical z-fighting. */
  paveMat.polygonOffset = true; paveMat.polygonOffsetFactor = -2; paveMat.polygonOffsetUnits = -2;
  paveMat.userData.dayMats.polygonOffset = true;
  paveMat.userData.dayMats.polygonOffsetFactor = -2;
  paveMat.userData.dayMats.polygonOffsetUnits = -2;
  closedGround(axisPoly, paveMat, 0.028);
  const CIRC_N = 28;
  const plazaCircle = [];
  for (let i = 0; i < CIRC_N; i++){
    const a = (i / CIRC_N) * Math.PI * 2;
    plazaCircle.push(qrot(Math.cos(a) * PLAZA_R, plazaCz + Math.sin(a) * PLAZA_R));
  }
  closedGround(plazaCircle, paveMat, 0.028);
  const monumentMat = new THREE.MeshStandardMaterial({
    color:0x1B1712, roughness:0.55, metalness:0.1 });
  monumentMat.userData.glassOverride = false;
  monumentMat.userData.duskColor = 0xD9D2C6;
  monumentMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE0DAD0, roughness:0.5 });
  const monument = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 4.5, 12), monumentMat);
  const [monX, monZ] = qrot(0, plazaCz);
  monument.position.set(x0 + monX, 2.25, z0 + monZ); g.add(monument);

  /* Diamond garden beds either side of the axis, between the building's own traced edge and the
     plaza — the same "bounded by two real-or-real-enough shapes rather than an invented
     rectangle" approach as the palace, though here one of those two shapes (the axis polygon
     just built) is itself parametric rather than traced, so the bound is one step further from
     real data than the palace's was. */
  const gardenMat = new THREE.MeshStandardMaterial({ color:0x263A1E, roughness:0.85, metalness:0 });
  gardenMat.userData.glassOverride = false;
  gardenMat.userData.duskColor = 0x3C5A2E;
  gardenMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0x44662E, roughness:0.85 });
  const cell = 3.4;
  const bedG = new THREE.BoxGeometry(cell * 0.62, 0.36, cell * 0.62);
  for (let side = -1; side <= 1; side += 2){
    for (let pz = FRONT_Z + 2; pz < plazaCz + PLAZA_R + 2; pz += cell){
      for (let px2 = AXIS_HW + 1.5; px2 < AXIS_HW + 1.5 + 18; px2 += cell){
        const czp = pz + cell / 2, cxp = side * (px2 + cell / 2);
        // Skip anything that would fall inside the circular plaza — the x-range above overlaps
        // the circle's own bounding box near its edge, so distance-from-centre is the real test,
        // not just the rectangular bed strip's own bounds. Local, unrotated coordinates here,
        // matching plazaCz's own local frame — rotation is applied only at final placement below.
        const distToCircle = Math.hypot(cxp, czp - plazaCz);
        if (distToCircle < PLAZA_R + 1.5) continue;
        const [wx, wz] = qrot(cxp, czp);
        const bed = new THREE.Mesh(bedG, gardenMat);
        bed.position.set(x0 + wx, 0.20, z0 + wz);
        bed.rotation.y = Math.PI / 4 + QASR_ROT;
        g.add(bed);
      }
    }
  }

  /* THE COMPOUND, TO THE CAPTURE (city v121): the perimeter wall with its domed corner
     pavilions and the gate on the axis, small domes along every wing's parapet, and the
     reflective pools and lawns inside the wall either side of the approach. All in the
     building's own rotated frame through qrot. */
  { const W2 = 66, DN = -54, DS = 84, GATE = 15;
    const lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0), water2 = saadKitMat(0x2E6A78, 0x4FA9BC, 0.2, 0.1, 0x7FE0F0, 0.12);
    const wall = (dx, dz, len, along) => { const [px, pz] = qrot(dx, dz); const m = new THREE.Mesh(new THREE.BoxGeometry(along ? len : 0.9, 1.3, along ? 0.9 : len), stone); m.position.set(x0 + px, 0.65, z0 + pz); m.rotation.y = -QASR_ROT; g.add(m); };
    wall(0, DN, 2 * W2, true);
    wall(-(GATE + (W2 - GATE) / 2), DS, W2 - GATE, true); wall((GATE + (W2 - GATE) / 2), DS, W2 - GATE, true);
    wall(-W2, (DN + DS) / 2, DS - DN, false); wall(W2, (DN + DS) / 2, DS - DN, false);
    for (const [dx, dz] of [[-W2, DN], [W2, DN], [-W2, DS], [W2, DS], [-GATE, DS], [GATE, DS]]){
      const [px, pz] = qrot(dx, dz);
      const pav = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 4.6), stone); pav.position.set(x0 + px, 1.8, z0 + pz); pav.rotation.y = -QASR_ROT; g.add(pav);
      const dm = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dm.position.set(x0 + px, 3.6, z0 + pz); g.add(dm);
    }
    for (const [dx, dz, w, d] of [[-36, 62, 26, 7], [36, 62, 26, 7]]){
      const [px, pz] = qrot(dx, dz);
      const lw = new THREE.Mesh(new THREE.BoxGeometry(w + 14, 0.3, d + 14), lawn); lw.position.set(x0 + px, 0.15, z0 + pz); lw.rotation.y = -QASR_ROT; g.add(lw);
      const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), water2); pl.position.set(x0 + px, 0.35, z0 + pz); pl.rotation.y = -QASR_ROT; g.add(pl);
    }
    for (const [ring, hh] of [[QASR_MAIN, H_WING], [QASR_FLANK_W, H_PAV], [QASR_FLANK_E, H_PAV]]){
      let cx = 0, cz = 0; ring.forEach(([px, pz]) => { cx += px; cz += pz; }); cx /= ring.length; cz /= ring.length;
      let acc = 0;
      for (let i = 0; i < ring.length; i++){
        const a = ring[i], b = ring[(i + 1) % ring.length], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = acc; t < seg; t += 3.2){
          const f = t / seg, ex = a[0] + (b[0] - a[0]) * f, ez = a[1] + (b[1] - a[1]) * f;
          const dx = cx - ex, dz = cz - ez, L = Math.hypot(dx, dz) || 1, px = ex + dx / L * 0.7, pz = ez + dz / L * 0.7;
          const dm = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dm.position.set(x0 + px, hh + 0.15, z0 + pz); g.add(dm);
        }
        acc = (acc - seg) % 3.2; if (acc < 0) acc += 3.2;
      }
    }
  }

  return g;
}

/* MARINA MALL — the anchor for this landmark landed exactly on a 355 x 294.6 m building record
   carrying a 76-point real polygon, 2.1 km from ADNOC and clear of every other hand-built
   landmark on the island (nearest gap 193 units to Qasr Al Watan). Same discovery as Emirates
   Palace: the footprint was already in data/isle-corniche.json and nothing needed surveying.

   THE ROUND WEST LOBE IS THE SKY TOWER'S ROTUNDA, IDENTIFIED RATHER THAN GUESSED. Ten of the
   ring's own points trace a clean arc — fitted by least squares, centre (-14.48, -6.90) relative
   to the building's own centroid, radius 6.34 units (49.5 m), residual under 0.7 units on a
   49.5 m arc. That is a real architectural rotunda, not an artefact of the trace, and it is
   visible in the same place in the aerial screenshot this landmark was requested from: the round
   structure west of the main block, by "AL KASIR". The tower is seated there, not at whatever
   point in the polygon happens to have the most open floor around it — a lesson paid for on
   Qasr Al Watan's dumbbell plan, where the anchor itself sat in a link corridor. Here there was
   a real clue and it was followed instead of computing past it.

   TOWER HEIGHT IS THE ONE SOURCED FIGURE: 100 m, confirmed by more than one independent source
   describing the free public viewing deck and its glass lift — "100 meter hoge Sky Tower... in
   het midden van het winkelcentrum". Not a proportion table, an actual reported height.

   WING HEIGHT IS NOT SOURCED AND SAYS SO. The bake's own record carries h:10, which is 1.28
   units and implausible for a multi-storey retail complex — almost certainly an incomplete OSM
   height tag rather than the real figure. 2.9 units (22.6 m) is a reasoned estimate for a
   G+3/4 mall of this footprint, not a measured one. Worth confirming against a source or a
   reference photo before this is treated as settled the way the palace's ring height was. */
const MALL_RING = [
    [  9.22,-16.49], [  2.26,-19.90], [ -0.18,-14.92], [  0.23,-14.64],
    [ -0.14,-13.92], [ -0.64,-14.64], [ -0.88,-13.18], [ -1.17,-13.67],
    [ -2.03,-11.68], [ -2.35,-12.13], [ -2.59,-10.91], [ -3.88,-10.63],
    [ -3.91, -9.38], [ -4.92, -9.17], [ -4.33, -8.78], [ -5.76, -8.41],
    [ -5.13, -8.09], [ -6.22, -7.85], [ -5.79, -7.58], [ -6.49, -7.33],
    [ -7.08, -8.95], [ -9.17,-10.74], [-11.87,-12.21], [-14.85,-12.95],
    [-17.44,-12.62], [-19.59,-11.35], [-20.77, -9.06], [-20.87, -7.78],
    [-19.72, -4.76], [-16.55, -1.41], [-13.04, -0.14], [-10.50, -0.04],
    [-10.49, -0.44], [ -9.76, -0.47], [ -9.55,  0.96], [ -9.97,  0.72],
    [ -9.53,  1.77], [-10.01,  1.59], [ -9.69,  2.67], [-10.60,  3.64],
    [-10.08,  4.72], [-10.77,  5.53], [-10.18,  5.50], [-11.05,  6.37],
    [-10.56,  6.44], [-11.68,  8.32], [-11.19,  8.49], [-14.05, 14.17],
    [ -7.18, 17.50], [ -4.74, 12.49], [ -2.35, 11.69], [  1.10, 13.37],
    [ -1.12, 18.49], [  3.94, 20.96], [  4.77, 22.18], [  6.68, 22.67],
    [ 12.01, 25.31], [ 18.17, 12.29], [ 20.06, 10.78], [ 20.86,  8.42],
    [ 20.62,  7.09], [ 26.96, -5.69], [ 24.23, -6.91], [ 24.38, -7.27],
    [ 20.96, -9.38], [ 16.44,-11.26], [ 16.22,-10.87], [ 13.54,-12.27],
    [ 11.06, -7.32], [  7.59, -9.04], [  6.78,-11.44],
];
const MALL_ROT = -0.4520;
const TOWER_SEAT = [8.73, 4.3];

function marinaMall(x0, z0){
  const g = new THREE.Group();
  const H_WING = 2.90;               // 22.6 m — REASONED, NOT SOURCED. See header note.
  const PLINTH_H = 0.34, CORNICE_H = 0.16;

  /* A shopping mall's real facade is storefront glazing, not masonry — TEX_TOWER's grid is the
     right family for that, not the arch texture built for the two palaces. cityMaterial already
     wires the day/dusk/night split correctly for this texture; nothing new needed here. */
  const plinthMat = new THREE.MeshStandardMaterial({ color:0x100E0A, roughness:0.9, metalness:0 });
  plinthMat.userData.glassOverride = false;
  plinthMat.userData.duskColor = 0xC7BFAE;
  plinthMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCFC7B4, roughness:0.9 });
  const corniceMat = new THREE.MeshStandardMaterial({
    color:0x1C1C1A, roughness:0.6, emissive:0xEDE7DC, emissiveIntensity:0.05 });
  corniceMat.userData.glassOverride = false;
  corniceMat.userData.duskColor = 0xEDEAE2;
  corniceMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF0EDE5, roughness:0.6 });
  const facadeMat = cityMaterial(TEX_TOWER, 1, 1, 0.5, 0xE0DCCC);

  const sh = new THREE.Shape();
  MALL_RING.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
  function band(h, mat, yOff, withUV){
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    geo.rotateX(-Math.PI/2); geo.computeVertexNormals();
    if (withUV) writeSlabUVs(geo, sh, 12, h);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x0, yOff, z0); g.add(m);
    return m;
  }
  band(PLINTH_H, plinthMat, 0);
  const body = band(H_WING - PLINTH_H - CORNICE_H, facadeMat, PLINTH_H, true);
  body.userData.hero = true;
  band(CORNICE_H, corniceMat, H_WING - CORNICE_H);

  /* THE TENSILE ROOF CLUSTER — the thing every reference photo actually leads with, and the
     thing a flat cornice cannot produce. Every angle of this building shows the same cluster of
     white conical fabric roofs standing proud of the retail block, and the model had none.

     SEATED IN THE EAST WING, VERIFIED INSIDE THE RING WITH 51 M OF CLEARANCE — not centred on
     the whole building, because the mall's own plan is a T with the rotunda and Sky Tower on the
     west arm; putting a second major feature on top of the first would crowd a silhouette that
     already has its landmark. The photos also show the tent cluster as a distinct massing from
     the tower, consistent with seating it in the other wing.

     FIVE CONES, ONE TALL AND FOUR SHORTER, echoing the real cluster's massing rather than
     copying an exact count — there is no survey of how many bays the real roof has, only that it
     reads as one dominant peak among several lower ones. Each cone sits on its own short drum so
     the fabric appears to rise FROM the roofline rather than sit on it like a hat. */
  const tentMat = new THREE.MeshStandardMaterial({
    color:0x141210, roughness:0.55, emissive:0xE8DCC8, emissiveIntensity:0.10 });
  tentMat.userData.glassOverride = false;
  tentMat.userData.duskColor = 0xEFE9DC;
  tentMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF4F0E6, roughness:0.55 });
  const TENT_X = 16, TENT_Z = -3;
  /* SPACED ALONG A ROW NOW, NOT PILED ON ONE POINT. Every offset was within 2.7 units of the
     centre while the radii ran 2.0 to 3.6 — adjacent bases summed to more than the distance
     between their centres, so they didn't stand as separate tents, they nested into one mound.
     The photos show a loose line of distinct peaks with sky between the bases; this is that,
     checked against the ring at all four points (27 to 53 m of clearance, all clear). */
  const tents = [[-6.5, -1.3, 1.7, 2.3], [-2.4, 0.6, 2.5, 3.2],
                 [1.9, 0.4, 2.1, 2.7], [6.0, -1.0, 1.6, 2.1]];
  /* A STRAIGHT CONE IS A PARTY HAT, NOT A TENSILE ROOF, and that is the whole difference between
     this and the reference photos. Real fabric droops CONCAVE between its high point and its
     support ring — it is held up at the peak and pulled down at the edge, so the profile curves
     inward, not a straight taper. A LatheGeometry over a profile that bows in gives that curve
     directly, at no extra draw cost over the cone it replaces. */
  function tentProfile(r, h){
    const pts = [];
    for (let i = 0; i <= 10; i++){
      const t = i / 10;
      // Concave: at t=0 (base) radius r; at t=1 (peak) radius 0. Bowed IN along the way by
      // shaping with t^0.6 rather than a straight t — the exponent under 1 is what pulls the
      // mid-profile inward instead of tracing the cone's own straight side.
      pts.push(new THREE.Vector2(r * (1 - Math.pow(t, 0.6)), t * h));
    }
    return pts;
  }
  tents.forEach(([dx, dz, r, h]) => {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.4, 16), plinthMat);
    drum.position.set(x0 + TENT_X + dx, H_WING + 0.2, z0 + TENT_Z + dz); g.add(drum);
    const tent = new THREE.Mesh(new THREE.LatheGeometry(tentProfile(r, h), 16), tentMat);
    tent.position.set(x0 + TENT_X + dx, H_WING + 0.4, z0 + TENT_Z + dz);
    tent.userData.hero = true; g.add(tent);
  });

  /* SKY TOWER. Slender shaft, a glass viewing pod near the top, a thin mast above it — the
     three things every source agrees on: slim profile, a public deck, a glass lift running the
     shaft. Apex fixed at the sourced 100 m; the shaft length is 100 m minus the rotunda roof it
     rises from, not a free constant. */
  const towerMat = new THREE.MeshStandardMaterial({
    color:0x14161A, roughness:0.35, metalness:0.25, emissive:0xE8D9A8, emissiveIntensity:0.06 });
  towerMat.userData.duskColor = 0xC7CDD2;
  towerMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCDD2D6, roughness:0.35, metalness:0.15 });

  /* THE FUNNEL WAS MISSING ENTIRELY, AND IT IS THE MOST RECOGNISABLE PART OF THIS BUILDING.
     Every reference photo leads with it: a huge flared skirt with a scalloped, petalled rim,
     easily 50-plus metres across at the base, that the tower's own shaft rises out of. The
     previous version had the shaft starting straight from the roof at 4.7 to 6.6 m across —
     correct as a SHAFT, but with nothing around its foot. A pole reading as a pole is not the
     same fault as a pole that should have been a funnel and wasn't one at all.

     BUILT AS A LATHE, flaring from the shaft's own base radius to a wide skirt rim over a real
     height rather than a thin disc — the photos show this occupying a substantial fraction of
     the tower's visible height, not a token collar. */
  const FUNNEL_H = 3.4, FUNNEL_R = 6.8;
  const funnelPts = [];
  for (let i = 0; i <= 12; i++){
    const t = i / 12;
    // Concave-then-flare, the same trumpet-bell curve real tensile funnels have: tight near the
    // shaft, opening out fast near the rim. t^2.2 keeps the top narrow and throws the widening
    // to the last third of the height, which is what the photos show.
    funnelPts.push(new THREE.Vector2(0.85 + (FUNNEL_R - 0.85) * Math.pow(t, 2.2), (1 - t) * FUNNEL_H));
  }
  const funnel = new THREE.Mesh(new THREE.LatheGeometry(funnelPts, 24), towerMat);
  funnel.position.set(x0 + TOWER_SEAT[0], H_WING, z0 + TOWER_SEAT[1]);
  funnel.userData.hero = true; g.add(funnel);

  /* THE SCALLOPED RIM — a ring of flattened, overlapping petals round the funnel's wide edge.
     This is the ribbed, flower-like silhouette that makes the skirt read as fabric rather than
     as a plain cone; a smooth circular edge was tried first (visible in the bench render) and
     did not read as the same structure at all. Petal count chosen so adjacent petals overlap:
     18 petals at this radius overlap by roughly a third, which is what closes the gaps between
     them into a continuous scalloped edge instead of leaving triangular gaps. */
  const petalMat = cityMaterial(TEX_TOWER, 1, 1, 0.35, 0xD8DCDD);
  const PETAL_N = 18, PETAL_LEN = 1.5;
  for (let i = 0; i < PETAL_N; i++){
    const a = (i / PETAL_N) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.ConeGeometry(PETAL_LEN * 0.62, PETAL_LEN, 3), petalMat);
    petal.scale.y = 0.30;                    // flattened into a wedge, not a spike
    petal.rotation.z = Math.PI / 2;          // point the cone outward, not upward
    petal.rotation.y = -a;
    const px = Math.cos(a) * (FUNNEL_R - 0.3), pz = Math.sin(a) * (FUNNEL_R - 0.3);
    petal.position.set(x0 + TOWER_SEAT[0] + px, H_WING + 0.15, z0 + TOWER_SEAT[1] + pz);
    g.add(petal);
  }

  const podMat = cityMaterial(TEX_TOWER, 1, 1, 0.6, 0x141C22);

  /* SHAFT WIDTH IS ALSO UNSOURCED, AND THE FIRST PASS PICKED SOMETHING TOO THIN TO SEE. 0.34 to
     0.46 units is 2.7 to 3.6 m across — a flagpole, not a structure with a glass lift and a
     stair core inside it. 0.60 to 0.85 (4.7 to 6.6 m) is still slender against a 100 m height
     — a 15:1 ratio — but it is a shaft a building could actually be. Now rises from the TOP of
     the funnel rather than from the roof, since the funnel occupies that space instead. */
  const APEX = 100 / M_PER_U;                          // 12.82 u — the one sourced figure
  const shaftBase = H_WING + FUNNEL_H, podY = APEX - 1.5, shaftTop = podY - 0.3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.85, shaftTop - shaftBase, 16), towerMat);
  shaft.position.set(x0 + TOWER_SEAT[0], shaftBase + (shaftTop - shaftBase)/2, z0 + TOWER_SEAT[1]);
  shaft.userData.hero = true; g.add(shaft);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.25, 1.5, 20), podMat);
  pod.position.set(x0 + TOWER_SEAT[0], podY, z0 + TOWER_SEAT[1]); g.add(pod);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, APEX - podY - 0.75, 8), towerMat);
  mast.position.set(x0 + TOWER_SEAT[0], podY + 0.75 + (APEX - podY - 0.75)/2, z0 + TOWER_SEAT[1]); g.add(mast);

  return g;
}

/* THE TWO TOWERS, TRACED FROM THE DEVELOPER'S OWN SITE PLAN, NOT ESTIMATED. Tapered boxes were
   a placeholder; the real footprints are bent slabs, each with a wing angled off the main run —
   confirmed by the plan's own legend: 28 is Fairmont Marina RESORTS (the hotel), 29 is Fairmont
   Marina RESIDENCES (the apartments), two separately named buildings sharing one arch.

   PIPELINE: colour-masked the plan's highlighted footprints, traced their boundaries (scikit-
   image marching squares), converted pixel to metres via the plan's own printed graphic scale
   (1:750, verified against the scale bar's own tick spacing), then rotated the pair so the line
   between their centroids matches this building's real heading — already known from the OSM
   podium ring, which stays geo-referenced even though these two shapes now override its guess
   at the towers themselves. Simplified to ~26 points each afterward.

   THE GAP BETWEEN THEM IS MEASURED, NOT ASSUMED: 39 m between the two inner tip faces, found by
   taking each tower's own extreme corner region rather than eyeballing a midpoint. Every arch
   dimension below is built from that figure, not from a separate guess that happened to agree
   with it. */
const YELLOW_TOWER = [
    [ -3.51,  0.20], [ -3.39,  0.67], [ -3.57,  1.23], [ -4.47,  2.14],
    [ -5.24,  2.46], [ -5.62,  2.24], [ -5.78,  2.76], [ -7.34,  3.71],
    [ -7.32,  3.93], [ -7.62,  4.13], [ -7.94,  4.79], [ -8.60,  5.37],
    [ -9.35,  5.12], [ -9.57,  4.76], [ -9.47,  4.64], [ -9.63,  4.63],
    [ -9.46,  4.49], [ -9.66,  4.19], [ -9.56,  3.70], [ -9.11,  2.72],
    [ -8.30,  1.78], [ -7.86,  1.75], [ -7.59,  1.49], [ -6.76,  1.14],
    [ -6.52,  1.19], [ -4.78,  0.31], [ -4.11,  0.11],
];
const RED_TOWER = [
    [ 11.65, -2.38], [ 11.85, -1.72], [ 11.24, -0.75], [  9.86, -1.00],
    [  7.32, -2.04], [  6.17, -2.09], [  6.06, -1.81], [  5.63, -1.94],
    [  5.56, -1.76], [  5.25, -1.78], [  4.06, -1.20], [  3.18, -1.14],
    [  1.85, -1.37], [  1.61, -1.95], [  1.77, -2.35], [  2.21, -2.76],
    [  6.45, -4.31], [  7.37, -4.24], [  9.12, -3.58], [  9.15, -3.41],
    [  9.26, -3.68], [  9.39, -3.47], [  9.94, -3.40], [ 10.12, -3.17],
    [ 10.61, -3.08],
];
/* Face spans, plan-view, in scene units: the flat-ish region at each tower's tip that faces the
   other tower and that the arch actually springs from. */
const YELLOW_FACE = { x: -3.389, z0: 0.108, z1: 2.136 };
const RED_FACE    = { x: 1.607, z0: -2.759, z1: -1.369 };

function fairmontMarina(x0, z0){
  const g = new THREE.Group();
  const APEX = 161.9 / M_PER_U;                 // 20.76 u — CTBUH-sourced, to tip
  const H_PODIUM = 0.30;                        // a thin plinth only; the traced shapes ARE the mass now

  const towerMat = palaceFacadeMat(0xE6D9C2, 0xE0D2B8, 0.20);
  const plinthMat = new THREE.MeshStandardMaterial({ color:0x100E0A, roughness:0.9, metalness:0 });
  plinthMat.userData.glassOverride = false;
  plinthMat.userData.duskColor = 0xC7BFAE;
  plinthMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCFC7B4, roughness:0.9 });
  const turretMat = new THREE.MeshStandardMaterial({
    color:0x1C170F, roughness:0.6, emissive:0xE8D9A8, emissiveIntensity:0.10 });
  turretMat.userData.glassOverride = false;
  turretMat.userData.duskColor = 0xEBE2D0;
  turretMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xEEE6D6, roughness:0.6 });
  const goldMat = new THREE.MeshStandardMaterial({
    color:0x2A2008, roughness:0.35, metalness:0.55, emissive:0xC99A3C, emissiveIntensity:0.22 });
  goldMat.userData.glassOverride = false;
  goldMat.userData.duskColor = 0xD9B25C;
  goldMat.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xC9A542, roughness:0.35, metalness:0.55 });

  /* TURRET_RISE IS FIXED BY THE TURRET'S OWN CONSTRUCTION BELOW — drum 0.5 + dome radius 0.70 +
     spike 0.55, worked through the actual offsets used there: drum top springY+0.5, dome top
     springY+1.2, spike tip springY+1.755. springY is SOLVED from that so the turret spike — the
     real highest point on this building — lands on the CTBUH apex exactly, the same discipline
     used everywhere else a sourced figure exists in this file. */
  const TURRET_RISE = 1.755;
  const springY = APEX - TURRET_RISE;
  const FINIAL_H = 0.5;

  /* BOTH TOWERS BUILT THE SAME WAY: traced ring, extruded to springY, real UVs so the facade
     texture tiles in metres the way every other traced mass in this file does. No taper — the
     real bend in plan already gives the massing shape variety a tapered box was faking. */
  function buildTower(ring, faceRef){
    const sh = new THREE.Shape();
    ring.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
    function band(h, mat, yOff, withUV){
      const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI/2); geo.computeVertexNormals();
      if (withUV) writeSlabUVs(geo, sh, 10, h);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x0, yOff, z0); g.add(m);
      return m;
    }
    band(H_PODIUM, plinthMat, 0);
    const body = band(springY - H_PODIUM, towerMat, H_PODIUM, true);
    body.userData.hero = true;

    /* FIN RIBS, WALKED ALONG THE RING'S OWN BOUNDARY instead of guessed across a flat box face —
       the real shape bends, so a fixed rib spacing in one axis would either miss the wing
       entirely or run through open air past the footprint's edge. Walking the perimeter means
       ribs follow the actual wall regardless of which segment of the bend they land on. */
    let acc = 0;
    for (let i = 0; i < ring.length; i++){
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const segLen = Math.hypot(b[0]-a[0], b[1]-a[1]);
      for (let t = acc; t < segLen; t += 1.3){
        const f = t / segLen;
        const px = a[0] + (b[0]-a[0])*f, pz = a[1] + (b[1]-a[1])*f;
        const nx = (b[1]-a[1]) / segLen, nz = -(b[0]-a[0]) / segLen;   // outward normal
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, springY - H_PODIUM, 0.14), turretMat);
        rib.position.set(x0 + px + nx*0.08, H_PODIUM + (springY - H_PODIUM)/2, z0 + pz + nz*0.08);
        g.add(rib);
      }
      acc = (acc - segLen) % 1.3; if (acc < 0) acc += 1.3;
    }

    /* TURRETS AT THE RING'S OWN TWO OUTER CORNERS. The naive "two most-distant points overall"
       measure was tried first and put one turret at the INNER face — the tower's long main run
       is longer than its wing, so one end of that long run and the wing's own tip can be the
       single farthest pair on the whole ring, and on both towers that "one end" happened to be
       the face the lintel attaches to. Confirmed on the built mesh: a gold dome sitting on top
       of the arch connection. Excluding any ring point within 2.5 units of the tower's own
       inner face before measuring finds the two genuine outer corners instead — the far end of
       the main run and the tip of the wing, which is what every reference photo shows. */
    const faceZ = (faceRef.z0 + faceRef.z1) / 2;
    const outer = ring.filter(([px, pz]) => Math.hypot(px - faceRef.x, pz - faceZ) > 2.5);
    let maxD = 0, c1 = outer[0], c2 = outer[0];
    for (let i = 0; i < outer.length; i++) for (let j = i+1; j < outer.length; j++){
      const dd = Math.hypot(outer[i][0]-outer[j][0], outer[i][1]-outer[j][1]);
      if (dd > maxD){ maxD = dd; c1 = outer[i]; c2 = outer[j]; }
    }
    [c1, c2].forEach(([ox, oz]) => {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.85, 0.5, 16), turretMat);
      drum.position.set(x0 + ox, springY + 0.25, z0 + oz); g.add(drum);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.70, 16, 10, 0, Math.PI*2, 0, Math.PI/2), goldMat);
      cap.position.set(x0 + ox, springY + 0.5, z0 + oz); cap.userData.hero = true; g.add(cap);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.55, 6), goldMat);
      spike.position.set(x0 + ox, springY + 0.5 + 0.70 + 0.28, z0 + oz); g.add(spike);
    });
  }
  buildTower(YELLOW_TOWER, YELLOW_FACE);
  buildTower(RED_TOWER, RED_FACE);

  /* THE ARCH SPANS EXACTLY THE MEASURED GAP BETWEEN THE TWO REAL INNER FACES — 39 m, not a
     formula. Its legs sit flush against each tower's own tip, continuous with that wall rather
     than a separate block landing somewhere near it, which is what "starting off the inner
     vertical face of one tower and attaching to the other" means built literally: the lintel's
     width IS the gap, no more, no less, and its two ends are pinned to YELLOW_FACE.x and
     RED_FACE.x exactly. */
  /* THE LINTEL WAS BUILT ALONG A PURE X-AXIS AND THE TWO FACES ARE NOT AT THE SAME Z.
     midZ averaged all four z-bounds together, which put the lintel at a z roughly BETWEEN the
     two towers rather than running the real line connecting them — because that line is not
     parallel to x at all. Measured: yellow's face centre sits at z 1.12, red's at z -2.06, a
     3.19-unit (25 m) offset that a fixed-z, x-only span cannot bridge correctly no matter how
     its width is chosen. This is the actual cause of "right shape, wrong positioning" — the
     lintel's shape was fine, its orientation was wrong, built as if the two towers faced each
     other squarely along one axis when the real ones meet at roughly 32 degrees off that. */
  const yFaceZ = (YELLOW_FACE.z0 + YELLOW_FACE.z1) / 2;
  const rFaceZ = (RED_FACE.z0 + RED_FACE.z1) / 2;
  const faceDX = RED_FACE.x - YELLOW_FACE.x, faceDZ = rFaceZ - yFaceZ;
  const trueGap = Math.hypot(faceDX, faceDZ);
  const faceHeading = Math.atan2(faceDZ, faceDX);
  const midX = (YELLOW_FACE.x + RED_FACE.x) / 2, midZ = (yFaceZ + rFaceZ) / 2;
  /* The lintel shape is still authored flat along its own local x, exactly as before — only now
     it is rotated by faceHeading so that local x actually runs along the real line between the
     two face centres, the same convention every other rotated mass in this file uses. */
  /* WIDENED BY 0.15 u (1.2 m) PER SIDE PAST THE MEASURED FACE GAP, DELIBERATELY. The unmodified
     gap put the lintel's overlap with each tower at exactly 0.00 on measurement — genuinely
     flush, which is what was asked for, but flush-to-the-millimetre in this file's own units is
     one rounding error in the real renderer away from a hairline gap that was not there when it
     was checked here. The overlap is added to the SOLID leg only; OPEN_W below is still sized
     off the true, unwidened gap, so the opening itself stays at the measured 46 m rather than
     inheriting the safety margin. */
  const OVERLAP = 0.15;
  const LINTEL_W = trueGap + OVERLAP * 2;
  const LINTEL_T = 1.6;
  /* LINTEL_H IS NOW A REASONED PROPORTION, NOT SOLVED BACKWARD FROM A HEIGHT BUDGET — because
     the budget it used to be solved from was wrong. The old version anchored the lintel's
     BOTTOM at springY and let it rise further, which put the entire connecting structure
     ABOVE the towers' own peak — a whole extra tier balanced on top of them, not what any
     reference photo shows. Every photo has the towers rising almost to their own full height,
     with the arch capping them from within that height, not standing past it. 2.6 units (20 m)
     is a plausible band for that cap relative to a ~137 m tower height. */
  const LINTEL_H = 2.6;
  const OPEN_W = trueGap * 0.46, OPEN_H = LINTEL_H * 0.62;

  const lintelSh = new THREE.Shape();
  lintelSh.moveTo(-LINTEL_W/2, 0);
  lintelSh.lineTo(LINTEL_W/2, 0);
  lintelSh.lineTo(LINTEL_W/2, LINTEL_H * 0.88);
  lintelSh.quadraticCurveTo(0, LINTEL_H * 1.06, -LINTEL_W/2, LINTEL_H * 0.88);
  lintelSh.closePath();

  const openSh = new THREE.Path();
  const ox0 = -OPEN_W/2, ox1 = OPEN_W/2, springLine = OPEN_H * 0.30, apexPt = OPEN_H;
  openSh.moveTo(ox0, 0);
  openSh.lineTo(ox0, springLine);
  openSh.quadraticCurveTo(ox0, apexPt, 0, apexPt);
  openSh.quadraticCurveTo(ox1, apexPt, ox1, springLine);
  openSh.lineTo(ox1, 0);
  openSh.lineTo(ox0, 0);
  lintelSh.holes.push(openSh);

  const lintelGeo = new THREE.ExtrudeGeometry(lintelSh, { depth: LINTEL_T, bevelEnabled: false });
  lintelGeo.translate(0, 0, -LINTEL_T / 2);
  lintelGeo.computeVertexNormals();
  writeSlabUVs(lintelGeo, lintelSh, 10, LINTEL_H);
  const lintel = new THREE.Mesh(lintelGeo, towerMat);
  /* THE FIX ITSELF: position.y is now springY MINUS the shape's TRUE peak height, so the
     PEDIMENT'S TOP lands at springY — the same level the tower walls stop and the turrets
     begin — instead of the shape's BASE landing there. The lintel now hangs down from the
     towers' own peak into their solid mass rather than rising as a separate block above it.
     Confirmed this was the actual complaint, not a rendering artefact: "0 gap bottom of
     bridge to top of building, instead of 0 gap TOP of bridge to top of building."

     THE PEAK FACTOR IS 0.97, NOT 1.06 — the control point at (0, LINTEL_H*1.06) does not sit
     ON the curve; quadraticCurveTo's actual apex at t=0.5 is 0.25*P0y + 0.5*Cy + 0.25*P1y with
     P0y=P1y=LINTEL_H*0.88, which works out to LINTEL_H*0.97. Using the control point's own
     height as a stand-in for the curve's height was the exact 0.234-unit (1.8 m) shortfall
     measured on the first version of this fix — assumed correct, then checked, then wrong. */
  lintel.position.set(x0 + midX, springY - LINTEL_H * 0.97, z0 + midZ);
  lintel.rotation.y = -faceHeading;
  lintel.userData.hero = true; g.add(lintel);

  /* pedimentPeakY is now just springY, since that is where the lintel's own peak was placed
     above — kept as a named value for clarity at the call site below. The finial rises a
     modest amount from there, well clear of the turret spike tips at APEX, so it reads as a
     small ornament rather than competing with the turrets for the building's actual top. */
  const pedimentPeakY = springY;
  const key = new THREE.Mesh(new THREE.ConeGeometry(0.35, FINIAL_H, 8), goldMat);
  key.position.set(x0 + midX, pedimentPeakY + FINIAL_H / 2, z0 + midZ);
  g.add(key);

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
    cityMaterial(TEX_TOWER, 1, 1, 0.55, 0x1F1C17));
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
  /* PALE CONCRETE, NOT TARMAC. The near-black asphalt of the first pass was the biggest thing in
     every frame of the mosque — two black fields either side of a white building, which is what
     the eye went to. The real car parks and coach aprons are light paving and sand-coloured
     concrete; by daylight they are barely darker than the marble. Markings go darker so they
     still read as a car park rather than a plaza. */
  const asphalt = new THREE.MeshStandardMaterial({
    color:0x1E1C19, roughness:0.9, emissive:0xCFC8B8, emissiveIntensity:0.10 });
  asphalt.userData.duskColor = 0xCFC8B8;
  asphalt.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xD6D0C2, roughness:0.9 });
  const lineMark = new THREE.MeshStandardMaterial({
    color:0x8F887A, roughness:0.6, emissive:0xB8B1A2, emissiveIntensity:0.12 });
  lineMark.userData.duskColor = 0xB0A998;
  lineMark.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xA9A292, roughness:0.6 });
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

  /* MINARETS AT 18 UNITS (140 m against the real 107 m) AND 20:1, NOT 14 UNITS AT 30:1. The
     30:1 needle was true to the drawings and invisible from the district shot — a 0.58-unit
     shaft is under a pixel at that range. This is a model that must read from 3 km up on a
     phone, so the four towers are lifted a quarter and thickened by half. Same logic as the
     domes below: the silhouette is the identity, and the silhouette has to be visible. */
  const MH   = AH * 9.0;                // 18.0
  const MW   = MH * 0.052;              // ~20:1, thick enough to survive the far shot
  const INSET = AH * 0.9;

  const MAIN_R  = AH * 2.4;             // main dome, 4.8 units — the visual anchor from any range
  const FLANK_R = MAIN_R * 0.72;        // two large flanks, close to the main in scale
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
  dome(0, sZ, MAIN_R, hallH + MAIN_R * 1.45, hallH);   // drum top 11 units, dome top 15.8 — under the minarets, as built
  dome(-MAIN_R * 1.5, sZ - HALL * 0.05, FLANK_R, hallH + FLANK_R * 1.6, hallH);
  dome( MAIN_R * 1.5, sZ - HALL * 0.05, FLANK_R, hallH + FLANK_R * 1.6, hallH);
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

  /* THE REFLECTIVE POOLS. The mosque is famous for the sheets of water that wrap the arcades
     on the east and west, doubling the columns at dusk; they are the second thing after the
     domes in every postcard. Two long pools hugging the east and west wings for the full depth
     of the plan, with a white kerb, plus a third across the north front. */
  const POOL_W = WING * 0.9, kerb = 0.35;
  [-1, 1].forEach(sgn => {
    const px = x0 + sgn * (PLAN / 2 + POOL_W / 2 + kerb + 0.3), len = eastZ1 - eastZ0;
    const k = new THREE.Mesh(new THREE.BoxGeometry(POOL_W + kerb * 2, 0.16, len + kerb * 2), stone);
    k.position.set(px, BASE_Y + 0.08, (eastZ0 + eastZ1) / 2); g.add(k);
    const p = new THREE.Mesh(new THREE.BoxGeometry(POOL_W, 0.08, len), pool);
    p.position.set(px, BASE_Y + 0.14, (eastZ0 + eastZ1) / 2); g.add(p);
  });
  { const pz = z0 - (COURT + WING) / 2 - WING / 2 - POOL_W * 0.55 - kerb - 0.3;
    const k = new THREE.Mesh(new THREE.BoxGeometry(PLAN * 0.86 + kerb * 2, 0.16, POOL_W * 0.55 + kerb * 2), stone);
    k.position.set(x0, BASE_Y + 0.08, pz); g.add(k);
    const p = new THREE.Mesh(new THREE.BoxGeometry(PLAN * 0.86, 0.08, POOL_W * 0.55), pool);
    p.position.set(x0, BASE_Y + 0.14, pz); g.add(p); }

  /* THE COURTYARD ARCADE. The sahn is ringed by a colonnade of pointed arches on all four sides;
     the pillars above stood alone without the roof that joins them. A shallow roof slab bridges
     each row and an inner parapet lifts the wing wall behind it, so the wings read as an arcade
     around a court rather than four solid blocks. */
  [[PLAN, z0 - (COURT + WING) / 2, 'x', southZ], [PLAN, southZ, 'x', z0 - (COURT + WING) / 2],
   [COURT, x0 + (COURT + WING) / 2, 'z', 0], [COURT, x0 - (COURT + WING) / 2, 'z', 0]]
    .forEach(([span, edge, axis]) => {
      const roof = new THREE.Mesh(axis === 'x'
        ? new THREE.BoxGeometry(span, 0.25, WING * 0.34)
        : new THREE.BoxGeometry(WING * 0.34, 0.25, span), arch);
      if (axis === 'x') roof.position.set(x0, BASE_Y + AH * 1.6, edge - WING * 0.3);
      else               roof.position.set(edge, BASE_Y + AH * 0.9, z0);
      g.add(roof);
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

  /* THE COMPOUND, TO THE SATELLITE (city v121). Raw frame, like every mesh above: the hall is
     at +z, the entrance front at -z. The formal garden axis runs out from the front with its
     long pool and palm rows; the two big car parks lie beyond the reflective pools either side,
     under rows of shade canopies; the fountain plaza and its gardens sit behind the hall. */
  { const lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0), pave2 = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0);
    const shade = saadKitMat(0xD9CBA8, 0xEEDFBC, 0.8, 0), water2 = saadKitMat(0x2E6A78, 0x4FA9BC, 0.2, 0.1, 0x7FE0F0, 0.12);
    const box = (dx, dz, w, d, h, mat, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x0 + dx, (y || 0) + h / 2, z0 + dz); g.add(m); return m; };
    const palms = [];
    const nz = -(COURT + WING) / 2 - WING / 2 - POOL_W * 0.55 - kerb - 1.2;   // just beyond the front pool
    box(0, nz - 22, 18, 42, 0.3, lawn, BASE_Y);
    box(0, nz - 22, 2.6, 38, 0.2, water2, BASE_Y + 0.3);
    for (const sx of [-1, 1]){ box(sx * 6, nz - 22, 1.2, 42, 0.25, pave2, BASE_Y + 0.3); for (let t = 0; t < 42; t += 3) palms.push([x0 + sx * 8, z0 + nz - 2 - t]); }
    for (const sx of [-1, 1]){
      const cx = sx * (PLAN / 2 + POOL_W + 4 + 13);
      box(cx, 4, 26, 44, 0.2, pave2, BASE_Y);
      for (let r = -18; r <= 18; r += 6){ box(cx - 6, 4 + r, 10, 2.2, 0.12, shade, BASE_Y + 1.3); box(cx + 6, 4 + r, 10, 2.2, 0.12, shade, BASE_Y + 1.3); }
      for (let t = -20; t <= 20; t += 4) palms.push([x0 + cx + sx * 13.5, z0 + 4 + t]);
    }
    const fz = southZ + HALL / 2 + 9;
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.2, 32), pave2); plaza.position.set(x0, BASE_Y + 0.1, z0 + fz); g.add(plaza);
    const fnt = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 32), water2); fnt.position.set(x0, BASE_Y + 0.25, z0 + fz); g.add(fnt);
    for (const sx of [-1, 1]) box(sx * 13, fz, 12, 12, 0.3, lawn, BASE_Y);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) palms.push([x0 + Math.cos(a) * 9.5, z0 + fz + Math.sin(a) * 9.5]);
    kitPalms(g, palms, 0.8);
  }

  return g;
}




/* ALDAR HQ — "the coin building," Al Raha Beach. First circular building of its kind in the
   Middle East, MZ Architects, completed 2010.

   NOT A FLAT DISC — every real source agrees on that, independently and in the same words: "two
   circular shaped convex [faces], joined by a narrow strip of corrugated glass," described
   elsewhere as looking "like a glass and steel Oreo standing on its side." Two gently bulging
   round faces meeting at a continuous edge is a lens, not a coin — the flat-faced cylinder this
   session's first instinct would reach for is the wrong primitive before a single triangle is
   drawn.

   THREE REAL NUMBERS, NOT ONE, AND THEY DON'T DESCRIBE A PERFECT CIRCLE. Height 110 m: four
   independent sources agree in the same words ("rises 110 metres above grade") and the bake's
   own surveyed record carries h:110 on the matching footprint — a fifth, independent agreement.
   Two other sources cite 121 m instead, evidently copying one another rather than two separate
   measurements, and are outvoted five to two. Width and depth come from that same surveyed
   footprint: 140.1 x 39.0 m, position 35 m from Aldar HQ's own published coordinates. A building
   140 m across and only 110 m tall is not a circle standing on edge — it is a flattened lens,
   wider than it is tall, which is exactly what "two convex faces" over "one flat coin" implies
   once the numbers are read rather than assumed. The 39 m depth is the lens's own thickness at
   its fattest point — the "narrow strip" the sources describe, narrow only relative to a
   140-metre span. */
/* AL RAHA MALL — built from photographs, and every number below is read off them rather than
   sourced, which is the opposite of aldarHQ above and is said plainly here so nobody later mistakes
   one for the other. Footprint and rotation ARE surveyed (182.7 x 86.8 m, rot 0.2950, from
   LM_RAHA.rahaMall); heights and the bay rhythm are proportion taken from elevation photos.

   WHAT MAKES IT RECOGNISABLE, in the order a person actually identifies it:
     1. a long, low, pale-pink mass — it is wider than it is tall by a factor of eight
     2. a repeating rank of tall pointed arches glazed in teal, the one strong colour on it
     3. pale crescent spandrels flanking each arch, which is why the arches read as leaf shapes
     4. small pointed finials standing above the parapet at the pier between bays
     5. a raised central entrance pavilion carrying the signage

   Without the arches and the finials this is a beige box, and a beige box is exactly what the
   generic fabric already produced. The whole reason to hand-build it is items 2 to 4. */
function rahaMall(x0, z0){
  const g = new THREE.Group();
  const W   = 182.7 / M_PER_U;          // surveyed
  const D   =  86.8 / M_PER_U;          // surveyed
  const ROT = 0.2950;                   // surveyed
  const H   =  19.0 / M_PER_U;          // parapet, proportion off the elevation
  const HE  =  26.0 / M_PER_U;          // entrance pavilion ridge

  const stoneMat = new THREE.MeshStandardMaterial({ color:0x6E5A55, roughness:0.9 });
  stoneMat.userData.glassOverride = false;
  stoneMat.userData.nightAlbedo = 1.5;   // stays pink at night instead of lifting to white (city v114)
  stoneMat.userData.duskColor = 0xC9A79C;
  stoneMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE0BDB2, roughness:0.9 });

  const paleMat = new THREE.MeshStandardMaterial({ color:0x7A6A62, roughness:0.85 });
  paleMat.userData.glassOverride = false;
  paleMat.userData.nightAlbedo = 1.6;
  paleMat.userData.duskColor = 0xE4D3C8;
  paleMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF0E2D6, roughness:0.85 });

  /* THE TEAL. This is the only saturated colour on the building and it is what the eye locks
     onto, so it is carried through all three views exactly as Aldar HQ's blue-green is. */
  /* PALE STONE SAILS, NOT TEAL GLASS (city v116). The photographs show the arches as big
     cream panels standing proud of the pink body, nearly full height, with the pink piers
     between them. They glow a soft warm white at night. */
  const glassMat = new THREE.MeshStandardMaterial({
    color:0x8C8478, roughness:0.7, metalness:0.05, emissive:0xFFE8C8, emissiveIntensity:0.28 });
  glassMat.userData.glassOverride = false;
  glassMat.userData.duskColor = 0xE4D8C4;
  glassMat.userData.nightAlbedo = 1.0;
  glassMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xEFE6D8, roughness:0.7, metalness:0.05 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), stoneMat);
  body.position.set(x0, H/2, z0);
  body.rotation.y = ROT;
  body.userData.hero = true;
  g.add(body);
  /* A PLINTH THAT REACHES BELOW GRADE. The mall stands where the shore paint and the beach drop
     meet, and from the Raha shot the box read as hovering over the sand on its seaward end. A
     dark base course a unit deep closes any gap between the box and whatever the ground does. */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 1.4, D + 0.6), paleMat);
  plinth.position.set(x0, -0.5, z0); plinth.rotation.y = ROT; g.add(plinth);

  /* THE BAYS. Nine across the long frontage, which is the count the elevation photo reads at and
     gives a pier width close to the arch width — the rhythm in the photograph is near enough to
     one-to-one. Each bay is a teal panel with a cone above it for the pointed head, sat a hair
     proud of the wall so it never z-fights the mass it is applied to. */
  const BAYS = 9;
  const bayW = (W * 0.86) / BAYS;
  const archW = bayW * 0.74;
  const archH = H * 0.86;
  const eps = 0.04;
  const cos = Math.cos(ROT), sin = Math.sin(ROT);
  const place = (m, ax, az, ay) => {
    m.position.set(x0 + ax*cos + az*sin, ay, z0 - ax*sin + az*cos);
    m.rotation.y = ROT;
    g.add(m);
  };
  for (let i = 0; i < BAYS; i++){
    const ax = (i - (BAYS-1)/2) * bayW;
    for (const side of [1, -1]){
      const az = side * (D/2 + eps);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(archW, archH, 0.02), glassMat);
      place(panel, ax, az, archH/2);
      const head = new THREE.Mesh(new THREE.ConeGeometry(archW/2, archW*0.75, 3), glassMat);
      head.rotation.x = Math.PI/2 * (side > 0 ? 1 : -1);
      place(head, ax, az, archH + archW*0.30);
      head.rotation.y = ROT;
    }
    /* FINIALS on the pier between bays, not above the bay centre — in the photographs they stand
       over the solid masonry, which is what makes them read as buttress caps rather than spires. */
    if (i < BAYS - 1){
      const px = ax + bayW/2;
      for (const side of [1, -1]){
        const cap = new THREE.Mesh(new THREE.ConeGeometry(bayW*0.10, bayW*0.42, 4), paleMat);
        place(cap, px, side * (D/2 - 0.3), H + bayW*0.21);
      }
    }
  }

  /* THE ENTRANCE PAVILION — taller, pushed slightly forward, and gabled. It carries the signage
     in every photograph and is the only place the long horizontal line is broken. */
  const eW = W * 0.15, eD = D * 0.16;
  const ent = new THREE.Mesh(new THREE.BoxGeometry(eW, HE, eD), paleMat);
  place(ent, 0, D/2 - eD/2 + 0.5, HE/2);
  const gable = new THREE.Mesh(new THREE.ConeGeometry(eW*0.62, eW*0.34, 4), stoneMat);
  gable.rotation.y = Math.PI/4;
  place(gable, 0, D/2 - eD/2 + 0.5, HE + eW*0.17);
  gable.rotation.y = ROT + Math.PI/4;

  const door = new THREE.Mesh(new THREE.BoxGeometry(eW*0.7, HE*0.45, 0.02), glassMat);
  place(door, 0, D/2 + 0.55, HE*0.24);
  /* the corner turrets: a round tower with a cone at each end of the front */
  for (const sx of [-1, 1]){
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, H + 1.2, 12), paleMat);
    place(t, sx * (W/2 - 1.6), D/2 - 0.6, (H + 1.2) / 2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3, 1.6, 12), stoneMat);
    place(cone, sx * (W/2 - 1.6), D/2 - 0.6, H + 1.2 + 0.8);
  }
  return g;
}


function aldarHQ(x0, z0){
  const g = new THREE.Group();
  /* A COIN, NOT AN EGG (city v97). The lens was 140 m wide by 110 m tall — the surveyed footprint
     width includes the podium, and the building itself is a circle, 121 m across, which is the
     one fact everyone knows about it. Width now equals height, and the lens sinks 6 m into the
     plinth so the circle rises from an entrance rather than balancing on a point. */
  const R_THICK = (39.0 / 2) / M_PER_U;    // the lens's own thickness — "the narrow strip"
  const R_TALL  = (121  / 2) / M_PER_U;    // the circle's radius: diameter 121 m, sourced
  const R_WIDE  = R_TALL;
  const SINK    = 6 / M_PER_U;
  const ROT = -1.2780;                         // surveyed rotation, radians
  /* THE GLASS IS PALE, NOT TEAL, AND THAT IS WHAT MADE IT DISAPPEAR. 0x2E8B96 is the colour of
     the building's own reflection of the sea in a certain light; from the district shot the
     coin sat in front of the canal in exactly that colour and read as a hole. Photographs at
     noon show a silver-blue curtain wall with a white diagrid over it, lighter than the water
     and the sky. So the day glass is light, strongly reflective, and carries the diagrid as a
     texture; dusk keeps it light; night goes to dark steel with the diagrid cells lit. */
  const tex = (() => {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    /* THE BLUE LIVES IN THE TEXTURE, the mullions over it. A map multiplies the material colour,
       so white lines over a dark blue material came out blue: the lattice was invisible. With
       the glass blue painted here and the material colour white by day, the lines stay white. */
    c.fillStyle = '#1B3D70'; c.fillRect(0, 0, N, N);   // navy, per the photographs (city v116); it was a mid blue
    /* the diagrid: two families of diagonals at +-60 degrees, eight bays across the tile */
    c.strokeStyle = 'rgba(242,246,247,0.98)'; c.lineWidth = 14;
    const step = N / 8;
    for (let k = -8; k <= 16; k++){
      c.beginPath(); c.moveTo(k * step, 0); c.lineTo(k * step + N * 0.577, N); c.stroke();
      c.beginPath(); c.moveTo(k * step, 0); c.lineTo(k * step - N * 0.577, N); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    /* six diamonds across each face: twelve bays round the circumference over an eight-bay tile */
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.4, 2.2);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const lit = (() => {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    c.fillStyle = '#000000'; c.fillRect(0, 0, N, N);
    /* lit cells behind the diagrid, most of them, a few dark */
    const step = N / 8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++){
      if ((x * 7 + y * 13) % 5 === 0) continue;
      c.fillStyle = (x + y) % 3 ? '#C9E4EE' : '#9FC6D6';
      c.fillRect(x * step + 6, y * step + 6, step - 12, step - 12);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.4, 2.2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glassMat = new THREE.MeshStandardMaterial({
    color:0x3C4C62, map:tex, roughness:0.22, metalness:0.45, envMapIntensity:1.2,
    emissive:0xFFFFFF, emissiveMap:lit, emissiveIntensity:0.32 });
  glassMat.userData.glassOverride = true;
  glassMat.userData.duskColor = 0xCFDCEC;
  glassMat.userData.duskRough = 0.20; glassMat.userData.duskMetal = 0.40;
  glassMat.userData.duskEnv = 1.3;
  glassMat.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xFFFFFF, map:tex, roughness:0.20, metalness:0.35, envMapIntensity:1.0 });
  const geo = new THREE.SphereGeometry(1, 48, 32);
  geo.scale(R_THICK, R_TALL, R_WIDE);
  geo.computeVertexNormals();
  const lens = new THREE.Mesh(geo, glassMat);
  lens.position.set(x0, R_TALL - SINK, z0);
  lens.rotation.y = ROT;
  lens.userData.hero = true;
  g.add(lens);
  /* THE ZIPPER — the corrugated glass strip every source names as its own element, distinct from
     the two faces it joins. A thin torus, scaled the same non-uniform way as the lens so it
     traces the lens's own equator (its widest cross-section, at half height) rather than a
     circular ring that would sit proud of the surface on the long axis and buried in it on the
     short one. */
  const zipperMat = new THREE.MeshStandardMaterial({
    color:0x14181C, roughness:0.4, metalness:0.5, emissive:0xC9D4DC, emissiveIntensity:0.06 });
  zipperMat.userData.glassOverride = false;
  zipperMat.userData.duskColor = 0xB8C2CA;
  zipperMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xC4CDD4, roughness:0.4, metalness:0.4 });
  const zipGeo = new THREE.TorusGeometry(1, 0.045, 10, 48);
  zipGeo.scale(R_THICK, 1, R_WIDE);
  zipGeo.rotateX(Math.PI / 2);
  const zipper = new THREE.Mesh(zipGeo, zipperMat);
  zipper.position.set(x0, R_TALL - SINK, z0);
  zipper.rotation.y = ROT;
  g.add(zipper);
  /* THE RIM — the white steel band round the coin's edge, the thing that outlines the circle in
     every photograph and keeps the silhouette legible when the glass happens to match the sky.
     A fat torus in the face plane at the lens's outline; the two glass faces bulge out of it. */
  const rimMat = new THREE.MeshStandardMaterial({ color:0x4A5258, roughness:0.45, metalness:0.35, emissive:0xDDE6EA, emissiveIntensity:0.06 });
  rimMat.userData.glassOverride = false;
  rimMat.userData.duskColor = 0xE4E9EC;
  rimMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF6F8FA, roughness:0.35, metalness:0.2 });
  const rimGeo = new THREE.TorusGeometry(R_TALL * 0.985, R_THICK * 0.28, 10, 96);   // y/z plane after rotateY
  rimGeo.rotateY(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.position.set(x0, R_TALL - SINK, z0);
  rim.rotation.y = ROT;
  g.add(rim);
  /* THE PLINTH, sized to the real podium: the entrance block the circle rises out of, wider than
     the lens is thick and long enough to hold it. Pale stone by day. */
  const plinthMat = new THREE.MeshStandardMaterial({ color:0x1A1A18, roughness:0.85 });
  plinthMat.userData.glassOverride = false;
  plinthMat.userData.duskColor = 0xC4BEA8;
  plinthMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCEC8B2, roughness:0.85 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(R_THICK * 3.2, 0.8, R_WIDE * 1.5), plinthMat);
  plinth.position.set(x0, 0.4, z0);
  plinth.rotation.y = ROT;
  g.add(plinth);
  return g;
}


/* =============================================================================================
   SAADIYAT CULTURAL DISTRICT (city v98) — five museums as one composition.

   Positions come from the survey where it has them (Zayed National Museum, Manarat) and from the
   published coordinates where it does not (the Louvre sits in the water off a coastline the
   survey draws without its platform; the Guggenheim is a site). Each piece is a silhouette first:
   the Louvre's flat perforated dome over white boxes on a platform in the sea, the five falcon
   wings of the Zayed National Museum on their mound, the Guggenheim's cluster of leaning cones,
   the Natural History Museum's stack of rounded rock, teamLab's low pale blob. Materials carry
   duskColor and dayMats on the material, the kit's convention. All dimensions in metres over M. */
function saadKitMat(dusk, day, rough, metal, emis, ei, nightAlb){
  const m = new THREE.MeshStandardMaterial({ color:dusk, roughness:rough, metalness:metal || 0 });
  if (emis !== undefined){ m.emissive = new THREE.Color(emis); m.emissiveIntensity = ei; }
  m.userData.duskColor = dusk;
  m.userData.glassOverride = false;
  /* NIGHT ALBEDO (city v114). The night view multiplies every non-glass material's base colour
     by five, because the city's own stock carries near-black base colours that need it. This
     helper's base colour is the DUSK tone, already light, so five times it saturated to white:
     SeaWorld's tiers, the Louvre's rim, the circuit canopy and the Galleria roof all rendered as
     white blobs at night. 0.42 of the dusk tone lands where the lifted city stock lands. */
  m.userData.nightAlbedo = nightAlb != null ? nightAlb : 0.42;
  m.userData.dayMats = new THREE.MeshStandardMaterial({ color:day, roughness:rough, metalness:metal || 0 });
  return m;
}
function louvreAbuDhabi(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  const R_DOME = 90 / M, SAG = 30 / M, RIM_Y = 9 / M, PL_H = 3 / M;
  /* THE PLATFORM IN THE SEA. The museum stands in shallow water on its own plinth; the survey
     coastline stops at the old shore, so the plinth is the land here — turquoise between pale
     quays, which is what the aerials show. */
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(260 / M, PL_H, 210 / M), saadKitMat(0x5FA9BE, 0x74C3D8, 0.2, 0.05));
  plinth.position.set(x0, PL_H / 2, z0);
  g.add(plinth);
  const quayMat = saadKitMat(0xD8D1C2, 0xE9E3D6, 0.9, 0);
  for (const [w, d, dx, dz] of [[260, 14, 0, -98], [260, 14, 0, 98], [14, 210, -123, 0], [14, 210, 123, 0]]){
    const q = new THREE.Mesh(new THREE.BoxGeometry(w / M, PL_H + 0.6 / M, d / M), quayMat);
    q.position.set(x0 + dx / M, (PL_H + 0.6 / M) / 2, z0 + dz / M);
    g.add(q);
  }
  /* THE POOL FRAMES — the thin white rectangles standing in the water off the seaward side. */
  for (const [dx, dz, w, d] of [[-60, 150, 70, 40], [30, 165, 50, 34], [110, 140, 60, 38]]){
    for (const [ex, ez, ew, ed] of [[0, -d / 2, w, 3], [0, d / 2, w, 3], [-w / 2, 0, 3, d], [w / 2, 0, 3, d]]){
      const f = new THREE.Mesh(new THREE.BoxGeometry(ew / M, 1.6 / M, ed / M), quayMat);
      f.position.set(x0 + (dx + ex) / M, 0.8 / M, z0 + (dz + ez) / M);
      g.add(f);
    }
  }
  /* THE WHITE BOXES — the galleries, a loose medina of cubes under the dome, one large hall
     among them. Their windows glow at night, and the glow is what comes through the lattice. */
  const boxMat = saadKitMat(0xE6E1D8, 0xF4F1EA, 0.85, 0, 0xFFE0B0, 0.22);
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(46 / M, 13 / M, 40 / M), boxMat);
  hall.position.set(x0 + 10 / M, PL_H + 6.5 / M, z0 - 8 / M);
  hall.rotation.y = 0.2;
  g.add(hall);
  for (let i = 0; i < 34; i++){
    const w = (9 + rnd() * 30) / M, d = (9 + rnd() * 24) / M, h = (6 + rnd() * 8) / M;
    const a = rnd() * 6.2832, rr = (20 + rnd() * 60) / M;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
    m.position.set(x0 + Math.cos(a) * rr, PL_H + h / 2, z0 + Math.sin(a) * rr);
    m.rotation.y = rnd() * 0.6 - 0.3;
    g.add(m);
  }
  /* THE DOME: 180 m across, 30 m of rise, and OPEN — an alpha-tested lattice, two caps a couple
     of metres apart with the pattern turned between them, so the layers beat against each other
     the way the eight real layers do and the galleries and their light show through the cells.
     alphaMap reads green: ribs white, cells black. */
  const Rs = (R_DOME * R_DOME + SAG * SAG) / (2 * SAG);
  const theta = Math.acos((Rs - SAG) / Rs);
  const latticeTex = (rot) => {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
    c.strokeStyle = '#FFF'; c.lineCap = 'round';
    const star = (cx, cy, r, w) => {
      c.lineWidth = w; c.beginPath();
      for (let k = 0; k < 8; k++){ const ang = k * Math.PI / 4 + rot, rr = (k % 2 ? 0.42 : 1) * r; const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr; if (k) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath(); c.stroke();
    };
    const big = N / 6, small = N / 14;
    /* THICKER RIBS (city v116). At 7 and 3 px the cap was a spider web with the sky through it;
       the real dome is eight dense layers that read as a solid silver shell with a pattern in
       it. Ribs at 13 and 6 px give roughly two-thirds cover, and a solid inner shell below the
       two lattices closes the rest. */
    for (let y = -1; y <= 6; y++) for (let x = -1; x <= 6; x++) star(x * big + big / 2 + ((y % 2) ? big / 2 : 0), y * big + big / 2, big * 0.56, 13);
    for (let y = -1; y <= 14; y++) for (let x = -1; x <= 14; x++) star(x * small + small / 2 + ((y % 2) ? small / 2 : 0), y * small + small / 2, small * 0.55, 6);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 3);
    t.anisotropy = 8;
    return t;
  };
  const caps = [[0, Rs, 0xA9AEB3, 0xDADEE2], [Math.PI / 8, Rs - 2.5 / M, 0x8E9398, 0xC4C9CE]];
  /* The solid inner shell: a shade darker than the lattices so the pattern reads on it. */
  { const radius = Rs - 5 / M, th = Math.acos((radius - (SAG - (Rs - radius))) / radius);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 20, 0, Math.PI * 2, 0, th),
      saadKitMat(0x9A9FA5, 0xB4B9BE, 0.7, 0.08, 0xFFD9A0, 0.12, 0.6));
    inner.position.set(x0, PL_H + RIM_Y - radius * Math.cos(th), z0); g.add(inner); }
  for (const [rot, radius, night, day] of caps){
    const t = latticeTex(rot);
    const mat = new THREE.MeshStandardMaterial({ color:night, alphaMap:t, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.5, metalness:0.5,
                                                 emissive:0xFFD9A0, emissiveIntensity:0.30 });   // lit from beneath at night (city v114)
    mat.userData.duskColor = day; mat.userData.glassOverride = false;
    mat.userData.nightAlbedo = 0.55;   // the lattice reads as lines only if it is not blown to white
    mat.userData.dayMats = new THREE.MeshStandardMaterial({ color:day, alphaMap:t, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.65, metalness:0.12 });   // matte silver, not a mirror
    const th = Math.acos((radius - (SAG - (Rs - radius))) / radius);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 24, 0, Math.PI * 2, 0, th), mat);
    dome.position.set(x0, PL_H + RIM_Y - radius * Math.cos(th), z0);
    dome.userData.hero = true;
    g.add(dome);
  }
  /* The rim: a pale ring where the lattice ends, the edge every photograph draws. */
  const rimGeo = new THREE.TorusGeometry(R_DOME, 1.4 / M, 8, 96);
  rimGeo.rotateX(Math.PI / 2);
  const rim = new THREE.Mesh(rimGeo, saadKitMat(0xC9CDD1, 0xEEF1F3, 0.5, 0.4));
  rim.position.set(x0, PL_H + RIM_Y, z0);
  g.add(rim);
  /* THE CAUSEWAY — the platform joins the shore to the east by a promenade deck; without it the
     museum floats off the coast. */
  const way = new THREE.Mesh(new THREE.BoxGeometry(170 / M, 2 / M, 36 / M), quayMat);
  way.position.set(x0 + (130 + 85) / M, 1 / M, z0 + 20 / M);
  g.add(way);
  const colMat = saadKitMat(0x9A9C9E, 0xB8BABC, 0.6, 0.3);
  for (const [dx, dz] of [[-40, -30], [40, -30], [-40, 34], [40, 34]]){
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6 / M, 1.6 / M, RIM_Y, 8), colMat);
    col.position.set(x0 + dx / M, PL_H + RIM_Y / 2, z0 + dz / M);
    g.add(col);
  }
  return g;
}
function zayedNationalMuseum(x0, z0, bearing){
  const g = new THREE.Group(), M = M_PER_U;
  const rot = bearing || 0;
  /* THE PODIUM — a white faceted mound the sails rise out of, 150 by 110 m and 26 m high, low-poly
     on purpose so its facets catch the light the way the render's do. The lagoon lies against
     its north side: a shallow pool 240 by 150 m the museum is reflected in. */
  const podium = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), saadKitMat(0xDCD8D0, 0xEFEDE7, 0.8, 0.05));
  podium.scale.set(75 / M, 26 / M, 55 / M);
  podium.position.set(x0, 0, z0);
  podium.rotation.y = rot;
  g.add(podium);
  const lagoon = new THREE.Mesh(new THREE.CircleGeometry(1, 40), saadKitMat(0x6FB8CC, 0x86CCE0, 0.15, 0.1));
  lagoon.scale.set(120 / M, 75 / M, 1);
  lagoon.rotation.x = -Math.PI / 2;
  lagoon.position.set(x0 - Math.sin(rot) * 70 / M, 0.06, z0 - Math.cos(rot) * 70 / M);
  g.add(lagoon);
  /* THE FIVE SAILS. Curved wings, the tallest 123 m in the middle, each a lathe whose swell sits
     two-fifths of the way up at a fifth of its height, pressed to a third of that in thickness
     and leaning toward the lagoon. Silver lattice by day, dark with a warm interior glow at night. */
  /* THE LATTICE on the sails: a diagonal grid drawn once, carried as the colour map by day and
     as the emissive map at night, so the glow comes through the cells and not the ribs. */
  const lat = (() => {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    c.fillStyle = '#E2E6E9'; c.fillRect(0, 0, N, N);   // near-white steel (city v117); the grey base read as pewter
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 6;
    for (let k = -8; k <= 16; k++){
      c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 + N * 0.5, N); c.stroke();
      c.beginPath(); c.moveTo(k * 32, 0); c.lineTo(k * 32 - N * 0.5, N); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 6);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const wingMat = new THREE.MeshStandardMaterial({ color:0x5C6268, map:lat, roughness:0.4, metalness:0.5, emissive:0xFFA860, emissiveIntensity:0.40, emissiveMap:lat });
  wingMat.userData.duskColor = 0xC9CED3; wingMat.userData.glassOverride = false;
  wingMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF2F4F6, map:lat, roughness:0.38, metalness:0.4 });
  const heights = [76, 110, 123, 98, 88];
  const spacing = 36 / M;
  heights.forEach((hm, i) => {
    const H = hm / M;
    const prof = [];
    for (let k = 0; k <= 14; k++){
      const t = k / 14;
      const swell = 0.145 * hm, base = 0.075 * hm;   // slimmer feathers (city v117)
      const half = (t < 0.4 ? base + (swell - base) * (t / 0.4) : swell * (1 - (t - 0.4) / 0.6) + 0.4) / M;
      prof.push(new THREE.Vector2(Math.max(0.25 / M, half), t * H));
    }
    const wingGeo = new THREE.LatheGeometry(prof, 20);
    /* THE CURVE. A lathe is straight; a falcon's wing is not. Each vertex is pushed sideways by
       the square of its height, so the sail bows toward the lagoon and its tip hooks over, the
       way the render's do. */
    {
      const pos = wingGeo.attributes.position;
      for (let v = 0; v < pos.count; v++){ const y = pos.getY(v); pos.setZ(v, pos.getZ(v) - 0.7 * y * y / H); }   // z is pressed to a third afterwards
      pos.needsUpdate = true; wingGeo.computeVertexNormals();
    }
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.scale.set(1, 1, 0.34);
    const off = (i - 2) * spacing;
    wing.position.set(x0 + Math.cos(rot) * off, 16 / M, z0 + Math.sin(rot) * off);
    /* SPLAYED (city v117): the outer feathers lean away from the centre one and turn a little on
       the row, so the five fan out the way the renders show rather than standing in a rank. */
    wing.rotation.set(0, rot + (i - 2) * 0.10, -(i - 2) * 0.075);
    if (i === 2) wing.userData.hero = true;
    g.add(wing);
  });
  return g;
}
function guggenheimAbuDhabi(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  /* GEHRY'S HEAP: a low white mass with angled shells and cones thrown across it, on a 220 by
     170 m platform at the water, honeycomb cells along the seaward edge. The character is in
     the tilt — nothing stands straight — so the slabs lean, the cones lean, and half the cones
     lie on their sides. Warm white stone, a few in pale blue-grey, as the renders read. */
  const base = new THREE.Mesh(new THREE.BoxGeometry(220 / M, 6 / M, 170 / M), saadKitMat(0xD9D2C6, 0xEAE5DC, 0.9, 0));
  base.position.set(x0, 3 / M, z0);
  g.add(base);
  const white = saadKitMat(0xE0DCD3, 0xF3F0EA, 0.85, 0.02);
  const stone = saadKitMat(0xCFC6B7, 0xE4DDD0, 0.85, 0);
  const blue  = saadKitMat(0xB6C3CE, 0xD0DCE6, 0.55, 0.25);
  const mats = [white, white, stone, blue];
  let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  /* the core: a cluster of tall angled slabs, each leaning a different way */
  for (let i = 0; i < 9; i++){
    const w = (26 + rnd() * 30) / M, d = (14 + rnd() * 16) / M, h = (22 + rnd() * 30) / M;
    const bx = x0 + (rnd() - 0.5) * 110 / M, bz = z0 + (rnd() - 0.5) * 80 / M;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[i % 4]);
    m.position.set(bx, 6 / M + h / 2 - 2 / M, bz);
    m.rotation.set((rnd() - 0.5) * 0.35, rnd() * 3.14, (rnd() - 0.5) * 0.35);
    if (i === 0) m.userData.hero = true;
    g.add(m);
  }
  /* the cones: some standing and leaning, some lying across the heap */
  for (let i = 0; i < 11; i++){
    const a = i / 11 * 6.2832 + rnd() * 0.5, rr = (i % 3 === 0 ? 16 : 34 + rnd() * 36) / M;
    const H = (30 + rnd() * 34) / M, rb = (11 + rnd() * 9) / M, rt = rb * (0.15 + rnd() * 0.3);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, H, 14, 1, false), mats[(i + 1) % 4]);
    const lying = i % 4 === 3;
    cone.position.set(x0 + Math.cos(a) * rr, lying ? 6 / M + rb * 0.8 : 6 / M + H / 2 + 6 / M, z0 + Math.sin(a) * rr);
    cone.rotation.set(lying ? Math.PI / 2 - 0.25 + (rnd() - 0.5) * 0.3 : (rnd() - 0.5) * 0.5, rnd() * 6.2832, lying ? 0 : (rnd() - 0.5) * 0.5);
    g.add(cone);
  }
  /* The honeycomb: two rows of hexagonal cells along the seaward edge, as in the site aerial. */
  const cellMat = saadKitMat(0xD9D4CC, 0xEDE9E2, 0.85, 0);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 12; i++){
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(8 / M, 8 / M, 7 / M, 6, 1, false), cellMat);
    cell.position.set(x0 + (-96 + i * 17.5 + (row ? 8.5 : 0)) / M, 6 / M + 3.5 / M, z0 + (-70 - row * 15) / M);
    g.add(cell);
  }
  return g;
}
function naturalHistoryMuseum(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  /* WHITE CUBES, STEPPED — the render is a heap of pale blocks with planted terraces on the
     channel by the bridge landing, not a rock. Fourteen boxes over a 160 by 120 m footprint,
     taller toward the middle, green on the ledges. */
  const white = saadKitMat(0xE3E0D8, 0xF4F2EC, 0.85, 0.02);
  const green = saadKitMat(0x5E7D45, 0x6F9452, 0.95, 0);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(130 / M, 4 / M, 100 / M), saadKitMat(0xD9D2C6, 0xEAE5DC, 0.9, 0));
  plinth.position.set(x0, 2 / M, z0);
  g.add(plinth);
  let seed = 23; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 14; i++){
    const w = (18 + rnd() * 26) / M, d = (18 + rnd() * 24) / M;
    const dx = (rnd() - 0.5) * 96, dz = (rnd() - 0.5) * 70;
    const cen = 1 - Math.min(1, Math.hypot(dx / 48, dz / 35));
    const h = (10 + cen * 34 + rnd() * 6) / M;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
    m.position.set(x0 + dx / M, 4 / M + h / 2, z0 + dz / M);
    m.rotation.y = rnd() * 0.5 - 0.25;
    if (i === 0) m.userData.hero = true;
    g.add(m);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 2.4 / M, d * 1.02), saadKitMat(0x2E3A44, 0x3C4A56, 0.3, 0.4));
    band.position.set(m.position.x, 4 / M + h * 0.55, m.position.z);
    band.rotation.y = m.rotation.y;
    g.add(band);
    const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.2 / M, d * 0.7), green);
    t.position.set(m.position.x, 4 / M + h + 0.6 / M, m.position.z);
    t.rotation.y = m.rotation.y;
    g.add(t);
  }
  return g;
}
function teamLabPhenomena(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  /* TWO WHITE SHELLS merged, 150 m across and 30 m high, smooth — the render is a single
     continuous white skin with openings cut into it; two rounded domes read as that at this
     scale. Glows softly at night. */
  const mat = saadKitMat(0xE8E4DC, 0xF6F3EE, 0.75, 0, 0xFFE6C8, 0.14);
  const blobs = [[150, 30, 120, 0, 0], [110, 26, 90, 62, 22], [80, 18, 70, -56, -26]];
  /* The openings cut into the shell: dark recesses on the seaward faces. */
  const dark = saadKitMat(0x1E262C, 0x2A343C, 0.6, 0.2);
  for (const [dx, dz, w] of [[10, 58, 34], [72, 62, 26], [-30, 50, 22]]){
    const o = new THREE.Mesh(new THREE.BoxGeometry(w / M, 9 / M, 12 / M), dark);
    o.position.set(x0 + dx / M, 8 / M, z0 + dz / M);
    g.add(o);
  }
  blobs.forEach(([w, h, d, dx, dz], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    m.scale.set(w / 2 / M, h / M, d / 2 / M);
    m.position.set(x0 + dx / M, 0, z0 + dz / M);
    if (i === 0) m.userData.hero = true;
    g.add(m);
  });
  return g;
}

/* =============================================================================================
   CAPITAL GATE (city v104) — the leaning tower at ADNEC, 160 m, 18 degrees off vertical, the
   easiest silhouette in the city to name. An elliptical shaft that narrows as it rises, every
   vertex pushed sideways by the square of its height so the lean grows with the height and the
   base stays where the survey puts it (72 by 49 m, 160 m). Blue glass in a white diagrid. */
function capitalGate(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  const H = 160 / M, LEAN = 33 / M;
  const tex = (() => {
    const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    c.fillStyle = '#3B72B8'; c.fillRect(0, 0, N, N);
    c.strokeStyle = 'rgba(240,244,247,0.95)'; c.lineWidth = 9;
    const step = N / 6;
    for (let k = -8; k <= 14; k++){
      c.beginPath(); c.moveTo(k * step, 0); c.lineTo(k * step + N * 0.577, N); c.stroke();
      c.beginPath(); c.moveTo(k * step, 0); c.lineTo(k * step - N * 0.577, N); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 6);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  })();
  const glass = new THREE.MeshStandardMaterial({ color:0x2F3E52, map:tex, roughness:0.22, metalness:0.45, emissive:0xFFFFFF, emissiveMap:tex, emissiveIntensity:0.18 });
  glass.userData.glassOverride = true; glass.userData.duskColor = 0xCFDCEC;
  glass.userData.duskRough = 0.2; glass.userData.duskMetal = 0.4; glass.userData.duskEnv = 1.3;
  glass.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xFFFFFF, map:tex, roughness:0.2, metalness:0.35, envMapIntensity:1.0 });
  const geo = new THREE.CylinderGeometry(1, 1, H, 36, 24, false);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++){
    const y = pos.getY(v), t = (y + H / 2) / H;                  // 0 at the base, 1 at the top
    const ax = (25 - 6 * t) / M, az = (17.5 - 4.5 * t) / M;       // the ellipse narrows as it rises
    pos.setX(v, pos.getX(v) * ax + LEAN * t * t);
    pos.setZ(v, pos.getZ(v) * az);
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  const tower = new THREE.Mesh(geo, glass);
  tower.position.set(x0, H / 2, z0);
  tower.rotation.y = 0.60 + Math.PI / 2;                          // the survey's rotation; the lean runs north-east
  tower.userData.hero = true; tower.userData.kitName = 'capitalGate';
  g.add(tower);
  /* THE SPLASH — the wave of sunscreen that wraps the lower half on the south side. */
  const splashMat = saadKitMat(0xC9CED3, 0xEEF1F3, 0.5, 0.3);
  const splash = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI, 0.9, 1.0), splashMat);
  splash.scale.set(31 / M, 70 / M, 24 / M);
  splash.position.set(x0, 52 / M, z0);
  splash.rotation.y = 0.60 + Math.PI / 2;
  g.add(splash);
  const podium = new THREE.Mesh(new THREE.BoxGeometry(96 / M, 8 / M, 64 / M), saadKitMat(0xD3CEC5, 0xE6E2DA, 0.85, 0));
  podium.position.set(x0 + 8 / M, 4 / M, z0);
  podium.rotation.y = 0.60;
  g.add(podium);
  return g;
}
/* W ABU DHABI — the hotel over the Yas Marina Circuit: two blocks either side of the track, a
   bridge between them, and the grid-shell veil draped over the lot, lit in colour at night. The
   veil is an open lattice, like the Louvre's dome: an alpha-tested diamond grid on a stretched
   hemisphere, glowing violet through the cells after dark. Bearing is the track's own. */
function wAbuDhabi(x0, z0, bearing){
  const g = new THREE.Group(), M = M_PER_U;
  const rot = bearing || 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const at = (ax, az) => [x0 + ax * cs + az * sn, z0 - ax * sn + az * cs];
  const blockMat = saadKitMat(0x9AA3AA, 0xE4E8EB, 0.5, 0.3, 0xFFE0B0, 0.10);
  for (const side of [-1, 1]){
    const [bx, bz] = at(0, side * 40 / M);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(100 / M, 46 / M, 34 / M), blockMat);
    blk.position.set(bx, 23 / M, bz);
    blk.rotation.y = rot;
    g.add(blk);
  }
  const [brx, brz] = at(10 / M, 0);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(26 / M, 8 / M, 50 / M), blockMat);
  bridge.position.set(brx, 40 / M, brz);
  bridge.rotation.y = rot;
  g.add(bridge);
  const lat = (() => {
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
    c.strokeStyle = '#FFF'; c.lineWidth = 10;
    for (let k = -4; k <= 8; k++){
      c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64 + N, N); c.stroke();
      c.beginPath(); c.moveTo(k * 64, 0); c.lineTo(k * 64 - N, N); c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4); t.anisotropy = 8;
    return t;
  })();
  const veilMat = new THREE.MeshStandardMaterial({ color:0x8E96A0, alphaMap:lat, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.4, metalness:0.6,
                                                   emissive:0x7A5CFF, emissiveIntensity:0.55 });
  veilMat.userData.duskColor = 0xD9DEE3; veilMat.userData.glassOverride = false;
  veilMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE9ECEF, alphaMap:lat, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.4, metalness:0.5 });
  const veil = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), veilMat);
  veil.scale.set(118 / M, 36 / M, 66 / M);
  veil.position.set(x0, 42 / M, z0);
  veil.rotation.y = rot;
  veil.userData.hero = true; veil.userData.kitName = 'wAbuDhabi';
  g.add(veil);
  return g;
}

/* GATE TOWERS (city v105) — three 66-storey towers on Al Reem joined at the top by a penthouse
   bridge, the arch you see from the mainland. The survey holds them as one 256 by 50 m slab;
   the kit splits it into the three towers, leans the outer two outward a little, and lays the
   bridge across the top three floors. Pale stone and glass bands. */
function gateTowers(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U;
  const H = 240 / M, W = 60 / M, D = 46 / M;
  const mat = new THREE.MeshStandardMaterial({ color:0x6B7278, map:TEX_TOWER, roughness:0.5, metalness:0.3 });
  mat.userData.duskColor = 0xD9D2C6; mat.userData.glassOverride = false;
  /* TEX_TOWER is the night window sheet — dark with lit cells — so the day material goes without it. */
  mat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE9E3D8, roughness:0.5, metalness:0.25 });
  const cs = Math.cos(rot), sn = Math.sin(rot);
  [-1, 0, 1].forEach((k, i) => {
    const off = k * 96 / M;
    const t = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mat);
    t.position.set(x0 + cs * off, H / 2, z0 - sn * off);
    t.rotation.set(0, rot, k * 0.035);                          // the outer two lean out
    if (i === 1) t.userData.hero = t.userData.kitName = 'gateTowers';
    g.add(t);
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(270 / M, 14 / M, D * 1.05), saadKitMat(0x9AA3AA, 0xF1EDE5, 0.45, 0.35, 0xFFE0B0, 0.12));
  bridge.position.set(x0, H - 7 / M, z0);
  bridge.rotation.y = rot;
  g.add(bridge);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(270 / M, 3 / M, D * 1.15), saadKitMat(0xC9CED3, 0xFFFFFF, 0.5, 0.3));
  arch.position.set(x0, H + 1.5 / M, z0);
  arch.rotation.y = rot;
  g.add(arch);
  return g;
}
/* SEAWORLD YAS ISLAND — a round building 320 m across under five stacked shell tiers, each
   stepping in, dark glass between them: from the air it is a pale layered disc, and that is the
   whole identification. */
function seaWorldYas(x0, z0){
  const g = new THREE.Group(), M = M_PER_U;
  const tierMat = saadKitMat(0xD8D3C9, 0xF0ECE4, 0.8, 0.05);
  const glassMat = saadKitMat(0x1F2A33, 0x2F3E4C, 0.25, 0.5, 0xBFD8EA, 0.22, 1.0);   // the glass bands glow at night
  const radii = [160, 135, 108, 80, 52], step = 9 / M;
  let y = 0;
  radii.forEach((r, i) => {
    const gl = new THREE.Mesh(new THREE.CylinderGeometry((r - 4) / M, (r - 4) / M, step * 0.55, 48), glassMat);
    gl.position.set(x0 + (i * 6) / M, y + step * 0.275, z0 - (i * 4) / M);
    g.add(gl);
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r / M, (r + 6) / M, step * 0.55, 48), tierMat);
    tier.position.set(x0 + (i * 6) / M, y + step * 0.55 + step * 0.275, z0 - (i * 4) / M);
    if (i === 0) tier.userData.hero = tier.userData.kitName = 'seaWorldYas';
    g.add(tier);
    y += step;
  });
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), tierMat);
  crown.scale.set(40 / M, 14 / M, 40 / M);
  crown.position.set(x0 + 30 / M, y, z0 - 20 / M);
  g.add(crown);
  return g;
}

/* QASR AL HOSN (city v106) — the fort: white walls round a courtyard, the round watchtower at
   the corner with its crenellated top, a square tower opposite, the palace block inside. On the
   survey's 91 by 88 m footprint. */
function qasrAlHosn(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U;
  const white = saadKitMat(0xE8E1D2, 0xF6F2EA, 0.9, 0);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const at = (ax, az) => [x0 + ax * cs + az * sn, z0 - ax * sn + az * cs];
  const S = 88 / M, WH = 8 / M, WT = 2.4 / M;
  for (const [ax, az, w, d] of [[0, -S / 2, S, WT], [0, S / 2, S, WT], [-S / 2, 0, WT, S], [S / 2, 0, WT, S]]){
    const [wx, wz] = at(ax, az);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WH, d), white);
    wall.position.set(wx, WH / 2, wz); wall.rotation.y = rot; g.add(wall);
  }
  const [tx, tz] = at(-S / 2, -S / 2);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(6.5 / M, 7.5 / M, 17 / M, 20), white);
  tower.position.set(tx, 8.5 / M, tz); tower.userData.hero = tower.userData.kitName = 'qasrAlHosn'; g.add(tower);
  for (let k = 0; k < 10; k++){
    const a = k / 10 * 6.2832;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 / M, 1.6 / M, 1.4 / M), white);
    m.position.set(tx + Math.cos(a) * 6.2 / M, 17.8 / M, tz + Math.sin(a) * 6.2 / M); m.rotation.y = -a; g.add(m);
  }
  const [sx, sz] = at(S / 2, S / 2);
  const sq = new THREE.Mesh(new THREE.BoxGeometry(12 / M, 14 / M, 12 / M), white);
  sq.position.set(sx, 7 / M, sz); sq.rotation.y = rot; g.add(sq);
  const [px, pz] = at(8 / M, 6 / M);
  const palace = new THREE.Mesh(new THREE.BoxGeometry(44 / M, 11 / M, 30 / M), white);
  palace.position.set(px, 5.5 / M, pz); palace.rotation.y = rot; g.add(palace);
  return g;
}
/* YAS MARINA CIRCUIT — the pit building along the main straight with its control tower, and the
   main grandstand opposite under the sweeping white canopy. Both on the survey's long footprints
   (381 by 25 m and 374 by 34 m, rot 0.14), which the kit zone replaces. */
function yasCircuit(x0, z0, rot, gx, gz){
  const g = new THREE.Group(), M = M_PER_U;
  const white = saadKitMat(0xD9D4CB, 0xF0EDE6, 0.8, 0.05);
  const glass = saadKitMat(0x1F2A33, 0x2F3E4C, 0.25, 0.5);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const pit = new THREE.Mesh(new THREE.BoxGeometry(380 / M, 12 / M, 24 / M), white);
  pit.position.set(x0, 6 / M, z0); pit.rotation.y = rot; g.add(pit);
  const band = new THREE.Mesh(new THREE.BoxGeometry(382 / M, 3 / M, 25 / M), glass);
  band.position.set(x0, 7 / M, z0); band.rotation.y = rot; g.add(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(392 / M, 1.2 / M, 34 / M), white);
  roof.position.set(x0, 12.6 / M, z0); roof.rotation.y = rot; g.add(roof);
  const ctl = new THREE.Mesh(new THREE.BoxGeometry(18 / M, 42 / M, 18 / M), glass);
  ctl.position.set(x0 + cs * 150 / M, 21 / M, z0 - sn * 150 / M); ctl.rotation.y = rot; g.add(ctl);
  /* the grandstand: three tiers stepping back, a canopy curved over them */
  const tiers = [[0, 6], [12, 12], [24, 18]];
  for (const [back, h] of tiers){
    const t = new THREE.Mesh(new THREE.BoxGeometry(370 / M, h / M, 12 / M), white);
    t.position.set(gx + sn * back / M, h / 2 / M, gz + cs * back / M); t.rotation.y = rot; g.add(t);
  }
  /* SOLID FROM BOTH SIDES (city v117). The canopy is an open arc of a cylinder, and a single-
     sided arc is invisible from above: the camera looks through its back faces to the seats and
     the roof reads as missing. Both faces now draw, in a shade darker than the pit building so
     the curve shows against it, with a thin inner shell so it has a visible thickness. */
  const canopyMat = saadKitMat(0xC9C4BA, 0xE3DFD6, 0.75, 0.05, undefined, undefined, 0.5);
  canopyMat.side = THREE.DoubleSide; canopyMat.userData.dayMats.side = THREE.DoubleSide;
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(46 / M, 46 / M, 380 / M, 24, 1, true, 0.15, 0.95), canopyMat);
  const canopyIn = new THREE.Mesh(new THREE.CylinderGeometry(44.5 / M, 44.5 / M, 380 / M, 24, 1, true, 0.15, 0.95), canopyMat);
  canopyIn.rotation.set(0, 0, Math.PI / 2);
  canopy.rotation.set(0, 0, Math.PI / 2);
  const cg = new THREE.Group();
  cg.add(canopy); canopyIn.position.copy(canopy.position); cg.add(canopyIn);
  cg.position.set(gx + sn * 22 / M, 4 / M, gz + cs * 22 / M);
  cg.rotation.y = rot;
  canopy.userData.hero = canopy.userData.kitName = 'yasCircuit';
  g.add(cg);
  return g;
}

/* NATION TOWERS (city v107) — two curved glass towers on the Corniche, 237 m and 200 m, their
   broad convex faces to the sea, joined near the top of the shorter one by the skybridge, on a
   long podium. The survey has no footprint for them (a 95 by 51 m plot and nothing tall), so
   they stand on the published coordinates, forty metres back from the shore. */
function nationTowers(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const at = (ax, az) => [x0 + ax * cs + az * sn, z0 - ax * sn + az * cs];
  const glass = new THREE.MeshStandardMaterial({ color:0x2A3A4C, map:TEX_TOWER, roughness:0.3, metalness:0.5 });
  glass.userData.glassOverride = true; glass.userData.duskColor = 0xB9CBDA;
  /* Low metalness by day: a reflective glass reads as a dark slab against the sand, and the
     towers are pale blue-green in every photograph. */
  glass.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xBCD3E0, roughness:0.35, metalness:0.12, envMapIntensity:0.6 });
  const towers = [[-38, 237, 60, 34], [42, 200, 54, 32]];
  towers.forEach(([off, hm, w, d], i) => {
    const H = hm / M;
    const geo = new THREE.CylinderGeometry(1, 1, H, 40, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++){
      const t = (pos.getY(v) + H / 2) / H;
      pos.setX(v, pos.getX(v) * (w / 2) * (1 - 0.12 * t) / M);       // elliptical, tapering a little
      pos.setZ(v, pos.getZ(v) * (d / 2) * (1 - 0.12 * t) / M);
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
    const [tx, tz] = at(off / M, 0);
    const tower = new THREE.Mesh(geo, glass);
    tower.position.set(tx, H / 2, tz); tower.rotation.y = rot;
    if (i === 0) tower.userData.hero = tower.userData.kitName = 'nationTowers';
    g.add(tower);
  });
  const [bx, bz] = at(2 / M, 0);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(60 / M, 9 / M, 14 / M), saadKitMat(0xC9CED3, 0xEEF1F3, 0.4, 0.4, 0xFFE0B0, 0.12));
  bridge.position.set(bx, 190 / M, bz); bridge.rotation.y = rot; g.add(bridge);
  const [px, pz] = at(0, 12 / M);
  const podium = new THREE.Mesh(new THREE.BoxGeometry(170 / M, 18 / M, 70 / M), saadKitMat(0xD3CEC5, 0xE6E2DA, 0.85, 0));
  podium.position.set(px, 9 / M, pz); podium.rotation.y = rot; g.add(podium);
  return g;
}
/* WARNER BROS. WORLD — the indoor park east of Ferrari World: a 420 by 300 m hall under a
   ridged roof, the domed rotunda at the entrance, the portal in the studio's blue and gold. On
   the survey's 713 by 694 m footprint, which the kit zone replaces. */
function warnerBrosWorld(x0, z0, rot){
  /* TO THE PHOTOGRAPHS (city v116): a flat-roofed GOLD box, not sand, with the great blue glass
     arch framed in yellow on the entrance face, the tall yellow pylon with the shield on top at
     the corner, and the entrance plaza with its palm grid. The three ridges and the dome of the
     first pass were never there. */
  const g = new THREE.Group(), M = M_PER_U;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const at = (ax, az) => [x0 + ax * cs + az * sn, z0 - ax * sn + az * cs];
  const gold = saadKitMat(0xC99A2E, 0xE8BB3C, 0.75, 0.1, 0xFFC84A, 0.10, 0.9);
  const goldL = saadKitMat(0xD9AC3A, 0xF2CA48, 0.7, 0.1, 0xFFD060, 0.25, 1.0);
  const blue = saadKitMat(0x1E3F86, 0x3C6FD0, 0.3, 0.3, 0x4C86E8, 0.45, 1.2);
  const hall = new THREE.Mesh(new THREE.BoxGeometry(420 / M, 26 / M, 300 / M), gold);
  hall.position.set(x0, 13 / M, z0); hall.rotation.y = rot; g.add(hall);
  const [ux, uz] = at(60 / M, 40 / M);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(200 / M, 10 / M, 160 / M), gold);
  upper.position.set(ux, 31 / M, uz); upper.rotation.y = rot; g.add(upper);
  // the entrance face is the -x end: the blue arch, a half disc of glass standing in a gold frame
  const [ex, ez] = at(-211 / M, 0);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(34 / M, 34 / M, 6 / M, 40, 1, false, 0, Math.PI), blue);
  arch.rotation.set(0, rot, Math.PI / 2, 'YZX'); arch.position.set(ex, 4 / M, ez); g.add(arch);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(35 / M, 3 / M, 8, 40, Math.PI), goldL);
  frame.rotation.set(0, rot + Math.PI / 2, 0); frame.position.set(ex - 0.2 * cs, 4 / M, ez + 0.2 * sn); g.add(frame);
  const entryBox = new THREE.Mesh(new THREE.BoxGeometry(12 / M, 44 / M, 100 / M), gold);
  const [bx, bz] = at(-206 / M, 0); entryBox.position.set(bx, 22 / M, bz); entryBox.rotation.y = rot; g.add(entryBox);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), goldL);
  dome.scale.set(30 / M, 12 / M, 30 / M); dome.position.set(bx, 44 / M, bz); dome.userData.hero = dome.userData.kitName = 'warnerBrosWorld'; g.add(dome);
  // the pylon with the shield on top
  const [px, pz] = at(-240 / M, 70 / M);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(9 / M, 62 / M, 9 / M), goldL);
  pylon.position.set(px, 31 / M, pz); pylon.rotation.y = rot; g.add(pylon);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d'); c.clearRect(0, 0, 256, 256);
  const shield = () => { c.beginPath(); c.moveTo(24, 40); c.lineTo(232, 40); c.lineTo(232, 130); c.quadraticCurveTo(232, 210, 128, 240); c.quadraticCurveTo(24, 210, 24, 130); c.closePath(); };
  shield(); c.fillStyle = '#F2C230'; c.fill();
  c.save(); c.translate(128, 140); c.scale(0.88, 0.88); c.translate(-128, -140); shield(); c.fillStyle = '#2450A8'; c.fill(); c.restore();
  c.fillStyle = '#F2C230'; c.font = 'bold 118px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('WB', 128, 138);
  const tex = new THREE.CanvasTexture(cv);
  const shMat = new THREE.MeshStandardMaterial({ map:tex, transparent:true, roughness:0.5, emissive:0xFFFFFF, emissiveMap:tex, emissiveIntensity:0.5, side:THREE.DoubleSide });
  shMat.userData.glassOverride = false; shMat.userData.duskColor = 0xFFFFFF; shMat.userData.nightAlbedo = 1.0;
  shMat.userData.dayMats = new THREE.MeshStandardMaterial({ map:tex, transparent:true, roughness:0.5, side:THREE.DoubleSide });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(24 / M, 24 / M), shMat);
  sh.position.set(px, 72 / M, pz); sh.rotation.y = rot - Math.PI / 2; g.add(sh);
  // the plaza and its palm grid
  const [qx, qz] = at(-270 / M, 0);
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(90 / M, 0.5 / M, 200 / M), saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0));
  plaza.position.set(qx, 0.25 / M, qz); plaza.rotation.y = rot; g.add(plaza);
  const palms = [];
  for (let ax = -300; ax <= -240; ax += 15) for (let az = -90; az <= 90; az += 15) palms.push(at(ax / M, az / M));
  kitPalms(g, palms, 0.75);
  return g;
}
/* =========================================================================================
   LANDMARK PASS TWO (city v109). The register's massed and missing entries, built on their
   surveyed footprints where the survey has them. Same conventions as pass one: metres in,
   divided by M_PER_U once; saadKitMat / kitGlass for materials; the world file measures the
   kit zone off the object.
   ========================================================================================= */
/* PALMS FOR THE KIT. One instanced trunk and crown per call, seated at the island-unit points
   given, with a hashed jitter so a row never reads as a comb. Same recipe as the palace's
   allees. */
function kitPalms(g, pts, scale){
  if (!pts.length) return;
  const sc0 = scale || 1;
  const trunkMat = saadKitMat(0x9C8A70, 0xA89478, 0.95, 0), crownMat = saadKitMat(0x4F6A2E, 0x6E7A3E, 0.9, 0);
  const trunkG = new THREE.CylinderGeometry(0.055, 0.085, 1.15, 5); trunkG.translate(0, 0.575, 0);
  const crownG = new THREE.IcosahedronGeometry(0.42, 0); crownG.scale(1, 0.55, 1); crownG.translate(0, 1.28, 0);
  const trunks = new THREE.InstancedMesh(trunkG, trunkMat, pts.length), crowns = new THREE.InstancedMesh(crownG, crownMat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([px, pz], i) => {
    const h = Math.sin(px * 12.9898 + pz * 78.233) * 43758.5453, j = h - Math.floor(h), sc = sc0 * (0.86 + j * 0.32);
    m4.makeRotationY(j * Math.PI * 2); m4.scale(new THREE.Vector3(sc, sc, sc)); m4.setPosition(px, 0, pz);
    trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
  });
  trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true;
  g.add(trunks); g.add(crowns);
}
function kitGlass(dusk, day, rough, metal){
  const m = new THREE.MeshStandardMaterial({ color:dusk, map:TEX_TOWER, roughness:0.3, metalness:0.5 });
  m.userData.glassOverride = true; m.userData.duskColor = dusk;
  m.userData.dayMats = new THREE.MeshStandardMaterial({
    color:day, roughness:rough == null ? 0.35 : rough, metalness:metal == null ? 0.1 : metal, envMapIntensity:0.6 });
  return m;
}
/* An elliptical tower: plan w by d metres, hm metres tall, narrowing by `taper` at the top, with
   the crown sheared by `shear` metres across the plan's x so the top slopes rather than sits
   flat. The shear is applied only to the top ring, so the cap stays planar and tilted. */
function ellipTower(w, d, hm, taper, shear, segs){
  const M = M_PER_U, H = hm / M;
  const geo = new THREE.CylinderGeometry(1, 1, H, segs || 40, 10);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++){
    const t = (pos.getY(v) + H / 2) / H, x = pos.getX(v), z = pos.getZ(v);
    const k = 1 - (taper || 0) * t;
    pos.setX(v, x * (w / 2) * k / M); pos.setZ(v, z * (d / 2) * k / M);
    if (shear && t > 0.999) pos.setY(v, pos.getY(v) + (shear / M) * 0.5 * x);
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}
/* A rectangular tower whose top is one sloping plane, the crown most of the city's newer slabs
   carry. */
function shearBox(w, d, hm, shear){
  const M = M_PER_U, H = hm / M;
  const geo = new THREE.BoxGeometry(w / M, H, d / M);
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v++){
    if (pos.getY(v) > H / 2 - 1e-4) pos.setY(v, H / 2 + (shear / M) * (pos.getX(v) / (w / 2 / M)) * 0.5);
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}
const _placeRot = (x0, z0, rot) => { const cs = Math.cos(rot), sn = Math.sin(rot); return (ax, az) => [x0 + ax * cs + az * sn, z0 - ax * sn + az * cs]; };

/* WORLD TRADE CENTER ABU DHABI — Burj Mohammed bin Rashid, 381 m, the tallest tower in the city:
   a slender glass form that narrows and rounds off to a curved crown, with the square Trust
   Tower (278 m) beside it and the souk podium between. On the survey's 400 m record. */
function wtcAbuDhabi(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U;
  const glass = kitGlass(0x2A3E52, 0xA9C4D6);
  const burj = new THREE.Mesh(ellipTower(50, 38, 381, 0.42, 22, 40), glass);
  burj.position.set(x0, 381 / M / 2, z0); burj.rotation.y = rot;
  burj.userData.hero = burj.userData.kitName = 'wtcAbuDhabi'; g.add(burj);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8 / M, 1.6 / M, 26 / M, 8), saadKitMat(0xC9CED3, 0xEEF1F3, 0.4, 0.4));
  mast.position.set(x0 + 1.2, (381 + 13) / M, z0); g.add(mast);
  const trust = new THREE.Mesh(shearBox(42, 42, 278, 10), kitGlass(0x24343F, 0xB7C9D2));
  trust.position.set(x0 - 3.9, 278 / M / 2, z0 + 19.4); trust.rotation.y = rot; g.add(trust);
  const podium = new THREE.Mesh(new THREE.BoxGeometry(150 / M, 28 / M, 110 / M), saadKitMat(0xD3CEC5, 0xE6E2DA, 0.85, 0));
  podium.position.set(x0 - 2, 14 / M, z0 + 9); podium.rotation.y = rot; g.add(podium);
  return g;
}
/* THE LANDMARK — 324 m, an oval tower that leans back into a long sloping crown. On its own
   surveyed record, 72 by 40 m. */
function landmarkTower(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U;
  const t = new THREE.Mesh(ellipTower(72, 40, 324, 0.12, 38, 44), kitGlass(0x33424A, 0xC5CFD3, 0.3, 0.12));
  t.position.set(x0, 324 / M / 2, z0); t.rotation.y = rot;
  t.userData.hero = t.userData.kitName = 'landmarkTower'; g.add(t);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(90 / M, 16 / M, 60 / M), saadKitMat(0xD3CEC5, 0xE6E2DA, 0.85, 0));
  pod.position.set(x0, 8 / M, z0); pod.rotation.y = rot; g.add(pod);
  return g;
}
/* ADNEC — the exhibition halls: a row of vaulted halls behind a long glass concourse, on the
   survey's 461 by 410 m plot next to Capital Gate. */
function adnecHalls(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const white = saadKitMat(0xDCD9D2, 0xF1EFEA, 0.7, 0.05), glass = saadKitMat(0x2E4650, 0x9FC1CF, 0.35, 0.2, 0xBFE0EC, 0.1);
  const N = 6, W = 68, DEP = 190;
  for (let i = 0; i < N; i++){
    const ax = (i - (N - 1) / 2) * (W + 4) / M;
    const [hx, hz] = at(ax, 40 / M);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(W / M, 16 / M, DEP / M), white);
    hall.position.set(hx, 8 / M, hz); hall.rotation.y = rot; g.add(hall);
    const vault = new THREE.Mesh(new THREE.CylinderGeometry(W / 2 / M, W / 2 / M, DEP / M, 18, 1, false, 0, Math.PI), white);
    vault.rotation.set(0, rot, Math.PI / 2, 'YZX'); vault.scale.set(0.42, 1, 1);
    vault.position.set(hx, 16 / M, hz);
    if (i === 2) vault.userData.hero = vault.userData.kitName = 'adnecHalls';
    g.add(vault);
  }
  const [cx, cz] = at(0, -70 / M);
  const conc = new THREE.Mesh(new THREE.BoxGeometry((N * (W + 4) + 30) / M, 14 / M, 34 / M), glass);
  conc.position.set(cx, 7 / M, cz); conc.rotation.y = rot; g.add(conc);
  const [ex, ez] = at(0, -80 / M);
  const entry = new THREE.Mesh(new THREE.BoxGeometry(80 / M, 30 / M, 50 / M), white);
  entry.position.set(ex, 15 / M, ez); entry.rotation.y = rot; g.add(entry);
  return g;
}
/* THE FOUNDER'S MEMORIAL — the Constellation: a 30 m field of cables hung in an open steel
   pavilion over a raised garden, across the road from the Corniche. On the 95 by 51 m plot. */
function foundersMemorial(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const lawn = saadKitMat(0x3E5A34, 0x5E7A45, 0.9, 0), stone = saadKitMat(0xD5D0C6, 0xE9E4DA, 0.8, 0);
  const steel = saadKitMat(0x2E2A26, 0x3C3834, 0.5, 0.5);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(95 / M, 3 / M, 51 / M), stone);
  plinth.position.set(x0, 1.5 / M, z0); plinth.rotation.y = rot; g.add(plinth);
  const grass = new THREE.Mesh(new THREE.BoxGeometry(88 / M, 0.6 / M, 44 / M), lawn);
  grass.position.set(x0, 3.2 / M, z0); grass.rotation.y = rot; g.add(grass);
  const [px, pz] = at(-12 / M, 0);
  // the open pavilion: four columns and a lid, 36 x 36 x 30 m
  for (const [sx, sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
    const [cx, cz] = at((-12 + sx * 17) / M, sz * 17 / M);
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.6 / M, 30 / M, 1.6 / M), steel);
    col.position.set(cx, 18 / M, cz); col.rotation.y = rot; g.add(col);
  }
  const lid = new THREE.Mesh(new THREE.BoxGeometry(38 / M, 2 / M, 38 / M), steel);
  lid.position.set(px, 33 / M, pz); lid.rotation.y = rot; g.add(lid);
  // the constellation: a cylinder of cables (an alpha-tested texture of thin verticals)
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
  c.fillStyle = '#fff';
  for (let i = 0; i < 40; i++){ const x = Math.floor((i * 6.4 + (i % 3) * 1.7) % N); c.fillRect(x, 0, 1, N); }
  for (let i = 0; i < 90; i++){ const x = (i * 37) % N, y = (i * 53 + 20) % N; c.fillRect(x, y, 5, 5); }
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(6, 1);
  const cableMat = new THREE.MeshStandardMaterial({ color:0xC7B58A, alphaMap:tex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.5, metalness:0.4, emissive:0xE8D8A8, emissiveIntensity:0.25 });
  cableMat.userData.glassOverride = false; cableMat.userData.duskColor = 0xC7B58A;
  cableMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xBFAF86, alphaMap:tex, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.5, metalness:0.3 });
  const con = new THREE.Mesh(new THREE.CylinderGeometry(13 / M, 13 / M, 27 / M, 36, 1, true), cableMat);
  con.position.set(px, 3.5 / M + 13.5 / M, pz); con.userData.hero = con.userData.kitName = 'foundersMemorial'; g.add(con);
  const [wx, wz] = at(28 / M, 0);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(30 / M, 0.5 / M, 40 / M), saadKitMat(0x2E6A78, 0x4FA9BC, 0.2, 0.1));
  pool.position.set(wx, 3.6 / M, wz); pool.rotation.y = rot; g.add(pool);
  return g;
}
/* SKY TOWER AND SUN TOWER, Shams Abu Dhabi — the tallest pair on Al Reem: a 292 m oval with a
   sloping crown and, beside it, a 247 m slab with the same slant. Both on surveyed records. */
function skyTower(x0, z0, rot, sx, sz, srot){
  const g = new THREE.Group(), M = M_PER_U;
  const sky = new THREE.Mesh(ellipTower(87, 39, 292, 0.06, 30, 44), kitGlass(0x2B4250, 0x9FC0D2, 0.3, 0.1));
  sky.position.set(x0, 292 / M / 2, z0); sky.rotation.y = rot;
  sky.userData.hero = sky.userData.kitName = 'skyTower'; g.add(sky);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(6 / M, 300 / M, 44 / M), saadKitMat(0xDDE2E6, 0xF2F5F7, 0.5, 0.2));
  fin.position.set(x0, 150 / M, z0); fin.rotation.y = rot; g.add(fin);
  const sun = new THREE.Mesh(shearBox(66, 33, 247, 24), kitGlass(0x2B4250, 0xA8C6D5, 0.3, 0.1));
  sun.position.set(sx, 247 / M / 2, sz); sun.rotation.y = srot; g.add(sun);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(170 / M, 14 / M, 90 / M), saadKitMat(0xD3CEC5, 0xE6E2DA, 0.85, 0));
  pod.position.set((x0 + sx) / 2, 7 / M, (z0 + sz) / 2); pod.rotation.y = rot; g.add(pod);
  return g;
}
/* REEM MALL — a cream box with a glazed spine and the blue snow-park vault, on the survey's
   188 by 179 m record. */
function reemMall(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const body = new THREE.Mesh(new THREE.BoxGeometry(188 / M, 26 / M, 179 / M), saadKitMat(0xDCD3C2, 0xE6DECD, 0.85, 0));
  body.position.set(x0, 13 / M, z0); body.rotation.y = rot; body.userData.hero = body.userData.kitName = 'reemMall'; g.add(body);
  const glass = saadKitMat(0x2E4650, 0xC9E3EC, 0.3, 0.2, 0xBFE4EC, 0.2);
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(9 / M, 9 / M, 170 / M, 12, 1, false, 0, Math.PI), glass);
  spine.rotation.set(0, rot, Math.PI / 2, 'YZX'); spine.position.set(x0, 26 / M, z0); g.add(spine);
  const [vx, vz] = at(0, 60 / M);
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(22 / M, 22 / M, 120 / M, 16, 1, false, 0, Math.PI), saadKitMat(0x4E7FA8, 0x7FB3DA, 0.4, 0.2));
  vault.rotation.set(0, rot, Math.PI / 2, 'YZX'); vault.scale.set(0.6, 1, 1); vault.position.set(vx, 26 / M, vz); g.add(vault);
  return g;
}
/* ADGM SQUARE — the Galleria's undulating white roof between the four glass towers of the
   financial centre, all on their surveyed records (island units, absolute). */
function adgmSquare(){
  const g = new THREE.Group(), M = M_PER_U;
  /* A stone-grey podium so the white roof above it reads as a separate thing; at the first
     render the two were the same tone and the roof vanished into the deck. */
  const pod = new THREE.Mesh(new THREE.BoxGeometry(296 / M, 15 / M, 219 / M), saadKitMat(0xB9B4AA, 0xC8C3B8, 0.85, 0));
  pod.position.set(-29.2, 7.5 / M, 10.6); pod.rotation.y = 1.51; g.add(pod);
  // the roof: a plane rippled along its length, white, floating on a glass band
  const roofG = new THREE.PlaneGeometry(210 / M, 130 / M, 40, 8);
  const rp = roofG.attributes.position;
  for (let v = 0; v < rp.count; v++) rp.setZ(v, Math.sin(rp.getX(v) * M / 26) * 7 / M);
  /* Laid flat and turned in the geometry itself — an Euler on the mesh stood it on edge. */
  roofG.rotateX(-Math.PI / 2); roofG.rotateY(1.51 + Math.PI / 2);
  roofG.computeVertexNormals();
  const roofMat = saadKitMat(0xE6E4DE, 0xF7F6F2, 0.6, 0.05); roofMat.side = THREE.DoubleSide; roofMat.userData.dayMats.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(roofG, roofMat);
  roof.position.set(-24, 30 / M, 13);
  roof.userData.hero = roof.userData.kitName = 'adgmSquare'; g.add(roof);
  const band = new THREE.Mesh(new THREE.BoxGeometry(200 / M, 12 / M, 120 / M), saadKitMat(0x2E4650, 0xBFDCE8, 0.3, 0.2, 0xBFE4EC, 0.2));
  band.position.set(-24, 21 / M, 13); band.rotation.y = 1.51 + Math.PI / 2; g.add(band);
  const glass = kitGlass(0x223644, 0xA3BFD0, 0.3, 0.1);
  for (const [x, z, h, w, d, rot] of [[-16.8, 6.1, 155, 63.4, 39.7, 1.487], [-19, 23.5, 155, 64.1, 40.7, 1.46],
                                       [-27.6, 0.5, 131, 71.3, 40, -0.1], [-31.4, 26.4, 131, 70.5, 40.2, -0.088]]){
    const t = new THREE.Mesh(shearBox(w, d, h, 6), glass);
    t.position.set(x, h / M / 2, z); t.rotation.y = rot; g.add(t);
  }
  return g;
}
/* CLEVELAND CLINIC ABU DHABI — a white podium under a stepped 110 m tower with dark glass
   bands, on the survey's tower and podium records. */
function diagridTex(base, line){
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d'); c.fillStyle = base; c.fillRect(0, 0, N, N);
  c.strokeStyle = line; c.lineWidth = 3;
  for (let k = -N; k <= 2 * N; k += 32){ c.beginPath(); c.moveTo(k, 0); c.lineTo(k + N, N); c.stroke(); c.beginPath(); c.moveTo(k, N); c.lineTo(k + N, 0); c.stroke(); }
  c.lineWidth = 1.5; for (let y = 0; y < N; y += 16){ c.beginPath(); c.moveTo(0, y); c.lineTo(N, y); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function clevelandClinic(){
  /* TO THE PHOTOGRAPHS (city v116): green diagrid-glass volumes stacked and cantilevered over a
     long white perforated podium with a roof garden, an orange perforated box hung off the west
     end on columns, a dark glass tower at the east end, and lawn parterres running south to the
     water. The survey's 110 m tower record sets the height and the rotation. */
  const g = new THREE.Group(), M = M_PER_U, rot = 1.457, at = _placeRot(-38, 68, rot);
  const dg = diagridTex('#ffffff', 'rgba(30,70,60,0.55)');
  const glassN = new THREE.MeshStandardMaterial({ color:0x1E3A34, map:dg, roughness:0.3, metalness:0.2, emissive:0x9FD8C8, emissiveIntensity:0.22 });
  glassN.userData.glassOverride = false; glassN.userData.duskColor = 0x8FC9BC; glassN.userData.nightAlbedo = 1.4;
  glassN.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xA9DCCF, map:dg, roughness:0.3, metalness:0.25 });
  const glassT = glassN.clone(); glassT.map = dg; glassT.userData = { ...glassN.userData };
  const white = saadKitMat(0xE4E2DD, 0xF3F1EC, 0.8, 0.05, undefined, undefined, 0.5);
  const dark = saadKitMat(0x1C242C, 0x2E3A46, 0.35, 0.3, 0xBFD8EA, 0.25, 1.0);
  const orange = saadKitMat(0xD08A2A, 0xE8A33A, 0.7, 0.1, 0xFFB050, 0.25, 1.0);
  const lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0), pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0);
  const box = (ax, az, w, d, h, y0, mat, extraRot) => { const [px, pz] = at(ax / M, az / M); const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(px, (y0 + h / 2) / M, pz); m.rotation.y = rot + (extraRot || 0); g.add(m); return m; };
  // the podium: 230 x 120 m, 24 m, white, with a dark glass ground band and a roof garden
  box(0, 0, 230, 120, 24, 0, white);
  box(0, 0, 232, 122, 5, 0, dark);
  box(20, 10, 150, 70, 0.8, 24, lawn);
  for (const az of [-20, 0, 20, 40]) box(20, az, 140, 3, 0.9, 24.4, pave);
  // the glass: a long bar along the front over the podium, the big block on top, the stack behind
  box(-20, -45, 200, 30, 32, 26, glassN);
  const main = box(-30, 0, 128, 40, 70, 40, glassT); main.userData.hero = main.userData.kitName = 'clevelandClinic';
  box(-70, 30, 60, 50, 46, 40, glassN);
  box(20, 30, 70, 44, 52, 40, glassN);
  // the orange box hung off the west end, on two columns
  box(-125, -40, 34, 26, 30, 30, orange);
  for (const az of [-52, -28]) box(-125, az, 4, 4, 30, 0, white);
  // the dark tower at the east end
  box(105, 5, 40, 34, 92, 0, dark);
  box(105, 5, 42, 36, 2, 92, white);
  // the roof: plant room and helipad
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(11 / M, 11 / M, 1 / M, 24), saadKitMat(0x8A8F94, 0xB8BDC2, 0.8, 0));
  const [hx, hz] = at(-30 / M, 0); pad.position.set(hx, 111 / M, hz); g.add(pad);
  // the grounds: lawn parterres to the south with paths, palms along the edges
  box(0, 110, 230, 90, 0.6, 0, lawn);
  for (const ax of [-80, -40, 0, 40, 80]) box(ax, 110, 3, 80, 0.7, 0, pave);
  for (const az of [80, 110, 140]) box(0, az, 220, 3, 0.7, 0, pave);
  const palms = [];
  for (let ax = -110; ax <= 110; ax += 11) palms.push(at(ax / M, 158 / M)), palms.push(at(ax / M, -66 / M));
  for (let az = -60; az <= 150; az += 12) palms.push(at(-120 / M, az / M)), palms.push(at(120 / M, az / M));
  kitPalms(g, palms, 0.8);
  return g;
}
/* YAS WATERWORLD — the pearl-shell canopy, three slide towers with their coloured spirals, the
   wave pool and the lazy river, on the park's centre. */
function yasWaterworld(x0, z0){
  /* TO THE PHOTOGRAPHS (city v116): the pearl on its rock tower over the middle of the park, a
     field of coloured slide tubes on tan towers, the tan village buildings with their canopies,
     the wave pool and the lazy river, and the car park's shade rows to the north. */
  const g = new THREE.Group(), M = M_PER_U, at = (ax, az) => [x0 + ax / M, z0 + az / M];
  const water = saadKitMat(0x2E8A9E, 0x4FC1D6, 0.2, 0.1, 0x7FE0F0, 0.2, 1.0);
  const rock = saadKitMat(0x6E5A48, 0x8C7458, 0.95, 0), tan = saadKitMat(0xC9B48E, 0xDCC7A0, 0.85, 0, undefined, undefined, 0.6);
  const pearl = saadKitMat(0xE8E6E0, 0xF8F6F0, 0.3, 0.1, 0xFFF0D8, 0.35, 0.9), shade = saadKitMat(0xD9CBA8, 0xEEDFBC, 0.8, 0);
  const box = (ax, az, w, d, h, mat, y0) => { const [px, pz] = at(ax, az); const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(px, ((y0 || 0) + h / 2) / M, pz); g.add(m); return m; };
  // pools
  const wave = new THREE.Mesh(new THREE.CircleGeometry(40 / M, 32), water); wave.rotation.x = -Math.PI / 2; const [wx, wz] = at(-70, -10); wave.position.set(wx, 0.06, wz); g.add(wave);
  const river = new THREE.Mesh(new THREE.RingGeometry(60 / M, 70 / M, 48), water); river.rotation.x = -Math.PI / 2; const [rx, rz] = at(20, 20); river.position.set(rx, 0.06, rz); g.add(river);
  // the pearl on its rock tower
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(5 / M, 9 / M, 46 / M, 10), rock); const [tx, tz] = at(0, -20); tower.position.set(tx, 23 / M, tz); g.add(tower);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(11 / M, 24, 16), pearl); ball.position.set(tx, 56 / M, tz); ball.userData.hero = ball.userData.kitName = 'yasWaterworld'; g.add(ball);
  // the village: tan blocks with canopies round the pools
  [[-110, -40, 40, 26, 12], [-100, 30, 30, 22, 10], [60, -60, 36, 24, 14], [90, 10, 28, 20, 9], [-40, 60, 44, 24, 11], [40, 70, 30, 20, 10]].forEach(([ax, az, w, d, h]) => {
    box(ax, az, w, d, h, tan); box(ax, az, w + 6, d + 6, 0.8, shade, h + 1);
  });
  // slide towers with coloured tubes: five towers, each with two tube spirals and a straight run
  const cols = [[0xF2B233, 0xFFC94A], [0xE0522D, 0xFF6A3D], [0x2F86C9, 0x4FA8E8], [0x3FA36B, 0x5CC48A], [0xB04FC2, 0xCC6FE0]];
  [[30, -50, 34], [-20, 30, 30], [60, 40, 26], [-60, -60, 28], [100, -30, 24]].forEach(([dx, dz, h], i) => {
    const tw = box(dx, dz, 8, 8, h, rock);
    for (let k = 0; k < 2; k++){
      const mat = saadKitMat(cols[(i + k) % 5][0], cols[(i + k) % 5][1], 0.5, 0.1, undefined, undefined, 1.2);
      const tube = new THREE.Mesh(new THREE.TorusGeometry((14 + k * 5) / M, 1.5 / M, 8, 36, Math.PI * 1.7), mat);
      tube.rotation.set(Math.PI / 2 - 0.4, 0, i * 1.1 + k * 2.1); const [px, pz] = at(dx, dz); tube.position.set(px, h / M * (0.6 - k * 0.2), pz); g.add(tube);
    }
    const run = new THREE.Mesh(new THREE.BoxGeometry(2.2 / M, 1.2 / M, (h * 1.6) / M), saadKitMat(cols[(i + 2) % 5][0], cols[(i + 2) % 5][1], 0.5, 0.1, undefined, undefined, 1.2));
    const [px, pz] = at(dx, dz + h * 0.8); run.position.set(px, h / M * 0.5, pz); run.rotation.x = -Math.atan2(h, h * 1.6); g.add(run);
  });
  // the car park's shade rows to the north
  for (let i = 0; i < 6; i++) box(-90 + i * 32, -110, 26, 60, 0.6, shade, 4);
  const palms = [];
  for (let ax = -130; ax <= 130; ax += 12) palms.push(at(ax, 100)), palms.push(at(ax, -80));
  kitPalms(g, palms, 0.7);
  return g;
}
/* AL RAHA BEACH HOTEL — a low arcaded hotel in warm sandstone with a domed pavilion, on its
   two surveyed footprints, which were reserved in the Raha kit zones for it. */
function rahaBeachHotel(){
  const g = new THREE.Group(), M = M_PER_U;
  const stone = saadKitMat(0xCDB19E, 0xE2C6B2, 0.9, 0), pale = saadKitMat(0xE4D6C8, 0xF0E6DA, 0.85, 0);
  const glass = saadKitMat(0x1C3A44, 0x3E8A9A, 0.25, 0.3);
  const block = (x, z, w, d, h, rot, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(x, h / M / 2, z); m.rotation.y = rot; g.add(m); return m; };
  const A = block(-203.27, 101.76, 197.7, 95.1, 18, 0.321, stone); A.userData.hero = A.userData.kitName = 'rahaBeachHotel';
  block(-218.53, 95.47, 120.8, 34.8, 14, -1.264, stone);
  // arcade: pale piers along both long faces of A
  const at = _placeRot(-203.27, 101.76, 0.321);
  for (let i = -8; i <= 8; i++) for (const s of [-1, 1]){
    const [px, pz] = at(i * 11 / M, s * 48 / M);
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2 / M, 12 / M, 2.2 / M), pale); pier.position.set(px, 6 / M, pz); pier.rotation.y = 0.321; g.add(pier);
    if (i < 8){ const [ax, az] = at((i + 0.5) * 11 / M, s * 47.4 / M);
      const arch = new THREE.Mesh(new THREE.BoxGeometry(7 / M, 9 / M, 0.3 / M), glass); arch.position.set(ax, 6 / M, az); arch.rotation.y = 0.321; g.add(arch); }
  }
  const pav = block(-203.27, 101.76, 34, 34, 26, 0.321, pale);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(11 / M, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), saadKitMat(0xC9A96A, 0xD9BC7A, 0.5, 0.3, 0xE8B547, 0.2));
  dome.position.set(-203.27, 26 / M, 101.76); g.add(dome);
  return g;
}
/* MANARAT AL SAADIYAT AND BERKLEE ABU DHABI — the low white gallery with its deep overhanging
   roof, and the small cube with the glass drum next door, on their surveyed footprints. */
function manaratSaadiyat(){
  const g = new THREE.Group(), M = M_PER_U;
  const white = saadKitMat(0xE2E1DC, 0xF4F3EF, 0.7, 0.05), dark = saadKitMat(0x1C262C, 0x35464F, 0.35, 0.3);
  const body = new THREE.Mesh(new THREE.BoxGeometry(230 / M, 11 / M, 80 / M), white);
  body.position.set(-214.4, 5.5 / M, 163.2); body.userData.hero = body.userData.kitName = 'manaratSaadiyat'; g.add(body);
  const band = new THREE.Mesh(new THREE.BoxGeometry(232 / M, 5 / M, 82 / M), dark);
  band.position.set(-214.4, 3 / M, 163.2); g.add(band);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(245 / M, 2.5 / M, 92 / M), white);
  roof.position.set(-214.4, 12.2 / M, 163.2); g.add(roof);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(60 / M, 16 / M, 56 / M), white);
  cube.position.set(-220.3, 8 / M, 181.2); cube.rotation.y = -1.42; g.add(cube);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(18 / M, 18 / M, 18 / M, 28), dark);
  drum.position.set(-220.3 + 2.5, 9 / M, 181.2 - 1.5); g.add(drum);
  return g;
}

/* BAB AL QASR — the twin-towered Arabesque hotel between Emirates Palace and Etihad Towers:
   sandstone cladding, pointed-arch crowns, a domed link block. On the survey's 140 m record. */
function babAlQasr(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const stone = saadKitMat(0xC9B191, 0xE0CCAA, 0.85, 0, 0xFFE0B0, 0.06), gold = saadKitMat(0xC9A96A, 0xD9BC7A, 0.5, 0.3, 0xE8B547, 0.2);
  const glass = saadKitMat(0x1E2E3A, 0x4E6E82, 0.3, 0.3);
  [-1, 1].forEach(sg => {
    const [tx, tz] = at(sg * 24 / M, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(30 / M, 120 / M, 40 / M), stone);
    t.position.set(tx, 60 / M, tz); t.rotation.y = rot; if (sg < 0) t.userData.hero = t.userData.kitName = 'babAlQasr'; g.add(t);
    for (const side of [-1, 1]){
      const [gx, gz] = at(sg * 24 / M, side * 20.3 / M);
      const band = new THREE.Mesh(new THREE.BoxGeometry(22 / M, 104 / M, 0.4 / M), glass);
      band.position.set(gx, 58 / M, gz); band.rotation.y = rot; g.add(band);
    }
    const crown = new THREE.Mesh(new THREE.ConeGeometry(16 / M, 14 / M, 4), stone);
    crown.position.set(tx, 127 / M, tz); crown.rotation.y = rot + Math.PI / 4; g.add(crown);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(1.2 / M, 8 / M, 8), gold);
    fin.position.set(tx, 138 / M, tz); g.add(fin);
  });
  const link = new THREE.Mesh(new THREE.BoxGeometry(34 / M, 40 / M, 44 / M), stone);
  link.position.set(x0, 20 / M, z0); link.rotation.y = rot; g.add(link);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(12 / M, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), gold);
  dome.position.set(x0, 40 / M, z0); g.add(dome);
  const pod = new THREE.Mesh(new THREE.BoxGeometry(84 / M, 10 / M, 66 / M), stone);
  pod.position.set(x0, 5 / M, z0); pod.rotation.y = rot; g.add(pod);
  return g;
}
/* SAADIYAT BEACH RESORTS — the two big resort parcels the survey carries on the north beach:
   low white wings with terracotta roofs round a pool court. The names are the best reading of
   the beach's order (Park Hyatt west of Jumeirah); the St. Regis parcel is not in the survey. */
function saadiyatResorts(){
  const g = new THREE.Group(), M = M_PER_U;
  const white = saadKitMat(0xE0DCD2, 0xF3F0E8, 0.8, 0), roof = saadKitMat(0xA8654A, 0xC2775A, 0.85, 0);
  const water = saadKitMat(0x2E8A9E, 0x4FC1D6, 0.2, 0.1, 0x7FE0F0, 0.15), lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0);
  const wing = (at, ax, az, w, d, h, rot) => {
    const [px, pz] = at(ax / M, az / M);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), white); b.position.set(px, h / M / 2, pz); b.rotation.y = rot; g.add(b);
    const r = new THREE.Mesh(new THREE.BoxGeometry((w + 3) / M, 2.2 / M, (d + 3) / M), roof); r.position.set(px, (h + 1.1) / M, pz); r.rotation.y = rot; g.add(r);
    return b;
  };
  for (const [cx, cz, rot, W, D, name] of [[-35.8, 34, 0.63, 240, 225, 'parkHyattSaadiyat'], [-4.9, 11.4, 0.6, 249, 164, 'jumeirahSaadiyat']]){
    const at = _placeRot(cx, cz, rot);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W / M, 1.2 / M, D / M), lawn); ground.position.set(cx, 0.6 / M, cz); ground.rotation.y = rot; g.add(ground);
    const main = wing(at, 0, -D / 2 + 30, W * 0.8, 40, 22, rot); main.userData.hero = main.userData.kitName = name;
    wing(at, -W / 2 + 22, 20, 30, D * 0.6, 16, rot);
    wing(at,  W / 2 - 22, 20, 30, D * 0.6, 16, rot);
    const [px, pz] = at(0, 30 / M);
    const pool = new THREE.Mesh(new THREE.BoxGeometry(W * 0.3 / M, 0.6 / M, D * 0.3 / M), water); pool.position.set(px, 1.4 / M, pz); pool.rotation.y = rot; g.add(pool);
    const palms = [];
    for (let ax = -W / 2 + 10; ax <= W / 2 - 10; ax += 10) palms.push(at(ax / M, (D / 2 - 6) / M)), palms.push(at(ax / M, (-D / 2 + 6) / M));
    for (let ax = -W * 0.18; ax <= W * 0.18; ax += 9) palms.push(at(ax / M, (30 + D * 0.18) / M)), palms.push(at(ax / M, (30 - D * 0.18) / M));
    kitPalms(g, palms, 0.8);
  }
  return g;
}

/* FOUR SEASONS AND ROSEWOOD, AL MARYAH — the two hotel towers on the island's west and north
   edges, on their surveyed records (144 m and 140 m). Four Seasons is a banded stone-and-glass
   block with a light crown; Rosewood a bronze glass slab that narrows to a sloping top. */
function maryahHotels(){
  const g = new THREE.Group(), M = M_PER_U;
  const stone = saadKitMat(0xD7D2C8, 0xECE8E0, 0.8, 0), glassD = saadKitMat(0x22303A, 0x5C7A8C, 0.3, 0.3);
  // Four Seasons: 86.6 x 39 m, 144 m, rot -0.371
  { const x = -40.2, z = -14.4, rot = -0.371;
    const t = new THREE.Mesh(new THREE.BoxGeometry(86.6 / M, 144 / M, 39 / M), stone);
    t.position.set(x, 72 / M, z); t.rotation.y = rot; t.userData.hero = t.userData.kitName = 'fourSeasonsMaryah'; g.add(t);
    for (let i = 0; i < 9; i++){
      const b = new THREE.Mesh(new THREE.BoxGeometry(87.2 / M, 9 / M, 39.6 / M), glassD);
      b.position.set(x, (12 + i * 15) / M, z); b.rotation.y = rot; g.add(b);
    }
    const crown = new THREE.Mesh(new THREE.BoxGeometry(92 / M, 4 / M, 44 / M), stone);
    crown.position.set(x, 146 / M, z); crown.rotation.y = rot; g.add(crown);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(110 / M, 12 / M, 60 / M), stone);
    pod.position.set(x, 6 / M, z); pod.rotation.y = rot; g.add(pod); }
  // Rosewood: 78.7 x 31 m, 140 m, rot -0.187
  { const x = -46.3, z = 34.6, rot = -0.187;
    const t = new THREE.Mesh(ellipTower(79, 31, 140, 0.18, 12, 36), kitGlass(0x3A2E22, 0xB39A78, 0.3, 0.15));
    t.position.set(x, 70 / M, z); t.rotation.y = rot; t.userData.hero = t.userData.kitName = 'rosewoodMaryah'; g.add(t);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(4 / M, 148 / M, 34 / M), stone);
    fin.position.set(x, 74 / M, z); fin.rotation.y = rot; g.add(fin);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(100 / M, 10 / M, 56 / M), stone);
    pod.position.set(x, 5 / M, z); pod.rotation.y = rot; g.add(pod); }
  return g;
}
/* ST. REGIS SAADIYAT — the cream palace-hotel with its two arms curving down to the beach and
   a dome over the centre. Its parcel is not in the survey, so the site was found by grid search:
   inside the outline, 21 units from the shore, 30 from the nearest road, west of Park Hyatt. */
function stRegisSaadiyat(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const cream = saadKitMat(0xE0D4BE, 0xF1E8D6, 0.85, 0), roof = saadKitMat(0xA8654A, 0xC2775A, 0.85, 0);
  const water = saadKitMat(0x2E8A9E, 0x4FC1D6, 0.2, 0.1, 0x7FE0F0, 0.15), lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0);
  const box = (ax, az, w, d, h, r, mat) => { const [px, pz] = at(ax / M, az / M); const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(px, h / M / 2, pz); m.rotation.y = rot + r; g.add(m); return m; };
  const ground = box(0, 0, 330, 170, 1.2, 0, lawn);
  const main = box(0, 30, 70, 46, 32, 0, cream); main.userData.hero = main.userData.kitName = 'stRegisSaadiyat';
  const dome = new THREE.Mesh(new THREE.SphereGeometry(13 / M, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), roof);
  const [dx, dz] = at(0, 30 / M); dome.position.set(dx, 32 / M, dz); g.add(dome);
  // the arms: four bays each side, stepping forward (toward -z, the sea) and turning as they go
  [-1, 1].forEach(sg => {
    for (let i = 0; i < 4; i++){
      const ax = sg * (50 + i * 34), az = 26 - i * i * 4.5, turn = -sg * i * 0.18;
      const b = box(ax, az, 38, 22, 22 - i * 2, turn, cream);
      const [rx, rz] = at(ax / M, az / M);
      const r = new THREE.Mesh(new THREE.BoxGeometry(41 / M, 2 / M, 25 / M), roof); r.position.set(rx, (23 - i * 2) / M, rz); r.rotation.y = rot + turn; g.add(r);
    }
  });
  const pool = box(0, -30, 90, 30, 0.6, 0, water); pool.position.y = 1.5 / M;
  box(0, -62, 300, 10, 0.5, 0, saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0));   // the beach walk
  const palms = [];
  for (let ax = -150; ax <= 150; ax += 9) palms.push(at(ax / M, -70 / M));
  for (let ax = -60; ax <= 60; ax += 8) palms.push(at(ax / M, -20 / M)), palms.push(at(ax / M, -42 / M));
  for (let az = 40; az <= 80; az += 8) palms.push(at(-12 / M, az / M)), palms.push(at(12 / M, az / M));
  kitPalms(g, palms, 0.8);
  return g;
}
/* NYU ABU DHABI — the campus: a grid of pale blocks round a central quad, with the taller
   library block, on the survey's own records (they all carry a placeholder 6.4 m). */
function nyuCampus(){
  const g = new THREE.Group(), M = M_PER_U;
  const pale = saadKitMat(0xD9D6CE, 0xEDEAE3, 0.8, 0), glassD = saadKitMat(0x22303A, 0x4E6878, 0.3, 0.3), lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0);
  const quad = new THREE.Mesh(new THREE.BoxGeometry(150 / M, 1 / M, 90 / M), lawn); quad.position.set(-8, 0.5 / M, 314); quad.rotation.y = -0.66; g.add(quad);
  [[6.4, 320.3, 205, 102, -0.66, 18], [-8.7, 308.3, 166, 96, -0.69, 14], [-8.4, 308.3, 90, 57, -0.82, 34],
   [-26.2, 309.9, 119, 75, -0.72, 16], [-35.1, 302, 112, 64, -0.79, 20], [-3.6, 335.9, 108, 97, 0.01, 16],
   [-7.4, 323.6, 117, 105, 0.23, 12], [-22.1, 297.9, 178, 88, -0.63, 18], [4.5, 325.6, 143, 31, -0.58, 22]].forEach(([x, z, w, d, rot, h], i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86 / M, h / M, d * 0.86 / M), pale);
    b.position.set(x, h / M / 2, z); b.rotation.y = rot; if (i === 2) b.userData.hero = b.userData.kitName = 'nyuCampus'; g.add(b);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.87 / M, (h * 0.35) / M, d * 0.87 / M), glassD);
    gl.position.set(x, h * 0.55 / M, z); gl.rotation.y = rot; g.add(gl);
  });
  return g;
}
/* MAMSHA AL SAADIYAT — the beachfront row: stepped white apartment blocks with terraces facing
   the sea, on the survey's 219 by 91 m parcel. */
function mamshaSaadiyat(blocks, prom){
  /* TO THE RENDERS (city v120). Each block is a U opening to the beach: a seven-storey bar on the
     road side and two lower wings reaching toward the sand round a pool court, every storey a
     glass band, terraces stepping down to the beach, a planted roof. The promenade runs along the
     sand with a palm row and beach kiosks; the beach road with its palm median runs behind.
     `prom` is kept for the call site; the promenade is laid from the blocks themselves. */
  const g = new THREE.Group(), M = M_PER_U, F = 3.6;
  const white = saadKitMat(0xE6E4DE, 0xF6F4EF, 0.8, 0), cream = saadKitMat(0xDDD6C8, 0xEFE9DC, 0.85, 0);
  const glassD = saadKitMat(0x22303A, 0x5C7A8C, 0.3, 0.3, 0xBFD8EA, 0.18, 1.0);
  const pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0), lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0);
  const pool = saadKitMat(0x2E8A9E, 0x4FC1D6, 0.2, 0.1, 0x7FE0F0, 0.15), canopy = saadKitMat(0xD9C9A6, 0xEFE3C6, 0.7, 0);
  const umbrella = saadKitMat(0xE6E1D3, 0xF8F4EA, 0.6, 0), road = saadKitMat(0x3A3936, 0x4A4946, 0.95, 0, undefined, undefined, 0.8);
  const palms = [];
  const at = (cx, cz, rot) => (ax, az) => [cx + ax * Math.cos(rot) + az * Math.sin(rot), cz - ax * Math.sin(rot) + az * Math.cos(rot)];
  const slab = (x, z, w, d, h, mat, rot, y0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(x, ((y0 || 0) + h / 2) / M, z); m.rotation.y = rot; g.add(m); return m; };
  const bar = (cx, cz, rot, ax, az, w, d, storeys, mat) => {
    const [x, z] = at(cx, cz, rot)(ax / M, az / M), h = storeys * F;
    const b = slab(x, z, w, d, h, mat, rot);
    for (let f = 0; f < storeys; f++) slab(x, z, w + 0.4, d + 0.4, F * 0.45, glassD, rot, f * F + F * 0.3);
    slab(x, z, w * 0.9, d * 0.9, 0.5, lawn, rot, h + 0.25);
    return b;
  };
  blocks.forEach((b, i) => {
    const { x, z, rot, len, dep, storeys } = b, mat = i % 2 ? white : cream, cat = at(x, z, rot);
    const main = bar(x, z, rot, 0, dep * 0.32, len, dep * 0.36, storeys, mat);
    if (i === 4) main.userData.hero = main.userData.kitName = 'mamshaSaadiyat';
    bar(x, z, rot, -(len / 2 - 11), -dep * 0.1, 22, dep * 0.5, storeys - 2, mat);
    bar(x, z, rot, (len / 2 - 11), -dep * 0.1, 22, dep * 0.5, storeys - 2, mat);
    bar(x, z, rot, -(len / 2 - 8), -dep * 0.42, 16, dep * 0.16, Math.max(1, storeys - 4), mat);
    bar(x, z, rot, (len / 2 - 8), -dep * 0.42, 16, dep * 0.16, Math.max(1, storeys - 4), mat);
    const [px, pz] = cat(0, -dep * 0.12 / M); slab(px, pz, len - 50, dep * 0.4, 0.4, lawn, rot, 0.3); slab(px, pz, 26, 12, 0.5, pool, rot, 0.5);
    const [kx, kz] = cat(0, -(dep / 2 + 10) / M); slab(kx, kz, 24, 12, 4.5, glassD, rot); slab(kx, kz, 30, 16, 0.5, canopy, rot, 4.6);
    for (let ax = -len / 2; ax <= len / 2; ax += 9) palms.push(cat(ax / M, -(dep / 2 + 4) / M));
    for (let k = -1; k <= 1; k++) for (const uz of [-(dep / 2 + 18), -(dep / 2 + 24)]){ const [ux, uz2] = cat((k * 12) / M, uz / M); const u = new THREE.Mesh(new THREE.CylinderGeometry(1.8 / M, 1.8 / M, 0.3 / M, 10), umbrella); u.position.set(ux, 2.4 / M, uz2); g.add(u); }
  });
  for (let i = 0; i + 1 < blocks.length; i++){
    const a = blocks[i], b = blocks[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), ang = Math.atan2(b.z - a.z, b.x - a.x);
    const cat = at((a.x + b.x) / 2, (a.z + b.z) / 2, -ang), rot = -ang;
    const [px, pz] = cat(0, -(a.dep / 2 + 6) / M); slab(px, pz, L * M + 2, 10, 0.4, pave, rot);
    const [rx, rz] = cat(0, (a.dep / 2 + 16) / M); slab(rx, rz, L * M + 2, 22, 0.3, road, rot);
    slab(rx, rz, L * M + 2, 3, 0.6, lawn, rot, 0.3);
    for (let ax = -L * M / 2; ax <= L * M / 2; ax += 10) palms.push(cat(ax / M, (a.dep / 2 + 16) / M));
  }
  kitPalms(g, palms, 0.7);
  return g;
}
function alSeefVillage(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const sand = saadKitMat(0xD2BC96, 0xE4CFA8, 0.85, 0, undefined, undefined, 0.6), pale = saadKitMat(0xE6DCC8, 0xF3EBDA, 0.85, 0), dark = saadKitMat(0x3A3128, 0x5A4C3E, 0.8, 0);
  const pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0), water = saadKitMat(0x2E6A78, 0x4FA9BC, 0.2, 0.1), timber = saadKitMat(0x8C6E4A, 0xA98B64, 0.9, 0);
  const box = (ax, az, w, d, h, mat, y0, r) => { const [px, pz] = at(ax / M, az / M); const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(px, ((y0 || 0) + h / 2) / M, pz); m.rotation.y = rot + (r || 0); g.add(m); return m; };
  box(0, 0, 208, 88, 0.6, pave);
  const main = box(0, 22, 200, 36, 9, sand); main.userData.hero = main.userData.kitName = 'alSeefVillage';
  box(-80, -16, 40, 44, 9, sand); box(80, -16, 40, 44, 9, sand);
  // arcades: pale arch panels along the courtyard faces
  for (let ax = -90; ax <= 90; ax += 10){ box(ax, 3.7, 6, 0.4, 6.5, pale, 0.5); }
  for (const sx of [-1, 1]) for (let az = -36; az <= 4; az += 10) box(sx * 59.7, az, 0.4, 6, 6.5, pale, 0.5);
  // wind towers at the corners and a taller one over the entrance
  for (const [ax, az] of [[-96, 36], [96, 36], [-96, -34], [96, -34]]){ box(ax, az, 7, 7, 16, sand); box(ax, az, 7.6, 7.6, 1.2, dark, 12); box(ax, az, 5, 5, 1, dark, 16); }
  box(0, 36, 12, 12, 20, sand); box(0, 36, 13, 13, 1.2, dark, 15); box(0, 36, 8, 8, 1, dark, 20);
  // the creek side: quay, marina fingers, boats' worth of pontoon
  box(0, -50, 208, 10, 1.2, pave);
  for (let ax = -90; ax <= 90; ax += 20) box(ax, -66, 3, 26, 0.6, timber, 0.4);
  box(0, -64, 214, 30, 0.2, water, -0.3);
  const palms = [];
  for (let ax = -96; ax <= 96; ax += 12) palms.push(at(ax / M, -47 / M)), palms.push(at(ax / M, 46 / M));
  for (let ax = -40; ax <= 40; ax += 13) palms.push(at(ax / M, -12 / M));
  kitPalms(g, palms, 0.75);
  return g;
}
/* YAS BAY WATERFRONT (city v112) — the piece of Yas people actually walk: Pier71's restaurant
   row on the promontory deck (the deck itself is kit.yasBayPier, placed alongside), the bay
   promenade running from the Hilton past the arena to the eastern parcels, and the white
   mid-rise blocks on the parcels behind the arena that the survey carries only as outlines. */
function yasBayWaterfront(){
  const g = new THREE.Group(), M = M_PER_U;
  const pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0), white = saadKitMat(0xE2E0DA, 0xF4F2EC, 0.8, 0);
  const glassD = saadKitMat(0x22303A, 0x5C7A8C, 0.3, 0.3), lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0);
  /* The pier's restaurants are the lit strip of Yas Bay after dark: warm emissive on the
     pavilion glass and the canopies so the promontory reads at night (city v114). */
  const pavGlass = saadKitMat(0x3A3A2E, 0x5C7A8C, 0.3, 0.3, 0xFFC878, 0.45, 1.0);
  const canopy = saadKitMat(0xD9C9A6, 0xEFE3C6, 0.7, 0, 0xFFD9A0, 0.18, 0.8);
  const umbrella = saadKitMat(0xE6E1D3, 0xF8F4EA, 0.6, 0, 0xFFE4B8, 0.12, 0.9);
  const DECK = 1.4 / M;
  /* PIER71: ten glass pavilions in two rows down the promontory, each under a cream canopy on
     posts, with umbrellas on the water side; a paved spine between the rows. ALIGNED TO THE
     PROMONTORY (city v114): the spit runs at 1.45 rad from +x in island units (outline
     (-40,408)->(-35,428) and (-27,404)->(-27,426)); the first pass laid the rows along +z and
     they sat askew against the deck, which is turned to the same axis in w2h-world.js. */
  const PA = 1.45, at = _placeRot(-31.5, 415, -PA), PR = -PA;
  const [sx, sz] = at(0, 0);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(150 / M, 0.3 / M, 6 / M), pave); spine.position.set(sx, DECK + 0.15 / M, sz); spine.rotation.y = PR; g.add(spine);
  const palms = [];
  for (let i = 0; i < 5; i++){
    const ax = (i - 2) * 34 / M;
    [[-3.6, -1], [3.6, 1]].forEach(([azU, side], k) => {
      const [px, pz] = at(ax, azU);
      const b = new THREE.Mesh(new THREE.BoxGeometry(13 / M, 5.5 / M, 18 / M), pavGlass);
      b.position.set(px, DECK + 2.75 / M, pz); b.rotation.y = PR; if (i === 2 && k === 0) b.userData.hero = b.userData.kitName = 'yasBayWaterfront'; g.add(b);
      const [cx, cz] = at(ax, azU + side * 0.4);
      const c = new THREE.Mesh(new THREE.BoxGeometry(18 / M, 0.5 / M, 24 / M), canopy); c.position.set(cx, DECK + 6.2 / M, cz); c.rotation.y = PR; g.add(c);
      for (const [uxU, uzU] of [[-1.2, side * 2.6], [1.2, side * 2.6], [0, side * 3.4]]){
        const [ux, uz] = at(ax + uxU, azU + uzU);
        const u = new THREE.Mesh(new THREE.CylinderGeometry(2 / M, 2 / M, 0.3 / M, 10), umbrella); u.position.set(ux, DECK + 2.6 / M, uz); g.add(u);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15 / M, 0.15 / M, 2.6 / M, 6), canopy); pole.position.set(ux, DECK + 1.3 / M, uz); g.add(pole);
      }
      palms.push(at(ax + 2.2, azU));
    });
  }
  // THE BAY PROMENADE: a paved band one unit inside the shore, from the Hilton round past the
  // arena to the eastern parcels, with a palm row on its landward edge.
  const path = [[-42, 404], [-14, 406], [17, 395], [22, 386], [31, 377], [49, 374], [60, 381], [66, 391]];
  for (let i = 0; i + 1 < path.length; i++){
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(L + 1.2, 0.3 / M, 12 / M), pave);
    seg.position.set((ax + bx) / 2, 0.15 / M, (az + bz) / 2); seg.rotation.y = -ang; g.add(seg);
    const nx = -Math.sin(ang), nz = Math.cos(ang);   // landward normal (the sea is at +z of this shore)
    for (let t = 0.6; t < L; t += 1.3) palms.push([ax + Math.cos(ang) * t - nx * 1.1 * Math.sign(nz || 1), az + Math.sin(ang) * t - nz * 1.1 * Math.sign(nz || 1)]);
  }
  // THE PARCELS BEHIND THE ARENA: white residential blocks with terraces and a glass band, on
  // the survey's own outlines, lawns between them; the long strip on the shore is a two-storey
  // restaurant row.
  [[41.5, 352.7, 100, 86, 1.12, 34], [52.9, 358.8, 77, 36, 1.15, 28], [30.5, 366.1, 62, 43, 1.08, 30],
   [39.6, 371.4, 52, 37, 1.11, 26], [27.6, 347, 53, 36, -0.4, 30], [21.4, 364.1, 71, 29, -0.01, 24],
   [72.9, 392.2, 79, 71, -0.44, 32], [58.5, 377.2, 127, 24, -0.62, 8]].forEach(([x, z, w, d, rot, h]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82 / M, h / M, d * 0.82 / M), white);
    b.position.set(x, h / M / 2, z); b.rotation.y = rot; g.add(b);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(w * 0.83 / M, h * 0.5 / M, d * 0.83 / M), glassD);
    gl.position.set(x, h * 0.45 / M, z); gl.rotation.y = rot; g.add(gl);
    if (h > 12){ const t = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6 / M, 6 / M, d * 0.6 / M), white); t.position.set(x, (h + 3) / M, z); t.rotation.y = rot; g.add(t); }
    else { const c = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9 / M, 0.5 / M, (d + 10) / M), canopy); c.position.set(x, (h + 0.5) / M, z); c.rotation.y = rot; g.add(c); }
    const gr = new THREE.Mesh(new THREE.BoxGeometry((w + 10) / M, 0.6 / M, (d + 10) / M), lawn); gr.position.set(x, 0.3 / M, z); gr.rotation.y = rot; g.add(gr);
  });
  kitPalms(g, palms, 0.75);
  return g;
}

/* CAFE DEL MAR, YAS BAY (city v117) — the beach club on its own piled platform out in the bay
   between Pier71 and the arena: the lagoon pool in the middle, sand and sunbed rows either
   side, the round sunset deck with its bar at the seaward tip, the club building at the
   landward end, umbrellas and palms. Local +z is seaward. */
function cafeDelMar(x0, z0, rot){
  const g = new THREE.Group(), M = M_PER_U, at = _placeRot(x0, z0, rot);
  const pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0), sand = saadKitMat(0xD9CBA8, 0xEEDFBC, 0.9, 0);
  const water = saadKitMat(0x2E8A9E, 0x4FC1D6, 0.2, 0.1, 0x7FE0F0, 0.3, 1.0), white = saadKitMat(0xE2E0DA, 0xF4F2EC, 0.8, 0, 0xFFE0B8, 0.1, 0.8);
  const timber = saadKitMat(0x8C6E4A, 0xA98B64, 0.9, 0), umbrella = saadKitMat(0xE6E1D3, 0xF8F4EA, 0.6, 0, 0xFFE4B8, 0.12, 0.9);
  const bed = saadKitMat(0xE8E4DA, 0xF6F3EC, 0.7, 0), pile = saadKitMat(0x4C473E, 0x5A544A, 0.9, 0);
  const box = (ax, az, w, d, h, mat, y0, r) => { const [px, pz] = at(ax / M, az / M); const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(px, ((y0 || 0) + h / 2) / M, pz); m.rotation.y = rot + (r || 0); g.add(m); return m; };
  // the platform and its piles
  const plat = box(0, 0, 72, 96, 3, pave); plat.userData.hero = plat.userData.kitName = 'cafeDelMar';
  for (let ax = -30; ax <= 30; ax += 15) for (let az = -40; az <= 40; az += 20){ const [px, pz] = at(ax / M, az / M); const pl = new THREE.Mesh(new THREE.BoxGeometry(1.2 / M, 8 / M, 1.2 / M), pile); pl.position.set(px, -3 / M, pz); g.add(pl); }
  // the club at the landward end, with its canopy
  box(0, -40, 44, 12, 6, white, 3); box(0, -40, 50, 18, 0.5, timber, 9.5);
  // sand either side, the lagoon in the middle
  box(-24, 0, 20, 60, 0.4, sand, 3); box(24, 0, 20, 60, 0.4, sand, 3);
  const [lx, lz] = at(0, 2 / M);
  const lagoon = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5 / M, 32), water); lagoon.scale.set(20 / M, 1, 28 / M); lagoon.position.set(lx, 3.25 / M, lz); lagoon.rotation.y = rot; g.add(lagoon);
  // sunbeds in rows on the sand, umbrellas between
  for (const sx of [-1, 1]) for (let az = -22; az <= 22; az += 5.5) for (let k = 0; k < 3; k++){
    box(sx * (17 + k * 5), az, 2, 0.8, 0.4, bed, 3.4);
    if (k === 1 && Math.round(az / 5.5) % 2 === 0){ const [ux, uz] = at(sx * 22 / M, az / M); const u = new THREE.Mesh(new THREE.CylinderGeometry(1.8 / M, 1.8 / M, 0.3 / M, 10), umbrella); u.position.set(ux, 5.8 / M, uz); g.add(u); }
  }
  // the sunset deck at the tip: round, stepped, with the bar
  const [dx, dz] = at(0, 52 / M);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(16 / M, 17 / M, 3.5 / M, 28), pave); deck.position.set(dx, 1.75 / M, dz); g.add(deck);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(12 / M, 12 / M, 1 / M, 28), timber); ring.position.set(dx, 4 / M, dz); g.add(ring);
  box(0, 52, 12, 8, 4, white, 4.5); box(0, 52, 18, 14, 0.5, timber, 8.6);
  for (let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2; const [ux, uz] = at(Math.cos(a) * 11 / M, (52 + Math.sin(a) * 11) / M); const u = new THREE.Mesh(new THREE.CylinderGeometry(1.6 / M, 1.6 / M, 0.3 / M, 10), umbrella); u.position.set(ux, 6.5 / M, uz); g.add(u); }
  // the boardwalk edge and the palms
  box(-35, 0, 2, 96, 0.5, timber, 3); box(35, 0, 2, 96, 0.5, timber, 3);
  const palms = [];
  for (let az = -44; az <= 44; az += 8) palms.push(at(-31 / M, az / M)), palms.push(at(31 / M, az / M));
  for (let ax = -20; ax <= 20; ax += 8) palms.push(at(ax / M, -30 / M));
  kitPalms(g, palms, 0.7);
  g.traverse(o => { if (o.isInstancedMesh) o.position.y = 3 / M; });
  return g;
}

/* SAADIYAT GROVE, TO THE MASTERPLAN (city v119). Not in OSM or Overture, so it is laid from the
   published renders: the museum's lake wrapped by a promenade and a crescent of curved terraced
   blocks on its west side; a long galleria with a great flat roof and a glass ridge through the
   middle of the district; rounded-ended terraced blocks with planted roofs on a grid turned with
   the museum; a linear park with fountain pools down the boulevard; a red accent pavilion; palm
   rows along every street. `skip(x, z)` is the world's zone test so nothing lands on a museum. */
function saadiyatGrove(spec){
  /* TO THE MASTERPLAN RENDER (city v120). The district is a grid of courtyard blocks turned
     parallel to the beach, six to eight storeys, cream and white with planted roofs and balcony
     bands; the glass-roofed galleria and the red building at its centre; a low warm-stone
     cluster of courtyard houses at the Louvre end; the museum's lake with its crescent; a broad
     park with paths round the museum's south side; palm medians down every street. */
  const g = new THREE.Group(), M = M_PER_U, F = 3.6, GR = spec.rot, ZX = spec.znm.x, ZZ = spec.znm.z;
  const white = saadKitMat(0xE4E2DC, 0xF5F3EE, 0.8, 0), cream = saadKitMat(0xDDD6C8, 0xEFE9DC, 0.85, 0), stone = saadKitMat(0xC9B08C, 0xDCC3A0, 0.85, 0);
  const glassD = saadKitMat(0x22303A, 0x5C7A8C, 0.3, 0.3, 0xBFD8EA, 0.16, 1.0), glassR = saadKitMat(0x4E8FA8, 0x9FD3E8, 0.25, 0.2, 0xBFE4EC, 0.25, 1.0);
  const lawn = saadKitMat(0x4A6A3A, 0x6B8C4D, 0.9, 0), pave = saadKitMat(0xD8D0BE, 0xEDE6D6, 0.9, 0);
  const water = saadKitMat(0x4FA9BC, 0x6FC8D8, 0.15, 0.1, 0x7FE0F0, 0.15), red = saadKitMat(0xB4382A, 0xD24A38, 0.6, 0.1, 0xFF6A50, 0.15, 1.0);
  const palms = [];
  const hash = (x, z) => Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  const at = (cx, cz, rot) => (ax, az) => [cx + ax * Math.cos(rot) + az * Math.sin(rot), cz - ax * Math.sin(rot) + az * Math.cos(rot)];
  const slab = (x, z, w, d, h, mat, rot, y0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat); m.position.set(x, ((y0 || 0) + h / 2) / M, z); m.rotation.y = rot; g.add(m); return m; };
  const bar = (cx, cz, rot, ax, az, w, d, storeys, mat) => {
    const [x, z] = at(cx, cz, rot)(ax / M, az / M), h = storeys * F;
    const b = slab(x, z, w, d, h, mat, rot);
    for (let f = 0; f < storeys; f++) slab(x, z, w + 0.4, d + 0.4, F * 0.45, glassD, rot, f * F + F * 0.3);
    slab(x, z, w * 0.9, d * 0.9, 0.5, lawn, rot, h + 0.25);
    slab(x, z, w * 0.55, d * 0.6, F, mat, rot, h);
    slab(x, z, w * 0.5, d * 0.55, 0.4, lawn, rot, h + F + 0.2);
    return b;
  };
  const court = (cx, cz, rot, w, d, base, mat) => {
    const t = 16;
    bar(cx, cz, rot, 0, -(d / 2 - t / 2), w, t, base + 1, mat);
    bar(cx, cz, rot, 0, (d / 2 - t / 2), w, t, base, mat);
    bar(cx, cz, rot, -(w / 2 - t / 2), 0, t, d - 2 * t, Math.max(2, base - 1), mat);
    bar(cx, cz, rot, (w / 2 - t / 2), 0, t, d - 2 * t, base, mat);
    slab(cx, cz, w - 2 * t - 4, d - 2 * t - 4, 0.6, lawn, rot, 0.4);
  };
  const lake = new THREE.Mesh(new THREE.RingGeometry(8, 20, 48, 1, Math.PI * 0.5, Math.PI * 1.0), water);
  lake.rotation.x = -Math.PI / 2; lake.rotation.z = -GR; lake.scale.set(1, 1.15, 1); lake.position.set(ZX, 0.05, ZZ); g.add(lake);
  const rim = new THREE.Mesh(new THREE.RingGeometry(20, 22.5, 48, 1, Math.PI * 0.45, Math.PI * 1.1), pave);
  rim.rotation.x = -Math.PI / 2; rim.rotation.z = -GR; rim.scale.set(1, 1.15, 1); rim.position.set(ZX, 0.06, ZZ); g.add(rim);
  for (let i = 0; i < 4; i++){   // the fifth seat is on the boulevard (city v121)
    const a = Math.PI * (0.62 + i * 0.19) + GR, r = 28;
    const x = ZX + Math.cos(a) * r, z = ZZ - Math.sin(a) * r * 1.15;
    if (spec.skip(x, z)) continue;
    const b = bar(x, z, a + Math.PI / 2, 0, 0, 70, 24, 6 + (i % 2), i % 2 ? white : cream);
    if (i === 2) b.userData.hero = b.userData.kitName = 'saadiyatGrove';
    for (let k = -3; k <= 3; k++){ const aa = a + k * 0.03; palms.push([ZX + Math.cos(aa) * 21.5, ZZ - Math.sin(aa) * 21.5 * 1.15]); }
  }
  { const GX = spec.galleria.x, GZ = spec.galleria.z, gat = at(GX, GZ, GR);
    slab(GX, GZ, 190, 80, 10, white, GR);
    slab(GX, GZ, 170, 64, 12, glassR, GR, 10);
    slab(GX, GZ, 200, 90, 2, white, GR, 22);
    for (let ax = -95; ax <= 95; ax += 19) for (const az of [-46, 46]){ const [px, pz] = gat(ax / M, az / M); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9 / M, 0.9 / M, 22 / M, 10), white); c.position.set(px, 11 / M, pz); g.add(c); }
    const [rx, rz] = gat(0, 72 / M); bar(rx, rz, GR, 0, 0, 90, 26, 5, red);
  }
  { const [px, pz] = [spec.park.x, spec.park.z];
    slab(px, pz, spec.park.w, spec.park.d, 0.5, lawn, GR);
    const pat = at(px, pz, GR);
    for (let ax = -spec.park.w / 2 + 30; ax < spec.park.w / 2; ax += 60){ const [qx, qz] = pat(ax / M, 0); slab(qx, qz, 3, spec.park.d - 8, 0.6, pave, GR); }
    for (let az = -spec.park.d / 2 + 30; az < spec.park.d / 2; az += 60){ const [qx, qz] = pat(0, az / M); slab(qx, qz, spec.park.w - 8, 3, 0.6, pave, GR); }
    for (let ax = -spec.park.w / 2 + 15; ax < spec.park.w / 2; ax += 22) for (let az = -spec.park.d / 2 + 15; az < spec.park.d / 2; az += 22) if (hash(ax, az) > 0.35) palms.push(pat(ax / M, az / M));
  }
  for (const cell of spec.cells){
    const { x, z, kind } = cell;
    if (spec.skip(x, z)) continue;
    const dl = Math.hypot((x - ZX), (z - ZZ) / 1.15); if (dl < 36) continue;
    const h = hash(x, z);
    if (kind === 'stone'){ court(x, z, GR, 62, 50, 2 + Math.floor(h * 2), stone); }
    else if (h > 0.55) court(x, z, GR, 76, 60, 5 + Math.floor(h * 3), h > 0.8 ? white : cream);
    else bar(x, z, GR, 0, 0, 78, 24, 6 + Math.floor(h * 3), h > 0.3 ? cream : white);
    const cat = at(x, z, GR);
    for (let k = -3; k <= 3; k++) palms.push(cat(k * 13 / M, 38 / M)), palms.push(cat(k * 13 / M, -38 / M));
    const [mx, mz] = cat(0, 38 / M); slab(mx, mz, 84, 3, 0.5, lawn, GR);
  }
  kitPalms(g, palms, 0.7);
  return g;
}
return { TEX_TOWER, TEX_BLOCK, cityMaterial, curvedTower, roundedSlab,
         etihadTowers, emiratesPalace, qasrAlWatan, marinaMall, fairmontMarina, adnocHQ, grandMosque, ferrariWorld, yasMall, etihadArena, yasBayPier,
         hiltonYasBay, cafeDelMar, yasBayJetty, boxTower, setbackTower, slabTower, taperTower, cityRow, lowRise, aldarHQ, rahaMall,
         louvreAbuDhabi, zayedNationalMuseum, guggenheimAbuDhabi, naturalHistoryMuseum, teamLabPhenomena,
         capitalGate, wAbuDhabi, gateTowers, seaWorldYas, qasrAlHosn, yasCircuit, nationTowers, warnerBrosWorld,
         wtcAbuDhabi, landmarkTower, adnecHalls, foundersMemorial, skyTower, reemMall, adgmSquare, clevelandClinic,
         yasWaterworld, rahaBeachHotel, manaratSaadiyat, babAlQasr, saadiyatResorts,
         maryahHotels, stRegisSaadiyat, nyuCampus, mamshaSaadiyat, yasBayWaterfront, cafeDelMar, alSeefVillage, saadiyatGrove };
}


