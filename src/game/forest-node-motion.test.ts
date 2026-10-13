import {it,expect,beforeAll} from 'vitest';
import {GameSession} from '../session/game-session';
import {commitSessionProposal} from '../session/adapters';
import {nodeMotionReadyFixture} from '../../scripts/testing/forest-node-motion-fixture';
import {tickEpisode as tick,actEpisode as act,approachEpisode as approach} from '../../scripts/testing/forest-cistern-fixture';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave,tools:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=nodeMotionReadyFixture().toSave();tools=nodeMotionReadyFixture(false).toSave();},90000);
const prepare=(g:ForestEpisode)=>{g.interact('node-time','rail:reference');tick(g,180);
 g.interact('node-time','rail:predict:tawa:reverse');};
it('old saves and read-only inspection remain byte-equivalent; a tool run never grants learning',()=>{
 const g=ForestEpisode.restore(tools),before=g.toSave();
 expect(ForestEpisode.restore(before).toSave()).toEqual(before);
 g.interact('node-time','rail:inspect');g.interact('node-time','unknown');expect(g.toSave()).toEqual(before);
 g.interact('node-time','rail:reference');tick(g,180);g.interact('node-time','rail:predict:tawa:reverse');
 expect(g.hasNodeMotion('predicted')).toBe(false);expect(g.previewNodeMotion()).toBeNull();
 expect(g.toSave().session).toEqual(before.session);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('requires a real baseline and a recalled word, gives no grant for viewing hints',()=>{
 const g=ForestEpisode.restore(ready),before=g.toSave().session;
 for(const c of ['rail:predict:tawa:reverse','rail:recall','rail:hint'])g.interact('node-time',c);
 expect(g.hasNodeMotion('predicted')).toBe(false);
 g.interact('node-time','rail:reference');tick(g,179);g.interact('node-time','rail:predict:tawa:reverse');
 expect(g.hasNodeMotion('predicted')).toBe(false);tick(g,1);
 for(const c of ['rail:hint','rail:recall','rail:predict:tawa:same','rail:predict:telo:reverse','rail:predict:tawa wawa:reverse'])
  g.interact('node-time',c);
 expect(g.toSave().session).toEqual(before);expect(g.previewNodeMotion()).toBeNull();
 expect(g.interact('node-time','rail:predict:tawa:reverse').choice).toBe('node-motion-cast');
 expect(g.hasNodeMotion('completed')).toBe(false);
});
it('previews are read-only, stale plans and distant confirmations do not charge',()=>{
 const g=ForestEpisode.restore(ready);prepare(g);const before=g.toSave();
 const p=g.previewNodeMotion()!;expect(p.canConfirm).toBe(true);expect(g.toSave()).toEqual(before);
 expect(g.confirmNodeMotion('stale').accepted).toBe(false);expect(g.toSave()).toEqual(before);
 tick(g,1);expect(g.confirmNodeMotion(p.planId).accepted).toBe(false);
 const fresh=g.previewNodeMotion()!;approach(g,'node-survey');const far=g.toSave();
 expect(g.confirmNodeMotion(fresh.planId).accepted).toBe(false);expect(g.toSave()).toEqual(far);
 expect(g.interact('node-time','rail:reference').accepted).toBe(false);
});
it('charges once, preserves mid-flight save and records only a second H1 after physical reversal',()=>{
 let g=ForestEpisode.restore(ready);prepare(g);const before=g.sessionState,p=g.previewNodeMotion()!;
 expect(g.confirmNodeMotion(p.planId).resumeWorld).toBe(true);expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-2);
 expect(g.hasNodeMotion('completed')).toBe(false);tick(g,50);
 const mid=g.toSave(),copy=ForestEpisode.restore(mid);g=ForestEpisode.restore(mid);
 tick(g,20);tick(copy,20);expect(g.toSave()).toEqual(copy.toSave());
 approach(g,'node-survey');const away=structuredClone(g.state.nodeMotion);tick(g,200);expect(g.state.nodeMotion).toEqual(away);
 approach(g,'node-time');tick(g,180);expect(g.hasNodeMotion('completed')).toBe(true);
 const w=g.sessionState.learning.words.tawa!,prior=before.learning.words.tawa!;
 expect(w.evidence).toHaveLength(prior.evidence.length+1);expect(w.learningState).toBe(prior.learningState);
 expect(w.evidence.at(-1)).toMatchObject({eventType:'grounding_trial_resolved',taskFamilyId:'forest_motion_relations',toolBypass:false,answerVisible:false,promptLevel:1});
 expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(g.sessionState.economy).toEqual(before.economy);
 const done=g.toSave();g.interact('node-time','rail:reference');g.interact('node-time','rail:predict:tawa:reverse');
 expect(g.confirmNodeMotion(p.planId).accepted).toBe(false);expect(g.toSave()).toEqual(done);
 expect(ForestEpisode.restore(done).toSave()).toEqual(done);
});
it('ordinary experiment reset cannot reset, charge or replace the separate rail run',()=>{
 const g=ForestEpisode.restore(ready);prepare(g);g.confirmNodeMotion(g.previewNodeMotion()!.planId);tick(g,40);
 const rail=structuredClone(g.state.nodeMotion),session=g.toSave().session;
 g.interact('node-time','experiment:reset');g.interact('node-time','experiment:anomaly');
 expect(g.state.nodeMotion).toEqual(rail);expect(g.toSave().session).toEqual(session);
 act(g,'return');const paused=structuredClone(g.state.nodeMotion);tick(g,180);expect(g.state.nodeMotion).toEqual(paused);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('insufficient MP rejects confirmation without changing the save',()=>{
 const s=structuredClone(ready),session=GameSession.fromSave(s.session),mp=session.snapshot().mp;
 const r=commitSessionProposal(session,{transactionId:'test.rail.low-mp',drafts:[
  {eventId:'test.rail.low-mp',type:'mp_replaced',payload:{mp:{...mp,currentMp:1,worldVersion:mp.worldVersion+1}}}]});
 expect(r.committed).toBe(true);s.session=r.session.toSave();
 const g=ForestEpisode.restore(rehash(s));prepare(g);const before=g.toSave(),preview=g.previewNodeMotion()!;
 expect(preview.canConfirm).toBe(false);expect(g.confirmNodeMotion(preview.planId).accepted).toBe(false);
 expect(g.toSave()).toEqual(before);expect(g.hasNodeMotion('cast')).toBe(false);
});
it('rejects a rehashed unpaid cast, missing run and premature completion',()=>{
 const unpaid=structuredClone(ready);unpaid.physical.nodeMotion={version:1,referenceAge:180,castAge:0};
 expect(()=>ForestEpisode.restore(rehash(unpaid))).toThrow(/滑轨/);
 const g=ForestEpisode.restore(ready);prepare(g);g.confirmNodeMotion(g.previewNodeMotion()!.planId);
 const early=g.toSave();early.physical.nodeMotion!.castAge=180;
 expect(()=>ForestEpisode.restore(rehash(early))).toThrow(/滑轨/);
 tick(g,180);const complete=g.toSave();delete complete.physical.nodeMotion;
 expect(()=>ForestEpisode.restore(rehash(complete))).toThrow(/滑轨/);
});
