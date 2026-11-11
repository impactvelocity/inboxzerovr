import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
} from '@iwsdk/core';

/**
 * The arena floor, the sorting rings and the two weapons. Weapons are built
 * with the handle along +Y and the origin in the middle of the grip, so the
 * game can place them straight into a hand.
 */

export const NEON = {
  cyan: 0x20e7f2,
  coral: 0xff5e7e,
  gold: 0xffd24a,
  magenta: 0xc864ff,
  navy: 0x121a33,
};

/** Blade runs from SWORD_BLADE_START to SWORD_BLADE_END along +Y. */
export const SWORD_BLADE_START = 0.1;
export const SWORD_BLADE_END = 0.52;
/** Centre of the hammer head along +Y, and its hit radius. */
export const HAMMER_HEAD_Y = 0.34;
export const HAMMER_HEAD_RADIUS = 0.09;

const glow = (color: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color, toneMapped: false });

const metal = (color: number): MeshStandardMaterial =>
  new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.6 });

export function createArenaFloor(): Group {
  const floor = new Group();
  floor.name = 'ArenaFloor';
  const disc = new Mesh(
    new CircleGeometry(6, 64),
    new MeshStandardMaterial({ color: 0x0a1022, roughness: 0.9 }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.receiveShadow = true;
  floor.add(disc);
  const ringMaterial = glow(NEON.cyan);
  for (const radius of [0.9, 1.8, 3.2]) {
    const ring = new Mesh(
      new RingGeometry(radius - 0.012, radius + 0.012, 96),
      ringMaterial,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    floor.add(ring);
  }
  return floor;
}

export function createSword(): Group {
  const sword = new Group();
  sword.name = 'Sword';
  const handle = new Mesh(
    new CylinderGeometry(0.016, 0.018, 0.14, 12),
    metal(NEON.navy),
  );
  sword.add(handle);
  const guard = new Mesh(new BoxGeometry(0.02, 0.016, 0.1), metal(0x9aa7c7));
  guard.position.y = 0.08;
  sword.add(guard);
  const length = SWORD_BLADE_END - SWORD_BLADE_START;
  const blade = new Mesh(new BoxGeometry(0.008, length, 0.034), glow(NEON.cyan));
  blade.position.y = SWORD_BLADE_START + length / 2;
  blade.name = 'Blade';
  sword.add(blade);
  const halo = new Mesh(
    new BoxGeometry(0.02, length + 0.02, 0.06),
    new MeshBasicMaterial({
      color: NEON.cyan,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  halo.position.copy(blade.position);
  sword.add(halo);
  return sword;
}

export function createHammer(): Group {
  const hammer = new Group();
  hammer.name = 'Hammer';
  const handle = new Mesh(
    new CylinderGeometry(0.015, 0.017, 0.4, 12),
    metal(NEON.navy),
  );
  handle.position.y = 0.12;
  hammer.add(handle);
  const head = new Mesh(new BoxGeometry(0.1, 0.1, 0.19), metal(0x2a3558));
  head.position.y = HAMMER_HEAD_Y;
  head.name = 'Head';
  hammer.add(head);
  const faceMaterial = glow(NEON.coral);
  for (const side of [-1, 1]) {
    const face = new Mesh(new BoxGeometry(0.108, 0.108, 0.014), faceMaterial);
    face.position.set(0, HAMMER_HEAD_Y, side * 0.095);
    hammer.add(face);
  }
  return hammer;
}

/** A sorting ring. The label is added by the game at runtime. */
export function createBinRing(color: number): Group {
  const bin = new Group();
  bin.name = 'BinRing';
  const ring = new Mesh(new TorusGeometry(0.13, 0.012, 10, 48), glow(color));
  bin.add(ring);
  const fill = new Mesh(
    new CircleGeometry(0.125, 40),
    new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(0.5),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  fill.name = 'Fill';
  bin.add(fill);
  return bin;
}
