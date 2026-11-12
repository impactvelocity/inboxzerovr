import * as THREE from 'three';

/**
 * The few real lights of each painted level: what the held weapon and anything else that is lit
 * (not painted) is seen by. One rig per level, shared by the level itself and by the weapon
 * viewer (weapon.html), so a prop looks the same in both. `blend` is the level's time of day,
 * 0 at its start lighting and 1 at its end.
 */
export type LevelId = 'kyoto' | 'office' | 'castle' | 'lab' | 'office2';

interface Rig { sky: [string, string]; ground: [string, string]; ambient: [number, number];
  key: { colour: [string, string]; power: [number, number]; from: [number, number, number] };
  fill?: { colour: [string, string]; power: [number, number]; at: [number, number, number]; reach: number } }

const RIGS: Record<Exclude<LevelId, 'kyoto'>, Rig> = {
  // Bright flat fluorescent day, then the same room by the green of the screen.
  office: { sky: ['#f2f6ff', '#5a6f9c'], ground: ['#8a93ac', '#1c2740'], ambient: [2.3, 1.15],
    key: { colour: ['#ffffff', '#b9c8e8'], power: [1.5, 0.5], from: [0.4, 3, 1.2] },
    fill: { colour: ['#9fffd8', '#5dffc0'], power: [0, 2.2], at: [0, 1.5, -2.6], reach: 9 } },
  // The same room with a real monitor on the desk: the fill is its screen, a metre in front (its power follows the screen: office2.ts).
  office2: { sky: ['#f2f6ff', '#5a6f9c'], ground: ['#8a93ac', '#1c2740'], ambient: [2.3, 1.0],
    key: { colour: ['#ffffff', '#b9c8e8'], power: [1.5, 0.45], from: [0.4, 3, 1.2] },
    fill: { colour: ['#9fffd8', '#5dffc0'], power: [0.1, 0.55], at: [0, 1.25, -0.8], reach: 6 } },
  // Candles on stone, a cold moon through the windows on the left; then the haunting comes on.
  castle: { sky: ['#7a6ac8', '#3f7f8c'], ground: ['#4a2a48', '#12202c'], ambient: [1.5, 1.0],
    key: { colour: ['#ffb26b', '#7fe0d0'], power: [2.4, 1.1], from: [1.6, 1.4, 0.6] },
    fill: { colour: ['#8fa6ff', '#58ffd9'], power: [5, 6], at: [-2.2, 2.0, -1.2], reach: 9 } },
  // Pale tiles under strip lights; then the lights go down and the green and the wall lamps are what is left.
  lab: { sky: ['#f4fbff', '#2c6a5c'], ground: ['#9db8bc', '#0b2226'], ambient: [2.3, 1.0],
    key: { colour: ['#ffffff', '#7fe8c0'], power: [1.4, 0.5], from: [-0.3, 3, 1] },
    fill: { colour: ['#ffb060', '#ffa040'], power: [0.6, 3], at: [2.4, 1.9, -1.6], reach: 8 } },
};

export function levelLights(id: Exclude<LevelId, 'kyoto'>) {
  const rig = RIGS[id];
  const group = new THREE.Group(); group.name = `${id}: lights`;
  const hemisphere = new THREE.HemisphereLight(rig.sky[0], rig.ground[0], rig.ambient[0]); group.add(hemisphere);
  const key = new THREE.DirectionalLight(rig.key.colour[0], rig.key.power[0]); key.position.set(...rig.key.from); group.add(key);
  const fill = rig.fill ? new THREE.PointLight(rig.fill.colour[0], rig.fill.power[0], rig.fill.reach, 1.6) : null;
  if (fill && rig.fill) { fill.position.set(...rig.fill.at); group.add(fill); }
  const a = new THREE.Color(), b = new THREE.Color();
  const mix = (pair: [string, string], t: number) => a.set(pair[0]).lerp(b.set(pair[1]), t);
  /** `flicker` multiplies the fill light (a flame, a failing tube); 1 is steady. */
  function update(blend: number, flicker = 1) {
    hemisphere.color.copy(mix(rig.sky, blend)); hemisphere.groundColor.copy(mix(rig.ground, blend));
    hemisphere.intensity = rig.ambient[0] + (rig.ambient[1] - rig.ambient[0]) * blend;
    key.color.copy(mix(rig.key.colour, blend)); key.intensity = rig.key.power[0] + (rig.key.power[1] - rig.key.power[0]) * blend;
    if (fill && rig.fill) { fill.color.copy(mix(rig.fill.colour, blend)); fill.intensity = (rig.fill.power[0] + (rig.fill.power[1] - rig.fill.power[0]) * blend) * flicker; }
  }
  update(0);
  return { group, update };
}
