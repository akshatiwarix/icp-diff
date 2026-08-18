/**
 * Applying edit atoms, and working out which of them can be ablated alone.
 *
 * This module is the reason attribution can be exact. Every claim the engine
 * makes about an edit is produced by *actually applying* some subset of the edit
 * list and re-scoring — never by reasoning about what an edit probably does. So
 * the only thing that has to be right here is `applyEdits`.
 */

import type { Criterion, Disqualifier, IcpDefinition, Operator, Rule } from "../scoring";
import { atomId, atomTargetId, type AblationUnit, type EditAtom, type RuleValue } from "./types";

export type ApplyResult =
  | { ok: true; icp: IcpDefinition }
  | { ok: false; reason: string };

/* ───────────────────────── rule construction ───────────────────────── */

function isScalar(value: RuleValue): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

function isScalarList(value: RuleValue): value is (string | number)[] {
  return Array.isArray(value) && value.every(isScalar);
}

function isStringList(value: RuleValue): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isNumberPair(value: RuleValue): value is [number, number] {
  return (
    Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === "number")
  );
}

/**
 * Pair an operator with a value, or refuse.
 *
 * Day 001 models `Rule` as a discriminated union precisely so a malformed
 * pairing cannot typecheck. At runtime an edit can still attempt one — a user
 * switching `between` to `contains_any` leaves a `[number, number]` behind where
 * a `string[]` is required — and that refusal is what makes linked atom groups a
 * real constraint rather than a stylistic choice.
 */
export function makeRule(operator: Operator, value: RuleValue): Rule | null {
  switch (operator) {
    case "equals":
    case "not_equals":
      return isScalar(value) ? { operator, value } : null;
    case "in":
    case "not_in":
      return isScalarList(value) ? { operator, value } : null;
    case "gte":
    case "lte":
      return typeof value === "number" ? { operator, value } : null;
    case "between":
      return isNumberPair(value) ? { operator, value } : null;
    case "contains_any":
    case "contains_all":
      return isStringList(value) ? { operator, value } : null;
  }
}

/** True when this operator can carry this value. */
export function isRuleValid(operator: Operator, value: RuleValue): boolean {
  return makeRule(operator, value) !== null;
}

/* ─────────────────────────── applying atoms ─────────────────────────── */

type PendingRuleChange = {
  weight?: number;
  operator?: Operator;
  value?: RuleValue;
};

function describeTarget(atom: EditAtom): string {
  return `${atom.kind} on ${atomTargetId(atom)}`;
}

/**
 * Apply a set of atoms to an ICP.
 *
 * Order-independent by construction: removals, then in-place changes, then
 * additions. Two atoms of the same kind targeting the same id is a contradiction
 * and is refused rather than resolved last-write-wins, because the alternative
 * is an edit list that silently means something other than what it says.
 *
 * Applying a *subset* is the normal case — that is what an ablation is — so a
 * subset that happens to be internally inconsistent (an operator change without
 * its value change) must fail loudly here. `ablationUnits` exists to make sure
 * the engine never asks for one.
 */
