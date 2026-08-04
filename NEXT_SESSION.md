# Next session — opening line

> Read the where2hang-hero-lab repo. Build the bench, then do Emirates Palace.

Nothing needs uploading. Files are readable from
`raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.
Note the GitHub **API** is rate-limited from the container's shared IP; use the
tarball (`codeload.github.com/.../tar.gz/refs/heads/main`) or raw file URLs.

## Bench

```
npm i three
node preview.mjs w2h-city.js#ferrariWorld
```

See `BENCH.md`. Use the `file#fn` form — it renders what actually ships, so the
geometry never exists in two places.

## Already live — do not re-paste

`world v116`, `city v19`, `w2h-districts.js`, `data/city-reference.js`,
`data/city-geography.js`.

## Done

Ferrari World rebuilt from published dimensions. Three arms, not five; 681 m
across at 48 m, 13.4:1 instead of 5.6:1. Verified on the bench in all three
views. `data/city-reference.js` corrected — the entry it had been built to was
wrong about the arm count, the span and the ratio.

## Next, in order

1. **Emirates Palace** — the worst remaining offender, and judgeable against the
   captures directly. Reference says 25:1; check that against published
   dimensions before building to it, the same way Ferrari World's 9.5:1 turned
   out to be invented.
2. Etihad Towers, ADNOC HQ — both flagged as looking wrong.
3. Missing entirely: Grand Hyatt / Emirates Pearl, Qasr Al Watan, Burj Mohammed
   bin Rashid.
4. **The landmark registry** in `w2h-world.js` — a table row per landmark
   instead of hardcoded calls, so adding one is a file plus a row. Import path
   needs the `+ V` treatment through `opts`, same as `w2h-districts.js`.

## Not yet tried

`?vac` — the vacancy mask ships dormant. Load `?vac#debug` and read the two
counters on the fp row: `park` catches the lawn flood, `clash` counts real
buildings on cleared ground. Tuning is one number in `w2h-districts.js`.

Most likely fix: Al Maryah's empty half landing east instead of west. Negate
the comparison in its `zones` entry — `jx` is already in the island's frame.

## The thing worth remembering

Ferrari World passed every numeric check written for it and came out a starfish,
then turned out to be built to a reference that was confidently wrong. Numbers
describe size, only looking describes shape — and a written specification is
only as good as the source it came from.
