import type { ProloguePlaytestCohortFileReport } from "../acceptance/prologue-playtest-cohort-file";

export const PUBLIC_RELEASE_READINESS_SCHEMA =
  "tokipona.public-release-readiness.v0.1" as const;

export type PublicReleaseBlocker =
  | "approved_runtime_assets_required"
  | "observed_playtest_thresholds_failed";

export interface PublicReleaseAssetEvidence {
  readonly status:
    | "safe_blocked_pending_external_approval"
    | "approved_runtime_assets_verified";
  readonly core120WordCount: 120;
}

export interface PublicReleaseReadinessReport {
  readonly schemaVersion: typeof PUBLIC_RELEASE_READINESS_SCHEMA;
  readonly status: "ready" | "blocked";
  readonly deterministicThreeHourGate: "required_predecessor_passed";
  readonly runtimeAssetStatus: PublicReleaseAssetEvidence["status"];
  readonly observedPlaytestStatus: "accepted" | "rejected";
  readonly observedPlaytestSampleSize: number;
  readonly blockers: readonly PublicReleaseBlocker[];
}

export function evaluatePublicReleaseReadiness(input: Readonly<{
  runtimeAssets: PublicReleaseAssetEvidence;
  observedPlaytest: ProloguePlaytestCohortFileReport;
}>): PublicReleaseReadinessReport {
  if (input.runtimeAssets.core120WordCount !== 120 ||
      (input.runtimeAssets.status !== "safe_blocked_pending_external_approval" &&
       input.runtimeAssets.status !== "approved_runtime_assets_verified")) {
    throw new Error("public release asset evidence is invalid");
  }
  if ((input.observedPlaytest.status !== "accepted" && input.observedPlaytest.status !== "rejected") ||
      input.observedPlaytest.acceptance.accepted !==
        (input.observedPlaytest.status === "accepted") ||
      !Number.isSafeInteger(input.observedPlaytest.acceptance.sampleSize) ||
      input.observedPlaytest.acceptance.sampleSize < 0) {
    throw new Error("public release playtest evidence is invalid");
  }
  const blockers: PublicReleaseBlocker[] = [];
  if (input.runtimeAssets.status !== "approved_runtime_assets_verified") {
    blockers.push("approved_runtime_assets_required");
  }
  if (input.observedPlaytest.status !== "accepted" ||
      input.observedPlaytest.acceptance.sampleSize === 0) {
    blockers.push("observed_playtest_thresholds_failed");
  }
  return deepFreeze({
    schemaVersion: PUBLIC_RELEASE_READINESS_SCHEMA,
    status: blockers.length === 0 ? "ready" : "blocked",
    deterministicThreeHourGate: "required_predecessor_passed",
    runtimeAssetStatus: input.runtimeAssets.status,
    observedPlaytestStatus: input.observedPlaytest.status,
    observedPlaytestSampleSize: input.observedPlaytest.acceptance.sampleSize,
    blockers,
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
