// PASTE TARGET: where2hang-hero-lab/data/city-reference.js
//
// ABU DHABI CITY REFERENCE — v1.0
// ---------------------------------------------------------------------------
// Derived from a capture session covering ~47 frames across three sources:
//   Layer A  Google Maps satellite, top-down .......... 23 frames
//   Layer B  Esri 3D scene viewer, steep oblique ...... 11 frames
//   Layer C  Esri 3D scene viewer, low tilt / horizon .. 13 frames
//
// The source images are NOT retained. This file is the surviving artefact.
// Every number here was read off those frames or corroborated against public
// figures. Nothing in the renderer should hard-code a proportion that is not
// declared here — if a shape looks wrong, the fix is a number in this file,
// not a magic constant in a draw call.
//
// Units: all heights in metres unless suffixed. All ratios are unitless and
// expressed against the named reference in the same block.
// ---------------------------------------------------------------------------

/* ===========================================================================
   1. PALETTE
   Sampled from Layer A (ground, water) and Layer C (haze, sky, built mass).
   Existing Where2Hang tokens are re-declared here so the hero never drifts
   from the app. Do not introduce colours outside this object.
   =========================================================================== */

export const PALETTE = {
  // --- Where2Hang locked tokens (do not alter) ---
  bg:            '#111315',
  card:          '#1B1E22',
  teal:          '#00C2A8',
  tealLight:     '#3DE9CD',
  gold:          '#E8B547',

  // --- Sky, sampled Layer C ---
  skyTop:        '#BFD8E8',  // zenith, pale
  skyHorizon:    '#EDF2F5',  // washes to near-white at the horizon line
  skyNightTop:   '#0C1620',  // night mood, extrapolated from bg
  skyNightHoriz: '#1D2C38',

  // --- Ground, sampled Layer A ---
  sandPale:      '#E4D9C4',  // graded / prepared plot, most common ground tone
  sandWarm:      '#D6BE95',  // undisturbed desert, Yas east farms, Al Bahia
  sandOrange:    '#C79A63',  // deep desert, top-right of Yas frames
  sabkha:        '#E9E9E4',  // salt crust at land/water margin, cooler than sand
  concrete:      '#CFCFCB',  // roads, kerbs, hardstanding
  asphalt:       '#8E9195',

  // --- Water ramp, sampled Layer A. Order matters: use as a gradient stop
  //     set from shoreline outward. Never render a flat blue. ---
  waterRamp: [
    '#DCEDEA',  // 0.00  wet sand / breaking edge
    '#9FE0DA',  // 0.15  white shallows
    '#5FC9C6',  // 0.30  pale turquoise
    '#2FA6AC',  // 0.50  turquoise
    '#1B7B8C',  // 0.70  teal
    '#125C74',  // 0.85  deep
    '#0B3A52',  // 1.00  navy, channel / open gulf
  ],
  seagrass:      '#1E5F5C',  // darker irregular patches over shallows
  sandbar:       '#C9DCD2',  // pale streaks within shallow water

  // --- Vegetation, sampled Layer A ---
  mangroveDark:  '#3A4A32',  // dense mangrove mass
  mangroveMid:   '#55663F',  // thinner fringe
  parkGreen:     '#4E7A38',  // irrigated park lawn
  golfGreen:     '#6B9B3F',  // brighter, fairway
  palmCrown:     '#4A6B33',
  medianGreen:   '#3F5C30',

  // --- Built mass, sampled Layer C ---
  towerGlass:    '#2B3742',  // dark glass curtain wall, Etihad Towers family
  towerGlassLit: '#4A5C6B',  // sunlit face of same
  towerPale:     '#C6C3BB',  // pale stone / render tower
  midriseWarm:   '#CBBFA9',  // the dominant interior block tone
  midriseCool:   '#B9BAB6',
  roofGrey:      '#9A9C99',
  roofWhite:     '#E8E8E4',  // Grand Mosque, Emirates Palace domes
  ferrariRed:    '#C8102E',  // Ferrari World roof
  arenaGold:     '#C9A961',  // Etihad Arena octagon

  // --- Atmosphere, sampled Layer C ---
  haze:          '#DFE7EC',  // the colour distant mass converges to
};

