"use client";

import type { Attribution, LedgerEntry } from "@/lib/diff";

import { Num, Panel, SectionHeading } from "./ui";

/**
 * The ledger: one row per atomic edit, with what it did.
 *
 * Four counts per row, and not one of them is a share. `in` and `out` are how many
 * accounts crossed the line and this edit is named on; `alone` is how many it moves
 * by itself; `needed` is how many would not have moved without it. When `alone` and
 * `needed` disagree, that is an interaction and the row says so.
 *
 * The flat **changed nothing** badge is a shipped finding, not debug output.
 */
export function Ledger({
  attribution,
  selectedAtomId,
  onSelect,
  combinationMoves,
}: {
  attribution: Attribution;
  selectedAtomId: string | null;
  onSelect: (atomId: string | null) => void;
  combinationMoves: number;
}) {
  if (attribution.state === "unattributed") {
    return (
      <Panel className="p-4">
        <SectionHeading>Ledger</SectionHeading>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Unattributed — no common ancestor.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          {attribution.reason}.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          The movement table, the bands and both exports are unaffected — every verdict to the
          right is computed and correct. What is missing is per-edit blame, and it is missing
          because there is no edit list: these two definitions share no criterion ids. Pairing them
          up by field and operator would produce confident sentences about criteria that exist in
          neither.
        </p>
      </Panel>
    );
  }

  return (
    <Panel className="p-4">
      <SectionHeading hint={`${attribution.ledger.length} edits`}>Ledger</SectionHeading>

      <ul className="space-y-1">
        {attribution.ledger.map((entry) => (
          <LedgerRow
            key={entry.atomId}
            entry={entry}
            selected={selectedAtomId === entry.atomId}
            onSelect={() => onSelect(selectedAtomId === entry.atomId ? null : entry.atomId)}
          />
        ))}
      </ul>

      {combinationMoves > 0 ? (
        <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <Num>{combinationMoves}</Num> account{combinationMoves === 1 ? "" : "s"} moved with no
          single edit sufficient or necessary. Those belong to no row here — remove any one edit and
          the move still happens, apply any one alone and it does not.
        </p>
      ) : null}

      <p className="mt-3 border-t border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="font-mono">alone</span> = moves the account on its own.{" "}
        <span className="font-mono">needed</span> = the move does not happen without it. Where they
        disagree the edit is part of an interaction, and there is deliberately no number saying how
        much any edit mattered.
      </p>
    </Panel>
  );
}

function LedgerRow({
  entry,
  selected,
  onSelect,
}: {
  entry: LedgerEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const moved = entry.movedIn + entry.movedOut;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-md border px-2.5 py-2 text-left transition-colors ${
          selected
            ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800/60"
            : "border-transparent hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] leading-snug text-slate-900 dark:text-slate-100">
            {entry.description}
          </span>
          {entry.changedNothing ? (
            <span
              title="this edit changes no account's score, so it changes no verdict at any cutoff, in either mode"
              className="shrink-0 rounded bg-slate-200 px-1.5 py-px text-[10px] tracking-wide text-slate-600 uppercase dark:bg-slate-800 dark:text-slate-400"
            >
              changed nothing
            </span>
          ) : null}
        </div>

        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {entry.atomId}
          </span>
          {entry.linkedWith.length > 0 ? (
            <span
              title={`ablated together with ${entry.linkedWith.join(", ")} — neither half can be applied alone`}
              className="rounded border border-slate-300 px-1 text-[10px] dark:border-slate-700"
            >
              linked
            </span>
          ) : null}
          {moved > 0 ? (
            <>
              <span>
                in <Num className="text-slate-900 dark:text-slate-100">{entry.movedIn}</Num>
              </span>
              <span>
                out <Num className="text-slate-900 dark:text-slate-100">{entry.movedOut}</Num>
              </span>
              <span>
                alone <Num>{entry.sufficientCount}</Num>
              </span>
              <span>
                needed <Num>{entry.necessaryCount}</Num>
              </span>
              {entry.interactionCount > 0 ? (
                <span
                  title="accounts where this edit is sufficient but not necessary, or necessary but not sufficient"
                  className="rounded bg-amber-100 px-1 text-[10px] text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  {entry.interactionCount} interaction
                  {entry.interactionCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </>
          ) : (
            <span>moved nobody at this cutoff</span>
          )}
        </div>
      </button>
    </li>
  );
}
