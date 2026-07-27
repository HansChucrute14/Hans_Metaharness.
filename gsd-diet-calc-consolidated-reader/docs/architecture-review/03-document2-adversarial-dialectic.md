# Document 2 — Dual-Persona Adversarial Dialectic

> **Input**: `01-research.md` + `02-document1-systemic-review.md`.
> **Method**: Structured debate between two personas. Every claim cites a real
> `file:line`. For each major decision: **Option X** (Persona A's surgical
> strike), **Option Y** (Persona B's defensive counter), **Option Z (Union)** =
> the synthesis that keeps A's leverage and B's safety.
>
> **Persona A** — "The Lazy Coding Genius / Ponytail Engineer": ultra-clean,
> high-leverage, hates ceremony, ships the smallest diff that kills the largest
> class of bug.
>
> **Persona B** — "Extremely Adversarial Senior Architecture Engineer": hyper-
> skeptical, hunts race conditions, stale closures, state drift, breaking API
> changes. Reads the diff line-by-line.

---

## Decision 1 — The contracts module (I-1 + I-2 + I-4 consolidation)

### Persona A (Lazy Genius)

> The disease is string literals acting as contracts. Three symptoms —
> `DOCS_DIR` (`docs-parser.ts:5`), `BUG_MAP_PATH` (`dependency-graph.ts:31`), the
> `startsWith("PART-")` heuristics (`docs-parser.ts:65-75`), and 7 scattered
> event literals (`01-research.md §1.2.4`). One file kills all four. Watch:

```ts
// src/lib/contracts.ts  — the whole file, ~70 lines, leaf module
import { z } from "zod";
import path from "path";

// --- path resolution (kills I-1) ---
export const DOCS_DIR = path.resolve(process.cwd(), "consolidated-docs");
export const BUG_MAP_PATH = path.resolve(DOCS_DIR, "BUG-DEPENDENCY-MAP.md");
export function resolveDocPath(fileName: string): string {
  return path.resolve(DOCS_DIR, fileName);
}

// --- doc meta schema (kills I-2) ---
export const DocMeta = z.object({
  file: z.string(),
  type: z.enum(["part", "appendix", "map", "unlisted"]),
  order: z.number().int().min(0),
  title: z.string(),
});
export type DocMetaEntry = z.infer<typeof DocMeta>;

// --- event registry (kills I-4) ---
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

export const CROSS_MODULE_PAYLOADS = {
  [EVT.GraphSynced]: z.object({ generatedAt: z.string() }),
  [EVT.GraphOpenAtNode]: z.object({ id: z.string() }),
  [EVT.DocJumpToOccurrence]: z.object({ id: z.string(), occurrenceIndex: z.number() }),
} as const;

export function dispatchDocEvent<K extends keyof typeof CROSS_MODULE_PAYLOADS>(
  name: K,
  detail: z.infer<(typeof CROSS_MODULE_PAYLOADS)[K]>
): void {
  if (typeof window === "undefined") return;
  const parsed = CROSS_MODULE_PAYLOADS[name].safeParse(detail);
  if (!parsed.success) {
    console.warn(`[contracts] malformed payload for ${name}`, parsed.error.issues);
    return;
  }
  window.dispatchEvent(new CustomEvent(name, { detail: parsed.data }));
}
```

> Then `docs-parser.ts:5` becomes `import { DOCS_DIR } from "@/lib/contracts"`.
> `dependency-graph.ts:31` becomes `import { BUG_MAP_PATH } from "@/lib/contracts"`.
> `doc-store.ts:321` becomes `dispatchDocEvent(EVT.GraphSynced, { generatedAt: body.generatedAt })`.
> Smallest possible diff. Largest possible class of bug killed. Ship it.

### Persona B (Adversarial)

> "Smallest possible diff." Cute. Let me line-audit your "ship it."

**Attack 1 — `path.resolve(process.cwd(), ...)` is not portable across Next.js
runtimes.** `process.cwd()` in a Next.js 16 App Router route handler returns the
*deployed working directory*, which in a serverless function may be `/var/task/`
or read-only. In this sandbox it's `/home/z/my-project`, fine — but you just
re-hardcoded the assumption "the repo root is the cwd". `docs-parser.ts:5` was at
least honest about being absolute. Yours *looks* portable and isn't. Worse:
**`BUG_MAP_PATH` is read at module-load** (`dependency-graph.ts:460` calls
`readFileSync(BUG_MAP_PATH)` inside `getDependencyGraph`, but the const is
evaluated at import time). If a test imports `contracts.ts` from a different
cwd, `BUG_MAP_PATH` is wrong and you won't know until the first `readFileSync`
throws `ENOENT` deep inside a request.

**Attack 2 — `dispatchDocEvent` swallows malformed payloads with a `console.warn`.**
`doc-store.ts:321` today dispatches `graph:synced` unconditionally. Your version
validates and **silently drops** on failure. The `dependency-graph.tsx:2323`
listener never fires, the graph never re-fetches, and the user sees a stale
graph with no error. That's a *worse* failure mode than today's untyped dispatch
— at least today a wrong-shape payload still triggers the listener (the handler
just reads `detail.generatedAt` and gets `undefined`, which
`dependency-graph.tsx:2282` already handles). You've turned a soft failure into
a silent no-op.

**Attack 3 — `EVT` as `as const` keys break the moment someone adds a new event
without updating `CROSS_MODULE_PAYLOADS`.** `dispatchDocEvent`'s `K extends
keyof typeof CROSS_MODULE_PAYLOADS` — fine. But the 4 intra-module events
(`DocJump`, `DocJumpTo`, `AnnotationClicked`, `AnnotationsUpdated`) are *still
dispatched as raw `window.dispatchEvent(new CustomEvent(EVT.DocJump, ...))`.
You've now got **two dispatch patterns** in the codebase. A maintainer (or agent)
reading `doc-store.ts:66` sees `signalDocJump()` use raw dispatch, and
`syncDependencyGraph` use `dispatchDocEvent`. Inconsistent. Cognitive overhead
*increased*, not decreased.

**Attack 4 — the `DocMeta` schema has no enforcement.** You defined it but
`docs-parser.ts:65-75` still has the `startsWith` heuristics. Where does the
`DocMeta` actually get *populated*? You didn't touch the parser. The schema is
dead code until something reads an `INDEX.yml` and parses it. Your diff is
incomplete — you showed the contracts file but not the parser change. That's
the hard part, and you skipped it.

### Option X (Persona A, refined)

A concedes Attacks 1, 2, 3 are real but argues they're fixable in the same diff:

```ts
// Attack 1 fix: resolve lazily, not at import
export function getDocsDir(): string {
  return path.resolve(process.cwd(), "consolidated-docs");
}
export function getBugMapPath(): string {
  return path.resolve(getDocsDir(), "BUG-DEPENDENCY-MAP.md");
}
// dependency-graph.ts:460  readFileSync(getBugMapPath(), "utf-8")

// Attack 2 fix: don't swallow — throw in dev, warn in prod
if (!parsed.success) {
  if (process.env.NODE_ENV !== "production") {
    throw new Error(`[contracts] malformed payload for ${name}: ${JSON.stringify(parsed.error.issues)}`);
  }
  console.warn(...);
  return;
}

// Attack 3 fix: route ALL dispatches through one helper, two arities
export function dispatchDocEvent(name: EventName): void;                          // no-payload
export function dispatchDocEvent<K extends keyof typeof CROSS_MODULE_PAYLOADS>(    // validated payload
  name: K, detail: z.infer<(typeof CROSS_MODULE_PAYLOADS)[K]>
): void;
export function dispatchDocEvent(name: EventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType>)[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) { /* dev-throw / prod-warn */ return; }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
```

A: "Attack 4 (parser change) is a separate decision — see Decision 2. The
contracts module is the foundation; the parser consumes it. Don't conflate."

### Option Y (Persona B, defensive)

B: "I don't trust lazy `process.cwd()` resolution either — it moves the failure
from import-time to request-time, which is *later* (worse for debugging). And
your dev-throw is a footgun: a malformed event payload in dev crashes the page.
Events are not assertions. I want:

```ts
// Attack 1 (B's version): validate ONCE at server boot, fail fast.
// src/lib/contracts.ts
let _docsDirValidated = false;
export function getDocsDir(): string {
  const dir = path.resolve(process.cwd(), "consolidated-docs");
  if (!_docsDirValidated) {
    if (!existsSync(dir)) {
      throw new Error(`DOCS_DIR does not exist: ${dir} (cwd=${process.cwd()})`);
    }
    _docsDirValidated = true;
  }
  return dir;
}

// Attack 2 (B's version): NEVER swallow, NEVER throw in a dispatch hot-path.
// Return a boolean; let the caller decide.
export function dispatchDocEvent(name: EventName, detail?: unknown): boolean {
  if (typeof window === "undefined") return false;
  const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType>)[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      console.error(`[contracts] REJECTED malformed payload for ${name}`, parsed.error.issues);
      return false;  // caller can toast/throw/ignore
    }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return true;
}
```

B: "And Attack 3 — I want ONE dispatch path. No raw `window.dispatchEvent(new
CustomEvent(...))` anywhere outside `contracts.ts`. The 4 intra-module events
get no-payload `dispatchDocEvent(EVT.DocJump)`. Consistency over cleverness."

### Option Z (Union — the synthesis)

**Keep A's `as const` registry shape (compact, readable). Keep B's fail-fast
boot validation + boolean-returning dispatch + single-dispatch-path rule.**

```ts
// src/lib/contracts.ts
import { z } from "zod";
import path from "path";
import { existsSync } from "fs";

