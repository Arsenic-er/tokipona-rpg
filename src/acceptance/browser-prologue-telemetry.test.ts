import { describe, expect, it } from "vitest";
import {
  BROWSER_PROLOGUE_TELEMETRY_SCHEMA,
  BrowserPrologueTelemetry,
  readBrowserPrologueTelemetrySave,
  type BrowserTelemetryStorage,
} from "./browser-prologue-telemetry";

class MemoryStorage implements BrowserTelemetryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("browser prologue telemetry", () => {
  it("persists exclusive activity totals and contiguous scene events across reload", () => {
    const storage = new MemoryStorage();
    const first = BrowserPrologueTelemetry.bootstrap({ storage, key: "telemetry", sessionId: "session.browser.telemetry", sceneId: "scene.valley.arrival_shelf", worldTick: 0, active: "world_people_physics", atMs: 0 });
    first.observe({ sceneId: "scene.valley.arrival_shelf", worldTick: 60, active: "language", atMs: 1_000 });
    first.observe({ sceneId: "scene.valley.stream_section", worldTick: 120, active: "language", atMs: 2_000 });
    first.suspend(3_000);

    const saved = readBrowserPrologueTelemetrySave(JSON.parse(storage.getItem("telemetry")!));
    expect(saved).toMatchObject({ schema: BROWSER_PROLOGUE_TELEMETRY_SCHEMA, lastSceneId: "scene.valley.stream_section" });
    expect(saved.totalsMs).toMatchObject({ world_people_physics: 1_000, language: 2_000, idle: 0 });
    expect(saved.events.map((event) => [event.sequence, event.eventId, event.segmentId])).toEqual([
      [1, "prologue_segment_started", "scene.valley.arrival_shelf"],
      [2, "prologue_segment_completed", "scene.valley.arrival_shelf"],
      [3, "prologue_segment_started", "scene.valley.stream_section"],
    ]);

    const loaded = BrowserPrologueTelemetry.bootstrap({ storage, key: "telemetry", sessionId: "session.browser.telemetry", sceneId: "scene.valley.stream_section", worldTick: 121, active: "world_people_physics", atMs: 0 });
    loaded.observe({ sceneId: "scene.valley.settlement", worldTick: 300, active: "world_people_physics", atMs: 500 });
    expect(loaded.snapshot(500).events.at(-1)).toMatchObject({ sequence: 5, eventId: "prologue_segment_started", segmentId: "scene.valley.settlement" });
  });

  it("rejects corrupt, cross-session, unknown-field and raw-text saves", () => {
    const storage = new MemoryStorage();
    BrowserPrologueTelemetry.bootstrap({ storage, key: "telemetry", sessionId: "session.browser.strict", sceneId: "scene.valley.arrival_shelf", worldTick: 0, active: "world_people_physics", atMs: 0 });
    const original = JSON.parse(storage.getItem("telemetry")!);
    expect(() => readBrowserPrologueTelemetrySave({ ...original, rawText: "answer" })).toThrow(/shape/);
    expect(() => readBrowserPrologueTelemetrySave({ ...original, checksum: "sha256:" + "0".repeat(64) })).toThrow(/checksum/);
    const replacement = BrowserPrologueTelemetry.bootstrap({ storage, key: "telemetry", sessionId: "session.other", sceneId: "scene.valley.arrival_shelf", worldTick: 0, active: "world_people_physics", atMs: 0 });
    expect(replacement.snapshot(0).events).toHaveLength(1);
    expect(readBrowserPrologueTelemetrySave(JSON.parse(storage.getItem("telemetry")!)).sessionId).toBe("session.other");
    expect(storage.getItem("telemetry")).not.toContain("rawUtterance");
  });
});
