import {
  CORPUS_EXPANSION_PHASE_IDS,
  isVerifiedRuntimeCorpusExpansionRegistry,
  resolveRuntimeExtensionCorpusAdmission,
  type CorpusExpansionPhaseId,
  type RuntimeCorpusExpansionRegistry,
} from "./runtime-corpus-expansion-registry.ts";
import { computeRuntimeManifestDigest } from "./runtime-manifest-digest.ts";
import type { RuntimeSceneManifestIndex } from "./runtime-scene-manifest.ts";

export const LEARNING_CORPUS_ACTION_KINDS = [
  "discover", "attune", "context_0", "context_1", "repair",
] as const;

export type LearningCorpusActionKind = (typeof LEARNING_CORPUS_ACTION_KINDS)[number];
export type LearningCorpusEvidenceType =
  | "glyph_discovered"
  | "glyph_attunement_completed"
  | "active_retrieval_submitted"
  | "repair_completed";

export interface RuntimeLearningCorpusWorldAuthority {
  readonly sceneId: string;
  readonly targetId: string;
  readonly interactionId: string;
  readonly sourceObjectClass: string;
  readonly interactionPointPx: Readonly<{ readonly x: number; readonly y: number }>;
  readonly maximumDistancePx: 16;
}

export interface RuntimeLearningCorpusAction {
  readonly kind: LearningCorpusActionKind;
  readonly actionId: string;
  readonly evidenceType: LearningCorpusEvidenceType;
  readonly taskFamilyId: string | null;
  readonly environmentFingerprint: string | null;
  readonly promptLevel: 0 | 1 | null;
  readonly semanticFacets: readonly string[];
  readonly worldAuthority: RuntimeLearningCorpusWorldAuthority;
}

export interface RuntimeLearningCorpusWord {
  readonly wordId: string;
  readonly targetState: "produced";
  readonly semanticFacets: readonly string[];
  readonly actions: readonly RuntimeLearningCorpusAction[];
  readonly assetBindings: Readonly<{
    readonly pronunciationAssetId: string;
    readonly glyphAssetId: string;
  }>;
}

export interface RuntimeLearningCorpusPackage {
  readonly schemaVersion: "tokipona.runtime-learning-corpus.v0.2";
  readonly sourceDigest: `sha256:${string}`;
  readonly semanticDigest: `sha256:${string}`;
  readonly phaseId: CorpusExpansionPhaseId;
  readonly corpusId: string;
  readonly contentVersion: string;
  readonly actionNamespace: string;
  readonly savePartitionId: string;
  readonly saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2";
  readonly canonicalWordKey: "latin_word_id";
  readonly wordIds: readonly string[];
  readonly words: Readonly<Record<string, RuntimeLearningCorpusWord>>;
  readonly reviewReceiptIds: Readonly<{
    readonly semantic: string;
    readonly pronunciation: string;
    readonly glyph: string;
  }>;
}

const EXPECTED_EVIDENCE_TYPES: Readonly<Record<LearningCorpusActionKind, LearningCorpusEvidenceType>> = {
  discover: "glyph_discovered",
  attune: "glyph_attunement_completed",
  context_0: "active_retrieval_submitted",
  context_1: "active_retrieval_submitted",
  repair: "repair_completed",
};
const verified = new WeakSet<object>();

export function computeRuntimeLearningCorpusPackageDigest(payload: unknown): `sha256:${string}` {
  return computeRuntimeManifestDigest(payload);
}

export function computeRuntimeLearningCorpusSemanticDigest(
  source: Pick<RuntimeLearningCorpusPackage, "schemaVersion" | "phaseId" | "corpusId" |
    "contentVersion" | "actionNamespace" | "savePartitionId" | "saveSchemaVersion" |
    "canonicalWordKey" | "wordIds" | "words">,
): `sha256:${string}` {
  const words = Object.fromEntries(source.wordIds.map((wordId) => {
    const word = source.words[wordId];
    if (word === undefined) throw new Error(`learning corpus semantic word ${wordId} is missing`);
    return [wordId, {
      wordId: word.wordId,
      targetState: word.targetState,
      semanticFacets: word.semanticFacets,
      actions: word.actions,
    }];
  }));
  return computeRuntimeManifestDigest({
    schemaVersion: source.schemaVersion,
    phaseId: source.phaseId,
    corpusId: source.corpusId,
    contentVersion: source.contentVersion,
    actionNamespace: source.actionNamespace,
    savePartitionId: source.savePartitionId,
    saveSchemaVersion: source.saveSchemaVersion,
    canonicalWordKey: source.canonicalWordKey,
    wordIds: source.wordIds,
    words,
  });
}

export function learningCorpusAuthorityFingerprint(
  authority: RuntimeLearningCorpusWorldAuthority,
): string {
  return `${authority.sceneId}|${authority.targetId}|${authority.interactionId}`;
}

