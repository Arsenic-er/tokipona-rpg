import { describe, expect, it } from "vitest";
import { commitSessionProposal } from "../session/adapters";
import { GameSession } from "../session/game-session";
import {
  PROLOGUE_WILDLIFE_DIG_SOLUTION_ID,
  PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID,
  PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID,
  PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID,
  PrologueWildlifeSession,
  createPrologueWildlifeInitialSession,
  type PrologueWildlifeTickInput,
  type PrologueWildlifeWorldFacts,
} from "./prologue-wildlife";

const PROFILE = Object.freeze({ id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55 });
const WORLD: PrologueWildlifeWorldFacts = Object.freeze({
  playerRetreating: false,
  lineOfSight: true,
  localDangerCleared: false,
  returnWorldConditionsSatisfied: false,
});
const input = (
  playerX: number,
  playerY: number,
  foxX = 10,
  foxY = 1,
  world: PrologueWildlifeWorldFacts = WORLD,
): PrologueWildlifeTickInput => ({
  playerPositionTiles: { x: playerX, y: playerY },
  foxPositionTiles: { x: foxX, y: foxY },
  playerProfile: PROFILE,
  world,
});

const createWildlife = (id: string): PrologueWildlifeSession =>
  new PrologueWildlifeSession(createPrologueWildlifeInitialSession({ sessionId: id }));

function sceneSession(id: string, sceneId: string, serviceReached = false): GameSession {
  let session = GameSession.create({
    sessionId: id,
    mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: sceneId,
    checkpoint: { id: `checkpoint.${id}`, sceneId, position: { x: 0, y: 0 }, revision: 0 },
  });
  if (serviceReached) {
    const commit = commitSessionProposal(session, { transactionId: `setup.${id}`, drafts: [{
      eventId: `setup.${id}.service`, type: "world_flag_set",
      payload: { flagId: "maintenance_access_open", value: true, scope: "region", regionId: "valley_prologue" },
    }] });
    if (!commit.committed) throw new Error("test setup failed");
    session = commit.session;
  }
  return session;
}

function observeWarning(game: PrologueWildlifeSession): void {
  game.advanceTicks(1, input(9, 1));
  game.advanceTicks(1, input(9, 1));
  game.advanceTicks(42, input(9, 1));
  expect(game.snapshot().visitEvidence.warningObservedWithoutHarm).toBe(true);
}

function fleeByRetreat(game: PrologueWildlifeSession): void {
  game.advanceTicks(1, input(2, 1, 10, 1, { ...WORLD, playerRetreating: true }));
  expect(game.snapshot().fox.behaviorState).toBe("flee");
}

function reachRealExitContinuously(game: PrologueWildlifeSession): void {
  game.advanceTicks(56, input(2, 1, 24, 1));
  expect(game.snapshot().visitEvidence.realExitReached).toBe(true);
}

function openLatchAndClearLane(game: PrologueWildlifeSession): void {
  game.advanceTicks(1, input(25, 1, 24, 1));
  expect(game.openOldServiceLatch("latch.open")).toMatchObject({ accepted: true, reason: "committed" });
  game.advanceTicks(1, input(2, 1, 24, 1));
  expect(game.snapshot().visitEvidence).toMatchObject({ currentOutsideWarningZone: true, currentEscapeLaneOpen: true, oldLatchOpened: true });
}

function prepareWaitRoute(game: PrologueWildlifeSession): void {
  observeWarning(game);
  fleeByRetreat(game);
  reachRealExitContinuously(game);
  openLatchAndClearLane(game);
}

