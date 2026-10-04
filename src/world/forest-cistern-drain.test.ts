import {describe,it,expect} from 'vitest';
import {CisternCalibration,type CalibrationState,type CalibrationEvent} from './forest-cistern-calibration';
import {Material} from '../sim/materials';
const count=(w:CisternCalibration)=>w.cells().filter(c=>c===Material.Water).length;
describe('separated calibration intake and recovery trough',()=>{
  it.each(['telo','telo lili','telo suli'] as const)('routes actual %s water and conserves every cell',word=>{
    const w=new CisternCalibration(undefined,24,26,2),plan=w.preview(word),initial=count(w),r=w.confirm(plan);
    expect(initial).toBe(96);expect(r.committed).toBe(word!=='telo suli');
    expect(w.diverted).toBe(word==='telo');const mass=count(w);
    for(let t=0;t<180;t++){w.advance();expect(count(w)).toBe(mass);}
    expect(mass).toBe(96+(word==='telo'?96:word==='telo lili'?48:0));
    expect(w.satisfied).toBe(word==='telo');
    if(word==='telo')expect(w.collected).toBeGreaterThanOrEqual(77);else expect(w.collected).toBe(0);
  });
  const routes:{label:string;events:CalibrationEvent[];filled:boolean}[]=[
    {label:'tank only',events:[{at:0,kind:'tool'}],filled:true},
    {label:'short then tool',events:[{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'tool'}],filled:true},
    {label:'short then default',events:[{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'cast',expression:'telo'}],filled:true},
    {label:'two sequential short pulses',events:[{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'cast',expression:'telo lili'}],filled:false},
    {label:'two short failures then tool',events:[{at:0,kind:'cast',expression:'telo lili'},{at:180,kind:'cast',expression:'telo lili'},{at:360,kind:'tool'}],filled:true},
  ];
  it.each(routes)('$label remains a physical route, not a flag-only outcome',({events,filled})=>{
    const state:CalibrationState={version:2,age:events.at(-1)!.at+180,events};
    const w=new CisternCalibration(state);
    expect(w.satisfied).toBe(filled);
    expect(count(w)).toBe(96+events.reduce((n,e)=>n+(e.kind==='cast'?(e.expression==='telo'?96:48):0),0));
    expect(new CisternCalibration(state).cells()).toEqual(w.cells());
    if(!filled){expect(w.collected).toBeLessThan(77);expect(w.diverted).toBe(false);}
  });
  it('reconstructs the intake and moving water without replaying a player resource transaction',()=>{
    for(const word of ['telo','telo lili'] as const){
      const s:CalibrationState={version:2,age:7,events:[{at:0,kind:'cast',expression:word}]};
      const w=new CisternCalibration(s),r=new CisternCalibration({...s,age:8});w.advance();
      expect(w.cells()).toEqual(r.cells());expect(w.diverted).toBe(r.diverted);
    }
  });
});
