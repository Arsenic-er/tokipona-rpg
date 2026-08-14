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
const SAFE_RANGE = "scene.valley.safe_range";
const OLD_MINE = "scene.valley.old_mine_threshold";
const P0_WORD_IDS = [
  "telo", "tawa", "lili", "suli", "seli", "kiwen",
  "awen", "kon", "kasi", "lukin", "weka", "soweli",
] as const;
const LEARNING_ACTION_LABELS = ["discover", "attune", "context 0", "context 1", "repair"] as const;

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

async function activateWhileMovingRightUntilDisabled(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && await control.isEnabled()) {
    await stepRight(page);
    await control.click({ timeout: 1_000 }).catch(() => undefined);
  }
  await expect(control).toBeDisabled();
}

async function compileWhileScanningForTarget(page: Page): Promise<void> {
  const compile = page.locator('[data-safe-range-intent="compile"]');
  const execute = page.locator('[data-safe-range-intent="execute"]');
  const deadline = Date.now() + 24_000;
  for (const direction of ["d", "a", "d"] as const) {
    const sweepDeadline = Math.min(deadline, Date.now() + 8_000);
    while (Date.now() < sweepDeadline && await execute.isDisabled()) {
      await stepHorizontal(page, direction);
      if (await compile.isDisabled()) continue;
      await compile.click();
      if (await execute.isEnabled()) return;
    }
  }
  const status = await page.locator('[data-ui="status"]').textContent().catch(() => null);
  await expect(execute, `preview unavailable; last status: ${status ?? "unavailable"}`).toBeEnabled();
}

async function stepRight(page: Page): Promise<void> {
  await stepHorizontal(page, "d");
}

async function stepHorizontal(page: Page, key: "a" | "d"): Promise<void> {
  await stepHorizontalFor(page, key, 100);
}

async function stepHorizontalFor(page: Page, key: "a" | "d", durationMs: number): Promise<void> {
  await page.locator("#rpg-canvas").focus();
  await page.keyboard.down(key);
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up(key);
  }
}

async function refillSettlementMp(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await clickEnabled(page, '[data-settlement="meditate-wrong"]');
  }
}

async function moveRightUntilEnabled(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await page.locator("#rpg-canvas").focus();
  await page.keyboard.down("d");
  try {
    await expect(control).toBeEnabled({ timeout: 20_000 });
  } finally {
    await page.keyboard.up("d");
  }
}

async function settleAtSettlementControl(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  if (await control.isDisabled()) await page.waitForTimeout(1_000);
  const deadline = Date.now() + 24_000;
  let direction: "a" | "d" = "d";
  while (Date.now() < deadline) {
    const sceneId = await app(page).getAttribute("data-scene-id");
    expect(sceneId, `left settlement while approaching ${selector}`).toBe(SETTLEMENT);
    if (await control.isEnabled()) {
      await page.waitForTimeout(200);
      if (await control.isEnabled()) return;
      direction = direction === "d" ? "a" : "d";
      continue;
    }
    await stepHorizontalFor(page, direction, 40);
  }
  const status = await page.locator('[data-ui="status"]').textContent().catch(() => null);
  await expect(control, `control never settled as enabled; last status: ${status ?? "unavailable"}`).toBeEnabled();
}

async function activateAtSettlementControl(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await settleAtSettlementControl(page, selector);
  await control.click();
  await page.waitForTimeout(200);
  const status = await page.locator('[data-ui="status"]').textContent().catch(() => null);
  await expect(control, `control did not commit; last status: ${status ?? "unavailable"}`).toBeDisabled();
  await expect(app(page)).toHaveAttribute("data-scene-id", SETTLEMENT);
}

async function completeP0RecoveryCurriculum(page: Page): Promise<void> {
  await settleAtSettlementControl(page, '[data-p0-word="telo"]');
  for (const wordId of P0_WORD_IDS) {
    const action = page.locator(`[data-p0-word="${wordId}"]`);
    for (const [index, label] of LEARNING_ACTION_LABELS.entries()) {
      await expect(action).toBeEnabled();
      await expect(action).toHaveText(label);
      await action.click();
      await expect(action).toHaveText(LEARNING_ACTION_LABELS[index + 1] ?? "完成");
    }
    await expect(action).toBeDisabled();
  }
  await expect(page.locator("[data-p0-learning-count]")).toHaveText("12 / 12");
}

async function openCore120Word(page: Page, band: string, wordId: string): Promise<void> {
  await page.locator(`[data-core120-band="${band}"]`).click();
  await page.locator("[data-core120-search]").fill(wordId);
  await expect(page.locator("[data-core120-search-status]")).toHaveText("1 个匹配词。");
}

async function prepareCore120WordAtArchive(page: Page, band: string, wordId: string): Promise<void> {
  await openCore120Word(page, band, wordId);
  const action = page.locator(`[data-core120-word="${wordId}"]`);
  for (const [index, label] of LEARNING_ACTION_LABELS.slice(0, 2).entries()) {
    await expect(action).toBeEnabled();
    await expect(action).toHaveText(label);
    await action.click();
    await expect(action).toHaveText(index === 0 ? "attune" : "待现场见证");
  }
  await expect(action).toHaveText("待现场见证");
  await expect(action).toBeDisabled();
}

