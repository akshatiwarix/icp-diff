/**
 * Every sentence this repo displays about an edit is built here.
 *
 * The model never phrases, polishes or summarises. It parses prose *into* atoms
 * (`lib/parse/`) and stops. So the ledger's descriptions and the text change
 * review are both pure functions of the licensed structure — you cannot get
 * nicer wording than the engine can justify, and that is the point. If a
 * description reads awkwardly, the fix is a better template, not a model call.
 */

import { describeRule, formatFieldValue } from "../scoring";
import type { Criterion, Disqualifier } from "../scoring";
import { makeRule } from "./edits";
import type { Cause, EditAtom, RuleValue, Verdict } from "./types";

function valuePhrase(operator: Criterion["operator"], value: RuleValue): string {
  const rule = makeRule(operator, value);
  // An invalid pairing is reachable here: the `from` half of an operator change
  // is being rendered against the `to` operator. Fall back to the raw value
  // rather than inventing a comparison that never ran.
  return rule ? describeRule(rule) : formatFieldValue(value as never);
}

/** One atom as a sentence fragment, e.g. `"headcount range widened to 50–3,000"`. */
export function describeAtom(atom: EditAtom): string {
  switch (atom.kind) {
    case "criterion_added":
      return `added criterion "${atom.criterion.label}" (${atom.criterion.field} ${valuePhrase(
        atom.criterion.operator,
        atom.criterion.value,
      )}, weight ${atom.criterion.weight})`;
    case "criterion_removed":
      return `removed criterion ${atom.criterionId}`;
    case "weight_changed":
      return `weight on ${atom.criterionId} changed from ${atom.from} to ${atom.to}`;
    case "value_changed":
      return `value on ${atom.criterionId} changed to ${formatFieldValue(atom.to as never)}`;
    case "operator_changed":
      return `operator on ${atom.criterionId} changed from ${atom.from} to ${atom.to}`;
    case "disqualifier_added":
      return `added disqualifier "${atom.disqualifier.reason}" (${atom.disqualifier.field} ${valuePhrase(
        atom.disqualifier.operator,
        atom.disqualifier.value,
      )})`;
    case "disqualifier_removed":
      return `removed disqualifier ${atom.disqualifierId}`;
    case "disqualifier_value_changed":
      return `value on disqualifier ${atom.disqualifierId} changed to ${formatFieldValue(
        atom.to as never,
      )}`;
  }
}

const VERDICT_PHRASES: Record<Verdict, string> = {
  gained: "now qualifies",
  lost: "no longer qualifies",
  held_in: "still qualifies",
  held_out: "still does not qualify",
  newly_disqualified: "is now disqualified",
  undisqualified: "is no longer disqualified",
};

export function describeVerdict(verdict: Verdict): string {
  return VERDICT_PHRASES[verdict];
}

/**
 * A cause as a sentence.
 *
 * Note what is absent: any quantity. "Sufficient on its own" and "needed for the
 * move" are the two facts available, and an interaction is stated as a
 * disagreement rather than resolved into a share.
 */
export function describeCause(cause: Cause, descriptionOf: (atomId: string) => string): string {
  if (cause.kind === "displacement") {
    const names = cause.overtakenBy.join(", ");
    return `displaced — its own score did not fall; it was overtaken by ${names}`;
  }
  const description = descriptionOf(cause.atomId);
  if (cause.sufficient && cause.necessary) {
    return `${description} — enough on its own, and the move does not happen without it`;
  }
  if (cause.sufficient && !cause.necessary) {
    return `${description} — enough on its own, but another edit would have done it too`;
  }
  if (!cause.sufficient && cause.necessary) {
    return `${description} — not enough on its own, but the move does not happen without it`;
  }
  return `${description} — neither enough on its own nor required`;
}

/** `"58–63"`, or `"58"` for a single-threshold band. */
export function describeBand(band: { from: number; to: number }): string {
  return band.from === band.to ? `${band.from}` : `${band.from}–${band.to}`;
}

export function describeBands(bands: { from: number; to: number }[]): string {
  if (bands.length === 0) return "no threshold";
  return bands.map(describeBand).join(", ");
}

export function labelOf(entity: Criterion | Disqualifier): string {
  return "label" in entity ? entity.label : entity.reason;
}
