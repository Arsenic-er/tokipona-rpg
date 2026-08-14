import {
  CORE120_ACTION_KINDS,
  isVerifiedRuntimeCore120CurriculumManifest,
  type Core120ActionKind,
  type RuntimeCore120Context,
  type RuntimeCore120CurriculumManifest,
  type RuntimeCore120WordManifest,
} from "../content/runtime-core120-curriculum-manifest";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest";
import {
  LEARNING_SAVE_SCHEMA,
  createLearningProgression,
  reduceLearningEvidence,
  type LearningEvidenceEvent,
  type LearningProgressionSnapshot,
  type PromptLevel,
  type EvidenceLedgerEntry,
} from "./progression";

export const CORE120_CAMPAIGN_SAVE_SCHEMA = "tokipona.core120-learning-campaign.v0.2" as const;
export const LEGACY_CORE120_CAMPAIGN_SAVE_SCHEMA = "tokipona.core120-learning-campaign.v0.1" as const;

export type Core120LearningActionId = `core120.${string}.${Core120ActionKind}`;

export interface Core120CampaignState {
  readonly schema: typeof CORE120_CAMPAIGN_SAVE_SCHEMA;
  readonly manifestDigest: `sha256:${string}`;
  readonly playerSaveId: string;
  readonly learning: LearningProgressionSnapshot;
}

export interface Core120CampaignSave extends Core120CampaignState {
  readonly integrity: `sha256:${string}`;
}

export type Core120CampaignReason =
  | "applied"
  | "duplicate"
  | "forward_repaired"
  | "invalid_manifest"
  | "invalid_state"
  | "unknown_action"
  | "prerequisite_missing"
  | "idempotency_conflict"
  | "evidence_rejected";

export interface Core120CampaignActionResult {
  readonly state: Core120CampaignState;
  readonly actionId: string;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly repairedPartialAction: boolean;
  readonly evidenceApplied: number;
  readonly evidenceAlreadyPresent: number;
  readonly reason: Core120CampaignReason;
}

export interface Core120CampaignSummary {
  readonly totalWords: 120;
  readonly discoveredWords: number;
  readonly attunedWords: number;
  readonly producedWords: number;
  readonly repairedWords: number;
  readonly completedWords: number;
  readonly remainingSemanticActions: number;
}

const verifiedStates = new WeakSet<object>();
const EVIDENCE_TYPES = new Set([
  "glyph_discovered", "glyph_attunement_completed", "grounding_trial_resolved", "active_retrieval_submitted",
  "noncombat_action_completed", "repair_completed", "unseen_transfer_completed", "delayed_retrieval_completed",
]);
const LEARNING_STATES = new Set(["discovered", "grounded", "produced", "stabilized"]);

export function computeCore120CampaignIntegrity(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedCore120CampaignState(value: unknown): value is Core120CampaignState {
  return typeof value === "object" && value !== null && verifiedStates.has(value);
}

export function createCore120CampaignState(
  manifest: RuntimeCore120CurriculumManifest,
  playerSaveId: string,
  learning: LearningProgressionSnapshot = createLearningProgression(),
): Core120CampaignState {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) throw new Error("core120 campaign requires a verified manifest");
  if (!validPlayerSaveId(playerSaveId)) throw new Error("core120 campaign playerSaveId is invalid");
  const validatedLearning = readLearningSnapshot(learning);
  assertCampaignWords(validatedLearning, manifest);
  assertCampaignEvidenceIdentity(validatedLearning, manifest, playerSaveId);
  return sealState({ schema: CORE120_CAMPAIGN_SAVE_SCHEMA,
    manifestDigest: manifest.learningContract.semanticDigest, playerSaveId, learning: validatedLearning });
}

