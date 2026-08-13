import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeEcologyManifest, type RuntimeEcologyManifest, type RuntimeWildlifeSpeciesManifest } from "../content/runtime-ecology-manifest";

export const WILDLIFE_TICKS_PER_SECOND = 60 as const;
export const WILDLIFE_SELF_DEFENSE_TICKS = 30 as const;
export const WILDLIFE_FLEE_FEAR_THRESHOLD = 60 as const;
const ACTION_MEMORY_LIMIT = 64;

export type WildlifeSpecies = "rabbit" | "fox";
export type WildlifeBehaviorState = "calm" | "observe" | "warn" | "self_defense" | "flee" | "return";
export type WildlifeLifeState = "alive" | "tombstoned";
export interface WildlifeLifeIdentitySeed { readonly regionSaveId: string; readonly entityId: string; readonly spawnGeneration: number; readonly spawnSequence: number }
export interface PlayerPhysicalProfile { readonly id: string; readonly massKg: number; readonly buoyancyCoefficient: number; readonly heatToleranceC: number }
export interface WildlifeTickInput {
  readonly playerWithinPerception: boolean;
  readonly playerInsideWarningZone: boolean;
  readonly playerBlocksEscape: boolean;
  readonly wildlifeCornered: boolean;
  readonly playerRetreating: boolean;
  readonly lineOfSight: boolean;
  readonly localDangerCleared: boolean;
  readonly returnWorldConditionsSatisfied: boolean;
  readonly realEscapeExitReachable: boolean;
  readonly reachedRealEscapeExit: boolean;
  readonly defensiveContact: boolean;
  readonly atHomeAnchor: boolean;
  readonly majorHarmOccurred?: boolean;
  readonly youngThreatened?: boolean;
  readonly deathTombstone?: boolean;
  readonly playerProfile: PlayerPhysicalProfile;
}
export interface WildlifePhysicalResponse { readonly impulseNs: number; readonly knockbackVelocityTilesPerSecond: number; readonly environmentFeedback: Readonly<{ buoyancyBand: "sinks" | "neutral" | "floats"; heatToleranceBand: "low" | "ordinary" | "high" }> }
export interface WildlifeDefenseEvent { readonly eventId: string; readonly lifeId: string; readonly species: WildlifeSpecies; readonly damage: number; readonly durationTicksMaximum: typeof WILDLIFE_SELF_DEFENSE_TICKS; readonly physicalResponse: WildlifePhysicalResponse }
export interface NonlethalWildlifeActionResult { readonly accepted: boolean; readonly duplicate: boolean; readonly reason: "applied" | "duplicate" | "conflict" | "tombstoned"; readonly damage: 0; readonly fearAdded: number; readonly pushImpulseNs: number }
export interface WildlifeRewardDelta { readonly kills: 0; readonly drops: 0; readonly languageXp: 0; readonly learningEvidence: 0; readonly expressionCapacityGrowth: 0; readonly focusSlotGrowth: 0; readonly maxMpGrowth: 0; readonly currency: 0 }
export interface WildlifeMachineCheckpoint {
  readonly schema: "tokipona.wildlife-checkpoint.v0.1";
  readonly lifeId: string;
  readonly species: WildlifeSpecies;
  readonly behaviorState: WildlifeBehaviorState;
  readonly lifeState: WildlifeLifeState;
  readonly tick: number;
  readonly stateTicks: number;
  readonly warningTicks: number;
  readonly intrusionTicks: number;
  readonly selfDefenseTicks: number;
  readonly defensiveWindowsStarted: number;
  readonly fear: number;
  readonly reachedRealEscapeExit: boolean;
  readonly lineOfSightLostTicks: number;
  readonly deescalationTicks: number;
  readonly majorHarmPending: boolean;
  readonly defenseUsedThisEncounter: boolean;
  readonly defenseContactEmittedThisWindow: boolean;
  readonly nonlethalStimulusPending: boolean;
  readonly fullReturnConditionsMet: boolean;
  readonly lastDefenseEvent: WildlifeDefenseEvent | null;
  readonly defenseEventHistory: readonly WildlifeDefenseEvent[];
  readonly actionMemory: readonly Readonly<{ id: string; fingerprint: string }>[];
}
export interface WildlifeStateMachineSnapshot {
  readonly lifeId: string; readonly entityId: string; readonly species: WildlifeSpecies; readonly lifeState: WildlifeLifeState;
  readonly behaviorState: WildlifeBehaviorState; readonly tick: number; readonly stateTicks: number; readonly warningTicks: number;
  readonly intrusionTicks: number; readonly selfDefenseTicks: number; readonly defensiveWindowsStarted: number; readonly fear: number;
  readonly targetRealEscapeExit: string; readonly reachedRealEscapeExit: boolean; readonly lineOfSightLostTicks: number;
  readonly returnEligible: boolean; readonly canBeUsedAsBodyPlatform: false; readonly rewardDelta: WildlifeRewardDelta;
  readonly lastDefenseEvent: WildlifeDefenseEvent | null; readonly defenseEvents: readonly WildlifeDefenseEvent[];
}

