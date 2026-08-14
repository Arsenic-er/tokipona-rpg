import type { RuntimeP0CurriculumManifest, RuntimeP0TargetState } from "../content/runtime-p0-curriculum-manifest";
import type { P0WordId } from "../learning/progression";
import { sha256Canonical, type JsonValue } from "../persistence/cross-save-wal";
import type {
  ActiveRetrievalSubmittedEvent,
  GlyphAttunementCompletedEvent,
  GlyphDiscoveredEvent,
  GroundingTrialResolvedEvent,
  LearningEvidenceEvent,
  RepairCompletedEvent,
} from "../learning/progression";

export const P0_LEARNING_ACTION_KINDS = ["discover", "attune", "context_0", "context_1", "repair"] as const;
export type P0LearningActionKind = (typeof P0_LEARNING_ACTION_KINDS)[number];
export type P0LearningActionId = `p0.${P0WordId}.${P0LearningActionKind}`;

export function parseP0LearningActionId(manifest: RuntimeP0CurriculumManifest, value: string): Readonly<{ wordId: P0WordId; kind: P0LearningActionKind }> | null {
  const match = /^p0\.([a-z]+)\.(discover|attune|context_0|context_1|repair)$/.exec(value);
  if (!match) return null;
  const wordId = match[1] as P0WordId;
  const kind = match[2] as P0LearningActionKind;
  return manifest.words[wordId] ? Object.freeze({ wordId, kind }) : null;
}

export function p0LearningActionIds(manifest: RuntimeP0CurriculumManifest): readonly P0LearningActionId[] {
  return Object.freeze(manifest.scope.wordIds.flatMap((wordId) => P0_LEARNING_ACTION_KINDS.map((kind) => `p0.${wordId}.${kind}` as const)));
}

export function materializeP0LearningEvidence(
  manifest: RuntimeP0CurriculumManifest,
  playerSaveId: string,
  actionId: P0LearningActionId,
): readonly LearningEvidenceEvent[] {
  const parsed = parseP0LearningActionId(manifest, actionId);
  if (!parsed || !playerSaveId) throw new Error("invalid P0 learning action identity");
  const word = manifest.words[parsed.wordId];
  const semanticId = (ordinal: number): string => sha256Canonical({ manifestDigest: manifest.sourceDigest, actionId, ordinal } as JsonValue);
  const identity = (eventType: LearningEvidenceEvent["eventType"], ordinal: number) => ({
    eventId: `p0-learning.${playerSaveId}.${actionId}.${ordinal}`,
    playerSaveId,
    wordId: parsed.wordId,
    idempotencyKey: `${playerSaveId}:${eventType}:${semanticId(ordinal)}`,
  });
  if (parsed.kind === "discover") {
    const event: GlyphDiscoveredEvent = { ...identity("glyph_discovered", 0), eventType: "glyph_discovered",
      locationId: word.firstLocation, recognitionMode: "recovery_route" };
    return Object.freeze([Object.freeze(event)]);
  }
  if (parsed.kind === "attune") {
    const event: GlyphAttunementCompletedEvent = { ...identity("glyph_attunement_completed", 0), eventType: "glyph_attunement_completed",
      catalystClass: "common_nontradeable", catalystTradeable: false, environmentalWitnessId: word.witness };
    return Object.freeze([Object.freeze(event)]);
  }
  if (parsed.kind === "repair" && word.targetState === "attuned") {
    const event: GlyphAttunementCompletedEvent = { ...identity("glyph_attunement_completed", 0), eventType: "glyph_attunement_completed",
      catalystClass: "common_nontradeable", catalystTradeable: false,
      environmentalWitnessId: `misconception_repaired:${word.misconceptionToRepair}` };
    return Object.freeze([Object.freeze(event)]);
  }
  const contextIndex = parsed.kind === "context_1" ? 1 : 0;
  if ((parsed.kind === "context_0" || parsed.kind === "context_1") && word.targetState === "attuned") {
    const event: GlyphAttunementCompletedEvent = { ...identity("glyph_attunement_completed", 0), eventType: "glyph_attunement_completed",
      catalystClass: "common_nontradeable", catalystTradeable: false,
      environmentalWitnessId: word.meditation.contextContrast[contextIndex] };
    return Object.freeze([Object.freeze(event)]);
  }
  const context = parsed.kind === "repair" ? `repair:${word.misconceptionToRepair}` : word.meditation.contextContrast[contextIndex];
  const family = parsed.kind === "repair" ? `p0_${parsed.wordId}_misconception_repair` :
    word.productionTaskFamilies[contextIndex] ?? `p0_${parsed.wordId}_context_${contextIndex}`;
  const base = (eventType: LearningEvidenceEvent["eventType"], ordinal: number) => ({
    ...identity(eventType, ordinal),
    taskId: `p0.${parsed.wordId}.${parsed.kind}`,
    taskFamilyId: family,
    variantHash: semanticId(ordinal),
    normalizedEnvironmentFingerprint: `${word.firstLocation}:${context}`,
    promptLevel: contextIndex as 0 | 1,
    interpretationStatus: "executed_legal" as const,
    worldOutcomeContribution: true,
    worldOutcomeKind: context,
    toolBypass: false,
    answerVisible: false,
    fixedSlotOnly: false,
    colorOnlyCue: false,
    semanticFacetsDemonstrated: parsed.kind === "repair" ? [...word.semanticFacets] : [word.semanticFacets[contextIndex]],
    canonicalAstWordIds: [`word.${parsed.wordId}`],
  });
  if (parsed.kind === "repair") {
    const event: RepairCompletedEvent = { ...base("repair_completed", 0), eventType: "repair_completed",
      promptLevelAfterRepair: 0, targetGraphId: `p0.${parsed.wordId}.semantic_graph`,
      repairedNodeId: `p0.${parsed.wordId}.misconception` };
    return Object.freeze([Object.freeze(event)]);
  }
  const grounding: GroundingTrialResolvedEvent = { ...base("grounding_trial_resolved", 0), eventType: "grounding_trial_resolved" };
  if (word.targetState !== "produced") return Object.freeze([Object.freeze(grounding)]);
  const retrieval: ActiveRetrievalSubmittedEvent = { ...base("active_retrieval_submitted", parsed.kind === "context_0" ? 1 : 0), eventType: "active_retrieval_submitted" };
  return parsed.kind === "context_0"
    ? Object.freeze([Object.freeze(grounding), Object.freeze(retrieval)])
    : Object.freeze([Object.freeze(retrieval)]);
}

export function p0TargetReached(target: RuntimeP0TargetState, current: string | null, attunementState: string = "locked"): boolean {
  if (target === "attuned") return attunementState === "attuned";
  const rank: Readonly<Record<string, number>> = { discovered: 0, attuned: 1, grounded: 2, produced: 3, stabilized: 4 };
  const targetRank = target === "grounded" ? 2 : 3;
  return current !== null && (rank[current] ?? -1) >= targetRank;
}

export function p0EvidenceMatches(expected: LearningEvidenceEvent, actual: LearningEvidenceEvent): boolean {
  return sha256Canonical(expected as unknown as JsonValue) === sha256Canonical(actual as unknown as JsonValue);
}
