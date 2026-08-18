"use client";

import { useState } from "react";

import { partitionAtoms } from "@/data/schema";
import { applyEdits, atomId, describeAtom, type EditAtom } from "@/lib/diff";
import type { IcpDefinition } from "@/lib/scoring";

import { Num, Panel, SectionHeading } from "./ui";

/**
 * Authoring ICP B as a delta.
 *
 * You do not edit ICP B here. You add *edits*, and B is what the edits produce —
 * which is the same relationship `data/presets.ts` has to its revisions, and the
 * reason attribution is possible at all. An ICP B typed in directly would have no
 * provenance and would land in the `unattributed` state by construction.
 *
 * The manual form covers the four atom kinds that need no free-text parsing:
 * weight changes, criterion removal, disqualifier removal, and numeric value
 * changes. The prose panel reaches all eight — it is the same eight-atom union on
 * the other side of `/api/parse-edits`, and every atom it returns is shown here
 * before it is applied.
 */

type ManualKind = "weight_changed" | "criterion_removed" | "disqualifier_removed" | "value_changed";

const NUMERIC_OPERATORS = ["gte", "lte", "between"] as const;

export function EditAuthor({
  icpA,
  currentEdits,
  extraEdits,
  onChange,
  attributable,
}: {
  icpA: IcpDefinition;
  /** The revision's own edits, so a new atom can be checked against the whole list. */
  currentEdits: EditAtom[];
  extraEdits: EditAtom[];
  onChange: (edits: EditAtom[]) => void;
  attributable: boolean;
}) {
  const [kind, setKind] = useState<ManualKind>("weight_changed");
  const [targetId, setTargetId] = useState(icpA.criteria[0]?.id ?? "");
  const [weight, setWeight] = useState("5");
  const [low, setLow] = useState("");
  const [high, setHigh] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [prose, setProse] = useState("");
  const [proseBusy, setProseBusy] = useState(false);
  const [proseError, setProseError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{ reason: string }[]>([]);

  if (!attributable) {
    return (
      <Panel className="p-4">
        <SectionHeading>Author an edit</SectionHeading>
        <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
          Not available for a pair with no common ancestor. An edit authored here would be an edit
          <em> from ICP A</em>, and this ICP B did not come from ICP A — applying one would produce a
          third definition that is neither. Pick a derived revision to author against.
        </p>
      </Panel>
    );
  }

  const criterion = icpA.criteria.find((candidate) => candidate.id === targetId);

  function add(atom: EditAtom) {
    const next = [...currentEdits, ...extraEdits, atom];
    const { rejected: illegal } = partitionAtoms(next, icpA);
    const problem = illegal.find((entry) => atomId(entry.atom as EditAtom) === atomId(atom));
    if (problem) {
      setError(problem.reason);
      return;
    }
    const applied = applyEdits(icpA, next);
    if (!applied.ok) {
      setError(applied.reason);
      return;
    }
    setError(null);
    onChange([...extraEdits, atom]);
  }

  function submitManual() {
    if (kind === "criterion_removed") {
      add({ kind: "criterion_removed", criterionId: targetId });
      return;
    }
    if (kind === "disqualifier_removed") {
      add({ kind: "disqualifier_removed", disqualifierId: targetId });
      return;
    }
    if (!criterion) {
      setError("Pick a criterion first.");
      return;
    }
    if (kind === "weight_changed") {
      const value = Number(weight);
      if (!Number.isFinite(value) || value < 0) {
        setError("A weight is a number of zero or more.");
        return;
      }
      add({ kind: "weight_changed", criterionId: criterion.id, from: criterion.weight, to: value });
      return;
    }

    // value_changed, numeric operators only.
    const lowValue = Number(low);
    if (!Number.isFinite(lowValue)) {
      setError("Enter a number.");
      return;
    }
    if (criterion.operator === "between") {
      const highValue = Number(high);
      if (!Number.isFinite(highValue)) {
        setError("A range needs both bounds.");
        return;
      }
      add({
        kind: "value_changed",
        criterionId: criterion.id,
        from: criterion.value,
        to: [Math.min(lowValue, highValue), Math.max(lowValue, highValue)],
      });
      return;
    }
    add({ kind: "value_changed", criterionId: criterion.id, from: criterion.value, to: lowValue });
  }

  async function submitProse() {
    setProseBusy(true);
    setProseError(null);
    setRejected([]);
    try {
      const response = await fetch("/api/parse-edits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ icp: icpA, prose }),
      });
      const payload = (await response.json()) as {
        error?: string;
        atoms?: EditAtom[];
        rejected?: { reason: string }[];
      };
      if (!response.ok) {
        setProseError(payload.error ?? "The request failed.");
        setRejected(payload.rejected ?? []);
        return;
      }
      setRejected(payload.rejected ?? []);
      const atoms = payload.atoms ?? [];
      if (atoms.length === 0) {
        setProseError("Nothing in that instruction named a concrete change to one of the eight kinds.");
        return;
      }
      const next = [...currentEdits, ...extraEdits, ...atoms];
      const applied = applyEdits(icpA, next);
      if (!applied.ok) {
        setProseError(`Those edits do not combine with the revision: ${applied.reason}`);
        return;
      }
      onChange([...extraEdits, ...atoms]);
      setProse("");
    } catch {
      setProseError("The request failed.");
    } finally {
      setProseBusy(false);
    }
  }

  const options =
    kind === "disqualifier_removed"
      ? icpA.disqualifiers.map((disqualifier) => ({ id: disqualifier.id, label: disqualifier.reason }))
      : icpA.criteria
          .filter((candidate) =>
            kind === "value_changed"
              ? (NUMERIC_OPERATORS as readonly string[]).includes(candidate.operator)
              : true,
          )
          .map((candidate) => ({ id: candidate.id, label: candidate.label }));

  return (
    <Panel className="p-4">
      <SectionHeading hint={extraEdits.length > 0 ? `${extraEdits.length} added` : undefined}>
        Author an edit
      </SectionHeading>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as ManualKind;
              setKind(next);
              setError(null);
              const first =
                next === "disqualifier_removed"
                  ? icpA.disqualifiers[0]?.id
                  : icpA.criteria.find((candidate) =>
                      next === "value_changed"
                        ? (NUMERIC_OPERATORS as readonly string[]).includes(candidate.operator)
                        : true,
                    )?.id;
              setTargetId(first ?? "");
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="weight_changed">change a weight</option>
            <option value="value_changed">change a numeric value</option>
            <option value="criterion_removed">remove a criterion</option>
            <option value="disqualifier_removed">remove a disqualifier</option>
          </select>

          <select
            value={targetId}
            onChange={(event) => {
              setTargetId(event.target.value);
              setError(null);
            }}
            className="min-w-[12rem] flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
          >
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {kind === "weight_changed" ? (
          <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400">
            <span>
              from <Num>{criterion?.weight ?? "—"}</Num> to
            </span>
            <input
              type="number"
              min={0}
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              className="w-20 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        ) : null}

        {kind === "value_changed" ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400">
            <span className="font-mono text-[11px]">
              {criterion?.operator} {JSON.stringify(criterion?.value)} →
            </span>
            <input
              type="number"
              value={low}
              placeholder={criterion?.operator === "between" ? "min" : "value"}
              onChange={(event) => setLow(event.target.value)}
              className="w-28 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
            />
            {criterion?.operator === "between" ? (
              <input
                type="number"
                value={high}
                placeholder="max"
                onChange={(event) => setHigh(event.target.value)}
                className="w-28 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900"
              />
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          onClick={submitManual}
          className="rounded bg-slate-900 px-3 py-1 text-[12px] text-white dark:bg-slate-100 dark:text-slate-900"
        >
          Add to the ledger
        </button>

        {error ? (
          <p className="rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
        <label className="block text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
          Or describe the change
        </label>
        <textarea
          value={prose}
          onChange={(event) => setProse(event.target.value)}
          rows={2}
          placeholder="drop the enterprise cutoff to 5,000 and stop caring about the CRM"
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            disabled={proseBusy || prose.trim().length < 5}
            onClick={submitProse}
            className="rounded border border-slate-300 px-3 py-1 text-[12px] disabled:opacity-50 dark:border-slate-700"
          >
            {proseBusy ? "Parsing…" : "Parse into edits"}
          </button>
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            the model returns typed atoms only — it never sees the corpus or the scores
          </span>
        </div>

        {proseError ? (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            {proseError}
          </p>
        ) : null}

        {rejected.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {rejected.map((entry, index) => (
              <li
                key={index}
                className="rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-800 dark:bg-rose-950/60 dark:text-rose-200"
              >
                rejected — {entry.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {extraEdits.length > 0 ? (
        <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
          <p className="mb-1 text-[11px] tracking-widest text-slate-500 uppercase dark:text-slate-400">
            Added to this revision
          </p>
          <ul className="space-y-0.5">
            {extraEdits.map((atom) => (
              <li key={atomId(atom)} className="flex items-baseline gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => onChange(extraEdits.filter((other) => atomId(other) !== atomId(atom)))}
                  title="remove this edit"
                  className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  ✕
                </button>
                <span className="text-slate-700 dark:text-slate-300">{describeAtom(atom)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
