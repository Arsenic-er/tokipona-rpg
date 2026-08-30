import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestOpeningManifest } from "../content/runtime-forest-opening-manifest";
import {
  FOREST_OPENING_MATERIAL,
  ForestOpeningObstacle,
  countForestOpeningMaterials,
  type ForestOpeningInteraction,
} from "./forest-opening-obstacle";

const manifest = readRuntimeForestOpeningManifest(generated);

function actorNear(position: readonly [number, number]) {
  return { x: position[0] - 8, y: position[1] - 2, width: 12, height: 14 };
}

function apply(
  obstacle: ForestOpeningObstacle,
  operationId: string,
  request: ForestOpeningInteraction,
  actorBounds = actorNear(manifest.obstacle.objectAnchorsPx.stoneA),
) {
  return obstacle.applyInteraction(operationId, request, {
    actorBounds,
    expectedRevision: obstacle.snapshot().revision,
  });
}

describe("ForestOpeningObstacle", () => {
  it("requires full-body proximity, finite bounds, current revision, and known interactions", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);

    expect(obstacle.applyInteraction("remote", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    }, { actorBounds: { x: 0, y: 0, width: 12, height: 14 }, expectedRevision: 0 }))
      .toMatchObject({ ok: false, reason: "out_of_range" });
    expect(() => obstacle.applyInteraction("nan", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    }, { actorBounds: { x: Number.NaN, y: 0, width: 12, height: 14 }, expectedRevision: 0 }))
      .toThrow(/actor bounds/i);
    expect(obstacle.applyInteraction("stale", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    }, { actorBounds: actorNear(manifest.obstacle.objectAnchorsPx.stoneA), expectedRevision: 9 }))
      .toMatchObject({ ok: false, reason: "stale_revision" });
    expect(() => apply(obstacle, "unknown", {
      kind: "teleport_to_settlement",
    } as unknown as ForestOpeningInteraction)).toThrow(/interaction/i);
    expect(() => apply(obstacle, "bad-direction", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 0,
    } as unknown as ForestOpeningInteraction)).toThrow(/direction/i);
  });

  it("commits stone steps only after both stones occupy their authored seats", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);
    expect(apply(obstacle, "stone-a", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    })).toMatchObject({ ok: true, duplicate: false });
    expect(obstacle.snapshot()).toMatchObject({ committedSolutionId: null, stones: { a: { seated: true }, b: { seated: false } } });

    expect(apply(obstacle, "stone-b", {
      kind: "push_stone", objectId: "stream.stone.b", direction: 1,
    }, actorNear(manifest.obstacle.objectAnchorsPx.stoneB))).toMatchObject({ ok: true });
    expect(obstacle.snapshot()).toMatchObject({
      committedSolutionId: "stone_steps",
      stones: {
        a: { seated: true, bounds: { x: 1872, y: 736, width: 12, height: 12 } },
        b: { seated: true, bounds: { x: 1904, y: 736, width: 12, height: 12 } },
      },
    });
  });

  it("commits a correctly bridged deadwood AABB", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);

    const result = apply(obstacle, "deadwood", {
      kind: "drag_deadwood", objectId: "stream.deadwood", direction: 1,
    }, actorNear(manifest.obstacle.objectAnchorsPx.deadwood));

    expect(result).toMatchObject({ ok: true });
    expect(obstacle.snapshot()).toMatchObject({
      committedSolutionId: "deadwood_bridge",
      deadwood: { bridged: true, bounds: { x: 1936, y: 732, width: 64, height: 8 } },
    });
  });

  it("commits the authored shallow detour only from its physical entrance", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);
    const entry = manifest.obstacle.materialPocketPx;

    expect(apply(obstacle, "detour", { kind: "enter_shallow_detour" }, {
      x: entry.x + 4, y: entry.y + 4, width: 12, height: 14,
    })).toMatchObject({ ok: true });
    expect(obstacle.snapshot()).toMatchObject({
      committedSolutionId: "shallow_detour",
      shallowDetourEntered: true,
    });
  });

  it("replays the same operation idempotently and rejects conflicting solution work", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);
    const request = { kind: "drag_deadwood", objectId: "stream.deadwood", direction: 1 } as const;
    const actor = actorNear(manifest.obstacle.objectAnchorsPx.deadwood);
    const first = apply(obstacle, "same-op", request, actor);
    const afterFirst = obstacle.save();

    expect(apply(obstacle, "same-op", request, actor)).toMatchObject({ ok: true, duplicate: true });
    expect(obstacle.save()).toEqual(afterFirst);
    expect(() => apply(obstacle, "same-op", { kind: "enter_shallow_detour" }, actor)).toThrow(/operation.*conflict/i);
    expect(apply(obstacle, "other-route", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    })).toMatchObject({ ok: false, reason: "solution_conflict" });
    expect(first.snapshot.committedSolutionId).toBe("deadwood_bridge");
  });

  it("resets partial work but preserves a committed solution", () => {
    const partial = ForestOpeningObstacle.fresh(manifest);
    apply(partial, "partial-stone", {
      kind: "push_stone", objectId: "stream.stone.a", direction: 1,
    });
    expect(partial.snapshot().stones.a.seated).toBe(true);

    const resetPartial = partial.resetToCommittedState();
    expect(resetPartial).toMatchObject({
      revision: 0,
      committedSolutionId: null,
      stones: { a: { seated: false }, b: { seated: false } },
    });

    const committed = ForestOpeningObstacle.fresh(manifest);
    apply(committed, "commit-log", {
      kind: "drag_deadwood", objectId: "stream.deadwood", direction: 1,
    }, actorNear(manifest.obstacle.objectAnchorsPx.deadwood));
    const before = committed.save();
    expect(committed.resetToCommittedState().committedSolutionId).toBe("deadwood_bridge");
    expect(committed.save()).toEqual(before);
  });

  it("moves light debris with water, wets soft soil into mud, and preserves material mass", () => {
    const obstacle = ForestOpeningObstacle.fresh(manifest);
    const before = obstacle.snapshot().materialPocket;
    const countsBefore = countForestOpeningMaterials(before.cells);
    expect(obstacle.materialAt(48, 38)).toBe(FOREST_OPENING_MATERIAL.light_debris);
    expect(obstacle.materialAt(48, 40)).toBe(FOREST_OPENING_MATERIAL.water);
    expect(obstacle.materialAt(48, 48)).toBe(FOREST_OPENING_MATERIAL.soft_soil);

    obstacle.advanceTicks(1);

    const after = obstacle.snapshot().materialPocket;
    const countsAfter = countForestOpeningMaterials(after.cells);
    expect(obstacle.materialAt(48, 38)).toBe(FOREST_OPENING_MATERIAL.air);
    expect(obstacle.materialAt(49, 38)).toBe(FOREST_OPENING_MATERIAL.light_debris);
    expect(obstacle.materialAt(48, 48)).toBe(FOREST_OPENING_MATERIAL.mud);
    expect(after.cells).toHaveLength(128 * 64);
    expect(countsAfter.light_debris).toBe(countsBefore.light_debris);
    expect(countsAfter.water).toBe(countsBefore.water);
    expect(countsAfter.soft_soil + countsAfter.mud).toBe(countsBefore.soft_soil + countsBefore.mud);
    expect(countsAfter.protected_mass).toBe(countsBefore.protected_mass);
  });

  it("keeps material simulation identical under 30 and 60 render schedules", () => {
    const atThirty = ForestOpeningObstacle.fresh(manifest);
    const atSixty = ForestOpeningObstacle.fresh(manifest);

    for (let frame = 0; frame < 30; frame += 1) atThirty.advanceTicks(2);
    for (let frame = 0; frame < 60; frame += 1) atSixty.advanceTicks(1);

    expect(atThirty.snapshot().materialPocket).toEqual(atSixty.snapshot().materialPocket);
  });

  it("rejects save claims that do not match the physical obstacle state", () => {
    const save = ForestOpeningObstacle.fresh(manifest).save();
    expect(() => ForestOpeningObstacle.fromSave(manifest, {
      ...save,
      committedSolutionId: "stone_steps",
    })).toThrow(/physical|solution|state/i);
    expect(() => ForestOpeningObstacle.fromSave(manifest, {
      ...save,
      stones: {
        ...save.stones,
        a: { bounds: { x: 0, y: 0, width: 12, height: 12 }, seated: true },
      },
    })).toThrow(/physical|stone|state/i);
  });
});
