import { describe, expect, it } from "vitest";
import {
  WILDLIFE_SELF_DEFENSE_TICKS,
  WildlifeStateMachine,
  createStableWildlifeLifeId,
  type PlayerPhysicalProfile,
  type WildlifeTickInput,
} from "./wildlife-state-machine";

const HUMAN: PlayerPhysicalProfile = Object.freeze({
  id: "human", massKg: 70, buoyancyCoefficient: 1, heatToleranceC: 55,
});
const SLIME: PlayerPhysicalProfile = Object.freeze({
  id: "slime", massKg: 8, buoyancyCoefficient: 1.8, heatToleranceC: 30,
});
const ELF: PlayerPhysicalProfile = Object.freeze({
  id: "elf", massKg: 180, buoyancyCoefficient: 0.55, heatToleranceC: 120,
});

const baseInput = (profile: PlayerPhysicalProfile = HUMAN): WildlifeTickInput => ({
  playerWithinPerception: false,
  playerInsideWarningZone: false,
  playerBlocksEscape: false,
  wildlifeCornered: false,
  playerRetreating: false,
  lineOfSight: true,
  localDangerCleared: false,
  returnWorldConditionsSatisfied: false,
  realEscapeExitReachable: true,
  reachedRealEscapeExit: false,
  defensiveContact: false,
  atHomeAnchor: false,
  playerProfile: profile,
});

const createFox = () => new WildlifeStateMachine("fox", {
  regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4,
});

const createRabbit = () => new WildlifeStateMachine("rabbit", {
  regionSaveId: "save.valley.1", spawnGeneration: 2, spawnSequence: 9,
});

function enterWarn(machine: WildlifeStateMachine, profile = HUMAN, majorHarmOccurred = false): void {
  machine.advance({ ...baseInput(profile), playerWithinPerception: true, majorHarmOccurred });
  machine.advance({
    ...baseInput(profile),
    playerWithinPerception: true,
    playerInsideWarningZone: true,
    majorHarmOccurred,
  });
  expect(machine.snapshot().behaviorState).toBe("warn");
}

