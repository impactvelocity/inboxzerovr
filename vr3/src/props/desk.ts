import * as THREE from 'three';
import type { BladeTracker } from '../blade';
import type { StageContext } from '../levels/backdrop';
import { Soup, type P3 } from '../weapons/parts';

/**
 * The things on the second office's desk: a stapler, a sheet of paper with a curled corner, a
 * small stack of paper (design: design/office-seated-v3/props/stapler-angles.png, paper-angles.png).
 * Real models standing on the painted desk.
 *
 * They are loose. A blow on the monitor makes them jump; the keyboard swept through one knocks it
 * across the desk or off it. Whatever ends up out of place is put back after a few seconds.
 *
 * The group's origin is the point on the desk straight under where the player sat down; the desk
 * top is y = 0 and the carpet is `floor` under it. The painted desk wraps round the player (it is
 * a flat picture bent over 270 degrees), so "on the desk" is a band of distances, not a rectangle.
 */
const DESK = { near: 0.74, far: 1.47, floor: -0.6 };
export const deskTune = {
  knockSpeed: 1.1,      // m/s the keyboard must be moving to knock something
  knock: 0.5,           // how much of the keyboard's speed a knocked thing leaves with
  hop: 1.0,             // m/s upwards a hard blow on the monitor gives everything
  backAfter: 5,         // seconds out of place before a thing is put back (half that, off the desk)
};

function buildStapler() {
  const s = new Soup(), metal = '#c4c7cf';
  // the base, the hinge block at the back, the magazine, and the arm over it
  s.paint('#3f414d').hull([[-0.085, 0], [0.085, 0], [0.085, 0.008], [0.078, 0.015], [-0.078, 0.015], [-0.085, 0.008]], 0.027, 0.006, 0.004);
  s.paint('#4a4c59').hull([[-0.078, 0.014], [-0.03, 0.014], [-0.042, 0.052], [-0.07, 0.052]], 0.0235, 0.004, 0.003);
  s.paint(metal).block(0, 0.034, 0.018, 0.026, 0.012, 0.11, 0.002);
  s.paint('#5d6070').hull([[-0.08, 0.042], [0.062, 0.039], [0.082, 0.044], [0.084, 0.058], [0.062, 0.071], [-0.04, 0.076], [-0.076, 0.068]], 0.0245, 0.008, 0.006);
  // the hinge pin, showing on both sides, and the plate the staple is bent on
  s.paint(metal).place(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.036, -0.056)).lathe([[0, -0.026], [0.008, -0.026], [0.008, 0.026], [0, 0.026]], 8).place(null);
  s.quad([-0.013, 0.0156, 0.052], [0.013, 0.0156, 0.052], [0.013, 0.0156, 0.08], [-0.013, 0.0156, 0.08]);
  return s.geometry();
}
const SHEET_W = 0.21, SHEET_L = 0.297;
function buildSheet() {
  const s = new Soup(), columns = 6, rows = 8;
  // flat but for a slow wave, and one corner (front right) curled up and back over itself
  const at = (i: number, j: number): P3 => {
    let x = (i / columns - 0.5) * SHEET_W, z = (j / rows - 0.5) * SHEET_L;
    const curl = Math.max(0, (x / (SHEET_W / 2) + z / (SHEET_L / 2) - 1.2) / 0.8), lift = curl * curl;
    const y = 0.0035 + 0.0008 * (1 + Math.sin(x * 21 + 1) * Math.sin(z * 14)) + 0.04 * lift;
    x -= 0.03 * lift; z -= 0.035 * lift;
    return [x, y, z];
  };
  for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) {
    s.paint('#f3ddc3').quad(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  }
  return s.geometry();
}
function buildStack() {
  const s = new Soup(), sheets = 7;
  for (let i = 0; i < sheets; i++) {
    const turn = Math.sin(i * 2.3) * 0.035, x = Math.sin(i * 1.7) * 0.004, z = Math.cos(i * 2.9) * 0.004;
    s.paint(i % 2 ? '#e9cfb2' : '#f2dcc2').place(new THREE.Matrix4().makeRotationY(turn).setPosition(x, 0.0035 + i * 0.0052, z)).block(0, 0, 0, SHEET_W, 0.0042, SHEET_L, 0.0007);
  }
  s.place(null);
  return s.geometry();
}

