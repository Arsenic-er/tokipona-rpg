/** Storage-agnostic cross-save WAL. A durable store is mandatory in production. */
export const CROSS_SAVE_WAL_SCHEMA = "tokipona.cross-save-wal.v0.1" as const;
export const CROSS_SAVE_WAL_COORDINATOR_ID = "cross_save_wal.v0.1" as const;

export type CrossSaveWalState = "prepared" | "committed" | "applied" | "aborted" | "garbage_collectable";
export type CrossSaveWalDecision = "undecided" | "commit" | "abort";
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface CrossSaveWalContract {
  readonly schemaVersion: string;
  readonly coordinatorId: typeof CROSS_SAVE_WAL_COORDINATOR_ID;
  readonly sourceDigest: `sha256:${string}`;
  /** Canonical transaction kind -> exact participant save-owner set. */
  readonly registeredTransactionKinds: Readonly<Record<string, readonly string[]>>;
}

export interface CrossSaveWalOperationInput {
  readonly saveOwner: string;
  readonly deterministicOperation: string;
  readonly canonicalPayload: JsonValue;
  readonly redoPayload: JsonValue;
  readonly expectedRevision: number;
  readonly expectedAfterRevision: number;
  readonly lockKey: string;
  readonly outputKinds?: readonly string[];
  readonly receiptKinds?: readonly string[];
  readonly redoPreconditions?: JsonValue;
}

export interface CrossSaveWalOperationEnvelope {
  readonly schemaVersion: string;
  readonly saveOwner: string;
  readonly deterministicOperation: string;
  readonly canonicalPayload: JsonValue;
  readonly redoPayload: JsonValue;
  readonly beforeRevision: number;
  readonly expectedAfterRevision: number;
  readonly outputKinds: readonly string[];
  readonly receiptKinds: readonly string[];
  readonly outputStartIndex: number;
  readonly deterministicOutputIds: readonly string[];
  readonly deterministicReceiptIds: readonly string[];
  readonly redoPreconditions: JsonValue;
  readonly lockKey: string;
  readonly operationHash: `sha256:${string}`;
}

export interface CrossSaveWalParticipantRecord {
  readonly saveOwner: string;
  readonly beforeRevision: number;
  readonly expectedRevision: number;
  readonly durableIntentId: string;
  readonly reservationOrLockId: string;
  readonly operationEnvelopeRef: number;
  readonly operationHash: `sha256:${string}`;
  readonly afterRevision: number;
  readonly appliedRevision: number | null;
}

export interface CrossSaveWalRecord {
  readonly transactionId: string;
  readonly transactionKind: string;
  readonly canonicalIdempotencyKey: string;
  readonly participants: readonly CrossSaveWalParticipantRecord[];
  readonly operationEnvelopes: readonly CrossSaveWalOperationEnvelope[];
  readonly state: CrossSaveWalState;
  readonly durableDecision: CrossSaveWalDecision;
  readonly participantPrepareAcks: readonly string[];
  readonly participantApplyAcks: readonly string[];
  readonly participantSnapshotAcks: readonly string[];
  readonly createdTick: number;
  readonly updatedTick: number;
  readonly quarantineReason: string | null;
}

export interface CrossSaveWalSave {
  readonly schema: typeof CROSS_SAVE_WAL_SCHEMA;
  readonly contract: CrossSaveWalContract;
  readonly records: readonly CrossSaveWalRecord[];
  readonly receiptIndex: readonly string[];
  readonly acceptingNewTransactions: boolean;
  readonly checksum: `sha256:${string}`;
}

export type CrossSaveWalPersistPhase = "prepared" | "prepare_ack" | "commit_decision" | "apply_ack" | "applied" | "abort_decision" | "quarantine" | "snapshot_ack" | "garbage_collectable";

/** Implementations must make each method durable before returning. */
export interface DurableCrossSaveWalStore {
  persist(record: CrossSaveWalRecord, phase: CrossSaveWalPersistPhase): void;
  hasDurableIntent(transactionId: string, participant: CrossSaveWalParticipantRecord): boolean;
  hasDurableSnapshot(transactionId: string, saveOwner: string, revision: number): boolean;
  /** Merge a checkpoint with authoritative durable WAL; never regress a durable phase. */
  reconcileFromSave(records: readonly CrossSaveWalRecord[]): readonly CrossSaveWalRecord[];
}

export interface CrossSaveWalParticipant {
  readonly saveOwner: string;
  revision(): number;
  prepare(intent: CrossSaveWalParticipantRecord, envelope: CrossSaveWalOperationEnvelope): boolean;
  apply(envelope: CrossSaveWalOperationEnvelope, transactionId: string): number;
  release(intent: CrossSaveWalParticipantRecord): void;
}

