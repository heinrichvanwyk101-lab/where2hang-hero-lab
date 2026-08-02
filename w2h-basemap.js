/* PASTE TARGET: where2hang-hero-lab/w2h-basemap.js
   =============================================================================================
   THE BASEMAP. Loads the artefact baked by tools/bake-city.mjs, converts it into scene units, and
   computes the per-island display transform. Knows about data and arithmetic; imports nothing,
   touches no renderer, and can be run under plain node — which is why the numbers below are
   tested rather than asserted.

   ---------------------------------------------------------------------------------------------
   TWO FRAMES, AND KEEPING THEM APART IS THE WHOLE JOB.

   TRUE frame: metres from one origin for the whole emirate, exactly as OSM has it. Distances and
   bearings between islands are real. This is the map.

   DISPLAY frame: the diorama. Five islands pulled together and their sizes compressed so the
   small ones can be seen. This is the hero.

   Every island carries a transform from one to the other — a uniform scale and a translation —
   and a single number `t` moves between them. t = 0 is the diorama, t = 1 is the map, and the
   camera can sit anywhere along it. Nothing is baked, so there is no version of this where the
   map has to be reconstructed from the diorama.

   ---------------------------------------------------------------------------------------------
   WHY DAMPING IS NOT A DISTORTION.

   At true scale the five islands span 118 to 2,441 units — twenty to one. Al Maryah would be
   smaller than the Emirates Palace estate and invisible in the world view. The diorama has always
   hidden this by drawing all five the same size, which is a much larger lie than the one below.

   A UNIFORM scale over a whole island is indistinguishable from viewing that island from a
   different distance. The coast, the roads and every building move together; no proportion inside
   the island changes, and nothing on screen looks wrong. The only thing it affects is comparison
   BETWEEN islands — which is the single thing being traded, deliberately, and it is recoverable
   because the data underneath is untouched.

   The exponent is the dial. p = 1 is true scale. p = 0 is the old all-the-same-size diorama.
   p = 1/3 takes the spread from 20:1 to about 2.7:1: Al Maryah reads as small rather than absent,
   and Abu Dhabi Island still dominates the frame the way it does from the air.

   ---------------------------------------------------------------------------------------------
   AXES. The artefact is right-handed geographic, +x east and +y north. The scene is +x east and
   z NORTH-NEGATIVE, which is where the world file's jy and -a.z conversions come from. The flip
   happens here, once, on the way in — so nothing downstream has to hold a sign convention in its
   head, and nothing upstream had to.
   ============================================================================================= */

export const BUILD = 'basemap v4';

/* The scene's one scale constant, and it must agree with w2h-world.js. Not imported, because that
   file takes its dependencies through opts and importing it here would create the cycle. */
export const M_PER_UNIT = 7.8;

/* p = 1/3. See the note above; this is the only number in the file with an aesthetic argument
   behind it rather than an arithmetic one. */
export const DAMP_P = 1 / 3;

const m2u = m => m / M_PER_UNIT;

/* ---------- LOADING ------------------------------------------------------------------------ */

export async function loadIndex(base = 'data/'){
  const res = await fetch(base + 'index.json');
  if (!res.ok) throw new Error(`basemap: index.json -> HTTP ${res.status}`);
  const idx = await res.json();
  idx._base = base;
  return idx;
}

/* Islands load on demand and are cached on the index. The hero opens on one island, and the other
   four are 0.9 MB that nobody has asked to look at yet. */
const PENDING = new Map();
export function loadIsland(idx, id){
  const entry = (idx.islands || []).find(i => i.id === id);
  if (!entry) throw new Error(`basemap: no island "${id}" in the index`);
  if (entry._data) return Promise.resolve(entry._data);
  if (PENDING.has(id)) return PENDING.get(id);
  const p = fetch((idx._base || 'data/') + entry.file)
    .then(r => { if (!r.ok) throw new Error(`basemap: ${entry.file} -> HTTP ${r.status}`); return r.json(); })
    .then(d => { entry._data = d; PENDING.delete(id); return d; });
  PENDING.set(id, p);
  return p;
}

/* ---------- THE TRANSFORM ------------------------------------------------------------------ */

