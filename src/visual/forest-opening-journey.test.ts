import { describe, expect, it } from "vitest";
import { PrologueForestOpeningSession } from "../game/prologue-forest-opening";
import { runtimeForestOpeningAssetExport } from "../assets/runtime-forest-opening-assets";
import { projectForestOpeningView } from "./forest-opening-view";
import { forestJourneyBeat } from "./forest-opening-journey";

const session = PrologueForestOpeningSession.fresh({ sessionId: "journey.view", seed: "journey.view" });
const opening = projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);

describe("forest short journey presentation", () => {
  it("introduces an immediate goal without inventing past identity or magic", () => {
    expect(forestJourneyBeat(opening)).toMatchObject({ stage: 0, finished: false, title: "初入林缘", route: "尚未处理" });
  });

  it("reflects the partial stone state instead of claiming a completed crossing", () => {
    const legacy = projectForestOpeningView(PrologueForestOpeningSession.fresh({ sessionId: "journey.legacy", seed: "journey.view", physics: "shared" }).snapshot(), runtimeForestOpeningAssetExport);
    const partial = { ...legacy, traveler: { ...legacy.traveler, position: { x: 1840, y: 650 } },
      environment: legacy.environment.map(layer => ({ ...layer, objects: layer.objects.map(object =>
        object.id === "stream.stone.a" ? { ...object, state: "seated" } : object) })) };
    expect(forestJourneyBeat(partial)).toMatchObject({ stage: 1, route: "尚未处理", finished: false });
    expect(forestJourneyBeat(partial).detail).toContain("1/2");
  });

  it("explains actual passage and combination play for the integrated world", () => {
    const atCreek = { ...opening, traveler: { ...opening.traveler, position: { x: 1840, y: 650 } } };
    expect(forestJourneyBeat(atCreek)).toMatchObject({ stage: 1, route: "尚未处理", finished: false });
    expect(forestJourneyBeat(atCreek).detail).toContain("实际到达对岸");
    expect(forestJourneyBeat(atCreek).detail).not.toContain("1/2");
  });

  it.each(["stone_steps", "deadwood_bridge", "shallow_detour"] as const)("keeps glyph observation optional for %s", solutionId => {
    const crossed = { ...opening, obstacle: { ...opening.obstacle, solutionId } };
    expect(forestJourneyBeat(crossed)).toMatchObject({ stage: 2, finished: false });
    const finished = { ...crossed, mode: "settlement_perimeter" as const };
    expect(forestJourneyBeat(finished)).toMatchObject({ stage: 4, finished: true });
    expect(forestJourneyBeat(finished).glyph).toContain("不影响抵达聚落");
    expect(forestJourneyBeat(finished).detail).toContain("进入聚落");
  });

  it("records unknown shapes without awarding words, capabilities or changing session bytes", () => {
    const before = session.toSave();
    const seen = { ...opening, obstacle: { ...opening.obstacle, solutionId: "shallow_detour" as const,
      glyph: { ...opening.obstacle.glyph, observed: true } } };
    expect(forestJourneyBeat(seen)).toMatchObject({ stage: 3, glyph: "已记下图形 · 读音与含义未知" });
    expect(session.toSave()).toEqual(before);
  });
});
