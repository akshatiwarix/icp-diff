import type { Verdict } from "@/lib/diff";

/** Shared presentational bits. Nothing here decides a verdict or a cause. */

export const VERDICT_STYLE: Record<
  Verdict,
  { readonly chip: string; readonly label: string; readonly hint: string }
> = {
  gained: {
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
    label: "Gained",
    hint: "did not qualify under A, qualifies under B",
  },
  lost: {
    chip: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300",
    label: "Lost",
    hint: "qualified under A, does not under B",
  },
  newly_disqualified: {
    chip: "bg-rose-200 text-rose-950 dark:bg-rose-900 dark:text-rose-200",
    label: "Disqualified",
    hint: "excluded by a hard rule under B — the score is a consequence, not the cause",
  },
  undisqualified: {
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-300",
    label: "Released",
    hint: "was excluded by a hard rule under A and is not under B",
  },
  held_in: {
    chip: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    label: "Held in",
    hint: "qualified under both",
  },
  held_out: {
    chip: "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500",
    label: "Held out",
    hint: "qualified under neither",
  },
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLE[verdict];
  return (
    <span
      title={style.hint}
      className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${style.chip}`}
    >
      {style.label}
    </span>
  );
}

/**
 * The four attribution states, as two letters.
 *
 * `S` for sufficient, `N` for necessary. Both, one, or neither — and never a
 * number. The `title` carries the full sentence, because the two letters are a
 * shorthand for people who have already read what they mean once.
 */
export function CauseChip({
  label,
  sufficient,
  necessary,
  selected,
  onClick,
  title,
}: {
  label: string;
  sufficient?: boolean;
  necessary?: boolean;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const marks = [sufficient ? "S" : null, necessary ? "N" : null].filter(Boolean).join("");
  const interaction = sufficient !== undefined && necessary !== undefined && sufficient !== necessary;

  const tone = interaction
    ? "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
    : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  const ring = selected ? "ring-2 ring-slate-900 dark:ring-slate-100" : "";

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-px text-left text-[11px] ${tone} ${ring} ${onClick ? "cursor-pointer hover:border-slate-500" : "cursor-default"}`}
    >
      <span className="truncate">{label}</span>
      {marks ? <span className="font-mono text-[10px] opacity-70">{marks}</span> : null}
    </button>
  );
}

export function Num({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono tabular-nums ${className}`}>{children}</span>;
}

export function SectionHeading({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-[11px] font-semibold tracking-widest text-slate-500 uppercase dark:text-slate-400">
        {children}
      </h2>
      {hint ? <span className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</span> : null}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 ${className}`}
    >
      {children}
    </section>
  );
}
