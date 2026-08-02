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
   THE PROJECTION. Local equirectangular about ONE origin for the whole emirate, not one per
   island. At this latitude and over the thirty kilometres from the Breakwater to Yas the error
   against a proper transverse Mercator is under a metre, and the alternative is a dependency.

   ONE ORIGIN IS THE WHOLE POINT, and v1 got it wrong. Per-island origins are fine for five
   separate discs floating in a diorama and worthless the moment the scene has to become a map:
   every island would sit at its own zero and Yas would share coordinates with the Corniche. With
   a shared frame the artefact IS a basemap — true distances, true bearings, true relative
   position — and the diorama's spreading of the islands becomes a display offset the camera can
   interpolate to zero. Baking the separation in would mean throwing the data away to get the map
   back.

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
/* The shared frame. Chosen near the centroid of the five so no island carries a large coordinate
   for no reason; nothing depends on its exact value, only on it being the same for all of them. */
const ORIGIN = { lat: 24.4900, lon: 54.4200 };

/* Each island also carries a CENTRE, a point known to be on it. That is how the right coastline
   ring gets picked out of everything the box dragged in; see pickIsland below. */
const ISLANDS = [
  /* WIDENED TO THE ISLAND, NOT THE POSTCARD. The first correct bake returned an outline of
     15.32 x 12.49 km from a box measuring 10.5 x 11.6 — the ring is closed and contains the
     centre, so it is the real landmass, and Abu Dhabi Island simply runs further than the
     Corniche does: west to the Breakwater, east past Maqta, south down the Mussafah channel.

     An outline larger than the fetch box is not a cosmetic mismatch. Roads and buildings were
     clipped at the old edges while the coast was not, so the artefact described several square
     kilometres of land with no city standing on it — which would render as desert inside a
     shoreline and read as a hole in the data rather than as the edge of a query. */
  { id:'corniche', name:'Abu Dhabi Island', bbox:[24.3800, 54.2800, 24.5450, 54.4900], centre:[24.4750, 54.3500] },
  { id:'maryah',   name:'Al Maryah',        bbox:[24.4930, 54.3760, 24.5150, 54.4020], centre:[24.5015, 54.3905] },
  { id:'reem',     name:'Al Reem',          bbox:[24.4850, 54.3850, 24.5200, 54.4300], centre:[24.4980, 54.4060] },
  { id:'saadiyat', name:'Saadiyat',         bbox:[24.5150, 54.3800, 24.5950, 54.4800], centre:[24.5450, 54.4300] },
  { id:'yas',      name:'Yas',              bbox:[24.4450, 54.5550, 24.5250, 54.6450], centre:[24.4880, 54.6050] },
];

/* THE LANDMARKS, LOOKED UP BY NAME RATHER THAN TYPED AS COORDINATES.

   The scene's anchors are absolute unit positions authored against a hand-drawn coastline — palace
   at x -105, ADNOC at +105 — which spanned an island 380 units wide and sit inside two per cent of
   one 2,440 wide. All three landed on top of each other in the middle, which is why only one of
   them can be tapped.

   Typing latitudes instead would be the same mistake with better numbers: I would be guessing them
   and nobody would know which were wrong. OSM already holds these as named features, so the bake
   asks for them by name and reports what it found. A name that returns nothing is visible in the
   Action log rather than silently landing at the island's centre.

   `out center` gives a node its position and a way or relation its bounding-box centre, which for
   a building footprint is the right anchor for a camera to aim at. */
/* CANONICAL NAME -> THE SPELLINGS OSM ACTUALLY USES, and the first bake needed this badly.

   Twelve of twenty-three resolved, and the misses were not random: Emirates Palace, Louvre Abu
   Dhabi, Manarat Al Saadiyat, Ferrari World and Gate Towers. Every one of those carries an Arabic
   `name` with the English in `name:en`, which is the normal convention for UAE features and which
   a query against `name` alone cannot see. The remainder were variants — "The Gate Towers",
   "ADNEC", "The Galleria" without its island.

   So each landmark is a canonical key and a list of acceptable spellings, and the query looks at
   name, name:en, alt_name and official_name. The key is what the artefact stores, so the scene
   keeps asking for one name however many the map has. */
