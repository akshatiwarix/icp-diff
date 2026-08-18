# ICP Diff

**Which edit changed who qualifies?**

Live: **https://icp-diff.vercel.app** · Day 012 of a 100-day building challenge

Two ICP definitions, one fixed corpus of 77 accounts. Every account that moved
names the atomic edit that moved it — and when the two ICPs share no ancestry,
attribution is refused by name instead of guessed.

---

## The part everybody gets wrong

The default build for this concept is four lines of code. Score the corpus under
ICP A, score it under ICP B, show the set difference. It produces a screen that
says **14 gained, 9 lost**, and that screen is worse than useless, because it is
trusted.

An ICP edit is never one change. Someone widened a headcount range, tripled a
weight, dropped a disqualifier and moved the enterprise handoff, all in one
sitting. "14 gained" is an observation about two runs; it attributes to none of
those four things. Every real question — *was dropping that exclusion worth it?
did the weight change do anything at all?* — is a question about a single edit,
and a set difference is the shape of output that destroys exactly that
information.

So this repo does not diff two ICPs. It ablates an edit list.

## Attribution requires provenance

The first thing the engine does is check whether it is entitled to answer.

**Derived** — ICP B was *produced from* ICP A by a recorded list of edits. B is
never hand-written anywhere in this repo, including in `data/presets.ts`: it is
`applyEdits(A, edits)`, so the edit list is the source of truth and B is its
consequence. Per-edit attribution is meaningful, and every claim is an ablation
over that list.

**None** — two independently authored definitions. The outcome diff still
computes in full, and per-edit blame is declined:

> **Unattributed — no common ancestor.**
> The movement table, the bands and both exports are unaffected. What is missing
> is per-edit blame, and it is missing because there is no edit list.

Try it: the bundled rival pair is Day 001's mid-market ICP against an
early-stage product-led one. They share not one criterion id. Both contain an
`employee_count` range and the two ranges mean opposite things — which is
precisely the mispairing a `(field, operator)` heuristic makes, and then narrates
with total confidence. There is no pairing heuristic in this codebase and adding
one would be the single worst change you could make to it.

There is also a third state, which is a refusal to produce a report at all: if
the recorded edits do not replay into ICP B, every ablation would still run,
still succeed, and attribute exactly — to the wrong revision. `/api/diff` returns
**422** for that.

## Sufficient, necessary, and no number

Each ablation unit gets two booleans per account:

| | meaning | how you check it |
|---|---|---|
| **sufficient** | apply this edit alone to ICP A and the account reaches its ICP B verdict | one ablation you can run yourself |
| **necessary** | apply every edit *except* this one and the account fails to move | one ablation you can run yourself |

Four states — both, either, neither — and where the two disagree, that
disagreement is the finding and is labelled an **interaction** rather than
averaged away.

A Shapley value over edit subsets is perfectly computable here; the unit count is
single digits. It is deliberately not computed. `0.34` for "widened headcount"
would be read as a measurement of blame by everyone who saw it and audited by
nobody, which is the failure Day 001 (`icp-score`) exists to refuse. The word
"impact" is banned repo-wide for the same reason: it is the word that invites the
number.

Where nothing can be singled out honestly, the report says so. Three edits of
which any two suffice produce an account with no unit sufficient and none
necessary — remove any one and the move still happens, apply any one and it does
not. That gets a `combination` cause naming the set, not a guess at a member.

## Fragility is computed, not sampled

Two accounts on the Q3 revision at cutoff 52:

| | ICP A | ICP B | verdict | holds at |
|---|---|---|---|---|
| Lumen HR | 50 | 54 | Gained | **51–54** |
| Hazelmere Care | 17 | 62 | Gained | **18–62** |

Identical in the movement table. One of them is a real change in who qualifies;
the other is an arithmetic coincidence that will reverse the next time anybody
touches a weight. The engine walks **all 101 thresholds** under both ICPs and
reports the interval over which each verdict actually holds — no sampling, no
perturbation constant to defend, and no extra cost, since it is the same pass
that lets the cutoff slider recompute without a round trip.

Under top-N the axis is N from 1 to the corpus size instead. Showing threshold
bands during a top-N diff would answer a question the user is not asking.

Of the 21 accounts that move at cutoff 52: **5 are within three points of
flipping back**, and **13 have verdicts that do not depend on the cutoff at all**
(both disqualification verdicts are cutoff-independent by construction).

## Displacement

Switch to top-N and qualification becomes zero-sum: an account can only enter if
another leaves. Orbital CRM leaves — with its own score **up**, 89 → 92, and its
rank down from 13 to 21.

Nothing about its fit changed. Accounts matching the newly-tripled GTM weight
passed it. Naive attribution would blame the weight change, which is true and
completely misleading, so displacement is its own cause type, it names the
accounts that took the slot, and it is **never blended with an edit cause** — an
account's verdict is caused by its own evaluation changes or by displacement,
not by a mixture.

