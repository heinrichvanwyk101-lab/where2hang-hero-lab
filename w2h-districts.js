// PASTE TARGET: where2hang-hero-lab/w2h-districts.js   (NEW FILE)
//
// DISTRICT CHARACTER — v1
// ---------------------------------------------------------------------------
// Everything that makes one island not another. Pulled out of w2h-world.js so
// it can be tuned without opening a 5,450-line file.
//
// WHY THIS EXISTS. Measured at world v113: SUPERBLOCK_M, PLOT_FRONT_M and
// PLOT_DEPTH_M were global, no district carried an `sb` override, and the only
// vacancy mechanism was `rnd() > 0.90` — ten per cent uniform noise. The five
// islands were therefore the same city at five radii, built to 100 per cent of
// their land. Real Abu Dhabi builds roughly a quarter of its ground and the
// rest carries finished infrastructure with nothing behind it.
//
// TWO SEPARATE MEANINGS OF `tallest`, and they must not be merged:
//   GEN_TALLEST  — ceiling for GENERATED stock (urbanFabric / buildFabricFor).
//                  Corniche is 34 with a cap of 26.
//   FP_TALLEST   — ceiling for MODELLING A MISSING HEIGHT on a real footprint
//                  (footprintsFor). Corniche is 52.
// One number for both would silently change one of the two. They are declared
// apart on purpose.
//
// FRAME. jx, jy are NORMALISED ISLAND COORDINATES, the same values urbanFabric
// gets out of toWorldN and feeds to insideIsle. Roughly -1..1, island centre at
// the origin, before multiplication by d.r.
// ---------------------------------------------------------------------------

/* ===========================================================================
   1. FABRIC GRAIN
   Metres. Read by urbanFabric through roadW(), so these stay true whatever
   the island radius.
   =========================================================================== */

export const DISTRICT_FABRIC = {

  /* Dense, emphatic, long blocks aligned to the island axis, cut by wide
     arterials. This is the one that was already right — it is what the global
     constants were tuned to. Unchanged. */
  corniche: { sb:[200, 130], plotFront:[30,  46], plotDepth:  34 },

  /* FINANCIAL. The bake returns 102 buildings for the whole island and that is
     the true count, not a lookup failure. Very large floorplates, very few of
     them, wide gaps. Al Maryah currently reads as the most convincing island
     in the scene precisely because it carries almost no generated fabric
     (fab1686) — this table is an attempt to make the generator agree with what
     the real data already shows. */
  maryah:   { sb:[320, 220], plotFront:[90, 140], plotDepth:  90 },

  /* TOWERS ON BIG PLOTS. Shams in the north-west is a vertical cluster; Reem
     Hills to the east is terraced villa curls. One island, two grains — the
     zone system in section 3 handles the split, this is the tower half. */
  reem:     { sb:[240, 160], plotFront:[45,  70], plotDepth:  45 },

  /* LOW-RISE CULTURAL. Villas and resorts on generous plots, museums as
     one-offs. Small buildings, large spacing — the opposite of Corniche, which
     is why sharing its plot size made Saadiyat read as a downtown. */
  saadiyat: { sb:[280, 200], plotFront:[22,  34], plotDepth:  26 },

  /* ENTERTAINMENT. Ferrari World, Yas Mall, SeaWorld, Etihad Arena — enormous
     single footprints with car parks around them, and low-rise villa estates
     to the north. The biggest footprint variance of any island by a wide
     margin. */
  yas:      { sb:[420, 300], plotFront:[120, 260], plotDepth: 140 },

  /* PLATTED AND EMPTY. Kept here so the island can be declared without a
     special case in the engine — the vacancy mask below returns true for every
     plot, so these numbers are never actually consumed. */
  lulu:     { sb:[180, 120], plotFront:[26,  38], plotDepth:  30 },
};

/* Fallback for any district not listed. Deliberately the old global values so
   an unlisted island behaves exactly as it did before this module existed. */
export const FABRIC_DEFAULT = { sb:[200, 130], plotFront:[30, 46], plotDepth: 34 };

export function fabricFor(id){
  return DISTRICT_FABRIC[id] || FABRIC_DEFAULT;
}

/* ===========================================================================
   2. HEIGHT CEILINGS
   World units. M_PER_UNIT is 7.8, so metres = units * 7.8.
   =========================================================================== */

