import type { AccountDiff } from "@/lib/diff";
import type { CriterionEvaluation, DisqualifierEvaluation } from "@/lib/scoring";

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
export function Breakdown({ account }: { account: AccountDiff }) {
  const byId = new Map(account.breakdown.a.criteria.map((c) => [c.criterionId, c]));
  const dqById = new Map(account.breakdown.a.disqualifiers.map((d) => [d.disqualifierId, d]));

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
        />
        <CriteriaColumn
          heading="ICP B"
          score={account.b.score}
          disqualified={account.b.disqualified}
          criteria={account.breakdown.b.criteria}
          disqualifiers={account.breakdown.b.disqualifiers}
          other={byId}
          otherDq={dqById}
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
}: {
  heading: string;
  score: number;
  disqualified: boolean;
  criteria: CriterionEvaluation[];
  disqualifiers: DisqualifierEvaluation[];
  /** ICP A's evaluations, so the B column can mark what changed. */
  other: Map<string, CriterionEvaluation> | null;
  otherDq: Map<string, DisqualifierEvaluation> | null;
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
