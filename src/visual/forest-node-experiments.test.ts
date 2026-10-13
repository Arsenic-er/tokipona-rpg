import {it,expect} from 'vitest';
import {drawNodeExperiments} from './forest-node-experiments';
import type {NodeExperimentState} from '../world/forest-node-experiments';
function draw(state?:NodeExperimentState){
 const marks:{color:string;x:number;y:number;width:number;height:number}[]=[];
 const ctx={fillStyle:'',strokeStyle:'',lineWidth:1,
  fillRect(x:number,y:number,width:number,height:number){marks.push({color:this.fillStyle,x,y,width,height});},
  beginPath(){},moveTo(){},lineTo(){},stroke(){},
 };
 drawNodeExperiments(ctx as unknown as CanvasRenderingContext2D,state);return marks;
}
it('renders individual clay grains above normal stone and below abnormal stone at native pixel size',()=>{
 const samples=draw({material:{version:1,mode:'anomaly',age:240}}).filter(m=>m.color==='#c2a177');
 expect(samples).toHaveLength(32);expect(samples.every(m=>m.width===1&&m.height===1)).toBe(true);
 expect(samples.filter(m=>m.x<160).every(m=>m.y<292)).toBe(true);
 expect(samples.filter(m=>m.x>160).every(m=>m.y>294)).toBe(true);
});
it('opens the isolated drawer visibly without drawing extra water or changing the front collector',()=>{
 const run={version:1,mode:'anomaly',age:240} as const;
 const closed=draw({conservation:run}).filter(m=>m.color==='#8cb4b1');
 const open=draw({conservation:{...run,ledgerOpen:true}}).filter(m=>m.color==='#8cb4b1');
 expect(closed).toHaveLength(26);expect(open).toHaveLength(32);
 expect(open.filter(m=>m.y<310)).toEqual(closed);
 expect(open.filter(m=>m.y===313)).toHaveLength(6);
 expect(open.every(m=>m.width===1&&m.height===1)).toBe(true);
});
it('read-only drawing preserves mixed legacy and new apparatus states',()=>{
 const state:NodeExperimentState={gravity:{version:1,mode:'anomaly',age:43},time:{version:1,mode:'normal',age:65},
  material:{version:1,mode:'anomaly',age:80},conservation:{version:1,mode:'anomaly',age:240,ledgerOpen:true}};
 const before=structuredClone(state);draw(state);draw(state);expect(state).toEqual(before);
});
