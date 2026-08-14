import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { runtimeP0AssetReadiness } from "../assets/runtime-p0-assets";
import { runtimeCore120AssetReadiness } from "../assets/runtime-core120-assets";
import { readRuntimeCisternTaskManifest } from "../content/runtime-task-manifest";
import { readRuntimeSafeRangeManifest } from "../content/runtime-safe-range-manifest";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import { readRuntimeP0CurriculumManifest, type RuntimeP0TargetState } from "../content/runtime-p0-curriculum-manifest";
import {
  CORE120_ACTION_KINDS,
  readRuntimeCore120CurriculumManifest,
  type Core120Band,
  type Core120VisualDomain,
} from "../content/runtime-core120-curriculum-manifest";
import {
  DEFAULT_PLAYER_BODY,
  GameSessionRuntimeBridge,
  WORLD_TILE_SIZE_PX,
  type RuntimeInput,
  type RuntimeSnapshot,
} from "../runtime";
import { commitSessionProposal, proposeCapabilityMilestone } from "../session/adapters";
import { readVerifiedCapabilityMilestoneContract } from "../session/capability-contract";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
} from "../session/game-session";
import type { LivingSafetyZone, PointPx } from "../spells/cast-plan";
import type { CrossSaveTransactionCoordinator } from "./cross-save-transaction-coordinator";
import {
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_ARRIVAL_STREAM_SCENES,
  PROLOGUE_AREA_ID,
  PROLOGUE_OLD_MINE_RUNTIME_SCENE,
  PROLOGUE_OLD_MINE_SCENE_ID,
  PROLOGUE_SAFE_RANGE_RUNTIME_SCENE,
  PROLOGUE_STREAM_SCENE_ID,
  PrologueArrivalStreamSession,
  createPrologueArrivalStreamInitialSession,
  type PrologueActionResult,
  type PrologueArrivalStreamSnapshot,
} from "./prologue-arrival-stream";
import {
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PrologueSettlementSession,
  type PrologueSettlementSnapshot,
  type SettlementActionResult,
  type SettlementDialogueResult,
  type SettlementDialogueTopic,
  type SettlementTradeOpenResult,
  type SettlementVerifiedQuoteResult,
  type SettlementVerifiedSaleResult,
} from "./prologue-settlement";
import {
  PROLOGUE_SERVICE_CHANNEL_SCENE_ID,
  PROLOGUE_WATERWHEEL_SCENE_ID,
  PrologueWaterwheelSession,
  type InfrastructureActionResult,
  type InfrastructureLanguageActionResult,
  type PrologueWaterwheelEntryResult,
  type PrologueWaterwheelSettlementReturnResult,
  type PrologueWaterwheelSnapshot,
  type ServiceSolutionEvidence,
  type TawaGroundingAttempt,
  type WaterwheelSolutionEvidence,
} from "./prologue-waterwheel";
import type { WaterwheelPhysicalObservation } from "./infrastructure-predicates";
import {
  PROLOGUE_CISTERN_REGION_FLAGS,
  PROLOGUE_CISTERN_SCENE_ID,
  PrologueCisternSession,
  type PrologueCisternActionResult,
  type PrologueCisternConfirmOutcome,
  type PrologueCisternEntryResult,
  type PrologueCisternLearningResult,
  type PrologueCisternPreviewOutcome,
  type PrologueCisternSnapshot,
} from "./prologue-cistern";
import type { CisternDirectionId, CisternExpressionId } from "./cistern-demo";
import {
  PROLOGUE_RETURN_FLOW_SCENE_ID,
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
  PrologueReturnFlowSession,
  type PrologueReturnFlowActionResult,
  type PrologueReturnFlowEntryResult,
  type PrologueReturnFlowSettlementReturnResult,
  type PrologueReturnFlowSnapshot,
  type ReturnFlowWawaGroundingAttempt,
} from "./prologue-return-flow";
import type { ReturnFlowSolutionId, ReturnFlowWorldFacts } from "./return-flow-predicates";
import type {
  PrologueAttackQualificationResult,
  SettlementAttackQualificationSemanticActionId,
} from "./prologue-attack-qualification";
import type { PrologueP0LearningResult } from "./prologue-p0-learning";
import {
  core120LearningActionReceiptId,
  type PrologueCore120LearningResult,
} from "./prologue-core120-learning";
import type { P0LearningActionId } from "./p0-learning-contract";
import { p0TargetReached } from "./p0-learning-contract";
import { safeRangeInteractionPointPx } from "./safe-range-authority";
import {
  type Core120LearningActionId,
} from "../learning/core120-campaign";
import {
  PROLOGUE_SAFE_RANGE_SCENE_ID,
  PrologueSafeRangeSession,
  SafeRangeRuntimeWorld,
  type PrologueSafeRangeActionResult,
  type PrologueSafeRangeCompileRequest,
  type PrologueSafeRangeEntryResult,
  type PrologueSafeRangePreview,
  type PrologueSafeRangeReturnResult,
  type PrologueSafeRangeSnapshot,
  type PrologueSafeRangeReason,
} from "./prologue-safe-range";
import {
  PROLOGUE_WILDLIFE_REGION_FLAGS,
  PROLOGUE_WILDLIFE_SCENE_ID,
  PrologueWildlifeSession,
  type PrologueWildlifeActionResult,
  type PrologueWildlifeDeterrenceResult,
  type PrologueWildlifeEntryResult,
  type PrologueWildlifeHandoffResult,
  type PrologueWildlifeSnapshot,
} from "./prologue-wildlife";

export type PrologueFlowMode = "arrival_stream" | "settlement" | "infrastructure" | "cistern" |
  "wildlife" | "return_flow" | "safe_range" | "old_mine";
export type PrologueFlowActionReason = "delegated" | "wrong_mode" | "delegate_rejected";

export interface PrologueFlowSnapshot {
  readonly mode: PrologueFlowMode;
  readonly sessionId: string;
  readonly session: GameSessionState;
  readonly runtime: RuntimeSnapshot;
  readonly arrival: PrologueArrivalStreamSnapshot | null;
  readonly settlement: PrologueSettlementSnapshot | null;
  readonly infrastructure: PrologueWaterwheelSnapshot | null;
  readonly cistern: PrologueCisternSnapshot | null;
  readonly wildlife: PrologueWildlifeSnapshot | null;
  readonly returnFlow: PrologueReturnFlowSnapshot | null;
  readonly safeRange: PrologueSafeRangeSnapshot | null;
  readonly oldMine: PrologueOldMineSnapshot | null;
  readonly returnFlowProgress: Readonly<{
    selectedSolutionId: ReturnFlowSolutionId | null;
    completedActionIds: readonly string[];
  }> | null;
  readonly killCount: 0;
}

export interface PrologueOldMineSnapshot {
  readonly sceneId: typeof PROLOGUE_OLD_MINE_SCENE_ID;
  readonly chapterComplete: boolean;
  readonly peacefulExit: true;
  readonly returnToSettlementAvailable: true;
  readonly killCount: 0;
}

export interface PrologueOldMineActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: "committed" | "duplicate" | "prerequisite_missing" | "session_rejected";
  readonly snapshot: PrologueOldMineSnapshot | null;
}

export interface PrologueFlowOldMineView {
  readonly mode: PrologueFlowMode;
  readonly sceneId: string;
  readonly entryAvailable: boolean;
  readonly inOldMine: boolean;
  readonly chapterComplete: boolean;
  readonly peacefulExit: true;
  readonly returnToSettlementAvailable: boolean;
  readonly killCount: 0;
}

export interface PrologueFlowAction<T> {
  readonly accepted: boolean;
  readonly reason: PrologueFlowActionReason;
  readonly result: T | null;
  readonly snapshot: PrologueFlowSnapshot;
}

export interface PrologueReturnFlowSemanticActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: "committed" | "duplicate" | "transaction_conflict" | "unknown_action" | "prerequisite_missing";
  readonly actionId: string;
  readonly solutionId: ReturnFlowSolutionId | null;
  readonly snapshot: PrologueReturnFlowSnapshot;
}

/** A display-only quote. The trusted physics plan stays in the flow's in-memory registry. */
export interface PrologueFlowSafeRangePreview {
  readonly previewId: string;
  readonly targetClass: PrologueSafeRangePreview["targetClass"];
  readonly promptLevel: 0 | 1;
  readonly waterSource: PrologueSafeRangePreview["waterSource"];
  readonly quotedMp: 13 | 18;
  readonly canonicalAst: PrologueSafeRangePreview["canonicalAst"];
  readonly effect: PrologueSafeRangePreview["effect"];
}

export interface PrologueFlowSafeRangeCompileResult {
  readonly ok: boolean;
  readonly reason: PrologueSafeRangeReason | null;
  readonly preview: PrologueFlowSafeRangePreview | null;
  readonly snapshot: PrologueSafeRangeSnapshot;
}

/** Browser/UI projection. It deliberately excludes GameSession, receipts, flags, HP and physics results. */
export type PrologueFlowSafeRangeTargetView = Readonly<{
  materialClass: string;
  completed: boolean;
  inRange: boolean;
}>;

export interface PrologueFlowSafeRangeView {
  readonly mode: "settlement" | "safe_range" | "other";
  readonly sceneId: string;
  readonly currentMp: number;
  readonly maxMp: number;
  readonly qualificationActions: readonly Readonly<{
    actionId: string;
    taskFamilyId: string;
    evidenceType: string;
    promptLevel: 0 | 1 | null;
    unrelated: boolean;
    available: boolean;
    completed: boolean;
  }>[];
  readonly settlementActionsComplete: boolean;
  readonly qualificationGraphComplete: boolean;
  readonly attackCapacityCalibrated: boolean;
  readonly returnObservationComplete: boolean;
  readonly permissionGranted: boolean;
  readonly safeRange: Readonly<{
    permissionGranted: boolean;
    firstAttackSignatureAvailable: boolean;
    firstAttackSignatureCompleted: boolean;
    targets: Readonly<Record<keyof PrologueSafeRangeSnapshot["targets"], PrologueFlowSafeRangeTargetView>>;
  }> | null;
}

export interface PrologueFlowP0LearningView {
  readonly mode: "settlement" | "other";
  readonly station: Readonly<{ sceneId: string; targetId: string; interactionId: string; inRange: boolean }>;
  readonly externalAssets: Readonly<{
    pronunciationAudio: "blocked_pending_private_assets" | "approved";
    approvedGlyphRelease: "blocked_pending_private_approval" | "approved";
  }>;
  readonly words: readonly Readonly<{
    wordId: string;
    targetState: RuntimeP0TargetState;
    currentState: "unknown" | "discovered" | "attuned" | "grounded" | "produced" | "stabilized";
    targetReached: boolean;
    completedActionIds: readonly P0LearningActionId[];
    nextActionId: P0LearningActionId | null;
  }>[];
  readonly targetWordCount: 12;
  readonly reachedWordCount: number;
}

export interface PrologueFlowCore120LearningView {
  readonly mode: "settlement" | "other";
  readonly p0PrerequisiteComplete: boolean;
  readonly station: Readonly<{ sceneId: string; targetId: string; interactionId: string; inRange: boolean }>;
  readonly externalAssets: Readonly<{
    pronunciationAudio: "blocked_pending_private_assets" | "approved";
    glyphVisuals: "blocked_pending_private_approval" | "approved";
    glyphCatalog: "draft" | "approved";
    fullAssetAcceptance: boolean;
  }>;
  readonly words: readonly Readonly<{
    wordId: string;
    band: Core120Band;
    visualDomainId: Core120VisualDomain;
    currentState: "unknown" | "discovered" | "attuned" | "grounded" | "produced" | "stabilized";
    completedActionIds: readonly Core120LearningActionId[];
    nextActionId: Core120LearningActionId | null;
    audioReady: boolean;
    glyphReady: boolean;
  }>[];
  readonly totalWordCount: 120;
  readonly completedWordCount: number;
  readonly completedSemanticActionCount: number;
  readonly totalSemanticActionCount: 600;
}

