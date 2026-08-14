import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeInfrastructureTaskManifestIndex,
  readRuntimeReturnFlowTaskManifest,
  type RuntimeInfrastructureTaskSolutionManifest,
} from "../content/runtime-task-manifest";
import {
  readRuntimeSceneManifestIndex,
  type RuntimeSceneEntranceManifest,
  type RuntimeSceneManifest,
} from "../content/runtime-scene-manifest";
import {
  reduceLearningEvidence,
  type GlyphAttunementCompletedEvent,
  type GlyphDiscoveredEvent,
  type GroundingTrialResolvedEvent,
  type LearningEvidenceEvent,
  type PromptLevel,
} from "../learning/progression";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import {
  commitSessionProposal,
  commitTrustedReturnFlowQualificationProposal,
  type SessionEventDraft,
  type SessionProposalBatch,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionSave,
  type GameSessionState,
  type SessionApplyReason,
  type WorldFlagValue,
} from "../session/game-session";
import {
  RETURN_FLOW_SOLUTION_IDS,
  exactRequiredActionsCompleted,
  returnFlowWorldReady,
  type ReturnFlowSolutionContract,
  type ReturnFlowSolutionId,
  type ReturnFlowWorldFacts,
} from "./return-flow-predicates";

const TASK_INDEX = readRuntimeInfrastructureTaskManifestIndex(generatedRuntimeArtifact);
const SCENE_INDEX = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const RETURN_FLOW_CONTRACT = readRuntimeReturnFlowTaskManifest(generatedRuntimeArtifact);
const RETURN_FLOW_TASK = TASK_INDEX.byId.ch01_return_flow;
if (!RETURN_FLOW_TASK || !RETURN_FLOW_TASK.returnFlow) {
  throw new Error("generated ch01_return_flow task contract is missing");
}
const RETURN_FLOW_SCENE = SCENE_INDEX.byId[RETURN_FLOW_TASK.sceneId];
if (!RETURN_FLOW_SCENE || RETURN_FLOW_SCENE.regionId !== RETURN_FLOW_TASK.regionId) {
  throw new Error("generated return-flow scene and task contracts are inconsistent");
}

const requireOne = <T>(values: readonly T[], predicate: (value: T) => boolean, label: string): T => {
  const matches = values.filter(predicate);
  if (matches.length !== 1) throw new Error(`expected one ${label}, received ${matches.length}`);
  return matches[0]!;
};
const isSolutionId = (value: string): value is ReturnFlowSolutionId =>
  (RETURN_FLOW_SOLUTION_IDS as readonly string[]).includes(value);

export type RuntimeReturnFlowSolutionContract = RuntimeInfrastructureTaskSolutionManifest &
  ReturnFlowSolutionContract & Readonly<{ id: ReturnFlowSolutionId; routeKind: "non_magic"; mainline: true }>;

const SOLUTIONS: readonly RuntimeReturnFlowSolutionContract[] = Object.freeze(
  RETURN_FLOW_TASK.solutions.map((solution) => {
    if (!isSolutionId(solution.id) || solution.routeKind !== "non_magic" || solution.mainline !== true ||
        solution.requiredActions.length === 0 || new Set(solution.requiredActions).size !== solution.requiredActions.length ||
        solution.requiredActions.some((action) => !action.trim())) {
      throw new Error(`generated return-flow solution ${solution.id} is invalid`);
    }
    return Object.freeze(solution) as RuntimeReturnFlowSolutionContract;
  }),
);
if (SOLUTIONS.length !== RETURN_FLOW_SOLUTION_IDS.length ||
    !RETURN_FLOW_SOLUTION_IDS.every((id) => SOLUTIONS.filter((solution) => solution.id === id).length === 1) ||
    RETURN_FLOW_CONTRACT.solutionIds.length !== SOLUTIONS.length) {
  throw new Error("generated return-flow contract must contain exactly the three frozen solutions");
}

