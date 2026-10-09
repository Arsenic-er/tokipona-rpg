import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {allocationReadyFixture} from '../../scripts/testing/forest-allocation-fixture';
import {actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import type {AllocationMode} from '../world/forest-water-allocation';
import {GameSession} from '../session/game-session';
import {commitSessionProposal} from '../session/adapters';
import {sha256Canonical,type JsonValue} from '../canonical-json';
const dir='.codex-tmp/site-lead',modes:AllocationMode[]=['settlement_priority','wetland_priority','road_trade_priority'];
let synced:ForestEpisodeSave;
const command=(g:ForestEpisode,c?:string)=>g.interact('node-archive',c);
const resources=(g:ForestEpisode)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,g.sessionState[k as keyof typeof g.sessionState]]));
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
const ready=(mode:AllocationMode='wetland_priority')=>{
 const g=ForestEpisode.restore(synced);g.interact('node-allocation','allocation:preview:'+mode);g.interact('node-allocation','allocation:confirm:'+mode);tick(g,900);act(g,'node-archive');return g;
};
const record=(g:ForestEpisode)=>{command(g,'lead:inspect');command(g,'lead:record');};
const returnToVillage=(g:ForestEpisode)=>{act(g,'return');act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');};
beforeAll(()=>{synced=allocationReadyFixture().toSave();mkdirSync(dir,{recursive:true});},90000);
describe('earned forest-site directions and non-rewarding conversations',()=>{
 it('does not reveal before actual allocation, by just opening the archive, or remotely',()=>{
  const g=ForestEpisode.restore(synced);act(g,'node-archive');const old=g.toSave();
  command(g,'lead:inspect');command(g,'lead:record');expect(g.toSave()).toEqual(old);
  act(g,'node-allocation','allocation:preview:wetland_priority');g.interact('node-allocation','allocation:confirm:wetland_priority');tick(g,30);
  act(g,'node-archive');const routing=g.toSave();command(g,'lead:inspect');command(g,'lead:record');expect(g.toSave()).toEqual(routing);
  const h=ready(),before=h.toSave();command(h);command(h,'lead:record');command(h,'lead:unknown');expect(h.toSave()).toEqual(before);
  act(h,'return');expect(command(h,'lead:inspect').accepted).toBe(false);
 });
 it.each(modes)('%s records one lead only after inspection, retains history and restores both stages',mode=>{
  let g=ready(mode);const before=g.toSave(),old=resources(g);
  command(g,'lead:inspect');expect(g.leadStage).toBe('inspected');expect(g.hasLead('recorded')).toBe(false);
  const inspected=g.toSave();writeFileSync(dir+'/inspected-'+mode+'.json',JSON.stringify(inspected));g=ForestEpisode.restore(inspected);expect(g.toSave()).toEqual(inspected);
  expect(command(g,'lead:history').text).toContain('旱季');expect(g.toSave()).toEqual(inspected);
  command(g,'lead:record');expect(g.leadStage).toBe('recorded');expect(g.sessionState.world.flags['region:valley_prologue:forest_site_lead_revealed']?.value).toBe(true);
  expect(g.sessionState.quests.ch01_underground_water_allocation.stageId).toBe('site_lead_revealed');expect(resources(g)).toEqual(old);
  expect(g.state).toEqual(before.physical);expect(g.allocationMode).toBe(mode);
  const done=g.toSave();for(const c of ['lead:record','lead:inspect','lead:history',undefined])command(g,c);
  expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
  for(const f of ['forest_chapter_epilogue_committed','prologue_return_observed','first_attack_signature_available'])
   for(const prefix of ['global:','region:valley_prologue:'])expect(g.sessionState.world.flags[prefix+f]?.value).not.toBe(true);
  expect(g.sessionState.world.flags['global:owns.artifact.fragment.forest_site']?.value).toBe(true);
  expect(done.session.eventLedger.filter(e=>e.eventId==='episode.forest_site_lead_revealed')).toHaveLength(1);
  writeFileSync(dir+'/recorded-'+mode+'.json',JSON.stringify(done));
 });
 it.each(['worker-first','hermit-first'])('%s supports normal backtracking and keeps old calibration available',order=>{
  const g=ready();record(g);const old=resources(g);returnToVillage(g);
  const worker=()=>{act(g,'worker');expect(g.hasLead('worker')).toBe(false);g.interact('worker','lead:report');expect(g.hasLead('worker')).toBe(true);
   const s=g.toSave();g.interact('worker','lead:report');expect(g.toSave()).toEqual(s);expect(g.hasRoom('reported')).toBe(true);};
  const hermit=()=>{act(g,'hermit-road');act(g,'hermit');expect(g.hasLead('hermit')).toBe(false);
   g.interact('hermit','lead:interpret');expect(g.hasLead('hermit')).toBe(true);const s=g.toSave();
   expect(g.interact('hermit','lead:interpret').text).toContain('我不知道');expect(g.toSave()).toEqual(s);
   expect(g.interact('hermit','calibrate').accepted).toBe(true);expect(g.toSave()).toEqual(s);act(g,'return');};
  if(order==='worker-first'){worker();hermit();}else{hermit();worker();}
  expect(resources(g)).toEqual(old);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  expect(g.leadNotes).toContain('工务人已听过');expect(g.leadNotes).toContain('隐士提醒');
  writeFileSync(dir+'/'+order+'.json',JSON.stringify(g.toSave()));
 },60000);
 it('rejects a ledger-consistent forged recording lacking the earlier inspection or correct scene',()=>{
  for(const wrongScene of [false,true]){
   const g=ready();if(wrongScene){command(g,'lead:inspect');returnToVillage(g);}
   const s=g.toSave(),session=GameSession.fromSave(s.session);
   const result=commitSessionProposal(session,{transactionId:'forged.lead',drafts:[
    {eventId:'episode.lead.recorded',type:'world_flag_set',payload:{flagId:'forest.episode.lead.recorded',value:true,scope:'global'}},
    {eventId:'episode.forest_site_lead_revealed',type:'world_flag_set',payload:{flagId:'forest_site_lead_revealed',value:true,scope:'region',regionId:'valley_prologue'}},
    {eventId:'episode.lead.quest',type:'quest_stage_set',payload:{questId:'ch01_underground_water_allocation',stageId:'site_lead_revealed',stageOrdinal:s.session.state.quests.ch01_underground_water_allocation.stageOrdinal+1}},
    {eventId:'episode.receipt.lead.recorded',type:'receipt_recorded',payload:{receiptId:'forest.episode.lead.recorded',domain:'world',payloadHash:sha256Canonical({forged:true})}},
   ]});
   expect(result.committed).toBe(true);if(!result.committed)throw Error('fixture proposal failed');
   s.session=result.session.toSave();expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/位点线索/);
  }
 });
});
