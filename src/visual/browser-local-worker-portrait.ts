export const WORKER_PORTRAIT_URL = '/src/local-art-cache/worker-portrait.v0.1.png';

export async function loadLocalWorkerPortrait(
  enabled: boolean,
  load: (url: string) => Promise<HTMLImageElement>,
): Promise<HTMLImageElement | null> {
  if (!enabled) return null;
  try {
    const image = await load(WORKER_PORTRAIT_URL);
    return image.naturalWidth === 1254 && image.naturalHeight === 1254 ? image : null;
  } catch { return null; }
}

/** Optional art never delays game readiness. Timed out candidates cannot reappear later. */
export function loadLocalWorkerPortraitFromDocument(): Promise<HTMLImageElement | null> {
  return loadLocalWorkerPortrait(import.meta.env.DEV || __TOKIPONA_LOCAL_DESKTOP__, url => new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('portrait timed out')); }, 4000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('portrait unavailable')); };
    image.src = url;
  }));
}
