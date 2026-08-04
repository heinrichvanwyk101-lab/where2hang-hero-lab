// PASTE TARGET: where2hang-hero-lab/data/city-geography.js
//
// ABU DHABI PLAN GEOGRAPHY — v1.0
// ---------------------------------------------------------------------------
// Companion to city-reference.js. That file holds HOW things look. This file
// holds WHERE they are — the plan geometry read off 23 top-down satellite
// frames (Layer A).
//
// Coordinates are WGS84 decimal degrees, approximate to ~2-3 decimal places.
// Sufficient for laying out a stylised city; not survey grade. Outlines are
// described as shape rules plus anchor points rather than traced polygons —
// the frames were screenshots, not vector data, so a traced polygon would
// carry false precision.
//
// Orientation note: Abu Dhabi island runs roughly SW-NE. The Corniche faces
// NORTH-WEST across the gulf. The canonical hero view (looking at the city
// from the water) therefore looks SOUTH-EAST.
// ---------------------------------------------------------------------------

/* ===========================================================================
   1. EXTENT
   =========================================================================== */

export const EXTENT = {
  west:  54.30,
  east:  54.68,
  south: 24.39,
  north: 24.58,
  centre: [24.47, 54.47],
  spanKm: { ew: 38, ns: 21 },
  note: 'Covers Abu Dhabi island through Saadiyat, Reem and out to Yas. ' +
        'Everything with silhouette weight sits inside this box.',
};

/* ===========================================================================
   2. ISLANDS
   The defining structural fact: Abu Dhabi is an archipelago, not a coastline.
   Water between landmasses is as much of the composition as the land.
   =========================================================================== */