## The six invariants

`npm run sweep` — 555 reports across five pairs × 101 thresholds × ten values of
N, checking **42,735 account rows** and **3,737 causes**, no network:

1. **Attribution completeness** — with provenance, every non-held verdict carries
   at least one named cause. Silent movement is the failure this repo exists to
   prevent.
2. **Band consistency** — the verdict computed at a cutoff equals the verdict the
   bands imply *at every position on the axis*. The most valuable of the six: a
   row can be right while the fragility claim beside it is wrong, and the
   fragility claim is the one someone acts on.
3. **Displacement soundness** — nothing is marked displaced while its own score
   fell, under a threshold, on a non-`lost` verdict, or with no overtaker named.
4. **Provenance honesty** — zero causes emitted when there is no common ancestor,
   including on accounts that plainly moved.
5. **Client/server equivalence** — the browser and `POST /api/diff` produce the
   same report. Not the same bytes: Zod rebuilds objects in schema-declaration
   order, and a test that fails for a reason which cannot change a verdict is a
   test somebody deletes. Compared canonically instead.
6. **No id leakage** — an attribution never cites a criterion absent from both
   definitions. That signature is what a pairing heuristic looks like.

The sweep lands *before* any UI in the commit history, on purpose. A bug that is
correct at cutoff 52 and wrong at 73 looks perfect in a demo, in a screenshot,
and in every test that uses the default.

## The named traps

Ten cases, each pinned to a named account in `data/traps.ts` and asserted against
the real engine. Five accounts were authored specifically because the case did
not otherwise occur — a corpus that cannot produce a verdict makes a regression
in that verdict invisible.

| # | Account | What it proves |
|---|---|---|
| 1 | `lumen-hr` | `Gained` across four thresholds. Its twin gains across forty-five. |
| 2 | `hazelmere` | Four edits land at once, none sufficient alone. |
| 3 | `harborstack` | **Fits ICP B better and is disqualified anyway** — 83, and 88 with the enterprise change withheld. A score-ranked diff shows it rising. |
| 4 | `kestrel-ops` | Released by a dropped disqualifier. `tinsel-retail` is released *and* still doesn't qualify, at 38. |
| 5 | `wickerdown` | Two edits, each sufficient alone, neither necessary. "Which one mattered" has no answer. |
| 6 | `calderwood` | The linked pair: `gte 10000000` → `between [5000000, 500000000]` cannot be ablated apart. |
| 7 | `orbital-crm` | Displacement. Score up, rank down, no edit blamed. |
| 8 | `ashbourne-edu` | `calderwood` with an unknown revenue. Same edit, opposite outcome, because a null field never matches. |
| 9 | *(the edit itself)* | An exclusion for KP and SY that matches nobody. The ledger says **changed nothing**. |
| 10 | `parcelworks` | Gains on a weight change alone. `foxglove-soft` is pushed out partly by a criterion it never matched. |

Trap 9 is the one worth dwelling on. "This edit did nothing" is a finding real
ICP owners are never handed, and it is exact rather than heuristic: a score
change always implies a verdict change at *some* threshold, so "no score moved"
proves "no verdict moves anywhere, in either mode" in a single pass.

Trap 10's mirror is the case reviewers assume is impossible. `foxglove-soft`
matches no GTM signal at all, and tripling that criterion's weight still moved
it — the denominator grew underneath it.

## What the numbers look like

At cutoff 52, over 77 accounts:

| Revision | gained | lost | disqualified | released | held in | held out |
|---|---|---|---|---|---|---|
| **Q3 revision** (8 edits) | 6 | 2 | 9 | 4 | 48 | 8 |
| **Weights only** (3 edits) | 1 | 3 | 0 | 0 | 55 | 18 |
| **Two unrelated ICPs** | 5 | 25 | 19 | 7 | 15 | 6 |

The middle row is the control. Three weight changes, nothing added, nothing
removed, every account matching exactly what it matched before — and four
accounts change side, because a weight change alters the denominator for every
account including the ones it does not match.

## The model's one job

`POST /api/parse-edits` turns *"drop the enterprise cutoff to 5,000 and stop
caring about the CRM"* into typed edit atoms against a specific ICP. That is all
it does.

It never sees the corpus, the scores or the diff. It does not phrase, polish,
rank or summarise — every sentence in the UI and in the text export comes from
`lib/diff/describe.ts`, so you cannot get nicer wording than the engine can
justify. Illegal atoms are rejected **individually with a reason and shown**,
never quietly dropped.

Two constraints Gemini's schema subset forces, both worth knowing before editing
`lib/parse/wire.ts`:

- **No unions, no tuples.** `EditAtom` is both. So the wire format is flat with
  two always-present operand arrays, and deterministic code narrows them. A
  `between` range arrives as two numbers and is refused rather than padded if
  only one shows up.
