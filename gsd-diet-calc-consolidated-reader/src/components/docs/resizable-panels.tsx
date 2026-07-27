"use client";

/**
 * Organic drag-to-resize panel system.
 *
 * Design goals (per user request: "organically adjust, with good organic feel
 * to resizing, meaning UX must be top notch"):
 *
 *   1. Invisible-when-idle handle that grows on hover (1px → 4px → 8px drag).
 *   2. Smooth width transitions when NOT dragging (120ms ease-out).
 *   3. Instant response DURING drag (no transition lag — feels "attached").
 *   4. Multi-tier visual feedback:
 *        - idle: 1px subtle line
 *        - hover: 4px gradient bar + cursor col-resize
 *        - drag:  8px solid accent + glow + cursor grabbing + overlay tooltip
 *   5. Persistence to localStorage (per-panel key).
 *   6. Min/max constraints (clamp).
 *   7. Double-click handle → reset to default width.
 *   8. Keyboard accessible: when handle focused, Arrow keys = ±8px,
 *      Shift+Arrow = ±32px, Home = reset.
 *   9. Touch-friendly: 16px-wide invisible hit area for fingers.
 *  10. Works for both 'left' (drag right to grow) and 'right' (drag left to grow)
 *      sides — direction is encoded in the hook.
 *  11. RAF-throttled pointermove for 60fps even on slow machines.
 *  12. Window-aware: clamps to viewport width so panel can't exceed 50% of
 *      viewport (prevents trapping the user).
 *  13. Custom resize cursor applied to <body> during drag (so cursor stays
 *      correct even when pointer leaves the handle temporarily).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------- hook ----------

interface UseResizableOptions {
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  /** "left" = drag right to grow; "right" = drag left to grow. */
  side: "left" | "right";
  /** Max fraction of viewport the panel can occupy (default 0.5). */
  maxViewportFraction?: number;
}

interface UseResizableReturn {
  width: number;
  isDragging: boolean;
  isHovering: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onHoverChange: (hovering: boolean) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  reset: () => void;
}

