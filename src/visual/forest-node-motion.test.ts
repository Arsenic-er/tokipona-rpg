import {it,expect} from 'vitest';
import {drawNodeMotion} from './forest-node-motion';
import type {NodeMotionState} from '../world/forest-node-motion';
it.each([undefined,{version:1,referenceAge:180},{version:1,referenceAge:180,castAge:180}] as (NodeMotionState|undefined)[])('draws two bounded native-pixel sliders without mutating state %#',state=>{
 const calls:{color:string;x:number;y:number;w:number;h:number}[]=[];
 const ctx={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){calls.push({color:this.fillStyle,x,y,w,h});}};
 const before=structuredClone(state);drawNodeMotion(ctx as unknown as CanvasRenderingContext2D,state);
 expect(state).toEqual(before);
 for(const r of calls){expect([r.x,r.y,r.w,r.h].every(Number.isInteger)).toBe(true);
  expect(r.x).toBeGreaterThanOrEqual(83);expect(r.x+r.w).toBeLessThanOrEqual(141);
  expect(r.y).toBeGreaterThanOrEqual(214);expect(r.y+r.h).toBeLessThanOrEqual(261);}
 const sliders=calls.filter(r=>r.w===5&&r.h===5);expect(sliders).toHaveLength(2);
 if(state?.castAge===180)expect(sliders[1]!.x).toBeLessThan(sliders[0]!.x);
 else expect(sliders[1]!.x).toBe(sliders[0]!.x);
});
