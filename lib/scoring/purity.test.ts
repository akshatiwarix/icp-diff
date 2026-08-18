import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

/**
 * The purity boundary, enforced rather than documented.
 *
 * `lib/scoring/` must not import a framework or an SDK. That is what makes the
 * engine unit-testable without a harness and reusable unchanged by Day 012
 * (`icp-diff`) and Day 017 (`tam-calculator`). A comment in CLAUDE.md asks
 * politely; this test refuses.
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
  "@/lib/icp",
];

const sourceFiles = readdirSync(here)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .sort();

/** Matches the module specifier of any static import or re-export. */
const IMPORT_SPECIFIER = /(?:from|import)\s+["']([^"']+)["']/g;

describe("lib/scoring imports nothing from a framework", () => {
  test("the scan actually found the engine source", () => {
    expect(sourceFiles).toContain("engine.ts");
    expect(sourceFiles).toContain("operators.ts");
    expect(sourceFiles).toContain("types.ts");
    expect(sourceFiles).toContain("index.ts");
  });

  test.each(sourceFiles)("%s imports only relative modules", (name) => {
    const source = readFileSync(join(here, name), "utf8");
    const specifiers = [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");

    expect(specifiers.filter((specifier) => FORBIDDEN.includes(specifier))).toEqual([]);
    // Anything non-relative is a dependency by definition, so the rule is simply:
    // no bare specifiers at all.
    expect(specifiers.filter((specifier) => !specifier.startsWith("."))).toEqual([]);
  });
});