function useResizable(opts: UseResizableOptions): UseResizableReturn {
  const {
    initialWidth,
    minWidth = 200,
    maxWidth = 600,
    storageKey,
    side,
    maxViewportFraction = 0.5,
  } = opts;

  // Hydrate from localStorage (SSR-safe).
  const [width, setWidth] = React.useState<number>(() => {
    if (typeof window === "undefined" || !storageKey) return initialWidth;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return initialWidth;
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n >= minWidth && n <= maxWidth) return n;
      return initialWidth;
    } catch {
      return initialWidth;
    }
  });

  const [isDragging, setIsDragging] = React.useState(false);
  const [isHovering, setIsHovering] = React.useState(false);

  // Refs for drag state (avoid re-renders during pointermove)
  const dragStateRef = React.useRef<{
    startX: number;
    startWidth: number;
    pointerId: number;
    rafId: number | null;
    nextWidth: number;
  } | null>(null);

  // Persist width changes (debounced via microtask)
  const persistTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, String(width));
      } catch {
        /* ignore */
      }
    }, 150);
  }, [width, storageKey]);

  // Clamp helper — also respects viewport fraction.
  const clampWidth = React.useCallback(
    (w: number) => {
      const dynamicMax =
        typeof window !== "undefined"
          ? Math.min(maxWidth, window.innerWidth * maxViewportFraction)
          : maxWidth;
      return Math.max(minWidth, Math.min(dynamicMax, w));
    },
    [minWidth, maxWidth, maxViewportFraction],
  );

  // Recompute clamp on viewport resize (so a panel doesn't stay huge when
  // the window shrinks).
  React.useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampWidth]);

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      // Only primary button (left click / touch)
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = width;
      const pointerId = e.pointerId;

      // Capture the pointer so we keep getting move events even if the
      // pointer leaves the handle element.
      (e.currentTarget as HTMLElement).setPointerCapture(pointerId);

      dragStateRef.current = {
        startX,
        startWidth,
        pointerId,
        rafId: null,
        nextWidth: startWidth,
      };
      setIsDragging(true);

      // Apply a body-level cursor so the col-resize cursor persists even
      // when the pointer is briefly outside the handle.
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [width],
  );

  // Pointer move + up handlers attached via useEffect (using native events
  // on the captured element). React's synthetic onPointerMove would work too,
  // but using the pointer capture API + native listeners is more robust.
  React.useEffect(() => {
    if (!isDragging) return;

    const handleEl = dragStateRef.current
      ? (document.querySelector(`[data-resize-handle="${side}"]`) as HTMLElement | null)
      : null;

    const onMove = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const dx = e.clientX - ds.startX;
      // For "left" side: dragging right increases width.
      // For "right" side: dragging left increases width (so invert dx).
      const delta = side === "left" ? dx : -dx;
      const next = clampWidth(ds.startWidth + delta);

      // RAF-throttle the React state update for 60fps smoothness.
      if (ds.rafId !== null) return;
      ds.nextWidth = next;
      ds.rafId = requestAnimationFrame(() => {
        ds.rafId = null;
        setWidth(ds.nextWidth);
      });
    };

    const onUp = (e: PointerEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      if (ds.rafId !== null) cancelAnimationFrame(ds.rafId);
      // Final flush — make sure the last position is applied.
      const dx = e.clientX - ds.startX;
      const delta = side === "left" ? dx : -dx;
      setWidth(clampWidth(ds.startWidth + delta));
      dragStateRef.current = null;
      setIsDragging(false);
      // Restore body styles
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try {
        handleEl?.releasePointerCapture(ds.pointerId);
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isDragging, side, clampWidth]);

  const onHoverChange = React.useCallback((hovering: boolean) => {
    setIsHovering(hovering);
  }, []);

  const reset = React.useCallback(() => {
    setWidth(clampWidth(initialWidth));
  }, [initialWidth, clampWidth]);

  const onDoubleClick = React.useCallback(() => {
    reset();
  }, [reset]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 32 : 8;
      let next = width;
      if (e.key === "ArrowLeft") {
        // For "left" side: left arrow shrinks; for "right" side: left arrow grows
        next = side === "left" ? width - step : width + step;
      } else if (e.key === "ArrowRight") {
        next = side === "left" ? width + step : width - step;
      } else if (e.key === "Home") {
        next = initialWidth;
      } else {
        return;
      }
      e.preventDefault();
      setWidth(clampWidth(next));
    },
    [width, side, initialWidth, clampWidth],
  );

  return {
    width,
    isDragging,
    isHovering,
    onPointerDown,
    onHoverChange,
    onDoubleClick,
    onKeyDown,
    reset,
  };
}

// ---------- ResizeHandle component ----------

