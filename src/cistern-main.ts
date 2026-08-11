import {
  CISTERN_DIRECTIONS,
  CisternDemoController,
} from "./game/cistern-demo";
import { MATERIALS, Material } from "./sim/materials";
import { CisternLearningSession } from "./learning/cistern-session";
import { createCisternBrowserScene } from "./game/cistern-browser-scene";

type PhraseId = "telo_lili" | "telo" | "telo_suli";
type DirectionId =
  | "east"
  | "south_east"
  | "south"
  | "south_west"
  | "west"
  | "north_west"
  | "north"
  | "north_east";
type StatusTone = "neutral" | "ok" | "warning" | "danger";
type ReceiverState = "empty" | "partial" | "satisfied" | "overflow";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PreviewView {
  readonly canConfirm: boolean;
  readonly rejectionCode?: string;
  readonly activationMpRequired: number;
  readonly manifestationCells: readonly Point[];
}

interface ReceiverView {
  readonly receiverId: string;
  readonly stageId: string;
  readonly waterCells: number;
  readonly minimumWaterCells: number;
  readonly capacityCells: number;
  readonly satisfied: boolean;
  readonly latched: boolean;
  readonly isCurrentStage: boolean;
  readonly state: ReceiverState;
}

interface SnapshotView {
  readonly mp: number;
  readonly maxMp: number;
  readonly worldVersion: number;
  readonly stage: string;
  readonly completed: boolean;
  readonly selectedExpression: PhraseId;
  readonly selectedDirection: DirectionId;
  readonly targetAnchorPx: Point;
  readonly pendingPlan: PreviewView | null;
  readonly receivers: readonly ReceiverView[];
}

interface PhraseDefinition {
  readonly id: PhraseId;
  readonly words: string;
  readonly effect: string;
  readonly key: string;
}

interface DirectionDefinition {
  readonly id: DirectionId;
  readonly symbol: string;
  readonly label: string;
  readonly key: string;
}

const browserScene = createCisternBrowserScene();
const WORLD_WIDTH_CELLS = browserScene.widthCells;
const WORLD_HEIGHT_CELLS = browserScene.heightCells;
const CELL_SIZE_PX = browserScene.cellSizePx;
const CANVAS_WIDTH_PX = browserScene.canvasWidthPx;
const CANVAS_HEIGHT_PX = browserScene.canvasHeightPx;
const NATURAL_RECOVERY_INTERVAL_MS = 4_000;
const PHYSICS_TICKS_PER_STEP = 6;

const phrases: readonly PhraseDefinition[] = [
  { id: "telo_lili", words: "telo lili", effect: "较短 · 0.5×", key: "1" },
  { id: "telo", words: "telo", effect: "基准 · 1×", key: "2" },
  { id: "telo_suli", words: "telo suli", effect: "较长 · 2×", key: "3" },
];

const directions: readonly DirectionDefinition[] = [
  { id: "north_west", symbol: "↖", label: "左上", key: "Q" },
  { id: "north", symbol: "↑", label: "上", key: "W" },
  { id: "north_east", symbol: "↗", label: "右上", key: "E" },
  { id: "west", symbol: "←", label: "左", key: "A" },
  { id: "east", symbol: "→", label: "右", key: "D" },
  { id: "south_west", symbol: "↙", label: "左下", key: "Z" },
  { id: "south", symbol: "↓", label: "下", key: "X" },
  { id: "south_east", symbol: "↘", label: "右下", key: "C" },
];

const stageSpecs = browserScene.stageSpecs;
const controller = new CisternDemoController({
  widthCells: browserScene.widthCells,
  heightCells: browserScene.heightCells,
  initialMp: 24,
  maxMp: 26,
  stageSpecs: browserScene.stageSpecs,
  initialWorldEdits: browserScene.initialWorldEdits,
});
const learningSession = new CisternLearningSession({
  playerSaveId: "cistern.browser.local",
  expressionCapacity: 2,
});
let recoverySequence = 0;
let pendingCommandId: string | null = null;

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("Missing #app mount point");
}

