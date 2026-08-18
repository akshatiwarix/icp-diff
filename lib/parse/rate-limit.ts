/**
 * Per-IP sliding-window rate limiter, in memory.
 *
 * Guards the one endpoint that costs money and quota. The deterministic diff path
 * is unlimited because it is pure arithmetic over 77 rows.
 *
 * **This is per-instance, not global.** On Vercel the route runs across several
 * short-lived instances, each with its own Map, so the effective limit is
 * `limit × instances` and it resets on cold start. That is a real weakness, not
 * an implementation detail — it is stated in the README's Limitations rather than
 * papered over. It stops casual abuse (someone holding the button down), not a
 * determined one. Fixing it properly needs shared state such as Vercel KV, which
 * is out of scope for a one-day build.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the oldest request ages out. 0 when allowed. */
  retryAfterSeconds: number;
};

export type RateLimiter = {
  check: (key: string) => RateLimitResult;
  /** Exposed for tests; not called by the route. */
  reset: () => void;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  /**
   * Injected so tests can advance time without sleeping. Defaults to
   * `Date.now`, which is the only clock the route ever uses.
   */
  now?: () => number;
  /**
   * Upper bound on tracked keys. A long-running instance seeing many IPs would
   * otherwise grow this Map without limit — the sweep below is what keeps a rate
   * limiter from becoming the memory leak it was added to prevent.
   */
  maxKeys?: number;
};

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, number[]>();

  function sweep(cutoff: number): void {
    for (const [key, timestamps] of hits) {
      const live = timestamps.filter((at) => at > cutoff);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const currentTime = now();
      const cutoff = currentTime - windowMs;

      if (hits.size > maxKeys) sweep(cutoff);

      const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);

      if (recent.length >= limit) {
        const oldest = recent[0] ?? currentTime;
        hits.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - currentTime) / 1000)),
        };
      }

      recent.push(currentTime);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },

    reset() {
      hits.clear();
    },
  };
}

/**
 * Derive a rate-limit key from the request.
 *
 * `x-forwarded-for` is set by Vercel's proxy and is a comma-separated chain; the
 * client is the first entry. It is trivially spoofable by a determined caller,
 * which is another reason this limiter is a courtesy rather than a control.
 * Everything unidentifiable shares one bucket, which is the safe direction to
 * fail — an unkeyable flood gets limited as a group.
 */
export function rateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * The shared limiter for `POST /api/parse-edits`.
 *
 * Module-level so it survives between requests on the same instance. Five per
 * minute is well under the Gemini free tier's per-minute quota, leaving room for
 * several concurrent visitors on a public demo URL.
 *
 * `POST /api/diff` is deliberately unlimited: it is pure arithmetic over 77 rows
 * and costs nothing but CPU, and rate-limiting the path that works without a key
 * would punish the only part of this app that always works.
 */
export const parseEditsLimiter = createRateLimiter({ limit: 5, windowMs: 60_000 });
