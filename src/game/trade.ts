export const TRADE_SAVE_SCHEMA = "tokipona.trade.v0.1";
export const TRADE_PRICE_TABLE_VERSION = "settlement.prologue.v0.1";

export type MerchantId =
  | "settlement.butcher"
  | "settlement.tanner"
  | "settlement.grocer"
  | "settlement.smith"
  | "settlement.carpenter"
  | "settlement.herbalist"
  | "settlement.archivist"
  | "settlement.fence";

export type TradeCategory =
  | "raw_meat"
  | "cooked_meat"
  | "preserved_meat"
  | "raw_hide"
  | "leather"
  | "food_supply"
  | "tannin_or_salt"
  | "tool"
  | "wood"
  | "plant"
  | "document"
  | "knowledge"
  | "quest"
  | "hazard"
  | "relic";

export type TradeOrigin = "natural" | "manifested" | "relief" | "quest" | "borrowed" | "stolen" | "legacy_unknown";
export type TradeFreshness =
  | "fresh"
  | "aging"
  | "near_spoil"
  | "spoiled"
  | "decomposed"
  | "raw"
  | "cured"
  | "stable"
  | "rotten";

export type TradeRefusalReason =
  | "merchant_not_found"
  | "merchant_unavailable"
  | "item_unknown"
  | "item_not_sellable"
  | "knowledge_or_quest_bound"
  | "reserved_or_equipped"
  | "origin_not_natural"
  | "stolen_or_ownership_invalid"
  | "category_not_accepted"
  | "prologue_restriction"
  | "freshness_rejected"
  | "contamination_rejected"
  | "quality_too_low"
  | "insufficient_quantity"
  | "demand_exhausted"
  | "zero_price"
  | "eligible";

export type TradeCommitReason =
  | "committed"
  | "duplicate_transaction"
  | "transaction_payload_conflict"
  | "quote_not_found"
  | "quote_expired"
  | "quote_stale"
  | "quote_consumed"
  | "wallet_revision_conflict"
  | "lot_revision_conflict";

export interface TradeItemDefinition {
  readonly itemId: string;
  readonly nameZh: string;
  readonly category: TradeCategory;
  readonly baseSellCoin: number;
  readonly playerSellable: boolean;
  readonly merchantSellable: boolean;
  readonly notesZh: string;
}

export interface MerchantDefinition {
  readonly merchantId: MerchantId;
  readonly professionZh: string;
  readonly status: "active" | "planned";
  readonly buys: readonly TradeCategory[];
  readonly conditionallyBuys?: readonly TradeCategory[];
  readonly sellsZh: readonly string[];
  readonly refusesZh: readonly string[];
  readonly fullPriceUnitsPerRestock: number;
  readonly excessPolicy: "quarter_price" | "reject";
  readonly ownershipPolicy?: "legal_only" | "fence";
}

export interface TradeLot {
  readonly lotId: string;
  readonly itemId: string;
  readonly sourceLotIds: readonly string[];
  readonly legalOwnerId: string | null;
  readonly stolenFromId: string | null;
  readonly processingTransactionId: string | null;
  quantity: number;
  readonly originKind: TradeOrigin;
  readonly naturalFraction: number;
  readonly freshness: TradeFreshness;
  readonly qualityMultiplier: number;
  readonly contaminationMu: number;
  readonly economyEligible: boolean;
  readonly reserved: boolean;
  readonly equipped: boolean;
  ownershipRevision: number;
  readonly freshnessRevision: number;
}

export interface MerchantState {
  readonly merchantId: MerchantId;
  demandRevision: number;
  soldUnitsSinceRestock: number;
  readonly priceTableVersion: typeof TRADE_PRICE_TABLE_VERSION;
}

export interface TradeEligibility {
  readonly eligible: boolean;
  readonly reason: TradeRefusalReason;
  readonly messageZh: string;
}

export interface SellQuote {
  readonly quoteId: string;
  readonly merchantId: MerchantId;
  readonly lotId: string;
  readonly itemId: string;
  readonly itemNameZh: string;
  readonly quantity: number;
  readonly fullPriceUnits: number;
  readonly excessUnits: number;
  readonly totalCoin: number;
  readonly issuedWorldTick: number;
  readonly expiresWorldTick: number;
  readonly merchantDemandRevision: number;
  readonly lotOwnershipRevision: number;
  readonly lotFreshnessRevision: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  consumed: boolean;
}

