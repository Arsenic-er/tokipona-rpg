import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readVerifiedCapabilityMilestoneContract } from "../../src/session/capability-contract";
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

describe("capability progression runtime artifact", () => {
  it("projects exactly the three numeric chapter milestones", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    expect(artifact.capabilityProgression).toEqual({
      sourcePath: "data/chapters/ch01-world-literacy-prologue.v0.1.yaml",
      sourceDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      contractRevision: "chapter-01.forest.2",
      capacityMilestones: [
        {
          milestoneId: "arrival_single_word",
          writerEvent: "new_game_capacity_initialized",
          resultingState: { expressionCapacityWords: 1, focusSlots: 1, maxMp: 24 },
        },
        {
          milestoneId: "pre_cistern_length_phrase",
          writerEvent: "first_evidence_package_committed",
          resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
        },
        {
          milestoneId: "attack_capacity_calibration",
          writerEvent: "attack_capacity_calibrated",
          resultingState: { expressionCapacityWords: 4, focusSlots: 4, maxMp: 30 },
        },
      ],
    });
  });

  it("uses the same source path as the N05 cistern binding and passes the verified reader", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    const binding = artifact.infrastructureTasks.byId.ch01_length_cistern?.cistern?.capacityMilestoneRef;
    expect(binding).toBeDefined();
    expect(artifact.capabilityProgression.sourcePath).toBe(binding?.sourcePath);
    expect(readVerifiedCapabilityMilestoneContract(artifact.capabilityProgression, binding!)).toMatchObject({
      milestoneId: "pre_cistern_length_phrase",
      writerEvent: "first_evidence_package_committed",
      resultingState: { expressionCapacityWords: 2, focusSlots: 2, maxMp: 26 },
    });
  });

  it("fails closed if a numeric milestone omits one of the three capacity values", () => {
    const sources = repositorySources();
    const chapter = sources.find((source) => source.path.endsWith("ch01-world-literacy-prologue.v0.1.yaml"));
    if (!chapter || typeof chapter.data !== "object" || chapter.data === null || Array.isArray(chapter.data)) {
      throw new Error("chapter fixture is unavailable");
    }
    const progression = (chapter.data as { capacity_progression: { milestones: Array<{ milestone_id: string; resulting_state: Record<string, unknown> }> } }).capacity_progression;
    const milestone = progression.milestones.find((entry) => entry.milestone_id === "pre_cistern_length_phrase");
    if (!milestone) throw new Error("pre-cistern milestone is unavailable");
    delete milestone.resulting_state.player_max_mp;
    expect(() => buildRuntimeContentArtifact(compileContent(sources))).toThrow(/all three capability result values/);
  });
});
