/**
 * ICP A, the edit lists, and the ICP Bs those edits produce.
 *
 * ICP B is never hand-written. It is *computed* by `applyEdits(A, edits)`, which
 * is what makes provenance real rather than a claim: the edit list is the source
 * of truth and B is its consequence. Hand-writing B and asserting a plausible
 * edit list beside it is how an attribution engine ends up exact and confident
 * about a fiction.
 *
 * Two revisions are bundled. `q3Revision` is the demo default and carries all
 * ten traps. `weightsOnly` is the control: a revision that touches nothing but
 * weights, which is the case reviewers assume is trivial and is not.
 */

import { applyEdits } from "@/lib/diff/edits";
import type { EditAtom, Provenance } from "@/lib/diff/types";
import type { IcpDefinition } from "@/lib/scoring";

import { icpDefinitionSchema } from "./schema";

/**
 * The parent. Mid-market B2B software in North America, the same shape Day 001
 * ships as its default preset — deliberately, so a reviewer who saw `icp-score`
 * recognises the definition and can focus on what Day 012 adds.
 *
 * Criterion ids carry no preset prefix here because this ICP *is* the parent.
 * Every derived revision shares these ids, which is precisely the property that
 * makes per-edit attribution possible and that two unrelated presets can never
 * have.
 */
export const midMarketSaas: IcpDefinition = {
  name: "Mid-market B2B SaaS (North America)",
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
      id: "industry",
      label: "B2B software vertical",
      field: "industry",
      operator: "in",
      value: ["Software", "Fintech", "Cybersecurity", "HR Tech", "Marketing Tech", "Legal Tech"],
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
    {
      id: "funding",
      label: "Venture-backed, Series A or later",
      field: "funding_stage",
      operator: "in",
      value: ["series_a", "series_b", "series_c_plus"],
      weight: 2,
    },
    {
      id: "revenue",
      label: "Revenue at least $10M",
      field: "annual_revenue_usd",
      operator: "gte",
      value: 10000000,
      weight: 2,
    },
    {
      id: "cloud",
      label: "Runs on public cloud",
      field: "tech_stack",
      operator: "contains_any",
      value: ["aws", "gcp", "azure", "kubernetes"],
      weight: 2,
    },
    {
      id: "gtm-hiring",
      label: "Actively building the GTM team",
      field: "hiring_signals",
      operator: "contains_any",
      value: ["hiring_sales", "hiring_revops", "new_cro"],
      weight: 3,
    },
    {
      id: "crm",
      label: "Runs a mainstream CRM",
      field: "tech_stack",
      operator: "contains_any",
      value: ["salesforce", "hubspot"],
      weight: 1,
    },
  ],
  disqualifiers: [
    {
      id: "dq-enterprise",
      field: "employee_count",
      operator: "gte",
      value: 10000,
      reason: "Enterprise headcount (10,000+) — owned by the enterprise team, not this motion",
    },
    {
      id: "dq-residency",
      field: "hq_country",
      operator: "in",
      value: ["CN", "RU", "IR"],
      reason: "Outside the regions where we can host customer data",
    },
    {
      id: "dq-procurement",
      field: "industry",
      operator: "in",
      value: ["Public Sector", "Defense"],
      reason: "Procurement cycle runs years, not quarters",
    },
    {
      id: "dq-budget",
      field: "hiring_signals",
      operator: "contains_any",
      value: ["layoffs", "hiring_freeze"],
      reason: "Layoffs or a hiring freeze — no budget for new tooling this year",
    },
  ],
};

/**
 * The Q3 revision: seven changes a real GTM lead would make in one sitting, and
 * the reason this repo needs eight atom kinds rather than one `criterion_modified`.
 *
 * Read as prose: *we'll go a bit smaller and a bit bigger on headcount, we care
 * much more about GTM hiring than we did, security hiring is now a signal, the
 * revenue floor becomes a band because the whales are somebody else's, a hiring
 * freeze is no longer an automatic no, anything over 3,000 people belongs to
 * enterprise now, and — while we're here — exclude the sanctioned jurisdictions
 * we forgot to list.*
 *
 * That last one changes nothing, and the ledger says so. Nine atoms, eight of
 * which do work.
 */
export const q3RevisionEdits: EditAtom[] = [
  // Loosen the range at both ends. Brings in sub-100 startups and 2,000–3,000
  // scale-ups that were previously out on size alone.
  {
    kind: "value_changed",
    criterionId: "headcount",
    from: [100, 2000],
    to: [50, 3000],
  },
  // The headline change: GTM hiring stops being one signal among eight and starts
  // dominating. Weight 9 against a 26-point total is a third of the score.
  { kind: "weight_changed", criterionId: "gtm-hiring", from: 3, to: 9 },
  // A new criterion, and the reason `undisqualified` and `newly_disqualified` can
  // both be reachable in the same revision.
  {
    kind: "criterion_added",
    criterionId: "security-hiring",
    criterion: {
      id: "security-hiring",
      label: "Hiring for security ownership",
      field: "hiring_signals",
      operator: "contains_any",
      value: ["hiring_security", "new_ciso"],
      weight: 2,
    },
  },
  // The linked pair. `gte 10000000` becomes `between [5000000, 500000000]`, so the
  // operator change and the value change cannot be ablated apart — a
  // `[number, number]` cannot be evaluated under `gte`, and a bare number cannot
  // be evaluated under `between`.
  { kind: "operator_changed", criterionId: "revenue", from: "gte", to: "between" },
  {
    kind: "value_changed",
    criterionId: "revenue",
    from: 10000000,
    to: [5000000, 500000000],
  },
  // A hiring freeze is a timing problem, not a fit problem. Dropping this
  // disqualifier is what releases previously-excluded accounts.
  { kind: "disqualifier_removed", disqualifierId: "dq-budget" },
  // The enterprise handoff moves down, which pushes mid-size accounts out on a
  // hard rule rather than on score.
  {
    kind: "disqualifier_value_changed",
    disqualifierId: "dq-enterprise",
    from: 10000,
    to: 3000,
  },
  // Written for a case that does not occur in this corpus. Kept deliberately: the
  // ledger marks it "changed nothing", and being told that is the whole point.
  {
    kind: "disqualifier_added",
    disqualifierId: "dq-sanctioned",
    disqualifier: {
      id: "dq-sanctioned",
      field: "hq_country",
      operator: "in",
      value: ["KP", "SY"],
      reason: "Sanctioned jurisdiction — cannot contract",
    },
  },
];

