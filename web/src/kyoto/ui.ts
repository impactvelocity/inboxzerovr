import * as THREE from 'three';
import type { UiKit } from '../api';

/**
 * Materials for the game's own things (letters, labels, buttons, trails).
 * Flat and unlit: they keep out of the courtyard's mist and grade so text
 * stays crisp, and on a monitor they are drawn after the bloom.
 */
export const GAME_LAYER = 3;          // not 1 or 2: three keeps those for the left and right eye

export const uiKit: UiKit = {
  renderOrder: 100,
  material(o) {
    const translucent = o.additive || (o.opacity !== undefined && o.opacity < 1) || !!o.map;
    return new THREE.MeshBasicMaterial({
      map: o.map ?? null,
      color: o.color ?? 0xffffff,
      opacity: o.opacity ?? 1,
      transparent: translucent,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthTest: o.depthTest ?? true,
      depthWrite: !translucent,
      side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      fog: false,
      toneMapped: false,
    });
  },
};
