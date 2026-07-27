// src/lib/contracts.ts
// Client-safe leaf module: the app's static contracts (event names, doc registry
// schema, unified registry-validation helper). NO fs/path imports — those live in
// src/lib/paths.ts (server-only) so client components can import this file safely.
// Importing from doc-store / dependency-graph / docs-parser is FORBIDDEN (import-cycle).
import { z } from "zod";

// ---------- doc registry schemas ----------
// Entry-level schema (replaces docs-parser.ts:65-75 startsWith heuristics).
export const DocMeta = z.object({
  file: z.string().min(1),
  type: z.enum(["part", "appendix", "map", "unlisted"]),
  order: z.number().int().min(0),
  title: z.string().min(1),
});
export type DocMetaEntry = z.infer<typeof DocMeta>;

// §12.5: top-level registry schema — makes `schemaVersion` load-bearing.
export const DocRegistry = z.object({
  schemaVersion: z.literal("1.0.0"),
  docs: z.array(DocMeta),
});
export type DocRegistryFile = z.infer<typeof DocRegistry>;

// ---------- event registry (replaces 7 scattered string literals) ----------
export const EVT = {
  DocJump: "doc:jump",
  DocJumpTo: "doc:jumpto",
  DocJumpToOccurrence: "doc:jumpto-occurrence",
  GraphSynced: "graph:synced",
  GraphOpenAtNode: "graph:open-at-node",
  AnnotationClicked: "annotation-clicked",
  AnnotationsUpdated: "annotations-updated",
} as const;
export type EventName = (typeof EVT)[keyof typeof EVT];

// Payload contracts ONLY for the 3 cross-module events (intra-module events stay untyped).
export const CROSS_MODULE_PAYLOADS = {
  [EVT.GraphSynced]: z.object({ generatedAt: z.string() }),
  [EVT.GraphOpenAtNode]: z.object({ id: z.string() }),
  [EVT.DocJumpToOccurrence]: z.object({
    id: z.string(),
    occurrenceIndex: z.number().int().min(0),
  }),
} as const;

// ---------- §12.4 tiered dispatch ----------
// Fire-and-forget. Validates payload, dispatches, logs errors via console.error.
// DEFAULT for all call sites. Caller explicitly opts out of failure-handling.
// Raw `window.dispatchEvent(new CustomEvent(...))` outside this file is banned (T7 eslint).
export function dispatchDocEvent(name: EventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  const schema = (
    CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined
  )?.[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      console.error(
        `[contracts] rejected payload for ${name}`,
        parsed.error.issues
      );
      return;
    }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// Checked variant. Same logic, returns boolean. OPT-IN, rare.
// Use ONLY where silent dispatch failure would visibly break the caller.
// If you call this, you MUST handle false. If you don't handle false,
// use dispatchDocEvent instead.
export function dispatchDocEventChecked(
  name: EventName,
  detail?: unknown
): boolean {
  if (typeof window === "undefined") return false;
  const schema = (
    CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined
  )?.[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      console.error(
        `[contracts] rejected payload for ${name}`,
        parsed.error.issues
      );
      return false;
    }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return true;
}

// ---------- §12.7 unified registry validation ----------
// One result contract for "validate a declarative registry (YAML) whose entries
// must reference real things, with a warning path". Consumed by T3, T4, T8a.
// Pure (no fs) — client-safe.
export interface RegistryResult<T> {
  entries: T[]; // successfully-validated entries (may be partial if warnings exist)
  warnings: string[]; // never-throw: every recoverable problem lands here
  ok: boolean; // warnings.length === 0
}

export function validateRegistry<T>(opts: {
  schema: z.ZodType<T>; // entry-level schema
  raw: unknown; // parsed YAML (already yamlLoad'd)
  listKey: string; // e.g. "docs", "nodes"
  referenceCheck?: (entry: T) => string | null; // returns a warning string if the ref is bad, else null
}): RegistryResult<T> {
  const warnings: string[] = [];
  const entries: T[] = [];
  if (
    typeof opts.raw !== "object" ||
    opts.raw === null ||
    !Array.isArray(
      (opts.raw as Record<string, unknown>)[opts.listKey]
    )
  ) {
    return {
      entries,
      warnings: [`${opts.listKey} missing or not an array`],
      ok: false,
    };
  }
  for (const item of (opts.raw as Record<string, unknown[]>)[opts.listKey]) {
    const r = opts.schema.safeParse(item);
    if (!r.success) {
      warnings.push(
        `bad entry ${JSON.stringify(item)}: ${r.error.issues
          .map((i) => i.message)
          .join("; ")}`
      );
      continue;
    }
    const refWarn = opts.referenceCheck?.(r.data) ?? null;
    if (refWarn) warnings.push(refWarn);
    entries.push(r.data);
  }
  return { entries, warnings, ok: warnings.length === 0 };
}

// exactCaseFileExists moved to src/lib/paths.ts (uses readdirSync — server-only).