/* ===========================================================================
   2. BAND STRUCTURE
   The core finding of the capture session. A single plate cannot produce
   perspective under tilt. Five bands each with an independent depth scale
   will, because tilt then produces differential motion between them.
   `parallax` is the multiplier applied to device tilt for that band.
   `haze` is the mix factor toward PALETTE.haze (0 = full saturation).
   `y` is the band's vertical anchor as a fraction of viewport height.
   =========================================================================== */

export const BANDS = [
  {
    id: 'sky',
    y: 0.00,
    parallax: 0.00,
    haze: 0.00,
    source: 'procedural gradient, skyTop -> skyHorizon',
    note: 'No displacement. Gradient only. Horizon must sit at HORIZON_Y.',
  },
  {
    id: 'far',
    y: 0.38,
    parallax: 0.06,
    haze: 0.72,
    source: 'Layer C horizon strip',
    note: 'Distant towers reduced to pale silhouettes. Detail is a mistake here — the eye reads haze as distance before it reads parallax. Never grade this band back up to full contrast.',
  },
  {
    id: 'mid',
    y: 0.46,
    parallax: 0.22,
    haze: 0.38,
    source: 'Layer C tower clusters',
    note: 'Etihad Towers / Corniche run / Reem cluster live here. Vertical separation between towers must stay readable — this is the band that sells depth.',
  },
  {
    id: 'near',
    y: 0.58,
    parallax: 0.55,
    haze: 0.10,
    source: 'Layer B landmark on transparent',
    note: 'One landmark only. Two competing hero shapes flattens the composition.',
  },
  {
    id: 'ground',
    y: 0.72,
    parallax: 0.04,
    haze: 0.00,
    source: 'Layer A texture',
    note: 'Near-zero parallax by design — ground under the viewer should not slide. Carries plot geometry, water ramp, palm rows.',
  },
];

export const HORIZON_Y = 0.42;  // fraction of viewport height.
// Capture note: source frames varied between 0.35 and 0.55. They were NOT
// consistent. 0.42 is the chosen canonical value — hold it everywhere.

/* Haze mix helper. Distance 0 = foreground, 1 = horizon.
   Curve is deliberately non-linear: haze accumulates fast in the first half
   of the depth range, matching what Layer C actually shows. */
export function hazeAt(distance) {
  return Math.pow(Math.min(Math.max(distance, 0), 1), 0.62);
}

/* ===========================================================================
   3. LANDMARKS
   Construction rules, not pictures. Each entry carries enough proportion to
   be drawn by hand in SVG with no reference image open.
   `unit` is the module the other numbers are expressed against.
   =========================================================================== */

