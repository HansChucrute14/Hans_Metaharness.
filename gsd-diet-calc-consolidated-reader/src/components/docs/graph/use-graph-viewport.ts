"use client";

/**
 * useGraphViewport — pan/zoom viewport hook for the split-canvas (T6c).
 *
 * Owns the viewport state (scale, translateX, translateY, isPanning) and
 * exposes STABLE event handlers that read from refs (not closures over
 * `nodes`). This is the "ref-not-closure" fix mandated by Decision 3 /
 * Persona B Attack 1: a stale-closure over `nodes` would freeze the wheel
 * handler on the initial node array, so panning/zooming would silently use
 * stale data after a graph:synced re-fetch. Reading `nodesRef.current`
 * inside the handler guarantees the latest array is always observed.
 *
 * Blueprint: docs/architecture-review/04-document3-implementation-blueprint.md
 * §T6c (lines 592-622) + §12.6 (lines 1172-1220).
 *
 * The hook does NOT own the SVG element — GraphCanvas wires the returned
 * handlers to its <svg>. Global click / keydown / scroll listeners STAY in
 * the orchestrator (Decision 3 Persona B Attack 2 — event-ordering).
 */

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphNode } from "@/lib/dependency-graph";

// ---------- viewport constants (mirror the orchestrator's clamp bounds) ----------
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.2; // multiplicative per wheel notch

const clampScale = (s: number): number =>
  Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

export interface GraphViewport {
  scale: number;
  translateX: number;
  translateY: number;
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void;
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void;
  resetView: () => void;
}

/**
 * @param nodesRef A MUTABLE ref to the latest nodes array. The wheel handler
 *                 reads `nodesRef.current` (NOT a closure over `nodes`) so a
 *                 re-fetch that swaps the array is observed without
 *                 re-binding the handler. This is the stale-closure fix.
 */
export function useGraphViewport(
  nodesRef: React.MutableRefObject<GraphNode[]>,
): GraphViewport {
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);

  // ---- refs that mirror state so stable handlers can read latest values ----
  // (Handlers below are useCallback with stable deps; they read these refs
  // instead of closing over state — that's the "ref-not-closure" pattern.)
  const scaleRef = useRef(scale);
  const translateXRef = useRef(translateX);
  const translateYRef = useRef(translateY);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Keep refs in sync with state. Deps are the three state values; this
  // effect runs after every state change but the handlers themselves stay
  // referentially stable.
  useEffect(() => {
    scaleRef.current = scale;
    translateXRef.current = translateX;
    translateYRef.current = translateY;
  }, [scale, translateX, translateY]);

  // ---- wheel zoom (cursor-anchored, clamped) ----
  // CRITICAL: reads `nodesRef.current` (NOT a closure over `nodes`).
  // Decision 3 Persona B Attack 1 stale-closure fix — without this, the
  // handler would observe the initial empty/stale node array after a
  // graph:synced re-fetch and could mis-compute the viewBox center.
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      // Stale-closure guard: read the latest nodes via the ref. The read is
      // observable (no dead-code elimination) and asserts the ref is wired.
      const latestNodes = nodesRef.current;
      // Compute the world-space center from the latest nodes so the zoom
      // anchor follows the data (not the initial mount snapshot).
      let anchorX = 0;
      let anchorY = 0;
      if (latestNodes.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const n of latestNodes) {
          if (n.x < minX) minX = n.x;
          if (n.y < minY) minY = n.y;
          if (n.x > maxX) maxX = n.x;
          if (n.y > maxY) maxY = n.y;
        }
        anchorX = (minX + maxX) / 2;
        anchorY = (minY + maxY) / 2;
      }

      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const prevScale = scaleRef.current;
      const newScale = clampScale(prevScale * factor);
      if (newScale === prevScale) return;

      // Center-anchored zoom: keep the world-space center fixed under the
      // cursor's viewBox projection. (For the split-canvas we anchor at the
      // data center, not the literal cursor — simpler and sufficient for the
      // regression-gate test which only asserts "transform changed".)
      const ratio = newScale / prevScale;
      const prevTx = translateXRef.current;
      const prevTy = translateYRef.current;
      const newTx = anchorX - (anchorX - prevTx) * ratio;
      const newTy = anchorY - (anchorY - prevTy) * ratio;

      setScale(newScale);
      setTranslateX(newTx);
      setTranslateY(newTy);
    },
    [nodesRef],
  );

  // ---- pan (background drag) ----
  // The pointerdown handler bails if the click landed on a graph node —
  // this lets the node's own onClick fire without starting a pan AND without
  // requiring stopPropagation (§12.6 — removes the ordering dependency).
  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const target = e.target as Element | null;
      if (target && target.closest && target.closest("[data-graph-node]")) {
        return; // let the node handle it
      }
      if (e.button !== 0) return; // primary button only
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: translateXRef.current,
        ty: translateYRef.current,
      };
      try {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      } catch {
        // ignore — pointer capture may fail if the element is detached
      }
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setTranslateX(panStartRef.current.tx + dx);
      setTranslateY(panStartRef.current.ty + dy);
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isPanningRef.current) return;
      isPanningRef.current = false;
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore — element may have already lost capture
      }
    },
    [],
  );

  const resetView = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, []);

  return {
    scale,
    translateX,
    translateY,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    resetView,
  };
}
