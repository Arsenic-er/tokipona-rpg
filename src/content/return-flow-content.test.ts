import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import generated from "../generated/content-runtime.v0.1.json";
import { compileContent, ContentValidationError } from "./compiler";
import { readRuntimeReturnFlowTaskManifest } from "./runtime-task-manifest";
import type { ContentSource } from "./types";

type Obj = Record<string, unknown>;
const canonicalReturnChannelTargetIds = [
  "return_flow.inert_force_indicator",
  "return_flow.overflow_gate",
  "return_flow.mud_blockage",
  "return_flow.old_channel",
  "return_flow.split_flow_gauge",
  "return_flow.return_spout",
  "return_wetland.large_creature.nest_trace",
  "return_wetland.large_creature.young_trace",
  "return_wetland.large_creature.migration_channel",
  "return_wetland.large_creature.food_scent_guide",
  "return_wetland.large_creature.nonlethal_barrier",
] as const;
const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", { eager: true, import: "default", query: "?raw" }) as Record<string, string>;
const sources = (): ContentSource[] => Object.entries(raw).map(([path, value]) => ({ path: path.replace(/^\.\.\/\.\.\//, ""), data: path.endsWith(".json") ? JSON.parse(value) : parse(value) }));
const source = (all: ContentSource[], suffix: string): Obj => all.find(x => x.path.endsWith(suffix))!.data as Obj;
const list = (root: Obj, key: string): Obj[] => root[key] as Obj[];
const issue = (run: () => unknown, code: string) => { try { run(); throw new Error("expected validation error"); } catch (error) { expect(error).toBeInstanceOf(ContentValidationError); expect((error as ContentValidationError).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })])); } };

