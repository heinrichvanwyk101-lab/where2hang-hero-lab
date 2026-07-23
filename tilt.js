// PASTE TARGET: where2hang-hero-lab/tilt.js   (replaces previous · absolute aim)
// Where2Hang — panoramic look-around LEAF. No dependencies. British spelling, no emojis.
//
// WHY THE PREVIOUS VERSION FAILED, FROM ITS OWN DEBUG OUTPUT.
// It integrated the gyroscope's angular RATE to get an angle. Four live readings showed yaw
// at 15.5, 12.5, 10.5 and -14.9 degrees against a range of plus or minus 16 — pinned at the
// rail nearly all the time, so the image sat at one edge and stopped responding. Integrating
// a rate gives a free-floating angle with no absolute reference: it accumulates, it drifts,
// and it jams against the clamp. No amount of deadbanding or bleed-back fixes that, because
// the quantity itself is unanchored.
// A panorama viewer uses ABSOLUTE orientation. Return the handset to where it was and the
// view returns with it, every time, with no memory of the path taken.
//
// HOW THIS WORKS.
// DeviceOrientationEvent gives alpha, beta, gamma — a ZXY Euler triple. Rather than using any
// one of them (each is ill-conditioned somewhere, which is what gimbal lock means), build the
// full rotation matrix and ask a question that is well-posed everywhere:
//     WHERE IS THE PHONE AIMED?
// That is the device's -Z axis expressed in world coordinates. From that single vector:
//     heading   = atan2(v.x, v.y)     which way it points around the horizon
//     elevation = asin(v.z)           how far up or down it points
// Roll drops out entirely — banking the handset about its viewing axis does not change where
// it is aimed, so it cannot move the city. That is a property of the geometry, not a filter.
//
// Neutral is captured on the first good reading, and both angles are taken relative to it, so
// the panorama starts centred however the phone happens to be held.
//
// API:  const t = mountTilt({ enabled: true });
//       t.get() -> { x, y }   x: +1 aimed right of neutral   y: +1 aimed above neutral
//       t.setEnabled(bool);  t.recentre();  t.request() -> Promise<boolean>;  t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const YAW_RANGE   = opts.yawRange   ?? 16;   // degrees of turn for full horizontal sweep
  const PITCH_RANGE = opts.pitchRange ?? 7;    // degrees of aim for full vertical
  const DEAD_DEG    = opts.deadDeg ?? 0.35;    // hand tremor, in degrees, subtracted
  const TAU         = opts.tau ?? 0.24;        // easing time constant, seconds
  const DRIFT       = opts.drift ?? 0.0006;    // neutral creeps toward where you actually hold it

  // DIRECTION. The only two switches. +1 or -1.
  //   SIGN_YAW   = +1  aim RIGHT of neutral gives x = +1
  //   SIGN_PITCH = +1  aim ABOVE neutral gives y = +1
  const SIGN_YAW   = opts.signYaw   ?? 1;
  const SIGN_PITCH = opts.signPitch ?? 1;

  const onDebug = opts.onDebug || null;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  let head0 = null, elev0 = 0;       // neutral
  let yaw = 0, pitch = 0;            // degrees relative to neutral
  let cx = 0, cy = 0;                // eased output
  let enabled = opts.enabled !== false && !REDUCE;
  let alive = true, raf = 0, tickT = 0, haveAbs = false;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const dead = (deg) => { const a = Math.abs(deg) - DEAD_DEG; return a <= 0 ? 0 : Math.sign(deg) * a; };
  // shortest signed difference between two headings, so 359 -> 1 is +2 and never -358
  const wrap = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

  function handle(e, absolute) {
    if (!enabled || !alive) return;
    if (absolute) haveAbs = true;
    else if (haveAbs) return;                       // prefer the absolute stream if it exists
    if (e.alpha == null || e.beta == null || e.gamma == null) return;

    const a = e.alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);

    // R = Rz(alpha) Rx(beta) Ry(gamma), third column only — that is all we need.
    const r13 = cA * sG + cG * sA * sB;
    const r23 = sA * sG - cA * cG * sB;
    const r33 = cB * cG;

    // where the phone is aimed: the device -Z axis, in world coordinates (x east, y north, z up)
    const vx = -r13, vy = -r23, vz = -r33;

    // Aimed almost straight up or down: heading is genuinely undefined there, so hold the last
    // value rather than letting it spin.
    const horiz = Math.hypot(vx, vy);
    if (horiz > 0.15) {
      const heading = Math.atan2(vx, vy) * R2D;
      if (head0 === null) { head0 = heading; elev0 = Math.asin(clamp(vz)) * R2D; return; }
      head0 += wrap(heading - head0) * DRIFT;       // neutral follows how you actually hold it
      yaw = Math.max(-YAW_RANGE, Math.min(YAW_RANGE, dead(wrap(heading - head0))));
    }
    const elevation = Math.asin(clamp(vz)) * R2D;
    if (head0 === null) return;
    elev0 += (elevation - elev0) * DRIFT;
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, dead(elevation - elev0)));

    if (onDebug) onDebug({ heading: head0 === null ? 0 : wrap(Math.atan2(vx, vy) * R2D - head0), elev: elevation - elev0, yaw, pitch, abs: haveAbs });
  }

  const onAbs = (e) => handle(e, true);
  const onRel = (e) => handle(e, false);

  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let dt = tickT ? (now - tickT) / 1000 : 1 / 60;
    tickT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1 / 60;
    const k = 1 - Math.exp(-dt / TAU);            // frame-rate independent easing
    const tx = enabled ? SIGN_YAW   * clamp(yaw   / YAW_RANGE)   : 0;
    const ty = enabled ? SIGN_PITCH * clamp(pitch / PITCH_RANGE) : 0;
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
  }

  function attach() {
    window.addEventListener("deviceorientationabsolute", onAbs, { passive: true });
    window.addEventListener("deviceorientation", onRel, { passive: true });
  }
  function detach() {
    window.removeEventListener("deviceorientationabsolute", onAbs);
    window.removeEventListener("deviceorientation", onRel);
  }

  const onVis = () => { if (document.hidden) detach(); else if (enabled) attach(); };
  document.addEventListener("visibilitychange", onVis);

  function request() {
    const DO = window.DeviceOrientationEvent;
    if (!DO || typeof DO.requestPermission !== "function") { attach(); return Promise.resolve(true); }
    return DO.requestPermission()
      .then((s) => { const ok = s === "granted"; if (ok) attach(); return ok; })
      .catch(() => false);
  }

  const gated = window.DeviceOrientationEvent && typeof window.DeviceOrientationEvent.requestPermission === "function";
  if (enabled && !gated) attach();
  raf = requestAnimationFrame(tick);

  return {
    get() { return { x: cx, y: cy }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) attach(); else detach(); },
    recentre() { head0 = null; yaw = 0; pitch = 0; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
