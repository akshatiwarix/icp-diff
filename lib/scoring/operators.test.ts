import { describe, expect, test } from "vitest";

import { describeRule, evaluateRule, formatFieldValue, getFieldValue } from "./operators";
import { OPERATORS, type Company, type CompanyField, type Rule } from "./types";

const base: Company = {
  id: "t001",
  name: "Testbed Systems",
  domain: "testbed.example",
  industry: "Software",
  employee_count: 480,
  hq_country: "US",
  annual_revenue_usd: 42000000,
  funding_stage: "series_b",
  tech_stack: ["aws", "kubernetes", "salesforce"],
  hiring_signals: ["hiring_sales"],
  founded_year: 2016,
};

function company(overrides: Partial<Company> = {}): Company {
  return { ...base, ...overrides };
}

/** Evaluate a rule against a field of a company, the way the engine will. */
function check(field: CompanyField, rule: Rule, overrides: Partial<Company> = {}) {
  const c = company(overrides);
  return evaluateRule(field, getFieldValue(c, field), rule);
}

describe("equals / not_equals", () => {
  test("equals matches an identical string", () => {
    const result = check("funding_stage", { operator: "equals", value: "series_b" });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe('funding_stage "series_b" == "series_b"');
  });

  test("equals does not match a different string", () => {
    const result = check("funding_stage", { operator: "equals", value: "public" });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe('funding_stage "series_b" != "public"');
  });

  test("not_equals is the exact inverse", () => {
    expect(check("funding_stage", { operator: "not_equals", value: "public" }).matched).toBe(true);
    expect(check("funding_stage", { operator: "not_equals", value: "series_b" }).matched).toBe(false);
  });

  test("equals matches numbers", () => {
    expect(check("employee_count", { operator: "equals", value: 480 }).matched).toBe(true);
  });

  test("a number field and a string value are not comparable", () => {
    const result = check("employee_count", { operator: "equals", value: "480" });
    expect(result.matched).toBe(false);
    expect(result.detail).toContain("cannot apply");
  });

  test("equals cannot apply to a list field", () => {
    const result = check("tech_stack", { operator: "equals", value: "aws" });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe(
      'tech_stack holds a list ("aws", "kubernetes", "salesforce"), so equal to "aws" cannot apply',
    );
  });
});

describe("in / not_in", () => {
  test("in matches when the value is present", () => {
    const result = check("hq_country", { operator: "in", value: ["US", "CA"] });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe('hq_country "US" is one of "US", "CA"');
  });

  test("in does not match when the value is absent", () => {
    const result = check("hq_country", { operator: "in", value: ["GB", "DE"] });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe('hq_country "US" is not one of "GB", "DE"');
  });

  test("not_in is the exact inverse", () => {
    expect(check("hq_country", { operator: "not_in", value: ["CN", "RU"] }).matched).toBe(true);
    expect(check("hq_country", { operator: "not_in", value: ["US"] }).matched).toBe(false);
  });

  test("an empty list never matches, for in or not_in", () => {
    // not_in with an empty list excludes nothing, which arithmetic would call a
    // match. Awarding weight for an unconfigured criterion is worse than a false
    // negative, so both directions report the misconfiguration instead.
    const inResult = check("hq_country", { operator: "in", value: [] });
    const notInResult = check("hq_country", { operator: "not_in", value: [] });
    expect(inResult.matched).toBe(false);
    expect(notInResult.matched).toBe(false);
    expect(notInResult.detail).toContain("empty list");
  });

  test("long lists are summarised rather than dumped", () => {
    const result = check("industry", {
      operator: "in",
      value: ["Fintech", "Retail", "Energy", "Media", "Gaming", "Biotech"],
    });
    expect(result.detail).toContain("+2 more");
  });

  test("in cannot apply to a list field", () => {
    expect(check("tech_stack", { operator: "in", value: ["aws"] }).matched).toBe(false);
  });
});