export const LANDMARKS = {

  /* -------------------------------------------------------------------------
     SHEIKH ZAYED GRAND MOSQUE
     Captured: Layer A ×2 (tight + wide plan), Layer B ×4 (full orbit).
     Silhouette weight: highest in the city. Instantly legible.
  ------------------------------------------------------------------------- */
  grandMosque: {
    unit: 'arcadeHeight',       // ~22 m in reality
    plan: 'square, courtyard open to sky, prayer hall on one side',
    proportions: {
      arcadeHeight:     1.00,
      arcadeWidth:      19.0,   // full facade width in arcade heights
      minaretHeight:    4.86,   // 107 m / 22 m
      minaretCount:     4,      // one per corner, set slightly inboard
      minaretInset:     0.9,    // inboard from the corner, in arcade heights
      mainDomeHeight:   3.86,   // 85 m, crown above ground
      mainDomeDiameter: 1.49,   // 32.7 m
      flankDomeScale:   0.62,   // the two domes either side of the main
      smallDomeScale:   0.22,   // arcade parapet domes
      smallDomeCount:   82,     // total across the complex; ~24 read on a face
      courtyardWidth:   9.5,    // the open void, roughly half the plan
    },
    profile: {
      dome:    'onion — widest at 0.40 of its own height, narrowing to a point finial',
      minaret: 'square shaft to 0.55, octagonal to 0.80, cylindrical lantern, gold finial',
      arcade:  'continuous pointed arches, rhythm ~1 arch per 0.55 arcade heights',
    },
    colours: {
      body:   PALETTE.roofWhite,
      shadow: '#C9CBC8',
      finial: PALETTE.gold,
      pool:   PALETTE.waterRamp[4],   // reflecting pools flank the approach
    },
    silhouetteRule:
      'From a distance the read is: four tall verticals bracketing a low ' +
      'horizontal mass with a cluster of rounded bumps offset to one side. ' +
      'Get the minaret-to-arcade ratio right and it is recognisable at 40 px wide.',
  },

  /* -------------------------------------------------------------------------
     ETIHAD TOWERS
     Captured: Layer C ×4 at varying tilt — the best parallax evidence in the set.
     Five towers, curved taper, dark glass. Reads as a cluster, never singly.
  ------------------------------------------------------------------------- */
  etihadTowers: {
    unit: 'tallestHeight',      // 305 m
    count: 5,
    // Heights as ratios of the tallest, in left-to-right order as seen
    // from the Corniche looking inland (the canonical hero angle).
    heights:  [0.915, 1.000, 0.852, 0.767, 0.711],
    // Horizontal centres, in tallestHeight units, from the leftmost tower.
    centres:  [0.00, 0.42, 0.79, 1.14, 1.52],
    widths:   [0.19, 0.21, 0.18, 0.17, 0.16],
    profile:
      'Curved taper — each tower is widest at ~0.25 of its height, narrowing ' +
      'toward the crown with a slight outward lean at the top. Not a straight ' +
      'prism. The silhouette edge is a shallow S.',
    colours: {
      glassShade: PALETTE.towerGlass,
      glassLit:   PALETTE.towerGlassLit,
      // Sun is consistently from the upper left across all Layer C frames.
      litFace: 'left',
    },
    silhouetteRule:
      'Uneven heights in a tight cluster with visible sky gaps between shafts. ' +
      'If the gaps close, the cluster reads as one slab and the landmark is lost.',
  },

  /* -------------------------------------------------------------------------
     EMIRATES PALACE
     Captured: Layer A ×2, Layer C ×2 (foreground of the best composition).
     Wide low mass — the horizontal counterweight to the tower cluster.
  ------------------------------------------------------------------------- */
  emiratesPalace: {
    unit: 'wingHeight',         // ~40 m to the main cornice
    proportions: {
      wingHeight:       1.00,
      totalWidth:       25.0,   // ~1 km frontage — very wide, very low
      centralDome:      2.85,   // 114 m crown
      centralDomeWidth: 1.60,
      flankDomeCount:   8,      // stepped along each wing
      flankDomeScale:   0.45,
      cornerTowerCount: 4,
      cornerTowerScale: 1.55,
    },
    profile:
      'Symmetrical. Central dome, then a stepped descent of smaller domes ' +
      'outward along both wings, terminating in square corner pavilions. ' +
      'The stepping is the signature — an even roofline is wrong.',
    colours: {
      body:   '#D9C39B',        // warm sand stone, distinctly warmer than the mosque
      dome:   '#C7A870',
      shadow: '#B39B77',
    },
    silhouetteRule:
      'Extremely wide relative to height — 25:1. Resist the urge to compress it. ' +
      'The width against the vertical tower cluster behind is the whole composition.',
  },

  /* -------------------------------------------------------------------------
     QASR AL WATAN
     Captured: Layer B ×4 (orbit), Layer A ×1 (plan).
     Lower and broader than Emirates Palace. Single dominant dome.
  ------------------------------------------------------------------------- */
  qasrAlWatan: {
    unit: 'wingHeight',         // ~30 m
    proportions: {
      wingHeight:     1.00,
      totalWidth:     22.0,
      centralDome:    2.40,
      centralDomeWid: 1.23,     // 37 m diameter
      flankPavilions: 4,
      pavilionScale:  1.30,
      forecourtDepth: 6.0,      // formal parterre in front, reads as ground pattern
    },
    profile:
      'Flatter dome than the mosque — closer to hemispherical than onion. ' +
      'Long colonnaded wings. Mostly three storeys.',
    colours: {
      body: '#E0DAD0',
      dome: '#D8CDBA',
    },
    silhouetteRule:
      'One dome, wide low wings, formal geometry on the ground in front. ' +
      'Reads as a horizontal bar with a single bump — easily confused with ' +
      'Emirates Palace unless the stepped flank domes are omitted here.',
  },

  /* -------------------------------------------------------------------------
     FERRARI WORLD
     Captured: Layer B ×7 (near-full orbit), Layer C ×2 (horizon).
     The only strong colour accent in the city silhouette.
  ------------------------------------------------------------------------- */
  ferrariWorld: {
    /* DO NOT PARAMETERISE THIS ROOF. Three attempts were made to describe it with a formula -
       five equal lobes at 72 degrees, then three "tri-form" arms at 120, then five swept spikes -
       and all three produced a starfish. Every one of them assumed a symmetry the building does
       not have. The arms sit at compass 60, 91, 188, 219 and 306, which is gaps of 30, 97, 30, 87
       and 115 degrees, and the longest is twice the shortest. Nothing periodic can express that.

       The geometry now carries a measured PLAN table instead, segmented off an overhead capture
       and sampled every 5 degrees from the funnel. See ferrariWorld in w2h-city.js. The numbers
       below are for reading, not for building to.

       THE LESSON, KEPT ON PURPOSE. This entry was wrong, then "corrected" to something wronger on
       the strength of Benoy's published wording, because prose beat a photograph in a workflow
       built specifically to stop that. Benoy's "three tri-form arms" describes the three ENCLOSED
       arms cradling the outdoor attractions; it is not the roof silhouette. Anything in this file
       not traceable to a measurement should be treated as a guess until something looks at it. */
    unit: 'peakHeight',         // 48 m at the crown; 45 m quoted as building height
    plan: 'five-point swept star, ASYMMETRIC - unequal arms at unequal spacing',
    measured: {
      armBearings:   [60, 91, 188, 219, 306],   // compass
      armRadiiM:     [228, 437, 437, 219, 295], // from the funnel, same order
      bodyRadiusM:   102,
      funnelOffsetM: 48,        // funnel sits NW of the centroid; it is the model's origin
      funnelDiaM:    106,       // measured; published figure is 100, which validates the scale
      logo:          { bearing: 106, radiusM: 145, sizeM: [65, 48.5] },
    },
    published: {
      spanM: 700, peakM: 48, buildingHeightM: 45,
      roofSurfaceM2: 200000, netRoofM2: 153000, funnelTopM: 100, funnelBaseM: 17,
      roofPerimeterM: 2200,   // DO NOT FIT TO THIS. It is about the perimeter of a 700 m CIRCLE,
                              // which a deeply scalloped star cannot have. It fought the
                              // photograph and the photograph was right.
    },
    profile:
      'A ground-hugging form peeling up from the landscape like a red sand dune (Benoy). From ' +
      'the horizon it is a long low red wedge, highest at the centre, tapering to near-ground ' +
      'at the tips, with a dark notch at the crown where the funnel opens.',
    section:
      'The crown-to-edge descent is a DOUBLE CURVE - convex then concave - because the section ' +
      'is literally the Ferrari GT side profile applied in elevation. smootherstep produces it ' +
      'and also flattens at both ends, giving the plateau at the funnel and the long run out.',
    colours: { roof: PALETTE.ferrariRed, rim: '#1A1A1A', funnel: '#9FB0BC' },
    silhouetteRule:
      'The black rim against the red is what makes it legible at distance. And it must stay ' +
      'LOW: at 12:1 it is a dune, at 5:1 it is a circus tent, and there is nothing in between.',
  },

  /* -------------------------------------------------------------------------
     YAS MALL
     PROVISIONAL - authored from photographs, not measured. Ferrari World could be
     segmented because the map draws it in a flat highlight colour; Yas Mall has no
     such highlight, and in satellite imagery its roof tones run into the parking
     aprons and roads. Every threshold that catches the mall catches half the island.
  ------------------------------------------------------------------------- */
  yasMall: {
    unit: 'metres',
    plan: 'long irregular sprawl, roughly 380 x 215 m, plus flanking car decks',
    proportions: { lengthM: 380, depthM: 215, retailHeightM: [14, 26], deckHeightM: 11 },
    attachment:
      'PHYSICALLY ATTACHED to Ferrari World, and the bake proves it: Overture returns the two ' +
      'as ONE merged polygon of 785 x 679 m, barely larger than Ferrari World alone. The mall ' +
      'therefore tucks into a VALLEY between two arms and presents its LONG FLANK, not its end. ' +
      'Its own baked anchor is only 184 m from Ferrari World\'s and cannot be trusted for ' +
      'distance - that point is a label node inside the merged complex. Direction only; the ' +
      'distance is probed off the built roof in w2h-world.js.',
    silhouetteRule:
      'Long, low and irregular, with car decks taking as much ground as the retail. Skylights ' +
      'are FLUSH discs. The previous model had a single raised 30 m dome and read as a mosque.',
  },

  /* -------------------------------------------------------------------------
     ETIHAD ARENA
     Captured: Layer A ×2 (Yas Bay tight frames).
     Small but distinctive — a gold octagon.
  ------------------------------------------------------------------------- */
  etihadArena: {
    unit: 'height',             // ~52 m
    plan: 'regular octagon',
    proportions: {
      height:   1.00,
      diameter: 3.10,
      roofRise: 0.18,           // shallow domed cap, not flat
    },
    colours: { body: PALETTE.arenaGold, roof: '#B89A55' },
  },

  /* -------------------------------------------------------------------------
     SUPPORTING VERTICALS
     Not hero landmarks, but they define the skyline sequence. Heights are
     absolute metres — used to set relative position in the mid/far bands.
  ------------------------------------------------------------------------- */
  supporting: {
    burjMohammedBinRashid: { height: 381, form: 'slender, near-parallel sides, flat crown', note: 'tallest in the city; the thin needle in Layer C image 1' },
    adnocHeadquarters:     { height: 342, form: 'rectangular slab, tapered base' },
    theLandmark:           { height: 324, form: 'stepped crown' },
    theGate:               { height: 200, form: 'four matched towers in a row', note: 'Al Reem' },
    capitalGate:           { height: 165, form: 'leaning 18 degrees westward', note: 'unmistakable if included; lean is the entire identity' },
    aldarHQ:               { height: 110, form: 'perfect circle standing on edge', note: 'the dark disc in the interior frames' },
    marinaMallSpire:       { height: 100, form: 'thin spire on a low mall mass' },
  },
};