export function readCore120CampaignState(
  manifest: RuntimeCore120CurriculumManifest,
  candidate: unknown,
): Core120CampaignState {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) throw new Error("core120 campaign requires a verified manifest");
  const root = record(candidate, "core120 campaign save");
  exactKeys(root, ["schema", "manifestDigest", "playerSaveId", "learning", "integrity"], "core120 campaign save");
  const currentIdentity = root.schema === CORE120_CAMPAIGN_SAVE_SCHEMA &&
    root.manifestDigest === manifest.learningContract.semanticDigest;
  const legacyIdentity = root.schema === LEGACY_CORE120_CAMPAIGN_SAVE_SCHEMA &&
    typeof root.manifestDigest === "string" &&
    manifest.learningContract.compatibleLegacyContracts.some((contract) =>
      contract.sourceDigest === root.manifestDigest &&
      contract.semanticDigest === manifest.learningContract.semanticDigest);
  if ((!currentIdentity && !legacyIdentity) || !validPlayerSaveId(root.playerSaveId)) {
    throw new Error("core120 campaign save identity is invalid");
  }
  if (typeof root.integrity !== "string" || !/^sha256:[0-9a-f]{64}$/.test(root.integrity)) throw new Error("core120 campaign integrity is invalid");
  const body = { schema: root.schema, manifestDigest: root.manifestDigest, playerSaveId: root.playerSaveId, learning: root.learning };
  if (computeCore120CampaignIntegrity(body) !== root.integrity) throw new Error("core120 campaign integrity mismatch");
  const learning = readLearningSnapshot(root.learning);
  assertCampaignWords(learning, manifest);
  assertCampaignEvidenceIdentity(learning, manifest, root.playerSaveId);
  return sealState({ schema: CORE120_CAMPAIGN_SAVE_SCHEMA,
    manifestDigest: manifest.learningContract.semanticDigest, playerSaveId: root.playerSaveId, learning });
}

export function toCore120CampaignSave(state: Core120CampaignState): Core120CampaignSave {
  if (!isVerifiedCore120CampaignState(state)) throw new Error("core120 campaign state is not verified");
  const body = { schema: state.schema, manifestDigest: state.manifestDigest, playerSaveId: state.playerSaveId, learning: state.learning };
  return deepFreeze({ ...body, integrity: computeCore120CampaignIntegrity(body) });
}

export function listCore120LearningActionIds(manifest: RuntimeCore120CurriculumManifest): readonly Core120LearningActionId[] {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) throw new Error("core120 campaign requires a verified manifest");
  return Object.freeze(manifest.scope.wordIds.flatMap((wordId) => CORE120_ACTION_KINDS.map((kind) => `core120.${wordId}.${kind}` as Core120LearningActionId)));
}

/**
 * Materializes the canonical evidence carried by one semantic campaign action.
 * Live coordinators may choose where the action is authorized, but neither UI
 * payloads nor callers may author or alter the resulting learning evidence.
 */
export function materializeCore120LearningEvidence(
  manifest: RuntimeCore120CurriculumManifest,
  playerSaveId: string,
  actionId: Core120LearningActionId,
): readonly LearningEvidenceEvent[] {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !validPlayerSaveId(playerSaveId)) {
    throw new Error("core120 evidence requires a verified manifest and player identity");
  }
  const parsed = parseAction(manifest, actionId);
  if (parsed === null) throw new Error(`unknown core120 action ${actionId}`);
  return deepFreeze([...materializeEvents(manifest, playerSaveId, parsed.word, parsed.kind,
    manifest.learningContract.semanticDigest)]);
}

/** Returns the canonical current evidence first, followed by explicit v0.1 readers. */
export function materializeCore120LearningEvidenceVariants(
  manifest: RuntimeCore120CurriculumManifest,
  playerSaveId: string,
  actionId: Core120LearningActionId,
): readonly (readonly LearningEvidenceEvent[])[] {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !validPlayerSaveId(playerSaveId)) {
    throw new Error("core120 evidence requires a verified manifest and player identity");
  }
  const parsed = parseAction(manifest, actionId);
  if (parsed === null) throw new Error(`unknown core120 action ${actionId}`);
  return deepFreeze(listCore120LearningContractDigests(manifest).map((identityDigest) =>
    [...materializeEvents(manifest, playerSaveId, parsed.word, parsed.kind, identityDigest)]));
}

export function listCore120LearningContractDigests(
  manifest: RuntimeCore120CurriculumManifest,
): readonly `sha256:${string}`[] {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) {
    throw new Error("core120 campaign requires a verified manifest");
  }
  return Object.freeze([manifest.learningContract.semanticDigest,
    ...manifest.learningContract.compatibleLegacyContracts.map((contract) => contract.sourceDigest)]);
}

export function core120EvidenceMatches(expected: LearningEvidenceEvent, actual: LearningEvidenceEvent): boolean {
  return computeRuntimeManifestDigest(expected) === computeRuntimeManifestDigest(actual);
}