interface ResizeHandleProps {
  side: "left" | "right";
  isDragging: boolean;
  isHovering: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onHoverChange: (hovering: boolean) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * The visual handle. Three visual states (idle / hover / drag) plus a width
 * tooltip that appears during drag.
 */
function ResizeHandle({
  side,
  isDragging,
  isHovering,
  onPointerDown,
  onHoverChange,
  onDoubleClick,
  onKeyDown,
}: ResizeHandleProps) {
  // Active width: thicker when interacting.
  const barWidth = isDragging ? 8 : isHovering ? 4 : 1;

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Resize ${side} panel (drag or use arrow keys)`}
      data-resize-handle={side}
      onPointerDown={onPointerDown}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative shrink-0 select-none touch-none",
        "transition-[width] duration-150 ease-out",
        "focus-visible:outline-none",
        // Wide invisible hit area (16px) for easy grabbing —
        // but the visible bar is much narrower.
        "w-4",
        // Cursor
        isDragging ? "cursor-grabbing" : "cursor-col-resize",
      )}
      style={{
        // Position the hit area so it overlaps the panel border for a
        // seamless feel. The visible bar is centered inside.
        [side === "left" ? "marginLeft" : "marginRight"]: "-8px",
      }}
    >
      {/* Visible bar — centered in the 16px hit area */}
      <div
        className={cn(
          "absolute top-0 bottom-0 left-1/2 -translate-x-1/2",
          "transition-all duration-150 ease-out",
          isDragging ? "z-50" : "z-10",
        )}
        style={{
          width: `${barWidth}px`,
          background: isDragging
            ? "linear-gradient(180deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 70%, var(--accent)) 100%)"
            : isHovering
              ? "linear-gradient(180deg, color-mix(in oklch, var(--primary) 50%, transparent) 0%, color-mix(in oklch, var(--primary) 35%, transparent) 100%)"
              : "var(--border)",
          boxShadow: isDragging
            ? "0 0 0 1px color-mix(in oklch, var(--primary) 30%, transparent), 0 0 12px color-mix(in oklch, var(--primary) 40%, transparent)"
            : isHovering
              ? "0 0 8px color-mix(in oklch, var(--primary) 20%, transparent)"
              : "none",
          borderRadius: isDragging ? "4px" : "2px",
        }}
      />

      {/* Grip dots — visible on hover/drag, centered vertically */}
      {(isHovering || isDragging) && (
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "flex flex-col gap-0.5 pointer-events-none",
            isDragging ? "opacity-100" : "opacity-70",
          )}
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-0.5">
              {[0, 1].map((j) => (
                <div
                  key={j}
                  className="h-0.5 w-0.5 rounded-full"
                  style={{
                    background: isDragging ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Drag tooltip — shows current width while dragging */}
      {isDragging && (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-50 pointer-events-none",
            "px-2 py-1 rounded-md text-[10px] font-mono font-semibold",
            "bg-primary text-primary-foreground shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-100",
            side === "left" ? "left-6" : "right-6",
          )}
        >
          Resize me
        </div>
      )}

      {/* Focus ring for keyboard accessibility */}
      <div
        className="absolute inset-0 rounded pointer-events-none ring-1 ring-primary/0 group-focus-visible:ring-2 group-focus-visible:ring-primary/60 transition"
        aria-hidden
      />
    </div>
  );
}

// ---------- ResizableAside wrapper ----------

interface ResizableAsideProps {
  side: "left" | "right";
  initialWidth: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey: string;
  /** When true, the aside is hidden (e.g., in focus mode). */
  hidden?: boolean;
  /** When true, the aside is hidden on small screens (CSS responsive). */
  hiddenOnMobile?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * A self-contained resizable aside panel with an attached drag handle.
 *
 * Usage:
 *   <ResizableAside side="left" initialWidth={288} storageKey="sidebar-w" hiddenOnMobile hidden={!isFocus}>
 *     <DocSidebar />
 *   </ResizableAside>
 */
export function ResizableAside(props: ResizableAsideProps) {
  const {
    side,
    initialWidth,
    minWidth,
    maxWidth,
    storageKey,
    hidden = false,
    hiddenOnMobile = false,
    className,
    children,
  } = props;

  const {
    width,
    isDragging,
    isHovering,
    onPointerDown,
    onHoverChange,
    onDoubleClick,
    onKeyDown,
  } = useResizable({
    initialWidth,
    minWidth,
    maxWidth,
    storageKey,
    side,
  });

  if (hidden) return null;

  // The handle goes on the "inside" edge of the panel — i.e., for a "left"
  // panel the handle is on the right edge of the panel (toward the main
  // content), and vice versa.
  const handle = (
    <ResizeHandle
      side={side}
      isDragging={isDragging}
      isHovering={isHovering}
      onPointerDown={onPointerDown}
      onHoverChange={onHoverChange}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  );

  return (
    <div
      className={cn(
        "flex h-full shrink-0",
        // When dragging, disable width transition for instant response.
        !isDragging && "transition-[width] duration-150 ease-out",
        hiddenOnMobile && "hidden md:flex",
        className,
      )}
      style={{ width: `${width}px` }}
    >
      {side === "left" && (
        <>
          <div className="flex-1 min-w-0 h-full overflow-hidden border-r bg-muted/30">
            {children}
          </div>
          {handle}
        </>
      )}
      {side === "right" && (
        <>
          {handle}
          <div className="flex-1 min-w-0 h-full overflow-hidden border-l bg-background/95 backdrop-blur-sm">
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// Re-export the hook for advanced uses
export { useResizable, ResizeHandle };
