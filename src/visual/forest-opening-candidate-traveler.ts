import { projectCharacterPixels, type CharacterPixelRig } from "./character-pixel-rig";
import type { ForestOpeningAnimationId, ForestOpeningPublicView } from "./forest-opening-view";
import type { PrototypeCharacterAnimation } from "./world-scale-prototype";

export function projectForestOpeningTravelerPixelRig(view: ForestOpeningPublicView): CharacterPixelRig {
  const animation = rigAnimation(view.traveler.animationId);
  return projectCharacterPixels({
    animation,
    facing: view.traveler.facing < 0 ? "left" : "right",
    grounded: animation !== "rise" && animation !== "fall",
    gaitFrame: (Math.floor(view.tick / 6) % 2) as 0 | 1,
    tick: view.tick,
    worldPosition: view.traveler.position,
    screenPosition: Object.freeze({
      x: view.traveler.position.x - view.camera.x,
      y: view.traveler.position.y - view.camera.y,
    }),
    worldBody: Object.freeze({ width: 12, height: 14 }),
  });
}

export function drawForestOpeningCandidateTraveler(
  context: CanvasRenderingContext2D,
  view: ForestOpeningPublicView,
): void {
  const rig = projectForestOpeningTravelerPixelRig(view);
  const x = Math.round(view.traveler.position.x - view.camera.x + rig.anchorOffset.x);
  const y = Math.round(view.traveler.position.y - view.camera.y + rig.anchorOffset.y);
  for (const pixel of rig.pixels) {
    context.fillStyle = pixel.color;
    context.fillRect(x + pixel.x, y + pixel.y, pixel.width, pixel.height);
  }
}

function rigAnimation(animation: ForestOpeningAnimationId): PrototypeCharacterAnimation {
  if (animation === "walk" || animation === "run") return "run";
  if (animation === "jump") return "rise";
  if (animation === "fall") return "fall";
  return "idle";
}