app.innerHTML = `
  <div class="cistern-shell">
    <header class="page-head">
      <div>
        <p class="eyebrow">L-01 · independent greybox</p>
        <h1>高位蓄水槽</h1>
      </div>
      <a class="back-link" href="/">返回项目入口</a>
    </header>

    <p class="asset-notice" role="note">
      字形正式素材尚未接入。本页只显示拉丁词与程序化材料灰盒，不复制私有素材库中的 sitelen pona 字形或贴图。
    </p>

    <section class="hud" aria-label="施法状态">
      <div class="mana-row">
        <span class="section-label">当前 MP</span>
        <strong class="mana-label">--</strong>
      </div>
      <span class="world-version">世界版本 --</span>
      <div class="selection-readout">
        <span>词组 <strong data-readout="phrase">--</strong></span>
        <span>方向 <strong data-readout="direction">--</strong></span>
        <span>目标 <strong data-readout="anchor">--</strong></span>
      </div>
    </section>

    <div class="play-layout">
      <section class="viewport-panel" aria-label="竖版高位蓄水槽场景">
        <div class="viewport-frame">
          <canvas
            id="cistern-canvas"
            width="${CANVAS_WIDTH_PX}"
            height="${CANVAS_HEIGHT_PX}"
            tabindex="0"
            aria-label="高位蓄水槽像素灰盒。点击或触摸可移动施法目标。"
          ></canvas>
          <span class="canvas-caption">135×240 cells · 2px</span>
        </div>
      </section>

      <aside class="control-panel" aria-label="施法控制">
        <section class="control-group">
          <p class="section-label">01 · 选择词组</p>
          <div class="phrase-grid">
            ${phrases.map(phraseButton).join("")}
          </div>
        </section>

        <section class="control-group">
          <p class="section-label">02 · 选择八方向</p>
          <div class="direction-grid">
            ${directionButton("north_west")}
            ${directionButton("north")}
            ${directionButton("north_east")}
            ${directionButton("west")}
            <span class="direction-origin" aria-hidden="true">YOU</span>
            ${directionButton("east")}
            ${directionButton("south_west")}
            ${directionButton("south")}
            ${directionButton("south_east")}
          </div>
        </section>

        <section class="control-group">
          <p class="section-label">03 · 对准、预览、确认</p>
          <div class="action-grid">
            <button class="action-button" type="button" data-action="target">对准当前槽</button>
            <button class="action-button" type="button" data-action="preview">预览 [P]</button>
            <button class="action-button" type="button" data-action="confirm" disabled>确认 [↵]</button>
            <button class="action-button" type="button" data-action="cancel" disabled>取消 [Esc]</button>
          </div>
          <p class="status-line" data-tone="neutral" aria-live="polite">
            对准当前接收槽，再选择词组与方向进行预览。
          </p>
        </section>

        <section class="control-group">
          <p class="section-label">三个接收槽</p>
          <div class="receivers"></div>
        </section>

        <section class="control-group">
          <p class="section-label">恢复与物理</p>
          <div class="action-grid">
            <button class="action-button" type="button" data-action="meditate">基础冥想 +3 MP</button>
            <button class="action-button" type="button" data-action="physics">推进物理 ×${PHYSICS_TICKS_PER_STEP}</button>
          </div>
          <p class="recovery-note">
            基础冥想无需答对且不写学习证据。DEV 灰盒自然回复使用无存档、非权威 UI 时钟，每 4 秒尝试 +0.25 MP，预览期间暂停。
          </p>
        </section>
      </aside>
    </div>

    <footer class="footer-tools">
      <button class="reset-button" type="button" data-action="reset">重置场景 [R]</button>
      <p>画布逐格读取控制器材料；不使用独立背景图、平滑采样或正式字形素材。</p>
    </footer>
  </div>
`;

const canvas = requiredElement<HTMLCanvasElement>("#cistern-canvas");
const context = requiredCanvasContext(canvas);
context.imageSmoothingEnabled = false;

const manaLabel = requiredElement<HTMLElement>(".mana-label");
const worldVersionLabel = requiredElement<HTMLElement>(".world-version");
const phraseReadout = requiredElement<HTMLElement>('[data-readout="phrase"]');
const directionReadout = requiredElement<HTMLElement>('[data-readout="direction"]');
const anchorReadout = requiredElement<HTMLElement>('[data-readout="anchor"]');
const statusLine = requiredElement<HTMLElement>(".status-line");
const receiverList = requiredElement<HTMLElement>(".receivers");
const confirmButton = requiredElement<HTMLButtonElement>('[data-action="confirm"]');
const cancelButton = requiredElement<HTMLButtonElement>('[data-action="cancel"]');
const meditationButton = requiredElement<HTMLButtonElement>('[data-action="meditate"]');
const physicsButton = requiredElement<HTMLButtonElement>('[data-action="physics"]');

