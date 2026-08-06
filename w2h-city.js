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
export const BUILD = 'city v41';

/* THE PALACE FOOTPRINT, EXPORTED, because w2h-world.js sizes the estate reservation and the lawn
   against it and has now got that wrong twice by reading a stale comment instead of the geometry.
   Half-span 24.6 in x and 6.0 in z, offset 0.4 south of the anchor. One constant, consumed
   wherever the building's extent is needed. */
export const PALACE_FOOT = { w:49.2, d:12.0, dz:0.4 };

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
  0x14161A: 0x8E7B60,   // ADNOC HQ: dark bronze, deliberately below the fabric's stone
  0x151A1F: 0xD3C4A6,   // generic mass: the same precast concrete the fabric uses, so they agree
  0x111C22: 0xB9BCC0,   // Etihad's solar glass reads as brushed metal against a low sun
};

/* DAY COLOURS, WHICH DID NOT EXIST AND SHOULD HAVE.

   world v53 gave the generated fabric day materials so the five wall types stay five wall types
   under the sun. The LANDMARKS were left behind: nothing in this file sets userData.dayMats, so
   the view switcher hands every one of them its fallback dayMat — a single flat 0xC9C2B2 with no
   map at all. In Day, ADNOC and the palace are therefore untextured pale boxes standing in a
   fabric that now has glazing, floor lines and five distinct wall colours. The landmarks look
   less resolved than the background city, which is precisely backwards. */
const DAY_BY_NIGHT = {
  0x14161A: 0x9C8F79,   // ADNOC: bronze, and darker than the sand it stands on
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
function curvedTower(h, rBot, rTop, swell, lean, shear, ell, segs){
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs || 44, 24, false);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++){
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // CLAMPED, and the clamp is load-bearing. Vertex positions are Float32; for a height whose
    // half is not exactly representable (27.7 -> 13.85) the bottom cap lands a few ten-millionths
    // BELOW -h/2, so t comes out very slightly negative. Math.pow(negative, 1.7) is NaN, that NaN
    // writes straight into the position buffer, and three then throws on computeBoundingSphere.
    // Silent for the old heights (30, 33, 28 — halves exact) and triggered the moment the real
    // Etihad ratios went in. Clamping costs nothing and removes a whole class of edge case.
    const t = Math.min(1, Math.max(0, (y + h/2) / h));   // 0 at base, 1 at crown
    const k = 1 + swell * Math.sin(Math.PI * t);
    x *= k; z *= k * ell;
    x += lean * Math.pow(t, 1.7);
    y += shear * (x / Math.max(rBot, 0.001)) * Math.pow(t, 7);
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
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
  /* WIDER, THIRD TIME. The comment above fixed the taper and the spacing and still left these
     too slim: at r 1.95 with ell 0.62 the footprint is 3.9 by 2.4 units, which against a 7.8
     metre unit is a tower 30 m by 19 m. The real ones are nearer 45 by 30, and at dusk — with
     the window emissive dimmed and the profile lit as pale glass — the difference is the whole
     read. They were coming out as smooth grey pipes standing in a field of chunky blocks.
     Centres are unchanged, so the gaps drop to about 2.6 units of sky. That is still enough to
     count five, which is the constraint that governs this cluster. */
  const spec = [
    { dx:-17.0, dz: 3.0, h:27.7, r:2.85, lean: 0.9, shear: 1.1 },
    { dx: -8.5, dz: 0.8, h:30.5, r:3.00, lean: 1.0, shear: 1.3 },
    { dx:  0.0, dz: 0.0, h:26.0, r:2.80, lean: 0.8, shear: 1.0 },
    { dx:  8.0, dz: 0.8, h:23.4, r:2.65, lean: 0.7, shear: 0.9 },
    { dx: 15.5, dz: 3.0, h:21.8, r:2.50, lean: 0.6, shear: 0.8 },
  ];
  spec.forEach((s, i) => {
    // rTop at 0.42 of the base turned these into obelisks. The real towers barely narrow —
    // they are broad curved slabs, and the width is as much of the signature as the lean.
    /* 26 RADIAL SEGMENTS ON THE SIGNATURE SILHOUETTE OF THE CITY. Etihad's towers are lens-shaped
       in plan and the ellipse factor is 0.62, so the tight ends of that lens get the same angular
       spacing as the broad flanks and are where the faceting shows — and the tight ends are
       exactly the edges that read against the sky. 44 segments and 24 height rings; these are
       five meshes in the whole scene, and they are the five the eye goes to first. */
    const geo = curvedTower(s.h, s.r, s.r * 0.74, 0.16, s.lean, s.shear, 0.62, 44);
    // MATERIAL IDENTITY. Every landmark previously shared one near-black mass tone, so the only
    // thing separating them was outline. Etihad is blue-green curtain glass and now reads that
    // way — cool and slightly reflective against the warm haze behind it.
    // Emissive stepped 0.90 -> 0.78 so the warm palace holds the eye FIRST and the cluster
    // second. Light hierarchy is about relative order, not absolute brightness.
    const m = new THREE.Mesh(geo, cityMaterial(TEX_TOWER, 2, Math.max(1, Math.round(s.h/24)), 0.78, 0x111C22));
    m.position.set(x0 + s.dx, s.h/2, z0 + s.dz);
    m.rotation.y = 0.10 + i * 0.06;
    m.userData.hero = true;
    g.add(m);
  });
  return g;
}

