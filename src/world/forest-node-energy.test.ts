import {it,expect} from 'vitest';
import {NODE_ENERGY,advanceNodeEnergy,nodeEnergyFrame,nodeEnergyVerified,validateNodeEnergy,nodeEnergyAccounting,parseNodeEnergyPrediction,type NodeEnergyState} from './forest-node-energy';
it('reference hoists consume equal finite hand-cranked energy, then hold without spending',()=>{
 const s:NodeEnergyState={version:1,referenceAge:0};
 for(let i=0;i<80;i++){const old=nodeEnergyFrame(s);advanceNodeEnergy(s);const f=nodeEnergyFrame(s);
  expect(f.reference).toEqual(f.test);expect(f.test.height-old.test.height).toBe(6/64);
  expect(f.test.input).toBe(f.test.remaining+f.test.work+f.test.loss);expect(f.test.latched).toBe(false);}
 const done=structuredClone(s);advanceNodeEnergy(s);expect(s).toEqual(done);
 expect(nodeEnergyFrame(s).test).toMatchObject({input:640,remaining:0,work:480,loss:160,height:7.5,latched:false});
 expect(nodeEnergyVerified(s)).toBe(false);
});
it('added energy extends work without changing rate or creating energy, and both stop at exhaustion',()=>{
 const s:NodeEnergyState={version:1,referenceAge:80,castAge:0};
 for(let i=0;i<240;i++){const old=nodeEnergyFrame(s);advanceNodeEnergy(s);const f=nodeEnergyFrame(s);
  for(const body of [f.reference,f.test])expect(body.input).toBe(body.remaining+body.work+body.loss);
  expect(f.test.input-f.reference.input).toBe(1280);
  expect(f.test.height-old.test.height).toBe(6/64);
  if(i<80)expect(f.reference.height).toBe(f.test.height);
  else expect(f.reference.height).toBe(old.reference.height);
  expect(f.test.latched).toBe(i>=191);expect(nodeEnergyVerified(s)).toBe(i===239);
 }
 expect(nodeEnergyFrame(s).test).toMatchObject({input:1920,remaining:0,work:1440,loss:480,height:22.5,latched:true});
 const final=structuredClone(s),view=nodeEnergyFrame(s);advanceNodeEnergy(s);expect(s).toEqual(final);expect(nodeEnergyFrame(s)).toEqual(view);
});
it('reconstructs immutable frames exactly and displayed intermediate accounting sums exactly',()=>{
 for(const age of [0,1,37,80,191,192,239,240]){
  const s:NodeEnergyState={version:1,referenceAge:80,castAge:age},f=nodeEnergyFrame(s);
  expect(nodeEnergyFrame(structuredClone(s))).toEqual(f);expect(Object.isFrozen(f)).toBe(true);expect(Object.isFrozen(f.test)).toBe(true);
  const text=nodeEnergyAccounting(s);
  const matches=[...text.matchAll(/输入 ([\d.]+) = 剩余 ([\d.]+) \+ 提升做功 ([\d.]+) \+ 损耗 ([\d.]+)/g)];expect(matches).toHaveLength(2);
  for(const match of matches)
   expect(Number(match[1])).toBe(Number(match[2])+Number(match[3])+Number(match[4]));
 }
 expect(NODE_ENERGY.cost).toBe(2);
});
it.each([null,{version:2,referenceAge:0},{version:1,referenceAge:-1},{version:1,referenceAge:81},
 {version:1,referenceAge:1.5},{version:1,referenceAge:0,castAge:0},{version:1,referenceAge:80,castAge:241},
 {version:1,referenceAge:80,castAge:NaN},{version:1,referenceAge:80,castAge:1,energy:999}])('rejects malformed or fabricated reservoir state %#',s=>{
 expect(()=>validateNodeEnergy(s as NodeEnergyState)).toThrow(/蓄能提升机/);
});
it('checks elapsed time and exact word/meaning rather than partial or combined expressions',()=>{
 expect(()=>validateNodeEnergy({version:1,referenceAge:80},79)).toThrow();
 expect(parseNodeEnergyPrediction(' ENERGY:PREDICT:ＷＡＷＡ:FINITE ')).toBe(true);
 for(const s of ['energy:predict:wa:finite','energy:predict:wawa:forever','energy:predict:tawa:finite','energy:predict:wawa suli:finite'])
  expect(parseNodeEnergyPrediction(s)).toBe(false);
});