export const EVT = { /* A's registry */ } as const;
export type EventName = (typeof EVT)[keyof typeof EVT];
export const CROSS_MODULE_PAYLOADS = { /* A's 3 cross-module payloads */ } as const;

// B's fail-fast path resolution
let _docsDir: string | null = null;
export function getDocsDir(): string {
  if (_docsDir) return _docsDir;
  const dir = path.resolve(process.cwd(), "consolidated-docs");
  if (!existsSync(dir)) {
    throw new Error(`DOCS_DIR missing: ${dir} (cwd=${process.cwd()}). Run from repo root.`);
  }
  _docsDir = dir;
  return dir;
}
export function getBugMapPath(): string { return path.resolve(getDocsDir(), "BUG-DEPENDENCY-MAP.md"); }
export function resolveDocPath(fileName: string): string { return path.resolve(getDocsDir(), fileName); }

// B's boolean-returning single dispatch path
export function dispatchDocEvent(name: EventName, detail?: unknown): boolean {
  if (typeof window === "undefined") return false;
  const schema = (CROSS_MODULE_PAYLOADS as Record<string, z.ZodType> | undefined)?.[name];
  if (schema && detail !== undefined) {
    const parsed = schema.safeParse(detail);
    if (!parsed.success) {
      console.error(`[contracts] rejected ${name}`, parsed.error.issues);
      return false;
    }
    detail = parsed.data;
  }
  window.dispatchEvent(new CustomEvent(name, { detail }));
  return true;
}

// B's rule: ALL `window.dispatchEvent(new CustomEvent(...))` calls outside this
// file are banned. Enforced by an eslint rule (Doc 3 §4.2).
```

**Z verdict**: A's leverage (one file, typed registry) + B's safety (fail-fast,
boolean dispatch, single path). The `eslint` ban on raw dispatch is the
enforcement mechanism that prevents the "two patterns" drift A's original had.

---

## Decision 2 — The doc registry (I-2 parser change)

### Persona A

> `INDEX.yml` is the move (`02-document1-systemic-review.md §2.2.3 Option Z`).
> Parser reads it, validates with `DocMeta`, auto-discovers unlisted `.md` files.
> Diff:

```ts
// docs-parser.ts — replace lines 65-75
import { DocMeta, resolveDocPath, getDocsDir } from "@/lib/contracts";
import { readFileSync, readdirSync } from "fs";
import { load as yamlLoad } from "js-yaml";

