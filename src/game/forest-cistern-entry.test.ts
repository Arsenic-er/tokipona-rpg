import { beforeAll, describe, expect, it } from 'vitest';
import { ForestEpisode, EPISODE_TARGETS, episodeCollides, episodeGround, type EpisodeTarget, type ForestEpisodeSave } from './forest-episode';
import { completedOpeningFixture } from '../../scripts/testing/forest-episode-fixture';
import { cisternEntryFloor, cisternEntryCeiling, cisternEntrySolid, CISTERN_ENTRY_GATE } from '../world/forest-cistern-entry';
import { sha256Canonical, type JsonValue } from '../canonical-json';
import { ForestCartography, MAP_UNKNOWN } from '../world/forest-cartography';

let finished: ForestEpisodeSave, fresh: ForestEpisodeSave;
const wait = (g: ForestEpisode, n = 600) => { for (let i = 0; i < n; i++) g.advance(); };
function approach(g: ForestEpisode, id: EpisodeTarget): void {
  const target = EPISODE_TARGETS[g.state.place].find(t => t.id === id)!;
  for (let i = 0; i < 1500; i++) {
    const dx = target.x - g.state.player.x - 6;
    if (Math.abs(dx) < 3) { wait(g, 25); expect(g.nearest()?.id).toBe(id); return; }
    g.advance({ moveX: Math.abs(dx) < 20 ? Math.sign(dx) * .25 : Math.sign(dx), jump: false });
  }
  throw Error('Unreachable target: ' + id);
}
const act = (g: ForestEpisode, id: EpisodeTarget, choice?: string) => { approach(g, id); return g.interact(id, choice); };
function enter(g: ForestEpisode): void { act(g, 'mill-road'); act(g, 'cistern-road'); expect(g.state.place).toBe('cistern-entry'); }
function rehash(save: ForestEpisodeSave): ForestEpisodeSave {
  const {checksum: _, ...body} = save;
  return {...body, checksum: sha256Canonical(body as unknown as JsonValue)};
}
beforeAll(() => {
  const g = ForestEpisode.begin(completedOpeningFixture()); fresh = g.toSave();
  act(g, 'worker', 'accept'); act(g, 'mill-road'); act(g, 'timber'); act(g, 'brace'); act(g, 'silt'); act(g, 'gate'); wait(g, 900);
  act(g, 'medium'); act(g, 'return'); act(g, 'worker'); act(g, 'hermit-road'); act(g, 'hermit');
  act(g, 'pool'); act(g, 'plug'); wait(g); act(g, 'pool', 'downhill'); act(g, 'pool'); wait(g);
  act(g, 'hermit'); act(g, 'return'); act(g, 'worker'); expect(g.has('finished')).toBe(true);
  finished = g.toSave();
}, 30000);