const RETURN_ENTRY = requireOne(
  RETURN_FLOW_SCENE.entrances,
  (entrance) => entrance.id === RETURN_FLOW_SCENE.recovery.entryEntranceId,
  "return-flow recovery entrance",
);
const INBOUND = requireOne(
  RETURN_FLOW_SCENE.inboundRoutes,
  (route) => route.entranceId === RETURN_ENTRY.id,
  "cistern to return-flow inbound route",
);
const CISTERN_SCENE = SCENE_INDEX.byId[INBOUND.sourceSceneId];
if (!CISTERN_SCENE) throw new Error("generated return-flow source scene is missing");
const SETTLEMENT_EXIT = requireOne(
  RETURN_FLOW_SCENE.exits,
  (exit) => exit.target.kind === "scene",
  "return-flow settlement exit",
);
const SETTLEMENT_TARGET = SETTLEMENT_EXIT.target;
if (SETTLEMENT_TARGET.kind !== "scene") throw new Error("return-flow exit must target a scene");
const SETTLEMENT_SCENE = SCENE_INDEX.byId[SETTLEMENT_TARGET.sceneId];
if (!SETTLEMENT_SCENE) throw new Error("generated return-flow settlement target is missing");
const SETTLEMENT_ENTRY = requireOne(
  SETTLEMENT_SCENE.entrances,
  (entrance) => entrance.id === SETTLEMENT_TARGET.entranceId,
  "settlement return entrance",
);

export const PROLOGUE_RETURN_FLOW_SCENE_ID = RETURN_FLOW_SCENE.sceneId;
export const PROLOGUE_RETURN_FLOW_REGION_ID = RETURN_FLOW_SCENE.regionId;
export const PROLOGUE_RETURN_FLOW_TASK_ID = RETURN_FLOW_TASK.id;
export const PROLOGUE_RETURN_FLOW_PATCH_ID = RETURN_FLOW_CONTRACT.patchRecordRef;
export const RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS = RETURN_FLOW_CONTRACT.wawaEvidence.sourceTargetClass;
export const RETURN_FLOW_WAWA_TARGET_ID = RETURN_FLOW_CONTRACT.wawaEvidence.sourceTargetId;
export const PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS = SOLUTIONS;
export const PROLOGUE_RETURN_FLOW_ENTRY_CHECKPOINT_ID = "checkpoint.valley.return_channel.entry";
export const PROLOGUE_RETURN_FLOW_RETURN_CHECKPOINT_ID = "checkpoint.valley.settlement.return-entry";

export const PROLOGUE_RETURN_FLOW_FLAGS = Object.freeze({
  settlementSupplyStable: RETURN_FLOW_CONTRACT.completionFlags[0],
  wetMeadowRestored: RETURN_FLOW_CONTRACT.completionFlags[1],
  solutionId: "return_flow_solution_id",
  materialPatchApplied: `material_patch:${RETURN_FLOW_CONTRACT.patchRecordRef}`,
  prologueReturnObserved: "prologue_return_observed",
} as const);

export interface ReturnFlowSolutionEvidence {
  readonly completedActionIds: readonly string[];
  readonly world: ReturnFlowWorldFacts;
}

export interface ReturnFlowWawaGroundingAttempt {
  readonly solutionId: string;
  readonly promptLevel: PromptLevel;
  readonly predictedForceContrastCorrect: boolean;
  readonly worldOutcomeContribution: boolean;
  readonly answerVisible?: boolean;
}

export type PrologueReturnFlowActionReason =
  | "committed"
  | "duplicate"
  | "transaction_conflict"
  | "wrong_scene"
  | "wrong_source_scene"
  | "entry_guard_failed"
  | "unknown_solution"
  | "prerequisite_missing"
  | "ineligible_evidence"
  | "learning_prerequisite_missing"
  | "duplicate_evidence"
  | "session_rejected";

export interface PrologueReturnFlowSnapshot {
  readonly session: GameSessionState;
  readonly sceneId: string;
  readonly settlementSupplyStable: boolean;
  readonly wetMeadowRestored: boolean;
  readonly solutionId: string | null;
  readonly materialPatchApplied: boolean;
  readonly prologueReturnObserved: boolean;
  readonly taskCompleted: boolean;
  readonly wawa: Readonly<{
    discoveryState: string;
    attunementState: string;
    learningState: string | null;
    inertMechanismEvidenceCount: number;
    groundedPromptLevels: readonly (0 | 1)[];
  }>;
  readonly solutionContracts: readonly RuntimeReturnFlowSolutionContract[];
  readonly softLockRecovery: Readonly<{ maximumSeconds: number }>;
}

export interface PrologueReturnFlowActionResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueReturnFlowActionReason;
  readonly evidenceGranted: boolean;
  readonly sessionReason: SessionApplyReason | null;
  readonly snapshot: PrologueReturnFlowSnapshot;
}

export interface PrologueReturnFlowEntryResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueReturnFlowActionReason;
  readonly entryMode: "direct_transition" | "adopted_runtime_transition" | null;
  readonly returnFlow: PrologueReturnFlowSession | null;
}

declare const RETURN_FLOW_QUALIFICATION_PROOF_BRAND: unique symbol;
export interface ReturnFlowQualificationCommitProof {
  readonly [RETURN_FLOW_QUALIFICATION_PROOF_BRAND]: true;
  readonly kind: "grounding" | "observation";
  readonly batch: SessionProposalBatch;
}
const trustedReturnFlowQualificationProofs = new WeakSet<object>();
export const isTrustedReturnFlowQualificationCommitProof = (
  value: unknown,
): value is ReturnFlowQualificationCommitProof =>
  typeof value === "object" && value !== null && trustedReturnFlowQualificationProofs.has(value);
const createReturnFlowQualificationProof = (
  kind: ReturnFlowQualificationCommitProof["kind"],
  batch: SessionProposalBatch,
): ReturnFlowQualificationCommitProof => {
  const proof = Object.freeze({ kind, batch }) as unknown as ReturnFlowQualificationCommitProof;
  trustedReturnFlowQualificationProofs.add(proof);
  return proof;
};
export interface PrologueReturnFlowSettlementReturnResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly reason: PrologueReturnFlowActionReason;
  readonly session: GameSession | null;
}

const requiredId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
};
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
};
const fingerprint = (kind: string, payload: unknown): string =>
  `return-flow:${kind}:${JSON.stringify(canonicalize(payload))}`;
const operationReceiptId = (sessionId: string, transactionId: string): string =>
  `world:${sessionId}:return-flow-operation:${transactionId}`;
const classify = (session: GameSession, transactionId: string, payloadHash: string): "absent" | "duplicate" | "conflict" => {
  const receipt = session.snapshot().receiptIndex[operationReceiptId(session.sessionId, transactionId)];
  if (!receipt) return "absent";
  return receipt.domain === "world" && receipt.payloadHash === payloadHash ? "duplicate" : "conflict";
};
const receiptDraft = (eventId: string, receiptId: string, domain: "world" | "learning", payloadHash: string): SessionEventDraft => ({
  eventId, type: "receipt_recorded", payload: { receiptId, domain, payloadHash },
});
const operationReceiptDraft = (sessionId: string, transactionId: string, payloadHash: string): SessionEventDraft =>
  receiptDraft(`session.return-flow.operation.${transactionId}`, operationReceiptId(sessionId, transactionId), "world", payloadHash);
const regionFlagDraft = (eventId: string, flagId: string, value: WorldFlagValue): SessionEventDraft => ({
  eventId, type: "world_flag_set", payload: { flagId, value, scope: "region", regionId: PROLOGUE_RETURN_FLOW_REGION_ID },
});
const regionValue = (state: GameSessionState, flagId: string): WorldFlagValue | undefined =>
  Object.values(state.world.flags).find((flag) => flag.scope === "region" &&
    flag.regionId === PROLOGUE_RETURN_FLOW_REGION_ID && flag.flagId === flagId)?.value;
const regionTrue = (state: GameSessionState, flagId: string): boolean => regionValue(state, flagId) === true;
const globalTrue = (state: GameSessionState, flagId: string): boolean =>
  Object.values(state.world.flags).some((flag) => flag.scope === "global" && flag.flagId === flagId && flag.value === true);
const checkpointFor = (state: GameSessionState, id: string, scene: RuntimeSceneManifest,
  entrance: RuntimeSceneEntranceManifest) => ({
  id, sceneId: scene.sceneId, position: { ...entrance.spawnPx }, revision: state.checkpoint.revision + 1,
});
const variantFor = (solution: RuntimeReturnFlowSolutionContract, promptLevel: PromptLevel): `sha256:${string}` => {
  const environment = `${RETURN_FLOW_TASK.regionNodeId}:${RETURN_FLOW_WAWA_TARGET_ID}:${solution.chapterSolutionFamily}:verified-inert-flow`;
  return sha256Canonical({
    task_family: RETURN_FLOW_TASK.familyId,
    source_object_class: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
    normalized_environment_fingerprint: environment,
    canonical_ast_word_ids: [RETURN_FLOW_CONTRACT.wawaEvidence.wordId],
    solution_id: solution.id,
    prompt_level: promptLevel,
  } as JsonValue);
};

