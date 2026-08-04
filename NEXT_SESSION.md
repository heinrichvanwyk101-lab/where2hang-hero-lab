# Next session — opening line

> Read the where2hang-hero-lab repo. Judge the Hilton in Day, then the Yas Bay jetty.

Nothing needs uploading. Files read from
`raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.
The GitHub **API** is rate-limited from the container's shared IP — use the
tarball (`codeload.github.com/.../tar.gz/refs/heads/main`) or raw file URLs.

**Read the repo before saying anything about what is or is not deployed.** Stamps
lie less than memory does, and this was got wrong more than once.

## Bench

```
npm i three
node preview.mjs w2h-city.js#ferrariWorld
node preview.mjs w2h-city.js#etihadArena
node preview.mjs w2h-city.js#yasBayPier
```

See `BENCH.md`. Use the `file#fn` form — it renders what actually ships, so the
geometry never exists in two places. Four views: plan, oblique, horizon, front.
The bench reads material colour and **ignores emissive**, so nothing about night
lighting can be judged there.

## Live at handover

`nav v94 / city v29 / world v130 / props v22 / basemap v9`

Bake is healthy on all five islands. Al Maryah restored after an Overpass 504
silently emptied it; `tools/bake-city.mjs` now refuses to write an island with no
outline and exits non-zero so the Action goes red.

## CLOSED — the two items from last session

**1. Yas Bay pier — the premise was wrong, not the placement.** It is not over
water. Four coordinates all land INSIDE the resampled outline: Asia Asia
24.458075/54.600032 (26 m from the coast), Waterfront View Point at the tip
24.456604/54.600592 (31 m), Hilton 24.459403/54.600993, Etihad Arena
24.460418/54.604002. Pier71 is a reclaimed promontory — the outline turns south
around it and nine baked footprints stand on it, largest 71 x 35 m. The bake has
been drawing it correctly all along; the hand-built deck was a second copy of the
same building dropped in the bay beside it. The seaward search was not broken, it
was working its way off the land the building occupies.

`world v130` removes the placement. `kit.yasBayPier` stays in the kit, unplaced.

Two things fell out of it:
  - **The capture scale was 25 per cent over.** The old header claimed 611 m from
    the centre to Etihad Arena; from the coordinates it is 452 m. Same rotated
    capture as the 519 m inland error. `city v29` applies 0.74 to x and z, so the
    span goes 194 x 149 -> 143 x 110 m. Heights untouched — they did not come off
    that image.
  - **`preview.mjs` could not bench anything taking `facing`.** The harness
    injected `x0` and `z0` only, so the `if (facing !== undefined)` guard threw a
    bare ReferenceError. `node preview.mjs w2h-city.js#yasBayPier` — the command
    printed in this file — could never have run. Fixed by declaring `facing`
    undefined, which is the form worth judging anyway.

**2. Parkland colour at dusk — the ratios are exact, so colour is not the fault.**
Audited all seven ground features against the v127 rule (day colour's per-channel
ratio to the day ground, applied to the dusk and night ground). Every shipped
value reproduces to the byte; worst error across the whole set is one unit on
circuit run-off at night. Nothing to fix in the palette.

What is left is the thing v127's own comment names and does not solve for
parkland: a horizontal surface at dusk takes grazing light from a sun thirteen
degrees up, so it goes dim whatever its albedo. `glow()` rescues the circuit kerb
and run-off with emissive at dusk and night. **Parkland gets no emissive at all**,
and it sits next to a circuit that does. If it still does not read after v129,
that is the asymmetry to close — not the colours.

Fritzing after v129 is untested here; polygonOffset is correctly spread onto all
four materials (base, dayM, duskM, planM), so if it persists the next suspect is
still the merged park geometry self-overlapping where OSM rings overlap.


**3. The Hilton coordinate found a systemic facade fault.** 24.459403/54.600993
lands on a baked footprint: 270 x 136 m, rot 13.6 deg, h 40 m, `vk:"dine"`. Ten
venues join to it — seven restaurants, two bars, a lounge — because the venue
dataset carries no lodging class anywhere on this waterfront. So the join had no
way to know it is a hotel, and a 40 m Hilton has been drawing as white render
with restaurant window spacing.

Not one building: **117 footprints over 6,000 m2 wear a restaurant facade**, the
worst 785 x 679 m with 143 venues joined — half a million square metres of mall
rendered as a diner. `world v131` guards it — above 2,500 m2 OR four joined
venues the vk is dropped and `typeOf(h)` reads the building's own mass instead.
2,500 m2 is about the 85th percentile of joined footprints, so roughly a fifth
change and the small ones keep the mechanism untouched.

## The Hilton — BUILT (city v30 / world v132)

