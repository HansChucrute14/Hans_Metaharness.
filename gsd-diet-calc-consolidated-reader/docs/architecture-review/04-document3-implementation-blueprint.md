# Document 3 — Deterministic A2A Implementation Blueprint

> **Format**: pure Agent-to-Agent (A2A). Minimal prose. Zero conversational
> preamble. Exact `file:line` ranges. Explicit type signatures. Unambiguous
> step-by-step. **No decisions left to the execution agent.**
> **Source of truth**: `01-research.md` (with §1.7 + §1.8 amendments) +
> `02-document1-systemic-review.md` (with §2.9 amendments) +
> `03-document2-adversarial-dialectic.md` (Union verdicts).
> **Execution order**: T1 → T2 → T3 → T4 → T5 → T6 → T7. T3a/T3b parallel-safe.
> T5 independent. T6 last (multi-PR).

---

## 0. Pre-implementation verification (agent MUST confirm before T1)

```
CHECK  repo-root: /home/z/my-project exists
CHECK  src/lib/docs-parser.ts:5        == 'const DOCS_DIR = "/home/z/my-project/consolidated-docs";'
CHECK  src/lib/dependency-graph.ts:31  == 'const BUG_MAP_PATH = "/home/z/my-project/consolidated-docs/BUG-DEPENDENCY-MAP.md";'
CHECK  src/lib/doc-store.ts:321        contains 'new CustomEvent("graph:synced"'
CHECK  src/lib/dependency-graph.ts:114 == '  schemaVersion: z.literal("1.0.0"),'
CHECK  src/lib/bug-facts.ts:16         contains 'export const BUG_FACTS'
CHECK  dev server: port 3000 reachable, / renders DocReader, 0 fatal errors in dev.log
ABORT   if any CHECK fails — repository has drifted from audited state; re-run Phase 1.
```

---

## T1 — Create `src/lib/contracts.ts` (leaf module)

**Target**: NEW file `src/lib/contracts.ts`.
**Depends on**: nothing.
**Backward-compat**: pure addition; no existing import changes yet (T2 wires them).

> ⚠️ **AMENDED by §12** (cross-cutting recheck — RESOLVED; apply before execution):
> - §12.3 — `getDocsDir()` MUST read `process.env.DOCS_DIR` first (env-var override).
> - §12.4 — RESOLVED: tiered dispatch. Add TWO functions: `dispatchDocEvent` (void, default) + `dispatchDocEventChecked` (boolean, opt-in). Wire `graph:synced` site with checked variant. See §12.4 for full contract.
> - §12.7 — add `validateRegistry<T>()` + `RegistryResult<T>` here (consumed by T3, T4, T8a).
> - §12.5 — add top-level `DocRegistry` schema (with `schemaVersion: z.literal("1.0.0")`) here, consumed by T3.2.

### T1.1 File contract

```
PATH     src/lib/contracts.ts
IMPORTS  only: "zod", "path", "fs" (existsSync). NO imports from doc-store / dependency-graph / docs-parser.
EXPORTS  EVT, EventName, CROSS_MODULE_PAYLOADS, dispatchDocEvent,
         getDocsDir, getBugMapPath, resolveDocPath,
         DocMeta, DocMetaEntry
LINES    target ≤ 85
```

### T1.2 Exact content (type signatures are normative)

```ts
// src/lib/contracts.ts
// Leaf module: the app's static contracts (paths, event names, doc registry schema).
// Importing from doc-store / dependency-graph / docs-parser is FORBIDDEN (import-cycle).
import { z } from "zod";
import path from "path";
import { existsSync } from "fs";

// ---------- path resolution (replaces docs-parser.ts:5 + dependency-graph.ts:31) ----------
let _docsDir: string | null = null;
export function getDocsDir(): string {
  if (_docsDir) return _docsDir;
  const dir = path.resolve(process.cwd(), "consolidated-docs");
  if (!existsSync(dir)) {
    throw new Error(
      `contracts: DOCS_DIR missing at ${dir} (cwd=${process.cwd()}). Run from repo root.`
    );
  }
  _docsDir = dir;
  return dir;
}
export function getBugMapPath(): string {
  return path.resolve(getDocsDir(), "BUG-DEPENDENCY-MAP.md");
}
export function resolveDocPath(fileName: string): string {
  return path.resolve(getDocsDir(), fileName);
}

// ---------- doc registry schema (replaces docs-parser.ts:65-75 startsWith heuristics) ----------
export const DocMeta = z.object({
  file: z.string().min(1),
  type: z.enum(["part", "appendix", "map", "unlisted"]),
  order: z.number().int().min(0),
  title: z.string().min(1),
});
export type DocMetaEntry = z.infer<typeof DocMeta>;

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

// Single dispatch path. Returns false (never throws) on malformed payload.
// Raw `window.dispatchEvent(new CustomEvent(...))` outside this file is banned (T7 eslint).
export function dispatchDocEvent(name: EventName, detail?: unknown): boolean {
  if (typeof window === "undefined") return false;
  const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined)?.[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      console.error(`[contracts] rejected payload for ${name}`, parsed.error.issues);
      return false;
    }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return true;
}
```

### T1.3 Verification

```
RUN   bun run lint            EXPECT 0 errors 0 warnings
RUN   bun run dev (background)
FETCH GET http://localhost:3000/   EXPECT 200, DocReader renders
```

---

## T2 — Wire existing modules to `contracts.ts`

**Target**: `src/lib/docs-parser.ts`, `src/lib/dependency-graph.ts`, `src/lib/doc-store.ts`, `src/components/docs/markdown-renderer.tsx`.
**Depends on**: T1.
**Backward-compat**: export signatures unchanged; only internal path resolution + dispatch call sites change.

### T2.1 `src/lib/docs-parser.ts`

```
LINE 5     DELETE: const DOCS_DIR = "/home/z/my-project/consolidated-docs";
LINE 5     INSERT: import { getDocsDir } from "@/lib/contracts";
            (place with other imports at top of file)
ALL REFERENCES to DOCS_DIR  →  getDocsDir()
            (search: DOCS_DIR; replace each read-site with getDocsDir())
DO NOT touch lines 65-75 (startsWith heuristics) — T3 replaces them.
```

### T2.2 `src/lib/dependency-graph.ts`

```
LINE 31     DELETE: const BUG_MAP_PATH = "/home/z/my-project/consolidated-docs/BUG-DEPENDENCY-MAP.md";
LINE 31     INSERT: import { getBugMapPath } from "@/lib/contracts";
              (place with other imports at top of file)
LINE 460    readFileSync(BUG_MAP_PATH, "utf-8")  →  readFileSync(getBugMapPath(), "utf-8")
LINE 496    readFileSync(BUG_MAP_PATH, "utf-8")  →  readFileSync(getBugMapPath(), "utf-8")
EXPORT `parseDependencyGraph` alias (line 487) UNCHANGED.
```

### T2.3 `src/lib/doc-store.ts`

```
TOP IMPORTS  INSERT: import { EVT, dispatchDocEvent } from "@/lib/contracts";
LINE 64-67   signalDocJump():   window.dispatchEvent(new CustomEvent("doc:jump"))  →  dispatchDocEvent(EVT.DocJump)
LINE 76-79   signalDocJumpTo(): window.dispatchEvent(new CustomEvent("doc:jumpto", { detail: { sectionId } }))
               →  dispatchDocEvent(EVT.DocJumpTo, { sectionId })   // note: DocJumpTo NOT in CROSS_MODULE_PAYLOADS → no validation, raw passthrough
LINE 92-97   signalDocJumpToOccurrence(): window.dispatchEvent(new CustomEvent("doc:jumpto-occurrence", { detail: { id, occurrenceIndex } }))
               →  dispatchDocEvent(EVT.DocJumpToOccurrence, { id, occurrenceIndex })   // IS in CROSS_MODULE_PAYLOADS → validated
LINE 319-325 syncDependencyGraph success branch:
               window.dispatchEvent(new CustomEvent("graph:synced", { detail: { generatedAt: body.generatedAt } }))
               →  dispatchDocEvent(EVT.GraphSynced, { generatedAt: body.generatedAt })
```

### T2.4 `src/components/docs/markdown-renderer.tsx`

```
LINE 377-378  window.dispatchEvent(new CustomEvent("graph:open-at-node", { detail: { id } }))
              →  dispatchDocEvent(EVT.GraphOpenAtNode, { id })
TOP IMPORTS   INSERT: import { EVT, dispatchDocEvent } from "@/lib/contracts";
```

### T2.5 Verification

```
RUN   bun run lint            EXPECT 0 errors 0 warnings
GREP  "new CustomEvent\(" src/   EXPECT matches only inside src/lib/contracts.ts  (T7 enforces via eslint)
FETCH GET /api/dependency-graph  EXPECT 200, nodes/edges present
FETCH GET /api/docs              EXPECT 200, files[] present
BROWSER open / → click a B7 id-link → EXPECT occurrence highlight still fires (doc:jumpto-occurrence path)
BROWSER open dependency-graph dialog → click "Sync graph from source" → EXPECT graph:synced fires, dialog re-fetches
```

---

## T3 — `INDEX.yml` doc registry + never-throw parser

**Target**: NEW `consolidated-docs/INDEX.yml`, `src/lib/docs-parser.ts` (rewrite registry loader).
**Depends on**: T1, T2.
**Backward-compat**: `/api/docs` response shape EXTENDED with optional `warnings: string[]`; existing `files[]` shape unchanged.

