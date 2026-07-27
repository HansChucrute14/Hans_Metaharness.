"use client";

// src/components/docs/graph/graph-toolbar.tsx
// T6b: Extracted from dependency-graph.tsx orchestrator.
// Store-backed (reads graphSyncStatus/graphSyncedAt/graphSyncErrors/syncDependencyGraph
// directly from useDocStore — NOT prop-drilled — Decision 3 Z).
//
// Contains three elements extracted from the orchestrator's inline toolbar JSX:
//   1. "Sync graph from source" button (+ the sync handler that calls
//      syncDependencyGraph and surfaces a toast).
//   2. The layout-toggle button (pipeline / timeline swimlane view).
//   3. The search input.
//
// The orchestrator passes onToggleLayout / searchValue / onSearchChange because
// those pieces of state remain owned by the orchestrator (pipelineMode is read
// in many other places — keyboard handler, layoutPositions memo, render
// branches — and search drives the orchestrator's matchSet/visibleNodes
// memos). Sync state, by contrast, is read straight from the store.
//
// Visual output is identical to the pre-extraction inline elements.

import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { useDocStore } from "@/lib/doc-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RefreshCw, GitBranch, Search } from "lucide-react";

export type GraphToolbarProps = {
  /** Toggle the layout (curated ↔ pipeline/timeline swimlane). */
  onToggleLayout: () => void;
  /** Current search box value (controlled). */
  searchValue: string;
  /** Fire when the user types in the search box. */
  onSearchChange: (v: string) => void;
  /** When true, the layout-toggle button renders in its active ("default") variant. */
  layoutActive?: boolean;
};

export function GraphToolbar(props: GraphToolbarProps): JSX.Element {
  const { onToggleLayout, searchValue, onSearchChange, layoutActive = false } = props;

  // ---- store-backed sync state (no prop-drilling — Decision 3 Z) ----
  const graphSyncStatus = useDocStore((s) => s.graphSyncStatus);
  const graphSyncedAt = useDocStore((s) => s.graphSyncedAt);
  const graphSyncErrors = useDocStore((s) => s.graphSyncErrors);
  const syncDependencyGraph = useDocStore((s) => s.syncDependencyGraph);

  // ---- sync handler (moved here from the orchestrator per T6b spec) ----
  // Calls the store's syncDependencyGraph (which POSTs /api/dependency-graph/sync
  // and dispatches the graph:synced window event on success), then surfaces a
  // toast with the result. The graph:synced listener in the orchestrator clears
  // the module cache and re-fetches so the dialog shows the fresh graph.
  const handleSyncGraph = useCallback(async () => {
    await syncDependencyGraph();
    const errs = useDocStore.getState().graphSyncErrors;
    if (errs && errs.length > 0) {
      toast.error("Graph sync failed", {
        description: errs[0],
        duration: 6000,
        action:
          errs.length > 1
            ? {
                label: `View all (${errs.length})`,
                onClick: () =>
                  errs.forEach((e) => toast.error(e, { duration: 8000 })),
              }
            : undefined,
      });
    } else {
      const syncedAt = useDocStore.getState().graphSyncedAt;
      toast.success("Graph synced", {
        description: syncedAt
          ? `Re-parsed from BUG-DEPENDENCY-MAP.md §D-DATA at ${new Date(syncedAt).toLocaleTimeString()}`
          : "Re-parsed from source",
        duration: 2500,
      });
    }
  }, [syncDependencyGraph]);

  return (
    <>
      {/* Sync graph button — schema-driven re-parse from BUG-DEPENDENCY-MAP.md §D-DATA.
          Fail-closed: a bad YAML edit returns 422 and the cached graph keeps serving;
          the toast surfaces the zod/integrity issues so whoever broke it can fix it.
          When graphSyncStatus === "error" the button shows the destructive variant. */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={graphSyncStatus === "error" ? "destructive" : "ghost"}
              className="h-8 w-8"
              onClick={handleSyncGraph}
              disabled={graphSyncStatus === "syncing"}
              aria-label="Sync graph from source"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  graphSyncStatus === "syncing" && "animate-spin"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            <div className="space-y-1">
              <div className="font-medium">
                {graphSyncStatus === "syncing"
                  ? "Syncing graph…"
                  : graphSyncStatus === "error"
                    ? "Last sync failed — click to retry"
                    : "Sync graph from source"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Re-parses the YAML block in BUG-DEPENDENCY-MAP.md §D-DATA
                (the schema-validated source of truth) and refreshes the
                cache. Fail-closed: a bad edit keeps the old graph serving.
              </div>
              {graphSyncedAt && (
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                  Last synced:{" "}
                  {new Date(graphSyncedAt).toLocaleString()}
                </div>
              )}
              {graphSyncErrors && graphSyncErrors.length > 0 && (
                <div className="text-[11px] text-destructive pt-1 border-t border-border/50">
                  {graphSyncErrors.length} validation issue
                  {graphSyncErrors.length === 1 ? "" : "s"} — see toast
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Layout toggle — switches between curated layout and pipeline/timeline
          swimlane layout (4 phases as swimlanes). Active state is owned by the
          orchestrator (pipelineMode) and passed via the layoutActive prop. */}
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={layoutActive ? "default" : "ghost"}
              className="h-8 w-8"
              onClick={onToggleLayout}
              aria-label="Toggle pipeline / timeline view"
              aria-pressed={layoutActive}
            >
              <GitBranch className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Pipeline / timeline view (4 phases as swimlanes)
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Search input — controlled by the orchestrator's search state (drives
          matchSet/visibleNodes memos there). */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="h-8 w-[140px] lg:w-[200px] pl-7 text-xs"
          placeholder="Search nodes…"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search graph nodes"
        />
      </div>
    </>
  );
}