export interface TradeReceipt {
  readonly transactionId: string;
  readonly quoteId: string;
  readonly merchantId: MerchantId;
  readonly lotId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly coinDelta: number;
  readonly committedWorldTick: number;
}

export interface TradeSnapshot {
  readonly coin: number;
  readonly walletRevision: number;
  readonly inventoryRevision: number;
  readonly quoteSequence: number;
  readonly lots: readonly TradeLot[];
  readonly merchantStates: readonly MerchantState[];
}

export interface TradeSave extends TradeSnapshot {
  readonly schema: typeof TRADE_SAVE_SCHEMA;
  readonly receipts: readonly TradeReceipt[];
}

export interface QuoteResult {
  readonly accepted: boolean;
  readonly eligibility: TradeEligibility;
  readonly quote?: SellQuote;
}

export interface CommitResult {
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly reason: TradeCommitReason;
  readonly messageZh: string;
  readonly receipt?: TradeReceipt;
  readonly snapshot: TradeSnapshot;
}

export const TRADE_ITEMS: Readonly<Record<string, TradeItemDefinition>> = Object.freeze({
  "food.raw_small_game_meat": {
    itemId: "food.raw_small_game_meat",
    nameZh: "小型猎物生肉",
    category: "raw_meat",
    baseSellCoin: 1,
    playerSellable: true,
    merchantSellable: false,
    notesZh: "屠户收购；腐败或受污染时拒收。",
  },
  "food.raw_predator_meat": {
    itemId: "food.raw_predator_meat",
    nameZh: "掠食动物生肉",
    category: "raw_meat",
    baseSellCoin: 1,
    playerSellable: true,
    merchantSellable: false,
    notesZh: "屠户收购；另受寄生风险与处理要求约束。",
  },
  "food.cooked_game_meat": {
    itemId: "food.cooked_game_meat",
    nameZh: "熟兽肉",
    category: "cooked_meat",
    baseSellCoin: 2,
    playerSellable: true,
    merchantSellable: false,
    notesZh: "屠户收购；早期最稳定的小额收入。",
  },
  "food.dried_game_meat": {
    itemId: "food.dried_game_meat",
    nameZh: "肉干",
    category: "preserved_meat",
    baseSellCoin: 3,
    playerSellable: true,
    merchantSellable: true,
    notesZh: "保质期长，可在旅途中食用或出售。",
  },
  "material.raw_small_hide": {
    itemId: "material.raw_small_hide",
    nameZh: "小型生皮",
    category: "raw_hide",
    baseSellCoin: 2,
    playerSellable: true,
    merchantSellable: false,
    notesZh: "序章中不能直接出售，先学习鞣制。",
  },
  "material.raw_medium_pelt": {
    itemId: "material.raw_medium_pelt",
    nameZh: "中型生皮",
    category: "raw_hide",
    baseSellCoin: 4,
    playerSellable: true,
    merchantSellable: false,
    notesZh: "序章中不能直接出售，先学习鞣制。",
  },
  "material.cured_small_leather": {
    itemId: "material.cured_small_leather",
    nameZh: "鞣制小皮革",
    category: "leather",
    baseSellCoin: 2,
    playerSellable: true,
    merchantSellable: true,
    notesZh: "制革匠收购。",
  },
  "material.cured_medium_leather": {
    itemId: "material.cured_medium_leather",
    nameZh: "鞣制中皮革",
    category: "leather",
    baseSellCoin: 3,
    playerSellable: true,
    merchantSellable: true,
    notesZh: "制革匠收购。",
  },
  "material.salt": {
    itemId: "material.salt",
    nameZh: "盐",
    category: "tannin_or_salt",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: true,
    notesZh: "早期由杂货商出售，不允许倒卖。",
  },
  "food.travel_ration": {
    itemId: "food.travel_ration",
    nameZh: "旅行口粮",
    category: "food_supply",
    baseSellCoin: 1,
    playerSellable: true,
    merchantSellable: true,
    notesZh: "杂货商少量收售。",
  },
  "knowledge.sitelen_pona": {
    itemId: "knowledge.sitelen_pona",
    nameZh: "已领会的道本语字符",
    category: "knowledge",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "永久知识状态，不进入物品栏和市场。",
  },
  "research.first_glyph_rubbing": {
    itemId: "research.first_glyph_rubbing",
    nameZh: "首次字符拓片",
    category: "quest",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "教学与研究证据，只能交付任务，不能出售。",
  },
  "food.public_relief_meal": {
    itemId: "food.public_relief_meal",
    nameZh: "公共救济餐",
    category: "food_supply",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "防止玩家把兜底资源变现。",
  },
  "matter.manifested_sample": {
    itemId: "matter.manifested_sample",
    nameZh: "魔法显化物质",
    category: "relic",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "非天然物质会衰变，不能进入经济系统。",
  },
  "weapon.active_explosive": {
    itemId: "weapon.active_explosive",
    nameZh: "已激活爆炸物",
    category: "hazard",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "危险状态物品禁止交易。",
  },
  "relic.unidentified_unique": {
    itemId: "relic.unidentified_unique",
    nameZh: "未鉴定唯一遗物",
    category: "relic",
    baseSellCoin: 0,
    playerSellable: false,
    merchantSellable: false,
    notesZh: "先鉴定并解决相关剧情归属。",
  },
});

