export type RetryableLazyLoaderSnapshot<T> = Readonly<
  | { status: "idle" | "loading"; value: null; error: null }
  | { status: "ready"; value: T; error: null }
  | { status: "error"; value: null; error: Error }
>;

export interface RetryableLazyLoader<T> {
  snapshot(): RetryableLazyLoaderSnapshot<T>;
  load(): Promise<RetryableLazyLoaderSnapshot<T>>;
}

export function createRetryableLazyLoader<T>(
  importer: () => Promise<T>,
): RetryableLazyLoader<T> {
  let state: RetryableLazyLoaderSnapshot<T> = Object.freeze({ status: "idle", value: null, error: null });
  let inFlight: Promise<RetryableLazyLoaderSnapshot<T>> | null = null;
  return Object.freeze({
    snapshot: () => state,
    load: () => {
      if (state.status === "ready") return Promise.resolve(state);
      if (inFlight) return inFlight;
      state = Object.freeze({ status: "loading", value: null, error: null });
      inFlight = importer().then(
        (value) => {
          state = Object.freeze({ status: "ready", value, error: null });
          inFlight = null;
          return state;
        },
        (cause: unknown) => {
          const error = cause instanceof Error ? cause : new Error("lazy UI import failed", { cause });
          state = Object.freeze({ status: "error", value: null, error });
          inFlight = null;
          return state;
        },
      );
      return inFlight;
    },
  });
}

export function projectRetryableLazyLoaderState(
  state: RetryableLazyLoaderSnapshot<unknown>,
): Readonly<{ visible: boolean; message: string; retryAvailable: boolean }> {
  if (state.status === "loading") {
    return Object.freeze({ visible: true, message: "正在加载界面…", retryAvailable: false });
  }
  if (state.status === "error") {
    return Object.freeze({ visible: true, message: "界面加载失败；可重试。", retryAvailable: true });
  }
  return Object.freeze({ visible: false, message: "", retryAvailable: false });
}
