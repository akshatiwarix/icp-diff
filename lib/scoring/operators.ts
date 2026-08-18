/**
 * The nine operators, and the `detail` strings that make a score explainable.
 *
 * Every branch returns a concrete comparison — `"employee_count 480 >= 100"`,
 * not `"matched"`. The breakdown UI renders these verbatim, so an empty or vague
 * detail is a product bug, not a cosmetic one.
 *
 * Three rules hold across every operator:
 *
 * 1. **A null field never matches.** Not for `not_equals`, not for `not_in` —
 *    "we don't know" is not evidence of a fit, and awarding weight for absent
 *    data is how a scoring tool starts lying. The detail says the field is
 *    missing rather than reporting a comparison that never happened.
 * 2. **An empty value list never matches.** `in: []` selects nothing, and
 *    `not_in: []` excludes nothing — treating the latter as a match would hand
 *    out weight for an unconfigured criterion.
 * 3. **A type the operator cannot handle never matches.** `gte` against a text
 *    field, `contains_any` against a scalar. Zod permits these pairings because
 *    the field name is chosen independently of the operator; the engine reports
 *    them instead of coercing.
 */

import type { Company, CompanyField, FieldValue, Rule } from "./types";

export type RuleEvaluation = {
  matched: boolean;
  /** The concrete comparison, for display. Never empty. */
  detail: string;
};

/** How many list entries a detail string shows before summarising the rest. */
const LIST_PREVIEW_LIMIT = 4;

function formatNumber(value: number): string {
  // Pinned to en-US so details are identical across machines and in snapshots.
  return new Intl.NumberFormat("en-US").format(value);
}

function formatScalar(value: string | number): string {
  return typeof value === "number" ? formatNumber(value) : JSON.stringify(value);
}

function formatList(values: readonly (string | number)[]): string {
  if (values.length === 0) return "(nothing)";
  const shown = values.slice(0, LIST_PREVIEW_LIMIT).map(formatScalar);
  const remaining = values.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}

/** A field value rendered for display. `null` becomes the word "missing". */
export function formatFieldValue(value: FieldValue): string {
  if (value === null) return "missing";
  if (Array.isArray(value)) return value.length === 0 ? "(empty)" : formatList(value);
  return formatScalar(value);
}

/** The rule as a human phrase, e.g. `">= 10,000,000"` or `"one of US, CA"`. */
export function describeRule(rule: Rule): string {
  switch (rule.operator) {
    case "equals":
      return `equal to ${formatScalar(rule.value)}`;
    case "not_equals":
      return `anything other than ${formatScalar(rule.value)}`;
    case "in":
      return `one of ${formatList(rule.value)}`;
    case "not_in":
      return `none of ${formatList(rule.value)}`;
    case "gte":
      return `>= ${formatNumber(rule.value)}`;
    case "lte":
      return `<= ${formatNumber(rule.value)}`;
    case "between":
      return `within ${formatNumber(rule.value[0])}–${formatNumber(rule.value[1])}`;
    case "contains_any":
      return `any of ${formatList(rule.value)}`;
    case "contains_all":
      return `all of ${formatList(rule.value)}`;
  }
}

export function getFieldValue(company: Company, field: CompanyField): FieldValue {
  return company[field];
}

function typeName(value: string | number | string[]): string {
  if (Array.isArray(value)) return "a list";
  return typeof value === "number" ? "a number" : "text";
}

function missingField(field: CompanyField, rule: Rule): RuleEvaluation {
  return {
    matched: false,
    detail: `${field} is missing, so it cannot match ${describeRule(rule)}`,
  };
}

function notApplicable(
  field: CompanyField,
  value: string | number | string[],
  rule: Rule,
): RuleEvaluation {
  return {
    matched: false,
    detail: `${field} holds ${typeName(value)} (${formatFieldValue(value)}), so ${describeRule(rule)} cannot apply`,
  };
}

function unconfigured(field: CompanyField, rule: Rule): RuleEvaluation {
  return {
    matched: false,
    detail: `${field} cannot match ${describeRule(rule)} — ${rule.operator} was given an empty list, which selects nothing`,
  };
}

/**
 * Evaluate one rule against one field value.
 *
 * Shared by criteria and disqualifiers: a disqualifier is the same comparison
 * read with the opposite intent, so there is exactly one implementation of
 * "does this company satisfy this condition" in the codebase.
 */
export function evaluateRule(field: CompanyField, value: FieldValue, rule: Rule): RuleEvaluation {
  if (value === null) return missingField(field, rule);

  switch (rule.operator) {
    case "equals":
    case "not_equals": {
      if (Array.isArray(value)) return notApplicable(field, value, rule);
      if (typeof value !== typeof rule.value) return notApplicable(field, value, rule);
      const equal = value === rule.value;
      const matched = rule.operator === "equals" ? equal : !equal;
      const comparison = equal ? "==" : "!=";
      return {
        matched,
        detail: `${field} ${formatScalar(value)} ${comparison} ${formatScalar(rule.value)}`,
      };
    }

    case "in":
    case "not_in": {
      if (Array.isArray(value)) return notApplicable(field, value, rule);
      if (rule.value.length === 0) return unconfigured(field, rule);
      const present = rule.value.includes(value);
      const matched = rule.operator === "in" ? present : !present;
      return {
        matched,
        detail: present
          ? `${field} ${formatScalar(value)} is one of ${formatList(rule.value)}`
          : `${field} ${formatScalar(value)} is not one of ${formatList(rule.value)}`,
      };
    }

    case "gte": {
      if (typeof value !== "number") return notApplicable(field, value, rule);
      const matched = value >= rule.value;
      return {
        matched,
        detail: `${field} ${formatNumber(value)} ${matched ? ">=" : "<"} ${formatNumber(rule.value)}`,
      };
    }

    case "lte": {
      if (typeof value !== "number") return notApplicable(field, value, rule);
      const matched = value <= rule.value;
      return {
        matched,
        detail: `${field} ${formatNumber(value)} ${matched ? "<=" : ">"} ${formatNumber(rule.value)}`,
      };
    }

    case "between": {
      if (typeof value !== "number") return notApplicable(field, value, rule);
      const [min, max] = rule.value;
      if (value < min) {
        return {
          matched: false,
          detail: `${field} ${formatNumber(value)} is below ${formatNumber(min)}`,
        };
      }
      if (value > max) {
        return {
          matched: false,
          detail: `${field} ${formatNumber(value)} is above ${formatNumber(max)}`,
        };
      }
      return {
        matched: true,
        detail: `${field} ${formatNumber(value)} is within ${formatNumber(min)}–${formatNumber(max)}`,
      };
    }

    case "contains_any": {
      if (!Array.isArray(value)) return notApplicable(field, value, rule);
      if (rule.value.length === 0) return unconfigured(field, rule);
      const hits = rule.value.filter((wanted) => value.includes(wanted));
      if (hits.length > 0) {
        return { matched: true, detail: `${field} contains ${formatList(hits)}` };
      }
      return {
        matched: false,
        detail: `${field} contains none of ${formatList(rule.value)} (holds ${formatFieldValue(value)})`,
      };
    }

    case "contains_all": {
      if (!Array.isArray(value)) return notApplicable(field, value, rule);
      if (rule.value.length === 0) return unconfigured(field, rule);
      const absent = rule.value.filter((wanted) => !value.includes(wanted));
      if (absent.length === 0) {
        return { matched: true, detail: `${field} contains all of ${formatList(rule.value)}` };
      }
      return {
        matched: false,
        detail: `${field} is missing ${formatList(absent)} (holds ${formatFieldValue(value)})`,
      };
    }
  }
}
