import {GameSession,type GameSessionState} from '../session/game-session';
export const SITE_LEAD_EVENT='forest_site_lead_revealed';
export const SITE_ARCHIVE_HISTORY='档案记着一次旱季：部分居民与议事者将水引向聚落，保住饮水和庄稼，却让湿地与下游承受缺水。他们随后隐去了改渠记录，担心追责和索赔。维修簿又记下：受损系统无法同时满足三路需求。修复并不意味着代价消失。';
export const LEAD_FLAGS=['inspected','recorded','worker','hermit'] as const;
export type SiteLeadFlag=typeof LEAD_FLAGS[number];
export const SITE_LEAD_TEXT='索引中的森林刻印与原碎片吻合。数条断续刻线朝森林之外延伸，其中一组指向开阔地；末端的名称和距离已经磨损。它们更像其他失联位点的方向记录，不是能够直接抵达的坐标。';
export const SITE_LEAD_HERMIT='这不是一张完整的地图。森林碎片只认出了与自己相连的一小段旧网，断线另一头的位点还没有回应。媒介能帮助你看见这些关系，不能替你理解语言，也不能替你支付 MP。那些地方是否仍然安全，我不知道；重新接通旧网，也可能唤醒仍在运作的危险系统。带着记录慢慢查证，何时离开由你决定。';
const prefix='global:forest.episode.lead.';
const region='region:valley_prologue:';
export const hasSiteLead=(s:GameSessionState,f:SiteLeadFlag):boolean=>s.world.flags[prefix+f]?.value===true;
/** Stored only in the existing event ledger: no new physical save or inferred old-save rewards. */
export function validateSiteLead(session:GameSession):void{
 const state=session.snapshot(),save=session.toSave();
 if((state.world.flags[region+SITE_LEAD_EVENT]?.value===true)!==hasSiteLead(state,'recorded'))throw Error('位点线索与记录凭证不一致');
 for(const f of LEAD_FLAGS){
  const active=hasSiteLead(state,f),receipt=state.receiptIndex['forest.episode.lead.'+f];
  const index=save.eventLedger.findIndex(e=>e.eventId==='episode.lead.'+f),event=save.eventLedger[index];
  if(active!==!!receipt||active!==(index>=0))throw Error('位点线索凭证缺失');
  if(!active)continue;
  if(!event||event.type!=='world_flag_set'||event.payload.flagId!=='forest.episode.lead.'+f||event.payload.value!==true||
    event.payload.scope!=='global'||receipt.domain!=='world')throw Error('位点线索事件无效');
  const replay=GameSession.replayLedger(save.sessionId,save.origin,save.eventLedger.slice(0,index));
  if(!replay.ok)throw Error('位点线索前置账本无效');
  const before=replay.session.snapshot(),scene=f==='worker'?'scene.valley.settlement':f==='hermit'?'scene.valley.stream_section':'scene.valley.underground_order_node';
  if(before.world.currentSceneId!==scene||before.world.flags[region+'forest_site_synchronized']?.value!==true||
    before.world.flags[region+'forest_water_allocation_committed']?.value!==true||
    before.world.flags['global:owns.artifact.fragment.forest_site']?.value!==true||
    before.world.flags['global:forest.episode.migration.archive']?.value!==true||
    f==='recorded'&&!hasSiteLead(before,'inspected')||
    (f==='worker'||f==='hermit')&&!hasSiteLead(before,'recorded')||
    f==='hermit'&&before.world.flags['global:forest.episode.debrief']?.value!==true)
    throw Error('位点线索提交顺序或地点无效');
 }
 if(hasSiteLead(state,'recorded')&&state.quests.ch01_underground_water_allocation?.stageId!==
  (state.world.flags['global:forest.episode.epilogue.sealed']?.value===true?'completed':'site_lead_revealed'))
  throw Error('位点线索任务阶段无效');
}
