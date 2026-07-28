// PASTE TARGET: where2hang-hero-lab/texture-tune.js  (new file, repo root)
//
// Fixes grazing-angle streaking on the ground and water plates.
// Cause: minified textures sampled without mipmaps or anisotropic filtering.

import * as THREE from 'three';

/**
 * Applies correct filtering to a single texture.
 *
 * @param {THREE.Texture} tex
 * @param {THREE.WebGLRenderer} renderer
 * @param {Object} [opts]
 * @param {boolean} [opts.colour=true] - true for colour maps, false for data
 *   maps such as depth, normal or roughness, which must stay linear.
 * @param {boolean} [opts.repeat=true] - wrap mode.
 */
export function tuneTexture(tex, renderer, opts = {}) {
  if (!tex || !tex.isTexture) return tex;

  const { colour = true, repeat = true } = opts;

  // The one that actually fixes the streaking. Free on modern mobile GPUs.
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;

  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }

  // Colour maps are sRGB. Depth and normal maps must NOT be, or the
  // displacement values come out wrong.
  tex.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;

  tex.needsUpdate = true;
  return tex;
}

/**
 * Walks the whole scene and tunes every texture it finds.
 * Use this when you do not want to track individual texture references.
 *
 * Data maps are detected by slot name and kept linear automatically.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @returns {number} count of textures tuned
 */
export function tuneAllTextures(scene, renderer) {
  const DATA_SLOTS = new Set([
    'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
    'displacementMap', 'bumpMap', 'alphaMap',
  ]);

  const COLOUR_SLOTS = ['map', 'emissiveMap', 'specularMap', 'envMap'];
  const ALL_SLOTS = [...COLOUR_SLOTS, ...DATA_SLOTS];

  const seen = new Set();
  let count = 0;

  scene.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(mat => {
      ALL_SLOTS.forEach(slot => {
        const tex = mat[slot];
        if (!tex || !tex.isTexture || seen.has(tex.uuid)) return;
        seen.add(tex.uuid);
        tuneTexture(tex, renderer, { colour: !DATA_SLOTS.has(slot) });
        count++;
      });
    });
  });

  console.log('[w2h texture] tuned ' + count + ' textures, anisotropy ' +
    renderer.capabilities.getMaxAnisotropy());

  return count;
}

/**
 * Diagnostic. Reports textures likely to streak, and flags any that cannot
 * mipmap because their dimensions are not powers of two.
 */
export function diagnoseTextures(scene, renderer) {
  const isPOT = n => (n & (n - 1)) === 0 && n > 0;
  const problems = [];
  const seen = new Set();

  scene.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    mats.forEach(mat => {
      ['map', 'emissiveMap', 'normalMap', 'displacementMap'].forEach(slot => {
        const tex = mat[slot];
        if (!tex || !tex.isTexture || seen.has(tex.uuid)) return;
        seen.add(tex.uuid);

        const img = tex.image;
        const w = img ? (img.width || img.videoWidth) : 0;
        const h = img ? (img.height || img.videoHeight) : 0;

        const issues = [];
        if (!tex.anisotropy || tex.anisotropy < 2) issues.push('no anisotropy');
        if (tex.minFilter === THREE.LinearFilter ||
            tex.minFilter === THREE.NearestFilter) issues.push('no mipmaps');
        if (w && h && (!isPOT(w) || !isPOT(h))) {
          issues.push('non-power-of-two ' + w + 'x' + h + ' (mipmaps fail on WebGL1)');
        }

        if (issues.length) {
          problems.push({ mesh: obj.name || '(unnamed)', slot, issues });
        }
      });
    });
  });

  if (problems.length === 0) {
    console.log('[w2h texture] no filtering problems found');
  } else {
    console.warn('[w2h texture] ' + problems.length + ' texture(s) will streak:');
    problems.forEach(p =>
      console.warn('  ' + p.mesh + '.' + p.slot + ' — ' + p.issues.join(', '))
    );
  }

  const isWebGL2 = renderer.capabilities.isWebGL2;
  console.log('[w2h texture] WebGL2:', isWebGL2,
    isWebGL2 ? '' : '(non-power-of-two textures cannot mipmap)');

  return problems;
}

// ---------------------------------------------------------------------------
// INTEGRATION — home-stage.html
// ---------------------------------------------------------------------------
//
//   import { tuneAllTextures, diagnoseTextures } from './texture-tune.js';
//
//   // after all textures have LOADED, not merely been requested.
//   // If you use TextureLoader with callbacks, call this in the final onLoad,
//   // or use LoadingManager.onLoad:
//
//   const manager = new THREE.LoadingManager();
//   manager.onLoad = () => {
//     tuneAllTextures(scene, renderer);
//     diagnoseTextures(scene, renderer);
//   };
//   const loader = new THREE.TextureLoader(manager);
//
// Calling it before the image data arrives is the usual reason the fix appears
// not to work — anisotropy set on an empty texture is lost when the image lands.
//
// For a single known texture instead of the whole scene:
//
//   tuneTexture(groundTex, renderer);                    // colour map
//   tuneTexture(depthTex, renderer, { colour: false });  // depth map, stays linear
