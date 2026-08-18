import { describe, expect, test } from "vitest";

import { midMarketSaas } from "@/data/presets";
import { partitionAtoms } from "@/data/schema";
import { applyEdits } from "@/lib/diff";

import { assembleBatch, assembleEdit, valueFor, type WireEdit } from "./wire";

/**
 * The assembler, which is where a model's output stops being text.
 *
 * Every test here is about a way the model can be wrong. None of them are about
 * the model being right — that path is one line and it is exercised by the route.
 */

function wire(partial: Partial<WireEdit>): WireEdit {
  return {
    kind: "weight_changed",
    targetId: "",
    label: "",
    field: "employee_count",
    operator: "gte",
    numbers: [],
    strings: [],
    weight: 0,
    reason: "",
    ...partial,
  };
}

describe("valueFor narrows the two operand arrays", () => {
  test("between needs exactly two numbers", () => {
    expect(valueFor("between", wire({ numbers: [50, 3000] }))).toEqual([50, 3000]);
    expect(valueFor("between", wire({ numbers: [50] }))).toBeNull();
    expect(valueFor("between", wire({ numbers: [50, 100, 200] }))).toBeNull();
  });

  test("a reversed range is ordered rather than refused", () => {
    // The instruction "between 3,000 and 50" is unambiguous about intent and
    // ambiguous only about order. Refusing it would be pedantry; padding a missing
    // bound would be invention. These are different cases.
    expect(valueFor("between", wire({ numbers: [3000, 50] }))).toEqual([50, 3000]);
  });

  test("list operators take the strings and scalar operators take one", () => {
    expect(valueFor("contains_any", wire({ strings: ["aws", "gcp"] }))).toEqual(["aws", "gcp"]);
    expect(valueFor("contains_any", wire({ numbers: [1] }))).toBeNull();
    expect(valueFor("equals", wire({ strings: ["Software"] }))).toBe("Software");
    expect(valueFor("equals", wire({ strings: ["a", "b"] }))).toBeNull();
    expect(valueFor("gte", wire({ numbers: [10] }))).toBe(10);
    expect(valueFor("gte", wire({ numbers: [] }))).toBeNull();
  });

  test("in accepts a mix, because a field can hold either", () => {
    expect(valueFor("in", wire({ strings: ["US"], numbers: [2024] }))).toEqual(["US", 2024]);
  });
});

