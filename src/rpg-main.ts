import generatedRuntimeArtifact from "./generated/content-runtime.v0.1.json";
import {
  readRuntimeSceneManifestIndex,
  type RuntimeSceneManifest,
  type RuntimeSceneNpcManifest,
} from "./content/runtime-scene-manifest";
import { readRuntimePortraitCameraProfile } from "./content/runtime-camera-profile";
import {
  PrologueFlowSession,
  type PrologueFlowAction,
  type PrologueFlowSafeRangeCompileResult,
  type PrologueFlowSafeRangeView,
  type PrologueFlowOldMineView,
  type PrologueFlowCore120LearningView,
  type PrologueFlowP0LearningView,
  type PrologueFlowSnapshot,
} from "./game/prologue-flow";
import {
  PROLOGUE_SETTLEMENT_SCENE_ID,
  PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS,
  type SettlementDialogueNode,
  type SettlementDialogueTopic,
} from "./game/prologue-settlement";
import {
  PROLOGUE_ARRIVAL_SCENE_ID,
  PROLOGUE_STREAM_SCENE_ID,
} from "./game/prologue-arrival-stream";
import { WORLD_TILE_SIZE_PX, type CameraState, type RuntimeInput, type RuntimeSnapshot } from "./runtime";
import { projectPortraitCamera } from "./runtime/portrait-camera";
import type { BrowserGameSessionWalCoordinator } from "./persistence/browser-game-session-wal";
import { bootstrapBrowserPrologue, persistBrowserPrologueCheckpoint } from "./persistence/browser-prologue-persistence";
import { nextInventoryConsumptionSequence } from "./session/adapters";
import { createRpgEconomyUi, type EconomyUiCommand } from "./rpg-economy-ui";
import {
  createRpgInfrastructureUi,
  type InfrastructureUiCommand,
} from "./rpg-infrastructure-ui";
import {
  createRpgCisternUi,
  type CisternUiCommand,
} from "./rpg-cistern-ui";
import { PROLOGUE_WILDLIFE_SCENE_ID } from "./game/prologue-wildlife";
import {
  createRpgReturnFlowUi,
  type ReturnFlowUiCommand,
} from "./rpg-return-flow-ui";
import {
  createRpgWildlifeUi,
  type WildlifeUiCommand,
} from "./rpg-wildlife-ui";
import {
  createRpgSafeRangeUi,
  type SafeRangeUiCommand,
} from "./rpg-safe-range-ui";
import { createRpgP0LearningUi, type P0LearningUiCommand } from "./rpg-p0-learning-ui";
import { createRpgCore120LearningUi, type Core120LearningUiCommand } from "./rpg-core120-learning-ui";
import { createRpgOldMineUi, type OldMineUiCommand } from "./rpg-old-mine-ui";
import { BrowserPrologueTelemetry } from "./acceptance/browser-prologue-telemetry";
import type { PrologueActivityKind } from "./content/runtime-prologue-acceptance-manifest";

type GlyphPhase = "undiscovered" | "discovered" | "activated";
type Tone = "neutral" | "success" | "warning" | "danger";
type ToolAction = "stone" | "log" | "soil";
type SurveyAction = "accept" | "submit";

interface UiResult {
  readonly accepted: boolean;
  readonly message: string;
  readonly tone: Tone;
}

const CAMERA_PROFILE = readRuntimePortraitCameraProfile(generatedRuntimeArtifact);
const WIDTH = CAMERA_PROFILE.viewportPx.width;
const HEIGHT = CAMERA_PROFILE.viewportPx.height;
const STORAGE_KEY = "tokipona.rpg.prologue.v0.3";
const COMPANION_STORAGE_KEY = `${STORAGE_KEY}.cross-save-wal`;
const TELEMETRY_STORAGE_KEY = `${STORAGE_KEY}.telemetry`;
const STORAGE_KEYS = Object.freeze({
  checkpointKey: STORAGE_KEY,
  companionKey: COMPANION_STORAGE_KEY,
  legacyCheckpointKeys: Object.freeze(["tokipona.rpg.prologue.v0.2"]),
});
const GLYPH_POSITION = Object.freeze({ x: 144, y: 100 });
const GLYPH_RADIUS = 40;
const SCENES = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;
const SETTLEMENT_SCENE = requiredScene(PROLOGUE_SETTLEMENT_SCENE_ID);

class FlowBrowserPort {
  private remainderTicks = 0;
  private safeRangeCompileResultValue: PrologueFlowSafeRangeCompileResult | null = null;
  private persistedSessionRevision: number;

  private constructor(private readonly flow: PrologueFlowSession, private readonly coordinator: BrowserGameSessionWalCoordinator) {
    this.flow.attachCrossSaveTransactionCoordinator(coordinator);
    this.persistedSessionRevision = coordinator.readSession().snapshot().revision;
  }

  static bootstrap(): FlowBrowserPort {
    const runtime = bootstrapBrowserPrologue(localStorage, STORAGE_KEYS,
      () => `browser-prologue-${globalThis.crypto.randomUUID()}`);
    return new FlowBrowserPort(runtime.flow, runtime.coordinator);
  }

  advanceFrame(seconds: number, input: RuntimeInput): void {
    this.remainderTicks += Math.min(0.1, Math.max(0, seconds)) * 60;
    const ticks = Math.floor(this.remainderTicks);
    if (ticks === 0) return;
    this.remainderTicks -= ticks;
    this.flow.advanceTicks(ticks, input);
    this.persistIfChanged();
  }

  snapshot(): PrologueFlowSnapshot {
    return this.flow.snapshot();
  }

  sessionId(): string {
    return this.flow.session.sessionId;
  }

  safeRangeView(): PrologueFlowSafeRangeView {
    return this.flow.safeRangeView();
  }

  p0LearningView(): PrologueFlowP0LearningView {
    return this.flow.p0LearningView();
  }

  core120LearningView(): PrologueFlowCore120LearningView {
    return this.flow.core120LearningView();
  }

  oldMineView(): PrologueFlowOldMineView {
    return this.flow.oldMineView();
  }

  oldMine(command: OldMineUiCommand): UiResult {
    return command.kind === "enter_old_mine"
      ? flowResult(this.flow.enterOldMine(nextId("old-mine-enter")), "进入旧矿门槛；和平章节出口已提交。", "success")
      : flowResult(this.flow.returnOldMineToSettlement(nextId("old-mine-return")), "从旧矿门槛返回 N02 聚落。", "neutral");
  }

  p0Learning(command: P0LearningUiCommand): UiResult {
    return flowResult(this.flow.performP0LearningAction(nextId("p0-learning"), command.actionId),
      `P0 learning action committed: ${command.actionId}`);
  }

  core120Learning(command: Core120LearningUiCommand): UiResult {
    return flowResult(this.flow.performCore120LearningAction(nextId("core120-learning"), command.actionId),
      `Core-120 learning action committed: ${command.actionId}`);
  }

  interact(): UiResult {
    const snapshot = this.snapshot();
    if (snapshot.mode === "settlement") {
      return ui(true, "聚落中的交谈与设施操作在下方的 N02 面板中进行。", "neutral");
    }
    if (!isNearGlyph(snapshot.runtime)) return ui(false, "附近没有可互动的词语遗迹。", "warning");
    const phase = glyphPhase(snapshot);
    if (phase === "undiscovered") {
      return flowResult(
        this.flow.discoverTelo("browser.n01.glyph.telo"),
        "你辨认出了 telo（水）；它仍需调谐才能用于魔法。",
      );
    }
    return ui(true, phase === "discovered" ? "telo 正等待调谐。" : "telo 已完成调谐。", "neutral");
  }

  attuneOrManifest(): UiResult {
    const snapshot = this.snapshot();
    if (snapshot.mode !== "arrival_stream" || snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID) {
      return ui(false, "这项 telo 操作只在 N01 林缘浅溪可用。", "warning");
    }
    const phase = glyphPhase(snapshot);
    if (phase === "undiscovered") return ui(false, "先靠近浅溪中的词语遗迹并辨认 telo。", "warning");
    if (phase === "discovered") {
      return flowResult(
        this.flow.attuneTelo(nextId("attune-telo"), "browser.n01.glyph.telo"),
        "调谐完成；正式 sitelen pona 字形仍在素材审批门禁之后。",
      );
    }
    return flowResult(
      this.flow.manifestTelo(nextId("manifest-telo")),
      "显化 telo：水从静止开始下落，并在重力作用下流入浅溪（消耗 5 MP）。",
    );
  }

