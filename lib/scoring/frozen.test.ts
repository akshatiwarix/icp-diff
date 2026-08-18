import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

/**
 * `lib/scoring/` is vendored verbatim from Day 001 (`icp-score`) and frozen.
 *
 * Day 012 contributes nothing to scoring. Its entire claim is causal attribution
 * *over* an unchanged scoring function — which only holds if the function really
 * is unchanged. The moment someone "just tweaks" an operator here, two things
 * break at once: the diff stops being comparable to Day 001's output, and every
 * ablation in `lib/diff/` starts measuring the tweak instead of the edit.
 *
 * So the rule from CLAUDE.md is enforced with a hash rather than a comment. If
 * you are reading this because the test failed: revert the change and compute
 * what you needed in `lib/diff/` instead. Updating the hash to make the test
 * pass is the one repair that is never correct.
 */

const here = dirname(fileURLToPath(import.meta.url));

const FROZEN: Record<string, string> = {
  "types.ts": "bbec452174eb525f01858ba972194e073aeac59954915046aaaf7ed4b89bb1fc",
  "operators.ts": "63faa5041d6338aaf9b5290858e2fd92faae1a6cef8bd7e03f8996374b31d4b8",
  "engine.ts": "b63bb41ded4477063df770a64aba0cda484e57f1fcace02e4813a565ea4d0465",
  "index.ts": "fab2bcc79527587002843ffd4073621ea01eef8200bebab3c9777753b0568073",
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("the vendored Day 001 engine is unmodified", () => {
  test.each(Object.entries(FROZEN))("%s matches its checked-in hash", (name, expected) => {
    expect(sha256(join(here, name))).toBe(expected);
  });
});

/*
 * Day 001's `engine.test.ts` is deliberately *not* vendored: it imports that
 * repo's 50-company fixture and its Zod schema, neither of which belongs here.
 * Day 001 owns those tests. What runs here is `operators.test.ts` (pure, no
 * fixtures) plus the trap fixtures and the sweep in `lib/diff/`, which exercise
 * `scoreAccount` against this repo's corpus on every threshold.
 */
