# The headless bench

A dev tool. It never loads in the browser, nothing in the scene imports it, and it cannot affect
what GitHub Pages serves. `render.mjs` and `preview.mjs` sit at the repo root only because that is
where they were already committed; they work equally well moved to `bench/`.

## What it is for

Every landmark in `w2h-city.js` was authored blind. Ferrari World was built to a written
specification, checked against every number in that specification, passed all of them, and came
out a starfish — because the specification said "five-point star" and the real building has three
arms. No amount of arithmetic could have caught that.

The bench closes the loop: it builds the real three.js geometry in Node, projects it, and
rasterises it to PNG so the shape can be **looked at** before anything reaches the repo.

## Running it

```
npm i three
node preview.mjs w2h-city.js#ferrariWorld
```

Writes `ferrariWorld-plan.png`, `-oblique.png`, `-horizon.png` and prints measured span, height,
ratio and a `FOOT` line for `KIT_ZONES`.

The three angles are not decoration. Each answers a different question:

| view | question |
|---|---|
| `plan` | is the shape right? |
| `oblique` | does it have mass, or is it a sheet? |
| `horizon` | does it read at distance, which is where a landmark earns its cost? |

## The `file#fn` form

`preview.mjs w2h-city.js#ferrariWorld` lifts the named builder straight out of the shipping file
and renders it. Use this form.

The alternative — a standalone `landmarks/lm-*.js` that the bench imports — means the geometry
exists in two places, and this repo has been bitten by that four separate times (landmark anchors,
`GROUND`, road widths, `KIT_ZONES`). One copy, rendered from where it ships, cannot drift. When
the landmark registry lands and `w2h-city.js` stops being the home of the geometry, the plain-file
form is there.

`render.mjs` has no dependency beyond `three` — no WebGL, no headless browser, no canvas library.
Flat shading, painter's sort, hand-rolled PNG encoder. It is deliberately crude: it is for judging
silhouette and proportion, not lighting or material.

## What it does not tell you

Shadows, dusk grading, fog, post-processing, how the thing sits against its island, and whether
the OSM footprint underneath it has been excluded. Those still need `world-nav.html#debug`.

## The thing worth remembering

Ferrari World passed every numeric check written for it and came out a starfish. Numbers describe
size. Only looking describes shape.