export function applyEdits(icp: IcpDefinition, atoms: EditAtom[]): ApplyResult {
  const seen = new Set<string>();
  for (const atom of atoms) {
    const id = atomId(atom);
    if (seen.has(id)) {
      return { ok: false, reason: `duplicate edit: two ${describeTarget(atom)} atoms` };
    }
    seen.add(id);
  }

  const criteriaById = new Map(icp.criteria.map((criterion) => [criterion.id, criterion]));
  const disqualifiersById = new Map(icp.disqualifiers.map((d) => [d.id, d]));

  const removedCriteria = new Set<string>();
  const removedDisqualifiers = new Set<string>();
  const criterionChanges = new Map<string, PendingRuleChange>();
  const disqualifierChanges = new Map<string, RuleValue>();
  const addedCriteria: Criterion[] = [];
  const addedDisqualifiers: Disqualifier[] = [];

  const change = (criterionId: string): PendingRuleChange => {
    const existing = criterionChanges.get(criterionId);
    if (existing) return existing;
    const fresh: PendingRuleChange = {};
    criterionChanges.set(criterionId, fresh);
    return fresh;
  };

  for (const atom of atoms) {
    switch (atom.kind) {
      case "criterion_added": {
        if (criteriaById.has(atom.criterionId)) {
          return { ok: false, reason: `criterion ${atom.criterionId} already exists` };
        }
        if (atom.criterion.id !== atom.criterionId) {
          return {
            ok: false,
            reason: `criterion_added id mismatch: ${atom.criterionId} vs ${atom.criterion.id}`,
          };
        }
        addedCriteria.push(atom.criterion);
        break;
      }
      case "criterion_removed": {
        if (!criteriaById.has(atom.criterionId)) {
          return { ok: false, reason: `cannot remove unknown criterion ${atom.criterionId}` };
        }
        removedCriteria.add(atom.criterionId);
        break;
      }
      case "weight_changed": {
        if (!criteriaById.has(atom.criterionId)) {
          return { ok: false, reason: `cannot reweight unknown criterion ${atom.criterionId}` };
        }
        if (atom.to < 0) {
          return { ok: false, reason: `weight must be >= 0 (${atom.criterionId})` };
        }
        change(atom.criterionId).weight = atom.to;
        break;
      }
      case "value_changed": {
        if (!criteriaById.has(atom.criterionId)) {
          return { ok: false, reason: `cannot revalue unknown criterion ${atom.criterionId}` };
        }
        change(atom.criterionId).value = atom.to;
        break;
      }
      case "operator_changed": {
        if (!criteriaById.has(atom.criterionId)) {
          return {
            ok: false,
            reason: `cannot change operator of unknown criterion ${atom.criterionId}`,
          };
        }
        change(atom.criterionId).operator = atom.to;
        break;
      }
      case "disqualifier_added": {
        if (disqualifiersById.has(atom.disqualifierId)) {
          return { ok: false, reason: `disqualifier ${atom.disqualifierId} already exists` };
        }
        if (atom.disqualifier.id !== atom.disqualifierId) {
          return {
            ok: false,
            reason: `disqualifier_added id mismatch: ${atom.disqualifierId} vs ${atom.disqualifier.id}`,
          };
        }
        addedDisqualifiers.push(atom.disqualifier);
        break;
      }
      case "disqualifier_removed": {
        if (!disqualifiersById.has(atom.disqualifierId)) {
          return {
            ok: false,
            reason: `cannot remove unknown disqualifier ${atom.disqualifierId}`,
          };
        }
        removedDisqualifiers.add(atom.disqualifierId);
        break;
      }
      case "disqualifier_value_changed": {
        if (!disqualifiersById.has(atom.disqualifierId)) {
          return {
            ok: false,
            reason: `cannot revalue unknown disqualifier ${atom.disqualifierId}`,
          };
        }
        disqualifierChanges.set(atom.disqualifierId, atom.to);
        break;
      }
    }
  }

  for (const id of criterionChanges.keys()) {
    if (removedCriteria.has(id)) {
      return { ok: false, reason: `criterion ${id} is both removed and modified` };
    }
  }
  for (const id of disqualifierChanges.keys()) {
    if (removedDisqualifiers.has(id)) {
      return { ok: false, reason: `disqualifier ${id} is both removed and modified` };
    }
  }

  const criteria: Criterion[] = [];
  for (const criterion of icp.criteria) {
    if (removedCriteria.has(criterion.id)) continue;
    const pending = criterionChanges.get(criterion.id);
    if (!pending) {
      criteria.push(criterion);
      continue;
    }
    const operator = pending.operator ?? criterion.operator;
    const value = pending.value ?? criterion.value;
    const rule = makeRule(operator, value);
    if (rule === null) {
      return {
        ok: false,
        reason: `operator ${operator} cannot carry the value on ${criterion.id} — this atom must be ablated with its sibling`,
      };
    }
    criteria.push({
      ...rule,
      id: criterion.id,
      label: criterion.label,
      field: criterion.field,
      weight: pending.weight ?? criterion.weight,
    });
  }
  criteria.push(...addedCriteria);

  const disqualifiers: Disqualifier[] = [];
  for (const disqualifier of icp.disqualifiers) {
    if (removedDisqualifiers.has(disqualifier.id)) continue;
    if (!disqualifierChanges.has(disqualifier.id)) {
      disqualifiers.push(disqualifier);
      continue;
    }
    const value = disqualifierChanges.get(disqualifier.id) as RuleValue;
    const rule = makeRule(disqualifier.operator, value);
    if (rule === null) {
      return {
        ok: false,
        reason: `operator ${disqualifier.operator} cannot carry the new value on ${disqualifier.id}`,
      };
    }
    disqualifiers.push({
      ...rule,
      id: disqualifier.id,
      field: disqualifier.field,
      reason: disqualifier.reason,
    });
  }
  disqualifiers.push(...addedDisqualifiers);

  return { ok: true, icp: { name: icp.name, criteria, disqualifiers } };
}

