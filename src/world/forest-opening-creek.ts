import { MaterialGrid } from '../sim/material-grid';
import type { MaterialGridSave } from '../sim/material-grid-save';
import { Material } from '../sim/materials';
import type { Aabb } from '../runtime/geometry';
import { FOREST_MATERIAL, type ForestMaterial, type ForestMaterialOverlay } from './forest-chunk-stream';
import { intersects } from '../runtime/geometry';
import { ForestOpeningEmbers, type ForestEmbersSave } from './forest-opening-embers';
import { initialForestBodies, readForestBodies, pushForestBody, stepForestBody, type ForestBodyState } from './forest-opening-body';
import { forestBodyFootprint, forestBodyOccupies, forestBodiesOverlap, forestBodyArea, type ForestBodyShape } from './forest-body-shape';

export interface ForestCreekSave {
  readonly schema: 'tokipona.forest-creek.v0.1' | 'tokipona.forest-creek.v0.2' | 'tokipona.forest-creek.v0.3';
  readonly excavatedSoil: number;
  readonly grid: MaterialGridSave;
  readonly bodies?: readonly ForestBodyState[];
  readonly embers?: ForestEmbersSave;
}

const WIDTH = 128;
const HEIGHT = 64;
const SEED = 0x63726565;
const DAM_CELLS = 8 * 12;
const WATER_CELLS = 40 * 10;

export const forestCreekToolBounds = (pocket: Aabb): Aabb =>
  Object.freeze({ x: pocket.x + 64, y: pocket.y + 12, width: 8, height: 12 });

/** One sealed, visible creek depression. No source/sink or offscreen refill. */
export class ForestOpeningCreek implements ForestMaterialOverlay {
  readonly bounds: Aabb;
  readonly integrated: boolean;
  readonly bodyShape: ForestBodyShape;
  private readonly schema: ForestCreekSave['schema'];
  private readonly pocket: Aabb;
  private grid: MaterialGrid;
  private excavatedSoil = 0;
  private steps = 0;
  private projectedCells: readonly number[] | null = null;
  private bodies: readonly ForestBodyState[] = [];
  private embers: ForestOpeningEmbers | null = null;
  private occupancy: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  private occupiedPositions = new Map<string, string>();
  private readonly actorMask=new Uint8Array(WIDTH*HEIGHT);
  private solidsVersion = 0;
  private visualVersion = 0;
  private baseMaterial: (x:number,y:number) => ForestMaterial = () => FOREST_MATERIAL.air;

