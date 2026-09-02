import { describe, expect, it } from "vitest";
import {
  FixedStepRpgRuntime,
  SIMULATION_CELLS_PER_WORLD_TILE,
  simulationCellToWorldPixel,
  simulationCellToWorldTile,
  type SceneDefinition,
  worldPixelToSimulationCell,
  worldTileToSimulationCell,
} from "./index";

const FLOOR_Y = 5 * 16 - 14;

const TWO_ROOMS: readonly SceneDefinition[] = [
  {
    id: "room.a",
    collisionRows: [
      "............",
      "............",
      "............",
      "............",
      "............",
      "############",
    ],
    defaultEntranceId: "start",
    entrances: [
      { id: "start", position: { x: 16, y: FLOOR_Y } },
      { id: "from-b", position: { x: 140, y: FLOOR_Y } },
    ],
    exits: [{
      id: "to-b",
      bounds: { x: 164, y: 48, width: 16, height: 32 },
      targetSceneId: "room.b",
      targetEntranceId: "from-a",
    }],
  },
  {
    id: "room.b",
    collisionRows: [
      "............",
      "............",
      "............",
      "............",
      "............",
      "############",
    ],
    defaultEntranceId: "from-a",
    entrances: [
      { id: "from-a", position: { x: 24, y: FLOOR_Y } },
      { id: "recovery", position: { x: 96, y: FLOOR_Y } },
    ],
    exits: [{
      id: "to-a",
      bounds: { x: 0, y: 48, width: 16, height: 32 },
      targetSceneId: "room.a",
      targetEntranceId: "from-b",
    }],
  },
] as const;

interface TestProgress {
  discoveredGlyphs: Set<string>;
  revision: number;
}

const createRuntime = (progress: TestProgress = {
  discoveredGlyphs: new Set<string>(),
  revision: 0,
}): FixedStepRpgRuntime<TestProgress> => new FixedStepRpgRuntime({
  scenes: TWO_ROOMS,
  initialSceneId: "room.a",
  initialEntranceId: "start",
  globalProgress: progress,
  viewportPx: { x: 96, y: 64 },
});

const settle = (runtime: FixedStepRpgRuntime<TestProgress>): void => {
  runtime.advanceTicks(5);
};

describe("runtime coordinate contract", () => {
  it("maps every 16px world tile to eight 2px simulation cells", () => {
    expect(SIMULATION_CELLS_PER_WORLD_TILE).toBe(8);
    expect(worldTileToSimulationCell(3)).toBe(24);
    expect(simulationCellToWorldTile(31)).toBe(3);
    expect(worldPixelToSimulationCell(17)).toBe(8);
    expect(simulationCellToWorldPixel(8)).toBe(16);
  });
});

