# T8b — Replace BUG_FACTS call sites with useGraphNode + dialog fetch migration

## Task ID: T8b
## Agent: full-stack-developer

## Work Log

- Read `worklog.md` tail to confirm prior tasks (T1-T6c) and the T8b prerequisites
  already in place: `useDocStore.graphNodes` / `graphNodesStatus` / `setGraphNodes` /
  `fetchGraphNodes` in `src/lib/doc-store.ts`, `useGraphNode` + `useGraphNodesStatus`
  in `src/hooks/use-graph-node.ts`, and the mount-fetch `useEffect` in
  `src/components/docs/doc-reader.tsx` (line 348-351).
- Audited the 4 `BUG_FACTS` / `getBugFact` call sites:
  1. `src/components/docs/backlinks-panel.tsx` line ~179 — `const fact = BUG_FACTS[id];`
     inside the `idShortTitle(id)` helper, called per-ID inside a list map.
  2. `src/components/docs/markdown-renderer.tsx` line ~267 — `const fact = getBugFact(id);`
     inside an IIFE in the IdLink popover's Quick-Reference Card header.
  3. `src/components/docs/markdown-renderer.tsx` line ~316 — same IIFE pattern, default
     header fallback.
  4. `src/components/docs/command-palette.tsx` line ~216 — `const fact = getBugFact(entry.id);`
     inside the `allActions` useMemo, called per-ID in a list.
- Confirmed the GraphNode type (`src/lib/dependency-graph.ts` lines 38-55) has:
  `severity: Severity` (P0-P3 or null, required), and optional `subsystem`, `oneLiner`,
  `repairs`, `blockedBy`, `onCriticalPath`. BugFact (`src/lib/bug-facts.ts` lines 5-13)
  has `severity: "P0"|"P1"|"P2"|"P3"` (required) and required `subsystem`/`oneLiner`/
  `repairs`/`blockedBy`, optional `onCriticalPath`. Field-shape delta handled via
  nullish-coalescing in the unified fact object.

### Part 1 — call-site replacements (hybrid: graphNode primary, getBugFact fallback)

#### backlinks-panel.tsx (list case — can't use `useGraphNode(id)` in a loop)
- Added `import type { GraphNode } from "@/lib/dependency-graph";`.
- Subscribed to `graphNodes` from the store at the top of `BacklinksPanel` and built a
  `Map<string, GraphNode>` via `useMemo` (`graphNodesByXref`) for O(1) per-ID lookup.
- Refactored `idShortTitle(id)` to consult `graphNodesByXref.get(id)` first, then fall
  back to `BUG_FACTS[id]`, then the section title of the first occurrence, then the raw
  id. Preserves the existing behavior for finding IDs (A1-A14, D1-D8, E1-E7) not in the
  graph.

#### markdown-renderer.tsx (single-id case — uses the `useGraphNode(id)` hook)
- Added `import { useGraphNode, useGraphNodesStatus } from "@/hooks/use-graph-node";`.
- In `IdLink`, called `const graphNode = useGraphNode(id);` and
  `const graphNodesStatus = useGraphNodesStatus();` at the top of the component (after
  the existing store reads, before the `useMemo` for `targetSlug` and before any early
  returns — Rules of Hooks compliant).
- Computed a unified `fact` object that coerces both `GraphNode` and `BugFact` into a
  single shape (`{ severity: string; subsystem: string; oneLiner: string; repairs:
  string[]; blockedBy: string[]; onCriticalPath?: boolean }`). `graphNode` is primary;
  if null, spreads `bugFact` (the `getBugFact(id)` fallback); if both null, `fact` is
  null. Defaults handle the GraphNode optional/nullable fields (severity null → "",
  optional arrays → []).