/**
 * The control revision: three weight changes and nothing else.
 *
 * No criterion added, none removed, no disqualifier touched. Every account's
 * matches are identical on both sides — only the arithmetic over them differs.
 * A reviewer expects this to move nobody. It moves several, because a weight
 * change alters the denominator for every account including the ones it does not
 * match.
 */
export const weightsOnlyEdits: EditAtom[] = [
  { kind: "weight_changed", criterionId: "revenue", from: 2, to: 4 },
  { kind: "weight_changed", criterionId: "crm", from: 1, to: 3 },
  { kind: "weight_changed", criterionId: "industry", from: 3, to: 1 },
];

/** A revision, packaged as everything `buildDiff` needs. */
export type Revision = {
  id: string;
  label: string;
  /** One line, shown under the ledger heading. Engine-free prose is fine here. */
  summary: string;
  icpA: IcpDefinition;
  icpB: IcpDefinition;
  provenance: Provenance;
};

/**
 * Derive a revision, or fail at import.
 *
 * `applyEdits` returning `ok: false` means the bundled edit list does not apply
 * to the bundled parent — a data bug that must not reach a browser as a
 * half-rendered console. Throwing here turns it into a failed build.
 */
function revision(
  id: string,
  label: string,
  summary: string,
  parent: IcpDefinition,
  bName: string,
  edits: EditAtom[],
): Revision {
  const applied = applyEdits(parent, edits);
  if (!applied.ok) {
    throw new Error(`bundled revision "${id}" does not apply to ${parent.name}: ${applied.reason}`);
  }
  const icpB = icpDefinitionSchema.parse({ ...applied.icp, name: bName });
  return {
    id,
    label,
    summary,
    icpA: icpDefinitionSchema.parse(parent),
    icpB,
    provenance: { kind: "derived", parentIcpName: parent.name, edits },
  };
}

export const REVISIONS: Revision[] = [
  revision(
    "q3",
    "Q3 revision",
    "Nine edits: headcount loosened both ways, GTM hiring tripled in weight, security hiring added, the revenue floor turned into a band, the hiring-freeze exclusion dropped, the enterprise handoff moved to 3,000 — and one exclusion that changes nothing.",
    midMarketSaas,
    "Mid-market B2B SaaS — Q3 revision",
    q3RevisionEdits,
  ),
  revision(
    "weights",
    "Weights only",
    "Three weight changes and nothing else. Every account matches exactly what it matched before; only the arithmetic over those matches differs.",
    midMarketSaas,
    "Mid-market B2B SaaS — reweighted",
    weightsOnlyEdits,
  ),
];

export const DEFAULT_REVISION_ID = "q3";

export function revisionById(id: string): Revision | undefined {
  return REVISIONS.find((candidate) => candidate.id === id);
}

/**
 * The rival pair, for the `unattributed` path.
 *
 * A genuinely different ICP — smaller, earlier, product-led — sharing not one
 * criterion id with `midMarketSaas`. Diffing these two is a legitimate question
 * ("what would switching motions do to my list?") with an illegitimate answer if
 * you attribute it. Both criteria sets contain an `employee_count` range and they
 * mean opposite things, which is exactly the mispairing a `(field, operator)`
 * heuristic would make and then narrate with total confidence.
 */
export const earlyStageProductLed: IcpDefinition = icpDefinitionSchema.parse({
  name: "Early-stage, product-led",
  criteria: [
    {
      id: "b-headcount",
      label: "Fewer than 200 employees",
      field: "employee_count",
      operator: "between",
      value: [1, 200],
      weight: 3,
    },
    {
      id: "b-young",
      label: "Founded 2018 or later",
      field: "founded_year",
      operator: "gte",
      value: 2018,
      weight: 2,
    },
    {
      id: "b-plg-stack",
      label: "Product-led tooling in the stack",
      field: "tech_stack",
      operator: "contains_any",
      value: ["segment", "stripe", "postgres"],
      weight: 2,
    },
    {
      id: "b-eng-hiring",
      label: "Hiring engineers, not sellers",
      field: "hiring_signals",
      operator: "contains_any",
      value: ["hiring_eng", "hiring_security"],
      weight: 3,
    },
    {
      id: "b-early-funding",
      label: "Seed or Series A",
      field: "funding_stage",
      operator: "in",
      value: ["seed", "series_a"],
      weight: 2,
    },
  ],
  disqualifiers: [
    {
      id: "b-dq-enterprise-scale",
      field: "employee_count",
      operator: "gte",
      value: 2000,
      reason: "Too large for a product-led motion",
    },
  ],
} satisfies IcpDefinition);

export const RIVAL_PAIR = {
  id: "rival",
  label: "Two unrelated ICPs",
  summary:
    "Mid-market against early-stage product-led. No shared ancestry, so the outcome diff computes and per-edit attribution is refused by name.",
  icpA: midMarketSaas,
  icpB: earlyStageProductLed,
  provenance: { kind: "none" } as const,
} satisfies Revision;
