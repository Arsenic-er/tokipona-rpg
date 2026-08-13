import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import {
  readRuntimeEcologyManifest,
  type RuntimeEcologyManifest,
  type RuntimeWildlifeSpeciesManifest,
} from "../content/runtime-ecology-manifest";

export const WILDLIFE_TICKS_PER_SECOND = 60 as const;
export const WILDLIFE_SELF_DEFENSE_TICKS = 30 as const;
export const WILDLIFE_FLEE_FEAR_THRESHOLD = 60 as const;

export type WildlifeSpecies = "rabbit" | "fox";
export type WildlifeBehaviorState = "calm" | "observe" | "warn" | "self_defense" | "flee" | "return";
export type WildlifeLifeState = "alive" | "tombstoned";

export interface WildlifeLifeIdentitySeed {
  readonly regionSaveId: string;
  readonly entityId: string;
  readonly spawnGeneration: number;
  readonly spawnSequence: number;
}

export interface PlayerPhysicalProfile {
  readonly id: string;
  readonly massKg: number;
  readonly buoyancyCoefficient: number;
  readonly heatToleranceC: number;
}

export interface WildlifeTickInput {
  readonly playerWithinPerception: boolean;
  readonly playerInsideWarningZone: boolean;
  readonly playerBlocksEscape: boolean;
  readonly wildlifeCornered: boolean;
  readonly playerRetreating: boolean;
  readonly lineOfSight: boolean;
  readonly localDangerCleared: boolean;
  /** Result of the authoritative world-state return predicate; the FSM never parses its raw string. */
  readonly returnWorldConditionsSatisfied: boolean;
  readonly realEscapeExitReachable: boolean;
  readonly reachedRealEscapeExit: boolean;
  readonly atHomeAnchor: boolean;
  readonly majorHarmOccurred?: boolean;
  readonly youngThreatened?: boolean;
  readonly deathTombstone?: boolean;
  readonly playerProfile: PlayerPhysicalProfile;
}

export interface WildlifePhysicalResponse {
  readonly impulseNs: number;
  readonly knockbackVelocityTilesPerSecond: number;
  readonly environmentFeedback: Readonly<{
    buoyancyBand: "sinks" | "neutral" | "floats";
    heatToleranceBand: "low" | "ordinary" | "high";
  }>;
}

export interface WildlifeDefenseEvent {
  readonly eventId: string;
  readonly lifeId: string;
  readonly species: WildlifeSpecies;
  readonly damage: number;
  readonly durationTicksMaximum: typeof WILDLIFE_SELF_DEFENSE_TICKS;
  readonly physicalResponse: WildlifePhysicalResponse;
}

export interface NonlethalWildlifeActionResult {
  readonly accepted: boolean;
  readonly damage: 0;
  readonly fearAdded: number;
  readonly pushImpulseNs: number;
}

export interface WildlifeRewardDelta {
  readonly kills: 0;
  readonly drops: 0;
  readonly languageXp: 0;
  readonly learningEvidence: 0;
  readonly expressionCapacityGrowth: 0;
  readonly focusSlotGrowth: 0;
  readonly maxMpGrowth: 0;
  readonly currency: 0;
}

export interface WildlifeStateMachineSnapshot {
  readonly lifeId: string;
  readonly entityId: string;
  readonly species: WildlifeSpecies;
  readonly lifeState: WildlifeLifeState;
  readonly behaviorState: WildlifeBehaviorState;
  readonly tick: number;
  readonly stateTicks: number;
  readonly warningTicks: number;
  readonly intrusionTicks: number;
  readonly selfDefenseTicks: number;
  readonly defensiveWindowsStarted: number;
  readonly fear: number;
  readonly targetRealEscapeExit: string;
  readonly reachedRealEscapeExit: boolean;
  readonly lineOfSightLostTicks: number;
  readonly returnEligible: boolean;
  readonly canBeUsedAsBodyPlatform: false;
  readonly rewardDelta: WildlifeRewardDelta;
  readonly lastDefenseEvent: WildlifeDefenseEvent | null;
  readonly defenseEvents: readonly WildlifeDefenseEvent[];
}

