import { describe, expect, test } from "vitest";

import { createRateLimiter, rateLimitKey } from "./rate-limit";

/** A clock the test drives, so nothing here sleeps. */
function fakeClock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe("sliding window", () => {
  test("allows up to the limit, then refuses", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });

    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  test("reports the remaining allowance", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: clock.now });

    expect(limiter.check("ip").remaining).toBe(2);
    expect(limiter.check("ip").remaining).toBe(1);
    expect(limiter.check("ip").remaining).toBe(0);
  });

  test("a refused request reports when to retry, and does not extend the block", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });

    limiter.check("ip");
    clock.advance(20_000);
    const refused = limiter.check("ip");
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBe(40);

    // Retrying while blocked must not push the window forward — otherwise an
    // impatient client could lock itself out indefinitely.
    clock.advance(10_000);
    expect(limiter.check("ip").retryAfterSeconds).toBe(30);
  });

  test("the window slides rather than resetting in fixed buckets", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now });

    limiter.check("ip"); // t=0
    clock.advance(30_000);
    limiter.check("ip"); // t=30s
    expect(limiter.check("ip").allowed).toBe(false);

    clock.advance(31_000); // t=61s — the first request has aged out, the second has not
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  test("the allowance is restored after the full window", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: clock.now });

    limiter.check("ip");
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);

    clock.advance(60_001);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  test("keys are independent", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock.now });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  test("a limit of 0 refuses everything", () => {
    const limiter = createRateLimiter({ limit: 0, windowMs: 60_000 });
    expect(limiter.check("ip").allowed).toBe(false);
  });

  test("stale keys are swept so the map cannot grow without bound", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      now: clock.now,
      maxKeys: 5,
    });

    for (let i = 0; i < 10; i++) limiter.check(`ip-${i}`);
    clock.advance(60_001);
    // The sweep runs on the next check once the map is over its cap; every old
    // key has aged out, so each of these is a fresh allowance.
    for (let i = 0; i < 10; i++) expect(limiter.check(`ip-${i}`).allowed, `ip-${i}`).toBe(true);
  });
});

describe("rateLimitKey", () => {
  function requestWith(headers: Record<string, string>): Request {
    return new Request("https://example.com/api/parse-icp", { method: "POST", headers });
  }

  test("takes the client from the front of the x-forwarded-for chain", () => {
    expect(rateLimitKey(requestWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
  });

  test("trims whitespace", () => {
    expect(rateLimitKey(requestWith({ "x-forwarded-for": "  203.0.113.7 " }))).toBe("203.0.113.7");
  });

  test("falls back to x-real-ip", () => {
    expect(rateLimitKey(requestWith({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  test("an unidentifiable request shares one bucket rather than escaping the limit", () => {
    expect(rateLimitKey(requestWith({}))).toBe("unknown");
    expect(rateLimitKey(requestWith({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
