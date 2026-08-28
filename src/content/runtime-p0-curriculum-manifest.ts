import { P0_WORD_IDS, type P0WordId } from "../learning/progression";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import { readRuntimeSpeechlessAudioPolicy, type RuntimeSpeechlessAudioPolicy } from
  "./runtime-speechless-audio-policy";
import {
  FOREST_CHAPTER_ACTIVE_WORD_IDS,
  type ForestChapterActiveWordIds,
} from "./forest-chapter-contract";

export type RuntimeP0TargetState = "attuned" | "grounded" | "produced";

export interface RuntimeP0WordManifest {
  readonly wordId: P0WordId;
  readonly firstLocation: string;
  readonly witness: string;
  readonly groundingTask: string;
  readonly targetState: RuntimeP0TargetState;
  readonly semanticFacets: readonly [string, string];
  readonly misconceptionToRepair: string;
  readonly productionTaskFamilies: readonly string[];
  readonly meditation: Readonly<{
    recognitionDistractors: readonly string[];
    contextContrast: readonly [string, string];
  }>;
}

export interface RuntimeP0CurriculumManifest {
  readonly sourceDigest: `sha256:${string}`;
  readonly sourcePath: "data/language/p0-curriculum.v0.1.yaml";
  readonly contentVersion: "prologue-12.vertical-slice.1";
  readonly progressionSourcePath: "data/language/learning-progression.v0.2.yaml";
  readonly glyphCatalogSourcePath: "data/language/pu-120-glyph-catalog.v0.2.json";
  readonly scope: Readonly<{
    band: "P0";
    uniqueWordCount: 12;
    wordIds: readonly P0WordId[];
    firstThreeHoursIsContentBudgetNotRealTimeGate: true;
  }>;
  readonly firstChapterActiveMasteryWordIds: ForestChapterActiveWordIds;
  readonly firstChapterStructureParticleIds: readonly ["o", "li", "e"];
  readonly additionalReceptiveWordIds: readonly ["word.awen", "word.kasi", "word.kiwen", "word.kon", "word.lukin", "word.seli", "word.soweli", "word.weka"];
  readonly firstChapterCompletionRequiresAllP0Words: false;
  readonly targetStateCeiling: Readonly<{
    produced: readonly ["telo", "tawa", "lili", "suli"];
    grounded: readonly ["seli", "kiwen", "awen"];
    attuned: readonly ["kon", "kasi", "lukin", "weka", "soweli"];
  }>;
  readonly activationMedium: Readonly<{
    itemId: "learning.common_inscription_medium";
    scarcity: "common";
    tradeable: false;
    randomDropRequired: false;
    consumedOnFailedOrInterruptedActivation: false;
  }>;
  readonly recoveryStation: Readonly<{
    sceneId: "scene.valley.settlement";
    targetId: "settlement.p0_inscription_archive";
    interactionId: "settlement.open_p0_inscription_archive";
    interactionPointTiles: readonly [38, 28];
    maximumDistancePx: 16;
    recoveryRouteOnlyWhenBelowTarget: true;
  }>;
  readonly words: Readonly<Record<P0WordId, RuntimeP0WordManifest>>;
  readonly acceptance: Readonly<{
    allWordsRecoverable: true;
    audioPolicy: RuntimeSpeechlessAudioPolicy;
    contextsPerWordMinimum: 2;
    misconceptionCounterexamplePerWordMinimum: 1;
    colorOnlyIdentificationForbidden: true;
    fixedSlotOnlyProductionForbidden: true;
    rawStringEqualityAsSuccessForbidden: true;
    communitySemanticReviewRequired: true;
  }>;
}

const TARGETS = {
  produced: ["telo", "tawa", "lili", "suli"],
  grounded: ["seli", "kiwen", "awen"],
  attuned: ["kon", "kasi", "lukin", "weka", "soweli"],
} as const;
const verified = new WeakSet<object>();

export function computeRuntimeP0CurriculumDigest(payload: unknown): `sha256:${string}` {
  return sha256Canonical(payload as JsonValue);
}

