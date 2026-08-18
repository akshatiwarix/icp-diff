import { describe, expect, test } from "vitest";

import { bandsWhere, bandWidth, marginOf } from "./bands";
import { axisFor, qualifiesAt, verdictOf } from "./verdicts";
import type { SideState } from "./types";

function state(partial: Partial<SideState>): SideState {
  return { score: 0, disqualified: false, rank: 1, qualified: false, ...partial };
}

describe("verdictOf", () => {
  test("disqualification wins over the cutoff in both directions", () => {
    // Fell below the cutoff *and* became disqualified. The disqualifier is the
    // actionable cause, so it leads.
    expect(
      verdictOf(state({ score: 83, qualified: true }), state({ score: 0, disqualified: true })),
    ).toBe("newly_disqualified");
    // Released by a hard rule but still not qualified — a real pair of facts, and
    // `undisqualified` is the one worth saying.
    expect(
      verdictOf(state({ disqualified: true }), state({ score: 38, qualified: false })),
    ).toBe("undisqualified");
  });

  test("an account disqualified on both sides is simply held out", () => {
    expect(
      verdictOf(state({ disqualified: true }), state({ disqualified: true })),
    ).toBe("held_out");
  });

  test("the four cutoff verdicts", () => {
    expect(verdictOf(state({ qualified: false }), state({ qualified: true }))).toBe("gained");
    expect(verdictOf(state({ qualified: true }), state({ qualified: false }))).toBe("lost");
    expect(verdictOf(state({ qualified: true }), state({ qualified: true }))).toBe("held_in");
    expect(verdictOf(state({ qualified: false }), state({ qualified: false }))).toBe("held_out");
  });
});

describe("qualifiesAt", () => {
  const account = (score: number, disqualified = false) =>
    ({ score, disqualified }) as Parameters<typeof qualifiesAt>[0];

  test("threshold mode compares the score", () => {
    expect(qualifiesAt(account(52), 1, { kind: "threshold", threshold: 52 }, 52)).toBe(true);
    expect(qualifiesAt(account(51), 1, { kind: "threshold", threshold: 52 }, 52)).toBe(false);
  });

  test("top-N mode compares the rank", () => {
    expect(qualifiesAt(account(10), 20, { kind: "top_n", topN: 20 }, 20)).toBe(true);
    expect(qualifiesAt(account(99), 21, { kind: "top_n", topN: 20 }, 20)).toBe(false);
  });

  test("a disqualified account never qualifies, at any position, in either mode", () => {
    expect(qualifiesAt(account(100, true), 1, { kind: "threshold", threshold: 0 }, 0)).toBe(false);
    expect(qualifiesAt(account(100, true), 1, { kind: "top_n", topN: 50 }, 50)).toBe(false);
  });
});

describe("axisFor", () => {
  test("thresholds run 0–100 and top-N runs 1–corpus size", () => {
    expect(axisFor({ kind: "threshold", threshold: 52 }, 77)).toEqual({ from: 0, to: 100 });
    expect(axisFor({ kind: "top_n", topN: 20 }, 77)).toEqual({ from: 1, to: 77 });
  });
});

describe("bandsWhere", () => {
  test("groups contiguous positions inclusively", () => {
    expect(bandsWhere(0, 10, (t) => t >= 3 && t <= 5)).toEqual([{ from: 3, to: 5 }]);
  });

  test("closes a band that runs to the end of the axis", () => {
    expect(bandsWhere(0, 5, (t) => t >= 4)).toEqual([{ from: 4, to: 5 }]);
  });

  test("returns nothing when the predicate never holds", () => {
    expect(bandsWhere(0, 100, () => false)).toEqual([]);
  });

  test("finds several islands, which is why it does not return a single band", () => {
    expect(bandsWhere(0, 10, (t) => t < 2 || t > 8)).toEqual([
      { from: 0, to: 1 },
      { from: 9, to: 10 },
    ]);
  });

  test("a gained band is exactly (scoreA, scoreB]", () => {
    const scoreA = 50;
    const scoreB = 54;
    const bands = bandsWhere(0, 100, (t) => scoreA < t && scoreB >= t);
    expect(bands).toEqual([{ from: 51, to: 54 }]);
    expect(bandWidth(bands)).toBe(4);
  });
});

describe("marginOf", () => {
  test("takes the closer edge", () => {
    const bands = [{ from: 51, to: 58 }];
    // Two points of room downwards (52 -> 51 -> out), seven upwards.
    expect(marginOf(bands, 52, 0, 100)).toBe(2);
    expect(marginOf(bands, 57, 0, 100)).toBe(2);
    expect(marginOf(bands, 54, 0, 100)).toBe(4);
  });

  test("an edge at the end of the axis is not an edge", () => {
    expect(marginOf([{ from: 0, to: 40 }], 10, 0, 100)).toBe(31);
    expect(marginOf([{ from: 60, to: 100 }], 90, 0, 100)).toBe(31);
  });

  test("null means the verdict does not depend on the cutoff at all", () => {
    // Both disqualification verdicts hold across the whole axis.
    expect(marginOf([{ from: 0, to: 100 }], 52, 0, 100)).toBeNull();
  });

  test("a position outside every band has no room", () => {
    expect(marginOf([{ from: 51, to: 54 }], 80, 0, 100)).toBe(0);
  });

  test("a one-wide band leaves one point of room", () => {
    expect(marginOf([{ from: 52, to: 52 }], 52, 0, 100)).toBe(1);
  });
});