export const MERCHANT_DIRECTORY: readonly MerchantDefinition[] = Object.freeze([
  {
    merchantId: "settlement.butcher",
    professionZh: "屠户",
    status: "active",
    buys: ["raw_meat", "cooked_meat", "preserved_meat"],
    sellsZh: ["处理过的肉", "少量肉干"],
    refusesZh: ["腐败肉", "污染肉", "魔法显化肉", "尸体"],
    fullPriceUnitsPerRestock: 2,
    excessPolicy: "quarter_price",
  },
  {
    merchantId: "settlement.tanner",
    professionZh: "制革匠",
    status: "active",
    buys: ["leather"],
    conditionallyBuys: ["raw_hide"],
    sellsZh: ["鞣制皮革", "皮绳", "简易皮具"],
    refusesZh: ["序章生皮", "腐烂皮", "来历不明的皮"],
    fullPriceUnitsPerRestock: 1,
    excessPolicy: "reject",
  },
  {
    merchantId: "settlement.grocer",
    professionZh: "杂货商",
    status: "active",
    buys: ["food_supply", "tannin_or_salt"],
    sellsZh: ["盐", "旅行口粮", "水壶补充"],
    refusesZh: ["公共救济物资", "腐败食物", "无主权证明的赃物"],
    fullPriceUnitsPerRestock: 3,
    excessPolicy: "quarter_price",
  },
  {
    merchantId: "settlement.smith",
    professionZh: "铁匠",
    status: "planned",
    buys: ["tool"],
    sellsZh: ["小刀", "斧", "金属工具", "修理服务"],
    refusesZh: ["任务借用品", "仍在工作的爆炸装置"],
    fullPriceUnitsPerRestock: 2,
    excessPolicy: "reject",
  },
  {
    merchantId: "settlement.carpenter",
    professionZh: "木匠",
    status: "planned",
    buys: ["wood", "tool"],
    sellsZh: ["木柄", "箱具", "建筑修理件"],
    refusesZh: ["非法砍伐木材", "任务预留材料"],
    fullPriceUnitsPerRestock: 2,
    excessPolicy: "reject",
  },
  {
    merchantId: "settlement.herbalist",
    professionZh: "草药师",
    status: "planned",
    buys: ["plant"],
    sellsZh: ["草药", "药膏", "辨识服务"],
    refusesZh: ["污染植物", "未知毒物"],
    fullPriceUnitsPerRestock: 3,
    excessPolicy: "quarter_price",
  },
  {
    merchantId: "settlement.archivist",
    professionZh: "档案员",
    status: "planned",
    buys: ["document"],
    sellsZh: ["纸", "炭笔", "地图线索", "遗迹释读服务"],
    refusesZh: ["字符知识本身", "首次拓片", "任务证据"],
    fullPriceUnitsPerRestock: 1,
    excessPolicy: "reject",
  },
  {
    merchantId: "settlement.fence",
    professionZh: "销赃商",
    status: "planned",
    buys: ["tool", "relic"],
    sellsZh: ["来路可疑的工具", "情报"],
    refusesZh: ["已标记的关键任务物", "角色必需品", "未鉴定唯一遗物"],
    fullPriceUnitsPerRestock: 1,
    excessPolicy: "reject",
    ownershipPolicy: "fence",
  },
]);

