import {LengthCisternSlice,type WorldMaterialEdit} from '../game/length-cistern-slice';
import {Material} from '../sim/materials';
import type {LivingSafetyZone,TeloCanonicalAst,TeloCastPlan} from '../spells/cast-plan';
import type {WindowExpression} from './forest-cistern-window';

export const CISTERN_SIPHON={x:160,y:256,width:224,height:80,columns:112,rows:40,settleTicks:180,
  anchor:{x:24,y:24},contact:{x:41,y:12},minimumWaterCells:96} as const;
export interface SiphonEvent {at:number;kind:'cast'|'tool';expression?:WindowExpression;braced?:boolean}
export interface SiphonState {version:1;age:number;events:SiphonEvent[]}
const AST:Record<WindowExpression,TeloCanonicalAst>={
  telo:{head:'word.telo',lengthModifier:null},
  'telo lili':{head:'word.telo',lengthModifier:'word.lili'},
  'telo suli':{head:'word.telo',lengthModifier:'word.suli'},
};
export const siphonCastCost=(word:WindowExpression)=>word==='telo suli'?10:word==='telo lili'?6:5;
const receiver={receiverId:'forest.cistern.siphon',boundsCells:{x:40,y:23,width:23,height:15},minimumWaterCells:96};
function solid(x:number,y:number):boolean{
  return x===0||x===111||y===39||
    (x===10&&y>=18)||(x===39&&y>=16)||(y===32&&x>=10&&x<=39)||
    (y===38&&x>=39&&x<=63)||(x===82&&y>=1)||
    (x===64&&y>=1&&y<=14)||(y===14&&x>=64&&x<=82)||
    (x>=63&&x<=81&&y>=30-Math.floor((x-63)/2));
}
function create(mp:number,max:number):LengthCisternSlice{
  const s=new LengthCisternSlice(112,40,mp,0x534950,max),edits:WorldMaterialEdit[]=[];
  for(let y=0;y<40;y++)for(let x=0;x<112;x++){
    if(solid(x,y))edits.push({cellX:x,cellY:y,material:Material.Rock});
    else if(x>=65&&x<=80&&y>=2&&y<=13)edits.push({cellX:x,cellY:y,material:Material.Water});
  }
  s.applyWorldEdits(edits);return s;
}
export function validateSiphonState(s:SiphonState):void{
  if(!s||s.version!==1||!Number.isSafeInteger(s.age)||s.age<0||s.age>540||
    !Array.isArray(s.events)||s.events.length<1||s.events.length>3)throw Error('虹吸物理存档无效');
  let prior=-180,casts=0,tools=0;
  for(const e of s.events){
    if(!e||!Number.isSafeInteger(e.at)||e.at<0||e.at>s.age||e.at<prior+180||
      !['cast','tool'].includes(e.kind))throw Error('虹吸操作顺序无效');
    if(e.kind==='cast'){
      casts++;
      if(!Object.hasOwn(AST,e.expression??'')||typeof e.braced!=='boolean'||
        e.expression==='telo suli'&&!e.braced)throw Error('虹吸支撑或表达记录无效');
    }else{
      tools++;
      if(e.expression!==undefined||e.braced!==undefined||e!==s.events.at(-1))throw Error('虹吸水箱记录无效');
    }
    if(casts>2||tools>1)throw Error('虹吸水源次数无效');
    prior=e.at;
  }
  if(s.events[0]!.at!==0||s.age>prior+180)throw Error('虹吸时间边界无效');
}
/** A finite tank + two separate basins. Contact water releases existing tank water; no reward water is spawned. */
export class CisternSiphon{
  private readonly slice:LengthCisternSlice;
  private released=false;
  constructor(state?:SiphonState,mp=100,max=100){
    this.slice=create(mp,max);
    if(!state)return;
    validateSiphonState(state);
    let age=0;
    for(const e of state.events){
      if(this.released)throw Error('虹吸已启动后不能重复供水');
      if(e.at>age)this.slice.advancePhysics(e.at-age);age=e.at;
      if(e.kind==='tool')this.openTool();
      else if(!this.confirm(this.preview(e.expression!),e.braced!).committed)throw Error('虹吸施法无法重建');
    }
    if(state.age>age)this.slice.advancePhysics(state.age-age);
  }
  preview(expression:WindowExpression,zones:readonly LivingSafetyZone[]=[]):TeloCastPlan{
    return this.slice.preview({canonicalAst:AST[expression],anchorPx:CISTERN_SIPHON.anchor,
      direction:{x:1,y:0},livingSafetyZones:zones});
  }
  confirm(plan:TeloCastPlan,braced:boolean,zones:readonly LivingSafetyZone[]=[]){
    // This stage's mechanical support gate is separate from the shared language/MP compiler.
    if(this.released||plan.requestedLengthClass==='long'&&!braced)return {committed:false,mpCharge:0};
    const result=this.slice.confirm(plan,'siphon.'+this.slice.snapshot().worldVersion,zones);
    const contact=CISTERN_SIPHON.contact;
    if(result.committed&&plan.execution.geometry.simulationCellGeometry.manifestationCells.some(c=>c.x===contact.x&&c.y===contact.y)&&
      this.slice.materialAtCell(contact.x,contact.y)===Material.Water)this.release();
    return result;
  }
  private release():void{
    if(this.released)return;
    this.slice.applyWorldEdits(Array.from({length:16},(_,i)=>({cellX:65+i,cellY:14,material:Material.Air})));
    this.released=true;
  }
  openTool():void{this.release();}
  get tankReleased():boolean{return this.released;}
  get collected():number{return this.slice.evaluateReceiver(receiver).waterCells;}
  get satisfied():boolean{return this.released&&this.slice.evaluateReceiver(receiver).satisfied;}
  advance():void{this.slice.advancePhysics();}
  cells():number[]{const a:number[]=[];for(let y=0;y<40;y++)for(let x=0;x<112;x++)a.push(this.slice.materialAtCell(x,y));return a;}
}
export function previewSiphon(state:SiphonState|undefined,word:WindowExpression,mp:number,max:number,zones:readonly LivingSafetyZone[]){
  const spent=state?.events.reduce((n,e)=>n+(e.kind==='cast'?siphonCastCost(e.expression!):0),0)??0;
  const world=new CisternSiphon(state,mp+spent,Math.max(max,mp+spent));
  return {world,plan:world.preview(word,zones)};
}
