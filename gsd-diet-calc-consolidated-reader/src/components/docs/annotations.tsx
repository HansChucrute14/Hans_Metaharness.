"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useDocStore, signalDocJump, signalDocJumpTo } from "@/lib/doc-store";
import { EVT, dispatchDocEvent } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "sonner";
import {
  Highlighter, MessageSquarePlus, Trash2, X, MessageSquare, Calendar,
  Pencil, Check, ArrowUpRight, FileJson, FileText, FileSpreadsheet, Search,
  Pin, PinOff, Copy, Tag, ChevronDown, ChevronRight,
  Filter, BarChart3, Inbox, ClipboardList, Sparkles, CircleCheck, Circle,
  Download, Upload, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Annotation,
  type AnnotationColor,
  type AnnotationStatus,
  type SearchFilters,
  type ExportFormat,
  type CreateAnnotationInput,
  type ImportResult,
  loadAnnotations,
  saveAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  restoreAnnotation,
  duplicateAnnotation,
  bulkDelete,
  bulkAddTag,
  bulkSetStatus,
  bulkSetPinned,
  searchAnnotations,
  getStats,
  getAllTags,
  getAnnotation,
  findDuplicate,
  serializeAnnotations,
  copyAnnotationAsMarkdown,
  importFromJSON,
  dispatchAnnotationsUpdated,
  normalizeTag,
  dedupeTags,
  getMarkElementForAnnotation,
  MAX_ANNOTATIONS,
  MAX_TAGS_PER_ANNOTATION,
  MAX_NOTE_LENGTH,
  UNDO_WINDOW_MS,
} from "@/lib/annotation-highlights";

// =============================================================================
// Constants + helpers
// =============================================================================

const COLORS: Record<
  AnnotationColor,
  { bg: string; border: string; dot: string; ring: string; label: string; meaning: string }
> = {
  yellow:  { bg: "bg-yellow-200/70 dark:bg-yellow-900/40",  border: "border-yellow-400 dark:border-yellow-700",  dot: "bg-yellow-500",  ring: "ring-yellow-500",  label: "Important", meaning: "Key point to remember" },
  rose:    { bg: "bg-rose-200/70 dark:bg-rose-900/40",      border: "border-rose-400 dark:border-rose-700",      dot: "bg-rose-500",    ring: "ring-rose-500",    label: "Critical",  meaning: "Critical / blocker / safety" },
  emerald: { bg: "bg-emerald-200/70 dark:bg-emerald-900/40", border: "border-emerald-400 dark:border-emerald-700", dot: "bg-emerald-500", ring: "ring-emerald-500", label: "Verified",  meaning: "Confirmed / verified fact" },
  sky:     { bg: "bg-sky-200/70 dark:bg-sky-900/40",        border: "border-sky-400 dark:border-sky-700",        dot: "bg-sky-500",     ring: "ring-sky-500",     label: "Question",  meaning: "Open question / follow-up" },
  violet:  { bg: "bg-violet-200/70 dark:bg-violet-900/40",  border: "border-violet-400 dark:border-violet-700",  dot: "bg-violet-500",  ring: "ring-violet-500",  label: "Idea",      meaning: "Hypothesis / proposal" },
};

const COLOR_KEYS: AnnotationColor[] = ["yellow", "rose", "emerald", "sky", "violet"];

type SortKey = "newest" | "oldest" | "document" | "pinned" | "updated" | "alpha";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "pinned", label: "Pinned first" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "document", label: "Document order" },
  { value: "alpha", label: "A → Z (section)" },
];

function timeAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// =============================================================================
// TagInput — inline editable tag list
// =============================================================================

function TagInput({
  tags,
  onChange,
  placeholder = "add tag…",
  size = "sm",
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  size?: "sm" | "xs";
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = normalizeTag(input);
    if (!t) return;
    if (tags.includes(t)) { setInput(""); return; }
    if (tags.length >= MAX_TAGS_PER_ANNOTATION) {
      toast.warning(`Max ${MAX_TAGS_PER_ANNOTATION} tags per annotation`);
      return;
    }
    onChange(dedupeTags([...tags, t]));
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full bg-muted text-muted-foreground font-mono",
            size === "xs" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]"
          )}
        >
          #{t}
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="hover:text-destructive"
            aria-label={`Remove tag ${t}`}
          >
            <X className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
          if (e.key === "Backspace" && !input && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={tags.length === 0 ? placeholder : ""}
        className={cn(
          "bg-transparent outline-none border-b border-transparent focus:border-primary placeholder:text-muted-foreground/60",
          size === "xs" ? "text-[10px] w-16" : "text-[11px] w-20"
        )}
      />
    </div>
  );
}

// =============================================================================
// StatsBar — collapsible statistics widget
// =============================================================================

