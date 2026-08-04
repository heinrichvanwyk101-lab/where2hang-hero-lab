# CITY GAPS v2 — measured

Supersedes v1, which was inferred from bake logs. This version is measured
against `w2h-world v61`, `world-nav v63` and a world-zoom debug capture
(`nav v87 / city v16 / world v113 / props v22`).

Companions: `data/city-reference.js` (how it looks), `data/city-geography.js`
(where things are).

---

## The headline

**Real data is 17.2% of the built mass. The generated fabric is what you see.**

```
fp  corn 20262>20236/3460r  fab55175   hid135/0v
    mary  104>102/28r       fab1686    hid67/0v
    reem  179>174/56r       fab8654    hid71/0v
    saad 1842>1841/500r     fab29065   hid81/0v
    yas  3938>3925/32r      fab31957   hid79/0v
```

| Island | Real footprints | Generated fabric | Real share |
|---|---:|---:|---:|
| Corniche | 20,236 | 55,175 | 26.8% |
| Al Maryah | 102 | 1,686 | 5.7% |
| Al Reem | 174 | 8,654 | 2.0% |
| Saadiyat | 1,841 | 29,065 | 6.0% |
| Yas | 3,925 | 31,957 | 10.9% |
| **Total** | **26,278** | **126,537** | **17.2%** |

Stage 3a landed, but it did not replace the fabric — it added to it. Al Reem
is 98% invented. Improving the *generator* therefore returns more than
improving the *data* on four islands out of five.

**Roads: `corn 10664`, all others `gen`.** Stage 2 reached one island.

---

## Gap 1 — every island is 100% built, and identical

The plan views show a uniform waffle covering all five islands edge to edge.
Two causes, both in `w2h-world.js`.

### 1a. One block size for the whole archipelago

```js
const SUPERBLOCK_M = [200, 130];   // line 1585
const PLOT_FRONT_M = [30, 46];     // line 1592
const PLOT_DEPTH_M = 34;           // line 1593
```

No district entry in `DISTRICTS` carries an `sb` override. `urbanFabric` reads
`d.sb ? d.sb[0] : SUPERBLOCK_M[0]` — the hook exists and is unused on all five.

**Fix:** populate `sb`, plot front and plot depth per district.

| Island | `sb` | plot front | plot depth | Why |
|---|---|---|---|---|
| Corniche | `[200, 130]` | `[30, 46]` | 34 | Keep. The emphatic Markaziyah grid is correct. |
| Al Maryah | `[320, 220]` | `[90, 140]` | 90 | Financial. Bake returns **102** buildings for the whole island — that is the real count, not a failure. Huge floorplates, few of them. |
| Al Reem | `[240, 160]` | `[45, 70]` | 45 | Towers on big plots at Shams; villa curls at Reem Hills. |
| Saadiyat | `[280, 200]` | `[22, 34]` | 26 | Low-rise villas and resorts on generous plots. |
| Yas | `[420, 300]` | `[120, 260]` | 140 | Ferrari World, Yas Mall, SeaWorld. Enormous single footprints and car parks. |

### 1b. Vacancy is 10% uniform noise

Line 4642, inside the plot loop in `urbanFabric`:

```js
if (rnd() > 0.90) continue;   // the occasional cleared plot
```

That is the only mechanism holding ground empty. `avoid` rectangles exist but
reserve landmark ground only, and the comments at 1270 treat the resulting
void as a defect to be filled.

Real Abu Dhabi, measured off the satellite captures: **built mass is roughly
25% of land area.** The rest is sand carrying finished infrastructure — kerbs,
roundabouts, lamp standards, planted medians — with nothing behind them. That
condition is the city's signature and it is currently absent everywhere.

**Fix:** a deterministic per-district vacancy mask, tested at the same point.
It must be geometric, not random — a `rnd()` call there would move the stream
and break the mass/detail identical-city contract flagged at line 1322. A pure
function of `(jx, jy)` is safe at any position in the loop.

Target vacancy by island, from the captures:

