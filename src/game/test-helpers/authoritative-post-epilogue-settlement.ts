import { commitSessionProposal } from "../../session/adapters";
import { type GameSessionEvent, GameSession, replayGameSession } from "../../session/game-session";

/**
 * Test-only fixture for downstream N02 concerns.  The authored N07 ->
 * underground -> N02 chapter handoff is not a runnable coordinator yet, so
 * these tests receive a replay-validated post-epilogue aggregate instead of
 * silently exercising the removed direct N07 -> N02 path.
 */
export function authoritativePostEpilogueSettlement(session: GameSession): GameSession {
  const id = `test-only.post-epilogue:${session.sessionId}`;
  const routed = commitSessionProposal(session, { transactionId: id, drafts: [
    { eventId: `${id}.underground`, type: "scene_entered", payload: { sceneId: "scene.valley.underground_order_node" } },
    { eventId: `${id}.creature`, type: "world_flag_set", payload: { flagId: "forest_large_creature_resolution_committed", value: true, scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.resolution`, type: "world_flag_set", payload: { flagId: "forest_large_creature_resolution", value: "migration_restored", scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.synchronized`, type: "world_flag_set", payload: { flagId: "forest_site_synchronized", value: true, scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.allocation`, type: "world_flag_set", payload: { flagId: "forest_water_allocation", value: "wetland_priority", scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.lead`, type: "world_flag_set", payload: { flagId: "forest_site_lead_revealed", value: true, scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.epilogue`, type: "world_flag_set", payload: { flagId: "forest_chapter_epilogue_committed", value: true, scope: "region", regionId: "valley_prologue" } },
    { eventId: `${id}.settlement`, type: "scene_entered", payload: { sceneId: "scene.valley.settlement" } },
  ] });
  if (!routed.committed) throw new Error(`test-only post-epilogue route rejected: ${routed.reason}`);
  const save = routed.session.toSave();
  const events: readonly GameSessionEvent[] = [...save.eventLedger, {
    eventId: `${id}.return-observation`, sequence: save.eventLedger.length + 1,
    type: "prologue_return_observation_committed" as const,
    payload: { transactionId: id, writerEvent: "return_observation_committed" },
  }];
  const replayed = replayGameSession(save.sessionId, save.origin, events);
  if (!replayed.ok) throw new Error(`test-only post-epilogue fixture rejected: ${replayed.reason}/${replayed.failedEventId ?? "none"}`);
  return replayed.session;
}
