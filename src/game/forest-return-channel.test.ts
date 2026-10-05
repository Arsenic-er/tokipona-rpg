import {beforeAll,describe,it,expect} from 'vitest';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave;
beforeAll(()=>{
  const g=cisternReadyFixture(false);act(g,'room-road');act(g,'east-up');tick(g,360);
  act(g,'calibration');act(g,'calibration-tool');tick(g,200);act(g,'west-up');tick(g,360);
  act(g,'upper-survey');act(g,'siphon-tool');tick(g,200);act(g,'lift-up');tick(g,360);act(g,'return-winch');
  ready=g.toSave();
},60000);
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
const repair=(g:ForestEpisode)=>{act(g,'flow-inspect');act(g,'flow-gate');act(g,'flow-seal');act(g,'flow-clear');tick(g,1800);};
const unchanged=(g:ForestEpisode,before:ForestEpisodeSave['session']['state'])=>{
  for(const key of ['mp','learning','economy','capabilities'] as const)expect(g.sessionState[key]).toEqual(before[key]);
  for(const flag of ['prologue_return_observed','first_attack_signature_available'])expect(g.sessionState.world.flags['global:'+flag]?.value).not.toBe(true);
};
describe('embedded return channel preserves canonical boundaries',()=>{
  it('keeps old top saves exact and cannot activate distant or hidden interactions',()=>{
    const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);expect(g.state.returnFlow).toBeUndefined();
    expect(g.interact('return-channel-road').accepted).toBe(false);expect(g.interact('flow-clear').accepted).toBe(false);
  });
  it('enters through the canonical coordinator, restores partial repairs, then commits actual world flow',()=>{
    let g=ForestEpisode.restore(ready);const before=g.sessionState;
    act(g,'return-channel-road');expect(g.state.place).toBe('return-channel');expect(g.hasFlow('restored')).toBe(false);
    act(g,'flow-gate');expect(g.hasFlow('gate')).toBe(false);
    act(g,'flow-inspect');act(g,'flow-gate');tick(g,300);act(g,'flow-gauge');expect(g.hasFlow('observed')).toBe(false);
    const partial=g.toSave();g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
    act(g,'flow-seal');act(g,'flow-clear');tick(g,1800);
    expect(g.hasFlow('restored')).toBe(true);expect(g.sessionState.quests.ch01_return_flow?.stageId).toBe('completed');
    expect(g.sessionState.world.flags['region:valley_prologue:wet_meadow_restored']?.value).toBe(true);
    expect(g.hasFlow('observed')).toBe(false);act(g,'flow-gauge');expect(g.hasFlow('observed')).toBe(true);
    const once=g.toSave();g.interact('flow-gauge');expect(g.toSave()).toEqual(once);
    unchanged(g,before);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },30000);
  it('lets one-word tool-only players backtrack and revisit without water, MP or reward duplication',()=>{
    const g=ForestEpisode.restore(ready),before=g.sessionState;expect(before.capabilities.expressionCapacityWords).toBe(1);
    act(g,'return-channel-road');repair(g);act(g,'flow-depth');expect(g.state.place).toBe('wetland');
    act(g,'return');expect(g.state.place).toBe('return-channel');
    act(g,'return');const water=structuredClone(g.state.returnFlow);act(g,'top-exit');act(g,'return');act(g,'worker');
    expect(g.state.returnFlow).toEqual(water);expect(g.hasRoom('reported')).toBe(true);
    act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');
    expect(g.state.returnFlow).toEqual(water);expect(g.hasFlow('restored')).toBe(true);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());unchanged(g,before);
  },30000);
  it('rejects a duplicated supply or state without entry evidence',()=>{
    const g=ForestEpisode.restore(ready);act(g,'return-channel-road');tick(g,20);
    const bad=g.toSave();bad.physical.returnFlow!.spilled++;expect(()=>ForestEpisode.restore(rehash(bad))).toThrow();
    const missing=g.toSave();delete missing.physical.returnFlow;expect(()=>ForestEpisode.restore(rehash(missing))).toThrow();
  });
});
