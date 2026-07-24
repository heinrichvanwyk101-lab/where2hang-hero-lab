// PASTE TARGET: where2hang-hero-lab/water.js
// Where2Hang — water LEAF. WebGL displacement of the plate's own reflections.
// No dependencies, no three.js. British spelling, no emojis.
//
// WHY THIS EXISTS.
// CSS transforms can only move a band as a rigid whole — translate, scale, rotate. Water does
// not do that. It displaces PER PIXEL, and every reflection wobbles independently of its
// neighbours. Sliding a photograph of water sideways is the most photograph-like motion
// available, which is exactly how the CSS version read.
// This samples the plate and offsets the texture coordinates in the water region with two
// scrolling noise fields. The reflections themselves stretch, break and rejoin. Nothing is
// drawn on top and nothing is invented: it is the real reflections, displaced.
// That also keeps it inside the frozen decision in Spec v2 §8, which banned fake OBJECTS
// anchored to a 2D plate. Distorting the plate's own pixels is a different thing entirely.
//
// COST: one texture holding the water band only, one quad, about twenty lines of fragment
// shader. Roughly 1-2ms a frame — cheaper than the card carousel that was deleted.
//
// API:
//   const w = mountWater(canvas);            // null if WebGL is unavailable
//   w.setPlate(imgElement);                  // call when a plate has loaded
//   w.resize();                              // on viewport change
//   w.draw({ imgX, imgY, imgW, imgH, time }) // image rect in CSS px, relative to the canvas
//   w.destroy();

const BAND_TOP = 0.68;    // where the water texture starts, in image v. Slightly above the
                          // waterline at 0.76 so the shoreline itself is included and can fade.

const VS = `
attribute vec2 a;
varying vec2 vUv;
void main(){ vUv = a*0.5+0.5; gl_Position = vec4(a,0.0,1.0); }`;

const FS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uCanvas;     // canvas size, CSS px
uniform vec2  uImgPos;     // image top-left, CSS px, relative to canvas
uniform vec2  uImgSize;    // image size, CSS px
uniform float uTime;
uniform float uFade;       // global opacity, for mood changes
uniform float uBandTop;

float hash(vec2 p){ return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x),
             mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
}

void main(){
  // fragment position in CSS px, y down
  vec2 px = vec2(vUv.x, 1.0-vUv.y) * uCanvas;
  vec2 uv = (px - uImgPos) / uImgSize;                 // 0..1 across the whole plate
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < uBandTop || uv.y > 1.0) discard;

  float d = (uv.y - uBandTop) / (1.0 - uBandTop);      // 0 at the shoreline, 1 at the bottom

  // Two scrolling fields at different scales. Displacement is mostly VERTICAL because the
  // reflections are vertical streaks: swell moves them along their length, never across.
  float n1 = noise(vec2(uv.x * 220.0, uv.y * 55.0 - uTime * 0.42));
  float n2 = noise(vec2(uv.x *  70.0 + uTime * 0.06, uv.y * 20.0 - uTime * 0.23));
  float amp = d * d;                                    // still near the shore, restless far out

  vec2 off = vec2((n2 - 0.5) * 0.0013 * amp,
                  (n1 - 0.5) * 0.0085 * amp + (n2 - 0.5) * 0.0045 * amp);

  // sample the water band texture, which covers uBandTop..1.0 of the plate
  vec2 t = vec2(uv.x, (uv.y - uBandTop) / (1.0 - uBandTop)) + vec2(off.x, off.y / (1.0 - uBandTop));
  t = clamp(t, vec2(0.001), vec2(0.999));
  vec4 c = texture2D(uTex, t);

  // match the CSS mask: fade in over the shoreline, out at the very bottom edge
  float a = smoothstep(0.0, 0.16, d) * (1.0 - smoothstep(0.90, 1.0, d));
  gl_FragColor = vec4(c.rgb, c.a * a * uFade);
}`;

export function mountWater(canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false, depth: false, powerPreference: "low-power" });
  if (!gl) return null;

  function shader(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("[water]", gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = shader(gl.VERTEX_SHADER, VS), fs = shader(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn("[water]", gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  ["uTex","uCanvas","uImgPos","uImgSize","uTime","uFade","uBandTop"].forEach(n => U[n] = gl.getUniformLocation(prog, n));

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(U.uTex, 0);
  gl.uniform1f(U.uBandTop, BAND_TOP);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const MAXTEX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  let haveTex = false, fade = 0;

  // Only the WATER BAND is uploaded, never the whole plate. The plates are up to 7875px wide;
  // the full thing as RGBA would be 44MB of VRAM on top of the 45MB the browser already holds
  // for the decoded image. The band alone is about a third of that, and nothing above the
  // shoreline is ever sampled.
  function setPlate(img) {
    if (!img || !img.naturalWidth) return false;
    const sy = Math.floor(img.naturalHeight * BAND_TOP);
    const sh = img.naturalHeight - sy;
    let w = img.naturalWidth, h = sh;
    const scale = Math.min(1, MAXTEX / Math.max(w, h));
    w = Math.max(1, Math.floor(w * scale)); h = Math.max(1, Math.floor(h * scale));
    try {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, sy, img.naturalWidth, sh, 0, 0, w, h);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      haveTex = true;
      return true;
    } catch (e) { console.warn("[water] texture upload failed", e); return false; }
  }

  let cw = 0, ch = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();

  function draw(s) {
    if (!haveTex) return;
    if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) resize();
    fade += ((s.fade == null ? 1 : s.fade) - fade) * 0.12;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform2f(U.uCanvas, cw, ch);
    gl.uniform2f(U.uImgPos, s.imgX, s.imgY);
    gl.uniform2f(U.uImgSize, s.imgW, s.imgH);
    gl.uniform1f(U.uTime, s.time);
    gl.uniform1f(U.uFade, fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return {
    setPlate, resize, draw,
    get ready() { return haveTex; },
    destroy() {
      gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog);
      gl.deleteShader(vs); gl.deleteShader(fs);
      const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
    },
  };
}
