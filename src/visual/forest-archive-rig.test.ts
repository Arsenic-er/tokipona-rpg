import {it,expect} from 'vitest';
import {drawArchiveRig} from './forest-archive-rig';
import type {ArchiveRigState} from '../world/forest-archive-rig';
it.each([undefined,{version:1,age:0,events:[]},{version:1,age:12,events:[{at:0,kind:'motion',direction:-1}]},
 {version:1,age:128,events:[{at:0,kind:'winch'}]}] as (ArchiveRigState|undefined)[])('renders carrier, charge and selector inside their wall apparatus without mutating %#',state=>{
 const calls:{x:number;y:number;w:number;h:number}[]=[],ctx={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){calls.push({x,y,w,h});}},before=structuredClone(state);
 drawArchiveRig(ctx as unknown as CanvasRenderingContext2D,state);expect(state).toEqual(before);
 for(const r of calls){expect([r.x,r.y,r.w,r.h].every(Number.isInteger)).toBe(true);expect(r.w).toBeGreaterThanOrEqual(0);expect(r.h).toBeGreaterThanOrEqual(0);
  expect(r.x).toBeGreaterThanOrEqual(232);expect(r.x+r.w).toBeLessThanOrEqual(352);expect(r.y).toBeGreaterThanOrEqual(126);expect(r.y+r.h).toBeLessThanOrEqual(216);}
});
