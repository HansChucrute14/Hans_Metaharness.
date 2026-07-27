"use client";

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useDocStore } from "@/lib/doc-store";
import { useGraphNodesStatus } from "@/hooks/use-graph-node";
import type { GraphNode } from "@/lib/dependency-graph";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search, FileText, BookOpen, Network, Star, Trophy, ArrowLeftRight,
  ListOrdered, Eye, Maximize, ClipboardCheck, Hash, Bug, CheckSquare,
  Shield, CornerDownRight, Keyboard, Zap, Sparkles, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getBugFact } from "@/lib/bug-facts";

export interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: "navigation" | "documents" | "tools" | "settings" | "bugs" | "recent";
  keywords?: string[];
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSearch: () => void;
  onOpenGraph: () => void;
  onOpenToc: () => void;
  onOpenProgress: () => void;
  onOpenComparison: () => void;
  onOpenShortcuts: () => void;
}

// Reusable Kbd component for consistent key-cap styling
function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5",
        "text-[10px] font-mono font-medium leading-none",
        "rounded border border-border bg-muted text-muted-foreground",
        "shadow-[0_1px_0_rgb(0_0_0_/_0.05)]",
        "dark:shadow-[0_1px_0_rgb(255_255_255_/_0.05)]",
        className
      )}
    >
      {children}
    </kbd>
  );
}

