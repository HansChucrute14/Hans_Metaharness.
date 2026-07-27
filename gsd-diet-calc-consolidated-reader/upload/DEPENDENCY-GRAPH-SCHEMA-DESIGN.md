# Dependency-Graph: Schema + Manual-Sync Design

Target: replace `src/lib/dependency-graph.ts` (`NODE_TABLE`/`EDGE_TABLE`, hand-curated, 36 nodes/32 edges) and `src/lib/bug-facts.ts` (`BUG_FACTS`, hand-curated, ~60 entries) with **one schema-validated data source**, re-parsed only when a human clicks a button — not on every request, not on file-watch.

## 0. Why this is worth doing (evidence, not opinion)

`BUG-DEPENDENCY-MAP.md` is not static — comparing the two uploaded revisions:
- Dedup count: `~96` → `77` (Part 1 §9.2 reconciliation)
- Verified-facts count: `29` → `27`
- P2 count: `39` → `42`
- Task→task edges: `24` → `23`
- Gate→task edges: `3` → `4` (added `G3→Task C4`, distinct from `Finding C4`, a namespace collision the app's ID regex table (§4.4) doesn't currently disambiguate for graph purposes)

The app's `EDGE_TABLE` has **32 edges**. The map's own edge accounting is **23 + 4 + others ≈ 27–44 depending on which subtotal you read**. Nobody kept these in sync because nobody *can* — it's a hand-transcription task across two files in two languages (Markdown prose → TypeScript literals). This is the exact failure mode "curated, not derived" (§19.1.4) describes. A schema fixes the transcription step; a manual-sync button fixes the "when does it apply" step without violating the app's stated "no server-side writes, always re-read from disk" model (§1.1, §1.2.4).

## 1. Format decision: YAML, fenced inside the existing `.md`

Not a new file. Not raw JSON. Rationale:

| Option | Verdict | Why |
|---|---|---|
| New standalone `.json` file | ❌ | Adds an 11th source file, breaks the "10 files, hardcoded list" contract (§1.2.3, §17.3); JSON has no comments, so authors will drift back to prose explanations living *outside* the data again. |
| New standalone `.yaml` file | ❌ | Same file-count problem; also splits "why" (prose) from "what" (data) into two files that can independently drift — the exact problem being fixed. |
| Fenced YAML block **inside `BUG-DEPENDENCY-MAP.md`** | ✅ | Stays at 10 files. One author, one PR, one diff touches both the prose (§C task table) and the machine block — much harder for them to silently diverge than two separate files ever were. YAML supports comments, so the "why" for a given edge can live one line above the data it explains. Extends a pattern the parser already has (`extractSectionD` slices a named section out of raw markdown) instead of inventing a new one. |

