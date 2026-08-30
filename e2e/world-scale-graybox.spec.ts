import { expect, test, type Page, type TestInfo } from "@playwright/test";

const RPG_STORAGE = Object.freeze({
  "tokipona.rpg.prologue.v0.3": "primary-byte-sentinel",
  "tokipona.rpg.prologue.v0.3.cross-save-wal": "wal-byte-sentinel",
  "tokipona.rpg.prologue.v0.3.telemetry": "telemetry-byte-sentinel",
  "tokipona.rpg.prologue.v0.3.telemetry.playtest": "playtest-byte-sentinel",
});

type AuditState = Readonly<{
  regionId: string;
  districtId: string;
  tick: number;
  playerX: number;
  playerY: number;
  checkpointId: string;
  checkpointX: number;
  checkpointY: number;
  cameraWidth: number;
  cameraHeight: number;
  waterwheelFullyVisible: boolean;
  waterwheelVisibleComponents: number;
  waterwheelTotalComponents: number;
  laterGatesBlocked: boolean;
  travelerScreenX: number;
  travelerScreenY: number;
  travelerScreenWidth: number;
  travelerScreenHeight: number;
}>;

type RouteInput = "keyboard" | "touch";

type RouteEvidence = Readonly<{
  firstVisits: readonly string[];
  transitions: readonly Readonly<{ from: string; to: string }>[];
  regionIds: readonly string[];
  minimumProgressDelta: number;
}>;

const AUTHORED_INITIAL_ROUTE_ADJACENCY = new Set([
  "forest.arrival->forest.stream",
  "forest.stream->forest.arrival",
  "forest.stream->forest.settlement",
  "forest.settlement->forest.stream",
  "forest.settlement->forest.hermit_branch",
  "forest.hermit_branch->forest.settlement",
  "forest.hermit_branch->forest.waterwheel",
  "forest.waterwheel->forest.hermit_branch",
]);

for (const audit of [
  { name: "desktop keyboard", viewport: { width: 1_440, height: 900 }, hasTouch: false, routeInput: "keyboard" as const },
  { name: "mobile touch", viewport: { width: 390, height: 844 }, hasTouch: true, routeInput: "touch" as const },
] as const) {
  test.describe(audit.name, () => {
    test.use({ viewport: audit.viewport, hasTouch: audit.hasTouch });

    test("crosses the continuous forest with fixed camera, safe recovery, and bounded RGBA allocation", async ({ page }, testInfo) => {
      test.setTimeout(180_000);
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") pageErrors.push(message.text());
      });
      await installAllocationProbe(page);
      await page.clock.install();
      await page.goto("/world-scale.html");

      const root = page.locator(".forest-graybox");
      const canvas = page.locator('canvas[aria-label*="可操作的连续森林"]');
      await expect(root).toBeVisible();
      await expect(page.locator(".world-review__audit, [data-profile]")).toHaveCount(0);
      await expect(canvas).toHaveAttribute("width", "640");
      await expect(canvas).toHaveAttribute("height", "360");
      await expectCoverBox(canvas, audit.viewport);

      const initial = await readAuditState(page);
      expect(initial).toMatchObject({
        regionId: "valley_prologue",
        districtId: "forest.arrival",
        cameraWidth: 640,
        cameraHeight: 360,
        waterwheelFullyVisible: false,
        laterGatesBlocked: true,
      });
      await expectRenderedTravelerVisible(page, audit.viewport);
      await captureAuditScreenshot(page, testInfo, "initial");

      const allocationBaseline = await allocationCounts(page);
      for (let frame = 0; frame < 8; frame += 1) await page.clock.fastForward(17);
      const allocationAfterEightFrames = await allocationCounts(page);
      expect(allocationAfterEightFrames.largeImageData - allocationBaseline.largeImageData)
        .toBeLessThanOrEqual(1);

      await page.evaluate((entries) => {
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
      }, RPG_STORAGE);
      const storageBefore = await readRpgStorage(page);
      const navigationCount = await page.evaluate(() => performance.getEntriesByType("navigation").length);
      const urlBefore = page.url();

      await restoreNativeAllocationConstructors(page);
      await expectEquivalentKeyboardAndTouchStep(page, audit.hasTouch);
      const route = await traverseToWaterwheel(page, audit.routeInput, audit.viewport);
      expect(route.firstVisits).toEqual([
        "forest.arrival",
        "forest.stream",
        "forest.settlement",
        "forest.hermit_branch",
        "forest.waterwheel",
      ]);
      expect(route.transitions.length).toBeGreaterThanOrEqual(4);
      for (const transition of route.transitions) {
        expect(
          AUTHORED_INITIAL_ROUTE_ADJACENCY.has(`${transition.from}->${transition.to}`),
          `unauthored district transition ${transition.from}->${transition.to}`,
        ).toBe(true);
      }
      expect(route.minimumProgressDelta).toBeGreaterThanOrEqual(-0.25);
      expect(new Set(route.regionIds)).toEqual(new Set([initial.regionId]));

      const atWaterwheel = await readAuditState(page);
      expect(atWaterwheel.regionId).toBe(initial.regionId);
      expect(atWaterwheel.districtId).toBe("forest.waterwheel");
      expect(atWaterwheel.playerX).toBeGreaterThanOrEqual(5_000);
      expect(atWaterwheel.cameraWidth).toBe(640);
      expect(atWaterwheel.cameraHeight).toBe(360);
      expect(atWaterwheel.waterwheelFullyVisible).toBe(false);
      expect(atWaterwheel.waterwheelVisibleComponents).toBeGreaterThan(0);
      expect(atWaterwheel.waterwheelVisibleComponents).toBeLessThan(atWaterwheel.waterwheelTotalComponents);
      expect(atWaterwheel.laterGatesBlocked).toBe(true);
      await expectRenderedTravelerVisible(page, audit.viewport);
      await captureAuditScreenshot(page, testInfo, "waterwheel");

      await page.clock.fastForward(100);
      const stableWaterwheel = await readAuditState(page);
      expect(stableWaterwheel.tick - atWaterwheel.tick).toBeGreaterThanOrEqual(5);
      expect(stableWaterwheel.regionId).toBe(initial.regionId);
      expect(stableWaterwheel.districtId).toBe("forest.waterwheel");
      expect(stableWaterwheel.playerX).toBeGreaterThanOrEqual(atWaterwheel.playerX - 0.25);
      expect(stableWaterwheel.waterwheelFullyVisible).toBe(false);

      const checkpoint = {
        id: stableWaterwheel.checkpointId,
        x: stableWaterwheel.checkpointX,
        y: stableWaterwheel.checkpointY,
      };
      expect(checkpoint.id).toBe("checkpoint.forest.waterwheel");
      await moveFor(page, audit.routeInput, 1_000);
      expect((await readAuditState(page)).playerX).toBeGreaterThan(checkpoint.x);
      expect(await resetToCheckpointAndReadPosition(page)).toEqual({
        playerX: checkpoint.x,
        playerY: checkpoint.y,
      });

      expect(await readRpgStorage(page)).toEqual(storageBefore);
      expect(page.url()).toBe(urlBefore);
      expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(navigationCount);
      expect(pageErrors).toEqual([]);
    });
  });
}