Eleven surveyed points. Eight sit on the built mass — eforea spa (two), the
Emirates NBD ATM, Quag Rubi, Sofia, and three dropped pins. Three do NOT and were
excluded: Bayside Burger, Bua Thai and Grand Massage sit 80-90 m off the spine on
the beach side and are the waterfront F&B row. Including them swings the fit
square, which is the same failure shape as the pier's 143 m width.

  - **Plan from the eight:** centre bake (18353.4, -3428.1) m = island
    (-23.7, 388.7), long axis 11.8 deg from east, footprint 169 x 49 m. The bake's
    conflated box for the plot is at 13.6 deg — two independent sources, two
    degrees apart, so orientation is settled.
  - **Height derived, not guessed.** 545 rooms is the published figure. A 169 m
    spine, double-loaded, 4.4 m room module, less 15 per cent for cores and
    service = 65 rooms a floor. 545/65 = 9 guest floors. Ballrooms are on Floor 2,
    so two podium floors under them: **11 storeys x 3.6 m = 39.6 m**. The bake
    carries 40 m for this footprint from a source that knows nothing about room
    counts. Four tenths of a metre apart.
  - **Form:** podium 196 x 72 m at two storeys, guest spine 176 x 30 m at eleven,
    back wing 78 x 26 m at three over the stretch the spa and ATM points cover,
    pool deck to the beach side. Nine balcony bands, one per guest floor — the
    room description specifies floor-to-ceiling glazing with a balcony to every
    room, so the banding is sourced rather than styling.
  - **It goes through `built`,** so it takes a KIT_ZONE. This is the one Yas
    landmark that genuinely needed one: without it the hotel stands inside a
    270 x 136 m slab of its own forecourt.

Bench: `node preview.mjs w2h-city.js#hiltonYasBay` -> 229 x 87 m, 40 m, 5.8:1.

**Restaurants are one storey now.** 3.6 m, applied where the venue join says
dining AND the footprint is small enough that the venue IS the building — the same
two gates the facade uses, so nothing can be a restaurant for its walls and a
warehouse for its height. A surveyed height still wins. 350 of 1,445 dine
footprints drop; the rest already had a height or are too big to be one venue.

Caveat worth keeping: the masses are placed from a point ENVELOPE, not traced off
a plan. Wing lengths are the soft numbers. If a plan arrives, replace the table
rather than nudging it.

## OPEN — the pier

**The actual pier.** The jetty with the moorings, immediately alongside the
promontory. That one IS over water, the footprint pass does clip it, and it is
the only structure on this waterfront that genuinely needs hand-building. Much
smaller than `kit.yasBayPier` describes. Needs two coordinates, one per end.

**Pier71 as a landmark, or leave it to the bake.** If it is wanted as authored
geometry it goes on the promontory centre — bake (18325, -3617) m, island
(-27.3, 412.9) units — and it goes in KIT_ZONES so the nine footprints under it
are suppressed. Otherwise `kit.yasBayPier` can be deleted outright.

## What was built this session

- **Ferrari World** — measured PLAN table, tri-form with forked arm tips
- **Yas Mall** — built form, pyramid atrium, car decks
- **Etihad Arena** — surveyed 158x151 m footprint, gold shell, hipped roof,
  entrance recess and screen, corner light strips
- **Yas Bay pier** — white/cream built scheme, fabric canopy, gangway
- **Golf, circuit, parkland** as flat meshes from the bake
- **Venue-driven facades** — 10,420 venues joined to footprints by coordinate;
  2,063 buildings carry one and choose their facade from `vk` instead of a hash
- **Circuit floodlighting** — teal run-off, white kerbs, emissive at dusk/night

## Rules this session paid for

- **Verify winding by cross product, never by reading it.** The circuit ribbons
  faced the seabed for a whole deploy: every gate passed, gfState said `on`, and
  FrontSide culled the lot.
- **Do not parameterise a real building.** Four formulas, four starfish.
  Segment a clean plan and ship the table.
- **A coordinate beats any measurement off an image.** Two hand-registered
  literals were silently wrong. If a landmark needs placing, ask for a lat/lon.
- **Google draws the compass rosette only when the map is ROTATED.** Assuming
  north-up cost two rebuilds.
- **Never accept a symmetry-blind statistic as evidence about orientation.**
  A three-fold shape self-correlates at 0/120/240; 0.922 proved nothing.
- **Check both call sites.** The footprint bucket key is computed twice and the
  second was nearly missed, which would have written into unallocated buckets.
- **Re-audit after rebuilding from a stale base.** Two fixes were silently
  clobbered that way and caught only on a marker grep.
- **applyView reads dayMats off the MESH, not the material.** Every kit landmark
  declares it on the material; `snapshotMats` in world-nav.html promotes it.
  Ferrari World was never red in Day until that landed.
- **Six view modes, not four**: day, dusk, night, check, plan, sil. A mesh needs
  dayMats, duskMats, planMats and `ground` to behave in all of them. `nightOnly`
  is for things with no daytime existence — lamp pools, nothing else.

## Next, in order

1. The two open items above.
2. **Yas Viceroy / W Abu Dhabi** — the woven grid shell over the circuit, lit
   purple at night. It dominates every night photograph of Yas Marina and is
   currently just another footprint. Best remaining landmark candidate.
3. **Facade palette tuning** — the venue mechanism works; the six-bucket colour
   choice has not been judged against a deployed scene yet.
4. Emirates Palace, Etihad Towers, ADNOC — all still flagged as wrong.
5. Al Maryah `gf` reads `none`: its park rings fail the majority-inside test.