  constructor(bounds: Aabb, save?: ForestCreekSave, integrated = false) {
    if (bounds.width !== WIDTH || bounds.height !== HEIGHT) throw new Error('creek bounds invalid');
    this.pocket = Object.freeze({ ...bounds });
    this.schema = save ? save.schema : integrated ? 'tokipona.forest-creek.v0.3' : 'tokipona.forest-creek.v0.1';
    if (!['tokipona.forest-creek.v0.1','tokipona.forest-creek.v0.2','tokipona.forest-creek.v0.3'].includes(this.schema)) throw new Error('creek save invalid');
    this.integrated = this.schema !== 'tokipona.forest-creek.v0.1';
    this.bodyShape = this.schema === 'tokipona.forest-creek.v0.3' ? 'chipped-v1' : 'box-v1';
    this.bounds = this.integrated ? Object.freeze({x:1712,y:620,width:416,height:180}) : this.pocket;
    this.grid = new MaterialGrid(WIDTH, HEIGHT, SEED);
    if(this.integrated) this.embers=new ForestOpeningEmbers(save?.embers);
    if (!save) for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      this.grid.setMaterial(x, y, initialMaterial(x, y));
    }
    if (save !== undefined) this.restore(save);
    else if (this.integrated) this.bodies = initialForestBodies();
    if (this.integrated) {
      this.occupancy = this.bodyMask(); this.grid.setOccupancy(this.occupancy);
      for (const body of this.bodies) this.occupiedPositions.set(body.id,
        `${Math.floor(body.x)},${Math.floor(body.y)},${Math.ceil(body.x+body.width-1e-7)},${Math.ceil(body.y+body.height-1e-7)}`);
      if (this.occupancy.some((occupied, i) => occupied && this.grid.material[i] !== Material.Air)) throw new Error('body contains creek material');
    }
  }

  get revision(): number { return this.integrated ? this.visualVersion+this.solidsVersion+(this.embers?.revision??0)
    :this.steps*2+Number(this.opened); }
  get solidRevision(): number { return this.integrated ? this.solidsVersion+(this.embers?.revision??0) : Number(this.opened); }
  get opened(): boolean { return this.excavatedSoil === DAM_CELLS; }
  get bodyStates(): readonly ForestBodyState[] { return this.bodies; }
  get retireStaticWater(): boolean { return this.integrated; }

  /** Broad overlay bounds include travel room. Only these regions own pixels. */
  affectsChunk(bounds:Aabb):boolean {
    return intersects(bounds,this.pocket) || !!this.embers && intersects(bounds,this.embers.bounds) ||
      this.bodies.some(body=>intersects(bounds,{x:Math.floor(body.x),y:Math.floor(body.y),
        width:Math.ceil(body.x+body.width-1e-7)-Math.floor(body.x),
        height:Math.ceil(body.y+body.height-1e-7)-Math.floor(body.y)}));
  }

  bindTerrain(sample: (x:number,y:number) => ForestMaterial): void { this.baseMaterial=sample; }

  push(id: ForestBodyState['id'], direction:-1|1): boolean {
    const selected = this.bodies.find(body => body.id === id);
    if (!selected) return false;
    this.bodies = Object.freeze(this.bodies.map(body => body.id === id ? pushForestBody(body,direction) : body));
    return true;
  }

  private bodyMask(replace?: ForestBodyState): Uint8Array {
    const mask = new Uint8Array(WIDTH * HEIGHT);
    for (const old of this.bodies) {
      const body = replace?.id === old.id ? replace : old;
      const footprint=forestBodyFootprint(body,this.bodyShape);
      for(let row=0;row<footprint.rows.length;row++) {
        const y=footprint.y+row-this.pocket.y, span=footprint.rows[row]!;
        if(y<0 || y>=HEIGHT) continue;
        for(let x=Math.max(0,footprint.x+span.left-this.pocket.x);x<Math.min(WIDTH,footprint.x+span.right-this.pocket.x);x++) mask[y*WIDTH+x]=1;
      }
    }
    return mask;
  }

  private materialSolid(x:number,y:number): boolean {
    const ember=this.embers?.sample(x,y);
    if(ember) return ember.material===Material.Rock || ember.material===Material.Wood;
    const localX=Math.floor(x-this.pocket.x), localY=Math.floor(y-this.pocket.y);
    if (localX>=0 && localY>=0 && localX<WIDTH && localY<HEIGHT) return this.grid.isSolid(localX,localY);
    const m=this.baseMaterial(x,y);
    return m!==FOREST_MATERIAL.air && m!==FOREST_MATERIAL.water && m!==FOREST_MATERIAL.vegetation;
  }

  bodySolid(bounds:Aabb, except:ForestBodyState['id']): boolean {
    if(bounds.x<1712 || bounds.x+bounds.width>2128 || bounds.y<620 || bounds.y+bounds.height>800) return true;
    const candidate={...bounds,id:except};
    if(this.bodies.some(b=>b.id!==except && forestBodiesOverlap(candidate,b,this.bodyShape))) return true;
    const footprint=forestBodyFootprint(candidate,this.bodyShape);
    for(let row=0;row<footprint.rows.length;row++) {
      const span=footprint.rows[row]!;
      for(let x=footprint.x+span.left;x<footprint.x+span.right;x++) if(this.materialSolid(x,footprint.y+row)) return true;
    }
    return false;
  }

  wetFraction(bounds:Aabb): number {
    const left=Math.floor(bounds.x-this.pocket.x), right=Math.ceil(bounds.x+bounds.width-this.pocket.x);
    const top=Math.floor(bounds.y-this.pocket.y), bottom=top+bounds.height;
    let sum=0, samples=0;
    for(const x of [left-2,left-1,right,right+1]) {
      if(x<1 || x>=WIDTH-1) continue;
      for(let y=Math.max(0,top-24);y<Math.min(HEIGHT,bottom+2);y++) if(this.grid.getMaterial(x,y)===Material.Water) {
        sum+=Math.max(0,Math.min(1,(bottom-y)/bounds.height)); samples++; break;
      }
    }
    return samples ? sum/samples : 0;
  }

  playerImmersion(bounds:Aabb): number {
    if (!this.integrated || !intersects(bounds, this.pocket)) return 0;
    let wet=0, total=0;
    for(let y=Math.floor(bounds.y);y<bounds.y+bounds.height;y++) for(let x=Math.floor(bounds.x);x<bounds.x+bounds.width;x++) {
      total++; if(this.grid.getMaterial(Math.floor(x-this.pocket.x),Math.floor(y-this.pocket.y))===Material.Water) wet++;
    }
    return wet/Math.max(1,total);
  }

  private admitBody(bounds:Aabb, id:ForestBodyState['id']): boolean {
    const position = `${Math.floor(bounds.x)},${Math.floor(bounds.y)},${Math.ceil(bounds.x+bounds.width-1e-7)},${Math.ceil(bounds.y+bounds.height-1e-7)}`;
    if (this.occupiedPositions.get(id) === position) return true;
    const body=this.bodies.find(b=>b.id===id)!;
    const mask=this.bodyMask({...body,...bounds});
    if(mask.every((m,i)=>m===this.occupancy[i])) {
      this.occupiedPositions.set(id,position); this.solidsVersion++; return true;
    }
    const relocations: [number,number][]=[];
    const reserved=new Set<number>();
    // Connected-cell search: no water teleport through the solid soil plug/banks.
    for(let from=0;from<mask.length;from++) if(mask[from] && !this.occupancy[from] && this.grid.material[from]!==Material.Air) {
      if(this.grid.material[from]!==Material.Water && this.grid.material[from]!==Material.Steam) return false;
      const queue=[from], seen=new Set([from]); let destination=-1;
      for(let head=0;head<queue.length && destination<0;head++) {
        const index=queue[head]!, x=index%WIDTH, y=Math.floor(index/WIDTH);
        for(const next of [y>0?index-WIDTH:-1,x>0?index-1:-1,x<WIDTH-1?index+1:-1,y<HEIGHT-1?index+WIDTH:-1]) {
          if(next<0 || seen.has(next)) continue; seen.add(next);
          const px=this.pocket.x+next%WIDTH, py=this.pocket.y+Math.floor(next/WIDTH);
          if(this.bodies.some(b=>b.id!==id && forestBodyOccupies(b,this.bodyShape,px,py))) continue;
          const m=this.grid.material[next];
          if(m!==Material.Air && m!==Material.Water && m!==Material.Steam) continue;
          if(m===Material.Air && !mask[next] && !reserved.has(next)) { destination=next; break; }
          queue.push(next);
        }
      }
      if(destination<0) return false;
      reserved.add(destination); relocations.push([from,destination]);
    }
    for(const [from,to] of relocations) this.grid.relocateCell(from,to);
    this.occupancy=mask; this.occupiedPositions.set(id,position); this.grid.setOccupancy(mask); this.projectedCells=null; this.solidsVersion++;
    return true;
  }

  advance(worldTick: number, actor?:Aabb): void {
    if(this.integrated) {
      for(let index=0;index<this.bodies.length;index++) {
        const body=this.bodies[index]!;
        // Transfer contact momentum before resolving the two nonpenetrating bodies.
        if(Math.abs(body.vx)>2) for(let other=0;other<this.bodies.length;other++) {
          if(other===index) continue; const neighbor=this.bodies[other]!;
          if(forestBodiesOverlap({...body,x:body.x+body.vx/60},neighbor,this.bodyShape) && Math.abs(neighbor.vx)<Math.abs(body.vx)) {
            const mass=(b:ForestBodyState)=>forestBodyArea(b,this.bodyShape)*(b.id==='stream.deadwood'?0.65:2.5);
            const shared=(body.vx*mass(body)+neighbor.vx*mass(neighbor))/(mass(body)+mass(neighbor));
            this.bodies=Object.freeze(this.bodies.map((b,i)=>i===index?Object.freeze({...b,vx:shared}):i===other?Object.freeze({...b,vx:shared,touched:b.touched||body.touched}):b));
          }
        }
        const next=stepForestBody(this.bodies[index]!,{
          solid:(box,id)=>this.bodySolid(box,id), wet:box=>this.wetFraction(box), admit:(box,id)=>this.admitBody(box,id),
        },actor,this.bodyShape);
        if(Math.round(body.x)!==Math.round(next.x) || Math.round(body.y)!==Math.round(next.y)) this.solidsVersion++;
        this.bodies=Object.freeze(this.bodies.map((b,i)=>i===index?next:b));
      }
    }
    // Fixed 30 Hz material simulation, independent of display/RAF scheduling.
    if (worldTick % 2 !== 0) return;
    if(this.integrated) {
      this.actorMask.fill(0);
      if(actor) for(let y=Math.max(0,Math.floor(actor.y-this.pocket.y));y<Math.min(HEIGHT,Math.ceil(actor.y+actor.height-this.pocket.y-1e-7));y++)
        for(let x=Math.max(0,Math.floor(actor.x-this.pocket.x));x<Math.min(WIDTH,Math.ceil(actor.x+actor.width-this.pocket.x-1e-7));x++)
          this.actorMask[y*WIDTH+x]=1;
      this.grid.setPowderExclusion(this.actorMask);
    }
    this.embers?.advance(actor);
    const oldMaterials=this.integrated?this.grid.material.slice():undefined;
    this.grid.tick(); this.steps++;
    if(oldMaterials?.some((m,i)=>m!==this.grid.material[i])) {
      this.visualVersion++; this.projectedCells=null;
      if(oldMaterials.some((m,i)=>(m===Material.Sand || this.grid.material[i]===Material.Sand) && m!==this.grid.material[i])) this.solidsVersion++;
    }
    if(!this.integrated) this.projectedCells=null;
  }

  dig(actor?: Aabb): boolean {
    if (this.opened) return false;
    const spoil:number[]=[];
    if(this.integrated) {
      for(let y=11;y>=1 && spoil.length<DAM_CELLS;y--) for(let x=4;x<40 && spoil.length<DAM_CELLS;x++) {
        const index=y*WIDTH+x;
        const cell={x:this.pocket.x+x,y:this.pocket.y+y,width:1,height:1};
        if(this.grid.material[index]===Material.Air && !this.occupancy[index] && (!actor || !intersects(cell,actor))) spoil.push(index);
      }
      if(spoil.length<DAM_CELLS) return false;
    }
    // Only the authored loose-soil plug can be excavated with the ordinary tool.
    // Retain its mass in a spoil ledger; do not erase water or bedrock.
    for (let y = 12; y < 24; y++) for (let x = 64; x < 72; x++) {
      if (this.grid.getMaterial(x, y) !== Material.Soil) throw new Error('creek plug is inconsistent');
      this.grid.setMaterial(x, y, Material.Air); this.excavatedSoil++;
    }
    if(this.integrated) {
      // The excavated soil is moved to the bank as grains, not deleted or counted twice.
      for(const index of spoil) this.grid.setMaterial(index%WIDTH,Math.floor(index/WIDTH),Material.Sand);
      this.solidsVersion++;
    }
    this.projectedCells = null;
    return true;
  }

  materialAt(x: number, y: number): ForestMaterial | null {
    if(this.integrated) for(const body of this.bodies) if(forestBodyOccupies(body,this.bodyShape,x,y))
      return body.id==='stream.deadwood'?FOREST_MATERIAL.wood:FOREST_MATERIAL.stone;
    const ember=this.embers?.sample(x,y);
    if(ember) return ember.material===Material.Rock?FOREST_MATERIAL.stone:ember.material===Material.Wood
      ?ember.burning?FOREST_MATERIAL.ember:FOREST_MATERIAL.wood:ember.material===Material.Ash?FOREST_MATERIAL.ash:FOREST_MATERIAL.air;
    const localX = Math.floor(x - this.pocket.x), localY = Math.floor(y - this.pocket.y);
    if (localX < 0 || localY < 0 || localX >= WIDTH || localY >= HEIGHT) return null;
    const material = this.grid.getMaterial(localX, localY);
    return material === Material.Water ? FOREST_MATERIAL.water : material === Material.Soil
      ? FOREST_MATERIAL.soil : material === Material.Sand ? FOREST_MATERIAL.wet_soil : material === Material.Rock ? FOREST_MATERIAL.stone : FOREST_MATERIAL.air;
  }

  /** Explicit conversion: forest obstacle v0.1 IDs are not generic simulator IDs. */
  cells(): readonly number[] {
    this.projectedCells ??= Object.freeze(Array.from(this.grid.material, material =>
      material === Material.Water ? 1 : material === Material.Soil ? 2 : material === Material.Sand ? 3 : material === Material.Rock ? 7 : 0));
    return this.projectedCells;
  }

  save(): ForestCreekSave {
    return Object.freeze({ schema: this.schema, excavatedSoil: this.excavatedSoil, grid: this.grid.save(),
      ...(this.integrated?{bodies:this.bodies,embers:this.embers!.save()}:{}) });
  }

  private restore(candidate: ForestCreekSave): void {
    const raw = candidate as unknown as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join() !==
      (this.integrated?['schema','excavatedSoil','grid','bodies','embers']:['schema','excavatedSoil','grid']).sort().join() ||
      raw.schema !== this.schema || !(raw.excavatedSoil === 0 || raw.excavatedSoil === DAM_CELLS)) {
      throw new Error('creek save invalid');
    }
    const state = raw.grid as MaterialGridSave;
    if (!state || state.width !== WIDTH || state.height !== HEIGHT) throw new Error('creek dimensions invalid');
    const grid = MaterialGrid.fromSave(state);
    if (state.width !== WIDTH || state.height !== HEIGHT || state.seed !== SEED) throw new Error('creek grid identity invalid');
    let water = 0, powder=0;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const initial = initialMaterial(x, y), current = grid.getMaterial(x, y);
      if (current === Material.Water) water++;
      if(current===Material.Sand) powder++;
      const excavated = x >= 64 && x < 72 && y >= 12 && y < 24 && raw.excavatedSoil === DAM_CELLS;
      if (initial === Material.Rock || initial === Material.Soil && !excavated) {
        if (initial !== current) throw new Error('creek fixed bank was changed');
      } else if (current !== Material.Air && current !== Material.Water && !(this.integrated && current===Material.Sand)) throw new Error('creek free material invalid');
    }
    if (water !== WATER_CELLS) throw new Error('creek water mass invalid');
    if(this.integrated && powder!==raw.excavatedSoil) throw new Error('creek soil mass invalid');
    if(this.integrated) this.bodies=readForestBodies(raw.bodies);
    this.grid = grid; this.steps = state.tick; this.excavatedSoil = raw.excavatedSoil as number;
  }
}

function initialMaterial(x: number, y: number): Material {
  // Closed banks coincide with drawn rock. Top/bottom grid limits are not invisible barriers.
  const floor = x < 4 ? 9 : x >= 124 ? 5 : x < 24 ? 9 + Math.floor((x - 4) * 15 / 20)
    : x < 72 ? 24 : x <= 92 ? 36 : 36 - (x - 92);
  if (y >= floor) return Material.Rock;
  if (x >= 64 && x < 72 && y >= 12) return Material.Soil;
  if (x >= 24 && x < 64 && y >= 14 && y < 24) return Material.Water;
  return Material.Air;
}
