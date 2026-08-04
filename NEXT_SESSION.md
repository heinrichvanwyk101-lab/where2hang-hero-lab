# Next session — opening line

> Read the where2hang-hero-lab repo. Commit the bench, then fix Ferrari World's
> proportions.

Nothing needs uploading. Files are readable from
`raw.githubusercontent.com/heinrichvanwyk101-lab/where2hang-hero-lab/main/<path>`.

## Commit these first

| File | Path |
|---|---|
| `bench/render.mjs` | `bench/render.mjs` |
| `bench/preview.mjs` | `bench/preview.mjs` |
| `bench/README.md` | `bench/README.md` |
| `CITY_GAPS.md` | `CITY_GAPS.md` (replaces existing) |

`bench/` is a dev tool. It never loads in the browser and cannot affect the
scene.

## Already live — do not re-paste

`world v115`, `city v17`, `w2h-districts.js`, `data/city-reference.js`,
`data/city-geography.js`. Verified on `main`.

## Not yet tried

`?vac` — the vacancy mask ships dormant. Load `?vac#debug` and read the two
counters on the fp row: `park` catches the lawn flood, `clash` counts real
buildings on cleared ground. Tuning is one number in `w2h-districts.js`.

Most likely fix: Al Maryah's empty half landing east instead of west. Negate
the comparison in its `zones` entry — `jx` is already in the island's frame.

## The thing worth remembering

Ferrari World passed every numeric check written for it and came out a
starfish. Numbers describe size. Only looking describes shape.
