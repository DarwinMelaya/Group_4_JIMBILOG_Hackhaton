/**
 * Coarse in-memory fixed-window limiter (per process). A second line of defence beside the persisted per-reference
 * lockout; it keeps only a counter per client key and never logs or exposes the key.
 */
export class WindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one attempt; returns the seconds to wait when the limit is exceeded, otherwise null. */
  hit(key: string): number | null {
    const t = this.now();
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return null;
    }
    cur.count += 1;
    return cur.count > this.limit ? Math.max(1, Math.ceil((cur.resetAt - t) / 1000)) : null;
  }
}
