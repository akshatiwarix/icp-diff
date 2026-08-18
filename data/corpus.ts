/**
 * The bundled corpus, validated at import.
 *
 * Seventy-two synthetic companies on Day 001's `Company` type, so anything you
 * paste into `icp-score` pastes into this repo unchanged. Synthetic and
 * deliberately not representative: it is engineered so that every verdict, every
 * cause type and every fragility shape this engine can compute is *reachable*,
 * which is the opposite of a random sample. `data/traps.ts` names which account
 * carries which case.
 *
 * Parsing at import rather than trusting the JSON is not ceremony. A corpus that
 * silently loses `hq_country` on one row produces a diff that is wrong in a way
 * nobody can see, because a missing field scores exactly like a field that does
 * not match.
 */

import { companiesSchema } from "./schema";
import raw from "./companies.json";

export const CORPUS = companiesSchema.parse(raw);

export const CORPUS_SIZE = CORPUS.length;

export function companyById(id: string) {
  return CORPUS.find((company) => company.id === id);
}
