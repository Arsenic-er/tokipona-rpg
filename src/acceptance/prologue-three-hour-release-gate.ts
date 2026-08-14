import { PrologueFlowSession } from "../game/prologue-flow";
import {
  runPrologueThreeHourAcceptance,
  type PrologueAcceptanceRouteVariant,
  type PrologueThreeHourAcceptanceReport,
} from "./prologue-three-hour-runner";

export const PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA =
  "tokipona.prologue-three-hour-release-gate.v0.1" as const;

export interface PrologueThreeHourReleaseScenarioReport {
  readonly scenarioId: "primary_soft_recovery" | "alternate_soft_recovery" | "formal_qualification";
  readonly routeVariant: PrologueAcceptanceRouteVariant;
  readonly routeIds: readonly [string, string, string];
  readonly injectedSoftRecovery: boolean;
  readonly formalQualification: boolean;
  readonly reloadCount: number;
  readonly softRecoveryCount: number;
  readonly oldMineVisited: true;
  readonly peacefulExitReceiptPresent: true;
}

export interface PrologueThreeHourReleaseGateReport {
  readonly schemaVersion: typeof PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA;
  readonly status: "passed";
  readonly scenarioCount: 3;
  readonly contentMinutesPerScenario: 180;
  readonly elapsedMinutesIncludingExcludedPerScenario: 210;
  readonly scenarios: readonly PrologueThreeHourReleaseScenarioReport[];
  readonly activityShares: Readonly<{
    worldPeoplePhysics: 0.70;
    language: 0.20;
    longExplanation: 0.10;
  }>;
  readonly allCadenceContractsAccepted: true;
  readonly totalReloadCount: number;
  readonly totalSoftRecoveryCount: number;
  readonly totalKillCount: 0;
  readonly totalWildlifeHarmEventCount: 0;
  readonly meaningfulReturnWorldDeltaCountMinimum: 3;
  readonly qualification: Readonly<{
    attemptedScenarioCount: 1;
    rangeTrialPermissionContentMinutes: number;
    firstAttackSignatureContentMinutes: number;
    deadlineContentMinutes: 180;
    completedBeforeDeadline: true;
  }>;
}

const SCENARIOS = Object.freeze([
  Object.freeze({
    scenarioId: "primary_soft_recovery" as const,
    sessionId: "release.three-hour.primary",
    routeVariant: "primary" as const,
    injectSoftRecoveries: true,
    attemptFormalAttackQualification: false,
  }),
  Object.freeze({
    scenarioId: "alternate_soft_recovery" as const,
    sessionId: "release.three-hour.alternate",
    routeVariant: "alternate" as const,
    injectSoftRecoveries: true,
    attemptFormalAttackQualification: false,
  }),
  Object.freeze({
    scenarioId: "formal_qualification" as const,
    sessionId: "release.three-hour.qualification",
    routeVariant: "primary" as const,
    injectSoftRecoveries: false,
    attemptFormalAttackQualification: true,
  }),
]);

