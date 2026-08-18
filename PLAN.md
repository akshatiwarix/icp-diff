# Day 012 — ICP Diff — Implementation Plan

Day 012 of a 100-day building challenge. The concept is fixed by the master
backlog (`~/Desktop/100-days-portfolio-execution-plan.md`): *a comparison tool
that shows how two ICP definitions change which accounts qualify.* Every choice
below came out of a decision-by-decision interview across four rounds and is
deliberate rather than a default. The 23 settled decisions are recorded at the
bottom; treat them as decided, not as open questions to relitigate.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

An ICP is not written once. It is edited — every quarter, after every pipeline
review, every time a rep insists the definition is wrong. And each edit is made
blind. Someone widens a headcount range, drops a disqualifier, triples a weight,
and the next thing anyone learns is that the target list looks different. Nobody
can say which edit did it.

The default build for this repo is four lines of code: score the corpus under
ICP A, score it under ICP B, show the set difference. It produces a screen that
says *14 accounts gained, 9 lost*, and that screen is worse than useless,
because it is trusted. Four failures live inside it, and this repo exists
because of them.

**A set difference names no cause.** "14 accounts gained" is an observation
about two runs, not a fact about an edit. The user changed five things at once;
the diff attributes to none of them. Every real question — *was dropping the EU
disqualifier worth it? did that weight change do anything at all?* — is a
question about a single edit's effect, and a set difference cannot answer any of
them. The information the user came for is precisely the information this shape
of output destroys.

**The diff is computed at one threshold and presented as if thresholds did not
exist.** Qualification is `score >= cutoff`. Move the cutoff two points and a
third of the movement evaporates or reverses. So half the accounts on a "gained"
list are not gained; they are sitting inside a four-point band, and they will
sit on the other side of it the next time anybody touches a weight. Rendering
one threshold's answer as *the* answer converts an arithmetic coincidence into a
decision about who gets called.

**Two unrelated ICPs cannot be diffed at all, and every tool pretends
otherwise.** Diffing "mid-market SaaS" against "early-stage product-led" means
pairing criteria across definitions that share no ids, no labels and no intent.
Both have an `employee_count` range; they mean opposite things. Heuristic
pairing will match them, and will then confidently report that "the headcount
criterion was loosened" — a sentence about a criterion that does not exist in
either definition. The honest output here is a refusal, and no tool ships one.

**Rank-based qualification hides displacement.** Under top-N, an account can
fall out without a single one of its own evaluations changing, because other
accounts rose past it. Naive attribution blames whichever edit lifted the
others, which is true and completely misleading: nothing about that account's
fit changed. Reporting it as "this edit disqualified you" is a fabricated causal
claim.

So the interesting problems are:

- Can each account's movement be traced to a **specific atomic edit**, with the
  claim verifiable by the user rather than asserted?
- Can the system distinguish *this edit alone moves the account* from *this edit
  was needed for the move*, and report their disagreement instead of averaging
  it into a number?
- Can fragility be **computed exhaustively** rather than sampled — an interval
  of thresholds over which each verdict actually holds?
- Can the system tell when it is **not entitled to attribute**, and say so?
- Can rank displacement be named as its own cause rather than blamed on an edit?

That is a causal attribution problem with a provenance precondition, and it is
what this project builds.

## Intended user

Primary: the person who owns the ICP and is about to change it — a founder,
RevOps lead or GTM leader — who wants to know what a proposed edit does *before*
it becomes the target list, and which of the five things they changed is
carrying the result.

Secondary: whoever reads the repo to judge whether the author can tell the
difference between a diff and an explanation, and whether they will refuse to
answer a question they cannot answer.

Explicitly not served: anyone authoring an ICP from scratch. That is Day 001
(`icp-score`), it is shipped, and it has the builder. ICP Diff starts after two
definitions exist.

## User journey

1. Land on the app. A preset pair is already diffed, provenance is present, the
   threshold sits where interesting verdicts exist. No upload, no key, no
   config, no empty state.
2. Read the **ledger** on the left: one row per atomic edit, with four counts —
   accounts moved in, moved out, moved by this edit *alone*, and accounts that
   would not have moved *without* it. One edit carries a flat **changed
   nothing** badge, and that is a finding.
