import { describe, expect, it } from 'vitest';
import { rasterForestBuilding } from './forest-architecture';
import { forestEarthProfile } from './forest-earth-profile';
describe('native pixel architectural surfaces', () => {
  it('has deterministic, opaque-or-transparent pixels and distinct building materials', () => {
    const store = rasterForestBuilding('store', 135, 70), inn = rasterForestBuilding('inn', 135, 70);
    expect(store).toEqual(rasterForestBuilding('store', 135, 70)); expect(store.data).not.toEqual(inn.data);
    let transparent = 0; const colors = new Set<string>();
    for (let i = 0; i < store.data.length; i += 4) {
      expect([0,255]).toContain(store.data[i+3]); if (!store.data[i+3]) transparent++;
      else colors.add(store.data.slice(i,i+3).join(','));
    }
    expect(transparent).toBeGreaterThan(3000); expect(colors.size).toBeGreaterThan(40);
    expect(() => rasterForestBuilding('mill', 1000, 60)).toThrow();
  });
  it('gives the earth an irregular material boundary, with no change to the surface height', () => {
    let soil = 0, stone = 0;
    for (let x = 0; x < 512; x++) {
      const rgb = forestEarthProfile(x, 43, 336, false);
      if (rgb[0] > rgb[2]) soil++; else stone++;
      expect(forestEarthProfile(x, 43, 336, false)).toEqual(rgb);
    }
    expect(soil).toBeGreaterThan(30); expect(stone).toBeGreaterThan(30);
    for (let x = 0; x < 512; x += 7) {
      const shallow = forestEarthProfile(x, 19, 336, false), deep = forestEarthProfile(x, 150, 336, false);
      expect(shallow[0]).toBeGreaterThan(shallow[2]);
      expect(deep.reduce((a,b) => a+b)).toBeLessThan(shallow.reduce((a,b) => a+b));
    }
  });
});
