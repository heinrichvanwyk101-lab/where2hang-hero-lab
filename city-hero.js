// PASTE TARGET: where2hang-hero-lab/city-hero.js  (replaces previous · v3)
// Where2Hang — city hero LEAF (v3 · "Living Abu Dhabi"). Framework-agnostic WebGL.
// British spelling, no emojis. Requires the "three" dependency.
//
// v3 changes (Spec v2 §3 — performance and battery budget). Nothing visual changed:
//   1. TRUE loop shutdown. v2 kept calling requestAnimationFrame forever and merely skipped
//      the work when offscreen, so the tick never idled. v3 cancels the loop and restarts it
//      with kick() — the same pattern area-rail.js already uses.
//   2. 30fps limiter when idle, 60fps while a finger is down. Drift and float are
//      indistinguishable at 30; touch is where the difference is felt.
//   3. Frame-rate-independent easing. The old `cur += (target-cur)*0.12` was per-frame, so at
//      30fps the carousel would have settled at half speed. Now driven by dt.
//   4. prefers-reduced-motion: no drift, no float, no twinkle. Static stage.
//   5. Frame-time watchdog -> opts.onDowngrade() after 60 consecutive expensive frames.
//   6. MSAA only below DPR 2 (at 2x the rounded card edges resolve fine without it).
//   7. pause() / resume() exported.
//
// API:  const h = mountCityHero(canvas, { venues, getState, onFront, onSelect, onDowngrade });
//       h.pause(); h.resume(); h.destroy();
//   venues:  [{ name, sub, img, fallback, href, anchor }]
//   getState: () => ({ tod, busyness, hotIndex })
//   onFront:  (index, venue) => void
//   onSelect: (index, venue) => void
//   onDowngrade: () => void        // fires once if the device cannot hold the frame budget

import * as THREE from "three";