export class PrologueReturnFlowSession {
  private authoritativeSession: GameSession;

  public constructor(session: GameSession) {
    if (session.snapshot().world.currentSceneId !== RETURN_FLOW_SCENE.sceneId) {
      throw new Error("return-flow coordinator requires the generated N07 scene");
    }
    this.authoritativeSession = session;
  }

  public static enterFromCistern(session: GameSession, transactionId: string): PrologueReturnFlowEntryResult {
    return this.commitEntry(session, transactionId, "direct_transition");
  }

  public static adoptRuntimeEntry(session: GameSession, transactionId: string): PrologueReturnFlowEntryResult {
    return this.commitEntry(session, transactionId, "adopted_runtime_transition");
  }

  private static commitEntry(session: GameSession, transactionId: string,
    mode: "direct_transition" | "adopted_runtime_transition"): PrologueReturnFlowEntryResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = fingerprint("entry", {
      mode, sourceSceneId: CISTERN_SCENE.sceneId, sourceExitId: INBOUND.sourceExitId,
      targetSceneId: RETURN_FLOW_SCENE.sceneId, targetEntranceId: RETURN_ENTRY.id,
    });
    const prior = classify(session, id, payloadHash);
    if (prior === "conflict") return this.entryResult(false, false, "transaction_conflict", null, null);
    if (prior === "duplicate") {
      const arrived = session.snapshot().world.currentSceneId === RETURN_FLOW_SCENE.sceneId;
      return this.entryResult(arrived, arrived, arrived ? "duplicate" : "wrong_source_scene",
        arrived ? mode : null, arrived ? new PrologueReturnFlowSession(session) : null);
    }
    const state = session.snapshot();
    if (!regionTrue(state, RETURN_FLOW_CONTRACT.entryPrerequisiteFlag)) {
      return this.entryResult(false, false, "entry_guard_failed", null, null);
    }
    if (mode === "direct_transition" && state.world.currentSceneId !== CISTERN_SCENE.sceneId) {
      return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    if (mode === "adopted_runtime_transition") {
      const suffix = `${CISTERN_SCENE.sceneId}->${RETURN_FLOW_SCENE.sceneId}`;
      const latestEntry = [...session.events()].reverse().find((event) => event.type === "scene_entered");
      const canonical = state.world.currentSceneId === RETURN_FLOW_SCENE.sceneId && latestEntry?.type === "scene_entered" &&
        latestEntry.payload.sceneId === RETURN_FLOW_SCENE.sceneId && latestEntry.eventId.endsWith(suffix);
      if (!canonical) return this.entryResult(false, false, "wrong_source_scene", null, null);
    }
    const drafts: SessionEventDraft[] = [];
    if (mode === "direct_transition") drafts.push({
      eventId: `session.return-flow.entry.${id}.${CISTERN_SCENE.sceneId}->${RETURN_FLOW_SCENE.sceneId}`,
      type: "scene_entered", payload: { sceneId: RETURN_FLOW_SCENE.sceneId },
    });
    drafts.push(
      { eventId: `session.return-flow.entry.checkpoint.${id}`, type: "checkpoint_set",
        payload: { checkpoint: checkpointFor(state, PROLOGUE_RETURN_FLOW_ENTRY_CHECKPOINT_ID, RETURN_FLOW_SCENE, RETURN_ENTRY) } },
      operationReceiptDraft(session.sessionId, id, payloadHash),
    );
    const committed = commitSessionProposal(session, { transactionId: id, drafts });
    return committed.committed
      ? this.entryResult(true, false, "committed", mode, new PrologueReturnFlowSession(committed.session))
      : this.entryResult(false, false, "session_rejected", null, null);
  }

  private static entryResult(accepted: boolean, duplicate: boolean, reason: PrologueReturnFlowActionReason,
    entryMode: PrologueReturnFlowEntryResult["entryMode"], returnFlow: PrologueReturnFlowSession | null): PrologueReturnFlowEntryResult {
    return Object.freeze({ accepted, duplicate, reason, entryMode, returnFlow });
  }

  public static fromSave(candidate: unknown): PrologueReturnFlowSession {
    return new PrologueReturnFlowSession(GameSession.fromSave(candidate));
  }
  public get session(): GameSession { return this.authoritativeSession; }
  public toSave(): GameSessionSave { return this.authoritativeSession.toSave(); }

