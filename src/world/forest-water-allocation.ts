import {advanceEpisodeWater,emptyEpisodeWater,supplyEpisodeWater,type EpisodeWaterControls} from './forest-episode-water';
import type {RuntimeForestChapterManifest} from '../content/runtime-forest-chapter-manifest';
export type AllocationMode=RuntimeForestChapterManifest['allocation']['modeIds'][number];
export const ALLOCATION_BRANCHES=['settlement','wetland','road'] as const;
export type AllocationBranch=typeof ALLOCATION_BRANCHES[number];
export const ALLOCATION_TOTAL=120;
export const ALLOCATION_MAX_TICKS=900;
export const ALLOCATION_CONTROLS:EpisodeWaterControls={kind:'mill',gate:true,cleared:true,plugged:false,sourceRate:0};
export const ALLOCATION_PORTS={upstream:{x:96,y:75},settlement:{x:276,y:134},wetland:{x:276,y:190},road:{x:276,y:246}} as const;
const preferred:Record<AllocationMode,AllocationBranch>={settlement_priority:'settlement',wetland_priority:'wetland',road_trade_priority:'road'};
export const isAllocationMode=(v:unknown):v is AllocationMode=>typeof v==='string'&&Object.hasOwn(preferred,v);
export function allocationQuotas(mode:AllocationMode):Record<AllocationBranch,number>{
 return Object.fromEntries(ALLOCATION_BRANCHES.map(b=>[b,b===preferred[mode]?80:20])) as Record<AllocationBranch,number>;
}
export const allocationHabitatDepth=(mode:AllocationMode|null):number=>mode===null||allocationQuotas(mode).wetland===80?6:1;
export interface AllocationState {version:1;mode:AllocationMode;phase:'preview'|'routing'|'committed';age:number;}
export function validateAllocationState(s:AllocationState):void{
 if(!s||Object.keys(s).sort().join(',')!=='age,mode,phase,version'||s.version!==1||!isAllocationMode(s.mode)||
  !['preview','routing','committed'].includes(s.phase)||!Number.isSafeInteger(s.age)||s.age<0||s.age>ALLOCATION_MAX_TICKS||
  s.phase==='preview'&&s.age!==0)throw Error('配水记录无效');
}
/** One finite authored header tank, actual existing one-pixel water solver, three metered outlets.
 * This is a commissioning batch, not an infinite water source or a hydraulic-pressure solver. */
export class AllocationWorld {
 readonly channels={upstream:emptyEpisodeWater(),settlement:emptyEpisodeWater(),wetland:emptyEpisodeWater(),road:emptyEpisodeWater()};
 readonly pending:Record<AllocationBranch,number>={settlement:0,wetland:0,road:0};
 readonly quotas:Record<AllocationBranch,number>;
 private readonly cycle:AllocationBranch[];
 age=0;
 constructor(readonly mode:AllocationMode,age=0){
  if(!isAllocationMode(mode)||!Number.isSafeInteger(age)||age<0||age>ALLOCATION_MAX_TICKS)throw Error('配水模拟版本或时序无效');
  this.quotas=allocationQuotas(mode);
  this.cycle=[...Array<AllocationBranch>(4).fill(preferred[mode]),...ALLOCATION_BRANCHES.filter(b=>b!==preferred[mode])];
  if(supplyEpisodeWater(this.channels.upstream,ALLOCATION_TOTAL,ALLOCATION_CONTROLS)!==ALLOCATION_TOTAL)throw Error('检定水箱容量不足');
  for(let i=0;i<age;i++){if(this.satisfied)throw Error('配水完成后仍有多余步数');this.advance();}
 }
 get delivered():Record<AllocationBranch,number>{
  return {settlement:this.channels.settlement.escaped,wetland:this.channels.wetland.escaped,road:this.channels.road.escaped};
 }
 get satisfied():boolean{return ALLOCATION_BRANCHES.every(b=>this.channels[b].escaped===this.quotas[b]);}
 advance():void{
  if(this.satisfied)return;
  if(this.age>=ALLOCATION_MAX_TICKS)throw Error('配水检定未在限定时间内完成');
  advanceEpisodeWater(this.channels.upstream,ALLOCATION_CONTROLS,()=>{
   const b=this.cycle[(this.channels.upstream.escaped-1)%6]!;this.pending[b]++;
  });
  for(const b of ALLOCATION_BRANCHES){
   this.pending[b]-=supplyEpisodeWater(this.channels[b],this.pending[b],ALLOCATION_CONTROLS);
   advanceEpisodeWater(this.channels[b],ALLOCATION_CONTROLS);
  }
  this.age++;
 }
}
