// PASTE TARGET: where2hang-hero-lab/tilt.js   (replaces previous · complementary filter)
// Where2Hang — panoramic look-around LEAF. No dependencies. British spelling, no emojis.
//
// WHY THE PREVIOUS VERSION PANNED VERTICALLY BUT NOT HORIZONTALLY.
// It took heading from the rotation matrix, which means it took heading from `alpha` — the
// COMPASS channel. Pitch does not depend on alpha at all; it comes from the gravity direction.
// On many Android devices alpha is null, or pinned to a constant, when the magnetometer is
// uncalibrated or simply not exposed to the browser. Constant alpha means constant heading, so
// yaw settles on one value at startup and never moves again, while pitch carries on working.
// The reported symptom was exactly that: "it shifts after refresh then only up and down".
//
// THE FIX — a complementary filter, which is the standard answer to this and uses both
// sensors for what each is actually good at:
//   YAW   integrated from the GYROSCOPE, which every phone has and which needs no compass.
//         Projected onto world vertical using gravity, so banking the handset contributes
//         nothing: rotation about the viewing axis is perpendicular to gravity.
//         Gyro integration drifts, so it is corrected two ways —
//           - slowly toward the compass heading IF the compass is genuinely moving
//           - otherwise by a gentle bleed back to centre, which bounds the error
//   PITCH taken from GRAVITY, which is absolute and cannot drift. No compass involved.
//
// The compass is therefore an optional improvement rather than a requirement. Where it works
// the view returns exactly when you turn back; where it does not, the gyro still pans and the
// only loss is a slow recentre. Nothing silently stops working.
//
// API:  const t = mountTilt({ enabled: true, onDebug: fn });
//       t.get() -> { x, y }   x: +1 turned right   y: +1 aimed up
//       t.setEnabled(bool);  t.recentre();  t.request() -> Promise<boolean>;  t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ---------------------------------------------------------------------------------
  // SENSITIVITY. Three dials, in the order worth reaching for:
  //   YAW_RANGE   how far you must TURN for a full sweep. Higher = less sensitive. This is
  //               the main one: it divides everything, so it changes feel without changing
  //               how far the city can ultimately travel.
  //   TAU         easing time constant in seconds. Higher = heavier, more lag, calmer.
  //   RATE_DEAD   deg/sec of hand tremor subtracted before anything is integrated.
  // Travel itself is NOT set here — that is LOOK_X_PX in home-stage.html.
  // 25 was carried over from the absolute-heading version. Integrated gyro accumulates rather
  // than tracking an anchor, so the same number reads as far more sensitive; 40 matches the
  // comfortable seated turn measured on the Fold.
  // ---------------------------------------------------------------------------------
  const YAW_RANGE   = opts.yawRange   ?? 40;    // degrees of turn for a full horizontal sweep
  const PITCH_RANGE = opts.pitchRange ?? 18;    // degrees of aim for full vertical
  const RATE_DEAD   = opts.rateDeadband ?? 1.4; // deg/sec of tremor, subtracted not zeroed
  const DEAD_DEG    = opts.deadDeg ?? 0.35;
  const TAU         = opts.tau ?? 0.30;         // easing time constant, seconds
  const BLEED       = opts.bleed ?? 0.0016;     // recentre per event when no compass to trust
  const FUSE        = opts.fuse ?? 0.02;        // pull toward the compass when it is alive

  // DIRECTION. The only two switches. +1 or -1.
  const SIGN_YAW   = opts.signYaw   ?? 1;
  const SIGN_PITCH = opts.signPitch ?? 1;
  const onDebug = opts.onDebug || null;
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  let yaw = 0, pitch = 0, cx = 0, cy = 0;
  let gx = 0, gy = 0, gz = 0, primed = false;   // low-passed gravity, device frame
  let elev0 = null;                              // neutral pitch
  let head = null, head0 = null, headPrev = null, headMoved = 0;  // compass, and whether it lives
  let enabled = opts.enabled !== false && !REDUCE;
  let alive = true, raf = 0, lastT = 0, tickT = 0;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
  const dead  = (d) => { const a = Math.abs(d) - DEAD_DEG; return a <= 0 ? 0 : Math.sign(d) * a; };
  const soft  = (v) => { const a = Math.abs(v) - RATE_DEAD; return a <= 0 ? 0 : Math.sign(v) * a; };
  const wrap  = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

  // ---- gyroscope + gravity. This is the channel that always works. ----
  function onMotion(e) {
    if (!enabled || !alive) return;
    const r = e.rotationRate, g = e.accelerationIncludingGravity;
    if (!r || (r.alpha == null && r.beta == null && r.gamma == null)) return;

    const now = performance.now();
    let dt = e.interval ? e.interval / 1000 : (lastT ? (now - lastT) / 1000 : 1 / 60);
    lastT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1 / 60;

    // gravity direction, low-passed. Android reports the reaction force, so this points UP.
    if (g && (g.x != null || g.y != null)) {
      if (!primed) { gx = g.x || 0; gy = g.y || 0; gz = g.z || 0; primed = true; }
      else { gx = gx*0.88 + (g.x||0)*0.12; gy = gy*0.88 + (g.y||0)*0.12; gz = gz*0.88 + (g.z||0)*0.12; }
    }
    const m = Math.hypot(gx, gy, gz) || 1;
    const ux = gx/m, uy = gy/m, uz = gz/m;        // unit vector, world UP in device coords

    // YAW: angular velocity projected onto world vertical. Turning right is clockwise seen
    // from above, so the rotation vector points DOWN — hence the negative sign.
    const wx = r.beta || 0, wy = r.gamma || 0, wz = r.alpha || 0;
    const yawRate = -(wx*ux + wy*uy + wz*uz);
    yaw = Math.max(-YAW_RANGE, Math.min(YAW_RANGE, yaw + SIGN_YAW * soft(yawRate) * dt));

    // PITCH: absolute, straight from gravity. Cannot drift, needs no compass.
    const elev = Math.asin(clamp(-uz)) * R2D;     // -uz: how far the screen normal is above level
    if (elev0 === null) elev0 = elev;
    elev0 += (elev - elev0) * 0.0006;             // neutral creeps to how it is actually held
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, SIGN_PITCH * dead(elev - elev0)));

    // Correct the integrated yaw. If the compass is genuinely moving, trust it slowly.
    // If it is dead or frozen, bleed toward centre instead so the drift stays bounded.
    if (head != null && headMoved > 4) {
      if (head0 === null) head0 = head;
      const target = Math.max(-YAW_RANGE, Math.min(YAW_RANGE, wrap(head - head0) * SIGN_YAW));
      yaw += (target - yaw) * FUSE;
    } else {
      yaw -= yaw * BLEED;
    }

    if (onDebug) onDebug({ yaw, pitch, rate: yawRate, compass: headMoved > 4, head: head });
  }

  // ---- compass, optional. Only ever used to correct drift, never as the primary source. ----
  function onOrient(e) {
    if (!enabled || !alive || e.alpha == null) return;
    const a = e.alpha * D2R, b = (e.beta || 0) * D2R, g = (e.gamma || 0) * D2R;
    const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
    const vx = -(cA*sG + cG*sA*sB), vy = -(sA*sG - cA*cG*sB);
    if (Math.hypot(vx, vy) < 0.15) return;        // aimed too near vertical for a heading
    const h = Math.atan2(vx, vy) * R2D;
    if (headPrev != null && Math.abs(wrap(h - headPrev)) > 0.6) headMoved = Math.min(20, headMoved + 1);
    headPrev = h; head = h;
  }

  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let dt = tickT ? (now - tickT) / 1000 : 1/60;
    tickT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1/60;
    const k = 1 - Math.exp(-dt / TAU);
    const tx = enabled ? clamp(yaw / YAW_RANGE) : 0;
    const ty = enabled ? clamp(pitch / PITCH_RANGE) : 0;
    cx += (tx - cx) * k;
    cy += (ty - cy) * k;
  }

  function attach() {
    window.addEventListener("devicemotion", onMotion, { passive: true });
    window.addEventListener("deviceorientationabsolute", onOrient, { passive: true });
    window.addEventListener("deviceorientation", onOrient, { passive: true });
  }
  function detach() {
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener("deviceorientationabsolute", onOrient);
    window.removeEventListener("deviceorientation", onOrient);
  }

  const onVis = () => { if (document.hidden) detach(); else if (enabled) { lastT = 0; attach(); } };
  document.addEventListener("visibilitychange", onVis);

  function request() {
    const DM = window.DeviceMotionEvent, DO = window.DeviceOrientationEvent;
    const gated = (DM && typeof DM.requestPermission === "function") || (DO && typeof DO.requestPermission === "function");
    if (!gated) { attach(); return Promise.resolve(true); }
    const asks = [];
    if (DM && DM.requestPermission) asks.push(DM.requestPermission().catch(() => "denied"));
    if (DO && DO.requestPermission) asks.push(DO.requestPermission().catch(() => "denied"));
    return Promise.all(asks).then(r => { const ok = r.some(s => s === "granted"); if (ok) attach(); return ok; });
  }

  const gated = window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function";
  if (enabled && !gated) attach();
  raf = requestAnimationFrame(tick);

  return {
    get() { return { x: cx, y: cy }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) { lastT = 0; attach(); } else detach(); },
    recentre() { yaw = 0; head0 = head; elev0 = null; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
