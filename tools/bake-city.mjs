/* PASTE TARGET: where2hang-hero-lab/tools/bake-city.mjs
   =============================================================================================
   THE BAKE. Fetches Abu Dhabi from OpenStreetMap, projects it to island-local metres, reduces it
   to the shapes the scene actually consumes, and writes ONE artefact: data/abudhabi.json.

   Runs in a GitHub Action, never in the browser. The scene loads a committed file; there is no
   API call at run time, no key, no quota, and the artefact is diffable in the repo so a bad bake
   is visible in the pull request rather than in the render.

   ---------------------------------------------------------------------------------------------
   WHY THE COASTLINES ARE IN HERE TOO, AND WHY THIS IS NOT OPTIONAL.

   The islands in w2h-world.js are hand-drawn. ISLE_SHAPES is a list of normalised points authored
   by eye against reference imagery — good enough to recognise, and carrying no georeference at
   all. There is no latitude anywhere in that file.

   That matters more than it sounds. Real roads cannot be laid onto an invented coastline: the
   Corniche would run into the sea at one end and stop short at the other, and every arterial would
   meet the ring at the wrong place. Any attempt to fit real data to a drawn outline is a warp, and
   a warp is worse than either honest option because it is wrong by an amount that varies across
   the island.

   So the outline comes from the same fetch as everything standing on it. Both are true, or
   neither is. That does mean the island silhouettes will change when this first lands — the drawn
   Corniche is a smoother, fatter wedge than the real one — and that change is the point.

   ---------------------------------------------------------------------------------------------
   WHAT COMES OUT, AND WHY THESE SHAPES.

   BUILDINGS ARE ORIENTED BOUNDING BOXES, not polygons. The fabric extruder consumes a plot as
   { x, z, rot, w, dp } and puts a box on it; a 40-vertex footprint would be reduced to exactly
   that on arrival, so the reduction happens here where it costs nothing at run time. It also
   collapses the artefact by two orders of magnitude — Abu Dhabi island alone is roughly 30,000
   buildings — and an OBB carries the two things that actually read at diorama scale: the plot's
   proportion and the angle it makes with its street. Both of those are what the generated fabric
   has never been able to get right.

   ROADS ARE POLYLINES WITH A CLASS. The corridor — carriageway, kerb, verge, markings — is the
   painter's business and already exists; what it has never had is a true centreline network. The
   class comes across so the painter can keep its hierarchy.

   HEIGHTS come from `height` or `building:levels` where OSM has them, and are null where it does
   not. Roughly a third of the stock is tagged. The consumer keeps its existing height model for
   the rest, so the bake improves what it can and lies about nothing.

   ---------------------------------------------------------------------------------------------
   THE PROJECTION. Local equirectangular about each island's own centroid: at this latitude and
   over spans of a few kilometres the error against a proper transverse Mercator is centimetres,
   and the alternative is a dependency. Metres out, island-local, +x east and +y north.

   NOTE ON THE Z SIGN. The scene uses z = -y, north-negative, which is where the world file's
   `jy` and `-a.z` conversions come from. That flip is done ON ARRIVAL, not here: this file stays
   in a right-handed geographic frame so that a bad bake can be checked against a map without
   holding a sign convention in your head.
   ============================================================================================= */

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/* A USER-AGENT, AND THE FIRST RUN FAILED WITHOUT ONE.

   Node's built-in fetch sends no User-Agent at all, and Overpass's front end returns 406 to
   requests that arrive without one. Every mirror did, so it read as an outage rather than as a
   header fault — and the script made that worse by reporting the status code and discarding the
   body, which is where Overpass puts the explanation.

   The identifying string is the OSM convention rather than politeness: these are volunteer-run
   endpoints on a shared CI IP range, and an operator who can see what is hitting them will
   throttle rather than block. */
const UA = 'where2hang-hero-lab/1.0 (city diorama bake; github.com/heinrichvanwyk101-lab)';

/* THE FIVE ISLANDS, as bounding boxes in [south, west, north, east].

   Generous on purpose. A box that clips the coastline produces an outline with a straight edge
   where the box cut it, which then reads as a quay wall in the render — a failure that looks like
   a design decision rather than a bug. Over-fetching costs seconds in an Action that runs by
   hand; under-fetching costs an afternoon of wondering why Saadiyat has a corner. */
