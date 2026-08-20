import {
  isVerifiedRuntimeCorpusExpansionRegistry,
  resolveRuntimeExtensionCorpusAdmission,
  type RuntimeCorpusExpansionRegistry,
} from "../content/runtime-corpus-expansion-registry.ts";
import {
  isVerifiedRuntimeLearningCorpusPackage,
  type RuntimeLearningCorpusPackage,
} from "../content/runtime-learning-corpus-package.ts";
import { validateRuntimeLearningCorpusWorldAuthorities } from
  "../content/runtime-learning-corpus-package.ts";
import type { RuntimeSceneManifestIndex } from "../content/runtime-scene-manifest.ts";
import type { LearningCorpusActionAuthorityProof } from "./corpus-action-authority.ts";
import {
  applyLearningCorpusPartitionAction,
  createLearningCorpusPartitionState,
  readLearningCorpusPartitionState,
  toLearningCorpusPartitionSave,
  type LearningCorpusPartitionActionReason,
  type LearningCorpusPartitionSave,
  type LearningCorpusPartitionState,
} from "./corpus-partition.ts";
import { computeRuntimeManifestDigest } from "../content/runtime-manifest-digest.ts";

export const LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA =
  "tokipona.learning-corpus-partition-collection.v0.1" as const;

export interface LearningCorpusPartitionCollectionState {
  readonly schema: typeof LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA;
  readonly registryId: "post-pu120.csp-expansion";
  readonly playerSaveId: string;
  readonly admittedCorpusIds: readonly string[];
  readonly partitions: readonly LearningCorpusPartitionState[];
}

export interface LearningCorpusPartitionCollectionSave {
  readonly schema: typeof LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA;
  readonly registryId: "post-pu120.csp-expansion";
  readonly playerSaveId: string;
  readonly admittedCorpusIds: readonly string[];
  readonly partitions: readonly LearningCorpusPartitionSave[];
  readonly integrity: `sha256:${string}`;
}

export interface RuntimeLearningCorpusSet {
  readonly registry: RuntimeCorpusExpansionRegistry;
  readonly packages: readonly RuntimeLearningCorpusPackage[];
  readonly scenes: RuntimeSceneManifestIndex;
}

export type LearningCorpusCollectionActionReason =
  | LearningCorpusPartitionActionReason
  | "unknown_corpus";

export interface LearningCorpusCollectionActionResult {
  readonly state: LearningCorpusPartitionCollectionState;
  readonly corpusId: string;
  readonly actionId: string;
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly reason: LearningCorpusCollectionActionReason;
}

const verified = new WeakSet<object>();

