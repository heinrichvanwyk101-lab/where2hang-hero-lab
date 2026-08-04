# Next session — opening line

> Read the where2hang-hero-lab repo. Build the bench, then do Emirates Palace.

Nothing needs uploading. Files read from
`raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.
The GitHub **API** is rate-limited from the container's shared IP — use the
tarball (`codeload.github.com/.../tar.gz/refs/heads/main`) or raw file URLs.

## Bench

```
npm i three
node preview.mjs w2h-city.js#ferrariWorld
```

See `BENCH.md`. Use the `file#fn` form — it renders what actually ships, so the
geometry never exists in two places.

## Live

`nav v89 / city v24 / world v116`, plus `w2h-districts.js`,
`data/city-reference.js`, `data/city-geography.js`.

## Done

**Ferrari World** — rebuilt four times. The answer: it is a TRI-FORM with three
arms at 120 degrees, and EACH ARM TIP FORKS into two thin horns. Benoy's "three
tri-form arms" and the five-or-six points visible in obliques are both true, and
every earlier attempt built one half of that. It now carries a measured PLAN
table segmented off the yasisland.com island plan.

Correlation proved the arm COUNT — secondary peaks at exactly 120-degree
intervals, which only a genuinely three-fold shape produces. It could not prove
the ORIENTATION, and for one revision it was wrongly treated as if it had: a
three-fold shape self-correlates almost equally at 0/120/240 (0.895, 0.868,
0.922 — noise), and the best was reported as validation. The building sat ~30
degrees out of true.

Orientation is now registered on the island's northern BAY, a deep asymmetric
notch, by a two-point similarity fit against the bake's own coordinates, which
agrees independently on scale to 4%. Arms land near compass 95, 210, 355.

**Yas Mall** — rebuilt to the BUILT form: symmetric about a north-south axis,
glazed pyramid over the central atrium, wings on axes and diagonals, six large
flat car decks. The widely-circulated night render with the huge circular finned
roof was never built; don't build to it. PROVISIONAL — proportioned from
photographs, not measured.

**The attachment** — the mall's north face meets the roof. Its own anchor gives
DIRECTION only; the distance is probed off the built roof. The 785 x 679 merged
Overture polygon covers Ferrari World plus attached retail, not the car parks,
so it is no longer the acceptance test — the full complex really is ~700 m and
the pair legitimately bounds ~1,200 m.

## The rule that came out of it

**Do not parameterise a real building.** Four attempts, four starfish, each
more confidently wrong than the last, because every one assumed a symmetry the
building does not have. Segment a clean plan and ship the table.

**Validate the segmentation against a second source.** The first table came from
a Google Maps capture and was silently corrupted — label text across the west
arm, and the closing that bridged it also swallowed red rollercoaster track,
inventing arms. Nothing in the render revealed that. Only a second independent
profile did.

**When prose and photographs disagree, suspect BOTH are partly right.** Benoy's
"three arms" and the obvious five-plus points were not in conflict; the arms
fork. Two revisions were lost to treating it as an either/or.

## Next, in order

1. **Emirates Palace** — worst remaining offender. Check its 25:1 against
   published dimensions AND against a plan capture before building to it.
2. Etihad Towers, ADNOC HQ — both flagged as wrong.
3. Missing: Grand Hyatt / Emirates Pearl, Qasr Al Watan, Burj Mohammed bin
   Rashid.
4. **Yas Mall** deserves a measured pass if a clean plan source turns up.
5. **The landmark registry** in `w2h-world.js` — a table row per landmark
   instead of hardcoded calls. Import path needs the `+ V` treatment through
   `opts`, same as `w2h-districts.js`.

## In flight — bake extended, not yet consumed

`tools/bake-city.mjs` now fetches `leisure=golf_course`, `highway=raceway`, and
parks as RELATIONS (the old query asked only for ways and the branch gated on
`el.geometry`, so every multipolygon park was dropped twice over — the largest
green area on Yas was 29 ha as a result).

Run the workflow and read the log line: `parks N (max NNha), golf N, raceway N`.
If Yas still tops out near 29 ha the parks are missing for another reason and
that must be found before writing the painter.

Then, in order: ground painting for the golf course and the circuit ribbon
(`w2h-world.js`), then Etihad Arena and Yas Bay as kit buildings. Etihad Arena
is buildable from a clean top-down: irregular octagon in plan, faceted sides
flaring outward to an overhanging roof, bronze-gold, big screen on the entrance
face.

## Not yet tried

`?vac` — the vacancy mask ships dormant. Load `?vac#debug` and read the two
counters on the fp row: `park` catches the lawn flood, `clash` counts real
buildings on cleared ground. Tuning is one number in `w2h-districts.js`.

Most likely fix: Al Maryah's empty half landing east instead of west. Negate the
comparison in its `zones` entry — `jx` is already in the island's frame.
