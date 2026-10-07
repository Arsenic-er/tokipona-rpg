import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {WATER_STUDY,waterStudyReady,parseWaterPrediction} from './forest-water-study';
import {waterStudyReadyFixture} from '../../scripts/testing/forest-water-study-fixture';
import {wetlandReadyFixture} from '../../scripts/testing/forest-wetland-fixture';
import {actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {collectedEpisodeWater} from '../world/forest-episode-water';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave;const dir=resolve('.codex-tmp/water-study');
const command=(g:ForestEpisode,c:string)=>g.interact('pool',c);
const prepare=(g:ForestEpisode)=>{command(g,'water:open');command(g,'water:observe');command(g,'water:attune');};
const predict=(g:ForestEpisode)=>command(g,'water:predict:telo:downhill');
const resources=(g:ForestEpisode)=>({economy:g.sessionState.economy,capabilities:g.sessionState.capabilities,lives:g.sessionState.lifeCorpseLedger});
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
beforeAll(()=>{ready=waterStudyReadyFixture().toSave();mkdirSync(dir,{recursive:true});},60000);
describe('optional hermit water recall',()=>{
  it('preserves old saves and keeps the optional study separate from old answer-visible practice',()=>{
    const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);expect(g.waterStudyStage).toBe('unvisited');
    command(g,'water:open');command(g,'water:confirm');expect(g.toSave()).toEqual(ready);
    const locked=waterStudyReadyFixture(12,false),before=locked.toSave();command(locked,'water:observe');
    expect(locked.toSave()).toEqual(before);act(g,'hermit');expect(command(g,'water:observe').accepted).toBe(false);
  },60000);
  it('requires free recall and a gravity prediction, with no answer token on the recall panel',()=>{
    const g=ForestEpisode.restore(ready);prepare(g);const before=g.toSave();
    expect(g.sessionState.learning.words.telo.attunementState).toBe('attuned');
    for(const c of ['water:predict:tawa:downhill','water:predict:telo:uphill','water:predict:telo:hover','water:predict:telo lili:downhill']){
      const result=command(g,c);expect(result.choice).toBe('water-recall');expect(result.text).not.toContain('telo');expect(g.toSave()).toEqual(before);
    }
    expect(command(g,'water:hint').text).toContain('telo');expect(command(g,'water:recall').text).not.toContain('telo');
    expect(parseWaterPrediction('water:predict:ＴＥＬＯ:downhill')).toBe(true);
    expect(g.toSave()).toEqual(before);
  });
  it('charges only explicit confirmation and waits for all new water, without resetting old water or practice',()=>{
    let g=ForestEpisode.restore(ready);prepare(g);const before=g.toSave(),unchanged=resources(g),water=structuredClone(g.state.practice);
    expect(waterStudyReady(water)).toBe(true);predict(g);expect(g.sessionState.mp).toEqual(before.session.state.mp);
    expect(g.state.waterStudy).toBeUndefined();const confirm=command(g,'water:confirm');expect(confirm.resumeWorld).toBe(true);
    expect(g.state.practice.supplied).toBe(water.supplied+32);expect(g.state.practice.escaped).toBe(water.escaped);
    expect(g.state.baselineCollected).toBe(before.physical.baselineCollected);expect(g.state.casts).toBe(before.physical.casts+1);
    expect(g.sessionState.mp.currentMp).toBe(before.session.state.mp.currentMp-2);expect(g.sessionState.mp.maxMp).toBe(before.session.state.mp.maxMp);
    const mp=structuredClone(g.sessionState.mp);command(g,'water:confirm');expect(g.sessionState.mp).toEqual(mp);
    tick(g,25);expect(g.waterStudyStage).toBe('casting');const partial=g.toSave();writeFileSync(resolve(dir,'partial.json'),JSON.stringify(partial));
    g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
    for(let i=0;i<600&&!g.hasWaterStudy('completed');i++)g.advance();
    expect(g.waterStudyStage).toBe('completed');expect(collectedEpisodeWater(g.state.practice)).toBe(collectedEpisodeWater(water)+32);
    const record=g.sessionState.learning.words.telo;
    expect(record.learningState).toBe('grounded');expect(record.evidence.filter(e=>e.eventType==='grounding_trial_resolved')).toHaveLength(1);
    expect(record.evidence.at(-1)).toMatchObject({promptLevel:1,answerVisible:false,toolBypass:false,sourceObjectClass:WATER_STUDY.source,worldOutcomeContribution:true});
    for(const w of ['tawa','wawa','lili','suli'])expect(g.sessionState.learning.words[w]).toEqual(before.session.state.learning.words[w]);
    expect(resources(g)).toEqual(unchanged);expect(g.sessionState.mp).toEqual(mp);
    const done=g.toSave();for(const c of ['water:observe','water:attune','water:predict:telo:downhill','water:confirm'])command(g,c);
    expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
    writeFileSync(resolve(dir,'completed.json'),JSON.stringify(done));
  });
  it('preserves a correct prediction with zero MP and allows the existing rest route to recover',()=>{
    const g=waterStudyReadyFixture(2);prepare(g);predict(g);const before=g.toSave();
    expect(command(g,'water:confirm').text).toContain('MP 不足');expect(g.toSave()).toEqual(before);
    act(g,'rest');expect(g.sessionState.mp.currentMp).toBe(4);act(g,'pool');command(g,'water:confirm');tick(g,600);
    expect(g.hasWaterStudy('completed')).toBe(true);expect(g.sessionState.mp.currentMp).toBe(2);
  },60000);
  it('freezes water away from the clearing, restores exact pending state and preserves the normal chapter handoff',()=>{
    let g=ForestEpisode.restore(ready);prepare(g);predict(g);command(g,'water:confirm');
    // Walking across the clearing may finish the water. Leaving never resets or replays it.
    act(g,'return');const water=structuredClone(g.state.practice);tick(g,600);expect(g.state.practice).toEqual(water);
    act(g,'worker');expect(g.has('finished')).toBe(true);const wallet=g.sessionState.economy.coin;
    const s=g.toSave();g=ForestEpisode.restore(s);expect(g.toSave()).toEqual(s);act(g,'hermit-road');act(g,'pool');tick(g,600);
    expect(g.hasWaterStudy('completed')).toBe(true);expect(g.sessionState.economy.coin).toBe(wallet);
  });
  it('accepts semantically identical saved study fields regardless of JSON key order',()=>{
    const g=ForestEpisode.restore(ready);prepare(g);predict(g);command(g,'water:confirm');tick(g,20);
    const s=g.toSave(),w=s.physical.waterStudy!;
    s.physical.waterStudy={startTick:w.startTick,castIndex:w.castIndex,baselineCollected:w.baselineCollected,version:w.version};
    expect(ForestEpisode.restore(s).toSave()).toEqual(s);
  });
  it('rejects forged water origins, missing cast state and fake arrival',()=>{
    const g=ForestEpisode.restore(ready);prepare(g);predict(g);command(g,'water:confirm');tick(g,20);
    for(const mode of ['missing','baseline','cast-index'] as const){
      const s=g.toSave();if(mode==='missing')delete s.physical.waterStudy;
      if(mode==='baseline')s.physical.waterStudy!.baselineCollected=0;
      if(mode==='cast-index')s.physical.waterStudy!.castIndex++;
      expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
    }
  });
  it('coexists with the prior wawa loop and real underground return path without granting the remaining words',()=>{
    const g=wetlandReadyFixture(false);act(g,'flow-spout','force:observe');tick(g,240);
    g.interact('flow-spout','force:attune');g.interact('flow-spout','force:predict:wawa:more');tick(g,120);
    expect(g.hasForce('completed')).toBe(true);const wawa=structuredClone(g.sessionState.learning.words.wawa);
    act(g,'return');act(g,'top-exit');act(g,'return');act(g,'hermit-road');act(g,'pool');prepare(g);predict(g);command(g,'water:confirm');tick(g,600);
    expect(g.hasWaterStudy('completed')).toBe(true);expect(g.sessionState.learning.words.wawa).toEqual(wawa);
    for(const w of ['tawa','lili','suli'])expect(g.sessionState.learning.words[w]?.discoveryState).not.toBe('discovered');
    expect(g.chapterWordNotes).toContain('telo：已有场景理解证据');expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  },60000);
});
