// PASTE TARGET: where2hang-hero-lab/lighting.js  (new file, repo root)
//
// Night lighting for the Living City hero.
// Fixes foreground blocks rendering black when materials need illumination.

import * as THREE from 'three';

export const LIGHTING = {
  // Hemisphere: sky colour above, ground bounce below.
  skyColour: 0x223344,     // cool night sky
  groundColour: 0x0a0c10,  // near-black, matches bg #111315
  hemiIntensity: 0.60,

  // Ambient fill. Keeps the darkest faces from going fully flat.
  ambientColour: 0x1a2430,
  ambientIntensity: 0.40,

  // Optional key light. Gives towers a lit and a shadow side so they read
  // as volumes rather than flat cut-outs. Set enabled: false for pure silhouette.
  keyEnabled: true,
  keyColour: 0x8fa6c4,
  keyIntensity: 0.35,
  keyPosition: { x: -60, y: 90, z: 40 },
};

/**
 * Adds night lighting to the scene.
 * Safe to call more than once — it removes its own lights first.
 *
 * @param {THREE.Scene} scene
 * @returns {{ update: Function, remove: Function, lights: THREE.Light[] }}
 */
export function createLighting(scene) {
  removeLighting(scene);

  const lights = [];

  const hemi = new THREE.HemisphereLight(
    LIGHTING.skyColour,
    LIGHTING.groundColour,
    LIGHTING.hemiIntensity
  );
  hemi.name = 'w2h-hemi';
  hemi.userData.w2hLight = true;
  scene.add(hemi);
  lights.push(hemi);

  const ambient = new THREE.AmbientLight(
    LIGHTING.ambientColour,
    LIGHTING.ambientIntensity
  );
  ambient.name = 'w2h-ambient';
  ambient.userData.w2hLight = true;
  scene.add(ambient);
  lights.push(ambient);

  let key = null;
  if (LIGHTING.keyEnabled) {
    key = new THREE.DirectionalLight(LIGHTING.keyColour, LIGHTING.keyIntensity);
    key.position.set(
      LIGHTING.keyPosition.x,
      LIGHTING.keyPosition.y,
      LIGHTING.keyPosition.z
    );
    key.castShadow = false; // shadows are not worth the cost at this scale
    key.name = 'w2h-key';
    key.userData.w2hLight = true;
    scene.add(key);
    lights.push(key);
  }

  // Re-read the tunables without rebuilding. Handy from the console.
  function update() {
    hemi.color.setHex(LIGHTING.skyColour);
    hemi.groundColor.setHex(LIGHTING.groundColour);
    hemi.intensity = LIGHTING.hemiIntensity;

    ambient.color.setHex(LIGHTING.ambientColour);
    ambient.intensity = LIGHTING.ambientIntensity;

    if (key) {
      key.color.setHex(LIGHTING.keyColour);
      key.intensity = LIGHTING.keyIntensity;
      key.position.set(
        LIGHTING.keyPosition.x,
        LIGHTING.keyPosition.y,
        LIGHTING.keyPosition.z
      );
      key.visible = LIGHTING.keyEnabled;
    }
  }

  return { update, remove: () => removeLighting(scene), lights };
}

/** Removes only lights this module added. Leaves anything else untouched. */
export function removeLighting(scene) {
  const mine = scene.children.filter(o => o.userData && o.userData.w2hLight);
  mine.forEach(l => {
    scene.remove(l);
    if (l.dispose) l.dispose();
  });
  return mine.length;
}

/**
 * Diagnostic. Logs why geometry might be rendering black.
 * Call once after the scene is fully built.
 */
export function diagnoseLighting(scene) {
  let lights = 0;
  const materialTypes = {};
  let needsLight = 0;

  scene.traverse(obj => {
    if (obj.isLight) lights++;
    if (!obj.isMesh || !obj.material) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => {
      materialTypes[m.type] = (materialTypes[m.type] || 0) + 1;
      // These types are lit; MeshBasicMaterial is not.
      if (
        m.type === 'MeshStandardMaterial' ||
        m.type === 'MeshPhysicalMaterial' ||
        m.type === 'MeshLambertMaterial' ||
        m.type === 'MeshPhongMaterial'
      ) {
        needsLight++;
      }
    });
  });

  console.log('[w2h lighting] lights in scene:', lights);
  console.log('[w2h lighting] material types:', materialTypes);
  console.log('[w2h lighting] meshes requiring light:', needsLight);

  if (needsLight > 0 && lights === 0) {
    console.warn(
      '[w2h lighting] ' + needsLight + ' meshes need illumination and the scene has none. ' +
      'They will render black. Call createLighting(scene).'
    );
  }

  return { lights, materialTypes, needsLight };
}

// ---------------------------------------------------------------------------
// INTEGRATION — home-stage.html
// ---------------------------------------------------------------------------
//
//   import { createLighting, diagnoseLighting } from './lighting.js';
//
//   // after the scene and all city geometry are built:
//   const lights = createLighting(scene);
//   diagnoseLighting(scene);   // remove once the cause is confirmed
//
// To tune live from the console:
//
//   LIGHTING.hemiIntensity = 0.9; lights.update();
//
// ---------------------------------------------------------------------------
// IF THE FOREGROUND IS STILL DARK AFTER THIS
// ---------------------------------------------------------------------------
//
// Then lighting was not the cause and the suspect is tone mapping. ACESFilmic
// crushes the low end hard, and near-black building faces fall below visible.
// Test by raising exposure in postfx.js:
//
//   POSTFX.exposure = 1.6;
//
// If that recovers the foreground, keep exposure between 1.3 and 1.6 and lower
// the sky colour instead of fighting it with light intensity.
