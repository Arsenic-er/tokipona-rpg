import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {motionStudyReadyFixture} from '../../scripts/testing/forest-motion-study-fixture';
import {wetlandReadyFixture} from '../../scripts/testing/forest-wetland-fixture';
import {actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
const dir='.codex-tmp/motion-study';let ready:ForestEpisodeSave;
const cmd=(g:ForestEpisode,c:string)=>g.interact('brace',c);
const observe=(g:ForestEpisode)=>{cmd(g,'motion:observe');tick(g,600);expect(g.motionStudyStage).toBe('observed');};
const prepare=(g:ForestEpisode)=>{observe(g);cmd(g,'motion:attune');};
const predict=(g:ForestEpisode)=>cmd(g,'motion:predict:tawa:clockwise');
const resources=(g:ForestEpisode)=>({mp:g.sessionState.mp,economy:g.sessionState.economy,capabilities:g.sessionState.capabilities,lives:g.sessionState.lifeCorpseLedger});
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
beforeAll(()=>{ready=motionStudyReadyFixture().toSave();mkdirSync(dir,{recursive:true});},60000);
describe('optional tawa wheel study',()=>{
 it('keeps old tool routes and save payloads unchanged without opting in',()=>{
  const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);
  const before=g.toSave();cmd(g,'motion:open');cmd(g,'motion:attune');predict(g);expect(g.toSave()).toEqual(before);
  tick(g,600);expect(g.motionStudyStage).toBe('unvisited');expect(g.sessionState.learning.words.tawa).toEqual(before.session.state.learning.words.tawa);
 });
 it('discovers by observation but waits for hermit debrief before attunement',()=>{
  const g=motionStudyReadyFixture(false);observe(g);const s=g.toSave();expect(cmd(g,'motion:attune').text).toContain('隐士');
  expect(g.toSave()).toEqual(s);expect(g.sessionState.learning.words.tawa.attunementState).not.toBe('attuned');
 },60000);
 it('requires hidden-answer recall and context prediction, not repair or an answer button',()=>{
  const g=ForestEpisode.restore(ready);prepare(g);const s=g.toSave();
  expect(cmd(g,'motion:recall').text).not.toContain('tawa');
  for(const c of ['motion:predict:telo:clockwise','motion:predict:tawa:still','motion:predict:tawa:counterclockwise','motion:predict:tawa suli:clockwise']){
   const r=cmd(g,c);expect(r.choice).toBe('motion-recall');expect(r.text).not.toContain('tawa');expect(g.toSave()).toEqual(s);
  }
  expect(cmd(g,'motion:hint').text).toContain('tawa');expect(cmd(g,'motion:recall').text).not.toContain('tawa');
  expect(g.toSave()).toEqual(s);
 });
 it('grounds exactly once after new real movement and preserves resources and other words',()=>{
  let g=ForestEpisode.restore(ready);const unchanged=resources(g),words=structuredClone(g.sessionState.learning.words);
  prepare(g);expect(predict(g).resumeWorld).toBe(true);expect(g.hasMotion('completed')).toBe(false);
  tick(g,20);expect(g.hasMotion('completed')).toBe(false);const partial=g.toSave();
  writeFileSync(dir+'/partial.json',JSON.stringify(partial));g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
  tick(g,600);expect(g.motionStudyStage).toBe('completed');expect(resources(g)).toEqual(unchanged);
  const evidence=g.sessionState.learning.words.tawa.evidence.filter(e=>e.eventType==='grounding_trial_resolved');
  expect(evidence).toHaveLength(1);expect(evidence[0]).toMatchObject({eventId:'infrastructure.tawa.grounding.episode.motion.grounding',taskFamilyId:'infrastructure_flow',promptLevel:1,answerVisible:false,toolBypass:false,worldOutcomeContribution:true});
  expect(g.sessionState.learning.words.tawa.learningState).toBe('grounded');
  for(const w of ['telo','wawa','lili','suli'])expect(g.sessionState.learning.words[w]).toEqual(words[w]);
  const done=g.toSave();for(const c of ['motion:observe','motion:attune','motion:predict:tawa:clockwise'])cmd(g,c);
  expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
  writeFileSync(dir+'/completed.json',JSON.stringify(done));
 });
 it('requires open gate, proximity and the active scene; resumes without resetting progress',()=>{
  let g=ForestEpisode.restore(ready);act(g,'gate');act(g,'brace');cmd(g,'motion:observe');tick(g,600);
  expect(g.state.motionStudy?.eligibleTicks).toBe(0);act(g,'gate');act(g,'brace');tick(g,600);
  expect(g.hasMotion('observed')).toBe(true);cmd(g,'motion:attune');predict(g);act(g,'gate');
  const far=structuredClone(g.state.motionStudy);tick(g,300);expect(g.state.motionStudy).toEqual(far);
  act(g,'brace');const closed=structuredClone(g.state.motionStudy);tick(g,300);expect(g.state.motionStudy).toEqual(closed);
  act(g,'return');const away=structuredClone(g.state.motionStudy);tick(g,300);expect(g.state.motionStudy).toEqual(away);
  const save=g.toSave();g=ForestEpisode.restore(save);expect(g.toSave()).toEqual(save);
  act(g,'mill-road');act(g,'gate');act(g,'brace');tick(g,600);expect(g.hasMotion('completed')).toBe(true);
 });
 it('rejects missing, out-of-phase and forged completed physical observations',()=>{
  const g=ForestEpisode.restore(ready);prepare(g);predict(g);tick(g,10);
  for(const mode of ['missing','phase','progress'] as const){
   const s=g.toSave();if(mode==='missing')delete s.physical.motionStudy;
   if(mode==='phase')s.physical.motionStudy!.phase='observe';
   if(mode==='progress')Object.assign(s.physical.motionStudy!,{eligibleTicks:90,turn:Math.PI/2});
   expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
  }
 });
 it('coexists with earned wawa and telo, leaving lili/suli and capacity untouched',()=>{
  const g=wetlandReadyFixture(false);act(g,'flow-spout','force:observe');tick(g,240);
  g.interact('flow-spout','force:attune');g.interact('flow-spout','force:predict:wawa:more');tick(g,120);
  act(g,'return');act(g,'top-exit');act(g,'return');act(g,'hermit-road');act(g,'pool');
  for(const c of ['water:observe','water:attune','water:predict:telo:downhill','water:confirm'])g.interact('pool',c);
  tick(g,600);expect(g.hasWaterStudy('completed')).toBe(true);expect(g.hasForce('completed')).toBe(true);
  const words=structuredClone(g.sessionState.learning.words),before=resources(g);
  act(g,'return');act(g,'mill-road');act(g,'brace');prepare(g);predict(g);tick(g,600);
  expect(g.hasMotion('completed')).toBe(true);for(const w of ['wawa','telo','lili','suli'])expect(g.sessionState.learning.words[w]).toEqual(words[w]);
  expect(resources(g)).toEqual(before);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  writeFileSync(dir+'/coexist.json',JSON.stringify(g.toSave()));
 },60000);
});
