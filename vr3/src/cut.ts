/**
 * Cutting a mesh in two with a plane: what the katana does to a letter.
 *
 * A mesh here is a "soup": triangles laid end to end with nothing shared, each corner carrying a
 * position, a normal and a uv (8 numbers). That makes a cut simple: every triangle is wholly on one
 * side, or is itself cut into a triangle and a quad with new corners along the plane. A piece can
 * be cut again.
 */

/** Numbers per corner: position 3, normal 3, uv 2. */
export const STRIDE = 8;

export interface Soup {
  /** x y z, nx ny nz, u v for every corner, three corners to a triangle. */
  data: Float32Array;
  /** Twice its area, summed over triangles facing +z: how much paper there is. */
  area: number;
  /** Where its middle is (by area), and how far its furthest corner is from there. */
  centre: [number, number, number];
  radius: number;
}

/** Measure a soup: area, middle, reach. */
export function measure(data: Float32Array): Soup {
  let area = 0, cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < data.length; i += STRIDE * 3) {
    const ax = data[i], ay = data[i + 1], bx = data[i + STRIDE], by = data[i + STRIDE + 1], qx = data[i + 2 * STRIDE], qy = data[i + 2 * STRIDE + 1];
    const a = Math.abs((bx - ax) * (qy - ay) - (qx - ax) * (by - ay)) / 2;
    area += a;
    cx += a * (ax + bx + qx) / 3; cy += a * (ay + by + qy) / 3;
    cz += a * (data[i + 2] + data[i + STRIDE + 2] + data[i + 2 * STRIDE + 2]) / 3;
  }
  const centre: [number, number, number] = area > 0 ? [cx / area, cy / area, cz / area] : [0, 0, 0];
  let radius = 0;
  for (let i = 0; i < data.length; i += STRIDE) radius = Math.max(radius, Math.hypot(data[i] - centre[0], data[i + 1] - centre[1], data[i + 2] - centre[2]));
  // a letter is a shell with a front and a back, so the paper is half of what was summed
  return { data, area: area / 2, centre, radius };
}

/** Move a soup so its middle is at the origin (a piece then turns about its own middle). */
export function recentre(soup: Soup): Soup {
  const [cx, cy, cz] = soup.centre;
  for (let i = 0; i < soup.data.length; i += STRIDE) { soup.data[i] -= cx; soup.data[i + 1] -= cy; soup.data[i + 2] -= cz; }
  soup.centre = [0, 0, 0];
  return soup;
}

/**
 * Cut by the plane through (px, py, pz) whose normal is (nx, ny, nz). Returns the part on the
 * normal's side and the part behind it; either may be empty.
 */
export function cut(data: Float32Array, px: number, py: number, pz: number, nx: number, ny: number, nz: number): [Float32Array, Float32Array] {
  const front: number[] = [], back: number[] = [];
  const corner = new Float32Array(STRIDE * 2);
  const push = (to: number[], from: ArrayLike<number>, at: number) => { for (let k = 0; k < STRIDE; k++) to.push(from[at + k]); };
  // the new corner where the edge from corner a to corner b meets the plane, written into `corner` at `slot`
  const meet = (a: number, da: number, b: number, db: number, slot: number) => {
    const t = da / (da - db);
    for (let k = 0; k < STRIDE; k++) corner[slot + k] = data[a + k] + (data[b + k] - data[a + k]) * t;
  };
  for (let i = 0; i < data.length; i += STRIDE * 3) {
    const at = [i, i + STRIDE, i + 2 * STRIDE];
    const side = at.map(c => (data[c] - px) * nx + (data[c + 1] - py) * ny + (data[c + 2] - pz) * nz);
    const ahead = side.filter(s => s >= 0).length;
    if (ahead === 3) { for (const c of at) push(front, data, c); continue; }
    if (ahead === 0) { for (const c of at) push(back, data, c); continue; }
    // one corner is alone on its side: turn the triangle so that corner comes first
    const alone = ahead === 1 ? side.findIndex(s => s >= 0) : side.findIndex(s => s < 0);
    const a = at[alone], b = at[(alone + 1) % 3], c = at[(alone + 2) % 3];
    const da = side[alone], db = side[(alone + 1) % 3], dc = side[(alone + 2) % 3];
    meet(a, da, b, db, 0);          // on edge a-b
    meet(a, da, c, dc, STRIDE);     // on edge a-c
    const [lone, pair] = ahead === 1 ? [front, back] : [back, front];
    push(lone, data, a); push(lone, corner, 0); push(lone, corner, STRIDE);
    push(pair, corner, 0); push(pair, data, b); push(pair, data, c);
    push(pair, corner, 0); push(pair, data, c); push(pair, corner, STRIDE);
  }
  return [new Float32Array(front), new Float32Array(back)];
}

/** Is (x, y) over the soup, looking along z? Only the triangles facing +z are asked. */
export function covers(data: Float32Array, x: number, y: number): boolean {
  for (let i = 0; i < data.length; i += STRIDE * 3) {
    if (data[i + 5] < 0.3) continue;
    const ax = data[i], ay = data[i + 1], bx = data[i + STRIDE], by = data[i + STRIDE + 1], cx = data[i + 2 * STRIDE], cy = data[i + 2 * STRIDE + 1];
    const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
    const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
    const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
  }
  return false;
}
