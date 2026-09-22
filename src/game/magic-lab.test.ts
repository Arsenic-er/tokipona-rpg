import { describe, expect, it } from 'vitest';
import { MagicLab } from './magic-lab';
import { Material } from '../sim/materials';
const steps = (lab: MagicLab, count: number) => { for (let n = 0; n < count; n++) lab.advance(); };
describe('isolated material magic laboratory', () => {
  it('water preview equals actual cells and precise MP; invalid or blocked casts have no side effects', () => {
    const lab = new MagicLab(); lab.infiniteMp = false;
    const preview = lab.preview('telo suli', { x: 340, y: 70 });
    expect(preview.ok).toBe(true); expect(preview.cells.length).toBe(192);
    expect(lab.cast('telo suli', { x: 340, y: 70 }).ok).toBe(true);
    for (const c of preview.cells) expect(lab.grid.getMaterial(c.x, c.y)).toBe(Material.Water);
    expect(lab.mp).toBe(90); expect(lab.casts).toBe(1);
    for (const [expression, x, y] of [['telo telo', 50, 50], ['kiwen', 70, 323], ['telo', 660, 290], ['telo', 200, 320], ['seli', NaN, 30]] as const) {
      const before = lab.grid.save(); expect(lab.cast(expression, { x, y }).ok).toBe(false); expect(lab.grid.save()).toEqual(before);
    }
    lab.mp = 1; expect(lab.cast('telo', { x: 200, y: 200 }).ok).toBe(false); expect(lab.mp).toBe(1);
  });
  it('actually burns wood, freezes water, melts ice and conserves the lock mask', () => {
    const lab = new MagicLab();
    const protectedIndices = [...lab.locked.keys()].filter(i => lab.locked[i]);
    expect(lab.cast('seli suli', { x: 248, y: 287 }).ok).toBe(true);
    steps(lab, 190);
    expect([...lab.grid.burning].some(n => n > 0) || lab.grid.getMaterial(123, 148) !== Material.Wood).toBe(true);
    // The tray holds existing water while the field removes heat.
    expect(lab.cast('lete', { x: 322, y: 312 }).ok).toBe(true); steps(lab, 175);
    expect([...lab.grid.material].some(n => n === Material.Ice)).toBe(true);
    const iceCount = [...lab.grid.material].filter(n => n === Material.Ice).length;
    expect(lab.cast('seli', { x: 322, y: 312 }).ok).toBe(true); steps(lab, 180);
    expect([...lab.grid.material].filter(n => n === Material.Ice).length).toBeLessThan(iceCount);
    for (const i of protectedIndices) { expect(lab.grid.material[i]).toBe(Material.Rock); expect(lab.grid.integrity[i]).toBe(255); }
  });
  it('slow flow cannot fracture, forceful water fractures geology and stops at locked walls', () => {
    const lab = new MagicLab();
    lab.cast('telo o tawa', { x: 186, y: 328 }); steps(lab, 150); expect(lab.destroyed).toBe(0);
    for (let shot = 0; shot < 4; shot++) { expect(lab.cast('telo o tawa wawa', { x: 195, y: 326 }).ok).toBe(true); steps(lab, 90); }
    expect(lab.destroyed).toBeGreaterThan(0);
    const locked = [...lab.locked.keys()].filter(i => lab.locked[i]);
    // Use a sandbox-only model position to isolate a locked-pillar collision.
    lab.player = { ...lab.player, x: 584, y: 322, velocityX: 0, velocityY: 0 };
    const count = lab.destroyed;
    for (let shot = 0; shot < 4; shot++) { expect(lab.cast('telo o tawa wawa', { x: 664, y: 312 }).ok).toBe(true); steps(lab, 70); }
    expect(lab.destroyed).toBe(count);
    for (const i of locked) expect(lab.grid.material[i]).toBe(Material.Rock);
  });
  it('bounds spell load, supports finite MP, resets deterministically without touching another instance', () => {
    const lab = new MagicLab(), other = new MagicLab(), before = other.grid.save();
    lab.infiniteMp = false; lab.mp = 3;
    expect(lab.cast('kiwen', { x: 200, y: 100 }).ok).toBe(false);
    lab.infiniteMp = true;
    for (let n = 0; n < 20; n++) expect(lab.cast('seli', { x: 200, y: 100 }).ok).toBe(true);
    expect(lab.cast('seli', { x: 200, y: 100 }).ok).toBe(false);
    lab.reset(); expect(lab.casts).toBe(0); expect(lab.projectiles.length + lab.fields.length).toBe(0); expect(lab.grid.save()).toEqual(before);
    expect(other.grid.save()).toEqual(before);
  });
  it('a splash cannot materialize behind a two-cell containment wall', () => {
    const lab = new MagicLab();
    for (let y = 120; y < 168; y++) for (let x = 50; x < 52; x++) { lab.grid.setMaterial(x, y, Material.Rock); lab.locked[lab.grid.index(x, y)] = 1; }
    expect(lab.cast('telo o tawa', { x: 110, y: 326 }).ok).toBe(true); steps(lab, 30);
    for (let y = 140; y < 168; y++) for (let x = 52; x <= 60; x++) expect(lab.grid.getMaterial(x, y)).not.toBe(Material.Water);
  });
  it('allows self-overlapping fields and water but never materializes solid grains in the body', () => {
    for (const spell of ['seli', 'lete', 'kon', 'telo']) {
      const lab = new MagicLab(); lab.infiniteMp = false;
      const preview = lab.preview(spell, { x: 76, y: 304 });
      expect(preview.ok, `${spell}: ${preview.reason}`).toBe(true);
      expect(preview.cells.some(c => c.x === 38 && c.y === 162)).toBe(true);
      expect(lab.cast(spell, preview.target).ok).toBe(true);
      expect(lab.casts).toBe(1); expect(lab.mp).toBe(100 - preview.plan!.cost);
      if (spell === 'telo') expect(lab.grid.getMaterial(38, 162)).toBe(Material.Water);
      else expect(lab.fields[0]!.cells).toEqual(preview.cells);
    }
    for (const spell of ['kiwen', 'ko']) {
      const lab = new MagicLab(); lab.infiniteMp = false; const before = lab.grid.save();
      expect(lab.cast(spell, { x: 76, y: 304 }).ok).toBe(false);
      expect(lab.mp).toBe(100); expect(lab.casts).toBe(0); expect(lab.grid.save()).toEqual(before);
    }
  });
  it('escapes a sand burial by ordinary impact casts and movement, without teleporting or resetting', () => {
    const lab = new MagicLab(); lab.infiniteMp = false;
    // A fallen bank surrounds the body-sized air pocket on the locked safety floor.
    for (let y = 146; y < 168; y++) for (let x = 25; x < 65; x++) {
      if (x >= 35 && x < 41 && y >= 161) continue;
      lab.grid.setMaterial(x, y, Material.Sand);
    }
    const locked = [...lab.locked.keys()].filter(i => lab.locked[i]);
    for (let n = 0; n < 30; n++) lab.advance({ moveX: 1, jump: false });
    expect(lab.player.x).toBeCloseTo(70); // Reproduces blocked movement before magic.
    for (let shot = 0; shot < 5; shot++) {
      expect(lab.cast('telo o tawa wawa', { x: 140, y: 326 }).ok).toBe(true);
      for (let n = 0; n < 30; n++) lab.advance({ moveX: 1, jump: false });
    }
    // Step over the remaining loose lip with the ordinary jump input.
    for (let n = 0; n < 90; n++) lab.advance({ moveX: 1, jump: n < 20 });
    expect(lab.player.x).toBeGreaterThan(130);
    expect(lab.destroyed).toBeGreaterThan(0); expect(lab.mp).toBe(10);
    for (const i of locked) { expect(lab.grid.material[i]).toBe(Material.Rock); expect(lab.grid.integrity[i]).toBe(255); }
  });
  it('handles an engulfed emitter and zero-distance aim without NaN, while slow water cannot excavate', () => {
    for (const forceful of [false, true]) {
      const lab = new MagicLab(), origin = lab.origin();
      lab.grid.setMaterial(Math.floor(origin.x / 2), Math.floor(origin.y / 2), Material.Sand);
      expect(lab.cast(forceful ? 'telo o tawa wawa' : 'telo o tawa', origin).ok).toBe(true);
      expect(lab.projectiles.every(p => Number.isFinite(p.vx) && Number.isFinite(p.vy))).toBe(true);
      lab.advance(); expect(lab.projectiles).toHaveLength(0);
      if (forceful) expect(lab.destroyed).toBeGreaterThan(0); else expect(lab.destroyed).toBe(0);
    }
  });
  it('cannot spawn past a locked wall immediately touching the caster', () => {
    const lab = new MagicLab();
    for (let y = 140; y < 168; y++) {
      lab.grid.setMaterial(41, y, Material.Rock); lab.locked[lab.grid.index(41, y)] = 1;
      lab.grid.setMaterial(42, y, Material.Wood);
    }
    expect(lab.cast('telo o tawa wawa', { x: 140, y: 329 }).ok).toBe(true); steps(lab, 30);
    expect(lab.destroyed).toBe(0);
    for (let y = 140; y < 168; y++) expect(lab.grid.getMaterial(42, y)).toBe(Material.Wood);
  });
});
