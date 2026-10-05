import type { Aabb } from '../runtime/geometry';
import { intersects } from '../runtime/geometry';

export const WETLAND_BOUNDS = { x: 0, y: 0, width: 768, height: 480 } as const;
export const ORDER_NODE_BOUNDS = { x: 0, y: 0, width: 448, height: 352 } as const;
export const MIGRATION = { adultStart: 330, youngStart: 282, adultEnd: 688, youngEnd: 640, safeBank: 180, calmTicks: 60 } as const;
export type MigrationMode = 'searching_for_young' | 'warning' | 'fleeing' | 'resettling' | 'dead';
export interface WetlandMigrationState {
  version: 1;
  age: number;
  calm: number;
  adultX: number;
  youngX: number;
  mode: MigrationMode;
}
export interface MigrationControls { cleared: boolean; adultAlive: boolean; youngAlive: boolean }
export const emptyWetlandMigration = (): WetlandMigrationState => ({
  version: 1, age: 0, calm: 0, adultX: MIGRATION.adultStart, youngX: MIGRATION.youngStart, mode: 'searching_for_young',
});
export function wetlandGround(x: number): number {
  if (x < 180) return 352;
  if (x < 340) return 352 + Math.floor((x - 180) / 10);
  if (x < 580) return 368;
  if (x < 700) return 368 - Math.floor((x - 580) / 10);
  return 356;
}
export function migrationBody(x: number, young = false): Aabb {
  const width = young ? 16 : 40, height = young ? 10 : 18;
  const columns = Math.ceil(x + width) - Math.floor(x);
  const floor = Math.min(...Array.from({ length: columns }, (_, i) => wetlandGround(Math.floor(x) + i)));
  return { x, y: floor - height, width, height };
}
export function migrationBodies(s: WetlandMigrationState, controls: MigrationControls): Aabb[] {
  return [controls.adultAlive ? migrationBody(s.adultX) : null, controls.youngAlive ? migrationBody(s.youngX, true) : null]
    .filter((b): b is Aabb => b !== null);
}
export function migrationSettled(s: WetlandMigrationState): boolean {
  return s.mode === 'resettling' && s.adultX === MIGRATION.adultEnd && s.youngX === MIGRATION.youngEnd;
}
/** Simulation only. Scene/pause ownership stays in ForestEpisode; no rewards or session writes here. */
export function advanceWetlandMigration(s: WetlandMigrationState, controls: MigrationControls, player: Aabb): void {
  s.age = Math.min(1_000_000_000, s.age + 1);
  if (!controls.adultAlive) { s.mode = 'dead'; s.calm = 0; return; }
  if (migrationSettled(s)) return;
  const near = migrationBodies(s, controls).some(b =>
    intersects(player, { x: b.x - 56, y: b.y - 24, width: b.width + 112, height: b.height + 48 }));
  if (!controls.cleared || !controls.youngAlive || player.x + player.width > MIGRATION.safeBank || near) {
    s.mode = near ? 'warning' : 'searching_for_young'; s.calm = 0; return;
  }
  s.calm = Math.min(MIGRATION.calmTicks, s.calm + 1);
  if (s.calm < MIGRATION.calmTicks) { s.mode = 'searching_for_young'; return; }
  const adultX = Math.min(MIGRATION.adultEnd, s.adultX + .65);
  const youngX = Math.min(MIGRATION.youngEnd, s.youngX + .65);
  // Less than one pixel per step; shared terrain sampling and swept player checks prevent wall/body tunnelling.
  for (const [before, after, young] of [[s.adultX, adultX, false], [s.youngX, youngX, true]] as const) {
    const b = migrationBody(after, young), old = migrationBody(before, young);
    if (intersects(b, player) || intersects({ x: old.x, y: Math.min(old.y, b.y),
      width: b.x + b.width - old.x, height: Math.max(old.y + old.height, b.y + b.height) - Math.min(old.y, b.y) }, player)) {
      s.mode = 'warning'; s.calm = 0; return;
    }
    if (b.x < 0 || b.x + b.width > WETLAND_BOUNDS.width ||
      Array.from({ length: b.width }, (_, i) => Math.floor(b.x) + i).some(x => b.y + b.height > wetlandGround(x))) return;
  }
  s.adultX = adultX; s.youngX = youngX;
  s.mode = adultX === MIGRATION.adultEnd && youngX === MIGRATION.youngEnd ? 'resettling' : 'fleeing';
}
export function validateWetlandMigration(s: WetlandMigrationState, controls: MigrationControls): void {
  if (!s || s.version !== 1 || !Number.isSafeInteger(s.age) || s.age < 0 || s.age > 1_000_000_000 ||
    !Number.isInteger(s.calm) || s.calm < 0 || s.calm > MIGRATION.calmTicks || s.calm > s.age ||
    !['searching_for_young', 'warning', 'fleeing', 'resettling', 'dead'].includes(s.mode) ||
    !Number.isFinite(s.adultX) || !Number.isFinite(s.youngX) || s.adultX < MIGRATION.adultStart || s.adultX > MIGRATION.adultEnd ||
    s.youngX < MIGRATION.youngStart || s.youngX > MIGRATION.youngEnd || Math.abs(s.adultX - s.youngX - 48) > 1e-8 ||
    !controls.cleared && (s.adultX !== MIGRATION.adultStart || s.youngX !== MIGRATION.youngStart) ||
    s.mode === 'resettling' && (!migrationSettled(s) || !controls.cleared || !controls.adultAlive || !controls.youngAlive) ||
    s.mode === 'fleeing' && (!controls.cleared || s.calm !== MIGRATION.calmTicks || !controls.adultAlive || !controls.youngAlive) ||
    (s.mode === 'dead') !== !controls.adultAlive ||
    s.adultX - MIGRATION.adultStart > Math.max(0, s.age - MIGRATION.calmTicks + 1) * .65 + 1e-8)
    throw Error('湿地迁徙存档无效');
}
/** Shallow water is a habitat/backdrop, not a second spell-water source. */
export function wetlandMapMaterial(x: number, y: number): number {
  if (y >= wetlandGround(x)) return 2;
  return x >= 340 && x <= 578 && y >= 365 ? 7 : 0;
}
export function orderNodeSolid(x: number, y: number): boolean {
  return x < 6 || x >= 442 || y < 64 || y >= 336;
}
