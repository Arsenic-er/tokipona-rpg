import {it,expect} from 'vitest';
import {drawNodeWater} from './forest-node-water';
import {NodeWaterWorld,NODE_WATER} from '../world/forest-node-water';
it('draws exact material cells and physical receiver markings inside a separate wall recess',()=>{
 const w=new NodeWaterWorld({version:1,short:{source:'cast',age:180},long:{source:'cast',age:180}}),cells=w.cells(),before=[...cells];
 const calls:{x:number;y:number;w:number;h:number}[]=[],ctx={fillStyle:'',fillRect(x:number,y:number,w:number,h:number){calls.push({x,y,w,h});}};
 drawNodeWater(ctx as unknown as CanvasRenderingContext2D,cells,true);expect(cells).toEqual(before);
 for(const r of calls){expect([r.x,r.y,r.w,r.h].every(Number.isInteger)).toBe(true);expect(r.w).toBeGreaterThanOrEqual(0);expect(r.h).toBeGreaterThanOrEqual(0);
  expect(r.x).toBeGreaterThanOrEqual(NODE_WATER.x-2);expect(r.x+r.w).toBeLessThanOrEqual(NODE_WATER.x+170);
  expect(r.y).toBeGreaterThanOrEqual(NODE_WATER.y-2);expect(r.y+r.h).toBeLessThanOrEqual(NODE_WATER.y+82);}
});