  tool(action: ToolAction): UiResult {
    const snapshot = this.snapshot();
    if (snapshot.mode !== "arrival_stream" || snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID) {
      return ui(false, "这组三条独立工具路线只在 N01 可用。", "warning");
    }
    const result = action === "stone"
      ? this.flow.pushLooseStone(nextId("push-stone"))
      : action === "log"
        ? this.flow.placeRottenLog(nextId("place-log"))
        : this.flow.digSoftSoil(nextId("dig-soil"));
    const message = action === "stone"
      ? "已移动松石，形成一条无需魔法的独立踏脚路线。"
      : action === "log"
        ? "已放置朽木，形成一条无需魔法的独立上坡路线。"
        : "已挖开软土，形成一条无需魔法的独立浅水路线。";
    return flowResult(result, message);
  }

  talk(npcId: string, topic: SettlementDialogueTopic, clarify: boolean): UiResult {
    const result = clarify ? this.flow.clarify(npcId, topic) : this.flow.talk(npcId, topic);
    if (!result.accepted || result.result?.node === null || result.result === null) {
      return flowResult(result, "");
    }
    renderDialogue(result.result.node);
    return ui(
      true,
      clarify ? "澄清内容已显示；这次问询不会写入存档。" : "对方回答了你的结构化问题。",
      "success",
    );
  }

  usePublicRelief(): UiResult {
    return flowResult(
      this.flow.usePublicRelief(nextId("public-relief")),
      "已使用公共井水与一份植物餐。公共救济免费，不进入商人库存，也不需要 coin。",
    );
  }

  meditate(answerAccepted: boolean): UiResult {
    return flowResult(
      this.flow.meditate(nextId("meditation"), answerAccepted),
      answerAccepted
        ? "冥想完成：获得基础 MP 恢复；本次引导不生成语言学习证据。"
        : "答案不正确，但仍获得基础 MP 恢复；错误答案不会生成语言学习证据。",
      answerAccepted ? "success" : "warning",
    );
  }

  survey(action: SurveyAction): UiResult {
    const result = action === "accept"
      ? this.flow.acceptSurveyJob(nextId("survey-accept"))
      : this.flow.submitSurveyJob(nextId("survey-submit"));
    const message = action === "accept"
      ? "已接受不需要战斗或魔法的三标记巡查工作。"
      : "巡查结果已提交；一次性 coin 奖励已通过回执记入钱包。";
    return flowResult(result, message);
  }

  inspectSurveyMarker(markerId: string): UiResult {
    const result = this.flow.inspectSurveyMarker(nextId(`survey-marker-${markerId}`), markerId);
    return flowResult(result, `已记录勘测标记：${markerLabel(markerId)}。`);
  }

  openTrade(): UiResult {
    const result = this.flow.openTrade(nextId("trade-open"));
    if (!result.accepted || result.result === null) return flowResult(result, "");
    renderTradeAuthorization(result.result.tradeEntryId, result.result.merchantIds);
    return ui(true, "交易入口已由场景清单授权；当前灰盒只显示商人 allowlist，不执行成交。", "neutral");
  }

  economy(command: EconomyUiCommand): UiResult {
    switch (command.kind) {
      case "accept_gift": return flowResult(this.flow.acceptGiftedRabbitCarcass(nextId("economy-gift")), "Gifted carcass committed through WAL.");
      case "harvest_meat": return flowResult(this.flow.harvestGiftedMeat(nextId("economy-harvest")), "Harvest committed through WAL.");
      case "start_cooking": return flowResult(this.flow.startCooking(nextId("economy-cook-start")), "Cooking work order started.");
      case "work_cooking": return flowResult(this.flow.workCooking(nextId("economy-cook-work")), "Cooking work committed.");
      case "complete_cooking": return flowResult(this.flow.completeCooking(nextId("economy-cook-complete")), "Cooking completion committed.");
      case "claim_cooking": return flowResult(this.flow.claimCooking(nextId("economy-cook-claim")), "Cooked output claimed.");
      case "consume_cooked": return flowResult(this.flow.consumeCooked(nextInventoryConsumptionSequence(this.flow.session)), "Cooked food consumed.");
      case "issue_sell": {
        const result = this.flow.issueVerifiedSellQuote({ ...command, operationId: nextId("economy-sell-quote") });
        if (result.accepted && result.result?.accepted) economyUi.rememberQuote(result.result.quote.quoteId);
        return flowResult(result, "Verified sell quote issued for this runtime only.");
      }
      case "confirm_sell": {
        const result = this.flow.confirmVerifiedSellQuote(command.quoteId);
        if (result.accepted && result.result?.accepted) economyUi.clearQuote();
        return flowResult(result, "Verified sale committed through WAL.");
      }
    }
  }

  infrastructure(command: InfrastructureUiCommand): UiResult {
    switch (command.kind) {
      case "enter_waterwheel":
        return flowResult(this.flow.enterWaterwheel(nextId("enter-waterwheel")), "Entered N03 waterwheel.");
      case "observe_wheel":
        return flowResult(this.flow.observeWaterwheelPhysics(nextId("observe-wheel"), {
          angularVelocityRpm: 12,
          elapsedTicks: 120,
          downstreamFlowBand: "safe",
          overflowContact: false,
        }), "Recorded 120 stable wheel ticks.");
      case "waterwheel_solution":
        return flowResult(this.flow.completeWaterwheelSolution(nextId(`wheel-${command.solutionId}`), command.solutionId, command.evidence), "Waterwheel solution committed.");
      case "enter_service":
        return flowResult(this.flow.enterServiceChannel(nextId("enter-service")), "Entered N04 service channel.");
      case "return_waterwheel":
        return flowResult(this.flow.returnToWaterwheel(nextId("return-waterwheel")), "Returned to N03.");
      case "return_settlement":
        return flowResult(this.flow.returnToSettlement(nextId("return-settlement")), "Returned to N02.");
      case "discover_tawa":
        return flowResult(this.flow.discoverTawa(nextId("discover-tawa")), "Discovered tawa.");
      case "attune_tawa":
        return flowResult(this.flow.attuneTawa(nextId("attune-tawa")), "Attuned tawa.");
      case "ground_tawa":
        return flowResult(this.flow.groundTawa(nextId("ground-tawa"), {
          solutionId: command.inService ? "service.open_bypass_valve" : "waterwheel.move_flume",
          promptLevel: 1,
          predictedMotionCorrect: true,
          worldOutcomeContribution: true,
          toolBypass: false,
          answerVisible: false,
        }), "Recorded low-hint tawa grounding evidence.");
      case "service_solution":
        return flowResult(this.flow.completeServiceSolution(nextId(`service-${command.solutionId}`), command.solutionId, command.evidence), "Service-channel route committed.");
      case "read_o":
        return flowResult(this.flow.readGrammarOSign(nextId("read-o")), "Read the receptive o sign.");
      case "accept_o":
        return flowResult(this.flow.acceptGrammarOReceptivePrompt(nextId("accept-o"), true), "Accepted the o prompt without mastery.");
      case "recover_softlock":
        return flowResult(this.flow.recoverInfrastructureSoftLock(nextId("recover-infrastructure")), "Recovered the local route within the 60-second contract.");
    }
  }

