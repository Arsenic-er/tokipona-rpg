import { describe, expect, it } from "vitest";
import type { ProloguePlaytestCohortFileReport } from "../acceptance/prologue-playtest-cohort-file";
import {
  PUBLIC_RELEASE_READINESS_SCHEMA,
  evaluatePublicReleaseReadiness,
  type PublicReleaseAssetEvidence,
} from "./public-release-readiness";

describe("public release readiness", () => {
  it("keeps the current safe-blocked asset state from becoming release-ready", () => {
    expect(evaluatePublicReleaseReadiness({
      runtimeAssets: assets("safe_blocked_pending_external_approval"),
      observedPlaytest: playtest(true, 10),
    })).toEqual({
      schemaVersion: PUBLIC_RELEASE_READINESS_SCHEMA,
      status: "blocked",
      deterministicThreeHourGate: "required_predecessor_passed",
      runtimeAssetStatus: "safe_blocked_pending_external_approval",
      observedPlaytestStatus: "accepted",
      observedPlaytestSampleSize: 10,
      blockers: ["approved_runtime_assets_required"],
    });
  });

  it("requires an accepted nonempty observed cohort independently of asset approval", () => {
    expect(evaluatePublicReleaseReadiness({
      runtimeAssets: assets("approved_runtime_assets_verified"),
      observedPlaytest: playtest(false, 3),
    })).toMatchObject({
      status: "blocked",
      blockers: ["observed_playtest_thresholds_failed"],
    });
    expect(evaluatePublicReleaseReadiness({
      runtimeAssets: assets("approved_runtime_assets_verified"),
      observedPlaytest: playtest(false, 0),
    })).toMatchObject({ status: "blocked" });
  });

  it("becomes ready only when approved assets and observed thresholds agree", () => {
    const report = evaluatePublicReleaseReadiness({
      runtimeAssets: assets("approved_runtime_assets_verified"),
      observedPlaytest: playtest(true, 10),
    });
    expect(report).toEqual({
      schemaVersion: PUBLIC_RELEASE_READINESS_SCHEMA,
      status: "ready",
      deterministicThreeHourGate: "required_predecessor_passed",
      runtimeAssetStatus: "approved_runtime_assets_verified",
      observedPlaytestStatus: "accepted",
      observedPlaytestSampleSize: 10,
      blockers: [],
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.blockers)).toBe(true);
  });

  it("rejects contradictory status wrappers rather than trusting the outer label", () => {
    expect(() => evaluatePublicReleaseReadiness({
      runtimeAssets: assets("approved_runtime_assets_verified"),
      observedPlaytest: playtest(false, 10, "accepted"),
    })).toThrow(/playtest evidence/);
  });
});

function assets(status: PublicReleaseAssetEvidence["status"]): PublicReleaseAssetEvidence {
  return Object.freeze({ status, core120WordCount: 120, p0PronunciationWordCount: 12 });
}

function playtest(
  accepted: boolean,
  sampleSize: number,
  status: "accepted" | "rejected" = accepted ? "accepted" : "rejected",
): ProloguePlaytestCohortFileReport {
  return {
    schemaVersion: "tokipona.prologue-playtest-cohort-report.v0.1",
    collectionMode: "anonymized_observed_playtest",
    cohortId: "cohort.release.synthetic-test-only",
    status,
    acceptance: {
      sampleSize,
      observedContentMs: sampleSize * 180 * 60_000,
      worldPeoplePhysicsTimeShare: accepted ? 0.70 : null,
      languageActivityTimeShare: accepted ? 0.20 : null,
      longExplanationPanelTimeShare: accepted ? 0.10 : null,
      survivalUiActiveTimeShare: accepted ? 0.02 : null,
      needsInterruptedLanguageInteractionShare: accepted ? 0.01 : null,
      freeFoodWaterDiscoveryMsP95: accepted ? 50_000 : null,
      softFailureRecoveryMsP90: accepted ? 90_000 : null,
      huntingIncomeCoinPerActiveMinute: 0.4,
      nonviolentJobIncomeCoinPerActiveMinute: 1,
      huntingIncomeVsNonviolentJobRatio: 0.4,
      forcedHuntCount: 0,
      wildlifeHarmEventCount: 0,
      duplicateCorpseLotCurrencyCount: 0,
      minimumNeedsValueObserved: accepted ? 20 : null,
      maximumActiveNewWordsInAnySegment: accepted ? 2 : null,
      qualification: {
        sampleSize,
        formalAttackUnlockByDeadlineProportion: accepted ? 1 : 0,
        rangeTrialPermissionContentMsP90: accepted ? 159 * 60_000 : null,
        passes: {
          rangeTrialPermissionP90: accepted,
          formalAttackUnlockProportion: accepted,
        },
        accepted,
      },
      passes: {
        sampleCoverage: accepted,
        worldPeoplePhysicsTimeShare: accepted,
        languageActivityTimeShare: accepted,
        longExplanationPanelTimeShare: accepted,
        survivalUiActiveTimeShare: accepted,
        needsInterruptedLanguageInteractionShare: accepted,
        freeFoodWaterDiscoveryP95: accepted,
        softFailureRecoveryP90: accepted,
        qualification: accepted,
        zeroForcedHunts: true,
        zeroWildlifeHarm: true,
        huntingIncomeBalance: true,
        noDuplicateCorpseLotCurrency: true,
        needsFloor: accepted,
        activeWordFocus: accepted,
      },
      accepted,
    },
  };
}
