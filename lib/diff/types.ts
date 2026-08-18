/**
 * The diff contract.
 *
 * Deliberately free of runtime dependencies — no Zod, no Next, no React, no
 * model client. Validation lives at the boundary in `lib/parse/`, and
 * `purity.test.ts` enforces the rule with no allowlist. A module that cannot
 * import a model client cannot invent a cause.
 *
 * Everything here is built on the frozen Day 001 types, imported relatively from
 * `../scoring`. Day 012 adds no field to `Company`, `Criterion`, `Disqualifier`
 * or `ScoredAccount`.
 */

import type {
  Company,
  Criterion,
  Disqualifier,
  IcpDefinition,
  Operator,
  Rule,
  ScoredAccount,
} from "../scoring";

/** Every value shape a rule can carry, across all nine operators. */
export type RuleValue = Rule["value"];

/* ────────────────────────────── edit atoms ────────────────────────────── */

/**
 * The eight atomic edits, never collapsed.
 *
 * Attribution granularity *is* edit granularity. A criterion whose weight and
 * value both changed carries two atoms, because "you loosened the range" and
 * "you tripled the weight" are two different causes with different blame —
 * collapsing them into a single `criterion_modified` throws away the answer the
 * user came for. There is no `criterion_modified` and there must not be one.
 */
export type EditAtom =
  | { kind: "criterion_added"; criterionId: string; criterion: Criterion }
  | { kind: "criterion_removed"; criterionId: string }
  | { kind: "weight_changed"; criterionId: string; from: number; to: number }
  | { kind: "value_changed"; criterionId: string; from: RuleValue; to: RuleValue }
  | { kind: "operator_changed"; criterionId: string; from: Operator; to: Operator }
  | { kind: "disqualifier_added"; disqualifierId: string; disqualifier: Disqualifier }
  | { kind: "disqualifier_removed"; disqualifierId: string }
  | {
      kind: "disqualifier_value_changed";
      disqualifierId: string;
      from: RuleValue;
      to: RuleValue;
    };

export type EditAtomKind = EditAtom["kind"];

export const EDIT_ATOM_KINDS = [
  "criterion_added",
  "criterion_removed",
  "weight_changed",
  "value_changed",
  "operator_changed",
  "disqualifier_added",
  "disqualifier_removed",
  "disqualifier_value_changed",
] as const satisfies readonly EditAtomKind[];

/**
 * Atom ids are *derived*, not stored: `"weight_changed:a-gtm-hiring"`.
 *
 * Two consequences worth keeping. A given kind can target a given criterion at
 * most once — two `value_changed` atoms on one criterion is a contradiction, and
 * duplicate-id detection is how that gets caught rather than silently
 * last-write-wins. And the JSON export is stable across runs without a counter,
 * so two reports over the same edit list diff cleanly against each other.
 */
export function atomId(atom: EditAtom): string {
  return `${atom.kind}:${atomTargetId(atom)}`;
}

/** The criterion or disqualifier id an atom targets. */
export function atomTargetId(atom: EditAtom): string {
  switch (atom.kind) {
    case "criterion_added":
    case "criterion_removed":
    case "weight_changed":
    case "value_changed":
    case "operator_changed":
      return atom.criterionId;
    case "disqualifier_added":
    case "disqualifier_removed":
    case "disqualifier_value_changed":
      return atom.disqualifierId;
  }
}

/**
 * A set of atoms that must be applied or withheld together.
 *
 * Almost always one atom. The exception is real: an `operator_changed` that
 * makes the accompanying value type-invalid — a `between` pair evaluated under
 * `gte` — cannot be ablated on its own, because the intermediate ICP does not
 * typecheck. Ablation therefore runs over units, not atoms, and a unit's
 * `sufficient`/`necessary` verdict is shared by every atom in it.
 */
export type AblationUnit = {
  /** Derived ids, sorted, so unit identity is stable. */
  atomIds: string[];
  atoms: EditAtom[];
  /** True when the unit holds more than one atom, i.e. the linkage bit. */
  linked: boolean;
};

/* ────────────────────────────── provenance ────────────────────────────── */

