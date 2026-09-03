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

export const BUILD = 'basemap v19';

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
  /* AL RAHA. Real bearing from Yas is ~1,517 m west and ~4,537 m south — genuinely Yas's nearest
     neighbour of the six, closer to it than Saadiyat or Reem are to anything else in this table.
     Composed close to Yas for exactly that reason: this is the one pair where "near" is honest
     rather than a compression artefact, so the diorama gap is deliberately tighter than the
     others rather than forced to match their spacing. */
  /* AL RAHA. The first position here — [2080,-860], "close to Yas because that's honestly how
     close it is" — was wrong, and not by a small amount: it never accounted for DAMPING. Raha's
     real span (4,692 m) is not that much smaller than Yas's (7,335 m), so the compression this
     file applies to make small islands visible barely shrinks the gap between them — Raha's own
     damped display radius comes out to 765 units, nearly as large as Yas's own 888. Two islands
     that size, placed 565 and 388 units from their respective centres, overlap by construction;
     checked against the real damping() output rather than guessed a second time. That is what
     "mashed into Al Reem and Yas" actually was — not a rendering bug, a placement that put two
     large damped circles on top of two others.

     [3900,-2300] is the closest point to Yas that clears EVERY island's real damped radius with
     at least 300 units to spare — found by search against damping()'s actual output, not by
     eye. The true bearing (Raha sits west of Yas) is lost here; every other island in this table
     already makes that same trade for the sake of a composition that doesn't collide, and this
     is the same trade, just forced by the numbers to sit some distance further round than "next
     door" actually allows in a compressed diorama. */
  /* AL RAHA. SECOND REVISION — the first fix ([3900,-2300]) solved the overlap but broke
     something else: it put Raha NORTH of Yas, when the real building is south. Checked and
     confirmed wrong, not a matter of taste — Al Raha's true position is south-southwest of Yas,
     and a diorama position that reads as north is a worse error than tight compression, since it
     actively misinforms rather than merely compresses.

     THIS TIME SOLVED ALONG THE EXACT TRUE BEARING, not the nearest clear direction regardless of
     angle. Walked the real vector from Yas's true position to Raha's true position (from the
     baked extents, not eyeballed) outward from Yas's diorama position until every island's real
     damped radius cleared with 300 units to spare. That point turned out to be gated by CORNICHE,
     not Yas — heading southwest from Yas curves toward Corniche's own southern extent, since
     Corniche is centred near the origin and dominates the whole layout. [1270,1902] is 3,250
     units from Yas along that bearing — further than the [3900,-2300] compromise was, and the
     honest cost of keeping the direction correct rather than merely the separation. */
  /* AL RAHA. FIFTH REVISION — a fine-alignment against Reem, not another repositioning.
     Confirmed against the ACTUAL coastline polygons (shapely, not the circle-radius model every
     earlier revision here used) that [1959,287] never collided with anything — the "-456, -271,
     -147" overlaps the fourth revision flagged were an artefact of treating every irregular
     island as its own bounding circle, which overstates real islands' footprint by a wide margin
     (Corniche alone: circle area ~4.7M unit², real coastline area 1.5M). That correction stands;
     this revision is a separate, smaller adjustment on top of it.

     TWO PICKED POINTS were given as "the Reem side edge of Raha" — [2324,-246] and [1295,504].
     Raha's own actual Reem-facing edge was found the same way, not assumed: projected every
     outline vertex onto the raha-to-reem centroid direction and took the ones with the highest
     projection, which cluster into two corners at roughly (1195,390) and (1527,271), 353 units
     apart. The picked pair is 1,273 units apart — this transform has no rotation or scale for an
     individual island, only translation, so the real edge cannot be stretched to span both
     points exactly. Centred instead: translated so the real edge's midpoint (1361,330.5) lands
     on the picked pair's midpoint (1809.5,129), a delta of [+448.5,-201.5]. Reverified against
     every real coastline polygon at the new position — clear of all five, Reem included at 136
     units, not a circle-model number this time. */
  raha:     [2408, 86 ],
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
  /* PATHS AND PLAZAS RIDE IN THE SAME SIDECAR, and are stashed on the same fetch rather than
     given one of their own. A promenade that arrived on a different schedule to the road it runs
     beside would paint onto a ground texture already uploaded, which is the same class of bug the
     lazy-roads getter below exists to prevent. One fetch, one arrival. */
  entry._paths  = d.paths  || [];
  entry._plazas = d.plazas || [];
  return entry._roads;
}