- **`from` is read out of ICP A, never taken from the model.** A model asked to
  restate the current weight sometimes restates it wrong, and a wrong `from` is a
  ledger that misdescribes an edit it applied correctly.

The whole app works with `GEMINI_API_KEY` unset: every revision, every verdict,
every band, both exports, the refusal state. Missing key → **501** pointing at
the manual ledger. Model failure → **502**.

## Architecture

```
                    ┌─ server component ──► data/corpus.ts   (Zod-validated at import)
                    │                       data/presets.ts  (ICP A + derived B)
Browser ────────────┤                       data/traps.ts    (ten fixtures, id-mapped)
                    │
                    ├─ lib/diff (pure) ───► same function runs client-side and server-side
                    │      └─ lib/scoring (vendored from Day 001, frozen)
                    │
                    ├─ POST /api/diff        ─► Zod ─► lib/diff        (auditable JSON)
                    └─ POST /api/parse-edits ─► Zod ─► key check ─► rate limit
                                                  └─ lib/parse (model, one call, edits only)
```

Three boundaries are enforced by tests rather than by convention:

**`lib/diff/` imports nothing non-relative.** Not `next`, not `react`, not `zod`,
not `@google/genai`, not `@/data`. `purity.test.ts` scans for bare specifiers
with no allowlist. A module that cannot import a model client cannot invent a
cause.

**`lib/scoring/` is vendored from Day 001 and frozen**, with a hash test over the
four source files. Day 012 contributes nothing to scoring, and its entire claim
is causal attribution over an unchanged scoring function — which only holds if
the function really is unchanged. The moment someone tweaks an operator here,
every ablation starts measuring the tweak instead of the edit.

**The engine ships to the browser and runs in the route handler as the same
code.** Not a reimplementation. Invariant 5 holds it to that.

`buildDiff({ corpus, icpA, icpB, provenance, mode })` is the only exported engine
function.

## Try it on your own data

```bash
curl -s https://icp-diff.vercel.app/api/diff \
  -H 'content-type: application/json' \
  -d '{
    "icpA": { "name": "A", "criteria": [ ... ], "disqualifiers": [] },
    "icpB": { "name": "B", "criteria": [ ... ], "disqualifiers": [] },
    "mode": { "kind": "threshold", "threshold": 52 }
  }' | jq '.attribution.state, .counts'
```

Two full ICP definitions with no `provenance` returns `"unattributed"` and the
complete outcome diff — which is the honest answer, and the one you should expect
if you are pasting two definitions you authored separately. To get attribution,
send `provenance: { "kind": "derived", "parentIcpName": "A", "edits": [ ... ] }`
and the engine will verify the edits actually produce B before believing them.

`companies` is optional; omit it to diff against the bundled corpus.

## Commands

```bash
npm install
npm run dev            # dev server
npm run build          # production build — run before claiming done
npm test               # 228 tests (globs lib/**/*.test.ts only)
npm run sweep          # the six invariants across the cross-product, no network
npm run typecheck      # next typegen && tsc --noEmit
npm run lint

npx vitest run lib/diff/traps.test.ts                  # one file
npx vitest run -t "neither enough on its own"           # one test
```

No key needed for any of it.

## Limitations, stated rather than hidden

- **The corpus is synthetic** and engineered so every verdict is reachable, which
  is the opposite of representative.
- **Attribution is exact for the edit list it is given.** Wrong provenance is
  refused rather than attributed, but provenance that is wrong *and* replays
  correctly is not detectable in principle.
- **Sufficient/necessary is a pair of booleans, not a decomposition.** With heavy
  interaction, "which edit mattered most" has no answer and this repo says so
  rather than inventing one.
- **101 integer thresholds** means sub-point cutoffs are not modelled. Day 001's
  scores are integers, so a 62.5 cutoff is not expressible upstream either.
- **The rate limiter is per-instance and in-memory.** On Vercel the effective
  limit is `5 × instances` per minute and it resets on cold start. It stops
  someone holding a button down, not a determined caller.
- **Two ICPs, one corpus.** Data drift and ICP-over-time are out of scope by
  decision: varying both sides makes attribution meaningless.

## What this repo is not

- **Not a scorer.** Day 001 (`icp-score`) owns scoring and the ICP builder, and
  its engine is vendored here unchanged.
- **Not a data cleaner.** Day 003 (`lead-cleaner`) owns messy input.
- **Not a ranker.** There is no "top opportunities" view and no composite number.
- **Not an ICP recommender.** It will tell you what an edit did. It has no
  opinion on whether you should have made it.

## Further reading

- [`PLAN.md`](PLAN.md) — the contract. 23 decisions from a four-round design
  interview, including the ones that were rejected and why.
- [`CLAUDE.md`](CLAUDE.md) — the rules that are easy to break by accident.
- [`docs/plain-english-guide.md`](docs/plain-english-guide.md) — the same ideas
  with no code in them.

## License

MIT — see [LICENSE](LICENSE).
