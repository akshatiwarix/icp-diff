"use client";

import { useState } from "react";

import type { DiffReport } from "@/lib/diff";
import { changeReview, reportJson } from "@/lib/export/review";

import { Panel, SectionHeading } from "./ui";

/**
 * Two exports, and the difference between them matters.
 *
 * The JSON is the audit trail: every account, every verdict, every band, every
 * (account, edit) sufficient/necessary pair, the ledger, and the refusal state when
 * there is one. The text is a change review assembled from templates — no model
 * writes a word of it, because a fluent summary is exactly where an unlicensed
 * causal claim would enter and be impossible to spot.
 *
 * No CSV. It would drop the causal columns, which are the only reason this report
 * exists.
 */
export function Exports({ report }: { report: DiffReport }) {
  const [shown, setShown] = useState<"none" | "review" | "json">("none");
  const [copied, setCopied] = useState<string | null>(null);

  const review = changeReview(report);
  const json = reportJson(report);
  const body = shown === "review" ? review : shown === "json" ? json : "";

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  }

  function download(text: string, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const slug = report.icpB.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return (
    <Panel className="p-4">
      <SectionHeading hint="no model writes either of these">Export</SectionHeading>

      <div className="flex flex-wrap gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => setShown(shown === "review" ? "none" : "review")}
          className="rounded border border-slate-300 px-2.5 py-1 dark:border-slate-700"
        >
          {shown === "review" ? "Hide" : "Change review"}
        </button>
        <button
          type="button"
          onClick={() => setShown(shown === "json" ? "none" : "json")}
          className="rounded border border-slate-300 px-2.5 py-1 dark:border-slate-700"
        >
          {shown === "json" ? "Hide" : "Full JSON report"}
        </button>
        <button
          type="button"
          onClick={() => copy(review, "review")}
          className="rounded border border-slate-300 px-2.5 py-1 dark:border-slate-700"
        >
          {copied === "review" ? "Copied" : "Copy review"}
        </button>
        <button
          type="button"
          onClick={() => download(json, `${slug}-diff.json`, "application/json")}
          className="rounded border border-slate-300 px-2.5 py-1 dark:border-slate-700"
        >
          Download JSON
        </button>
      </div>

      {shown !== "none" ? (
        <pre className="mt-3 max-h-96 overflow-auto rounded bg-slate-50 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 dark:bg-slate-950/60 dark:text-slate-200">
          {body}
        </pre>
      ) : null}
    </Panel>
  );
}
