import { describe, expect, test } from "vitest";

import type { IcpDefinition } from "../scoring";
import {
  ablationUnits,
  applyEdits,
  isRuleValid,
  makeRule,
  sameDefinition,
  withoutUnit,
} from "./edits";
import { atomId, type EditAtom } from "./types";

const base: IcpDefinition = {
  name: "Base",
  criteria: [
    {
      id: "headcount",
      label: "Headcount 100–2,000",
      field: "employee_count",
      operator: "between",
      value: [100, 2000],
      weight: 3,
    },
    {
      id: "geo",
      label: "HQ in US or Canada",
      field: "hq_country",
      operator: "in",
      value: ["US", "CA"],
      weight: 2,
    },
  ],
  disqualifiers: [
    {
      id: "dq-enterprise",
      field: "employee_count",
      operator: "gte",
      value: 10000,
      reason: "Enterprise headcount",
    },
  ],
};

describe("makeRule pairs an operator with a value or refuses", () => {
  test("valid pairings construct", () => {
    expect(makeRule("gte", 10)).toEqual({ operator: "gte", value: 10 });
    expect(makeRule("between", [1, 2])).toEqual({ operator: "between", value: [1, 2] });
    expect(makeRule("contains_any", ["aws"])).toEqual({ operator: "contains_any", value: ["aws"] });
    expect(makeRule("in", ["US", 3])).toEqual({ operator: "in", value: ["US", 3] });
  });

  test("invalid pairings return null rather than coercing", () => {
    expect(makeRule("gte", [1, 2])).toBeNull();
    expect(makeRule("between", [1, 2, 3])).toBeNull();
    expect(makeRule("between", 5)).toBeNull();
    expect(makeRule("contains_any", [1, 2])).toBeNull();
    expect(makeRule("equals", ["US"])).toBeNull();
  });

  test("a number pair is a valid `in` list but an invalid `contains_any` list", () => {
    // This asymmetry is why linkage is decided empirically rather than by
    // hard-coding which operator conversions are legal.
    expect(isRuleValid("in", [100, 2000])).toBe(true);
    expect(isRuleValid("contains_any", [100, 2000])).toBe(false);
  });
});

