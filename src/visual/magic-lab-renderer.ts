import { MagicLab, LAB_WIDTH, LAB_HEIGHT, type LabPreview } from '../game/magic-lab';
import { Material } from '../sim/materials';
import { drawForestOpeningLocalTraveler, type LocalTravelerAtlas } from './browser-local-traveler-atlas';
import { drawForestOpeningCandidateTraveler } from './forest-opening-candidate-traveler';
import { ForestTravelerGait } from './forest-traveler-gait';
import type { ForestOpeningPublicView } from './forest-opening-view';
import { forestMaterialColor } from './forest-material-texture';
const colors = [0, 4, 2, 3, 7, 5, 6, 10, 0];
export class MagicLabRenderer {
  private layer = document.createElement('canvas');
  private context: CanvasRenderingContext2D;
  private pixels: ImageData;
  private terrainRevision = -1;
  private gait = new ForestTravelerGait();
  private resetTick = -1;
  constructor(private readonly atlas: LocalTravelerAtlas | null) {
    this.layer.width = LAB_WIDTH; this.layer.height = LAB_HEIGHT;
    this.context = this.layer.getContext('2d')!; this.pixels = this.context.createImageData(LAB_WIDTH, LAB_HEIGHT);
  }
  draw(ctx: CanvasRenderingContext2D, lab: MagicLab, preview: LabPreview | null): void {
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#101c20'; ctx.fillRect(0, 0, LAB_WIDTH, LAB_HEIGHT);
    // Static distant masonry, visibly separated from the interactive front layer.
    ctx.fillStyle = '#18272b';
    for (let x = 24; x < LAB_WIDTH; x += 88) { ctx.fillRect(x, 16, 7, 340); ctx.fillRect(x + 7, 18, 48, 3); }
    for (let y = 48; y < 350; y += 48) { ctx.fillStyle = '#1c2c2d'; ctx.fillRect(8, y, LAB_WIDTH - 16, 1); }
    ctx.fillStyle = '#213238'; ctx.fillRect(286, 108, 120, 152); ctx.fillStyle = '#111f24'; ctx.fillRect(296, 118, 100, 142);
    ctx.fillStyle = '#354240'; ctx.fillRect(297, 142, 98, 2); ctx.fillRect(342, 118, 2, 142);
    ctx.font = '10px system-ui'; ctx.fillStyle = '#aeb79d'; ctx.textAlign = 'center';
    ctx.fillText('材料试验区 · 可破坏', 280, 47); ctx.fillStyle = '#90b7b8'; ctx.fillText('锁定结构区 · 不可破坏', 623, 47);
    ctx.fillStyle = '#a79872'; ctx.fillText('安全台', 67, 294); ctx.fillText('土 / 岩', 197, 278); ctx.fillText('木料', 248, 278); ctx.fillText('水 / 沙槽', 345, 292);
    if (this.terrainRevision !== lab.revision) { this.paintTerrain(lab); this.terrainRevision = lab.revision; }
    ctx.drawImage(this.layer, 0, 0);
    for (const field of lab.fields) {
      ctx.fillStyle = field.kind === 'heat' ? '#eab56c' : field.kind === 'cold' ? '#a7d9df' : '#b5d0b9';
      for (let j = 0; j < 7; j++) {
        const c = field.cells[(j * 23 + Math.floor(lab.tick / 3)) % field.cells.length]!;
        ctx.fillRect(c.x * 2, c.y * 2 - (lab.tick + j) % 7, 1, 2);
      }
    }
    for (const p of lab.projectiles) {
      ctx.fillStyle = p.forceful ? '#9fdce3' : '#6195a0';
      for (let tail = 1; tail < 10; tail++) ctx.fillRect(Math.round(p.x - p.vx / 60 * tail * .4), Math.round(p.y - p.vy / 60 * tail * .4), tail < 3 ? 2 : 1, 1);
      ctx.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 2, 4, 4);
    }
    for (const f of lab.flashes) {
      ctx.fillStyle = f.kind === 'blocked' ? '#d6bb81' : f.kind === 'impact' ? '#a4bdc6' : '#95bdc2';
      for (let j = 0; j < 8; j++) {
        const angle = j * Math.PI / 4, r = f.age * .55;
        ctx.fillRect(Math.round(f.x + Math.cos(angle) * r), Math.round(f.y + Math.sin(angle) * r), 1, 1);
      }
    }
    if (lab.tick < this.resetTick) this.gait.reset(); this.resetTick = lab.tick;
    const p = lab.player;
    const frame = this.gait.advance(lab.tick, { position: { x: p.x, y: p.y }, velocity: { x: p.velocityX, y: p.velocityY }, grounded: p.grounded, body: { width: 12, height: 14 } }).frame;
    const view: Pick<ForestOpeningPublicView, 'tick' | 'traveler' | 'camera'> = {
      tick: lab.tick, camera: { x: 0, y: 0, width: LAB_WIDTH, height: LAB_HEIGHT, facing: lab.facing < 0 ? 'left' : 'right' },
      traveler: { position: { x: p.x, y: p.y }, visualHeightPx: 19, glow: false, facing: lab.facing, frame,
        animationId: !p.grounded ? p.velocityY < 0 ? 'jump' : 'fall' : Math.abs(p.velocityX) > 52 ? 'run' : Math.abs(p.velocityX) > .5 ? 'walk' : 'idle' },
    };
    if (this.atlas) drawForestOpeningLocalTraveler(ctx, view, this.atlas); else drawForestOpeningCandidateTraveler(ctx, view);
    if (preview) {
      ctx.save(); ctx.globalAlpha = .38; ctx.fillStyle = preview.ok ? '#b3d5bc' : '#d9906d';
      for (const c of preview.cells) ctx.fillRect(c.x * 2, c.y * 2, 1, 1);
      ctx.globalAlpha = .8; const t = preview.target;
      ctx.fillRect(Math.round(t.x) - 5, Math.round(t.y), 11, 1); ctx.fillRect(Math.round(t.x), Math.round(t.y) - 5, 1, 11);
      if (preview.plan?.motion) { const o = lab.origin(); ctx.setLineDash([2, 4]); ctx.strokeStyle = preview.ok ? '#91c0c3' : '#be8064'; ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(t.x, t.y); ctx.stroke(); }
      ctx.restore();
    }
  }
  private paintTerrain(lab: MagicLab): void {
    const pixels = this.pixels.data; pixels.fill(0);
    for (let y = 0; y < lab.grid.height; y++) for (let x = 0; x < lab.grid.width; x++) {
      const i = lab.grid.index(x, y), mat = lab.grid.material[i] as Material; if (mat === Material.Air) continue;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const px = x * 2 + dx, py = y * 2 + dy;
        let rgb: readonly number[];
        if (lab.locked[i]) {
          const seam = py % 16 === 0 || (px + (Math.floor(py / 16) % 2) * 12) % 32 === 0;
          const edge = !lab.isLocked({ x: px, y: py - 2 });
          rgb = edge ? [103, 133, 130] : seam ? [36, 52, 57] : [60, 78, 81];
        } else if (mat === Material.Steam) rgb = [131, 156, 161];
        else rgb = forestMaterialColor(colors[mat]!, px, py);
        if (lab.grid.burning[i]) rgb = (x + y + Math.floor(lab.tick / 4)) % 3 ? [211, 118, 50] : [244, 174, 78];
        pixels.set([rgb[0]!, rgb[1]!, rgb[2]!, mat === Material.Steam ? 150 : 255], (py * LAB_WIDTH + px) * 4);
      }
    }
    this.context.putImageData(this.pixels, 0, 0);
  }
}
