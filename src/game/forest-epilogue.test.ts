import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {epilogueReadyFixture} from '../../scripts/testing/forest-epilogue-fixture';
import {siteLeadReadyFixture} from '../../scripts/testing/forest-site-lead-fixture';
import {actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {GameSession,replayGameSession} from '../session/game-session';
import {commitSessionProposal,proposeReturnObservation} from '../session/adapters';
import {PrologueReturnFlowSession} from './prologue-return-flow';
import {FOREST_EPILOGUE_FLAG,FOREST_RETURN_TRANSACTION} from './forest-epilogue-contract';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import type {AllocationMode} from '../world/forest-water-allocation';
const modes:AllocationMode[]=['settlement_priority','wetland_priority','road_trade_priority'],dir='.codex-tmp/epilogue';
let ready:Record<AllocationMode,ForestEpisodeSave>;
const resources=(g:ForestEpisode)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,g.sessionState[k as keyof typeof g.sessionState]]));
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
const region=(g:ForestEpisode,f:string)=>g.sessionState.world.flags['region:valley_prologue:'+f]?.value;
const seal=(g:ForestEpisode)=>{g.interact('node-exit','epilogue:review');g.interact('node-exit','epilogue:seal');};
beforeAll(()=>{mkdirSync(dir,{recursive:true});ready=Object.fromEntries(modes.map(m=>[m,epilogueReadyFixture(m).toSave()])) as typeof ready;},90000);
describe('explicit forest epilogue and protected return observation',()=>{
 it('does not seal without the recorded lead, review, actual proximity or explicit choice',()=>{
  const g=siteLeadReadyFixture();act(g,'node-exit');const s=g.toSave();
  for(const c of ['epilogue:review','epilogue:seal','epilogue:depart'])g.interact('node-exit',c);
  expect(g.toSave()).toEqual(s);
  const h=ForestEpisode.restore(ready.wetland_priority),before=h.toSave();
  for(const c of [undefined,'epilogue:seal','epilogue:depart','unknown'])h.interact('node-exit',c);
  expect(h.toSave()).toEqual(before);act(h,'return');
  expect(h.interact('node-exit','epilogue:seal').accepted).toBe(false);expect(h.epilogueSealed).toBe(false);
 },60000);
 it.each(modes)('%s seals once, returns explicitly and leaves resources and old routes intact',async mode=>{
  let g=ForestEpisode.restore(ready[mode]);const old=resources(g),physical=g.toSave().physical;
  g.interact('node-exit','epilogue:review');const reviewed=g.toSave();g=ForestEpisode.restore(reviewed);expect(g.toSave()).toEqual(reviewed);
  g.interact('node-exit','epilogue:review');expect(g.toSave()).toEqual(reviewed);
  g.interact('node-exit','epilogue:seal');expect(g.epilogueStage).toBe('sealed');expect(g.state).toEqual(physical);
  expect(region(g,FOREST_EPILOGUE_FLAG)).toBe(true);expect(g.sessionState.quests.ch01_underground_water_allocation.stageId).toBe('completed');
  expect(g.returnObserved).toBe(false);const sealed=g.toSave();g=ForestEpisode.restore(sealed);expect(g.toSave()).toEqual(sealed);
  g.interact('node-exit','epilogue:seal');expect(g.toSave()).toEqual(sealed);
  writeFileSync(dir+'/sealed-'+mode+'.json',JSON.stringify(sealed));g.interact('node-exit','epilogue:depart');
  expect(g.state.place).toBe('settlement');expect(g.returnObserved).toBe(false);expect(g.targets.some(t=>t.id==='archive-road')).toBe(true);
  act(g,'worker','epilogue:return');expect(g.returnObserved).toBe(false);
  g.interact('worker','lead:report');g.interact('worker','epilogue:recap');tick(g,30);expect(g.returnObserved).toBe(false);
  await g.confirmEpilogueReturn();expect(g.returnObserved).toBe(true);
  const done=g.toSave();for(const c of ['epilogue:return','epilogue:recap','lead:report',undefined])g.interact('worker',c);
  expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);expect(resources(g)).toEqual(old);
  expect(done.session.eventLedger.filter(e=>e.type==='prologue_return_observation_committed')).toHaveLength(1);
  for(const f of ['range_trial_permission','first_attack_signature_available','attack_capacity_calibration_complete'])expect(g.sessionState.world.flags['global:'+f]?.value).not.toBe(true);
  writeFileSync(dir+'/returned-'+mode+'.json',JSON.stringify(done));
  act(g,'archive-road');expect(g.state.place).toBe('order-node');act(g,'node-archive','lead:history');
  expect(g.interact('node-archive','lead:history').text).toContain('旱季');act(g,'node-exit','epilogue:depart');
  act(g,'hermit-road');act(g,'hermit','lead:interpret');expect(g.interact('hermit','calibrate').accepted).toBe(true);
  expect(resources(g)).toEqual(old);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 },60000);
 it('supports reporting before sealing and preserves an old lead save byte for byte',async()=>{
  const g=ForestEpisode.restore(ready.wetland_priority),old=g.toSave();expect(ForestEpisode.restore(old).toSave()).toEqual(old);
  // Earlier players may already have used the long route and discussed both records.
  act(g,'return');act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');act(g,'worker','lead:report');
  act(g,'hermit-road');act(g,'hermit','lead:interpret');act(g,'return');act(g,'worker','epilogue:return');expect(g.returnObserved).toBe(false);
  act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');act(g,'flow-depth');act(g,'node-road');act(g,'node-exit');
  seal(g);g.interact('node-exit','epilogue:depart');act(g,'worker');await g.confirmEpilogueReturn();expect(g.returnObserved).toBe(true);
  expect(g.hasLead('hermit')).toBe(true);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 },60000);
 it('keeps formal return behind the live coordinator, including duplicate and old direct-route guards',async()=>{
  const g=ForestEpisode.restore(ready.wetland_priority),before=GameSession.fromSave(g.toSave().session);
  expect((await PrologueReturnFlowSession.observeForestEpilogue(before,'early')).accepted).toBe(false);
  seal(g);g.interact('node-exit','epilogue:depart');
  expect((await PrologueReturnFlowSession.observeForestEpilogue(GameSession.fromSave(g.toSave().session),'before-report')).accepted).toBe(false);
  act(g,'worker','lead:report');const session=GameSession.fromSave(g.toSave().session),old=session.toSave();
  expect(commitSessionProposal(session,proposeReturnObservation(FOREST_RETURN_TRANSACTION)).committed).toBe(false);
  expect(session.toSave()).toEqual(old);
  const result=await PrologueReturnFlowSession.observeForestEpilogue(session,FOREST_RETURN_TRANSACTION);expect(result.accepted).toBe(true);
  const next=result.session!;expect(await PrologueReturnFlowSession.observeForestEpilogue(next,'different-id')).toMatchObject({accepted:true,duplicate:true});
  expect(next.toSave().eventLedger.filter(e=>e.type==='prologue_return_observation_committed')).toHaveLength(1);
 });
 it('rejects a stale asynchronous return after travel and makes concurrent confirmations idempotent',async()=>{
  const g=ForestEpisode.restore(ready.wetland_priority);seal(g);g.interact('node-exit','epilogue:depart');act(g,'worker','lead:report');
  const pending=g.confirmEpilogueReturn();act(g,'archive-road');const moved=g.toSave();
  expect((await pending).accepted).toBe(false);expect(g.toSave()).toEqual(moved);expect(g.returnObserved).toBe(false);
  g.interact('node-exit','epilogue:depart');act(g,'worker');
  const results=await Promise.all([g.confirmEpilogueReturn(),g.confirmEpilogueReturn()]);
  expect(results.filter(r=>r.accepted)).toHaveLength(1);expect(g.returnObserved).toBe(true);
  expect(g.toSave().session.eventLedger.filter(e=>e.type==='prologue_return_observation_committed')).toHaveLength(1);
  const done=g.toSave();expect((await g.confirmEpilogueReturn()).accepted).toBe(true);expect(g.toSave()).toEqual(done);
  expect(ForestEpisode.restore(done).toSave()).toEqual(done);
 });
 it('rejects replay-consistent forged sealing without review or at the wrong scene',()=>{
  for(const wrongScene of [false,true]){
   const g=ForestEpisode.restore(ready.wetland_priority);
   if(wrongScene){g.interact('node-exit','epilogue:review');act(g,'return');}
   const save=g.toSave(),session=GameSession.fromSave(save.session);
   const r=commitSessionProposal(session,{transactionId:'forged.seal',drafts:[
    {eventId:'episode.epilogue.sealed',type:'world_flag_set',payload:{flagId:'forest.episode.epilogue.sealed',value:true,scope:'global'}},
    {eventId:'episode.'+FOREST_EPILOGUE_FLAG,type:'world_flag_set',payload:{flagId:FOREST_EPILOGUE_FLAG,value:true,scope:'region',regionId:'valley_prologue'}},
    {eventId:'episode.epilogue.quest',type:'quest_stage_set',payload:{questId:'ch01_underground_water_allocation',stageId:'completed',stageOrdinal:save.session.state.quests.ch01_underground_water_allocation.stageOrdinal+1}},
    {eventId:'episode.receipt.epilogue.sealed',type:'receipt_recorded',payload:{receiptId:'forest.episode.epilogue.sealed',domain:'world',payloadHash:sha256Canonical({forged:true})}},
   ]});expect(r.committed).toBe(true);save.session=r.session.toSave();
   expect(()=>ForestEpisode.restore(rehash(save))).toThrow(/尾声/);
  }
 });
 it('rejects a protected-event replay with missing worker handoff, even with a valid session checksum',()=>{
  const g=ForestEpisode.restore(ready.wetland_priority);seal(g);g.interact('node-exit','epilogue:depart');const save=g.toSave(),s=save.session;
  const r=replayGameSession(s.sessionId,s.origin,[...s.eventLedger,{eventId:'session.return.observation.'+FOREST_RETURN_TRANSACTION,
   type:'prologue_return_observation_committed',sequence:s.eventLedger.length+1,
   payload:{transactionId:FOREST_RETURN_TRANSACTION,writerEvent:'return_observation_committed'}}]);
  expect(r.ok).toBe(true);if(!r.ok)throw Error('fixture replay failed');save.session=r.session.toSave();
  expect(()=>ForestEpisode.restore(rehash(save))).toThrow(/回访/);
 });
});
