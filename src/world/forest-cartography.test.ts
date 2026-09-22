import { describe, expect, it } from 'vitest';
import { ForestCartography, MAP_UNKNOWN, type CartographySave } from './forest-cartography';
describe('exploration knowledge', () => {
  it('starts dark and reveals only the physical neighborhood, not a whole area', () => {
    const map = new ForestCartography(); expect(map.visited('mill')).toBe(false);
    map.observe('settlement', { x: 120, y: 320 }, () => 0);
    expect(map.at('settlement', 120, 320)).toBe(0);
    expect(map.at('settlement', 600, 320)).toBe(MAP_UNKNOWN);
    expect(map.at('mill', 120, 320)).toBe(MAP_UNKNOWN);
    expect(map.observe('settlement', { x: 120, y: 320 }, () => 0)).toBe(false);
  });
  it('records the first wall and does not see passages behind it', () => {
    const map = new ForestCartography();
    map.observe('opening', { x: 120, y: 320 }, x => x >= 160 && x < 192 ? 4 : 0);
    expect(map.at('opening', 168, 320)).toBe(4);
    expect(map.at('opening', 216, 320)).toBe(MAP_UNKNOWN);
    map.observe('opening', { x: 240, y: 320 }, () => 0);
    expect(map.at('opening', 216, 320)).toBe(0);
  });
  it('persists independent areas, remembers earlier paths, updates changed visible terrain', () => {
    const map = new ForestCartography(); map.observe('opening', { x: 200, y: 320 }, () => 0);
    map.observe('opening', { x: 600, y: 320 }, () => 0); map.observe('mill', { x: 120, y: 320 }, () => 7);
    const restored = ForestCartography.restore(JSON.parse(JSON.stringify(map.toSave())));
    expect(restored.toSave()).toEqual(map.toSave()); expect(restored.at('opening', 200, 320)).toBe(0);
    expect(restored.at('hermit', 120, 320)).toBe(MAP_UNKNOWN);
    restored.observe('mill', { x: 120, y: 320 }, () => 0, true); expect(restored.at('mill', 120, 320)).toBe(0);
  });
  it('rejects corrupted, out-of-range and duplicate cells without mutating the input', () => {
    for (const areas of [{ nowhere: [] }, { mill: [[-1,0]] }, { mill: [[0,255]] }, { mill: [[0,1],[0,2]] }, { mill: [[999999,0]] }, { mill: [[0,null]] }]) {
      const save = { version: 1, areas }; const before = JSON.stringify(save);
      expect(() => ForestCartography.restore(save)).toThrow(); expect(JSON.stringify(save)).toBe(before);
    }
    const map = ForestCartography.restore({ version: 1, areas: {} } satisfies CartographySave);
    expect(map.observe('opening', { x: NaN, y: 8 }, () => 0)).toBe(false);
  });
});