/* ===========================================================================
   4. SKYLINE SEQUENCE
   Left-to-right order as seen from the gulf looking east at the island —
   the canonical hero orientation, matching Layer C images 1, 2 and 7.
   Positions are fractions across the full panoramic width.
   =========================================================================== */

export const SKYLINE_SEQUENCE = [
  { at: 0.02, id: 'qasrAlWatan',   band: 'mid'  },
  { at: 0.09, id: 'emiratesPalace', band: 'near' },
  { at: 0.17, id: 'etihadTowers',  band: 'mid'  },
  { at: 0.24, id: 'marinaMallSpire', band: 'mid' },
  { at: 0.31, id: 'burjMohammedBinRashid', band: 'mid' },
  { at: 0.38, id: 'adnocHeadquarters', band: 'mid' },
  { at: 0.46, id: 'corniche_run',  band: 'far', note: 'continuous mid-rise wall, no single landmark' },
  { at: 0.58, id: 'theLandmark',   band: 'far'  },
  { at: 0.66, id: 'maryah_cluster', band: 'far' },
  { at: 0.74, id: 'theGate',       band: 'far'  },
  { at: 0.82, id: 'reem_cluster',  band: 'far'  },
  { at: 0.93, id: 'grandMosque',   band: 'far', note: 'inland and low — appears smaller than expected from this angle' },
];

