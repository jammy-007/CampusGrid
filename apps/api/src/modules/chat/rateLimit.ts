/**
 * In-memory sliding-window rate limiter keyed by user id.
 * `hit(key)` records an attempt and returns false once `max` attempts fall inside `windowMs`.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): boolean {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => t - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    this.prune(t);
    return true;
  }

  /** Milliseconds until `key` may send again (0 when allowed now). */
  retryAfter(key: string): number {
    const recent = (this.hits.get(key) ?? []).filter((at) => this.now() - at < this.windowMs);
    if (recent.length < this.max) return 0;
    return Math.max(0, recent[0] + this.windowMs - this.now());
  }

  reset(): void {
    this.hits.clear();
  }

  /** Drops idle keys now and then so the map can't grow without bound. */
  private prune(t: number) {
    if (this.hits.size < 1000) return;
    for (const [key, list] of this.hits) {
      if (!list.some((at) => t - at < this.windowMs)) this.hits.delete(key);
    }
  }
}
