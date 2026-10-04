import { describe, expect, it } from 'vitest';
import { hermitClearingGroundY, hermitClearingPad } from './forest-hermit-terrain';
import { episodeGround } from '../game/forest-episode';
import { millValleyGroundY } from './forest-mill-terrain';

describe('hermit clearing surface', () => {
  it('connects the forest approach, home and practice area without vertical shelves', () => {
    expect(hermitClearingGroundY(0)).toBe(298);
    expect(hermitClearingGroundY(520)).toBe(363);
    expect(hermitClearingGroundY(1024)).toBe(312);
    for (let x = 1; x <= 1024; x++) {
      expect(Math.abs(hermitClearingGroundY(x) - hermitClearingGroundY(x - 1))).toBeLessThanOrEqual(1);
    }
  });
  it('keeps the entire hut, resting place and fixed practice trough on level ground', () => {
    for (let x = 0; x < 1024; x++) {
      if (hermitClearingPad(x)) expect(hermitClearingGroundY(x)).toBe(336);
    }
    for (const x of [250, 270, 283, 318, 408, 410, 439, 612, 620, 720, 780, 802]) {
      expect(hermitClearingPad(x)).toBe(true);
    }
  });
  it('changes only the new hermit surface and preserves the mill and meadow definitions', () => {
    for (let x = 0; x < 1024; x++) {
      expect(episodeGround('hermit', x, 'forest-clearing-v1')).toBe(hermitClearingGroundY(x));
      expect(episodeGround('mill', x, 'forest-clearing-v1')).toBe(millValleyGroundY(x));
      expect(episodeGround('settlement', x, 'forest-clearing-v1')).toBe(episodeGround('settlement', x, 'mill-valley-v1'));
      for (const profile of [undefined, 'woodland-v2', 'mill-valley-v1'] as const)
        expect(episodeGround('hermit', x, profile)).toBe(336 + Math.round(Math.sin(x / 100 + 1) * 4));
    }
  });
  it('clamps out-of-bounds samples to the forest shoulders', () => {
    expect(hermitClearingGroundY(-80)).toBe(298);
    expect(hermitClearingGroundY(1200)).toBe(312);
  });
});
