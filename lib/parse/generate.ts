/**
 * The only place in this repo that calls a model.
 *
 * Its job: turn a sentence about how the ICP should change into typed edit atoms
 * against a specific ICP A. That is all. It does not score, rank, phrase, polish,
 * summarise or explain, and it never sees the corpus, the scores or the diff. Every
 * sentence the user reads about a diff comes from `lib/diff/describe.ts`.
 *
 * This is a narrower job than Day 001's `parse-icp`, and a genuinely different
 * one: parsing a *mutation* against an existing structure rather than a definition
 * from nothing. The model has to resolve "loosen the headcount range" to the id
 * `headcount`, which means the prompt has to show it the ICP — and that is also
 * why every returned entry is checked against that same ICP before it counts.
 */

import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";

import { COMPANY_FIELDS, OPERATORS, type IcpDefinition } from "@/lib/scoring";
import { EDIT_ATOM_KINDS, describeAtom, type EditAtom } from "@/lib/diff";

import { assembleBatch, type WireEdit } from "./wire";

/**
 * Verified working against this project's key. `gemini-2.5-flash` and
 * `gemini-2.0-flash` return `404 — no longer available to new users`; do not
 * "upgrade" to them.
 */
export const MODEL = "gemini-3.6-flash";

export const MAX_PROSE_LENGTH = 2000;

export type RejectedEntry = { entry: unknown; reason: string };

export type GenerateResult =
  | {
      ok: true;
      atoms: EditAtom[];
      /** One reason per entry that could not be assembled. Never silently dropped. */
      rejected: RejectedEntry[];
      descriptions: string[];
      usage: { promptTokens: number; outputTokens: number };
    }
  | { ok: false; status: number; error: string };

export function hasApiKey(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").length > 0;
}

/**
 * The response schema.
 *
 * Flat by necessity — see `wire.ts`. Every field is `required` even when a given
 * kind ignores it, because an OpenAPI-subset schema cannot make a field
 * conditionally required and a model given optional fields omits them
 * unpredictably. Empty arrays and empty strings are the "not applicable" signal,
 * and the assembler knows which fields each kind reads.
 */
const RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    edits: {
      type: Type.ARRAY,
      description: "One entry per atomic change. Split independent changes; never combine two.",
      items: {
        type: Type.OBJECT,
        properties: {
          kind: {
            type: Type.STRING,
            enum: [...EDIT_ATOM_KINDS],
            description: "Which of the eight atomic edits this is.",
          },
          targetId: {
            type: Type.STRING,
            description:
              "The exact id of the criterion or disqualifier being changed, copied from the ICP. For an addition, a new lower-kebab-case id, or \"\" to have one derived.",
          },
          label: {
            type: Type.STRING,
            description:
              "criterion_added only: human-readable label shown verbatim in the UI, e.g. 'Headcount 50-3,000'. \"\" otherwise.",
          },
          reason: {
            type: Type.STRING,
            description:
              "disqualifier_added only: why this excludes an account, shown verbatim when it fires. \"\" otherwise.",
          },
          field: {
            type: Type.STRING,
            enum: [...COMPANY_FIELDS],
            description: "Which company field an added criterion or disqualifier compares.",
          },
          operator: {
            type: Type.STRING,
            enum: [...OPERATORS],
            description:
              "The comparison, for operator_changed and for additions. Must suit the field's type.",
          },
          numbers: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description:
              "Numeric operands. One for gte/lte; exactly two for between ([min, max]); empty for text and list operators.",
          },
          strings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description:
              "Text operands, matching the ICP's exact casing. One for equals/not_equals; one or more for in/not_in/contains_any/contains_all; empty for numeric operators.",
          },
          weight: {
            type: Type.NUMBER,
            description:
              "weight_changed: the new weight. criterion_added: the weight to give it. 0 otherwise.",
          },
        },
        required: [
          "kind",
          "targetId",
          "label",
          "reason",
          "field",
          "operator",
          "numbers",
          "strings",
          "weight",
        ],
        propertyOrdering: [
          "kind",
          "targetId",
          "label",
          "reason",
          "field",
          "operator",
          "numbers",
          "strings",
          "weight",
        ],
      },
    },
  },
  required: ["edits"],
};

const SYSTEM_INSTRUCTION = `You translate an instruction about changing an Ideal Customer Profile into atomic edits. You do not evaluate the ICP, score anything, or decide whether a change is a good idea.

Rules:

- One entry per atomic change. If the instruction changes a criterion's weight AND its value, emit two entries — never one.
- If an operator change makes the existing value the wrong shape (a [min, max] range under "gte", a number under "contains_any"), emit BOTH an operator_changed and a value_changed entry for that criterion.
- targetId must be an id copied exactly from the ICP below. Never invent an id for something that already exists, and never guess at a criterion the instruction does not clearly point to.
- Do not restate current values. Only the new state is needed; the current state is read from the ICP.
- If the instruction asks for something that is not one of the eight kinds — reordering, renaming, "make it stricter overall" with no target — emit nothing for it rather than approximating.
- Emit nothing at all if the instruction names no concrete change.`;

function icpForPrompt(icp: IcpDefinition): string {
  const criteria = icp.criteria
    .map(
      (criterion) =>
        `  ${criterion.id} | ${criterion.label} | field=${criterion.field} | ${criterion.operator} ${JSON.stringify(criterion.value)} | weight=${criterion.weight}`,
    )
    .join("\n");
  const disqualifiers = icp.disqualifiers
    .map(
      (disqualifier) =>
        `  ${disqualifier.id} | ${disqualifier.reason} | field=${disqualifier.field} | ${disqualifier.operator} ${JSON.stringify(disqualifier.value)}`,
    )
    .join("\n");
  return `ICP: ${icp.name}\n\nCriteria (id | label | field | rule | weight):\n${criteria}\n\nDisqualifiers (id | reason | field | rule):\n${disqualifiers}`;
}

export async function parseEdits(prose: string, icp: IcpDefinition): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 501,
      error:
        "GEMINI_API_KEY is not set on the server, so describing an edit in prose is unavailable. Add edits in the ledger instead — the diff, the bands and both exports need no key.",
    };
  }

  const client = new GoogleGenAI({ apiKey });

  let response;
  try {
    response = await client.models.generateContent({
      model: MODEL,
      contents: `${icpForPrompt(icp)}\n\nInstruction:\n${prose}`,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // Constrained extraction against a fixed schema, not reasoning.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        temperature: 0,
      },
    });
  } catch (error) {
    console.error("parse-edits: the model call failed", error);
    return { ok: false, status: 502, error: "The model call failed. Add the edit in the ledger instead." };
  }

  const text = response.text;
  if (!text) {
    return { ok: false, status: 502, error: "The model returned nothing usable." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, error: "The model returned text that is not JSON." };
  }

  const entries =
    typeof payload === "object" && payload !== null && Array.isArray((payload as { edits?: unknown }).edits)
      ? ((payload as { edits: unknown[] }).edits as WireEdit[])
      : [];

  const { atoms, rejected } = assembleBatch(entries, icp);

  return {
    ok: true,
    atoms,
    rejected,
    descriptions: atoms.map(describeAtom),
    usage: {
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}