/* ===========================================================================
   5. GROUND VOCABULARY
   The finding that matters most for authenticity: across every Layer A frame,
   built mass occupies roughly a quarter of the ground. The rest is sand,
   plot geometry, water, mangrove and planting. A city built to a higher
   built-ratio will not read as Abu Dhabi regardless of landmark accuracy.
   =========================================================================== */

export const GROUND = {

  builtRatio: 0.25,   // target fraction of land area carrying structures

  /* --- PLATTED BUT UNBUILT ------------------------------------------------
     The signature condition. Finished infrastructure, absent buildings:
     kerbs, roundabouts, lamp standards, sometimes planted medians — all
     present, with nothing behind them. Observed at Al Lulu (entire island),
     Al Maryah west half, Saadiyat SDE/SDW sectors, Yas North, Yas Bay,
     Reem Hills, Al Bateen reclamation.
     Render this explicitly. Do not fill with generic desert. ------------- */
  unbuilt: {
    coverage:        0.30,   // fraction of land that should be platted-but-empty
    kerbWidth:       0.4,    // metres, rendered as a 1px pale line at hero scale
    kerbColour:      PALETTE.concrete,
    plotLineOpacity: 0.35,
    roundaboutFreq:  1,      // per ~400 m of platted road
    lampSpacing:     35,     // metres — reads as a dotted rhythm plus shadows
    surface:         PALETTE.sandPale,
  },

  /* --- MANGROVE -----------------------------------------------------------
     The single most identifying landscape feature. Braided turquoise channels
     cutting through dark olive flats. Jubail, Saadiyat west, Yas west
     (Zeraa / Al Aliah), Reem east, Eastern Mangroves. ---------------------- */
  mangrove: {
    channelWidth:    [8, 40],   // metres, min/max
    branchAngle:     [25, 55],  // degrees off parent channel
    branchDepth:     4,         // levels of subdivision
    sinuosity:       0.65,      // 0 straight, 1 highly meandering
    massColour:      PALETTE.mangroveDark,
    fringeColour:    PALETTE.mangroveMid,
    channelColour:   PALETTE.waterRamp[2],
    note: 'Channels are the figure, not the ground. Draw the water first and let the vegetation be what remains.',
  },

  /* --- WATER --------------------------------------------------------------
     Never flat. Bands from shore outward, with sandbars and seagrass. ------ */
  water: {
    ramp:            PALETTE.waterRamp,
    shallowWidth:    [80, 400],  // metres of turquoise before it goes teal
    sandbarFreq:     0.25,       // fraction of shallow area carrying pale streaks
    seagrassFreq:    0.18,
    channelDepth:    1.0,        // dredged channels go straight to ramp[6]
    note: 'Dredged channels have hard straight edges against soft natural shallows. That contrast is characteristic.',
  },

  /* --- COASTAL ENGINEERING -------------------------------------------------
     The shoreline is almost never natural. --------------------------------- */
  coast: {
    groyneSpacing:   180,   // metres
    groyneLength:    60,
    rockArmour:      true,
    breakwaterArms:  true,
    waveBreakOffset: 120,   // metres offshore, visible as a pale line
    beachWidth:      [30, 90],
  },

  /* --- PLANTING ------------------------------------------------------------ */
  planting: {
    palmRowSpacing:  12,    // metres between palms in a row
    palmRowDouble:   true,  // Corniche runs double rows
    medianPlanting:  true,
    roundaboutGarden: {
      freq: 0.8,            // fraction of roundabouts that are planted
      geometry: 'concentric rings or radial segments — always formal',
    },
    carParkTreeGrid: {
      spacing: 14,          // Grand Mosque car parks: regular shade-tree dots
      note: 'Pale ruled surface with a regular dot grid. Very distinctive from above.',
    },
    parkChain: [
      'Family', 'Formal', 'Lake', 'Heritage', 'Capital', 'Fluente', 'Al Khubeirah',
    ],
    parkForm: 'narrow green strips between road and beach, palm-dotted, rarely deep',
  },

  /* --- GOLF ---------------------------------------------------------------- */
  golf: {
    courses: ['Saadiyat Beach', 'Yas Links', 'Yas Acres'],
    form: 'bright green serpentine ribbons with black water hazards and pale bunkers',
    colour: PALETTE.golfGreen,
  },

  /* --- SABKHA -------------------------------------------------------------- */
  sabkha: {
    colour: PALETTE.sabkha,
    where: 'land/water margins, distinct from beach sand — cooler and flatter',
  },

  /* --- CONSTRUCTION -------------------------------------------------------
     Present in every single Layer A frame without exception. --------------- */
  construction: {
    density: 0.12,   // fraction of built area under active construction
    elements: ['tower cranes', 'laydown yards', 'blue/white cabin rows', 'spoil heaps', 'excavated pits'],
    cabinColour: '#3E6FA8',
    craneColour: '#E8B547',
  },

  /* --- DESERT AGRICULTURE --------------------------------------------------
     Observed east of Yas: ruled rectangular plots in orange sand, sparsely
     green. Reads as a hard geometric grid on otherwise organic ground. ----- */
  farmPlots: {
    size: [200, 600],   // metres per side
    colour: PALETTE.sandOrange,
    vegetationFreq: 0.3,
  },
};

