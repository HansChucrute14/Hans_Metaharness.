"use client";

import {
  useDocStore,
  type DocFileMeta,
  type BookmarkEntry,
  type RecentlyViewedEntry,
} from "@/lib/doc-store";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Star,
  Clock,
  Trash2,
  History,
  Library,
  AlertTriangle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

type GroupKey = "part" | "map" | "appendix";

const GROUP_LABELS: Record<GroupKey, string> = {
  part: "Parts",
  map: "Bug Map",
  appendix: "Appendices",
};

/** Left-border accent color applied only to the active item, by group. */
const GROUP_ACCENT: Record<GroupKey, string> = {
  part: "border-rose-500",
  map: "border-amber-500",
  appendix: "border-sky-500",
};

const GROUP_ORDER: GroupKey[] = ["part", "map", "appendix"];

const COLLAPSE_KEY = "doc-sidebar-collapsed-groups";

function typeOf(file: DocFileMeta): GroupKey {
  return file.type === "part" ? "part" : file.type === "map" ? "map" : "appendix";
}

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/** Rough word-count estimate (~8.5 words / line average for prose + code). */
function wordCount(totalLines: number): number {
  return Math.max(0, Math.round(totalLines * 8.5));
}

/** Persisted collapse state for the three document groups. */
function useCollapsedGroups(): [Set<GroupKey>, (k: GroupKey) => void] {
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as GroupKey[];
      return new Set(arr);
    } catch {
      return new Set();
    }
  });

  const toggle = useCallback((k: GroupKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore quota / privacy-mode errors */
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}

/** A single document row — title, one-line blurb, meta + progress, left accent on active. */
function DocRow({
  file,
  active,
  visited,
  onSelect,
}: {
  file: DocFileMeta;
  active: boolean;
  visited: boolean;
  onSelect: () => void;
}) {
  const accent = GROUP_ACCENT[typeOf(file)];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left py-2.5 px-3 border-l-2 transition-colors",
        active
          ? cn("bg-accent/60", accent)
          : "border-transparent hover:bg-accent/40"
      )}
    >
      <div
        className={cn(
          "text-sm leading-snug line-clamp-1",
          active ? "font-semibold text-foreground" : "font-medium text-foreground/90"
        )}
      >
        {file.title}
      </div>
      {file.blurb && (
        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
          {file.blurb}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        {/* Subtle 2px reading-progress track — filled when the doc has been visited. */}
        <div className="h-0.5 flex-1 rounded-full bg-border/50 overflow-hidden">
          {visited && (
            <div className="h-full w-full bg-primary/30" aria-hidden />
          )}
        </div>
        <span className="text-[10px] text-muted-foreground/70 font-mono shrink-0">
          {file.sections.length}§ · {wordCount(file.totalLines)}w
        </span>
      </div>
    </button>
  );
}

