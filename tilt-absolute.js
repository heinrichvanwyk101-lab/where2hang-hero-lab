// PASTE TARGET: where2hang-hero-lab/tilt-absolute.js
// Where2Hang — the ABSOLUTE-ORIENTATION look-around.  v3.
//
// WHY THIS FILE EXISTS.
// This is the v24 sensor code — the version that was calibrated and confirmed working, before
// the panoramas, the per-plate framing, the beacons and the windows were added. The maths is
// untouched: aim is the device -Z axis taken from the full rotation matrix, never a single
// Euler angle, and never an integrated rate.  Spec v3 §4 stands.
//
// WHAT CHANGED IN v2, AND WHY.
// On the Z Fold, `deviceorientationabsolute` fires, but its `alpha` does not move — the
// magnetometer is not delivering a usable heading. v1 latched onto the absolute stream the
// instant one such event arrived (`haveAbs = true`, set BEFORE the null check), and from then
// on discarded every plain `deviceorientation` event for the life of the page. The result was
// exactly what we saw: pitch alive, yaw dead. Elevation comes from beta/gamma, which are
// accelerometer-derived and fine; heading comes from alpha, which was frozen.
//
// The plain `deviceorientation` event on Android is backed by the GAME ROTATION VECTOR —
// gyroscope fused with accelerometer, magnetometer deliberately excluded. It is a true attitude
// estimate expressed as a rotation matrix, referenced to an arbitrary yaw origin instead of
// magnetic north. It is the same mechanism the camera's panorama mode uses, which is why a
// panorama sweeps 180 degrees cleanly on this handset while the hero would not pan at all.
//
// The hero never wanted north. It latches its own origin in `head0` and recentres onto it via
// DRIFT. So the relative stream satisfies both hard rules in Spec v3 §4 — absolute orientation,
// rotation matrix — while sidestepping the dead compass. Yaw drift without magnetic correction
// is roughly a degree a minute, which DRIFT 0.0006 absorbs.
//
// SOURCE SELECTION — opts.source:
//   'auto'     — DEFAULT. Prefers absolute. Measures how far the heading actually travels on
//                each stream, and demotes to relative only on proof that absolute is frozen
//                while relative is moving. One-shot: once absolute proves live it is kept.
//   'absolute' — v1 behaviour. Compass only. Dead yaw on this device.
//   'relative' — game rotation vector only. Deterministic, no detection, no switch mid-session.
//
// WHAT CHANGED IN v3, AND WHY.
// v2 latched the neutral heading from the FIRST usable reading. The game rotation vector needs
// a moment to converge after the listener attaches, so whichever sample happened to arrive
// first became the origin — and on a slow load that sample is still settling. Symptom: the
// look-around opens skewed hard left or hard right, at random, on an unchanged build, and a
// plain refresh "fixes" it. DRIFT 0.0006 only creeps the error out over several minutes, so the
// whole session sits crooked. Nothing that depends on the code can differ between two refreshes
// of the same build; only something that depends on timing can.
//
// v3 gates the latch: head0 is not committed until SETTLE_N consecutive readings agree within
// SETTLE_TOL degrees, and it latches on their mean rather than on one sample. If nothing settles
// within SETTLE_MS the last reading is taken anyway — a slightly crooked look-around is a far
// smaller fault than a dead one, and this path must never be able to leave the pan unlatched.
// The same gate runs on the auto-demotion relatch and on recentre(), which had identical
// exposure: a mid-session switch to the relative stream could go crooked on a load that
// started clean.
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
  const SOURCE      = opts.source ?? "auto";
  const onDebug = opts.onDebug || null;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // Demotion thresholds, in degrees of accumulated heading travel.
  // ABS_LIVE: absolute has moved enough to prove the compass works — decision locked to 'abs'.
  // REL_LIVE: relative has moved this far while absolute stayed under ABS_LIVE — compass frozen.
  const ABS_LIVE = 2, REL_LIVE = 10;

  // Origin settle gate. SETTLE_N consecutive readings must agree within SETTLE_TOL degrees
  // before the neutral heading is committed; SETTLE_MS is the hard deadline after which the
  // latest reading is taken regardless, so the look-around can never be left unlatched.
  const SETTLE_N = 5, SETTLE_TOL = 1.2, SETTLE_MS = 1000;
  let settleBuf = [], settleT0 = 0;
  const resetSettle = () => { settleBuf = []; settleT0 = 0; };

  let head0 = null, elev0 = 0;
  let yaw = 0, pitch = 0, cx = 0, cy = 0;
  let enabled = opts.enabled !== false && !REDUCE;
  let alive = true, raf = 0, tickT = 0;

  // Which stream is currently driving the look-around.
  // Starts on 'rel' so that a device which never fires an absolute event still pans.
  let mode = "rel";
  let sawAbs = false;
  let decided = SOURCE !== "auto";
  if (SOURCE === "absolute") mode = "rel";   // promotes to 'abs' on the first absolute event
  if (SOURCE === "relative") mode = "rel";

  // Travel accumulators for the auto discriminator.
  let absTravel = 0, relTravel = 0, lastAbsHead = null, lastRelHead = null;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const dead  = (d) => { const a = Math.abs(d) - DEAD_DEG; return a <= 0 ? 0 : Math.sign(d) * a; };
  const wrap  = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

  // Where the phone is AIMED — the device -Z axis in world coordinates, taken from the full
  // rotation matrix rather than from any single Euler angle. Well-posed at every attitude, and
  // roll drops out as a property of the geometry.
  function aim(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return null;
    const a = e.alpha * D2R, b = e.beta * D2R, g = e.gamma * D2R;
    const cA = Math.cos(a), sA = Math.sin(a);
    const cB = Math.cos(b), sB = Math.sin(b);
    const cG = Math.cos(g), sG = Math.sin(g);
    const r13 = cA * sG + cG * sA * sB;
    const r23 = sA * sG - cA * cG * sB;
    const r33 = cB * cG;
    const vx = -r13, vy = -r23, vz = -r33;
    const horiz = Math.hypot(vx, vy);
    return {
      heading: horiz > 0.15 ? Math.atan2(vx, vy) * R2D : null,
      elevation: Math.asin(clamp(vz)) * R2D,
      horiz,
    };
  }

  // Accumulate how far each stream's heading has genuinely travelled. Samples larger than 45
  // degrees are discarded as wraps or as the first reading after a gap.
  function measure(isAbs, heading) {
    if (heading == null) return;
    const prev = isAbs ? lastAbsHead : lastRelHead;
    if (prev !== null) {
      const d = Math.abs(wrap(heading - prev));
      if (d < 45) { if (isAbs) absTravel += d; else relTravel += d; }
    }
    if (isAbs) lastAbsHead = heading; else lastRelHead = heading;

    if (decided) return;
    if (absTravel >= ABS_LIVE) {
      decided = true;                       // compass is genuinely reporting — keep it
    } else if (relTravel >= REL_LIVE) {
      decided = true; mode = "rel";         // compass frozen, game rotation vector alive
      head0 = null; resetSettle();          // relatch the origin, through the settle gate
    }
  }

  function handle(e, isAbs) {
    if (!alive) return;
    if (isAbs && SOURCE === "relative") return;
    if (isAbs) {
      sawAbs = true;
      if (!decided || SOURCE === "absolute") mode = "abs";
    }
    if (!enabled) return;

    const A = aim(e);
    if (!A) return;

    if (SOURCE === "auto") measure(isAbs, A.heading);

    // Only the stream currently in charge is allowed to move the view. Until an absolute event
    // has ever been seen, the relative stream drives, so a compass-less device is never dead.
    const driving = (mode === "abs") ? isAbs : !isAbs;
    if (!driving) return;
    if (mode === "abs" && !sawAbs) return;

    if (A.heading !== null) {
      if (head0 === null) {
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
        if (!settleT0) settleT0 = now;
        settleBuf.push({ h: A.heading, e: A.elevation });
        if (settleBuf.length > SETTLE_N) settleBuf.shift();

        // Spread measured relative to the oldest kept sample, so the wrap at +-180 is handled.
        let agreed = false;
        if (settleBuf.length === SETTLE_N) {
          const base = settleBuf[0].h;
          let lo = 0, hi = 0;
          for (const smp of settleBuf) { const d = wrap(smp.h - base); if (d < lo) lo = d; if (d > hi) hi = d; }
          agreed = (hi - lo) <= SETTLE_TOL;
        }
        if (!agreed && (now - settleT0) < SETTLE_MS) return;

        // Latch on the mean of the window, not on a single sample.
        const base = settleBuf[0].h;
        let sumH = 0, sumE = 0;
        for (const smp of settleBuf) { sumH += wrap(smp.h - base); sumE += smp.e; }
        head0 = wrap(base + sumH / settleBuf.length);
        elev0 = sumE / settleBuf.length;
        resetSettle();
        return;
      }
      head0 += wrap(A.heading - head0) * DRIFT;
      yaw = Math.max(-YAW_RANGE, Math.min(YAW_RANGE, dead(wrap(A.heading - head0))));
    }
    if (head0 === null) return;
    elev0 += (A.elevation - elev0) * DRIFT;
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, dead(A.elevation - elev0)));

    if (onDebug) onDebug({
      yaw, pitch, rate: 0, raw: 0, bias: 0,
      compass: mode === "abs", src: mode, decided, settling: head0 === null,
      absTravel: Math.round(absTravel), relTravel: Math.round(relTravel),
      head: A.heading, horiz: A.horiz,
    });
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
    if (SOURCE !== "relative") window.addEventListener("deviceorientationabsolute", onAbs, { passive: true });
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
    source() { return mode; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) attach(); else detach(); },
    recentre() { head0 = null; resetSettle(); yaw = 0; pitch = 0; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
