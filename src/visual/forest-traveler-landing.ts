import type { ForestOpeningPublicView } from "./forest-opening-view";

/** Reuse the existing authored landing poses, without changing the body or input.
 * Running cancels recovery immediately; repeated renders do not advance it. */
export class ForestTravelerLanding {
  private previous: { tick: number; x: number; y: number; falling: boolean } | null = null;
  private start: number | null = null;

  public frame(view: Pick<ForestOpeningPublicView, 'tick' | 'traveler'>): number | null {
    const { tick, traveler } = view;
    const { x, y } = traveler.position;
    const old = this.previous;
    if (old?.tick !== tick) {
      const continuous = old !== null && tick > old.tick && tick - old.tick <= 6 &&
        Math.abs(x - old.x) <= 24 && Math.abs(y - old.y) <= 24;
      if (!continuous) this.start = null;
      if (continuous && old.falling && ["idle", "walk"].includes(traveler.animationId)) this.start = tick;
      this.previous = { tick, x, y, falling: traveler.animationId === "fall" };
    }
    if (!["idle", "walk"].includes(traveler.animationId)) this.start = null;
    return this.start === null || tick - this.start >= 12 ? null : Math.floor((tick - this.start) / 3);
  }
}
