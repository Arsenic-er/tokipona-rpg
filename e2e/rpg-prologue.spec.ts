import { expect, test, type Page } from "@playwright/test";

const PRIMARY_KEY = "tokipona.rpg.prologue.v0.3";
const COMPANION_KEY = `${PRIMARY_KEY}.cross-save-wal`;
const TELEMETRY_KEY = `${PRIMARY_KEY}.telemetry`;
const ARRIVAL = "scene.valley.arrival_shelf";
const STREAM = "scene.valley.stream_section";
const SETTLEMENT = "scene.valley.settlement";
const WATERWHEEL = "scene.valley.waterwheel";
const SERVICE_CHANNEL = "scene.valley.service_channel";
const CISTERN = "scene.valley.high_cistern";
const RETURN_CHANNEL = "scene.valley.return_channel";
const OLD_MINE = "scene.valley.old_mine_threshold";

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

async function expectModeAndScene(page: Page, mode: string, sceneId: string): Promise<void> {
  await expect(app(page)).toHaveAttribute("data-mode", mode);
  await expect(app(page)).toHaveAttribute("data-scene-id", sceneId);
}

async function clickEnabled(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.click();
}

test("runs the real keyboard/touch route and restores companion-first without manual save", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clearAndOpen(page);

  await expect(page.locator("#rpg-canvas")).toHaveAttribute("width", "180");
  await expect(page.locator("#rpg-canvas")).toHaveAttribute("height", "320");

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
  await expect(page.locator("[data-core120-learning-panel]")).toBeVisible();
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("0 / 600");
  await expect(page.locator("[data-core120-assets]")).toBeVisible();
  await expect(page.locator("button[data-core120-word]").first()).toBeDisabled();
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

test("completes the production non-attack chapter through N07 and the old-mine threshold", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clearAndOpen(page);

  await holdKeyboardRightUntil(page, STREAM);
  await page.locator('[data-tool="stone"]').click();
  await holdKeyboardRightUntil(page, SETTLEMENT);
  await expectModeAndScene(page, "settlement", SETTLEMENT);

  await clickEnabled(page, '[data-infra-command="enter_waterwheel"]');
  await expectModeAndScene(page, "infrastructure", WATERWHEEL);
  for (let observation = 0; observation < 5; observation += 1) {
    await clickEnabled(page, '[data-infra-command="observe_wheel"]');
  }
  await expect(page.locator("[data-infra-ticks]")).toHaveText("600 / 600");
  await clickEnabled(page, '[data-wheel-solution="waterwheel.repair_axle"]');
  await clickEnabled(page, '[data-infra-command="enter_service"]');
  await expectModeAndScene(page, "infrastructure", SERVICE_CHANNEL);
  await clickEnabled(page, '[data-service-solution="service.open_bypass_valve"]');
  await expect(page.locator("[data-cistern-ready]")).toHaveText("ready");

  await clickEnabled(page, '[data-cistern-command="enter_cistern"]');
  await expectModeAndScene(page, "cistern", CISTERN);
  const toolFamilies = page.locator("[data-tool-family]");
  await expect(toolFamilies).toHaveCount(2);
  await expect(toolFamilies.nth(0)).toBeEnabled();
  await toolFamilies.nth(0).click();
  await expect(toolFamilies.nth(1)).toBeEnabled();
  await toolFamilies.nth(1).click();
  await expect(page.locator("[data-cistern-completed]")).toHaveText("已重连");
  await page.reload();
  await expectModeAndScene(page, "cistern", CISTERN);

  await clickEnabled(page, '[data-cistern-command="enter_return_flow"]');
  await expectModeAndScene(page, "return_flow", RETURN_CHANNEL);
  const firstRoute = page.locator(".return-flow-route").first();
  const routeActions = firstRoute.locator('[data-return-intent="perform_action"]');
  const actionCount = await routeActions.count();
  expect(actionCount).toBeGreaterThan(0);
  for (let action = 0; action < actionCount; action += 1) {
    await expect(routeActions.nth(action)).toBeEnabled();
    await routeActions.nth(action).click();
  }
  await expect(firstRoute.locator('[data-return-intent="complete_solution"]')).toBeEnabled();
  await firstRoute.locator('[data-return-intent="complete_solution"]').click();
  await expect(page.locator('[data-return-flag="supply"]')).toHaveText("是");
  await expect(page.locator('[data-return-flag="meadow"]')).toHaveText("是");
  await page.reload();
  await expectModeAndScene(page, "return_flow", RETURN_CHANNEL);
  await clickEnabled(page, '[data-return-intent="return_settlement"]');
  await expectModeAndScene(page, "settlement", SETTLEMENT);

  await clickEnabled(page, "[data-old-mine-enter]");
  await expectModeAndScene(page, "old_mine", OLD_MINE);
  await expect(page.locator("[data-old-mine-kills]")).toHaveText("0");
  await page.reload();
  await expectModeAndScene(page, "old_mine", OLD_MINE);
  await expect(page.locator("[data-old-mine-complete]")).toHaveText("是");
  await clickEnabled(page, "[data-old-mine-return]");
  await expectModeAndScene(page, "settlement", SETTLEMENT);

  await expect.poll(() => page.evaluate(([primary, companion]) => ({
    primary: localStorage.getItem(primary) !== null,
    companion: localStorage.getItem(companion) !== null,
  }), [PRIMARY_KEY, COMPANION_KEY] as const)).toEqual({ primary: true, companion: true });
  expect(errors).toEqual([]);
});
