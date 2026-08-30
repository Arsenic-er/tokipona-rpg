import { expect, test, type Page } from "@playwright/test";
import { runtimeForestOpeningAssetExport } from "../src/assets/runtime-forest-opening-assets";

const SAVE_KEY = "tokipona.forest-opening.vertical-slice.v0.1";
const MUTE_KEY = "tokipona.forest-opening.audio-muted.v0.1";
const OPENING_OBJECTIVE = "沿森林道路前进，并想办法穿过受损溪路";
const SETTLEMENT_OBJECTIVE = "已抵达林间聚落边缘";

for (const profile of [
  { name: "desktop keyboard", viewport: { width: 1_440, height: 900 }, hasTouch: false },
  { name: "landscape touch", viewport: { width: 844, height: 390 }, hasTouch: true },
] as const) {
  test.describe(profile.name, () => {
    test.use({ viewport: profile.viewport, hasTouch: profile.hasTouch });
    test("opens the formal full-screen slice with a visible traveler and narrow evidence", async ({ page }, testInfo) => {
      const errors: string[] = [];
      const failedAudioRequests: string[] = [];
      const finishedAssetRequests: string[] = [];
      collectBrowserErrors(page, errors);
      page.on("requestfailed", (request) => {
        if (/\.(?:ogg|wav|mp3)(?:\?|$)/i.test(request.url())) failedAudioRequests.push(request.url());
      });
      page.on("requestfinished", (request) => finishedAssetRequests.push(request.url()));
      await page.goto("/chapter-one.html");
      const root = page.locator(".forest-opening");
      const canvas = page.locator('canvas[data-surface="game"]');
      await expect(root).toBeVisible();
      await expect(canvas).toBeVisible();
      await expect(page.locator('[data-hud="objective"]')).toHaveText(OPENING_OBJECTIVE);
      await expect(page.locator(".world-review__audit, [data-profile], [data-seed], [data-digest]")).toHaveCount(0);
      const candidateLabel = page.getByText("候选视觉 · 尚未通过素材审批");
      const failedLabel = page.getByText("获批素材加载失败 · 已安全回退");
      let candidateVisible = true;
      if (runtimeForestOpeningAssetExport.status === "approved") {
        await expect.poll(async () => {
          if (await failedLabel.isVisible()) return "failed";
          if (await candidateLabel.isHidden()) return "ready";
          return "pending";
        }, { timeout: 15_000 }).toBe("ready");
        candidateVisible = false;
        for (const file of runtimeForestOpeningAssetExport.files.filter(({ role }) =>
          ["far_parallax_atlas", "mid_parallax_atlas", "environment_atlas", "prop_glyph_atlas", "traveler_atlas", "creature_atlas", "animation_manifest", "time_palette"].includes(role))) {
          expect(finishedAssetRequests.some((url) => url.endsWith(file.publicPath))).toBe(true);
        }
      } else {
        await expect(candidateLabel).toBeVisible();
        await expect(failedLabel).toHaveCount(0);
      }
      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(profile.viewport.width);
      expect(box!.height).toBeGreaterThanOrEqual(profile.viewport.height);
      await assertTravelerVisible(page, candidateVisible);
      await expect(root).not.toHaveAttribute("data-mode");
      await expect(root).not.toHaveAttribute("data-traveler-screen-x");
      expect((await page.locator("body").textContent()) ?? "").not.toMatch(/forest-opening-assets-private|candidate-export|review\/forest-opening/i);
      expect(failedAudioRequests).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${profile.hasTouch ? "mobile" : "desktop"}-dawn-npc.png`) });
    });
  });
}

test.describe("desktop 1440x900 complete routes", () => {
  test.use({ viewport: { width: 1_440, height: 900 }, hasTouch: false });
  for (const route of [
    { solutionId: "stone_steps", prompt: "E · 推动松石", interactions: 2 },
    { solutionId: "deadwood_bridge", prompt: "E · 拖动枯木", interactions: 1 },
    { solutionId: "shallow_detour", prompt: "E · 涉水绕行", interactions: 1 },
  ] as const) {
    test(`completes ${route.solutionId} from a clean browser save without teaching telo`, async ({ page, context }, testInfo) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      const rabbitModes = new Set<string>();
      collectBrowserErrors(page, errors);
      await page.clock.install();
      await page.goto("/chapter-one.html");
      const initialSave = await readOpeningSave(page);
      const canvas = page.locator('canvas[data-surface="game"]');
      await canvas.focus();
      await moveUntilPrompt(page, route.prompt, rabbitModes);
      await assertTravelerVisible(page);
      await page.screenshot({ path: testInfo.outputPath(`${route.solutionId}-obstacle.png`) });
      for (let index = 0; index < route.interactions; index += 1) {
        if (index > 0) await moveUntilPrompt(page, route.prompt, rabbitModes);
        await canvas.focus();
        await page.keyboard.press("e");
        await page.clock.fastForward(17);
        await recordRabbitMode(page, rabbitModes);
      }
      await expect(page.locator('[data-hud="objective"]')).toHaveText("继续向东，抵达林间聚落");
      if (route.solutionId === "deadwood_bridge") {
        const beforeReset = await readOpeningSave(page);
        await page.getByRole("button", { name: "暂停" }).click();
        await page.getByRole("button", { name: "返回检查点" }).click();
        const afterReset = await readOpeningSave(page);
        expect(afterReset.spatial.obstacle.committedSolutionId).toBe("deadwood_bridge");
        expect(afterReset.spatial.spatial.player.x).toBe(afterReset.spatial.spatial.checkpoint.position.x);
        expect(afterReset.spatial.spatial.player.y).toBe(afterReset.spatial.spatial.checkpoint.position.y);
        expect(afterReset.session.eventLedger).toEqual(beforeReset.session.eventLedger);
      }
      await moveUntilPrompt(page, "F · 观察未知刻痕", rabbitModes);
      await page.keyboard.press("f");
      await page.clock.fastForward(17);
      await moveUntilSettlement(page, rabbitModes);
      await expect(page.locator('[data-hud="objective"]')).toHaveText(SETTLEMENT_OBJECTIVE);
      const beforeReload = await readOpeningSave(page);
      expect(beforeReload.spatial.obstacle.committedSolutionId).toBe(route.solutionId);
      expect(beforeReload.session.state.mp).toMatchObject({ currentMp: 12, maxMp: 24 });
      expect(beforeReload.session.state.capabilities).toEqual(initialSave.session.state.capabilities);
      expect(beforeReload.session.state.learning).toEqual(initialSave.session.state.learning);
      expect(beforeReload.session.state.receiptIndex["forest-opening:glyph:word.telo"]).toBeDefined();
      expect(beforeReload.session.eventLedger.filter(({ payload }) =>
        isRecord(payload) && payload.receiptId === "forest-opening:glyph:word.telo")).toHaveLength(1);
      expect(beforeReload.session.eventLedger.some((event) => event.type.includes("death") || event.type.includes("kill")))
        .toBe(false);
      expect(beforeReload.acceptance.killCount).toBe(0);
      expect(beforeReload.spatial.ecology.rabbit.mode).toBe("sheltered");
      expect(beforeReload.spatial.ecology.wetlandBird.mode).toBe("departed");
      expect(rabbitModes.has("fleeing")).toBe(true);
      await assertTravelerVisible(page);
      await page.screenshot({ path: testInfo.outputPath(`${route.solutionId}-settlement.png`) });
      await page.close();
      const resumedPage = await context.newPage();
      collectBrowserErrors(resumedPage, errors);
      await resumedPage.goto("/chapter-one.html");
      await expect(resumedPage.locator('[data-hud="objective"]')).toHaveText(SETTLEMENT_OBJECTIVE);
      expect(await readOpeningSave(resumedPage)).toEqual(beforeReload);
      expect(errors).toEqual([]);
    });
  }

  test("keeps a partial stone solution valid across a reload and uses a fresh operation identity", async ({ page, context }) => {
    await page.clock.install();
    await page.goto("/chapter-one.html");
    await moveUntilPrompt(page, "E · 推动松石");
    await page.keyboard.press("e");
    await page.clock.fastForward(17);
    expect((await readOpeningSave(page)).spatial.obstacle.committedSolutionId).toBeNull();
    await page.close();
    const resumed = await context.newPage();
    await resumed.clock.install();
    await resumed.goto("/chapter-one.html");
    await moveUntilPrompt(resumed, "E · 推动松石");
    await resumed.keyboard.press("e");
    await resumed.clock.fastForward(17);
    await expect(resumed.locator('[data-hud="objective"]')).toHaveText("继续向东，抵达林间聚落");
    expect((await readOpeningSave(resumed)).spatial.obstacle.committedSolutionId).toBe("stone_steps");
  });

  test("keeps mute preferences and Escape pause state synchronized", async ({ page }) => {
    await page.goto("/chapter-one.html");
    await page.getByRole("button", { name: "声音：开" }).click();
    await expect(page.getByRole("button", { name: "声音：关" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate((key) => localStorage.getItem(key), MUTE_KEY)).toBe("true");
    await page.reload();
    await expect(page.getByRole("button", { name: "声音：关" })).toHaveAttribute("aria-pressed", "true");
    await page.locator('canvas[data-surface="game"]').focus();
    await page.keyboard.press("Escape");
    const dialog = page.locator("dialog.forest-opening__pause");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "继续" }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "暂停" })).toHaveAttribute("aria-pressed", "false");
  });

  test("reloads an uncommitted checkpoint reset on the same material timeline", async ({ page, context }) => {
    await page.clock.install();
    await page.goto("/chapter-one.html");
    const canvas = page.locator('canvas[data-surface="game"]');
    await canvas.focus();
    await page.keyboard.down("d");
    await page.clock.fastForward(500);
    await page.keyboard.up("d");
    await page.getByRole("button", { name: "暂停" }).click();
    await page.getByRole("button", { name: "返回检查点" }).click();
    const reset = await readOpeningSave(page);
    expect(reset.spatial.obstacle.materialTick).toBe(reset.spatial.spatial.tick);
    expect(reset.spatial.spatial.player.x).toBe(reset.spatial.spatial.checkpoint.position.x);
    expect(reset.spatial.spatial.player.y).toBe(reset.spatial.spatial.checkpoint.position.y);
    await page.getByRole("button", { name: "暂停" }).click();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    const closing = await readOpeningSave(page);
    expect(closing.spatial.obstacle.materialTick).toBe(closing.spatial.spatial.tick);
    await page.close();

    const resumed = await context.newPage();
    await resumed.addInitScript(() => {
      window.requestAnimationFrame = () => 1;
    });
    await resumed.goto("/chapter-one.html");
    await expect(resumed.locator('[data-hud="objective"]')).toHaveText(OPENING_OBJECTIVE);
    expect(await readOpeningSave(resumed)).toEqual(closing);
  });
});

test.describe("mobile complete route", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test("uses touch controls through the shallow route and restores the committed save", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.clock.install();
    await page.goto("/chapter-one.html");
    const initialSave = await readOpeningSave(page);
    await moveUntilPromptByTouch(page, "E · 涉水绕行");
    await assertTravelerVisible(page);
    await page.screenshot({ path: testInfo.outputPath("mobile-shallow-obstacle.png") });
    await page.getByRole("button", { name: "互动" }).tap();
    await page.clock.fastForward(17);
    await expect(page.locator('[data-hud="objective"]')).toHaveText("继续向东，抵达林间聚落");
    await moveUntilPromptByTouch(page, "F · 观察未知刻痕", true);
    await page.getByRole("button", { name: "观察" }).tap();
    await page.clock.fastForward(17);
    await moveUntilSettlementByTouch(page);
    await assertTravelerVisible(page);
    await page.screenshot({ path: testInfo.outputPath("mobile-shallow-settlement.png") });
    const save = await readOpeningSave(page);
    expect(save.spatial.obstacle.committedSolutionId).toBe("shallow_detour");
    expect(save.session.state.learning).toEqual(initialSave.session.state.learning);
    expect(save.session.eventLedger.some((event) => event.type.includes("death") || event.type.includes("kill")))
      .toBe(false);
    expect(save.acceptance.killCount).toBe(0);
    await page.reload();
    await expect(page.locator('[data-hud="objective"]')).toHaveText(SETTLEMENT_OBJECTIVE);
  });
});

test("keeps corrupt save bytes intact until the player explicitly resets them", async ({ page, context }) => {
  const corruptBytes = "{not-json";
  await page.addInitScript(({ key, bytes }) => {
    if (localStorage.getItem("forest-opening-corrupt-fixture") === null) {
      localStorage.setItem(key, bytes);
      localStorage.setItem("forest-opening-corrupt-fixture", "injected");
    }
  }, { key: SAVE_KEY, bytes: corruptBytes });
  await page.goto("/chapter-one.html");
  const recovery = page.locator('[data-recovery="status"]');
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText("存档不是有效 JSON；原字节仍保留。");
  expect(await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(corruptBytes);
  await page.close();
  const resumedPage = await context.newPage();
  await resumedPage.goto("/chapter-one.html");
  await expect(resumedPage.locator('[data-recovery="status"]')).toBeVisible();
  expect(await resumedPage.evaluate((key) => localStorage.getItem(key), SAVE_KEY)).toBe(corruptBytes);
  await resumedPage.getByRole("button", { name: "明确重置" }).click();
  await expect(resumedPage.locator('[data-hud="objective"]')).toHaveText(OPENING_OBJECTIVE);
  const replacement = await resumedPage.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
  expect(replacement).not.toBe(corruptBytes);
  expect(JSON.parse(replacement ?? "null").schema).toBe("tokipona.browser-forest-opening.v0.1");
});

async function moveUntilPrompt(page: Page, wanted: string, rabbitModes?: Set<string>): Promise<void> {
  const prompt = page.locator('[data-hud="prompt"]');
  await page.keyboard.down("d");
  try {
    for (let sample = 0; sample < 180; sample += 1) {
      await page.clock.fastForward(250);
      if (sample % 8 === 0) await assertTravelerVisible(page);
      if (sample % 4 === 0) await recordRabbitMode(page, rabbitModes);
      if ((await prompt.textContent())?.trim() === wanted) return;
      if (sample > 0 && sample % 24 === 0) await page.keyboard.press("w");
    }
  } finally { await page.keyboard.up("d"); }
  throw new Error(`forest opening prompt was not reached: ${wanted}`);
}

async function moveUntilSettlement(page: Page, rabbitModes?: Set<string>): Promise<void> {
  await page.keyboard.down("d");
  try {
    for (let sample = 0; sample < 120; sample += 1) {
      await page.clock.fastForward(250);
      if (sample % 8 === 0) await assertTravelerVisible(page);
      if (sample % 4 === 0) await recordRabbitMode(page, rabbitModes);
      if ((await page.locator('[data-hud="objective"]').textContent())?.trim() === SETTLEMENT_OBJECTIVE) return;
      if (sample > 0 && sample % 24 === 0) await page.keyboard.press("w");
    }
  } finally { await page.keyboard.up("d"); }
  throw new Error("forest opening settlement was not reached");
}

async function moveUntilPromptByTouch(page: Page, wanted: string, jumpAcrossTerrain = false): Promise<void> {
  const prompt = page.locator('[data-hud="prompt"]');
  const right = page.getByRole("button", { name: "向右" });
  let hold = await beginTouchHold(page, right);
  try {
    for (let sample = 0; sample < 180; sample += 1) {
      await page.clock.fastForward(250);
      if (sample % 8 === 0) await assertTravelerVisible(page);
      if ((await prompt.textContent())?.trim() === wanted) return;
      if (jumpAcrossTerrain && sample > 0 && sample % 24 === 0) {
        await hold.release();
        await page.getByRole("button", { name: "跳跃" }).tap();
        await page.clock.fastForward(17);
        hold = await beginTouchHold(page, right);
      }
    }
  } finally { await hold.release(); }
  throw new Error(`forest opening touch prompt was not reached: ${wanted}`);
}

async function moveUntilSettlementByTouch(page: Page): Promise<void> {
  const right = page.getByRole("button", { name: "向右" });
  let hold = await beginTouchHold(page, right);
  try {
    for (let sample = 0; sample < 120; sample += 1) {
      await page.clock.fastForward(250);
      if (sample % 8 === 0) await assertTravelerVisible(page);
      if ((await page.locator('[data-hud="objective"]').textContent())?.trim() === SETTLEMENT_OBJECTIVE) return;
      if (sample > 0 && sample % 24 === 0) {
        await hold.release();
        await page.getByRole("button", { name: "跳跃" }).tap();
        await page.clock.fastForward(17);
        hold = await beginTouchHold(page, right);
      }
    }
  } finally { await hold.release(); }
  throw new Error("forest opening touch settlement was not reached");
}

async function beginTouchHold(page: Page, control: ReturnType<Page["locator"]>): Promise<Readonly<{ release: () => Promise<void> }>> {
  const box = await control.boundingBox();
  if (!box) throw new Error("forest opening touch control has no layout box");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, radiusX: 2, radiusY: 2, force: 1 }],
  });
  return Object.freeze({ release: async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } });
}

interface BrowserOpeningSave {
  readonly acceptance: { readonly killCount: 0 };
  readonly spatial: {
    readonly obstacle: { readonly committedSolutionId: string | null; readonly materialTick: number };
    readonly ecology: { readonly rabbit: { readonly mode: string }; readonly wetlandBird: { readonly mode: string } };
    readonly spatial: {
      readonly tick: number;
      readonly player: {
        readonly x: number; readonly y: number; readonly velocityX: number; readonly velocityY: number;
        readonly grounded: boolean;
      };
      readonly camera: { readonly x: number; readonly y: number };
      readonly checkpoint: { readonly position: { readonly x: number; readonly y: number } };
    };
    readonly worldMinute: number;
  };
  readonly session: {
    readonly state: {
      readonly mp: { readonly currentMp: number; readonly maxMp: number };
      readonly capabilities: unknown;
      readonly learning: { readonly words: Record<string, unknown> };
      readonly receiptIndex: Record<string, unknown>;
    };
    readonly eventLedger: readonly Readonly<{ readonly type: string; readonly payload: unknown }>[];
  };
}

function collectBrowserErrors(page: Page, errors: string[]): void {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
}

async function assertTravelerVisible(page: Page, requireCandidateTraveler = false): Promise<void> {
  requireCandidateTraveler ||= await page.getByText("候选视觉 · 尚未通过素材审批").isVisible();
  if (!requireCandidateTraveler) {
    await assertApprovedTravelerVisible(page);
    return;
  }
  const bounds = await page.locator('canvas[data-surface="game"]').evaluate((canvas) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("forest opening canvas context is missing");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] !== 14 || pixels[index + 1] !== 91 || pixels[index + 2] !== 91 || pixels[index + 3] !== 255) continue;
      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    if (maxX < 0) throw new Error("forest opening candidate traveler pixels are missing");
    const box = canvas.getBoundingClientRect();
    return {
      left: box.left + minX * box.width / canvas.width,
      top: box.top + minY * box.height / canvas.height,
      right: box.left + (maxX + 1) * box.width / canvas.width,
      bottom: box.top + (maxY + 1) * box.height / canvas.height,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    };
  });
  expect(bounds.left).toBeLessThan(bounds.viewportWidth);
  expect(bounds.right).toBeGreaterThan(0);
  expect(bounds.top).toBeLessThan(bounds.viewportHeight);
  expect(bounds.bottom).toBeGreaterThan(0);
}

async function assertApprovedTravelerVisible(page: Page): Promise<void> {
  if (runtimeForestOpeningAssetExport.status !== "approved") {
    throw new Error("forest opening approved traveler assertion requires an approved export");
  }
  const save = await readOpeningSave(page);
  const atlas = runtimeForestOpeningAssetExport.files.find(({ role }) => role === "traveler_atlas")!;
  const animation = runtimeForestOpeningAssetExport.files.find(({ role }) => role === "animation_manifest")!;
  const palette = runtimeForestOpeningAssetExport.files.find(({ role }) => role === "time_palette")!;
  const player = save.spatial.spatial.player;
  const camera = save.spatial.spatial.camera;
  const approximate = {
    x: player.x - camera.x - 28,
    y: player.y - camera.y - 6,
    worldMinute: save.spatial.worldMinute,
  };
  const match = await page.locator('canvas[data-surface="game"]').evaluate(async (canvas, input) => {
    const [atlasResponse, animationResponse, paletteResponse] = await Promise.all([
      fetch(input.atlasPath), fetch(input.animationPath), fetch(input.palettePath),
    ]);
    if (!atlasResponse.ok || !animationResponse.ok || !paletteResponse.ok) {
      throw new Error("forest opening approved traveler evidence request failed");
    }
    const [bitmap, animationManifest, paletteManifest] = await Promise.all([
      createImageBitmap(await atlasResponse.blob()), animationResponse.json(), paletteResponse.json(),
    ]);
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = bitmap.width;
    atlasCanvas.height = bitmap.height;
    const atlasContext = atlasCanvas.getContext("2d", { willReadFrequently: true });
    const outputContext = canvas.getContext("2d", { willReadFrequently: true });
    if (!atlasContext || !outputContext) throw new Error("forest opening traveler evidence context is missing");
    atlasContext.drawImage(bitmap, 0, 0);
    bitmap.close();
    const output = outputContext.getImageData(0, 0, canvas.width, canvas.height).data;
    const states = (paletteManifest as { states: Array<{ multiply: number[]; ambient: number[] }> }).states;
    const anchors = [360, 720, 1_080, 1_320, 1_800];
    const normalized = ((input.worldMinute % 1_440) + 1_440) % 1_440;
    const minute = normalized < 360 ? normalized + 1_440 : normalized;
    let paletteIndex = 0;
    while (paletteIndex < anchors.length - 2 && minute > anchors[paletteIndex + 1]!) paletteIndex += 1;
    const ratio = (minute - anchors[paletteIndex]!) / (anchors[paletteIndex + 1]! - anchors[paletteIndex]!);
    const left = states[paletteIndex % 4]!;
    const right = states[(paletteIndex + 1) % 4]!;
    const multiply = left.multiply.map((value, channel) => value + (right.multiply[channel]! - value) * ratio);
    const ambient = left.ambient.map((value, channel) => value + (right.ambient[channel]! - value) * ratio);
    const transform = (value: number, channel: number): number =>
      Math.round((value * (0.76 + 0.24 * multiply[channel]!)) * 0.92 + ambient[channel]! * 0.08);
    const rows = (animationManifest as { traveler: Array<{
      frames: number; frame_width_px: number; frame_height_px: number; foot_anchor_y_px: number;
    }> }).traveler;
    const searchLeft = Math.max(0, Math.floor(input.approximateX - 200));
    const searchRight = Math.min(canvas.width - 1, Math.ceil(input.approximateX + 200));
    const searchTop = Math.max(0, Math.floor(input.approximateY - 120));
    const searchBottom = Math.min(canvas.height - 1, Math.ceil(input.approximateY + 120));
    const close = (actual: number, expected: number): boolean => Math.abs(actual - expected) <= 18;
    for (const row of rows) {
      for (let frame = 0; frame < row.frames; frame += 1) {
        const sourceX = frame * row.frame_width_px;
        const sourceY = row.foot_anchor_y_px - row.frame_height_px;
        const source = atlasContext.getImageData(sourceX, sourceY, row.frame_width_px, row.frame_height_px).data;
        const opaque: Array<{ x: number; y: number; rgb: number[] }> = [];
        for (let index = 0; index < source.length; index += 4) {
          if (source[index + 3] !== 255) continue;
          const pixel = index / 4;
          opaque.push({ x: pixel % row.frame_width_px, y: Math.floor(pixel / row.frame_width_px),
            rgb: [transform(source[index]!, 0), transform(source[index + 1]!, 1), transform(source[index + 2]!, 2)] });
        }
        if (opaque.length < 4) continue;
        const sampled = opaque.filter((_, index) => index % Math.max(1, Math.floor(opaque.length / 48)) === 0).slice(0, 48);
        const anchor = sampled[Math.floor(sampled.length / 2)]!;
        for (let y = searchTop; y <= searchBottom; y += 1) {
          for (let x = searchLeft; x <= searchRight; x += 1) {
            const topLeftX = x - anchor.x;
            const topLeftY = y - anchor.y;
            if (topLeftX < 0 || topLeftY < 0 || topLeftX + row.frame_width_px > canvas.width ||
                topLeftY + row.frame_height_px > canvas.height) continue;
            const anchorIndex = (y * canvas.width + x) * 4;
            if (!close(output[anchorIndex]!, anchor.rgb[0]!) || !close(output[anchorIndex + 1]!, anchor.rgb[1]!) ||
                !close(output[anchorIndex + 2]!, anchor.rgb[2]!)) continue;
            let matched = 0;
            for (const pixel of sampled) {
              const outputIndex = ((topLeftY + pixel.y) * canvas.width + topLeftX + pixel.x) * 4;
              if (close(output[outputIndex]!, pixel.rgb[0]!) && close(output[outputIndex + 1]!, pixel.rgb[1]!) &&
                  close(output[outputIndex + 2]!, pixel.rgb[2]!)) matched += 1;
            }
            if (matched / sampled.length >= 0.75) {
              const box = canvas.getBoundingClientRect();
              return { left: box.left + topLeftX * box.width / canvas.width,
                top: box.top + topLeftY * box.height / canvas.height,
                right: box.left + (topLeftX + row.frame_width_px) * box.width / canvas.width,
                bottom: box.top + (topLeftY + row.frame_height_px) * box.height / canvas.height,
                viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
            }
          }
        }
      }
    }
    throw new Error("forest opening approved traveler sprite is not visible");
  }, { atlasPath: atlas.publicPath, animationPath: animation.publicPath, palettePath: palette.publicPath,
    approximateX: approximate.x, approximateY: approximate.y, worldMinute: approximate.worldMinute });
  expect(match.left).toBeLessThan(match.viewportWidth);
  expect(match.right).toBeGreaterThan(0);
  expect(match.top).toBeLessThan(match.viewportHeight);
  expect(match.bottom).toBeGreaterThan(0);
}

async function recordRabbitMode(page: Page, modes?: Set<string>): Promise<void> {
  if (modes) modes.add((await readOpeningSave(page)).spatial.ecology.rabbit.mode);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readOpeningSave(page: Page): Promise<BrowserOpeningSave> {
  return page.evaluate((key) => {
    const bytes = localStorage.getItem(key);
    if (bytes === null) throw new Error("forest opening browser save is missing");
    return JSON.parse(bytes) as BrowserOpeningSave;
  }, SAVE_KEY);
}
