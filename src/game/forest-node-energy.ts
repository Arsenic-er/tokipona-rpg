import type {GameSessionState} from '../session/game-session';
import type {LearningEvidenceEvent} from '../learning/progression';
export const NODE_ENERGY_FLAGS=['predicted','cast','completed'] as const;
export type NodeEnergyFlag=typeof NODE_ENERGY_FLAGS[number];
export const nodeEnergyWordReady=(s:GameSessionState)=>{
 const w=s.learning.words.wawa;
 return w?.attunementState==='attuned'&&['grounded','produced','stabilized'].includes(w.learningState??'');
};
/** Guided grounding in a new context, never independent retrieval, production or mastery. */
export function nodeEnergyEvidence(playerSaveId:string):LearningEvidenceEvent{
 return {eventId:'episode.node-energy.grounding',playerSaveId,wordId:'wawa',
  idempotencyKey:playerSaveId+':episode:node-energy:grounding',sourceObjectClass:'underground_energy_hoist',
  eventType:'grounding_trial_resolved',taskId:'forest_underground_energy_hoist',taskFamilyId:'forest_energy_budget',
  variantHash:'node.hoist.finite.input.loss.v1',normalizedEnvironmentFingerprint:'underground:paired_ratchet_hoists:equal_load:finite_reservoir',
  promptLevel:1,interpretationStatus:'executed_legal',worldOutcomeContribution:true,toolBypass:false,answerVisible:false,
  fixedSlotOnly:false,colorOnlyCue:false,semanticFacetsDemonstrated:['energy_input','finite_work_with_losses'],
  canonicalAstWordIds:['word.wawa'],canonicalAstShape:'fixture_action(wawa,right_hoist,finite_charge)',
  worldOutcomeKind:'finite_charge_lifts_load_past_latch_then_exhausts'};
}
