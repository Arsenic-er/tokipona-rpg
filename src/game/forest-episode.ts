import { sha256Canonical, type JsonValue } from '../canonical-json';
import {AllocationWorld,allocationQuotas,isAllocationMode,validateAllocationState,type AllocationState,type AllocationMode} from '../world/forest-water-allocation';
import {ALLOCATION_NAMES,allocationDescription,allocationEffects} from './forest-water-allocation';
import { SHARD_SYNC_EVENT,SHARD_SYNC_TICKS,shardMissingWords,shardPrerequisites,advanceShardAlignment,validateShardState,type ShardSyncState } from './forest-shard-sync';
import { LENGTH_WORDS,LENGTH_PHASES,LENGTH_STUDY,LengthStudyWorld,parseLengthPrediction,validateLengthStudy,previewLengthStudy,executeLengthStudy,lengthCost,
  type LengthWord,type LengthPhase,type LengthStudyState } from '../world/forest-length-study';
import { lengthStudyEvidence } from './forest-length-study';
import { PrologueWaterwheelSession } from './prologue-waterwheel';
import { MOTION_STUDY,MOTION_FLAGS,emptyMotionStudy,advanceMotionStudy,validateMotionStudy,motionVerified,parseMotionPrediction,
  type MotionStudyState,type MotionFlag } from '../world/forest-motion-study';
import { WATER_STUDY,WATER_STUDY_FLAGS,waterStudyOrigin,waterStudyEvidence,parseWaterPrediction,waterStudyReady,waterStudyArrived,
  validateWaterStudy,type WaterStudyState,type WaterStudyFlag } from './forest-water-study';
import { readRuntimeForestChapterManifest } from '../content/runtime-forest-chapter-manifest';
import { emptyForceStudy, advanceForceStudy, forceStudyView, forceContrastVerified, forceTrialVerified,
  validateForceStudy, parseForcePrediction, type ForceStudyState } from '../world/forest-force-study';
import { createWildlifeLifeRecord } from './life-corpse-ledger';
import { createStableWildlifeLifeId } from './wildlife-state-machine';
import { MIGRATION, WETLAND_BOUNDS, ORDER_NODE_BOUNDS, wetlandGround, emptyWetlandMigration,
  advanceWetlandMigration, validateWetlandMigration, migrationBodies, migrationSettled,
  type WetlandMigrationState } from '../world/forest-wetland-migration';
import { PrologueReturnFlowSession, PROLOGUE_RETURN_FLOW_REGION_ID, RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS } from './prologue-return-flow';
import { returnFlowWorldReady } from './return-flow-predicates';
import { RETURN_CHANNEL_BOUNDS, RETURN_CHANNEL_FLOOR, emptyReturnChannel, advanceReturnChannel, returnChannelFacts,
  returnChannelRates, validateReturnChannel, type ReturnChannelState, type ReturnChannelControls } from '../world/forest-return-channel';

import { GameSession, type GameSessionSave, type GameSessionState } from '../session/game-session';
import generatedRuntimeArtifact from '../generated/content-runtime.v0.1.json';
const forestChapter = readRuntimeForestChapterManifest(generatedRuntimeArtifact);
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
export type EpisodePlace = 'settlement' | 'mill' | 'hermit' | 'cistern-entry' | 'cistern' | 'return-channel' | 'wetland' | 'order-node';
export const EPISODE_PLACES = { settlement: '林间聚落', mill: '旧水轮工坊', hermit: '隐士林地', 'cistern-entry': '蓄水廊检修入口', cistern:'高位蓄水室', 'return-channel':'回流湿地检修渠', wetland:'湿地迁徙浅滩', 'order-node':'地下档案前厅' } as const;
export const episodeBounds=(place:EpisodePlace)=>place==='wetland'?WETLAND_BOUNDS:place==='order-node'?ORDER_NODE_BOUNDS:place==='cistern'?CISTERN_ROOM_BOUNDS:place==='return-channel'?RETURN_CHANNEL_BOUNDS:EPISODE_BOUNDS;
const EPISODE_SCENES: Record<EpisodePlace, string> = {
  settlement: 'scene.valley.settlement', mill: 'scene.valley.waterwheel',
  hermit: 'scene.valley.stream_section', 'cistern-entry': 'scene.valley.high_cistern', cistern:'scene.valley.high_cistern',
  'return-channel':'scene.valley.return_channel',
  wetland:'scene.valley.return_channel', 'order-node':'scene.valley.underground_order_node',
};
export type EpisodeTarget = 'worker' | 'mill-road' | 'hermit-road' | 'return' | 'timber' | 'brace' | 'gate' | 'silt' | 'medium' | 'hermit' | 'pool' | 'plug' | 'rest' |
  'cistern-road' | 'entry-survey' | 'entry-winch' | 'entry-seal' | 'window' | 'window-bypass' |
  'room-road' | 'room-echo' | 'east-up' | 'east-down' | 'west-up' | 'west-down' | 'calibration' | 'calibration-tool' | 'upper-survey' |
  'siphon' | 'siphon-left' | 'siphon-right' | 'siphon-tool' | 'lift-up' | 'lift-down' | 'return-winch' | 'top-exit' | 'cistern-shortcut' |
  'return-channel-road' | 'flow-inspect' | 'flow-gate' | 'flow-seal' | 'flow-clear' | 'flow-gauge' | 'flow-spout' | 'flow-depth' |
  'wetland-lookout' | 'wetland-nest' | 'wetland-young' | 'wetland-clear' | 'node-road' | 'node-survey' | 'node-archive' | 'node-cradle' | 'node-allocation' | 'node-exit';
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
  wetland:[{id:'return',x:40,label:'返回回流检修渠'},{id:'wetland-lookout',x:96,label:'浅滩观察处'},
    {id:'wetland-nest',x:148,label:'被水浸湿的旧巢'},{id:'wetland-young',x:220,label:'幼体足迹'},
    {id:'wetland-clear',x:252,label:'疏通迁徙出口的牵引绳'},{id:'node-road',x:540,label:'地下档案入口'}],
  'order-node':[{id:'return',x:32,label:'返回湿地浅滩'},{id:'node-survey',x:96,label:'前厅检修图'},
    {id:'node-archive',x:256,label:'旱季配水档案'},{id:'node-cradle',x:304,label:'受损的碎片座'},
    {id:'node-allocation',x:352,label:'未校准的三路配水台'},{id:'node-exit',x:416,label:'封闭的聚落旧门'}],
};
const FLAG = 'forest.episode.';
const CHECKS = ['job', 'timber', 'brace', 'cleared', 'repaired', 'medium', 'route', 'intro', 'observed', 'predicted', 'plugged', 'practiced', 'debrief', 'finished', 'entry_observed', 'entry_open', 'entry_surveyed', 'meditated', 'phrase', 'window_inspected', 'window_cast', 'window_bypass', 'window_filled'] as const;
export type EpisodeFlag = typeof CHECKS[number];
const ROOM_FLAGS=['entered','echo','valve_seen','valve_tool','valve_filled','upper_seen','siphon_left','siphon_right','siphon_tool','siphon_primed','lift_open','lift_arrived','return_open','exited','reported'] as const;
type RoomFlag=typeof ROOM_FLAGS[number];
const FLOW_FLAGS=['entered','inspected','gate','sealed','cleared','restored','observed'] as const;
type FlowFlag=typeof FLOW_FLAGS[number];
const MIGRATION_FLAGS=['entered','seen','nest','young','cleared','resolved','node_entered','archive'] as const;
type MigrationFlag=typeof MIGRATION_FLAGS[number];
const FORCE_FLAGS=['entered','observed','attuned','predicted','completed'] as const;
type ForceFlag=typeof FORCE_FLAGS[number];
const MIGRATION_REGION = PROLOGUE_RETURN_FLOW_REGION_ID;
const FLOW_SOLUTION='return_flow.repair_overflow';
export function episodeGround(place: EpisodePlace, x: number, profile?: EpisodeTerrainProfile): number {
  if (place==='wetland') return wetlandGround(x);
  if (place==='order-node') return 336;
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
  if (place==='order-node') return b.x<6||b.x+b.width>442||b.y<64||b.y+b.height>336;
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
  migration?:WetlandMigrationState;
  forceStudy?:ForceStudyState;
  waterStudy?:WaterStudyState;
  motionStudy?:MotionStudyState;
  lengthStudy?:LengthStudyState;
  shardSync?:ShardSyncState;
  allocation?:AllocationState;
  wheelSpeed: number; stableTicks: number; wheelAngle: number; casts: number; baselineCollected: number;
}
export interface ForestEpisodeSave {
  schema: 'tokipona.forest-waterwheel-episode.v0.1';
  openingChecksum: string; session: GameSessionSave; physical: EpisodePhysical; checksum: string;
}
export interface EpisodeResult { accepted: boolean; text: string; speaker?: string; choice?: 'work' | 'predict' | 'recall' | 'calibrate' | 'window' | 'calibration' | 'siphon' | 'force-recall' | 'water-recall' | 'motion-recall' | 'length-recall' | 'length-cast';
  actions?: readonly { id: string; label: string }[];
  resumeWorld?: boolean;
}

