import type {NodeExperimentRun} from './forest-node-experiments';
export type SampleExperiment = 'material' | 'conservation';
export const SAMPLE_EXPERIMENT = {ticks:240,count:16,width:13,height:28,shelfTop:13,shelfBottom:15,receiver:21} as const;
export interface SampleParticle {readonly id:number;readonly x:number;readonly y:number}
export interface SampleChamber {
 readonly particles:readonly SampleParticle[];
 /** Isolated identities remain in the closed apparatus. Never delete or duplicate water into the world. */
 readonly held:readonly number[];
 readonly received:number;
 readonly aboveShelf:number;
 readonly belowShelf:number;
}
export interface SampleExperimentView {readonly left:SampleChamber;readonly right:SampleChamber;readonly finished:boolean}
type Chamber={particles:{id:number;x:number;y:number}[];held:number[]};
const createChamber=():Chamber=>({particles:Array.from({length:SAMPLE_EXPERIMENT.count},(_,id)=>({id,x:4+id%4,y:1+Math.floor(id/4)})),held:[]});
const key=(x:number,y:number)=>y*SAMPLE_EXPERIMENT.width+x;
function step(chamber:Chamber,kind:SampleExperiment,anomaly:boolean,step:number):void {
 const occupied=new Set(chamber.particles.map(p=>key(p.x,p.y)));
 const transferred=new Set<number>();
 const solid=(x:number,y:number)=>x<0||x>=SAMPLE_EXPERIMENT.width||y<0||y>=SAMPLE_EXPERIMENT.height-1||
   kind==='material'&&!anomaly&&y>=SAMPLE_EXPERIMENT.shelfTop&&y<=SAMPLE_EXPERIMENT.shelfBottom;
 // Bottom-first single-cell moves prevent tunnelling, overlaps and a grain moving twice in one step.
 for(const p of [...chamber.particles].sort((a,b)=>b.y-a.y||a.id-b.id)){
  const side=(step+p.id)%2?1:-1;
  const moves=[[0,1],[side,1],[-side,1],...(kind==='conservation'?[[side,0],[-side,0]]:[])];
  const next=moves.map(([dx,dy])=>({x:p.x+dx!,y:p.y+dy!})).find(q=>!solid(q.x,q.y)&&!occupied.has(key(q.x,q.y)));
  if(!next)continue;
  occupied.delete(key(p.x,p.y));
  if(kind==='conservation'&&anomaly&&p.id%3===0&&p.y<SAMPLE_EXPERIMENT.shelfTop&&next.y===SAMPLE_EXPERIMENT.shelfTop){
   chamber.held.push(p.id);transferred.add(p.id);
  }else{p.x=next.x;p.y=next.y;occupied.add(key(p.x,p.y));}
 }
 chamber.particles=chamber.particles.filter(p=>!transferred.has(p.id));
}
function snapshot(c:Chamber):SampleChamber {
 return Object.freeze({
  particles:Object.freeze(c.particles.map(p=>Object.freeze({...p}))),held:Object.freeze([...c.held]),
  received:c.particles.filter(p=>p.y>=SAMPLE_EXPERIMENT.receiver).length,
  aboveShelf:c.particles.filter(p=>p.y<SAMPLE_EXPERIMENT.shelfTop).length,
  belowShelf:c.particles.filter(p=>p.y>SAMPLE_EXPERIMENT.shelfBottom).length,
 });
}
const cache=new Map<string,readonly SampleExperimentView[]>();
function frames(kind:SampleExperiment,mode:NodeExperimentRun['mode']):readonly SampleExperimentView[]{
 const cacheKey=kind+':'+mode,old=cache.get(cacheKey);if(old)return old;
 const left=createChamber(),right=createChamber(),result:SampleExperimentView[]=[];
 for(let age=0;age<=SAMPLE_EXPERIMENT.ticks;age++){
  result.push(Object.freeze({left:snapshot(left),right:snapshot(right),finished:age===SAMPLE_EXPERIMENT.ticks}));
  if(age%3===2){step(left,kind,false,Math.floor(age/3));step(right,kind,mode==='anomaly',Math.floor(age/3));}
 }
 const frozen=Object.freeze(result);cache.set(cacheKey,frozen);return frozen;
}
/** One finite batch per sealed chamber. Normal clay stops on stone; abnormal stone loses support.
 * Abnormal water crosses the visible conduit boundary into an isolated drawer, not into player inventory.
 * This bounded example tests an apparent conservation discrepancy; it does not claim annihilation. */
export function sampleExperimentView(kind:SampleExperiment,run?:NodeExperimentRun):SampleExperimentView{
 if(run&&(run.version!==1||!['normal','anomaly'].includes(run.mode)||!Number.isSafeInteger(run.age)||run.age<0||run.age>SAMPLE_EXPERIMENT.ticks))
  throw Error('地下样本对照进度无效');
 return frames(kind,run?.mode??'normal')[run?.age??0]!;
}
export function sampleExperimentSummary(kind:SampleExperiment,run:NodeExperimentRun):string{
 const v=sampleExperimentView(kind,run);
 if(!v.finished)return (kind==='material'?'材质承托台':'守恒核验溢流槽')+'正在对照；收起面板并留在装置旁继续观察。';
 if(kind==='material')return '陶粒读数：左槽板上 '+v.left.aboveShelf+'、板下 '+v.left.belowShelf+'；右槽板上 '+v.right.aboveShelf+'、板下 '+v.right.belowShelf+'。'+
   (run.mode==='anomaly'?'右槽石板失去承托，陶粒穿过原本的阻挡；样本总数不变。':'两块石板都正常承托，陶粒没有穿过。');
 const front='各槽投入 '+SAMPLE_EXPERIMENT.count+' 滴；左侧可见回收 '+v.left.received+'，右侧 '+v.right.received+'。';
 if(!run.ledgerOpen)return front+'先打开下方隔离仓核账，不把看不见的水直接认作消失。';
 return front+'隔离仓：左 '+v.left.held.length+'，右 '+v.right.held.length+'。'+
   (v.right.held.length?'右槽的水越过可见管路边界，转移到封闭小仓；回收与隔离合计仍为 '+SAMPLE_EXPERIMENT.count+'，不是凭空造水或湮灭。':'两槽收支一致，没有额外水量。');
}
