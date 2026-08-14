import { describe, expect, it } from "vitest";
import { PrologueFlowSession } from "../game/prologue-flow";
import { runPrologueThreeHourAcceptance } from "./prologue-three-hour-runner";

describe("deterministic three-hour prologue acceptance runner", () => {
  it.each(["primary", "alternate"] as const)("completes the %s non-attack route through N07 and the old-mine threshold", (routeVariant) => {
    const report = runPrologueThreeHourAcceptance({ sessionId: `acceptance.${routeVariant}`, routeVariant, injectSoftRecoveries: true });
    expect(report).toMatchObject({
      completed: true, routeVariant, contentMinutes: 180, elapsedMinutesIncludingExcluded: 210,
      activity: { accepted: true, shares: { world_people_physics: 0.70, language: 0.20, long_explanation: 0.10 } },
      reloadCount: 3, softRecoveryCount: 2, killCount: 0, wildlifeHarmEventCount: 0,
      finalSceneId: "scene.valley.settlement", oldMineVisited: true, peacefulExitReceiptPresent: true,
    });
    expect(report.routeIds.every((route) => !route.includes("attack"))).toBe(true);
    expect(report.meaningfulReturnWorldDeltaIds).toEqual([
      "material_patch:patch.valley.return_flow.v0.1", "settlement_supply_stable", "wet_meadow_restored",
    ]);
    expect(report.telemetryEvents.map((event) => event.sequence)).toEqual(report.telemetryEvents.map((_, index) => index + 1));
    expect(report.telemetryEvents.every((event) => event.schemaVersion === "prologue.telemetry.v0.1")).toBe(true);
    expect(() => PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(report.finalSave)))).not.toThrow();
  });

  it("is deterministic across identical route runs without reusing transaction identity", () => {
    const left = runPrologueThreeHourAcceptance({ sessionId: "acceptance.determinism.left", routeVariant: "primary" });
    const right = runPrologueThreeHourAcceptance({ sessionId: "acceptance.determinism.right", routeVariant: "primary" });
    expect(left.routeIds).toEqual(right.routeIds);
    expect(left.activity).toEqual(right.activity);
    expect(left.telemetryEvents.map(({ eventId, segmentId, primaryActivity, contentActiveMs }) => ({ eventId, segmentId, primaryActivity, contentActiveMs })))
      .toEqual(right.telemetryEvents.map(({ eventId, segmentId, primaryActivity, contentActiveMs }) => ({ eventId, segmentId, primaryActivity, contentActiveMs })));
  });
});
