/** The clearing joins a descending forest path, level home and shallow woodland swale.
 * The existing practice trough stays on a level pad; this is not a new river simulation.
 */
export const HERMIT_TREE_ROOTS = [22, 115, 185, 875, 957, 1010] as const;
const HERMIT_BANK: readonly (readonly [number, number])[] = [
  [0, 298], [80, 300], [160, 314], [240, 336], [445, 336],
  [505, 363], [535, 363], [600, 336], [810, 336], [915, 320], [1024, 312],
];

export function hermitClearingGroundY(x: number): number {
  for (let i = 1; i < HERMIT_BANK.length; i++) {
    const [left, y0] = HERMIT_BANK[i - 1]!, [right, y1] = HERMIT_BANK[i]!;
    if (x <= right) {
      const t = Math.max(0, (x - left) / (right - left));
      return Math.round(y0 + (y1 - y0) * t * t * (3 - 2 * t));
    }
  }
  return HERMIT_BANK[HERMIT_BANK.length - 1]![1];
}

/** Bare walking/working pads keep grass out of the hut threshold and teaching props. */
export function hermitClearingPad(x: number): boolean {
  return (x >= 240 && x <= 445) || (x >= 600 && x <= 810);
}
