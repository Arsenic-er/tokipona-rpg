import { MATERIALS, Material } from "../sim/materials";
import { MaterialGrid } from "../sim/material-grid";

export const LOGICAL_WIDTH = 270;
export const LOGICAL_HEIGHT = 480;
export const CELL_SCALE = 2;
export const GRID_WIDTH = LOGICAL_WIDTH / CELL_SCALE;
export const GRID_HEIGHT = LOGICAL_HEIGHT / CELL_SCALE;

export type SpellId = "telo" | "seli" | "lete" | "kiwen" | "ko" | "kon";

interface SpellDefinition {
  readonly id: SpellId;
  readonly label: string;
  readonly description: string;
  readonly cost: number;
}

export const SPELLS: readonly SpellDefinition[] = [
  { id: "telo", label: "telo", description: "显化水；随后受重力影响", cost: 5 },
  { id: "seli", label: "seli", description: "输入热量；材料决定后果", cost: 4 },
  { id: "lete", label: "lete", description: "移走热量；可能冷却或冻结", cost: 4 },
  { id: "kiwen", label: "kiwen", description: "显化少量硬质材料", cost: 8 },
  { id: "ko", label: "ko", description: "显化松散沙土", cost: 6 },
  { id: "kon", label: "kon", description: "产生短时上升力场", cost: 3 },
];

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface LabSnapshot {
  readonly selectedSpell: SpellId;
  readonly mp: number;
  readonly maxMp: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetMaterial: string;
  readonly targetTemperature: number;
}

const colorChannel = (base: number, delta: number): number => Math.max(0, Math.min(255, base + delta));

const cellNoise = (x: number, y: number, material: Material): number => {
  let value = Math.imul(x + 31, 0x45d9f3b) ^ Math.imul(y + material * 17, 0x119de1f3);
  value ^= value >>> 16;
  return (value & 15) - 7;
};

export class MaterialLab {
  readonly grid = new MaterialGrid(GRID_WIDTH, GRID_HEIGHT);
  readonly canvas: HTMLCanvasElement;