describe("N07 return-flow frozen content contract", () => {
  it("compiles exact topology, three non-magic solutions and two world goals", () => {
    const manifest = compileContent(sources());
    const scene = manifest.indexes.scenes["scene.valley.return_channel"]!;
    const task = manifest.indexes.tasks.ch01_return_flow!;
    expect(scene.size_tiles).toEqual({ width: 30, height: 26 });
    expect(list(scene as Obj, "targets").map(x => x.target_id)).toEqual(canonicalReturnChannelTargetIds);
    expect(list(task as Obj, "solution_families").map(x => [x.solution_id, x.route_kind, x.mainline])).toEqual([
      ["return_flow.repair_overflow", "non_magic", true], ["return_flow.clear_mud", "non_magic", true], ["return_flow.reuse_old_channel", "non_magic", true],
    ]);
    expect(list((task.world_goal as Obj), "predicates").map(x => x.expression)).toEqual(["settlement_supply_stable == true", "wet_meadow_restored == true"]);
  });

  it("projects a complete gameplay-facing typed contract and zero-attack ecology return", () => {
    const flow = readRuntimeReturnFlowTaskManifest(generated);
    expect(flow).toMatchObject({ familyId: "ecology_and_return_flow", sceneId: "scene.valley.return_channel", regionId: "valley_prologue", entryPrerequisiteFlag: "exit_ladder_lowered", exitPrerequisiteFlag: "settlement_supply_stable", sceneSizeTiles: [30, 26], completionEvent: "return_flow_committed", sharedPredicateExpectations: { overflowContact: false }, ecologyReturn: { eventId: "wildlife_return_after_flow", persistentWrite: null, firstReturnChannelVisitVisible: true }, zeroAttack: { zeroAttackMainline: true, mandatoryKills: 0, mandatoryCombatEncounters: 0, formalAttackFirstValidationTarget: "safe_range_inert_targets" } });
    expect(flow.solutions.map(x => x.id)).toEqual(["return_flow.repair_overflow", "return_flow.clear_mud", "return_flow.reuse_old_channel"]);
    expect(flow.solutions.every(x => x.routeKind === "non_magic" && x.mainline && x.requiredActions.length > 0)).toBe(true);
    expect(flow.wawaEvidence).toMatchObject({ sourceTargetId: "return_flow.inert_force_indicator", sourceTargetClass: "inert_return_flow_mechanism", prerequisiteNodeId: "use.intensity.inert", maximumPromptLevel: 1, toolBypassCountsAsEvidence: false, wildlifeActionsCountAsEvidence: false });
  });

  it("rejects a fourth or optional-magic solution and action/fact drift", () => {
    const a=sources(), task=source(a,"tasks/ch01-return-flow.v0.1.yaml"), solutions=list(task,"solution_families");
    solutions.push({ ...structuredClone(solutions[0]!), solution_id: "return_flow.optional_magic", route_kind: "optional_magic" });
    issue(() => compileContent(a), "task.return_flow_solutions");
    const b=sources(), repair=list(source(b,"tasks/ch01-return-flow.v0.1.yaml"),"solution_families")[0]!;
    (repair.required_actions as string[]).pop(); issue(() => compileContent(b), "task.return_flow_solution_contract");
  });

  it("rejects extra world goals and inverted overflow polarity", () => {
    const a=sources(), task=source(a,"tasks/ch01-return-flow.v0.1.yaml"), goal=task.world_goal as Obj;
    list(goal,"predicates").push({ predicate_id: "return.attack", expression: "first_attack_signature_available == true" }); issue(() => compileContent(a), "task.return_flow_goals");
    const b=sources(), contract=source(b,"tasks/ch01-return-flow.v0.1.yaml").return_flow_contract as Obj;
    (contract.shared_predicate_expectations as Obj).overflowContact=true; issue(() => compileContent(b), "task.return_flow_predicate_polarity");
  });

  it("rejects wawa evidence sourced from wildlife or a different graph node", () => {
    const all=sources(), contract=source(all,"tasks/ch01-return-flow.v0.1.yaml").return_flow_contract as Obj, evidence=contract.wawa_evidence as Obj;
    evidence.source_object_class="wildlife"; evidence.prerequisite_node_id="use.motion.noncombat"; issue(() => compileContent(all), "task.return_flow_wawa");
  });

  it("rejects unknown, reordered, or missing return-channel targets", () => {
    const unknownSources = sources();
    const unknownTargets = list(source(unknownSources, "scenes/valley-return-channel.v0.1.yaml"), "targets");
    unknownTargets.push({ ...structuredClone(unknownTargets[10]!), target_id: "return_wetland.large_creature.unknown" });
    issue(() => compileContent(unknownSources), "task.return_flow_scene");

    const reorderedSources = sources();
    const reorderedTargets = list(source(reorderedSources, "scenes/valley-return-channel.v0.1.yaml"), "targets");
    [reorderedTargets[6], reorderedTargets[7]] = [reorderedTargets[7]!, reorderedTargets[6]!];
    issue(() => compileContent(reorderedSources), "task.return_flow_scene");

    const missingSources = sources();
    list(source(missingSources, "scenes/valley-return-channel.v0.1.yaml"), "targets").pop();
    issue(() => compileContent(missingSources), "task.return_flow_scene");
  });

  it("rejects ecology attack evidence, region zero-attack drift and topology drift", () => {
    const a=sources(), ecology=source(a,"ecology/valley-prologue.v0.1.yaml"), event=list(ecology,"events").find(x=>x.event_id==="wildlife_return_after_flow")!;
    event.attack_qualification_evidence=true; issue(() => compileContent(a), "task.return_flow_ecology");
    const b=sources(), region=source(b,"world/regions/valley-prologue.v0.1.yaml"); (region.contracts as Obj).zero_attack_mainline=false; issue(() => compileContent(b), "task.return_flow_region");
    const c=sources(), cistern=source(c,"scenes/valley-high-cistern.v0.1.yaml"), exit=list(cistern,"exits").find(x=>x.exit_id==="cistern.to_return_channel")!; exit.target_entrance_id="return.not_real"; issue(() => compileContent(c), "task.return_flow_topology");
  });

  it("fails closed when generated wawa, ecology or zero-attack fields are tampered", () => {
    const a=structuredClone(generated) as any; a.infrastructureTasks.byId.ch01_return_flow.returnFlow.wawaEvidence.sourceTargetClass="wildlife"; expect(()=>readRuntimeReturnFlowTaskManifest(a)).toThrow(/wawa evidence/);
    const b=structuredClone(generated) as any; b.infrastructureTasks.byId.ch01_return_flow.returnFlow.ecologyReturn.persistentWrite={}; expect(()=>readRuntimeReturnFlowTaskManifest(b)).toThrow(/ecology-return/);
    const c=structuredClone(generated) as any; c.infrastructureTasks.byId.ch01_return_flow.returnFlow.zeroAttack.mandatoryKills=1; expect(()=>readRuntimeReturnFlowTaskManifest(c)).toThrow(/zero-attack/);
  });

  it("fails closed when generated return-channel targets drift", () => {
    const unknown = structuredClone(generated) as any;
    unknown.infrastructureTasks.byId.ch01_return_flow.returnFlow.targetIds.push("return_wetland.large_creature.unknown");
    expect(() => readRuntimeReturnFlowTaskManifest(unknown)).toThrow(/return flow targets/);

    const reordered = structuredClone(generated) as any;
    const reorderedTargetIds = reordered.infrastructureTasks.byId.ch01_return_flow.returnFlow.targetIds;
    [reorderedTargetIds[6], reorderedTargetIds[7]] = [reorderedTargetIds[7], reorderedTargetIds[6]];
    expect(() => readRuntimeReturnFlowTaskManifest(reordered)).toThrow(/return flow targets/);

    const missing = structuredClone(generated) as any;
    missing.infrastructureTasks.byId.ch01_return_flow.returnFlow.targetIds.pop();
    expect(() => readRuntimeReturnFlowTaskManifest(missing)).toThrow(/return flow targets/);
  });
});
