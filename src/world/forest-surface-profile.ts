/** Optional saved identity: absence means the original collision surface, never an implicit migration. */
export type ForestSurfaceProfile = 'woodland-v2';
export const WOODLAND_EDGE_ROOTS = [328, 442, 818, 992, 1268, 1376, 1530, 1696, 2208, 2380] as const;

export function woodlandOpeningHeights(legacy: Int16Array): Int16Array {
  const heights = legacy.slice();
  for (let x = 0; x < 1712; x++) {
    let sum = 0, weight = 0;
    for (let d = -144; d <= 144; d++) {
      const w = 145 - Math.abs(d);
      sum += legacy[Math.max(0, Math.min(legacy.length - 1, x + d))]! * w; weight += w;
    }
    // Long landforms instead of shelves. Fade to the unchanged physical creek bank.
    const blend = smooth(Math.min(1, Math.max(0, (1712 - x) / 192)));
    const relief = Math.sin(x / 139) * 9 + Math.sin(x / 67 + 1) * 3;
    heights[x] = Math.round(legacy[x]! * (1 - blend) + (sum / weight + relief) * blend);
  }
  return heights;
}

export function woodlandSoilDepth(x: number): number {
  return 43 + Math.round(Math.sin(x / 83) * 12 + Math.sin(x / 29 + 1) * 6);
}

/** Erosion reveals the preserved creek bank gradually, without a vertical soil cut at x=1712. */
export function woodlandOpeningSoilDepth(x: number): number {
  const bank = smooth(Math.min(1, Math.max(0, (1712 - x) / 192)));
  return Math.round(9 + (woodlandSoilDepth(x) - 9) * bank);
}

const MEADOW: readonly (readonly [number, number])[] = [
  [0, 296], [64, 298], [150, 316], [235, 336], [370, 336],
  [460, 343], [530, 350], [600, 336], [764, 336], [850, 344], [920, 352], [1024, 358],
];

/** Two level building pads, a shallow grassy swale, and descending woodland approaches. */
export function woodlandMeadowY(x: number): number {
  for (let i = 1; i < MEADOW.length; i++) {
    const [left, y0] = MEADOW[i - 1]!, [right, y1] = MEADOW[i]!;
    if (x <= right) return Math.round(y0 + (y1 - y0) * smooth(Math.max(0, (x - left) / (right - left))));
  }
  return MEADOW[MEADOW.length - 1]![1];
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
