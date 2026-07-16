// PASTE TARGET: where2hang-hero-lab/area-rail.js  (app: lib/areaRail.js)
// Where2Hang — Explore by Area LEAF. The second signature. A shallow CONVEX arc of
// district cards that bow toward the viewer: the centre district is nearest and largest,
// neighbours curve back and angle away. Drag-only (no idle motion), subtle depth parallax,
// real photography, labels baked on a generated (untainted) overlay. British spelling.
//
// API:  const r = mountAreaRail(canvas, { areas, onFront, onSelect }); r.destroy();
//   areas: [{ name, count, img, fallback }]
//   onFront(i, area) -> void   onSelect(i, area) -> void

import * as THREE from "three";

export function mountAreaRail(canvas, opts) {
  const areas = opts.areas || [];
  const onFront = opts.onFront || (() => {});
  const onSelect = opts.onSelect || (() => {});
  if (!areas.length) return { destroy() {} };

  const N = areas.length, STEP = 0.40, R = 6.5, CW = 2.35, CH = 1.5;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  let W = canvas.clientWidth, H = canvas.clientHeight || 1;
  renderer.setSize(W, H, false);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  let bz = 6;

  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function placeholderTex() {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 330; const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 330); g.addColorStop(0, "#123a37"); g.addColorStop(1, "#0a1f22"); c.fillStyle = g; c.fillRect(0, 0, 512, 330);
    const rg = c.createRadialGradient(256, 120, 10, 256, 120, 300); rg.addColorStop(0, "rgba(0,194,168,.28)"); rg.addColorStop(1, "transparent"); c.fillStyle = rg; c.fillRect(0, 0, 512, 330);
    return new THREE.CanvasTexture(cv);
  }
  function labelTex(a) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 330; const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 150, 0, 330); g.addColorStop(0, "transparent"); g.addColorStop(1, "rgba(4,12,14,.9)"); c.fillStyle = g; c.fillRect(0, 0, 512, 330);
    c.fillStyle = "#F4F7F9"; c.font = "800 42px Inter, sans-serif"; c.fillText(a.name, 26, 276, 460);
    if (a.count) { c.fillStyle = "#9FD8CF"; c.font = "600 24px Inter, sans-serif"; c.fillText(a.count, 26, 308); }
    // teal edge glow rim
    const hi = c.createLinearGradient(0, 0, 0, 96); hi.addColorStop(0, "rgba(190,255,247,.16)"); hi.addColorStop(1, "transparent"); c.fillStyle = hi; c.fillRect(6, 6, 500, 96);
    c.strokeStyle = "rgba(61,233,205,.45)"; c.lineWidth = 5; rr(c, 6, 6, 500, 318, 24); c.stroke();
    return new THREE.CanvasTexture(cv);
  }
  const loader = new THREE.TextureLoader(); loader.crossOrigin = "anonymous";

  const geo = new THREE.PlaneGeometry(CW, CH);
  const cards = areas.map((a) => {
    const g = new THREE.Group();
    const pm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: placeholderTex(), transparent: true }));
    const set = (t) => { t.anisotropy = 4; pm.material.map = t; pm.material.needsUpdate = true; };
    if (a.img) loader.load(a.img, set, undefined, () => { if (a.fallback) loader.load(a.fallback, set, undefined, () => {}); });
    const lm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: labelTex(a), transparent: true }));
    lm.position.z = 0.01;
    g.add(pm); g.add(lm); scene.add(g);
    return { g, pm, lm };
  });

  function fit() {
    const fa = Math.min(W / H, 1.5), vh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfH = CH * 0.64, halfW = CW * 0.72;
    bz = Math.max(halfH / vh, halfW / (vh * fa), 3) * 1.08;   // cap aspect so ultra-wide (Fold) stays centred, not marooned
    camera.position.set(0, 0.28, bz); camera.lookAt(0, 0, -0.5);
  }
  fit();

  // ---- drag-only interaction ----
  let target = 0, cur = 0, down = false, moved = false, sx = 0, st = 0, dt0 = 0, running = true, raf = 0, alive = true, lastIdx = -1;
  function frontIndex() { return ((Math.round(cur)) % N + N) % N; }
  function place() {
    cards.forEach((c, i) => {
      let off = i - cur; if (off > N / 2) off -= N; if (off < -N / 2) off += N;
      const a = off * STEP, ab = Math.abs(off);
      if (ab > 2.7) { c.g.visible = false; return; }
      c.g.visible = true;
      c.g.position.set(R * Math.sin(a), 0, -R + R * Math.cos(a));  // gentle outward arc
      c.g.rotation.y = a * 0.5;                                    // partial tilt — display case, not a wheel
      const s = 1 - ab * 0.035; c.g.scale.set(s, s, s);           // centre only slightly larger
      const op = Math.max(0, Math.min(1, 1.2 - Math.max(0, ab - 1.4) * 0.7));
      c.pm.material.opacity = op; c.lm.material.opacity = op;
    });
  }
  function render() { place(); renderer.render(scene, camera); const i = frontIndex(); if (i !== lastIdx) { lastIdx = i; onFront(i, areas[i]); } }
  function loop() { if (!alive) return; raf = requestAnimationFrame(loop); if (!running) return; const d = target - cur; cur += d * 0.08; render(); if (Math.abs(d) < 0.0004 && !down) { cur = target; render(); cancelAnimationFrame(raf); raf = 0; } }
  function kick() { if (!raf && alive) loop(); }

  function down_(e) { down = true; moved = false; sx = e.clientX; st = target; dt0 = performance.now(); canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); kick(); }
  function move_(e) { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; target = st - dx / 150; }
  function up_() { if (!down) return; down = false; if (!moved && performance.now() - dt0 < 300) { const i = frontIndex(); onSelect(i, areas[i]); } else { target = Math.round(target); } kick(); }
  canvas.addEventListener("pointerdown", down_);
  canvas.addEventListener("pointermove", move_);
  canvas.addEventListener("pointerup", up_);
  canvas.addEventListener("pointercancel", up_);
  window.addEventListener("pointerup", up_);
  function onResize() { W = canvas.clientWidth; H = canvas.clientHeight || 1; renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); fit(); render(); }
  window.addEventListener("resize", onResize);
  const onVis = () => { running = !document.hidden; kick(); };
  document.addEventListener("visibilitychange", onVis);
  const io = new IntersectionObserver((es) => es.forEach((e) => { running = e.isIntersecting; kick(); }), { threshold: 0.05 });
  io.observe(canvas);
  render();

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", up_);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect(); renderer.dispose();
    },
  };
}
