/**
 * `buildDiff` — the only way into this engine.
 *
 * Route handlers and components call this and nothing else. `attribute.ts`,
 * `bands.ts`, `edits.ts` and `verdicts.ts` are internals; reaching into them from
 * outside is how two callers end up computing verdicts differently, which is the
 * failure `equivalence.test.ts` exists to catch.
 *
 * Two refusals live here, and they are different from each other.
 *
 * **Unattributed** — ICP B carries no provenance. The outcome diff is complete
 * and correct; per-edit blame is declined by name, because pairing criteria
 * across two independently authored definitions produces confident sentences
 * about criteria that exist in neither.
 *
 * **Refused** — provenance is present but wrong: the recorded edits do not
 * transform A into B. That is worse than no provenance, because every ablation
 * would run, succeed, and attribute exactly to a fiction. No report is produced.
 */

import { bandsWhere, marginOf } from "./bands";
import { analyseAttribution, movement } from "./attribute";
import { applyEdits, sameDefinition } from "./edits";
import { describeAtom } from "./describe";
import {
  atomId,
  causeAtomIds,
  isInteraction,
  type AccountBands,
  type AccountDiff,
  type Attribution,
  type BuildDiffInput,
  type DiffReport,
  type DiffResult,
  type LedgerEntry,
  type Verdict,
  VERDICTS,
} from "./types";
import { axisFor, axisPosition, buildSide, qualifiesAt, sideStateAt, verdictOf } from "./verdicts";

export function buildDiff(input: BuildDiffInput): DiffResult {
  const { corpus, icpA, icpB, provenance, mode } = input;

  const a = buildSide(corpus, icpA);
  const b = buildSide(corpus, icpB);
  const axis = axisFor(mode, corpus.length);
  const position = axisPosition(mode);

  if (provenance.kind === "derived") {
    const replayed = applyEdits(icpA, provenance.edits);
    if (!replayed.ok) {
      return {
        ok: false,
        reason: `the recorded edits do not apply to ${icpA.name}: ${replayed.reason}`,
      };
    }
    if (!sameDefinition(replayed.icp, icpB)) {
      return {
        ok: false,
        reason: `the recorded edits do not produce ${icpB.name} from ${icpA.name} — attribution over this edit list would be exact about the wrong ICP`,
      };
    }
  }

  const analysis =
    provenance.kind === "derived"
      ? analyseAttribution(corpus, icpA, provenance.edits, a, b, mode, position)
      : null;

  const accounts: AccountDiff[] = [];
  const counts = Object.fromEntries(VERDICTS.map((verdict) => [verdict, 0])) as Record<
    Verdict,
    number
  >;

  for (const account of b.ranked) {
    const companyId = account.company.id;
    const scoredA = a.byId.get(companyId);
    const rankA = a.rankById.get(companyId);
    const rankB = b.rankById.get(companyId);
    if (!scoredA || rankA === undefined || rankB === undefined) continue;

    const stateA = sideStateAt(scoredA, rankA, mode, position);
    const stateB = sideStateAt(account, rankB, mode, position);
    const verdict = verdictOf(stateA, stateB);
    counts[verdict] += 1;

    // Walking the axis rather than solving for the crossing points keeps one
    // definition of "what is the verdict here" in play. Two definitions — one for
    // the current cutoff, one for the bands — is how a row and the strip beside it
    // start disagreeing.
    const verdictAt = (axisPoint: number): Verdict =>
      verdictOf(
        sideStateAt(scoredA, rankA, mode, axisPoint),
        sideStateAt(account, rankB, mode, axisPoint),
      );

    const bands: AccountBands = {
      axis: mode.kind === "threshold" ? "threshold" : "top_n",
      axisFrom: axis.from,
      axisTo: axis.to,
      qualifiedA: bandsWhere(axis.from, axis.to, (point) =>
        qualifiesAt(scoredA, rankA, mode, point),
      ),
      qualifiedB: bandsWhere(axis.from, axis.to, (point) =>
        qualifiesAt(account, rankB, mode, point),
      ),
      verdictHolds: bandsWhere(axis.from, axis.to, (point) => verdictAt(point) === verdict),
    };

    accounts.push({
      companyId,
      companyName: account.company.name,
      a: stateA,
      b: stateB,
      verdict,
      margin: marginOf(bands.verdictHolds, position, axis.from, axis.to),
      rankDelta: stateA.qualified && stateB.qualified ? rankB - rankA : null,
      bands,
      causes: analysis?.causesByCompany.get(companyId) ?? [],
      breakdown: { a: scoredA, b: account },
    });
  }

  const attribution: Attribution = analysis
    ? {
        state: "attributed",
        units: analysis.units,
        combinationMoves: analysis.combinationMoves,
        ledger: buildLedger(analysis, accounts, corpus, a, b, mode, position),
      }
    : {
        state: "unattributed",
        reason:
          "no common ancestor — ICP B was not derived from ICP A, so no edit exists to name as a cause",
      };

  const report: DiffReport = {
    icpA: {
      name: icpA.name,
      criteria: icpA.criteria.length,
      disqualifiers: icpA.disqualifiers.length,
    },
    icpB: {
      name: icpB.name,
      criteria: icpB.criteria.length,
      disqualifiers: icpB.disqualifiers.length,
    },
    mode,
    corpusSize: corpus.length,
    attribution,
    accounts,
    counts,
  };

  return { ok: true, report };
}

