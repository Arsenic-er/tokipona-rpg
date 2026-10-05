import { sha256Canonical, type JsonValue } from '../canonical-json';
import { PrologueReturnFlowSession, PROLOGUE_RETURN_FLOW_REGION_ID } from './prologue-return-flow';
import { returnFlowWorldReady } from './return-flow-predicates';
import { RETURN_CHANNEL_BOUNDS, RETURN_CHANNEL_FLOOR, emptyReturnChannel, advanceReturnChannel, returnChannelFacts,
  returnChannelRates, validateReturnChannel, type ReturnChannelState, type ReturnChannelControls } from '../world/forest-return-channel';

import { GameSession, type GameSessionSave, type GameSessionState } from '../session/game-session';
import generatedRuntimeArtifact from '../generated/content-runtime.v0.1.json';
import { readRuntimeCisternTaskManifest } from '../content/runtime-task-manifest';
import { readVerifiedCapabilityMilestoneContract } from '../session/capability-contract';
import { proposeCapabilityMilestone } from '../session/adapters';
import { CISTERN_WINDOW, CisternWindow, WINDOW_EXPRESSIONS, windowPreview, executeWindowCast, type CisternWindowState, type WindowExpression } from '../world/forest-cistern-window';
import type { TeloCastPlan } from '../spells/cast-plan';
import { CastExecutionLedger } from '../spells/cast-plan';
import { CisternLearningSession } from '../learning/cistern-session';
import { CISTERN_ROOM_BOUNDS, cisternRoomSolid, cisternRoomCollides, stepCisternClimb, validateCisternClimb, type CisternClimb } from '../world/forest-cistern-room';
import { CISTERN_CALIBRATION, CisternCalibration, previewCalibration, type CalibrationState } from '../world/forest-cistern-calibration';
import { CISTERN_SIPHON, CisternSiphon, previewSiphon, type SiphonState } from '../world/forest-cistern-siphon';
import { emptyCisternLift, beginCisternLift, stepCisternLift, validateCisternLift, liftCarriesPlayer, liftDeck, type CisternLiftState } from '../world/forest-cistern-lift';
import { intersects } from '../runtime/geometry';
const phraseContract = readVerifiedCapabilityMilestoneContract(generatedRuntimeArtifact.capabilityProgression, readRuntimeCisternTaskManifest(generatedRuntimeArtifact).capacityMilestoneRef);
import { commitSessionProposal, type SessionEventDraft } from '../session/adapters';
import { PrologueForestOpeningSession } from './prologue-forest-opening';
import { stepPlayerMotion, EMPTY_JUMP_GRACE, type PlayerMotionState, type PlayerMotionInput, type PlayerJumpGrace } from '../runtime/player-motion';
import type { PlayerState } from '../runtime/runtime';
import type { Aabb } from '../runtime/geometry';
import { woodlandMeadowY } from '../world/forest-surface-profile';
import { hasMillValley, millValleyGroundY, type EpisodeTerrainProfile } from '../world/forest-mill-terrain';
import { hermitClearingGroundY } from '../world/forest-hermit-terrain';
import { cisternEntryFloor, cisternEntryCeiling, CISTERN_ENTRY_GATE } from '../world/forest-cistern-entry';
import { advanceMillTailrace, emptyMillTailrace, receiveMillOutflow, validateMillTailrace, type MillTailraceState } from '../world/forest-mill-tailrace';
import { advanceEpisodeWater, emptyEpisodeWater, supplyEpisodeWater, collectedEpisodeWater,
  validateEpisodeWater, type EpisodeWaterState, type EpisodeWaterControls } from '../world/forest-episode-water';

export const EPISODE_SAVE_KEY = 'tokipona.forest-waterwheel-episode.v0.1';
export const OPENING_SAVE_KEY = 'tokipona.forest-opening.vertical-slice.v0.1';
export const EPISODE_BOUNDS = { x: 0, y: 0, width: 1024, height: 480 } as const;
export type EpisodePlace = 'settlement' | 'mill' | 'hermit' | 'cistern-entry' | 'cistern' | 'return-channel';
export const EPISODE_PLACES = { settlement: '林间聚落', mill: '旧水轮工坊', hermit: '隐士林地', 'cistern-entry': '蓄水廊检修入口', cistern:'高位蓄水室', 'return-channel':'回流湿地检修渠' } as const;
export const episodeBounds=(place:EpisodePlace)=>place==='cistern'?CISTERN_ROOM_BOUNDS:place==='return-channel'?RETURN_CHANNEL_BOUNDS:EPISODE_BOUNDS;
const EPISODE_SCENES: Record<EpisodePlace, string> = {
  settlement: 'scene.valley.settlement', mill: 'scene.valley.waterwheel',
  hermit: 'scene.valley.stream_section', 'cistern-entry': 'scene.valley.high_cistern', cistern:'scene.valley.high_cistern',
  'return-channel':'scene.valley.return_channel',
};
export type EpisodeTarget = 'worker' | 'mill-road' | 'hermit-road' | 'return' | 'timber' | 'brace' | 'gate' | 'silt' | 'medium' | 'hermit' | 'pool' | 'plug' | 'rest' |
  'cistern-road' | 'entry-survey' | 'entry-winch' | 'entry-seal' | 'window' | 'window-bypass' |
  'room-road' | 'room-echo' | 'east-up' | 'east-down' | 'west-up' | 'west-down' | 'calibration' | 'calibration-tool' | 'upper-survey' |
  'siphon' | 'siphon-left' | 'siphon-right' | 'siphon-tool' | 'lift-up' | 'lift-down' | 'return-winch' | 'top-exit' | 'cistern-shortcut' |
  'return-channel-road' | 'flow-inspect' | 'flow-gate' | 'flow-seal' | 'flow-clear' | 'flow-gauge' | 'flow-spout' | 'flow-depth';
export const EPISODE_TARGETS: Readonly<Record<EpisodePlace, readonly { id: EpisodeTarget; x: number; y?:number; label: string }[]>> = {
  settlement: [{ id: 'hermit-road', x: 60, label: '西侧林间小径' }, { id: 'worker', x: 350, label: '工务人' }, { id: 'mill-road', x: 920, label: '沿水渠去工坊' }],
  mill: [{ id: 'return', x: 60, label: '返回聚落' }, { id: 'timber', x: 270, label: '备用木撑' }, { id: 'gate', x: 490, label: '水渠闸柄' },
    { id: 'silt', x: 585, label: '渠道淤堵' }, { id: 'brace', x: 690, label: '水轮支架' }, { id: 'medium', x: 890, label: '检修石龛' },
    { id: 'cistern-road', x: 978, label: '蓄水廊检修入口' },{id:'cistern-shortcut',x:812,label:'回流道永久梯'}],
  hermit: [{ id: 'return', x: 60, label: '返回聚落' }, { id: 'rest', x: 270, label: '林下坐垫' }, { id: 'hermit', x: 410, label: '隐士' },
    { id: 'pool', x: 620, label: '练习石槽' }, { id: 'plug', x: 720, label: '漏口与木楔' }],
  'cistern-entry': [{ id: 'return', x: 60, label: '返回工坊' }, { id: 'entry-survey', x: 260, label: '隔栅检修标记' },
    { id: 'entry-winch', x: 490, label: '手动绞盘' }, { id: 'entry-seal', x: 890, label: '深处门框' },
    { id: 'window', x: 718, label: '精密引水窗' }, { id: 'window-bypass', x: 820, label: '引水窗旁通阀' },
    {id:'room-road',x:970,label:'通往高位蓄水室'}],
  cistern:[{id:'return',x:58,y:736,label:'返回检修入口'},{id:'room-echo',x:170,y:736,label:'入口回声'},
    {id:'east-up',x:416,y:736,label:'攀上东侧检修梯'},{id:'east-down',x:372,y:544,label:'下到入口层'},
    {id:'calibration',x:324,y:544,label:'双层校准阀'},{id:'calibration-tool',x:180,y:544,label:'校准阀导槽'},
    {id:'west-up',x:56,y:544,label:'攀上西侧检修梯'},{id:'west-down',x:114,y:352,label:'返回校准层'},
    {id:'upper-survey',x:350,y:352,label:'高位虹吸与停靠台'},
    {id:'siphon-left',x:162,y:352,label:'修复西侧支撑肋'},{id:'siphon',x:228,y:352,label:'虹吸引水锚点'},
    {id:'siphon-right',x:286,y:352,label:'修复东侧支撑肋'},{id:'siphon-tool',x:414,y:352,label:'虹吸手动导水柄'},
    {id:'lift-up',x:458,y:352,label:'水力升降机下站'},{id:'lift-down',x:376,y:128,label:'水力升降机上站'},
    {id:'return-winch',x:100,y:128,label:'回流道捷径绞盘'},{id:'top-exit',x:272,y:128,label:'沿回流道返回工坊'},
    {id:'return-channel-road',x:196,y:128,label:'沿支渠前往回流湿地'}],
  'return-channel':[{id:'return',x:32,label:'返回蓄水室顶层'},{id:'flow-inspect',x:84,label:'回流渠检修牌'},
    {id:'flow-gate',x:144,label:'扶正溢流闸'},{id:'flow-seal',x:208,label:'修补分流口密封'},
    {id:'flow-clear',x:272,label:'清理双路导管'},{id:'flow-gauge',x:344,label:'双路水量标尺'},
    {id:'flow-spout',x:408,label:'聚落供水口与湿地出水口'},{id:'flow-depth',x:462,label:'通向地下的旧渠口'}],
};
const FLAG = 'forest.episode.';
const CHECKS = ['job', 'timber', 'brace', 'cleared', 'repaired', 'medium', 'route', 'intro', 'observed', 'predicted', 'plugged', 'practiced', 'debrief', 'finished', 'entry_observed', 'entry_open', 'entry_surveyed', 'meditated', 'phrase', 'window_inspected', 'window_cast', 'window_bypass', 'window_filled'] as const;
export type EpisodeFlag = typeof CHECKS[number];
const ROOM_FLAGS=['entered','echo','valve_seen','valve_tool','valve_filled','upper_seen','siphon_left','siphon_right','siphon_tool','siphon_primed','lift_open','lift_arrived','return_open','exited','reported'] as const;
type RoomFlag=typeof ROOM_FLAGS[number];
const FLOW_FLAGS=['entered','inspected','gate','sealed','cleared','restored','observed'] as const;
type FlowFlag=typeof FLOW_FLAGS[number];
const FLOW_SOLUTION='return_flow.repair_overflow';
export function episodeGround(place: EpisodePlace, x: number, profile?: EpisodeTerrainProfile): number {
  if (place==='return-channel') return RETURN_CHANNEL_FLOOR;
  if (place==='cistern') return 736;
  if (place === 'cistern-entry') return cisternEntryFloor(x);
  if (place === 'settlement' && profile !== undefined) return woodlandMeadowY(x);
  if (place === 'mill' && hasMillValley(profile)) return millValleyGroundY(x);
  if (place === 'hermit' && profile === 'forest-clearing-v1') return hermitClearingGroundY(x);
  // A shallow walkable ground profile, shared by drawing and collision. No decorative collision floors.
  if (place === 'mill') return 336;
  return 336 + Math.round(Math.sin(x / 100 + (place === 'hermit' ? 1 : 0)) * 4);
}
export function episodeCollides(place: EpisodePlace, b: Aabb, profile?: EpisodeTerrainProfile, entryOpen = false, upperOpen=false,liftOpen=false): boolean {
  if (place==='cistern') return cisternRoomCollides(b,upperOpen,liftOpen);
  if (b.x < 0 || b.x + b.width > episodeBounds(place).width || b.y < 0) return true;
  if (place === 'cistern-entry') {
    if (b.x < 8 || b.x + b.width > 1008) return true;
    if (!entryOpen && b.x < CISTERN_ENTRY_GATE.right && b.x + b.width > CISTERN_ENTRY_GATE.left) return true;
    for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.width); x++)
      if (b.y < cisternEntryCeiling(x) + 1) return true;
  }
  for (let x = Math.floor(b.x); x < Math.ceil(b.x + b.width); x++) if (b.y + b.height > episodeGround(place, x, profile)) return true;
  return false;
}
interface EpisodePhysical {
  terrainProfile?: EpisodeTerrainProfile;
  place: EpisodePlace; player: PlayerMotionState; tick: number;
  gate: boolean; mill: EpisodeWaterState; practice: EpisodeWaterState;
  tailrace?: MillTailraceState;
  window?: CisternWindowState;
  calibration?:CalibrationState;
  siphon?:SiphonState;
  echoAge?:number;
  climb?:CisternClimb;
  lift?:CisternLiftState;
  returnFlow?:ReturnChannelState;
  wheelSpeed: number; stableTicks: number; wheelAngle: number; casts: number; baselineCollected: number;
}
export interface ForestEpisodeSave {
  schema: 'tokipona.forest-waterwheel-episode.v0.1';
  openingChecksum: string; session: GameSessionSave; physical: EpisodePhysical; checksum: string;
}
export interface EpisodeResult { accepted: boolean; text: string; speaker?: string; choice?: 'work' | 'predict' | 'recall' | 'calibrate' | 'window' | 'calibration' | 'siphon' }

