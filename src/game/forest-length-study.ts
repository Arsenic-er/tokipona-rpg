import {CisternLearningSession,type EvidenceProposalResult} from '../learning/cistern-session';
import type {GameSessionState} from '../session/game-session';
import type {SessionEventDraft} from '../session/adapters';
import type {LengthWord} from '../world/forest-length-study';
export function lengthStudyEvidence(state:GameSessionState,playerSaveId:string,word:LengthWord,action:'observe'|'attune'|'ground'):SessionEventDraft[]{
 const learning=new CisternLearningSession({playerSaveId,expressionCapacity:state.capabilities.expressionCapacityWords,learningSnapshot:state.learning});
 const id='episode.length.'+word;let p:EvidenceProposalResult;
 if(action==='observe')p=learning.discoverGlyph({wordId:word,occurrenceId:id,locationId:'cistern.side-study.'+word,recognitionMode:'world_observation'});
 else if(action==='attune')p=learning.attuneGlyph({wordId:word,occurrenceId:id,environmentalWitnessId:'cistern.side-study.'+word+'.witness'});
 else p=learning.resolveReceiverAttempt({attemptId:id,stage:word==='lili'?'short':'long',taskId:'ch01_length_cistern',
  taskFamilyId:word==='lili'?'cistern.family_a.calibration':'cistern.family_b.transfer',
  variantHash:'episode.side-study.'+word+'.v1',normalizedEnvironmentFingerprint:'high_cistern:side-study:'+word+':v1',
  receiverGoalSatisfied:true,selectedActionClass:word==='lili'?'short_direct_cast':'long_direct_cast',toolBypass:false,
  promptLevel:1,interpretationStatus:'executed_legal',answerVisible:false,fixedSlotOnly:false,colorOnlyCue:false,activeRetrieval:false});
 // This lesson assesses the selected modifier, not retroactive mastery of the head word.
 const events=p.proposedEvents.filter((e,i)=>e.wordId===word&&p.reductions[i]?.applied);
 if(!events.length)throw Error('尺度复习证据未通过学习规则：'+p.reason);
 return events.map(e=>({eventId:'episode.length.learning.'+e.eventId,type:'learning_evidence_committed',payload:{evidence:e}}));
}