const REFUSAL_MESSAGES: Readonly<Record<TradeRefusalReason, string>> = Object.freeze({
  merchant_not_found: "找不到这个交易对象。",
  merchant_unavailable: "这个职业尚未在当前版本开放交易。",
  item_unknown: "物品没有登记在交易目录中。",
  item_not_sellable: "该物品只供使用或购买，不能由玩家出售。",
  knowledge_or_quest_bound: "知识、字符解锁和任务证据不属于商品。",
  reserved_or_equipped: "物品正在装备或被任务预留。",
  origin_not_natural: "魔法显化、公共救济或天然比例不足的物质不能进入市场。",
  stolen_or_ownership_invalid: "合法商人拒绝赃物、借用品和归属无效的物品。",
  category_not_accepted: "这个职业不收购该类物品。",
  prologue_restriction: "序章生皮必须先鞣制，不能直接出售。",
  freshness_rejected: "物品已腐败、分解或腐烂。",
  contamination_rejected: "物品含污染物，不能进入食物或材料市场。",
  quality_too_low: "物品质量低于收购门槛。",
  insufficient_quantity: "该物品堆数量不足。",
  demand_exhausted: "本轮补货周期的收购需求已用尽。",
  zero_price: "折价后的整批报价不足一枚硬币，因此拒绝交易。",
  eligible: "可以生成报价。",
});

const freshnessMultiplier = (freshness: TradeFreshness): number => {
  if (freshness === "aging") return 0.75;
  if (freshness === "near_spoil") return 0.5;
  return 1;
};

const freshnessRejected = (freshness: TradeFreshness): boolean =>
  freshness === "spoiled" || freshness === "decomposed" || freshness === "rotten";

const cloneLot = (lot: TradeLot): TradeLot => ({ ...lot, sourceLotIds: [...lot.sourceLotIds] });
const cloneMerchantState = (state: MerchantState): MerchantState => ({ ...state });

export const createDemoTradeLots = (): TradeLot[] => [
  {
    lotId: "lot.cooked-game-meat.1",
    itemId: "food.cooked_game_meat",
    sourceLotIds: ["lot.raw-small-game-meat.seed"],
    legalOwnerId: "player.graybox",
    stolenFromId: null,
    processingTransactionId: "graybox.seed.cook",
    quantity: 3,
    originKind: "natural",
    naturalFraction: 1,
    freshness: "fresh",
    qualityMultiplier: 1,
    contaminationMu: 0,
    economyEligible: true,
    reserved: false,
    equipped: false,
    ownershipRevision: 0,
    freshnessRevision: 0,
  },
  {
    lotId: "lot.raw-hide.1",
    itemId: "material.raw_small_hide",
    sourceLotIds: ["carcass.rabbit.seed"],
    legalOwnerId: "player.graybox",
    stolenFromId: null,
    processingTransactionId: "graybox.seed.harvest",
    quantity: 1,
    originKind: "natural",
    naturalFraction: 1,
    freshness: "raw",
    qualityMultiplier: 1,
    contaminationMu: 0,
    economyEligible: true,
    reserved: false,
    equipped: false,
    ownershipRevision: 0,
    freshnessRevision: 0,
  },
  {
    lotId: "lot.cured-leather.1",
    itemId: "material.cured_small_leather",
    sourceLotIds: ["lot.raw-hide.seed"],
    legalOwnerId: "player.graybox",
    stolenFromId: null,
    processingTransactionId: "graybox.seed.tan",
    quantity: 1,
    originKind: "natural",
    naturalFraction: 1,
    freshness: "cured",
    qualityMultiplier: 1,
    contaminationMu: 0,
    economyEligible: true,
    reserved: false,
    equipped: false,
    ownershipRevision: 0,
    freshnessRevision: 0,
  },
  {
    lotId: "lot.manifested-sample.1",
    itemId: "matter.manifested_sample",
    sourceLotIds: [],
    legalOwnerId: "player.graybox",
    stolenFromId: null,
    processingTransactionId: "graybox.seed.manifest",
    quantity: 1,
    originKind: "manifested",
    naturalFraction: 0,
    freshness: "stable",
    qualityMultiplier: 1,
    contaminationMu: 0,
    economyEligible: false,
    reserved: false,
    equipped: false,
    ownershipRevision: 0,
    freshnessRevision: 0,
  },
  {
    lotId: "lot.first-glyph-rubbing.1",
    itemId: "research.first_glyph_rubbing",
    sourceLotIds: ["world.glyph-wall.seed"],
    legalOwnerId: "settlement.archive",
    stolenFromId: null,
    processingTransactionId: "graybox.seed.rubbing",
    quantity: 1,
    originKind: "quest",
    naturalFraction: 1,
    freshness: "stable",
    qualityMultiplier: 1,
    contaminationMu: 0,
    economyEligible: false,
    reserved: true,
    equipped: false,
    ownershipRevision: 0,
    freshnessRevision: 0,
  },
];

