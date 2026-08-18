# ICP Diff — how it works, in plain English

No code in this document. If you have ever changed the definition of a good
customer and then wondered what you actually did, this is for you.

**Try it:** https://icp-diff.vercel.app

---

## The situation

Your company has a definition of a good-fit account. Headcount in some range, in
certain industries, in certain countries, showing certain buying signals. Some
things count for more than others. Some things rule an account out completely —
too big for your team, in a country you cannot host data in, in the middle of
layoffs.

That definition gets changed. Every quarter, after every pipeline review, every
time a rep insists it is wrong. Somebody widens the headcount range, decides
hiring signals matter more than they used to, drops an exclusion that was costing
you good accounts, and moves the handoff line to the enterprise team.

Then the target list looks different, and nobody can say which of those four
changes did it.

## What the usual tool tells you

It runs the old definition, runs the new one, and reports:

> **14 accounts gained, 9 lost.**

That sentence is about two lists. It is not about any of the four changes you
made. And because it looks like an answer, it stops people from asking for one.

Four things go wrong with it, and this tool exists because of them.

## Problem one: nothing is named as the cause

You made four changes at once. "14 gained" credits none of them.

The question you actually have is *"was dropping that exclusion worth it?"* — a
question about one change. A list comparison cannot answer it, no matter how
nicely it is presented.

**What this tool does instead.** It takes each change on its own and re-runs the
whole thing. Then, for every account that moved, it can say which change moved
it — and it says it in a way you can check yourself.

## Problem two: "gained" is not one thing

Qualifying means clearing a bar. Say the bar is 52 out of 100.

Two accounts both show up as *gained*. Look closer:

| | before | after | gains when the bar is set at… |
|---|---|---|---|
| Lumen HR | 50 | 54 | **51 to 54** |
| Hazelmere Care | 17 | 62 | **18 to 62** |

Lumen HR is gained across four possible bar settings out of a hundred and one. It
is one small change away from going back. Hazelmere Care is gained across
forty-five. It is a real change in who fits.

In a normal comparison these two look identical. This tool draws a little bar
beside each account showing the whole range over which its result holds, so the
difference between "this genuinely changed" and "this is a rounding coincidence"
is visible at a glance rather than something you have to go and check.

It does that by trying **every** bar setting from 0 to 100 under both
definitions, rather than sampling a few and guessing.

## Problem three: sometimes there is no honest answer, and tools give one anyway

There is a difference between these two situations:

**You edited your definition.** The tool knows the old one, the new one, and the
list of edits between them. It can take each edit away and see what happens.
Everything above works.

**You have two definitions that were written separately.** Your mid-market
profile and your early-stage profile, say. Nobody edited one into the other.

In the second case there is no list of edits, so there is nothing to name. A tool
can *pretend*: it can line up the two definitions side by side, guess which
criterion in one corresponds to which in the other, and then talk confidently
about "the headcount criterion being loosened".

That guess is wrong more often than it sounds. Both profiles have a headcount
range, and the two ranges mean opposite things — one says *bigger than this*, the
other says *smaller than this*. Matching them produces a sentence about a
criterion that exists in neither profile.

So when there is no shared history, this tool says:

> **Unattributed — no common ancestor.**

And then it still shows you everything it legitimately can: who moved, in which
direction, and how firmly. It just does not tell you why, because it does not
know why. You can see this state in the app by picking "Two unrelated ICPs".

## Problem four: sometimes an account leaves without anything happening to it

There are two ways to decide who is in.

**A bar.** Everyone above 52 is in. Whether an account is in depends only on that
account.

**A top list.** The best 20 are in. Now whether an account is in depends on
everybody else.

Under a top list, an account can drop off with its own score *higher* than
before, because other accounts improved more and pushed past it. Orbital CRM in
the demo goes from 89 to 92 and falls from thirteenth place to twenty-first.

Nothing about Orbital CRM's fit changed. A tool that blames "the hiring-signal
weight change" for this is saying something technically true and completely
misleading — that edit did not touch this account at all.

This tool calls that **displacement**, names the accounts that took the slot, and
never mixes it up with an edit. Two different things happened, and they get two
different names.

## The two questions asked about every change

For each account that moved, and each change you made, the tool asks two
questions. Both are answered by actually re-running the numbers, not by
reasoning.

**"Would this change have done it on its own?"** Apply just that one change to
the old definition. Does the account move? If yes, that change was **enough on
its own**.

**"Was this change needed?"** Apply everything *except* that change. Does the
account stay put? If yes, that change was **needed**.

