// PASTE TARGET: where2hang-hero-lab/city-hero.js  (byte-identical to the app's lib/cityHero.js)
// Where2Hang — city hero LEAF (v2 · "Living Abu Dhabi"). Framework-agnostic WebGL.
// British spelling, no emojis. Requires the "three" dependency.
//
// The featured venue FLOATS over the water — no ring, no platform. A soft pool of light
// and a contact shadow sit beneath it. Only three cards ever show: previous, current, next.
// The camera drifts slowly around the stage (cinematic) while the front card holds focus;
// swipe to change venue, tap the front card to open it. Real photos load as textures
// (same-origin in the app), falling back to world art, then a drawn placeholder.
//
// API:  const h = mountCityHero(canvas, { venues, getState, onFront, onSelect }); h.destroy();
//   venues:  [{ name, sub, img, fallback, href, anchor }]
//   getState: () => ({ tod, busyness, hotIndex })
//   onFront:  (index, venue) => void
//   onSelect: (index, venue) => void

import * as THREE from "three";

export function mountCityHero(canvas, opts) {
  const venues = (opts.venues || []).slice(0, 12);
  const getState = opts.getState || (() => ({ tod: "night", busyness: 0.4, hotIndex: -1 }));
  const onFront = opts.onFront || (() => {});
  const onSelect = opts.onSelect || (() => {});
  if (!venues.length) return { destroy() {} };

  const N = venues.length;
  const CW = 2.5, CH = 2.78, CHALF = CH / 2;
  const SPACING = 2.2, SIDE_ANGLE = 0.55, FLOAT = 0.55;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    const set = (tex) => { tex.anisotropy = 4; mat.map = tex; mat.needsUpdate = true; };
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

  // stars (sparse)
  const stars = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: radialTex("rgba(220,240,255,.9)", "rgba(180,210,255,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(-8 + Math.random() * 16, 3.6 + Math.random() * 2.4, -8); s.userData = { base: .18 + Math.random() * .2, tw: i < 3, ph: Math.random() * 6.28, sp: .6 + Math.random() }; scene.add(s); stars.push(s);
  }
  // one ferry + one plane (rare, subtle)
  const boat = new THREE.Mesh(new THREE.PlaneGeometry(.55, .55), new THREE.MeshBasicMaterial({ map: radialTex("rgba(244,220,150,.9)", "rgba(244,200,120,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  boat.position.set(0, -1.5, -6.5); boat.userData = { active: false, x: 0, dir: 1, sp: 0 }; scene.add(boat);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(.26, .26), new THREE.MeshBasicMaterial({ map: radialTex("rgba(255,255,255,1)", "rgba(180,220,255,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  plane.userData = { active: false, p: 0, y0: 0, dir: 1 }; scene.add(plane);

  // venue cards
  const geo = new THREE.PlaneGeometry(CW, CH);
  const cards = venues.map((v) => {
    const mat = new THREE.MeshBasicMaterial({ map: placeholderTex(v), transparent: true, opacity: 0 });
    loadPhoto(mat, v);
    const m = new THREE.Mesh(geo, mat); m.visible = false; scene.add(m); return m;
  });

  function fit() {
    const fa = Math.min(W / H, 1.4), halfSpan = SPACING * 0.66 + CW * 0.5, vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let z = Math.max(halfSpan / (vh * fa), halfSpan / vh, 6.5) * 0.98;   // cap aspect for the Fold; tighter frame = bigger cards
    bx = 0; by = z * 0.36 + 0.4; bz = z;
    camera.position.set(bx, by, bz); camera.lookAt(0, CHALF + FLOAT * 0.5, 0);
  }
  fit();

  // ---- interaction: swipe changes venue (prev/next); tap opens ----
  let target = 0, cur = 0, down = false, moved = false, sx = 0, st = 0, dt0 = 0;
  function frontIndex() { return ((Math.round(cur)) % N + N) % N; }
  function down_(e) { down = true; moved = false; sx = e.clientX; st = target; dt0 = performance.now(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }
  function move_(e) { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; target = st - dx / 150; }
  function up_() {
    if (!down) return; down = false;
    if (!moved && performance.now() - dt0 < 300) { const i = frontIndex(); onSelect(i, venues[i]); return; }
    target = Math.round(target);
  }
  canvas.addEventListener("pointerdown", down_);
  canvas.addEventListener("pointermove", move_);
  canvas.addEventListener("pointerup", up_);
  canvas.addEventListener("pointercancel", up_);
  window.addEventListener("pointerup", up_);

  function onResize() { W = canvas.clientWidth; H = canvas.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); fit(); }
  window.addEventListener("resize", onResize);

  let running = true;
  const onVis = () => { running = !document.hidden; };
  document.addEventListener("visibilitychange", onVis);
  const io = new IntersectionObserver((es) => es.forEach((e) => (running = e.isIntersecting)), { threshold: 0.05 });
  io.observe(canvas);

  // ambient scheduler: one rare event every 18–32s
  let nextEvent = 0;
  function fire() {
    if (Math.random() < 0.3) { if (!plane.userData.active) { plane.userData.active = true; plane.userData.p = 0; plane.userData.dir = Math.random() > .5 ? 1 : -1; plane.userData.y0 = 4 + Math.random() * 1.2; } }
    else if (!boat.userData.active) { boat.userData.active = true; boat.userData.dir = Math.random() > .5 ? 1 : -1; boat.userData.x = boat.userData.dir > 0 ? -9 : 9; boat.userData.sp = .006 + Math.random() * .005; }
  }

  const t0 = performance.now(); let lastIdx = -1, raf = 0, hintStart = -1;
  function frame() {
    raf = requestAnimationFrame(frame); if (!running) return;
    const t = (performance.now() - t0) / 1000; const S = getState(); const busy = S.busyness ?? 0.4;
    if (nextEvent === 0) nextEvent = t + 18 + Math.random() * 14;
    if (t > nextEvent) { fire(); nextEvent = t + (18 + (1 - busy) * 6) + Math.random() * 8; }

    cur += (target - cur) * 0.12;
    const idx = frontIndex(); const hot = idx === S.hotIndex; const pulse = hot ? (0.5 + 0.5 * Math.sin(t * 3)) : 0;

    // gentle one-time nudge ~1s after load, to say "I'm swipeable"
    if (hintStart < 0 && t > 1.1) hintStart = t;
    let hintOff = 0;
    if (hintStart > 0 && t - hintStart < 0.8) { const p = t - hintStart; hintOff = Math.sin(p * 8) * 0.1 * (1 - p / 0.8); }
    const ec = cur + hintOff;
    // prev / current / next — the sides PEEK at the edges (not hidden) so the carousel is discoverable
    cards.forEach((m, i) => {
      let off = i - ec; if (off > N / 2) off -= N; if (off < -N / 2) off += N;
      const a = Math.abs(off);
      if (a > 1.15) { m.visible = false; return; }
      m.visible = true;
      const centre = Math.max(0, 1 - a);
      const s = 0.82 + centre * 0.42;                       // centre ~10% larger, sides ~5% smaller
      m.scale.set(s, s, s);
      m.position.x = off * SPACING * (1 + a * 0.18);        // clean gap even with the wider card
      m.position.z = -a * 1.5;
      m.position.y = CHALF + FLOAT * (0.6 + centre * 0.4) + Math.sin(t * 1.1) * 0.05 * centre;
      m.rotation.y = -off * SIDE_ANGLE;
      m.material.opacity = Math.max(0, 1 - a * 0.1);        // near-solid: front 100%, peeks ~90%
    });

    // stage lighting follows the floating centre card
    pool.material.opacity = 0.4 + busy * 0.1 + pulse * 0.25;
    shadow.material.opacity = 0.5 - Math.abs(cur - Math.round(cur)) * 0.2;      // firm when settled, softer mid-swipe
    backGlow.material.opacity = 0.26 + 0.08 * Math.sin(t * 1.4) + pulse * 0.2;
    backGlow.position.y = CHALF + FLOAT + Math.sin(t * 1.1) * 0.05;
    water.material.opacity = 0.28 + busy * 0.12 + Math.sin(t * 0.7) * 0.03;
    stars.forEach((s) => { const b = s.userData.base; s.material.opacity = s.userData.tw ? b * (0.5 + 0.5 * Math.sin(t * s.userData.sp + s.userData.ph)) : b; });

    // subtle cinematic camera drift (the camera moves, the venue does not spin)
    camera.position.set(bx + Math.sin(t * 0.16) * 0.55, by + Math.sin(t * 0.22) * 0.18, bz + Math.cos(t * 0.16) * 0.22);
    camera.lookAt(0, CHALF + FLOAT * 0.5, 0);

    if (boat.userData.active) { boat.userData.x += boat.userData.sp * boat.userData.dir; boat.position.x = boat.userData.x; const e = 1 - Math.min(1, (9 - Math.abs(boat.userData.x)) / 2); boat.material.opacity = 0.45 * (1 - e); boat.position.y = -1.5 + Math.sin(t * 1.1 + boat.position.x) * 0.04; if (Math.abs(boat.userData.x) > 9) { boat.userData.active = false; boat.material.opacity = 0; } }
    if (plane.userData.active) { plane.userData.p += 0.0016; const p = plane.userData.p; plane.position.x = (-8 + p * 16) * plane.userData.dir; plane.position.y = plane.userData.y0 + Math.sin(p * Math.PI) * 1.1; plane.material.opacity = Math.max(0, Math.sin(p * Math.PI)) * (0.5 + 0.5 * Math.sin(t * 8)) * 0.9; if (p >= 1) { plane.userData.active = false; plane.material.opacity = 0; } }

    if (idx !== lastIdx) { lastIdx = idx; onFront(idx, venues[idx]); }
    renderer.render(scene, camera);
  }
  frame();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", up_);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      renderer.dispose();
    },
  };
}
