import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

/**
 * The purity boundary, enforced rather than documented.
 *
 * `lib/diff/` must not import a framework, an SDK, or a data module. This is not
 * stylistic: a module that cannot import a model client cannot invent a cause, so
 * every cause attached to every verdict must have come from an ablation over the
 * edit list that was passed in as an argument. It is also what lets the engine
 * ship to the browser and run in a route handler as literally the same code.
 *
 * There is no allowlist. If a change here needs a package, the code belongs in
 * `lib/parse/` or the route handler.
 */

const here = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  "next",
  "next/server",
  "react",
  "react-dom",
  "@google/genai",
  "zod",
  "@/data",
  "@/app",
  "@/lib/parse",
];

const sourceFiles = readdirSync(here)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort();

/** Matches the module specifier of any static import or re-export. */
const IMPORT_SPECIFIER = /(?:from|import)\s+["']([^"']+)["']/g;

/**
 * Comments are stripped before scanning.
 *
 * Day 001's version of this test scans the raw source, which is fine until a
 * doc comment contains the words `from "..."` — this file's own prose about
 * margins did, and the test failed on a sentence. A scanner that reports
 * violations in comments trains you to reword documentation to satisfy it,
 * which is precisely backwards.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("lib/diff imports nothing from a framework", () => {
  test("the scan actually found the engine source", () => {
    expect(sourceFiles).toContain("types.ts");
    expect(sourceFiles).toContain("edits.ts");
    expect(sourceFiles.length).toBeGreaterThan(2);
  });

  test.each(sourceFiles)("%s imports only relative modules", (name) => {
    const source = stripComments(readFileSync(join(here, name), "utf8"));
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");

    expect(specifiers.filter((specifier) => FORBIDDEN.includes(specifier))).toEqual([]);
    // Anything non-relative is a dependency by definition, so the rule is simply:
    // no bare specifiers at all.
    expect(specifiers.filter((specifier) => !specifier.startsWith("."))).toEqual([]);
  });
});