describe("FixedStepRpgRuntime", () => {
  it("preserves the deterministic 600-tick snapshot and replay start signature", () => {
    const runtime = createRuntime();
    settle(runtime);
    runtime.startRecording();
    for (let tick = 0; tick < 600; tick += 1) {
      runtime.advanceTicks(1, {
        moveX: tick < 150 ? 1 : tick < 300 ? -1 : tick < 420 ? 0 : 1,
        jump: tick === 30 || tick === 180 || tick === 450,
      });
    }
    const replay = runtime.stopRecording();

    expect(replay.startSignature).toBe("{\"tick\":5,\"sceneId\":\"room.a\",\"player\":[16,66,0,0,true],\"checkpoint\":{\"id\":\"checkpoint.initial\",\"sceneId\":\"room.a\",\"position\":{\"x\":16,\"y\":66},\"tick\":0},\"persistent\":[{\"sceneId\":\"room.a\",\"values\":{},\"tileSolidity\":{}}]}");
    expect(runtime.snapshot()).toEqual({
      tick: 605,
      sceneId: "room.b",
      player: {
        position: { x: 142.80000000000013, y: 66 },
        velocity: { x: 88, y: 0 },
        grounded: true,
        body: { width: 12, height: 14 },
      },
      camera: { x: 96, y: 32, width: 96, height: 64 },
      checkpoint: {
        id: "checkpoint.initial",
        sceneId: "room.a",
        position: { x: 16, y: 66 },
        tick: 0,
      },
    });
  });

  it("produces the same simulation state at different render frame rates", () => {
    const atThirtyFps = createRuntime();
    const atOneTwentyFps = createRuntime();

    for (let frame = 0; frame < 30; frame += 1) {
      atThirtyFps.advanceFrame(1 / 30, { moveX: 1 });
    }
    for (let frame = 0; frame < 120; frame += 1) {
      atOneTwentyFps.advanceFrame(1 / 120, { moveX: 1 });
    }

    expect(atThirtyFps.snapshot()).toEqual(atOneTwentyFps.snapshot());
    expect(atThirtyFps.snapshot().tick).toBe(60);
  });

  it("records deterministic tick inputs and rejects playback from a different start", () => {
    const source = createRuntime();
    const target = createRuntime();
    settle(source);
    settle(target);
    source.startRecording();
    source.advanceTicks(40, { moveX: 1 });
    source.advanceTicks(1, { moveX: 1, jump: true });
    source.advanceTicks(45, { moveX: 1 });
    const replay = source.stopRecording();

    expect(target.playReplay(replay)).toEqual(source.snapshot());
    expect(replay.inputs).toHaveLength(86);

    const mismatched = createRuntime();
    mismatched.advanceTicks(1);
    expect(() => mismatched.playReplay(replay)).toThrow(/start state/);
  });

  it("keeps global progression and persistent diffs while a local reset clears particles", () => {
    const progress: TestProgress = { discoveredGlyphs: new Set(), revision: 0 };
    const runtime = createRuntime(progress);
    settle(runtime);
    const checkpoint = runtime.setCheckpoint("checkpoint.room-a.safe");
    runtime.setPersistentValue("room.a", "sluice.open", true);
    runtime.spawnTransientParticle({
      id: "droplet.1",
      position: { x: 30, y: 30 },
      velocity: { x: 1, y: 2 },
      ttlTicks: 100,
    });
    progress.discoveredGlyphs.add("telo");
    progress.revision += 1;
    runtime.advanceTicks(30, { moveX: 1 });

    const reset = runtime.resetToCheckpoint();

    expect(reset.sceneId).toBe("room.a");
    expect(reset.player.position).toEqual(checkpoint.position);
    expect(runtime.globalProgress).toBe(progress);
    expect(runtime.globalProgress.discoveredGlyphs.has("telo")).toBe(true);
    expect(runtime.globalProgress.revision).toBe(1);
    expect(runtime.persistentValue("room.a", "sluice.open")).toBe(true);
    expect(runtime.transientParticles()).toEqual([]);
  });

  it("switches between two rooms without losing either room's persistent state", () => {
    const runtime = createRuntime();
    runtime.setPersistentValue("room.a", "water.level", 3);
    runtime.spawnTransientParticle({
      id: "room-a.spark",
      position: { x: 20, y: 20 },
      velocity: { x: 0, y: 0 },
      ttlTicks: 200,
    });

    for (let tick = 0; tick < 200 && runtime.snapshot().sceneId === "room.a"; tick += 1) {
      runtime.advanceTicks(1, { moveX: 1 });
    }
    expect(runtime.snapshot().sceneId).toBe("room.b");
    expect(runtime.transientParticles()).toEqual([]);
    runtime.setPersistentValue("room.b", "gate.examined", true);

    for (let tick = 0; tick < 200 && runtime.snapshot().sceneId === "room.b"; tick += 1) {
      runtime.advanceTicks(1, { moveX: -1 });
    }
    expect(runtime.snapshot().sceneId).toBe("room.a");
    expect(runtime.persistentValue("room.a", "water.level")).toBe(3);
    expect(runtime.persistentValue("room.b", "gate.examined")).toBe(true);
  });

  it("treats world bounds as solid and rejects edits that remove the checkpoint's route", () => {
    const runtime = createRuntime();
    settle(runtime);
    runtime.setCheckpoint("checkpoint.left-side");

    runtime.advanceTicks(600, { moveX: -1 });
    const bounded = runtime.snapshot().player.position;
    expect(bounded.x).toBeGreaterThanOrEqual(0);
    expect(bounded.y).toBeGreaterThanOrEqual(0);

    for (let tileY = 0; tileY < 4; tileY += 1) {
      expect(runtime.setPersistentTileSolid("room.a", 6, tileY, true).accepted).toBe(true);
    }
    const closingEdit = runtime.setPersistentTileSolid("room.a", 6, 4, true);
    expect(closingEdit).toEqual({
      accepted: false,
      rejectionCode: "recovery_route_blocked",
    });
    expect(runtime.persistentDiff("room.a").tileSolidity["6,4"]).toBeUndefined();
    expect(runtime.setPersistentTileSolid("room.a", -1, 0, true)).toEqual({
      accepted: false,
      rejectionCode: "out_of_bounds",
    });
  });

  it("rejects blocked entrances and missing transition targets during registration", () => {
    const blocked: SceneDefinition = {
      id: "blocked",
      collisionRows: ["###", "###", "###"],
      entrances: [{ id: "start", position: { x: 16, y: 16 } }],
      exits: [],
    };
    expect(() => new FixedStepRpgRuntime({
      scenes: [blocked],
      initialSceneId: "blocked",
      globalProgress: {},
    })).toThrow(/blocked or out of bounds/);

    const dangling: SceneDefinition = {
      id: "dangling",
      collisionRows: ["...", "...", "###"],
      entrances: [{ id: "start", position: { x: 16, y: 18 } }],
      exits: [{
        id: "missing",
        bounds: { x: 32, y: 16, width: 16, height: 16 },
        targetSceneId: "absent",
        targetEntranceId: "start",
      }],
    };
    expect(() => new FixedStepRpgRuntime({
      scenes: [dangling],
      initialSceneId: "dangling",
      globalProgress: {},
    })).toThrow(/unknown scene/);
  });
});