let snapshot = readSnapshot();
bindControls();
render(snapshot);
const naturalRecoveryTimerId = window.setInterval(runNaturalRecovery, NATURAL_RECOVERY_INTERVAL_MS);
window.addEventListener("pagehide", () => window.clearInterval(naturalRecoveryTimerId), { once: true });

function phraseButton(phrase: PhraseDefinition): string {
  return `
    <button
      class="phrase-button"
      type="button"
      data-phrase="${phrase.id}"
      aria-pressed="false"
    >
      <span>
        <span class="phrase-main">${phrase.words}</span>
        <span class="phrase-meta">${phrase.effect}</span>
      </span>
      <span class="key-hint">[${phrase.key}]</span>
    </button>`;
}

function directionButton(id: DirectionId): string {
  const direction = directions.find((candidate) => candidate.id === id);
  if (!direction) {
    throw new Error(`Unknown direction: ${id}`);
  }
  return `
    <button
      class="direction-button"
      type="button"
      data-direction="${direction.id}"
      aria-label="${direction.label}，快捷键 ${direction.key}"
      aria-pressed="false"
      title="${direction.label} [${direction.key}]"
    >${direction.symbol}</button>`;
}

function bindControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-phrase]")) {
    button.addEventListener("click", () => {
      const expression = button.dataset.phrase as PhraseId;
      runAction(() => controller.setExpression(expression), "已选择词组，请预览。", "neutral");
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-direction]")) {
    button.addEventListener("click", () => {
      const direction = button.dataset.direction as DirectionId;
      if (!Object.hasOwn(CISTERN_DIRECTIONS, direction)) {
        setStatus("未知方向。", "danger");
        return;
      }
      runAction(() => controller.setDirection(direction), "已改变方向，请重新预览。", "neutral");
    });
  }

  requiredElement<HTMLButtonElement>('[data-action="target"]').addEventListener("click", () => {
    runAction(() => controller.targetCurrentReceiver(), "已对准当前接收槽，请预览。", "neutral");
  });
  requiredElement<HTMLButtonElement>('[data-action="preview"]').addEventListener("click", previewCast);
  confirmButton.addEventListener("click", confirmCast);
  cancelButton.addEventListener("click", cancelPreview);
  meditationButton.addEventListener("click", recoverByMeditation);
  physicsButton.addEventListener("click", advancePhysics);
  requiredElement<HTMLButtonElement>('[data-action="reset"]').addEventListener("click", resetScene);

  canvas.addEventListener("pointerdown", (event) => {
    const bounds = canvas.getBoundingClientRect();
    const rawX = Math.floor(((event.clientX - bounds.left) * canvas.width) / bounds.width);
    const rawY = Math.floor(((event.clientY - bounds.top) * canvas.height) / bounds.height);
    const targetAnchorPx = {
      x: clamp(Math.floor(rawX / CELL_SIZE_PX) * CELL_SIZE_PX, 0, canvas.width - CELL_SIZE_PX),
      y: clamp(Math.floor(rawY / CELL_SIZE_PX) * CELL_SIZE_PX, 0, canvas.height - CELL_SIZE_PX),
    };
    runAction(
      () => controller.setTargetAnchorPx(targetAnchorPx),
      `目标移动到 ${targetAnchorPx.x}, ${targetAnchorPx.y}；请重新预览。`,
      "neutral",
    );
  });

  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    const key = event.key.toLowerCase();
    const phrase = phrases.find((candidate) => candidate.key === key);
    const direction = directions.find((candidate) => candidate.key.toLowerCase() === key);
    if (phrase) {
      event.preventDefault();
      runAction(() => controller.setExpression(phrase.id), "已选择词组，请预览。", "neutral");
    } else if (direction) {
      event.preventDefault();
      runAction(() => controller.setDirection(direction.id), "已改变方向，请重新预览。", "neutral");
    } else if (key === "p") {
      event.preventDefault();
      previewCast();
    } else if (event.key === "Enter" && !confirmButton.disabled) {
      event.preventDefault();
      confirmCast();
    } else if (event.key === "Escape" && !cancelButton.disabled) {
      event.preventDefault();
      cancelPreview();
    } else if (key === "r") {
      event.preventDefault();
      resetScene();
    }
  });
}