const LANDMARKS = {
  corniche: {
    'Emirates Palace':     ['Emirates Palace', 'Emirates Palace Mandarin Oriental'],
    'Etihad Towers':       ['Etihad Towers', 'The Etihad Towers'],
    'ADNOC Headquarters':  ['ADNOC Headquarters', 'ADNOC HQ', 'ADNOC Group Headquarters'],
    'Qasr Al Hosn':        ['Qasr Al Hosn'],
    'Marina Mall':         ['Marina Mall', 'Marina Mall Abu Dhabi'],
    'Capital Gate':        ['Capital Gate', 'Capital Gate Tower'],
    'ADNEC':               ['Abu Dhabi National Exhibition Centre',
                            'Abu Dhabi National Exhibition Center', 'ADNEC'],
  },
  maryah: {
    'The Galleria Al Maryah Island': ['The Galleria Al Maryah Island', 'The Galleria',
                                      'Galleria Al Maryah Island'],
    'Cleveland Clinic Abu Dhabi':    ['Cleveland Clinic Abu Dhabi'],
    'Abu Dhabi Global Market':       ['Abu Dhabi Global Market', 'ADGM'],
  },
  reem: {
    'Gate Towers': ['Gate Towers', 'The Gate Towers'],
    'Sky Tower':   ['Sky Tower', 'Sky Tower Abu Dhabi'],
    'Reem Mall':   ['Reem Mall'],
  },
  saadiyat: {
    'Louvre Abu Dhabi':      ['Louvre Abu Dhabi', 'Louvre'],
    'Zayed National Museum': ['Zayed National Museum'],
    'Manarat Al Saadiyat':   ['Manarat Al Saadiyat', 'Manarat al Saadiyat'],
    'Berklee Abu Dhabi':     ['Berklee Abu Dhabi'],
  },
  yas: {
    'Ferrari World Abu Dhabi': ['Ferrari World Abu Dhabi', 'Ferrari World'],
    'Yas Marina Circuit':      ['Yas Marina Circuit'],
    'Yas Mall':                ['Yas Mall'],
    'Etihad Arena':            ['Etihad Arena'],
    'Yas Waterworld':          ['Yas Waterworld', 'Yas Waterworld Abu Dhabi',
                                'Yas Water World'],
    'SeaWorld Abu Dhabi':      ['SeaWorld Abu Dhabi', 'SeaWorld Yas Island, Abu Dhabi'],
  },
};
/* The tags a name might live under, in no particular order — a feature can carry several and they
   need not agree. */
const NAME_KEYS = ['name', 'name:en', 'alt_name', 'official_name'];

/* ROAD CLASSES KEPT, and the mapping to the three widths the painter already understands.
   Everything below `service` is dropped: driveways and car park aisles are noise at 7.7 metres
   per unit and they outnumber the real network several times over. */
const ROAD_CLASS = {
  motorway:'major', motorway_link:'major', trunk:'major', trunk_link:'major',
  primary:'major', primary_link:'major',
  secondary:'minor', secondary_link:'minor', tertiary:'minor', tertiary_link:'minor',
  residential:'local', unclassified:'local', living_street:'local',
};
/* SERVICE IS GONE, and it was most of the file. The first bake returned 12,790 road ways for
   Corniche alone against a real arterial-and-street network of maybe two thousand; the rest is
   car park aisles, petrol station forecourts and driveways. At 7.8 metres per unit a driveway is
   a third of a unit wide — narrower than the line used to draw it — so it costs bytes and paint
   time to produce something that cannot be seen. */

/* Buildings smaller than this are dropped. 120 m² is a villa outbuilding or a substation; at
   diorama scale it is a speck that costs an instance. */
const MIN_BUILDING_AREA = 120;
/* Simplification tolerance for coastline and road geometry, in metres. Two metres is well below
   anything visible at this scale and removes most of OSM's surveyed detail. */
const SIMPLIFY_M = 2.0;

/* ---------- OVERTURE BUILDINGS ---------------------------------------------------------------

   WHY THE BUILDINGS MOVED SOURCE AND THE REST DID NOT.

   The measurement that forced this: against their own baked outlines, Al Maryah holds 34 buildings
   and Al Reem 96, at 29 and 16 per square kilometre against Abu Dhabi Island's 194. The clip is
   not the cause — of 1,976 buildings rejected across the five islands, two are within 100 m of a
   coastline and the rest are 300 m to 8.5 km out to sea, so they are correctly rejected. Nor is it
   the bounding boxes. The median building OSM holds on Al Maryah is 3,493 m² and on Al Reem
   2,476 m², against 439 m² on the main island. That is not a thinly mapped city. It is a map
   containing the towers and the malls and none of the ordinary stock — somebody added the
   landmarks by hand and nobody ever traced the rest.

   Overture conflates OSM first and then fills the gaps with machine-derived footprints, which is
   exactly the missing layer. OSM buildings still arrive: they arrive INSIDE Overture, at higher
   priority than the ML data, so nothing hand-surveyed is lost by this change.

   COASTLINE, ROADS, PARKS AND LANDMARKS STAY ON OVERPASS. The centrelines work, roadsNormalised
   is built around OSM's highway classes, and the coastline stitcher is built around OSM's
   left-hand-land convention. Moving two sources in one bake is how a single symptom becomes
   unattributable, and this file has paid that price before.

   THE DATA IS NOT FETCHED HERE. Overture is GeoParquet on S3 with no REST endpoint, so the
   workflow runs one DuckDB query into a newline-delimited JSON file and this reads it. Deliberate:
   the fetch is a build step with a binary dependency, the bake stays plain Node, and the file can
   be produced by hand for a local run.

   AND IF THE FILE IS NOT THERE, THE OSM PATH STILL RUNS. A missing extract degrades to exactly
   the bake that produced the current data rather than to an empty archipelago, which is the
   difference between a workflow step that failed and a repository full of islands with no
   buildings on them. */
