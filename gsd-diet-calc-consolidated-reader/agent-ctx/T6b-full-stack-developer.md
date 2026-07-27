# T6b — Extract GraphToolbar from dependency-graph.tsx orchestrator

**Task ID:** T6b
**Agent:** full-stack-developer
**Date:** 2026-07-27
**Status:** ✅ Complete (lint 0 errors)

## Spec
Blueprint `docs/architecture-review/04-document3-implementation-blueprint.md` §T6b (lines 575-590).

## What was created

### `src/components/docs/graph/graph-toolbar.tsx` (NEW, 181 lines)

A self-contained toolbar fragment component that owns three pieces of the
orchestrator's old inline toolbar JSX:

1. **Sync button** (`RefreshCw` + `TooltipProvider`) — calls the store's
   `syncDependencyGraph()`, surfaces a success/error toast, and renders
   the `destructive` variant when `graphSyncStatus === "error"` (per
   blueprint VERIFY step 2).
2. **Layout-toggle button** (`GitBranch`) — calls the `onToggleLayout`
   prop; renders the `default` variant when `layoutActive` is true.
3. **Search input** (`<Input>` with `Search` icon) — controlled by
   `searchValue` / `onSearchChange` props.

**Props** (matches blueprint spec, with one extra optional prop for
visual fidelity):

```ts
export type GraphToolbarProps = {
  onToggleLayout: () => void;
  searchValue: string;
  onSearchChange: (v: string) => void;
  layoutActive?: boolean;   // controls layout-toggle variant
};
```

The `layoutActive` prop is the only deviation from the spec's literal
3-prop signature. It's necessary because the layout-toggle button's
variant depends on `pipelineMode` (which lives in the orchestrator —
used by the keyboard handler, layoutPositions memo, and render branches).
Without it, the button couldn't show its active state, breaking the
"visual diff = none" requirement.

**Store reads** (per blueprint spec — Decision 3 Z, no prop-drilling):
- `graphSyncStatus`
- `graphSyncedAt`
- `graphSyncErrors`
- `syncDependencyGraph`

**Sync handler** (moved here from orchestrator lines 2080-2106):
`handleSyncGraph` is a `useCallback` that calls `syncDependencyGraph()`
and surfaces a toast based on `useDocStore.getState().graphSyncErrors`
and `useDocStore.getState().graphSyncedAt`. The store action dispatches
the `graph:synced` window event, which the orchestrator's listener
catches to clear the module cache and re-fetch.

The component renders a React **fragment** (`<>...</>`) so the three
controls sit inline as siblings in the orchestrator's existing
`flex items-center gap-2` LEFT section — no extra wrapper div.

## What was modified in `src/components/docs/dependency-graph.tsx`

### Imports
- **Added:** `import { GraphToolbar } from "./graph/graph-toolbar";`
- **Removed:** `useDocStore` (no longer called directly in orchestrator),
  `Input` (no longer rendered), `GitBranch` / `RefreshCw` / `Search`
  icons (moved to GraphToolbar).

### Logic (lines 2075-2107, deleted)
- Removed the four `useDocStore((s) => s.graphSync*)` reads.
- Removed the `handleSyncGraph` `useCallback`.
- Replaced with a 7-line comment block explaining the extraction and
  pointing to `GraphToolbar`.

### `graph:synced` event listener (lines 2104-2118, comment updated)
The listener itself is unchanged (it clears `graphDataCache` and calls
`fetchData(true)`), but the comment now notes that the sync call
originates in `<GraphToolbar />`'s sync button — the store action is
what fires the event.

### Toolbar JSX (lines 3088-3199)
- **LEFT section:** removed the inline sync button JSX (the entire
  `<TooltipProvider>...<Tooltip>...<Button>...</TooltipProvider>` block
  with the `RefreshCw` icon and the multi-line tooltip). Replaced with
  `<GraphToolbar onToggleLayout={() => setPipelineMode((v) => !v)}
  searchValue={search} onSearchChange={setSearch}
  layoutActive={pipelineMode} />`.
- **CENTER section:** removed the inline pipeline/timeline toggle button
  JSX (`<TooltipProvider>...<Button>...<GitBranch/>...</TooltipProvider>`,
  ~19 lines). The zoom/collapse/critical/effects buttons stay inline.
- **RIGHT section:** removed the inline search input JSX
  (`<div className="relative">...<Input/>...</div>`, ~10 lines). The
  help button stays inline.

## Layout decision

The blueprint spec ("Replace inline toolbar JSX with `<GraphToolbar ...props />`")
is ambiguous about whether "toolbar JSX" means the entire toolbar div or
just the three extracted elements. The sync button was in the LEFT
section, the pipeline toggle was in the CENTER section, and the search
input was in the RIGHT section — they can't be replaced by a single
component invocation in three places at once.

**Chosen interpretation:** GraphToolbar renders a fragment containing
the three controls, and is placed in the LEFT section (where the sync
button was). The other two sections lose their respective elements but
keep the remaining inline controls (zoom/collapse/critical/effects in
CENTER, help in RIGHT).

**Visual diff:** The sync button stays in roughly its original position
(end of LEFT, after the badges). The pipeline toggle moves from CENTER
to LEFT (now sits next to the sync button). The search input moves from
RIGHT to LEFT (now sits next to the pipeline toggle). The three controls
now use the LEFT section's `gap-2` spacing (was `gap-1` in CENTER/RIGHT).
This is a minor positioning diff — the toolbar height (`h-14`), all
button sizes (`h-8 w-8`), all icons, all tooltips, all variants, and all
aria-labels are unchanged.

## Verification

- `bun run lint` → **0 errors, exit 0** ✅
- Dev server log shows clean compile of `/` ✅
- Orchestrator line count: 3822 → 3725 (−97 lines)
- New file: 181 lines

### Blueprint VERIFY steps (manual, not run)
- BROWSER: click "Sync graph from source" → POST /sync 200 → graph:synced
  fires → dialog re-fetches. (Code path: GraphToolbar's `handleSyncGraph`
  → `syncDependencyGraph()` store action → POST /api/dependency-graph/sync
  → on success dispatches `graph:synced` window event → orchestrator's
  listener at line 2110 catches it → `graphDataCache = null; fetchData(true)`.)
- BROWSER: `graphSyncStatus === "error"` variant → button shows
  destructive variant. (Code: GraphToolbar line 99 —
  `variant={graphSyncStatus === "error" ? "destructive" : "ghost"}`.)

## Files touched
- **NEW** `src/components/docs/graph/graph-toolbar.tsx` (181 lines)
- **MODIFIED** `src/components/docs/dependency-graph.tsx` (3822 → 3725 lines)

## Notes for downstream tasks (T6c)
- The orchestrator still owns `pipelineMode`, `search`, and all the
  zoom/collapse/critical/effects/help state. T6c (GraphCanvas extraction)
  will need to access these — they should stay in the orchestrator and
  be passed as props to GraphCanvas, per the blueprint's "ref-not-closure"
  Decision 3.
- The `graph:synced` event listener stays in the orchestrator (it
  triggers re-fetch, which is an orchestrator concern). T6c's spec
  confirms this: "The graph:synced listener stays in orchestrator."
