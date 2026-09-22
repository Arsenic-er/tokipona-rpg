import { forestMaterialColor, type ForestMaterialExposure } from './forest-material-texture';
import { FOREST_MATERIAL as M } from '../world/forest-chunk-stream';
import { woodlandSoilDepth } from '../world/forest-surface-profile';
type Rgb = readonly [number, number, number];
const INTERIOR = { top: 0, side: false, bottom: false };

/** Quiet buried substrate; exposed loose objects retain their separate material texture. */
export function forestBuriedColor(material: number, x: number, y: number, depth: number, exposure: ForestMaterialExposure = INTERIOR): Rgb {
  if (depth < 0 || (material !== M.soil && material !== M.wet_soil && material !== M.stone && material !== M.wood)) return forestMaterialColor(material, x, y, exposure);
  const edge = exposure.top > 0 || exposure.side || exposure.bottom;
  const grain = (Math.imul(x ^ 1831, 374761393) ^ Math.imul(y ^ 7189, 668265263)) >>> 0;
  const coarse = Math.sin(x / 37 + Math.sin(y / 51)) + Math.sin(y / 27 + x / 93);
  const n = (grain % 7 - 3) + Math.round(coarse * 2);
  let base: Rgb;
  if (material === M.stone) base = [37 + n, 40 + n, 40 + n];
  else if (material === M.wood) base = [46 + n, 39 + n, 29 + n];
  else base = material === M.wet_soil ? [46 + n, 44 + n, 33 + n] : [65 + n, 54 + n, 36 + n];
  if (edge) {
    const surface = forestMaterialColor(material, x, y, exposure);
    return [Math.round(surface[0] * .72 + base[0] * .28), Math.round(surface[1] * .72 + base[1] * .28), Math.round(surface[2] * .72 + base[2] * .28)];
  }
  if (material === M.stone && grain % 97 < 2 && depth < 68) base = [base[0] + 6, base[1] + 6, base[2] + 5];
  const shade = 1 - Math.min(.39, Math.max(0, depth - 12) / 240);
  return [Math.round(base[0] * shade), Math.round(base[1] * shade), Math.round(base[2] * shade)];
}

/** Episode has a continuous solid cross-section, not a second visual floor. */
export function forestEarthProfile(x: number, depth: number, floor: number, damp: boolean): Rgb {
  const soilDepth = woodlandSoilDepth(x);
  const root = depth > 3 && depth < 21 && Math.abs(Math.sin((x + depth * 1.8) / 23 + Math.sin(depth / 4))) > .992;
  const material = root ? M.wood : depth <= soilDepth ? damp ? M.wet_soil : M.soil : M.stone;
  return forestBuriedColor(material, x, floor + depth, depth, { top: depth < 4 ? depth + 1 : 0, side: false, bottom: false });
}