describe('underground maintenance entrance', () => {
  it('requires the existing chapter handoff and rejects remote interaction without changing progress', () => {
    const g = ForestEpisode.restore(fresh); act(g, 'mill-road'); approach(g, 'cistern-road');
    const before = g.toSave();
    expect(g.interact('cistern-road').text).toContain('暂未交接'); expect(g.toSave()).toEqual(before);
    expect(g.interact('entry-winch').accepted).toBe(false); expect(g.toSave()).toEqual(before);
  });
  it('uses the exact same roof, floor and gate for collision and map occlusion', () => {
    for (const open of [false, true]) for (let x = 0; x < 1024; x += 7) for (let y = 0; y < 480; y += 7)
      expect(episodeCollides('cistern-entry', {x,y,width:1,height:1}, undefined, open)).toBe(cisternEntrySolid(x,y,open));
    for (let x = 1; x < 1024; x++) {
      expect(Math.abs(cisternEntryFloor(x) - cisternEntryFloor(x - 1))).toBeLessThanOrEqual(1);
      expect(cisternEntryFloor(x) - cisternEntryCeiling(x)).toBeGreaterThanOrEqual(100);
    }
    const map = new ForestCartography();
    map.observe('cistern-entry', {x:550,y:330}, (x,y) => cisternEntrySolid(x,y,false) ? 4 : 0);
    expect(map.at('cistern-entry',584,328)).toBe(4);
    expect(map.at('cistern-entry',632,328)).toBe(MAP_UNKNOWN);
    const before = map.toSave(); expect(ForestCartography.restore(before).toSave()).toEqual(before);
    map.observe('cistern-entry', {x:630,y:330}, (x,y) => cisternEntrySolid(x,y,true) ? 4 : 0, true);
    expect(map.at('cistern-entry',632,328)).toBe(0);
    expect(map.at('cistern-entry',904,328)).toBe(MAP_UNKNOWN);
  });
  it.each([undefined, 'woodland-v2', 'mill-valley-v1', 'forest-clearing-v1'] as const)('preserves %s saves and lets the completed story enter and return without terrain migration', profile => {
    const old = structuredClone(finished);
    if (profile === undefined) delete old.physical.terrainProfile; else old.physical.terrainProfile = profile;
    if (profile === undefined || profile === 'woodland-v2') delete old.physical.tailrace;
    const x = old.physical.player.x;
    old.physical.player = {...old.physical.player, y:Math.min(...Array.from({length:12},(_,i)=>episodeGround('settlement',x+i,profile)))-14};
    const canonical = rehash(old), g = ForestEpisode.restore(canonical);
    expect(g.toSave()).toEqual(canonical); enter(g); expect(g.terrainProfile).toBe(profile);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    act(g,'return'); expect(g.state.place).toBe('mill'); expect(g.state.player.x).toBe(950);
    expect(g.terrainProfile).toBe(profile); expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  }, 30000);
  it('physically blocks the closed grate, opens through normal tools, freezes off-scene water and awards nothing', () => {
    let g = ForestEpisode.restore(finished); const resources = structuredClone(g.sessionState);
    enter(g); const mill = structuredClone(g.state.mill), tailrace = structuredClone(g.state.tailrace);
    act(g,'entry-winch'); expect(g.has('entry_open')).toBe(false);
    for (let i = 0; i < 900; i++) {
      g.advance({moveX:1,jump:i%50===0});
      expect(g.state.player.x + 12).toBeLessThanOrEqual(CISTERN_ENTRY_GATE.left);
      expect(episodeCollides('cistern-entry',{...g.state.player,width:12,height:14},g.terrainProfile,false)).toBe(false);
    }
    expect(g.state.mill).toEqual(mill); expect(g.state.tailrace).toEqual(tailrace);
    const closed = g.toSave(); expect(ForestEpisode.restore(closed).toSave()).toEqual(closed);
    const warped = structuredClone(closed); warped.physical.player = {...warped.physical.player,x:890,y:360};
    expect(() => ForestEpisode.restore(rehash(warped))).toThrow('隔栅');
    act(g,'entry-survey'); act(g,'entry-winch');
    expect(g.has('entry_open')).toBe(true);
    const opened = g.toSave(); g.interact('entry-winch'); expect(g.toSave()).toEqual(opened);
    g = ForestEpisode.restore(opened); act(g,'entry-seal'); expect(g.has('entry_surveyed')).toBe(true);
    const surveyed = g.toSave(); g.interact('entry-seal'); expect(g.toSave()).toEqual(surveyed);
    expect(ForestEpisode.restore(surveyed).toSave()).toEqual(surveyed);
    expect(g.sessionState.world.currentSceneId).toBe('scene.valley.high_cistern');
    for (const k of ['mp','economy','learning','capabilities'] as const) expect(g.sessionState[k]).toEqual(resources[k]);
    act(g,'return'); expect(g.state.place).toBe('mill'); act(g,'return'); act(g,'worker');
    expect(g.sessionState.economy).toEqual(resources.economy);
    enter(g); expect(g.has('entry_open')).toBe(true); act(g,'entry-seal');
  }, 30000);
});

