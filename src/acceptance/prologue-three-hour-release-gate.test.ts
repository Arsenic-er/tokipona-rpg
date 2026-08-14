import { describe, expect, it } from "vitest";
import {
  PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA,
  runPrologueThreeHourReleaseGate,
} from "./prologue-three-hour-release-gate";

const report = runPrologueThreeHourReleaseGate();
const lifecycleEvent = (globalThis as typeof globalThis & {
  process?: Readonly<{ env?: Readonly<Record<string, string | undefined>> }>;
}).process?.env?.npm_lifecycle_event;
if (lifecycleEvent === "acceptance:three-hour") console.log(JSON.stringify(report));

describe("three-hour prologue release gate", () => {
  it("covers both non-attack routes, recovery cuts, formal qualification, and the peaceful exit", () => {
    expect(report).toEqual({
      schemaVersion: PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA,
      status: "passed",
      scenarioCount: 3,
      contentMinutesPerScenario: 180,
      elapsedMinutesIncludingExcludedPerScenario: 210,
      scenarios: [
        {
          scenarioId: "primary_soft_recovery",
          routeVariant: "primary",
          routeIds: [
            "waterwheel.repair_axle",
            "service.open_bypass_valve",
            "return_flow.repair_overflow",
          ],
          injectedSoftRecovery: true,
          formalQualification: false,
          reloadCount: 3,
          softRecoveryCount: 2,
          oldMineVisited: true,
          peacefulExitReceiptPresent: true,
        },
        {
          scenarioId: "alternate_soft_recovery",
          routeVariant: "alternate",
          routeIds: [
            "waterwheel.clear_natural_inflow",
            "service.place_wood_platform",
            "return_flow.clear_mud",
          ],
          injectedSoftRecovery: true,
          formalQualification: false,
          reloadCount: 3,
          softRecoveryCount: 2,
          oldMineVisited: true,
          peacefulExitReceiptPresent: true,
        },
        {
          scenarioId: "formal_qualification",
          routeVariant: "primary",
          routeIds: [
            "waterwheel.repair_axle",
            "service.open_bypass_valve",
            "return_flow.repair_overflow",
          ],
          injectedSoftRecovery: false,
          formalQualification: true,
          reloadCount: 3,
          softRecoveryCount: 0,
          oldMineVisited: true,
          peacefulExitReceiptPresent: true,
        },
      ],
      activityShares: {
        worldPeoplePhysics: 0.70,
        language: 0.20,
        longExplanation: 0.10,
      },
      allCadenceContractsAccepted: true,
      totalReloadCount: 9,
      totalSoftRecoveryCount: 4,
      totalKillCount: 0,
      totalWildlifeHarmEventCount: 0,
      meaningfulReturnWorldDeltaCountMinimum: 3,
      qualification: {
        attemptedScenarioCount: 1,
        rangeTrialPermissionContentMinutes: 159,
        firstAttackSignatureContentMinutes: 159,
        deadlineContentMinutes: 180,
        completedBeforeDeadline: true,
      },
    });
  });

  it("publishes only aggregate release evidence and no save, ledger, telemetry, or player identity", () => {
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(
      /finalSave|telemetryEvents|sessionId|receiptIndex|eventLedger|playerSaveId|rawUtterance|rawText/,
    );
    expect(Object.isFrozen(report)).toBe(true);
    expect(report.scenarios.every(Object.isFrozen)).toBe(true);
  });
});