function previewCast(): void {
  try {
    const result = controller.beginPreview([]);
    snapshot = projectSnapshot(result.snapshot);
    render(snapshot);
    if (!result.accepted) {
      setStatus(result.rejectionCode ?? "预览被控制器拒绝。", "warning");
      return;
    }
    pendingCommandId ??= `cistern.cast.ui.${globalThis.crypto.randomUUID()}`;
    if (!result.plan?.canConfirm) {
      setStatus(result.plan?.rejectionCode ?? "当前预览不可确认。", "warning");
      return;
    }
    setStatus("预览已生成；确认前不会写入材料世界。", "ok");
  } catch (error: unknown) {
    snapshot = readSnapshot();
    render(snapshot);
    setStatus(error instanceof Error ? error.message : "预览失败。", "danger");
  }
}

function confirmCast(): void {
  if (pendingCommandId === null) {
    setStatus("没有可确认的预览命令。", "warning");
    return;
  }
  try {
    const result = controller.confirmPending(pendingCommandId, []);
    snapshot = projectSnapshot(result.snapshot);
    render(snapshot);
    if (!result.accepted) {
      setStatus(
        result.execution?.rejectionCode ?? result.rejectionCode ?? "确认被控制器拒绝。",
        "warning",
      );
      return;
    }
    pendingCommandId = null;
    setStatus("施法已确认；材料与接收槽状态来自控制器快照。", "ok");
  } catch (error: unknown) {
    snapshot = readSnapshot();
    render(snapshot);
    setStatus(error instanceof Error ? error.message : "确认失败。", "danger");
  }
}

function cancelPreview(): void {
  try {
    const next = controller.cancelPending();
    pendingCommandId = null;
    snapshot = projectSnapshot(next);
    render(snapshot);
    setStatus("预览已取消，材料世界没有变化。", "neutral");
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : "取消预览失败。", "danger");
  }
}

function resetScene(): void {
  try {
    const next = controller.reset();
    pendingCommandId = null;
    snapshot = projectSnapshot(next);
    render(snapshot);
    setStatus("场景、MP 与接收槽已由控制器重置。", "neutral");
  } catch (error: unknown) {
    setStatus(error instanceof Error ? error.message : "重置失败。", "danger");
  }
}

function recoverByMeditation(): void {
  const proposal = learningSession.proposeMeditationRecovery({
    recoveryId: nextRecoveryId("meditation"),
    answerAccepted: false,
    evidenceEligible: false,
  });
  applyRecovery(proposal, true);
}

function runNaturalRecovery(): void {
  const current = readSnapshot();
  if (document.hidden || current.pendingPlan !== null || current.mp >= current.maxMp) {
    return;
  }
  const proposal = learningSession.proposeNaturalRecovery({
    recoveryId: nextRecoveryId("natural"),
    ticks: 1,
  });
  applyRecovery(proposal, false);
}

function applyRecovery(
  proposal: ReturnType<CisternLearningSession["proposeNaturalRecovery"]>,
  announce: boolean,
): void {
  try {
    const beforeMp = snapshot.mp;
    const result = controller.applyMpRecovery(proposal);
    snapshot = projectSnapshot(result.snapshot);
    render(snapshot);
    if (!announce) {
      return;
    }
    if (!result.accepted) {
      setStatus(result.rejectionCode ?? "MP 回复被控制器拒绝。", "warning");
      return;
    }
    const restoredMp = Math.max(0, snapshot.mp - beforeMp);
    setStatus(
      restoredMp > 0 ? `冥想回复 ${restoredMp} MP；未生成学习证据。` : "MP 已达到上限。",
      restoredMp > 0 ? "ok" : "neutral",
    );
  } catch (error: unknown) {
    if (announce) {
      setStatus(error instanceof Error ? error.message : "MP 回复失败。", "danger");
    }
  }
}

function advancePhysics(): void {
  runAction(
    () => controller.advancePhysics(PHYSICS_TICKS_PER_STEP),
    `物理世界已推进 ${PHYSICS_TICKS_PER_STEP} tick。`,
    "ok",
  );
}

function nextRecoveryId(source: "natural" | "meditation"): string {
  recoverySequence += 1;
  return `cistern.ui.${source}.${Date.now()}.${recoverySequence}.${globalThis.crypto.randomUUID()}`;
}