export const PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX = "prologue.flow.settlement.entry";
export const PROLOGUE_FLOW_WATERWHEEL_ENTRY_TRANSACTION_PREFIX = "prologue.flow.waterwheel.entry";
export const PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX = "prologue.flow.cistern.entry";
export const PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX = "prologue.flow.cistern.capacity";
export const PROLOGUE_FLOW_WILDLIFE_ENTRY_TRANSACTION_PREFIX = "prologue.flow.wildlife.entry";
export const PROLOGUE_FLOW_RETURN_ENTRY_TRANSACTION_PREFIX = "prologue.flow.return.entry";
export const PROLOGUE_FLOW_SAFE_RANGE_ENTRY_TRANSACTION_PREFIX = "prologue.flow.safe-range.entry";
export const PROLOGUE_FLOW_OLD_MINE_ENTRY_TRANSACTION_PREFIX = "prologue.flow.old-mine.entry";

export interface PrologueFlowFreshOptions {
  readonly sessionId: string;
  readonly currentMp?: number;
  readonly maxMp?: number;
}

type ArrivalAcceptedResult = PrologueActionResult;
type SettlementAcceptedResult = SettlementActionResult | SettlementDialogueResult | SettlementVerifiedQuoteResult | SettlementVerifiedSaleResult;
type InfrastructureAcceptedResult = InfrastructureActionResult | InfrastructureLanguageActionResult;
type CisternAcceptedResult = PrologueCisternActionResult | PrologueCisternLearningResult;
type ReturnFlowAcceptedResult = PrologueReturnFlowActionResult;

const CISTERN_CAPACITY_CONTRACT = readVerifiedCapabilityMilestoneContract(
  generatedRuntimeArtifact.capabilityProgression,
  readRuntimeCisternTaskManifest(generatedRuntimeArtifact).capacityMilestoneRef,
);
const SAFE_RANGE_MANIFEST = readRuntimeSafeRangeManifest(generatedRuntimeArtifact);
const P0_CURRICULUM_MANIFEST = readRuntimeP0CurriculumManifest(generatedRuntimeArtifact);
const CORE120_CURRICULUM_MANIFEST = readRuntimeCore120CurriculumManifest(generatedRuntimeArtifact);
const SCENE_MANIFEST_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const OLD_MINE_MANIFEST = SCENE_MANIFEST_INDEX.byId[PROLOGUE_OLD_MINE_SCENE_ID];
const SETTLEMENT_RUNTIME_MANIFEST = SCENE_MANIFEST_INDEX.byId[PROLOGUE_SETTLEMENT_SCENE_ID];
if (!OLD_MINE_MANIFEST || !SETTLEMENT_RUNTIME_MANIFEST) throw new Error("old-mine and settlement runtime scenes are required");
const OLD_MINE_ENTRY = (() => {
  const entrance = OLD_MINE_MANIFEST.entrances.find((candidate) => candidate.id === "old_mine.from_settlement");
  if (!entrance) throw new Error("old-mine runtime entrance is required");
  return entrance;
})();
const SETTLEMENT_OLD_MINE_ENTRY = (() => {
  const entrance = SETTLEMENT_RUNTIME_MANIFEST.entrances.find((candidate) => candidate.id === "settlement.from_old_mine");
  if (!entrance) throw new Error("settlement old-mine return entrance is required");
  return entrance;
})();
const SAFE_RANGE_RUNTIME_SCENE = Object.freeze({
  ...PROLOGUE_SAFE_RANGE_RUNTIME_SCENE,
  exits: Object.freeze([]),
});
const isolatedRegionScenes = (replacement: typeof SAFE_RANGE_RUNTIME_SCENE) => Object.freeze(
  PROLOGUE_ARRIVAL_STREAM_SCENES.map((scene) => scene.id === replacement.id ? replacement : scene),
);
const PROLOGUE_REGION_SCENE_AREAS = Object.freeze(Object.fromEntries(
  PROLOGUE_ARRIVAL_STREAM_SCENES.map((scene) => [scene.id, PROLOGUE_AREA_ID]),
));
const PROLOGUE_REGION_ENTRANCES = Object.freeze(Object.fromEntries(
  PROLOGUE_ARRIVAL_STREAM_SCENES.map((scene) => {
    if (!scene.defaultEntranceId) throw new Error(`scene ${scene.id} requires a default runtime entrance`);
    return [scene.id, scene.defaultEntranceId] as const;
  }),
)) as Readonly<Record<string, string>>;
const createSafeRangeRuntimeBridge = (session: GameSession): GameSessionRuntimeBridge =>
  new GameSessionRuntimeBridge({
    session,
    scenes: isolatedRegionScenes(SAFE_RANGE_RUNTIME_SCENE),
    sceneAreas: PROLOGUE_REGION_SCENE_AREAS,
    entranceByScene: PROLOGUE_REGION_ENTRANCES,
    viewportPx: { x: 320, y: 128 },
    fixedHz: 60,
  });
const OLD_MINE_RUNTIME_SCENE = Object.freeze({ ...PROLOGUE_OLD_MINE_RUNTIME_SCENE, exits: Object.freeze([]) });
const createOldMineRuntimeBridge = (session: GameSession): GameSessionRuntimeBridge =>
  new GameSessionRuntimeBridge({
    session,
    scenes: isolatedRegionScenes(OLD_MINE_RUNTIME_SCENE),
    sceneAreas: PROLOGUE_REGION_SCENE_AREAS,
    entranceByScene: PROLOGUE_REGION_ENTRANCES,
    viewportPx: { x: 320, y: 160 },
    fixedHz: 60,
  });
const oldMineCompletionReceiptId = (sessionId: string): string => `world:${sessionId}:prologue-peaceful-exit`;

const arrivalScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_ARRIVAL_SCENE_ID || sceneId === PROLOGUE_STREAM_SCENE_ID;
const infrastructureScene = (sceneId: string): boolean =>
  sceneId === PROLOGUE_WATERWHEEL_SCENE_ID || sceneId === PROLOGUE_SERVICE_CHANNEL_SCENE_ID;
const regionTrue = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) =>
    flag.scope === "region" && flag.regionId === "valley_prologue" && flag.flagId === flagId && flag.value === true
  );
const globalTrue = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) => flag.scope === "global" && flag.flagId === flagId && flag.value === true);
const staticRuntimeSnapshot = (
  state: GameSessionState,
  sceneId: string,
  tick: number,
): RuntimeSnapshot => {
  const position = state.checkpoint.position;
  return Object.freeze({
    tick,
    sceneId,
    player: Object.freeze({ position: Object.freeze({ ...position }), velocity: Object.freeze({ x: 0, y: 0 }), grounded: false, body: DEFAULT_PLAYER_BODY }),
    camera: Object.freeze({ x: Math.max(0, position.x - 80), y: Math.max(0, position.y - 45), width: 160, height: 90 }),
    checkpoint: Object.freeze({ id: state.checkpoint.id, sceneId: state.checkpoint.sceneId, position: Object.freeze({ ...position }), tick }),
  });
};
const wildlifeRuntimeSnapshot = (
  state: GameSessionState,
  playerPosition: PointPx,
  tick: number,
): RuntimeSnapshot => {
  const runtime = staticRuntimeSnapshot(state, PROLOGUE_WILDLIFE_SCENE_ID, tick);
  return Object.freeze({ ...runtime,
    player: Object.freeze({ ...runtime.player, position: Object.freeze({ ...playerPosition }) }),
    camera: Object.freeze({ x: Math.max(0, playerPosition.x - 80), y: Math.max(0, playerPosition.y - 45), width: 160, height: 90 }),
  });
};
const returnFlowFacts = (solutionId: ReturnFlowSolutionId): ReturnFlowWorldFacts => ({
  settlementSupplyFlowInBand: true,
  wetMeadowFlowInBand: true,
  overflowContact: false,
  overflowGateSeated: solutionId === "return_flow.repair_overflow",
  overflowSealIntact: solutionId === "return_flow.repair_overflow",
  overflowConduitClear: solutionId === "return_flow.repair_overflow",
  mudMassBelowLimit: solutionId === "return_flow.clear_mud",
  channelGradeContinuous: solutionId === "return_flow.clear_mud",
  returnIntakeClear: solutionId === "return_flow.clear_mud",
  oldChannelConnected: solutionId === "return_flow.reuse_old_channel",
  oldChannelClear: solutionId === "return_flow.reuse_old_channel",
  oldChannelBankStable: solutionId === "return_flow.reuse_old_channel",
});

/** One persisted GameSession coordinating the playable N00 -> N07 prologue. */
export class PrologueFlowSession {
  private arrival: PrologueArrivalStreamSession | null;
  private settlement: PrologueSettlementSession | null;
  private infrastructure: PrologueWaterwheelSession | null;
  private cistern: PrologueCisternSession | null;
  private wildlife: PrologueWildlifeSession | null;
  private returnFlow: PrologueReturnFlowSession | null;
  private safeRange: PrologueSafeRangeSession | null;
  private safeRangeRuntimeWorld: SafeRangeRuntimeWorld | null;
  private safeRangeBridge: GameSessionRuntimeBridge | null;
  private oldMineBridge: GameSessionRuntimeBridge | null;
  private readonly safeRangePreviews = new Map<string, PrologueSafeRangePreview>();
  private returnFlowSelectedSolutionId: ReturnFlowSolutionId | null = null;
  private readonly returnFlowCompletedActionIds = new Set<string>();
  private readonly returnFlowOperationPayloads = new Map<string, string>();
  private wildlifePlayerPositionPx: PointPx | null;
  private wildlifeRuntimeTick = 0;
  private crossSaveCoordinator: CrossSaveTransactionCoordinator | null = null;

  private constructor(session: GameSession) {
    const sceneId = session.snapshot().world.currentSceneId;
    this.arrival = arrivalScene(sceneId) ? new PrologueArrivalStreamSession(session) : null;
    this.settlement = sceneId === PROLOGUE_SETTLEMENT_SCENE_ID ? new PrologueSettlementSession(session) : null;
    this.infrastructure = infrastructureScene(sceneId) ? new PrologueWaterwheelSession(session) : null;
    this.cistern = sceneId === PROLOGUE_CISTERN_SCENE_ID ? new PrologueCisternSession(session) : null;
    this.wildlife = sceneId === PROLOGUE_WILDLIFE_SCENE_ID ? new PrologueWildlifeSession(session) : null;
    this.returnFlow = sceneId === PROLOGUE_RETURN_FLOW_SCENE_ID ? new PrologueReturnFlowSession(session) : null;
    this.safeRangeBridge = sceneId === PROLOGUE_SAFE_RANGE_SCENE_ID ? createSafeRangeRuntimeBridge(session) : null;
    const safeRangePlayer = this.safeRangeBridge?.runtime.snapshot().player.position;
    this.safeRangeRuntimeWorld = safeRangePlayer
      ? new SafeRangeRuntimeWorld({ playerPositionPx: safeRangePlayer, actors: [] }) : null;
    this.safeRange = this.safeRangeRuntimeWorld
      ? PrologueSafeRangeSession.fromSave(session.toSave(), this.safeRangeRuntimeWorld)
      : null;
    this.oldMineBridge = sceneId === PROLOGUE_OLD_MINE_SCENE_ID ? createOldMineRuntimeBridge(session) : null;
    this.wildlifePlayerPositionPx = this.wildlife ? Object.freeze({ ...session.snapshot().checkpoint.position }) : null;
    if (!this.arrival && !this.settlement && !this.infrastructure && !this.cistern && !this.wildlife && !this.returnFlow && !this.safeRange && !this.oldMineBridge) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
  }

