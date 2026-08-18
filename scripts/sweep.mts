/**
 * The invariant sweep.
 *
 * `npm run sweep`. No network, no key, no server. Every preset pair, in every
 * provenance state, at every one of the 101 thresholds and at ten values of N —
 * and for each of those reports, all six invariants.
 *
 * The point of a sweep rather than a handful of fixtures is that the bugs in an
 * engine like this one are positional. Attribution that is correct at threshold 52
 * and wrong at 73 looks perfect in a demo, in a screenshot, and in every test that
 * uses the default. Day 007's sweep found a real bug this way before its UI
 * existed, which is why this file lands before any component in `PLAN.md`'s task
 * order.
 */

import { CORPUS } from "@/data/corpus";
import { REVISIONS, RIVAL_PAIR } from "@/data/presets";
import { buildDiff } from "@/lib/diff";
import { checkInvariants, equivalenceViolation, type Violation } from "@/lib/diff/invariants";
import type { BuildDiffInput, Mode } from "@/lib/diff";

const PAIRS: { label: string; icpA: BuildDiffInput["icpA"]; icpB: BuildDiffInput["icpB"]; provenance: BuildDiffInput["provenance"] }[] = [
  ...REVISIONS.map((revision) => ({
    label: revision.label,
    icpA: revision.icpA,
    icpB: revision.icpB,
    provenance: revision.provenance,
  })),
  // The same derived pairs with provenance discarded. This is the case a UI could
  // reach by round-tripping a report through the paste panel, and it must produce
  // an identical outcome diff with no causes at all.
  ...REVISIONS.map((revision) => ({
    label: `${revision.label} (provenance discarded)`,
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

const TOP_N_VALUES = [1, 2, 5, 10, 15, 20, 30, 45, 60, CORPUS.length];

function modes(): Mode[] {
  const list: Mode[] = [];
  for (let threshold = 0; threshold <= 100; threshold++) list.push({ kind: "threshold", threshold });
  for (const topN of TOP_N_VALUES) list.push({ kind: "top_n", topN });
  return list;
}

function run(input: BuildDiffInput) {
  const result = buildDiff(input);
  if (!result.ok) throw new Error(`buildDiff refused a bundled pair: ${result.reason}`);
  return result.report;
}

const started = Date.now.name ? performance.now() : 0;
const violations: Violation[] = [];
let reports = 0;
let accountsChecked = 0;
let causesChecked = 0;
let refusalsSeen = 0;

for (const pair of PAIRS) {
  for (const mode of modes()) {
    const input: BuildDiffInput = {
      corpus: CORPUS,
      icpA: pair.icpA,
      icpB: pair.icpB,
      provenance: pair.provenance,
      mode,
    };
    const report = run(input);
    reports += 1;
    accountsChecked += report.accounts.length;
    causesChecked += report.accounts.reduce((total, account) => total + account.causes.length, 0);
    if (report.attribution.state === "unattributed") refusalsSeen += 1;

    violations.push(...checkInvariants(report, input));
  }

  // Equivalence is a property of two runs, so it is checked once per pair at the
  // default cutoff rather than 111 times with the same answer.
  const equivalence = equivalenceViolation(run, {
    corpus: CORPUS,
    icpA: pair.icpA,
    icpB: pair.icpB,
    provenance: pair.provenance,
    mode: { kind: "threshold", threshold: 52 },
  });
  if (equivalence) violations.push(equivalence);
}

/**
 * A refused diff is also swept: provenance that does not replay into ICP B must
 * produce no report at any cutoff, not a report with a caveat.
 */
const q3 = REVISIONS[0];
const weights = REVISIONS[1];
if (q3 && weights) {
  for (const mode of modes()) {
    const result = buildDiff({
      corpus: CORPUS,
      icpA: q3.icpA,
      icpB: weights.icpB,
      provenance: q3.provenance,
      mode,
    });
    if (result.ok) {
      violations.push({
        invariant: "wrong provenance is refused",
        detail: `a mismatched edit list produced a report at ${JSON.stringify(mode)}`,
      });
    }
  }
}

const elapsed = started ? Math.round(performance.now() - started) : 0;

console.log(`sweep: ${PAIRS.length} pairs × ${modes().length} cutoffs`);
console.log(`  ${reports} reports`);
console.log(`  ${accountsChecked.toLocaleString("en-US")} account rows checked`);
console.log(`  ${causesChecked.toLocaleString("en-US")} causes checked`);
console.log(`  ${refusalsSeen} reports refused attribution by name`);
if (elapsed) console.log(`  ${elapsed}ms, no network`);

if (violations.length > 0) {
  console.error(`\n${violations.length} invariant violation(s):`);
  const shown = violations.slice(0, 25);
  for (const violation of shown) console.error(`  [${violation.invariant}] ${violation.detail}`);
  if (violations.length > shown.length) {
    console.error(`  … and ${violations.length - shown.length} more`);
  }
  process.exit(1);
}

console.log("\nall six invariants hold across the cross-product.");
