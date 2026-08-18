import { describe, expect, test } from "vitest";

import { CORPUS } from "@/data/corpus";
import { RIVAL_PAIR, REVISIONS, revisionById } from "@/data/presets";
import { TRAPS, TRAP_THRESHOLD, TRAP_TOP_N } from "@/data/traps";

import { buildDiff } from "./build";
import { applyEdits, withoutUnit } from "./edits";
import { scoreAccount } from "../scoring";
import type { AccountDiff, Cause, DiffReport } from "./types";

/**
 * The ten traps, asserted.
 *
 * Every case this engine can report has a fixture, because a corpus that cannot
 * produce a verdict makes a regression in that verdict invisible. These are also
 * the only tests in the repo that assert specific numbers — the sweep asserts
 * invariants instead — so when the corpus changes deliberately, this is the file
 * that tells you what the change cost.
 */

const q3 = revisionById("q3");
if (!q3) throw new Error("the q3 revision is missing from data/presets");

function reportAt(mode: Parameters<typeof buildDiff>[0]["mode"]): DiffReport {
  const result = buildDiff({
    corpus: CORPUS,
    icpA: q3.icpA,
    icpB: q3.icpB,
    provenance: q3.provenance,
    mode,
  });
  if (!result.ok) throw new Error(`buildDiff refused the bundled revision: ${result.reason}`);
  return result.report;
}

const thresholdReport = reportAt({ kind: "threshold", threshold: TRAP_THRESHOLD });
const topNReport = reportAt({ kind: "top_n", topN: TRAP_TOP_N });

function account(report: DiffReport, companyId: string): AccountDiff {
  const found = report.accounts.find((candidate) => candidate.companyId === companyId);
  if (!found) throw new Error(`${companyId} is not in the corpus`);
  return found;
}

function editCause(target: AccountDiff, atomId: string): Cause & { kind: "edit" } {
  const cause = target.causes.find(
    (candidate) => candidate.kind === "edit" && candidate.atomId === atomId,
  );
  if (!cause || cause.kind !== "edit") {
    throw new Error(
      `${target.companyId} has no cause naming ${atomId}; it has ${JSON.stringify(target.causes)}`,
    );
  }
  return cause;
}

function bandWidthOf(target: AccountDiff): number {
  return target.bands.verdictHolds.reduce((total, band) => total + (band.to - band.from + 1), 0);
}

describe("every trap in data/traps.ts names a real account", () => {
  test.each(TRAPS)("trap $n ($name) points somewhere that exists", (trap) => {
    if (trap.companyId) {
      expect(CORPUS.some((company) => company.id === trap.companyId)).toBe(true);
    }
    for (const atomId of trap.atomIds ?? []) {
      const ledger =
        thresholdReport.attribution.state === "attributed"
          ? thresholdReport.attribution.ledger
          : [];
      expect(ledger.some((entry) => entry.atomId === atomId)).toBe(true);
    }
  });
});

describe("trap 1 — near-threshold flipper", () => {
  test("lumen-hr is gained across four thresholds and hazelmere across forty-five", () => {
    const fragile = account(thresholdReport, "lumen-hr");
    const structural = account(thresholdReport, "hazelmere");

    expect(fragile.verdict).toBe("gained");
    expect(structural.verdict).toBe("gained");

    // Identical in the movement table. Not remotely identical in the bands.
    expect(fragile.bands.verdictHolds).toEqual([{ from: 51, to: 54 }]);
    expect(bandWidthOf(fragile)).toBe(4);
    expect(bandWidthOf(structural)).toBe(45);
  });

  test("the margin is measured to the closer edge", () => {
    // Gained for 51–54 with the cutoff at 52: two points down, three up.
    expect(account(thresholdReport, "lumen-hr").margin).toBe(2);
  });
});

