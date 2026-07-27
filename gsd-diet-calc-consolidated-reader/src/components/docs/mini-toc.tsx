"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, ListTree } from "lucide-react";

interface SectionInfo {
  id: string;
  level: number;
  title: string;
  lineNumber: number;
  endLine: number;
  children: string[];
}

interface MiniTocProps {
  sections: SectionInfo[];
  activeSectionId: string | null;
}

/**
 * Floating document outline / "document map".
 *
 * Renders as a calm, readable panel anchored to the top-right of the reading
 * area. Shows the section hierarchy (levels 2–4) with clear indentation, a
 * left accent bar on the active section, a header with a collapse toggle, and
 * a max-height scroll region so very long documents don't overflow.
 *
 * Visibility is gated by the parent (hidden in focus mode). The panel itself
 * only fades in once the reader has scrolled past the first screen, so it
 * doesn't compete with the document title / hero card.
 */
export function MiniToc({ sections, activeSectionId }: MiniTocProps) {
  const [visible, setVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Fade the panel in only after the reader scrolls past the first screen.
  useEffect(() => {
    const viewport = document.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    const checkVisibility = () => {
      setVisible(viewport.scrollTop > 300);
    };

    checkVisibility();
    viewport.addEventListener("scroll", checkVisibility, { passive: true });
    return () => viewport.removeEventListener("scroll", checkVisibility);
  }, []);

  // Navigation levels: H2 = base, H3 = indented, H4 = double-indented.
  const navSections = useMemo(
    () => sections.filter((s) => s.level >= 2 && s.level <= 4),
    [sections]
  );

  const handleClick = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Keep the active row in view inside the outline's own scroll region.
  useEffect(() => {
    if (!activeSectionId || collapsed) return;
    const container = document.querySelector("[data-mini-toc-list]");
    if (!container) return;
    const el = container.querySelector(`[data-toc-id="${CSS.escape(activeSectionId)}"]`);
    if (!el) return;
    const rect = (el as HTMLElement).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
      (el as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [activeSectionId, collapsed]);

  if (navSections.length === 0) return null;

  return (
    <div
      className={cn(
        "hidden md:block fixed top-24 z-20 transition-all duration-300",
        // Offset past the right BacklinksPanel (w-72 = 288px) on lg+ screens
        // so the outline floats over the reading area, not the right sidebar.
        "right-4 lg:right-[304px]",
        visible
          ? "opacity-100 translate-x-0 pointer-events-auto"
          : "opacity-0 translate-x-4 pointer-events-none"
      )}
    >
      <div className="w-64 rounded-lg border bg-background/95 backdrop-blur shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b">
          <ListTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex-1">
            Outline
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono">
            {navSections.length}
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={collapsed ? "Expand outline" : "Collapse outline"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
        </div>

        {/* List */}
        {!collapsed && (
          <div
            data-mini-toc-list
            className="max-h-[60vh] overflow-y-auto scrollbar-thin p-1.5"
          >
            {navSections.map((s) => {
              const isActive = activeSectionId === s.id;
              const indent = s.level === 2 ? 0 : s.level === 3 ? 12 : 24;
              const title = s.title.replace(/^[#*\s]+/, "");
              return (
                <button
                  key={s.id}
                  type="button"
                  data-toc-id={s.id}
                  onClick={() => handleClick(s.id)}
                  title={title}
                  className={cn(
                    "block rounded text-xs leading-snug py-1 pr-2 pl-2 transition-colors border-l-2",
                    isActive
                      ? "border-primary text-foreground font-medium bg-accent/50"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  )}
                  style={{
                    marginLeft: `${indent}px`,
                    width: `calc(100% - ${indent}px)`,
                  }}
                >
                  <span className="line-clamp-1">{title}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