const OVERTURE_NDJSON = process.env.W2H_OVERTURE || '.cache/overture-buildings.ndjson';

/* Loaded once for all five islands, because the query is one scan of the union bounding box and
   splitting it per island would be five scans of S3 for the same rows. Kept in geographic degrees
   alongside the projected box so island assignment costs a comparison rather than an inversion. */
let OVERTURE = null;

/* Overture carries height in metres directly, and num_floors where it does not. Same 3.2 m storey
   and the same sanity window as heightOf uses on OSM tags, so a building that appears in both
   sources gets the same height whichever path it came down.

   Most ML-derived footprints carry neither, and that is expected rather than a fault: the
   consumer already models a height for untagged stock from the district falloff, and a thousand
   modelled buildings read incomparably better than a thousand absent ones. Expect withHeight to
   fall as a PROPORTION in the index while rising in absolute terms. */
function overtureHeight(h, floors){
  const hv = typeof h === 'number' ? h : parseFloat(h);
  if (isFinite(hv) && hv > 2 && hv < 400) return Math.round(hv * 10) / 10;
  const lv = typeof floors === 'number' ? floors : parseFloat(floors);
  if (isFinite(lv) && lv >= 1 && lv < 130) return Math.round(lv * 3.2 * 10) / 10;
  return null;
}

/* The outer ring, and for a multipolygon the LARGEST outer ring. A building represented as several
   polygons is a terminal or a mall with detached wings, and the oriented box wants the piece that
   carries the mass rather than a bounding box drawn round the lot — which on Zayed International
   would be a kilometre wide. */
function outerRing(geom){
  if (!geom) return null;
  if (geom.type === 'Polygon') return geom.coordinates && geom.coordinates[0];
  if (geom.type === 'MultiPolygon'){
    let best = null, bestA = 0;
    for (const poly of geom.coordinates || []){
      const r = poly && poly[0];
      if (!r || r.length < 4) continue;
      const a = area(r);
      if (a > bestA){ bestA = a; best = r; }
    }
    return best;
  }
  return null;
}

/* The OSM way or relation id, WHERE OVERTURE'S CONFLATION FOUND ONE, kept alongside the GERS id.

   GERS is the better join key — it is designed to survive a release where an OSM way is split or
   replaced, which is precisely when an osm id stops meaning what it meant — so it goes in `id`.
   But every building already matched to a venue in Supabase was matched on the osm id, so
   discarding it would make this bake a one-way door and the existing join unrepeatable. It costs
   a dozen bytes on the buildings that have one. */
function osmIdOf(sources){
  for (const s of sources || []){
    const ds = s && s.dataset, rid = s && s.record_id;
    if (!rid || !/openstreetmap/i.test(String(ds))) continue;
    const m = String(rid).match(/^([wrn])(\d+)$/);
    if (m) return m[1] === 'r' ? -Number(m[2]) : Number(m[2]);
  }
  return null;
}

/* Reads the extract into oriented boxes in the shared metre frame, once. Streamed rather than read
   whole: the union box over Abu Dhabi is a hundred thousand-odd footprints with their geometry,
   and holding that as one string before parsing it is a needless spike in a runner that also has
   DuckDB's residue in memory. */