  cistern(command: CisternUiCommand): UiResult {
    switch (command.kind) {
      case "enter_cistern":
        return flowResult(this.flow.enterCistern(nextId("enter-cistern")), "Entered N05 high cistern.");
      case "expression":
        return flowResult(this.flow.setCisternExpression(command.expression), `Expression: ${command.expression}.`, "neutral");
      case "direction":
        return flowResult(this.flow.setCisternDirection(command.direction), `Direction: ${command.direction}.`, "neutral");
      case "target_current":
        return flowResult(this.flow.targetCisternCurrentReceiver(), "Targeted the current receiver.", "neutral");
      case "nudge_target": {
        const anchor = this.snapshot().cistern?.cistern.targetAnchorPx;
        if (!anchor) return ui(false, "N05 target anchor is unavailable.", "warning");
        return flowResult(this.flow.setCisternTargetAnchorPx({
          x: anchor.x + command.dx,
          y: anchor.y + command.dy,
        }), "Adjusted the target anchor.", "neutral");
      }
      case "preview":
        return flowResult(this.flow.previewCisternCast(), "Preview frozen. Review MP, length and safety before confirm.", "neutral");
      case "confirm": {
        const result = this.flow.confirmCisternCast(nextId("cistern-cast"));
        const reason = delegateReason(result.result);
        if (result.accepted && (reason === "incorrect_length" || reason === "receiver_predicate_false")) {
          return ui(true, `Cast executed, but the stage did not pass: ${reason}.`, "warning");
        }
        return flowResult(result, "Cast resolved against receiver world predicates.");
      }
      case "cancel":
        return flowResult(this.flow.cancelCisternCast(), "Preview cancelled.", "neutral");
      case "tool_family":
        return flowResult(this.flow.completeCisternFamilyWithTools(nextId("cistern-tool-family"), command.familyId), "Tool route completed with zero language evidence.", "warning");
      case "discover_word":
        return flowResult(this.flow.discoverCisternLengthWord(nextId(`discover-${command.wordId}`), command.wordId), `Discovered ${command.wordId}.`);
      case "attune_word":
        return flowResult(this.flow.attuneCisternLengthWord(nextId(`attune-${command.wordId}`), command.wordId), `Attuned ${command.wordId}.`);
      case "natural_recovery":
        return flowResult(this.flow.applyCisternNaturalRecovery(nextId("cistern-natural-recovery"), command.ticks), "Natural MP recovery applied.");
      case "meditate":
        return flowResult(this.flow.meditateCistern(nextId("cistern-meditation"), command.answerAccepted, false), "Meditation restored MP without fabricating task evidence.", command.answerAccepted ? "success" : "warning");
      case "checkpoint_recovery":
        return flowResult(this.flow.recoverCisternAtCheckpoint(nextId("cistern-checkpoint-recovery")), "Checkpoint MP recovery applied.");
      case "reset_checkpoint":
        return flowResult(this.flow.resetToCheckpoint(nextId("cistern-checkpoint-reset")), "Returned to the authoritative N05 checkpoint.", "neutral");
      case "softlock_recovery":
        return flowResult(this.flow.recoverCisternSoftLock(nextId("cistern-softlock-recovery")), "N05 local route recovered within its contract.");
      case "enter_return_flow":
        return flowResult(this.flow.enterReturnFlow(nextId("enter-return-flow")), "进入 N07 回流水路。", "neutral");
    }
  }

  wildlife(command: WildlifeUiCommand): UiResult {
    switch (command.kind) {
      case "enter_wildlife":
        return flowResult(this.flow.enterWildlife(nextId("enter-wildlife-" + command.source), command.source), "进入 N06 可选生态支路。", "neutral");
      case "observe_warning":
        return flowResult(this.flow.observeWildlife(nextId("wildlife-observe")), "完整观察了狐狸的警告。", "neutral");
      case "retreat_safely":
        return flowResult(this.flow.retreatWildlife(nextId("wildlife-retreat")), "退到警戒区外，并保持逃生通道畅通。", "success");
      case "wait_for_real_exit":
        return flowResult(this.flow.waitForWildlifeExit(nextId("wildlife-real-exit")), "狐狸到达真实逃生出口。", "success");
      case "make_low_force_noise":
        return flowResult(this.flow.makeWildlifeNoise(nextId("wildlife-noise")), "敲击空木：0 伤害，警觉增加。", "neutral");
      case "use_wood_staff":
        return flowResult(this.flow.useWildlifeStaff(nextId("wildlife-staff")), "在距离标记处举杖后退；未击中狐狸。", "neutral");
      case "open_old_latch":
        return flowResult(this.flow.openWildlifeLatch(nextId("wildlife-latch")), "旧闩已在安全条件下打开。", "success");
      case "mark_upper_line":
        return flowResult(this.flow.markWildlifeDigLine(nextId("wildlife-dig-mark")), "标记了兽穴上方的安全挖掘线。", "neutral");
      case "dig_upper_bypass":
        return flowResult(this.flow.digWildlifeUpperBypass(nextId("wildlife-dig")), "在狐狸离巢后挖开上方绕路。", "neutral");
      case "install_braces":
        return flowResult(this.flow.installWildlifeBraces(nextId("wildlife-braces")), "安装支撑，将塌落控制在限制内。", "success");
      case "complete_route":
        return flowResult(this.flow.completeWildlifeRoute(nextId("wildlife-route-" + command.solutionId), command.solutionId), "N06 零击杀路线已打开。", "success");
      case "return_to_service":
        return flowResult(this.flow.returnWildlifeToService(nextId("wildlife-return-service")), "返回 N04 维修水道。", "neutral");
      case "go_to_cistern":
        return flowResult(this.flow.handoffWildlifeToCistern(nextId("wildlife-to-cistern")), "从绕道前往 N05 高位蓄水池。", "success");
      case "recover_softlock":
        return flowResult(this.flow.recoverWildlifeSoftLock(nextId("wildlife-recover")), "在 60 秒恢复契约内重新开放安全通路。", "neutral");
      case "reset_checkpoint":
        return flowResult(this.flow.resetWildlifeCheckpoint(nextId("wildlife-reset")), "回到 N06 权威存档点。", "neutral");
    }
  }

  safeRangeCompileResult(): PrologueFlowSafeRangeCompileResult | null {
    return this.safeRangeCompileResultValue;
  }

  safeRange(command: SafeRangeUiCommand): UiResult {
    switch (command.kind) {
      case "perform_qualification_action":
        return flowResult(this.flow.performAttackQualificationAction(
          nextId(`attack-qualification-${command.actionId}`), command.actionId),
        "N02 校准动作已由语义 ID 提交。", "neutral");
      case "calibrate_attack_capacity":
        return flowResult(this.flow.calibrateAttackCapacity(nextId("attack-capacity-calibration")),
          "攻击表达容量校准已提交。", "success");
      case "grant_range_trial_permission":
        return flowResult(this.flow.grantRangeTrialPermission(nextId("range-trial-permission")),
          "N08 靶场许可已核发。", "success");
      case "enter_safe_range": {
        this.safeRangeCompileResultValue = null;
        return flowResult(this.flow.enterSafeRange(nextId("safe-range-enter")),
          "进入 N08 惰性材料靶场。", "neutral");
      }
      case "compile": {
        const result = this.flow.compileSafeRange({
          targetClass: command.targetClass,
          promptLevel: command.promptLevel,
          waterSource: command.waterSource,
        });
        this.safeRangeCompileResultValue = result.result;
        return flowResult(result, "结构化表达已编译；预览只包含显示报价与 previewId。", "neutral");
      }
      case "execute": {
        const result = this.flow.executeSafeRange(nextId("safe-range-execute"), command.previewId);
        this.safeRangeCompileResultValue = null;
        return flowResult(result, "受控水力已作用于所选惰性靶具。", "success");
      }
      case "inspect_material_table":
        return flowResult(this.flow.inspectSafeRangeMaterialTable(nextId("safe-range-table")),
          "四种惰性材料的碰撞记录已检查。", "success");
      case "return_settlement": {
        const result = this.flow.safeRangeToSettlement(nextId("safe-range-return"));
        if (result.accepted) this.safeRangeCompileResultValue = null;
        return flowResult(result, "返回 N02 聚落。", "neutral");
      }
      case "recover_softlock": {
        this.safeRangeCompileResultValue = null;
        return flowResult(this.flow.recoverSafeRangeSoftLock(nextId("safe-range-recover")),
          "N08 局部靶场已恢复；学习与完成记录保持不变。", "neutral");
      }
      case "reset_checkpoint": {
        this.safeRangeCompileResultValue = null;
        return flowResult(this.flow.resetSafeRangeCheckpoint(nextId("safe-range-reset")),
          "已返回 N08 权威检查点。", "neutral");
      }
    }
  }
  returnFlow(command: ReturnFlowUiCommand): UiResult {
    switch (command.kind) {
      case "perform_action":
        return flowResult(this.flow.performReturnFlowAction(nextId(`return-flow-action-${command.actionId}`), command.actionId), "路线步骤已记录。", "neutral");
      case "discover_wawa":
        return flowResult(this.flow.discoverReturnFlowWawa(nextId("return-flow-discover-wawa")), "从惰性水力指示器中辨认了 wawa。", "success");
      case "attune_wawa":
        return flowResult(this.flow.attuneReturnFlowWawa(nextId("return-flow-attune-wawa")), "wawa 调谐完成。", "success");
      case "complete_solution":
        return flowResult(this.flow.completeReturnFlowSolution(nextId(`return-flow-complete-${command.solutionId}`), command.solutionId), "回流水路修复已原子提交。", "success");
      case "ground_wawa":
        return flowResult(this.flow.groundReturnFlowWawa(nextId(`return-flow-ground-h${command.promptLevel}`), {
          solutionId: command.solutionId, promptLevel: command.promptLevel,
          predictedForceContrastCorrect: true, worldOutcomeContribution: true, answerVisible: false,
        }), `wawa H${command.promptLevel} 非战斗语义落地已记录。`, "success");
      case "return_settlement":
        return flowResult(this.flow.returnFlowToSettlement(nextId("return-flow-to-settlement")), "沿回流水路返回 N02 聚落。", "success");
      case "recover_softlock":
        return flowResult(this.flow.resetArea(nextId("return-flow-recover")), "N07 局部路线已在恢复契约内重置。", "neutral");
      case "reset_checkpoint":
        return flowResult(this.flow.resetToCheckpoint(nextId("return-flow-checkpoint-reset")), "已返回 N07 检查点。", "neutral");
    }
  }