export class TradeSystem {
  private coin = 0;
  private walletRevision = 0;
  private inventoryRevision = 0;
  private quoteSequence = 0;
  private readonly lots = new Map<string, TradeLot>();
  private readonly merchantStates = new Map<MerchantId, MerchantState>();
  private readonly quotes = new Map<string, SellQuote>();
  private readonly receipts = new Map<string, TradeReceipt>();

  constructor(initialLots: readonly TradeLot[] = []) {
    initialLots.forEach((lot) => this.lots.set(lot.lotId, cloneLot(lot)));
    MERCHANT_DIRECTORY.forEach((merchant) => {
      this.merchantStates.set(merchant.merchantId, {
        merchantId: merchant.merchantId,
        demandRevision: 0,
        soldUnitsSinceRestock: 0,
        priceTableVersion: TRADE_PRICE_TABLE_VERSION,
      });
    });
  }

  static fromSave(candidate: unknown): TradeSystem {
    if (!candidate || typeof candidate !== "object") return new TradeSystem([]);
    const save = candidate as Partial<TradeSave>;
    if (
      save.schema !== TRADE_SAVE_SCHEMA ||
      !Array.isArray(save.lots) ||
      !save.lots.every(isTradeLot) ||
      !Array.isArray(save.merchantStates) ||
      !save.merchantStates.every(isMerchantState) ||
      !Array.isArray(save.receipts) ||
      !save.receipts.every(isTradeReceipt)
    ) {
      return new TradeSystem([]);
    }

    const trade = new TradeSystem(save.lots);
    trade.coin = nonNegativeInteger(save.coin, 0);
    trade.walletRevision = nonNegativeInteger(save.walletRevision, 0);
    trade.inventoryRevision = nonNegativeInteger(save.inventoryRevision, 0);
    trade.quoteSequence = nonNegativeInteger(save.quoteSequence, 0);
    save.merchantStates.forEach((state) => {
      trade.merchantStates.set(state.merchantId, cloneMerchantState(state));
    });
    save.receipts.forEach((receipt) => trade.receipts.set(receipt.transactionId, receipt));
    return trade;
  }

  snapshot(): TradeSnapshot {
    return {
      coin: this.coin,
      walletRevision: this.walletRevision,
      inventoryRevision: this.inventoryRevision,
      quoteSequence: this.quoteSequence,
      lots: [...this.lots.values()].map(cloneLot),
      merchantStates: [...this.merchantStates.values()].map(cloneMerchantState),
    };
  }

  toSave(): TradeSave {
    return {
      schema: TRADE_SAVE_SCHEMA,
      ...this.snapshot(),
      receipts: [...this.receipts.values()],
    };
  }

