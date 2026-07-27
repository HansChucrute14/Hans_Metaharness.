"use client";

/**
 * SOTA dependency-graph dialog (July-2026 style).
 *
 * Features:
 *   1. Semantic zoom: <0.5 = hub-only skeleton, 0.5–0.8 = all nodes w/o edge labels,
 *      ≥0.8 = full detail. Edge labels also appear on hover.
 *   2. Smooth pan (drag background, momentum-decayed) + cursor-anchored wheel zoom,
 *      clamp [0.3, 3]. Zoom in/out/fit/reset buttons.
 *   3. Deterministic force-directed layout (pure-TS O(n²) charge + spring + centering
 *      + circle-circle collision), seeded by curated NODE_TABLE positions, cached at
 *      module level so it runs exactly once per data-shape.
 *   4. Curved cubic-bezier edges with radial fan-out at hubs (no anchor overlap),
 *      variable stroke width by edge kind, edge-bundling-lite for collapsed clusters.
 *   5. Collapsible cluster mega-nodes (7 lanes derived from curated x positions).
 *      Click mega-node → expand; click lane badge → collapse.
 *   6. Hub visual weighting: degree badge (top-right), thicker border for hubs (≥4),
 *      subtle outer glow for mega-hubs (≥6).
 *   7. Perfect readability: collision detection in sim, descriptions hidden <0.6 zoom,
 *      degree badges hidden <0.6 zoom, edge labels in pills only on hover or ≥0.8 zoom.
 *   8. Mini-map (bottom-right) with viewport rect + click-to-pan.
 *   9. Search + severity/status toggle chips that highlight matches and dim others.
 *  10. React.memo on NodeView/EdgeView/MegaNodeView; layout & degree maps memoized.
 *
 * All structural colors use CSS variables so the graph adapts to all 4 themes
 * (light/dark/opencode/ergonomic). Severity + edge-kind colors are semantic oklch
 * (kept consistent across themes for instant recognition).
 */

import * as React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckSquare,
  ChevronDown,
  Copy,
  CornerDownRight,
  Crosshair,
  HelpCircle,
  Layers,
  Loader2,
  Maximize,
  Minimize2,
  MousePointerClick,
  Network,
  RotateCcw,
  Route,
  Shield,
  Sparkles,
  Star,
  Download,
  BarChart3,
  Image as ImageIcon,
  FileDown,
  ChevronRight,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
// T6b: the sync state (graphSyncStatus / graphSyncedAt / graphSyncErrors /
// syncDependencyGraph) is read directly inside <GraphToolbar /> — the
// orchestrator no longer subscribes to those slices.
// T8b: re-added for the §12.2 store integration. The orchestrator's
// fetchData callback now ALSO publishes its fetched nodes to the store via
// setGraphNodes (so IdLink popovers, which useGraphNode from the store, see
// the same data the dialog renders), and the graph:synced listener calls
// fetchGraphNodes(true) to refresh the store for popovers.
import { useDocStore } from "@/lib/doc-store";

// ---------- public types (mirrors API response) ----------

type NodeKind = "task" | "gate" | "priority";
type Severity = "P0" | "P1" | "P2" | "P3" | null;
type EdgeKind = "blocks" | "pending" | "recommended" | "backstops";
type NodeStatus = "pending" | "resolved" | "urgent" | "independent" | null;

interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  severity: Severity;
  description: string;
  status?: NodeStatus;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

interface DependencyGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sectionContent: string;
  generatedAt: string;
}

interface DependencyGraphDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNodeClick?: (node: { id: string }) => void;
  /**
   * Optional node id to focus when the dialog opens. When set, the dialog will
   * select that node, expand the cluster containing it, and smoothly center on it.
   * Used by doc-reader to thread "View in graph" context from prose links.
   */
  initialFocusNodeId?: string;
}

// ---------- constants ----------

const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const MEGA_NODE_WIDTH = 220;
const MEGA_NODE_HEIGHT = 76;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.2; // multiplicative

// Semantic zoom thresholds
const ZOOM_HUB_ONLY = 0.5;     // below: hub-only skeleton view
const ZOOM_BADGES = 0.6;       // below: hide degree badges + node descriptions
const ZOOM_EDGE_LABELS = 0.8;  // above: show edge labels (also on hover)

const HUB_DEGREE = 4;
const MEGA_HUB_DEGREE = 6;

const VIEWBOX_PAD = 60;

// Critical-path nodes (per BUG-DEPENDENCY-MAP §F)
const CRITICAL_PATH = new Set<string>([
  "B0", "B7", "B1", "B5", "B6", "B8", "C5",
  "C7", "C8", "C9", "C10", "C11", "C12", "C14",
  "R1", "R2", "R3", "R4", "R5",
]);

// ---------- Phase mapping (for Pipeline View) ----------
//
// Per BUG-DEPENDENCY-MAP §C / §F and the deep dependency analysis
// (dependency-analysis.md §5), every task belongs to exactly one of 4 phases:
//   Phase 0 — Safety Freeze (B0)
//   Phase 1 — Blockers & Stability (B1–B12)
//   Phase 2 — P1 Hardening (C1–C16)
//   Phase 3 — Regression Suite (R1–R5)
// G3 is a gate (not in a phase) — render it in a special "Gate" lane above Phase 0.

type Phase = "gate" | "0" | "1" | "2" | "3";

const PHASE_LABEL: Record<Phase, string> = {
  gate: "GATE · G3 vet sign-off (PENDING)",
  "0": "Phase 0 · Safety Freeze",
  "1": "Phase 1 · Blockers & Stability",
  "2": "Phase 2 · P1 Hardening",
  "3": "Phase 3 · Regression Suite",
};

const PHASE_BLURB: Record<Phase, string> = {
  gate: "The single non-engineering bottleneck. Blocks B3, B4, B2b-thresholds, C4 until vet signs off.",
  "0": "First commit. Backstops everything. Makes system honest today.",
  "1": "12 P0 tasks. G3-independent tasks can start in parallel; G3-blocked tasks wait.",
  "2": "16 C-series tasks. Fixes the 27 High bugs. C7–C12 all blocked by B5; C5 by B7+B8.",
  "3": "5 R-series tasks. Locks in the fixes. R5 (dead code + DEBUG prints) is LAST.",
};

// Phase accent colors — distinct, semantically ordered (gate=amber, P0=rose,
// P1=orange, P2=emerald, P3=slate). These match the severity palette so users
// can intuit the phase from the color.
const PHASE_COLOR: Record<Phase, string> = {
  gate: "oklch(0.68 0.15 65)",     // amber (pending)
  "0":  "oklch(0.62 0.22 25)",     // rose (safety-critical)
  "1":  "oklch(0.62 0.22 25)",     // rose (P0)
  "2":  "oklch(0.70 0.16 65)",     // amber (P1)
  "3":  "oklch(0.65 0.14 150)",    // emerald (P2 / regression)
};

function phaseOf(node: GraphNode): Phase {
  if (node.kind === "gate") return "gate";
  const id = node.id;
  if (id === "B0") return "0";
  if (/^B\d/.test(id)) return "1";
  if (/^C\d/.test(id)) return "2";
  if (/^R\d/.test(id)) return "3";
  return "1";
}

// Pipeline View layout — 5 horizontal swimlanes (gate + 4 phases).
// Each lane is a horizontal band. Nodes are positioned left-to-right within
// their lane, ordered by the recommended execution order from §F.
const PIPELINE_LANE_HEIGHT = 200;
const PIPELINE_LANE_GAP = 40;
const PIPELINE_NODE_SPACING = 200;
const PIPELINE_LEFT_MARGIN = 80;

// Canonical execution order within each phase (per BUG-DEPENDENCY-MAP §F
// "Recommended start order" and the deep analysis).
// Phase 1 order: B5 (CI red), B6, B11, B2a, B9, B10 (all independent starts),
//   then B7 (hub), then B1, B8, B12 (B7's children), then B2b, B3, B4 (G3-blocked).
const PIPELINE_ORDER: Record<Phase, string[]> = {
  gate: ["G3"],
  "0":  ["B0"],
  "1":  ["B5", "B6", "B11", "B2a", "B9", "B10", "B7", "B1", "B8", "B12", "B2b", "B3", "B4"],
  "2":  ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16"],
  "3":  ["R1", "R2", "R3", "R4", "R5"],
};

function getPipelinePosition(node: GraphNode): { x: number; y: number } {
  const phase = phaseOf(node);
  const order = PIPELINE_ORDER[phase];
  const idx = order.indexOf(node.id);
  const indexInLane = idx === -1 ? 99 : idx;
  // Lane Y centers (top to bottom: gate, 0, 1, 2, 3)
  const laneOrder: Phase[] = ["gate", "0", "1", "2", "3"];
  const laneIdx = laneOrder.indexOf(phase);
  const y = 100 + laneIdx * (PIPELINE_LANE_HEIGHT + PIPELINE_LANE_GAP) + PIPELINE_LANE_HEIGHT / 2;
  const x = PIPELINE_LEFT_MARGIN + indexInLane * PIPELINE_NODE_SPACING;
  return { x, y };
}

// Cluster lanes — derived from the curated NODE_TABLE x positions in
// src/lib/dependency-graph.ts. Each lane is a semantic group.
interface ClusterDef {
  id: string;
  name: string;
  xMax: number; // nodes with x < xMax belong to this cluster (last cluster: xMax = Infinity)
  blurb: string;
}
const CLUSTER_DEFS: ClusterDef[] = [
  { id: "g3-chain",    name: "G3 chain",    xMax: 250,  blurb: "Pending vet sign-off + its blocked children" },
  { id: "antagonism",  name: "Antagonisms", xMax: 470,  blurb: "B2a + penalty normalization" },
  { id: "b7-hub",      name: "B7 hub",      xMax: 690,  blurb: "Canonical namespace + direct children" },
  { id: "schema",      name: "Schema",      xMax: 910,  blurb: "B8 / B12 / C5 schema hardening" },
  { id: "validation",  name: "Validation",  xMax: 1130, blurb: "B5's 6 validation fixes + CI gates" },
  { id: "regression",  name: "Regression",  xMax: 1350, blurb: "Phase-3 regression suite R1–R5" },
  { id: "independents",name: "Independents",xMax: Infinity, blurb: "Self-contained fixes (B0 backstop + standalone cleanups)" },
];

function deriveCluster(node: GraphNode): ClusterDef {
  for (const c of CLUSTER_DEFS) {
    if (node.x < c.xMax) return c;
  }
  return CLUSTER_DEFS[CLUSTER_DEFS.length - 1];
}

// ---------- color system ----------
//
// Structural colors (fills, borders, text, panels) use CSS variables so the
// graph adapts to light/dark/opencode/ergonomic themes automatically.
// Semantic colors (severity, edge-kind, status, kind accent) are kept as
// oklch literals so they read identically across themes — instant recognition.
// T6a: constants moved to ./graph/graph-constants.ts (shared with extracted sub-components).
import {
  SEVERITY_COLOR,
  EDGE_COLOR,
  EDGE_DASH,
  EDGE_WIDTH,
  KIND_ACCENT,
  STATUS_COLOR,
  CV,
} from "./graph/graph-constants";
import { GraphLegend } from "./graph/graph-legend";
import { GraphToolbar } from "./graph/graph-toolbar";
// T6c: GraphCanvas + useGraphViewport extraction (FEATURE-FLAGGED).
// The split-canvas path is gated on NEXT_PUBLIC_GRAPH_SPLIT=v1; the
// LegacyCanvas (the inline <svg> JSX below) stays as the default fallback.
import { GraphCanvas } from "./graph/graph-canvas";

// T6c: feature flag — when true, render <GraphCanvas> instead of the inline
// LegacyCanvas <svg>. Defaults to OFF so the LegacyCanvas is untouched.
// Blueprint §T6c verification STEP 3 (VLM pixel-diff) must pass before
// flipping this default in .env.
const USE_SPLIT_CANVAS = process.env.NEXT_PUBLIC_GRAPH_SPLIT === "v1";

// ---------- deterministic PRNG (mulberry32) ----------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- force simulation (pure TS, O(n²) — fine for 36 nodes) ----------
//
// Forces applied per iteration:
//   1. Charge repulsion (Coulomb): every pair of nodes repels with force ~k_charge / d²
//   2. Link spring (Hooke): each edge pulls its endpoints toward linkDistance
//   3. Centering: gentle pull toward initial centroid
//   4. Collision (circle-circle): separate overlapping nodes (radius = collisionR)
//
// Cooling: alpha = 1 - iter/iterations decays force magnitudes.
// Damping: velocity *= 0.85 each tick (prevents oscillation).
// Determinism: seeded mulberry32 supplies jitter when nodes coincide — same input
// always produces the same output, so the layout is identical every render.

interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface ForceSimOptions {
  iterations?: number;
  chargeStrength?: number;   // negative = repulsion
  linkDistance?: number;
  linkStrength?: number;
  centerStrength?: number;
  collisionRadius?: number;
  damping?: number;
  seed?: number;
}

function runForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  opts: ForceSimOptions = {},
): Map<string, { x: number; y: number }> {
  const {
    iterations = 400,
    chargeStrength = -900,
    linkDistance = 130,
    linkStrength = 0.12,
    centerStrength = 0.035,
    collisionRadius = 78,
    damping = 0.82,
    seed = 1337,
  } = opts;

  const rand = mulberry32(seed);

  // Initialize sim nodes from curated NODE_TABLE positions.
  // Deterministic micro-jitter (±4px) breaks exact ties that would otherwise
  // cause divide-by-zero in the charge step.
  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x + (rand() - 0.5) * 8,
    y: n.y + (rand() - 0.5) * 8,
    vx: 0,
    vy: 0,
  }));
  const idToIdx = new Map<string, number>();
  simNodes.forEach((n, i) => idToIdx.set(n.id, i));

  // Initial centroid (curated layout is the anchor — we don't want to drift far).
  const cx0 = simNodes.reduce((s, n) => s + n.x, 0) / Math.max(1, simNodes.length);
  const cy0 = simNodes.reduce((s, n) => s + n.y, 0) / Math.max(1, simNodes.length);

  // Filter to edges whose endpoints exist in the node set.
  const links = edges
    .filter((e) => idToIdx.has(e.from) && idToIdx.has(e.to))
    .map((e) => ({
      s: idToIdx.get(e.from)!,
      t: idToIdx.get(e.to)!,
    }));

  const N = simNodes.length;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;
    const alphaCharge = alpha * Math.abs(chargeStrength);

    // 1. Charge repulsion (O(n²))
    for (let i = 0; i < N; i++) {
      const a = simNodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = simNodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy;
        if (dist2 < 0.01) {
          // Coincident nodes — deterministic jitter
          dx = (rand() - 0.5) * 2;
          dy = (rand() - 0.5) * 2;
          dist2 = dx * dx + dy * dy + 0.01;
        }
        const dist = Math.sqrt(dist2);
        // Clamp force to avoid explosions at very small d
        const force = Math.min(alphaCharge / dist2, 50);
        const fx = (dx / dist) * force * Math.sign(chargeStrength);
        const fy = (dy / dist) * force * Math.sign(chargeStrength);
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // 2. Link spring (Hooke)
    for (const link of links) {
      const a = simNodes[link.s];
      const b = simNodes[link.t];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const diff = dist - linkDistance;
      const f = diff * linkStrength * alpha;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // 3. Centering (gentle pull toward initial centroid)
    for (const n of simNodes) {
      n.vx += (cx0 - n.x) * centerStrength * alpha;
      n.vy += (cy0 - n.y) * centerStrength * alpha;
    }

    // 4. Apply velocity (with damping) BEFORE collision so collision can
    //    resolve overlaps immediately.
    for (const n of simNodes) {
      n.vx *= damping;
      n.vy *= damping;
      // Cap per-tick displacement to avoid blowups
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      const maxStep = 30;
      if (speed > maxStep) {
        n.vx = (n.vx / speed) * maxStep;
        n.vy = (n.vy / speed) * maxStep;
      }
      n.x += n.vx;
      n.y += n.vy;
    }

    // 5. Collision (circle-circle, radius = collisionRadius)
    const minDist = collisionRadius * 2;
    for (let i = 0; i < N; i++) {
      const a = simNodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = simNodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist && dist > 0.01) {
          const overlap = (minDist - dist) / 2;
          const ox = (dx / dist) * overlap;
          const oy = (dy / dist) * overlap;
          a.x -= ox;
          a.y -= oy;
          b.x += ox;
          b.y += oy;
        } else if (dist <= 0.01) {
          // Exact coincidence — deterministic nudge
          a.x -= 1;
          b.x += 1;
        }
      }
    }
  }

  const result = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) result.set(n.id, { x: n.x, y: n.y });
  return result;
}

// ---------- geometry helpers ----------

/** Point on a node's bounding rect intersected by a ray at given angle from center. */
function nodeAnchorAtAngle(
  cx: number,
  cy: number,
  angle: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Intersect ray with rect — find t such that |t·dx| = w/2 or |t·dy| = h/2
  const tX = Math.abs(dx) > 1e-6 ? (w / 2) / Math.abs(dx) : Infinity;
  const tY = Math.abs(dy) > 1e-6 ? (h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}

interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  midX: number;
  midY: number;
  pathD: string;
}

/**
 * Compute curved cubic-bezier path between two node centers, with:
 *   - Anchors on the node bounding-rect perimeter (ray-cast from center)
 *   - Slight curvature perpendicular to the edge direction
 *   - Per-edge fan offset so multi-edge hubs spread their endpoints radially
 */
function buildEdgeGeometry(
  fromCx: number, fromCy: number,
  toCx: number, toCy: number,
  fromW: number, fromH: number,
  toW: number, toH: number,
  fanOffset: number, // perpendicular offset for fan-out (0 = straight)
): EdgeGeometry {
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
  const ux = dx / dist;
  const uy = dy / dist;
  // Perpendicular unit vector
  const px = -uy;
  const py = ux;

  // Source anchor: ray from from-center toward to-center (with fan offset applied at the rect)
  const sAngle = Math.atan2(uy + fanOffset * 0.6, ux);
  const sAnchor = nodeAnchorAtAngle(fromCx, fromCy, sAngle, fromW, fromH);
  // Target anchor: ray from to-center toward from-center (reverse)
  const tAngle = Math.atan2(-uy + fanOffset * 0.6, -ux);
  const tAnchor = nodeAnchorAtAngle(toCx, toCy, tAngle, toW, toH);

  const x1 = sAnchor.x;
  const y1 = sAnchor.y;
  const x2 = tAnchor.x;
  const y2 = tAnchor.y;

  // Cubic bezier control points — biased along the edge direction by 40% of dist,
  // with a perpendicular curvature proportional to fanOffset (creates the bundle curve).
  const curveBias = 0.4;
  const lateral = fanOffset * dist * 0.25;
  const cx1 = x1 + ux * dist * curveBias + px * lateral;
  const cy1 = y1 + uy * dist * curveBias + py * lateral;
  const cx2 = x2 - ux * dist * curveBias + px * lateral;
  const cy2 = y2 - uy * dist * curveBias + py * lateral;

  // Bezier midpoint (t=0.5): B(0.5) = 0.125·P0 + 0.375·P1 + 0.375·P2 + 0.125·P3
  const midX = 0.125 * x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * x2;
  const midY = 0.125 * y1 + 0.375 * cy1 + 0.375 * cy2 + 0.125 * y2;

  const pathD = `M ${x1.toFixed(2)} ${y1.toFixed(2)} C ${cx1.toFixed(2)} ${cy1.toFixed(2)}, ${cx2.toFixed(2)} ${cy2.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;

  return { x1, y1, x2, y2, cx1, cy1, cx2, cy2, midX, midY, pathD };
}

// ---------- label helpers ----------

function splitLabel(label: string): { line1: string; line2: string } {
  const idx = label.indexOf(" · ");
  if (idx === -1) return { line1: label, line2: "" };
  return { line1: label.slice(0, idx), line2: label.slice(idx + 3) };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

// ---------- module-level caches ----------

let graphDataCache: DependencyGraphData | null = null;
let layoutCache: { hash: string; positions: Map<string, { x: number; y: number }> } | null = null;

function dataHash(d: DependencyGraphData): string {
  // Cheap structural hash: ids + edge endpoints
  return (
    d.nodes.map((n) => n.id).join(",") +
    "|" +
    d.edges.map((e) => `${e.from}->${e.to}`).join(",")
  );
}

/**
 * Returns the curated node positions directly — NO force simulation.
 *
 * The curated NODE_TABLE positions in src/lib/dependency-graph.ts are already
 * semantically meaningful (6 lanes: G3-chain, antagonisms, B7-hub, schema,
 * validation, regression, independents). Running a force simulation on top
 * of them relaxes the positions in ways that look "natural" but actually
 * make the graph HARDER to read because:
 *   - nodes drift away from their lane assignments
 *   - the deterministic structure becomes stochastic
 *   - users can't predict where a node will be
 *
 * The force simulation is still available (runForceSimulation) for a future
 * "organic layout" toggle, but the default is the curated layout — which is
 * what the deep dependency analysis recommended.
 */
function getLayout(d: DependencyGraphData): Map<string, { x: number; y: number }> {
  const h = dataHash(d);
  if (layoutCache && layoutCache.hash === h) return layoutCache.positions;
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of d.nodes) positions.set(n.id, { x: n.x, y: n.y });
  layoutCache = { hash: h, positions };
  return positions;
}

// ---------- NodeView (memoized) ----------

interface NodeViewProps {
  node: GraphNode;
  pos: { x: number; y: number };
  isSelected: boolean;
  isMatch: boolean;
  hasSearch: boolean;
  isOnCriticalPath: boolean;
  criticalMode: boolean;
  degree: number;
  zoom: number;
  showDetail: boolean; // description + degree badge visible
  dimmed: boolean;     // hub-only mode dim
  isHoverDimmed: boolean; // neighbor-highlight dim (Obsidian-style)
  isOnPath: boolean;      // on highlighted shortest path
  isDragged: boolean;     // currently being dragged
  isPathSource: boolean;  // marked as path-finding source
  onClick: (node: GraphNode, e: React.MouseEvent) => void;
  onHoverEnter: (id: string) => void;
  onHoverLeave: () => void;
  onContextMenu: (node: GraphNode, e: React.MouseEvent) => void;
  onPointerDown: (e: React.PointerEvent<SVGGElement>, node: GraphNode) => void;
  onDoubleClick: (node: GraphNode) => void;
}

const NodeView = React.memo(function NodeView({
  node, pos, isSelected, isMatch, hasSearch, isOnCriticalPath, criticalMode,
  degree, zoom, showDetail, dimmed, isHoverDimmed, isOnPath, isDragged, isPathSource,
  onClick, onHoverEnter, onHoverLeave, onContextMenu, onPointerDown, onDoubleClick,
}: NodeViewProps) {
  const { line1, line2 } = splitLabel(node.label);
  const accentColor =
    node.kind === "gate"
      ? KIND_ACCENT.gate
      : node.severity
        ? SEVERITY_COLOR[node.severity]
        : KIND_ACCENT.task;
  const baseStroke = KIND_ACCENT[node.kind];

  // Dimming priority: hub-only mode > hover-dim > critical-mode > search > default
  let opacity = 1;
  let grayscale = 0;
  if (dimmed) opacity = 0.12;
  else if (isHoverDimmed) { opacity = 0.18; grayscale = 1; }
  else if (criticalMode && !isOnCriticalPath) opacity = 0.25;
  else if (hasSearch && !isMatch) opacity = 0.15;

  const sb = node.status ?? null;
  const truncatedLine2 = truncate(line2, 26);
  const badgeText = sb === "urgent" ? "URGENT"
    : sb === "pending" ? "PENDING"
    : sb === "independent" ? "INDEP"
    : sb === "resolved" ? "DONE"
    : "";
  const badgeW = badgeText.length * 6.2 + 10;
  const badgeColor = sb ? STATUS_COLOR[sb] : "";

  const isHub = degree >= HUB_DEGREE;
  const isMegaHub = degree >= MEGA_HUB_DEGREE;
  const borderWidth = isSelected ? 2.5 : isMegaHub ? 2 : isHub ? 1.5 : 1;
  const labelWeight = isMegaHub ? 800 : isHub ? 700 : 600;

  // Scale-aware font sizes (smaller when zoomed in to keep visual weight balanced)
  // We render at base size; the <g transform scale> handles actual zoom.
  const showDesc = showDetail && !!truncatedLine2;
  const showBadge = showDetail && isHub;
  const showStatus = zoom >= ZOOM_HUB_ONLY;

  // Visual filter stack: hover-dim grayscale + selection/critical glow + drag shadow lift
  let filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.08))";
  if (isDragged) filter = "drop-shadow(0 8px 16px rgba(0,0,0,0.28))";
  else if (isSelected) filter = `drop-shadow(0 0 6px var(--primary))`;
  else if (isMegaHub) filter = `drop-shadow(0 0 5px ${accentColor}aa)`;
  else if (isOnCriticalPath && criticalMode) filter = `drop-shadow(0 0 3px ${SEVERITY_COLOR.P0}88)`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g
            data-node-id={node.id}
            transform={`translate(${pos.x - NODE_WIDTH / 2}, ${pos.y - NODE_HEIGHT / 2})`}
            style={{
              cursor: isDragged ? "grabbing" : "grab",
              opacity,
              transition: "opacity 150ms ease-out",
              filter,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClick(node, e);
            }}
            onMouseEnter={() => onHoverEnter(node.id)}
            onMouseLeave={() => onHoverLeave()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(node, e);
            }}
            onPointerDown={(e) => onPointerDown(e, node)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick(node);
            }}
          >
            <g
              className="transition-transform duration-120 ease-out [transform-box:fill-box] [transform-origin:center] hover:scale-[1.06]"
              style={{ filter: grayscale ? "grayscale(1)" : undefined }}
            >
              {/* Path-finding source marker (dashed violet ring) */}
              {isPathSource && (
                <rect
                  x={-7}
                  y={-7}
                  width={NODE_WIDTH + 14}
                  height={NODE_HEIGHT + 14}
                  rx={12}
                  ry={12}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.85}
                >
                  <animate
                    attributeName="opacity"
                    values="0.85;0.4;0.85"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              {/* Shortest-path pulse ring (bright primary, animated) */}
              {isOnPath && (
                <rect
                  x={-5}
                  y={-5}
                  width={NODE_WIDTH + 10}
                  height={NODE_HEIGHT + 10}
                  rx={11}
                  ry={11}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  opacity={0.9}
                >
                  <animate
                    attributeName="stroke-width"
                    values="2;4;2"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.9;0.45;0.9"
                    dur="1.2s"
                    repeatCount="indefinite"
                  />
                </rect>
              )}
              {/* Mega-hub outer glow ring (soft halo) */}
              {isMegaHub && (
                <rect
                  x={-5}
                  y={-5}
                  width={NODE_WIDTH + 10}
                  height={NODE_HEIGHT + 10}
                  rx={12}
                  ry={12}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={1}
                  opacity={0.35}
                />
              )}
              {/* Main body */}
              <rect
                x={0}
                y={0}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                ry={8}
                fill={CV.card}
                stroke={isSelected ? "var(--primary)" : isMegaHub ? accentColor : isHub ? baseStroke : CV.border}
                strokeWidth={borderWidth}
              />
              {/* Left-edge accent bar (severity/kind) */}
              <rect
                x={0}
                y={0}
                width={4}
                height={NODE_HEIGHT}
                rx={2}
                ry={2}
                fill={accentColor}
              />
              {/* Kind indicator dot (top-left) */}
              <circle cx={14} cy={12} r={3} fill={baseStroke} opacity={0.85} />
              {/* Label line 1 — ID */}
              <text
                x={NODE_WIDTH / 2 + 2}
                y={showDesc ? 24 : 32}
                textAnchor="middle"
                fontSize={13}
                fontWeight={labelWeight}
                fill={CV.foreground}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {line1}
              </text>
              {/* Label line 2 — description */}
              {showDesc && (
                <text
                  x={NODE_WIDTH / 2 + 2}
                  y={42}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={400}
                  fill={CV.mutedForeground}
                >
                  {truncatedLine2}
                </text>
              )}
              {/* Degree badge (top-right, hub/mega-hub only) */}
              {showBadge && (
                <g transform={`translate(${NODE_WIDTH - 18}, 6)`}>
                  <circle cx={6} cy={6} r={6.5} fill={accentColor} opacity={0.92} />
                  <text
                    x={6}
                    y={9.2}
                    textAnchor="middle"
                    fontSize={8.5}
                    fontWeight={700}
                    fill="white"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {degree}
                  </text>
                </g>
              )}
              {/* Status badge OUTSIDE the node top-right corner */}
              {showStatus && sb && (
                <g transform={`translate(${NODE_WIDTH + 3}, 0)`}>
                  <rect
                    x={0}
                    y={-13}
                    width={badgeW}
                    height={14}
                    rx={3}
                    fill={badgeColor}
                  />
                  <text
                    x={badgeW / 2}
                    y={-3}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={700}
                    fill="white"
                    fontFamily="ui-monospace, SFMono-Regular, monospace"
                  >
                    {badgeText}
                  </text>
                  {sb === "urgent" && (
                    <circle cx={4} cy={-6} r={2} fill="white">
                      <animate
                        attributeName="opacity"
                        values="1;0.15;1"
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    </circle>
                  )}
                </g>
              )}
            </g>
          </g>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[320px]">
          <div className="text-xs">
            <div className="font-mono font-bold mb-0.5">{line1}</div>
            {line2 && <div className="text-muted-foreground mb-1.5">{line2}</div>}
            <div className="text-[11px] leading-relaxed">{node.description}</div>
            {isMegaHub && (
              <div className="mt-1 text-[10px] font-semibold text-primary">MEGA HUB · {degree} edges</div>
            )}
            {isHub && !isMegaHub && (
              <div className="mt-1 text-[10px] font-semibold text-muted-foreground">HUB · {degree} edges</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ---------- EdgeView (memoized) ----------

interface EdgeViewProps {
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
  fromW: number;
  fromH: number;
  toW: number;
  toH: number;
  kind: EdgeKind;
  label?: string;
  fanOffset: number;
  isHighlighted: boolean; // connected to selected node
  isFaded: boolean;       // selection dim
  isOnCriticalPath: boolean;
  criticalMode: boolean;
  showLabel: boolean;
  isHovered: boolean;
  isHoverDimmed: boolean; // neighbor-highlight dim (Obsidian-style)
  isOnPath: boolean;      // on highlighted shortest path
  enableParticles: boolean; // render particle flow for "blocks" edges
  pathId: string;         // unique id for the <path> (used by animateMotion mpath)
  onHover: (key: string | null) => void;
  edgeKey: string;
}

const EdgeView = React.memo(function EdgeView({
  fromPos, toPos, fromW, fromH, toW, toH, kind, label, fanOffset,
  isHighlighted, isFaded, isOnCriticalPath, criticalMode, showLabel, isHovered,
  isHoverDimmed, isOnPath, enableParticles, pathId,
  onHover, edgeKey,
}: EdgeViewProps) {
  const geo = buildEdgeGeometry(
    fromPos.x, fromPos.y, toPos.x, toPos.y,
    fromW, fromH, toW, toH, fanOffset,
  );
  const baseWidth = EDGE_WIDTH[kind];
  const width = isHighlighted || isHovered ? baseWidth + 0.8 : baseWidth;
  const color = EDGE_COLOR[kind];
  const dash = EDGE_DASH[kind];

  let opacity = 1;
  if (criticalMode && !isOnCriticalPath) opacity = 0.18;
  else if (isFaded) opacity = 0.22;
  if (isHoverDimmed) opacity = 0.12;
  if (kind === "backstops") opacity *= 0.7;

  const renderLabel = (showLabel || isHovered) && !!label;
  const renderParticles = enableParticles && kind === "blocks" && !isOnPath;

  return (
    <g
      data-edge-key={edgeKey}
      style={{ opacity, transition: "opacity 150ms ease-out" }}
      onMouseEnter={() => onHover(edgeKey)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Wider invisible hit-area for hover */}
      <path
        d={geo.pathD}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(14, width + 10)}
        strokeLinecap="round"
        style={{ cursor: label ? "help" : "default" }}
      />
      <path
        id={pathId}
        d={geo.pathD}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
        markerEnd={`url(#arrow-${kind})`}
      />
      {/* Shortest-path overlay: bright primary, wider, animated particle */}
      {isOnPath && (
        <>
          <path
            d={geo.pathD}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={Math.max(4, width + 2.5)}
            strokeLinecap="round"
            opacity={0.85}
            style={{ filter: "drop-shadow(0 0 4px var(--primary))" }}
          />
          <circle r={3} fill="var(--primary)" opacity={0.95}>
            <animateMotion dur="1.6s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        </>
      )}
      {/* Particle flow for "blocks" edges (Cosmos.gl-style direction indicator) */}
      {renderParticles && (
        <>
          <circle r={2.2} fill={color} opacity={0.85}>
            <animateMotion dur="2.8s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
          <circle r={2.2} fill={color} opacity={0.7}>
            <animateMotion dur="2.8s" begin="1.4s" repeatCount="indefinite" rotate="auto">
              <mpath href={`#${pathId}`} />
            </animateMotion>
          </circle>
        </>
      )}
      {renderLabel && (
        <g transform={`translate(${geo.midX}, ${geo.midY})`} pointerEvents="none">
          <rect
            x={-((label!.length * 5.8 + 14) / 2)}
            y={-11}
            width={label!.length * 5.8 + 14}
            height={22}
            rx={6}
            ry={6}
            fill={CV.popover}
            stroke={color}
            strokeWidth={1.2}
            opacity={0.97}
          />
          <text
            x={0}
            y={4.5}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill={color}
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
});

// ---------- MegaNodeView (collapsed cluster) ----------

interface MegaNodeViewProps {
  cluster: ClusterDef;
  pos: { x: number; y: number };
  memberCount: number;
  kindCounts: Record<NodeKind, number>;
  isSelected: boolean;
  onClick: () => void;
}

const MegaNodeView = React.memo(function MegaNodeView({
  cluster, pos, memberCount, kindCounts, isSelected, onClick,
}: MegaNodeViewProps) {
  const kinds = (Object.keys(kindCounts) as NodeKind[]).filter((k) => kindCounts[k] > 0);
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <g
            data-mega-node={cluster.id}
            transform={`translate(${pos.x - MEGA_NODE_WIDTH / 2}, ${pos.y - MEGA_NODE_HEIGHT / 2})`}
            style={{
              cursor: "pointer",
              filter: isSelected
                ? `drop-shadow(0 0 8px var(--primary))`
                : "drop-shadow(0 2px 6px rgba(0,0,0,0.18))",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <g className="transition-transform duration-150 ease-out [transform-box:fill-box] [transform-origin:center] hover:scale-[1.03]">
              <rect
                x={0}
                y={0}
                width={MEGA_NODE_WIDTH}
                height={MEGA_NODE_HEIGHT}
                rx={12}
                ry={12}
                fill={CV.accent}
                stroke={isSelected ? "var(--primary)" : CV.border}
                strokeWidth={isSelected ? 2.5 : 1.5}
              />
              {/* Header strip */}
              <rect
                x={0}
                y={0}
                width={MEGA_NODE_WIDTH}
                height={24}
                rx={12}
                ry={12}
                fill="var(--primary)"
                opacity={0.12}
              />
              {/* Cluster name */}
              <text
                x={12}
                y={17}
                fontSize={12}
                fontWeight={700}
                fill={CV.foreground}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                {cluster.name}
              </text>
              {/* Count badge */}
              <g transform={`translate(${MEGA_NODE_WIDTH - 28}, 6)`}>
                <rect x={0} y={0} width={22} height={14} rx={3} fill="var(--primary)" />
                <text
                  x={11}
                  y={10.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight={700}
                  fill={CV.primaryForeground}
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  {memberCount}
                </text>
              </g>
              {/* Kind dot legend */}
              <g transform="translate(12, 42)">
                {kinds.map((k, i) => (
                  <g key={k} transform={`translate(${i * 56}, 0)`}>
                    <circle cx={5} cy={5} r={4} fill={KIND_ACCENT[k]} />
                    <text x={13} y={8.5} fontSize={9.5} fill={CV.mutedForeground}>
                      {kinds.length > 1 ? `${k}·${kindCounts[k]}` : `${kindCounts[k]} ${k}`}
                    </text>
                  </g>
                ))}
              </g>
              {/* Hint: click to expand */}
              <text
                x={MEGA_NODE_WIDTH - 8}
                y={MEGA_NODE_HEIGHT - 6}
                textAnchor="end"
                fontSize={9}
                fill={CV.mutedForeground}
                fontStyle="italic"
              >
                click to expand
              </text>
            </g>
          </g>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[300px]">
          <div className="text-xs">
            <div className="font-mono font-bold mb-0.5">{cluster.name}</div>
            <div className="text-muted-foreground mb-1.5">{cluster.blurb}</div>
            <div className="text-[11px] leading-relaxed">
              {memberCount} nodes collapsed. Click to expand and inspect individual entries.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

// ---------- Mini-map ----------

const MINIMAP_W = 168;
const MINIMAP_H = 124;

interface MinimapProps {
  nodes: GraphNode[];
  positions: Map<string, { x: number; y: number }>;
  collapsedClusters: Set<string>;
  clusterCentroids: Map<string, { x: number; y: number }>;
  viewBox: { x: number; y: number; w: number; h: number };
  transform: { x: number; y: number; scale: number };
  onPanTo: (worldX: number, worldY: number) => void;
}

const Minimap = React.memo(function Minimap({
  nodes, positions, collapsedClusters, clusterCentroids, viewBox, transform, onPanTo,
}: MinimapProps) {
  // Visible world rect (in world coords)
  const s = transform.scale;
  const visX = (viewBox.x - transform.x) / s;
  const visY = (viewBox.y - transform.y) / s;
  const visW = viewBox.w / s;
  const visH = viewBox.h / s;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const move = (clientX: number, clientY: number) => {
      const sx = (clientX - rect.left) / rect.width;
      const sy = (clientY - rect.top) / rect.height;
      const worldX = viewBox.x + sx * viewBox.w;
      const worldY = viewBox.y + sy * viewBox.h;
      onPanTo(worldX, worldY);
    };
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className="absolute bottom-3 right-3 z-20 rounded-md border backdrop-blur overflow-hidden shadow-sm"
      style={{
        background: "color-mix(in oklch, var(--popover) 88%, transparent)",
        borderColor: CV.border,
        width: MINIMAP_W,
        height: MINIMAP_H,
      }}
    >
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        width={MINIMAP_W}
        height={MINIMAP_H}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: "crosshair", display: "block" }}
        onPointerDown={handlePointerDown}
      >
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.w}
          height={viewBox.h}
          fill="color-mix(in oklch, var(--muted) 35%, transparent)"
        />
        {/* Nodes as small dots — dim those in collapsed clusters */}
        {nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const cluster = deriveCluster(n);
          const isCollapsed = collapsedClusters.has(cluster.id);
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={Math.max(8, NODE_WIDTH * 0.08)}
              fill={KIND_ACCENT[n.kind]}
              opacity={isCollapsed ? 0.25 : 0.85}
            />
          );
        })}
        {/* Mega-nodes for collapsed clusters */}
        {Array.from(collapsedClusters).map((cid) => {
          const c = CLUSTER_DEFS.find((d) => d.id === cid);
          const ctr = clusterCentroids.get(cid);
          if (!c || !ctr) return null;
          return (
            <rect
              key={cid}
              x={ctr.x - MEGA_NODE_WIDTH / 2}
              y={ctr.y - MEGA_NODE_HEIGHT / 2}
              width={MEGA_NODE_WIDTH}
              height={MEGA_NODE_HEIGHT}
              rx={10}
              fill="var(--primary)"
              opacity={0.45}
            />
          );
        })}
        {/* Viewport rectangle */}
        <rect
          x={visX}
          y={visY}
          width={visW}
          height={visH}
          fill="none"
          stroke="var(--destructive)"
          strokeWidth={Math.max(2, 8 / s)}
        />
      </svg>
    </div>
  );
});

