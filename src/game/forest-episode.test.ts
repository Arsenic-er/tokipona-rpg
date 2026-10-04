import { beforeAll, describe, it, expect } from 'vitest';
import { ForestEpisode, EPISODE_TARGETS, episodeGround, episodeCollides, type EpisodeTarget, type ForestEpisodeSave } from './forest-episode';
import { completedOpeningFixture } from '../../scripts/testing/forest-episode-fixture';
import { sha256Canonical, type JsonValue } from '../canonical-json';
import { PrologueForestOpeningSession } from './prologue-forest-opening';
let start: ForestEpisodeSave;
beforeAll(() => { start = ForestEpisode.begin(completedOpeningFixture()).toSave(); }, 30000);
const wait = (g: ForestEpisode, n = 720) => { for (let i = 0; i < n; i++) g.advance(); };
function approach(g: ForestEpisode, id: EpisodeTarget): void {
  const target = EPISODE_TARGETS[g.state.place].find(t => t.id === id)!;
  if (!target) throw new Error(`No target ${id}`);
  for (let i = 0; i < 1600; i++) {
    const dx = target.x - g.state.player.x - 6;
    if (Math.abs(dx) < 3) { wait(g, 30); expect(g.nearest()?.id).toBe(id); return; }
    g.advance({ moveX: Math.abs(dx) < 20 ? Math.sign(dx) * .25 : Math.sign(dx), jump: false });
  }
  throw new Error(`Walk stalled approaching ${id}`);
}
function act(g: ForestEpisode, id: EpisodeTarget, choice?: string) { approach(g, id); return g.interact(id, choice); }
function repair(g: ForestEpisode): void {
  act(g, 'worker', 'accept'); act(g, 'mill-road'); act(g, 'timber'); act(g, 'brace'); act(g, 'silt'); act(g, 'gate'); wait(g);
  expect(g.has('repaired')).toBe(true); act(g, 'medium'); act(g, 'return'); act(g, 'worker'); act(g, 'hermit-road'); act(g, 'hermit');
}