/** Owns ALL episode progression. UI supplies only input/target/choice, never position or completion claims. */
export class ForestEpisode {
  readonly terrainProfile?: EpisodeTerrainProfile;
  private session: GameSession;
  private truth: GameSessionState;
  private physical: EpisodePhysical;
  private previousJump = false;
  private windowPhysics?: CisternWindow;
  private windowCellsCache?: number[];
  private calibrationPhysics?:CisternCalibration;
  private calibrationCellsCache?:number[];
  private siphonPhysics?:CisternSiphon;
  private siphonCellsCache?:number[];
  private echoPhysics?:CisternCalibration;
  private echoCellsCache?:number[];
  private grace: PlayerJumpGrace = EMPTY_JUMP_GRACE;
  private constructor(session: GameSession, private readonly openingChecksum: string, physical?: EpisodePhysical) {
    this.session = session; this.truth = session.snapshot();
    this.terrainProfile = physical ? physical.terrainProfile : 'forest-clearing-v1';
    if (this.terrainProfile !== undefined && this.terrainProfile !== 'woodland-v2' && !hasMillValley(this.terrainProfile)) throw new Error('章节地形版本不兼容');
    this.physical = physical ?? { terrainProfile: 'forest-clearing-v1', place: 'settlement', player: this.spawn('settlement', 120), tick: 0,
      gate: false, mill: emptyEpisodeWater(), practice: emptyEpisodeWater(), wheelSpeed: 0, stableTicks: 0, wheelAngle: 0, casts: 0, baselineCollected: 0 };
  }
  static begin(opening: PrologueForestOpeningSession): ForestEpisode {
    if (opening.snapshot().mode !== 'settlement_perimeter') throw new Error('请先穿过溪路，抵达聚落');
    if (opening.snapshot().session.mp.maxMp < 2) throw new Error('该存档的最大 MP 不足以进行初次练习；保留原档，需先处理能力配置');
    const save = opening.toSave();
    const result = new ForestEpisode(GameSession.fromSave(save.session), save.checksum);
    result.commit('enter', [{ type: 'scene_entered', eventId: 'episode.enter', payload: { sceneId: 'scene.valley.settlement' } }]);
    return result;
  }
  static restore(candidate: unknown): ForestEpisode {
    const s = candidate as ForestEpisodeSave;
    if (!s || s.schema !== EPISODE_SAVE_KEY || typeof s.openingChecksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(s.openingChecksum)) throw new Error('章节存档版本不兼容');
    const { checksum, ...body } = s;
    if (sha256Canonical(body as unknown as JsonValue) !== checksum) throw new Error('章节存档校验失败');
    const game = new ForestEpisode(GameSession.fromSave(s.session), s.openingChecksum, structuredClone(s.physical));
    game.validate();
    return game;
  }
  toSave(): ForestEpisodeSave {
    const body = { schema: EPISODE_SAVE_KEY as typeof EPISODE_SAVE_KEY, openingChecksum: this.openingChecksum, session: this.session.toSave(), physical: structuredClone(this.physical) };
    return { ...body, checksum: sha256Canonical(body as unknown as JsonValue) };
  }
  has(flag: EpisodeFlag): boolean { return this.truth.world.flags['global:' + FLAG + flag]?.value === true; }
  get state(): Readonly<EpisodePhysical> { return this.physical; }
  get targets(){return EPISODE_TARGETS[this.physical.place].filter(t=>
    (t.id!=='cistern-shortcut'&&t.id!=='return-channel-road')||this.hasRoom('return_open'));}
  get ridingLift():boolean{return liftCarriesPlayer(this.physical.lift);}
  roomSolidAt(x:number,y:number):boolean{return cisternRoomSolid(x,y,this.hasRoom('valve_filled'),this.hasRoom('lift_open'))||
    !!this.physical.lift&&intersects({x,y,width:1,height:1},liftDeck(this.physical.lift));}
  private collides(b:Aabb):boolean{return episodeCollides(this.physical.place,b,this.terrainProfile,this.has('entry_open'),this.hasRoom('valve_filled'),this.hasRoom('lift_open'));}
  groundAt(x: number, place: EpisodePlace = this.physical.place): number { return episodeGround(place, x, this.terrainProfile); }
  get sessionState(): GameSessionState { return this.truth; }
  get player(): PlayerState { const p = this.physical.player; return { position: { x: p.x, y: p.y }, velocity: { x: p.velocityX, y: p.velocityY }, grounded: p.grounded, body: { width: 12, height: 14 } }; }
  controls(kind: 'mill' | 'practice'): EpisodeWaterControls {
    return { kind, gate: this.physical.gate, cleared: this.has('cleared'), plugged: this.has('plugged') };
  }
  targetFloor(t:{x:number;y?:number}):number{return t.y??this.groundAt(t.x);}
  private get calibrationWorld():CisternCalibration{return this.calibrationPhysics??=new CisternCalibration(this.physical.calibration);}
  get calibrationCells():readonly number[]{return this.calibrationCellsCache??=this.calibrationWorld.cells();}
  get calibrationCollected():number{return this.calibrationWorld.collected;}
  get calibrationVersion():1|2{return this.physical.calibration?.version??2;}
  get echoCells():readonly number[]{
    this.echoPhysics??=new CisternCalibration(this.physical.echoAge===undefined?undefined:{version:1,age:this.physical.echoAge,events:[{at:0,kind:'cast',expression:'telo'}]},100,100,1);
    return this.echoCellsCache??=this.echoPhysics.cells();
  }
  private get siphonWorld():CisternSiphon{return this.siphonPhysics??=new CisternSiphon(this.physical.siphon);}
  get siphonCells():readonly number[]{return this.siphonCellsCache??=this.siphonWorld.cells();}
  get siphonCollected():number{return this.siphonWorld.collected;}
  get siphonSupported():boolean{return this.hasRoom('siphon_left')||this.hasRoom('siphon_right');}
  get siphonReleased():boolean{return this.siphonWorld.tankReleased;}
  private siphonReady():boolean{const s=this.physical.siphon;return !s||s.age>=s.events.at(-1)!.at+CISTERN_SIPHON.settleTicks;}
  private siphonZones(){const p=this.physical.player;return [{entityId:'player',boundsPx:{x:p.x-CISTERN_SIPHON.x,y:p.y-CISTERN_SIPHON.y,width:12,height:14}}];}
  previewSiphon(expression:WindowExpression):ReturnType<ForestEpisode['previewWindow']>{
    if(!WINDOW_EXPRESSIONS.includes(expression)||this.nearest()?.id!=='siphon'||!this.hasRoom('upper_seen')||
      this.siphonReleased||!this.siphonReady()||(this.physical.siphon?.events.filter(e=>e.kind==='cast').length??0)>=2)return null;
    const mp=this.truth.mp,{plan}=previewSiphon(this.physical.siphon,expression,mp.currentMp,mp.maxMp,this.siphonZones());
    const capacity=expression==='telo'||this.truth.capabilities.expressionCapacityWords>=2;
    const supported=expression!=='telo suli'||this.siphonSupported;
    return {plan,canConfirm:capacity&&supported&&plan.canConfirm,reason:!capacity?'当前组合容量不足，可用右侧手动导水柄。':
      !supported?'长水段需要稳定支撑：目前 0.65，修复任一支撑肋后为 0.75；两侧不叠加。不扣 MP。':
      plan.rejectionCode==='requested_class_requires_more_mp'?'MP 不足，不降档、不扣费；可以用右侧手动导水柄。':
      !plan.canConfirm?'当前空间或生物安全范围受阻，不扣 MP。':
      '水舌距锚点 58 px。短／默认水段合法，但落入近端回收沟；够到远端水舌才释放水箱原有水。支撑只稳定长水段，不增加压力、初速度或伤害。'};
  }
  confirmSiphon(expression:WindowExpression,planId:string):EpisodeResult{
    const preview=this.previewSiphon(expression);
    if(!preview||!preview.canConfirm||preview.plan.planId!==planId)return {accepted:false,text:preview?.reason??'请靠近虹吸锚点重新预览。'};
    const mp=this.truth.mp,zones=this.siphonZones(),{world,plan}=previewSiphon(this.physical.siphon,expression,mp.currentMp,mp.maxMp,zones);
    const result=world.confirm(plan,this.siphonSupported,zones);
    if(!result.committed)return {accepted:false,text:'没有生成水，也没有扣 MP。请重新检查支撑和空间。'};
    const s=this.physical.siphon??{version:1 as const,age:0,events:[]};
    const i=s.events.length,braced=this.siphonSupported;
    this.commit('siphon.cast.'+i,[{eventId:'episode.siphon.mp.'+i,type:'mp_replaced',
      payload:{mp:{...mp,currentMp:mp.currentMp-result.mpCharge,worldVersion:mp.worldVersion+1}}},
      {eventId:'episode.siphon.expression.'+i,type:'world_flag_set',
      payload:{flagId:'forest.episode.siphon.cast.'+i,value:expression+':'+s.age+':'+braced,scope:'global'}}],'cast');
    s.events.push({at:s.age,kind:'cast',expression,braced});this.physical.siphon=s;
    this.siphonPhysics=world;this.siphonCellsCache=undefined;
    return {accepted:true,text:`释放 ${expression}，消耗 ${result.mpCharge} MP。关闭面板看水下落；水箱和接水槽有刻度。若距离不够，可等水落稳后调整，或用右侧手动导水柄。`};
  }
  private calibrationReady():boolean{
    const s=this.physical.calibration;
    return !s || s.age>=s.events.at(-1)!.at+180;
  }
  previewCalibration(expression:WindowExpression):ReturnType<ForestEpisode['previewWindow']>{
    if(!WINDOW_EXPRESSIONS.includes(expression)||this.nearest()?.id!=='calibration'||!this.hasRoom('valve_seen')||
      this.hasRoom('valve_filled')||!this.calibrationReady()||this.hasRoom('valve_tool')||
      (this.physical.calibration?.events.filter(e=>e.kind==='cast').length??0)>=2)return null;
    const p=this.physical.player,mp=this.truth.mp;
    const zones=[{entityId:'player',boundsPx:{x:p.x-CISTERN_CALIBRATION.x,y:p.y-CISTERN_CALIBRATION.y,width:12,height:14}}];
    const {plan}=previewCalibration(this.physical.calibration,expression,mp.currentMp,mp.maxMp,zones);
    const capacity=expression==='telo'||this.truth.capabilities.expressionCapacityWords>=2;
    return {plan,canConfirm:capacity&&plan.canConfirm,reason:!capacity?'当前组合容量不足；可用导槽和现场水继续。':
      plan.rejectionCode==='requested_class_cannot_be_realized_here'?'当前空间无法形成所选形态，不扣 MP。':
      plan.rejectionCode==='requested_class_requires_more_mp'?'MP 不足；可用导槽，不降档、不扣费。':
      !plan.canConfirm?'安全范围受阻，不扣 MP。':this.calibrationVersion===1?'可以释放。旧式盘需要至少 1.6 MU；短水段合法但单次水量不足。':'可以释放。短水段落入近端回收槽；默认水段接触远端水舌，打开入水口。水仍须落进深盘达到 1.6 MU 才开阀。'};
  }
  confirmCalibration(expression:WindowExpression,planId:string):EpisodeResult{
    const preview=this.previewCalibration(expression);
    if(!preview||!preview.canConfirm||preview.plan.planId!==planId)return {accepted:false,text:preview?.reason??'请靠近校准阀重新预览。'};
    const p=this.physical.player,mp=this.truth.mp,zones=[{entityId:'player',boundsPx:{x:p.x-CISTERN_CALIBRATION.x,y:p.y-CISTERN_CALIBRATION.y,width:12,height:14}}];
    const {world,plan}=previewCalibration(this.physical.calibration,expression,mp.currentMp,mp.maxMp,zones);
    const result=world.confirm(plan,zones);
    if(!result.committed)return {accepted:false,text:'形态没有生成，也没有扣 MP。'};
    const state=this.physical.calibration??{version:2 as const,age:0,events:[]};
    this.commit('valve.cast.'+state.events.length,[{eventId:'episode.valve.mp.'+state.events.length,type:'mp_replaced',
      payload:{mp:{...mp,currentMp:mp.currentMp-result.mpCharge,worldVersion:mp.worldVersion+1}}},
      {eventId:'episode.valve.expression.'+state.events.length,type:'world_flag_set',
       payload:{flagId:'forest.episode.room.cast.'+state.events.length,value:expression+':'+state.age,scope:'global'}}],'cast');
    state.events.push({at:state.age,kind:'cast',expression:expression as 'telo'|'telo lili'});
    this.physical.calibration=state;this.calibrationPhysics=world;this.calibrationCellsCache=undefined;
    return {accepted:true,text:`释放 ${expression}，消耗 ${result.mpCharge} MP。关闭面板后观察接水盘；不足时可调整左侧导槽，或等水落稳后重新比较。`};
  }
  hasRoom(flag:RoomFlag):boolean{return this.truth.world.flags['global:forest.episode.room.'+flag]?.value===true;}
  hasFlow(flag:FlowFlag):boolean{return this.truth.world.flags['global:forest.episode.flow.'+flag]?.value===true;}
  get flowControls():ReturnChannelControls{return {gate:this.hasFlow('gate'),sealed:this.hasFlow('sealed'),cleared:this.hasFlow('cleared')};}
  private markFlow(flag:FlowFlag,extra:SessionEventDraft[]=[]):void{
    this.commit('flow.'+flag,[{eventId:'episode.flow.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.flow.'+flag,value:true,scope:'global'}},...extra]);
  }
  private enterReturnChannel():EpisodeResult{
    if(!this.hasRoom('return_open')||this.physical.place!=='cistern')return {accepted:false,text:'先放下顶层的永久检修梯。'};
    // Lazy bridge: genuine completed winch action satisfies the existing regional entry contract.
    // Pre-bridge saves still round-trip byte-for-byte until the player chooses this route.
    if(!this.hasFlow('entered'))this.markFlow('entered',[{eventId:'episode.flow.entry.ladder',type:'world_flag_set',
      payload:{flagId:'exit_ladder_lowered',value:true,scope:'region',regionId:PROLOGUE_RETURN_FLOW_REGION_ID}}]);
    const result=PrologueReturnFlowSession.enterFromCistern(this.session,'episode.flow.entry.'+this.truth.revision);
    if(!result.accepted||!result.returnFlow)throw Error('回流渠入口未提交：'+result.reason);
    this.session=result.returnFlow.session;this.truth=this.session.snapshot();
    this.physical.returnFlow??=emptyReturnChannel();this.physical.place='return-channel';
    this.physical.player=this.spawn('return-channel',26);this.previousJump=false;this.grace=EMPTY_JUMP_GRACE;
    return {accepted:true,text:'顺着分出的旧渠走出石室。上游已经有水，分流口却在漏；两块水量标尺分别通向聚落和湿地。身后的检修路随时可以返回。'};
  }
  private advanceReturnFlow():void{
    const s=this.physical.returnFlow!;advanceReturnChannel(s,this.flowControls);
    if(this.hasFlow('restored')||!this.hasFlow('inspected')||!returnFlowWorldReady(FLOW_SOLUTION,returnChannelFacts(s,this.flowControls)))return;
    const actions=[this.hasFlow('inspected')?'inspect_indicator':null,this.hasFlow('gate')?'reseat_gate':null,
      this.hasFlow('sealed')?'repair_seal':null,this.hasFlow('cleared')?'clear_conduit':null]
      .filter((a):a is string=>a!==null).map(a=>FLOW_SOLUTION+'.'+a);
    const coordinator=new PrologueReturnFlowSession(this.session);
    const result=coordinator.completeSolution('episode.flow.restore',FLOW_SOLUTION,{
      completedActionIds:actions,world:returnChannelFacts(s,this.flowControls)});
    if(!result.accepted)throw Error('回流渠结果未提交：'+result.reason);
    this.session=coordinator.session;this.truth=this.session.snapshot();this.markFlow('restored');
  }
  private markRoom(flag:RoomFlag,extra:SessionEventDraft[]=[]):void{
    this.commit('room.'+flag,[{eventId:'episode.room.'+flag,type:'world_flag_set',payload:{flagId:'forest.episode.room.'+flag,value:true,scope:'global'}},...extra]);
  }
  private get windowWorld(): CisternWindow { return this.windowPhysics ??= new CisternWindow(this.physical.window); }
  get windowCells(): readonly number[] { return this.windowCellsCache ??= this.windowWorld.cells(); }
  get windowCollected(): number { return this.windowWorld.collected; }
  private windowZones() {
    const p=this.physical.player;
    return [{entityId:'player',boundsPx:{x:p.x-CISTERN_WINDOW.x,y:p.y-CISTERN_WINDOW.y,width:12,height:14}}];
  }
  previewWindow(expression: WindowExpression): { plan: TeloCastPlan; canConfirm: boolean; reason: string } | null {
    if (!WINDOW_EXPRESSIONS.includes(expression) || this.nearest()?.id!=='window' || !this.has('entry_surveyed') || !this.has('window_inspected') || this.physical.window) return null;
    const mp=this.truth.mp, plan=windowPreview(expression,mp.currentMp,mp.maxMp,this.windowZones());
    const capacity=expression==='telo' || this.truth.capabilities.expressionCapacityWords>=2;
    const reason=!capacity ? '当前只能组成单词表达；可回隐士处休息并做回忆校准，或用右边旁通阀。' :
      plan.rejectionCode==='requested_class_cannot_be_realized_here' ? '当前空间无法形成所选形态；不会自动缩短，不扣 MP。' :
      plan.rejectionCode==='requested_class_requires_more_mp' ? 'MP 不足；不降档、不扣费，可使用旁通阀。' :
      !plan.canConfirm ? '安全范围受阻；站稳后重新预览，不扣 MP。' : '可确认。释放后水受重力下落，接水杯收到水才算完成。';
    return {plan,canConfirm:capacity&&plan.canConfirm,reason};
  }
  confirmWindow(expression: WindowExpression, planId: string): EpisodeResult {
    const preview=this.previewWindow(expression);
    if (!preview || preview.plan.planId!==planId || !preview.canConfirm) return {accepted:false,text:preview?.reason??'预览已失效。请靠近引水窗重新查看。'};
    const mp=this.truth.mp, execution=executeWindowCast(expression,mp.currentMp,mp.maxMp,this.windowZones());
    if (!execution.committed) return {accepted:false,text:'当前空间已变化，没有扣除 MP。请重新预览。'};
    this.mark('window_cast',[{eventId:'episode.window.mp',type:'mp_replaced',payload:{mp:{...mp,currentMp:mp.currentMp-execution.paid,worldVersion:mp.worldVersion+1}}}]);
    this.physical.window={source:'cast',age:0}; this.windowPhysics=undefined; this.windowCellsCache=undefined;
    return {accepted:true,text:`释放了 ${expression}，消耗 ${execution.paid} MP。关闭面板后观察水落入接水杯；此次有词语说明，不计为无提示掌握。`};
  }
  private calibratePhrase(choice?: string): EpisodeResult {
    if (this.truth.capabilities.expressionCapacityWords>=2) return {accepted:true,text:'你已经能组成两词表达；不重复提高容量或回复 MP。',speaker:'隐士'};
    if (!this.has('meditated')) return {accepted:true,text:'先在左边坐垫平复呼吸，再回来试着回忆。',speaker:'隐士'};
    if (choice?.trim().toLowerCase()!=='telo') return {accepted:true,choice:'recall',speaker:'隐士',
      text:choice ? '还没有对上。可以回头看笔记，准备好再试；不扣 MP，也不要求现在完成。' : '先前水壶和石槽旁反复出现的那个词，表示水或液体。你还记得怎样写吗？'};
    if (this.truth.mp.maxMp>phraseContract.resultingState.maxMp || this.truth.capabilities.focusSlots>phraseContract.resultingState.focusSlots)
      return {accepted:false,text:'此存档已有更高阶能力配置；不会覆盖它。暂可使用旁通阀。'};
    this.mark('phrase',[...proposeCapabilityMilestone('episode.phrase',phraseContract).drafts]);
    return {accepted:true,speaker:'隐士',text:'你记起来了。我们把媒介的两道刻槽重新校准：现在可组成两词表达，最大 MP 按既有进阶规则提高；当前 MP 没有补满。地下标尺中的 lili / suli 分别带有小／少、大／多的宽泛含义；在那套引水框架里，它们只改变长度，不改变威力。'};
  }
  get objective(): string {
    if (this.has('finished')) {
      if(this.hasFlow('observed'))return '聚落和湿地已恢复分流；可以回村查看水口，地下秩序节点与旧矿道仍未开放';
      if(this.hasFlow('restored'))return '两路供水已稳定；靠近回流渠水量标尺，确认聚落和湿地的实际变化';
      if(this.hasFlow('entered'))return '查看检修牌，扶正溢流闸、补密封、清导管；观察两路水量稳定后再读标尺';
      if(this.hasRoom('reported'))return '高位水路已交接；沿永久梯回到顶层，从支渠前往回流湿地';
      if(this.hasRoom('exited'))return '已沿回流道返回工坊；回聚落告诉工务人水路的变化';
      if(this.hasRoom('return_open'))return '回流道永久梯已放下；从顶层出口返回工坊，或乘升降机回访下层';
      if(this.hasRoom('lift_arrived'))return '已到顶层；转动左侧绞盘放下永久梯，再沿回流道返回工坊';
      if(this.hasRoom('siphon_primed'))return '高位虹吸已通水；右侧水力升降机可登乘，也可沿原检修梯返回';
      if(this.hasRoom('upper_seen'))return '修复任一支撑，尝试远距引水；也可用手动导水柄，沿检修梯可随时返回';
      if(this.hasRoom('valve_filled'))return '双层校准阀已开启西侧检修梯；可上行调查高位虹吸，或原路返回';
      if(this.hasRoom('entered'))return '入口回声可观察默认水段；沿东侧梯上行，在双层校准阀比较水量或使用导槽';
      if (this.has('window_filled')) return '精密引水窗已通水，右侧检修门通向高位蓄水室；碎片留在行囊';
      if (this.has('window_inspected')) return '可在引水窗比较形态，或用右侧旁通阀引入已有水；低 MP 不会卡住进度';
      if (this.has('entry_surveyed')) return '门框左侧有一套精密引水窗；查看标尺或用旁通阀，其他深处机关尚未开放';
      if (this.has('entry_open')) return '隔栅已固定，沿检修坡道看看深处门框';
      if (this.has('entry_observed')) return '检修标记说明了绞盘用途；可用手动绞盘抬起隔栅';
      return '小节已结算 · 可自由回访，或从工坊右侧进入蓄水廊检修入口';
    }
    if (this.has('debrief')) return '回聚落找工务人报平安，领取报酬';
    if (this.has('practiced')) return '找隐士复盘这次练习，问下一步去哪里';
    if (this.has('predicted')) return this.physical.casts ? '用木楔补住漏口，再试一次；让清水抵达右端接水盆' : '在石槽旁 E 小量施放 telo（2 MP），观察水往哪里走';
    if (this.has('observed')) return '石槽旁 E：先预测，再尝试，不必猜词拼写';
    if (this.has('intro')) return '靠近石槽 E，观察自然水与刻字';
    if (this.has('route')) return '沿聚落西侧林间小径，带着媒介寻找隐士';
    if (this.has('medium')) return '带着受损媒介和森林碎片回聚落，请工务人辨认';
    if (this.has('repaired')) return '水轮稳定了；到工坊右侧检修石龛取出异物';
    if (this.has('job')) return !this.has('brace') ? '去东边工坊：从木料架取木撑，装在水轮支架上' : !this.has('cleared') ? '清掉水渠淤堵，再扳动闸柄引水' : '打开水闸，观察水流抵达水轮，确认稳定运转';
    return '在林间聚落找工务人，问能否用维修换一晚落脚';
  }
  nearest(): { id: EpisodeTarget; x: number; label: string } | null {
    const p = this.physical.player;
    if(this.physical.climb||this.ridingLift)return null;
    return this.targets.filter(t => Math.abs(t.x - (p.x + 6)) <= 30 && Math.abs(p.y + 14 - this.targetFloor(t)) <= 28 &&
      (this.physical.place!=='cistern'||p.y+14<=this.targetFloor(t)+.01))
      .sort((a, b) => Math.abs(a.x - p.x - 6) - Math.abs(b.x - p.x - 6))[0] ?? null;
  }
  advance(input: PlayerMotionInput = { moveX: 0, jump: false }): void {
    const p = this.physical;
    const advanceLift=()=>{
      const before=p.lift!,wasRiding=liftCarriesPlayer(before);
      const motion=stepCisternLift(before,p.player,b=>cisternRoomCollides(b,this.hasRoom('valve_filled'),true));
      p.lift=motion.lift;if(wasRiding)p.player=motion.player;
      if(wasRiding&&motion.lift.mode==='idle'&&motion.lift.to==='top'&&!this.hasRoom('lift_arrived')){
        this.markRoom('lift_arrived',[{eventId:'episode.room.top.checkpoint',type:'checkpoint_set',
          payload:{checkpoint:{id:'forest.episode.cistern.top',sceneId:EPISODE_SCENES.cistern,position:{x:372,y:114},revision:this.truth.checkpoint.revision+1}}}]);
      }
    };
    if(p.place==='cistern'&&this.ridingLift){
      advanceLift();this.previousJump=false;this.grace=EMPTY_JUMP_GRACE;
    }else if(p.climb){
      const motion=stepCisternClimb(p.player,p.climb,this.hasRoom('valve_filled'));
      p.player=motion.player;if(motion.climb)p.climb=motion.climb;else delete p.climb;
      this.previousJump=false;this.grace=EMPTY_JUMP_GRACE;
    }else{
      const motion = stepPlayerMotion({ state: p.player, body: { width: 12, height: 14 }, input: { moveX: Number.isFinite(input.moveX) ? Math.max(-1, Math.min(1, input.moveX)) : 0, jump: !!input.jump },
        previousJump: this.previousJump, jumpGrace: this.grace, fixedSeconds: 1 / 60,
        collides: b => this.collides(b)||(p.place==='cistern'&&!!p.lift&&intersects(b,liftDeck(p.lift))) });
      p.player = motion.state; this.previousJump = motion.previousJump; this.grace = motion.jumpGrace ?? EMPTY_JUMP_GRACE;
    }
    if(p.place==='cistern'&&p.lift?.mode==='call')advanceLift();
    p.tick++;
    if(p.place==='return-channel')this.advanceReturnFlow();
    // Channels freeze with the scene: no off-screen completion or forgotten input while reading dialogue.
    if (p.place === 'mill') {
      // Lazy, explicit accounting boundary: old saves round-trip unchanged until gameplay resumes.
      if (hasMillValley(this.terrainProfile)) p.tailrace ??= emptyMillTailrace(p.mill.escaped);
      const flow = advanceEpisodeWater(p.mill, this.controls('mill'), p.tailrace ? x => receiveMillOutflow(p.tailrace!, x) : undefined);
      if (p.tailrace) advanceMillTailrace(p.tailrace);
      p.wheelSpeed += ((flow > 0 ? 1 : 0) - p.wheelSpeed) * 0.025;
      p.wheelAngle = (p.wheelAngle + p.wheelSpeed * 0.04) % (Math.PI * 2);
      p.stableTicks = this.has('brace') && this.has('cleared') && p.wheelSpeed > 0.08 ? Math.min(180, p.stableTicks + 1) : 0;
      if (p.stableTicks >= 180 && !this.has('repaired')) this.mark('repaired');
    }
    if (p.place === 'hermit') {
      advanceEpisodeWater(p.practice, this.controls('practice'));
      if (!this.has('practiced') && this.has('predicted') && this.has('plugged') && p.casts > 0 && collectedEpisodeWater(p.practice) >= p.baselineCollected + 12) this.mark('practiced');
    }
    const window=this.physical.window;
    if (p.place==='cistern-entry' && window && window.age<CISTERN_WINDOW.settleTicks) {
      this.windowWorld.advance(); window.age++; this.windowCellsCache=undefined;
      if (this.windowWorld.satisfied && !this.has('window_filled')) this.mark('window_filled');
    }
    if(p.place==='cistern'){
      const s=p.siphon;
      if(s&&s.age<s.events.at(-1)!.at+CISTERN_SIPHON.settleTicks){
        this.siphonWorld.advance();s.age++;this.siphonCellsCache=undefined;
        if(this.siphonWorld.satisfied&&!this.hasRoom('siphon_primed'))this.markRoom('siphon_primed');
      }
      if(p.echoAge!==undefined&&p.echoAge<180){void this.echoCells;this.echoPhysics!.advance();p.echoAge++;this.echoCellsCache=undefined;}
      const c=p.calibration;
      if(c&&c.age<c.events.at(-1)!.at+180){
        this.calibrationWorld.advance();c.age++;this.calibrationCellsCache=undefined;
        if(this.calibrationWorld.satisfied&&!this.hasRoom('valve_filled'))this.markRoom('valve_filled');
      }
    }
  }
  interact(target: EpisodeTarget, choice?: string): EpisodeResult {
    if (this.nearest()?.id !== target) return { accepted: false, text: '再靠近一些，站稳后互动。' };
    const say = (text: string, speaker?: string): EpisodeResult => ({ accepted: true, text, ...(speaker ? { speaker } : {}) });
    const requireJob = () => !this.has('job');
    switch (target) {
      case 'worker': {
        if(this.hasRoom('exited')){
          if(this.hasFlow('restored')){
            if(!this.hasRoom('reported'))this.markRoom('reported');
            return say('公共水口又有稳定的水了，湿地那一路也没有被截走。你修的不是临时水盆，而是两条供水路。地下旧渠还需要调查；这次没有新的报酬或能力解锁，碎片仍由你保管。','工务人');
          }
          if(!this.hasRoom('reported'))this.markRoom('reported');
          return say('回流道的检修梯已经放下了？那就不用每次绕过两层水阀。上层水路重新可用，下一步得查清它通往哪里。那枚碎片仍先留在你手里；旧矿道还没有安全通路。报酬和床位已经结清，不重复发放。','工务人');
        }
        if (this.has('finished')) return say('屋里给你留了床位。水轮运转正常，林中的路也随时向你敞开。', '工务人');
        if (this.has('debrief')) {
          const e = this.truth.economy;
          this.mark('finished', [{ eventId: 'episode.reward', type: 'economy_wallet_changed', payload: {
            expectedWalletRevision: e.walletRevision, nextWalletRevision: e.walletRevision + 1, coinDelta: 8, nextCoin: e.coin + 8 } },
            { eventId: 'episode.lodging', type: 'world_flag_set', payload: { flagId: 'forest.settlement.lodging_earned', value: true, scope: 'global' } },
            { eventId: 'episode.checkpoint', type: 'checkpoint_set', payload: { checkpoint: { id: 'forest.episode.lodging', sceneId: 'scene.valley.settlement', position: { x: 340, y: this.groundAt(340, 'settlement') - 14 }, revision: this.truth.checkpoint.revision + 1 } } }]);
          return say('水又进了磨房，明早大家就有面粉。约好的八枚钱，还有今晚的床位，都归你。蓄水廊的检修入口在工坊右侧，现在可以下去看看。把隐士的话记好，什么时候启程由你决定。', '工务人');
        }
        if (this.has('medium')) {
          if (!this.has('route')) this.mark('route');
          return say('不是水轮上的零件。这枚碎片的槽口，与西边林中旧石碑很像。沿聚落西侧小径找那位隐士，他认得一些旧文字。带回来也好，不去也好，维修的功劳仍算你的。', '工务人');
        }
        if (this.has('job')) return say('工坊在东边。木料架有现成木撑；先扶稳轮轴，清淤，再引水。别用蛮力转轮子，让流水自己做工。', '工务人');
        if (choice === 'accept') { this.mark('job'); return say('那就拜托你了。东边旧工坊的轮轴松了，水渠也堵着。取木撑、扶轮轴、清淤、开闸；工具都在原处。修好回来，我付八枚钱，给你一个床位。', '工务人'); }
        return { accepted: true, speaker: '工务人', text: '从溪路来的？这里有床位，只是水轮坏了，大家正缺人手。你愿意替我们修一修吗？不用会魔法。', choice: 'work' };
      }
      case 'return-channel-road':return this.enterReturnChannel();
      case 'flow-inspect':
        if(!this.hasFlow('inspected'))this.markFlow('inspected');
        return say('上游是已经接通的自然水路。闸板歪斜、分流口缺密封、两路导管有淤泥。现场留有闸柄、密封纤维和清管杆，可用工具修复，不消耗 MP。标尺统计实际出水，不按按钮次数算完工。');
      case 'flow-gate':case 'flow-seal':case 'flow-clear':{
        if(!this.hasFlow('inspected'))return say('先看左侧检修牌，确认上游、分流口和两路出水的位置。');
        const part=target==='flow-gate'?'gate':target==='flow-seal'?'sealed':'cleared';
        if(!this.hasFlow(part))this.markFlow(part);
        return say(part==='gate'?'闸板已扶正，卡扣固定；上游水可以穿过闸口。':
          part==='sealed'?'现场的密封纤维已压进接缝；新流出的水会进入两个导管，不再从这里漏走。':
          '两路淤泥已清出。关闭面板后看水继续向下流；只有两路实际出水稳定、接缝不再漏水，维修才会完成。');
      }
      case 'flow-gauge':{
        const rates=returnChannelRates(this.physical.returnFlow!);
        if(this.hasFlow('restored')&&!this.hasFlow('observed'))this.markFlow('observed');
        return say('最近两秒实际出水：聚落 '+rates.supply+'、湿地 '+rates.meadow+'；分流口漏水 '+rates.spill+'（水粒单位）。'+
          (this.hasFlow('restored')?'两路水量已稳定，供水修复已保存。你可以回村查看公共水口；这不等于完成地下秩序节点，也没有授予 wawa 或攻击资格。':
          '任一路仍未稳定就不结算；检查闸板、密封和导管，关闭面板等水走完渠道。'));
      }
      case 'flow-spout':return say(this.hasFlow('restored')?
        '上路送往聚落公共水口，下路送往湿地。浅水已经回到苇根旁；旧水仍沿渠道排走，没有额外复制水或发放物品。':
        '两处出水口通向不同地方。仅仅打开上游不代表两路都有水，要看水真正到达这里。');
      case 'flow-depth':return say('石阶向地下延伸，旧媒介的槽纹也沿墙继续。地下秩序节点尚未实现，本版不能进入；可沿身后的检修路回村。旧矿道与正式回访资格不会在这里自动解锁。');
      case 'mill-road': this.travel('mill', 100); return say('旧水渠通向东边工坊。');
      case 'hermit-road':
        if (!this.has('route')) return say('西侧小径没留下清楚的路标。先问问工务人这里住着谁。');
        this.travel('hermit', 100); return say('越过低矮灌木，石槽旁有人正在整理工具。');
      case 'cistern-road':
        if (!this.has('finished')) return say('检修入口暂未交接。先带着媒介完成隐士的练习，再回聚落领取维修报酬；之后可以从这里下行。');
        this.travel('cistern-entry', 100); return say('沿干燥的检修坡道走入地下。出口就在身后的工坊。');
      case 'entry-survey':
        if (!this.has('entry_observed')) this.mark('entry_observed');
        return say('石壁上留着工务人员的检修记号：右侧绞盘牵着隔栅，抬起后会由棘爪固定。通道地面干燥，不需要先消耗 MP。更深处的蓄水机关仍未接通。');
      case 'entry-winch':
        if (!this.has('entry_observed')) return say('铁索通往前方隔栅。先看看左边石壁上的检修标记，确认它控制什么。');
        if (!this.has('entry_open')) this.mark('entry_open');
        return say('转动手柄，隔栅沿导轨升起，棘爪将它固定在顶部。通道已打开，可以步行通过，也能随时沿原路返回。');
      case 'entry-seal':
        if (!this.has('entry_open')) return say('隔栅还没有打开。');
        if (!this.has('entry_surveyed')) this.mark('entry_surveyed');
        if (this.has('window_filled')) return say('接水杯带动了门框侧面的检修盖。盖后露出检修门的机械门栓，右边可以进入高位蓄水室。森林碎片仍在行囊，没有插入或消耗；双层阀在上方夹层，虹吸还要继续调查。');
        return say('门框上的嵌槽与森林碎片有相似的边缘，但没有足够依据将碎片装进去。左侧标尺连接一个接水杯，杯中的水会带动侧面检修盖。先看看精密引水窗；也可以用旁通阀，不必会组合魔法。');
      case 'window':
        if (!this.has('entry_surveyed')) return say('引水窗连着深处门框。先去右边查看门框，确认它控制什么。');
        if (!this.has('window_inspected')) this.mark('window_inspected');
        if (this.physical.window) return say(this.has('window_filled') ? '接水杯已通水，门框侧面检修盖打开了。去右边看看；不需要重复灌水。' : '水正在下落。关闭对话观察接水杯，不用连续施放。');
        return {accepted:true,choice:'window',text:'石挡板距锚点 20 px（1.25 格）。三档长度为 16 / 32 / 64 px，截面均为 12 px，释放后都会下落。先输入表达再预览；右边旁通阀可把已有水导进杯内，不消耗 MP。'};
      case 'window-bypass':
        if (!this.has('window_inspected')) return say('先查看左边引水窗的标尺和接水杯，再打开旁通阀。');
        if (this.physical.window) return say('已经引入一份水。等待它落入杯内，不重复取水。');
        this.mark('window_bypass'); this.physical.window={source:'bypass',age:0};
        this.windowPhysics=undefined; this.windowCellsCache=undefined;
        return say('打开旁通阀，将上方水箱的现有水引入接水杯。关闭对话后观察水流。这是工具路线，没有消耗 MP，也不计作魔法或词语掌握。');
      case 'room-road': {
        if(!this.has('window_filled'))return say('检修门的门栓还藏在盖板后。先让引水窗接水杯带动检修盖。');
        this.travel('cistern',52);
        if(!this.hasRoom('entered')){
          const mp=this.truth.mp,ledger=new CastExecutionLedger(mp.currentMp,mp.worldVersion,mp.maxMp);
          const proposal=new CisternLearningSession({playerSaveId:this.session.sessionId,expressionCapacity:this.truth.capabilities.expressionCapacityWords}).proposeCheckpointRecovery({activationId:'forest.episode.cistern.entry'});
          const recovery=ledger.applyMpRecovery(proposal);
          this.markRoom('entered',[{eventId:'episode.room.entry.mp',type:'mp_replaced',payload:{mp:{...mp,currentMp:recovery.afterMp,worldVersion:mp.worldVersion+1}}},
            {eventId:'episode.room.entry.checkpoint',type:'checkpoint_set',payload:{checkpoint:{id:'forest.episode.cistern.entry',sceneId:EPISODE_SCENES.cistern,position:{x:52,y:722},revision:this.truth.checkpoint.revision+1}}}]);
        }
        return say('进入高位蓄水室。左侧可随时返回；入口检查点只轻恢复一次，不会补满 MP。');
      }
      case 'room-echo':
        if(!this.hasRoom('echo')){this.markRoom('echo');this.physical.echoAge=0;this.echoPhysics=undefined;this.echoCellsCache=undefined;}
        return say('回声留下 telo 的默认构形：语言上是水／液体，在这套框架中，不加尺度修饰词会形成 32 px 长、12 px 宽的水段，正常施放需 5 MP。关闭对话看水下落。这里是隔离的演示盆，不扣你的 MP，也不能把演示水带走。');
      case 'lift-up':case 'lift-down':{
        if(!this.hasRoom('siphon_primed'))return say('升降机没有水力。先让虹吸接水槽达到刻度；魔法和手动导水都可以。');
        if(!this.hasRoom('lift_open')){this.markRoom('lift_open');this.physical.lift=emptyCisternLift();}
        const from=target==='lift-up'?'bottom':'top',s=this.physical.lift!;
        if(s.mode!=='idle')return say(s.blocked?'平台因通道有占位而停住。离开轨道后会继续，不会挤压身体。':'升降机正在靠站，等平台停稳再按 E 登乘。');
        this.physical.lift=beginCisternLift(s,from);
        return say(this.ridingLift?'沿平台登乘。Esc 可暂停，停稳后自动走到安全平台。':'已呼叫平台。它会沿轨道靠站；停稳后再按 E 登乘。');
      }
      case 'return-winch':
        if(!this.hasRoom('lift_arrived'))return say('先乘升降机抵达顶层并确认停靠。');
        if(!this.hasRoom('return_open'))this.markRoom('return_open',[
          {eventId:'episode.cistern.primed',type:'world_flag_set',payload:{flagId:'cistern.siphon_primed',value:true,scope:'global'}},
          {eventId:'episode.cistern.upper-channel',type:'world_flag_set',payload:{flagId:'valley.upper_channel',value:'available',scope:'global'}}]);
        return say('转动绞盘，通往工坊回流道的检修梯降下，棘爪永久固定。现在可以从中间出口回到工坊，也能从工坊沿这条梯子回访。没有消耗碎片，也没有恢复 MP。');
      case 'top-exit':
        if(!this.hasRoom('return_open'))return say('回流道的梯子仍收在上方。先转动左边绞盘，放下并固定检修梯。');
        if(!this.hasRoom('exited'))this.markRoom('exited');
        this.travel('mill',806);return say('沿回流道检修梯回到工坊。新的路线已保留，可以回聚落向工务人说明水路的变化。');
      case 'cistern-shortcut':
        if(!this.hasRoom('return_open'))return say('这条回流道尚未从内侧打开。');
        this.travel('cistern',266);this.physical.player={x:266,y:114,velocityX:0,velocityY:0,grounded:true};
        return say('沿永久检修梯回到蓄水室顶层。原来的水位、升降机位置、MP 和碎片保持不变。');
      case 'east-up':case 'east-down':case 'west-up':case 'west-down':
        if(target.startsWith('west')&&!this.hasRoom('valve_filled'))return say('西侧梯的隔栅由双层校准阀控制。可以用魔法，也可以调整导槽引水。');
        this.physical.climb={route:target,leg:0};return say('沿检修梯攀行。Esc 可以暂停。');
      case 'calibration':
        if(!this.hasRoom('valve_seen'))this.markRoom('valve_seen');
        if(this.hasRoom('valve_filled'))return say('两层盘已达到刻度，西侧检修梯的隔栅已抬起。没有获得额外压力或攻击能力。');
        if(!this.calibrationReady())return say('先关闭对话，让这一份水落稳，再比较或调整导槽。');
        if((this.physical.calibration?.events.filter(e=>e.kind==='cast').length??0)>=2)return say('这两份水没有带动隔栅。不必继续耗费 MP；到左侧调整导槽，可把回收槽和现场水箱接入深盘。');
        return {accepted:true,choice:'calibration',text:this.calibrationVersion===1?'旧式校准盘保留原水路：收集至少 1.6 MU（77 格）才开阀。水段长度 16 / 32 / 64 px，挡板距离 36 px；短水段单份不足，或用左侧导槽。':
          '远端水舌带动深盘入口，近端有独立回收槽。主轴向左，挡板距离 36 px；水段长度为 16 / 32 / 64 px。较短的水段落入回收槽，不算语言错误。深盘需要至少 1.6 MU（77 个水格）；也可用左侧导槽引入已有水，不消耗 MP。'};
      case 'calibration-tool':{
        if(!this.hasRoom('valve_seen'))return say('先到右边查看校准盘的刻度和导槽走向。');
        if(this.hasRoom('valve_filled')||this.hasRoom('valve_tool'))return say('水路已经接通，不需要重复打开水箱。');
        if(!this.calibrationReady())return say('先等正在落下的水稳定，再打开导槽，避免重复操作。');
        const s=this.physical.calibration??{version:2 as const,age:0,events:[]};
        this.markRoom('valve_tool');s.events.push({at:s.age,kind:'tool'});
        this.physical.calibration=s;this.calibrationPhysics=undefined;this.calibrationCellsCache=undefined;
        return say('调整导槽并打开水箱底部，已有水沿坡流向双层盘。关闭对话观察；没有消耗 MP，也不算词语掌握。');
      }
      case 'upper-survey':
        if(!this.hasRoom('upper_seen'))this.markRoom('upper_seen');
        return say(this.hasRoom('siphon_primed')?'虹吸接水槽已经达到刻度，水箱中的水进入高位水路。右侧下站可启用升降机，到顶层放下回流道的永久梯；也能沿原检修梯返回。':
          '虹吸钟在回收沟另一侧，水舌距向东锚点 58 px。修好任一支撑可稳定长水段；左侧锚点预览魔法，右侧手柄可导入现有水，不需要 MP。接水槽达到刻度后，再到最右边启用升降机。');
      case 'siphon-left':case 'siphon-right':{
        if(!this.hasRoom('upper_seen'))return say('先到右边查看高位虹吸和停靠台，确认支撑连接的水路。');
        const flag=target==='siphon-left'?'siphon_left':'siphon_right';
        if(!this.hasRoom(flag))this.markRoom(flag);
        return say('用旁边的检修楔固定支撑肋。长水段稳定度从 0.65 提高到 0.75；修好任意一侧就足够，两侧不叠加，也不增加魔法伤害。');
      }
      case 'siphon':
        if(!this.hasRoom('upper_seen'))return say('先到右边查看高位虹吸和停靠台，确认远端水舌的位置。');
        if(this.siphonReleased)return say(this.hasRoom('siphon_primed')?'虹吸已通水，无需重复灌水。右侧升降机可到顶层，也可以沿两段检修梯原路返回。':'水箱已释放。关闭面板，等水落入接水槽，不必重复施放。');
        if(!this.siphonReady())return say('先让水落稳，观察回收沟和远端接水槽，再作调整。');
        if((this.physical.siphon?.events.filter(e=>e.kind==='cast').length??0)>=2)return say('这两次引水没有够到水舌。右侧手动导水柄可释放现有水，无需继续消耗 MP。');
        return {accepted:true,choice:'siphon',text:'主轴向东，水舌距离 58 px；水段长度 16 / 32 / 64 px，截面固定 12 px。短或默认水段会落入回收沟，不算语言错误。长水段先修好任一支撑肋；MP 不足也可用右侧手动导水柄。'};
      case 'siphon-tool':{
        if(!this.hasRoom('upper_seen'))return say('先到左边查看高位虹吸与停靠台，确认导水柄的用途。');
        if(this.siphonReleased)return say('水箱已经释放，不重复供水。等接水槽达到刻度即可。');
        if(!this.siphonReady())return say('先关闭面板，让这一份水落稳，再调整导水柄。');
        const s=this.physical.siphon??{version:1 as const,age:0,events:[]};
        this.markRoom('siphon_tool');s.events.push({at:s.age,kind:'tool'});this.physical.siphon=s;
        this.siphonPhysics=undefined;this.siphonCellsCache=undefined;
        return say('转动手柄，沿检修连杆打开水箱出口，已有水流向虹吸接水槽。没有生成额外水、不消耗 MP，也不算词语掌握。关闭面板观察水位。');
      }
      case 'return':
        if(this.physical.place==='return-channel'){
          this.travel('cistern',266);this.physical.player={x:266,y:114,velocityX:0,velocityY:0,grounded:true};
          return say('沿原检修路回到蓄水室顶层。回流渠的水量与维修状态原样保留；这里不是正式的地下剧情出口。');
        }
        if(this.physical.place==='cistern'){this.travel('cistern-entry',950);return say('回到检修入口。校准阀和入口检查点保持状态，不重复恢复 MP。');}
        if (this.physical.place === 'cistern-entry') {
          this.travel('mill', 950); return say('沿检修坡道回到工坊。隔栅的状态仍然保留。');
        }
        this.travel('settlement', this.physical.place === 'mill' ? 870 : 110); return say('回到聚落。');
      case 'timber':
        if (requireJob()) return say('这是聚落的备用木料。先和工务人商量维修。');
        if (!this.has('timber')) this.mark('timber');
        return say(this.has('brace') ? '木撑已经装好，不需要搬更多木料。' : '你拿起一根合适的木撑。把它送到右边水轮的支架处。');
      case 'brace':
        if (!this.has('timber')) return say('轮轴歪了。先去左侧木料架拿一根木撑。');
        if (!this.has('brace')) this.mark('brace');
        return say('木撑顶住了轮轴。现在即使有水冲击，它也不会再左右摆动。');
      case 'silt':
        if (requireJob()) return say('淤泥堵住了水渠。先接受工务人的维修委托。');
        if (!this.has('cleared')) this.mark('cleared');
        return say('你用渠边的铲子清出泥块。槽底重新露出来，水能沿坡流向右侧。');
      case 'gate':
        if (requireJob()) return say('这里的闸门关系着聚落用水。先问工务人。');
        this.physical.gate = !this.physical.gate;
        return say(this.physical.gate ? '闸门抬起。留意水是否穿过整段渠道，以及轮轴是否平稳。' : '闸门关闭。剩余水会继续流出，可安全检查支架和水渠。');
      case 'medium':
        if (!this.has('repaired')) return say('检修石龛卡在轮轴后的凸轮下。让水轮稳定运转，凸轮才会把盖板抬起。');
        if (!this.has('medium')) this.mark('medium', ['artifact.ancient_medium_frame', 'artifact.fragment.forest_site'].map(id => ({
          eventId: `episode.owns.${id}`, type: 'world_flag_set', payload: { flagId: `owns.${id}`, value: true, scope: 'global' } })));
        return say('石龛里是一件有裂纹的古代媒介，旁边嵌着一枚森林位点碎片。它们已收进你的行囊，不会因离开地图而丢失。你还不知道怎么使用，也没有因此学会任何词。');
      case 'hermit':
        if (this.has('debrief') && choice !== undefined) return this.calibratePhrase(choice==='calibrate' ? undefined : choice);
        if (this.has('practiced')) {
          if (!this.has('debrief')) this.mark('debrief');
          return {...say('你没有命令水停在空中，而是先看懂坡度，再用木楔补住漏口。telo 在这里指水，也可以指液体；它不是“水必须听我摆布”。媒介只是通路，你自己的 MP 和它的损伤都限制力量。碎片属于散落的位点，地下蓄水廊或许还有同类痕迹。先把修好的水轮交还给村里，之后的路由你选。若想尝试组合表达，可以先去坐垫休息，再回来做一次回忆校准。', '隐士'), choice:'calibrate'};
        }
        if (!this.has('intro')) this.mark('intro');
        return say('这是旧文明的施术媒介，裂口太深，只能承受很小的表达。旧人抽走维系秩序的能量，光暗与元素的规则便开始失衡；我只知道残留下来的这一部分。先去右边看水槽。我在水壶和槽边写下了它的读音：telo。别急着施法：先看自然水如何沿坡度流动。', '隐士');
      case 'pool': {
        if (!this.has('intro')) return say('石槽旁有陌生文字，先请隐士说明。');
        if (!this.has('observed')) {
          supplyEpisodeWater(this.physical.practice, 32, this.controls('practice')); this.mark('observed');
          return say('隐士舀来少量自然水：水落入石槽，往低处流；中段有一道漏口。水壶与槽边都标注着同一个读音 telo。先看一会儿，准备好再按 E。', '隐士');
        }
        if (!this.has('predicted')) {
          if (choice === 'downhill') { this.mark('predicted'); return say('对。表达只引来小量水，不会取消重力，也不会修好石槽。接下来按 E 试一次：2 MP、32 个水格；受损媒介只开放这一档。', '隐士'); }
          if (choice) return say('看看槽底的倾斜，还有中间的缺口。水会受重力影响，不会凭空悬停。再观察后试试，不扣 MP。', '隐士');
          return { accepted: true, speaker: '隐士', text: '如果在槽左侧引来一小团 telo，它会怎样？', choice: 'predict' };
        }
        if (this.has('practiced')) return say('接水盆里留住了清水。回去和隐士谈谈你观察到了什么。');
        if (this.physical.practice.cells.some((v, i) => v === 1 && i % 160 < 137)) return say('先等这次水流走完，或去右边用木楔堵住漏口；不要连续灌水。');
        if (this.truth.mp.currentMp < 2) return say('MP 不足。回隐士旁的坐垫休息，再来练习；不用重开，也不会丢掉碎片。');
        const n = this.physical.casts + 1, mp = this.truth.mp;
        this.commit(`cast.${n}`, [{ eventId: `episode.cast.${n}`, type: 'mp_replaced', payload: { mp: { ...mp, currentMp: mp.currentMp - 2, worldVersion: mp.worldVersion + 1 } } }], 'cast');
        this.physical.casts = n; this.physical.baselineCollected = collectedEpisodeWater(this.physical.practice);
        supplyEpisodeWater(this.physical.practice, 32, this.controls('practice'));
        return say('telo。掌中的媒介轻轻震动，少量水落入槽内。MP −2。水仍会流进漏口；观察结果，再用旁边的工具处理。');
      }
      case 'plug':
        if (!this.has('observed')) return say('槽边放着一枚木楔。先观察石槽里的水。');
        if (!this.has('plugged')) this.mark('plugged');
        return say('木楔嵌入漏口。你没有用魔法修好石槽，而是给水补出了一条完整的路。');
      case 'rest': {
        if (!this.has('intro')) return say('先和隐士打个招呼。');
        if (this.has('debrief') && !this.has('meditated')) this.mark('meditated');
        const mp = this.truth.mp;
        if (mp.currentMp >= mp.maxMp) return say('你在树下平复呼吸。MP 已满，最大 MP 没有变化。');
        this.commit(`rest.${this.truth.revision}`, [{ eventId: `episode.rest.${this.truth.revision}`, type: 'mp_replaced', payload: { mp: { ...mp, currentMp: Math.min(mp.maxMp, mp.currentMp + 4), worldVersion: mp.worldVersion + 1 } } }], 'mp_recovery');
        return say('你坐下调整呼吸，恢复了最多 4 MP。媒介的裂纹仍在，不能靠休息提高施法上限。');
      }
    }
  }
  private spawn(place: EpisodePlace, x: number): PlayerMotionState {
    return { x, y: Math.min(...Array.from({ length: 12 }, (_, i) => this.groundAt(x + i, place))) - 14, velocityX: 0, velocityY: 0, grounded: true };
  }
  private travel(place: EpisodePlace, x: number): void {
    this.commit(`travel.${this.truth.revision}`, [{ eventId: `episode.travel.${this.truth.revision}`, type: 'scene_entered', payload: { sceneId: EPISODE_SCENES[place] } }]);
    this.physical.place = place; this.physical.player = this.spawn(place, x); this.previousJump = false; this.grace = EMPTY_JUMP_GRACE;
  }
  private mark(flag: EpisodeFlag, extra: SessionEventDraft[] = []): void {
    this.commit(flag, [{ eventId: `episode.flag.${flag}`, type: 'world_flag_set', payload: { flagId: FLAG + flag, value: true, scope: 'global' } }, ...extra],
      flag==='window_cast' ? 'cast' : ['observed', 'predicted', 'practiced'].includes(flag) ? 'learning' : 'world');
  }
  private commit(id: string, drafts: SessionEventDraft[], domain: 'world' | 'cast' | 'mp_recovery' | 'learning' = 'world'): void {
    const result = commitSessionProposal(this.session, { transactionId: `episode.${id}`, drafts: [...drafts, {
      eventId: `episode.receipt.${id}`, type: 'receipt_recorded', payload: { receiptId: `forest.episode.${id}`, domain,
        payloadHash: sha256Canonical({ place: this.physical.place, tick: this.physical.tick, player: this.physical.player, drafts } as unknown as JsonValue) } }] });
    if (!result.committed) throw new Error(`章节事务未提交：${id}/${result.reason}`);
    this.session = result.session; this.truth = this.session.snapshot();
  }
  private validate(): void {
    const p = this.physical;
    if (!p || !Object.hasOwn(EPISODE_PLACES, p.place) || !p.player || typeof p.player.grounded !== 'boolean' || typeof p.gate !== 'boolean' ||
        ![p.tick, p.casts, p.stableTicks, p.baselineCollected].every(n => Number.isSafeInteger(n) && n >= 0) || p.stableTicks > 180 ||
        ![p.wheelSpeed, p.wheelAngle, p.player.x, p.player.y, p.player.velocityX, p.player.velocityY].every(Number.isFinite) ||
        p.wheelSpeed < 0 || p.wheelSpeed > 1 || p.wheelAngle < 0 || p.wheelAngle >= Math.PI * 2 ||
        Math.abs(p.player.velocityX) > 88.001 || Math.abs(p.player.velocityY) > 240.001 ||
        this.collides({ ...p.player, width: 12, height: 14 })) throw new Error('章节空间存档无效');
    validateEpisodeWater(p.mill); validateEpisodeWater(p.practice);
    if (p.tailrace !== undefined) {
      if (!hasMillValley(this.terrainProfile)) throw new Error('工坊下游地形版本不兼容');
      validateMillTailrace(p.tailrace, p.mill.escaped, p.mill.tick);
    }
    const scene = EPISODE_SCENES[p.place];
    const roomDeps:Partial<Record<RoomFlag,RoomFlag[]>>={echo:['entered'],valve_seen:['entered'],valve_tool:['valve_seen'],valve_filled:['valve_seen'],upper_seen:['valve_filled'],
      siphon_left:['upper_seen'],siphon_right:['upper_seen'],siphon_tool:['upper_seen'],siphon_primed:['upper_seen'],
      lift_open:['siphon_primed'],lift_arrived:['lift_open'],return_open:['lift_arrived'],exited:['return_open'],reported:['exited']};
    const flow=p.returnFlow;
    for(const f of FLOW_FLAGS)if(this.hasFlow(f)&&(!this.truth.receiptIndex['forest.episode.flow.'+f]||!this.hasFlow('entered')||
      f!=='entered'&&f!=='inspected'&&!this.hasFlow('inspected')))throw Error('回流渠维修凭证不一致');
    if(this.hasFlow('entered')!==!!flow||flow&&!this.hasRoom('return_open')||p.place==='return-channel'&&!flow)throw Error('回流渠入口状态不一致');
    if(flow){
      validateReturnChannel(flow);
      const regional=(id:string)=>this.truth.world.flags['region:'+PROLOGUE_RETURN_FLOW_REGION_ID+':'+id]?.value;
      if(regional('exit_ladder_lowered')!==true)throw Error('回流渠入口缺少永久梯');
      if(this.hasFlow('observed')&&!this.hasFlow('restored'))throw Error('回流渠尚未稳定');
      if(this.hasFlow('restored')&&(!this.hasFlow('gate')||!this.hasFlow('sealed')||!this.hasFlow('cleared')||
        regional('settlement_supply_stable')!==true||regional('wet_meadow_restored')!==true||
        this.truth.quests.ch01_return_flow?.stageId!=='completed'))throw Error('回流渠供水凭证不一致');
    }
    for(const f of ROOM_FLAGS)if(this.hasRoom(f)&&(!this.truth.receiptIndex['forest.episode.room.'+f]||roomDeps[f]?.some(d=>!this.hasRoom(d))))throw Error('蓄水室进度凭证不一致');
    if(this.hasRoom('entered')&&!this.has('window_filled')||p.place==='cistern'&&!this.hasRoom('entered'))throw Error('蓄水室入口未开放');
    if(p.climb){
      if(p.place!=='cistern')throw Error('检修梯场景不一致');
      validateCisternClimb(p.climb,p.player,this.hasRoom('valve_filled'));
    }
    if(this.hasRoom('lift_open')!==(p.lift!==undefined)||p.climb&&this.ridingLift)throw Error('升降机启用凭证不一致');
    if(p.lift){
      validateCisternLift(p.lift,p.player);
      if(this.ridingLift&&p.place!=='cistern'||p.place==='cistern'&&intersects({...p.player,width:12,height:14},liftDeck(p.lift)))throw Error('升降机乘客位置不一致');
    }
    if(p.place==='cistern'&&p.player.y<140&&!this.hasRoom('lift_open'))throw Error('顶层尚未开放');
    if(this.hasRoom('return_open')&&(this.truth.world.flags['global:cistern.siphon_primed']?.value!==true||
      this.truth.world.flags['global:valley.upper_channel']?.value!=='available'))throw Error('回流道世界状态不一致');
    if(p.place==='cistern'&&!this.hasRoom('valve_filled')&&p.player.y<384)throw Error('西侧梯隔栅尚未打开');
    if(this.hasRoom('echo')!==(p.echoAge!==undefined)||p.echoAge!==undefined&&(!Number.isInteger(p.echoAge)||p.echoAge<0||p.echoAge>180))throw Error('入口回声存档无效');
    const siphon=p.siphon,sc=Object.values(this.truth.receiptIndex).filter(r=>r.receiptId.startsWith('forest.episode.siphon.cast.'));
    if(siphon){
      if(!this.hasRoom('upper_seen'))throw Error('虹吸尚未观察');
      const world=new CisternSiphon(siphon),casts=siphon.events.filter(e=>e.kind==='cast');
      if(this.hasRoom('siphon_primed')!==world.satisfied||this.hasRoom('siphon_tool')!==siphon.events.some(e=>e.kind==='tool')||
        sc.length!==casts.length||sc.some(r=>r.domain!=='cast')||casts.some(e=>e.braced&&!this.siphonSupported))throw Error('虹吸水位或支撑凭证不一致');
      siphon.events.forEach((e,i)=>{
        if(e.kind==='cast'&&(!this.truth.receiptIndex['forest.episode.siphon.cast.'+i]||
          this.truth.world.flags['global:forest.episode.siphon.cast.'+i]?.value!==e.expression+':'+e.at+':'+e.braced))throw Error('虹吸表达记录不一致');
      });
    }else if(sc.length||this.hasRoom('siphon_primed')||this.hasRoom('siphon_tool'))throw Error('虹吸缺少水源');
    const calibration=p.calibration;
    const castReceipts2=Object.values(this.truth.receiptIndex).filter(r=>r.receiptId.startsWith('forest.episode.valve.cast.'));
    if(calibration){
      if(!this.hasRoom('valve_seen'))throw Error('校准盘尚未观察');
      const world=new CisternCalibration(calibration),casts=calibration.events.filter(e=>e.kind==='cast');
      if(this.hasRoom('valve_filled')!==world.satisfied||this.hasRoom('valve_tool')!==calibration.events.some(e=>e.kind==='tool')||
        castReceipts2.length!==casts.length||castReceipts2.some(r=>r.domain!=='cast'))throw Error('校准阀凭证或接水结果不一致');
      calibration.events.forEach((e,i)=>{
        if(e.kind==='cast'&&this.truth.world.flags['global:forest.episode.room.cast.'+i]?.value!==e.expression+':'+e.at)throw Error('校准阀表达记录不一致');
      });
    }else if(castReceipts2.length||this.hasRoom('valve_filled')||this.hasRoom('valve_tool'))throw Error('校准阀缺少水源');
    if (p.place === 'cistern-entry' && !this.has('finished')) throw new Error('地下入口尚未交接');
    if (p.place === 'cistern-entry' && !this.has('entry_open') && p.player.x + 12 > CISTERN_ENTRY_GATE.left)
      throw new Error('地下隔栅尚未打开');
    const castReceipts = Object.values(this.truth.receiptIndex).filter(r => r.receiptId.startsWith('forest.episode.cast.'));
    if (this.truth.world.currentSceneId !== scene || !this.truth.receiptIndex['forest.episode.enter'] ||
        this.has('repaired') && p.mill.escaped < 1 ||
        castReceipts.length !== p.casts || castReceipts.some((_, i) => this.truth.receiptIndex[`forest.episode.cast.${i + 1}`]?.domain !== 'cast')) throw new Error('章节场景或施法凭证不一致');
    const deps: Partial<Record<EpisodeFlag, EpisodeFlag[]>> = { timber: ['job'], brace: ['timber'], cleared: ['job'], repaired: ['brace', 'cleared'], medium: ['repaired'], route: ['medium'], intro: ['route'], observed: ['intro'], predicted: ['observed'], plugged: ['observed'], practiced: ['predicted', 'plugged'], debrief: ['practiced'], finished: ['debrief'] };
    deps.entry_observed = ['finished']; deps.entry_open = ['entry_observed']; deps.entry_surveyed = ['entry_open'];
    deps.meditated=['debrief']; deps.phrase=['meditated'];
    deps.window_inspected=['entry_surveyed']; deps.window_cast=['window_inspected']; deps.window_bypass=['window_inspected']; deps.window_filled=['window_inspected'];
    const w=p.window, cast=this.has('window_cast'), bypass=this.has('window_bypass');
    if (cast&&bypass || !!w!==(cast||bypass) || w && (w.source==='cast'?!cast:!bypass) ||
        this.has('phrase') && !this.truth.capabilities.appliedMilestones[phraseContract.milestoneId] ||
        cast && this.truth.capabilities.expressionCapacityWords<2) throw Error('引水窗进度或能力凭证不一致');
    if (w) {
      const simulation=new CisternWindow(w);
      if (this.has('window_filled')!==simulation.satisfied) throw Error('引水窗接水结果与物理不一致');
    } else if (this.has('window_filled')) throw Error('引水窗没有水源');
    for (const flag of CHECKS) {
      if (this.has(flag) && (!(this.truth.receiptIndex[`forest.episode.${flag}`]) || deps[flag]?.some(dep => !this.has(dep)))) throw new Error('章节进度前后不一致');
    }
    if (p.place === 'hermit' && !this.has('route') || p.casts > 0 && !this.has('predicted') ||
        this.has('practiced') && (p.casts === 0 || collectedEpisodeWater(p.practice) < p.baselineCollected + 12) ||
        p.practice.supplied !== (this.has('observed') ? 32 : 0) + p.casts * 32 ||
        this.has('medium') !== (this.truth.world.flags['global:owns.artifact.ancient_medium_frame']?.value === true) ||
        this.has('medium') !== (this.truth.world.flags['global:owns.artifact.fragment.forest_site']?.value === true)) throw new Error('章节媒介或练习证据不一致');
  }
}
