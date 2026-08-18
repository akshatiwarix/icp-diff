/**
 * The trust boundary.
 *
 * Everything entering the engine from outside — the bundled corpus, two pasted
 * ICP definitions, Gemini's structured edit atoms — passes through here first.
 * Gemini's `responseSchema` constrains generation; this file is what decides
 * whether the result is allowed to reach `lib/diff`. A schema is a request, a
 * validator is a guarantee.
 *
 * The company, criterion and disqualifier schemas are Day 001's, unchanged,
 * because `lib/scoring/` is frozen and its types are the contract. What is new
 * here is `editAtomSchema` — the eight-atom union — and the semantic legality
 * check that a schema cannot express: an atom may be perfectly well-typed and
 * still refer to a criterion that does not exist.
 *
 * Unknown keys are stripped rather than rejected: an export with extra columns is
 * a normal input, not an attack. What is not tolerated is a known field holding
 * the wrong type.
 */

import { z } from "zod";

import {
  COMPANY_FIELDS,
  FUNDING_STAGES,
  OPERATORS,
  type Company,
  type Criterion,
  type Disqualifier,
  type IcpDefinition,
} from "@/lib/scoring";
import { atomId, type EditAtom, type Provenance } from "@/lib/diff/types";

const scalarValue = z.union([z.string(), z.number()]);
const numberValue = z.number().finite();

/** `[min, max]`, inclusive at both ends. Rejects a reversed range. */
const betweenValue = z
  .tuple([z.number().finite(), z.number().finite()])
  .refine(([min, max]) => min <= max, {
    message: "between expects [min, max] with min <= max",
  });

export const companySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  industry: z.string().min(1).nullable(),
  employee_count: z.number().int().nonnegative(),
  hq_country: z
    .string()
    .regex(/^[A-Z]{2}$/, "expected an ISO 3166-1 alpha-2 code, e.g. US")
    .nullable(),
  annual_revenue_usd: z.number().nonnegative().nullable(),
  funding_stage: z.enum(FUNDING_STAGES),
  tech_stack: z.array(z.string()),
  hiring_signals: z.array(z.string()),
  founded_year: z.number().int().min(1800).max(2100).nullable(),
});

export const companiesSchema = z.array(companySchema);

const companyField = z.enum(COMPANY_FIELDS);
const operator = z.enum(OPERATORS);

/**
 * The nine operator/value pairings, shared by criteria and disqualifiers.
 *
 * A discriminated union on `operator` is what makes the value type enforceable:
 * `gte` with a string, or `between` with a bare number, fails validation instead
 * of reaching an operator that would silently return false.
 */
function ruleVariants<Extra extends z.ZodRawShape>(extra: Extra) {
  return [
    z.object({ ...extra, operator: z.literal("equals"), value: scalarValue }),
    z.object({ ...extra, operator: z.literal("not_equals"), value: scalarValue }),
    z.object({ ...extra, operator: z.literal("in"), value: z.array(scalarValue) }),
    z.object({ ...extra, operator: z.literal("not_in"), value: z.array(scalarValue) }),
    z.object({ ...extra, operator: z.literal("gte"), value: numberValue }),
    z.object({ ...extra, operator: z.literal("lte"), value: numberValue }),
    z.object({ ...extra, operator: z.literal("between"), value: betweenValue }),
    z.object({ ...extra, operator: z.literal("contains_any"), value: z.array(z.string()) }),
    z.object({ ...extra, operator: z.literal("contains_all"), value: z.array(z.string()) }),
  ] as const;
}

export const criterionSchema = z.discriminatedUnion(
  "operator",
  ruleVariants({
    id: z.string().min(1),
    label: z.string().min(1),
    field: companyField,
    weight: z.number().finite().nonnegative(),
  }),
);

export const disqualifierSchema = z.discriminatedUnion(
  "operator",
  ruleVariants({
    id: z.string().min(1),
    field: companyField,
    reason: z.string().min(1),
  }),
);

export const icpDefinitionSchema = z.object({
  name: z.string().min(1),
  criteria: z.array(criterionSchema),
  disqualifiers: z.array(disqualifierSchema),
});