async function loadOverture(proj){
  if (OVERTURE) return OVERTURE;
  const fs = await import('node:fs');
  const readline = await import('node:readline');
  try { await (await import('node:fs/promises')).access(OVERTURE_NDJSON); }
  catch {
    process.stderr.write(`  no Overture extract at ${OVERTURE_NDJSON} — falling back to OSM buildings\n`);
    OVERTURE = { rows: null };
    return OVERTURE;
  }

  const rows = [];
  let lines = 0, noGeom = 0, tooSmall = 0, noBox = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(OVERTURE_NDJSON, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl){
    const s = line.trim();
    if (!s) continue;
    lines++;
    let rec;
    /* One malformed line must not take the archipelago down. DuckDB writes clean JSON, but a
       truncated file from a cancelled step is a real thing and it should cost the rows after the
       truncation and nothing else. */
    try { rec = JSON.parse(s); } catch { noGeom++; continue; }

    let geom = rec.geojson;
    if (typeof geom === 'string'){ try { geom = JSON.parse(geom); } catch { geom = null; } }
    const ring = outerRing(geom);
    if (!ring || ring.length < 4){ noGeom++; continue; }

    /* GeoJSON is [lon, lat]; the projector takes (lat, lon). Getting this the wrong way round
       puts Abu Dhabi in the Indian Ocean, which is at least an obvious failure — but it is also
       the single most likely mistake in this function, so it is written once and named. */
    let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
    const xy = new Array(ring.length);
    for (let i = 0; i < ring.length; i++){
      const lon = ring[i][0], lat = ring[i][1];
      if (lon < lo0) lo0 = lon; if (lon > lo1) lo1 = lon;
      if (lat < la0) la0 = lat; if (lat > la1) la1 = lat;
      xy[i] = proj.fwd(lat, lon);
    }
    if (area(xy) < MIN_BUILDING_AREA){ tooSmall++; continue; }
    const b = obb(xy);
    if (!b){ noBox++; continue; }

    rows.push({
      lat: (la0 + la1) / 2, lon: (lo0 + lo1) / 2,
      rec: {
        id: rec.id,
        osm: osmIdOf(rec.sources),
        x: rd1(b.x), y: rd1(b.y),
        w: rd1(b.w), d: rd1(b.d),
        rot: Math.round(b.rot * 1000) / 1000,
        h: overtureHeight(rec.height, rec.num_floors),
      },
    });
  }

  process.stderr.write(`  Overture: ${lines} rows -> ${rows.length} buildings ` +
    `(${tooSmall} under ${MIN_BUILDING_AREA} m², ${noGeom} unusable geometry, ${noBox} no box)\n`);
  OVERTURE = { rows };
  return OVERTURE;
}

/* Everything whose centre falls in this island's fetch box. The same box Overpass was given, so
   the two sources see the same ground and the coastline clip downstream behaves identically —
   which is the point: this change must move which buildings exist, not which ones survive. */
function overtureFor(isle){
  if (!OVERTURE || !OVERTURE.rows) return null;
  const [s, w, n, e] = isle.bbox;
  const out = [];
  for (const r of OVERTURE.rows){
    if (r.lat >= s && r.lat <= n && r.lon >= w && r.lon <= e){
      /* Cloned, because one building can legitimately fall in two islands' boxes and the JSON
         writer must not see the same object twice under two extents. */
      out.push({ ...r.rec });
    }
  }
  return out;
}

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

