import type { ForestOpeningPublicView } from "./forest-opening-view";

const ROUTES = { stone_steps: "松石垫脚", deadwood_bridge: "枯木搭桥", shallow_detour: "浅水绕行" } as const;
export function forestJourneyBeat(view: ForestOpeningPublicView) {
  const finished = view.mode === "settlement_perimeter";
  const solved = view.obstacle.solutionId !== null;
  const stones = view.environment.flatMap(layer => layer.objects).filter(o => o.kind === "stone" && o.state === "seated").length;
  const integrated = view.environment.some(layer=>layer.objects.some(o=>o.materialPocket?.integrated));
  const stage = finished ? 4 : solved ? view.obstacle.glyph.observed ? 3 : 2 : view.traveler.position.x >= 1664 ? 1 : 0;
  const titles = ["初入林缘", "受损溪路", "陌生刻痕", "寻找落脚处", "林间落脚"];
  const details = [
    "林间的旧路向东延伸。先沿路走，找一处能落脚的地方。",
    integrated ? "E 推动身前松石、把枯木向自己拖来，或疏通松土。跳跃与绕行也可通路；实际到达对岸才记入旅途。"
      : stones > 0 ? `已有 ${stones}/2 块松石就位；继续找另一块松石。` : "靠近松石、枯木或浅水边，查看可以采用的办法。",
    "路已经能通过了。东边石面上有一道陌生刻痕，可以停下观察，也可以继续走。",
    "你记下了刻痕的形状，但仍不懂它。继续向东寻找聚落。",
    "你穿过了溪路，抵达林间聚落的边缘。前面的工务人正为损坏的水轮发愁；进入聚落，看看能否用维修换一晚落脚。",
  ];
  return { stage, title: titles[stage]!, detail: details[stage]!, finished,
    route: view.obstacle.solutionId === null ? "尚未处理" : ROUTES[view.obstacle.solutionId],
    glyph: view.obstacle.glyph.observed ? "已记下图形 · 读音与含义未知" : "未停下观察 · 不影响抵达聚落" };
}

interface JourneyOptions {
  readonly canOpen: () => boolean;
  readonly suspend: () => void;
  readonly resume: () => void;
  readonly replay: () => void;
  readonly retrySave: () => void;
  readonly practice: boolean;
}

/** Presentation of existing receipts only; this module never awards progress. */
export class ForestOpeningJourney {
  private readonly hint: HTMLElement;
  private readonly notice: HTMLOutputElement;
  private readonly ending: HTMLElement;
  private readonly journal: HTMLDialogElement;
  private readonly openButton: HTMLButtonElement;
  private noticeUntil = 0;
  private previousKey = "";

