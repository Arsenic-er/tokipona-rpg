import {it,expect} from 'vitest';
import {drawNodeEnergy} from './forest-node-energy';
import type {NodeEnergyState} from '../world/forest-node-energy';
it.each([undefined,{version:1,referenceAge:80},{version:1,referenceAge:80,castAge:100},{version:1,referenceAge:80,castAge:240}] as (NodeEnergyState|undefined)[])('draws bounded pixel hoists, energy bars and loss marks without mutating state %#',state=>{
 const calls:{color:string;x:number;y:number;w:number;h:number}[]=[];
 const ctx={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){calls.push({color:this.fillStyle,x,y,w,h});}};
 const before=structuredClone(state);drawNodeEnergy(ctx as unknown as CanvasRenderingContext2D,state);expect(state).toEqual(before);
 for(const r of calls){expect([r.x,r.y,r.w,r.h].every(Number.isInteger)).toBe(true);expect(r.w).toBeGreaterThanOrEqual(0);expect(r.h).toBeGreaterThanOrEqual(0);
  expect(r.x).toBeGreaterThanOrEqual(179);expect(r.x+r.w).toBeLessThanOrEqual(237);expect(r.y).toBeGreaterThanOrEqual(214);expect(r.y+r.h).toBeLessThanOrEqual(261);}
 const loads=calls.filter(r=>r.w===5&&r.h===4);expect(loads).toHaveLength(2);
 if(state?.castAge===240){expect(loads[1]!.y).toBeLessThan(loads[0]!.y);expect(calls.filter(r=>r.color==='#8caa91').every(r=>r.h===0)).toBe(true);}
 else if(state?.castAge===undefined)expect(loads[1]!.y).toBe(loads[0]!.y);
});