  static fresh(options: PrologueFlowFreshOptions): PrologueFlowSession {
    return new PrologueFlowSession(createPrologueArrivalStreamInitialSession(options));
  }

  static fromSave(candidate: unknown): PrologueFlowSession {
    const session = GameSession.fromSave(candidate);
    const flow = new PrologueFlowSession(session);
    const state = session.snapshot();
    if (state.world.currentSceneId === PROLOGUE_OLD_MINE_SCENE_ID &&
        !state.receiptIndex[oldMineCompletionReceiptId(session.sessionId)]) {
      throw new Error("old-mine load rejected: peaceful completion receipt is missing");
    }
    if (state.world.currentSceneId === PROLOGUE_SAFE_RANGE_SCENE_ID) {
      if (state.checkpoint.sceneId === PROLOGUE_SAFE_RANGE_SCENE_ID) return flow;
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_SAFE_RANGE_SCENE_ID
      ).length;
      const adoption = PrologueSafeRangeSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_SAFE_RANGE_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:${entryCount}`,
        new SafeRangeRuntimeWorld(),
      );
      if (!adoption.accepted || !adoption.safeRange) {
        throw new Error(`safe-range load reconciliation rejected: ${adoption.reason}`);
      }
      return new PrologueFlowSession(adoption.safeRange.session);
    }
    if (state.world.currentSceneId === PROLOGUE_RETURN_FLOW_SCENE_ID) {
      if (state.checkpoint.sceneId === PROLOGUE_RETURN_FLOW_SCENE_ID) return flow;
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_RETURN_FLOW_SCENE_ID
      ).length;
      const adoption = PrologueReturnFlowSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_RETURN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:${entryCount}`,
      );
      if (!adoption.accepted || !adoption.returnFlow) throw new Error(`return-flow load reconciliation rejected: ${adoption.reason}`);
      return new PrologueFlowSession(adoption.returnFlow.session);
    }
    if (state.world.currentSceneId === PROLOGUE_WILDLIFE_SCENE_ID) {
      if (regionTrue(state, PROLOGUE_WILDLIFE_REGION_FLAGS.denEntryCrossed) &&
          state.checkpoint.sceneId === PROLOGUE_WILDLIFE_SCENE_ID) return flow;
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_WILDLIFE_SCENE_ID
      ).length;
      const adoption = PrologueWildlifeSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_WILDLIFE_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:${entryCount}`,
      );
      if (!adoption.accepted || !adoption.wildlife) throw new Error(`wildlife load reconciliation rejected: ${adoption.reason}`);
      return new PrologueFlowSession(adoption.wildlife.session);
    }
    const entryCommitted = Object.values(state.world.flags).some((flag) =>
      flag.scope === "region" && flag.regionId === "valley_prologue" &&
      flag.flagId === PROLOGUE_CISTERN_REGION_FLAGS.entryCrossed && flag.value === true
    );
    const latestCisternEntry = [...session.events()].reverse().find((event) =>
      event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_CISTERN_SCENE_ID
    );
    const fromWildlife = state.world.currentSceneId === PROLOGUE_CISTERN_SCENE_ID &&
      state.checkpoint.sceneId === PROLOGUE_CISTERN_SCENE_ID &&
      latestCisternEntry?.eventId.endsWith(`${PROLOGUE_WILDLIFE_SCENE_ID}->${PROLOGUE_CISTERN_SCENE_ID}`) === true;
    if (state.world.currentSceneId !== PROLOGUE_CISTERN_SCENE_ID || entryCommitted || fromWildlife) return flow;

    const capableSession = flow.withCisternCapacity(session);
    const adoption = PrologueCisternSession.adoptRuntimeEntry(
      capableSession,
      `${PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
    );
    if (!adoption.accepted || !adoption.cistern) {
      throw new Error(`cistern load reconciliation rejected: ${adoption.reason}`);
    }
    return new PrologueFlowSession(adoption.cistern.session);
  }

  attachCrossSaveTransactionCoordinator(coordinator: CrossSaveTransactionCoordinator): void {
    coordinator.synchronizeOrdinarySession(this.session);
    this.crossSaveCoordinator = coordinator;
    if (this.settlement) this.settlement = new PrologueSettlementSession(coordinator.readSession(), coordinator);
    if (this.returnFlow) this.returnFlow = new PrologueReturnFlowSession(coordinator.readSession());
    if (this.safeRange) {
      this.safeRangeBridge = createSafeRangeRuntimeBridge(coordinator.readSession());
      this.safeRangeRuntimeWorld = new SafeRangeRuntimeWorld({
        playerPositionPx: this.safeRangeBridge.runtime.snapshot().player.position,
        actors: [],
      });
      this.safeRange = PrologueSafeRangeSession.fromSave(coordinator.toSessionSave(), this.safeRangeRuntimeWorld);
      this.safeRangePreviews.clear();
    }
    if (this.oldMineBridge) this.oldMineBridge = createOldMineRuntimeBridge(coordinator.readSession());
  }

  get session(): GameSession {
    const session = this.arrival?.session ?? this.settlement?.session ?? this.infrastructure?.session ??
      this.cistern?.session ?? this.wildlife?.session ?? this.returnFlow?.session ?? this.safeRange?.session ??
      this.oldMineBridge?.session;
    if (!session) throw new Error("prologue flow has no active session");
    return session;
  }

  toSave(): GameSessionSave {
    if (this.crossSaveCoordinator) {
      this.crossSaveCoordinator.synchronizeOrdinarySession(this.session);
      return this.crossSaveCoordinator.toSessionSave();
    }
    return this.session.toSave();
  }

  snapshot(): PrologueFlowSnapshot {
    if (this.arrival) {
      const arrival = this.arrival.snapshot();
      return Object.freeze({ mode: "arrival_stream", sessionId: this.session.sessionId, session: arrival.session, runtime: arrival.runtime,
        arrival, settlement: null, infrastructure: null, cistern: null, wildlife: null, returnFlow: null, safeRange: null, oldMine: null, returnFlowProgress: null, killCount: 0 });
    }
    if (this.settlement) {
      const settlement = this.settlement.snapshot();
      return Object.freeze({ mode: "settlement", sessionId: this.session.sessionId, session: settlement.session, runtime: settlement.runtime,
        arrival: null, settlement, infrastructure: null, cistern: null, wildlife: null, returnFlow: null, safeRange: null, oldMine: null, returnFlowProgress: null, killCount: 0 });
    }
    if (this.infrastructure) {
      const infrastructure = this.infrastructure.snapshot();
      return Object.freeze({ mode: "infrastructure", sessionId: this.session.sessionId, session: infrastructure.session, runtime: infrastructure.runtime,
        arrival: null, settlement: null, infrastructure, cistern: null, wildlife: null, returnFlow: null, safeRange: null, oldMine: null, returnFlowProgress: null, killCount: 0 });
    }
    if (this.cistern) {
      const cistern = this.cistern.snapshot();
      return Object.freeze({ mode: "cistern", sessionId: this.session.sessionId, session: cistern.session, runtime: cistern.runtime,
        arrival: null, settlement: null, infrastructure: null, cistern, wildlife: null, returnFlow: null, safeRange: null, oldMine: null, returnFlowProgress: null, killCount: 0 });
    }
    if (this.safeRange) {
      const safeRange = this.safeRange.snapshot();
      const state = this.safeRange.session.snapshot();
      return Object.freeze({ mode: "safe_range", sessionId: this.session.sessionId, session: state,
        runtime: this.safeRangeBridge?.runtime.snapshot() ?? staticRuntimeSnapshot(state, PROLOGUE_SAFE_RANGE_SCENE_ID, 0),
        arrival: null, settlement: null, infrastructure: null, cistern: null, wildlife: null, returnFlow: null,
        safeRange, oldMine: null, returnFlowProgress: null, killCount: 0 });
    }
    if (this.returnFlow) {
      const returnFlow = this.returnFlow.snapshot();
      const persistedSolution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.find((candidate) =>
        candidate.id === returnFlow.solutionId
      );
      const selectedSolutionId = persistedSolution?.id ?? this.returnFlowSelectedSolutionId;
      const completedActionIds = persistedSolution
        ? persistedSolution.requiredActions
        : selectedSolutionId === null
          ? []
          : PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.find((candidate) => candidate.id === selectedSolutionId)!
              .requiredActions.filter((actionId) => this.returnFlowCompletedActionIds.has(actionId));
      return Object.freeze({ mode: "return_flow", sessionId: this.session.sessionId, session: returnFlow.session,
        runtime: staticRuntimeSnapshot(returnFlow.session, PROLOGUE_RETURN_FLOW_SCENE_ID, 0),
        arrival: null, settlement: null, infrastructure: null, cistern: null, wildlife: null, returnFlow, safeRange: null,
        oldMine: null, returnFlowProgress: Object.freeze({ selectedSolutionId, completedActionIds: Object.freeze([...completedActionIds]) }), killCount: 0 });
    }
    if (this.oldMineBridge) {
      const state = this.oldMineBridge.session.snapshot();
      const sessionId = this.oldMineBridge.session.sessionId;
      const oldMine: PrologueOldMineSnapshot = Object.freeze({ sceneId: PROLOGUE_OLD_MINE_SCENE_ID,
        chapterComplete: state.receiptIndex[oldMineCompletionReceiptId(sessionId)] !== undefined,
        peacefulExit: true, returnToSettlementAvailable: true, killCount: 0 });
      return Object.freeze({ mode: "old_mine", sessionId, session: state,
        runtime: this.oldMineBridge.runtime.snapshot(), arrival: null, settlement: null, infrastructure: null,
        cistern: null, wildlife: null, returnFlow: null, safeRange: null, oldMine, returnFlowProgress: null, killCount: 0 });
    }
    const wildlife = this.wildlife!.snapshot();
    const playerPosition = this.wildlifePlayerPositionPx ?? wildlife.session.checkpoint.position;
    return Object.freeze({ mode: "wildlife", sessionId: this.session.sessionId, session: wildlife.session,
      runtime: wildlifeRuntimeSnapshot(wildlife.session, playerPosition, this.wildlifeRuntimeTick),
      arrival: null, settlement: null, infrastructure: null, cistern: null, wildlife, returnFlow: null, safeRange: null, oldMine: null, returnFlowProgress: null, killCount: 0 });
  }

  safeRangeView(): PrologueFlowSafeRangeView {
    const state = this.session.snapshot();
    const receipts = state.receiptIndex;
    const receiptIds = Object.keys(receipts);
    const settlementActions = [
      ...SAFE_RANGE_MANIFEST.parallelCalibration.actions.filter((action) =>
        action.authoritySceneId === SAFE_RANGE_MANIFEST.parallelCalibration.authoritySceneId &&
        !action.existingDomainEventMappingOnly),
      ...SAFE_RANGE_MANIFEST.parallelCalibration.unrelatedSemanticWorldActions,
    ];
    const grounded = (wordId: "telo" | "tawa"): boolean => {
      const rank = { discovered: 0, attuned: 1, grounded: 2, produced: 3, stabilized: 4 } as const;
      const learningState = state.learning.words[wordId]?.learningState;
      return learningState !== undefined && learningState !== null &&
        (rank[learningState] ?? -1) >= rank.grounded;
    };
    const qualificationActions = Object.freeze(settlementActions.map((action) => {
      const unrelated = action.actionId.startsWith("settlement.calibration.unrelated_");
      const completed = unrelated
        ? receipts[`attack-qualification-world:${action.actionId}`] !== undefined
        : receiptIds.some((receiptId) => receiptId.startsWith(
            `attack-qualification-evidence:attack-qualification:${this.session.sessionId}:${action.actionId}:`));
      const available = unrelated || action.actionId.startsWith("settlement.telo.")
        ? unrelated || grounded("telo")
        : action.actionId === "settlement.delayed_retrieval_h0"
          ? grounded("telo") && SAFE_RANGE_MANIFEST.parallelCalibration.unrelatedSemanticWorldActions.every(
              (required) => receipts[`attack-qualification-world:${required.actionId}`] !== undefined)
          : grounded("tawa");
      return Object.freeze({ actionId: action.actionId, taskFamilyId: action.taskFamilyId,
        evidenceType: unrelated ? "unrelated_world_action" : "evidenceType" in action ? action.evidenceType : "invalid",
        promptLevel: "promptLevel" in action ? action.promptLevel : null, unrelated, available, completed });
    }));
    const globalFlag = (flagId: string): boolean =>
      state.world.flags[`global:${flagId}`]?.scope === "global" &&
      state.world.flags[`global:${flagId}`]?.value === true;
    const safe = this.safeRange?.snapshot() ?? null;
    const safeRuntime = this.safeRangeBridge?.runtime.snapshot() ?? null;
    const safeTargets = safe === null ? null : Object.freeze(Object.fromEntries(
      Object.entries(safe.targets).map(([targetClass, target]) => {
        const point = safeRangeInteractionPointPx(targetClass as keyof PrologueSafeRangeSnapshot["targets"]);
        const inRange = safeRuntime !== null && point !== null &&
          Number.isFinite(safeRuntime.player.position.x) && Number.isFinite(safeRuntime.player.position.y) &&
          Math.hypot(
            safeRuntime.player.position.x - point.x,
            safeRuntime.player.position.y - point.y,
          ) <= WORLD_TILE_SIZE_PX;
        return [targetClass, Object.freeze({ ...target, inRange })];
      }),
    )) as Readonly<Record<keyof PrologueSafeRangeSnapshot["targets"], PrologueFlowSafeRangeTargetView>>;
    return Object.freeze({
      mode: this.settlement ? "settlement" : this.safeRange ? "safe_range" : "other",
      sceneId: state.world.currentSceneId,
      currentMp: state.mp.currentMp,
      maxMp: state.mp.maxMp,
      qualificationActions,
      settlementActionsComplete: qualificationActions.every((action) => action.completed),
      qualificationGraphComplete: SAFE_RANGE_MANIFEST.parallelCalibration.actions.every((action) =>
        receiptIds.some((receiptId) => receiptId.startsWith(action.existingDomainEventMappingOnly
          ? `attack-qualification-evidence-binding:${action.actionId}:`
          : `attack-qualification-evidence:attack-qualification:${this.session.sessionId}:${action.actionId}:`))),
      attackCapacityCalibrated: globalFlag("attack_capacity_calibration_complete"),
      returnObservationComplete: globalFlag("prologue_return_observed"),
      permissionGranted: globalFlag("range_trial_permission"),
      safeRange: safe === null ? null : Object.freeze({
        permissionGranted: safe.permissionGranted,
        firstAttackSignatureAvailable: safe.firstAttackSignatureAvailable,
        firstAttackSignatureCompleted: safe.firstAttackSignatureCompleted,
        targets: safeTargets!,
      }),
    });
  }

  oldMineView(): PrologueFlowOldMineView {
    const state = this.session.snapshot();
    const inOldMine = this.oldMineBridge !== null;
    return Object.freeze({
      mode: this.snapshot().mode,
      sceneId: state.world.currentSceneId,
      entryAvailable: this.settlement !== null && globalTrue(state, "prologue_return_observed"),
      inOldMine,
      chapterComplete: state.receiptIndex[oldMineCompletionReceiptId(this.session.sessionId)] !== undefined,
      peacefulExit: true,
      returnToSettlementAvailable: inOldMine,
      killCount: 0,
    });
  }

  p0LearningView(): PrologueFlowP0LearningView {
    const state = this.session.snapshot();
    const point = P0_CURRICULUM_MANIFEST.recoveryStation.interactionPointTiles;
    const runtime = this.snapshot().runtime;
    const inRange = this.settlement !== null && runtime.sceneId === P0_CURRICULUM_MANIFEST.recoveryStation.sceneId &&
      Number.isFinite(runtime.player.position.x) && Number.isFinite(runtime.player.position.y) &&
      Math.hypot(runtime.player.position.x - point[0] * 16, runtime.player.position.y - point[1] * 16) <= P0_CURRICULUM_MANIFEST.recoveryStation.maximumDistancePx;
    const words = Object.freeze(P0_CURRICULUM_MANIFEST.scope.wordIds.map((wordId) => {
      const authored = P0_CURRICULUM_MANIFEST.words[wordId];
      const progress = state.learning.words[wordId];
      const actions = (["discover", "attune", "context_0", "context_1", "repair"] as const)
        .map((kind) => `p0.${wordId}.${kind}` as P0LearningActionId);
      const completedActionIds = Object.freeze(actions.filter((actionId) =>
        state.receiptIndex[`learning:${this.session.sessionId}:p0-action:${actionId}`] !== undefined));
      const reached = p0TargetReached(authored.targetState, progress?.learningState ?? null, progress?.attunementState);
      const currentState = progress?.attunementState === "attuned" && (progress.learningState === null || progress.learningState === "discovered")
        ? "attuned" as const : progress?.learningState ?? "unknown";
      return Object.freeze({ wordId, targetState: authored.targetState, currentState, targetReached: reached,
        completedActionIds, nextActionId: actions.find((actionId) => !completedActionIds.includes(actionId)) ?? null });
    }));
    return Object.freeze({ mode: this.settlement ? "settlement" : "other",
      station: Object.freeze({ sceneId: P0_CURRICULUM_MANIFEST.recoveryStation.sceneId,
        targetId: P0_CURRICULUM_MANIFEST.recoveryStation.targetId,
        interactionId: P0_CURRICULUM_MANIFEST.recoveryStation.interactionId, inRange }),
      externalAssets: Object.freeze({ pronunciationAudio: runtimeP0AssetReadiness.pronunciationAudio,
        approvedGlyphRelease: runtimeP0AssetReadiness.approvedGlyphRelease }),
      words, targetWordCount: 12, reachedWordCount: words.filter((word) => word.targetReached).length });
  }

  core120LearningView(): PrologueFlowCore120LearningView {
    const state = this.session.snapshot();
    const runtime = this.snapshot().runtime;
    const point = CORE120_CURRICULUM_MANIFEST.recoveryStation.interactionPointTiles;
    const inRange = this.settlement !== null &&
      runtime.sceneId === CORE120_CURRICULUM_MANIFEST.recoveryStation.sceneId &&
      Number.isFinite(runtime.player.position.x) && Number.isFinite(runtime.player.position.y) &&
      Math.hypot(runtime.player.position.x - point[0] * 16,
        runtime.player.position.y - point[1] * 16) <=
        CORE120_CURRICULUM_MANIFEST.recoveryStation.maximumDistancePx;
    const p0PrerequisiteComplete = P0_CURRICULUM_MANIFEST.scope.wordIds.every((wordId) => {
      const progress = state.learning.words[wordId];
      return p0TargetReached(P0_CURRICULUM_MANIFEST.words[wordId].targetState,
        progress?.learningState ?? null, progress?.attunementState);
    });
    let completedSemanticActionCount = 0;
    const words = Object.freeze(CORE120_CURRICULUM_MANIFEST.scope.wordIds.map((wordId) => {
      const authored = CORE120_CURRICULUM_MANIFEST.words[wordId];
      const progress = state.learning.words[wordId];
      const actions = CORE120_ACTION_KINDS.map((kind) =>
        `core120.${wordId}.${kind}` as Core120LearningActionId);
      const completedActionIds = Object.freeze(actions.filter((actionId) =>
        state.receiptIndex[core120LearningActionReceiptId(this.session.sessionId, actionId)] !== undefined));
      completedSemanticActionCount += completedActionIds.length;
      const currentState = progress?.attunementState === "attuned" &&
        (progress.learningState === null || progress.learningState === "discovered")
        ? "attuned" as const : progress?.learningState ?? "unknown";
      const assets = runtimeCore120AssetReadiness.wordAssets[wordId];
      return Object.freeze({
        wordId,
        band: authored.curriculumBand,
        visualDomainId: authored.visualDomainId,
        currentState,
        completedActionIds,
        nextActionId: actions.find((actionId) => !completedActionIds.includes(actionId)) ?? null,
        audioReady: assets.audioReady,
        glyphReady: assets.glyphReady,
      });
    }));
    return Object.freeze({
      mode: this.settlement ? "settlement" as const : "other" as const,
      p0PrerequisiteComplete,
      station: Object.freeze({
        sceneId: CORE120_CURRICULUM_MANIFEST.recoveryStation.sceneId,
        targetId: CORE120_CURRICULUM_MANIFEST.recoveryStation.targetId,
        interactionId: CORE120_CURRICULUM_MANIFEST.recoveryStation.interactionId,
        inRange,
      }),
      externalAssets: Object.freeze({
        pronunciationAudio: runtimeCore120AssetReadiness.pronunciationAudio,
        glyphVisuals: runtimeCore120AssetReadiness.glyphVisuals,
        glyphCatalog: runtimeCore120AssetReadiness.glyphCatalog,
        fullAssetAcceptance: runtimeCore120AssetReadiness.playableContentMayClaimFullAssetAcceptance,
      }),
      words,
      totalWordCount: 120 as const,
      completedWordCount: words.filter((word) => word.nextActionId === null).length,
      completedSemanticActionCount,
      totalSemanticActionCount: 600 as const,
    });
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): PrologueFlowSnapshot {
    if (!Number.isSafeInteger(ticks) || ticks < 0) throw new RangeError("ticks must be a non-negative safe integer");
    for (let index = 0; index < ticks; index += 1) {
      if (this.arrival) this.arrival.advanceTicks(1, input);
      else if (this.settlement) this.settlement.advanceTicks(1, input);
      else if (this.infrastructure) this.infrastructure.advanceTicks(1, input);
      else if (this.cistern) this.cistern.advanceTicks(1, input);
      else if (this.safeRange && this.safeRangeRuntimeWorld && this.safeRangeBridge) {
        this.safeRangeBridge.advanceTicks(1, input);
        const runtime = this.safeRangeBridge.runtime.snapshot();
        this.safeRangeRuntimeWorld.synchronize(runtime.player.position, []);
      }
      else if (this.oldMineBridge) this.oldMineBridge.advanceTicks(1, input);
      else if (this.returnFlow) return this.snapshot();
      else return this.snapshot();
      this.reconcileMode();
    }
    return this.snapshot();
  }

  pushLooseStone(transactionId: string) { return this.delegateArrival((x) => x.pushLooseStone(transactionId)); }
  placeRottenLog(transactionId: string) { return this.delegateArrival((x) => x.placeRottenLog(transactionId)); }
  digSoftSoil(transactionId: string) { return this.delegateArrival((x) => x.digSoftSoil(transactionId)); }
  discoverTelo(occurrenceId: string) { return this.delegateArrival((x) => x.discoverTelo(occurrenceId)); }
  attuneTelo(attemptId: string, occurrenceId: string) {
    return this.delegateArrival((x) => x.attuneTelo(attemptId, occurrenceId));
  }
  manifestTelo(transactionId: string) { return this.delegateArrival((x) => x.manifestTelo(transactionId)); }
  damageCrossing(transactionId: string) { return this.delegateArrival((x) => x.damageCrossing(transactionId)); }
  repairCrossing(transactionId: string) { return this.delegateArrival((x) => x.repairCrossing(transactionId)); }

  talk(npcId: string, topic: SettlementDialogueTopic = "role") {
    return this.delegateSettlement((x) => x.talk(npcId, topic));
  }
  clarify(npcId: string, topic: SettlementDialogueTopic) {
    return this.delegateSettlement((x) => x.clarify(npcId, topic));
  }
  performAttackQualificationAction(
    operationId: string,
    actionId: SettlementAttackQualificationSemanticActionId,
  ): PrologueFlowAction<PrologueAttackQualificationResult> {
    return this.delegateSettlementQualification((settlement) =>
      settlement.commitAttackQualificationAction(actionId, operationId));
  }
  calibrateAttackCapacity(operationId: string): PrologueFlowAction<PrologueAttackQualificationResult> {
    return this.delegateSettlementQualification((settlement) => settlement.calibrateAttackCapacity(operationId));
  }
  grantRangeTrialPermission(operationId: string): PrologueFlowAction<PrologueAttackQualificationResult> {
    return this.delegateSettlementQualification((settlement) =>
      settlement.grantAttackRangeTrialPermission(operationId));
  }
  performP0LearningAction(operationId: string, actionId: P0LearningActionId): PrologueFlowAction<PrologueP0LearningResult> {
    return this.delegateSettlementQualification((settlement) => settlement.commitP0LearningAction(actionId, operationId));
  }
  performCore120LearningAction(
    operationId: string,
    actionId: Core120LearningActionId,
  ): PrologueFlowAction<PrologueCore120LearningResult> {
    return this.delegateSettlementQualification((settlement) =>
      settlement.commitCore120LearningAction(actionId, operationId));
  }
  usePublicRelief(transactionId: string) { return this.delegateSettlement((x) => x.usePublicRelief(transactionId)); }
  meditate(transactionId: string, answerAccepted: boolean) {
    return this.delegateSettlement((x) => x.meditate(transactionId, answerAccepted));
  }
  acceptSurveyJob(transactionId: string) { return this.delegateSettlement((x) => x.acceptSurveyJob(transactionId)); }
  inspectSurveyMarker(transactionId: string, markerId: string) {
    return this.delegateSettlement((x) => x.inspectSurveyMarkers(transactionId, markerId));
  }
  inspectSurveyMarkers(transactionId: string, markerId?: string) {
    return this.delegateSettlement((x) => x.inspectSurveyMarkers(transactionId, markerId));
  }
  submitSurveyJob(transactionId: string) { return this.delegateSettlement((x) => x.submitSurveyJob(transactionId)); }
  openTrade(transactionId: string): PrologueFlowAction<SettlementTradeOpenResult> {
    return this.delegateSettlement((x) => x.openTrade(transactionId));
  }
  acceptGiftedRabbitCarcass(transactionId: string): PrologueFlowAction<SettlementActionResult> {
    return this.delegateSettlement((x) => x.acceptGiftedRabbitCarcass(transactionId));
  }
  harvestGiftedMeat(operationId: string) { return this.delegateSettlement((x) => x.harvestGiftedMeat(operationId)); }
  startCooking(operationId: string) { return this.delegateSettlement((x) => x.startCooking(operationId)); }
  workCooking(operationId: string) { return this.delegateSettlement((x) => x.workCooking(operationId)); }
  completeCooking(operationId: string) { return this.delegateSettlement((x) => x.completeCooking(operationId)); }
  claimCooking(operationId: string) { return this.delegateSettlement((x) => x.claimCooking(operationId)); }
  consumeCooked(consumptionSequence: number) { return this.delegateSettlement((x) => x.consumeCooked(consumptionSequence)); }
  issueVerifiedSellQuote(request: Readonly<{ merchantId: string; lotId: string; quantity: number; operationId: string }>):
  PrologueFlowAction<SettlementVerifiedQuoteResult> {
    return this.delegateSettlement((x) => x.issueVerifiedSellQuote(request));
  }
  confirmVerifiedSellQuote(quoteId: string): PrologueFlowAction<SettlementVerifiedSaleResult> {
    return this.delegateSettlement((x) => x.confirmVerifiedSellQuote(quoteId));
  }

  enterSafeRange(transactionId: string): PrologueFlowAction<PrologueSafeRangeEntryResult> {
    if (!this.settlement) return this.rejectedMode();
    try {
      const runtimeWorld = new SafeRangeRuntimeWorld();
      const result = PrologueSafeRangeSession.enterFromSettlement(
        this.settlement.session,
        transactionId,
        runtimeWorld,
      );
      if (result.accepted && result.safeRange) {
        this.commitCrossSaveRegionExit(result.safeRange.session);
        this.arrival = null;
        this.settlement = null;
        this.infrastructure = null;
        this.cistern = null;
        this.wildlife = null;
        this.returnFlow = null;
        this.safeRangeBridge = createSafeRangeRuntimeBridge(result.safeRange.session);
        runtimeWorld.synchronize(this.safeRangeBridge.runtime.snapshot().player.position, []);
        this.safeRangeRuntimeWorld = runtimeWorld;
        this.safeRange = result.safeRange;
        this.safeRangePreviews.clear();
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  compileSafeRange(request: PrologueSafeRangeCompileRequest):
  PrologueFlowAction<PrologueFlowSafeRangeCompileResult> {
    if (!this.safeRange || !this.safeRangeRuntimeWorld) return this.rejectedMode();
    try {
      const result = this.safeRange.compile(request);
      if (!result.ok) {
        return this.delegated(Object.freeze({ ok: false, reason: result.reason, preview: null,
          snapshot: result.snapshot }), false);
      }
      const previewId = `safe-range-preview:${globalThis.crypto.randomUUID()}`;
      this.safeRangePreviews.set(previewId, result.preview);
      const preview: PrologueFlowSafeRangePreview = Object.freeze({
        previewId,
        targetClass: result.preview.targetClass,
        promptLevel: result.preview.promptLevel,
        waterSource: result.preview.waterSource,
        quotedMp: result.preview.quotedMp,
        canonicalAst: result.preview.canonicalAst,
        effect: result.preview.effect,
      });
      return this.delegated(Object.freeze({ ok: true, reason: null, preview,
        snapshot: result.snapshot }), true);
    } catch { return this.rejectedDelegate(); }
  }

  executeSafeRange(transactionId: string, previewId: string): PrologueFlowAction<PrologueSafeRangeActionResult> {
    if (!this.safeRange) return this.rejectedMode();
    const preview = this.safeRangePreviews.get(previewId);
    if (!preview) {
      const result: PrologueSafeRangeActionResult = Object.freeze({ accepted: false, duplicate: false,
        reason: "untrusted_preview", sessionReason: null, snapshot: this.safeRange.snapshot() });
      return this.delegated(result, false);
    }
    try {
      const result = this.safeRange.execute(transactionId, preview);
      if (result.accepted) this.safeRangePreviews.delete(previewId);
      if (result.accepted && this.safeRangeBridge) this.safeRangeBridge.adoptSession(this.safeRange.session);
      if (result.accepted && this.crossSaveCoordinator) {
        this.crossSaveCoordinator.synchronizeOrdinarySession(this.safeRange.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  inspectSafeRangeMaterialTable(transactionId: string): PrologueFlowAction<PrologueSafeRangeActionResult> {
    if (!this.safeRange || !this.safeRangeRuntimeWorld) return this.rejectedMode();
    try {
      const result = this.safeRange.inspectMaterialTable(transactionId);
      if (result.accepted && this.safeRangeBridge) this.safeRangeBridge.adoptSession(this.safeRange.session);
      if (result.accepted && this.crossSaveCoordinator) {
        this.crossSaveCoordinator.synchronizeOrdinarySession(this.safeRange.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  safeRangeToSettlement(transactionId: string): PrologueFlowAction<PrologueSafeRangeReturnResult> {
    if (!this.safeRange) return this.rejectedMode();
    try {
      const result = this.safeRange.returnToSettlement(transactionId);
      if (result.accepted && result.session) {
        this.commitCrossSaveRegionExit(result.session);
        this.safeRange = null;
        this.safeRangeRuntimeWorld = null;
        this.safeRangeBridge = null;
        this.safeRangePreviews.clear();
        this.settlement = new PrologueSettlementSession(result.session, this.crossSaveCoordinator);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  enterOldMine(transactionId: string): PrologueFlowAction<PrologueOldMineActionResult> {
    if (!this.settlement) return this.rejectedMode();
    const id = transactionId.trim();
    if (!id) return this.rejectedDelegate();
    const session = this.settlement.session;
    const state = session.snapshot();
    if (!globalTrue(state, "prologue_return_observed")) {
      return this.delegated(Object.freeze({ accepted: false, duplicate: false,
        reason: "prerequisite_missing", snapshot: null }), false);
    }
    const entryReceiptId = `world:${session.sessionId}:old-mine-entry:${id}`;
    if (state.receiptIndex[entryReceiptId]) {
      return this.delegated(Object.freeze({ accepted: true, duplicate: true,
        reason: "duplicate", snapshot: null }), true);
    }
    const drafts: Parameters<typeof commitSessionProposal>[1]["drafts"][number][] = [{
      eventId: `session.old-mine.enter.${id}`,
      type: "scene_entered",
      payload: { sceneId: PROLOGUE_OLD_MINE_SCENE_ID },
    }, {
      eventId: `session.old-mine.checkpoint.${id}`,
      type: "checkpoint_set",
      payload: { checkpoint: { id: "checkpoint.valley.old-mine.entry", sceneId: PROLOGUE_OLD_MINE_SCENE_ID,
        position: { ...OLD_MINE_ENTRY.spawnPx }, revision: state.checkpoint.revision + 1 } },
    }];
    if (!state.quests.ch01_world_literacy_prologue_exit) drafts.push({
      eventId: `session.old-mine.quest.${id}`,
      type: "quest_stage_set",
      payload: { questId: "ch01_world_literacy_prologue_exit", stageId: "peaceful_exit_reached", stageOrdinal: 1 },
    });
    const completionReceiptId = oldMineCompletionReceiptId(session.sessionId);
    if (!state.receiptIndex[completionReceiptId]) drafts.push({
      eventId: `session.old-mine.completion.${id}`,
      type: "receipt_recorded",
      payload: { receiptId: completionReceiptId, domain: "world", payloadHash: "prologue-peaceful-exit:v1" },
    });
    drafts.push({ eventId: `session.old-mine.entry-receipt.${id}`, type: "receipt_recorded",
      payload: { receiptId: entryReceiptId, domain: "world", payloadHash: `old-mine-entry:${id}` } });
    const committed = commitSessionProposal(session, { transactionId: id, drafts });
    if (!committed.committed) return this.delegated(Object.freeze({ accepted: false, duplicate: false,
      reason: "session_rejected", snapshot: null }), false);
    this.commitCrossSaveRegionExit(committed.session);
    this.arrival = null; this.settlement = null; this.infrastructure = null; this.cistern = null;
    this.wildlife = null; this.returnFlow = null; this.safeRange = null; this.safeRangeRuntimeWorld = null;
    this.safeRangeBridge = null; this.safeRangePreviews.clear();
    this.oldMineBridge = createOldMineRuntimeBridge(committed.session);
    return this.delegated(Object.freeze({ accepted: true, duplicate: false,
      reason: "committed", snapshot: this.snapshot().oldMine }), true);
  }

  returnOldMineToSettlement(transactionId: string): PrologueFlowAction<PrologueOldMineActionResult> {
    if (!this.oldMineBridge) return this.rejectedMode();
    const id = transactionId.trim();
    if (!id) return this.rejectedDelegate();
    const session = this.oldMineBridge.session;
    const state = session.snapshot();
    const receiptId = `world:${session.sessionId}:old-mine-return:${id}`;
    if (state.receiptIndex[receiptId]) return this.delegated(Object.freeze({ accepted: true, duplicate: true,
      reason: "duplicate", snapshot: this.snapshot().oldMine }), true);
    const committed = commitSessionProposal(session, { transactionId: id, drafts: [{
      eventId: `session.old-mine.return.${id}`,
      type: "scene_entered",
      payload: { sceneId: PROLOGUE_SETTLEMENT_SCENE_ID },
    }, {
      eventId: `session.old-mine.return-checkpoint.${id}`,
      type: "checkpoint_set",
      payload: { checkpoint: { id: "checkpoint.valley.settlement.from-old-mine", sceneId: PROLOGUE_SETTLEMENT_SCENE_ID,
        position: { ...SETTLEMENT_OLD_MINE_ENTRY.spawnPx }, revision: state.checkpoint.revision + 1 } },
    }, {
      eventId: `session.old-mine.return-receipt.${id}`,
      type: "receipt_recorded",
      payload: { receiptId, domain: "world", payloadHash: `old-mine-return:${id}` },
    }] });
    if (!committed.committed) return this.delegated(Object.freeze({ accepted: false, duplicate: false,
      reason: "session_rejected", snapshot: this.snapshot().oldMine }), false);
    this.commitCrossSaveRegionExit(committed.session);
    this.oldMineBridge = null;
    this.settlement = new PrologueSettlementSession(committed.session, this.crossSaveCoordinator);
    return this.delegated(Object.freeze({ accepted: true, duplicate: false,
      reason: "committed", snapshot: null }), true);
  }

  enterWaterwheel(transactionId: string): PrologueFlowAction<PrologueWaterwheelEntryResult> {
    if (!this.settlement) return this.rejectedMode();
    try {
      const result = PrologueWaterwheelSession.enterFromSettlement(this.settlement.session, transactionId);
      if (result.accepted && result.infrastructure) {
        this.commitCrossSaveRegionExit(result.infrastructure.session);
        this.arrival = null;
        this.settlement = null;
        this.infrastructure = result.infrastructure;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  observeWaterwheelPhysics(transactionId: string, observation: WaterwheelPhysicalObservation) {
    return this.delegateInfrastructure((x) => x.observeWaterwheelPhysics(transactionId, observation));
  }
  completeWaterwheelSolution(transactionId: string, solutionId: string, evidence: WaterwheelSolutionEvidence) {
    return this.delegateInfrastructure((x) => x.completeWaterwheelSolution(transactionId, solutionId, evidence));
  }
  enterServiceChannel(transactionId: string) {
    return this.delegateInfrastructure((x) => x.enterServiceChannel(transactionId));
  }
  returnToWaterwheel(transactionId: string) {
    return this.delegateInfrastructure((x) => x.returnToWaterwheel(transactionId));
  }
  returnToSettlement(transactionId: string): PrologueFlowAction<PrologueWaterwheelSettlementReturnResult> {
    if (!this.infrastructure) return this.rejectedMode();
    try {
      const result = this.infrastructure.returnToSettlement(transactionId);
      if (result.accepted && result.session) {
        this.arrival = null;
        this.infrastructure = null;
        this.settlement = new PrologueSettlementSession(result.session, this.crossSaveCoordinator);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  completeServiceSolution(transactionId: string, solutionId: string, evidence: ServiceSolutionEvidence) {
    return this.delegateInfrastructure((x) => x.completeServiceSolution(transactionId, solutionId, evidence));
  }
  discoverTawa(transactionId: string) { return this.delegateInfrastructure((x) => x.discoverTawa(transactionId)); }
  attuneTawa(transactionId: string) { return this.delegateInfrastructure((x) => x.attuneTawa(transactionId)); }
  groundTawa(transactionId: string, attempt: TawaGroundingAttempt) {
    return this.delegateInfrastructure((x) => x.groundTawa(transactionId, attempt));
  }
  readGrammarOSign(transactionId: string) {
    return this.delegateInfrastructure((x) => x.readGrammarOSign(transactionId));
  }
  acceptGrammarOReceptivePrompt(transactionId: string, answerAccepted: boolean) {
    return this.delegateInfrastructure((x) => x.acceptGrammarOReceptivePrompt(transactionId, answerAccepted));
  }
  recoverInfrastructureSoftLock(transactionId: string) {
    return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
  }

  enterWildlife(
    transactionId: string,
    source: "service" | "cistern",
  ): PrologueFlowAction<PrologueWildlifeEntryResult> {
    if (source === "service") {
      if (!this.infrastructure || this.infrastructure.snapshot().mode !== "service_channel") return this.rejectedMode();
      try {
        const result = PrologueWildlifeSession.enterFromService(this.infrastructure.session, transactionId);
        if (result.accepted && result.wildlife) this.activateWildlife(result.wildlife);
        return this.delegated(result, result.accepted);
      } catch { return this.rejectedDelegate(); }
    }
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = PrologueWildlifeSession.enterFromCistern(this.cistern.session, transactionId);
      if (result.accepted && result.wildlife) this.activateWildlife(result.wildlife);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  observeWildlife(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    const warningCenter = this.boundsCenter(snapshot.spatialBinding.warningBoundsTiles);
    return this.advanceWildlifeSemantic(operationId, "observe", 44, warningCenter, snapshot.foxPositionTiles, false);
  }

  retreatWildlife(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    return this.advanceWildlifeSemantic(operationId, "retreat", 1, this.outsideWarningPoint(snapshot), snapshot.foxPositionTiles, true);
  }

  waitForWildlifeExit(operationId: string): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const snapshot = this.wildlife.snapshot();
    const exit = this.boundsCenter(snapshot.spatialBinding.escapeBoundsTiles);
    const ticks = Math.max(1, Math.ceil(Math.hypot(snapshot.foxPositionTiles.x - exit.x, snapshot.foxPositionTiles.y - exit.y) / 0.25));
    return this.advanceWildlifeSemantic(operationId, "wait_exit", ticks, this.outsideWarningPoint(snapshot), exit, true);
  }

  makeWildlifeNoise(transactionId: string): PrologueFlowAction<PrologueWildlifeDeterrenceResult> {
    const point = this.wildlife?.snapshot().interactionPoints.noise;
    const positioned = point && this.positionWildlifePlayer(point, false);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.makeLowForceNoise(transactionId));
  }

  useWildlifeStaff(transactionId: string): PrologueFlowAction<PrologueWildlifeDeterrenceResult> {
    const point = this.wildlife?.snapshot().interactionPoints.staff;
    const positioned = point && this.positionWildlifePlayer(point, true);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.useWoodStaff(transactionId));
  }

  openWildlifeLatch(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    const point = this.wildlife?.snapshot().interactionPoints.latch;
    const positioned = point && this.positionWildlifePlayer(point, false);
    if (!positioned?.accepted) return this.rejectedMode();
    return this.delegateWildlife((x) => x.openOldServiceLatch(transactionId));
  }

  markWildlifeDigLine(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.inspectAndMarkUpperLine(transactionId));
  }

  digWildlifeUpperBypass(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.digUpperBypass(transactionId));
  }

  installWildlifeBraces(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.positionWildlifeForDig()) return this.rejectedMode();
    return this.delegateWildlife((x) => x.installUpperBypassBraces(transactionId));
  }

  completeWildlifeRoute(
    transactionId: string,
    solutionId: "den.wait_and_observe" | "den.dig_upper_bypass" | "den.low_force_noise" | "den.low_force_staff",
  ): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.wildlife) return this.rejectedMode();
    if (solutionId === "den.wait_and_observe") return this.delegateWildlife((x) => x.completeWaitAndObserve(transactionId));
    if (solutionId === "den.dig_upper_bypass") return this.delegateWildlife((x) => x.completeDigUpperBypass(transactionId));
    if (solutionId === "den.low_force_noise") return this.delegateWildlife((x) => x.completeLowForceNoise(transactionId));
    return this.delegateWildlife((x) => x.completeLowForceStaff(transactionId));
  }

  returnWildlifeToService(transactionId: string): PrologueFlowAction<PrologueWildlifeHandoffResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = this.wildlife.returnToService(transactionId);
      if (result.accepted && result.session) {
        this.wildlife = null;
        this.wildlifePlayerPositionPx = null;
        this.wildlifeRuntimeTick = 0;
        this.infrastructure = new PrologueWaterwheelSession(result.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  handoffWildlifeToCistern(transactionId: string): PrologueFlowAction<PrologueWildlifeHandoffResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = this.wildlife.handoffToHighCistern(transactionId);
      if (result.accepted && result.session) {
        const capableSession = this.withCisternCapacity(result.session);
        this.wildlife = null;
        this.wildlifePlayerPositionPx = null;
        this.wildlifeRuntimeTick = 0;
        this.cistern = new PrologueCisternSession(capableSession);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  recoverWildlifeSoftLock(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    return this.resetWildlife((x) => x.recoverSoftLock(transactionId));
  }

  resetWildlifeCheckpoint(transactionId: string): PrologueFlowAction<PrologueWildlifeActionResult> {
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  private advanceWildlifeSemantic(
    operationId: string,
    actionId: "observe" | "retreat" | "wait_exit",
    ticks: number,
    playerPositionTiles: Readonly<{ x: number; y: number }>,
    foxPositionTiles: Readonly<{ x: number; y: number }>,
    playerRetreating: boolean,
  ): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const semantic = this.wildlife.recordSemanticAction(operationId, actionId);
      if (!semantic.accepted) return this.delegated(this.wildlife.snapshot(), false);
      if (semantic.duplicate) return this.delegated(this.wildlife.snapshot(), true);
      const result = this.wildlife.advanceTicks(ticks, {
        playerPositionTiles,
        foxPositionTiles,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: playerPositionTiles.x * WORLD_TILE_SIZE_PX, y: playerPositionTiles.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += ticks;
      return this.delegated(result, true);
    } catch { return this.rejectedDelegate(); }
  }

  private positionWildlifePlayer(
    point: Readonly<{ x: number; y: number }>,
    playerRetreating: boolean,
  ): PrologueFlowAction<PrologueWildlifeSnapshot> {
    if (!this.wildlife) return this.rejectedMode();
    const fox = this.wildlife.snapshot().foxPositionTiles;
    try {
      const result = this.wildlife.advanceTicks(1, {
        playerPositionTiles: point,
        foxPositionTiles: fox,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: point.x * WORLD_TILE_SIZE_PX, y: point.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += 1;
      return this.delegated(result, true);
    } catch { return this.rejectedDelegate(); }
  }

  private boundsCenter(bounds: Readonly<{ x: number; y: number; width: number; height: number }>) {
    return Object.freeze({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  }

  private outsideWarningPoint(snapshot: PrologueWildlifeSnapshot) {
    const bounds = snapshot.spatialBinding.warningBoundsTiles;
    return Object.freeze({ x: Math.max(0, bounds.x - 1), y: bounds.y + bounds.height / 2 });
  }

  private positionWildlifeForDig(): boolean {
    if (!this.wildlife) return false;
    const snapshot = this.wildlife.snapshot();
    const den = snapshot.spatialBinding.denBoundsTiles;
    const foxClear = Object.freeze({ x: den.x + den.width + 1, y: snapshot.foxPositionTiles.y });
    const ticks = Math.max(1, Math.ceil(Math.hypot(snapshot.foxPositionTiles.x - foxClear.x, snapshot.foxPositionTiles.y - foxClear.y) / 0.25));
    try {
      this.wildlife.advanceTicks(ticks, {
        playerPositionTiles: snapshot.interactionPoints.dig,
        foxPositionTiles: foxClear,
        playerProfile: { id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 },
        world: { playerRetreating: false, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false },
      });
      this.wildlifePlayerPositionPx = Object.freeze({ x: snapshot.interactionPoints.dig.x * WORLD_TILE_SIZE_PX, y: snapshot.interactionPoints.dig.y * WORLD_TILE_SIZE_PX });
      this.wildlifeRuntimeTick += ticks;
      return true;
    } catch { return false; }
  }

  enterCistern(transactionId: string): PrologueFlowAction<PrologueCisternEntryResult> {
    if (!this.infrastructure) return this.rejectedMode();
    const infrastructure = this.infrastructure.snapshot();
    if (infrastructure.mode !== "service_channel" || !infrastructure.serviceChannel.cisternReady) {
      return this.rejectedDelegate();
    }
    try {
      const session = this.withCisternCapacity(this.infrastructure.session);
      const result = PrologueCisternSession.enterFromServiceChannel(session, transactionId);
      if (result.accepted && result.cistern) {
        this.arrival = null;
        this.settlement = null;
        this.infrastructure = null;
        this.cistern = result.cistern;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  enterReturnFlow(transactionId: string): PrologueFlowAction<PrologueReturnFlowEntryResult> {
    if (!this.cistern || !this.cistern.snapshot().completed || !this.cistern.snapshot().returnChannelAvailable) {
      return this.rejectedMode();
    }
    try {
      const result = PrologueReturnFlowSession.enterFromCistern(this.cistern.session, transactionId);
      if (result.accepted && result.returnFlow) {
        this.commitCrossSaveRegionExit(result.returnFlow.session);
        this.cistern = null;
        this.returnFlow = result.returnFlow;
        this.clearReturnFlowProgress();
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  performReturnFlowAction(operationId: string, actionId: string): PrologueFlowAction<PrologueReturnFlowSemanticActionResult> {
    if (!this.returnFlow) return this.rejectedMode();
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.find((candidate) => candidate.requiredActions.includes(actionId));
    if (!solution) return this.delegated(this.returnFlowSemanticResult(false, false, "unknown_action", actionId, null), false);
    const payloadHash = `return-flow-action:${solution.id}:${actionId}`;
    const priorPayload = this.returnFlowOperationPayloads.get(operationId);
    if (priorPayload !== undefined) {
      const duplicate = priorPayload === payloadHash;
      return this.delegated(this.returnFlowSemanticResult(duplicate, duplicate,
        duplicate ? "duplicate" : "transaction_conflict", actionId, solution.id), duplicate);
    }
    if (this.returnFlowSelectedSolutionId !== null && this.returnFlowSelectedSolutionId !== solution.id) {
      return this.delegated(this.returnFlowSemanticResult(false, false, "transaction_conflict", actionId, solution.id), false);
    }
    const expectedAction = solution.requiredActions[this.returnFlowCompletedActionIds.size];
    if (this.returnFlowCompletedActionIds.has(actionId)) {
      this.returnFlowOperationPayloads.set(operationId, payloadHash);
      return this.delegated(this.returnFlowSemanticResult(true, true, "duplicate", actionId, solution.id), true);
    }
    if (actionId !== expectedAction) {
      return this.delegated(this.returnFlowSemanticResult(false, false, "prerequisite_missing", actionId, solution.id), false);
    }
    this.returnFlowSelectedSolutionId = solution.id;
    this.returnFlowCompletedActionIds.add(actionId);
    this.returnFlowOperationPayloads.set(operationId, payloadHash);
    return this.delegated(this.returnFlowSemanticResult(true, false, "committed", actionId, solution.id), true);
  }
  completeReturnFlowSolution(transactionId: string, solutionId: string): PrologueFlowAction<PrologueReturnFlowActionResult> {
    if (!this.returnFlow) return this.rejectedMode();
    const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS.find((candidate) => candidate.id === solutionId);
    if (!solution) return this.delegateReturnFlow((x) => x.completeSolution(transactionId, solutionId, {
      completedActionIds: [], world: returnFlowFacts("return_flow.repair_overflow"),
    }));
    const completedActionIds = this.returnFlowSelectedSolutionId === solution.id
      ? solution.requiredActions.filter((actionId) => this.returnFlowCompletedActionIds.has(actionId))
      : [];
    return this.delegateReturnFlow((x) => x.completeSolution(transactionId, solution.id, {
      completedActionIds,
      world: returnFlowFacts(solution.id),
    }));
  }

  discoverReturnFlowWawa(transactionId: string) { return this.delegateReturnFlow((x) => x.discoverWawa(transactionId)); }
  attuneReturnFlowWawa(transactionId: string) { return this.delegateReturnFlow((x) => x.attuneWawa(transactionId)); }
  groundReturnFlowWawa(transactionId: string, attempt: ReturnFlowWawaGroundingAttempt) {
    return this.delegateReturnFlow((x) => x.groundWawa(transactionId, attempt));
  }

  returnFlowToSettlement(transactionId: string): PrologueFlowAction<PrologueReturnFlowSettlementReturnResult> {
    if (!this.returnFlow) return this.rejectedMode();
    try {
      const result = this.returnFlow.returnToSettlement(transactionId);
      if (result.accepted && result.session) {
        this.commitCrossSaveRegionExit(result.session);
        this.returnFlow = null;
        this.settlement = new PrologueSettlementSession(result.session, this.crossSaveCoordinator);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  setCisternExpression(expression: CisternExpressionId) {
    return this.delegateCisternSnapshot((x) => x.setExpression(expression));
  }
  setCisternDirection(direction: CisternDirectionId) {
    return this.delegateCisternSnapshot((x) => x.setDirection(direction));
  }
  targetCisternCurrentReceiver() {
    return this.delegateCisternSnapshot((x) => x.targetCurrentReceiver());
  }
  setCisternTargetAnchorPx(anchorPx: PointPx) {
    return this.delegateCisternSnapshot((x) => x.setTargetAnchorPx(anchorPx));
  }
  previewCisternCast(livingSafetyZones: readonly LivingSafetyZone[] = []): PrologueFlowAction<PrologueCisternPreviewOutcome> {
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = this.cistern.beginPreview(livingSafetyZones);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  confirmCisternCast(transactionId: string, livingSafetyZones: readonly LivingSafetyZone[] = []): PrologueFlowAction<PrologueCisternConfirmOutcome> {
    if (!this.cistern) return this.rejectedMode();
    try {
      const result = this.cistern.confirmPending(transactionId, livingSafetyZones);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  cancelCisternCast() { return this.delegateCisternSnapshot((x) => x.cancelPending()); }
  completeCisternFamilyWithTools(transactionId: string, familyId: string) {
    return this.delegateCistern((x) => x.completeFamilyWithTools(transactionId, familyId));
  }
  discoverCisternLengthWord(transactionId: string, wordId: "lili" | "suli") {
    return this.delegateCistern((x) => x.discoverLengthWord(transactionId, wordId));
  }
  attuneCisternLengthWord(transactionId: string, wordId: "lili" | "suli") {
    return this.delegateCistern((x) => x.attuneLengthWord(transactionId, wordId));
  }
  applyCisternNaturalRecovery(transactionId: string, ticks: number) {
    return this.delegateCistern((x) => x.applyNaturalRecovery(transactionId, ticks));
  }
  meditateCistern(transactionId: string, answerAccepted: boolean, evidenceEligible: boolean) {
    return this.delegateCistern((x) => x.meditate(transactionId, answerAccepted, evidenceEligible));
  }
  recoverCisternAtCheckpoint(transactionId: string) {
    return this.delegateCistern((x) => x.recoverAtCheckpoint(transactionId));
  }
  recoverCisternSoftLock(transactionId: string) {
    return this.delegateCistern((x) => x.recoverSoftLock(transactionId));
  }
  resetSafeRangeCheckpoint(transactionId: string) {
    return this.resetSafeRange((x) => x.resetToCheckpoint(transactionId));
  }
  recoverSafeRangeSoftLock(transactionId: string) {
    return this.resetSafeRange((x) => x.recoverSoftLock(transactionId));
  }

  setCheckpoint(transactionId: string, checkpointId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.setCheckpoint(transactionId, checkpointId));
    if (this.settlement) return this.delegateSettlement((x) => x.setCheckpoint(transactionId, checkpointId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.setCheckpoint(
      transactionId,
      checkpointId,
      this.snapshot().runtime.player.position,
    ));
    return this.rejectedDelegate();
  }

  resetToCheckpoint(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult |
    PrologueWildlifeActionResult | PrologueReturnFlowActionResult | PrologueSafeRangeActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetToCheckpoint(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetToCheckpoint(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.resetToCheckpoint(transactionId));
    if (this.cistern) return this.delegateCistern((x) => x.resetToCheckpoint(transactionId));
    if (this.returnFlow) return this.resetReturnFlow((x) => x.resetToCheckpoint(transactionId));
    if (this.safeRange) return this.resetSafeRange((x) => x.resetToCheckpoint(transactionId));
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  resetArea(transactionId: string): PrologueFlowAction<
    PrologueArrivalStreamSnapshot | SettlementActionResult | InfrastructureActionResult | PrologueCisternActionResult |
    PrologueWildlifeActionResult | PrologueReturnFlowActionResult | PrologueSafeRangeActionResult
  > {
    if (this.arrival) return this.delegateArrivalSnapshot((x) => x.resetArea(transactionId));
    if (this.settlement) return this.delegateSettlement((x) => x.resetArea(transactionId));
    if (this.infrastructure) return this.delegateInfrastructure((x) => x.recoverSoftLock(transactionId));
    if (this.cistern) return this.delegateCistern((x) => x.recoverSoftLock(transactionId));
    if (this.returnFlow) return this.resetReturnFlow((x) => x.recoverSoftLock(transactionId));
    if (this.safeRange) return this.resetSafeRange((x) => x.recoverSoftLock(transactionId));
    return this.resetWildlife((x) => x.resetToCheckpoint(transactionId));
  }

  private delegateArrival<T extends ArrivalAcceptedResult>(action: (x: PrologueArrivalStreamSession) => T) {
    if (!this.arrival) return this.rejectedMode<T>();
    try { const result = action(this.arrival); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateArrivalSnapshot<T extends PrologueArrivalStreamSnapshot>(
    action: (x: PrologueArrivalStreamSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.arrival) return this.rejectedMode();
    try { const result = action(this.arrival); this.reconcileMode(); return this.delegated(result, true); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateSettlement<T extends SettlementAcceptedResult>(action: (x: PrologueSettlementSession) => T) {
    if (!this.settlement) return this.rejectedMode<T>();
    try { const result = action(this.settlement); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateSettlementQualification<T extends { readonly accepted: boolean }>(
    action: (settlement: PrologueSettlementSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.settlement) return this.rejectedMode<T>();
    try {
      const result = action(this.settlement);
      if (result.accepted && this.crossSaveCoordinator) {
        this.crossSaveCoordinator.synchronizeOrdinarySession(this.settlement.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate<T>(); }
  }
  private delegateInfrastructure<T extends InfrastructureAcceptedResult>(
    action: (x: PrologueWaterwheelSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.infrastructure) return this.rejectedMode();
    try { const result = action(this.infrastructure); this.reconcileMode(); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateCistern<T extends CisternAcceptedResult>(action: (x: PrologueCisternSession) => T) {
    if (!this.cistern) return this.rejectedMode<T>();
    try { const result = action(this.cistern); return this.delegated(result, result.accepted); }
    catch { return this.rejectedDelegate<T>(); }
  }
  private delegateCisternSnapshot<T extends PrologueCisternSnapshot>(
    action: (x: PrologueCisternSession) => T,
  ): PrologueFlowAction<T> {
    if (!this.cistern) return this.rejectedMode();
    try { return this.delegated(action(this.cistern), true); }
    catch { return this.rejectedDelegate(); }
  }
  private delegateReturnFlow<T extends ReturnFlowAcceptedResult>(action: (x: PrologueReturnFlowSession) => T): PrologueFlowAction<T> {
    if (!this.returnFlow) return this.rejectedMode();
    try {
      const result = action(this.returnFlow);
      if (result.accepted && this.crossSaveCoordinator) this.crossSaveCoordinator.synchronizeOrdinarySession(this.returnFlow.session);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  private resetSafeRange(action: (x: PrologueSafeRangeSession) => PrologueSafeRangeActionResult):
  PrologueFlowAction<PrologueSafeRangeActionResult> {
    if (!this.safeRange) return this.rejectedMode();
    try {
      const result = action(this.safeRange);
      if (result.accepted) {
        this.safeRangePreviews.clear();
        this.safeRangeBridge = createSafeRangeRuntimeBridge(this.safeRange.session);
        this.safeRangeRuntimeWorld = new SafeRangeRuntimeWorld({
          playerPositionPx: this.safeRangeBridge.runtime.snapshot().player.position,
          actors: [],
        });
        this.safeRange = PrologueSafeRangeSession.fromSave(this.safeRange.session.toSave(), this.safeRangeRuntimeWorld);
        if (this.crossSaveCoordinator) this.crossSaveCoordinator.synchronizeOrdinarySession(this.safeRange.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  private delegateWildlife<T extends PrologueWildlifeActionResult>(action: (x: PrologueWildlifeSession) => T): PrologueFlowAction<T> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = action(this.wildlife);
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  private resetWildlife(action: (x: PrologueWildlifeSession) => PrologueWildlifeActionResult): PrologueFlowAction<PrologueWildlifeActionResult> {
    if (!this.wildlife) return this.rejectedMode();
    try {
      const result = action(this.wildlife);
      if (result.accepted) {
        this.wildlifePlayerPositionPx = Object.freeze({ ...this.wildlife.session.snapshot().checkpoint.position });
        this.wildlifeRuntimeTick = 0;
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }

  private clearReturnFlowProgress(): void {
    this.returnFlowSelectedSolutionId = null;
    this.returnFlowCompletedActionIds.clear();
    this.returnFlowOperationPayloads.clear();
  }
  private resetReturnFlow(action: (x: PrologueReturnFlowSession) => PrologueReturnFlowActionResult):
  PrologueFlowAction<PrologueReturnFlowActionResult> {
    if (!this.returnFlow) return this.rejectedMode();
    try {
      const result = action(this.returnFlow);
      if (result.accepted) {
        this.clearReturnFlowProgress();
        if (this.crossSaveCoordinator) this.crossSaveCoordinator.synchronizeOrdinarySession(this.returnFlow.session);
      }
      return this.delegated(result, result.accepted);
    } catch { return this.rejectedDelegate(); }
  }
  private returnFlowSemanticResult(
    accepted: boolean,
    duplicate: boolean,
    reason: PrologueReturnFlowSemanticActionResult["reason"],
    actionId: string,
    solutionId: ReturnFlowSolutionId | null,
  ): PrologueReturnFlowSemanticActionResult {
    if (!this.returnFlow) throw new Error("return-flow semantic result requires N07");
    return Object.freeze({ accepted, duplicate, reason, actionId, solutionId, snapshot: this.returnFlow.snapshot() });
  }

  private withCisternCapacity(session: GameSession): GameSession {
    if (session.snapshot().capabilities.appliedMilestones[CISTERN_CAPACITY_CONTRACT.milestoneId]) return session;
    const transactionId = `${PROLOGUE_FLOW_CISTERN_CAPACITY_TRANSACTION_PREFIX}:${session.sessionId}`;
    const commit = commitSessionProposal(session, proposeCapabilityMilestone(transactionId, CISTERN_CAPACITY_CONTRACT));
    if (!commit.committed) throw new Error(`cistern capacity milestone rejected: ${commit.reason}`);
    return commit.session;
  }

  private activateWildlife(wildlife: PrologueWildlifeSession): void {
    this.arrival = null; this.settlement = null; this.infrastructure = null; this.cistern = null; this.returnFlow = null;
    this.safeRange = null; this.safeRangeRuntimeWorld = null; this.safeRangeBridge = null; this.safeRangePreviews.clear();
    this.wildlife = wildlife;
    this.wildlifePlayerPositionPx = Object.freeze({ ...wildlife.session.snapshot().checkpoint.position });
    this.wildlifeRuntimeTick = 0;
  }

  private reconcileMode(): void {
    const sceneId = this.session.snapshot().world.currentSceneId;
    if (this.arrival && sceneId === PROLOGUE_SETTLEMENT_SCENE_ID) {
      const session = this.arrival.session;
      const adoption = PrologueSettlementSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_SETTLEMENT_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.settlement) throw new Error(`settlement entry rejected: ${adoption.reason}`);
      this.arrival = null;
      this.settlement = this.crossSaveCoordinator
        ? new PrologueSettlementSession(adoption.settlement.session, this.crossSaveCoordinator)
        : adoption.settlement;
      return;
    }
    if (this.settlement && sceneId === PROLOGUE_WATERWHEEL_SCENE_ID) {
      const session = this.settlement.session;
      const adoption = PrologueWaterwheelSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_WATERWHEEL_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.infrastructure) throw new Error(`waterwheel entry rejected: ${adoption.reason}`);
      this.commitCrossSaveRegionExit(adoption.infrastructure.session);
      this.settlement = null;
      this.infrastructure = adoption.infrastructure;
      return;
    }
    if (this.settlement && sceneId === PROLOGUE_OLD_MINE_SCENE_ID) {
      const session = this.settlement.session;
      const state = session.snapshot();
      if (!globalTrue(state, "prologue_return_observed")) {
        throw new Error("old-mine runtime entry requires prologue_return_observed");
      }
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_OLD_MINE_SCENE_ID).length;
      const transactionId = `${PROLOGUE_FLOW_OLD_MINE_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:runtime:${entryCount}`;
      const drafts: Parameters<typeof commitSessionProposal>[1]["drafts"][number][] = [{
        eventId: `session.old-mine.runtime-checkpoint.${entryCount}`,
        type: "checkpoint_set",
        payload: { checkpoint: { id: "checkpoint.valley.old-mine.entry", sceneId: PROLOGUE_OLD_MINE_SCENE_ID,
          position: { ...OLD_MINE_ENTRY.spawnPx }, revision: state.checkpoint.revision + 1 } },
      }];
      if (!state.quests.ch01_world_literacy_prologue_exit) drafts.push({
        eventId: `session.old-mine.runtime-quest.${entryCount}`,
        type: "quest_stage_set",
        payload: { questId: "ch01_world_literacy_prologue_exit", stageId: "peaceful_exit_reached", stageOrdinal: 1 },
      });
      const completionReceiptId = oldMineCompletionReceiptId(session.sessionId);
      if (!state.receiptIndex[completionReceiptId]) drafts.push({
        eventId: `session.old-mine.runtime-completion.${entryCount}`,
        type: "receipt_recorded",
        payload: { receiptId: completionReceiptId, domain: "world", payloadHash: "prologue-peaceful-exit:v1" },
      });
      drafts.push({ eventId: `session.old-mine.runtime-entry-receipt.${entryCount}`, type: "receipt_recorded",
        payload: { receiptId: `world:${session.sessionId}:old-mine-runtime-entry:${entryCount}`,
          domain: "world", payloadHash: `old-mine-runtime-entry:${entryCount}` } });
      const committed = commitSessionProposal(session, { transactionId, drafts });
      if (!committed.committed) throw new Error(`old-mine runtime adoption rejected: ${committed.reason}`);
      this.commitCrossSaveRegionExit(committed.session);
      this.settlement = null;
      this.oldMineBridge = createOldMineRuntimeBridge(committed.session);
      return;
    }
    if (this.infrastructure && sceneId === PROLOGUE_CISTERN_SCENE_ID) {
      const session = this.withCisternCapacity(this.infrastructure.session);
      const adoption = PrologueCisternSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_CISTERN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}`,
      );
      if (!adoption.accepted || !adoption.cistern) throw new Error(`cistern entry rejected: ${adoption.reason}`);
      this.infrastructure = null;
      this.cistern = adoption.cistern;
      return;
    }
    if (this.cistern && sceneId === PROLOGUE_RETURN_FLOW_SCENE_ID) {
      const session = this.cistern.session;
      if (!this.cistern.snapshot().completed || !this.cistern.snapshot().returnChannelAvailable) {
        throw new Error("return-flow entry requires completed N05");
      }
      const entryCount = session.events().filter((event) =>
        event.type === "scene_entered" && event.payload.sceneId === PROLOGUE_RETURN_FLOW_SCENE_ID
      ).length;
      const adoption = PrologueReturnFlowSession.adoptRuntimeEntry(
        session,
        `${PROLOGUE_FLOW_RETURN_ENTRY_TRANSACTION_PREFIX}:${session.sessionId}:${entryCount}`,
      );
      if (!adoption.accepted || !adoption.returnFlow) throw new Error(`return-flow entry rejected: ${adoption.reason}`);
      this.commitCrossSaveRegionExit(adoption.returnFlow.session);
      this.cistern = null;
      this.returnFlow = adoption.returnFlow;
      this.clearReturnFlowProgress();
      return;
    }
    if (this.settlement && arrivalScene(sceneId)) {
      const session = this.settlement.session;
      this.commitCrossSaveRegionExit(session);
      this.settlement = null;
      this.arrival = new PrologueArrivalStreamSession(session);
      return;
    }
    if (!arrivalScene(sceneId) && sceneId !== PROLOGUE_SETTLEMENT_SCENE_ID &&
        !infrastructureScene(sceneId) && sceneId !== PROLOGUE_CISTERN_SCENE_ID &&
        sceneId !== PROLOGUE_WILDLIFE_SCENE_ID && sceneId !== PROLOGUE_RETURN_FLOW_SCENE_ID &&
        sceneId !== PROLOGUE_SAFE_RANGE_SCENE_ID && sceneId !== PROLOGUE_OLD_MINE_SCENE_ID) {
      throw new Error(`unsupported prologue scene: ${sceneId}`);
    }
  }

  private commitCrossSaveRegionExit(session: GameSession): void {
    if (!this.crossSaveCoordinator) return;
    this.crossSaveCoordinator.synchronizeOrdinarySession(session);
    const recovery = this.crossSaveCoordinator.regionExitBarrier();
    if (recovery.sceneActivationBlocked) throw new Error("cross-save region exit recovery blocks activation");
  }

  private delegated<T>(result: T, accepted: boolean): PrologueFlowAction<T> {
    return Object.freeze({ accepted, reason: accepted ? "delegated" : "delegate_rejected", result, snapshot: this.snapshot() });
  }
  private rejectedMode<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "wrong_mode", result: null, snapshot: this.snapshot() });
  }
  private rejectedDelegate<T>(): PrologueFlowAction<T> {
    return Object.freeze({ accepted: false, reason: "delegate_rejected", result: null, snapshot: this.snapshot() });
  }
}
