// PASTE TARGET: where2hang-hero-lab/tilt.js   (replaces previous · panorama model)
// Where2Hang — look-around LEAF. No dependencies. British spelling, no emojis.
//
// WHY EVERY PREVIOUS VERSION FELT WRONG.
// The target is a phone panorama viewer: turn the handset left and right, sweep across the
// scene. That motion is YAW — rotation about the world's vertical axis. Every earlier version
// read either deviceorientation gamma or the gravity vector, and NEITHER CAN SEE YAW: rotating
// about the gravity vector leaves gravity unchanged in the device frame, by definition. The
// input was physically incapable of responding to the movement being made. What it could see
// was roll — tipping the handset like a spirit level — which is a different gesture entirely.
// No amount of range, gain, damping or curve tuning could fix that, and several rounds were
// spent trying.
//
// THIS VERSION integrates the GYROSCOPE (DeviceMotionEvent.rotationRate), which measures
// angular velocity about all three axes and therefore sees yaw directly.
//   With the handset upright in portrait:
//     rotationRate.gamma -> about the phone's long axis -> YAW, turning left and right
//     rotationRate.beta  -> about the phone's short axis -> PITCH, nodding up and down
// Integrating rate over time gives relative angle, which is exactly what a panorama viewer
// uses. It tracks directly rather than springing, because a panorama does not lag your hand.
//
// Two corrections keep it honest:
//   A DEADBAND on the rate, so sensor noise is never integrated into a slow crawl.
//   A slow RECENTRE, because integrated gyroscope angle drifts. Panorama apps do not need
//   this since they are a whole session; a UI element does, or you eventually end up stuck
//   against one edge with no way back. It is slow enough to be invisible.
//
// API:  const t = mountTilt({ enabled: true });
//       t.get() -> { x, y }  in [-1,1]   x: yaw, y: pitch
//       t.setEnabled(bool);  t.recentre();  t.request() -> Promise<boolean>;  t.destroy();

