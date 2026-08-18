import type { AccountDiff } from "@/lib/diff";
import { describeRule } from "@/lib/scoring";
import type {
  Criterion,
  CriterionEvaluation,
  Disqualifier,
  DisqualifierEvaluation,
  IcpDefinition,
} from "@/lib/scoring";

import { QualifiedStrip } from "./BandStrip";
import { Num } from "./ui";

/**
 * Both breakdowns, side by side, with every change marked.
 *
 * Day 001 shows one breakdown and calls it explainability. Two breakdowns is a
 * different claim: you can see not only why the score is what it is, but which
 * evaluation stopped agreeing with itself between the two ICPs — and, from the
 * cause chips above, which edit made it stop.
 *
 * A disqualified account keeps its full criterion list. "Would have been a strong
 * fit except for the headcount rule" is the most useful thing this screen can say,
 * and short-circuiting on the disqualifier throws it away.
 */
export function Breakdown({
  account,
  icpA,
  icpB,
}: {
  account: AccountDiff;
  icpA: IcpDefinition;
  icpB: IcpDefinition;
}) {
  const byId = new Map(account.breakdown.a.criteria.map((c) => [c.criterionId, c]));
  const dqById = new Map(account.breakdown.a.disqualifiers.map((d) => [d.disqualifierId, d]));

  /**
   * A criterion's `label` is user-authored prose and Day 001 renders it verbatim.
   * A `value_changed` edit does not rewrite it, so ICP B can legitimately show
   * "Headcount 100–2,000" over a rule of 50–3,000. The `detail` line underneath is
   * always the truth, but a reader scanning labels would be misled — so where a
   * rule differs between the two ICPs, the operative rule is printed beside the
   * label rather than trusted to it.
   */
  const rules = ruleChanges(icpA, icpB);

  return (
    <div className="space-y-4 border-t border-slate-200 bg-slate-50/60 px-3 py-3 dark:border-slate-800 dark:bg-slate-950/40">
      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Where the verdict holds
        </h4>
        <QualifiedStrip bands={account.bands} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CriteriaColumn
          heading="ICP A"
          score={account.a.score}
          disqualified={account.a.disqualified}
          criteria={account.breakdown.a.criteria}
          disqualifiers={account.breakdown.a.disqualifiers}
          other={null}
          otherDq={null}
          rules={rules.a}
        />
        <CriteriaColumn
          heading="ICP B"
          score={account.b.score}
          disqualified={account.b.disqualified}
          criteria={account.breakdown.b.criteria}
          disqualifiers={account.breakdown.b.disqualifiers}
          other={byId}
          otherDq={dqById}
          rules={rules.b}
        />
      </div>
    </div>
  );
}

function CriteriaColumn({
  heading,
  score,
  disqualified,
  criteria,
  disqualifiers,
  other,
  otherDq,
  rules,
}: {
  heading: string;
  score: number;
  disqualified: boolean;
  criteria: CriterionEvaluation[];
  disqualifiers: DisqualifierEvaluation[];
  /** ICP A's evaluations, so the B column can mark what changed. */
  other: Map<string, CriterionEvaluation> | null;
  otherDq: Map<string, DisqualifierEvaluation> | null;
  /** Rule phrases for the ids whose rule differs between the two ICPs. */
  rules: Map<string, string>;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
          {heading}
        </h4>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          score <Num className="text-slate-900 dark:text-slate-100">{score}</Num>
          {disqualified ? " · disqualified" : ""}
        </span>
      </div>

      <ul className="space-y-0.5">
        {criteria.map((criterion) => {
          const before = other?.get(criterion.criterionId);
          const isNew = other !== null && before === undefined;
          const flipped = before !== undefined && before.matched !== criterion.matched;
          const reweighted = before !== undefined && before.weight !== criterion.weight;

          return (
            <li
              key={criterion.criterionId}
              className={`flex items-baseline gap-2 rounded px-1.5 py-0.5 text-[12px] ${
                isNew || flipped || reweighted
                  ? "bg-amber-50 dark:bg-amber-950/40"
                  : ""
              }`}
            >
              <span
                className={
                  criterion.matched
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-300 dark:text-slate-600"
                }
                aria-hidden
              >
                {criterion.matched ? "●" : "○"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-slate-900 dark:text-slate-100">{criterion.label}</span>
                {rules.has(criterion.criterionId) ? (
                  <span className="ml-1 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                    now {rules.get(criterion.criterionId)}
                  </span>
                ) : null}
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {criterion.detail}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] text-slate-500 dark:text-slate-400">
                {reweighted && before ? (
                  <>
                    <Num className="line-through opacity-60">{before.weight}</Num>{" "}
                    <Num className="text-slate-900 dark:text-slate-100">{criterion.weight}</Num>
                  </>
                ) : (
                  <Num>{criterion.weight}</Num>
                )}
                {isNew ? <span className="ml-1 text-[10px] uppercase">new</span> : null}
              </span>
            </li>
          );
        })}
      </ul>

      {disqualifiers.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-slate-200 pt-1.5 dark:border-slate-800">
          {disqualifiers.map((disqualifier) => {
            const before = otherDq?.get(disqualifier.disqualifierId);
            const isNew = otherDq !== null && before === undefined;
            const flipped = before !== undefined && before.triggered !== disqualifier.triggered;

            return (
              <li
                key={disqualifier.disqualifierId}
                className={`flex items-baseline gap-2 rounded px-1.5 py-0.5 text-[12px] ${
                  isNew || flipped ? "bg-amber-50 dark:bg-amber-950/40" : ""
                }`}
              >
                <span
                  className={
                    disqualifier.triggered
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-slate-300 dark:text-slate-600"
                  }
                  aria-hidden
                >
                  {disqualifier.triggered ? "✕" : "○"}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      disqualifier.triggered
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-slate-600 dark:text-slate-400"
                    }
                  >
                    {disqualifier.reason}
                  </span>
                  {rules.has(disqualifier.disqualifierId) ? (
                    <span className="ml-1 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                      now {rules.get(disqualifier.disqualifierId)}
                    </span>
                  ) : null}
                  <span className="block text-[11px] text-slate-500 dark:text-slate-500">
                    {disqualifier.detail}
                  </span>
                </span>
                {isNew ? (
                  <span className="shrink-0 text-[10px] uppercase text-slate-500">new</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Which ids hold a different rule on each side, and how that rule reads.
 *
 * Only ids present on both sides are compared: something added or removed is
 * already marked `new` or simply absent, and labelling it "changed" as well would
 * be noise on the row that is easiest to read correctly.
 */
function ruleChanges(
  icpA: IcpDefinition,
  icpB: IcpDefinition,
): { a: Map<string, string>; b: Map<string, string> } {
  const a = new Map<string, string>();
  const b = new Map<string, string>();

  const compare = (
    left: (Criterion | Disqualifier)[],
    right: (Criterion | Disqualifier)[],
  ) => {
    const rightById = new Map(right.map((entry) => [entry.id, entry]));
    for (const entry of left) {
      const counterpart = rightById.get(entry.id);
      if (!counterpart) continue;
      const same =
        entry.operator === counterpart.operator &&
        JSON.stringify(entry.value) === JSON.stringify(counterpart.value);
      if (same) continue;
      a.set(entry.id, describeRule(entry));
      b.set(counterpart.id, describeRule(counterpart));
    }
  };

  compare(icpA.criteria, icpB.criteria);
  compare(icpA.disqualifiers, icpB.disqualifiers);

  return { a, b };
}