  constructor(root: HTMLElement, private readonly options: JourneyOptions) {
    const panel = document.createElement("div");
    panel.className = "forest-journey";
    panel.innerHTML = `<aside class="forest-journey__hint" aria-live="polite"><small>${options.practice ? "临时重玩 · 不改主存档" : "第一章 · 林缘短旅"}</small><h2 data-journey="title"></h2><p data-journey="detail"></p><p class="forest-journey__keys">A/D 移动 · 空格跳跃 · E 互动 · F 观察 · J 笔记</p></aside>
      <output class="forest-journey__notice" role="status" hidden></output>
      <section class="forest-journey__ending" aria-label="短旅程结算" hidden><small>林缘短旅 · 完成</small><h2>林间落脚</h2><p data-journey="ending-detail"></p><dl><dt>溪路</dt><dd data-journey="route"></dd><dt>刻痕</dt><dd data-journey="glyph"></dd><dt>检查点</dt><dd data-journey="save" role="status"></dd></dl><button data-journey="retry" hidden>重试保存</button><button data-journey="replay">临时重玩（不改主存档）</button></section>
      <dialog class="forest-journey__journal" aria-label="旅途笔记"><header><h2>旅途笔记</h2><button data-journey="close" aria-label="关闭旅途笔记">关闭 ×</button></header><p>你是一位来到这片森林的人类旅者。眼下先沿旧路找到落脚处；你的来历和之后的道路尚未揭开。</p><ol><li>沿林缘旧路向东</li><li data-journey="journal-route"></li><li data-journey="journal-glyph"></li><li data-journey="journal-end"></li></ol><p class="forest-journey__footnote">观察刻痕只留下见闻，不会直接学会道本语或解锁法术。媒介、碎片和隐士教学在后续剧情中展开。</p><p>A/D 或方向键移动；持续按住从走路加速到跑步。空格／W 跳跃，E 互动，F 观察。滚轮缩放，0 复原镜头。触屏使用下方按钮。</p></dialog>`;
    root.querySelector(".forest-opening__stage")!.append(panel);
    const get = <T extends HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
    this.hint = get(".forest-journey__hint");
    this.notice = get(".forest-journey__notice");
    this.ending = get(".forest-journey__ending");
    this.journal = get(".forest-journey__journal");
    this.openButton = document.createElement("button");
    this.openButton.textContent = "任务日志 J";
    this.openButton.setAttribute("aria-label", "旅途笔记（J）");
    root.querySelector(".forest-opening__settings")!.append(this.openButton);
    this.openButton.onclick = () => this.toggle();
    // Narrative guidance belongs in the journal, never above the playfield.
    this.journal.querySelector('h2')!.textContent = '任务日志 · 林缘短旅';
    this.journal.insertBefore(this.hint, this.journal.children[1]!);
    const objective = root.querySelector<HTMLElement>('[data-hud="objective"]');
    if (objective) { this.journal.append(objective); objective.hidden = false; }
    const labLink = document.createElement('a');
    const slot = new URLSearchParams(location.search).get('practice');
    labLink.href = `magic-lab.html${slot && /^[0-9a-f]{32}$/.test(slot) ? `?practice=${slot}` : ''}`;
    labLink.textContent = '独立魔法实验室（不改主进度）';
    root.querySelector('.forest-opening__pause')!.append(labLink);
    get<HTMLButtonElement>('[data-journey="close"]').onclick = () => this.close();
    this.journal.addEventListener("cancel", event => { event.preventDefault(); this.close(); });
    get<HTMLButtonElement>('[data-journey="replay"]').onclick = options.replay;
    get<HTMLButtonElement>('[data-journey="retry"]').onclick = options.retrySave;
    const continueButton = document.createElement('button');
    continueButton.dataset.journey = 'continue';
    continueButton.textContent = '进入聚落 · 水轮与碎片';
    continueButton.onclick = () => {
      const next = new URL(location.href);
      next.searchParams.set('episode', 'waterwheel');
      location.assign(next.href);
    };
    this.ending.prepend(continueButton);
    if (!options.practice) {
      const replay = document.createElement('button');
      replay.textContent = '临时重玩（不改主存档）';
      replay.onclick = options.replay;
      this.journal.append(replay);
    }
    if (options.practice) {
      const returnLink = document.createElement("a");
      returnLink.href = "chapter-one.html";
      returnLink.textContent = "返回主进度";
      this.journal.append(returnLink);
      this.ending.append(returnLink.cloneNode(true));
    }
  }

  get open(): boolean { return this.journal.open; }

  key(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if (event.repeat || !(key === "j" || key === "escape" && this.open)) return false;
    if (!this.open && !this.options.canOpen()) return false;
    event.preventDefault();
    this.toggle();
    return true;
  }

  feedback(message: string, tick: number): void {
    this.notice.textContent = message;
    this.noticeUntil = tick + 240;
  }

  update(view: ForestOpeningPublicView, saved: boolean, blocked: boolean): void {
    const beat = forestJourneyBeat(view);
    const key = `${beat.stage}:${beat.route}:${beat.glyph}:${beat.detail}:${saved}`;
    if (key !== this.previousKey) {
      const text = (field: string, value: string) => {
        const target = this.journal.parentElement!.querySelector(`[data-journey="${field}"]`)!;
        target.textContent = value;
      };
      text("title", beat.title); text("detail", beat.detail);
      text("ending-detail", beat.detail); text("route", beat.route); text("glyph", beat.glyph);
      text("save", saved ? this.options.practice ? "已保存到本页临时存档" : "已保存 · 重新打开会留在这里" : "尚未写入成功；请重试，先不要关闭页面");
      text("journal-route", `溪路：${beat.route}`); text("journal-glyph", `刻痕：${beat.glyph}`);
      text("journal-end", beat.finished ? "已抵达聚落边缘；本段结束" : "前往林间聚落边缘");
      this.ending.querySelector<HTMLButtonElement>('[data-journey="retry"]')!.hidden = saved;
      this.ending.querySelector<HTMLButtonElement>('[data-journey="continue"]')!.disabled = !saved || blocked;
      this.previousKey = key;
    }
    setHidden(this.hint, false);
    setHidden(this.ending, blocked || !beat.finished || this.open);
    setHidden(this.notice, blocked || beat.finished || this.open || view.tick >= this.noticeUntil);
    if (this.openButton.disabled !== blocked) this.openButton.disabled = blocked;
  }

  private toggle(): void {
    if (this.open) { this.close(); return; }
    if (!this.options.canOpen()) return;
    this.options.suspend();
    this.journal.showModal();
    this.journal.querySelector<HTMLButtonElement>("button")!.focus();
  }
  private close(): void {
    this.journal.close();
    this.options.resume();
  }
}

function setHidden(element: HTMLElement, hidden: boolean): void {
  if (element.hidden !== hidden) element.hidden = hidden;
}
