# where2hang-hero-lab

An isolated sandbox for the Where2Hang **city hero** — the 3D venue turntable that floats
over the Abu Dhabi skyline. Nothing here is connected to the live app. You perfect the hero
on a public URL, on your phone, and the `Where2hang` app is never touched until you decide
to move it in.

## Files (all in the repo root)

| File | What it is |
|------|------------|
| `index.html` | The demo host. Loads `three` from a CDN and mounts the leaf. GitHub Pages serves this. |
| `city-hero.js` | **The leaf** — the WebGL turntable. Framework-agnostic. Byte-identical to the app's `lib/cityHero.js`. |
| `city-state.js` | **The data seam** — time-of-day + a mock busyness signal. Becomes a Supabase read in the app. |
| `README.md` | This file. |

## Run it

1. Commit the four files to the root of this repo (`main`).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `root` → Save**.
3. Wait ~1 minute, then open the Pages URL it gives you (e.g. `https://<user>.github.io/where2hang-hero-lab/`).

**Controls:** drag to spin the turntable, tap the front card to open it, and add `?dev=1` to the
URL (or tap the dot, top-right) for the dev panel — time of day and busyness sliders to experiment with.

## Real photos in the lab (optional)

The skyline is the real `Hero-skyline.webp`. Venue **cards** fall back to drawn placeholders here
because they load cross-origin from `where2hang.ae`. To see real venue photos in the lab too, copy
the `Venue-*.webp` files into an `images/` folder in this repo and change the `BASE` URL in
`index.html` from `https://where2hang.ae/images/` to `images/`. In the app this is automatic —
everything is same-origin.

## Moving it into the app (when you're happy)

The leaf is designed to transfer with no rewrite:

1. `city-hero.js` → the app at `lib/cityHero.js` (same file).
2. `city-state.js` → the app at `lib/cityState.ts` (add types; later swap the body for a Supabase read).
3. Add a thin React wrapper `app/landing/CityHeroCanvas.tsx` that mounts the leaf on a canvas ref.
4. In `app/landing/page.tsx`, swap the flat "Popular in Abu Dhabi" rail for `<CityHeroCanvas />`.
5. Add `"three"` to `package.json`.

Do it on a branch, check the Vercel preview URL, merge only when it looks right. The live site
never moves until you choose to.
