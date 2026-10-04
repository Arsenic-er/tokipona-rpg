import {beforeAll,describe,it,expect} from 'vitest';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave;
beforeAll(()=>{
  const g=cisternReadyFixture(false);
  act(g,'room-road');act(g,'east-up');tick(g,360);act(g,'calibration');act(g,'calibration-tool');tick(g,200);
  act(g,'west-up');tick(g,360);act(g,'upper-survey');act(g,'siphon-tool');tick(g,200);ready=g.toSave();
},60000);
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
const ride=(g:ForestEpisode,id:'lift-up'|'lift-down')=>{act(g,id);expect(g.ridingLift).toBe(true);tick(g,360);expect(g.state.lift?.mode).toBe('idle');};
describe('chapter lift, top exit and permanent return route',()=>{
  it('preserves old primed saves exactly and does not create a lift until used',()=>{
    const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);expect(g.state.lift).toBeUndefined();
    expect(g.hasRoom('lift_open')).toBe(false);expect(g.roomSolidAt(420,130)).toBe(true);
  });
  it('restores boarding, riding and leaving without changing resources or resetting the checkpoint twice',()=>{
    let g=ForestEpisode.restore(ready);const before=structuredClone(g.sessionState);act(g,'lift-up');
    for(const n of [1,60,180]){
      tick(g,n);expect(g.ridingLift).toBe(true);const s=g.toSave(),r=ForestEpisode.restore(s);expect(r.toSave()).toEqual(s);
      tick(g,1);tick(r,1);expect(r.toSave()).toEqual(g.toSave());g=r;
    }
    tick(g,180);expect(g.hasRoom('lift_arrived')).toBe(true);expect(g.state.player.y).toBe(114);
    const checkpoint=structuredClone(g.sessionState.checkpoint);expect(checkpoint.id).toBe('forest.episode.cistern.top');
    ride(g,'lift-down');expect(g.state.player.y).toBe(338);ride(g,'lift-up');
    expect(g.sessionState.checkpoint).toEqual(checkpoint);
    for(const k of ['mp','learning','economy','capabilities'] as const)expect(g.sessionState[k]).toEqual(before[k]);
  });
  it('opens a reciprocal shortcut and reports to the worker without duplicating rewards or consuming the fragment',()=>{
    const g=ForestEpisode.restore(ready),before=structuredClone(g.sessionState);ride(g,'lift-up');
    expect(act(g,'top-exit').text).toContain('左边绞盘');expect(g.state.place).toBe('cistern');
    act(g,'return-winch');const once=g.toSave();g.interact('return-winch');expect(g.toSave()).toEqual(once);
    expect(g.sessionState.world.flags['global:valley.upper_channel']?.value).toBe('available');
    act(g,'top-exit');expect(g.state.place).toBe('mill');expect(g.targets.some(t=>t.id==='cistern-shortcut')).toBe(true);
    const mill=g.toSave();expect(ForestEpisode.restore(mill).toSave()).toEqual(mill);
    act(g,'cistern-shortcut');expect(g.state.place).toBe('cistern');expect(g.state.player.y).toBe(114);
    ride(g,'lift-down');ride(g,'lift-up');act(g,'top-exit');act(g,'return');act(g,'worker');
    expect(g.hasRoom('reported')).toBe(true);const first=g.toSave();g.interact('worker');expect(g.toSave()).toEqual(first);
    for(const k of ['mp','learning','economy','capabilities'] as const)expect(g.sessionState[k]).toEqual(before[k]);
    expect(g.sessionState.world.flags['global:owns.artifact.fragment.forest_site']?.value).toBe(true);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },30000);
  it('recalls an empty platform after the original ladders and persists the moving call',()=>{
    let g=ForestEpisode.restore(ready);ride(g,'lift-up');act(g,'return-winch');act(g,'top-exit');
    act(g,'cistern-road');act(g,'room-road');act(g,'east-up');tick(g,360);act(g,'west-up');tick(g,360);
    act(g,'lift-up');expect(g.state.lift?.mode).toBe('call');expect(g.ridingLift).toBe(false);
    tick(g,70);const s=g.toSave();expect(ForestEpisode.restore(s).toSave()).toEqual(s);g=ForestEpisode.restore(s);
    tick(g,240);expect(g.state.lift?.mode).toBe('idle');expect(g.state.lift?.y).toBe(352);
    ride(g,'lift-up');expect(g.state.player.y).toBe(114);
  },30000);
  it('rejects forged activation, passenger displacement, or shortcut world-state mismatches',()=>{
    const g=ForestEpisode.restore(ready);
    const unopened=g.toSave();unopened.physical.lift={version:1,y:352,to:'bottom',mode:'idle',blocked:false};
    expect(()=>ForestEpisode.restore(rehash(unopened))).toThrow();
    act(g,'lift-up');tick(g,90);const detached=g.toSave();detached.physical.player={...detached.physical.player,x:detached.physical.player.x-40};expect(()=>ForestEpisode.restore(rehash(detached))).toThrow();
    tick(g,300);act(g,'return-winch');const broken=g.toSave();
    const flags={...broken.session.state.world.flags};delete flags['global:valley.upper_channel'];
    broken.session={...broken.session,state:{...broken.session.state,world:{...broken.session.state.world,flags}}};
    expect(()=>ForestEpisode.restore(rehash(broken))).toThrow();
  });
});
