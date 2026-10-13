/** Bounded archival carrier: quasistatic motor, latched selector and hydraulic interlock.
 * Work/heat accounting covers the traction reservoir, not the separate selector spell.
 * Hand winching supplies measured work; neither static water nor a completed old hoist is fuel.
 */
export const ARCHIVE_RIG={x:244,y:126,width:108,height:90,start:64,target:16,positionUnits:16,
 charge:1280,discharge:8,work:6,selectorTicks:24,maxTicks:360,cost:2} as const;
export type RigKind='motion'|'energy'|'winch';
export interface RigEvent {at:number;kind:RigKind;direction?:-1|1}
export interface ArchiveRigState {version:1;age:number;events:RigEvent[]}
export interface ArchiveRigFrame {
 position:number;gear:-1|1;cam:number;selectorRemaining:number;remaining:number;
 magicInput:number;handInput:number;work:number;loss:number;delivered:boolean;working:boolean;manual:boolean;
}
function shape(s:ArchiveRigState,tick=Number.MAX_SAFE_INTEGER):void{
 if(!s||s.version!==1||Object.keys(s).some(k=>!['version','age','events'].includes(k))||
  !Number.isSafeInteger(s.age)||s.age<0||s.age>ARCHIVE_RIG.maxTicks||s.age>tick||!Array.isArray(s.events)||s.events.length>3)
  throw Error('档案取回架状态无效');
 const seen=new Set<RigKind>();let previous=0;
 for(const e of s.events){
  if(!e||Object.keys(e).some(k=>!['at','kind','direction'].includes(k))||!Number.isSafeInteger(e.at)||e.at<previous||e.at>s.age||
   !['motion','energy','winch'].includes(e.kind)||seen.has(e.kind)||seen.has('winch')||
   (e.kind==='motion'?![-1,1].includes(e.direction!):e.direction!==undefined))throw Error('档案取回架操作记录无效');
  previous=e.at;seen.add(e.kind);
 }
}
function replay(s:ArchiveRigState):Readonly<ArchiveRigFrame>{
 let position=ARCHIVE_RIG.start*ARCHIVE_RIG.positionUnits,gear:1|-1=1,cam=0,selector=0,desired:1|-1=1;
 let remaining=0,magicInput=0,handInput=0,work=0,loss=0,manual=false,index=0;
 const reached=()=>position<=ARCHIVE_RIG.target*ARCHIVE_RIG.positionUnits;
 const working=()=>!reached()&&(selector>0||remaining>0||manual);
 for(let age=0;age<=s.age;age++){
  while(s.events[index]?.at===age){
   const e=s.events[index++]!;if(reached())throw Error('档案取回架已到站，不可继续输入');
   if(e.kind==='motion'){selector=ARCHIVE_RIG.selectorTicks;desired=e.direction!;}
   else if(e.kind==='energy'){remaining+=ARCHIVE_RIG.charge;magicInput+=ARCHIVE_RIG.charge;}
   else{manual=true;gear=-1;cam=-ARCHIVE_RIG.selectorTicks;selector=0;}
  }
  if(age===s.age)break;
  if(!working())throw Error('档案取回架空转时间无效');
  if(selector>0){cam+=desired;selector--;if(selector===0)gear=desired;}
  if(manual&&remaining<ARCHIVE_RIG.discharge){const supplied=ARCHIVE_RIG.discharge-remaining;handInput+=supplied;remaining+=supplied;}
  const spent=Math.min(remaining,ARCHIVE_RIG.discharge);
  const shift=Math.min(spent*ARCHIVE_RIG.work/ARCHIVE_RIG.discharge,
   gear===-1?position-ARCHIVE_RIG.target*ARCHIVE_RIG.positionUnits:ARCHIVE_RIG.start*ARCHIVE_RIG.positionUnits-position);
  position+=gear*shift;remaining-=spent;work+=shift;loss+=spent-shift;
 }
 return Object.freeze({position:position/ARCHIVE_RIG.positionUnits,gear,cam,selectorRemaining:selector,
  remaining,magicInput,handInput,work,loss,delivered:reached(),working:working(),manual});
}
export function validateArchiveRig(s:ArchiveRigState,tick=Number.MAX_SAFE_INTEGER):void{shape(s,tick);replay(s);}
export function archiveRigFrame(s:ArchiveRigState={version:1,age:0,events:[]}):Readonly<ArchiveRigFrame>{shape(s);return replay(s);}
export function advanceArchiveRig(s:ArchiveRigState):void{
 if(archiveRigFrame(s).working){if(s.age===ARCHIVE_RIG.maxTicks)throw Error('档案取回架越过有限模拟边界');s.age++;}
}
export function canOperateArchiveRig(s:ArchiveRigState,kind:RigKind):boolean{
 return !archiveRigFrame(s).delivered&&!s.events.some(e=>e.kind===kind||e.kind==='winch');
}
export function appendArchiveRig(s:ArchiveRigState,kind:RigKind,direction?:-1|1):ArchiveRigState{
 if(!canOperateArchiveRig(s,kind))throw Error('档案取回架操作已用或到站');
 const next:ArchiveRigState={version:1,age:s.age,events:[...s.events,{at:s.age,kind,...(kind==='motion'?{direction}: {})}]};
 validateArchiveRig(next);return next;
}
export function archiveRigAccounting(s:ArchiveRigState):string{
 const f=archiveRigFrame(s),unit=(n:number)=>String(n/64);
 return '牵引能量：魔法输入 '+unit(f.magicInput)+' + 手摇输入 '+unit(f.handInput)+' = 剩余 '+unit(f.remaining)+
  ' + 输送做功 '+unit(f.work)+' + 损耗 '+unit(f.loss)+'。转向盘的独立施法不计入牵引储能。';
}
