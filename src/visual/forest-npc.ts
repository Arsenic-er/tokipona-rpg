/** Original native-pixel NPC silhouettes; not recolored player atlas frames. */
export type ForestNpc = 'worker' | 'hermit';
const W = 24, H = 28;
const P = ['#00000000', '#252925', '#4e4536', '#8a6b43', '#bc956b', '#d2b58a', '#636b61', '#929486', '#425444', '#71806a', '#a8aaa0', '#745948'];
export function rasterForestNpc(role: ForestNpc, pose: 0 | 1 = 0): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(W * H * 4);
  const rect = (x: number, y: number, w: number, h: number, ink: number) => {
    const hex = P[ink]!;
    const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) pixels.set(rgb, (py * W + px) * 4);
  };
  if (role === 'worker') {
    // Low cap, exposed sleeves, divided trousers, leather apron and hammer.
    rect(8, 6, 7, 3, 1); rect(9, 5, 5, 2, 6); rect(8, 7, 9, 1, 7);
    rect(10, 8, 5, 4, 4); rect(12, 8, 3, 2, 5); rect(14, 9, 1, 1, pose ? 4 : 1);
    rect(10, 11, 4, 2, 2); rect(8, 12, 8, 8, 6); rect(9, 12, 5, 5, 7);
    rect(7, 13, 2, 5, 7); rect(7, 17, 2, 4, 4); rect(15, 13, 2, 5, 6);
    rect(15, 17, 2, 3, 5); rect(9, 13, 1, 8, 3); rect(13, 13, 1, 8, 3);
    rect(9, 17, 6, 7, 2); rect(10, 17, 4, 6, 3); rect(11, 19, 3, 2, 11);
    rect(8, 23, 3, 3, 6); rect(13, 23, 3, 3, 2); rect(7, 26, 4, 2, 1); rect(13, 26, 4, 2, 1);
    rect(17, 19, 1, 5, 3); rect(16, 18, 4, 2, 6); rect(16, 18, 3, 1, 10);
  } else {
    // Taller hood, narrow shoulders, tapered robe, pale beard, crooked staff.
    rect(11, 2, 3, 2, 8); rect(9, 4, 7, 7, 8); rect(10, 4, 4, 2, 9);
    rect(9, 6, 2, 7, 8); rect(12, 6, 4, 5, 1); rect(13, 7, 3, 3, 4);
    rect(15, 8, 1, 1, pose ? 4 : 1); rect(13, 10, 3, 4, 10); rect(14, 13, 1, 2, 7);
    rect(8, 12, 7, 6, 8); rect(9, 14, 5, 7, 9); rect(7, 17, 9, 5, 8);
    rect(6, 21, 11, 5, 8); rect(9, 20, 2, 6, 9); rect(13, 19, 2, 7, 2);
    rect(8, 16, 8, 1, 3); rect(7, 26, 4, 2, 1); rect(13, 26, 3, 2, 1);
    rect(16, 14, 2, 4, 8); rect(18, 16, 2, 2, 5); rect(20, 4, 1, 24, 3);
    rect(19, 3, 2, 3, 11); rect(19, 2, 1, 2, 3); rect(21, 9, 1, 3, 2);
  }
  return pixels;
}
const sprites = new Map<string, HTMLCanvasElement>();
export function drawForestNpc(ctx: CanvasRenderingContext2D, role: ForestNpc, x: number, floor: number, tick: number): void {
  const pose = tick % 240 > 232 ? 1 : 0, key = `${role}:${pose}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas'); sprite.width = W; sprite.height = H;
    const target = sprite.getContext('2d')!, data = target.createImageData(W, H);
    data.data.set(rasterForestNpc(role, pose)); target.putImageData(data, 0, 0); sprites.set(key, sprite);
  }
  ctx.drawImage(sprite, Math.round(x) - 12, Math.round(floor) - H);
}
