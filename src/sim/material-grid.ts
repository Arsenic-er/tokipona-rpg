import { MATERIALS, Material, isPlayerSolid } from "./materials";

const ROOM_TEMPERATURE = 200;
const MIN_TEMPERATURE = -1800;
const MAX_TEMPERATURE = 2200;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hash = (x: number, y: number, seed: number): number => {
  let value = Math.imul(x + 0x6d2b79f5, 0x1b873593);
  value ^= Math.imul(y + seed, 0x85ebca6b);
  value ^= value >>> 13;
  return (Math.imul(value, 0xc2b2ae35) ^ (value >>> 16)) >>> 0;
};

export interface MaterialSample {
  readonly material: Material;
  readonly temperature: number;
  readonly integrity: number;
  readonly burning: number;
}

export class MaterialGrid {
  readonly width: number;
  readonly height: number;
  readonly material: Uint8Array;
  readonly temperature: Int16Array;
  readonly integrity: Uint8Array;
  readonly phaseProgress: Uint8Array;
  readonly burning: Uint8Array;
  readonly lift: Uint8Array;

  private readonly movedAt: Uint32Array;
  private tickId = 0;
  private thermalTick = 0;
  private readonly seed: number;

  constructor(width: number, height: number, seed = 0x746f6b69) {
    this.width = width;
    this.height = height;
    const size = width * height;
    this.material = new Uint8Array(size);
    this.temperature = new Int16Array(size);
    this.integrity = new Uint8Array(size);
    this.phaseProgress = new Uint8Array(size);
    this.burning = new Uint8Array(size);
    this.lift = new Uint8Array(size);
    this.movedAt = new Uint32Array(size);
    this.seed = seed;
    this.clear();
  }

