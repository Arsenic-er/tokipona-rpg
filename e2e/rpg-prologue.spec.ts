import { expect, test, type Page } from "@playwright/test";

const PRIMARY_KEY = "tokipona.rpg.prologue.v0.3";
const COMPANION_KEY = `${PRIMARY_KEY}.cross-save-wal`;
const TELEMETRY_KEY = `${PRIMARY_KEY}.telemetry`;
const ARRIVAL = "scene.valley.arrival_shelf";
const STREAM = "scene.valley.stream_section";
const SETTLEMENT = "scene.valley.settlement";

const app = (page: Page) => page.locator("#app");

async function clearAndOpen(page: Page): Promise<void> {
  await page.goto("/rpg.html");
  await expect(app(page)).toHaveAttribute("data-scene-id", ARRIVAL);
}

async function holdKeyboardRightUntil(page: Page, sceneId: string): Promise<void> {
  await page.keyboard.down("d");
  try {
    await expect(app(page)).toHaveAttribute("data-scene-id", sceneId, { timeout: 20_000 });
  } finally {
    await page.keyboard.up("d");
  }
}

async function holdTouchRightUntil(page: Page, sceneId: string): Promise<void> {
  const right = page.locator('[data-hold="right"]');
  const box = await right.boundingBox();
  if (!box) throw new Error("right touch control has no layout box");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, radiusX: 2, radiusY: 2, force: 1 }],
  });
  try {
    await expect(app(page)).toHaveAttribute("data-scene-id", sceneId, { timeout: 20_000 });
  } finally {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  }
}

test("runs the real keyboard/touch route and restores companion-first without manual save", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clearAndOpen(page);

  await expect(page.locator('section[aria-label="游戏状态"]')).toBeVisible();
  await expect(page.locator('section[aria-label="触屏操作"]')).toBeVisible();
  await expect(page.locator('[data-ui="status"]')).toHaveAttribute("aria-live", "polite");

  await holdKeyboardRightUntil(page, STREAM);
  await page.locator('[data-tool="stone"]').click();
  await expect.poll(() => page.evaluate(([primary, companion]) => ({
    primary: localStorage.getItem(primary) !== null,
    companion: localStorage.getItem(companion) !== null,
  }), [PRIMARY_KEY, COMPANION_KEY] as const)).toEqual({ primary: true, companion: true });

  await page.reload();
  await expect(app(page)).toHaveAttribute("data-scene-id", STREAM);
  await holdTouchRightUntil(page, SETTLEMENT);
  await page.reload();
  await expect(app(page)).toHaveAttribute("data-scene-id", SETTLEMENT);
  await expect(app(page)).toHaveAttribute("data-mode", "settlement");
  const telemetry = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), TELEMETRY_KEY);
  expect(telemetry).toMatchObject({
    schema: "tokipona.browser-prologue-telemetry.v0.1",
    lastSceneId: SETTLEMENT,
  });
  expect(telemetry.events.map((event: { eventId: string; segmentId: string }) => [event.eventId, event.segmentId])).toEqual([
    ["prologue_segment_started", ARRIVAL],
    ["prologue_segment_completed", ARRIVAL],
    ["prologue_segment_started", STREAM],
    ["prologue_segment_completed", STREAM],
    ["prologue_segment_started", SETTLEMENT],
  ]);
  expect(JSON.stringify(telemetry)).not.toMatch(/rawUtterance|rawText|inventoryLotId|damageOverride|worldFlagOverride/);
  expect(errors).toEqual([]);
});

test("flushes a checked envelope on pagehide and keeps the touch controls labelled", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clearAndOpen(page);
  expect(await page.evaluate((key) => localStorage.getItem(key), PRIMARY_KEY)).toBeNull();

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
  const primary = await page.evaluate((key) => localStorage.getItem(key), PRIMARY_KEY);
  expect(primary).not.toBeNull();
  const parsed = JSON.parse(primary!);
  expect(parsed).toMatchObject({ schema: "tokipona.browser-game-session-save.v0.1" });

  await expect(page.locator('[data-hold="left"]')).toHaveAttribute("aria-label", "向左移动");
  await expect(page.locator('[data-hold="right"]')).toHaveAttribute("aria-label", "向右移动");
  await expect(page.locator("#rpg-canvas")).toHaveAttribute("tabindex", "0");
  expect(errors).toEqual([]);
});
