import { SurvivalSystem, type SurvivalSave, type SurvivalSnapshot } from "./survival";

export const SETTLEMENT_DEMO_SAVE_SCHEMA = "tokipona.settlement-demo.v0.1";

export type ActivityMode = "safe_zone" | "field" | "paused";
export type CookingState = "idle" | "working" | "completed" | "claimed";

export interface SettlementDemoSnapshot {
  readonly survival: SurvivalSnapshot;
  readonly mode: ActivityMode;
  readonly rawMeat: number;
  readonly cookedMeat: number;
  readonly coins: number;
  readonly cookingState: CookingState;
  readonly cookingProgressSeconds: number;
  readonly cookingRequiredSeconds: number;
  readonly transactionSequence: number;
}

export interface SettlementDemoSave {
  readonly schema: typeof SETTLEMENT_DEMO_SAVE_SCHEMA;
  readonly survival: SurvivalSave;
  readonly mode: ActivityMode;
  readonly rawMeat: number;
  readonly cookedMeat: number;
  readonly coins: number;
  readonly cookingState: CookingState;
  readonly cookingProgressSeconds: number;
  readonly transactionSequence: number;
  readonly receipts: readonly string[];
}

export interface DemoActionResult {
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly message: string;
  readonly snapshot: SettlementDemoSnapshot;
}

const COOKING_REQUIRED_SECONDS = 180;
const VALID_MODES: readonly ActivityMode[] = ["safe_zone", "field", "paused"];
const VALID_COOKING_STATES: readonly CookingState[] = ["idle", "working", "completed", "claimed"];

const nonNegativeInteger = (candidate: unknown, fallback: number): number =>
  typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : fallback;

export class SettlementDemoSystem {
  private survival = new SurvivalSystem();
  private mode: ActivityMode = "safe_zone";
  private rawMeat = 1;
  private cookedMeat = 0;
  private coins = 0;
  private cookingState: CookingState = "idle";
  private cookingProgressSeconds = 0;
  private transactionSequence = 0;
  private readonly receipts = new Set<string>();

  static fromSave(candidate: unknown): SettlementDemoSystem {
    const demo = new SettlementDemoSystem();
    if (!candidate || typeof candidate !== "object") return demo;
    const save = candidate as Partial<SettlementDemoSave>;
    if (save.schema !== SETTLEMENT_DEMO_SAVE_SCHEMA) return demo;

    demo.survival = SurvivalSystem.fromSave(save.survival);
    demo.mode = VALID_MODES.includes(save.mode as ActivityMode) ? (save.mode as ActivityMode) : "safe_zone";
    demo.rawMeat = nonNegativeInteger(save.rawMeat, 1);
    demo.cookedMeat = nonNegativeInteger(save.cookedMeat, 0);
    demo.coins = nonNegativeInteger(save.coins, 0);
    demo.cookingState = VALID_COOKING_STATES.includes(save.cookingState as CookingState)
      ? (save.cookingState as CookingState)
      : "idle";
    demo.cookingProgressSeconds = Math.max(
      0,
      Math.min(COOKING_REQUIRED_SECONDS, Number.isFinite(save.cookingProgressSeconds) ? Number(save.cookingProgressSeconds) : 0),
    );
    demo.transactionSequence = nonNegativeInteger(save.transactionSequence, 0);
    if (Array.isArray(save.receipts)) {
      save.receipts.forEach((receipt) => {
        if (typeof receipt === "string" && receipt.length > 0) demo.receipts.add(receipt);
      });
    }
    return demo;
  }

  nextTransactionId(kind: string): string {
    this.transactionSequence += 1;
    return `settlement.${kind}.${this.transactionSequence}`;
  }

  setMode(mode: ActivityMode): SettlementDemoSnapshot {
    this.mode = mode;
    return this.snapshot();
  }

  advanceActiveMinutes(minutes: number): SettlementDemoSnapshot {
    if (!Number.isFinite(minutes) || minutes <= 0 || this.mode === "paused") return this.snapshot();
    const metabolismExempt = this.mode === "safe_zone";
    this.survival.advanceActiveMinutes(minutes, { worldAdvances: true, metabolismExempt });

    if (this.cookingState === "working" && this.mode === "safe_zone") {
      this.cookingProgressSeconds = Math.min(
        COOKING_REQUIRED_SECONDS,
        this.cookingProgressSeconds + minutes * 60,
      );
      if (this.cookingProgressSeconds >= COOKING_REQUIRED_SECONDS) this.cookingState = "completed";
    }
    return this.snapshot();
  }