export function computeLearningCorpusPartitionCollectionIntegrity(
  payload: unknown,
): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function isVerifiedLearningCorpusPartitionCollectionState(
  value: unknown,
): value is LearningCorpusPartitionCollectionState {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function verifyRuntimeLearningCorpusSet(
  registry: RuntimeCorpusExpansionRegistry,
  packages: readonly RuntimeLearningCorpusPackage[],
  scenes: RuntimeSceneManifestIndex,
): RuntimeLearningCorpusSet {
  const ordered = exactRuntimePackages(registry, packages);
  ordered.forEach((pkg) => validateRuntimeLearningCorpusWorldAuthorities(pkg, scenes));
  return deepFreeze({ registry, packages: ordered, scenes });
}

export function createLearningCorpusPartitionCollectionState(
  runtime: RuntimeLearningCorpusSet,
  playerSaveId: string,
): LearningCorpusPartitionCollectionState {
  assertPlayerSaveId(playerSaveId);
  const packages = exactRuntimePackages(runtime.registry, runtime.packages);
  return seal({
    schema: LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA,
    registryId: runtime.registry.registryId,
    playerSaveId,
    admittedCorpusIds: [...runtime.registry.admittedCorpusIds],
    partitions: packages.map((pkg) => createLearningCorpusPartitionState(pkg, playerSaveId)),
  });
}

export function readLearningCorpusPartitionCollectionState(
  runtime: RuntimeLearningCorpusSet,
  candidate: unknown,
): LearningCorpusPartitionCollectionState {
  const packages = exactRuntimePackages(runtime.registry, runtime.packages);
  const parsed = readCollectionSave(candidate);
  if (parsed.registryId !== runtime.registry.registryId ||
      !same(parsed.admittedCorpusIds, runtime.registry.admittedCorpusIds) ||
      parsed.partitions.length !== packages.length) {
    throw new Error("learning corpus partition collection does not cover the admitted registry");
  }
  const partitions = packages.map((pkg, index) => {
    const partition = readLearningCorpusPartitionState(pkg, parsed.partitions[index]);
    if (partition.playerSaveId !== parsed.playerSaveId) {
      throw new Error("learning corpus partition collection player identity mismatch");
    }
    return partition;
  });
  return seal({
    schema: LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA,
    registryId: runtime.registry.registryId,
    playerSaveId: parsed.playerSaveId,
    admittedCorpusIds: [...runtime.registry.admittedCorpusIds],
    partitions,
  });
}

/**
 * Reconciles a durable collection with the current contiguous admitted prefix.
 * Existing semantic partitions must remain valid; only newly admitted suffix
 * partitions may be created. Removing, reordering, or silently replacing an
 * admitted corpus fails closed.
 */
export function reconcileLearningCorpusPartitionCollectionState(
  runtime: RuntimeLearningCorpusSet,
  candidate: unknown | null,
  playerSaveId: string,
): LearningCorpusPartitionCollectionState {
  assertPlayerSaveId(playerSaveId);
  const packages = exactRuntimePackages(runtime.registry, runtime.packages);
  if (candidate === null) return createLearningCorpusPartitionCollectionState(runtime, playerSaveId);
  const parsed = readCollectionSave(candidate);
  if (parsed.registryId !== runtime.registry.registryId || parsed.playerSaveId !== playerSaveId ||
      parsed.admittedCorpusIds.length > runtime.registry.admittedCorpusIds.length ||
      !parsed.admittedCorpusIds.every((corpusId, index) =>
        corpusId === runtime.registry.admittedCorpusIds[index]) ||
      parsed.partitions.length !== parsed.admittedCorpusIds.length) {
    throw new Error("learning corpus partition collection cannot be reconciled");
  }
  const partitions = packages.map((pkg, index) => {
    if (index >= parsed.partitions.length) {
      return createLearningCorpusPartitionState(pkg, playerSaveId);
    }
    const partition = readLearningCorpusPartitionState(pkg, parsed.partitions[index]);
    if (partition.playerSaveId !== playerSaveId) {
      throw new Error("learning corpus partition collection player identity mismatch");
    }
    return partition;
  });
  return seal({
    schema: LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA,
    registryId: runtime.registry.registryId,
    playerSaveId,
    admittedCorpusIds: [...runtime.registry.admittedCorpusIds],
    partitions,
  });
}

export function toLearningCorpusPartitionCollectionSave(
  state: LearningCorpusPartitionCollectionState,
): LearningCorpusPartitionCollectionSave {
  if (!isVerifiedLearningCorpusPartitionCollectionState(state)) {
    throw new Error("learning corpus partition collection state is not verified");
  }
  const body = {
    schema: state.schema,
    registryId: state.registryId,
    playerSaveId: state.playerSaveId,
    admittedCorpusIds: [...state.admittedCorpusIds],
    partitions: state.partitions.map(toLearningCorpusPartitionSave),
  };
  return deepFreeze({ ...body, integrity: computeLearningCorpusPartitionCollectionIntegrity(body) });
}

export function applyLearningCorpusCollectionAction(
  runtime: RuntimeLearningCorpusSet,
  state: LearningCorpusPartitionCollectionState,
  corpusId: string,
  actionId: string,
  authorityProof: LearningCorpusActionAuthorityProof,
): LearningCorpusCollectionActionResult {
  const packages = exactRuntimePackages(runtime.registry, runtime.packages);
  if (!isVerifiedLearningCorpusPartitionCollectionState(state) ||
      !collectionMatchesRuntime(state, runtime, packages)) {
    return actionFailure(state, corpusId, actionId, "invalid_state");
  }
  const index = runtime.registry.admittedCorpusIds.indexOf(corpusId);
  if (index < 0) return actionFailure(state, corpusId, actionId, "unknown_corpus");
  const pkg = packages[index];
  const partition = state.partitions[index];
  if (pkg === undefined || partition === undefined) {
    return actionFailure(state, corpusId, actionId, "invalid_state");
  }
  const result = applyLearningCorpusPartitionAction(pkg, partition, actionId, authorityProof);
  if (!result.applied) {
    return {
      state,
      corpusId,
      actionId,
      applied: false,
      duplicate: result.duplicate,
      reason: result.reason,
    };
  }
  const partitions = state.partitions.map((candidate, candidateIndex) =>
    candidateIndex === index ? result.state : candidate);
  return {
    state: seal({ ...state, partitions }),
    corpusId,
    actionId,
    applied: true,
    duplicate: false,
    reason: "applied",
  };
}

export function resolveLearningCorpusPartitionState(
  state: LearningCorpusPartitionCollectionState,
  corpusId: string,
): LearningCorpusPartitionState | null {
  if (!isVerifiedLearningCorpusPartitionCollectionState(state)) return null;
  const index = state.admittedCorpusIds.indexOf(corpusId);
  return index < 0 ? null : state.partitions[index] ?? null;
}

function exactRuntimePackages(
  registry: RuntimeCorpusExpansionRegistry,
  packages: readonly RuntimeLearningCorpusPackage[],
): readonly RuntimeLearningCorpusPackage[] {
  if (!isVerifiedRuntimeCorpusExpansionRegistry(registry)) {
    throw new Error("learning corpus partition collection registry is not verified");
  }
  if (packages.length !== registry.admittedCorpusIds.length ||
      !packages.every(isVerifiedRuntimeLearningCorpusPackage) ||
      !packages.every((pkg, index) => pkg.corpusId === registry.admittedCorpusIds[index]) ||
      new Set(packages.map((pkg) => pkg.corpusId)).size !== packages.length) {
    throw new Error("learning corpus runtime packages do not exactly cover the admitted registry");
  }
  packages.forEach((pkg) => {
    const contract = resolveRuntimeExtensionCorpusAdmission(registry, pkg.corpusId);
    const phase = registry.phases.find((candidate) =>
      candidate.status === "admitted" && candidate.admissionContract.corpusId === pkg.corpusId);
    if (phase?.status !== "admitted" || pkg.phaseId !== phase.phaseId ||
        pkg.contentVersion !== contract.contentVersion ||
        pkg.actionNamespace !== contract.actionNamespace ||
        pkg.savePartitionId !== contract.savePartitionId ||
        pkg.saveSchemaVersion !== contract.saveSchemaVersion ||
        pkg.sourceDigest !== contract.packageDigest || pkg.semanticDigest !== contract.semanticDigest ||
        !same(pkg.wordIds, contract.wordIds) ||
        pkg.reviewReceiptIds.semantic !== contract.reviewReceiptIds.semantic ||
        pkg.reviewReceiptIds.glyph !== contract.reviewReceiptIds.glyph) {
      throw new Error(`learning corpus package ${pkg.corpusId} does not match the active registry`);
    }
  });
  return Object.freeze([...packages]);
}

function collectionMatchesRuntime(
  state: LearningCorpusPartitionCollectionState,
  runtime: RuntimeLearningCorpusSet,
  packages: readonly RuntimeLearningCorpusPackage[],
): boolean {
  return state.registryId === runtime.registry.registryId &&
    same(state.admittedCorpusIds, runtime.registry.admittedCorpusIds) &&
    state.partitions.length === packages.length &&
    state.partitions.every((partition, index) => {
      const pkg = packages[index];
      return pkg !== undefined && partition.corpusId === pkg.corpusId &&
        partition.corpusContentVersion === pkg.contentVersion &&
        partition.corpusSemanticDigest === pkg.semanticDigest &&
        partition.savePartitionId === pkg.savePartitionId &&
        partition.playerSaveId === state.playerSaveId;
    });
}

function readCollectionSave(candidate: unknown): LearningCorpusPartitionCollectionSave {
  const root = record(candidate, "learning corpus partition collection save");
  exactKeys(root, ["schema", "registryId", "playerSaveId", "admittedCorpusIds", "partitions",
    "integrity"], "learning corpus partition collection save");
  const body = {
    schema: root.schema,
    registryId: root.registryId,
    playerSaveId: root.playerSaveId,
    admittedCorpusIds: root.admittedCorpusIds,
    partitions: root.partitions,
  };
  if (root.integrity !== computeLearningCorpusPartitionCollectionIntegrity(body)) {
    throw new Error("learning corpus partition collection integrity mismatch");
  }
  if (body.schema !== LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA ||
      body.registryId !== "post-pu120.csp-expansion") {
    throw new Error("learning corpus partition collection identity mismatch");
  }
  assertPlayerSaveId(body.playerSaveId);
  const admittedCorpusIds = uniqueStrings(body.admittedCorpusIds, "admitted corpus IDs", true);
  if (!Array.isArray(body.partitions) || body.partitions.length !== admittedCorpusIds.length) {
    throw new Error("learning corpus partition collection partitions are incomplete");
  }
  return deepFreeze({
    schema: LEARNING_CORPUS_PARTITION_COLLECTION_SAVE_SCHEMA,
    registryId: "post-pu120.csp-expansion",
    playerSaveId: body.playerSaveId,
    admittedCorpusIds,
    partitions: structuredClone(body.partitions) as LearningCorpusPartitionSave[],
    integrity: root.integrity as `sha256:${string}`,
  });
}

function actionFailure(
  state: LearningCorpusPartitionCollectionState,
  corpusId: string,
  actionId: string,
  reason: LearningCorpusCollectionActionReason,
): LearningCorpusCollectionActionResult {
  return { state, corpusId, actionId, applied: false, duplicate: false, reason };
}

function seal(
  state: LearningCorpusPartitionCollectionState,
): LearningCorpusPartitionCollectionState {
  // Preserve the partition objects themselves: their module-local WeakSet is
  // the proof that each nested state passed the strict corpus reader/reducer.
  // A structured clone here would silently erase that authority brand.
  const result = deepFreeze({
    ...state,
    admittedCorpusIds: [...state.admittedCorpusIds],
    partitions: [...state.partitions],
  });
  verified.add(result);
  return result;
}

function assertPlayerSaveId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("learning corpus partition collection playerSaveId is required");
  }
}

function uniqueStrings(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) ||
      !value.every((entry) => typeof entry === "string" && entry.trim().length > 0) ||
      new Set(value).size !== value.length) {
    throw new Error(`${label} must be a unique string array`);
  }
  return [...value] as string[];
}

function same(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && value.every((entry, index) => entry === expected[index]);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || new Set(keys).size !== keys.length ||
      !expected.every((key) => keys.includes(key))) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
