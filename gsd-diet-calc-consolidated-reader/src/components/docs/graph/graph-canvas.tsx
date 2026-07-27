"use client";

/**
 * GraphCanvas — the split-canvas rendering path for the dependency-graph
 * dialog (T6c, FEATURE-FLAGGED behind NEXT_PUBLIC_GRAPH_SPLIT=v1).
 *
 * This component is a SIMPLER alternative to the inline `<svg>` JSX that
 * still lives in the orchestrator (the "LegacyCanvas"). The split path is
 * gated so the LegacyCanvas remains the default; the two can be visually
 * diffed before flipping the default (blueprint §T6c verification, STEP 3).
 *
 * Architectural differences from the LegacyCanvas (per blueprint Decision 3
 * and §12.6):
 *
 *   1. Pan/zoom state lives in `useGraphViewport` (a ref-not-closure hook).
 *      The wheel handler reads `nodesRef.current`, so a graph:synced re-fetch
 *      that swaps the nodes array is observed without re-binding handlers
 *      (stale-closure fix — Persona B Attack 1).
 *
 *   2. Each node element is stamped with `data-graph-node={node.id}` so the
 *      orchestrator's click-outside handler can decide "did the click land
 *      on a node?" via `target.closest("[data-graph-node]")` — eliminating
 *      the `stopPropagation` ordering dependency (§12.6 MANDATED-1).
 *
 *   3. The global click / keydown / scroll listeners STAY in the
 *      orchestrator (Persona B Attack 2 — event-ordering). GraphCanvas only
 *      fires `onNodeClick(id)`; it does NOT stopPropagation on the click.
 *
 * The LegacyCanvas is UNTOUCHED and remains the default fallback. The split
 * path is only active when `process.env.NEXT_PUBLIC_GRAPH_SPLIT === "v1"`.
 *
 * Blueprint: docs/architecture-review/04-document3-implementation-blueprint.md
 * §T6c (lines 592-622) + §12.6 (lines 1172-1220).
 */

import * as React from "react";
import { useEffect, useMemo, useRef } from "react";
import type { GraphNode, GraphEdge, EdgeKind } from "@/lib/dependency-graph";
import { useGraphViewport } from "./use-graph-viewport";
import {
  SEVERITY_COLOR,
  EDGE_COLOR,
  EDGE_DASH,
  EDGE_WIDTH,
  KIND_ACCENT,
  CV,
} from "./graph-constants";

// ---------- layout constants (mirror the orchestrator's node dimensions) ----------
const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const VIEWBOX_PAD = 60;

const EDGE_KINDS: EdgeKind[] = ["blocks", "pending", "recommended", "backstops"];

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (id: string) => void;
}

/**
 * Compute the SVG viewBox from node positions so the canvas fits the data.
 * Padded by VIEWBOX_PAD on every side. Falls back to a 800x600 box when
 * there are no nodes (e.g. loading state).
 */
function computeViewBox(nodes: GraphNode[]): { x: number; y: number; w: number; h: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, w: 800, h: 600 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const left = n.x - NODE_WIDTH / 2;
    const top = n.y - NODE_HEIGHT / 2;
    const right = n.x + NODE_WIDTH / 2;
    const bottom = n.y + NODE_HEIGHT / 2;
    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }
  return {
    x: minX - VIEWBOX_PAD,
    y: minY - VIEWBOX_PAD,
    w: maxX - minX + VIEWBOX_PAD * 2,
    h: maxY - minY + VIEWBOX_PAD * 2,
  };
}

function splitLabel(label: string): { line1: string; line2: string } {
  // Mirror the orchestrator's splitLabel — prefer the last space, fall back
  // to a hard cut at 18 chars. Keeps the two-line node title readable.
  const max = 18;
  if (label.length <= max) return { line1: label, line2: "" };
  const lastSpace = label.lastIndexOf(" ", max);
  if (lastSpace > 4) {
    return { line1: label.slice(0, lastSpace), line2: label.slice(lastSpace + 1) };
  }
  return { line1: label.slice(0, max), line2: label.slice(max) };
}

