# Next session — opening line

> Read this file, then `docs/VENUE-BUILDINGS.md` in the app repo, then the task list below.
> Check the four `BUILD` stamps in the raw files before saying what is live.

Files read from `raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.
App repo: `heinrichvanwyk101-lab/Where2hang` (Next.js 16, Supabase project `wwexhlwnvqvkbzccxctt`).

## Handed over on 7 September 2026

Stamps at hand-over: `nav v225 / city v149 / world v323 / props v31 / basemap v21`. Verify with
`grep -n "BUILD = \|B_NAV = " w2h-city.js w2h-world.js world-nav.html`.

### How work flows (both repos)

- **hero-lab** (this repo): edit, bump the stamps (`city vNNN` in w2h-city.js, `world vNNN` in
  w2h-world.js, `nav vNNN` in world-nav.html), run `node tools/bench/errcheck3.mjs` (3 to 6 min,
  needs `errors: 0` and no bad materials), push straight to `main`. GitHub Pages deploys in about a
  minute. Renders: `tools/bench/README.md`; frames land in `tools/bench/out/`. One render at a time.
- **app**: work on branch `claude/repo-audit-hero-lab-6ok9z8`, PR to `main`, squash merge, then
  reset the branch onto `origin/main` and force-push it. `npx tsc --noEmit` before every commit.
- Commit trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and the session link.
  Never put a model name in commit bodies or PR text. Kill bench processes by PID, never `pkill -f`.
- The sandbox has no egress to where2hang.ae, supabase.co or github.io. Supabase is reached through
  the MCP connector (SQL, migrations); GitHub through the MCP tools; anything that must reach the
  outside runs as a GitHub Actions workflow in the app repo.

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
- **Yas Waterworld**: the owner reports it "still in the wrong position and on a road". The kit
  stands at (-4, -22) by the v319 note (east of the OSM entrance node at (-45.5, -21.4), clear of the
  car-park lot). `tools/bench/venueprobe.mjs`-style measurement shows 12 minor/local road segments
  crossing the kit's box at z -34..-39 (the entrance roads). Decide with a `kitview yas
  yasWaterworld 760 380 2.4` render against the satellite; the truth is that the park lies west of
  the mall's west car park, slides on the south side. Do not move it back onto the entrance node.

  Rendered 7 Sept (`tools/bench/out/kit-yasWaterworld.png`): the kit sits north of Warner Bros
  World and west of the mall, which is right, but the survey's minor service roads inside the park
  are painted straight through it. KIT_ZONES suppress footprints and fabric only, never painted
  roads (`paintGround`), so the real fix is a road-free zone honoured by the road painter for this
  kit; nudging the kit only hides it.

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
