export type ForestBuildingKind = 'store' | 'inn' | 'mill' | 'hermit';
type RGB = readonly [number, number, number];
const mix = (n: number) => { n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) >>> 0; };
const grain = (x: number, y: number, seed = 0) => mix(Math.imul(x + seed, 73856093) ^ Math.imul(y, 19349663));
const WOOD: readonly RGB[] = [[36,29,23],[49,38,27],[65,48,31],[82,61,39],[99,77,49],[111,91,62]];
const STONE: readonly RGB[] = [[35,39,37],[47,52,47],[58,62,53],[70,73,61],[83,85,70]];
/** Orthographic native-pixel building, not a resized illustration. Includes its own silhouette/shadows. */
export function rasterForestBuilding(kind: ForestBuildingKind, w: number, h: number) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 60 || w > 256 || h < 40 || h > 160) throw new Error('Invalid building dimensions');
  const width = w + 40, height = h + 88, floor = h + 72, left = 20, eave = 72;
  const data = new Uint8ClampedArray(width * height * 4);
  const p = (x: number, y: number, color: RGB) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < width && y < height) data.set([...color, 255], (y * width + x) * 4); };
  const rect = (x: number, y: number, rw: number, rh: number, color: RGB) => { for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) p(x + dx, y + dy, color); };
  const line = (x: number, y: number, endX: number, endY: number, color: RGB, thickness = 1) => {
    const steps = Math.max(Math.abs(endX - x), Math.abs(endY - y), 1);
    for (let i = 0; i <= steps; i++) rect(Math.round(x + (endX - x) * i / steps), Math.round(y + (endY - y) * i / steps), thickness, thickness, color);
  };
  const beam = (x: number, y: number, rw: number, rh: number) => {
    for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) {
      const along = rw > rh ? dx : dy, across = rw > rh ? dy : dx;
      const seam = (across + Math.floor(Math.sin(along / 13) * .8) + 20) % 4;
      let c = seam === 0 ? 1 : seam === 1 ? 4 : 3;
      if (grain(Math.floor(along / 8), across, x + y) % 5 === 0) c--;
      if (across === (rw > rh ? rh : rw) - 1) c = 0;
      p(x + dx, y + dy, WOOD[Math.max(0, c)]!);
    }
    rect(x + 1, y + 2, 1, 1, [120,110,85]); rect(x + rw - 2, y + rh - 3, 1, 1, [25,28,25]);
  };
  const masonry = (x: number, y: number, rw: number, rh: number) => {
    rect(x, y, rw, rh, STONE[0]!);
    for (let row = 0; row < rh; row += 6) for (let col = -12 + (row % 12 ? 5 : 0); col < rw; col += 11) {
      const color = STONE[1 + grain(col, row, w) % 3]!;
      for (let dy = 0; dy < Math.min(5, rh - row); dy++) for (let dx = 0; dx < 9; dx++) {
        if (col + dx < 0 || col + dx >= rw || (dy === 0 && (dx === 0 || dx === 8))) continue;
        p(x + col + dx, y + row + dy, dy === 0 ? STONE[Math.min(4, 2 + grain(col, row) % 3)]! : color);
      }
    }
  };
  // Foundations extend slightly under the real surface; ground is composited last.
  masonry(left - 2, floor - 13, w + 4, 21);
  for (let y = eave; y < floor - 12; y++) for (let x = left; x < left + w; x++) {
    const g = grain(x, y, kind.length), panel = Math.floor((x - left) / 9);
    let color: RGB;
    if (kind === 'inn' || kind === 'mill') {
      const patch = grain(Math.floor(x / 12), Math.floor(y / 9), w) % 5;
      const base = kind === 'inn' ? 74 : 61;
      const v = base + patch * 3 + (g % 13 === 0 ? 7 : 0) - (y > floor - 29 ? 9 : 0);
      color = [v, v - 5, v - 20];
      if (g % 31 === 0 && y > floor - 35) color = [49,50,38];
    } else {
      const seam = (x - left) % 9;
      let index = seam === 0 ? 0 : seam === 1 ? 3 : 2 + panel % 2;
      if ((x + Math.floor(Math.sin(y / 8 + panel) * 1.8)) % 5 === 0 && grain(panel, Math.floor(y / 7)) % 4 !== 0) index--;
      color = WOOD[Math.max(0, index)]!;
    }
    if (y < eave + 8) color = [Math.floor(color[0] * .65), Math.floor(color[1] * .68), Math.floor(color[2] * .7)];
    p(x, y, color);
  }
  const bay = kind === 'mill' ? 48 : 40;
  for (let x = left + 2; x < left + w - 3; x += bay) beam(x, eave, 5, h - 12);
  beam(left + w - 6, eave, 6, h - 11); beam(left, floor - 16, w, 5);
  if (kind === 'inn' || kind === 'mill') {
    beam(left, eave + Math.floor(h * .44), w, 4);
    for (let x = left + 7; x < left + w - 22; x += bay) {
      line(x, eave + 8, Math.min(left + w - 12, x + bay - 12), eave + Math.floor(h * .42), WOOD[1]!, 4);
      line(x + 1, eave + 8, Math.min(left + w - 11, x + bay - 11), eave + Math.floor(h * .42), WOOD[3]!);
    }
  }
  const door = left + Math.floor(w * .59), doorH = 34;
  rect(door - 3, floor - doorH - 3, 26, doorH + 3, [27,29,24]);
  rect(door, floor - doorH, 20, doorH, [13,22,20]);
  beam(door - 3, floor - doorH, 3, doorH); beam(door + 20, floor - doorH, 4, doorH);
  beam(door - 5, floor - doorH - 4, 31, 5);
  // A half-open shutter, sill and threshold expose depth without fake perspective floors.
  beam(door + 15, floor - doorH + 2, 5, doorH - 2); rect(door + 16, floor - 17, 2, 1, [139,113,61]);
  masonry(door - 5, floor - 4, 31, 5);
  const window = (x: number, y: number, rw = 15, rh = 17) => {
    rect(x - 3, y - 3, rw + 6, rh + 5, [25,30,26]);
    for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) p(x + dx, y + dy, dx > rw / 2 ? [90,80,44] : dy < rh / 2 ? [143,125,70] : [111,96,53]);
    beam(x - 3, y - 2, 3, rh + 4); beam(x + rw, y - 2, 3, rh + 4); beam(x - 4, y + rh, rw + 8, 3);
    beam(x + Math.floor(rw / 2), y, 2, rh); beam(x, y + Math.floor(rh / 2), rw, 2);
    beam(x - 10, y - 1, 6, rh); beam(x + rw + 4, y - 1, 6, rh);
  };
  window(left + 22, floor - 42, kind === 'hermit' ? 11 : 15, kind === 'hermit' ? 13 : 17);
  if (kind === 'inn' || kind === 'mill') window(left + w - 34, floor - 69, 12, 15);
  // Unequal, gently sagging roof. Individual overlapping shingles, not dotted triangles.
  const peak = kind === 'hermit' ? 25 : kind === 'store' ? 32 : 45;
  const roofTop = (x: number) => eave - peak + Math.floor(Math.abs((x - left - w * .48) / (w * .56)) * peak) + Math.floor(Math.sin(x / 17) * .8);
  for (let x = left - 10; x < left + w + 11; x++) {
    const top = roofTop(x);
    for (let y = top; y < eave + 4; y++) {
      const row = Math.floor((y - top) / 4), seam = (x + row * 3) % 7, g = grain(Math.floor((x + row * 3) / 7), row, w);
      let v = 43 + g % 4 * 6;
      if ((y - top) % 4 === 0) v += 9;
      if ((y - top) % 4 === 3 || seam === 0) v -= 13;
      let color: RGB = kind === 'inn' ? [v - 4, v + 1, v + 3] : [v + 7, v + 2, v - 14];
      if ((kind === 'hermit' || x < left + 20) && g % 5 < 2) color = [v - 6, v + 3, v - 18];
      p(x, y, color);
    }
    p(x, top - 1, [34,37,28]);
  }
  beam(left - 10, eave + 3, w + 21, 4);
  for (let x = left + 3; x < left + w; x += 15) beam(x, eave + 7, 3, 4 + grain(x, 4) % 3);
  if (kind === 'inn' || kind === 'hermit') {
    const chimneyX = left + w - (kind === 'hermit' ? 25 : 37), chimneyY = roofTop(chimneyX) - 19;
    masonry(chimneyX, chimneyY, 12, 23); rect(chimneyX - 2, chimneyY - 2, 16, 3, [40,43,38]);
  }
  // Lean-to storage and lived-in objects stay below the established silhouette.
  const sackX = left + 5;
  for (let j = 0; j < 2; j++) {
    rect(sackX + j * 13, floor - 12 - j * 2, 10, 12 + j * 2, [92,80,52]);
    line(sackX + j * 13 + 1, floor - 12 - j * 2, sackX + j * 13 + 8, floor - 12 - j * 2, [132,110,65]);
    line(sackX + j * 13 + 7, floor - 10, sackX + j * 13 + 7, floor - 2, [59,51,35]);
  }
  if (kind === 'store' || kind === 'inn') {
    beam(door + 29, floor - 43, 2, 25); beam(door + 23, floor - 43, 17, 3);
    beam(door + 25, floor - 37, 13, 12); rect(door + 30, floor - 34, 3, 5, [161,143,91]);
  }
  for (let x = left - 2; x < left + w + 3; x++) if (grain(x, 4) % 3 === 0) {
    const mossHeight = 1 + grain(Math.floor(x / 4), 8) % 5;
    for (let y = floor - mossHeight; y < floor + 3; y++) if (grain(x, y) % 3) p(x, y, [49,57,33]);
  }
  return { width, height, offsetX: -left, offsetY: -floor, data };
}
const buildings = new Map<string, { canvas: HTMLCanvasElement; offsetX: number; offsetY: number }>();
export function drawForestBuilding(ctx: CanvasRenderingContext2D, x: number, floor: number, width: number, height: number, kind: ForestBuildingKind): void {
  const key = `${kind}:${width}:${height}`; let cached = buildings.get(key);
  if (!cached) {
    const pixels = rasterForestBuilding(kind, width, height), canvas = document.createElement('canvas'); canvas.width = pixels.width; canvas.height = pixels.height;
    const context = canvas.getContext('2d')!, image = context.createImageData(pixels.width, pixels.height); image.data.set(pixels.data); context.putImageData(image, 0, 0);
    cached = { canvas, offsetX: pixels.offsetX, offsetY: pixels.offsetY }; buildings.set(key, cached);
  }
  ctx.drawImage(cached.canvas, Math.round(x + cached.offsetX), Math.round(floor + cached.offsetY));
}