Concretely: add a new top-level section to `BUG-DEPENDENCY-MAP.md`, e.g. `## §D-DATA. Machine-Readable Graph (authoritative)`, containing one \`\`\`yaml fenced block. §D's prose stays as human narrative; §D-DATA is what the parser reads. Keep them adjacent so a reviewer sees both in one screen.

## 2. Canonical schema

Versioned so the parser can reject or migrate old blocks instead of silently misreading them.

```jsonschema
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "gsd-dependency-graph.schema.json",
  "title": "GSD Dependency Graph",
  "type": "object",
  "required": ["schemaVersion", "lanes", "nodes", "edges"],
  "additionalProperties": false,
  "properties": {
    "schemaVersion": { "const": "1.0.0" },

    "lanes": {
      "type": "array",
      "description": "Ordered semantic columns. Replaces hand-picked x-coordinates.",
      "items": {
        "type": "object",
        "required": ["id", "label", "order"],
        "additionalProperties": false,
        "properties": {
          "id":    { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
          "label": { "type": "string" },
          "order": { "type": "integer", "minimum": 0 }
        }
      }
    },

    "nodes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "namespace", "kind", "lane"],
        "additionalProperties": false,
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^(B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5]|G[1-3])$",
            "description": "Must match the app's existing ID-registry regex (APP-OVERVIEW §4.4 row 4/5) so linkification stays consistent."
          },
          "namespace": {
            "enum": ["task", "gate"],
            "description": "Disambiguates finding-C4 vs task-C4 (map v2 §A.0 collision). Node IDs live in task/gate space only — findings are data on a node via `repairs`, never nodes themselves."
          },
          "kind":        { "enum": ["task", "gate", "priority"] },
          "severity":    { "enum": ["P0", "P1", "P2", "P3", null], "default": null },
          "status":      { "enum": ["pending", "resolved", "urgent", "independent", null], "default": null },
          "label":       { "type": "string" },
          "description": { "type": "string" },
          "lane":        { "type": "string", "description": "Must match a lanes[].id" },
          "x": { "type": "number", "description": "Optional manual override. Omit to auto-layout (see §3)." },
          "y": { "type": "number", "description": "Optional manual override. Omit to auto-layout (see §3)." },

          "repairs":        { "type": "array", "items": { "type": "string" }, "description": "Finding IDs this task closes, e.g. [\"D1\"]." },
          "blockedBy":      { "type": "array", "items": { "type": "string" } },
          "onCriticalPath": { "type": "boolean", "default": false },
          "subsystem":      { "type": "string", "description": "e.g. \"LP solver\", \"Validation\" — feeds bug-facts.ts equivalent." },
          "oneLiner":       { "type": "string" }
        }
      }
    },

    "edges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from", "to", "kind"],
        "additionalProperties": false,
        "properties": {
          "from":  { "type": "string" },
          "to":    { "type": "string" },
          "kind":  { "enum": ["blocks", "pending", "recommended", "backstops"] },
          "label": { "type": "string" }
        }
      }
    }
  }
}
```

**Referential-integrity rules enforced by the parser, not the schema** (JSON Schema alone can't express these — do them as a post-validation pass):
1. Every `edges[].from` / `edges[].to` must exist in `nodes[].id`.
2. Every `nodes[].lane` must exist in `lanes[].id`.
3. No duplicate `(namespace, id)` pairs.
4. `nodes[].id` uniqueness is scoped by `namespace` — this is what lets a future `finding`-kind node coexist with a `task`-kind node of the same literal ID without collision, if that's ever needed (currently findings aren't nodes at all — see below).

**Deliberate scope cut:** findings (A/B/C/D/E series) are *not* graph nodes. They're referenced via `nodes[].repairs`. The current app already treats them this way implicitly (bug-facts.ts keys some finding IDs, but the graph itself only ever renders tasks/gates). Making this explicit in the schema prevents someone from "helpfully" adding all 77 findings as nodes and turning a 36-node graph into a 113-node hairball.

## 3. Auto-layout (the actual scalability fix)

Today: every node needs a hand-picked pixel `(x, y)` (§5.2). This is *why* the graph is hardcoded — nobody wants to eyeball-place node #37.

Replace with:
```
x = laneIndex(node.lane) * LANE_WIDTH + LANE_PADDING
y = withinLaneRank(node) * NODE_HEIGHT + LANE_PADDING
```
where `laneIndex` comes from `lanes[].order`, and `withinLaneRank` is a topological sort restricted to edges where both endpoints share a lane, falling back to source-order for nodes with no intra-lane edges. `LANE_WIDTH`, `NODE_HEIGHT`, `LANE_PADDING` are the only tunable constants — same three numbers regardless of whether the graph has 36 nodes or 360.

`x`/`y` stay in the schema as an **optional escape hatch** — if present, used verbatim (for the rare node that needs manual nudging in a crowded lane); if absent, computed. Migration seeds every existing node's current curated `(x, y)` as the explicit override on day one, so the visual layout doesn't jump — then those overrides get deleted opportunistically as the auto-layout is trusted.

## 4. Server-side pipeline

Mirrors the existing `docs-parser.ts` shape so it's not a new mental model:

```typescript
// src/lib/dependency-graph.ts (rewritten)

function extractGraphDataBlock(rawMarkdown: string): string {
  // finds "## §D-DATA." heading, then the first ```yaml ... ``` fence inside it
}

function parseGraphSource(yamlText: string): GraphSource {
  const parsed = YAML.parse(yamlText);
  const result = GraphSourceSchema.safeParse(parsed);   // zod, mirrors the JSON Schema above
  if (!result.success) throw new GraphValidationError(result.error.issues);
  checkReferentialIntegrity(result.data);                // rule 1-4 above
  return result.data;
}

function computeLayout(source: GraphSource): DependencyGraph {
  // lane/topo-sort algorithm from §3; falls back to source.nodes[].x/y when present
}

let cachedGraph: DependencyGraph | null = null;
let cachedAt: number | null = null;

export function invalidateDependencyGraphCache(): void {
  cachedGraph = null;
  cachedAt = null;
}