describe("gte / lte", () => {
  test("gte matches above the threshold", () => {
    const result = check("employee_count", { operator: "gte", value: 100 });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe("employee_count 480 >= 100");
  });

  test("gte matches at exact equality", () => {
    const result = check("employee_count", { operator: "gte", value: 480 });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe("employee_count 480 >= 480");
  });

  test("gte does not match below the threshold, and the detail flips the sign", () => {
    const result = check("employee_count", { operator: "gte", value: 1000 });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe("employee_count 480 < 1,000");
  });

  test("lte matches at exact equality", () => {
    expect(check("employee_count", { operator: "lte", value: 480 }).matched).toBe(true);
  });

  test("lte does not match above the threshold", () => {
    const result = check("employee_count", { operator: "lte", value: 200 });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe("employee_count 480 > 200");
  });

  test("zero is a real threshold, not a falsy one", () => {
    expect(check("employee_count", { operator: "gte", value: 0 }).matched).toBe(true);
    expect(
      check("employee_count", { operator: "lte", value: 0 }, { employee_count: 0 }).matched,
    ).toBe(true);
  });

  test("gte cannot apply to a text field", () => {
    const result = check("industry", { operator: "gte", value: 100 });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe('industry holds text ("Software"), so >= 100 cannot apply');
  });

  test("large numbers are grouped for readability", () => {
    const result = check("annual_revenue_usd", { operator: "gte", value: 10000000 });
    expect(result.detail).toBe("annual_revenue_usd 42,000,000 >= 10,000,000");
  });
});

describe("between", () => {
  test("matches inside the range", () => {
    const result = check("employee_count", { operator: "between", value: [100, 2000] });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe("employee_count 480 is within 100–2,000");
  });

  test("is inclusive at the lower bound", () => {
    expect(
      check("employee_count", { operator: "between", value: [480, 2000] }).matched,
    ).toBe(true);
  });

  test("is inclusive at the upper bound", () => {
    expect(check("employee_count", { operator: "between", value: [100, 480] }).matched).toBe(true);
  });

  test("says which side of the range it fell on", () => {
    expect(check("employee_count", { operator: "between", value: [500, 2000] }).detail).toBe(
      "employee_count 480 is below 500",
    );
    expect(check("employee_count", { operator: "between", value: [10, 100] }).detail).toBe(
      "employee_count 480 is above 100",
    );
  });

  test("a single-point range matches only that point", () => {
    expect(check("employee_count", { operator: "between", value: [480, 480] }).matched).toBe(true);
    expect(check("employee_count", { operator: "between", value: [481, 481] }).matched).toBe(false);
  });
});

describe("contains_any / contains_all", () => {
  test("contains_any matches on one overlap and names the hit", () => {
    const result = check("tech_stack", {
      operator: "contains_any",
      value: ["gcp", "aws", "azure"],
    });
    expect(result.matched).toBe(true);
    expect(result.detail).toBe('tech_stack contains "aws"');
  });

  test("contains_any reports what the company actually holds when nothing overlaps", () => {
    const result = check("tech_stack", { operator: "contains_any", value: ["sap", "netsuite"] });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe(
      'tech_stack contains none of "sap", "netsuite" (holds "aws", "kubernetes", "salesforce")',
    );
  });

  test("contains_all needs every entry", () => {
    expect(
      check("tech_stack", { operator: "contains_all", value: ["aws", "kubernetes"] }).matched,
    ).toBe(true);
  });

  test("contains_all names only the missing entries on a partial match", () => {
    const result = check("tech_stack", {
      operator: "contains_all",
      value: ["aws", "snowflake", "dbt"],
    });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe(
      'tech_stack is missing "snowflake", "dbt" (holds "aws", "kubernetes", "salesforce")',
    );
  });

  test("an empty value list never matches, in either direction", () => {
    // contains_all over an empty list is vacuously true in set theory. Here it
    // would silently award weight for a criterion that specifies nothing, so it
    // reports the misconfiguration instead.
    const any = check("tech_stack", { operator: "contains_any", value: [] });
    const all = check("tech_stack", { operator: "contains_all", value: [] });
    expect(any.matched).toBe(false);
    expect(all.matched).toBe(false);
    expect(all.detail).toContain("empty list");
  });

  test("an empty field list is not a match, and is distinguished from missing", () => {
    const result = check(
      "tech_stack",
      { operator: "contains_any", value: ["aws"] },
      { tech_stack: [] },
    );
    expect(result.matched).toBe(false);
    expect(result.detail).toBe('tech_stack contains none of "aws" (holds (empty))');
    expect(result.detail).not.toContain("missing");
  });

  test("contains_any cannot apply to a scalar field", () => {
    const result = check("industry", { operator: "contains_any", value: ["Software"] });
    expect(result.matched).toBe(false);
    expect(result.detail).toBe(
      'industry holds text ("Software"), so any of "Software" cannot apply',
    );
  });
});

