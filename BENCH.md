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

## The browser bench (tools/bench)

`preview.mjs` renders one builder in Node. `tools/bench/` opens the whole world in headless
Chromium instead: the boot check that gates every push (`errcheck3.mjs`), and per-building
frames from the real scene (`kitview.mjs`, `placeview.mjs`, `coordview.mjs`). See
`tools/bench/README.md` for setup, the conventions the kit relies on, and how sites are found.

## The island layout tool (tools/island-move.html)

Open it in a browser. It draws the six islands as their real baked coastlines, at the size
`damping()` actually gives them, and lets you move, rotate and re-scale them — then hands back
the `DIORAMA` table to paste into `w2h-basemap.js`. It touches nothing: it is a plan view, not
the model.

It reads the same three sources the world does, so it cannot drift from what it previews:
`data/index.json` for the outlines and extents, `w2h-basemap.js` for `M_PER_UNIT`, `damping()`
and the live `DIORAMA`, and the same `anchorWorld` arithmetic `world-nav.html` puts every venue
pin through. Re-run `node tools/island-move-data.mjs` after a re-bake and paste the JSON over
the `const DATA = …` literal at the top of its script block.

Three things it measures that nothing else did:

- **Water clearance**, coastline to coastline on the real outlines rather than bounding circles.
  Circles overstate an irregular island's footprint badly — Corniche's circle is three times its
  real area — and every earlier re-spacing of the diorama used them.
- **Compass bearing** for all fifteen pairs, laid against true. The layout in the model today is
  36° out on average and 89° out at worst.
- **Whether an island fits where it really is.** Hold the damped sizes and slide to the map: the
  answer for Al Maryah is no, and that is damping's bill, not a placement fault.

`DIORAMA` is the only place island position lives. Everything on an island — the coastline, the
surveyed roads, the Overture footprints, the hand-built kits, the props, the beach masks, the
bridges, the venue pins and the place cameras — is authored about that island's own origin and
carried by its group, so all of it moves with the two numbers this tool writes.
