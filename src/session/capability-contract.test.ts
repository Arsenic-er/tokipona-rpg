import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeCisternTaskManifest } from "../content/runtime-task-manifest";
import { readVerifiedCapabilityMilestoneContract } from "./capability-contract";

describe("verified capability machine projection", () => {
  it("resolves the N05 binding directly from generated chapter progression", () => {
    const manifest = readRuntimeCisternTaskManifest(generatedRuntimeArtifact);
    const projection = (generatedRuntimeArtifact as unknown as {
      capabilityProgression?: unknown;
    }).capabilityProgression;
    expect(projection).toBeDefined();
    const contract = readVerifiedCapabilityMilestoneContract(
      projection,
      manifest.capacityMilestoneRef,
    );
    expect(contract).toMatchObject({
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
      resultingState: {
        expressionCapacityWords: 2,
        focusSlots: 2,
        maxMp: 26,
      },
    });
  });

  it("rejects duplicate bound milestone IDs and malformed numeric progression", () => {
    const base = {
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      sourceDigest: `sha256:${"e".repeat(64)}`,
      contractRevision: "0.1.0",
      capacityMilestones: [{
        milestoneId: "pre_cistern_length_phrase",
        writerEvent: "first_evidence_package_committed",
        resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
      }],
    };
    const binding = {
      sourcePath: base.sourcePath,
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
    };
    expect(() => readVerifiedCapabilityMilestoneContract({
      ...base,
      capacityMilestones: [...base.capacityMilestones, ...base.capacityMilestones],
    }, binding)).toThrow(/exactly once/);
    expect(() => readVerifiedCapabilityMilestoneContract({
      ...base,
      capacityMilestones: [{
        ...base.capacityMilestones[0],
        resultingState: { expressionCapacityWords: 0, focusSlots: 2, maxMp: 26 },
      }],
    }, binding)).toThrow(/positive safe integer/);
  });
});
