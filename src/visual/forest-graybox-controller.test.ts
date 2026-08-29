import { describe, expect, it } from "vitest";
import { PrologueFlowSession } from "../game/prologue-flow";
import type { RuntimeInput } from "../runtime";
import { ForestGrayboxController } from "./forest-graybox-controller";

describe("ForestGrayboxController", () => {
  it("creates a deterministic verified forest runtime and bounded visible chunks", () => {
    const first = ForestGrayboxController.fresh({ seed: "forest.controller.audit" }).snapshot();
    const second = ForestGrayboxController.fresh({ seed: "forest.controller.audit" }).snapshot();

    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(["runtime", "location", "streamedChunks", "diagnostics"]);
    expect(first.runtime).toMatchObject({ seed: "forest.controller.audit", camera: { width: 640, height: 360 } });
    expect(first.location).toMatchObject({ districtId: "forest.arrival", sceneId: "scene.valley.arrival_shelf" });
    expect(first.streamedChunks.length).toBeGreaterThan(0);
    expect(first.streamedChunks.every((chunk) => chunk.materials.length === 256)).toBe(true);
    expect(first.diagnostics).toMatchObject({
      regionId: "valley_prologue",
      profileId: "forest_side_scroll.v0.1",
      seed: "forest.controller.audit",
      topologyDigest: first.runtime.topologyDigest,
      cache: { retained: expect.any(Number), materialized: expect.any(Number) },
    });
  });

  it("accepts semantic RuntimeInput only and fails closed on domain-shaped commands", () => {
    const controller = ForestGrayboxController.fresh({ seed: "forest.controller.input" });
    const before = controller.snapshot();
    const after = controller.advanceTicks(30, { moveX: 1, jump: false });

    expect(after.runtime.tick).toBe(before.runtime.tick + 30);
    expect(after.runtime.player.position.x).toBeGreaterThan(before.runtime.player.position.x);
    expect(() => controller.advanceTicks(1, {
      moveX: 1,
      inventory: ["forbidden"],
    } as unknown as RuntimeInput)).toThrow(/RuntimeInput/);
    expect(() => ForestGrayboxController.fresh({
      seed: "forest.controller.extra",
      flags: { quest: true },
    } as never)).toThrow(/seed only/);
  });

  it("resets only through an explicit seed and reproduces the same initial state", () => {
    const controller = ForestGrayboxController.fresh({ seed: "forest.controller.reset" });
    controller.advanceTicks(120, { moveX: 1 });

    const reset = controller.reset({ seed: "forest.controller.reset" });
    const fresh = ForestGrayboxController.fresh({ seed: "forest.controller.reset" }).snapshot();
    expect(reset).toEqual(fresh);

    const changed = controller.reset({ seed: "forest.controller.reset.changed" });
    expect(changed.runtime.seed).toBe("forest.controller.reset.changed");
    expect(changed.runtime.topologyDigest).not.toBe(fresh.runtime.topologyDigest);
  });

  it("traverses arrival through settlement toward the waterwheel without mutating a real Flow save", () => {
    const flow = PrologueFlowSession.fresh({
      sessionId: "forest.controller.domain-nonmutation",
      currentMp: 12,
      maxMp: 24,
    });
    const beforeBytes = JSON.stringify(flow.toSave());
    const controller = ForestGrayboxController.fresh({ seed: "forest.controller.route" });
    const visited = new Set([controller.snapshot().location.districtId]);

    for (let cycle = 0; cycle < 48; cycle += 1) {
      visited.add(controller.advanceTicks(1, { moveX: 1, jump: true }).location.districtId);
      visited.add(controller.advanceTicks(74, { moveX: 1, jump: false }).location.districtId);
    }

    const final = controller.snapshot();
    const routeEvidence = JSON.stringify({ visited: [...visited], position: final.runtime.player.position });
    expect(visited.has("forest.arrival"), routeEvidence).toBe(true);
    expect(visited.has("forest.settlement")).toBe(true);
    expect(final.runtime.player.position.x, routeEvidence).toBeGreaterThan(3_584);
    expect(JSON.stringify(flow.toSave())).toBe(beforeBytes);
  });
});
