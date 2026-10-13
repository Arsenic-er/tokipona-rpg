import {it,expect,beforeAll} from 'vitest';
import {GameSession} from '../session/game-session';
import {commitSessionProposal} from '../session/adapters';
import {nodeEnergyReadyFixture} from '../../scripts/testing/forest-node-energy-fixture';
import {tickEpisode as tick,actEpisode as act,approachEpisode as approach} from '../../scripts/testing/forest-cistern-fixture';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {nodeEnergyFrame} from '../world/forest-node-energy';
let ready:ForestEpisodeSave,tools:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=nodeEnergyReadyFixture().toSave();tools=nodeEnergyReadyFixture(false).toSave();},90000);
const prepare=(g:ForestEpisode)=>{g.interact('node-conservation','energy:reference');tick(g,80);g.interact('node-conservation','energy:predict:wawa:finite');};
it('preserves old saves on reading and never grants wawa through mechanical operation',()=>{
 const g=ForestEpisode.restore(tools),before=g.toSave();
 for(const choice of ['energy:inspect','unknown','energy:hint'])g.interact('node-conservation',choice);
 expect(g.toSave()).toEqual(before);expect(ForestEpisode.restore(before).toSave()).toEqual(before);
 prepare(g);expect(g.hasNodeEnergy('predicted')).toBe(false);expect(g.previewNodeEnergy()).toBeNull();
 expect(g.toSave().session).toEqual(before.session);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('needs the full physical reference and correct recalled meaning, not hints, menus or a partial expression',()=>{
 const g=ForestEpisode.restore(ready),session=g.toSave().session;
 g.interact('node-conservation','energy:predict:wawa:finite');expect(g.hasNodeEnergy('predicted')).toBe(false);
 g.interact('node-conservation','energy:reference');tick(g,79);g.interact('node-conservation','energy:predict:wawa:finite');
 expect(g.hasNodeEnergy('predicted')).toBe(false);tick(g,1);
 for(const c of ['energy:hint','energy:recall','energy:predict:wawa:forever','energy:predict:tawa:finite','energy:predict:wawa suli:finite'])
  g.interact('node-conservation',c);
 expect(g.toSave().session).toEqual(session);expect(g.previewNodeEnergy()).toBeNull();
 expect(g.interact('node-conservation','energy:predict:wawa:finite').choice).toBe('node-energy-cast');
 expect(g.hasNodeEnergy('completed')).toBe(false);
});
it('read-only preview rejects stale and distant confirmations without payment',()=>{
 const g=ForestEpisode.restore(ready);prepare(g);const before=g.toSave(),p=g.previewNodeEnergy()!;
 expect(p.canConfirm).toBe(true);expect(g.toSave()).toEqual(before);
 expect(g.confirmNodeEnergy('stale').accepted).toBe(false);expect(g.toSave()).toEqual(before);
 tick(g,1);expect(g.confirmNodeEnergy(p.planId).accepted).toBe(false);
 const fresh=g.previewNodeEnergy()!;approach(g,'node-survey');const far=g.toSave();
 expect(g.confirmNodeEnergy(fresh.planId).accepted).toBe(false);expect(g.toSave()).toEqual(far);
 expect(g.interact('node-conservation','energy:reference').accepted).toBe(false);
});
it('charges once, restores exactly, waits for real energy exhaustion and adds only one guided context',()=>{
 let g=ForestEpisode.restore(ready);prepare(g);const before=g.sessionState,tawa=structuredClone(g.state.nodeMotion),p=g.previewNodeEnergy()!;
 expect(g.confirmNodeEnergy(p.planId).resumeWorld).toBe(true);
 expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-2);expect(g.hasNodeEnergy('completed')).toBe(false);
 tick(g,37);const mid=g.toSave(),copy=ForestEpisode.restore(mid);g=ForestEpisode.restore(mid);
 tick(g,20);tick(copy,20);expect(g.toSave()).toEqual(copy.toSave());
 tick(g,135);expect(nodeEnergyFrame(g.state.nodeEnergy).test.latched).toBe(true);expect(g.hasNodeEnergy('completed')).toBe(false);
 tick(g,48);expect(g.hasNodeEnergy('completed')).toBe(true);
 const w=g.sessionState.learning.words.wawa!,previous=before.learning.words.wawa!;
 expect(w.evidence).toHaveLength(previous.evidence.length+1);expect(w.learningState).toBe(previous.learningState);
 expect(w.evidence.at(-1)).toMatchObject({eventType:'grounding_trial_resolved',sourceObjectClass:'underground_energy_hoist',taskFamilyId:'forest_energy_budget',toolBypass:false,answerVisible:false,promptLevel:1});
 expect(g.nodeEnergyNotes).toContain('右机：输入 30 = 剩余 0 + 提升做功 22.5 + 损耗 7.5');
 expect(g.state.nodeMotion).toEqual(tawa);expect(g.sessionState.learning.words.tawa).toEqual(before.learning.words.tawa);
 expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(g.sessionState.economy).toEqual(before.economy);
 const done=g.toSave();g.interact('node-conservation','energy:reference');g.interact('node-conservation','energy:predict:wawa:finite');
 expect(g.confirmNodeEnergy(p.planId).accepted).toBe(false);expect(g.toSave()).toEqual(done);
 expect(ForestEpisode.restore(done).toSave()).toEqual(done);
});
it('freezes away and on scene exit; existing apparatus reset never cancels the charge',()=>{
 const g=ForestEpisode.restore(ready);prepare(g);g.confirmNodeEnergy(g.previewNodeEnergy()!.planId);tick(g,20);
 const energy=structuredClone(g.state.nodeEnergy),session=g.toSave().session;
 g.interact('node-conservation','experiment:reset');g.interact('node-conservation','experiment:anomaly');
 expect(g.state.nodeEnergy).toEqual(energy);expect(g.toSave().session).toEqual(session);
 approach(g,'node-survey');const paused=structuredClone(g.state.nodeEnergy);tick(g,300);expect(g.state.nodeEnergy).toEqual(paused);
 act(g,'return');const exited=structuredClone(g.state.nodeEnergy);tick(g,300);expect(g.state.nodeEnergy).toEqual(exited);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 act(g,'node-road');approach(g,'node-conservation');tick(g,240);expect(g.hasNodeEnergy('completed')).toBe(true);
});
it('insufficient MP refuses without changing state; low-MP fixture is explicitly synthetic',()=>{
 const s=structuredClone(ready),session=GameSession.fromSave(s.session),mp=session.snapshot().mp;
 const r=commitSessionProposal(session,{transactionId:'test.energy.low-mp',drafts:[
  {eventId:'test.energy.low-mp',type:'mp_replaced',payload:{mp:{...mp,currentMp:1,worldVersion:mp.worldVersion+1}}}]});
 expect(r.committed).toBe(true);s.session=r.session.toSave();
 const g=ForestEpisode.restore(rehash(s));prepare(g);const before=g.toSave(),preview=g.previewNodeEnergy()!;
 expect(preview.canConfirm).toBe(false);expect(g.confirmNodeEnergy(preview.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
});
it('rejects rehashed null, unpaid, early-complete or missing reservoir states',()=>{
 for(const v of [null,{version:1,referenceAge:80,castAge:0}]){
  const s=structuredClone(ready);s.physical.nodeEnergy=v as never;expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/蓄能提升机/);
 }
 const g=ForestEpisode.restore(ready);prepare(g);g.confirmNodeEnergy(g.previewNodeEnergy()!.planId);
 const early=g.toSave();early.physical.nodeEnergy!.castAge=240;expect(()=>ForestEpisode.restore(rehash(early))).toThrow(/蓄能提升机/);
 tick(g,240);const complete=g.toSave();delete complete.physical.nodeEnergy;expect(()=>ForestEpisode.restore(rehash(complete))).toThrow(/蓄能提升机/);
});
