import { describe, expect, it } from "vitest";
import { MaterialGrid } from "./material-grid";
import { Material } from "./materials";

const emptyGrid = (): MaterialGrid => {
  const grid = new MaterialGrid(20, 20, 1234);
  grid.clear(Material.Air);
  return grid;
};

describe("MaterialGrid", () => {
  it("moves water downward under gravity", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 5, Material.Water);
    grid.tick();
    expect(grid.getMaterial(10, 6)).toBe(Material.Water);
    expect(grid.getMaterial(10, 5)).toBe(Material.Air);
  });

  it("lets sand settle through air", () => {
    const grid = emptyGrid();
    grid.setMaterial(8, 4, Material.Sand);
    grid.tick();
    expect(grid.getMaterial(8, 5)).toBe(Material.Sand);
  });

  it("melts heated ice into water", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 10, Material.Ice, 900);
    grid.setMaterial(9, 10, Material.Rock);
    grid.setMaterial(11, 10, Material.Rock);
    grid.setMaterial(9, 11, Material.Rock);
    grid.setMaterial(10, 11, Material.Rock);
    grid.setMaterial(11, 11, Material.Rock);
    let melted = false;
    for (let step = 0; step < 70; step += 1) {
      grid.heatCircle(10, 10, 0, 80);
      grid.tick();
      if (grid.getMaterial(10, 10) === Material.Water) {
        melted = true;
        break;
      }
    }
    expect(melted).toBe(true);
  });

  it("freezes strongly cooled water", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 10, Material.Water, -900);
    grid.setMaterial(9, 10, Material.Rock);
    grid.setMaterial(11, 10, Material.Rock);
    grid.setMaterial(9, 11, Material.Rock);
    grid.setMaterial(10, 11, Material.Rock);
    grid.setMaterial(11, 11, Material.Rock);
    let frozen = false;
    for (let step = 0; step < 70; step += 1) {
      grid.heatCircle(10, 10, 0, -80);
      grid.tick();
      if (grid.getMaterial(10, 10) === Material.Ice) {
        frozen = true;
        break;
      }
    }
    expect(frozen).toBe(true);
  });

  it("ignites hot wood and consumes integrity", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 10, Material.Wood, 900);
    const before = grid.getIntegrity(10, 10);
    for (let step = 0; step < 10; step += 1) grid.tick();
    expect(grid.sample(10, 10).burning).toBeGreaterThan(0);
    expect(grid.getIntegrity(10, 10)).toBeLessThan(before);
  });

  it("uses explosion strength to fracture destructible terrain", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 10, Material.Soil);
    grid.explode(10, 10, 4, 240);
    expect(grid.getMaterial(10, 10)).toBe(Material.Air);
  });

  it("lets a temporary lift field move water upward", () => {
    const grid = emptyGrid();
    grid.setMaterial(10, 10, Material.Water);
    grid.liftCircle(10, 10, 3, 60);
    grid.tick();
    expect(grid.getMaterial(10, 9)).toBe(Material.Water);
  });
});