| Island | Built | Vacant | Where the voids sit |
|---|---:|---:|---|
| Corniche | 55% | 45% | Al Bateen airfield, Mina Zayed yards, the park chain |
| Al Maryah | 50% | 50% | **The entire western half.** Hard edge, towers to sand. |
| Al Reem | 55% | 45% | Reem Hills terraces, Najmat south-east |
| Saadiyat | 35% | 65% | SDE/SDW sectors, Marina District, golf, beach |
| Yas | 40% | 60% | Yas North, Yas Bay interior, parcels ringing the attractions |

Al Maryah is the cheapest and most striking: one half-plane test against the
island's local axis. The glass-stops-sand-starts edge is one of the most
recognisable sights in the city.

---

## Gap 2 — the height table overshoots the low islands

Line 4932: `tallest = { corniche:52, maryah:40, reem:44, saadiyat:14, yas:18 }`
at `M_PER_UNIT = 7.8`.

| Island | units | metres | real tallest | over by |
|---|---:|---:|---:|---:|
| Corniche | 52 | 406 | 381 (Burj MBR) | 6% |
| Al Maryah | 40 | 312 | ~200 | 56% |
| Al Reem | 44 | 343 | 292 (Sky Tower) | 18% |
| **Saadiyat** | 14 | **109** | **~55** | **99%** |
| Yas | 18 | 140 | ~105 | 34% |

Corniche is right. Saadiyat is double. Suggested: maryah 26, reem 38,
saadiyat 8, yas 14 — Corniche unchanged.

Separately, `buildingSpec` derives `h` from a falloff curve times `hRoll^2.2`,
which produces a **smooth ramp**. Real Abu Dhabi is **bimodal**: a dense
6–12 storey field with roughly 4% towers. Same building count, entirely
different city. Parameters are in `city-reference.js` → `DENSITY`.

---

## Gap 3 — the archipelago is missing its foreground

**Al Lulu is absent.** Not in `DISTRICTS`. It is 4.5 km long, sits ~600 m off
the Corniche, and in any seaward view is the first landmass the eye meets. It
is also entirely unbuilt, so it needs an outline and road geometry and no
fabric at all — the cheapest character win available, and it exercises the
vacancy mask at 100%.

Geometry in `city-geography.js` → `ISLANDS.alLulu`.

**Mangroves are absent.** The single most identifying landscape feature in the
region. Jubail, Saadiyat west and north, Yas west, Reem east. Parameters in
`GROUND.mangrove`. Rule: draw the channels first, let the vegetation be what
remains.

**Water is flat.** Near-black with a noise texture. `PALETTE.waterRamp` gives
seven stops. Two specifics worth the effort: the ~600 m pale turquoise band
between the Corniche and Al Lulu, and the hard straight edges of dredged
channels cutting across soft natural shallows.

---

## Gap 4 — two landmark anchors still miss

`marks corn 5/5* mary 3/3* reem 1/2 saad 3/4* yas 5/5*`

- **Al Reem** — Gate Towers declared, does not resolve
- **Saadiyat** — Louvre Abu Dhabi declared, does not resolve

Both are Overpass lookup failures in `tools/bake-city.mjs`, not naming errors
in the district table. Capital Gate and ADNEC were dropped from the Corniche
declarations at some point and are no longer requested.

---

## Order of work

1. **Per-district `sb` / plot table** (1a) — five lines of data, largest visual
   return of anything on this list. Each island stops being Corniche.
2. **Vacancy mask** (1b) — one function, one call site. Start with Al Maryah's
   half-plane, which is a single test and immediately recognisable.
3. **Height table + bimodal distribution** (Gap 2) — parameter change, then a
   change to the `h` curve in `buildingSpec`.
4. **Al Lulu** (Gap 3) — one district entry, vacancy 100%.
5. **Water ramp** (Gap 3) — painter change, no geometry.
6. **Mangroves** (Gap 3) — new geometry, largest job here.
7. **Landmark lookups** (Gap 4) — bake script, independent of everything else.

Items 1–4 are data and one small function. They are where the city stops being
five copies of the same place.

---

## Note on stage 3

`fab` outnumbering `fp` 5:1 means replacing the generator with real footprints
would be the complete fix — but only Corniche has enough real data for that to
work, and even there it is 27%. Improving the generator serves all five islands
now; more footprint data serves one. Worth doing 1–4 before returning to
stage 3b.