describe("trap 2 — structural gainer", () => {
  test("hazelmere goes 17 to 62 and holds gained from 18 to 62", () => {
    const structural = account(thresholdReport, "hazelmere");
    expect(structural.a.score).toBe(17);
    expect(structural.b.score).toBe(62);
    expect(structural.bands.verdictHolds).toEqual([{ from: 18, to: 62 }]);
  });

  test("no single edit is sufficient — several are necessary", () => {
    const structural = account(thresholdReport, "hazelmere");
    const edits = structural.causes.filter((cause) => cause.kind === "edit");
    expect(edits.length).toBeGreaterThan(1);
    expect(edits.every((cause) => cause.kind === "edit" && !cause.sufficient)).toBe(true);
    expect(edits.some((cause) => cause.kind === "edit" && cause.necessary)).toBe(true);
  });
});

describe("trap 3 — disqualifier-only loss", () => {
  test("harborstack fits ICP B better than ICP A and is disqualified anyway", () => {
    const target = account(thresholdReport, "harborstack");
    expect(target.verdict).toBe("newly_disqualified");
    expect(target.a.score).toBe(83);
    expect(target.b.score).toBe(0);
    expect(target.b.disqualified).toBe(true);

    // Withhold only the enterprise-threshold change and the score *rises*. This is
    // the number a score-ranked diff would have shown, and it points the wrong way.
    const units = q3.provenance.kind === "derived" ? q3.provenance.edits : [];
    const dqAtom = units.find(
      (atom) => atom.kind === "disqualifier_value_changed" && atom.disqualifierId === "dq-enterprise",
    );
    expect(dqAtom).toBeDefined();
    if (!dqAtom) return;
    const without = applyEdits(q3.icpA, withoutUnit(units, { atomIds: ["disqualifier_value_changed:dq-enterprise"], atoms: [dqAtom], linked: false }));
    expect(without.ok).toBe(true);
    if (!without.ok) return;
    const company = CORPUS.find((candidate) => candidate.id === "harborstack");
    expect(company).toBeDefined();
    if (!company) return;
    expect(scoreAccount(company, without.icp).score).toBe(88);
  });

  test("the criteria that would have matched are kept in the breakdown", () => {
    const target = account(thresholdReport, "harborstack");
    const matched = target.breakdown.b.criteria.filter((criterion) => criterion.matched);
    expect(matched.length).toBeGreaterThan(4);
  });

  test("a disqualification verdict does not depend on the cutoff", () => {
    const target = account(thresholdReport, "harborstack");
    expect(target.bands.verdictHolds).toEqual([{ from: 0, to: 100 }]);
    expect(target.margin).toBeNull();
  });
});

describe("trap 4 — released account", () => {
  test("kestrel-ops is undisqualified by dropping the hiring-freeze rule", () => {
    const target = account(thresholdReport, "kestrel-ops");
    expect(target.verdict).toBe("undisqualified");
    expect(target.a.disqualified).toBe(true);
    expect(target.b.score).toBe(58);
    expect(editCause(target, "disqualifier_removed:dq-budget")).toMatchObject({
      sufficient: true,
      necessary: true,
    });
  });

  test("tinsel-retail is released and still does not qualify", () => {
    const target = account(thresholdReport, "tinsel-retail");
    expect(target.verdict).toBe("undisqualified");
    expect(target.b.score).toBe(38);
    expect(target.b.qualified).toBe(false);
  });
});

describe("trap 5 — interaction", () => {
  test("wickerdown has two sufficient causes and no necessary one", () => {
    const target = account(thresholdReport, "wickerdown");
    expect(target.verdict).toBe("gained");

    const headcount = editCause(target, "value_changed:headcount");
    const weight = editCause(target, "weight_changed:gtm-hiring");

    expect(headcount).toMatchObject({ sufficient: true, necessary: false });
    expect(weight).toMatchObject({ sufficient: true, necessary: false });

    // Either edit alone would have done it, so "which one mattered" has no answer
    // and the engine declines to invent a share.
    expect(target.causes.every((cause) => cause.kind !== "combination")).toBe(true);
  });
});

