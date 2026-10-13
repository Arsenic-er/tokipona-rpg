import {it,expect,beforeAll} from 'vitest';
import {nodeWaterReadyFixture} from '../../scripts/testing/forest-node-water-fixture';
import {tickEpisode as tick,actEpisode as act,approachEpisode as approach} from '../../scripts/testing/forest-cistern-fixture';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {GameSession} from '../session/game-session';
import {commitSessionProposal} from '../session/adapters';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave,tools:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=nodeWaterReadyFixture().toSave();tools=nodeWaterReadyFixture(false).toSave();},120000);
const predict=(g:ForestEpisode,stage:'short'|'long')=>g.interact('node-material','waterway:predict:telo '+(stage==='short'?'lili:narrow':'suli:both'));
const cast=(g:ForestEpisode,stage:'short'|'long')=>{
 if(stage==='long')g.interact('node-material','waterway:brace');predict(g,stage);
 const p=g.previewNodeWater();expect(p?.canConfirm).toBe(true);expect(g.confirmNodeWater(p!.planId).accepted).toBe(true);
};
it('reading old saves or hints is inert; tools earn no words, MP or capabilities',()=>{
 const g=ForestEpisode.restore(tools),s=g.toSave();g.interact('node-material','waterway:inspect');
 g.interact('node-material','waterway:hint');predict(g,'short');expect(g.toSave()).toEqual(s);expect(g.previewNodeWater()).toBeNull();
 for(const stage of ['short','long'] as const){g.interact('node-material','waterway:tool');tick(g,180);expect(g.hasNodeWater(stage+'.completed' as never)).toBe(true);}
 expect(g.nodeWaterFrame.total).toBe(240);expect(g.sessionState.learning).toEqual(s.session.state.learning);
 expect(g.sessionState.mp).toEqual(s.session.state.mp);expect(g.sessionState.capabilities).toEqual(s.session.state.capabilities);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('runs serial physical stages, charges 6 + 10 once and adds only actual guided contexts',()=>{
 let g=ForestEpisode.restore(ready);const before=g.sessionState,motion=structuredClone(g.state.nodeMotion),energy=structuredClone(g.state.nodeEnergy);
 cast(g,'short');expect(g.hasNodeWater('short.completed')).toBe(false);tick(g,47);
 const mid=g.toSave();g=ForestEpisode.restore(mid);expect(g.toSave()).toEqual(mid);tick(g,133);
 expect(g.hasNodeWater('short.completed')).toBe(true);expect(g.sessionState.learning.words.lili!.evidence).toHaveLength(before.learning.words.lili!.evidence.length+1);
 expect(g.sessionState.learning.words.telo).toEqual(before.learning.words.telo);expect(g.nodeWaterFrame.collected.short).toBeGreaterThanOrEqual(24);
 predict(g,'long');expect(g.previewNodeWater()!.canConfirm).toBe(false);g.interact('node-material','waterway:brace');
 cast(g,'long');tick(g,179);expect(g.hasNodeWater('long.completed')).toBe(false);tick(g,1);
 expect(g.hasNodeWater('long.completed')).toBe(true);expect(g.nodeWaterFrame.total).toBe(480);
 expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-16);
 for(const word of ['telo','lili','suli']){
  expect(g.sessionState.learning.words[word]!.evidence).toHaveLength(before.learning.words[word]!.evidence.length+1);
  expect(g.sessionState.learning.words[word]!.learningState).toBe('grounded');
  expect(g.sessionState.learning.words[word]!.evidence.at(-1)).toMatchObject({taskFamilyId:'forest_water_scale_transfer',toolBypass:false,promptLevel:1});
 }
 expect(g.state.nodeMotion).toEqual(motion);expect(g.state.nodeEnergy).toEqual(energy);
 expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(g.sessionState.economy).toEqual(before.economy);
 const done=g.toSave();g.interact('node-material','waterway:tool');predict(g,'short');expect(g.toSave()).toEqual(done);
 expect(ForestEpisode.restore(done).toSave()).toEqual(done);
});
it.each(['short','long'] as const)('mixed route never awards unperformed magic: tool stage %s',toolStage=>{
 const g=ForestEpisode.restore(ready),before=g.sessionState;
 for(const stage of ['short','long'] as const){if(stage===toolStage)g.interact('node-material','waterway:tool');else cast(g,stage);tick(g,180);}
 const performed=toolStage==='short'?'suli':'lili',unperformed=toolStage==='short'?'lili':'suli';
 expect(g.sessionState.learning.words[performed]!.evidence).toHaveLength(before.learning.words[performed]!.evidence.length+1);
 expect(g.sessionState.learning.words[unperformed]).toEqual(before.learning.words[unperformed]);
 expect(g.sessionState.learning.words.telo).toEqual(before.learning.words.telo);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('wrong recall, read-only previews, stale plans and distance cannot spend MP',()=>{
 const g=ForestEpisode.restore(ready),s=g.toSave();
 for(const c of ['waterway:predict:telo suli:narrow','waterway:predict:telo lili:power','waterway:brace','waterway:hint'])g.interact('node-material',c);
 expect(g.toSave()).toEqual(s);predict(g,'short');const before=g.toSave(),p=g.previewNodeWater()!;
 expect(g.toSave()).toEqual(before);expect(g.confirmNodeWater('stale').accepted).toBe(false);
 tick(g,1);expect(g.confirmNodeWater(p.planId).accepted).toBe(false);
 const fresh=g.previewNodeWater()!;approach(g,'node-survey');const far=g.toSave();
 expect(g.confirmNodeWater(fresh.planId).accepted).toBe(false);expect(g.toSave()).toEqual(far);
 expect(g.interact('node-material','waterway:tool').accepted).toBe(false);
});
it('low MP refuses honestly; existing rest route is used in real fixtures, synthetic MP is test-only',()=>{
 const s=structuredClone(ready),session=GameSession.fromSave(s.session),mp=session.snapshot().mp;
 const r=commitSessionProposal(session,{transactionId:'test.water.low',drafts:[{eventId:'test.water.low',type:'mp_replaced',payload:{mp:{...mp,currentMp:5,worldVersion:mp.worldVersion+1}}}]});
 expect(r.committed).toBe(true);s.session=r.session.toSave();const g=ForestEpisode.restore(rehash(s));predict(g,'short');
 const before=g.toSave(),p=g.previewNodeWater()!;expect(p.canConfirm).toBe(false);expect(p.reason).toContain('MP 不足');
 expect(g.confirmNodeWater(p.planId).accepted).toBe(false);expect(g.toSave()).toEqual(before);
 g.interact('node-material','waterway:tool');tick(g,180);expect(g.hasNodeWater('short.completed')).toBe(true);
});
it('freezes away or off-scene, and material experiment reset cannot refund or erase water',()=>{
 const g=ForestEpisode.restore(ready);cast(g,'short');tick(g,20);
 const water=structuredClone(g.state.nodeWater),session=g.toSave().session;g.interact('node-material','experiment:reset');
 expect(g.state.nodeWater).toEqual(water);expect(g.toSave().session).toEqual(session);
 approach(g,'node-survey');const paused=structuredClone(g.state.nodeWater);tick(g,300);expect(g.state.nodeWater).toEqual(paused);
 act(g,'return');const exited=structuredClone(g.state.nodeWater);tick(g,300);expect(g.state.nodeWater).toEqual(exited);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 act(g,'node-road');approach(g,'node-material');tick(g,180);expect(g.hasNodeWater('short.completed')).toBe(true);
});
it('rejects rehashed malformed, unpaid, premature or missing states',()=>{
 for(const run of [null,{version:1,short:{source:'cast',age:0}},{version:1,long:{source:'tool',age:0}}]){
  const s=structuredClone(ready);s.physical.nodeWater=run as never;expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/地下接水/);
 }
 const g=ForestEpisode.restore(ready);cast(g,'short');
 const early=g.toSave();early.physical.nodeWater!.short!.age=180;expect(()=>ForestEpisode.restore(rehash(early))).toThrow(/地下接水/);
 tick(g,180);const changed=g.toSave();changed.physical.nodeWater!.short!.source='tool';expect(()=>ForestEpisode.restore(rehash(changed))).toThrow(/地下接水/);
 const missing=g.toSave();delete missing.physical.nodeWater;expect(()=>ForestEpisode.restore(rehash(missing))).toThrow(/地下接水/);
});
