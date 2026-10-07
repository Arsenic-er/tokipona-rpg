import {describe,it,expect} from 'vitest';
import {LENGTH_WORDS,LengthStudyWorld,previewLengthStudy,executeLengthStudy,parseLengthPrediction,validateLengthStudy,lengthCost} from './forest-length-study';
import {Material} from '../sim/materials';
describe('isolated length study with existing water geometry',()=>{
 it.each(LENGTH_WORDS)('%s: exact paid geometry, real falling water, conservation and deterministic restore',w=>{
  const p=previewLengthStudy(w,20,26,[]);expect(p.canConfirm).toBe(true);expect(p.activationMpRequired).toBe(lengthCost(w));
  expect(p.execution.geometry.realizedLengthPx).toBe(w==='lili'?16:64);
  expect(p.execution.geometry.fixedCrossSectionWidthPx).toBe(12);
  expect(executeLengthStudy(w,20,26,[],true)).toEqual({committed:true,paid:lengthCost(w)});
  const before=new LengthStudyWorld(w),world=new LengthStudyWorld(w,{age:0});
  expect(world.satisfied).toBe(false);
  const total=world.cells().filter(c=>c===Material.Water).length;
  expect(total-before.cells().filter(c=>c===Material.Water).length).toBe(w==='lili'?48:192);
  for(let i=0;i<13;i++)world.advance();expect(world.cells()).toEqual(new LengthStudyWorld(w,{age:13}).cells());
  for(let i=13;i<180;i++)world.advance();expect(world.satisfied).toBe(true);
  expect(world.cells().filter(c=>c===Material.Water)).toHaveLength(total);
  expect(world.cells()).toEqual(new LengthStudyWorld(w,{age:180}).cells());
 });
 it('never shortens an unaffordable cast and requires support and living safety',()=>{
  for(const w of LENGTH_WORDS){
   expect(previewLengthStudy(w,lengthCost(w)-1,26,[]).canConfirm).toBe(false);
   expect(executeLengthStudy(w,lengthCost(w)-1,26,[],true).committed).toBe(false);
   const zones=[{entityId:'player',boundsPx:{x:20,y:10,width:12,height:14}}];
   expect(executeLengthStudy(w,26,26,zones,true).committed).toBe(false);
  }
  expect(executeLengthStudy('suli',26,26,[],false)).toEqual({committed:false,paid:0});
 });
 it('normalizes user recall but rejects wrong head, modifier, effect and malformed saved ages',()=>{
  expect(parseLengthPrediction('lili','length:predict:ＴＥＬＯ   ＬＩＬＩ:short')).toBe(true);
  for(const s of ['length:predict:telo suli:short','length:predict:telo lili:power','length:predict:lili:short','length:predict:telo lili suli:short'])
   expect(parseLengthPrediction('lili',s)).toBe(false);
  for(const age of [-1,181,.5,NaN])expect(()=>validateLengthStudy({version:1,view:'lili',lili:{age}})).toThrow();
 });
});