describe("null fields", () => {
  const rules: Rule[] = [
    { operator: "equals", value: "US" },
    { operator: "not_equals", value: "US" },
    { operator: "in", value: ["US", "CA"] },
    { operator: "not_in", value: ["CN"] },
    { operator: "gte", value: 1 },
    { operator: "lte", value: 1 },
    { operator: "between", value: [1, 2] },
    { operator: "contains_any", value: ["aws"] },
    { operator: "contains_all", value: ["aws"] },
  ];

  test("a null field never matches, whatever the operator", () => {
    for (const rule of rules) {
      const result = check("hq_country", rule, { hq_country: null });
      expect(result.matched, rule.operator).toBe(false);
    }
  });

  test("negations do not match on null either", () => {
    // "We don't know this company's country" is not evidence that it is outside
    // China. A negated criterion is still a claim, and absent data cannot support it.
    expect(check("hq_country", { operator: "not_in", value: ["CN"] }, { hq_country: null }).matched)
      .toBe(false);
    expect(
      check("hq_country", { operator: "not_equals", value: "CN" }, { hq_country: null }).matched,
    ).toBe(false);
  });

  test("the detail says the field is missing rather than reporting a comparison", () => {
    const result = check(
      "annual_revenue_usd",
      { operator: "gte", value: 10000000 },
      { annual_revenue_usd: null },
    );
    expect(result.detail).toBe(
      "annual_revenue_usd is missing, so it cannot match >= 10,000,000",
    );
  });

  test("every nullable field is handled", () => {
    const nullable = [
      ["industry", { operator: "in", value: ["Software"] }],
      ["hq_country", { operator: "in", value: ["US"] }],
      ["annual_revenue_usd", { operator: "gte", value: 1 }],
      ["founded_year", { operator: "gte", value: 2019 }],
    ] as const satisfies readonly (readonly [CompanyField, Rule])[];

    for (const [field, rule] of nullable) {
      const result = check(field, rule, { [field]: null });
      expect(result.matched, field).toBe(false);
      expect(result.detail, field).toContain("is missing");
    }
  });
});

describe("details are always populated", () => {
  const oneRulePerOperator: Rule[] = [
    { operator: "equals", value: "Software" },
    { operator: "not_equals", value: "Software" },
    { operator: "in", value: ["Software"] },
    { operator: "not_in", value: ["Software"] },
    { operator: "gte", value: 100 },
    { operator: "lte", value: 100 },
    { operator: "between", value: [100, 200] },
    { operator: "contains_any", value: ["aws"] },
    { operator: "contains_all", value: ["aws"] },
  ];

  test("the fixture covers all nine operators", () => {
    expect(new Set(oneRulePerOperator.map((r) => r.operator)).size).toBe(OPERATORS.length);
  });

  test("no operator/field combination yields an empty detail", () => {
    const fields: CompanyField[] = [
      "industry",
      "employee_count",
      "tech_stack",
      "annual_revenue_usd",
      "founded_year",
    ];
    for (const field of fields) {
      for (const rule of oneRulePerOperator) {
        for (const c of [company(), company({ [field]: null })]) {
          const result = evaluateRule(field, getFieldValue(c, field), rule);
          expect(result.detail.length, `${field} ${rule.operator}`).toBeGreaterThan(0);
          expect(result.detail, `${field} ${rule.operator}`).toContain(field);
        }
      }
    }
  });

  test("describeRule produces a phrase for every operator", () => {
    for (const rule of oneRulePerOperator) {
      expect(describeRule(rule).length, rule.operator).toBeGreaterThan(0);
    }
  });
});

describe("formatting helpers", () => {
  test("null renders as missing, not as null or empty string", () => {
    expect(formatFieldValue(null)).toBe("missing");
  });

  test("an empty list is distinguishable from a missing one", () => {
    expect(formatFieldValue([])).toBe("(empty)");
  });

  test("numbers are grouped, strings are quoted", () => {
    expect(formatFieldValue(42000000)).toBe("42,000,000");
    expect(formatFieldValue("US")).toBe('"US"');
  });

  test("getFieldValue reads through to the company record", () => {
    expect(getFieldValue(company(), "employee_count")).toBe(480);
    expect(getFieldValue(company({ founded_year: null }), "founded_year")).toBeNull();
  });
});