  setCheckpoint(): UiResult {
    return flowResult(
      this.flow.setCheckpoint(nextId("checkpoint"), "checkpoint.prologue.browser"),
      "检查点已记录。",
    );
  }

  resetToCheckpoint(): UiResult {
    return flowResult(
      this.flow.resetToCheckpoint(nextId("checkpoint-reset")),
      "已回到检查点；学习、钱包和任务状态保持不变。",
      "neutral",
    );
  }

  resetArea(): UiResult {
    return flowResult(
      this.flow.resetArea(nextId("area-reset")),
      "区域的瞬时物理状态已重置，持久进度保持不变。",
      "neutral",
    );
  }

  toSave(): unknown {
    return this.persistIfChanged(true);
  }

  persistIfChanged(force = false): unknown | null {
    const revision = this.flow.session.snapshot().revision;
    if (!force && revision === this.persistedSessionRevision) return null;
    const envelope = persistBrowserPrologueCheckpoint(
      localStorage,
      STORAGE_KEYS,
      { flow: this.flow, coordinator: this.coordinator },
    );
    this.persistedSessionRevision = revision;
    return envelope;
  }
}

const app = required<HTMLElement>("#app");

app.innerHTML = `
  <div class="rpg-shell">
    <header class="rpg-header">
      <div><p class="eyebrow">PROLOGUE / PLAYABLE GREYBOX</p><h1>言语遗迹</h1></div>
      <a href="/">返回项目入口</a>
    </header>
    <section class="notice" role="note">
      当前字形和发光效果是程序化占位，不是获批的 sitelen pona 正式素材；字形动画层与环境背景层保持独立。
    </section>
    <section class="hud" aria-label="游戏状态">
      <div class="hud-row"><strong data-ui="scene">--</strong><span data-ui="tick">tick --</span></div>
      <div class="meter-row">
        <span>生命 <i class="meter meter-health"><b></b></i> <em>100 / 100</em></span>
        <span>MP <i class="meter meter-mp"><b data-ui="mp-fill"></b></i> <em data-ui="mp">--</em></span>
        <span>coin <em data-ui="coin">0</em></span>
      </div>
      <p data-ui="objective">--</p>
    </section>
    <section class="game-frame" aria-label="竖版像素探索场景">
      <canvas id="rpg-canvas" width="${WIDTH}" height="${HEIGHT}" tabindex="0"></canvas>
      <div class="scene-shade" aria-hidden="true"></div>
      <div class="interaction-hint" data-ui="hint">继续探索</div>
    </section>
    <section class="telo-panel arrival-only" data-phase="undiscovered" aria-label="telo 学习状态">
      <div class="glyph-placeholder" aria-hidden="true"><span>TELO</span></div>
      <div><p class="eyebrow">WORD RELIC / WATER TYPE</p><strong data-ui="glyph-state">尚未发现</strong>
        <small>发现 → 调谐 → 主动显化 → 环境验证；正式字形尚未导出</small></div>
      <button type="button" data-action="telo" disabled>调谐 telo</button>
    </section>
    <section class="settlement-panel settlement-only" hidden aria-label="N02 聚落服务与工作">
      <div class="panel-heading">
        <div><p class="eyebrow">N02 / SETTLEMENT ORIENTATION</p><h2>聚落问询</h2></div>
        <strong data-ui="task-stage">工作：可接受</strong>
      </div>
      <div class="npc-grid" data-ui="npcs">${SETTLEMENT_SCENE.npcs.map(npcCard).join("")}</div>
      <article class="dialogue-box" aria-live="polite">
        <p class="eyebrow">STRUCTURED DIALOGUE / READ ONLY</p>
        <strong data-ui="dialogue-title">选择一名居民与一个主题</strong>
        <ul data-ui="dialogue-facts"><li>问询与澄清不会写入存档。</li></ul>
        <div class="clarify-row" data-ui="clarify"></div>
      </article>
      <div class="service-grid" aria-label="公共服务与冥想">
        <button type="button" data-settlement="relief">公共救济：井水＋植物餐</button>
        <button type="button" data-settlement="meditate-correct">冥想：正确回答</button>
        <button type="button" data-settlement="meditate-wrong">冥想：错误回答也仅基础回血</button>
      </div>
      <div class="survey-markers" aria-label="三标记巡查">
        ${PROLOGUE_SETTLEMENT_SURVEY_MARKER_IDS.map((markerId) =>
          `<button type="button" data-marker="${escapeHtml(markerId)}" data-inspected="false">${escapeHtml(markerLabel(markerId))}</button>`
        ).join("")}
      </div>
      <div class="job-row" aria-label="非暴力三标记巡查工作">
        <button type="button" data-job="accept">接受巡查</button>
        <button type="button" data-job="submit">提交并领取 coin</button>
        <button type="button" data-trade-open>打开交易入口（只读）</button>
      </div>
      <p class="trade-authorization" data-ui="trade-authorization">交易尚未打开；灰盒不会执行购买或售卖。</p>
      <small class="learning-separation">基础 MP 恢复与学习证据严格分离：回答正确或错误都不会在本次引导中生成证据。</small>
    </section>
    <p class="status" data-ui="status" data-tone="neutral" aria-live="polite">方向键或 A/D 移动，空格/W 跳跃，E 互动。</p>
    <section class="command-row command-row-tools arrival-only" aria-label="三条独立非魔法路线">
      <button type="button" data-tool="stone">移动松石</button>
      <button type="button" data-tool="log">放置朽木</button>
      <button type="button" data-tool="soil">挖开软土</button>
    </section>
    <section class="command-row" aria-label="游戏操作">
      <button type="button" data-action="interact">互动 [E]</button>
      <button type="button" data-action="checkpoint">设检查点</button>
      <button type="button" data-action="reset">回检查点 [R]</button>
      <button type="button" data-action="save">保存</button>
      <button type="button" data-action="load">读取</button>
      <button type="button" data-action="area-reset">重置区域</button>
    </section>
    <section class="touch-controls" aria-label="触屏操作">
      <button type="button" data-hold="left" aria-label="向左移动">◀</button>
      <button type="button" data-hold="right" aria-label="向右移动">▶</button>
      <button type="button" data-hold="jump">跳跃</button>
      <button type="button" data-touch-interact>互动</button>
    </section>
  </div>`;

const canvas = required<HTMLCanvasElement>("#rpg-canvas");
const context = canvasContext(canvas);
const sceneLabel = required<HTMLElement>('[data-ui="scene"]');
const tickLabel = required<HTMLElement>('[data-ui="tick"]');
const mpLabel = required<HTMLElement>('[data-ui="mp"]');
const mpFill = required<HTMLElement>('[data-ui="mp-fill"]');
const coinLabel = required<HTMLElement>('[data-ui="coin"]');
const objectiveLabel = required<HTMLElement>('[data-ui="objective"]');
const hintLabel = required<HTMLElement>('[data-ui="hint"]');
const glyphPanel = required<HTMLElement>(".telo-panel");
const glyphState = required<HTMLElement>('[data-ui="glyph-state"]');
const teloButton = required<HTMLButtonElement>('[data-action="telo"]');
const settlementPanel = required<HTMLElement>(".settlement-panel");
const taskStageLabel = required<HTMLElement>('[data-ui="task-stage"]');
const statusLabel = required<HTMLElement>('[data-ui="status"]');

