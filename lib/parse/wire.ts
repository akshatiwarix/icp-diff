/**
 * The wire format the model fills, and the assembler that turns it into atoms.
 *
 * Gemini's `responseSchema` is an OpenAPI subset: no unions, no tuples, no
 * discriminated variants. `EditAtom` is all three. Asking for a single `value`
 * field whose type shifts by `kind` is how you end up with `"100"` where `100`
 * belongs, so the model fills a flat record with two always-present operand
 * arrays — `numbers` and `strings` — and deterministic code here narrows them
 * against the operator. The model supplies operands; the assembler decides types.
 *
 * Three rules make this safe:
 *
 * 1. **`from` is never taken from the model.** It is read out of ICP A. A model
 *    asked to restate the current weight will occasionally restate it wrong, and a
 *    wrong `from` is a ledger that misdescribes an edit it applied correctly.
 * 2. **An entry that cannot be assembled is rejected with a reason, individually.**
 *    Never dropped. A shorter list of edits than the user asked for, with no
 *    explanation, is worse than an error.
 * 3. **Nothing here reaches `lib/diff` unvalidated.** The assembled atoms still go
 *    through `editAtomSchema` and `checkAtomLegality` at the route boundary.
 */

import { OPERATORS, type Criterion, type Disqualifier, type IcpDefinition, type Operator } from "@/lib/scoring";
import { makeRule } from "@/lib/diff";
import type { EditAtom, RuleValue } from "@/lib/diff";
import { EDIT_ATOM_KINDS } from "@/lib/diff";

/** One entry as the model returns it. Every field is always present. */
export type WireEdit = {
  kind: string;
  targetId: string;
  label: string;
  field: string;
  operator: string;
  numbers: number[];
  strings: string[];
  weight: number;
  reason: string;
};

export type AssembledEdit = { ok: true; atom: EditAtom } | { ok: false; reason: string };

/**
 * Narrow the two operand arrays into the value an operator needs.
 *
 * The `between` case is the one worth reading: Gemini cannot express a
 * two-element tuple, so a range arrives as a two-entry `numbers` array and is
 * turned into `[min, max]` here. A range that arrives with one number, or three,
 * is refused rather than padded — guessing the missing bound would invent a
 * criterion the user never wrote.
 */
export function valueFor(operator: Operator, entry: WireEdit): RuleValue | null {
  const { numbers, strings } = entry;
  switch (operator) {
    case "equals":
    case "not_equals":
      if (strings.length === 1 && strings[0] !== undefined) return strings[0];
      if (numbers.length === 1 && numbers[0] !== undefined) return numbers[0];
      return null;
    case "in":
    case "not_in": {
      const combined: (string | number)[] = [...strings, ...numbers];
      return combined.length > 0 ? combined : null;
    }
    case "gte":
    case "lte":
      return numbers.length === 1 && numbers[0] !== undefined ? numbers[0] : null;
    case "between": {
      if (numbers.length !== 2) return null;
      const [min, max] = numbers;
      if (min === undefined || max === undefined) return null;
      return min <= max ? [min, max] : [max, min];
    }
    case "contains_any":
    case "contains_all":
      return strings.length > 0 ? strings : null;
  }
}

function isOperator(candidate: string): candidate is Operator {
  return (OPERATORS as readonly string[]).includes(candidate);
}

function isKind(candidate: string): candidate is EditAtom["kind"] {
  return (EDIT_ATOM_KINDS as readonly string[]).includes(candidate);
}

function findCriterion(icp: IcpDefinition, id: string): Criterion | undefined {
  return icp.criteria.find((criterion) => criterion.id === id);
}

function findDisqualifier(icp: IcpDefinition, id: string): Disqualifier | undefined {
  return icp.disqualifiers.find((disqualifier) => disqualifier.id === id);
}

/** A stable id for a criterion or disqualifier the model is adding. */
function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : fallback;
}