export function isCore120LearningActionComplete(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
  actionId: Core120LearningActionId,
): boolean {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !isVerifiedCore120CampaignState(state) ||
      state.manifestDigest !== manifest.learningContract.semanticDigest) return false;
  const parsed = parseAction(manifest, actionId);
  return parsed !== null && actionEvidencePresent(manifest, state, parsed.word.wordId, parsed.kind);
}

/**
 * Lightweight authority checks for the unified GameSession reducer.
 *
 * The reducer already owns a structurally verified LearningProgressionSnapshot,
 * so rebuilding and revalidating a complete 120-word campaign for every ledger
 * event is unnecessary and makes reload quadratic in total evidence. These
 * checks inspect only the canonical evidence for the affected word/action.
 */
export function core120LearningActionPrerequisitesSatisfied(
  manifest: RuntimeCore120CurriculumManifest,
  learning: LearningProgressionSnapshot,
  playerSaveId: string,
  actionId: Core120LearningActionId,
): boolean {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !validPlayerSaveId(playerSaveId)) return false;
  const parsed = parseAction(manifest, actionId);
  if (parsed === null) return false;
  const present = (kind: Core120ActionKind): boolean =>
    actionEvidencePresentInLearning(manifest, learning, playerSaveId, parsed.word.wordId, kind);
  if (parsed.kind === "discover") return true;
  if (!present("discover")) return false;
  if (parsed.kind === "attune") return true;
  if (!present("attune")) return false;
  if (parsed.kind === "context_0" || parsed.kind === "context_1") return true;
  const progress = learning.words[parsed.word.wordId];
  return present("context_0") && present("context_1") &&
    (progress?.learningState === "produced" || progress?.learningState === "stabilized");
}

export function core120LearningActionEvidencePresent(
  manifest: RuntimeCore120CurriculumManifest,
  learning: LearningProgressionSnapshot,
  playerSaveId: string,
  actionId: Core120LearningActionId,
): boolean {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !validPlayerSaveId(playerSaveId)) return false;
  const parsed = parseAction(manifest, actionId);
  return parsed !== null && actionEvidencePresentInLearning(
    manifest, learning, playerSaveId, parsed.word.wordId, parsed.kind,
  );
}

export function applyCore120LearningAction(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
  actionId: string,
): Core120CampaignActionResult {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest)) return failed(state, actionId, "invalid_manifest");
  if (!isVerifiedCore120CampaignState(state) ||
      state.manifestDigest !== manifest.learningContract.semanticDigest) return failed(state, actionId, "invalid_state");
  const parsed = parseAction(manifest, actionId);
  if (parsed === null) return failed(state, actionId, "unknown_action");
  if (!prerequisitesSatisfied(manifest, state, parsed.word, parsed.kind)) return failed(state, actionId, "prerequisite_missing");

  const events = materializeEvents(manifest, state.playerSaveId, parsed.word, parsed.kind);
  let learning = state.learning;
  let evidenceApplied = 0;
  let evidenceAlreadyPresent = 0;
  for (const event of events) {
    const reduction = reduceLearningEvidence(learning, event);
    if (reduction.applied) {
      learning = reduction.snapshot;
      evidenceApplied += 1;
      continue;
    }
    if (reduction.duplicate && reduction.reason === "duplicate_event") {
      evidenceAlreadyPresent += 1;
      continue;
    }
    const reason: Core120CampaignReason = reduction.reason === "idempotency_conflict" ? "idempotency_conflict" : "evidence_rejected";
    return failed(state, actionId, reason);
  }

  if (evidenceApplied === 0) {
    return { state, actionId, applied: false, duplicate: true, repairedPartialAction: false, evidenceApplied: 0, evidenceAlreadyPresent, reason: "duplicate" };
  }
  const next = sealState({ schema: state.schema, manifestDigest: state.manifestDigest, playerSaveId: state.playerSaveId, learning });
  const repairedPartialAction = evidenceAlreadyPresent > 0;
  return {
    state: next,
    actionId,
    applied: true,
    duplicate: false,
    repairedPartialAction,
    evidenceApplied,
    evidenceAlreadyPresent,
    reason: repairedPartialAction ? "forward_repaired" : "applied",
  };
}

export function isCore120WordComplete(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
  wordId: string,
): boolean {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !isVerifiedCore120CampaignState(state) || state.manifestDigest !== manifest.learningContract.semanticDigest || manifest.words[wordId] === undefined) return false;
  return CORE120_ACTION_KINDS.every((kind) => actionEvidencePresent(manifest, state, wordId, kind));
}

