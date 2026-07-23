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
// API:  const t = mountTilt({ enabled: true });
//       t.get();            -> { x, y }   smoothed, clamped
//       t.setEnabled(bool);              // wire to IntersectionObserver on the hero
//       t.request();        -> Promise<boolean>   // iOS 13+ permission, no-op elsewhere
//       t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const RANGE_X = opts.rangeX ?? 9;      // degrees of gamma mapped to full deflection
  const RANGE_Y = opts.rangeY ?? 7;      // degrees of beta
  // 22/16 was wrong: nobody rotates a phone that far while reading it. Real handling is
  // plus or minus 4-6 degrees, which only reached a quarter of the range and read as
  // "nothing is moving". 9/7 puts normal handling across most of the deflection.
  const STIFF = opts.stiffness ?? 0.10; // spring constant per 60fps frame
  const HZ = 1000 / 30;

  let tx = 0, ty = 0;      // target, clamped [-1,1]
  let cx = 0, cy = 0;      // smoothed output
  let baseB = null, baseG = null;   // recentre origin — the attitude on first reading
  let enabled = opts.enabled !== false && !REDUCE;
  let last = 0, alive = true, raf = 0;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;

  function onOrient(e) {
    if (!enabled || !alive) return;
    const now = performance.now();
    if (now - last < HZ) return;
    last = now;
    const b = e.beta, g = e.gamma;
    if (b == null || g == null) return;
    if (baseB === null) { baseB = b; baseG = g; return; }   // recentre on first real reading
    tx = clamp((g - baseG) / RANGE_X);
    ty = clamp((b - baseB) / RANGE_Y);
  }

  // spring toward the target on its own light loop, so the consumer can read get() any time
  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    if (!enabled) { cx += (0 - cx) * STIFF; cy += (0 - cy) * STIFF; return; }  // ease back to centre when off
    cx += (tx - cx) * STIFF;
    cy += (ty - cy) * STIFF;
  }

  function attach() { window.addEventListener("deviceorientation", onOrient, { passive: true }); }
  function detach() { window.removeEventListener("deviceorientation", onOrient); }

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
    get() { return { x: cx, y: cy }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) attach(); else detach(); },
    recentre() { baseB = null; baseG = null; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
