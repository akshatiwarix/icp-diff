/**
 * The ten traps, each pinned to a named account.
 *
 * A corpus that cannot produce a verdict makes the feature that computes it
 * undemonstrable — and, worse, makes a regression in that feature invisible. So
 * every distinct case the engine can report has a fixture here, found by
 * searching the corpus rather than assumed: the numbers in each `expect` note
 * were read off the engine, and five accounts were authored specifically because
 * the case did not otherwise occur.
 *
 * All ten hold for the `q3` revision at threshold 52, which is why 52 is the
 * default the app loads with. Tests in `lib/diff/` assert them; the sweep asserts
 * the invariants that must hold everywhere else.
 */

export type Trap = {
  n: number;
  name: string;
  /** The account that carries it, or `null` for an edit-level trap. */
  companyId: string | null;
  /** The atom or unit involved, where the trap is about a specific edit. */
  atomIds?: string[];
  /** What it proves, and the numbers it proves it with. */
  note: string;
};

/** The threshold at which every trap below holds, and the app's default. */
export const TRAP_THRESHOLD = 52;
export const TRAP_REVISION_ID = "q3";
/** The top-N used by the displacement trap. */
export const TRAP_TOP_N = 20;

export const TRAPS: Trap[] = [
  {
    n: 1,
    name: "Near-threshold flipper",
    companyId: "lumen-hr",
    note: "A 50, B 54. `gained` for thresholds 51–54 and nothing else — a four-point band out of a hundred and one. Identical in the movement table to hazelmere, which gains across forty-five. This is the pair that makes the band strip necessary rather than decorative. (larkspur-sec is a second instance, same band.)",
  },
  {
    n: 2,
    name: "Structural gainer",
    companyId: "hazelmere",
    note: "A 17, B 62. `gained` across thresholds 18–62. Four edits land on it at once and no single one of them is sufficient — at threshold 52 two are necessary-but-not-sufficient, which is what an interaction looks like when it is reported honestly instead of averaged into a share.",
  },
  {
    n: 3,
    name: "Disqualifier-only loss",
    companyId: "harborstack",
    atomIds: ["disqualifier_value_changed:dq-enterprise"],
    note: "A 83. Under B its fit *improved* — 88 if you withhold the enterprise-threshold change — and it is `newly_disqualified` anyway, because 4,200 employees crossed the new 3,000 handoff. A score-ranked diff would show this account rising. The verdict has to lead with the disqualifier, and the breakdown has to keep the criteria that would have matched.",
  },
  {
    n: 4,
    name: "Released account",
    companyId: "kestrel-ops",
    atomIds: ["disqualifier_removed:dq-budget"],
    note: "Disqualified under A by a hiring freeze, scoring 58 under B. `undisqualified` is a verdict of its own because 'was excluded by a hard rule, now is not' is a different event from 'went up in score'. Three more accounts (meridian-hr, windrow-hr, tinsel-retail) come with it, and tinsel-retail lands at 38 — released and still not qualified.",
  },
  {
    n: 5,
    name: "Interaction",
    companyId: "wickerdown",
    atomIds: ["value_changed:headcount", "weight_changed:gtm-hiring"],
    note: "A 50, B 69, `gained`. Loosening headcount alone gets it in; tripling the GTM weight alone also gets it in. So both are sufficient and *neither is necessary* — the honest answer to 'which edit did it' is 'either would have'. A Shapley value would have split the credit 0.5/0.5 and been read as a measurement.",
  },
  {
    n: 6,
    name: "Linked atom group",
    companyId: "calderwood",
    atomIds: ["operator_changed:revenue", "value_changed:revenue"],
    note: "The revenue floor becomes a band: `gte 10000000` → `between [5000000, 500000000]`. Neither half can be ablated alone — a [min, max] pair cannot be evaluated under `gte` — so they share one sufficient/necessary verdict. Calderwood's $7M revenue matches the band and missed the floor, and the pair is necessary for its gain: withhold it and B drops from 58 to 50.",
  },
  {
    n: 7,
    name: "Displacement",
    companyId: "orbital-crm",
    note: "Top-N only, N=20. Its own score *rose*, 89 → 92, and its rank fell from 13 to 21. Nothing about its fit changed; accounts that match the newly-tripled GTM weight passed it. Blaming an edit here would be a fabricated causal claim, so the cause is `displacement` and the report names who overtook it. (palewick and polder-fin are the same story.)",
  },
  {
    n: 8,
    name: "Null field",
    companyId: "ashbourne-edu",
    note: "The twin of calderwood — same headcount, industry, geography, funding and stack — with `annual_revenue_usd: null`. The revenue loosening that gained calderwood does nothing here, because a null field never matches. B 50 against calderwood's 58: same edit, opposite outcome, and the breakdown says 'annual_revenue_usd is missing' rather than reporting a comparison that never ran.",
  },
  {
    n: 9,
    name: "Zero-movement edit",
    companyId: null,
    atomIds: ["disqualifier_added:dq-sanctioned"],
    note: "An exclusion for KP and SY, added in good faith, matching nobody in the corpus. It changes no score and no verdict at any of the 101 thresholds in either mode, and the ledger says so with a flat badge. 'This edit did nothing' is a finding real ICP owners are never handed.",
  },
  {
    n: 10,
    name: "Weight-only mover",
    companyId: "parcelworks",
    atomIds: ["weight_changed:gtm-hiring"],
    note: "A 50, B 58, `gained`, and the only cause is a weight change — no criterion added, none removed, no value touched. Its mirror is foxglove-soft, which is `lost` at 56 → 38 partly because the GTM weight it does *not* match tripled the denominator. An edit to a criterion you fail can still move you, and that is the case reviewers assume is impossible.",
  },
];

export function trapFor(companyId: string): Trap | undefined {
  return TRAPS.find((trap) => trap.companyId === companyId);
}
