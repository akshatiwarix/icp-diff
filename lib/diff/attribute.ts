/**
 * Attribution: which edit moved this account, earned two ways.
 *
 * Every claim here is produced by *applying* a subset of the edit list to ICP A
 * and re-scoring the corpus. Nothing reasons about what an edit probably does.
 *
 *   sufficient — apply this unit alone to A. Does the account reach the same
 *                verdict it has under the full B?
 *   necessary  — apply every unit except this one. Does the account fail to?
 *
 * Two booleans per (account, unit), each one checkable by the user in a single
 * ablation they can see. Where they disagree, the disagreement is the finding.
 *
 * There is deliberately no third number. A Shapley value over edit subsets is
 * computable here — the unit count is single digits — and it is exactly the wrong
 * output: `0.34` for "widened headcount" would be read as a measurement of blame
 * by everyone who saw it and audited by nobody, which is the failure Day 001 was
 * built to refuse. Four named states beat one number that cannot be checked.
 */

import { applyEdits, ablationUnits, withoutUnit } from "./edits";
import type { Company, IcpDefinition, ScoredAccount } from "../scoring";
import { buildSide, displacementCause, sideStateAt, verdictOf, type Side } from "./verdicts";
import { atomId, type AblationUnit, type Cause, type EditAtom, type Mode, type Verdict } from "./types";

/** What one ablation produced: the side, and its verdict for each account. */
type AblationOutcome = {
  unit: AblationUnit;
  /** Accounts where this unit alone reaches the full B verdict. */
  sufficient: Set<string>;
  /** Accounts that do not reach the B verdict when this unit is withheld. */
  necessary: Set<string>;
  /** True when applying this unit alone changes no account's score or flag. */
  changedNothing: boolean;
};

export type AttributionAnalysis = {
  units: AblationUnit[];
  outcomes: AblationOutcome[];
  /** Per account, the causes to report. Held verdicts get an empty list. */
  causesByCompany: Map<string, Cause[]>;
  combinationMoves: number;
};

function verdictFor(
  companyId: string,
  a: Side,
  other: Side,
  mode: Mode,
  position: number,
): Verdict | null {
  const accountA = a.byId.get(companyId);
  const accountOther = other.byId.get(companyId);
  const rankA = a.rankById.get(companyId);
  const rankOther = other.rankById.get(companyId);
  if (!accountA || !accountOther || rankA === undefined || rankOther === undefined) return null;
  return verdictOf(
    sideStateAt(accountA, rankA, mode, position),
    sideStateAt(accountOther, rankOther, mode, position),
  );
}

/**
 * Does applying this unit alone leave every score and flag untouched?
 *
 * This is the exact test for "changed nothing", not an approximation of it. Under
 * a threshold, an account's qualification is `score >= t`, so if two ICPs give an
 * account different scores there is necessarily some threshold between them where
 * qualification differs — a score change *always* implies a verdict change
 * somewhere on the axis. The contrapositive is what the ledger badge claims: no
 * score changed, therefore no verdict changes at any threshold, in either mode,
 * for any account. One pass, no sweep needed.
 */
function producesIdenticalScores(a: Side, solo: Side): boolean {
  for (const [companyId, account] of a.byId) {
    const other = solo.byId.get(companyId);
    if (!other) return false;
    if (other.score !== account.score) return false;
    if (other.disqualified !== account.disqualified) return false;
  }
  return true;
}

/**
 * Run every ablation and assemble the causes.
 *
 * Displacement is checked first and, when it fires, it is the *only* cause
 * reported. An account whose own score rose while its rank fell did not move
 * because of an edit to its own fit, and listing the edit that lifted its
 * competitors beside the displacement would re-blend exactly the two things the
 * rule exists to keep apart.
 */