/* ───────────────────────── definition equality ───────────────────────── */

function sameRule(a: { operator: Operator; value: RuleValue }, b: { operator: Operator; value: RuleValue }): boolean {
  return a.operator === b.operator && JSON.stringify(a.value) === JSON.stringify(b.value);
}

/**
 * Do two definitions say the same thing?
 *
 * Compared by id-keyed maps rather than array order, because `applyEdits`
 * appends additions while a hand-authored ICP B may list them anywhere. Order of
 * criteria has no effect on any score Day 001 computes — the score is a weighted
 * sum — so treating it as significant would make the verification test brittle
 * about something that cannot matter. The `name` is excluded for the same
 * reason: ICP B is expected to be *called* something else.
 */
export function sameDefinition(a: IcpDefinition, b: IcpDefinition): boolean {
  if (a.criteria.length !== b.criteria.length) return false;
  if (a.disqualifiers.length !== b.disqualifiers.length) return false;

  const bCriteria = new Map(b.criteria.map((criterion) => [criterion.id, criterion]));
  for (const criterion of a.criteria) {
    const other = bCriteria.get(criterion.id);
    if (!other) return false;
    if (criterion.field !== other.field) return false;
    if (criterion.weight !== other.weight) return false;
    if (criterion.label !== other.label) return false;
    if (!sameRule(criterion, other)) return false;
  }

  const bDisqualifiers = new Map(b.disqualifiers.map((d) => [d.id, d]));
  for (const disqualifier of a.disqualifiers) {
    const other = bDisqualifiers.get(disqualifier.id);
    if (!other) return false;
    if (disqualifier.field !== other.field) return false;
    if (disqualifier.reason !== other.reason) return false;
    if (!sameRule(disqualifier, other)) return false;
  }

  return true;
}

/* ─────────────────────────── ablation units ─────────────────────────── */

/**
 * Group the edit list into units that can each be applied and withheld alone.
 *
 * Almost every atom is its own unit. The exception is the linked group: an
 * `operator_changed` whose sibling `value_changed` is required for the pairing to
 * typecheck. Rather than pattern-matching operator families — a list of which
 * conversions are legal, which would rot the first time Day 001 gains an
 * operator — this asks the question directly: *apply this atom alone to A; does
 * it work?* If it does not, it links with the other atoms on the same target.
 *
 * That empirical test is also why `between` → `in` is deliberately *not* linked
 * while `between` → `contains_any` is. A `[number, number]` is a valid `in` list
 * and an invalid `contains_any` list, so the first conversion stands alone and
 * the second cannot. Hard-coding the families would have got that wrong.
 */
export function ablationUnits(base: IcpDefinition, atoms: EditAtom[]): AblationUnit[] {
  const byTarget = new Map<string, EditAtom[]>();
  for (const atom of atoms) {
    const target = atomTargetId(atom);
    const group = byTarget.get(target);
    if (group) group.push(atom);
    else byTarget.set(target, [atom]);
  }

  const units: AblationUnit[] = [];
  for (const group of byTarget.values()) {
    const soloable = group.every((atom) => applyEdits(base, [atom]).ok);
    if (soloable) {
      for (const atom of group) {
        units.push({ atomIds: [atomId(atom)], atoms: [atom], linked: false });
      }
      continue;
    }
    // At least one atom on this target cannot stand alone, so the target's atoms
    // ablate as one unit and share a single sufficient/necessary verdict.
    units.push({
      atomIds: group.map(atomId).sort(),
      atoms: group,
      linked: group.length > 1,
    });
  }

  return units.sort((a, b) => (a.atomIds.join() < b.atomIds.join() ? -1 : 1));
}

/** Every atom in the list except the ones in `unit`. */
export function withoutUnit(atoms: EditAtom[], unit: AblationUnit): EditAtom[] {
  const excluded = new Set(unit.atomIds);
  return atoms.filter((atom) => !excluded.has(atomId(atom)));
}
