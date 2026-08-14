import { describe, expect, it } from "vitest";
import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import type { GameSession } from "../session/game-session";
import {
  PROLOGUE_ARRIVAL_SCENE,
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_AREA_ID,
  PROLOGUE_ROUTE_FLAGS,
  PROLOGUE_SAFE_RANGE_RUNTIME_SCENE,
  PROLOGUE_SOFT_LOCK_RECOVERY_TICKS,
  PROLOGUE_STREAM_SCENE,
  PROLOGUE_STREAM_SCENE_ID,
  PROLOGUE_TELO_MP_COST,
  PrologueArrivalStreamSession,
  createPrologueArrivalStreamInitialSession,
} from "./prologue-arrival-stream";

const canonical = readRuntimeSceneManifestIndex(generatedRuntimeArtifact);
const streamManifest = canonical.byId[PROLOGUE_STREAM_SCENE_ID]!;

function enterStream(session: GameSession, entranceId = "stream.from_arrival"): PrologueArrivalStreamSession {
  const entrance = PROLOGUE_STREAM_SCENE.entrances.find((candidate) => candidate.id === entranceId)!;
  expect(session.apply({
    eventId: `test.scene.${entranceId}`,
    sequence: session.nextSequence(),
    type: "scene_entered",
    payload: { sceneId: PROLOGUE_STREAM_SCENE_ID },
  }).applied).toBe(true);
  expect(session.apply({
    eventId: `test.checkpoint.${entranceId}`,
    sequence: session.nextSequence(),
    type: "checkpoint_set",
    payload: {
      checkpoint: {
        id: `checkpoint.${entranceId}`,
        sceneId: PROLOGUE_STREAM_SCENE_ID,
        position: entrance.position,
        revision: 1,
      },
    },
  }).applied).toBe(true);
  return new PrologueArrivalStreamSession(session);
}

function createStream(suffix: string, entranceId?: string): PrologueArrivalStreamSession {
  return enterStream(createPrologueArrivalStreamInitialSession({ sessionId: `canonical.${suffix}` }), entranceId);
}