> ⚠️ **AMENDED by §12** (cross-cutting recheck — apply before execution):
> - §12.5 — `schemaVersion` MUST be validated via the top-level `DocRegistry` schema (currently declared at T3.1 line 210 but never read — dead field). Add an exact-case `readdirSync` comparison; `existsSync` alone is case-insensitive on macOS.
> - §12.7 — `loadDocRegistry()` MUST consume `validateRegistry<T>()` from `contracts.ts` (unifies result shape with T4 + T8a).

### T3.1 Create `consolidated-docs/INDEX.yml`

```yaml
# Doc registry — consumed by src/lib/docs-parser.ts loadDocRegistry().
# Every .md in consolidated-docs/ SHOULD be listed here.
# Unlisted .md files are auto-discovered ONLY when DOCS_DEV_MODE=1 (dev aid, never prod).
schemaVersion: "1.0.0"
docs:
  - file: PART-1-Diagnosis-Findings-and-As-Built-Reality.md
    type: part
    order: 1
    title: "Diagnosis, Findings, and As-Built Reality"
  - file: PART-2-The-Fix-Remediation-Plan-and-Roadmap.md
    type: part
    order: 2
    title: "The Fix — Remediation Plan and Roadmap"
  - file: PART-3-Synthesis-Unified-Verified-Project-Map.md
    type: part
    order: 3
    title: "Synthesis — Unified Verified Project Map"
  - file: PART-4-Meta-Critique-of-the-Documents.md
    type: part
    order: 4
    title: "Meta-Critique of the Documents"
  - file: APPENDIX-SAFETY-PROCESS.md
    type: appendix
    order: 10
    title: "Appendix — Safety Process"
  - file: APPENDIX-VERIFICATION-LOG.md
    type: appendix
    order: 11
    title: "Appendix — Verification Log"
  - file: APPENDIX-GLOSSARY.md
    type: appendix
    order: 12
    title: "Appendix — Glossary"
  - file: APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md
    type: appendix
    order: 13
    title: "Appendix — Public Health and Regulatory"
  - file: APPENDIX-ID-KEY.md
    type: appendix
    order: 14
    title: "Appendix — ID Key"
  - file: BUG-DEPENDENCY-MAP.md
    type: map
    order: 20
    title: "Bug Dependency Map"
```

**Agent MUST verify** the 10 `file:` values match actual filenames in `consolidated-docs/` (case-sensitive) before proceeding. Run `ls consolidated-docs/`.

### T3.2 Rewrite registry loader in `src/lib/docs-parser.ts`

**Replace lines 65-75** (the `docType` + `docOrder` functions) with a single `loadDocRegistry()` that:

```ts
// src/lib/docs-parser.ts — replace the startsWith-based classification
import { DocMeta, type DocMetaEntry, getDocsDir, resolveDocPath } from "@/lib/contracts";
import { readFileSync, readdirSync, existsSync } from "fs";
import { load as yamlLoad } from "js-yaml";

interface RegistryResult {
  entries: DocMetaEntry[];
  warnings: string[];
}

export function loadDocRegistry(): RegistryResult {
  const indexPath = resolveDocPath("INDEX.yml");
  const warnings: string[] = [];
  const entries: DocMetaEntry[] = [];

  // INDEX.yml unreadable → fall back to legacy startsWith scan (never throw).
  if (!existsSync(indexPath)) {
    warnings.push("INDEX.yml missing — falling back to filename heuristics. Add INDEX.yml.");
    return { entries: legacyScan(), warnings };
  }
  let parsed: { docs?: unknown[] };
  try {
    parsed = yamlLoad(readFileSync(indexPath, "utf-8")) as { docs?: unknown[] };
  } catch (e) {
    warnings.push(`INDEX.yml YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
    return { entries: legacyScan(), warnings };
  }
  if (!Array.isArray(parsed.docs)) {
    warnings.push("INDEX.yml has no 'docs' array");
    return { entries: legacyScan(), warnings };
  }

  for (const d of parsed.docs) {
    const r = DocMeta.safeParse(d);
    if (r.success) {
      // validate the referenced file exists
      if (!existsSync(resolveDocPath(r.data.file))) {
        warnings.push(`INDEX.yml references missing file: ${r.data.file}`);
      } else {
        entries.push(r.data);
      }
    } else {
      warnings.push(`INDEX.yml bad entry ${JSON.stringify(d)}: ${r.error.issues.map(i => i.message).join("; ")}`);
    }
  }

  // auto-discover unlisted .md files ONLY in explicit dev mode
  if (process.env.DOCS_DEV_MODE === "1") {
    const listed = new Set(entries.map((e) => e.file));
    for (const f of readdirSync(getDocsDir()).filter((f) => f.endsWith(".md") && f !== "INDEX.yml") ) {
      if (!listed.has(f)) {
        warnings.push(`unlisted .md auto-discovered (dev mode): ${f} — add to INDEX.yml`);
        entries.push({ file: f, type: "unlisted", order: 999, title: f.replace(/\.md$/, "") });
      }
    }
  }

  entries.sort((a, b) => a.order - b.order);
  return { entries, warnings };
}

// legacyScan() = the OLD startsWith logic, preserved verbatim as fallback.
// (move lines 65-75 bodies into this function unchanged)
function legacyScan(): DocMetaEntry[] { /* ...verbatim move of old logic, returns DocMetaEntry[]... */ }
```

### T3.3 Wire `/api/docs` route to surface warnings

```
FILE  src/app/api/docs/route.ts
      The list endpoint currently returns { files, ids, glossary }.
      EXTEND response to { files, ids, glossary, warnings }.
      `warnings` is string[] (may be empty). Frontend renders as dismissible amber banner (T3.4).
      Single-file endpoint (?slug=) unchanged (no warnings field there).
```

### T3.4 `src/components/docs/doc-sidebar.tsx` warnings banner

```
FILE  src/components/docs/doc-sidebar.tsx
      subscribe to warnings from the /api/docs response (extend the existing fetch consumer).
      if warnings.length > 0: render a dismissible amber Alert at top of sidebar.
      text: "Doc registry warnings (N): <first warning>" + expandable list.
      dismissal is session-only (useState, NOT persisted).
```

### T3.5 Verification

```
RUN   DOCS_DEV_MODE=1 bun run dev
FETCH GET /api/docs  EXPECT 200, { files: [10 entries], warnings: [] }   (INDEX.yml is complete)
BROWSER open / → sidebar renders 10 docs, NO amber banner
BREAK TEST: rename INDEX.yml → INDEX.yml.bak, FETCH GET /api/docs → EXPECT warnings: ["INDEX.yml missing..."], files: [10 from legacyScan]
RESTORE INDEX.yml
BREAK TEST: set one INDEX.yml entry order: "bad" (string) → FETCH GET /api/docs → EXPECT warnings includes "bad entry", files still 10 (bad entry skipped)
RESTORE INDEX.yml
RUN   bun run lint   EXPECT 0 errors
```

---

## T4 — `POST` + `GET /api/dependency-graph/validate` (dry-run, two verbs)

**Target**: NEW `src/app/api/dependency-graph/validate/route.ts`.
**Depends on**: T1, T2.
**Backward-compat**: pure addition. Existing `/api/dependency-graph` and `/sync` routes untouched.

### T4.1 File contract

```
PATH     src/app/api/dependency-graph/validate/route.ts
EXPORTS  POST, GET
IMPORTS  NextResponse; { parseGraphSource, GraphValidationError, extractGraphDataBlock } from "@/lib/dependency-graph";
         { getBugMapPath } from "@/lib/contracts"; { rateLimit } from "@/lib/api-utils";
         { readFileSync } from "fs";
DYNAMIC  export const dynamic = "force-dynamic";
```

### T4.2 POST handler (validates a proposed YAML body)

```ts
// src/app/api/dependency-graph/validate/route.ts
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 256 * 1024; // 256KB cap (Persona B Attack 2)