/**
 * Cross-references every reviewed action site with the verified generated
 * scene graph. A signed package may name only a real, positioned interaction;
 * action IDs alone never create world authority.
 */
export function validateRuntimeLearningCorpusWorldAuthorities(
  pkg: RuntimeLearningCorpusPackage,
  scenes: RuntimeSceneManifestIndex,
): void {
  for (const word of Object.values(pkg.words)) {
    for (const action of word.actions) {
      const authority = action.worldAuthority;
      const scene = scenes.byId[authority.sceneId];
      const target = scene?.targets.find((candidate) => candidate.id === authority.targetId);
      const interaction = scene?.interactions.find((candidate) =>
        candidate.id === authority.interactionId);
      if (!scene || !target || !target.interactionPointTiles || !interaction ||
          interaction.targetId !== target.id || target.kind !== authority.sourceObjectClass ||
          authority.maximumDistancePx !== scene.tileSizePx ||
          !authorityPointMatchesTarget(authority, target.interactionPointTiles, scene) ||
          interaction.optionalWordId !== null && interaction.optionalWordId !== `word.${word.wordId}`) {
        throw new Error(`learning corpus action ${action.actionId} world authority is invalid`);
      }
      const contextual = action.kind === "context_0" || action.kind === "context_1" ||
        action.kind === "repair";
      if (contextual && action.environmentFingerprint !== learningCorpusAuthorityFingerprint(authority)) {
        throw new Error(`learning corpus action ${action.actionId} environment authority is invalid`);
      }
    }
  }
}

function authorityPointMatchesTarget(
  authority: RuntimeLearningCorpusWorldAuthority,
  tiles: readonly [number, number],
  scene: RuntimeSceneManifestIndex["byId"][string],
): boolean {
  const candidates = [
    { x: tiles[0] * scene.tileSizePx,
      y: (scene.sizeTiles.height - 1 - tiles[1]) * scene.tileSizePx },
    { x: tiles[0] * scene.tileSizePx + scene.tileSizePx / 2,
      y: tiles[1] * scene.tileSizePx + scene.tileSizePx / 2 },
  ];
  return authority.interactionPointPx.x >= 0 && authority.interactionPointPx.y >= 0 &&
    authority.interactionPointPx.x < scene.sizeTiles.width * scene.tileSizePx &&
    authority.interactionPointPx.y < scene.sizeTiles.height * scene.tileSizePx &&
    candidates.some((candidate) => Math.hypot(
      candidate.x - authority.interactionPointPx.x,
      candidate.y - authority.interactionPointPx.y,
    ) <= authority.maximumDistancePx);
}

