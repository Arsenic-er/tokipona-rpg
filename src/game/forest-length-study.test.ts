import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {lengthStudyReadyFixture} from '../../scripts/testing/forest-length-study-fixture';
import {cisternReadyFixture,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {wetlandReadyFixture} from '../../scripts/testing/forest-wetland-fixture';
import type {LengthWord} from '../world/forest-length-study';
import {sha256Canonical,type JsonValue} from '../canonical-json';
const dir='.codex-tmp/length-study';let ready:ForestEpisodeSave;
const cmd=(g:ForestEpisode,c:string)=>g.interact('room-echo',c);
const prepare=(g:ForestEpisode,w:LengthWord)=>{cmd(g,'length:select:'+w);return cmd(g,'length:attune');};
const predict=(g:ForestEpisode,w:LengthWord)=>cmd(g,'length:predict:telo '+w+':'+(w==='lili'?'short':'long'));
const cast=(g:ForestEpisode)=>{const p=g.previewLengthStudy()!;expect(p.canConfirm).toBe(true);return g.confirmLengthStudy(p.plan.planId);};
const resources=(g:ForestEpisode)=>({economy:g.sessionState.economy,capabilities:g.sessionState.capabilities,lives:g.sessionState.lifeCorpseLedger});
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
beforeAll(()=>{ready=lengthStudyReadyFixture().toSave();mkdirSync(dir,{recursive:true});},60000);
describe('optional modifier recall and actual water outcomes',()=>{
 it('waits for the default physical echo before offering word discovery',()=>{
  const g=cisternReadyFixture();act(g,'room-road');act(g,'room-echo');const before=g.toSave();
  expect(cmd(g,'length:select:lili').text).toContain('默认水段落稳');expect(g.toSave()).toEqual(before);
  tick(g,200);expect(cmd(g,'length:select:lili').text).toContain('lili');expect(g.hasLength('lili','observed')).toBe(true);
 },60000);
 it('does not retrofit old tools or echo into learning, and rejects remote interaction',()=>{
  const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);const before=g.toSave();
  cmd(g,'length:open');cmd(g,'length:attune');expect(g.toSave()).toEqual(before);
  tick(g,200);expect(g.state.lengthStudy).toBeUndefined();expect(g.sessionState.learning).toEqual(before.session.state.learning);
  act(g,'return');expect(cmd(g,'length:select:lili').accepted).toBe(false);
 });
 it('requires hidden whole-expression recall and an outcome prediction, retaining harmless mistakes',()=>{
  const g=ForestEpisode.restore(ready);const r=prepare(g,'lili');expect(r.choice).toBe('length-recall');expect(r.text).not.toContain('lili');
  const s=g.toSave();for(const c of ['length:predict:lili:short','length:predict:telo suli:short','length:predict:telo lili:power']){
   expect(cmd(g,c).choice).toBe('length-recall');expect(g.toSave()).toEqual(s);
  }
  expect(cmd(g,'length:hint').text).toContain('telo lili');expect(cmd(g,'length:recall').text).not.toContain('lili');
  predict(g,'lili');expect(g.sessionState.mp).toEqual(s.session.state.mp);expect(g.previewLengthStudy()?.canConfirm).toBe(true);
 });
 it('pays exactly once per confirmed cast, waits for water and preserves old world and other words',()=>{
  let g=ForestEpisode.restore(ready);const before=g.toSave(),unchanged=resources(g);
  for(const w of ['lili','suli'] as const){
   prepare(g,w);predict(g,w);if(w==='suli'){
    expect(g.previewLengthStudy()?.canConfirm).toBe(false);const s=g.toSave();
    expect(g.confirmLengthStudy(g.previewLengthStudy()!.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(s);cmd(g,'length:brace');
   }
   expect(g.confirmLengthStudy('stale').accepted).toBe(false);
   expect(cast(g).resumeWorld).toBe(true);const paid=g.sessionState.mp.currentMp;
   expect(g.confirmLengthStudy('stale').accepted).toBe(false);expect(g.sessionState.mp.currentMp).toBe(paid);
   expect(g.hasLength(w,'completed')).toBe(false);tick(g,5);const mid=g.toSave();
   writeFileSync(dir+'/partial-'+w+'.json',JSON.stringify(mid));g=ForestEpisode.restore(mid);expect(g.toSave()).toEqual(mid);
   tick(g,200);expect(g.hasLength(w,'completed')).toBe(true);expect(resources(g)).toEqual(unchanged);
   const e=g.sessionState.learning.words[w].evidence.filter(e=>e.eventType==='grounding_trial_resolved');
   expect(e).toHaveLength(1);expect(e[0]).toMatchObject({promptLevel:1,answerVisible:false,toolBypass:false,worldOutcomeContribution:true});
   expect(g.sessionState.learning.words[w].learningState).toBe('grounded');
   const done=g.toSave();cmd(g,'length:attune');predict(g,w);expect(g.toSave()).toEqual(done);
   expect(ForestEpisode.restore(done).toSave()).toEqual(done);
  }
  expect(g.sessionState.mp.currentMp).toBe(before.session.state.mp.currentMp-16);expect(g.sessionState.mp.maxMp).toBe(before.session.state.mp.maxMp);
  for(const w of ['telo','tawa','wawa'])expect(g.sessionState.learning.words[w]).toEqual(before.session.state.learning.words[w]);
  for(const k of ['window','calibration','siphon','echoAge','mill','practice'] as const)expect(g.state[k]).toEqual(before.physical[k]);
  expect(g.hasRoom('valve_filled')).toBe(false);expect(g.hasRoom('siphon_primed')).toBe(false);
  writeFileSync(dir+'/completed.json',JSON.stringify(g.toSave()));
 });
 it('retains an unaffordable long prediction through real travel and existing rest recovery',()=>{
  const g=lengthStudyReadyFixture(true,2);prepare(g,'lili');predict(g,'lili');cast(g);tick(g,200);
  prepare(g,'suli');cmd(g,'length:brace');predict(g,'suli');const before=g.toSave(),p=g.previewLengthStudy()!;
  expect(p.canConfirm).toBe(false);expect(p.reason).toContain('MP 不足');expect(g.confirmLengthStudy(p.plan.planId).accepted).toBe(false);
  expect(g.toSave()).toEqual(before);writeFileSync(dir+'/low-predicted.json',JSON.stringify(before));
  act(g,'return');act(g,'return');act(g,'return');act(g,'hermit-road');
  act(g,'rest');act(g,'rest');expect(g.sessionState.mp.currentMp).toBeGreaterThanOrEqual(10);
  act(g,'return');act(g,'mill-road');act(g,'cistern-road');act(g,'room-road');act(g,'room-echo');
  expect(g.hasLength('suli','predicted')).toBe(true);cast(g);tick(g,200);expect(g.hasLength('suli','completed')).toBe(true);
 },60000);
 it('keeps single-word capacity enforced, without overriding the tool path or granting a milestone',()=>{
  const g=lengthStudyReadyFixture(false);prepare(g,'lili');predict(g,'lili');const before=g.toSave(),p=g.previewLengthStudy()!;
  expect(p.canConfirm).toBe(false);expect(p.reason).toContain('两词');expect(g.confirmLengthStudy(p.plan.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
  act(g,'east-up');tick(g,360);act(g,'calibration');act(g,'calibration-tool');tick(g,200);
  expect(g.hasRoom('valve_filled')).toBe(true);expect(g.sessionState.mp).toEqual(before.session.state.mp);
  expect(g.hasLength('lili','completed')).toBe(false);
 },60000);
 it('freezes a hidden lesson and resumes exact water without resetting the old echo',()=>{
  let g=ForestEpisode.restore(ready);prepare(g,'suli');cmd(g,'length:brace');predict(g,'suli');cast(g);tick(g,3);
  const t=structuredClone(g.state.lengthStudy!.suli);cmd(g,'length:baseline');tick(g,180);expect(g.state.lengthStudy!.suli).toEqual(t);
  const save=g.toSave();g=ForestEpisode.restore(save);expect(g.toSave()).toEqual(save);
  cmd(g,'length:select:suli');tick(g,200);expect(g.hasLength('suli','completed')).toBe(true);expect(g.state.echoAge).toBe(180);
 });
 it('rejects missing water, forged arrival and invalid saved age or view',()=>{
  const g=ForestEpisode.restore(ready);prepare(g,'suli');cmd(g,'length:brace');predict(g,'suli');cast(g);tick(g,3);
  for(const mode of ['missing','arrival','age','phase'] as const){
   const s=g.toSave();if(mode==='missing')delete s.physical.lengthStudy!.suli;
   if(mode==='arrival')s.physical.lengthStudy!.suli!.age=180;if(mode==='age')s.physical.lengthStudy!.suli!.age=181;
   if(mode==='phase')s.physical.lengthStudy!.view='wrong' as any;
   expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
  }
 });
 it('coexists with all three prior studies and preserves the finished underground tool route',()=>{
  const g=wetlandReadyFixture(false);act(g,'flow-spout','force:observe');tick(g,240);
  g.interact('flow-spout','force:attune');g.interact('flow-spout','force:predict:wawa:more');tick(g,120);
  act(g,'return');act(g,'top-exit');act(g,'return');act(g,'hermit-road');act(g,'pool');
  for(const c of ['water:observe','water:attune','water:predict:telo:downhill','water:confirm'])g.interact('pool',c);tick(g,600);
  act(g,'rest');act(g,'rest');act(g,'rest');act(g,'hermit','telo');
  act(g,'return');act(g,'mill-road');act(g,'brace');g.interact('brace','motion:observe');tick(g,600);
  g.interact('brace','motion:attune');g.interact('brace','motion:predict:tawa:clockwise');tick(g,600);
  const words=structuredClone(g.sessionState.learning.words),wallet=structuredClone(g.sessionState.economy);
  act(g,'cistern-road');act(g,'room-road');act(g,'room-echo');tick(g,200);
  for(const w of ['lili','suli'] as const){prepare(g,w);if(w==='suli')cmd(g,'length:brace');predict(g,w);cast(g);tick(g,200);}
  for(const w of ['telo','wawa','tawa'])expect(g.sessionState.learning.words[w]).toEqual(words[w]);
  for(const w of ['telo','wawa','tawa','lili','suli'])expect(g.sessionState.learning.words[w].learningState).toBe('grounded');
  expect(g.sessionState.economy).toEqual(wallet);expect(g.hasRoom('return_open')).toBe(true);expect(g.hasFlow('restored')).toBe(true);
  expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());writeFileSync(dir+'/five-words.json',JSON.stringify(g.toSave()));
 },60000);
});
