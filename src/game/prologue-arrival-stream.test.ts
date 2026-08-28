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

  it("fails closed without mutation for all N00/N01 learning and casting entry points", () => {
    const target = createStream("pre-hermit-closed");
    const before = structuredClone(target.toSave());
    const eventsBefore = target.session.events().length;

    expect(target.discoverTelo("occurrence.pre-hermit")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
      learningProposal: null,
    });
    expect(target.attuneTelo("attune.pre-hermit", "occurrence.pre-hermit")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
      learningProposal: null,
    });
    expect(target.manifestTelo("cast.pre-hermit")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
      learningProposal: null,
    });
    expect(target.toSave()).toEqual(before);
    expect(target.session.events()).toHaveLength(eventsBefore);
    expect(target.snapshot()).toMatchObject({
      route: "unresolved",
      routeReady: false,
      manifestedWater: [],
      session: {
        mp: { currentMp: before.state.mp.currentMp },
        learning: { words: {} },
        economy: { lots: [] },
      },
    });
  });

  it("does not revive the deleted magic route from a legacy persisted flag", () => {
    const session = createPrologueArrivalStreamInitialSession({ sessionId: "canonical.legacy-magic" });
    const legacyFlagId = `runtime.value:${JSON.stringify([
      PROLOGUE_STREAM_SCENE_ID,
      "route.manifested-water-settled",
    ])}`;
    expect(session.apply({
      eventId: "test.legacy.manifested-water",
      sequence: session.nextSequence(),
      type: "world_flag_set",
      payload: { flagId: legacyFlagId, value: true, scope: "area", areaId: PROLOGUE_AREA_ID },
    }).applied).toBe(true);
    const target = enterStream(session);
    const before = structuredClone(target.toSave());

    expect(target.snapshot()).toMatchObject({ route: "unresolved", routeReady: false, manifestedWater: [] });
    target.advanceTicks(90);
    expect(target.snapshot()).toMatchObject({ route: "unresolved", routeReady: false, manifestedWater: [] });
    expect(target.toSave()).toEqual(before);
  });

  it("keeps the non-magic checkpoint recovery timing generated from content", () => {
    const target = createStream("checkpoint");
    expect(target.resetToCheckpoint("reset.checkpoint").manifestedWater).toEqual([]);

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