- Replaced both IIFEs in the popover JSX:
  - IIFE #1 (Quick-Reference Card): removed local `const fact = getBugFact(id);`, uses
    the outer `fact`. Made the severity badge, subsystem badge, and oneLiner paragraph
    conditionally render (`fact.severity &&`, `fact.subsystem &&`, `fact.oneLiner &&`)
    so empty-string fields from a graphNode with null severity / undefined subsystem
    don't render empty badges.
  - IIFE #2 (default header): now has THREE branches — if `fact` exists, return null
    (already shown above); if `!fact && factLoading` (graph not ready yet), render a
    "loading…" header with `animate-pulse`; else render the existing default header
    (no fact available, graph ready).
- `factLoading = !fact && graphNodesStatus !== "ready"` — the §12.2 popover render
  contract.
- Kept `getBugFact` and `severityBadgeClass` imports from `bug-facts.ts` (fallback +
  badge styling).

#### command-palette.tsx (list case — can't use `useGraphNode(id)` in a loop)
- Added `import { useGraphNodesStatus } from "@/hooks/use-graph-node";` and
  `import type { GraphNode } from "@/lib/dependency-graph";`.
- Subscribed to `graphNodes` + `graphNodesStatus` at the top of `CommandPalette`, built
  `graphNodesByXref` Map via `useMemo`.
- Inside the `allActions` useMemo's bugs-list loop: replaced `const fact = getBugFact(...)`
  with `const node = graphNodesByXref.get(entry.id);` (primary) + `const bugFact =
  getBugFact(entry.id);` (fallback). Normalized fields into `factOneLiner`,
  `factSeverity`, `factSubsystem` via nullish-coalescing. Added `factLoading` (=
  `!hasFact && graphNodesStatus !== "ready"`); when no fact and graph not ready, the
  description appends " · loading…".
- Added `graphNodesByXref` and `graphNodesStatus` to the `allActions` useMemo deps.

### Part 2 — dependency-graph.tsx dialog fetch migration

- Re-added `import { useDocStore } from "@/lib/doc-store";` (T6b had removed it; T8b
  needs it for `setGraphNodes` + `fetchGraphNodes`). Updated the import-block comment
  to explain both the T6b removal (sync state moved to GraphToolbar) and the T8b re-add
  (store integration for popovers).
- `fetchData` callback (lines 2109-2134): on cache hit, now ALSO calls
  `useDocStore.getState().setGraphNodes(graphDataCache.nodes, "ready")` (covers the
  case where the store was cleared by a sync while the dialog was closed). On fresh
  fetch, after `setData(json)`, calls
  `useDocStore.getState().setGraphNodes(json.nodes, "ready")` — publishes the fetched
  nodes to the store so IdLink popovers and the backlinks-panel/command-palette (which
  all subscribe to `graphNodes`) render the same data the dialog renders. Avoids a
  duplicate GET to `/api/dependency-graph` that the store's `fetchGraphNodes` would
  otherwise issue.
