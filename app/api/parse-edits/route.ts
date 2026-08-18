import { icpDefinitionSchema, partitionAtoms } from "@/data/schema";
import { MAX_PROSE_LENGTH, hasApiKey, parseEdits } from "@/lib/parse/generate";
import { parseEditsLimiter, rateLimitKey } from "@/lib/parse/rate-limit";

/**
 * POST /api/parse-edits
 *
 * Body: `{ icp, prose }`. Returns `{ atoms, rejected, descriptions, usage }`.
 *
 * The model's entire job. It receives an ICP and a sentence, and returns typed
 * edit atoms — it never sees the corpus, the scores or the diff, and it never
 * writes a sentence the user reads. The returned atoms are a *draft for the
 * ledger*: the user sees each one before it is applied, and the diff is then
 * computed by `/api/diff` from the edited list like any other.
 *
 * `GET` reports whether a key is configured, so the panel can explain itself
 * without spending a request to find out.
 */

export function GET() {
  return Response.json({ configured: hasApiKey() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body is not JSON." }, { status: 400 });
  }

  const shape =
    typeof body === "object" && body !== null
      ? (body as { icp?: unknown; prose?: unknown })
      : {};

  const icpParsed = icpDefinitionSchema.safeParse(shape.icp);
  if (!icpParsed.success) {
    return Response.json({ error: "No ICP to edit was supplied." }, { status: 400 });
  }

  const prose = typeof shape.prose === "string" ? shape.prose.trim() : "";
  if (prose.length < 5) {
    return Response.json({ error: "Describe the change in a sentence first." }, { status: 400 });
  }
  if (prose.length > MAX_PROSE_LENGTH) {
    return Response.json(
      { error: `Keep the instruction to ${MAX_PROSE_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  // Checked before the limiter: a server with no key should say so every time,
  // rather than eventually answering "too many requests" to a question it was
  // never able to answer.
  if (!hasApiKey()) {
    return Response.json(
      {
        error:
          "GEMINI_API_KEY is not set on the server, so describing an edit in prose is unavailable. Add edits in the ledger instead — the diff, the bands and both exports need no key.",
        configured: false,
      },
      { status: 501 },
    );
  }

  const limit = parseEditsLimiter.check(rateLimitKey(request));
  if (!limit.allowed) {
    return Response.json(
      {
        error: `Rate limit reached. Try again in ${limit.retryAfterSeconds}s, or add the edit in the ledger — that path has no limit.`,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const result = await parseEdits(prose, icpParsed.data);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Second gate. `assembleEdit` already refused anything it could not build, and
  // this checks what a schema cannot: that each atom is legal *against this ICP*.
  // Rejections are reported one by one — a silently shorter list of edits than the
  // user asked for is worse than an error.
  const { accepted, rejected } = partitionAtoms(result.atoms, icpParsed.data);

  return Response.json(
    {
      atoms: accepted,
      rejected: [...result.rejected, ...rejected],
      descriptions: result.descriptions,
      usage: result.usage,
    },
    { headers: { "x-ratelimit-remaining": String(limit.remaining) } },
  );
}
