/**
 * Public surface of the scoring engine.
 *
 * Import from here rather than reaching into the individual modules — Day 012
 * (`icp-diff`) and Day 017 (`tam-calculator`) are meant to consume exactly this.
 * Nothing under `lib/scoring/` imports `next`, `react`, or any SDK.
 */

export { rank, scoreAccount, scoreAll, scoreAndRank } from "./engine";
export { describeRule, evaluateRule, formatFieldValue, getFieldValue } from "./operators";
export type { RuleEvaluation } from "./operators";
export {
  COMPANY_FIELDS,
  FUNDING_STAGES,
  OPERATORS,
  type Company,
  type CompanyField,
  type Criterion,
  type CriterionEvaluation,
  type Disqualifier,
  type DisqualifierEvaluation,
  type FieldValue,
  type FundingStage,
  type IcpDefinition,
  type Operator,
  type Rule,
  type ScoredAccount,
} from "./types";
