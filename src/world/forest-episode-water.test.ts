import { describe, it, expect } from 'vitest';
import { emptyEpisodeWater, advanceEpisodeWater, supplyEpisodeWater, collectedEpisodeWater, validateEpisodeWater, episodeWaterSolid } from './forest-episode-water';

describe('episode channel physics', () => {
  it('a saturated blocked channel cannot eject gate water through the uncleared silt', () => {
    const s = emptyEpisodeWater(), c = { kind: 'mill' as const, gate: false, cleared: false, plugged: false };
    for (let y = 0; y < 48; y++) for (let x = 0; x < 79; x++) {
      if (!episodeWaterSolid(x, y, c)) { s.cells[y * 160 + x] = 1; s.supplied++; }
    }
    s.cells[10 * 160 + 24] = 1; s.supplied++;
    advanceEpisodeWater(s, c);
    expect(s.cells.some((v, i) => v > 0 && i % 160 >= 79)).toBe(false);
    expect(s.escaped).toBe(0); validateEpisodeWater(s);
  });
  it('closing a gate displaces water into the channel, never invents a bottom outlet', () => {
    const s = emptyEpisodeWater(), c = { kind: 'mill' as const, gate: false, cleared: true, plugged: false };
    s.cells[10 * 160 + 24] = 1; s.supplied = 1;
    const outlets: number[] = [];
    advanceEpisodeWater(s, c, x => outlets.push(x));
    expect(outlets).toEqual([]); expect(s.escaped).toBe(0);
    expect(s.cells[10 * 160 + 24]).toBe(0); validateEpisodeWater(s);
  });
  it('only drives the wheel after gate and physical blockage are both open; conserves water', () => {
    const s = emptyEpisodeWater();
    const controls = { kind: 'mill' as const, gate: false, cleared: false, plugged: false };
    for (let i = 0; i < 500; i++) advanceEpisodeWater(s, controls);
    expect(s.escaped).toBe(0);
    controls.gate = true;
    for (let i = 0; i < 500; i++) advanceEpisodeWater(s, controls);
    expect(s.escaped).toBe(0);
    controls.cleared = true;
    for (let i = 0; i < 600; i++) advanceEpisodeWater(s, controls);
    expect(s.escaped).toBeGreaterThan(50);
    validateEpisodeWater(s);
  });
  it.each([false, true])('practice leak plugged=%s: gravity and retained water determine the result', plugged => {
    const s = emptyEpisodeWater(), controls = { kind: 'practice' as const, gate: false, cleared: false, plugged };
    expect(supplyEpisodeWater(s, 32, controls)).toBe(32);
    for (let i = 0; i < 1200; i++) advanceEpisodeWater(s, controls);
    expect(collectedEpisodeWater(s)).toBe(plugged ? 32 : 0);
    expect(s.escaped).toBe(plugged ? 0 : 32);
    validateEpisodeWater(s);
  });
});
