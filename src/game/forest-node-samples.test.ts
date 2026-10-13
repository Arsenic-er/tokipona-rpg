import {beforeAll,it,expect} from 'vitest';
import {epilogueReadyFixture} from '../../scripts/testing/forest-epilogue-fixture';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {nodeExperimentsReadyFixture} from '../../scripts/testing/forest-node-experiments-fixture';
import {approachEpisode as approach,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sampleExperimentView} from '../world/forest-node-samples';
import {sha256Canonical,type JsonValue} from '../canonical-json';
let ready:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=nodeExperimentsReadyFixture().toSave();},90000);
it.each(['material','conservation'] as const)('%s needs real proximity, pauses away, restores and resets without campaign mutations',kind=>{
 let g=ForestEpisode.restore(ready);const target=kind==='material'?'node-material':'node-conservation',initial=g.toSave();
 expect(g.interact(target,'experiment:anomaly').accepted).toBe(false);expect(g.toSave()).toEqual(initial);
 approach(g,target);const baseline=g.toSave();
 for(const c of [undefined,'experiment:ledger','unknown','experiment:reset'])g.interact(target,c);
 expect(g.toSave()).toEqual(baseline);
 expect(g.interact(target,'experiment:anomaly').resumeWorld).toBe(true);tick(g,47);
 const half=g.toSave(),replay=ForestEpisode.restore(half);g=ForestEpisode.restore(half);
 expect(g.toSave()).toEqual(half);tick(g,20);tick(replay,20);expect(g.toSave()).toEqual(replay.toSave());
 approach(g,'node-survey');const paused=structuredClone(g.state.nodeExperiments);tick(g,300);
 expect(g.state.nodeExperiments).toEqual(paused);approach(g,target);tick(g,300);
 expect(g.state.nodeExperiments?.[kind]?.age).toBe(240);
 expect(g.toSave().session).toEqual(baseline.session);expect(g.state.casts).toBe(baseline.physical.casts);
 expect(g.nodeExperimentNotes).toContain(kind==='material'?'右槽板上 0、板下 16':'右侧 10');
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
 g.interact(target,'experiment:reset');expect(g.state.nodeExperiments).toBeUndefined();
 expect(g.toSave().session).toEqual(baseline.session);expect(g.player.grounded).toBe(true);
 expect(g.player.position.y).toBe(322);
});
it('ledger inspection requires a completed water run, is idempotent, and does not alter its particles',()=>{
 const g=ForestEpisode.restore(ready);act(g,'node-conservation','experiment:ledger');
 expect(g.state.nodeExperiments).toBeUndefined();
 g.interact('node-conservation','experiment:anomaly');tick(g,10);const early=g.toSave();
 g.interact('node-conservation','experiment:ledger');expect(g.toSave()).toEqual(early);
 tick(g,240);const before=g.toSave(),cells=sampleExperimentView('conservation',g.state.nodeExperiments!.conservation);
 const r=g.interact('node-conservation','experiment:ledger');expect(r.text).toContain('右 6');
 expect(g.state.nodeExperiments?.conservation?.ledgerOpen).toBe(true);
 expect(sampleExperimentView('conservation',g.state.nodeExperiments!.conservation)).toEqual(cells);
 expect(g.toSave().session).toEqual(before.session);
 const checked=g.toSave();g.interact('node-conservation','experiment:ledger');expect(g.toSave()).toEqual(checked);
 expect(ForestEpisode.restore(checked).toSave()).toEqual(checked);
 g.interact('node-conservation','experiment:normal');expect(g.state.nodeExperiments?.conservation?.ledgerOpen).toBeUndefined();
 tick(g,240);expect(g.interact('node-conservation','experiment:ledger').text).toContain('两槽收支一致');
});
it('resets just the selected instrument and freezes the others on the existing wetland route',()=>{
 const g=ForestEpisode.restore(ready);g.interact('node-gravity','experiment:anomaly');tick(g,10);
 act(g,'node-time','experiment:normal');tick(g,10);act(g,'node-material','experiment:anomaly');tick(g,10);
 act(g,'node-conservation','experiment:anomaly');tick(g,10);const all=structuredClone(g.state.nodeExperiments)!;
 g.interact('node-conservation','experiment:reset');
 expect(g.state.nodeExperiments).toEqual({gravity:all.gravity,time:all.time,material:all.material});
 act(g,'return');const away=structuredClone(g.state.nodeExperiments);tick(g,300);expect(g.state.nodeExperiments).toEqual(away);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());act(g,'node-road');expect(g.state.place).toBe('order-node');
});
it('keeps a completed epilogue and its resources while using new instruments after revisiting',async()=>{
 const g=epilogueReadyFixture();
 g.interact('node-exit','epilogue:review');g.interact('node-exit','epilogue:seal');g.interact('node-exit','epilogue:depart');
 act(g,'worker','lead:report');await g.confirmEpilogueReturn();expect(g.returnObserved).toBe(true);
 act(g,'archive-road');act(g,'node-material');const session=g.toSave().session;
 g.interact('node-material','experiment:anomaly');tick(g,240);
 act(g,'node-conservation','experiment:anomaly');tick(g,240);g.interact('node-conservation','experiment:ledger');
 expect(g.toSave().session).toEqual(session);expect(g.returnObserved).toBe(true);expect(g.epilogueSealed).toBe(true);
 expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
},90000);
it('rejects rehashed early or misplaced ledger claims',()=>{
 for(const [kind,age] of [['conservation',239],['material',240]] as const){
  const s=structuredClone(ready);s.physical.nodeExperiments={[kind]:{version:1,mode:'anomaly',age,ledgerOpen:true}};
  expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/地下对照/);
 }
});
