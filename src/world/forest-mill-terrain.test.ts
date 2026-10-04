import { describe, expect, it } from 'vitest';
import { millValleyGroundY } from './forest-mill-terrain';
import { episodeGround } from '../game/forest-episode';

describe('mill-valley-v1 collision surface', () => {
  it('descends from the forest into a hollow without artificial vertical shelves', () => {
    expect(millValleyGroundY(0)).toBe(288);
    expect(millValleyGroundY(660)).toBe(394);
    for (let x = 1; x < 1024; x++) {
      expect(Math.abs(millValleyGroundY(x) - millValleyGroundY(x - 1))).toBeLessThanOrEqual(2);
      expect(episodeGround('mill', x, 'mill-valley-v1')).toBe(millValleyGroundY(x));
    }
  });
  it('keeps timber and the entire building foundation level', () => {
    for (const [left, right] of [[240, 310], [745, 959]]) {
      for (let x = left!; x <= right!; x++) expect(millValleyGroundY(x)).toBe(336);
    }
  });
  it('does not change old mills, the meadow or the hermit practice scene', () => {
    for (let x = 0; x < 1024; x++) {
      expect(episodeGround('mill', x)).toBe(336);
      expect(episodeGround('mill', x, 'woodland-v2')).toBe(336);
      for (const place of ['settlement', 'hermit'] as const) {
        expect(episodeGround(place, x, 'mill-valley-v1')).toBe(episodeGround(place, x, 'woodland-v2'));
      }
    }
  });
});
