import { commitSessionProposal, proposeVerifiedTradeQuote, proposeVerifiedTradeSale } from "../session/adapters";
import { GameSession, type GameSessionSave } from "../session/game-session";
import type { VerifiedSellQuote } from "./verified-trade";

export type VerifiedTradeIssueResult = Readonly<{ accepted: true; duplicate: boolean; quote: VerifiedSellQuote }> |
  Readonly<{ accepted: false; duplicate: false; reason: string }>;
export type VerifiedTradeConfirmResult = Readonly<{ accepted: true; duplicate: false }> |
  Readonly<{ accepted: false; duplicate: boolean; reason: string }>;

/**
 * Formal one-shot quote boundary. Quotes deliberately live only in this instance;
 * reconstructing from a save always starts with an empty registry.
 */
export class VerifiedTradeSession {
  private authoritative: GameSession;
  private readonly issued = new Map<string, Readonly<{ quote: VerifiedSellQuote; issuedEventId: string }>>();
  private readonly issuedOperations = new Map<string, Readonly<{ requestFingerprint: string; quote: VerifiedSellQuote }>>();

  constructor(session: GameSession) {
    this.authoritative = session;
  }

  static fromSave(candidate: unknown): VerifiedTradeSession {
    return new VerifiedTradeSession(GameSession.fromSave(candidate));
  }

  get session(): GameSession {
    return this.authoritative;
  }

  toSave(): GameSessionSave {
    return this.authoritative.toSave();
  }

  issue(request: Readonly<{ playerSaveId: string; merchantId: string; lotId: string; quantity: number; operationId: string;
    playerPositionPx: Readonly<{ x: number; y: number }> }>): VerifiedTradeIssueResult {
    const requestFingerprint = JSON.stringify({ playerSaveId: request.playerSaveId, merchantId: request.merchantId,
      lotId: request.lotId, quantity: request.quantity, operationId: request.operationId });
    const priorOperation = this.issuedOperations.get(request.operationId);
    if (priorOperation) return priorOperation.requestFingerprint === requestFingerprint
      ? { accepted: true, duplicate: true, quote: priorOperation.quote }
      : { accepted: false, duplicate: false, reason: "operation_payload_conflict" };
    if (this.authoritative.events().some((event) => event.type === "verified_trade_quote_issued" && event.payload.operationId === request.operationId)) {
      return { accepted: false, duplicate: false, reason: "operation_already_committed_before_this_runtime" };
    }
    const proposed = proposeVerifiedTradeQuote(this.authoritative, request, {
      playerPositionPx: request.playerPositionPx,
      sceneRevision: this.authoritative.snapshot().world.revision,
      operationId: request.operationId,
    });
    if (!proposed.accepted) return { ...proposed, duplicate: false };
    const committed = commitSessionProposal(this.authoritative, proposed.batch);
    if (!committed.committed) return { accepted: false, duplicate: false, reason: committed.reason ?? "quote_commit_failed" };
    this.authoritative = committed.session;
    this.issued.set(proposed.quote.quoteId, { quote: proposed.quote, issuedEventId: proposed.issuedEventId });
    this.issuedOperations.set(request.operationId, { requestFingerprint, quote: proposed.quote });
    return { accepted: true, duplicate: false, quote: proposed.quote };
  }

  confirm(quoteId: string, runtime: Readonly<{ playerPositionPx: Readonly<{ x: number; y: number }>; sceneRevision: number }>): VerifiedTradeConfirmResult {
    const remembered = this.issued.get(quoteId);
    if (!remembered) return { accepted: false, duplicate: false, reason: "quote_not_issued_in_this_session" };
    const committed = commitSessionProposal(this.authoritative, proposeVerifiedTradeSale(this.authoritative, remembered.quote,
      remembered.issuedEventId, runtime));
    if (!committed.committed) return { accepted: false, duplicate: committed.reason === "duplicate_event" || committed.reason === "duplicate_receipt",
      reason: committed.reason ?? "sale_commit_failed" };
    this.authoritative = committed.session;
    this.issued.delete(quoteId);
    return { accepted: true, duplicate: false };
  }
}