function loadDocRegistry(): DocMetaEntry[] {
  const indexPath = resolveDocPath("INDEX.yml");
  const raw = readFileSync(indexPath, "utf-8");
  const parsed = yamlLoad(raw) as { docs: unknown[] };
  const entries = parsed.docs.map((d) => DocMeta.parse(d));  // throws on bad entry
  // auto-discover unlisted
  const listed = new Set(entries.map((e) => e.file));
  const all = readdirSync(getDocsDir()).filter((f) => f.endsWith(".md"));
  for (const f of all) {
    if (!listed.has(f)) entries.push({ file: f, type: "unlisted", order: 999, title: f.replace(/\.md$/, "") });
  }
  return entries.sort((a, b) => a.order - b.order);
}
```

> `INDEX.yml` is one new file, 10 entries. Ship.

### Persona B

**Attack 1 — `DocMeta.parse(d)` throws on a bad entry, taking down the whole
`/api/docs` route.** Today `startsWith` is forgiving; a misnamed file just gets
a default type. Your version: one typo in `INDEX.yml` (e.g. `order: "1"` instead
of `order: 1`) and the entire doc list 500s. Fail-closed for the *graph* is
correct (`dependency-graph.ts:495`); fail-closed for the *doc list* is
catastrophic — the user sees a blank page.

**Attack 2 — auto-discovery of unlisted files leaks drafts.** A maintainer
drops `WIP-Roadmap.md` in the dir; your parser happily lists it as
`type: "unlisted"`. The doc-reader sidebar (`doc-sidebar.tsx`) renders it. Now
there's a half-written doc in production. The "lazy-safe" property you claimed
in Doc 1 §2.2.3 is actually a leak.

**Attack 3 — `INDEX.yml` and the actual files can drift.** You validate that
every `.md` is either listed or auto-discovered, but you do NOT validate that
every `INDEX.yml` entry points to a file that *exists*. A typo `fil: PART-1.md`
(yaml key typo) silently lists a phantom entry that 404s when clicked.

### Option X (A, refined)

A concedes 1 and 3, disputes 2: "Unlisted files rendering is *the feature* —
that's how a maintainer notices they forgot to classify it. But fine, gate it
behind `NODE_ENV !== 'production'`."

```ts
// Attack 1: collect errors, don't throw
function loadDocRegistry(): { entries: DocMetaEntry[]; errors: string[] } {
  const raw = readFileSync(resolveDocPath("INDEX.yml"), "utf-8");
  const parsed = yamlLoad(raw) as { docs: unknown[] };
  const entries: DocMetaEntry[] = [];
  const errors: string[] = [];
  for (const d of parsed.docs) {
    const r = DocMeta.safeParse(d);
    if (r.success) entries.push(r.data);
    else errors.push(`${JSON.stringify(d)}: ${r.error.issues.map(i => i.message).join("; ")}`);
  }
  // Attack 3: validate existence
  for (const e of entries) {
    if (!existsSync(resolveDocPath(e.file))) errors.push(`INDEX.yml references missing file: ${e.file}`);
  }
  // Attack 2: unlisted only in dev
  if (process.env.NODE_ENV !== "production") {
    const listed = new Set(entries.map((e) => e.file));
    for (const f of readdirSync(getDocsDir()).filter((f) => f.endsWith(".md"))) {
      if (!listed.has(f)) entries.push({ file: f, type: "unlisted", order: 999, title: f.replace(/\.md$/, "") });
    }
  }
  return { entries: entries.sort((a, b) => a.order - b.order), errors };
}
```

### Option Y (B)

B: "Better, but you're returning `{ entries, errors }` — who consumes `errors`?
The `/api/docs` route has to decide: 500? 200-with-warnings? You've pushed the
policy decision into every caller. I want the parser to attach errors as
metadata on the response, and the UI to render a non-blocking banner. And
'unlisted in dev only' is still a leak if someone runs `next build` then `next
start` — `NODE_ENV` is `production` in both. Use an explicit `DOCS_DEV_MODE`
env var."

### Option Z (Union)

**A's error-collection + B's explicit env var + B's metadata-on-response.**

- Parser returns `{ entries, errors }`. Never throws.
- `/api/docs` route returns `{ files: entries, warnings: errors }`. 200 always
  (unless `INDEX.yml` itself is unreadable — that's a 500).
- `doc-sidebar.tsx` renders `warnings` as a dismissible amber banner.
- Auto-discovery gated on `process.env.DOCS_DEV_MODE === "1"` (explicit, not
  inferred from `NODE_ENV`).

**Z verdict**: A's compactness, B's never-throw + explicit-gate. The banner
makes drift *visible* rather than silent — the same principle as the bug-facts
bridge (measurable signals beat guesses).

---

## Decision 3 — The monolith split (I-5)

### Persona A

> Three phases (`02-document1-systemic-review.md §2.3.3 Option Z`). Phase A
> (stateless legend/lane) is free. Phase B (toolbar) is one component. Phase C
> (canvas) is the hard one. Show me the canvas extraction and I'll show you it's
> safe:

```tsx
// src/components/docs/graph/graph-canvas.tsx
export function GraphCanvas({ nodes, edges, onNodeClick }: {
  nodes: GraphNode[]; edges: GraphEdge[]; onNodeClick: (id: string) => void;
}) {
  const viewport = useGraphViewport();  // owns pan/zoom state, hoisted to a hook
  return (
    <svg onWheel={viewport.onWheel} onPointerDown={viewport.onPointerDown} ...>
      {edges.map(e => <GraphEdgeView key={...} edge={e} viewport={viewport} />)}
      {nodes.map(n => <GraphNodeView key={n.id} node={n} viewport={viewport} onClick={() => onNodeClick(n.id)} />)}
    </svg>
  );
}

