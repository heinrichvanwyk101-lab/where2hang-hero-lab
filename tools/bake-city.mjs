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
  /* AL RAHA — A MAINLAND PATCH, NOT AN ISLAND, AND SAID SO VIA noCoastline. Al Raha Beach is a
     strip of reclaimed islands and canals off Khalifa City, about 1.4 km south of Yas's mapped
     extent, with the E10 behind it; there is no closed coastline ring around the whole of it for
     pickIsland to find, because the mainland's coastline runs on past both ends.

     outlineLL IS THE FRAME, NOT THE SHORE. Drawn in geojson.io ([lon, lat] pairs, GeoJSON order):
     its inland edges say where the district stops — the west cut just before Aldar HQ, because
     west of there toward the city the ground is bare; the south edge along the E10; the east cut
     at the Yas channel — and its seaward edge is drawn generously out in the water on purpose.
     landFromCoast cuts OSM's own natural=coastline to this frame, so the shore, every canal and
     every island (Al Bandar, Al Muneera, Al Zeina, Al Dana …) come from the survey. The frame also
     sets the island's extent, so the hand-placed coordinates in w2h-world.js keep their origin
     across re-bakes. The bbox only has to fetch everything the frame needs. */
  { id:'raha', name:'Al Raha', bbox:[24.4300, 54.5600, 24.4600, 54.6150], centre:[24.4460, 54.5850],
    noCoastline: true,
    outlineLL: [
      [54.5881734,24.4489563], [54.5881551,24.4490593], [54.5811947,24.4475319],
      [54.5811347,24.4475377], [54.5750014,24.4461074], [54.5748943,24.4461175],
      [54.5667020,24.4433125], [54.5666481,24.4433784], [54.5649171,24.4428256],
      [54.5648651,24.4428712], [54.5680941,24.4391831], [54.5679853,24.4392190],
      [54.5678800,24.4359913], [54.5677624,24.4359725], [54.6111797,24.4483072],
      [54.6111108,24.4483492], [54.6089666,24.4542213], [54.6089935,24.4542328],
      [54.6081634,24.4553932], [54.5887981,24.4502185], [54.5880841,24.4500382],
    ] },
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

/* PATHS ARE A SEPARATE CLASS FROM ROADS, and separate is the whole point rather than tidiness.
   `way["highway"]` has always fetched cycleways and footways — they were being dropped here, by
   ROAD_CLASS returning undefined and the branch below doing `continue`. So this costs no change
   to the Overpass query and no new tracing.

   They must not land in `roads`, because the road painter derives carriageways, kerb casings,
   edge lines and medians from a class, and a 3 m cycle track is none of those things. Separate
   array, separate paint pass.

     cycle   cycleway                     - the red-brown segregated track
     foot    footway, path                - promenade and pavement runs
     plaza   pedestrian (closed ways)     - squares and paved precincts, kept as rings

   STEPS ARE DROPPED. A staircase is under a unit long at diorama scale and there is no camera
   position from which it is anything but a speck. */
const PATH_CLASS = { cycleway:'cycle', footway:'foot', path:'foot', pedestrian:'plaza' };

/* FIVE HUNDRED METRES, MEASURED AFTER STITCHING AND NEVER BEFORE IT.

   OSM splits ways at every junction and every tag change, so length-per-way is not
   length-per-facility. Measured on the roads this repository already ships, the MEDIAN way is
   73 m on Corniche, 74 on Yas, 71 on Raha, 70 on Reem, and only 8.6 per cent of Corniche's ways
   clear 500 m on their own. The Corniche cycle track is one continuous eight-kilometre facility
   in reality and arrives here as dozens of fragments; a raw length filter would reject nearly
   every one of them and keep almost nothing.

   Stitching first was tested against the baked roads before this was written. Corniche's majors
   go 1,743 ways to 531 chains, median 82 m to 143 m, longest 13,011 m. Al Raha's majors go 61 to
   22, median 300 m to 634 m. So the threshold is applied to chains.

   The number itself is the brief: continuous promenade and seafront runs, not the 40 m footpath
   between a car park and a lobby door. */
const MIN_PATH_M  = 500;
/* Plazas are areas, so they are filtered by area rather than length. Two thousand square metres
   is roughly a 45 m square — big enough to read as a precinct at flyover height, small enough to
   keep a mosque forecourt or a marina square. */
const MIN_PLAZA_M2 = 2000;
/* SERVICE IS GONE, and it was most of the file. The first bake returned 12,790 road ways for
   Corniche alone against a real arterial-and-street network of maybe two thousand; the rest is
   car park aisles, petrol station forecourts and driveways. At 7.8 metres per unit a driveway is
   a third of a unit wide — narrower than the line used to draw it — so it costs bytes and paint
   time to produce something that cannot be seen. */

/* Buildings smaller than this are dropped. 120 m² is a villa outbuilding or a substation; at
   diorama scale it is a speck that costs an instance.

   CHOSEN AGAINST OSM'S STOCK, WHICH IS THE REASON IT NOW NEEDS ARGUING WITH. Under OSM small
   buildings were rare because nobody had traced them, so the threshold cost little. The first
   Overture extract returned 77,821 footprints over the archipelago and this discarded 33,670 of
   them — forty-three per cent — which makes it the largest single lever on how populated these
   islands look, and far too large a lever to leave as a literal nobody has re-examined.

   Overridable, so the question can be answered by running it rather than by arguing about it. */
const MIN_BUILDING_AREA = Number(process.env.W2H_MIN_AREA) || 120;

/* A FLOOR BELOW THE THRESHOLD, not a second threshold. Everything above this is read and carries
   its area, so the probe can report what a different threshold would buy per island without a
   second S3 scan. Below 20 m² is a bin store or a piece of ML noise and nothing will ever want it. */
const AREA_FLOOR = 20;
/* Simplification tolerance for coastline and road geometry, in metres. Two metres is well below
   anything visible at this scale and removes most of OSM's surveyed detail. */
const SIMPLIFY_M = 2.0;

/* AN ESTIMATE, NOT A MEASUREMENT — no source gives Khor Al Raha's own channel width. 120 m reads
   plausibly against the reference photos' own proportions; if a real figure ever surfaces this is
   the one number in the water pipeline that should change. */
const WATERWAY_WIDTH_M = 120;

/* THE POLYGON THRESHOLD, AND WHY THE OBB IS NO LONGER ENOUGH ON ITS OWN.

   The note at the top of this file argues that buildings are oriented boxes because the fabric
   extruder consumes { x, z, rot, w, dp } and a 40-vertex footprint would be reduced to exactly
   that on arrival. That was true, and for thirty thousand background buildings it still is: at
   diorama scale a plot's proportion and its angle to the street are the whole of what reads.

   It stopped being true for the handful you can now walk up to. The nav camera reaches about 270
   units, which is close enough to count 5 m paving cells, and at that range a hotel is not fabric
   — it is a building with a courtyard, and an OBB has no courtyard. The Hilton on Yas is 270 x 136
   m and arrives as one solid slab, so its pool sits inside forty metres of extruded hotel and can
   only be glimpsed under the edges. No consumer can carve a hole in a box it was handed.

   So the box stays, for everything, and the RING is carried as well above an area threshold. At
   8,000 m² that is 266 buildings across all five islands — 186 Corniche, 28 Saadiyat, 28 Yas, 18
   Reem, 6 Al Maryah — against 26,325 in total. Tens of kilobytes to fix the only ones anybody will
   ever look at closely. Stored as offsets from the box centre and rounded to 0.1 m, because an
   absolute coordinate in the emirate frame is five digits before the point and the delta is three.

   Consumers must treat `p` as optional and fall back to the box: it is absent on 99 per cent of
   the stock by design, and absent on ALL of it until the bake has been re-run. */
