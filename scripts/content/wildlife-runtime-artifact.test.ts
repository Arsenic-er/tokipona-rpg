import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readRuntimeEcologyManifest } from "../../src/content/runtime-ecology-manifest";
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

describe("N06 wildlife runtime artifact", () => {
  it("emits only the required typed ecology fields with canonical timing and damage", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const ecology = readRuntimeEcologyManifest(artifact);
    expect(ecology).toMatchObject({
      ecologyId: "valley_prologue",
      minimumWarningTelegraphSeconds: 0.7,
      intrusionBeforeDefenseSeconds: 1.5,
      mandatoryKills: 0,
      requiredQuestDrops: 0,
      languageEvidenceFromHarmForbidden: true,
      species: {
        rabbit: { entityId: "wildlife.rabbit.valley", defensiveDamage: 2, realEscapeExit: "wet_meadow.rabbit_burrow_exit" },
        fox: {
          entityId: "wildlife.fox.den", homeSceneId: "scene.valley.den_bypass",
          defensiveDamage: 6, guardingYoungDamage: 8, realEscapeExit: "den.fox.back_exit",
          returnCondition: expect.stringContaining("fox_den_intact"),
        },
      },
    });
    expect(ecology).not.toHaveProperty("events");
    expect(ecology).not.toHaveProperty("reward_contract");
  });

  it("emits optional N06 topology without replacing the direct N04 to N05 edge", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const den = artifact.scenes.byId["scene.valley.den_bypass"]!;
    const service = artifact.scenes.byId["scene.valley.service_channel"]!;
    expect(den.sizeTiles).toEqual({ width: 28, height: 28 });
    expect(den.nonMagicAlternativeRouteIds).toEqual([
      "den.wait_and_observe", "den.dig_upper_bypass", "den.low_force_noise", "den.low_force_staff", "den.service_return",
    ]);
    expect(den.exits.find((exit) => exit.id === "den.to_service")?.traversalGuardAny).toEqual([]);
    expect(den.exits.find((exit) => exit.id === "den.to_cistern")?.traversalGuardAny).toEqual(["den_route_open == true"]);
    expect(service.exits.find((exit) => exit.id === "service.to_high_cistern")?.target).toEqual({
      kind: "scene", sceneId: "scene.valley.high_cistern", entranceId: "cistern.from_service",
    });
    expect(artifact.infrastructureTasks.byId.ch01_den_bypass).toMatchObject({
      sceneId: "scene.valley.den_bypass",
      predicateMode: "all",
      nonMagicMainlineSolutionIds: [
        "den.wait_and_observe", "den.dig_upper_bypass", "den.low_force_noise", "den.low_force_staff",
      ],
      maximumSoftlockRecoverySeconds: 60,
    });
  });

  it("fails closed on tampered ecology timing, fox damage, or route reward fields", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const timing = structuredClone(artifact) as unknown as { ecology: { minimumWarningTelegraphSeconds: number } };
    timing.ecology.minimumWarningTelegraphSeconds = 0.6;
    expect(() => readRuntimeEcologyManifest(timing)).toThrow(/at least 0.7/);

    const damage = structuredClone(artifact) as unknown as { ecology: { species: { fox: { defensiveDamage: number } } } };
    damage.ecology.species.fox.defensiveDamage = 60;
    expect(() => readRuntimeEcologyManifest(damage)).toThrow(/fox projection/);
  });
});
