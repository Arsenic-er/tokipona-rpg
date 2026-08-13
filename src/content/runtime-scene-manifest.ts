export interface RuntimeTilePoint {
  readonly x: number;
  readonly y: number;
}

export interface RuntimeTileRect extends RuntimeTilePoint {
  readonly width: number;
  readonly height: number;
}

export interface RuntimeSceneEntranceManifest {
  readonly id: string;
  readonly spawnTile: readonly [number, number];
  /** Player top-left position in runtime pixels, converted from bottom-left authored tiles. */
  readonly spawnPx: RuntimeTilePoint;
  readonly recoveryEntry: boolean;
  readonly checkpointPolicy: string;
}

export type RuntimeSceneExitTarget =
  | Readonly<{ kind: "scene"; sceneId: string; entranceId: string }>
  | Readonly<{ kind: "region_node"; regionNodeId: string }>;

export interface RuntimeSceneExitManifest {
  readonly id: string;
  readonly boundsTiles: RuntimeTileRect;
  /** Runtime top-left pixel AABB converted from bottom-left authored tiles. */
  readonly boundsPx: RuntimeTileRect;
  readonly target: RuntimeSceneExitTarget;
  readonly firstTraverseCommit: string | null;
  readonly traversalGuardAny: readonly string[];
}

export interface RuntimeSceneRouteObjectiveManifest {
  readonly id: string;
  readonly predicate: string;
}

export interface RuntimeSceneRouteManifest {
  readonly id: string;
  readonly kind: "non_magic" | "optional_magic";
  readonly solutionFamily: string;
  readonly fromEntranceId: string;
  readonly toExitId: string;
  readonly objectiveIds: readonly string[];
}

export interface RuntimeSceneTargetManifest {
  readonly id: string;
  readonly kind: string;
  readonly material: string;
}

export interface RuntimeSceneInteractionManifest {
  readonly id: string;
  readonly targetId: string;
  readonly verb: string;
  readonly toolOrMagicRequired: boolean | null;
  readonly optionalWordId: string | null;
  readonly npcId: string | null;
  readonly facilityId: string | null;
  readonly taskId: string | null;
}

export interface RuntimeSceneNpcManifest {
  readonly id: string;
  readonly professionId: string;
  readonly professionLabelZh: string;
  readonly functions: readonly string[];
  readonly interactionIds: readonly string[];
}

export interface RuntimeSceneFacilityManifest {
  readonly id: string;
  readonly kind: string;
  readonly targetId: string;
  readonly interactionIds: readonly string[];
  readonly publicRelief: boolean;
  readonly economyEligible: boolean;
}

export interface RuntimeSceneTaskManifest {
  readonly id: string;
  readonly familyId: string;
  readonly assignmentNpcId: string;
  readonly objectiveIds: readonly string[];
  readonly interactionIds: readonly string[];
  readonly nonviolent: boolean;
  readonly magicRequired: boolean;
  readonly requiredForMainline: boolean;
  readonly solutionFamilies: readonly string[];
  readonly reward: Readonly<{
    currency: string;
    amount: number;
    claimOnce: boolean;
    receiptRequired: boolean;
  }>;
  readonly rewardIdempotencyKeyFields: readonly string[];
  readonly recoveryActions: readonly string[];
}

export interface RuntimeSceneTaskRefManifest {
  readonly id: string;
  readonly authoritativeTaskSourcePath: string;
  readonly objectiveIds: readonly string[];
}
export interface RuntimeSceneTradeEntryManifest {
  readonly id: string;
  readonly npcId: string;
  readonly interactionId: string;
  /** Repository-relative path to the authoritative economy source. */
  readonly authoritativeEconomySourcePath: string;
  readonly merchantIds: readonly string[];
}

export interface RuntimeSceneInboundRouteManifest {
  readonly id: string;
  readonly sourceSceneId: string;
  readonly sourceExitId: string;
  readonly entranceId: string;
}