describe('waterwheel & fragment playable episode', () => {
  it.each([undefined, 'woodland-v2', 'mill-valley-v1'] as const)('keeps old %s hermit saves on their original ground with exact restore', profile => {
    const previous = structuredClone(start); previous.physical.terrainProfile = profile;
    if (profile === undefined) delete previous.physical.terrainProfile;
    const x = previous.physical.player.x;
    previous.physical.player = { ...previous.physical.player, y: Math.min(...Array.from({ length: 12 }, (_, i) => episodeGround('settlement', x + i, profile))) - 14 };
    const { checksum: _, ...body } = previous; previous.checksum = sha256Canonical(body as unknown as JsonValue);
    const g = ForestEpisode.restore(previous); repair(g);
    expect(g.terrainProfile).toBe(profile);
    for (let x = 0; x < 1024; x++) expect(g.groundAt(x)).toBe(336 + Math.round(Math.sin(x / 100 + 1) * 4));
    const save = g.toSave(); expect(ForestEpisode.restore(save).toSave()).toEqual(save);
    act(g, 'pool'); wait(g); act(g, 'plug'); act(g, 'pool', 'downhill'); act(g, 'pool'); wait(g);
    expect(g.has('practiced')).toBe(true);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  }, 30000);
  it('walks the hermit clearing both ways, reaches every prop and reloads in the swale without changing progression', () => {
    const g = ForestEpisode.restore(start); repair(g);
    const before = structuredClone(g.sessionState);
    let deepest = 0, restoredInSwale = false;
    for (const direction of [1, -1]) {
      for (let i = 0; i < 720; i++) {
        g.advance({ moveX: direction, jump: false });
        const p = g.state.player; deepest = Math.max(deepest, p.y);
        expect(episodeCollides('hermit', { ...p, width: 12, height: 14 }, g.terrainProfile)).toBe(false);
        if (p.x > 505 && p.x < 520) {
          expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave()); restoredInSwale = true;
        }
      }
      expect(direction > 0 ? g.state.player.x > 980 : g.state.player.x < 40).toBe(true);
      wait(g, 30); expect(g.state.player.grounded).toBe(true);
    }
    expect(deepest).toBeGreaterThan(345); expect(restoredInSwale).toBe(true);
    for (const target of ['rest', 'hermit', 'pool', 'plug', 'return'] as const) approach(g, target);
    expect(g.sessionState).toEqual(before);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  }, 30000);

  it('keeps legacy terrain saves byte-equivalent and rejects unknown terrain identities', () => {
    const legacy = structuredClone(start);
    delete legacy.physical.terrainProfile;
    const x = legacy.physical.player.x;
    legacy.physical.player = { ...legacy.physical.player, y: Math.min(...Array.from({ length: 12 }, (_, i) => episodeGround('settlement', x+i))) - 14 };
    const { checksum: _, ...body } = legacy;
    legacy.checksum = sha256Canonical(body as unknown as JsonValue);
    const old = ForestEpisode.restore(legacy);
    expect(old.toSave()).toEqual(legacy);
    expect(old.groundAt(120)).toBe(episodeGround('settlement',120));
    expect(ForestEpisode.restore(start).groundAt(120)).not.toBe(old.groundAt(120));
    expect(start.physical.terrainProfile).toBe('forest-clearing-v1');
    const invalid = { ...body, physical: { ...body.physical, terrainProfile: 'future' } };
    expect(() => ForestEpisode.restore({ ...invalid, checksum: sha256Canonical(invalid as unknown as JsonValue) })).toThrow('地形版本');
    act(old, 'worker', 'accept'); act(old, 'mill-road'); act(old, 'return');
    expect(old.toSave().physical.terrainProfile).toBeUndefined();
    expect(ForestEpisode.restore(old.toSave()).toSave()).toEqual(old.toSave());
  });
  it('keeps woodland-v2 mill saves flat and round-trips without changing water, progression or position', () => {
    const earlier = structuredClone(start); earlier.physical.terrainProfile = 'woodland-v2';
    const { checksum: _, ...body } = earlier; earlier.checksum = sha256Canonical(body as unknown as JsonValue);
    const old = ForestEpisode.restore(earlier);
    act(old, 'worker', 'accept'); act(old, 'mill-road'); act(old, 'timber');
    for (let x = 0; x < 1024; x++) expect(old.groundAt(x)).toBe(336);
    const save = old.toSave(); expect(ForestEpisode.restore(save).toSave()).toEqual(save);
    act(old, 'brace'); act(old, 'silt'); act(old, 'gate'); wait(old);
    expect(old.has('repaired')).toBe(true); expect(old.terrainProfile).toBe('woodland-v2');
    expect(ForestEpisode.restore(old.toSave()).toSave()).toEqual(old.toSave());
  });
  it('walks the new mill banks in both directions without jumps, penetration or save migration', () => {
    const g = ForestEpisode.restore(start); act(g, 'mill-road');
    let lowest = 0;
    for (const direction of [1, -1]) {
      for (let i = 0; i < 590; i++) {
        g.advance({ moveX: direction, jump: false });
        const p = g.state.player; lowest = Math.max(lowest, p.y);
        expect(episodeCollides('mill', { ...p, width: 12, height: 14 }, g.terrainProfile)).toBe(false);
      }
      expect(direction > 0 ? g.state.player.x > 930 : g.state.player.x < 140).toBe(true);
      wait(g, 30); expect(g.state.player.grounded).toBe(true);
      expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    }
    expect(lowest).toBeGreaterThan(375);
  });
  it('rejects an unfinished opening and distant actions; no state changes', () => {
    expect(() => ForestEpisode.begin(PrologueForestOpeningSession.fresh({ sessionId: 'early', seed: 'early' }))).toThrow();
    const g = ForestEpisode.restore(start), before = g.toSave();
    expect(g.interact('medium').accepted).toBe(false); expect(g.interact('worker', 'accept').accepted).toBe(false);
    expect(g.toSave()).toEqual(before);
  });
  it('restores flowing water exactly, freezes it off-screen, and upgrades old valley saves without resurrecting escaped water', () => {
    const g = ForestEpisode.restore(start);
    act(g, 'worker', 'accept'); act(g, 'mill-road'); act(g, 'timber'); act(g, 'brace'); act(g, 'silt'); act(g, 'gate'); wait(g, 1000);
    expect(g.state.tailrace!.escaped).toBeGreaterThan(0);
    const live = g.toSave(), restored = ForestEpisode.restore(live);
    expect(restored.toSave()).toEqual(live); wait(g, 60); wait(restored, 60);
    expect(restored.toSave()).toEqual(g.toSave());
    const old = structuredClone(live); delete old.physical.tailrace;
    const { checksum: _, ...body } = old; old.checksum = sha256Canonical(body as unknown as JsonValue);
    const upgraded = ForestEpisode.restore(old); expect(upgraded.toSave()).toEqual(old);
    upgraded.advance(); expect(upgraded.state.tailrace!.upstreamOffset).toBe(old.physical.mill.escaped);
    expect(upgraded.state.tailrace!.received).toBe(upgraded.state.mill.escaped - old.physical.mill.escaped);
    expect(ForestEpisode.restore(upgraded.toSave()).toSave()).toEqual(upgraded.toSave());
    const corrupt = structuredClone(live); corrupt.physical.tailrace!.received++;
    const { checksum: __, ...corruptBody } = corrupt; corrupt.checksum = sha256Canonical(corruptBody as unknown as JsonValue);
    expect(() => ForestEpisode.restore(corrupt)).toThrow('守恒');
    act(g, 'return'); const frozen = structuredClone(g.state.tailrace); wait(g, 600);
    expect(g.state.tailrace).toEqual(frozen);
  }, 30000);
  it('plays the entire zero-kill episode, restores each transition and awards once without word/capacity inflation', () => {
    let g = ForestEpisode.restore(start);
    const initial = g.sessionState;
    repair(g);
    expect(g.sessionState.mp).toEqual(initial.mp);
    expect(g.sessionState.learning).toEqual(initial.learning);
    expect(g.sessionState.capabilities).toEqual(initial.capabilities);
    g = ForestEpisode.restore(g.toSave());
    act(g, 'pool'); wait(g, 600);
    expect(g.interact('pool', 'hover').text).toContain('重力');
    expect(g.has('predicted')).toBe(false); expect(g.sessionState.mp).toEqual(initial.mp);
    expect(g.interact('pool', 'downhill').accepted).toBe(true);
    expect(g.interact('pool').text).toContain('MP −2');
    wait(g, 600); expect(g.has('practiced')).toBe(false);
    act(g, 'plug'); g = ForestEpisode.restore(g.toSave());
    act(g, 'pool'); wait(g, 600); expect(g.has('practiced')).toBe(true);
    expect(g.sessionState.mp.currentMp).toBe(initial.mp.currentMp - 4);
    act(g, 'hermit'); act(g, 'return'); act(g, 'worker');
    expect(g.has('finished')).toBe(true); expect(g.sessionState.economy.coin).toBe(initial.economy.coin + 8);
    expect(g.sessionState.learning).toEqual(initial.learning); expect(g.sessionState.capabilities).toEqual(initial.capabilities);
    const completed = g.toSave(); g = ForestEpisode.restore(completed);
    g.interact('worker'); expect(g.toSave()).toEqual(completed);
    expect(g.sessionState.checkpoint.id).toBe('forest.episode.lodging');
  }, 30000);
  it('supports plugging before the first cast without natural water faking completion or softlocking', () => {
    const g = ForestEpisode.restore(start); repair(g); act(g, 'pool'); act(g, 'plug'); wait(g, 600);
    expect(g.has('practiced')).toBe(false);
    act(g, 'pool', 'downhill');
    expect(g.interact('pool').text).toContain('MP −2');
    expect(g.has('practiced')).toBe(false); wait(g, 600);
    expect(g.has('practiced')).toBe(true); expect(() => ForestEpisode.restore(g.toSave())).not.toThrow();
  }, 30000);
  it('can exhaust MP on failed attempts, rest and finish without losing artifacts or raising capacity', () => {
    const g = ForestEpisode.restore(start); repair(g); act(g, 'pool'); wait(g, 600); g.interact('pool', 'downhill');
    for (let attempt = 0; attempt < 6; attempt++) { expect(g.interact('pool').text).toContain('MP −2'); wait(g, 600); }
    expect(g.sessionState.mp.currentMp).toBe(0);
    const before = g.toSave(); expect(g.interact('pool').text).toContain('MP 不足'); expect(g.toSave()).toEqual(before);
    act(g, 'rest'); expect(g.sessionState.mp).toMatchObject({ currentMp: 4, maxMp: 24 });
    act(g, 'plug'); act(g, 'pool'); wait(g, 600); expect(g.has('practiced')).toBe(true);
    expect(g.has('medium')).toBe(true); expect(() => ForestEpisode.restore(g.toSave())).not.toThrow();
  }, 30000);
  it('rejects corrupted and recomputed but contradictory physical saves', () => {
    const corrupt = structuredClone(start); corrupt.physical.player = { ...corrupt.physical.player, x: 800 };
    expect(() => ForestEpisode.restore(corrupt)).toThrow('校验');
    corrupt.physical.place = 'hermit';
    const { checksum: _checksum, ...body } = corrupt;
    corrupt.checksum = sha256Canonical(body as unknown as JsonValue);
    expect(() => ForestEpisode.restore(corrupt)).toThrow();
  });
});
