import {describe,it,expect} from 'vitest';
import {CisternCalibration,previewCalibration,type CalibrationState} from './forest-cistern-calibration';
import {Material} from '../sim/materials';
const water=(w:CisternCalibration)=>w.cells().filter(x=>x===Material.Water).length;
describe('double calibration valve',()=>{
  it.each(['telo','telo lili','telo suli'] as const)('uses the existing %s cast compiler with honest costs',word=>{
    const {world,plan}=previewCalibration(undefined,word,24,26,[]);
    const before=water(world),r=world.confirm(plan);
    expect(plan.initialVelocityPxPerSecond).toEqual({x:0,y:0});expect(plan.directAttack).toBe(false);
    expect(plan.activationMpRequired).toBe(word==='telo'?5:word==='telo lili'?6:10);
    expect(r.committed).toBe(word!=='telo suli');expect(r.mpCharge).toBe(word==='telo suli'?0:word==='telo'?5:6);
    if(word==='telo suli'){expect(water(world)).toBe(before);return;}
    const n=water(world);for(let i=0;i<180;i++){world.advance();expect(water(world)).toBe(n);}
    expect(world.satisfied).toBe(word==='telo');expect(world.collected).toBe(word==='telo'?96:48);
  });
  it.each(([
    [{at:0,kind:'tool'}],
    [{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'tool'}],
    [{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'cast',expression:'telo'}],
    [{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'cast',expression:'telo lili'}],
  ] as const).map(events=>({events})))('allows physical tool and mixed routes without supplying extra water: %j',({events})=>{
    const age=events.at(-1)!.at+180,state:CalibrationState={version:1,age,events:events.map(e=>({...e}))};
    const w=new CisternCalibration(state);
    expect(w.satisfied).toBe(true);expect(water(w)).toBe(96+events.reduce((n,e)=>n+(e.kind==='cast'?(e.expression==='telo'?96:48):0),0));
    expect(new CisternCalibration(state).cells()).toEqual(w.cells());
  });
  it('reconstructs moving water and quotes the current player MP, not a standalone snapshot',()=>{
    const state:CalibrationState={version:1,age:180,events:[{at:0,kind:'cast',expression:'telo lili'}]};
    const {world,plan}=previewCalibration(state,'telo',4,26,[]);
    expect(plan.quotedCurrentMp).toBe(4);expect(world.confirm(plan).mpCharge).toBe(0);
    expect(plan.rejectionCode).toBe('requested_class_requires_more_mp');
    const a=new CisternCalibration({version:1,age:7,events:[{at:0,kind:'cast',expression:'telo'}]});
    a.advance();expect(a.cells()).toEqual(new CisternCalibration({version:1,age:8,events:[{at:0,kind:'cast',expression:'telo'}]}).cells());
  });
});
