import type {LearningEvidenceEvent} from '../learning/progression';
import {collectedEpisodeWater,type EpisodeWaterState} from '../world/forest-episode-water';
export const WATER_STUDY={cost:2,amount:32,source:'hermit_water_basin',task:'ch01_medium_hermit_initiation'} as const;
export const WATER_STUDY_FLAGS=['seen','attuned','predicted','casting','completed'] as const;
export type WaterStudyFlag=typeof WATER_STUDY_FLAGS[number];
export interface WaterStudyState {version:1;baselineCollected:number;castIndex:number;startTick:number}
export const waterStudyOrigin=(s:WaterStudyState)=>JSON.stringify({version:s.version,baselineCollected:s.baselineCollected,castIndex:s.castIndex,startTick:s.startTick});
export const parseWaterPrediction=(s:string)=>s.normalize('NFKC').trim().toLowerCase()==='water:predict:telo:downhill';
export const waterStudyReady=(w:EpisodeWaterState)=>!w.cells.some((v,i)=>v===1&&i%160<137);
export const waterStudyArrived=(s:WaterStudyState,w:EpisodeWaterState)=>collectedEpisodeWater(w)>=s.baselineCollected+WATER_STUDY.amount;
export function validateWaterStudy(s:WaterStudyState,w:EpisodeWaterState,casts:number){
  if(!s||s.version!==1||![s.baselineCollected,s.castIndex,s.startTick].every(n=>Number.isSafeInteger(n)&&n>=0)||
    s.castIndex<1||s.castIndex!==casts||s.startTick>w.tick||s.baselineCollected+WATER_STUDY.amount>w.supplied||
    collectedEpisodeWater(w)<s.baselineCollected)throw Error('水槽复习的接水基线无效');
}
export function waterStudyEvidence(phase:'seen'|'attuned'|'completed',playerSaveId:string):LearningEvidenceEvent{
  const base={eventId:'episode.water-study.'+phase,playerSaveId,wordId:'telo',
    idempotencyKey:playerSaveId+':episode:water-study:'+phase,sourceObjectClass:WATER_STUDY.source};
  if(phase==='seen')return {...base,eventType:'glyph_discovered',locationId:'stream.hermit_water_basin',recognitionMode:'world_observation'};
  if(phase==='attuned')return {...base,eventType:'glyph_attunement_completed',catalystClass:'common_nontradeable',catalystTradeable:false,
    environmentalWitnessId:'stream.hermit_water_basin'};
  return {...base,eventType:'grounding_trial_resolved',taskId:WATER_STUDY.task,taskFamilyId:'forest_medium_initiation',
    variantHash:'episode.hermit.water.recall.downhill.v1',normalizedEnvironmentFingerprint:'stream.hermit_water_basin:sealed_channel:single_water_manifest',
    promptLevel:1,interpretationStatus:'executed_legal',worldOutcomeContribution:true,toolBypass:false,answerVisible:false,fixedSlotOnly:false,colorOnlyCue:false,
    semanticFacetsDemonstrated:['water_or_liquid'],canonicalAstWordIds:['word.telo'],worldOutcomeKind:'hermit_manifest_water_collected'};
}