/* Paths carry a kind rather than a class, and no lanes or oneway — a cycle track has neither.
   Same normalisation as roads: island-local, divided by the half-span, so a path and the road it
   runs beside land in one coordinate space and an offset between them means something. */
export function pathsNormalised(entry, paths){
  if (!entry.extent || !paths) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return paths.map(p => {
    const pts = p.pts.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
    pts.kind = p.kind;
    return pts;
  });
}

export function plazasNormalised(entry, plazas){
  if (!entry.extent || !plazas) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return plazas.map(r => r.map(([x, y]) => [(x - cx) / half, (y - cy) / half]));
}

export function roadsNormalised(entry, roads){
  if (!entry.extent || !roads) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return roads.map(r => {
    const pts = r.pts.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
    /* THE CLASS, NOT JUST WHETHER IT IS THE TOP ONE.

       This returned `major` alone, which was enough while the artefact held only major and minor —
       false meant minor and there was nothing else it could mean. The bake now ships local streets
       too, 6,217 of them on Corniche against 4,447 arterials, and under the boolean every one of
       them arrives indistinguishable from a minor arterial: eighteen metres wide, kerbed, edge
       lines, dashed centre and a parking comb, about seventy thousand canvas strokes.

       major is kept because the generated skeleton sets the same property and the painter falls
       back to it when an island has no real network. Adding cls rather than replacing it means the
       two networks still answer the same question, which is the only reason they can share a
       painter at all. */
    pts.cls = r.cls;
    pts.major = r.cls === 'major';
    /* THE TAGS THE PAINTER READS NOW (basemap v19): a one-way way is one carriageway of a divided
       road, and the lane count sets its width. */
    pts.oneway = !!r.oneway;
    pts.lanes  = r.lanes || 0;
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
  const rings = ringsOf(entry.outline);
  /* THE LARGEST RING, so an island that has become several landmasses still answers the old
     question sensibly. Every existing caller — isleSmooth, the road inset, the label anchor —
     wants one representative ring and gets the mainland, which is the right answer for all of
     them. Only the geometry builder needs the whole set, and it asks shapesOf instead. */
  let best = rings[0], bestA = -1;
  for (const r of rings){
    let s = 0;
    for (let i = 0; i < r.length; i++){
      const q = r[(i + 1) % r.length];
      s += r[i][0] * q[1] - q[0] * r[i][1];
    }
    const a = Math.abs(s / 2);
    if (a > bestA){ bestA = a; best = r; }
  }
  return best.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
}

/* EVERY RING, NORMALISED IDENTICALLY — same cx/cy, same half-span, so they stay in register with
   each other and with water and roads. An island whose outline is a single ring returns a list of
   one, so the caller never needs to know which kind it is.

   ADDITIVE ON PURPOSE. outline has always been a flat [[x,y],...] and five of the six islands
   still are; only a landmass that OSM coastline splits into separate bodies needs the nested
   form. Detecting the shape of the data rather than adding a flag means a re-bake can start
   emitting either without a coordinated code change, and an island that never splits is byte for
   byte the same file it was. */
function ringsOf(outline){
  if (!outline || !outline.length) return [];
  return Array.isArray(outline[0][0]) ? outline : [outline];
}

export function shapesOf(entry){
  if (!entry.outline || !entry.outline.length || !entry.extent) return null;
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  return ringsOf(entry.outline).map(r => r.map(([x, y]) => [(x - cx) / half, (y - cy) / half]));
}

/* WATER AND WATER-ISLANDS, NORMALISED THE SAME WAY AS shapeOf ABOVE — same cx/cy, same half-span,
   same division.

   READS entry._data, NOT entry ITSELF, and that difference is the whole fix for a real bug this
   function shipped with. entry here is an idx.islands member — the lightweight data/index.json
   summary, which carries outline directly (the bake writes it there on purpose, specifically so
   the world overview can draw real island shapes without fetching every island's full file) but
   only ever carried water and waterIslands as COUNTS, under entry.counts — the arrays themselves
   have only ever lived in data/isle-<id>.json, fetched separately by loadIsland and cached on
   entry._data once it lands. The first version of this function read entry.water directly, which
   is undefined on every index entry for every island including Raha, so (entry.water || [])
   silently became [] every time — correct code, wrong input, and the failure was invisible
   because an empty array is exactly what "no water" also looks like. Confirmed live: the bake's
   own data plainly had water:10, waterIslands:8, and still nothing rendered.

   So this now takes the loaded payload directly rather than the index entry — see sceneIslands
   below, which is the one caller and now passes entry._data through a lazy getter the same way
   it already does for roads, for the same reason: this table is built before the full island
   file has necessarily arrived. */
export function waterShapesOf(entry, data){
  if (!entry.extent || !data) return { water: [], waterIslands: [] };
  const { cx, cy } = entry.extent;
  const half = Math.max(entry.extent.w, entry.extent.d) / 2;
  const norm = ring => ring.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
  return {
    water: (data.water || []).map(norm),
    waterIslands: (data.waterIslands || []).map(norm),
    beaches: (data.beaches || []).map(norm),      // natural=beach, shape units
    hardEdge: (data.hardEdge || []).map(norm),    // marina / quay / pier / breakwater
  };
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
      /* THE WHOLE SET, WHERE shape IS ONLY THE BIGGEST OF THEM. Computed eagerly like shape and
         from the same source: outline lives on the index entry, not in the island payload, so
         unlike water this is available the moment the table is built. An island with one ring
         gives a list of one, so the geometry builder can iterate unconditionally. */
      shapes: shapesOf(entry) || [shape],
      /* LAZY, THE SAME REASON roads IS AND FOR THE SAME REASON THE FIRST VERSION OF THIS BROKE:
         entry._data is not populated until loadIsland's fetch of data/isle-<id>.json lands, which
         is well after sceneIslands runs. A plain value computed here would permanently capture
         "not loaded yet" — exactly the roads bug this file already solved once, reintroduced by
         building water and waterIslands as ordinary properties instead of copying the pattern
         that was sitting right above them. Memoised on the entry for the same reason _roadsN is:
         the normalisation is cheap once, not free to repeat on every ground-hole or fabric query. */
      get water(){
        if (!entry._data) return [];
        if (!entry._waterN) entry._waterN = waterShapesOf(entry, entry._data);
        return entry._waterN.water;
      },
      get waterIslands(){
        if (!entry._data) return [];
        if (!entry._waterN) entry._waterN = waterShapesOf(entry, entry._data);
        return entry._waterN.waterIslands;
      },
      get beaches(){
        if (!entry._data) return [];
        if (!entry._waterN) entry._waterN = waterShapesOf(entry, entry._data);
        return entry._waterN.beaches || [];
      },
      get hardEdge(){
        if (!entry._data) return [];
        if (!entry._waterN) entry._waterN = waterShapesOf(entry, entry._data);
        return entry._waterN.hardEdge || [];
      },
      /* LAZY, BECAUSE THIS TABLE IS BUILT ONCE AND THE ROADS ARRIVE FIVE TIMES.
         sceneIslands is called immediately after Corniche's roads are awaited; the other four
         islands are still in flight. A plain property captured null for all of them and kept it
         forever, so no island but Corniche could ever paint a real centreline no matter how
         early its fetch landed. A getter reads entry._roads at ACCESS time, which is when the
         island is built, which is the moment the answer is actually knowable.
         Memoised on the entry: the normalisation is ~1,500 polylines and the painter asks more
         than once. */
      /* HAS THE PAYLOAD LANDED AT ALL, WHICH THE TWO GETTERS ABOVE CANNOT SAY.

         Both return [] when entry._data is missing, which is the correct value to hand a caller
         that just wants to draw water — but it is identical to the [] a genuinely water-free
         island returns forever. A caller deciding whether to STOP ASKING needs those two cases
         apart: "no water" is permanent, "not loaded" is a retry. Without this, refreshIslandWater
         reported 'none' for an island whose fetch had not resolved and was never asked again. */
      get loaded(){ return !!entry._data; },
      get roads(){
        if (!entry._roads) return null;
        if (!entry._roadsN) entry._roadsN = roadsNormalised(entry, entry._roads);
        return entry._roadsN;
      },
      /* Same lazy-getter contract as roads, and for the same reason: null means "not fetched
         yet, ask again", an empty array means "this island genuinely has none". An island baked
         before paths existed returns the empty array, so nothing downstream has to special-case
         an older artefact. */
      get paths(){
        if (!entry._roads) return null;
        if (!entry._pathsN) entry._pathsN = pathsNormalised(entry, entry._paths || []);
        return entry._pathsN;
      },
      get plazas(){
        if (!entry._roads) return null;
        if (!entry._plazasN) entry._plazasN = plazasNormalised(entry, entry._plazas || []);
        return entry._plazasN;
      },
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
      /* Read at BUILD time so paintGround can decide whether to draw its generated lawn blobs at
         all. The real polygons arrive asynchronously, long after the ground texture is painted, so
         the count is the only thing available early enough to make that call. */
      nParks: (entry.counts && entry.counts.parks) || 0,
      nWater: (entry.counts && entry.counts.water) || 0,
      nWaterIslands: (entry.counts && entry.counts.waterIslands) || 0,
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
    /* WHAT THE BUILDING IS FOR, WHICH IS THE ONLY SOURCE THAT KNOWS. The renderer chose a facade
       from HEIGHT alone — tall is glass, mid is cladding, low is render — so a beachfront hotel
       and a warehouse of the same height were indistinguishable, and Yas Bay came out the same
       grey as an industrial estate.

       The bake now joins 10,420 venues to the footprints by coordinate and 2,063 buildings come
       back carrying one. Overture describes where people sleep; this describes where people GO,
       and it is dense exactly where Overture is empty. Null on the other 92 per cent, which then
       fall through to the height rule unchanged. */
    v:  b.v || 0,
    vk: b.vk || null,
    /* THE REAL FOOTPRINT, WHERE THE BAKE HAS ONE. An oriented box is the right reduction for
       twenty-six thousand background buildings and the wrong one for the handful you can walk up
       to: the Hilton on Yas measures 36,706 m² as a box and 19,672 m² as a ring, and the missing
       46 per cent is a courtyard with a pool in it.

       Offsets from the box centre in bake metres, so they convert like any other length, and the
       northing flips to -z exactly as the centre does. NOT expressed in the box's rotated frame —
       the ring already carries its own orientation, so anything drawing it must NOT also apply
       `rot`. Present on 186 buildings of 26,325 and absent on the rest by design. */
    p: b.p ? b.p.map(q => [m2u(q[0]), -m2u(q[1])]) : null,
  }));
}

