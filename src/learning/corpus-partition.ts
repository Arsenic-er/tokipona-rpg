import {
  LEARNING_CORPUS_ACTION_KINDS,
  isVerifiedRuntimeLearningCorpusPackage,
  type LearningCorpusActionKind,
  type RuntimeLearningCorpusAction,
  type RuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusWord,
} from "../content/runtime-learning-corpus-package.ts";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest.ts";
import {
  LEARNING_SAVE_SCHEMA,
  createLearningProgression,
  reduceLearningEvidence,
  type EvidenceLedgerEntry,
  type LearningEvidenceEvent,
  type LearningProgressionSnapshot,
} from "./progression.ts";

export const LEARNING_CORPUS_PARTITION_SAVE_SCHEMA =
  "tokipona.learning-corpus-partition.v0.1" as const;

export interface LearningCorpusPartitionState {
  readonly schema: typeof LEARNING_CORPUS_PARTITION_SAVE_SCHEMA;
  readonly corpusId: string;
  readonly corpusContentVersion: string;
  readonly corpusSemanticDigest: `sha256:${string}`;
  readonly savePartitionId: string;
  readonly playerSaveId: string;
  readonly learning: LearningProgressionSnapshot;
}

export interface LearningCorpusPartitionSave extends LearningCorpusPartitionState {
  readonly integrity: `sha256:${string}`;
}

export type LearningCorpusPartitionActionReason =
  | "applied"
  | "duplicate"
  | "unknown_action"
  | "prerequisite_missing"
  | "invalid_state"
  | "idempotency_conflict"
  | "evidence_rejected";

export interface LearningCorpusPartitionActionResult {
  readonly state: LearningCorpusPartitionState;
  readonly actionId: string;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: LearningCorpusPartitionActionReason;
}

const EVIDENCE_TYPES = new Set([
  "glyph_discovered", "glyph_attunement_completed", "grounding_trial_resolved",
  "active_retrieval_submitted", "noncombat_action_completed", "repair_completed",
  "unseen_transfer_completed", "delayed_retrieval_completed",
]);
const LEARNING_STATES = new Set(["discovered", "grounded", "produced", "stabilized"]);
const verified = new WeakSet<object>();