export function isVerifiedRuntimeLearningCorpusPackage(
  value: unknown,
): value is RuntimeLearningCorpusPackage {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeLearningCorpusPackage(
  registry: RuntimeCorpusExpansionRegistry,
  candidate: unknown,
): RuntimeLearningCorpusPackage {
  if (!isVerifiedRuntimeCorpusExpansionRegistry(registry)) {
    throw new Error("corpus expansion registry is not verified");
  }
  const parsed = readRuntimeLearningCorpusPackageCandidate(candidate);
  const contract = resolveRuntimeExtensionCorpusAdmission(registry, parsed.corpusId);
  if (parsed.phaseId !== registry.phases.find((phase) =>
    phase.status === "admitted" && phase.admissionContract.corpusId === parsed.corpusId)?.phaseId ||
      parsed.contentVersion !== contract.contentVersion ||
      parsed.actionNamespace !== contract.actionNamespace ||
      parsed.savePartitionId !== contract.savePartitionId ||
      parsed.saveSchemaVersion !== contract.saveSchemaVersion ||
      parsed.sourceDigest !== contract.packageDigest || parsed.semanticDigest !== contract.semanticDigest ||
      !same(parsed.wordIds, contract.wordIds) ||
      !sameReviewReceipts(parsed.reviewReceiptIds, contract.reviewReceiptIds)) {
    throw new Error("learning corpus package does not match its admitted contract");
  }
  verified.add(parsed);
  return parsed;
}

/**
 * Strictly parses and verifies a signed package without granting runtime admission.
 * Content compilation uses this boundary before an admission registry exists; only
 * readRuntimeLearningCorpusPackage may add the runtime verification brand.
 */
export function readRuntimeLearningCorpusPackageCandidate(
  candidate: unknown,
): RuntimeLearningCorpusPackage {
  const raw = record(candidate, "runtime learning corpus package");
  exactKeys(raw, ["schemaVersion", "sourceDigest", "semanticDigest", "phaseId", "corpusId",
    "contentVersion", "actionNamespace", "savePartitionId", "saveSchemaVersion", "canonicalWordKey",
    "wordIds", "words", "reviewReceiptIds"], "runtime learning corpus package");
  const sourceDigest = digest(raw.sourceDigest, "learning corpus sourceDigest");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeLearningCorpusPackageDigest(payload) !== sourceDigest) {
    throw new Error("learning corpus package digest mismatch");
  }
  if (raw.schemaVersion !== "tokipona.runtime-learning-corpus.v0.2" ||
      raw.saveSchemaVersion !== "tokipona.learning-corpus-partition.v0.2" ||
      raw.canonicalWordKey !== "latin_word_id") {
    throw new Error("learning corpus package schema is invalid");
  }
  if (typeof raw.phaseId !== "string" ||
      !CORPUS_EXPANSION_PHASE_IDS.includes(raw.phaseId as CorpusExpansionPhaseId)) {
    throw new Error("learning corpus phaseId is invalid");
  }
  const corpusId = string(raw.corpusId, "learning corpus corpusId");
  const wordIds = canonicalWordIds(raw.wordIds, "learning corpus wordIds");
  const wordsRaw = record(raw.words, "learning corpus words");
  if (!sameSet(Object.keys(wordsRaw), wordIds)) throw new Error("learning corpus words do not match word IDs");
  const words = Object.fromEntries(wordIds.map((wordId) => [wordId,
    readWord(wordsRaw[wordId], wordId, string(raw.actionNamespace, "learning corpus actionNamespace"))]));
  const receipts = readReviewReceipts(raw.reviewReceiptIds, "learning corpus review receipts");
  const semanticSource = {
    schemaVersion: "tokipona.runtime-learning-corpus.v0.2" as const,
    phaseId: raw.phaseId as CorpusExpansionPhaseId,
    corpusId,
    contentVersion: string(raw.contentVersion, "learning corpus contentVersion"),
    actionNamespace: string(raw.actionNamespace, "learning corpus actionNamespace"),
    savePartitionId: string(raw.savePartitionId, "learning corpus savePartitionId"),
    saveSchemaVersion: "tokipona.learning-corpus-partition.v0.2" as const,
    canonicalWordKey: "latin_word_id" as const,
    wordIds,
    words,
  };
  const semanticDigest = digest(raw.semanticDigest, "learning corpus semanticDigest");
  if (computeRuntimeLearningCorpusSemanticDigest(semanticSource) !== semanticDigest) {
    throw new Error("learning corpus semantic digest mismatch");
  }
  const result = deepFreeze({ sourceDigest, semanticDigest, ...semanticSource,
    reviewReceiptIds: receipts }) as RuntimeLearningCorpusPackage;
  return result;
}

function readWord(value: unknown, wordId: string, namespace: string): RuntimeLearningCorpusWord {
  const word = record(value, `learning corpus word ${wordId}`);
  exactKeys(word, ["wordId", "targetState", "semanticFacets", "actions", "assetBindings"],
    `learning corpus word ${wordId}`);
  const semanticFacets = uniqueStrings(word.semanticFacets, `${wordId}.semanticFacets`);
  if (word.wordId !== wordId || word.targetState !== "produced") {
    throw new Error(`learning corpus word ${wordId} identity is invalid`);
  }
  if (!Array.isArray(word.actions) || word.actions.length !== LEARNING_CORPUS_ACTION_KINDS.length) {
    throw new Error(`learning corpus word ${wordId} actions are invalid`);
  }
  const actions = word.actions.map((candidate, index) => {
    const action = record(candidate, `${wordId}.actions[${index}]`);
    exactKeys(action, ["kind", "actionId", "evidenceType", "taskFamilyId",
      "environmentFingerprint", "promptLevel", "semanticFacets", "worldAuthority"],
    `${wordId}.actions[${index}]`);
    const kind = LEARNING_CORPUS_ACTION_KINDS[index]!;
    const actionFacets = uniqueStrings(action.semanticFacets, `${wordId}.${kind}.semanticFacets`, true);
    const contextual = kind === "context_0" || kind === "context_1" || kind === "repair";
    const worldAuthority = readWorldAuthority(action.worldAuthority, `${wordId}.${kind}.worldAuthority`);
    if (action.kind !== kind || action.actionId !== `${namespace}.${wordId}.${kind}` ||
        action.evidenceType !== EXPECTED_EVIDENCE_TYPES[kind] ||
        (contextual ? typeof action.taskFamilyId !== "string" || action.taskFamilyId.length === 0 :
          action.taskFamilyId !== null) ||
        (contextual ? typeof action.environmentFingerprint !== "string" ||
          action.environmentFingerprint.length === 0 : action.environmentFingerprint !== null) ||
        (kind === "context_0" ? action.promptLevel !== 0 :
          kind === "context_1" || kind === "repair" ? action.promptLevel !== 1 :
            action.promptLevel !== null) ||
        (contextual ? !sameSet(actionFacets, semanticFacets) : actionFacets.length !== 0)) {
      throw new Error(`learning corpus word ${wordId} action ${kind} is invalid`);
    }
    return Object.freeze({ ...action, semanticFacets: Object.freeze(actionFacets), worldAuthority }) as
      unknown as RuntimeLearningCorpusAction;
  });
  if (actions[2]!.taskFamilyId === actions[3]!.taskFamilyId ||
      actions[2]!.environmentFingerprint === actions[3]!.environmentFingerprint) {
    throw new Error(`learning corpus word ${wordId} contexts must be distinct`);
  }
  const assets = record(word.assetBindings, `${wordId}.assetBindings`);
  exactKeys(assets, ["pronunciationAssetId", "glyphAssetId"], `${wordId}.assetBindings`);
  const pronunciationAssetId = string(assets.pronunciationAssetId, `${wordId}.pronunciationAssetId`);
  const glyphAssetId = string(assets.glyphAssetId, `${wordId}.glyphAssetId`);
  if (!pronunciationAssetId.startsWith(`audio.pronunciation.${wordId}.`) ||
      !glyphAssetId.startsWith(`glyph.${namespace}.${wordId}.`)) {
    throw new Error(`learning corpus word ${wordId} asset bindings are invalid`);
  }
  return Object.freeze({ wordId, targetState: "produced", semanticFacets: Object.freeze(semanticFacets),
    actions: Object.freeze(actions), assetBindings: Object.freeze({ pronunciationAssetId, glyphAssetId }) });
}