function runAction(action: () => void, successMessage: string, tone: StatusTone): void {
  try {
    action();
    snapshot = readSnapshot();
    render(snapshot);
    setStatus(successMessage, tone);
  } catch (error: unknown) {
    snapshot = readSnapshot();
    render(snapshot);
    setStatus(error instanceof Error ? error.message : "操作被控制器拒绝。", "danger");
  }
}

function readSnapshot(): SnapshotView {
  return projectSnapshot(controller.snapshot());
}

function projectSnapshot(raw: ReturnType<CisternDemoController["snapshot"]>): SnapshotView {
  const pending = raw.pendingPlan === null ? null : {
    canConfirm: raw.pendingPlan.canConfirm,
    rejectionCode: raw.pendingPlan.rejectionCode ?? undefined,
    activationMpRequired: raw.pendingPlan.activationMpRequired,
    manifestationCells: raw.pendingPlan.preview.geometry.simulationCellGeometry.manifestationCells,
  };
  return {
    mp: raw.mp,
    maxMp: raw.maxMp,
    worldVersion: raw.worldVersion,
    stage: raw.stage,
    completed: raw.completed,
    selectedExpression: raw.selectedExpression,
    selectedDirection: raw.selectedDirection,
    targetAnchorPx: raw.targetAnchorPx,
    pendingPlan: pending,
    receivers: stageSpecs.map((spec) => {
      const receiver = raw.receivers.find((candidate) => candidate.receiverId === spec.receiverId);
      const waterCells = receiver?.waterCells ?? 0;
      const minimumWaterCells = receiver?.minimumWaterCells ?? spec.minimumWaterCells;
      const capacityCells = spec.boundsCells.width * spec.boundsCells.height;
      const satisfied = receiver?.satisfied ?? false;
      const latched = receiver?.latched ?? false;
      return {
        receiverId: spec.receiverId,
        stageId: spec.stageId,
        waterCells,
        minimumWaterCells,
        capacityCells,
        satisfied,
        latched,
        isCurrentStage: receiver?.isCurrentStage ?? false,
        state: receiverState(waterCells, capacityCells, satisfied, latched),
      };
    }),
  };
}

function render(next: SnapshotView): void {
  manaLabel.textContent = `${next.mp} / ${next.maxMp}`;
  worldVersionLabel.textContent = next.completed
    ? `世界版本 ${next.worldVersion} · 完成`
    : `世界版本 ${next.worldVersion} · 阶段 ${next.stage}`;
  phraseReadout.textContent =
    phrases.find((candidate) => candidate.id === next.selectedExpression)?.words ?? next.selectedExpression;
  directionReadout.textContent =
    directions.find((candidate) => candidate.id === next.selectedDirection)?.label ?? next.selectedDirection;
  anchorReadout.textContent = `${next.targetAnchorPx.x}, ${next.targetAnchorPx.y}`;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-phrase]")) {
    button.setAttribute("aria-pressed", String(button.dataset.phrase === next.selectedExpression));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-direction]")) {
    button.setAttribute("aria-pressed", String(button.dataset.direction === next.selectedDirection));
  }

  confirmButton.disabled = !next.pendingPlan?.canConfirm;
  cancelButton.disabled = next.pendingPlan === null;
  meditationButton.disabled = next.pendingPlan !== null || next.mp >= next.maxMp;
  physicsButton.disabled = next.pendingPlan !== null;
  renderReceivers(next.receivers);
  renderMaterialWorld(next);
}

function renderReceivers(receivers: readonly ReceiverView[]): void {
  receiverList.replaceChildren(
    ...receivers.map((receiver, index) => {
      const card = document.createElement("article");
      const fillPercent = clamp((receiver.waterCells / Math.max(1, receiver.capacityCells)) * 100, 0, 100);
      card.className = "receiver-card";
      card.dataset.state = receiver.state;
      card.innerHTML = `
        <span>
          <span class="receiver-id">R-${String(index + 1).padStart(2, "0")}</span>
          <span class="receiver-name">${escapeHtml(receiver.stageId)}</span>
        </span>
        <span class="receiver-state">${receiverStateLabel(receiver)}</span>
        <span class="receiver-meter" aria-hidden="true">
          <span style="--fill-percent: ${fillPercent}%"></span>
        </span>
      `;
      if (receiver.isCurrentStage) {
        card.dataset.current = "true";
        card.querySelector(".receiver-name")?.append(" · 当前");
      }
      card.setAttribute(
        "aria-label",
        `${receiver.stageId}：${receiver.waterCells} 格，最低要求 ${receiver.minimumWaterCells} 格${receiver.latched ? "，已锁定" : ""}`,
      );
      return card;
    }),
  );
}