// useGraphViewport owns: scale, translateX, translateY, isPanning
// (moved verbatim from dependency-graph.tsx:1402-1403, 2604, 2963-2965)
```

> The orchestrator shrinks to ~600 lines. Each child is <400. Ship.

### Persona B

**Attack 1 — `useGraphViewport` captures `nodes`/`edges` in closures you haven't
shown.** The wheel-zoom handler at `dependency-graph.tsx:2604` calls
`svg.addEventListener("wheel", handler, { passive: false })` inside a
`useEffect` with `[]` deps. If `handler` closes over `nodes` (to compute
node-under-cursor for zoom-to-cursor), moving it to a hook with empty deps
freezes `nodes` at first render. Every subsequent sync (new `nodes` array) is
invisible to the zoom logic. **Stale closure. The #1 way React splits break.**
You hand-waved "moved verbatim" — that's exactly the bug.

**Attack 2 — `onNodeClick` prop-drilling.** The orchestrator passes
`onNodeClick` to `GraphCanvas`, which passes it to `GraphNodeView`. But the
detail popover (`dependency-graph.tsx:2963` global click listener) also needs to
*close* on node-click. If `GraphCanvas` calls `onNodeClick(id)` and the
orchestrator opens the popover, the global click listener at `:2963` (which is
in the orchestrator, for "click outside to close") fires on the *same* event and
immediately closes it. Today this works because the listener is registered with
`capture: true` and stops propagation. After the split, the capture listener is
in the orchestrator but the click originates in the child — event-ordering
changes. **Popover opens then instantly closes.**

**Attack 3 — Phase A "stateless" claim is wrong.** `GraphLegend`
(`dependency-graph.tsx` legend JSX) reads `lanes` from the graph data, but it
ALSO reads `graphSyncStatus` to show a "syncing..." indicator on the legend
badge. Not stateless. Extracting it as pure-props means prop-drilling
`graphSyncStatus` — or you use `useDocStore` directly inside it (fine, but then
it's not "stateless", it's "stateful-via-store", and your verifiable claim
"visual diff = none" needs a re-check because the subscription timing changes).

### Option X (A, refined)

A concedes all three: "Attack 1 — the wheel handler must take `nodes` via a ref,
not a closure. `useGraphViewport(nodesRef)`. Attack 2 — the capture listener
stays in the orchestrator; `GraphCanvas` calls `onNodeClick` via a
`stopPropagation`'d synthetic event. Attack 3 — `GraphLegend` uses
`useDocStore` directly; I retract 'stateless', call it 'store-backed'. The
visual-diff claim still holds because the subscription is identical."

### Option Y (B)

B: "Your refinements are correct but they're *exactly the hard work*. 'Use a
ref' is a one-line fix that's also a one-line bug if the ref isn't updated in a
`useEffect` with the right deps. I want Phase C *gated behind a feature flag*
and shipped dark for one session:

```tsx
// dependency-graph.tsx orchestrator
const USE_SPLIT_CANVAS = process.env.NEXT_PUBLIC_GRAPH_SPLIT === "v1";
{USE_SPLIT_CANVAS ? <GraphCanvas .../> : <LegacyCanvas .../>}
```

Run both in dev, diff the DOM. If identical for a full click-through, flip the
flag. Delete `LegacyCanvas` a week later. Until then, the monolith is the
fallback."

### Option Z (Union)

**A's extraction + B's feature-flag gate + B's ref-not-closure rule, codified.**

- Phase A: `GraphLegend` (store-backed, not stateless — A's concession). Risk: minimal. Ship ungated.
- Phase B: `GraphToolbar` (own state + `useDocStore`). Risk: low. Ship ungated.
- Phase C: `GraphCanvas` + `useGraphViewport(nodesRef)`. Risk: medium. **Ship behind `NEXT_PUBLIC_GRAPH_SPLIT=v1` flag.** Orchestrator keeps `LegacyCanvas` (the current inline JSX, untouched) as fallback. DOM-diff in dev for one session. Flip default. Delete legacy.

**Z verdict**: A's structure, B's safety rail. The feature flag is the
"empirical signal" (same principle as the bug-facts bridge): ship-dark, verify
DOM-identical, then commit. Solo-maintainer-verifiable.

---

## Decision 4 — Schema-migration scaffold (I-6)

### Persona A

> Scaffold the hook, don't populate it (`02-document1-systemic-review.md §2.4.3
> Option Z`). 50 lines:

```ts
// dependency-graph.ts — replace line 114
const v1_0_0 = graphSourceSchema;  // existing schema, schemaVersion: literal "1.0.0"
const v1_1_0 = v1_0_0.extend({ schemaVersion: z.literal("1.1.0") }).extend({
  nodes: z.array(nodeSchema.extend({ priorityScore: z.number().min(0).max(100).default(0) })),
});
type VersionedSource = z.infer<typeof v1_0_0> | z.infer<typeof v1_1_0>;
const MIGRATORS: Record<string, (s: any) => any> = { /* empty for now */ };
export const CURRENT_SCHEMA_VERSION = "1.0.0";
function migrate(s: any): any {
  let cur = s;
  while (cur.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const step = MIGRATORS[cur.schemaVersion];
    if (!step) throw new GraphValidationError([{ path: "schemaVersion", message: `no migrator from ${cur.schemaVersion}` }]);
    cur = step(cur);
  }
  return cur;
}
```

> Hook exists. First real migration (when someone needs v1.1.0) follows the
> pattern. Ship.

### Persona B

**Attack 1 — `MIGRATORS: Record<string, (s: any) => any>` is `any` in, `any`
out.** You scaffolded a hook that's *less* typed than the current code. The
first person to populate it has no compile-time check that their migrator
produces the right shape. You've created the exact footgun Doc 1 §2.4.3 Option X
was rejected for — and then "fixed" it by... still using `any`. The scaffold is
worse than nothing: it invites untyped migrations.

**Attack 2 — `while (cur.schemaVersion !== CURRENT)` infinite-loops on a
migrator that doesn't bump the version.** A migrator that transforms the data
but forgets `cur.schemaVersion = "1.1.0"` runs forever. In a request handler.
On the sync endpoint. The 422 never returns; the client's `graphSyncStatus`
stays "syncing" forever (`doc-store.ts:305`).

**Attack 3 — `v1_1_0` is defined but never used (no migrator populates it).**
Dead code. A solo maintainer sees `v1_1_0` in the file, wonders "is this live?",
wastes 10 minutes. The scaffold has negative value until populated.

### Option X (A, refined)

A: "Attack 1 — make the migrator map typed:

```ts
const MIGRATORS = {
  "1.0.0": { from: v1_0_0, to: v1_1_0, fn: (s: z.infer<typeof v1_0_0>): z.infer<typeof v1_1_0> => ({ ...s, schemaVersion: "1.1.0", nodes: s.nodes.map(n => ({ ...n, priorityScore: n.severity === "P0" ? 100 : 0 })) }) },
} as const;
```
Attack 2 — add a max-iterations guard. Attack 3 — don't define `v1_1_0` until
it's needed; the scaffold is JUST the `migrate()` function + the
`CURRENT_SCHEMA_VERSION` export."

### Option Y (B)

B: "A scaffold with no users is YAGNI. Don't write `migrate()` until there's a
v1.1.0. When someone needs it, they write the migrator + the test in the same
PR. Pre-scaffolding is ceremony. The solo-maintainer rule says eliminate
unnecessary abstractions — this is one."

### Option Z (Union)

**Defer entirely.** B is right that an unused scaffold is dead code. A is right
that the *pattern* should be documented so the future migrator follows it.

- **No code change.** `schemaVersion: z.literal("1.0.0")` stays.
- **Add a 15-line comment block** above line 114 documenting the migration
  pattern (typed migrator map, max-iterations guard, fail-closed) so the future
  implementer doesn't reinvent it.
- **Re-open as a real task** the moment a v1.1.0 is needed.

**Z verdict**: B's "no dead code" + A's "document the pattern". The comment is
the scaffold; the code stays lean. This is the most solo-maintainer-friendly
outcome.

---

## Decision 5 — Dry-run validate endpoint (I-7)

### Persona A

> `POST /api/dependency-graph/validate` (`02-document1-systemic-review.md §2.5.3
> Option Z`). Body optional. ~45 lines, mirrors sync minus the cache write:

```ts
// src/app/api/dependency-graph/validate/route.ts
export async function POST(request: Request) {
  if (!rateLimit(request, 20)) return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429 });
  let yamlText: string;
  let source: "body" | "disk";
  const body = await request.json().catch(() => null);
  if (body?.yaml) { yamlText = body.yaml; source = "body"; }
  else { yamlText = extractGraphDataBlock(readFileSync(getBugMapPath(), "utf-8")); source = "disk"; }
  try {
    const parsed = parseGraphSource(yamlText);  // pure, no cache mutation
    return NextResponse.json({ ok: true, source, nodeCount: parsed.nodes.length, edgeCount: parsed.edges.length, schemaVersion: parsed.schemaVersion });
  } catch (e) {
    if (e instanceof GraphValidationError) return NextResponse.json({ ok: false, source, issues: e.issues }, { status: 422 });
    return NextResponse.json({ ok: false, source, error: String(e) }, { status: 500 });
  }
}
```

> `parseGraphSource` (`dependency-graph.ts:280`) is already pure — no cache
> touch. Ship.

### Persona B

**Attack 1 — `await request.json().catch(() => null)` swallows malformed JSON
silently.** A body of `{yaml: "` (truncated) becomes `null`, and you fall
through to the disk-read branch. The agent thinks it validated its proposed
YAML; actually it validated the on-disk file. **Worst-case: agent ships a broken
edit believing it passed validation.**

**Attack 2 — no body-size limit.** An agent (or attacker) POSTs a 50MB YAML
body. `request.json()` buffers the whole thing into memory. The rate limiter
(`api-utils.ts:34`) counts *requests*, not *bytes*. Cheap memory-exhaustion DoS
on a route that's *more* expensive than `GET` (it runs the full zod parse).

**Attack 3 — `source` in the response is information the agent didn't ask for
and might misread.** If the agent sends a body but the JSON parse fails (Attack
1), the response says `source: "disk"`, `ok: true`. The agent reads `ok: true`
and proceeds. The `source` field is buried in the JSON. Agents read `ok` first.

### Option X (A, refined)

A: "Attack 1 — distinguish 'no body' from 'bad body':

```ts
const text = await request.text();
let yamlText: string, source: "body" | "disk";
if (text.length === 0) { yamlText = extractGraphDataBlock(readFileSync(getBugMapPath(), "utf-8")); source = "disk"; }
else {
  source = "body";
  let body: any;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, source, error: "invalid JSON body" }, { status: 400 }); }
  if (typeof body?.yaml !== "string") return NextResponse.json({ ok: false, source, error: "body must have { yaml: string }" }, { status: 400 });
  yamlText = body.yaml;
}
```
Attack 2 — cap `text.length` at 256KB before parsing. Attack 3 — on body-mode
fallback-to-disk, return 400, never silently validate disk."

### Option Y (B)

B: "Two separate routes is clearer than one overloaded route. `POST /validate`
requires a body (the agent's proposed YAML). `GET /validate` re-validates disk.
No ambiguity, no `source` field, no fallback footgun. The `?dry-run` query-param
version was rejected in Doc 1 §2.5.3 Option Y for overloading sync — the same
logic rejects overloading validate."

### Option Z (Union)

**A's body-parsing safety + B's two-verb split.**

- `POST /api/dependency-graph/validate` — **requires** `{ yaml: string }` body.
  400 if missing/malformed. Caps body at 256KB. Returns `{ ok, nodeCount,
  edgeCount }` or `{ ok: false, issues[] }`.
- `GET /api/dependency-graph/validate` — no body. Re-validates the on-disk file.
  Same response shape. Useful for "did my manual edit break anything?".
- No `source` field — the verb IS the source. An agent can't misread.

**Z verdict**: A's hardening + B's REST clarity. Two routes, each one job. The
agent loop is now unambiguous: `POST /validate` (proposed edit) → on `ok`, `POST
/sync` (apply).

---

## Decision 6 — bug-facts bridge (I-3)

### Persona A

> Three-step bridge (`02-document1-systemic-review.md §2.6.3 Option Z`). The
> bridge is the clever part — `BUG_FACTS` becomes a read-through:

```ts
// bug-facts.ts — replace the static export
let _graphFacts: Record<string, BugFact> | null = null;
let _fallbackHits = 0;
export const BUG_FACTS = new Proxy({} as Record<string, BugFact>, {
  get(_t, id: string) {
    if (_graphFacts === null) _graphFacts = fetchGraphFactsSync();  // memoized
    if (_graphFacts[id]) return _graphFacts[id];
    _fallbackHits++;
    return FALLBACK_FACTS[id];  // the old hardcoded entries
  },
});
export function getFallbackHitCount() { return _fallbackHits; }
```

> Zero fallback hits over a dev session = YAML complete. Delete `FALLBACK_FACTS`.
> Ship.

### Persona B

**Attack 1 — `fetchGraphFactsSync()` is a synchronous HTTP call.** There is no
synchronous `fetch` in the browser. `bug-facts.ts` is imported by `doc-reader.tsx`
(a client component) for popovers. Your `Proxy` get-trap calls
`fetchGraphFactsSync` on first access — which is during a React render. You've
just made a synchronous XHR (deprecated, blocks the main thread) or you've
thrown. Either way, the popover hangs the UI.

**Attack 2 — `_fallbackHits` counter has no telemetry.** "Zero hits over a dev
session" requires the maintainer to *remember* to check
`getFallbackHitCount()`. They won't. The signal exists but is invisible.

**Attack 3 — `Proxy` on a `Record` breaks `Object.keys(BUG_FACTS)`.** Any caller
that iterates `BUG_FACTS` (e.g. a "list all bug facts" debug view) gets an empty
array, because the Proxy's `ownKeys` trap isn't defined. Silent breakage of a
feature you didn't know existed.

### Option X (A, refined)

A: "Attack 1 — fair, sync fetch is impossible. Make `BUG_FACTS` async: change
the popover to `useBugFact(id)` hook that fetches from `/api/dependency-graph`
(or reads the already-fetched graph from the store). The hardcoded `FALLBACK_FACTS`
stays as a synchronous fallback for the hook's initial render. Attack 2 —
expose the hit count via `GET /api/dependency-graph/validate` (Decision 5) as
`fallbackHits`. Attack 3 — define `ownKeys` on the Proxy, or just don't Proxy;
use a function `getBugFact(id)` instead of a record."

### Option Y (B)

B: "The bridge is over-engineered. The *real* fix is: populate the YAML
completely (a one-time transcription), then delete `bug-facts.ts` and point the
two call sites at `node.subsystem`/`node.oneLiner`/etc from the already-fetched
graph payload. The graph is ALREADY in the store (the dialog fetches it). The
popover just needs to look up `node` by id in the existing payload. No bridge,
no Proxy, no async hook, no hit counter. One PR: populate YAML + delete file +
update 2 call sites. Verifiable by: does the popover show data for every node?
If yes, done."

### Option Z (Union)

**B's "just populate and delete" as the primary path + A's hit-counter as the
*verification* mechanism, not a runtime bridge.**

- **No Proxy, no async hook, no runtime fallback.**
- Step 1: write a one-shot dev script `scripts/check-bug-facts-coverage.ts` that
  diffs `bug-facts.ts` keys against the YAML's `nodes[].id` and reports which
  nodes are missing `subsystem`/`oneLiner`/etc. Run it. Fix the YAML until it
  reports 0 missing.
- Step 2: update the 2 `BUG_FACTS` call sites to read from the graph payload
  (already in the store via the dialog's fetch — expose it as a `useDocStore`
  selector or a lightweight `useGraphNode(id)` hook).
- Step 3: delete `bug-facts.ts`.
- The "empirical signal" is the dev script's output (0 missing), not a runtime
  counter. Cleaner, no runtime cost, no Proxy footguns.

**Z verdict**: B's directness + A's verifiability. The dev script is the
"bridge" — it runs once, proves completeness, then is deleted. No runtime
complexity survives.

---

## Cross-cutting synthesis (feeds Doc 3)

| Decision | Z verdict (one line) | Doc 3 section |
|---|---|---|
| 1 — contracts module | One file, fail-fast paths, boolean dispatch, eslint-ban raw dispatch | §3.1 |
| 2 — doc registry | `INDEX.yml` + never-throw parser + `DOCS_DEV_MODE` gate + warnings banner | §3.2 |
| 3 — monolith split | Phase A+B ungated, Phase C behind `NEXT_PUBLIC_GRAPH_SPLIT=v1` flag, ref-not-closure | §3.3 |
| 4 — schema migration | **Defer.** Comment-only scaffold. No code. | §3.4 (no-op) |
| 5 — validate endpoint | `POST` (body, 256KB cap, 400 on bad JSON) + `GET` (re-validate disk). No `source` field. | §3.5 |
| 6 — bug-facts | Dev-script verification + populate YAML + delete file. No runtime bridge. | §3.6 |

---

*End of Document 2. Per the workflow rule: **re-check `01-research.md` and
`02-document1-systemic-review.md` for gaps** before writing Document 3.*

---

## Recheck amendment (added after the §12 cross-cutting pass on Doc 4)

`04-document3 §12` is a fifth, *cross-cutting* recheck that spans task
boundaries this sequential debate structurally cannot. Per the workflow rule,
its findings propagate back through the 6 decisions. **This is the most
consequential back-propagation in the audit chain**: Decision 6's Union
verdict contains a premise that §12.2 proved false at render time, and
Decisions 1, 2, 3, 4, 5 each have a gap the adversarial debate did not close.
Recorded here so Document 3 inherits the §12-revised verdicts, not the
originals.

### Decision 1 (contracts module) — two gaps the debate missed

**Gap 1 — Persona B's `process.cwd()` Attack 1 was right but under-specified.**
B's Attack 1 (lines 90-100) correctly flagged `path.resolve(process.cwd(),
...)` as "looks portable and isn't". The Union verdict (Option Z, lines
231-241) adopted B's "fail-fast boot validation + lazy resolution" — moving
the failure from import-time to first-call-time. But **neither persona
proposed an env-var override**, which is the actual portability fix. §12.3
adds `process.env.DOCS_DIR` *before* the `process.cwd()` fallback. The Union
verdict's "fail-fast paths" framing is preserved; the path it resolves is
now overridable without code changes. B's attack was necessary but not
sufficient — B identified the disease (cwd assumption), §12.3 supplies the
cure (env var).

**Gap 2 — the boolean return is a dead contract.** Persona B's Option Y
(lines 194-209) introduced `dispatchDocEvent(...): boolean` with the explicit
rationale "let the caller decide" (line 203). The Union verdict (lines
245-259) adopted this. §12.4 verified that **no T2 call site reads the
boolean** — the "caller can decide" decision point is never exercised. The
debate secured the *type signature* but not a single *consumer*. §12.4
mandates: wire at least one call site (Option A — `syncDependencyGraph`
surfaces an error on `false`) or drop the boolean (Option B — `void`). B's
"caller can decide" was a contract without a contractee.

**Net effect on Decision 1**: the Union verdict (one file, fail-fast paths,
boolean dispatch, eslint-ban) **stands**, with two sharpenings: (a) the path
is env-var-overridable (§12.3), (b) the boolean is load-bearing or removed
(§12.4). Neither persona's *leverage* is lost; both are *completed*.

### Decision 2 (doc registry) — two gaps the debate missed

**Gap 1 — Persona B Attack 3's `existsSync` check is case-insensitive.** B's
Attack 3 (lines 317-320) correctly caught "INDEX.yml entry points to a file
that doesn't exist" and the Union verdict (line 342) added `existsSync`.
But `existsSync` is **case-insensitive on default macOS FS** — a maintainer's
`part-1-...` typo resolves locally and 404s on a case-sensitive Linux CI.
Neither persona caught this; both treated `existsSync` as a precise
existence oracle. §12.5 mandates an exact-case `readdirSync` comparison
after `existsSync`. B's attack was necessary; §12.5 closes the
case-sensitivity door B didn't know was open.

**Gap 2 — the `schemaVersion` field is dead.** The Union verdict's
`INDEX.yml` (Doc 3 T3.1 line 210) declares `schemaVersion: "1.0.0"`, but
`loadDocRegistry()` (Doc 3 T3.2) never reads it. This is the *exact*
"versioned field with zero enforcement" anti-pattern that Decision 4's
Persona B (Attack 1, lines 513-518) used to reject the graph-schema scaffold.
The debate caught the anti-pattern in Decision 4 but **not when the same
anti-pattern recurred in Decision 2's own artifact** — because the two
decisions were debated sequentially, not cross-cuttingly. §12.5 mandates a
top-level `DocRegistry` zod schema so the field is load-bearing. This is the
structural blind spot §12 exists to cross: B's Decision-4 critique should
have been retroactively applied to Decision 2's `INDEX.yml`, but a
sequential debate has no mechanism to do so.

**Net effect on Decision 2**: the Union verdict (`INDEX.yml` + never-throw +
`DOCS_DEV_MODE` + warnings banner) **stands**, with two hardenings: exact-
case reference gate (§12.5) and `schemaVersion` enforcement via `DocRegistry`
schema (§12.5). Plus the `validateRegistry<T>()` consolidation (§12.7) that
unifies Decision 2's `{entries,warnings}` shape with Decision 5's and Decision
6's T8a script.

### Decision 3 (monolith split) — two gaps the debate missed

**Gap 1 — the popover-close race "fix" is hand-waved.** Persona B Attack 2
(lines 422-431) identified the opens-then-instantly-closes risk precisely.
Persona A's refined Option X (lines 441-448) proposed "`GraphCanvas` calls
`onNodeClick` via a `stopPropagation`'d synthetic event", and the Union
verdict (Doc 3 T6c line 600) adopted this. But `stopPropagation` relies on
**capture-phase listener ordering across a component boundary** — the same
implicit coupling the split exists to kill. B identified the race; A's fix
papers it over with propagation control that is fragile to future changes in
listener registration order. §12.6 mandates a `target.closest('[data-graph-
node]')` guard in the click-outside handler instead: the decision is made on
the event *target*, not on which listener fired *first*. This removes the
ordering dependency entirely. B's attack was necessary; §12.6 supplies a
more robust fix than A's.

**Gap 2 — no repeatable regression gate.** The Union verdict (Doc 3 T6c
verification, lines 610-625) is a one-time agent-browser screenshot diff.
Persona B's Option Y (lines 450-465) proposed the feature-flag gate
("DOM-diff in dev for one session, then flip") — adopted in the Union
verdict. But B's "DOM-diff for one session" is a **one-time** verification
that ages out the moment `LegacyCanvas` is deleted (T6c step 5 follow-up).
After deletion, **no test** catches a future stale-closure regression in
`useGraphViewport` — the precise bug B's Attack 1 (lines 413-420) was about.
B defended against the *initial* regression but not against *future*
regressions of the same class. §12.6 mandates a Playwright
snapshot+interaction test (`e2e/graph-canvas.spec.ts`) as a repeatable CI
gate. Do not delete `LegacyCanvas` until it is green on `v1`.

**Net effect on Decision 3**: the Union verdict (3-phase, Phase C flagged,
ref-not-closure) **stands**, with two hardenings: target-check popover fix
(§12.6) and Playwright regression gate (§12.6). B's feature-flag insight is
preserved; it is now backed by a durable test, not a one-time diff.

### Decision 4 (schema migration) — the lesson recurred in Decision 2

The Union verdict (lines 550-563, "defer entirely, comment-only") **stands
unchanged** for the graph schema. §12.5 does not re-reverse it. But §12.5
surfaces a **meta-finding**: the *lesson* of Decision 4 — "don't ship a
versioned field without enforcement" (Persona B Attack 1, lines 513-518) —
was **not applied to Decision 2's `INDEX.yml`**, which ships exactly such a
field. The sequential debate let Decision 4's critique live in Decision 4
and Decision 2's artifact live in Decision 2; nothing cross-checked them.

**Net effect on Decision 4**: the defer verdict stands. The *lesson* is now
applied retroactively to Decision 2 (per the Decision 2 gap 2 above). This
is not a change to Decision 4's verdict — it is an expansion of its *scope*.
The decision's own logic demanded the INDEX.yml fix; the sequential
structure prevented that demand from being heard.

### Decision 5 (validate endpoint) — consolidation the debate couldn't surface

The Union verdict (lines 641-654, two-verb split, no `source` field)
**stands**. §12.7 does not change it. But §12.7 surfaces a consolidation the
debate structurally could not: the *result shape* of Decision 5's endpoint
(`{ok,nodeCount,edgeCount}`/`{ok:false,issues}`), Decision 2's
`loadDocRegistry()` (`{entries,warnings}`), and Decision 6's T8a coverage
script (stdout+exit-code) are **three near-identical-but-not-identical
contracts** for "validate a declarative registry against real references,
with a warning path". An agent reasoning about the system learns three
shapes where one would do.

This is not a Persona A vs Persona B disagreement either persona could have
raised — it is a *cross-decision* pattern visible only from above the
decision boundary. §12.7 mandates a shared `validateRegistry<T>()` returning
`RegistryResult<T> = {entries, warnings, ok}`, consumed by all three. The
Decision 5 verdict's "two verbs, no `source` field" removed the within-
decision misread footgun; §12.7 removes the across-decisions
three-shapes footgun.

**Net effect on Decision 5**: the two-verb split stands; the result shape is
unified with Decision 2 and Decision 6's T8a via `validateRegistry<T>()`.

### Decision 6 (bug-facts) — the Union verdict's premise is FALSE (§12.2 BLOCKING)

This is the most consequential back-propagation. **The Union verdict's own
premise is verifiably false at render time.**

Persona B's Option Y (lines 711-720) argued: *"The graph is ALREADY in the
store (the dialog fetches it). The popover just needs to look up `node` by id
in the existing payload."* The Union verdict (lines 722-741) adopted this
verbatim: *"update the 2 `BUG_FACTS` call sites to read from the graph
payload (already in the store via the dialog's fetch — expose it as a
`useDocStore` selector or a lightweight `useGraphNode(id)` hook)"* (lines
732-734).