3. Read the **movement table** in the center, one row per account: its verdict,
   score A → B, margin to the nearest flip, and its causes as named chips.
4. Click a ledger row. The table filters to the accounts that edit caused.
5. Expand an account. Both breakdowns render side by side, Day 001 style, every
   changed evaluation marked and the atom that changed it named.
6. Read the **band strip**. Each account shows the threshold interval over which
   its verdict holds. Two "gained" accounts look identical in the table; in the
   strip one is gained across sixty thresholds and the other across four.
7. Move the threshold. Verdicts recompute instantly — client-side, no round trip
   — and the bands explain every flip before it happens.
8. Switch to **top-N**. Qualification becomes zero-sum. At least one account is
   marked **displaced**: its own score held or rose, its rank fell, and the
   report cites the accounts that passed it.
9. Author an edit. Add atoms to the ledger by hand, or describe the change in
   prose and have it parsed into typed atoms — each one shown before it is
   applied, illegal atoms rejected individually with a reason.
10. Paste two full ICP definitions with no shared ancestry. The app renders the
    full movement table, bands and fragility, and states plainly that
    attribution is **unattributed — no common ancestor**. It does not guess.
11. Export. The full JSON report, or a text change review assembled from engine
    templates.

## MVP scope

**In:**

- Eight atomic edit types, a canonical edit list derived from provenance
- Solo (sufficient) and leave-one-out (necessary) attribution, with interaction
  detection where the two disagree
- The `unattributed` refusal when provenance is absent
- Six movement verdicts, disqualification as its own axis
- Exhaustive threshold-band computation (all 101 thresholds, both ICPs)
- Top-N mode with displacement as a distinct cause
- ~70-company synthetic corpus carrying ten named traps
- Ledger / movement table / band strip console, both breakdowns on expand
- Edit authoring by hand, plus prose → typed atoms via Gemini with per-atom
  rejection
- Paste two full definitions (the no-provenance path)
- `POST /api/diff`, `POST /api/parse-edits`
- Vitest over the engine, an invariant sweep, client/server equivalence
- README, plain-English guide, screenshots from the live deployment, Vercel URL

**Out (explicitly). This list is as binding as the list above:**

- Any change to the vendored Day 001 scoring engine
- An ICP builder (Day 001 owns it)
- Diffing two *corpora*, or ICP-over-time — the corpus is fixed on both sides
- Shapley values, credit fractions, impact percentages, or any number that
  answers "how much did this edit matter"
- Heuristic criterion pairing across definitions without shared ancestry
- Model-written prose anywhere in the output
- Enrichment, CSV upload, header mapping (Days 002, 003)
- Persistence, accounts, auth, saved diffs
- E2E tests, component tests, CI
- Live URL fetching of any kind

## The thesis

**A diff is not an explanation. An explanation names a cause, and a cause has to
be earned two ways or refused.**

Two claims carry the repo:

1. **Attribution requires provenance.** ICP B is attributable only if it was
   *derived from* ICP A — a typed chain of edits, not a resemblance. Without
   that chain the outcome diff still computes and per-edit blame is refused by
   name.
2. **There is no number.** An edit either moves an account alone, or is
   necessary for the move, or both, or neither. Four named states, each one
   checkable by the user in a single ablation they can see. A percentage would
   be read as truth and is banned everywhere, including the word "impact".

## Stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next 16, App Router | Days 001–011. Server components for the bundled corpus, route handlers for the API. |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | Day 001's engine type-checks under it; the diff layer inherits. |
| Styling | Tailwind 4 via `@tailwindcss/postcss` | Days 001–011. |
| Validation | Zod 4 at every boundary | A schema is a request; a validator is a guarantee. |
| Model | `@google/genai`, `gemini-3.6-flash` | Days 001–011. `temperature: 0`, `ThinkingLevel.MINIMAL`, native `responseSchema`, JSON mime type. |
| Tests | Vitest, config in `vitest.config.mts`, globs `lib/**/*.test.ts` | `.mts` avoids Vite's ESM-in-CJS config warning. |
| Scripts | `vite-node -c vitest.config.mts` | Extensionless relative imports and the `@/` alias. |
| Package manager | npm, lockfile committed | `npm install && npm run dev` is what a reviewer types. |
| Deploy | Vercel, production URL in README | Days 008–011. |

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

