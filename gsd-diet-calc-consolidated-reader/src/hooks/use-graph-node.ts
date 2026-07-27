// src/hooks/use-graph-node.ts
// T8b + §12.2 + §12.8: O(1) graph node lookup from the Zustand store.
// The graph payload is eager-fetched on page mount (doc-reader.tsx) per §12.2.
// Module-level Map memoized on graphNodes reference for O(1) lookup (§12.8).
import { useDocStore } from "@/lib/doc-store";
import type { GraphNode } from "@/lib/dependency-graph";

// Module-level memo keyed by graphNodes reference (exactly one graph payload in the store).
const _byId = new Map<string, GraphNode>();
let _lastRef: GraphNode[] | null = null;

function rebuildMap(nodes: GraphNode[]): void {
  _byId.clear();
  for (const n of nodes) _byId.set(n.id, n);
  _lastRef = nodes;
}

/**
 * Hook: returns the GraphNode matching `id`, or null.
 * Subscribes to the store — re-renders when graphNodes changes.
 * §12.8: O(1) Map lookup, not O(n) Array.find.
 */
export function useGraphNode(id: string | null): GraphNode | null {
  const nodes = useDocStore((s) => s.graphNodes);
  if (_lastRef !== nodes) {
    rebuildMap(nodes);
  }
  if (id === null) return null;
  return _byId.get(id) ?? null;
}

/**
 * Hook: returns the current graphNodes fetch status.
 * Used by the §12.2 popover render contract:
 *   - node === null && status !== "ready" → render "loading…"
 *   - node === null && status === "ready" → render "no fact" fallback
 */
export function useGraphNodesStatus(): "idle" | "loading" | "ready" | "error" {
  return useDocStore((s) => s.graphNodesStatus);
}
