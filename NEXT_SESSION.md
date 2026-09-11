# Next session — opening line

> **10 September 2026 — READ `CLIP-HANDOVER.md` FIRST.** The off-island clip and road mend are
> LIVE and verified on all nine islands. Rabdan's west edge runs to Khor Al Maqta (live), Sas Al
> Nakhl to the north is deliberately NOT built (owner's rule, at the frame in `tools/bake-city.mjs`),
> Al Raha's two crescents are land left as desert sand (world v344, the roadless fill is off), and
> the E10 corridor's road sections are thinned where carriageways crowd (world v343). The workflow's
> `branch` input is how a bake gets looked at before it is live: bake to `bake-preview`, render
> against `main` from a fixed camera, cherry-pick. The owner items and their state are at the top
> of that file. Since then, also live: basemap v28 / nav v246 (data cache-bust by bake stamp, tap
> wiring), city v174 (Al Raha Beach Resort as a crescent). The Etihad Plaza
> island south of the E10 is live (Al Raha's second frame, basemap v29 shift of 370, city v175 /
> world v346 Etihad HQ kit) — see the SHIPPED note in that file.

> **10 September, later:** Etihad Plaza is live — Al Raha's island widened west (bake 2143439),
> a `plaza` style zone in `footprintsFor` (cream render, tile roofs on every block, heights by
> footprint), the diorama shift at 400 (basemap v30), `W2H_VIEW` for `closeup.mjs` (view=night
> came out blank on the bench; unresolved). App branch: the Home "Ask Wasta" nudge (0965920) and
> the leisure-only Google Places fallback. Wasta's freer voice and `chat` kind are in progress.
>
> Read this file, then `docs/VENUE-BUILDINGS.md` in the app repo, then the task list below.
> Check the four `BUILD` stamps in the raw files before saying what is live.

Files read from `raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.
App repo: `heinrichvanwyk101-lab/Where2hang` (Next.js 16, Supabase project `wwexhlwnvqvkbzccxctt`).

## Handed over on 7 September 2026

Stamps at hand-over: `nav v249 / city v175 / world v347 / props v41` (11 Sep 2026; basemap unchanged). Verify with
`grep -n "BUILD = \|B_NAV = " w2h-city.js w2h-world.js world-nav.html`.

### How work flows (both repos)

- **hero-lab** (this repo): edit, bump the stamps — and since nav v248 the nav stamp is also the
  cache key for every module in the embed (`?v=navvNNN`), so a change to ANY module needs a nav
  bump or installed phones keep the old one; three is vendored (`vendor/three/`, regenerate with
  `node tools/vendor-three.mjs three-0.169.0.tgz` from `npm pack three@0.169.0`); `sw.js` holds
  the whole world per build — edit, bump the stamps (`city vNNN` in w2h-city.js, `world vNNN` in
  w2h-world.js, `nav vNNN` in world-nav.html), run `node tools/bench/errcheck3.mjs` (3 to 6 min,
  needs `errors: 0` and no bad materials), push straight to `main`. GitHub Pages deploys in about a
  minute. Renders: `tools/bench/README.md`; frames land in `tools/bench/out/`. One render at a time.
- **app**: work on branch `claude/repo-audit-hero-lab-6ok9z8`, PR to `main`, squash merge, then
  reset the branch onto `origin/main` and force-push it. `npx tsc --noEmit` before every commit.
- Commit trailers: the `Co-Authored-By:` line and session link your own session prompt gives you
  (it names whichever model is running, and it changes when the model does — do not copy one from
  an old commit). Never put a model name in commit bodies or PR text. Kill bench processes by PID, never `pkill -f`.
- The sandbox has no egress to where2hang.ae, supabase.co or github.io. Supabase is reached through
  the MCP connector (SQL, migrations); GitHub through the MCP tools; anything that must reach the
  outside runs as a GitHub Actions workflow in the app repo.

### PLOT: STOP READING SHAPES OFF SCREENSHOTS

`plot.html` at the repo root, live at
`https://heinrichvanwyk101-lab.github.io/where2hang-hero-lab/plot.html?isle=yas`.

Yas Waterworld was moved five times and came back wrong five times, because every pass read a
shape off a screenshot: which way is north on that frame, how many metres is a pixel, is that
circle the wave pool or the lazy river. The owner drew the correct boundary by hand twice and it
still had to be converted by eye. This page ends that.

It draws ONE island straight from `data/isle-*.json` and `data/roads-*.json` as a plan — north up,
east right, through the same projection the world builds with. Tap to drop vertices; the table
gives their island-unit coordinates and the summary gives what a kit placement actually needs:
centre, length, width, the axis-aligned box for `KIT_ZONES`, and the `ROT` value already converted.

Two things worth knowing:

- **Heightless footprints are drawn in red.** Those are the ones the height model invents a tower
  for, so the "buildings standing on the water park" fault is visible on the page rather than
  inferred from a render.
- **Tap the broad end first.** A fitted axis has no head or tail; the first vertex decides which
  way the kit faces, so a tapering kit cannot land back to front. Getting that backwards is its
  own class of mistake and the page is built to prevent it.

Do not convert `ROT` by hand. A kit's `at(ax, az)` sends its local `+ax` to `(cos ROT, -sin ROT)`,
so for a long axis `(dx, dz)` in island units `ROT = atan2(-dz, dx)`. The page does it.

### THE BAKED OUTLINES ARE COARSER THAN THE BUILDINGS STANDING ON THEM

Found while fixing the Galleria promenade, and it is not an Al Maryah problem. `outline` in
`data/isle-*.json` is a heavily simplified ring — Al Maryah's whole west coast between z -8.8 and
8.3 is ONE straight chord 150 m long — while `buildings` are full-resolution surveyed footprints.
A chord cuts inside the arc it replaces, so a large footprint on a curved shore ends up hanging
over open water. The ADGM/Galleria podium (296 x 219 m, centre projecting to 24.5014 N 54.3886 E
against Google's Galleria pin at 24.5011 N 54.3885 — the building is right, the coast is not)
reaches x -44.4 where the drawn coast is at -38.4: forty metres of deck over the sea.

A corner-only point-in-polygon audit of every island counts big footprints crossing the outline —
Raha 14, Corniche 8, Reem 8, Maryah 2, Saadiyat 1, Yas 1 — and it UNDERSTATES, because a long
straight edge can cross an inward bulge with all four of its corners inside, which is exactly what
the podium does.

`maryahPromenade` works around it locally: the walk follows whichever of the outline and the
podium's own west face is further west, an apron fills the gap behind and a wall drops to the
water. That is a patch on one quay, not a fix. The real fix is a finer outline out of the bake, or
a rule that pushes the outline out to contain its own surveyed footprints — and either one moves
roads, beaches, palms and parked cars, since `insideIsle` reads the outline on every pass. Its own
task; do not fold it into a kit change.

### The 3D world: what changed this session

- **Off-map results (nav v223, app PR #40).** A search whose venues are all off the six islands
  sends the empty set with a count; the world steps back to the Abu Dhabi view with no pins.
- **The Walk at Al Seef (city v145).** Restaurant lane west of the Al Seef mall; `zoneMargin` per kit.
- **Saadiyat resorts named the right way round (city v146).** Jumeirah west, Park Hyatt east.
- **Shopfronts (city v147/148, nav v224).** `data/shopfronts.json` lists venues with a street-level
  frontage (from the app's `venues.frontage = 'shopfront'`). `kit.shopfront(name, colour)` builds a
  fascia with the name, an awning, a totem and a pavement glow in the brand colour; the nav's
  `addShopfronts(d, list)` hangs one on the nearest surveyed footprint's face toward the venue
  point (falls back to facing the nearest road). 34 placed, 29 on a face. Scaled up in v148 because
  a real-size sign is a dot from the place camera; v149 one size up again (15 m fascia, 13 m totem,
  17 m glow). Judged on `coordview maryah "" 70 34 2.4 -39.8 -14.8` day and night: the sign hangs on
  the Four Seasons podium face and the glow reads at night, but at the venue camera it is still a
  small mark. If the owner wants more, the next lever is a lit pin-foot at the pavement disc, not a
  bigger fascia. The red and green pools of light near lamp posts in night renders are the
  traffic-signal props, not shopfronts.
- **Camera for sets and clusters (nav v225).** `PITCH_CLUSTER 0.58` / `PITCH_VENUE 0.45` replace
  the landmark pitch for pins; a tight set is the steepest shot; the area rail frames the pins
  rather than the island; the second tap on a cluster lists only once `camSettled()`.
- **Yas Waterworld, third and final reading (world v327).** THE OWNER'S OWN CORRECTION SOLVED IT:
  "the buildings there must be incorrect". The survey carries a real water body at x -38..-26,
  z -38..-33 — the wave pool — ringed by the densest cluster of small HEIGHTLESS footprints on the
  island. Heightless is the signature of park structures (slide towers, kiosks, changing rooms):
  the height model, having nothing to read, invents a height and stands them up as ordinary
  buildings, and that scatter is what the owner circled. So the park is 150 m NORTH of where v324
  put it; the 38 footprints v324 read as the park are its entrance and car-park apron. The kit now
  centres on the lagoon at (-36, -31) and the zone spans x -56..-18, z -46..-2, which suppresses 44
  footprints, every one of them heightless — nothing real is hidden. Frames: `place-ww_top.png`
  (before) and `place-ww_top2.png` (after) at the same camera. **Awaiting the owner's confirmation
  on the phone.**
  **city v155 / world v328 — sized and turned to its plot.** v327 had it on the pools but still at
  its authored size: 260 m across on an east-west axis, while the ground between the survey's car
  park (east edge x -37.5) and the road at x -15 is 175 m wide by 218 m deep, the long way round.
  At full size it could only fit by lying across the car park, which the owner reported. The kit
  now takes `scale` and `rot`: called at (-26, -34) with 0.72 and a quarter turn, so its length
  runs with the plot and it covers about 130 x 190 m, inside the block on every side. Zone pulled
  in to match (x -40..-13, z -50..-16). Frame: `place-ww_top3.png`.
  **A TRAP THIS EDIT FELL INTO, worth knowing:** adding the scale by text-replacing expressions
  like `kitPalms(g, palms, 0.7)` hit FOUR other kits that share the same line, and the gate failed
  with "S is not defined" from cafeDelMar. Kit bodies in this file are full of identical
  expressions; scope any such edit to the function's own line range, and never trust a bare
  replace. The gate catches it, which is why it runs before every push.
  The two earlier readings, kept because each was wrong in an instructive way:
- **Yas Waterworld (world v324).** The v319 note read the OSM node at (-45.5, -21.4) as an entrance
  and pushed the kit east to (-4, -22), into the mall's road loop, which the owner saw as "on a
  road". The owner's satellite frames (7 Sept) show the park south of the Warner Bros car-park
  rows and north of Yas Street, 700 m west of the mall; the survey's 38 small footprints at
  x -67..-31, z -20..-5 are the park's own buildings. The kit now stands at (-47, -8), on those
  footprints and off every road. Frame: `tools/bench/out/kit-yasWaterworld.png`.

- **Al Maryah to the owner's Google frames (city v150 / world v326).** The Four Seasons (NW
  waterfront), the four ADGM towers on the west podium, Rosewood (SW) and the clinic were already
  on their surveyed records. Two things were not: Google's "The Galleria Al Maryah Island" is the
  466 x 113 m east block across the central street, which the fabric drew as a flat brown box,
  now `kit.galleriaEast` (cream body, roof deck, glazed spine, rooftop plant bars, two street
  porches); and the west quay between the hotels was bare sand, now `kit.maryahPromenade`: a
  paved strip on the surveyed shoreline, a glazed arcade along the podium's west face (Craft and
  BB Social are INSIDE the Galleria with their own doors on the water side, so their signs hang
  on that face), and Zuma as its own black-clad glass box with the bronze portal on the quay
  terrace, to the owner's photographs (city v152). Both zoned. Frames:
  `tools/bench/out/place-maryah3_top.png`, `place-maryah3_quay.png`, `place-maryah4_zuma*.png`.
  The survey's 296 x 219 m podium rectangle overhangs the shore at its south-west corner; the
  real podium is narrower there. Left as is for now.
  **city v153/v154, judged on `place-maryah5_hotels.png` and `place-maryah5_quay_dusk.png`:** the
  quay is a two-level terraced restaurant block following the shoreline under awnings with a
  pergola; Rosewood is a rectangular slab with a pale service band and stepped crown; the Four
  Seasons is faceted glass with two pale fins. v153 also recoloured Rosewood grey when the warm
  gold-lit tower in the owner's photograph is that one, so v154 restores the bronze glass it had
  carried since world v291; only the rectangular shape needed correcting.

  **A WRONG DIAGNOSIS, WRITTEN DOWN SO IT IS NOT REPEATED.** Every glass tower on Al Maryah renders
  near-black at dusk (`place-maryah5_quay_dusk.png`, `place-m154_dusk.png`). I first read that as the
  Four Seasons' dusk hex being darker than the rest of the file (0x1E2429 against 0x22–0x33
  elsewhere) and nudged it to 0x2A3644 in v154. **That is not the cause and the nudge changed
  nothing.** `applyLift` does honour a material's own `duskColor` for glass — `e.m.color.setHex(
  e.duskHex != null ? e.duskHex : ...)` — so the colour is being applied. They are black because at
  dusk the sun is low and behind them and the faces the camera sees are unlit; dark glass on an
  unlit face goes to near black. It is true of every kitGlass tower in the city, and the Corniche
  stock behind them reads fine only because it is catching the light. So this is a city-wide
  dusk-lighting question (a fill term, or a floor under glass albedo at dusk) that long predates
  v153, not an Al Maryah kit fix. The 0x2A3644 stays: inert, but consistent with the file.

  **Still to judge:** the terraces themselves are only a sliver at 330 units —
  look at them with `coordview maryah "" 200 90 4.3 -42 14`, and if they sit in the water pull
  `strip` in `maryahPromenade` one unit east. A close-up under 150 units puts the camera inside the
  towers and shows nothing; do not spend frames there.
- **Yas Waterworld zone (world v325).** The whole park slot is a kit zone now, so the survey's 38
  heightless park structures stop being invented as towers around the pools.

- **Destination pills (nav v227).** They were 30 px tall in 11 px caps with wide tracking, so
  "FOUR SEASONS ABU DHABI 12" made a bar wider than its own tower and three of them covered the
  middle of Al Maryah (owner, 7 Sept). Now 21 px in a 9.5 px face, tighter tracking, capped at
  132 px with an ellipsis, and `destLabel()` trims the trailing city name — every destination read
  "... Abu Dhabi" on a map that is entirely Abu Dhabi. It keeps the suffix when nothing else is
  left, so a destination actually called "Abu Dhabi" survives.

### The 3D world: open work, island by island (docs/VENUE-BUILDINGS.md has the detail)

1. Yas: Yas Plaza hotel cluster (four slabs, satellite is enough). Waterworld check above.
2. Al Maryah: kits exist; one render pass to close. Coya's coordinate was moved onto the Four
   Seasons kit; 49ers' coordinate is in the sea and needs fixing in the database.
3. Reem: Paragon Bay Mall podium (The Butcher Shop, New Shanghai) from the satellite.
4. Saadiyat: Park Hyatt and Jumeirah resort kits are generic; photos wanted from the owner.
5. Corniche: InterContinental Al Bateen (photos wanted), Mushrif Mall and Novotel Al Bustan
   (satellite), everything else accepted as generic fabric.
6. Raha: the mainland tenants land in water; the Raha strip needs widening to the shore.

### The app: what changed this session (all merged to main)

- Venue invitation email through **Resend** (`scripts/venue_invite_send.ts`, workflow
  `Venue invitations`, manual). The Gmail connector strips every `<img>`, so Gmail is only read.
  Graphics served from this repo's Pages origin, `email/`. Sender "The Where2Hang team".
- **Gate:** `venues.building_status` must be `modelled` or `generic` before a venue is invited;
  `venues.frontage` is `shopfront` or `inside`. Both set for the 58 audited venues.
- Nightly jobs: verify-venues (1,000 a night now the Places quota is 6,000), vibes, hours,
  triage-misses, harvest-contacts. Routine "Venue outreach inbox" (05:00 UTC) reads replies with
  Gmail + Supabase attached, drafts only.
- Nothing has been sent to any venue. The owner has not yet said "go". The first batch would be
  Coya, Stars N Bars, Café del Mar plus the generic-fabric venues with an address.

### Owner's standing decisions

- Emails only after the venue's building is agreed on a render; island by island; most popular
  first. Tenants are customised through their shopfront, if they have one (Coya is the model).
- No personal names in outreach. Keep the unreferenced images in the app repo.
- Vercel retention: 1 day previews, 7 days production.

### nav v176 — the temporal-dead-zone fix

Found by an audit reading this repo and the app repo together, reproduced in
isolation, then fixed. `WORLD_IDLE`, `attract`, `gfState`, `CULL_R` and `KEEP_R`
were each declared at their point of first use, hundreds of lines below the embed
bridge's `addEventListener('message')`. Three top-level `await flushPaint(...)`
calls sit upstream of those old sites, and each yields a frame back to the event
loop — so a host message arriving in that gap reached a binding whose declaration
statement had not executed yet. The handler's own `try/catch` turned the
ReferenceError into a `console.warn`, so the command was dropped silently and
nothing ever LOOKED broken.

`idle`/`wake` carried the live cost. The host had started calling it on route
changes, it landed in exactly that window, and the world kept rendering a full
scene behind every opaque page instead of stopping at `if (WORLD_IDLE) return`
in `frame()`. That is the mechanism behind "quite heavy, my phone doesn't really
like it".

All five moved verbatim to just above the listener, deleted from their old sites
rather than duplicated.

**THE RULE THIS PAID FOR:** a top-level `await` splits module evaluation, so
"nothing runs until the module has finished evaluating" is FALSE for anything
registered above one. Any new top-level `let`/`const` the embed bridge can reach
must be declared above the listener at ~line 2350, not at its point of first use.

Note the distinction against the comment in `world-nav.html` at line 2259
("Runs from a setInterval ... so there is no declaration-order risk"). That is
CORRECT for a `setInterval` — the first tick is a whole timer period away. It does
not extend to a message listener, which fires the moment the host speaks, and the
host speaks as soon as `post('ready')` goes out at ~line 2591 — some 3,700 lines
before module evaluation actually finishes at `frame()`.

---

**Everything below was written at `world v137 / city v34`; the repo now reads
`world v236 / city v95`.** Rather than leave a hundred versions of drift
unresolved, every item was walked through with Heinrich on 3 September 2026 and
marked. Two are done — see *Resolved since v137*. Four remain, and they are the
OPEN list at the bottom. The Yas Bay survey is kept as reference, not history:
the built band was extruded from it.

## THE ONE NUMBER THAT MATTERS

The `gf` row on the overlay now carries `b` for Yas — the land-use cell count.
Expect about `ya t14 g2 p29 b10500`.

  - **`b` present** → the bands are building. If they still do not appear it is a
    material or depth problem, a different hunt.
  - **`b` absent** → the block never ran; it is the guard, not the rendering.

## Yas Bay — what is established

59 surveyed pins. Sorted by distance to the baked coastline they fall into groups
with EMPTY GAPS between them — nothing between 40 and 46 m, nothing between 79 and
88 m — so these thresholds sit in space the data does not occupy:

    BEACH        outer 22 m of the shore band
    PROMENADE    22 to 43 m, paved
    DECK/GARDEN  43 to 83 m
    BUILT        beyond 83 m, PAINTED not extruded

Exception: the channel between the pier and the shore is quay wall, paved to the
waterline. Asia Asia stands 25 m out on hard standing, not sand. Without the
exception the whole marina edge came back as beach.

Surveyed plots, all closing as true rectangles:
  - **Pier71** 162 x 66 m, axis -77.55 deg, island (-33.55, 416.63). Diagonals 177
    and 172 against a predicted 175.
  - **Car park** 99 x 227 m, 2.25 ha. Diagonals 246 and 248 against 248.
  - **Hilton** centre island (-23.7, 388.7), long axis 11.8 deg from east. Eleven
    points give three rows: inland spine v +17..+25, inner mass v -5..-10, ARM TIPS
    v -21..-24 at u -89 and u +80. It is an E, not a bar.
  - Etihad Arena unchanged and correct.

Areas: built 8.72 ha, deck 3.58, promenade 3.38, beach 1.95.

**This survey is live reference, not a record.** The built band has since been
extruded from these figures (was OPEN 4). Redoing the survey is the expensive
part, so keep it with the geometry it produced.

## Rules this session paid for

- **A mesh needs dayMats, duskMats, planMats and `ground` — all four.** Nineteen kit
  materials declared two of them and appeared in some view modes and not others for
  the entire life of the kit. Fixed in city v34 at all four `mk()` helpers.
- **Ground features must go through `snapshotMats(g); registerLift(g); applyView(view)`.**
  v136 attached the bands straight to `yas.detail` and they drew NOTHING. Not broken —
  unregistered. No error, no warning, every other counter healthy. v137 moves them
  into `groundFeaturesFor` where the parkland lives.
- **Hiding a conflation merge deletes the site.** The four merges over this waterfront
  are 120,000 m2 and contain five, two, four and ZERO small footprints. Flatten them
  to a 6 m podium instead. A plot merge is the podium, not nothing.
- **Local +z is the sea** in the Hilton frame. Island z is the negative of bake y.
  Got backwards for a whole deploy; the wings reached inland across Yas Drive.
- **A drawing's north arrow is not evidence.** The corrected-footprint sheet had its
  arrow 90 degrees out — the numbered run reads top to bottom on the page and goes
  due EAST on the ground. Coordinates do not care which way the page is turned.
- **Draw before building.** Four drawing iterations found the mirrored hotel, the
  convex-hull overshoot and the wrong beach band before any code was written.

## Resolved since v137

- **Plan and Check hold colour.** Landmarks no longer drop out; the `city v34`
  fix at the four `mk()` helpers (all of `dayMats`, `duskMats`, `planMats` and
  `ground`) was sufficient on its own. `applyView` did NOT need opening up —
  the lead the old note pointed at was a dead end, worth knowing before anyone
  follows it again.
- **The built band is extruded.** 8.72 ha at Yas Bay is real mass with courtyards
  cut, built from the survey above rather than painted onto the ground.
- **The jetty is instanced** (`city v96`). 42 meshes and 42 geometries became 5
  and 5; 504 triangles unchanged. The old note was exactly right about the
  counts — 22 piles, 9 fingers, 9 cleats — and it was `yasBayJetty` in
  **w2h-city.js**, NOT the shore kit in w2h-world.js, which has been instanced
  for a while. Anyone re-reading this: check which jetty before acting.
- **The bench can draw InstancedMesh** as of the same pass. `render.mjs` read
  only `matrixWorld`, so it collapsed every instance onto one spot — instanced
  geometry rendered as a single copy and the bench silently disagreed with the
  scene. Fixed, and that is what made the jetty change verifiable by pixel
  comparison rather than by argument.
- **The grey islands are solved, and it was never a painting bug** (`world v237`).
  An island wears `matLandFlat` (0x424E58, dark blue-grey) on slot 0 until
  `buildGroundFor` replaces it with the painted canvas, and `matLandFlat` has no
  `userData.dayMats`/`duskMats` — so `applyView` had nothing to swap to. Only
  Corniche is `!pending`, so only Corniche was painted at load; the other five
  kept the grey. That is the whole of "one run correct, one run wrong": it
  depends purely on what has been built this session, not on any nondeterminism.
  The flat platform now takes the same untextured sand materials the painted
  ground is cloned from. **The lesson worth keeping: the symptom was a MATERIAL
  that was never swapped, not a CANVAS that was painted wrongly** — several
  rounds went into the painting code looking for a fault that was not there.
  Reading the two colours off the screenshot and matching them against the
  material table is what found it in one pass.

## OPEN

1. **Verify `b`.** Still the lead item — see THE ONE NUMBER THAT MATTERS above.
   Everything on the Yas ground bands waits on it.
2. **2,419 venues city-wide have no geometry** — no footprint over them and none
   within 25 m. 261 on Yas, 1,902 on Corniche. Agreed shape: one unit per venue but
   built as three or four shopfronts of jittered width under a shared canopy.
   The Corniche figure is the one that bites, since the embed opens on Corniche.
3. **The pier still reads as land** because OSM maps it as island — the four corners
   match the baked coastline to 4 m. Making it read as a deck over water means cutting
   the outline, which also feeds isleShape, isleCoast and groundPlan. **Not done
   silently; ask first.** Still deliberately unresolved, not merely undone.