/* ===========================================================================
   6. URBAN DENSITY
   From Layer C interior frames (Airport Road corridor, Al Nahyan, Al Wahda).
   The connective tissue. Without it the city reads as isolated landmarks
   scattered on sand — the single most likely failure mode.
   =========================================================================== */

export const DENSITY = {
  midrise: {
    storeys:      [6, 12],      // the dominant grain
    footprint:    [30, 60],     // metres per side
    storeyHeight: 3.4,
    spacing:      [8, 20],      // gap between blocks
    perKm:        95,           // blocks per linear km of frontage
    colours:      [PALETTE.midriseWarm, PALETTE.midriseCool],
    roofClutter:  true,         // plant, tanks, dishes — visible at close range
  },
  towerPunctuation: {
    freq: 0.04,                 // fraction of blocks that are towers
    storeys: [25, 60],
    note: 'Towers are occasional punctuation in a mid-rise field, not a forest.',
  },
  superblock: {
    width:  [180, 320],         // metres
    length: [400, 900],
    orientation: 'strong grid, aligned to the island axis',
    note: 'The Al Markaziyah / Al Zahiyah grid is emphatic. Long blocks with ' +
          'consistent orientation, cut by wide arterials.',
  },
  corridor: {
    // Airport Road, Layer C images 4 and 5 — the strongest perspective evidence.
    width: 90,                  // metres kerb to kerb including median
    medianWidth: 14,
    note: 'A long straight corridor running to a vanishing point gives a ' +
          'continuous depth ramp. Use one as the composition spine if the ' +
          'hero ever needs an inland-facing view.',
  },
};

