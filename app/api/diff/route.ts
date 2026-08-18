import { CORPUS } from "@/data/corpus";
import { diffRequestSchema, formatIssues } from "@/data/schema";
import { buildDiff } from "@/lib/diff";

/**
 * POST /api/diff
 *
 * Body: `{ icpA, icpB, provenance?, mode?, companies? }`. Returns the full
 * `DiffReport` — every account, its verdict, its bands, its causes, the ledger,
 * and the `unattributed` refusal when there is no provenance.
 *
 * This route runs *the same function the browser runs*. It is not a server-side
 * reimplementation and must never become one: `equivalence.test.ts` asserts the
 * two produce identical reports, and the reason that test exists is that two code
 * paths computing verdicts differently is a bug nobody finds until they compare a
 * screenshot to a curl.
 *
 * No key needed, no rate limit, no model. This endpoint is the whole product; the
 * one that needs a key only translates prose into edits.
 */

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const parsed = diffRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "The request does not describe two ICPs.", issues: formatIssues(parsed.error) },
      { status: 400 },
    );
  }

  const { icpA, icpB, provenance, mode, companies } = parsed.data;
  const corpus = companies ?? CORPUS;

  if (corpus.length === 0) {
    return Response.json({ error: "A diff over an empty corpus has nothing to say." }, { status: 400 });
  }
  if (mode.kind === "top_n" && mode.topN > corpus.length) {
    return Response.json(
      { error: `topN of ${mode.topN} exceeds the ${corpus.length} accounts supplied.` },
      { status: 400 },
    );
  }

  const result = buildDiff({ corpus, icpA, icpB, provenance, mode });

  // 422, not 500: the request was well-formed and the engine refused it on the
  // merits. Provenance that does not replay into ICP B would make every ablation
  // exact about the wrong revision, so no report is the correct answer.
  if (!result.ok) {
    return Response.json({ error: result.reason, refused: true }, { status: 422 });
  }

  return Response.json(result.report);
}