You get four possible answers, and all four are useful:

- **Enough on its own, and needed.** This change is the reason. Clean.
- **Enough on its own, but not needed.** Another change would have done it too.
  So "which change caused this?" genuinely has no single answer — and the tool
  says so rather than picking.
- **Needed, but not enough on its own.** It took a combination, and this was part
  of it.
- **Neither.** Nothing to say about this change and this account.

## Why there is no percentage anywhere

The obvious next step is a number: *"the headcount change was responsible for 34%
of the movement."* There is real maths for this, and it would fit on the screen
beautifully.

It is deliberately not here.

Two reasons. A percentage gets read as a measurement, and nobody who reads it can
check it. And once a number is on the screen, people sort by it, set targets
against it, and argue about it — all of which requires trusting a figure whose
derivation nobody can follow.

The two questions above are each answered by one re-run you could do by hand. If
the tool says "this change was enough on its own", you can take that change,
apply it alone, and see for yourself. That is a smaller claim than 34%, and it is
worth more, because it is checkable.

## The thing nobody ever gets told

One of the eight changes in the demo revision is an exclusion someone added in
good faith: *don't contract in sanctioned jurisdictions.* Sensible. Reasonable.

It matches nobody. Not one account in the list. It changes no score, and it
changes nothing at any bar setting.

The tool labels it **changed nothing**, in the list, next to the change. Not
buried in a log. Real definitions accumulate rules like this for years, and the
usual reporting has no way to say "this one does nothing" — because the usual
reporting only counts what moved.

## What you see on screen

Three parts, left to right.

**The list of changes.** One row per change. Each row shows how many accounts
came in because of it, how many went out, how many it could have moved on its
own, and how many would not have moved without it. Click a row and the middle
column filters to just the accounts that change affected.

**The accounts.** One row per account: what it scored before and after, whether
it is in or out, why, and the little bar showing how firmly. Click any account
and it opens up to show both definitions scored side by side, with every line
that changed highlighted — including for accounts that got ruled out, because
"would have been a strong fit apart from the size rule" is worth knowing.

**The controls.** Move the bar and everything recomputes instantly. Switch
between "clear the bar" and "top 20". Switch which revision you are looking at.
Add your own change, either by picking it from a menu or by typing what you want
in plain English.

## The one thing the AI does

You can type *"drop the enterprise cutoff to 5,000 and stop caring about the
CRM"* and it becomes two changes in the list.

That is the whole job. The AI translates your sentence into structured changes.
It never sees the accounts, never sees the scores, never sees the comparison, and
never writes a word that you read. Every sentence in the app and in the exported
summary is assembled by the tool from what it can prove.

This matters more than it sounds. If you let a model write the summary, you get a
fluent paragraph containing one causal claim the tool never actually established
— and nobody reading it can tell which sentence that was. So the summary is
built from templates, and it reads a little plainer than a model would write it.
That is the trade, made on purpose.

Everything except that one translation step works with no AI configured at all.

## What you can take away

Two exports.

**A change review**, in words, that reads like a release note:

> Widening headcount to 50–3,000 brought in 6 accounts, 2 of them only within a
> few points of flipping back. Dropping the hiring-freeze exclusion released 1
> account. Adding the sanctioned-jurisdiction exclusion changed no account's
> score, so it changed no result at any cutoff.

**The full detail**, as a file, containing every account, every result, every
range, and both answers for every change-and-account pair — so somebody who
disagrees with a conclusion can go and check the specific claim rather than
arguing about the summary.

## What this is not

- Not a scoring tool. That is [a different project in this series](https://github.com/akshatiwarix/icp-score), and its scoring code is reused here without a single change.
- Not a data cleaner. It assumes your account data is already in order.
- Not a recommender. It will tell you exactly what your change did. It has no
  opinion on whether you should have made it.

## Honest limitations

- **The accounts are made up.** Seventy-seven synthetic companies, built so that
  every interesting case actually appears. Not a sample of anything real.
- **It trusts your list of changes.** If you tell it the wrong list, it checks
  that the list really does turn the old definition into the new one, and refuses
  outright if it does not. But a list that is wrong *and* self-consistent cannot
  be caught.
- **Scores are whole numbers**, so bars are whole numbers, so a bar at 62.5 is
  not something this can model.
- **Everything is compared against one fixed set of accounts.** Comparing two
  definitions *and* two different account lists at once would make the whole
  cause-and-effect story meaningless, so it is not offered.

---

Day 012 of a 100-day building challenge · MIT licensed ·
[source](https://github.com/akshatiwarix/icp-diff)