§12.2 verified this is **false**:

- `dependency-graph.tsx:2293-2311` — the fetch writes to a **module-level**
  `graphDataCache` and **dialog-local** `setData` state. It is **not** in
  the Zustand store.
- `dependency-graph.tsx:2327-2328` — the fetch fires `if (open)` only. The
  dialog is closed on first page load.
- The 3 popover call sites (`markdown-renderer.tsx:266,315`,
  `backlinks-panel.tsx:179`, `command-palette.tsx:216`) call `getBugFact(id)`
  **synchronously during render** on the main page, independent of the
  dialog.

So Persona B's "ALREADY in the store" and the Union verdict's "already in
the store via the dialog's fetch" are both **wrong**. On a cold page load —
before the user ever opens the graph dialog — every popover would render
**empty**. This is the *exact* "broken popover" failure mode Decision 6 was
written to prevent (Persona A's Attack on Option X, lines 388-390: "if even
one node is missing a field, a popover breaks"), reintroduced through the
**fetch-timing** door instead of the dual-source-of-truth door.

**Why the debate missed it.** Persona B Attack 1 (lines 685-690) correctly
killed Persona A's Proxy bridge because `fetchGraphFactsSync()` is
impossible in the browser — B verified the *consumer is a client component*
but did not verify *when the graph payload reaches that consumer's render*.
B's Option Y treated "the dialog fetches it" as true-by-construction. The
Union verdict inherited that unchecked premise. Persona A's refined Option X
(lines 701-709) gestured at "reads the already-fetched graph from the store"
without verifying "already-fetched" was true at render time. Neither persona
traced the data-flow from `fetch("/api/dependency-graph")` (dialog-only,
`if (open)`) to `getBugFact(id)` (main-page, synchronous render).

**Additional defect in the Union verdict's verification.** The verdict's
"empirical signal" (line 736, "the dev script's output, 0 missing") and Doc
3 T8c's verification (line 716, "if any popover is empty, T8a missed a
field — revert") both assume an empty popover has **one cause** (T8a
coverage gap). §12.2 found it has **two**: (a) T8a coverage gap, OR (b) the
store slice was never populated (fetch-timing). T8c considers only (a). An
agent following T8c literally would re-edit the YAML chasing a phantom
coverage gap while the real cause is that the dialog was never opened in
that verification session.