const ISLANDS = [
  { id:'corniche', name:'Abu Dhabi Island', bbox:[24.4300, 54.2950, 24.5250, 54.4100] },
  { id:'maryah',   name:'Al Maryah',        bbox:[24.4930, 54.3760, 24.5150, 54.4020] },
  { id:'reem',     name:'Al Reem',          bbox:[24.4850, 54.3850, 24.5200, 54.4300] },
  { id:'saadiyat', name:'Saadiyat',         bbox:[24.5150, 54.3800, 24.5950, 54.4800] },
  { id:'yas',      name:'Yas',              bbox:[24.4450, 54.5550, 24.5250, 54.6450] },
];

/* ROAD CLASSES KEPT, and the mapping to the three widths the painter already understands.
   Everything below `service` is dropped: driveways and car park aisles are noise at 7.7 metres
   per unit and they outnumber the real network several times over. */
const ROAD_CLASS = {
  motorway:'major', motorway_link:'major', trunk:'major', trunk_link:'major',
  primary:'major', primary_link:'major',
  secondary:'minor', secondary_link:'minor', tertiary:'minor', tertiary_link:'minor',
  residential:'local', unclassified:'local', living_street:'local', service:'local',
};

/* Buildings smaller than this are dropped. 120 m² is a villa outbuilding or a substation; at
   diorama scale it is a speck that costs an instance. */
const MIN_BUILDING_AREA = 120;
/* Simplification tolerance for coastline and road geometry, in metres. Two metres is well below
   anything visible at this scale and removes most of OSM's surveyed detail. */
const SIMPLIFY_M = 2.0;

const R_EARTH = 6378137;

function projector(lat0, lon0){
  const k = Math.cos(lat0 * Math.PI / 180);
  return {
    lat0, lon0,
    fwd: (lat, lon) => [
      (lon - lon0) * Math.PI / 180 * R_EARTH * k,
      (lat - lat0) * Math.PI / 180 * R_EARTH,
    ],
  };
}

/* ---------- OVERPASS ----------------------------------------------------------------------- */

function query(bbox){
  const b = bbox.join(',');
  /* One query per island, three blocks, `out geom` so ways arrive with their coordinates inline
     and no second pass is needed to resolve node ids. */
  return `[out:json][timeout:180];
(
  way["natural"="coastline"](${b});
  way["highway"](${b});
  way["building"](${b});
  relation["building"](${b});
  way["leisure"="park"](${b});
  way["landuse"~"grass|recreation_ground|village_green"](${b});
);
out geom;`;
}

