# The off-island clip — where it got to, and where it broke

> **10 September, later — RESOLVED IN PRINCIPLE, VERIFYING.** The before/after renders this file
> asked for were made: Al Raha and Zayed City, same camera, `main` against the reverted clipped
> bake. They are near-identical. **The clip and the road mend were sound.** The only regression was
> the half-extension of Rabdan's frame — a bare slab with a ruled edge beside Al Raha — and that is
> the "red piece of land" in the owner's annotated screenshot. The open question below is
> answered; the "first thread" hypothesis (parks and parking as fabric keep-out) was wrong.
>
> The owner then sent four satellite comparisons. Read against Overture's land polygons:
> - **Blue = Sas Al Nakhl Island** (Overture names it), between Zayed City and the Grand Mosque
>   exactly where the blue line was drawn. Our Rabdan ring is its southern tip; the rest is absent.
> - **Red = the same island half-drawn** by yesterday's frame stopping at 24.444.
> - **"Raha roads a mess"** predates the clip (screenshot 19:19 on the 9th, bake landed 16:20 UTC):
>   the painter gave every way a full verge/cycle/footway section per side, and the E10 corridor
>   has 22 carriageways in 1.25 km. **Shipped as world v343**: a side with another carriageway
>   within reach gets a strip, and a one-way minor is sectioned on its outer side only. Verified
>   with `tools/bench/closeup.mjs raha 1792 345 28 95 0.3` before/after; modest, not dramatic.
> - **"Buildings and roads encroaching on multiple islands"** is the live, *un*-clipped world.
>
> State: **SHIPPED.** The tool's Zayed frame is back to the original 20 points (9ee0078); a full
> bake of clip + mend + original frames was baked to `bake-preview`, rendered on all nine islands
> against `main` (pixel-diffed: all change is sea shimmer plus the intended road traces on Al Raha),
> `errcheck3` clean, and cherry-picked onto `main` (ec86cd8). The preview branch is deleted after
> each merge so the next preview bake cannot collide with a stale one. The bake workflow now takes a `branch` input for exactly this.
> **Sas Al Nakhl: DECIDED, NOT BUILT.** The owner's rule, verbatim: "Sas Al Nakhl is empty and must
> not be built. We're only building islands and areas that serve as venues to home." The drafted
> northward extension and the `fillAll` change were discarded, not parked. The rule is recorded at
> the frame in `tools/bake-city.mjs` and is the same one that defers Khalifa City.
>
> **CORRECTION — the blue patch was Rabdan's WEST edge, not the island to the north.** The owner:
> "Rabdan was the blue patch that was built wrong and should come up to the channel bordering Al
> Rawda." Rabdan's ground runs west past the ruled edge at 54.4900 to Khor Al Maqta at ~54.478;
> the frame now follows that channel at 54.4770 between 24.4376 and 24.4300 (7ee60c9), 280 m clear
> of Corniche's outline, +243 surveyed footprints, no venues. Baked to `bake-preview` (dfee7ee),
> rendered against `main` from a fixed camera (`closeup.mjs zayed 1330 540 260 300 0.3`, and the
> tip at `1085 497 70 130 0.3`): Rabdan now tapers west to the channel with its surveyed stock on it,
> clear water between it and the Corniche land, nothing else in frame moved. **SHIPPED** —
> cherry-picked onto `main`, `errcheck3` clean. One side effect to know about, not a loss of
> surveyed stock: the bake's footprint-area threshold divides by a display scale computed from the
> island's extent, the extent is measured from a pinned origin, so a one-sided extension widened
> Zayed City's extent from 6.61 to 7.90 km and the threshold rose from ~29 to ~37 m². 461 footprints
> under 37 m² (sheds; under 6 m a side, sub-unit at diorama scale) dropped out; the strip added 159.
> Bake count 7190 → 6882. The fetch box was unchanged (roadsInBox 1710, inBox 10675 in both bakes),
> so the strip's sparse roads are what OSM has there. The bake's `DAMP_P` is still 1/3 while the
> renderer's is 1, so that threshold no longer matches the drawn size on any island; a separate
> matter, noted, not touched. **Al Raha's two crescents** stay as land and, per the owner, are "left as desert
> sand": the roadless-landmass fill that invented mid-rise plots on them is no longer called
> (**shipped as world v344**; verified with `tools/bench/closeup.mjs raha 1799 279 40 110 0.3`
> before/after — eight invented blocks gone, nothing else in frame moved, `errcheck3` clean).
> Tools added today: `tools/bench/diorama-map.mjs`, `tools/bench/overview-labelled.mjs`.
>
> **10 September, 07:20 — the owner's three questions from the phone, answered from the data.**
> 1. *"That island between Rabdan and Al Raha still there?"* Between Rabdan and Al Raha lies Sas
>    Al Nakhl, and it is NOT built — never was beyond Rabdan's tip, and the half-frame that drew
>    part of it is gone. What the phone shows between Rabdan and the rest of Al Raha is Al Raha's
>    own western end (its mainland strip, Al Raha Mall and the Al Raha Beach Hotel), not an extra
>    island; the labelled overview at `tools/bench/out/overview-labelled.png` and the ring table
>    from `rings.mjs` (scratchpad) are how that was checked.
> 2. *"On Al Raha where there's buildings on the islands there's roads but not built?"* Correct,
>    and it was the painter, not the data: `paintGround` clipped every pass after the sand to
>    `plan.outline`, the FIRST coast only, so Al Raha's built islands (Al Bandar, Al Muneera, Al
>    Zeina and the rest: 300-odd footprints, 200-odd road ways) and Rabdan drew as bare sand under
>    their buildings. **World v345**: `pathOutline` adds every coast as a subpath, except a
>    landmass with under 400 m of surveyed road (fillRoadless's own test), which stays sand — that
>    keeps the owner's two crescents as desert. The middle bar between them carries a surveyed
>    track and a car park (1.2 km of way) and is painted as surveyed; say if it should be sand too.
> 3. *"This land mass where Fairmont Bab Al Bahr is located still cut?"* It was: Zayed City's west
>    frame edge at 54.4900 ran a ruled line down the east bank of Khor Al Maqta from 24.425 to the
>    Musaffah bridge, cutting 100-250 m off the Fairmont / Shangri-La shore and 500 m off Al Qana's.
>    The edge is now traced mid-channel (ed86808), baked to `bake-preview` (fd8041f): ring 0
>    20.42 → 21.48 km², 114 new shore vertices on that bank of which 7 lie on the frame line,
>    +128 footprints, +25 road ways, two more venues on the ground; extent unchanged, so no
>    threshold shift this time.
>
> **Later the same morning.** Owner: "Ok came through now" — the ten-minute Pages cache on the
> phone; basemap v28 / nav v245 fetch the index with the per-load key and the island files with
> the bake's `generated` stamp, so a bake shows the moment Pages serves it. **Tap wiring** (nav
> v246): a tap on Al Reem went to Corniche because every island's pick disc is 1.2 × its radius
> and Corniche's covers Reem and Maryah; the tap now takes the island whose coastline contains
> the point, else the smallest disc crossed. `tools/bench/tapcheck.mjs` proves it per island
> (note: at phone width the tilt button sits over Al Raha's west end in the overview, a separate
> layout nit). **Al Raha Beach Resort** (city v174): the flat slab became the crescent the
> satellite shows — eleven arc segments inside the 197.7 × 95.1 record, arcade on the court face,
> domed pavilion at the belly on the road, round tower at the west end, pool in the court, the
> 120.8 × 34.8 wing unchanged, the mall link shortened; cameras `closeup.mjs raha 1583 421 55 90
> 0.3` and `… 3.4`.
>
> **OPEN — the Etihad Airways HQ restaurant strip (task #72).** Owner: "many nice restaurants here
> and we haven't built this area. Iconic as well due to recognised Etihad buildings, especially at
> night." It is south of the E10 opposite Al Raha Mall (Khalifa City SE45: Fat Cow, Swaikhat,
> Pho 7). Overture window `data/probe/overture-raha-south.geojson` + `stock-raha-south.json`:
> 2,584 footprints in the strip (54.570–54.590 × 24.423–24.436) and 3,012 more in SE45 south of
> Dafrah St; the venue file has 142 venues in the box. **Why it is not simply a frame extension:**
> the four eastern districts (Yas, Al Raha, Masdar, airport) sit in the diorama pulled 733 units
> (5.7 km) WEST of their true position relative to Zayed City, which is at its true position
> (measured from the index extents against `DIORAMA`). Al Raha therefore sits directly north of
> Zayed City's ring with a 35-unit gap, and anything built south of the E10 in Al Raha's frame
> lands on top of Zayed City's north-east quarter. Building the strip means moving the eastern
> four east by at least ~470 units (or the full 733 to true position), then extending Al Raha's
> frame south to Al Masarat / Dafrah St and re-baking. That widens the overview composition; it
> is the owner's call and was put to them.