`lib/diff/` is the engine. Around it sit `lib/scoring/` (vendored, frozen),
`lib/parse/` (Gemini call, prompt, response schema, semantic legality check,
rate limiter), `data/`, `app/api/`, `app/`.

### Boundaries that are enforced by tests, not convention

- **`lib/diff/` imports nothing non-relative.** Not `next`, not `react`, not
  `zod`, not `@google/genai`, not `@/data`. `purity.test.ts` scans for bare
  import specifiers with **no allowlist**. A module that cannot import a model
  client cannot invent a cause. If a change to the engine needs a package, the
  code belongs in `lib/parse/` or the route handler — never widen the rule.
- **`lib/scoring/` is vendored from Day 001 and frozen.** Byte-compatible
  `Company`, `Criterion`, `Disqualifier`, `IcpDefinition`, `ScoredAccount`. Day
  012 contributes nothing to scoring; if the diff needs something scoring does
  not give, the diff layer computes it. A test asserts the vendored files are
  unmodified against a checked-in hash.
- **One exported engine entry point:**
  `buildDiff({ corpus, icpA, icpB, provenance, mode, threshold, topN })`.
  Route handlers and components must not reach into `attribute.ts`, `bands.ts`
  or `edits.ts` directly.
- **The engine ships to the browser.** Moving the threshold must recompute
  without a round trip. `/api/diff` runs the *same* function server-side and
  `equivalence.test.ts` asserts byte-identical JSON across the sweep
  cross-product. Two code paths computing verdicts differently is the failure
  that test exists to catch.

## Domain model

### Edit atoms — eight kinds, never collapsed

```ts
type EditAtom =
  | { kind: "criterion_added";           criterionId: string; criterion: Criterion }
  | { kind: "criterion_removed";         criterionId: string }
  | { kind: "weight_changed";            criterionId: string; from: number; to: number }
  | { kind: "value_changed";             criterionId: string; from: RuleValue; to: RuleValue }
  | { kind: "operator_changed";          criterionId: string; from: Operator; to: Operator }
  | { kind: "disqualifier_added";        disqualifierId: string; disqualifier: Disqualifier }
  | { kind: "disqualifier_removed";      disqualifierId: string }
  | { kind: "disqualifier_value_changed"; disqualifierId: string; from: RuleValue; to: RuleValue };
```

One criterion can carry several simultaneous atoms, and they stay separate.
"You loosened the range *and* tripled the weight" is two causes with different
blame; collapsing them into `criterion_modified` throws away the answer the user
came for.

**Linked atom groups.** When an operator change makes the old value
type-invalid — a `between` pair cannot be evaluated under `gte` — the
`operator_changed` and `value_changed` atoms form a linked group that ablates
together. Ablating one alone would produce an ICP that does not typecheck. This
is a real constraint of the type model, not a special case.

### Provenance

```ts
type Provenance =
  | { kind: "derived"; parentIcpName: string; edits: EditAtom[] }
  | { kind: "none" };
```

`derived` is produced by the app's authoring flow and by the preset pairs.
`none` is what two pasted definitions get. With `kind: "none"` the engine emits
`attribution: { state: "unattributed", reason: "no common ancestor" }` and no
causes, anywhere. There is no fallback pairing.

### Verdicts — six, with disqualification taking precedence

`gained` · `lost` · `held_in` · `held_out` · `newly_disqualified` ·
`undisqualified`

Disqualification is a separate axis from score: an account excluded by a hard
rule is a different kind of "out" than one that scored 41. When an account both
drops below threshold and becomes disqualified, the verdict is
`newly_disqualified`, because the disqualifier is the actionable cause.

Every verdict carries a `margin` in score points. `held_in` additionally carries
`rankDelta`.

### Causes