- `graph:synced` listener (lines 2146-2155): the handler now triggers BOTH
  `fetchData(true)` (refreshes the dialog's own data — edges/sectionContent/
  generatedAt — avoiding the regression where the dialog shows stale data when a sync
  happens while open) AND `useDocStore.getState().fetchGraphNodes(true)` (refreshes the
  store's `graphNodes` for popover consumers). The prompt's "instead of" is interpreted
  as "in addition to" because step 3 (Option A) explicitly says the dialog keeps its
  own fetch — so the listener must refresh both data sinks to avoid regression.
- Kept the module-level `graphDataCache` (still needed for edges/sectionContent/
  generatedAt which aren't in the store).

### Part 3 — verification

- `bun run lint` → 0 errors, exit 0.
- `bug-facts.ts` left intact (safety net for finding IDs not in the graph; T8c will
  handle finding-node migration).
- Did NOT restart the dev server. `dev.log` shows clean compile of `/` (no errors /
  warnings) — the T8b changes compile and render without issues.

## Stage Summary

### Files modified
1. `src/components/docs/backlinks-panel.tsx` (+18 lines): added GraphNode import,
   subscribed to `graphNodes` from store, built `graphNodesByXref` Map via useMemo,
   `idShortTitle` now consults graphNode first then BUG_FACTS fallback.
2. `src/components/docs/markdown-renderer.tsx` (+48 lines, -3): added useGraphNode +
   useGraphNodesStatus imports, called both hooks at top of IdLink (before early
   returns), computed unified `fact` object from graphNode (primary) + getBugFact
   (fallback), replaced both IIFEs in the popover JSX to use the outer `fact` with
   conditional badge rendering and a §12.2 "loading…" branch.
3. `src/components/docs/command-palette.tsx` (+22 lines): added useGraphNodesStatus +
   GraphNode imports, subscribed to graphNodes + graphNodesStatus, built
   `graphNodesByXref` Map, refactored bugs-list loop in `allActions` useMemo to use
   graphNode primary + getBugFact fallback, added `factLoading` "loading…" hint in the
   description, updated useMemo deps.
4. `src/components/docs/dependency-graph.tsx` (+29 lines, -5): re-added useDocStore
   import with explanatory comment, `fetchData` now publishes fetched nodes to the
   store via `setGraphNodes` on both cache-hit and fresh-fetch paths, `graph:synced`
   listener now triggers BOTH `fetchData(true)` (dialog refresh) AND
   `fetchGraphNodes(true)` (store refresh) to avoid regression.

### Lint result
- `bun run lint` → 0 errors, exit 0.
- `dev.log` shows clean compile of `/` after the changes (no runtime errors visible).

### Hybrid approach details
- **Primary source**: `useGraphNode(id)` (markdown-renderer) or `graphNodesByXref.get(id)`
  (backlinks-panel, command-palette) — both subscribe to the eager-fetched store.
- **Fallback**: `getBugFact(id)` / `BUG_FACTS[id]` — preserved for finding IDs
  (A1-A14, D1-D8, E1-E7) not in the graph's 36 task/gate nodes. `bug-facts.ts` left
  intact; T8c will handle finding-node migration.
- **§12.2 popover render contract** (markdown-renderer): if both sources null AND
  `graphNodesStatus !== "ready"` → render "loading…" header (with `animate-pulse`);
  if both null AND `graphNodesStatus === "ready"` → render existing "no fact" default
  header. Same contract applied to command-palette's bugs-list description ("loading…"
  appended when no fact + graph not ready).
- **Field-shape delta**: GraphNode has optional/nullable fields; BugFact has required
  ones. Unified into a single fact-like object via nullish-coalescing (severity null →
  "", optional arrays → []). Badges conditionally render on non-empty values to avoid
  empty badge UI.
- **Dialog fetch migration (Option A)**: the dialog keeps its own fetch + module cache
  (it needs edges/sectionContent/generatedAt which aren't in the store), but ALSO
  publishes fetched nodes to the store via `setGraphNodes` so popover consumers see the
  same data. The `graph:synced` listener triggers both `fetchData(true)` (dialog
  refresh — avoids regression) and `fetchGraphNodes(true)` (store refresh for
  popovers).
- **Hook placement**: `useGraphNode(id)` and `useGraphNodesStatus()` called at the top
  of `IdLink` (before any early returns) per Rules of Hooks. For list-case components
  (backlinks-panel, command-palette) where the hook can't be called per-item, the
  underlying `graphNodes` array is subscribed once and a `Map<string, GraphNode>` is
  built via `useMemo` for O(1) per-ID lookup — same pattern the hook itself uses
  internally (module-level `_byId` Map in `use-graph-node.ts`).

### Notes for downstream tasks (T8c)
- `bug-facts.ts` is still imported by backlinks-panel, markdown-renderer, and
  command-palette as the fallback. T8c should add finding-node (A1-A14, D1-D8, E1-E7)
  coverage to the graph payload (or a parallel finding-nodes store slice), then remove
  the `BUG_FACTS` / `getBugFact` fallback from these three call sites.
- The unified `fact` object pattern in markdown-renderer's `IdLink` can be extracted
  into a `useFact(id)` hook once T8c unifies the data sources.
- The `graphNodesByXref` Map pattern in backlinks-panel and command-palette duplicates
  the module-level `_byId` Map in `use-graph-node.ts`. T8c could expose a
  `useGraphNodesMap()` hook from `use-graph-node.ts` to deduplicate.
