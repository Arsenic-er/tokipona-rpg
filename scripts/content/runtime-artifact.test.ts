import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { compileContent } from "../../src/content/compiler";
import { readRuntimeSceneManifestIndex } from "../../src/content/runtime-scene-manifest";
import { readRuntimePortraitCameraProfile } from "../../src/content/runtime-camera-profile";
import type { ContentSource } from "../../src/content/types";
import generatedRuntimeText from "../../src/generated/content-runtime.v0.1.json?raw";
import generatedLearningCorpusPackagesText from
  "../../src/generated/learning-corpus-packages.v0.1.json?raw";
import {
  assertRuntimeArtifactCurrent,
  buildRuntimeContentArtifact,
  buildRuntimeLearningCorpusPackageBundle,
  serializeRuntimeContentArtifact,
  serializeRuntimeLearningCorpusPackageBundle,
} from "./runtime-artifact";

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

describe("runtime content artifact generator", () => {
  it("matches the checked-in generated artifact byte for byte", () => {
    const manifest = compileContent(repositorySources());
    const expected = serializeRuntimeContentArtifact(buildRuntimeContentArtifact(manifest));
    const expectedPackages = serializeRuntimeLearningCorpusPackageBundle(
      buildRuntimeLearningCorpusPackageBundle(manifest));
    expect(() => assertRuntimeArtifactCurrent(generatedRuntimeText, expected)).not.toThrow();
    expect(() => assertRuntimeArtifactCurrent(
      generatedLearningCorpusPackagesText, expectedPackages)).not.toThrow();
  });

  it("accepts an equivalent checked-in artifact after a Windows CRLF checkout", () => {
    const expected = "{\n  \"schema\": \"runtime.v0.1\"\n}\n";
    const windowsCheckout = expected.replaceAll("\n", "\r\n");

    expect(() => assertRuntimeArtifactCurrent(windowsCheckout, expected)).not.toThrow();
  });

  it("emits the validated N00 through N08 runtime scene manifest", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    expect(readRuntimePortraitCameraProfile(artifact)).toMatchObject({
      profileId: "portrait_scroll.v0.1",
      viewportPx: { width: 180, height: 320 },
      focusAnchorNormalized: { x: 0.5, y: 0.62 },
      clampToSceneBounds: true,
      pixelSnap: true,
      sceneSizeIndependentFromCamera: true,
    });
    expect(Object.keys(artifact.scenes.byId).sort()).toEqual([
      "scene.valley.arrival_shelf",
      "scene.valley.den_bypass",
      "scene.valley.high_cistern",
      "scene.valley.old_mine_threshold",
      "scene.valley.return_channel",
      "scene.valley.safe_range",
      "scene.valley.settlement",
      "scene.valley.stream_section",
      "scene.valley.underground_order_node",
      "scene.valley.waterwheel",
    ]);
    expect(artifact.scenes.byId["scene.valley.arrival_shelf"]).toMatchObject({
      regionId: "valley_prologue",
      regionNodeId: "valley.arrival_shelf",
      chapterFlowId: "ch01_world_literacy_prologue",
      chapterSegmentId: "arrival_tools",
      sceneId: "scene.valley.arrival_shelf",
      tileSizePx: 16,
      sizeTiles: { width: 24, height: 20 },
      recovery: { entryEntranceId: "arrival.spawn", maximumSoftlockRecoverySeconds: 60 },
    });
    const arrival = artifact.scenes.byId["scene.valley.arrival_shelf"]!;
    expect(arrival.collisionRows).toHaveLength(20);
    expect(arrival.entrances.find((entry) => entry.id === "arrival.spawn")).toMatchObject({
      spawnTile: [3, 16], spawnPx: { x: 48, y: 50 }, recoveryEntry: true,
    });
    expect(arrival.exits[0]).toMatchObject({
      id: "arrival.to_stream",
      boundsTiles: { x: 22, y: 6, width: 2, height: 5 },
      boundsPx: { x: 352, y: 144, width: 32, height: 80 },
      target: { kind: "scene", sceneId: "scene.valley.stream_section", entranceId: "stream.from_arrival" },
    });
    const stream = artifact.scenes.byId["scene.valley.stream_section"]!;
    expect(stream.nonMagicAlternativeRouteIds).toEqual([
      "stream.upper_bank", "stream.shallow_crossing", "stream.repaired_foothold",
    ]);
    expect(stream.exits.find((exit) => exit.id === "stream.to_settlement")).toMatchObject({
      boundsPx: { x: 480, y: 48, width: 32, height: 96 },
      target: { kind: "scene", sceneId: "scene.valley.settlement", entranceId: "settlement.from_stream" },
      firstTraverseCommit: "settlement_entry_crossed",
    });
    expect(stream.routeObjectives.map((objective) => objective.id)).toContain("stream.reach_settlement");
    expect(stream.interactions.map((interaction) => interaction.id)).toContain("stream.fill_basin");
    const settlement = artifact.scenes.byId["scene.valley.settlement"]!;
    expect(settlement.entrances.find((entry) => entry.id === "settlement.from_stream")).toMatchObject({
      spawnTile: [2, 1], spawnPx: { x: 32, y: 450 }, recoveryEntry: true,
    });
    expect(settlement.npcs.map((npc) => npc.professionId)).toEqual([
      "settlement.facility_manager", "settlement.repair_contractor", "settlement.supply_trader",
      "settlement.butcher", "settlement.tanner",
    ]);
    expect(settlement.facilities.filter((facility) => facility.publicRelief)).toEqual([
      expect.objectContaining({ kind: "public_well", economyEligible: false }),
      expect.objectContaining({ kind: "communal_plant_meal", economyEligible: false }),
      expect.objectContaining({ kind: "field_knife_public_loan", economyEligible: false }),
    ]);
    expect(settlement.tasks).toEqual([
      expect.objectContaining({
        id: "ch01_settlement_orientation", nonviolent: true, magicRequired: false,
        reward: { currency: "coin", amount: 10, claimOnce: true, receiptRequired: true },
      }),
    ]);
    expect(settlement.tradeEntries).toEqual([
      expect.objectContaining({ authoritativeEconomySourcePath: "data/economy/settlement-trade.v0.1.yaml", merchantIds: ["settlement.grocer"] }),
      expect.objectContaining({ authoritativeEconomySourcePath: "data/economy/settlement-trade.v0.1.yaml", merchantIds: ["settlement.butcher"] }),
      expect.objectContaining({ authoritativeEconomySourcePath: "data/economy/settlement-trade.v0.1.yaml", merchantIds: ["settlement.tanner"] }),
    ]);
    expect(settlement.inboundRoutes).toEqual([
      expect.objectContaining({
        sourceSceneId: "scene.valley.stream_section", sourceExitId: "stream.to_settlement",
        entranceId: "settlement.from_stream",
      }),
      expect.objectContaining({
        sourceSceneId: "scene.valley.underground_order_node", sourceExitId: "underground.to_settlement",
        entranceId: "settlement.from_underground_order",
      }),
      expect.objectContaining({
        sourceSceneId: "scene.valley.safe_range", sourceExitId: "safe_range.to_settlement",
        entranceId: "settlement.from_safe_range",
      }),
      expect.objectContaining({
        sourceSceneId: "scene.valley.old_mine_threshold", sourceExitId: "old_mine.to_settlement",
        entranceId: "settlement.from_old_mine",
      }),
    ]);
  });
  it("exposes a fail-closed runtime scene index reader", () => {
    const artifact = buildRuntimeContentArtifact(compileContent(repositorySources()));
    expect(readRuntimeSceneManifestIndex(artifact).byId["scene.valley.stream_section"]?.sizeTiles).toEqual({
      width: 32,
      height: 24,
    });
    const tampered = structuredClone(artifact) as unknown as { scenes: { byId: Record<string, { sceneId: string }> } };
    tampered.scenes.byId["scene.valley.stream_section"]!.sceneId = "scene.not_canonical";
    expect(() => readRuntimeSceneManifestIndex(tampered)).toThrow(/does not match sceneId/);
    const missingNpcs = structuredClone(artifact) as unknown as { scenes: { byId: Record<string, { npcs?: unknown }> } };
    delete missingNpcs.scenes.byId["scene.valley.settlement"]!.npcs;
    expect(() => readRuntimeSceneManifestIndex(missingNpcs)).toThrow(/\.npcs must be an array/);
  });
  it("fails the check when the generated artifact is stale", () => {
    const manifest = compileContent(repositorySources());
    const expected = serializeRuntimeContentArtifact(buildRuntimeContentArtifact(manifest));
    const expectedPackages = serializeRuntimeLearningCorpusPackageBundle(
      buildRuntimeLearningCorpusPackageBundle(manifest));
    expect(() => assertRuntimeArtifactCurrent(`${generatedRuntimeText} `, expected)).toThrowError(
      /Generated runtime content is stale/,
    );
    expect(() => assertRuntimeArtifactCurrent(
      `${generatedLearningCorpusPackagesText} `, expectedPackages)).toThrowError(
        /Generated runtime content is stale/,
      );
  });

  it("changes the source digest after a valid authoring change", () => {
    const sources = repositorySources();
    const original = buildRuntimeContentArtifact(compileContent(sources));
    const lengthSource = sources.find((source) => source.path.endsWith("length-profiles.v0.1.yaml"));
    if (!lengthSource || typeof lengthSource.data !== "object" || lengthSource.data === null) {
      throw new Error("Length source fixture is unavailable.");
    }
    (lengthSource.data as Record<string, unknown>).content_version = "chapter-01.4-test";
    const changed = buildRuntimeContentArtifact(compileContent(sources));

    expect(changed.sourceDigest).not.toBe(original.sourceDigest);
    expect(() =>
      assertRuntimeArtifactCurrent(
        serializeRuntimeContentArtifact(original),
        serializeRuntimeContentArtifact(changed),
      )
    ).toThrowError(/stale/);
  });
});
