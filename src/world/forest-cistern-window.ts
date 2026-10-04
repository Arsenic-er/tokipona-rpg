import { LengthCisternSlice, type WorldMaterialEdit } from '../game/length-cistern-slice';
import { Material } from '../sim/materials';
import type { LivingSafetyZone, TeloCanonicalAst, TeloCastPlan } from '../spells/cast-plan';

export const CISTERN_WINDOW = { x: 742, y: 310, width: 128, height: 64, cell: 2, settleTicks: 180 } as const;
export type WindowExpression = 'telo lili' | 'telo' | 'telo suli';
export interface CisternWindowState { source: 'cast' | 'bypass'; age: number }
const AST: Record<WindowExpression, TeloCanonicalAst> = {
  'telo lili': { head: 'word.telo', lengthModifier: 'word.lili' },
  telo: { head: 'word.telo', lengthModifier: null },
  'telo suli': { head: 'word.telo', lengthModifier: 'word.suli' },
};
export const WINDOW_EXPRESSIONS = Object.keys(AST) as WindowExpression[];
const receiver = { receiverId: 'forest.cistern.precision-window', boundsCells: { x: 10, y: 22, width: 9, height: 8 }, minimumWaterCells: 12 };
export function windowSolid(x: number, y: number): boolean {
  // 20 px free axial space: 1.25 world tiles, not enough to silently shorten a default/long cast.
  return y === 31 || x === 0 || x === 63 ||
    (x === 20 && y >= 3 && y <= 18) ||
    ((x === 9 || x === 19) && y >= 20 && y <= 30) ||
    (y === 30 && x >= 9 && x <= 19) ||
    (x === 26 && y >= 5 && y <= 13) || (x === 35 && y >= 5) ||
    (y === 13 && x >= 26 && x <= 35) ||
    // Enclosed sloping return under the tank; water drains left toward the cup.
    (x >= 20 && x <= 34 && y >= 33-Math.floor(x/2));
}
const reservoir = Array.from({length:48}, (_,i) => ({cellX:27+i%8,cellY:7+Math.floor(i/8),material:Material.Water}));
function create(mp: number, maxMp: number): LengthCisternSlice {
  const slice = new LengthCisternSlice(64,32,mp,0x57494e,maxMp), edits: WorldMaterialEdit[] = [...reservoir];
  for (let y=0;y<32;y++) for (let x=0;x<64;x++) if(windowSolid(x,y)) edits.push({cellX:x,cellY:y,material:Material.Rock});
  slice.applyWorldEdits(edits); return slice;
}
export function windowPreview(expression: WindowExpression, mp: number, maxMp: number, zones: readonly LivingSafetyZone[] = []): TeloCastPlan {
  return create(mp,maxMp).preview({canonicalAst:AST[expression],anchorPx:{x:20,y:16},direction:{x:1,y:0},livingSafetyZones:zones});
}
/** Deterministic local water. Persist source+age; reconstruction never charges or grants anything. */
export class CisternWindow {
  private readonly slice: LengthCisternSlice;
  constructor(state?: CisternWindowState) {
    this.slice = create(24,24);
    if (!state) return;
    if (!['cast','bypass'].includes(state.source) || !Number.isSafeInteger(state.age) || state.age<0 || state.age>CISTERN_WINDOW.settleTicks) throw Error('引水窗物理存档无效');
    if (state.source==='cast') {
      const plan = this.slice.preview({canonicalAst:AST['telo lili'],anchorPx:{x:20,y:16},direction:{x:1,y:0}});
      if (!this.slice.confirm(plan,'reconstruct',[]).committed) throw Error('引水窗重建失败');
    } else {
      // Open the tank floor and cup side inlet. Existing water flows through the chute;
      // no particles are teleported, removed or supplied by this mechanical route.
      this.slice.applyWorldEdits([...Array.from({length:8},(_,i)=>({cellX:27+i,cellY:13,material:Material.Air})),
        ...Array.from({length:3},(_,i)=>({cellX:19,cellY:20+i,material:Material.Air}))]);
    }
    if(state.age) this.slice.advancePhysics(state.age);
  }
  advance(): void { this.slice.advancePhysics(); }
  get collected(): number { return this.slice.evaluateReceiver(receiver).waterCells; }
  get satisfied(): boolean { return this.slice.evaluateReceiver(receiver).satisfied; }
  cells(): number[] {
    const cells:number[]=[]; for(let y=0;y<32;y++) for(let x=0;x<64;x++) cells.push(this.slice.materialAtCell(x,y)); return cells;
  }
}
export function executeWindowCast(expression: WindowExpression, mp: number, maxMp: number, zones: readonly LivingSafetyZone[]): { plan: TeloCastPlan; paid: number; committed: boolean } {
  const slice=create(mp,maxMp);
  const plan=slice.preview({canonicalAst:AST[expression],anchorPx:{x:20,y:16},direction:{x:1,y:0},livingSafetyZones:zones});
  const result=slice.confirm(plan,'precision-window',zones);
  return {plan,paid:result.mpCharge,committed:result.committed};
}
