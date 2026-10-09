import type {GameSessionState} from '../session/game-session';
export const FOREST_EPILOGUE_FLAG='forest_chapter_epilogue_committed';
export const FOREST_RETURN_TRANSACTION='episode.epilogue.return';
export const hasEpilogueFlag=(s:GameSessionState,f:'reviewed'|'sealed')=>s.world.flags['global:forest.episode.epilogue.'+f]?.value===true;
export const hasForestReturn=(s:GameSessionState)=>s.world.flags['global:prologue_return_observed']?.value===true;
export function forestEpilogueReady(s:GameSessionState):boolean{
 const region=(id:string)=>s.world.flags['region:valley_prologue:'+id]?.value;
 return ['forest_large_creature_resolution_committed','forest_site_synchronized','forest_water_allocation_committed','forest_site_lead_revealed'].every(id=>region(id)===true)&&
  ['settlement_priority','wetland_priority','road_trade_priority'].includes(String(region('forest_water_allocation')))&&
  ['owns.artifact.ancient_medium_frame','owns.artifact.fragment.forest_site','forest.episode.debrief','forest.episode.lead.recorded'].every(id=>s.world.flags['global:'+id]?.value===true)&&
  s.receiptIndex['forest.episode.lead.recorded']?.domain==='world'&&s.quests.ch01_return_flow?.stageId==='completed';
}
export function forestEpilogueReturnReady(s:GameSessionState):boolean{
 return forestEpilogueReady(s)&&s.world.currentSceneId==='scene.valley.settlement'&&hasEpilogueFlag(s,'sealed')&&
  s.world.flags['region:valley_prologue:'+FOREST_EPILOGUE_FLAG]?.value===true&&
  s.receiptIndex['forest.episode.epilogue.sealed']?.domain==='world'&&
  s.quests.ch01_underground_water_allocation?.stageId==='completed'&&
  s.world.flags['global:forest.episode.lead.worker']?.value===true&&s.receiptIndex['forest.episode.lead.worker']?.domain==='world';
}
