import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import { readRuntimeForestOpeningManifest } from "../content/runtime-forest-opening-manifest";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { ForestOpeningRuntime, type ForestOpeningRuntimeSave } from "./forest-opening-runtime";

const openingManifest = readRuntimeForestOpeningManifest(generated);
const spatialManifest = readRuntimeForestSpatialManifest(generated);

function fresh(seed = "forest.opening.runtime"): ForestOpeningRuntime {
  return ForestOpeningRuntime.fresh({ openingManifest, spatialManifest, seed });
}

function resign(save: ForestOpeningRuntimeSave): ForestOpeningRuntimeSave {
  const body = Object.fromEntries(Object.entries(save).filter(([key]) => key !== "checksum"));
  return { ...save, checksum: sha256Canonical(body as JsonValue) };
}

describe("ForestOpeningRuntime", () => {
  it("creates byte-stable fresh state from verified manifests and a seed", () => {
    const first = fresh().save();
    const second = fresh().save();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first).toMatchObject({
      schema: "tokipona.forest-opening-runtime.v0.1",
      manifestDigest: openingManifest.sourceDigest,
      obstacle: { committedSolutionId: null, revision: 0 },
      ecology: { tick: 0, revision: 0 },
      worldMinute: 360,
    });
  });

  it("produces the same fixed-step state under 30 and 60 render fps", () => {
    const atThirty = fresh("forest.opening.fps");
    const atSixty = fresh("forest.opening.fps");

    for (let frame = 0; frame < 30; frame += 1) atThirty.advanceFrame(1 / 30, { moveX: 1 });
    for (let frame = 0; frame < 60; frame += 1) atSixty.advanceFrame(1 / 60, { moveX: 1 });

    expect(atThirty.snapshot()).toEqual(atSixty.snapshot());
    expect(atThirty.snapshot()).toMatchObject({ tick: 60, worldMinute: 360.25 });
  });

  it("round-trips an exact checksummed save without a first-tick jump", () => {
    const source = fresh("forest.opening.reload");
    source.advanceTicks(180, { moveX: 1 });
    const save = source.save();

    const restored = ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, save);

    expect(restored.save()).toEqual(save);
    expect(restored.snapshot()).toEqual(source.snapshot());
    restored.advanceTicks(1);
    source.advanceTicks(1);
    expect(restored.snapshot()).toEqual(source.snapshot());
  });

  it("fails closed on checksum, unknown fields, and manifest mismatches", () => {
    const save = fresh("forest.opening.invalid").save();
    expect(() => ForestOpeningRuntime.fromSave(
      { openingManifest, spatialManifest },
      { ...save, checksum: `sha256:${"0".repeat(64)}` },
    )).toThrow(/checksum/i);

    expect(() => ForestOpeningRuntime.fromSave(
      { openingManifest, spatialManifest },
      { ...save, unknown: true },
    )).toThrow(/unknown|fields/i);

    const wrongManifest = resign({ ...save, manifestDigest: `sha256:${"f".repeat(64)}` });
    expect(() => ForestOpeningRuntime.fromSave(
      { openingManifest, spatialManifest },
      wrongManifest,
    )).toThrow(/manifest/i);
  });

  it("resets spatial progress while preserving a restored committed solution identity", () => {
    const source = fresh("forest.opening.reset");
    source.advanceTicks(120, { moveX: 1 });
    const checkpoint = source.setCheckpoint("checkpoint.forest.opening.test");
    const save = source.save();
    const committed = resign({
      ...save,
      obstacle: { ...save.obstacle, revision: 1, committedSolutionId: "stone_steps" },
    });
    const restored = ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, committed);
    restored.advanceTicks(120, { moveX: 1 });

    const reset = restored.resetToCheckpoint();

    expect(reset.spatial.player.position).toEqual(checkpoint.position);
    expect(reset.obstacle.committedSolutionId).toBe("stone_steps");
    expect(reset.ecology).toMatchObject({ tick: reset.tick, revision: 0 });
  });
});
