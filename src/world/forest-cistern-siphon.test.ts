import {describe,it,expect} from 'vitest';
import {CisternSiphon,previewSiphon,type SiphonState,type SiphonEvent} from './forest-cistern-siphon';
import {Material} from '../sim/materials';
const count=(w:CisternSiphon)=>w.cells().filter(c=>c===Material.Water).length;
describe('high siphon finite tank',()=>{
  it.each(['telo lili','telo','telo suli'] as const)('separates distance from language and conserves %s water',word=>{
    const w=new CisternSiphon(undefined,24,26),p=w.preview(word),before=count(w);
    expect(before).toBe(192);expect(p.canConfirm).toBe(true);
    expect(p.execution.geometry.worldPixelGeometry.fixedCrossSectionWidthPx).toBe(12);
    const r=w.confirm(p,true);expect(r.committed).toBe(true);
    expect(w.tankReleased).toBe(word==='telo suli');expect(w.satisfied).toBe(false);
    const mass=count(w);expect(mass).toBe(192+(word==='telo'?96:word==='telo lili'?48:192));
    for(let i=0;i<180;i++){w.advance();expect(count(w)).toBe(mass);}
    expect(w.satisfied).toBe(word==='telo suli');
    if(word!=='telo suli')expect(w.collected).toBe(0);
  });
  it('blocks unsupported long casts and does not spend MP or create water',()=>{
    const w=new CisternSiphon(undefined,24,26),p=w.preview('telo suli'),cells=w.cells();
    expect(w.confirm(p,false).committed).toBe(false);expect(w.cells()).toEqual(cells);
    expect(w.preview('telo suli').planId).toBe(p.planId);
    expect(w.confirm(p,true).committed).toBe(true);
    expect(w.confirm(p,true).committed).toBe(false);
  });
  it('quotes actual MP after replay and preserves native living-safety rejection',()=>{
    const s:SiphonState={version:1,age:180,events:[{at:0,kind:'cast',expression:'telo',braced:false}]};
    const low=previewSiphon(s,'telo suli',9,26,[]);expect(low.plan.quotedCurrentMp).toBe(9);expect(low.plan.canConfirm).toBe(false);
    const blocked=previewSiphon(undefined,'telo suli',20,26,[{entityId:'player',boundsPx:{x:38,y:18,width:12,height:14}}]);
    expect(blocked.plan.canConfirm).toBe(false);
    expect(blocked.world.confirm(blocked.plan,true,[{entityId:'player',boundsPx:{x:38,y:18,width:12,height:14}}]).committed).toBe(false);
    expect(count(blocked.world)).toBe(192);
  });
  it.each([
    [{at:0,kind:'tool'}],
    [{at:0,kind:'cast',expression:'telo',braced:false},{at:180,kind:'cast',expression:'telo suli',braced:true}],
    [{at:0,kind:'cast',expression:'telo lili',braced:false},{at:180,kind:'cast',expression:'telo',braced:false},{at:360,kind:'tool'}],
  ] as SiphonEvent[][])('keeps a deterministic recovery route %#',(...events)=>{
    const s:SiphonState={version:1,age:events.at(-1)!.at+180,events},w=new CisternSiphon(s);
    expect(w.satisfied).toBe(true);
    expect(count(w)).toBe(192+events.reduce((n,e)=>n+(e.kind==='tool'?0:e.expression==='telo'?96:e.expression==='telo lili'?48:192),0));
    expect(new CisternSiphon(s).cells()).toEqual(w.cells());
    const mid={...s,age:events.at(-1)!.at+7},m=new CisternSiphon(mid);m.advance();
    expect(new CisternSiphon({...mid,age:mid.age+1}).cells()).toEqual(m.cells());
  });
  it('rejects malformed, unsupported or post-success timelines',()=>{
    for(const events of [
      [{at:0,kind:'cast',expression:'telo suli',braced:false}],
      [{at:0,kind:'tool'},{at:180,kind:'tool'}],
      [{at:0,kind:'cast',expression:'telo suli',braced:true},{at:180,kind:'tool'}],
    ])expect(()=>new CisternSiphon({version:1,age:180,events:events as SiphonEvent[]})).toThrow();
  });
});
