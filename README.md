# bench — look at a landmark before shipping it

```
cd bench
npm i three
node preview.mjs ../landmarks/lm-ferrari-world.js
```

Writes three PNGs: plan, oblique, horizon. No WebGL, no browser — real three.js
geometry, projected and rasterised by hand with flat shading and a painter's
sort.

## Why

Ferrari World passed every numeric check written for it — 202 m span, 27 m
peak, 7.6:1, five points, longest 1.53x the shortest, zero NaN vertices — and
came out a starfish. **Span, ratio and point count do not describe a shape.**

The bench also changes the deploy economics. Iterating in the repo costs a
paste and a screenshot per attempt; iterating here costs nothing, so a landmark
can be wrong twenty times before anyone sees it.

## What it does not show

Flat shading, no shadows, no textures, no emissive. It shows **silhouette and
mass**, which is what goes wrong. Lighting, dusk colour and material behaviour
still need a screenshot of the real scene.

## Landmark file contract

```js
export const BUILD = 'lm-ferrari-world v1';
export const FOOT  = { w: 26.0, d: 25.4 };   // units, drives KIT_ZONES
export function build(THREE){ /* ... */ return group; }   // base at y = 0
```

`preview.mjs` prints the measured `FOOT` so the declared one cannot drift from
the geometry.
