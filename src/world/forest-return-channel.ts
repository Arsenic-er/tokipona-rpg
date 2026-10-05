import { advanceEpisodeWater, emptyEpisodeWater, supplyEpisodeWater, validateEpisodeWater, episodeWaterSolid,
  type EpisodeWaterState, type EpisodeWaterControls } from './forest-episode-water';
import type { ReturnFlowWorldFacts } from '../game/return-flow-predicates';

export const RETURN_CHANNEL_BOUNDS = {x:0,y:0,width:480,height:416} as const;
export const RETURN_CHANNEL_FLOOR = 400;
export const RETURN_CHANNEL_PORTS = {upstream:{x:80,y:206},supply:{x:250,y:242},meadow:{x:250,y:310}} as const;
export type ReturnChannelPart = keyof typeof RETURN_CHANNEL_PORTS;
export interface ReturnChannelControls { gate:boolean; sealed:boolean; cleared:boolean }
export interface ReturnChannelState {
  version:1; upstream:EpisodeWaterState; supply:EpisodeWaterState; meadow:EpisodeWaterState;
  spilled:number;
  /** Actual outlet counts for the last two simulation seconds, not elapsed wall time. */
  recent:[number,number,number][];
}
export function emptyReturnChannel():ReturnChannelState {
  return {version:1,upstream:emptyEpisodeWater(),supply:emptyEpisodeWater(),meadow:emptyEpisodeWater(),spilled:0,recent:[]};
}
export function returnChannelControls(part:ReturnChannelPart,c:ReturnChannelControls):EpisodeWaterControls {
  return {kind:'mill',gate:true,cleared:part==='upstream'?c.gate:c.cleared,plugged:false,sourceRate:part==='upstream'?2:0};
}
/** Three native-pixel open channels, coupled by metered ports. This is not a pressure/pipe solver.
 * Only the upstream natural inlet creates accounted water. Neither downstream branch self-fills. */
export function advanceReturnChannel(s:ReturnChannelState,c:ReturnChannelControls):void {
  const lost=s.spilled;
  advanceEpisodeWater(s.upstream,returnChannelControls('upstream',c),()=>{
    const part=s.upstream.escaped%2?'supply':'meadow';
    if(!c.sealed||supplyEpisodeWater(s[part],1,returnChannelControls(part,c))!==1)s.spilled++;
  });
  const supply=advanceEpisodeWater(s.supply,returnChannelControls('supply',c));
  const meadow=advanceEpisodeWater(s.meadow,returnChannelControls('meadow',c));
  s.recent.push([supply,meadow,s.spilled-lost]);if(s.recent.length>120)s.recent.shift();
}
export function returnChannelRates(s:ReturnChannelState):{supply:number;meadow:number;spill:number} {
  return s.recent.reduce((a,r)=>({supply:a.supply+r[0],meadow:a.meadow+r[1],spill:a.spill+r[2]}),{supply:0,meadow:0,spill:0});
}
export function returnChannelFacts(s:ReturnChannelState,c:ReturnChannelControls):ReturnFlowWorldFacts {
  const rates=returnChannelRates(s),full=s.recent.length===120;
  return {settlementSupplyFlowInBand:full&&rates.supply>=30&&rates.supply<=240,
    wetMeadowFlowInBand:full&&rates.meadow>=30&&rates.meadow<=240,overflowContact:rates.spill>0,
    overflowGateSeated:c.gate,overflowSealIntact:c.sealed,overflowConduitClear:c.cleared};
}
export function validateReturnChannel(s:ReturnChannelState):void {
  if(!s||s.version!==1)throw Error('回流渠版本不兼容');
  for(const part of ['upstream','supply','meadow'] as const)validateEpisodeWater(s[part]);
  if(!Number.isSafeInteger(s.spilled)||s.spilled<0||s.upstream.tick!==s.supply.tick||s.supply.tick!==s.meadow.tick||
    s.upstream.supplied>s.upstream.tick*2||s.upstream.escaped!==s.supply.supplied+s.meadow.supplied+s.spilled||
    !Array.isArray(s.recent)||s.recent.length!==Math.min(120,s.upstream.tick)||
    s.recent.some(r=>!Array.isArray(r)||r.length!==3||r.some(n=>!Number.isSafeInteger(n)||n<0||n>160)))throw Error('回流渠水量或时间记录不一致');
  const rates=returnChannelRates(s);
  if(rates.supply>s.supply.escaped||rates.meadow>s.meadow.escaped||rates.spill>s.spilled)throw Error('回流渠出水记录不一致');
}
export function returnChannelMapMaterial(s:ReturnChannelState|undefined,c:ReturnChannelControls,x:number,y:number):number|null {
  for(const part of ['upstream','supply','meadow'] as const){
    const o=RETURN_CHANNEL_PORTS[part],lx=x-o.x,ly=y-o.y;
    if(lx<0||lx>=160||ly<0||ly>=48)continue;
    if(episodeWaterSolid(lx,ly,returnChannelControls(part,c)))return 4;
    if(s?.[part].cells[Math.floor(ly)*160+Math.floor(lx)])return 7;
  }
  return null;
}