export function mountTilt(opts = {}) {
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const YAW_RANGE   = opts.yawRange   ?? 46;   // degrees of turn for full sweep
  const PITCH_RANGE = opts.pitchRange ?? 30;   // degrees of nod for full vertical
  // SOFT deadband. A hard one (zero below the threshold) removes tremor but creates a
  // dead-then-jump as a slow turn crosses it. Subtracting the threshold instead is continuous:
  // tremor vanishes, and a deliberate turn starts from zero and builds smoothly.
  const RATE_DEAD   = opts.rateDeadband ?? 1.3;  // deg/sec of hand tremor to subtract
  const RECENTRE    = opts.recentre ?? 0.0003;   // fraction pulled back to zero per frame
  // Time constant, in seconds, not a per-frame fraction — so it behaves the same at 30fps and
  // 60fps. A distant city has mass: it eases toward where you are looking and keeps easing
  // briefly after the phone stops. Following the handset exactly is what reads as digital.
  const TAU         = opts.tau ?? 0.24;
  // ---------------------------------------------------------------------------------
  // DIRECTION. This is the only switch that controls which way the city moves. Change the
  // number, nothing else. +1 and -1 are the only valid values.
  //   SIGN_YAW = +1  turning the handset LEFT sweeps the view left across the city
  //   SIGN_YAW = -1  turning the handset LEFT sweeps the view right
  // Both conventions exist in the wild and gyroscope axis signs vary by device, so this is
  // settled by holding the phone, not by reasoning. Flip it here if it ever feels backwards.
  // ---------------------------------------------------------------------------------
  const SIGN_YAW   = opts.signYaw   ?? 1;
  const onDebug    = opts.onDebug || null;
  const SIGN_PITCH = opts.signPitch ?? -1;

  let yaw = 0, pitch = 0;      // integrated degrees
  let cx = 0, cy = 0;          // lightly smoothed output
  let enabled = opts.enabled !== false && !REDUCE;
  let alive = true, raf = 0, lastT = 0, haveGyro = false;

  const clamp = (v) => v < -1 ? -1 : v > 1 ? 1 : v;

  function onMotion(e) {
    if (!enabled || !alive) return;
    const r = e.rotationRate;
    if (!r || (r.gamma == null && r.beta == null)) return;
    haveGyro = true;

    const now = performance.now();
    let dt = e.interval ? e.interval / 1000 : (lastT ? (now - lastT) / 1000 : 1 / 60);
    lastT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1 / 60;      // ignore absurd gaps after a background pause

    const soft = (v) => { const a = Math.abs(v) - RATE_DEAD; return a <= 0 ? 0 : Math.sign(v) * a; };
    const gy = soft(r.gamma || 0), bt = soft(r.beta || 0);

    yaw   = Math.max(-YAW_RANGE,   Math.min(YAW_RANGE,   yaw   + SIGN_YAW   * gy * dt));
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, pitch + SIGN_PITCH * bt * dt));
    if (onDebug) onDebug({ rate: r.gamma || 0, yaw: yaw, sign: SIGN_YAW });
  }

  // Fallback for devices with no gyroscope: gravity gives roll and pitch but never yaw, so
  // this is a lesser experience by nature. It exists so nothing is completely static.
  let gx0 = null, gy0 = null, lgx = 0, lgy = 0, primed = false;
  function onGrav(e) {
    if (!enabled || !alive || haveGyro) return;
    const g = e.accelerationIncludingGravity;
    if (!g || (g.x == null && g.y == null)) return;
    if (!primed) { lgx = g.x || 0; lgy = g.y || 0; primed = true; }
    else { lgx = lgx * 0.9 + (g.x || 0) * 0.1; lgy = lgy * 0.9 + (g.y || 0) * 0.1; }
    if (gx0 === null) { gx0 = lgx; gy0 = lgy; return; }
    yaw   = Math.max(-YAW_RANGE,   Math.min(YAW_RANGE,   SIGN_YAW   * (lgx - gx0) * 6));
    pitch = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, SIGN_PITCH * (lgy - gy0) * 5));
  }

  let tickT = 0;
  function tick(now) {
    if (!alive) { raf = 0; return; }
    raf = requestAnimationFrame(tick);
    let dt = tickT ? (now - tickT) / 1000 : 1 / 60;
    tickT = now;
    if (!(dt > 0) || dt > 0.2) dt = 1 / 60;
    const k = 1 - Math.exp(-dt / TAU);          // frame-rate independent easing
    if (!enabled) { cx += (0 - cx) * k; cy += (0 - cy) * k; return; }
    // slow bleed back to centre — corrects gyroscope drift without being felt
    yaw   -= yaw   * RECENTRE;
    pitch -= pitch * RECENTRE;
    cx += (clamp(yaw / YAW_RANGE)     - cx) * k;
    cy += (clamp(pitch / PITCH_RANGE) - cy) * k;
  }

  function attach() {
    window.addEventListener("devicemotion", onMotion, { passive: true });
    window.addEventListener("devicemotion", onGrav, { passive: true });
  }
  function detach() {
    window.removeEventListener("devicemotion", onMotion);
    window.removeEventListener("devicemotion", onGrav);
  }

  const onVis = () => { if (document.hidden) detach(); else if (enabled) { lastT = 0; attach(); } };
  document.addEventListener("visibilitychange", onVis);

  // iOS 13+ gates devicemotion behind a gesture. Android grants silently.
  function request() {
    const DM = window.DeviceMotionEvent;
    if (!DM || typeof DM.requestPermission !== "function") { attach(); return Promise.resolve(true); }
    return DM.requestPermission()
      .then((s) => { const ok = s === "granted"; if (ok) attach(); return ok; })
      .catch(() => false);
  }

  const gated = window.DeviceMotionEvent && typeof window.DeviceMotionEvent.requestPermission === "function";
  if (enabled && !gated) attach();
  raf = requestAnimationFrame(tick);

  return {
    get() { return { x: cx, y: cy }; },
    setEnabled(v) { enabled = !!v && !REDUCE; if (enabled) { lastT = 0; attach(); } else detach(); },
    recentre() { yaw = 0; pitch = 0; gx0 = null; gy0 = null; primed = false; },
    request,
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf); raf = 0;
      detach(); document.removeEventListener("visibilitychange", onVis);
    },
  };
}