export function GraphCanvas({ nodes, edges, onNodeClick }: GraphCanvasProps) {
  // ---- nodesRef: the bridge to useGraphViewport's stale-closure-safe handlers ----
  // The ref is updated on every render via the effect below; the hook's wheel
  // handler reads `nodesRef.current` so it always sees the latest array.
  const nodesRef = useRef<GraphNode[]>(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const viewport = useGraphViewport(nodesRef);

  // ---- viewBox (computed from latest nodes; re-fits on data change) ----
  const viewBox = useMemo(() => computeViewBox(nodes), [nodes]);

  // ---- node lookup (for edge endpoint resolution) ----
  const nodesById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  return (
    <svg
      className="absolute inset-0 w-full h-full select-none"
      style={{
        cursor: "grab",
        background: CV.background,
        touchAction: "none",
      }}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={viewport.onWheel}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
      onPointerCancel={viewport.onPointerUp}
    >
      <defs>
        {/* Arrowhead markers per edge kind (namespaced `gc-` to avoid
            clashing with the LegacyCanvas's `arrow-<kind>` markers when
            both SVGs happen to be in the DOM during a flag flip). */}
        {EDGE_KINDS.map((k) => (
          <marker
            key={k}
            id={`gc-arrow-${k}`}
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
        {/* Subtle dot grid (matches the LegacyCanvas background) */}
        <pattern id="gc-grid-dots" width="50" height="50" patternUnits="userSpaceOnUse">
          <circle cx="0" cy="0" r={1.2} fill={CV.mutedForeground} opacity={0.18} />
        </pattern>
      </defs>

      {/* Background grid (also a pan/zoom target — pointerdown bails if the
          click lands on a node, so dragging here pans the viewport). */}
      <rect
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.w}
        height={viewBox.h}
        fill="url(#gc-grid-dots)"
      />

      {/* Pan/zoom group — transform values come from useGraphViewport. */}
      <g
        transform={`translate(${viewport.translateX}, ${viewport.translateY}) scale(${viewport.scale})`}
      >
        {/* Edges (simple straight lines + arrowheads; the LegacyCanvas uses
            curved cubic-bezier edges with fan-out — that complexity is
            intentionally NOT replicated here. The split path prioritizes
            architectural correctness over visual parity; STEP 3 of the
            verification protocol gates the flag flip on pixel-diff.) */}
        {edges.map((e, i) => {
          const from = nodesById.get(e.from);
          const to = nodesById.get(e.to);
          if (!from || !to) return null;
          return (
            <line
              key={`gc-edge-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={EDGE_COLOR[e.kind]}
              strokeWidth={EDGE_WIDTH[e.kind]}
              strokeDasharray={EDGE_DASH[e.kind]}
              opacity={0.7}
              markerEnd={`url(#gc-arrow-${e.kind})`}
            />
          );
        })}

        {/* Nodes — each <g> is stamped with `data-graph-node={id}` so the
            orchestrator's click-outside handler can detect "click landed on
            a node" via target.closest("[data-graph-node]"). This is the
            §12.6 WIRE-1 fix; it removes the stopPropagation ordering
            dependency that the LegacyCanvas's NodeView relies on. */}
        {nodes.map((n) => {
          const accent = KIND_ACCENT[n.kind];
          const sev = n.severity ? SEVERITY_COLOR[n.severity] : accent;
          const { line1, line2 } = splitLabel(n.label);
          return (
            <g
              key={n.id}
              data-graph-node={n.id}
              data-node-id={n.id}
              transform={`translate(${n.x - NODE_WIDTH / 2}, ${n.y - NODE_HEIGHT / 2})`}
              style={{ cursor: "pointer" }}
              onClick={() => onNodeClick(n.id)}
            >
              <rect
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={8}
                fill={CV.card}
                stroke={sev}
                strokeWidth={2}
              />
              {/* Severity accent bar (left edge) */}
              <rect width={4} height={NODE_HEIGHT} rx={2} fill={sev} />
              <text
                x={NODE_WIDTH / 2}
                y={22}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={CV.cardForeground}
                fontFamily="ui-monospace, SFMono-Regular, monospace"
                pointerEvents="none"
              >
                {n.id}
              </text>
              <text
                x={NODE_WIDTH / 2}
                y={line2 ? 38 : 34}
                textAnchor="middle"
                fontSize={10}
                fill={CV.mutedForeground}
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                pointerEvents="none"
              >
                {line1}
              </text>
              {line2 && (
                <text
                  x={NODE_WIDTH / 2}
                  y={48}
                  textAnchor="middle"
                  fontSize={10}
                  fill={CV.mutedForeground}
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  pointerEvents="none"
                >
                  {line2}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
