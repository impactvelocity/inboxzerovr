import { STRIDE } from '../cut';

/**
 * Shapes for a letter other than the curled paper sheet: each a "soup" of triangles (see ../cut.ts)
 * the same half metre by 31 cm as the sheet, readable face towards +z, so that everything that
 * holds, hits and cuts a letter works on them unchanged.
 */
const W = 0.5, H = 0.3125;
type P = [number, number, number];

/** A quad a, b, c, d (anticlockwise seen from its front); uv follows x and y across the whole card. */
function quad(out: number[], a: P, b: P, c: P, d: P) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n = Math.hypot(nx, ny, nz) || 1; nx /= n; ny /= n; nz /= n;
  for (const p of [a, b, c, a, c, d]) out.push(p[0], p[1], p[2], nx, ny, nz, p[0] / W + 0.5, p[1] / H + 0.5);
}

/** A slab with a gently bulging face: a pane lifted off a CRT. */
export function paneSoup(): Float32Array {
  const out: number[] = [], back = -0.007, columns = 8, rows = 5, bulge = 0.011;
  const z = (x: number, y: number) => 0.004 + bulge * (1 - (2 * x / W) ** 2) * (1 - (2 * y / H) ** 2);
  const at = (i: number, j: number): P => { const x = -W / 2 + W * i / columns, y = -H / 2 + H * j / rows; return [x, y, z(x, y)]; };
  for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++) quad(out, at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
  const x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2, f = 0.004;
  quad(out, [x1, y0, back], [x0, y0, back], [x0, y1, back], [x1, y1, back]);                 // the back
  quad(out, [x0, y0, back], [x1, y0, back], [x1, y0, f], [x0, y0, f]);                       // and its four edges
  quad(out, [x1, y1, back], [x0, y1, back], [x0, y1, f], [x1, y1, f]);
  quad(out, [x0, y1, back], [x0, y0, back], [x0, y0, f], [x0, y1, f]);
  quad(out, [x1, y0, back], [x1, y1, back], [x1, y1, f], [x1, y0, f]);
  return new Float32Array(out);
}

/** A picture in its frame: the frame stands proud of the canvas by `rise`, over `border` metres all round. */
export function frameSoup(border: number): Float32Array {
  const out: number[] = [], b = border, lip = 0.011, top = 0.021, canvas = 0.006, back = -0.009;
  const x0 = -W / 2, x1 = W / 2, y0 = -H / 2, y1 = H / 2;
  // the frame's face: four mitred bars, lower at the outer lip than at the inner edge
  quad(out, [x0 + b, y1 - b, top], [x1 - b, y1 - b, top], [x1, y1, lip], [x0, y1, lip]);
  quad(out, [x1 - b, y0 + b, top], [x0 + b, y0 + b, top], [x0, y0, lip], [x1, y0, lip]);
  quad(out, [x0 + b, y0 + b, top], [x0 + b, y1 - b, top], [x0, y1, lip], [x0, y0, lip]);
  quad(out, [x1 - b, y1 - b, top], [x1 - b, y0 + b, top], [x1, y0, lip], [x1, y1, lip]);
  // the step down to the canvas, and the canvas
  quad(out, [x0 + b, y1 - b, canvas], [x1 - b, y1 - b, canvas], [x1 - b, y1 - b, top], [x0 + b, y1 - b, top]);
  quad(out, [x1 - b, y0 + b, canvas], [x0 + b, y0 + b, canvas], [x0 + b, y0 + b, top], [x1 - b, y0 + b, top]);
  quad(out, [x0 + b, y0 + b, canvas], [x0 + b, y1 - b, canvas], [x0 + b, y1 - b, top], [x0 + b, y0 + b, top]);
  quad(out, [x1 - b, y1 - b, canvas], [x1 - b, y0 + b, canvas], [x1 - b, y0 + b, top], [x1 - b, y1 - b, top]);
  quad(out, [x0 + b, y0 + b, canvas], [x1 - b, y0 + b, canvas], [x1 - b, y1 - b, canvas], [x0 + b, y1 - b, canvas]);
  // outside edges and the back
  quad(out, [x0, y0, back], [x1, y0, back], [x1, y0, lip], [x0, y0, lip]);
  quad(out, [x1, y1, back], [x0, y1, back], [x0, y1, lip], [x1, y1, lip]);
  quad(out, [x0, y1, back], [x0, y0, back], [x0, y0, lip], [x0, y1, lip]);
  quad(out, [x1, y0, back], [x1, y1, back], [x1, y1, lip], [x1, y0, lip]);
  quad(out, [x1, y0, back], [x0, y0, back], [x0, y1, back], [x1, y1, back]);
  return new Float32Array(out);
}
void STRIDE;