export interface CrossSaveWalRuntimeOptions {
  readonly contract: CrossSaveWalContract;
  readonly participants: readonly CrossSaveWalParticipant[];
  readonly durableStore: DurableCrossSaveWalStore;
}

export interface CrossSaveWalBeginInput {
  readonly transactionKind: string;
  readonly canonicalIdempotencyKey: string;
  readonly operations: readonly CrossSaveWalOperationInput[];
  readonly tick: number;
}

export interface CrossSaveWalRecovery {
  readonly sceneActivationBlocked: boolean;
  readonly quarantinedTransactionIds: readonly string[];
  readonly changed: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const counter = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const digest = (value: unknown): value is `sha256:${string}` => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
const uniqueStrings = (values: readonly string[]): boolean => values.every(nonEmpty) && new Set(values).size === values.length;
const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);

export const canonicalJson = (value: JsonValue): string => {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) throw new Error("canonical JSON number is invalid");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key]!)}`).join(",")}}`;
};

const cloneJson = (value: JsonValue): JsonValue => {
  if (value === null || typeof value !== "object") {
    canonicalJson(value);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(cloneJson));
  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort()) result[key] = cloneJson((value as { readonly [key: string]: JsonValue })[key]!);
  return Object.freeze(result);
};

const sha256Bytes = (input: string): string => {
  const bytes = new TextEncoder().encode(input), bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64, data = new Uint8Array(paddedLength);
  data.set(bytes); data[bytes.length] = 0x80;
  const view = new DataView(data.buffer); view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000)); view.setUint32(paddedLength - 4, bitLength >>> 0);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const rotate = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits)); const w = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) { const a = w[i - 15]!, b = w[i - 2]!; w[i] = ((rotate(a,7)^rotate(a,18)^(a>>>3))+w[i-16]!+(rotate(b,17)^rotate(b,19)^(b>>>10))+w[i-7]!)>>>0; }
    let [a,b,c,d,e,f,g,z] = h;
    for (let i = 0; i < 64; i += 1) { const t1=(z!+(rotate(e!,6)^rotate(e!,11)^rotate(e!,25))+((e!&f!)^(~e!&g!))+k[i]!+w[i]!)>>>0,t2=((rotate(a!,2)^rotate(a!,13)^rotate(a!,22))+((a!&b!)^(a!&c!)^(b!&c!)))>>>0;z=g;g=f;f=e;e=(d!+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    const values=[a,b,c,d,e,f,g,z]; for(let i=0;i<8;i+=1)h[i]=(h[i]!+values[i]!)>>>0;
  }
  return [...h].map((value)=>value.toString(16).padStart(8,"0")).join("");
};

export const sha256Canonical = (value: JsonValue): `sha256:${string}` => `sha256:${sha256Bytes(canonicalJson(value))}`;
export const createCrossSaveTransactionId = (kind: string, key: string): string => {
  if (!nonEmpty(kind) || !nonEmpty(key)) throw new Error("transaction identity is invalid");
  return `wal-tx:sha256:${sha256Canonical([CROSS_SAVE_WAL_COORDINATOR_ID,kind,key]).slice(7)}`;
};
export const createCrossSaveOutputId = (transactionId: string, outputKind: string, globalIndex: number): string => {
  if (!nonEmpty(transactionId)||!nonEmpty(outputKind)||!counter(globalIndex))throw new Error("output identity is invalid");
  return `wal-output:sha256:${sha256Canonical([transactionId,outputKind,globalIndex]).slice(7)}`;
};
export const createCrossSaveReceiptId = (transactionId: string, receiptKind: string): string => {
  if(!nonEmpty(transactionId)||!nonEmpty(receiptKind))throw new Error("receipt identity is invalid");
  return `wal-receipt:sha256:${sha256Canonical([transactionId,receiptKind]).slice(7)}`;
};