describe("N06 prologue wildlife coordinator", () => {
  it("uses only the generated fox binding and exposes no caller escape/home authority", () => {
    const game = createWildlife("binding");
    expect(game.snapshot()).not.toHaveProperty("rabbit");
    expect(game.snapshot().fox.entityId).toBe("wildlife.fox.den");
    const publicFacts = { playerRetreating: false, lineOfSight: true, localDangerCleared: false, returnWorldConditionsSatisfied: false } satisfies PrologueWildlifeWorldFacts;
    expect(Object.keys(publicFacts)).not.toContain("escapePathReachable");
    expect(Object.keys(publicFacts)).not.toContain("foxAtHomeAnchor");
  });

  it("keeps 1000 ticks entirely transient and the sole GameSession save byte-stable", () => {
    const game = createWildlife("bounded");
    const beforeEvents = game.session.events().length;
    const beforeSave = JSON.stringify(game.toSave());
    game.advanceTicks(1000, input(2, 1));
    expect(game.session.events()).toHaveLength(beforeEvents);
    expect(JSON.stringify(game.toSave())).toBe(beforeSave);
    expect(game.snapshot().behaviorPersistence).toEqual({ scope: "transient_compact", gameSessionTickEvents: 0 });
  });

  it("rejects out-of-scene positions and teleport-to-exit evidence", () => {
    const game = createWildlife("bounds");
    expect(() => game.advanceTicks(1, input(-1, 1))).toThrow(/playerPositionTiles/);
    expect(() => game.advanceTicks(1, input(2, 1, 28, 1))).toThrow(/foxPositionTiles/);
    expect(() => game.advanceTicks(1, input(2, 1, 24, 1))).toThrow(/frame delta/);
    expect(game.snapshot().visitEvidence.realExitReached).toBe(false);
  });

  it("requires flee/return before continuous arrival at the generated real exit", () => {
    const game = createWildlife("exit.gate");
    observeWarning(game);
    game.advanceTicks(56, input(2, 1, 24, 1));
    expect(game.snapshot().visitEvidence.realExitReached).toBe(false);
    const fresh = createWildlife("exit.valid");
    prepareWaitRoute(fresh);
    expect(fresh.snapshot().visitEvidence.realExitReached).toBe(true);
  });

  it("enters from N04/N05, checkpoints each entrance, and adopts only the latest canonical N06 entry", () => {
    const service = PrologueWildlifeSession.enterFromService(sceneSession("entry.service", "scene.valley.waterwheel", true), "enter.service");
    expect(service).toMatchObject({ accepted: true, source: "service" });
    expect(service.wildlife!.session.snapshot().checkpoint.position).toEqual({ x: 32, y: 418 });
    expect(PrologueWildlifeSession.adopt(service.wildlife!.session, "adopt.service")).toMatchObject({ accepted: true, source: "service" });

    const cisternSource = sceneSession("entry.cistern", "scene.valley.high_cistern");
    const opened = commitSessionProposal(cisternSource, { transactionId: "setup.cistern.route", drafts: [{ eventId: "setup.cistern.route", type: "world_flag_set", payload: { flagId: "den_route_open", value: true, scope: "region", regionId: "valley_prologue" } }] });
    if (!opened.committed) throw new Error("cistern setup failed");
    const cistern = PrologueWildlifeSession.enterFromCistern(opened.session, "enter.cistern");
    expect(cistern).toMatchObject({ accepted: true, source: "cistern" });
    expect(cistern.wildlife!.session.snapshot().checkpoint.position).toEqual({ x: 400, y: 418 });

    const forged = commitSessionProposal(service.wildlife!.session, { transactionId: "forged.latest", drafts: [{ eventId: "forged.latest", type: "scene_entered", payload: { sceneId: "scene.valley.den_bypass" } }] });
    expect(forged.committed).toBe(true);
    expect(PrologueWildlifeSession.adopt(forged.session, "adopt.forged")).toMatchObject({ accepted: false, reason: "wrong_source_scene" });
  });

  it("keeps service/cistern entry guarded and entry transaction reuse conflict-safe", () => {
    expect(PrologueWildlifeSession.enterFromCistern(sceneSession("blocked.cistern", "scene.valley.high_cistern"), "entry.cistern.blocked")).toMatchObject({ accepted: false, reason: "entry_guard_failed" });
    expect(PrologueWildlifeSession.enterFromService(sceneSession("blocked", "scene.valley.waterwheel"), "entry")).toMatchObject({ accepted: false, reason: "entry_guard_failed" });
    const first = PrologueWildlifeSession.enterFromService(sceneSession("entry.receipt", "scene.valley.waterwheel", true), "same");
    expect(PrologueWildlifeSession.enterFromService(first.wildlife!.session, "same")).toMatchObject({ accepted: true, duplicate: true });
    expect(PrologueWildlifeSession.enterFromCistern(first.wildlife!.session, "same")).toMatchObject({ accepted: false, reason: "transaction_conflict" });
  });

  it("completes wait route only with no player harm, current outside state, real exit, den and latch evidence", () => {
    const game = createWildlife("route.wait");
    prepareWaitRoute(game);
    expect(game.completeWaitAndObserve("route.wait")).toMatchObject({ accepted: true, snapshot: { routeSolutionId: PROLOGUE_WILDLIFE_WAIT_SOLUTION_ID } });

    const inside = createWildlife("route.inside"); prepareWaitRoute(inside);
    inside.advanceTicks(1, input(9, 1, 24, 1));
    expect(inside.completeWaitAndObserve("route.inside")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });

    const harmed = createWildlife("route.harmed");
    harmed.advanceTicks(1, input(9, 1, 10, 1, { ...WORLD, majorHarmOccurred: true }));
    harmed.advanceTicks(1, input(9, 1, 10, 1, { ...WORLD, majorHarmOccurred: true }));
    harmed.advanceTicks(42, input(9, 1, 10, 1, { ...WORLD, majorHarmOccurred: true }));
    expect(harmed.snapshot().visitEvidence).toMatchObject({ playerHarmOccurred: true, warningObservedWithoutHarm: false });
  });

  it("uses generated noise point/fear with zero push and rejects remote noise", () => {
    const remote = createWildlife("noise.remote");
    remote.advanceTicks(1, input(2, 1));
    expect(remote.makeLowForceNoise("noise.remote")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing", effect: null });

    const game = createWildlife("route.noise"); observeWarning(game);
    game.advanceTicks(1, input(4, 1));
    const noise = game.makeLowForceNoise("noise.one");
    expect(noise.effect).toMatchObject({ damage: 0, fearAdded: 20, pushImpulseNs: 0 });
    game.makeLowForceNoise("noise.two"); game.makeLowForceNoise("noise.three");
    expect(game.snapshot().fox.fear).toBe(60);
    game.advanceTicks(1, input(4, 1));
    reachRealExitContinuously(game); openLatchAndClearLane(game);
    expect(game.completeLowForceNoise("route.noise")).toMatchObject({ accepted: true, snapshot: { routeSolutionId: PROLOGUE_WILDLIFE_NOISE_SOLUTION_ID } });
  });

  it("requires generated staff marker, open lane and retreat before the zero-hit staff action", () => {
    const game = createWildlife("route.staff"); observeWarning(game);
    game.advanceTicks(1, input(2, 1, 10, 1, { ...WORLD, playerRetreating: true }));
    expect(game.useWoodStaff("staff.remote")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });

    const valid = createWildlife("route.staff.valid"); observeWarning(valid);
    valid.advanceTicks(1, input(7, 1, 10, 1, { ...WORLD, playerRetreating: true }));
    expect(valid.useWoodStaff("staff.valid").effect).toMatchObject({ damage: 0, fearAdded: 15, pushImpulseNs: 2 });
    reachRealExitContinuously(valid); openLatchAndClearLane(valid);
    expect(valid.completeLowForceStaff("route.staff")).toMatchObject({ accepted: true, snapshot: { routeSolutionId: PROLOGUE_WILDLIFE_STAFF_SOLUTION_ID } });
  });

  it("requires generated-position three-step dig interactions and keeps completion receipts stable", () => {
    const remote = createWildlife("dig.remote");
    expect(remote.completeDigUpperBypass("dig.remote")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });
    expect(remote.inspectAndMarkUpperLine("mark.remote")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });

    const game = createWildlife("route.dig");
    game.advanceTicks(40, input(12, 6, 20, 1));
    expect(game.inspectAndMarkUpperLine("mark")).toMatchObject({ accepted: true, snapshot: { digProgress: { upperLineMarked: true } } });
    expect(game.digUpperBypass("dig.work")).toMatchObject({ accepted: true, snapshot: { digProgress: { upperBypassClear: true } } });
    expect(game.installUpperBypassBraces("brace")).toMatchObject({ accepted: true, snapshot: { digProgress: { bracesInstalled: true } } });
    expect(game.completeDigUpperBypass("dig.complete")).toMatchObject({ accepted: true, snapshot: { routeSolutionId: PROLOGUE_WILDLIFE_DIG_SOLUTION_ID } });
    expect(game.completeDigUpperBypass("dig.complete")).toMatchObject({ accepted: true, duplicate: true });
    const events = game.session.events().length;
    expect(game.completeDigUpperBypass("dig.already")).toMatchObject({ accepted: true, duplicate: true });
    expect(game.session.events().length).toBe(events + 1);
  });

  it("requires generated latch proximity", () => {
    const game = createWildlife("latch");
    game.advanceTicks(1, input(2, 1));
    expect(game.openOldServiceLatch("latch.remote")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });
    game.advanceTicks(60, input(25, 1));
    expect(game.openOldServiceLatch("latch.local")).toMatchObject({ accepted: true, reason: "committed" });
  });

  it("persists only committed route state through GameSession save/load", () => {
    const game = createWildlife("save");
    game.advanceTicks(40, input(12, 6, 20, 1));
    expect(game.inspectAndMarkUpperLine("mark").accepted).toBe(true);
    expect(game.digUpperBypass("dig.work").accepted).toBe(true);
    expect(game.installUpperBypassBraces("brace").accepted).toBe(true);
    expect(game.completeDigUpperBypass("dig").accepted).toBe(true);
    const loaded = PrologueWildlifeSession.fromSave(game.toSave());
    expect(loaded.snapshot()).toMatchObject({ denRouteOpen: true, routeSolutionId: PROLOGUE_WILDLIFE_DIG_SOLUTION_ID, rewards: ZERO_REWARD });
  });

  it("keeps service handoff open, gates cistern, and returns structured wrong-scene recovery", () => {
    const game = createWildlife("handoff");
    expect(game.handoffToHighCistern("cistern.blocked")).toMatchObject({ accepted: false, reason: "route_prerequisite_missing" });
    expect(game.returnToService("service")).toMatchObject({ accepted: true, ready: true, targetEntranceId: "waterwheel.from_settlement" });
    expect(game.recoverSoftLock("wrong.scene")).toMatchObject({ accepted: false, reason: "wrong_scene" });
    expect(game.resetToCheckpoint("wrong.scene.reset")).toMatchObject({ accepted: false, reason: "wrong_scene" });
  });

  it("resets by area epoch, remains bounded afterward, and recovers within 60 seconds", () => {
    const game = createWildlife("reset"); game.advanceTicks(1000, input(2, 1));
    expect(game.resetToCheckpoint("reset")).toMatchObject({ accepted: true, snapshot: { visitEvidence: { visitId: "scene.valley.den_bypass@1" } } });
    const count = game.session.events().length; game.advanceTicks(1000, input(2, 1)); expect(game.session.events()).toHaveLength(count);
    expect(game.recoverSoftLock("recover")).toMatchObject({ accepted: true, snapshot: { softLockRecovery: { maximumSeconds: 60 } } });
  });

  it("keeps damage/destruction feature-disabled with literally zero GameSession mutation and zero rewards", () => {
    const game = createWildlife("disabled"); const before = game.toSave();
    expect(game.applyDamage("damage", "fox", 999)).toMatchObject({ accepted: false, reason: "feature_disabled", damageApplied: 0, deathCreated: false });
    expect(game.attemptDestroyDen("destroy")).toMatchObject({ accepted: false, reason: "feature_disabled" });
    expect(game.toSave()).toEqual(before);
    expect(game.snapshot().rewards).toEqual(ZERO_REWARD);
  });
});

const ZERO_REWARD = { kills: 0, drops: 0, learning: 0, mp: 0, capacity: 0, coin: 0, keyItems: 0 };
