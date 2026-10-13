import type {GameSessionState} from '../session/game-session';
export type RigWord='tawa'|'wawa';
export const parseRigWord=(input:string):RigWord|null=>{
 const s=input.normalize('NFKC').trim().toLowerCase();return s==='tawa'||s==='wawa'?s:null;
};
export const rigWordReady=(s:GameSessionState,word:RigWord)=>{
 const w=s.learning.words[word];return w?.attunementState==='attuned'&&['grounded','produced','stabilized'].includes(w.learningState??'')&&
  s.world.flags['global:forest.episode.debrief']?.value===true;
};
import {GameSession,type GameSessionSave} from '../session/game-session';
import {sha256Canonical,type JsonValue} from '../canonical-json';
import {ARCHIVE_RIG,validateArchiveRig,archiveRigFrame,type ArchiveRigState} from '../world/forest-archive-rig';
export const hasArchiveRigFlag=(s:GameSessionState,flag:string)=>s.world.flags['global:forest.episode.archive-rig.'+flag]?.value===true;
export function validateArchiveRigLedger(save:GameSessionSave,physical:ArchiveRigState|undefined,tick:number,waterReady:boolean):void{
 const state=save.state,ledger=save.eventLedger,prefix='forest.episode.archive-rig.';
 const coupled=hasArchiveRigFlag(state,'coupled'),collected=hasArchiveRigFlag(state,'collected');
 for(const name of ['coupled','collected']){
  const active=hasArchiveRigFlag(state,name),receipt=state.receiptIndex[prefix+name],index=ledger.findIndex(e=>e.eventId==='episode.archive-rig.'+name),event=ledger[index];
  if(active!==!!receipt||active!==(index>=0))throw Error('档案取回架凭证缺失');
  if(!active)continue;
  if(!event||event.type!=='world_flag_set'||event.payload.flagId!==prefix+name||event.payload.value!==true||event.payload.scope!=='global'||receipt?.domain!=='world')
   throw Error('档案取回架连接或领取事件无效');
  const replay=GameSession.replayLedger(save.sessionId,save.origin,ledger.slice(0,index)),before=replay.ok?replay.session.snapshot():null;
  if(!before||before.world.currentSceneId!=='scene.valley.underground_order_node'||
   before.world.flags['global:forest.episode.node-water.long.completed']?.value!==true||
   name==='collected'&&!hasArchiveRigFlag(before,'coupled'))throw Error('档案取回架连接或领取前置无效');
 }
 if(coupled!==(physical!==undefined))throw Error('档案取回架连接记录无效');
 if(!physical){
  if(collected||ledger.some(e=>e.eventId.startsWith('episode.archive-rig.')))throw Error('档案取回架物理记录缺失');
  return;
 }
 validateArchiveRig(physical,tick);
 if(!waterReady||!coupled||collected&&!archiveRigFrame(physical).delivered)throw Error('档案取回架水位锁扣或交付状态无效');
 const actions=ledger.filter(e=>e.eventId.startsWith('episode.archive-rig.action.'));
 if(actions.length!==physical.events.length)throw Error('档案取回架操作数量无效');
 for(const [i,e] of physical.events.entries()){
  const id='episode.archive-rig.action.'+i,flagIndex=ledger.findIndex(item=>item.eventId===id),flag=ledger[flagIndex];
  const receipt=state.receiptIndex[prefix+'action.'+i],mpId='episode.archive-rig.mp.'+i,cast=e.kind!=='winch';
  if(!flag||flag.type!=='world_flag_set'||flag.payload.flagId!==prefix+'action.'+i||
   flag.payload.value!==sha256Canonical(e as unknown as JsonValue)||flag.payload.scope!=='global'||receipt?.domain!==(cast?'cast':'world'))
   throw Error('档案取回架操作与物理记录不一致');
  const mpIndex=ledger.findIndex(item=>item.eventId===mpId),index=cast?mpIndex:flagIndex;
  const prior=index<0?null:GameSession.replayLedger(save.sessionId,save.origin,ledger.slice(0,index)),before=prior?.ok?prior.session.snapshot():null;
  if(!before||!hasArchiveRigFlag(before,'coupled')||before.world.currentSceneId!=='scene.valley.underground_order_node')throw Error('档案取回架操作前置无效');
  if(cast){
   const mp=ledger[mpIndex];
   if(mpIndex!==flagIndex-1||!mp||mp.type!=='mp_replaced'||!rigWordReady(before,e.kind==='motion'?'tawa':'wawa')||
    mp.payload.mp.currentMp!==before.mp.currentMp-ARCHIVE_RIG.cost||mp.payload.mp.maxMp!==before.mp.maxMp||
    mp.payload.mp.worldVersion!==before.mp.worldVersion+1)throw Error('档案取回架扣费凭证无效');
  }else if(mpIndex!==-1)throw Error('档案取回架手摇不能扣 MP');
 }
 if(ledger.filter(e=>e.eventId.startsWith('episode.archive-rig.mp.')).length!==physical.events.filter(e=>e.kind!=='winch').length)
  throw Error('档案取回架额外扣费无效');
}
export const RIG_NOTE='检修附页：双杯只抬起安全锁扣，不提供动力；换向盘决定输送方向，滑架仍需有限能量。朝止挡输送会把输入耗在损耗上，手摇绞盘可从收件侧回收。页脚注明：检修通路只供人员往返，不会增加三路可分配的水；原配水取舍仍要保留。它不是远方位点线索，也不解锁新地图。';
