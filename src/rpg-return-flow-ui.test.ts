import { describe, expect, it } from "vitest";
import {
  RETURN_FLOW_UI_CONTRACT,
  deriveReturnFlowUiModel,
  moveReturnFlowFocus,
  resolveReturnFlowUiIntent,
  type ReturnFlowUiFlowSnapshot,
} from "./rpg-return-flow-ui";

const solutions = RETURN_FLOW_UI_CONTRACT.solutions;

function snapshot(overrides: Readonly<Record<string, unknown>> = {}): ReturnFlowUiFlowSnapshot {
  return {
    mode: "return_flow",
    runtime: { sceneId: "scene.valley.return_channel" },
    returnFlow: {
      settlementSupplyStable: false,
      wetMeadowRestored: false,
      solutionId: null,
      materialPatchApplied: false,
      prologueReturnObserved: false,
      taskCompleted: false,
      wawa: { discoveryState: "unknown", attunementState: "locked", learningState: null, inertMechanismEvidenceCount: 0 },
      solutionContracts: solutions,
      softLockRecovery: { maximumSeconds: RETURN_FLOW_UI_CONTRACT.maximumSoftlockRecoverySeconds },
    },
    returnFlowProgress: { selectedSolutionId: null, completedActionIds: [] },
    ...overrides,
  };
}

function withFlow(
  base: ReturnFlowUiFlowSnapshot,
  flow: Partial<NonNullable<ReturnFlowUiFlowSnapshot["returnFlow"]>>,
  progress?: ReturnFlowUiFlowSnapshot["returnFlowProgress"],
): ReturnFlowUiFlowSnapshot {
  return { ...base, returnFlow: { ...base.returnFlow!, ...flow },
    returnFlowProgress: progress === undefined ? base.returnFlowProgress : progress };
}

