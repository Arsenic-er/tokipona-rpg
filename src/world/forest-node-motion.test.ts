import {it,expect} from 'vitest';
import {NODE_MOTION,advanceNodeMotion,nodeMotionFrame,nodeMotionVerified,validateNodeMotion,parseNodeMotionPrediction,type NodeMotionState} from './forest-node-motion';
it('both references move continuously together with finite drag',()=>{
 const s:NodeMotionState={version:1,referenceAge:0};
 for(let i=0;i<180;i++){const old=nodeMotionFrame(s);advanceNodeMotion(s);const next=nodeMotionFrame(s);
  expect(next.test).toBe(next.reference);expect(next.test-old.test).toBeGreaterThan(0);expect(next.test-old.test).toBeLessThan(.14);}
 expect(nodeMotionVerified(s)).toBe(false);expect(nodeMotionFrame(s).test).toBeLessThan(24);
});
it('finite left acceleration slows, reverses and then coasts without teleportation',()=>{
 const s:NodeMotionState={version:1,referenceAge:180,castAge:0};let reversed=false;
 for(let i=0;i<180;i++){const old=nodeMotionFrame(s);advanceNodeMotion(s);const next=nodeMotionFrame(s);
  expect(Math.abs(next.test-old.test)).toBeLessThan(.14);
  if(i<24)expect(next.testVelocity).toBeLessThan(old.testVelocity);
  else expect(Math.abs(next.testVelocity)).toBeLessThan(Math.abs(old.testVelocity));
  if(next.testVelocity<0)reversed=true;
  if(i<179)expect(nodeMotionVerified(s)).toBe(false);
 }
 expect(reversed).toBe(true);expect(nodeMotionVerified(s)).toBe(true);
 const done=structuredClone(s);advanceNodeMotion(s);expect(s).toEqual(done);
});
it('reconstructs immutable, bounded frames exactly',()=>{
 const s:NodeMotionState={version:1,referenceAge:180,castAge:61};
 expect(nodeMotionFrame(structuredClone(s))).toEqual(nodeMotionFrame(s));expect(Object.isFrozen(nodeMotionFrame(s))).toBe(true);
 expect(NODE_MOTION.cost).toBe(2);
});
it.each([{version:2,referenceAge:0},{version:1,referenceAge:-1},{version:1,referenceAge:181},
 {version:1,referenceAge:0,castAge:0},{version:1,referenceAge:180,castAge:181},
 {version:1,referenceAge:180,castAge:NaN},{version:1,referenceAge:180,castAge:1,completed:true}])('rejects malformed run %#',s=>{
 expect(()=>validateNodeMotion(s as NodeMotionState)).toThrow(/滑轨/);
});
it('rejects time beyond world age and incomplete/extra expressions',()=>{
 expect(()=>validateNodeMotion({version:1,referenceAge:180},30)).toThrow();
 expect(parseNodeMotionPrediction(' RAIL:PREDICT:ＴＡＷＡ:REVERSE ')).toBe(true);
 for(const x of ['rail:predict:ta:reverse','rail:predict:tawa:same','rail:predict:tawa wawa:reverse'])
  expect(parseNodeMotionPrediction(x)).toBe(false);
});