describe('integrated precision window and optional phrase calibration',()=>{
  function reachWindow(g:ForestEpisode):void {
    enter(g); act(g,'entry-survey'); act(g,'entry-winch'); act(g,'entry-seal'); act(g,'window');
  }
  function calibrate(g:ForestEpisode):void {
    act(g,'hermit-road'); act(g,'rest'); act(g,'hermit','telo'); act(g,'return');
  }
  it('does not grant phrase capacity on arrival, observation, rest alone, or a wrong answer',()=>{
    const g=ForestEpisode.restore(finished); const before=structuredClone(g.sessionState);
    act(g,'hermit-road'); expect(act(g,'hermit','calibrate').text).toContain('坐垫');
    expect(g.sessionState.capabilities).toEqual(before.capabilities);
    act(g,'rest'); const rested=g.toSave(),mp=g.sessionState.mp.currentMp;
    expect(act(g,'hermit','kiwen').choice).toBe('recall');
    expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(g.sessionState.mp.currentMp).toBe(mp);
    act(g,'hermit','  TELO  ');
    expect(g.sessionState.capabilities.expressionCapacityWords).toBe(2);expect(g.sessionState.mp.maxMp).toBe(26);
    expect(g.sessionState.mp.currentMp).toBe(mp);expect(g.sessionState.learning).toEqual(before.learning);
    const once=g.toSave(); g.interact('hermit','telo');expect(g.toSave()).toEqual(once);
    expect(ForestEpisode.restore(once).toSave()).toEqual(once);
    expect(rested.session.state.capabilities.expressionCapacityWords).toBe(1);
  },30000);
  it('offers a no-MP finite-water bypass to the original one-word save, with no language/capacity reward',()=>{
    const g=ForestEpisode.restore(finished),resources=structuredClone(g.sessionState);
    reachWindow(g);
    const before=g.toSave(),p=g.previewWindow('telo lili')!;
    expect(p.canConfirm).toBe(false);expect(p.reason).toContain('单词');
    expect(g.confirmWindow('telo lili',p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
    act(g,'window-bypass');expect(g.has('window_filled')).toBe(false);
    const source=g.toSave();g.interact('window-bypass');expect(g.toSave()).toEqual(source);
    wait(g,7);const mid=g.toSave();expect(ForestEpisode.restore(mid).toSave()).toEqual(mid);
    wait(g,200);expect(g.has('window_filled')).toBe(true);
    for(const k of ['mp','economy','learning','capabilities'] as const)expect(g.sessionState[k]).toEqual(resources[k]);
    const save=g.toSave();expect(ForestEpisode.restore(save).toSave()).toEqual(save);
    expect(act(g,'entry-seal').text).toContain('检修盖');
    act(g,'return');const water=structuredClone(g.state.window);wait(g,120);expect(g.state.window).toEqual(water);
    const corrupt=structuredClone(save);corrupt.physical.window!.source='cast';
    expect(()=>ForestEpisode.restore(rehash(corrupt))).toThrow();
  },30000);
  it('requires preview, physical proximity and capacity, charges once, fills by physics and restores mid-flight',()=>{
    let g=ForestEpisode.restore(finished);calibrate(g);reachWindow(g);
    const mp=g.sessionState.mp.currentMp,cap=structuredClone(g.sessionState.capabilities),learning=structuredClone(g.sessionState.learning);
    for(const word of ['telo','telo suli'] as const){
      const before=g.toSave(),p=g.previewWindow(word)!;expect(p.canConfirm).toBe(false);
      expect(g.confirmWindow(word,p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
    }
    const p=g.previewWindow('telo lili')!;expect(p.canConfirm).toBe(true);
    expect(g.confirmWindow('telo lili','stale').accepted).toBe(false);expect(g.sessionState.mp.currentMp).toBe(mp);
    expect(g.confirmWindow('telo lili',p.plan.planId).accepted).toBe(true);expect(g.sessionState.mp.currentMp).toBe(mp-6);
    expect(g.has('window_filled')).toBe(false);const once=g.toSave();
    expect(g.confirmWindow('telo lili',p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(once);
    wait(g,5);const mid=g.toSave();g=ForestEpisode.restore(mid);expect(g.toSave()).toEqual(mid);
    wait(g,200);expect(g.has('window_filled')).toBe(true);
    expect(g.sessionState.capabilities).toEqual(cap);expect(g.sessionState.learning).toEqual(learning);
    const final=g.toSave();expect(ForestEpisode.restore(final).toSave()).toEqual(final);
    expect(g.confirmWindow('telo lili',p.plan.planId).accepted).toBe(false);
  },30000);
});
