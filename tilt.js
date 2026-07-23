// PASTE TARGET: where2hang-hero-lab/tilt.js   (replaces previous)
// Where2Hang — device tilt LEAF (Spec v2 §2.1). No dependencies. British spelling, no emojis.
//
// WHY THIS WAS ERRATIC, AND WHAT CHANGED.
// Earlier versions read `gamma` from deviceorientation. Gamma is ill-conditioned when the
// device is near-vertical — which is exactly how a phone is held while reading — because the
// Euler decomposition gimbal-locks there. Small real movements produced large jumps, and no
// amount of damping or range tuning fixes that: the input itself was unstable.
// This version derives tilt from the GRAVITY VECTOR instead. A low-passed reading of
// accelerationIncludingGravity gives which way is down in device coordinates, directly, with
// no singularity at any attitude. deviceorientation survives only as a fallback for devices
// that report no motion at all.
//
// TILT vs MOVEMENT — the honest limit.
// A real window changes what you see when you MOVE, not when you rotate the pane. Rotation is
// the less correct cue, but translation has to be double-integrated from the accelerometer
// and drifts metres within seconds, so a movement-only mapping would wander off and never
// return. So: gravity gives the stable absolute aim, and a short-lived IMPULSE taken from the
// high-passed acceleration is added on top and decays to nothing. Shove the phone sideways
// and the city lurches and settles. Not true parallax, but the part of it a person notices,
// and it cannot drift.
//
// API:  const t = mountTilt({ enabled: true, impulse: 0.34 });
//       t.get() -> { x, y }  smoothed, clamped to [-1,1]
//       t.setEnabled(bool);  t.recentre();  t.request() -> Promise<boolean>;  t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const G = 9.81;
  // full deflection at this much tilt. 14 and 11 degrees: intentional tilt reads, tremor does not.
  const RANGE_X = G * Math.sin((opts.rangeX ?? 14) * Math.PI / 180);
  const RANGE_Y = G * Math.sin((opts.rangeY ?? 11) * Math.PI / 180);
  const STIFF = opts.stiffness ?? 0.070;
  const DEAD = opts.deadzone ?? 0.045;
  const IMPULSE = opts.impulse ?? 0.34;
  const HZ = 1000 / 30;

  let tx = 0, ty = 0, cx = 0, cy = 0;
  let baseX = null, baseY = null;
  let gx = 0, gy = 0, primed = false;          // low-passed gravity, device frame
  let ix = 0, iy = 0, vx = 0, vy = 0;          // movement impulse
  let enabled = opts.enabled !== false && !REDUCE;
  let last = 0, alive = true, raf = 0, haveMotion = false;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const dead = (v) => Math.abs(v) < DEAD ? 0 : v;

  function onMotion(e) {
    if (!enabled || !alive) return;
    const g = e.accelerationIncludingGravity;
    if (!g || (g.x == null && g.y == null)) return;
    haveMotion = true;
    const now = performance.now();
    if (now - last < HZ) return;
    last = now;

    // low pass -> gravity, i.e. orientation. Seed on the first sample so it does not swing in.
    if (!primed) { gx = g.x || 0; gy = g.y || 0; primed = true; }
    else { gx = gx * 0.90 + (g.x || 0) * 0.10; gy = gy * 0.90 + (g.y || 0) * 0.10; }
    if (baseX === null) { baseX = gx; baseY = gy; return; }   // recentre to how it is actually held
    tx = dead(clamp((gx - baseX) / RANGE_X));
    ty = dead(clamp((gy - baseY) / RANGE_Y));

    // high pass -> movement. What is left once gravity is removed is the shove.
    const ax = (g.x || 0) - gx, ay = (g.y || 0) - gy;
    vx = vx * 0.86 + ax * 0.030;
    vy = vy * 0.86 + ay * 0.030;
    ix = clamp(ix * 0.90 + vx);
    iy = clamp(iy * 0.90 - vy);
  }

  // fallback only — devices reporting no motion at all. Carries the same gimbal weakness, but
  // it never runs when devicemotion is present.
  function onOrient(e) {
    if (!enabled || !alive || haveMotion) return;
    const b = e.beta, gm = e.gamma;
    if (b == null || gm == null) return;
    const now = performance.now();
    if (now - last < HZ) return;
    last = now;
    const px = G * Math.sin(gm * Math.PI / 180), py = G * Math.sin((b - 90) * Math.PI / 180);
    if (baseX === null) { baseX = px; baseY = py; return; }
    tx = dead(clamp((px - baseX) / RANGE_X));
    ty = dead(clamp((py - baseY) / RANGE_Y));
  }

  function tick() {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    if (!enabled) { cx += (0 - cx) * STIFF; cy += (0 - cy) * STIFF; ix *= 0.9; iy *= 0.9; return; }
    cx += (tx - cx) * STIFF;
    cy += (ty - cy) * STIFF;
    ix *= 0.965; iy *= 0.965;   // the impulse always returns to nothing. This is what stops drift.
  }

  function attach() {
    window.addEventListener("devicemotion", onMotion, { passive: true });
    window.addEventListener("deviceorientation", onOrient, { passive: true });
  }
  function detach() {
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener("deviceorientation", onOrient);
    vx = vy = ix = iy = 0;
  }

  const onVis = () => { if (document.hidden) detach(); else if (enabled) attach(); };
  document.addEventListener("visibilitychange", onVis);

  // iOS 13+ gates both event families behind a gesture. Android grants silently.
  function request() {
    const DM = window.DeviceMotionEvent, DO = window.DeviceOrientationEvent;
    const needs = (DM && typeof DM.requestPermission === "function") || (DO && typeof DO.requestPermission === "function");
    if (!needs) { attach(); return Promise.resolve(true); }
    const asks = [];
    if (DM && DM.requestPermission) asks.push(DM.requestPermission().catch(() => "denied"));
    if (DO && DO.requestPermission) asks.push(DO.requestPermission().catch(() => "denied"));
    return Promise.all(asks).then((r) => {
      const ok = r.some((s) => s === "granted");
      if (ok) attach();
      return ok;
    });
  }

  const gated = (window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function");
  if (enabled && !gated) attach();
  raf = requestAnimationFrame(tick);

  return {
    get() { return { x: clamp(cx + ix * IMPULSE), y: clamp(cy + iy * IMPULSE) }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) attach(); else detach(); },
    recentre() { baseX = null; baseY = null; primed = false; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