export function summarizeCore120Campaign(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
): Core120CampaignSummary {
  if (!isVerifiedRuntimeCore120CurriculumManifest(manifest) || !isVerifiedCore120CampaignState(state) || state.manifestDigest !== manifest.learningContract.semanticDigest) throw new Error("core120 campaign state is not verified for this manifest");
  let discoveredWords = 0;
  let attunedWords = 0;
  let producedWords = 0;
  let repairedWords = 0;
  let completedWords = 0;
  let completedActions = 0;
  for (const wordId of manifest.scope.wordIds) {
    const progress = state.learning.words[wordId];
    if (progress?.discoveryState === "discovered") discoveredWords += 1;
    if (progress?.attunementState === "attuned") attunedWords += 1;
    if (progress?.learningState === "produced" || progress?.learningState === "stabilized") producedWords += 1;
    if (actionEvidencePresent(manifest, state, wordId, "repair")) repairedWords += 1;
    for (const kind of CORE120_ACTION_KINDS) if (actionEvidencePresent(manifest, state, wordId, kind)) completedActions += 1;
    if (isCore120WordComplete(manifest, state, wordId)) completedWords += 1;
  }
  return Object.freeze({
    totalWords: 120,
    discoveredWords,
    attunedWords,
    producedWords,
    repairedWords,
    completedWords,
    remainingSemanticActions: 120 * CORE120_ACTION_KINDS.length - completedActions,
  });
}

function parseAction(
  manifest: RuntimeCore120CurriculumManifest,
  actionId: string,
): { readonly word: RuntimeCore120WordManifest; readonly kind: Core120ActionKind } | null {
  const match = /^core120\.([a-z]+)\.(discover|attune|context_0|context_1|repair)$/.exec(actionId);
  if (match === null) return null;
  const word = manifest.words[match[1]!];
  return word === undefined ? null : { word, kind: match[2] as Core120ActionKind };
}

function prerequisitesSatisfied(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
  word: RuntimeCore120WordManifest,
  kind: Core120ActionKind,
): boolean {
  if (kind === "discover") return true;
  if (!actionEvidencePresent(manifest, state, word.wordId, "discover")) return false;
  if (kind === "attune") return true;
  if (!actionEvidencePresent(manifest, state, word.wordId, "attune")) return false;
  if (kind === "context_0" || kind === "context_1") return true;
  return actionEvidencePresent(manifest, state, word.wordId, "context_0") &&
    actionEvidencePresent(manifest, state, word.wordId, "context_1") &&
    (state.learning.words[word.wordId]?.learningState === "produced" || state.learning.words[word.wordId]?.learningState === "stabilized");
}

function actionEvidencePresent(
  manifest: RuntimeCore120CurriculumManifest,
  state: Core120CampaignState,
  wordId: string,
  kind: Core120ActionKind,
): boolean {
  return actionEvidencePresentInLearning(manifest, state.learning, state.playerSaveId, wordId, kind);
}

function actionEvidencePresentInLearning(
  manifest: RuntimeCore120CurriculumManifest,
  learning: LearningProgressionSnapshot,
  playerSaveId: string,
  wordId: string,
  kind: Core120ActionKind,
): boolean {
  const word = manifest.words[wordId];
  const evidence = learning.words[wordId]?.evidence;
  if (word === undefined || evidence === undefined) return false;
  return listCore120LearningContractDigests(manifest).some((identityDigest) => {
    const expected = materializeEvents(manifest, playerSaveId, word, kind, identityDigest)
      .map((event) => event.eventId);
    return expected.every((eventId) => evidence.some((entry) => entry.eventId === eventId));
  });
}