const POLY_AREA = Number(process.env.W2H_POLY_AREA) || 8000;
const POLY_MAX_PTS = 160;

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
    const a = area(xy);
    if (a < AREA_FLOOR){ tooSmall++; continue; }
    const b = obb(xy);
    if (!b){ noBox++; continue; }

    rows.push({
      lat: (la0 + la1) / 2, lon: (lo0 + lo1) / 2, a,
      rec: {
        id: rec.id,
        osm: osmIdOf(rec.sources),
        x: rd1(b.x), y: rd1(b.y),
        w: rd1(b.w), d: rd1(b.d),
        rot: Math.round(b.rot * 1000) / 1000,
        h: overtureHeight(rec.height, rec.num_floors),
        /* WHAT IT IS. Carried so the renderer can stop choosing a facade by hashing an id.

           `class` is the specific one — hotel, apartments, retail, warehouse, hangar, parking —
           and `subtype` the coarse bucket it sits in. Both are short strings and both are absent
           on plenty of buildings, so anything reading them has to cope with null; that is still
           strictly better than the id hash, which is wrong about every building it describes.

           Roof and facade attributes are sparse. They are taken anyway because where they exist
           they beat any inference, and where they do not they cost one null. */
        cls: rec.class || null,
        sub: rec.subtype || null,
        rs:  rec.roof_shape || null,
        rc:  rec.roof_color || null,
        fm:  rec.facade_material || null,
        fc:  rec.facade_color || null,
      },
    });

    /* The ring, for the large ones only. Simplified at the same 2 m the coastline uses, and
       simplified harder rather than truncated if a footprint is pathological — a clipped ring is a
       lie about the shape, whereas a coarser one is merely a coarser truth. The closing duplicate
       vertex is dropped; consumers close their own rings. */
    if (a >= POLY_AREA){
      let ring2 = simplify(xy, SIMPLIFY_M);
      for (let t = SIMPLIFY_M * 2; ring2.length > POLY_MAX_PTS && t < 64; t *= 2) ring2 = simplify(xy, t);
      const last = ring2.length - 1;
      if (last > 2 && ring2[0][0] === ring2[last][0] && ring2[0][1] === ring2[last][1]) ring2 = ring2.slice(0, last);
      if (ring2.length >= 3 && ring2.length <= POLY_MAX_PTS){
        rows[rows.length - 1].rec.p = ring2.map(q => [rd1(q[0] - b.x), rd1(q[1] - b.y)]);
      }
    }
  }

  process.stderr.write(`  Overture: ${rows.filter(r => r.rec.p).length} carry a ring ` +
    `(at or above ${POLY_AREA} m², max ${POLY_MAX_PTS} pts)\n`);
  process.stderr.write(`  Overture: ${lines} rows -> ${rows.length} readable ` +
    `(${tooSmall} under ${AREA_FLOOR} m², ${noGeom} unusable geometry, ${noBox} no box); ` +
    `${rows.filter(r => r.a >= MIN_BUILDING_AREA).length} at or above ${MIN_BUILDING_AREA} m²\n`);
  OVERTURE = { rows };
  return OVERTURE;
}

/* Everything whose centre falls in this island's fetch box. The same box Overpass was given, so
   the two sources see the same ground and the coastline clip downstream behaves identically —
   which is the point: this change must move which buildings exist, not which ones survive. */
/* ---------- VENUES ---------------------------------------------------------------------------

   THE ONE SOURCE THAT KNOWS WHAT A BUILDING IS FOR.

   Overture tags 24 per cent of Abu Dhabi's buildings and almost all of it is housing: 2,915
   houses, 1,337 apartments, and across five islands eighteen hotels and fifty-seven commercial.
   It describes where people sleep. This file describes where people GO — 10,420 venues with real
   categories, and it is dense exactly where Overture is empty.

   Joined by coordinate against the oriented boxes, 1,997 buildings come back carrying at least
   one venue. That is 7.6 per cent of the stock, and it is the 7.6 per cent the product exists to
   show: on Yas the busiest building holds 143 venues of which 130 are dining, which is Yas Mall
   identified without a name lookup or a line of hand-authoring.

   THE BUCKETS ARE COARSE ON PURPOSE. Fifty-three categories is a taxonomy for search, not for
   rendering — nothing downstream can do anything different for a Tiki Bar than for a Wine Bar.
   Six buckets is what a facade can actually express.

   RAW CATEGORY IS WHAT THE FILE STORES, and the bucketing happens here, so the mapping can change
   without re-exporting from Supabase. */
const VENUES_NDJSON = process.env.W2H_VENUES || 'data/venues.ndjson';

const VENUE_BUCKET = (k) => {
  const s = String(k || '').toLowerCase();
  if (/restaurant|cafe|caf\u00e9|bar|lounge|pub|nightclub|bakery|takeaway|dessert|food|shisha|dining|bistro/.test(s)) return 'dine';
  if (/mosque|church|temple/.test(s))                                    return 'worship';
  if (/sport|fitness|stadium|golf|pool|billiards|bowling|skating|karting/.test(s)) return 'sport';
  if (/museum|gallery|performing_arts|landmark|cinema|theatre|library|cultural/.test(s)) return 'culture';
  if (/park|beach|nature|arcade|recreation|theme_park|waterpark|zoo|aquarium|club/.test(s)) return 'leisure';
  return 'other';
};

let VENUES = null;
/* ASYNC, AND THE FS IMPORT IS LOCAL. This file has no top-level `fs` — every consumer does its own
   `await import('node:fs/promises')` inside the function that needs it. A first version used bare
   fs.existsSync and fs.readFileSync and died with "fs is not defined" after Corniche had already
   spent four minutes on Overpass. Missing existence is handled by catching the read rather than by
   a separate stat, which is also how the Overture loader checks for its extract. */
async function venuesLoad(){
  if (VENUES !== null) return VENUES;
  const fs = await import('node:fs/promises');
  let raw;
  try { raw = await fs.readFile(VENUES_NDJSON, 'utf8'); }
  catch {
    process.stderr.write(`  venues: ${VENUES_NDJSON} absent — buildings get no venue attributes\n`);
    return (VENUES = []);
  }
  const out = [];
  for (const line of raw.split('\n')){
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (typeof v.lat === 'number' && typeof v.lon === 'number')
        out.push({ lat:v.lat, lon:v.lon, b:VENUE_BUCKET(v.k) });
    } catch { /* one bad line is not a reason to lose the file */ }
  }
  process.stderr.write(`  venues: ${out.length} loaded from ${VENUES_NDJSON}\n`);
  return (VENUES = out);
}

/* Point in oriented box, gridded. 10,420 points against 20,262 boxes on Corniche is 200 million
   naive tests; a 120 m grid makes it a few hundred thousand. Same argument as roadGrid. */
