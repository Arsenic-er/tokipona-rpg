import generated from "../generated/content-runtime.v0.1.json";
import { PROLOGUE_SETTLEMENT_SCENE } from "../game/prologue-arrival-stream";
import {
  learningCorpusAuthorityFingerprint,
  type LearningCorpusActionKind,
  type RuntimeLearningCorpusWorldAuthority,
} from "../content/runtime-learning-corpus-package";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import { GameSession } from "../session/game-session";
import { GameSessionRuntimeBridge } from "../runtime/game-session-bridge";

const SETTLEMENT_SCENE_ID = "scene.valley.settlement";

export const extensionLearningScenes = readRuntimeSceneManifestIndex(generated);

export const EXTENSION_LEARNING_AUTHORITIES: Readonly<
  Record<LearningCorpusActionKind, RuntimeLearningCorpusWorldAuthority>
> = Object.freeze({
  discover: Object.freeze({
    sceneId: SETTLEMENT_SCENE_ID,
    targetId: "settlement.p0_inscription_archive",
    interactionId: "settlement.open_p0_inscription_archive",
    sourceObjectClass: "learning_recovery_station",
    interactionPointPx: Object.freeze({ x: 616, y: 456 }),
    maximumDistancePx: 16,
  }),
  attune: Object.freeze({
    sceneId: SETTLEMENT_SCENE_ID,
    targetId: "settlement.attack_calibration_table",
    interactionId: "settlement.open_attack_calibration",
    sourceObjectClass: "inert_learning_station",
    interactionPointPx: Object.freeze({ x: 584, y: 456 }),
    maximumDistancePx: 16,
  }),
  context_0: Object.freeze({
    sceneId: SETTLEMENT_SCENE_ID,
    targetId: "settlement.communal_kitchen",
    interactionId: "settlement.take_plant_meal",
    sourceObjectClass: "public_relief",
    interactionPointPx: Object.freeze({ x: 168, y: 456 }),
    maximumDistancePx: 16,
  }),
  context_1: Object.freeze({
    sceneId: SETTLEMENT_SCENE_ID,
    targetId: "settlement.supply_stall",
    interactionId: "settlement.open_supply_trade",
    sourceObjectClass: "trade_counter",
    interactionPointPx: Object.freeze({ x: 424, y: 456 }),
    maximumDistancePx: 16,
  }),
  repair: Object.freeze({
    sceneId: SETTLEMENT_SCENE_ID,
    targetId: "settlement.butcher_counter",
    interactionId: "settlement.open_butcher_trade",
    sourceObjectClass: "trade_counter",
    interactionPointPx: Object.freeze({ x: 488, y: 456 }),
    maximumDistancePx: 16,
  }),
});

export function extensionLearningAuthority(
  kind: LearningCorpusActionKind,
): RuntimeLearningCorpusWorldAuthority {
  return EXTENSION_LEARNING_AUTHORITIES[kind];
}

export function extensionLearningEnvironmentFingerprint(kind: LearningCorpusActionKind): string | null {
  return kind === "discover" || kind === "attune"
    ? null
    : learningCorpusAuthorityFingerprint(extensionLearningAuthority(kind));
}

export function extensionLearningPlayerPosition(
  kind: LearningCorpusActionKind,
): Readonly<{ readonly x: number; readonly y: number }> {
  const interactionPoint = extensionLearningAuthority(kind).interactionPointPx;
  return Object.freeze({ x: interactionPoint.x, y: interactionPoint.y - 8 });
}

export function createExtensionLearningSession(
  playerSaveId: string,
  kind: LearningCorpusActionKind,
  position = extensionLearningPlayerPosition(kind),
): GameSession {
  return GameSession.create({
    sessionId: playerSaveId,
    mp: { currentMp: 10, maxMp: 10, worldVersion: 0 },
    currentSceneId: SETTLEMENT_SCENE_ID,
    checkpoint: {
      id: `checkpoint.extension-learning.${kind}`,
      sceneId: SETTLEMENT_SCENE_ID,
      position: Object.freeze({ ...position }),
      revision: 0,
    },
  });
}

export function createExtensionLearningBridge(
  session: GameSession,
): GameSessionRuntimeBridge {
  return new GameSessionRuntimeBridge({
    session,
    scenes: [Object.freeze({ ...PROLOGUE_SETTLEMENT_SCENE, exits: Object.freeze([]) })],
    sceneAreas: { [SETTLEMENT_SCENE_ID]: "valley_prologue" },
  });
}