export interface RuntimeSceneSoftFailureRecoveryManifest {
  readonly id: string;
  readonly action: string;
  readonly preserves: readonly string[];
}

export interface RuntimeSceneRecoveryManifest {
  readonly entryEntranceId: string;
  readonly maximumSoftlockRecoverySeconds: number;
  readonly actions: readonly string[];
  readonly preserves: readonly string[];
}

export interface RuntimeSceneManifest {
  readonly sceneId: string;
  readonly sourcePath: string;
  readonly regionId: string;
  readonly regionNodeId: string;
  readonly chapterFlowId: string;
  readonly chapterSegmentId: string;
  readonly tileSizePx: 16;
  readonly sizeTiles: { readonly width: number; readonly height: number };
  /** Equal-width, top-down runtime collision rows using only `.` and `#`. */
  readonly collisionRows: readonly string[];
  readonly entrances: readonly RuntimeSceneEntranceManifest[];
  readonly exits: readonly RuntimeSceneExitManifest[];
  readonly recovery: RuntimeSceneRecoveryManifest;
  readonly routeObjectives: readonly RuntimeSceneRouteObjectiveManifest[];
  readonly routes: readonly RuntimeSceneRouteManifest[];
  readonly nonMagicAlternativeRouteIds: readonly string[];
  readonly targets: readonly RuntimeSceneTargetManifest[];
  readonly interactions: readonly RuntimeSceneInteractionManifest[];
  readonly npcs: readonly RuntimeSceneNpcManifest[];
  readonly facilities: readonly RuntimeSceneFacilityManifest[];
  readonly tasks: readonly RuntimeSceneTaskManifest[];
  readonly taskRefs: readonly RuntimeSceneTaskRefManifest[];
  readonly tradeEntries: readonly RuntimeSceneTradeEntryManifest[];
  readonly inboundRoutes: readonly RuntimeSceneInboundRouteManifest[];
  readonly softFailureRecoveries: readonly RuntimeSceneSoftFailureRecoveryManifest[];
  readonly materialPatchRecordRefs: readonly string[];
}

export interface RuntimeSceneManifestIndex {
  readonly sourceDigest: `sha256:${string}`;
  readonly byId: Readonly<Record<string, RuntimeSceneManifest>>;
}

/** Fail-closed runtime boundary for the generated scene index. */
export function readRuntimeSceneManifestIndex(candidate: unknown): RuntimeSceneManifestIndex {
  const root = record(candidate, "runtime content artifact");
  const scenes = record(root.scenes, "runtime content artifact.scenes");
  const digest = stringValue(scenes.sourceDigest, "scenes.sourceDigest");
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new Error("scenes.sourceDigest must be a sha256 digest");
  const rawById = record(scenes.byId, "scenes.byId");
  const byId: Record<string, RuntimeSceneManifest> = {};
  for (const [sceneId, value] of Object.entries(rawById)) {
    const scene = value as RuntimeSceneManifest;
    const raw = record(value, `scenes.byId.${sceneId}`);
    if (raw.sceneId !== sceneId) throw new Error(`scene key ${sceneId} does not match sceneId`);
    if (raw.tileSizePx !== 16) throw new Error(`scene ${sceneId} tileSizePx must be 16`);
    if (!Array.isArray(raw.collisionRows) || !raw.collisionRows.every((row) => typeof row === "string")) {
      throw new Error(`scene ${sceneId} collisionRows must be strings`);
    }
    const collectionNames = [
      "entrances", "exits", "routes", "routeObjectives", "nonMagicAlternativeRouteIds", "targets", "interactions",
      "npcs", "facilities", "tasks", "taskRefs", "tradeEntries", "inboundRoutes", "softFailureRecoveries", "materialPatchRecordRefs",
    ] as const;
    for (const name of collectionNames) {
      if (!Array.isArray(raw[name])) throw new Error(`scene ${sceneId}.${name} must be an array`);
    }
    byId[sceneId] = scene;
  }
  return Object.freeze({ sourceDigest: digest as `sha256:${string}`, byId: Object.freeze(byId) });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}