export const ISLANDS = {

  /* ---------------------------------------------------------------------
     ABU DHABI ISLAND — the main island, the historic core.
     Frames: Corniche west head, Corniche central, Mina Zayed, interior.
  --------------------------------------------------------------------- */
  abuDhabi: {
    centre: [24.47, 54.37],
    lengthKm: 17,
    widthKm: 8,
    axis: 225,            // degrees — runs SW-NE, wide head at the NE
    outline:
      'Broad rounded head at the north-east (Ras Al Akhdar / Al Bateen), ' +
      'narrowing south-west into the Mussafah channel. The NW edge is the ' +
      'Corniche — an engineered arc, convex to the sea. The SE edge faces ' +
      'the Khor and is irregular, with Maryah and Reem sitting in the channel.',
    features: {
      rasAlAkhdar:    { at: [24.470, 54.317], is: 'westernmost tip — Qasr Al Watan, Emirates Palace' },
      cornicheArc:    { from: [24.468, 54.325], to: [24.497, 54.375], is: 'the 8 km beach and park chain' },
      breakwater:     { at: [24.476, 54.335], is: 'Marina Mall spit, hooks NW into the gulf' },
      alBateen:       { at: [24.450, 54.330], is: 'villas, former airfield, marina' },
      alMarkaziyah:   { at: [24.487, 54.363], is: 'dense CBD grid' },
      alZahiyah:      { at: [24.494, 54.377], is: 'Tourist Club area, dense mid-rise' },
      minaZayed:      { at: [24.520, 54.375], is: 'port, cranes, freezone grid, NE tip' },
      grandMosque:    { at: [24.412, 54.475], is: 'SE of the island proper, near the bridges' },
      airportRoad:    { from: [24.495, 54.372], to: [24.425, 54.470], is: 'the spine corridor' },
    },
  },

  /* ---------------------------------------------------------------------
     AL LULU — the platted-but-empty island. Highest character value.
     Frame: Corniche central.
  --------------------------------------------------------------------- */
  alLulu: {
    centre: [24.505, 54.338],
    lengthKm: 4.5,
    widthKm: 1.0,
    axis: 240,
    outline: 'Long narrow crescent lying parallel to the Corniche, ~600 m offshore. Pointed at both ends.',
    condition: 'ENTIRELY UNBUILT. Complete road loops, kerbs, roundabouts, ' +
               'a small lagoon near the centre. Zero structures. This is the ' +
               'purest example of the platted-but-empty signature.',
    renderNote: 'Sits directly between the viewer and the Corniche in the ' +
                'canonical hero view. Excellent mid-ground element — a pale ' +
                'sand mass with faint road geometry, framing the city behind.',
  },

  /* ---------------------------------------------------------------------
     AL MARYAH — the financial island. Small, dense, half empty.
     Frame: Al Maryah tight.
  --------------------------------------------------------------------- */
  alMaryah: {
    centre: [24.500, 54.388],
    lengthKm: 2.2,
    widthKm: 1.1,
    axis: 270,
    outline: 'Rounded rectangle in the Khor channel, bridges at both ends.',
    built: 'EAST HALF ONLY — Galleria, ADGM, Cleveland Clinic, Four Seasons, ' +
           'the waterfront Promenade with its curved inlet.',
    unbuilt: 'WEST HALF — graded sand, faint plot outlines, one sports pitch, ' +
             'blue site cabins. The hard edge where glass towers stop and sand ' +
             'starts is one of the most characteristic sights in the city.',
  },

  /* ---------------------------------------------------------------------
     AL REEM — the tower island. Largest residential cluster.
     Frame: Al Reem full.
  --------------------------------------------------------------------- */
  alReem: {
    centre: [24.495, 54.415],
    lengthKm: 6.5,
    widthKm: 3.5,
    axis: 300,
    outline: 'Irregular, roughly triangular, mangrove channels cutting the east side.',
    features: {
      shamsAbuDhabi: { at: [24.503, 54.404], is: 'the Gate towers, Sun and Sky, dense NW cluster' },
      reemCentralPark:{ at: [24.500, 54.408], is: 'green wedge inside the tower cluster' },
      najmat:        { at: [24.487, 54.424], is: 'south-east district, partly built' },
      reemHills:     { at: [24.497, 54.435], is: 'terraced earthworks, plotted villa curls, mostly unbuilt' },
      alFayPark:     { at: [24.491, 54.410], is: 'green' },
    },
    condition: 'Roughly 55% built. Reem Hills is largely plotted terrain.',
  },

  /* ---------------------------------------------------------------------
     SAADIYAT — the cultural island. Museums, beach, vast empty sectors.
     Frames: Saadiyat south coast, Saadiyat west, Saadiyat interior.
  --------------------------------------------------------------------- */
  saadiyat: {
    centre: [24.545, 54.435],
    lengthKm: 10,
    widthKm: 4,
    axis: 250,
    outline: 'Long, running WSW-ENE. Straight open-sea beach on the south. ' +
             'Mangrove channels on the north and west against Jubail.',
    features: {
      culturalDistrict: { at: [24.535, 54.398], is: 'Louvre (silver dome), Zayed National Museum (wing forms), teamLab, Guggenheim site' },
      saadiyatBeach:    { from: [24.549, 54.415], to: [24.556, 54.450], is: 'the long straight beach' },
      golfClub:         { at: [24.553, 54.437], is: 'green serpentine ribbons' },
      nyuad:            { at: [24.524, 54.435], is: 'campus, distinct block form' },
      hiddAlSaadiyat:   { at: [24.567, 54.412], is: 'villa strip on the west spit' },
      marinaDistrict:   { at: [24.538, 54.450], is: 'sand with survey scoring — interchange built, nothing on it' },
      promenade:        { at: [24.552, 54.462], is: 'sector-numbered parcels, unbuilt' },
    },
    condition: 'Roughly 35% built. The SDE/SDW sector grid is vast pale ' +
               'surveyed ground against mangrove — a defining Saadiyat view.',
  },

  /* ---------------------------------------------------------------------
     YAS — the entertainment island. Largest in the set.
     Frames: 10, coarse to fine.
  --------------------------------------------------------------------- */
  yas: {
    centre: [24.485, 54.605],
    lengthKm: 12,
    widthKm: 8,
    axis: 200,
    outline: 'Broad and irregular. Al Raha Creek wraps the south and east. ' +
             'Mangrove flats (Zeraa, Al Aliah) on the west. Desert and farm ' +
             'plots immediately east across the channel.',
    features: {
      ferrariWorld:   { at: [24.483, 54.606], is: 'red star, the colour anchor' },
      yasMall:        { at: [24.488, 54.607], is: 'large pale roof mass' },
      marinaCircuit:  { at: [24.469, 54.603], is: 'track loop, marina, hotel over the track' },
      yasBay:         { at: [24.456, 54.600], is: 'Etihad Arena gold octagon, beach curve, Perla towers' },
      yasLinks:       { at: [24.472, 54.589], is: 'golf, against the west mangroves' },
      yasNorth:       { at: [24.510, 54.600], is: 'Yas Acres, West Yas, Sustainable City' },
      yasGateway:     { at: [24.495, 54.625], is: 'east side, partly built' },
      seaWorld:       { at: [24.484, 54.615], is: 'block mass' },
    },
    condition: 'Roughly 40% built. Large graded parcels ring the attractions ' +
               'and fill most of Yas North and Yas Bay interior.',
  },

  /* ---------------------------------------------------------------------
     JUBAIL — the mangrove island. Almost entirely landscape.
     Frame: Saadiyat west.
  --------------------------------------------------------------------- */
  jubail: {
    centre: [24.583, 54.470],
    lengthKm: 8,
    widthKm: 4,
    axis: 240,
    outline: 'Defined by mangrove, not by shore. Braided turquoise channels ' +
             'through dark olive flats, a small built village on the east.',
    condition: '~5% built. Render as mangrove system, not as a landmass.',
    renderNote: 'The best available reference for mangrove channel geometry.',
  },

  /* ---------------------------------------------------------------------
     MINOR ISLANDS — silhouette texture in the far water.
  --------------------------------------------------------------------- */
  minor: {
    hudayriyat:   { centre: [24.428, 54.318], is: 'SW of Al Bateen, low, partly developed' },
    birds:        { centre: [24.487, 54.318], is: 'small, offshore NW of Ras Al Akhdar' },
    masnouah:     { centre: [24.475, 54.310], is: 'small, W of Ras Al Akhdar' },
    alReemEast:   { centre: [24.540, 54.470], is: 'sand, unbuilt, between Saadiyat and the mainland' },
    zeraa:        { centre: [24.492, 54.570], is: 'mangrove flat W of Yas' },
    alAliah:      { centre: [24.480, 54.575], is: 'mangrove flat W of Yas' },
  },
};

