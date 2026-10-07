import type { GameSessionState } from '../session/game-session';
import type { RuntimeForestChapterManifest } from '../content/runtime-forest-chapter-manifest';

export const SHARD_SYNC_TICKS = 180;
export interface ShardSyncState {
  version:1;
  phase:'packed'|'seated'|'aligning'|'ready'|'synchronized';
  age:number;
}
export const SHARD_SYNC_EVENT = 'forest_site_synchronized';
/** Availability means actual grounding plus attunement, never dialogue exposure or mastery. */
export function shardMissingWords(s:GameSessionState,chapter:RuntimeForestChapterManifest):string[]{
  return chapter.activeWordIds.map(id=>id.replace(/^word\./,'')).filter(id=>{
    const w=s.learning.words[id];
    return !w||w.learningState===null||w.discoveryState!=='discovered'||w.attunementState!=='attuned'||
      !['grounded','produced','stabilized'].includes(w.learningState);
  });
}
export function shardPrerequisites(s:GameSessionState,chapter:RuntimeForestChapterManifest):boolean{
  const flags=s.world.flags;
  return flags['global:owns.'+chapter.allocation.shardId]?.value===true&&
    flags['global:forest.episode.migration.archive']?.value===true&&
    flags['region:valley_prologue:'+chapter.largeCreature.resolutionEventId]?.value===true&&
    shardMissingWords(s,chapter).length===0;
}
export function advanceShardAlignment(s:ShardSyncState,near:boolean):boolean{
  if(s.phase!=='aligning'||!near)return false;
  s.age++;
  if(s.age===SHARD_SYNC_TICKS){s.phase='ready';return true;}
  return false;
}
export function validateShardState(s:ShardSyncState):void{
  if(!s||Object.keys(s).sort().join(',')!=='age,phase,version'||s.version!==1||
    !Number.isSafeInteger(s.age)||s.age<0||s.age>SHARD_SYNC_TICKS||
    !['packed','seated','aligning','ready','synchronized'].includes(s.phase)||
    ['packed','seated'].includes(s.phase)&&s.age!==0||
    s.phase==='aligning'&&s.age>=SHARD_SYNC_TICKS||
    ['ready','synchronized'].includes(s.phase)&&s.age!==SHARD_SYNC_TICKS)
    throw Error('碎片座对齐状态无效');
}