const ZERO_REWARD: WildlifeRewardDelta = Object.freeze({
  kills: 0,
  drops: 0,
  languageXp: 0,
  learningEvidence: 0,
  expressionCapacityGrowth: 0,
  focusSlotGrowth: 0,
  maxMpGrowth: 0,
  currency: 0,
});

const validateNonEmpty = (value: string, label: string): string => {
  if (value.trim().length === 0) throw new Error(`${label} must be non-empty`);
  return value;
};

const validateCounter = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
};

export function createStableWildlifeLifeId(seed: WildlifeLifeIdentitySeed): string {
  const region = encodeURIComponent(validateNonEmpty(seed.regionSaveId, "regionSaveId"));
  const entity = encodeURIComponent(validateNonEmpty(seed.entityId, "entityId"));
  const generation = validateCounter(seed.spawnGeneration, "spawnGeneration");
  const sequence = validateCounter(seed.spawnSequence, "spawnSequence");
  return `wildlife-life:${region}:${entity}:${generation}:${sequence}`;
}

function validatePlayerProfile(profile: PlayerPhysicalProfile): PlayerPhysicalProfile {
  validateNonEmpty(profile.id, "player physical profile id");
  for (const [label, value] of [
    ["massKg", profile.massKg],
    ["buoyancyCoefficient", profile.buoyancyCoefficient],
    ["heatToleranceC", profile.heatToleranceC],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be finite and positive`);
  }
  return profile;
}

function physicalResponse(profileInput: PlayerPhysicalProfile): WildlifePhysicalResponse {
  const profile = validatePlayerProfile(profileInput);
  const impulseNs = Math.round((720 / Math.sqrt(profile.massKg)) * 1000) / 1000;
  const knockbackVelocityTilesPerSecond = Math.round((impulseNs / profile.massKg / 16) * 1000) / 1000;
  return Object.freeze({
    impulseNs,
    knockbackVelocityTilesPerSecond,
    environmentFeedback: Object.freeze({
      buoyancyBand: profile.buoyancyCoefficient > 1.1 ? "floats" : profile.buoyancyCoefficient < 0.9 ? "sinks" : "neutral",
      heatToleranceBand: profile.heatToleranceC >= 80 ? "high" : profile.heatToleranceC <= 40 ? "low" : "ordinary",
    }),
  });
}

/**
 * Deterministic 60 Hz wildlife behavior. Runtime values are accepted only through the
 * fail-closed generated ecology reader. Living bodies are never traversal platforms.
 */
export class WildlifeStateMachine {
  readonly lifeId: string;
  readonly ecology: RuntimeEcologyManifest;
  readonly speciesContract: RuntimeWildlifeSpeciesManifest;

  private state: WildlifeBehaviorState = "calm";
  private lifeState: WildlifeLifeState = "alive";
  private tickCount = 0;
  private stateTicks = 0;
  private warningTicks = 0;
  private intrusionTicks = 0;
  private selfDefenseTicks = 0;
  private defensiveWindowsStarted = 0;
  private fear = 0;
  private reachedExit = false;
  private lineOfSightLostTicks = 0;
  private majorHarmPending = false;
  private nonlethalStimulusPending = false;
  private defenseUsedThisEncounter = false;
  private lastDefense: WildlifeDefenseEvent | null = null;
  private readonly defenseEventHistory: WildlifeDefenseEvent[] = [];
  private fullReturnConditionsMet = false;

  constructor(
    readonly species: WildlifeSpecies,
    identity: Omit<WildlifeLifeIdentitySeed, "entityId">,
    runtimeArtifact: unknown = generatedRuntimeArtifact,
  ) {
    this.ecology = readRuntimeEcologyManifest(runtimeArtifact);
    this.speciesContract = this.ecology.species[species];
    this.lifeId = createStableWildlifeLifeId({ ...identity, entityId: this.speciesContract.entityId });
  }

  /** A visible staff display: no hit, no damage, deterministic fear and a very small air push. */
  applyWoodStaffFear(): NonlethalWildlifeActionResult {
    return this.applyNonlethalStimulus(15, 2);
  }

  /** Low-force world push. Force is capped; it never becomes a damage or reward event. */
  applyLowForcePush(requestedImpulseNs: number): NonlethalWildlifeActionResult {
    if (!Number.isFinite(requestedImpulseNs) || requestedImpulseNs < 0) {
      throw new Error("requestedImpulseNs must be finite and non-negative");
    }
    return this.applyNonlethalStimulus(20, Math.min(requestedImpulseNs, 6));
  }

  advance(input: WildlifeTickInput, ticks = 1): WildlifeStateMachineSnapshot {
    validateCounter(ticks, "ticks");
    validatePlayerProfile(input.playerProfile);
    for (let index = 0; index < ticks; index += 1) this.stepOne(input);
    return this.snapshot();
  }

  snapshot(): WildlifeStateMachineSnapshot {
    return Object.freeze({
      lifeId: this.lifeId,
      entityId: this.speciesContract.entityId,
      species: this.species,
      lifeState: this.lifeState,
      behaviorState: this.state,
      tick: this.tickCount,
      stateTicks: this.stateTicks,
      warningTicks: this.warningTicks,
      intrusionTicks: this.intrusionTicks,
      selfDefenseTicks: this.selfDefenseTicks,
      defensiveWindowsStarted: this.defensiveWindowsStarted,
      fear: this.fear,
      targetRealEscapeExit: this.speciesContract.realEscapeExit,
      reachedRealEscapeExit: this.reachedExit,
      lineOfSightLostTicks: this.lineOfSightLostTicks,
      returnEligible: this.lifeState === "alive" && this.fullReturnConditionsMet,
      canBeUsedAsBodyPlatform: false,
      rewardDelta: ZERO_REWARD,
      lastDefenseEvent: this.lastDefense,
      defenseEvents: Object.freeze([...this.defenseEventHistory]),
    });
  }

  private applyNonlethalStimulus(fearAdded: number, pushImpulseNs: number): NonlethalWildlifeActionResult {
    if (this.lifeState !== "alive") return Object.freeze({ accepted: false, damage: 0, fearAdded: 0, pushImpulseNs: 0 });
    this.fear = Math.min(100, this.fear + fearAdded);
    this.nonlethalStimulusPending = true;
    return Object.freeze({ accepted: true, damage: 0, fearAdded, pushImpulseNs });
  }

  private stepOne(input: WildlifeTickInput): void {
    this.tickCount += 1;
    if (input.deathTombstone === true) this.lifeState = "tombstoned";
    if (this.lifeState === "tombstoned") return;

    if (input.majorHarmOccurred === true) this.majorHarmPending = true;
    if (input.reachedRealEscapeExit) this.reachedExit = true;
    this.stateTicks += 1;

    switch (this.state) {
      case "calm":
        if (input.playerWithinPerception || input.majorHarmOccurred === true || this.nonlethalStimulusPending) {
          this.transition("observe");
        }
        break;
      case "observe":
        if (input.playerInsideWarningZone || input.playerBlocksEscape || this.majorHarmPending || this.nonlethalStimulusPending) {
          this.transition("warn");
        } else if (!input.playerWithinPerception) {
          this.transition("calm");
        }
        break;
      case "warn": {
        this.warningTicks += 1;
        if (input.playerInsideWarningZone || input.playerBlocksEscape) this.intrusionTicks += 1;
        const visibleWarningComplete = this.warningTicks >= this.minimumWarningTicks;
        const normalDefenseReady = this.intrusionTicks >= this.intrusionDefenseTicks;
        const defenseAuthorized = input.wildlifeCornered || input.youngThreatened === true || input.playerBlocksEscape;
        if (input.realEscapeExitReachable && (input.playerRetreating || this.fear >= WILDLIFE_FLEE_FEAR_THRESHOLD)) {
          this.transition("flee");
        } else if (visibleWarningComplete && !this.defenseUsedThisEncounter &&
                   (this.majorHarmPending || (normalDefenseReady && defenseAuthorized))) {
          this.enterSelfDefense(input.playerProfile, input.youngThreatened === true);
        }
        break;
      }
      case "self_defense":
        this.selfDefenseTicks += 1;
        if (input.realEscapeExitReachable && (this.selfDefenseTicks >= WILDLIFE_SELF_DEFENSE_TICKS || this.fear >= WILDLIFE_FLEE_FEAR_THRESHOLD)) {
          this.transition("flee");
        } else if (!input.realEscapeExitReachable && this.selfDefenseTicks >= WILDLIFE_SELF_DEFENSE_TICKS) {
          this.transition("warn");
        }
        break;
      case "flee":
        if (!input.lineOfSight) this.lineOfSightLostTicks += 1;
        else this.lineOfSightLostTicks = 0;
        this.fullReturnConditionsMet = this.reachedExit && input.localDangerCleared &&
          input.returnWorldConditionsSatisfied && this.lineOfSightLostTicks >= this.loseSightTicks;
        if (this.fullReturnConditionsMet) this.transition("return");
        break;
      case "return":
        if (input.atHomeAnchor && input.localDangerCleared) {
          this.transition("calm");
          this.resetEncounter();
        }
        break;
    }
    this.nonlethalStimulusPending = false;
  }

  private enterSelfDefense(profile: PlayerPhysicalProfile, youngThreatened: boolean): void {
    this.defenseUsedThisEncounter = true;
    this.defensiveWindowsStarted += 1;
    this.transition("self_defense");
    const damage = youngThreatened && this.speciesContract.guardingYoungDamage !== null
      ? this.speciesContract.guardingYoungDamage
      : this.speciesContract.defensiveDamage;
    this.lastDefense = Object.freeze({
      eventId: `${this.lifeId}:defense:${this.defensiveWindowsStarted}`,
      lifeId: this.lifeId,
      species: this.species,
      damage,
      durationTicksMaximum: WILDLIFE_SELF_DEFENSE_TICKS,
      physicalResponse: physicalResponse(profile),
    });
    this.defenseEventHistory.push(this.lastDefense);
  }

  private transition(next: WildlifeBehaviorState): void {
    this.state = next;
    this.stateTicks = 0;
    if (next === "warn") {
      this.warningTicks = 0;
      this.intrusionTicks = 0;
    }
    if (next === "self_defense") this.selfDefenseTicks = 0;
    if (next === "flee") this.lineOfSightLostTicks = 0;
  }

  private resetEncounter(): void {
    this.warningTicks = 0;
    this.intrusionTicks = 0;
    this.selfDefenseTicks = 0;
    this.fear = 0;
    this.reachedExit = false;
    this.lineOfSightLostTicks = 0;
    this.majorHarmPending = false;
    this.defenseUsedThisEncounter = false;
    this.fullReturnConditionsMet = false;
  }

  private get minimumWarningTicks(): number {
    return Math.ceil(this.ecology.minimumWarningTelegraphSeconds * WILDLIFE_TICKS_PER_SECOND);
  }

  private get intrusionDefenseTicks(): number {
    return Math.ceil(this.ecology.intrusionBeforeDefenseSeconds * WILDLIFE_TICKS_PER_SECOND);
  }

  private get loseSightTicks(): number {
    return Math.ceil(this.ecology.loseSightSeconds * WILDLIFE_TICKS_PER_SECOND);
  }
}

