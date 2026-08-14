import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkRepositoryPublicReleaseReadiness } from "./public-release-readiness";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const MINUTE_MS = 60_000;

describe("repository public release readiness", () => {
  it("reports the checked-in repository as blocked even with a passing synthetic test cohort", () => {
    const report = checkRepositoryPublicReleaseReadiness(repositoryRoot, cohort(sample()));
    expect(report).toEqual({
      schemaVersion: "tokipona.public-release-readiness.v0.1",
      status: "blocked",
      deterministicThreeHourGate: "required_predecessor_passed",
      runtimeAssetStatus: "safe_blocked_pending_external_approval",
      observedPlaytestStatus: "accepted",
      observedPlaytestSampleSize: 1,
      blockers: ["approved_runtime_assets_required"],
    });
    expect(JSON.stringify(report)).not.toMatch(/cohortId|sessionId|samples|savePayload/);
  });

  it("reports both independent blockers when observed thresholds also fail", () => {
    const report = checkRepositoryPublicReleaseReadiness(repositoryRoot, cohort(sample({
      forcedHuntCount: 1,
    })));
    expect(report).toMatchObject({
      status: "blocked",
      observedPlaytestStatus: "rejected",
      blockers: [
        "approved_runtime_assets_required",
        "observed_playtest_thresholds_failed",
      ],
    });
  });

  it("rejects deterministic-runner and privacy-expanding input shapes", () => {
    expect(() => checkRepositoryPublicReleaseReadiness(repositoryRoot, {
      contentMinutes: 180,
      telemetryEvents: [],
    })).toThrow(/unknown or missing/);
    expect(() => checkRepositoryPublicReleaseReadiness(repositoryRoot, {
      ...cohort(sample()),
      rawText: "telo",
    })).toThrow(/unknown or missing/);
  });
});

function cohort(sampleValue: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: "tokipona.prologue-playtest-cohort.v0.1",
    collectionMode: "anonymized_observed_playtest",
    cohortId: "cohort.release.synthetic-test-only",
    samples: [sampleValue],
  };
}

function sample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "prologue.playtest-session.v0.1",
    sessionId: "synthetic.release.test-only.0",
    contentActiveMs: 180 * MINUTE_MS,
    worldPeoplePhysicsActiveMs: 126 * MINUTE_MS,
    languageActiveMs: 36 * MINUTE_MS,
    longExplanationActiveMs: 18 * MINUTE_MS,
    survivalUiActiveMs: 2 * MINUTE_MS,
    languageInteractionCount: 100,
    needsInterruptedLanguageInteractionCount: 1,
    freeFoodWaterDiscoveryMs: 50_000,
    softFailureRecoveryDurationsMs: [90_000],
    rangeTrialPermissionContentMs: 159 * MINUTE_MS,
    firstAttackSignatureContentMs: 159 * MINUTE_MS,
    forcedHuntCount: 0,
    wildlifeHarmEventCount: 0,
    huntingIncomeCoin: 6,
    huntingActiveMs: 15 * MINUTE_MS,
    nonviolentJobIncomeCoin: 10,
    nonviolentJobActiveMs: 10 * MINUTE_MS,
    duplicateCorpseLotCurrencyCount: 0,
    minimumNeedsValueObserved: 20,
    maximumActiveNewWordsInAnySegment: 2,
    ...overrides,
  };
}
