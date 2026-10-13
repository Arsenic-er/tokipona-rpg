import {NODE_MOTION,nodeMotionFrame,type NodeMotionState} from '../world/forest-node-motion';
/** Wall recess above the time apparatus; both rails remain outside actor collision. */
export function drawNodeMotion(ctx:CanvasRenderingContext2D,state?:NodeMotionState):void{
 const {x,y}=NODE_MOTION,f=nodeMotionFrame(state);
 ctx.fillStyle='#535b4f';ctx.fillRect(x-29,y,58,47);
 ctx.fillStyle='#142220';ctx.fillRect(x-27,y+2,54,43);
 for(const [row,offset] of [[0,f.reference],[1,f.test]] as const){
  const cy=y+13+row*20,bx=x+Math.round(offset);
  ctx.fillStyle='#77806a';ctx.fillRect(x-25,cy+3,50,1);ctx.fillRect(x,cy+3,1,4);
  ctx.fillStyle='#b8a77e';ctx.fillRect(x-24,cy-8,2,2);
  if(row===1)ctx.fillRect(x-20,cy-8,2,2);
  ctx.fillStyle='#77705d';ctx.fillRect(x-26,cy-2,1,7);ctx.fillRect(x+25,cy-2,1,7);
  ctx.fillStyle=row===0?'#b7a27a':'#83a49d';ctx.fillRect(bx-2,cy-2,5,5);
  ctx.fillStyle='#424e46';ctx.fillRect(bx-1,cy-1,2,1);
 }
 // Focus arrow, not an invented glyph. The finite pulse stops after 24 ticks.
 ctx.fillStyle=state?.castAge!==undefined&&state.castAge<NODE_MOTION.pulseTicks?'#c1b38c':'#657467';
 ctx.fillRect(x-14,y+31,7,1);ctx.fillRect(x-14,y+30,1,3);
}
