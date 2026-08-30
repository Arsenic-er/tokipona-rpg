import { describe, expect, it } from "vitest";
import generated from "../generated/content-runtime.v0.1.json";
import { readRuntimeForestOpeningManifest } from "../content/runtime-forest-opening-manifest";
import {
  ForestOpeningEcology,
  type ForestOpeningPerceptionFrame,
} from "./forest-opening-ecology";

const manifest = readRuntimeForestOpeningManifest(generated);
const QUIET_FRAME: ForestOpeningPerceptionFrame = {
  playerPosition: { x: 0, y: 0 },
  playerVelocity: { x: 0, y: 0 },
  soundEvents: [],
};

function fresh(seed = "forest.opening.ecology"): ForestOpeningEcology {
  return ForestOpeningEcology.fresh(manifest, seed);
}

describe("ForestOpeningEcology", () => {
  it("keeps bounded idle movement deterministic for the same seed", () => {
    const first = fresh();
    const second = fresh();

    first.advanceTicks(180, QUIET_FRAME);
    second.advanceTicks(180, QUIET_FRAME);

    expect(second.snapshot()).toEqual(first.snapshot());
    expect(first.snapshot()).toMatchObject({
      tick: 180,
      rabbit: { mode: "foraging" },
      wetlandBird: { mode: "wading" },
    });
    expect(Math.abs(first.snapshot().rabbit.position.x - 768)).toBeLessThanOrEqual(12);
    expect(Math.abs(first.snapshot().wetlandBird.position.x - 1488)).toBeLessThanOrEqual(4);
  });

  it("alerts the rabbit from sight or an authored sound event", () => {
    const sight = fresh("forest.ecology.sight");
    sight.advanceTicks(1, {
      playerPosition: { x: 780, y: 480 },
      playerVelocity: { x: 1, y: 0 },
      soundEvents: [],
    });
    expect(sight.snapshot().rabbit.mode).toBe("alert");

    const sound = fresh("forest.ecology.sound");
    sound.advanceTicks(1, {
      ...QUIET_FRAME,
      soundEvents: [{ position: { x: 768, y: 480 }, strength: 1 }],
    });
    expect(sound.snapshot().rabbit.mode).toBe("alert");
  });

  it("routes a fleeing rabbit to its authored shrub refuge", () => {
    const ecology = fresh("forest.ecology.rabbit-refuge");
    ecology.advanceTicks(2, {
      playerPosition: { x: 780, y: 480 },
      playerVelocity: { x: 1, y: 0 },
      soundEvents: [],
    });
    expect(ecology.snapshot().rabbit.mode).toBe("fleeing");

    ecology.advanceTicks(180, QUIET_FRAME);

    expect(ecology.snapshot().rabbit).toMatchObject({
      mode: "sheltered",
      position: { x: 960, y: 480 },
    });
  });

  it("makes the wetland bird take off away from the perceived player and depart", () => {
    const ecology = fresh("forest.ecology.bird-flight");
    const player = { x: 1472, y: 672 };
    const before = ecology.snapshot().wetlandBird.position;
    ecology.advanceTicks(2, {
      playerPosition: player,
      playerVelocity: { x: 1, y: 0 },
      soundEvents: [],
    });
    expect(ecology.snapshot().wetlandBird.mode).toBe("taking_off");
    expect(distance(ecology.snapshot().wetlandBird.position, player)).toBeGreaterThan(distance(before, player));

    ecology.advanceTicks(180, QUIET_FRAME);
    expect(ecology.snapshot().wetlandBird).toMatchObject({
      mode: "departed",
      position: { x: 1664, y: 544 },
    });
  });

  it("accepts only a narrow finite perception frame", () => {
    const ecology = fresh("forest.ecology.input-boundary");
    expect(() => ecology.advanceTicks(1, {
      ...QUIET_FRAME,
      inventory: ["forbidden"],
    } as unknown as ForestOpeningPerceptionFrame)).toThrow(/perception|unknown/i);
    expect(() => ecology.advanceTicks(1, {
      ...QUIET_FRAME,
      playerPosition: { x: Number.NaN, y: 0 },
    })).toThrow(/finite|position/i);
    expect(() => ecology.advanceTicks(1, {
      ...QUIET_FRAME,
      soundEvents: [{ position: { x: 0, y: 0 }, strength: 2 }],
    })).toThrow(/strength/i);
  });

  it("round-trips strict saves and rejects tampering", () => {
    const source = fresh("forest.ecology.reload");
    source.advanceTicks(40, QUIET_FRAME);
    const save = source.save();
    const restored = ForestOpeningEcology.fromSave(manifest, save);

    expect(restored.save()).toEqual(save);
    expect(restored.snapshot()).toEqual(source.snapshot());
    expect(() => ForestOpeningEcology.fromSave(manifest, {
      ...save,
      checksum: `sha256:${"0".repeat(64)}`,
    })).toThrow(/checksum/i);
  });

  it("resets local wildlife state without rewinding the supplied world tick", () => {
    const ecology = fresh("forest.ecology.reset");
    ecology.advanceTicks(12, {
      playerPosition: { x: 780, y: 480 },
      playerVelocity: { x: 1, y: 0 },
      soundEvents: [],
    });
    expect(ecology.snapshot().rabbit.mode).not.toBe("foraging");

    const reset = ecology.resetAtTick(120);

    expect(reset).toMatchObject({
      tick: 120,
      revision: 0,
      rabbit: { mode: "foraging", position: { x: 768, y: 480 } },
      wetlandBird: { mode: "wading", position: { x: 1488, y: 672 } },
    });
  });

  it("is fixed-step identical under 30 and 60 render schedules", () => {
    const atThirty = fresh("forest.ecology.fps");
    const atSixty = fresh("forest.ecology.fps");
    for (let frame = 0; frame < 30; frame += 1) atThirty.advanceTicks(2, QUIET_FRAME);
    for (let frame = 0; frame < 60; frame += 1) atSixty.advanceTicks(1, QUIET_FRAME);
    expect(atThirty.snapshot()).toEqual(atSixty.snapshot());
  });
});

function distance(left: Readonly<{ x: number; y: number }>, right: Readonly<{ x: number; y: number }>): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