export function isVerifiedRuntimeP0CurriculumManifest(value: unknown): value is RuntimeP0CurriculumManifest {
  return typeof value === "object" && value !== null && verified.has(value);
}

export function readRuntimeP0CurriculumManifest(candidate: unknown): RuntimeP0CurriculumManifest {
  const root = record(candidate, "runtime content artifact");
  const raw = record(root.p0Curriculum, "artifact.p0Curriculum");
  const digest = nonempty(raw.sourceDigest, "p0Curriculum.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("P0 curriculum sourceDigest must be sha256");
  const payload = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== "sourceDigest"));
  if (computeRuntimeP0CurriculumDigest(payload) !== digest) throw new Error("P0 curriculum projection digest mismatch");
  exactKeys(raw, ["sourceDigest", "sourcePath", "contentVersion", "progressionSourcePath", "glyphCatalogSourcePath", "scope", "firstChapterActiveMasteryWordIds", "firstChapterStructureParticleIds", "additionalReceptiveWordIds", "firstChapterCompletionRequiresAllP0Words", "targetStateCeiling", "activationMedium", "recoveryStation", "words", "acceptance"], "P0 curriculum");
  if (raw.sourcePath !== "data/language/p0-curriculum.v0.1.yaml" || raw.contentVersion !== "prologue-12.vertical-slice.1" || raw.progressionSourcePath !== "data/language/learning-progression.v0.2.yaml" || raw.glyphCatalogSourcePath !== "data/language/pu-120-glyph-catalog.v0.2.json") throw new Error("P0 curriculum source identity is invalid");

  const scope = record(raw.scope, "P0 curriculum scope");
  exactKeys(scope, ["band", "uniqueWordCount", "wordIds", "firstThreeHoursIsContentBudgetNotRealTimeGate"], "P0 curriculum scope");
  if (scope.band !== "P0" || scope.uniqueWordCount !== 12 || scope.firstThreeHoursIsContentBudgetNotRealTimeGate !== true || !sameSet(scope.wordIds, P0_WORD_IDS)) throw new Error("P0 curriculum scope is invalid");
  if (!sameSet(raw.firstChapterActiveMasteryWordIds, FOREST_CHAPTER_ACTIVE_WORD_IDS) ||
    !same(raw.firstChapterStructureParticleIds, ["o", "li", "e"]) ||
    !same(raw.additionalReceptiveWordIds, ["word.awen", "word.kasi", "word.kiwen", "word.kon", "word.lukin", "word.seli", "word.soweli", "word.weka"]) ||
    raw.firstChapterCompletionRequiresAllP0Words !== false) {
    throw new Error("P0 first chapter scope is invalid");
  }
  const target = record(raw.targetStateCeiling, "P0 target state ceiling");
  if (!same(target.produced, TARGETS.produced) || !same(target.grounded, TARGETS.grounded) || !same(target.attuned, TARGETS.attuned)) throw new Error("P0 target state ceiling is noncanonical");
  const medium = record(raw.activationMedium, "P0 activation medium");
  exactKeys(medium, ["itemId", "scarcity", "tradeable", "randomDropRequired", "consumedOnFailedOrInterruptedActivation"], "P0 activation medium");
  if (medium.itemId !== "learning.common_inscription_medium" || medium.scarcity !== "common" || medium.tradeable !== false || medium.randomDropRequired !== false || medium.consumedOnFailedOrInterruptedActivation !== false) throw new Error("P0 activation medium is invalid");
  const station = record(raw.recoveryStation, "P0 recovery station");
  exactKeys(station, ["sceneId", "targetId", "interactionId", "interactionPointTiles", "maximumDistancePx", "recoveryRouteOnlyWhenBelowTarget"], "P0 recovery station");
  if (station.sceneId !== "scene.valley.settlement" || station.targetId !== "settlement.p0_inscription_archive" || station.interactionId !== "settlement.open_p0_inscription_archive" || !numberPair(station.interactionPointTiles, 38, 28) || station.maximumDistancePx !== 16 || station.recoveryRouteOnlyWhenBelowTarget !== true) throw new Error("P0 recovery station is invalid");

  const wordMap = record(raw.words, "P0 words");
  if (!sameSet(Object.keys(wordMap), P0_WORD_IDS)) throw new Error("P0 curriculum must contain the exact 12 word IDs");
  const targetByWord = new Map<P0WordId, RuntimeP0TargetState>([
    ...TARGETS.produced.map((word) => [word, "produced"] as const),
    ...TARGETS.grounded.map((word) => [word, "grounded"] as const),
    ...TARGETS.attuned.map((word) => [word, "attuned"] as const),
  ]);
  for (const wordId of P0_WORD_IDS) {
    const word = record(wordMap[wordId], `P0 word ${wordId}`);
    exactKeys(word, ["wordId", "firstLocation", "witness", "groundingTask", "targetState", "semanticFacets", "misconceptionToRepair", "productionTaskFamilies", "meditation"], `P0 word ${wordId}`);
    if (word.wordId !== wordId || word.targetState !== targetByWord.get(wordId)) throw new Error(`P0 word ${wordId} target state is invalid`);
    for (const field of ["firstLocation", "witness", "groundingTask", "misconceptionToRepair"] as const) nonempty(word[field], `P0 word ${wordId}.${field}`);
    exactStringPair(word.semanticFacets, `P0 word ${wordId}.semanticFacets`);
    const families = stringArray(word.productionTaskFamilies, `P0 word ${wordId}.productionTaskFamilies`, true);
    if ((word.targetState === "produced" && families.length !== 2) || (word.targetState !== "produced" && families.length !== 0)) throw new Error(`P0 word ${wordId} production task families are invalid`);
    const meditation = record(word.meditation, `P0 word ${wordId}.meditation`);
    exactStringPair(meditation.contextContrast, `P0 word ${wordId}.meditation.contextContrast`);
    stringArray(meditation.recognitionDistractors, `P0 word ${wordId}.meditation.recognitionDistractors`);
  }

  const acceptance = record(raw.acceptance, "P0 acceptance");
  exactKeys(acceptance, ["allWordsRecoverable", "audioPolicy", "contextsPerWordMinimum", "misconceptionCounterexamplePerWordMinimum", "colorOnlyIdentificationForbidden", "fixedSlotOnlyProductionForbidden", "rawStringEqualityAsSuccessForbidden", "communitySemanticReviewRequired"], "P0 acceptance");
  readRuntimeSpeechlessAudioPolicy(acceptance.audioPolicy, "P0 acceptance audio policy");
  if (acceptance.allWordsRecoverable !== true || acceptance.contextsPerWordMinimum !== 2 || acceptance.misconceptionCounterexamplePerWordMinimum !== 1 || acceptance.colorOnlyIdentificationForbidden !== true || acceptance.fixedSlotOnlyProductionForbidden !== true || acceptance.rawStringEqualityAsSuccessForbidden !== true || acceptance.communitySemanticReviewRequired !== true) throw new Error("P0 acceptance contract is invalid");
  const result = deepFreeze(structuredClone(raw)) as unknown as RuntimeP0CurriculumManifest;
  verified.add(result);
  return result;
}

function record(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function nonempty(value: unknown, label: string): string { if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`); return value; }
function stringArray(value: unknown, label: string, allowEmpty = false): readonly string[] { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every((entry) => typeof entry === "string" && entry.length > 0) || new Set(value).size !== value.length) throw new Error(`${label} must be a unique string array`); return value; }
function exactStringPair(value: unknown, label: string): void { if (stringArray(value, label).length !== 2) throw new Error(`${label} must contain exactly two contexts`); }
function same(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && value.every((entry, index) => entry === expected[index]); }
function sameSet(value: unknown, expected: readonly string[]): boolean { return Array.isArray(value) && value.length === expected.length && new Set(value).size === value.length && expected.every((entry) => value.includes(entry)); }
function numberPair(value: unknown, x: number, y: number): boolean { return Array.isArray(value) && value.length === 2 && value[0] === x && value[1] === y; }
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void { if (!sameSet(Object.keys(value), expected)) throw new Error(`${label} contains unknown or missing fields`); }
function deepFreeze<T>(value: T): T { if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value; for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); return Object.freeze(value); }