function readWorldAuthority(value: unknown, label: string): RuntimeLearningCorpusWorldAuthority {
  const authority = record(value, label);
  exactKeys(authority, ["sceneId", "targetId", "interactionId", "sourceObjectClass",
    "interactionPointPx", "maximumDistancePx"], label);
  if (authority.maximumDistancePx !== 16) throw new Error(`${label}.maximumDistancePx must equal 16`);
  const point = record(authority.interactionPointPx, `${label}.interactionPointPx`);
  exactKeys(point, ["x", "y"], `${label}.interactionPointPx`);
  if (!Number.isSafeInteger(point.x) || (point.x as number) < 0 ||
      !Number.isSafeInteger(point.y) || (point.y as number) < 0) {
    throw new Error(`${label}.interactionPointPx must contain non-negative safe integers`);
  }
  return Object.freeze({
    sceneId: string(authority.sceneId, `${label}.sceneId`),
    targetId: string(authority.targetId, `${label}.targetId`),
    interactionId: string(authority.interactionId, `${label}.interactionId`),
    sourceObjectClass: string(authority.sourceObjectClass, `${label}.sourceObjectClass`),
    interactionPointPx: Object.freeze({ x: point.x as number, y: point.y as number }),
    maximumDistancePx: 16,
  });
}

function readReviewReceipts(value: unknown, label: string): RuntimeLearningCorpusPackage["reviewReceiptIds"] {
  const receipts = record(value, label);
  exactKeys(receipts, ["semantic", "pronunciation", "glyph"], label);
  const result = {
    semantic: string(receipts.semantic, `${label}.semantic`),
    pronunciation: string(receipts.pronunciation, `${label}.pronunciation`),
    glyph: string(receipts.glyph, `${label}.glyph`),
  };
  if (new Set(Object.values(result)).size !== 3) throw new Error(`${label} must be distinct`);
  return Object.freeze(result);
}

function sameReviewReceipts(left: RuntimeLearningCorpusPackage["reviewReceiptIds"],
  right: RuntimeLearningCorpusPackage["reviewReceiptIds"]): boolean {
  return left.semantic === right.semantic && left.pronunciation === right.pronunciation &&
    left.glyph === right.glyph;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty`);
  return value;
}
function digest(value: unknown, label: string): `sha256:${string}` {
  const result = string(value, label);
  if (!/^sha256:[0-9a-f]{64}$/.test(result)) throw new Error(`${label} must be sha256`);
  return result as `sha256:${string}`;
}
function canonicalWordIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 ||
      !value.every((entry) => typeof entry === "string" && /^[a-z]+$/.test(entry)) ||
      new Set(value).size !== value.length) throw new Error(`${label} must be unique canonical Latin word IDs`);
  return [...value] as string[];
}
function uniqueStrings(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) ||
      !value.every((entry) => typeof entry === "string" && entry.length > 0) ||
      new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`);
  return [...value] as string[];
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (!sameSet(Object.keys(value), expected)) throw new Error(`${label} contains unknown or missing fields`);
}
function same(value: unknown, expected: readonly unknown[]): boolean {
  return Array.isArray(value) && value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}
function sameSet(value: readonly string[], expected: readonly string[]): boolean {
  return value.length === expected.length && new Set(value).size === value.length &&
    expected.every((entry) => value.includes(entry));
}
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
