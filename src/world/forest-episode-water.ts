/** Small, deterministic, one-world-pixel channel. The same solids draw and stop water. */
export const EPISODE_WATER_WIDTH = 160;
export const EPISODE_WATER_HEIGHT = 48;
export interface EpisodeWaterState {
  cells: number[];
  supplied: number;
  escaped: number;
  tick: number;
}
export interface EpisodeWaterControls {
  kind: 'mill' | 'practice';
  gate: boolean;
  cleared: boolean;
  plugged: boolean;
}
export function emptyEpisodeWater(): EpisodeWaterState {
  return { cells: Array<number>(160 * 48).fill(0), supplied: 0, escaped: 0, tick: 0 };
}
export function episodeWaterSolid(x: number, y: number, c: EpisodeWaterControls): boolean {
  if (x < 0 || x >= 160 || y < 0) return true;
  if (y >= 48) return false;
  const floor = 12 + Math.floor(x / 6);
  if (c.kind === 'mill') {
    if (!c.gate && x >= 24 && x <= 27 && y >= 2) return true;
    if (!c.cleared && x >= 79 && x <= 88) return true;
    return x < 156 && y >= floor;
  }
  if (x >= 137) return y >= 44 || x === 159;
  if (x >= 93 && x <= 100) return c.plugged && y >= floor && y < floor + 3;
  return y >= floor;
}
export function supplyEpisodeWater(s: EpisodeWaterState, amount: number, c: EpisodeWaterControls): number {
  let inserted = 0;
  for (let y = 10; y >= 1 && inserted < amount; y--) for (let x = 3; x < 21 && inserted < amount; x++) {
    const i = y * 160 + x;
    if (!s.cells[i] && !episodeWaterSolid(x, y, c)) { s.cells[i] = 1; inserted++; }
  }
  s.supplied += inserted;
  return inserted;
}
export function advanceEpisodeWater(s: EpisodeWaterState, c: EpisodeWaterControls, onEscape?: (x: number) => void): number {
  const before = s.escaped;
  if (c.kind === 'mill' && c.gate) supplyEpisodeWater(s, 2, c);
  const moved = new Uint8Array(s.cells.length);
  for (let y = 47; y >= 0; y--) for (let scan = 0; scan < 160; scan++) {
    const x = s.tick % 2 ? 159 - scan : scan, i = y * 160 + x;
    if (!s.cells[i] || moved[i]) continue;
    if (episodeWaterSolid(x, y, c)) {
      if (c.kind === 'mill') {
        // A closing sluice displaces water back into the channel, not through
        // forty pixels of solid timber into a fictitious downstream outlet.
        let destination = -1, best = Infinity;
        for (let ry = 0; ry < 48; ry++) for (let rx = 0; rx < 160; rx++) {
          if (!c.cleared && rx >= 79) continue; // Never push through the uncleared silt barrier.
          const j = ry * 160 + rx;
          if (s.cells[j] || episodeWaterSolid(rx, ry, c)) continue;
          const distance = Math.abs(rx - x) + Math.abs(ry - y) + (rx > x ? 160 : 0);
          if (distance < best) { destination = j; best = distance; }
        }
        // Saturation never deletes mass; trapped water can move once space opens.
        if (destination >= 0) { s.cells[i] = 0; s.cells[destination] = 1; moved[destination] = 1; }
        continue;
      }
      // Seating the wedge expels residual drops below it. Do not entomb fluid
      // in newly placed wood, lose mass, or leave an eternal "wait" blocker.
      let ny = y + 1;
      while (ny < 48 && (episodeWaterSolid(x, ny, c) || s.cells[ny * 160 + x])) ny++;
      s.cells[i] = 0;
      if (ny === 48) { s.escaped++; onEscape?.(x); }
      else { s.cells[ny * 160 + x] = 1; moved[ny * 160 + x] = 1; }
      continue;
    }
    // Both authored channels descend to the right. Prefer the downhill surface
    // gradient on a flat stair tread; x/tick parity can trap isolated drops in
    // a two-cell oscillation forever and soft-lock a small-volume lesson.
    const side = 1;
    for (const [dx, dy] of [[0, 1], [side, 1], [-side, 1], [side, 0], [-side, 0]]) {
      const nx = x + dx!, ny = y + dy!, ni = ny * 160 + nx;
      if (nx < 0 || nx >= 160 || episodeWaterSolid(nx, ny, c)) continue;
      if (ny >= 48) { s.cells[i] = 0; s.escaped++; onEscape?.(nx); break; }
      if (!s.cells[ni]) { s.cells[i] = 0; s.cells[ni] = 1; moved[ni] = 1; break; }
    }
  }
  s.tick++;
  return s.escaped - before;
}
export function collectedEpisodeWater(s: EpisodeWaterState): number {
  return s.cells.reduce((n, cell, i) => n + (i % 160 >= 137 ? cell : 0), 0);
}
export function validateEpisodeWater(s: EpisodeWaterState): void {
  if (!s || !Array.isArray(s.cells) || s.cells.length !== 7680 || s.cells.some(v => v !== 0 && v !== 1) ||
      ![s.supplied, s.escaped, s.tick].every(v => Number.isSafeInteger(v) && v >= 0) ||
      s.supplied !== s.escaped + s.cells.reduce((n, v) => n + v, 0)) throw new Error('水体存档或守恒校验失败');
}
