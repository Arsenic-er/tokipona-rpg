import {GameSession} from '../session/game-session';
import {FOREST_EPILOGUE_FLAG,FOREST_RETURN_TRANSACTION,forestEpilogueReady,forestEpilogueReturnReady,hasEpilogueFlag,hasForestReturn} from './forest-epilogue-contract';
/** Replay checks complement the protected live coordinator; no inferred legacy completion. */
export function validateForestEpilogue(session:GameSession):void{
 const state=session.snapshot(),save=session.toSave(),ledger=save.eventLedger;
 const sealed=hasEpilogueFlag(state,'sealed'),regional=state.world.flags['region:valley_prologue:'+FOREST_EPILOGUE_FLAG]?.value===true;
 if(sealed!==regional)throw Error('尾声封存与区域状态不一致');
 for(const f of ['reviewed','sealed'] as const){
  const active=hasEpilogueFlag(state,f),i=ledger.findIndex(e=>e.eventId==='episode.epilogue.'+f),e=ledger[i];
  const receipt=state.receiptIndex['forest.episode.epilogue.'+f];
  if(active!==(i>=0)||active!==!!receipt)throw Error('尾声凭证缺失');
  if(!active)continue;
  if(!e||e.type!=='world_flag_set'||e.payload.scope!=='global'||e.payload.flagId!=='forest.episode.epilogue.'+f||e.payload.value!==true||receipt.domain!=='world')
   throw Error('尾声事件无效');
  const before=GameSession.replayLedger(save.sessionId,save.origin,ledger.slice(0,i));
  if(!before.ok)throw Error('尾声前置账本无效');
  const s=before.session.snapshot();
  if(s.world.currentSceneId!=='scene.valley.underground_order_node'||!forestEpilogueReady(s)||
   s.quests.ch01_underground_water_allocation?.stageId!=='site_lead_revealed'||f==='sealed'&&!hasEpilogueFlag(s,'reviewed'))
   throw Error('尾声封存顺序或地点无效');
 }
 if(sealed&&state.quests.ch01_underground_water_allocation?.stageId!=='completed')throw Error('尾声任务阶段无效');
 const returned=hasForestReturn(state),events=ledger.filter(e=>e.type==='prologue_return_observation_committed');
 const receipt=state.receiptIndex['prologue-return-observation:'+FOREST_RETURN_TRANSACTION];
 if(returned!==(events.length===1)||!returned&&events.length!==0||returned!==!!receipt)throw Error('回访事件与凭证不一致');
 if(returned){
  const e=events[0]!,i=ledger.indexOf(e),before=GameSession.replayLedger(save.sessionId,save.origin,ledger.slice(0,i));
  if(e.eventId!=='session.return.observation.'+FOREST_RETURN_TRANSACTION||e.payload.transactionId!==FOREST_RETURN_TRANSACTION||
   e.payload.writerEvent!=='return_observation_committed'||receipt?.recordedByEventId!==e.eventId||
   !before.ok||!forestEpilogueReturnReady(before.session.snapshot()))throw Error('回访提交前置无效');
 }
}