export function runPrologueThreeHourReleaseGate(): PrologueThreeHourReleaseGateReport {
  const completed = SCENARIOS.map((scenario) => Object.freeze({
    scenario,
    report: runPrologueThreeHourAcceptance({
      sessionId: scenario.sessionId,
      routeVariant: scenario.routeVariant,
      injectSoftRecoveries: scenario.injectSoftRecoveries,
      attemptFormalAttackQualification: scenario.attemptFormalAttackQualification,
    }),
  }));
  for (const entry of completed) assertReleaseScenario(entry.report, entry.scenario);

  const primary = completed[0]!.report;
  const alternate = completed[1]!.report;
  if (primary.routeIds[0] === alternate.routeIds[0] ||
      primary.routeIds[1] === alternate.routeIds[1] ||
      primary.routeIds[2] === alternate.routeIds[2]) {
    throw new Error("three-hour release routes do not cover distinct authored solutions");
  }
  const qualification = completed[2]!.report.qualificationTiming;
  if (qualification.rangeTrialPermissionContentMs === null ||
      qualification.firstAttackSignatureContentMs === null) {
    throw new Error("formal three-hour qualification timing is missing");
  }
  const permissionMinutes = exactMinutes(
    qualification.rangeTrialPermissionContentMs,
    "range-trial permission timing",
  );
  const signatureMinutes = exactMinutes(
    qualification.firstAttackSignatureContentMs,
    "first attack signature timing",
  );
  if (permissionMinutes > 180 || signatureMinutes > 180 || signatureMinutes < permissionMinutes) {
    throw new Error("formal attack qualification exceeded the authored content deadline");
  }

  return deepFreeze({
    schemaVersion: PROLOGUE_THREE_HOUR_RELEASE_GATE_SCHEMA,
    status: "passed",
    scenarioCount: 3,
    contentMinutesPerScenario: 180,
    elapsedMinutesIncludingExcludedPerScenario: 210,
    scenarios: completed.map(({ scenario, report }) => ({
      scenarioId: scenario.scenarioId,
      routeVariant: scenario.routeVariant,
      routeIds: report.routeIds,
      injectedSoftRecovery: scenario.injectSoftRecoveries,
      formalQualification: scenario.attemptFormalAttackQualification,
      reloadCount: report.reloadCount,
      softRecoveryCount: report.softRecoveryCount,
      oldMineVisited: true as const,
      peacefulExitReceiptPresent: true as const,
    })),
    activityShares: {
      worldPeoplePhysics: 0.70,
      language: 0.20,
      longExplanation: 0.10,
    },
    allCadenceContractsAccepted: true,
    totalReloadCount: completed.reduce((total, entry) => total + entry.report.reloadCount, 0),
    totalSoftRecoveryCount: completed.reduce(
      (total, entry) => total + entry.report.softRecoveryCount,
      0,
    ),
    totalKillCount: 0,
    totalWildlifeHarmEventCount: 0,
    meaningfulReturnWorldDeltaCountMinimum: 3,
    qualification: {
      attemptedScenarioCount: 1,
      rangeTrialPermissionContentMinutes: permissionMinutes,
      firstAttackSignatureContentMinutes: signatureMinutes,
      deadlineContentMinutes: 180,
      completedBeforeDeadline: true,
    },
  });
}

function assertReleaseScenario(
  report: PrologueThreeHourAcceptanceReport,
  expected: typeof SCENARIOS[number],
): void {
  if (!report.completed || report.routeVariant !== expected.routeVariant ||
      report.contentMinutes !== 180 || report.elapsedMinutesIncludingExcluded !== 210 ||
      !report.activity.accepted || !report.cadence.accepted || report.killCount !== 0 ||
      report.wildlifeHarmEventCount !== 0 || report.finalSceneId !== "scene.valley.settlement" ||
      !report.oldMineVisited || !report.peacefulExitReceiptPresent ||
      report.meaningfulReturnWorldDeltaIds.length < 3 ||
      report.routeIds.some((routeId) => routeId.includes("attack"))) {
    throw new Error(`three-hour release scenario ${expected.scenarioId} failed invariants`);
  }
  if (report.activity.shares.world_people_physics !== 0.70 ||
      report.activity.shares.language !== 0.20 ||
      report.activity.shares.long_explanation !== 0.10) {
    throw new Error(`three-hour release scenario ${expected.scenarioId} changed activity shares`);
  }
  if ((expected.injectSoftRecoveries && report.softRecoveryCount < 2) ||
      (!expected.injectSoftRecoveries && report.softRecoveryCount !== 0) ||
      report.reloadCount < 3) {
    throw new Error(`three-hour release scenario ${expected.scenarioId} missed recovery coverage`);
  }
  if (expected.attemptFormalAttackQualification !==
      (report.qualificationTiming.rangeTrialPermissionContentMs !== null &&
       report.qualificationTiming.firstAttackSignatureContentMs !== null)) {
    throw new Error(`three-hour release scenario ${expected.scenarioId} qualification drifted`);
  }
  PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(report.finalSave)) as unknown);
}

function exactMinutes(milliseconds: number, label: string): number {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds % 60_000 !== 0) {
    throw new Error(`${label} is not an exact non-negative minute count`);
  }
  return milliseconds / 60_000;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