/**
 * Turn one wire entry into one atom against ICP A, or say why not.
 *
 * The `operator_changed` case reads the *new* operator from the entry and takes
 * the old one from A. If the operator change makes A's existing value invalid, the
 * model is expected to have emitted a `value_changed` entry too — and if it did
 * not, `applyEdits` refuses the pair at the boundary rather than here, because
 * that refusal is about the edit list as a whole and not about this entry.
 */
export function assembleEdit(
  entry: WireEdit,
  icp: IcpDefinition,
  index: number,
  /**
   * The operator this criterion will end up with, when a sibling
   * `operator_changed` entry in the same batch is changing it.
   *
   * `operator` is `required` in the response schema — an OpenAPI-subset schema
   * cannot make a field conditionally required — so the model fills it on *every*
   * entry, including a `value_changed` that is not changing the operator at all.
   * Trusting it there reads `[100, 2000]` under whatever the model happened to
   * put in the field, which silently narrows a range into a `gte` bound. So the
   * effective operator is resolved from the batch by `assembleBatch`, and this
   * parameter is the only channel for it.
   */
  operatorOverride?: Operator,
): AssembledEdit {
  if (!isKind(entry.kind)) {
    return { ok: false, reason: `"${entry.kind}" is not one of the eight edit kinds` };
  }

  switch (entry.kind) {
    case "criterion_removed": {
      const criterion = findCriterion(icp, entry.targetId);
      if (!criterion) return { ok: false, reason: `no criterion "${entry.targetId}" in ${icp.name}` };
      return { ok: true, atom: { kind: "criterion_removed", criterionId: criterion.id } };
    }

    case "disqualifier_removed": {
      const disqualifier = findDisqualifier(icp, entry.targetId);
      if (!disqualifier) {
        return { ok: false, reason: `no disqualifier "${entry.targetId}" in ${icp.name}` };
      }
      return { ok: true, atom: { kind: "disqualifier_removed", disqualifierId: disqualifier.id } };
    }

    case "weight_changed": {
      const criterion = findCriterion(icp, entry.targetId);
      if (!criterion) return { ok: false, reason: `no criterion "${entry.targetId}" in ${icp.name}` };
      if (!Number.isFinite(entry.weight) || entry.weight < 0) {
        return { ok: false, reason: `weight must be a number >= 0, got ${entry.weight}` };
      }
      return {
        ok: true,
        atom: {
          kind: "weight_changed",
          criterionId: criterion.id,
          // Read from A, not from the model.
          from: criterion.weight,
          to: entry.weight,
        },
      };
    }

    case "operator_changed": {
      const criterion = findCriterion(icp, entry.targetId);
      if (!criterion) return { ok: false, reason: `no criterion "${entry.targetId}" in ${icp.name}` };
      if (!isOperator(entry.operator)) {
        return { ok: false, reason: `"${entry.operator}" is not one of the nine operators` };
      }
      return {
        ok: true,
        atom: {
          kind: "operator_changed",
          criterionId: criterion.id,
          from: criterion.operator,
          to: entry.operator,
        },
      };
    }

    case "value_changed": {
      const criterion = findCriterion(icp, entry.targetId);
      if (!criterion) return { ok: false, reason: `no criterion "${entry.targetId}" in ${icp.name}` };
      // Narrowed against the operator the criterion will actually end up with:
      // the batch's `operator_changed` if there is one, otherwise A's. Never the
      // entry's own `operator` field — see `operatorOverride`.
      const operator = operatorOverride ?? criterion.operator;
      const value = valueFor(operator, entry);
      if (value === null) {
        return {
          ok: false,
          reason: `${operator} on "${criterion.id}" needs operands it did not get (numbers: ${entry.numbers.length}, strings: ${entry.strings.length})`,
        };
      }
      return {
        ok: true,
        atom: { kind: "value_changed", criterionId: criterion.id, from: criterion.value, to: value },
      };
    }

    case "disqualifier_value_changed": {
      const disqualifier = findDisqualifier(icp, entry.targetId);
      if (!disqualifier) {
        return { ok: false, reason: `no disqualifier "${entry.targetId}" in ${icp.name}` };
      }
      const value = valueFor(disqualifier.operator, entry);
      if (value === null) {
        return {
          ok: false,
          reason: `${disqualifier.operator} on "${disqualifier.id}" needs operands it did not get`,
        };
      }
      return {
        ok: true,
        atom: {
          kind: "disqualifier_value_changed",
          disqualifierId: disqualifier.id,
          from: disqualifier.value,
          to: value,
        },
      };
    }

    case "criterion_added": {
      if (!isOperator(entry.operator)) {
        return { ok: false, reason: `"${entry.operator}" is not one of the nine operators` };
      }
      const value = valueFor(entry.operator, entry);
      if (value === null) {
        return { ok: false, reason: `${entry.operator} needs operands it did not get` };
      }
      const rule = makeRule(entry.operator, value);
      if (!rule) {
        return { ok: false, reason: `${entry.operator} cannot carry those operands` };
      }
      if (entry.label.trim().length === 0) {
        return { ok: false, reason: "a new criterion needs a label — it is shown to the user verbatim" };
      }
      const id = entry.targetId.trim().length > 0 ? entry.targetId.trim() : slugify(entry.label, `added-${index}`);
      if (findCriterion(icp, id)) {
        return { ok: false, reason: `criterion "${id}" already exists in ${icp.name}` };
      }
      const criterion: Criterion = {
        ...rule,
        id,
        label: entry.label.trim(),
        field: entry.field as Criterion["field"],
        weight: Number.isFinite(entry.weight) && entry.weight >= 0 ? entry.weight : 1,
      };
      return { ok: true, atom: { kind: "criterion_added", criterionId: id, criterion } };
    }

    case "disqualifier_added": {
      if (!isOperator(entry.operator)) {
        return { ok: false, reason: `"${entry.operator}" is not one of the nine operators` };
      }
      const value = valueFor(entry.operator, entry);
      if (value === null) {
        return { ok: false, reason: `${entry.operator} needs operands it did not get` };
      }
      const rule = makeRule(entry.operator, value);
      if (!rule) {
        return { ok: false, reason: `${entry.operator} cannot carry those operands` };
      }
      if (entry.reason.trim().length === 0) {
        return {
          ok: false,
          reason: "a new disqualifier needs a reason — it is shown verbatim when it fires",
        };
      }
      const id =
        entry.targetId.trim().length > 0 ? entry.targetId.trim() : slugify(entry.reason, `dq-${index}`);
      if (findDisqualifier(icp, id)) {
        return { ok: false, reason: `disqualifier "${id}" already exists in ${icp.name}` };
      }
      const disqualifier: Disqualifier = {
        ...rule,
        id,
        field: entry.field as Disqualifier["field"],
        reason: entry.reason.trim(),
      };
      return { ok: true, atom: { kind: "disqualifier_added", disqualifierId: id, disqualifier } };
    }
  }
}

/**
 * Assemble a whole batch, resolving each `value_changed` against its sibling.
 *
 * The batch is the unit because atoms are not independent: an `operator_changed`
 * on `revenue` changes how the accompanying `value_changed` on `revenue` must be
 * read, and reading them separately is how a `between [5000000, 500000000]` turns
 * into a `gte 5000000` that nobody asked for and the ledger describes wrongly.
 */
export function assembleBatch(
  entries: WireEdit[],
  icp: IcpDefinition,
): { atoms: EditAtom[]; rejected: { entry: unknown; reason: string }[] } {
  const newOperators = new Map<string, Operator>();
  for (const entry of entries) {
    if (entry.kind !== "operator_changed") continue;
    if (!isOperator(entry.operator)) continue;
    newOperators.set(entry.targetId, entry.operator);
  }

  const atoms: EditAtom[] = [];
  const rejected: { entry: unknown; reason: string }[] = [];

  entries.forEach((entry, index) => {
    const result = assembleEdit(entry, icp, index, newOperators.get(entry.targetId));
    if (result.ok) atoms.push(result.atom);
    else rejected.push({ entry, reason: result.reason });
  });

  return { atoms, rejected };
}