function BookmarkItem({
  entry,
  onJump,
  onRemove,
}: {
  entry: BookmarkEntry;
  onJump: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors">
      <Star className="h-3 w-3 text-amber-500 fill-current mt-0.5 shrink-0" />
      <button type="button" onClick={onJump} className="flex-1 min-w-0 text-left">
        <div className="text-xs line-clamp-2 leading-tight">
          {entry.sectionTitle}
        </div>
        <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
          {entry.docTitle}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
        title="Remove bookmark"
        aria-label="Remove bookmark"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function RecentItem({
  entry,
  onJump,
}: {
  entry: RecentlyViewedEntry;
  onJump: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onJump}
      className="w-full text-left flex items-start gap-1.5 px-2 py-1.5 rounded hover:bg-accent/50 transition-colors group"
    >
      <Clock className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs line-clamp-2 leading-tight group-hover:text-foreground transition-colors">
          {entry.sectionTitle}
        </div>
        <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
          <span className="truncate">{entry.docTitle}</span>
          <span>·</span>
          <span className="shrink-0">{timeAgo(entry.viewedAt)}</span>
        </div>
      </div>
    </button>
  );
}

/**
 * Left sidebar — a calm, scannable library of documents grouped by type.
 *
 * Design goals (per Task 7 rework):
 *   - Quiet in ALL reading modes — no decorative gradients/dots, no heavy
 *     type pills. Only the active item carries a colored left-border accent
 *     (rose / amber / sky by group).
 *   - Each row: title (primary) → one-line blurb (muted) → meta line
 *     (`sections · words`) with a subtle 2px reading-progress track.
 *   - Collapsible "Parts" / "Bug Map" / "Appendices" groups, with collapse
 *     state persisted to localStorage.
 *   - Compact title filter at the top.
 *   - Bookmarks + Recent as subordinate collapsible sections (subtle).
 *   - A single quiet footer line with global stats instead of a noisy card.
 */
export function DocSidebar({
  onSelectSection,
}: {
  onSelectSection?: (sectionId: string) => void;
}) {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const visitedDocs = useDocStore((s) => s.visitedDocs);
  const bookmarks = useDocStore((s) => s.bookmarks);
  const recentlyViewed = useDocStore((s) => s.recentlyViewed);
  const removeBookmark = useDocStore((s) => s.removeBookmark);
  const clearRecentViews = useDocStore((s) => s.clearRecentViews);
  const warnings = useDocStore((s) => s.warnings);

  const activeFile = files.find((f) => f.slug === activeSlug);
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsed, toggleGroup] = useCollapsedGroups();
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [showRecent, setShowRecent] = useState(true);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [warningsExpanded, setWarningsExpanded] = useState(false);

  // Filter + group files by type. Filtering is title-only (case-insensitive).
  const groupedFiles = useMemo(() => {
    const out: Record<GroupKey, DocFileMeta[]> = {
      part: [],
      map: [],
      appendix: [],
    };
    const term = searchTerm.trim().toLowerCase();
    for (const f of files) {
      if (term && !f.title.toLowerCase().includes(term)) continue;
      out[typeOf(f)].push(f);
    }
    for (const k of GROUP_ORDER) {
      out[k].sort((a, b) => a.order - b.order);
    }
    return out;
  }, [files, searchTerm]);

  const totalFiltered = groupedFiles.part.length + groupedFiles.map.length + groupedFiles.appendix.length;

  const handleSelectDoc = (slug: string) => {
    setActiveSlug(slug);
    // Close the mobile sheet (when used) — the callback ignores the arg.
    onSelectSection?.("");
  };

  const handleJumpToBookmark = (b: BookmarkEntry) => {
    setActiveSlug(b.docSlug);
    onSelectSection?.(b.sectionId);
    setTimeout(() => {
      const el = document.getElementById(b.sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  const handleJumpToRecent = (r: RecentlyViewedEntry) => {
    setActiveSlug(r.docSlug);
    onSelectSection?.(r.sectionId);
    setTimeout(() => {
      const el = document.getElementById(r.sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  };

  // Quiet footer stats — single line, no cards.
  const totalFindings = Object.values(ids).filter((e) => e.kind === "finding").length;
  const totalTasks = Object.values(ids).filter((e) => e.kind === "task").length;
  const visitedCount = visitedDocs.size;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ── Header: Library label + count + filter ─────────────────────── */}
      <div className="px-3 pt-3 pb-2 border-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Library className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
              Library
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground/70 font-mono">
            {files.length} docs
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Filter documents…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-8 text-xs pl-7 pr-7 bg-background"
            aria-label="Filter documents by title"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── §12.5/T3.4: Registry warnings banner (dismissible, session-only) ── */}
      {warnings.length > 0 && !warningsDismissed && (
        <div className="mx-3 mt-2 mb-1 rounded-md border border-amber-300/60 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2 text-xs shrink-0">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setWarningsExpanded((v) => !v)}
                className="text-left w-full"
              >
                <span className="font-semibold text-amber-800 dark:text-amber-300">
                  Doc registry warnings ({warnings.length})
                </span>
                <span className="block text-amber-700 dark:text-amber-400/80 mt-0.5 line-clamp-2">
                  {warnings[0]}
                </span>
              </button>
              {warningsExpanded && (
                <ul className="mt-1.5 space-y-1">
                  {warnings.map((w, i) => (
                    <li
                      key={i}
                      className="text-amber-700 dark:text-amber-400/80 leading-snug border-t border-amber-200/50 dark:border-amber-700/30 pt-1"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setWarningsDismissed(true)}
              className="shrink-0 text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
              aria-label="Dismiss warnings"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Scrollable list: doc groups + bookmarks + recent ───────────── */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {GROUP_ORDER.map((key) => {
            const items = groupedFiles[key];
            if (items.length === 0) return null;
            const isCollapsed = collapsed.has(key);
            return (
              <div key={key} className="px-2 pb-1">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleGroup(key)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded hover:bg-accent/40 transition-colors text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                      <span className="flex-1 text-left">{GROUP_LABELS[key]}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {items.length}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="flex flex-col gap-1 pb-2 pt-0.5">
                      {items.map((f) => (
                        <DocRow
                          key={f.slug}
                          file={f}
                          active={activeSlug === f.slug}
                          visited={visitedDocs.has(f.slug)}
                          onSelect={() => handleSelectDoc(f.slug)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}

          {totalFiltered === 0 && (
            <div className="px-4 py-6 text-xs text-muted-foreground text-center">
              No documents match &ldquo;{searchTerm}&rdquo;.
            </div>
          )}

          {/* ── Bookmarks (subordinate) ───────────────────────────────── */}
          {bookmarks.length > 0 && (
            <div className="px-2 pt-2 border-t mt-2">
              <Collapsible open={showBookmarks} onOpenChange={setShowBookmarks}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded hover:bg-accent/40 transition-colors text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {showBookmarks ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <Star className="h-3 w-3 text-amber-500 fill-current shrink-0" />
                    <span className="flex-1 text-left">Bookmarks</span>
                    <span className="text-[10px] font-mono text-muted-foreground/60">
                      {bookmarks.length}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pb-2 max-h-48 overflow-y-auto scrollbar-thin">
                    {bookmarks.map((b) => (
                      <BookmarkItem
                        key={`${b.docSlug}-${b.sectionId}`}
                        entry={b}
                        onJump={() => handleJumpToBookmark(b)}
                        onRemove={() => removeBookmark(b.docSlug, b.sectionId)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* ── Recently viewed (subordinate) ─────────────────────────── */}
          {recentlyViewed.length > 0 && (
            <div className="px-2 pt-1">
              <Collapsible open={showRecent} onOpenChange={setShowRecent}>
                {/* Trigger + clear button as SIBLINGS (not nested) to avoid
                    the invalid <button>-inside-<button> hydration error. */}
                <div className="flex items-stretch gap-1">
                  <CollapsibleTrigger asChild>
                    <button className="flex-1 flex items-center gap-1.5 px-1.5 py-1.5 rounded hover:bg-accent/40 transition-colors text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {showRecent ? (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      )}
                      <History className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-left">Recent</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">
                        {recentlyViewed.length}
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  <button
                    type="button"
                    onClick={() => clearRecentViews()}
                    className="h-auto w-6 my-auto flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                    title="Clear history"
                    aria-label="Clear history"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <CollapsibleContent>
                  <div className="pb-2 max-h-48 overflow-y-auto scrollbar-thin">
                    {recentlyViewed.map((r) => (
                      <RecentItem
                        key={`${r.docSlug}-${r.sectionId}-${r.viewedAt}`}
                        entry={r}
                        onJump={() => handleJumpToRecent(r)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* ── Footer: single quiet stats line ─────────────────────────────── */}
      <div className="border-t px-3 py-2 shrink-0">
        <div className="text-[10px] text-muted-foreground/70 font-mono flex items-center gap-1.5 flex-wrap">
          <span className="text-rose-500/90">{totalFindings} findings</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-emerald-500/90">{totalTasks} tasks</span>
          <span className="text-muted-foreground/40">·</span>
          <span>
            {visitedCount}/{files.length} read
          </span>
        </div>
      </div>

    </div>
  );
}