// ---------- Inspector ----------

function edgeKindBadgeClass(kind: EdgeKind): string {
  switch (kind) {
    case "blocks":
      return "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300";
    case "recommended":
      return "border-sky-400 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300";
    case "pending":
      return "border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300";
    case "backstops":
      return "border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300";
  }
}

interface InspectorProps {
  node: GraphNode | null;
  edges: GraphEdge[];
  nodesById: Map<string, GraphNode>;
  degree: number;
  onNodeClick: (node: GraphNode) => void;
  onJumpToNode: (node: GraphNode) => void;
  onCenterOn: (node: GraphNode) => void;
}

function Inspector({ node, edges, nodesById, degree, onNodeClick, onJumpToNode, onCenterOn }: InspectorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const incoming = useMemo(
    () => (node ? edges.filter((e) => e.to === node.id) : []),
    [node, edges],
  );
  const outgoing = useMemo(
    () => (node ? edges.filter((e) => e.from === node.id) : []),
    [node, edges],
  );
  const onCriticalPath = node ? CRITICAL_PATH.has(node.id) : false;
  const isHub = degree >= HUB_DEGREE;
  const isMegaHub = degree >= MEGA_HUB_DEGREE;

  return (
    <aside
      // §12.6: stamped so the split-canvas click-outside handler
      // (onClickAway in the orchestrator) can detect "click landed inside
      // the Inspector" and keep the popover open. The LegacyCanvas path is
      // unaffected (it uses stopPropagation + SVG-level onBackgroundClick).
      data-graph-inspector
      className="hidden md:flex w-80 border-l bg-muted/30 flex-col shrink-0"
      aria-label="Node inspector"
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">Inspector</div>
          <div className="text-[10px] text-muted-foreground">
            {node ? "Selected node" : "Click a node to inspect"}
          </div>
        </div>
        {node && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </Button>
        )}
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-3 max-h-[calc(82vh-72px)]">
          {node ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-base">{node.id}</span>
                  <Badge variant="outline" className="text-[10px] h-5 gap-1">
                    {node.kind === "gate" ? <Shield className="h-3 w-3" /> :
                     node.kind === "task" ? <CheckSquare className="h-3 w-3" /> :
                     <Network className="h-3 w-3" />}
                    {node.kind}
                  </Badge>
                  {node.severity && (
                    <Badge
                      variant="outline"
                      className="text-[10px] h-5"
                      style={{
                        borderColor: SEVERITY_COLOR[node.severity],
                        color: SEVERITY_COLOR[node.severity],
                      }}
                    >
                      {node.severity}
                    </Badge>
                  )}
                  {isMegaHub && (
                    <Badge className="text-[10px] h-5 gap-1 bg-rose-500 hover:bg-rose-500">
                      <Zap className="h-3 w-3" /> MEGA HUB · {degree}
                    </Badge>
                  )}
                  {isHub && !isMegaHub && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                      <Zap className="h-3 w-3" /> HUB · {degree}
                    </Badge>
                  )}
                  {onCriticalPath && (
                    <Badge className="text-[10px] h-5 gap-1 bg-amber-500 hover:bg-amber-500">
                      <Zap className="h-3 w-3" />
                      Critical path
                    </Badge>
                  )}
                </div>
                <div className="text-xs font-medium mt-1.5">{splitLabel(node.label).line2 || node.label}</div>
              </div>

              {node.status && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Status</div>
                  {node.status === "pending" && (
                    <div className="text-xs px-2 py-1.5 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                      PENDING — gate has not yet been satisfied
                    </div>
                  )}
                  {node.status === "urgent" && (
                    <div className="text-xs px-2 py-1.5 rounded bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800">
                      URGENT — CI is RED today
                    </div>
                  )}
                  {node.status === "independent" && (
                    <div className="text-xs px-2 py-1.5 rounded bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                      INDEPENDENT — can start now
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Description</div>
                <div className="text-xs leading-relaxed">{node.description}</div>
              </div>

              {incoming.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Blocked by ({incoming.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {incoming.map((e) => {
                      const n = nodesById.get(e.from);
                      return (
                        <button
                          key={`${e.from}-${e.to}`}
                          onClick={() => n && onNodeClick(n)}
                          className="flex items-center gap-2 text-left px-2 py-1 rounded border bg-background hover:bg-accent transition-colors"
                        >
                          <span className="font-mono text-[11px] font-bold w-10 shrink-0">{e.from}</span>
                          <span className="text-[10px] text-muted-foreground flex-1 truncate">
                            {n ? splitLabel(n.label).line2 : ""}
                          </span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-mono font-semibold shrink-0", edgeKindBadgeClass(e.kind))}>
                            {e.kind}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {outgoing.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Blocks ({outgoing.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {outgoing.map((e) => {
                      const n = nodesById.get(e.to);
                      return (
                        <button
                          key={`${e.from}-${e.to}`}
                          onClick={() => n && onNodeClick(n)}
                          className="flex items-center gap-2 text-left px-2 py-1 rounded border bg-background hover:bg-accent transition-colors"
                        >
                          <span className="font-mono text-[11px] font-bold w-10 shrink-0">{e.to}</span>
                          <span className="text-[10px] text-muted-foreground flex-1 truncate">
                            {n ? splitLabel(n.label).line2 : ""}
                          </span>
                          <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-mono font-semibold shrink-0", edgeKindBadgeClass(e.kind))}>
                            {e.kind}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5 pt-1">
                <Button
                  size="sm"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={() => onJumpToNode(node)}
                >
                  <CornerDownRight className="h-3.5 w-3.5" />
                  Jump to first occurrence
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs gap-1.5"
                  onClick={() => onCenterOn(node)}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Center on this node
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground space-y-3">
              <p>Click a node in the graph to see its description, dependencies, and a button to jump to its first occurrence in the documentation.</p>
              <div className="p-2.5 rounded border bg-muted/40 text-[11px] space-y-1">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5" />
                  Quick tips
                </div>
                <ul className="space-y-0.5 list-disc pl-4">
                  <li>Click a node to inspect</li>
                  <li>Drag background to pan (momentum applied)</li>
                  <li>Scroll to zoom (cursor-anchored)</li>
                  <li>Click a cluster mega-node to expand</li>
                  <li>Hover an edge to see its label</li>
                  <li>Press <kbd className="px-1 py-0.5 rounded bg-background border text-[10px] font-mono">?</kbd> for shortcuts</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

// ---------- Help Overlay ----------

function HelpOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  const shortcuts: [string, string][] = [
    ["+ / =", "Zoom in"],
    ["- / _", "Zoom out"],
    ["0", "Reset zoom"],
    ["f", "Fit to view"],
    ["p", "Toggle pipeline / timeline view"],
    ["c", "Toggle all clusters collapse"],
    ["Arrow keys", "Pan (or navigate neighbors when a node is selected)"],
    ["n", "Cycle to next neighbor of selected node"],
    ["Alt+Click / Shift+Click", "Find shortest path from selected node"],
    ["Right-click node", "Context menu (center, jump, find path, copy ID)"],
    ["Drag node", "Reposition (session-only); double-click to reset"],
    ["Enter", "Jump to first occurrence (when node selected)"],
    ["Esc", "Close dialog / clear path / close menu"],
    ["?", "Toggle this help"],
  ];
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-lg p-4 max-w-sm w-[90%]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Keyboard shortcuts
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ul className="space-y-1.5 text-xs">
          {shortcuts.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-[11px]">{key}</kbd>
              <span className="text-muted-foreground text-right">{desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------- filter chip ----------

interface FilterChipProps {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}
function FilterChip({ label, active, color, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-full text-[11px] font-medium border transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground",
      )}
      style={active && color ? { background: color, borderColor: color, color: "white" } : undefined}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

// ---------- graph statistics + export helpers ----------

interface GraphStats {
  nodes: number;
  edges: number;
  components: number;       // weakly-connected components
  orphans: number;          // nodes with degree 0
  maxDegree: number;
  maxDegreeId: string | null;
  avgDegree: number;
  density: number;          // 2E / (N*(N-1)) for directed-allowing graph
  byKind: Record<NodeKind, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  hubs: number;             // degree >= HUB_DEGREE
  megaHubs: number;         // degree >= MEGA_HUB_DEGREE
}

function computeGraphStats(data: DependencyGraphData): GraphStats {
  const nodes = data.nodes;
  const edges = data.edges;
  const N = nodes.length;
  const E = edges.length;
  // degree map (in + out)
  const deg = new Map<string, number>();
  for (const e of edges) {
    deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
    deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
  }
  // weakly connected components via union-find
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) { parent.set(x, find(p)); p = parent.get(x)!; }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const n of nodes) parent.set(n.id, n.id);
  for (const e of edges) union(e.from, e.to);
  const roots = new Set<string>();
  for (const n of nodes) roots.add(find(n.id));
  let orphans = 0;
  let maxDegree = 0;
  let maxDegreeId: string | null = null;
  let hubs = 0;
  let megaHubs = 0;
  for (const n of nodes) {
    const d = deg.get(n.id) ?? 0;
    if (d === 0) orphans++;
    if (d > maxDegree) { maxDegree = d; maxDegreeId = n.id; }
    if (d >= HUB_DEGREE) hubs++;
    if (d >= MEGA_HUB_DEGREE) megaHubs++;
  }
  const byKind: Record<NodeKind, number> = { task: 0, gate: 0, priority: 0 };
  const bySeverity: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0, none: 0 };
  const byStatus: Record<string, number> = { urgent: 0, pending: 0, independent: 0, resolved: 0, none: 0 };
  for (const n of nodes) {
    byKind[n.kind]++;
    bySeverity[n.severity ?? "none"]++;
    byStatus[n.status ?? "none"]++;
  }
  const density = N > 1 ? (2 * E) / (N * (N - 1)) : 0;
  return {
    nodes: N,
    edges: E,
    components: roots.size,
    orphans,
    maxDegree,
    maxDegreeId,
    avgDegree: N > 0 ? (2 * E) / N : 0,
    density,
    byKind,
    bySeverity,
    byStatus,
    hubs,
    megaHubs,
  };
}

/** Serialize the current SVG element to a standalone .svg file and download it. */
function downloadSVG(svg: SVGSVGElement, filename: string) {
  // Clone so we can inject xmlns + computed styling context
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  // Ensure width/height reflect current viewBox
  const vb = svg.viewBox.baseVal;
  if (vb && vb.width && vb.height) {
    clone.setAttribute("width", String(vb.width));
    clone.setAttribute("height", String(vb.height));
  }
  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + xml], { type: "image/svg+xml;charset=utf-8" });
  triggerDownload(blob, filename);
}

/** Rasterize the current SVG to a PNG (2x retina) and download. */
async function downloadPNG(svg: SVGSVGElement, filename: string, background = "#ffffff") {
  const vb = svg.viewBox.baseVal;
  const w = (vb && vb.width) || svg.clientWidth || 1200;
  const h = (vb && vb.height) || svg.clientHeight || 800;
  const scale = 2; // retina
  const xml = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no 2d context")); return; }
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => {
        if (!b) { reject(new Error("toBlob failed")); return; }
        triggerDownload(b, filename);
        resolve();
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img load failed")); };
    img.src = url;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------- main component ----------

interface Transform { x: number; y: number; scale: number; }
const IDENTITY: Transform = { x: 0, y: 0, scale: 1 };

export function DependencyGraphDialog({
  open,
  onOpenChange,
  onNodeClick,
  initialFocusNodeId,
}: DependencyGraphDialogProps) {
  const [data, setData] = useState<DependencyGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [criticalMode, setCriticalMode] = useState(false);
  const [pipelineMode, setPipelineMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    new Set(["P0", "P1", "P2", "P3", "none"]),
  );
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    new Set(["urgent", "pending", "independent", "none"]),
  );

  // ---- NEW QoL state (graph-qol-round-1) ----
  // Hover-based neighbor highlighting (Obsidian-style)
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Particle flow + hover dimming master toggle (persisted)
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  // Shortest-path overlay (Neo4j Bloom-style)
  const [pathInfo, setPathInfo] = useState<{
    sourceId: string;
    targetId: string;
    nodes: string[];   // ordered list from source → target
    edges: Set<string>; // edge keys "from-to" on the path
  } | null>(null);
  // Path-finding source marker (set via right-click "Find path from here")
  const [pathSourceId, setPathSourceId] = useState<string | null>(null);
  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  // Dragged node positions (session-only overlay on top of layout positions)
  const [draggedPositions, setDraggedPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());

  // ---- NEW: bookmarks + export + search cycling (graph-improve-round-2) ----
  // Bookmarked node ids, persisted across sessions in localStorage.
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  // Export dropdown menu visibility
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // Whether the collapsible stats panel in the inspector is open
  const [statsOpen, setStatsOpen] = useState(false);
  // Whether the bookmarks panel in the inspector is open
  const [bookmarksOpen, setBookmarksOpen] = useState(true);
  // Search match cycling index (Enter advances through matches)
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  // Most-recently-clicked node ids (for quick back-nav), newest first
  const [recentNodes, setRecentNodes] = useState<string[]>([]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Drag state — kept in refs to avoid re-renders during pointermove
  const dragState = useRef<{
    startX: number;
    startY: number;
    tx: number;
    ty: number;
    active: boolean;
  } | null>(null);
  // Velocity tracking for momentum pan
  const velocityRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastMoveRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const momentumRafRef = useRef<number | null>(null);
  // Suppress the click that follows a drag (so background click doesn't deselect)
  const dragMovedRef = useRef<boolean>(false);

  // ---- NEW refs for animation + drag + hover (graph-qol-round-1) ----
  // Fly-to transform animation (rAF-eased)
  const animRafRef = useRef<number | null>(null);
  const animStateRef = useRef<{ from: Transform; to: Transform; t0: number } | null>(null);
  // Mirror of transform for reading inside rAF without re-creating callbacks
  const transformRef = useRef<Transform>(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);
  // Mirror of effectsEnabled + zoom for particle gating inside render
  const prefersReducedMotionRef = useRef<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotionRef.current = mq.matches;
    const handler = () => { prefersReducedMotionRef.current = mq.matches; };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);
  // Node drag state (distinct from background pan)
  const nodeDragState = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    startWorldX: number;
    startWorldY: number;
    active: boolean;
    moved: boolean;
    rafScheduled: boolean;
  } | null>(null);
  // Suppresses the click that follows a node drag
  const nodeDragMovedRef = useRef<boolean>(false);
  // Hover leave delay timer (prevents flicker when moving between nodes)
  const hoverLeaveTimerRef = useRef<number | null>(null);
  // Neighbor-navigation index (for n / arrow cycling)
  const neighborNavRef = useRef<{ dir: "out" | "in" | "all"; idx: number }>({
    dir: "all",
    idx: 0,
  });
  // Tracks whether initialFocusNodeId has been applied for the current open session
  const initialFocusAppliedRef = useRef<string | null>(null);

  // ---- load effectsEnabled from localStorage on mount ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("graph-effects-enabled");
      if (stored !== null) setEffectsEnabled(stored === "true");
    } catch {
      // ignore (private mode / disabled localStorage)
    }
  }, []);
  const toggleEffects = useCallback(() => {
    setEffectsEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("graph-effects-enabled", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // ---- NEW: load bookmarks from localStorage on mount ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("graph-bookmarks");
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) setBookmarks(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // ---- NEW: bookmark toggle (persisted) ----
  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast("Bookmark removed", { description: id, duration: 1800 });
      } else {
        next.add(id);
        const node = data?.nodes.find((n) => n.id === id);
        toast.success("Bookmarked", {
          description: node ? `${id} · ${splitLabel(node.label).line1 || node.label}` : id,
          duration: 1800,
        });
      }
      try {
        window.localStorage.setItem("graph-bookmarks", JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  }, [data]);

  // ---- NEW: clear all bookmarks ----
  const clearBookmarks = useCallback(() => {
    setBookmarks(new Set());
    try {
      window.localStorage.setItem("graph-bookmarks", "[]");
    } catch {
      // ignore
    }
  }, []);

  // ---- NEW: export handlers ----
  const handleExportSVG = useCallback(() => {
    if (!svgRef.current) return;
    try {
      downloadSVG(svgRef.current, `dependency-graph-${Date.now()}.svg`);
      toast.success("Exported SVG", { description: "Vector file downloaded", duration: 2000 });
    } catch {
      toast.error("SVG export failed");
    }
    setExportMenuOpen(false);
  }, []);

  const handleExportPNG = useCallback(async () => {
    if (!svgRef.current) return;
    try {
      // Use the current effective background (respect dark mode)
      const isDark = document.documentElement.classList.contains("dark");
      await downloadPNG(svgRef.current, `dependency-graph-${Date.now()}.png`, isDark ? "#0a0a0a" : "#ffffff");
      toast.success("Exported PNG", { description: "2× retina image downloaded", duration: 2000 });
    } catch {
      toast.error("PNG export failed");
    }
    setExportMenuOpen(false);
  }, []);

  // ---- NEW: graph statistics (memoized) ----
  const graphStats = useMemo<GraphStats | null>(() => {
    if (!data) return null;
    return computeGraphStats(data);
  }, [data]);

  // ---- fly-to transform animation (rAF-eased, ~450ms ease-in-out cubic) ----
  const cancelTransformAnim = useCallback(() => {
    if (animRafRef.current !== null) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = null;
    }
    animStateRef.current = null;
  }, []);

  const animateTransformTo = useCallback((target: Transform) => {
    cancelTransformAnim();
    // Respect prefers-reduced-motion: jump instantly
    if (prefersReducedMotionRef.current) {
      setTransform(target);
      return;
    }
    const from = transformRef.current;
    // If already at target, no-op
    if (from.x === target.x && from.y === target.y && from.scale === target.scale) return;
    animStateRef.current = { from, to: target, t0: performance.now() };
    const DURATION = 450;
    // ease-in-out cubic
    const ease = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = () => {
      const anim = animStateRef.current;
      if (!anim) return;
      const elapsed = performance.now() - anim.t0;
      const t = Math.min(1, elapsed / DURATION);
      const e = ease(t);
      setTransform({
        x: anim.from.x + (anim.to.x - anim.from.x) * e,
        y: anim.from.y + (anim.to.y - anim.from.y) * e,
        scale: anim.from.scale + (anim.to.scale - anim.from.scale) * e,
      });
      if (t < 1) {
        animRafRef.current = requestAnimationFrame(step);
      } else {
        animRafRef.current = null;
        animStateRef.current = null;
      }
    };
    animRafRef.current = requestAnimationFrame(step);
  }, [cancelTransformAnim]);

  // ---- BFS shortest path (undirected) for path-finding feature ----
  const findShortestPath = useCallback(
    (sourceId: string, targetId: string): { nodes: string[]; edges: Set<string> } | null => {
      if (!data) return null;
      if (sourceId === targetId) return { nodes: [sourceId], edges: new Set() };
      // Build undirected adjacency from data.edges
      const adj = new Map<string, string[]>();
      for (const e of data.edges) {
        if (!adj.has(e.from)) adj.set(e.from, []);
        if (!adj.has(e.to)) adj.set(e.to, []);
        adj.get(e.from)!.push(e.to);
        adj.get(e.to)!.push(e.from);
      }
      // BFS
      const prev = new Map<string, string>();
      const visited = new Set<string>([sourceId]);
      const queue: string[] = [sourceId];
      let found = false;
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (cur === targetId) { found = true; break; }
        const neighbors = adj.get(cur) ?? [];
        for (const nb of neighbors) {
          if (visited.has(nb)) continue;
          visited.add(nb);
          prev.set(nb, cur);
          queue.push(nb);
        }
      }
      if (!found) return null;
      // Reconstruct path
      const nodes: string[] = [targetId];
      let cur: string = targetId;
      while (cur !== sourceId) {
        const p = prev.get(cur);
        if (!p) return null;
        nodes.unshift(p);
        cur = p;
      }
      // Build edge keys (try both directions) for highlighting
      const edgeSet = new Set<string>();
      for (let i = 0; i < nodes.length - 1; i++) {
        edgeSet.add(`${nodes[i]}-${nodes[i + 1]}`);
        edgeSet.add(`${nodes[i + 1]}-${nodes[i]}`);
      }
      return { nodes, edges: edgeSet };
    },
    [data],
  );

  // ---- manual sync (schema-driven graph: POST /api/dependency-graph/sync) ----
  // T6b: the sync button JSX, the handleSyncGraph handler, and the store reads
  // (graphSyncStatus / graphSyncedAt / graphSyncErrors / syncDependencyGraph)
  // have been extracted into <GraphToolbar /> (./graph/graph-toolbar.tsx).
  // GraphToolbar reads the sync state directly from useDocStore (no prop-drilling
  // — Decision 3 Z) and calls syncDependencyGraph, which dispatches the
  // graph:synced window event handled by the listener below.

  // ---- fetch (module-level cached) ----
  // T8b §12.2: the dialog keeps its own fetch + module cache (it needs
  // edges/sectionContent/generatedAt from the API response, which the store
  // doesn't carry). But it ALSO publishes the fetched nodes to the store via
  // setGraphNodes, so IdLink popovers (which useGraphNode from the store) and
  // the backlinks-panel/command-palette (which subscribe to graphNodes) see
  // the same data the dialog renders — no divergence.
  const fetchData = useCallback(async (force = false) => {
    if (graphDataCache && !force) {
      setData(graphDataCache);
      // Keep the store in sync even on cache hits (in case the store was
      // cleared by a sync while the dialog was closed).
      useDocStore.getState().setGraphNodes(graphDataCache.nodes, "ready");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dependency-graph");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DependencyGraphData;
      graphDataCache = json;
      setData(json);
      // T8b: publish nodes to the store so popovers/list panels render the
      // same data. The store's fetchGraphNodes would fetch the same endpoint
      // again; doing it here avoids the duplicate request.
      useDocStore.getState().setGraphNodes(json.nodes, "ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- graph:synced event listener ----
  // When the store's syncDependencyGraph succeeds it dispatches this event.
  // (The call originates in <GraphToolbar />'s sync button — T6b — but the
  // store action is what fires the event; this listener is unchanged in
  // structure.)
  // T8b: the listener now triggers BOTH the dialog's own refresh (fetchData,
  // for edges/sectionContent/generatedAt) AND the store's graphNodes refresh
  // (fetchGraphNodes, for IdLink popovers). Calling both avoids the regression
  // where the dialog shows stale data when a sync happens while it's open,
  // and ensures the store's graphNodes is always fresh for popover consumers.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      graphDataCache = null;
      fetchData(true);
      useDocStore.getState().fetchGraphNodes(true);
    };
    window.addEventListener("graph:synced", handler);
    return () => window.removeEventListener("graph:synced", handler);
  }, [fetchData]);

  useEffect(() => {
    if (open) {
      setTransform(IDENTITY);
      setSelectedId(null);
      setSearch("");
      setCriticalMode(false);
      setPipelineMode(false);
      setHoveredEdgeKey(null);
      setCollapsedClusters(new Set());
      setSeverityFilter(new Set(["P0", "P1", "P2", "P3", "none"]));
      setStatusFilter(new Set(["urgent", "pending", "independent", "none"]));
      // Reset NEW QoL state on open
      setHoveredId(null);
      setPathInfo(null);
      setPathSourceId(null);
      setContextMenu(null);
      setDraggedPositions(new Map());
      nodeDragState.current = null;
      nodeDragMovedRef.current = false;
      hoverLeaveTimerRef.current = null;
      neighborNavRef.current = { dir: "all", idx: 0 };
      // If we have an initial focus node, do NOT clear initialFocusAppliedRef
      // (it gets applied in a separate effect once data is available).
      // Otherwise, clear it so a stale value doesn't persist.
      if (!initialFocusNodeId) initialFocusAppliedRef.current = null;
      if (!graphDataCache) fetchData();
      else setData(graphDataCache);
    } else {
      // Dialog closed: cancel any in-flight animations + clear hover/path state
      cancelTransformAnim();
      setHoveredId(null);
      setContextMenu(null);
      initialFocusAppliedRef.current = null;
    }
  }, [open, fetchData, initialFocusNodeId]);

  // Reset transform when toggling pipeline mode (so the new layout is fit to view)
  useEffect(() => {
    setTransform(IDENTITY);
    setSelectedId(null);
  }, [pipelineMode]);

  // ---- force-directed layout (memoized, runs once per data-shape) ----
  // In pipeline mode, override with the 4-phase swimlane layout.
  const layoutPositions = useMemo(() => {
    if (!data) return new Map<string, { x: number; y: number }>();
    if (pipelineMode) {
      const m = new Map<string, { x: number; y: number }>();
      for (const n of data.nodes) m.set(n.id, getPipelinePosition(n));
      return m;
    }
    return getLayout(data);
  }, [data, pipelineMode]);

  // ---- effective positions = layout + session-only dragged overrides ----
  // Dragged positions take precedence; everything else uses layout positions.
  const positions = useMemo(() => {
    if (draggedPositions.size === 0) return layoutPositions;
    const m = new Map(layoutPositions);
    for (const [id, p] of draggedPositions) m.set(id, p);
    return m;
  }, [layoutPositions, draggedPositions]);

  // ---- derived: nodesById, degreeMap, neighborIds ----
  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    data?.nodes.forEach((n) => m.set(n.id, n));
    return m;
  }, [data]);

  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const e of data.edges) {
      m.set(e.from, (m.get(e.from) ?? 0) + 1);
      m.set(e.to, (m.get(e.to) ?? 0) + 1);
    }
    return m;
  }, [data]);

  const selectedNode = useMemo(
    () => (selectedId ? nodesById.get(selectedId) ?? null : null),
    [selectedId, nodesById],
  );

  const neighborIds = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set<string>();
    s.add(selectedId);
    data?.edges.forEach((e) => {
      if (e.from === selectedId) s.add(e.to);
      if (e.to === selectedId) s.add(e.from);
    });
    return s;
  }, [selectedId, data]);

  // ---- NEW: hover-neighbor set (Obsidian-style highlight) ----
  // When hoveredId is set, this includes the hovered node + all directly
  // connected nodes (both directions). Used to dim non-neighbors.
  const hoverNeighborIds = useMemo(() => {
    if (!hoveredId) return null;
    const s = new Set<string>([hoveredId]);
    data?.edges.forEach((e) => {
      if (e.from === hoveredId) s.add(e.to);
      if (e.to === hoveredId) s.add(e.from);
    });
    return s;
  }, [hoveredId, data]);

  // ---- NEW: adjacency lists for keyboard neighbor navigation ----
  const adjacency = useMemo(() => {
    const out = new Map<string, string[]>();
    const inn = new Map<string, string[]>();
    if (!data) return { out, inn };
    for (const e of data.edges) {
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from)!.push(e.to);
      if (!inn.has(e.to)) inn.set(e.to, []);
      inn.get(e.to)!.push(e.from);
    }
    return { out, inn };
  }, [data]);

  // ---- NEW: path node set (for highlight) ----
  const pathNodeIds = useMemo(
    () => (pathInfo ? new Set(pathInfo.nodes) : null),
    [pathInfo],
  );

  // ---- search matches ----
  const searchLower = search.trim().toLowerCase();
  const hasSearch = searchLower.length > 0;
  const matchSet = useMemo(() => {
    if (!hasSearch) return null;
    const s = new Set<string>();
    data?.nodes.forEach((n) => {
      const hay = `${n.id} ${n.label} ${n.description} ${n.severity ?? ""} ${n.status ?? ""}`.toLowerCase();
      if (hay.includes(searchLower)) s.add(n.id);
    });
    return s;
  }, [data, hasSearch, searchLower]);

  // ---- visible nodes (filtered by severity + status, NOT by search — search dims instead) ----
  const visibleNodes = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter((n) => {
      const sevKey = n.severity ?? "none";
      const statusKey = n.status === "resolved" ? "none" : (n.status ?? "none");
      return severityFilter.has(sevKey) && statusFilter.has(statusKey);
    });
  }, [data, severityFilter, statusFilter]);

  const visibleNodeIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  // ---- cluster info (centroids + member counts + kind counts) ----
  const clusterInfo = useMemo(() => {
    const centroids = new Map<string, { x: number; y: number }>();
    const counts = new Map<string, number>();
    const kindCounts = new Map<string, Record<NodeKind, number>>();
    for (const n of visibleNodes) {
      const c = deriveCluster(n);
      const p = positions.get(n.id);
      if (!p) continue;
      counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
      if (!centroids.has(c.id)) centroids.set(c.id, { x: 0, y: 0 });
      const ctr = centroids.get(c.id)!;
      ctr.x += p.x;
      ctr.y += p.y;
      if (!kindCounts.has(c.id)) {
        kindCounts.set(c.id, { gate: 0, task: 0, priority: 0 });
      }
      kindCounts.get(c.id)![n.kind]++;
    }
    // Average
    for (const [cid, ctr] of centroids) {
      const cnt = counts.get(cid) ?? 1;
      ctr.x /= cnt;
      ctr.y /= cnt;
    }
    return { centroids, counts, kindCounts };
  }, [visibleNodes, positions]);

  // ---- viewBox (computed from layout bounds — only count visible nodes) ----
  const viewBox = useMemo(() => {
    if (visibleNodes.length === 0) {
      return { x: 0, y: 0, w: 1000, h: 700 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of visibleNodes) {
      const p = positions.get(n.id);
      if (!p) continue;
      minX = Math.min(minX, p.x - NODE_WIDTH / 2);
      minY = Math.min(minY, p.y - NODE_HEIGHT / 2);
      maxX = Math.max(maxX, p.x + NODE_WIDTH / 2);
      maxY = Math.max(maxY, p.y + NODE_HEIGHT / 2);
    }
    // Also include collapsed mega-node centroids
    for (const [cid, ctr] of clusterInfo.centroids) {
      if (!collapsedClusters.has(cid)) continue;
      minX = Math.min(minX, ctr.x - MEGA_NODE_WIDTH / 2);
      minY = Math.min(minY, ctr.y - MEGA_NODE_HEIGHT / 2);
      maxX = Math.max(maxX, ctr.x + MEGA_NODE_WIDTH / 2);
      maxY = Math.max(maxY, ctr.y + MEGA_NODE_HEIGHT / 2);
    }
    return {
      x: minX - VIEWBOX_PAD,
      y: minY - VIEWBOX_PAD,
      w: Math.max(400, maxX - minX + VIEWBOX_PAD * 2),
      h: Math.max(300, maxY - minY + VIEWBOX_PAD * 2),
    };
  }, [visibleNodes, positions, clusterInfo, collapsedClusters]);

  const viewBoxCenter = useMemo(
    () => ({ x: viewBox.x + viewBox.w / 2, y: viewBox.y + viewBox.h / 2 }),
    [viewBox],
  );

  // ---- transform helpers ----
  const clampScale = (s: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s));

  const applyTransform = useCallback((next: Transform) => {
    setTransform({ ...next, scale: clampScale(next.scale) });
  }, []);

  const fitToView = useCallback(() => {
    // Animate back to identity (fit-to-view) for a buttery transition
    animateTransformTo(IDENTITY);
  }, [animateTransformTo]);

  const reset = useCallback(() => {
    setSelectedId(null);
    setPathInfo(null);
    setPathSourceId(null);
    animateTransformTo(IDENTITY);
  }, [animateTransformTo]);

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => {
      const newScale = clampScale(t.scale * factor);
      const cx = viewBoxCenter.x;
      const cy = viewBoxCenter.y;
      const nx = cx - (cx - t.x) * (newScale / t.scale);
      const ny = cy - (cy - t.y) * (newScale / t.scale);
      return { x: nx, y: ny, scale: newScale };
    });
  }, [viewBoxCenter]);

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);

  // ---- wheel zoom (cursor-anchored, non-passive) ----
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !open) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      // Cancel any in-flight fly-to animation — user is interacting
      cancelTransformAnim();
      const rect = svg.getBoundingClientRect();
      const vbScale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
      const scaledW = viewBox.w * vbScale;
      const scaledH = viewBox.h * vbScale;
      const offsetX = (rect.width - scaledW) / 2;
      const offsetY = (rect.height - scaledH) / 2;
      const vbX = (e.clientX - rect.left - offsetX) / vbScale;
      const vbY = (e.clientY - rect.top - offsetY) / vbScale;
      setTransform((t) => {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        const newScale = clampScale(t.scale * factor);
        const worldX = (vbX - t.x) / t.scale;
        const worldY = (vbY - t.y) / t.scale;
        return { x: vbX - worldX * newScale, y: vbY - worldY * newScale, scale: newScale };
      });
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [open, viewBox, cancelTransformAnim]);

  // ---- pan (background drag with momentum) ----
  const cancelMomentum = useCallback(() => {
    if (momentumRafRef.current !== null) {
      cancelAnimationFrame(momentumRafRef.current);
      momentumRafRef.current = null;
    }
  }, []);

  const onBackgroundPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Allow panning from ANY element that is NOT inside a node or an edge.
    // The previous check (only allow if target has data-bg="true") was too
    // strict — clicking on a grid dot, a label, or empty SVG space wouldn't
    // start a pan, which is why the user reported "you can't move."
    //
    // Detection: walk up from e.target to see if we're inside a [data-node-id]
    // group or a [data-edge-key] group. If yes, let that component handle the
    // pointer (for click/drag). If no, start panning.
    const target = e.target as Element | null;
    if (target && target.closest) {
      const insideNode = target.closest("[data-node-id]");
      const insideEdge = target.closest("[data-edge-key]");
      const insideMegaNode = target.closest("[data-mega-node]");
      if (insideNode || insideEdge || insideMegaNode) return;
    }
    cancelMomentum();
    cancelTransformAnim(); // user is interacting — stop fly-to
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      tx: transform.x,
      ty: transform.y,
      active: true,
    };
    dragMovedRef.current = false;
    velocityRef.current = { x: 0, y: 0 };
    lastMoveRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
  }, [transform.x, transform.y, cancelMomentum, cancelTransformAnim]);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Node drag takes precedence (pointer is captured by the node's <g>)
    if (nodeDragState.current?.active) {
      const ds = nodeDragState.current;
      const dx = e.clientX - ds.startClientX;
      const dy = e.clientY - ds.startClientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        ds.moved = true;
        nodeDragMovedRef.current = true;
      }
      if (!ds.moved) return;
      if (ds.rafScheduled) return;
      ds.rafScheduled = true;
      requestAnimationFrame(() => {
        ds.rafScheduled = false;
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vbScale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
        const t = transformRef.current;
        const newX = ds.startWorldX + dx / vbScale / t.scale;
        const newY = ds.startWorldY + dy / vbScale / t.scale;
        setDraggedPositions((prev) => {
          const next = new Map(prev);
          next.set(ds.nodeId, { x: newX, y: newY });
          return next;
        });
      });
      return;
    }
    // Background pan
    if (!dragState.current?.active) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vbScale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
    const dx = (e.clientX - dragState.current.startX) / vbScale;
    const dy = (e.clientY - dragState.current.startY) / vbScale;
    if (Math.abs(e.clientX - dragState.current.startX) + Math.abs(e.clientY - dragState.current.startY) > 3) {
      dragMovedRef.current = true;
    }
    setTransform((t) => ({ ...t, x: dragState.current!.tx + dx, y: dragState.current!.ty + dy }));

    // Track velocity (last 16ms window)
    const now = performance.now();
    if (lastMoveRef.current) {
      const dt = now - lastMoveRef.current.t;
      if (dt > 0 && dt < 100) {
        velocityRef.current = {
          x: (e.clientX - lastMoveRef.current.x) / dt,
          y: (e.clientY - lastMoveRef.current.y) / dt,
        };
      }
    }
    lastMoveRef.current = { x: e.clientX, y: e.clientY, t: now };
  }, [viewBox]);

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Node drag cleanup
    if (nodeDragState.current?.active) {
      const ds = nodeDragState.current;
      ds.active = false;
      nodeDragState.current = null;
      // Release pointer capture on the node's <g> if it still exists.
      // The capture was set on the <g> element, but we can find it via the
      // event target. Use releasePointerCapture on whichever element has capture.
      try {
        (e.target as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore — element may have already lost capture
      }
      // nodeDragMovedRef stays set so handleNodeClick can suppress selection.
      return;
    }
    // Background pan cleanup
    if (!dragState.current?.active) return;
    dragState.current.active = false;
    dragState.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    lastMoveRef.current = null;

    // Start momentum if velocity is non-trivial
    const v = velocityRef.current;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y);
    if (speed < 0.05) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vbScale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);

    const decay = 0.92;
    const minVel = 0.02;
    const step = () => {
      const cv = velocityRef.current;
      const curSpeed = Math.sqrt(cv.x * cv.x + cv.y * cv.y);
      if (curSpeed < minVel) {
        momentumRafRef.current = null;
        return;
      }
      // Convert px/ms velocity to viewBox-units-per-frame (16ms assumption)
      const ddx = (cv.x * 16) / vbScale;
      const ddy = (cv.y * 16) / vbScale;
      setTransform((t) => ({ ...t, x: t.x + ddx, y: t.y + ddy }));
      velocityRef.current = { x: cv.x * decay, y: cv.y * decay };
      momentumRafRef.current = requestAnimationFrame(step);
    };
    momentumRafRef.current = requestAnimationFrame(step);
  }, [viewBox]);

  // Cleanup momentum on unmount/close
  useEffect(() => {
    if (!open) cancelMomentum();
    return cancelMomentum;
  }, [open, cancelMomentum]);

  // ---- node click (with Alt/Shift = path-finding, otherwise select) ----
  const handleNodeClick = useCallback((node: GraphNode, e: React.MouseEvent) => {
    // Suppress the click that follows a node drag
    if (nodeDragMovedRef.current) {
      nodeDragMovedRef.current = false;
      return;
    }
    // Alt+Click or Shift+Click → find shortest path
    if (e.altKey || e.shiftKey) {
      // Determine the source: prefer explicit pathSourceId, fall back to selectedId
      const sourceId = pathSourceId ?? selectedId;
      if (!sourceId || sourceId === node.id) {
        // No source yet — set this node as the source instead
        setPathSourceId(node.id);
        setSelectedId(node.id);
        return;
      }
      const result = findShortestPath(sourceId, node.id);
      if (result) {
        setPathInfo({
          sourceId,
          targetId: node.id,
          nodes: result.nodes,
          edges: result.edges,
        });
      } else {
        // No path found — clear any existing path
        setPathInfo(null);
      }
      // Clear the explicit source marker after use
      setPathSourceId(null);
      return;
    }
    // Normal click: select (and clear path + path source)
    setSelectedId(node.id);
    setPathInfo(null);
    setPathSourceId(null);
  }, [pathSourceId, selectedId, findShortestPath]);

  // ---- node hover handlers (with 80ms leave delay to prevent flicker) ----
  const handleNodeHoverEnter = useCallback((id: string) => {
    if (!effectsEnabled) return;
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
      hoverLeaveTimerRef.current = null;
    }
    setHoveredId(id);
  }, [effectsEnabled]);
  const handleNodeHoverLeave = useCallback(() => {
    if (hoverLeaveTimerRef.current !== null) {
      window.clearTimeout(hoverLeaveTimerRef.current);
    }
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      setHoveredId(null);
      hoverLeaveTimerRef.current = null;
    }, 80);
  }, []);

  // ---- node right-click context menu ----
  const handleNodeContextMenu = useCallback((node: GraphNode, e: React.MouseEvent) => {
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY });
  }, []);

  // ---- node drag-to-reposition (session-only) ----
  // pointerdown is handled on the node's <g>; pointermove/up are handled by the
  // SVG-level handlers (onPointerMove/onPointerUp) which check nodeDragState
  // first. This avoids needing per-node pointer handlers.
  const handleNodePointerDown = useCallback((e: React.PointerEvent<SVGGElement>, node: GraphNode) => {
    // Only primary button, no modifiers (Alt/Shift are for path-finding)
    if (e.button !== 0 || e.altKey || e.shiftKey || e.metaKey || e.ctrlKey) return;
    e.stopPropagation();
    const p = positions.get(node.id);
    if (!p) return;
    // Cancel any in-flight fly-to animation (user is interacting)
    cancelTransformAnim();
    cancelMomentum();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    nodeDragState.current = {
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWorldX: p.x,
      startWorldY: p.y,
      active: true,
      moved: false,
      rafScheduled: false,
    };
    // Reset the moved-ref so a fresh click without drag selects the node.
    nodeDragMovedRef.current = false;
  }, [positions, cancelTransformAnim, cancelMomentum]);

  // ---- node double-click: reset position to layout default ----
  const handleNodeDoubleClick = useCallback((node: GraphNode) => {
    setDraggedPositions((prev) => {
      if (!prev.has(node.id)) return prev;
      const next = new Map(prev);
      next.delete(node.id);
      return next;
    });
  }, []);

  // ---- mega-node click (toggle cluster collapse) ----
  const handleMegaNodeClick = useCallback((clusterId: string) => {
    setCollapsedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  // ---- cluster badge click in toolbar (toggle all) ----
  const handleToggleCluster = useCallback((clusterId: string) => {
    setCollapsedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  }, []);

  const handleCollapseAll = useCallback(() => {
    setCollapsedClusters((prev) => {
      if (prev.size === CLUSTER_DEFS.length) return new Set();
      return new Set(CLUSTER_DEFS.map((c) => c.id));
    });
  }, []);

  // ---- jump / center ----
  const handleJumpToNode = useCallback((node: GraphNode) => {
    onNodeClick?.({ id: node.id });
    onOpenChange(false);
  }, [onNodeClick, onOpenChange]);

  const handleCenterOn = useCallback((node: GraphNode) => {
    const p = positions.get(node.id);
    if (!p) return;
    const t = transformRef.current;
    animateTransformTo({
      x: viewBoxCenter.x - p.x * t.scale,
      y: viewBoxCenter.y - p.y * t.scale,
      scale: t.scale,
    });
  }, [positions, viewBoxCenter, animateTransformTo]);

  const handlePanTo = useCallback((worldX: number, worldY: number) => {
    const t = transformRef.current;
    animateTransformTo({
      x: viewBoxCenter.x - worldX * t.scale,
      y: viewBoxCenter.y - worldY * t.scale,
      scale: t.scale,
    });
  }, [viewBoxCenter, animateTransformTo]);

  // ---- context menu actions ----
  const handleContextMenuAction = useCallback((action: string, node: GraphNode) => {
    setContextMenu(null);
    switch (action) {
      case "center":
        handleCenterOn(node);
        break;
      case "jump":
        handleJumpToNode(node);
        break;
      case "path-from-here":
        setPathSourceId(node.id);
        setSelectedId(node.id);
        setPathInfo(null);
        break;
      case "copy-id":
        try {
          void navigator.clipboard?.writeText(node.id);
        } catch {
          // ignore clipboard errors
        }
        break;
      case "collapse-cluster": {
        const cluster = deriveCluster(node);
        setCollapsedClusters((prev) => {
          const next = new Set(prev);
          if (next.has(cluster.id)) next.delete(cluster.id);
          else next.add(cluster.id);
          return next;
        });
        break;
      }
    }
  }, [handleCenterOn, handleJumpToNode]);

  // ---- close context menu on outside click / Esc / scroll ----
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onClick = (e: MouseEvent) => {
      // Don't close if clicking inside the menu (menu items stop propagation)
      const target = e.target as Element | null;
      if (target && target.closest?.("[data-graph-context-menu]")) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = () => close();
    window.addEventListener("click", onClick, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [contextMenu]);

  // ---- clear path on background click ----
  // (Hooked into the existing onBackgroundClick below — see render)

  // ---- §12.6 MANDATED-1: click-outside handler for the split-canvas path ----
  //
  // When USE_SPLIT_CANVAS is active, GraphCanvas does NOT call
  // stopPropagation on node clicks (the LegacyCanvas's NodeView does — see
  // line ~707). Instead, the orchestrator registers a capture-phase click
  // listener that closes the detail popover (selectedId → Inspector) when
  // the click lands OUTSIDE any [data-graph-node] element.
  //
  // This removes the stopPropagation ordering dependency entirely: the
  // decision to keep the popover open is made on the event TARGET (via
  // closest()), not on which listener fired first.
  //
  // Gated on USE_SPLIT_CANVAS so the LegacyCanvas path (which uses
  // stopPropagation + the SVG-level onBackgroundClick) is unaffected —
  // "visual diff = none when the flag is OFF".
  useEffect(() => {
    if (!USE_SPLIT_CANVAS || !open || !selectedId) return;
    const onClickAway = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Don't close if the click landed on a graph node — the node's own
      // onClick (in GraphCanvas) opens the popover.
      if (target?.closest?.("[data-graph-node]")) return;
      // Also don't close if the click landed inside the Inspector panel
      // (e.g. clicking a neighbor link) — the Inspector stays open until
      // the user explicitly dismisses it.
      if (target?.closest?.("[data-graph-inspector]")) return;
      // Don't close if the click landed inside the right-click context menu.
      if (target?.closest?.("[data-graph-context-menu]")) return;
      setSelectedId(null);
    };
    window.addEventListener("click", onClickAway, true);
    return () => window.removeEventListener("click", onClickAway, true);
  }, [open, selectedId]);

  // ---- initial focus on open (initialFocusNodeId) ----
  useEffect(() => {
    if (!open || !initialFocusNodeId || !data) return;
    if (initialFocusAppliedRef.current === initialFocusNodeId) return;
    const node = data.nodes.find((n) => n.id === initialFocusNodeId);
    if (!node) {
      initialFocusAppliedRef.current = initialFocusNodeId;
      return;
    }
    initialFocusAppliedRef.current = initialFocusNodeId;
    setSelectedId(initialFocusNodeId);
    // Expand the cluster containing the node so it's visible
    const cluster = deriveCluster(node);
    setCollapsedClusters((prev) => {
      if (!prev.has(cluster.id)) return prev;
      const next = new Set(prev);
      next.delete(cluster.id);
      return next;
    });
    // Center on it (after a short delay so positions/transform settle)
    const t = window.setTimeout(() => {
      const p = positions.get(initialFocusNodeId);
      if (!p) return;
      const t2 = transformRef.current;
      animateTransformTo({
        x: viewBoxCenter.x - p.x * t2.scale,
        y: viewBoxCenter.y - p.y * t2.scale,
        scale: t2.scale,
      });
    }, 120);
    return () => window.clearTimeout(t);
  }, [open, initialFocusNodeId, data, positions, viewBoxCenter, animateTransformTo]);

  // ---- keyboard neighbor navigation helper ----
  const navigateNeighbor = useCallback((dir: "out" | "in" | "all") => {
    if (!selectedId) return;
    const out = adjacency.out.get(selectedId) ?? [];
    const inn = adjacency.inn.get(selectedId) ?? [];
    let list: string[];
    if (dir === "out") list = out;
    else if (dir === "in") list = inn;
    else {
      // all = deduped union of out + in
      const seen = new Set<string>();
      list = [];
      for (const id of [...out, ...inn]) {
        if (!seen.has(id)) { seen.add(id); list.push(id); }
      }
    }
    if (list.length === 0) return;
    // Reset index if direction changed
    if (neighborNavRef.current.dir !== dir) {
      neighborNavRef.current = { dir, idx: 0 };
    } else {
      neighborNavRef.current.idx = (neighborNavRef.current.idx + 1) % list.length;
    }
    const nextId = list[neighborNavRef.current.idx];
    const nextNode = nodesById.get(nextId);
    if (!nextNode) return;
    setSelectedId(nextId);
    // Smoothly center on the new selection
    const p = positions.get(nextId);
    if (p) {
      const t = transformRef.current;
      animateTransformTo({
        x: viewBoxCenter.x - p.x * t.scale,
        y: viewBoxCenter.y - p.y * t.scale,
        scale: t.scale,
      });
    }
  }, [selectedId, adjacency, nodesById, positions, viewBoxCenter, animateTransformTo]);

  // ---- keyboard shortcuts ----
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as Element;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "+":
        case "=":
          e.preventDefault(); zoomIn(); break;
        case "-":
        case "_":
          e.preventDefault(); zoomOut(); break;
        case "0":
          e.preventDefault(); reset(); break;
        case "f":
        case "F":
          e.preventDefault(); fitToView(); break;
        case "p":
        case "P":
          e.preventDefault(); setPipelineMode((v) => !v); break;
        case "c":
        case "C":
          e.preventDefault(); handleCollapseAll(); break;
        case "n":
        case "N":
          if (selectedId) { e.preventDefault(); navigateNeighbor("all"); }
          break;
        case "?":
          e.preventDefault(); setShowHelp((s) => !s); break;
        case "Enter":
          if (selectedNode) { e.preventDefault(); handleJumpToNode(selectedNode); }
          break;
        case "ArrowUp":
          if (selectedId) { e.preventDefault(); navigateNeighbor("in"); }
          else { e.preventDefault(); setTransform((t) => ({ ...t, y: t.y + 60 })); }
          break;
        case "ArrowDown":
          if (selectedId) { e.preventDefault(); navigateNeighbor("out"); }
          else { e.preventDefault(); setTransform((t) => ({ ...t, y: t.y - 60 })); }
          break;
        case "ArrowLeft":
          if (selectedId) { e.preventDefault(); navigateNeighbor("in"); }
          else { e.preventDefault(); setTransform((t) => ({ ...t, x: t.x + 60 })); }
          break;
        case "ArrowRight":
          if (selectedId) { e.preventDefault(); navigateNeighbor("out"); }
          else { e.preventDefault(); setTransform((t) => ({ ...t, x: t.x - 60 })); }
          break;
        case "Escape":
          if (contextMenu) { e.preventDefault(); setContextMenu(null); }
          else if (pathInfo) { e.preventDefault(); setPathInfo(null); setPathSourceId(null); }
          else if (pathSourceId) { e.preventDefault(); setPathSourceId(null); }
          else if (showHelp) { e.preventDefault(); setShowHelp(false); }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, zoomIn, zoomOut, reset, fitToView, handleCollapseAll, selectedNode, handleJumpToNode, showHelp, selectedId, navigateNeighbor, contextMenu, pathInfo, pathSourceId]);

  // ---- semantic-zoom derived flags ----
  const zoom = transform.scale;
  const isHubOnlyMode = zoom < ZOOM_HUB_ONLY;
  const showDetail = zoom >= ZOOM_BADGES;
  const showEdgeLabels = zoom >= ZOOM_EDGE_LABELS;

  // ---- which nodes are visible given hub-only mode + collapsed clusters ----
  const renderableNodes = useMemo(() => {
    return visibleNodes.filter((n) => {
      const cluster = deriveCluster(n);
      if (collapsedClusters.has(cluster.id)) return false;
      if (isHubOnlyMode) {
        const deg = degreeMap.get(n.id) ?? 0;
        if (deg < HUB_DEGREE) return false;
      }
      return true;
    });
  }, [visibleNodes, collapsedClusters, isHubOnlyMode, degreeMap]);

  const renderableNodeIds = useMemo(
    () => new Set(renderableNodes.map((n) => n.id)),
    [renderableNodes],
  );

  // ---- collapsed cluster list ----
  const collapsedClusterList = useMemo(
    () => CLUSTER_DEFS.filter((c) => collapsedClusters.has(c.id)),
    [collapsedClusters],
  );

  // ---- edges to render: redirect endpoints if collapsed ----
  // For each edge, if either endpoint is in a collapsed cluster, redirect to that
  // cluster's mega-node centroid. If BOTH are in the same collapsed cluster, skip
  // (internal edge). If multiple edges share a (from-cluster, to-cluster) pair,
  // fan them out so they don't overlap.
  interface RenderedEdge {
    key: string;
    fromId: string;
    toId: string;
    kind: EdgeKind;
    label?: string;
    fromPos: { x: number; y: number };
    toPos: { x: number; y: number };
    fromW: number;
    fromH: number;
    toW: number;
    toH: number;
    fanOffset: number;
    isOnCriticalPath: boolean;
  }

  const renderedEdges = useMemo<RenderedEdge[]>(() => {
    if (!data) return [];
    const out: RenderedEdge[] = [];
    // Count outgoing edges per (sourcePos, targetPos) pair to fan them out
    const fanCounts = new Map<string, number>();
    const fanIndex = new Map<string, number>();
    const raw: Array<{
      e: GraphEdge;
      fromPos: { x: number; y: number };
      toPos: { x: number; y: number };
      fromW: number; fromH: number;
      toW: number; toH: number;
      pairKey: string;
      isOnCriticalPath: boolean;
    }> = [];
    for (const e of data.edges) {
      const fromNode = nodesById.get(e.from);
      const toNode = nodesById.get(e.to);
      if (!fromNode || !toNode) continue;
      // Both endpoints must be visible (pass filters)
      if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) continue;

      const fromCluster = deriveCluster(fromNode);
      const toCluster = deriveCluster(toNode);
      const fromCollapsed = collapsedClusters.has(fromCluster.id);
      const toCollapsed = collapsedClusters.has(toCluster.id);

      // Skip internal edges within a collapsed cluster
      if (fromCollapsed && toCollapsed && fromCluster.id === toCluster.id) continue;

      // Determine source/target positions
      let fromPos = positions.get(e.from);
      let toPos = positions.get(e.to);
      let fromW = NODE_WIDTH, fromH = NODE_HEIGHT;
      let toW = NODE_WIDTH, toH = NODE_HEIGHT;
      if (fromCollapsed) {
        const ctr = clusterInfo.centroids.get(fromCluster.id);
        if (ctr) { fromPos = ctr; fromW = MEGA_NODE_WIDTH; fromH = MEGA_NODE_HEIGHT; }
      }
      if (toCollapsed) {
        const ctr = clusterInfo.centroids.get(toCluster.id);
        if (ctr) { toPos = ctr; toW = MEGA_NODE_WIDTH; toH = MEGA_NODE_HEIGHT; }
      }
      if (!fromPos || !toPos) continue;

      // In hub-only mode, only show edges where BOTH endpoints are visible (i.e. hubs)
      if (isHubOnlyMode) {
        if (!renderableNodeIds.has(e.from) && !fromCollapsed) continue;
        if (!renderableNodeIds.has(e.to) && !toCollapsed) continue;
      }

      const pairKey = `${fromCluster.id}-${toCluster.id}-${fromCollapsed ? "c" : "n"}-${toCollapsed ? "c" : "n"}`;
      fanCounts.set(pairKey, (fanCounts.get(pairKey) ?? 0) + 1);
      raw.push({
        e, fromPos, toPos, fromW, fromH, toW, toH, pairKey,
        isOnCriticalPath: CRITICAL_PATH.has(e.from) && CRITICAL_PATH.has(e.to),
      });
    }
    // Now compute fan offsets
    for (const r of raw) {
      const total = fanCounts.get(r.pairKey) ?? 1;
      const idx = fanIndex.get(r.pairKey) ?? 0;
      fanIndex.set(r.pairKey, idx + 1);
      // Spread edges evenly across [-0.5, +0.5]
      const fanOffset = total > 1 ? (idx / (total - 1) - 0.5) : 0;
      out.push({
        key: `${r.e.from}-${r.e.to}`,
        fromId: r.e.from,
        toId: r.e.to,
        kind: r.e.kind,
        label: r.e.label,
        fromPos: r.fromPos,
        toPos: r.toPos,
        fromW: r.fromW, fromH: r.fromH, toW: r.toW, toH: r.toH,
        fanOffset,
        isOnCriticalPath: r.isOnCriticalPath,
      });
    }
    return out;
  }, [data, nodesById, visibleNodeIds, collapsedClusters, clusterInfo, positions, isHubOnlyMode, renderableNodeIds]);

  // ---- severity / status chip toggles ----
  const toggleSeverity = useCallback((sev: string) => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      // Don't allow empty — if all off, turn all back on
      if (next.size === 0) return new Set(["P0", "P1", "P2", "P3", "none"]);
      return next;
    });
  }, []);
  const toggleStatus = useCallback((st: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(st)) next.delete(st);
      else next.add(st);
      if (next.size === 0) return new Set(["urgent", "pending", "independent", "none"]);
      return next;
    });
  }, []);

  // ---- background click (deselect + clear path) — suppressed if just-dragged ----
  const onBackgroundClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    // Deselect when clicking on anything that isn't a node or edge.
    const target = e.target as Element | null;
    if (target && target.closest) {
      const insideNode = target.closest("[data-node-id]");
      const insideEdge = target.closest("[data-edge-key]");
      const insideMegaNode = target.closest("[data-mega-node]");
      if (insideNode || insideEdge || insideMegaNode) return;
    }
    setSelectedId(null);
    // Clear path overlay + path source on background click
    if (pathInfo || pathSourceId) {
      setPathInfo(null);
      setPathSourceId(null);
    }
  }, [pathInfo, pathSourceId]);

  // ---- render ----
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-7xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col sm:max-w-7xl"
      >
        <DialogTitle className="sr-only">Dependency Graph</DialogTitle>
        <DialogDescription className="sr-only">
          Interactive dependency graph showing {data?.nodes.length ?? 0} nodes and {data?.edges.length ?? 0} edges. Use arrow keys to pan, plus or minus to zoom, F to fit, C to collapse clusters, and question mark for shortcuts.
        </DialogDescription>

        {/* Toolbar */}
        <div className="h-14 border-b bg-card/40 backdrop-blur flex flex-nowrap items-center gap-2 px-2.5 shrink-0">
          {/* Left: title + GraphToolbar (T6b: sync button + layout-toggle + search
              extracted to ./graph/graph-toolbar.tsx; sync state read from store
              directly — no prop-drilling). The toolbar renders a fragment so the
              three controls sit inline with the title/badges in this flex row. */}
          <div className="flex items-center gap-2 shrink-0">
            <Network className="h-4 w-4 text-primary" />
            <div className="hidden sm:block text-sm font-semibold">Dependency Graph</div>
            <Badge variant="secondary" className="text-[10px] h-5 hidden md:inline-flex">{data?.nodes.length ?? 0} nodes</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 hidden md:inline-flex">{data?.edges.length ?? 0} edges</Badge>
            <GraphToolbar
              onToggleLayout={() => setPipelineMode((v) => !v)}
              searchValue={search}
              onSearchChange={setSearch}
              layoutActive={pipelineMode}
            />
          </div>

          {/* Center: zoom controls */}
          <div className="flex-1 flex justify-center items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomOut} aria-label="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs w-12 text-center tabular-nums" aria-live="polite">
              {Math.round(transform.scale * 100)}%
            </span>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={zoomIn} aria-label="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={fitToView} aria-label="Fit to view">
              <Maximize className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={reset} aria-label="Reset view">
              <RotateCcw className="h-4 w-4" />
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={collapsedClusters.size > 0 ? "default" : "ghost"}
                    className="h-8 w-8"
                    onClick={handleCollapseAll}
                    aria-label="Toggle all clusters"
                  >
                    <Layers className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Collapse / expand all clusters (C)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={criticalMode ? "default" : "ghost"}
                    className="h-8 w-8"
                    onClick={() => setCriticalMode((v) => !v)}
                    aria-label="Toggle critical path"
                    aria-pressed={criticalMode}
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Highlight critical path</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* T6b: pipeline / timeline layout-toggle moved to <GraphToolbar />. */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={effectsEnabled ? "default" : "ghost"}
                    className="h-8 w-8"
                    onClick={toggleEffects}
                    aria-label="Toggle effects (particle flow + hover dimming)"
                    aria-pressed={effectsEnabled}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {effectsEnabled ? "Disable" : "Enable"} effects (particle flow + hover dimming)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Right: help — T6b: search input moved to <GraphToolbar />. */}
          <div className="flex items-center gap-1 shrink-0">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setShowHelp(true)}
                    aria-label="Keyboard shortcuts"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Shortcuts (?)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Filter chips row */}
        <div className="h-10 border-b bg-card/20 px-2.5 flex items-center gap-1.5 overflow-x-auto shrink-0">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1 shrink-0">Severity</span>
          {(["P0", "P1", "P2", "P3"] as const).map((sev) => (
            <FilterChip
              key={sev}
              label={sev}
              active={severityFilter.has(sev)}
              color={SEVERITY_COLOR[sev]}
              onClick={() => toggleSeverity(sev)}
            />
          ))}
          <FilterChip
            label="none"
            active={severityFilter.has("none")}
            onClick={() => toggleSeverity("none")}
          />
          <div className="w-px h-5 bg-border mx-1.5 shrink-0" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1 shrink-0">Status</span>
          {(["urgent", "pending", "independent"] as const).map((st) => (
            <FilterChip
              key={st}
              label={st}
              active={statusFilter.has(st)}
              color={STATUS_COLOR[st]}
              onClick={() => toggleStatus(st)}
            />
          ))}
          <FilterChip
            label="none"
            active={statusFilter.has("none")}
            onClick={() => toggleStatus("none")}
          />
          <div className="w-px h-5 bg-border mx-1.5 shrink-0" />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1 shrink-0">Clusters</span>
          <div className="flex items-center gap-1 overflow-x-auto">
            {CLUSTER_DEFS.map((c) => {
              const isCollapsed = collapsedClusters.has(c.id);
              const count = clusterInfo.counts.get(c.id) ?? 0;
              if (count === 0) return null;
              return (
                <button
                  key={c.id}
                  onClick={() => handleToggleCluster(c.id)}
                  className={cn(
                    "h-7 px-2 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1",
                    isCollapsed
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-accent hover:text-foreground",
                  )}
                  title={c.blurb}
                  aria-pressed={isCollapsed}
                >
                  {isCollapsed ? <Minimize2 className="h-2.5 w-2.5" /> : null}
                  {c.name}
                  <span className="opacity-70">·{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main: graph + inspector */}
        <div className="flex-1 flex flex-row min-h-0">
          <div
            ref={containerRef}
            className="relative flex-1 min-w-0 overflow-hidden"
            style={{ touchAction: "none", background: CV.background }}
          >
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Computating layout…</span>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
                <div className="text-xs text-rose-600 dark:text-rose-400">Error: {error}</div>
              </div>
            )}

            {data && USE_SPLIT_CANVAS && (
              <GraphCanvas
                nodes={data.nodes}
                edges={data.edges}
                onNodeClick={(id) => setSelectedId(id)}
              />
            )}

            {data && !USE_SPLIT_CANVAS && (
              <svg
                ref={svgRef}
                className="absolute inset-0 w-full h-full select-none"
                style={{ cursor: dragState.current?.active ? "grabbing" : "grab" }}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
                preserveAspectRatio="xMidYMid meet"
                onPointerDown={onBackgroundPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={onBackgroundClick}
              >
                <defs>
                  {/* Arrowhead markers per edge kind */}
                  {(["blocks", "pending", "recommended", "backstops"] as EdgeKind[]).map((k) => (
                    <marker
                      key={k}
                      id={`arrow-${k}`}
                      viewBox="0 0 10 10"
                      refX={9}
                      refY={5}
                      markerWidth={7}
                      markerHeight={7}
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_COLOR[k]} />
                    </marker>
                  ))}
                  {/* Subtle dot grid */}
                  <pattern id="grid-dots" width="50" height="50" patternUnits="userSpaceOnUse">
                    <circle cx="0" cy="0" r="1.2" fill={CV.mutedForeground} opacity={0.18} />
                  </pattern>
                  {/* Mega-hub soft glow filter */}
                  <filter id="mega-hub-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Background grid (also a pan/zoom target — has data-bg="true") */}
                <rect
                  data-bg="true"
                  x={viewBox.x}
                  y={viewBox.y}
                  width={viewBox.w}
                  height={viewBox.h}
                  fill="url(#grid-dots)"
                />

                {/* Pan/zoom group */}
                <g
                  transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
                  style={{
                    transition: dragState.current?.active ? "none" : "transform 80ms ease-out",
                  }}
                >
                  {/* Pipeline View: 5 swimlane bands (gate + 4 phases).
                      Rendered INSIDE the pan/zoom group so they align with
                      the world-space node positions. */}
                  {pipelineMode && (
                    <g data-bg="true" pointerEvents="all">
                      {(["gate", "0", "1", "2", "3"] as Phase[]).map((phase) => {
                        const laneOrder: Phase[] = ["gate", "0", "1", "2", "3"];
                        const laneIdx = laneOrder.indexOf(phase);
                        const laneY = 100 + laneIdx * (PIPELINE_LANE_HEIGHT + PIPELINE_LANE_GAP);
                        const color = PHASE_COLOR[phase];
                        // Compute the world-space width needed (from leftmost node
                        // to rightmost node + padding).
                        const laneWidth = Math.max(
                          1200,
                          (PIPELINE_ORDER[phase].length + 1) * PIPELINE_NODE_SPACING + 200,
                        );
                        return (
                          <g key={phase}>
                            {/* Lane background band */}
                            <rect
                              data-bg="true"
                              x={-100}
                              y={laneY}
                              width={laneWidth}
                              height={PIPELINE_LANE_HEIGHT}
                              fill={color}
                              opacity={0.06}
                            />
                            {/* Lane top border (dashed, colored) */}
                            <line
                              data-bg="true"
                              x1={-100}
                              y1={laneY}
                              x2={laneWidth - 100}
                              y2={laneY}
                              stroke={color}
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              opacity={0.5}
                            />
                            {/* Lane bottom border */}
                            <line
                              data-bg="true"
                              x1={-100}
                              y1={laneY + PIPELINE_LANE_HEIGHT}
                              x2={laneWidth - 100}
                              y2={laneY + PIPELINE_LANE_HEIGHT}
                              stroke={color}
                              strokeWidth={1.5}
                              strokeDasharray="6 4"
                              opacity={0.5}
                            />
                            {/* Phase label (left side) */}
                            <g pointerEvents="none">
                              <rect
                                x={-80}
                                y={laneY + 10}
                                width={300}
                                height={28}
                                rx={6}
                                fill={color}
                                opacity={0.95}
                              />
                              <text
                                x={-68}
                                y={laneY + 28}
                                fontSize={13}
                                fontWeight={700}
                                fill="white"
                                fontFamily="ui-monospace, SFMono-Regular, monospace"
                              >
                                {PHASE_LABEL[phase]}
                              </text>
                            </g>
                            {/* Phase blurb (smaller, below label) */}
                            <text
                              x={-68}
                              y={laneY + 52}
                              fontSize={10}
                              fontWeight={400}
                              fill={CV.mutedForeground}
                              fontFamily="ui-sans-serif, system-ui, sans-serif"
                              pointerEvents="none"
                            >
                              {PHASE_BLURB[phase].slice(0, 80)}
                              {PHASE_BLURB[phase].length > 80 ? "…" : ""}
                            </text>
                            {/* Node count badge (right side of label) */}
                            <g pointerEvents="none">
                              <circle
                                cx={210}
                                cy={laneY + 24}
                                r={11}
                                fill={color}
                                opacity={0.95}
                              />
                              <text
                                x={210}
                                y={laneY + 28}
                                textAnchor="middle"
                                fontSize={11}
                                fontWeight={700}
                                fill="white"
                                fontFamily="ui-monospace, SFMono-Regular, monospace"
                              >
                                {PIPELINE_ORDER[phase].length}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </g>
                  )}

                  {/* Edges */}
                  {renderedEdges.map((re) => {
                    const isConnected = !!selectedId && (re.fromId === selectedId || re.toId === selectedId);
                    const isFaded = !!selectedId && !isConnected;
                    const isHovered = hoveredEdgeKey === re.key;
                    const showLabel = showEdgeLabels || isConnected || isHovered;
                    // Hover-dim: an edge is dimmed when a node is hovered AND
                    // the edge is NOT connected to the hovered node.
                    const isHoverDimmed =
                      effectsEnabled && !!hoveredId &&
                      re.fromId !== hoveredId && re.toId !== hoveredId;
                    // Path overlay: edge is on the highlighted shortest path.
                    // Edge keys in pathInfo.edges are stored as both "a-b" and "b-a"
                    // to cover undirected matching.
                    const isOnPath = !!pathInfo && pathInfo.edges.has(re.key);
                    // Particle flow: only for "blocks" edges, when effects are on,
                    // not in pipeline mode (too cluttered), zoomed in enough to see,
                    // and not on a path (path has its own particle).
                    const enableParticles =
                      effectsEnabled &&
                      !pipelineMode &&
                      zoom >= ZOOM_HUB_ONLY &&
                      !prefersReducedMotionRef.current;
                    return (
                      <EdgeView
                        key={re.key}
                        edgeKey={re.key}
                        pathId={`edge-path-${re.key}`}
                        fromPos={re.fromPos}
                        toPos={re.toPos}
                        fromW={re.fromW}
                        fromH={re.fromH}
                        toW={re.toW}
                        toH={re.toH}
                        kind={re.kind}
                        label={re.label}
                        fanOffset={re.fanOffset}
                        isHighlighted={isConnected}
                        isFaded={isFaded}
                        isOnCriticalPath={re.isOnCriticalPath}
                        criticalMode={criticalMode}
                        showLabel={showLabel}
                        isHovered={isHovered}
                        isHoverDimmed={isHoverDimmed}
                        isOnPath={isOnPath}
                        enableParticles={enableParticles}
                        onHover={setHoveredEdgeKey}
                      />
                    );
                  })}

                  {/* Regular nodes */}
                  {renderableNodes.map((n) => {
                    const p = positions.get(n.id);
                    if (!p) return null;
                    const isMatch = !matchSet || matchSet.has(n.id);
                    return (
                      <NodeView
                        key={n.id}
                        node={n}
                        pos={p}
                        isSelected={selectedId === n.id}
                        isMatch={isMatch}
                        hasSearch={hasSearch}
                        isOnCriticalPath={CRITICAL_PATH.has(n.id)}
                        criticalMode={criticalMode}
                        degree={degreeMap.get(n.id) ?? 0}
                        zoom={zoom}
                        showDetail={showDetail}
                        dimmed={false}
                        isHoverDimmed={
                          effectsEnabled &&
                          !!hoverNeighborIds &&
                          !hoverNeighborIds.has(n.id)
                        }
                        isOnPath={!!pathNodeIds && pathNodeIds.has(n.id)}
                        isDragged={nodeDragState.current?.nodeId === n.id && nodeDragState.current?.active === true}
                        isPathSource={pathSourceId === n.id}
                        onClick={handleNodeClick}
                        onHoverEnter={handleNodeHoverEnter}
                        onHoverLeave={handleNodeHoverLeave}
                        onContextMenu={handleNodeContextMenu}
                        onPointerDown={handleNodePointerDown}
                        onDoubleClick={handleNodeDoubleClick}
                      />
                    );
                  })}

                  {/* Mega-nodes for collapsed clusters */}
                  {collapsedClusterList.map((c) => {
                    const ctr = clusterInfo.centroids.get(c.id);
                    if (!ctr) return null;
                    const memberCount = clusterInfo.counts.get(c.id) ?? 0;
                    const kindCounts = clusterInfo.kindCounts.get(c.id) ?? { gate: 0, task: 0, priority: 0 };
                    return (
                      <MegaNodeView
                        key={`mega-${c.id}`}
                        cluster={c}
                        pos={ctr}
                        memberCount={memberCount}
                        kindCounts={kindCounts}
                        isSelected={false}
                        onClick={() => handleMegaNodeClick(c.id)}
                      />
                    );
                  })}
                </g>
              </svg>
            )}

            {/* Legend (bottom-left, toggleable, starts collapsed) — T6a: extracted to GraphLegend */}
            {data && <GraphLegend lanes={[]} />}

            {/* Mini-map (bottom-right) */}
            {data && (
              <Minimap
                nodes={visibleNodes}
                positions={positions}
                collapsedClusters={collapsedClusters}
                clusterCentroids={clusterInfo.centroids}
                viewBox={viewBox}
                transform={transform}
                onPanTo={handlePanTo}
              />
            )}

            {/* Hint overlay (top-center) */}
            {data && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 bg-background/80 border rounded-md px-3 py-1 text-[10px] text-muted-foreground backdrop-blur pointer-events-none shadow-sm"
                style={{ borderColor: CV.border }}
              >
                {pipelineMode
                  ? "Pipeline View · 4 phases as swimlanes (Gate → P0 → P1 → P2/P3) · Drag to pan · "
                  : isHubOnlyMode
                    ? "Hub-only view · zoom in to see all nodes · "
                    : "Drag to pan · Scroll to zoom · Click to select · Hover edge for label · "}
                <kbd className="px-1 py-0.5 rounded bg-muted border text-[9px] font-mono">?</kbd> shortcuts
              </div>
            )}

            {/* Shortest-path badge (top-center, below hint) — click to dismiss */}
            {pathInfo && (
              <button
                onClick={() => { setPathInfo(null); setPathSourceId(null); }}
                className="absolute top-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-background/95 border rounded-md px-2.5 py-1 text-[10px] backdrop-blur shadow-sm hover:bg-accent transition-colors"
                style={{ borderColor: "var(--primary)" }}
                title="Click to dismiss path"
              >
                <Route className="h-3 w-3 text-primary" />
                <span className="font-mono font-semibold text-primary">
                  {pathInfo.nodes.join(" → ")}
                </span>
                <span className="text-muted-foreground">
                  ({Math.max(0, pathInfo.nodes.length - 1)} {pathInfo.nodes.length - 1 === 1 ? "hop" : "hops"})
                </span>
                <span className="text-muted-foreground ml-1">· click to dismiss</span>
              </button>
            )}

            {/* Path-source hint (when a source node is marked, waiting for Alt+Click target) */}
            {pathSourceId && !pathInfo && (
              <div
                className="absolute top-11 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-background/95 border rounded-md px-2.5 py-1 text-[10px] backdrop-blur shadow-sm pointer-events-none"
                style={{ borderColor: "var(--primary)" }}
              >
                <Route className="h-3 w-3 text-primary" />
                <span className="text-foreground">
                  Path source: <span className="font-mono font-semibold text-primary">{pathSourceId}</span>
                </span>
                <span className="text-muted-foreground">· Alt+Click another node to find the path</span>
              </div>
            )}

            {/* Selected-node neighbor hint (suggests Alt+Click for path) */}
            {selectedId && !pathInfo && !pathSourceId && (
              <div
                className="absolute top-11 left-1/2 -translate-x-1/2 bg-background/60 border rounded-md px-2 py-0.5 text-[9px] text-muted-foreground backdrop-blur pointer-events-none"
                style={{ borderColor: CV.border }}
              >
                Alt+Click another node to find the path · right-click for menu
              </div>
            )}

            {/* Right-click context menu */}
            {contextMenu && data && (() => {
              const node = nodesById.get(contextMenu.nodeId);
              if (!node) return null;
              const cluster = deriveCluster(node);
              const isCollapsed = collapsedClusters.has(cluster.id);
              return (
                <div
                  data-graph-context-menu
                  className="fixed z-50 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md p-1 text-xs"
                  style={{
                    top: Math.min(contextMenu.y, window.innerHeight - 220),
                    left: Math.min(contextMenu.x, window.innerWidth - 200),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2 py-1.5 border-b mb-1 flex items-center gap-1.5">
                    <span className="font-mono font-bold">{node.id}</span>
                    <span className="text-[10px] text-muted-foreground truncate">
                      {splitLabel(node.label).line2}
                    </span>
                  </div>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent text-left transition-colors"
                    onClick={() => handleContextMenuAction("center", node)}
                  >
                    <Crosshair className="h-3.5 w-3.5" />
                    <span>Center on this node</span>
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent text-left transition-colors"
                    onClick={() => handleContextMenuAction("jump", node)}
                  >
                    <CornerDownRight className="h-3.5 w-3.5" />
                    <span>Jump to first occurrence</span>
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent text-left transition-colors"
                    onClick={() => handleContextMenuAction("path-from-here", node)}
                  >
                    <Route className="h-3.5 w-3.5" />
                    <span>Find path from here…</span>
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent text-left transition-colors"
                    onClick={() => handleContextMenuAction("copy-id", node)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy ID</span>
                  </button>
                  <button
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent text-left transition-colors"
                    onClick={() => handleContextMenuAction("collapse-cluster", node)}
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>{isCollapsed ? "Expand cluster" : "Collapse cluster"}</span>
                  </button>
                </div>
              );
            })()}

            {/* Help overlay */}
            <HelpOverlay open={showHelp} onClose={() => setShowHelp(false)} />
          </div>

          {/* Inspector */}
          {data && (
            <Inspector
              node={selectedNode}
              edges={data.edges}
              nodesById={nodesById}
              degree={selectedNode ? degreeMap.get(selectedNode.id) ?? 0 : 0}
              onNodeClick={(n) => setSelectedId(n.id)}
              onJumpToNode={handleJumpToNode}
              onCenterOn={handleCenterOn}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DependencyGraphDialog;