async function expectCoverBox(
  canvas: ReturnType<Page["locator"]>,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<void> {
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(viewport.width);
  expect(box!.height).toBeGreaterThanOrEqual(viewport.height);
  expect(box!.width / box!.height).toBeCloseTo(16 / 9, 4);
}

async function expectEquivalentKeyboardAndTouchStep(page: Page, hasTouch: boolean): Promise<void> {
  const canvas = page.locator('canvas[aria-label*="可操作的连续森林"]');
  await canvas.focus();
  const initial = await readAuditState(page);

  await page.keyboard.down("d");
  await page.clock.fastForward(17);
  await page.keyboard.up("d");
  const keyboard = await readAuditState(page);
  await page.getByRole("button", { name: "返回最近的灰盒检查点" }).click();

  const right = page.getByRole("button", { name: "向右移动" });
  if (hasTouch) await right.tap();
  else await page.evaluate(() => {
    const control = document.querySelector<HTMLButtonElement>('[data-touch="right"]');
    if (!control) throw new Error("right touch control is missing");
    control.click();
  });
  await page.clock.fastForward(17);
  const touch = await readAuditState(page);

  expect(keyboard.playerX).toBeGreaterThan(initial.playerX);
  expect(touch.playerX).toBeGreaterThan(initial.playerX);
  expect(keyboard.tick).toBeGreaterThan(initial.tick);
  expect(touch.tick).toBeGreaterThan(keyboard.tick);
  expect(keyboard.regionId).toBe(touch.regionId);
  expect(keyboard.cameraWidth).toBe(touch.cameraWidth);
  expect(keyboard.cameraHeight).toBe(touch.cameraHeight);
  await page.getByRole("button", { name: "返回最近的灰盒检查点" }).click();
}

async function traverseToWaterwheel(
  page: Page,
  input: RouteInput,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<RouteEvidence> {
  const firstVisits: string[] = [];
  const transitions: { from: string; to: string }[] = [];
  const regionIds: string[] = [];
  const right = page.getByRole("button", { name: "向右移动" });
  const touch = input === "touch" ? await beginTouchHold(page, right) : null;
  if (input === "keyboard") await page.keyboard.down("d");
  let lastX = Number.NEGATIVE_INFINITY;
  let previousDistrictId: string | null = null;
  let minimumProgressDelta = Number.POSITIVE_INFINITY;
  let stalledSamples = 0;
  let slowestBatchMilliseconds = 0;
  try {
    for (let sample = 0; sample < 100; sample += 1) {
      const batchStarted = Date.now();
      await page.clock.fastForward(1_000);
      slowestBatchMilliseconds = Math.max(slowestBatchMilliseconds, Date.now() - batchStarted);
      const state = await readAuditState(page);
      await expectRenderedTravelerVisible(page, viewport);
      regionIds.push(state.regionId);
      if (!firstVisits.includes(state.districtId)) firstVisits.push(state.districtId);
      if (previousDistrictId !== null && previousDistrictId !== state.districtId) {
        transitions.push({ from: previousDistrictId, to: state.districtId });
      }
      previousDistrictId = state.districtId;
      if (Number.isFinite(lastX)) minimumProgressDelta = Math.min(
        minimumProgressDelta,
        state.playerX - lastX,
      );
      expect(state.cameraWidth).toBe(640);
      expect(state.cameraHeight).toBe(360);
      expect(state.waterwheelFullyVisible).toBe(false);
      if (state.districtId === "forest.waterwheel" && state.playerX >= 5_000) {
        return Object.freeze({
          firstVisits: Object.freeze(firstVisits),
          transitions: Object.freeze(transitions.map((transition) => Object.freeze(transition))),
          regionIds: Object.freeze(regionIds),
          minimumProgressDelta,
        });
      }

      stalledSamples = state.playerX <= lastX + 0.25 ? stalledSamples + 1 : 0;
      lastX = state.playerX;
      if (stalledSamples >= 2) {
        if (input === "keyboard") await page.keyboard.press("w");
        else await page.getByRole("button", { name: "跳跃" }).click();
        stalledSamples = 0;
      }
    }
  } finally {
    if (input === "keyboard") await page.keyboard.up("d");
    else await touch!.release();
  }
  const final = await readAuditState(page);
  throw new Error(`continuous forest traversal stopped at ${final.districtId} (${final.playerX}, ${final.playerY}); slowest 60-tick batch ${slowestBatchMilliseconds}ms; first visits ${firstVisits.join(" -> ")}; transitions ${transitions.map(({ from, to }) => `${from}->${to}`).join(", ")}`);
}

async function moveFor(page: Page, input: RouteInput, milliseconds: number): Promise<void> {
  const right = page.getByRole("button", { name: "向右移动" });
  const touch = input === "touch" ? await beginTouchHold(page, right) : null;
  if (input === "keyboard") await page.keyboard.down("d");
  try {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 1_000) {
      await page.clock.fastForward(Math.min(1_000, milliseconds - elapsed));
    }
  } finally {
    if (input === "keyboard") await page.keyboard.up("d");
    else await touch!.release();
  }
}

async function beginTouchHold(
  page: Page,
  control: ReturnType<Page["locator"]>,
): Promise<Readonly<{ release: () => Promise<void> }>> {
  const box = await control.boundingBox();
  if (!box) throw new Error("right touch control has no layout box");
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, radiusX: 2, radiusY: 2, force: 1 }],
  });
  return Object.freeze({
    release: async () => {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
    },
  });
}

