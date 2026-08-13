import { type Aabb, type Vec2, WORLD_TILE_SIZE_PX } from "./geometry";

export interface PlayerBody {
  readonly width: number;
  readonly height: number;
}

export const DEFAULT_PLAYER_BODY: PlayerBody = Object.freeze({
  width: 12,
  height: 14,
});

export interface SceneEntrance {
  readonly id: string;
  /** Player top-left position in world pixels. */
  readonly position: Vec2;
}

export interface SceneExit {
  readonly id: string;
  readonly bounds: Aabb;
  readonly targetSceneId: string;
  readonly targetEntranceId: string;
}

export interface SceneDefinition {
  readonly id: string;
  readonly collisionRows: readonly string[];
  readonly entrances: readonly SceneEntrance[];
  readonly exits: readonly SceneExit[];
  readonly defaultEntranceId?: string;
}

const assertFiniteAabb = (bounds: Aabb, label: string): void => {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error(`${label} must be a finite, positive AABB`);
  }
};

export class SceneRegistry {
  private readonly definitions = new Map<string, SceneDefinition>();
  readonly playerBody: PlayerBody;

  constructor(definitions: readonly SceneDefinition[], playerBody = DEFAULT_PLAYER_BODY) {
    if (playerBody.width <= 0 || playerBody.height <= 0) {
      throw new Error("player body dimensions must be positive");
    }
    this.playerBody = Object.freeze({ ...playerBody });

    for (const definition of definitions) this.register(definition);
    if (this.definitions.size === 0) throw new Error("at least one scene is required");
    this.validateTargets();
  }

  get(sceneId: string): SceneDefinition {
    const definition = this.definitions.get(sceneId);
    if (!definition) throw new Error(`unknown scene: ${sceneId}`);
    return definition;
  }

  has(sceneId: string): boolean {
    return this.definitions.has(sceneId);
  }

  dimensionsPx(sceneId: string): Vec2 {
    const scene = this.get(sceneId);
    return {
      x: scene.collisionRows[0]!.length * WORLD_TILE_SIZE_PX,
      y: scene.collisionRows.length * WORLD_TILE_SIZE_PX,
    };
  }

  entrance(sceneId: string, entranceId?: string): SceneEntrance {
    const scene = this.get(sceneId);
    const resolvedId = entranceId ?? scene.defaultEntranceId ?? scene.entrances[0]?.id;
    const entrance = scene.entrances.find((candidate) => candidate.id === resolvedId);
    if (!entrance) throw new Error(`unknown entrance ${String(resolvedId)} in scene ${sceneId}`);
    return entrance;
  }

  isStaticSolid(sceneId: string, tileX: number, tileY: number): boolean {
    const scene = this.get(sceneId);
    if (
      tileX < 0 ||
      tileY < 0 ||
      tileY >= scene.collisionRows.length ||
      tileX >= scene.collisionRows[0]!.length
    ) {
      return true;
    }
    return scene.collisionRows[tileY]![tileX] === "#";
  }

  private register(definition: SceneDefinition): void {
    if (!definition.id.trim()) throw new Error("scene id must not be empty");
    if (this.definitions.has(definition.id)) throw new Error(`duplicate scene id: ${definition.id}`);
    if (definition.collisionRows.length === 0 || definition.collisionRows[0]!.length === 0) {
      throw new Error(`scene ${definition.id} needs a non-empty collision grid`);
    }
    const width = definition.collisionRows[0]!.length;
    for (const row of definition.collisionRows) {
      if (row.length !== width || /[^.#]/u.test(row)) {
        throw new Error(`scene ${definition.id} collision rows must be equal-width strings of . and #`);
      }
    }
    if (definition.entrances.length === 0) {
      throw new Error(`scene ${definition.id} needs at least one recovery entrance`);
    }
    this.assertUniqueIds(definition.entrances, `entrance in ${definition.id}`);
    this.assertUniqueIds(definition.exits, `exit in ${definition.id}`);
    if (
      definition.defaultEntranceId !== undefined &&
      !definition.entrances.some((entrance) => entrance.id === definition.defaultEntranceId)
    ) {
      throw new Error(`scene ${definition.id} has an unknown default entrance`);
    }

    const widthPx = width * WORLD_TILE_SIZE_PX;
    const heightPx = definition.collisionRows.length * WORLD_TILE_SIZE_PX;
    for (const entrance of definition.entrances) {
      if (!Number.isFinite(entrance.position.x) || !Number.isFinite(entrance.position.y)) {
        throw new Error(`entrance ${entrance.id} in ${definition.id} has a non-finite position`);
      }
      const bounds: Aabb = { ...entrance.position, ...this.playerBody };
      if (!this.boundsInside(bounds, widthPx, heightPx) || this.collidesWithRows(bounds, definition)) {
        throw new Error(`entrance ${entrance.id} in ${definition.id} is blocked or out of bounds`);
      }
    }
    for (const exit of definition.exits) {
      assertFiniteAabb(exit.bounds, `exit ${exit.id} in ${definition.id}`);
      if (!this.boundsInside(exit.bounds, widthPx, heightPx)) {
        throw new Error(`exit ${exit.id} in ${definition.id} is out of bounds`);
      }
    }

    this.definitions.set(definition.id, Object.freeze({
      ...definition,
      collisionRows: Object.freeze([...definition.collisionRows]),
      entrances: Object.freeze(definition.entrances.map((entrance) => Object.freeze({
        ...entrance,
        position: Object.freeze({ ...entrance.position }),
      }))),
      exits: Object.freeze(definition.exits.map((exit) => Object.freeze({
        ...exit,
        bounds: Object.freeze({ ...exit.bounds }),
      }))),
    }));
  }

  private validateTargets(): void {
    for (const scene of this.definitions.values()) {
      for (const exit of scene.exits) {
        if (!this.definitions.has(exit.targetSceneId)) {
          throw new Error(`exit ${scene.id}/${exit.id} targets unknown scene ${exit.targetSceneId}`);
        }
        this.entrance(exit.targetSceneId, exit.targetEntranceId);
      }
    }
  }

  private assertUniqueIds(items: readonly { readonly id: string }[], label: string): void {
    const ids = new Set<string>();
    for (const item of items) {
      if (!item.id.trim() || ids.has(item.id)) throw new Error(`invalid or duplicate ${label}: ${item.id}`);
      ids.add(item.id);
    }
  }

  private collidesWithRows(bounds: Aabb, scene: SceneDefinition): boolean {
    const epsilon = 1e-7;
    const left = Math.floor(bounds.x / WORLD_TILE_SIZE_PX);
    const right = Math.floor((bounds.x + bounds.width - epsilon) / WORLD_TILE_SIZE_PX);
    const top = Math.floor(bounds.y / WORLD_TILE_SIZE_PX);
    const bottom = Math.floor((bounds.y + bounds.height - epsilon) / WORLD_TILE_SIZE_PX);
    for (let tileY = top; tileY <= bottom; tileY += 1) {
      for (let tileX = left; tileX <= right; tileX += 1) {
        if (scene.collisionRows[tileY]?.[tileX] !== ".") return true;
      }
    }
    return false;
  }

  private boundsInside(bounds: Aabb, widthPx: number, heightPx: number): boolean {
    return bounds.x >= 0 && bounds.y >= 0 &&
      bounds.x + bounds.width <= widthPx && bounds.y + bounds.height <= heightPx;
  }
}
