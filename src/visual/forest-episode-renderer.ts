import { ForestEpisode, EPISODE_TARGETS } from '../game/forest-episode';
import type { ForestCameraState } from '../runtime/forest-camera';
import type { ForestOpeningPublicView } from './forest-opening-view';
import { forestMaterialColor } from './forest-material-texture';
import { FOREST_MATERIAL as M } from '../world/forest-chunk-stream';
import { episodeWaterSolid } from '../world/forest-episode-water';
import { drawForestOpeningLocalTraveler, type LocalTravelerAtlas } from './browser-local-traveler-atlas';
import { drawForestOpeningCandidateTraveler } from './forest-opening-candidate-traveler';
import { drawLocalForestBackdrop } from './browser-local-forest-backdrop';
import { drawForestOpeningBackdrop } from './forest-opening-backdrop';
import { drawForestBuilding, type ForestBuildingKind } from './forest-architecture';
import { forestEarthProfile } from './forest-earth-profile';
import { drawForestNpc } from './forest-npc';
import { drawForestEdgeDressing, MEADOW_TREE_ROOTS } from './forest-edge-dressing';

type Backdrop = CanvasImageSource & { naturalWidth: number; naturalHeight: number };
/** Native-pixel architecture/material drawing; private raster assets remain on the existing local-only path. */
export class ForestEpisodeRenderer {
  private terrain = new Map<string, HTMLCanvasElement>();
  private wood = new Map<string, HTMLCanvasElement>();
  constructor(private readonly atlas: LocalTravelerAtlas | null, private readonly backdrop: Backdrop | null) {}
  draw(ctx: CanvasRenderingContext2D, game: ForestEpisode, camera: ForestCameraState, view: ForestOpeningPublicView): void {
    const p = game.state;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1c2a29'; ctx.fillRect(0, 0, camera.width, camera.height);
    if (this.backdrop) drawLocalForestBackdrop(ctx, camera, this.backdrop);
    else drawForestOpeningBackdrop(ctx, camera, 360);
    ctx.fillStyle = 'rgba(19,32,30,.24)'; ctx.fillRect(0, 0, camera.width, camera.height);
    if (p.place === 'settlement') drawForestEdgeDressing(ctx, camera, MEADOW_TREE_ROOTS, x => game.groundAt(x));
    ctx.save(); ctx.translate(-camera.x, -camera.y);
    if (p.place === 'settlement') {
      this.house(ctx, 235, 336, 135, 70, 'store'); this.house(ctx, 600, 336, 164, 92, 'inn');
      this.fence(ctx, 385, 170, x => game.groundAt(x));
      drawForestNpc(ctx, 'worker', 350, game.groundAt(350), p.tick);
      this.lantern(ctx, 390, game.groundAt(390) - 17, p.tick); this.lantern(ctx, 780, game.groundAt(780) - 17, p.tick);
    } else if (p.place === 'mill') {
      this.house(ctx, 745, 336, 214, 108, 'mill');
      this.timber(ctx, 255, 331, 38, 5); this.timber(ctx, 260, 326, 33, 5); this.timber(ctx, 258, 321, 36, 5);
      this.timber(ctx, 670, 266, 7, 69); this.timber(ctx, 672, 264, 56, 7);
      if (game.has('brace')) { ctx.save(); ctx.translate(683, 333); ctx.rotate(-0.35); this.timber(ctx, 0, -64, 6, 64); ctx.restore(); }
      this.wheel(ctx, 677, 301, p.wheelAngle, !game.has('brace'));
      this.timber(ctx, 505, 302, 5, 34); this.timber(ctx, 630, 302, 5, 34);
      this.channel(ctx, game, 'mill', 500, 259);
      this.timber(ctx, 486, game.state.gate ? 272 : 286, 11, 5);
      ctx.fillStyle = '#4d5049'; ctx.fillRect(489, 276, 3, 45);
      this.rock(ctx, 865, 318, 46, 18);
      if (!game.has('repaired')) this.rock(ctx, 864, 313, 49, 8);
      else if (!game.has('medium')) { ctx.fillStyle = '#a79560'; ctx.fillRect(884, 322, 7, 4); ctx.fillStyle = '#477576'; ctx.fillRect(887, 321, 3, 5); }
    } else {
      this.house(ctx, 318, 333, 90, 54, 'hermit');
      drawForestNpc(ctx, 'hermit', 410, game.groundAt(410), p.tick);
      this.rock(ctx, 250, 330, 33, 7); this.rock(ctx, 612, 330, 21, 12); this.rock(ctx, 766, 327, 18, 14);
      this.channel(ctx, game, 'practice', 620, 280);
      // The hermit's pronunciation aids use Latin letters, not invented
      // sitelen pona glyphs presented as language-learning ground truth.
      ctx.fillStyle = '#696554'; ctx.fillRect(597, 321, 10, 10); ctx.fillRect(599, 317, 5, 4);
      ctx.fillStyle = '#77735b'; ctx.fillRect(607, 322, 3, 6);
      if (game.has('intro')) { this.teloLabel(ctx, 586, 306); this.teloLabel(ctx, 782, 314); }
      ctx.fillStyle = '#82775e'; ctx.fillRect(717, 326, 10, 3);
      this.lantern(ctx, 439, 319, p.tick);
    }
    const groundKey = `${p.place}:${game.terrainProfile ?? 'legacy'}`;
    let ground = this.terrain.get(groundKey);
    if (!ground) { ground = this.makeGround(game); this.terrain.set(groundKey, ground); }
    ctx.drawImage(ground, 0, 0);
    for (const t of EPISODE_TARGETS[p.place]) {
      if (t.id.endsWith('road') || t.id === 'return') {
        const y = game.groundAt(t.x);
        this.timber(ctx, t.x - 1, y - 23, 3, 23); this.timber(ctx, t.x - 13, y - 23, 26, 9);
        ctx.fillStyle = '#aca079'; ctx.fillRect(t.x - 6, y - 19, 12, 1);
        ctx.fillRect(t.x + (t.x < 200 ? -6 : 5), y - 20, 1, 3);
      }
    }
    ctx.restore();
    if (this.atlas) drawForestOpeningLocalTraveler(ctx, view, this.atlas);
    else drawForestOpeningCandidateTraveler(ctx, view);
    const near = game.nearest();
    if (near) {
      const x = Math.round(near.x - camera.x), y = Math.round(game.groundAt(near.x) - camera.y - 36);
      ctx.fillStyle = '#d0c495'; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
    }
  }
  private makeGround(game: ForestEpisode): HTMLCanvasElement {
    const place = game.state.place;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 480;
    const ctx = c.getContext('2d')!, image = ctx.createImageData(1024, 480);
    for (let x = 0; x < 1024; x++) {
      const floor = game.groundAt(x);
      for (let y = floor; y < 480; y++) {
        const rgb = forestEarthProfile(x, y - floor, floor, place === 'mill' && x > 480 && x < 760);
        const i = (y * 1024 + x) * 4; image.data[i] = rgb[0]; image.data[i + 1] = rgb[1]; image.data[i + 2] = rgb[2]; image.data[i + 3] = 255;
      }
      const seed = (Math.imul(x + 7, 1274126177) >>> 9) >>> 0;
      const clearing = place === 'settlement' && ((x > 265 && x < 375) || (x > 635 && x < 740));
      const clump = Math.sin(x / 23) + Math.sin(x / 9) > -.2;
      if (!clearing && clump && seed % 11 < 3 && (place !== 'mill' || x < 230 || x > 940)) {
        for (let h = 1; h < 2 + seed % 5; h++) { const i = ((floor - h) * 1024 + x) * 4; image.data.set([58 + seed % 13, 69 + seed % 11, 35, 255], i); }
      } else if (seed % 41 < 2) {
        const i = ((floor - 1) * 1024 + x) * 4; image.data.set([105, 82, 43, 255], i);
      }
    }
    ctx.putImageData(image, 0, 0); return c;
  }
  private channel(ctx: CanvasRenderingContext2D, game: ForestEpisode, kind: 'mill' | 'practice', ox: number, oy: number): void {
    const controls = game.controls(kind), water = game.state[kind];
    for (let y = 0; y < 48; y++) for (let x = 0; x < 160; x++) {
      if (episodeWaterSolid(x, y, controls)) {
        const rgb = forestMaterialColor(kind === 'mill' ? M.wood : M.stone, x + ox, y + oy);
        ctx.fillStyle = `rgb(${rgb.join(',')})`;
      } else if (water.cells[y * 160 + x]) ctx.fillStyle = (x + y) % 9 === 0 ? '#54848a' : '#346b75';
      else continue;
      ctx.fillRect(x + ox, y + oy, 1, 1);
    }
  }
  private teloLabel(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const letters = ['010111010010011', '000111101110011', '110010010010011', '000010101101010'];
    ctx.fillStyle = '#343b31'; ctx.fillRect(x - 2, y - 2, 20, 9); ctx.fillStyle = '#b1a584';
    letters.forEach((mask, column) => [...mask].forEach((bit, i) => { if (bit === '1') ctx.fillRect(x + column * 4 + i % 3, y + Math.floor(i / 3), 1, 1); }));
  }
  private timber(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const key = `${w}:${h}`; let texture = this.wood.get(key);
    if (!texture) {
      texture = document.createElement('canvas'); texture.width = w; texture.height = h;
      const target = texture.getContext('2d')!, image = target.createImageData(w, h);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const rgb = forestMaterialColor(M.wood, w > h ? dx : dy, w > h ? dy : dx);
        const shade = dx === w - 1 || dy === h - 1 ? .62 : 1;
        image.data.set([rgb[0] * shade, rgb[1] * shade, rgb[2] * shade, 255], (dy * w + dx) * 4);
      }
      target.putImageData(image, 0, 0); this.wood.set(key, texture);
    }
    ctx.drawImage(texture, Math.round(x), Math.round(y));
  }
  private rock(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (dy < 2 && (dx < 3 || dx > w - 5)) continue;
      const rgb = forestMaterialColor(M.stone, x + dx, y + dy, { top: dy === 0 ? 1 : 0, side: dx === 0, bottom: dy === h - 1 });
      ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }
  private house(ctx: CanvasRenderingContext2D, x: number, floor: number, w: number, h: number, kind: ForestBuildingKind): void {
    drawForestBuilding(ctx, x, floor, w, h, kind);
  }
  private fence(ctx: CanvasRenderingContext2D, x: number, w: number, ground: (x: number) => number): void {
    for (let i = 0; i < w; i++) { ctx.fillStyle = '#604a30'; ctx.fillRect(x + i, ground(x + i) - 15, 1, 3); }
    for (let i = 0; i < w; i += 30) this.timber(ctx, x + i, ground(x + i) - 21, 4, 21);
  }
  private wheel(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, loose: boolean): void {
    // Integer raster of rotating spokes/paddles avoids smooth vector arcs in the pixel world.
    for (let i = 0; i < 160; i++) {
      const a = i * Math.PI * 2 / 160;
      ctx.fillStyle = i % 4 ? '#735936' : '#9a7847'; ctx.fillRect(Math.round(x + Math.cos(a) * 29), Math.round(y + Math.sin(a) * 29), 2, 2);
    }
    for (let spoke = 0; spoke < 10; spoke++) {
      const a = angle + spoke * Math.PI / 5;
      for (let r = 0; r < 33; r++) { ctx.fillStyle = r > 27 ? '#8e6e43' : '#59432f'; ctx.fillRect(Math.round(x + Math.cos(a) * r + (loose ? Math.sin(angle * 3) : 0)), Math.round(y + Math.sin(a) * r), r > 27 ? 4 : 2, 2); }
    }
    ctx.fillStyle = '#858274'; ctx.fillRect(x - 3, y - 3, 7, 7); ctx.fillStyle = '#3a3a34'; ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  private lantern(ctx: CanvasRenderingContext2D, x: number, y: number, tick: number): void {
    this.timber(ctx, x, y - 16, 3, 32); this.timber(ctx, x, y - 16, 15, 3);
    ctx.fillStyle = '#83733e'; ctx.fillRect(x + 10, y - 11, 6, 10);
    ctx.fillStyle = tick % 60 < 30 ? '#c2aa68' : '#b39b5e'; ctx.fillRect(x + 12, y - 9, 2, 6);
  }
}