> Written on 10 September 2026, at the point of handing this over. Everything described here is in
> the tools; **none of it is in the shipped data**, which was reverted to `9d9e8df` after the owner
> reported the world looked worse on the phone. Re-running the bake reproduces the broken state, so
> do not re-bake until the open question below is answered.

## The original defect, which was real

The owner reported "on raha roads and buildings not aligning". Drawn flat by `tools/bench/plan.mjs`
beside a satellite view, the cause was not an alignment error at all: **the whole mainland street
grid south of the E11 was inside `isle-raha.json`, drawn over open sea.** Buildings had been
clipped to the island since the pre-clip was written; roads never had been. The two layers
disagreed about where Al Raha ends.

Nothing but buildings and water was ever clipped. Roads, paths, plazas, parks, parking, beaches,
golf, raceway and hard edges all shipped exactly as the fetch box returned them, and every fetch
box is far bigger than its island — Al Maryah's file carried 150 surface car parks of which 2 are
on Al Maryah, and 24 parks of which none are.

That diagnosis still stands. It was checked against ground truth, not inferred.

## What was built (all still in `tools/`, none of it shipped)

1. **`clipWaysToOutline` in `tools/bake-city.mjs`** — way-level clip at the buildings' existing
   `CLIP_MARGIN_M` of 150 m, applied to every unclipped layer. Way-level so bridges survive: the
   middle of a bridge is over water by definition, so cutting at the shore would delete every
   causeway in the city. Margin swept 40 m to 250 m first; the kept-way count moves 1–3 % on every
   island, so the threshold is not load-bearing.
