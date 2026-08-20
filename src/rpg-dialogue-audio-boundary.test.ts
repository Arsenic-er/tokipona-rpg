import { describe, expect, it } from "vitest";
import rpgSource from "./rpg-main.ts?raw";

describe("RPG procedural dialogue audio boundary", () => {
  it("wires one accessible preference control and the accepted dialogue path", () => {
    expect(rpgSource).toContain('data-ui="dialogue-audio-toggle"');
    expect(rpgSource).toContain("dialogueAudio.play({");
    expect(rpgSource.match(/dialogueAudio\.play\(/g)).toHaveLength(1);
    expect(rpgSource).toContain('setAttribute("aria-pressed", String(dialogueAudio.enabled))');
    expect(rpgSource).toContain("对话音：");
  });

  it("does not expose synthesis or pronunciation overrides from the UI", () => {
    expect(rpgSource).not.toMatch(/frequencyHz\s*:|gain\s*:|waveform\s*:|pronunciationAssetId/);
    expect(rpgSource).not.toMatch(/dialogueAudio\.play\([^)]*(text|topic|word|progress)/s);
  });
});
