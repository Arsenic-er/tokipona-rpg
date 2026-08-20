import { expect, test, type Page } from "@playwright/test";

const PRIMARY_KEY = "tokipona.rpg.prologue.v0.3";
const COMPANION_KEY = `${PRIMARY_KEY}.cross-save-wal`;
const TELEMETRY_KEY = `${PRIMARY_KEY}.telemetry`;
const PLAYTEST_KEY = `${TELEMETRY_KEY}.playtest`;
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
  // The safe range is 24 tiles wide and the real keyboard runner advances at
  // roughly 20 px/s. Keep enough time for a complete continuous sweep instead
  // of relying on many short key taps whose browser overhead dominates motion.
  const deadline = Date.now() + 120_000;
  for (const direction of ["d", "a", "d"] as const) {
    const sweepDeadline = Math.min(deadline, Date.now() + 40_000);
    await page.locator("#rpg-canvas").focus();
    await page.keyboard.down(direction);
    let enteredRange = false;
    try {
      enteredRange = await page.waitForFunction(() => {
        const candidate = document.querySelector('[data-safe-range-intent="compile"]');
        return candidate instanceof HTMLButtonElement && !candidate.disabled;
      }, undefined, { polling: "raf", timeout: Math.max(1, sweepDeadline - Date.now()) })
        .then(() => true, (error: unknown) => {
          if (error instanceof Error && error.name === "TimeoutError") return false;
          throw error;
        });
    } finally {
      await page.keyboard.up(direction);
    }
    if (enteredRange) {
      // The RAF detector already proved near-target authority. Compile before
      // residual velocity can carry the player through the one-tile radius.
      if (await compile.isEnabled()) {
        await compile.click();
        if (await execute.isEnabled()) return;
      }
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
    await page.waitForFunction((candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      return candidate instanceof HTMLButtonElement && !candidate.disabled;
    }, selector, { polling: "raf", timeout: 20_000 });
  } finally {
    await page.keyboard.up("d");
  }
  await page.waitForTimeout(120);
  await expect(control).toBeEnabled();
}

