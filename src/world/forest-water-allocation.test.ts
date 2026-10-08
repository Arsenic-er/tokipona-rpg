import {describe,it,expect} from 'vitest';
import {AllocationWorld,ALLOCATION_BRANCHES,ALLOCATION_TOTAL,ALLOCATION_MAX_TICKS,ALLOCATION_PORTS,allocationQuotas,allocationHabitatDepth,validateAllocationState,type AllocationMode} from './forest-water-allocation';
import {wetlandMapMaterial} from './forest-wetland-migration';
import {validateEpisodeWater} from './forest-episode-water';
const modes:AllocationMode[]=['settlement_priority','wetland_priority','road_trade_priority'];
describe('finite three-way water commissioning',()=>{
 it.each(modes)('%s conserves the finite header batch and routes actual output 4:1:1',mode=>{
  const w=new AllocationWorld(mode);expect(w.channels.upstream.supplied).toBe(ALLOCATION_TOTAL);
  expect(w.satisfied).toBe(false);let partial:AllocationWorld|undefined;
  while(!w.satisfied&&w.age<ALLOCATION_MAX_TICKS){
   w.advance();
   for(const water of Object.values(w.channels))validateEpisodeWater(water);
   expect(w.channels.upstream.supplied).toBe(ALLOCATION_TOTAL);
   expect(w.channels.upstream.escaped).toBe(ALLOCATION_BRANCHES.reduce((n,b)=>n+w.channels[b].supplied+w.pending[b],0));
   expect(Object.values(w.channels).reduce((n,s)=>n+s.cells.reduce((a,v)=>a+v,0),0)+
    ALLOCATION_BRANCHES.reduce((n,b)=>n+w.channels[b].escaped+w.pending[b],0)).toBe(ALLOCATION_TOTAL);
   if(w.age===120)partial=new AllocationWorld(mode,w.age);
  }
  expect(w.satisfied).toBe(true);expect(w.age).toBeLessThan(ALLOCATION_MAX_TICKS);
  expect(w.delivered).toEqual(allocationQuotas(mode));expect(partial?.channels).toEqual(new AllocationWorld(mode,120).channels);
  const restored=new AllocationWorld(mode,w.age);expect(restored.channels).toEqual(w.channels);
  const old=structuredClone(w.channels);w.advance();expect(w.channels).toEqual(old);
  expect(()=>new AllocationWorld(mode,w.age+1)).toThrow();
 });
 it('projects only the chosen habitat depth into already discovered map cells, preserving old defaults',()=>{
  expect(wetlandMapMaterial(400,364)).toBe(0);expect(wetlandMapMaterial(400,365)).toBe(7);
  expect(wetlandMapMaterial(400,365,allocationHabitatDepth('settlement_priority'))).toBe(0);
  expect(wetlandMapMaterial(400,367,allocationHabitatDepth('settlement_priority'))).toBe(7);
  expect(allocationHabitatDepth('road_trade_priority')).toBe(allocationHabitatDepth('settlement_priority'));
  expect(wetlandMapMaterial(400,365,allocationHabitatDepth('road_trade_priority'))).toBe(0);
  expect(wetlandMapMaterial(400,362,allocationHabitatDepth('wetland_priority'))).toBe(7);
  for(const mode of modes)expect(wetlandMapMaterial(400,368,allocationHabitatDepth(mode))).toBe(2);
 });
 it('keeps every branch inlet below the header outlet and never starts without a valid mode',()=>{
  for(const b of ALLOCATION_BRANCHES)expect(ALLOCATION_PORTS[b].y+1).toBeGreaterThan(ALLOCATION_PORTS.upstream.y+48);
  expect(()=>new AllocationWorld('balanced_upgrade' as AllocationMode)).toThrow();
  expect(()=>validateAllocationState({version:1,mode:'wetland_priority',phase:'preview',age:1})).toThrow();
  expect(()=>validateAllocationState({version:1,mode:'wetland_priority',phase:'routing',age:901})).toThrow();
 });
});
