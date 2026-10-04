import {beforeAll,describe,it,expect} from 'vitest';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {Material} from '../sim/materials';
let ready:ForestEpisodeSave,oneWord:ForestEpisodeSave;
beforeAll(()=>{ready=cisternReadyFixture().toSave();oneWord=cisternReadyFixture(false).toSave();},60000);
const enter=(g:ForestEpisode)=>{act(g,'room-road');expect(g.state.place).toBe('cistern');};
const climb=(g:ForestEpisode,id:'east-up'|'east-down'|'west-up'|'west-down')=>{act(g,id);expect(g.state.climb?.route).toBe(id);tick(g,360);expect(g.state.climb).toBeUndefined();};
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...body}=s;return{...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
describe('cistern room in the real chapter save',()=>{
  it('keeps old saves exact and grants bounded entry recovery once, including after reload and return',()=>{
    let g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);
    const before=structuredClone(g.sessionState);enter(g);
    expect(g.sessionState.mp.maxMp).toBe(before.mp.maxMp);
    expect(g.sessionState.mp.currentMp).toBe(Math.max(before.mp.currentMp,Math.min(Math.floor(.8*before.mp.maxMp*2)/2,before.mp.currentMp+Math.round(Math.max(3,.15*before.mp.maxMp)*2)/2)));
    const mp=structuredClone(g.sessionState.mp),save=g.toSave();
    expect(ForestEpisode.restore(save).toSave()).toEqual(save);g=ForestEpisode.restore(save);
    act(g,'return');enter(g);expect(g.sessionState.mp).toEqual(mp);
    for(const k of ['economy','capabilities','learning'] as const)expect(g.sessionState[k]).toEqual(before[k]);
  });
  it('replays an isolated echo without charging or awarding learning and freezes it off-scene',()=>{
    const g=ForestEpisode.restore(ready);enter(g);const mp=structuredClone(g.sessionState.mp),learn=structuredClone(g.sessionState.learning);
    act(g,'room-echo');tick(g,7);const mid=g.toSave(),r=ForestEpisode.restore(mid);expect(r.toSave()).toEqual(mid);
    expect(r.echoCells).toEqual(g.echoCells);tick(g);tick(r);expect(r.echoCells).toEqual(g.echoCells);
    const once=g.state.echoAge;g.interact('room-echo');expect(g.state.echoAge).toBe(once);
    expect(g.sessionState.mp).toEqual(mp);expect(g.sessionState.learning).toEqual(learn);
    act(g,'return');const cells=[...g.echoCells],age=g.state.echoAge;tick(g);expect(g.echoCells).toEqual(cells);expect(g.state.echoAge).toBe(age);
  });
  it('restores mid-ladder, rejects blocked long casts, keeps a short failure, then opens and returns through a default cast',()=>{
    let g=ForestEpisode.restore(ready);enter(g);const learning=structuredClone(g.sessionState.learning),economy=structuredClone(g.sessionState.economy);
    act(g,'east-up');tick(g,95);expect(g.state.climb).toBeDefined();
    const mid=g.toSave(),r=ForestEpisode.restore(mid);expect(r.toSave()).toEqual(mid);
    tick(g,300);tick(r,300);expect(r.toSave()).toEqual(g.toSave());g=r;
    expect(g.state.player.y).toBe(530);expect(g.state.player.grounded).toBe(true);
    expect(act(g,'west-up').text).toContain('隔栅');expect(g.state.climb).toBeUndefined();
    act(g,'calibration');const mp=g.sessionState.mp.currentMp,before=g.toSave();
    const long=g.previewCalibration('telo suli')!;expect(long.canConfirm).toBe(false);
    expect(g.confirmCalibration('telo suli',long.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
    const short=g.previewCalibration('telo lili')!;expect(short.canConfirm).toBe(true);
    expect(g.confirmCalibration('telo lili','stale').accepted).toBe(false);
    expect(g.confirmCalibration('telo lili',short.plan.planId).accepted).toBe(true);
    expect(g.confirmCalibration('telo lili',short.plan.planId).accepted).toBe(false);
    tick(g,7);const falling=g.toSave();g=ForestEpisode.restore(falling);expect(g.toSave()).toEqual(falling);tick(g,200);
    expect(g.calibrationCollected).toBe(48);expect(g.hasRoom('valve_filled')).toBe(false);expect(g.sessionState.mp.currentMp).toBe(mp-6);
    const p=g.previewCalibration('telo')!;expect(p.canConfirm).toBe(true);expect(g.confirmCalibration('telo',p.plan.planId).accepted).toBe(true);
    tick(g,200);expect(g.hasRoom('valve_filled')).toBe(true);expect(g.sessionState.mp.currentMp).toBe(mp-11);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    climb(g,'west-up');expect(g.state.player.y).toBe(338);act(g,'upper-survey');expect(g.hasRoom('upper_seen')).toBe(true);
    climb(g,'west-down');climb(g,'east-down');expect(g.state.player.y).toBe(722);act(g,'return');
    expect(g.state.place).toBe('cistern-entry');expect(g.sessionState.learning).toEqual(learning);expect(g.sessionState.economy).toEqual(economy);
    const final=g.toSave();expect(ForestEpisode.restore(final).toSave()).toEqual(final);
  },30000);
  it('lets a one-word traveler finish with only finite tank water and no MP charge',()=>{
    const g=ForestEpisode.restore(oneWord);enter(g);climb(g,'east-up');
    const before=structuredClone(g.sessionState);act(g,'calibration');
    expect(g.previewCalibration('telo lili')?.canConfirm).toBe(false);
    act(g,'calibration-tool');tick(g,7);const mid=g.toSave();expect(ForestEpisode.restore(mid).toSave()).toEqual(mid);
    tick(g,200);expect(g.hasRoom('valve_filled')).toBe(true);expect(g.calibrationCollected).toBeGreaterThanOrEqual(77);
    expect(g.calibrationCells.filter(c=>c===Material.Water)).toHaveLength(96);
    const once=g.toSave();g.interact('calibration-tool');expect(g.toSave()).toEqual(once);
    for(const k of ['mp','economy','capabilities','learning'] as const)expect(g.sessionState[k]).toEqual(before[k]);
    climb(g,'west-up');act(g,'upper-survey');expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },30000);
  it('rejects physically inconsistent saved climbs, echoes, gates and water histories',()=>{
    const g=ForestEpisode.restore(ready);enter(g);
    for(const mutate of [
      (s:ForestEpisodeSave)=>{s.physical.climb={route:'west-up',leg:0};},
      (s:ForestEpisodeSave)=>{s.physical.echoAge=15;},
      (s:ForestEpisodeSave)=>{s.physical.player={...s.physical.player,y:338};},
      (s:ForestEpisodeSave)=>{s.physical.calibration={version:1,age:180,events:[{at:0,kind:'tool'}]};},
    ]){const s=structuredClone(g.toSave());mutate(s);expect(()=>ForestEpisode.restore(rehash(s))).toThrow();}
    climb(g,'east-up');act(g,'calibration');const p=g.previewCalibration('telo lili')!;g.confirmCalibration('telo lili',p.plan.planId);tick(g,180);
    const bad=g.toSave();bad.physical.calibration!.events[0]!.expression='telo';expect(()=>ForestEpisode.restore(rehash(bad))).toThrow();
  });
});