function buildLedger(
  analysis: NonNullable<ReturnType<typeof analyseAttribution>>,
  accounts: AccountDiff[],
  corpus: BuildDiffInput["corpus"],
  a: ReturnType<typeof buildSide>,
  b: ReturnType<typeof buildSide>,
  mode: BuildDiffInput["mode"],
  position: number,
): LedgerEntry[] {
  const causesByAtom = new Map<string, { companyId: string; sufficient: boolean; necessary: boolean }[]>();
  for (const account of accounts) {
    for (const cause of account.causes) {
      if (cause.kind !== "edit") continue;
      const existing = causesByAtom.get(cause.atomId) ?? [];
      existing.push({
        companyId: account.companyId,
        sufficient: cause.sufficient,
        necessary: cause.necessary,
      });
      causesByAtom.set(cause.atomId, existing);
    }
  }

  const entries: LedgerEntry[] = [];

  for (const outcome of analysis.outcomes) {
    for (const atom of outcome.unit.atoms) {
      const id = atomId(atom);
      const attributed = causesByAtom.get(id) ?? [];

      let movedIn = 0;
      let movedOut = 0;
      for (const entry of attributed) {
        const direction = movement(entry.companyId, a, b, mode, position);
        if (direction === "in") movedIn += 1;
        if (direction === "out") movedOut += 1;
      }

      entries.push({
        atomId: id,
        atom,
        description: describeAtom(atom),
        linkedWith: outcome.unit.atomIds.filter((other) => other !== id),
        movedIn,
        movedOut,
        sufficientCount: attributed.filter((entry) => entry.sufficient).length,
        necessaryCount: attributed.filter((entry) => entry.necessary).length,
        interactionCount: accounts.filter((account) =>
          account.causes.some(
            (cause) => cause.kind === "edit" && cause.atomId === id && isInteraction(cause),
          ),
        ).length,
        changedNothing: outcome.changedNothing,
      });
    }
  }

  // Loudest first: the edits that moved the most accounts, then the ones that
  // moved nothing. A ledger sorted by atom kind buries the finding.
  return entries.sort((left, right) => {
    const leftMoves = left.movedIn + left.movedOut;
    const rightMoves = right.movedIn + right.movedOut;
    if (leftMoves !== rightMoves) return rightMoves - leftMoves;
    return left.atomId < right.atomId ? -1 : 1;
  });
}

/** Accounts whose causes name this atom — what a ledger click filters to. */
export function accountsCausedBy(report: DiffReport, atomId: string): AccountDiff[] {
  return report.accounts.filter((account) =>
    account.causes.some((cause) => causeAtomIds(cause).includes(atomId)),
  );
}

/** Accounts that moved, in report order. The table's default filter. */
export function movers(report: DiffReport): AccountDiff[] {
  return report.accounts.filter(
    (account) => account.verdict !== "held_in" && account.verdict !== "held_out",
  );
}
