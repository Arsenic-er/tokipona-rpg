export const MOTION_STUDY={x:677,y:301,radius:24,minimumTicks:90,requiredTurn:Math.PI/2,maximumTicks:512} as const;
export const MOTION_FLAGS=['entered','observed','attuned','predicted','completed'] as const;
export type MotionFlag=typeof MOTION_FLAGS[number];
export interface MotionStudyState {version:1;phase:'observe'|'trial';eligibleTicks:number;turn:number}
export const emptyMotionStudy=(phase:MotionStudyState['phase']='observe'):MotionStudyState=>({version:1,phase,eligibleTicks:0,turn:0});
export const motionVerified=(s:MotionStudyState)=>s.eligibleTicks>=MOTION_STUDY.minimumTicks&&s.turn>=MOTION_STUDY.requiredTurn;
export const parseMotionPrediction=(s:string)=>s.normalize('NFKC').trim().toLowerCase()==='motion:predict:tawa:clockwise';
export function validateMotionStudy(s:MotionStudyState){
 if(!s||s.version!==1||!['observe','trial'].includes(s.phase)||!Number.isInteger(s.eligibleTicks)||s.eligibleTicks<0||s.eligibleTicks>MOTION_STUDY.maximumTicks||
   !Number.isFinite(s.turn)||s.turn<0||s.turn>MOTION_STUDY.requiredTurn||s.turn>s.eligibleTicks*.04+1e-8)
   throw Error('水轮运动观察存档无效');
}
export function advanceMotionStudy(s:MotionStudyState,facts:{gate:boolean;repaired:boolean;near:boolean;flow:number;beforeAngle:number;afterAngle:number}){
 validateMotionStudy(s);if(motionVerified(s)||!facts.gate||!facts.repaired||!facts.near||facts.flow<=0)return;
 const delta=(facts.afterAngle-facts.beforeAngle+Math.PI*2)%(Math.PI*2);
 if(!Number.isFinite(delta)||delta>.040000001)throw Error('水轮观测到不连续转动');
 if(delta<=.0032)return; // A real positive step above the original wheel's stable-speed threshold.
 s.eligibleTicks++;s.turn=Math.min(MOTION_STUDY.requiredTurn,s.turn+delta);validateMotionStudy(s);
}