const ZERO_REWARD: WildlifeRewardDelta = Object.freeze({ kills: 0, drops: 0, languageXp: 0, learningEvidence: 0, expressionCapacityGrowth: 0, focusSlotGrowth: 0, maxMpGrowth: 0, currency: 0 });
const nonEmpty = (value: string, label: string): string => { if (!value.trim()) throw new Error(`${label} must be non-empty`); return value };
const counter = (value: number, label: string): number => { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`); return value };

// Synchronous, dependency-free SHA-256 for deterministic browser/server life identities.
const sha256 = (input: string): string => {
  const bytes = new TextEncoder().encode(input); const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64; const data = new Uint8Array(paddedLength); data.set(bytes); data[bytes.length] = 0x80;
  const view = new DataView(data.buffer); view.setUint32(paddedLength - 4, bitLength >>> 0); view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const w = new Uint32Array(64); const rotr = (x:number,n:number) => (x>>>n)|(x<<(32-n));
  for (let offset=0; offset<data.length; offset+=64) { for(let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4); for(let i=16;i<64;i++){const a=w[i-15]!,b=w[i-2]!;w[i]=(((rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-16]!+(rotr(b,17)^rotr(b,19)^(b>>>10))+w[i-7]!)>>>0)} let [a,b,c,d,e,f,g,hh]=h; for(let i=0;i<64;i++){const t1=(hh!+(rotr(e!,6)^rotr(e!,11)^rotr(e!,25))+((e!&f!)^(~e!&g!))+k[i]!+w[i]!)>>>0;const t2=((rotr(a!,2)^rotr(a!,13)^rotr(a!,22))+((a!&b!)^(a!&c!)^(b!&c!)))>>>0;hh=g;g=f;f=e;e=(d!+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0} const values=[a,b,c,d,e,f,g,hh]; for(let i=0;i<8;i++)h[i]=(h[i]!+values[i]!)>>>0 }
  return [...h].map(value=>value.toString(16).padStart(8,"0")).join("");
};

export function createStableWildlifeLifeId(seed: WildlifeLifeIdentitySeed): string {
  const canonical = JSON.stringify([nonEmpty(seed.regionSaveId,"regionSaveId"),nonEmpty(seed.entityId,"entityId"),counter(seed.spawnGeneration,"spawnGeneration"),counter(seed.spawnSequence,"spawnSequence")]);
  return `wildlife-life:sha256:${sha256(canonical)}`;
}
const validateProfile = (p: PlayerPhysicalProfile) => { nonEmpty(p.id,"player profile id"); for(const v of [p.massKg,p.buoyancyCoefficient,p.heatToleranceC]) if(!Number.isFinite(v)||v<=0) throw new Error("player physical profile values must be positive"); return p };
const physicalResponse = (p:PlayerPhysicalProfile): WildlifePhysicalResponse => { validateProfile(p); const impulseNs=Math.round((720/Math.sqrt(p.massKg))*1000)/1000; return Object.freeze({impulseNs,knockbackVelocityTilesPerSecond:Math.round((impulseNs/p.massKg/16)*1000)/1000,environmentFeedback:Object.freeze({buoyancyBand:p.buoyancyCoefficient>1.1?"floats":p.buoyancyCoefficient<0.9?"sinks":"neutral",heatToleranceBand:p.heatToleranceC>=80?"high":p.heatToleranceC<=40?"low":"ordinary"})}) };

export class WildlifeStateMachine {
  readonly lifeId: string; readonly ecology: RuntimeEcologyManifest; readonly speciesContract: RuntimeWildlifeSpeciesManifest;
  private state:WildlifeBehaviorState="calm"; private lifeState:WildlifeLifeState="alive"; private tickCount=0; private stateTicks=0; private warningTicks=0; private intrusionTicks=0; private selfDefenseTicks=0; private defensiveWindowsStarted=0; private fear=0; private reachedExit=false; private lineOfSightLostTicks=0; private deescalationTicks=0; private majorHarmPending=false; private nonlethalStimulusPending=false; private defenseUsedThisEncounter=false; private defenseContactEmittedThisWindow=false; private fullReturnConditionsMet=false; private lastDefense:WildlifeDefenseEvent|null=null; private readonly defenseEventHistory:WildlifeDefenseEvent[]=[]; private readonly actions=new Map<string,string>();
  constructor(readonly species:WildlifeSpecies, identity:Omit<WildlifeLifeIdentitySeed,"entityId">, artifact:unknown=generatedRuntimeArtifact, checkpoint?:WildlifeMachineCheckpoint){ this.ecology=readRuntimeEcologyManifest(artifact);this.speciesContract=this.ecology.species[species];this.lifeId=createStableWildlifeLifeId({...identity,entityId:this.speciesContract.entityId});if(checkpoint)this.restore(checkpoint) }
  applyWoodStaffFear(actionId:string){return this.stimulus(actionId,"wood_staff",15,2)}
  applySoundFear(actionId:string,fear:number){if(!Number.isSafeInteger(fear)||fear<=0||fear>100)throw new Error("sound fear must be a positive safe integer");return this.stimulus(actionId,`sound_fear:${fear}`,fear,0)}
  applyLowForcePush(actionId:string,impulse:number){if(!Number.isFinite(impulse)||impulse<0)throw new Error("requestedImpulseNs must be finite and non-negative");return this.stimulus(actionId,`low_force_push:${impulse}`,20,Math.min(impulse,6))}
  advance(input:WildlifeTickInput,ticks=1){counter(ticks,"ticks");validateProfile(input.playerProfile);for(let i=0;i<ticks;i++)this.step(input);return this.snapshot()}
  snapshot():WildlifeStateMachineSnapshot{return Object.freeze({lifeId:this.lifeId,entityId:this.speciesContract.entityId,species:this.species,lifeState:this.lifeState,behaviorState:this.state,tick:this.tickCount,stateTicks:this.stateTicks,warningTicks:this.warningTicks,intrusionTicks:this.intrusionTicks,selfDefenseTicks:this.selfDefenseTicks,defensiveWindowsStarted:this.defensiveWindowsStarted,fear:this.fear,targetRealEscapeExit:this.speciesContract.realEscapeExit,reachedRealEscapeExit:this.reachedExit,lineOfSightLostTicks:this.lineOfSightLostTicks,returnEligible:this.lifeState==="alive"&&this.fullReturnConditionsMet,canBeUsedAsBodyPlatform:false,rewardDelta:ZERO_REWARD,lastDefenseEvent:this.lastDefense,defenseEvents:Object.freeze([...this.defenseEventHistory])})}
  checkpoint():WildlifeMachineCheckpoint{return Object.freeze({schema:"tokipona.wildlife-checkpoint.v0.1",lifeId:this.lifeId,species:this.species,behaviorState:this.state,lifeState:this.lifeState,tick:this.tickCount,stateTicks:this.stateTicks,warningTicks:this.warningTicks,intrusionTicks:this.intrusionTicks,selfDefenseTicks:this.selfDefenseTicks,defensiveWindowsStarted:this.defensiveWindowsStarted,fear:this.fear,reachedRealEscapeExit:this.reachedExit,lineOfSightLostTicks:this.lineOfSightLostTicks,deescalationTicks:this.deescalationTicks,majorHarmPending:this.majorHarmPending,defenseUsedThisEncounter:this.defenseUsedThisEncounter,defenseContactEmittedThisWindow:this.defenseContactEmittedThisWindow,nonlethalStimulusPending:this.nonlethalStimulusPending,fullReturnConditionsMet:this.fullReturnConditionsMet,lastDefenseEvent:this.lastDefense,defenseEventHistory:Object.freeze([...this.defenseEventHistory]),actionMemory:Object.freeze([...this.actions].slice(-ACTION_MEMORY_LIMIT).map(([id,fingerprint])=>Object.freeze({id,fingerprint})))})}
  private restore(candidate: WildlifeMachineCheckpoint) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) throw new Error("wildlife checkpoint must be an object");
    const c = candidate as unknown as Record<string, unknown>;
    const exactKeys = ["schema", "lifeId", "species", "behaviorState", "lifeState", "tick", "stateTicks", "warningTicks", "intrusionTicks", "selfDefenseTicks", "defensiveWindowsStarted", "fear", "reachedRealEscapeExit", "lineOfSightLostTicks", "deescalationTicks", "majorHarmPending", "defenseUsedThisEncounter", "defenseContactEmittedThisWindow", "nonlethalStimulusPending", "fullReturnConditionsMet", "lastDefenseEvent", "defenseEventHistory", "actionMemory"];
    if (Object.keys(c).sort().join("|") !== [...exactKeys].sort().join("|")) throw new Error("wildlife checkpoint shape is invalid");
    if (c.schema !== "tokipona.wildlife-checkpoint.v0.1" || c.lifeId !== this.lifeId || c.species !== this.species) throw new Error("wildlife checkpoint identity is invalid");
    if (!["calm", "observe", "warn", "self_defense", "flee", "return"].includes(String(c.behaviorState))) throw new Error("wildlife checkpoint behavior state is invalid");
    if (!["alive", "tombstoned"].includes(String(c.lifeState))) throw new Error("wildlife checkpoint life state is invalid");
    const bool = (value: unknown, label: string): boolean => { if (typeof value !== "boolean") throw new Error(`wildlife checkpoint ${label} must be boolean`); return value; };
    const fear = c.fear;
    if (typeof fear !== "number" || !Number.isSafeInteger(fear) || fear < 0 || fear > 100) throw new Error("wildlife checkpoint fear is invalid");
    if (!Array.isArray(c.actionMemory) || c.actionMemory.length > ACTION_MEMORY_LIMIT) throw new Error("wildlife checkpoint action memory is invalid");
    const seen = new Set<string>();
    for (const raw of c.actionMemory) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw) || Object.keys(raw).sort().join("|") !== "fingerprint|id") throw new Error("wildlife checkpoint action entry is invalid");
      const item = raw as Record<string, unknown>;
      const id = nonEmpty(typeof item.id === "string" ? item.id : "", "checkpoint action id");
      const fingerprint = nonEmpty(typeof item.fingerprint === "string" ? item.fingerprint : "", "checkpoint action fingerprint");
      if (seen.has(id)) throw new Error("wildlife checkpoint action IDs must be unique");
      seen.add(id); this.actions.set(id, fingerprint);
    }
    this.state = c.behaviorState as WildlifeBehaviorState;
    this.lifeState = c.lifeState as WildlifeLifeState;
    this.tickCount = counter(c.tick as number, "checkpoint.tick");
    this.stateTicks = counter(c.stateTicks as number, "checkpoint.stateTicks");
    this.warningTicks = counter(c.warningTicks as number, "checkpoint.warningTicks");
    this.intrusionTicks = counter(c.intrusionTicks as number, "checkpoint.intrusionTicks");
    this.selfDefenseTicks = counter(c.selfDefenseTicks as number, "checkpoint.selfDefenseTicks");
    this.defensiveWindowsStarted = counter(c.defensiveWindowsStarted as number, "checkpoint.defensiveWindowsStarted");
    this.fear = fear;
    this.reachedExit = bool(c.reachedRealEscapeExit, "reachedRealEscapeExit");
    this.lineOfSightLostTicks = counter(c.lineOfSightLostTicks as number, "checkpoint.lineOfSightLostTicks");
    this.deescalationTicks = counter(c.deescalationTicks as number, "checkpoint.deescalationTicks");
    this.majorHarmPending = bool(c.majorHarmPending, "majorHarmPending");
    this.defenseUsedThisEncounter = bool(c.defenseUsedThisEncounter, "defenseUsedThisEncounter");
    this.defenseContactEmittedThisWindow = bool(c.defenseContactEmittedThisWindow, "defenseContactEmittedThisWindow");
    this.nonlethalStimulusPending = bool(c.nonlethalStimulusPending, "nonlethalStimulusPending");
    this.fullReturnConditionsMet = bool(c.fullReturnConditionsMet, "fullReturnConditionsMet");
    const readPhysical = (value: unknown): WildlifePhysicalResponse => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("wildlife checkpoint physical response is invalid");
      const raw = value as Record<string, unknown>;
      if (Object.keys(raw).sort().join("|") !== "environmentFeedback|impulseNs|knockbackVelocityTilesPerSecond") throw new Error("wildlife checkpoint physical response shape is invalid");
      const feedback = raw.environmentFeedback;
      if (typeof feedback !== "object" || feedback === null || Array.isArray(feedback)) throw new Error("wildlife checkpoint environment feedback is invalid");
      const bands = feedback as Record<string, unknown>;
      if (Object.keys(bands).sort().join("|") !== "buoyancyBand|heatToleranceBand" || !["sinks", "neutral", "floats"].includes(String(bands.buoyancyBand)) || !["low", "ordinary", "high"].includes(String(bands.heatToleranceBand))) throw new Error("wildlife checkpoint environment bands are invalid");
      for (const field of ["impulseNs", "knockbackVelocityTilesPerSecond"] as const) if (typeof raw[field] !== "number" || !Number.isFinite(raw[field]) || (raw[field] as number) < 0) throw new Error("wildlife checkpoint physical magnitude is invalid");
      return Object.freeze({ impulseNs: raw.impulseNs as number, knockbackVelocityTilesPerSecond: raw.knockbackVelocityTilesPerSecond as number, environmentFeedback: Object.freeze({ buoyancyBand: bands.buoyancyBand as "sinks" | "neutral" | "floats", heatToleranceBand: bands.heatToleranceBand as "low" | "ordinary" | "high" }) });
    };
    const readDefense = (value: unknown): WildlifeDefenseEvent => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("wildlife checkpoint defense event is invalid");
      const raw = value as Record<string, unknown>;
      if (Object.keys(raw).sort().join("|") !== "damage|durationTicksMaximum|eventId|lifeId|physicalResponse|species") throw new Error("wildlife checkpoint defense event shape is invalid");
      if (raw.lifeId !== this.lifeId || raw.species !== this.species || raw.durationTicksMaximum !== WILDLIFE_SELF_DEFENSE_TICKS || typeof raw.damage !== "number" || !Number.isFinite(raw.damage) || raw.damage < 0) throw new Error("wildlife checkpoint defense event identity is invalid");
      return Object.freeze({ eventId: nonEmpty(typeof raw.eventId === "string" ? raw.eventId : "", "checkpoint defense eventId"), lifeId: this.lifeId, species: this.species, damage: raw.damage, durationTicksMaximum: WILDLIFE_SELF_DEFENSE_TICKS, physicalResponse: readPhysical(raw.physicalResponse) });
    };
    if (!Array.isArray(c.defenseEventHistory) || c.defenseEventHistory.length > this.defensiveWindowsStarted) throw new Error("wildlife checkpoint defense history is invalid");
    const defenseIds = new Set<string>();
    for (const raw of c.defenseEventHistory) { const event = readDefense(raw); if (defenseIds.has(event.eventId)) throw new Error("wildlife checkpoint defense event IDs must be unique"); defenseIds.add(event.eventId); this.defenseEventHistory.push(event); }
    this.lastDefense = c.lastDefenseEvent === null ? null : readDefense(c.lastDefenseEvent);
    const latest = this.defenseEventHistory.at(-1) ?? null;
    if ((latest === null) !== (this.lastDefense === null) || (latest && this.lastDefense && latest.eventId !== this.lastDefense.eventId)) throw new Error("wildlife checkpoint last defense must match history tail");
    if (this.intrusionTicks > this.warningTicks || this.selfDefenseTicks > WILDLIFE_SELF_DEFENSE_TICKS || this.defensiveWindowsStarted > this.tickCount) throw new Error("wildlife checkpoint counters are inconsistent");
  }
  private stimulus(idInput:string,fingerprint:string,fearAdded:number,push:number):NonlethalWildlifeActionResult{const id=nonEmpty(idInput,"nonlethal actionId");const prior=this.actions.get(id);if(prior!==undefined)return prior===fingerprint?Object.freeze({accepted:true,duplicate:true,reason:"duplicate",damage:0,fearAdded:0,pushImpulseNs:0}):Object.freeze({accepted:false,duplicate:false,reason:"conflict",damage:0,fearAdded:0,pushImpulseNs:0});if(this.lifeState!=="alive")return Object.freeze({accepted:false,duplicate:false,reason:"tombstoned",damage:0,fearAdded:0,pushImpulseNs:0});this.actions.set(id,fingerprint);if(this.actions.size>ACTION_MEMORY_LIMIT)this.actions.delete(this.actions.keys().next().value!);this.fear=Math.min(100,this.fear+fearAdded);this.nonlethalStimulusPending=true;return Object.freeze({accepted:true,duplicate:false,reason:"applied",damage:0,fearAdded,pushImpulseNs:push})}
  private step(input:WildlifeTickInput){this.tickCount++;if(input.deathTombstone)this.lifeState="tombstoned";if(this.lifeState==="tombstoned")return;if(input.majorHarmOccurred)this.majorHarmPending=true;this.stateTicks++;switch(this.state){case"calm":if(input.playerWithinPerception||input.majorHarmOccurred||this.nonlethalStimulusPending)this.transition("observe");break;case"observe":if(input.playerInsideWarningZone||input.playerBlocksEscape||this.majorHarmPending||this.nonlethalStimulusPending)this.transition("warn");else if(!input.playerWithinPerception)this.deescalateTo("calm");else this.deescalationTicks=0;break;case"warn":this.warningTicks++;if(input.playerInsideWarningZone||input.playerBlocksEscape)this.intrusionTicks++;if(!input.playerWithinPerception&&!input.playerInsideWarningZone&&!input.lineOfSight)this.deescalateTo("observe");else this.deescalationTicks=0;if(this.state!=="warn")break;if(input.realEscapeExitReachable&&(input.playerRetreating||this.fear>=60))this.transition("flee");else if(this.warningTicks>=this.warningMinimum&&!this.defenseUsedThisEncounter&&(this.majorHarmPending||(this.intrusionTicks>=this.defenseMinimum&&this.defenseAuthorized(input))))this.enterDefense();break;case"self_defense":this.selfDefenseTicks++;if(input.defensiveContact&&!this.defenseContactEmittedThisWindow)this.emitDefense(input.playerProfile,input.youngThreatened===true);if(input.realEscapeExitReachable&&(this.selfDefenseTicks>=30||this.fear>=60))this.transition("flee");else if(!input.realEscapeExitReachable&&this.selfDefenseTicks>=30)this.transition("warn");break;case"flee":if(input.reachedRealEscapeExit)this.reachedExit=true;if(!input.lineOfSight)this.lineOfSightLostTicks++;else this.lineOfSightLostTicks=0;this.fullReturnConditionsMet=this.reachedExit&&input.localDangerCleared&&input.returnWorldConditionsSatisfied&&this.lineOfSightLostTicks>=this.loseSightMinimum;if(this.fullReturnConditionsMet)this.transition("return");break;case"return":if(input.atHomeAnchor&&input.localDangerCleared){this.transition("calm");this.resetEncounter()}break}this.nonlethalStimulusPending=false}
  private deescalateTo(next:WildlifeBehaviorState){this.deescalationTicks++;if(this.deescalationTicks>=Math.ceil(this.ecology.deescalateSeconds*60))this.transition(next)}
  private defenseAuthorized(i:WildlifeTickInput){const a=new Set(this.speciesContract.defenseOnlyWhen);return(i.wildlifeCornered&&a.has("cornered"))||(i.youngThreatened===true&&a.has("young_threatened"))||(i.playerBlocksEscape&&a.has("escape_blocked"))}
  private enterDefense(){this.defenseUsedThisEncounter=true;this.defensiveWindowsStarted++;this.defenseContactEmittedThisWindow=false;this.transition("self_defense")}
  private emitDefense(profile:PlayerPhysicalProfile,young:boolean){this.defenseContactEmittedThisWindow=true;const damage=young&&this.speciesContract.guardingYoungDamage!==null?this.speciesContract.guardingYoungDamage:this.speciesContract.defensiveDamage;this.lastDefense=Object.freeze({eventId:`${this.lifeId}:defense-contact:${this.defensiveWindowsStarted}`,lifeId:this.lifeId,species:this.species,damage,durationTicksMaximum:30,physicalResponse:physicalResponse(profile)});this.defenseEventHistory.push(this.lastDefense)}
  private transition(next:WildlifeBehaviorState){this.state=next;this.stateTicks=0;this.deescalationTicks=0;if(next==="warn"){this.warningTicks=0;this.intrusionTicks=0}if(next==="self_defense")this.selfDefenseTicks=0;if(next==="flee"){this.lineOfSightLostTicks=0;this.reachedExit=false;this.fullReturnConditionsMet=false}}
  private resetEncounter(){this.warningTicks=0;this.intrusionTicks=0;this.selfDefenseTicks=0;this.fear=0;this.reachedExit=false;this.lineOfSightLostTicks=0;this.majorHarmPending=false;this.defenseUsedThisEncounter=false;this.defenseContactEmittedThisWindow=false;this.fullReturnConditionsMet=false}
  private get warningMinimum(){return Math.ceil(this.ecology.minimumWarningTelegraphSeconds*60)} private get defenseMinimum(){return Math.ceil(this.ecology.intrusionBeforeDefenseSeconds*60)} private get loseSightMinimum(){return Math.ceil(this.ecology.loseSightSeconds*60)}
}