const contractValid = (value: unknown): value is CrossSaveWalContract => {
  if(!isRecord(value)||!nonEmpty(value.schemaVersion)||value.coordinatorId!==CROSS_SAVE_WAL_COORDINATOR_ID||!digest(value.sourceDigest)||!isRecord(value.registeredTransactionKinds))return false;
  return Object.entries(value.registeredTransactionKinds).every(([kind,owners])=>nonEmpty(kind)&&Array.isArray(owners)&&uniqueStrings(owners as string[])&&(owners as string[]).length>0);
};
const envelopeHash = (envelope: Omit<CrossSaveWalOperationEnvelope,"operationHash">): `sha256:${string}` => sha256Canonical(envelope as unknown as JsonValue);
const envelopeValid = (value: unknown): value is CrossSaveWalOperationEnvelope => {
  if(!isRecord(value)||!nonEmpty(value.schemaVersion)||!nonEmpty(value.saveOwner)||!nonEmpty(value.deterministicOperation)||!("canonicalPayload" in value)||!("redoPayload" in value)||!counter(value.beforeRevision)||!counter(value.expectedAfterRevision)||value.expectedAfterRevision<value.beforeRevision||!Array.isArray(value.outputKinds)||!(value.outputKinds as unknown[]).every(nonEmpty)||!Array.isArray(value.receiptKinds)||!uniqueStrings(value.receiptKinds as string[])||!counter(value.outputStartIndex)||!Array.isArray(value.deterministicOutputIds)||!uniqueStrings(value.deterministicOutputIds as string[])||!Array.isArray(value.deterministicReceiptIds)||!uniqueStrings(value.deterministicReceiptIds as string[])||!("redoPreconditions" in value)||!nonEmpty(value.lockKey)||!digest(value.operationHash))return false;
  try { const {operationHash,...body}=value as unknown as CrossSaveWalOperationEnvelope; return envelopeHash(body)===operationHash; } catch{return false;}
};
const participantValid=(value:unknown,envelopes:readonly CrossSaveWalOperationEnvelope[]):value is CrossSaveWalParticipantRecord=>isRecord(value)&&nonEmpty(value.saveOwner)&&counter(value.beforeRevision)&&counter(value.expectedRevision)&&nonEmpty(value.durableIntentId)&&nonEmpty(value.reservationOrLockId)&&counter(value.operationEnvelopeRef)&&value.operationEnvelopeRef<envelopes.length&&digest(value.operationHash)&&counter(value.afterRevision)&&(value.appliedRevision===null||counter(value.appliedRevision));

const recordValid=(value:unknown,contract:CrossSaveWalContract):value is CrossSaveWalRecord=>{
  if(!isRecord(value)||!nonEmpty(value.transactionId)||!nonEmpty(value.transactionKind)||!nonEmpty(value.canonicalIdempotencyKey)||!Array.isArray(value.operationEnvelopes)||!(value.operationEnvelopes as unknown[]).every(envelopeValid)||!Array.isArray(value.participants)||!Array.isArray(value.participantPrepareAcks)||!Array.isArray(value.participantApplyAcks)||!Array.isArray(value.participantSnapshotAcks)||!uniqueStrings(value.participantPrepareAcks as string[])||!uniqueStrings(value.participantApplyAcks as string[])||!uniqueStrings(value.participantSnapshotAcks as string[])||!["prepared","committed","applied","aborted","garbage_collectable"].includes(String(value.state))||!["undecided","commit","abort"].includes(String(value.durableDecision))||!counter(value.createdTick)||!counter(value.updatedTick)||(value.quarantineReason!==null&&!nonEmpty(value.quarantineReason)))return false;
  const envelopes=value.operationEnvelopes as CrossSaveWalOperationEnvelope[],participants=value.participants as unknown[],expected=contract.registeredTransactionKinds[value.transactionKind as string]; if(!expected)return false;
  const typed=participants as CrossSaveWalParticipantRecord[],owners=typed.map((p)=>p.saveOwner); if(participants.length!==envelopes.length||!participants.every((p)=>participantValid(p,envelopes))||!sameSet(owners,expected)||!sameSet(envelopes.map((e)=>e.saveOwner),expected))return false;
  if(value.transactionId!==createCrossSaveTransactionId(value.transactionKind,value.canonicalIdempotencyKey))return false;
  let outputIndex=0; const receipts=new Set<string>();
  for(let i=0;i<envelopes.length;i+=1){const envelope=envelopes[i]!,participant=typed[i]!;const intentMaterial:JsonValue=[value.transactionId,envelope.saveOwner,envelope.operationHash];if(envelope.schemaVersion!==contract.schemaVersion||participant.saveOwner!==envelope.saveOwner||participant.operationEnvelopeRef!==i||participant.beforeRevision!==envelope.beforeRevision||participant.expectedRevision!==envelope.beforeRevision||participant.afterRevision!==envelope.expectedAfterRevision||participant.operationHash!==envelope.operationHash||participant.durableIntentId!==`wal-intent:${sha256Canonical(intentMaterial).slice(7)}`||participant.reservationOrLockId!==`wal-lock:${sha256Canonical([envelope.saveOwner,envelope.lockKey]).slice(7)}`)return false;if(envelope.outputStartIndex!==outputIndex||envelope.deterministicOutputIds.length!==envelope.outputKinds.length||envelope.deterministicReceiptIds.length!==envelope.receiptKinds.length)return false;for(let local=0;local<envelope.outputKinds.length;local+=1){if(envelope.deterministicOutputIds[local]!==createCrossSaveOutputId(value.transactionId,envelope.outputKinds[local]!,outputIndex++))return false;}for(let local=0;local<envelope.receiptKinds.length;local+=1){const id=createCrossSaveReceiptId(value.transactionId,envelope.receiptKinds[local]!);if(envelope.deterministicReceiptIds[local]!==id||receipts.has(id))return false;receipts.add(id);}}
  const prepared=value.participantPrepareAcks as string[],applied=value.participantApplyAcks as string[],snapshots=value.participantSnapshotAcks as string[];if(![...prepared,...applied,...snapshots].every((owner)=>owners.includes(owner)))return false;
  if(value.state==="prepared")return value.durableDecision==="undecided"&&applied.length===0&&snapshots.length===0&&typed.every((p)=>p.appliedRevision===null);if(value.state==="aborted")return value.durableDecision==="abort"&&applied.length===0&&snapshots.length===0&&typed.every((p)=>p.appliedRevision===null);if(value.durableDecision!=="commit"||prepared.length!==typed.length)return false;
  if(value.state==="committed"){const revisionOwners=typed.filter((p)=>p.appliedRevision!==null).map((p)=>p.saveOwner);return typed.every((p)=>p.appliedRevision===null||p.appliedRevision===p.afterRevision)&&sameSet(applied,revisionOwners);}
  if(applied.length!==typed.length||!typed.every((p)=>p.appliedRevision===p.afterRevision))return false;return value.state==="applied"?snapshots.length<=typed.length:snapshots.length===typed.length;
};