let lastTelemetryAtMs = 0;
let port = FlowBrowserPort.bootstrap();
let telemetry = bootstrapTelemetry(port, telemetryNow());
const infrastructureUi = createRpgInfrastructureUi((command) => run(() => port.infrastructure(command)));
const cisternUi = createRpgCisternUi((command) => run(() => port.cistern(command)));
const wildlifeUi = createRpgWildlifeUi((command) => run(() => port.wildlife(command)));
const economyUi = createRpgEconomyUi((command) => run(() => port.economy(command)));
const returnFlowUi = createRpgReturnFlowUi((command) => run(() => port.returnFlow(command)));
const safeRangeUi = createRpgSafeRangeUi((command) => run(() => port.safeRange(command)));
const p0LearningUi = createRpgP0LearningUi((command) => run(() => port.p0Learning(command)));
const core120LearningUi = createRpgCore120LearningUi((command) => run(() => port.core120Learning(command)));
const oldMineUi = createRpgOldMineUi((command) => run(() => port.oldMine(command)));
let priorTime = performance.now();
let activationStarted: number | null = null;
let jumpQueued = false;
const held = new Set<string>();
const pointerHolds = new Map<string, Set<number>>();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

bindInputs();
bindPersistenceLifecycle();
reducedMotion.addEventListener("change", (event) => {
  if (event.matches) activationStarted = null;
});
requestAnimationFrame(frame);

function frame(now: number): void {
  // A requestAnimationFrame timestamp describes the start of the frame and can
  // be fractionally older than a performance.now() sample taken while the app
  // was bootstrapping. Keep the browser frame clock monotonic so the exclusive
  // telemetry timer never observes a boundary before its initial sample.
  const monotonicNow = Math.max(now, priorTime);
  const elapsed = Math.min(0.1, Math.max(0, (monotonicNow - priorTime) / 1_000));
  priorTime = monotonicNow;
  try {
    port.advanceFrame(elapsed, {
      moveX: (isHeld("right") ? 1 : 0) - (isHeld("left") ? 1 : 0),
      jump: jumpQueued || isHeld("jump"),
    });
  } catch (error: unknown) {
    setStatus(errorMessage(error, "运行时推进失败。"), "danger");
  }
  jumpQueued = false;
  const snapshot = port.snapshot();
  telemetry.observe({
    sceneId: snapshot.runtime.sceneId,
    worldTick: snapshot.runtime.tick,
    active: browserActivityKind(),
    atMs: telemetryTimestamp(monotonicNow),
  });
  render(snapshot, monotonicNow);
  requestAnimationFrame(frame);
}

function render(snapshot: PrologueFlowSnapshot, now: number): void {
  app.dataset.mode = snapshot.mode;
  app.dataset.sceneId = snapshot.runtime.sceneId;
  infrastructureUi.render(snapshot);
  cisternUi.render(snapshot);
  wildlifeUi.render(snapshot);
  economyUi.render(snapshot);
  returnFlowUi.render(snapshot);
  safeRangeUi.render(port.safeRangeView(), port.safeRangeCompileResult());
  p0LearningUi.render(port.p0LearningView());
  core120LearningUi.render(port.core120LearningView());
  oldMineUi.render(port.oldMineView());
  const scene = requiredScene(snapshot.runtime.sceneId);
  drawWorld(snapshot, scene);
  sceneLabel.textContent = sceneTitle(snapshot.runtime.sceneId);
  tickLabel.textContent = `tick ${snapshot.runtime.tick} · 击杀 ${snapshot.killCount}`;
  mpLabel.textContent = `${snapshot.session.mp.currentMp} / ${snapshot.session.mp.maxMp}`;
  mpFill.style.width = `${Math.max(0, Math.min(100, (snapshot.session.mp.currentMp / snapshot.session.mp.maxMp) * 100))}%`;
  coinLabel.textContent = String(snapshot.session.economy.coin);
  objectiveLabel.textContent = objective(snapshot);
  required<HTMLButtonElement>('[data-action="checkpoint"]').disabled =
    snapshot.mode === "cistern" || snapshot.mode === "wildlife" || snapshot.mode === "return_flow" ||
    snapshot.mode === "safe_range" || snapshot.mode === "old_mine";

  const inSettlement = snapshot.mode === "settlement";
  settlementPanel.hidden = !inSettlement;
  for (const element of document.querySelectorAll<HTMLElement>(".arrival-only")) {
    element.hidden = snapshot.mode !== "arrival_stream";
  }

  if (snapshot.mode === "cistern") {
    hintLabel.textContent = "Use the N05 panel to preview, confirm, recover or reset.";
    hintLabel.dataset.active = "true";
    return;
  }

  if (snapshot.mode === "wildlife") {
    hintLabel.textContent = "使用 N06 面板观察警告、后退并选择零击杀路线。";
    hintLabel.dataset.active = "true";
    return;
  }

  if (snapshot.mode === "return_flow") {
    hintLabel.textContent = "使用 N07 面板：观察指示器、学习 wawa、修复水路并返回聚落。";
    hintLabel.dataset.active = "true";
    return;
  }
  if (snapshot.mode === "safe_range") {
    hintLabel.textContent = "使用 N08 面板选择惰性靶具，检查结构化预览后执行。";
    hintLabel.dataset.active = "true";
    return;
  }
  if (snapshot.mode === "old_mine") {
    hintLabel.textContent = "旧矿和平门槛已完成；可保存、读取或返回 N02 聚落。";
    hintLabel.dataset.active = "true";
    return;
  }

  if (inSettlement) {
    hintLabel.textContent = "从下方面板选择居民、公共服务或巡查工作";
    hintLabel.dataset.active = "true";
    const stage = snapshot.settlement?.orientationTask.stage ?? "available";
    taskStageLabel.textContent = `工作：${stageLabel(stage)} · 奖励 ${snapshot.settlement?.orientationTask.rewardCoin ?? 0} coin`;
    updateSurveyButtons(stage, snapshot.settlement?.orientationTask.surveyedMarkerIds ?? []);
    return;
  }

  const phase = glyphPhase(snapshot);
  const nearGlyph = isNearGlyph(snapshot.runtime);
  hintLabel.textContent = nearGlyph ? "E / 互动：观察潮湿的词语遗迹" : "继续探索";
  hintLabel.dataset.active = String(nearGlyph);
  glyphPanel.dataset.phase = phase;
  glyphState.textContent = phaseLabel(phase);
  teloButton.disabled = phase === "undiscovered" || snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID;
  teloButton.textContent = phase === "activated" ? "显化 telo · 5 MP" : "调谐 telo";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.disabled = snapshot.runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID || Boolean(snapshot.arrival?.routeReady);
  }
  if (reducedMotion.matches) {
    activationStarted = null;
    glyphPanel.style.setProperty("--activation", phase === "activated" ? "1" : "0");
  } else if (activationStarted !== null) {
    const activation = Math.min(1, (now - activationStarted) / 1_200);
    glyphPanel.style.setProperty("--activation", String(activation));
    if (activation >= 1) activationStarted = null;
  } else {
    glyphPanel.style.setProperty("--activation", phase === "activated" ? "1" : "0");
  }
}

function drawWorld(snapshot: PrologueFlowSnapshot, scene: RuntimeSceneManifest): void {
  const camera = projectPortraitCamera(CAMERA_PROFILE, snapshot.runtime, scene);
  context.imageSmoothingEnabled = false;
  context.fillStyle = snapshot.mode === "settlement" ? "#0d0b08" : snapshot.runtime.sceneId === PROLOGUE_ARRIVAL_SCENE_ID ? "#08090c" : "#07100e";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawBackdrop(snapshot.runtime.tick, snapshot.mode);
  const firstX = Math.max(0, Math.floor(camera.x / WORLD_TILE_SIZE_PX));
  const lastX = Math.min(scene.collisionRows[0]!.length - 1, Math.ceil((camera.x + camera.width) / WORLD_TILE_SIZE_PX));
  const firstY = Math.max(0, Math.floor(camera.y / WORLD_TILE_SIZE_PX));
  const lastY = Math.min(scene.collisionRows.length - 1, Math.ceil((camera.y + camera.height) / WORLD_TILE_SIZE_PX));
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      if (scene.collisionRows[y]![x] !== "#") continue;
      rockTile(x * WORLD_TILE_SIZE_PX - camera.x, y * WORLD_TILE_SIZE_PX - camera.y, x, y, snapshot.mode);
    }
  }
  if (snapshot.runtime.sceneId === PROLOGUE_STREAM_SCENE_ID && snapshot.arrival) {
    context.fillStyle = "#154866";
    context.fillRect(
      Math.round(snapshot.arrival.shallowWater.leftPx - camera.x),
      Math.round(snapshot.arrival.shallowWater.surfaceYPx - camera.y),
      snapshot.arrival.shallowWater.rightPx - snapshot.arrival.shallowWater.leftPx,
      16,
    );
    drawGlyph(GLYPH_POSITION.x - camera.x, GLYPH_POSITION.y - camera.y, glyphPhase(snapshot));
    for (const water of snapshot.arrival.manifestedWater) {
      context.fillStyle = water.settled ? "#65c7ed" : "#a4e8f9";
      context.fillRect(Math.round(water.position.x - camera.x), Math.round(water.position.y - camera.y), 3, 3);
    }
  }
  if (snapshot.mode === "settlement") {
    drawSettlementFacilities(scene, camera);
    drawSettlementNpcs(scene, camera);
    drawSurveyMarkers(scene, camera);
  }
  if (snapshot.mode === "wildlife" && snapshot.wildlife) drawWildlifeFox(snapshot, camera);
  drawPlayer(snapshot.runtime, camera);
}

