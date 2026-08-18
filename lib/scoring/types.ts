/**
 * Data model for the scoring engine.
 *
 * This module is deliberately free of runtime dependencies — no Zod, no Next,
 * no React. Validation lives at the boundary in `lib/icp/schema.ts`, which
 * asserts at compile time that its parsed output matches these types exactly.
 */

export const FUNDING_STAGES = [
  "bootstrapped",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "public",
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

/**
 * A company record.
 *
 * Four fields are nullable, and they are exactly the four that real enrichment
 * providers most often fail to return. Null is a first-class state here, not an
 * error: a null field never matches a criterion, and the evaluation's `detail`
 * string says so. See `lib/scoring/operators.ts`.
 */
export type Company = {
  id: string;
  name: string;
  domain: string;
  industry: string | null;
  employee_count: number;
  hq_country: string | null; // ISO 3166-1 alpha-2
  annual_revenue_usd: number | null;
  funding_stage: FundingStage;
  tech_stack: string[];
  hiring_signals: string[];
  founded_year: number | null;
};

export type CompanyField = keyof Company;

export const COMPANY_FIELDS = [
  "id",
  "name",
  "domain",
  "industry",
  "employee_count",
  "hq_country",
  "annual_revenue_usd",
  "funding_stage",
  "tech_stack",
  "hiring_signals",
  "founded_year",
] as const satisfies readonly CompanyField[];

/** Every value a company field can hold, which is what operators receive. */
export type FieldValue = string | number | string[] | null;

export const OPERATORS = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gte",
  "lte",
  "between",
  "contains_any",
  "contains_all",
] as const;

export type Operator = (typeof OPERATORS)[number];

/**
 * Operator paired with the value shape it accepts.
 *
 * Modelled as a discriminated union rather than `value: unknown` so the engine
 * gets an exhaustive switch and a malformed pairing — `between` with a single
 * number, `gte` with a string — cannot typecheck.
 */
export type Rule =
  | { operator: "equals" | "not_equals"; value: string | number }
  | { operator: "in" | "not_in"; value: (string | number)[] }
  | { operator: "gte" | "lte"; value: number }
  | { operator: "between"; value: [number, number] }
  | { operator: "contains_any" | "contains_all"; value: string[] };

/** A weighted, positive signal. Contributes to the score when it matches. */
export type Criterion = Rule & {
  id: string;
  /** Human-readable, shown verbatim in the breakdown UI. */
  label: string;
  field: CompanyField;
  /** Relative, >= 0. Only the ratio to the other weights matters. */
  weight: number;
};

/**
 * A hard exclusion. Not a large negative weight — a triggered disqualifier
 * forces the score to 0 regardless of how many criteria matched.
 */
export type Disqualifier = Rule & {
  id: string;
  field: CompanyField;
  /** Surfaced verbatim to the user when triggered. */
  reason: string;
};

export type IcpDefinition = {
  name: string;
  criteria: Criterion[];
  disqualifiers: Disqualifier[];
};

export type CriterionEvaluation = {
  criterionId: string;
  label: string;
  matched: boolean;
  weight: number;
  /** Equal to `weight` when matched, 0 otherwise. */
  contribution: number;
  /** The concrete comparison, e.g. `"employee_count 240 >= 100"`. Never empty. */
  detail: string;
};

export type DisqualifierEvaluation = {
  disqualifierId: string;
  triggered: boolean;
  reason: string;
  detail: string;
};

export type ScoredAccount = {
  company: Company;
  /** Integer 0–100. Forced to 0 when disqualified. */
  score: number;
  disqualified: boolean;
  /**
   * Populated even when disqualified — the breakdown shows what *would* have
   * matched alongside the disqualifying reason.
   */
  criteria: CriterionEvaluation[];
  disqualifiers: DisqualifierEvaluation[];
};
