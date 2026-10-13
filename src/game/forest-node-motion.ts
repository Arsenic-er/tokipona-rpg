import type {GameSessionState} from '../session/game-session';
import type {LearningEvidenceEvent} from '../learning/progression';
export const NODE_MOTION_FLAGS=['predicted','cast','completed'] as const;
export type NodeMotionFlag=typeof NODE_MOTION_FLAGS[number];
export const nodeMotionWordReady=(s:GameSessionState)=>{
 const w=s.learning.words.tawa;
 return w?.attunementState==='attuned'&&['grounded','produced','stabilized'].includes(w.learningState??'');
};
/** A distinct guided grounding context, not independent retrieval or mastery. */
export function nodeMotionEvidence(playerSaveId:string):LearningEvidenceEvent{
 return {eventId:'episode.node-motion.grounding',playerSaveId,wordId:'tawa',
  idempotencyKey:playerSaveId+':episode:node-motion:grounding',sourceObjectClass:'underground_motion_rail',
  eventType:'grounding_trial_resolved',taskId:'forest_underground_motion_rail',taskFamilyId:'forest_motion_relations',
  variantHash:'node.rail.finite.left-pulse.v1',normalizedEnvironmentFingerprint:'underground:dual_rail:reference_right:test_left_pulse',
  promptLevel:1,interpretationStatus:'executed_legal',worldOutcomeContribution:true,toolBypass:false,answerVisible:false,
  fixedSlotOnly:false,colorOnlyCue:false,semanticFacetsDemonstrated:['change_motion_relative_to_reference'],
  canonicalAstWordIds:['word.tawa'],canonicalAstShape:'fixture_action(tawa,lower_slider,left)',
  worldOutcomeKind:'lower_slider_reversed_relative_to_reference'};
}
