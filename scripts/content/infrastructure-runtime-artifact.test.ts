import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readRuntimeInfrastructureTaskManifestIndex } from "../../src/content/runtime-task-manifest";
import type { ContentSource } from "../../src/content/types";
import { buildRuntimeContentArtifact } from "./runtime-artifact";

const rawRepositoryContent = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(rawRepositoryContent).map(([path, raw]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(raw) : parse(raw),
  }));
}

describe("N03/N04/N05 infrastructure runtime artifact", () => {
  it("emits task modes, solution families and guards without raw YAML interpretation", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const index = readRuntimeInfrastructureTaskManifestIndex(artifact);

    expect(Object.keys(index.byId).sort()).toEqual([
      "ch01_length_cistern",
      "ch01_service_channel",
      "ch01_waterwheel",
    ]);
    expect(index.byId.ch01_waterwheel).toMatchObject({
      sceneId: "scene.valley.waterwheel",
      predicateMode: "all",
      validResultModes: ["temporary_driven", "structurally_restored"],
      entryGuardAny: ["settlement_reached == true"],
      exitGuardAny: ["waterwheel_restored == true", "maintenance_access_open == true"],
      nonMagicMainlineSolutionIds: [
        "waterwheel.clear_natural_inflow",
        "waterwheel.repair_axle",
        "waterwheel.move_flume",
        "waterwheel.dig_bypass",
      ],
    });
    expect(index.byId.ch01_waterwheel?.modes).toEqual([
      expect.objectContaining({ id: "stopped", completionValid: false, persistsAcrossReload: false }),
      expect.objectContaining({ id: "temporary_driven", completionValid: true, persistsAcrossReload: false }),
      expect.objectContaining({
        id: "structurally_restored",
        completionValid: true,
        persistsAcrossReload: true,
        patchRecordRef: "patch.valley.waterwheel_structure.v0.1",
      }),
    ]);
    expect(index.byId.ch01_service_channel).toMatchObject({
      sceneId: "scene.valley.service_channel",
      predicateMode: "any",
      materialReactionKinds: ["water", "wet_soil", "stone", "wood", "thin_ice"],
      maximumSoftlockRecoverySeconds: 60,
    });
    expect(index.byId.ch01_service_channel?.grammarContacts).toEqual([
      expect.objectContaining({
        token: "o",
        automaticStateGrant: false,
        productionRequired: false,
        masteryEvidenceAllowed: false,
      }),
    ]);
  });

  it("emits scene task references and authoritative traversal guards", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const waterwheel = artifact.scenes.byId["scene.valley.waterwheel"];
    const service = artifact.scenes.byId["scene.valley.service_channel"];

    expect(waterwheel?.taskRefs).toEqual([
      expect.objectContaining({
        id: "ch01_waterwheel",
        authoritativeTaskSourcePath: "data/tasks/ch01-waterwheel.v0.1.yaml",
      }),
    ]);
    expect(waterwheel?.exits.find((exit) => exit.id === "waterwheel.to_service")?.traversalGuardAny)
      .toEqual(["waterwheel_restored == true", "maintenance_access_open == true"]);
    expect(service?.taskRefs).toEqual([
      expect.objectContaining({
        id: "ch01_service_channel",
        authoritativeTaskSourcePath: "data/tasks/ch01-service-channel.v0.1.yaml",
      }),
    ]);
    expect(service?.exits.find((exit) => exit.id === "service.to_high_cistern")?.target).toEqual({
      kind: "scene",
      sceneId: "scene.valley.high_cistern",
      entranceId: "cistern.from_service",
    });
  });

  it("fails closed if a generated task loses its solution array", () => {
    const artifact = structuredClone(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    ) as unknown as { infrastructureTasks: { byId: Record<string, { solutions?: unknown }> } };
    delete artifact.infrastructureTasks.byId.ch01_waterwheel!.solutions;
    expect(() => readRuntimeInfrastructureTaskManifestIndex(artifact)).toThrow(/solutions must be an array/);
  });
});
