import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import {
  assertVerifiedRuntimeSafeRangeManifest,
  isVerifiedRuntimeSafeRangeManifest,
  readRuntimeSafeRangeManifest,
} from "./runtime-safe-range-manifest";
import type { ContentSource } from "./types";

type Obj = Record<string, unknown>;
const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, text]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(text) : parse(text) }));
function source(all: ContentSource[], suffix: string): Obj { const value = all.find((item) => item.path.endsWith(suffix))?.data; if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`missing ${suffix}`); return value as Obj; }
function list(root: Obj, key: string): Obj[] { const value = root[key]; if (!Array.isArray(value)) throw new Error(`${key} is not an array`); return value as Obj[]; }
function issue(run: () => unknown, code: string): void { try { run(); throw new Error(`expected ${code}`); } catch (error) { expect(error).toBeInstanceOf(ContentValidationError); expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })])); } }

describe("N08 safe-range frozen content contract", () => {
  it("authors the exact 24x18 inert scene and guarded N02 round trip", () => {
    const manifest = compileContent(sources());
    const scene = manifest.indexes.scenes["scene.valley.safe_range"]!;
    expect(scene.size_tiles).toEqual({ width: 24, height: 18 });
    expect(list(scene as Obj, "targets").map((target) => target.target_id)).toEqual(["wood_dummy", "sandbag", "minecart", "hanging_stone", "material_collision_table"]);
    expect(list(scene as Obj, "interactions").map((interaction) => interaction.interaction_id)).toEqual(["safe_range.test_wood_dummy", "safe_range.test_sandbag", "safe_range.test_minecart", "safe_range.test_hanging_stone", "safe_range.inspect_material_collision_table"]);
    expect(list(scene as Obj, "exits")[0]).toMatchObject({ exit_id: "safe_range.to_settlement", target_scene_id: "scene.valley.settlement", target_entrance_id: "settlement.from_safe_range", traversal_guard: { predicate: "range_trial_permission == true" } });
    const settlement = manifest.indexes.scenes["scene.valley.settlement"]!;
    expect(list(settlement as Obj, "exits")).toContainEqual(expect.objectContaining({ exit_id: "settlement.to_safe_range", target_scene_id: "scene.valley.safe_range", target_entrance_id: "safe_range.from_settlement", traversal_guard: { predicate: "range_trial_permission == true" } }));
  });

  it("projects the exact graph, signature, authored target state and parallel calibration catalog", () => {
    const value = readRuntimeSafeRangeManifest(generated);
    expect(isVerifiedRuntimeSafeRangeManifest(value)).toBe(true);
    expect(() => assertVerifiedRuntimeSafeRangeManifest(value)).not.toThrow();
    expect(value).toMatchObject({ taskId: "ch01_first_attack_qualification", familyId: "safe_range_unseen_transfer", optional: true, canonicalAst: { subjectHead: "word.telo", commandParticle: "o", action: "word.tawa", manner: "word.wawa" }, signature: { capacity: { playerMeaningfulTokensMinimum: 4, artifactSlotsMinimum: 4 }, mp: { boundExistingWater: 13, manifestDefaultWater: 18 }, output: { phase: "liquid", massMu: 2, paidKineticBudgetEu: 8, initialSpeedBandMps: [3, 5], gravityAfterRelease: true, persistenceScope: "ephemeral", economyExportForbidden: true }, trial: { sweptVolumeCollisionCheck: true, livingOverlapRejectedBeforeCommit: true } } });
    expect(Object.values(value.prerequisiteGraph.nodes).map((node) => node.nodeId)).toEqual(["retrieve.telo.two_families", "use.motion.noncombat", "use.intensity.inert", "repair.related_graph", "retrieve.delayed"]);
    expect(value.prerequisiteGraph.nodes.repair.eligibleTargetNodeIds).toEqual(["use.motion.noncombat", "use.intensity.inert"]);
    expect(value.prerequisiteGraph.nodes.delayed).toMatchObject({ retrievalTarget: "canonical_ast_shape_or_declared_paraphrase_equivalence", unrelatedWorldEventsBetween: 2 });
    expect(value.targetPhysics.profiles.map((profile) => [profile.targetClass, profile.targetAbsorptionEu, profile.kineticCouplingRatio, profile.initialHp])).toEqual([["wood_dummy", 1.5, 0.8, 6], ["sandbag", 2.5, 0.55, 8], ["minecart", 1, 0.7, 10], ["hanging_stone", 2, 0.9, 8]]);
    expect(value.scene.materialTableInteractionPointTiles).toEqual([20, 1]);
    expect(value.parallelCalibration.actions.map((action) => action.actionId)).toEqual(["settlement.telo.h0", "settlement.telo.h1", "settlement.tawa.h0", "settlement.tawa.h1", "return_flow.wawa.inert_h0", "return_flow.wawa.inert_h1", "settlement.repair.motion_h0", "settlement.delayed_retrieval_h0"]);
    expect(value.parallelCalibration.unrelatedSemanticWorldActions.map((action) => action.actionId)).toEqual(["settlement.calibration.unrelated_delivery_commit", "settlement.calibration.unrelated_route_commit"]);
    expect(value.parallelCalibration.receipt).toEqual({ receiptRequired: true, idempotencyKeyFields: ["player_save_id", "action_id", "normalized_variant_hash"], duplicateEvidenceAwardForbidden: true });
  });

  it("fails closed on living targets, guessed physics, duplicate coverage and weakened topology", () => {
    const a = sources(), scene = source(a, "scenes/valley-safe-range.v0.1.yaml"); list(scene, "targets")[0]!.target_kind = "living_target"; issue(() => compileContent(a), "task.safe_range_scene");
    const b = sources(), attack = source(b, "spells/attack-signatures.v0.1.yaml"), signature = list(attack, "signatures")[0]!, physics = signature.safe_range_target_physics as Obj, profiles = list(physics, "profiles"); profiles[1]!.target_class = "wood_dummy"; issue(() => compileContent(b), "task.safe_range_attack");
    const c = sources(), attackC = source(c, "spells/attack-signatures.v0.1.yaml"), signatureC = list(attackC, "signatures")[0]!, profilesC = list(signatureC.safe_range_target_physics as Obj, "profiles"); profilesC[0]!.initial_hp = 0; issue(() => compileContent(c), "task.safe_range_attack");
    const d = sources(), region = source(d, "world/regions/valley-prologue.v0.1.yaml"), oldMine = list(region, "nodes").find((node) => node.node_id === "valley.old_mine_threshold")!; (oldMine.entry_condition as Obj).predicate = "range_trial_permission == true"; issue(() => compileContent(d), "task.safe_range_old_mine_guard");
    const e = sources(), task = source(e, "tasks/ch01-first-attack-qualification.v0.1.yaml"), parallel = task.parallel_calibration_station as Obj; list(parallel, "actions")[0]!.task_family_id = "made_up"; issue(() => compileContent(e), "task.safe_range_parallel_calibration");
    const i = sources(), attackI = source(i, "spells/attack-signatures.v0.1.yaml"), signatureI = list(attackI, "signatures")[0]!; (signatureI.motion_output as Obj).initial_speed_band_mps = [1, 2]; issue(() => compileContent(i), "task.safe_range_attack");
    const j = sources(), attackJ = source(j, "spells/attack-signatures.v0.1.yaml"), signatureJ = list(attackJ, "signatures")[0]!; (signatureJ.material_output as Obj).gravity_after_release = false; issue(() => compileContent(j), "task.safe_range_attack");
    const k = sources(), attackK = source(k, "spells/attack-signatures.v0.1.yaml"), signatureK = list(attackK, "signatures")[0]!; (signatureK.material_output as Obj).unchecked_override = true; issue(() => compileContent(k), "task.safe_range_attack");
    const l = sources(), sceneL = source(l, "scenes/valley-safe-range.v0.1.yaml"); list(sceneL, "interactions")[0]!.target_id = "sandbag"; issue(() => compileContent(l), "task.safe_range_scene");
    const m = sources(), taskM = source(m, "tasks/ch01-first-attack-qualification.v0.1.yaml"), parallelM = taskM.parallel_calibration_station as Obj; list(parallelM, "unrelated_semantic_world_actions")[0]!.outcome = "wildlife_harm_committed"; issue(() => compileContent(m), "task.safe_range_parallel_calibration");
    const n = sources(), sceneN = source(n, "scenes/valley-safe-range.v0.1.yaml"), tableN = list(sceneN, "targets")[4]!; tableN.interaction_point_tiles = [19, 1]; issue(() => compileContent(n), "task.safe_range_scene");
    const f = sources(), sceneF = source(f, "scenes/valley-safe-range.v0.1.yaml"), targetF = list(sceneF, "targets")[0]!; (targetF.collision_bounds_tiles as Obj).x = 24; issue(() => compileContent(f), "task.safe_range_geometry");
    const g = sources(), sceneG = source(g, "scenes/valley-safe-range.v0.1.yaml"), targetsG = list(sceneG, "targets"); targetsG[1]!.collision_bounds_tiles = structuredClone(targetsG[0]!.collision_bounds_tiles); issue(() => compileContent(g), "task.safe_range_geometry_overlap");
    const h = sources(), regionH = source(h, "world/regions/valley-prologue.v0.1.yaml"), connectionsH = list(regionH, "connections"), reverseIndex = connectionsH.findIndex((edge) => edge.from === "valley.safe_range" && edge.to === "valley.settlement"); connectionsH.splice(reverseIndex, 1); issue(() => compileContent(h), "task.safe_range_topology");
  });

  it("recomputes digest, rejects tampering and brands only reader output", () => {
    const unverified = structuredClone(generated.safeRangeQualification);
    expect(isVerifiedRuntimeSafeRangeManifest(unverified)).toBe(false);
    expect(() => assertVerifiedRuntimeSafeRangeManifest(unverified)).toThrow(/not produced/);
    const badDigest = structuredClone(generated) as typeof generated;
    badDigest.safeRangeQualification.sourceDigest = `sha256:${"0".repeat(64)}`;
    expect(() => readRuntimeSafeRangeManifest(badDigest)).toThrow(/does not match/);
    const duplicate = structuredClone(generated) as typeof generated;
    duplicate.safeRangeQualification.targetPhysics.profiles[1]!.targetClass = "wood_dummy";
    expect(() => readRuntimeSafeRangeManifest(duplicate)).toThrow(/exactly once/);
    const outside = structuredClone(generated) as any;
    outside.safeRangeQualification.targetPhysics.profiles[0].collisionBoundsTiles.x = 24;
    expect(() => readRuntimeSafeRangeManifest(outside)).toThrow(/stay inside/);
    const overlapping = structuredClone(generated) as any;
    overlapping.safeRangeQualification.targetPhysics.profiles[1].collisionBoundsTiles = structuredClone(overlapping.safeRangeQualification.targetPhysics.profiles[0].collisionBoundsTiles);
    expect(() => readRuntimeSafeRangeManifest(overlapping)).toThrow(/non-overlapping/);
    const speedTamper = structuredClone(generated) as any;
    speedTamper.safeRangeQualification.signature.output.initialSpeedBandMps = [1, 2];
    expect(() => readRuntimeSafeRangeManifest(speedTamper)).toThrow(/output envelope/);
    const extraSignature = structuredClone(generated) as any;
    extraSignature.safeRangeQualification.signature.uncheckedRuntimeOverride = true;
    expect(() => readRuntimeSafeRangeManifest(extraSignature)).toThrow(/signature envelope/);
    const interactionTamper = structuredClone(generated) as any;
    interactionTamper.safeRangeQualification.scene.interactionBindings[0].targetId = "sandbag";
    expect(() => readRuntimeSafeRangeManifest(interactionTamper)).toThrow(/interaction binding/);
    const unrelatedTamper = structuredClone(generated) as any;
    const tablePointTamper = structuredClone(generated) as any;
    tablePointTamper.safeRangeQualification.scene.materialTableInteractionPointTiles = [19, 1];
    expect(() => readRuntimeSafeRangeManifest(tablePointTamper)).toThrow(/scene\/topology/);
    unrelatedTamper.safeRangeQualification.parallelCalibration.unrelatedSemanticWorldActions[0].outcome = "wildlife_harm_committed";
    expect(() => readRuntimeSafeRangeManifest(unrelatedTamper)).toThrow(/unrelated semantic actions/);
  });
});
