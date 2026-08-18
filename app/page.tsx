/**
 * Placeholder. The console — ledger, movement table, band strip — lands at step
 * 10 of the task order in `PLAN.md`, after the engine and the invariant sweep.
 * Building UI before the sweep means debugging through pixels.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-2xl font-semibold tracking-tight">ICP Diff</h1>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        Day 012 of a 100-day building challenge. The engine is under construction —
        see <code className="font-mono">PLAN.md</code> for the contract.
      </p>
    </main>
  );
}
