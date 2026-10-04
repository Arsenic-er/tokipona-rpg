import {LengthCisternSlice,type WorldMaterialEdit} from '../game/length-cistern-slice';
import {Material} from '../sim/materials';
import type {LivingSafetyZone,TeloCanonicalAst,TeloCastPlan} from '../spells/cast-plan';
import type {WindowExpression} from './forest-cistern-window';
export const CISTERN_CALIBRATION={x:170,y:470,width:144,height:64,settleTicks:180} as const;
export interface CalibrationEvent {at:number;kind:'cast'|'tool';expression?:'telo'|'telo lili'}
export interface CalibrationState {version:1;age:number;events:CalibrationEvent[]}
const AST:Record<WindowExpression,TeloCanonicalAst>={
  telo:{head:'word.telo',lengthModifier:null},
  'telo lili':{head:'word.telo',lengthModifier:'word.lili'},
  'telo suli':{head:'word.telo',lengthModifier:'word.suli'},
};
const tank=Array.from({length:96},(_,i)=>({cellX:52+i%12,cellY:5+Math.floor(i/12),material:Material.Water}));
const receiver={receiverId:'forest.cistern.double-valve',boundsCells:{x:25,y:18,width:18,height:12},minimumWaterCells:77};
export function calibrationSolid(x:number,y:number):boolean{
  return x===0||x===71||y===31||(x===23&&y>=3&&y<=17)||
    ((x===24||x===43)&&y>=18&&y<=30)||(y===30&&x>=24&&x<=43)||
    (x===51&&y>=4&&y<=13)||(x===64&&y>=4)||(y===13&&x>=51&&x<=64)||
    (x>=44&&x<=63&&y>=25-Math.floor((x-44)/2));
}
function create(mp:number,max:number):LengthCisternSlice{
  const s=new LengthCisternSlice(72,32,mp,0x43414c,max),edits:WorldMaterialEdit[]=[...tank];
  for(let y=0;y<32;y++)for(let x=0;x<72;x++)if(calibrationSolid(x,y))edits.push({cellX:x,cellY:y,material:Material.Rock});
  s.applyWorldEdits(edits);return s;
}
export function validateCalibrationState(state:CalibrationState):void{
  if(!state||state.version!==1||!Number.isSafeInteger(state.age)||state.age<0||state.age>540||
    !Array.isArray(state.events)||state.events.length<1||state.events.length>3)throw Error('校准阀物理存档无效');
  let prior=-180,tools=0,casts=0;
  for(const e of state.events){
    if(!e||!Number.isSafeInteger(e.at)||e.at<0||e.at>state.age||e.at<prior+180||
      !['cast','tool'].includes(e.kind)||e.kind==='cast'&&!['telo','telo lili'].includes(e.expression!)||
      e.kind==='tool'&&e.expression!==undefined)throw Error('校准阀操作顺序无效');
    if(e.kind==='tool')tools++;else casts++;
    if(tools>1||casts>2||tools&&e!==state.events.at(-1))throw Error('校准阀水源不一致');
    prior=e.at;
  }
  if(state.events[0]!.at!==0||state.age>prior+180)throw Error('校准阀时间边界无效');
}
/** Replay a bounded action timeline, never replaying the authoritative MP transaction. */
export class CisternCalibration{
  private readonly slice:LengthCisternSlice;
  constructor(state?:CalibrationState,mp=100,max=100){
    this.slice=create(mp,max);
    if(!state)return;
    validateCalibrationState(state);
    let age=0;
    for(const e of state.events){
      if(e.at>age)this.slice.advancePhysics(e.at-age);age=e.at;
      if(e.kind==='tool')this.openTool();
      else{const p=this.preview(e.expression!);if(!this.slice.confirm(p,'replay.'+age,[]).committed)throw Error('校准阀施法记录无法重建');}
    }
    if(state.age>age)this.slice.advancePhysics(state.age-age);
  }
  preview(expression:WindowExpression,zones:readonly LivingSafetyZone[]=[]):TeloCastPlan{
    return this.slice.preview({canonicalAst:AST[expression],anchorPx:{x:84,y:16},direction:{x:-1,y:0},livingSafetyZones:zones});
  }
  confirm(p:TeloCastPlan,zones:readonly LivingSafetyZone[]=[]){return this.slice.confirm(p,'cast.'+this.slice.snapshot().worldVersion,zones);}
  openTool():void{
    this.slice.applyWorldEdits([...Array.from({length:12},(_,i)=>({cellX:52+i,cellY:13,material:Material.Air})),
      ...Array.from({length:3},(_,i)=>({cellX:43,cellY:22+i,material:Material.Air}))]);
  }
  advance():void{this.slice.advancePhysics();}
  get collected():number{return this.slice.evaluateReceiver(receiver).waterCells;}
  get satisfied():boolean{return this.slice.evaluateReceiver(receiver).satisfied;}
  cells():number[]{const a:number[]=[];for(let y=0;y<32;y++)for(let x=0;x<72;x++)a.push(this.slice.materialAtCell(x,y));return a;}
}
/** Start replay ledger high enough for history, then quote current player MP on the same live materials. */
export function previewCalibration(state:CalibrationState|undefined,expression:WindowExpression,mp:number,max:number,zones:readonly LivingSafetyZone[]){
  const world=new CisternCalibration(state,mp+(state?.events.reduce((n,e)=>n+(e.kind==='cast'?(e.expression==='telo'?5:6):0),0)??0),
    Math.max(max,mp+20));
  return {world,plan:world.preview(expression,zones)};
}