async function settleAtSettlementControl(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector);
  await expect(control).toBeVisible();
  if (await control.isDisabled()) await page.waitForTimeout(1_000);
  // The return-channel entrance is at x=32 while the calibration/archive
  // facilities are near the east edge. Settlement props on the ground are
  // solid, so the real keyboard route must also hop while traversing them.
  const deadline = Date.now() + 270_000;
  for (const direction of ["d", "a", "d"] as const) {
    const sweepDeadline = Math.min(deadline, Date.now() + 90_000);
    const sceneId = await app(page).getAttribute("data-scene-id");
    expect(sceneId, `left settlement while approaching ${selector}`).toBe(SETTLEMENT);
    await page.locator("#rpg-canvas").focus();
    let detectorFinished = false;
    let enteredRange = false;
    const detector = page.waitForFunction((candidateSelector) => {
      const candidate = document.querySelector(candidateSelector);
      return candidate instanceof HTMLButtonElement && !candidate.disabled;
    }, selector, { polling: "raf", timeout: Math.max(1, sweepDeadline - Date.now()) })
      .then(() => { enteredRange = true; detectorFinished = true; }, (error: unknown) => {
        detectorFinished = true;
        if (!(error instanceof Error && error.name === "TimeoutError")) throw error;
      });
    await page.keyboard.down(direction);
    try {
      while (!detectorFinished && Date.now() < sweepDeadline) {
        // One jump clears a ground prop; the pause leaves a grounded interval
        // before the next jump so the RAF detector can observe near-target
        // authority instead of sampling only while airborne.
        await page.keyboard.press("w");
        await Promise.race([detector, page.waitForTimeout(1_800)]);
      }
    } finally {
      await page.keyboard.up(direction);
    }
    await detector;
    if (!enteredRange) {
      expect(await app(page).getAttribute("data-scene-id"),
        `left settlement while approaching ${selector}`).toBe(SETTLEMENT);
    }
    if (enteredRange) {
      // Release immediately when the RAF detector observes authority; ground
      // deceleration normally settles in range. Under a loaded browser the
      // release can arrive a few frames late, so make bounded key-only
      // corrections around the already-observed authority circle.
      await page.waitForTimeout(80);
      if (await control.isEnabled()) return;
      const opposite = direction === "d" ? "a" : "d";
      for (const correction of [opposite, direction, opposite] as const) {
        let corrected = false;
        const correctionDetector = page.waitForFunction((candidateSelector) => {
          const candidate = document.querySelector(candidateSelector);
          return candidate instanceof HTMLButtonElement && !candidate.disabled;
        }, selector, { polling: "raf", timeout: 2_500 })
          .then(() => { corrected = true; }, (error: unknown) => {
            if (!(error instanceof Error && error.name === "TimeoutError")) throw error;
          });
        await page.keyboard.down(correction);
        try { await correctionDetector; }
        finally { await page.keyboard.up(correction); }
        if (corrected) {
          await page.waitForTimeout(50);
          if (await control.isEnabled()) return;
        }
      }
    }
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

test("keeps corrupt startup data and offers an explicit recovery path", async ({ page }) => {
  const corruptCompanion = "{not-valid-json";
  await page.addInitScript(([key, raw]) => {
    if (sessionStorage.getItem("startup-corruption-injected") === null) {
      localStorage.setItem(key, raw);
      sessionStorage.setItem("startup-corruption-injected", "true");
    }
  },
    [COMPANION_KEY, corruptCompanion] as const);

  await page.goto("/rpg.html");

  await expect(app(page)).toHaveAttribute("data-mode", "startup_recovery");
  await expect(page.locator('[data-ui="startup-recovery"]')).toBeVisible();
  await expect(page.locator("#rpg-canvas")).toHaveCount(0);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COMPANION_KEY))
    .toBe(corruptCompanion);

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-recovery-action="export"]').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("tokipona-prologue-recovery.json");
  await expect(page.locator('[data-ui="startup-recovery-status"]')).toContainText("已导出");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COMPANION_KEY))
    .toBe(corruptCompanion);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator('[data-recovery-action="reset"]').click();
  await expect(page.locator('[data-ui="startup-recovery-status"]')).toContainText("已取消");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COMPANION_KEY))
    .toBe(corruptCompanion);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-recovery-action="reset"]').click();
  await expect(app(page)).toHaveAttribute("data-scene-id", ARRIVAL);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), COMPANION_KEY))
    .not.toBe(corruptCompanion);
});

