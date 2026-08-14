import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSafeRangeManifest } from "../content/runtime-safe-range-manifest";
import type { EvidenceLedgerEntry, LearningProgressionSnapshot } from "../learning/progression";

export const ATTACK_CAPACITY_CALIBRATION_FLAG_ID = "attack_capacity_calibration_complete" as const;
export const RANGE_TRIAL_PERMISSION_FLAG_ID = "range_trial_permission" as const;
export const FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID = "first_attack_signature_available" as const;
export const FIRST_ATTACK_SIGNATURE_COMPLETED_FLAG_ID = "first_attack_signature_completed" as const;
export const PROLOGUE_RETURN_OBSERVED_FLAG_ID = "prologue_return_observed" as const;
export const ATTACK_CALIBRATION_MILESTONE_ID = "attack_capacity_calibration" as const;
export const ATTACK_CALIBRATION_WRITER_EVENT = "attack_capacity_calibrated" as const;
export const ATTACK_PERMISSION_WRITER_EVENT = "attack_prerequisites_verified" as const;
export const SAFE_RANGE_TRANSFER_WRITER_EVENT = "safe_range_transfer_passed" as const;
export const SAFE_RANGE_TABLE_WRITER_EVENT = "safe_range_material_table_completed" as const;
export const ATTACK_PREREQUISITE_GRAPH_ID = "attack.water.forceful_motion.prerequisite_graph" as const;

export const PROTECTED_ATTACK_WORLD_FLAGS: ReadonlySet<string> = new Set([
  ATTACK_CAPACITY_CALIBRATION_FLAG_ID,
  RANGE_TRIAL_PERMISSION_FLAG_ID,
  FIRST_ATTACK_SIGNATURE_AVAILABLE_FLAG_ID,
  FIRST_ATTACK_SIGNATURE_COMPLETED_FLAG_ID,
  PROLOGUE_RETURN_OBSERVED_FLAG_ID,
]);

