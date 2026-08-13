export type RuntimeInfrastructureTaskPredicateMode = "all" | "any";
export type RuntimeInfrastructureRouteKind = "non_magic" | "optional_magic";

export interface RuntimeInfrastructureTaskModeManifest {
  readonly id: string;
  readonly completionValid: boolean;
  readonly persistenceScope: string;
  readonly persistsAcrossReload: boolean;
  readonly patchRecordRef: string | null;
}

export interface RuntimeInfrastructureTaskSolutionManifest {
  readonly id: string;
  readonly routeKind: RuntimeInfrastructureRouteKind;
  readonly chapterSolutionFamily: string;
  readonly mainline: boolean;
  readonly resultMode: string;
  readonly requiredActions: readonly string[];
  readonly requiredWorldPredicates: readonly string[];
}

export interface RuntimeInfrastructureLanguageExposureManifest {
  readonly wordId: string;
  readonly discoveryTrigger: string;
  readonly learningPrompt: string;
  readonly eligibleStateProposals: readonly string[];
  readonly automaticMasteryForbidden: boolean;
  readonly toolSolutionStillAllowsObservation: boolean;
}

export interface RuntimeInfrastructureGrammarContactManifest {
  readonly token: string;
  readonly contactKind: string;
  readonly automaticStateGrant: boolean;
  readonly productionRequired: boolean;
  readonly masteryEvidenceAllowed: boolean;
}

export interface RuntimeInfrastructureTaskManifest {
  readonly id: string;
  readonly sourcePath: string;
  readonly familyId: string;
  readonly chapterFlowId: string;
  readonly chapterSegmentId: string;
  readonly regionId: string;
  readonly regionNodeId: string;
  readonly sceneId: string;
  readonly implementationBoundary: string;
  readonly predicateMode: RuntimeInfrastructureTaskPredicateMode;
  readonly worldGoalPredicates: readonly Readonly<{ id: string; expression: string }>[];
  readonly modes: readonly RuntimeInfrastructureTaskModeManifest[];
  readonly validResultModes: readonly string[];
  readonly solutions: readonly RuntimeInfrastructureTaskSolutionManifest[];
  readonly nonMagicMainlineSolutionIds: readonly string[];
  readonly entryGuardAny: readonly string[];
  readonly exitGuardAny: readonly string[];
  readonly materialPatchRefs: readonly string[];
  readonly languageExposure: readonly RuntimeInfrastructureLanguageExposureManifest[];
  readonly grammarContacts: readonly RuntimeInfrastructureGrammarContactManifest[];
  readonly materialReactionKinds: readonly string[];
  readonly maximumSoftlockRecoverySeconds: number;
  readonly recoveryActions: readonly string[];
  readonly recoveryPreserves: readonly string[];
}

export interface RuntimeInfrastructureTaskManifestIndex {
  readonly sourceDigest: `sha256:${string}`;
  readonly byId: Readonly<Record<string, RuntimeInfrastructureTaskManifest>>;
}

/** Fail-closed runtime boundary for generated infrastructure task contracts. */
export function readRuntimeInfrastructureTaskManifestIndex(
  candidate: unknown,
): RuntimeInfrastructureTaskManifestIndex {
  const root = record(candidate, "runtime content artifact");
  const tasks = record(root.infrastructureTasks, "runtime content artifact.infrastructureTasks");
  const digest = stringValue(tasks.sourceDigest, "infrastructureTasks.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
    throw new Error("infrastructureTasks.sourceDigest must be a sha256 digest");
  }
  const rawById = record(tasks.byId, "infrastructureTasks.byId");
  const byId: Record<string, RuntimeInfrastructureTaskManifest> = {};
  for (const [taskId, value] of Object.entries(rawById)) {
    const raw = record(value, `infrastructureTasks.byId.${taskId}`);
    if (raw.id !== taskId) throw new Error(`infrastructure task key ${taskId} does not match id`);
    for (const name of [
      "worldGoalPredicates", "modes", "validResultModes", "solutions",
      "nonMagicMainlineSolutionIds", "entryGuardAny", "exitGuardAny",
      "materialPatchRefs", "languageExposure", "grammarContacts",
      "materialReactionKinds", "recoveryActions", "recoveryPreserves",
    ] as const) {
      if (!Array.isArray(raw[name])) throw new Error(`infrastructure task ${taskId}.${name} must be an array`);
    }
    if (raw.predicateMode !== "all" && raw.predicateMode !== "any") {
      throw new Error(`infrastructure task ${taskId}.predicateMode must be all or any`);
    }
    if (typeof raw.maximumSoftlockRecoverySeconds !== "number" ||
        raw.maximumSoftlockRecoverySeconds <= 0 || raw.maximumSoftlockRecoverySeconds > 60) {
      throw new Error(`infrastructure task ${taskId} must recover within 60 seconds`);
    }
    byId[taskId] = value as RuntimeInfrastructureTaskManifest;
  }
  return Object.freeze({
    sourceDigest: digest as `sha256:${string}`,
    byId: Object.freeze(byId),
  });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}
