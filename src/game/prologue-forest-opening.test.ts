import { describe, expect, it } from "vitest";
import { sha256Canonical, type JsonValue } from "../canonical-json";
import {
  PROLOGUE_AREA_ID,
  PROLOGUE_ROUTE_FLAGS,
  PROLOGUE_STREAM_SCENE_ID,
} from "./prologue-arrival-stream";
import { GameSession } from "../session/game-session";
import {
  PrologueForestOpeningSession,
  type PrologueForestOpeningSave,
} from "./prologue-forest-opening";

function fresh(suffix = "default"): PrologueForestOpeningSession {
  return PrologueForestOpeningSession.fresh({
    sessionId: `forest.opening.${suffix}`,
    seed: `forest.opening.${suffix}.seed`,
    currentMp: 13,
    maxMp: 24,
  });
}

function resign<T extends Readonly<Record<string, unknown>>>(value: T): T {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "checksum"));
  return { ...value, checksum: sha256Canonical(body as JsonValue) } as T;
}

function atPosition(
  target: PrologueForestOpeningSession,
  x: number,
  _y: number,
): PrologueForestOpeningSession {
  for (let batch = 0; batch < 100 && target.snapshot().runtime.spatial.player.position.x < x - 200; batch += 1) {
    target.advanceTicks(120, { moveX: 1, jump: batch > 0 && batch % 4 === 0 });
  }
  let furthestX = target.snapshot().runtime.spatial.player.position.x;
  let stagnant = 0;
  for (let batch = 0; batch < 300 && furthestX < x; batch += 1) {
    target.advanceTicks(10, { moveX: 1, jump: stagnant >= 3 });
    const nextX = target.snapshot().runtime.spatial.player.position.x;
    if (nextX > furthestX + 0.25) {
      furthestX = nextX;
      stagnant = 0;
    } else {
      stagnant += 1;
    }
  }
  expect(target.snapshot().runtime.spatial.player.position.x).toBeGreaterThanOrEqual(x);
  return target;
}

function solveStoneSteps(target: PrologueForestOpeningSession): PrologueForestOpeningSession {
  let positioned = atPosition(target, 1_832, 702);
  expect(positioned.interact("stone.a", {
    kind: "push_stone",
    objectId: "stream.stone.a",
    direction: 1,
  }, 0)).toMatchObject({ accepted: true, reason: "partial" });
  expect(positioned.interact("stone.b", {
    kind: "push_stone",
    objectId: "stream.stone.b",
    direction: 1,
  }, 1)).toMatchObject({ accepted: true, reason: "committed" });
  return positioned;
}