  drinkFromCanteen(transactionId: string): DemoActionResult {
    const result = this.survival.consume("container.field_canteen", transactionId);
    if (result.duplicate) return this.result(false, true, "这次饮水已经结算。", transactionId);
    if (!result.committed) return this.result(false, false, "水壶已经空了。", transactionId);
    return this.result(true, false, `饮水 +${Math.round(result.hydrationDelta)}。`, transactionId);
  }

  eatTravelRation(transactionId: string): DemoActionResult {
    const result = this.survival.consume("food.travel_ration", transactionId);
    if (result.duplicate) return this.result(false, true, "这份口粮已经结算。", transactionId);
    if (!result.committed) return this.result(false, false, "没有可用的旅行口粮。", transactionId);
    return this.result(true, false, `饱食 +${Math.round(result.satietyDelta)}。`, transactionId);
  }

  usePublicRelief(transactionId: string): DemoActionResult {
    const result = this.survival.usePublicRelief(transactionId);
    if (result.duplicate) return this.result(false, true, "这次公共补给已经结算。", transactionId);
    const label = result.snapshot.publicReliefFirstUseClaimed ? "公共水井与植物餐已提供。" : "公共补给不可用。";
    return this.result(result.committed, false, label, transactionId);
  }

  startCooking(transactionId: string): DemoActionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, "这份加工单已经建立。", transactionId);
    if (this.cookingState !== "idle" || this.rawMeat <= 0) {
      return this.result(false, false, "没有可投入的新鲜生肉，或加工台正忙。", transactionId);
    }
    this.rawMeat -= 1;
    this.cookingState = "working";
    this.cookingProgressSeconds = 0;
    this.receipts.add(transactionId);
    return this.result(true, false, "已开始烹饪；公共厨房提供 8 EU 热功。", transactionId);
  }

  claimCookedMeat(transactionId: string): DemoActionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, "熟肉已经领取。", transactionId);
    if (this.cookingState !== "completed") return this.result(false, false, "加工尚未完成。", transactionId);
    this.cookedMeat += 1;
    this.cookingState = "claimed";
    this.receipts.add(transactionId);
    return this.result(true, false, "取得熟肉 ×1。", transactionId);
  }

  eatCookedMeat(transactionId: string): DemoActionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, "这份熟肉已经食用。", transactionId);
    if (this.cookedMeat <= 0) return this.result(false, false, "没有熟肉可食用。", transactionId);
    const survivalResult = this.survival.consume("food.cooked_game_meat", transactionId);
    if (!survivalResult.committed) return this.result(false, survivalResult.duplicate, "食用事务未提交。", transactionId);
    this.cookedMeat -= 1;
    this.receipts.add(transactionId);
    return this.result(true, false, `饱食 +${Math.round(survivalResult.satietyDelta)}。`, transactionId);
  }

  sellCookedMeat(transactionId: string): DemoActionResult {
    if (this.receipts.has(transactionId)) return this.result(false, true, "这次出售已经结算。", transactionId);
    if (this.cookedMeat <= 0) return this.result(false, false, "没有熟肉可出售。", transactionId);
    this.cookedMeat -= 1;
    this.coins += 2;
    this.receipts.add(transactionId);
    return this.result(true, false, "屠户收购熟肉：硬币 +2。", transactionId);
  }

  snapshot(): SettlementDemoSnapshot {
    return {
      survival: this.survival.snapshot(),
      mode: this.mode,
      rawMeat: this.rawMeat,
      cookedMeat: this.cookedMeat,
      coins: this.coins,
      cookingState: this.cookingState,
      cookingProgressSeconds: this.cookingProgressSeconds,
      cookingRequiredSeconds: COOKING_REQUIRED_SECONDS,
      transactionSequence: this.transactionSequence,
    };
  }

  toSave(): SettlementDemoSave {
    return {
      schema: SETTLEMENT_DEMO_SAVE_SCHEMA,
      survival: this.survival.toSave(),
      mode: this.mode,
      rawMeat: this.rawMeat,
      cookedMeat: this.cookedMeat,
      coins: this.coins,
      cookingState: this.cookingState,
      cookingProgressSeconds: this.cookingProgressSeconds,
      transactionSequence: this.transactionSequence,
      receipts: [...this.receipts],
    };
  }

  private result(committed: boolean, duplicate: boolean, message: string, transactionId: string): DemoActionResult {
    if (committed) this.receipts.add(transactionId);
    return { committed, duplicate, message, snapshot: this.snapshot() };
  }
}
