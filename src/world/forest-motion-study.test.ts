import {describe,it,expect} from 'vitest';
import {emptyMotionStudy,advanceMotionStudy,validateMotionStudy,motionVerified,parseMotionPrediction} from './forest-motion-study';
const facts={gate:true,repaired:true,near:true,flow:1,beforeAngle:0,afterAngle:.02};
describe('actual waterwheel movement observation',()=>{
 it('requires both a quarter-turn and 90 real flowing steps, then stops counting',()=>{
  const s=emptyMotionStudy();for(let i=0;i<89;i++)advanceMotionStudy(s,facts);
  expect(motionVerified(s)).toBe(false);advanceMotionStudy(s,facts);expect(motionVerified(s)).toBe(true);
  const done={...s};advanceMotionStudy(s,facts);expect(s).toEqual(done);
 });
 it('ignores coasting with closed gate, dry wheel, unrepaired wheel, distance and negligible motion',()=>{
  for(const change of [{gate:false},{repaired:false},{near:false},{flow:0},{afterAngle:0},{afterAngle:.003}]){
   const s=emptyMotionStudy();advanceMotionStudy(s,{...facts,...change});expect(s).toEqual(emptyMotionStudy());
  }
 });
 it('handles angle wrapping and rejects impossible motion/state',()=>{
  const s=emptyMotionStudy();advanceMotionStudy(s,{...facts,beforeAngle:2*Math.PI-.01,afterAngle:.01});
  expect(s.turn).toBeCloseTo(.02);expect(s.eligibleTicks).toBe(1);
  for(const angle of [-.02,.2,NaN])expect(()=>advanceMotionStudy(emptyMotionStudy(),{...facts,afterAngle:angle})).toThrow();
  for(const change of [{turn:NaN},{eligibleTicks:-1},{eligibleTicks:1.2},{turn:1},{version:2}]){
   expect(()=>validateMotionStudy({...emptyMotionStudy(),...change} as ReturnType<typeof emptyMotionStudy>)).toThrow();
  }
 });
 it('accepts only recalled tawa and this wheel contextual direction, including normalized case',()=>{
  expect(parseMotionPrediction('motion:predict:ＴＡＷＡ:clockwise')).toBe(true);
  for(const s of ['motion:predict:tawa:still','motion:predict:tawa:counterclockwise','motion:predict:telo:clockwise','motion:predict:tawa suli:clockwise'])expect(parseMotionPrediction(s)).toBe(false);
 });
});