export interface AttackQualificationContract {
  readonly sourcePath: string;
  readonly sourceDigest: `sha256:${string}`;
  readonly contractRevision: string;
  readonly contractId: "attack_qualification.v0.1";
  readonly targetGraphId: typeof ATTACK_PREREQUISITE_GRAPH_ID;
  readonly teloWordId: "telo";
  readonly tawaWordId: "tawa";
  readonly wawaWordId: "wawa";
  readonly minimumTaskFamilies: 2;
  readonly maximumPromptLevel: 1;
  readonly tawaCanonicalAstShape: "subject_o_predicate";
  readonly tawaRequiredAstWordIds: readonly ["word.o", "word.tawa"];
  readonly tawaWorldOutcomeKind: "noncombat_movement";
  readonly wawaTaskId: "ch01_return_flow";
  readonly wawaTaskFamilyId: "ecology_and_return_flow";
  readonly wawaSourceObjectClass: "inert_return_flow_mechanism";
  readonly minimumRelatedRepairs: 1;
  readonly eligibleRepairedNodeIds: readonly ["use.motion.noncombat", "use.intensity.inert"];
  readonly delayedRetrievalTarget: "canonical_ast_shape_or_declared_paraphrase_equivalence";
  readonly minimumUnrelatedWorldEvents: 2;
  readonly resultingState: Readonly<{ expressionCapacityWords: 4; focusSlots: 4; maxMp: 30 }>;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const exactResult = (value: unknown): AttackQualificationContract["resultingState"] => {
  const result = record(value, "attack calibration resultingState");
  if (result.expressionCapacityWords !== 4 || result.focusSlots !== 4 || result.maxMp !== 30) {
    throw new Error("attack calibration resultingState mismatch");
  }
  return Object.freeze({ expressionCapacityWords: 4, focusSlots: 4, maxMp: 30 });
};

/** Derives the qualification contract only from verified compiler-generated projections. */
export const readRuntimeAttackQualificationContract = (candidate: unknown): AttackQualificationContract => {
  const root = record(candidate, "runtime artifact");
  const capability = record(root.capabilityProgression, "capabilityProgression");
  if (!Array.isArray(capability.capacityMilestones)) throw new Error("capacityMilestones must be an array");
  const matches = capability.capacityMilestones.map((entry, index) =>
    record(entry, `capacityMilestones[${index}]`)).filter((entry) =>
      entry.milestoneId === ATTACK_CALIBRATION_MILESTONE_ID);
  if (matches.length !== 1 || matches[0]!.writerEvent !== ATTACK_CALIBRATION_WRITER_EVENT) {
    throw new Error("generated attack calibration milestone mismatch");
  }
  const safeRange = readRuntimeSafeRangeManifest(candidate);
  const graph = safeRange.prerequisiteGraph;
  return Object.freeze({
    sourcePath: safeRange.sourcePath,
    sourceDigest: safeRange.sourceDigest,
    contractRevision: graph.version,
    contractId: "attack_qualification.v0.1",
    targetGraphId: graph.graphId,
    teloWordId: "telo", tawaWordId: "tawa", wawaWordId: "wawa",
    minimumTaskFamilies: graph.nodes.retrieval.distinctTaskFamilies,
    maximumPromptLevel: graph.nodes.retrieval.maxHintLevel,
    tawaCanonicalAstShape: "subject_o_predicate",
    tawaRequiredAstWordIds: ["word.o", graph.canonicalAst.action] as const,
    tawaWorldOutcomeKind: "noncombat_movement",
    wawaTaskId: "ch01_return_flow", wawaTaskFamilyId: "ecology_and_return_flow",
    wawaSourceObjectClass: graph.nodes.intensity.sourceObjectClass,
    minimumRelatedRepairs: graph.nodes.repair.minimum,
    eligibleRepairedNodeIds: graph.nodes.repair.eligibleTargetNodeIds,
    delayedRetrievalTarget: graph.nodes.delayed.retrievalTarget,
    minimumUnrelatedWorldEvents: graph.nodes.delayed.unrelatedWorldEventsBetween,
    resultingState: exactResult(matches[0]!.resultingState),
  });
};
export const RUNTIME_ATTACK_QUALIFICATION_CONTRACT =
  readRuntimeAttackQualificationContract(generatedRuntimeArtifact);
export interface CommittedLearningEvidenceReference {
  readonly evidenceEventId: string;
  readonly sessionSequence: number;
}

export interface CommittedWorldEventReference {
  readonly eventId: string;
  readonly sequence: number;
  readonly type: "quest_stage_set" | "world_flag_set" | "scene_entered" | "learning_evidence_committed";
}
export type AttackQualificationNodeId =
  | "telo_active_retrieval" | "noncombat_tawa_ast" | "inert_wawa_grounding" | "related_repair" | "delayed_retrieval";
export interface AttackQualificationEvaluation {
  readonly qualified: boolean;
  readonly nodes: Readonly<Record<AttackQualificationNodeId, boolean>>;
  readonly missingNodes: readonly AttackQualificationNodeId[];
}
const strictLowHint = (entry: EvidenceLedgerEntry, maximumPromptLevel: number): boolean =>
  entry.promptLevel !== null && entry.promptLevel !== undefined && entry.promptLevel <= maximumPromptLevel &&
  (entry.interpretationStatus === "parsed_grounded" || entry.interpretationStatus === "executed_legal") &&
  entry.worldOutcomeContribution === true && entry.toolBypass === false && entry.answerVisible === false &&
  entry.fixedSlotOnly === false && entry.colorOnlyCue === false;
const entriesFor = (learning: LearningProgressionSnapshot, wordId: string): readonly EvidenceLedgerEntry[] =>
  learning.words[wordId]?.evidence ?? [];
const distinctFamilies = (entries: readonly EvidenceLedgerEntry[]): number =>
  new Set(entries.flatMap((entry) => entry.taskFamilyId == null ? [] : [entry.taskFamilyId])).size;

export const evaluateAttackQualification = (
  contract: AttackQualificationContract,
  learning: LearningProgressionSnapshot,
  committedWorldEvents: readonly CommittedWorldEventReference[],
  committedEvidence: readonly CommittedLearningEvidenceReference[],
): AttackQualificationEvaluation => {
  const authoritativeEvidence = new Map(committedEvidence.map((entry) => [entry.evidenceEventId, entry.sessionSequence]));
  const authoritative = (entry: EvidenceLedgerEntry): boolean =>
    entry.committedAtSessionSequence != null && authoritativeEvidence.get(entry.eventId) === entry.committedAtSessionSequence;
  const telo = entriesFor(learning, contract.teloWordId).filter((entry) =>
    authoritative(entry) && entry.eventType === "active_retrieval_submitted" && strictLowHint(entry, contract.maximumPromptLevel));
  const tawa = entriesFor(learning, contract.tawaWordId).filter((entry) =>
    authoritative(entry) && entry.eventType === "noncombat_action_completed" && strictLowHint(entry, contract.maximumPromptLevel) &&
    entry.canonicalAstShape === contract.tawaCanonicalAstShape &&
    contract.tawaRequiredAstWordIds.every((wordId) => entry.canonicalAstWordIds?.includes(wordId) === true) &&
    entry.worldOutcomeKind === contract.tawaWorldOutcomeKind);
  const wawa = entriesFor(learning, contract.wawaWordId).filter((entry) =>
    authoritative(entry) && entry.eventType === "grounding_trial_resolved" &&
    strictLowHint(entry, contract.maximumPromptLevel) && entry.taskId === contract.wawaTaskId &&
    entry.taskFamilyId === contract.wawaTaskFamilyId && entry.sourceObjectClass === contract.wawaSourceObjectClass &&
    entry.canonicalAstWordIds?.includes("word.wawa") === true &&
    entry.worldOutcomeKind === "inert_force_observation");
  const repairs = Object.values(learning.words).flatMap((word) => word.evidence).filter((entry) =>
    authoritative(entry) && entry.eventType === "repair_completed" && strictLowHint(entry, contract.maximumPromptLevel) &&
    entry.targetGraphId === contract.targetGraphId &&
    contract.eligibleRepairedNodeIds.includes(entry.repairedNodeId as typeof contract.eligibleRepairedNodeIds[number]) &&
    entry.promptLevelAfterRepair !== null && entry.promptLevelAfterRepair !== undefined &&
    entry.promptLevelAfterRepair <= contract.maximumPromptLevel);
  const prerequisiteEntries = [...telo, ...tawa, ...wawa, ...repairs];
  const committedById = new Map(committedWorldEvents.map((event) => [event.eventId, event]));
  const delayed = Object.values(learning.words).flatMap((word) => word.evidence).some((entry) => {
    if (!authoritative(entry) || entry.eventType !== "delayed_retrieval_completed" || !strictLowHint(entry, contract.maximumPromptLevel) ||
        entry.targetGraphId !== contract.targetGraphId || entry.retrievalTarget !== contract.delayedRetrievalTarget ||
        entry.committedAtSessionSequence == null) return false;
    const priorSequences = prerequisiteEntries.flatMap((candidate) =>
      candidate.committedAtSessionSequence != null && candidate.committedAtSessionSequence < entry.committedAtSessionSequence!
        ? [candidate.committedAtSessionSequence] : []);
    if (priorSequences.length === 0) return false;
    const priorLearningSequence = Math.max(...priorSequences);
    const ids = [...new Set(entry.unrelatedWorldEventIds ?? [])];
    if (ids.length < contract.minimumUnrelatedWorldEvents) return false;
    const referenced = ids.map((id) => committedById.get(id));
    return referenced.every((event) => event !== undefined &&
      event.sequence > priorLearningSequence && event.sequence < entry.committedAtSessionSequence!) &&
      new Set(referenced.map((event) => event!.sequence)).size >= contract.minimumUnrelatedWorldEvents;
  });
  const nodes: AttackQualificationEvaluation["nodes"] = {
    telo_active_retrieval: distinctFamilies(telo) >= contract.minimumTaskFamilies,
    noncombat_tawa_ast: distinctFamilies(tawa) >= contract.minimumTaskFamilies,
    inert_wawa_grounding: wawa.length >= 1,
    related_repair: repairs.length >= contract.minimumRelatedRepairs,
    delayed_retrieval: delayed,
  };
  const missingNodes = (Object.entries(nodes) as [AttackQualificationNodeId, boolean][])
    .filter(([, complete]) => !complete).map(([node]) => node);
  return { qualified: missingNodes.length === 0, nodes, missingNodes };
};
