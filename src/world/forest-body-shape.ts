import { intersects, type Aabb } from '../runtime/geometry';

/** Save-versioned silhouettes. Old saves retain the original rectangular bodies. */
export type ForestBodyShape = 'box-v1' | 'chipped-v1';
type Body = Aabb & { readonly id: string };
export interface ForestBodyRow { readonly left: number; readonly right: number }
const profiles: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  'stream.stone.a': [[4,8],[2,10],[1,11],[1,11],[0,12],[0,12],[0,12],[1,11],[1,11],[2,10],[3,9],[4,8]],
  'stream.stone.b': [[3,7],[2,9],[1,10],[0,11],[0,11],[0,12],[0,12],[1,12],[2,11],[2,10],[3,9],[4,8]],
  // Broken left face reaches the bottom. An inset lower-left bevel would let
  // the player's head enter under a 1 px lip and interrupt the approach jump.
  'stream.deadwood': [[3,35],[1,39],[0,40],[0,39],[0,39],[0,37]],
};
const cache = new Map<string, readonly ForestBodyRow[]>();

/** Conservative 1 px footprint, shared by drawing, terrain, actor contact and
 * liquid occupancy. A fractional move covers both touched pixel rows/columns.
 * This is translation-only, not rotating rigid-body physics. */
export function forestBodyFootprint(body: Body, shape: ForestBodyShape) {
  const x = Math.floor(body.x), y = Math.floor(body.y);
  const growX = Math.ceil(body.x + body.width - 1e-7) - x - body.width;
  const growY = Math.ceil(body.y + body.height - 1e-7) - y - body.height;
  const key = `${shape}:${body.id}:${body.width}:${body.height}:${growX}:${growY}`;
  let rows = cache.get(key);
  if (!rows) {
    if (!Number.isInteger(body.width) || !Number.isInteger(body.height) ||
      body.width < 1 || body.height < 1 || body.width > 256 || body.height > 256) throw new Error('invalid body silhouette dimensions');
    const profile = shape === 'chipped-v1' ? profiles[body.id] : undefined;
    if (shape === 'chipped-v1' && (!profile || profile.length !== body.height ||
      Math.max(...profile.map(row => row[1])) !== body.width)) throw new Error('unknown chipped body silhouette');
    rows = Object.freeze(Array.from({length: body.height + growY}, (_, row) => {
      const current = row < body.height ? profile?.[row] ?? [0, body.width] : undefined;
      const previous = growY && row > 0 ? profile?.[row - 1] ?? [0, body.width] : undefined;
      return Object.freeze({left: Math.min(current?.[0] ?? Infinity, previous?.[0] ?? Infinity),
        right: Math.max(current?.[1] ?? -Infinity, previous?.[1] ?? -Infinity) + growX});
    }));
    cache.set(key, rows);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return {x, y, rows};
}

export function forestBodyOccupies(body: Body, shape: ForestBodyShape, x: number, y: number): boolean {
  if (x < Math.floor(body.x) || x >= Math.ceil(body.x + body.width - 1e-7) ||
    y < Math.floor(body.y) || y >= Math.ceil(body.y + body.height - 1e-7)) return false;
  const footprint = forestBodyFootprint(body, shape);
  const row = footprint.rows[Math.floor(y) - footprint.y];
  return !!row && x >= footprint.x + row.left && x < footprint.x + row.right;
}

export function forestBodyOverlapsBounds(body: Body, shape: ForestBodyShape, bounds: Aabb): boolean {
  const footprint = forestBodyFootprint(body, shape);
  for (let row = Math.max(0, Math.floor(bounds.y) - footprint.y);
    row < footprint.rows.length && footprint.y + row < bounds.y + bounds.height; row++) {
    const span = footprint.rows[row]!;
    if (footprint.x + span.left < bounds.x + bounds.width && footprint.x + span.right > bounds.x) return true;
  }
  return false;
}

export function forestBodiesOverlap(a: Body, b: Body, shape: ForestBodyShape): boolean {
  // Preserve the exact continuous AABB test used by the v0.2 solver.
  if (shape === 'box-v1') return intersects(a, b);
  const fa = forestBodyFootprint(a, shape), fb = forestBodyFootprint(b, shape);
  for (let y = Math.max(fa.y, fb.y); y < Math.min(fa.y + fa.rows.length, fb.y + fb.rows.length); y++) {
    const ra = fa.rows[y - fa.y]!, rb = fb.rows[y - fb.y]!;
    if (fa.x + ra.left < fb.x + rb.right && fa.x + ra.right > fb.x + rb.left) return true;
  }
  return false;
}

export function forestBodyArea(body: Body, shape: ForestBodyShape): number {
  return forestBodyFootprint({...body, x:0, y:0}, shape).rows.reduce((area, row) => area + row.right - row.left, 0);
}
