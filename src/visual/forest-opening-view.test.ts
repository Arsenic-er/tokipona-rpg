import { describe, expect, it } from "vitest";
import { PrologueForestOpeningSession } from "../game/prologue-forest-opening";
import {
  runtimeForestOpeningAssetExport,
  type RuntimeForestOpeningAssetPack,
} from "../assets/runtime-forest-opening-assets";
import {
  FOREST_OPENING_VIEWPORT,
  projectForestOpeningView,
  type ForestOpeningPublicView,
} from "./forest-opening-view";
import { renderForestOpeningView } from "./forest-opening-renderer";
import type { LoadedForestOpeningVisualAssets } from "./browser-forest-opening-assets";
import { projectForestOpeningTravelerPixelRig } from "./forest-opening-candidate-traveler";
import { rasterizeForestOpeningTerrain } from "./forest-opening-terrain";
import { forestBodyOccupies } from '../world/forest-body-shape';

function freshView(): ForestOpeningPublicView {
  const session = PrologueForestOpeningSession.fresh({
    sessionId: "view.forest-opening",
    seed: "view.forest-opening.seed",
    currentMp: 12,
    maxMp: 24,
  });
  session.advanceTicks(2, { moveX: 1 });
  return projectForestOpeningView(session.snapshot(), runtimeForestOpeningAssetExport);
}

