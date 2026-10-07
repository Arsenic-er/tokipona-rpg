import {CisternWindow,windowPreview,executeWindowCast,CISTERN_WINDOW,type WindowExpression} from './forest-cistern-window';
import {CisternSiphon,CISTERN_SIPHON} from './forest-cistern-siphon';
import type {LivingSafetyZone} from '../spells/cast-plan';
export type LengthWord='lili'|'suli';
export const LENGTH_WORDS=['lili','suli'] as const;
export const LENGTH_PHASES=['observed','attuned','predicted','cast','completed'] as const;
export type LengthPhase=typeof LENGTH_PHASES[number];
export const LENGTH_STUDY={x:80,y:646,targetX:170,targetY:736,settleTicks:180} as const;
export interface LengthTrial {age:number}
export interface LengthStudyState {version:1;view:LengthWord|'baseline';lili?:LengthTrial;suli?:LengthTrial}
export const lengthExpression=(w:LengthWord):WindowExpression=>w==='lili'?'telo lili':'telo suli';
export const lengthCost=(w:LengthWord)=>w==='lili'?6:10;
export function parseLengthPrediction(w:LengthWord,s:string):boolean{
 return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ')==='length:predict:'+lengthExpression(w)+':'+(w==='lili'?'short':'long');
}
export function validateLengthStudy(s:LengthStudyState):void{
 if(!s||s.version!==1||!['baseline',...LENGTH_WORDS].includes(s.view))throw Error('尺度复习视图无效');
 for(const w of LENGTH_WORDS){const t=s[w];if(t&&(!Number.isSafeInteger(t.age)||t.age<0||t.age>180))throw Error('尺度复习水体时间无效');}
}
/** Isolated copies of existing receiver geometry. No route gates, inventory or MP authority. */
export class LengthStudyWorld{
 private readonly world:CisternWindow|CisternSiphon;
 private cache?:number[];
 constructor(readonly word:LengthWord,trial?:LengthTrial){
  if(trial&&(!Number.isSafeInteger(trial.age)||trial.age<0||trial.age>180))throw Error('尺度复习水体时间无效');
  this.world=word==='lili'?new CisternWindow(trial?{source:'cast',age:trial.age}:undefined):
   new CisternSiphon(trial?{version:1,age:trial.age,events:[{at:0,kind:'cast',expression:'telo suli',braced:true}]}:undefined);
 }
 advance(){this.world.advance();this.cache=undefined;}
 get collected(){return this.world.collected;}
 get satisfied(){return this.world.satisfied;}
 cells():readonly number[]{return this.cache??=this.world.cells();}
 get columns(){return this.word==='lili'?CISTERN_WINDOW.width/2:CISTERN_SIPHON.columns;}
 get rows(){return this.word==='lili'?CISTERN_WINDOW.height/2:CISTERN_SIPHON.rows;}
}
export function previewLengthStudy(word:LengthWord,mp:number,max:number,zones:readonly LivingSafetyZone[]){
 return word==='lili'?windowPreview('telo lili',mp,max,zones):new CisternSiphon(undefined,mp,max).preview('telo suli',zones);
}
export function executeLengthStudy(word:LengthWord,mp:number,max:number,zones:readonly LivingSafetyZone[],braced:boolean){
 if(word==='lili'){const r=executeWindowCast('telo lili',mp,max,zones);return {committed:r.committed,paid:r.paid};}
 const w=new CisternSiphon(undefined,mp,max),r=w.confirm(w.preview('telo suli',zones),braced,zones);
 return {committed:r.committed,paid:r.mpCharge};
}