/* The reference island is the largest, so its display scale is 1 and every other island is
   magnified rather than shrunk. Shrinking instead would make the whole archipelago smaller than
   its own biggest member, which reads as the diorama pulling away rather than as the small
   islands being brought up. */
export function reference(idx){
  return (idx.islands || []).filter(i => i.extent)
    .reduce((a, b) => (a && span(a) >= span(b) ? a : b), null);
}
const span = i => Math.max(i.extent.w, i.extent.d);

export function damping(idx, p = DAMP_P){
  const ref = reference(idx);
  if (!ref) throw new Error('basemap: the index has no island with an extent');
  const R = span(ref);
  const out = {};
  for (const i of idx.islands || []){
    /* s = (R / E)^(1-p). At p = 1 every s is 1 and nothing is damped; at p = 0 every island is
       scaled to the reference's size, which is the old diorama exactly. */
    out[i.id] = i.extent ? Math.pow(R / span(i), 1 - p) : 1;
  }
  return out;
}

/* THE ISLAND'S OWN ORIGIN. Geometry arrives in emirate metres, which for Yas is twenty kilometres
   from zero — fine as data, poor as vertex coordinates, since a scene unit is 7.8 metres and
   float32 precision on a 2,500-unit offset starts showing in the road markings. So each island is
   built about its own centre and the group is then positioned. */
export function islandOrigin(entry){
  return entry.extent ? [entry.extent.cx, entry.extent.cy] : [0, 0];
}

/* The diorama layout: where the islands sit when t = 0. Kept as a table rather than derived,
   because this is a composition — the archipelago is arranged to read well in the opening shot,
   and no formula produces that. Units, +x east, +z south. */
export const DIORAMA = {
  corniche: [   0,    0 ],
  maryah:   [ 940, -150 ],
  reem:     [1560, -640 ],
  saadiyat: [ 520, -1560],
  yas:      [2300, -1180],
};

/* THE ONE FUNCTION EVERYTHING ELSE GOES THROUGH.

   t = 0 diorama, t = 1 true map, and any value between. Scale interpolates in LOG space, because
   a linear blend between 7.55 and 1 spends most of its travel near the large end and the small
   islands appear to collapse right at the finish; geometric blending makes the approach read as
   continuous zoom, which is what it physically is. */
export function transform(idx, id, t = 0, p = DAMP_P){
  const entry = (idx.islands || []).find(i => i.id === id);
  if (!entry) throw new Error(`basemap: no island "${id}"`);
  const s0 = damping(idx, p)[id];
  const scale = Math.exp(Math.log(s0) * (1 - t));

  const [ox, oy] = islandOrigin(entry);
  /* True position of the island's centre in scene units, north-negative. */
  const trueP = [m2u(ox), -m2u(oy)];
  const dio   = DIORAMA[id] || [0, 0];
  return {
    scale,
    x: dio[0] + (trueP[0] - dio[0]) * t,
    z: dio[1] + (trueP[1] - dio[1]) * t,
    origin: [ox, oy],
  };
}

/* ROADS, IN THE SAME NORMALISED SPACE AS THE ISLAND SHAPE.

   w2h-world.js works in island-normalised coordinates for everything to do with the ground: the
   outline, the inside test, the distance-to-coast test and the road skeleton all live in a frame
   where 1.0 is the island's own radius. So roads convert the same way the shape does — divided by
   the island half-span, and with north kept POSITIVE, because these are consumed by the ground
   painter which works in shape space rather than by anything placed directly in the world.

   That is the opposite convention to roadsUnits above, which is for world-space placement. Two
   functions rather than a flag, because the one thing this pair must never do is quietly hand a
   consumer the other one's answer. */
export async function loadRoads(idx, id){
  const entry = (idx.islands || []).find(i => i.id === id);
  if (!entry) return null;
  if (entry._roads) return entry._roads;
  const res = await fetch((idx._base || 'data/') + 'roads-' + id + '.json');
  if (!res.ok) throw new Error(`basemap: roads-${id}.json -> HTTP ${res.status}`);
  const d = await res.json();
  entry._roads = d.roads || [];
  return entry._roads;
}

