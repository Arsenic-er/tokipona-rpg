import type { ForestCameraState } from '../runtime/forest-camera';
export { WOODLAND_EDGE_ROOTS as OPENING_TREE_ROOTS } from '../world/forest-surface-profile';
export const MEADOW_TREE_ROOTS = [25, 108, 173, 835, 975] as const;

/** Background-only vegetation rooted in collision heights, behind terrain and actors. */
export function drawForestEdgeDressing(ctx: CanvasRenderingContext2D, camera: ForestCameraState,
  roots: readonly number[], groundAt: (x: number) => number | null): void {
  const ox = Math.round(camera.x), oy = Math.round(camera.y);
  for (const root of roots) {
    if (root + 90 < ox || root - 90 > ox + camera.width) continue;
    const floor = groundAt(root); if (floor === null) continue;
    const x = root - ox, y = floor - oy, height = 126 + root % 71, width = 5 + root % 4;
    if (y < 0 || y - height - 45 > camera.height) continue;
    for (let clump = 0; clump < 5; clump++) {
      const cx = x + (clump - 2) * 21, cy = y - height + Math.abs(clump - 2) * 13;
      for (let row = -21; row <= 20; row += 3) {
        const radius = Math.round(Math.sqrt(Math.max(0, 1 - (row / 24) ** 2)) * (29 + clump % 2 * 7));
        const uneven = Math.round(Math.sin((row + root + clump * 31) * .36) * 3);
        // Broken native-pixel leaf clusters let the distant artwork show through;
        // never stamp a large opaque ellipse over the more detailed forest asset.
        for (let leaf = -radius; leaf < radius; leaf += 4) {
          const seed = (Math.imul(root + leaf + clump * 37, 374761393) ^ Math.imul(row + clump * 17, 668265263)) >>> 0;
          if (seed % 5 < 2) continue;
          ctx.fillStyle = ['#2a3b32', '#34463a', '#3d4b3e'][seed % 3]!;
          ctx.fillRect(cx + leaf + uneven + seed % 2, cy + row + seed % 2, 2 + seed % 2, 1 + seed % 2);
        }
      }
    }
    ctx.fillStyle = '#26322c';
    for (let h = 0; h < height; h++) {
      const lean = Math.round(Math.sin(h / 57 + root) * Math.min(5, h / 18));
      const taper = Math.max(2, width - Math.floor(h / 32));
      ctx.fillRect(x + lean - Math.floor(taper / 2), y - h, taper, 1);
    }
    ctx.fillStyle = '#384135';
    for (let h = 9; h < height - 24; h += 17) ctx.fillRect(x - 1, y - h, 1, 7);
    for (let branch = 0; branch < 4; branch++) {
      const sign = branch % 2 ? 1 : -1, start = height * .52 + branch * 12;
      ctx.fillStyle = '#2b352d';
      for (let d = 0; d < 23; d++) ctx.fillRect(x + sign * d, Math.round(y - start - d * .65), 2, 2);
    }
    ctx.fillStyle = '#2f3b2d'; ctx.fillRect(x - width, y - 2, width * 2, 5);
  }
}