describe("RPG N07 return-flow UI model", () => {
  it("is visible only in N07 return_flow mode", () => {
    expect(deriveReturnFlowUiModel(snapshot()).panelVisible).toBe(true);
    expect(deriveReturnFlowUiModel(snapshot({ mode: "cistern" })).panelVisible).toBe(false);
    expect(deriveReturnFlowUiModel(snapshot({ runtime: { sceneId: "scene.valley.settlement" } })).panelVisible).toBe(false);
  });

  it("renders exactly the generated three non-magic routes and their authored action order", () => {
    const model = deriveReturnFlowUiModel(snapshot());
    expect(model.routes.map((route) => route.id)).toEqual([
      "return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel",
    ]);
    expect(model.routes.map((route) => route.actions.map((action) => action.id))).toEqual(
      solutions.map((solution) => solution.requiredActions),
    );
    expect(model.routes.every((route) => route.actions[0]?.indicatorObservation)).toBe(true);
    expect(model.routes.every((route) => route.actions[0]?.enabled)).toBe(true);
    expect(model.routes.every((route) => route.actions.slice(1).every((action) => !action.enabled))).toBe(true);
    expect(model).toMatchObject({ phase: "observe_indicator", canDiscover: false, canAttune: false });
  });

  it("emits only semantic allowlisted commands and blocks out-of-order or cross-route actions", () => {
    const initial = deriveReturnFlowUiModel(snapshot());
    const inspect = solutions[0]!.requiredActions[0]!;
    expect(resolveReturnFlowUiIntent(initial, {
      kind: "perform_action", solutionId: solutions[0]!.id, actionId: inspect,
    })).toEqual({ kind: "perform_action", actionId: inspect });
    expect(resolveReturnFlowUiIntent(initial, {
      kind: "perform_action", solutionId: solutions[0]!.id, actionId: solutions[0]!.requiredActions[1]!,
    })).toBeNull();
    expect(resolveReturnFlowUiIntent(initial, {
      kind: "perform_action", solutionId: solutions[0]!.id, actionId: "raw.world.fact",
    })).toBeNull();

    const observedSnapshot = withFlow(snapshot(), {}, {
      selectedSolutionId: solutions[0]!.id,
      completedActionIds: [inspect],
    });
    const observed = deriveReturnFlowUiModel(observedSnapshot);
    expect(observed).toMatchObject({ phase: "discover_wawa", canDiscover: true });
    expect(resolveReturnFlowUiIntent(observed, { kind: "discover_wawa" })).toEqual({ kind: "discover_wawa" });
    expect(resolveReturnFlowUiIntent(observed, {
      kind: "perform_action", solutionId: solutions[1]!.id, actionId: solutions[1]!.requiredActions[0]!,
    })).toBeNull();
    expect(Object.keys(resolveReturnFlowUiIntent(observed, { kind: "discover_wawa" })!)).toEqual(["kind"]);
  });

  it("keeps sequential route work available while wawa discovery and attunement remain independent", () => {
    const route = solutions[1]!;
    const inspected = withFlow(snapshot(), {
      wawa: { discoveryState: "discovered", attunementState: "locked", learningState: "discovered", inertMechanismEvidenceCount: 1 },
    }, { selectedSolutionId: route.id, completedActionIds: [route.requiredActions[0]!] });
    const discovery = deriveReturnFlowUiModel(inspected);
    expect(discovery).toMatchObject({ phase: "attune_wawa", canAttune: true });
    expect(discovery.routes[1]!.actions[1]!.enabled).toBe(true);

    const partial = withFlow(inspected, {
      wawa: { discoveryState: "discovered", attunementState: "attuned", learningState: "discovered", inertMechanismEvidenceCount: 2 },
    });
    const readyForStep = deriveReturnFlowUiModel(partial);
    expect(readyForStep.routes[1]!.actions[1]!.enabled).toBe(true);
    expect(readyForStep.routes[1]!.actions[2]!.enabled).toBe(false);

    const allActions = withFlow(partial, {}, { selectedSolutionId: route.id, completedActionIds: route.requiredActions });
    const canCommit = deriveReturnFlowUiModel(allActions);
    expect(canCommit).toMatchObject({ phase: "commit_route" });
    expect(canCommit.routes[1]!.canCommit).toBe(true);
    expect(resolveReturnFlowUiIntent(canCommit, { kind: "complete_solution", solutionId: route.id }))
      .toEqual({ kind: "complete_solution", solutionId: route.id });
  });

  it("shows two flags, the patch, zero attack/kill and bounded recovery without raw evidence fields", () => {
    const model = deriveReturnFlowUiModel(snapshot());
    expect(model.flags).toEqual({ settlementSupplyStable: false, wetMeadowRestored: false });
    expect(model.patch).toEqual({ id: "patch.valley.return_flow.v0.1", applied: false });
    expect(model.zeroAttack).toEqual({ mainline: true, mandatoryKills: 0, mandatoryCombatEncounters: 0 });
    expect(model.recovery.maximumSeconds).toBeLessThanOrEqual(60);
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain("provenance");
    expect(serialized).not.toContain("sourceObjectClass");
    expect(serialized).not.toContain("harmApplied");
    expect(serialized).not.toContain("variantHash");
  });

  it("offers H0/H1 after route commit without making grounding a return prerequisite", () => {
    const route = solutions[2]!;
    const completed = withFlow(snapshot(), {
      settlementSupplyStable: true,
      wetMeadowRestored: true,
      solutionId: route.id,
      materialPatchApplied: true,
      taskCompleted: true,
      wawa: { discoveryState: "discovered", attunementState: "attuned", learningState: "discovered", inertMechanismEvidenceCount: 2 },
    }, null);
    const model = deriveReturnFlowUiModel(completed);
    expect(model).toMatchObject({ phase: "ground_wawa", canGround: true, canReturn: true });
    expect(resolveReturnFlowUiIntent(model, { kind: "ground_wawa", promptLevel: 0 }))
      .toEqual({ kind: "ground_wawa", solutionId: route.id, promptLevel: 0 });
    expect(resolveReturnFlowUiIntent(model, { kind: "ground_wawa", promptLevel: 1 }))
      .toEqual({ kind: "ground_wawa", solutionId: route.id, promptLevel: 1 });

    const grounded = deriveReturnFlowUiModel(withFlow(completed, {
      wawa: { discoveryState: "discovered", attunementState: "attuned", learningState: "grounded", inertMechanismEvidenceCount: 3 },
    }));
    expect(grounded).toMatchObject({ phase: "return_settlement", canGround: false, canReturn: true });
    expect(resolveReturnFlowUiIntent(grounded, { kind: "return_settlement" })).toEqual({ kind: "return_settlement" });
  });

  it("allows a tool-only completion and return without fabricating wawa evidence", () => {
    const route = solutions[0]!;
    const actionsDone = deriveReturnFlowUiModel(withFlow(snapshot(), {}, {
      selectedSolutionId: route.id, completedActionIds: route.requiredActions,
    }));
    expect(actionsDone.routes[0]).toMatchObject({ canCommit: true });
    expect(actionsDone).toMatchObject({ canDiscover: true, canAttune: false, canGround: false, grounded: false });

    const toolOnlyCompletion = deriveReturnFlowUiModel(withFlow(snapshot(), {
      settlementSupplyStable: true, wetMeadowRestored: true, solutionId: route.id,
      materialPatchApplied: true, taskCompleted: true,
    }, null));
    expect(toolOnlyCompletion).toMatchObject({
      phase: "return_settlement", canReturn: true, canGround: false, grounded: false, canDiscover: true,
    });
    expect(resolveReturnFlowUiIntent(toolOnlyCompletion, { kind: "return_settlement" }))
      .toEqual({ kind: "return_settlement" });
  });

  it("treats reset/reload task-local progress as empty and fails closed on drift", () => {
    const route = solutions[0]!;
    const progressed = deriveReturnFlowUiModel(withFlow(snapshot(), {}, {
      selectedSolutionId: route.id, completedActionIds: route.requiredActions.slice(0, 2),
    }));
    expect(progressed.selectedSolutionId).toBe(route.id);
    const reset = deriveReturnFlowUiModel(snapshot());
    expect(reset).toMatchObject({ selectedSolutionId: null, phase: "observe_indicator" });

    const drifted = deriveReturnFlowUiModel(withFlow(snapshot(), {
      solutionContracts: [...solutions, { id: "optional_magic", routeKind: "magic", mainline: false, requiredActions: ["cast"] }],
    }));
    expect(drifted).toMatchObject({ contractValid: false, phase: "contract_error", routes: [] });
  });

  it("supports wrapping arrow keys plus Home and End for a roving keyboard focus", () => {
    expect(moveReturnFlowFocus(0, "ArrowLeft", 4)).toBe(3);
    expect(moveReturnFlowFocus(3, "ArrowRight", 4)).toBe(0);
    expect(moveReturnFlowFocus(2, "Home", 4)).toBe(0);
    expect(moveReturnFlowFocus(1, "End", 4)).toBe(3);
    expect(moveReturnFlowFocus(2, "Enter", 4)).toBe(2);
    expect(moveReturnFlowFocus(0, "ArrowRight", 0)).toBe(-1);
  });
});
