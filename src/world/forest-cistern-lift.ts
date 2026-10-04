import {intersects,type Aabb} from '../runtime/geometry';
import type {PlayerMotionState} from '../runtime/player-motion';
export const CISTERN_LIFT={left:400,right:448,top:128,bottom:352,centerX:424,speed:64,height:8} as const;
export type LiftLanding='top'|'bottom';
export interface CisternLiftState {
  version:1;y:number;to:LiftLanding;mode:'idle'|'call'|'board'|'ride'|'leave';blocked:boolean;
}
export const emptyCisternLift=():CisternLiftState=>({version:1,y:352,to:'bottom',mode:'idle',blocked:false});
export const liftCarriesPlayer=(s:CisternLiftState|undefined):boolean=>!!s&&['board','ride','leave'].includes(s.mode);
export const liftDeck=(s:CisternLiftState):Aabb=>({x:400,y:s.y,width:48,height:8});
const height=(to:LiftLanding)=>to==='top'?128:352;
const other=(to:LiftLanding):LiftLanding=>to==='top'?'bottom':'top';
const exitX=(to:LiftLanding)=>to==='top'?372:442;
export function beginCisternLift(s:CisternLiftState,from:LiftLanding):CisternLiftState{
  if(s.mode!=='idle')return s;
  return {...s,to:s.y===height(from)?other(from):from,mode:s.y===height(from)?'board':'call',blocked:false};
}
export function validateCisternLift(s:CisternLiftState,p:PlayerMotionState):void{
  if(!s||s.version!==1||!Number.isFinite(s.y)||s.y<128||s.y>352||!['top','bottom'].includes(s.to)||
    !['idle','call','board','ride','leave'].includes(s.mode)||typeof s.blocked!=='boolean')throw Error('升降机存档无效');
  const target=height(s.to),source=height(other(s.to)),eps=.001;
  if(s.mode==='idle'&&(s.y!==target||s.blocked)||s.mode==='board'&&s.y!==source||s.mode==='leave'&&s.y!==target)throw Error('升降机停靠状态不一致');
  if(s.mode==='board'){
    const low=source===352?412:340,high=source===352?452:424;
    if(p.x<low-eps||p.x>high+eps||p.y<source-42||p.y>source-14+eps)throw Error('升降机登乘位置无效');
  }
  if(s.mode==='ride'&&(Math.abs(p.x-424)>eps||Math.abs(p.y-(s.y-14))>eps))throw Error('升降机乘客与平台脱离');
  if(s.mode==='leave'&&(p.x<Math.min(424,exitX(s.to))-eps||p.x>Math.max(424,exitX(s.to))+eps||Math.abs(p.y-(s.y-14))>eps))throw Error('升降机离台位置无效');
}
const swept=(a:Aabb,b:Aabb):Aabb=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),
  width:Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x),height:Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y)});
/** Dock floor at y=352 is the platform's seating surface, not an obstacle below its lower stop. */
function platformSweep(s:CisternLiftState,next:CisternLiftState):Aabb{
  const b=swept(liftDeck(s),liftDeck(next));return {...b,height:Math.max(0,Math.min(b.y+b.height,352)-b.y)};
}
/** Never teleports or pushes through occupants. A blocked step keeps both deck and rider unchanged. */
export function stepCisternLift(s:CisternLiftState,p:PlayerMotionState,solid:(b:Aabb)=>boolean){
  validateCisternLift(s,p);
  const still={lift:s,player:p};
  if(s.mode==='idle')return still;
  const stopped=()=>({lift:{...s,blocked:true},player:liftCarriesPlayer(s)?{...p,velocityX:0,velocityY:0}:p});
  const step=64/60;
  if(s.mode==='call'||s.mode==='ride'){
    const dy=height(s.to)-s.y,nextY=s.y+Math.sign(dy)*Math.min(step,Math.abs(dy));
    const next={...s,y:nextY,blocked:false},deck=platformSweep(s,next);
    const rider={...p,x:424,y:nextY-14,velocityX:0,velocityY:Math.sign(dy)*64,grounded:true};
    const body={x:p.x,y:p.y,width:12,height:14};
    if(deck.height>0&&solid(deck)||s.mode==='call'&&intersects(swept(liftDeck(s),liftDeck(next)),body)||
      s.mode==='ride'&&solid(swept(body,{...rider,width:12,height:14})))return stopped();
    if(nextY===height(s.to))next.mode=s.mode==='ride'?'leave':'idle';
    return {lift:next,player:s.mode==='ride'?rider:p};
  }
  const target={x:s.mode==='board'?424:exitX(s.to),y:s.y-14},dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
  const n=Math.min(step,d),nextP={...p,x:d?p.x+dx/d*n:target.x,y:d?p.y+dy/d*n:target.y,
    velocityX:d?dx/d*64:0,velocityY:d?dy/d*64:0,grounded:true};
  if(solid(swept({...p,width:12,height:14},{...nextP,width:12,height:14})))return stopped();
  const done=d<=step,mode=done?(s.mode==='board'?'ride':'idle'):s.mode;
  if(done&&mode==='idle'){nextP.velocityX=0;nextP.velocityY=0;}
  return {lift:{...s,mode,blocked:false} as CisternLiftState,player:nextP};
}