/* GENERATED STOCK. What urbanFabric may build up to. */
export const GEN_TALLEST = {
  corniche: 34,   // 265 m — the cap below trims this further
  maryah:   26,   // 203 m  (was 40 = 312 m against a real ~200 m)
  reem:     38,   // 296 m  (was 44 = 343 m against Sky Tower's 292 m)
  /* 39 m, WHICH IS THE CULTURAL DISTRICT AND NOT THE ISLAND.

     v164 put this at 1.5 — 12 m — because Saadiyat's surveyed median is 6.4 m and 83 per cent of
     it is under 10. That is true of the island and false of its north-west corner: the Cultural
     District is six to twelve storeys of pale limestone running from the Louvre past the Zayed
     Museum, and a 12 m ceiling flattened it AND handed every block in it a clay villa roof, which
     is the one thing the aerials say it must not have.

     A bimodal island cannot be described by one ceiling. So this number is now the TALLER mode —
     the Cultural District — and the villa carpet is brought down by lowRise blobs on the district
     entry, which is the mechanism that already exists for exactly this and which Saadiyat was the
     only island never to use. */
  saadiyat:  5,   //  39 m — the Cultural District. Villas handled by lowRise, not by this.
  yas:      14,   // 109 m  (was 18 = 140 m against a real ~105 m)
  lulu:      0,
};

export const GEN_CAP = { corniche: 26 };   // unchanged; others uncapped

/* MODELLING A MISSING HEIGHT ON A REAL FOOTPRINT. A different job: this is the
   ceiling for inventing the 87 per cent of Corniche footprints that arrive
   without a surveyed height, so it sits above the real skyline rather than
   below it. Corniche stays at 52 (406 m against Burj Mohammed bin Rashid's
   381 m) — that one was already correct. */
export const FP_TALLEST = {
  corniche: 52,
  maryah:   26,
  reem:     38,
  saadiyat:  8,
  yas:      14,
};
export const FP_TALLEST_DEFAULT = 24;

export function genTallest(id){
  return GEN_TALLEST[id] !== undefined ? GEN_TALLEST[id] : 24;
}
export function fpTallest(id){
  return FP_TALLEST[id] !== undefined ? FP_TALLEST[id] : FP_TALLEST_DEFAULT;
}

/* ===========================================================================
   3. THE VACANCY MASK
   ---------------------------------------------------------------------------
   THE CONTRACT. This function must be PURE and DETERMINISTIC in (id, jx, jy).
   It must never call rnd(). The mass and detail fabric layers consume the same
   random stream and any branch that moves that stream makes the two layers
   different cities — the fault recorded at w2h-world.js line 1322. A geometric
   test consumes nothing, so it is safe at any position in the plot loop.

   COHERENCE IS THE POINT. Per-plot randomness gives salt-and-pepper, which
   reads as damage. Real vacancy is block-shaped: whole superblocks kerbed and
   empty. The noise below is therefore sampled on a COARSE cell (`grain`) so
   neighbouring plots agree, and only softened at cell edges.
   =========================================================================== */

/* Integer hash → [0,1). No allocation, no Math.random, stable across reloads
   and across the two fabric passes. */