function landmarkQuery(bbox, spellings){
  const b = bbox.join(',');
  /* EXACT MATCHES, NOT A REGEX, and the Corniche bake failed six times before this changed.

     `nwr["name"~"^(a|b|c)$"]` reads tidily and cannot use Overpass's tag index, so it scans every
     named object in the box. That was survivable on Yas and Al Maryah and fatal on Abu Dhabi
     Island, whose box is now 21 by 18 kilometres — five times the area of any other. Four regex
     scans over it returned 504 from both mirrors, four times, and the island came back 0 of 7
     while every other island resolved.

     `["name"="Emirates Palace"]` is an index lookup. One statement per spelling per key is about
     sixty statements for Corniche, which looks worse and runs in a fraction of the time, because
     sixty index probes beat one full scan by a wide margin.

     The spellings list is doing double duty now: it was written to absorb naming variation and it
     is also what makes the exact-match form possible at all. */
  const q = [];
  for (const sp of spellings){
    const esc = sp.replace(/["\\]/g, '\\$&');
    for (const k of NAME_KEYS) q.push(`  nwr["${k}"="${esc}"](${b});`);
  }
  return `[out:json][timeout:180];\n(\n${q.join('\n')}\n);\nout center;`;
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

/* PICKING THE ISLAND OUT OF WHAT THE BOX DRAGGED IN, and the first bake did this wrong.

   v2 stitched the fragments and took the longest chain. That is not the island, and the reported
   extents said so: Al Maryah came back 3.59 x 3.28 km against a real 900 metres, Al Reem 8.53 x
   9.30 against 2.5, and Abu Dhabi Island 15.32 x 12.49 — larger than the bounding box that
   fetched it, which is the detail that gives the game away.

   Overpass returns whole ways that INTERSECT the box, geometry and all. So the mainland shore
   runs in at one edge and out at the other, carrying kilometres of coastline that were never
   asked for, and the longest chain is reliably that rather than the island sitting in the middle
   of it.

   The property that separates them is topological rather than metric: an island's coastline is a
   CLOSED ring, and a shore passing through is an open line. So take the closed rings, and of
   those take the one that actually contains a point known to be on the island. Both halves are
   needed — Lulu, Hudayriyat and half a dozen breakwaters are closed rings inside the Corniche box
   too, and picking the largest would find the right answer there and the wrong one for Al Maryah,
   whose box also catches the western edge of Reem. */
function contains(ring, p){
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) &&
        p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- THE BAKE-TIME PRE-CLIP ------------------------------------------------------------

   THE PROBLEM THIS SOLVES IS A FILE SIZE, AND IT IS CAUSED BY THE BOXES OVERLAPPING.

   Corniche's fetch box is 18 x 21 km and it wholly contains Al Maryah's and most of Al Reem's, so
   every building on those islands is written into isle-corniche.json as well as its own. Under OSM
   that cost a thousand rows nobody noticed. Under Overture's machine-derived fill it is the
   difference between a 2.8 MB artefact and one several times that, on the one island the hero
   opens on — and every one of those rows is discarded by insideIsle the moment it arrives.

   So the discard moves to the bake, where it is paid once rather than on every load.

   WITH A MARGIN, AND THE MARGIN IS THE WHOLE SAFETY ARGUMENT. The consumer clips against a
   RESAMPLED outline, this clips against the simplified one, and the two do not agree to the metre.
   Pre-removing anything the consumer would have kept would be an invisible, permanent loss, so the
   test here is deliberately looser: inside the coast, or within 150 m of it. The consumer's clip
   stays the authority and ?noclip still means what it meant — it disables the runtime test, and
   what it now shows is everything within 150 m of the shore rather than everything in the box.

   150 m is comfortably wider than any disagreement two samplings of the same coastline can produce
   and comfortably narrower than the 300 m at which the nearest genuinely-offshore building sits. */
const CLIP_MARGIN_M = 150;

function nearRing(ring, px, py, margin){
  const m2 = margin * margin;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){
    const ax = ring[j][0], ay = ring[j][1];
    const dx = ring[i][0] - ax, dy = ring[i][1] - ay;
    const L2 = dx*dx + dy*dy;
    let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + t*dx - px, qy = ay + t*dy - py;
    if (qx*qx + qy*qy <= m2) return true;
  }
  return false;
}

function clipToOutline(buildings, outline, margin){
  if (!outline || outline.length < 4) return buildings;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of outline){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = [];
  for (const b of buildings){
    /* The cheap rejection first. Most of what Corniche's box drags in is nowhere near Corniche's
       coast, and a bounding-box test settles those without touching two thousand segments. */
    if (b.x < x0 - margin || b.x > x1 + margin || b.y < y0 - margin || b.y > y1 + margin) continue;
    if (contains(outline, [b.x, b.y]) || nearRing(outline, b.x, b.y, margin)) out.push(b);
  }
  return out;
}

function pickIsland(chains, centre){
  const CLOSE_M = 60;   // a ring closes when its ends meet within a way's own node spacing
  const closed = chains.filter(c => c.length > 3 &&
    Math.hypot(c[0][0] - c[c.length-1][0], c[0][1] - c[c.length-1][1]) < CLOSE_M);
  const hit = closed.filter(c => contains(c, centre)).sort((a, b) => area(b) - area(a));
  if (hit.length) return { ring:hit[0], why:'closed ring containing the island centre' };

  /* No ring contains the centre. Almost always a coastline edit upstream that has left a way
     unclosed, and the honest thing is to say so rather than silently ship the mainland: the
     fallback is loud, and the extent it produces will be visibly wrong in the report. */
  const best = chains.slice().sort((a, b) => b.length - a.length)[0] || [];
  return { ring:best, why:'NO CLOSED RING FOUND — fell back to the longest chain, CHECK THIS' };
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
   left. Stitching them by shared endpoint is the only way to get an island out of it. */
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

async function bakeIsland(isle, proj){
  process.stderr.write(`  ${isle.id}: querying...\n`);
  const json = await overpass(query(isle.bbox));
  const els = json.elements || [];

  const toXY = g => g.map(p => proj.fwd(p.lat, p.lon));

  /* osmBuildings, not buildings. It is now the FALLBACK — used only when the Overture extract is
     absent — and naming it for what it is stops the two paths reading as one. */
  const coastWays = [], roads = [], osmBuildings = [], parks = [];
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
      osmBuildings.push({
        /* THE OSM ID, AND IT IS HERE FOR ONE REASON: it is the key a venue joins to.

           Selecting which buildings get real treatment cannot be a curated list — there are 18,776
           on this island and nobody maintains that. The useful filter is "contains a venue", which
           is a spatial join in Supabase between venue coordinates and these footprints, and its
           output has to be a stable identifier or there is nothing to store against the venue.

           Cheap now and expensive later: added after the join is computed, every mapping has to be
           recomputed against a file whose array order has changed. About 250 KB on Corniche. */
        id: el.type === 'relation' ? -el.id : el.id,
        x: rd1(b.x), y: rd1(b.y),
        w: rd1(b.w), d: rd1(b.d),
        rot: Math.round(b.rot * 1000) / 1000,
        h: heightOf(t),
      });
    }
  }

  /* WHICH SET OF BUILDINGS THIS ISLAND GETS, decided once and reported once.

     Overture where the extract exists, OSM where it does not. Not a merge: Overture has already
     conflated OSM in at higher priority than its machine-derived sources, so merging the two here
     would put every hand-surveyed building in twice, and two boxes on one plot is the fault this
     whole arc has been about. */
  const overture = overtureFor(isle);
  let buildings = overture || osmBuildings;
  process.stderr.write(`  ${isle.id}: buildings from ${overture ? 'Overture' : 'OSM'} ` +
    `(${buildings.length}` + (overture ? `, OSM alone returned ${osmBuildings.length}` : '') + `)\n`);

  /* A SECOND, SMALL QUERY. Folding these into the main one would work, but a landmark that fails
     to parse would take the whole island's coastline down with it, and the failure modes of a
     name list and a bounding-box sweep are nothing alike. */
  const marks = {};
  const table = LANDMARKS[isle.id] || {};
  const wanted = Object.keys(table);
  /* Spelling -> canonical, built once. A spelling shared by two landmarks would be a table bug and
     the last one would silently win, so the map is the right shape to notice that in. */
  const canon = {};
  for (const [key, list] of Object.entries(table)) for (const sp of list) canon[sp] = key;
  if (wanted.length){
    try {
      const lm = await overpass(landmarkQuery(isle.bbox, Object.keys(canon)));
      for (const el of lm.elements || []){
        const t = el.tags || {};
        let nm = null;
        for (const k of NAME_KEYS){ if (t[k] && canon[t[k]]){ nm = canon[t[k]]; break; } }
        if (!nm) continue;
        const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null) continue;
        const [x, y] = proj.fwd(lat, lon);
        /* First match wins. Several of these exist more than once in OSM — a mall and its bus
           stop, a circuit and its grandstand — and taking the first keeps the bake deterministic
           rather than dependent on element order between runs. */
        if (!marks[nm]) marks[nm] = { x:rd1(x), y:rd1(y) };
      }
    } catch (e){
      process.stderr.write(`    ${isle.id}: landmark query failed (${e.message}) — continuing\n`);
    }
    const missing = wanted.filter(n => !marks[n]);
    process.stderr.write(`  ${isle.id}: landmarks ${Object.keys(marks).length}/${wanted.length}` +
      (missing.length ? `  MISSING: ${missing.join(', ')}` : '') + `\n`);
    await new Promise(r => setTimeout(r, 2000));
  }

  const chains = stitch(coastWays);
  const picked = pickIsland(chains, proj.fwd(isle.centre[0], isle.centre[1]));
  const outline = picked.ring.length ? simplify(picked.ring, SIMPLIFY_M * 3).map(rd1) : [];
  process.stderr.write(`  ${isle.id}: ${chains.length} coast chains, took the ${picked.why}\n`);

  /* The first moment the coastline exists, which is the first moment a building can be told it is
     not on this island. Reported rather than silent: the number dropped here is the overlap
     between the fetch boxes, and if it ever comes out near zero on Corniche the boxes have moved. */
  if (outline.length){
    const before = buildings.length;
    buildings = clipToOutline(buildings, outline, CLIP_MARGIN_M);
    process.stderr.write(`  ${isle.id}: coast pre-clip ${before} -> ${buildings.length} ` +
      `(dropped ${before - buildings.length} beyond ${CLIP_MARGIN_M} m of the shore)\n`);
  }

  /* THE ISLAND'S TRUE EXTENT, measured from the outline rather than from the bounding box that
     fetched it. The consumer needs this to set its own radius from the data instead of from a
     literal — which is the whole reason the drawn islands were a third of true size and nobody
     noticed for seventy versions. */
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of outline){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const extent = outline.length
    ? { x0:rd1(x0), y0:rd1(y0), x1:rd1(x1), y1:rd1(y1),
        w:rd1(x1 - x0), d:rd1(y1 - y0),
        cx:rd1((x0 + x1) / 2), cy:rd1((y0 + y1) / 2) }
    : null;

  process.stderr.write(`  ${isle.id}: outline ${outline.length}pt, roads ${roads.length}, ` +
                       `buildings ${buildings.length} (${buildings.filter(b => b.h).length} with height), ` +
                       `parks ${parks.length}` +
                       (extent ? `, extent ${(extent.w/1000).toFixed(2)} x ${(extent.d/1000).toFixed(2)} km` : '') +
                       `\n`);

  return { id:isle.id, name:isle.name, extent, landmarks:marks, outline, roads, buildings, parks };
}