function materializeEvents(
  manifest: RuntimeCore120CurriculumManifest,
  playerSaveId: string,
  word: RuntimeCore120WordManifest,
  kind: Core120ActionKind,
  identityDigest: `sha256:${string}` = manifest.learningContract.semanticDigest,
): readonly LearningEvidenceEvent[] {
  const actionId = `core120.${word.wordId}.${kind}` as Core120LearningActionId;
  const identity = (eventType: string, ordinal: number): { readonly eventId: string; readonly idempotencyKey: string; readonly variantHash: `sha256:${string}` } => {
    const digest = computeRuntimeManifestDigest(["core120-learning-event.v0.1", identityDigest,
      playerSaveId, actionId, eventType, ordinal]);
    const hex = digest.slice("sha256:".length);
    return { eventId: `core120-event:${hex}`, idempotencyKey: `core120-action:${hex}`, variantHash: digest };
  };
  if (kind === "discover") {
    return [{
      ...identity("glyph_discovered", 0), eventType: "glyph_discovered", playerSaveId, wordId: word.wordId,
      sourceObjectClass: "core120_recovery_archive", locationId: `${manifest.recoveryStation.sceneId}:${manifest.recoveryStation.targetId}`,
      recognitionMode: "recovery_route",
    }];
  }
  if (kind === "attune") {
    return [{
      ...identity("glyph_attunement_completed", 0), eventType: "glyph_attunement_completed", playerSaveId, wordId: word.wordId,
      sourceObjectClass: "core120_common_inscription", catalystClass: "common_nontradeable", catalystTradeable: false,
      environmentalWitnessId: manifest.domainRoutes[word.visualDomainId].primary.targetId,
    }];
  }
  if (kind === "context_0") {
    const context = word.contexts[0];
    return [
      contextualEvent(word, context, playerSaveId, identity("grounding_trial_resolved", 0), "grounding_trial_resolved", 0),
      contextualEvent(word, context, playerSaveId, identity("active_retrieval_submitted", 1), "active_retrieval_submitted", 0),
    ];
  }
  if (kind === "context_1") {
    const context = word.contexts[1];
    return [
      contextualEvent(word, context, playerSaveId, identity("grounding_trial_resolved", 1),
        "grounding_trial_resolved", 1),
      contextualEvent(word, context, playerSaveId, identity("active_retrieval_submitted", 0),
        "active_retrieval_submitted", 1),
    ];
  }
  const context = word.contexts[1];
  return [{
    ...contextualFields(word, context, playerSaveId, identity("repair_completed", 0), 0),
    eventType: "repair_completed",
    taskId: word.misconceptionRepair.repairId,
    taskFamilyId: `core120.${word.wordId}.misconception_repair`,
    normalizedEnvironmentFingerprint: `${context.location.sceneId}:${context.location.targetId}:${word.misconceptionRepair.repairId}`,
    worldOutcomeKind: "single_cue_overreach_repaired",
    targetGraphId: `core120.${word.wordId}.misconception_graph`,
    repairedNodeId: word.misconceptionRepair.repairId,
    promptLevelAfterRepair: 0,
  }];
}

function contextualEvent(
  word: RuntimeCore120WordManifest,
  context: RuntimeCore120Context,
  playerSaveId: string,
  identity: { readonly eventId: string; readonly idempotencyKey: string; readonly variantHash: `sha256:${string}` },
  eventType: "grounding_trial_resolved" | "active_retrieval_submitted",
  promptLevel: PromptLevel,
): LearningEvidenceEvent {
  return { ...contextualFields(word, context, playerSaveId, identity, promptLevel), eventType };
}

function contextualFields(
  word: RuntimeCore120WordManifest,
  context: RuntimeCore120Context,
  playerSaveId: string,
  identity: { readonly eventId: string; readonly idempotencyKey: string; readonly variantHash: `sha256:${string}` },
  promptLevel: PromptLevel,
) {
  return {
    ...identity,
    playerSaveId,
    wordId: word.wordId,
    sourceObjectClass: "core120_world_witness",
    taskId: context.contextId,
    taskFamilyId: context.taskFamilyId,
    normalizedEnvironmentFingerprint: context.environmentFingerprint,
    promptLevel,
    interpretationStatus: "executed_legal" as const,
    worldOutcomeContribution: true,
    worldOutcomeKind: context.cueId,
    toolBypass: false,
    answerVisible: false,
    fixedSlotOnly: false,
    colorOnlyCue: false,
    semanticFacetsDemonstrated: [...word.semanticFacets],
    canonicalAstWordIds: [`word.${word.wordId}`],
    canonicalAstShape: "single_word_semantic_action",
    retrievalTarget: context.cueId,
  };
}

function failed(state: Core120CampaignState, actionId: string, reason: Core120CampaignReason): Core120CampaignActionResult {
  return { state, actionId, applied: false, duplicate: false, repairedPartialAction: false, evidenceApplied: 0, evidenceAlreadyPresent: 0, reason };
}

