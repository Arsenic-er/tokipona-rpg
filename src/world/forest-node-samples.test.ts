import {describe,it,expect} from 'vitest';
import {SAMPLE_EXPERIMENT,sampleExperimentView,sampleExperimentSummary,type SampleExperiment} from './forest-node-samples';
import {validateNodeExperiments,type NodeExperimentRun} from './forest-node-experiments';
const kinds:SampleExperiment[]=['material','conservation'];
describe('finite underground material and conservation samples',()=>{
 it.each(kinds)('%s preserves all identities and unique in-bounds cells at every step in both modes',kind=>{
  for(const mode of ['normal','anomaly'] as const)for(let age=0;age<=240;age++){
   const run={version:1,mode,age} as const,v=sampleExperimentView(kind,run);
   expect(v.finished).toBe(age===240);
   for(const c of [v.left,v.right]){
    expect([...c.particles.map(p=>p.id),...c.held].sort((a,b)=>a-b)).toEqual(Array.from({length:16},(_,i)=>i));
    expect(new Set(c.particles.map(p=>p.y*13+p.x)).size).toBe(c.particles.length);
    for(const p of c.particles){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThan(13);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThan(27);}
    expect(c.received+c.held.length).toBeLessThanOrEqual(SAMPLE_EXPERIMENT.count);
   }
   if(mode==='normal')expect(v.left).toEqual(v.right);
   expect(v.left).toEqual(sampleExperimentView(kind,{version:1,mode:'normal',age}).left);
  }
 });
 it('stone supports normal clay and only the abnormal right stone loses support',()=>{
  for(let age=0;age<=240;age++){
   const v=sampleExperimentView('material',{version:1,mode:'anomaly',age});
   expect(v.left.particles.every(p=>p.y<13)).toBe(true);expect(v.right.held).toEqual([]);
  }
  const v=sampleExperimentView('material',{version:1,mode:'anomaly',age:240});
  expect(v.left.aboveShelf).toBe(16);expect(v.left.belowShelf).toBe(0);
  expect(v.right.aboveShelf).toBe(0);expect(v.right.belowShelf).toBe(16);
 });
 it('water transfers only on physically crossing the abnormal band; visible and isolated batches still sum to sixteen',()=>{
  let prev=sampleExperimentView('conservation',{version:1,mode:'anomaly',age:0}).right;
  for(let age=1;age<=240;age++){
   const curr=sampleExperimentView('conservation',{version:1,mode:'anomaly',age}).right;
   for(const id of curr.held.filter(id=>!prev.held.includes(id))){
    expect(id%3).toBe(0);expect(prev.particles.find(p=>p.id===id)?.y).toBe(12);
   }
   for(const p of curr.particles){const before=prev.particles.find(a=>a.id===p.id)!;
    expect(Math.abs(p.x-before.x)).toBeLessThanOrEqual(1);expect(p.y-before.y).toBeGreaterThanOrEqual(0);expect(p.y-before.y).toBeLessThanOrEqual(1);
   }
   prev=curr;
  }
  expect(prev.received).toBe(10);expect(prev.held).toHaveLength(6);expect(prev.received+prev.held.length).toBe(16);
 });
 it.each(kinds)('%s reconstructs intermediate cells exactly and returns deeply immutable frames',kind=>{
  const run:NodeExperimentRun={version:1,mode:'anomaly',age:47},copy=JSON.parse(JSON.stringify(run));
  const a=sampleExperimentView(kind,run),b=sampleExperimentView(kind,copy);
  expect(a).toEqual(b);expect(()=>{(a.right.particles[0] as {x:number}).x=999;}).toThrow();
  expect(()=>{(a.right.held as number[]).push(999);}).toThrow();
  expect(sampleExperimentView(kind,{version:1,mode:'normal',age:2})).toEqual(sampleExperimentView(kind));
  expect(sampleExperimentView(kind,{version:1,mode:'normal',age:3})).not.toEqual(sampleExperimentView(kind));
 });
 it('only an explicitly inspected completed conservation run reveals the full accounting',()=>{
  const run:NodeExperimentRun={version:1,mode:'anomaly',age:240};
  expect(sampleExperimentSummary('conservation',run)).toContain('先打开');
  expect(sampleExperimentSummary('conservation',run)).not.toContain('隔离仓：左');
  expect(sampleExperimentSummary('conservation',{...run,ledgerOpen:true})).toContain('右 6');
  expect(sampleExperimentSummary('conservation',{...run,ledgerOpen:true})).toContain('不是凭空造水或湮灭');
  expect(sampleExperimentSummary('conservation',{...run,mode:'normal',ledgerOpen:true})).toContain('两槽收支一致');
 });
 it.each([-1,.5,241,NaN,Infinity])('rejects invalid sample age %s',age=>{
  expect(()=>sampleExperimentView('material',{version:1,mode:'normal',age})).toThrow();
  expect(()=>validateNodeExperiments({conservation:{version:1,mode:'normal',age}},999)).toThrow();
 });
 it('rejects forged early or cross-instrument ledger state and accepts unchanged legacy runs',()=>{
  for(const kind of ['gravity','time','material','conservation'] as const){
   expect(()=>validateNodeExperiments({[kind]:{version:1,mode:'anomaly',age:10,ledgerOpen:true}},999)).toThrow();
  }
  expect(()=>validateNodeExperiments({conservation:{version:1,mode:'anomaly',age:240,ledgerOpen:false} as never},999)).toThrow();
  expect(()=>validateNodeExperiments({conservation:{version:1,mode:'anomaly',age:240,ledgerOpen:true}},999)).not.toThrow();
  expect(()=>validateNodeExperiments({gravity:{version:1,mode:'anomaly',age:90},time:{version:1,mode:'normal',age:180}},999)).not.toThrow();
 });
});
