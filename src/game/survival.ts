export const SURVIVAL_SAVE_SCHEMA = "tokipona.survival.v0.1";

export const SURVIVAL_RULES = {
  initialSatiety: 85,
  initialHydration: 90,
  satietyPerActiveHour: -6,
  hydrationPerActiveHour: -10,
  prologueFloor: 20,
  maximumExertionMultiplier: 1.25,
  ticksPerActiveMinute: 60,
  maximumMeter: 100,
  startingCanteenCharges: 3,
  startingTravelRations: 1,
} as const;

export type ConsumableId =
  | "container.field_canteen"
  | "water.clean"
  | "water.manifested_telo"
  | "food.travel_ration"
  | "food.cooked_game_meat"
  | "food.root_stew";

export interface SurvivalAdvanceContext {
  readonly worldAdvances: boolean;
  readonly metabolismExempt: boolean;
  readonly exertionMultiplier?: number;
}

export interface SurvivalSnapshot {
  readonly satiety: number;
  readonly hydration: number;
  readonly worldTicks: number;
  readonly metabolismTicks: number;
  readonly worldMinutes: number;
  readonly metabolismMinutes: number;
  readonly prologueFloorActive: boolean;
  readonly publicReliefFirstUseClaimed: boolean;
  readonly canteenCharges: number;
  readonly travelRations: number;
  readonly revision: number;
}

export interface SurvivalSave {
  readonly schema: typeof SURVIVAL_SAVE_SCHEMA;
  readonly satiety: number;
  readonly hydration: number;
  readonly worldTicks: number;
  readonly metabolismTicks: number;
  readonly worldTickRemainder: number;
  readonly metabolismTickRemainder: number;
  readonly prologueFloorActive: boolean;
  readonly publicReliefFirstUseClaimed: boolean;
  readonly canteenCharges: number;
  readonly travelRations: number;
  readonly revision: number;
  readonly receipts: readonly string[];
}

export interface SurvivalTransactionResult {
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly reason?: "empty_source" | "already_claimed";
  readonly satietyDelta: number;
  readonly hydrationDelta: number;
  readonly snapshot: SurvivalSnapshot;
}

interface MeterDelta {
  readonly satiety: number;
  readonly hydration: number;
}

const CONSUMPTION_PROFILES: Readonly<Record<ConsumableId, MeterDelta>> = {
  "container.field_canteen": { satiety: 0, hydration: 25 },
  "water.clean": { satiety: 0, hydration: 35 },
  "water.manifested_telo": { satiety: 0, hydration: 20 },
  "food.travel_ration": { satiety: 30, hydration: 0 },
  "food.cooked_game_meat": { satiety: 35, hydration: 0 },
  "food.root_stew": { satiety: 50, hydration: 10 },
};

const clampMeter = (value: number): number => Math.max(0, Math.min(SURVIVAL_RULES.maximumMeter, value));

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const nonNegativeIntegerOr = (value: unknown, fallback: number): number => {
  const finite = finiteOr(value, fallback);
  return Number.isInteger(finite) && finite >= 0 ? finite : fallback;
};

export class SurvivalSystem {
  private satiety: number = SURVIVAL_RULES.initialSatiety;
  private hydration: number = SURVIVAL_RULES.initialHydration;
  private worldTicks = 0;
  private metabolismTicks = 0;
  private worldTickRemainder = 0;
  private metabolismTickRemainder = 0;
  private prologueFloorActive = true;
  private publicReliefFirstUseClaimed = false;
  private canteenCharges: number = SURVIVAL_RULES.startingCanteenCharges;
  private travelRations: number = SURVIVAL_RULES.startingTravelRations;
  private revision = 0;
  private readonly receipts = new Set<string>();

  static fromSave(candidate: unknown): SurvivalSystem {
    const system = new SurvivalSystem();
    if (!candidate || typeof candidate !== "object") return system;
    const save = candidate as Partial<SurvivalSave>;
    if (save.schema !== SURVIVAL_SAVE_SCHEMA) return system;

    system.satiety = clampMeter(finiteOr(save.satiety, SURVIVAL_RULES.initialSatiety));
    system.hydration = clampMeter(finiteOr(save.hydration, SURVIVAL_RULES.initialHydration));
    system.worldTicks = nonNegativeIntegerOr(save.worldTicks, 0);
    system.metabolismTicks = nonNegativeIntegerOr(save.metabolismTicks, 0);
    system.worldTickRemainder = Math.max(0, Math.min(0.999_999, finiteOr(save.worldTickRemainder, 0)));
    system.metabolismTickRemainder = Math.max(0, Math.min(0.999_999, finiteOr(save.metabolismTickRemainder, 0)));
    system.prologueFloorActive = save.prologueFloorActive !== false;
    system.publicReliefFirstUseClaimed = save.publicReliefFirstUseClaimed === true;
    system.canteenCharges = nonNegativeIntegerOr(save.canteenCharges, SURVIVAL_RULES.startingCanteenCharges);
    system.travelRations = nonNegativeIntegerOr(save.travelRations, SURVIVAL_RULES.startingTravelRations);
    system.revision = nonNegativeIntegerOr(save.revision, 0);
    if (Array.isArray(save.receipts)) {
      save.receipts.forEach((receipt) => {
        if (typeof receipt === "string" && receipt.length > 0) system.receipts.add(receipt);
      });
    }
    return system;
  }

  advanceSeconds(elapsedSeconds: number, context: SurvivalAdvanceContext): SurvivalSnapshot {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0 || !context.worldAdvances) return this.snapshot();

