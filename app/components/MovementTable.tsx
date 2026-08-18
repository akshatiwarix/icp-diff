"use client";

import { describeCause, type AccountDiff, type DiffReport } from "@/lib/diff";
import type { IcpDefinition } from "@/lib/scoring";

import { BandStrip } from "./BandStrip";
import { Breakdown } from "./Breakdown";
import { CauseChip, Num, Panel, SectionHeading, VerdictChip } from "./ui";

export type TableFilter = "movers" | "all";

/**
 * The movement table: one row per account, causes as chips, fragility beside it.
 *
 * Every account is always in the report. Filtering to movers is a *view*, never a
 * subset of the data — `held_in` and `held_out` are answers, and an ICP change that
 * moved four accounts out of seventy-seven is a much more useful thing to know than
 * a list of four accounts with no denominator.
 */
export function MovementTable({
  report,
  icpA,
  icpB,
  filter,
  onFilterChange,
  selectedAtomId,
  expandedId,
  onExpand,
}: {
  report: DiffReport;
  icpA: IcpDefinition;
  icpB: IcpDefinition;
  filter: TableFilter;
  onFilterChange: (filter: TableFilter) => void;
  selectedAtomId: string | null;
  expandedId: string | null;
  onExpand: (companyId: string | null) => void;
}) {
  const describeAtomId = (atomId: string) => {
    if (report.attribution.state !== "attributed") return atomId;
    return report.attribution.ledger.find((entry) => entry.atomId === atomId)?.description ?? atomId;
  };

  const movers = report.accounts.filter(
    (account) => account.verdict !== "held_in" && account.verdict !== "held_out",
  );

  let rows = filter === "movers" ? movers : report.accounts;
  if (selectedAtomId) {
    rows = rows.filter((account) =>
      account.causes.some(
        (cause) =>
          (cause.kind === "edit" && cause.atomId === selectedAtomId) ||
          (cause.kind === "combination" && cause.atomIds.includes(selectedAtomId)),
      ),
    );
  }

  const position = report.mode.kind === "threshold" ? report.mode.threshold : report.mode.topN;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <SectionHeading
          hint={`${rows.length} of ${report.accounts.length} shown · ${movers.length} moved`}
        >
          Movement
        </SectionHeading>
        <div className="flex gap-1 text-[11px]">
          {(["movers", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFilterChange(option)}
              className={`rounded px-2 py-0.5 ${
                filter === option
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              }`}
            >
              {option === "movers" ? "Moved" : "All accounts"}
            </button>
          ))}
        </div>
      </div>

      {selectedAtomId ? (
        <p className="mx-4 mt-1 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Filtered to accounts caused by{" "}
          <span className="font-medium">{describeAtomId(selectedAtomId)}</span>. Click the ledger row
          again to clear.
        </p>
      ) : null}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <th className="px-4 py-1.5 font-medium">Account</th>
              <th className="px-2 py-1.5 font-medium">Verdict</th>
              <th className="px-2 py-1.5 text-right font-medium">A</th>
              <th className="px-2 py-1.5 text-right font-medium">B</th>
              <th className="px-2 py-1.5 font-medium">Holds at</th>
              <th className="px-2 py-1.5 font-medium">Because</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((account) => (
              <Row
                key={account.companyId}
                account={account}
                icpA={icpA}
                icpB={icpB}
                position={position}
                expanded={expandedId === account.companyId}
                onExpand={() => onExpand(expandedId === account.companyId ? null : account.companyId)}
                describeAtomId={describeAtomId}
                selectedAtomId={selectedAtomId}
              />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  Nothing here at this cutoff. That is a result, not an empty state — move the
                  slider and watch it fill.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Row({
  account,
  icpA,
  icpB,
  position,
  expanded,
  onExpand,
  describeAtomId,
  selectedAtomId,
}: {
  account: AccountDiff;
  icpA: IcpDefinition;
  icpB: IcpDefinition;
  position: number;
  expanded: boolean;
  onExpand: () => void;
  describeAtomId: (atomId: string) => string;
  selectedAtomId: string | null;
}) {
  const held = account.verdict === "held_in" || account.verdict === "held_out";

  return (
    <>
      <tr
        onClick={onExpand}
        className={`cursor-pointer border-b border-slate-100 align-top hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/30 ${
          expanded ? "bg-slate-50 dark:bg-slate-800/40" : ""
        }`}
      >
        <td className="px-4 py-2">
          <span className="text-slate-900 dark:text-slate-100">{account.companyName}</span>
          <span className="block font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {account.companyId}
          </span>
        </td>
        <td className="px-2 py-2">
          <VerdictChip verdict={account.verdict} />
          {account.rankDelta !== null && account.rankDelta !== 0 ? (
            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
              rank {account.rankDelta > 0 ? "+" : ""}
              <Num>{account.rankDelta}</Num>
            </span>
          ) : null}
        </td>
        <td className="px-2 py-2 text-right">
          <Num className={account.a.disqualified ? "text-rose-500" : ""}>
            {account.a.disqualified ? "dq" : account.a.score}
          </Num>
          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
            #<Num>{account.a.rank}</Num>
          </span>
        </td>
        <td className="px-2 py-2 text-right">
          <Num className={account.b.disqualified ? "text-rose-500" : ""}>
            {account.b.disqualified ? "dq" : account.b.score}
          </Num>
          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
            #<Num>{account.b.rank}</Num>
          </span>
        </td>
        <td className="px-2 py-2">
          <BandStrip bands={account.bands} position={position} margin={account.margin} compact />
        </td>
        <td className="px-2 py-2">
          {account.causes.length === 0 ? (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {held ? "nothing changed for it" : "—"}
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {account.causes.map((cause, index) => {
                if (cause.kind === "displacement") {
                  return (
                    <CauseChip
                      key={`displacement-${index}`}
                      label={`displaced by ${cause.overtakenBy.length}`}
                      title={describeCause(cause, describeAtomId)}
                    />
                  );
                }
                if (cause.kind === "combination") {
                  return (
                    <CauseChip
                      key={`combination-${index}`}
                      label="no single edit"
                      title={describeCause(cause, describeAtomId)}
                    />
                  );
                }
                return (
                  <CauseChip
                    key={cause.atomId}
                    label={describeAtomId(cause.atomId)}
                    sufficient={cause.sufficient}
                    necessary={cause.necessary}
                    selected={selectedAtomId === cause.atomId}
                    title={describeCause(cause, describeAtomId)}
                  />
                );
              })}
            </div>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="p-0">
            <Breakdown account={account} icpA={icpA} icpB={icpB} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