function hash2(x, y, seed){
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1274126177;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

/* Value noise on a coarse lattice, bilinear-blended so patch edges are not
   perfectly straight. Returns [0,1). */
function patchNoise(jx, jy, grain, seed){
  const gx = jx / grain, gy = jy / grain;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0,       fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0,     y0,     seed);
  const n10 = hash2(x0 + 1, y0,     seed);
  const n01 = hash2(x0,     y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}

/* ---------------------------------------------------------------------------
   PER-DISTRICT VACANCY.

   builtRatio — target fraction of plots that survive. Read off the satellite
                captures; the noise threshold is derived from it directly, so
                changing this one number changes coverage predictably.
   grain      — patch size in normalised island units. 0.18 gives patches
                roughly a fifth of the island across, which is superblock-ish
                at these radii. Smaller = more broken up.
   zones      — hard geometric rules applied BEFORE the noise. Each is a
                predicate on (jx, jy) returning true to force the plot empty.
                This is where the recognisable voids live.
   --------------------------------------------------------------------------- */

export const DISTRICT_VACANCY = {

  corniche: {
    builtRatio: 0.55, grain: 0.16, seed: 0x0C0F,
    zones: [
      /* AL BATEEN AIRFIELD. A large clear rectangle on the south-west of the
         island — in the real place it is a runway and its clearance apron, and
         it is one of the few genuinely empty things inside a dense city. */
      (x, y) => x < -0.34 && x > -0.78 && y > -0.30 && y < 0.16,
    ],
  },

  maryah: {
    /* THE HALF-PLANE. The single most recognisable condition on this island:
       glass towers stop and graded sand begins, along a hard line. Everything
       west of it is held empty.

       TUNING NOTE. The island is elongated and carries rot 0.30, so if the
       empty half comes out on the wrong side, negate the comparison rather
       than rotating anything — jx is already in the island's own frame. */
    builtRatio: 0.50, grain: 0.20, seed: 0x1A7A,
    zones: [
      (x, y) => x < -0.06,
    ],
  },

  reem: {
    /* REEM HILLS, east side: terraced earthworks and plotted villa curls,
       largely unbuilt. Najmat in the south-east is patchy. Shams in the
       north-west stays dense, which the noise handles. */
    builtRatio: 0.55, grain: 0.15, seed: 0x2EE3,
    zones: [
      (x, y) => x > 0.40 && y > -0.20,
    ],
  },

  saadiyat: {
    /* THE SECTOR GRID. Vast surveyed parcels across the middle and east of the
       island with service roads and no buildings, plus the Marina District
       where the interchange is built and nothing stands on it. Saadiyat is the
       emptiest of the five by a wide margin. */
    builtRatio: 0.35, grain: 0.22, seed: 0x5AAD,
    zones: [
      (x, y) => x > 0.10 && x < 0.62 && y > -0.34 && y < 0.30,
    ],
  },

  yas: {
    /* Large graded parcels ring the attractions, and Yas North and the Yas Bay
       interior are kerbed superblocks with roundabouts and nothing behind
       them. The attractions themselves are landmarks and reserve their own
       ground through the avoid rectangles, so this mask does not need to know
       about them. */
    builtRatio: 0.40, grain: 0.24, seed: 0x7A50,
    zones: [
      (x, y) => y > 0.30,                      // Yas North
      (x, y) => y < -0.42 && x > -0.30,        // Yas Bay interior
    ],
  },

  /* Entirely unbuilt. Roads, kerbs and roundabouts only. */
  lulu: { builtRatio: 0.0, grain: 0.20, seed: 0x1717, zones: [] },
};

/* Districts with no entry keep the engine's original behaviour: the 10 per
   cent uniform clearance already in the plot loop, and nothing from here. */
export const VACANCY_DEFAULT = null;

/**
 * True when this plot should be left empty.
 *
 * @param {string} id  district id
 * @param {number} jx  normalised island x
 * @param {number} jy  normalised island y
 * @returns {boolean}
 */
/* CALIBRATION, and why builtRatio would otherwise lie.

   Zones and noise both remove ground, so thresholding the noise at builtRatio
   double-counts: a district with zones covering a third of its area and a
   0.55 threshold lands near 0.37, not 0.55. The table would then be a set of
   numbers that do not mean what they say, which is the kind of thing that
   costs an hour six months from now.

   So the zone coverage is measured ONCE per district, on a deterministic
   sunflower sample of the unit disc, and the noise threshold is raised to
   compensate. builtRatio is then the FINAL figure. Cached on first use;
   the sample is fixed so the result is stable across reloads. */
const _cal = {};
function calibrate(v){
  const N = 8192;
  const free = [];
  for (let i = 0; i < N; i++){
    const a = (i * 2.39996323) % (Math.PI * 2);
    const r = Math.sqrt((i + 0.5) / N);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    let hit = false;
    for (let z = 0; z < v.zones.length; z++){
      if (v.zones[z](x, y)){ hit = true; break; }
    }
    if (!hit) free.push(patchNoise(x, y, v.grain, v.seed));
  }
  if (!free.length) return 0;

  /* QUANTILE, NOT ARITHMETIC. patchNoise bilinearly blends four uniform
     hashes, and a blend of uniforms is not itself uniform — it bunches toward
     the middle. Thresholding at t therefore passes rather less than t of the
     plots, which on Saadiyat cost eleven points of coverage before this was
     caught. Sorting the actual values and cutting at the required rank makes
     the result exact whatever the noise distribution does. */
  free.sort((a, b) => a - b);
  const need = Math.floor(v.builtRatio * N);  // plots that must survive
  if (need >= free.length) return Infinity;   // zones alone already too big
  /* A plot is vacant when its noise EXCEEDS the threshold, so the survivors
     are the LOW values: cut at rank `need` counting up from the bottom. */
  return free[need];
}

export function vacantAt(id, jx, jy){
  const v = DISTRICT_VACANCY[id];
  if (!v) return false;                       // unlisted island: unchanged
  if (v.builtRatio >= 1) return false;
  if (v.builtRatio <= 0) return true;

  const zones = v.zones;
  for (let i = 0; i < zones.length; i++){
    if (zones[i](jx, jy)) return true;
  }

  let t = _cal[id];
  if (t === undefined) t = _cal[id] = calibrate(v);
  return patchNoise(jx, jy, v.grain, v.seed) > t;
}

/* Reports the achieved built ratio over a disc of radius 1, for the test
   harness. Zones and noise interact, so the table value is a target rather
   than a guarantee — this is how you find out what you actually got. */
export function measureBuiltRatio(id, samples = 20000){
  let inside = 0, built = 0;
  for (let i = 0; i < samples; i++){
    const a = (i * 2.39996323) % (Math.PI * 2);
    const r = Math.sqrt((i + 0.5) / samples);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    inside++;
    if (!vacantAt(id, x, y)) built++;
  }
  return built / inside;
}

export default {
  DISTRICT_FABRIC, FABRIC_DEFAULT, fabricFor,
  GEN_TALLEST, GEN_CAP, FP_TALLEST, genTallest, fpTallest,
  DISTRICT_VACANCY, vacantAt, measureBuiltRatio,
};
