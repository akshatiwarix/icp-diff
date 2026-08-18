/**
 * The six invariants, as code rather than as prose in a README.
 *
 * Each one is a property that must hold for *every* report the engine can
 * produce, not a fixture. `data/traps.ts` pins the ten interesting cases;
 * `scripts/sweep.mts` runs these across the cross-product of preset pairs,
 * provenance states, all 101 thresholds and every top-N worth checking, which is
 * where a bug that only appears at threshold 73 gets caught.
 *
 * They are here, in the pure engine, rather than inside a test file so that the
 * sweep script and the test suite check exactly the same thing. Two copies of an
 * invariant is one copy plus a lie.
 */

import { atomId, causeAtomIds, type BuildDiffInput, type DiffReport } from "./types";
import { axisFor, axisPosition, buildSide, sideStateAt, verdictOf } from "./verdicts";

export type Violation = { invariant: string; detail: string };

/**
 * 1. Attribution completeness.
 *
 * With provenance, every account that moved carries at least one named cause.
 * Silent movement is the failure this whole repo exists to prevent, so it is
 * checked first and it has no exceptions: a `combination` cause is the floor when
 * no single edit is sufficient or necessary, and it still counts as named.
 */
function attributionCompleteness(report: DiffReport, input: BuildDiffInput): Violation[] {
  if (input.provenance.kind !== "derived") return [];
  const violations: Violation[] = [];
  for (const account of report.accounts) {
    if (account.verdict === "held_in" || account.verdict === "held_out") continue;
    if (account.causes.length === 0) {
      violations.push({
        invariant: "attribution completeness",
        detail: `${account.companyId} is ${account.verdict} with no cause`,
      });
    }
  }
  return violations;
}

/**
 * 2. Band consistency.
 *
 * The verdict computed at a cutoff must equal the verdict the bands imply there,
 * at *every* position on the axis — not only the one on screen. This is the
 * invariant that stops a row and the strip beside it from disagreeing, which is
 * the most damaging bug this engine could ship: the row would be right and the
 * fragility claim beside it would be wrong, and the fragility claim is the one a
 * user acts on.
 */
function bandConsistency(report: DiffReport, input: BuildDiffInput): Violation[] {
  const violations: Violation[] = [];
  const a = buildSide(input.corpus, input.icpA);
  const b = buildSide(input.corpus, input.icpB);
  const axis = axisFor(input.mode, input.corpus.length);

  for (const account of report.accounts) {
    const scoredA = a.byId.get(account.companyId);
    const scoredB = b.byId.get(account.companyId);
    const rankA = a.rankById.get(account.companyId);
    const rankB = b.rankById.get(account.companyId);
    if (!scoredA || !scoredB || rankA === undefined || rankB === undefined) continue;

    for (let position = axis.from; position <= axis.to; position++) {
      const verdictHere = verdictOf(
        sideStateAt(scoredA, rankA, input.mode, position),
        sideStateAt(scoredB, rankB, input.mode, position),
      );
      const inBand = account.bands.verdictHolds.some(
        (band) => position >= band.from && position <= band.to,
      );
      if ((verdictHere === account.verdict) !== inBand) {
        violations.push({
          invariant: "band consistency",
          detail: `${account.companyId}: at ${position} the verdict is ${verdictHere} but the band says ${inBand ? "it holds" : "it does not"}`,
        });
        break;
      }
    }

    const containsCurrent = account.bands.verdictHolds.some(
      (band) => axisPosition(input.mode) >= band.from && axisPosition(input.mode) <= band.to,
    );
    if (!containsCurrent) {
      violations.push({
        invariant: "band consistency",
        detail: `${account.companyId}: the current cutoff is not inside its own verdict band`,
      });
    }
  }
  return violations;
}

/**
 * 3. Displacement soundness.
 *
 * A displacement claims the account's own fit did not deteriorate. If its score
 * fell, that claim is false and an edit is the real cause. Also checked: the mode
 * is top-N (a threshold cannot displace anyone), the verdict is `lost`, at least
 * one overtaking account is named, and no edit cause sits beside it.
 */
function displacementSoundness(report: DiffReport): Violation[] {
  const violations: Violation[] = [];
  for (const account of report.accounts) {
    const displacement = account.causes.find((cause) => cause.kind === "displacement");
    if (!displacement || displacement.kind !== "displacement") continue;

    if (report.mode.kind !== "top_n") {
      violations.push({
        invariant: "displacement soundness",
        detail: `${account.companyId} is displaced under a threshold, which cannot displace anyone`,
      });
    }
    if (account.b.score < account.a.score) {
      violations.push({
        invariant: "displacement soundness",
        detail: `${account.companyId} is marked displaced but its score fell ${account.a.score} → ${account.b.score}`,
      });
    }
    if (account.verdict !== "lost") {
      violations.push({
        invariant: "displacement soundness",
        detail: `${account.companyId} is displaced but its verdict is ${account.verdict}`,
      });
    }
    if (displacement.overtakenBy.length === 0) {
      violations.push({
        invariant: "displacement soundness",
        detail: `${account.companyId} is displaced by nobody in particular`,
      });
    }
    if (account.causes.length !== 1) {
      violations.push({
        invariant: "displacement soundness",
        detail: `${account.companyId} blends displacement with ${account.causes.length - 1} edit cause(s)`,
      });
    }
  }
  return violations;
}

/**
 * 4. Provenance honesty.
 *
 * Without a common ancestor there is no edit to name, so there must be no cause
 * anywhere — including on the accounts that plainly moved, which is exactly where
 * the temptation to guess lives.
 */
