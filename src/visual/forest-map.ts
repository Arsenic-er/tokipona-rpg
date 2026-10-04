import { CARTOGRAPHY_KEY, ForestCartography, MAP_AREAS, MAP_CELL, MAP_UNKNOWN, type MapArea, type MapPoint } from '../world/forest-cartography';
export interface MapLandmark extends MapPoint { label: string }
interface MapOptions {
  storage: Storage; suffix: string; canOpen(): boolean; suspend(): void; resume(): void;
}
const COLORS = ['#263c39', '#545a56', '#776244', '#555340', '#717b79', '#917047', '#b4ab8c', '#4a919b', '#738457', '#c08e49', '#66635b'];
/** Shared map overlay for the old creek route and the continuation. */
export class ForestMap {
  private knowledge = new ForestCartography();
  private readonly storageKey: string;
  private readonly dialog: HTMLDialogElement;
  private readonly map: HTMLCanvasElement;
  private readonly mini: HTMLCanvasElement;
  private readonly note: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly landmarks: HTMLElement;
  private area: MapArea = 'opening';
  private position: MapPoint = { x: 0, y: 0 };
  private markers: readonly MapLandmark[] = [];
  private world = false;
  private scale = 1;
  private center: MapPoint = this.position;
  private dirty = false;
  private protectedBytes = false;
  private status = '';
  private lastObservedTick = -Infinity;
  private lastPaint = '';
  constructor(root: HTMLElement, private readonly options: MapOptions) {
    this.storageKey = CARTOGRAPHY_KEY + options.suffix;
    try { const raw = options.storage.getItem(this.storageKey); if (raw !== null) this.knowledge = ForestCartography.restore(JSON.parse(raw)); }
    catch { this.protectedBytes = true; this.status = '旧地图记录无法读取，原数据保留；本次探索暂存内存，不影响剧情存档。'; }
    const panel = document.createElement('section'); panel.className = 'forest-atlas';
    panel.innerHTML = `<button class="atlas-mini" aria-label="查看地图（M）"><canvas width="180" height="92" aria-hidden="true"></canvas><span>地图 M · 未知区域未绘制</span></button>
      <dialog class="atlas-dialog" aria-label="旅途地图"><div class="atlas-heading"><div><small>旅者手记 / 探索记录</small><h2>旅途地图</h2></div><button data-map="close" aria-label="关闭地图">关闭 ×</button></div>
      <div class="atlas-toolbar"><div role="group" aria-label="地图层级"><button data-map="local" aria-pressed="true">当前场景</button><button data-map="world" aria-pressed="false">世界地图</button></div><div data-map="zoom"><button data-map="out" aria-label="缩小地图">−</button><button data-map="center">回到当前位置</button><button data-map="in" aria-label="放大地图">＋</button></div></div>
      <p class="atlas-subtitle"></p><canvas class="atlas-surface" width="960" height="400" aria-label="已探索地形；黑色为未探索区域"></canvas>
      <div class="atlas-legend"><span>◆ 你的位置</span><span>● 已见地点</span><span>■ 黑幕：尚未到访</span></div><p class="atlas-landmarks"></p>
      <p class="atlas-note" role="status"></p><p class="atlas-help">M / Esc 返回 · 滚轮缩放地图 · 拖动查看 · 地图不提供传送</p><button data-map="backup" hidden>导出地图备份</button><button data-map="retry" hidden>重试保存地图</button></dialog>`;
    root.append(panel); this.dialog = panel.querySelector('dialog')!; this.map = panel.querySelector('.atlas-surface')!;
    this.mini = panel.querySelector('.atlas-mini canvas')!; this.note = panel.querySelector('.atlas-note')!;
    this.heading = panel.querySelector('.atlas-subtitle')!; this.landmarks = panel.querySelector('.atlas-landmarks')!;
    const action = (name: string, fn: () => void) => { panel.querySelector<HTMLButtonElement>(`[data-map="${name}"]`)!.onclick = fn; };
    panel.querySelector<HTMLButtonElement>('.atlas-mini')!.onclick = () => this.toggle();
    action('close', () => this.close()); action('local', () => this.select(false)); action('world', () => this.select(true));
    action('in', () => this.zoom(1.4)); action('out', () => this.zoom(1 / 1.4));
    action('center', () => { this.center = { ...this.position }; this.scale = 1; this.paint(); });
    action('retry', () => { this.save(); this.paint(); });
    action('backup', () => {
      let original: string | null = null; try { original = options.storage.getItem(this.storageKey); } catch { /* Still export current exploration. */ }
      const url = URL.createObjectURL(new Blob([JSON.stringify({ original, current: this.knowledge.toSave() })], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'tokipona-map-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.map.addEventListener('wheel', event => { event.preventDefault(); if (!this.world) this.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
    let drag: { x: number; y: number; center: MapPoint } | null = null;
    this.map.addEventListener('pointerdown', event => { if (this.world) return; event.preventDefault(); this.map.setPointerCapture(event.pointerId); drag = { x: event.clientX, y: event.clientY, center: { ...this.center } }; });
    this.map.addEventListener('pointermove', event => {
      if (!drag) return; const rect = this.map.getBoundingClientRect(), width = this.localWidth();
      this.center = { x: drag.center.x - (event.clientX - drag.x) * width / rect.width, y: drag.center.y - (event.clientY - drag.y) * width / rect.width }; this.clampCenter(); this.paint();
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) this.map.addEventListener(name, () => { drag = null; });
    window.addEventListener('pagehide', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    window.addEventListener('resize', () => { if (this.open) this.paint(); });
  }
  get open(): boolean { return this.dialog.open; }
  key(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const k = event.key.toLowerCase();
    if (k !== 'm' && !(k === 'escape' && this.open)) return false;
    if (event.repeat) { event.preventDefault(); return true; }
    if (!this.open && !this.options.canOpen()) return false;
    event.preventDefault(); this.toggle(); return true;
  }
  update(area: MapArea, position: MapPoint, tick: number, sample: (x: number, y: number) => number, markers: readonly MapLandmark[]): void {
    const changedPlace = area !== this.area; this.area = area; this.position = position; this.markers = markers;
    if (changedPlace || tick < this.lastObservedTick || tick - this.lastObservedTick >= 15) {
      this.dirty = this.knowledge.observe(area, position, sample, changedPlace || tick % 120 < 15) || this.dirty;
      this.lastObservedTick = tick;
      if (changedPlace || tick % 120 < 15) this.save();
    }
    const paintKey = `${area}:${this.knowledge.revision}:${Math.floor(position.x / 8)}:${Math.floor(position.y / 8)}`;
    if (paintKey !== this.lastPaint) { this.lastPaint = paintKey; this.drawLocal(this.mini, this.position, 480, false); }
  }
  save(): void {
    if (!this.dirty || this.protectedBytes) return;
    try { this.options.storage.setItem(this.storageKey, JSON.stringify(this.knowledge.toSave())); this.dirty = false; this.status = ''; }
    catch { this.status = '地图保存失败：本次探索仍在内存中，请重试或导出地图备份。剧情存档独立保存。'; }
  }
  reset(): void { this.options.storage.removeItem(this.storageKey); this.knowledge = new ForestCartography(); this.protectedBytes = false; this.dirty = false; }
  private toggle(): void {
    if (this.open) { this.close(); return; } if (!this.options.canOpen()) return;
    this.options.suspend(); this.center = { ...this.position }; this.scale = 1; this.world = false;
    this.save(); this.dialog.showModal(); this.select(false); this.dialog.querySelector<HTMLButtonElement>('[data-map="close"]')!.focus();
  }
  private close(): void { this.save(); this.dialog.close(); this.options.resume(); }
  private select(world: boolean): void {
    this.world = world;
    this.dialog.querySelector('[data-map="local"]')!.setAttribute('aria-pressed', String(!world));
    this.dialog.querySelector('[data-map="world"]')!.setAttribute('aria-pressed', String(world));
    (this.dialog.querySelector('[data-map="zoom"]') as HTMLElement).hidden = world; this.paint();
  }
  private zoom(factor: number): void { this.scale = Math.max(.3, Math.min(4, this.scale * factor)); this.clampCenter(); this.paint(); }
  private localWidth(): number { return Math.min(1280, Math.max(640, this.map.width * 1.2)) / this.scale; }
  private clampCenter(): void { const a = MAP_AREAS[this.area]; this.center = { x: Math.max(0, Math.min(a.width, this.center.x)), y: Math.max(0, Math.min(a.height, this.center.y)) }; }
  private paint(): void {
    this.heading.textContent = this.world ? '世界地图 · 森林区域与已知方向（区域连接示意，非等距地理图）' : `${MAP_AREAS[this.area].label} · 脚步记录的地图`;
    const rect = this.map.getBoundingClientRect(); this.map.width = Math.max(300, Math.round(rect.width)); this.map.height = Math.max(180, Math.round(rect.height));
    if (this.world) this.drawWorld(); else this.drawLocal(this.map, this.center, this.localWidth(), true);
    const names = this.world ? (Object.keys(MAP_AREAS) as MapArea[]).filter(a => this.knowledge.visited(a)).map(a => MAP_AREAS[a].label) : this.visibleMarkers().map(m => m.label);
    this.landmarks.textContent = `已记录：${names.join('、') || '此处还没有地标'}。`;
    this.note.textContent = this.status || '探索进度已保存；黑幕不会因缩放地图或游戏镜头而消失。';
    (this.dialog.querySelector('[data-map="backup"]') as HTMLElement).hidden = !this.status;
    (this.dialog.querySelector('[data-map="retry"]') as HTMLElement).hidden = !this.status || this.protectedBytes;
  }
  private visibleMarkers(): readonly MapLandmark[] { return this.markers.filter(m => this.knowledge.at(this.area, m.x, m.y) !== MAP_UNKNOWN); }
  private drawLocal(canvas: HTMLCanvasElement, center: MapPoint, worldWidth: number, labels: boolean): void {
    const ctx = canvas.getContext('2d')!, width = canvas.width, height = canvas.height, scale = width / worldWidth;
    const left = center.x - worldWidth / 2, top = center.y - height / scale / 2, a = MAP_AREAS[this.area];
    ctx.fillStyle = '#030706'; ctx.fillRect(0, 0, width, height); ctx.imageSmoothingEnabled = false;
    const sx = Math.max(0, Math.floor(left / MAP_CELL)), ex = Math.min(a.width / MAP_CELL - 1, Math.ceil((left + worldWidth) / MAP_CELL));
    const sy = Math.max(0, Math.floor(top / MAP_CELL)), ey = Math.min(a.height / MAP_CELL - 1, Math.ceil((top + height / scale) / MAP_CELL));
    for (let cy = sy; cy <= ey; cy++) for (let cx = sx; cx <= ex; cx++) {
      const m = this.knowledge.at(this.area, cx * MAP_CELL, cy * MAP_CELL); if (m === MAP_UNKNOWN) continue;
      ctx.fillStyle = COLORS[m]!; ctx.fillRect(Math.floor((cx * MAP_CELL - left) * scale), Math.floor((cy * MAP_CELL - top) * scale), Math.ceil(MAP_CELL * scale) + 1, Math.ceil(MAP_CELL * scale) + 1);
    }
    const point = (p: MapPoint) => ({ x: (p.x - left) * scale, y: (p.y - top) * scale });
    ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    for (const marker of this.visibleMarkers()) {
      const p = point(marker); if (p.x < 20 || p.x > width - 20 || p.y < 20 || p.y > height - 10) continue;
      ctx.fillStyle = '#c1a877'; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      if (labels) { ctx.fillStyle = '#111b18'; const w = ctx.measureText(marker.label).width + 10; ctx.fillRect(p.x - w / 2, p.y - 25, w, 18); ctx.fillStyle = '#dfcfac'; ctx.fillText(marker.label, p.x, p.y - 12); }
    }
    const p = point(this.position); if (p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) {
      ctx.fillStyle = '#f0cd78'; ctx.beginPath(); ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 4, p.y); ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 4, p.y); ctx.fill();
    }
    if (labels) { ctx.fillStyle = '#b8bcaa'; ctx.textAlign = 'left'; ctx.fillText('← 西 / 右行向东 →', 12, height - 12); }
    canvas.dataset.area = this.area; canvas.dataset.discovered = String(this.knowledge.entries(this.area).length);
  }
  private drawWorld(): void {
    const ctx = this.map.getContext('2d')!, w = this.map.width, h = this.map.height;
    ctx.fillStyle = '#08110e'; ctx.fillRect(0, 0, w, h);
    const narrow = w < 600, designW = narrow ? 400 : 960, designH = narrow ? 560 : 400;
    const fit = Math.min(w / designW, h / designH);
    ctx.save(); ctx.translate((w - designW * fit) / 2, (h - designH * fit) / 2); ctx.scale(fit, fit);
    if (narrow) {
      ctx.fillStyle = '#15271e'; ctx.beginPath(); ctx.moveTo(22, 70); ctx.lineTo(153, 20); ctx.lineTo(320, 53); ctx.lineTo(389, 237); ctx.lineTo(320, 321); ctx.lineTo(50, 306); ctx.closePath(); ctx.fill();
    } else {
    ctx.fillStyle = '#15271e'; ctx.beginPath(); ctx.moveTo(48, 80); ctx.lineTo(258, 30); ctx.lineTo(707, 63); ctx.lineTo(786, 170); ctx.lineTo(700, 338); ctx.lineTo(240, 365); ctx.lineTo(45, 278); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#778b66'; ctx.font = '18px system-ui'; ctx.fillText('森 林', 60, 63);
    const nodes: Record<MapArea, [number, number]> = narrow
      ? { opening: [70, 254], settlement: [203, 185], mill: [323, 267], hermit: [156, 97], 'cistern-entry': [313, 355], cistern:[180,428] }
      : { opening: [140, 249], settlement: [416, 196], mill: [663, 220], hermit: [244, 105], 'cistern-entry': [663, 319],cistern:[465,319] };
    const edges: [MapArea, MapArea][] = [['opening', 'settlement'], ['settlement', 'mill'], ['settlement', 'hermit'], ['mill', 'cistern-entry'],['cistern-entry','cistern']];
    ctx.lineWidth = 2; ctx.strokeStyle = '#69745b';
    for (const [from, to] of edges) if (this.knowledge.visited(from) && this.knowledge.visited(to)) {
      ctx.beginPath(); ctx.moveTo(...nodes[from]); ctx.lineTo(...nodes[to]); ctx.stroke();
    }
    ctx.font = '15px system-ui'; ctx.textAlign = 'center';
    for (const area of Object.keys(nodes) as MapArea[]) {
      const [x, y] = nodes[area], visited = this.knowledge.visited(area);
      if (!visited) {
        const half = narrow ? 58 : 75;
        ctx.fillStyle = '#020504'; ctx.beginPath(); ctx.moveTo(x - half, y - 17); ctx.lineTo(x - half + 16, y - 29); ctx.lineTo(x + half - 8, y - 24); ctx.lineTo(x + half, y + 16); ctx.lineTo(x + half - 21, y + 36); ctx.lineTo(x - half + 5, y + 25); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#788675'; ctx.fillText('未探索', x, y + 5); continue;
      }
      for (let tree = 0; area !== 'cistern-entry' && area!=='cistern' && tree < 5; tree++) {
        const tx = x - 65 + tree * 30, ty = y - 43 + tree % 2 * 8;
        ctx.fillStyle = '#3f5940'; ctx.beginPath(); ctx.moveTo(tx, ty - 11); ctx.lineTo(tx - 7, ty + 4); ctx.lineTo(tx + 7, ty + 4); ctx.fill(); ctx.fillStyle = '#4e523c'; ctx.fillRect(tx - 1, ty + 4, 2, 6);
      }
      ctx.fillStyle = area === this.area ? '#c4a66b' : '#879d74'; ctx.fillRect(x - 10, y - 12, 20, 14);
      ctx.beginPath(); ctx.moveTo(x - 15, y - 12); ctx.lineTo(x, y - 24); ctx.lineTo(x + 15, y - 12); ctx.fill(); ctx.fillStyle = '#13221b'; ctx.fillRect(x - 2, y - 5, 5, 7);
      ctx.fillStyle = '#122019'; ctx.fillRect(x - 65, y + 7, 130, 21); ctx.fillStyle = '#e0d3ac'; ctx.fillText(MAP_AREAS[area].label, x, y + 23);
      if (area === this.area) { ctx.fillStyle = '#edc777'; ctx.fillText('◆ 你在这里', x, y + 44); }
    }
    const px = narrow ? 105 : 870, py = narrow ? 507 : 175;
    ctx.fillStyle = '#101813'; ctx.fillRect(px - 75, py - 32, 149, 88); ctx.fillStyle = '#909982'; ctx.fillText('平原方向', px, py); ctx.fillStyle = '#818b78'; ctx.fillText('后续区域 · 未开放', px, py + 27);
    ctx.font = '13px system-ui'; ctx.fillText('其余世界尚未绘制', narrow ? 200 : 823, narrow ? 552 : 351); ctx.restore();
  }
}