  getEligibility(merchantId: MerchantId, lotId: string, quantity: number): TradeEligibility {
    const merchant = MERCHANT_DIRECTORY.find((entry) => entry.merchantId === merchantId);
    if (!merchant) return refusal("merchant_not_found");
    if (merchant.status !== "active") return refusal("merchant_unavailable");

    const lot = this.lots.get(lotId);
    if (!lot) return refusal("item_unknown");
    const item = TRADE_ITEMS[lot.itemId];
    if (!item) return refusal("item_unknown");
    if (item.category === "knowledge" || item.category === "quest" || lot.originKind === "quest") {
      return refusal("knowledge_or_quest_bound");
    }
    if (lot.reserved || lot.equipped) return refusal("reserved_or_equipped");
    if (!lot.economyEligible || lot.originKind === "manifested" || lot.originKind === "relief" ||
        lot.originKind === "legacy_unknown" || lot.naturalFraction !== 1) {
      return refusal("origin_not_natural");
    }
    if (lot.originKind === "borrowed") return refusal("stolen_or_ownership_invalid");
    if (lot.originKind === "stolen" && merchant.ownershipPolicy !== "fence") return refusal("stolen_or_ownership_invalid");
    if (!item.playerSellable) return refusal("item_not_sellable");
    const categoryAccepted = merchant.buys.includes(item.category) || merchant.conditionallyBuys?.includes(item.category);
    if (!categoryAccepted) return refusal("category_not_accepted");
    if (item.category === "raw_hide") return refusal("prologue_restriction");
    if (freshnessRejected(lot.freshness)) return refusal("freshness_rejected");
    if (!Number.isFinite(lot.contaminationMu) || lot.contaminationMu !== 0) return refusal("contamination_rejected");
    if (!Number.isFinite(lot.qualityMultiplier) || lot.qualityMultiplier < 0.5 || lot.qualityMultiplier > 1) return refusal("quality_too_low");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > lot.quantity) return refusal("insufficient_quantity");

