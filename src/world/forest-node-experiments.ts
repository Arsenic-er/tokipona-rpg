import {SAMPLE_EXPERIMENT,sampleExperimentSummary,type SampleExperiment} from './forest-node-samples';
/** Sealed, non-magical comparison instruments. They never change actor physics, MP or learning. */
export const NODE_EXPERIMENTS = {
  gravity: { x: 64, ticks: 180, name: '重力对照铅锤' },
  time: { x: 112, ticks: 360, name: '时间对照摆' },
  material: { x: 160, ticks: SAMPLE_EXPERIMENT.ticks, name: '材质承托台' },
  conservation: { x: 208, ticks: SAMPLE_EXPERIMENT.ticks, name: '守恒核验溢流槽' },
} as const;
export type NodeExperiment = keyof typeof NODE_EXPERIMENTS;
export type MotionExperiment = Exclude<NodeExperiment,SampleExperiment>;
export interface NodeExperimentRun { version: 1; mode: 'normal' | 'anomaly'; age: number; ledgerOpen?: true }
export type NodeExperimentState = Partial<Record<NodeExperiment, NodeExperimentRun>>;
export interface InstrumentBody { readonly offset: number; readonly velocity: number; readonly crossings: number }
export interface NodeExperimentView {
  readonly left: InstrumentBody; readonly right: InstrumentBody; readonly finished: boolean;
}
export const beginNodeExperiment = (mode: NodeExperimentRun['mode']): NodeExperimentRun => ({version:1,mode,age:0});
export function validateNodeExperiments(state: NodeExperimentState, tick: number): void {
  if (!state || typeof state !== 'object' || Array.isArray(state) || Object.keys(state).length===0 ||
      Object.keys(state).some(k=>!Object.hasOwn(NODE_EXPERIMENTS,k))) throw Error('地下对照装置存档无效');
  for (const kind of Object.keys(state) as NodeExperiment[]) {
    const r=state[kind];
    if (!r || r.version!==1 || !['normal','anomaly'].includes(r.mode) || !Number.isSafeInteger(r.age) ||
        r.age<0 || r.age>NODE_EXPERIMENTS[kind].ticks || r.age>tick ||
        r.ledgerOpen!==undefined&&(r.ledgerOpen!==true||kind!=='conservation'||r.age!==SAMPLE_EXPERIMENT.ticks)) throw Error('地下对照装置进度无效');
  }
}
type Body = {offset:number;velocity:number;crossings:number};
function stepGravity(body:Body, direction:number):void {
  body.velocity+=direction*52/60;
  body.offset+=body.velocity/60;
  if (Math.abs(body.offset)>=15) {
    body.offset=Math.sign(body.offset)*15;
    body.velocity=Math.abs(body.velocity)<1?0:-body.velocity*.18;
  }
}
function stepPendulum(body:Body, rate:number):void {
  // Equal length, amplitude and gravity. Only the right chamber's local clock rate changes.
  const dt=rate/60, previous=body.offset;
  body.velocity+=(-260/14*Math.sin(body.offset)-.025*body.velocity)*dt;
  body.offset+=body.velocity*dt;
  if (previous*body.offset<0) body.crossings++;
}
const cache=new Map<string,readonly NodeExperimentView[]>();
function frames(kind:MotionExperiment,mode:NodeExperimentRun['mode']):readonly NodeExperimentView[] {
  const key=kind+':'+mode, found=cache.get(key);if(found)return found;
  const left:Body={offset:kind==='time'?.6:0,velocity:0,crossings:0},right={...left},result:NodeExperimentView[]=[];
  for(let age=0;age<=NODE_EXPERIMENTS[kind].ticks;age++){
    result.push(Object.freeze({left:Object.freeze({...left}),right:Object.freeze({...right}),finished:age===NODE_EXPERIMENTS[kind].ticks}));
    if(kind==='gravity'){stepGravity(left,1);stepGravity(right,mode==='anomaly'?-1:1);}
    else {stepPendulum(left,1);stepPendulum(right,mode==='anomaly'?.4:1);}
  }
  const frozen=Object.freeze(result);cache.set(key,frozen);return frozen;
}
/** Position is reconstructed from bounded fixed-step history, never from UI-supplied outcome claims. */
export function nodeExperimentView(kind:MotionExperiment,run?:NodeExperimentRun):NodeExperimentView {
  if(run)validateNodeExperiments({[kind]:run},Number.MAX_SAFE_INTEGER);
  return frames(kind,run?.mode??'normal')[run?.age??0]!;
}
export function advanceNodeExperiment(kind:NodeExperiment,run:NodeExperimentRun):void {
  validateNodeExperiments({[kind]:run},Number.MAX_SAFE_INTEGER);
  run.age=Math.min(NODE_EXPERIMENTS[kind].ticks,run.age+1);
}
export function nodeExperimentSummary(kind:NodeExperiment,run:NodeExperimentRun):string {
  if(kind==='material'||kind==='conservation')return sampleExperimentSummary(kind,run);
  const v=nodeExperimentView(kind,run);
  if(!v.finished)return NODE_EXPERIMENTS[kind].name+'正在对照；收起面板并留在装置旁继续观察。';
  const direction=(offset:number)=>offset>0?'下落':'上浮';
  return kind==='gravity'
    ?'铅锤读数：左侧'+direction(v.left.offset)+' '+Math.abs(v.left.offset).toFixed(0)+' 格，右侧'+direction(v.right.offset)+' '+Math.abs(v.right.offset).toFixed(0)+' 格。'+
      (run.mode==='anomaly'?'只有右槽内的重力方向倒转；这不表示水或人物到处都会向上落。':'两槽正常，铅锤同向下落。')
    :'摆钟读数：同一段观察时间里，左摆越过中线 '+v.left.crossings+' 次，右摆 '+v.right.crossings+' 次。'+
      (run.mode==='anomaly'?'两摆规格相同，右槽内过程变慢；不代表整个世界的时间都停了。':'两槽正常，两摆节奏一致。');
}