async function readAuditState(page: Page): Promise<AuditState> {
  return page.locator(".forest-graybox").evaluate((element) => {
    const required = (name: string): string => {
      const value = (element as HTMLElement).dataset[name];
      if (value === undefined || value.length === 0) throw new Error(`missing graybox audit field: ${name}`);
      return value;
    };
    const number = (name: string): number => {
      const value = Number(required(name));
      if (!Number.isFinite(value)) throw new Error(`non-finite graybox audit field: ${name}`);
      return value;
    };
    const boolean = (name: string): boolean => {
      const value = required(name);
      if (value !== "true" && value !== "false") throw new Error(`non-boolean graybox audit field: ${name}`);
      return value === "true";
    };
    const tick = Number(element.querySelector('[data-hud="tick"]')?.textContent);
    if (!Number.isFinite(tick)) throw new Error("non-finite graybox audit field: tick");
    return {
      regionId: required("regionId"),
      districtId: required("districtId"),
      tick,
      playerX: number("playerX"),
      playerY: number("playerY"),
      checkpointId: required("checkpointId"),
      checkpointX: number("checkpointX"),
      checkpointY: number("checkpointY"),
      cameraWidth: number("cameraWidth"),
      cameraHeight: number("cameraHeight"),
      waterwheelFullyVisible: boolean("waterwheelFullyVisible"),
      waterwheelVisibleComponents: number("waterwheelVisibleComponents"),
      waterwheelTotalComponents: number("waterwheelTotalComponents"),
      laterGatesBlocked: boolean("laterGatesBlocked"),
      travelerScreenX: number("travelerScreenX"),
      travelerScreenY: number("travelerScreenY"),
      travelerScreenWidth: number("travelerScreenWidth"),
      travelerScreenHeight: number("travelerScreenHeight"),
    };
  });
}

