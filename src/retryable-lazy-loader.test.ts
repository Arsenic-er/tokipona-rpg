import { describe, expect, it, vi } from "vitest";
import { createRetryableLazyLoader, projectRetryableLazyLoaderState } from "./retryable-lazy-loader";

describe("retryable lazy loader", () => {
  it("fails closed, clears a rejected attempt, and retries without duplicate concurrent imports", async () => {
    let resolveSecond: ((value: { readonly ready: true }) => void) | undefined;
    const importer = vi.fn()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockImplementationOnce(() => new Promise<{ readonly ready: true }>((resolve) => {
        resolveSecond = resolve;
      }));
    const loader = createRetryableLazyLoader(importer);

    const failed = await loader.load();
    expect(failed).toMatchObject({ status: "error", value: null });
    expect(failed.error).toBeInstanceOf(Error);
    expect(projectRetryableLazyLoaderState(failed)).toEqual({
      visible: true,
      message: "界面加载失败；可重试。",
      retryAvailable: true,
    });
    expect(importer).toHaveBeenCalledTimes(1);

    const retry = loader.load();
    const duplicate = loader.load();
    expect(retry).toBe(duplicate);
    expect(loader.snapshot()).toEqual({ status: "loading", value: null, error: null });
    expect(projectRetryableLazyLoaderState(loader.snapshot())).toEqual({
      visible: true,
      message: "正在加载界面…",
      retryAvailable: false,
    });
    expect(importer).toHaveBeenCalledTimes(2);

    resolveSecond?.({ ready: true });
    await expect(retry).resolves.toEqual({ status: "ready", value: { ready: true }, error: null });
    await expect(loader.load()).resolves.toEqual({ status: "ready", value: { ready: true }, error: null });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