/* EMIRATES PALACE — the counterweight to the towers. Very wide, very low, symmetric, with a
   dome rhythm that steps down from a large centre to corner pavilions. Its horizontality is what
   makes the cluster beside it read as tall, so the width is not decoration — it is the scale
   contrast the brief asks for, built into the composition. */
function emiratesPalace(x0, z0){
  const g = new THREE.Group();
  // Three tones, not one. At a single emissive the body, wings and arcade fused into a
  // continuous gold bar and the dome rhythm — the only thing that identifies this building —
  // disappeared into it. The masses go dark and the domes carry the light.
  /* The three dusk colours keep the same relationship the night emissives do: the masses sit
     back, the arcade is a step up, the domes carry the light. Warmer and paler than anything in
     the generated fabric, because the palace is the one building on the island made of dressed
     stone rather than render or precast — and at dusk that difference is most of what makes it
     read as a palace instead of a long low block. */
  /* THE PALACE WENT THE SAME COLOUR AS THE CITY, and that is a new fault created by fixing an
     older one.

     world v77 added painted white render at 0xE9E4DA and gave it a third of the fabric, which is
     right — it is the commonest wall in Abu Dhabi and its absence was why the island read gold.
     But the palace stone was 0xE7D5B0, which is within a couple of points of it. So the one
     building that had been distinct by being warmer than everything around it is now the same
     value as a third of its neighbours, and the separation that identified it is gone.

     Every photograph has this building as terracotta-rose against pale towers. That contrast does
     as much identifying work as the domes do — arguably more at distance, where the dome rhythm
     is a few pixels and the colour is the whole silhouette. Pulled warm and red, and away from
     anything the fabric can produce: the warmest thing in the generated stock is limestone render
     at 0xE0C79A, and this now sits clearly on the red side of it.

     THE ARCADE AND THE DOMES STAY PALE. The building is not one colour — the dressed stone is
     rose, the arcade soffits and the dome shells catch the light and go almost cream. Warming all
     three together would have produced a uniform terracotta block and thrown away the internal
     contrast that makes the mass legible. */
  const stone = new THREE.MeshStandardMaterial({
    color:0x191009, roughness:0.92, metalness:0.03, emissive:C.gold, emissiveIntensity:0.025 });
  stone.userData.duskColor = 0xC98F63;
  /* The palace has its own three materials rather than going through cityMaterial, so it needs
     its Day colours set here or it falls through to the switcher's flat fallback exactly as the
     towers did. No map: this is limestone with arcades cut into it, not a curtain wall, and a
     window grid on it would be wrong at any hour. The relief comes from the geometry. */
  stone.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xC98055, roughness:0.92, metalness:0.03 });
  const arch = new THREE.MeshStandardMaterial({
    color:0x1A150E, roughness:0.9, emissive:C.gold, emissiveIntensity:0.10 });
  /* Warmed a step to stay in the same family as the stone below it — an arcade cut into rose
     limestone is not cream — but kept clearly lighter, because it is the step up in the three-tone
     hierarchy this builder has always used. */
  arch.userData.duskColor = 0xE8BE93;
  arch.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xE6BB92, roughness:0.9 });
  const glow = new THREE.MeshStandardMaterial({
    color:0x2A2216, roughness:0.7, emissive:C.gold, emissiveIntensity:0.34 });
  glow.userData.duskColor = 0xF4E4BC;
  glow.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xF2E6C6, roughness:0.7 });

  /* THE WINGS WERE SHORTER THAN THE CITY AROUND THEM, and that is why this reads as a compact
     block with domes on it rather than as the long horizontal building it is.

     At 2.3 and 1.7 units the wings stood 18 and 13 metres tall. The generated low-rise beside
     them runs 2.1 to 7.0. So the span — the one feature that identifies Emirates Palace in every
     photograph, the thing that makes a 60-metre building read as the landmark of a city of
     towers — was buried in fabric of the same height, and only the 3.0-unit centre and the domes
     rose clear of it. The building was correct in plan and invisible in elevation.

     3.4 and 2.8 put both wings above the skirt they stand in. They still step down and out, so
     the rhythm survives; they just do it above the roofline of the city rather than inside it.

     DEPTH 11 AND 9, UP FROM 6.5 AND 5.4. The complex was 49 units across and 6.5 deep — a ratio
     of seven and a half to one, which is a wall, not a palace. The aerials show a deep building
     with courtyards behind the front range. This is still shallower than the real thing and
     deliberately so: past about 12 units the estate stops fitting on the island. */
  const W = 46;
  const main = new THREE.Mesh(new THREE.BoxGeometry(W*0.42, 4.2, 11.0), stone);
  main.position.set(x0, 2.1, z0); g.add(main);

  // Wings step DOWN and OUT. The stepping is the rhythm; a single long block reads as a shed.
  [[-1,0.62,3.4],[1,0.62,3.4],[-1,0.86,2.8],[1,0.86,2.8]].forEach(([sgn, f, hh]) => {
    const w = new THREE.Mesh(new THREE.BoxGeometry(W*0.20, hh, 9.0), stone);
    w.position.set(x0 + sgn * W * f * 0.5, hh/2, z0 + 0.5); g.add(w);
  });

  // Arcade along the front. Reads as a colonnade in silhouette, costs almost nothing.
  for (let i = 0; i < 26; i++){
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), arch);
    /* THE COLONNADE RAN 8.6 UNITS PAST THE BUILDING AT EACH END. W*0.46 spans 42.3 units against
       a palace that reaches 12.4 either side of centre once the wings are counted — so ten of the
       twenty-six posts stood in open sand with nothing behind them, which from above reads as a
       line of bollards rather than as an arcade. W*0.27 ends the run where the wings end. */
    /* Moved out to z0 + 6.0 and raised to 1.5. The arcade fronts the building, so when the main
       range went from 6.5 deep to 11 it had to follow or it would have been standing inside the
       wall it is meant to be in front of. */
    a.position.set(x0 - W*0.27 + i * (W*0.54/25), 0.75, z0 + 6.0); g.add(a);
  }

  function dome(dx, r, hy){
    const d = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 13, 0, Math.PI*2, 0, Math.PI/2), glow);
    d.position.set(x0 + dx, hy, z0); d.userData.hero = true; g.add(d);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r*0.88, r*0.88, 0.8, 20), stone);
    drum.position.set(x0 + dx, hy - 0.4, z0); g.add(drum);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), glow);
    fin.position.set(x0 + dx, hy + r + 0.35, z0); g.add(fin);
  }
  /* Every dome rides up with the mass it sits on. The centre now tops out at 7.8 units against a
     landmark skirt of 7.0, so the palace clears its own low-rise by construction rather than by
     the two numbers happening to be set consistently in different files. */
  dome(0, 3.4, 4.4);
  dome(-9, 1.7, 3.6);  dome(9, 1.7, 3.6);
  dome(-17, 1.15, 3.0); dome(17, 1.15, 3.0);
  // Corner pavilions, raised — they bracket the whole composition.
  [-22.5, 22.5].forEach(dx => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.6, 8.0), stone);
    p.position.set(x0 + dx, 1.8, z0 + 0.3); g.add(p);
    dome(dx, 1.5, 4.2);
  });
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