  clear(material = Material.Air): void {
    this.material.fill(material);
    this.temperature.fill(ROOM_TEMPERATURE);
    this.integrity.fill(MATERIALS[material].integrity);
    this.phaseProgress.fill(0);
    this.burning.fill(0);
    this.lift.fill(0);
    this.movedAt.fill(0);
    this.tickId = 0;
    this.thermalTick = 0;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  getMaterial(x: number, y: number): Material {
    if (!this.inBounds(x, y)) return Material.Rock;
    return this.material[this.index(x, y)] as Material;
  }

  getTemperature(x: number, y: number): number {
    if (!this.inBounds(x, y)) return ROOM_TEMPERATURE;
    return this.temperature[this.index(x, y)];
  }

  getIntegrity(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 255;
    return this.integrity[this.index(x, y)];
  }

  sample(x: number, y: number): MaterialSample {
    if (!this.inBounds(x, y)) {
      return { material: Material.Rock, temperature: ROOM_TEMPERATURE, integrity: 255, burning: 0 };
    }
    const i = this.index(x, y);
    return {
      material: this.material[i] as Material,
      temperature: this.temperature[i],
      integrity: this.integrity[i],
      burning: this.burning[i],
    };
  }

  setMaterial(x: number, y: number, material: Material, temperature = ROOM_TEMPERATURE): void {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.material[i] = material;
    this.temperature[i] = clamp(temperature, MIN_TEMPERATURE, MAX_TEMPERATURE);
    this.integrity[i] = MATERIALS[material].integrity;
    this.phaseProgress[i] = 0;
    this.burning[i] = 0;
    this.lift[i] = 0;
  }

  isSolid(x: number, y: number): boolean {
    return isPlayerSolid(this.getMaterial(x, y));
  }

  fillCircle(cx: number, cy: number, radius: number, material: Material): void {
    this.forCircle(cx, cy, radius, (x, y) => {
      if (this.getMaterial(x, y) === Material.Air || MATERIALS[material].phase === "empty") {
        this.setMaterial(x, y, material);
      }
    });
  }

  heatCircle(cx: number, cy: number, radius: number, delta: number): void {
    this.forCircle(cx, cy, radius, (x, y, distance) => {
      const i = this.index(x, y);
      const falloff = 1 - distance / Math.max(radius, 1);
      this.temperature[i] = clamp(
        this.temperature[i] + Math.round(delta * Math.max(0.15, falloff)),
        MIN_TEMPERATURE,
        MAX_TEMPERATURE,
      );
    });
  }

  liftCircle(cx: number, cy: number, radius: number, duration = 80): void {
    this.forCircle(cx, cy, radius, (x, y, distance) => {
      const i = this.index(x, y);
      const strength = Math.round(duration * (1 - distance / (radius + 1)));
      this.lift[i] = Math.max(this.lift[i], clamp(strength, 8, 255));
    });
  }

  explode(cx: number, cy: number, radius: number, strength: number): void {
    this.forCircle(cx, cy, radius, (x, y, distance) => {
      const i = this.index(x, y);
      const material = this.material[i] as Material;
      const definition = MATERIALS[material];
      const falloff = 1 - distance / Math.max(radius, 1);
      const damage = Math.round(strength * Math.max(0, falloff));
      this.temperature[i] = clamp(this.temperature[i] + Math.round(damage * 3), MIN_TEMPERATURE, MAX_TEMPERATURE);

      if (!definition.destructible || damage <= 0) return;
      if (damage >= this.integrity[i]) {
        if (material === Material.Rock && hash(x, y, this.tickId + this.seed) % 3 === 0) {
          this.setMaterial(x, y, Material.Sand, this.temperature[i]);
        } else if (material === Material.Wood) {
          this.setMaterial(x, y, Material.Ash, this.temperature[i]);
        } else {
          this.setMaterial(x, y, Material.Air, this.temperature[i]);
        }
      } else {
        this.integrity[i] -= damage;
      }
    });
  }

  tick(): void {
    this.tickId += 1;
    this.updateForces();
    this.updateSteam();
    this.updatePowders();
    this.updateLiquids();
    this.updateCombustion();

    this.thermalTick += 1;
    if (this.thermalTick >= 3) {
      this.thermalTick = 0;
      this.updateThermalState();
    }
  }

  private updateForces(): void {
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const i = this.index(x, y);
        if (this.lift[i] === 0) continue;
        this.lift[i] -= 1;
        const material = this.material[i] as Material;
        const phase = MATERIALS[material].phase;
        if (phase === "liquid" || phase === "powder") {
          this.tryMove(x, y, x, y - 1);
        }
      }
    }
  }

  private updateSteam(): void {
    for (let y = 1; y < this.height - 1; y += 1) {
      const leftToRight = (y + this.tickId) % 2 === 0;
      for (let n = 1; n < this.width - 1; n += 1) {
        const x = leftToRight ? n : this.width - 1 - n;
        const i = this.index(x, y);
        if (this.material[i] !== Material.Steam || this.movedAt[i] === this.tickId) continue;
        const direction = hash(x, y, this.tickId + this.seed) % 2 === 0 ? -1 : 1;
        if (this.tryMove(x, y, x, y - 1)) continue;
        if (this.tryMove(x, y, x + direction, y - 1)) continue;
        this.tryMove(x, y, x - direction, y - 1);
      }
    }
  }

  private updatePowders(): void {
    for (let y = this.height - 2; y >= 1; y -= 1) {
      const leftToRight = (y + this.tickId) % 2 === 0;
      for (let n = 1; n < this.width - 1; n += 1) {
        const x = leftToRight ? n : this.width - 1 - n;
        const i = this.index(x, y);
        const material = this.material[i] as Material;
        if (MATERIALS[material].phase !== "powder" || this.movedAt[i] === this.tickId) continue;
        if (this.lift[i] > 0 && this.tryMove(x, y, x, y - 1)) continue;
        const direction = hash(x, y, this.tickId + this.seed) % 2 === 0 ? -1 : 1;
        if (this.tryMove(x, y, x, y + 1)) continue;
        if (this.tryMove(x, y, x + direction, y + 1)) continue;
        this.tryMove(x, y, x - direction, y + 1);
      }
    }
  }

  private updateLiquids(): void {
    for (let y = this.height - 2; y >= 1; y -= 1) {
      const leftToRight = (y + this.tickId) % 2 === 0;
      for (let n = 1; n < this.width - 1; n += 1) {
        const x = leftToRight ? n : this.width - 1 - n;
        const i = this.index(x, y);
        if (this.material[i] !== Material.Water || this.movedAt[i] === this.tickId) continue;
        if (this.lift[i] > 0 && this.tryMove(x, y, x, y - 1)) continue;
        const direction = hash(x, y, this.tickId + this.seed) % 2 === 0 ? -1 : 1;
        if (this.tryMove(x, y, x, y + 1)) continue;
        if (this.tryMove(x, y, x + direction, y + 1)) continue;
        if (this.tryMove(x, y, x - direction, y + 1)) continue;
        if (this.tryMove(x, y, x + direction, y)) continue;
        this.tryMove(x, y, x - direction, y);
      }
    }
  }

  private updateCombustion(): void {
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const i = this.index(x, y);
        const material = this.material[i] as Material;
        if (material === Material.Wood && this.temperature[i] >= 620 && this.burning[i] === 0) {
          this.burning[i] = 20;
        }
        if (this.burning[i] === 0) continue;

        let wetNeighbors = 0;
        const neighbors = [this.index(x - 1, y), this.index(x + 1, y), this.index(x, y - 1), this.index(x, y + 1)];
        for (const neighbor of neighbors) {
          if (this.material[neighbor] === Material.Water) {
            wetNeighbors += 1;
            this.temperature[neighbor] = clamp(this.temperature[neighbor] + 35, MIN_TEMPERATURE, MAX_TEMPERATURE);
          } else {
            this.temperature[neighbor] = clamp(this.temperature[neighbor] + 22, MIN_TEMPERATURE, MAX_TEMPERATURE);
          }
        }

        if (wetNeighbors > 0) {
          this.burning[i] = Math.max(0, this.burning[i] - 28);
          this.temperature[i] = Math.max(ROOM_TEMPERATURE, this.temperature[i] - 90);
          continue;
        }

        this.burning[i] = Math.min(255, this.burning[i] + 7);
        this.temperature[i] = clamp(this.temperature[i] + 12, MIN_TEMPERATURE, MAX_TEMPERATURE);
        if (this.integrity[i] > 1) this.integrity[i] -= 1;
        else this.setMaterial(x, y, hash(x, y, this.tickId) % 3 === 0 ? Material.Ash : Material.Air, 520);
      }
    }
  }

  private updateThermalState(): void {
    const next = new Int16Array(this.temperature);
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const i = this.index(x, y);
        const neighbors = [this.index(x + 1, y), this.index(x, y + 1)];
        for (const neighbor of neighbors) {
          const delta = Math.trunc((this.temperature[i] - this.temperature[neighbor]) / 18);
          if (delta === 0) continue;
          next[i] -= delta;
          next[neighbor] += delta;
        }
        next[i] += Math.trunc((ROOM_TEMPERATURE - next[i]) / 180);
      }
    }
    this.temperature.set(next);

    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const i = this.index(x, y);
        const material = this.material[i] as Material;
        if (material === Material.Ice && this.temperature[i] > 20) {
          this.phaseProgress[i] = Math.min(255, this.phaseProgress[i] + Math.max(3, Math.trunc(this.temperature[i] / 35)));
          if (this.phaseProgress[i] >= 250) this.setMaterial(x, y, Material.Water, 20);
        } else if (material === Material.Water && this.temperature[i] < -20) {
          this.phaseProgress[i] = Math.min(255, this.phaseProgress[i] + Math.max(3, Math.trunc(-this.temperature[i] / 30)));
          if (this.phaseProgress[i] >= 250) this.setMaterial(x, y, Material.Ice, -20);
        } else if (material === Material.Water && this.temperature[i] > 1050) {
          this.phaseProgress[i] = Math.min(255, this.phaseProgress[i] + 18);
          if (this.phaseProgress[i] >= 250) this.setMaterial(x, y, Material.Steam, 1020);
        } else if (material === Material.Steam && this.temperature[i] < 760) {
          this.phaseProgress[i] = Math.min(255, this.phaseProgress[i] + 10);
          if (this.phaseProgress[i] >= 250) this.setMaterial(x, y, Material.Water, 700);
        } else if (this.phaseProgress[i] > 0) {
          this.phaseProgress[i] -= 1;
        }
      }
    }
  }

  private tryMove(fromX: number, fromY: number, toX: number, toY: number): boolean {
    if (!this.inBounds(toX, toY)) return false;
    const from = this.index(fromX, fromY);
    const to = this.index(toX, toY);
    if (this.movedAt[from] === this.tickId || this.movedAt[to] === this.tickId) return false;

    const source = this.material[from] as Material;
    const target = this.material[to] as Material;
    const sourceDefinition = MATERIALS[source];
    const targetDefinition = MATERIALS[target];
    const canDisplace =
      target === Material.Air ||
      (sourceDefinition.phase !== "gas" && targetDefinition.phase === "gas") ||
      (sourceDefinition.phase === "powder" && targetDefinition.phase === "liquid" && sourceDefinition.density > targetDefinition.density);
    if (!canDisplace) return false;

    this.swapCellState(from, to);
    this.movedAt[to] = this.tickId;
    return true;
  }

  private swapCellState(a: number, b: number): void {
    const arrays: Array<Uint8Array | Int16Array> = [
      this.material,
      this.temperature,
      this.integrity,
      this.phaseProgress,
      this.burning,
      this.lift,
    ];
    for (const array of arrays) {
      const value = array[a];
      array[a] = array[b];
      array[b] = value;
    }
  }

  private forCircle(
    cx: number,
    cy: number,
    radius: number,
    visitor: (x: number, y: number, distance: number) => void,
  ): void {
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance <= radius) visitor(x, y, distance);
      }
    }
  }
}
