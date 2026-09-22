import { describe, expect, it, vi } from "vitest";
import { drawForestOpeningTerrain, rasterizeForestOpeningTerrain } from "./forest-opening-terrain";
import { FOREST_MATERIAL, type ForestMaterialChunk } from "../world/forest-chunk-stream";

const chunk: ForestMaterialChunk = { chunkX: 0, chunkY: 0, digest: `sha256:${"a".repeat(64)}`,
  materials: Uint8Array.from({ length: 256 }, (_, i) => i < 128 ? FOREST_MATERIAL.air : FOREST_MATERIAL.soil) };
const camera = { x: 0, y: 0, width: 640, height: 360, facing: "right" as const };
const pixel = (pixels: Uint8ClampedArray, x: number, y: number) => [...pixels.slice((y * 640 + x) * 4, (y * 640 + x) * 4 + 4)];

describe("world-anchored forest material rendering", () => {
  it('invalidates depth shading when surface metadata changes even if solid material bytes do not', () => {
    const target = { createImageData: (w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}), putImageData:vi.fn(), clearRect:vi.fn() };
    const surface = { width:0,height:0,getContext:()=>target };
    const ctx = { canvas:{ownerDocument:{createElement:()=>surface}},drawImage:vi.fn(),fillRect:vi.fn() } as unknown as CanvasRenderingContext2D;
    const a = { ...chunk, materials:new Uint8Array(256).fill(FOREST_MATERIAL.stone), surfaceY:Array(16).fill(0) };
    drawForestOpeningTerrain(ctx, [a], camera);
    const before = target.putImageData.mock.calls[0]![0].data.slice();
    drawForestOpeningTerrain(ctx, [{ ...a, surfaceY:Array(16).fill(-100) }], camera);
    expect(target.putImageData).toHaveBeenCalledTimes(2);
    expect(target.putImageData.mock.calls[1]![0].data).not.toEqual(before);
  });
  it("matches full rasterization at tile borders, including side and lower exposure", () => {
    const tiles: ForestMaterialChunk[] = [];
    for(let cy=-1;cy<=1;cy++) for(let cx=-1;cx<=1;cx++) {
      tiles.push({chunkX:cx,chunkY:cy,digest:`sha256:${String(5+(cy+1)*3+cx).padStart(64,"0")}`,
        materials:Uint8Array.from({length:256},(_,i)=>{
          const x=cx*16+i%16,y=cy*16+Math.floor(i/16);
          return y<3 || x===16 || y===16?FOREST_MATERIAL.air:
            y<9?FOREST_MATERIAL.soil:FOREST_MATERIAL.stone;
        })});
    }
    const uploaded=new Map<string,Uint8ClampedArray>();
    const target={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:(data:{data:Uint8ClampedArray},x:number,y:number)=>uploaded.set(`${x},${y}`,data.data.slice()),
      clearRect:vi.fn()};
    const surface={width:0,height:0,getContext:()=>target};
    const context={canvas:{ownerDocument:{createElement:()=>surface}},drawImage:vi.fn(),fillRect:vi.fn()};
    const cam={...camera,x:-16,y:-16,width:48,height:48};
    drawForestOpeningTerrain(context as unknown as CanvasRenderingContext2D,tiles,cam);
    const full=rasterizeForestOpeningTerrain(tiles,cam);
    const middle=uploaded.get("16,16")!;
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) for(let c=0;c<4;c++) {
      expect(middle[(y*16+x)*4+c]).toBe(full[((y+16)*48+x+16)*4+c]);
    }
  });
  it("refreshes side-neighbor lighting without repainting remote unchanged tiles", () => {
    const target={createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:vi.fn(),clearRect:vi.fn()};
    const surface={width:0,height:0,getContext:()=>target};
    const context={canvas:{ownerDocument:{createElement:()=>surface}},drawImage:vi.fn(),fillRect:vi.fn()};
    const rock={...chunk,materials:new Uint8Array(256).fill(FOREST_MATERIAL.stone)};
    const side={...rock,chunkX:1},remote={...rock,chunkX:4};
    const paint=(tiles:ForestMaterialChunk[])=>drawForestOpeningTerrain(context as unknown as CanvasRenderingContext2D,tiles,camera);
    paint([rock,side,remote]);
    const before=(target.putImageData.mock.calls[0]![0] as {data:Uint8ClampedArray}).data.slice();
    target.putImageData.mockClear();
    paint([rock,{...side,digest:`sha256:${"f".repeat(64)}`,materials:new Uint8Array(256)},remote]);
    expect(target.putImageData).toHaveBeenCalledTimes(2);
    const after=(target.putImageData.mock.calls[0]![0] as {data:Uint8ClampedArray}).data;
    expect(after.some((n,i)=>n!==before[i])).toBe(true);
  });
  it("uploads only changed tiles, refreshes upper-edge shading and clears removed pixels", () => {
    const target = { createImageData: (w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),
      putImageData:vi.fn(), clearRect:vi.fn() };
    const surface={width:0,height:0,getContext:()=>target};
    const context={canvas:{ownerDocument:{createElement:()=>surface}},drawImage:vi.fn(),fillRect:vi.fn()};
    const paint=(tiles:ForestMaterialChunk[])=>drawForestOpeningTerrain(context as unknown as CanvasRenderingContext2D,tiles,camera);
    const lower={...chunk,chunkY:1};
    const right={...chunk,chunkX:1};
    paint([chunk,lower,right]); expect(target.putImageData).toHaveBeenCalledTimes(3);
    paint([{...chunk},lower,right]); expect(target.putImageData).toHaveBeenCalledTimes(3);
    const empty={...chunk,digest:`sha256:${'b'.repeat(64)}` as const,materials:new Uint8Array(256)};
    paint([empty,lower,right]); expect(target.putImageData).toHaveBeenCalledTimes(6);
    expect((target.putImageData.mock.calls[3]![0] as {data:Uint8ClampedArray}).data.every(n=>n===0)).toBe(true);
    paint([empty,lower]); // Bounds resize clears and redraws the remaining tiles.
    expect(target.putImageData).toHaveBeenCalledTimes(8);
    paint([empty,right,lower]);
    target.clearRect.mockClear();
    paint([right,lower]); // Same outer bounds, now a hole where the old tile was.
    expect(target.clearRect).toHaveBeenCalledWith(0,0,16,16);
  });
  it("fills material beyond the old 640x360 limits when zoomed out", () => {
    const expanded = { ...camera, width: 853, height: 480 };
    const farChunk = { ...chunk, chunkX: 50, chunkY: 27 };
    const pixels = rasterizeForestOpeningTerrain([farChunk], expanded);
    expect(pixels.length).toBe(853 * 480 * 4);
    expect(pixels[(440 * 853 + 804) * 4 + 3]).toBe(255);
  });
  it("does not vanish when camera pursuit has fractional coordinates", () => {
    const pixels = rasterizeForestOpeningTerrain([chunk], { ...camera, x: 0.25, y: 0.25 });
    expect(pixel(pixels, 4, 7)[3]).toBe(0);
    expect(pixel(pixels, 4, 8)[3]).toBe(255);
  });
  it("keeps the same world pixel color across camera movement and repeated renders", () => {
    const first = rasterizeForestOpeningTerrain([chunk], camera);
    const moved = rasterizeForestOpeningTerrain([chunk], { ...camera, x: 1 });
    expect(pixel(first, 8, 10)).toEqual(pixel(moved, 7, 10));
    const repeated = rasterizeForestOpeningTerrain([chunk], camera);
    // Compare every RGBA byte directly instead of recursively inspecting 921,600
    // properties in the assertion framework; report the first different byte.
    expect(repeated.byteLength).toBe(first.byteLength);
    expect(repeated.findIndex((byte, index) => byte !== first[index])).toBe(-1);
  });
});
