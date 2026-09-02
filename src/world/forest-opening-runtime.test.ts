import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import { readRuntimeForestOpeningManifest } from "../content/runtime-forest-opening-manifest";
import { readRuntimeForestSpatialManifest } from "../content/runtime-forest-spatial-manifest";
import { ForestOpeningRuntime, type ForestOpeningRuntimeSave } from "./forest-opening-runtime";
import { ForestOpeningObstacle } from "./forest-opening-obstacle";

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
      ecology: {
        tick: 0,
        revision: 0,
        rabbit: { mode: "foraging" },
        wetlandBird: { mode: "wading" },
      },
      worldMinute: 360,
    });
  });

  it("produces the same fixed-step state under 30 and 60 render fps", () => {
    const atThirty = fresh("forest.opening.fps");
    const atSixty = fresh("forest.opening.fps");
    const direct = fresh("forest.opening.fps");

    for (let frame = 0; frame < 30; frame += 1) atThirty.advanceFrame(1 / 30, { moveX: 1 });
    for (let frame = 0; frame < 60; frame += 1) atSixty.advanceFrame(1 / 60, { moveX: 1 });
    direct.advanceTicks(60, { moveX: 1 });

    expect(atThirty.snapshot()).toEqual(atSixty.snapshot());
    expect(atThirty.snapshot()).toEqual(direct.snapshot());
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

  it("derives wildlife perception from the spatial player instead of caller domain input", () => {
    const runtime = fresh("forest.opening.ecology-integration");

    runtime.advanceTicks(180, { moveX: 1 });

    expect(runtime.snapshot().ecology.rabbit.mode).not.toBe("foraging");
    expect(runtime.snapshot().ecology.tick).toBe(runtime.snapshot().tick);
    runtime.advanceTicks(180, { moveX: 1 });
    expect(runtime.snapshot().ecology.rabbit.mode).toBe("sheltered");
  });

  it("derives player movement sound as an authoritative ecology disturbance", () => {
    const positioned = fresh("forest.opening.sound-disturbance");
    expect(positioned.snapshot().ecology.rabbit.mode).toBe("foraging");

    for (let tick = 0; tick < 60 && positioned.snapshot().ecology.rabbit.mode === "foraging"; tick += 1) {
      positioned.advanceTicks(1, { moveX: 1 });
    }

    expect(positioned.snapshot().spatial.player.velocity.x).toBeGreaterThan(0.1);
    expect(Math.hypot(
      positioned.snapshot().spatial.player.position.x - positioned.snapshot().ecology.rabbit.position.x,
      positioned.snapshot().spatial.player.position.y - positioned.snapshot().ecology.rabbit.position.y,
    )).toBeLessThan(224);
    expect(positioned.snapshot().ecology.rabbit.mode).toBe("alert");
    expect(ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, positioned.save())
      .snapshot().ecology.rabbit.mode).toBe("alert");
  });

  it("blocks the damaged crossing until one physical route is committed", () => {
    const runtime = fresh("forest.opening.crossing-gate");
    const farEdge = openingManifest.obstacle.boundsPx.x + openingManifest.obstacle.boundsPx.width;
    for (let batch = 0; batch < 60; batch += 1) {
      runtime.advanceTicks(30, { moveX: 1, jump: batch % 16 === 15 });
      if (runtime.snapshot().spatial.player.position.x + 12 >= farEdge - 0.001) break;
    }
    const blocked = runtime.snapshot().spatial.player;
    expect(blocked.position.x + blocked.body.width).toBeLessThanOrEqual(farEdge + 0.001);
    expect(blocked.position.x + blocked.body.width).toBeGreaterThan(farEdge - 1);

    const clean = runtime.save();
    const forgedX = farEdge + 20;
    const forgedSpatial = {
      ...clean.spatial,
      player: { ...clean.spatial.player, x: forgedX },
      checkpoint: { ...clean.spatial.checkpoint, position: { x: forgedX, y: clean.spatial.player.y }, tick: clean.spatial.tick },
      camera: { ...clean.spatial.camera, x: Math.floor(forgedX - 320), y: Math.floor(clean.spatial.player.y - 180) },
    };
    expect(() => ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, resign({
      ...clean,
      spatial: forgedSpatial,
    }))).toThrow(/crossing|unsolved|save/i);

    runtime.advanceTicks(180, { moveX: -1 });
    expect(runtime.interact("gate.detour", { kind: "enter_shallow_detour" }, 0).ok).toBe(true);
    for (let batch = 0; batch < 60 && runtime.snapshot().spatial.player.position.x <= farEdge; batch += 1) {
      runtime.advanceTicks(30, { moveX: 1, jump: batch > 0 && batch % 16 === 0 });
    }
    expect(runtime.snapshot().spatial.player.position.x).toBeGreaterThan(farEdge);
  }, 10_000);

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

    const futureMaterial = ForestOpeningObstacle.fresh(openingManifest);
    futureMaterial.advanceTicks(1);
    expect(() => ForestOpeningRuntime.fromSave(
      { openingManifest, spatialManifest },
      resign({ ...save, obstacle: futureMaterial.save() }),
    )).toThrow(/material|timeline|tick/i);
  });

  it("resets spatial progress while preserving a restored committed solution identity", () => {
    const source = fresh("forest.opening.reset");
    const checkpoint = source.snapshot().spatial.checkpoint;
    const farEdge = openingManifest.obstacle.boundsPx.x + openingManifest.obstacle.boundsPx.width;
    for (let batch = 0; batch < 60; batch += 1) {
      source.advanceTicks(30, { moveX: 1, jump: batch % 16 === 15 });
      if (source.snapshot().spatial.player.position.x + 12 >= farEdge - 1) break;
    }
    source.advanceTicks(180, { moveX: -1 });
    expect(source.interact("reset.detour", { kind: "enter_shallow_detour" }, 0)).toMatchObject({ ok: true });
    expect(source.snapshot().obstacle.committedSolutionId).toBe("shallow_detour");
    const restored = ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, source.save());
    restored.advanceTicks(120, { moveX: 1 });

    const reset = restored.resetToCheckpoint();

    expect(reset.spatial.player.position).toEqual(checkpoint.position);
    expect(reset.obstacle.committedSolutionId).toBe("shallow_detour");
    expect(reset.ecology).toMatchObject({
      tick: reset.tick,
      revision: 0,
      rabbit: { mode: "foraging" },
      wetlandBird: { mode: "wading" },
    });
  });

  it("keeps an uncommitted checkpoint reset on one recoverable material timeline", () => {
    const source = fresh("forest.opening.uncommitted-reset");
    source.advanceTicks(120, { moveX: 1 });

    const reset = source.resetToCheckpoint();
    const save = source.save();

    expect(reset.tick).toBe(120);
    expect(reset.obstacle.materialPocket.tick).toBe(120);
    expect(ForestOpeningRuntime.fromSave({ openingManifest, spatialManifest }, save).save()).toEqual(save);
  });
});
