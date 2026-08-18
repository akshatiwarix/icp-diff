/**
 * Fragility, computed exhaustively.
 *
 * Any diff shown at one cutoff is a claim about a continuum, and the claim is
 * usually stronger than the arithmetic supports: a third of the accounts on a
 * "gained" list are sitting inside a four-point band and will be on the other
 * side of it the next time someone touches a weight. The usual fix is to jitter
 * the cutoff and count flips, which requires defending a perturbation constant
 * nobody can defend.
 *
 * This module walks the *entire* axis instead — every integer threshold from 0 to
 * 100, or every N from 1 to the corpus size — and reports the interval over which
 * the current verdict actually holds. No sampling, no epsilon, and no extra cost:
 * it is the same pass that lets the slider recompute without a round trip.
 */

import type { Band } from "./types";

/**
 * Group the axis positions where `holds` is true into inclusive intervals.
 *
 * Written to return *several* bands even though every verdict this engine
 * produces occupies exactly one contiguous interval — qualification is monotone
 * in the cutoff, so `gained` is always `(scoreA, scoreB]` and never a pair of
 * islands. Encoding that assumption as a single `{ from, to }` would make the
 * band consistency invariant unable to fail, which would make it worthless as a
 * test.
 */
export function bandsWhere(
  from: number,
  to: number,
  holds: (position: number) => boolean,
): Band[] {
  const bands: Band[] = [];
  let start: number | null = null;

  for (let position = from; position <= to; position++) {
    if (holds(position)) {
      if (start === null) start = position;
    } else if (start !== null) {
      bands.push({ from: start, to: position - 1 });
      start = null;
    }
  }
  if (start !== null) bands.push({ from: start, to });

  return bands;
}

export function bandContaining(bands: Band[], position: number): Band | undefined {
  return bands.find((band) => position >= band.from && position <= band.to);
}

export function bandWidth(bands: Band[]): number {
  return bands.reduce((total, band) => total + (band.to - band.from + 1), 0);
}

/**
 * How far the cutoff can move before the verdict changes, in axis units.
 *
 * Takes the closer of the two directions, because the user's exposure is to
 * whichever edge is nearer. Returns `null` when the verdict holds all the way to
 * both ends of the axis — it does not depend on the cutoff at all, which is true
 * of both disqualification verdicts and is a different statement from "it has a
 * lot of room".
 *
 * An edge that coincides with the end of the axis is not an edge: you cannot fall
 * off the bottom of a threshold of 0. Only a real boundary counts.
 */
export function marginOf(
  bands: Band[],
  position: number,
  axisFrom: number,
  axisTo: number,
): number | null {
  const band = bandContaining(bands, position);
  if (!band) return 0;

  const roomBelow = band.from <= axisFrom ? null : position - band.from + 1;
  const roomAbove = band.to >= axisTo ? null : band.to - position + 1;

  if (roomBelow === null && roomAbove === null) return null;
  if (roomBelow === null) return roomAbove;
  if (roomAbove === null) return roomBelow;
  return Math.min(roomBelow, roomAbove);
}