**Net effect on Decision 6**: the Union verdict's *structure* (no Proxy, no
async hook, dev-script + populate + delete) **stands** — sync-fetch is still
impossible, the Proxy is still a footgun, §12.2 does not re-reverse those.
But the verdict's *premise* ("already in the store") is **replaced**: before
T8c deletes `bug-facts.ts`, a `graphNodes`/`graphNodesStatus` store slice
must exist and be populated by a mount-time fetch (Strategy A, preferred) or
a lazy fetch in `useGraphNode` (Strategy B). T8c is **hard-gated** on §12.2
cold-start verification: fresh tab, dialog never opened, B7 popover still
renders (not the "no fact" fallback). Persona B's "verifiable by: does the
popover show data for every node?" (line 719) is **defective** — it must be
prefixed with the cold-start protocol from §12.2, or it cannot distinguish
the two causes.

This is the one place in the four-document review where a Union verdict's
*load-bearing premise* was false. The adversarial debate caught the
sync-fetch impossibility and the Proxy footguns but missed the fetch-timing
gap, because all three attacks stayed within Decision 6's boundary and none
traced the cross-component data-flow. §12.2 is the cross-cutting trace the
sequential debate could not perform.

### Cross-cutting synthesis table (updated)

| Decision | Z verdict (original) | §12 effect | Revised Z verdict |
|---|---|---|---|
| 1 — contracts | One file, fail-fast paths, boolean dispatch, eslint-ban | §12.3 env var + §12.4 wire/drop boolean | One file, env-var paths, **load-bearing** boolean dispatch, eslint-ban |
| 2 — doc registry | `INDEX.yml` + never-throw + `DOCS_DEV_MODE` + banner | §12.5 exact-case gate + `schemaVersion` enforcement + §12.7 `validateRegistry` | `INDEX.yml` + never-throw + `DOCS_DEV_MODE` + banner + **enforced `schemaVersion`** + **exact-case refs** + **unified result shape** |
| 3 — monolith | Phase A+B ungated, Phase C flagged, ref-not-closure | §12.6 target-check popover + Playwright gate | Phase A+B ungated, Phase C flagged, ref-not-closure, **target-check popover (not stopPropagation)**, **Playwright regression gate** |
| 4 — schema migration | Defer. Comment-only. | §12.5 lesson applied to Decision 2's artifact | Defer. Comment-only. **Lesson now applied to `INDEX.yml` too (via Decision 2).** |
| 5 — validate endpoint | POST (body, 256KB) + GET (disk). No `source` field. | §12.7 `RegistryResult` shape | POST + GET, no `source` field, **`RegistryResult` shape unified with T3+T8a** |
| 6 — bug-facts | Dev-script + populate + delete. No runtime bridge. | **§12.2 BLOCKING: "already in store" premise FALSE; T8c hard-gated** | Dev-script + populate + delete, no runtime bridge, **BUT `graphNodes` store slice + mount/lazy fetch required before T8c; cold-start verification mandatory** |