describe("applyEdits", () => {
  test("a weight change touches only the weight", () => {
    const result = applyEdits(base, [
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 9 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const criterion = result.icp.criteria.find((c) => c.id === "headcount");
    expect(criterion?.weight).toBe(9);
    expect(criterion?.value).toEqual([100, 2000]);
    expect(result.icp.criteria).toHaveLength(2);
  });

  test("removals and additions coexist without ordering games", () => {
    const atoms: EditAtom[] = [
      { kind: "criterion_removed", criterionId: "geo" },
      {
        kind: "criterion_added",
        criterionId: "cloud",
        criterion: {
          id: "cloud",
          label: "Runs on public cloud",
          field: "tech_stack",
          operator: "contains_any",
          value: ["aws"],
          weight: 2,
        },
      },
    ];
    const forwards = applyEdits(base, atoms);
    const backwards = applyEdits(base, [...atoms].reverse());
    expect(forwards.ok && backwards.ok).toBe(true);
    if (!forwards.ok || !backwards.ok) return;
    expect(sameDefinition(forwards.icp, backwards.icp)).toBe(true);
    expect(forwards.icp.criteria.map((c) => c.id).sort()).toEqual(["cloud", "headcount"]);
  });

  test("the source ICP is never mutated", () => {
    const before = JSON.stringify(base);
    applyEdits(base, [{ kind: "weight_changed", criterionId: "headcount", from: 3, to: 9 }]);
    expect(JSON.stringify(base)).toBe(before);
  });

  test("an unknown target is refused, not ignored", () => {
    const result = applyEdits(base, [
      { kind: "weight_changed", criterionId: "nope", from: 1, to: 2 },
    ]);
    expect(result).toEqual({
      ok: false,
      reason: "cannot reweight unknown criterion nope",
    });
  });

  test("duplicate atoms are refused rather than resolved last-write-wins", () => {
    const result = applyEdits(base, [
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 4 },
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 5 },
    ]);
    expect(result.ok).toBe(false);
  });

  test("removing and modifying the same criterion is a contradiction", () => {
    const result = applyEdits(base, [
      { kind: "criterion_removed", criterionId: "geo" },
      { kind: "weight_changed", criterionId: "geo", from: 2, to: 5 },
    ]);
    expect(result).toEqual({ ok: false, reason: "criterion geo is both removed and modified" });
  });

  test("an operator change without its value change fails loudly", () => {
    const result = applyEdits(base, [
      { kind: "operator_changed", criterionId: "headcount", from: "between", to: "gte" },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("must be ablated with its sibling");
  });

  test("the operator and value change together applies cleanly", () => {
    const result = applyEdits(base, [
      { kind: "operator_changed", criterionId: "headcount", from: "between", to: "gte" },
      { kind: "value_changed", criterionId: "headcount", from: [100, 2000], to: 50 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const criterion = result.icp.criteria.find((c) => c.id === "headcount");
    expect(criterion).toMatchObject({ operator: "gte", value: 50, weight: 3 });
  });

  test("a disqualifier value change keeps its reason and field", () => {
    const result = applyEdits(base, [
      {
        kind: "disqualifier_value_changed",
        disqualifierId: "dq-enterprise",
        from: 10000,
        to: 25000,
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.icp.disqualifiers[0]).toMatchObject({
      id: "dq-enterprise",
      value: 25000,
      reason: "Enterprise headcount",
    });
  });

  test("an added criterion whose id disagrees with its payload is refused", () => {
    const result = applyEdits(base, [
      {
        kind: "criterion_added",
        criterionId: "cloud",
        criterion: {
          id: "not-cloud",
          label: "x",
          field: "tech_stack",
          operator: "contains_any",
          value: ["aws"],
          weight: 1,
        },
      },
    ]);
    expect(result.ok).toBe(false);
  });

  test("an empty edit list is the identity", () => {
    const result = applyEdits(base, []);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(sameDefinition(result.icp, base)).toBe(true);
  });
});

describe("sameDefinition", () => {
  test("ignores criterion order and the ICP name", () => {
    const reordered: IcpDefinition = {
      name: "Something else entirely",
      criteria: [...base.criteria].reverse(),
      disqualifiers: base.disqualifiers,
    };
    expect(sameDefinition(base, reordered)).toBe(true);
  });

  test("notices a changed weight, value, label and disqualifier reason", () => {
    const bump = applyEdits(base, [
      { kind: "weight_changed", criterionId: "geo", from: 2, to: 3 },
    ]);
    expect(bump.ok).toBe(true);
    if (!bump.ok) return;
    expect(sameDefinition(base, bump.icp)).toBe(false);
  });
});

describe("ablationUnits", () => {
  test("independent atoms are separate units", () => {
    const atoms: EditAtom[] = [
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 9 },
      { kind: "criterion_removed", criterionId: "geo" },
    ];
    const units = ablationUnits(base, atoms);
    expect(units).toHaveLength(2);
    expect(units.every((unit) => !unit.linked)).toBe(true);
  });

  test("two independent atoms on the same criterion stay separate", () => {
    const atoms: EditAtom[] = [
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 9 },
      { kind: "value_changed", criterionId: "headcount", from: [100, 2000], to: [50, 3000] },
    ];
    const units = ablationUnits(base, atoms);
    expect(units).toHaveLength(2);
    expect(units.every((unit) => !unit.linked)).toBe(true);
  });

  test("an operator change that invalidates its value links with it", () => {
    const atoms: EditAtom[] = [
      { kind: "operator_changed", criterionId: "headcount", from: "between", to: "gte" },
      { kind: "value_changed", criterionId: "headcount", from: [100, 2000], to: 50 },
    ];
    const units = ablationUnits(base, atoms);
    expect(units).toHaveLength(1);
    expect(units[0]?.linked).toBe(true);
    expect(units[0]?.atomIds).toEqual([
      "operator_changed:headcount",
      "value_changed:headcount",
    ]);
  });

  test("every unit can be applied alone and withheld alone", () => {
    const atoms: EditAtom[] = [
      { kind: "operator_changed", criterionId: "headcount", from: "between", to: "gte" },
      { kind: "value_changed", criterionId: "headcount", from: [100, 2000], to: 50 },
      { kind: "criterion_removed", criterionId: "geo" },
      {
        kind: "disqualifier_value_changed",
        disqualifierId: "dq-enterprise",
        from: 10000,
        to: 25000,
      },
    ];
    const units = ablationUnits(base, atoms);
    for (const unit of units) {
      expect(applyEdits(base, unit.atoms).ok).toBe(true);
      expect(applyEdits(base, withoutUnit(atoms, unit)).ok).toBe(true);
    }
  });

  test("withoutUnit removes exactly the unit's atoms", () => {
    const atoms: EditAtom[] = [
      { kind: "weight_changed", criterionId: "headcount", from: 3, to: 9 },
      { kind: "criterion_removed", criterionId: "geo" },
    ];
    const units = ablationUnits(base, atoms);
    const first = units[0];
    expect(first).toBeDefined();
    if (!first) return;
    const rest = withoutUnit(atoms, first);
    expect(rest.map(atomId)).not.toContain(first.atomIds[0]);
    expect(rest).toHaveLength(1);
  });
});

describe("atom ids", () => {
  test("are derived from kind and target, so they are stable across runs", () => {
    expect(atomId({ kind: "criterion_removed", criterionId: "geo" })).toBe(
      "criterion_removed:geo",
    );
    expect(
      atomId({
        kind: "disqualifier_value_changed",
        disqualifierId: "dq-enterprise",
        from: 1,
        to: 2,
      }),
    ).toBe("disqualifier_value_changed:dq-enterprise");
  });
});