/* PARKS, WITH THEIR KIND. Tolerates both payload shapes: the bake now emits { k, a, r } and used
   to emit a bare ring. Nothing ever consumed the bare form - this function was exported and never
   called - but an old payload in a browser cache should degrade rather than throw. */
export function parksUnits(island, origin){
  const [ox, oy] = origin;
  return (island.parks || []).map(p => {
    const ring = Array.isArray(p) ? p : p.r;
    if (!ring) return null;
    const pts = ring.map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]);
    pts.kind = Array.isArray(p) ? 'park' : (p.k || 'park');
    pts.areaM2 = Array.isArray(p) ? 0 : (p.a || 0);
    return pts;
  }).filter(Boolean);
}

/* GOLF AND THE RACEWAY, WORLD SPACE, same convention as buildingsUnits and parksUnits above:
   north flipped to -z, because these are placed directly in the world rather than going through
   the island's ExtrudeGeometry rotation. Getting that backwards mirrors the feature north to
   south, which still looks plausible and is therefore the failure worth naming.

   BOTH ARE NEW IN THE BAKE. tools/bake-city.mjs now fetches `leisure=golf_course` and
   `highway=raceway`; before that neither existed in any payload, and a search near the Yas Marina
   Circuit anchor returned 29 km of ordinary local streets with nothing to tell them apart. */
