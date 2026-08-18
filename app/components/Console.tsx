"use client";

import { useMemo, useState } from "react";

import { buildDiff, type EditAtom, type Mode, type Provenance } from "@/lib/diff";
import type { Company, IcpDefinition } from "@/lib/scoring";

import { Ledger } from "./Ledger";
import { MovementTable, type TableFilter } from "./MovementTable";
import { Num, Panel, VerdictChip } from "./ui";
import { VERDICT_STYLE } from "./ui";

export type ConsolePair = {
  id: string;
  label: string;
  summary: string;
  icpA: IcpDefinition;
  icpB: IcpDefinition;
  provenance: Provenance;
};

/**
 * The console.
 *
 * The engine runs *here*, in the browser, on every threshold change. It is pure and
 * cheap — 77 accounts, seven ablations, two axis walks — so the slider recomputes
 * without a round trip, and `POST /api/diff` runs the identical function for
 * programmatic callers. Two implementations would eventually disagree; there is
 * only one, and `equivalence.test.ts` holds it to that.
 *
 * Everything below is presentation. No component decides a verdict, a cause, a band
 * or a margin.
 */
export function Console({
  corpus,
  pairs,
  defaultPairId,
  defaultThreshold,
  defaultTopN,
}: {
  corpus: Company[];
  pairs: ConsolePair[];
  defaultPairId: string;
  defaultThreshold: number;
  defaultTopN: number;
}) {
  const [pairId, setPairId] = useState(defaultPairId);
  const [modeKind, setModeKind] = useState<Mode["kind"]>("threshold");
  const [threshold, setThreshold] = useState(defaultThreshold);
  const [topN, setTopN] = useState(defaultTopN);
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TableFilter>("movers");
  const [extraEdits, setExtraEdits] = useState<EditAtom[]>([]);

  const pair = pairs.find((candidate) => candidate.id === pairId) ?? pairs[0];

  /**
   * The mode is built *inside* the memo, on the two primitives it depends on.
   *
   * Built outside, it is a fresh object identity every render, so the memo misses
   * every time and the engine reruns on each keystroke in an unrelated input. The
   * engine is cheap but it is not free — seven ablations and two axis walks per
   * report — and a slider that recomputes twice per drag frame stops feeling
   * instant, which is the one property that justified shipping the engine to the
   * browser at all.
   */
  const result = useMemo(() => {
    if (!pair) return null;
    const mode: Mode =
      modeKind === "threshold" ? { kind: "threshold", threshold } : { kind: "top_n", topN };
    return buildDiff({
      corpus,
      icpA: pair.icpA,
      icpB: pair.icpB,
      provenance: pair.provenance,
      mode,
    });
  }, [corpus, pair, modeKind, threshold, topN]);

  if (!pair || !result) return null;

  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="text-lg font-semibold">The diff was refused.</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{result.reason}</p>
      </main>
    );
  }

  const report = result.report;
  const combinationMoves =
    report.attribution.state === "attributed" ? report.attribution.combinationMoves : 0;

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 lg:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          ICP Diff
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          Two ICP definitions over one fixed corpus of <Num>{report.corpusSize}</Num> accounts. Every
          account that moved names the atomic edit that moved it — earned twice, as{" "}
          <em>sufficient on its own</em> and <em>necessary for the move</em> — and there is no number
          claiming how much any edit mattered. When ICP B has no ancestry in ICP A, attribution is
          refused by name rather than guessed.
        </p>
      </header>

      <Controls
        pairs={pairs}
        pairId={pair.id}
        onPairChange={(next) => {
          setPairId(next);
          setSelectedAtomId(null);
          setExpandedId(null);
          setExtraEdits([]);
        }}
        summary={pair.summary}
        modeKind={modeKind}
        onModeKindChange={setModeKind}
        threshold={threshold}
        onThresholdChange={setThreshold}
        topN={topN}
        onTopNChange={setTopN}
        corpusSize={report.corpusSize}
        counts={report.counts}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(320px,26rem)_1fr]">
        <div className="space-y-5">
          <Ledger
            attribution={report.attribution}
            selectedAtomId={selectedAtomId}
            onSelect={setSelectedAtomId}
            combinationMoves={combinationMoves}
          />
          {extraEdits.length > 0 ? (
            <Panel className="p-3 text-[11px] text-slate-500 dark:text-slate-400">
              {extraEdits.length} locally authored edit(s) pending.
            </Panel>
          ) : null}
        </div>

        <MovementTable
          report={report}
          filter={filter}
          onFilterChange={setFilter}
          selectedAtomId={selectedAtomId}
          expandedId={expandedId}
          onExpand={setExpandedId}
        />
      </div>
    </main>
  );
}

