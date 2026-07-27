"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDocStore, signalDocJump, signalDocJumpTo, type DocFileMeta } from "@/lib/doc-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BookOpen, Hash, ChevronRight, Clock, FileText, CheckCircle2 } from "lucide-react";
import React from "react";

// Circular progress ring (SVG)
function ProgressRing({ percent, size = 36, stroke = 3 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/60"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-500 ease-out"
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 origin-center fill-foreground text-[9px] font-bold font-mono"
        style={{ transformOrigin: "center" }}
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

interface TocDialogProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

interface TocEntry {
  section: DocFileMeta["sections"][number];
  docSlug: string;
  docTitle: string;
  docType: DocFileMeta["type"];
  depth: number;
  // whether this section has a known severity (P0/P1/P2/P3 in title)
  severity: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  P0: "bg-rose-500 text-white",
  P1: "bg-orange-500 text-white",
  P2: "bg-yellow-500 text-black",
  P3: "bg-gray-400 text-white",
};

function detectSeverity(title: string): string | null {
  const t = title.replace(/^[#*\s]+/, "");
  if (t.includes("P0") || t.toLowerCase().includes("critical")) return "P0";
  if (t.includes("P1") || t.toLowerCase().includes("high")) return "P1";
  if (t.includes("P2") || t.toLowerCase().includes("medium")) return "P2";
  if (t.includes("P3") || t.toLowerCase().includes("low")) return "P3";
  return null;
}

function typeLabel(type: DocFileMeta["type"]): string {
  if (type === "part") return "Part";
  if (type === "map") return "Bug Map";
  return "Appendix";
}

function typeBadgeStyle(type: DocFileMeta["type"]): string {
  if (type === "part") return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300";
  if (type === "map") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300";
  return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-300";
}

export function TocDialog({ open, onOpenChange }: TocDialogProps) {
  const files = useDocStore((s) => s.files);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const setActiveSectionId = useDocStore((s) => s.setActiveSectionId);
  const visitedSections = useDocStore((s) => s.visitedSections);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"current" | "all">("current");

  // Stats for current doc
  const currentFile = files.find(f => f.slug === activeSlug);
  const totalSections = currentFile?.sections.filter(s => s.level >= 2).length ?? 0;
  const visitedCount = currentFile
    ? currentFile.sections.filter(s => s.level >= 2 && visitedSections.has(s.id)).length
    : 0;
  const readPct = totalSections > 0 ? (visitedCount / totalSections) * 100 : 0;
  const totalLines = currentFile?.totalLines ?? 0;
  const readingTimeMin = Math.max(1, Math.round((totalLines / 60))); // ~60 lines/min
  const totalWords = Math.round(totalLines * 11); // ~11 words per line avg

  // reset scope to "current" when opening
  useEffect(() => {
    if (open) {
      // defer to next tick to avoid cascading renders
      setTimeout(() => {
        setQuery("");
        setScope("current");
      }, 0);
    }
  }, [open]);

  // build a flat list of all sections (for "all docs" mode) or just current doc
  const entries = useMemo<TocEntry[]>(() => {
    const out: TocEntry[] = [];
    const targetFiles =
      scope === "current"
        ? files.filter((f) => f.slug === activeSlug)
        : files;
    for (const file of targetFiles) {
      // build a depth lookup: for each section, count how many ancestors at lower levels exist above it
      const sections = file.sections;
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        if (s.level < 2) continue; // skip H1 (stripped from render)
        // depth = number of ancestors at lower level above this section
        let depth = 0;
        let curLevel = s.level;
        for (let j = i - 1; j >= 0; j--) {
          const prev = sections[j];
          if (prev.level < curLevel) {
            depth++;
            curLevel = prev.level;
            if (curLevel <= 1) break;
          }
        }
        out.push({
          section: s,
          docSlug: file.slug,
          docTitle: file.title,
          docType: file.type,
          depth: Math.min(depth, 4),
          severity: detectSeverity(s.title),
        });
      }
    }
    return out;
  }, [files, activeSlug, scope]);

  // filter by query
  const filtered = useMemo<TocEntry[]>(() => {
    if (!query.trim()) return entries;
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const title = e.section.title.replace(/^[#*\s]+/, "").toLowerCase();
      return title.includes(q);
    });
  }, [entries, query]);

  // group by document (only useful in "all" mode)
  const grouped = useMemo(() => {
    if (scope === "current") {
      return [{ docSlug: activeSlug ?? "", docTitle: "", docType: "part" as const, entries: filtered }];
    }
    const map = new Map<string, { docSlug: string; docTitle: string; docType: DocFileMeta["type"]; entries: TocEntry[] }>();
    for (const entry of filtered) {
      if (!map.has(entry.docSlug)) {
        const file = files.find((f) => f.slug === entry.docSlug);
        map.set(entry.docSlug, {
          docSlug: entry.docSlug,
          docTitle: entry.docTitle,
          docType: entry.docType,
          entries: [],
        });
        void file;
      }
      map.get(entry.docSlug)!.entries.push(entry);
    }
    return Array.from(map.values());
  }, [filtered, scope, activeSlug, files]);

  const handleSelect = (docSlug: string, sectionId: string) => {
    signalDocJump();
    setActiveSlug(docSlug);
    onOpenChange(false);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSectionId(sectionId);
      signalDocJumpTo(sectionId);
    }, 350);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Stats header with progress ring */}
      {currentFile && (
        <div className="flex items-center gap-3 px-3 pt-3 pb-2 border-b bg-muted/30">
          <ProgressRing percent={readPct} size={42} stroke={3.5} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold line-clamp-1">{currentFile.title}</div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <FileText className="h-2.5 w-2.5" />
                {totalLines.toLocaleString()} lines
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">
                <Hash className="h-2.5 w-2.5" />
                {totalSections} sections
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {readingTimeMin} min
              </span>
              <span className="text-border">·</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {visitedCount}/{totalSections} read
              </span>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 pt-3">
        <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setScope("current")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded transition-colors",
              scope === "current"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            This document
          </button>
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded transition-colors",
              scope === "all"
                ? "bg-background shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All documents
          </button>
        </div>
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {filtered.length} sections
        </span>
      </div>
      <CommandInput
        placeholder="Filter sections by title…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No sections match.</CommandEmpty>
        {grouped.map((group) => (
          <CommandGroup
            key={group.docSlug}
            heading={
              scope === "all" ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[9px] uppercase h-4", typeBadgeStyle(group.docType))}>
                    {typeLabel(group.docType)}
                  </Badge>
                  <span className="text-xs">{group.docTitle}</span>
                </div>
              ) : undefined
            }
          >
            {group.entries.map((entry) => {
              const title = entry.section.title.replace(/^[#*\s]+/, "");
              const isActive = entry.docSlug === activeSlug;
              const isVisited = visitedSections.has(entry.section.id);
              // estimate reading time per section: ~12 words/line, ~60 lines/min => ~5 sec/line
              const sectionLines = Math.max(1, (entry.section.endLine || entry.section.lineNumber) - entry.section.lineNumber);
              const sectionMinutes = Math.max(1, Math.round(sectionLines / 60));
              return (
                <CommandItem
                  key={`${entry.docSlug}-${entry.section.id}`}
                  value={`toc-${entry.docSlug}-${entry.section.id}`}
                  onSelect={() => handleSelect(entry.docSlug, entry.section.id)}
                  className="gap-2 py-1.5"
                  style={{ paddingLeft: `${12 + entry.depth * 14}px` }}
                >
                  {entry.severity ? (
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        SEVERITY_COLORS[entry.severity]
                      )}
                    />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn("text-xs flex-1 truncate", isActive && "font-medium")}>
                    {title}
                  </span>
                  {isVisited && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" aria-label="Visited" />
                  )}
                  {entry.severity && (
                    <Badge className={cn("text-[9px] h-4 px-1 font-mono", SEVERITY_COLORS[entry.severity])}>
                      {entry.severity}
                    </Badge>
                  )}
                  <span
                    className="text-[9px] text-muted-foreground font-mono shrink-0"
                    title={`~${sectionMinutes} min read · ${sectionLines} lines`}
                  >
                    {sectionMinutes}m
                  </span>
                  <span className="text-[9px] text-muted-foreground/70 font-mono shrink-0">
                    L{entry.section.lineNumber}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
