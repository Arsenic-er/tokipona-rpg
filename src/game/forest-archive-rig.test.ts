import {it,expect,beforeAll} from 'vitest';
import {archiveRigReadyFixture} from '../../scripts/testing/forest-archive-rig-fixture';
import {tickEpisode as tick,actEpisode as act,approachEpisode as approach} from '../../scripts/testing/forest-cistern-fixture';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {archiveRigFrame} from '../world/forest-archive-rig';
import {GameSession} from '../session/game-session';
import {commitSessionProposal} from '../session/adapters';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave,tools:ForestEpisodeSave,locked:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=archiveRigReadyFixture().toSave();tools=archiveRigReadyFixture(false).toSave();locked=archiveRigReadyFixture(false,false).toSave();},120000);
const couple=(g:ForestEpisode)=>g.interact('node-archive','rig:couple');
const cast=(g:ForestEpisode,word:string,direction=-1)=>{
 const p=g.previewArchiveRig(word,direction);expect(p?.canConfirm).toBe(true);expect(g.confirmArchiveRig(p!.planId,word,direction).accepted).toBe(true);
};
it('does not turn menus or missing water into a connected rig; old saves read unchanged',()=>{
 const g=ForestEpisode.restore(locked),before=g.toSave();g.interact('node-archive','rig:inspect');couple(g);
 expect(g.toSave()).toEqual(before);expect(g.previewArchiveRig('wawa',-1)).toBeNull();expect(ForestEpisode.restore(before).toSave()).toEqual(before);
 const h=ForestEpisode.restore(ready),s=h.toSave();h.interact('node-archive','rig:inspect');expect(h.toSave()).toEqual(s);
});
it('combines real water, timed motion and finite input; collection is explicit and idempotent',()=>{
 let g=ForestEpisode.restore(ready),before=g.sessionState,water=structuredClone(g.state.nodeWater),energy=structuredClone(g.state.nodeEnergy),motion=structuredClone(g.state.nodeMotion);
 couple(g);cast(g,'tawa');tick(g,23);expect(archiveRigFrame(g.state.archiveRig!).gear).toBe(1);
 const mid=g.toSave();g=ForestEpisode.restore(mid);expect(g.toSave()).toEqual(mid);tick(g,1);cast(g,'wawa');tick(g,100);
 expect(g.archiveRigStatus).toBe('moving');const paid=g.toSave();g=ForestEpisode.restore(paid);tick(g,28);
 expect(g.archiveRigStatus).toBe('delivered');expect(g.hasArchiveRig('collected')).toBe(false);
 expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-4);expect(archiveRigFrame(g.state.archiveRig!)).toMatchObject({remaining:256,loss:256,work:768});
 expect(g.interact('node-archive','rig:take').text).toContain('不会增加三路可分配的水');expect(g.archiveRigStatus).toBe('recorded');
 expect(g.sessionState.learning).toEqual(before.learning);expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(g.sessionState.economy).toEqual(before.economy);
 expect(g.state.nodeWater).toEqual(water);expect(g.state.nodeEnergy).toEqual(energy);expect(g.state.nodeMotion).toEqual(motion);
 const done=g.toSave();g.interact('node-archive','rig:take');g.interact('node-archive','rig:winch');couple(g);
 expect(g.toSave()).toEqual(done);expect(ForestEpisode.restore(done).toSave()).toEqual(done);
});
it('wrong direction consumes finite energy but manual rescue needs no refund or new language credit',()=>{
 const g=ForestEpisode.restore(ready),before=g.sessionState;couple(g);cast(g,'wawa');tick(g,160);cast(g,'tawa',1);tick(g,24);
 expect(g.archiveRigStatus).toBe('stalled');expect(archiveRigFrame(g.state.archiveRig!)).toMatchObject({loss:1280,remaining:0,position:64});
 g.interact('node-archive','rig:winch');tick(g,128);expect(g.archiveRigStatus).toBe('delivered');
 expect(g.sessionState.mp.currentMp).toBe(before.mp.currentMp-4);expect(g.sessionState.learning).toEqual(before.learning);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('all-tool water and winching retrieve the same appendix without words, payment or capacity',()=>{
 const g=ForestEpisode.restore(tools),before=g.sessionState;couple(g);
 expect(g.previewArchiveRig('wawa',-1)?.canConfirm).toBe(false);g.interact('node-archive','rig:winch');tick(g,128);g.interact('node-archive','rig:take');
 expect(g.archiveRigStatus).toBe('recorded');expect(g.sessionState.mp).toEqual(before.mp);expect(g.sessionState.learning).toEqual(before.learning);
 expect(g.sessionState.capabilities).toEqual(before.capabilities);expect(archiveRigFrame(g.state.archiveRig!)).toMatchObject({handInput:1024,magicInput:0});
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
});
it('rejects unknown combinations, changed directions, stale or distant confirmations without payment',()=>{
 const g=ForestEpisode.restore(ready);couple(g);const before=g.toSave();
 for(const expr of ['telo','tawa wawa','suli',''])expect(g.previewArchiveRig(expr,-1)!.canConfirm).toBe(false);
 expect(g.previewArchiveRig('tawa',0)!.canConfirm).toBe(false);expect(g.toSave()).toEqual(before);
 const p=g.previewArchiveRig('tawa',-1)!;expect(g.confirmArchiveRig(p.planId,'tawa',1).accepted).toBe(false);
 tick(g,1);expect(g.confirmArchiveRig(p.planId,'tawa',-1).accepted).toBe(false);
 const fresh=g.previewArchiveRig('wawa',-1)!;approach(g,'node-survey');const far=g.toSave();
 expect(g.confirmArchiveRig(fresh.planId,'wawa',-1).accepted).toBe(false);expect(g.toSave()).toEqual(far);
 expect(g.interact('node-archive','rig:winch').accepted).toBe(false);
});
it('freezes away and off scene, while old resets do not undo paid inputs',()=>{
 const g=ForestEpisode.restore(ready);couple(g);cast(g,'wawa');tick(g,10);approach(g,'node-survey');
 const paused=structuredClone(g.state.archiveRig);tick(g,400);expect(g.state.archiveRig).toEqual(paused);
 act(g,'node-conservation','experiment:reset');act(g,'return');const exited=structuredClone(g.state.archiveRig);tick(g,400);expect(g.state.archiveRig).toEqual(exited);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());act(g,'node-road');act(g,'node-archive','rig:winch');tick(g,180);
 expect(g.archiveRigStatus).toBe('delivered');
});
it('refuses insufficient MP and keeps an immediate mechanical recovery; low MP is synthetic only',()=>{
 const s=structuredClone(ready),session=GameSession.fromSave(s.session),mp=session.snapshot().mp;
 const r=commitSessionProposal(session,{transactionId:'test.rig.low',drafts:[{eventId:'test.rig.low',type:'mp_replaced',payload:{mp:{...mp,currentMp:1,worldVersion:mp.worldVersion+1}}}]});
 expect(r.committed).toBe(true);s.session=r.session.toSave();const g=ForestEpisode.restore(rehash(s));couple(g);
 const before=g.toSave(),p=g.previewArchiveRig('wawa',-1)!;expect(p.canConfirm).toBe(false);expect(g.confirmArchiveRig(p.planId,'wawa',-1).accepted).toBe(false);
 expect(g.toSave()).toEqual(before);g.interact('node-archive','rig:winch');tick(g,128);expect(g.archiveRigStatus).toBe('delivered');expect(g.sessionState.mp.currentMp).toBe(1);
});
it('rejects missing, null, unpaid and altered motion records even with a new save checksum',()=>{
 for(const value of [null,{version:1,age:0,events:[]},{version:1,age:0,events:[{at:0,kind:'energy'}]}]){
  const s=structuredClone(ready);s.physical.archiveRig=value as never;expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/档案取回架/);
 }
 const g=ForestEpisode.restore(ready);couple(g);cast(g,'tawa');tick(g,12);
 const tampered=g.toSave();tampered.physical.archiveRig!.events[0]!.direction=1;expect(()=>ForestEpisode.restore(rehash(tampered))).toThrow(/档案取回架/);
 const missing=g.toSave();delete missing.physical.archiveRig;expect(()=>ForestEpisode.restore(rehash(missing))).toThrow(/档案取回架/);
});
