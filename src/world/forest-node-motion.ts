/** A fixture-bound, noncombat tawa profile. Never a generic movement/teleport spell. */
export const NODE_MOTION={x:112,y:214,ticks:180,pulseTicks:24,cost:2,initialSpeed:8,acceleration:-32,drag:.08} as const;
export interface NodeMotionState {version:1;referenceAge:number;castAge?:number}
export interface NodeMotionFrame {reference:number;test:number;referenceVelocity:number;testVelocity:number}
function frames(cast:boolean):readonly Readonly<NodeMotionFrame>[]{
 let reference=0,test=0,referenceVelocity=NODE_MOTION.initialSpeed as number,testVelocity=referenceVelocity;
 const all:NodeMotionFrame[]=[];
 for(let age=0;age<=NODE_MOTION.ticks;age++){
  all.push(Object.freeze({reference,test,referenceVelocity,testVelocity}));
  referenceVelocity*=1-NODE_MOTION.drag/60;
  testVelocity=(testVelocity+(cast&&age<NODE_MOTION.pulseTicks?NODE_MOTION.acceleration/60:0))*(1-NODE_MOTION.drag/60);
  reference+=referenceVelocity/60;test+=testVelocity/60;
 }
 return Object.freeze(all);
}
const REFERENCE=frames(false),CAST=frames(true);
export function validateNodeMotion(s:NodeMotionState,tick=Number.MAX_SAFE_INTEGER):void{
 if(!s||s.version!==1||Object.keys(s).some(k=>!['version','referenceAge','castAge'].includes(k))||
  !Number.isSafeInteger(s.referenceAge)||s.referenceAge<0||s.referenceAge>NODE_MOTION.ticks||s.referenceAge>tick||
  s.castAge!==undefined&&(!Number.isSafeInteger(s.castAge)||s.castAge<0||s.castAge>NODE_MOTION.ticks||
   s.castAge>tick||s.referenceAge!==NODE_MOTION.ticks))throw Error('地下运动滑轨状态无效');
}
export function nodeMotionFrame(s?:NodeMotionState):Readonly<NodeMotionFrame>{
 if(!s)return REFERENCE[0]!;
 validateNodeMotion(s);return s.castAge===undefined?REFERENCE[s.referenceAge]!:CAST[s.castAge]!;
}
export function advanceNodeMotion(s:NodeMotionState):void{
 validateNodeMotion(s);if(s.castAge===undefined)s.referenceAge=Math.min(NODE_MOTION.ticks,s.referenceAge+1);
 else s.castAge=Math.min(NODE_MOTION.ticks,s.castAge+1);
}
export function nodeMotionVerified(s:NodeMotionState):boolean{
 const f=nodeMotionFrame(s);
 return s.castAge===NODE_MOTION.ticks&&f.reference>15&&f.test< -5&&f.referenceVelocity>0&&f.testVelocity<0;
}
export const parseNodeMotionPrediction=(s:string)=>s.normalize('NFKC').trim().toLowerCase()==='rail:predict:tawa:reverse';