/**
 * Whether ICP B is attributable at all.
 *
 * `derived` means B was *produced from* A by the recorded edits — a chain, not a
 * resemblance. `none` is what two independently authored definitions get, and it
 * is not a degraded mode: the engine emits the full outcome diff and then
 * refuses per-edit blame by name.
 *
 * There is no third case, and in particular there is no pairing heuristic. Day
 * 001's preset criterion ids are preset-prefixed (`a-headcount`, `b-headcount`),
 * so matching criteria across two unrelated presets finds nothing — and both
 * presets happen to carry an `employee_count`/`between` criterion meaning
 * opposite things, which is exactly the mispairing a `(field, operator)`
 * heuristic would make and then narrate with total confidence.
 */
export type Provenance =
  | { kind: "derived"; parentIcpName: string; edits: EditAtom[] }
  | { kind: "none" };

/* ─────────────────────────── qualification mode ─────────────────────────── */

/**
 * Threshold and top-N are both shipped because they disagree, and the
 * disagreement is content: top-N makes qualification zero-sum — one account can
 * only enter if another leaves — while a threshold does not. Displacement is
 * only reachable under top-N.
 */
export type Mode =
  | { kind: "threshold"; threshold: number }
  | { kind: "top_n"; topN: number };

/* ──────────────────────────────── verdicts ─────────────────────────────── */

/**
 * Six verdicts. Disqualification is its own axis, not a very low score: an
 * account excluded by a hard rule is a different kind of "out" than one that
 * scored 41.
 *
 * When an account both drops below the cutoff and becomes disqualified, the
 * verdict is `newly_disqualified` — the disqualifier is the actionable cause and
 * the score is a consequence of it (Day 001's engine forces a disqualified score
 * to 0).
 */
export type Verdict =
  | "gained"
  | "lost"
  | "held_in"
  | "held_out"
  | "newly_disqualified"
  | "undisqualified";

export const VERDICTS = [
  "gained",
  "lost",
  "held_in",
  "held_out",
  "newly_disqualified",
  "undisqualified",
] as const satisfies readonly Verdict[];

/** The two verdicts where nothing changed for this account. */
export function isHeld(verdict: Verdict): boolean {
  return verdict === "held_in" || verdict === "held_out";
}

/* ───────────────────────────────── causes ──────────────────────────────── */

/**
 * Why an account moved.
 *
 * `sufficient` — apply this unit alone to A; the account moves.
 * `necessary`  — apply every unit *except* this one to A; the account fails to
 *                move.
 *
 * Both are booleans the user can check in a single ablation they can see. Their
 * disagreement is an `interaction` and is reported as such. There is no
 * percentage, no credit fraction, no Shapley value, and no field on this type
 * that answers "how much did this edit matter" — that number would be read as
 * truth by everyone who saw it and audited by nobody.
 *
 * `displacement` is a cause in its own right, never blended with edit causes: an
 * account whose own score held or rose while its rank fell did not fail on fit,
 * it failed on arithmetic about other accounts, and the report cites which ones.
 *
 * `combination` is the honest floor. Three edits where any two suffice produce an
 * account that moved with *no* unit sufficient and *no* unit necessary — remove
 * any one and the move still happens, apply any one and it does not. Reporting no
 * cause there would break the completeness invariant; picking a unit anyway would
 * be a guess. So the claim shrinks to what is true: this set, together, did it,
 * and no member of it can be singled out.
 */
export type Cause =
  | { kind: "edit"; atomId: string; sufficient: boolean; necessary: boolean }
  | { kind: "displacement"; overtakenBy: string[] }
  | { kind: "combination"; atomIds: string[] };

/** `sufficient !== necessary` — the honest report of non-additivity. */
export function isInteraction(cause: Cause): boolean {
  return cause.kind === "edit" && cause.sufficient !== cause.necessary;
}

/** Every atom a cause names, for filtering the table by a ledger row. */
export function causeAtomIds(cause: Cause): string[] {
  if (cause.kind === "edit") return [cause.atomId];
  if (cause.kind === "combination") return cause.atomIds;
  return [];
}

/* ───────────────────────────────── bands ──────────────────────────────── */

