import type {GameSessionState} from '../session/game-session';
import type {LearningEvidenceEvent} from '../learning/progression';
import type {NodeWaterStage} from '../world/forest-node-water';
export type NodeWaterFlag='short.predicted'|'short.started'|'short.completed'|'long.braced'|'long.predicted'|'long.started'|'long.completed';
export const NODE_WATER_FLAGS:readonly NodeWaterFlag[]=['short.predicted','short.started','short.completed','long.braced','long.predicted','long.started','long.completed'];
export const nodeWaterWordsReady=(s:GameSessionState,stage:NodeWaterStage)=>['telo',stage==='short'?'lili':'suli'].every(id=>{
 const w=s.learning.words[id];return w?.attunementState==='attuned'&&['grounded','produced','stabilized'].includes(w.learningState??'');
});
export function parseNodeWaterPrediction(s:string,stage:NodeWaterStage):boolean{
 return s.normalize('NFKC').trim().toLowerCase()==='waterway:predict:telo '+(stage==='short'?'lili:narrow':'suli:both');
}
export function nodeWaterEvidence(playerSaveId:string,word:'telo'|'lili'|'suli'):LearningEvidenceEvent{
 return {eventId:'episode.node-water.grounding.'+word,playerSaveId,wordId:word,
  idempotencyKey:playerSaveId+':episode:node-water:'+word,sourceObjectClass:'underground_serial_waterway',
  eventType:'grounding_trial_resolved',taskId:'forest_underground_waterway',taskFamilyId:'forest_water_scale_transfer',
  variantHash:'node.serial.narrow.dual.receiver.v1',normalizedEnvironmentFingerprint:'underground:narrow_inlet:divided_basins:finite_backup_tanks',
  promptLevel:1,interpretationStatus:'executed_legal',worldOutcomeContribution:true,toolBypass:false,answerVisible:false,
  fixedSlotOnly:false,colorOnlyCue:false,semanticFacetsDemonstrated:word==='telo'?['water_falls_and_collects']:['spatial_extent',word==='lili'?'constrained_inlet':'reach_two_receivers'],
  canonicalAstWordIds:word==='telo'?['word.telo','word.lili','word.suli']:['word.telo','word.'+word],
  canonicalAstShape:word==='telo'?'sequence(telo(lili),telo(suli))':'telo('+word+')',
  worldOutcomeKind:word==='lili'?'narrow_inlet_fills_and_releases_baffle':'both_divided_receivers_hold_water'};
}
