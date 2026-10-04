import type { Aabb } from '../runtime/geometry';
import type { PlayerMotionState } from '../runtime/player-motion';
export const CISTERN_ROOM_BOUNDS={x:0,y:0,width:480,height:768} as const;
export const CISTERN_PLATFORMS=[{x:16,y:544,w:368},{x:448,y:544,w:16},{x:96,y:352,w:368},{x:16,y:128,w:448}] as const;
export function cisternRoomSolid(x:number,y:number,upperOpen=false):boolean {
  if(x<16||x>=464||y<16||y>=736)return true;
  if(CISTERN_PLATFORMS.some(p=>x>=p.x&&x<p.x+p.w&&y>=p.y&&y<p.y+12))return true;
  return !upperOpen && x>=32&&x<80&&y>=368&&y<384;
}
export function cisternRoomCollides(b:Aabb,upperOpen=false):boolean {
  for(let y=Math.floor(b.y);y<Math.ceil(b.y+b.height);y++)
    for(let x=Math.floor(b.x);x<Math.ceil(b.x+b.width);x++)if(cisternRoomSolid(x,y,upperOpen))return true;
  return false;
}
export const CISTERN_ROUTES={
  'east-up':[{x:410,y:722},{x:410,y:530},{x:366,y:530}],
  'east-down':[{x:410,y:530},{x:410,y:722}],
  'west-up':[{x:50,y:530},{x:50,y:338},{x:108,y:338}],
  'west-down':[{x:50,y:338},{x:50,y:530}],
} as const;
export type CisternRoute=keyof typeof CISTERN_ROUTES;
export interface CisternClimb { route:CisternRoute; leg:number }
export function validateCisternClimb(c:CisternClimb,p:PlayerMotionState,upperOpen:boolean):void{
  if(!c||!Object.hasOwn(CISTERN_ROUTES,c.route)||!Number.isInteger(c.leg)||c.leg<0||c.leg>=CISTERN_ROUTES[c.route].length||
    c.route.startsWith('west')&&!upperOpen)throw Error('检修梯路线无效');
  const points=CISTERN_ROUTES[c.route],end=points[c.leg]!,start=c.leg?points[c.leg-1]!:end;
  if(c.leg===0){
    // Downward boarding includes the landing-to-shaft offset plus the 30px interaction reach (up to 88px).
    const reach=c.route.endsWith('down')?96:36;
    if(Math.abs(p.x-end.x)>reach||p.y<end.y-28||p.y>end.y+.01)throw Error('检修梯起点无效');
  }else if(p.x<Math.min(start.x,end.x)-.01||p.x>Math.max(start.x,end.x)+.01||
    p.y<Math.min(start.y,end.y)-.01||p.y>Math.max(start.y,end.y)+.01)throw Error('检修梯位置不一致');
}
export function stepCisternClimb(p:PlayerMotionState,c:CisternClimb,upperOpen:boolean):{player:PlayerMotionState;climb?:CisternClimb}{
  validateCisternClimb(c,p,upperOpen);
  const points=CISTERN_ROUTES[c.route],target=points[c.leg]!,dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy),step=Math.min(d,64/60);
  const x=d?p.x+dx/d*step:target.x,y=d?p.y+dy/d*step:target.y;
  if(cisternRoomCollides({x,y,width:12,height:14},upperOpen))throw Error('检修梯通道受阻');
  const reached=d<=64/60,done=reached&&c.leg===points.length-1;
  return {player:{x,y,velocityX:done?0:d?dx/d*64:0,velocityY:done?0:d?dy/d*64:0,grounded:done},
    ...(!done?{climb:{route:c.route,leg:reached?c.leg+1:c.leg}}:{})};
}