function drawWildlifeFox(snapshot: PrologueFlowSnapshot, camera: CameraState): void {
  if (!snapshot.wildlife) return;
  const position = snapshot.wildlife.foxPositionTiles;
  const x = Math.round(position.x * WORLD_TILE_SIZE_PX - camera.x);
  const y = Math.round(position.y * WORLD_TILE_SIZE_PX - camera.y);
  const fleeing = snapshot.wildlife.fox.behaviorState === "flee" || snapshot.wildlife.fox.behaviorState === "return";
  context.fillStyle = fleeing ? "#b88b53" : "#9d673f";
  context.fillRect(x + 3, y + 7, 11, 6);
  context.fillRect(x + 9, y + 4, 6, 6);
  context.fillRect(x + 10, y + 2, 2, 3);
  context.fillRect(x + 14, y + 2, 2, 3);
  context.fillStyle = "#e4d1a7";
  context.fillRect(x + 14, y + 7, 1, 1);
  context.fillStyle = "#6f412f";
  context.fillRect(x, y + 8, 5, 2);
}

function drawBackdrop(tick: number, mode: PrologueFlowSnapshot["mode"]): void {
  context.fillStyle = mode === "settlement" ? "#18150e" : "#111316";
  const shimmer = Math.floor(tick / 30) % 2;
  for (let index = 0; index < 30; index += 1) {
    const x = (index * 37) % WIDTH;
    const y = 25 + ((index * 71) % (HEIGHT - 50));
    context.fillRect(x, y, (index + shimmer) % 4 === 0 ? 2 : 1, 1);
  }
}

function rockTile(
  x: number,
  y: number,
  tileX: number,
  tileY: number,
  mode: PrologueFlowSnapshot["mode"],
): void {
  const colors = mode === "settlement"
    ? ["#342d20", "#433725", "#2b2a21", "#4b3b27"] as const
    : ["#26241f", "#2e2b24", "#363128", "#1e2020"] as const;
  context.fillStyle = colors[Math.abs(tileX * 7 + tileY * 13) % colors.length]!;
  context.fillRect(Math.floor(x), Math.floor(y), 16, 16);
  context.fillStyle = (tileX + tileY) % 3 === 0 ? "#6a4b2c" : "#151719";
  context.fillRect(Math.floor(x + ((tileX * 5) % 11)), Math.floor(y + ((tileY * 3) % 11)), 2, 2);
}

function drawSettlementFacilities(scene: RuntimeSceneManifest, camera: CameraState): void {
  const worldWidth = scene.sizeTiles.width * WORLD_TILE_SIZE_PX;
  const worldHeight = scene.sizeTiles.height * WORLD_TILE_SIZE_PX;
  const facilityX = [0.22, 0.5, 0.78];
  scene.facilities.slice(0, 3).forEach((facility, index) => {
    const x = Math.round(worldWidth * facilityX[index]! - camera.x);
    const y = Math.round(worldHeight - 64 - camera.y);
    context.fillStyle = facility.publicRelief ? "#315c66" : "#59472d";
    context.fillRect(x, y, 13, 13);
    context.fillStyle = "#bda96c";
    context.fillRect(x + 2, y - 3, 9, 3);
  });
}

function drawSettlementNpcs(scene: RuntimeSceneManifest, camera: CameraState): void {
  const worldWidth = scene.sizeTiles.width * WORLD_TILE_SIZE_PX;
  const worldHeight = scene.sizeTiles.height * WORLD_TILE_SIZE_PX;
  scene.npcs.forEach((npc, index) => {
    const x = Math.round(worldWidth * (0.32 + index * 0.18) - camera.x);
    const y = Math.round(worldHeight - 60 - camera.y);
    context.fillStyle = ["#bd9457", "#738c62", "#9671a4"][index] ?? "#a88c63";
    context.fillRect(x + 2, y, 7, 11);
    context.fillStyle = "#e3cfa8";
    context.fillRect(x + 3, y + 2, 5, 4);
    context.fillStyle = "#d1b866";
    context.fillRect(x, y - 3, 11, 2);
    context.fillStyle = "#8c7b58";
    context.fillRect(x + 5, y - 8, 1, 4);
    void npc;
  });
}

function drawSurveyMarkers(scene: RuntimeSceneManifest, camera: CameraState): void {
  const worldWidth = scene.sizeTiles.width * WORLD_TILE_SIZE_PX;
  const worldHeight = scene.sizeTiles.height * WORLD_TILE_SIZE_PX;
  for (const ratio of [0.18, 0.55, 0.86]) {
    const x = Math.round(worldWidth * ratio - camera.x);
    const y = Math.round(worldHeight - 67 - camera.y);
    context.fillStyle = "#b88a3a";
    context.fillRect(x, y, 2, 17);
    context.fillStyle = "#d9c27e";
    context.fillRect(x - 2, y, 6, 3);
  }
}

function drawPlayer(runtime: RuntimeSnapshot, camera: CameraState): void {
  const x = Math.round(runtime.player.position.x - camera.x);
  const y = Math.round(runtime.player.position.y - camera.y);
  context.fillStyle = "#211632";
  context.fillRect(x + 2, y, 8, 3);
  context.fillStyle = "#7744a5";
  context.fillRect(x + 3, y + 3, 6, 7);
  context.fillStyle = "#9d72c3";
  context.fillRect(x + 1, y + 9, 10, 4);
  context.fillStyle = "#e8d3aa";
  context.fillRect(x + 5, y + 5, 2, 2);
}

function drawGlyph(x: number, y: number, phase: GlyphPhase): void {
  context.fillStyle = "#171c1e";
  context.fillRect(Math.round(x - 11), Math.round(y - 26), 22, 27);
  context.fillStyle = phase === "activated" ? "#9beaff" : phase === "discovered" ? "#52737b" : "#30383a";
  context.fillRect(Math.round(x - 8), Math.round(y - 22), 16, 18);
  if (phase === "undiscovered") return;
  context.fillStyle = phase === "activated" ? "#d9f9ff" : "#83979a";
  context.fillRect(Math.round(x - 2), Math.round(y - 18), 4, 10);
  context.fillRect(Math.round(x - 5), Math.round(y - 10), 10, 3);
}

