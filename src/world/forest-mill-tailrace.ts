import { millValleyGroundY } from './forest-mill-terrain';

/** Native-pixel fall, shallow catchment and stone-lined drain. Not a new player tunnel. */
export const MILL_TAILRACE = { x: 620, y: 307, width: 112, height: 173 } as const;
const { x: OX, y: OY, width: W, height: H } = MILL_TAILRACE;
export interface MillTailraceState {
  version: 'mill-tailrace-v1';
  /** Upstream water that left before this subsystem existed is never resurrected. */
  upstreamOffset: number;
  received: number;
  escaped: number;
  tick: number;
  /** Sparse, unique native-pixel indices, not an additional decorative water source. */
  drops: number[];
  pending: number[];
}
export function emptyMillTailrace(upstreamOffset: number): MillTailraceState {
  return { version: 'mill-tailrace-v1', upstreamOffset, received: 0, escaped: 0, tick: 0, drops: [], pending: [0, 0, 0, 0] };
}
export function millDrainLeft(y: number): number { return 656 + Math.floor(Math.max(0, y - 404) / 3); }
export function millDrainInterior(x: number, y: number): boolean {
  if (y === 394 && (x === 657 || x === 658)) return false;
  return y >= 394 && y < 480 && x >= millDrainLeft(y) && x < millDrainLeft(y) + 4;
}
export function millDrainLining(x: number, y: number): boolean {
  return y >= 394 && y < 480 && x >= millDrainLeft(y) - 3 && x < millDrainLeft(y) + 7 && !millDrainInterior(x, y);
}
export function millTailraceSolid(x: number, y: number): boolean {
  if (x < OX || x >= OX + W || y < OY) return true;
  if (y >= OY + H) return false;
  // Two one-pixel openings between grate bars; player collision remains the supported bank.
  return y >= millValleyGroundY(x) && !millDrainInterior(x, y);
}
/** Null delegates to the existing terrain sampler. Fog/reveal rules remain unchanged. */
export function millTailraceMapMaterial(x: number, y: number, drops: ReadonlySet<number>): number | null {
  if (x < OX || x >= OX + W || y < OY || y >= OY + H) return null;
  if (drops.has((y - OY) * W + x - OX)) return 7;
  if (millDrainInterior(x, y)) return 0;
  return millDrainLining(x, y) ? 4 : null;
}
export function receiveMillOutflow(s: MillTailraceState, channelX: number): void {
  if (!Number.isInteger(channelX) || channelX < 156 || channelX > 159) throw new Error('工坊出水口不匹配');
  s.pending[channelX - 156]!++; s.received++;
}
export function advanceMillTailrace(s: MillTailraceState): void {
  const occupied = new Set(s.drops), next: number[] = [];
  // Each existing drop moves at most once; lower drops vacate first. Stable order survives save/load.
  for (const i of [...s.drops].sort((a, b) => b - a)) {
    const x = OX + i % W, y = OY + Math.floor(i / W);
    const side = x < millDrainLeft(y + 1) + 2 ? 1 : -1;
    let destination = i;
    for (const [dx, dy] of [[0, 1], [side, 1], [-side, 1], [side, 0]]) {
      const nx = x + dx!, ny = y + dy!, ni = (ny - OY) * W + nx - OX;
      if (millTailraceSolid(nx, ny) || occupied.has(ni)) continue;
      destination = ny >= OY + H ? -1 : ni; break;
    }
    occupied.delete(i);
    if (destination < 0) s.escaped++;
    else { occupied.add(destination); next.push(destination); }
  }
  for (let column = 0; column < 4; column++) {
    const i = 656 + column - OX;
    if (s.pending[column]! > 0 && !occupied.has(i)) {
      s.pending[column]!--; next.push(i); occupied.add(i);
    }
  }
  s.drops = next; s.tick++;
}
export function validateMillTailrace(s: MillTailraceState, upstreamEscaped: number, upstreamTick: number): void {
  if (!s || s.version !== 'mill-tailrace-v1' ||
      ![s.upstreamOffset, s.received, s.escaped, s.tick].every(n => Number.isSafeInteger(n) && n >= 0) ||
      !Array.isArray(s.pending) || s.pending.length !== 4 || s.pending.some(n => !Number.isSafeInteger(n) || n < 0) ||
      !Array.isArray(s.drops) || s.drops.length > W * H || new Set(s.drops).size !== s.drops.length ||
      s.drops.some(i => !Number.isInteger(i) || i < 0 || i >= W * H || millTailraceSolid(OX + i % W, OY + Math.floor(i / W))) ||
      s.upstreamOffset + s.received !== upstreamEscaped || s.tick > upstreamTick ||
      s.received !== s.escaped + s.drops.length + s.pending.reduce((a, b) => a + b, 0)) throw new Error('工坊下游存档或守恒校验失败');
}
