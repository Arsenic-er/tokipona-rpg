import {LengthCisternSlice,type WorldMaterialEdit} from '../game/length-cistern-slice';
import {Material} from '../sim/materials';
import type {LivingSafetyZone,TeloCanonicalAst,TeloCastPlan} from '../spells/cast-plan';
import type {WindowExpression} from './forest-cistern-window';
export const NODE_WATER={x:64,y:112,columns:84,rows:40,cell:2,ticks:180,initialWater:240} as const;
export const WATER_STAGES=['short','long'] as const;
export type NodeWaterStage=typeof WATER_STAGES[number];
export interface WaterRun {source:'cast'|'tool';age:number}
export interface NodeWaterState {version:1;short?:WaterRun;long?:WaterRun}
export const waterExpression=(stage:NodeWaterStage):WindowExpression=>stage==='short'?'telo lili':'telo suli';
export const nodeWaterCost=(stage:NodeWaterStage)=>stage==='short'?6:10;
const AST:Record<WindowExpression,TeloCanonicalAst>={
 telo:{head:'word.telo',lengthModifier:null},
 'telo lili':{head:'word.telo',lengthModifier:'word.lili'},
 'telo suli':{head:'word.telo',lengthModifier:'word.suli'},
};
export function validateNodeWater(s:NodeWaterState,tick=Number.MAX_SAFE_INTEGER):void{
 if(!s||s.version!==1||Object.keys(s).some(k=>!['version','short','long'].includes(k)))throw Error('地下接水机关状态无效');
 for(const stage of WATER_STAGES){const run=s[stage];if(run!==undefined&&(!run||Object.keys(run).some(k=>!['source','age'].includes(k))||
  !['cast','tool'].includes(run.source)||!Number.isSafeInteger(run.age)||run.age<0||run.age>NODE_WATER.ticks||run.age>tick))
  throw Error('地下接水机关水源或时间无效');}
 if(s.long&&s.short?.age!==NODE_WATER.ticks)throw Error('地下接水机关顺序无效');
 if((s.short?.age??0)+(s.long?.age??0)>tick)throw Error('地下接水机关累计时间无效');
}
function solid(x:number,y:number):boolean{
 return y===0||y===39||x===0||x===15||x>=16&&x<=40||x===81||x>=82||
  ((x===3||x===12)&&y<=7)||(y===7&&x>=3&&x<=12)||
  ((x===41||x===74)&&y<=7)||(y===7&&x>=41&&x<=74)||x===61&&y>=8;
}
function create(mp:number,max:number){
 const slice=new LengthCisternSlice(NODE_WATER.columns,NODE_WATER.rows,mp,0x52454c,max),edits:WorldMaterialEdit[]=[];
 for(let y=0;y<NODE_WATER.rows;y++)for(let x=0;x<NODE_WATER.columns;x++){
  if(solid(x,y))edits.push({cellX:x,cellY:y,material:Material.Rock});
  else if(y>=1&&y<=6&&(x>=4&&x<=11||x>=42&&x<=73))edits.push({cellX:x,cellY:y,material:Material.Water});
 }slice.applyWorldEdits(edits);return slice;
}
/** Two physical basins, shared material simulation and finite gravity-fed backup tanks.
 * Only paid casts add water. The manual route merely removes reservoir floor cells.
 */
export class NodeWaterWorld{
 private readonly slice:LengthCisternSlice;private opened=false;private cellCache?:readonly number[];
 constructor(state?:NodeWaterState,mp=100,max=100){
  this.slice=create(mp,max);if(!state)return;validateNodeWater(state);
  for(const stage of WATER_STAGES){const run=state[stage];if(!run)continue;
   if(stage==='long'&&!this.shortSatisfied)throw Error('地下接水机关窄口尚未接通');
   if(run.source==='tool')this.openTool(stage);
   else if(!this.confirm(this.preview(stage,waterExpression(stage))).committed)throw Error('地下接水机关施法无法重建');
   for(let i=0;i<run.age;i++)this.advance(stage);
   if(stage==='short'&&run.age===NODE_WATER.ticks)this.openBaffle();
  }
 }
 preview(stage:NodeWaterStage,expression=waterExpression(stage),zones:readonly LivingSafetyZone[]=[]):TeloCastPlan{
  return this.slice.preview({canonicalAst:AST[expression],anchorPx:{x:stage==='short'?8:84,y:32},direction:{x:1,y:0},livingSafetyZones:zones});
 }
 confirm(plan:TeloCastPlan,zones:readonly LivingSafetyZone[]=[]){
  const result=this.slice.confirm(plan,'node.water.'+this.slice.snapshot().worldVersion,zones);if(result.committed)this.cellCache=undefined;return result;
 }
 openTool(stage:NodeWaterStage):void{
  const start=stage==='short'?4:42,count=stage==='short'?8:32;
  this.cellCache=undefined;this.slice.applyWorldEdits(Array.from({length:count},(_,i)=>({cellX:start+i,cellY:7,material:Material.Air})));
 }
 openBaffle():void{
  if(this.opened||!this.shortSatisfied)return;
  this.cellCache=undefined;this.slice.applyWorldEdits(Array.from({length:13},(_,i)=>({cellX:61,cellY:8+i,material:Material.Air})));this.opened=true;
 }
 advance(_stage:NodeWaterStage):void{this.slice.advancePhysics();this.cellCache=undefined;}
 private count(x:number,width:number):number{
  return this.slice.evaluateReceiver({receiverId:'node.water.'+x,boundsCells:{x,y:28,width,height:11},minimumWaterCells:24}).waterCells;
 }
 get collected(){return {short:this.count(1,14),left:this.count(41,20),right:this.count(62,19)};}
 get shortSatisfied(){return this.collected.short>=24;}
 get longSatisfied(){const c=this.collected;return this.shortSatisfied&&c.left>=32&&c.right>=32;}
 cells():readonly number[]{if(this.cellCache)return this.cellCache;const cells:number[]=[];for(let y=0;y<NODE_WATER.rows;y++)for(let x=0;x<NODE_WATER.columns;x++)cells.push(this.slice.materialAtCell(x,y));return this.cellCache=Object.freeze(cells);}
 get totalWater(){return this.cells().filter(c=>c===Material.Water).length;}
}
export function previewNodeWaterWorld(state:NodeWaterState|undefined,stage:NodeWaterStage,mp:number,max:number,zones:readonly LivingSafetyZone[]=[]){
 const spent=WATER_STAGES.reduce((n,k)=>n+(state?.[k]?.source==='cast'?nodeWaterCost(k):0),0);
 const world=new NodeWaterWorld(state,mp+spent,Math.max(max,mp+spent));
 return {world,plan:world.preview(stage,waterExpression(stage),zones)};
}
