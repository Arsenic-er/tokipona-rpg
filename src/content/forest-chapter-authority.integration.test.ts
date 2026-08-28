import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { buildRuntimeContentArtifact } from "../../scripts/content/runtime-artifact.ts";
import { compileContent } from "./compiler.ts";
import { readRuntimeEcologyManifest } from "./runtime-ecology-manifest.ts";
import {
  isVerifiedRuntimeForestChapterManifest,
  readRuntimeForestChapterManifest,
} from "./runtime-forest-chapter-manifest.ts";
import { readRuntimeP0CurriculumManifest } from "./runtime-p0-curriculum-manifest.ts";
import { readRuntimePrologueAcceptanceManifest } from "./runtime-prologue-acceptance-manifest.ts";
import { readRuntimeSceneManifestIndex } from "./runtime-scene-manifest.ts";
import type { ContentSource } from "./types.ts";

const raw = import.meta.glob("../../data/**/*.{yaml,yml,json}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function repositorySources(): ContentSource[] {
  return Object.entries(raw).map(([path, text]) => ({
    path: path.replace(/^\.\.\/\.\.\//, ""),
    data: path.endsWith(".json") ? JSON.parse(text) : parse(text),
  }));
}

describe("forest chapter content authority integration", () => {
  it("keeps the verified forest, scene, ecology, curriculum, and telemetry contracts aligned", () => {
    const manifest = compileContent(repositorySources());
    const runtime = buildRuntimeContentArtifact(manifest);
    const forest = readRuntimeForestChapterManifest(runtime);
    const scenes = readRuntimeSceneManifestIndex(runtime);
    const ecology = readRuntimeEcologyManifest(runtime);
    const p0 = readRuntimeP0CurriculumManifest(runtime);
    const prologue = readRuntimePrologueAcceptanceManifest(runtime);
    const underground = manifest.indexes.tasks.ch01_underground_water_allocation! as Record<string, unknown>;

    expect(isVerifiedRuntimeForestChapterManifest(forest)).toBe(true);
    expect(forest.mainSceneIds.every((sceneId) => scenes.byId[sceneId] !== undefined)).toBe(true);
    expect(forest.optionalSceneIds.every((sceneId) => scenes.byId[sceneId] !== undefined)).toBe(true);
    expect(forest.medium.automaticWordMasteryForbidden).toBe(true);
    expect(forest.largeCreature.mandatoryKill).toBe(false);
    expect(ecology.mandatoryKills).toBe(0);
    expect(ecology.languageEvidenceFromHarmForbidden).toBe(true);
    expect(forest.activeWordIds).toEqual(p0.firstChapterActiveMasteryWordIds);
    expect(prologue.telemetry.segmentFocus.map(({ segmentId }) => segmentId)).toEqual(
      forest.segments.map(({ segmentId }) => segmentId),
    );
    expect(forest.allocation.modeIds).toHaveLength(3);
    expect(underground.required_event_sequence).toEqual(expect.arrayContaining([
      forest.largeCreature.resolutionEventId,
    ]));

    expect(forest.mainSceneIds).not.toContain("scene.valley.service_channel");
    expect(scenes.byId["scene.valley.service_channel"]).toBeUndefined();
    expect(forest.mainSceneIds).not.toContain("scene.valley.old_mine_threshold");
    expect(forest.optionalSceneIds).not.toContain("scene.valley.old_mine_threshold");
    expect(forest.mainSceneIds).toContain("scene.valley.underground_order_node");
    expect(scenes.byId["scene.valley.waterwheel"]?.taskRefs.map(({ id }) => id)).toContain("ch01_service_channel");
    expect(scenes.byId["scene.valley.waterwheel"]?.entrances.map(({ id }) => id))
      .toContain("waterwheel.lower_maintenance.entry");
  });
});
