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
import { useDocStore, signalDocJump, signalDocJumpTo } from "@/lib/doc-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bug, CheckSquare, Shield, FileText, BookOpen, Hash, ArrowRight, Clock } from "lucide-react";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

interface SearchResult {
  docSlug: string;
  docTitle: string;
  sectionId: string;
  sectionTitle: string;
  lineNumber: number;
  snippet: string;
  score: number;
}

function kindIcon(kind: string) {
  switch (kind) {
    case "finding": return <Bug className="h-3.5 w-3.5 text-rose-500" />;
    case "task": return <CheckSquare className="h-3.5 w-3.5 text-emerald-500" />;
    case "gate": return <Shield className="h-3.5 w-3.5 text-violet-500" />;
    case "section": return <BookOpen className="h-3.5 w-3.5 text-sky-500" />;
    case "priority": return <Hash className="h-3.5 w-3.5 text-slate-400" />;
    default: return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function kindBadgeStyle(kind: string): string {
  switch (kind) {
    case "finding": return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300";
    case "task": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300";
    case "gate": return "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border-violet-300";
    case "priority": return "bg-slate-100 text-slate-700 dark:bg-slate-950/50 dark:text-slate-300 border-slate-300";
    case "section": return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-300";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function severityBadge(id: string): string | null {
  if (id === "P0") return "bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200";
  if (id === "P1") return "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  if (id === "P2") return "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  if (id === "P3") return "bg-gray-200 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  return null;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const [query, setQuery] = useState("");
  const [allContent, setAllContent] = useState<
    { slug: string; title: string; lines: string[] }[]
  >([]);

  // F-12: recent searches persisted to localStorage, shown when query is empty.
  const RECENT_KEY = "gsd-doc-recent-searches";
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Defer setState to avoid the "set-state-in-effect" lint rule —
          // scheduling on the next tick is safe here because the dialog is
          // already open and we just want to hydrate the list before paint.
          const parsedStrings = parsed.filter((x): x is string => typeof x === "string");
          queueMicrotask(() => setRecentSearches(parsedStrings));
        }
      }
    } catch { /* noop */ }
  }, [open]);
  const recordRecentSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s !== trimmed)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  // lazily fetch all file content for searching
  useEffect(() => {
    if (!open || allContent.length > 0) return;
    (async () => {
      const results = await Promise.all(
        files.map(async (f) => {
          try {
            const res = await fetch(`/api/docs?slug=${encodeURIComponent(f.slug)}`);
            const data = await res.json();
            return {
              slug: f.slug,
              title: f.title,
              lines: (data.file?.rawMarkdown ?? "").split("\n"),
            };
          } catch {
            return { slug: f.slug, title: f.title, lines: [] as string[] };
          }
        })
      );
      setAllContent(results);
    })();
  }, [open, files, allContent.length]);

  const searchResults = useMemo<SearchResult[]>(() => {
    if (!query.trim() || allContent.length === 0) return [];
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const results: SearchResult[] = [];

    for (const doc of allContent) {
      const fileMeta = files.find((f) => f.slug === doc.slug);
      if (!fileMeta) continue;
      for (let i = 0; i < doc.lines.length; i++) {
        const line = doc.lines[i].toLowerCase();
        // every token must appear in the line (AND search)
        if (!tokens.every((t) => line.includes(t))) continue;
        // find section this line belongs to
        let section = fileMeta.sections[0];
        for (const s of fileMeta.sections) {
          if (s.lineNumber <= i + 1 && s.endLine >= i + 1) {
            if (!section || s.lineNumber >= section.lineNumber) section = s;
          }
        }
        results.push({
          docSlug: doc.slug,
          docTitle: doc.title,
          sectionId: section?.id ?? "",
          sectionTitle: section?.title ?? "",
          lineNumber: i + 1,
          snippet: doc.lines[i].slice(0, 120),
          score: tokens.length * 10 - i / 1000, // prefer matches with more tokens, earlier lines
        });
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 50);
  }, [query, allContent, files]);

  // also search the id index for exact id matches
  const idMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return Object.values(ids)
      .filter((e) => e.id.toUpperCase().includes(q))
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        count: e.occurrences.length,
        firstDoc: e.occurrences[0]?.docSlug ?? "",
        firstSection: e.occurrences[0]?.sectionId ?? "",
      }));
  }, [query, ids]);

  // section matches
  const sectionMatches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    const results: { docSlug: string; sectionId: string; sectionTitle: string; docTitle: string; docType: string }[] = [];
    for (const file of files) {
      for (const section of file.sections) {
        const title = section.title.replace(/^[#*\s]+/, "").toLowerCase();
        if (title.includes(q)) {
          results.push({
            docSlug: file.slug,
            sectionId: section.id,
            sectionTitle: section.title.replace(/^[#*\s]+/, ""),
            docTitle: file.title,
            docType: file.type,
          });
        }
      }
    }
    return results.slice(0, 10);
  }, [query, files]);

  const handleSelect = (docSlug: string, sectionId: string) => {
    recordRecentSearch(query);
    signalDocJump();
    setActiveSlug(docSlug);
    onOpenChange(false);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      signalDocJumpTo(sectionId);
    }, 250);
  };

  const handleJumpToId = (id: string, firstDoc: string, firstSection: string) => {
    recordRecentSearch(query);
    void id;
    signalDocJump();
    setActiveSlug(firstDoc);
    onOpenChange(false);
    setTimeout(() => {
      const el = document.getElementById(firstSection);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      signalDocJumpTo(firstSection);
    }, 250);
  };

  // F-12: Cmd+Enter opens the currently-active result in a new browser tab,
  // so users can compare two sections side-by-side without losing their place.
  const openActiveInNewTab = () => {
    // cmdk marks the active item with data-selected="true"
    const activeItem = document.querySelector('[cmdk-item][data-selected="true"], [cmdk-item][aria-selected="true"]');
    if (!activeItem) return;
    const value = activeItem.getAttribute("data-value") || "";
    // Map the data-value back to a result
    // Format: id-<ID> | section-<sectionId> | r-<i>-<snippet>
    if (value.startsWith("id-")) {
      const id = value.slice(3);
      const m = idMatches.find((x) => x.id === id);
      if (m) {
        window.open(`/?doc=${encodeURIComponent(m.firstDoc)}&section=${encodeURIComponent(m.firstSection)}`, "_blank");
        return;
      }
    }
    if (value.startsWith("section-")) {
      const sectionId = value.slice(8);
      const m = sectionMatches.find((x) => x.sectionId === sectionId);
      if (m) {
        window.open(`/?doc=${encodeURIComponent(m.docSlug)}&section=${encodeURIComponent(m.sectionId)}`, "_blank");
        return;
      }
    }
    if (value.startsWith("r-")) {
      // r-<i>-<snippet> — extract i
      const parts = value.split("-");
      const i = parseInt(parts[1]!, 10);
      const r = searchResults[i];
      if (r) {
        window.open(`/?doc=${encodeURIComponent(r.docSlug)}&section=${encodeURIComponent(r.sectionId)}`, "_blank");
        return;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      openActiveInNewTab();
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search documents, sections, or jump to an ID (A3, B2a, G1, P0)…  (⌘↵ opens in new tab)"
        value={query}
        onValueChange={setQuery}
        onKeyDown={handleKeyDown}
      />
      <CommandList>
        <CommandEmpty>
          {allContent.length === 0 ? "Loading documents…" : "No results."}
        </CommandEmpty>

        {/* F-12: recent searches shown when query is empty */}
        {!query.trim() && recentSearches.length > 0 && (
          <CommandGroup heading="Recent searches">
            {recentSearches.map((q) => (
              <CommandItem
                key={q}
                value={`recent-${q}`}
                onSelect={() => setQuery(q)}
                className="gap-2"
              >
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm">{q}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {idMatches.length > 0 && (
          <CommandGroup heading="Identifiers">
            {idMatches.map((m) => (
              <CommandItem
                key={m.id}
                value={`id-${m.id}`}
                onSelect={() => handleJumpToId(m.id, m.firstDoc, m.firstSection)}
                className="gap-2"
              >
                {kindIcon(m.kind)}
                <span className="font-mono text-sm font-semibold text-primary">
                  {m.id}
                </span>
                <Badge variant="outline" className={cn("text-[10px] uppercase h-5", kindBadgeStyle(m.kind))}>
                  {m.kind}
                </Badge>
                {severityBadge(m.id) && (
                  <Badge className={cn("text-[10px] h-5", severityBadge(m.id))}>
                    {m.id === "P0" ? "Critical" : m.id === "P1" ? "High" : m.id === "P2" ? "Medium" : "Low"}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {m.count}×
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {sectionMatches.length > 0 && (
          <CommandGroup heading="Sections">
            {sectionMatches.map((m) => (
              <CommandItem
                key={`${m.docSlug}-${m.sectionId}`}
                value={`section-${m.sectionId}`}
                onSelect={() => handleSelect(m.docSlug, m.sectionId)}
                className="flex-col items-start gap-1 py-2"
              >
                <div className="flex items-center gap-2 w-full">
                  <BookOpen className="h-3.5 w-3.5 text-sky-500" />
                  <span className="text-xs font-medium">{m.sectionTitle}</span>
                  <Badge variant="outline" className={cn("text-[10px] uppercase h-5 ml-auto", kindBadgeStyle("section"))}>
                    §
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {m.docTitle}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {searchResults.length > 0 && (
          <CommandGroup heading="Text matches">
            {searchResults.map((r, i) => (
              <CommandItem
                key={i}
                value={`r-${i}-${r.snippet}`}
                onSelect={() => handleSelect(r.docSlug, r.sectionId)}
                className="flex-col items-start gap-1 py-2"
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-xs font-medium">{r.docTitle}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    :{r.lineNumber}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-1 font-mono">
                  {r.snippet}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