const deepFreezeEnvelope=(value:CrossSaveWalOperationEnvelope):CrossSaveWalOperationEnvelope=>Object.freeze({...value,canonicalPayload:cloneJson(value.canonicalPayload),redoPayload:cloneJson(value.redoPayload),redoPreconditions:cloneJson(value.redoPreconditions),outputKinds:Object.freeze([...value.outputKinds]),receiptKinds:Object.freeze([...value.receiptKinds]),deterministicOutputIds:Object.freeze([...value.deterministicOutputIds]),deterministicReceiptIds:Object.freeze([...value.deterministicReceiptIds])});
const freezeRecord=(value:CrossSaveWalRecord):CrossSaveWalRecord=>Object.freeze({...value,participants:Object.freeze(value.participants.map((p)=>Object.freeze({...p}))),operationEnvelopes:Object.freeze(value.operationEnvelopes.map(deepFreezeEnvelope)),participantPrepareAcks:Object.freeze([...value.participantPrepareAcks]),participantApplyAcks:Object.freeze([...value.participantApplyAcks]),participantSnapshotAcks:Object.freeze([...value.participantSnapshotAcks])});
const saveBody=(save:Omit<CrossSaveWalSave,"checksum">):JsonValue=>({schema:save.schema,contract:save.contract as unknown as JsonValue,records:save.records as unknown as JsonValue,receiptIndex:save.receiptIndex as unknown as JsonValue,acceptingNewTransactions:save.acceptingNewTransactions});
export const isCrossSaveWalSave=(value:unknown):value is CrossSaveWalSave=>{
  if(!isRecord(value)||value.schema!==CROSS_SAVE_WAL_SCHEMA||!contractValid(value.contract)||!Array.isArray(value.records)||!(value.records as unknown[]).every((record)=>recordValid(record,value.contract as CrossSaveWalContract))||!Array.isArray(value.receiptIndex)||!uniqueStrings(value.receiptIndex as string[])||typeof value.acceptingNewTransactions!=="boolean"||!digest(value.checksum))return false;
  const save=value as unknown as CrossSaveWalSave,body={schema:save.schema,contract:save.contract,records:save.records,receiptIndex:save.receiptIndex,acceptingNewTransactions:save.acceptingNewTransactions};if(sha256Canonical(saveBody(body))!==save.checksum)return false;
  if(new Set(save.records.map((r)=>r.transactionId)).size!==save.records.length||new Set(save.records.map((r)=>r.canonicalIdempotencyKey)).size!==save.records.length)return false;
  const acknowledged=new Set(save.records.flatMap((r)=>r.operationEnvelopes.filter((_,i)=>r.participantApplyAcks.includes(r.participants[i]!.saveOwner)).flatMap((e)=>e.deterministicReceiptIds)));return save.receiptIndex.every((id)=>acknowledged.has(id));
};

