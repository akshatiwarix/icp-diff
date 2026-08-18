import { describe, expect, test } from "vitest";

import { CORPUS } from "@/data/corpus";
import { REVISIONS, RIVAL_PAIR } from "@/data/presets";
import { diffRequestSchema } from "@/data/schema";

import { buildDiff } from "./build";
import { canonicalJson, equivalenceViolation } from "./invariants";
import type { BuildDiffInput } from "./types";

/**
 * Invariant 5: the browser and the route handler must agree, byte for byte.
 *
 * The console calls `buildDiff` with live objects and recomputes on every
 * threshold change. `POST /api/diff` calls the same function with objects that
 * arrived as JSON and came out of Zod. Two code paths computing verdicts
 * differently is the failure this file exists to catch — and the way it happens is
 * never dramatic: a `[number, number]` that arrives as `number[]`, a key that was
 * `undefined` on one side and absent on the other, a default applied in one place.
 */

function run(input: BuildDiffInput) {
  const result = buildDiff(input);
  if (!result.ok) throw new Error(result.reason);
  return result.report;
}

const pairs = [
  ...REVISIONS.map((revision) => ({
    label: revision.label,
    icpA: revision.icpA,
    icpB: revision.icpB,
    provenance: revision.provenance,
  })),
  { label: RIVAL_PAIR.label, icpA: RIVAL_PAIR.icpA, icpB: RIVAL_PAIR.icpB, provenance: RIVAL_PAIR.provenance },
];

describe("client and server produce identical reports", () => {
  test.each(pairs)("$label survives a JSON round-trip unchanged", (pair) => {
    for (const mode of [
      { kind: "threshold", threshold: 52 } as const,
      { kind: "top_n", topN: 20 } as const,
    ]) {
      expect(
        equivalenceViolation(run, {
          corpus: CORPUS,
          icpA: pair.icpA,
          icpB: pair.icpB,
          provenance: pair.provenance,
          mode,
        }),
      ).toBeNull();
    }
  });

  test.each(pairs)("$label survives the actual request schema", (pair) => {
    // Not just any round-trip: the exact one the route performs, including Zod's
    // defaults and its `between` tuple handling.
    const body = JSON.parse(
      JSON.stringify({ icpA: pair.icpA, icpB: pair.icpB, provenance: pair.provenance }),
    );
    const parsed = diffRequestSchema.parse(body);
    const throughSchema = run({
      corpus: CORPUS,
      icpA: parsed.icpA,
      icpB: parsed.icpB,
      provenance: parsed.provenance,
      mode: { kind: "threshold", threshold: 52 },
    });
    const direct = run({
      corpus: CORPUS,
      icpA: pair.icpA,
      icpB: pair.icpB,
      provenance: pair.provenance,
      mode: { kind: "threshold", threshold: 52 },
    });
    expect(canonicalJson(throughSchema)).toBe(canonicalJson(direct));
  });

  test("key order is the only thing the schema changes", () => {
    // Worth pinning: the reason equivalence compares canonically is that Zod
    // reorders keys, and if it ever started changing something else the raw byte
    // comparison below would start passing for the wrong reason.
    const pair = pairs[0];
    expect(pair).toBeDefined();
    if (!pair) return;
    const parsed = diffRequestSchema.parse(
      JSON.parse(JSON.stringify({ icpA: pair.icpA, icpB: pair.icpB, provenance: pair.provenance })),
    );
    expect(canonicalJson(parsed.icpA)).toBe(canonicalJson(pair.icpA));
    expect(canonicalJson(parsed.icpB)).toBe(canonicalJson(pair.icpB));
  });

  test("the schema's default cutoff is the one the traps were pinned at", () => {
    const first = REVISIONS[0];
    expect(first).toBeDefined();
    if (!first) return;
    const parsed = diffRequestSchema.parse({
      icpA: JSON.parse(JSON.stringify(first.icpA)),
      icpB: JSON.parse(JSON.stringify(first.icpB)),
    });
    expect(parsed.mode).toEqual({ kind: "threshold", threshold: 52 });
    expect(parsed.provenance).toEqual({ kind: "none" });
  });
});