function sealState(body: Core120CampaignState): Core120CampaignState {
  const state = deepFreeze(body);
  verifiedStates.add(state);
  return state;
}

function assertCampaignWords(learning: LearningProgressionSnapshot, manifest: RuntimeCore120CurriculumManifest): void {
  for (const wordId of Object.keys(learning.words)) if (manifest.words[wordId] === undefined) throw new Error(`core120 campaign contains unknown word ${wordId}`);
}

function assertCampaignEvidenceIdentity(
  learning: LearningProgressionSnapshot,
  manifest: RuntimeCore120CurriculumManifest,
  playerSaveId: string,
): void {
  const byEventId = new Map<string, LearningEvidenceEvent>();
  const byIdempotencyKey = new Map<string, LearningEvidenceEvent>();
  for (const wordId of manifest.scope.wordIds) {
    const word = manifest.words[wordId]!;
    for (const kind of CORE120_ACTION_KINDS) {
      for (const identityDigest of listCore120LearningContractDigests(manifest)) {
        for (const event of materializeEvents(manifest, playerSaveId, word, kind, identityDigest)) {
          byEventId.set(event.eventId, event);
          byIdempotencyKey.set(event.idempotencyKey, event);
        }
      }
    }
  }
  const observedEventIds = new Set<string>();
  for (const progress of Object.values(learning.words)) {
    for (const entry of progress.evidence) {
      if (!entry.eventId.startsWith("core120-event:")) continue;
      const expected = byEventId.get(entry.eventId);
      const committedAtSessionSequence = entry.committedAtSessionSequence;
      if (
        expected === undefined ||
        progress.wordId !== expected.wordId ||
        (committedAtSessionSequence !== null && !nonNegativeInteger(committedAtSessionSequence)) ||
        computeRuntimeManifestDigest(entry) !== computeRuntimeManifestDigest({
          ...expectedLedgerEntry(expected),
          committedAtSessionSequence,
        })
      ) throw new Error("core120 campaign evidence identity is invalid");
      observedEventIds.add(entry.eventId);
      if (learning.processedEventPayloads[expected.idempotencyKey] !== canonicalEventPayload(expected)) throw new Error("core120 campaign evidence payload index is invalid");
    }
  }
  for (const [key, payload] of Object.entries(learning.processedEventPayloads)) {
    if (!key.startsWith("core120-action:")) continue;
    const expected = byIdempotencyKey.get(key);
    if (expected === undefined || payload !== canonicalEventPayload(expected) || !observedEventIds.has(expected.eventId)) throw new Error("core120 campaign processed action identity is invalid");
  }
}

function expectedLedgerEntry(event: LearningEvidenceEvent): EvidenceLedgerEntry {
  const contextual = event.eventType === "grounding_trial_resolved" || event.eventType === "active_retrieval_submitted" ||
    event.eventType === "noncombat_action_completed" || event.eventType === "repair_completed" ||
    event.eventType === "unseen_transfer_completed" || event.eventType === "delayed_retrieval_completed";
  if (!contextual) {
    return {
      eventId: event.eventId, eventType: event.eventType, sourceObjectClass: event.sourceObjectClass ?? null,
      taskId: null, taskFamilyId: null, variantHash: null, environmentFingerprint: null, promptLevel: null,
      canonicalAstWordIds: [], canonicalAstShape: null, interpretationStatus: null, worldOutcomeContribution: null,
      worldOutcomeKind: null, toolBypass: null, answerVisible: null, fixedSlotOnly: null, colorOnlyCue: null,
      promptLevelAfterRepair: null, unrelatedWorldEventIds: [], targetGraphId: null, repairedNodeId: null,
      retrievalTarget: null, committedAtSessionSequence: null, semanticFacetsDemonstrated: [],
    };
  }
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    sourceObjectClass: event.sourceObjectClass ?? null,
    taskId: event.taskId,
    taskFamilyId: event.taskFamilyId,
    variantHash: event.variantHash,
    environmentFingerprint: event.normalizedEnvironmentFingerprint,
    promptLevel: event.promptLevel,
    canonicalAstWordIds: [...event.canonicalAstWordIds],
    canonicalAstShape: event.canonicalAstShape ?? null,
    interpretationStatus: event.interpretationStatus,
    worldOutcomeContribution: event.worldOutcomeContribution,
    worldOutcomeKind: event.worldOutcomeKind ?? null,
    toolBypass: event.toolBypass,
    answerVisible: event.answerVisible,
    fixedSlotOnly: event.fixedSlotOnly,
    colorOnlyCue: event.colorOnlyCue,
    promptLevelAfterRepair: event.eventType === "repair_completed" ? event.promptLevelAfterRepair : null,
    unrelatedWorldEventIds: event.eventType === "delayed_retrieval_completed" ? uniqueStrings(event.unrelatedWorldEventIds) : [],
    targetGraphId: event.targetGraphId ?? null,
    repairedNodeId: event.repairedNodeId ?? null,
    retrievalTarget: event.retrievalTarget ?? null,
    committedAtSessionSequence: event.committedAtSessionSequence ?? null,
    semanticFacetsDemonstrated: uniqueStrings(event.semanticFacetsDemonstrated),
  };
}

