import {NODE_ENERGY,nodeEnergyFrame,type NodeEnergyState} from '../world/forest-node-energy';
/** Isolated wall-mounted hoists above the conservation instrument; never actor platforms. */
export function drawNodeEnergy(ctx:CanvasRenderingContext2D,state?:NodeEnergyState):void{
 const {x,y}=NODE_ENERGY,frame=nodeEnergyFrame(state);
 ctx.fillStyle='#555b4e';ctx.fillRect(x-29,y,58,47);ctx.fillStyle='#14211f';ctx.fillRect(x-27,y+2,54,43);
 for(const [side,v] of [[-1,frame.reference],[1,frame.test]] as const){
  const cx=x+side*14,base=y+36,by=base-Math.round(v.height);
  ctx.fillStyle='#b6a57b';ctx.fillRect(cx-7,y+4,2,2);if(side===1)ctx.fillRect(cx-3,y+4,2,2);
  ctx.fillStyle='#414f43';ctx.fillRect(cx-8,y+9,12,29);
  ctx.fillStyle='#888a70';ctx.fillRect(cx-2,y+9,1,by-(y+9));
  ctx.fillStyle='#687460';ctx.fillRect(cx-8,base,12,1);
  // The horizontal notch is the target height, not a colour-only success marker.
  ctx.fillStyle='#ada07c';ctx.fillRect(cx-8,base-NODE_ENERGY.targetHeight,4,1);
  ctx.fillStyle=side===1?'#84a59d':'#b9a47b';ctx.fillRect(cx-4,by-2,5,4);
  ctx.fillStyle='#202e28';ctx.fillRect(cx+6,y+10,4,28);
  ctx.fillStyle='#8caa91';const charge=Math.floor(v.remaining/80);ctx.fillRect(cx+7,base-charge,2,charge);
  ctx.fillStyle='#a8906d';const heat=Math.floor(v.loss/48);
  for(let i=0;i<heat;i++)ctx.fillRect(cx-8+i,y+42,1,2);
  if(v.latched){ctx.fillStyle='#b6a57b';ctx.fillRect(cx-7,base-NODE_ENERGY.targetHeight,6,2);}
 }
}
