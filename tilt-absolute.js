// PASTE TARGET: where2hang-hero-lab/tilt-absolute.js
// Where2Hang — the ABSOLUTE-ORIENTATION look-around, restored for comparison.
//
// WHY THIS FILE EXISTS.
// This is the v24 sensor code — the version that was calibrated and confirmed working, before
// the panoramas, the per-plate framing, the beacons and the windows were added. tilt.js was
// NOT modified by any of that work: it was untouched from v24 through v41. So the regression
// that killed horizontal panning was in home-stage.html, and rewriting the sensor as a
// gyroscope treated the symptom by replacing a component that was not at fault. That rewrite
// is also why direction, sensitivity and drift all had to be re-solved — an integrated gyro
// drifts by nature, and this version does not, because it reads an absolute angle.
//
// HOW TO USE IT. One line in home-stage.html:
//     import { mountTilt } from './tilt-absolute.js?v=1';   // instead of ./tilt.js
// If horizontal panning works: the gyro rewrite was unnecessary and this is the version to
// keep, with its calibration intact.
// If it does not: the fault is in home-stage.html and I will find it there rather than
// continuing to modify the sensor.
//
// Constants are exactly as they were when the behaviour was signed off.

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const YAW_RANGE   = opts.yawRange   ?? 25;
  const PITCH_RANGE = opts.pitchRange ?? 15;
  const DEAD_DEG    = opts.deadDeg ?? 0.35;
  const TAU         = opts.tau ?? 0.24;
  const DRIFT       = opts.drift ?? 0.0006;
  const SIGN_YAW    = opts.signYaw   ?? 1;
  const SIGN_PITCH  = opts.signPitch ?? 1;
  const onDebug = opts.onDebug || null;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  let head0 = null, elev0 = 0;
  let yaw = 0, pitch = 0, cx = 0, cy = 0;
  let enabled = opts.enabled !== false && !REDUCE;
  let alive = true, raf = 0, tickT = 0, haveAbs = false;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const dead  = (d) => { const a = Math.abs(d) - DEAD_DEG; return a <= 0 ? 0 : Math.sign(d) * a; };
  const wrap  = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

  // Where the phone is AIMED — the device -Z axis in world coordinates, taken from the full
  // rotation matrix rather than from any single Euler angle. Well-posed at every attitude, and
  // roll drops out as a property of the geometry.
  function handle(e, absolute) {
    if (!enabled || !alive) return;
    if (absolute) haveAbs = true;
    else if (haveAbs) return;
    if (e.alpha == null || e.beta == null || e.gamma == null) return;

    const a = e.alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);
    const r13 = cA * sG + cG * sA * sB;
    const r23 = sA * sG - cA * cG * sB;
    const r33 = cB * cG;
    const vx = -r13, vy = -r23, vz = -r33;

    const horiz = Math.hypot(vx, vy);
    let heading = null;
    if (horiz > 0.15) {
      heading = Math.atan2(vx, vy) * R2D;
      if (head0 === null) { head0 = heading; elev0 = Math.asin(clamp(vz)) * R2D; return; }
      head0 += wrap(heading - head0) * DRIFT;
      yaw = Math.max(-YAW_RANGE, Math.min(YAW_RANGE, dead(wrap(heading - head0))));
    }
    const elevation = Math.asin(clamp(vz)) * R2D;
    if (head0 === null) return;
    elev0 += (elevation - elev0) * DRIFT;
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, dead(elevation - elev0)));

    if (onDebug) onDebug({ yaw, pitch, rate: 0, raw: 0, bias: 0, compass: haveAbs, head: heading, horiz });
  }
  const onAbs = (e) => handle(e, true);
  const onRel = (e) => handle(e, false);

  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let dt = tickT ? (now - tickT) / 1000 : 1 / 60;
    tickT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1 / 60;
    const k = 1 - Math.exp(-dt / TAU);
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
    return DO.requestPermission().then((s) => { const ok = s === "granted"; if (ok) attach(); return ok; }).catch(() => false);
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