test("runs the real keyboard/touch route and restores companion-first without manual save", async ({ page }) => {
  test.setTimeout(90_000);
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

  await completeP0RecoveryCurriculum(page);
  await prepareCore120WordAtArchive(page, "P1", "ala");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("2 / 600");
  await page.reload();
  await expectModeAndScene(page, "settlement", SETTLEMENT);
  await expect(page.locator("[data-p0-learning-count]")).toHaveText("12 / 12");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("2 / 600");
  await page.locator('[data-core120-band="P1"]').click();
  await page.locator("[data-core120-search]").fill("ala");
  await expect(page.locator("[data-core120-search-status]")).toHaveText("1 个匹配词。");
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("待现场见证");
  await expect(page.locator('[data-core120-word="ala"]')).toBeDisabled();
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

test("completes N07, the optional production N08 trial, and the old-mine threshold", async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clearAndOpen(page);

  await holdKeyboardRightUntil(page, STREAM);
  await page.locator('[data-tool="stone"]').click();
  await holdKeyboardRightUntil(page, SETTLEMENT);
  await expectModeAndScene(page, "settlement", SETTLEMENT);
  await completeP0RecoveryCurriculum(page);
  await prepareCore120WordAtArchive(page, "P1", "ala");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("2 / 600");

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
    if (action === 0) {
      await clickEnabled(page, '[data-return-intent="discover_wawa"]');
      await clickEnabled(page, '[data-return-intent="attune_wawa"]');
    }
  }
  await expect(firstRoute.locator('[data-return-intent="complete_solution"]')).toBeEnabled();
  await firstRoute.locator('[data-return-intent="complete_solution"]').click();
  await expect(page.locator('[data-return-flag="supply"]')).toHaveText("是");
  await expect(page.locator('[data-return-flag="meadow"]')).toHaveText("是");
  await clickEnabled(page, '[data-return-intent="ground_h0"]');
  await clickEnabled(page, '[data-return-intent="ground_h1"]');
  await openCore120Word(page, "P1", "ala");
  await moveRightUntilEnabled(page, '[data-core120-word="ala"]');
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("context 1");
  await page.locator('[data-core120-word="ala"]').click();
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("待现场见证");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("3 / 600");
  await page.reload();
  await expectModeAndScene(page, "return_flow", RETURN_CHANNEL);
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("3 / 600");
  await clickEnabled(page, '[data-return-intent="return_settlement"]');
  await expectModeAndScene(page, "settlement", SETTLEMENT);

  const qualificationActions = page.locator("[data-safe-range-qualification-action]");
  await expect(qualificationActions).toHaveCount(8);
  const teloH0 = '[data-safe-range-qualification-action="settlement.telo.h0"]';
  await activateAtSettlementControl(page, teloH0);
  for (const actionId of [
    "settlement.telo.h1",
    "settlement.tawa.h0",
    "settlement.tawa.h1",
    "settlement.repair.motion_h0",
    "settlement.calibration.unrelated_delivery_commit",
    "settlement.calibration.unrelated_route_commit",
    "settlement.delayed_retrieval_h0",
  ]) {
    await activateAtSettlementControl(
      page,
      `[data-safe-range-qualification-action="${actionId}"]`,
    );
  }
  await clickEnabled(page, '[data-safe-range-intent="calibrate_attack_capacity"]');
  await clickEnabled(page, '[data-safe-range-intent="grant_range_trial_permission"]');
  await refillSettlementMp(page);
  await clickEnabled(page, '[data-safe-range-intent="enter_safe_range"]');
  await expectModeAndScene(page, "safe_range", SAFE_RANGE);

  const targetClasses = ["wood_dummy", "sandbag", "minecart", "hanging_stone"] as const;
  for (const [index, targetClass] of targetClasses.entries()) {
    if (index > 0 && index % 2 === 0) {
      await clickEnabled(page, '[data-safe-range-intent="return_settlement"]');
      await expectModeAndScene(page, "settlement", SETTLEMENT);
      await refillSettlementMp(page);
      await clickEnabled(page, '[data-safe-range-intent="enter_safe_range"]');
      await expectModeAndScene(page, "safe_range", SAFE_RANGE);
    }
    const target = page.locator(`[data-safe-range-target="${targetClass}"]`);
    await expect(target).toBeEnabled();
    await target.click();
    await expect(target).toHaveAttribute("aria-checked", "true");
    await compileWhileScanningForTarget(page);
    await clickEnabled(page, '[data-safe-range-intent="execute"]');
    await expect(target).toBeDisabled();
  }
  await activateWhileMovingRightUntilDisabled(page, '[data-safe-range-intent="inspect_material_table"]');
  await expect(page.locator("[data-safe-range-completed]")).toHaveText("是");
  await openCore120Word(page, "P1", "ala");
  await expect(page.locator('[data-core120-word="ala"]')).toBeEnabled();
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("context 0");
  await page.locator('[data-core120-word="ala"]').click();
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("待现场见证");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("4 / 600");
  await page.reload();
  await expectModeAndScene(page, "safe_range", SAFE_RANGE);
  await expect(page.locator("[data-safe-range-completed]")).toHaveText("是");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("4 / 600");
  await clickEnabled(page, '[data-safe-range-intent="return_settlement"]');
  await expectModeAndScene(page, "settlement", SETTLEMENT);
  await openCore120Word(page, "P1", "ala");
  await settleAtSettlementControl(page, '[data-core120-word="ala"]');
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("repair");
  await activateAtSettlementControl(page, '[data-core120-word="ala"]');
  await expect(page.locator('[data-core120-word="ala"]')).toHaveText("完成");
  await expect(page.locator("[data-core120-learning-count]")).toHaveText("5 / 600");

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