describe("forest opening public view", () => {
  it('draws chipped bodies on the same world pixels as collision across fractional camera motion', () => {
    const base=freshView();
    const objects=base.environment[2]!.objects.filter(o=>o.kind==='stone' || o.kind==='deadwood');
    expect(objects.every(o=>o.bodyShape==='chipped-v1')).toBe(true);
    for(const cameraX of [1720,1720.25,1720.75]) for(const fraction of [0,0.4]) {
      const moved=objects.map(o=>({...o,bounds:{...o.bounds,x:o.bounds.x+fraction,y:o.bounds.y+fraction}}));
      const view={...base,creatures:[],camera:{...base.camera,x:cameraX,y:640.65},
        environment:base.environment.map(layer=>({...layer,objects:layer.layer==='world_material'?moved:[]}))};
      const pixels=new Set<string>();
      const context={save(){},restore(){},fillRect(x:number,y:number,w:number,h:number){
        for(let py=y;py<y+h;py++) for(let px=x;px<x+w;px++) pixels.add(`${px},${py}`);
      }} as unknown as CanvasRenderingContext2D;
      // Empty supplied backdrop/traveler isolate the actual world-object draw calls.
      renderForestOpeningView(context,view,null,undefined,()=>{},()=>{});
      for(const object of moved) {
        const body={...object.bounds,id:object.id};
        for(let y=Math.floor(body.y)-1;y<=Math.ceil(body.y+body.height);y++)
          for(let x=Math.floor(body.x)-1;x<=Math.ceil(body.x+body.width);x++) {
            expect(pixels.has(`${x-Math.round(view.camera.x)},${y-Math.round(view.camera.y)}`))
              .toBe(forestBodyOccupies(body,'chipped-v1',x,y));
          }
      }
    }
  });
  it("does not offer glyph observation above its actual interaction radius", () => {
    const base = PrologueForestOpeningSession.fresh({ sessionId: "view.glyph-range", seed: "glyph-range" }).snapshot();
    const at = (y: number) => projectForestOpeningView({ ...base,
      runtime: { ...base.runtime,
        obstacle: { ...base.runtime.obstacle, committedSolutionId: "shallow_detour" },
        spatial: { ...base.runtime.spatial, player: { ...base.runtime.spatial.player, position: { x: 2138, y } } },
      },
    }, runtimeForestOpeningAssetExport).obstacle.interactionId;
    // Glyph point y=672; actor bottom y+14. The decorative rectangle starts at 664.
    expect(at(609)).toBeNull();
    expect(at(610)).toBe("observe_glyph");
  });
  it("projects a fixed 640x360 four-depth candidate with tiny non-glowing traveler", () => {
    const view = freshView();
    expect(FOREST_OPENING_VIEWPORT).toEqual({ width: 640, height: 360 });
    expect(view.presentation).toEqual({ kind: "procedural_candidate", approvedAssetPackId: null });
    expect(view.environment.map(({ layer }) => layer)).toEqual([
      "far_parallax", "mid_parallax", "world_material", "foreground",
    ]);
    expect(view.traveler.visualHeightPx).toBe(19);
    expect(view.traveler.glow).toBe(false);
    expect(view.traveler.animationId).toBe("fall");
    expect(view.hud).toMatchObject({ health: 100, maxHealth: 100, mp: 12, maxMp: 24 });
  });

  it("uses the existing readable 14x19 traveler rig with its feet anchored to the 12x14 body", () => {
    const view = freshView();
    const rig = projectForestOpeningTravelerPixelRig(view);

    expect(rig.visualBounds).toEqual({ width: 14, height: 19 });
    expect(rig.collisionBody).toEqual({ width: 12, height: 14 });
    expect(rig.anchorOffset).toEqual({ x: -1, y: -5 });
    expect(rig.pixels.some(({ role }) => role === "eye")).toBe(true);
    expect(rig.pixels.some(({ role }) => role === "scarf")).toBe(true);
    expect(view.traveler.position.y + rig.collisionBody.height)
      .toBe(view.traveler.position.y + rig.anchorOffset.y + rig.visualBounds.height);
  });

  it("rasterizes the same streamed material cells used by collision under the traveler", () => {
    const session = PrologueForestOpeningSession.fresh({
      sessionId: "view.collision-ground",
      seed: "view.collision-ground.seed",
    });
    session.advanceTicks(120);
    const snapshot = session.snapshot();
    const projected = projectForestOpeningView(snapshot, runtimeForestOpeningAssetExport);
    const view = { ...projected, camera: { ...projected.camera, x: Math.round(projected.camera.x), y: Math.round(projected.camera.y) } };
    const pixels = rasterizeForestOpeningTerrain(session.visibleMaterialChunks(), view.camera);
    const left = Math.floor(snapshot.runtime.spatial.player.position.x - view.camera.x);
    const footY = Math.round(snapshot.runtime.spatial.player.position.y + 14 - view.camera.y);
    const alpha = (x: number, y: number) => pixels[(y * 640 + x) * 4 + 3];

    expect(snapshot.runtime.spatial.player.grounded).toBe(true);
    const sole = Array.from({ length: 12 }, (_, index) => left + index);
    expect(sole.every((x) => alpha(x, footY - 1) === 0)).toBe(true);
    // An AABB on a one-pixel uneven surface contacts at its supporting edge,
    // not necessarily at the center pixel. Rendering must expose that contact.
    expect(sole.some((x) => alpha(x, footY) === 255)).toBe(true);
  });

  it("contains only browser-facing semantic and visual fields", () => {
    const view = freshView();
    expect(Object.keys(view).sort()).toEqual([
      "camera", "creatures", "dialogue", "environment", "hud", "mode", "obstacle",
      "presentation", "tick", "traveler", "worldMinute",
    ]);
    const bytes = JSON.stringify(view);
    for (const forbidden of [
      "receiptIndex", "processedEventPayloads", "learning", "world.flags", "stateDigest",
      "checksum", "topologyDigest", "private", "candidate-export", "damageOverride",
      "teleport", "setPosition", "GameSessionState",
    ]) expect(bytes).not.toContain(forbidden);
  });

  it("projects exact obstacle objects, natural creatures, and unknown-glyph state", () => {
    const view = freshView();
    expect(view.obstacle).toMatchObject({
      solutionId: null,
      visuallyComplete: false,
      glyph: { wordId: "word.telo", observed: false, meaningKnown: false, pronunciationKnown: false },
    });
    expect(view.creatures.map(({ speciesId }) => speciesId)).toEqual([
      "forest.rabbit", "forest.wetland_bird",
    ]);
    expect(view.creatures.every(({ hostile }) => hostile === false)).toBe(true);
    expect(view.environment.find(({ layer }) => layer === "world_material")?.objects.map(({ kind }) => kind))
      .toEqual(["stream", "stone", "stone", "deadwood", "unknown_glyph", "settlement_perimeter"]);
    const stream = view.environment[2]!.objects[0]!;
    expect(stream.materialPocket).toMatchObject({ width: 128, height: 64 });
    expect(stream.materialPocket?.cells).toHaveLength(128 * 64);
  });

  it("renders three visibly distinct committed route outcomes from narrow material state", () => {
    const base = PrologueForestOpeningSession.fresh({ sessionId: "view.routes", seed: "view.routes.seed" }).snapshot();
    const commands = (solutionId: "stone_steps" | "deadwood_bridge" | "shallow_detour") => {
      const snapshot = {
        ...base,
        runtime: { ...base.runtime, spatial: { ...base.runtime.spatial,
          camera: { ...base.runtime.spatial.camera, x: 1_600, y: 500 } }, obstacle: {
          ...base.runtime.obstacle,
          committedSolutionId: solutionId,
          shallowDetourEntered: solutionId === "shallow_detour",
          stones: {
            a: { ...base.runtime.obstacle.stones.a,
              bounds: solutionId === "stone_steps" ? { x: 1_872, y: 736, width: 12, height: 12 } : base.runtime.obstacle.stones.a.bounds,
              seated: solutionId === "stone_steps" },
            b: { ...base.runtime.obstacle.stones.b,
              bounds: solutionId === "stone_steps" ? { x: 1_904, y: 736, width: 12, height: 12 } : base.runtime.obstacle.stones.b.bounds,
              seated: solutionId === "stone_steps" },
          },
          deadwood: { ...base.runtime.obstacle.deadwood,
            bounds: solutionId === "deadwood_bridge" ? { x: 1_860, y: 710, width: 40, height: 6 } : base.runtime.obstacle.deadwood.bounds,
            bridged: solutionId === "deadwood_bridge" },
        } },
      };
      const painted: string[] = [];
      let currentFill = "";
      const context = {
        save() {}, restore() {}, drawImage() {}, strokeRect() {},
        fillRect(x: number, y: number, width: number, height: number) {
          painted.push(`${currentFill}:${x},${y},${width},${height}`);
        },
        set fillStyle(value: string | CanvasGradient | CanvasPattern) { currentFill = String(value); },
        strokeStyle: "", imageSmoothingEnabled: false,
      } as unknown as CanvasRenderingContext2D;
      renderForestOpeningView(context, projectForestOpeningView(snapshot, runtimeForestOpeningAssetExport));
      return painted;
    };
    expect(commands("stone_steps")).not.toEqual(commands("deadwood_bridge"));
    expect(commands("deadwood_bridge")).not.toEqual(commands("shallow_detour"));
    expect(commands("stone_steps")).not.toEqual(commands("shallow_detour"));
  });

  it("selects idle, walk, delayed run, jump, and fall animations from verified motion only", () => {
    const base = PrologueForestOpeningSession.fresh({ sessionId: "view.motion", seed: "view.motion.seed" }).snapshot();
    const withPlayer = (velocity: { x: number; y: number }, grounded: boolean) => ({
      ...base,
      runtime: {
        ...base.runtime,
        spatial: { ...base.runtime.spatial, player: { ...base.runtime.spatial.player, velocity, grounded } },
      },
    });
    expect(projectForestOpeningView(withPlayer({ x: 0, y: 0 }, true), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("idle");
    expect(projectForestOpeningView(withPlayer({ x: 7, y: 0 }, true), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("walk");
    expect(projectForestOpeningView(withPlayer({ x: 80, y: 0 }, true), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("run");
    expect(projectForestOpeningView(withPlayer({ x: 0, y: -2 }, false), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("jump");
    expect(projectForestOpeningView(withPlayer({ x: 0, y: 2 }, false), runtimeForestOpeningAssetExport)
      .traveler.animationId).toBe("fall");
    for (const action of ["push", "drag", "dig", "observe"] as const) {
      expect(projectForestOpeningView(base, runtimeForestOpeningAssetExport, null, action).traveler.animationId)
        .toBe(action);
    }
  });

  it("projects locomotion phase supplied by the gait instead of cycling by wall time", () => {
    const base = PrologueForestOpeningSession.fresh({
      sessionId: "view.gait-cadence",
      seed: "view.gait-cadence.seed",
    }).snapshot();
    const frameAt = (tick: number, velocityX: number, frame = 0) => projectForestOpeningView({
      ...base,
      runtime: {
        ...base.runtime,
        tick,
        spatial: {
          ...base.runtime.spatial,
          player: {
            ...base.runtime.spatial.player,
            velocity: { x: velocityX, y: 0 },
            grounded: true,
          },
        },
      },
    }, runtimeForestOpeningAssetExport, null, null, frame).traveler.frame;

    expect([frameAt(0, 40), frameAt(4, 40), frameAt(5, 40), frameAt(9, 40)])
      .toEqual([0, 0, 0, 0]);
    expect([frameAt(0, 88), frameAt(4, 88), frameAt(5, 88), frameAt(9, 88)])
      .toEqual([0, 0, 0, 0]);
    expect(frameAt(5, 40, 3)).toBe(3);
    expect(frameAt(6, 88, 3)).toBe(3);
  });

  it("does not offer excavation from the distant bank of the new physical creek", () => {
    const base = PrologueForestOpeningSession.fresh({
      sessionId: "view.shallow-route",
      seed: "view.shallow-route.seed",
    }).snapshot();
    const atStreamEdge = {
      ...base,
      runtime: {
        ...base.runtime,
        spatial: {
          ...base.runtime.spatial,
          player: {
            ...base.runtime.spatial.player,
            position: { x: 1_756, y: 690 },
            grounded: true,
          },
        },
      },
    };

    const view = projectForestOpeningView(atStreamEdge, runtimeForestOpeningAssetExport);
    expect(view.obstacle.interactionPrompt).not.toBe("E · 疏通松土");
    expect(view.obstacle.interactionId).not.toBe("enter_shallow_detour");
  });

  it("offers the soil tool when the actual plug is the nearest interaction", () => {
    const base = PrologueForestOpeningSession.fresh({
      sessionId: "view.shallow-readable",
      seed: "view.shallow-readable.seed",
    }).snapshot();
    const view = projectForestOpeningView({
      ...base,
      runtime: { ...base.runtime, spatial: { ...base.runtime.spatial, player: {
        ...base.runtime.spatial.player,
        position: { x: 1_870, y: 714 },
        grounded: true,
      } } },
    }, runtimeForestOpeningAssetExport);
    expect(view.obstacle.interactionPrompt).toBe("E · 疏通松土");
    expect(view.obstacle.interactionId).toBe("enter_shallow_detour");
  });

  it("prioritizes a nearby loose object over the shallow-water fallback", () => {
    const base = PrologueForestOpeningSession.fresh({
      sessionId: "view.loose-object",
      seed: "view.loose-object.seed",
    }).snapshot();
    const besideStone = {
      ...base,
      runtime: {
        ...base.runtime,
        spatial: {
          ...base.runtime.spatial,
          player: {
            ...base.runtime.spatial.player,
            position: { x: 1_816, y: 690 },
            grounded: true,
          },
        },
      },
    };

    const view = projectForestOpeningView(besideStone, runtimeForestOpeningAssetExport);
    expect(view.obstacle.interactionPrompt).toBe("E · 推动松石");
    expect(view.obstacle.interactionId).toBe("push_stone");
  });

  it("keeps the unknown-glyph observation prompt after a physical route is complete", () => {
    const base = PrologueForestOpeningSession.fresh({
      sessionId: "view.glyph-after-route",
      seed: "view.glyph-after-route.seed",
    }).snapshot();
    const besideGlyph = {
      ...base,
      runtime: {
        ...base.runtime,
        obstacle: {
          ...base.runtime.obstacle,
          committedSolutionId: "shallow_detour" as const,
          shallowDetourEntered: true,
        },
        spatial: {
          ...base.runtime.spatial,
          player: {
            ...base.runtime.spatial.player,
            position: { x: 2_128, y: 670 },
            grounded: true,
          },
        },
      },
    };

    const view = projectForestOpeningView(besideGlyph, runtimeForestOpeningAssetExport);
    expect(view.obstacle.interactionPrompt).toBe("F · 观察未知刻痕");
    expect(view.obstacle.interactionId).toBe("observe_glyph");
  });

  it("announces and renders an approved pack only after every visual asset is loaded", () => {
    const snapshot = PrologueForestOpeningSession.fresh({
      sessionId: "view.approved", seed: "view.approved.seed",
    }).snapshot();
    const assets = { status: "approved", packId: "forest.opening.vertical-slice.v001" } as RuntimeForestOpeningAssetPack;
    const imageNames = ["far", "mid", "environment", "glyph", "traveler", "creature"] as const;
    const images = Object.fromEntries(imageNames.map((name) => [name, { name }])) as Record<string, CanvasImageSource>;
    const loaded = {
      packId: "forest.opening.vertical-slice.v001",
      images: {
        far_parallax_atlas: images.far,
        mid_parallax_atlas: images.mid,
        environment_atlas: images.environment,
        prop_glyph_atlas: images.glyph,
        traveler_atlas: images.traveler,
        creature_atlas: images.creature,
      },
      travelerAnimations: Object.fromEntries(
        ["idle", "walk", "run", "jump", "fall", "push", "drag", "dig", "observe"]
          .map((action, row) => [action, { row, frames: 4, frameWidthPx: 64,
            frameHeightPx: 20, footAnchorYPx: row * 28 + 24 }]),
      ),
      timePalette: [
        { id: "dawn", multiply: [0.5, 0.6, 0.7], ambient: [10, 20, 30] },
        { id: "day", multiply: [1, 1, 0.9], ambient: [80, 90, 70] },
        { id: "dusk", multiply: [0.8, 0.5, 0.4], ambient: [50, 30, 20] },
        { id: "night", multiply: [0.3, 0.4, 0.5], ambient: [5, 10, 20] },
      ],
    } as unknown as LoadedForestOpeningVisualAssets;
    expect(projectForestOpeningView(snapshot, assets).presentation.kind).toBe("procedural_candidate");
    const view = projectForestOpeningView(snapshot, assets, loaded);
    expect(view.presentation).toEqual({
      kind: "approved_asset_pack", approvedAssetPackId: "forest.opening.vertical-slice.v001",
    });
    const drawn: unknown[] = [];
    const tints: string[] = [];
    const drawCalls: unknown[][] = [];
    const context = renderingContext(drawn, tints, drawCalls);

    renderForestOpeningView(context, view, loaded);
    const nearGlyph = {
      ...snapshot,
      runtime: {
        ...snapshot.runtime,
        spatial: {
          ...snapshot.runtime.spatial,
          player: { ...snapshot.runtime.spatial.player, position: { x: 2_128, y: 670 } },
          camera: { ...snapshot.runtime.spatial.camera, x: 1_920 },
        },
      },
    };
    renderForestOpeningView(context, projectForestOpeningView(nearGlyph, assets, loaded), loaded);
    renderForestOpeningView(context, { ...view, worldMinute: 720 }, loaded);

    expect(new Set(drawn)).toEqual(new Set(Object.values(images)));
    expect(new Set(tints).size).toBeGreaterThan(1);
    const creatureSources = drawCalls.filter(([image]) => image === images.creature).map((call) => call[1]);
    expect(creatureSources).toContain(25);
    expect(creatureSources).toContain(50);

    const expectedCells = [
      ["forest.rabbit", "foraging", 1], ["forest.rabbit", "alert", 2],
      ["forest.rabbit", "fleeing", 3], ["forest.rabbit", "sheltered", 4],
      ["forest.wetland_bird", "wading", 2], ["forest.wetland_bird", "alert", 3],
      ["forest.wetland_bird", "taking_off", 4], ["forest.wetland_bird", "departed", 4],
    ] as const;
    for (const [speciesId, animationId, cell] of expectedCells) {
      drawCalls.length = 0;
      renderForestOpeningView(context, { ...view, creatures: [{ speciesId, animationId,
        position: { x: view.camera.x + 20, y: view.camera.y + 20 }, frame: 3, hostile: false }] }, loaded);
      expect(drawCalls.find(([image]) => image === images.creature)?.[1]).toBe(cell * 25);
    }
  });
});

function renderingContext(drawn: unknown[], tints: string[] = [], drawCalls: unknown[][] = []): CanvasRenderingContext2D {
  return {
    save() {}, restore() {}, fillRect() {}, strokeRect() {},
    drawImage(...args: unknown[]) { drawn.push(args[0]); drawCalls.push(args); },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { if (typeof value === "string") tints.push(value); },
    set strokeStyle(_value: string | CanvasGradient | CanvasPattern) {},
    set imageSmoothingEnabled(_value: boolean) {},
    set globalAlpha(_value: number) {},
    set globalCompositeOperation(_value: GlobalCompositeOperation) {},
  } as unknown as CanvasRenderingContext2D;
}