/* ===========================================================================
   3. WATER BODIES
   The gaps between islands are named and shaped, not generic sea.
   =========================================================================== */

export const WATER = {
  gulf: {
    where: 'north and west of everything',
    depth: 'ramps to navy quickly beyond the shallows',
    note: 'The open side. In the canonical hero view this is behind the viewer.',
  },
  khorAlMaqta: {
    where: 'the channel separating Abu Dhabi island from the mainland',
    widthM: [400, 1200],
    note: 'Maryah and Reem sit inside it. Dredged, so hard straight edges.',
  },
  cornicheShallows: {
    where: 'between the Corniche and Al Lulu',
    widthM: 600,
    colour: 'stays in the turquoise part of the ramp — visibly shallower than the open gulf',
    note: 'This pale band directly in front of the city is a strong visual signature.',
  },
  alRahaCreek: {
    where: 'wraps the south and east of Yas',
    widthM: [200, 600],
  },
  saadiyatChannels: {
    where: 'between Saadiyat, Jubail and the mainland',
    note: 'Mangrove-lined, highly braided.',
  },
  dredgedChannels: {
    note: 'Straight, dark, hard-edged. Cut across natural shallows at ' +
          'obviously artificial angles. Present at Mina Zayed, Yas Marina, ' +
          'Khor Al Maqta. The contrast against soft natural shallows is ' +
          'characteristic and should be rendered.',
  },
};

