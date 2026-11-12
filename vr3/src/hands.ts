import { AnimatedControllerHand, DEFAULT_PROFILES_PATH, type Object3D, type World } from '@iwsdk/core';
import { swordHold } from './sword';

/** How far the sword hand's fist is leaned, degrees: the katana's lean unless a level's own weapon says otherwise (main.ts sets it). */
export const fist = { tilt: (): number => swordHold.tilt };

// Outline hands drawn where the controllers are held, so the player can see their grip on the
// sword. They are the SDK's own controller-held hands, which IWSDK 1.1.0-rc.2 cannot show as
// shipped, for two reasons worked around here:
// 1. The class takes (model, scene, camera, layout) while the SDK builds every visual as
//    (scene, camera, model, layout), so it is handed the scene as its model.
// 2. The SDK loads the controller's own model for it, not the hand model it needs.
type HandArgs = ConstructorParameters<typeof AnimatedControllerHand>;
type Pose = { position: Object3D['position']; quaternion: Object3D['quaternion'] };
class ControllerHand extends AnimatedControllerHand {
  private swordHand = false;
  constructor(scene: HandArgs[1], camera: HandArgs[2], model: HandArgs[0], layout: HandArgs[3]) {
    super(model, scene, camera, layout);
  }
  connect(inputSource: XRInputSource, enabled: boolean) {
    super.connect(inputSource, enabled);
    this.swordHand = inputSource.handedness === 'right';
  }
  update(delta: number) {
    // The free hand opens and closes with trigger and grip, as the SDK has it.
    if (!this.swordHand) { super.update(delta); return; }
    // The sword hand never lets go: left to the buttons it hangs open beside the hilt whenever the
    // player relaxes their fingers. It stays a closed fist, turned by the sword's lean so the
    // handle runs through it. (The SDK re-places the model on the controller before every update.)
    for (const bone of (this as unknown as { bones: Object3D[] }).bones) {
      const closed = bone.userData.pressedTransform as Pose;
      bone.position.copy(closed.position); bone.quaternion.copy(closed.quaternion);
    }
    this.model.rotateX(-fist.tilt() * Math.PI / 180);
  }
}
type Adapter = { inputConfig?: { assetPath?: string }; connectVisual(): void };

/** Swap both controller models for hands. Call once; they appear when a controller connects. */
export function useControllerHands(world: World) {
  for (const side of ['left', 'right'] as const) {
    const adapter = world.input.xr.visualAdapters.controller[side];
    const inner = adapter as unknown as Adapter;
    const connectVisual = inner.connectVisual.bind(adapter);
    inner.connectVisual = () => {
      if (inner.inputConfig) inner.inputConfig.assetPath = `${DEFAULT_PROFILES_PATH}/generic-hand/${side}.glb`;
      connectVisual();
    };
    adapter.updateVisualImplementation(ControllerHand);
  }
}