export function analyseAttribution(
  corpus: Company[],
  icpA: IcpDefinition,
  edits: EditAtom[],
  a: Side,
  b: Side,
  mode: Mode,
  position: number,
): AttributionAnalysis {
  const units = ablationUnits(icpA, edits);
  const outcomes: AblationOutcome[] = [];

  const fullVerdicts = new Map<string, Verdict>();
  for (const company of corpus) {
    const verdict = verdictFor(company.id, a, b, mode, position);
    if (verdict) fullVerdicts.set(company.id, verdict);
  }

  for (const unit of units) {
    const solo = applyEdits(icpA, unit.atoms);
    const loo = applyEdits(icpA, withoutUnit(edits, unit));
    // `ablationUnits` guarantees both of these apply. If one does not, the unit
    // grouping is wrong and silently degrading the report would hide it.
    if (!solo.ok) throw new Error(`ablation unit ${unit.atomIds.join("+")} cannot apply alone: ${solo.reason}`);
    if (!loo.ok) throw new Error(`ablation unit ${unit.atomIds.join("+")} cannot be withheld: ${loo.reason}`);

    const soloSide = buildSide(corpus, solo.icp);
    const looSide = buildSide(corpus, loo.icp);

    const sufficient = new Set<string>();
    const necessary = new Set<string>();

    for (const company of corpus) {
      const target = fullVerdicts.get(company.id);
      if (!target || target === "held_in" || target === "held_out") continue;

      if (verdictFor(company.id, a, soloSide, mode, position) === target) {
        sufficient.add(company.id);
      }
      if (verdictFor(company.id, a, looSide, mode, position) !== target) {
        necessary.add(company.id);
      }
    }

    outcomes.push({
      unit,
      sufficient,
      necessary,
      changedNothing: producesIdenticalScores(a, soloSide),
    });
  }

  const causesByCompany = new Map<string, Cause[]>();
  let combinationMoves = 0;

  for (const company of corpus) {
    const verdict = fullVerdicts.get(company.id);
    if (!verdict || verdict === "held_in" || verdict === "held_out") {
      causesByCompany.set(company.id, []);
      continue;
    }

    const displacement = displacementCause(company.id, a, b, mode, verdict);
    if (displacement) {
      causesByCompany.set(company.id, [displacement]);
      continue;
    }

    const causes: Cause[] = [];
    for (const outcome of outcomes) {
      const sufficient = outcome.sufficient.has(company.id);
      const necessary = outcome.necessary.has(company.id);
      if (!sufficient && !necessary) continue;
      // A linked unit shares one verdict across its atoms: the ablation was run on
      // the pair, so neither half earned the claim on its own.
      for (const atom of outcome.unit.atoms) {
        causes.push({ kind: "edit", atomId: atomId(atom), sufficient, necessary });
      }
    }

    if (causes.length === 0) {
      combinationMoves += 1;
      causes.push({
        kind: "combination",
        atomIds: units.flatMap((unit) => unit.atomIds),
      });
    }

    causesByCompany.set(company.id, causes);
  }

  return { units, outcomes, causesByCompany, combinationMoves };
}

/** Did an account cross into or out of the qualified set, by the active mode? */
export function movement(
  companyId: string,
  a: Side,
  b: Side,
  mode: Mode,
  position: number,
): "in" | "out" | "none" {
  const accountA = a.byId.get(companyId);
  const accountB = b.byId.get(companyId);
  const rankA = a.rankById.get(companyId);
  const rankB = b.rankById.get(companyId);
  if (!accountA || !accountB || rankA === undefined || rankB === undefined) return "none";
  const wasIn = sideStateAt(accountA, rankA, mode, position).qualified;
  const isIn = sideStateAt(accountB, rankB, mode, position).qualified;
  if (wasIn === isIn) return "none";
  return isIn ? "in" : "out";
}

/** The accounts an account's `ScoredAccount` list is keyed by, for tests. */
export function scoredIds(accounts: ScoredAccount[]): string[] {
  return accounts.map((account) => account.company.id);
}
