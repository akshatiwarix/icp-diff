import { CORPUS } from "@/data/corpus";
import { DEFAULT_REVISION_ID, REVISIONS, RIVAL_PAIR } from "@/data/presets";
import { TRAP_THRESHOLD, TRAP_TOP_N } from "@/data/traps";

import { Console } from "./components/Console";

/**
 * A server component whose only job is to hand the validated corpus and the
 * derived revisions to the console. Zod runs here, at import time; the browser
 * gets data that has already passed it, and the pure engine that runs on both
 * sides imports neither Zod nor this file.
 *
 * The default cutoff is `TRAP_THRESHOLD`. Every one of the ten engineered cases in
 * `data/traps.ts` is visible at it, which is why the app opens there rather than at
 * a round number.
 */
export default function Home() {
  return (
    <Console
      corpus={CORPUS}
      pairs={[
        ...REVISIONS.map((revision) => ({
          id: revision.id,
          label: revision.label,
          summary: revision.summary,
          icpA: revision.icpA,
          icpB: revision.icpB,
          provenance: revision.provenance,
        })),
        {
          id: RIVAL_PAIR.id,
          label: RIVAL_PAIR.label,
          summary: RIVAL_PAIR.summary,
          icpA: RIVAL_PAIR.icpA,
          icpB: RIVAL_PAIR.icpB,
          provenance: RIVAL_PAIR.provenance,
        },
      ]}
      defaultPairId={DEFAULT_REVISION_ID}
      defaultThreshold={TRAP_THRESHOLD}
      defaultTopN={TRAP_TOP_N}
    />
  );
}
