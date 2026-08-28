import { describe, expect, it } from "vitest";
import { commitSessionProposal } from "../session/adapters";
import { GameSession } from "../session/game-session";
import { PROLOGUE_OLD_MINE_SCENE_ID } from "./prologue-arrival-stream";
import {
  PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS,
  PrologueReturnFlowSession,
} from "./prologue-return-flow";
import { PROLOGUE_SETTLEMENT_SCENE_ID } from "./prologue-settlement";
import { PrologueFlowSession } from "./prologue-flow";
import { authoritativePostEpilogueSettlement } from "./test-helpers/authoritative-post-epilogue-settlement";
import type { ReturnFlowWorldFacts } from "./return-flow-predicates";

const facts: ReturnFlowWorldFacts = {
  settlementSupplyFlowInBand: true,
  wetMeadowFlowInBand: true,
  overflowContact: false,
  overflowGateSeated: true,
  overflowSealIntact: true,
  overflowConduitClear: true,
  mudMassBelowLimit: true,
  channelGradeContinuous: true,
  returnIntakeClear: true,
  oldChannelConnected: true,
  oldChannelClear: true,
  oldChannelBankStable: true,
};

function settlementAfterReturn(sessionId: string): GameSession {
  const source = GameSession.create({ sessionId, mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
    currentSceneId: "scene.valley.high_cistern" });
  const ladder = commitSessionProposal(source, { transactionId: `${sessionId}.ladder`, drafts: [{
    eventId: `${sessionId}.ladder`, type: "world_flag_set",
    payload: { flagId: "exit_ladder_lowered", value: true, scope: "region", regionId: "valley_prologue" },
  }] });
  if (!ladder.committed) throw new Error(`ladder fixture rejected: ${ladder.reason}`);
  const entered = PrologueReturnFlowSession.enterFromCistern(ladder.session, `${sessionId}.return.entry`);
  if (!entered.accepted || !entered.returnFlow) throw new Error(`return entry rejected: ${entered.reason}`);
  const solution = PROLOGUE_RETURN_FLOW_SOLUTION_CONTRACTS[0]!;
  const completed = entered.returnFlow.completeSolution(`${sessionId}.return.complete`, solution.id,
    { completedActionIds: solution.requiredActions, world: facts });
  if (!completed.accepted) throw new Error(`return completion rejected: ${completed.reason}`);
  return authoritativePostEpilogueSettlement(entered.returnFlow.session);
}

describe("PrologueFlowSession peaceful old-mine threshold", () => {
  it("rejects an early N02 entry without mutating the session", () => {
    const source = GameSession.create({ sessionId: "old-mine.early", mp: { currentMp: 24, maxMp: 24, worldVersion: 0 },
      currentSceneId: PROLOGUE_SETTLEMENT_SCENE_ID });
    const flow = PrologueFlowSession.fromSave(source.toSave());
    const before = flow.toSave();
    expect(flow.enterOldMine("old-mine.early.enter")).toMatchObject({ accepted: false,
      result: { reason: "prerequisite_missing" }, snapshot: { mode: "settlement" } });
    expect(flow.toSave()).toEqual(before);
    expect(flow.oldMineView()).toMatchObject({ entryAvailable: false, inOldMine: false, chapterComplete: false, killCount: 0 });
  });

  it("commits the peaceful chapter threshold, survives reload, and returns to N02", () => {
    const flow = PrologueFlowSession.fromSave(settlementAfterReturn("old-mine.mainline").toSave());
    expect(flow.oldMineView()).toMatchObject({ mode: "settlement", entryAvailable: true, inOldMine: false });
    const entered = flow.enterOldMine("old-mine.mainline.enter");
    expect(entered).toMatchObject({ accepted: true, result: { accepted: true, duplicate: false, reason: "committed" },
      snapshot: { mode: "old_mine", runtime: { sceneId: PROLOGUE_OLD_MINE_SCENE_ID },
        oldMine: { chapterComplete: true, peacefulExit: true, returnToSettlementAvailable: true, killCount: 0 }, killCount: 0 } });
    expect(flow.snapshot().session.quests.ch01_world_literacy_prologue_exit).toMatchObject({
      stageId: "peaceful_exit_reached", stageOrdinal: 1,
    });
    expect(Object.values(flow.snapshot().session.receiptIndex).filter((receipt) =>
      receipt.receiptId === "world:old-mine.mainline:prologue-peaceful-exit")).toHaveLength(1);

    const reloaded = PrologueFlowSession.fromSave(JSON.parse(JSON.stringify(flow.toSave())));
    expect(reloaded.snapshot()).toMatchObject({ mode: "old_mine", oldMine: { chapterComplete: true }, killCount: 0 });
    expect(reloaded.oldMineView()).toMatchObject({ inOldMine: true, chapterComplete: true,
      returnToSettlementAvailable: true, killCount: 0 });
    const returned = reloaded.returnOldMineToSettlement("old-mine.mainline.return");
    expect(returned).toMatchObject({ accepted: true, result: { reason: "committed" },
      snapshot: { mode: "settlement", runtime: { sceneId: PROLOGUE_SETTLEMENT_SCENE_ID }, oldMine: null, killCount: 0 } });
    expect(reloaded.snapshot().session.checkpoint).toMatchObject({
      id: "checkpoint.valley.settlement.from-old-mine", sceneId: PROLOGUE_SETTLEMENT_SCENE_ID,
    });
  });
});
