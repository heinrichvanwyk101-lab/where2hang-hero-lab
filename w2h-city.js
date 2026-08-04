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
export const BUILD = 'city v17';

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
/* FERRARI WORLD — the only colour anchor in the whole silhouette, and until now a flat OSM box.

   WHY THIS ONE FIRST. Every other unbuilt landmark is a shape problem; this one is a shape
   problem AND the single saturated thing in a city rendered entirely in sand, glass and gold.
   At any distance where the Grand Mosque is four pale bumps, this is still unmistakably a red
   star. It earns its geometry more cheaply than anything else on the list.

   TWO READS, BOTH OF WHICH HAVE TO WORK. From above it is a swept five-point star. From the
   horizon it is a long low red wedge, highest at the centre and tapering to near-ground at the
   tips. A shape that only works in plan is a logo, not a building.

   THE BLACK RIM IS NOT DECORATION. Solid red against sand reads as an amorphous blob at
   distance — the dark edge banding is what gives the star its outline, and it is the difference
   between recognising the building and seeing a stain. It gets its own material group rather
   than a second mesh, so the two can never drift apart.

   SCALE. 1 unit is 7.8 m, the scene's one constant. R_OUT 45 gives a 669 m span against a real
   ~700, and PEAK 9.0 gives 70 m against a real 86 — the ratio matters more than either figure,
   and 9.5:1 span-to-height is what the reference measures off the captures. PEAK also matches
   the h:9 the Yas anchor already declared, so the label sits where the roof actually is.

   THE SWEEP IS WHAT MAKES IT FERRARI. Straight-edged points give a sheriff's badge. The real
   roof's points curve as they extend, so the angular offset grows with radius — one term, and
   without it the whole thing reads wrong in a way that is hard to name and impossible to miss. */
function ferrariWorld(x0, z0){
  const g = new THREE.Group();

  const R_OUT = 45, R_IN = 16, PEAK = 9.0;
  const T0 = 0.12;              // oculus, as a fraction of the radial span
  const SWEEP = 0.34;           // radians of twist from oculus rim to tip
  const LOBE_P = 1.9;           // higher = sharper points
  const RIM = 2;                // radial rings given the dark edge material
  const segA = 160, segR = 18;

  const pos = [], idx = [];
  for (let i = 0; i <= segA; i++){
    const th = (i / segA) * Math.PI * 2;
    for (let j = 0; j <= segR; j++){
      const t = T0 + (1 - T0) * (j / segR);
      const u = (t - T0) / (1 - T0);
      /* The twist grows with u, so a point leaves the body on one bearing and arrives at its tip
         on another. That is the curve. */
      const the = th + SWEEP * u;
      const lobe = Math.pow(0.5 + 0.5 * Math.cos(5 * the), LOBE_P);
      const r = (R_IN + (R_OUT - R_IN) * lobe) * t;
      /* Highest at the oculus rim, on the ground at every edge — between the points as well as
         at the tips, because the roof meets the deck all the way round. */
      pos.push(Math.cos(th) * r, PEAK * Math.pow(1 - u, 1.25), Math.sin(th) * r);
    }
  }
  const row = segR + 1;
  const inner = [], outer = [];
  for (let i = 0; i < segA; i++){
    for (let j = 0; j < segR; j++){
      const a = i * row + j, b = a + row;
      const quad = [a, b, a + 1, b, b + 1, a + 1];
      (j >= segR - RIM ? outer : inner).push(...quad);
    }
  }
  idx.push(...inner, ...outer);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.addGroup(0, inner.length, 0);
  geo.addGroup(inner.length, outer.length, 1);
  geo.computeVertexNormals();

  /* DoubleSide because the roof is a shell, not a solid: from a low angle on the approach road
     you see its underside, and a single-sided surface disappears there. */
  const red = new THREE.MeshStandardMaterial({
    color:0x3A0A11, roughness:0.55, metalness:0.06,
    emissive:0xC8102E, emissiveIntensity:0.30, side:THREE.DoubleSide });
  red.userData.duskColor = 0xC8102E;
  red.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0xC8102E, roughness:0.55, metalness:0.06, side:THREE.DoubleSide });

  const rim = new THREE.MeshStandardMaterial({
    color:0x0B0B0C, roughness:0.85, metalness:0.05, side:THREE.DoubleSide });
  rim.userData.duskColor = 0x1A1A1C;
  rim.userData.dayMats = new THREE.MeshStandardMaterial({
    color:0x1A1A1C, roughness:0.85, side:THREE.DoubleSide });

  const roof = new THREE.Mesh(geo, [red, rim]);
  roof.userData.hero = true;
  roof.castShadow = true; roof.receiveShadow = true;
  g.add(roof);

  /* THE OCULUS RING. The centre of the real roof is an open funnel, and without something in the
     hole you see straight through the building to the sea behind it. A short dark cylinder reads
     as the funnel wall and closes the silhouette. */
  const oR = R_IN * T0 * 1.02;
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(oR * 1.35, oR, PEAK * 0.55, 28, 1, true),
    new THREE.MeshStandardMaterial({ color:0x14171B, roughness:0.8, side:THREE.DoubleSide }));
  ring.position.y = PEAK * 0.92;
  ring.userData.hero = true;
  g.add(ring);

  /* THE DECK UNDER IT. Not detail — without a floor the oculus and the shell's own edge both
     show sky, and a building you can see through does not read as a building. */
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(R_IN * 0.95, R_IN * 0.95, 1.6, 32),
    new THREE.MeshStandardMaterial({ color:0x1B1E22, roughness:0.9 }));
  deck.position.y = 0.8;
  deck.receiveShadow = true;
  g.add(deck);

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
         etihadTowers, emiratesPalace, adnocHQ, ferrariWorld,
         boxTower, setbackTower, slabTower, taperTower, cityRow, lowRise };
}