/* ===========================================================================
   7. LIGHTING
   Consistent across all Layer B and C frames. Hold this — a hero lit from a
   different angle than its landmark sprites will not composite.
   =========================================================================== */

export const LIGHTING = {
  sunAzimuth:   315,   // degrees, from upper left
  sunElevation: 52,    // degrees
  shadowLength: 0.78,  // multiplier on object height
  shadowOpacity: 0.22,
  shadowColour: '#7A8590',
  note: 'Shadow length is itself a height cue and was used to read relative ' +
        'tower heights off the satellite frames. Keep shadows on — removing ' +
        'them flattens the render more than removing texture would.',
};

/* ===========================================================================
   8. HARD NEGATIVES
   Carried forward from the Where2Hang design constraints plus findings from
   this session. These are not preferences — they are failure modes observed
   or anticipated.
   =========================================================================== */

export const AVOID = [
  'purple, neon, Vegas or nightclub palette',
  'fake objects anchored to a 2D plate — the fault that started this whole arc',
  'flat blue water with no banding',
  'natural-looking shoreline — almost none exists here',
  'a city of landmarks with empty sand between them — add the mid-rise field',
  'full-contrast distant buildings — haze is the primary depth cue',
  'even rooflines on Emirates Palace — the stepped domes are the signature',
  'solid red Ferrari World with no black rim',
  'closed gaps between Etihad Towers shafts',
  'untextured black mesh blocks — these were data gaps in the source, not buildings',
  'horizon drifting between bands — HORIZON_Y is fixed at 0.42',
];

/* ===========================================================================
   9. PROVENANCE AND LICENSING
   =========================================================================== */

export const PROVENANCE = {
  sources: [
    { layer: 'A', provider: 'Google Maps satellite', frames: 23, use: 'ground truth, plan geometry, landscape' },
    { layer: 'B', provider: 'Esri 3D scene viewer (Abu Dhabi city model)', frames: 11, use: 'landmark massing, multi-angle geometry' },
    { layer: 'C', provider: 'Esri 3D scene viewer (Abu Dhabi city model)', frames: 13, use: 'horizon plates, atmospheric depth, parallax evidence' },
  ],
  imagesRetained: false,
  note: 'This file encodes measurements and proportions derived from those ' +
        'sources. No source imagery is reproduced or redistributed here, and ' +
        'the renderer draws original geometry from these numbers. Before any ' +
        'of this ships on a public Where2Hang surface, confirm the Esri scene ' +
        'layer terms — a derived depth map may still count as a derivative work. ' +
        'Cheap to confirm now, expensive to unpick later.',
};

export default {
  PALETTE, BANDS, HORIZON_Y, hazeAt, LANDMARKS,
  SKYLINE_SEQUENCE, GROUND, DENSITY, LIGHTING, AVOID, PROVENANCE,
};
