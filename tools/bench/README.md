# Bench: headless render and boot checks for the world

These scripts open `world-nav.html` in headless Chromium (Playwright + swiftshader) against a
local HTTP server that rewrites the CDN importmap to `node_modules/three`. They are how every
change to the world is verified before it is pushed. Nothing here ships to the site.

## Setup (once per machine)

```sh
cd where2hang-hero-lab
npm install --no-save three@0.185 playwright-core@1.55   # three for the importmap rewrite; --no-save keeps package.json clean
# Chromium: the scripts look for /opt/pw-browsers/chromium-1194/chrome-linux/chrome.
# Elsewhere, edit executablePath or set PLAYWRIGHT_BROWSERS_PATH and run `npx playwright install chromium`.
```

Output (PNG frames) lands in `tools/bench/out/`, which is git-ignored.

## The gate before every push

```sh
node tools/bench/errcheck3.mjs
```

Night view, waits until all six islands report `built`, then prints `built:`, `holes:` and
`errors:`. Push only when errors is 0 and every island shows 1. It takes 3 to 6 minutes on a
software renderer; run it in the background and wait on its output file.

## Looking at a building

```sh
node tools/bench/kitview.mjs <island> <kitName> [dist] [elev] [angle]
node tools/bench/placeview.mjs <island> "<place label>" [dist] [elev] [angle]
node tools/bench/coordview.mjs <island> "" [dist] [elev] [angle] <x> <z>
```

`kitview` finds the mesh whose `userData.kitName` matches (every kit piece tags its hero mesh
with one). `placeview` targets a place anchor from the district's `places` list. `coordview`
targets island units directly. Islands: `corniche maryah reem saadiyat yas raha`. A frame
takes 2 to 4 minutes; run them one after another, never in parallel, because parallel
Chromiums starve each other and the screenshot times out.

Other checks: `desttest.mjs` (destination pin flies in, second tap lists), `heretest.mjs`
(the "you are here" pin on and off the modelled map), `floatcheck.mjs` (raycasts kit pieces
against the island top).

## Conventions the world code relies on

- Bump `BUILD` in `w2h-city.js` (`city vNNN`), `w2h-world.js` (`world vNNN`) and `B_NAV` in
  `world-nav.html` (`nav vNNN`) with every real change. The readout and the app show them.
- Island units: `((metres - extent.cx) / 7.8, -(metres - extent.cy) / 7.8)` from
  `data/isle-<id>.json`. Real-metre projection origin is 24.49 N, 54.42 E:
  `x = (lng - 54.42) * 101320`, `y = (lat - 24.49) * 111320`.
- A kit piece builds in metres divided by `M_PER_U` once, sits with its base at y 0, and the
  world sets `position.y = GROUND` when it adds it to a district's `detail` group.
- Materials: `saadKitMat(dusk, day, rough, metal, emis, ei)` for opaque surfaces,
  `kitGlass(dusk, day)` for tower glass. Never put `TEX_TOWER` (the night window sheet) in a
  day material.
- Tag the hero mesh: `m.userData.hero = m.userData.kitName = 'name'`, so kitview can find it.
- `KIT_ZONES[district.id]` boxes (island units) suppress surveyed footprints and generated
  fabric under a kit piece. On the Corniche and Yas the zones are measured from the objects;
  elsewhere they are written by hand next to the placement.
- `styleZones` on a district (`{x0,x1,z0,z1,style}`) change the fabric: `'white'` for the
  cultural district, `'low'` caps everything at six storeys.
- Any new top-level `let`/`const` must be declared before its first synchronous use.

## Finding a site

Surveyed footprints are in `data/isle-<id>.json` (`buildings`, metres, `w d rot h`). Tall
records with heights are usually the real towers, and the bake's `landmarks` table gives OSM
points for the named places. For a building the survey does not have, grid-search a site
inside the outline with clearance from the shore and from `data/roads-<id>.json`, the way
St. Regis Saadiyat was placed.

## Where the register lives

`docs/landmark-register.html` is the landmark register: every named place, marked built,
massed or missing, island by island. Update it when a piece changes state.
