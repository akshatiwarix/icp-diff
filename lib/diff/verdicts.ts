/**
 * Qualification, verdicts, and displacement.
 *
 * Two ideas do all the work here.
 *
 * **Disqualification is its own axis.** Day 001's engine forces a disqualified
 * account's score to 0, which means a score-only diff reports "dropped from 83 to
 * 0" for an account whose fit actually improved. So the verdict is decided by
 * looking at the disqualification flags *first* and the cutoff second.
 *
 * **Under top-N, qualification is zero-sum.** An account can leave the list with
 * its own score higher than before, because other accounts rose past it. That is
 * not an edit acting on this account, it is arithmetic about other accounts, and
 * calling it anything else is a fabricated causal claim.
 */

import { rank as rankAccounts, scoreAll } from "../scoring";
import type { Company, IcpDefinition, ScoredAccount } from "../scoring";
import type { Cause, Mode, SideState, Verdict } from "./types";

/** One side of the diff: every account scored, ranked, and indexed by id. */
export type Side = {
  icp: IcpDefinition;
  byId: Map<string, ScoredAccount>;
  /** 1-based position in Day 001's ranking: disqualified last, then score desc. */
  rankById: Map<string, number>;
  /** Ranked order, for naming the accounts that overtook someone. */
  ranked: ScoredAccount[];
};

export function buildSide(corpus: Company[], icp: IcpDefinition): Side {
  const scored = scoreAll(corpus, icp);
  const ranked = rankAccounts(scored);
  return {
    icp,
    byId: new Map(scored.map((account) => [account.company.id, account])),
    rankById: new Map(ranked.map((account, index) => [account.company.id, index + 1])),
    ranked,
  };
}

/**
 * Does this account qualify at this position on the axis?
 *
 * A disqualified account never qualifies, under either mode — that is what makes
 * a disqualifier hard rather than a large negative weight. Under top-N the
 * comparison is against rank, and Day 001's `rank` already sorts disqualified
 * accounts last, so a disqualified account can never occupy a top slot even
 * before this check.
 */
export function qualifiesAt(
  account: ScoredAccount,
  rankPosition: number,
  mode: Mode,
  axisPosition: number,
): boolean {
  if (account.disqualified) return false;
  return mode.kind === "threshold" ? account.score >= axisPosition : rankPosition <= axisPosition;
}

export function sideStateAt(
  account: ScoredAccount,
  rankPosition: number,
  mode: Mode,
  axisPosition: number,
): SideState {
  return {
    score: account.score,
    disqualified: account.disqualified,
    rank: rankPosition,
    qualified: qualifiesAt(account, rankPosition, mode, axisPosition),
  };
}

/**
 * The six verdicts.
 *
 * Order of tests is the whole design. A newly disqualified account is
 * `newly_disqualified` even though it also fell below the cutoff, because the
 * disqualifier is the actionable cause and the score of 0 is a consequence of it.
 * An account that was disqualified and now is not is `undisqualified` even if it
 * still does not qualify — being released by a hard rule is a distinct event from
 * scoring well enough, and tinsel-retail exists in the corpus to prove the two
 * can come apart (released, and still at 38).
 */
export function verdictOf(a: SideState, b: SideState): Verdict {
  if (!a.disqualified && b.disqualified) return "newly_disqualified";
  if (a.disqualified && !b.disqualified) return "undisqualified";
  if (a.qualified && b.qualified) return "held_in";
  if (!a.qualified && !b.qualified) return "held_out";
  return b.qualified ? "gained" : "lost";
}

/** The axis the active mode exposes, inclusive at both ends. */
export function axisFor(mode: Mode, corpusSize: number): { from: number; to: number } {
  return mode.kind === "threshold" ? { from: 0, to: 100 } : { from: 1, to: corpusSize };
}

export function axisPosition(mode: Mode): number {
  return mode.kind === "threshold" ? mode.threshold : mode.topN;
}

/**
 * Did this account lose its slot without its own fit changing?
 *
 * Reachable under top-N only: a threshold does not care what any other account
 * does. The test is deliberately generous on the score side — `>=`, not `>` —
 * because an account whose score held *exactly* while its rank fell is the purest
 * case of the phenomenon, and the point of naming displacement is that an edit
 * which never touched this account should not be blamed for moving it.
 *
 * `overtakenBy` names the accounts that were below it under A, are above it under
 * B, and are inside the list under B. Those are the accounts that took the slot;
 * listing anything else would pad the claim.
 */
export function displacementCause(
  companyId: string,
  a: Side,
  b: Side,
  mode: Mode,
  verdict: Verdict,
): Cause | null {
  if (mode.kind !== "top_n") return null;
  if (verdict !== "lost") return null;

  const scoreA = a.byId.get(companyId);
  const scoreB = b.byId.get(companyId);
  const rankA = a.rankById.get(companyId);
  const rankB = b.rankById.get(companyId);
  if (!scoreA || !scoreB || rankA === undefined || rankB === undefined) return null;

  if (scoreB.disqualified) return null;
  if (scoreB.score < scoreA.score) return null;
  if (rankB <= rankA) return null;

  const overtakenBy = b.ranked
    .slice(0, mode.topN)
    .filter((candidate) => {
      const otherId = candidate.company.id;
      if (otherId === companyId) return false;
      const otherRankA = a.rankById.get(otherId);
      const otherRankB = b.rankById.get(otherId);
      if (otherRankA === undefined || otherRankB === undefined) return false;
      return otherRankA > rankA && otherRankB < rankB;
    })
    .map((candidate) => candidate.company.name);

  if (overtakenBy.length === 0) return null;
  return { kind: "displacement", overtakenBy };
}