async function overpass(q){
  let lastErr;
  for (const url of OVERPASS){
    const host = new URL(url).host;
    for (let attempt = 0; attempt < 3; attempt++){
      try {
        const res = await fetch(url, {
          method:'POST',
          headers:{
            'Content-Type':'application/x-www-form-urlencoded',
            'User-Agent': UA,
            'Accept':'application/json',
          },
          body:'data=' + encodeURIComponent(q),
        });
        if (res.ok) return await res.json();

        /* READ THE BODY BEFORE DECIDING ANYTHING. Overpass answers 400 and 406 with a plain-text
           explanation — a syntax error with a line number, a rejected header, an area that is too
           large. v1 threw on the status alone and the first real failure produced "HTTP 406" and
           nothing else, which is a diagnostic that costs a round trip to learn nothing from. */
        const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 400);
        process.stderr.write(`    ${host} -> HTTP ${res.status}${body ? ': ' + body : ''}\n`);

        /* 429 and 504 are "come back later" and worth waiting on the same mirror. Anything else is
           a different answer from a different machine, so move on rather than asking again. */
        if (res.status === 429 || res.status === 504){
          await new Promise(r => setTimeout(r, 15000 * (attempt + 1)));
          continue;
        }
        lastErr = new Error(`${host} -> HTTP ${res.status}${body ? ': ' + body : ''}`);
        break;
      } catch (e){
        process.stderr.write(`    ${host} -> ${e.message}\n`);
        lastErr = e;
        await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('every Overpass mirror failed');
}

/* ---------- GEOMETRY ----------------------------------------------------------------------- */

function simplify(pts, tol){
  if (pts.length < 3) return pts;
  const sq = tol * tol;
  const d2 = (p, a, b) => {
    let [x, y] = a; let dx = b[0] - x, dy = b[1] - y;
    if (dx || dy){
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx*dx + dy*dy);
      if (t > 1){ x = b[0]; y = b[1]; } else if (t > 0){ x += dx*t; y += dy*t; }
    }
    dx = p[0] - x; dy = p[1] - y; return dx*dx + dy*dy;
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length){
    const [i, j] = stack.pop();
    let idx = -1, max = sq;
    for (let k = i + 1; k < j; k++){
      const d = d2(pts[k], pts[i], pts[j]);
      if (d > max){ max = d; idx = k; }
    }
    if (idx > 0){ keep[idx] = true; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function area(ring){
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  return Math.abs(a) / 2;
}

/* THE ORIENTED BOUNDING BOX, by rotating calipers over the convex hull.

   Not the axis-aligned box, which is the tempting shortcut and is wrong in a way that shows: a
   building at forty degrees to the grid gets an AABB half again too large in both dimensions, and
   a street of them reads as a solid block rather than a row. The angle is also the whole point —
   it is how a footprint knows which street it fronts, which is the thing the generated fabric has
   never had and the reason its blocks look like a lattice. */
function hull(pts){
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0]);
  const lo = [], up = [];
  for (const q of p){ while (lo.length >= 2 && cross(lo[lo.length-2], lo[lo.length-1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--){ const q = p[i];
    while (up.length >= 2 && cross(up[up.length-2], up[up.length-1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

function obb(ring){
  const h = hull(ring);
  if (h.length < 3) return null;
  let best = null;
  for (let i = 0; i < h.length; i++){
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of h){
      const x = q[0]*c - q[1]*s, y = q[0]*s + q[1]*c;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const w = x1 - x0, d = y1 - y0;
    if (!best || w * d < best.area){
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      best = { area:w*d, w, d, rot:ang,
               x: cx*Math.cos(ang) - cy*Math.sin(ang),
               y: cx*Math.sin(ang) + cy*Math.cos(ang) };
    }
  }
  /* Long axis first and rotation normalised to [-pi/2, pi/2), so a consumer never has to reason
     about whether w is the frontage or the depth. */
  if (best.d > best.w){ const t = best.w; best.w = best.d; best.d = t; best.rot += Math.PI/2; }
  while (best.rot >= Math.PI/2) best.rot -= Math.PI;
  while (best.rot < -Math.PI/2) best.rot += Math.PI;
  return best;
}

function heightOf(tags){
  if (!tags) return null;
  const h = parseFloat(tags['height'] || tags['building:height']);
  if (isFinite(h) && h > 2 && h < 400) return Math.round(h * 10) / 10;
  const lv = parseFloat(tags['building:levels']);
  /* 3.2 metres a storey. Gulf floor-to-floor runs a little taller than the European 3.0 that most
     converters assume, and on a forty-storey tower the difference is eight metres of silhouette. */
  if (isFinite(lv) && lv >= 1 && lv < 130) return Math.round(lv * 3.2 * 10) / 10;
  return null;
}

/* ---------- COASTLINE ---------------------------------------------------------------------- */

/* OSM coastline arrives as a heap of unordered fragments, each a way running with land on its
   left. Stitching them by shared endpoint is the only way to get an island out; taking the
   longest resulting chain is the only way to get THE island rather than a breakwater, a lagoon
   edge, or the mainland shore that happened to fall inside the box. */
function stitch(ways){
  const key = p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const open = ways.map(w => w.slice());
  const out = [];
  while (open.length){
    let chain = open.pop();
    let joined = true;
    while (joined){
      joined = false;
      for (let i = 0; i < open.length; i++){
        const w = open[i];
        if (key(chain[chain.length-1]) === key(w[0])){ chain = chain.concat(w.slice(1)); open.splice(i,1); joined = true; break; }
        if (key(chain[chain.length-1]) === key(w[w.length-1])){ chain = chain.concat(w.slice().reverse().slice(1)); open.splice(i,1); joined = true; break; }
        if (key(chain[0]) === key(w[w.length-1])){ chain = w.slice(0,-1).concat(chain); open.splice(i,1); joined = true; break; }
        if (key(chain[0]) === key(w[0])){ chain = w.slice().reverse().slice(0,-1).concat(chain); open.splice(i,1); joined = true; break; }
      }
    }
    out.push(chain);
  }
  return out;
}

/* ---------- THE BAKE ----------------------------------------------------------------------- */

async function bakeIsland(isle){
  const [s, w, n, e] = isle.bbox;
  const proj = projector((s + n) / 2, (w + e) / 2);
  process.stderr.write(`  ${isle.id}: querying...\n`);
  const json = await overpass(query(isle.bbox));
  const els = json.elements || [];

  const toXY = g => g.map(p => proj.fwd(p.lat, p.lon));

  const coastWays = [], roads = [], buildings = [], parks = [];
  for (const el of els){
    const t = el.tags || {};
    if (!el.geometry && !el.members) continue;

    if (t.natural === 'coastline' && el.geometry){ coastWays.push(toXY(el.geometry)); continue; }

    if (t.highway && el.geometry){
      const cls = ROAD_CLASS[t.highway];
      if (!cls) continue;
      const pts = simplify(toXY(el.geometry), SIMPLIFY_M);
      if (pts.length >= 2) roads.push({ cls, pts: pts.map(rd2), oneway: t.oneway === 'yes' ? 1 : 0,
                                        lanes: parseInt(t.lanes) || null });
      continue;
    }

    if ((t.leisure === 'park' || t.landuse) && el.geometry){
      const ring = toXY(el.geometry);
      if (area(ring) > 800) parks.push(simplify(ring, SIMPLIFY_M * 2).map(rd1));
      continue;
    }

    if (t.building){
      /* Relations are multipolygons — take the outer ring only. An inner courtyard is invisible
         once the thing is a box, and carrying holes through would double the artefact for nothing. */
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (!geom || geom.length < 4) continue;
      const ring = toXY(geom);
      const a = area(ring);
      if (a < MIN_BUILDING_AREA) continue;
      const b = obb(ring);
      if (!b) continue;
      buildings.push({
        x: rd1(b.x), y: rd1(b.y),
        w: rd1(b.w), d: rd1(b.d),
        rot: Math.round(b.rot * 1000) / 1000,
        h: heightOf(t),
      });
    }
  }

  const chains = stitch(coastWays).sort((a, b) => b.length - a.length);
  const outline = chains.length ? simplify(chains[0], SIMPLIFY_M * 3).map(rd1) : [];

  process.stderr.write(`  ${isle.id}: outline ${outline.length}pt, roads ${roads.length}, ` +
                       `buildings ${buildings.length} (${buildings.filter(b => b.h).length} with height), ` +
                       `parks ${parks.length}\n`);

  return { id:isle.id, name:isle.name, origin:{ lat:proj.lat0, lon:proj.lon0 },
           outline, roads, buildings, parks };
}

const rd1 = p => Array.isArray(p) ? [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]
                                  : Math.round(p*10)/10;
const rd2 = p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10];

async function main(){
  const only = process.argv[2];
  const list = only ? ISLANDS.filter(i => i.id === only) : ISLANDS;
  if (!list.length) throw new Error(`no island called "${only}"`);

  const islands = [];
  for (const isle of list){
    islands.push(await bakeIsland(isle));
    /* Serial, with a gap. Overpass asks for it and five parallel requests from one Action IP is
       how you get the repo rate-limited for an hour. */
    await new Promise(r => setTimeout(r, 4000));
  }

  const out = {
    generated: new Date().toISOString(),
    source: 'OpenStreetMap contributors, ODbL 1.0',
    units: 'metres, island-local, +x east +y north',
    note: 'Buildings are oriented bounding boxes: x,y centre; w long axis; d short axis; rot radians from east.',
    islands,
  };
  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/abudhabi.json', JSON.stringify(out));
  const bytes = (await fs.stat('data/abudhabi.json')).size;
  process.stderr.write(`\nwrote data/abudhabi.json  ${(bytes/1048576).toFixed(2)} MB\n`);
}

/* Guarded so the geometry above can be imported by a test harness without firing a hundred
   Overpass requests. Running the file directly is unaffected. */
export { simplify, obb, hull, area, stitch, heightOf, projector };
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