function bindInputs(): void {
  window.addEventListener("keydown", (event) => {
    if (preservesNativeControl(event.target)) return;
    if (event.repeat && ["e", "r"].includes(event.key.toLowerCase())) return;
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.add("left");
    else if (key === "d" || key === "arrowright") held.add("right");
    else if (key === "w" || key === "arrowup" || key === " ") jumpQueued = true;
    else if (key === "e") run(() => port.interact());
    else if (key === "r") run(() => port.resetToCheckpoint());
    else return;
    event.preventDefault();
  });
  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "a" || key === "arrowleft") held.delete("left");
    if (key === "d" || key === "arrowright") held.delete("right");
    if (key === "w" || key === "arrowup" || key === " ") held.delete("jump");
  });
  window.addEventListener("blur", clearHeld);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-hold]")) {
    const action = button.dataset.hold;
    if (!action) continue;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const pointers = pointerHolds.get(action) ?? new Set<number>();
      pointers.add(event.pointerId);
      pointerHolds.set(action, pointers);
      if (action === "jump") jumpQueued = true;
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        releasePointerHold(action, event.pointerId);
      }
    });
    const release = (event: PointerEvent): void => {
      releasePointerHold(action, event.pointerId);
      if (event.type !== "lostpointercapture" && button.hasPointerCapture(event.pointerId)) {
        button.releasePointerCapture(event.pointerId);
      }
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  }

  required<HTMLButtonElement>("[data-touch-interact]").addEventListener("click", () => run(() => port.interact()));
  required<HTMLButtonElement>('[data-action="interact"]').addEventListener("click", () => run(() => port.interact()));
  required<HTMLButtonElement>('[data-action="checkpoint"]').addEventListener("click", () => run(() => port.setCheckpoint()));
  required<HTMLButtonElement>('[data-action="reset"]').addEventListener("click", () => run(() => port.resetToCheckpoint()));
  required<HTMLButtonElement>('[data-action="area-reset"]').addEventListener("click", () => run(() => port.resetArea()));
  teloButton.addEventListener("click", () => {
    const before = glyphPhase(port.snapshot());
    const result = port.attuneOrManifest();
    const after = glyphPhase(port.snapshot());
    if (before === "discovered" && after === "activated" && !reducedMotion.matches) {
      activationStarted = performance.now();
    }
    show(result);
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
    button.addEventListener("click", () => run(() => port.tool(requiredDataset(button, "tool") as ToolAction)));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-npc][data-topic]")) {
    button.addEventListener("click", () => run(() => port.talk(
      requiredDataset(button, "npc"),
      requiredDataset(button, "topic") as SettlementDialogueTopic,
      button.dataset.clarify === "true",
    )));
  }
  required<HTMLButtonElement>('[data-settlement="relief"]').addEventListener("click", () => run(() => port.usePublicRelief()));
  required<HTMLButtonElement>('[data-settlement="meditate-correct"]').addEventListener("click", () => run(() => port.meditate(true)));
  required<HTMLButtonElement>('[data-settlement="meditate-wrong"]').addEventListener("click", () => run(() => port.meditate(false)));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-job]")) {
    button.addEventListener("click", () => run(() => port.survey(requiredDataset(button, "job") as SurveyAction)));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-marker]")) {
    button.addEventListener("click", () => run(() => port.inspectSurveyMarker(requiredDataset(button, "marker"))));
  }
  required<HTMLButtonElement>("[data-trade-open]").addEventListener("click", () => run(() => port.openTrade()));
  required<HTMLButtonElement>('[data-action="save"]').addEventListener("click", save);
  required<HTMLButtonElement>('[data-action="load"]').addEventListener("click", load);
}

function bindPersistenceLifecycle(): void {
  const flush = (): void => {
    try {
      port.toSave();
      telemetry.suspend(telemetryNow());
    } catch (error: unknown) {
      setStatus(errorMessage(error, "自动保存失败。"), "danger");
    }
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function save(): void {
  try {
    const save = port.toSave();
    void save; // persistBrowserPrologueCheckpoint already wrote the checked envelope.
    setStatus("存档已写入此浏览器。", "success");
  } catch (error: unknown) {
    setStatus(errorMessage(error, "保存失败。"), "danger");
  }
}

function load(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const companion = localStorage.getItem(COMPANION_STORAGE_KEY);
    if (saved === null && companion === null) {
      setStatus("尚无本地存档。", "warning");
      return;
    }
    const now = telemetryNow();
    telemetry.suspend(now);
    port = FlowBrowserPort.bootstrap();
    telemetry = bootstrapTelemetry(port, now);
    economyUi.clearQuote();
    clearHeld();
    activationStarted = null;
    setStatus("存档已读取。", "success");
  } catch (error: unknown) {
    setStatus(errorMessage(error, "存档无效或本地存储不可用。"), "danger");
  }
}

function bootstrapTelemetry(target: FlowBrowserPort, atMs: number): BrowserPrologueTelemetry {
  const snapshot = target.snapshot();
  return BrowserPrologueTelemetry.bootstrap({
    storage: localStorage,
    key: TELEMETRY_STORAGE_KEY,
    sessionId: target.sessionId(),
    sceneId: snapshot.runtime.sceneId,
    worldTick: snapshot.runtime.tick,
    active: browserActivityKind(),
    atMs,
  });
}

function browserActivityKind(): PrologueActivityKind {
  if (document.hidden || !document.hasFocus()) return "idle";
  const focused = document.activeElement;
  if (focused instanceof Element && focused.closest(".notice, .dialogue-box")) return "long_explanation";
  if (focused instanceof Element && focused.closest(
    ".telo-panel, .p0-learning-panel, .core120-learning-panel, .cistern-panel, .return-flow-panel, .safe-range-panel",
  )) return "language";
  return "world_people_physics";
}

function telemetryNow(): number {
  return telemetryTimestamp(performance.now());
}

function telemetryTimestamp(value: number): number {
  const normalized = Math.max(0, Math.floor(value));
  lastTelemetryAtMs = Math.max(lastTelemetryAtMs, normalized);
  return lastTelemetryAtMs;
}

function renderDialogue(node: SettlementDialogueNode): void {
  required<HTMLElement>('[data-ui="dialogue-title"]').textContent = `${node.professionLabelZh} · ${topicLabel(node.topic)}`;
  const facts = required<HTMLElement>('[data-ui="dialogue-facts"]');
  facts.replaceChildren(...node.facts.map((fact) => {
    const item = document.createElement("li");
    item.textContent = factLabel(fact);
    return item;
  }));
  const clarification = required<HTMLElement>('[data-ui="clarify"]');
  clarification.replaceChildren(...node.clarificationTopics.filter((topic) => topic !== node.topic).map((topic) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `澄清：${topicLabel(topic)}`;
    button.addEventListener("click", () => run(() => port.talk(node.npcId, topic, true)));
    return button;
  }));
}

function npcCard(npc: RuntimeSceneNpcManifest): string {
  const topics = topicsForNpc(npc);
  return `<article class="npc-card">
    <strong>${escapeHtml(npc.professionLabelZh)}</strong>
    <small>${escapeHtml(npc.professionId)}</small>
    <div class="topic-row">${topics.map((topic, index) =>
      `<button type="button" data-npc="${escapeHtml(npc.id)}" data-topic="${topic}"${index === 0 ? "" : ' data-clarify="true"'}>${index === 0 ? "询问" : "澄清"}：${topicLabel(topic)}</button>`
    ).join("")}</div>
  </article>`;
}

function topicsForNpc(npc: RuntimeSceneNpcManifest): readonly SettlementDialogueTopic[] {
  if (npc.professionId === "settlement.supply_trader") return ["role", "trade", "public_services", "directions"];
  return ["role", "work", "public_services", "directions"];
}

function objective(snapshot: PrologueFlowSnapshot): string {
  if (snapshot.mode === "old_mine") {
    return snapshot.oldMine?.chapterComplete
      ? "序章已以零击杀抵达旧矿门槛；可安全返回 N02 或保留存档。"
      : "旧矿门槛记录不完整；请使用恢复路径返回最近检查点。";
  }
  if (snapshot.mode === "safe_range") {
    return snapshot.safeRange?.firstAttackSignatureCompleted
      ? "N08 四种惰性材料对照已完成；可返回 N02。"
      : "在四个惰性靶具上验证结构化水力，并检查材料碰撞表。";
  }
  if (snapshot.mode === "return_flow") {
    if (snapshot.returnFlow?.taskCompleted) {
      return snapshot.returnFlow.wawa.learningState === "grounded"
        ? "N07 已恢复：两项旗标与材质补丁已提交，返回聚落。"
        : "N07 水路已恢复：完成 wawa 的 H0/H1 非战斗语义落地。";
    }
    return "观察惰性指示器，发现并调谐 wawa，再依次完成一条非魔法回流方案。";
  }
  if (snapshot.mode === "wildlife") {
    return snapshot.wildlife?.denRouteOpen
      ? "N06 绕道已打开：返回 N04，或前往 N05；本路线没有击杀与成长奖励。"
      : "读懂警告，安全后退，并从四种零击杀方案中选择一种。";
  }
  if (snapshot.mode === "cistern") {
    const stage = snapshot.cistern?.cistern.stage ?? "unavailable";
    return snapshot.cistern?.completed
      ? "N05 reconnected: all three region flags committed atomically."
      : `N05 stage ${stage}: preview, inspect MP/length, then confirm or use an evidence-free tool route.`;
  }
  if (snapshot.mode === "infrastructure") {
    return snapshot.infrastructure?.serviceChannel.cisternReady
      ? "N04 route ready: enter N05 from the high-cistern panel."
      : "Stabilize the waterwheel and open an N04 material route.";
  }
  if (snapshot.mode === "settlement") {
    const stage = snapshot.settlement?.orientationTask.stage ?? "available";
    return stage === "completed"
      ? "聚落定向完成；公共服务仍可使用，也可继续向居民澄清问题。"
      : `认识三种职业、使用公共服务，并完成非暴力三标记巡查（${stageLabel(stage)}）。`;
  }
  if (snapshot.runtime.sceneId === PROLOGUE_ARRIVAL_SCENE_ID) {
    return "向右穿过山谷抵达台，进入林缘浅溪。";
  }
  if (snapshot.arrival?.routeReady) {
    return `${snapshot.arrival.route === "telo" ? "telo" : "工具"}路线已稳定；向右抵达聚落入口。`;
  }
  const phase = glyphPhase(snapshot);
  if (phase === "undiscovered") return "寻找 telo 遗迹，或从松石、朽木、软土中选择一条独立工具路线。";
  if (phase === "discovered") return "调谐 telo，或选择任一独立工具路线。";
  return "显化 telo 让水落入浅溪，或选择任一独立工具路线。";
}