/**
 * An inclusive interval on the qualification axis.
 *
 * Fragility is computed exhaustively across the whole axis rather than sampled,
 * so there is no magic epsilon and no perturbation constant to defend. It is
 * also the same pass that powers the slider, so it costs nothing.
 *
 * The axis is whichever knob the active mode exposes: thresholds 0–100, or N
 * from 1 to the corpus size. Computing threshold bands while the user is looking
 * at a top-N diff would answer a question they are not asking, with numbers that
 * do not correspond to anything on screen.
 */
export type Band = { from: number; to: number };

export type BandAxis = "threshold" | "top_n";

export type AccountBands = {
  axis: BandAxis;
  /** Inclusive bounds of the axis, so a band can be read as a proportion. */
  axisFrom: number;
  axisTo: number;
  /** Axis positions at which this account qualifies under ICP A. */
  qualifiedA: Band[];
  /** Axis positions at which it qualifies under ICP B. */
  qualifiedB: Band[];
  /** Axis positions at which the *current* verdict is the verdict. */
  verdictHolds: Band[];
};

/* ─────────────────────────────── the report ────────────────────────────── */

export type SideState = {
  score: number;
  disqualified: boolean;
  /** 1-based, from Day 001's `rank`: disqualified last, then score desc. */
  rank: number;
  qualified: boolean;
};

export type AccountDiff = {
  companyId: string;
  companyName: string;
  a: SideState;
  b: SideState;
  verdict: Verdict;
  /**
   * How far the cutoff can move before this verdict stops holding, in axis
   * units, taking the closer of the two directions. `null` means the verdict
   * holds across the entire axis and does not depend on the cutoff at all —
   * which is the case for both disqualification verdicts.
   *
   * Derived from `bands.verdictHolds`, never computed separately: two sources
   * for one number drift, and the number that drifts is the one the user reads
   * to decide whether to trust the row above it.
   */
  margin: number | null;
  /** Only meaningful when the account qualified on both sides. */
  rankDelta: number | null;
  bands: AccountBands;
  /** Empty when provenance is `none`, and when the verdict is `held_*`. */
  causes: Cause[];
  /** Full Day 001 breakdowns, both sides, for the expanded row. */
  breakdown: { a: ScoredAccount; b: ScoredAccount };
};

export type LedgerEntry = {
  atomId: string;
  atom: EditAtom;
  /** Engine-templated prose. Never model-written. */
  description: string;
  /** Other atom ids ablated together with this one, if any. */
  linkedWith: string[];
  movedIn: number;
  movedOut: number;
  /** Accounts this unit moves on its own. */
  sufficientCount: number;
  /** Accounts that fail to move without it. */
  necessaryCount: number;
  /** Accounts where the two disagree. */
  interactionCount: number;
  /**
   * True when this unit moves no account at *any* threshold, in either mode.
   * A shipped finding, not debug output — "this edit did nothing" is a sentence
   * real ICP owners are never given.
   */
  changedNothing: boolean;
};

export type Attribution =
  | {
      state: "attributed";
      ledger: LedgerEntry[];
      units: AblationUnit[];
      /**
       * Accounts that moved with no single edit sufficient or necessary, and so
       * carry a `combination` cause instead. Surfaced at report level because it
       * belongs to no ledger row by construction.
       */
      combinationMoves: number;
    }
  | { state: "unattributed"; reason: string };

export type DiffReport = {
  icpA: { name: string; criteria: number; disqualifiers: number };
  icpB: { name: string; criteria: number; disqualifiers: number };
  mode: Mode;
  corpusSize: number;
  attribution: Attribution;
  /** Every account, in ICP B rank order. Movement is a filter, not a subset. */
  accounts: AccountDiff[];
  counts: Record<Verdict, number>;
};

export type BuildDiffInput = {
  corpus: Company[];
  icpA: IcpDefinition;
  icpB: IcpDefinition;
  provenance: Provenance;
  mode: Mode;
};

/**
 * Why a diff was refused outright.
 *
 * Distinct from `unattributed`: that is a diff with no blame, this is no diff at
 * all. Reachable when the recorded edits do not actually transform A into B, in
 * which case every ablation would be exact and confident about a fiction.
 */
export type DiffFailure = { ok: false; reason: string };
export type DiffSuccess = { ok: true; report: DiffReport };
export type DiffResult = DiffSuccess | DiffFailure;
