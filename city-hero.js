// PASTE TARGET: where2hang-hero-lab/city-hero.js  (byte-identical to the app's lib/cityHero.js)
// Where2Hang — city hero LEAF. Framework-agnostic WebGL turntable.
// British spelling, no emojis. Requires the "three" dependency (add to package.json).
//
// The venue floats above an illuminated ring over the city; drag to spin, tap the
// front card to open it. Real venue photos load as textures (same-origin /images/*),
// falling back to the world hero art, then to a drawn placeholder — never a blank.
// Subtle ambient (a few stars, an occasional ferry, a rare plane) obeys the ambient
// rules: capped, rare, non-repeating. The loop renders only while visible.
//
// API:  const h = mountCityHero(canvasEl, { venues, getState, onFront, onSelect });
//       h.destroy();
//   venues:  [{ name, sub, img, fallback, href, anchor }]
//   getState: () => ({ tod, busyness, hotIndex })   // from lib/cityState
//   onFront:  (index, venue) => void                 // front card changed
//   onSelect: (index, venue) => void                 // front card tapped

import * as THREE from "three";

export function mountCityHero(canvas, opts) {
  const venues = (opts.venues || []).slice(0, 9);      // keep the ring readable
  const getState = opts.getState || (() => ({ tod: "night", busyness: 0.4, hotIndex: -1 }));
  const onFront = opts.onFront || (() => {});
  const onSelect = opts.onSelect || (() => {});
  if (!venues.length) return { destroy() {} };

  const N = venues.length, theta = (Math.PI * 2) / N;
  const R = 2.4 + N * 0.12, CW = 1.95, CH = 2.55, CHALF = CH / 2;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let W = canvas.clientWidth, H = canvas.clientHeight || 1;
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);

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
  function glowTex(inner, outer) {
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 128; const c = cv.getContext("2d");
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(.5, outer); g.addColorStop(1, "transparent");
    c.fillStyle = g; c.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
  }
  // load real photo → world-hero fallback → keep placeholder
  const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";
  function loadPhoto(mat, v) {
    const set = (tex) => { tex.anisotropy = 4; mat.map = tex; mat.needsUpdate = true; };
    const tryFallback = () => { if (!v.fallback) return; loader.load(v.fallback, set, undefined, () => {}); };
    if (v.img) loader.load(v.img, set, undefined, tryFallback); else tryFallback();
  }

  // ---- scene furniture ----
  const ring = new THREE.Mesh(new THREE.RingGeometry(R + 0.55, R + 0.72, 96),
    new THREE.MeshBasicMaterial({ color: 0x00c2a8, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ map: glowTex("rgba(61,233,205,.4)", "rgba(0,194,168,.05)"), transparent: true, opacity: .4, depthWrite: false, blending: THREE.AdditiveBlending }));
  groundGlow.rotation.x = -Math.PI / 2; groundGlow.position.set(0, .02, R); scene.add(groundGlow);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(30, 3),
    new THREE.MeshBasicMaterial({ map: glowTex("rgba(0,194,168,.16)", "rgba(0,40,44,.03)"), transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }));
  water.position.set(0, -2.4, -7); water.rotation.x = -0.2; scene.add(water);

  // hologram at the fixed front slot
  const frontGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5),
    new THREE.MeshBasicMaterial({ map: glowTex("rgba(61,233,205,.45)", "rgba(0,194,168,.05)"), transparent: true, opacity: .34, depthWrite: false, blending: THREE.AdditiveBlending }));
  frontGlow.position.set(0, 1.5, R - 0.05); scene.add(frontGlow);
  const beamCv = document.createElement("canvas"); beamCv.width = 64; beamCv.height = 128;
  { const c = beamCv.getContext("2d"); const g = c.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, "rgba(61,233,205,.5)"); g.addColorStop(1, "rgba(61,233,205,0)"); c.fillStyle = g; c.fillRect(0, 0, 64, 128); }
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamCv), transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.set(0, 1.3, R - 0.08); scene.add(beam);
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x9df6ea, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scan.position.set(0, 1.4, R + 0.02); scene.add(scan);

  // stars (a few, sparse)
  const stars = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.3, .3), new THREE.MeshBasicMaterial({ map: glowTex("rgba(220,240,255,.9)", "rgba(180,210,255,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set(-8 + Math.random() * 16, 3.4 + Math.random() * 2.6, -9); s.userData = { base: .18 + Math.random() * .22, tw: i < 3, ph: Math.random() * 6.28, sp: .6 + Math.random() }; scene.add(s); stars.push(s);
  }
  // one ferry + one plane (rare, scheduled)
  const boat = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: glowTex("rgba(244,220,150,.9)", "rgba(244,200,120,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  boat.position.set(0, -2.2, -8); boat.userData = { active: false, x: 0, dir: 1, sp: 0 }; scene.add(boat);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(.28, .28), new THREE.MeshBasicMaterial({ map: glowTex("rgba(255,255,255,1)", "rgba(180,220,255,0)"), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  plane.userData = { active: false, p: 0, y0: 0, dir: 1 }; scene.add(plane);

  // venue cards
  const venueGrp = new THREE.Group(); scene.add(venueGrp);
  const geo = new THREE.PlaneGeometry(CW, CH);
  const cards = venues.map((v, i) => {
    const mat = new THREE.MeshBasicMaterial({ map: placeholderTex(v), transparent: true });
    loadPhoto(mat, v);
    const m = new THREE.Mesh(geo, mat); const a = i * theta;
    m.position.set(Math.sin(a) * R, CHALF, Math.cos(a) * R); m.rotation.y = a;
    venueGrp.add(m); return m;
  });

  function fit() {
    const aspect = W / H, halfSpan = Math.sin(theta) * R + CW * 0.6, vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let z = Math.max(halfSpan / (vh * aspect), halfSpan / vh, 8.5) * 1.14;
    camera.position.set(0, z * 0.4, z); camera.lookAt(0, 0.7, 0);
  }
  fit();

  // ---- interaction (drag to spin, tap to open) ----
  let angle = 0, cur = 0, down = false, moved = false, sx = 0, sa = 0, vel = 0, dt0 = 0;
  function frontIndex() { return ((Math.round(-cur / theta)) % N + N) % N; }
  function down_(e) { down = true; moved = false; sx = e.clientX; sa = angle; vel = 0; dt0 = performance.now(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); }
  function move_(e) { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; angle = sa + (dx / 130) * theta * 1.5; vel = dx; }
  function up_() {
    if (!down) return; down = false;
    if (!moved && performance.now() - dt0 < 300) { const i = frontIndex(); onSelect(i, venues[i]); return; }
    angle = Math.round(angle / theta) * theta;
  }
  canvas.addEventListener("pointerdown", down_);
  canvas.addEventListener("pointermove", move_);
  canvas.addEventListener("pointerup", up_);
  canvas.addEventListener("pointercancel", up_);
  window.addEventListener("pointerup", up_);

  function onResize() { W = canvas.clientWidth; H = canvas.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); fit(); }
  window.addEventListener("resize", onResize);

  // ---- render-on-visible ----
  let running = true;
  const onVis = () => { running = !document.hidden; };
  document.addEventListener("visibilitychange", onVis);
  const io = new IntersectionObserver((es) => es.forEach((e) => (running = e.isIntersecting)), { threshold: 0.05 });
  io.observe(canvas);

  // ---- ambient scheduler: one rare event every 18–32s ----
  let nextEvent = 0;
  function fire(st) {
    if (Math.random() < 0.3) { if (!plane.userData.active) { plane.userData.active = true; plane.userData.p = 0; plane.userData.dir = Math.random() > .5 ? 1 : -1; plane.userData.y0 = 4 + Math.random() * 1.2; } }
    else if (!boat.userData.active) { boat.userData.active = true; boat.userData.dir = Math.random() > .5 ? 1 : -1; boat.userData.x = boat.userData.dir > 0 ? -9 : 9; boat.userData.sp = .006 + Math.random() * .005; }
  }

  const t0 = performance.now(); let lastIdx = -1, raf = 0, idle = 0;
  function frame() {
    raf = requestAnimationFrame(frame); if (!running) return;
    const t = (performance.now() - t0) / 1000; const S = getState(); const busy = S.busyness ?? 0.4;
    if (nextEvent === 0) nextEvent = t + 18 + Math.random() * 14;
    if (t > nextEvent) { fire(S); nextEvent = t + (18 + (1 - busy) * 6) + Math.random() * 8; }

    if (!down) { idle++; if (idle > 90) angle -= 0.0022; }   // gentle auto-drift
    cur += (angle - cur) * 0.12; venueGrp.rotation.y = cur;

    const idx = frontIndex(); const hot = idx === S.hotIndex; const pulse = hot ? (0.5 + 0.5 * Math.sin(t * 3)) : 0;
    cards.forEach((m, i) => {
      let d = ((i * theta + cur) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (d > Math.PI) d = Math.PI * 2 - d;
      const f = Math.pow(1 - d / Math.PI, 1.5), s = 0.5 + f * 0.72;
      m.scale.set(s, s, s); m.material.opacity = 0.12 + f * 0.88; m.position.y = (1.15 + f * 0.55) + Math.sin(t * 1.3) * 0.05 * f;
    });
    frontGlow.material.opacity = 0.3 + 0.1 * Math.sin(t * 1.5) + pulse * 0.25;
    beam.material.opacity = 0.24 + 0.06 * Math.sin(t * 2);
    scan.position.y = 1.35 + ((t * 0.5) % 1) * 1.05; scan.material.opacity = 0.09 + 0.05 * Math.sin(t * 6);
    groundGlow.material.opacity = 0.36 + busy * 0.1 + pulse * 0.3;
    water.material.opacity = 0.28 + busy * 0.14 + Math.sin(t * 0.7) * 0.03;
    stars.forEach((s) => { const b = s.userData.base; s.material.opacity = s.userData.tw ? b * (0.5 + 0.5 * Math.sin(t * s.userData.sp + s.userData.ph)) : b; });

    if (boat.userData.active) { boat.userData.x += boat.userData.sp * boat.userData.dir; boat.position.x = boat.userData.x; const e = 1 - Math.min(1, (9 - Math.abs(boat.userData.x)) / 2); boat.material.opacity = 0.45 * (1 - e); boat.position.y = -2.2 + Math.sin(t * 1.1 + boat.position.x) * 0.04; if (Math.abs(boat.userData.x) > 9) { boat.userData.active = false; boat.material.opacity = 0; } }
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