    const state = this.merchantStates.get(merchantId);
    if (!state) return refusal("merchant_not_found");
    const remainingFullPrice = Math.max(0, merchant.fullPriceUnitsPerRestock - state.soldUnitsSinceRestock);
    if (remainingFullPrice <= 0 && merchant.excessPolicy === "reject") return refusal("demand_exhausted");
    if (quantity > remainingFullPrice && merchant.excessPolicy === "reject") return refusal("demand_exhausted");
    const price = this.calculatePrice(item, lot, merchant, state, quantity);
    if (price.totalCoin <= 0 || price.hasZeroCoinTier) return refusal("zero_price");
    return refusal("eligible");
  }

  createSellQuote(merchantId: MerchantId, lotId: string, quantity: number, worldTick: number): QuoteResult {
    const eligibility = this.getEligibility(merchantId, lotId, quantity);
    if (!eligibility.eligible) return { accepted: false, eligibility };

    const merchant = MERCHANT_DIRECTORY.find((entry) => entry.merchantId === merchantId);
    const lot = this.lots.get(lotId);
    const state = this.merchantStates.get(merchantId);
    if (!merchant || !lot || !state) return { accepted: false, eligibility: refusal("merchant_not_found") };
    const item = TRADE_ITEMS[lot.itemId];
    if (!item) return { accepted: false, eligibility: refusal("item_unknown") };

    const price = this.calculatePrice(item, lot, merchant, state, quantity);
    this.quoteSequence += 1;
    const quote: SellQuote = {
      quoteId: `quote.${merchantId}.${state.demandRevision}.${lot.ownershipRevision}.${this.quoteSequence}`,
      merchantId,
      lotId,
      itemId: item.itemId,
      itemNameZh: item.nameZh,
      quantity,
      fullPriceUnits: price.fullPriceUnits,
      excessUnits: price.excessUnits,
      totalCoin: price.totalCoin,
      issuedWorldTick: worldTick,
      expiresWorldTick: worldTick + 300,
      merchantDemandRevision: state.demandRevision,
      lotOwnershipRevision: lot.ownershipRevision,
      lotFreshnessRevision: lot.freshnessRevision,
      walletRevision: this.walletRevision,
      inventoryRevision: this.inventoryRevision,
      consumed: false,
    };
    this.quotes.set(quote.quoteId, quote);
    return { accepted: true, eligibility, quote: { ...quote } };
  }

  commitSellQuote(quoteId: string, transactionId: string, worldTick: number): CommitResult {
    const previous = this.receipts.get(transactionId);
    if (previous) {
      if (previous.quoteId !== quoteId) {
        return this.commitResult(false, false, "transaction_payload_conflict", "同一交易 ID 不能用于不同报价。", previous);
      }
      return this.commitResult(false, true, "duplicate_transaction", "这笔交易已经结算过。", previous);
    }
    const quote = this.quotes.get(quoteId);
    if (!quote) return this.commitResult(false, false, "quote_not_found", "报价不存在；读档后需要重新询价。");
    if (quote.consumed) return this.commitResult(false, false, "quote_consumed", "报价已经使用过。");
    if (worldTick > quote.expiresWorldTick) return this.commitResult(false, false, "quote_expired", "报价已超过五分钟，请重新询价。");

    const lot = this.lots.get(quote.lotId);
    const state = this.merchantStates.get(quote.merchantId);
    if (!lot || !state || state.demandRevision !== quote.merchantDemandRevision || this.inventoryRevision !== quote.inventoryRevision) {
      return this.commitResult(false, false, "quote_stale", "库存或商人需求已经变化，请重新询价。");
    }
    if (this.walletRevision !== quote.walletRevision) {
      return this.commitResult(false, false, "wallet_revision_conflict", "钱袋版本发生冲突，请重新询价。");
    }
    if (
      lot.ownershipRevision !== quote.lotOwnershipRevision ||
      lot.freshnessRevision !== quote.lotFreshnessRevision ||
      lot.quantity < quote.quantity
    ) {
      return this.commitResult(false, false, "lot_revision_conflict", "物品堆状态发生变化，请重新询价。");
    }

    lot.quantity -= quote.quantity;
    lot.ownershipRevision += 1;
    this.inventoryRevision += 1;
    this.coin += quote.totalCoin;
    this.walletRevision += 1;
    state.soldUnitsSinceRestock += quote.quantity;
    state.demandRevision += 1;
    quote.consumed = true;

    const receipt: TradeReceipt = {
      transactionId,
      quoteId,
      merchantId: quote.merchantId,
      lotId: quote.lotId,
      itemId: quote.itemId,
      quantity: quote.quantity,
      coinDelta: quote.totalCoin,
      committedWorldTick: worldTick,
    };
    this.receipts.set(transactionId, receipt);
    return this.commitResult(true, false, "committed", `交易完成：硬币 +${quote.totalCoin}。`, receipt);
  }

  private calculatePrice(
    item: TradeItemDefinition,
    lot: TradeLot,
    merchant: MerchantDefinition,
    state: MerchantState,
    quantity: number,
  ): { fullPriceUnits: number; excessUnits: number; totalCoin: number; hasZeroCoinTier: boolean } {
    const remainingFullPrice = Math.max(0, merchant.fullPriceUnitsPerRestock - state.soldUnitsSinceRestock);
    const fullPriceUnits = Math.min(quantity, remainingFullPrice);
    const excessUnits = Math.max(0, quantity - fullPriceUnits);
    const baseFactor = item.baseSellCoin * freshnessMultiplier(lot.freshness) * lot.qualityMultiplier;
    const fullSubtotal = Math.floor(baseFactor * fullPriceUnits);
    const excessSubtotal = merchant.excessPolicy === "quarter_price" ? Math.floor(baseFactor * excessUnits * 0.25) : 0;
    const hasZeroCoinTier = (fullPriceUnits > 0 && fullSubtotal <= 0) || (excessUnits > 0 && excessSubtotal <= 0);
    return { fullPriceUnits, excessUnits, totalCoin: fullSubtotal + excessSubtotal, hasZeroCoinTier };
  }

  private commitResult(
    committed: boolean,
    duplicate: boolean,
    reason: TradeCommitReason,
    messageZh: string,
    receipt?: TradeReceipt,
  ): CommitResult {
    return { committed, duplicate, reason, messageZh, receipt, snapshot: this.snapshot() };
  }
}

const refusal = (reason: TradeRefusalReason): TradeEligibility => ({
  eligible: reason === "eligible",
  reason,
  messageZh: REFUSAL_MESSAGES[reason],
});

