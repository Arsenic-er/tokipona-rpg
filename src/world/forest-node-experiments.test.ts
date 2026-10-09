import {describe,it,expect} from 'vitest';
import {NODE_EXPERIMENTS,beginNodeExperiment,advanceNodeExperiment,nodeExperimentView,nodeExperimentSummary,validateNodeExperiments,type NodeExperiment,type NodeExperimentRun} from './forest-node-experiments';
const kinds:NodeExperiment[]=['gravity','time'];
describe('sealed underground fixed-step comparisons',()=>{
 it.each(kinds)('%s normal chambers follow identical actual trajectories',kind=>{
  const r=beginNodeExperiment('normal'),initial=nodeExperimentView(kind,r).left.offset;
  let moved=false;
  for(let i=0;i<=NODE_EXPERIMENTS[kind].ticks;i++){
   const v=nodeExperimentView(kind,r);expect(v.left).toEqual(v.right);
   moved ||= v.left.offset!==initial;
   expect(v.finished).toBe(i===NODE_EXPERIMENTS[kind].ticks);advanceNodeExperiment(kind,r);
  }
  expect(moved).toBe(true);const done=structuredClone(r);advanceNodeExperiment(kind,r);expect(r).toEqual(done);
 });
 it('gravity reverses only the right sealed chamber and both bobs remain inside the stops',()=>{
  const r=beginNodeExperiment('anomaly');
  for(let i=0;i<180;i++){
   advanceNodeExperiment('gravity',r);const v=nodeExperimentView('gravity',r);
   expect(v.right.offset).toBeCloseTo(-v.left.offset,10);
   expect(v.right.velocity).toBeCloseTo(-v.left.velocity,10);
   expect(v.left.offset).toBeGreaterThanOrEqual(0);expect(v.left.offset).toBeLessThanOrEqual(15);
   expect(v.right.offset).toBeGreaterThanOrEqual(-15);
  }
  const v=nodeExperimentView('gravity',r);expect(v.left.offset).toBe(15);expect(v.right.offset).toBe(-15);
  expect(Math.abs(v.left.velocity)).toBeLessThan(1);expect(nodeExperimentSummary('gravity',r)).toContain('上浮');
 });
 it('equal pendulums diverge in local rate, not through a prewritten count or global tick change',()=>{
  const r=beginNodeExperiment('anomaly');let previous=nodeExperimentView('time',r);
  const count={left:0,right:0};
  for(let i=0;i<360;i++){
   advanceNodeExperiment('time',r);const v=nodeExperimentView('time',r);
   for(const side of ['left','right'] as const){
    if(previous[side].offset*v[side].offset<0)count[side]++;
    expect(v[side].crossings).toBe(count[side]);expect(Math.abs(v[side].offset)).toBeLessThanOrEqual(.61);
   }
   previous=v;
  }
  expect(count.left).toBeGreaterThanOrEqual(7);expect(count.right).toBeGreaterThanOrEqual(2);
  expect(count.left).toBeGreaterThan(count.right*2);expect(nodeExperimentView('time',r).finished).toBe(true);
 });
 it.each(kinds)('%s restores the exact intermediate trajectory and isolates the cached output',kind=>{
  const r=beginNodeExperiment('anomaly');for(let i=0;i<47;i++)advanceNodeExperiment(kind,r);
  const s=JSON.parse(JSON.stringify(r)) as NodeExperimentRun;expect(nodeExperimentView(kind,s)).toEqual(nodeExperimentView(kind,r));
  expect(()=>{(nodeExperimentView(kind,r).left as {offset:number}).offset=999;}).toThrow();
  for(let i=0;i<500;i++){advanceNodeExperiment(kind,r);advanceNodeExperiment(kind,s);}
  expect(nodeExperimentView(kind,s)).toEqual(nodeExperimentView(kind,r));
  expect(nodeExperimentView(kind,beginNodeExperiment('normal')).finished).toBe(false);
 });
 it.each([null,[],{}, {wrong:{version:1,mode:'normal',age:0}}, {gravity:null},
  {gravity:{version:2,mode:'normal',age:0}}, {gravity:{version:1,mode:'unknown',age:0}},
  ...[-1,.5,181,Infinity,NaN].map(age=>({gravity:{version:1,mode:'normal',age}})),
  {time:{version:1,mode:'normal',age:361}}])('rejects malformed run %#',bad=>{
   expect(()=>validateNodeExperiments(bad as never,999)).toThrow(/地下对照/);
 });
 it('rejects impossible elapsed history and does not mutate on projection',()=>{
  const r=beginNodeExperiment('normal');r.age=20;
  expect(()=>validateNodeExperiments({gravity:r},19)).toThrow();
  const old=structuredClone(r);nodeExperimentView('gravity',r);nodeExperimentSummary('gravity',r);expect(r).toEqual(old);
  expect(nodeExperimentSummary('gravity',r)).toContain('正在对照');
 });
});