2. **`mendBrokenEnds` in `tools/bake-city.mjs`** — the clip cut slip roads mid-span, because OSM
   splits a road at every junction and the middle of an interchange loop touches no land. The
   owner saw roads running out over the water and stopping, and confirmed from satellite that they
   "cross, turn and join again". Mends each kept way whose own end stops over open water, by the
   shortest route back to the network.
3. **`tools/frame-from-stock.mjs`** — two real bugs fixed. It read `isle.buildings`, empty since
   footprints moved to `fp-<id>.json`, so it rasterised nothing and reported "no buildings to
   trace". And its Moore boundary walk returned a two-vertex, 0.0 km² boundary on a complex blob
   *without erroring* — replaced with exact cell-edge chaining.
4. **`.github/workflows/overture-window.yml`** — exports Overture land/water for a window, and with
   `stock=true` the unclipped building centroids, committed to `data/probe/` because this sandbox
   has no outbound network. This is what made ground-truth comparison possible at all.
5. **Zayed City's landward edge** re-traced from that unclipped stock. The old edge was a ruled
   line through the densest part of Rabdan's own fabric, because the tracer read the *baked* island
   — already clipped to 150 m of the frame it was replacing — so each pass could only push the
   boundary out by the clip margin. "Converged after three passes" was the loop throttling itself.

## Three rules that were tried for the mend, and why two failed

Worth recording so nobody re-treads it. Restoring every dropped way lying on a bounded **cycle**
through the kept network put Al Maryah from 120 road ways to 271 — the mainland and Al Reem drawn
as grids over the water, because *a city block is a compact cycle*. Bounding the chord between the
cycle's attachment points still admitted 113 of the 152. Requiring the way to hug a kept
carriageway still admitted 33 and cost Al Raha 11 real slip roads. Restricting anchors to
on-island endpoints restored nothing anywhere, because a dropped way is separated from the island
by the kept way it hangs off.

The question "which dropped ways look like they belong?" has no answer that separates a slip road
from a city block. Sizing the repair to the **visible break** does.