export async function POST(request: Request) {
  if (!rateLimit(request, 20)) {
    return NextResponse.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  // Read raw text, cap size BEFORE parsing JSON (Persona B Attack 1+2).
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: `body exceeds ${MAX_BODY_BYTES} bytes` },
      { status: 413 }
    );
  }
  let body: unknown;
  try {
    body = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 }
    );
  }
  if (typeof (body as { yaml?: unknown })?.yaml !== "string") {
    return NextResponse.json(
      { ok: false, error: "body must be { yaml: string }" },
      { status: 400 }
    );
  }
  const yamlText = (body as { yaml: string }).yaml;
  try {
    const parsed = parseGraphSource(yamlText); // pure — no cache mutation
    return NextResponse.json({
      ok: true,
      nodeCount: parsed.nodes.length,
      edgeCount: parsed.edges.length,
      schemaVersion: parsed.schemaVersion,
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json(
        { ok: false, issues: e.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

### T4.3 GET handler (re-validates the on-disk file)

```ts
export async function GET(request: Request) {
  if (!rateLimit(request, 20)) {
    return NextResponse.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  try {
    const raw = readFileSync(getBugMapPath(), "utf-8");
    const yamlText = extractGraphDataBlock(raw);
    const parsed = parseGraphSource(yamlText);
    return NextResponse.json({
      ok: true,
      nodeCount: parsed.nodes.length,
      edgeCount: parsed.edges.length,
      schemaVersion: parsed.schemaVersion,
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json(
        { ok: false, issues: e.issues },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

**No `source` field in either response.** The verb IS the source (Decision 5 Z).

### T4.4 Verification

```
FETCH GET  /api/dependency-graph/validate          EXPECT 200, { ok:true, nodeCount:N, edgeCount:M, schemaVersion:"1.0.0" }
FETCH POST /api/dependency-graph/validate  body:{ yaml: "<valid yaml>" }   EXPECT 200, same shape
FETCH POST /api/dependency-graph/validate  body:{ yaml: "schemaVersion: \"9.9.9\"\nlanes: []\nnodes: []\nedges: []" }
        EXPECT 422, { ok:false, issues:[{path:"schemaVersion", message:"..."}] }
FETCH POST /api/dependency-graph/validate  body:{}                                  EXPECT 400 { error:"body must be { yaml: string }" }
FETCH POST /api/dependency-graph/validate  body:"not json"                           EXPECT 400 { error:"invalid JSON body" }
FETCH POST /api/dependency-graph/validate  body: "x".repeat(300_000) wrapped {yaml:...}  EXPECT 413
FETCH POST /api/dependency-graph/validate  (no body)                                 EXPECT 400
RUN   bun run lint   EXPECT 0 errors
```

---

## T5 — Schema-migration pattern: COMMENT-ONLY (no code)

**Target**: `src/lib/dependency-graph.ts` line 113-118.
**Depends on**: nothing.
**Backward-compat**: no behavior change. Comment only.

### T5.1 Insert documentation comment above `graphSourceSchema`

```
FILE  src/lib/dependency-graph.ts
INSERT (above line 113, the `const graphSourceSchema = z.object({` declaration):

/**
 * SCHEMA VERSIONING & MIGRATION PATTERN
 * --------------------------------------
 * Today: schemaVersion is z.literal("1.0.0"). A block declaring any other
 * version hard-fails (correct — we can't silently misread).
 *
 * When a v1.1.0 is needed, follow this pattern (do NOT pre-scaffold — YAGNI):
 *
 *   1. Define v1_1_0 = v1_0_0.extend({ schemaVersion: z.literal("1.1.0"), ...newFields }).
 *   2. Define a TYPED migrator map:
 *        const MIGRATORS = {
 *          "1.0.0": {
 *            from: v1_0_0, to: v1_1_0,
 *            fn: (s: z.infer<typeof v1_0_0>): z.infer<typeof v1_1_0> => ({ ...s, schemaVersion: "1.1.0", ... })
 *          },
 *        } as const;
 *   3. migrate(source): walk MIGRATORS chain. Guard with MAX_MIGRATIONS=10 to
 *      prevent infinite loops if a migrator forgets to bump schemaVersion.
 *   4. Bump CURRENT_SCHEMA_VERSION. parseGraphSource() calls migrate() before
 *      the final v1_1_0 parse.
 *   5. Fail-closed: on migration error, throw GraphValidationError; cache
 *      untouched (same contract as reparseDependencyGraphNow at line 495).
 *
 * The migrator map is TYPED (z.infer in/out) — no `any`. An unused scaffold
 * today would be dead code; this comment is the scaffold.
 */
```

### T5.2 Verification

```
RUN   bun run lint   EXPECT 0 errors (comment-only, no AST change)
FETCH GET /api/dependency-graph  EXPECT unchanged behavior
```

---

## T6 — Monolith split: Phase A + B (ungated), Phase C (feature-flagged)

**Target**: `src/components/docs/dependency-graph.tsx` + NEW child components.
**Depends on**: T2 (for `EVT`/`dispatchDocEvent`).
**Backward-compat**: orchestrator export unchanged; visual behaviour identical.

**ORDER**: T6a (Phase A) → T6b (Phase B) → T6c (Phase C, flagged). Each ships independently.

### T6a — Phase A: extract `GraphLegend` (store-backed)

```
NEW FILE  src/components/docs/graph/graph-legend.tsx
          Move the legend JSX (locate via grep "legend" in dependency-graph.tsx; ~80 lines).
          Component reads `lanes` from props AND `graphSyncStatus` from useDocStore directly
          (NOT stateless — Decision 3 Persona B Attack 3 correction).
          Props: { lanes: Lane[] }.
          Signature: export function GraphLegend({ lanes }: { lanes: Lane[] }): JSX.Element
FILE       src/components/docs/dependency-graph.tsx
           Replace inline legend JSX with <GraphLegend lanes={lanes} />.
           Keep the import of Lane type from "@/lib/dependency-graph".
VERIFY     visual diff = none (screenshot before/after via agent-browser).
```

### T6b — Phase B: extract `GraphToolbar` (own state + store)

```
NEW FILE  src/components/docs/graph/graph-toolbar.tsx
          Move lines ~3304-3343 (the "Sync graph from source" button JSX) + the
          sync handler at ~2259-2290 + the layout-toggle + search input.
          Component reads graphSyncStatus/graphSyncedAt/graphSyncErrors/syncDependencyGraph
          from useDocStore directly (no prop-drilling — Decision 3 Z).
          Props: { onToggleLayout: () => void; searchValue: string; onSearchChange: (v:string)=>void }.
          Signature: export function GraphToolbar(props: GraphToolbarProps): JSX.Element
FILE       src/components/docs/dependency-graph.tsx
           Replace inline toolbar JSX with <GraphToolbar ...props />.
VERIFY     BROWSER: click "Sync graph from source" → POST /sync 200 → graph:synced fires → dialog re-fetches.
           BROWSER: graphSyncStatus==="error" variant → button shows destructive variant.
RUN       bun run lint   EXPECT 0 errors.
```

### T6c — Phase C: extract `GraphCanvas` + `useGraphViewport` (FEATURE-FLAGGED)

> ⚠️ **AMENDED by §12.6** (cross-cutting recheck — apply before execution):
> - Replace the `stopPropagation` popover-close approach (line 600) with a `target.closest('[data-graph-node]')` guard in the click-outside handler. Removes the listener-ordering dependency entirely.
> - Add a Playwright snapshot+interaction test (`e2e/graph-canvas.spec.ts`) as a **repeatable** regression gate. Do NOT delete `LegacyCanvas` until it is green on `v1`. The one-time screenshot diff (steps 1-5) is not a durable gate.

```
NEW FILE  src/components/docs/graph/use-graph-viewport.ts
          Export: useGraphViewport(nodesRef: React.MutableRefObject<GraphNode[]>)
          Returns: { scale, translateX, translateY, onWheel, onPointerDown, onPointerMove, onPointerUp, resetView }
          CRITICAL: the wheel handler (moved from dependency-graph.tsx:2604) takes nodesRef.current
          (NOT a closure over nodes) — Decision 3 Persona B Attack 1 stale-closure fix.
          The hook owns: scale, translateX, translateY, isPanning (moved from ~1402-1403, 2963-2965).
          useEffect deps: [] (handlers are stable; they read refs).

NEW FILE  src/components/docs/graph/graph-canvas.tsx
          Props: { nodes: GraphNode[]; edges: GraphEdge[]; onNodeClick: (id:string)=>void }
          Internally: const nodesRef = useRef(nodes); useEffect(()=>{nodesRef.current=nodes},[nodes]);
                      const viewport = useGraphViewport(nodesRef);
          Renders: <svg ...>{edges}{nodes}</svg> (moved from orchestrator).
          The global click/keydown/scroll listeners (dependency-graph.tsx:2963-2965) STAY in the
          orchestrator (Decision 3 Persona B Attack 2 — event-ordering). GraphCanvas calls
          onNodeClick via a stopPropagation'd synthetic event.

FILE      src/components/docs/dependency-graph.tsx (orchestrator)
          const USE_SPLIT_CANVAS = process.env.NEXT_PUBLIC_GRAPH_SPLIT === "v1";
          {USE_SPLIT_CANVAS ? <GraphCanvas nodes={nodes} edges={edges} onNodeClick={...}/> : <LegacyCanvas .../>}
          LegacyCanvas = the current inline SVG JSX, UNTOUCHED, kept as fallback.
          The graph:synced listener (lines 2313-2324) stays in orchestrator (it triggers re-fetch,
          which re-renders whichever canvas is active).
```

### T6c verification (DOM-diff protocol)

```
STEP 1   Run dev with NEXT_PUBLIC_GRAPH_SPLIT unset (LegacyCanvas active).
         agent-browser screenshot the graph dialog → save as canvas-legacy.png
STEP 2   Run dev with NEXT_PUBLIC_GRAPH_SPLIT=v1 (GraphCanvas active).
         agent-browser screenshot the graph dialog → save as canvas-split.png
STEP 3   VLM-compare the two screenshots. EXPECT: pixel-identical node positions, edge paths, lane backgrounds.
         If diff: DO NOT flip default. Debug the ref/update-effect in useGraphViewport.
STEP 4   With split active: click node B7 → EXPECT detail popover opens (not instantly closes).
         Pan + wheel-zoom → EXPECT viewport updates (no frozen nodes — stale-closure check).
         Click "Sync graph" → EXPECT graph:synced → re-fetch → canvas re-renders with fresh nodes.
STEP 5   If steps 3+4 pass: set NEXT_PUBLIC_GRAPH_SPLIT=v1 as default in .env.
         Leave LegacyCanvas in place for ONE more session, then delete in a follow-up PR.
RUN      bun run lint   EXPECT 0 errors.
```

---

## T7 — ESLint rule: ban raw `window.dispatchEvent(new CustomEvent(...))` outside `contracts.ts`

**Target**: `eslint.config.mjs`.
**Depends on**: T2.
**Backward-compat**: lint-only; no runtime change.

### T7.1 Add a custom no-restricted-syntax rule

```js
// eslint.config.mjs — add to the rules of the relevant block
{
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        // Ban raw CustomEvent dispatch outside src/lib/contracts.ts.
        // All event dispatch MUST go through dispatchDocEvent() (T1).
        selector: "CallExpression[callee.object.property.name='dispatchEvent'][arguments.0.callee.name='CustomEvent']",
        message: "Use dispatchDocEvent() from @/lib/contracts instead of raw window.dispatchEvent(new CustomEvent(...)).",
      },
    ],
  },
  // contracts.ts itself is exempt (it IS the dispatch implementation)
  overrides: [
    {
      files: ["src/lib/contracts.ts"],
      rules: { "no-restricted-syntax": "off" },
    },
  ],
}
```

### T7.2 Verification

```
RUN   bun run lint   EXPECT 0 errors (T2 already migrated all call sites).
TEST  temporarily add `window.dispatchEvent(new CustomEvent("test"))` to any file except contracts.ts
      → EXPECT lint error. Remove the test line.
```

---

## T8 — `bug-facts.ts` migration (multi-PR, T8a→T8b→T8c)

**Target**: `src/lib/bug-facts.ts`, `src/components/docs/doc-reader.tsx` (+ 1 other call site), `consolidated-docs/BUG-DEPENDENCY-MAP.md`.
**Depends on**: T1-T7 stable.
**Backward-compat**: T8a + T8b preserve `BUG_FACTS` export. T8c deletes it.

> 🚫 **BLOCKING — §12.2 (RESOLVED: Strategy A only).** T8c is **hard-gated**: it MUST NOT delete `bug-facts.ts` until §12.2 Strategy A is implemented and cold-start-verified. The current T8b spec assumed "the dialog already fetches" the graph payload into the store — verified FALSE at render time (`dependency-graph.tsx:2327-2328` fetches only `if (open)`, into module-local state). §12.2 RESOLVED this: Strategy A (eager-fetch on page mount via `useDocStore.fetchGraphNodes()` + `doc-reader.tsx` mount effect) is the sole mandated path. The graph payload IS the canonical bug DB (`nodeSchema` carries `status`/`subsystem`/`oneLiner`/`repairs`/`blockedBy`/`onCriticalPath`), so eager-fetch is an architectural requirement. **Read §12.2 before T8b.**
> - §12.8 — `useGraphNode` MUST use a memoized `Map<string,GraphNode>` (O(1)), not `Array.find` (O(n)).
> - §12.7 — T8a coverage script MUST consume `validateRegistry<T>()`.

### T8a — Coverage dev script (one-shot, deleted after use)

```
NEW FILE  scripts/check-bug-fats-coverage.ts  (NOT shipped — dev-only)
          Reads BUG_FACTS keys from src/lib/bug-facts.ts.
          Reads nodes[] from BUG-DEPENDENCY-MAP.md §D-DATA YAML.
          For each BUG_FACTS key, checks the matching YAML node has:
            subsystem, oneLiner, repairs, blockedBy, onCriticalPath
          Prints: MISSING [<id>]: <field1>, <field2>  for each incomplete node.
          Exits 0 if 0 missing, 1 otherwise.
RUN       bun run scripts/check-bug-facts-coverage.ts
          FIX the YAML until exit 0 (populate every missing field from the bug-facts.ts entry).
DELETE    scripts/check-bug-facts-coverage.ts after exit-0 run.
```

### T8b — Repoint call sites to graph payload

```
GREP   "BUG_FACTS" src/   → find all import sites (expected: doc-reader.tsx + 1 other).
NEW    src/hooks/use-graph-node.ts
       export function useGraphNode(id: string | null): GraphNode | null
       Reads the graph payload from useDocStore (the dialog already fetches it; expose via a selector
       OR add a lightweight graphNodes: GraphNode[] slice to the store populated by the dialog's fetch).
       Returns the node matching id, or null.
EDIT   each BUG_FACTS call site:
       replace `BUG_FACTS[id]` lookup with `useGraphNode(id)` + read node.subsystem / node.oneLiner / etc.
       The popover renders from node fields, not from BUG_FACTS.
KEEP   src/lib/bug-facts.ts UNCHANGED for this PR (safety net — T8c deletes it).
VERIFY BROWSER: hover every node id that had a popover before → popover shows same subsystem/oneLiner.
RUN    bun run lint   EXPECT 0 errors.
```

### T8c — Delete `bug-facts.ts` (separate PR, after T8b verified in dev)

```
DELETE  src/lib/bug-facts.ts
GREP    "bug-facts" src/   EXPECT 0 matches (T8b repointed all)
RUN     bun run lint   EXPECT 0 errors
VERIFY  BROWSER: full click-through of every node popover → none empty.
        This is the empirical signal (Decision 6 Z): if any popover is empty, T8a missed a field — revert.
```

---

## 9. Final verification (all tasks)

```
RUN    bun run lint                          EXPECT 0 errors 0 warnings
GREP   "new CustomEvent\(" src/              EXPECT matches ONLY in src/lib/contracts.ts
GREP   "/home/z/my-project/consolidated" src/ EXPECT 0 matches (all paths via contracts.ts)
FETCH  GET  /api/docs                        EXPECT 200, { files:[10], warnings:[] }
FETCH  GET  /api/dependency-graph            EXPECT 200, nodes/edges present
FETCH  GET  /api/dependency-graph/validate   EXPECT 200, { ok:true, nodeCount, edgeCount, schemaVersion:"1.0.0" }
FETCH  POST /api/dependency-graph/validate body:{yaml:"<valid>"}  EXPECT 200
FETCH  POST /api/dependency-graph/validate body:{yaml:"<invalid>"} EXPECT 422 issues[]
FETCH  POST /api/dependency-graph/sync       EXPECT 200 (cache refresh)
BROWSER open /
  → sidebar: 10 docs, no amber banner
  → click B7 id-link → occurrence highlight fires (doc:jumpto-occurrence validated path)
  → open dependency-graph dialog
  → click "Sync graph from source" → graph:synced fires → dialog re-fetches → button shows syncedAt
  → (if NEXT_PUBLIC_GRAPH_SPLIT=v1) pan/zoom/node-click work, popover opens-and-stays
BROWSER check sticky footer on short + long pages
READ   /home/z/my-project/dev.log tail        EXPECT no new errors during verification
```

## 10. Baseline-metrics reconciliation (vs `01-research.md §1.5`)

| Metric | Target | Achieved by |
|---|---|---|
| Absolute hardcoded paths | 0 | T2.1 + T2.2 |
| Untyped event literals | 0 | T2.3 + T2.4 + T7 |
| `bug-facts.ts` entries | 0 (final) | T8c |
| `dependency-graph.tsx` lines | <400 orchestrator | T6a + T6b + T6c |
| Schema-migration hooks | 0 code, 1 documented pattern | T5 |
| Dry-run validation endpoints | 2 (POST + GET) | T4 |
| Lint errors | 0 | every task verifies |

---

*End of Document 3 (initial pass).*

---

## 11. Final recheck amendment (post-Phase-4 audit of all prior docs)

> Audit-trail narrative moved to Appendix A. This section is normative A2A only.

### 11.1 Coverage matrix — every Union verdict encoded?

| Doc 2 Decision | Union verdict (one line) | Doc 3 task | Status |
|---|---|---|---|
| 1 — contracts module | one file, fail-fast paths, tiered dispatch, eslint-ban | T1, T2, T7 | ✅ encoded (§12.4 resolves dispatch as tiered) |
| 2 — doc registry | INDEX.yml + never-throw + DOCS_DEV_MODE + banner | T3 | ✅ encoded (§12.5 adds schemaVersion + exact-case) |
| 3 — monolith split | Phase A+B ungated, Phase C flagged, ref-not-closure | T6a, T6b, T6c | ✅ encoded (§12.6 hardens popover + gate) |
| 4 — schema migration | DEFER, comment-only | T5 | ✅ encoded |
| 5 — validate endpoint | POST (body, 256KB) + GET (disk), no source field | T4 | ✅ encoded (§12.7 unifies result shape) |
| 6 — bug-facts | dev-script + populate + delete, no runtime bridge | T8a, T8b, T8c | ✅ encoded (§12.2 gates T8c on fetch-strategy) |

```
RESULT  All six Union verdicts encoded. No gap.
```

### 11.2 Determinism gaps acknowledged (agent must read before editing)

```
DETERMINISM-GAP  T3.3 (/api/docs route extension): plan does not inline current
                 route.ts content (would drift). Agent MUST Read
                 src/app/api/docs/route.ts before editing to locate the response
                 construction site. Plan specifies field name (warnings: string[]),
                 type, 200-always policy. Insertion point is file-dependent.

DETERMINISM-GAP  T6a (GraphLegend extraction): plan cites "~80 lines" but no exact
                 line numbers (legend block not individually cited in Phase 1).
                 Agent MUST grep dependency-graph.tsx for the legend JSX. Component
                 props ({ lanes: Lane[] }) + store subscription (graphSyncStatus)
                 are specified; the JSX move is mechanical.

SCOPE            These are the only two non-line-pinned tasks. All others cite
                 exact file:line ranges. Acceptable for solo-maintainer A2A;
                 absolute determinism on T3.3/T6a would require inlining ~150
                 lines of current source that would itself become drift-prone.
```

### 11.3 Deliberately out-of-scope items (confirmed, not gaps)

```
OUT-OF-SCOPE  ETag / If-None-Match on /api/docs   (01-research.md §1.3, ⚠️)
              Rationale: docs payload is small (metadata-only after serializeDocs
              includeContent=false fix, worklog.md Task 3). In-memory cache already
              prevents re-parse. Re-open if payload grows past 100KB.

OUT-OF-SCOPE  Rate-limit memory across restarts   (01-research.md §1.2.7, I-8)
              Deferred per 02-document1 §2.7.

OUT-OF-SCOPE  Auth on /sync / /validate           (DEPENDENCY-GRAPH-SCHEMA-DESIGN.md §7)
              App has no auth today; routes only re-read disk.
```

### 11.4 Cross-document consistency check

```
CONSISTENCY  01-research.md §1.5 baseline metrics → 04 §10 reconciliation table
             → all 7 metric rows map 1:1. ✅

CONSISTENCY  02-document1 §2.8 priority ordering (P0→P4) → 04 task order
             → T1/T2=I-4+I-1/I-2=P0, T4=I-7=P1, T6=I-5=P2, T5=I-6=P3, T8=I-3=P4. ✅

CONSISTENCY  02-document1 §2.9 reversals (I-6 defer, I-3 no-bridge) → 04
             → T5 (comment-only) + T8 (dev-script, no Proxy). ✅

CONSISTENCY  03-document2 Persona B attacks → 04 countermeasures:
             B-Attack-1 (sync fetch impossible)        → T8 has no runtime fetch. ✅
             B-Attack-1/D3 (stale closure)             → T6c nodesRef. ✅
             B-Attack-2/D3 (event ordering)            → T6c global listeners stay in orchestrator. ✅
             B-Attack-2/D5 (body-size DoS)             → T4.2 256KB cap. ✅
             B-Attack-3/D5 (source misread)            → T4 no source field. ✅
             B-Attack-1/D2 (fail-closed doc list)      → T3.2 never-throw. ✅
             B-Attack-2/D2 (unlisted leak)             → T3.2 DOCS_DEV_MODE gate. ✅
             B-Attack-3/D2 (phantom INDEX entry)       → T3.2 existsSync check. ✅
             B-D4 (YAGNI scaffold)                     → T5 comment-only. ✅
             B-D6 (Proxy footguns)                     → T8 no Proxy. ✅

RESULT  All Persona B attacks have a corresponding countermeasure. No gap.
```

### 11.5 Verdict

```
VERDICT  Document 3 is a faithful, deterministic encoding of the revised positions
         from Documents 1 (amended) and 2 (Union verdicts), grounded in Phase 1.
         Two acknowledged determinism gaps (T3.3, T6a) are mechanical
         read-then-edit tasks with fully-specified contracts.

EXECUTION-ORDER (initial pass; SUPERSEDED by §12.9):
         T1→T2→T3→T4→T5→T6a→T6b→T6c→T7→T8a→T8b→T8c
         T5/T7 parallel-safe after T2. T8 strictly last.

SUPERSEDED-BY  §12.9. §12 (fifth cross-cutting recheck) amends T1/T2/T3/T6c/T8
         and hard-gates T8c on §12.2. Authoritative order is §12.9. An agent
         reading §11.5 alone and proceeding to T8c without the §12.2
         fetch-strategy ships the broken-popover regression. §11 retained for
         audit-chain honesty; §12 is the operative plan.
```

---

## 12. Fifth-pass recheck — bird's-eye cross-cutting audit

> Audit-trail narrative moved to Appendix A. This section is normative A2A only.
> One finding is BLOCKING (§12.2): resolve + cold-start-verify before T8c.
> Every finding below is verified against actual `file:line` in the current repo.
> Where a finding amends a task, the amendment is normative: an executing agent
> MUST apply it.

### 12.1 Verified findings (summary)

| # | Finding | Severity | Amends | Verified at |
|---|---|---|---|---|
| 12.2 | **BLOCKING** — `useGraphNode` would read an empty store on cold page load; every popover renders empty until the graph dialog is first opened. T8c's verification would then misdiagnose this as a T8a coverage gap. | BLOCKING | T8b, T8c | `dependency-graph.tsx:2293-2311,2327-2328`; `markdown-renderer.tsx:266,315`; `backlinks-panel.tsx:179`; `command-palette.tsx:216`; `doc-reader.tsx` (no `/api/dependency-graph` fetch on mount) |
| 12.3 | `getDocsDir()` resolves via `process.cwd()` with **no env-var override** — the I-1 "portability blocker" is only half-fixed (moved from import-time to first-call-time, not removed). | High | T1 | doc 4 T1 lines 58-68 |
| 12.4 | `dispatchDocEvent` returns `boolean` "so the caller can decide" — but **no T2 call site checks it**. The type signature promises a decision point nothing exercises. | Medium | T1, T2 | doc 4 T1 lines 109,121; T2.3/T2.4 call sites |
| 12.5 | `INDEX.yml` declares `schemaVersion: "1.0.0"` but `loadDocRegistry()` **never reads or validates it** — the exact "versioned field with zero enforcement" anti-pattern I-6 criticizes. Plus reference checks use `existsSync` (case-insensitive on macOS) with **no automated exact-case gate**. | High | T3 | doc 4 T3.1 line 210; T3.2 lines 271-320 (esp. 297); T1 `DocMeta` lines 77-82 (no top-level schema) |
| 12.6 | The T6c popover-close "fix" relies on `stopPropagation` capture-phase timing across a component boundary — the same implicit coupling the refactor exists to kill. **No repeatable regression gate** exists; verification is a one-time screenshot diff that ages out once `LegacyCanvas` is deleted. | High | T6c | doc 4 T6c line 600; T6c verification lines 610-625 |
| 12.7 | **Consolidation missed**: T3's `{entries,warnings}`, T8a's stdout+exit-code script, and T4's `{ok,nodeCount,edgeCount}`/`{ok:false,issues}` are three near-identical-but-not-identical "validate a declarative registry against real references" result shapes. A shared `validateRegistry<T>()` in `contracts.ts` would give the whole system one result contract. | High (leverage) | T1, T3, T4, T8a | doc 4 T3.2 lines 266-269,319; T4.2 lines 419-436; T8a lines 685-686 |
| 12.8 | `useGraphNode` over `nodes[]` would be O(n) `Array.find` per popover render (the current `BUG_FACTS[id]` is O(1) `Record` lookup — a regression in lookup cost post-migration). | Low | T8b | `bug-facts.ts:98` (current O(1)); doc 4 T8b line 702 |

### 12.2 BLOCKING — T8b fetch-timing precondition (verify BEFORE T8c)

```
DECISION  Strategy A only (eager-fetch on page mount). Strategy B deleted.
          Rationale: the graph payload IS the canonical bug DB by design —
          nodeSchema carries status (pending/resolved/urgent/independent),
          subsystem, oneLiner, repairs, blockedBy, onCriticalPath. These are
          progress-tracking fields; the schema was built for current AND future
          bugs. Eager-fetch is therefore an architectural requirement, not a UX
          preference: the canonical store must be loaded before any consumer
          reads it. Lazy-fetch (Strategy B) would mean the canonical DB is
          unavailable until the user happens to open the dialog — architecturally
          wrong for a DB-backed source of truth.

EVIDENCE  dependency-graph.tsx:2293-2311  → fetch writes to module-level graphDataCache
                                           + dialog-local setData, NOT the Zustand store
          dependency-graph.tsx:2327-2328  → fetch fires `if (open)` only; dialog is
                                           closed on cold page load
          markdown-renderer.tsx:266,315   → getBugFact(id) called synchronously in
                                           render (IIFE in PopoverContent); no async
          backlinks-panel.tsx:179         → same synchronous pattern
          command-palette.tsx:216         → same synchronous pattern
          doc-reader.tsx (grep)           → only mount fetches are /api/docs + /api/docs?slug=;
                                           NO /api/dependency-graph fetch on mount
          dependency-graph.ts:90-130      → nodeSchema = { status, label, description,
                                           lane, repairs, blockedBy, onCriticalPath,
                                           subsystem, oneLiner } — canonical bug+progress DB
          doc-4 T8b lines 696-700         → spec says "the dialog already fetches it" —
                                           FALSE at render time (see evidence above)

CONSEQUENCE-IF-IGNORED  On cold page load (dialog never opened), every popover
          returns null → renders empty. This is the exact "broken popover" failure
          mode Decision 6 §2.6.1 was written to prevent, reintroduced through the
          fetch-timing door. T8c verification would then misdiagnose this as a T8a
          coverage gap (chasing a phantom missing field while the real cause is
          the store was never populated).

MANDATED  Apply to T8b — replace the T8b useGraphNode spec with:

  STRATEGY A — eager-fetch on page mount (MANDATORY; sole strategy)

  1. ADD to useDocStore (doc-store.ts DocState):
       graphNodes: GraphNode[];
       graphNodesStatus: "idle" | "loading" | "ready" | "error";
       setGraphNodes: (nodes: GraphNode[], status: GraphNodesStatus) => void;
       fetchGraphNodes: (force?: boolean) => Promise<void>;
         // idempotent; no-op if status==="ready"|"loading" unless force=true

  2. ADD to doc-reader.tsx (mount effect):
       useEffect(() => { useDocStore.getState().fetchGraphNodes(); }, []);
       // Single mount-time fetch. The ~100ms race window is covered by step 4.

  3. CREATE src/hooks/use-graph-node.ts:
       select graphNodes from store; build Map<string,GraphNode> (see §12.8);
       return map.get(id) ?? null. Call sites keep their synchronous shape.

  4. POPOVER render contract:
       if useGraphNode(id) === null AND status !== "ready"  → render "loading…"
       if useGraphNode(id) === null AND status === "ready"  → render "no fact" fallback
       // Visually distinct: loading (transient) vs genuinely-missing (data gap).

  5. REPLACE dependency-graph.tsx dialog's private fetch + module cache with:
       useDocStore.fetchGraphNodes() + select graphNodes.
       The graph:synced listener (lines 2317-2325) now calls
       fetchGraphNodes(true) (force) instead of clearing a private cache.
       → The store becomes the single client-side source of truth.

MANDATED  Apply to T8c verification (replaces T8c lines 715-716):

  VERIFY  BROWSER (COLD START — critical gate):
          1. Hard-reload / in a fresh tab. Do NOT open the graph dialog first.
          2. Immediately hover/click a B7 id-link popover WITHOUT opening the dialog.
          3. EXPECT: popover renders subsystem/oneLiner (from mount-time fetch),
             OR a brief "loading…" if fetch still in flight. MUST NOT render the
             "no fact" fallback.
          4. ONLY THEN open the dialog and click through every node popover
             (original T8c check) to confirm no field is missing.
          If step 3 shows "no fact" on cold start: §12.2 NOT met — DO NOT delete
          bug-facts.ts. Fix T8b first. Do NOT attribute a cold-start empty popover
          to a T8a coverage gap; the two causes are distinguishable only by this
          cold-start protocol.

GATE      T8c is hard-gated on this section. An agent reaching T8c without having
          implemented AND cold-start-verified Strategy A MUST stop and implement
          it first. Deleting bug-facts.ts before that ships the broken-popover
          regression.
```

### 12.3 AMENDS T1 — env-var override for path resolution

EVIDENCE  doc-4 T1 lines 58-68  → getDocsDir() resolves `path.resolve(process.cwd(), "consolidated-docs")`
          Decision 1 / Persona B  → flagged `process.cwd()` as repo-root-as-cwd assumption
          → adopted fix (lazy + existsSync throw) only MOVES failure from import-time to
            first-call-time; does NOT REMOVE the assumption.
          → I-1 goal = "portability blocker"; true portability = runs across
            sandboxes/deploys without a cwd assumption.

MANDATED  Amend T1.2 `getDocsDir()` to read env var first:

```ts
let _docsDir: string | null = null;
export function getDocsDir(): string {
  if (_docsDir) return _docsDir;
  const dir = process.env.DOCS_DIR
    ? path.resolve(process.env.DOCS_DIR)
    : path.resolve(process.cwd(), "consolidated-docs");
  if (!existsSync(dir)) {
    throw new Error(
      `contracts: DOCS_DIR missing at ${dir} (cwd=${process.cwd()}). ` +
      `Set DOCS_DIR env var or run from repo root.`
    );
  }
  _docsDir = dir;
  return dir;
}
```

NOTE      `getBugMapPath()` and `resolveDocPath()` unchanged (delegate to `getDocsDir()`).
          One env var (`DOCS_DIR`) makes the whole module portable.
VERIFY    Add to T1.3 verification:

```
RUN   DOCS_DIR=/tmp/nonexistent bun run dev   EXPECT getDocsDir() throws with "Set DOCS_DIR env var" message
```

### 12.4 RESOLVED — `dispatchDocEvent`: tiered dispatch (consistency-mitigated)

```
DECISION  Option A — wire a call site. Consistency-pressure con mitigated via a
         two-function contract: the function NAME at the call site encodes whether
         failure-handling is required. Eliminates the "should I wire this one too?"
         cascade — each call site explicitly declares its policy by name.

EVIDENCE  doc-4 T1 lines 109,121    → dispatchDocEvent returns boolean "so caller can decide"
          doc-4 T2.3 line 172-174    → doc-store.ts calls as statement (ignores return)
          doc-4 T2.4 line 180-181    → markdown-renderer.tsx same (ignores return)
          → dead contract: signature promises a decision point no code exercises.

MANDATED  Replace the single boolean-returning dispatchDocEvent with TWO functions
          in contracts.ts:

  // ---------- src/lib/contracts.ts ----------

  // Fire-and-forget. Validates payload, dispatches, logs errors via console.error.
  // DEFAULT for all call sites. Caller explicitly opts out of failure-handling.
  export function dispatchDocEvent(name: EventName, detail?: unknown): void {
    if (typeof window === "undefined") return;
    const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined)?.[name];
    if (schema && detail !== undefined) {
      const parsed = schema.safeParse(detail);
      if (!parsed.success) {
        console.error(`[contracts] rejected payload for ${name}`, parsed.error.issues);
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
  export function dispatchDocEventChecked(name: EventName, detail?: unknown): boolean {
    if (typeof window === "undefined") return false;
    const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined)?.[name];
    if (schema && detail !== undefined) {
      const parsed = schema.safeParse(detail);
      if (!parsed.success) {
        console.error(`[contracts] rejected payload for ${name}`, parsed.error.issues);
        return false;
      }
      detail = parsed.data;
    }
    window.dispatchEvent(new CustomEvent(name, { detail }));
    return true;
  }

POLICY    Two functions, one decision rule, encoded in the name:
            dispatchDocEvent(...)        → caller opts out (void).   DEFAULT.
            dispatchDocEventChecked(...) → caller MUST handle false. OPT-IN.
          This eliminates the consistency-pressure con: there is no "unwired call
          site" smell, because each call site declares its policy via the function
          name. A reviewer/agent reads the name and knows the intent. No guilt,
          no cascade. If drift is later observed, T7 eslint can require an
          `if (!...)` block immediately after any dispatchDocEventChecked call.

WIRED-SITE  Exactly ONE site uses the checked variant (the reference implementation):
             doc-store.ts syncDependencyGraph() success branch (T2.3 line 172-174):

    const dispatched = dispatchDocEventChecked(
      EVT.GraphSynced,
      { generatedAt: body.generatedAt }
    );
    if (!dispatched) {
      console.warn("[doc-store] graph:synced dispatch rejected (SSR or bad payload)");
      set({ graphSyncStatus: "error",
            graphSyncErrors: ["sync succeeded but event dispatch failed"] });
    }

             Rationale: GraphSynced is the one event whose silent failure causes
             visible UI staleness (graph dialog won't refresh). Every other
             dispatch site uses the void variant — their failure is dev-only and
             console.error is sufficient signal.

VERIFY      RUN  bun run lint                                   EXPECT 0 errors
            RUN  grep -rn "dispatchDocEventChecked" src/         EXPECT exactly 1 match
            RUN  grep -rn "dispatchDocEvent(" src/ | grep -v Checked | wc -l
                                                                 EXPECT ≥ 5 (all void call sites)
```

### 12.5 AMENDS T3 — validate `schemaVersion`; add exact-case reference gate

EVIDENCE-1  doc-4 T3.1 line 210        → INDEX.yml declares `schemaVersion: "1.0.0"`
            doc-4 T3.2 lines 271-320     → loadDocRegistry() parses only `parsed.docs`;
                                          never reads `parsed.schemaVersion`
            doc-4 T1 lines 77-82         → DocMeta validates entries; NO top-level schema
                                          includes `schemaVersion`
            → "versioned field with zero enforcement" anti-pattern I-6 (Decision 4)
              was written to call out; shipped into the fix for a different issue.

MANDATED-1  Add a top-level registry schema in `contracts.ts` (alongside `DocMeta`):

```ts
// src/lib/contracts.ts — add after DocMeta
export const DocRegistry = z.object({
  schemaVersion: z.literal("1.0.0"),
  docs: z.array(DocMeta),
});
export type DocRegistryFile = z.infer<typeof DocRegistry>;
```

WIRE-1      In T3.2, replace loose `yamlLoad(...) as { docs?: unknown[] }` + `Array.isArray`
            checks with `DocRegistry.safeParse(yamlLoad(...))`. On failure, push a
            warning naming the field (e.g. `INDEX.yml schemaVersion must be exactly
            "1.0.0" (got "1.1.0") — see T5 migration pattern`) and fall back to
            `legacyScan()`. Makes the field load-bearing; points future editor at
            the documented migrator.

EVIDENCE-2  doc-4 T3.2 line 297        → validates each entry with
            `existsSync(resolveDocPath(r.data.file))`
            → `existsSync` is case-insensitive on default macOS FS.
            → maintainer types `part-1-...` instead of `PART-1-...`: resolves locally,
              404s in prod/CI on case-sensitive Linux FS.
            doc-4 T3.1 line 254         → "verify file values match (case-sensitive)" =
            one-time MANUAL agent check, not an automated gate; ages out when a
            file is added.

MANDATED-2  In `loadDocRegistry()`, after the per-entry `existsSync` check, add an
            exact-case comparison against `readdirSync(getDocsDir())`:

```ts
const onDisk = new Set(readdirSync(getDocsDir()));
// ...inside the per-entry loop, after existsSync passes:
if (!onDisk.has(r.data.file)) {
  warnings.push(
    `INDEX.yml entry "${r.data.file}" does not exact-case-match any file on disk ` +
    `(existsSync is case-insensitive on macOS). Check casing.`
  );
  // still push the entry; the warning is the signal. (Do not silently drop.)
}
```

VERIFY      Add to T3.5 verification:

```
BREAK TEST: lowercase one INDEX.yml entry's filename (e.g. PART-1 → part-1) on a
            case-sensitive FS (CI). EXPECT warnings includes "does not exact-case-match".
```

### 12.6 AMENDS T6c — robust popover-close fix + repeatable regression gate

EVIDENCE-1  doc-4 T6c line 600  → "GraphCanvas calls onNodeClick via a stopPropagation'd
            synthetic event." Relying on capture-phase event-ordering across a
            component boundary = the implicit coupling this refactor exists to kill;
            fragile to future changes in listener registration order.

MANDATED-1  Replace `stopPropagation` with a target-check in the click-outside handler.
            In the orchestrator's global click handler (closes detail popover on
            outside-click), guard with:

```ts
// orchestrator outside-click handler
const onClickAway = (e: MouseEvent) => {
  const target = e.target as Element | null;
  // Don't close if the click landed on a graph node (the node's own handler opens the popover).
  if (target?.closest("[data-graph-node]")) return;
  setSelectedId(null);
};
```

WIRE-1      `GraphCanvas` stamps `data-graph-node={node.id}` on each node element.
            Removes the ordering dependency entirely (decision made on event target,
            not on which listener fired first). Delete the `stopPropagation`
            requirement from T6c line 600.

EVIDENCE-2  doc-4 T6c verification lines 610-625 → one-time manual/agent-browser
            screenshot diff. Nothing in T7–T9 turns it into a CI check.
            → Once `LegacyCanvas` deleted (T6c step 5 follow-up), NO test catches a
              future stale-closure regression in `useGraphViewport` — the precise bug
              Decision 3 Persona B Attack 1 was about.

MANDATED-2  Add a Playwright snapshot + interaction test as a repeatable gate.
            New file `e2e/graph-canvas.spec.ts`:

```ts
// e2e/graph-canvas.spec.ts
// 1. Open / , open the graph dialog (NEXT_PUBLIC_GRAPH_SPLIT=v1).
// 2. Snapshot the canvas → baseline (committed). Future runs pixel-diff against it.
// 3. Pan (pointer down/move/up) + wheel-zoom → assert transform changed, nodes still rendered.
// 4. Click node B7 → assert detail popover opens AND stays open (not instantly closed).
// 5. Click "Sync graph" → assert graph:synced fired (via window event spy) + canvas re-rendered.
// This gate survives LegacyCanvas deletion and catches stale-closure regressions in useGraphViewport.
```

WIRE-2      Wire into CI (`bun run e2e` or equivalent). Add to T6c verification:
            "STEP 6: `bun run e2e` passes. This is the repeatable gate; steps 1-5
            are the one-time flip verification." Do NOT delete `LegacyCanvas`
            (T6c step 5 follow-up) until this test is green on `v1`.

### 12.7 CONSOLIDATION — `validateRegistry<T>()` in `contracts.ts` (T3 + T8a + T4)

EVIDENCE  Three places validate "a declarative registry (YAML) whose entries must
          reference real things, with a warning path" — each with a DIFFERENT result shape:
          - T3.2 loadDocRegistry()       → { entries, warnings }              (lines 266-269, 319)
          - T8a check-bug-facts-coverage → stdout MISSING [<id>]: <field> + exit (lines 685-686)
          - T4.2/T4.3 validate endpoint  → { ok, nodeCount, edgeCount, schemaVersion }
                                         / { ok:false, issues }               (lines 419-470)
          → An agent must learn three near-identical-but-not-identical contracts.
            README line 7 goal ("an AI agent reasoning about this system") is directly
            served by unifying them.

MANDATED  Add a generic helper to `contracts.ts`:

```ts
// src/lib/contracts.ts
export interface RegistryResult<T> {
  entries: T[];        // successfully-validated entries (may be partial if warnings exist)
  warnings: string[];  // never-throw: every recoverable problem lands here
  ok: boolean;         // warnings.length === 0
}

export function validateRegistry<T>(opts: {
  schema: z.ZodType<T>;                 // entry-level schema
  raw: unknown;                          // parsed YAML (already yamlLoad'd)
  listKey: string;                       // e.g. "docs", "nodes"
  referenceCheck?: (entry: T) => string | null;  // returns a warning string if the ref is bad, else null
}): RegistryResult<T> {
  const warnings: string[] = [];
  const entries: T[] = [];
  if (typeof opts.raw !== "object" || opts.raw === null || !Array.isArray((opts.raw as Record<string,unknown>)[opts.listKey])) {
    return { entries, warnings: [`${opts.listKey} missing or not an array`], ok: false };
  }
  for (const item of (opts.raw as Record<string,unknown[]>)[opts.listKey]) {
    const r = opts.schema.safeParse(item);
    if (!r.success) {
      warnings.push(`bad entry ${JSON.stringify(item)}: ${r.error.issues.map(i=>i.message).join("; ")}`);
      continue;
    }
    const refWarn = opts.referenceCheck?.(r.data) ?? null;
    if (refWarn) warnings.push(refWarn);
    entries.push(r.data);
  }
  return { entries, warnings, ok: warnings.length === 0 };
}
```

CONSUME   In three places:
          - T3.2 loadDocRegistry(): call validateRegistry<DocMetaEntry>({ schema: DocMeta,
            raw, listKey: "docs", referenceCheck: (e) => exact-case-exists(e.file) }).
            Wrap top-level in DocRegistry.safeParse (§12.5) for schemaVersion.
            Return { entries, warnings } (drop ok, or keep — T3.3 only surfaces warnings).
          - T8a check-bug-facts-coverage.ts: call validateRegistry against §D-DATA nodes
            with referenceCheck flagging any node missing
            subsystem/oneLiner/repairs/blockedBy/onCriticalPath. Script reduces
            RegistryResult to MISSING [<id>]: <fields> stdout + exit code.
            Same result contract, different presentation.
          - T4 validate endpoint: return RegistryResult-shaped JSON on success too —
            { ok: true, entries: parsed.nodes, warnings: [] } (on failure
            { ok: false, entries: [], warnings: e.issues.map(...) }). Drop the bespoke
            {nodeCount, edgeCount, schemaVersion} shape; entries.length and
            parsed.schemaVersion are derivable by the caller.
            → One result contract for the whole system.

### 12.8 AMENDS T8b — `useGraphNode` lookup must be O(1), not O(n)

EVIDENCE  bug-facts.ts:98        → current getBugFact(id) = BUG_FACTS[id] — O(1) Record lookup
          doc-4 T8b line 702      → replaces with useGraphNode(id) selecting from nodes[]
          → naive impl does nodes.find(n => n.id === id) per popover render = O(n) per
            hover; Zustand selectors re-run on every store change. For ~36 nodes
            negligible today, but gratuitous regression in lookup-cost; unidiomatic.

MANDATED  `useGraphNode` must build a `Map<string, GraphNode>` once (memoized on
          `graphNodes` identity) and select by key:

```ts
// src/hooks/use-graph-node.ts
import { useMemo } from "react";
import { useDocStore } from "@/lib/doc-store";
import type { GraphNode } from "@/lib/dependency-graph";

const _byId = new Map<string, GraphNode>();  // module-level memo keyed by graphNodes reference
let _lastRef: GraphNode[] | null = null;

export function useGraphNode(id: string | null): GraphNode | null {
  const nodes = useDocStore((s) => s.graphNodes);
  if (_lastRef !== nodes) {
    _byId.clear();
    for (const n of nodes) _byId.set(n.id, n);
    _lastRef = nodes;
  }
  if (id === null) return null;
  return _byId.get(id) ?? null;
}
```

NOTE      Module-level memo is fine here (exactly one graph payload in the store).
          If multiple consumers ever need different payloads, move the Map into the
          store alongside `graphNodes`.

### 12.9 Revised execution-order & gating note

```
T1 (contracts.ts, WITH §12.3 env var + §12.4 tiered dispatch + §12.7 validateRegistry)
  →  T2 (wire modules, WITH §12.4 graph:synced checked-variant wiring)
  →  T3 (INDEX.yml + parser, WITH §12.5 schemaVersion validation + exact-case gate + §12.7 consume validateRegistry)
  →  T4 (validate endpoint, WITH §12.7 RegistryResult shape)
  →  T5 (schema-migration comment)
  →  T6a/T6b (monolith Phase A+B)
  →  T6c (Phase C, flagged, WITH §12.6 target-check fix + Playwright gate)
  →  T7 (eslint rule)
  →  T8a (coverage script, WITH §12.7 consume validateRegistry)
  →  T8b (repoint call sites, WITH §12.2 fetch-strategy + §12.8 Map lookup)   ← BLOCKING pre-condition
  →  T8c (delete bug-facts.ts) — ONLY after §12.2 cold-start verification passes
```

```
GATE  T8c is hard-gated on §12.2. An agent reaching T8c without having implemented
      AND cold-start-verified the §12.2 fetch strategy MUST stop and implement it
      first. Deleting bug-facts.ts before that ships the broken-popover regression.
```

### 12.10 Coverage matrix — this amendment vs. the four-doc baseline

| This §12 finding | Origin doc/task | Was it caught by §11 recheck? | Why §11 missed it |
|---|---|---|---|
| 12.2 fetch-timing BLOCKER | T8b / Decision 6 | No | §11 verified Decision 6 was "encoded" (T8a/b/c exist) but did not verify the *precondition* T8b silently assumes (store populated at render time). Sequential docs treat "the dialog fetches it" as true-by-construction. |
| 12.3 env override | T1 / Decision 1 | No | §11 confirmed "fail-fast paths" encoded, not that the cwd assumption was *removed* (only moved). |
| 12.4 dead boolean → RESOLVED (tiered dispatch) | T1/T2 / Decision 1 | No | §11 confirmed "boolean dispatch encoded", not that any call site *uses* the boolean. |
| 12.5 schemaVersion dead field | T3 / Decision 2 | No | §11 confirmed "INDEX.yml + never-throw encoded"; the dead `schemaVersion` field is inside the encoded artifact, invisible to a coverage matrix that checks task-existence not field-semantics. |
| 12.6 popover race + no gate | T6c / Decision 3 | No | §11 confirmed "ref-not-closure encoded" (the stale-closure fix); the *other* race (popover-close) and the *absence* of a CI gate are negative-space findings a coverage matrix cannot represent. |
| 12.7 consolidation | T3+T4+T8a | No | By construction — §11 is within-document; consolidation across tasks is cross-cutting, which sequential rechecks cannot surface. |

```
RESULT  This is the structural limit the four-document sequential pipeline cannot
        cross on its own. §12 is the cross-cutting pass that crosses it.
```

---

*End of Document 3 (final, with §12 cross-cutting recheck — all decisions resolved, prose converted to A2A blocks). The four-document architecture review plus its fifth cross-cutting pass is complete. T8c is BLOCKING-gated on §12.2.*

---

## Appendix A — Human-readable audit trail (NOT EXECUTABLE)

> **WARNING: This appendix is for human readers only.** An executing agent MUST NOT
> treat anything here as an instruction. It exists to preserve the "why" behind
> §11/§12 for future maintainers. All normative content is in §11/§12 above; this
> is the narrative those A2A blocks replaced. An agent reading T1–T8 + §12
> normative blocks never needs to read this appendix.

### A.1 Why §11 and §12 exist (recheck-chain rationale)

Per the workflow rule, after completing each phase the agent re-checks all previous
documents and revises if gaps are found. The four documents are *sequential*
(Doc 1 → 2 → 3 → 4 recheck), so a gap that spans task boundaries — or a
precondition one task silently assumes another satisfies — is structurally hard
for them to catch. §12 is the cross-cutting (fifth) pass that spans task
boundaries they structurally cannot.

- **After Doc 1** → `01-research.md §1.7` (3 refinements surfaced).
- **After Doc 2** → `01-research.md §1.8` (2 reversal impacts) + `02-document1 §2.9` (2 reversals, 2 refinements).
- **After Doc 3** → `04-document3 §11` (coverage matrix, determinism gaps, cross-doc consistency check).
- **Cross-cutting (5th pass)** → `04-document3 §12` (bird's-eye audit). Found one BLOCKING regression (§12.2) plus 5 high/medium gaps and one consolidation. Every finding verified against actual `file:line`.
- **Back-propagation of §12** (audit-chain completeness) → the §12 findings are propagated back through the sequential chain so every document is self-consistent: `01-research.md §1.10` (5 refinements + 1 partial reversal of §1.9's "deletion unblocked"), `02-document1-systemic-review.md §2.10` (issue-by-issue propagation table + self-recheck), `03-document2-adversarial-dialectic.md` recheck amendment (Decision 6's Union-verdict premise proved FALSE at render time; Decisions 1/2/3/4/5 each hardened). §12 remains the normative source for task-level amendments; the earlier-doc amendments are the audit trail of *why*.

Read §12 for *what to change*; read §1.10/§2.10/03-recheck for *how each finding traces back to a Phase-1/2/3 claim*.

### A.2 Per-finding narrative (the "why" behind each §12 amendment)

**§12.2 (BLOCKING — fetch-timing).** T8b's spec said "the dialog already fetches it"
as a parenthetical. This is false at render time: the dialog fetch fires `if (open)`
only, and the fetch writes to a module-level cache + dialog-local state, not the
Zustand store. On a cold page load the popovers call `getBugFact(id)`
synchronously in render — there is no data to read. Repointing them to a store
slice that is never populated ships the exact "broken popover" regression
Decision 6 was written to prevent. T8c's verification would then misdiagnose the
empty popover as a T8a coverage gap (chasing a phantom missing YAML field while
the real cause is the store was never fetched). The graph payload IS the canonical
bug DB (nodeSchema carries status/subsystem/oneLiner/repairs/blockedBy/
onCriticalPath — progress-tracking fields by design), so eager-fetch is an
architectural requirement, not a UX preference: the canonical store must be loaded
before any consumer reads it. Strategy B (lazy-fetch) was deleted because it would
mean the canonical DB is unavailable until the user happens to open the dialog —
architecturally wrong for a DB-backed source of truth, and its complexity breeds
the same class of timing bugs this finding exists to kill.

**§12.3 (env-var override).** Persona B's Attack 1 (Decision 1) correctly flagged
`process.cwd()` as assuming repo-root-as-cwd. The adopted fix (lazy resolution +
`existsSync` throw) only *moves* the failure from import-time to first-call-time —
it does not *remove* the assumption. The stated goal of I-1 was "portability
blocker"; true portability means the same code runs across sandboxes/deploys
without a cwd assumption. One env var (`DOCS_DIR`) removes the assumption entirely.

**§12.4 (tiered dispatch).** `dispatchDocEvent` returned `boolean` "so the caller
can decide" (Decision 1 Persona B rationale), but no T2 call site read the return
value — a dead contract. Resolved as Option A (wire a call site) with an elegant
mitigation for the consistency-pressure con: a two-function contract where the
function name encodes the policy. `dispatchDocEvent` (void) is the default;
`dispatchDocEventChecked` (boolean) is opt-in and requires the caller to handle
`false`. This eliminates the "should I wire this one too?" cascade — each call
site declares its policy by name. Exactly one site (graph:synced in doc-store.ts)
uses the checked variant, because its silent failure causes visible UI staleness.
Every other site uses the void variant; their failure is dev-only and
`console.error` is sufficient signal.

**§12.5 (schemaVersion + exact-case).** T3.1 declared `schemaVersion: "1.0.0"` but
`loadDocRegistry()` never read or validated it — the precise "versioned field with
zero enforcement" anti-pattern I-6 (Decision 4) was written to call out, shipped
into the fix for a *different* issue without anyone noticing because the four docs
are sequential. Additionally, `existsSync` is case-insensitive on macOS, so a
maintainer who types `part-1-...` instead of `PART-1-...` resolves locally then
404s in prod/CI. The fix makes the field load-bearing (top-level `DocRegistry`
schema + `safeParse`) and adds an automated exact-case gate via `readdirSync`.

**§12.6 (popover race + no gate).** The T6c popover-close "fix" relied on
`stopPropagation` capture-phase timing across a component boundary — the same
implicit coupling the refactor exists to kill. Replaced with a target-check
(`data-graph-node` attribute + `closest()`), which removes the ordering dependency
entirely. Separately, T6c verification was a one-time screenshot diff with nothing
in T7–T9 turning it into a CI check; once `LegacyCanvas` is deleted, no test would
catch a future stale-closure regression in `useGraphViewport` — the precise bug
Decision 3 Persona B Attack 1 was about. Added a Playwright snapshot + interaction
test as a repeatable gate that survives `LegacyCanvas` deletion.

**§12.7 (validateRegistry consolidation).** Three places validate "a declarative
registry whose entries must reference real things" — T3's `{entries,warnings}`,
T8a's stdout+exit-code script, and T4's `{ok,nodeCount,edgeCount}`/`{ok:false,issues}`
— each near-identical-but-not-identical. A shared `validateRegistry<T>()` gives the
whole system one result contract. This is a small change with outsized leverage
for the stated agent-readability goal, and the kind of cross-cutting finding a
fifth recheck pass exists to catch but the four sequential documents structurally
could not.

**§12.8 (O(1) lookup).** The current `getBugFact(id)` is `BUG_FACTS[id]` — O(1)
`Record` lookup. A naive `useGraphNode` doing `nodes.find(...)` would be O(n) per
popover render. Fixed with a module-level `Map<string,GraphNode>` memoized on
`graphNodes` identity — O(1) lookup preserved.

### A.3 Coverage matrix — §12 vs. the four-doc baseline

| §12 finding | Origin | Caught by §11? | Why §11 missed it |
|---|---|---|---|
| 12.2 fetch-timing BLOCKER | T8b / Decision 6 | No | §11 verified Decision 6 was "encoded" (T8a/b/c exist) but did not verify the *precondition* T8b silently assumes. Sequential docs treat "the dialog fetches it" as true-by-construction. |
| 12.3 env override | T1 / Decision 1 | No | §11 confirmed "fail-fast paths" encoded, not that the cwd assumption was *removed* (only moved). |
| 12.4 dead boolean → RESOLVED | T1/T2 / Decision 1 | No | §11 confirmed "boolean dispatch encoded", not that any call site *uses* the boolean. |
| 12.5 schemaVersion dead field | T3 / Decision 2 | No | §11 confirmed "INDEX.yml + never-throw encoded"; the dead field is inside the encoded artifact, invisible to a coverage matrix that checks task-existence not field-semantics. |
| 12.6 popover race + no gate | T6c / Decision 3 | No | §11 confirmed "ref-not-closure encoded"; the *other* race (popover-close) and the *absence* of a CI gate are negative-space findings a coverage matrix cannot represent. |
| 12.7 consolidation | T3+T4+T8a | No | By construction — §11 is within-document; consolidation across tasks is cross-cutting, which sequential rechecks cannot surface. |

This is the structural limit the four-document sequential pipeline cannot cross on
its own. §12 is the cross-cutting pass that crosses it.

---

*End of Appendix A. Return to §11/§12 for normative (executable) content.*