describe("deterministic generated-ecology wildlife FSM", () => {
  it("derives stable life IDs without RNG", () => {
    const seed = {
      regionSaveId: "valley save/一", entityId: "wildlife.fox.den", spawnGeneration: 3, spawnSequence: 7,
    };
    expect(createStableWildlifeLifeId(seed)).toBe(createStableWildlifeLifeId(seed));
    expect(createStableWildlifeLifeId(seed)).toMatch(/^wildlife-life:sha256:[0-9a-f]{64}$/);
    expect(createFox().snapshot().lifeId).toBe(createFox().snapshot().lifeId);
  });

  it("holds an immediately harmed fox in visible warning for tick 41 and defends on tick 42", () => {
    const fox = createFox();
    enterWarn(fox, HUMAN, true);
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 41)).toMatchObject({
      behaviorState: "warn", warningTicks: 41, defensiveWindowsStarted: 0,
    });
    const defended = fox.advance({ ...baseInput(), playerInsideWarningZone: true });
    expect(defended).toMatchObject({
      behaviorState: "self_defense", warningTicks: 42, defensiveWindowsStarted: 1,
    });
    expect(defended.lastDefenseEvent).toBeNull();
    expect(fox.advance({ ...baseInput(), defensiveContact: true }).lastDefenseEvent).toMatchObject({ damage: 6, durationTicksMaximum: 30 });
  });

  it("uses the authored 90-tick intrusion threshold when there is no major-harm exception", () => {
    const fox = createFox();
    enterWarn(fox);
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true }, 89)).toMatchObject({
      behaviorState: "warn", intrusionTicks: 89, defensiveWindowsStarted: 0,
    });
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true })).toMatchObject({
      behaviorState: "self_defense", intrusionTicks: 90, defensiveWindowsStarted: 1,
    });
  });

  it("allows one defense window of at most 30 ticks before fleeing toward the real exit", () => {
    const fox = createFox();
    enterWarn(fox);
    fox.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true }, 90);
    expect(fox.advance(baseInput(), WILDLIFE_SELF_DEFENSE_TICKS - 1)).toMatchObject({
      behaviorState: "self_defense", selfDefenseTicks: 29, defensiveWindowsStarted: 1,
    });
    expect(fox.advance({ ...baseInput(), realEscapeExitReachable: true })).toMatchObject({
      behaviorState: "flee",
      selfDefenseTicks: 30,
      defensiveWindowsStarted: 1,
      targetRealEscapeExit: "den.fox.back_exit",
    });
    expect(fox.advance(baseInput(), 100).defensiveWindowsStarted).toBe(1);
  });

  it("does not attack for ordinary intrusion alone, even after 90 ticks", () => {
    const fox = createFox();
    enterWarn(fox);
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 120)).toMatchObject({
      behaviorState: "warn", defensiveWindowsStarted: 0, defenseEvents: [],
    });
  });

  it("requires the real escape exit before fear can enter flee", () => {
    const fox = createFox();
    enterWarn(fox);
    fox.applyWoodStaffFear("staff.1");
    fox.applyWoodStaffFear("staff.2");
    fox.applyWoodStaffFear("staff.3");
    fox.applyWoodStaffFear("staff.4");
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true, realEscapeExitReachable: false }).behaviorState).toBe("warn");
  });

  it("ends defense at tick 30 without repeating it when the real exit is unavailable", () => {
    const fox = createFox();
    enterWarn(fox, HUMAN, true);
    fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
    expect(fox.advance({ ...baseInput(), realEscapeExitReachable: false }, 30)).toMatchObject({
      behaviorState: "warn", defensiveWindowsStarted: 1,
    });
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true }, 180)).toMatchObject({
      behaviorState: "warn", defensiveWindowsStarted: 1,
    });
  });

  it("never returns before reaching the authored real exit, then returns and calms at home", () => {
    const fox = createFox();
    enterWarn(fox);
    fox.applyWoodStaffFear("staff.5");
    fox.applyWoodStaffFear("staff.6");
    fox.applyWoodStaffFear("staff.7");
    fox.applyWoodStaffFear("staff.8");
    fox.advance({ ...baseInput(), playerInsideWarningZone: true });
    expect(fox.snapshot().behaviorState).toBe("flee");

    const returnReady = {
      ...baseInput(),
      lineOfSight: false,
      localDangerCleared: true,
      returnWorldConditionsSatisfied: true,
    };
    expect(fox.advance(returnReady, 300)).toMatchObject({ behaviorState: "flee", returnEligible: false });
    expect(fox.advance({ ...returnReady, reachedRealEscapeExit: true }).behaviorState).toBe("return");
    expect(fox.advance({ ...returnReady, atHomeAnchor: true })).toMatchObject({
      behaviorState: "calm", fear: 0, reachedRealEscapeExit: false,
    });
  });

  it("does not return a tombstoned life instance", () => {
    const fox = createFox();
    enterWarn(fox);
    fox.applyWoodStaffFear("staff.9");
    fox.applyWoodStaffFear("staff.10");
    fox.applyWoodStaffFear("staff.11");
    fox.applyWoodStaffFear("staff.12");
    fox.advance({ ...baseInput(), playerInsideWarningZone: true });
    const frozen = fox.advance({
      ...baseInput(), lineOfSight: false, localDangerCleared: true,
      returnWorldConditionsSatisfied: true, reachedRealEscapeExit: true, deathTombstone: true,
    }, 500);
    expect(frozen).toMatchObject({ lifeState: "tombstoned", behaviorState: "flee", returnEligible: false });
  });

  it("keeps wood-staff fear and low-force pushes nonlethal and capped", () => {
    const fox = createFox();
    expect(fox.applyWoodStaffFear("staff.13")).toEqual({ accepted: true, duplicate: false, reason: "applied", damage: 0, fearAdded: 15, pushImpulseNs: 2 });
    expect(fox.applyLowForcePush("push.1", 999)).toEqual({ accepted: true, duplicate: false, reason: "applied", damage: 0, fearAdded: 20, pushImpulseNs: 6 });
    expect(fox.snapshot()).toMatchObject({ fear: 35, rewardDelta: { kills: 0, drops: 0, languageXp: 0, maxMpGrowth: 0 } });
  });

  it("keeps damage, warning, guards and rewards identical across human/slime/elf extremes", () => {
    const results = [HUMAN, SLIME, ELF].map((profile) => {
      const fox = createFox();
      enterWarn(fox, profile, true);
      fox.advance({ ...baseInput(profile), playerInsideWarningZone: true }, 42);
      return fox.advance({ ...baseInput(profile), defensiveContact: true });
    });
    expect(results.map((result) => result.behaviorState)).toEqual(["self_defense", "self_defense", "self_defense"]);
    expect(results.map((result) => result.warningTicks)).toEqual([42, 42, 42]);
    expect(results.map((result) => result.lastDefenseEvent?.damage)).toEqual([6, 6, 6]);
    expect(results.map((result) => result.rewardDelta)).toEqual([results[0]!.rewardDelta, results[0]!.rewardDelta, results[0]!.rewardDelta]);
    const physical = results.map((result) => result.lastDefenseEvent!.physicalResponse);
    expect(new Set(physical.map((result) => result.impulseNs)).size).toBe(3);
    expect(physical.map((result) => result.environmentFeedback.buoyancyBand)).toEqual(["neutral", "floats", "sinks"]);
    expect(physical.map((result) => result.environmentFeedback.heatToleranceBand)).toEqual(["ordinary", "low", "high"]);
  });

  it("uses rabbit damage from the same verified generated projection", () => {
    const rabbit = createRabbit();
    enterWarn(rabbit, HUMAN, true);
    rabbit.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
    const result = rabbit.advance({ ...baseInput(), defensiveContact: true });
    expect(result).toMatchObject({ entityId: "wildlife.rabbit.valley", targetRealEscapeExit: "wet_meadow.rabbit_burrow_exit" });
    expect(result.lastDefenseEvent?.damage).toBe(2);
  });

  it("makes low-FPS batch advance exactly equivalent to 60 Hz single ticks", () => {
    const batch = createFox();
    const single = createFox();
    enterWarn(batch);
    enterWarn(single);
    const input = { ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true };
    const batchResult = batch.advance(input, 90);
    for (let tick = 0; tick < 90; tick += 1) single.advance(input);
    expect(single.snapshot()).toEqual(batchResult);
  });

  it("keeps defense event IDs unique across encounters and observable after batched ticks", () => {
    const fox = createFox();
    enterWarn(fox, HUMAN, true);
    fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
    const first = fox.advance({ ...baseInput(), defensiveContact: true });
    const firstId = first.lastDefenseEvent!.eventId;
    expect(first.defenseEvents.map((event) => event.eventId)).toEqual([firstId]);
    fox.advance(baseInput(), 30);
    const returnReady = { ...baseInput(), lineOfSight: false, localDangerCleared: true, returnWorldConditionsSatisfied: true, reachedRealEscapeExit: true };
    fox.advance(returnReady, 240);
    fox.advance({ ...returnReady, atHomeAnchor: true });

    enterWarn(fox, HUMAN, true);
    const second = fox.advance({ ...baseInput(), playerInsideWarningZone: true, defensiveContact: true }, 43);
    expect(second.lastDefenseEvent).not.toBeNull();
    expect(second.lastDefenseEvent!.eventId).not.toBe(firstId);
    expect(second.defenseEvents.map((event) => event.eventId)).toEqual([firstId, second.lastDefenseEvent!.eventId]);
    expect(second.defensiveWindowsStarted).toBe(2);
  });

  it("never exposes a living animal as a body-platform route predicate", () => {
    const fox = createFox();
    expect(fox.snapshot().canBeUsedAsBodyPlatform).toBe(false);
    enterWarn(fox);
    expect(fox.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true }, 90).canBeUsedAsBodyPlatform).toBe(false);
  });

  it("deduplicates nonlethal action IDs and rejects conflicting reuse", () => {
    const fox = createFox();
    expect(fox.applyWoodStaffFear("action.1")).toMatchObject({ accepted: true, duplicate: false, fearAdded: 15 });
    expect(fox.applyWoodStaffFear("action.1")).toEqual({ accepted: true, duplicate: true, reason: "duplicate", damage: 0, fearAdded: 0, pushImpulseNs: 0 });
    expect(fox.applyLowForcePush("action.1", 2)).toMatchObject({ accepted: false, reason: "conflict", damage: 0 });
    expect(fox.snapshot().fear).toBe(15);
  });

  it("applies species-specific defense guards", () => {
    const rabbit = createRabbit();
    enterWarn(rabbit);
    expect(rabbit.advance({ ...baseInput(), playerInsideWarningZone: true, playerBlocksEscape: true }, 120)).toMatchObject({ behaviorState: "warn", defensiveWindowsStarted: 0 });
    expect(rabbit.advance({ ...baseInput(), playerInsideWarningZone: true, wildlifeCornered: true })).toMatchObject({ behaviorState: "self_defense", defensiveWindowsStarted: 1 });
  });

  it("deescalates warn only after the generated quiet interval", () => {
    const fox = createFox();
    enterWarn(fox);
    const quiet = { ...baseInput(), lineOfSight: false };
    expect(fox.advance(quiet, 359).behaviorState).toBe("warn");
    expect(fox.advance(quiet).behaviorState).toBe("observe");
  });

  it("round-trips compact checkpoints and fails closed on corrupt state", () => {
    const fox = createFox();
    enterWarn(fox);
    fox.applyWoodStaffFear("saved.action");
    fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 10);
    const checkpoint = fox.checkpoint();
    const restored = new WildlifeStateMachine("fox", { regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4 }, undefined, checkpoint);
    expect(restored.snapshot()).toEqual(fox.snapshot());
    const corrupt = { ...checkpoint, fear: -1 };
    expect(() => new WildlifeStateMachine("fox", { regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4 }, undefined, corrupt)).toThrow(/checkpoint/);
  });

  it("preserves a pending staff stimulus across an immediate checkpoint", () => {
    const source = createFox();
    source.applyWoodStaffFear("pending.staff");
    const restored = new WildlifeStateMachine("fox", { regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4 }, undefined, source.checkpoint());
    const input = { ...baseInput(), playerWithinPerception: false };
    expect(restored.advance(input)).toEqual(source.advance(input));
    expect(restored.snapshot().behaviorState).toBe("observe");
  });

  it("preserves defense history and exactly-once contact across checkpoint", () => {
    const source = createFox();
    enterWarn(source, HUMAN, true);
    source.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
    source.advance({ ...baseInput(), defensiveContact: true });
    const restored = new WildlifeStateMachine("fox", { regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4 }, undefined, source.checkpoint());
    expect(restored.snapshot()).toEqual(source.snapshot());
    expect(restored.advance({ ...baseInput(), defensiveContact: true }).defenseEvents).toHaveLength(1);
  });

  it("preserves return-boundary state across checkpoint", () => {
    const source = createFox();
    enterWarn(source);
    for (let index = 0; index < 4; index += 1) source.applyWoodStaffFear(`return.staff.${index}`);
    source.advance({ ...baseInput(), playerInsideWarningZone: true });
    const ready = { ...baseInput(), lineOfSight: false, localDangerCleared: true, returnWorldConditionsSatisfied: true, reachedRealEscapeExit: true };
    source.advance(ready, 240);
    expect(source.snapshot().behaviorState).toBe("return");
    const restored = new WildlifeStateMachine("fox", { regionSaveId: "save.valley.1", spawnGeneration: 0, spawnSequence: 4 }, undefined, source.checkpoint());
    expect(restored.snapshot()).toEqual(source.snapshot());
    expect(restored.advance({ ...ready, atHomeAnchor: true })).toEqual(source.advance({ ...ready, atHomeAnchor: true }));
  });

  it("fails closed before interpreting tampered generated ecology", () => {
    const bad = structuredClone({ ecology: createFox().ecology }) as unknown as { ecology: { minimumWarningTelegraphSeconds: number } };
    bad.ecology.minimumWarningTelegraphSeconds = 0.6;
    expect(() => new WildlifeStateMachine("fox", { regionSaveId: "save", spawnGeneration: 0, spawnSequence: 0 }, bad)).toThrow(/digest mismatch/);
  });
});
