/**
 * Public surface of the diff engine.
 *
 * `buildDiff` is the entry point and the only one. It is pure — no framework, no
 * SDK, no data import — so the browser runs it on every threshold change and
 * `POST /api/diff` runs the identical function for programmatic use.
 * `equivalence.test.ts` asserts the two produce byte-identical JSON.
 */

export { buildDiff, accountsCausedBy, movers } from "./build";
export { bandsWhere, bandContaining, bandWidth, marginOf } from "./bands";
export { describeAtom, describeBand, describeBands, describeCause, describeVerdict } from "./describe";
export { ablationUnits, applyEdits, isRuleValid, makeRule, sameDefinition, withoutUnit } from "./edits";
export { axisFor, axisPosition, buildSide, qualifiesAt, verdictOf } from "./verdicts";
export {
  EDIT_ATOM_KINDS,
  VERDICTS,
  atomId,
  atomTargetId,
  causeAtomIds,
  isHeld,
  isInteraction,
  type AblationUnit,
  type AccountBands,
  type AccountDiff,
  type Attribution,
  type Band,
  type BandAxis,
  type BuildDiffInput,
  type Cause,
  type DiffFailure,
  type DiffReport,
  type DiffResult,
  type DiffSuccess,
  type EditAtom,
  type EditAtomKind,
  type LedgerEntry,
  type Mode,
  type Provenance,
  type RuleValue,
  type SideState,
  type Verdict,
} from "./types";
