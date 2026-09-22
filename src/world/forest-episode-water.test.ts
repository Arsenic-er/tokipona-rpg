import { describe, it, expect } from 'vitest';
import { emptyEpisodeWater, advanceEpisodeWater, supplyEpisodeWater, collectedEpisodeWater, validateEpisodeWater } from './forest-episode-water';

describe('episode channel physics', () => {
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
