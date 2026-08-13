import {
  type SessionLifeCorpseLedger,
  type SessionWildlifeCorpseRecord,
  type WildlifeDamageRequest,
  type WildlifeRewardDelta,
  ZERO_WILDLIFE_REWARD_DELTA,
  isSessionLifeCorpseLedger,
} from "./life-corpse-ledger";
import {
  commitSessionProposal,
  proposeWildlifeDamage,
} from "../session/adapters";
import {
  GameSession,
  type GameSessionEvent,
} from "../session/game-session";

export interface WildlifeMortalityReceipt {
  readonly receiptId: string;
  readonly transactionId: string;
  readonly lifeInstanceId: string;
  readonly lifeRevision: number;
  readonly currentHp: number;
  readonly deathEventId: string | null;
  readonly corpseId: string | null;
  readonly rewardDelta: WildlifeRewardDelta;
}

export type WildlifeMortalityReason =
  | "committed"
  | "duplicate"
  | "transaction_conflict"
  | "feature_disabled"
  | "life_not_registered"
  | "life_revision_conflict"
  | "life_already_tombstoned"
  | "invalid_request";

export interface WildlifeMortalityResult {
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly reason: WildlifeMortalityReason;
  readonly session: GameSession;
  readonly receipt: WildlifeMortalityReceipt | null;
}

export interface WildlifeMortalityPort {
  readonly featureEnabled: boolean;
  applyDamage(session: GameSession, request: WildlifeDamageRequest): WildlifeMortalityResult;
}

/**
 * Read-only bridge for the N06 coordinator. It intentionally exposes no corpse
 * mutation or economy operation; the Session aggregate remains the sole truth.
 */
export class GameSessionWildlifeLifeLedgerView {
  readonly revision: string;
  readonly featureEnabled: boolean;
  private readonly ledger: SessionLifeCorpseLedger;

  constructor(session: GameSession) {
    const ledger = session.lifeCorpseLedgerSnapshot();
    if (!isSessionLifeCorpseLedger(ledger)) throw new Error("GameSession life/corpse ledger is invalid");
    this.ledger = ledger;
    this.revision = `life-corpse-ledger:${ledger.revision}`;
    this.featureEnabled = Object.keys(ledger.lives).length > 0;
  }

  hasRegisteredLife(lifeInstanceId: string): boolean {
    return this.ledger.lives[lifeInstanceId] !== undefined;
  }

  hasTombstone(lifeInstanceId: string): boolean {
    return this.ledger.lives[lifeInstanceId]?.state === "dead";
  }

  corpseForLife(lifeInstanceId: string): SessionWildlifeCorpseRecord | null {
    const corpseId = this.ledger.corpseIdByLifeId[lifeInstanceId];
    return corpseId === undefined ? null : structuredClone(this.ledger.corpses[corpseId] ?? null);
  }
}

const isDamageEvent = (
  event: GameSessionEvent,
): event is Extract<GameSessionEvent, { type: "wildlife_damage_committed" | "wildlife_death_committed" }> =>
  event.type === "wildlife_damage_committed" || event.type === "wildlife_death_committed";

const requestMatchesEvent = (
  request: WildlifeDamageRequest,
  event: Extract<GameSessionEvent, { type: "wildlife_damage_committed" | "wildlife_death_committed" }>,
): boolean => {
  const payload = event.payload;
  return request.transactionId === payload.transactionId &&
    request.lifeInstanceId === payload.lifeInstanceId &&
    request.expectedLifeRevision === payload.expectedLifeRevision &&
    request.damage === payload.damage &&
    request.causeClass === payload.causeClass &&
    request.worldTick === payload.worldTick &&
    request.position.x === payload.position.x && request.position.y === payload.position.y;
};

const requestIsValid = (request: WildlifeDamageRequest): boolean =>
  request.transactionId.trim().length > 0 && request.lifeInstanceId.trim().length > 0 &&
  Number.isSafeInteger(request.expectedLifeRevision) && request.expectedLifeRevision >= 0 &&
  Number.isFinite(request.damage) && request.damage > 0 && request.causeClass.trim().length > 0 &&
  Number.isSafeInteger(request.worldTick) && request.worldTick >= 0 &&
  Number.isFinite(request.position.x) && Number.isFinite(request.position.y);

const receiptFor = (
  session: GameSession,
  transactionId: string,
  lifeInstanceId: string,
): WildlifeMortalityReceipt | null => {
  const life = session.snapshot().lifeCorpseLedger.lives[lifeInstanceId];
  if (!life) return null;
  const authoritativeTransactionId = life.deathTransactionId ?? transactionId;
  return Object.freeze({
    receiptId: `wildlife:${authoritativeTransactionId}`,
    transactionId: authoritativeTransactionId,
    lifeInstanceId,
    lifeRevision: life.lifeRevision,
    currentHp: life.currentHp,
    deathEventId: life.deathEventId,
    corpseId: life.corpseId,
    rewardDelta: ZERO_WILDLIFE_REWARD_DELTA,
  });
};

/** One port is scoped to one validated registered life instance. */
export class GameSessionWildlifeMortalityPort implements WildlifeMortalityPort {
  readonly featureEnabled: boolean;

  constructor(session: GameSession, readonly lifeInstanceId: string) {
    const ledger = session.lifeCorpseLedgerSnapshot();
    this.featureEnabled = isSessionLifeCorpseLedger(ledger) && ledger.lives[lifeInstanceId] !== undefined;
  }

  applyDamage(session: GameSession, request: WildlifeDamageRequest): WildlifeMortalityResult {
    if (!this.featureEnabled || request.lifeInstanceId !== this.lifeInstanceId) {
      return this.result(session, false, false, "feature_disabled", null);
    }
    if (!requestIsValid(request)) return this.result(session, false, false, "invalid_request", null);

    const priorEvent = session.events().find((event) =>
      isDamageEvent(event) && event.payload.transactionId === request.transactionId);
    if (priorEvent && isDamageEvent(priorEvent)) {
      return requestMatchesEvent(request, priorEvent)
        ? this.result(session, false, true, "duplicate", receiptFor(session, request.transactionId, request.lifeInstanceId))
        : this.result(session, false, false, "transaction_conflict", null);
    }

    const life = session.snapshot().lifeCorpseLedger.lives[request.lifeInstanceId];
    if (!life) return this.result(session, false, false, "life_not_registered", null);
    if (life.state === "dead") {
      return this.result(
        session,
        false,
        true,
        "life_already_tombstoned",
        receiptFor(session, life.deathTransactionId!, life.lifeInstanceId),
      );
    }
    if (request.expectedLifeRevision !== life.lifeRevision) {
      return this.result(session, false, false, "life_revision_conflict", null);
    }

    let commit;
    try {
      commit = commitSessionProposal(session, proposeWildlifeDamage(session, request));
    } catch {
      return this.result(session, false, false, "invalid_request", null);
    }
    if (!commit.committed) {
      const reason = commit.reason === "event_payload_conflict"
        ? "transaction_conflict"
        : commit.reason === "life_revision_conflict"
          ? "life_revision_conflict"
          : "invalid_request";
      return this.result(session, false, false, reason, null);
    }
    return this.result(
      commit.session,
      true,
      false,
      "committed",
      receiptFor(commit.session, request.transactionId, request.lifeInstanceId),
    );
  }

  private result(
    session: GameSession,
    committed: boolean,
    duplicate: boolean,
    reason: WildlifeMortalityReason,
    receipt: WildlifeMortalityReceipt | null,
  ): WildlifeMortalityResult {
    return Object.freeze({ committed, duplicate, reason, session, receipt });
  }
}