function StatsBar() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(() => getStats());
  const allTags = useMemo(() => getAllTags(), [stats]);

  useEffect(() => {
    const update = () => setStats(getStats());
    update();
    window.addEventListener("annotations-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("annotations-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  if (stats.total === 0) return null;

  const maxColorCount = Math.max(1, ...Object.values(stats.byColor));
  const topTags = allTags.slice(0, 6);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between px-3 py-1.5 border-b bg-muted/20 hover:bg-muted/40 transition-colors text-[11px] text-muted-foreground"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <BarChart3 className="h-3 w-3" />
            Stats
            <span className="font-mono">{stats.total}</span>
            {stats.pinned > 0 && <span className="text-amber-500">· ★{stats.pinned}</span>}
            {stats.recent7d > 0 && <span className="text-emerald-500">· +{stats.recent7d}/7d</span>}
          </span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 py-2.5 border-b bg-muted/10 space-y-2.5 text-[10px]">
          {/* Color distribution */}
          <div>
            <div className="text-muted-foreground mb-1 font-medium">By color</div>
            <div className="space-y-1">
              {COLOR_KEYS.map((c) => {
                const n = stats.byColor[c];
                if (n === 0) return null;
                return (
                  <div key={c} className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", COLORS[c].dot)} />
                    <span className="w-16 text-muted-foreground">{COLORS[c].label}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", COLORS[c].dot)}
                        style={{ width: `${(n / maxColorCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right tabular-nums font-mono">{n}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Status + notes */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-card border p-1.5">
              <div className="text-muted-foreground">Open</div>
              <div className="text-sm font-semibold text-sky-600 dark:text-sky-400">{stats.byStatus.open}</div>
            </div>
            <div className="rounded bg-card border p-1.5">
              <div className="text-muted-foreground">Resolved</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{stats.byStatus.resolved}</div>
            </div>
            <div className="rounded bg-card border p-1.5">
              <div className="text-muted-foreground">With notes</div>
              <div className="text-sm font-semibold">{stats.withNotes}</div>
            </div>
          </div>
          {/* Top tags */}
          {topTags.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 font-medium">Top tags</div>
              <div className="flex flex-wrap gap-1">
                {topTags.map(({ tag, count }) => (
                  <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0 font-mono text-[9px]">
                    #{tag}<span className="text-muted-foreground ml-0.5">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Filter chips row
// =============================================================================

interface FilterState {
  query: string;
  colors: Set<AnnotationColor>;
  tags: Set<string>;
  status: AnnotationStatus | "all";
  pinnedOnly: boolean;
  hasNote: boolean | null;
}

function FilterRow({
  state,
  onChange,
  allTags,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  allTags: { tag: string; count: number }[];
}) {
  const toggleColor = (c: AnnotationColor) => {
    const next = new Set(state.colors);
    if (next.has(c)) next.delete(c); else next.add(c);
    onChange({ ...state, colors: next });
  };
  const toggleTag = (t: string) => {
    const next = new Set(state.tags);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange({ ...state, tags: next });
  };
  const activeCount =
    state.colors.size + state.tags.size +
    (state.status !== "all" ? 1 : 0) +
    (state.pinnedOnly ? 1 : 0) +
    (state.hasNote !== null ? 1 : 0);
  return (
    <div className="px-3 py-2 border-b bg-muted/10 space-y-1.5">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          placeholder="Search notes, highlighted text, tags…"
          className="h-7 text-[11px] pl-7 pr-7"
        />
        {state.query && (
          <button
            type="button"
            onClick={() => onChange({ ...state, query: "" })}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {/* Color chips */}
      <div className="flex items-center gap-1 flex-wrap">
        {COLOR_KEYS.map((c) => {
          const active = state.colors.has(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => toggleColor(c)}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-all hover:scale-110",
                COLORS[c].dot,
                active ? "border-foreground scale-110 ring-1 ring-offset-1 ring-foreground/30" : "border-transparent opacity-60"
              )}
              title={`${COLORS[c].label} — ${COLORS[c].meaning}`}
              aria-label={`Filter ${COLORS[c].label}`}
              aria-pressed={active}
            />
          );
        })}
        <div className="w-px h-4 bg-border mx-1" />
        {/* Status filter */}
        <div className="flex items-center gap-0.5 text-[10px]">
          {(["all", "open", "resolved"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ ...state, status: s })}
              className={cn(
                "px-1.5 py-0.5 rounded font-medium capitalize transition-colors",
                state.status === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border mx-1" />
        {/* Pinned + hasNote toggles */}
        <button
          type="button"
          onClick={() => onChange({ ...state, pinnedOnly: !state.pinnedOnly })}
          className={cn(
            "h-5 px-1.5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium transition-colors",
            state.pinnedOnly ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          title="Show only pinned"
        >
          <Pin className="h-2.5 w-2.5" /> Pinned
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...state, hasNote: state.hasNote === null ? true : state.hasNote ? false : null })}
          className={cn(
            "h-5 px-1.5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium transition-colors",
            state.hasNote === true && "bg-primary/15 text-primary",
            state.hasNote === false && "bg-muted text-muted-foreground",
            state.hasNote === null && "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
          title={state.hasNote === null ? "All" : state.hasNote ? "Only with notes" : "Only without notes"}
        >
          <MessageSquare className="h-2.5 w-2.5" />
          {state.hasNote === null ? "All" : state.hasNote ? "With note" : "No note"}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...state, colors: new Set(), tags: new Set(), status: "all", pinnedOnly: false, hasNote: null })}
            className="h-5 px-1.5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20"
          >
            <X className="h-2.5 w-2.5" /> Clear ({activeCount})
          </button>
        )}
      </div>
      {/* Tag chips */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
          {allTags.slice(0, 10).map(({ tag, count }) => {
            const active = state.tags.has(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 font-mono text-[9px] transition-colors",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                #{tag}<span className="opacity-60 ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AnnotationCard — single annotation row
// =============================================================================

interface CardProps {
  ann: Annotation;
  docTitle: string;
  isEditing: boolean;
  isConfirming: boolean;
  isSelected: boolean;
  selectMode: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditSave: (next: { note: string; color: AnnotationColor; tags: string[]; status: AnnotationStatus; pinned: boolean }) => void;
  onConfirmDelete: () => void;
  onConfirmDeleteCancel: () => void;
  onDelete: () => void;
  onJump: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleStatus: () => void;
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  onSelectToggle: () => void;
}

function AnnotationCard({
  ann, docTitle, isEditing, isConfirming, isSelected, selectMode,
  onEditStart, onEditCancel, onEditSave, onConfirmDelete, onConfirmDeleteCancel,
  onDelete, onJump, onDuplicate, onCopy, onTogglePin, onToggleStatus,
  onTagAdd, onTagRemove, onSelectToggle,
}: CardProps) {
  const c = COLORS[ann.color];
  const [expanded, setExpanded] = useState(false);

  const edited = ann.updatedAt !== ann.createdAt;

  return (
    <div
      className={cn(
        "border-l-[3px] rounded-r-md bg-card transition-all group relative",
        c.border,
        ann.pinned && "ring-1 ring-amber-400/40",
        isSelected && "ring-2 ring-primary",
        "hover:shadow-md hover:-translate-y-0.5"
      )}
    >
      {ann.pinned && (
        <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm">
          <Pin className="h-2 w-2" />
        </span>
      )}
      <div className="pl-3 pr-2 py-2.5">
        {/* Meta row */}
        <div className="flex items-center gap-1.5 mb-1.5">
          {selectMode && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelectToggle}
              className="h-3.5 w-3.5 shrink-0"
              aria-label="Select annotation"
            />
          )}
          <button
            type="button"
            onClick={onTogglePin}
            className={cn(
              "h-5 w-5 flex items-center justify-center rounded shrink-0 transition-colors",
              ann.pinned ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500 opacity-0 group-hover:opacity-100"
            )}
            title={ann.pinned ? "Unpin" : "Pin to top"}
            aria-label={ann.pinned ? "Unpin annotation" : "Pin annotation"}
          >
            <Pin className="h-3 w-3" fill={ann.pinned ? "currentColor" : "none"} />
          </button>
          <span className={cn("h-2 w-2 rounded-full shrink-0", c.dot)} title={`${c.label} — ${c.meaning}`} />
          <span
            className="text-[10px] text-muted-foreground truncate flex-1 cursor-pointer hover:text-foreground"
            title={`${docTitle} · ${ann.sectionTitle}`}
            onClick={onJump}
          >
            {docTitle} · {ann.sectionTitle}
          </span>
          {!isEditing && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={onJump}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label="Jump to annotation location"
                title="Jump to location (↵)"
              >
                <ArrowUpRight className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onCopy}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label="Copy as markdown"
                title="Copy as markdown"
              >
                <Copy className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onDuplicate}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label="Duplicate annotation"
                title="Duplicate"
              >
                <Plus className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onEditStart}
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label="Edit annotation"
                title="Edit (E)"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {!isConfirming ? (
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  aria-label="Delete annotation"
                  title="Delete (X)"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              ) : (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={onDelete}
                    className="h-6 px-1.5 flex items-center gap-0.5 rounded bg-destructive text-destructive-foreground text-[10px] font-medium animate-in fade-in zoom-in"
                    title="Confirm delete"
                  >
                    <Trash2 className="h-3 w-3" />
                    Sure?
                  </button>
                  <button
                    type="button"
                    onClick={onConfirmDeleteCancel}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
                    title="Cancel delete"
                    aria-label="Cancel delete"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Highlighted text */}
        <blockquote
          className={cn(
            "text-xs italic px-2 py-1.5 rounded border-l-2 not-italic cursor-pointer",
            c.bg, c.border,
            expanded ? "whitespace-pre-wrap break-words" : "line-clamp-2"
          )}
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "Click to collapse" : "Click to expand full text"}
        >
          {ann.text}
        </blockquote>

        {/* Status toggle (visible always — quick toggle) */}
        {!isEditing && (
          <div className="flex items-center gap-1 mt-1.5">
            <button
              type="button"
              onClick={onToggleStatus}
              className={cn(
                "inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-medium transition-colors",
                ann.status === "resolved"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
              )}
              title={ann.status === "open" ? "Mark as resolved" : "Reopen"}
            >
              {ann.status === "resolved" ? <CircleCheck className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
              {ann.status === "resolved" ? "Resolved" : "Open"}
            </button>
            {ann.tags.map((t) => (
              <span
                key={t}
                className="group/tag inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0 font-mono text-[9px] text-muted-foreground"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => onTagRemove(t)}
                  className="opacity-0 group-hover/tag:opacity-100 hover:text-destructive"
                  aria-label={`Remove tag ${t}`}
                >
                  <X className="h-2 w-2" />
                </button>
              </span>
            ))}
            <QuickAddTag onAdd={onTagAdd} />
          </div>
        )}

        {/* Note or inline edit form */}
        {isEditing ? (
          <AnnotationEditForm
            key={ann.id}
            ann={ann}
            onCancel={onEditCancel}
            onSave={onEditSave}
          />
        ) : (
          ann.note && (
            <div className="flex items-start gap-1.5 mt-1.5 text-xs">
              <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-foreground/90 whitespace-pre-wrap break-words">{ann.note}</span>
            </div>
          )
        )}

        {/* Timestamp */}
        {!isEditing && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            <span>{timeAgo(ann.createdAt)}</span>
            {edited && (
              <>
                <span>·</span>
                <span title={`Updated ${formatDate(ann.updatedAt)}`} className="italic">edited {timeAgo(ann.updatedAt)}</span>
              </>
            )}
            <span>·</span>
            <span className="truncate">{c.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Edit form extracted as a child component — mounts fresh with initial values
// via `key={ann.id}`, avoiding setState-in-effect anti-pattern.
function AnnotationEditForm({
  ann,
  onCancel,
  onSave,
}: {
  ann: Annotation;
  onCancel: () => void;
  onSave: (next: { note: string; color: AnnotationColor; tags: string[]; status: AnnotationStatus; pinned: boolean }) => void;
}) {
  const [editNote, setEditNote] = useState(ann.note);
  const [editColor, setEditColor] = useState<AnnotationColor>(ann.color);
  const [editTags, setEditTags] = useState<string[]>(ann.tags);
  const [editStatus, setEditStatus] = useState<AnnotationStatus>(ann.status);
  const [editPinned, setEditPinned] = useState<boolean>(ann.pinned);

  const saveEdit = () => {
    onSave({
      note: editNote.trim(),
      color: editColor,
      tags: editTags,
      status: editStatus,
      pinned: editPinned,
    });
  };

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={editNote}
        onChange={(e) => setEditNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
        placeholder="Add a note (markdown supported)…"
        className="text-xs min-h-[60px] resize-y"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            saveEdit();
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{editNote.length}/{MAX_NOTE_LENGTH}</span>
        <span className="hidden sm:inline">⌘↵ save · Esc cancel</span>
      </div>
      {/* Color + status + pinned row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {COLOR_KEYS.map((c2) => (
            <button
              key={c2}
              type="button"
              onClick={() => setEditColor(c2)}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-all hover:scale-110",
                COLORS[c2].dot,
                editColor === c2 ? "border-foreground scale-110" : "border-transparent"
              )}
              title={`${COLORS[c2].label} — ${COLORS[c2].meaning}`}
              aria-label={`Set color ${COLORS[c2].label}`}
            />
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <Select value={editStatus} onValueChange={(v) => setEditStatus(v as AnnotationStatus)}>
          <SelectTrigger className="h-6 w-[90px] text-[10px] px-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <Switch checked={editPinned} onCheckedChange={setEditPinned} className="h-3.5 w-7" />
          <Pin className={cn("h-2.5 w-2.5", editPinned && "text-amber-500")} />
        </label>
      </div>
      {/* Tags */}
      <div>
        <div className="text-[10px] text-muted-foreground mb-1">Tags</div>
        <TagInput tags={editTags} onChange={setEditTags} placeholder="add tag, Enter…" />
      </div>
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-[11px] px-2 gap-1" onClick={saveEdit}>
          <Check className="h-3 w-3" /> Save
        </Button>
      </div>
    </div>
  );
}

function QuickAddTag({ onAdd }: { onAdd: (tag: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-muted/50 hover:bg-muted text-[9px] text-muted-foreground"
        aria-label="Add tag"
      >
        <Plus className="h-2 w-2" /> tag
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAdd(value);
          setValue("");
          setEditing(false);
        }
        if (e.key === "Escape") {
          setValue("");
          setEditing(false);
        }
      }}
      onBlur={() => { if (value.trim()) onAdd(value); setValue(""); setEditing(false); }}
      placeholder="tag…"
      className="h-5 w-16 px-1.5 rounded-full bg-background border text-[9px] font-mono outline-none focus:border-primary"
    />
  );
}

// =============================================================================
// BulkActionBar — appears when in select mode
// =============================================================================

function BulkActionBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClear,
  onBulkDelete,
  onBulkResolve,
  onBulkPin,
  onBulkAddTag,
  onBulkExport,
  onExit,
}: {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onBulkDelete: () => void;
  onBulkResolve: (status: AnnotationStatus) => void;
  onBulkPin: (pinned: boolean) => void;
  onBulkAddTag: () => void;
  onBulkExport: (format: ExportFormat) => void;
  onExit: () => void;
}) {
  const [tagInput, setTagInput] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const disabled = selectedCount === 0;

  return (
    <div className="px-3 py-2 border-b bg-primary/5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-medium">
        {selectedCount > 0 ? `${selectedCount} selected` : `${totalCount} items`}
      </span>
      <button
        type="button"
        onClick={onSelectAll}
        className="text-[10px] text-muted-foreground hover:text-foreground underline"
      >
        {selectedCount === totalCount ? "Deselect all" : "Select all"}
      </button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <Button
        variant="ghost" size="sm" disabled={disabled}
        className="h-6 text-[10px] gap-1 px-1.5"
        onClick={() => onBulkResolve("resolved")}
        title="Mark selected as resolved"
      >
        <CircleCheck className="h-3 w-3" /> Resolve
      </Button>
      <Button
        variant="ghost" size="sm" disabled={disabled}
        className="h-6 text-[10px] gap-1 px-1.5"
        onClick={() => onBulkResolve("open")}
        title="Reopen selected"
      >
        <Circle className="h-3 w-3" /> Reopen
      </Button>
      <Button
        variant="ghost" size="sm" disabled={disabled}
        className="h-6 text-[10px] gap-1 px-1.5"
        onClick={() => onBulkPin(true)}
        title="Pin selected"
      >
        <Pin className="h-3 w-3" /> Pin
      </Button>
      <Button
        variant="ghost" size="sm" disabled={disabled}
        className="h-6 text-[10px] gap-1 px-1.5"
        onClick={() => onBulkPin(false)}
        title="Unpin selected"
      >
        <PinOff className="h-3 w-3" /> Unpin
      </Button>
      {tagInput ? (
        <input
          autoFocus
          value={tagValue}
          onChange={(e) => setTagValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onBulkAddTag();
              setTagValue("");
              setTagInput(false);
            }
            if (e.key === "Escape") { setTagValue(""); setTagInput(false); }
          }}
          onBlur={() => { setTagValue(""); setTagInput(false); }}
          placeholder="tag…"
          className="h-6 w-16 px-1.5 rounded border bg-background text-[10px] font-mono outline-none focus:border-primary"
        />
      ) : (
        <Button
          variant="ghost" size="sm" disabled={disabled}
          className="h-6 text-[10px] gap-1 px-1.5"
          onClick={() => setTagInput(true)}
          title="Add tag to selected"
        >
          <Tag className="h-3 w-3" /> Tag
        </Button>
      )}
      <Popover open={exportOpen} onOpenChange={setExportOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost" size="sm" disabled={disabled}
            className="h-6 text-[10px] gap-1 px-1.5"
            title="Export selected"
          >
            <Download className="h-3 w-3" /> Export
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          <button
            type="button"
            onClick={() => { onBulkExport("json"); setExportOpen(false); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left"
          >
            <FileJson className="h-3.5 w-3.5" /> JSON
          </button>
          <button
            type="button"
            onClick={() => { onBulkExport("markdown"); setExportOpen(false); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left"
          >
            <FileText className="h-3.5 w-3.5" /> Markdown
          </button>
          <button
            type="button"
            onClick={() => { onBulkExport("csv"); setExportOpen(false); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> CSV
          </button>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost" size="sm" disabled={disabled}
        className="h-6 text-[10px] gap-1 px-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onBulkDelete}
        title="Delete selected (soft-delete with undo)"
      >
        <Trash2 className="h-3 w-3" /> Delete
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost" size="sm"
          className="h-6 text-[10px] gap-1 px-1.5"
          onClick={onExit}
        >
          <X className="h-3 w-3" /> Exit select
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// AnnotationsPanel — the main Sheet
// =============================================================================

export function AnnotationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("pinned");
  const [filterState, setFilterState] = useState<FilterState>({
    query: "",
    colors: new Set(),
    tags: new Set(),
    status: "all",
    pinnedOnly: false,
    hasNote: null,
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allTags, setAllTags] = useState<{ tag: string; count: number }[]>([]);

  const files = useDocStore((s) => s.files);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Load annotations + tags on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        setAnnotations(loadAnnotations());
        setAllTags(getAllTags());
      }, 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Listen for changes from elsewhere
  useEffect(() => {
    const handler = () => {
      setAnnotations(loadAnnotations());
      setAllTags(getAllTags());
    };
    window.addEventListener("storage", handler);
    window.addEventListener("annotations-updated", handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("annotations-updated", handler);
    };
  }, []);

  // Apply filter + sort
  const filtered = useMemo(() => {
    const filters: SearchFilters = {
      query: filterState.query,
      colors: Array.from(filterState.colors),
      tags: Array.from(filterState.tags),
      status: filterState.status,
      pinnedOnly: filterState.pinnedOnly,
      hasNote: filterState.hasNote ?? undefined,
    };
    let result = searchAnnotations(filters);
    // Sort
    const slugOrder = new Map(files.map((f, i) => [f.slug, i]));
    const sectionOrder = new Map<string, number>();
    for (const f of files) f.sections.forEach((s, i) => sectionOrder.set(`${f.slug}:${s.id}`, i));
    result = [...result];
    if (sort === "pinned") {
      result.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt);
    } else if (sort === "newest") {
      result.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sort === "oldest") {
      result.sort((a, b) => a.createdAt - b.createdAt);
    } else if (sort === "updated") {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sort === "document") {
      result.sort((a, b) => {
        const sa = slugOrder.get(a.docSlug) ?? 9999;
        const sb = slugOrder.get(b.docSlug) ?? 9999;
        if (sa !== sb) return sa - sb;
        const ssa = sectionOrder.get(`${a.docSlug}:${a.sectionId}`) ?? 9999;
        const ssb = sectionOrder.get(`${b.docSlug}:${b.sectionId}`) ?? 9999;
        if (ssa !== ssb) return ssa - ssb;
        return b.createdAt - a.createdAt;
      });
    } else if (sort === "alpha") {
      result.sort((a, b) => (a.sectionTitle || "").localeCompare(b.sectionTitle || "") || b.createdAt - a.createdAt);
    }
    return result;
  }, [annotations, filterState, sort, files]);

  // ---- Handlers ----
  const refresh = useCallback(() => {
    setAnnotations(loadAnnotations());
    setAllTags(getAllTags());
  }, []);

  const startEdit = useCallback((id: string) => {
    setEditingId(id);
    setConfirmDeleteId(null);
  }, []);
  const cancelEdit = useCallback(() => setEditingId(null), []);

  const saveEdit = useCallback((id: string, next: { note: string; color: AnnotationColor; tags: string[]; status: AnnotationStatus; pinned: boolean }) => {
    updateAnnotation(id, next);
    refresh();
    setEditingId(null);
    toast.success("Annotation updated");
  }, [refresh]);

  const confirmDelete = useCallback((id: string) => {
    deleteAnnotation(id);
    refresh();
    setConfirmDeleteId(null);
    toast("Annotation deleted", {
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const restored = restoreAnnotation(id);
          if (restored) {
            refresh();
            toast.success("Annotation restored");
          } else {
            toast.error("Undo window expired");
          }
        },
      },
    });
  }, [refresh]);

  const togglePin = useCallback((id: string) => {
    const ann = getAnnotation(id);
    if (!ann) return;
    updateAnnotation(id, { pinned: !ann.pinned });
    refresh();
  }, [refresh]);

  const toggleStatus = useCallback((id: string) => {
    const ann = getAnnotation(id);
    if (!ann) return;
    updateAnnotation(id, { status: ann.status === "open" ? "resolved" : "open" });
    refresh();
  }, [refresh]);

  const addTag = useCallback((id: string, tag: string) => {
    const t = normalizeTag(tag);
    if (!t) return;
    const ann = getAnnotation(id);
    if (!ann) return;
    if (ann.tags.includes(t)) return;
    if (ann.tags.length >= MAX_TAGS_PER_ANNOTATION) {
      toast.warning(`Max ${MAX_TAGS_PER_ANNOTATION} tags per annotation`);
      return;
    }
    updateAnnotation(id, { tags: dedupeTags([...ann.tags, t]) });
    refresh();
  }, [refresh]);

  const removeTag = useCallback((id: string, tag: string) => {
    const ann = getAnnotation(id);
    if (!ann) return;
    updateAnnotation(id, { tags: ann.tags.filter((t) => t !== tag) });
    refresh();
  }, [refresh]);

  const duplicate = useCallback((id: string) => {
    const clone = duplicateAnnotation(id);
    refresh();
    if (clone) toast.success("Annotation duplicated");
  }, [refresh]);

  const copy = useCallback((id: string) => {
    const md = copyAnnotationAsMarkdown(id);
    if (md) {
      toast.success("Copied to clipboard", {
        description: "Markdown annotation copied",
      });
    }
  }, []);

  const jumpTo = useCallback((ann: Annotation) => {
    signalDocJump();
    setActiveSlug(ann.docSlug);
    onClose();
    setTimeout(() => {
      let tries = 0;
      const tryScroll = () => {
        const el = document.getElementById(ann.sectionId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          signalDocJumpTo(ann.sectionId);
          // After scroll, briefly pulse the corresponding mark
          setTimeout(() => {
            const mark = getMarkElementForAnnotation(ann.id);
            if (mark) {
              mark.classList.add("ring-2", "ring-foreground", "ring-offset-1");
              setTimeout(() => mark.classList.remove("ring-2", "ring-foreground", "ring-offset-1"), 2000);
            }
          }, 400);
        } else if (tries++ < 8) {
          setTimeout(tryScroll, 150);
        }
      };
      tryScroll();
    }, 250);
  }, [setActiveSlug, onClose]);

  // ---- Bulk handlers ----
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((a) => a.id)));
    }
  }, [filtered, selectedIds]);

  const onBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkDelete(ids);
    setSelectedIds(new Set());
    setSelectMode(false);
    refresh();
    toast(`${ids.length} annotation${ids.length === 1 ? "" : "s"} deleted`, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo all",
        onClick: () => {
          for (const id of ids) restoreAnnotation(id);
          refresh();
          toast.success("All restored");
        },
      },
    });
  }, [selectedIds, refresh]);

  const onBulkResolve = useCallback((status: AnnotationStatus) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkSetStatus(ids, status);
    refresh();
    toast.success(`${ids.length} marked as ${status}`);
  }, [selectedIds, refresh]);

  const onBulkPin = useCallback((pinned: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkSetPinned(ids, pinned);
    refresh();
  }, [selectedIds, refresh]);

  const onBulkAddTag = useCallback((tag: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !tag.trim()) return;
    bulkAddTag(ids, tag);
    refresh();
  }, [selectedIds, refresh]);

  const exportFiltered = useCallback((format: ExportFormat, ids?: string[]) => {
    const target = ids
      ? annotations.filter((a) => ids.includes(a.id))
      : filtered;
    if (target.length === 0) return;
    const content = serializeAnnotations(target, format);
    const ext = format === "json" ? "json" : format === "csv" ? "csv" : "md";
    const mime = format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/markdown";
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annotations-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${target.length} as ${format.toUpperCase()}`);
  }, [filtered, annotations]);

  // ---- Import ----
  const onImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result: ImportResult = importFromJSON(text);
    refresh();
    if (result.errors.length > 0) {
      toast.error(`Import failed: ${result.errors[0]}`);
    } else {
      toast.success(`Imported ${result.imported} annotation${result.imported === 1 ? "" : "s"}`, {
        description: result.skipped > 0 ? `${result.skipped} skipped` : undefined,
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [refresh]);

  // ---- Keyboard shortcuts within panel ----
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Only fire when not typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const search = document.querySelector<HTMLInputElement>("[data-ann-search]");
        search?.focus();
      } else if (e.key === "Escape" && selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, selectMode]);

  // ---- Render ----
  const docTitle = useCallback((slug: string) => files.find((f) => f.slug === slug)?.title ?? slug, [files]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col gap-0"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b space-y-0">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Highlighter className="h-4 w-4 text-primary" />
              <SheetTitle className="text-sm font-semibold">Annotations</SheetTitle>
              <Badge variant="secondary" className="text-[10px] h-5">{annotations.length}</Badge>
            </div>
            <div className="flex items-center gap-0.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost" size="icon"
                      className={cn("h-7 w-7", selectMode && "bg-primary/10 text-primary")}
                      onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}
                      aria-label="Toggle select mode"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Select mode (bulk actions)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Import annotations"
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Import JSON</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" disabled={annotations.length === 0} aria-label="Export all">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="end">
                  <button type="button" onClick={() => exportFiltered("json")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left">
                    <FileJson className="h-3.5 w-3.5" /> JSON (all)
                  </button>
                  <button type="button" onClick={() => exportFiltered("markdown")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left">
                    <FileText className="h-3.5 w-3.5" /> Markdown (all)
                  </button>
                  <button type="button" onClick={() => exportFiltered("csv")} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left">
                    <FileSpreadsheet className="h-3.5 w-3.5" /> CSV (all)
                  </button>
                  {filterState.query || filterState.colors.size > 0 || filterState.tags.size > 0 ? (
                    <>
                      <div className="border-t my-1" />
                      <button type="button" onClick={() => exportFiltered("json", filtered.map((a) => a.id))} className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left">
                        <Filter className="h-3.5 w-3.5" /> Export filtered
                      </button>
                    </>
                  ) : null}
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-2" onClick={onClose} aria-label="Close annotations panel">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.md,.txt,application/json,text/markdown,text/plain"
          onChange={onImportFile}
          className="hidden"
        />

        {/* Stats bar (collapsible) */}
        <StatsBar />

        {/* Filters */}
        <FilterRow state={filterState} onChange={setFilterState} allTags={allTags} />

        {/* Sort + select-mode toggle */}
        <div className="px-3 py-1.5 border-b bg-muted/20 flex items-center gap-1.5">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-7 w-[140px] text-[11px] px-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{filtered.length} shown</span>
            <span>·</span>
            <span>{annotations.length} total</span>
          </div>
        </div>

        {/* Bulk action bar */}
        {selectMode && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            totalCount={filtered.length}
            onSelectAll={selectAll}
            onClear={() => setSelectedIds(new Set())}
            onBulkDelete={onBulkDelete}
            onBulkResolve={onBulkResolve}
            onBulkPin={onBulkPin}
            onBulkAddTag={() => {
              const tag = window.prompt("Tag to add to selected:");
              if (tag) onBulkAddTag(tag);
            }}
            onBulkExport={(fmt) => exportFiltered(fmt, Array.from(selectedIds))}
            onExit={() => { setSelectMode(false); setSelectedIds(new Set()); }}
          />
        )}

        {/* List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {filtered.length === 0 && (
              <div className="text-center py-12 px-4 text-sm text-muted-foreground">
                {annotations.length === 0 ? (
                  <>
                    <Highlighter className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium text-foreground/80 text-base">No annotations yet</p>
                    <p className="text-xs mt-1.5 max-w-[260px] mx-auto">
                      Select text in any document to highlight it. Add notes, tags, and resolve annotations as you review.
                    </p>
                    <div className="mt-4 inline-flex items-center gap-1.5 text-[10px] bg-muted/50 rounded-full px-2.5 py-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      Tip: press <kbd className="font-mono font-semibold">/</kbd> to search, <kbd className="font-mono font-semibold">n</kbd> to open this panel
                    </div>
                  </>
                ) : (
                  <>
                    <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium text-foreground/80">No matches</p>
                    <p className="text-xs mt-1">Try a different search or clear filters.</p>
                    <button
                      type="button"
                      onClick={() => setFilterState({ query: "", colors: new Set(), tags: new Set(), status: "all", pinnedOnly: false, hasNote: null })}
                      className="mt-3 text-[11px] text-primary underline"
                    >
                      Clear all filters
                    </button>
                  </>
                )}
              </div>
            )}
            {filtered.map((ann) => (
              <AnnotationCard
                key={ann.id}
                ann={ann}
                docTitle={docTitle(ann.docSlug)}
                isEditing={editingId === ann.id}
                isConfirming={confirmDeleteId === ann.id}
                isSelected={selectedIds.has(ann.id)}
                selectMode={selectMode}
                onEditStart={() => startEdit(ann.id)}
                onEditCancel={cancelEdit}
                onEditSave={(next) => saveEdit(ann.id, next)}
                onConfirmDelete={() => setConfirmDeleteId(ann.id)}
                onConfirmDeleteCancel={() => setConfirmDeleteId(null)}
                onDelete={() => confirmDelete(ann.id)}
                onJump={() => jumpTo(ann)}
                onDuplicate={() => duplicate(ann.id)}
                onCopy={() => copy(ann.id)}
                onTogglePin={() => togglePin(ann.id)}
                onToggleStatus={() => toggleStatus(ann.id)}
                onTagAdd={(t) => addTag(ann.id, t)}
                onTagRemove={(t) => removeTag(ann.id, t)}
                onSelectToggle={() => toggleSelect(ann.id)}
              />
            ))}
            <div ref={listEndRef} />
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-3 py-2 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
          <span>
            {filtered.length} of {annotations.length} shown
            {annotations.length >= MAX_ANNOTATIONS * 0.8 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                · near limit ({MAX_ANNOTATIONS})
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <span className="hidden sm:inline">Local · </span>
            <kbd className="font-mono">/</kbd> search · <kbd className="font-mono">Esc</kbd> clear
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// =============================================================================
// SelectionToolbar — floating toolbar on text selection
// =============================================================================

interface SelectionState {
  text: string;
  rect: DOMRect;
  sectionId: string;
  sectionTitle: string;
}

export function SelectionToolbar() {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState("");
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [tags, setTags] = useState<string[]>([]);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const activeSectionId = useDocStore((s) => s.activeSectionId);
  const files = useDocStore((s) => s.files);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    setSelection(null);
    setShowNoteInput(false);
    setNote("");
    setColor("yellow");
    setTags([]);
  }, []);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      const active = document.activeElement;
      if (active && toolbarRef.current?.contains(active)) return;
      setSelection(null);
      setShowNoteInput(false);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 3) {
      setSelection(null);
      setShowNoteInput(false);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
    const mainContent = el?.closest("[data-doc-content]") || el?.closest(".prose");
    if (toolbarRef.current && el && toolbarRef.current.contains(el)) return;
    if (!mainContent) {
      setSelection(null);
      setShowNoteInput(false);
      return;
    }
    const rect = range.getBoundingClientRect();
    let sectionEl: HTMLElement | null = el as HTMLElement;
    while (
      sectionEl &&
      !sectionEl.id?.match(/^(h\d|sec|s\d|§|section)/i) &&
      sectionEl.tagName !== "H1" &&
      sectionEl.tagName !== "H2" &&
      sectionEl.tagName !== "H3" &&
      sectionEl.tagName !== "H4"
    ) {
      sectionEl = sectionEl.parentElement;
      if (!sectionEl || sectionEl === document.body) break;
    }
    const sectionId = activeSectionId || sectionEl?.id || "unknown";
    const file = files.find((f) => f.slug === activeSlug);
    const section = file?.sections.find((s) => s.id === sectionId);
    const sectionTitle = section?.title?.replace(/^[#*\s]+/, "") || "Current section";
    setSelection({ text, rect, sectionId, sectionTitle });
  }, [activeSlug, activeSectionId, files]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  useEffect(() => {
    if (!selection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        window.getSelection()?.removeAllRanges();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        dismiss();
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [selection, dismiss]);

  const saveAnnotation = useCallback(() => {
    if (!selection || !activeSlug) return;
    // Duplicate check
    const dup = findDuplicate({
      docSlug: activeSlug,
      sectionId: selection.sectionId,
      sectionTitle: selection.sectionTitle,
      text: selection.text,
    });
    if (dup) {
      toast.warning("Already annotated", {
        description: "This text was highlighted before. Saving anyway.",
        duration: 3000,
      });
    }
    const input: CreateAnnotationInput = {
      docSlug: activeSlug,
      sectionId: selection.sectionId,
      sectionTitle: selection.sectionTitle,
      text: selection.text,
      note: note.trim(),
      color,
      tags,
    };
    const ann = addAnnotation(input);
    window.getSelection()?.removeAllRanges();
    dismiss();
    toast.success("Annotation added", {
      description: tags.length > 0 ? `Tags: ${tags.map((t) => `#${t}`).join(" ")}` : undefined,
      action: {
        label: "View",
        onClick: () => dispatchDocEvent(EVT.AnnotationClicked, { id: ann.id }),
      },
    });
  }, [selection, activeSlug, note, color, tags, dismiss]);

  if (!selection) return null;

  const top = selection.rect.top + window.scrollY - (showNoteInput ? 130 : 48);
  const left = selection.rect.left + window.scrollX + selection.rect.width / 2;
  const clampedLeft = Math.max(10, Math.min(left - 130, window.innerWidth - 290));

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Text selection actions"
      className="absolute z-50 bg-popover border rounded-lg shadow-xl p-1.5 flex flex-col gap-1.5 animate-in fade-in zoom-in-95"
      style={{ top, left: clampedLeft }}
    >
      {!showNoteInput ? (
        <>
          <div className="flex items-center gap-1">
            {COLOR_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "h-6 w-6 rounded-full border-2 transition-all hover:scale-110",
                  COLORS[c].dot,
                  color === c ? "border-foreground scale-110" : "border-transparent"
                )}
                title={`${COLORS[c].label} — ${COLORS[c].meaning}`}
                aria-label={`Highlight ${COLORS[c].label}`}
                aria-pressed={color === c}
              />
            ))}
            <div className="w-px h-5 bg-border mx-0.5" />
            <span className="text-[10px] text-muted-foreground font-mono px-1.5 hidden sm:inline tabular-nums" title={`${selection.text.length} chars · ${selection.text.split(/\s+/).filter(Boolean).length} words`}>
              {selection.text.length}c · {selection.text.split(/\s+/).filter(Boolean).length}w
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setShowNoteInput(true); setTimeout(() => noteRef.current?.focus(), 50); }}
              className="h-6 px-2 flex items-center gap-1 rounded text-[11px] hover:bg-accent transition-colors"
              title="Add a note + tags"
            >
              <MessageSquarePlus className="h-3 w-3" /> Note + tags
            </button>
            <button
              type="button"
              onClick={saveAnnotation}
              className="h-6 px-2 flex items-center gap-1 rounded text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
              title="Save highlight (⏎)"
            >
              <Highlighter className="h-3 w-3" /> Highlight
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5 w-72">
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
            placeholder="Add a note (markdown supported)…"
            className="w-full text-xs px-2 py-1.5 rounded border bg-background resize-none h-16 outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                saveAnnotation();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setShowNoteInput(false);
                setNote("");
              }
            }}
          />
          <div className="flex items-center gap-1">
            <Tag className="h-3 w-3 text-muted-foreground" />
            <TagInput tags={tags} onChange={setTags} placeholder="tag, Enter…" size="xs" />
          </div>
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-4 w-4 rounded-full border transition-all",
                    COLORS[c].dot,
                    color === c ? "border-foreground" : "border-transparent"
                  )}
                  title={COLORS[c].label}
                  aria-label={`Color ${COLORS[c].label}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setShowNoteInput(false); setNote(""); }}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveAnnotation}
                className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                Save (⌘↵)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AnnotationsInlinePopover — appears at the <mark> when clicked
// =============================================================================

export function AnnotationsInlinePopover() {
  const [annId, setAnnId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editColor, setEditColor] = useState<AnnotationColor>("yellow");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editStatus, setEditStatus] = useState<AnnotationStatus>("open");
  const [editPinned, setEditPinned] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Listen for annotation-clicked events
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ id: string; rect?: DOMRect }>;
      const id = ce.detail?.id;
      if (!id) return;
      // If clicking the same annotation, close it
      if (annId === id) {
        setAnnId(null);
        return;
      }
      setAnnId(id);
      setAnchorRect(ce.detail?.rect ?? null);
      setEditing(false);
      const ann = getAnnotation(id);
      if (ann) {
        setEditNote(ann.note);
        setEditColor(ann.color);
        setEditTags(ann.tags);
        setEditStatus(ann.status);
        setEditPinned(ann.pinned);
      }
    };
    window.addEventListener("annotation-clicked", handler);
    return () => window.removeEventListener("annotation-clicked", handler);
  }, [annId]);

  // Close on outside click / escape
  useEffect(() => {
    if (!annId) return;
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Also ignore clicks on <mark> (they re-open)
        const t = e.target as HTMLElement;
        if (t.tagName === "MARK" && t.hasAttribute("data-ann-id")) return;
        setAnnId(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAnnId(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [annId]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!annId) return;
    const reposition = () => {
      const mark = getMarkElementForAnnotation(annId);
      if (mark) {
        const rect = mark.getBoundingClientRect();
        setAnchorRect(rect);
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [annId]);

  const ann = annId ? getAnnotation(annId) : null;
  if (!ann || !anchorRect) return null;

  // Position popover below the mark
  const top = anchorRect.bottom + window.scrollY + 6;
  const left = Math.max(10, Math.min(
    anchorRect.left + window.scrollX + anchorRect.width / 2 - 150,
    window.innerWidth - 320
  ));

  const c = COLORS[ann.color];

  const save = () => {
    updateAnnotation(ann.id, {
      note: editNote.trim(),
      color: editColor,
      tags: editTags,
      status: editStatus,
      pinned: editPinned,
    });
    setEditing(false);
    toast.success("Annotation updated");
  };

  const del = () => {
    deleteAnnotation(ann.id);
    setAnnId(null);
    toast("Annotation deleted", {
      duration: UNDO_WINDOW_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (restoreAnnotation(ann.id)) toast.success("Annotation restored");
        },
      },
    });
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Annotation detail"
      className="absolute z-50 w-[300px] bg-popover border rounded-lg shadow-2xl animate-in fade-in zoom-in-95"
      style={{ top, left }}
    >
      {/* Header strip */}
      <div className={cn("flex items-center gap-1.5 px-2.5 py-1.5 border-b rounded-t-lg", c.bg)}>
        <span className={cn("h-2 w-2 rounded-full", c.dot)} />
        <span className="text-[10px] font-medium flex-1 truncate">{c.label}</span>
        <button
          type="button"
          onClick={() => updateAnnotation(ann.id, { pinned: !ann.pinned })}
          className={cn("h-5 w-5 flex items-center justify-center rounded hover:bg-background/50", ann.pinned ? "text-amber-500" : "text-muted-foreground")}
          title={ann.pinned ? "Unpin" : "Pin"}
          aria-label={ann.pinned ? "Unpin" : "Pin"}
        >
          <Pin className="h-3 w-3" fill={ann.pinned ? "currentColor" : "none"} />
        </button>
        <button
          type="button"
          onClick={() => setAnnId(null)}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-background/50 text-muted-foreground"
          aria-label="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="p-2.5 space-y-2">
        {/* Highlighted text */}
        <blockquote className={cn("text-[11px] italic px-2 py-1 rounded border-l-2 not-italic line-clamp-3", c.bg, c.border)}>
          {ann.text}
        </blockquote>

        {/* Section link */}
        <button
          type="button"
          onClick={() => {
            signalDocJump();
            useDocStore.getState().setActiveSlug(ann.docSlug);
            setAnnId(null);
            setTimeout(() => {
              const el = document.getElementById(ann.sectionId);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                signalDocJumpTo(ann.sectionId);
              }
            }, 250);
          }}
          className="text-[10px] text-muted-foreground hover:text-primary inline-flex items-center gap-0.5"
          title="Jump to location"
        >
          <ArrowUpRight className="h-2.5 w-2.5" />
          {ann.sectionTitle}
        </button>

        {!editing ? (
          <>
            {/* Note */}
            {ann.note && (
              <div className="flex items-start gap-1.5 text-[11px]">
                <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <span className="text-foreground/90 whitespace-pre-wrap break-words">{ann.note}</span>
              </div>
            )}
            {/* Tags */}
            {ann.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {ann.tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full bg-muted px-1.5 py-0 font-mono text-[9px] text-muted-foreground">
                    #{t}
                  </span>
                ))}
              </div>
            )}
            {/* Status badge */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateAnnotation(ann.id, { status: ann.status === "open" ? "resolved" : "open" })}
                className={cn(
                  "inline-flex items-center gap-0.5 h-5 px-1.5 rounded text-[10px] font-medium transition-colors",
                  ann.status === "resolved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                )}
              >
                {ann.status === "resolved" ? <CircleCheck className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
                {ann.status === "resolved" ? "Resolved" : "Open"}
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(ann.createdAt)}</span>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1 pt-1 border-t">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5" onClick={() => copyAnnotationAsMarkdown(ann.id) || toast.success("Copied")}>
                <Copy className="h-3 w-3" /> Copy
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={del}>
                <Trash2 className="h-3 w-3" /> Delete
              </Button>
            </div>
          </>
        ) : (
          <>
            <Textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
              placeholder="Add a note…"
              className="text-xs min-h-[60px] resize-y"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                {COLOR_KEYS.map((c2) => (
                  <button
                    key={c2}
                    type="button"
                    onClick={() => setEditColor(c2)}
                    className={cn("h-4 w-4 rounded-full border-2 transition-all hover:scale-110", COLORS[c2].dot, editColor === c2 ? "border-foreground scale-110" : "border-transparent")}
                    title={COLORS[c2].label}
                    aria-label={`Color ${COLORS[c2].label}`}
                  />
                ))}
              </div>
              <div className="w-px h-4 bg-border" />
              <Select value={editStatus} onValueChange={(v) => setEditStatus(v as AnnotationStatus)}>
                <SelectTrigger className="h-6 w-[80px] text-[10px] px-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-[10px] cursor-pointer">
                <Switch checked={editPinned} onCheckedChange={setEditPinned} className="h-3.5 w-7" />
                <Pin className={cn("h-2.5 w-2.5", editPinned && "text-amber-500")} />
              </label>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">Tags</div>
              <TagInput tags={editTags} onChange={setEditTags} placeholder="add tag…" size="xs" />
            </div>
            <div className="flex items-center justify-end gap-1 pt-1 border-t">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={save}><Check className="h-3 w-3" /> Save</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Re-exports
// =============================================================================

export {
  loadAnnotations,
  saveAnnotations,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  restoreAnnotation,
  duplicateAnnotation,
  searchAnnotations,
  getStats,
  getAllTags,
  serializeAnnotations,
  copyAnnotationAsMarkdown,
  importFromJSON,
  dispatchAnnotationsUpdated,
  normalizeTag,
  dedupeTags,
};