/* ===========================================================================
   4. BRIDGES AND LINKS
   Islands are connected by a small number of very visible structures.
   =========================================================================== */

export const LINKS = [
  { name: 'Sheikh Zayed Bridge', from: 'abuDhabi', to: 'mainland', at: [24.407, 54.478], form: 'sinuous arch, highly distinctive silhouette' },
  { name: 'Al Maqta Bridge',     from: 'abuDhabi', to: 'mainland', at: [24.415, 54.470], form: 'low, historic, watchtower at one end' },
  { name: 'Mussafah Bridge',     from: 'abuDhabi', to: 'mainland', at: [24.395, 54.500], form: 'plain highway crossing' },
  { name: 'Saadiyat Bridge',     from: 'abuDhabi', to: 'saadiyat', at: [24.525, 54.385], form: 'plain highway crossing' },
  { name: 'Sheikh Khalifa Bridge', from: 'saadiyat', to: 'mainland', at: [24.560, 54.480], form: 'long causeway' },
  { name: 'Al Maryah links',     from: 'abuDhabi', to: 'alMaryah', at: [24.500, 54.383], form: 'two short bridges' },
  { name: 'Al Reem links',       from: 'abuDhabi', to: 'alReem', at: [24.494, 54.400], form: 'multiple short crossings' },
  { name: 'Umm Yifeenah Bridge', from: 'alReem', to: 'mainland', at: [24.505, 54.435], form: 'short' },
  { name: 'Yas links',           from: 'yas', to: 'mainland', at: [24.470, 54.630], form: 'E10/E12 causeways' },
];

/* ===========================================================================
   5. CANONICAL HERO CAMERA
   Where the viewer stands. Derived from the best Layer C compositions.
   =========================================================================== */

export const HERO_CAMERA = {
  position: [24.512, 54.330],   // on the water, NW of the Corniche
  heading: 130,                 // degrees — looking SE at the city
  elevationM: 180,
  fovDeg: 75,
  yawRangeDeg: 140,             // how far the look-around should sweep
  pitchRangeDeg: 22,
  seesInOrder: [
    'gulf water (foreground, out of frame below)',
    'Al Lulu island — pale unbuilt mass, mid-left to mid-right',
    'Corniche shallows — pale turquoise band',
    'the Corniche arc, beach and park chain',
    'Emirates Palace (right), Etihad Towers cluster (right of centre)',
    'Al Markaziyah tower run (centre)',
    'Maryah and Reem clusters (left, further)',
    'Grand Mosque (far left, low and distant)',
    'haze horizon',
  ],
  note: 'This camera produces the composition of Layer C images 1, 2 and 7: ' +
        'landmark near, cluster mid, city receding to haze. It is the ' +
        'orientation the whole band stack in city-reference.js assumes.',
};

/* ===========================================================================
   6. PRECISION CAVEAT
   =========================================================================== */

export const PRECISION = {
  coordinates: '±0.005 deg (~500 m). Read from screenshots, not vector data.',
  outlines: 'Described as shape rules, not traced polygons. A traced polygon ' +
            'from a screenshot would carry false precision.',
  upgradePath:
    'If exact outlines are ever needed, pull coastlines and island polygons ' +
    'from OpenStreetMap via Overpass (natural=coastline, place=island). That ' +
    'is authoritative, free, and redistributable — unlike the satellite frames ' +
    'these numbers were read from. This file is the stylised layout; OSM is ' +
    'the survey. For a hero, the stylised layout is almost certainly enough.',
};

export default { EXTENT, ISLANDS, WATER, LINKS, HERO_CAMERA, PRECISION };