## THE OPEN QUESTION — read this before re-baking

The owner's phone shows ground reading bare and brown where it was not, and **buildings standing
where roads are**, on several islands. The clip's own numbers do not yet account for that:

- The diorama layout is **not** it. Only Zayed City's radius moved, 423 → 438 scene units (3.5 %).
  Every other island's extent is byte-identical.
- The vertex-only area test is **not** it on Al Raha, at least. A large park polygon can overlap an
  island without any of its vertices coming near — the same flaw `clipWaterToOutline` was written
  to avoid — but measured on Al Raha, **zero** dropped parks cover island ground.
- `errcheck3` passes clean on the broken data: 9 islands, no holes, no bad materials, no errors.
  Whatever is wrong is not an error, it is an appearance.

**The first thread to pull.** Al Raha lost 40 parks → 19 (139 ha of park area → 21 ha) and 45
surface car parks → 9. Those are exactly the layers the ground painter and the `urbanFabric` filler
both read. If the filler treats parks and parking as keep-out and they are gone, it will fill that
ground with invented buildings — which would explain both "bare and brown" and "buildings where
there's roads" from one cause. **That is a hypothesis, not a finding.** It has not been tested.

The test to run: render the same district from `9d9e8df` data and from a re-bake, same camera, and
diff. `tools/bench/districtshot.mjs <id>` takes the shot; the data swap is
`git checkout <sha> -- data/`. That before/after is the measurement that was never made, and
skipping it is how this shipped broken.

## Two more reports, unresolved, recorded as given

These came in after the revert and were **not** diagnosed. They are written down verbatim because
guessing at them is how the earlier mistakes happened, and because the second one refers to work
somebody previously did that may have been undone.

1. **"You have several islands where we're now building buildings where there's roads."** More than
   one district. Not reproduced in a render; not attributed. The `urbanFabric` filler is the
   obvious suspect and the parks/parking hypothesis above is the obvious mechanism, but neither has
   been tested. NOTE the state this was seen in: it was the CLIPPED data, which is now reverted, so
   check whether it still happens on `9d9e8df` before assuming the clip caused it.

2. **"The red piece of land should not be built. Also the blue piece was meant to be reinstated."**
   Sent as an annotated screenshot of the world overview ("Abu Dhabi · 9 areas", Corniche card
   showing 1,636 venues). A red outline around an elongated, largely bare landmass running roughly
   north–south with sparse rectangular blocks on it, sitting west of a dense suburban district that
   has a large rectangular green park; a blue mark on the strip between that district and the one
   south of it. **I could not identify either shape with confidence from the perspective view and
   did not want to guess a third time** — ask the owner to name them, or use
   `tools/bench/diorama-map.mjs` (added for exactly this) to hold the layout against the
   screenshot. "Meant to be reinstated" suggests earlier restoration work, which is task #62,
   "Restore the missing land on Al Reem and Al Maryah".

## Where things stand

- `main` is at the reverted data and is safe to look at. `errcheck3`: 9 islands, no holes, no bad
  materials, no errors. Al Raha is back to 1,153 road ways, 40 parks, 45 car parks, 584 buildings.
- The bake is **not** safe to re-run until the open question is answered — it will reproduce the
  broken state exactly.
- Everything else in `tools/` and `.github/workflows/` is good and independent of this: the frame
  tracer's two fixes, the Overture window exporter, `plan.mjs`, `diorama-map.mjs`.

## What I would tell the next person to do first

Not more statistics. Three separate statistical tests earlier in this work each produced a
confident answer that was an artefact of the measure, and the thing that actually settled every
question was drawing our own data flat and putting it beside ground truth. So:

1. `node tools/bench/diorama-map.mjs`, and get the owner to name the red and blue shapes.
2. Shoot the same district before and after a re-bake with `tools/bench/districtshot.mjs` and diff
   the images. That is the measurement that was skipped, and skipping it is why this shipped.
3. Only then decide whether the clip needs the area-layer overlap fix, an `urbanFabric` change, or
   something else entirely.

## Standing constraints

`errcheck3` must pass before every world push. One bench render at a time; kill bench processes by
PID, never `pkill -f`. The world repo `main` is live to the public. No model identifier in commits,
PR text or any pushed artefact.