describe("trap 6 — linked atom group", () => {
  test("the revenue operator and value changes share one ablation verdict", () => {
    const ledger =
      thresholdReport.attribution.state === "attributed" ? thresholdReport.attribution.ledger : [];
    const operatorEntry = ledger.find((entry) => entry.atomId === "operator_changed:revenue");
    const valueEntry = ledger.find((entry) => entry.atomId === "value_changed:revenue");
    expect(operatorEntry?.linkedWith).toEqual(["value_changed:revenue"]);
    expect(valueEntry?.linkedWith).toEqual(["operator_changed:revenue"]);
    expect(operatorEntry?.necessaryCount).toBe(valueEntry?.necessaryCount);
    expect(operatorEntry?.sufficientCount).toBe(valueEntry?.sufficientCount);
  });

  test("the pair is necessary for calderwood's gain", () => {
    const target = account(thresholdReport, "calderwood");
    expect(target.verdict).toBe("gained");
    expect(editCause(target, "operator_changed:revenue").necessary).toBe(true);
    expect(editCause(target, "value_changed:revenue").necessary).toBe(true);
  });
});

describe("trap 7 — displacement", () => {
  test("orbital-crm loses its slot with its own score higher than before", () => {
    const target = account(topNReport, "orbital-crm");
    expect(target.verdict).toBe("lost");
    expect(target.b.score).toBeGreaterThan(target.a.score);
    expect(target.a.rank).toBeLessThan(target.b.rank);

    const displacement = target.causes.find((cause) => cause.kind === "displacement");
    expect(displacement).toBeDefined();
    if (!displacement || displacement.kind !== "displacement") return;
    expect(displacement.overtakenBy.length).toBeGreaterThan(0);
  });

  test("displacement is never blended with an edit cause", () => {
    const target = account(topNReport, "orbital-crm");
    expect(target.causes).toHaveLength(1);
    expect(target.causes[0]?.kind).toBe("displacement");
  });

  test("displacement does not exist in threshold mode", () => {
    const displaced = thresholdReport.accounts.filter((candidate) =>
      candidate.causes.some((cause) => cause.kind === "displacement"),
    );
    expect(displaced).toEqual([]);
  });
});

describe("trap 8 — null field", () => {
  test("ashbourne-edu is calderwood with an unknown revenue, and stays out", () => {
    const known = account(thresholdReport, "calderwood");
    const unknown = account(thresholdReport, "ashbourne-edu");

    expect(known.verdict).toBe("gained");
    expect(unknown.verdict).toBe("held_out");
    expect(known.b.score).toBe(58);
    expect(unknown.b.score).toBe(50);
  });

  test("the breakdown says the field is missing rather than reporting a comparison", () => {
    const unknown = account(thresholdReport, "ashbourne-edu");
    const revenue = unknown.breakdown.b.criteria.find(
      (criterion) => criterion.criterionId === "revenue",
    );
    expect(revenue?.matched).toBe(false);
    expect(revenue?.detail).toContain("missing");
  });
});

describe("trap 9 — zero-movement edit", () => {
  test("the sanctioned-jurisdiction exclusion changed nothing", () => {
    const ledger =
      thresholdReport.attribution.state === "attributed" ? thresholdReport.attribution.ledger : [];
    const entry = ledger.find((candidate) => candidate.atomId === "disqualifier_added:dq-sanctioned");
    expect(entry?.changedNothing).toBe(true);
    expect(entry?.movedIn).toBe(0);
    expect(entry?.movedOut).toBe(0);
    expect(entry?.sufficientCount).toBe(0);
    expect(entry?.necessaryCount).toBe(0);
  });

  test("no other edit in the revision is marked as changing nothing", () => {
    const ledger =
      thresholdReport.attribution.state === "attributed" ? thresholdReport.attribution.ledger : [];
    const inert = ledger.filter((entry) => entry.changedNothing).map((entry) => entry.atomId);
    expect(inert).toEqual(["disqualifier_added:dq-sanctioned"]);
  });

  test("it is inert under top-N too", () => {
    const ledger = topNReport.attribution.state === "attributed" ? topNReport.attribution.ledger : [];
    const entry = ledger.find((candidate) => candidate.atomId === "disqualifier_added:dq-sanctioned");
    expect(entry?.changedNothing).toBe(true);
  });
});

