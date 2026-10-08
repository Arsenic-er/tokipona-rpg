import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {allocationReadyFixture} from '../../scripts/testing/forest-allocation-fixture';
import {shardSyncReadyFixture} from '../../scripts/testing/forest-shard-sync-fixture';
import {actEpisode as act,approachEpisode as approach,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {allocationEffects} from './forest-water-allocation';
import {AllocationWorld,type AllocationMode} from '../world/forest-water-allocation';
import {readRuntimeForestChapterManifest} from '../content/runtime-forest-chapter-manifest';
import artifact from '../generated/content-runtime.v0.1.json';
import {sha256Canonical,type JsonValue} from '../canonical-json';
const chapter=readRuntimeForestChapterManifest(artifact),dir='.codex-tmp/water-allocation',modes=chapter.allocation.modeIds;
let ready:ForestEpisodeSave;
const cmd=(g:ForestEpisode,c?:string)=>g.interact('node-allocation',c);
const resources=(g:ForestEpisode)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,g.sessionState[k as keyof typeof g.sessionState]]));
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=allocationReadyFixture().toSave();mkdirSync(dir,{recursive:true});},90000);
describe('earned, previewed, physically verified regional allocation',()=>{
 it('cannot bypass synchronization or choose remotely',()=>{
  const g=shardSyncReadyFixture();act(g,'node-allocation');const before=g.toSave();
  cmd(g,'allocation:preview:wetland_priority');cmd(g,'allocation:confirm:wetland_priority');expect(g.toSave()).toEqual(before);
  const h=ForestEpisode.restore(ready);act(h,'return');expect(cmd(h,'allocation:preview:wetland_priority').accepted).toBe(false);
 },90000);
 it('keeps previews cancelable and saveable, refuses unknown or stale confirmations, and grants nothing',()=>{
  const g=ForestEpisode.restore(ready),before=g.toSave();
  cmd(g,'allocation:confirm:wetland_priority');cmd(g,'allocation:preview:balanced_upgrade');expect(g.toSave()).toEqual(before);
  for(const mode of modes){cmd(g,'allocation:preview:'+mode);expect(g.allocationStage).toBe('preview');
   expect(g.sessionState).toEqual(before.session.state);expect(g.allocationView?.world).toBeNull();
   expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  }
  const preview=g.toSave();cmd(g,'allocation:confirm:wetland_priority');expect(g.toSave()).toEqual(preview);
  writeFileSync(dir+'/preview.json',JSON.stringify(preview));cmd(g,'allocation:cancel');expect(g.toSave()).toEqual(before);
 });
 it.each(modes)('%s waits for all actual output, then commits the selected consequences exactly once',mode=>{
  let g=ForestEpisode.restore(ready);const before=g.toSave(),old=resources(g);
  cmd(g,'allocation:preview:'+mode);expect(cmd(g,'allocation:confirm:'+mode).resumeWorld).toBe(true);
  expect(g.allocationStage).toBe('routing');expect(g.allocationMode).toBeNull();tick(g,120);
  const partial=g.toSave();writeFileSync(dir+'/partial-'+mode+'.json',JSON.stringify(partial));
  g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);expect(g.allocationMode).toBeNull();
  cmd(g,'allocation:cancel');cmd(g,'allocation:preview:balanced_upgrade');expect(g.toSave()).toEqual(partial);
  tick(g,780);expect(g.allocationStage).toBe('committed');expect(g.allocationMode).toBe(mode);
  expect(g.sessionState.quests.ch01_underground_water_allocation.stageId).toBe('water_allocated');
  expect(g.sessionState.world.flags['region:valley_prologue:forest_water_allocation_committed']?.value).toBe(true);
  for(const id of allocationEffects(chapter,mode))expect(g.sessionState.world.flags['region:valley_prologue:forest_allocation_effect.'+id]?.value).toBe(true);
  expect(resources(g)).toEqual(old);
  for(const k of ['mill','practice','returnFlow','migration','shardSync','lengthStudy','motionStudy','waterStudy','forceStudy'] as const)expect(g.state[k]).toEqual(before.physical[k]);
  expect(g.sessionState.world.flags['global:owns.artifact.fragment.forest_site']?.value).toBe(true);
  expect(g.sessionState.world.flags['region:valley_prologue:settlement_supply_stable']).toEqual(before.session.state.world.flags['region:valley_prologue:settlement_supply_stable']);
  for(const f of ['forest_site_lead_revealed','forest_chapter_epilogue_committed','prologue_return_observed','first_attack_signature_available'])
   for(const scope of ['global:','region:valley_prologue:'])expect(g.sessionState.world.flags[scope+f]?.value).not.toBe(true);
  const done=g.toSave();for(const c of ['allocation:confirm:'+mode,'allocation:cancel','allocation:preview:wetland_priority'])cmd(g,c);
  expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
  writeFileSync(dir+'/completed-'+mode+'.json',JSON.stringify(done));
 },30000);
 it('pauses when far away or outside the scene, and keeps the committed choice on normal backtracking',()=>{
  const g=ForestEpisode.restore(ready);cmd(g,'allocation:preview:wetland_priority');cmd(g,'allocation:confirm:wetland_priority');tick(g,40);
  approach(g,'node-cradle');const stopped=structuredClone(g.state.allocation);tick(g,200);expect(g.state.allocation).toEqual(stopped);
  act(g,'return');const away=structuredClone(g.state.allocation);tick(g,200);expect(g.state.allocation).toEqual(away);
  act(g,'node-road');act(g,'node-allocation');tick(g,900);expect(g.allocationMode).toBe('wetland_priority');
  act(g,'return');expect(act(g,'wetland-lookout').text).toContain('用水配给');
  act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');const before=resources(g);
  expect(act(g,'worker').text).toContain('分时取水牌');expect(resources(g)).toEqual(before);expect(g.hasRoom('reported')).toBe(true);
  const report=g.toSave();g.interact('worker');expect(g.toSave()).toEqual(report);
  expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  writeFileSync(dir+'/village.json',JSON.stringify(g.toSave()));
 },60000);
 it('rejects missing or contradictory state and forged completion at an unearned outlet age',()=>{
  const g=ForestEpisode.restore(ready);cmd(g,'allocation:preview:road_trade_priority');cmd(g,'allocation:confirm:road_trade_priority');tick(g,40);
  for(const mutation of ['missing','phase','mode','age','arrived'] as const){
   const s=g.toSave();if(mutation==='missing')delete s.physical.allocation;
   else if(mutation==='phase')s.physical.allocation!.phase='committed';
   else if(mutation==='mode')s.physical.allocation!.mode='wetland_priority';
   else if(mutation==='age')s.physical.allocation!.age=901;
   else{const w=new AllocationWorld('road_trade_priority');while(!w.satisfied)w.advance();s.physical.allocation!.age=w.age;}
   expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
  }
  const s=g.toSave();s.physical.allocation!.mode='balanced_upgrade' as AllocationMode;expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
 });
});