function Controls({
  pairs,
  pairId,
  onPairChange,
  summary,
  modeKind,
  onModeKindChange,
  threshold,
  onThresholdChange,
  topN,
  onTopNChange,
  corpusSize,
  counts,
}: {
  pairs: ConsolePair[];
  pairId: string;
  onPairChange: (id: string) => void;
  summary: string;
  modeKind: Mode["kind"];
  onModeKindChange: (kind: Mode["kind"]) => void;
  threshold: number;
  onThresholdChange: (value: number) => void;
  topN: number;
  onTopNChange: (value: number) => void;
  corpusSize: number;
  counts: Record<string, number>;
}) {
  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <label className="text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Revision
          <select
            value={pairId}
            onChange={(event) => onPairChange(event.target.value)}
            className="mt-1 block w-64 rounded border border-slate-300 bg-white px-2 py-1 text-[13px] tracking-normal normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            {pairs.map((pair) => (
              <option key={pair.id} value={pair.id}>
                {pair.label}
              </option>
            ))}
          </select>
        </label>

        <div className="text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Qualifies when
          <div className="mt-1 flex gap-1">
            {(["threshold", "top_n"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => onModeKindChange(kind)}
                className={`rounded px-2 py-1 text-[12px] tracking-normal normal-case ${
                  modeKind === kind
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {kind === "threshold" ? "score ≥ cutoff" : "top N by rank"}
              </button>
            ))}
          </div>
        </div>

        {modeKind === "threshold" ? (
          <label className="min-w-[16rem] flex-1 text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Cutoff <Num className="text-slate-900 dark:text-slate-100">{threshold}</Num>
            <input
              type="range"
              min={0}
              max={100}
              value={threshold}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
              className="mt-1 block w-full accent-slate-900 dark:accent-slate-100"
            />
          </label>
        ) : (
          <label className="min-w-[16rem] flex-1 text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
            N <Num className="text-slate-900 dark:text-slate-100">{topN}</Num> of {corpusSize}
            <input
              type="range"
              min={1}
              max={corpusSize}
              value={topN}
              onChange={(event) => onTopNChange(Number(event.target.value))}
              className="mt-1 block w-full accent-slate-900 dark:accent-slate-100"
            />
          </label>
        )}
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">{summary}</p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200 pt-2 dark:border-slate-800">
        {Object.entries(VERDICT_STYLE).map(([verdict, style]) => (
          <span key={verdict} className="flex items-baseline gap-1.5 text-[11px]">
            <VerdictChip verdict={verdict as keyof typeof VERDICT_STYLE} />
            <Num className="text-slate-900 dark:text-slate-100">{counts[verdict] ?? 0}</Num>
            <span className="text-slate-400 dark:text-slate-500">{style.hint}</span>
          </span>
        ))}
      </div>

      {modeKind === "top_n" ? (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Top-N makes qualification zero-sum: an account can only enter if another leaves. Watch for
          the <span className="font-medium">displaced</span> chip — those accounts lost their slot
          with their own score unchanged or higher, because others rose past them, and no edit is
          blamed for it.
        </p>
      ) : null}
    </Panel>
  );
}
