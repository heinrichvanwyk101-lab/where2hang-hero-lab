# Next session — opening line

> Read the where2hang-hero-lab repo. Fix the Yas Bay pier and the parkland at dusk.

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

`nav v94 / city v28 / world v129 / props v22 / basemap v9`

Bake is healthy on all five islands. Al Maryah restored after an Overpass 504
silently emptied it; `tools/bake-city.mjs` now refuses to write an island with no
outline and exits non-zero so the Action goes red.

## OPEN — the two things to fix first

**1. The Yas Bay pier still is not visible.** Placed in `w2h-world.js` from the
surveyed coordinate 24.457964, 54.600196 (Asia Asia, which stands on it),
converted through the bake's projection to island (-36.4, 406.4), then pushed
seaward until outside the outline and 55 m clear — about 100 m out. Two earlier
attempts were worse: one measured off a rotated Google capture landed it 519 m
INLAND, buried. Verify in this order:
  - is `kit.yasBayPier` reached at all — the block sits inside the Yas kit guard
  - does the seaward search find a point, or does it hit the `console.warn`
  - is `GROUND - 0.45` right, or is the deck under the water plane
  - render it alone on the bench first; it builds fine there

**2. Parkland at dusk: fritzing, and colour not reading.** The fritzing is
z-fighting and `world v129` should fix it — the features sat 3-14 cm above the
island top and one depth step at the district camera is 5.2 METRES, so they were
100x below precision. v129 adds polygonOffset to every ground-feature material.
**If it still fritzes after v129, that diagnosis was wrong** and the next
suspect is the merged park geometry overlapping itself where OSM rings overlap.

The colour question is separate and may already be fixed by v127, which derives
each feature's dusk and night values from its per-channel ratio to the island
ground (0xD8D2C4 day / 0xC6B99E dusk / 0x68737E night) instead of eyeballing them.

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