const rd1 = p => Array.isArray(p) ? [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]
                                  : Math.round(p*10)/10;
const rd2 = p => [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10];

/* ---------- PROBE ----------------------------------------------------------------------------

   COUNT BEFORE COMMITTING, because the whole case for this change rests on a claim about somebody
   else's dataset that this repository has never verified. Overture SHOULD fill Al Reem. If it does
   not — if the extract returns 96 buildings there as well — then the conflation does not reach the
   Gulf, the change is worthless, and the right thing is to find that out in one minute rather than
   after a bake, a deploy and an evening of looking at an empty island.

   Reads the extract, counts per island fetch box, and prints it beside what the committed index
   currently holds. Writes nothing and commits nothing. */
async function probe(proj){
  await loadOverture(proj);
  if (!OVERTURE.rows){
    process.stderr.write(`\nNo extract to probe. The fetch step did not run or wrote nowhere.\n`);
    process.exit(1);
  }
  let prev = {};
  try {
    const fs = await import('node:fs/promises');
    const idx = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
    for (const i of idx.islands || []) prev[i.id] = i.counts || {};
  } catch { /* first run, or a fresh checkout — the comparison column simply stays blank */ }

  process.stderr.write(`\n${'island'.padEnd(10)}${'OSM now'.padStart(10)}${'Overture'.padStart(10)}` +
                       `${'change'.padStart(10)}${'with height'.padStart(14)}\n`);
  for (const isle of ISLANDS){
    const got = overtureFor(isle);
    const was = prev[isle.id] ? prev[isle.id].buildings : null;
    const h = got.filter(b => b.h != null).length;
    const chg = was ? (got.length / was).toFixed(2) + 'x' : '—';
    process.stderr.write(`${isle.id.padEnd(10)}${String(was == null ? '—' : was).padStart(10)}` +
      `${String(got.length).padStart(10)}${chg.padStart(10)}` +
      `${(h + ' (' + Math.round(100 * h / Math.max(got.length, 1)) + '%)').padStart(14)}\n`);
  }
  process.stderr.write(`\nProbe only — nothing written, nothing committed.\n`);
}

