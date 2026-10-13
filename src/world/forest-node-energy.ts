/** Bounded quasistatic ratchet hoists, not a general rigid-body engine or free energy source.
 * Integer energy quanta keep remaining + gravitational work + dissipated work exact.
 * Hand-cranking supplies each reference charge; MP supplies only the test hoist's added charge.
 * The governor fixes speed and the ratchet holds elevation after the reservoir is empty.
 */
export const NODE_ENERGY={x:208,y:214,ticks:240,referenceTicks:80,cost:2,referenceCharge:640,addedCharge:1280,
 dischargePerTick:8,workPerTick:6,unitsPerHeight:64,targetHeight:18} as const;
export interface NodeEnergyState {version:1;referenceAge:number;castAge?:number}
export interface HoistEnergy {input:number;remaining:number;work:number;loss:number;height:number;latched:boolean}
export interface NodeEnergyFrame {reference:Readonly<HoistEnergy>;test:Readonly<HoistEnergy>}
function hoist(input:number,age:number):Readonly<HoistEnergy>{
 const spent=Math.min(input,age*NODE_ENERGY.dischargePerTick),work=spent*NODE_ENERGY.workPerTick/NODE_ENERGY.dischargePerTick;
 const height=work/NODE_ENERGY.unitsPerHeight;
 return Object.freeze({input,remaining:input-spent,work,loss:spent-work,height,latched:height>=NODE_ENERGY.targetHeight});
}
function frames(cast:boolean):readonly Readonly<NodeEnergyFrame>[]{
 return Object.freeze(Array.from({length:NODE_ENERGY.ticks+1},(_,age)=>Object.freeze({
  reference:hoist(NODE_ENERGY.referenceCharge,age),
  test:hoist(NODE_ENERGY.referenceCharge+(cast?NODE_ENERGY.addedCharge:0),age),
 })));
}
const REFERENCE=frames(false),CAST=frames(true);
export function validateNodeEnergy(s:NodeEnergyState,tick=Number.MAX_SAFE_INTEGER):void{
 if(!s||s.version!==1||Object.keys(s).some(k=>!['version','referenceAge','castAge'].includes(k))||
  !Number.isSafeInteger(s.referenceAge)||s.referenceAge<0||s.referenceAge>NODE_ENERGY.referenceTicks||s.referenceAge>tick||
  s.castAge!==undefined&&(!Number.isSafeInteger(s.castAge)||s.castAge<0||s.castAge>NODE_ENERGY.ticks||
   s.castAge>tick||s.referenceAge!==NODE_ENERGY.referenceTicks))throw Error('地下蓄能提升机状态无效');
}
export function nodeEnergyFrame(s?:NodeEnergyState):Readonly<NodeEnergyFrame>{
 if(!s)return REFERENCE[0]!;
 validateNodeEnergy(s);return s.castAge===undefined?REFERENCE[s.referenceAge]!:CAST[s.castAge]!;
}
export function advanceNodeEnergy(s:NodeEnergyState):void{
 validateNodeEnergy(s);if(s.castAge===undefined)s.referenceAge=Math.min(NODE_ENERGY.referenceTicks,s.referenceAge+1);
 else s.castAge=Math.min(NODE_ENERGY.ticks,s.castAge+1);
}
export function nodeEnergyVerified(s:NodeEnergyState):boolean{
 const {reference:a,test:b}=nodeEnergyFrame(s);
 return s.castAge===NODE_ENERGY.ticks&&!a.latched&&b.latched&&a.remaining===0&&b.remaining===0&&
  b.input===a.input+NODE_ENERGY.addedCharge&&[a,b].every(v=>v.work+v.loss+v.remaining===v.input&&v.loss>0);
}
export const parseNodeEnergyPrediction=(s:string)=>s.normalize('NFKC').trim().toLowerCase()==='energy:predict:wawa:finite';
export function nodeEnergyAccounting(s:NodeEnergyState):string{
 const {reference,test}=nodeEnergyFrame(s),unit=(n:number)=>String(n/64);
 return [reference,test].map((v,i)=>(i===0?'左':'右')+'机：输入 '+unit(v.input)+' = 剩余 '+unit(v.remaining)+
  ' + 提升做功 '+unit(v.work)+' + 损耗 '+unit(v.loss)).join('；')+'。刻度为本机关的能量单位，不是 MP 的通用换算。';
}
