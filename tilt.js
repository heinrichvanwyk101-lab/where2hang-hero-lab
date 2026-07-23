// PASTE TARGET: where2hang-hero-lab/tilt.js
// Where2Hang — device tilt LEAF (Spec v2 §2.1). No dependencies. British spelling, no emojis.
//
// Tilt the phone; the hero stage shifts against the skyline. Desktop physically cannot do
// this, which is exactly why it reads as new. It is the highest wow-per-hour item available
// on a phone and it costs one sensor listener.
//
// Deliberate choices:
//   · Raw sensor values are twitchy and read as cheap. Everything is clamped to a small
//     range and spring-damped toward the target, so the stage feels heavy, not nervous.
//   · Recentres to the attitude the phone was actually held at on first reading, never to
//     flat. Nobody holds a phone flat.
//   · Listener throttled to ~30Hz and detached whenever the hero is offscreen or hidden.
//   · Returns {x,y} in [-1,1]; the consumer decides amplitude.
//
// TILT vs MOVEMENT — the honest limit.
// A real window changes what you see when you MOVE your head, not when you rotate the pane.
// Rotation is therefore the less correct cue, but it is the only one a phone can report
// reliably: translation has to be double-integrated from the accelerometer and drifts metres
// within a few seconds, so a pure movement mapping would wander off and never come back.
// What we do instead: tilt provides the stable, absolute aim, and a short-lived IMPULSE from
// actual acceleration is added on top and decays to nothing. Shift the phone sideways and the
// city lurches and settles. It is not true parallax, but it is the part of true parallax a
// person actually notices, and it cannot drift.
//
// API:  const t = mountTilt({ enabled: true });
//       t.get();            -> { x, y }   smoothed, clamped
//       t.setEnabled(bool);              // wire to IntersectionObserver on the hero
//       t.request();        -> Promise<boolean>   // iOS 13+ permission, no-op elsewhere
//       t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const RANGE_X = opts.rangeX ?? 14;     // degrees of gamma mapped to full deflection
  const RANGE_Y = opts.rangeY ?? 11;     // degrees of beta
  // Calibration history: 22/16 was dead (nobody rotates a phone that far while reading).
  // 9/7 overshot the other way — hand tremor is a degree or two, so it became visible and
  // the image jittered. 14/11 sits between: intentional tilt reads, tremor does not.
  const DEAD = opts.deadzone ?? 0.045;   // ignore sub-tremor deflection entirely
  const STIFF = opts.stiffness ?? 0.070; // spring constant per 60fps frame
  const HZ = 1000 / 30;

  let tx = 0, ty = 0;      // target, clamped [-1,1]
  let cx = 0, cy = 0;      // smoothed output
  let baseB = null, baseG = null;   // recentre origin — the attitude on first reading
  let enabled = opts.enabled !== false && !REDUCE;
  let last = 0, alive = true, raf = 0;

  // --- movement impulse (high-passed acceleration, decaying) ---
  const IMPULSE = opts.impulse ?? 0.34;   // how much of full deflection a shove can borrow
  let gx = 0, gy = 0, vx = 0, vy = 0, ix = 0, iy = 0, mlast = 0;
  function onMotion(e) {
    if (!enabled || !alive) return;
    const now = performance.now();
    if (now - mlast < HZ) return;
    mlast = now;
    let a = e.acceleration;
    if (!a || (a.x == null && a.y == null)) {
      // most Android devices only report acceleration WITH gravity. Subtract a slow running
      // mean to high-pass it — what is left is the movement, not the orientation.
      const g = e.accelerationIncludingGravity; if (!g) return;
      gx = gx * 0.96 + (g.x || 0) * 0.04; gy = gy * 0.96 + (g.y || 0) * 0.04;
      a = { x: (g.x || 0) - gx, y: (g.y || 0) - gy };
    }
    vx = vx * 0.86 + (a.x || 0) * 0.030;
    vy = vy * 0.86 + (a.y || 0) * 0.030;
    ix = clamp(ix * 0.90 + vx);
    iy = clamp(iy * 0.90 - vy);
  }

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;

  function onOrient(e) {
    if (!enabled || !alive) return;
    const now = performance.now();
    if (now - last < HZ) return;
    last = now;
    const b = e.beta, g = e.gamma;
    if (b == null || g == null) return;
    if (baseB === null) { baseB = b; baseG = g; return; }   // recentre on first real reading
    const nx = clamp((g - baseG) / RANGE_X), ny = clamp((b - baseB) / RANGE_Y);
    tx = Math.abs(nx) < DEAD ? 0 : nx;
    ty = Math.abs(ny) < DEAD ? 0 : ny;
  }

  // spring toward the target on its own light loop, so the consumer can read get() any time
  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    if (!enabled) { cx += (0 - cx) * STIFF; cy += (0 - cy) * STIFF; ix *= 0.9; iy *= 0.9; return; }
    cx += (tx - cx) * STIFF;
    cy += (ty - cy) * STIFF;
    ix *= 0.965; iy *= 0.965;   // the impulse always returns to nothing — this is what stops drift
  }

  function attach() {
    window.addEventListener("deviceorientation", onOrient, { passive: true });
    if (IMPULSE > 0) window.addEventListener("devicemotion", onMotion, { passive: true });
  }
  function detach() {
    window.removeEventListener("deviceorientation", onOrient);
    window.removeEventListener("devicemotion", onMotion);
    vx = vy = ix = iy = 0;
  }

  const onVis = () => { if (document.hidden) detach(); else if (enabled) attach(); };
  document.addEventListener("visibilitychange", onVis);

  // iOS 13+ demands an explicit grant from inside a user gesture. Android grants silently.
  // If it is refused or unavailable we simply never move — no error, no prompt, no fallback UI.
  function request() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function") {
      return D.requestPermission().then((s) => { const ok = s === "granted"; if (ok) attach(); return ok; }).catch(() => false);
    }
    attach();
    return Promise.resolve(true);
  }

  if (enabled && !(window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function")) attach();
  raf = requestAnimationFrame(tick);

  return {
    get() { return { x: clamp(cx + ix * IMPULSE), y: clamp(cy + iy * IMPULSE) }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) attach(); else detach(); },
    recentre() { baseB = null; baseG = null; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
