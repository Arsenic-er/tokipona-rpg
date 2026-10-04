import {LengthCisternSlice,type WorldMaterialEdit} from '../game/length-cistern-slice';
import {Material} from '../sim/materials';
import type {LivingSafetyZone,TeloCanonicalAst,TeloCastPlan} from '../spells/cast-plan';
import type {WindowExpression} from './forest-cistern-window';
export const CISTERN_CALIBRATION={x:170,y:470,width:144,height:64,settleTicks:180} as const;
export interface CalibrationEvent {at:number;kind:'cast'|'tool';expression?:'telo'|'telo lili'}
export interface CalibrationState {version:1|2;age:number;events:CalibrationEvent[]}
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
/** Separate near-side recovery trough from the deep receiver; its intake is above the receiver rim. */
export function calibrationDrainSolid(x:number,y:number):boolean{
  return x===0||x===71||y===31||(x===23&&y>=3&&y<=17)||
    (x===24&&y>=18&&y<=30)||(x===33&&y>=12&&y<=30)||(y===30&&x>=24&&x<=33)||
    (x===51&&y>=1&&y<=10)||(x===64&&y>=1)||(y===10&&x>=51&&x<=64)||
    (x>=34&&x<=63&&y>=18-Math.floor((x-34)/4));
}
function create(mp:number,max:number,version:1|2):LengthCisternSlice{
  const initial=version===1?tank:tank.map(c=>({...c,cellY:c.cellY-3}));
  const s=new LengthCisternSlice(72,32,mp,0x43414c,max),edits:WorldMaterialEdit[]=[...initial];
  const solid=version===1?calibrationSolid:calibrationDrainSolid;
  for(let y=0;y<32;y++)for(let x=0;x<72;x++)if(solid(x,y))edits.push({cellX:x,cellY:y,material:Material.Rock});
  s.applyWorldEdits(edits);return s;
}
export function validateCalibrationState(state:CalibrationState):void{
  if(!state||![1,2].includes(state.version)||!Number.isSafeInteger(state.age)||state.age<0||state.age>540||
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
  private intakeOpen=false;
  readonly version:1|2;
  constructor(state?:CalibrationState,mp=100,max=100,version:1|2=state?.version??2){
    this.version=version;
    this.slice=create(mp,max,version);
    if(!state)return;
    validateCalibrationState(state);
    let age=0;
    for(const e of state.events){
      if(e.at>age)this.slice.advancePhysics(e.at-age);age=e.at;
      if(e.kind==='tool')this.openTool();
      else{const p=this.preview(e.expression!);if(!this.confirm(p).committed)throw Error('校准阀施法记录无法重建');}
    }
    if(state.age>age)this.slice.advancePhysics(state.age-age);
  }
  preview(expression:WindowExpression,zones:readonly LivingSafetyZone[]=[]):TeloCastPlan{
    return this.slice.preview({canonicalAst:AST[expression],anchorPx:{x:84,y:16},direction:{x:-1,y:0},livingSafetyZones:zones});
  }
  confirm(p:TeloCastPlan,zones:readonly LivingSafetyZone[]=[]){
    const result=this.slice.confirm(p,'cast.'+this.slice.snapshot().worldVersion,zones);
    // The far contact is checked against newly manifested physical water, not the expression spelling.
    if(result.committed&&this.version===2&&this.slice.materialAtCell(27,8)===Material.Water)this.openIntake();
    return result;
  }
  private openIntake():void{
    if(this.intakeOpen)return;
    this.slice.applyWorldEdits(Array.from({length:6},(_,i)=>({cellX:33,cellY:12+i,material:Material.Air})));
    this.intakeOpen=true;
  }
  get diverted():boolean{return this.intakeOpen;}
  openTool():void{
    if(this.version===2){
      this.openIntake();
      this.slice.applyWorldEdits(Array.from({length:12},(_,i)=>({cellX:52+i,cellY:10,material:Material.Air})));return;
    }
    this.slice.applyWorldEdits([...Array.from({length:12},(_,i)=>({cellX:52+i,cellY:13,material:Material.Air})),
      ...Array.from({length:3},(_,i)=>({cellX:43,cellY:22+i,material:Material.Air}))]);
  }
  advance():void{this.slice.advancePhysics();}
  private get receiver(){return this.version===1?receiver:{...receiver,boundsCells:{x:25,y:18,width:8,height:12}};}
  get collected():number{return this.slice.evaluateReceiver(this.receiver).waterCells;}
  get satisfied():boolean{return this.slice.evaluateReceiver(this.receiver).satisfied;}
  cells():number[]{const a:number[]=[];for(let y=0;y<32;y++)for(let x=0;x<72;x++)a.push(this.slice.materialAtCell(x,y));return a;}
}
/** Start replay ledger high enough for history, then quote current player MP on the same live materials. */
export function previewCalibration(state:CalibrationState|undefined,expression:WindowExpression,mp:number,max:number,zones:readonly LivingSafetyZone[],version:1|2=state?.version??2){
  const world=new CisternCalibration(state,mp+(state?.events.reduce((n,e)=>n+(e.kind==='cast'?(e.expression==='telo'?5:6):0),0)??0),
    Math.max(max,mp+20),version);
  return {world,plan:world.preview(expression,zones)};
}
