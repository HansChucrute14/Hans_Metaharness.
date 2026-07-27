"use client";

import { useEffect, useState, useMemo } from "react";
import { useDocStore } from "@/lib/doc-store";
import { cn } from "@/lib/utils";

export function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const files = useDocStore((s) => s.files);
  const activeFile = files.find((f) => f.slug === activeSlug);

  useEffect(() => {
    const scrollArea = document.getElementById("main-scroll");
    if (!scrollArea) return;

    const viewport = scrollArea.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement;
      if (scrollHeight <= clientHeight) {
        setProgress(0);
        return;
      }
      const pct = Math.min(100, (scrollTop / (scrollHeight - clientHeight)) * 100);
      setProgress(pct);
    };

    // initial check
    handleScroll();

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  // compute section tick positions (approximate % for each section boundary)
  const sectionTicks = useMemo(() => {
    if (!activeFile || activeFile.sections.length === 0) return [];
    const totalLines = activeFile.totalLines;
    return activeFile.sections
      .filter(s => s.level >= 2)
      .map(s => ({
        position: ((s.lineNumber) / totalLines) * 100,
        id: s.id,
      }));
  }, [activeFile]);

  if (progress <= 0) return null;

  return (
    <div className="h-1.5 bg-muted/30 relative shrink-0">
      {/* section boundary tick marks */}
      {sectionTicks.map((tick) => (
        <div
          key={tick.id}
          className="absolute top-0 h-full w-px bg-border/50"
          style={{ left: `${tick.position}%` }}
        />
      ))}
      {/* progress bar */}
      <div
        className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-150 ease-out relative"
        style={{ width: `${progress}%` }}
      >
        {/* percentage label */}
        <div className="absolute -right-8 -top-3 text-[10px] font-mono tabular-nums text-muted-foreground">
          {Math.round(progress)}%
        </div>
      </div>
      {/* doc name label */}
      {activeFile && progress < 15 && (
        <div className="absolute left-2 -top-3 text-[10px] text-muted-foreground truncate max-w-[120px]">
          {activeFile.title.slice(0, 20)}
        </div>
      )}
    </div>
  );
}