export class CrossSaveWalRuntime {
  private readonly participantByOwner:ReadonlyMap<string,CrossSaveWalParticipant>;private records:CrossSaveWalRecord[]=[];private receipts=new Set<string>();private accepting=true;private recoveryReady=true;private loadFailure:string|null=null;
  public constructor(private readonly options:CrossSaveWalRuntimeOptions){if(!contractValid(options.contract)||!options.durableStore)throw new Error("WAL requires a verified contract and durable store");this.participantByOwner=new Map(options.participants.map((p)=>[p.saveOwner,p]));if(this.participantByOwner.size!==options.participants.length)throw new Error("participant owners must be unique");}
  public isSceneActivationReady():boolean{return this.loadFailure===null&&this.recoveryReady&&this.records.every((r)=>r.quarantineReason===null&&r.state!=="prepared"&&r.state!=="committed");}
  public begin(input:CrossSaveWalBeginInput):CrossSaveWalRecord{
    if(!this.accepting||!this.recoveryReady)throw new Error("WAL is not ready for new transactions");const expectedOwners=this.options.contract.registeredTransactionKinds[input.transactionKind];if(!expectedOwners||!nonEmpty(input.canonicalIdempotencyKey)||!counter(input.tick)||!sameSet(input.operations.map((o)=>o.saveOwner),expectedOwners))throw new Error("transaction participants do not match contract");if(expectedOwners.some((owner)=>!this.participantByOwner.has(owner)))throw new Error("transaction participant adapter is unavailable");
    const transactionId=createCrossSaveTransactionId(input.transactionKind,input.canonicalIdempotencyKey),envelopes=this.createEnvelopes(transactionId,input.operations),existing=this.records.find((r)=>r.transactionId===transactionId||r.canonicalIdempotencyKey===input.canonicalIdempotencyKey);
    if(existing){if(existing.transactionKind!==input.transactionKind||canonicalJson(existing.operationEnvelopes as unknown as JsonValue)!==canonicalJson(envelopes as unknown as JsonValue))throw new Error("idempotency key conflicts with different request");return existing;}
    const participants=envelopes.map((e,i)=>this.createParticipant(transactionId,e,i));let record=freezeRecord({transactionId,transactionKind:input.transactionKind,canonicalIdempotencyKey:input.canonicalIdempotencyKey,participants,operationEnvelopes:envelopes,state:"prepared",durableDecision:"undecided",participantPrepareAcks:[],participantApplyAcks:[],participantSnapshotAcks:[],createdTick:input.tick,updatedTick:input.tick,quarantineReason:null});this.persist(record,"prepared");this.records.push(record);
    const acquired:CrossSaveWalParticipantRecord[]=[];for(const participant of record.participants){const adapter=this.participantByOwner.get(participant.saveOwner)!,envelope=record.operationEnvelopes[participant.operationEnvelopeRef]!;if(adapter.revision()!==participant.expectedRevision||!adapter.prepare(participant,envelope)){record=this.replace(record,{state:"aborted",durableDecision:"abort",updatedTick:input.tick},"abort_decision");for(const intent of acquired)this.participantByOwner.get(intent.saveOwner)?.release(intent);return record;}acquired.push(participant);record=this.replace(record,{participantPrepareAcks:acquired.map((p)=>p.saveOwner),updatedTick:input.tick},"prepare_ack");}return record;
  }
  public commit(transactionId:string,tick:number):CrossSaveWalRecord{let record=this.requireRecord(transactionId);if(!counter(tick))throw new Error("tick invalid");if(record.state==="aborted"||record.state==="garbage_collectable")throw new Error("transaction cannot commit");if(record.state==="prepared"){if(record.participantPrepareAcks.length!==record.participants.length||!record.participants.every((p)=>this.options.durableStore.hasDurableIntent(transactionId,p)))throw new Error("commit requires durable intents");record=this.replace(record,{state:"committed",durableDecision:"commit",updatedTick:tick},"commit_decision");}return record.state==="committed"?this.forwardApply(record,tick):record;}
  public abort(transactionId:string,tick:number):CrossSaveWalRecord{const record=this.requireRecord(transactionId);if(record.durableDecision==="commit"||["committed","applied","garbage_collectable"].includes(record.state))throw new Error("committed transaction only recovers forward");if(record.state==="aborted")return record;const next=this.replace(record,{state:"aborted",durableDecision:"abort",updatedTick:tick},"abort_decision");for(const p of next.participants)this.participantByOwner.get(p.saveOwner)?.release(p);return next;}
  public recover(tick:number):CrossSaveWalRecovery{if(!counter(tick))throw new Error("tick invalid");let changed=false;for(const snapshot of [...this.records]){let record=this.requireRecord(snapshot.transactionId);const missing=record.participants.filter((p)=>!this.participantByOwner.has(p.saveOwner)).map((p)=>p.saveOwner);if(missing.length){this.quarantine(record,`missing participant: ${missing.join(",")}`,tick);changed=true;continue;}if(record.quarantineReason!==null)continue;if(record.state==="prepared"&&record.durableDecision==="undecided"){this.abort(record.transactionId,tick);changed=true;}else if(record.state==="committed"){record=this.forwardApply(record,tick);changed=true;}else if(record.state==="applied"||record.state==="garbage_collectable"){for(const participant of record.participants){const adapter=this.participantByOwner.get(participant.saveOwner)!;if(adapter.revision()>=participant.afterRevision)continue;const envelope=record.operationEnvelopes[participant.operationEnvelopeRef]!;try{if(adapter.revision()!==participant.beforeRevision||adapter.apply(envelope,record.transactionId)!==participant.afterRevision)throw new Error(`${participant.saveOwner} applied revision missing`);changed=true;}catch(error){this.quarantine(record,error instanceof Error?error.message:"applied recovery failure",tick);changed=true;break;}}}}
    this.recoveryReady=this.loadFailure===null&&!this.records.some((r)=>r.quarantineReason!==null||r.state==="prepared"||r.state==="committed");const ids=this.records.filter((r)=>r.quarantineReason!==null).map((r)=>r.transactionId).sort();return Object.freeze({sceneActivationBlocked:!this.recoveryReady,quarantinedTransactionIds:Object.freeze(ids),changed});}
  public checkpointBarrier(tick:number):CrossSaveWalRecovery{this.accepting=false;return this.recover(tick);}public endBarrier():void{if(!this.recoveryReady)throw new Error("WAL recovery blocks activation");this.accepting=true;}
  public acknowledgeParticipantSnapshot(transactionId:string,saveOwner:string,revision:number,tick:number):CrossSaveWalRecord{const record=this.requireRecord(transactionId),participant=record.participants.find((p)=>p.saveOwner===saveOwner);if(record.state!=="applied"||!participant||participant.afterRevision!==revision||!this.options.durableStore.hasDurableSnapshot(transactionId,saveOwner,revision))throw new Error("durable participant snapshot acknowledgement required");if(record.participantSnapshotAcks.includes(saveOwner))return record;return this.replace(record,{participantSnapshotAcks:[...record.participantSnapshotAcks,saveOwner],updatedTick:tick},"snapshot_ack");}
  public garbageCollect(transactionId:string,tick:number):CrossSaveWalRecord{const record=this.requireRecord(transactionId);if(record.state!=="applied"||record.participantSnapshotAcks.length!==record.participants.length)throw new Error("all durable participant snapshots are required");return this.replace(record,{state:"garbage_collectable",updatedTick:tick},"garbage_collectable");}
  public snapshot():CrossSaveWalSave{const base={schema:CROSS_SAVE_WAL_SCHEMA,contract:this.options.contract,records:Object.freeze(this.records.map(freezeRecord)),receiptIndex:Object.freeze([...this.receipts].sort()),acceptingNewTransactions:this.accepting}as const;return Object.freeze({...base,checksum:sha256Canonical(saveBody(base))});}
  public load(save:unknown):void{this.accepting=false;this.recoveryReady=false;if(!isCrossSaveWalSave(save)){this.loadFailure="WAL save is corrupt";throw new Error(this.loadFailure);}if(canonicalJson(save.contract as unknown as JsonValue)!==canonicalJson(this.options.contract as unknown as JsonValue)){this.loadFailure="WAL contract mismatch";throw new Error(this.loadFailure);}this.loadFailure=null;try{const reconciled=this.options.durableStore.reconcileFromSave(save.records);if(!reconciled.every((record)=>recordValid(record,this.options.contract)))throw new Error("durable WAL store returned corrupt record");this.records=reconciled.map(freezeRecord);this.receipts=new Set([...save.receiptIndex,...this.records.flatMap((record)=>record.operationEnvelopes.filter((_,index)=>record.participantApplyAcks.includes(record.participants[index]!.saveOwner)).flatMap((envelope)=>envelope.deterministicReceiptIds))]);}catch(error){this.loadFailure=error instanceof Error?error.message:"durable WAL store failure";throw error;}}
  public recordsSnapshot():readonly CrossSaveWalRecord[]{return Object.freeze(this.records.map(freezeRecord));}
  private createEnvelopes(transactionId:string,inputs:readonly CrossSaveWalOperationInput[]):readonly CrossSaveWalOperationEnvelope[]{let outputIndex=0;const receiptKinds=new Set<string>();return Object.freeze(inputs.map((input)=>{if(!nonEmpty(input.saveOwner)||!nonEmpty(input.deterministicOperation)||!counter(input.expectedRevision)||!counter(input.expectedAfterRevision)||input.expectedAfterRevision<input.expectedRevision||!nonEmpty(input.lockKey)||input.redoPayload===undefined)throw new Error("operation is invalid");const outputKinds=input.outputKinds??[],receipts=input.receiptKinds??[];if(!outputKinds.every(nonEmpty)||!uniqueStrings(receipts)||receipts.some((kind)=>receiptKinds.has(kind)))throw new Error("output kinds must be valid and receipt kinds must be unique transaction-wide");receipts.forEach((kind)=>receiptKinds.add(kind));const outputStartIndex=outputIndex;const body={schemaVersion:this.options.contract.schemaVersion,saveOwner:input.saveOwner,deterministicOperation:input.deterministicOperation,canonicalPayload:cloneJson(input.canonicalPayload),redoPayload:cloneJson(input.redoPayload),beforeRevision:input.expectedRevision,expectedAfterRevision:input.expectedAfterRevision,deterministicOutputIds:Object.freeze(outputKinds.map((kind)=>createCrossSaveOutputId(transactionId,kind,outputIndex++))),deterministicReceiptIds:Object.freeze(receipts.map((kind)=>createCrossSaveReceiptId(transactionId,kind))),redoPreconditions:cloneJson(input.redoPreconditions??null),lockKey:input.lockKey,outputKinds:Object.freeze([...outputKinds]),receiptKinds:Object.freeze([...receipts]),outputStartIndex}as const;return deepFreezeEnvelope({...body,operationHash:envelopeHash(body)});}));}
  private createParticipant(transactionId:string,envelope:CrossSaveWalOperationEnvelope,index:number):CrossSaveWalParticipantRecord{const material:JsonValue=[transactionId,envelope.saveOwner,envelope.operationHash];return Object.freeze({saveOwner:envelope.saveOwner,beforeRevision:envelope.beforeRevision,expectedRevision:envelope.beforeRevision,durableIntentId:`wal-intent:${sha256Canonical(material).slice(7)}`,reservationOrLockId:`wal-lock:${sha256Canonical([envelope.saveOwner,envelope.lockKey]).slice(7)}`,operationEnvelopeRef:index,operationHash:envelope.operationHash,afterRevision:envelope.expectedAfterRevision,appliedRevision:null});}
  private verifyForward(record:CrossSaveWalRecord):void{if(!recordValid(record,this.options.contract))throw new Error("WAL record integrity failure");if(!record.participants.filter((p)=>!record.participantApplyAcks.includes(p.saveOwner)).every((p)=>this.options.durableStore.hasDurableIntent(record.transactionId,p)))throw new Error("durable intent lost before apply");}
  private forwardApply(record:CrossSaveWalRecord,tick:number):CrossSaveWalRecord{let current=record;try{this.verifyForward(current);for(const participant of current.participants){if(current.participantApplyAcks.includes(participant.saveOwner))continue;const adapter=this.participantByOwner.get(participant.saveOwner);if(!adapter)throw new Error(`missing participant: ${participant.saveOwner}`);const envelope=current.operationEnvelopes[participant.operationEnvelopeRef]!,revision=adapter.apply(envelope,current.transactionId);if(revision!==participant.afterRevision)throw new Error(`${participant.saveOwner} apply CAS mismatch`);current=this.replace(current,{participants:current.participants.map((p)=>p.saveOwner===participant.saveOwner?{...p,appliedRevision:revision}:p),participantApplyAcks:[...current.participantApplyAcks,participant.saveOwner],updatedTick:tick},"apply_ack");for(const id of envelope.deterministicReceiptIds)this.receipts.add(id);}if(current.participantApplyAcks.length===current.participants.length){for(const p of current.participants)this.participantByOwner.get(p.saveOwner)?.release(p);current=this.replace(current,{state:"applied",updatedTick:tick},"applied");}return current;}catch(error){return this.quarantine(current,error instanceof Error?error.message:"apply failure",tick);}}
  private quarantine(record:CrossSaveWalRecord,reason:string,tick:number):CrossSaveWalRecord{this.recoveryReady=false;return this.replace(record,{quarantineReason:reason,updatedTick:tick},"quarantine");}
  private requireRecord(id:string):CrossSaveWalRecord{const record=this.records.find((r)=>r.transactionId===id);if(!record)throw new Error("unknown transaction");return record;}
  private persist(record:CrossSaveWalRecord,phase:CrossSaveWalPersistPhase):void{try{this.options.durableStore.persist(record,phase);}catch(error){this.accepting=false;this.recoveryReady=false;this.loadFailure=error instanceof Error?error.message:"durable WAL store failure";throw error;}}
  private replace(current:CrossSaveWalRecord,patch:Partial<CrossSaveWalRecord>,phase:CrossSaveWalPersistPhase):CrossSaveWalRecord{const next=freezeRecord({...current,...patch});this.persist(next,phase);this.records=this.records.map((r)=>r.transactionId===current.transactionId?next:r);return next;}
}