function glyphPhase(snapshot: PrologueFlowSnapshot): GlyphPhase {
  const telo = snapshot.session.learning.words.telo;
  if (telo?.attunementState === "attuned") return "activated";
  return telo?.discoveryState === "discovered" ? "discovered" : "undiscovered";
}

function isNearGlyph(runtime: RuntimeSnapshot): boolean {
  if (runtime.sceneId !== PROLOGUE_STREAM_SCENE_ID) return false;
  const centerX = runtime.player.position.x + runtime.player.body.width / 2;
  const centerY = runtime.player.position.y + runtime.player.body.height / 2;
  return Math.hypot(centerX - GLYPH_POSITION.x, centerY - GLYPH_POSITION.y) <= GLYPH_RADIUS;
}

function flowResult<T>(
  action: PrologueFlowAction<T>,
  success: string,
  successTone: Tone = "success",
): UiResult {
  if (action.accepted) return ui(true, success || "操作完成。", successTone);
  const delegated = delegateReason(action.result);
  const tone = action.reason === "wrong_mode" || delegated === "wrong_scene" || delegated === "prerequisite_missing"
    ? "warning"
    : "danger";
  return ui(false, `操作未生效：${delegated ?? action.reason}`, tone);
}

function delegateReason(result: unknown): string | null {
  if (typeof result !== "object" || result === null || !("reason" in result)) return null;
  return typeof result.reason === "string" ? result.reason : null;
}

function updateSurveyButtons(
  stage: "available" | "accepted" | "surveyed" | "completed",
  surveyedMarkerIds: readonly string[],
): void {
  required<HTMLButtonElement>('[data-job="accept"]').disabled = stage !== "available";
  required<HTMLButtonElement>('[data-job="submit"]').disabled = stage !== "surveyed";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-marker]")) {
    const markerId = requiredDataset(button, "marker");
    const inspected = surveyedMarkerIds.includes(markerId);
    button.disabled = stage === "available" || stage === "completed" || inspected;
    button.dataset.inspected = String(inspected);
    button.textContent = `${inspected ? "✓ " : ""}${markerLabel(markerId)}`;
  }
}

function markerLabel(markerId: string): string {
  const labels: Readonly<Record<string, string>> = {
    "settlement.survey_marker.public_well": "标记一 · 公共井位置",
    "settlement.survey_marker.meditation_court": "标记二 · 冥想庭磨损",
    "settlement.survey_marker.east_gate": "标记三 · 东门水路",
  };
  return labels[markerId] ?? markerId;
}

function renderTradeAuthorization(tradeEntryId: string | null, merchantIds: readonly string[]): void {
  required<HTMLElement>('[data-ui="trade-authorization"]').textContent = tradeEntryId === null
    ? "交易入口未获授权。"
    : `授权入口：${tradeEntryId}；merchant allowlist：${merchantIds.join("、") || "（空）"}。当前不执行成交。`;
}

function phaseLabel(phase: GlyphPhase): string {
  if (phase === "activated") return "已激活 · 尚待正式字形";
  if (phase === "discovered") return "已发现 · 等待调谐";
  return "尚未发现";
}

function stageLabel(stage: "available" | "accepted" | "surveyed" | "completed"): string {
  return { available: "可接受", accepted: "已接受", surveyed: "已巡查", completed: "已完成" }[stage];
}

function topicLabel(topic: SettlementDialogueTopic): string {
  return {
    role: "职责",
    public_services: "公共服务",
    work: "工作",
    trade: "交易",
    directions: "方向",
  }[topic];
}

function factLabel(fact: string): string {
  const separator = fact.indexOf(":");
  if (separator < 0) return fact;
  const key = fact.slice(0, separator);
  const value = fact.slice(separator + 1);
  const labels: Readonly<Record<string, string>> = {
    profession: "职业",
    function: "职责",
    public_well: "公共井",
    communal_plant_meal: "公共植物餐",
    checkpoint: "检查点",
    repair_board: "维修告示",
    survey_job: "巡查工作",
    reward_coin: "coin 奖励",
    magic_required: "需要魔法",
    trade_entry: "交易入口",
    public_relief: "公共救济",
    canteen_refill: "补充水壶",
    meditation_court: "冥想庭",
    waterwheel_exit: "水车方向",
  };
  return `${labels[key] ?? key}：${value}`;
}

function sceneTitle(sceneId: string): string {
  if (sceneId === "scene.valley.old_mine_threshold") return "旧矿 · 和平章节门槛";
  if (sceneId === "scene.valley.safe_range") return "N08 · 惰性材料靶场";
  if (sceneId === "scene.valley.return_channel") return "N07 · 回流水路";
  if (sceneId === PROLOGUE_WILDLIFE_SCENE_ID) return "N06 · 兽穴绕道";
  const names: Readonly<Record<string, string>> = {
    [PROLOGUE_ARRIVAL_SCENE_ID]: "N00 · 山谷抵达台",
    [PROLOGUE_STREAM_SCENE_ID]: "N01 · 林缘浅溪",
    [PROLOGUE_SETTLEMENT_SCENE_ID]: "N02 · 河谷聚落",
  };
  return names[sceneId] ?? sceneId;
}

function requiredScene(sceneId: string): RuntimeSceneManifest {
  const scene = SCENES[sceneId];
  if (!scene) throw new Error(`Generated scene is missing: ${sceneId}`);
  return scene;
}

function ui(accepted: boolean, message: string, tone: Tone): UiResult {
  return { accepted, message, tone };
}

function run(action: () => UiResult): void {
  try {
    show(action());
  } catch (error: unknown) {
    setStatus(errorMessage(error, "操作失败。"), "danger");
  }
}

function show(result: UiResult): void {
  if (result.accepted) {
    try {
      port.persistIfChanged();
    } catch (error: unknown) {
      setStatus(errorMessage(error, "操作已完成，但自动保存失败。"), "danger");
      return;
    }
  }
  setStatus(result.message, result.tone);
}

function setStatus(message: string, tone: Tone): void {
  statusLabel.textContent = message;
  statusLabel.dataset.tone = tone;
}

let idSequence = 0;
function nextId(kind: string): string {
  idSequence += 1;
  return `rpg.browser.${kind}.${Date.now()}.${idSequence}.${globalThis.crypto.randomUUID()}`;
}

function isHeld(action: string): boolean {
  return held.has(action) || (pointerHolds.get(action)?.size ?? 0) > 0;
}

function releasePointerHold(action: string, pointerId: number): void {
  const pointers = pointerHolds.get(action);
  if (!pointers) return;
  pointers.delete(pointerId);
  if (pointers.size === 0) pointerHolds.delete(action);
}

function clearHeld(): void {
  held.clear();
  pointerHolds.clear();
}

function preservesNativeControl(target: EventTarget | null): boolean {
  return target instanceof Element &&
    target.closest("button, a, input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

function requiredDataset(element: HTMLElement, name: string): string {
  const value = element.dataset[name];
  if (!value) throw new Error(`Missing data-${name}`);
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function canvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const result = target.getContext("2d", { alpha: false });
  if (!result) throw new Error("2D canvas is unavailable");
  return result;
}