export function golfUnits(island, origin){
  const [ox, oy] = origin;
  return (island.golf || []).map(r => r.map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]));
}

/* THE FILTER IS THE POINT HERE, not the conversion. Yas returns 13.3 km of raceway across 38
   ways, and only 5.26 km of it is the Grand Prix circuit — the rest is the pit lane, the shorter
   alternative layouts that run over the same tarmac, the KartZone and a rallycross course. Drawing
   all of it lays four circuits on top of each other.

   `kind` is returned rather than filtered here so the consumer decides: the pit lane is worth
   drawing narrower, the kart track thinner still, and the alternate layouts are worth dropping
   entirely because their tarmac is already under the main ribbon.

   That 5.26 km against a published 5.281 is also the check that the geometry is real and correctly
   scaled — 0.4 per cent, from a source that knows nothing about this scene. */
export function racewayUnits(island, origin){
  const [ox, oy] = origin;
  return (island.raceway || []).map(r => {
    const name = r.name || '';
    const kind = r.pit || /pit lane/i.test(name) ? 'pit'
               : /kartzone|kart/i.test(name)     ? 'kart'
               : /^yas marina circuit$/i.test(name) ? 'circuit'
               : 'alt';
    const pts = r.pts.map(([x, y]) => [m2u(x - ox), -m2u(y - oy)]);
    pts.kind = kind; pts.name = name;
    return pts;
  });
}