```ts
type Cause =
  | { kind: "edit"; atomId: string; sufficient: boolean; necessary: boolean }
  | { kind: "displacement"; overtakenBy: string[] };
```

- **sufficient** — apply this atom alone to ICP A; the account moves.
- **necessary** — apply every atom *except* this one to ICP A; the account fails
  to move.
- **interaction** — `sufficient !== necessary`. Reported as a named state, never
  averaged into a number.

Cost is `2n` scoring passes over ~70 accounts. Nothing.

An account's verdict cause is **either** its own evaluation changes **or**
displacement, never silently blended.

### Bands

For every account, qualification is computed at all 101 integer thresholds under
both ICPs, yielding two intervals. A verdict's **band** is the threshold
interval over which it holds. This is exhaustive, not sampled, needs no magic
constant, and is the same pass that powers the threshold slider. `margin` is
derived from the bands rather than computed separately.

The honest statement it enables: *this account is `gained` only for thresholds
58–63; at any other cutoff the ICP change did nothing to it.*

### Displacement

Top-N mode only. Detected by comparing an account's own score delta against its
rank delta: score held or rose while rank fell. The report cites the specific
accounts that passed it.

## Vocabulary

Frozen. These strings appear in types, UI labels, README and the JSON export,
and they are decided once.

**edit** (an atomic change) · **ledger** (the edit list) · **cause** (an edit or
a displacement, attached to a verdict) · **sufficient** (moves the account alone
from A) · **necessary** (the account fails to move without it) ·
**interaction** (sufficient ≠ necessary) · **band** (threshold interval over
which a verdict holds) · **margin** (points to the nearest flip) ·
**displacement** (rank loss without own-score loss) · **provenance** (B's
derivation from A) · **unattributed** (the refusal state).

**The word "impact" is banned repo-wide.** It is the word that invites a number,
and the number is banned.

## Corpus and the ten traps

~70 companies on Day 001's `Company` type, so paste-JSON stays cross-compatible.
Each trap is mapped to a named account id in `data/traps.ts` and asserted in
tests. A corpus that cannot produce a verdict makes the feature that computes it
undemonstrable.

| # | Trap | What it proves |
| --- | --- | --- |
| 1 | Near-threshold flipper | `gained` only inside a 4-point band |
| 2 | Structural gainer | `gained` across nearly every threshold |
| 3 | Disqualifier-only loss | Score *rose* under B, `newly_disqualified` anyway |
| 4 | Released account | A dropped disqualifier yields `undisqualified` |
| 5 | Interaction | Two edits each sufficient alone, neither necessary |
| 6 | Linked atom group | Operator + value change that must ablate together |
| 7 | Displacement | Top-N only: own score up, rank down |
| 8 | Null field | A loosened range does nothing — the field is `null`, and null never matches |
| 9 | Zero-movement edit | An edit that changes no verdict at any threshold |
| 10 | Weight-only mover | Moved purely by a weight change |

Trap 9 matters most. "This edit did nothing" is a finding real ICP owners are
never given.

## The model's one job

`POST /api/parse-edits` takes prose and an ICP A, and returns an array of typed
edit atoms. Nothing else.

- Native `responseSchema` is the eight-atom discriminated union. Zod re-validates
  at the boundary and additionally checks **semantic legality**: every
  referenced criterion or disqualifier id exists in A, every value typechecks
  against its operator, no duplicate atoms.
- Illegal atoms are **rejected individually, each with a reason, and shown to
  the user.** Never silently dropped.
- The model **never sees the corpus, the scores, or the diff.** It translates
  prose into structure. It does not phrase, summarise, rank or explain.
- Missing `GEMINI_API_KEY` → **501**, with a message pointing at the manual edit
  ledger. Model failure → **502**.
- The whole app — every preset pair, every verdict, every band, both exports,
  the refusal state — works with `GEMINI_API_KEY` unset.

## Exports

**JSON** — the full report: edit list, provenance, per-account verdicts, per
`(account, edit)` sufficient/necessary booleans, displacement citations,
threshold bands, and the refusal state when provenance is absent.

**Text change review** — assembled from engine templates only, never a model.
Reads like a release note:

> Widening headcount to 50–3,000 brought in 6 accounts, 2 of them only within
> thresholds 55–61. Dropping the EU residency disqualifier released 1 account.
> Tripling the GTM-hiring weight changed no account's verdict at any threshold.

No CSV. It would drop exactly the causal columns that matter.

## UI

Three panes. The movement table is the visual center of gravity.

```
┌──────────────┬────────────────────────────────────────┬──────────┐
│ LEDGER       │ MOVEMENT TABLE                         │ BANDS    │
│              │                                        │          │
│ edit atom    │ account   verdict   A→B  margin  causes│ ▓▓░░░░░  │
│  in/out      │ ...                                    │ ░▓▓▓▓░░  │
│  sufficient  │                                        │          │
│  necessary   │ ▼ expanded: both breakdowns, changed   │          │
│ [changed     │   evaluations marked, causing atom     │          │
│  nothing]    │   named per change                     │          │
└──────────────┴────────────────────────────────────────┴──────────┘
   threshold slider · mode toggle (threshold | top-N) · exports
```

- Load: preset pair already diffed, provenance present, threshold set where
  interesting verdicts exist.
- Click a ledger row → table filters to the accounts that edit caused, cause
  chips highlight.
- Click an account → expands to both Day 001-style breakdowns, each changed
  evaluation marked with the atom that changed it.
- Ledger rows show four counts plus the flat **changed nothing** badge.

Rejected: side-by-side A|B tables, which make the reader do the diff the repo
exists to do. Rejected: ledger-as-hero — six rows cannot hold a screen.

## Validation

Vitest over `lib/**/*.test.ts` only. Ten traps as named unit fixtures. Then
`npm run sweep`: every preset pair × every provenance state × all 101 thresholds
× the top-N values, asserting **six invariants**:

1. **Attribution completeness** — in derived-provenance mode, every non-`held`
   verdict has at least one named cause. No unexplained movement, ever.
2. **Band consistency** — the verdict computed at threshold *t* equals the
   verdict implied by the precomputed bands at *t*.
3. **Displacement soundness** — no account is marked `displacement` while its
   own score fell.
4. **Provenance honesty** — zero causes emitted when provenance is `none`.
5. **Client/server equivalence** — byte-identical JSON from the browser path and
   `/api/diff`.
6. **No id leakage** — an attribution never cites a criterion or disqualifier
   absent from both definitions.

The sweep lands **before any UI**. Day 007's sweep caught a real visibility bug
before its console existed; building UI first means debugging through pixels.

## Implementation task order

One commit per step, pushed to `main` immediately.

1. `docs: the plan — the decisions, the refusal, and the ten traps`
2. `docs: CLAUDE.md — attribution rules, the banned number, the vocabulary`
3. `chore: scaffold Next 16, vendor the Day 001 engine frozen, the purity boundary`
4. `feat: the edit atoms, provenance, and the diff type contract`
5. `feat: ~70 companies and the ten traps each one carries`
6. `feat: verdicts, threshold bands, and displacement`
7. `feat: solo and necessary attribution, interactions, and the unattributed refusal`
8. `test: the invariant sweep — six invariants across the threshold cross-product`
9. `feat: the two routes — deterministic diff, prose-to-edits with per-atom rejection`
10. `feat: the console — ledger, movement table, band strip, both breakdowns`
11. `feat: the edit authoring flow, top-N mode, and both exports`
12. `docs: README, the plain-English guide, and screenshots from the live deployment`

Deploy to Vercel after step 10, so step 12's screenshots come from the live URL.

## Commands

```bash
npm run dev                     # dev server
npm run build                   # production build — run before claiming done
npm test                        # vitest run (globs lib/**/*.test.ts only)
npm run test:watch              # watch mode
npm run sweep                   # six invariants across the cross-product, no network
npm run typecheck               # next typegen && tsc --noEmit
npm run lint                    # eslint
```

## Deliverables

`PLAN.md` (this file, committed as the contract) · `CLAUDE.md` · `README.md`
(thesis-led, Day 011 structure) · `docs/plain-english-guide.md` · screenshots
from the live deployment · a Vercel production URL.