export function mountCityHero(canvas, opts) {
  const venues = (opts.venues || []).slice(0, 12);
  const getState = opts.getState || (() => ({ tod: "night", busyness: 0.4, hotIndex: -1 }));
  const onFront = opts.onFront || (() => {});
  const onSelect = opts.onSelect || (() => {});
  const onDowngrade = opts.onDowngrade || (() => {});
  if (!venues.length) return { destroy() {}, pause() {}, resume() {} };

  const N = venues.length;
  const CW = 2.5, CH = 2.78, CHALF = CH / 2;
  const SPACING = 2.2, SIDE_ANGLE = 0.55, FLOAT = 0.55;

  // ---- budget constants (Spec v2 §3) ----
  const DPR = Math.min(window.devicePixelRatio || 1, 2);          // §3.3 cap DPR at 2
  const MIN_MS_IDLE = 1000 / 30;                                  // §3.4 30fps when ambient
  const MIN_MS_TOUCH = 0;                                         //      unthrottled while dragging
  const SLOW_FRAME_MS = 25, SLOW_FRAME_RUN = 60;                  //      watchdog threshold
  const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true,
    antialias: DPR < 2,            // at 2x the card edges resolve without MSAA — real saving
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(DPR);
  let W = canvas.clientWidth, H = canvas.clientHeight || 1;
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  let bx = 0, by = 0, bz = 9; // camera base (set by fit)

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function placeholderTex(v) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 680; const c = cv.getContext("2d");
    rr(c, 6, 6, 500, 668, 44); c.clip();
    const g = c.createLinearGradient(0, 0, 0, 680); g.addColorStop(0, "#16202a"); g.addColorStop(1, "#070d11"); c.fillStyle = g; c.fillRect(0, 0, 512, 680);
    const rg = c.createRadialGradient(360, 130, 10, 360, 130, 430); rg.addColorStop(0, "rgba(0,194,168,.28)"); rg.addColorStop(1, "transparent"); c.fillStyle = rg; c.fillRect(0, 0, 512, 680);
    const sg = c.createLinearGradient(0, 380, 0, 680); sg.addColorStop(0, "transparent"); sg.addColorStop(1, "rgba(4,10,12,.95)"); c.fillStyle = sg; c.fillRect(0, 380, 512, 300);
    c.fillStyle = "#F3F8F7"; c.font = "800 42px Inter, sans-serif"; c.fillText(v.name || "", 40, 590, 440);
    if (v.sub) { c.fillStyle = "#b6c5c3"; c.font = "500 24px Inter, sans-serif"; c.fillText(v.sub, 40, 630, 440); }
    c.strokeStyle = "rgba(255,255,255,.18)"; c.lineWidth = 3; rr(c, 8, 8, 496, 664, 42); c.stroke();
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
  }
  function radialTex(inner, outer) {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const c = cv.getContext("2d");
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(.5, outer); g.addColorStop(1, "transparent");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
  }
  const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";
  function loadPhoto(mat, v) {
    const set = (tex) => { tex.anisotropy = 4; mat.map = tex; mat.needsUpdate = true; kick(); };
    const tryFb = () => { if (v.fallback) loader.load(v.fallback, set, undefined, () => {}); };
    if (v.img) loader.load(v.img, set, undefined, tryFb); else tryFb();
  }

  // ---- stage furniture: NO ring. Pool of light + contact shadow beneath the floating card ----
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: radialTex("rgba(61,233,205,.34)", "rgba(0,194,168,.04)"), transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 0.2); scene.add(pool);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ map: radialTex("rgba(2,6,8,.6)", "rgba(2,6,8,.15)"), transparent: true, opacity: .55, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, 0.03, 0.35); scene.add(shadow);
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4.2),
    new THREE.MeshBasicMaterial({ map: radialTex("rgba(61,233,205,.3)", "rgba(0,194,168,.03)"), transparent: true, opacity: .3, depthWrite: false, blending: THREE.AdditiveBlending }));
  backGlow.position.set(0, CHALF + FLOAT, -0.6); scene.add(backGlow);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 3),
    new THREE.MeshBasicMaterial({ map: radialTex("rgba(0,194,168,.16)", "rgba(0,40,44,.03)"), transparent: true, opacity: .32, depthWrite: false, blending: THREE.AdditiveBlending }));
  water.position.set(0, -1.6, -6); water.rotation.x = -0.2; scene.add(water);

  // The skyline PLATE supplies the real sky, stars and water. We keep only a few faint
  // twinkles welded to the camera (so they never slide) — no traffic, no planes, no boats.
  const ambient = new THREE.Group(); camera.add(ambient); if (!scene.children.includes(camera)) scene.add(camera);
  const stars = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.16, .16), new THREE.MeshBasicMaterial({ map: radialTex("rgba(220,240,255,.9)", "rgba(180,210,255,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(-2.2 + Math.random() * 4.4, 1.4 + Math.random() * 1.6, -6);
    s.userData = { base: .16 + Math.random() * .16, ph: Math.random() * 6.28, sp: .5 + Math.random() * .6 };
    ambient.add(s); stars.push(s);
  }

  // window overlay (vignette + bottom scrim + top light-catch) and a soft cast shadow — drawn once, shared
  function frameTex() {
    const W2 = 512, H2 = 569, cv = document.createElement("canvas"); cv.width = W2; cv.height = H2; const c = cv.getContext("2d");
    let rg = c.createRadialGradient(W2 / 2, H2 / 2, H2 * 0.34, W2 / 2, H2 / 2, H2 * 0.66);
    rg.addColorStop(0, "transparent"); rg.addColorStop(1, "rgba(0,0,0,.26)"); c.fillStyle = rg; c.fillRect(0, 0, W2, H2);
    let g = c.createLinearGradient(0, H2, 0, H2 - 165); g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(1, "transparent"); c.fillStyle = g; c.fillRect(0, H2 - 165, W2, 165);
    g = c.createLinearGradient(0, 2, 0, 30); g.addColorStop(0, "rgba(220,255,251,.32)"); g.addColorStop(1, "transparent"); c.fillStyle = g; c.fillRect(16, 2, W2 - 32, 28);
    return new THREE.CanvasTexture(cv);
  }
  function cardShadowTex() {
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 300; const c = cv.getContext("2d");
    c.shadowColor = "rgba(0,0,0,.8)"; c.shadowBlur = 48; c.shadowOffsetY = 12; c.fillStyle = "rgba(0,0,0,.85)"; c.fillRect(44, 40, 168, 220);
    return new THREE.CanvasTexture(cv);
  }
  const frameT = frameTex(), shadowT = cardShadowTex();

  // venue cards — each a window: cast shadow (behind) + photo + frame overlay (front)
  function roundedPlane(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const g = new THREE.ShapeGeometry(s, 16), p = g.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + w / 2) / w, (p.getY(i) + h / 2) / h);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  const geo = roundedPlane(CW, CH, 0.17);
  const shadowGeo = new THREE.PlaneGeometry(CW * 1.24, CH * 1.2);
  const cards = venues.map((v) => {
    const g = new THREE.Group();
    const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowT, transparent: true, opacity: 0, depthWrite: false }));
    sh.position.set(0, -0.14, -0.08);
    const photo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: placeholderTex(v), transparent: true, opacity: 0 }));
    loadPhoto(photo.material, v);
    const fr = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: frameT, transparent: true, opacity: 0, depthWrite: false }));
    fr.position.z = 0.012;
    g.add(sh); g.add(photo); g.add(fr); g.visible = false; scene.add(g);
    g.userData = { photo, fr, sh };
    return g;
  });

  function fit() {
    const fa = Math.min(W / H, 1.4), halfSpan = SPACING * 0.66 + CW * 0.5, vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let z = Math.max(halfSpan / (vh * fa), halfSpan / vh, 6.5) * 0.98;   // cap aspect for the Fold; tighter frame = bigger cards
    bx = 0; by = z * 0.36 + 0.4; bz = z;
    camera.position.set(bx, by, bz); camera.lookAt(0, 1.25, 0);
  }
  fit();

  // ---- interaction: swipe changes venue (prev/next); tap opens ----
  let target = 0, cur = 0, down = false, moved = false, sx = 0, st = 0, dt0 = 0;
  function frontIndex() { return ((Math.round(cur)) % N + N) % N; }
  function down_(e) { down = true; moved = false; sx = e.clientX; st = target; dt0 = performance.now(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); kick(); }
  function move_(e) { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; target = st - dx / 150; }
  function up_() {
    if (!down) return; down = false;
    if (!moved && performance.now() - dt0 < 300) { const i = frontIndex(); onSelect(i, venues[i]); return; }
    target = Math.round(target);
    kick();
  }
  canvas.addEventListener("pointerdown", down_);
  canvas.addEventListener("pointermove", move_);
  canvas.addEventListener("pointerup", up_);
  canvas.addEventListener("pointercancel", up_);
  window.addEventListener("pointerup", up_);

  function onResize() { W = canvas.clientWidth; H = canvas.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); fit(); kick(); }
  window.addEventListener("resize", onResize);

  // ---- loop lifecycle (Spec v2 §3.1/§3.2) — cancel the loop, do not idle-spin it ----
  let alive = true, visible = true, onscreen = true, raf = 0, lastT = 0;
  let slowRun = 0, downgraded = false;
  const t0 = performance.now(); let lastIdx = -1, hintStart = -1;

  function shouldRun() { return alive && visible && onscreen; }
  function kick() { if (!raf && shouldRun()) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function sync() { if (shouldRun()) kick(); else halt(); }

  const onVis = () => { visible = !document.hidden; sync(); };
  document.addEventListener("visibilitychange", onVis);
  const io = new IntersectionObserver((es) => es.forEach((e) => { onscreen = e.isIntersecting; sync(); }), { threshold: 0.05 });
  io.observe(canvas);

  function frame(now) {
    if (!shouldRun()) { raf = 0; return; }
    raf = requestAnimationFrame(frame);

    // frame limiter: 30fps ambient, uncapped while a finger is down
    const minMs = down ? MIN_MS_TOUCH : MIN_MS_IDLE;
    if (lastT && now - lastT < minMs - 0.5) return;
    const dt = lastT ? Math.min((now - lastT) / 1000, 0.1) : 1 / 60;
    lastT = now;
    const work0 = performance.now();

    const t = (work0 - t0) / 1000; const S = getState(); const busy = S.busyness ?? 0.4;

    // frame-rate-independent easing (was a fixed 0.12 per frame)
    cur += (target - cur) * (1 - Math.pow(1 - 0.12, dt * 60));
    if (!down) { while (cur >= N) { cur -= N; target -= N; } while (cur < 0) { cur += N; target += N; } }  // keep small forever (invisible shift) -> no nth-round blank
    const idx = frontIndex(); const hot = idx === S.hotIndex; const pulse = (hot && !REDUCE) ? (0.5 + 0.5 * Math.sin(t * 3)) : 0;

    // gentle one-time nudge ~1s after load, to say "I'm swipeable"
    if (hintStart < 0 && t > 1.1) hintStart = t;
    let hintOff = 0;
    if (!REDUCE && hintStart > 0 && t - hintStart < 0.8) { const p = t - hintStart; hintOff = Math.sin(p * 8) * 0.1 * (1 - p / 0.8); }
    const ec = cur + hintOff;
    const bob = REDUCE ? 0 : Math.sin(t * 1.1) * 0.05;

    // prev / current / next — the sides PEEK at the edges (not hidden) so the carousel is discoverable
    cards.forEach((g, i) => {
      let off = (i - ec) % N; if (off > N / 2) off -= N; if (off < -N / 2) off += N;
      const a = Math.abs(off);
      if (a > 1.15) { g.visible = false; return; }
      g.visible = true;
      const centre = Math.max(0, 1 - a);
      const s = 0.76 + centre * 0.57;                       // centre clearly the largest
      g.scale.set(s, s, s);
      g.position.x = Math.sign(off) * SPACING * Math.pow(a, 1.7) * (1 + a * 0.08);  // ease toward centre mid-swipe -> no empty gap; full peek at rest
      g.position.z = -a * 1.5;
      g.position.y = CHALF + FLOAT * (0.2 + centre * 0.4) + bob * centre;  // sit closer to the water
      g.rotation.y = -off * SIDE_ANGLE;
      const op = Math.max(0, 1 - a * 0.45);                 // side cards ~55%
      g.userData.photo.material.opacity = op;
      g.userData.fr.material.opacity = op * 0.7;            // gentle overlay, no heavy frame
      g.userData.sh.material.opacity = op * 0.5;            // soft shadow only
    });

    // stage lighting follows the floating centre card
    pool.material.opacity = 0.4 + busy * 0.1 + pulse * 0.25;
    shadow.material.opacity = 0.5 - Math.abs(cur - Math.round(cur)) * 0.2;      // firm when settled, softer mid-swipe
    backGlow.material.opacity = 0.26 + (REDUCE ? 0 : 0.08 * Math.sin(t * 1.4)) + pulse * 0.2;
    backGlow.position.y = CHALF + FLOAT + bob;
    water.material.opacity = 0.28 + busy * 0.12 + (REDUCE ? 0 : Math.sin(t * 0.7) * 0.03);
    if (!REDUCE) stars.forEach((s) => { s.material.opacity = s.userData.base * (0.45 + 0.55 * Math.sin(t * s.userData.sp + s.userData.ph)); });

    // cinematic drift as a pure DOLLY: translate the camera AND its look-at together (no rotation)
    const dxx = REDUCE ? 0 : Math.sin(t * 0.16) * 0.55;
    const dyy = REDUCE ? 0 : Math.sin(t * 0.22) * 0.18;
    const dzz = REDUCE ? 0 : Math.cos(t * 0.16) * 0.22;
    camera.position.set(bx + dxx, by + dyy, bz + dzz);
    camera.lookAt(dxx, 1.25 + dyy, dzz);
    // ambient translates with the camera -> screen-locked to the static skyline, no slide, no parallax
    ambient.position.set(dxx, dyy, dzz);

    if (idx !== lastIdx) { lastIdx = idx; onFront(idx, venues[idx]); }
    renderer.render(scene, camera);

    // watchdog: sustained expensive frames -> tell the host to fall back (Spec v2 §3)
    if (!downgraded) {
      slowRun = (performance.now() - work0) > SLOW_FRAME_MS ? slowRun + 1 : 0;
      if (slowRun >= SLOW_FRAME_RUN) { downgraded = true; try { onDowngrade(); } catch (e) {} }
    }

    // settled and idle: stop the loop entirely until something wakes it
    if (REDUCE && !down && Math.abs(target - cur) < 0.0004) { cur = target; renderer.render(scene, camera); halt(); }
  }
  kick();

  return {
    pause() { alive = false; halt(); },
    resume() { alive = true; sync(); },
    destroy() {
      alive = false; halt();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", up_);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      cards.forEach((g) => { g.userData.photo.material.map && g.userData.photo.material.map.dispose(); g.userData.photo.material.dispose(); g.userData.fr.material.dispose(); g.userData.sh.material.dispose(); });
      geo.dispose(); shadowGeo.dispose(); frameT.dispose(); shadowT.dispose();
      renderer.dispose();
    },
  };
}
