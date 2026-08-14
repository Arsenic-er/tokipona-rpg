import { describe, expect, it } from "vitest";
import rpgMainSource from "./rpg-main.ts?raw";
import type {
  PrologueFlowSafeRangeCompileResult,
  PrologueFlowSafeRangePreview,
  PrologueFlowSafeRangeView,
} from "./game/prologue-flow";
import type { PrologueSafeRangeSnapshot } from "./game/prologue-safe-range";
import {
  SAFE_RANGE_UI_TEMPLATE,
  deriveSafeRangeUiModel,
  moveSafeRangeFocus,
  resolveSafeRangeUiIntent,
  type SafeRangeUiCommand,
} from "./rpg-safe-range-ui";

const safeRangeSnapshot = (
  overrides: Partial<PrologueSafeRangeSnapshot> = {},
): PrologueSafeRangeSnapshot => ({
  sceneId: "scene.valley.safe_range",
  permissionGranted: true,
  firstAttackSignatureAvailable: false,
  firstAttackSignatureCompleted: false,
  targets: {
    wood_dummy: { materialClass: "wood", completed: false },
    sandbag: { materialClass: "fiber_and_sand", completed: false },
    minecart: { materialClass: "metal", completed: false },
    hanging_stone: { materialClass: "stone", completed: false },
  },
  ...overrides,
});

const flowSnapshot = (options: Readonly<{
  mode?: "settlement" | "safe_range";
  permission?: boolean;
  safeRange?: PrologueSafeRangeSnapshot | null;
  receiptIds?: readonly string[];
  calibrated?: boolean;
  returnObserved?: boolean;
}> = {}): PrologueFlowSafeRangeView => {
  const mode = options.mode ?? "safe_range";
  const permission = options.permission ?? true;
  const safeRange = options.safeRange === undefined
    ? mode === "safe_range" ? safeRangeSnapshot({ permissionGranted: permission }) : null
    : options.safeRange;
  const receiptIds = options.receiptIds ?? [];
  const actionSpecs = [
    ["settlement.telo.h0", "settlement_water_delivery", "active_retrieval", 0, false],
    ["settlement.telo.h1", "settlement_irrigation_review", "active_retrieval", 1, false],
    ["settlement.tawa.h0", "settlement_courier_motion", "noncombat_action", 0, false],
    ["settlement.tawa.h1", "settlement_channel_navigation", "noncombat_action", 1, false],
    ["settlement.repair.motion_h0", "settlement_calibration_repair", "repair", 0, false],
    ["settlement.delayed_retrieval_h0", "settlement_delayed_retrieval", "delayed_retrieval", 0, false],
    ["settlement.calibration.unrelated_delivery_commit", "settlement_calibration_context", "unrelated_world_action", null, true],
    ["settlement.calibration.unrelated_route_commit", "settlement_calibration_context", "unrelated_world_action", null, true],
  ] as const;
  const qualificationActions = actionSpecs.map(([actionId, taskFamilyId, evidenceType, promptLevel, unrelated]) => ({
    actionId, taskFamilyId, evidenceType, promptLevel, unrelated, available: true,
    completed: unrelated
      ? receiptIds.includes(`attack-qualification-world:${actionId}`)
      : receiptIds.some((receiptId) => receiptId.includes(`:${actionId}:`)),
  }));
  return {
    mode,
    sceneId: mode === "safe_range" ? "scene.valley.safe_range" : "scene.valley.settlement",
    currentMp: 30,
    maxMp: 30,
    qualificationActions,
    settlementActionsComplete: qualificationActions.every((action) => action.completed),
    qualificationGraphComplete: qualificationActions.every((action) => action.completed) &&
      receiptIds.includes("attack-qualification-evidence-binding:return_flow.wawa.inert_h0:source-h0") &&
      receiptIds.includes("attack-qualification-evidence-binding:return_flow.wawa.inert_h1:source-h1"),
    attackCapacityCalibrated: options.calibrated ?? false,
    returnObservationComplete: options.returnObserved ?? false,
    permissionGranted: permission,
    safeRange,
  };
};
const preview = (
  overrides: Partial<PrologueFlowSafeRangePreview> = {},
): PrologueFlowSafeRangePreview => Object.freeze({
  previewId: "safe-range-preview:test",
  targetClass: "wood_dummy",
  promptLevel: 0,
  waterSource: "bound_existing",
  quotedMp: 13,
  canonicalAst: Object.freeze({
    subjectHead: "word.telo",
    commandParticle: "o",
    action: "word.tawa",
    manner: "word.wawa",
  }),
  effect: Object.freeze({
    phase: "liquid",
    massMu: 2,
    kineticEu: 8,
    speedBandMps: Object.freeze([3, 5]) as readonly [3, 5],
  }),
  ...overrides,
});