function canonicalEventPayload(event: LearningEvidenceEvent): string {
  const { committedAtSessionSequence: _ignored, ...semantic } = event as LearningEvidenceEvent & { readonly committedAtSessionSequence?: number };
  return JSON.stringify(canonicalize(semantic));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonicalize(source[key])]));
  }
  return value;
}

function uniqueStrings(values: readonly string[]): readonly string[] { return [...new Set(values)].sort(); }

function readLearningSnapshot(value: unknown): LearningProgressionSnapshot {
  const root = record(value, "core120 learning snapshot");
  exactKeys(root, ["schema", "revision", "words", "processedEventPayloads"], "core120 learning snapshot");
  if (root.schema !== LEARNING_SAVE_SCHEMA || !nonNegativeInteger(root.revision)) throw new Error("core120 learning snapshot header is invalid");
  const words = record(root.words, "core120 learning words");
  for (const [wordId, candidate] of Object.entries(words)) validateWordProgress(wordId, candidate);
  const processed = record(root.processedEventPayloads, "core120 processed event payloads");
  if (!Object.entries(processed).every(([key, payload]) => key.length > 0 && typeof payload === "string" && payload.length > 0)) throw new Error("core120 processed event payloads are invalid");
  return structuredClone(root) as unknown as LearningProgressionSnapshot;
}

function validateWordProgress(wordId: string, candidate: unknown): void {
  const progress = record(candidate, `core120 word progress ${wordId}`);
  exactKeys(progress, ["wordId", "discoveryState", "attunementState", "learningState", "evidence", "productionTaskFamilies", "producedBaselineTaskFamilies", "producedBaselineEnvironmentFingerprints", "demonstratedSemanticFacets"], `core120 word progress ${wordId}`);
  if (progress.wordId !== wordId || !/^[a-z]+$/.test(wordId) || (progress.discoveryState !== "unknown" && progress.discoveryState !== "discovered") || (progress.attunementState !== "locked" && progress.attunementState !== "attuned") || (progress.learningState !== null && !LEARNING_STATES.has(progress.learningState as string))) throw new Error(`core120 word progress ${wordId} identity is invalid`);
  for (const key of ["productionTaskFamilies", "producedBaselineTaskFamilies", "producedBaselineEnvironmentFingerprints", "demonstratedSemanticFacets"] as const) if (!stringArray(progress[key])) throw new Error(`core120 word progress ${wordId}.${key} is invalid`);
  if (!Array.isArray(progress.evidence)) throw new Error(`core120 word progress ${wordId}.evidence is invalid`);
  for (const evidence of progress.evidence) {
    const entry = record(evidence, `core120 evidence ${wordId}`);
    if (
      typeof entry.eventId !== "string" ||
      entry.eventId.length === 0 ||
      typeof entry.eventType !== "string" ||
      !EVIDENCE_TYPES.has(entry.eventType) ||
      !stringArray(entry.canonicalAstWordIds) ||
      !stringArray(entry.unrelatedWorldEventIds) ||
      !stringArray(entry.semanticFacetsDemonstrated) ||
      (entry.committedAtSessionSequence !== null && !nonNegativeInteger(entry.committedAtSessionSequence))
    ) throw new Error(`core120 evidence ${wordId} is invalid`);
  }
}

function validPlayerSaveId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 160 && !/[\u0000-\u001f]/.test(value); }
function nonNegativeInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function stringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string"); }
function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { const keys = Object.keys(value); if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
