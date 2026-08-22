import generatedRuntimeArtifact from "../generated/content-runtime.v0.1.json";
import { readRuntimeSceneManifestIndex } from "../content/runtime-scene-manifest";
import {
  PrologueFlowSession,
  type PrologueFlowSnapshot,
} from "../game/prologue-flow";
import type { RuntimeInput } from "../runtime";
import type { GameSessionSave } from "../session/game-session";
import {
  derivePrototypeCharacterPose,
  projectWorldScaleFrame,
  type PrototypeCharacterHistory,
  type WorldScaleFrame,
  type WorldScaleProfileId,
} from "./world-scale-prototype";
import {
  projectWorldInteraction,
  type WorldInteractionView,
} from "./world-interaction";

const SCENES = readRuntimeSceneManifestIndex(generatedRuntimeArtifact).byId;

export interface WorldScalePrototypeSnapshot {
  readonly profileId: WorldScaleProfileId;
  readonly flow: PrologueFlowSnapshot;
  readonly frame: WorldScaleFrame;
}

export interface WorldScaleInteractionResult {
  readonly accepted: boolean;
  readonly reason: "not_available" | "discovered" | "attuned" | "manifested" | "rejected";
  readonly message: string;
  readonly interaction: WorldInteractionView;
}

/**
 * Thin experiment-only owner around the real prologue flow.
 * Profile selection and rendering history are deliberately absent from GameSession saves.
 */
export class WorldScalePrototypeController {
  private profileId: WorldScaleProfileId = "medium";
  private previousCharacter: PrototypeCharacterHistory | null = null;
  private interactionEngaged = false;

  private constructor(private readonly flow: PrologueFlowSession) {}

  static fresh(sessionId: string, currentMp = 8, maxMp = 24): WorldScalePrototypeController {
    if (!sessionId.trim()) throw new Error("world scale sessionId must not be empty");
    return new WorldScalePrototypeController(PrologueFlowSession.fresh({ sessionId, currentMp, maxMp }));
  }

  setProfile(profileId: WorldScaleProfileId): WorldScalePrototypeSnapshot {
    this.profileId = profileId;
    return this.snapshot();
  }

  advanceTicks(ticks: number, input: RuntimeInput = {}): WorldScalePrototypeSnapshot {
    if ((input.moveX ?? 0) !== 0 || input.jump === true) this.interactionEngaged = false;
    const before = this.flow.snapshot().runtime;
    const pose = derivePrototypeCharacterPose(before, this.previousCharacter);
    this.previousCharacter = Object.freeze({
      grounded: pose.grounded,
      facing: pose.facing,
      tick: pose.tick,
    });
    this.flow.advanceTicks(ticks, input);
    return this.snapshot();
  }

  snapshot(): WorldScalePrototypeSnapshot {
    const flow = this.flow.snapshot();
    const scene = SCENES[flow.runtime.sceneId];
    if (!scene) throw new Error(`world scale scene is missing: ${flow.runtime.sceneId}`);
    return Object.freeze({
      profileId: this.profileId,
      flow,
      frame: projectWorldScaleFrame({
        profileId: this.profileId,
        scene,
        runtime: flow.runtime,
        previousCharacter: this.previousCharacter,
      }),
    });
  }

  flowSnapshot(): PrologueFlowSnapshot {
    return this.flow.snapshot();
  }

  interactionView(): WorldInteractionView {
    return projectWorldInteraction(this.flow.snapshot(), this.interactionEngaged);
  }

  interact(): WorldScaleInteractionResult {
    const before = this.interactionView();
    if (!before.actionable) {
      return Object.freeze({
        accepted: false,
        reason: "not_available",
        message: "这里没有可互动的事物。",
        interaction: before,
      });
    }
    const sessionId = this.flow.snapshot().sessionId;
    if (before.phase === "undiscovered") {
      const result = this.flow.discoverTelo(`world-scale.${sessionId}.glyph.telo`);
      if (result.accepted) this.interactionEngaged = true;
      return this.interactionResult(result.accepted, "discovered", "你辨认出了 telo（水）。");
    }
    if (before.phase === "discovered") {
      const result = this.flow.attuneTelo(
        `world-scale.${sessionId}.attune.telo`,
        `world-scale.${sessionId}.glyph.telo`,
      );
      if (result.accepted) this.interactionEngaged = true;
      return this.interactionResult(result.accepted, "attuned", "水声与 telo 的形状完成了调谐。");
    }
    const result = this.flow.manifestTelo(`world-scale.${sessionId}.manifest.telo`);
    if (result.accepted) this.interactionEngaged = true;
    return this.interactionResult(result.accepted, "manifested", "telo 显化为落入浅溪的水。");
  }

  toSave(): GameSessionSave {
    return this.flow.toSave();
  }

  private interactionResult(
    accepted: boolean,
    reason: "discovered" | "attuned" | "manifested",
    message: string,
  ): WorldScaleInteractionResult {
    return Object.freeze({
      accepted,
      reason: accepted ? reason : "rejected",
      message: accepted ? message : "互动没有通过现有玩法规则。",
      interaction: this.interactionView(),
    });
  }
}