export function roadsNormalised(entry, roads){
  if (!entry.extent || !roads) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return roads.map(r => {
    const pts = r.pts.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
    pts.major = r.cls === 'major';
    return pts;
  });
}

/* ---------- WHAT w2h-world.js CONSUMES ----------------------------------------------------- */

/* THE ISLAND SHAPE, NORMALISED, and it does NOT get the north flip the rest of this file applies.

   That looks like an inconsistency and is not. w2h-world.js builds each island as an
   ExtrudeGeometry in XY and then rotates it -90 about X, so shape-y becomes world -z on the way
   through: the drawn ISLE_SHAPES put the north shore at positive y and it renders at negative z.
   The flip is in the rotation, so applying one here would apply it twice and mirror the island
   north to south — which is the failure that still looks plausible in silhouette and is therefore
   worth naming.

   Roads and buildings take the flip because they are placed directly in world space and never go
   through that rotation.

   Normalised against the island's own half-span so the values land in -1..1 like the hand-drawn
   shapes they replace, and so d.r stays the meaningful radius it has always been. */
export function shapeOf(entry){
  if (!entry.outline || !entry.outline.length || !entry.extent) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return entry.outline.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
}

/* ONE CALL, EVERYTHING THE WORLD FILE NEEDS. It is handed a finished table rather than the index,
   so the damping exponent, the projection and the axis conventions all stay in this file and
   w2h-world.js keeps importing nothing. */
export function sceneIslands(idx, t = 0, p = DAMP_P){
  const damp = damping(idx, p);
  const out = {};
  for (const entry of idx.islands || []){
    const shape = shapeOf(entry);
    if (!shape) continue;
    const tf = transform(idx, entry.id, t, p);
    out[entry.id] = {
      shape,
      roads: entry._roads ? roadsNormalised(entry, entry._roads) : null,
      /* Landmarks in island-local SCENE units, north flipped to -z. These are world positions like
         roads and buildings, not shape coordinates, so they take the flip — see the note on
         shapeOf for why those two differ. */
      landmarks: Object.fromEntries(Object.entries(entry.landmarks || {}).map(([k, p]) =>
        [k, { x: m2u(p.x - entry.extent.cx), z: -m2u(p.y - entry.extent.cy) }])),
      /* The true radius in scene units. Damping is NOT folded in here: it goes on the group as a
         uniform scale, which keeps r meaning what every metre conversion in w2h-world.js already
         assumes it means. */
      r: (Math.max(entry.extent.w, entry.extent.d) / 2) / M_PER_UNIT,
      scale: tf.scale, x: tf.x, z: tf.z,
      extent: entry.extent,
    };
  }
  return out;
}

/* ---------- GEOMETRY INTO SCENE UNITS ------------------------------------------------------ */

/* Everything below returns island-local scene units about the island's own origin, with the
   display transform NOT applied — that belongs on the group, so one number moves the island and
   the vertices are built once. */

export function outlineUnits(island, origin){
  const [ox, oy] = origin;
  return (island.outline || []).map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]);
}

export function roadsUnits(island, origin){
  const [ox, oy] = origin;
  return (island.roads || []).map(r => ({
    cls: r.cls, oneway: r.oneway, lanes: r.lanes,
    pts: r.pts.map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]),
  }));
}

/* Buildings arrive as oriented boxes. w is the long axis and rot is measured from east in the
   geographic frame; flipping y to z reverses the sense of rotation, so the angle is negated here
   and nowhere else.

   h IS LEFT NULL WHERE OSM HAS NO HEIGHT rather than filled with a guess. Roughly a fifth of the
   stock is tagged, and the consumer already owns a height model for the rest — one that knows
   about the falloff, the district cap and the landmark skirts. Substituting a constant here would
   quietly outrank all of it. */
export function buildingsUnits(island, origin){
  const [ox, oy] = origin;
  return (island.buildings || []).map(b => ({
    x: m2u(b.x - ox), z: -m2u(b.y - oy),
    w: m2u(b.w), dp: m2u(b.d),
    rot: -b.rot,
    h: b.h == null ? null : m2u(b.h),
  }));
}

export function parksUnits(island, origin){
  const [ox, oy] = origin;
  return (island.parks || []).map(r => r.map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]));
}
