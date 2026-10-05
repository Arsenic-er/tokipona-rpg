import {describe,it,expect} from 'vitest';
import {emptyReturnChannel,advanceReturnChannel,returnChannelFacts,validateReturnChannel,returnChannelRates,type ReturnChannelControls} from './forest-return-channel';
import {returnFlowWorldReady} from '../game/return-flow-predicates';
const repaired:ReturnChannelControls={gate:true,sealed:true,cleared:true};
const ready=(s:ReturnType<typeof emptyReturnChannel>,c=repaired)=>returnFlowWorldReady('return_flow.repair_overflow',returnChannelFacts(s,c));
const run=(s:ReturnType<typeof emptyReturnChannel>,c:ReturnChannelControls,n=900)=>{for(let i=0;i<n;i++)advanceReturnChannel(s,c);};
describe('return-channel metered water and world predicates',()=>{
  it('requires actual transport, not just three repaired controls',()=>{
    const s=emptyReturnChannel();expect(ready(s)).toBe(false);run(s,repaired,120);expect(ready(s)).toBe(false);
    run(s,repaired);expect(ready(s)).toBe(true);expect(returnChannelRates(s).spill).toBe(0);
    expect(s.supply.escaped).toBeGreaterThan(30);expect(s.meadow.escaped).toBeGreaterThan(30);validateReturnChannel(s);
  });
  it.each(['gate','sealed','cleared'] as const)('cannot complete with %s missing; local water remains accounted',part=>{
    const s=emptyReturnChannel(),c={...repaired,[part]:false};run(s,c);expect(ready(s,c)).toBe(false);
    if(part==='sealed'){expect(s.spilled).toBeGreaterThan(0);expect(s.supply.supplied).toBe(0);}
    else expect(s.supply.escaped+s.meadow.escaped).toBe(0);
    validateReturnChannel(s);run(s,repaired,1800);expect(ready(s)).toBe(true);validateReturnChannel(s);
  });
  it('exactly resumes mid-flow and never treats downstream ports as extra sources',()=>{
    const a=emptyReturnChannel();run(a,{...repaired,sealed:false},340);run(a,repaired,130);const b=structuredClone(a);
    for(let i=0;i<720;i++){advanceReturnChannel(a,repaired);advanceReturnChannel(b,repaired);}
    expect(a).toEqual(b);validateReturnChannel(a);
    expect(a.upstream.supplied).toBe(a.upstream.cells.reduce((n,v)=>n+v,0)+a.supply.supplied+a.meadow.supplied+a.spilled);
    expect(a.upstream.supplied).toBeLessThanOrEqual(a.upstream.tick*2);
  });
  it('rejects duplicated water, inconsistent simulation clocks and forged recent flow totals',()=>{
    const a=emptyReturnChannel();run(a,repaired);const b=structuredClone(a);b.spilled++;
    expect(()=>validateReturnChannel(b)).toThrow();b.spilled--;b.supply.tick++;expect(()=>validateReturnChannel(b)).toThrow();
    const fresh=emptyReturnChannel();fresh.recent=[[5,5,0]];expect(()=>validateReturnChannel(fresh)).toThrow();
  });
});
