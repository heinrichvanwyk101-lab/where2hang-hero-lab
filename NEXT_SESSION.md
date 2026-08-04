# Next session — opening line

> Read the where2hang-hero-lab repo. Check the `b` counter on the gf row for Yas,
> then carry on with Yas Bay.

Nothing needs uploading. Files read from
`raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.

**Read the repo before saying anything about what is or is not deployed.** This
was got wrong twice in the last session — three deploys were discussed as live
when the stamps said otherwise. Check `export const BUILD` in the raw files.

**Verify parse with the exit code, never through a pipe.**
`for f in *.js *.mjs; do node --check "$f" >/dev/null 2>&1 || echo "FAIL $f"; done`
`node --check | head` reports the PIPE's status and once shipped a syntax error live.
`preview.mjs` will not catch it either — the `file#fn` form lifts the function BODY,
so nothing above the opening brace is ever parsed.

## Handed over at

`nav v94 / city v34 / world v137 / props v22 / basemap v9`

**LAST CONFIRMED LIVE WAS world v136 / city v33.** v137 and v34 were handed over
but not verified deployed. First job: read the stamps.

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

## OPEN

1. **Verify `b`.** Everything else waits on it.
2. **Plan and Check** — landmarks should now hold colour. If Ferrari World still
   drops out, `planMats` was not the whole story and applyView needs opening up.
3. **The jetty is 42 separate meshes for 504 triangles** — 22 piles, 9 fingers,
   9 cleats, each its own draw. Should be three instanced meshes, about 5 total.
4. **The built band is painted, not extruded.** 8.72 ha of ground with the bake's
   footprints and the Hilton standing on it. Courtyards are not cut into the mass.
5. **2,419 venues city-wide have no geometry** — no footprint over them and none
   within 25 m. 261 on Yas, 1,902 on Corniche. Agreed shape: one unit per venue but
   built as three or four shopfronts of jittered width under a shared canopy.
6. **The pier still reads as land** because OSM maps it as island — the four corners
   match the baked coastline to 4 m. Making it read as a deck over water means cutting
   the outline, which also feeds isleShape, isleCoast and groundPlan. Not done
   silently; ask first.