export function computeLearningCorpusPartitionIntegrity(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedLearningCorpusPartitionState(
  value: unknown,
): value is LearningCorpusPartitionState {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function createLearningCorpusPartitionState(
  corpus: RuntimeLearningCorpusPackage,
  playerSaveId: string,
): LearningCorpusPartitionState {
  assertVerifiedCorpus(corpus);
  assertPlayerSaveId(playerSaveId);
  return seal({
    schema: LEARNING_CORPUS_PARTITION_SAVE_SCHEMA,
    corpusId: corpus.corpusId,
    corpusContentVersion: corpus.contentVersion,
    corpusSemanticDigest: corpus.semanticDigest,
    savePartitionId: corpus.savePartitionId,
    playerSaveId,
    learning: createLearningProgression(),
  });
}

export function readLearningCorpusPartitionState(
  corpus: RuntimeLearningCorpusPackage,
  candidate: unknown,
): LearningCorpusPartitionState {
  assertVerifiedCorpus(corpus);
  const root = record(candidate, "learning corpus partition save");
  exactKeys(root, ["schema", "corpusId", "corpusContentVersion", "corpusSemanticDigest",
    "savePartitionId", "playerSaveId", "learning", "integrity"], "learning corpus partition save");
  const body = {
    schema: root.schema,
    corpusId: root.corpusId,
    corpusContentVersion: root.corpusContentVersion,
    corpusSemanticDigest: root.corpusSemanticDigest,
    savePartitionId: root.savePartitionId,
    playerSaveId: root.playerSaveId,
    learning: root.learning,
  };
  if (root.integrity !== computeLearningCorpusPartitionIntegrity(body)) {
    throw new Error("learning corpus partition integrity mismatch");
  }
  if (body.schema !== LEARNING_CORPUS_PARTITION_SAVE_SCHEMA ||
      body.corpusId !== corpus.corpusId || body.corpusContentVersion !== corpus.contentVersion ||
      body.corpusSemanticDigest !== corpus.semanticDigest ||
      body.savePartitionId !== corpus.savePartitionId) {
    throw new Error("learning corpus partition identity mismatch");
  }
  assertPlayerSaveId(body.playerSaveId);
  const learning = readLearningSnapshot(body.learning, corpus);
  assertPartitionEvidenceIdentity(learning, corpus, body.playerSaveId);
  return seal({
    schema: LEARNING_CORPUS_PARTITION_SAVE_SCHEMA,
    corpusId: corpus.corpusId,
    corpusContentVersion: corpus.contentVersion,
    corpusSemanticDigest: corpus.semanticDigest,
    savePartitionId: corpus.savePartitionId,
    playerSaveId: body.playerSaveId,
    learning,
  });
}

export function toLearningCorpusPartitionSave(
  state: LearningCorpusPartitionState,
): LearningCorpusPartitionSave {
  if (!isVerifiedLearningCorpusPartitionState(state)) {
    throw new Error("learning corpus partition state is not verified");
  }
  const body = structuredClone(state);
  return deepFreeze({ ...body, integrity: computeLearningCorpusPartitionIntegrity(body) });
}

export function applyLearningCorpusPartitionAction(
  corpus: RuntimeLearningCorpusPackage,
  state: LearningCorpusPartitionState,
  actionId: string,
): LearningCorpusPartitionActionResult {
  if (!isVerifiedRuntimeLearningCorpusPackage(corpus) ||
      !isVerifiedLearningCorpusPartitionState(state) ||
      !partitionMatchesCorpus(state, corpus)) {
    return actionFailure(state, actionId, "invalid_state");
  }
  const parsed = parseAction(corpus, actionId);
  if (parsed === null) return actionFailure(state, actionId, "unknown_action");
  if (!actionPrerequisitesSatisfied(corpus, state, parsed.word, parsed.kind)) {
    return actionFailure(state, actionId, "prerequisite_missing");
  }
  let learning = state.learning;
  let applied = 0;
  let duplicates = 0;
  for (const event of materializeActionEvents(corpus, state.playerSaveId, parsed.word, parsed.action)) {
    const reduction = reduceLearningEvidence(learning, event);
    if (reduction.applied) {
      learning = reduction.snapshot;
      applied += 1;
    } else if (reduction.duplicate && reduction.reason === "duplicate_event") {
      duplicates += 1;
    } else {
      return actionFailure(state, actionId, reduction.reason === "idempotency_conflict" ?
        "idempotency_conflict" : "evidence_rejected");
    }
  }
  if (applied === 0) {
    return { state, actionId, applied: false, duplicate: duplicates > 0, reason: "duplicate" };
  }
  return {
    state: seal({ ...state, learning }),
    actionId,
    applied: true,
    duplicate: false,
    reason: "applied",
  };
}

export function isLearningCorpusWordComplete(
  corpus: RuntimeLearningCorpusPackage,
  state: LearningCorpusPartitionState,
  wordId: string,
): boolean {
  if (!isVerifiedRuntimeLearningCorpusPackage(corpus) ||
      !isVerifiedLearningCorpusPartitionState(state) || !partitionMatchesCorpus(state, corpus) ||
      corpus.words[wordId] === undefined) return false;
  return LEARNING_CORPUS_ACTION_KINDS.every((kind) =>
    actionEvidencePresent(corpus, state, wordId, kind));
}

function parseAction(corpus: RuntimeLearningCorpusPackage, actionId: string): {
  readonly word: RuntimeLearningCorpusWord;
  readonly action: RuntimeLearningCorpusAction;
  readonly kind: LearningCorpusActionKind;
} | null {
  for (const word of Object.values(corpus.words)) {
    const action = word.actions.find((candidate) => candidate.actionId === actionId);
    if (action !== undefined) return { word, action, kind: action.kind };
  }
  return null;
}

function actionPrerequisitesSatisfied(
  corpus: RuntimeLearningCorpusPackage,
  state: LearningCorpusPartitionState,
  word: RuntimeLearningCorpusWord,
  kind: LearningCorpusActionKind,
): boolean {
  if (kind === "discover") return true;
  if (!actionEvidencePresent(corpus, state, word.wordId, "discover")) return false;
  if (kind === "attune") return true;
  if (!actionEvidencePresent(corpus, state, word.wordId, "attune")) return false;
  if (kind === "context_0" || kind === "context_1") return true;
  const progress = state.learning.words[word.wordId];
  return actionEvidencePresent(corpus, state, word.wordId, "context_0") &&
    actionEvidencePresent(corpus, state, word.wordId, "context_1") &&
    (progress?.learningState === "produced" || progress?.learningState === "stabilized");
}

function actionEvidencePresent(
  corpus: RuntimeLearningCorpusPackage,
  state: LearningCorpusPartitionState,
  wordId: string,
  kind: LearningCorpusActionKind,
): boolean {
  const word = corpus.words[wordId];
  const action = word?.actions.find((candidate) => candidate.kind === kind);
  const evidence = state.learning.words[wordId]?.evidence;
  if (word === undefined || action === undefined || evidence === undefined) return false;
  return materializeActionEvents(corpus, state.playerSaveId, word, action)
    .every((expected) => evidence.some((entry) => entry.eventId === expected.eventId));
}

function materializeActionEvents(
  corpus: RuntimeLearningCorpusPackage,
  playerSaveId: string,
  word: RuntimeLearningCorpusWord,
  action: RuntimeLearningCorpusAction,
): readonly LearningEvidenceEvent[] {
  const identity = (eventType: string, ordinal: number) => {
    const digest = computeRuntimeManifestDigest(["learning-corpus-event.v0.1", corpus.semanticDigest,
      playerSaveId, action.actionId, eventType, ordinal]);
    const hex = digest.slice("sha256:".length);
    return { eventId: `${corpus.actionNamespace}-event:${hex}`,
      idempotencyKey: `${corpus.actionNamespace}-action:${hex}`, variantHash: digest };
  };
  if (action.kind === "discover") {
    return [{ ...identity("glyph_discovered", 0), eventType: "glyph_discovered", playerSaveId,
      wordId: word.wordId, sourceObjectClass: "learning_corpus_recovery_archive",
      locationId: `${corpus.corpusId}:${word.wordId}:discovery`, recognitionMode: "recovery_route" }];
  }
  if (action.kind === "attune") {
    return [{ ...identity("glyph_attunement_completed", 0), eventType: "glyph_attunement_completed",
      playerSaveId, wordId: word.wordId, sourceObjectClass: "learning_corpus_common_inscription",
      catalystClass: "common_nontradeable", catalystTradeable: false,
      environmentalWitnessId: `${corpus.corpusId}:${word.wordId}:attunement` }];
  }
  if (action.kind === "context_0" || action.kind === "context_1") {
    const promptLevel = action.kind === "context_0" ? 0 : 1;
    return [
      { ...contextualFields(corpus, playerSaveId, word, action,
        identity("grounding_trial_resolved", 0), promptLevel),
      eventType: "grounding_trial_resolved" },
      { ...contextualFields(corpus, playerSaveId, word, action,
        identity("active_retrieval_submitted", 1), promptLevel),
      eventType: "active_retrieval_submitted" },
    ];
  }
  return [{ ...contextualFields(corpus, playerSaveId, word, action,
    identity("repair_completed", 0), 0), eventType: "repair_completed",
  promptLevelAfterRepair: 0, targetGraphId: `${corpus.actionNamespace}.${word.wordId}.misconception_graph`,
  repairedNodeId: action.actionId }];
}

function contextualFields(
  corpus: RuntimeLearningCorpusPackage,
  playerSaveId: string,
  word: RuntimeLearningCorpusWord,
  action: RuntimeLearningCorpusAction,
  identity: { readonly eventId: string; readonly idempotencyKey: string;
    readonly variantHash: `sha256:${string}` },
  promptLevel: 0 | 1,
) {
  return {
    ...identity,
    playerSaveId,
    wordId: word.wordId,
    sourceObjectClass: "learning_corpus_world_witness",
    taskId: action.actionId,
    taskFamilyId: action.taskFamilyId!,
    normalizedEnvironmentFingerprint: action.environmentFingerprint!,
    promptLevel,
    interpretationStatus: "executed_legal" as const,
    worldOutcomeContribution: true,
    worldOutcomeKind: action.actionId,
    toolBypass: false,
    answerVisible: false,
    fixedSlotOnly: false,
    colorOnlyCue: false,
    semanticFacetsDemonstrated: [...word.semanticFacets],
    canonicalAstWordIds: [`word.${word.wordId}`],
    canonicalAstShape: "single_word_semantic_action",
    retrievalTarget: action.actionId,
    corpusId: corpus.corpusId,
  };
}

function assertPartitionEvidenceIdentity(
  learning: LearningProgressionSnapshot,
  corpus: RuntimeLearningCorpusPackage,
  playerSaveId: string,
): void {
  const byEventId = new Map<string, LearningEvidenceEvent>();
  const byIdempotencyKey = new Map<string, LearningEvidenceEvent>();
  for (const word of Object.values(corpus.words)) {
    for (const action of word.actions) {
      for (const event of materializeActionEvents(corpus, playerSaveId, word, action)) {
        byEventId.set(event.eventId, event);
        byIdempotencyKey.set(event.idempotencyKey, event);
      }
    }
  }
  const observedEventIds = new Set<string>();
  for (const progress of Object.values(learning.words)) {
    for (const entry of progress.evidence) {
      const expected = byEventId.get(entry.eventId);
      const committedAtSessionSequence = entry.committedAtSessionSequence;
      if (expected === undefined || progress.wordId !== expected.wordId ||
          committedAtSessionSequence !== null && !nonNegativeInteger(committedAtSessionSequence) ||
          computeRuntimeManifestDigest(entry) !== computeRuntimeManifestDigest({
            ...expectedLedgerEntry(expected), committedAtSessionSequence,
          })) {
        throw new Error("learning corpus partition evidence identity is invalid");
      }
      observedEventIds.add(entry.eventId);
      if (learning.processedEventPayloads[expected.idempotencyKey] !== canonicalEventPayload(expected)) {
        throw new Error("learning corpus partition evidence payload index is invalid");
      }
    }
  }
  for (const [key, payload] of Object.entries(learning.processedEventPayloads)) {
    const expected = byIdempotencyKey.get(key);
    if (expected === undefined || payload !== canonicalEventPayload(expected) ||
        !observedEventIds.has(expected.eventId)) {
      throw new Error("learning corpus partition processed action identity is invalid");
    }
  }
}

function expectedLedgerEntry(event: LearningEvidenceEvent): EvidenceLedgerEntry {
  const contextual = event.eventType === "grounding_trial_resolved" ||
    event.eventType === "active_retrieval_submitted" || event.eventType === "noncombat_action_completed" ||
    event.eventType === "repair_completed" || event.eventType === "unseen_transfer_completed" ||
    event.eventType === "delayed_retrieval_completed";
  if (!contextual) {
    return { eventId: event.eventId, eventType: event.eventType,
      sourceObjectClass: event.sourceObjectClass ?? null, taskId: null, taskFamilyId: null,
      variantHash: null, environmentFingerprint: null, promptLevel: null, canonicalAstWordIds: [],
      canonicalAstShape: null, interpretationStatus: null, worldOutcomeContribution: null,
      worldOutcomeKind: null, toolBypass: null, answerVisible: null, fixedSlotOnly: null,
      colorOnlyCue: null, promptLevelAfterRepair: null, unrelatedWorldEventIds: [], targetGraphId: null,
      repairedNodeId: null, retrievalTarget: null, committedAtSessionSequence: null,
      semanticFacetsDemonstrated: [] };
  }
  return { eventId: event.eventId, eventType: event.eventType,
    sourceObjectClass: event.sourceObjectClass ?? null, taskId: event.taskId,
    taskFamilyId: event.taskFamilyId, variantHash: event.variantHash,
    environmentFingerprint: event.normalizedEnvironmentFingerprint, promptLevel: event.promptLevel,
    canonicalAstWordIds: [...event.canonicalAstWordIds], canonicalAstShape: event.canonicalAstShape ?? null,
    interpretationStatus: event.interpretationStatus,
    worldOutcomeContribution: event.worldOutcomeContribution,
    worldOutcomeKind: event.worldOutcomeKind ?? null, toolBypass: event.toolBypass,
    answerVisible: event.answerVisible, fixedSlotOnly: event.fixedSlotOnly,
    colorOnlyCue: event.colorOnlyCue,
    promptLevelAfterRepair: event.eventType === "repair_completed" ? event.promptLevelAfterRepair : null,
    unrelatedWorldEventIds: event.eventType === "delayed_retrieval_completed" ?
      uniqueStrings(event.unrelatedWorldEventIds) : [], targetGraphId: event.targetGraphId ?? null,
    repairedNodeId: event.repairedNodeId ?? null, retrievalTarget: event.retrievalTarget ?? null,
    committedAtSessionSequence: event.committedAtSessionSequence ?? null,
    semanticFacetsDemonstrated: uniqueStrings(event.semanticFacetsDemonstrated) };
}

function canonicalEventPayload(event: LearningEvidenceEvent): string {
  const { committedAtSessionSequence: _ignored, ...semantic } = event as LearningEvidenceEvent &
    { readonly committedAtSessionSequence?: number };
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

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function partitionMatchesCorpus(state: LearningCorpusPartitionState,
  corpus: RuntimeLearningCorpusPackage): boolean {
  return state.corpusId === corpus.corpusId && state.corpusContentVersion === corpus.contentVersion &&
    state.corpusSemanticDigest === corpus.semanticDigest && state.savePartitionId === corpus.savePartitionId;
}

function actionFailure(state: LearningCorpusPartitionState, actionId: string,
  reason: LearningCorpusPartitionActionReason): LearningCorpusPartitionActionResult {
  return { state, actionId, applied: false, duplicate: false, reason };
}

function readLearningSnapshot(
  value: unknown,
  corpus: RuntimeLearningCorpusPackage,
): LearningProgressionSnapshot {
  const root = record(value, "learning corpus progression");
  exactKeys(root, ["schema", "revision", "words", "processedEventPayloads"],
    "learning corpus progression");
  if (root.schema !== LEARNING_SAVE_SCHEMA || !nonNegativeInteger(root.revision)) {
    throw new Error("learning corpus progression header is invalid");
  }
  const allowedWords = new Set(corpus.wordIds);
  const words = record(root.words, "learning corpus words");
  for (const [wordId, candidate] of Object.entries(words)) {
    if (!allowedWords.has(wordId)) throw new Error(`learning corpus partition contains unknown word ${wordId}`);
    validateWordProgress(wordId, candidate, corpus.actionNamespace);
  }
  const processed = record(root.processedEventPayloads, "learning corpus processed event payloads");
  const keyPrefix = `${corpus.actionNamespace}-action:`;
  if (!Object.entries(processed).every(([key, payload]) => key.startsWith(keyPrefix) &&
      typeof payload === "string" && payload.length > 0)) {
    throw new Error("learning corpus processed event payloads are invalid");
  }
  return deepFreeze(structuredClone(root)) as unknown as LearningProgressionSnapshot;
}

function validateWordProgress(wordId: string, candidate: unknown, actionNamespace: string): void {
  const progress = record(candidate, `learning corpus word progress ${wordId}`);
  exactKeys(progress, ["wordId", "discoveryState", "attunementState", "learningState", "evidence",
    "productionTaskFamilies", "producedBaselineTaskFamilies",
    "producedBaselineEnvironmentFingerprints", "demonstratedSemanticFacets"],
  `learning corpus word progress ${wordId}`);
  if (progress.wordId !== wordId || progress.discoveryState !== "unknown" &&
      progress.discoveryState !== "discovered" || progress.attunementState !== "locked" &&
      progress.attunementState !== "attuned" || progress.learningState !== null &&
      !LEARNING_STATES.has(progress.learningState as string)) {
    throw new Error(`learning corpus word progress ${wordId} identity is invalid`);
  }
  for (const key of ["productionTaskFamilies", "producedBaselineTaskFamilies",
    "producedBaselineEnvironmentFingerprints", "demonstratedSemanticFacets"] as const) {
    if (!stringArray(progress[key])) throw new Error(`learning corpus word progress ${wordId}.${key} is invalid`);
  }
  if (!Array.isArray(progress.evidence)) throw new Error(`learning corpus word progress ${wordId}.evidence is invalid`);
  for (const candidateEvidence of progress.evidence) {
    const evidence = record(candidateEvidence, `learning corpus evidence ${wordId}`);
    if (typeof evidence.eventId !== "string" ||
        !evidence.eventId.startsWith(`${actionNamespace}-event:`) ||
        typeof evidence.eventType !== "string" || !EVIDENCE_TYPES.has(evidence.eventType) ||
        !stringArray(evidence.canonicalAstWordIds) || !stringArray(evidence.unrelatedWorldEventIds) ||
        !stringArray(evidence.semanticFacetsDemonstrated) ||
        evidence.committedAtSessionSequence !== null &&
        !nonNegativeInteger(evidence.committedAtSessionSequence)) {
      throw new Error(`learning corpus evidence ${wordId} is invalid`);
    }
  }
}

function assertVerifiedCorpus(corpus: RuntimeLearningCorpusPackage): void {
  if (!isVerifiedRuntimeLearningCorpusPackage(corpus)) {
    throw new Error("runtime learning corpus package is not verified");
  }
}
function assertPlayerSaveId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 160 || /[\u0000-\u001f]/.test(value)) {
    throw new Error("learning corpus player save ID is invalid");
  }
}
function seal(body: LearningCorpusPartitionState): LearningCorpusPartitionState {
  const result = deepFreeze(body);
  verified.add(result);
  return result;
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}
function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
