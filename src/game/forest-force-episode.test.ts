import {beforeAll,describe,it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {wetlandReadyFixture} from '../../scripts/testing/forest-wetland-fixture';
import {actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave;
const dir=resolve('.codex-tmp/force-study'),command=(g:ForestEpisode,choice:string)=>g.interact('flow-spout',choice);
beforeAll(()=>{const g=wetlandReadyFixture(false);ready=g.toSave();mkdirSync(dir,{recursive:true});},60000);
const begin=(g:ForestEpisode)=>{act(g,'flow-spout','force:open');command(g,'force:observe');};
const observed=(g:ForestEpisode)=>{begin(g);tick(g,240);};
const resources=(g:ForestEpisode)=>({mp:g.sessionState.mp,economy:g.sessionState.economy,capabilities:g.sessionState.capabilities,
  lives:g.sessionState.lifeCorpseLedger});
const rehash=(s:ForestEpisodeSave)=>{const{checksum:_,...b}=s;return {...b,checksum:sha256Canonical(b as unknown as JsonValue)};};
describe('embedded wawa inert learning',()=>{
  it('keeps old saves exact and does not learn from repair, opening a panel or remote calls',()=>{
    const g=ForestEpisode.restore(ready),before=g.sessionState.learning;
    expect(g.toSave()).toEqual(ready);expect(g.state.forceStudy).toBeUndefined();
    expect(command(g,'force:observe').accepted).toBe(false);
    act(g,'flow-spout','force:open');expect(g.sessionState.learning).toEqual(before);expect(g.state.forceStudy).toBeUndefined();
    command(g,'force:predict:wawa:more');expect(g.state.forceStudy).toBeUndefined();
  });
  it('saves a partial contrast, freezes off-scene and discovers only after both actual loads settle',()=>{
    let g=ForestEpisode.restore(ready);begin(g);tick(g,35);
    expect(g.hasForce('observed')).toBe(false);expect(g.sessionState.learning).toEqual(ready.session.state.learning);
    const partial=g.toSave();writeFileSync(resolve(dir,'partial.json'),JSON.stringify(partial));
    g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
    act(g,'flow-depth');expect(g.state.place).toBe('wetland');const study=structuredClone(g.state.forceStudy);
    tick(g,900);expect(g.state.forceStudy).toEqual(study);act(g,'return');
    act(g,'flow-spout','force:open');tick(g,240);
    expect(g.hasForce('observed')).toBe(true);expect(g.sessionState.learning.words.wawa.discoveryState).toBe('discovered');
    expect(g.sessionState.learning.words.wawa.attunementState).toBe('locked');
    expect(g.sessionState.learning.words.wawa.learningState).toBe('discovered');
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  });
  it('requires manual attunement and free recall, refusing wrong words, wrong predictions and guessed completion',()=>{
    const g=ForestEpisode.restore(ready);observed(g);command(g,'force:predict:wawa:more');
    expect(g.hasForce('predicted')).toBe(false);command(g,'force:attune');
    const before=g.sessionState.learning;expect(before.words.wawa.attunementState).toBe('attuned');
    for(const choice of ['force:complete','force:predict:telo:more','force:predict:wawa:less','force:predict:wawa:reverse','force:predict:wawa suli:more']){
      command(g,choice);expect(g.sessionState.learning).toEqual(before);expect(g.hasForce('predicted')).toBe(false);
    }
    const hint=command(g,'force:hint');expect(hint.text).toContain('wawa');
    const prompt=command(g,'force:recall');expect(prompt.choice).toBe('force-recall');
    expect(prompt.text).not.toContain('wawa');expect(JSON.stringify(prompt.actions)).not.toContain('wawa');
    expect(resources(g)).toEqual(resources(ForestEpisode.restore(ready)));
  });
  it('commits H1 grounding only after prediction and stable physics; repeats cannot farm evidence or rewards',()=>{
    let g=ForestEpisode.restore(ready);const before=resources(g);observed(g);command(g,'force:attune');
    const result=command(g,'force:predict:WAWA:more');expect(result.resumeWorld).toBe(true);
    expect(g.state.forceStudy).toEqual({version:1,run:'trial',age:0});expect(g.hasForce('completed')).toBe(false);
    tick(g,119);expect(g.hasForce('completed')).toBe(false);
    const partial=g.toSave();g=ForestEpisode.restore(partial);expect(g.toSave()).toEqual(partial);
    tick(g,1);expect(g.hasForce('completed')).toBe(true);expect(g.sessionState.learning.words.wawa.learningState).toBe('grounded');
    const evidence=g.sessionState.learning.words.wawa.evidence.filter(e=>e.eventType==='grounding_trial_resolved');
    expect(evidence).toHaveLength(1);expect(evidence[0]).toMatchObject({promptLevel:1,sourceObjectClass:'inert_return_flow_mechanism',
      worldOutcomeKind:'inert_force_observation',answerVisible:false,toolBypass:false,worldOutcomeContribution:true});
    const learned=structuredClone(g.sessionState.learning),revision=g.sessionState.revision;
    for(const c of ['force:open','force:observe','force:attune','force:predict:wawa:more'])command(g,c);
    tick(g,900);expect(g.sessionState.revision).toBe(revision);expect(g.sessionState.learning).toEqual(learned);
    expect(resources(g)).toEqual(before);
    for(const w of ['telo','tawa','lili','suli'])expect(g.sessionState.learning.words[w]).toEqual(ready.session.state.learning.words[w]);
    for(const f of ['prologue_return_observed','first_attack_signature_available','forest_site_synchronized','forest_water_allocation_committed','forest_chapter_epilogue_committed'])
      for(const scope of ['global:','region:valley_prologue:'])expect(g.sessionState.world.flags[scope+f]?.value).not.toBe(true);
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
    writeFileSync(resolve(dir,'completed.json'),JSON.stringify(g.toSave()));
  });
  it('retains learned records and the original return route through village revisits',()=>{
    const g=ForestEpisode.restore(ready);observed(g);command(g,'force:attune');command(g,'force:predict:wawa:more');tick(g,120);
    const learning=structuredClone(g.sessionState.learning),before=resources(g);
    act(g,'return');act(g,'top-exit');act(g,'return');act(g,'worker');
    act(g,'mill-road');act(g,'cistern-shortcut');act(g,'return-channel-road');act(g,'flow-spout','force:open');
    expect(g.sessionState.learning).toEqual(learning);expect(resources(g)).toEqual(before);
    expect(g.chapterWordNotes).toContain('wawa：已有场景理解证据');
    expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  });
  it('rejects absent state, fabricated timelines and a trial without prediction receipts',()=>{
    const g=ForestEpisode.restore(ready);begin(g);tick(g,20);
    for(const mode of ['missing','age','trial'] as const){
      const s=g.toSave();if(mode==='missing')delete s.physical.forceStudy;
      if(mode==='age')s.physical.forceStudy!.age=240;
      if(mode==='trial')s.physical.forceStudy={version:1,run:'trial',age:10};
      expect(()=>ForestEpisode.restore(rehash(s))).toThrow();
    }
  });
});