  public snapshot(): PrologueReturnFlowSnapshot {
    const state = this.authoritativeSession.snapshot();
    const wawa = state.learning.words.wawa;
    const solution = regionValue(state, PROLOGUE_RETURN_FLOW_FLAGS.solutionId);
    const inertGroundings = wawa?.evidence.filter((entry) =>
      entry.eventType === "grounding_trial_resolved" &&
      entry.sourceObjectClass === RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS) ?? [];
    return Object.freeze({
      session: state,
      sceneId: state.world.currentSceneId,
      settlementSupplyStable: regionTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.settlementSupplyStable),
      wetMeadowRestored: regionTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.wetMeadowRestored),
      solutionId: typeof solution === "string" ? solution : null,
      materialPatchApplied: regionTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.materialPatchApplied),
      prologueReturnObserved: globalTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.prologueReturnObserved),
      taskCompleted: state.quests[RETURN_FLOW_TASK.id]?.stageId === "completed",
      wawa: Object.freeze({
        discoveryState: wawa?.discoveryState ?? "unknown",
        attunementState: wawa?.attunementState ?? "locked",
        learningState: wawa?.learningState ?? null,
        inertMechanismEvidenceCount: wawa?.evidence.filter((entry) =>
          entry.sourceObjectClass === RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS).length ?? 0,
        groundedPromptLevels: Object.freeze([...new Set(inertGroundings.flatMap((entry) =>
          entry.promptLevel === 0 || entry.promptLevel === 1 ? [entry.promptLevel] : []))].sort()),
      }),
      solutionContracts: SOLUTIONS,
      softLockRecovery: Object.freeze({ maximumSeconds: RETURN_FLOW_TASK.maximumSoftlockRecoverySeconds }),
    });
  }

  public completeSolution(transactionId: string, solutionId: string,
    evidence: ReturnFlowSolutionEvidence): PrologueReturnFlowActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    const solution = SOLUTIONS.find((candidate) => candidate.id === solutionId);
    if (!solution) return this.result(false, false, "unknown_solution");
    const actions = [...evidence.completedActionIds].sort();
    const payloadHash = fingerprint("solution", { solutionId, completedActionIds: actions, world: evidence.world });
    const preflight = this.preflight(id, payloadHash);
    if (preflight) return preflight;
    if (!exactRequiredActionsCompleted(solution, actions) || !returnFlowWorldReady(solution.id, evidence.world)) {
      return this.result(false, false, "prerequisite_missing");
    }
    const before = this.snapshot();
    if (before.settlementSupplyStable && before.wetMeadowRestored) {
      if (before.solutionId !== solution.id) return this.result(false, false, "transaction_conflict");
      const recorded = this.commit({ transactionId: id,
        drafts: [operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash)] });
      return recorded.accepted ? this.result(true, true, "duplicate") : recorded;
    }
    const quest = before.session.quests[RETURN_FLOW_TASK.id];
    const drafts: SessionEventDraft[] = [
      regionFlagDraft(`session.return-flow.supply.${id}`, PROLOGUE_RETURN_FLOW_FLAGS.settlementSupplyStable, true),
      regionFlagDraft(`session.return-flow.meadow.${id}`, PROLOGUE_RETURN_FLOW_FLAGS.wetMeadowRestored, true),
      regionFlagDraft(`session.return-flow.solution.${id}`, PROLOGUE_RETURN_FLOW_FLAGS.solutionId, solution.id),
      regionFlagDraft(`session.return-flow.patch.${id}`, PROLOGUE_RETURN_FLOW_FLAGS.materialPatchApplied, true),
      { eventId: `session.return-flow.${RETURN_FLOW_CONTRACT.completionEvent}.${id}`, type: "quest_stage_set",
        payload: { questId: RETURN_FLOW_TASK.id, stageId: "completed", stageOrdinal: (quest?.stageOrdinal ?? 0) + 1 } },
      operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash),
    ];
    return this.commit({ transactionId: id, drafts });
  }

  public discoverWawa(transactionId: string): PrologueReturnFlowActionResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = fingerprint("wawa_discovery", {
      sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS, targetId: RETURN_FLOW_WAWA_TARGET_ID,
    });
    const preflight = this.learningPreflight(id, payloadHash);
    if (preflight) return preflight;
    if (this.snapshot().wawa.discoveryState === "discovered") return this.recordSemanticDuplicate(id, payloadHash);
    const event: GlyphDiscoveredEvent = {
      eventId: `return-flow.wawa.discovery.${id}`, eventType: "glyph_discovered",
      playerSaveId: this.authoritativeSession.sessionId, wordId: "wawa",
      idempotencyKey: `${this.authoritativeSession.sessionId}:return-flow:wawa:discovery:${id}`,
      sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
      locationId: RETURN_FLOW_WAWA_TARGET_ID, recognitionMode: "world_observation",
    };
    return this.commitLearning(id, payloadHash, event);
  }

  public attuneWawa(transactionId: string): PrologueReturnFlowActionResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = fingerprint("wawa_attunement", {
      sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS, targetId: RETURN_FLOW_WAWA_TARGET_ID,
    });
    const preflight = this.learningPreflight(id, payloadHash);
    if (preflight) return preflight;
    if (this.snapshot().wawa.attunementState === "attuned") return this.recordSemanticDuplicate(id, payloadHash);
    const event: GlyphAttunementCompletedEvent = {
      eventId: `return-flow.wawa.attunement.${id}`, eventType: "glyph_attunement_completed",
      playerSaveId: this.authoritativeSession.sessionId, wordId: "wawa",
      idempotencyKey: `${this.authoritativeSession.sessionId}:return-flow:wawa:attunement:${id}`,
      sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
      catalystClass: "common_nontradeable", catalystTradeable: false,
      environmentalWitnessId: RETURN_FLOW_WAWA_TARGET_ID,
    };
    return this.commitLearning(id, payloadHash, event);
  }

  public groundWawa(transactionId: string, attempt: ReturnFlowWawaGroundingAttempt): PrologueReturnFlowActionResult {
    const id = requiredId(transactionId, "transactionId");
    const solution = SOLUTIONS.find((candidate) => candidate.id === attempt.solutionId);
    if (!solution) return this.result(false, false, "unknown_solution");
    const variantHash = variantFor(solution, attempt.promptLevel);
    const environment = `${RETURN_FLOW_TASK.regionNodeId}:${RETURN_FLOW_WAWA_TARGET_ID}:${solution.chapterSolutionFamily}:verified-inert-flow`;
    const payloadHash = fingerprint("wawa_grounding", { attempt, variantHash, sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
      targetId: RETURN_FLOW_WAWA_TARGET_ID, livingOverlapFalse: true, harmApplied: 0, attackOutputCreated: false });
    const preflight = this.learningPreflight(id, payloadHash);
    if (preflight) return preflight;
    const snapshot = this.snapshot();
    const mechanismVerified = snapshot.solutionId === solution.id && snapshot.settlementSupplyStable &&
      snapshot.wetMeadowRestored && snapshot.materialPatchApplied && snapshot.taskCompleted;
    if (!mechanismVerified || attempt.promptLevel > RETURN_FLOW_CONTRACT.wawaEvidence.maximumPromptLevel ||
        !attempt.predictedForceContrastCorrect || !attempt.worldOutcomeContribution || attempt.answerVisible === true) {
      return this.result(false, false, "ineligible_evidence");
    }
    const existing = snapshot.session.learning.words.wawa?.evidence.some((entry) =>
      entry.eventType === "grounding_trial_resolved" &&
      entry.sourceObjectClass === RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS &&
      entry.taskFamilyId === RETURN_FLOW_TASK.familyId && entry.promptLevel === attempt.promptLevel) ?? false;
    if (existing) return this.recordSemanticDuplicate(id, payloadHash);
    const event: GroundingTrialResolvedEvent = {
      eventId: `return-flow.wawa.grounding.${id}`, eventType: "grounding_trial_resolved",
      playerSaveId: this.authoritativeSession.sessionId, wordId: "wawa",
      idempotencyKey: `${this.authoritativeSession.sessionId}:return-flow:wawa:grounding:${id}`,
      sourceObjectClass: RETURN_FLOW_WAWA_SOURCE_OBJECT_CLASS,
      taskId: RETURN_FLOW_TASK.id, taskFamilyId: RETURN_FLOW_TASK.familyId, variantHash,
      normalizedEnvironmentFingerprint: environment, promptLevel: attempt.promptLevel,
      interpretationStatus: "executed_legal", worldOutcomeContribution: true, toolBypass: false,
      answerVisible: false, fixedSlotOnly: false, colorOnlyCue: false,
      semanticFacetsDemonstrated: ["intensity", "energy_input", "noncombat_force"],
      canonicalAstWordIds: [RETURN_FLOW_CONTRACT.wawaEvidence.wordId],
      worldOutcomeKind: "inert_force_observation",
    };
    return this.commitLearning(id, payloadHash, event);
  }

  public returnToSettlement(transactionId: string): PrologueReturnFlowSettlementReturnResult {
    const id = requiredId(transactionId, "transactionId");
    const payloadHash = fingerprint("settlement_return", {
      sourceSceneId: RETURN_FLOW_SCENE.sceneId, sourceExitId: SETTLEMENT_EXIT.id,
      targetSceneId: SETTLEMENT_SCENE.sceneId, targetEntranceId: SETTLEMENT_ENTRY.id,
      observationEvent: "return_observation_committed",
    });
    const prior = classify(this.authoritativeSession, id, payloadHash);
    if (prior === "conflict") return Object.freeze({ accepted: false, duplicate: false, reason: "transaction_conflict", session: null });
    if (prior === "duplicate") {
      const arrived = this.authoritativeSession.snapshot().world.currentSceneId === SETTLEMENT_SCENE.sceneId;
      return Object.freeze({ accepted: arrived, duplicate: arrived, reason: arrived ? "duplicate" : "wrong_source_scene",
        session: arrived ? this.authoritativeSession : null });
    }
    if (!this.inScene()) return Object.freeze({ accepted: false, duplicate: false, reason: "wrong_scene", session: null });
    const state = this.authoritativeSession.snapshot();
    if (!regionTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.settlementSupplyStable) ||
        !regionTrue(state, PROLOGUE_RETURN_FLOW_FLAGS.wetMeadowRestored) ||
        !regionTrue(state, RETURN_FLOW_CONTRACT.exitPrerequisiteFlag)) {
      return Object.freeze({ accepted: false, duplicate: false, reason: "prerequisite_missing", session: null });
    }
    const committed = commitTrustedReturnFlowQualificationProposal(this.authoritativeSession, createReturnFlowQualificationProof("observation", { transactionId: id, drafts: [
      { eventId: `session.return-flow.return.${id}.${RETURN_FLOW_SCENE.sceneId}->${SETTLEMENT_SCENE.sceneId}`,
        type: "scene_entered", payload: { sceneId: SETTLEMENT_SCENE.sceneId } },
      { eventId: `session.return-flow.return_observation_committed.${id}`,
        type: "prologue_return_observation_committed",
        payload: { transactionId: id, writerEvent: "return_observation_committed" } },
      { eventId: `session.return-flow.return.checkpoint.${id}`, type: "checkpoint_set",
        payload: { checkpoint: checkpointFor(state, PROLOGUE_RETURN_FLOW_RETURN_CHECKPOINT_ID, SETTLEMENT_SCENE, SETTLEMENT_ENTRY) } },
      operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash),
    ] }));
    if (!committed.committed) return Object.freeze({ accepted: false, duplicate: false, reason: "session_rejected", session: null });
    this.authoritativeSession = committed.session;
    return Object.freeze({ accepted: true, duplicate: false, reason: "committed", session: committed.session });
  }

  public resetToCheckpoint(transactionId: string): PrologueReturnFlowActionResult {
    return this.reset(transactionId, "checkpoint_reset", false);
  }
  public recoverSoftLock(transactionId: string): PrologueReturnFlowActionResult {
    return this.reset(transactionId, "softlock_recovery", true);
  }

  private learningPreflight(transactionId: string, payloadHash: string): PrologueReturnFlowActionResult | null {
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    return this.preflight(transactionId, payloadHash);
  }
  private preflight(transactionId: string, payloadHash: string): PrologueReturnFlowActionResult | null {
    const prior = classify(this.authoritativeSession, transactionId, payloadHash);
    if (prior === "conflict") return this.result(false, false, "transaction_conflict");
    if (prior === "duplicate") return this.result(true, true, "duplicate");
    return null;
  }
  private recordSemanticDuplicate(transactionId: string, payloadHash: string): PrologueReturnFlowActionResult {
    const result = this.commit({ transactionId,
      drafts: [operationReceiptDraft(this.authoritativeSession.sessionId, transactionId, payloadHash)] });
    return result.accepted ? this.result(true, true, "duplicate") : result;
  }
  private commitLearning(transactionId: string, payloadHash: string,
    event: LearningEvidenceEvent): PrologueReturnFlowActionResult {
    const reduction = reduceLearningEvidence(this.authoritativeSession.snapshot().learning, event);
    if (!reduction.applied) {
      const reason = reduction.reason === "prerequisite_missing" ? "learning_prerequisite_missing" :
        reduction.reason === "duplicate_event" || reduction.reason === "duplicate_variant" ? "duplicate_evidence" :
          "ineligible_evidence";
      return this.result(false, reduction.duplicate, reason);
    }
    const learningEventId = `session.return-flow.learning.${transactionId}`;
    const drafts: SessionEventDraft[] = [
      { eventId: learningEventId, type: "learning_evidence_committed", payload: { evidence: event } },
    ];
    if (event.eventType === "grounding_trial_resolved" && event.wordId === "wawa") {
      drafts.push({
        eventId: `session.return-flow.qualification.${transactionId}`,
        type: "learning_evidence_committed",
        payload: {
          qualificationActionId: event.promptLevel === 0
            ? "return_flow.wawa.inert_h0" as const : "return_flow.wawa.inert_h1" as const,
          transactionId,
          sourceEvidenceEventId: learningEventId,
        },
      });
    }
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, transactionId, payloadHash));
    return event.eventType === "grounding_trial_resolved" && event.wordId === "wawa"
      ? this.commitTrustedGrounding({ transactionId, drafts })
      : this.commit({ transactionId, drafts }, true);
  }
  private commitTrustedGrounding(batch: SessionProposalBatch): PrologueReturnFlowActionResult {
    const committed = commitTrustedReturnFlowQualificationProposal(this.authoritativeSession, createReturnFlowQualificationProof("grounding", batch));
    if (!committed.committed) return this.result(false, false, "session_rejected", false, committed.reason);
    this.authoritativeSession = committed.session;
    return this.result(true, false, "committed", true);
  }
  private reset(transactionId: string, kind: string, softLock: boolean): PrologueReturnFlowActionResult {
    const id = requiredId(transactionId, "transactionId");
    if (!this.inScene()) return this.result(false, false, "wrong_scene");
    const payloadHash = fingerprint(kind, { maximumSeconds: softLock ? RETURN_FLOW_TASK.maximumSoftlockRecoverySeconds : null });
    const preflight = this.preflight(id, payloadHash);
    if (preflight) return preflight;
    const state = this.authoritativeSession.snapshot();
    const drafts: SessionEventDraft[] = [{ eventId: `session.return-flow.reset.${id}`, type: "area_reset",
      payload: { areaId: RETURN_FLOW_SCENE.sceneId, respawnSceneId: RETURN_FLOW_SCENE.sceneId } }];
    if (softLock) drafts.push({ eventId: `session.return-flow.recovery-checkpoint.${id}`, type: "checkpoint_set",
      payload: { checkpoint: checkpointFor(state, "checkpoint.valley.return_channel.recovery", RETURN_FLOW_SCENE, RETURN_ENTRY) } });
    drafts.push(operationReceiptDraft(this.authoritativeSession.sessionId, id, payloadHash));
    return this.commit({ transactionId: id, drafts });
  }
  private commit(batch: SessionProposalBatch, evidenceGranted = false): PrologueReturnFlowActionResult {
    const committed = commitSessionProposal(this.authoritativeSession, batch);
    if (!committed.committed) return this.result(false, false, "session_rejected", false, committed.reason);
    this.authoritativeSession = committed.session;
    return this.result(true, false, "committed", evidenceGranted);
  }
  private inScene(): boolean {
    return this.authoritativeSession.snapshot().world.currentSceneId === RETURN_FLOW_SCENE.sceneId;
  }
  private result(accepted: boolean, duplicate: boolean, reason: PrologueReturnFlowActionReason,
    evidenceGranted = false, sessionReason: SessionApplyReason | null = null): PrologueReturnFlowActionResult {
    return Object.freeze({ accepted, duplicate, reason, evidenceGranted, sessionReason, snapshot: this.snapshot() });
  }
}

export const createPrologueReturnFlowInitialSession = (sessionId: string): GameSession => GameSession.create({
  sessionId: requiredId(sessionId, "sessionId"), mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: RETURN_FLOW_SCENE.sceneId,
});