function adnocHQ(x0, z0){
  const g = new THREE.Group();
  const rot = 0.20;
  // Graphite glazing: denser and less blue than Etihad, so the two towers no longer read as the
  // same building at different sizes. Emissive third in the hierarchy, behind palace and Etihad.
  const body = new THREE.Mesh(roundedSlab(7.6, 4.8, 44, 1.7, 16),
    /* REPEAT (1, 1). The tiling is baked into the geometry's UVs in metres now, so a repeat here
       would multiply a scale that is already correct — which is precisely how this went wrong. */
    cityMaterial(TEX_TOWER, 1, 1, 0.60, 0x14161A));
  body.position.set(x0, 0, z0); body.rotation.y = rot;
  body.userData.hero = true; g.add(body);

  // Step one: a narrow dark waist. Reads as a shadow line and separates shaft from cap.
  /* THE WAIST IS NOT GLASS, whatever its hex says. 0x080C10 is blue-over-red 2.0, so the lift's
     classifier has been treating this as curtain wall and giving it DUSK_GLASS at metalness
     0.62 — turning the one element on the tower whose entire job is to be a dark shadow line
     into a bright blue-grey stripe. nav v24 added the override for exactly this case. */
  const waistMat = new THREE.MeshStandardMaterial({ color:0x080C10, roughness:0.9, metalness:0 });
  waistMat.userData.glassOverride = false;
  waistMat.userData.duskColor = 0x6B6659;
  // Dark in every mode, because the waist is a shadow line and its whole job is to separate the
  // shaft from the cap. Without this it takes the flat pale fallback in Day and the separation —
  // the only thing that stops ADNOC reading as one extruded stick — disappears at noon.
  waistMat.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0x5E574A, roughness:0.9, metalness:0 });
  const waist = new THREE.Mesh(roundedSlab(6.9, 4.2, 1.6, 1.5, 16), waistMat);
  waist.position.set(x0, 44, z0); waist.rotation.y = rot; g.add(waist);

  // Step two: the lit cap, WIDER than the shaft so the overhang shows in pure black.
  const capMat = new THREE.MeshStandardMaterial({ color:0x101519, roughness:0.55,
    emissive:0x9FBDC8, emissiveIntensity:0.14 });
  // Cooler and paler than the shaft: the overhang catches sky rather than sun.
  capMat.userData.duskColor = 0xD6DADC;
  capMat.userData.dayMats = new THREE.MeshStandardMaterial({ color:0xCBD1D4, roughness:0.55 });
  const cap = new THREE.Mesh(roundedSlab(9.0, 5.4, 3.4, 1.9, 16), capMat);
  cap.position.set(x0, 45.6, z0); cap.rotation.y = rot; g.add(cap);
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



return { TEX_TOWER, TEX_BLOCK, cityMaterial, curvedTower, roundedSlab,
         etihadTowers, emiratesPalace, adnocHQ, ferrariWorld, yasMall, etihadArena, yasBayPier,
         hiltonYasBay, cafeDelMar, yasBayJetty, boxTower, setbackTower, slabTower, taperTower, cityRow, lowRise };
}