Screenshots: the default diff; an edit selected with the table filtered; an
expanded account showing both breakdowns; the band strip at two thresholds; the
`unattributed` refusal state; prose → edits with a rejected atom.

## Limitations, stated up front

- The corpus is synthetic. It is engineered to make every verdict reachable,
  which is the opposite of representative.
- Attribution is exact for the edit list it is given. If provenance is wrong —
  an edit list that does not actually transform A into B — the engine will
  attribute confidently to a fiction. A test asserts `apply(A, edits) === B` and
  the engine refuses the diff when it fails.
- Sufficient/necessary is a pair of booleans, not a decomposition. With heavy
  interaction between edits, "which one mattered most" has no answer, and this
  repo will say so rather than invent one.
- 101 integer thresholds means sub-point cutoffs are not modelled. Scores are
  integers 0–100; a 62.5 cutoff is not expressible in Day 001's engine either.

## The 23 settled decisions

1. **Thesis:** blame attribution as the spine, fragility as a first-class second
   feature. "ICP as regression test suite" rejected — it needs pinned
   expectations nobody will author in a demo.
2. **Day 001's `lib/scoring/` is vendored verbatim and frozen.** No edits. Hash
   test enforces it.
3. **Two ICPs, one fixed corpus.** No data drift, no ICP-over-time. Varying both
   sides makes attribution meaningless.
4. **Qualification is threshold-based by default, with a top-N toggle.** They
   disagree, and how they disagree is content: top-N is zero-sum, threshold is
   not.
5. **The model parses prose into edit *atoms* against an existing ICP.** Model
   narration of the diff is banned outright.
6. **New ~70-company corpus** on Day 001's schema, engineered around named
   traps.
7. **One day, feature-frozen. npm. Vercel. `PLAN.md` and `CLAUDE.md` committed
   and public** as contract and rules.
8. **Attribution requires provenance.** Derived-from-A gets per-edit blame; two
   pasted definitions get the full outcome diff and an explicit `unattributed —
   no common ancestor`. No heuristic pairing, ever.
9. **Eight edit atoms, never collapsed.** One criterion may carry several.
   Operator+value changes that invalidate the value form a linked group that
   ablates together.
10. **Attribution is solo (sufficient) + leave-one-out (necessary), with
    disagreement reported as `interaction`.** Shapley rejected: it returns a
    number, and the number becomes the truth. **No percentages, no credit
    scores, no impact floats.**
11. **Six verdicts**, disqualification as its own axis taking precedence.
    `margin` on all, `rankDelta` on `held_in`.
12. **Fragility is exhaustive threshold-band computation** across all 101
    thresholds, not perturbation sampling. `margin` derives from the bands.
13. **ICP B is authored as a delta** — an edit ledger, by hand or via prose —
    plus a paste-two-definitions path so the refusal state is reachable and the
    engine contract stays honest.
14. **Displacement is its own cause type** with the overtaking accounts cited. A
    verdict's cause is own-evaluation changes or displacement, never blended.
15. **Ten named traps**, id-mapped in `data/traps.ts`, asserted in tests.
16. **The model never sees the corpus, scores or diff.** Illegal atoms rejected
    individually with reasons. 501 without a key, 502 on model failure, full app
    works keyless.
17. **The pure engine ships to the client and runs server-side**, with a
    byte-identical equivalence test. Single entry point `buildDiff(...)`.
    `lib/diff/` imports nothing non-relative, no allowlist.
18. **Six sweep invariants**, cross-product over preset pairs × provenance ×
    101 thresholds × top-N values.
19. **Three-pane console**, movement table as the center of gravity, non-empty
    at load. Side-by-side A|B rejected.
20. **JSON export plus a template-assembled text change review.** No CSV, no
    model prose.
21. **Vocabulary frozen**, and the word "impact" is banned repo-wide.
22. **Docs:** thesis-led README on Day 011's structure, plain-English guide,
    live-deployment screenshots, plus the plain-English PDF for the
    non-technical audience.
23. **Twelve commits in the order above; the sweep lands before any UI**;
    Vercel deploy after step 10 so screenshots come from the live URL.
