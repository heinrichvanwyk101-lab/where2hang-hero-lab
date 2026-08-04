# Deploy — districts pass

Five files, all paste-whole. Nothing to hand-edit.
Repo: `heinrichvanwyk101-lab/where2hang-hero-lab`
Stamps move to `nav v88 / world v114`. City and props unchanged.

---

## What this actually changes

Corrected after reading `hideFabric`. The scene draws **real footprints only** —
every island reads `/0v`, meaning zero generated-fabric meshes are visible. The
`fab55175` figure is captured the line *before* `hideFabric` and is a record of
what the footprints replaced, not a second city.

The ribbing you see is the **painted ground plan**, drawn from the generated
fabric's cells even though its buildings are masked.

| Change | Effect | Default |
|---|---|---|
| `sb` / plot size | Painted ground, road grid, prop placement. **This is the corduroy fix.** | ON |
| `FP_TALLEST` | Models heights for the ~83% of real footprints with no surveyed height | ON |
| `GEN_TALLEST` | None visible — those meshes are masked. Matters only if a payload fails | ON |
| Vacancy mask | Holds ground empty | **OFF — `?vac`** |

Precedence, unchanged by this pass: hand-built landmark beats real footprint
(`KIT_ZONES`), real footprint beats generated fabric (`hideFabric`).

---

## Commits

**1 — record only.** `data/city-reference.js`, `data/city-geography.js`,
`CITY_GAPS.md`. Nothing imports them. In the web editor type the full path
`data/city-reference.js` as the filename and the folder is created for you.
*Check: site identical.*

**2 — the module.** `w2h-districts.js` at repo root. Still unimported.
*Check: site identical, stamp still `world v113`.*

**3 — the engine.** `w2h-world.js` at repo root. `opts.districts` is still
undefined, so every lookup falls back.
*Check: stamp reads `world v114` and **the city must look exactly as it did**.
If anything moved, stop — the fallback path is wrong, and commit 4 would then
be changing two things at once.*

**4 — switch on.** `world-nav.html` at repo root.
*Check: stamp `nav v88 / world v114`. The city changes here.*

---

## Reading it

**Default load** — the grid changes, nothing empties.

| Island | Expected |
|---|---|
| Al Maryah | Big financial floorplates, wide gaps, ribbing gone |
| Saadiyat | Small villa plots on generous spacing, much lower |
| Yas | Very large footprints, wide gaps |
| Al Reem | Tower plots, coarser than Corniche |
| Corniche | Broadly as before — it was already tuned |

Watch `urbanFabric` in the stages block. It was 1091 ms; a coarser grid means
fewer plots, so it should drop. If it rose, something is wrong.

**Then load `?vac#debug`.** Two new counters on each fp row:

- **`park`** — lawn blobs emitted. `groundPlan` fills cell-free ground with
  parkland by design, so the mask has to suppress it there too. A jump means
  the suppression is not biting and that island is going green.
- **`clash`** — real buildings standing on ground the mask cleared. The zones
  are hand-placed guesses. Zero is ideal, small is cosmetic, large means a zone
  is in the wrong place.

Expected clearance on the park grid: Maryah 49%, Saadiyat 66%, Yas 60%. If
`park` is roughly flat against the default load, the suppression works.

Drop the flag to switch it off. No revert, no redeploy.

---

## Tuning — all in `w2h-districts.js`, no engine edit

- Too empty → raise `builtRatio`
- Speckled rather than block-shaped → raise `grain`
- Blocks wrong size → `sb` in `DISTRICT_FABRIC`
- One island misbehaving → set its `builtRatio` to 1.0 to disable that island alone
- **Al Maryah's empty half on the east instead of the west** → negate the
  comparison in its `zones` entry. `jx` is already in the island's own frame,
  so nothing needs rotating. This is the single most likely thing to need
  fixing: the island carries `rot: 0.30` and its outline orientation could not
  be verified from source.

---

## If it goes wrong

Revert one commit. 1 and 2 are inert, 3 is a no-op without 4, 4 is a few lines.
No state to unwind, bake untouched.

---

## Still open — `CITY_GAPS.md`

Water banding, mangroves, Al Lulu, the bimodal height distribution, and two
landmark lookups that miss (Gate Towers on Reem, Louvre on Saadiyat).

For bespoke landmarks: `KIT_ZONES[corniche.id]` is the only island initialised.
Saadiyat, Reem and Yas need that line adding before their first hand-built
model, or it will interpenetrate the OSM box exactly as ADNOC did.

---

# Addendum — Ferrari World

Stamps now `nav v89 / city v17 / world v115`. Three more files, all paste-whole.

| File | Path |
|---|---|
| `w2h-city.js` | `w2h-city.js` — adds the `ferrariWorld` builder |
| `w2h-world.js` | `w2h-world.js` — places it on Yas, opens `KIT_ZONES[yas.id]` |
| `world-nav.html` | `world-nav.html` — stamp only |

Order: city, then world, then nav. The world file guards on `kit.ferrariWorld`,
so pasting it before the city file degrades to no landmark rather than an error.

## The model

- **669 m span, 70 m peak**, 9.5:1 — the ratio the reference measures off the
  captures. Peak is 9.0 units because the Yas anchor already declared `h:9`, so
  the label sits where the roof is.
- **Five swept points.** The angular offset grows with radius, which is what
  curves them. Without that term it reads as a sheriff's badge.
- **Black rim as its own material group**, not a second mesh. Solid red at
  distance is a blob; the dark edge is what gives the star an outline.
- Oculus ring and deck, because a roof with a hole in it shows sea through the
  middle and stops reading as a building.

Built to the existing anchor rather than to a new coordinate, so nothing new
was invented that could disagree with the label.

## What to check

1. **`yas z1` on the fp row.** Yas showed no `z` field before. It should now
   read `z1` or similar — that is the flat OSM box being dropped underneath the
   model. **If `z` is absent, the zone missed and there are two Ferrari Worlds
   in the same ground, one of them a slab.** That is the single failure this
   change can produce.
2. Roof reads as a red star from above, and as a low red wedge from the horizon.
   Both must work; a shape that only works in plan is a logo.
3. `yas 3938>3925` should drop by whatever `z` reports.

## Why this matters beyond Yas

`KIT_ZONES[corniche.id]` was the only list initialised, because Corniche was the
only island with a kit. Saadiyat and Reem still are not. The Louvre and the Gate
Towers will hit this in exactly the same shape — model and OSM box in the same
ground — and the fix is the one line this block adds for Yas.