describe("assembleEdit reads `from` out of the ICP, never from the model", () => {
  test("a weight change carries the ICP's current weight even if the model guesses", () => {
    const result = assembleEdit(
      wire({ kind: "weight_changed", targetId: "gtm-hiring", weight: 9 }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.atom).toEqual({
      kind: "weight_changed",
      criterionId: "gtm-hiring",
      from: 3, // the real current weight
      to: 9,
    });
  });

  test("a value change carries the ICP's current value", () => {
    const result = assembleEdit(
      wire({ kind: "value_changed", targetId: "headcount", numbers: [50, 3000], operator: "between" }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.atom).toMatchObject({
      kind: "value_changed",
      criterionId: "headcount",
      from: [100, 2000],
      to: [50, 3000],
    });
  });

  test("a value change narrows against its sibling operator change, not its own field", () => {
    // The model is switching `revenue` from gte to between in the same breath, so
    // the operands must be read as a range and not as a single gte bound. Only the
    // batch knows that.
    const { atoms, rejected } = assembleBatch(
      [
        wire({ kind: "operator_changed", targetId: "revenue", operator: "between" }),
        wire({ kind: "value_changed", targetId: "revenue", operator: "between", numbers: [5000000, 500000000] }),
      ],
      midMarketSaas,
    );
    expect(rejected).toEqual([]);
    expect(atoms[1]).toMatchObject({ kind: "value_changed", to: [5000000, 500000000] });
  });

  test("a value change ignores the entry's own operator field when nothing is changing it", () => {
    // `operator` is required on every entry, so the model fills it even when it is
    // meaningless. Honouring it here would read `[100, 2000]` as a `gte` bound and
    // quietly turn a range into a floor.
    const { atoms, rejected } = assembleBatch(
      [wire({ kind: "value_changed", targetId: "headcount", operator: "gte", numbers: [50, 3000] })],
      midMarketSaas,
    );
    expect(rejected).toEqual([]);
    expect(atoms[0]).toMatchObject({ kind: "value_changed", from: [100, 2000], to: [50, 3000] });
  });
});

describe("assembleEdit rejects, with a reason, rather than dropping", () => {
  test("an unknown criterion id", () => {
    const result = assembleEdit(wire({ kind: "criterion_removed", targetId: "nope" }), midMarketSaas, 0);
    expect(result).toEqual({
      ok: false,
      reason: 'no criterion "nope" in Mid-market B2B SaaS (North America)',
    });
  });

  test("a kind outside the eight", () => {
    const result = assembleEdit(wire({ kind: "criterion_modified", targetId: "headcount" }), midMarketSaas, 0);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not one of the eight edit kinds");
  });

  test("operands that cannot make a value", () => {
    // One number where the criterion's `between` needs two. The entry's own
    // `operator: "gte"` is deliberately not consulted, so this cannot be rescued
    // by reading the range as a floor.
    const { atoms, rejected } = assembleBatch(
      [wire({ kind: "value_changed", targetId: "headcount", numbers: [100] })],
      midMarketSaas,
    );
    expect(atoms).toEqual([]);
    expect(rejected[0]?.reason).toContain("needs operands it did not get");
  });

  test("an added criterion with no label", () => {
    const result = assembleEdit(
      wire({
        kind: "criterion_added",
        targetId: "security",
        field: "hiring_signals",
        operator: "contains_any",
        strings: ["hiring_security"],
        weight: 2,
      }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("needs a label");
  });

  test("an added disqualifier with no reason", () => {
    const result = assembleEdit(
      wire({
        kind: "disqualifier_added",
        targetId: "dq-x",
        field: "hq_country",
        operator: "in",
        strings: ["KP"],
      }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("needs a reason");
  });

  test("an addition that collides with an existing id", () => {
    const result = assembleEdit(
      wire({
        kind: "criterion_added",
        targetId: "headcount",
        label: "Headcount again",
        field: "employee_count",
        operator: "between",
        numbers: [1, 10],
      }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("already exists");
  });
});

describe("assembleEdit derives an id when the model does not supply one", () => {
  test("from the label, kebab-cased", () => {
    const result = assembleEdit(
      wire({
        kind: "criterion_added",
        targetId: "",
        label: "Hiring for security ownership",
        field: "hiring_signals",
        operator: "contains_any",
        strings: ["hiring_security"],
        weight: 2,
      }),
      midMarketSaas,
      3,
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.atom.kind !== "criterion_added") return;
    expect(result.atom.criterionId).toBe("hiring-for-security-ownership");
  });
});

describe("assembled atoms survive the boundary they are handed to", () => {
  test("a plausible model batch assembles, passes legality, and applies", () => {
    const entries: WireEdit[] = [
      wire({ kind: "value_changed", targetId: "headcount", operator: "between", numbers: [50, 3000] }),
      wire({ kind: "weight_changed", targetId: "gtm-hiring", weight: 9 }),
      wire({ kind: "disqualifier_removed", targetId: "dq-budget" }),
      wire({
        kind: "criterion_added",
        targetId: "security-hiring",
        label: "Hiring for security ownership",
        field: "hiring_signals",
        operator: "contains_any",
        strings: ["hiring_security", "new_ciso"],
        weight: 2,
      }),
    ];

    const batch = assembleBatch(entries, midMarketSaas);
    expect(batch.rejected).toEqual([]);

    const { accepted, rejected } = partitionAtoms(batch.atoms, midMarketSaas);
    expect(rejected).toEqual([]);
    expect(accepted).toHaveLength(4);

    const applied = applyEdits(midMarketSaas, accepted);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.icp.criteria).toHaveLength(9);
    expect(applied.icp.disqualifiers).toHaveLength(3);
  });

  test("a no-op edit is caught by legality even though it assembles", () => {
    // The model is told the current weight is 3 and asks for 3. `assembleEdit`
    // builds it happily; `checkAtomLegality` is what notices it changes nothing,
    // and the user gets told rather than seeing a ledger row that does nothing.
    const result = assembleEdit(
      wire({ kind: "weight_changed", targetId: "gtm-hiring", weight: 3 }),
      midMarketSaas,
      0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { accepted, rejected } = partitionAtoms([result.atom], midMarketSaas);
    expect(accepted).toEqual([]);
    expect(rejected[0]?.reason).toContain("already 3");
  });
});