const successfulCompile = (
  value = preview(),
): PrologueFlowSafeRangeCompileResult => Object.freeze({
  ok: true,
  preview: value,
  reason: null,
  snapshot: safeRangeSnapshot(),
});

describe("RPG safe-range Flow UI boundary", () => {
  it("derives the full N02 action → calibration → permission → N08 chain from receipts and flags", () => {
    const localActionIds = [
      "settlement.telo.h0", "settlement.telo.h1", "settlement.tawa.h0", "settlement.tawa.h1",
      "settlement.repair.motion_h0", "settlement.delayed_retrieval_h0",
    ] as const;
    const unrelatedActionIds = [
      "settlement.calibration.unrelated_delivery_commit",
      "settlement.calibration.unrelated_route_commit",
    ] as const;
    const receipts = [
      ...localActionIds.map((actionId) =>
        `attack-qualification-evidence:attack-qualification:ui.safe-range:${actionId}:variant`),
      ...unrelatedActionIds.map((actionId) => `attack-qualification-world:${actionId}`),
      "attack-qualification-evidence-binding:return_flow.wawa.inert_h0:source-h0",
      "attack-qualification-evidence-binding:return_flow.wawa.inert_h1:source-h1",
    ];

    const empty = deriveSafeRangeUiModel(flowSnapshot({ mode: "settlement", permission: false }));
    expect(empty.qualificationActions).toHaveLength(8);
    expect(empty.qualificationActions.map((action) => action.actionId)).toEqual([
      ...localActionIds, ...unrelatedActionIds,
    ]);
    expect(empty).toMatchObject({
      settlementActionsComplete: false, canCalibrate: false,
      canGrantPermission: false, canEnter: false,
    });
    const action = resolveSafeRangeUiIntent(empty, {
      kind: "perform_qualification_action", actionId: "settlement.telo.h0",
    });
    expect(action).toEqual({ kind: "perform_qualification_action", actionId: "settlement.telo.h0" });
    expect(Object.keys(action!)).toEqual(["kind", "actionId"]);
    expect(JSON.stringify(action)).not.toMatch(/position|coordinate|worldRevision|proof|flag|override/);

    const readyToCalibrate = deriveSafeRangeUiModel(flowSnapshot({
      mode: "settlement", permission: false, receiptIds: receipts,
    }));
    expect(readyToCalibrate).toMatchObject({ settlementActionsComplete: true, canCalibrate: true });
    expect(readyToCalibrate.qualificationActions.every((item) => item.completed)).toBe(true);
    expect(resolveSafeRangeUiIntent(readyToCalibrate, { kind: "calibrate_attack_capacity" }))
      .toEqual({ kind: "calibrate_attack_capacity" });

    const waitingForReturn = deriveSafeRangeUiModel(flowSnapshot({
      mode: "settlement", permission: false, receiptIds: receipts, calibrated: true,
    }));
    expect(waitingForReturn).toMatchObject({
      attackCapacityCalibrated: true, returnObservationComplete: false,
      canCalibrate: false, canGrantPermission: false,
    });

    const readyForPermission = deriveSafeRangeUiModel(flowSnapshot({
      mode: "settlement", permission: false, receiptIds: receipts,
      calibrated: true, returnObserved: true,
    }));
    expect(readyForPermission).toMatchObject({ canGrantPermission: true, canEnter: false });
    expect(resolveSafeRangeUiIntent(readyForPermission, { kind: "grant_range_trial_permission" }))
      .toEqual({ kind: "grant_range_trial_permission" });

    const permitted = deriveSafeRangeUiModel(flowSnapshot({
      mode: "settlement", permission: true, receiptIds: receipts,
      calibrated: true, returnObserved: true,
    }));
    expect(permitted).toMatchObject({ canGrantPermission: false, canEnter: true });
    expect(resolveSafeRangeUiIntent(permitted, { kind: "enter_safe_range" }))
      .toEqual({ kind: "enter_safe_range" });
  });

  it("keeps calibration disabled when N07 wawa bindings are absent despite all visible N02 receipts", () => {
    const visibleReceipts = [
      "settlement.telo.h0", "settlement.telo.h1", "settlement.tawa.h0", "settlement.tawa.h1",
      "settlement.repair.motion_h0", "settlement.delayed_retrieval_h0",
    ].map((actionId) =>
      `attack-qualification-evidence:attack-qualification:ui.safe-range:${actionId}:variant`);
    visibleReceipts.push(
      "attack-qualification-world:settlement.calibration.unrelated_delivery_commit",
      "attack-qualification-world:settlement.calibration.unrelated_route_commit",
    );
    const model = deriveSafeRangeUiModel(flowSnapshot({
      mode: "settlement", permission: false, receiptIds: visibleReceipts,
    }));
    expect(model).toMatchObject({ settlementActionsComplete: true, canCalibrate: false });
  });
  it("offers the N02→N08 gateway only from settlement with the authoritative permission flag", () => {
    const allowed = deriveSafeRangeUiModel(flowSnapshot({ mode: "settlement" }));
    expect(allowed).toMatchObject({ gatewayVisible: true, canEnter: true, panelVisible: false });
    expect(resolveSafeRangeUiIntent(allowed, { kind: "enter_safe_range" }))
      .toEqual({ kind: "enter_safe_range" });

    const denied = deriveSafeRangeUiModel(flowSnapshot({ mode: "settlement", permission: false }));
    expect(denied).toMatchObject({ gatewayVisible: true, canEnter: false, panelVisible: false });
    expect(resolveSafeRangeUiIntent(denied, { kind: "enter_safe_range" })).toBeNull();
  });

  it("projects inert semantic materials without HP, plus canonical AST, MP quotes and 2 MU / 8 EU", () => {
    const model = deriveSafeRangeUiModel(flowSnapshot());
    expect(model.targets.map((target) => [
      target.targetClass, target.materialClass,
    ])).toEqual([
      ["wood_dummy", "wood"],
      ["sandbag", "fiber_and_sand"],
      ["minecart", "metal"],
      ["hanging_stone", "stone"],
    ]);
    expect(model.waterSources.map((source) => source.quotedMp)).toEqual([13, 18]);
    expect(model.canonicalAst).toBe("word.telo o word.tawa word.wawa");
    expect(model.effect).toEqual({ phase: "liquid", massMu: 2, kineticEu: 8, speedBandMps: [3, 5] });
    expect(model.targetPolicy).toBe("仅限四个惰性靶具；人物与生物不是目标");
  });

  it("emits a compile command with exactly target, prompt and water semantic fields", () => {
    const model = deriveSafeRangeUiModel(flowSnapshot(), null, {
      targetClass: "sandbag", waterSource: "manifest_default", promptLevel: 1,
    });
    const command = resolveSafeRangeUiIntent(model, { kind: "compile" });
    expect(command).toEqual({
      kind: "compile", targetClass: "sandbag", waterSource: "manifest_default", promptLevel: 1,
    });
    expect(Object.keys(command as Extract<SafeRangeUiCommand, { kind: "compile" }>).sort())
      .toEqual(["kind", "promptLevel", "targetClass", "waterSource"]);
    expect(JSON.stringify(command)).not.toMatch(/direction|utterance|damage|swept|living|currentHp|permission/);
  });

  it("executes only by Flow previewId and rejects malformed or stale display previews", () => {
    const display = preview();
    const ready = deriveSafeRangeUiModel(flowSnapshot(), successfulCompile(display));
    const execute = resolveSafeRangeUiIntent(ready, { kind: "execute" });
    expect(execute).toEqual({ kind: "execute", previewId: "safe-range-preview:test" });
    expect(Object.keys(execute as Extract<SafeRangeUiCommand, { kind: "execute" }>))
      .toEqual(["kind", "previewId"]);

    const emptyId = deriveSafeRangeUiModel(flowSnapshot(), successfulCompile(preview({ previewId: "" })));
    expect(emptyId).toMatchObject({ contractValid: false, canExecute: false, preview: null });

    const wrongAst = preview({
      canonicalAst: {
        subjectHead: "word.telo", commandParticle: "o", action: "word.tawa", manner: "word.ante",
      } as unknown as PrologueFlowSafeRangePreview["canonicalAst"],
    });
    const rejected = deriveSafeRangeUiModel(flowSnapshot(), successfulCompile(wrongAst));
    expect(rejected).toMatchObject({ contractValid: false, canExecute: false, preview: null });

    const stale = deriveSafeRangeUiModel(flowSnapshot(), successfulCompile(display), {
      targetClass: "sandbag",
    });
    expect(stale).toMatchObject({ contractValid: false, canExecute: false, preview: null });
  });

  it("unlocks material-table inspection only after all four authoritative target snapshots complete", () => {
    const partialTargets = {
      ...safeRangeSnapshot().targets,
      wood_dummy: { ...safeRangeSnapshot().targets.wood_dummy, completed: true },
    };
    const partial = deriveSafeRangeUiModel(flowSnapshot({
      safeRange: safeRangeSnapshot({ firstAttackSignatureAvailable: true, targets: partialTargets }),
    }));
    expect(partial).toMatchObject({ firstAttackSignatureAvailable: true, canInspectTable: false });

    const completedTargets = Object.fromEntries(Object.entries(safeRangeSnapshot().targets).map(([key, value]) => [
      key, { ...value, completed: true },
    ])) as unknown as PrologueSafeRangeSnapshot["targets"];
    const complete = deriveSafeRangeUiModel(flowSnapshot({
      safeRange: safeRangeSnapshot({ targets: completedTargets }),
    }));
    expect(complete.canInspectTable).toBe(true);
    expect(resolveSafeRangeUiIntent(complete, { kind: "inspect_material_table" }))
      .toEqual({ kind: "inspect_material_table" });

    const recorded = deriveSafeRangeUiModel(flowSnapshot({
      safeRange: safeRangeSnapshot({ targets: completedTargets, firstAttackSignatureCompleted: true }),
    }));
    expect(recorded).toMatchObject({ canInspectTable: false, firstAttackSignatureCompleted: true });
  });

  it("keeps navigation/recovery semantic and provides cyclic keyboard movement", () => {
    const model = deriveSafeRangeUiModel(flowSnapshot());
    expect(resolveSafeRangeUiIntent(model, { kind: "return_settlement" }))
      .toEqual({ kind: "return_settlement" });
    expect(resolveSafeRangeUiIntent(model, { kind: "recover_softlock" }))
      .toEqual({ kind: "recover_softlock" });
    expect(resolveSafeRangeUiIntent(model, { kind: "reset_checkpoint" }))
      .toEqual({ kind: "reset_checkpoint" });
    expect(moveSafeRangeFocus(0, "ArrowLeft", 4)).toBe(3);
    expect(moveSafeRangeFocus(3, "ArrowRight", 4)).toBe(0);
    expect(moveSafeRangeFocus(2, "Home", 4)).toBe(0);
    expect(moveSafeRangeFocus(0, "End", 4)).toBe(3);
    expect(moveSafeRangeFocus(1, "Enter", 4)).toBe(1);
  });

  it("keeps the browser port on the ten narrow Flow methods", () => {
    for (const method of [
      "enterSafeRange", "compileSafeRange", "executeSafeRange", "inspectSafeRangeMaterialTable",
      "safeRangeToSettlement", "recoverSafeRangeSoftLock", "resetSafeRangeCheckpoint",
    ]) expect(rpgMainSource).toContain(`this.flow.${method}(`);
    const browserMethod = rpgMainSource.slice(
      rpgMainSource.indexOf("safeRange(command: SafeRangeUiCommand)"),
      rpgMainSource.indexOf("returnFlow(command: ReturnFlowUiCommand)"),
    );
    expect(browserMethod).toContain("targetClass: command.targetClass");
    expect(browserMethod).toContain("promptLevel: command.promptLevel");
    expect(browserMethod).toContain("waterSource: command.waterSource");
    expect(browserMethod).toContain("command.previewId");
    expect(browserMethod).not.toMatch(/direction|utterance|synchronize|living|swept|damage|currentHp|permissionGranted/);
    expect(rpgMainSource).toContain("safeRangeUi.render(port.safeRangeView(), port.safeRangeCompileResult())");
  });
  it("declares labelled radio groups and a polite atomic live region without text input", () => {
    expect(SAFE_RANGE_UI_TEMPLATE).toContain("aria-labelledby=\"safe-range-heading\"");
    expect(SAFE_RANGE_UI_TEMPLATE.match(/role=\"radiogroup\"/g)).toHaveLength(3);
    expect(SAFE_RANGE_UI_TEMPLATE).toContain("role=\"radio\"");
    expect(SAFE_RANGE_UI_TEMPLATE).toContain("role=\"status\"");
    expect(SAFE_RANGE_UI_TEMPLATE).toContain("aria-live=\"polite\"");
    expect(SAFE_RANGE_UI_TEMPLATE).toContain("aria-atomic=\"true\"");
    expect(SAFE_RANGE_UI_TEMPLATE).not.toContain("<input");
    expect(SAFE_RANGE_UI_TEMPLATE).not.toContain("contenteditable");
  });
});