    const worldAdvance = elapsedSeconds + this.worldTickRemainder;
    const wholeWorldTicks = Math.floor(worldAdvance);
    this.worldTickRemainder = worldAdvance - wholeWorldTicks;
    this.worldTicks += wholeWorldTicks;

    if (context.metabolismExempt) return this.snapshot();

    const multiplier = Math.max(
      0,
      Math.min(SURVIVAL_RULES.maximumExertionMultiplier, context.exertionMultiplier ?? 1),
    );
    const metabolismAdvance = elapsedSeconds + this.metabolismTickRemainder;
    const wholeMetabolismTicks = Math.floor(metabolismAdvance);
    this.metabolismTickRemainder = metabolismAdvance - wholeMetabolismTicks;
    if (wholeMetabolismTicks === 0) return this.snapshot();

    this.metabolismTicks += wholeMetabolismTicks;
    const hours = wholeMetabolismTicks / (SURVIVAL_RULES.ticksPerActiveMinute * 60);
    this.applyMeterDelta({
      satiety: SURVIVAL_RULES.satietyPerActiveHour * hours * multiplier,
      hydration: SURVIVAL_RULES.hydrationPerActiveHour * hours * multiplier,
    });
    return this.snapshot();
  }

  advanceActiveMinutes(minutes: number, context: SurvivalAdvanceContext): SurvivalSnapshot {
    return this.advanceSeconds(minutes * SURVIVAL_RULES.ticksPerActiveMinute, context);
  }

  consume(consumableId: ConsumableId, transactionId: string): SurvivalTransactionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, 0, 0);
    if (consumableId === "container.field_canteen" && this.canteenCharges <= 0) {
      return this.result(false, false, 0, 0, "empty_source");
    }
    if (consumableId === "food.travel_ration" && this.travelRations <= 0) {
      return this.result(false, false, 0, 0, "empty_source");
    }

    const beforeSatiety = this.satiety;
    const beforeHydration = this.hydration;
    const delta = CONSUMPTION_PROFILES[consumableId];
    this.applyMeterDelta(delta);
    if (consumableId === "container.field_canteen") this.canteenCharges -= 1;
    if (consumableId === "food.travel_ration") this.travelRations -= 1;
    this.receipts.add(transactionId);
    this.revision += 1;
    return this.result(true, false, this.satiety - beforeSatiety, this.hydration - beforeHydration);
  }

  usePublicRelief(transactionId: string): SurvivalTransactionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, 0, 0);
    const beforeSatiety = this.satiety;
    const beforeHydration = this.hydration;

    if (!this.publicReliefFirstUseClaimed) {
      this.satiety = Math.max(this.satiety, 90);
      this.hydration = Math.max(this.hydration, 90);
      this.publicReliefFirstUseClaimed = true;
    } else {
      this.applyMeterDelta({ satiety: 50, hydration: 45 });
    }

    this.receipts.add(transactionId);
    this.revision += 1;
    return this.result(true, false, this.satiety - beforeSatiety, this.hydration - beforeHydration);
  }

  releasePrologueFloor(transactionId: string): SurvivalTransactionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, 0, 0);
    if (!this.prologueFloorActive) return this.result(false, false, 0, 0, "already_claimed");
    this.prologueFloorActive = false;
    this.receipts.add(transactionId);
    this.revision += 1;
    return this.result(true, false, 0, 0);
  }

  snapshot(): SurvivalSnapshot {
    return {
      satiety: this.satiety,
      hydration: this.hydration,
      worldTicks: this.worldTicks,
      metabolismTicks: this.metabolismTicks,
      worldMinutes: this.worldTicks / SURVIVAL_RULES.ticksPerActiveMinute,
      metabolismMinutes: this.metabolismTicks / SURVIVAL_RULES.ticksPerActiveMinute,
      prologueFloorActive: this.prologueFloorActive,
      publicReliefFirstUseClaimed: this.publicReliefFirstUseClaimed,
      canteenCharges: this.canteenCharges,
      travelRations: this.travelRations,
      revision: this.revision,
    };
  }

  toSave(): SurvivalSave {
    return {
      schema: SURVIVAL_SAVE_SCHEMA,
      satiety: this.satiety,
      hydration: this.hydration,
      worldTicks: this.worldTicks,
      metabolismTicks: this.metabolismTicks,
      worldTickRemainder: this.worldTickRemainder,
      metabolismTickRemainder: this.metabolismTickRemainder,
      prologueFloorActive: this.prologueFloorActive,
      publicReliefFirstUseClaimed: this.publicReliefFirstUseClaimed,
      canteenCharges: this.canteenCharges,
      travelRations: this.travelRations,
      revision: this.revision,
      receipts: [...this.receipts],
    };
  }

  private applyMeterDelta(delta: MeterDelta): void {
    this.satiety = clampMeter(this.satiety + delta.satiety);
    this.hydration = clampMeter(this.hydration + delta.hydration);
    if (this.prologueFloorActive) {
      this.satiety = Math.max(SURVIVAL_RULES.prologueFloor, this.satiety);
      this.hydration = Math.max(SURVIVAL_RULES.prologueFloor, this.hydration);
    }
  }

  private result(
    committed: boolean,
    duplicate: boolean,
    satietyDelta: number,
    hydrationDelta: number,
    reason?: SurvivalTransactionResult["reason"],
  ): SurvivalTransactionResult {
    return {
      committed,
      duplicate,
      reason,
      satietyDelta,
      hydrationDelta,
      snapshot: this.snapshot(),
    };
  }
}
