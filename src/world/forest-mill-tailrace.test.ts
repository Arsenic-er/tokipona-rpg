import { describe, expect, it } from 'vitest';
import { advanceEpisodeWater, emptyEpisodeWater, validateEpisodeWater } from './forest-episode-water';
import { advanceMillTailrace, emptyMillTailrace, MILL_TAILRACE, millDrainInterior, millTailraceMapMaterial, millTailraceSolid, receiveMillOutflow, validateMillTailrace } from './forest-mill-tailrace';

describe('mill outflow follows a conserved, visible path', () => {
  const controls = { kind: 'mill' as const, gate: true, cleared: true, plugged: false };
  it('keeps old channel behavior and delivers only actual outlet cells downstream', () => {
    const upstream = emptyEpisodeWater(), reference = emptyEpisodeWater(), tail = emptyMillTailrace(0);
    for (let tick = 0; tick < 2400; tick++) {
      advanceEpisodeWater(upstream, controls, x => receiveMillOutflow(tail, x));
      advanceEpisodeWater(reference, controls); advanceMillTailrace(tail);
      if (tick % 100 === 0) validateMillTailrace(tail, upstream.escaped, upstream.tick);
    }
    expect(upstream).toEqual(reference); expect(tail.received).toBe(upstream.escaped);
    expect(tail.escaped).toBeGreaterThan(1000); expect(tail.drops.length).toBeGreaterThan(100);
    expect(tail.pending).toEqual([0, 0, 0, 0]);
    expect(upstream.supplied).toBe(upstream.cells.reduce((n, v) => n + v, 0) + tail.drops.length + tail.escaped);
    validateEpisodeWater(upstream);
  });
  it('keeps a dry downstream when the gate is closed or the channel is blocked', () => {
    for (const c of [{ ...controls, gate: false }, { ...controls, cleared: false }]) {
      const upstream = emptyEpisodeWater(), tail = emptyMillTailrace(0);
      for (let i = 0; i < 500; i++) { advanceEpisodeWater(upstream, c, x => receiveMillOutflow(tail, x)); advanceMillTailrace(tail); }
      expect(tail.received).toBe(0); expect(tail.drops).toEqual([]);
    }
  });
  it('drains residual water after closing the gate; mid-flow restore is deterministic', () => {
    const upstream = emptyEpisodeWater(), tail = emptyMillTailrace(0);
    for (let i = 0; i < 1000; i++) { advanceEpisodeWater(upstream, controls, x => receiveMillOutflow(tail, x)); advanceMillTailrace(tail); }
    const copy = structuredClone(tail), before = tail.escaped;
    // Finish transferring the upstream remainder with the gate closed.
    for (let i = 0; i < 1800; i++) {
      advanceEpisodeWater(upstream, { ...controls, gate: false }, x => { receiveMillOutflow(tail, x); receiveMillOutflow(copy, x); });
      advanceMillTailrace(tail); advanceMillTailrace(copy);
    }
    expect(copy).toEqual(tail); expect(tail.escaped).toBeGreaterThan(before);
    expect(tail.pending).toEqual([0, 0, 0, 0]); expect(tail.drops).toEqual([]);
    validateMillTailrace(tail, upstream.escaped, upstream.tick);
  });
  it('uses matching map, water collision and drain geometry; all active pixels stay out of walls', () => {
    const tail = emptyMillTailrace(0);
    for (let n = 0; n < 350; n++) { receiveMillOutflow(tail, 156 + n % 4); advanceMillTailrace(tail); }
    const drops = new Set(tail.drops);
    for (const i of drops) {
      const x = MILL_TAILRACE.x + i % MILL_TAILRACE.width, y = MILL_TAILRACE.y + Math.floor(i / MILL_TAILRACE.width);
      expect(millTailraceSolid(x, y)).toBe(false); expect(millTailraceMapMaterial(x, y, drops)).toBe(7);
    }
    expect(millDrainInterior(656, 394)).toBe(true); expect(millTailraceSolid(657, 394)).toBe(true);
    expect(millTailraceMapMaterial(657, 394, drops)).toBe(4);
    expect(millTailraceMapMaterial(0, 0, drops)).toBeNull();
  });
  it('rejects duplication, water in walls, wrong counters and incompatible versions', () => {
    const tail = emptyMillTailrace(20); receiveMillOutflow(tail, 156); advanceMillTailrace(tail);
    validateMillTailrace(tail, 21, 100);
    for (const patch of [{ drops: [36, 36], received: 2 }, { drops: [0], received: 2 }, { received: 9 }, { version: 'future' }, { pending: [-1, 0, 0, 0] }]) {
      expect(() => validateMillTailrace({ ...tail, ...patch } as typeof tail, 21, 100)).toThrow();
    }
    const wall = (400 - MILL_TAILRACE.y) * MILL_TAILRACE.width;
    expect(() => validateMillTailrace({ ...tail, drops: [wall] }, 21, 100)).toThrow();
    expect(() => receiveMillOutflow(tail, 80)).toThrow();
  });
});