test("runs the real keyboard/touch route and restores companion-first without manual save", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const browser = globalThis as typeof globalThis & { __dialogueStarts?: number;
      AudioContext?: new () => unknown };
    browser.__dialogueStarts = 0;
    class FakeParam {
      cancelScheduledValues(_time: number): void {}
      setValueAtTime(_value: number, _time: number): void {}
      linearRampToValueAtTime(_value: number, _time: number): void {}
    }
    class FakeOscillator {
      type = "square";
      readonly frequency = new FakeParam();
      onended: (() => void) | null = null;
      connect(_destination: unknown): void {}
      disconnect(): void {}
      start(_time: number): void { browser.__dialogueStarts = (browser.__dialogueStarts ?? 0) + 1; }
      stop(_time: number): void { queueMicrotask(() => this.onended?.()); }
    }
    class FakeGain {
      readonly gain = new FakeParam();
      connect(_destination: unknown): void {}
      disconnect(): void {}
    }
    browser.AudioContext = class {
      readonly currentTime = 0;
      readonly state = "running";
      readonly destination = {};
      createOscillator(): FakeOscillator { return new FakeOscillator(); }
      createGain(): FakeGain { return new FakeGain(); }
      resume(): Promise<void> { return Promise.resolve(); }
      close(): Promise<void> { return Promise.resolve(); }
    };
  });
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
  const topic = page.locator("button[data-npc][data-topic]").first();
  await expect(page.locator('[data-ui="dialogue-audio-toggle"]')).toHaveAttribute("aria-pressed", "true");
  await topic.click();
  await expect(page.locator('[data-ui="dialogue-title"]')).not.toHaveText("选择一名居民与一个主题");
  await expect.poll(() => page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0))
    .toBeGreaterThan(0);
  const firstSequenceStarts = await page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0);
  await page.locator('[data-ui="clarify"] button').first().click();
  await expect.poll(() => page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0))
    .toBeGreaterThan(firstSequenceStarts);
  await page.locator('[data-ui="dialogue-audio-toggle"]').click();
  await expect(page.locator('[data-ui="dialogue-audio-toggle"]')).toHaveAttribute("aria-pressed", "false");
  const mutedStarts = await page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0);
  await topic.click();
  expect(await page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0)).toBe(mutedStarts);
  await page.reload();
  await expect(app(page)).toHaveAttribute("data-scene-id", SETTLEMENT);
  await expect(app(page)).toHaveAttribute("data-mode", "settlement");
  await expect(page.locator('[data-ui="dialogue-audio-toggle"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator("button[data-npc][data-topic]").first().click();
  await expect(page.locator('[data-ui="dialogue-title"]')).not.toHaveText("选择一名居民与一个主题");
  expect(await page.evaluate(() =>
    (globalThis as typeof globalThis & { __dialogueStarts?: number }).__dialogueStarts ?? 0)).toBe(0);
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
  const [primarySave, playtestRaw] = await page.evaluate(([primaryKey, playtestKey]) => [
    JSON.parse(localStorage.getItem(primaryKey)!),
    localStorage.getItem(playtestKey),
  ], [PRIMARY_KEY, PLAYTEST_KEY] as const);
  expect(playtestRaw).not.toBeNull();
  const playtest = JSON.parse(playtestRaw!);
  expect(playtest).toMatchObject({
    schema: "tokipona.browser-prologue-playtest.v0.1",
    observationComplete: true,
  });
  expect(playtest.sessionId).toMatch(/^session\.sha256\.[0-9a-f]{64}$/);
  expect(playtest.sessionId).not.toBe(primarySave.session.sessionId);
  expect(playtest.processedEventSequence).toBeGreaterThan(0);
  expect(playtestRaw).not.toContain(primarySave.session.sessionId);
  expect(playtestRaw).not.toMatch(/rawUtterance|rawText|inventoryLotId|lotId|savePayload|playerIdentifier/);

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
  expect(parsed).toMatchObject({ schema: "tokipona.browser-game-session-save.v0.2" });

  await expect(page.locator('[data-hold="left"]')).toHaveAttribute("aria-label", "向左移动");
  await expect(page.locator('[data-hold="right"]')).toHaveAttribute("aria-label", "向右移动");
  await expect(page.locator("#rpg-canvas")).toHaveAttribute("tabindex", "0");
  expect(errors).toEqual([]);
});

test("completes N07, the optional production N08 trial, and the old-mine threshold", async ({ page }) => {
  // This is the full keyboard-driven N07 -> N08 -> old-mine journey, not a
  // single interaction check. Keep its budget separate from the short smoke
  // tests so slower CI hosts do not terminate a healthy route mid-movement.
  test.setTimeout(720_000);
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
  await expect(page.locator("[data-p0-learning-count]")).toHaveText("12 / 12");
  const returnCheckpoint = await page.evaluate((storageKey) => {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as { session?: { state?: { checkpoint?: unknown } } };
    return envelope.session?.state?.checkpoint ?? null;
  }, PRIMARY_KEY);
  expect(returnCheckpoint).toMatchObject({
    sceneId: SETTLEMENT,
    position: { x: 32, y: 450 },
  });

  const qualificationActions = page.locator("[data-safe-range-qualification-action]");
  await expect(qualificationActions).toHaveCount(8);
  await settleAtSettlementControl(
    page,
    '[data-safe-range-qualification-action="settlement.calibration.unrelated_delivery_commit"]',
  );
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
