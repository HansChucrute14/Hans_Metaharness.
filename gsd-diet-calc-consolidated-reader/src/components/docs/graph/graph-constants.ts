// src/components/docs/graph/graph-constants.ts
// Shared color/style constants for the dependency-graph sub-components.
// Extracted from the orchestrator (dependency-graph.tsx) to avoid circular
// imports when legend/toolbar/canvas are split into separate files.
import type { Severity, EdgeKind, NodeKind, NodeStatus } from "@/lib/dependency-graph";

// oklch literals so they read identically across themes — instant recognition.
export const SEVERITY_COLOR: Record<NonNullable<Severity>, string> = {
  P0: "oklch(0.62 0.22 25)",    // rose-red
  P1: "oklch(0.70 0.16 65)",    // amber
  P2: "oklch(0.65 0.14 150)",   // emerald
  P3: "oklch(0.65 0.02 260)",   // slate-gray
};

export const EDGE_COLOR: Record<EdgeKind, string> = {
  blocks:      "oklch(0.55 0.14 160)",   // emerald (strong)
  recommended: "oklch(0.58 0.13 230)",   // sky
  pending:     "oklch(0.68 0.15 65)",    // amber
  backstops:   "oklch(0.60 0.21 20)",    // rose
};

export const EDGE_DASH: Record<EdgeKind, string> = {
  blocks: "none",
  recommended: "8 4",
  pending: "6 4",
  backstops: "3 4",
};

export const EDGE_WIDTH: Record<EdgeKind, number> = {
  blocks: 2.0,
  recommended: 1.5,
  pending: 1.8,
  backstops: 1.4,
};

export const KIND_ACCENT: Record<NodeKind, string> = {
  gate: "oklch(0.60 0.18 295)",     // violet
  task: "oklch(0.55 0.14 160)",     // emerald
  priority: "oklch(0.55 0.05 250)", // slate
};

export const STATUS_COLOR: Record<NonNullable<NodeStatus>, string> = {
  pending: "oklch(0.68 0.15 65)",     // amber
  urgent: "oklch(0.62 0.22 25)",      // rose
  independent: "oklch(0.55 0.05 250)",// slate
  resolved: "oklch(0.65 0.14 150)",   // emerald
};

// CSS-var references for structural colors. Resolved by the browser at render time.
export const CV = {
  card: "var(--card)",
  cardForeground: "var(--card-foreground)",
  background: "var(--background)",
  foreground: "var(--foreground)",
  border: "var(--border)",
  muted: "var(--muted)",
  mutedForeground: "var(--muted-foreground)",
  popover: "var(--popover)",
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  accent: "var(--accent)",
  ring: "var(--ring)",
  destructive: "var(--destructive)",
};