async function main(){
  /* Flags are filtered out so `--probe` cannot be mistaken for an island name, which it would have
     been as argv[2]. */
  const args = process.argv.slice(2).filter(a => a && a[0] !== '-');
  const only = args[0];
  const list = only ? ISLANDS.filter(i => i.id === only) : ISLANDS;
  if (!list.length) throw new Error(`no island called "${only}"`);

  const proj = projector(ORIGIN.lat, ORIGIN.lon);

  if (process.argv.includes('--probe')) return probe(proj);

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });

  /* Before any island is baked, so the source is known for the whole run and the log says which
     one it used before it says how many it found. */
  await loadOverture(proj);
  const usingOverture = !!OVERTURE.rows;

  /* WHAT THE COMMITTED DATA HOLDS NOW, read before anything overwrites it. A bake that quietly
     halves an island is the failure mode this change can produce and cannot detect from inside a
     single run — the numbers all look self-consistent. Comparing against the previous index is the
     only place the regression is visible. */
  let prevCounts = {};
  try {
    const idx = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
    for (const i of idx.islands || []) prevCounts[i.id] = i.counts || {};
  } catch { /* nothing committed yet */ }

  /* ONE FILE PER ISLAND, plus a small index.

     v1 wrote a single 3.4 MB artefact, which means the hero cannot draw the Corniche until it has
     also downloaded Saadiyat and Yas. Corniche is three quarters of the payload and the only
     island the opening shot contains, so splitting turns a 3.4 MB blocking fetch into a small
     index, one island, and four more whenever the camera actually goes there.

     The index carries the shared origin and every island's extent. That is enough to lay out the
     archipelago, size the cameras and decide what to load, without opening a single island file. */
  /* THE ATTRIBUTION IS PART OF THE ARTEFACT, not a formality. Overture's buildings theme is ODbL
     because OSM is in it, so the licence does not change — but the credit line does, and a data
     file that says where it came from is the only thing standing between a future reader and a
     wrong assumption about coverage. Which is exactly the assumption that cost this session an
     evening: `source` said OpenStreetMap and nobody read it. */
  const index = { generated:new Date().toISOString(),
                  source: usingOverture
                    ? 'Buildings: Overture Maps Foundation, ODbL 1.0 (conflated from OpenStreetMap, ' +
                      'Esri Community Maps, Microsoft ML Buildings, Google Open Buildings). ' +
                      'Coastline, roads, parks and landmarks: OpenStreetMap contributors, ODbL 1.0.'
                    : 'OpenStreetMap contributors, ODbL 1.0',
                  buildingSource: usingOverture ? 'overture' : 'osm',
                  origin:ORIGIN,
                  units:'metres from origin, +x east +y north, one shared frame for all islands',
                  note:'Buildings are oriented bounding boxes: x,y centre; w long axis; d short axis; rot radians from east.',
                  islands:[] };

  for (const isle of list){
    const baked = await bakeIsland(isle, proj);
    const path = `data/isle-${baked.id}.json`;
    await fs.writeFile(path, JSON.stringify(baked));
    const bytes = (await fs.stat(path)).size;

    /* A ROADS-ONLY ARTEFACT, and it exists because of where the scene needs this data.

       The island file is 2.7 MB on Corniche and the roads inside it are a fraction of that — the
       rest is 18,776 buildings. But the ground canvas is painted while the island is built, so the
       centrelines have to be in hand BEFORE the first frame, and putting 2.7 MB on that path would
       undo a load that is now two seconds.

       Major and minor only. Local streets are most of the count and the least of the picture at
       7.8 metres to the unit, and they can come later with the buildings if they are ever wanted.
       Written even when empty, so a consumer never has to distinguish "no roads" from "not baked
       yet". */
    const rd = { id:baked.id,
                 roads:(baked.roads || []).filter(r => r.cls === 'major' || r.cls === 'minor') };
    const rpath = `data/roads-${baked.id}.json`;
    await fs.writeFile(rpath, JSON.stringify(rd));
    const rbytes = (await fs.stat(rpath)).size;
    process.stderr.write(`  ${baked.id}: roads-only ${rd.roads.length} ways, ` +
                         `${(rbytes/1048576).toFixed(2)} MB\n`);
    /* THE OUTLINE GOES IN THE INDEX AS WELL AS THE ISLAND FILE, and it is the only thing that
       does. The world view draws all five coastlines at once but needs no road or building from
       four of them, so without this the opening shot has to download 3.4 MB to draw five
       silhouettes. All five outlines together are about forty kilobytes.

       Duplicated rather than moved, because an island file that cannot draw its own coast is a
       trap for whatever loads it next. Forty kilobytes is a fair price for the artefact staying
       self-describing. */
    index.islands.push({ id:baked.id, name:baked.name, file:`isle-${baked.id}.json`,
                         extent:baked.extent, outline:baked.outline,
                         landmarks:baked.landmarks, bytes,
                         counts:{ outline:baked.outline.length, roads:baked.roads.length,
                                  buildings:baked.buildings.length,
                                  withHeight:baked.buildings.filter(b => b.h).length,
                                  parks:baked.parks.length } });
    process.stderr.write(`  ${baked.id}: wrote ${path}  ${(bytes/1048576).toFixed(2)} MB\n`);

    /* A WARNING AND NOT A FAILURE, deliberately. A count that drops can be legitimate — a source
       correcting duplicates, a bounding box tightened on purpose — and a bake that refuses to
       finish would mean the only way to accept a real improvement is to disable the guard. The
       workflow's contract has always been "run it, look at the diff, keep it or revert it", so
       this makes the thing worth looking at impossible to scroll past. */
    const was = prevCounts[baked.id];
    if (was && was.buildings > 0){
      const now = baked.buildings.length;
      if (now < was.buildings * 0.8){
        process.stderr.write(`  !! ${baked.id}: BUILDINGS FELL ${was.buildings} -> ${now} ` +
          `(${Math.round(100 * now / was.buildings)}%). Check the diff before keeping this.\n`);
      }
    }
    /* Serial, with a gap. Overpass asks for it, and five parallel requests from one Action IP is
       how the repo gets rate-limited for an hour. */
    await new Promise(r => setTimeout(r, 4000));
  }

  /* A PARTIAL BAKE MUST NOT TRUNCATE THE INDEX. Running one island rewrites its own file and its
     own entry, and leaves the other four exactly as they were. */
  if (only){
    try {
      const prev = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
      const kept = (prev.islands || []).filter(i => i.id !== only);
      index.islands = kept.concat(index.islands)
        .sort((a, b) => ISLANDS.findIndex(i => i.id === a.id) - ISLANDS.findIndex(i => i.id === b.id));
    } catch { /* no previous index; the single entry stands alone */ }
  }

  await fs.writeFile('data/index.json', JSON.stringify(index, null, 1));
  const total = index.islands.reduce((a, i) => a + (i.bytes || 0), 0);
  process.stderr.write(`\nwrote data/index.json  —  ${index.islands.length} islands, ` +
                       `${(total/1048576).toFixed(2)} MB total\n`);
}

/* Guarded so the geometry above can be imported by a test harness without firing a hundred
   Overpass requests. Running the file directly is unaffected. */
export { simplify, obb, hull, area, stitch, heightOf, projector };
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