const RECENT_KEY = "gsd-cmd-recent";
const MAX_RECENT = 5;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(id: string) {
  try {
    const cur = loadRecent();
    const next = [id, ...cur.filter(x => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenSearch,
  onOpenGraph,
  onOpenToc,
  onOpenProgress,
  onOpenComparison,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const readingMode = useDocStore((s) => s.readingMode);
  const setReadingMode = useDocStore((s) => s.setReadingMode);
  // T8b §12.2: eager-fetched graph payload from the store. Built into a Map
  // for O(1) lookup inside the `allActions` useMemo (called per-ID — can't
  // use the `useGraphNode(id)` hook there because hooks can't be called in
  // loops). Falls back to getBugFact for finding IDs not in the graph.
  const graphNodes = useDocStore((s) => s.graphNodes);
  const graphNodesStatus = useGraphNodesStatus();
  const graphNodesByXref = useMemo<Map<string, GraphNode>>(() => {
    const m = new Map<string, GraphNode>();
    for (const n of graphNodes) m.set(n.id, n);
    return m;
  }, [graphNodes]);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent on mount
  useEffect(() => {
    setRecentIds(loadRecent());
  }, []);

  // Build the full action list
  const allActions = useMemo<CommandAction[]>(() => {
    const actions: CommandAction[] = [];

    // Tools
    actions.push({
      id: "tool-search",
      label: "Search content",
      description: "Full-text search across all documents",
      icon: <Search className="h-4 w-4" />,
      category: "tools",
      keywords: ["find", "lookup", "query"],
      shortcut: "⌘K",
      action: () => { saveRecent("tool-search"); onOpenSearch(); onOpenChange(false); },
    });
    actions.push({
      id: "tool-toc",
      label: "Table of contents",
      description: "Browse all sections across documents",
      icon: <ListOrdered className="h-4 w-4" />,
      category: "tools",
      keywords: ["outline", "sections", "chapters"],
      shortcut: "t",
      action: () => { saveRecent("tool-toc"); onOpenToc(); onOpenChange(false); },
    });
    actions.push({
      id: "tool-graph",
      label: "Dependency graph",
      description: "Interactive 36-node bug/fix dependency graph",
      icon: <Network className="h-4 w-4" />,
      category: "tools",
      keywords: ["dependencies", "blocks", "critical path"],
      shortcut: "g",
      action: () => { saveRecent("tool-graph"); onOpenGraph(); onOpenChange(false); },
    });
    actions.push({
      id: "tool-comparison",
      label: "Compare documents",
      description: "Side-by-side comparison of two documents",
      icon: <ArrowLeftRight className="h-4 w-4" />,
      category: "tools",
      keywords: ["diff", "side by side", "compare"],
      shortcut: "v",
      action: () => { saveRecent("tool-comparison"); onOpenComparison(); onOpenChange(false); },
    });
    actions.push({
      id: "tool-progress",
      label: "Reading progress",
      description: "View reading stats and findings coverage",
      icon: <Trophy className="h-4 w-4" />,
      category: "tools",
      keywords: ["stats", "dashboard", "coverage"],
      shortcut: "p",
      action: () => { saveRecent("tool-progress"); onOpenProgress(); onOpenChange(false); },
    });
    actions.push({
      id: "tool-shortcuts",
      label: "Keyboard shortcuts",
      description: "Show all available keyboard shortcuts",
      icon: <Keyboard className="h-4 w-4" />,
      category: "tools",
      keywords: ["help", "keys"],
      shortcut: "?",
      action: () => { saveRecent("tool-shortcuts"); onOpenShortcuts(); onOpenChange(false); },
    });

    // Settings — reading modes
    const modeIcons: Record<string, React.ReactNode> = {
      linear: <FileText className="h-4 w-4" />,
      focus: <Maximize className="h-4 w-4" />,
      xref: <Eye className="h-4 w-4" />,
      audit: <ClipboardCheck className="h-4 w-4" />,
    };
    const modeLabels: Record<string, string> = {
      linear: "Linear — Normal scrolling",
      focus: "Focus — Distraction-free",
      xref: "Cross-ref — Split view",
      audit: "Audit — ID checklist",
    };
    (["linear", "focus", "xref", "audit"] as const).forEach(mode => {
      actions.push({
        id: `mode-${mode}`,
        label: `Mode: ${modeLabels[mode]}`,
        description: mode === "linear" ? "Normal scrolling through document" :
                    mode === "focus" ? "Distraction-free deep reading" :
                    mode === "xref" ? "Split view on cross-reference clicks" :
                    "Highlight all IDs with audit checklist",
        icon: modeIcons[mode],
        category: "settings",
        keywords: ["reading", "view", mode],
        action: () => { saveRecent(`mode-${mode}`); setReadingMode(mode); onOpenChange(false); },
      });
    });

    // Documents
    files.forEach(f => {
      const typeIcon = f.type === "part" ? <BookOpen className="h-4 w-4" /> :
                       f.type === "map" ? <Network className="h-4 w-4" /> :
                       <FileText className="h-4 w-4" />;
      actions.push({
        id: `doc-${f.slug}`,
        label: f.title.length > 70 ? f.title.slice(0, 70) + "…" : f.title,
        description: `${f.totalLines} lines · ${f.sections.length} sections`,
        icon: typeIcon,
        category: "documents",
        keywords: [f.fileName, f.type],
        action: () => { saveRecent(`doc-${f.slug}`); setActiveSlug(f.slug); onOpenChange(false); },
      });
    });

    // Bugs / IDs (top 40 most-referenced)
    const sortedIds = Object.values(ids)
      .sort((a, b) => b.occurrences.length - a.occurrences.length)
      .slice(0, 40);
    sortedIds.forEach(entry => {
      // T8b §12.2: prefer the eager-fetched graph node (primary), fall back to
      // getBugFact for finding IDs (A1-A14, D1-D8, E1-E7) not in the graph.
      // Both sources are normalized into a single fact-like shape. When neither
      // is available and the graph payload isn't ready yet, show "loading…".
      const node = graphNodesByXref.get(entry.id);
      const bugFact = getBugFact(entry.id);
      const factOneLiner = node?.oneLiner ?? bugFact?.oneLiner ?? "";
      const factSeverity = node?.severity ?? bugFact?.severity ?? "";
      const factSubsystem = node?.subsystem ?? bugFact?.subsystem ?? "";
      const hasFact = Boolean(node) || Boolean(bugFact);
      const factLoading = !hasFact && graphNodesStatus !== "ready";
      const kindIcon = entry.kind === "finding" ? <Bug className="h-4 w-4" /> :
                       entry.kind === "task" ? <CheckSquare className="h-4 w-4" /> :
                       entry.kind === "gate" ? <Shield className="h-4 w-4" /> :
                       <Hash className="h-4 w-4" />;
      actions.push({
        id: `bug-${entry.id}`,
        label: `${entry.id} — ${factOneLiner.slice(0, 60) || entry.occurrences[0]?.sectionTitle?.slice(0, 60) || ""}`,
        description: `${entry.kind} · ${entry.occurrences.length} occurrences${hasFact ? ` · ${factSeverity} · ${factSubsystem}` : factLoading ? " · loading…" : ""}`,
        icon: kindIcon,
        category: "bugs",
        keywords: [entry.id, entry.kind, factSubsystem, factSeverity].filter(Boolean) as string[],
        action: () => {
          saveRecent(`bug-${entry.id}`);
          const first = entry.occurrences[0];
          if (first) {
            setActiveSlug(first.docSlug);
            setTimeout(() => {
              const el = document.getElementById(first.sectionId);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 300);
          }
          onOpenChange(false);
        },
      });
    });

    return actions;
  }, [files, ids, onOpenSearch, onOpenGraph, onOpenToc, onOpenProgress, onOpenComparison, onOpenShortcuts, onOpenChange, setActiveSlug, setReadingMode, graphNodesByXref, graphNodesStatus]);

  // Filter actions by query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return allActions;
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    return allActions.filter(a => {
      const haystack = [a.label, a.description, a.category, ...(a.keywords || [])].join(" ").toLowerCase();
      return tokens.every(t => haystack.includes(t));
    });
  }, [query, allActions]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setRecentIds(loadRecent());
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector(`[data-idx="${selectedIndex}"]`);
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Group actions by category, with "recent" first when no query
  const grouped = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    if (!query.trim() && recentIds.length > 0) {
      const recentActions = recentIds
        .map(rid => allActions.find(a => a.id === rid))
        .filter((a): a is CommandAction => !!a);
      if (recentActions.length > 0) {
        groups.recent = recentActions;
      }
    }
    filteredActions.forEach(a => {
      if (!groups[a.category]) groups[a.category] = [];
      groups[a.category].push(a);
    });
    return groups;
  }, [filteredActions, allActions, recentIds, query]);

  // Flatten for keyboard navigation
  const flatIndex = useMemo(() => {
    const idx: CommandAction[] = [];
    ["recent", "tools", "settings", "documents", "bugs"].forEach(cat => {
      if (grouped[cat]) idx.push(...grouped[cat]);
    });
    return idx;
  }, [grouped]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatIndex.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = flatIndex[selectedIndex];
      if (action) action.action();
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  }, [flatIndex, selectedIndex, onOpenChange]);

  const categoryLabels: Record<string, string> = {
    recent: "Recently used",
    tools: "Tools",
    settings: "Reading modes",
    documents: "Documents",
    bugs: "Bugs & IDs",
  };

  const categoryIcons: Record<string, React.ReactNode> = {
    recent: <Clock className="h-3 w-3" />,
    tools: <Zap className="h-3 w-3" />,
    settings: <Sparkles className="h-3 w-3" />,
    documents: <BookOpen className="h-3 w-3" />,
    bugs: <Bug className="h-3 w-3" />,
  };

  let runningIdx = -1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTitle className="sr-only">Command Palette</DialogTitle>
      <DialogDescription className="sr-only">
        Quick access to all tools, documents, and bug IDs. Type to filter, arrow keys to navigate, Enter to select.
      </DialogDescription>
      <DialogContent
        className="p-0 gap-0 overflow-hidden top-[15%] translate-y-0 max-w-2xl"
        style={{ animation: "cmd-palette-enter 150ms ease-out" }}
      >
        {/* Search input — clean, no Esc inside */}
        <div className="flex items-center gap-3 px-4 h-12 border-b bg-background/95 backdrop-blur">
          <Search className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, document name, or bug ID…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider hidden sm:inline">
            {flatIndex.length} {flatIndex.length === 1 ? "result" : "results"}
          </span>
        </div>

        {/* Results */}
        <ScrollArea className="h-[420px]">
          <div ref={listRef} className="py-1">
            {flatIndex.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Search className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No matches for <span className="font-medium text-foreground">"{query}"</span>
                </p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Try a different keyword or check spelling
                </p>
              </div>
            )}
            {["recent", "tools", "settings", "documents", "bugs"].map(cat => {
              if (!grouped[cat] || grouped[cat].length === 0) return null;
              return (
                <div key={cat} className="mb-1">
                  <div className="px-4 py-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 bg-muted/40 border-b border-border/50">
                    {categoryIcons[cat]}
                    <span>{categoryLabels[cat]}</span>
                    <span className="text-muted-foreground/50 font-normal">· {grouped[cat].length}</span>
                  </div>
                  {grouped[cat].map(action => {
                    runningIdx++;
                    const idx = runningIdx;
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={action.id}
                        data-idx={idx}
                        type="button"
                        onClick={() => action.action()}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-start gap-3 transition-all duration-100 relative",
                          isSelected
                            ? "bg-primary/10 dark:bg-primary/15"
                            : "hover:bg-muted/50"
                        )}
                      >
                        {/* Selected indicator bar */}
                        {isSelected && (
                          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary rounded-r-full" />
                        )}
                        <span className={cn(
                          "shrink-0 mt-0.5 transition-colors",
                          isSelected ? "text-primary" : "text-muted-foreground/80"
                        )}>
                          {action.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm line-clamp-1 transition-all",
                              isSelected ? "font-medium text-foreground" : "text-foreground/90"
                            )}>
                              {action.label}
                            </span>
                            {action.shortcut && (
                              <Kbd className="shrink-0 ml-auto">{action.shortcut}</Kbd>
                            )}
                          </div>
                          {action.description && (
                            <div className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">
                              {action.description}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <CornerDownRight className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer — keyboard hints with consistent Kbd styling */}
        <div className="border-t bg-muted/30 px-4 h-9 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span className="text-muted-foreground/80">navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              <span className="text-muted-foreground/80">select</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span className="text-muted-foreground/80">close</span>
            </span>
          </div>
          <span className="text-muted-foreground/60 hidden sm:inline">
            {recentIds.length > 0 && !query ? "Recent shortcuts saved" : "⌘P to reopen"}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
