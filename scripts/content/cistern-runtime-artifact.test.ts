import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import {
  readRuntimeCisternTaskManifest,
  readRuntimeInfrastructureTaskManifestIndex,
} from "../../src/content/runtime-task-manifest";
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

describe("N05 high-cistern runtime artifact", () => {
  it("projects receiver stages and independent task families without raw-YAML interpretation", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const cistern = readRuntimeCisternTaskManifest(artifact);
    expect(cistern.stages).toEqual([
      expect.objectContaining({ id: "short", familyId: "cistern.family_a.calibration", canonicalWordIds: ["word.telo", "word.lili"], activationMp: 6 }),
      expect.objectContaining({ id: "default", familyId: "cistern.family_a.calibration", canonicalWordIds: ["word.telo"], activationMp: 5 }),
      expect.objectContaining({ id: "long", familyId: "cistern.family_b.transfer", canonicalWordIds: ["word.telo", "word.suli"], activationMp: 10 }),
    ]);
    expect(cistern.families).toEqual([
      expect.objectContaining({ id: "cistern.family_a.calibration", stageIds: ["short", "default"], languageEvidenceFromToolBypass: false }),
      expect.objectContaining({ id: "cistern.family_b.transfer", stageIds: ["long"], languageEvidenceFromToolBypass: false }),
    ]);
    expect(cistern.capacityMilestoneRef).toEqual({
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
    });
    expect(cistern.completionFlags).toEqual([
      "high_cistern_reconnected", "upper_channel_available", "exit_ladder_lowered",
    ]);
    expect(cistern.h0H1AnswerTokenIdsVisible).toBe(false);
    expect(cistern.legalWrongLengthCastCompletesStage).toBe(false);
    expect(cistern.maximumSoftlockRecoverySeconds).toBe(60);
  });

  it("keeps the N03/N04 projections intact and marks their cistern extension null", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const index = readRuntimeInfrastructureTaskManifestIndex(artifact);
    expect(index.byId.ch01_waterwheel?.cistern).toBeNull();
    expect(index.byId.ch01_service_channel?.cistern).toBeNull();
    expect(index.byId.ch01_length_cistern?.sceneId).toBe("scene.valley.high_cistern");
  });

  it("fails closed if a generated stage MP quote is tampered", () => {
    const artifact = structuredClone(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    ) as unknown as {
      infrastructureTasks: { byId: Record<string, { cistern: { stages: Array<{ activationMp: number }> } }> };
    };
    artifact.infrastructureTasks.byId.ch01_length_cistern!.cistern.stages[0]!.activationMp = 5;
    expect(() => readRuntimeCisternTaskManifest(artifact)).toThrow(/stage short is invalid/);
  });

  it("fails closed if the sourced capacity milestone is removed from runtime output", () => {
    const artifact = structuredClone(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    ) as unknown as {
      infrastructureTasks: { byId: Record<string, { cistern: { capacityMilestoneRef?: unknown } }> };
    };
    delete artifact.infrastructureTasks.byId.ch01_length_cistern!.cistern.capacityMilestoneRef;
    expect(() => readRuntimeCisternTaskManifest(artifact)).toThrow(/capacityMilestoneRef must be an object/);
  });

  it("fails closed if N05 loses its dedicated runtime contract", () => {
    const artifact = structuredClone(
      buildRuntimeContentArtifact(compileContent(repositorySources())),
    ) as unknown as { infrastructureTasks: { byId: Record<string, { cistern: unknown }> } };
    artifact.infrastructureTasks.byId.ch01_length_cistern!.cistern = null;
    expect(() => readRuntimeInfrastructureTaskManifestIndex(artifact)).toThrow(/requires its dedicated runtime cistern contract/);
  });
});
