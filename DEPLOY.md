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

# Addendum — Ferrari World + Yas Mall

Stamps `nav v89 / city v17 / world v115`.

| File | Path |
|---|---|
| `w2h-city.js` | `w2h-city.js` — adds `ferrariWorld` and `yasMall` |
| `w2h-world.js` | `w2h-world.js` — places both, opens `KIT_ZONES[yas.id]` |
| `world-nav.html` | `world-nav.html` — stamp only |

Order: city, then world, then nav. The world file guards on both kit functions,
so pasting it first degrades to no landmarks rather than an error.

## Built as a pair, because they touch

The reference obliques show one complex, not two buildings. The mall's eastern
edge runs into the roof's western points. Modelling one and leaving the other a
flat OSM box would look worse than leaving both flat — a shaped roof beside a
grey slab draws the eye to the slab.

## Sized to the anchor gap, not to true metres

This is the compromise worth knowing about. The two anchors sit **20.9 units
(163 m)** apart; the real buildings are about 550 m centre to centre. The
anchors were placed for label legibility and checked against the coastline, so
moving them risks putting something in the water for a cosmetic gain.

A true-scale roof would reach **24 units past the mall's centre** and swallow
it. So the pair is built to abut at the gap it has: Ferrari's west reach 10.5 +
mall half-length 8 = 18.5 against 20.9. Verified, no interpenetration.

The complex reads correctly relative to itself, which is what the eye checks,
and small relative to the island, which almost nothing checks. The diorama
already compresses buildings ~2.6x against the ground — Emirates Palace is
384 m for a real 1,000 — so this is the established direction, further along.

**If the anchors ever move apart, both sizes grow together.** Two constants.

## The roof, corrected against the references

- **Asymmetric**, longest point 1.53x the shortest. Five equal points is the
  tell of a generated shape; the real roof has one long western point.
- **Flat** — 7.6:1 span to height, 202 m by 27 m. Every instinct says lift it
  and every photograph says do not.
- **Three-tone edge**: red top, thin pale stripe, black underside. One geometry,
  three material groups, so they cannot drift apart.
- **Gold shield** on the long western flank. Legible from further out than the
  point geometry is.
- Oculus funnel and deck, so you cannot see sea through the middle.

Yas Mall is eleven boxes at stepping heights with a pale skylight ridge and
dome, plus car decks west. A mall rendered as one clean rectangle is what makes
a generated city look generated.

## What to check

1. **`yas` should show a `z` field on the fp row** — it had none before. Expect
   `z2` or thereabouts: the two flat OSM boxes being dropped underneath.
   **If `z` is absent, the zones missed and there are duplicates in the same
   ground.** That is the one failure this change can produce.
2. Red star reads from above **and** as a low red wedge from the horizon. A
   shape that only works in plan is a logo.
3. Ferrari World and the mall should abut without interpenetrating.

## Still no zone list

Saadiyat and Reem. The Louvre and the Gate Towers will hit this identically.
