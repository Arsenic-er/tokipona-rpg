import { describe, expect, it } from 'vitest';
import { forestBodyArea, forestBodyFootprint, forestBodyOccupies, forestBodyOverlapsBounds, forestBodiesOverlap } from './forest-body-shape';
import { initialForestBodies } from './forest-opening-body';
import { ForestOpeningCreek } from './forest-opening-creek';
import { FOREST_MATERIAL as M } from './forest-chunk-stream';
import { forestObjectMaterialRuns } from '../visual/forest-material-texture';
import { Material } from '../sim/materials';

const SHAPE = 'chipped-v1' as const;
const pocket = {x:1808,y:704,width:128,height:64};

describe('shared chipped body silhouettes', () => {
  it.each(initialForestBodies())('$id texture, occupancy and contact agree at integer and fractional positions', body => {
    const native = forestBodyFootprint({...body,x:0,y:0},SHAPE);
    expect(forestBodyArea(body,SHAPE)).toBeLessThan(body.width*body.height);
    for (const [x,y] of [[0,0],[0.5,0],[0,0.75],[0.25,0.75],[-0.25,-0.75],[body.x+0.5,body.y+0.5]]) {
      const moved={...body,x:x!,y:y!};
      const f=forestBodyFootprint(moved,SHAPE);
      const runs=forestObjectMaterialRuns(body.id==='stream.deadwood'?'deadwood':'stone',body.width,body.height,
        body.id.endsWith('.b')?1:0,SHAPE,moved.x,moved.y);
      for(let wy=f.y-1;wy<=f.y+f.rows.length;wy++) for(let wx=f.x-1;wx<=f.x+body.width+1;wx++) {
        // Independent reference: rasterize every authored 1 px cell after translation.
        const expected=native.rows.some((r,ny)=>{
          for(let nx=r.left;nx<r.right;nx++) if(moved.x+nx<wx+1 && moved.x+nx+1>wx && moved.y+ny<wy+1 && moved.y+ny+1>wy) return true;
          return false;
        });
        expect(forestBodyOccupies(moved,SHAPE,wx,wy)).toBe(expected);
        expect(forestBodyOverlapsBounds(moved,SHAPE,{x:wx,y:wy,width:1,height:1})).toBe(expected);
        const drawn=runs.filter(r=>r.y===wy-f.y && r.x<=wx-f.x && r.x+r.width>wx-f.x).length;
        expect(drawn).toBe(Number(expected));
      }
    }
  });

  it('leaves clipped corners empty, but blocks the actual stone face and supports its foot', () => {
    const creek=new ForestOpeningCreek(pocket,undefined,true), a=creek.bodyStates[0]!;
    expect(creek.bodyShape).toBe(SHAPE);
    expect(creek.materialAt(a.x,a.y)).toBeNull();
    expect(creek.materialAt(a.x+5,a.y)).toBe(M.stone);
    creek.bindTerrain((x,y)=>x===a.x && y===a.y?M.stone:M.air);
    expect(creek.bodySolid(a,a.id)).toBe(false);
    creek.bindTerrain((x,y)=>x===a.x+5 && y===a.y?M.stone:M.air);
    expect(creek.bodySolid(a,a.id)).toBe(true);
    creek.bindTerrain((_x,y)=>y>=713?M.stone:M.air);
    expect(creek.bodySolid(a,a.id)).toBe(false);
    expect(creek.bodySolid({...a,y:a.y+0.01},a.id)).toBe(true);
  });

  it('allows two empty bounding corners to meet, never two occupied pixels', () => {
    const a={...initialForestBodies()[0]!,x:0,y:0};
    const b={...initialForestBodies()[1]!,x:10,y:10};
    expect(forestBodiesOverlap(a,b,'box-v1')).toBe(true);
    expect(forestBodiesOverlap(a,b,SHAPE)).toBe(false);
    expect(forestBodiesOverlap(a,{...b,x:6,y:4},SHAPE)).toBe(true);
  });

  it('round-trips historical rectangular bodies unchanged and rejects unknown versions', () => {
    const fresh=new ForestOpeningCreek(pocket,undefined,true).save();
    const old={...fresh,schema:'tokipona.forest-creek.v0.2' as const};
    const creek=new ForestOpeningCreek(pocket,old), a=creek.bodyStates[0]!;
    expect(creek.bodyShape).toBe('box-v1');
    expect(creek.save()).toEqual(old);
    expect(creek.materialAt(a.x,a.y)).toBe(M.stone);
    expect(()=>new ForestOpeningCreek(pocket,{...fresh,schema:'unknown'} as never)).toThrow('creek save invalid');
  });

  it('displaces water only from occupied pixels and restores moving silhouettes exactly', () => {
    const creek=new ForestOpeningCreek(pocket,undefined,true);
    creek.bindTerrain((_x,y)=>y>=713?M.stone:M.air);
    creek.push('stream.stone.a',1); creek.push('stream.stone.b',1);
    for(let tick=1;tick<=180;tick++) {
      creek.advance(tick);
      if(tick%6!==0) continue;
      const save=creek.save();
      expect(save.grid.material.filter(m=>m===Material.Water)).toHaveLength(400);
      for(const body of creek.bodyStates) {
        const f=forestBodyFootprint(body,SHAPE);
        for(let row=0;row<f.rows.length;row++) for(let x=f.x+f.rows[row]!.left;x<f.x+f.rows[row]!.right;x++) {
          const px=x-pocket.x,py=f.y+row-pocket.y;
          if(px>=0 && px<128 && py>=0 && py<64) expect(save.grid.material[py*128+px]).toBe(Material.Air);
        }
      }
      expect(new ForestOpeningCreek(pocket,JSON.parse(JSON.stringify(save))).save()).toEqual(save);
    }
  });
});
