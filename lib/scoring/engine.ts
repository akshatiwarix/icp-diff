/**
 * The scoring engine.
 *
 * `score = round(100 × Σ(matched weights) ÷ Σ(all weights))`, and nothing else.
 * No heuristics, no model calls, no hidden adjustments — every number here is
 * arithmetic over the criteria the user can see and edit in the builder.
 */

import { evaluateRule, getFieldValue } from "./operators";
import type {
  Company,
  CriterionEvaluation,
  DisqualifierEvaluation,
  IcpDefinition,
  ScoredAccount,
} from "./types";

/**
 * Score one company against one ICP.
 *
 * Criteria and disqualifiers are *both* fully evaluated, always. A disqualified
 * account keeps its complete criterion breakdown, because "would have been a
 * perfect fit except for the hiring freeze" is the most useful thing this tool
 * can tell you — short-circuiting on the first triggered disqualifier would
 * throw that away to save microseconds.
 */
export function scoreAccount(company: Company, icp: IcpDefinition): ScoredAccount {
  const criteria: CriterionEvaluation[] = icp.criteria.map((criterion) => {
    const { matched, detail } = evaluateRule(
      criterion.field,
      getFieldValue(company, criterion.field),
      criterion,
    );
    return {
      criterionId: criterion.id,
      label: criterion.label,
      matched,
      weight: criterion.weight,
      contribution: matched ? criterion.weight : 0,
      detail,
    };
  });

  const disqualifiers: DisqualifierEvaluation[] = icp.disqualifiers.map((disqualifier) => {
    const { matched, detail } = evaluateRule(
      disqualifier.field,
      getFieldValue(company, disqualifier.field),
      disqualifier,
    );
    return {
      disqualifierId: disqualifier.id,
      triggered: matched,
      reason: disqualifier.reason,
      detail,
    };
  });

  const disqualified = disqualifiers.some((d) => d.triggered);

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const matchedWeight = criteria.reduce((sum, c) => sum + c.contribution, 0);

  // An ICP with no criteria, or with every weight set to 0, is unanswerable
  // rather than perfect. Guarding here is what keeps NaN out of the UI.
  const rawScore = totalWeight === 0 ? 0 : Math.round((100 * matchedWeight) / totalWeight);

  return {
    company,
    score: disqualified ? 0 : rawScore,
    disqualified,
    criteria,
    disqualifiers,
  };
}

export function scoreAll(companies: Company[], icp: IcpDefinition): ScoredAccount[] {
  return companies.map((company) => scoreAccount(company, icp));
}

/**
 * Rank accounts for display: disqualified last, then score descending, then by
 * company name.
 *
 * The name tiebreak exists so the table does not reshuffle between renders when
 * a dozen accounts share a score, and the id tiebreak after it makes the
 * ordering total — two companies with the same name still sort deterministically.
 * Returns a new array; the input is not mutated.
 */
export function rank(accounts: ScoredAccount[]): ScoredAccount[] {
  return [...accounts].sort((a, b) => {
    if (a.disqualified !== b.disqualified) return a.disqualified ? 1 : -1;
    if (a.score !== b.score) return b.score - a.score;
    if (a.company.name !== b.company.name) return a.company.name < b.company.name ? -1 : 1;
    if (a.company.id === b.company.id) return 0;
    return a.company.id < b.company.id ? -1 : 1;
  });
}

/** Score and rank in one call — what the API route and the UI both want. */
export function scoreAndRank(companies: Company[], icp: IcpDefinition): ScoredAccount[] {
  return rank(scoreAll(companies, icp));
}
