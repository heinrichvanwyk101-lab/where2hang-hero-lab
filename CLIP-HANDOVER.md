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
>   the painter gives every way a full verge/cycle/footway section per side, and the E10 corridor
>   has 22 carriageways in 1.25 km, oneway pairs 6–27 m apart. Painter task, separate.
> - **"Buildings and roads encroaching on multiple islands"** is the live, *un*-clipped world.
>
> State: the tool's Zayed frame is back to the original 20 points (9ee0078); a full bake of clip +
> mend + original frames is on branch **`bake-preview`** (ec86cd8) — every extent and landmass
> identical to `main`, roads clipped — and is being rendered island by island against `main`
> before it is fast-forwarded. The bake workflow now takes a `branch` input for exactly this.
> The Sas Al Nakhl frame is drafted and tested against Overture water (north edge in water along
> its full length; west edge in Khor Al Baghal 200 m off Corniche's outline) and staged as a patch
> together with dropping `fillAll` on Zayed City so the island's sand is not filled with generated
> city. Awaiting the owner's go. Tools added today: `tools/bench/diorama-map.mjs`,
> `tools/bench/overview-labelled.mjs`.

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
