import {beforeAll,describe,it,expect} from 'vitest';
import {ForestEpisode,type ForestEpisodeSave} from './forest-episode';
import {nodeExperimentsReadyFixture} from '../../scripts/testing/forest-node-experiments-fixture';
import {approachEpisode as approach,actEpisode as act,tickEpisode as tick} from '../../scripts/testing/forest-cistern-fixture';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {NODE_EXPERIMENTS} from '../world/forest-node-experiments';
let ready:ForestEpisodeSave;
const rehash=(s:ForestEpisodeSave)=>{const {checksum:_,...body}=s;return {...body,checksum:sha256Canonical(body as unknown as JsonValue)};};
beforeAll(()=>{ready=nodeExperimentsReadyFixture().toSave();},90000);
describe('optional underground apparatus does not mint campaign or language progress',()=>{
 it('preserves an old save exactly on load, read, unknown choices and reset of an untouched instrument',()=>{
  const g=ForestEpisode.restore(ready);expect(g.toSave()).toEqual(ready);
  for(const choice of [undefined,'unknown','experiment:reset'])g.interact('node-gravity',choice);
  expect(g.toSave()).toEqual(ready);expect(g.nodeExperimentNotes).toBe('');
  expect(g.interact('node-time','experiment:anomaly').accepted).toBe(false);expect(g.toSave()).toEqual(ready);
 });
 it.each(['gravity','time'] as const)('%s advances only nearby, restores halfway, completes from motion and resets without changing session',kind=>{
  let g=ForestEpisode.restore(ready);const target=kind==='gravity'?'node-gravity':'node-time';
  approach(g,target);const session=g.toSave().session,oldPhysics=structuredClone(g.state);
  const result=g.interact(target,'experiment:anomaly');expect(result.resumeWorld).toBe(true);
  expect(g.state.nodeExperiments?.[kind]?.age).toBe(0);tick(g,47);
  const halfway=g.toSave();g=ForestEpisode.restore(halfway);expect(g.toSave()).toEqual(halfway);
  const reference=ForestEpisode.restore(halfway);tick(g,40);tick(reference,40);expect(g.toSave()).toEqual(reference.toSave());
  approach(g,'node-survey');const stopped=structuredClone(g.state.nodeExperiments);tick(g,200);
  expect(g.state.nodeExperiments).toEqual(stopped);approach(g,target);tick(g,400);
  expect(g.state.nodeExperiments?.[kind]?.age).toBe(NODE_EXPERIMENTS[kind].ticks);
  expect(g.nodeExperimentNotes).toContain(kind==='gravity'?'上浮':'右摆');
  expect(g.toSave().session).toEqual(session);expect(g.state.allocation).toEqual(oldPhysics.allocation);
  expect(g.state.shardSync).toEqual(oldPhysics.shardSync);expect(g.state.casts).toBe(oldPhysics.casts);
  const completed=g.toSave();expect(ForestEpisode.restore(completed).toSave()).toEqual(completed);
  g.interact(target,'experiment:normal');expect(g.state.nodeExperiments?.[kind]?.age).toBe(0);tick(g,400);
  expect(g.nodeExperimentNotes).toContain(kind==='gravity'?'同向下落':'节奏一致');
  g.interact(target,'experiment:reset');expect(g.state.nodeExperiments).toBeUndefined();expect(g.toSave().session).toEqual(session);
  expect(g.player.grounded).toBe(true);expect(g.player.position.y).toBe(322);
 });
 it('does not finish off-scene, cross-reset another instrument or block the original exit',()=>{
  const g=ForestEpisode.restore(ready);g.interact('node-gravity','experiment:anomaly');tick(g,10);
  act(g,'node-time','experiment:anomaly');tick(g,10);const old=structuredClone(g.state.nodeExperiments?.gravity);
  g.interact('node-time','experiment:reset');expect(g.state.nodeExperiments?.gravity).toEqual(old);
  act(g,'return');expect(g.state.place).toBe('wetland');const stopped=structuredClone(g.state.nodeExperiments);tick(g,400);
  expect(g.state.nodeExperiments).toEqual(stopped);expect(ForestEpisode.restore(g.toSave()).toSave()).toEqual(g.toSave());
  act(g,'node-road');expect(g.state.place).toBe('order-node');expect(g.state.nodeExperiments).toEqual(stopped);
 });
 it('rejects invalid physical save states even with a recalculated outer checksum',()=>{
  for(const state of [{},null,{gravity:{version:1,mode:'anomaly',age:181}},{time:{version:1,mode:'anomaly',age:-1}}]){
   const s=structuredClone(ready);s.physical.nodeExperiments=state as never;
   expect(()=>ForestEpisode.restore(rehash(s))).toThrow(/地下对照/);
  }
 });
});