describe("PrologueForestOpeningSession", () => {
  it("starts one continuous opening without changing learning, MP, or combat state", () => {
    const target = fresh("fresh");
    const snapshot = target.snapshot();

    expect(snapshot).toMatchObject({
      mode: "forest_opening",
      glyphObserved: false,
      killCount: 0,
      runtime: {
        tick: 0,
        obstacle: { committedSolutionId: null },
        ecology: { rabbit: { mode: "foraging" }, wetlandBird: { mode: "wading" } },
      },
      session: { mp: { currentMp: 13, maxMp: 24 }, learning: { words: {} } },
    });
  });

  it("rejects remote and stale physical interactions without mutating story authority", () => {
    const remote = fresh("remote");
    const before = remote.toSave();
    expect(remote.interact("remote.stone", {
      kind: "push_stone",
      objectId: "stream.stone.a",
      direction: 1,
    }, 0)).toMatchObject({ accepted: false, reason: "out_of_range" });
    expect(remote.toSave()).toEqual(before);

    const nearby = atPosition(fresh("stale"), 1_832, 702);
    const storyBefore = nearby.toSave().session;
    expect(nearby.interact("stale.stone", {
      kind: "push_stone",
      objectId: "stream.stone.a",
      direction: 1,
    }, 9)).toMatchObject({ accepted: false, reason: "stale_revision" });
    expect(nearby.toSave().session).toEqual(storyBefore);
  });

  it.each([
    ["stone_steps", (target: PrologueForestOpeningSession) => solveStoneSteps(target)],
    ["deadwood_bridge", (target: PrologueForestOpeningSession) => {
      const positioned = atPosition(target, 1_918, 688);
      expect(positioned.interact("deadwood", {
        kind: "drag_deadwood",
        objectId: "stream.deadwood",
        direction: 1,
      }, 0)).toMatchObject({ accepted: true, reason: "committed" });
      return positioned;
    }],
    ["shallow_detour", (target: PrologueForestOpeningSession) => {
      const positioned = atPosition(target, 1_792, 704);
      expect(positioned.interact("detour", {
        kind: "enter_shallow_detour",
      }, 0)).toMatchObject({ accepted: true, reason: "committed" });
      return positioned;
    }],
  ] as const)("maps verified %s completion to exactly one existing story route", (solutionId, solve) => {
    const target = solve(fresh(`solution.${solutionId}`));
    const snapshot = target.snapshot();

    expect(snapshot.runtime.obstacle.committedSolutionId).toBe(solutionId);
    expect(snapshot.storyRouteReady).toBe(true);
    expect(snapshot.killCount).toBe(0);
    expect(snapshot.session.learning.words.telo).toBeUndefined();
    expect(snapshot.session.mp.currentMp).toBe(13);
  });

  it("records only a nearby unknown-glyph observation and cannot teach or cast telo", () => {
    const target = atPosition(solveStoneSteps(fresh("glyph")), 2_132, 668);
    const before = target.snapshot().session;

    expect(target.observeGlyph("glyph.observe")).toMatchObject({
      accepted: true,
      duplicate: false,
      reason: "committed",
    });
    expect(target.observeGlyph("glyph.observe.again")).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "duplicate",
    });
    const after = target.snapshot();
    expect(after.glyphObserved).toBe(true);
    expect(after.session.learning).toEqual(before.learning);
    expect(after.session.mp).toEqual(before.mp);
    expect(after.session.receiptIndex["forest-opening:glyph:word.telo"]).toMatchObject({ domain: "world" });
  });

  it("rejects a remote glyph observation byte-for-byte", () => {
    const target = fresh("glyph.remote");
    const before = target.toSave();
    expect(target.observeGlyph("glyph.remote")).toMatchObject({ accepted: false, reason: "out_of_range" });
    expect(target.toSave()).toEqual(before);
  });

  it("resets only spatial task-local state to the durable opening checkpoint", () => {
    const target = fresh("checkpoint.reset");
    const initial = target.snapshot().runtime.spatial.checkpoint;
    target.advanceTicks(120, { moveX: 1 });
    expect(target.snapshot().runtime.spatial.player.position.x).toBeGreaterThan(initial.position.x);

    const reset = target.resetToCheckpoint();

    expect(reset.runtime.spatial.player.position).toEqual(initial.position);
    expect(reset.runtime.spatial.checkpoint).toEqual(initial);
    expect(reset.session.learning.words.telo).toBeUndefined();
  });

  it("enters the settlement perimeter only after physical completion and overlap, then reloads exactly", () => {
    const solved = solveStoneSteps(fresh("entry"));
    const atEntrance = atPosition(solved, 2_500, 690);

    expect(atEntrance.enterSettlementPerimeter("settlement.entry")).toMatchObject({
      accepted: true,
      reason: "committed",
    });
    expect(atEntrance.snapshot()).toMatchObject({
      mode: "settlement_perimeter",
      killCount: 0,
      session: {
        checkpoint: { id: "checkpoint.forest.settlement_perimeter" },
      },
      runtime: {
        spatial: { checkpoint: { id: "checkpoint.forest.settlement_perimeter" } },
      },
    });
    const save = atEntrance.toSave();
    expect(PrologueForestOpeningSession.fromSave(JSON.parse(JSON.stringify(save))).toSave()).toEqual(save);
    const mismatchedRuntime = resign({
      ...save.runtime,
      spatial: {
        ...save.runtime.spatial,
        checkpoint: { ...save.runtime.spatial.checkpoint, id: "checkpoint.initial" },
      },
    });
    expect(() => PrologueForestOpeningSession.fromSave(resign({
      ...save,
      runtime: mismatchedRuntime,
    }))).toThrow(/checkpoint authorities disagree/i);
    expect(atEntrance.enterSettlementPerimeter("settlement.entry.again")).toMatchObject({
      accepted: true,
      duplicate: true,
      reason: "duplicate",
    });
  }, 10_000);

  it("rejects early entry, solution conflicts, and re-signed forged story progress", () => {
    const early = fresh("early");
    expect(early.enterSettlementPerimeter("entry.early")).toMatchObject({
      accepted: false,
      reason: "prerequisite_missing",
    });

    const solved = solveStoneSteps(fresh("conflict"));
    expect(atPosition(solved, 1_918, 688).interact("conflicting.log", {
      kind: "drag_deadwood",
      objectId: "stream.deadwood",
      direction: 1,
    }, 2)).toMatchObject({ accepted: false, reason: "solution_conflict" });

    const clean = fresh("forged").toSave();
    const forgedSession = GameSession.fromSave(clean.session);
    const flagId = `runtime.value:${JSON.stringify([PROLOGUE_STREAM_SCENE_ID, PROLOGUE_ROUTE_FLAGS.looseStonePushed])}`;
    expect(forgedSession.apply({
      eventId: "forged.opening.route",
      sequence: forgedSession.nextSequence(),
      type: "world_flag_set",
      payload: { flagId, value: true, scope: "area", areaId: PROLOGUE_AREA_ID },
    }).applied).toBe(true);
    const forged = resign({ ...clean, session: forgedSession.toSave() } satisfies PrologueForestOpeningSave);
    expect(() => PrologueForestOpeningSession.fromSave(forged)).toThrow(/physical|story|solution/i);
  });
});