describe("trap 10 — weight-only mover", () => {
  test("parcelworks gains on a weight change and nothing else", () => {
    const target = account(thresholdReport, "parcelworks");
    expect(target.verdict).toBe("gained");
    expect(target.causes).toHaveLength(1);
    expect(editCause(target, "weight_changed:gtm-hiring")).toMatchObject({
      sufficient: true,
      necessary: true,
    });
  });

  test("foxglove-soft is pushed out partly by a criterion it never matched", () => {
    const target = account(thresholdReport, "foxglove-soft");
    expect(target.verdict).toBe("lost");
    expect(target.a.score).toBe(56);
    expect(target.b.score).toBe(38);

    // It matches no GTM signal at all, and tripling that weight still moved it —
    // the denominator grew under it.
    const company = CORPUS.find((candidate) => candidate.id === "foxglove-soft");
    expect(company?.hiring_signals).not.toContain("hiring_sales");
    expect(editCause(target, "weight_changed:gtm-hiring").sufficient).toBe(true);
  });
});

describe("the rival pair refuses attribution", () => {
  test("the outcome diff computes and the ledger does not exist", () => {
    const result = buildDiff({
      corpus: CORPUS,
      icpA: RIVAL_PAIR.icpA,
      icpB: RIVAL_PAIR.icpB,
      provenance: RIVAL_PAIR.provenance,
      mode: { kind: "threshold", threshold: TRAP_THRESHOLD },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.report.accounts).toHaveLength(CORPUS.length);
    expect(result.report.attribution.state).toBe("unattributed");
    if (result.report.attribution.state !== "unattributed") return;
    expect(result.report.attribution.reason).toContain("no common ancestor");

    // Not one cause anywhere, including on accounts that plainly moved.
    expect(result.report.accounts.every((account) => account.causes.length === 0)).toBe(true);
    const moved = result.report.accounts.filter(
      (account) => account.verdict !== "held_in" && account.verdict !== "held_out",
    );
    expect(moved.length).toBeGreaterThan(0);
  });

  test("bands and margins still work without provenance", () => {
    const result = buildDiff({
      corpus: CORPUS,
      icpA: RIVAL_PAIR.icpA,
      icpB: RIVAL_PAIR.icpB,
      provenance: RIVAL_PAIR.provenance,
      mode: { kind: "threshold", threshold: TRAP_THRESHOLD },
    });
    if (!result.ok) throw new Error(result.reason);
    const withBands = result.report.accounts.filter(
      (account) => account.bands.verdictHolds.length > 0,
    );
    expect(withBands).toHaveLength(CORPUS.length);
  });
});

describe("a wrong edit list is refused outright", () => {
  test("provenance that does not produce ICP B produces no report at all", () => {
    const weights = revisionById("weights");
    expect(weights).toBeDefined();
    if (!weights) return;

    // The q3 edit list against the reweighted ICP B: every ablation would run and
    // attribute confidently to the wrong revision.
    const result = buildDiff({
      corpus: CORPUS,
      icpA: q3.icpA,
      icpB: weights.icpB,
      provenance: q3.provenance,
      mode: { kind: "threshold", threshold: TRAP_THRESHOLD },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("do not produce");
  });
});

describe("both bundled revisions build", () => {
  test.each(REVISIONS)("$label produces a report with a ledger", (rev) => {
    const result = buildDiff({
      corpus: CORPUS,
      icpA: rev.icpA,
      icpB: rev.icpB,
      provenance: rev.provenance,
      mode: { kind: "threshold", threshold: TRAP_THRESHOLD },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.attribution.state).toBe("attributed");
  });

  test("the weights-only revision moves accounts, which reviewers assume it cannot", () => {
    const weights = revisionById("weights");
    if (!weights) throw new Error("missing");
    const result = buildDiff({
      corpus: CORPUS,
      icpA: weights.icpA,
      icpB: weights.icpB,
      provenance: weights.provenance,
      mode: { kind: "threshold", threshold: TRAP_THRESHOLD },
    });
    if (!result.ok) throw new Error(result.reason);
    const moved = result.report.accounts.filter(
      (account) => account.verdict !== "held_in" && account.verdict !== "held_out",
    );
    expect(moved.length).toBeGreaterThan(0);
    // Nothing was added or removed, so every cause is a weight change.
    for (const account of moved) {
      for (const cause of account.causes) {
        if (cause.kind !== "edit") continue;
        expect(cause.atomId.startsWith("weight_changed:")).toBe(true);
      }
    }
  });
});
