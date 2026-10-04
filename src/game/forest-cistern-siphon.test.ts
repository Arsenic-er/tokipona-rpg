import {beforeAll,describe,it,expect} from 'vitest';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {Material} from '../sim/materials';
let upper:ForestEpisodeSave,oneWord:ForestEpisodeSave;
function ascend(g:ForestEpisode,calibrationCast=false){
  act(g,'room-road');act(g,'east-up');tick(g,360);act(g,'calibration');
  if(calibrationCast){const p=g.previewCalibration('telo')!;g.confirmCalibration('telo',p.plan.planId);}
  else act(g,'calibration-tool');tick(g,200);
  act(g,'west-up');tick(g,360);act(g,'upper-survey');return g;
}
beforeAll(()=>{upper=ascend(cisternReadyFixture()).toSave();oneWord=ascend(cisternReadyFixture(false)).toSave();},60000);
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...body}=s;return{...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
const cast=(g:ForestEpisode,w:'telo'|'telo lili'|'telo suli')=>{
  const p=g.previewSiphon(w)!;expect(p.canConfirm).toBe(true);expect(g.confirmSiphon(w,p.plan.planId).accepted).toBe(true);
};
describe('high siphon chapter integration',()=>{
  it.each(['siphon-left','siphon-right'] as const)('requires either support, keeps failed water and persists success via %s',rib=>{
    let g=ForestEpisode.restore(upper);expect(g.toSave()).toEqual(upper);
    const before=structuredClone(g.sessionState);act(g,'siphon');
    const p=g.previewSiphon('telo suli')!,untouched=g.toSave();
    expect(p.canConfirm).toBe(false);expect(p.reason).toContain('0.65');
    expect(g.confirmSiphon('telo suli',p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(untouched);
    cast(g,'telo');tick(g,180);expect(g.siphonCollected).toBe(0);expect(g.hasRoom('siphon_primed')).toBe(false);
    expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-5);
    act(g,rib);const once=g.toSave();g.interact(rib);expect(g.toSave()).toEqual(once);
    act(g,'siphon');const valid=g.previewSiphon('telo suli')!;
    expect(g.confirmSiphon('telo suli','stale').accepted).toBe(false);expect(g.previewSiphon('telo suli')!.plan.planId).toBe(valid.plan.planId);
    cast(g,'telo suli');expect(g.hasRoom('siphon_primed')).toBe(false);expect(g.siphonReleased).toBe(true);
    tick(g,7);const mid=g.toSave(),other=ForestEpisode.restore(mid);expect(other.toSave()).toEqual(mid);
    tick(g,200);tick(other,200);expect(other.toSave()).toEqual(g.toSave());g=other;
    expect(g.hasRoom('siphon_primed')).toBe(true);expect(g.siphonCollected).toBeGreaterThanOrEqual(96);
    expect(g.siphonCells.filter(c=>c===Material.Water)).toHaveLength(480);
    expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-15);
    expect(g.confirmSiphon('telo suli',valid.plan.planId).accepted).toBe(false);
    act(g,'siphon-tool');expect(g.hasRoom('siphon_tool')).toBe(false);
    const mp=structuredClone(g.sessionState.mp);act(g,'west-down');tick(g,360);act(g,'east-down');tick(g,360);act(g,'return');
    const age=g.state.siphon!.age,cells=[...g.siphonCells];tick(g,300);expect(g.state.siphon!.age).toBe(age);expect(g.siphonCells).toEqual(cells);
    act(g,'room-road');expect(g.sessionState.mp).toEqual(mp);expect(g.hasRoom('siphon_primed')).toBe(true);
    for(const k of ['economy','capabilities','learning'] as const)expect(g.sessionState[k]).toEqual(before[k]);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },30000);
  it('preserves the one-word tool route with no MP, support or learning requirement',()=>{
    let g=ForestEpisode.restore(oneWord);const before=structuredClone(g.sessionState);act(g,'siphon');
    expect(g.previewSiphon('telo suli')!.canConfirm).toBe(false);
    act(g,'siphon-tool');tick(g,9);const mid=g.toSave();g=ForestEpisode.restore(mid);expect(g.toSave()).toEqual(mid);
    tick(g,200);expect(g.siphonSupported).toBe(false);expect(g.hasRoom('siphon_primed')).toBe(true);
    expect(g.siphonCells.filter(c=>c===Material.Water)).toHaveLength(192);
    const once=g.toSave();g.interact('siphon-tool');expect(g.toSave()).toEqual(once);
    for(const k of ['mp','economy','capabilities','learning'] as const)expect(g.sessionState[k]).toEqual(before[k]);
  });
  it('low MP and two legal distance failures retain a no-charge escape route',()=>{
    const g=ForestEpisode.restore(upper);act(g,'siphon-right');act(g,'siphon');
    cast(g,'telo lili');tick(g,180);cast(g,'telo');tick(g,180);
    expect(g.hasRoom('siphon_primed')).toBe(false);
    const result=g.interact('siphon');expect(result.choice).toBeUndefined();expect(result.text).toContain('手动导水柄');
    const mp=structuredClone(g.sessionState.mp);expect(mp.currentMp).toBeLessThan(10);
    act(g,'siphon-tool');tick(g,200);expect(g.hasRoom('siphon_primed')).toBe(true);expect(g.sessionState.mp).toEqual(mp);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  });
  it('rejects a long cast when current MP is insufficient, without silently shortening',()=>{
    const g=ascend(cisternReadyFixture(),true);act(g,'siphon-right');act(g,'siphon');cast(g,'telo lili');tick(g,180);
    const p=g.previewSiphon('telo suli')!,before=g.toSave();expect(g.sessionState.mp.currentMp).toBeLessThan(10);
    expect(p.canConfirm).toBe(false);expect(p.reason).toContain('MP 不足');
    expect(p.plan.activationMpRequired).toBe(10);expect(p.plan.requestedLengthClass).toBe('long');
    expect(g.confirmSiphon('telo suli',p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
    act(g,'siphon-tool');tick(g,200);expect(g.hasRoom('siphon_primed')).toBe(true);
    expect(g.sessionState.mp).toEqual(before.session.state.mp);
  },30000);
  it('rejects physically forged water, support and expression histories',()=>{
    const g=ForestEpisode.restore(upper);act(g,'siphon-left');act(g,'siphon');cast(g,'telo suli');tick(g,180);
    for(const mutate of [
      (s:ForestEpisodeSave)=>{delete s.physical.siphon;},
      (s:ForestEpisodeSave)=>{s.physical.siphon!.events[0]!.braced=false;},
      (s:ForestEpisodeSave)=>{s.physical.siphon!.events[0]!.expression='telo';},
      (s:ForestEpisodeSave)=>{s.physical.siphon!.age=0;},
    ]){const bad=g.toSave();mutate(bad);expect(()=>ForestEpisode.restore(rehash(bad))).toThrow();}
  });
});
