# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Project state

Day 012 of a 100-day building challenge. **`PLAN.md` is the contract.** It records 23 settled
decisions from a four-round design interview; they are decided, not open. Do not relitigate them
mid-build, and do not quietly expand the MVP — the "Out (explicitly)" list in `PLAN.md` is as
binding as the "In" list.

At the time this file was written the repo contains `PLAN.md` and `LICENSE` only. Everything below
describes the build `PLAN.md` specifies. Commit order lives in *Implementation task order*; each
step is one commit, pushed to `main` immediately.

## The thesis, in one paragraph

A diff is not an explanation. The default build for this concept scores a corpus under ICP A,
scores it under ICP B, and reports "14 gained, 9 lost" — an observation about two runs that
attributes to none of the five edits the user actually made. This repo makes movement **causal**:
every account's verdict names the atomic edit that caused it, earned two ways — **sufficient**
(that edit alone moves the account) and **necessary** (the account fails to move without it) —
with their disagreement reported as an `interaction` rather than averaged into a number. Two
claims carry the repo: **attribution requires provenance** (ICP B must be *derived from* A; two
unrelated definitions get the outcome diff and an explicit `unattributed — no common ancestor`),
and **there is no number** (four named boolean states, never a percentage). Sibling repos own the
neighbouring problems — Day 001 `icp-score` owns scoring and the ICP builder, Day 003
`lead-cleaner` owns messy input. **Do not rebuild either here.** Day 012's only claim is causal
attribution over ICP edits.

## Commands

Land these in `package.json` at scaffold time; they mirror Days 001–011 so a reviewer types the
same thing in every repo.

```bash
npm run dev                      # dev server
npm run build                    # production build — run before claiming done
npm test                         # vitest run (globs lib/**/*.test.ts only)
npm run test:watch               # watch mode
npm run sweep                    # six invariants, preset pairs × provenance × 101 thresholds × top-N, no network
npm run typecheck                # next typegen && tsc --noEmit
npm run lint                     # eslint
npx vitest run lib/diff/attribute.test.ts             # single file
npx vitest run -t "necessary but not sufficient"      # single test by name
```

`npm` is the committed package manager — README and lockfile stay npm even if bun is used
locally, because `npm install && npm run dev` is what a reviewer types without reading.

Four setup facts inherited from Days 001–011:

- Vitest config belongs in `vitest.config.mts` (`.mts`, not `.ts` — the extension is what stops
  Vite's config loader warning about ESM-in-CJS), and it globs `lib/**/*.test.ts` only. Tests
  outside `lib/` will not run.
- `tsc` alone fails on a clean checkout because `LayoutProps` and friends are generated into
  `.next/types`, so `typecheck` must run `next typegen` first. Never "fix" that error by editing
  `app/layout.tsx`.
- `tsconfig.json` sets `noUncheckedIndexedAccess` on top of `strict` — array and record access
  yields `T | undefined`. Handle it; do not reach for `!`.
- Scripts run through `vite-node -c vitest.config.mts` rather than bare `node`, because the engine
  uses extensionless relative imports and the `@/` alias lives in the Vitest config.

## Architecture

```
                    ┌─ server component ──► data/corpus.ts   (Zod-validated at import)
                    │                       data/presets.ts  (ICP A + derived B pairs)
Browser ────────────┤                       data/traps.ts    (ten fixtures, id-mapped)
                    │
                    ├─ lib/diff (pure) ───► same function runs client-side and server-side
                    │      └─ lib/scoring (vendored from Day 001, frozen)
                    │
                    ├─ POST /api/diff        ─► Zod ─► lib/diff        (auditable JSON)
                    └─ POST /api/parse-edits ─► Zod ─► key check ─► rate limit
                                                  └─ lib/parse (model, one call, edits only)
```

`lib/diff/` is the engine. Around it sit `lib/scoring/` (vendored, frozen), `lib/parse/` (Gemini
call, prompt, response schema, semantic legality check, rate limiter), `data/`, `app/api/`, `app/`.

**`lib/diff/` imports nothing non-relative** — not `next`, not `react`, not `zod`, not
`@google/genai`, not `@/data`. `purity.test.ts` enforces it by scanning for bare import
specifiers, with no allowlist. If a change to the engine needs a package, move the code to
`lib/parse/` or the route handler instead of widening the rule. This is not stylistic: a module
that cannot import a model client cannot invent a cause, so every cause attached to every verdict
must have come from an ablation over the edit list that was passed in as an argument.

**`lib/scoring/` is vendored from Day 001 `icp-score` and frozen.** Byte-compatible `Company`,
`Criterion`, `Disqualifier`, `IcpDefinition`, `ScoredAccount`. Day 012 contributes nothing to
scoring. If the diff needs something scoring does not give, **the diff layer computes it** — a
test asserts the vendored files match a checked-in hash, so an edit there fails CI-equivalent
locally.

**`buildDiff({ corpus, icpA, icpB, provenance, mode, threshold, topN })` is the only exported
engine function.** Route handlers and components must not reach into `attribute.ts`, `bands.ts` or
`edits.ts` directly.

**The engine ships to the browser.** It is pure and cheap, and moving the threshold must recompute
without a round trip. `/api/diff` runs the *same* function server-side for programmatic use, and
`equivalence.test.ts` asserts both produce byte-identical JSON across the sweep cross-product. Two
code paths computing verdicts differently is the failure that test exists to catch.

**Edits are data, and they are the unit of everything.** Eight atom kinds in a discriminated union
(`criterion_added`, `criterion_removed`, `weight_changed`, `value_changed`, `operator_changed`,
`disqualifier_added`, `disqualifier_removed`, `disqualifier_value_changed`). Attribution
granularity *is* edit granularity — if you find yourself widening an atom to cover two changes,
you are deleting the answer the user came for.

## Rules that are easy to break by accident

- **Never add a number.** Decision 10. No percentage, no credit fraction, no Shapley value, no
  "how much did this edit matter" float. An edit is `sufficient`, `necessary`, both, or neither —
  four named states, each checkable by the user in one ablation they can see. A number gets read
  as truth, and this whole repo is a rejection of numbers nobody can audit.
- **The word "impact" is banned repo-wide** — types, UI labels, README, comments, commit messages.
  It is the word that invites the number.
- **No attribution without provenance.** `Provenance` is `{ kind: "derived", parentIcpName, edits }`
  or `{ kind: "none" }`. With `none`, the engine emits `attribution: { state: "unattributed",
  reason: "no common ancestor" }` and **zero causes**. There is no fallback pairing by
  `(field, operator)`, by label, or by anything else. Day 001's preset ids are preset-prefixed
  (`a-headcount`, `b-headcount`), so cross-preset id matching finds nothing — that is the correct
  outcome, not a bug to route around.
- **Verify the edit list actually transforms A into B.** `apply(icpA, edits)` must deep-equal
  `icpB`, or the engine refuses the diff. Otherwise attribution is exact and confident about a
  fiction.
- **Never collapse atoms.** A criterion whose weight *and* value both changed carries two atoms.
  `criterion_modified` does not exist and must not be introduced.
- **Linked atom groups ablate together.** An `operator_changed` that makes the old value
  type-invalid (a `between` pair under `gte`) is linked to its `value_changed`. Ablating one alone
  produces an ICP that does not typecheck. Keep the linkage; do not special-case around it.
- **A verdict's cause is own-evaluation changes *or* displacement, never blended.** Under top-N an
  account can fall out with its own score unchanged or higher, because others rose past it.
  Detect it by comparing score delta against rank delta, emit
  `{ kind: "displacement", overtakenBy }`, and cite the specific accounts. Blaming an edit for a
  displacement is a fabricated causal claim.
- **Disqualification takes precedence over score verdicts.** An account that both drops below
  threshold and becomes disqualified is `newly_disqualified`, because the disqualifier is the
  actionable cause. Six verdicts total; do not add a seventh.
- **Bands are exhaustive, not sampled.** Qualification at all 101 integer thresholds under both
  ICPs. No perturbation sampling, no magic epsilon. `margin` is *derived from* the bands, never
  computed separately — two sources for the same number will drift.
- **`null` never matches.** Inherited from Day 001's operators. Trap 8 exists because a loosened
  range does nothing to an account whose field is `null`, and the breakdown must say so.
- **The model never sees the corpus, the scores, or the diff.** It parses prose into typed edit
  atoms against a supplied ICP A. It does not phrase, polish, summarise, rank or explain. The text
  change review is assembled from engine templates only.
- **Illegal parsed atoms are rejected individually, with a reason, and shown.** Never silently
  dropped. Semantic legality is checked beyond the schema: referenced ids must exist in A, values
  must typecheck against their operator, no duplicates.
- **The "changed nothing" badge is a shipped feature**, not debug output. An edit that moves no
  account at any threshold is trap 9, and "this edit did nothing" is a finding real ICP owners
  never get.
- **No live URL fetching.** The paste panel and the prose panel are the live paths. A
  fetch-any-URL endpoint is SSRF.
- **The sweep lands before any UI.** Decision 23. Day 007's sweep caught a real visibility bug
  before its console existed; building UI first means debugging through pixels.

## Vocabulary (frozen)

These strings appear in types, UI labels, README and the JSON export. Decided once, in Decision 21.

**edit** · **ledger** · **cause** · **sufficient** · **necessary** · **interaction** · **band** ·
**margin** · **displacement** · **provenance** · **unattributed**

## Gemini conventions (inherited from Days 001–011)

`@google/genai`, model `gemini-3.6-flash`, `responseMimeType: "application/json"` with a native
`responseSchema`, then Zod as the trust boundary — a schema is a request, a validator is a
guarantee. `ThinkingLevel.MINIMAL`: this is constrained extraction against a fixed schema, not
reasoning. `temperature: 0`.

Missing key → **501** with a message pointing at the manual edit ledger. Model failure → **502**.
The app must render every preset pair, every verdict, every band, both exports and the
`unattributed` refusal state with `GEMINI_API_KEY` unset.

## Next.js 16

**Next.js 16 differs from training data.** Read the relevant guide in
`node_modules/next/dist/docs/` before writing route handlers or server components rather than
reaching for remembered Next 13/14 patterns.

`next dev` appends the `nextjs-agent-rules` block at the bottom of *this file* — 16.3.1 writes into
`CLAUDE.md`, not `AGENTS.md`. It is committed deliberately: deleting it from a diff only re-creates
the uncommitted change on the next `next dev`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