async function resetToCheckpointAndReadPosition(
  page: Page,
): Promise<Readonly<{ playerX: number; playerY: number }>> {
  return page.locator(".forest-graybox").evaluate((element) => {
    const root = element as HTMLElement;
    const reset = root.querySelector<HTMLButtonElement>('[data-action="reset"]');
    if (!reset) throw new Error("forest graybox reset control is missing");
    reset.click();
    const number = (name: string): number => {
      const value = Number(root.dataset[name]);
      if (!Number.isFinite(value)) throw new Error(`non-finite graybox audit field: ${name}`);
      return value;
    };
    return { playerX: number("playerX"), playerY: number("playerY") };
  });
}

async function expectRenderedTravelerVisible(
  page: Page,
  viewport: Readonly<{ width: number; height: number }>,
): Promise<void> {
  const projection = await page.locator(".forest-graybox").evaluate((element) => {
    const root = element as HTMLElement;
    const canvas = root.querySelector<HTMLCanvasElement>('canvas[aria-label*="可操作的连续森林"]');
    if (!canvas) throw new Error("forest graybox canvas is missing");
    const number = (name: string): number => {
      const value = Number(root.dataset[name]);
      if (!Number.isFinite(value)) throw new Error(`non-finite graybox audit field: ${name}`);
      return value;
    };
    const box = canvas.getBoundingClientRect();
    const scaleX = box.width / 640;
    const scaleY = box.height / 360;
    const travelerScreenX = number("travelerScreenX");
    const travelerScreenY = number("travelerScreenY");
    const travelerScreenWidth = number("travelerScreenWidth");
    const travelerScreenHeight = number("travelerScreenHeight");
    return {
      scaleX,
      scaleY,
      physical: {
        left: box.x + travelerScreenX * scaleX,
        top: box.y + travelerScreenY * scaleY,
        right: box.x + (travelerScreenX + travelerScreenWidth) * scaleX,
        bottom: box.y + (travelerScreenY + travelerScreenHeight) * scaleY,
      },
    };
  });
  const { physical, scaleX, scaleY } = projection;
  expect(scaleX).toBeCloseTo(scaleY, 4);
  expect(physical.right, `traveler bounds ${JSON.stringify(physical)}`).toBeGreaterThan(0);
  expect(physical.left, `traveler bounds ${JSON.stringify(physical)}`).toBeLessThan(viewport.width);
  expect(physical.bottom, `traveler bounds ${JSON.stringify(physical)}`).toBeGreaterThan(0);
  expect(physical.top, `traveler bounds ${JSON.stringify(physical)}`).toBeLessThan(viewport.height);
}

async function captureAuditScreenshot(
  page: Page,
  testInfo: TestInfo,
  phase: "initial" | "waterwheel",
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`forest-graybox-${phase}.png`),
    animations: "disabled",
  });
}

async function readRpgStorage(page: Page): Promise<Readonly<Record<string, string | null>>> {
  return page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])),
    Object.keys(RPG_STORAGE));
}

async function installAllocationProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const allocationKey = "__forestGrayboxAllocationProbe";
    let largeImageData = 0;
    const nativeCreateImageData = CanvasRenderingContext2D.prototype.createImageData;
    CanvasRenderingContext2D.prototype.createImageData = function createTrackedImageData(
      ...argumentsList: Parameters<CanvasRenderingContext2D["createImageData"]>
    ): ImageData {
      const value = nativeCreateImageData.apply(this, argumentsList as [number, number, ImageDataSettings?]);
      if (value.width === 640 && value.height === 360) largeImageData += 1;
      return value;
    };
    Object.defineProperty(globalThis, allocationKey, {
      value: () => ({ largeImageData }),
    });
    Object.defineProperty(globalThis, "__forestGrayboxAllocationProbeRestore", {
      value: () => {
        CanvasRenderingContext2D.prototype.createImageData = nativeCreateImageData;
      },
    });
  });
}

async function restoreNativeAllocationConstructors(page: Page): Promise<void> {
  await page.evaluate(() => {
    const restore = (globalThis as typeof globalThis & {
      __forestGrayboxAllocationProbeRestore?: () => void;
    }).__forestGrayboxAllocationProbeRestore;
    if (!restore) throw new Error("forest graybox allocation probe restore is missing");
    restore();
  });
}

async function allocationCounts(page: Page): Promise<Readonly<{
  largeImageData: number;
}>> {
  return page.evaluate(() => {
    const probe = (globalThis as typeof globalThis & {
      __forestGrayboxAllocationProbe?: () => { largeImageData: number };
    }).__forestGrayboxAllocationProbe;
    if (!probe) throw new Error("forest graybox allocation probe is missing");
    return probe();
  });
}