async function attachVenues(buildings, proj, id){
  const V = await venuesLoad();
  if (!V.length || !buildings.length) return 0;
  const CELL = 120;
  const grid = new Map();
  buildings.forEach((b, i) => {
    const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++){
      const k = (gx + dx) + ',' + (gy + dy);
      let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i);
    }
  });
  const tally = new Map();
  for (const v of V){
    const [px, py] = proj.fwd(v.lat, v.lon);
    const cand = grid.get(Math.floor(px / CELL) + ',' + Math.floor(py / CELL));
    if (!cand) continue;
    for (const i of cand){
      const b = buildings[i];
      const dx = px - b.x, dy = py - b.y;
      const c = Math.cos(-b.rot), sn = Math.sin(-b.rot);
      const u = dx * c - dy * sn, w = dx * sn + dy * c;
      if (Math.abs(u) <= b.w / 2 && Math.abs(w) <= b.d / 2){
        let t = tally.get(i); if (!t) tally.set(i, t = {});
        t[v.b] = (t[v.b] || 0) + 1;
        break;                       /* first containing box wins; boxes do not overlap much */
      }
    }
  }
  let n = 0;
  for (const [i, t] of tally){
    const b = buildings[i];
    let best = null, bn = 0, total = 0;
    for (const k in t){ total += t[k]; if (t[k] > bn){ bn = t[k]; best = k; } }
    b.v = total; b.vk = best; n++;
  }
  const kinds = {};
  for (const [i] of tally){ const k = buildings[i].vk; kinds[k] = (kinds[k] || 0) + 1; }
  process.stderr.write(`  ${id}: venues in ${n} buildings ` +
    Object.entries(kinds).sort((a, c) => c[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(', ') + `\n`);
  return n;
}

function overtureFor(isle){
  if (!OVERTURE || !OVERTURE.rows) return null;
  const [s, w, n, e] = isle.bbox;
  const out = [];
  for (const r of OVERTURE.rows){
    if (r.lat >= s && r.lat <= n && r.lon >= w && r.lon <= e){
      /* Cloned, because one building can legitimately fall in two islands' boxes and the JSON
         writer must not see the same object twice under two extents. The area rides along so the
         per-island threshold can be applied once the display scales are known, which is after
         every outline has been measured — and is stripped again before the file is written. */
      out.push({ ...r.rec, a: Math.round(r.a) });
    }
  }
  return out;
}

/* ---------- THE DISPLAY SCALE, AND WHY THE BAKE HAS TO KNOW IT ------------------------------

   MIN_BUILDING_AREA exists to drop what is too small to see. That is a statement about the
   RENDERED size of a building, and the renderer does not draw these islands at one to one — the
   archipelago is damped, so Al Maryah is drawn 3.94 times oversize and Al Reem 3.04. A 40 m² unit
   on Al Maryah is drawn at the size a 620 m² unit occupies on the Corniche. Filtering both at
   120 m² throws away perfectly visible stock on exactly the islands that look emptiest.

   So the threshold divides by the square of the island's display scale. Corniche stays at 120,
   Al Maryah falls to 8, Al Reem to 13. This is not artistic licence and it is not a density knob:
   it is a filter being made to mean the thing it already claimed to mean.

   DUPLICATED FROM w2h-basemap.js, DELIBERATELY AND WITH A GUARD. The bake cannot import a browser
   module and the alternative is a magic table of five numbers that silently rots the first time
   DAMP_P moves. The formula is four lines; what matters is that both copies read the same extents,
   so the log prints the scales it used and a disagreement with the overlay's `x3.9` is visible in
   one look. */
const DAMP_P = 1 / 3;

function displayScales(extents){
  const span = e => Math.max(e.w, e.d);
  const ids = Object.keys(extents).filter(k => extents[k]);
  if (!ids.length) return {};
  const R = Math.max(...ids.map(k => span(extents[k])));
  const out = {};
  for (const k of ids) out[k] = Math.pow(R / span(extents[k]), 1 - DAMP_P);
  return out;
}

/* The threshold for one island, floored so a very large scale cannot drop below the point where a
   footprint stops being a building and starts being an air-conditioning housing. */
function areaThresholdFor(scale){
  return Math.max(AREA_FLOOR, MIN_BUILDING_AREA / (scale * scale));
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
  way["leisure"~"^(park|garden|nature_reserve|common|pitch|recreation_ground)$"](${b});
  relation["leisure"~"^(park|garden|nature_reserve|common|recreation_ground)$"](${b});
  way["landuse"~"^(grass|recreation_ground|village_green|meadow|forest)$"](${b});
  relation["landuse"~"^(grass|recreation_ground|village_green|meadow|forest)$"](${b});
  way["leisure"="golf_course"](${b});
  relation["leisure"="golf_course"](${b});
  way["highway"="raceway"](${b});
  /* INLAND WATER — canals, marina basins, lagoons — never queried at all until now. Al Raha's
     own canal network (Khor Al Raha and the internal loops through Al Dana, Al Seef, Al Muneera,
     Al Zeina) sits entirely INSIDE the traced outer outline, which only ever said where the whole
     patch's shoreline runs, never where the water cuts back in. Everything inside that outline
     has been treated as plain buildable land because nothing told this query to look for water
     there — the ground painter cannot punch a hole it was never handed. */
  /* BEACHES AND HARD EDGES — the shore's own tags, never queried before. natural=beach is where
     the sand actually is; marina, quay, pier and breakwater are where it certainly is not. The
     renderer draws its beach band only where the first says beach and never where the second
     says wall, so the coast stops being a guess made from the outline alone. */
  way["amenity"="parking"](${b});
  relation["amenity"="parking"](${b});
  way["natural"="beach"](${b});
  relation["natural"="beach"](${b});
  way["leisure"="marina"](${b});
  relation["leisure"="marina"](${b});
  way["man_made"~"^(quay|pier|breakwater)$"](${b});
  way["water"~"^(harbour|marina|dock)$"](${b});
  relation["water"~"^(harbour|marina|dock)$"](${b});
  way["waterway"="dock"](${b});
  relation["waterway"="dock"](${b});
  way["landuse"~"^(port|harbour)$"](${b});
  relation["landuse"~"^(port|harbour)$"](${b});
  way["natural"="water"](${b});
  relation["natural"="water"](${b});
  way["water"~"^(lagoon|basin|canal)$"](${b});
  relation["water"~"^(lagoon|basin|canal)$"](${b});
  way["waterway"="canal"](${b});
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
  if (!outline || outline.length < 1) return buildings;
  const rings = Array.isArray(outline[0][0]) ? outline : [outline];   // one landmass or several
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of rings.flat()){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const out = [];
  for (const b of buildings){
    /* The cheap rejection first. Most of what Corniche's box drags in is nowhere near Corniche's
       coast, and a bounding-box test settles those without touching two thousand segments. */
    if (b.x < x0 - margin || b.x > x1 + margin || b.y < y0 - margin || b.y > y1 + margin) continue;
    if (rings.some(r => contains(r, [b.x, b.y]) || nearRing(r, b.x, b.y, margin))) out.push(b);
  }
  return out;
}

/* WATER GETS ITS OWN CLIP, NOT clipToOutline ABOVE — that function tests a single point per
   building; a water body is the shape itself, and a naive point test on one polygon's centroid
   would happily pass something the size of the open Gulf if its centroid landed anywhere near
   Raha. Confirmed this actually happens: the first live water query returned a 13.5 km polygon
   alongside sixteen genuinely small ones, and by centroid alone the huge one would have looked
   exactly as valid as the small ones did.

   Two independent tests, either one enough to keep a candidate: does any of its own vertices
   fall inside the outline, or does the outline's own centre fall inside the candidate (the case
   where a small island sits entirely within a larger lagoon, which a vertex-only test would
   miss). Real overlap, checked geometrically, not assumed from proximity.

   THE SPAN CAP IS THE SECOND, SEPARATE GUARD. A feature can genuinely overlap an island's outline
   at one edge while still being, in truth, something else entirely — the same 13.5 km polygon
   very likely clips through Raha's own bbox somewhere along its edge. maxSpan rejects anything
   whose own bounding box is more than three times the outline's, which a real internal canal
   never approaches — Khor Al Raha's own traced outline is itself only 4.7 km at its longest, so a
   feature meant to sit inside that has no legitimate reason to span 15+. */
function clipWaterToOutline(water, outline, maxSpanRatio = 3){
  if (!outline || outline.length < 1) return water;
  const rings = Array.isArray(outline[0][0]) ? outline : [outline];
  let ox0=Infinity, ox1=-Infinity, oy0=Infinity, oy1=-Infinity;
  for (const [x,y] of rings.flat()){
    if (x<ox0) ox0=x; if (x>ox1) ox1=x; if (y<oy0) oy0=y; if (y>oy1) oy1=y;
  }
  const outlineSpan = Math.max(ox1-ox0, oy1-oy0);
  const centre = [(ox0+ox1)/2, (oy0+oy1)/2];
  const out = [];
  for (const ring of water){
    if (!ring || ring.length < 3) continue;
    let wx0=Infinity, wx1=-Infinity, wy0=Infinity, wy1=-Infinity;
    for (const [x,y] of ring){
      if (x<wx0) wx0=x; if (x>wx1) wx1=x; if (y<wy0) wy0=y; if (y>wy1) wy1=y;
    }
    const waterSpan = Math.max(wx1-wx0, wy1-wy0);
    if (waterSpan > outlineSpan * maxSpanRatio) continue;   // the sea-polygon guard
    const overlaps = ring.some(p => rings.some(r => contains(r, p))) || contains(ring, centre);
    if (overlaps) out.push(ring);
  }
  return out;
}

/* A waterway MAPPED AS A LINE, NOT AN AREA — which is how OSM usually carries a canal: one
   centreline way, no enclosed polygon either side of it. The ring-based parsing everything else
   in this file uses would take that line's own points and treat first-to-last as if they closed
   a shape, which encloses no real area at all — a canal traced this way would bake as an
   invisible sliver, not the substantial waterway every reference photo shows.

   WIDTH IS AN ESTIMATE, FLAGGED AS ONE. No source gives Khor Al Raha's own channel width; 120 m
   is a plausible reading against the reference photos' own proportions, not a measurement. Offset
   left and right of the centreline by half that, per segment, and close the two offset chains
   into one ring — the standard flat-buffer construction, with no attempt at mitring sharp turns
   cleanly, which is a fair trade for a channel this gently curved. */
function bufferLineToRing(pts, width){
  if (!pts || pts.length < 2) return null;
  const half = width / 2;
  const left = [], right = [];
  for (let i = 0; i < pts.length; i++){
    const a = pts[Math.max(0, i-1)], b = pts[Math.min(pts.length-1, i+1)];
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy/len, ny = dx/len;   // unit normal
    left.push([pts[i][0] + nx*half, pts[i][1] + ny*half]);
    right.push([pts[i][0] - nx*half, pts[i][1] - ny*half]);
  }
  return left.concat(right.reverse());
}

/* ---------- LAND FROM A COASTLINE, INSIDE A DRAWN BOUNDARY -------------------------------------

   A MAINLAND PATCH HAS NO RING OF ITS OWN, but it does have a coast. OSM's natural=coastline is one
   continuous, consistently directed line around every sea in the world — land on the LEFT, water
   on the right — and it runs into every canal and around every reclaimed island exactly as
   surveyed. Al Raha Beach was never an island to pick out of it; it is a stretch of that line, and
   the land it bounds is whatever lies to the left of it within the area we choose to show.

   So the traced shape is no longer the land. It is the BOUNDARY of what to show: its inland edges
   (along the E10, the west cut at Aldar HQ, the east cut) are where the district stops, and its
   seaward edge is drawn generously out in the water on purpose, because the coastline itself
   decides where the water starts. Land = clip polygon ∩ left-of-coastline. Everything the hand
   trace of the canal and its eight islands was trying to reproduce falls out of that one
   intersection, from the survey rather than from a screenshot.

   HOW. Every stitched coastline chain is cut where it crosses the clip polygon into RUNS that lie
   inside, each remembering the perimeter position where it entered and where it left. Rings that
   sit wholly inside are islands (counter-clockwise, land on the left is inside) or lagoons
   (clockwise). Then the runs are sewn: leave a run at its exit, walk the clip's perimeter
   COUNTER-CLOCKWISE — the direction that keeps the polygon's own interior on the left, which is
   also the side the coast keeps its land — until the next run's entry, follow that run, and so
   on until the loop closes. Each loop is one landmass. A perimeter stretch between an entry and
   the next exit is never walked: that is where the clip boundary crosses open water.

   The clip polygon is forced counter-clockwise first, since the trace was drawn by hand and its
   winding is whatever geojson.io happened to record. Segment/edge intersections are found for
   every coastline segment against every clip edge, split in order, and each piece classified by
   its midpoint, so a concave clip and a segment that leaves and re-enters both come out right. */
function signedArea(ring){
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  return a / 2;
}

function landFromCoast(clipIn, chains, log = () => {}){
  if (!clipIn || clipIn.length < 3) return { rings: [], water: [], why: 'no clip polygon' };
  let clip = clipIn.slice();
  if (Math.hypot(clip[0][0] - clip[clip.length-1][0], clip[0][1] - clip[clip.length-1][1]) < 0.01) clip.pop();
  if (signedArea(clip) < 0) clip.reverse();
  const n = clip.length;
  const cum = [0];
  for (let i = 0; i < n; i++){
    const a = clip[i], b = clip[(i + 1) % n];
    cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const per = cum[n];
  const inside = p => contains(clip, p);

  /* every crossing of segment a->b with the clip's edges: t along the segment, param along the
     perimeter */
  const crossings = (a, b) => {
    const out = [];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    for (let e = 0; e < n; e++){
      const c = clip[e], d = clip[(e + 1) % n];
      const ex = d[0] - c[0], ey = d[1] - c[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / den;
      const s = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / den;
      if (t < 0 || t > 1 || s < 0 || s > 1) continue;
      out.push({ t, param: cum[e] + s * (cum[e + 1] - cum[e]), pt: [a[0] + dx * t, a[1] + dy * t] });
    }
    return out.sort((p, q) => p.t - q.t);
  };

  const islands = [], lagoons = [], runs = [];
  let dangling = 0;
  for (const chRaw of chains){
    if (chRaw.length < 2) continue;
    const ch = chRaw.slice();
    const closed = ch.length > 3 &&
      Math.hypot(ch[0][0] - ch[ch.length-1][0], ch[0][1] - ch[ch.length-1][1]) < 60;
    if (closed && Math.hypot(ch[0][0] - ch[ch.length-1][0], ch[0][1] - ch[ch.length-1][1]) > 0.01) ch.push(ch[0]);
    const chainRuns = [];
    let cur = null;                       // { pts, entry, exit } — entry/exit are perimeter params
    const open  = (pt, param) => { cur = { pts: [pt], entry: param, exit: null }; };
    const close = param => { cur.exit = param; chainRuns.push(cur); cur = null; };
    const piece = (p0, p1, param0) => {
      if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1e-6) return;
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
      if (inside(mid)){ if (!cur) open(p0, param0); cur.pts.push(p1); }
      else if (cur) close(param0);
    };
    for (let i = 0; i < ch.length - 1; i++){
      const a = ch[i], b = ch[i + 1];
      let from = a, fromParam = null, lastT = -1;
      for (const x of crossings(a, b)){
        if (x.t - lastT < 1e-9) continue;
        piece(from, x.pt, fromParam);
        from = x.pt; fromParam = x.param; lastT = x.t;
      }
      piece(from, b, fromParam);
    }
    if (cur){ cur.exit = null; chainRuns.push(cur); cur = null; }

    if (closed){
      const whole = chainRuns.length === 1 && chainRuns[0].entry === null && chainRuns[0].exit === null;
      if (whole){
        const ring = ch.slice(0, -1);
        (signedArea(ring) > 0 ? islands : lagoons).push(ring);
        continue;
      }
      if (!chainRuns.length) continue;   // wholly outside
      /* a ring with crossings: the run that begins at vertex 0 and the run that ends at the last
         vertex are one run, wrapped */
      if (chainRuns.length >= 2 && chainRuns[0].entry === null && chainRuns[chainRuns.length-1].exit === null){
        const last = chainRuns.pop(), first = chainRuns.shift();
        chainRuns.push({ pts: last.pts.concat(first.pts.slice(1)), entry: last.entry, exit: first.exit });
      }
    }
    for (const r of chainRuns){
      if (r.entry === null || r.exit === null){ dangling++; continue; }
      if (r.pts.length >= 2) runs.push(r);
    }
  }

  if (!runs.length){
    return { rings: islands, water: lagoons, why: `no coastline crosses the boundary (${islands.length} island ring(s) inside)` , dangling };
  }

  /* sew: exit -> counter-clockwise along the perimeter -> next entry */
  const byEntry = runs.slice().sort((a, b) => a.entry - b.entry);
  const nextEntryAfter = p => byEntry.find(r => r.entry > p) || byEntry[0];
  const verticesBetween = (p0, p1) => {
    const out = [];
    if (p1 > p0){ for (let i = 0; i < n; i++) if (cum[i] > p0 && cum[i] < p1) out.push(clip[i]); }
    else { for (let i = 0; i < n; i++) if (cum[i] > p0) out.push(clip[i]); for (let i = 0; i < n; i++) if (cum[i] < p1) out.push(clip[i]); }
    return out;
  };
  const rings = [];
  const visited = new Set();
  for (const start of runs){
    if (visited.has(start)) continue;
    const ring = [];
    let cur = start, guard = 0;
    while (cur && !visited.has(cur) && guard++ < runs.length + 2){
      visited.add(cur);
      ring.push(...cur.pts);
      const nxt = nextEntryAfter(cur.exit);
      ring.push(...verticesBetween(cur.exit, nxt.entry));
      cur = nxt;
    }
    if (ring.length >= 3) rings.push(ring);
  }
  const wrong = rings.filter(r => signedArea(r) < 0).length;
  log(`land rings ${rings.length} (${wrong} clockwise — expected 0), islands inside ${islands.length}, ` +
      `lagoons ${lagoons.length}, runs ${runs.length}, dangling ${dangling}`);
  return { rings: rings.concat(islands), water: lagoons, why: `${runs.length} coast run(s) sewn to the boundary`, dangling, wrong };
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

/* ---------- PATH STITCHING -------------------------------------------------------------------

   REBUILDS CONTINUOUS FACILITIES OUT OF THE FRAGMENTS OSM STORES. Ways are joined end to end
   where they share an endpoint and carry the same kind.

   THE CONTINUATION IS CHOSEN BY BEARING, not by whichever fragment happens to come first in the
   array, and that matters at every junction where three or more ways meet. A greedy first-match
   walk will happily turn a seafront promenade up a side path and leave the seafront itself as two
   short stubs that both fail the 500 m test. Comparing the incoming heading against each
   candidate's outgoing heading and taking the straightest keeps the through-route together, which
   is the one the threshold is meant to protect.

   TOLERANCE IS A TENTH OF A UNIT because that is the precision the projected coordinates are
   rounded to downstream; an exact float compare would miss joins that are the same OSM node. */
function pathLength(pts){
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i-1][0], pts[i][1] - pts[i-1][1]);
  return s;
}
function ringArea(pts){
  let s = 0;
  for (let i = 0; i < pts.length; i++){
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}
function headingOut(pts){  // bearing leaving the first point
  return Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
}
function stitchPaths(ways){
  const K = p => `${Math.round(p[0]*10)},${Math.round(p[1]*10)}`;
  const ends = new Map();
  const push = (k, i) => { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); };
  ways.forEach((w, i) => { push(K(w[0]), i); push(K(w[w.length-1]), i); });

  const used = new Array(ways.length).fill(false);
  const out = [];
  for (let i = 0; i < ways.length; i++){
    if (used[i]) continue;
    used[i] = true;
    let chain = ways[i].slice();
    /* Grow from the tail, then reverse and grow from what was the head, so a fragment picked up
       in the middle of a route still recovers the whole of it in both directions. */
    for (let pass = 0; pass < 2; pass++){
      for (;;){
        const tail = chain[chain.length - 1];
        const inH  = Math.atan2(tail[1] - chain[chain.length-2][1], tail[0] - chain[chain.length-2][0]);
        let best = -1, bestTurn = Infinity, bestRev = false;
        for (const j of (ends.get(K(tail)) || [])){
          if (used[j]) continue;
          const w = ways[j];
          const fwd = K(w[0]) === K(tail);
          const rev = K(w[w.length-1]) === K(tail);
          if (!fwd && !rev) continue;
          const cand = fwd ? w : w.slice().reverse();
          if (cand.length < 2) continue;
          let turn = Math.abs(headingOut(cand) - inH);
          while (turn > Math.PI) turn = Math.abs(turn - 2 * Math.PI);
          if (turn < bestTurn){ bestTurn = turn; best = j; bestRev = rev && !fwd; }
        }
        if (best < 0) break;
        const w = bestRev ? ways[best].slice().reverse() : ways[best];
        used[best] = true;
        chain = chain.concat(w.slice(1));
      }
      chain.reverse();
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
  const coastWays = [], roads = [], osmBuildings = [], parks = [], golf = [], raceway = [];
  /* Raw, unstitched, keyed by kind. Stitching needs the whole island's fragments in hand, so it
     cannot happen inside the element loop — these fill here and are resolved after it. */
  const rawPaths = { cycle: [], foot: [] };
  const plazas = [];
  const beaches = [], hardEdge = [];      // shore tags, see the query
  const parking = [];                      // amenity=parking surface lots, see the query
  /* let, not const — clipWaterToOutline reassigns this below, the same way `buildings` (further
     down) gets reassigned by clipToOutline rather than filtered in place. */
  let water = [];
  for (const el of els){
    const t = el.tags || {};
    if (!el.geometry && !el.members) continue;

    if (t.natural === 'coastline' && el.geometry){ coastWays.push(toXY(el.geometry)); continue; }

    /* RACEWAY IS TESTED BEFORE THE ROAD BRANCH, and it has to be. `highway=raceway` is not in
       ROAD_CLASS, so the road branch would `continue` past it and the circuit would silently not
       exist - which is exactly what it did: a search near the Yas Marina Circuit anchor returned
       29 km of ordinary local streets and nothing that could be told apart from them. */
    if (t.highway === 'raceway' && el.geometry){
      const pts = simplify(toXY(el.geometry), SIMPLIFY_M);
      if (pts.length >= 2) raceway.push({ pts: pts.map(rd2),
                                          name: t.name || null,
                                          pit: t.raceway === 'pitlane' ? 1 : 0 });
      continue;
    }

    /* GOLF BEFORE PARKS, for the mirror-image reason. `leisure=golf_course` is not `park`, and a
       course that also carries a landuse tag would otherwise be filed as a lawn and lose the fact
       that it is a course. Relations are multipolygons; outer ring only, as with buildings. */
    if (t.leisure === 'golf_course'){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 4){
        const ring = toXY(geom);
        if (area(ring) > 20000) golf.push(simplify(ring, SIMPLIFY_M * 2).map(rd1));
      }
      continue;
    }

    /* CANAL AS A LINE, CHECKED FIRST AND SEPARATELY — waterway=canal is how OSM usually maps one
       of these, a single centreline way with no enclosed area either side. Treating it through
       the ring branch below (which the first version of this did) would take the line's own
       points and implicitly close first-to-last into a shape enclosing no real area — an
       invisible sliver, not the channel every reference photo shows. Buffered to a real ring
       instead; see bufferLineToRing for the width and why it is an estimate. Relations do not
       apply here — a waterway is a single way, never a multipolygon. */
    if (t.waterway === 'canal' && el.geometry){
      const pts = toXY(el.geometry);
      const ring = bufferLineToRing(pts, WATERWAY_WIDTH_M);
      if (ring) water.push(simplify(ring, SIMPLIFY_M).map(rd1));
      continue;
    }

    /* WATER BEFORE PARKS TOO, and checked first among the tag types this element could carry —
       `natural=water` and `landuse=grass` are not mutually exclusive in how OSM contributors tag
       things, and a lagoon mistakenly also carrying a landuse tag must not be filed as a lawn.
       No area floor the way golf has one: a real internal canal can be narrow, and a floor tuned
       for a golf course would silently drop every one of them. Relations are multipolygons;
       outer ring only, as with buildings and parks. */
    /* SHORE TAGS, BEFORE WATER: a marina basin is often also natural=water, and it has to land
       in hardEdge as well as in water — so it is filed here first and NOT continued past, except
       for beach, which is exclusive. Line-mapped piers and quays are buffered to a thin ring the
       same way a canal centreline is; area-mapped ones come through as rings directly. */
    /* CAR PARKS, SURFACE ONLY. amenity=parking that is a building (multi-storey, underground,
       rooftop) falls through to the building branch as the structure it is; an open lot becomes
       a ring the painter lays bays on and the props fill with parked cars. 600 m² floor: a
       dozen spaces or fewer is under a pixel of paving at district range. */
    if (t.amenity === 'parking' && !t.building && !/underground|multi-storey|rooftop|garage_boxes/.test(t.parking || '')){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 4){
        const ring = toXY(geom);
        if (area(ring) >= 600) parking.push(simplify(ring, SIMPLIFY_M).map(rd1));
      }
      continue;
    }
    if (t.natural === 'beach'){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 3) beaches.push(simplify(toXY(geom), SIMPLIFY_M).map(rd1));
      continue;
    }
    /* v261: harbours and docks too — a boat basin is a wall on every side, whatever it is tagged. */
    if (t.leisure === 'marina' || /^(quay|pier|breakwater)$/.test(t.man_made || '') ||
        /^(harbour|marina|dock)$/.test(t.water || '') || t.waterway === 'dock' || /^(port|harbour)$/.test(t.landuse || '')){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 2){
        const pts = toXY(geom);
        const closed = pts.length >= 4 && Math.hypot(pts[0][0]-pts[pts.length-1][0], pts[0][1]-pts[pts.length-1][1]) < 1.0;
        const ring = closed ? pts : bufferLineToRing(pts, 30);
        if (ring) hardEdge.push(simplify(ring, SIMPLIFY_M).map(rd1));
      }
      if (!(t.natural === 'water' || t.water)) continue;
    }
    if (t.natural === 'water' || t.water){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 3){
        const ring = toXY(geom);
        water.push(simplify(ring, SIMPLIFY_M).map(rd1));
      }
      continue;
    }

    if (t.highway && el.geometry){
      /* TESTED BEFORE THE ROAD BRANCH, the same way raceway is, and for the same reason: these
         tags are not in ROAD_CLASS, so without this the `continue` below silently discards them
         and always has. */
      const pk = PATH_CLASS[t.highway];
      if (pk){
        const pts = simplify(toXY(el.geometry), SIMPLIFY_M);
        if (pts.length >= 2){
          const closed = pts.length >= 4 &&
                         Math.hypot(pts[0][0] - pts[pts.length-1][0],
                                    pts[0][1] - pts[pts.length-1][1]) < 1.0;
          /* A pedestrian way that closes on itself is a square; one that does not is a shopping
             street, and a street belongs with the lines rather than in the area layer. */
          if (pk === 'plaza' && closed) plazas.push(pts.slice(0, -1).map(rd2));
          else if (pk === 'plaza')      rawPaths.foot.push(pts);
          else                          rawPaths[pk].push(pts);
        }
        continue;
      }
      const cls = ROAD_CLASS[t.highway];
      if (!cls) continue;
      const pts = simplify(toXY(el.geometry), SIMPLIFY_M);
      if (pts.length >= 2) roads.push({ cls, pts: pts.map(rd2), oneway: t.oneway === 'yes' ? 1 : 0,
                                        lanes: parseInt(t.lanes) || null });
      continue;
    }

    /* PARKS NOW ACCEPT RELATIONS, AND THAT WAS THE BUG. The query asked only for ways and this
       branch additionally gated on `el.geometry`, which a relation does not carry - so every park
       mapped as a multipolygon was dropped twice over. On Yas that left 29 hectares as the largest
       green area on an island that plainly has far bigger ones. Outer ring only, as with buildings.

       GREEN THINGS ONLY. `natural=sand` and `natural=scrub` would add most of the island's dune
       ground and the painter would lay lawn over all of it - the lawn-flood failure mode. Sand is
       the ground's default and does not need a polygon to say so. */
    if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'nature_reserve' ||
        t.leisure === 'common' || t.leisure === 'pitch' || t.leisure === 'recreation_ground' ||
        t.landuse){
      const geom = el.geometry ||
        (el.members || []).filter(m => m.role === 'outer' && m.geometry).flatMap(m => m.geometry);
      if (geom && geom.length >= 4){
        const ring = toXY(geom);
        /* THE TAG IS RECORDED, AND IT HAS TO BE. Widening this branch to relations took Corniche
           from 29 ha of green to 3,380 - a third of the island - because `landuse=grass` and
           `landuse=forest` are draped over desert scrub here in blankets up to 986 ha. A renderer
           handed a bare list of rings cannot tell a city park from one of those, and greening all
           of it is precisely the lawn-flood failure the ?vac counters exist to catch.

           So each ring now carries its kind and its area, and the consumer decides. Shape change
           from ring to { k, a, r }: nothing consumed parks before this - parksUnits was exported
           and never called - so there is no reader to break. */
        const a = area(ring);
        if (a > 800) parks.push({
          k: t.leisure || t.landuse || 'park',
          a: Math.round(a),
          r: simplify(ring, SIMPLIFY_M * 2).map(rd1),
        });
      }
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
      if (a < AREA_FLOOR) continue;
      const b = obb(ring);
      if (!b) continue;
      osmBuildings.push({
        a: Math.round(a),
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

  /* MAINLAND PATCHES HAVE NO CLOSED COASTLINE RING, BECAUSE THEY ARE NOT ISLANDS — and until now
     that meant `extent: null` and a renderer with nothing to paint. The Grand Mosque precinct hit
     this exact wall and was solved by hand-tracing a site polygon outside this pipeline entirely,
     which works for one precinct's worth of ground but does not scale, and does not pull real
     roads or real Overture buildings the way every island here does.

     `noCoastline: true` NOW SKIPS pickIsland OUTRIGHT, rather than only falling back when it
     found nothing — which is what the comment here always claimed and the code never actually
     did. The first version ran pickIsland unconditionally and only checked afterward whether its
     result was empty, so a REAL coastline ring anywhere near the centre point — a decorative
     lagoon, a marina basin, any small closed loop OSM happens to tag as coastline — would win
     outright, and the traced canal shape would never even be consulted. Confirmed on Raha's
     first bake: pickIsland found a real 34-point ring 1.7 x 0.7 km near the centre point, used
     it, and the traced 4.7 km canal strip in outlineLL was silently discarded. Right shape,
     wrong reason it was ignored — "outline.length" is not the same test as "this is an island".

     TWO PATHS NOW, CHECKED BEFORE pickIsland RUNS AT ALL — a traced shape if the island carries
     `outlineLL` (points in [lon, lat], the order geojson.io exports), or the fetch bbox itself as
     a plain rectangle if it does not. Everything downstream — the coastline pre-clip, the extent
     computation, the renderer's ground shape — reads `outline` the same way regardless of which
     path produced it, so nothing else in this file needs to know the difference. */
  let outline, pickedWhy;
  /* THE TRACED SHAPE IS THE BOUNDARY, THE COASTLINE IS THE SHORE — see landFromCoast. For a
     mainland patch the trace (or the fetch box) says how much of the mainland to show, and OSM's
     own coastline, cut to that boundary, says where the land ends: shore, canals and every
     reclaimed island, from the survey. The trace stays what it always was — the frame. The
     island's extent is measured from it rather than from the land that comes out, so cx/cy and
     the half-span do not move under the hand-placed coordinates (LM_RAHA, KIT_ZONES) that were
     read off in that frame.

     Falls back to the plain trace when no coastline crosses it — an area OSM has not surveyed
     — or when the sewing comes out with a clockwise land ring, which means a chain arrived
     against the land-on-the-left convention and the result cannot be trusted. Both are logged. */
  let clipPoly = null, coastClipped = false;
  if (isle.noCoastline){
    if (isle.outlineLL && isle.outlineLL.length){
      clipPoly = isle.outlineLL.map(([lo, la]) => proj.fwd(la, lo));
    } else {
      const [s, w, n, e] = isle.bbox;
      clipPoly = [[s,w],[s,e],[n,e],[n,w]].map(([la,lo]) => proj.fwd(la, lo));
    }
    const chains = stitch(coastWays);
    const land = landFromCoast(clipPoly, chains, m => process.stderr.write(`  ${isle.id}: coast clip — ${m}\n`));
    const MIN_LAND_M2 = 5000;
    const rings = land.rings
      .map(r => simplify(r, SIMPLIFY_M * 3).map(rd1))
      .filter(r => r.length >= 4 && area(r) >= MIN_LAND_M2)
      .sort((a, b) => area(b) - area(a));
    if (rings.length && !land.wrong){
      outline = rings.length > 1 ? rings : rings[0];
      coastClipped = true;
      for (const lg of land.water) water.push(simplify(lg, SIMPLIFY_M).map(rd1));
      pickedWhy = `${chains.length} coast chains, ${land.why}: ${rings.length} landmass(es) inside the traced boundary ` +
        `(${land.rings.length - rings.length} sliver(s) under ${MIN_LAND_M2} m² dropped, ${land.water.length} lagoon(s) to water)`;
    } else {
      outline = clipPoly.map(rd1);
      pickedWhy = `traced shape as drawn (${outline.length} pts) — ${land.why}` +
        (land.wrong ? `; ${land.wrong} land ring(s) came out clockwise, clip result discarded` : '');
    }
  } else {
    const chains = stitch(coastWays);
    const picked = pickIsland(chains, proj.fwd(isle.centre[0], isle.centre[1]));
    outline = picked.ring.length ? simplify(picked.ring, SIMPLIFY_M * 3).map(rd1) : [];
    pickedWhy = `${chains.length} coast chains, took the ${picked.why}`;
  }
  process.stderr.write(`  ${isle.id}: ${pickedWhy}\n`);
  /* One ring or several: outline is a flat ring for five islands and a list of rings for a
     landmass the coastline splits. Everything below that measures or clips works on the list. */
  const outlineRings = !outline.length ? [] : Array.isArray(outline[0][0]) ? outline : [outline];
  const outlinePts = outlineRings.reduce((n, r) => n + r.length, 0);

  /* The first moment the coastline exists, which is the first moment a building can be told it is
     not on this island. Reported rather than silent: the number dropped here is the overlap
     between the fetch boxes, and if it ever comes out near zero on Corniche the boxes have moved. */
  if (outlineRings.length){
    const before = buildings.length;
    /* Kept on the island object, not just logged. This is the number the probe's `Overture` column
       measures and the number the renderer's fp row calls `raw`, and having all three name the same
       quantity is what makes them checkable against each other. */
    isle._inBox = before;
    buildings = clipToOutline(buildings, outline, CLIP_MARGIN_M);
    process.stderr.write(`  ${isle.id}: coast pre-clip ${before} -> ${buildings.length} ` +
      `(dropped ${before - buildings.length} beyond ${CLIP_MARGIN_M} m of the shore)\n`);
    const waterBefore = water.length;
    water = clipWaterToOutline(water, outline);
    process.stderr.write(`  ${isle.id}: water pre-clip ${waterBefore} -> ${water.length} ` +
      `(dropped ${waterBefore - water.length} with no real overlap or an implausible span)\n`);
  }

  /* THE ISLAND'S TRUE EXTENT, measured from the outline rather than from the bounding box that
     fetched it. The consumer needs this to set its own radius from the data instead of from a
     literal — which is the whole reason the drawn islands were a third of true size and nobody
     noticed for seventy versions. */
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of (clipPoly || outlineRings.flat())){
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const extent = outlineRings.length
    ? { x0:rd1(x0), y0:rd1(y0), x1:rd1(x1), y1:rd1(y1),
        w:rd1(x1 - x0), d:rd1(y1 - y0),
        cx:rd1((x0 + x1) / 2), cy:rd1((y0 + y1) / 2) }
    : null;

  process.stderr.write(`  ${isle.id}: outline ${outlinePts}pt in ${outlineRings.length} ring(s), roads ${roads.length}, ` +
                       `buildings ${buildings.length} (${buildings.filter(b => b.h).length} with height), ` +
                       `parks ${parks.length} (max ${Math.round(Math.max(0, ...parks.map(p => p.a))/1e4)}ha), ` +
                       `golf ${golf.length}, raceway ${raceway.length}, water ${water.length}` +
                       (extent ? `, extent ${(extent.w/1000).toFixed(2)} x ${(extent.d/1000).toFixed(2)} km` : '') +
                       `\n`);

  /* inBox rides on the returned object rather than on the island definition, so a re-bake of the
     same island in one process cannot read a stale value from the previous pass. It is consumed by
     the index writer and never written into an island file. */
  /* AFTER the coastline clip and the area filter, so the join runs against exactly the buildings
     that ship rather than against everything the box returned. */
  await attachVenues(buildings, proj, isle.id);

  /* NO HAND-TRACED WATER ANY MORE. data/water-raha.json — one canal body and eight islands
     traced off satellite imagery — existed because the coastline was never consulted for a
     mainland patch. landFromCoast now takes the canal and the islands from the survey, so the
     trace and its merge are gone rather than left as a fallback that would paint a second,
     hand-drawn canal across surveyed ground the day the two disagreed. waterIslands stays in the
     artefact, empty, so nothing downstream has to learn a new shape. */
  const finalWater = water;
  const waterIslands = [];
  /* A SEPARATE, EXPLICIT LINE, not folded into the summary above — that line runs before this
     merge even happens (it is built from the pre-merge `water`, not finalWater), so it could
     never have reflected hand-traced data landing even if the wording implied it. Whoever reads
     this log to confirm a bake actually worked deserves the real final count, not the earlier
     one. */
  process.stderr.write(`  ${isle.id}: water final — ${finalWater.length} body(ies), ` +
    `${waterIslands.length} island(s)\n`);

  /* ---- paths: stitch, then threshold, then report ----
     THE REPORT IS NOT DECORATION. The 500 m figure was chosen from the road length distribution
     rather than from a count of the paths themselves, because Overpass is not reachable from the
     environment this was written in. These four numbers per island are the missing measurement,
     and they are printed loudly enough to read out of the Action log so the threshold can be
     moved on evidence rather than on the guess it currently rests on. */
  const paths = [];
  for (const kind of ['cycle', 'foot']){
    const raw = rawPaths[kind];
    if (!raw.length){
      process.stderr.write(`  ${isle.id}: paths ${kind} — none in box\n`);
      continue;
    }
    const chains = stitchPaths(raw);
    const lens = chains.map(pathLength).sort((a, b) => a - b);
    const kept = chains.filter(c => pathLength(c) >= MIN_PATH_M);
    for (const c of kept) paths.push({ kind, pts: c.map(rd2) });
    const rawOver = raw.filter(w => pathLength(w) >= MIN_PATH_M).length;
    process.stderr.write(
      `  ${isle.id}: paths ${kind} — ${raw.length} ways (${rawOver} over ${MIN_PATH_M} m raw) ` +
      `-> ${chains.length} chains, median ${Math.round(lens[lens.length >> 1] || 0)} m, ` +
      `longest ${Math.round(lens[lens.length - 1] || 0)} m, kept ${kept.length}\n`);
  }
  const plazasKept = plazas.filter(r => r.length >= 3 && ringArea(r) >= MIN_PLAZA_M2);
  process.stderr.write(`  ${isle.id}: plazas — ${plazas.length} closed pedestrian ways, ` +
                       `kept ${plazasKept.length} over ${MIN_PLAZA_M2} m2\n`);

  /* NO MACHINE-DERIVED FOOTPRINTS ON A GOLF COURSE. Overture's ML fill reads bunkers, tee boxes
     and maintenance sheds as buildings: Yas Links carried 43 of them and Saadiyat Beach 13, not
     one with an OSM id. A surveyed clubhouse keeps its id and stays. */
  {
    const before = buildings.length;
    buildings = buildings.filter(bd => bd.osm || !golf.some(g => contains(g, [bd.x, bd.y])));
    if (before !== buildings.length)
      process.stderr.write(`  ${isle.id}: dropped ${before - buildings.length} machine-derived footprint(s) on golf courses\n`);
  }
  return { id:isle.id, name:isle.name, extent, landmarks:marks, outline, roads, buildings, parks,
           paths, plazas:plazasKept,
           golf, raceway, water:finalWater, waterIslands,
           beaches, hardEdge, parking,
           inBox: isle._inBox != null ? isle._inBox : buildings.length };
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
  const extents = {};
  try {
    const fs = await import('node:fs/promises');
    const idx = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
    for (const i of idx.islands || []){
      prev[i.id] = i.counts || {};
      if (i.extent) extents[i.id] = i.extent;
    }
  } catch { /* first run, or a fresh checkout — the comparison columns stay blank */ }
  const scales = displayScales(extents);

  /* THE FILTER HAS TO BE THE BAKE'S FILTER, and this table did not have it for one run.

     overtureFor stopped applying a threshold when the threshold became per-island — it cannot know
     one until every outline is measured — so this counted everything above the 20 m² floor and
     reported Corniche at 1.74x when the bake would produce 1.00x. A probe exists to predict the
     artefact. One that predicts something else is worse than none, because it is believed. */
  const kept = isle => {
    const thr = areaThresholdFor(scales[isle.id] || 1);
    return (overtureFor(isle) || []).filter(b => b.a == null || b.a >= thr);
  };

  process.stderr.write(`\n${'island'.padEnd(10)}${'scale'.padStart(7)}${'thresh'.padStart(9)}` +
                       `${'OSM now'.padStart(10)}${'Overture'.padStart(10)}` +
                       `${'change'.padStart(9)}${'with height'.padStart(14)}\n`);
  for (const isle of ISLANDS){
    const got = kept(isle);
    /* inBox where the index has it, because this column counts the fetch box and so does inBox.
       An older index only has the post-nothing `buildings`, which happened to mean the same thing
       then — so the fallback is right for old indexes and inBox is right for new ones. */
    const p = prev[isle.id];
    const was = p ? (p.inBox != null ? p.inBox : p.buildings) : null;
    const h = got.filter(b => b.h != null).length;
    const sc = scales[isle.id] || 1;
    const chg = was ? (got.length / was).toFixed(2) + 'x' : '—';
    process.stderr.write(`${isle.id.padEnd(10)}${('x' + sc.toFixed(2)).padStart(7)}` +
      `${(Math.round(areaThresholdFor(sc)) + 'm²').padStart(9)}` +
      `${String(was == null ? '—' : was).padStart(10)}` +
      `${String(got.length).padStart(10)}${chg.padStart(9)}` +
      `${(h + ' (' + Math.round(100 * h / Math.max(got.length, 1)) + '%)').padStart(14)}\n`);
  }
  process.stderr.write(`\nPre-coastline. The bake clips each island to its own shore afterwards.\n`);
  process.stderr.write(`Probe only — nothing written, nothing committed.\n`);

  /* ---------- WHAT THE AREA THRESHOLD IS COSTING, PER ISLAND ----------

     One scan, every threshold. The extract is already in memory with each building's area on it,
     so the question "what would 60 m² buy on Yas" is a filter rather than another twenty minutes
     of S3. Bands rather than a single number, because the answer that matters is not how many are
     below 120 but WHERE they are: 30,000 sheds behind Corniche's villas and 30,000 houses on
     Saadiyat are the same count and completely different decisions. */
  const BANDS = [20, 40, 60, 80, 120, 200, 400];
  process.stderr.write(`\nBuildings by footprint area, per island — the column at ` +
    `${MIN_BUILDING_AREA} m² and above is what the bake would keep.\n\n`);
  process.stderr.write(`${'island'.padEnd(10)}` +
    BANDS.map((b, i) => (i === BANDS.length - 1 ? `${b}+` : `${b}-${BANDS[i+1]}`).padStart(10)).join('') +
    `${'>=' + MIN_BUILDING_AREA}`.padStart(11) + `\n`);
  for (const isle of ISLANDS){
    const [s, w, n, e] = isle.bbox;
    const mine = OVERTURE.rows.filter(r => r.lat >= s && r.lat <= n && r.lon >= w && r.lon <= e);
    const cells = BANDS.map((b, i) => {
      const hi = i === BANDS.length - 1 ? Infinity : BANDS[i+1];
      return String(mine.filter(r => r.a >= b && r.a < hi).length).padStart(10);
    }).join('');
    const keep = mine.filter(r => r.a >= MIN_BUILDING_AREA).length;
    process.stderr.write(`${isle.id.padEnd(10)}${cells}${String(keep).padStart(11)}\n`);
  }
  process.stderr.write(`\nRe-run with W2H_MIN_AREA set to try another base threshold — no refetch ` +
    `needed if the extract is still on the runner.\n`);

  /* ---------- WHAT THE SCALE CORRECTION IS WORTH ----------

     The headline table already applies the scaled threshold, so this exists only to show the
     alternative: what a flat threshold would have kept on each island, and therefore what the
     correction is actually buying. One column, no second scan. */
  process.stderr.write(`\n${'island'.padEnd(10)}${'flat ' + MIN_BUILDING_AREA}`.padStart(21) +
    `${'scaled'.padStart(10)}${'gain'.padStart(9)}\n`);
  for (const isle of ISLANDS){
    const mine = OVERTURE.rows.filter(r =>
      r.lat >= isle.bbox[0] && r.lat <= isle.bbox[2] &&
      r.lon >= isle.bbox[1] && r.lon <= isle.bbox[3]);
    const flat = mine.filter(r => r.a >= MIN_BUILDING_AREA).length;
    const scaled = mine.filter(r => r.a >= areaThresholdFor(scales[isle.id] || 1)).length;
    process.stderr.write(`${isle.id.padEnd(10)}${String(flat).padStart(11)}` +
      `${String(scaled).padStart(10)}${((scaled / Math.max(flat, 1)).toFixed(2) + 'x').padStart(9)}\n`);
  }
}


async function main(){
  /* Flags are filtered out so `--probe` cannot be mistaken for an island name, which it would have
     been as argv[2]. */
  const args = process.argv.slice(2).filter(a => a && a[0] !== '-');
  const only = args[0];
  /* CASE-INSENSITIVE, BECAUSE THE FAILURE MODE WAS EXACTLY THIS. The workflow dropdown offers
     lowercase ids, but mobile GitHub's dispatch UI can render that field as free text with the
     phone's own keyboard autocapitalizing the first letter — "raha" typed, "Raha" sent, and
     `i.id === only` rejected a real island over a single letter's case. Comparing lowercase on
     both sides means a capital first letter, or any other casing a keyboard invents, still finds
     the island it obviously meant. */
  const list = only ? ISLANDS.filter(i => i.id.toLowerCase() === only.toLowerCase()) : ISLANDS;
  if (!list.length){
    throw new Error(`no island called "${only}" — choices are ${ISLANDS.map(i => i.id).join(', ')}`);
  }

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
     only place the regression is visible. Extents come from the same read: an island's display
     scale is relative to the LARGEST island, so a single-island re-bake needs the other four. */
  let prevCounts = {}, extents = {};
  try {
    const idx = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
    for (const i of idx.islands || []){
      prevCounts[i.id] = i.counts || {};
      if (i.extent) extents[i.id] = i.extent;
    }
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

  /* TWO PHASES, AND THE SPLIT IS FORCED BY THE THRESHOLD.

     An island's display scale is a function of the LARGEST island's span, so no island's threshold
     can be known until every outline has been measured. Baking into memory first costs about six
     megabytes and buys a filter that is correct rather than uniform. */
  const bakedAll = [];
  for (const isle of list){
    bakedAll.push(await bakeIsland(isle, proj));
    /* Serial, with a gap. Overpass asks for it, and five parallel requests from one Action IP is
       how the repo gets rate-limited for an hour. */
    if (isle !== list[list.length - 1]) await new Promise(r => setTimeout(r, 4000));
  }

  for (const b of bakedAll) if (b.extent) extents[b.id] = b.extent;
  const scales = displayScales(extents);

  process.stderr.write(`\ndisplay scales and the visibility threshold each one implies:\n`);
  for (const id of Object.keys(scales)){
    process.stderr.write(`  ${id.padEnd(10)}x${scales[id].toFixed(2).padStart(5)}` +
      `   threshold ${Math.round(areaThresholdFor(scales[id]))} m²\n`);
  }
  process.stderr.write(`\n`);

  const failed = [];
  for (const baked of bakedAll){
    /* THE THRESHOLD, APPLIED ONCE, AND THE AREA STRIPPED ON THE WAY OUT. `a` exists to make this
       decision and has no consumer downstream; leaving it in would put a hundred kilobytes of
       dead field in the artefact the hero downloads. */
    const thr = areaThresholdFor(scales[baked.id] || 1);
    const before = baked.buildings.length;
    baked.buildings = baked.buildings
      .filter(b => b.a == null || b.a >= thr)
      .map(({ a, ...rest }) => rest);
    process.stderr.write(`  ${baked.id}: threshold ${Math.round(thr)} m² — ` +
      `${before} -> ${baked.buildings.length}\n`);

    const path = `data/isle-${baked.id}.json`;

    /* AN ISLAND WITH NO OUTLINE IS NOT WRITTEN, AND THIS GUARD IS NOT OPTIONAL.

       Al Maryah shipped with outline 0, roads 0, parks 0 and 401 buildings. Overpass returned a
       504 for that island and the run carried on: buildings come from Overture and did not care,
       so the payload looked populated while the one thing everything else depends on was empty.

       WITHOUT AN OUTLINE THERE IS NO EXTENT, and without an extent the basemap cannot compute the
       island's radius, its display scale or its origin. The coastline clip then rejects every
       footprint — 401 in, 0 kept — and the island renders as bare ground. One failed HTTP request
       silently deleted a district.

       THE EXISTING GUARD COULD NOT SEE IT. That one compares building counts against the previous
       bake, and buildings went UP, 104 to 401. A count that rises is exactly what a healthy bake
       looks like, which is why this needs to be a different test rather than a stricter threshold.

       Keeping the previous file is the right failure: a district one release out of date is worth
       far more than a district that is not there. */
    const outlinePts = !baked.outline || !baked.outline.length ? 0
      : Array.isArray(baked.outline[0][0]) ? baked.outline.reduce((n, r) => n + r.length, 0) : baked.outline.length;
    if (outlinePts < 8 || !baked.extent){
      process.stderr.write(`  ${baked.id}: NOT WRITTEN — outline ${outlinePts} pt, ` +
        `extent ${baked.extent ? 'ok' : 'null'}. Overpass almost certainly failed for this island; ` +
        `the previous ${path} is left in place. Re-run the bake.\n`);
      failed.push(baked.id);
      continue;
    }

    /* inBox is bookkeeping for the index and the guard. It does not go in the artefact the hero
       downloads — a field with no consumer is a question for whoever reads this next. */
    const { inBox, ...file } = baked;
    await fs.writeFile(path, JSON.stringify(file));
    const bytes = (await fs.stat(path)).size;

    /* A ROADS-ONLY ARTEFACT, and it exists because of where the scene needs this data.

       The island file is 3.6 MB on Corniche and the roads inside it are a fraction of that — the
       rest is 20,262 buildings. But the ground canvas is painted while the island is built, so the
       centrelines have to be in hand BEFORE the first frame, and putting 3.6 MB on that path would
       undo a load that is now two seconds.

       LOCAL STREETS ARE NOW INCLUDED, and the earlier note saying they could come later "if they
       are ever wanted" was written before the ground was going to be carved by the street network.
       They are what makes a block a block: Corniche has 6,217 of them against 4,447 arterials, and
       without them the floor has a motorway grid on it and no city.

       The reason it was worth reversing is that the cost turned out to be nothing. Measured on the
       committed payloads, gzipped as GitHub Pages serves them, Corniche goes from 100 KB to 258 KB
       and Al Maryah from 9 KB to 14 KB. A hundred and fifty kilobytes against a 3.6 MB island file
       and a two second load, for two thirds of the street network.

       Written even when empty, so a consumer never has to distinguish "no roads" from "not baked
       yet". */
    /* PATHS RIDE WITH THE ROADS, not with the island payload, because they are consumed by the
       same top-up: the renderer already fetches this sidecar to get the real network onto an
       island after the first frame, and a promenade that arrives on a different schedule to the
       road it runs beside will paint over a ground texture that has already been uploaded. */
    const rd = { id:baked.id,
                 roads:(baked.roads || []).filter(r => r.cls === 'major' || r.cls === 'minor' ||
                                                       r.cls === 'local'),
                 paths:(baked.paths || []), plazas:(baked.plazas || []),
                 /* CAR PARKS RIDE IN THE SIDECAR, not only in the island file, because the ground is
                    painted once at build from what the sidecar holds — the same reason paths and
                    plazas are here. */
                 parking:(baked.parking || []) };
    const rpath = `data/roads-${baked.id}.json`;
    await fs.writeFile(rpath, JSON.stringify(rd));
    const rbytes = (await fs.stat(rpath)).size;
    process.stderr.write(`  ${baked.id}: roads-only ${rd.roads.length} ways, ` +
                         `${rd.paths.length} paths, ${rd.plazas.length} plazas, ` +
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
                         /* inBox is what the fetch box held before the coastline pre-clip, and it
                            exists so `buildings` can never again be compared against a number that
                            counted something else. The first Overture bake tripped its own
                            regression guard on exactly that: 256 in-box against 104 on-shore, read
                            as a fall of sixty per cent when the on-island stock had tripled. A
                            count is only comparable to a count measured the same way, and the only
                            reliable way to guarantee that is to write down which way it was. */
                         counts:{ outline:outlinePts,
                                  landmasses:Array.isArray(baked.outline[0][0]) ? baked.outline.length : 1,
                                  roads:baked.roads.length,
                                  buildings:baked.buildings.length,
                                  inBox:baked.inBox,
                                  withHeight:baked.buildings.filter(b => b.h).length,
                                  parks:baked.parks.length,
                                  paths:baked.paths.length,
                                  plazas:baked.plazas.length,
                                  golf:baked.golf.length,
                                  raceway:baked.raceway.length,
                                  water:baked.water.length,
                                  waterIslands:baked.waterIslands.length,
                                  beaches:(baked.beaches||[]).length,
                                  hardEdge:(baked.hardEdge||[]).length,
                                  parking:(baked.parking||[]).length,
                                  withVenues:baked.buildings.filter(b => b.v).length } });
    process.stderr.write(`  ${baked.id}: wrote ${path}  ${(bytes/1048576).toFixed(2)} MB\n`);

    /* A WARNING AND NOT A FAILURE, deliberately. A count that drops can be legitimate — a source
       correcting duplicates, a bounding box tightened on purpose — and a bake that refuses to
       finish would mean the only way to accept a real improvement is to disable the guard. The
       workflow's contract has always been "run it, look at the diff, keep it or revert it", so
       this makes the thing worth looking at impossible to scroll past. */
    /* COMPARED ONLY AGAINST A COUNT MEASURED THE SAME WAY. An index without inBox predates the
       pre-clip, so its `buildings` counted the fetch box and this one counts the shore — no ratio
       between them means anything. Silent for one run after the upgrade, correct from then on,
       which is the right way round: a guard that fires wrongly gets ignored, and a guard that is
       ignored is not a guard. */
    const was = prevCounts[baked.id];
    if (was && was.inBox != null && was.buildings > 0){
      const now = baked.buildings.length;
      if (now < was.buildings * 0.8){
        process.stderr.write(`  !! ${baked.id}: BUILDINGS FELL ${was.buildings} -> ${now} ` +
          `(${Math.round(100 * now / was.buildings)}%). Check the diff before keeping this.\n`);
      }
    } else if (was){
      process.stderr.write(`  ${baked.id}: no comparable previous count ` +
        `(the committed index predates the coastline pre-clip) — regression check skipped\n`);
    }
  }

  /* A PARTIAL BAKE MUST NOT TRUNCATE THE INDEX. Running one island rewrites its own file and its
     own entry, and leaves the other four exactly as they were. */
  if (only){
    try {
      const prev = JSON.parse(await fs.readFile('data/index.json', 'utf8'));
      /* CASE-INSENSITIVE HERE TOO, AND MISSING THIS WAS A REAL BUG, NOT A HYPOTHETICAL ONE.
         The island SELECTION filter (`list`, above) was made case-insensitive already, but this
         is a SEPARATE comparison — which old index entry to drop before appending the fresh one
         — and it still compared case-sensitively. Typing the island as "Raha" across three
         separate runs meant `i.id !== only` was true for the real lowercase 'raha' entry every
         time, so nothing was ever excluded and each run appended a new entry instead of
         replacing the old one. Confirmed on the committed index.json: three 'raha' entries,
         one correct pair from the fixed outline logic and one stale one from before it, with
         whatever reads "the" raha entry picking the first — the stale one — regardless of how
         correct the other two were. Lower-casing both sides here is what actually de-duplicates
         on the next run, self-healing the three back down to one without a manual edit. */
      const kept = (prev.islands || []).filter(i => i.id.toLowerCase() !== only.toLowerCase());
      index.islands = kept.concat(index.islands)
        .sort((a, b) => ISLANDS.findIndex(i => i.id === a.id) - ISLANDS.findIndex(i => i.id === b.id));
    } catch { /* no previous index; the single entry stands alone */ }
  }

  await fs.writeFile('data/index.json', JSON.stringify(index, null, 1));

  /* RED, NOT GREEN. An island skipped above means the artefact set is incomplete, and a workflow
     that reports success on an incomplete bake is how a missing district reaches the scene without
     anyone looking. The files already written stay written — a partial improvement is still an
     improvement — but the run has to end in a way somebody notices. */
  if (failed.length){
    process.stderr.write(`\nBAKE INCOMPLETE — not written: ${failed.join(', ')}. ` +
      `Overpass failures are usually transient; re-running is normally enough.\n`);
    process.exitCode = 1;
  }
  const total = index.islands.reduce((a, i) => a + (i.bytes || 0), 0);
  process.stderr.write(`\nwrote data/index.json  —  ${index.islands.length} islands, ` +
                       `${(total/1048576).toFixed(2)} MB total\n`);
}

/* Guarded so the geometry above can be imported by a test harness without firing a hundred
   Overpass requests. Running the file directly is unaffected. */
export { simplify, obb, hull, area, stitch, heightOf, projector };
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
