import { describe, expect, test } from "vitest";

import { CORPUS } from "@/data/corpus";
import { REVISIONS, RIVAL_PAIR } from "@/data/presets";

import { buildDiff } from "./build";
import { checkInvariants } from "./invariants";
import type { BuildDiffInput, Mode } from "./types";

/**
 * The invariants over a reduced cross-product.
 *
 * `npm run sweep` runs all 101 thresholds; this file runs the positions where
 * things break — both ends of the axis, the default, and a couple of arbitrary
 * interior cutoffs — so a regression fails `npm test` rather than waiting for
 * someone to remember the sweep. The invariants themselves are shared code, not a
 * second implementation.
 */

const PAIRS = [
  ...REVISIONS.map((revision) => ({
    label: revision.label,
    icpA: revision.icpA,
    icpB: revision.icpB,
    provenance: revision.provenance,
  })),
  ...REVISIONS.map((revision) => ({
    label: `${revision.label} without provenance`,
    icpA: revision.icpA,
    icpB: revision.icpB,
    provenance: { kind: "none" } as const,
  })),
  {
    label: RIVAL_PAIR.label,
    icpA: RIVAL_PAIR.icpA,
    icpB: RIVAL_PAIR.icpB,
    provenance: RIVAL_PAIR.provenance,
  },
];

const MODES: Mode[] = [
  { kind: "threshold", threshold: 0 },
  { kind: "threshold", threshold: 38 },
  { kind: "threshold", threshold: 52 },
  { kind: "threshold", threshold: 73 },
  { kind: "threshold", threshold: 100 },
  { kind: "top_n", topN: 1 },
  { kind: "top_n", topN: 20 },
  { kind: "top_n", topN: CORPUS.length },
];

const cases = PAIRS.flatMap((pair) =>
  MODES.map((mode) => ({
    name: `${pair.label} at ${mode.kind === "threshold" ? `threshold ${mode.threshold}` : `top ${mode.topN}`}`,
    input: { corpus: CORPUS, icpA: pair.icpA, icpB: pair.icpB, provenance: pair.provenance, mode } satisfies BuildDiffInput,
  })),
);

describe("the invariants hold everywhere they are checked", () => {
  test.each(cases)("$name", ({ input }) => {
    const result = buildDiff(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(checkInvariants(result.report, input)).toEqual([]);
  });
});

describe("the sweep would notice a broken invariant", () => {
  test("a hand-corrupted band is reported rather than tolerated", () => {
    const revision = REVISIONS[0];
    expect(revision).toBeDefined();
    if (!revision) return;
    const input: BuildDiffInput = {
      corpus: CORPUS,
      icpA: revision.icpA,
      icpB: revision.icpB,
      provenance: revision.provenance,
      mode: { kind: "threshold", threshold: 52 },
    };
    const result = buildDiff(input);
    if (!result.ok) throw new Error(result.reason);

    // Widen one account's verdict band by a single point. If `checkInvariants`
    // cannot catch that, it cannot catch a real regression either.
    const account = result.report.accounts.find((candidate) => candidate.verdict === "gained");
    expect(account).toBeDefined();
    if (!account) return;
    const band = account.bands.verdictHolds[0];
    expect(band).toBeDefined();
    if (!band) return;
    band.to += 1;

    const violations = checkInvariants(result.report, input);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.invariant).toBe("band consistency");
  });

  test("a cause invented out of thin air is reported", () => {
    const revision = REVISIONS[0];
    if (!revision) throw new Error("missing");
    const input: BuildDiffInput = {
      corpus: CORPUS,
      icpA: revision.icpA,
      icpB: revision.icpB,
      provenance: { kind: "none" },
      mode: { kind: "threshold", threshold: 52 },
    };
    const result = buildDiff(input);
    if (!result.ok) throw new Error(result.reason);

    const account = result.report.accounts[0];
    expect(account).toBeDefined();
    if (!account) return;
    account.causes.push({ kind: "edit", atomId: "weight_changed:invented", sufficient: true, necessary: true });

    const violations = checkInvariants(result.report, input);
    expect(violations.some((violation) => violation.invariant === "provenance honesty")).toBe(true);
  });
});
