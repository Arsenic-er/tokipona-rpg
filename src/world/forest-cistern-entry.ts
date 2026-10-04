/** A bounded entrance room, not the full high-cistern puzzle or a second river. */
export const CISTERN_ENTRY_GATE = { left: 576, right: 588 } as const;
const BANK: readonly (readonly [number, number])[] = [
  [0, 266], [128, 266], [256, 292], [384, 340], [464, 350],
  [650, 350], [768, 374], [940, 374], [1024, 368],
];
export function cisternEntryFloor(x: number): number {
  for (let i = 1; i < BANK.length; i++) {
    const [left, y0] = BANK[i - 1]!, [right, y1] = BANK[i]!;
    if (x <= right) {
      const t = Math.max(0, (x - left) / (right - left));
      return Math.round(y0 + (y1 - y0) * t * t * (3 - 2 * t));
    }
  }
  return BANK[BANK.length - 1]![1];
}
export function cisternEntryCeiling(x: number): number {
  return cisternEntryFloor(x) - 100 - Math.round(10 * (1 + Math.sin(x / 93)));
}
/** Shared by collision, pixel rendering and map occlusion. */
export function cisternEntrySolid(x: number, y: number, gateOpen: boolean): boolean {
  return x < 8 || x >= 1008 || y <= cisternEntryCeiling(x) || y >= cisternEntryFloor(x) ||
    (!gateOpen && x >= CISTERN_ENTRY_GATE.left && x < CISTERN_ENTRY_GATE.right);
}
