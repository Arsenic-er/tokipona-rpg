import type { ForestSurfaceProfile } from './forest-surface-profile';

/** Episode-only identity. Existing woodland-v2 saves keep their original mill floor. */
export type EpisodeTerrainProfile = ForestSurfaceProfile | 'mill-valley-v1' | 'forest-clearing-v1';
/** Later surface bundles preserve the same mill geometry and drainage. */
export function hasMillValley(profile?: EpisodeTerrainProfile): boolean {
  return profile === 'mill-valley-v1' || profile === 'forest-clearing-v1';
}
export const MILL_TREE_ROOTS = [28, 128, 200, 994] as const;
const MILL_BANK: readonly (readonly [number, number])[] = [
  [0, 288], [80, 292], [150, 307], [240, 336], [310, 336],
  [400, 345], [470, 344], [520, 344], [575, 366], [603, 366],
  [650, 394], [670, 394], [745, 336], [959, 336], [1024, 352],
];

/** A descending forest approach, timber pad, eroded hollow and level mill foundation.
 * The repair flume retains its independent, already-tested water simulation.
 */
export function millValleyGroundY(x: number): number {
  for (let i = 1; i < MILL_BANK.length; i++) {
    const [left, y0] = MILL_BANK[i - 1]!, [right, y1] = MILL_BANK[i]!;
    if (x <= right) {
      const t = Math.max(0, (x - left) / (right - left));
      return Math.round(y0 + (y1 - y0) * t * t * (3 - 2 * t));
    }
  }
  return MILL_BANK[MILL_BANK.length - 1]![1];
}
