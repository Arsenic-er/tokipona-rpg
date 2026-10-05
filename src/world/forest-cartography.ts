/** Player knowledge only. No quest, movement, unlock or teleport authority. */
export const CARTOGRAPHY_KEY = 'tokipona.forest-cartography.v0.1';
export const MAP_CELL = 16;
export const MAP_UNKNOWN = 255;
export const MAP_AREAS = {
  opening: { label: '林缘溪路', width: 3328, height: 1280 },
  settlement: { label: '林间聚落', width: 1024, height: 480 },
  mill: { label: '旧水轮工坊', width: 1024, height: 480 },
  hermit: { label: '隐士林地', width: 1024, height: 480 },
  'cistern-entry': { label: '蓄水廊检修入口', width: 1024, height: 480 },
  cistern: {label:'高位蓄水室',width:480,height:768},
  'return-channel': {label:'回流湿地检修渠',width:480,height:416},
  wetland: {label:'湿地迁徙浅滩',width:768,height:480},
  'order-node': {label:'地下档案前厅',width:448,height:352},
} as const;
export type MapArea = keyof typeof MAP_AREAS;
export type MapPoint = Readonly<{ x: number; y: number }>;
export interface CartographySave {
  version: 1;
  areas: Partial<Record<MapArea, readonly (readonly [number, number])[]>>;
}
const solid = (m: number) => m !== 0 && m !== 7 && m !== 8 && m !== 10;
export class ForestCartography {
  private readonly cells = new Map<MapArea, Uint8Array>();
  private last: (MapPoint & { area: MapArea }) | null = null;
  revision = 0;
  private grid(area: MapArea): Uint8Array {
    let cells = this.cells.get(area);
    if (!cells) { const a = MAP_AREAS[area]; cells = new Uint8Array(a.width / MAP_CELL * (a.height / MAP_CELL)).fill(MAP_UNKNOWN); this.cells.set(area, cells); }
    return cells;
  }
  at(area: MapArea, x: number, y: number): number {
    const a = MAP_AREAS[area];
    if (!Number.isFinite(x + y) || x < 0 || y < 0 || x >= a.width || y >= a.height) return MAP_UNKNOWN;
    return this.cells.get(area)?.[Math.floor(y / MAP_CELL) * (a.width / MAP_CELL) + Math.floor(x / MAP_CELL)] ?? MAP_UNKNOWN;
  }
  visited(area: MapArea): boolean { return this.cells.has(area) && this.cells.get(area)!.some(m => m !== MAP_UNKNOWN); }
  entries(area: MapArea): readonly (readonly [number, number])[] {
    const result: [number, number][] = []; this.cells.get(area)?.forEach((m, i) => { if (m !== MAP_UNKNOWN) result.push([i, m]); }); return result;
  }
  observe(area: MapArea, p: MapPoint, sample: (x: number, y: number) => number, force = false): boolean {
    const a = MAP_AREAS[area];
    if (!Number.isFinite(p.x + p.y) || p.x < 0 || p.y < 0 || p.x >= a.width || p.y >= a.height) return false;
    if (!force && this.last?.area === area && Math.hypot(this.last.x - p.x, this.last.y - p.y) < 8) return false;
    this.last = { ...p, area }; const grid = this.grid(area), columns = a.width / MAP_CELL;
    let changed = false;
    // Fixed physical reach, independent of camera, browser size and map zoom.
    for (let cy = Math.max(0, Math.floor((p.y - 96) / MAP_CELL)); cy <= Math.min(a.height / MAP_CELL - 1, Math.floor((p.y + 96) / MAP_CELL)); cy++) {
      for (let cx = Math.max(0, Math.floor((p.x - 160) / MAP_CELL)); cx <= Math.min(columns - 1, Math.floor((p.x + 160) / MAP_CELL)); cx++) {
        const x = cx * MAP_CELL + 8, y = cy * MAP_CELL + 8, dx = x - p.x, dy = y - p.y;
        if ((dx / 160) ** 2 + (dy / 96) ** 2 > 1) continue;
        const steps = Math.ceil(Math.hypot(dx, dy) / 8); let visible = true;
        for (let s = 1; s < steps; s++) {
          const sx = p.x + dx * s / steps, sy = p.y + dy * s / steps;
          // Reveal the first occupied map cell, not the hidden cells behind it.
          if (Math.floor(sx / MAP_CELL) === cx && Math.floor(sy / MAP_CELL) === cy) break;
          if (solid(sample(Math.floor(sx), Math.floor(sy)))) { visible = false; break; }
        }
        if (!visible) continue;
        const value = sample(x, y); if (!Number.isInteger(value) || value < 0 || value > 10) continue;
        const i = cy * columns + cx;
        if (grid[i] !== value) { grid[i] = value; changed = true; }
      }
    }
    if (changed) this.revision++; return changed;
  }
  toSave(): CartographySave {
    return { version: 1, areas: Object.fromEntries([...this.cells.keys()].map(area => [area, this.entries(area)])) };
  }
  static restore(value: unknown): ForestCartography {
    const data = value as CartographySave;
    if (!data || data.version !== 1 || !data.areas || typeof data.areas !== 'object' || Array.isArray(data.areas)) throw new Error('地图记录版本或结构不兼容');
    const result = new ForestCartography();
    for (const [key, rows] of Object.entries(data.areas)) {
      if (!Object.hasOwn(MAP_AREAS, key) || !Array.isArray(rows)) throw new Error('地图区域不兼容');
      const area = key as MapArea, grid = result.grid(area); let previous = -1;
      if (rows.length > grid.length) throw new Error('地图记录过大');
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 2) throw new Error('地图格记录无效');
        const [i, m] = row;
        if (!Number.isInteger(i) || i <= previous || i >= grid.length || !Number.isInteger(m) || m < 0 || m > 10) throw new Error('地图记录损坏');
        previous = i; grid[i] = m;
      }
    }
    return result;
  }
}
