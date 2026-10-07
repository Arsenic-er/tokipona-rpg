import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {advanceShardAlignment,validateShardState,shardPrerequisites,shardMissingWords,type ShardSyncState} from './forest-shard-sync';
import {shardSyncReadyFixture} from '../../scripts/testing/forest-shard-sync-fixture';
import {actEpisode as act,approachEpisode as approach,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {readRuntimeForestChapterManifest} from '../content/runtime-forest-chapter-manifest';
import artifact from '../generated/content-runtime.v0.1.json';
const chapter=readRuntimeForestChapterManifest(artifact),dir='.codex-tmp/shard-sync';
let ready:ForestEpisodeSave;
const cmd=(g:ForestEpisode,c?:string)=>g.interact('node-cradle',c);
const resources=(g:ForestEpisode)=>Object.fromEntries(['mp','economy','capabilities','learning','lifeCorpseLedger','survival'].map(k=>[k,g.sessionState[k as keyof typeof g.sessionState]]));
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=shardSyncReadyFixture().toSave();mkdirSync(dir,{recursive:true});},90000);
describe('forest fragment mechanical synchronization',()=>{
 it('requires ownership, archive, actual ecology resolution and grounded attuned words',()=>{
  const state=structuredClone(ForestEpisode.restore(ready).sessionState);
  expect(shardPrerequisites(state,chapter)).toBe(true);expect(shardMissingWords(state,chapter)).toEqual([]);
  for(const key of ['global:owns.artifact.fragment.forest_site','global:forest.episode.migration.archive','region:valley_prologue:forest_large_creature_resolution_committed']){
   const s={...state,world:{...state.world,flags:Object.fromEntries(Object.entries(state.world.flags).filter(([k])=>k!==key))}};expect(shardPrerequisites(s,chapter)).toBe(false);
  }
  for(const w of ['telo','tawa','wawa','lili','suli']){
   const s={...state,learning:{...state.learning,words:{...state.learning.words,[w]:{...state.learning.words[w],learningState:'discovered' as const}}}};
   expect(shardMissingWords(s,chapter)).toEqual([w]);expect(shardPrerequisites(s,chapter)).toBe(false);
  }
 });
 it('does not equate an old tool route or unread archive with synchronization readiness',()=>{
  const g=shardSyncReadyFixture(false),before=g.toSave();
  for(const c of ['shard:seat','shard:align','shard:confirm'])expect(cmd(g,c).text).toContain('现场理解');
  expect(g.toSave()).toEqual(before);expect(g.state.shardSync).toBeUndefined();
  const h=shardSyncReadyFixture(true,false),s=h.toSave();expect(cmd(h,'shard:seat').text).toContain('旱季配水档案');expect(h.toSave()).toEqual(s);
 },90000);
 it('cannot remotely insert, start alignment out of order, or confirm while still moving',()=>{
  const g=ForestEpisode.restore(ready),before=g.toSave();
  cmd(g,'shard:align');cmd(g,'shard:confirm');expect(g.toSave()).toEqual(before);
  cmd(g,'shard:seat');const seated=g.toSave();cmd(g,'shard:confirm');tick(g,240);
  expect(g.state.shardSync?.phase).toBe('seated');
  expect(g.sessionState).toEqual(seated.session.state);
  cmd(g,'shard:align');tick(g,4);const s=g.toSave();cmd(g,'shard:confirm');expect(g.toSave()).toEqual(s);
  act(g,'return');const away=g.toSave();expect(cmd(g,'shard:confirm').accepted).toBe(false);tick(g,300);
  expect(g.state.shardSync).toEqual(away.physical.shardSync);
 });
 it('waits for actual nearby ticks, round-trips partial saves and commits once only after confirmation',()=>{
  let g=ForestEpisode.restore(ready);const before=resources(g),old=g.toSave();
  cmd(g,'shard:seat');expect(cmd(g,'shard:align').resumeWorld).toBe(true);tick(g,60);
  const partial=g.toSave();writeFileSync(dir+'/partial.json',JSON.stringify(partial));
  g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);tick(g,120);
  expect(g.shardSyncStage).toBe('ready');expect(g.sessionState.world.flags['region:valley_prologue:forest_site_synchronized']).toBeUndefined();
  const aligned=g.toSave();writeFileSync(dir+'/aligned.json',JSON.stringify(aligned));
  expect(ForestEpisode.restore(aligned).toSave()).toEqual(aligned);
  cmd(g,'shard:confirm');expect(g.shardSyncStage).toBe('synchronized');
  expect(g.sessionState.world.flags['region:valley_prologue:forest_site_synchronized']?.value).toBe(true);
  expect(g.sessionState.quests.ch01_underground_water_allocation.stageId).toBe('shard_synchronized');
  expect(g.sessionState.world.flags['global:owns.artifact.fragment.forest_site']?.value).toBe(true);
  expect(resources(g)).toEqual(before);
  for(const k of ['mill','practice','returnFlow','migration','lengthStudy','motionStudy','waterStudy','forceStudy'] as const)expect(g.state[k]).toEqual(old.physical[k]);
  for(const f of ['forest_water_allocation_committed','forest_site_lead_revealed','forest_chapter_epilogue_committed','first_attack_signature_available'])
   expect(g.sessionState.world.flags['region:valley_prologue:'+f]?.value).not.toBe(true);
  const done=g.toSave();for(const c of ['shard:confirm','shard:withdraw','shard:seat','shard:align'])cmd(g,c);
  expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
  writeFileSync(dir+'/completed.json',JSON.stringify(done));
 });
 it('allows withdrawal, backtracking and re-insertion without losing any previous work',()=>{
  const g=ForestEpisode.restore(ready),before=resources(g);
  cmd(g,'shard:seat');cmd(g,'shard:align');tick(g,180);cmd(g,'shard:withdraw');
  expect(g.shardSyncStage).toBe('packed');expect(g.state.shardSync?.age).toBe(0);
  expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  act(g,'return');act(g,'return');act(g,'return');act(g,'top-exit');act(g,'return');
  expect(g.state.place).toBe('settlement');act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');
  act(g,'flow-depth');act(g,'node-road');act(g,'node-cradle','shard:seat');cmd(g,'shard:align');tick(g,60);
  approach(g,'node-archive');const paused=structuredClone(g.state.shardSync);tick(g,240);expect(g.state.shardSync).toEqual(paused);
  approach(g,'node-cradle');tick(g,180);cmd(g,'shard:confirm');expect(g.shardSyncStage).toBe('synchronized');
  expect(resources(g)).toEqual(before);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 },60000);
 it('rejects missing physical state, premature completion and malformed phases even with recomputed outer checksums',()=>{
  const g=ForestEpisode.restore(ready);cmd(g,'shard:seat');cmd(g,'shard:align');tick(g,30);
  for(const mutation of ['missing','phase','age','ready','done'] as const){
   const s=g.toSave();
   if(mutation==='missing')delete s.physical.shardSync;
   else if(mutation==='phase')s.physical.shardSync!.phase='invalid' as any;
   else if(mutation==='age')s.physical.shardSync!.age=181;
   else Object.assign(s.physical.shardSync!,{phase:mutation==='done'?'synchronized':'ready',age:180});
   expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
  }
 });
 it('has a bounded deterministic animation and no offscene progress',()=>{
  const s:ShardSyncState={version:1,phase:'aligning',age:0};
  for(let i=0;i<300;i++)advanceShardAlignment(s,false);expect(s.age).toBe(0);
  for(let i=0;i<179;i++)expect(advanceShardAlignment(s,true)).toBe(false);
  expect(advanceShardAlignment(s,true)).toBe(true);expect(advanceShardAlignment(s,true)).toBe(false);
  expect(s).toEqual({version:1,phase:'ready',age:180});validateShardState(s);
  expect(()=>validateShardState({...s,age:179})).toThrow();
 });
});