const nonNegativeInteger = (candidate: unknown, fallback: number): number =>
  typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0 ? candidate : fallback;

const TRADE_ORIGINS: readonly TradeOrigin[] = [
  "natural", "manifested", "relief", "quest", "borrowed", "stolen", "legacy_unknown",
];
const TRADE_FRESHNESS_STATES: readonly TradeFreshness[] = [
  "fresh",
  "aging",
  "near_spoil",
  "spoiled",
  "decomposed",
  "raw",
  "cured",
  "stable",
  "rotten",
];

const isTradeLot = (candidate: unknown): candidate is TradeLot => {
  if (!candidate || typeof candidate !== "object") return false;
  const lot = candidate as Partial<TradeLot>;
  return (
    typeof lot.lotId === "string" &&
    lot.lotId.length > 0 &&
    typeof lot.itemId === "string" &&
    TRADE_ITEMS[lot.itemId] !== undefined &&
    Array.isArray(lot.sourceLotIds) &&
    lot.sourceLotIds.every((sourceLotId) => typeof sourceLotId === "string" && sourceLotId.length > 0) &&
    (lot.legalOwnerId === null || typeof lot.legalOwnerId === "string") &&
    (lot.stolenFromId === null || typeof lot.stolenFromId === "string") &&
    (lot.processingTransactionId === null || typeof lot.processingTransactionId === "string") &&
    Number.isInteger(lot.quantity) &&
    Number(lot.quantity) >= 0 &&
    TRADE_ORIGINS.includes(lot.originKind as TradeOrigin) &&
    TRADE_FRESHNESS_STATES.includes(lot.freshness as TradeFreshness) &&
    typeof lot.naturalFraction === "number" &&
    Number.isFinite(lot.naturalFraction) &&
    lot.naturalFraction >= 0 &&
    lot.naturalFraction <= 1 &&
    typeof lot.qualityMultiplier === "number" &&
    Number.isFinite(lot.qualityMultiplier) &&
    lot.qualityMultiplier >= 0.25 &&
    lot.qualityMultiplier <= 1 &&
    typeof lot.contaminationMu === "number" &&
    Number.isFinite(lot.contaminationMu) &&
    lot.contaminationMu >= 0 &&
    typeof lot.economyEligible === "boolean" &&
    typeof lot.reserved === "boolean" &&
    typeof lot.equipped === "boolean" &&
    Number.isInteger(lot.ownershipRevision) &&
    Number(lot.ownershipRevision) >= 0 &&
    Number.isInteger(lot.freshnessRevision) &&
    Number(lot.freshnessRevision) >= 0
  );
};

const isMerchantState = (candidate: unknown): candidate is MerchantState => {
  if (!candidate || typeof candidate !== "object") return false;
  const state = candidate as Partial<MerchantState>;
  return (
    typeof state.merchantId === "string" &&
    MERCHANT_DIRECTORY.some((merchant) => merchant.merchantId === state.merchantId) &&
    Number.isInteger(state.demandRevision) &&
    Number(state.demandRevision) >= 0 &&
    Number.isInteger(state.soldUnitsSinceRestock) &&
    Number(state.soldUnitsSinceRestock) >= 0 &&
    state.priceTableVersion === TRADE_PRICE_TABLE_VERSION
  );
};

const isTradeReceipt = (candidate: unknown): candidate is TradeReceipt => {
  if (!candidate || typeof candidate !== "object") return false;
  const receipt = candidate as Partial<TradeReceipt>;
  return (
    typeof receipt.transactionId === "string" &&
    receipt.transactionId.length > 0 &&
    typeof receipt.quoteId === "string" &&
    typeof receipt.merchantId === "string" &&
    MERCHANT_DIRECTORY.some((merchant) => merchant.merchantId === receipt.merchantId) &&
    typeof receipt.lotId === "string" &&
    typeof receipt.itemId === "string" &&
    Number.isInteger(receipt.quantity) &&
    Number(receipt.quantity) > 0 &&
    Number.isInteger(receipt.coinDelta) &&
    Number(receipt.coinDelta) >= 0 &&
    Number.isFinite(receipt.committedWorldTick) &&
    Number(receipt.committedWorldTick) >= 0
  );
};