/** Test-only model of a durable store. It records persistence order and fault injection state. */
export class InMemoryDurableCrossSaveWalStore implements DurableCrossSaveWalStore {
  public readonly persistenceLog:{readonly transactionId:string;readonly phase:CrossSaveWalPersistPhase}[]=[];private readonly records=new Map<string,CrossSaveWalRecord>();private readonly intents=new Set<string>();private readonly snapshots=new Set<string>();
  public persist(record:CrossSaveWalRecord,phase:CrossSaveWalPersistPhase):void{this.records.set(record.transactionId,freezeRecord(record));this.persistenceLog.push(Object.freeze({transactionId:record.transactionId,phase}));if(phase==="prepare_ack")for(const p of record.participants.filter((candidate)=>record.participantPrepareAcks.includes(candidate.saveOwner)))this.intents.add(`${record.transactionId}|${p.durableIntentId}|${p.reservationOrLockId}`);if(phase==="abort_decision")for(const p of record.participants)this.intents.delete(`${record.transactionId}|${p.durableIntentId}|${p.reservationOrLockId}`);}
  public hasDurableIntent(transactionId:string,p:CrossSaveWalParticipantRecord):boolean{return this.intents.has(`${transactionId}|${p.durableIntentId}|${p.reservationOrLockId}`);}public hasDurableSnapshot(transactionId:string,owner:string,revision:number):boolean{return this.snapshots.has(`${transactionId}|${owner}|${revision}`);}public acknowledgeDurableSnapshot(transactionId:string,owner:string,revision:number):void{this.snapshots.add(`${transactionId}|${owner}|${revision}`);}public revokeIntent(transactionId:string,p:CrossSaveWalParticipantRecord):void{this.intents.delete(`${transactionId}|${p.durableIntentId}|${p.reservationOrLockId}`);}
  public reconcileFromSave(checkpointRecords:readonly CrossSaveWalRecord[]):readonly CrossSaveWalRecord[]{const rank:Record<CrossSaveWalState,number>={prepared:1,aborted:2,committed:3,applied:4,garbage_collectable:5};for(const checkpoint of checkpointRecords){const durable=this.records.get(checkpoint.transactionId);if(!durable){this.records.set(checkpoint.transactionId,freezeRecord(checkpoint));continue;}const durableScore=rank[durable.state]*1000+durable.participantApplyAcks.length*10+durable.participantSnapshotAcks.length,checkpointScore=rank[checkpoint.state]*1000+checkpoint.participantApplyAcks.length*10+checkpoint.participantSnapshotAcks.length;if(checkpointScore>durableScore)this.records.set(checkpoint.transactionId,freezeRecord(checkpoint));}this.intents.clear();for(const record of this.records.values())if(record.state!=="aborted"&&record.state!=="applied"&&record.state!=="garbage_collectable")for(const p of record.participants.filter((candidate)=>record.participantPrepareAcks.includes(candidate.saveOwner)&&!record.participantApplyAcks.includes(candidate.saveOwner)))this.intents.add(`${record.transactionId}|${p.durableIntentId}|${p.reservationOrLockId}`);return Object.freeze([...this.records.values()].map(freezeRecord));}
}

export const createInMemoryCrossSaveParticipant=(saveOwner:string,initialRevision=0):CrossSaveWalParticipant&{readonly appliedTransactionIds:ReadonlySet<string>}=>{let revision=initialRevision;const locks=new Set<string>(),applied=new Set<string>();return Object.freeze({saveOwner,revision:()=>revision,prepare:(intent:CrossSaveWalParticipantRecord)=>{if(locks.has(intent.reservationOrLockId)||revision!==intent.expectedRevision)return false;locks.add(intent.reservationOrLockId);return true;},apply:(envelope:CrossSaveWalOperationEnvelope,transactionId:string)=>{if(applied.has(transactionId))return envelope.expectedAfterRevision;if(revision!==envelope.beforeRevision)throw new Error(`${saveOwner} CAS mismatch`);revision=envelope.expectedAfterRevision;applied.add(transactionId);return revision;},release:(intent:CrossSaveWalParticipantRecord)=>{locks.delete(intent.reservationOrLockId);},appliedTransactionIds:applied});};
