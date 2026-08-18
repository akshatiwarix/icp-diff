import { describe, expect, test } from "vitest";

import { CORPUS } from "@/data/corpus";
import { RIVAL_PAIR, REVISIONS } from "@/data/presets";
import { TRAP_THRESHOLD, TRAP_TOP_N } from "@/data/traps";
import { buildDiff } from "@/lib/diff";
import type { DiffReport } from "@/lib/diff";

import { changeReview, reportJson } from "./review";

function report(
  pair: { icpA: DiffReport extends never ? never : Parameters<typeof buildDiff>[0]["icpA"]; icpB: Parameters<typeof buildDiff>[0]["icpB"]; provenance: Parameters<typeof buildDiff>[0]["provenance"] },
  mode: Parameters<typeof buildDiff>[0]["mode"],
): DiffReport {
  const result = buildDiff({ corpus: CORPUS, ...pair, mode });
  if (!result.ok) throw new Error(result.reason);
  return result.report;
}

const q3 = REVISIONS[0];
if (!q3) throw new Error("missing q3 revision");

const thresholdReview = changeReview(report(q3, { kind: "threshold", threshold: TRAP_THRESHOLD }));
const topNReview = changeReview(report(q3, { kind: "top_n", topN: TRAP_TOP_N }));

describe("the change review is assembled, not written", () => {
  test("it names both ICPs and the cutoff it was computed at", () => {
    expect(thresholdReview).toContain("Mid-market B2B SaaS (North America)");
    expect(thresholdReview).toContain("Mid-market B2B SaaS — Q3 revision");
    expect(thresholdReview).toContain(`a score cutoff of ${TRAP_THRESHOLD}`);
    expect(topNReview).toContain(`the top ${TRAP_TOP_N} by rank`);
  });

  test("it reports the edit that changed nothing", () => {
    expect(thresholdReview).toContain("changed no account's score");
  });

  test("it flags the accounts whose verdict turns on the cutoff", () => {
    expect(thresholdReview).toContain("their verdict turns on the cutoff");
    // lumen-hr holds `gained` only across 51–54.
    expect(thresholdReview).toContain("51–54");
  });

  test("it reports displacement under top-N and never blames an edit for it", () => {
    expect(topNReview).toContain("Displacement:");
    expect(topNReview).toContain("No edit is blamed for this.");
  });

  test("no displacement section when a threshold is in play", () => {
    expect(thresholdReview).not.toContain("Displacement:");
  });

  test("it contains no percentage, share or impact claim anywhere", () => {
    // The rule from CLAUDE.md, enforced on the one output most likely to break it:
    // a summary is where a share sneaks in, because a share reads well.
    for (const text of [thresholdReview, topNReview]) {
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/\bimpact\b/i);
      expect(text).not.toMatch(/\bresponsible for\b/i);
      expect(text).not.toMatch(/\bcontributed\s+\d/i);
    }
  });

  test("the refusal is stated in the review, not omitted from it", () => {
    const refused = changeReview(
      report(
        { icpA: RIVAL_PAIR.icpA, icpB: RIVAL_PAIR.icpB, provenance: RIVAL_PAIR.provenance },
        { kind: "threshold", threshold: TRAP_THRESHOLD },
      ),
    );
    expect(refused).toContain("Attribution: refused.");
    // Sentence-cased by the template, hence the case-insensitive match.
    expect(refused).toMatch(/no common ancestor/i);
    expect(refused).toContain("computed and correct");
    // Still a full outcome report.
    expect(refused).toContain("Gained");
  });

  test("every line is finite and none is a stray template", () => {
    for (const line of thresholdReview.split("\n")) {
      expect(line).not.toContain("undefined");
      expect(line).not.toContain("NaN");
      expect(line).not.toContain("[object");
    }
  });
});

describe("the JSON export", () => {
  test("round-trips and carries the causes, bands and ledger", () => {
    const source = report(q3, { kind: "threshold", threshold: TRAP_THRESHOLD });
    const parsed = JSON.parse(reportJson(source)) as DiffReport;
    expect(parsed.accounts).toHaveLength(CORPUS.length);
    expect(parsed.attribution.state).toBe("attributed");
    const mover = parsed.accounts.find((account) => account.verdict === "gained");
    expect(mover?.causes.length).toBeGreaterThan(0);
    expect(mover?.bands.verdictHolds.length).toBeGreaterThan(0);
  });

  test("it carries the refusal when there is no provenance", () => {
    const parsed = JSON.parse(
      reportJson(
        report(
          { icpA: RIVAL_PAIR.icpA, icpB: RIVAL_PAIR.icpB, provenance: RIVAL_PAIR.provenance },
          { kind: "threshold", threshold: TRAP_THRESHOLD },
        ),
      ),
    ) as DiffReport;
    expect(parsed.attribution).toMatchObject({ state: "unattributed" });
  });
});