function provenanceHonesty(report: DiffReport, input: BuildDiffInput): Violation[] {
  if (input.provenance.kind !== "none") return [];
  const violations: Violation[] = [];
  if (report.attribution.state !== "unattributed") {
    violations.push({
      invariant: "provenance honesty",
      detail: `attribution state is ${report.attribution.state} with no provenance`,
    });
  }
  for (const account of report.accounts) {
    if (account.causes.length > 0) {
      violations.push({
        invariant: "provenance honesty",
        detail: `${account.companyId} carries ${account.causes.length} cause(s) with no provenance`,
      });
    }
  }
  return violations;
}

/**
 * 6. No id leakage.
 *
 * Every atom a cause names must be in the ledger, and every ledger atom must
 * target a criterion or disqualifier that exists in ICP A or ICP B. An
 * attribution citing an id that appears in neither definition is the signature of
 * a pairing heuristic, which is the thing this engine refuses to do.
 */
function noIdLeakage(report: DiffReport, input: BuildDiffInput): Violation[] {
  if (report.attribution.state !== "attributed") return [];
  const violations: Violation[] = [];

  const ledgerIds = new Set(report.attribution.ledger.map((entry) => entry.atomId));
  const known = new Set<string>([
    ...input.icpA.criteria.map((criterion) => criterion.id),
    ...input.icpA.disqualifiers.map((disqualifier) => disqualifier.id),
    ...input.icpB.criteria.map((criterion) => criterion.id),
    ...input.icpB.disqualifiers.map((disqualifier) => disqualifier.id),
  ]);

  for (const entry of report.attribution.ledger) {
    const target = atomId(entry.atom).split(":").slice(1).join(":");
    if (!known.has(target)) {
      violations.push({
        invariant: "no id leakage",
        detail: `ledger entry ${entry.atomId} targets ${target}, which is in neither definition`,
      });
    }
  }

  for (const account of report.accounts) {
    for (const cause of account.causes) {
      for (const id of causeAtomIds(cause)) {
        if (!ledgerIds.has(id)) {
          violations.push({
            invariant: "no id leakage",
            detail: `${account.companyId} cites ${id}, which is not in the ledger`,
          });
        }
      }
    }
  }

  return violations;
}

/** Bookkeeping that would make every other invariant untrustworthy if wrong. */
function reportShape(report: DiffReport, input: BuildDiffInput): Violation[] {
  const violations: Violation[] = [];
  if (report.accounts.length !== input.corpus.length) {
    violations.push({
      invariant: "report shape",
      detail: `${report.accounts.length} accounts for a corpus of ${input.corpus.length} — movement is a filter, never a subset`,
    });
  }
  const tallied = Object.values(report.counts).reduce((total, count) => total + count, 0);
  if (tallied !== report.accounts.length) {
    violations.push({
      invariant: "report shape",
      detail: `verdict counts sum to ${tallied}, not ${report.accounts.length}`,
    });
  }
  const ids = new Set(report.accounts.map((account) => account.companyId));
  if (ids.size !== report.accounts.length) {
    violations.push({ invariant: "report shape", detail: "duplicate account rows" });
  }
  return violations;
}

/**
 * Invariants 1, 2, 3, 4, 6 and the shape checks.
 *
 * Invariant 5 — client/server equivalence — needs two *runs* rather than one
 * report, so it lives in `equivalence` below.
 */
export function checkInvariants(report: DiffReport, input: BuildDiffInput): Violation[] {
  return [
    ...attributionCompleteness(report, input),
    ...bandConsistency(report, input),
    ...displacementSoundness(report),
    ...provenanceHonesty(report, input),
    ...noIdLeakage(report, input),
    ...reportShape(report, input),
  ];
}

/**
 * 5. Client/server equivalence.
 *
 * The browser calls `buildDiff` with live objects; `POST /api/diff` calls it with
 * objects that have been through `JSON.stringify` and Zod. If those two paths can
 * diverge — an `undefined` that becomes a missing key, a `[number, number]` that
 * arrives as `number[]`, a Map that survives one path and not the other — then the
 * console and the API disagree about who qualifies, and nobody finds out until
 * someone compares a screenshot to a curl.
 *
 * So the check is blunt: run the engine on the live input, run it on the input as
 * the route receives it, and require identical output.
 *
 * "Identical" means identical *content*, compared with keys in a canonical order —
 * not identical bytes. Zod rebuilds every object in the order its schema declares
 * fields, so a criterion literal written `{ operator, value, weight }` comes back
 * as `{ weight, operator, value }`. That difference cannot change a verdict, and a
 * test that fails for a reason which cannot change a verdict is a test somebody
 * eventually deletes.
 */
export function equivalenceViolation(
  run: (input: BuildDiffInput) => DiffReport,
  input: BuildDiffInput,
): Violation | null {
  const live = canonicalJson(run(input));
  const roundTripped = canonicalJson(run(JSON.parse(JSON.stringify(input)) as BuildDiffInput));
  if (live === roundTripped) return null;
  return {
    invariant: "client/server equivalence",
    detail: "the report differs between live objects and the same input as the route receives it",
  };
}

/**
 * JSON with object keys in a stable order, arrays left alone.
 *
 * Array order is never sorted: the ranking of accounts and the ordering of the
 * ledger are both meaningful output, and a comparison that ignored them would let
 * a real reordering bug through.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) ordered[key] = canonicalize(source[key]);
  return ordered;
}
