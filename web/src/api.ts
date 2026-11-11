import * as THREE from 'three';

/**
 * The seam between the two halves of the web build:
 *
 *   src/kyoto/  the courtyard (exported from Unity) and everything that lights and moves it
 *   src/game/   the game itself: letters, katana, hands, rounds, sounds
 *
 * UNITY SPACE. The Unity project is left-handed (x right, y up, z forward);
 * three.js is right-handed (the camera looks down -z). Everything ported from
 * Unity lives under one group, `ctx.unity`, whose scale is (1, 1, -1). Inside
 * that group positions, Euler angles and quaternions are Unity's own numbers,
 * unchanged: (0, 1.15, 0) is the seated eye (SeatedRig.SeatedEyeHeight; the
 * courtyard is hung 0.4 lower, as KyotoWorld does), +z is out into the garden, and a
 * quaternion built as Unity builds it turns things the way it does there (the
 * arithmetic is the same in both; only the picture differs). Unity's Euler
 * order is three's 'YXZ'.
 *
 * What comes from three in WORLD space (the camera, XR controllers and hands,
 * a Raycaster's ray) has to be brought into Unity space first: use the helpers
 * below. The group flips triangle winding, which three corrects by itself for
 * meshes; a plane you want facing the player must face Unity -z.
 */

/** A world-space point (three) as Unity sees it, and back. The same function both ways. */
export function flipPoint(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(v.x, v.y, -v.z);
}

/** A world-space rotation (three) as Unity sees it, and back. The same function both ways. */
export function flipQuaternion(q: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.set(-q.x, -q.y, q.z, q.w);
}

/** What surrounds the seat. The game tells it what is happening (Unity: IWorld / KyotoWorld). */
export interface World {
  /** Whether a session is under way (anything but the home screen). Dusk deepens while it is. */
  round(underway: boolean): void;
  /** A hit: a gust through the tree and a couple of petals. 1 is a solid hit. */
  kick(strength: number): void;
  /** Something to celebrate, `count` times over: more petals. */
  wish(count?: number): void;
  /** How far the evening has gone, 0..1 eased (Unity's global _KyotoNight). */
  readonly night: number;
}

export interface GameAssets {
  /**
   * The katana, dressed in its painted materials, as Unity's KyotoWorld.Katana returns it:
   * handle along +Y, origin mid-grip, already scaled so the blade ends 0.66 m from the origin
   * (InboxGame.SwordBladeEnd). Add it under `ctx.unity` (or a child of it) and pose it there.
   */
  katana: THREE.Object3D;
  /**
   * The paper letter as a card mesh, as KyotoWorld.Letter returns it: the size and upright UVs
   * of the card quad, readable face toward Unity -z (toward the seat). Unity-space vertices.
   */
  letter: THREE.BufferGeometry;
  /** Resources/Kyoto/Letter_Washi.png: the paper under a letter's text. sRGB. */
  washi: THREE.Texture;
  /** Resources/Kyoto/Brush.png: brush strokes, repeat-wrapped. Linear data. */
  brush: THREE.Texture;
  /** Resources/Logo.png, for the home screen. sRGB, with alpha. */
  logo: THREE.Texture;
  /** URL of a clip from Resources/Audio: 'arrive' | 'blip' | 'done' | 'slash1' | 'slash2' | 'sort' | 'wrong' | 'swing1'..'swing6'. */
  audioUrl(name: string): string;
}

export interface GameContext {
  renderer: THREE.WebGLRenderer;
  /** The Unity-space group (see above). Parent everything the game makes to it. */
  unity: THREE.Group;
  /** The viewer. On a monitor it sits at the seated eye looking into the garden; in a headset the device drives it. World space. */
  camera: THREE.PerspectiveCamera;
  /**
   * The play space, in three's world convention (NOT mirrored). The camera is its child, and
   * main.ts moves it to seat the player. Whatever `renderer.xr.getController(i)`,
   * `getControllerGrip(i)` or `getHand(i)` returns must be added to this group (never under
   * `unity`), so their poses line up with the head; read them with getWorldPosition /
   * getWorldQuaternion and bring them into Unity space with flipPoint / flipQuaternion.
   */
  rig: THREE.Group;
  /** Where the seated eye is in Unity space: (0, 1.15, 0). The seat faces +z. In a headset main.ts keeps the head there (SeatedRig). */
  eye: THREE.Vector3;
  world: World;
  assets: GameAssets;
  /** True while a WebXR session is presenting. */
  inXR(): boolean;
  /** Game things that must not be bloomed or fogged draw with these (see makeUiMaterial in src/kyoto/ui.ts). */
  ui: UiKit;
}

/** Materials for the game's own things. They ignore the scene's fog and lighting and keep text crisp. */
export interface UiKit {
  /** A flat textured material: `map` shown as it is. `additive` for light (trails, sparks). */
  material(options: { map?: THREE.Texture; color?: THREE.ColorRepresentation; opacity?: number; additive?: boolean; depthTest?: boolean; doubleSide?: boolean }): THREE.Material;
  /** Draw order for the game's see-through things: after the scene's light and haze. Add small offsets to order among them. */
  readonly renderOrder: number;
}

export interface Game {
  /** Once a frame, before the scene is drawn. `dt` in seconds, already clamped. */
  step(dt: number): void;
  /** For a debug overlay: one short line about the game's state. */
  status(): string;
}
