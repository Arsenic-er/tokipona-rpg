import { MaterialGrid } from '../sim/material-grid';
import { MATERIALS, Material } from '../sim/materials';
import { compileTeloCast, type SimulationCell } from '../spells/cast-plan';
import { parseLabExpression, type LabExpression } from '../spells/lab-expression';
import { EMPTY_JUMP_GRACE, stepPlayerMotion, type PlayerMotionState, type PlayerJumpGrace, type PlayerMotionInput } from '../runtime/player-motion';
import type { Aabb } from '../runtime/geometry';

export const LAB_WIDTH = 768, LAB_HEIGHT = 384, LAB_CELL = 2;
export interface LabPoint { x: number; y: number }
export interface LabField { x: number; y: number; ticks: number; kind: 'heat' | 'cold' | 'lift'; cells: readonly SimulationCell[] }
export interface LabProjectile extends LabPoint { vx: number; vy: number; age: number; forceful: boolean; cohesive: boolean }
export interface LabFlash extends LabPoint { age: number; kind: 'cast' | 'impact' | 'blocked' }
export interface LabPreview { ok: boolean; reason: string; plan: LabExpression | null; cells: readonly SimulationCell[]; target: LabPoint }
const INITIAL_PLAYER: PlayerMotionState = Object.freeze({ x: 70, y: 322, velocityX: 0, velocityY: 0, grounded: true });
const body = { width: 12, height: 14 };
/** Ephemeral sandbox: no storage, quest/learning ledger, campaign flags or export API. */
export class MagicLab {
  grid = new MaterialGrid(LAB_WIDTH / 2, LAB_HEIGHT / 2);
  readonly locked = new Uint8Array(this.grid.material.length);
  private readonly exclusion = new Uint8Array(this.locked.length);
  player: PlayerMotionState = { ...INITIAL_PLAYER };
  tick = 0;
  mp = 100;
  infiniteMp = true;
  facing: -1 | 1 = 1;
  casts = 0;
  destroyed = 0;
  revision = 0;
  fields: LabField[] = [];
  projectiles: LabProjectile[] = [];
  flashes: LabFlash[] = [];
  private previousJump = false;
  private jumpGrace: PlayerJumpGrace = EMPTY_JUMP_GRACE;
  constructor() { this.reset(); }
  reset(): void {
    this.grid = new MaterialGrid(LAB_WIDTH / 2, LAB_HEIGHT / 2); this.locked.fill(0);
    this.grid.setOccupancy(this.locked); this.grid.setPowderExclusion(this.exclusion);
    const rect = (x: number, y: number, w: number, h: number, material: Material, locked = false) => {
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
        this.grid.setMaterial(px, py, material); if (locked) this.locked[this.grid.index(px, py)] = 1;
      }
    };
    rect(0, 0, 384, 4, Material.Rock, true); rect(0, 182, 384, 10, Material.Rock, true);
    rect(0, 4, 4, 178, Material.Rock, true); rect(380, 4, 4, 178, Material.Rock, true);
    rect(4, 168, 62, 14, Material.Rock, true);
    // Loose geology bed above an unbreakable containment floor.
    for (let x = 66; x < 252; x++) for (let y = 168; y < 182; y++) this.grid.setMaterial(x, y, y < 175 + Math.round(Math.sin(x * .13) * 2) ? Material.Soil : Material.Rock);
    rect(89, 155, 21, 13, Material.Soil); rect(95, 147, 13, 8, Material.Rock);
    rect(120, 147, 9, 21, Material.Wood); rect(118, 144, 13, 3, Material.Wood);
    // Thermodynamics tray. Its metal rim is explicitly locked, its contents are not.
    rect(150, 168, 45, 3, Material.Rock, true); rect(150, 155, 2, 13, Material.Rock, true);
    rect(193, 155, 2, 13, Material.Rock, true); rect(152, 158, 18, 10, Material.Water);
    rect(178, 159, 10, 9, Material.Sand);
    // Right-hand test chamber and pillar cannot be carved, heated away or replaced.
    rect(252, 168, 128, 14, Material.Rock, true); rect(330, 128, 5, 40, Material.Rock, true);
    rect(282, 102, 53, 4, Material.Rock, true); rect(374, 106, 6, 62, Material.Rock, true);
    this.player = { ...INITIAL_PLAYER }; this.tick = 0; this.mp = 100; this.casts = 0; this.destroyed = 0;
    this.fields = []; this.projectiles = []; this.flashes = []; this.previousJump = false; this.jumpGrace = EMPTY_JUMP_GRACE;
    this.facing = 1; this.revision++;
  }
  returnToSafety(): void { this.player = { ...INITIAL_PLAYER }; this.previousJump = false; this.jumpGrace = EMPTY_JUMP_GRACE; }
  pointMaterial(point: LabPoint): Material { return this.grid.getMaterial(Math.floor(point.x / 2), Math.floor(point.y / 2)); }
  isLocked(point: LabPoint): boolean { return !!this.locked[this.grid.index(Math.floor(point.x / 2), Math.floor(point.y / 2))]; }
  // Start inside the caster's body, not beyond an adjacent wall or sand bank.
  // Terrain is still swept from this point; the caster is not a spell obstacle.
  origin(): LabPoint { return { x: this.player.x + body.width / 2, y: this.player.y + body.height / 2 }; }
  preview(source: string, target: LabPoint): LabPreview {
    const parsed = parseLabExpression(source), fail = (reason: string, plan: LabExpression | null = null): LabPreview => ({ ok: false, reason, plan, cells: [], target });
    if (!parsed.ok) return fail(parsed.reason);
    const plan = parsed.plan;
    if (!Number.isFinite(target.x) || !Number.isFinite(target.y) || target.x < 8 || target.y < 8 || target.x >= LAB_WIDTH - 8 || target.y >= LAB_HEIGHT - 8) return fail('瞄准实验场地内部。', plan);
    if (!this.infiniteMp && this.mp < plan.cost) return fail(`需要 ${plan.cost} MP，当前 ${this.mp}。可补满练习 MP。`, plan);
    if (this.fields.length + this.projectiles.length >= 20) return fail('同时存在的法术已达 20 个；等待消散或重置实验。', plan);
    if (plan.motion) {
      return { ok: true, reason: plan.description, plan, target, cells: [] };
    }
    if (this.isLocked(target)) return fail('锁定结构不可改写；可向它发射水流比较碰撞。', plan);
    let cells: readonly SimulationCell[];
    if (plan.element === 'telo' && plan.property === null) {
      const formal = compileTeloCast({ canonicalAst: { head: 'word.telo', lengthModifier: plan.modifier ? `word.${plan.modifier}` : null },
        anchorPx: { x: Math.floor(target.x / 2) * 2, y: Math.floor(target.y / 2) * 2 }, direction: { x: 0, y: 1 },
        currentMp: this.infiniteMp ? 100 : this.mp, worldVersion: this.tick });
      if (!formal.canConfirm) return fail(`构形无法实现：${formal.rejectionCode}`, plan);
      cells = formal.execution.geometry.simulationCells;
    } else {
      const x = Math.floor(target.x / 2), y = Math.floor(target.y / 2), width = plan.width / 2, length = plan.length / 2;
      cells = Array.from({ length: width * length }, (_, i) => ({ x: x - Math.floor(width / 2) + i % width, y: y + Math.floor(i / width) }));
    }
    const creates = ['telo', 'kiwen', 'ko'].includes(plan.element);
    const blocked = (c: SimulationCell) => !this.grid.inBounds(c.x, c.y) || !!this.locked[this.grid.index(c.x, c.y)] || c.x < 4 || c.y < 4 || c.x >= 380 || c.y >= 182;
    if (creates && cells.some(blocked)) return fail('完整构形会碰到锁定结构或场地边界；移动瞄准点。未缩短、未扣 MP。', plan);
    if (!creates) cells = cells.filter(c => {
      if (blocked(c)) return false;
      const cx = target.x / 2, cy = target.y / 2, steps = Math.max(1, Math.ceil(Math.hypot(c.x - cx, c.y - cy)));
      for (let n = 0; n <= steps; n++) if (blocked({ x: Math.floor(cx + (c.x - cx) * n / steps), y: Math.floor(cy + (c.y - cy) * n / steps) })) return false;
      return true;
    });
    if (!cells.length) return fail('作用范围被锁定结构挡住。', plan);
    if (['kiwen', 'ko'].includes(plan.element) && cells.some(c => this.overlapsPlayer(c))) return fail('沙石实体不能直接生成在身体内；气流、热冷、水和冲击可覆盖自己。', plan);
    if (creates && cells.some(c => this.grid.getMaterial(c.x, c.y) !== Material.Air)) return fail('显化需要完整空位；请瞄准材料上方的空气。', plan);
    return { ok: true, reason: plan.description, plan, cells, target };
  }
  cast(source: string, target: LabPoint): LabPreview {
    const result = this.preview(source, target); if (!result.ok || !result.plan) return result;
    const plan = result.plan;
    if (!this.infiniteMp) this.mp -= plan.cost;
    this.casts++;
    if (plan.motion) {
      this.facing = target.x >= this.player.x + 6 ? 1 : -1;
      const origin = this.origin(), dx = target.x - origin.x, dy = target.y - origin.y, length = Math.hypot(dx, dy);
      const speed = plan.forceful ? 220 : plan.property ? 155 : 110;
      // A click exactly on the caster is valid; use facing instead of a NaN vector.
      this.projectiles.push({ ...origin, vx: (length > .001 ? dx / length : this.facing) * speed, vy: (length > .001 ? dy / length : 0) * speed, age: 0, forceful: plan.forceful, cohesive: !!plan.property });
      this.flashes.push({ ...origin, age: 0, kind: 'cast' });
    } else {
      const mat = plan.element === 'telo' ? Material.Water : plan.element === 'kiwen' ? Material.Rock : Material.Sand;
      if (['telo', 'kiwen', 'ko'].includes(plan.element)) for (const c of result.cells) this.grid.setMaterial(c.x, c.y, mat, plan.property === 'lete' ? -1300 : plan.property === 'seli' ? 2100 : 200);
      const kind = plan.element === 'seli' || plan.property === 'seli' ? 'heat' : plan.element === 'lete' || plan.property === 'lete' ? 'cold' : plan.element === 'kon' || plan.property === 'kon' ? 'lift' : null;
      if (kind) this.fields.push({ ...target, kind, ticks: 90, cells: result.cells });
      this.flashes.push({ ...target, age: 0, kind: 'cast' });
    }
    this.revision++; return result;
  }
  advance(input: PlayerMotionInput = { moveX: 0, jump: false }): void {
    const next = stepPlayerMotion({ state: this.player, body, input, previousJump: this.previousJump, jumpGrace: this.jumpGrace,
      fixedSeconds: 1 / 60, collides: b => this.collides(b) });
    this.player = next.state; this.previousJump = next.previousJump; this.jumpGrace = next.jumpGrace!;
    if (input.moveX) this.facing = input.moveX < 0 ? -1 : 1;
    this.tick++;
    if (this.tick % 2 === 0) {
      this.exclusion.fill(0);
      for (let y = Math.floor(this.player.y / 2); y < Math.ceil((this.player.y + 14) / 2); y++) for (let x = Math.floor(this.player.x / 2); x < Math.ceil((this.player.x + 12) / 2); x++) this.exclusion[this.grid.index(x, y)] = 1;
      for (const field of this.fields) {
        for (const c of field.cells) {
          const i = this.grid.index(c.x, c.y); if (this.locked[i]) continue;
          if (field.kind === 'lift') this.grid.lift[i] = 3;
          else this.grid.temperature[i] = Math.max(-1800, Math.min(2200, this.grid.temperature[i]! + (field.kind === 'heat' ? 240 : -240)));
        }
        field.ticks--;
      }
      this.fields = this.fields.filter(f => f.ticks > 0);
      this.grid.tick(); this.revision++;
    }
    this.advanceProjectiles();
    for (const f of this.flashes) f.age++;
    this.flashes = this.flashes.filter(f => f.age < 24).slice(-24);
  }
  private collides(b: Aabb): boolean {
    for (let y = Math.floor(b.y / 2); y < Math.ceil((b.y + b.height - .001) / 2); y++) for (let x = Math.floor(b.x / 2); x < Math.ceil((b.x + b.width - .001) / 2); x++) if (this.grid.isSolid(x, y)) return true;
    return false;
  }
  private overlapsPlayer(c: SimulationCell): boolean {
    return c.x * 2 < this.player.x + 14 && c.x * 2 + 2 > this.player.x - 2 && c.y * 2 < this.player.y + 16 && c.y * 2 + 2 > this.player.y - 2;
  }
  private advanceProjectiles(): void {
    this.projectiles = this.projectiles.filter(p => {
      p.age++;
      if (!p.cohesive) p.vy += 45 / 60;
      const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) / 60));
      for (let step = 0; step < steps; step++) {
        // An already engulfed emitter hits its current cell immediately. Never
        // teleport the projectile out of a solid, and never require free muzzle space.
        const embedded = this.grid.isSolid(Math.floor(p.x / 2), Math.floor(p.y / 2));
        const nx = embedded ? p.x : p.x + p.vx / 60 / steps, ny = embedded ? p.y : p.y + p.vy / 60 / steps;
        const x = Math.floor(nx / 2), y = Math.floor(ny / 2);
        if (this.grid.isSolid(x, y) || p.age > 240) {
          const locked = !this.grid.inBounds(x, y) || !!this.locked[this.grid.index(x, y)];
          if (p.forceful && !locked) this.impact(x, y);
          this.releaseWater(p.x, p.y); this.flashes.push({ x: nx, y: ny, age: 0, kind: locked ? 'blocked' : 'impact' });
          this.revision++; return false;
        }
        p.x = nx; p.y = ny;
      }
      return true;
    });
  }
  private releaseWater(px: number, py: number): void {
    const cx = Math.floor(px / 2), cy = Math.floor(py / 2);
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (!this.grid.inBounds(x, y) || this.locked[this.grid.index(x, y)] || this.grid.getMaterial(x, y) !== Material.Air) continue;
      // A splash cannot appear on the far side of a thin wall simply because
      // that cell lies inside the release radius.
      const steps = Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) * 2));
      let blocked = false;
      for (let n = 0; n <= steps; n++) if (this.grid.isSolid(Math.round(cx + (x - cx) * n / steps), Math.round(cy + (y - cy) * n / steps))) { blocked = true; break; }
      if (!blocked) this.grid.setMaterial(x, y, Material.Water);
    }
  }
  private impact(cx: number, cy: number): void {
    // Cold mechanical impulse, not an explosion/heat spell. Lock mask blocks damage.
    for (let y = cy - 10; y <= cy + 10; y++) for (let x = cx - 10; x <= cx + 10; x++) {
      if (!this.grid.inBounds(x, y)) continue;
      const i = this.grid.index(x, y), distance = Math.hypot(x - cx, y - cy);
      if (distance > 10 || this.locked[i] || !MATERIALS[this.grid.getMaterial(x, y)].destructible) continue;
      let occluded = false;
      for (let n = 0; n <= Math.ceil(distance); n++) {
        const ratio = n / Math.max(1, Math.ceil(distance)), ox = Math.round(cx + (x - cx) * ratio), oy = Math.round(cy + (y - cy) * ratio);
        if (this.locked[this.grid.index(ox, oy)]) { occluded = true; break; }
      }
      if (occluded) continue;
      const damage = Math.round(190 * (1 - distance / 11));
      if (damage >= this.grid.integrity[i]!) { this.grid.setMaterial(x, y, Material.Air); this.destroyed++; }
      else this.grid.integrity[i] -= damage;
    }
  }
}
