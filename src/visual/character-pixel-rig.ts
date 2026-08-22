import type { ProjectedPrototypeCharacter } from "./world-scale-prototype";

export type CharacterPixelRole = "hair" | "face" | "eye" | "scarf" | "coat" | "arm" | "hand" | "leg" | "boot";

export interface CharacterPixelRect {
  readonly role: CharacterPixelRole;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

export interface CharacterPixelRig {
  readonly animation: ProjectedPrototypeCharacter["animation"];
  readonly animationFrame: 0 | 1 | 2 | 3;
  readonly facing: ProjectedPrototypeCharacter["facing"];
  readonly visualBounds: Readonly<{ width: 14; height: 19 }>;
  readonly anchorOffset: Readonly<{ x: -1; y: -5 }>;
  readonly collisionBody: Readonly<{ width: 12; height: 14 }>;
  readonly pixels: readonly CharacterPixelRect[];
  readonly landingDustAnchors: readonly Readonly<{ x: number; y: number }>[];
}

const WIDTH = 14;
const PALETTE = Object.freeze({
  hair: "#141816",
  face: "#d9c5a0",
  eye: "#f1dfa9",
  scarf: "#91b7a4",
  coat: "#2f6970",
  coatShadow: "#244d54",
  hand: "#c9ad87",
  leg: "#26363a",
  boot: "#151c1e",
});

export function projectCharacterPixels(character: ProjectedPrototypeCharacter): CharacterPixelRig {
  if (character.worldBody.width !== 12 || character.worldBody.height !== 14) {
    throw new Error("character rig requires the unchanged 12x14 collision body");
  }
  const animationFrame = character.animation === "run"
    ? (Math.floor(character.tick / 3) % 4) as 0 | 1 | 2 | 3
    : character.animation === "idle"
      ? (Math.floor(character.tick / 30) % 2) as 0 | 1
      : 0;
  const pixels = rightFacingPixels(character.animation, animationFrame);
  const facingPixels = character.facing === "left" ? pixels.map(mirrorPixel) : pixels;
  const landingDustAnchors = character.animation === "land"
    ? [Object.freeze({ x: 1, y: 18 }), Object.freeze({ x: 12, y: 18 })]
    : [];
  return deepFreeze({
    animation: character.animation,
    animationFrame,
    facing: character.facing,
    visualBounds: { width: 14, height: 19 },
    anchorOffset: { x: -1, y: -5 },
    collisionBody: { width: 12, height: 14 },
    pixels: facingPixels,
    landingDustAnchors,
  });
}

function rightFacingPixels(
  animation: ProjectedPrototypeCharacter["animation"],
  frame: number,
): CharacterPixelRect[] {
  const squash = animation === "land" ? 2 : 0;
  const breathe = animation === "idle" && frame === 1 ? 1 : 0;
  const bodyY = 8 + squash + breathe;
  const result: CharacterPixelRect[] = [
    pixel("hair", 3, squash, 8, 3, PALETTE.hair),
    pixel("hair", 2, 2 + squash, 2, 5, PALETTE.hair),
    pixel("face", 4, 3 + squash, 6, 5, PALETTE.face),
    pixel("eye", 9, 5 + squash, 1, 1, PALETTE.eye),
    pixel("scarf", 3, 7 + squash, 8, 2, PALETTE.scarf),
    pixel("coat", 3, bodyY, 8, Math.max(3, 7 - squash), PALETTE.coat),
    pixel("coat", 3, bodyY + 5 - squash, 8, 2, PALETTE.coatShadow),
  ];

  if (animation === "run") addRunLimbs(result, frame);
  else if (animation === "rise") {
    result.push(pixel("arm", 1, 8, 2, 5, PALETTE.coatShadow));
    result.push(pixel("arm", 11, 7, 2, 5, PALETTE.coat));
    result.push(pixel("hand", 11, 6, 2, 2, PALETTE.hand));
    result.push(pixel("leg", 4, 14, 2, 3, PALETTE.leg));
    result.push(pixel("leg", 8, 13, 2, 3, PALETTE.leg));
    result.push(pixel("boot", 3, 16, 3, 2, PALETTE.boot));
    result.push(pixel("boot", 8, 15, 3, 2, PALETTE.boot));
  } else if (animation === "fall") {
    result.push(pixel("arm", 1, 9, 2, 5, PALETTE.coatShadow));
    result.push(pixel("arm", 11, 9, 2, 5, PALETTE.coat));
    result.push(pixel("hand", 12, 13, 2, 2, PALETTE.hand));
    result.push(pixel("leg", 4, 15, 2, 3, PALETTE.leg));
    result.push(pixel("leg", 8, 15, 2, 3, PALETTE.leg));
    result.push(pixel("boot", 3, 17, 3, 2, PALETTE.boot));
    result.push(pixel("boot", 8, 17, 3, 2, PALETTE.boot));
  } else if (animation === "land") {
    result.push(pixel("arm", 1, 11, 2, 3, PALETTE.coatShadow));
    result.push(pixel("arm", 11, 11, 2, 3, PALETTE.coat));
    result.push(pixel("leg", 3, 15, 3, 2, PALETTE.leg));
    result.push(pixel("leg", 8, 15, 3, 2, PALETTE.leg));
    result.push(pixel("boot", 2, 17, 4, 2, PALETTE.boot));
    result.push(pixel("boot", 8, 17, 4, 2, PALETTE.boot));
  } else {
    result.push(pixel("arm", 1, 9 + breathe, 2, 5, PALETTE.coatShadow));
    result.push(pixel("arm", 11, 9 + breathe, 2, 5, PALETTE.coat));
    result.push(pixel("hand", 12, 13 + breathe, 2, 2, PALETTE.hand));
    result.push(pixel("leg", 4, 15 + breathe, 2, 3, PALETTE.leg));
    result.push(pixel("leg", 8, 15 + breathe, 2, 3, PALETTE.leg));
    result.push(pixel("boot", 3, 17 + breathe, 3, 2, PALETTE.boot));
    result.push(pixel("boot", 8, 17 + breathe, 3, 2, PALETTE.boot));
  }
  return result;
}

function addRunLimbs(target: CharacterPixelRect[], frame: number): void {
  const poses = [
    { leftArmY: 8, rightArmY: 11, leftLegX: 3, leftLegH: 4, rightLegX: 9, rightLegH: 2 },
    { leftArmY: 9, rightArmY: 10, leftLegX: 4, leftLegH: 3, rightLegX: 8, rightLegH: 3 },
    { leftArmY: 11, rightArmY: 8, leftLegX: 4, leftLegH: 2, rightLegX: 8, rightLegH: 4 },
    { leftArmY: 10, rightArmY: 9, leftLegX: 4, leftLegH: 3, rightLegX: 8, rightLegH: 3 },
  ] as const;
  const pose = poses[frame] ?? poses[0];
  target.push(pixel("arm", 1, pose.leftArmY, 2, 5, PALETTE.coatShadow));
  target.push(pixel("arm", 11, pose.rightArmY, 2, 5, PALETTE.coat));
  target.push(pixel("hand", 12, pose.rightArmY + 4, 2, 2, PALETTE.hand));
  target.push(pixel("leg", pose.leftLegX, 14, 2, pose.leftLegH, PALETTE.leg));
  target.push(pixel("leg", pose.rightLegX, 14, 2, pose.rightLegH, PALETTE.leg));
  target.push(pixel("boot", Math.max(1, pose.leftLegX - 1), 14 + pose.leftLegH - 1, 3, 2, PALETTE.boot));
  target.push(pixel("boot", pose.rightLegX, 14 + pose.rightLegH - 1, 3, 2, PALETTE.boot));
}

function pixel(
  role: CharacterPixelRole,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): CharacterPixelRect {
  return Object.freeze({ role, x, y, width, height, color });
}

function mirrorPixel(source: CharacterPixelRect): CharacterPixelRect {
  return Object.freeze({ ...source, x: WIDTH - source.x - source.width });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
