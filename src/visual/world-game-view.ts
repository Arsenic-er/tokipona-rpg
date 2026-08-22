import type { WorldInteractionView } from "./world-interaction";
import type { WorldScalePrototypeSnapshot } from "./world-scale-controller";

export type WorldTouchControl = "left" | "right" | "jump" | "interact";

export interface WorldAuditDiagnostics {
  readonly viewport: string;
  readonly macroTilePx: 16;
  readonly materialCellPx: 2;
  readonly collisionBody: "12×14";
  readonly tick: number;
}

export interface WorldGameView {
  readonly sceneTitle: string;
  readonly interactionPrompt: WorldInteractionView["prompt"];
  readonly toast: string | null;
  readonly audit: Readonly<{
    open: boolean;
    selectedProfileId: WorldScalePrototypeSnapshot["profileId"];
    diagnostics: WorldAuditDiagnostics | null;
  }>;
  readonly touchControls: readonly WorldTouchControl[];
}

export interface ProjectWorldGameViewInput {
  readonly snapshot: WorldScalePrototypeSnapshot;
  readonly interaction: WorldInteractionView;
  readonly auditOpen: boolean;
  readonly toast: string | null;
}

export function projectWorldGameView(input: ProjectWorldGameViewInput): WorldGameView {
  const frame = input.snapshot.frame;
  const diagnostics: WorldAuditDiagnostics | null = input.auditOpen
    ? Object.freeze({
      viewport: `${frame.profile.viewportPx.width}×${frame.profile.viewportPx.height}`,
      macroTilePx: frame.profile.macroTilePx,
      materialCellPx: frame.profile.materialCellPx,
      collisionBody: "12×14",
      tick: frame.tick,
    })
    : null;
  return deepFreeze({
    sceneTitle: sceneLabel(frame.sceneId),
    interactionPrompt: input.interaction.visible ? input.interaction.prompt : null,
    toast: input.toast,
    audit: {
      open: input.auditOpen,
      selectedProfileId: input.snapshot.profileId,
      diagnostics,
    },
    touchControls: ["left", "right", "jump", "interact"],
  });
}

function sceneLabel(sceneId: string): string {
  if (sceneId === "scene.valley.arrival_shelf") return "N00 · 到达崖台";
  if (sceneId === "scene.valley.stream_section") return "N01 · 溪流段";
  return sceneId;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
