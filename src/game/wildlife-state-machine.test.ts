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
    expect(createStableWildlifeLifeId(seed)).toBe(
      "wildlife-life:valley%20save%2F%E4%B8%80:wildlife.fox.den:3:7",
    );
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
    expect(defended.lastDefenseEvent).toMatchObject({ damage: 6, durationTicksMaximum: 30 });
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
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
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
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
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
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.applyWoodStaffFear();
    fox.advance({ ...baseInput(), playerInsideWarningZone: true });
    const frozen = fox.advance({
      ...baseInput(), lineOfSight: false, localDangerCleared: true,
      returnWorldConditionsSatisfied: true, reachedRealEscapeExit: true, deathTombstone: true,
    }, 500);
    expect(frozen).toMatchObject({ lifeState: "tombstoned", behaviorState: "flee", returnEligible: false });
  });

  it("keeps wood-staff fear and low-force pushes nonlethal and capped", () => {
    const fox = createFox();
    expect(fox.applyWoodStaffFear()).toEqual({ accepted: true, damage: 0, fearAdded: 15, pushImpulseNs: 2 });
    expect(fox.applyLowForcePush(999)).toEqual({ accepted: true, damage: 0, fearAdded: 20, pushImpulseNs: 6 });
    expect(fox.snapshot()).toMatchObject({ fear: 35, rewardDelta: { kills: 0, drops: 0, languageXp: 0, maxMpGrowth: 0 } });
  });

  it("keeps damage, warning, guards and rewards identical across human/slime/elf extremes", () => {
    const results = [HUMAN, SLIME, ELF].map((profile) => {
      const fox = createFox();
      enterWarn(fox, profile, true);
      return fox.advance({ ...baseInput(profile), playerInsideWarningZone: true }, 42);
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
    const result = rabbit.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
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
    const first = fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 42);
    const firstId = first.lastDefenseEvent!.eventId;
    expect(first.defenseEvents.map((event) => event.eventId)).toEqual([firstId]);
    fox.advance(baseInput(), 30);
    const returnReady = { ...baseInput(), lineOfSight: false, localDangerCleared: true, returnWorldConditionsSatisfied: true, reachedRealEscapeExit: true };
    fox.advance(returnReady, 240);
    fox.advance({ ...returnReady, atHomeAnchor: true });

    enterWarn(fox, HUMAN, true);
    const second = fox.advance({ ...baseInput(), playerInsideWarningZone: true }, 120);
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

  it("fails closed when generated ecology safety values are tampered", () => {
    const bad = structuredClone({
      ...({} as object),
      ecology: {
        sourceDigest: `sha256:${"a".repeat(64)}`,
        ecologyId: "valley_prologue",
        minimumWarningTelegraphSeconds: 0.6,
        intrusionBeforeDefenseSeconds: 1.5,
        loseSightSeconds: 4,
        deescalateSeconds: 6,
        mandatoryKills: 0,
        requiredQuestDrops: 0,
        languageEvidenceFromHarmForbidden: true,
        species: {},
      },
    });
    expect(() => new WildlifeStateMachine("fox", {
      regionSaveId: "save", spawnGeneration: 0, spawnSequence: 0,
    }, bad)).toThrow(/at least 0.7/);
  });
});