/** Any value a rule can carry — the shape a `from`/`to` field holds. */
const ruleValue = z.union([scalarValue, z.array(scalarValue), betweenValue]);

/**
 * The eight edit atoms.
 *
 * `from` is carried on every change atom even though `applyEdits` never reads it.
 * It is what lets the ledger render "weight changed from 3 to 9" without
 * re-deriving the old value, and it is checked against ICP A by
 * `checkAtomLegality` — an atom claiming a `from` that A does not hold is a sign
 * the edit list was authored against a different parent, which is exactly the
 * case where confident attribution would be fiction.
 */
export const editAtomSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("criterion_added"),
    criterionId: z.string().min(1),
    criterion: criterionSchema,
  }),
  z.object({ kind: z.literal("criterion_removed"), criterionId: z.string().min(1) }),
  z.object({
    kind: z.literal("weight_changed"),
    criterionId: z.string().min(1),
    from: z.number().finite().nonnegative(),
    to: z.number().finite().nonnegative(),
  }),
  z.object({
    kind: z.literal("value_changed"),
    criterionId: z.string().min(1),
    from: ruleValue,
    to: ruleValue,
  }),
  z.object({
    kind: z.literal("operator_changed"),
    criterionId: z.string().min(1),
    from: operator,
    to: operator,
  }),
  z.object({
    kind: z.literal("disqualifier_added"),
    disqualifierId: z.string().min(1),
    disqualifier: disqualifierSchema,
  }),
  z.object({ kind: z.literal("disqualifier_removed"), disqualifierId: z.string().min(1) }),
  z.object({
    kind: z.literal("disqualifier_value_changed"),
    disqualifierId: z.string().min(1),
    from: ruleValue,
    to: ruleValue,
  }),
]);

export const editAtomsSchema = z.array(editAtomSchema);

export const provenanceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("derived"),
    parentIcpName: z.string().min(1),
    edits: editAtomsSchema,
  }),
  z.object({ kind: z.literal("none") }),
]);

export const modeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("threshold"), threshold: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("top_n"), topN: z.number().int().min(1) }),
]);

/** The request body of `POST /api/diff`. */
export const diffRequestSchema = z.object({
  icpA: icpDefinitionSchema,
  icpB: icpDefinitionSchema,
  provenance: provenanceSchema.default({ kind: "none" }),
  mode: modeSchema.default({ kind: "threshold", threshold: 55 }),
  companies: companiesSchema.optional(),
});

export type DiffRequest = z.infer<typeof diffRequestSchema>;

/** The request body of `POST /api/parse-edits`. */
export const parseEditsRequestSchema = z.object({
  icp: icpDefinitionSchema,
  prose: z.string().min(1).max(2000),
});

export type ParseEditsRequest = z.infer<typeof parseEditsRequestSchema>;

/* ───────────────────────── semantic legality ───────────────────────── */

export type AtomRejection = { atom: unknown; reason: string };

/**
 * Checks a schema cannot express: does this atom make sense *against this ICP*?
 *
 * A well-typed `weight_changed` on a criterion that does not exist, a
 * `criterion_added` whose id collides with an existing one, a `from` that
 * disagrees with what A actually holds — all of these pass `editAtomSchema` and
 * all of them are wrong. They are reported one by one so the user sees which
 * instruction could not be honoured, rather than a silently shorter list.
 */