/** Owns ALL episode progression. UI supplies only input/target/choice, never position or completion claims. */
export class ForestEpisode {
  readonly terrainProfile?: EpisodeTerrainProfile;
  private session: GameSession;
  private truth: GameSessionState;
  private physical: EpisodePhysical;
  private previousJump = false;
  private windowPhysics?: CisternWindow;
  private windowCellsCache?: number[];
  private lengthWorlds:Partial<Record<LengthWord,LengthStudyWorld>>={};
  private calibrationPhysics?:CisternCalibration;
  private calibrationCellsCache?:number[];
  private siphonPhysics?:CisternSiphon;
  private siphonCellsCache?:number[];
  private echoPhysics?:CisternCalibration;
  private echoCellsCache?:number[];
  private grace: PlayerJumpGrace = EMPTY_JUMP_GRACE;
  private readonly migrationLifeIds = new Map<boolean,string>();
  private allocationPhysics?:AllocationWorld;
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
    (t.id!=='cistern-shortcut'&&t.id!=='return-channel-road')||this.hasRoom('return_open')).map(t=>
      t.id==='node-allocation'&&this.allocationMode?{...t,label:'已锁定的三路配水台'}:t);}
  get ridingLift():boolean{return liftCarriesPlayer(this.physical.lift);}
  roomSolidAt(x:number,y:number):boolean{return cisternRoomSolid(x,y,this.hasRoom('valve_filled'),this.hasRoom('lift_open'))||
    !!this.physical.lift&&intersects({x,y,width:1,height:1},liftDeck(this.physical.lift));}
  private collides(b:Aabb):boolean{return episodeCollides(this.physical.place,b,this.terrainProfile,this.has('entry_open'),this.hasRoom('valve_filled'),this.hasRoom('lift_open'))||
    this.physical.place==='wetland'&&!!this.physical.migration&&
    migrationBodies(this.physical.migration,this.migrationControls).some(a=>intersects(a,b));}
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
  hasMigration(flag:MigrationFlag):boolean{return this.truth.world.flags['global:forest.episode.migration.'+flag]?.value===true;}
  hasLength(word:LengthWord,phase:LengthPhase|'braced'):boolean{return this.truth.world.flags['global:forest.episode.length.'+word+'.'+phase]?.value===true;}
  lengthStudyStage(word:LengthWord):LengthPhase|'unvisited'{return [...LENGTH_PHASES].reverse().find(f=>this.hasLength(word,f))??'unvisited';}
  private markLength(word:LengthWord,phase:LengthPhase|'braced',drafts:SessionEventDraft[]=[]):void{
    this.commit('length.'+word+'.'+phase,[...drafts,{eventId:'episode.length.flag.'+word+'.'+phase,type:'world_flag_set',
      payload:{flagId:'forest.episode.length.'+word+'.'+phase,value:true,scope:'global'}}],phase==='cast'?'cast':'learning');
  }
  private lengthWorld(word:LengthWord):LengthStudyWorld{return this.lengthWorlds[word]??=new LengthStudyWorld(word,this.physical.lengthStudy?.[word]);}
  get lengthStudyFrame(){
    const w=this.physical.lengthStudy?.view;if(!w||w==='baseline')return null;
    const world=this.lengthWorld(w);
    return {word:w,columns:world.columns,rows:world.rows,cells:world.cells(),braced:this.hasLength('suli','braced')};
  }
  private lengthZones(){const p=this.physical.player;return [{entityId:'player',boundsPx:{x:p.x-LENGTH_STUDY.x,y:p.y-LENGTH_STUDY.y,width:12,height:14}}];}
  previewLengthStudy():ReturnType<ForestEpisode['previewWindow']>{
    const w=this.physical.lengthStudy?.view;
    if(!w||w==='baseline'||this.nearest()?.id!=='room-echo'||!this.hasLength(w,'predicted')||this.hasLength(w,'cast'))return null;
    const mp=this.truth.mp,plan=previewLengthStudy(w,mp.currentMp,mp.maxMp,this.lengthZones());
    const capacity=this.truth.capabilities.expressionCapacityWords>=2,support=w==='lili'||this.hasLength(w,'braced');
    return {plan,canConfirm:plan.canConfirm&&capacity&&support,reason:!capacity?'目前只能用单词；可回隐士处做原来的两词回忆校准，原工具路线不受影响。':
      !support?'先固定复习槽的支撑，再重新预览。长水段稳定度需要 0.75；不增加威力。':
      !plan.canConfirm?plan.rejectionCode==='requested_class_requires_more_mp'?'MP 不足；不降档、不扣费。可原路回隐士坐垫恢复，再来继续。':'空间或安全范围受阻；站稳后重新预览，不扣 MP。':
      '可确认。费用只在明确释放时收取；实际水到达接水处后才记录理解。'};
  }
  confirmLengthStudy(planId:string):EpisodeResult{
    const w=this.physical.lengthStudy?.view,preview=this.previewLengthStudy();
    if(!w||w==='baseline'||!preview||preview.plan.planId!==planId||!preview.canConfirm)
      return {accepted:false,choice:'length-cast',text:preview?.reason??'复习槽预览已失效；重新查看，不扣 MP。'};
    const mp=this.truth.mp,r=executeLengthStudy(w,mp.currentMp,mp.maxMp,this.lengthZones(),this.hasLength(w,'braced'));
    if(!r.committed||r.paid!==lengthCost(w))return {accepted:false,choice:'length-cast',text:'当前构形不能安全提交；不扣 MP。'};
    this.markLength(w,'cast',[{eventId:'episode.length.mp.'+w,type:'mp_replaced',
      payload:{mp:{...mp,currentMp:mp.currentMp-r.paid,worldVersion:mp.worldVersion+1}}}]);
    this.physical.lengthStudy![w]={age:0};delete this.lengthWorlds[w];
    return {accepted:true,text:'留在复习槽旁，看水实际落下。',resumeWorld:true};
  }
  private advanceLengthStudy():void{
    const s=this.physical.lengthStudy,w=s?.view,p=this.physical.player;
    if(!s||!w||w==='baseline'||!s[w]||Math.abs(p.x+6-LENGTH_STUDY.targetX)>96||Math.abs(p.y+14-LENGTH_STUDY.targetY)>80)return;
    const t=s[w]!,world=this.lengthWorld(w);if(t.age>=LENGTH_STUDY.settleTicks)return;
    world.advance();t.age++;
    if(world.satisfied&&!this.hasLength(w,'completed'))this.markLength(w,'completed',lengthStudyEvidence(this.truth,this.session.sessionId,w,'ground'));
  }
  private lengthInteraction(choice:string):EpisodeResult{
    const say=(text:string):EpisodeResult=>({accepted:true,text});
    const menu=()=>({...say('旁侧是隔离的复习槽：复用短接水杯和远端水舌的几何，不连通已经修好的门阀。可选择一种练习，旧机关和水位不会重置；每种只允许本轮一次确认施放。'),
      actions:[{id:'length:select:lili',label:'观察短接水槽'},{id:'length:select:suli',label:'观察远端接水槽'},{id:'length:baseline',label:'回看默认回声'}]});
    if(!this.hasRoom('entered')||!this.has('debrief'))return say('先完成隐士的首次安全实践和复盘，原工具路线仍可继续。');
    if((this.physical.echoAge??0)<180)return say('先关闭面板，看入口回声的默认水段落稳，再来比较长短。演示不消耗 MP，不计学习成功。');
    if(choice==='length:baseline'){if(this.physical.lengthStudy)this.physical.lengthStudy.view='baseline';return {accepted:true,text:'回看原默认水段。复习槽进度保留。',resumeWorld:true};}
    if(choice==='length:open')return menu();
    const selected=LENGTH_WORDS.find(w=>choice==='length:select:'+w);
    if(selected){
      if(!this.hasLength(selected,'observed'))this.markLength(selected,'observed',
        this.truth.learning.words[selected]?.discoveryState==='discovered'?[]:lengthStudyEvidence(this.truth,this.session.sessionId,selected,'observe'));
      this.physical.lengthStudy??={version:1,view:selected};this.physical.lengthStudy.view=selected;
    }
    const w=this.physical.lengthStudy?.view;if(!w||w==='baseline')return menu();
    const back=[{id:'length:open',label:'查看其他复习槽'}];
    if(this.hasLength(w,'completed'))return {...say('这次表达与实际接水结果一致，已记一次有情境提示的理解。长度改变，截面、初速度和非攻击性质不变；没有增加 MP 上限、容量、报酬，也没有替你完成原机关或碎片同步。'),actions:back};
    if(this.hasLength(w,'cast'))return {...say('水已释放，不再扣费。关闭面板并留在槽旁，看水真正进入接水处；切换视图、走远、离场都会暂停这份复习水。'),actions:back};
    const explanation=w==='lili'?'lili 的宽泛含义是小／少。这里 telo lili 解释为 16 px 长、12 px 宽的水段，挡板距锚点 20 px，短段可落入挡板前的接水杯。不是更弱的攻击。':
      'suli 的宽泛含义是大／多。这里 telo suli 解释为 64 px 长、12 px 宽的水段，水舌距锚点 58 px；长段接触水舌后释放有限水箱，水还需落入远端接水槽。不是更强的攻击。';
    if(!this.hasLength(w,'attuned')){
      if(choice==='length:attune'){
        this.markLength(w,'attuned',this.truth.learning.words[w]?.attunementState==='attuned'?[]:lengthStudyEvidence(this.truth,this.session.sessionId,w,'attune'));
      }else return {...say(explanation+' 可用槽边不可带走的普通嵌片调谐。'),actions:[{id:'length:attune',label:'用槽边嵌片调谐'},...back]};
    }
    if(choice==='length:brace'&&w==='suli'&&!this.hasLength(w,'braced'))this.markLength(w,'braced');
    const support=w==='suli'&&!this.hasLength(w,'braced')?[{id:'length:brace',label:'固定复习槽支撑'}]:[];
    if(this.hasLength(w,'predicted'))return {...say('已保留你的表达与预测。先预览形态和费用，再明确确认；容量或 MP 不够可以回隐士恢复，原工具路线照常可走。'),choice:'length-cast',actions:[...support,...back]};
    if(choice==='length:hint')return {...say(explanation),actions:[{id:'length:recall',label:'收起注音，重新表达'},...back]};
    if(choice.startsWith('length:predict:')&&parseLengthPrediction(w,choice)){
      this.markLength(w,'predicted');return this.lengthInteraction('length:preview');
    }
    return {...say(choice.startsWith('length:predict:')?'表达或预测还没对应上，不扣 MP，不写成功证据。可以复看注音后重新想一想。':
      w==='lili'?'写出使水段缩短的两词表达，并预测它会落在哪里。默认段长 32 px，挡板前只有 20 px；宽度不变。':
      '写出使水段加长的两词表达，并预测接水结果。默认段长 32 px，远端水舌在 58 px 处；宽度不变。'),
      choice:'length-recall',actions:[{id:'length:hint',label:'复看尺度注音'},...support,...back]};
  }
  hasMotion(flag:MotionFlag):boolean{return this.truth.world.flags['global:forest.episode.motion.'+flag]?.value===true;}
  get motionStudyStage():MotionFlag|'unvisited'{return [...MOTION_FLAGS].reverse().find(f=>this.hasMotion(f))??'unvisited';}
  private markMotion(flag:MotionFlag):void{
    this.commit('motion.'+flag,[{eventId:'episode.motion.flag.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.motion.'+flag,value:true,scope:'global'}}],'learning');
  }
  private motionCoordinator(action:'discover'|'attune'|'ground'):void{
    const c=new PrologueWaterwheelSession(this.session);
    const r=action==='discover'?c.discoverTawa('episode.motion.discovery'):action==='attune'?c.attuneTawa('episode.motion.attunement'):
      c.groundTawa('episode.motion.grounding',{solutionId:'waterwheel.repair_axle',promptLevel:1,
        predictedMotionCorrect:this.hasMotion('predicted'),worldOutcomeContribution:!!this.physical.motionStudy&&motionVerified(this.physical.motionStudy),
        toolBypass:false,answerVisible:false});
    if(!r.accepted)throw Error('水轮运动学习未提交：'+r.reason);
    this.session=c.session;this.truth=this.session.snapshot();
  }
  private advanceMotion(flow:number,beforeAngle:number):void{
    const p=this.physical,s=p.motionStudy!;
    advanceMotionStudy(s,{gate:p.gate,repaired:this.has('repaired'),flow,beforeAngle,afterAngle:p.wheelAngle,
      near:Math.abs(p.player.x+6-MOTION_STUDY.x)<=96&&Math.abs(p.player.y+7-MOTION_STUDY.y)<=80});
    if(s.phase==='observe'&&motionVerified(s)&&!this.hasMotion('observed')){
      if(this.truth.learning.words.tawa?.discoveryState!=='discovered')this.motionCoordinator('discover');
      this.markMotion('observed');
    }
    if(s.phase==='trial'&&motionVerified(s)&&!this.hasMotion('completed')){this.motionCoordinator('ground');this.markMotion('completed');}
  }
  private motionInteraction(choice?:string):EpisodeResult{
    const say=(text:string):EpisodeResult=>({accepted:true,text});
    if(!this.has('repaired'))return say('先用原来的工具修好轮轴和水渠，之后可以自选观察，不会因维修直接学会词语。');
    if(!this.hasMotion('entered')){
      if(choice==='motion:observe'){
        this.markMotion('entered');this.physical.motionStudy=emptyMotionStudy();
        return {accepted:true,text:'留在轮旁观察活动标记与固定支架。',resumeWorld:true};
      }
      return {...say('旧刻槽把水轮上的活动标记，与不动的支架放在一起。可以观察这组对比；不需要施法，不会改变闸门、供水或奖励。'),
        actions:[{id:'motion:observe',label:'观察水轮与固定支架'}]};
    }
    if(!this.hasMotion('observed'))return say('留在轮旁，关闭面板，看活动标记怎样绕固定轮轴移动。需要实际来水和转动；若闸门关闭，可以按原路去打开。离开观察处就暂停记录。');
    if(this.hasMotion('completed'))return say('回忆出的 tawa 和观测吻合：活动标记沿轮缘运动，固定支架没有跟着走。这里因现场水流而顺时针转动；tawa 本身不是“顺时针”，也不是水或力度。只记一次有情境提示的理解证据，没有增加 MP、容量、报酬或攻击资格。');
    if(!this.hasMotion('attuned')){
      if(!this.has('debrief'))return say('你看到活动标记在移动，支架保持不动。先带石龛中的媒介去找隐士，完成第一次安全实践与复盘，再回来看旧刻槽；观测记录会保留。');
      if(choice==='motion:attune'){
        if(this.truth.learning.words.tawa?.attunementState!=='attuned')this.motionCoordinator('attune');
        this.markMotion('attuned');
      }else return {...say('旧刻槽的注音是 tawa：去、移动。活动标记位置不断改变，固定支架不动。顺时针是这座水轮的现场方向，不是这个词的固定含义。可用支架旁不可带走的普通嵌片校准媒介。'),
        actions:[{id:'motion:attune',label:'用支架嵌片校准媒介'}]};
    }
    if(this.hasMotion('predicted'))return say('预测已提交。关闭面板继续观察真实来水与转动，至少看满一段稳定运动；按钮本身不算完成。不开闸、远离水轮或离开场景时不会偷偷结算。');
    if(choice==='motion:hint')return {...say('复看注音：tawa，去、移动。标记相对固定支架改变位置；现场来水使它顺时针绕轴转动。词语表示移动，具体方向来自现场。'),
      actions:[{id:'motion:recall',label:'收起注音，重新预测'}]};
    if(choice?.startsWith('motion:predict:')){
      if(parseMotionPrediction(choice)){
        this.markMotion('predicted');this.physical.motionStudy=emptyMotionStudy('trial');
        return {accepted:true,text:'请观察活动标记的真实运动。',resumeWorld:true};
      }
      return {...say('词语或运动预测还没有对应上。不扣 MP，也没有写入成功证据；可以复看后再想一想。'),choice:'motion-recall',
        actions:[{id:'motion:hint',label:'复看运动注音'}]};
    }
    return {...say('回忆表示去／移动的词。按刚才看到的来水方向，活动标记接下来相对固定支架会怎样？这是有情境提示的观察练习，不是施法。'),choice:'motion-recall',
      actions:[{id:'motion:hint',label:'复看运动注音'}]};
  }
  hasWaterStudy(flag:WaterStudyFlag):boolean{return this.truth.world.flags['global:forest.episode.water-study.'+flag]?.value===true;}
  get waterStudyStage():WaterStudyFlag|'unvisited'{return [...WATER_STUDY_FLAGS].reverse().find(f=>this.hasWaterStudy(f))??'unvisited';}
  private markWaterStudy(flag:WaterStudyFlag,extra:SessionEventDraft[]=[]):void{
    const drafts:SessionEventDraft[]=[{eventId:'episode.water-study.flag.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.water-study.'+flag,value:true,scope:'global'}},...extra];
    const word=this.truth.learning.words.telo;
    if(flag==='seen'&&word?.discoveryState!=='discovered'||flag==='attuned'&&word?.attunementState!=='attuned'||flag==='completed'){
      const evidence=waterStudyEvidence(flag as 'seen'|'attuned'|'completed',this.session.sessionId);
      drafts.push({eventId:'episode.water-study.learning.'+flag,type:'learning_evidence_committed',payload:{evidence}});
    }
    this.commit('water-study.'+flag,drafts,'learning');
  }
  private waterStudyInteraction(choice?:string):EpisodeResult{
    const say=(text:string):EpisodeResult=>({accepted:true,text,speaker:'隐士'});
    if(!this.has('debrief')||!this.has('practiced'))return say('先完成原来的安全练习，和我复盘，再来试可选的回忆练习。');
    if(!this.hasWaterStudy('seen')){
      if(choice==='water:observe'){
        if(!waterStudyReady(this.physical.practice))return say('先让上次的水沿槽流完，再观察接水盆；不会清空原来的水。');
        this.markWaterStudy('seen');
      }else return {...say('想确认自己记住了什么，可以再观察石槽里的水与壶上的注音。旧练习仍然保留，这次不会自动发放奖励。'),
        actions:[{id:'water:observe',label:'重新观察水与注音'}]};
    }
    if(this.hasWaterStudy('completed'))return say('你回忆了 telo（水／液体），预测并显化的一份水已真正到达接水盆。记下一次有情境提示的理解证据，不等于熟练掌握；没有再提高 MP、容量或报酬。');
    if(!this.hasWaterStudy('attuned')){
      if(choice==='water:attune')this.markWaterStudy('attuned');
      else return {...say('telo 指水，也可以泛指液体；不是“让水听话”的命令。已有木楔只是修好了漏口。用这里不可带走的普通共鸣嵌片校准后，再收起注音试着回忆。'),
        actions:[{id:'water:attune',label:'用水槽嵌片校准媒介'}]};
    }
    if(this.hasWaterStudy('casting'))return say('这一份水还在沿槽流动。关上面板看它到达右侧接水盆；不会再次扣 MP 或补放水。');
    if(this.hasWaterStudy('predicted')){
      if(choice==='water:confirm'){
        if(!waterStudyReady(this.physical.practice))return say('先等槽内正在流动的水走完，再确认；尚未扣 MP。');
        const mp=this.truth.mp;
        if(mp.currentMp<WATER_STUDY.cost)return {...say('当前 MP 不足 2。可以去左侧坐垫恢复；预测保留，尚未扣费，原来的旅途不受影响。'),
          actions:[{id:'water:confirm',label:'再次检查并确认释放（2 MP）'}]};
        const next=structuredClone(this.physical.practice);
        if(supplyEpisodeWater(next,WATER_STUDY.amount,this.controls('practice'))!==WATER_STUDY.amount)return say('出水位置受阻，尚未扣 MP；先观察现场。');
        const n=this.physical.casts+1,study:WaterStudyState={version:1,baselineCollected:collectedEpisodeWater(this.physical.practice),
          castIndex:n,startTick:this.physical.practice.tick};
        this.commit('cast.'+n,[{eventId:'episode.cast.'+n,type:'mp_replaced',
          payload:{mp:{...mp,currentMp:mp.currentMp-WATER_STUDY.cost,worldVersion:mp.worldVersion+1}}}],'cast');
        this.markWaterStudy('casting',[{eventId:'episode.water-study.origin',type:'world_flag_set',
          payload:{flagId:'forest.episode.water-study.origin',value:waterStudyOrigin(study),scope:'global'}}]);
        // Preserve the original practice completion baseline and all previously collected water.
        this.physical.practice=next;this.physical.casts=n;this.physical.waterStudy=study;
        return {accepted:true,text:'释放已确认，请观察这份水实际到达接水盆。',resumeWorld:true};
      }
      return {...say('预测已记下。固定小量显化：2 MP、32 格水、零初速度，受重力；木楔和旧水保留。确认才扣费，也可以先离开。'),
        actions:[{id:'water:confirm',label:'确认释放（2 MP）'}]};
    }
    if(choice==='water:hint')return {...say('复看注音：telo，水／液体。显化水仍受重力，会沿有木楔支撑的石槽往低处流；看提示本身不算理解成功。'),
      actions:[{id:'water:recall',label:'收起注音，重新回忆'}]};
    if(choice?.startsWith('water:predict:')){
      if(parseWaterPrediction(choice)){this.markWaterStudy('predicted');return this.waterStudyInteraction();}
      return {...say('词语或流向预测还没有对应上；没有扣 MP，也没有写入成功证据。'),choice:'water-recall',
        actions:[{id:'water:hint',label:'复看水槽注音'}]};
    }
    return {...say('回忆表示水／液体的那个词，再预测：在槽左端显化一份水后，它会怎样运动？这是有情境提示的练习。'),choice:'water-recall',
      actions:[{id:'water:hint',label:'复看水槽注音'}]};
  }
  hasForce(flag:ForceFlag):boolean{return this.truth.world.flags['global:forest.episode.force.'+flag]?.value===true;}
  get forceView(){return this.physical.forceStudy?forceStudyView(this.physical.forceStudy):null;}
  get shardSyncStage(){return this.physical.shardSync?.phase??'unvisited';}
  get allocationMode():AllocationMode|null{
    const mode=this.truth.world.flags['region:'+MIGRATION_REGION+':forest_water_allocation']?.value;
    return isAllocationMode(mode)?mode:null;
  }
  get allocationStage(){return this.physical.allocation?.phase??'unvisited';}
  get allocationSummary():string{return this.allocationMode?allocationDescription(forestChapter,this.allocationMode):'尚未提交三路配水。';}
  get allocationView(){
    const s=this.physical.allocation;if(!s)return null;
    return {state:s,quotas:allocationQuotas(s.mode),world:s.phase==='preview'?null:this.allocationWorld};
  }
  private get allocationWorld():AllocationWorld{
    const s=this.physical.allocation!;return this.allocationPhysics??=new AllocationWorld(s.mode,s.age);
  }
  private allocationInteraction(choice?:string):EpisodeResult{
    const say=(text:string,actions?:EpisodeResult['actions']):EpisodeResult=>({accepted:true,text,actions});
    if(!this.hasShard('synchronized'))return say('先完成碎片同步。暂时不能选择三路配水；可以沿原路返回，不会消耗 MP。');
    let s=this.physical.allocation;
    if(s?.phase==='committed')return say(this.allocationSummary+'这是本阶段的已确认分配，不能靠重开面板改选。原碎片、水路维修、动物生命和学习记录保留；其他位点线索与章节结尾尚待调查。');
    if(s?.phase==='routing')return say('分配已确认，正在用有限的旧水检定三路出口。关闭面板留在台旁观察；离开、地图和日志会暂停。此时不能取消或改选。');
    if(choice==='allocation:cancel'){delete this.physical.allocation;this.allocationPhysics=undefined;s=undefined;}
    const selected=choice?.startsWith('allocation:preview:')?choice.slice('allocation:preview:'.length):null;
    if(isAllocationMode(selected)){
      s=this.physical.allocation={version:1,mode:selected,phase:'preview',age:0};this.allocationPhysics=undefined;
    }
    if(s&&choice==='allocation:confirm:'+s.mode){
      if(!shardPrerequisites(this.truth,forestChapter))return say('同步前置记录不完整，未启动分流。');
      const world=new AllocationWorld(s.mode);
      this.commit('allocation.confirm',[{eventId:'episode.allocation.selected',type:'world_flag_set',
        payload:{flagId:'forest.episode.allocation.selected',value:s.mode,scope:'global'}}]);
      s.phase='routing';this.allocationPhysics=world;
      return {accepted:true,text:'已锁定'+ALLOCATION_NAMES[s.mode]+'。观察旧水通过计量槽，三路实际入量符合刻度后才生效。没有扣 MP。',resumeWorld:true};
    }
    const options=forestChapter.allocation.modeIds.map(mode=>({id:'allocation:preview:'+mode,label:'预览：'+ALLOCATION_NAMES[mode]}));
    if(!s)return say('损坏的系统无法同时满足三路需求。先比较收益与代价；预览可取消，不改世界、不扣 MP。确认后锁定本阶段选择，仍能沿原检修路返回。',options);
    const q=allocationQuotas(s.mode);
    return say('仅预览 · '+allocationDescription(forestChapter,s.mode)+'检定水箱共 120 格旧水：聚落 '+q.settlement+'、湿地 '+q.wetland+'、商路 '+q.road+
      '；这是本阶段可调整的设计比例，不是免费施法。确认后不能反复改选，实际出水符合刻度才生效。食品价格数值、商队与新地图尚未接入；不会自动赠送物品、声望或战斗资格。',
      [{id:'allocation:confirm:'+s.mode,label:'确认：'+ALLOCATION_NAMES[s.mode]},...options,{id:'allocation:cancel',label:'取消预览'}]);
  }
  private advanceAllocation():void{
    const s=this.physical.allocation;if(!s||s.phase!=='routing'||this.nearest()?.id!=='node-allocation')return;
    const world=this.allocationWorld;world.advance();s.age=world.age;
    if(!world.satisfied)return;
    const regional=(flagId:string,value:boolean|string):SessionEventDraft=>({eventId:'episode.allocation.result.'+flagId,
      type:'world_flag_set',payload:{flagId,value,scope:'region',regionId:MIGRATION_REGION}});
    this.commit('allocation.completed',[
      regional('forest_water_allocation',s.mode),regional(forestChapter.allocation.commitEventId,true),
      ...allocationEffects(forestChapter,s.mode).map(id=>regional('forest_allocation_effect.'+id,true)),
      {eventId:'episode.allocation.quest',type:'quest_stage_set',payload:{questId:'ch01_underground_water_allocation',
        stageId:'water_allocated',stageOrdinal:(this.truth.quests.ch01_underground_water_allocation?.stageOrdinal??0)+1}},
    ]);
    s.phase='committed';
  }
  private hasShard(flag:'started'|'aligned'|'synchronized'):boolean{
    return this.truth.world.flags['global:forest.episode.shard.'+flag]?.value===true;
  }
  private markShard(flag:'started'|'aligned'|'synchronized',extra:SessionEventDraft[]=[]):void{
    this.commit('shard.'+flag,[{eventId:'episode.shard.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.shard.'+flag,value:true,scope:'global'}},...extra]);
  }
  private shardInteraction(choice?:string):EpisodeResult{
    const say=(text:string,actions?:EpisodeResult['actions']):EpisodeResult=>({accepted:true,text,actions});
    if(!this.hasMigration('archive'))return say('先读左侧旱季配水档案，弄清这套装置为何停用。森林碎片仍在行囊里。');
    const missing=shardMissingWords(this.truth,forestChapter);
    if(missing.length)return say('槽口与森林碎片相符。碎片没有插入或消耗。先补齐现场理解记录：'+missing.join('、')+
      '。隐士水槽复习 telo，工坊轮轴复习 tawa，蓄水室入口回声复习 lili / suli，回流渠出水口复习 wawa。工具通路和旧练习权限仍保留；同步不会替你学会这些词。');
    if(!shardPrerequisites(this.truth,forestChapter))return say('原碎片或湿地处理记录缺失，不能同步；可沿左侧原路返回。');
    let s=this.physical.shardSync;
    if(s?.phase==='synchronized')return say('森林位点已同步，碎片已取回行囊。装置只恢复了此位点的连接，没有补充 MP、提高容量、授予词义或攻击能力。'+(this.allocationMode?this.allocationSummary:'三路配水尚未决定。')+'第一章尚未结束。');
    if(choice==='shard:withdraw'&&s){
      s.phase='packed';s.age=0;return say('碎片收回行囊，未提交同步。已有调查和学习记录保留，随时可以重新嵌入。',[{id:'shard:seat',label:'重新嵌入原碎片'}]);
    }
    if(!s||s.phase==='packed'){
      if(choice!=='shard:seat')return say('碎片的缺口与底座相合。嵌入后用手动校准柄让两道刻线重合；稳定后仍需你确认。原碎片不会消耗，不花 MP。',[{id:'shard:seat',label:'嵌入原碎片'}]);
      if(!this.hasShard('started'))this.markShard('started');
      s=this.physical.shardSync={version:1,phase:'seated',age:0};
    }
    const withdraw={id:'shard:withdraw',label:'取回碎片，暂不同步'};
    if(s.phase==='seated'){
      if(choice==='shard:align'){s.phase='aligning';return {accepted:true,text:'校准柄已松开。留在底座旁观察刻线缓慢重合；稳定后再次互动确认。',resumeWorld:true};}
      return say('原碎片已嵌入，刻线还没有对齐。可转动手动校准柄，也可取回碎片。',[{id:'shard:align',label:'转动校准柄'},withdraw]);
    }
    if(s.phase==='aligning')return say('刻线正在靠拢（'+Math.floor(s.age/SHARD_SYNC_TICKS*100)+'%）。关掉面板，留在底座旁继续观察；离开和阅读时暂停。',[withdraw]);
    if(choice!=='shard:confirm')return say('两道刻线已稳定重合。确认后只登记森林位点的同步，并取回原碎片；不分配水路，不给予能力。',[{id:'shard:confirm',label:'确认同步并取回碎片'},withdraw]);
    this.markShard('synchronized',[
      {eventId:'episode.'+SHARD_SYNC_EVENT,type:'world_flag_set',payload:{flagId:SHARD_SYNC_EVENT,value:true,scope:'region',regionId:MIGRATION_REGION}},
      {eventId:'episode.shard.quest',type:'quest_stage_set',payload:{questId:'ch01_underground_water_allocation',stageId:'shard_synchronized',
        stageOrdinal:(this.truth.quests.ch01_underground_water_allocation?.stageOrdinal??0)+1}},
    ]);
    s.phase='synchronized';
    return say('刻线锁定，森林位点已同步。你取回原碎片；三路配水台的检修指针醒了过来，但还没有改动任何水路。没有获得新的词义、MP、报酬或能力。');
  }
  get chapterWordNotes():string{
    return ['telo','tawa','wawa','lili','suli'].map(word=>{
      const p=this.truth.learning.words[word];
      const state=!p||p.discoveryState!=='discovered'?'尚未登记':
        p.learningState==='stabilized'?'已稳定':p.learningState==='produced'?'已有表达证据':
        p.learningState==='grounded'?'已有场景理解证据':p.attunementState==='attuned'?'已调谐，待场景练习':'已观察，待调谐';
      return word+'：'+state;
    }).join('；');
  }
  private markForce(flag:ForceFlag):void{
    this.commit('force.'+flag,[{eventId:'episode.force.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.force.'+flag,value:true,scope:'global'}}],'learning');
  }
  private forceCoordinator(action:'discover'|'attune'|'ground'):void{
    const coordinator=new PrologueReturnFlowSession(this.session);
    const result=action==='discover'?coordinator.discoverWawa('episode.force.discovery'):
      action==='attune'?coordinator.attuneWawa('episode.force.attunement'):
        coordinator.groundWawa('episode.force.grounding',{solutionId:FLOW_SOLUTION,promptLevel:1,
          predictedForceContrastCorrect:this.hasForce('predicted'),
          worldOutcomeContribution:!!this.physical.forceStudy&&forceTrialVerified(this.physical.forceStudy),answerVisible:false});
    if(!result.accepted)throw Error('测力器学习记录未提交：'+result.reason);
    this.session=coordinator.session;this.truth=this.session.snapshot();
  }
  private advanceForce():void{
    const s=this.physical.forceStudy!;
    advanceForceStudy(s);
    if(s.run==='contrast'&&forceContrastVerified(s)&&!this.hasForce('observed')){
      if(this.truth.learning.words.wawa?.discoveryState!=='discovered')this.forceCoordinator('discover');
      this.markForce('observed');
    }
    if(s.run==='trial'&&forceTrialVerified(s)&&!this.hasForce('completed')){
      this.forceCoordinator('ground');this.markForce('completed');
    }
  }
  private forceInteraction(choice?:string):EpisodeResult{
    const say=(text:string):EpisodeResult=>({accepted:true,text});
    if(!this.hasFlow('restored'))return say('两路出水稳定后才能使用测力器，不会通过教学按钮绕过维修。');
    if(choice==='force:observe'&&!this.hasForce('entered')){
      this.markForce('entered');this.physical.forceStudy=emptyForceStudy();
      return {accepted:true,text:'观察水口旁测力器的两档加载。',resumeWorld:true};
    }
    if(!this.hasForce('entered'))return {...say('水口旁有一套带护罩的弹簧测力器。它由已有流水驱动，依次施加两档同方向负载；不取走供水、不生成材料，也不是玩家免费施法。'),
      actions:[{id:'force:observe',label:'观察两档加载'}]};
    if(!this.hasForce('observed'))return say('测力器正在依次加载。关闭面板后看指针；等两档都实际稳定，再来查看旧刻槽。');
    if(this.hasForce('completed'))return say('你回忆出的 wawa 与实际结果相符：方向不变，同一弹簧在更大作用力下偏移更大。已记录一次有情境提示的理解练习，不等于熟练掌握，不增加 MP、容量、攻击资格或报酬。这里不是“所有魔法都变大”的规则。');
    if(choice==='force:attune'&&!this.hasForce('attuned')){
      if(this.truth.learning.words.wawa?.attunementState!=='attuned')this.forceCoordinator('attune');
      this.markForce('attuned');
      return {...say('你用现场不可带走的共鸣嵌片，将媒介对准测力器旧刻槽。调谐已记录，没有回复 MP；准备好后可以回忆词语并预测。'),
        actions:[{id:'force:recall',label:'开始回忆与预测'}]};
    }
    if(!this.hasForce('attuned'))return {...say('两档的方向相同，指针的稳态偏移从约 6 增至约 18。旧刻槽旁的检修注音是 wawa：强、有力、能量／力量。在这套装置里对应已有作用的强弱，不是水量、尺寸或方向，也不等于攻击。'),
      actions:[{id:'force:attune',label:'用现场嵌片校准媒介'}]};
    if(this.hasForce('predicted'))return say('预测已记录，测力器正在复现负载变化。关闭面板后观察实际结果；按下按钮不算完成。');
    if(choice==='force:hint')return {...say('提示复看 · wawa：强、有力、能量／力量。这个试验只改变同一方向的作用力，不增加水量或尺寸，不倒转方向。复看不会直接获得理解证据。'),
      actions:[{id:'force:recall',label:'收起提示，重新预测'}]};
    if(choice?.startsWith('force:predict:')){
      if(parseForcePrediction(choice)){
        this.markForce('predicted');this.physical.forceStudy={version:1,run:'trial',age:0};
        return {accepted:true,text:'预测已提交，请观察实际加载。',resumeWorld:true};
      }
      return {accepted:true,choice:'force-recall',text:'词语或预测还没有对应上，不扣 MP。可以再想一想，或复看提示；没有写入成功证据。',
        actions:[{id:'force:hint',label:'复看提示'}]};
    }
    return {accepted:true,choice:'force-recall',text:'回忆刚才表示“强／有力”的词。在已有向右作用的情况下，用它描述更强的一档，你预测同一弹簧的稳态偏移怎样变化？写出词语，再选择预测。当前提供情境提示，不是无提示掌握考核。',
      actions:[{id:'force:hint',label:'复看提示'}]};
  }
  private migrationIdentity(young=false):string {
    if(!this.migrationLifeIds.has(young))this.migrationLifeIds.set(young,createStableWildlifeLifeId({
      regionSaveId:this.session.sessionId,
      entityId:young?'return_wetland.large_creature.young':forestChapter.largeCreature.entityId,
      spawnGeneration:0,spawnSequence:0}));
    return this.migrationLifeIds.get(young)!;
  }
  get migrationControls(){
    return {cleared:this.hasMigration('cleared'),
      adultAlive:this.truth.lifeCorpseLedger.lives[this.migrationIdentity()]?.state==='alive',
      youngAlive:this.truth.lifeCorpseLedger.lives[this.migrationIdentity(true)]?.state==='alive'};
  }
  private markMigration(flag:MigrationFlag,extra:SessionEventDraft[]=[]):void{
    this.commit('migration.'+flag,[{eventId:'episode.migration.'+flag,type:'world_flag_set',
      payload:{flagId:'forest.episode.migration.'+flag,value:true,scope:'global'}},...extra]);
  }
  private enterWetland():EpisodeResult{
    if(!this.hasFlow('restored'))return {accepted:true,text:'分流口还没有稳定。先让聚落和湿地的两路出水恢复，再沿旧渠调查下游。'};
    if(!this.hasMigration('entered')){
      const drafts:SessionEventDraft[]=[];
      for(const young of [false,true]){
        const id=this.migrationIdentity(young);
        // One identity for each actual animal. Never replace an existing damaged life or death tombstone.
        if(!this.truth.lifeCorpseLedger.lives[id])drafts.push({eventId:'episode.migration.life.'+(young?'young':'adult'),
          type:'wildlife_life_registered',payload:{life:createWildlifeLifeRecord({
            lifeInstanceId:id,regionSaveId:this.session.sessionId,regionId:MIGRATION_REGION,
            entityId:young?'return_wetland.large_creature.young':forestChapter.largeCreature.entityId,
            species:'large_semiaquatic_nester',ageClass:young?'juvenile':'adult',spawnGeneration:0,spawnSequence:0,
            // Provisional lifecycle capacity only; this slice exposes no damage/harvesting actions.
            harvestProfileId:'forest.large_semiaquatic_nester.no_harvest',maxHp:young?40:100,
            registeredAtWorldTick:this.truth.survival.worldTicks})}});
      }
      this.markMigration('entered',drafts);
      this.physical.migration=emptyWetlandMigration();
      if(!this.migrationControls.adultAlive)this.physical.migration.mode='dead';
    }
    this.travel('wetland',34);
    return {accepted:true,text:'旧巢边的水痕正在上升，大型半水生动物带着幼体寻找出路。先留在左岸观察；可随时返回检修渠。'};
  }
  private advanceMigration():void{
    const s=this.physical.migration!;
    advanceWetlandMigration(s,this.migrationControls,{...this.physical.player,width:12,height:14});
    if(this.hasMigration('resolved')||!migrationSettled(s))return;
    if(!this.hasMigration('young')||!this.hasMigration('nest')||!this.hasMigration('cleared'))throw Error('迁徙缺少现场证据');
    const regional=(flagId:string,value:boolean|string):SessionEventDraft=>({
      eventId:'episode.migration.result.'+flagId,type:'world_flag_set',payload:{flagId,value,scope:'region',regionId:MIGRATION_REGION}});
    this.markMigration('resolved',[
      regional(forestChapter.largeCreature.resolutionEventId,true),
      regional('forest_large_creature_resolution','migration_restored'),
      regional('forest_large_creature_life_state',this.truth.lifeCorpseLedger.lives[this.migrationIdentity()]!.currentHp <
        this.truth.lifeCorpseLedger.lives[this.migrationIdentity()]!.maxHp?'injured':'alive'),
      {eventId:'episode.'+forestChapter.largeCreature.resolutionEventId,type:'quest_stage_set',
       payload:{questId:'ch01_large_creature_crisis',stageId:'completed',stageOrdinal:(this.truth.quests.ch01_large_creature_crisis?.stageOrdinal??0)+1}},
    ]);
  }
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
      if(this.allocationMode)return '配水已生效：'+this.allocationSummary+'可沿原路回看聚落与湿地；后续位点线索和章节结局尚未完成';
      if(this.allocationStage==='routing')return '配水已确认；留在三路配水台旁观察有限旧水通过计量槽，实际入量达标才生效';
      if(this.hasShard('synchronized'))return '森林位点已同步，原碎片已取回；在右侧配水台比较三种取舍，预览后再确认';
      if(this.hasMigration('archive'))return '档案揭示了旱季改渠的代价；补齐五词现场理解后，在碎片座手动对齐并确认同步';
      if(this.hasMigration('node_entered'))return '调查地下档案和受损碎片座；先弄清旧水路为何改变';
      if(this.hasMigration('resolved'))return '动物与幼体已迁入右岸苇地；沿空出的浅滩到地下档案入口';
      if(this.hasMigration('cleared'))return '出口已疏通；退到旧巢左边的观察处，停留片刻，让成年动物和幼体通过';
      if(this.hasMigration('entered'))return '在左岸观察旧巢和幼体足迹，再用岸上的牵引绳疏通迁徙出口';
      if(this.hasFlow('observed'))return '两路分流已恢复；从回流渠右侧旧渠口调查湿地变化，也可回村查看水口';
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
    if(p.place==='return-channel'&&p.forceStudy)this.advanceForce();
    if(p.place==='wetland')this.advanceMigration();
    if(p.place==='order-node')this.advanceAllocation();
    if(p.place==='order-node'&&p.shardSync&&advanceShardAlignment(p.shardSync,this.nearest()?.id==='node-cradle')&&!this.hasShard('aligned'))
      this.markShard('aligned');
    // Channels freeze with the scene: no off-screen completion or forgotten input while reading dialogue.
    if (p.place === 'mill') {
      // Lazy, explicit accounting boundary: old saves round-trip unchanged until gameplay resumes.
      if (hasMillValley(this.terrainProfile)) p.tailrace ??= emptyMillTailrace(p.mill.escaped);
      const flow = advanceEpisodeWater(p.mill, this.controls('mill'), p.tailrace ? x => receiveMillOutflow(p.tailrace!, x) : undefined);
      if (p.tailrace) advanceMillTailrace(p.tailrace);
      const beforeAngle=p.wheelAngle;
      p.wheelSpeed += ((flow > 0 ? 1 : 0) - p.wheelSpeed) * 0.025;
      p.wheelAngle = (p.wheelAngle + p.wheelSpeed * 0.04) % (Math.PI * 2);
      p.stableTicks = this.has('brace') && this.has('cleared') && p.wheelSpeed > 0.08 ? Math.min(180, p.stableTicks + 1) : 0;
      if (p.stableTicks >= 180 && !this.has('repaired')) this.mark('repaired');
      if(p.motionStudy)this.advanceMotion(flow,beforeAngle);
    }
    if (p.place === 'hermit') {
      advanceEpisodeWater(p.practice, this.controls('practice'));
      if (!this.has('practiced') && this.has('predicted') && this.has('plugged') && p.casts > 0 && collectedEpisodeWater(p.practice) >= p.baselineCollected + 12) this.mark('practiced');
      if(p.waterStudy&&!this.hasWaterStudy('completed')&&waterStudyArrived(p.waterStudy,p.practice))this.markWaterStudy('completed');
    }
    const window=this.physical.window;
    if (p.place==='cistern-entry' && window && window.age<CISTERN_WINDOW.settleTicks) {
      this.windowWorld.advance(); window.age++; this.windowCellsCache=undefined;
      if (this.windowWorld.satisfied && !this.has('window_filled')) this.mark('window_filled');
    }
    if(p.place==='cistern'){
      this.advanceLengthStudy();
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
        if(this.allocationMode){
          if(this.hasRoom('exited')&&!this.hasRoom('reported'))this.markRoom('reported');
          return say(this.allocationSummary+(this.allocationMode==='settlement_priority'?
          '饮水和庄稼暂时稳了，但不能把湿地退水当成没有代价。':
          this.allocationMode==='wetland_priority'?'水口已经挂出分时取水牌；粮食摊担心灌溉不足，但这一阶段还没有改动交易价格。':
          '水口只保留最低供水，商路补给线开始通水。商队和新路线还需要后续调查。')+'维修报酬已结清，不重复发放。','工务人');
        }
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
      case 'flow-spout':
        if(choice?.startsWith('force:'))return this.forceInteraction(choice);
        return this.hasFlow('restored')?{...say('上路送往聚落公共水口，下路送往湿地。旧水仍沿渠道排走，没有额外复制水。水口旁的旧测力器可用来观察非战斗的力度变化。'),
          actions:[{id:'force:open',label:this.hasForce('entered')?'查看测力器记录':'观察旁侧测力器'}]}:
          say('两处出水口通向不同地方。仅仅打开上游不代表两路都有水，要看水真正到达这里。');
      case 'flow-depth':return this.enterWetland();
      case 'wetland-lookout':
        if(this.allocationMode)return say(this.allocationSummary+'成年动物与幼体仍在高岸，之前的和平迁徙没有被撤销。这里的后果是供水和栖息地压力，不会直接扣血或重新刷出生物。');
        if(!this.hasMigration('seen'))this.markMigration('seen');
        return say(this.hasMigration('resolved')?'成年动物和幼体留在右岸较高的苇地。旧巢空了；身后的水路维修状态没有改变。':
          '水回来了，旧巢却被浸湿。成年动物在寻找幼体，拍尾和拨开芦苇是警告，不是要你挑战它。先沿左岸查看痕迹；疏通出口后，回到这里让路。');
      case 'wetland-nest':
        if(!this.hasMigration('seen'))return say('先在左侧观察处看看动物和水位，别贸然接近巢穴。');
        if(!this.hasMigration('nest'))this.markMigration('nest');
        return say('新水痕高过压扁的苇叶，巢里的根茎被浸湿了。水渠修复帮助了聚落，却也改变了这里的栖息条件。更右侧有小一圈的足迹。');
      case 'wetland-young':
        if(!this.hasMigration('nest'))return say('这些小足迹来自旧巢。先查看左边被水浸湿的苇叶。');
        if(!this.hasMigration('young'))this.markMigration('young');
        return say('小足迹朝成年动物延伸；幼体还活着，没有丢失。前方倒木堵住了通向高岸的浅槽；岸边牵引绳可以拉开它，不用靠近或攻击动物。');
      case 'wetland-clear':
        if(!this.hasMigration('young'))return say('先辨认旧巢和幼体足迹，确认哪条浅槽是它们需要的出口。');
        if(!this.hasMigration('cleared'))this.markMigration('cleared');
        return say('你用岸边的牵引绳将倒木移出浅槽。工具留在原处，没有花费 MP。退回左边观察处并关闭面板，给动物和幼体留出通路；它们抵达新苇地后才算处理完毕。');
      case 'node-road':
        if(!this.hasMigration('resolved'))return say('动物还在寻找迁徙通路。先处理旧巢和幼体的处境；地下入口就在它们需要通过的浅滩旁。');
        if(!this.hasMigration('node_entered'))this.markMigration('node_entered');
        this.travel('order-node',28);return say('绕过空出的浅滩，沿石阶进入档案前厅。身后的路通回湿地，森林碎片仍由你保管。');
      case 'node-survey':return say('三条旧水路分别通往聚落、湿地和旧商路。检修图有多处损坏，不能凭眼前两路恢复就断言整个系统平衡了。往右有旱季记录和碎片座；同步只连接位点，不自动分配水路。');
      case 'node-archive':
        if(!this.hasMigration('archive'))this.markMigration('archive');
        return say('档案记着一次旱季：部分居民与议事者将水引向聚落，保住饮水和庄稼，却让湿地与下游承受缺水。他们随后隐去了改渠记录，担心追责和索赔。维修簿又记下：受损系统无法同时满足三路需求。修复并不意味着代价消失。');
      case 'node-cradle':return this.shardInteraction(choice);
      case 'node-allocation':return this.allocationInteraction(choice);
      case 'node-exit':return say('这是通往聚落的旧门，正式的地下结局和交接还没有完成。先从左边返回湿地，再沿检修渠和永久梯回村；不会在这里跳过第一章结局。');
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
        if(choice?.startsWith('length:'))return this.lengthInteraction(choice);
        if(!this.hasRoom('echo')){this.markRoom('echo');this.physical.echoAge=0;this.echoPhysics=undefined;this.echoCellsCache=undefined;}
        return {...say('回声留下 telo 的默认构形：语言上是水／液体，在这套框架中，不加尺度修饰词会形成 32 px 长、12 px 宽的水段，正常施放需 5 MP。关闭对话看水下落。这里是隔离的演示盆，不扣你的 MP，也不能把演示水带走。'),actions:[{id:'length:open',label:'查看旁侧尺度复习槽'}]};
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
        if(this.physical.place==='order-node'){
          this.travel('wetland',528);return say('回到空出的浅滩。成年动物和幼体的位置保持不变，档案记录留在日志里。');
        }
        if(this.physical.place==='wetland'){
          this.travel('return-channel',450);return say('回到分流检修渠。迁徙进度保留，离开现场时不会自动推进。');
        }
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
        if(choice?.startsWith('motion:'))return this.motionInteraction(choice);
        if(this.has('repaired'))return {...say('木撑和轮轴仍然稳固，不必再次维修。支架旁留下了一组关于运动的刻槽。'),
          actions:[{id:'motion:open',label:this.hasMotion('entered')?'继续水轮观察':'查看水轮运动刻槽'}]};
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
        if(choice?.startsWith('water:'))return this.waterStudyInteraction(choice);
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
        if (this.has('practiced')) return this.has('debrief')?{...say('原练习与水都保留了。可以自选一次收起注音的回忆练习，记录这次实际学到的内容。'),
          actions:[{id:'water:open',label:this.hasWaterStudy('seen')?'继续水槽复习':'试试水槽回忆练习'}]}:say('接水盆里留住了清水。回去和隐士谈谈你观察到了什么。');
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
    for(const [i,f] of WATER_STUDY_FLAGS.entries())if(this.hasWaterStudy(f)&&(!this.truth.receiptIndex['forest.episode.water-study.'+f]||
      i>0&&!this.hasWaterStudy(WATER_STUDY_FLAGS[i-1]!)))throw Error('水槽复习的学习顺序不一致');
    if(this.hasWaterStudy('seen')&&(!this.has('debrief')||this.truth.learning.words.telo?.discoveryState!=='discovered')||
      this.hasWaterStudy('attuned')&&this.truth.learning.words.telo?.attunementState!=='attuned'||
      this.hasWaterStudy('casting')!==!!p.waterStudy)throw Error('水槽复习的前置无效');
    if(p.waterStudy){
      validateWaterStudy(p.waterStudy,p.practice,p.casts);
      if(this.truth.world.flags['global:forest.episode.water-study.origin']?.value!==waterStudyOrigin(p.waterStudy)||
        this.hasWaterStudy('completed')!==waterStudyArrived(p.waterStudy,p.practice)||
        this.hasWaterStudy('completed')&&!this.truth.learning.words.telo?.evidence.some(e=>e.eventId==='episode.water-study.completed'&&
          e.eventType==='grounding_trial_resolved'&&e.sourceObjectClass===WATER_STUDY.source&&e.promptLevel===1&&e.answerVisible===false))
        throw Error('水槽复习的水量与学习记录不一致');
    }
    const ss=p.shardSync,synced=this.truth.world.flags['region:'+MIGRATION_REGION+':'+SHARD_SYNC_EVENT]?.value===true;
    for(const f of ['started','aligned','synchronized'] as const)if(this.hasShard(f)&&
      (!ss||!this.truth.receiptIndex['forest.episode.shard.'+f]||f!=='started'&&!this.hasShard('started')))
      throw Error('碎片同步凭证缺失');
    if(ss){
      validateShardState(ss);
      if(!this.hasShard('started')||!shardPrerequisites(this.truth,forestChapter)||
        ['ready','synchronized'].includes(ss.phase)&&!this.hasShard('aligned'))throw Error('碎片同步前置不一致');
    }
    if(synced!==(ss?.phase==='synchronized')||synced!==this.hasShard('synchronized'))throw Error('碎片同步结果与现场不一致');
    if(synced){
      const save=this.session.toSave(),i=save.eventLedger.findIndex(e=>e.eventId==='episode.shard.synchronized');
      const prior=i<0?null:GameSession.replayLedger(save.sessionId,save.origin,save.eventLedger.slice(0,i));
      if(!prior?.ok||!shardPrerequisites(prior.session.snapshot(),forestChapter)||
        prior.session.snapshot().world.flags['global:forest.episode.shard.aligned']?.value!==true||
        this.truth.quests.ch01_underground_water_allocation?.stageId!==(this.allocationMode?'water_allocated':'shard_synchronized'))
        throw Error('碎片同步提交顺序无效');
    }
    const allocation=p.allocation,selected=this.truth.world.flags['global:forest.episode.allocation.selected']?.value;
    const allocationCommitted=this.truth.world.flags['region:'+MIGRATION_REGION+':'+forestChapter.allocation.commitEventId]?.value===true;
    if(allocation){
      validateAllocationState(allocation);
      if(!this.hasShard('synchronized'))throw Error('配水缺少碎片同步');
      if(allocation.phase==='preview'){
        if(selected!==undefined||allocationCommitted)throw Error('已确认配水不能退回预览');
      }else{
        if(selected!==allocation.mode||!this.truth.receiptIndex['forest.episode.allocation.confirm'])throw Error('配水确认记录无效');
        const save=this.session.toSave(),i=save.eventLedger.findIndex(e=>e.eventId==='episode.allocation.selected');
        const prior=i<0?null:GameSession.replayLedger(save.sessionId,save.origin,save.eventLedger.slice(0,i));
        if(!prior?.ok||prior.session.snapshot().world.flags['region:'+MIGRATION_REGION+':'+SHARD_SYNC_EVENT]?.value!==true)
          throw Error('配水早于碎片同步');
        if(this.allocationWorld.satisfied!==(allocation.phase==='committed'))throw Error('配水记录与实际出水不一致');
      }
    }else if(selected!==undefined)throw Error('已确认配水缺少现场状态');
    if(allocationCommitted!==(allocation?.phase==='committed')||!!this.allocationMode!==allocationCommitted||
      allocationCommitted&&(this.allocationMode!==allocation?.mode||!this.truth.receiptIndex['forest.episode.allocation.completed']))
      throw Error('配水提交与现场不一致');
    const expectedEffects=this.allocationMode?allocationEffects(forestChapter,this.allocationMode):[];
    const allEffects=new Set(forestChapter.allocation.modeIds.flatMap(m=>[...allocationEffects(forestChapter,m)]));
    for(const id of allEffects)if((this.truth.world.flags['region:'+MIGRATION_REGION+':forest_allocation_effect.'+id]?.value===true)!==expectedEffects.includes(id))
      throw Error('配水后果与所选方案不一致');
    const ls=p.lengthStudy;
    if(ls){
      validateLengthStudy(ls);
      if(!LENGTH_WORDS.some(w=>this.hasLength(w,'observed'))||!this.hasRoom('entered')||!this.has('debrief')||(p.echoAge??0)<180||ls.view!=='baseline'&&!this.hasLength(ls.view,'observed'))
        throw Error('尺度复习入口不一致');
    }
    for(const w of LENGTH_WORDS){
      for(const [i,f] of LENGTH_PHASES.entries())if(this.hasLength(w,f)&&(!ls||!this.truth.receiptIndex['forest.episode.length.'+w+'.'+f]||
        i>0&&!this.hasLength(w,LENGTH_PHASES[i-1]!)))throw Error('尺度复习顺序不一致');
      if(this.hasLength(w,'cast')!==!!ls?.[w])throw Error('尺度复习施放状态缺失');
      if(this.hasLength(w,'braced')&&(w!=='suli'||!this.hasLength(w,'attuned')||!this.truth.receiptIndex['forest.episode.length.'+w+'.braced']))throw Error('尺度复习支撑状态无效');
      const word=this.truth.learning.words[w];
      if(this.hasLength(w,'observed')&&word?.discoveryState!=='discovered'||this.hasLength(w,'attuned')&&word?.attunementState!=='attuned')throw Error('尺度复习学习账本不一致');
      const t=ls?.[w];
      if(t){
        const save=this.session.toSave(),ledger=save.eventLedger,i=ledger.findIndex(e=>e.eventId==='episode.length.mp.'+w),cast=ledger[i];
        const prior=i<0?null:GameSession.replayLedger(save.sessionId,save.origin,ledger.slice(0,i)),before=prior?.ok?prior.session.snapshot():null;
        if(!before||!cast||cast.type!=='mp_replaced'||ledger.filter(e=>e.eventId==='episode.length.mp.'+w).length!==1||
          cast.payload.mp.currentMp!==before.mp.currentMp-lengthCost(w)||cast.payload.mp.maxMp!==before.mp.maxMp||
          cast.payload.mp.worldVersion!==before.mp.worldVersion+1||before.capabilities.expressionCapacityWords<2||
          this.truth.receiptIndex['forest.episode.length.'+w+'.cast']?.domain!=='cast'||
          w==='suli'&&before.world.flags['global:forest.episode.length.suli.braced']?.value!==true)throw Error('尺度复习施放凭证无效');
        const world=new LengthStudyWorld(w,t);
        if(this.hasLength(w,'completed')!==world.satisfied||this.hasLength(w,'completed')&&!word?.evidence.some(e=>
          e.eventId==='cistern.grounding.episode.length.'+w+'.'+w&&e.eventType==='grounding_trial_resolved'&&e.promptLevel===1&&e.answerVisible===false))
          throw Error('尺度复习水体与理解证据不一致');
      }
    }
    for(const [i,f] of MOTION_FLAGS.entries())if(this.hasMotion(f)&&(!this.truth.receiptIndex['forest.episode.motion.'+f]||
      i>0&&!this.hasMotion(MOTION_FLAGS[i-1]!)))throw Error('水轮运动学习顺序无效');
    if(this.hasMotion('entered')!==!!p.motionStudy||this.hasMotion('entered')&&!this.has('repaired')||
      this.hasMotion('attuned')&&!this.has('debrief'))throw Error('水轮运动学习入口无效');
    if(p.motionStudy){
      validateMotionStudy(p.motionStudy);const w=this.truth.learning.words.tawa;
      if(this.hasMotion('observed')&&w?.discoveryState!=='discovered'||this.hasMotion('attuned')&&w?.attunementState!=='attuned'||
        this.hasMotion('predicted')!==(p.motionStudy.phase==='trial')||
        p.motionStudy.phase==='observe'&&this.hasMotion('observed')!==motionVerified(p.motionStudy)||
        p.motionStudy.phase==='trial'&&this.hasMotion('completed')!==motionVerified(p.motionStudy)||
        this.hasMotion('completed')&&!w?.evidence.some(e=>e.eventId==='infrastructure.tawa.grounding.episode.motion.grounding'&&
          e.eventType==='grounding_trial_resolved'&&e.taskFamilyId==='infrastructure_flow'&&e.promptLevel===1&&e.answerVisible===false))
        throw Error('水轮运动与理解证据不一致');
    }
    const scene = EPISODE_SCENES[p.place];
    for(const [i,f] of FORCE_FLAGS.entries())if(this.hasForce(f)&&(!this.truth.receiptIndex['forest.episode.force.'+f]||
      i>0&&!this.hasForce(FORCE_FLAGS[i-1]!)))throw Error('测力器学习凭证不一致');
    if(this.hasForce('entered')!==!!p.forceStudy||p.forceStudy&&!this.hasFlow('restored'))throw Error('测力器入口未开放');
    if(p.forceStudy){
      validateForceStudy(p.forceStudy);
      const word=this.truth.learning.words.wawa;
      if(this.hasForce('observed')&&word?.discoveryState!=='discovered'||
        this.hasForce('attuned')&&word?.attunementState!=='attuned'||
        this.hasForce('predicted')!==(p.forceStudy.run==='trial')||
        p.forceStudy.run==='contrast'&&this.hasForce('observed')!==forceContrastVerified(p.forceStudy)||
        p.forceStudy.run==='trial'&&this.hasForce('completed')!==forceTrialVerified(p.forceStudy)||
        this.hasForce('completed')&&!word?.evidence.some(e=>e.eventType==='grounding_trial_resolved'&&
          e.sourceObjectClass===RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS&&e.taskFamilyId==='ecology_and_return_flow'&&
          e.worldOutcomeContribution===true&&e.answerVisible===false))
        throw Error('测力器物理与学习证据不一致');
    }
    const migrationDeps:Partial<Record<MigrationFlag,MigrationFlag[]>>={seen:['entered'],nest:['seen'],young:['nest'],
      cleared:['young'],resolved:['cleared'],node_entered:['resolved'],archive:['node_entered']};
    for(const f of MIGRATION_FLAGS)if(this.hasMigration(f)&&(!this.truth.receiptIndex['forest.episode.migration.'+f]||
      migrationDeps[f]?.some(d=>!this.hasMigration(d))))throw Error('湿地调查凭证不一致');
    if(this.hasMigration('entered')!==!!p.migration||p.migration&&!this.hasFlow('restored')||
      (p.place==='wetland'||p.place==='order-node')&&!p.migration||p.place==='order-node'&&!this.hasMigration('node_entered'))
      throw Error('湿地入口状态不一致');
    if(p.migration){
      validateWetlandMigration(p.migration,this.migrationControls);
      for(const young of [false,true]){
        const life=this.truth.lifeCorpseLedger.lives[this.migrationIdentity(young)];
        if(!life||life.regionSaveId!==this.session.sessionId||life.regionId!==MIGRATION_REGION||
          life.entityId!==(young?'return_wetland.large_creature.young':forestChapter.largeCreature.entityId)||
          life.species!=='large_semiaquatic_nester'||life.ageClass!==(young?'juvenile':'adult'))
          throw Error('湿地生物生命身份不一致');
      }
      const regional=(id:string)=>this.truth.world.flags['region:'+MIGRATION_REGION+':'+id]?.value;
      if(!this.hasMigration('resolved')&&migrationSettled(p.migration)||
        this.hasMigration('resolved')&&(p.migration.adultX!==MIGRATION.adultEnd||p.migration.youngX!==MIGRATION.youngEnd)||
        this.hasMigration('resolved')&&(regional(forestChapter.largeCreature.resolutionEventId)!==true||
          regional('forest_large_creature_resolution')!=='migration_restored'||this.truth.quests.ch01_large_creature_crisis?.stageId!=='completed'))
        throw Error('湿地迁徙结果与现场不一致');
    }
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