### Why the sequential debate structurally missed these (methodology note)

The six gaps above divide into two classes:

1. **Within-decision gaps the personas could have caught but didn't** (D1
   boolean consumer, D2 case-sensitivity, D3 stopPropagation fragility, D3
   one-time-gate). These are genuine adversarial misses — the personas had
   the file:line evidence in front of them but didn't push the attack far
   enough. A more aggressive Persona B would have caught them.

2. **Cross-decision gaps no sequential debate can catch** (D2↔D4
   schemaVersion anti-pattern recurrence, D2↔D5↔D6 result-shape
   consolidation, D6 fetch-timing which spans the dialog component and the
   main-page render sites). These are invisible from within any single
   decision because they *span* decisions. The four-document pipeline is
   sequential by construction; a cross-cutting pass is a structurally
   different operation.

§12 is the cross-cutting pass. It does not replace the adversarial debate —
it completes it. The debate's Persona A/B dialectic remains the right tool
for *within-decision* stress-testing; §12 is the right tool for
*across-decision* pattern-matching. Both are needed.

---

*End of Document 2 (with cross-cutting recheck). The four-document review
plus its fifth cross-cutting pass is now complete across all four documents:
`01 §1.10`, `02 §2.10`, this section, and `04 §12`. Document 3 inherits the
§12-revised verdicts from all three prior documents.*