export function checkAtomLegality(atom: EditAtom, icp: IcpDefinition): string | null {
  const criteria = new Map(icp.criteria.map((criterion) => [criterion.id, criterion]));
  const disqualifiers = new Map(icp.disqualifiers.map((d) => [d.id, d]));

  switch (atom.kind) {
    case "criterion_added":
      if (criteria.has(atom.criterionId)) {
        return `criterion "${atom.criterionId}" already exists in ${icp.name}`;
      }
      if (atom.criterion.id !== atom.criterionId) {
        return `criterion_added id "${atom.criterionId}" disagrees with its payload id "${atom.criterion.id}"`;
      }
      return null;

    case "criterion_removed":
    case "weight_changed":
    case "value_changed":
    case "operator_changed": {
      const criterion = criteria.get(atom.criterionId);
      if (!criterion) return `no criterion "${atom.criterionId}" in ${icp.name}`;
      if (atom.kind === "weight_changed") {
        if (criterion.weight !== atom.from) {
          return `weight on "${atom.criterionId}" is ${criterion.weight}, not ${atom.from}`;
        }
        if (criterion.weight === atom.to) return `weight on "${atom.criterionId}" is already ${atom.to}`;
      }
      if (atom.kind === "operator_changed") {
        if (criterion.operator !== atom.from) {
          return `operator on "${atom.criterionId}" is ${criterion.operator}, not ${atom.from}`;
        }
        if (criterion.operator === atom.to) {
          return `operator on "${atom.criterionId}" is already ${atom.to}`;
        }
      }
      if (atom.kind === "value_changed") {
        if (JSON.stringify(criterion.value) !== JSON.stringify(atom.from)) {
          return `value on "${atom.criterionId}" is ${JSON.stringify(criterion.value)}, not ${JSON.stringify(atom.from)}`;
        }
        if (JSON.stringify(criterion.value) === JSON.stringify(atom.to)) {
          return `value on "${atom.criterionId}" is already ${JSON.stringify(atom.to)}`;
        }
      }
      return null;
    }

    case "disqualifier_added":
      if (disqualifiers.has(atom.disqualifierId)) {
        return `disqualifier "${atom.disqualifierId}" already exists in ${icp.name}`;
      }
      if (atom.disqualifier.id !== atom.disqualifierId) {
        return `disqualifier_added id "${atom.disqualifierId}" disagrees with its payload id "${atom.disqualifier.id}"`;
      }
      return null;

    case "disqualifier_removed":
    case "disqualifier_value_changed": {
      const disqualifier = disqualifiers.get(atom.disqualifierId);
      if (!disqualifier) return `no disqualifier "${atom.disqualifierId}" in ${icp.name}`;
      if (atom.kind === "disqualifier_value_changed") {
        if (JSON.stringify(disqualifier.value) !== JSON.stringify(atom.from)) {
          return `value on "${atom.disqualifierId}" is ${JSON.stringify(disqualifier.value)}, not ${JSON.stringify(atom.from)}`;
        }
      }
      return null;
    }
  }
}

/** Split a batch of atoms into the legal ones and a reason per rejection. */
export function partitionAtoms(
  atoms: EditAtom[],
  icp: IcpDefinition,
): { accepted: EditAtom[]; rejected: AtomRejection[] } {
  const accepted: EditAtom[] = [];
  const rejected: AtomRejection[] = [];
  const seen = new Set<string>();

  for (const atom of atoms) {
    const id = atomId(atom);
    if (seen.has(id)) {
      rejected.push({ atom, reason: `duplicate edit — ${id} appears twice` });
      continue;
    }
    const problem = checkAtomLegality(atom, icp);
    if (problem) {
      rejected.push({ atom, reason: problem });
      continue;
    }
    seen.add(id);
    accepted.push(atom);
  }

  return { accepted, rejected };
}

/**
 * Zod issues flattened for display.
 *
 * The API returns these to the browser and the paste panel renders them, so a
 * rejected input tells the user which field was wrong rather than just "400".
 */
export function formatIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

/**
 * Compile-time drift guard.
 *
 * `lib/scoring/types.ts` and `lib/diff/types.ts` own the hand-written types and
 * import no Zod, so the two definitions could drift apart silently. These
 * assertions fail the typecheck if they ever do. Mutual assignability rather than
 * strict identity, because `Rule & Base` and Zod's union-of-objects are
 * equivalent in every way that matters but not literally the same type
 * expression.
 */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
function assertSchemaMatchesType<T extends true>(_evidence?: T): void {}

assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof companySchema>, Company>>();
assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof criterionSchema>, Criterion>>();
assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof disqualifierSchema>, Disqualifier>>();
assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof icpDefinitionSchema>, IcpDefinition>>();
assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof editAtomSchema>, EditAtom>>();
assertSchemaMatchesType<MutuallyAssignable<z.infer<typeof provenanceSchema>, Provenance>>();
