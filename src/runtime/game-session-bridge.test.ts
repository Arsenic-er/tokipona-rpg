import { describe, expect, it } from "vitest";
import { GameSession, type SessionEconomySummary } from "../session/game-session";
import { GameSessionRuntimeBridge, type SceneDefinition } from "./index";

const FLOOR_Y = 5 * 16 - 14;

const SCENES: readonly SceneDefinition[] = [
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

const ECONOMY: SessionEconomySummary = {
  coin: 7,
  walletRevision: 1,
  inventoryRevision: 0,
  lots: [],
};

const createSession = (): GameSession => GameSession.create({
  sessionId: "save.runtime-bridge.001",
  mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
  currentSceneId: "room.a",
  checkpoint: {
    id: "checkpoint.room-a.entry",
    sceneId: "room.a",
    position: { x: 16, y: FLOOR_Y },
    revision: 0,
  },
  economy: ECONOMY,
});

const createBridge = (session = createSession()): GameSessionRuntimeBridge =>
  new GameSessionRuntimeBridge({
    session,
    scenes: SCENES,
    sceneAreas: { "room.a": "prologue", "room.b": "prologue" },
    entranceByScene: { "room.a": "start", "room.b": "from-a" },
    viewportPx: { x: 96, y: 64 },
  });

const travelUntil = (
  bridge: GameSessionRuntimeBridge,
  sceneId: string,
  moveX: -1 | 1,
): void => {
  for (let tick = 0; tick < 240 && bridge.runtime.snapshot().sceneId !== sceneId; tick += 1) {
    bridge.advanceTicks(1, { moveX });
  }
  expect(bridge.runtime.snapshot().sceneId).toBe(sceneId);
  expect(bridge.sessionSnapshot().world.currentSceneId).toBe(sceneId);
};

describe("GameSessionRuntimeBridge", () => {
  it("round-trips two rooms, diff, checkpoint and local reset through save/load", () => {
    const bridge = createBridge();
    expect(bridge.runtime.globalProgress).toBeNull();

    travelUntil(bridge, "room.b", 1);
    travelUntil(bridge, "room.a", -1);
    travelUntil(bridge, "room.b", 1);

    const tile = bridge.setPersistentTileSolid(
      "event.runtime.tile.room-b.7.0",
      "room.b",
      7,
      0,
      true,
    );
    expect(tile).toMatchObject({ committed: true, rejectionCode: null });
    bridge.setPersistentValue(
      "event.runtime.value.sluice-open",
      "room.b",
      "sluice.open",
      true,
    );
    const checkpoint = bridge.setCheckpoint(
      "event.runtime.checkpoint.room-b",
      "checkpoint.room-b.safe",
    );
    expect(checkpoint.sessionResult).toMatchObject({ applied: true, reason: "applied" });
    const checkpointPosition = checkpoint.sessionResult.snapshot.checkpoint.position;

    bridge.advanceTicks(30, { moveX: 1 });
    const reset = bridge.resetToCheckpoint("event.runtime.reset.local.001");
    expect(reset.sessionResult.applied).toBe(true);
    expect(reset.runtime.player.position).toEqual(checkpointPosition);
    expect(bridge.runtime.persistentDiff("room.b")).toEqual({
      sceneId: "room.b",
      values: { "sluice.open": true },
      tileSolidity: { "7,0": true },
    });

    const beforeSave = bridge.sessionSnapshot();
    expect(beforeSave.economy).toMatchObject(ECONOMY);
    expect(beforeSave.economy.schema).toBe("tokipona.economy-state.v0.2");
    const loaded = GameSession.load(JSON.parse(JSON.stringify(bridge.session.toSave())));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const rebuilt = createBridge(loaded.session);
    expect(rebuilt.sessionSnapshot()).toEqual(beforeSave);
    expect(rebuilt.runtime.snapshot()).toMatchObject({
      sceneId: "room.b",
      player: { position: checkpointPosition },
      checkpoint: {
        id: "checkpoint.room-b.safe",
        sceneId: "room.b",
        position: checkpointPosition,
      },
    });
    expect(rebuilt.runtime.persistentDiff("room.b")).toEqual({
      sceneId: "room.b",
      values: { "sluice.open": true },
      tileSolidity: { "7,0": true },
    });
    expect(rebuilt.sessionSnapshot().learning).toEqual(beforeSave.learning);
    expect(rebuilt.sessionSnapshot().economy).toEqual(beforeSave.economy);
  });

  it("commits an area reset, clears only that area's runtime diff, and keeps global domains", () => {
    const bridge = createBridge();
    bridge.setPersistentValue("event.runtime.value.crate", "room.a", "crate.broken", true);
    travelUntil(bridge, "room.b", 1);
    bridge.setCheckpoint("event.runtime.checkpoint.before-area-reset", "checkpoint.before-area-reset");
    bridge.setPersistentValue("event.runtime.value.gate", "room.b", "gate.open", true);
    const learningBefore = bridge.sessionSnapshot().learning;
    const economyBefore = bridge.sessionSnapshot().economy;

    const reset = bridge.resetArea("event.runtime.area-reset.prologue", "prologue");

    expect(reset.sessionResult).toMatchObject({ applied: true, reason: "applied" });
    expect(reset.runtime.sceneId).toBe("room.b");
    expect(bridge.sessionSnapshot().world.areaEpochs.prologue).toBe(1);
    expect(Object.values(bridge.sessionSnapshot().world.flags).some((flag) =>
      flag.flagId.startsWith("runtime."),
    )).toBe(false);
    expect(bridge.runtime.persistentDiff("room.a")).toEqual({
      sceneId: "room.a",
      values: {},
      tileSolidity: {},
    });
    expect(bridge.runtime.persistentDiff("room.b")).toEqual({
      sceneId: "room.b",
      values: {},
      tileSolidity: {},
    });
    expect(bridge.sessionSnapshot().learning).toEqual(learningBefore);
    expect(bridge.sessionSnapshot().economy).toEqual(economyBefore);
    expect(bridge.runtime.globalProgress).toBeNull();
  });

  it("does not submit rejected anti-soft-lock edits to the session ledger", () => {
    const bridge = createBridge();
    const sequence = bridge.session.nextSequence();
    for (let tileY = 0; tileY < 4; tileY += 1) {
      expect(bridge.setPersistentTileSolid(
        `event.runtime.wall.${tileY}`,
        "room.a",
        6,
        tileY,
        true,
      ).committed).toBe(true);
    }
    const beforeRejected = bridge.session.events().length;
    const rejected = bridge.setPersistentTileSolid(
      "event.runtime.wall.closing",
      "room.a",
      6,
      4,
      true,
    );
    expect(rejected).toEqual({
      committed: false,
      rejectionCode: "recovery_route_blocked",
      commit: null,
    });
    expect(bridge.session.events()).toHaveLength(beforeRejected);
    expect(bridge.session.nextSequence()).toBe(sequence + 4);
  });
});