describe("canonical prologue arrival/stream coordinator", () => {
  it("constructs both runtime scenes exclusively from the generated canonical manifests", () => {
    const arrival = canonical.byId[PROLOGUE_ARRIVAL_SCENE_ID]!;
    expect(PROLOGUE_ARRIVAL_SCENE).toMatchObject({
      id: arrival.sceneId,
      collisionRows: arrival.collisionRows,
      entrances: arrival.entrances.map((entry) => ({ id: entry.id, position: entry.spawnPx })),
    });
    expect(PROLOGUE_STREAM_SCENE).toMatchObject({
      id: streamManifest.sceneId,
      collisionRows: streamManifest.collisionRows,
      entrances: streamManifest.entrances.map((entry) => ({ id: entry.id, position: entry.spawnPx })),
    });
    const safeRange = canonical.byId["scene.valley.safe_range"]!;
    expect(PROLOGUE_SAFE_RANGE_RUNTIME_SCENE).toMatchObject({
      id: safeRange.sceneId,
      collisionRows: safeRange.collisionRows,
      entrances: safeRange.entrances.map((entry) => ({ id: entry.id, position: entry.spawnPx })),
    });
    expect(PROLOGUE_STREAM_SCENE.exits).toEqual(streamManifest.exits
      .filter((exit) => exit.target.kind === "scene")
      .map((exit) => ({
        id: exit.id,
        bounds: exit.boundsPx,
        targetSceneId: exit.target.kind === "scene" ? exit.target.sceneId : "",
        targetEntranceId: exit.target.kind === "scene" ? exit.target.entranceId : "",
      })));
  });

  it.each([
    ["loose material", (target: PrologueArrivalStreamSession) => target.pushLooseStone("tool.stone")],
    ["upper bank/rotten log", (target: PrologueArrivalStreamSession) => target.placeRottenLog("tool.log")],
    ["shallow crossing/soft soil", (target: PrologueArrivalStreamSession) => target.digSoftSoil("tool.soil")],
  ])("treats the %s non-magic route as an independent alternative and keeps repeats idempotent", (_label, act) => {
    const target = createStream(`route.${String(_label)}`);
    const learningBefore = target.snapshot().session.learning;
    expect(act(target).accepted).toBe(true);
    expect(target.snapshot()).toMatchObject({ route: "tools", routeReady: true, killCount: 0 });
    const eventsAfterFirst = target.session.events().length;
    expect(act(target).accepted).toBe(true);
    expect(target.session.events()).toHaveLength(eventsAfterFirst);
    expect(target.snapshot().session.learning).toEqual(learningBefore);
  });

  it("commits the region-node firstTraverseCommit automatically on AABB overlap, exactly once", () => {
    const target = createStream("settlement", "stream.from_settlement");
    target.pushLooseStone("route.ready");
    for (let tick = 0; tick < 24 && !target.snapshot().settlementEntranceReached; tick += 1) {
      target.advanceTicks(1, { moveX: 1 });
    }
    expect(target.snapshot().settlementEntranceReached).toBe(true);
    const firstTraverseCommit = streamManifest.exits.find((exit) =>
      exit.target.kind === "scene" && exit.target.sceneId === "scene.valley.settlement"
    )!.firstTraverseCommit!;
    const flagId = firstTraverseCommit;
    expect(flagId).toBe(PROLOGUE_ROUTE_FLAGS.settlementReached);
    expect(target.snapshot().session.world.flags[`region:${PROLOGUE_AREA_ID}:${flagId}`]).toMatchObject({
      flagId,
      scope: "region",
      regionId: PROLOGUE_AREA_ID,
      value: true,
    });
    const loaded = PrologueArrivalStreamSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(loaded.snapshot().settlementEntranceReached).toBe(true);
    const events = target.session.events().length;
    target.advanceTicks(20, { moveX: 1 });
    expect(target.session.events()).toHaveLength(events);
    expect(target.resetArea("reset.after-settlement").settlementEntranceReached).toBe(true);
  });

  it("persists pending water atomically with MP/learning, resumes its fall, and settles durably", () => {
    const target = createStream("telo");
    expect(target.discoverTelo("occurrence.telo").accepted).toBe(true);
    expect(target.attuneTelo("attune.telo", "occurrence.telo").accepted).toBe(true);
    const beforeMp = target.snapshot().session.mp.currentMp;
    expect(target.manifestTelo("cast.telo").accepted).toBe(true);
    expect(target.snapshot()).toMatchObject({ routeReady: false, manifestedWater: [{ settled: false }] });
    expect(target.snapshot().manifestedWater[0]!.velocity).toEqual({ x: 0, y: 0 });
    expect(target.snapshot().session.mp.currentMp).toBe(beforeMp - PROLOGUE_TELO_MP_COST);

    const pending = PrologueArrivalStreamSession.fromSave(JSON.parse(JSON.stringify(target.toSave())));
    expect(pending.snapshot()).toMatchObject({ routeReady: false, manifestedWater: [{ settled: false }] });
    const eventsBeforeRepeat = pending.session.events().length;
    expect(pending.manifestTelo("cast.telo").accepted).toBe(true);
    expect(pending.snapshot().session.mp.currentMp).toBe(beforeMp - PROLOGUE_TELO_MP_COST);
    expect(pending.session.events()).toHaveLength(eventsBeforeRepeat);

    pending.advanceTicks(1);
    expect(pending.snapshot().manifestedWater[0]!.velocity.y).toBeGreaterThan(0);
    pending.advanceTicks(90);
    expect(pending.snapshot()).toMatchObject({ route: "telo", routeReady: true, manifestedWater: [{ settled: true }] });
    const settled = PrologueArrivalStreamSession.fromSave(JSON.parse(JSON.stringify(pending.toSave())));
    expect(settled.snapshot()).toMatchObject({ route: "telo", routeReady: true, manifestedWater: [{ settled: true }] });
  });

  it("keeps pending manifested water across checkpoint reset and uses generated recovery timing", () => {
    const target = createStream("checkpoint");
    target.discoverTelo("occurrence.checkpoint");
    target.attuneTelo("attune.checkpoint", "occurrence.checkpoint");
    target.manifestTelo("cast.checkpoint");
    expect(target.resetToCheckpoint("reset.pending").manifestedWater).toMatchObject([{ settled: false }]);

    target.pushLooseStone("route.checkpoint");
    target.damageCrossing("damage.checkpoint");
    target.advanceTicks(PROLOGUE_SOFT_LOCK_RECOVERY_TICKS - 1);
    expect(target.snapshot().softLock.damaged).toBe(true);
    target.advanceTicks(1);
    expect(target.snapshot().softLock.damaged).toBe(false);
    expect(PROLOGUE_SOFT_LOCK_RECOVERY_TICKS).toBe(
      streamManifest.recovery.maximumSoftlockRecoverySeconds * 60,
    );
  });
});
