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

`nav v89 / city v22 / world v116`, plus `w2h-districts.js`,
`data/city-reference.js`, `data/city-geography.js`.

## Done

**Ferrari World** — rebuilt three times before it was right, and the third
rebuild is the one worth reading. It is now a MEASURED PLAN table, segmented off
an overhead capture and sampled every 5 degrees from the funnel, not a formula.
700 m across at 48 m. Validated two ways: the funnel measures 106 m against a
published 100, and the same scale puts the Ferrari logo on its surveyed spot.

**Yas Mall** — rebuilt as a long irregular sprawl in real metres, ~380 x 215 m,
flush skylights, flanking car decks. PROVISIONAL: authored from photographs, not
measured. It has no map highlight to segment, and satellite tones run its roof
into the parking aprons.

**The attachment** — Overture returns the two as ONE merged polygon of
785 x 679 m. The mall tucks into a valley and presents its long flank. Its own
anchor is untrustworthy for distance (184 m — a label node inside the merged
complex), so `w2h-world.js` uses it for DIRECTION only and probes the built roof
for the distance. Pair now bounds 734 x 753 m.

## The rule that came out of it

**Do not parameterise a real building.** Three formulas produced three
starfish, each more confidently wrong than the last, because all three assumed a
symmetry Ferrari World does not have — its arms sit at 30, 97, 30, 87 and 115
degree spacings with a 2:1 length spread. Segment the plan and ship the table.

And: **prose loses to photographs.** The three-armed version came from Benoy's
published "three tri-form arms", which describes the enclosed arms, not the roof.
That cost a whole revision in a workflow built specifically to prevent it.

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

## Not yet tried

`?vac` — the vacancy mask ships dormant. Load `?vac#debug` and read the two
counters on the fp row: `park` catches the lawn flood, `clash` counts real
buildings on cleared ground. Tuning is one number in `w2h-districts.js`.

Most likely fix: Al Maryah's empty half landing east instead of west. Negate the
comparison in its `zones` entry — `jx` is already in the island's frame.
