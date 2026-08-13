export const WORLD_TILE_SIZE_PX = 16;
export const SIMULATION_CELL_SIZE_PX = 2;
export const SIMULATION_CELLS_PER_WORLD_TILE =
  WORLD_TILE_SIZE_PX / SIMULATION_CELL_SIZE_PX;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Aabb {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const worldPixelToSimulationCell = (pixel: number): number =>
  Math.floor(pixel / SIMULATION_CELL_SIZE_PX);

export const simulationCellToWorldPixel = (cell: number): number =>
  cell * SIMULATION_CELL_SIZE_PX;

export const worldTileToSimulationCell = (tile: number): number =>
  tile * SIMULATION_CELLS_PER_WORLD_TILE;

export const simulationCellToWorldTile = (cell: number): number =>
  Math.floor(cell / SIMULATION_CELLS_PER_WORLD_TILE);

export const worldPointToSimulationCell = (point: Vec2): Vec2 => ({
  x: worldPixelToSimulationCell(point.x),
  y: worldPixelToSimulationCell(point.y),
});

export const simulationCellToWorldPoint = (point: Vec2): Vec2 => ({
  x: simulationCellToWorldPixel(point.x),
  y: simulationCellToWorldPixel(point.y),
});

export const intersects = (left: Aabb, right: Aabb): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));
