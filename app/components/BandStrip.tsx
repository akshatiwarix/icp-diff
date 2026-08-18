import { describeBands, type AccountBands } from "@/lib/diff";

import { Num } from "./ui";

/**
 * The band strip: where a verdict holds, drawn to scale.
 *
 * This component is the reason the engine walks the whole axis. Two accounts can
 * be identical in the movement table — both `gained`, both with a plausible score
 * jump — while one is gained across forty-five thresholds and the other across
 * four. The table cannot show that difference. A bar can, immediately, without the
 * reader having to compare two numbers and do arithmetic.
 *
 * Drawn as a filled span over the full axis, with a tick at the current cutoff.
 */
export function BandStrip({
  bands,
  position,
  margin,
  compact = false,
}: {
  bands: AccountBands;
  position: number;
  margin: number | null;
  compact?: boolean;
}) {
  const span = bands.axisTo - bands.axisFrom;
  const pct = (value: number) => (span === 0 ? 0 : ((value - bands.axisFrom) / span) * 100);

  const width = bands.verdictHolds.reduce(
    (total, band) => total + (band.to - band.from + 1),
    0,
  );
  const total = span + 1;
  const wholeAxis = width === total;

  return (
    <div className={compact ? "w-32" : "w-full"}>
      <div
        className="relative h-4 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800"
        title={`holds at ${describeBands(bands.verdictHolds)} of ${bands.axisFrom}–${bands.axisTo}`}
      >
        {bands.verdictHolds.map((band) => (
          <div
            key={`${band.from}-${band.to}`}
            className={
              wholeAxis
                ? "absolute inset-y-0 bg-slate-400 dark:bg-slate-600"
                : "absolute inset-y-0 bg-slate-800 dark:bg-slate-300"
            }
            style={{
              left: `${pct(band.from)}%`,
              width: `${Math.max(1.2, ((band.to - band.from + 1) / total) * 100)}%`,
            }}
          />
        ))}
        <div
          className="absolute inset-y-0 w-px bg-rose-500"
          style={{ left: `${pct(position)}%` }}
          aria-hidden
        />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <Num>{describeBands(bands.verdictHolds)}</Num>
        <span>
          {margin === null ? (
            <span title="this verdict holds across the whole axis — it does not depend on the cutoff">
              cutoff-independent
            </span>
          ) : (
            <span title="how far the cutoff can move before this verdict stops holding">
              ±<Num>{margin}</Num>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** The A-vs-B qualified spans, for the expanded row. */
export function QualifiedStrip({ bands }: { bands: AccountBands }) {
  const span = bands.axisTo - bands.axisFrom;
  const pct = (value: number) => (span === 0 ? 0 : ((value - bands.axisFrom) / span) * 100);
  const total = span + 1;

  const row = (label: string, ranges: AccountBands["qualifiedA"], tone: string) => (
    <div className="flex items-center gap-2">
      <span className="w-6 text-[10px] text-slate-500 dark:text-slate-400">{label}</span>
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm bg-slate-100 dark:bg-slate-800">
        {ranges.map((band) => (
          <div
            key={`${band.from}-${band.to}`}
            className={`absolute inset-y-0 ${tone}`}
            style={{
              left: `${pct(band.from)}%`,
              width: `${Math.max(0.8, ((band.to - band.from + 1) / total) * 100)}%`,
            }}
          />
        ))}
      </div>
      <span className="w-24 text-right text-[10px] text-slate-500 dark:text-slate-400">
        {describeBands(ranges)}
      </span>
    </div>
  );

  return (
    <div className="space-y-1">
      {row("A", bands.qualifiedA, "bg-slate-400 dark:bg-slate-600")}
      {row("B", bands.qualifiedB, "bg-slate-800 dark:bg-slate-300")}
    </div>
  );
}
