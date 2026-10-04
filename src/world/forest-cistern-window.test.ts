import { describe, expect, it } from 'vitest';
import { CisternWindow, WINDOW_EXPRESSIONS, windowPreview, executeWindowCast, CISTERN_WINDOW, type CisternWindowState } from './forest-cistern-window';
import { Material } from '../sim/materials';
const count=(w:CisternWindow)=>w.cells().filter(c=>c===Material.Water).length;
describe('precision window shares the existing length compiler and water physics',()=>{
  it('quotes 1/2/4 tile geometry, fixed cross-section and MP; obstructed previews never charge',()=>{
    for(const [i,word] of WINDOW_EXPRESSIONS.entries()){
      const p=windowPreview(word,24,24), result=executeWindowCast(word,24,24,[]);
      expect(p.activationMpRequired).toBe([6,5,10][i]);
      expect(p.requestedLengthClass).toBe(['short','default','long'][i]);
      expect(p.initialVelocityPxPerSecond).toEqual({x:0,y:0});expect(p.directAttack).toBe(false);
      expect(p.canConfirm).toBe(i===0);expect(result.paid).toBe(i===0?6:0);
      if(i===0)expect(p.execution.geometry.worldPixelGeometry).toMatchObject({realizedLengthPx:16,fixedCrossSectionWidthPx:12});
      else expect(p.rejectionCode).toBe('requested_class_cannot_be_realized_here');
    }
  });
  it('rejects insufficient MP and living safety overlap without mutation',()=>{
    expect(executeWindowCast('telo lili',5.5,26,[])).toMatchObject({committed:false,paid:0});
    expect(executeWindowCast('telo lili',24,26,[{entityId:'test',boundsPx:{x:26,y:12,width:4,height:4}}])).toMatchObject({committed:false,paid:0});
  });
  it.each(['cast','bypass'] as const)('%s needs actual falling water and reconstructs exactly without creating water',source=>{
    const state:CisternWindowState={source,age:0},w=new CisternWindow(state);
    expect(w.satisfied).toBe(false);const initial=count(w);expect(initial).toBe(source==='cast'?96:48);
    for(let i=1;i<=CISTERN_WINDOW.settleTicks;i++){
      w.advance();state.age=i;expect(count(w)).toBe(initial);
      if([1,7,31,180].includes(i))expect(new CisternWindow(state).cells()).toEqual(w.cells());
    }
    expect(w.satisfied).toBe(true);expect(w.collected).toBeGreaterThanOrEqual(12);
  });
  it('rejects invalid reconstruction ages and sources',()=>{
    for(const state of [{source:'cast',age:-1},{source:'bypass',age:181},{source:'cast',age:.5},{source:'unknown',age:0}]){
      expect(()=>new CisternWindow(state as CisternWindowState)).toThrow();
    }
  });
});
