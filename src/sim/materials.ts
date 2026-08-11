export enum Material {
  Air = 0,
  Rock = 1,
  Soil = 2,
  Sand = 3,
  Water = 4,
  Wood = 5,
  Ice = 6,
  Ash = 7,
  Steam = 8,
}

export type MaterialPhase = "empty" | "solid" | "powder" | "liquid" | "gas";

export interface MaterialDefinition {
  readonly id: Material;
  readonly nameZh: string;
  readonly phase: MaterialPhase;
  readonly density: number;
  readonly integrity: number;
  readonly destructible: boolean;
  readonly flammable: boolean;
  readonly color: readonly [number, number, number];
}

export const MATERIALS: Record<Material, MaterialDefinition> = {
  [Material.Air]: {
    id: Material.Air,
    nameZh: "空气",
    phase: "empty",
    density: 0,
    integrity: 0,
    destructible: false,
    flammable: false,
    color: [7, 8, 12],
  },
  [Material.Rock]: {
    id: Material.Rock,
    nameZh: "岩石",
    phase: "solid",
    density: 250,
    integrity: 255,
    destructible: true,
    flammable: false,
    color: [47, 47, 49],
  },
  [Material.Soil]: {
    id: Material.Soil,
    nameZh: "泥土",
    phase: "solid",
    density: 170,
    integrity: 100,
    destructible: true,
    flammable: false,
    color: [83, 53, 31],
  },
  [Material.Sand]: {
    id: Material.Sand,
    nameZh: "沙",
    phase: "powder",
    density: 135,
    integrity: 18,
    destructible: true,
    flammable: false,
    color: [166, 123, 62],
  },
  [Material.Water]: {
    id: Material.Water,
    nameZh: "水",
    phase: "liquid",
    density: 100,
    integrity: 1,
    destructible: false,
    flammable: false,
    color: [22, 83, 154],
  },
  [Material.Wood]: {
    id: Material.Wood,
    nameZh: "木",
    phase: "solid",
    density: 80,
    integrity: 82,
    destructible: true,
    flammable: true,
    color: [102, 64, 30],
  },
  [Material.Ice]: {
    id: Material.Ice,
    nameZh: "冰",
    phase: "solid",
    density: 92,
    integrity: 95,
    destructible: true,
    flammable: false,
    color: [142, 202, 222],
  },
  [Material.Ash]: {
    id: Material.Ash,
    nameZh: "灰",
    phase: "powder",
    density: 18,
    integrity: 2,
    destructible: true,
    flammable: false,
    color: [78, 73, 69],
  },
  [Material.Steam]: {
    id: Material.Steam,
    nameZh: "蒸汽",
    phase: "gas",
    density: 4,
    integrity: 1,
    destructible: false,
    flammable: false,
    color: [151, 164, 169],
  },
};

export const isPlayerSolid = (material: Material): boolean => {
  const phase = MATERIALS[material].phase;
  return phase === "solid" || material === Material.Sand;
};
