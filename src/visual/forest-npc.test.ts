import { describe, expect, it } from 'vitest';
import { rasterForestNpc } from './forest-npc';
describe('distinct stationary forest inhabitants', () => {
  it('uses different silhouettes, not hue rotations of the player, with opaque native pixels', () => {
    const worker = rasterForestNpc('worker'), hermit = rasterForestNpc('hermit');
    const alpha = (p: Uint8ClampedArray) => [...p].filter((_, i) => i % 4 === 3);
    expect(alpha(worker)).not.toEqual(alpha(hermit));
    for (const sprite of [worker, hermit]) { expect(sprite.length).toBe(24 * 28 * 4); expect(new Set(alpha(sprite))).toEqual(new Set([0, 255])); }
    expect(worker).toEqual(rasterForestNpc('worker')); expect(hermit).toEqual(rasterForestNpc('hermit'));
    // Blinking cannot change either foot contact or the silhouette.
    expect(alpha(rasterForestNpc('worker', 1))).toEqual(alpha(worker));
    expect(alpha(rasterForestNpc('hermit', 1))).toEqual(alpha(hermit));
  });
});
