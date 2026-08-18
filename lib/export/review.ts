/**
 * The text change review, assembled from templates.
 *
 * No model touches this. Every sentence is a function of the report, which means
 * you cannot get nicer wording than the engine can justify — and that is the
 * point. A model asked to "summarise the diff" writes a fluent paragraph
 * containing one causal claim the engine never licensed, and nobody reading the
 * paragraph can tell which sentence it was.
 *
 * Reads like a release note, because that is what an ICP revision is.
 */

import type { AccountDiff, DiffReport, LedgerEntry } from "../diff";
import { describeBands } from "../diff";

function pluralAccounts(count: number): string {
  return count === 1 ? "1 account" : `${count} accounts`;
}

function bandWidth(account: AccountDiff): number {
  return account.bands.verdictHolds.reduce((total, band) => total + (band.to - band.from + 1), 0);
}

/** Where the cutoff sits, said in the language of the active mode. */
function cutoffPhrase(report: DiffReport): string {
  return report.mode.kind === "threshold"
    ? `a score cutoff of ${report.mode.threshold}`
    : `the top ${report.mode.topN} by rank`;
}

/**
 * One line per edit.
 *
 * The counts are stated, never converted into a share. "Brought in 6 accounts, 2
 * of them only within thresholds 55–61" is two facts a reader can check. "Was
 * responsible for 34% of the movement" is a number a reader can only believe.
 */
function ledgerLine(entry: LedgerEntry, report: DiffReport): string {
  if (entry.changedNothing) {
    return `${capitalise(entry.description)} changed no account's score, so it changed no verdict at any cutoff.`;
  }

  const caused = report.accounts.filter((account) =>
    account.causes.some((cause) => cause.kind === "edit" && cause.atomId === entry.atomId),
  );

  if (caused.length === 0) {
    return `${capitalise(entry.description)} moved nobody at ${cutoffPhrase(report)}.`;
  }

  const parts: string[] = [];
  if (entry.movedIn > 0) parts.push(`brought in ${pluralAccounts(entry.movedIn)}`);
  if (entry.movedOut > 0) parts.push(`pushed out ${pluralAccounts(entry.movedOut)}`);
  if (parts.length === 0) parts.push(`is named on ${pluralAccounts(caused.length)} that changed verdict`);

  const fragile = caused.filter((account) => account.margin !== null && account.margin <= 5);
  if (fragile.length > 0) {
    const narrowest = fragile.reduce((tightest, account) =>
      bandWidth(account) < bandWidth(tightest) ? account : tightest,
    );
    parts.push(
      `${fragile.length} of them within ${fragile[0]?.margin === 1 ? "one point" : "a few points"} of flipping back — ${narrowest.companyName} only holds at ${describeBands(narrowest.bands.verdictHolds)}`,
    );
  }

  const interactions = caused.filter((account) =>
    account.causes.some(
      (cause) => cause.kind === "edit" && cause.atomId === entry.atomId && cause.sufficient !== cause.necessary,
    ),
  );
  if (interactions.length > 0) {
    parts.push(
      `on ${pluralAccounts(interactions.length)} it is either enough on its own without being required, or required without being enough`,
    );
  }

  return `${capitalise(entry.description)} ${parts.join("; ")}.`;
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text[0]?.toUpperCase() + text.slice(1);
}

export function changeReview(report: DiffReport): string {
  const lines: string[] = [];

  lines.push(`ICP change review`);
  lines.push(`${report.icpA.name} → ${report.icpB.name}`);
  lines.push(
    `${report.corpusSize} accounts, qualifying at ${cutoffPhrase(report)}. ${report.icpA.criteria} criteria and ${report.icpA.disqualifiers} disqualifiers became ${report.icpB.criteria} and ${report.icpB.disqualifiers}.`,
  );
  lines.push("");

  const { counts } = report;
  lines.push(
    `Gained ${counts.gained}, lost ${counts.lost}, newly disqualified ${counts.newly_disqualified}, released from a disqualifier ${counts.undisqualified}. ${counts.held_in} held in, ${counts.held_out} held out.`,
  );
  lines.push("");

  if (report.attribution.state === "unattributed") {
    lines.push(`Attribution: refused.`);
    lines.push(
      `${capitalise(report.attribution.reason)}. The movement above is computed and correct; naming an edit behind any of it would mean pairing criteria across two definitions that share no ids, which produces confident statements about criteria that exist in neither.`,
    );
  } else {
    lines.push(`What each edit did:`);
    for (const entry of report.attribution.ledger) {
      lines.push(`- ${ledgerLine(entry, report)}`);
    }

    if (report.attribution.combinationMoves > 0) {
      lines.push("");
      lines.push(
        `${pluralAccounts(report.attribution.combinationMoves)} moved with no single edit sufficient or necessary: remove any one edit and the move still happens, apply any one alone and it does not. No edit is named for those.`,
      );
    }
  }

  const displaced = report.accounts.filter((account) =>
    account.causes.some((cause) => cause.kind === "displacement"),
  );
  if (displaced.length > 0) {
    lines.push("");
    lines.push(`Displacement:`);
    for (const account of displaced) {
      const cause = account.causes.find((candidate) => candidate.kind === "displacement");
      if (!cause || cause.kind !== "displacement") continue;
      lines.push(
        `- ${account.companyName} lost its slot with its own score at ${account.b.score}, up from ${account.a.score}. Rank ${account.a.rank} → ${account.b.rank}, overtaken by ${cause.overtakenBy.join(", ")}. No edit is blamed for this.`,
      );
    }
  }

  const fragile = report.accounts.filter(
    (account) =>
      account.verdict !== "held_in" &&
      account.verdict !== "held_out" &&
      account.margin !== null &&
      account.margin <= 3,
  );
  if (fragile.length > 0) {
    lines.push("");
    lines.push(`Read these with care — their verdict turns on the cutoff:`);
    for (const account of fragile) {
      lines.push(
        `- ${account.companyName}: ${account.verdict.replace(/_/g, " ")} only at ${describeBands(account.bands.verdictHolds)}, ${account.margin} from flipping.`,
      );
    }
  }

  lines.push("");
  lines.push(
    `Every claim above is an ablation over the recorded edit list, run against this corpus. There is no number here saying how much any edit mattered, because there is no such number that could be checked.`,
  );

  return lines.join("\n");
}

/** The full auditable report. Pretty-printed, because it is meant to be read. */
export function reportJson(report: DiffReport): string {
  return JSON.stringify(report, null, 2);
}