  private readonly context: CanvasRenderingContext2D;
  private readonly imageData: ImageData;
  private readonly keys = new Set<string>();
  private readonly player: PlayerState = { x: 40, y: 174, vx: 0, vy: 0, onGround: false };
  private selectedSpell: SpellId = "telo";
  private targetX = 70;
  private targetY = 145;
  private mp = 24;
  private readonly maxMp = 24;
  private lastFrame = performance.now();
  private accumulator = 0;
  private running = false;
  private snapshotListener: ((snapshot: LabSnapshot) => void) | undefined;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = LOGICAL_WIDTH;
    this.canvas.height = LOGICAL_HEIGHT;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.context = context;
    this.context.imageSmoothingEnabled = false;
    this.imageData = context.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.bindInput();
    this.reset();
  }

  onSnapshot(listener: (snapshot: LabSnapshot) => void): void {
    this.snapshotListener = listener;
    this.emitSnapshot();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
  }

  selectSpell(id: SpellId): void {
    this.selectedSpell = id;
    this.emitSnapshot();
  }

  meditate(): void {
    this.mp = this.maxMp;
    this.emitSnapshot();
  }

  reset(): void {
    this.generateCave();
    this.player.x = 40;
    this.player.y = 174;
    this.player.vx = 0;
    this.player.vy = 0;
    this.mp = this.maxMp;
    this.emitSnapshot();
  }

  triggerLabBlast(): void {
    this.grid.explode(this.targetX, this.targetY, 10, 230);
    this.emitSnapshot();
  }

  private readonly frame = (time: number): void => {
    if (!this.running) return;
    const delta = Math.min(0.05, (time - this.lastFrame) / 1000);
    this.lastFrame = time;
    this.accumulator += delta;

    this.updatePlayer(delta);
    while (this.accumulator >= 1 / 30) {
      this.grid.tick();
      this.accumulator -= 1 / 30;
    }

    this.render();
    requestAnimationFrame(this.frame);
  };

  private bindInput(): void {
    window.addEventListener("keydown", (event) => {
      this.keys.add(event.key.toLowerCase());
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < SPELLS.length) this.selectSpell(SPELLS[index].id);
      if (event.key.toLowerCase() === "r") this.reset();
      if (event.key.toLowerCase() === "b") this.triggerLabBlast();
    });
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()));
    this.canvas.addEventListener("pointermove", (event) => this.updateTarget(event));
    this.canvas.addEventListener("pointerdown", (event) => {
      this.updateTarget(event);
      this.castSelected();
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  private updateTarget(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.targetX = Math.max(1, Math.min(GRID_WIDTH - 2, Math.floor(((event.clientX - rect.left) / rect.width) * GRID_WIDTH)));
    this.targetY = Math.max(1, Math.min(GRID_HEIGHT - 2, Math.floor(((event.clientY - rect.top) / rect.height) * GRID_HEIGHT)));
    this.emitSnapshot();
  }

  private castSelected(): void {
    const spell = SPELLS.find((entry) => entry.id === this.selectedSpell);
    if (!spell || this.mp < spell.cost) return;
    this.mp -= spell.cost;

    switch (spell.id) {
      case "telo":
        this.grid.fillCircle(this.targetX, this.targetY, 4, Material.Water);
        break;
      case "seli":
        this.grid.heatCircle(this.targetX, this.targetY, 7, 980);
        break;
      case "lete":
        this.grid.heatCircle(this.targetX, this.targetY, 7, -980);
        break;
      case "kiwen":
        this.grid.fillCircle(this.targetX, this.targetY, 3, Material.Rock);
        break;
      case "ko":
        this.grid.fillCircle(this.targetX, this.targetY, 4, Material.Sand);
        break;
      case "kon":
        this.grid.liftCircle(this.targetX, this.targetY, 9, 120);
        break;
    }
    this.emitSnapshot();
  }

  private updatePlayer(delta: number): void {
    const move = (this.keys.has("a") || this.keys.has("arrowleft") ? -1 : 0) +
      (this.keys.has("d") || this.keys.has("arrowright") ? 1 : 0);
    this.player.vx += move * 42 * delta;
    this.player.vx *= Math.pow(0.0006, delta);
    this.player.vx = Math.max(-10, Math.min(10, this.player.vx));
    this.player.vy = Math.min(22, this.player.vy + 36 * delta);

    if ((this.keys.has("w") || this.keys.has("arrowup") || this.keys.has(" ")) && this.player.onGround) {
      this.player.vy = -15;
      this.player.onGround = false;
    }

    this.movePlayer(this.player.vx * delta, 0);
    this.player.onGround = false;
    this.movePlayer(0, this.player.vy * delta);
  }

  private movePlayer(dx: number, dy: number): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let step = 0; step < steps; step += 1) {
      const nextX = this.player.x + dx / steps;
      const nextY = this.player.y + dy / steps;
      if (this.playerCollides(nextX, nextY)) {
        if (dy > 0) this.player.onGround = true;
        if (dx !== 0) this.player.vx = 0;
        if (dy !== 0) this.player.vy = 0;
        return;
      }
      this.player.x = nextX;
      this.player.y = nextY;
    }
  }

  private playerCollides(x: number, y: number): boolean {
    const halfWidth = 1.2;
    const height = 6.2;
    const points = [
      [x - halfWidth, y],
      [x + halfWidth, y],
      [x - halfWidth, y - height],
      [x + halfWidth, y - height],
    ];
    return points.some(([px, py]) => this.grid.isSolid(Math.floor(px), Math.floor(py)));
  }

  private render(): void {
    const pixels = this.imageData.data;
    for (let y = 0; y < GRID_HEIGHT; y += 1) {
      for (let x = 0; x < GRID_WIDTH; x += 1) {
        const i = this.grid.index(x, y);
        const material = this.grid.material[i] as Material;
        const definition = MATERIALS[material];
        const noise = material === Material.Air ? 0 : cellNoise(x, y, material);
        const temperature = this.grid.temperature[i];
        const hot = Math.max(0, temperature - 450) / 30;
        const cold = Math.max(0, -temperature) / 45;
        const red = colorChannel(definition.color[0], noise + hot);
        const green = colorChannel(definition.color[1], noise + hot * 0.35 + cold * 0.3);
        const blue = colorChannel(definition.color[2], noise + cold);

        for (let oy = 0; oy < CELL_SCALE; oy += 1) {
          for (let ox = 0; ox < CELL_SCALE; ox += 1) {
            const logicalX = x * CELL_SCALE + ox;
            const logicalY = y * CELL_SCALE + oy;
            const pixel = (logicalY * LOGICAL_WIDTH + logicalX) * 4;
            pixels[pixel] = red;
            pixels[pixel + 1] = green;
            pixels[pixel + 2] = blue;
            pixels[pixel + 3] = 255;
          }
        }

        if (this.grid.burning[i] > 0 && y > 0) {
          const flameHeight = 1 + Math.floor(this.grid.burning[i] / 80);
          for (let flame = 1; flame <= flameHeight; flame += 1) {
            const logicalX = x * CELL_SCALE + ((x + flame + this.grid.burning[i]) & 1);
            const logicalY = y * CELL_SCALE - flame;
            if (logicalY < 0) continue;
            const pixel = (logicalY * LOGICAL_WIDTH + logicalX) * 4;
            pixels[pixel] = 255;
            pixels[pixel + 1] = flame === 1 ? 166 : 83;
            pixels[pixel + 2] = 20;
            pixels[pixel + 3] = 255;
          }
        }
      }
    }

    this.context.putImageData(this.imageData, 0, 0);
    this.drawPlayer();
    this.drawTarget();
  }

  private drawPlayer(): void {
    const x = Math.round(this.player.x * CELL_SCALE);
    const y = Math.round(this.player.y * CELL_SCALE);
    this.context.fillStyle = "#d5c7a0";
    this.context.fillRect(x - 2, y - 14, 4, 4);
    this.context.fillStyle = "#493b73";
    this.context.fillRect(x - 3, y - 10, 6, 10);
    this.context.fillStyle = "#7062a2";
    this.context.fillRect(x - 6, y - 8, 3, 2);
    this.context.fillStyle = "#15121f";
    this.context.fillRect(x - 2, y - 16, 5, 2);
    this.context.fillRect(x, y - 19, 2, 3);
  }

  private drawTarget(): void {
    const x = this.targetX * CELL_SCALE;
    const y = this.targetY * CELL_SCALE;
    this.context.strokeStyle = "rgba(241, 218, 151, 0.9)";
    this.context.lineWidth = 1;
    this.context.strokeRect(x - 3.5, y - 3.5, 7, 7);
  }

  private generateCave(): void {
    this.grid.clear(Material.Rock);

    for (let y = 1; y < GRID_HEIGHT - 1; y += 1) {
      const center = 70 + Math.sin(y * 0.065) * 10 + Math.sin(y * 0.017) * 7;
      const halfWidth = 18 + Math.sin(y * 0.041) * 5;
      for (let x = 1; x < GRID_WIDTH - 1; x += 1) {
        const edgeNoise = cellNoise(x, y, Material.Soil) * 0.22;
        if (Math.abs(x - center) < halfWidth + edgeNoise) this.grid.setMaterial(x, y, Material.Air);
        else if (Math.abs(x - center) < halfWidth + 9 + edgeNoise) this.grid.setMaterial(x, y, Material.Soil);
      }
    }

    this.carveRect(8, 132, 76, 188);
    this.fillRect(8, 185, 76, 192, Material.Soil);
    this.carveRect(88, 38, 130, 84);
    this.fillRect(94, 47, 127, 73, Material.Water);
    this.fillRect(88, 38, 92, 90, Material.Soil);
    this.fillRect(92, 73, 127, 78, Material.Soil);
    this.carveRect(67, 210, 111, 236);
    this.fillRect(70, 226, 108, 236, Material.Water);
    this.fillRect(22, 100, 49, 114, Material.Sand);
    this.fillRect(22, 114, 49, 117, Material.Soil);
    this.fillRect(89, 148, 93, 181, Material.Wood);
    this.fillRect(85, 148, 97, 151, Material.Wood);
    this.fillRect(103, 174, 108, 205, Material.Ice);
    this.carveRect(34, 166, 47, 184);
  }

  private carveRect(minX: number, minY: number, maxX: number, maxY: number): void {
    this.fillRect(minX, minY, maxX, maxY, Material.Air);
  }

  private fillRect(minX: number, minY: number, maxX: number, maxY: number, material: Material): void {
    for (let y = minY; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) this.grid.setMaterial(x, y, material);
    }
  }

  private emitSnapshot(): void {
    if (!this.snapshotListener) return;
    const sample = this.grid.sample(this.targetX, this.targetY);
    this.snapshotListener({
      selectedSpell: this.selectedSpell,
      mp: this.mp,
      maxMp: this.maxMp,
      targetX: this.targetX,
      targetY: this.targetY,
      targetMaterial: MATERIALS[sample.material].nameZh,
      targetTemperature: sample.temperature / 10,
    });
  }
}