export function getDependencyGraph(): DependencyGraph {
  if (cachedGraph) return cachedGraph;
  const raw = fs.readFileSync(BUG_DEPENDENCY_MAP_PATH, "utf-8");
  const source = parseGraphSource(extractGraphDataBlock(raw));
  cachedGraph = computeLayout(source);
  cachedAt = Date.now();
  return cachedGraph;
}
```

`invalidateDependencyGraphCache()` is the missing sibling of `invalidateDocsCache()`, which APP-OVERVIEW §4.6 already documents as existing "for future CMS hooks" — this is that hook, finally used.

**Zod vs the JSON Schema above:** keep the JSON Schema block in this doc as the source of truth for the *data format* (language-agnostic, reviewable, doubles as inline documentation for whoever edits the YAML). Hand-write the zod schema in TS to match it — don't machine-generate one from the other; the two are small enough that manual sync is cheap and each catches typos in the other during code review.

## 5. Manual-sync mechanism (the actual button)

No file watching. No auto re-parse on every request (unlike `docs-parser.ts`'s 60s TTL — deliberately different, because a bad edit to the graph should never silently apply to live traffic without a human seeing the validation result first).

**API** — extend the existing route, don't add a new one:
```
GET  /api/dependency-graph            → serves cachedGraph (or parses+caches on cold start)
POST /api/dependency-graph/sync       → invalidateDependencyGraphCache() + re-parse now, synchronously,
                                         returns { ok: true, graph, generatedAt } on success
                                         returns { ok: false, errors: ZodIssue[] } on validation failure — 422, cache NOT touched
```
Fail-closed: if the new block doesn't validate, the *previously cached* graph keeps serving. A typo in the YAML degrades to "stale until fixed," never to "broken for everyone."

Both routes keep the existing `rateLimit(request)` call (§15.1 pattern). Suggest a tighter bucket on `/sync` specifically (e.g. `rateLimit(request, capacity=10)`) since it's an explicit human action, not passive polling — reuses the same function, different `capacity` argument, no new infra.

**Client:**
```typescript
// doc-store.ts — new fields + action
interface DocState {
  graphSyncStatus: "idle" | "syncing" | "error";
  graphSyncedAt: string | null;
  graphSyncErrors: string[] | null;
  syncDependencyGraph(): Promise<void>;
}

syncDependencyGraph: async () => {
  set({ graphSyncStatus: "syncing" });
  const res = await fetch("/api/dependency-graph/sync", { method: "POST" });
  const body = await res.json();
  if (body.ok) {
    set({ graphSyncStatus: "idle", graphSyncedAt: body.generatedAt, graphSyncErrors: null });
    window.dispatchEvent(new CustomEvent("graph:synced", { detail: { generatedAt: body.generatedAt } }));
  } else {
    set({ graphSyncStatus: "error", graphSyncErrors: body.errors.map(formatZodIssue) });
  }
}
```

**UI:** one button in `DependencyGraphDialog`'s existing toolbar — "Sync graph" icon + last-synced timestamp, matching the existing icon-button density in that toolbar. On error, a toast lists the validation issues verbatim (field path + message) so whoever broke the YAML can fix it without opening devtools. On success, the dialog's already-listening `graph:open-at-node`-style event pattern extends naturally: add `graph:synced` as event #6 in the §8 table, consumed by `DependencyGraphDialog` to re-render from the new store state — no new listener pattern, just one more entry in a table that already exists.

`bug-facts.ts`'s `BUG_FACTS` gets the same treatment: fold its fields (`subsystem`, `oneLiner`, `repairs`, `blockedBy`, `onCriticalPath`) directly into `nodes[]` (already present in the schema above) and delete the file. One less place to remember to update.

## 6. Migration plan (incremental, no rewrite)

1. Write the YAML block into `BUG-DEPENDENCY-MAP.md` by transcribing current `NODE_TABLE`/`EDGE_TABLE` verbatim, including every existing `(x, y)` as an explicit override. Output should be pixel-identical to today.
2. Add the zod schema + `parseGraphSource` + `checkReferentialIntegrity`. Run it against step 1's block; fix whatever it flags (this alone will likely surface some of the 32-vs-44 edge drift).
3. Swap `getDependencyGraph()`'s implementation to the new pipeline behind the existing export signature — `dependency-graph.tsx` (the 3661-line dialog component) needs zero changes, since `DependencyGraph` (§5.1 shape) is unchanged.
4. Add `/api/dependency-graph/sync`, the store fields, the toolbar button.
5. Only then start deleting hand-picked `(x, y)` overrides in favor of computed layout, one lane at a time, visually diffing before/after.
6. Delete `bug-facts.ts`, point its two call sites at `node.subsystem`/`node.oneLiner`/etc.

Each step ships independently and is revertible — nothing requires steps 5-6 to happen before this is usably better than today.

## 7. What this deliberately does not do

- No file-watcher / hot-reload on the graph block (unlike docs' dev-mode live reload). Manual button, as asked — the graph is a shared, cached resource where a mid-edit half-written YAML should never leak to a viewer.
- No write-back from the UI into the `.md` file. Source stays hand-authored; the app only ever reads (holds the line drawn in §1.2.4/§1.2.5 — not a CMS).
- No new auth requirement for the sync button — the app has none today (§1.2.5), and sync only re-reads a file already on disk; it's not a new write-vector, so it doesn't need to be the thing that introduces auth.