function receiverStateLabel(receiver: ReceiverView): string {
  if (receiver.latched) {
    return `锁定 ${receiver.waterCells}/${receiver.minimumWaterCells}`;
  }
  if (receiver.satisfied) {
    return `达标 ${receiver.waterCells}/${receiver.minimumWaterCells}`;
  }
  if (receiver.waterCells > 0) {
    return `未达标 ${receiver.waterCells}/${receiver.minimumWaterCells}`;
  }
  return `空 0/${receiver.minimumWaterCells}`;
}

function renderMaterialWorld(next: SnapshotView): void {
  context.imageSmoothingEnabled = false;
  context.fillStyle = materialColor(Material.Air);
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let cellY = 0; cellY < WORLD_HEIGHT_CELLS; cellY += 1) {
    for (let cellX = 0; cellX < WORLD_WIDTH_CELLS; cellX += 1) {
      const material = controller.materialAtCell(cellX, cellY);
      if (material === Material.Air) {
        continue;
      }
      context.fillStyle = materialColor(material);
      context.fillRect(
        cellX * CELL_SIZE_PX,
        cellY * CELL_SIZE_PX,
        CELL_SIZE_PX,
        CELL_SIZE_PX,
      );
    }
  }

  for (const [index, spec] of stageSpecs.entries()) {
    const receiver = next.receivers[index];
    const bounds = spec.boundsCells;
    const x = bounds.x * CELL_SIZE_PX;
    const y = bounds.y * CELL_SIZE_PX;
    const width = bounds.width * CELL_SIZE_PX;
    const height = bounds.height * CELL_SIZE_PX;
    const color = receiver?.latched ? "#79c48b" : receiver?.isCurrentStage ? "#8cddf4" : "#687177";
    fillOutline(x, y, width, height, color);
  }

  if (next.pendingPlan) {
    for (const cell of next.pendingPlan.manifestationCells) {
      if (
        cell.x < 0 ||
        cell.y < 0 ||
        cell.x >= WORLD_WIDTH_CELLS ||
        cell.y >= WORLD_HEIGHT_CELLS
      ) {
        continue;
      }
      context.fillStyle = next.pendingPlan.canConfirm ? "#d9f8ff" : "#e46d5c";
      context.fillRect(
        cell.x * CELL_SIZE_PX,
        cell.y * CELL_SIZE_PX,
        CELL_SIZE_PX,
        CELL_SIZE_PX,
      );
    }
  }

  drawTarget(next.targetAnchorPx);
}

function drawTarget(target: Point): void {
  const x = clamp(Math.round(target.x), 2, canvas.width - 3);
  const y = clamp(Math.round(target.y), 2, canvas.height - 3);
  context.fillStyle = "#f3e39a";
  context.fillRect(x - 2, y, 5, 1);
  context.fillRect(x, y - 2, 1, 5);
  context.fillStyle = "#080a0b";
  context.fillRect(x, y, 1, 1);
}

function fillOutline(x: number, y: number, width: number, height: number, color: string): void {
  context.fillStyle = color;
  context.fillRect(x, y, width, 1);
  context.fillRect(x, y + height - 1, width, 1);
  context.fillRect(x, y, 1, height);
  context.fillRect(x + width - 1, y, 1, height);
}

function materialColor(material: Material): string {
  const [red, green, blue] = MATERIALS[material].color;
  return `rgb(${red} ${green} ${blue})`;
}

function receiverState(
  waterCells: number,
  capacityCells: number,
  satisfied: boolean,
  latched: boolean,
): ReceiverState {
  if (waterCells > capacityCells) {
    return "overflow";
  }
  if (satisfied || latched) {
    return "satisfied";
  }
  return waterCells > 0 ? "partial" : "empty";
}

function setStatus(message: string, tone: StatusTone): void {
  statusLine.textContent = message;
  statusLine.dataset.tone = tone;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const targetContext = target.getContext("2d", { alpha: false });
  if (!targetContext) {
    throw new Error("2D canvas is unavailable");
  }
  return targetContext;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