interface Thing {
  name: string; mesh: THREE.Mesh; shadow: THREE.Mesh;
  home: THREE.Vector3; yaw: number;
  /** How far its middle is above its foot, how far it reaches (for the keyboard's sweep), and whether it is paper (it floats down). */
  tall: number; reach: number; paper: boolean;
  speed: THREE.Vector3; spin: THREE.Vector3;
  state: 'rest' | 'air' | 'back'; time: number; size: number;
}

export function createDeskThings(context: StageContext) {
  const group = new THREE.Group(); group.name = 'On the desk';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const blot = document.createElement('canvas'); blot.width = blot.height = 64;
  { const b = blot.getContext('2d')!, fall = b.createRadialGradient(32, 32, 2, 32, 32, 32); fall.addColorStop(0, 'rgba(0,0,0,1)'); fall.addColorStop(0.6, 'rgba(0,0,0,.5)'); fall.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = fall; b.fillRect(0, 0, 64, 64); }
  const blotMap = new THREE.CanvasTexture(blot);
  const things: Thing[] = [];
  function add(name: string, geometry: THREE.BufferGeometry, x: number, z: number, yaw: number, tall: number, reach: number, paper: boolean, shade: [number, number]) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(x, 0, z); mesh.rotation.y = yaw; group.add(mesh);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(shade[0], shade[1]).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blotMap, color: '#1a1420', transparent: true, depthWrite: false, opacity: 0.3 }));
    shadow.name = `${name}: shadow`; shadow.renderOrder = -2; shadow.rotation.y = yaw; group.add(shadow);
    things.push({ name, mesh, shadow, home: new THREE.Vector3(x, 0, z), yaw, tall, reach, paper, speed: new THREE.Vector3(), spin: new THREE.Vector3(), state: 'rest', time: 0, size: 1 });
  }
  add('Stapler', buildStapler(), -0.4, -0.86, 2.2, 0.035, 0.085, false, [0.11, 0.24]);
  add('Sheet of paper', buildSheet(), 0.43, -0.85, -0.3, 0.004, 0.14, true, [0.3, 0.4]);
  add('Stack of paper', buildStack(), -0.66, -1.04, 0.35, 0.02, 0.15, false, [0.31, 0.41]);

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), flat = new THREE.Quaternion(), euler = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
  const rand = (spread: number) => (Math.random() - 0.5) * 2 * spread;
  /** Is this place over the desk top? (A band of distances from the player, narrowing towards the back.) */
  function overDesk(x: number, z: number) {
    const out = Math.hypot(x, z);
    if (z > -0.2 || out < DESK.near || out > DESK.far) return false;
    const side = Math.abs(Math.atan2(x, -z)), most = 1.22 - 0.32 * (out - DESK.near) / (DESK.far - DESK.near);
    return side < most;
  }
  function launch(thing: Thing, x: number, y: number, z: number, turn: number) {
    thing.speed.set(x, y, z); thing.spin.set(rand(turn), rand(turn), rand(turn)); thing.state = 'air'; thing.time = 0;
  }

  /** `origin`: the point on the desk under where the player sat (world space). */
  function update(dt: number, origin: THREE.Vector3, blend: number, blade?: BladeTracker) {
    group.position.copy(origin);
    const swept = !!blade?.moving && blade.speed > deskTune.knockSpeed;
    for (const thing of things) {
      const mesh = thing.mesh, p = mesh.position;
      thing.time += dt;
      // the keyboard through it: off it goes
      if (swept && blade && thing.state !== 'back' && (thing.state === 'rest' || thing.time > 0.25)) {
        const a = v1.copy(blade.base).sub(origin), b = v2.copy(blade.tip).sub(origin), c = v3.copy(p); c.y += thing.tall;
        const ab = b.sub(a), t = Math.max(0, Math.min(1, c.sub(a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
        if (c.addScaledVector(ab, -t).length() < thing.reach) {
          const push = v1.copy(blade.velocity).clampLength(0, 6).multiplyScalar(deskTune.knock * (thing.paper ? 0.6 : 1));
          launch(thing, push.x, Math.max(0.6, push.y + 0.9), push.z, thing.paper ? 5 : 9);
          context.play('arm', thing.paper ? 1.7 : 0.8, thing.paper ? 0.12 : 0.3, v2.copy(p).add(origin));
        }
      }
      if (thing.state === 'air') {
        // in the air: a stapler drops, paper floats down
        thing.speed.y -= (thing.paper ? 3.4 : 9.8) * dt;
        thing.speed.multiplyScalar(Math.exp(-(thing.paper ? 1.8 : 0.15) * dt));
        p.addScaledVector(thing.speed, dt);
        const turn = thing.spin.length() * dt;
        if (turn > 1e-5) mesh.quaternion.premultiply(q1.setFromAxisAngle(v1.copy(thing.spin).normalize(), turn));
        const ground = overDesk(p.x, p.z) && p.y > -0.08 ? 0 : DESK.floor;
        if (p.y <= ground && thing.speed.y < 0) {
          p.y = ground;
          if (thing.speed.y < -1.2 && !thing.paper) { thing.speed.y *= -0.32; thing.speed.x *= 0.6; thing.speed.z *= 0.6; thing.spin.multiplyScalar(0.5); context.play('arm', 0.7, 0.16, v2.copy(p).add(origin)); }
          else { thing.state = 'rest'; thing.time = 0; thing.speed.set(0, 0, 0); }
        }
      } else if (thing.state === 'rest') {
        // lying where it landed: flat, the way it is turned
        euler.setFromQuaternion(mesh.quaternion, 'YXZ'); flat.setFromAxisAngle(up, euler.y);
        mesh.quaternion.slerp(flat, 1 - Math.exp(-dt * 16));
        const away = p.distanceTo(thing.home) > 0.03 || Math.abs(euler.y - thing.yaw) > 0.2;
        if (!away) thing.time = 0;
        else if (thing.time > (p.y < -0.1 ? deskTune.backAfter / 2 : deskTune.backAfter)) { thing.state = 'back'; thing.time = 0; }
      } else {
        // put back: gone from where it lay, and set down again in its place
        const t = thing.time / 0.4;
        if (t < 0.5) thing.size = 1 - t * 2;
        else {
          if (thing.size >= 0 && t - dt / 0.4 < 0.5) { p.copy(thing.home); p.y = 0.05; mesh.quaternion.setFromAxisAngle(up, thing.yaw); }
          thing.size = Math.min(1, (t - 0.5) * 2); p.y = 0.05 * (1 - thing.size);
          if (t >= 1) { thing.state = 'rest'; thing.time = 0; p.copy(thing.home); thing.size = 1; }
        }
      }
      if (thing.state !== 'back') thing.size = 1;
      mesh.scale.setScalar(Math.max(0.001, thing.size));
      // its shadow, on the desk under it: fainter the higher it is, none once it is off the desk
      const shown = overDesk(p.x, p.z) && p.y > -0.02;
      thing.shadow.visible = shown;
      if (shown) {
        thing.shadow.position.set(p.x, 0.0015, p.z); euler.setFromQuaternion(mesh.quaternion, 'YXZ'); thing.shadow.rotation.y = euler.y;
        (thing.shadow.material as THREE.MeshBasicMaterial).opacity = (0.34 - 0.12 * blend) * thing.size * Math.max(0, 1 - p.y / 0.35);
      }
    }
  }

  return {
    group, update,
    /** The monitor has been hit: everything on the desk jumps. */
    hop(strength: number) {
      for (const thing of things) if (thing.state === 'rest') launch(thing, rand(0.12), deskTune.hop * (0.45 + 0.75 * strength) * (thing.paper ? 0.55 : 1), rand(0.12), 1.2 + 2.2 * strength);
    },
    things,
    dispose() { for (const thing of things) { thing.mesh.geometry.dispose(); thing.shadow.geometry.dispose(); (thing.shadow.material as THREE.Material).dispose(); } material.dispose(); blotMap.dispose(); },
  };
}
