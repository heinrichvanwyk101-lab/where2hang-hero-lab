// PASTE TARGET: where2hang-hero-lab/postfx.js  (new file, repo root, next to home-stage.html)
//
// Bloom + SMAA post-processing for the Living City hero.
// Requires an importmap in home-stage.html exposing "three" and "three/addons/".
// See the integration notes at the bottom of this file.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// ---------------------------------------------------------------------------
// Tunables. Start here when the look needs adjusting.
// ---------------------------------------------------------------------------

export const POSTFX = {
  // Bloom
  bloomStrength: 0.45,   // overall glow intensity
  bloomRadius: 0.50,     // how far the glow spreads
  bloomThreshold: 0.55,  // luminance above which a pixel glows

  // Tone mapping
  exposure: 1.05,

  // Device pixel ratio ceiling. The Z Fold reports ~3, which quadruples
  // fragment cost against DPR 1.5 for almost no visible gain on a phone.
  maxPixelRatio: 2,

  // Anti-aliasing. SMAA costs roughly 0.3ms at 1080p; turn off to compare.
  smaa: true,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/**
 * Builds the post-processing chain.
 *
 * IMPORTANT: when post-processing is active the WebGLRenderer must NOT do its
 * own antialias — set `antialias: false` on the renderer. MSAA does not apply
 * to render targets here, so it costs performance and delivers nothing.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @returns {{ composer: EffectComposer, resize: Function, bloomPass: UnrealBloomPass, dispose: Function }}
 */
export function createPostFX(renderer, scene, camera) {
  const dpr = Math.min(window.devicePixelRatio || 1, POSTFX.maxPixelRatio);
  renderer.setPixelRatio(dpr);

  // Tone mapping happens in OutputPass, but the renderer holds the settings.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = POSTFX.exposure;

  const size = new THREE.Vector2();
  renderer.getSize(size);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.setSize(size.x, size.y);

  // 1. Render the scene.
  composer.addPass(new RenderPass(scene, camera));

  // 2. Bloom — operates on linear HDR values, before tone mapping.
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    POSTFX.bloomStrength,
    POSTFX.bloomRadius,
    POSTFX.bloomThreshold
  );
  composer.addPass(bloomPass);

  // 3. Tone map + convert to display colour space.
  composer.addPass(new OutputPass());

  // 4. Anti-alias last, on the final low-dynamic-range image.
  let smaaPass = null;
  if (POSTFX.smaa) {
    smaaPass = new SMAAPass(size.x * dpr, size.y * dpr);
    composer.addPass(smaaPass);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, POSTFX.maxPixelRatio);

    renderer.setPixelRatio(nextDpr);
    renderer.setSize(w, h);

    composer.setPixelRatio(nextDpr);
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
    if (smaaPass) smaaPass.setSize(w * nextDpr, h * nextDpr);
  }

  function dispose() {
    composer.dispose();
    bloomPass.dispose();
  }

  // Live tuning from the console or the #debug overlay.
  function applyTunables() {
    bloomPass.strength = POSTFX.bloomStrength;
    bloomPass.radius = POSTFX.bloomRadius;
    bloomPass.threshold = POSTFX.bloomThreshold;
    renderer.toneMappingExposure = POSTFX.exposure;
  }

  return { composer, resize, dispose, bloomPass, applyTunables };
}

// ---------------------------------------------------------------------------
// INTEGRATION NOTES for home-stage.html
// ---------------------------------------------------------------------------
//
// 1. Confirm the importmap in <head> covers addons. It must look like this:
//
//    <script type="importmap">
//    {
//      "imports": {
//        "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
//        "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
//      }
//    }
//    </script>
//
//    The trailing slash on "three/addons/" is required. Keep the version
//    identical in both entries or you will load two copies of three.
//
// 2. Renderer construction — turn MSAA off:
//
//      const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
//
// 3. After renderer, scene and camera exist:
//
//      import { createPostFX } from './postfx.js';
//      const fx = createPostFX(renderer, scene, camera);
//
// 4. In the animation loop, replace the direct render call:
//
//      // renderer.render(scene, camera);   <-- remove
//      fx.composer.render();                //  <-- use
//
// 5. In the existing resize handler, call fx.resize() instead of the current
//    renderer.setSize block, or alongside it if other work happens there.
//
// ---------------------------------------------------------------------------
// IF THE WINDOWS DO NOT GLOW
// ---------------------------------------------------------------------------
//
// The instinct is to drop bloomThreshold toward 0. Resist it — that blooms the
// entire frame, including the sky and building faces, and the result is a grey
// haze rather than lit windows.
//
// Bloom reads linear HDR luminance. A MeshBasicMaterial at colour #E8B547 has a
// peak linear value below 1.0, so it sits under any useful threshold. The fix
// is to push the window emission above 1.0 so it genuinely is a light source:
//
//      // MeshStandardMaterial
//      mat.emissive = new THREE.Color(0xE8B547);
//      mat.emissiveIntensity = 2.5;
//
//      // MeshBasicMaterial — multiply the colour past white
//      mat.color = new THREE.Color(0xE8B547).multiplyScalar(2.5);
//
// Tune the multiplier, not the threshold. 2 to 4 is the useful range. Teal
// windows (#3DE9CD) read brighter per unit than gold, so if you mix both,
// give the teal a lower multiplier or it will dominate the skyline.
//
// ---------------------------------------------------------------------------
// EXPECTED COST
// ---------------------------------------------------------------------------
//
// Bloom is five downsample/upsample passes; SMAA is three. At 118 fps you have
// roughly 8.5ms of headroom per frame and this chain wants 2 to 3ms on a Z Fold.
// If fps drops below 60, lower maxPixelRatio to 1.5 before cutting bloom.
