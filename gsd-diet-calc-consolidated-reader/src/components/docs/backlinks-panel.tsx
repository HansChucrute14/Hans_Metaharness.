"use client";

import { useDocStore, signalDocJump, signalDocJumpTo, signalDocJumpToOccurrence, type IdIndexEntry } from "@/lib/doc-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMemo } from "react";
import { Link2, Hash, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUG_FACTS } from "@/lib/bug-facts";
import type { GraphNode } from "@/lib/dependency-graph";

/** Visual metadata for each ID kind — a small dot color + human label. */
interface KindMeta {
  dot: string;
  label: string;
}

const KIND_META: Record<string, KindMeta> = {
  finding: { dot: "bg-rose-500", label: "Findings" },
  task: { dot: "bg-emerald-500", label: "Tasks" },
  gate: { dot: "bg-violet-500", label: "Gates" },
  priority: { dot: "bg-slate-400", label: "Priorities" },
  section: { dot: "bg-sky-500", label: "Sections" },
  legacy: { dot: "bg-amber-500", label: "Legacy" },
  "appendix-ref": { dot: "bg-teal-500", label: "Appendix refs" },
};

function kindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? { dot: "bg-muted-foreground", label: kind };
}

const KIND_ORDER = [
  "finding",
  "task",
  "gate",
  "priority",
  "section",
  "legacy",
  "appendix-ref",
];

interface SectionIdItem {
  id: string;
  kind: string;
  count: number;
  firstOcc: IdIndexEntry["occurrences"][number];
}

interface BacklinkItem {
  docSlug: string;
  docTitle: string;
  sectionId: string;
  sectionTitle: string;
  lineNumber: number;
  referencedIds: string[];
}

/**
 * Right sidebar — a focused "context" panel for the currently visible section.
 *
 * Two clean, flat sections divided by a subtle border:
 *   1. "On this page" — IDs (findings / tasks / gates) referenced in the
 *      current section, grouped by kind, each rendered as a compact
 *      `[A1] short title` row with a kind-colored left dot.
 *   2. "Linked from" — other sections that reference any of the current
 *      section's IDs (backlinks), rendered as flat rows with hover states.
 *
 * The currently-visible section's IDs get a subtle left border accent.
 * Clicking a row jumps to the ID's / backlink's first occurrence using the
 * existing jump-signal mechanism.
 */
export function BacklinksPanel() {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const activeSectionId = useDocStore((s) => s.activeSectionId);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  // T8b: subscribe to the eager-fetched graph payload (§12.2). We build a Map
  // for O(1) lookup inside `idShortTitle` (called per-ID in a list — can't use
  // the `useGraphNode(id)` hook there because hooks can't be called in loops).
  const graphNodes = useDocStore((s) => s.graphNodes);
  const graphNodesByXref = useMemo<Map<string, GraphNode>>(() => {
    const m = new Map<string, GraphNode>();
    for (const n of graphNodes) m.set(n.id, n);
    return m;
  }, [graphNodes]);

  const activeFile = files.find((f) => f.slug === activeSlug);
  const activeSection = activeFile?.sections.find((s) => s.id === activeSectionId);

  // IDs that appear in the currently-visible section.
  const sectionIds = useMemo<SectionIdItem[]>(() => {
    if (!activeSlug || !activeSectionId) return [];
    const found: SectionIdItem[] = [];
    const seen = new Set<string>();
    for (const [id, entry] of Object.entries(ids)) {
      for (const occ of entry.occurrences) {
        if (occ.docSlug === activeSlug && occ.sectionId === activeSectionId) {
          if (!seen.has(id)) {
            seen.add(id);
            found.push({
              id,
              kind: entry.kind,
              count: entry.occurrences.length,
              firstOcc: entry.occurrences[0],
            });
          }
          break;
        }
      }
    }
    return found.sort((a, b) => a.id.localeCompare(b.id));
  }, [activeSlug, activeSectionId, ids]);

  // Group the section's IDs by kind for the "On this page" list.
  const grouped = useMemo(() => {
    const g: Record<string, SectionIdItem[]> = {};
    for (const item of sectionIds) {
      (g[item.kind] ??= []).push(item);
    }
    return g;
  }, [sectionIds]);

  // Backlinks: other sections that reference any of the current section's IDs.
  const backlinks = useMemo<BacklinkItem[]>(() => {
    if (sectionIds.length === 0) return [];
    const links: BacklinkItem[] = [];
    const seenSections = new Set<string>();
    for (const { id } of sectionIds) {
      const entry = ids[id];
      if (!entry) continue;
      for (const occ of entry.occurrences) {
        if (occ.docSlug === activeSlug && occ.sectionId === activeSectionId) continue;
        const key = `${occ.docSlug}:${occ.sectionId}`;
        const existing = links.find(
          (l) => l.docSlug === occ.docSlug && l.sectionId === occ.sectionId
        );
        if (existing) {
          if (!existing.referencedIds.includes(id)) existing.referencedIds.push(id);
          continue;
        }
        if (seenSections.has(key)) continue;
        seenSections.add(key);
        const file = files.find((f) => f.slug === occ.docSlug);
        if (!file) continue;
        links.push({
          docSlug: occ.docSlug,
          docTitle: file.title,
          sectionId: occ.sectionId,
          sectionTitle: occ.sectionTitle,
          lineNumber: occ.lineNumber,
          referencedIds: [id],
        });
      }
    }
    return links
      .sort((a, b) => b.referencedIds.length - a.referencedIds.length)
      .slice(0, 30);
  }, [sectionIds, ids, files, activeSlug, activeSectionId]);

  const handleJumpToId = (id: string) => {
    const entry = ids[id];
    if (!entry || entry.occurrences.length === 0) return;
    const firstOcc = entry.occurrences[0];
    signalDocJump();
    setActiveSlug(firstOcc.docSlug);
    setTimeout(() => {
      const el = document.getElementById(firstOcc.sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      signalDocJumpTo(firstOcc.sectionId);
      // Highlight the exact ID token (sustained amber flash) so the user can
      // see WHICH occurrence they jumped to — not just the section heading.
      signalDocJumpToOccurrence(id, 0);
    }, 200);
  };

  const handleJumpToBacklink = (bl: BacklinkItem) => {
    signalDocJump();
    setActiveSlug(bl.docSlug);
    setTimeout(() => {
      const el = document.getElementById(bl.sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      signalDocJumpTo(bl.sectionId);
    }, 200);
  };

  // Short human title for an ID — prefer the eager-fetched graph node's
  // oneLiner (T8b §12.2), fall back to BUG_FACTS (safety net for finding IDs
  // not in the graph — T8c will handle those separately), then the section
  // title of its first occurrence, then the raw id.
  const idShortTitle = (id: string): string => {
    const node = graphNodesByXref.get(id);
    if (node?.oneLiner) return node.oneLiner;
    const fact = BUG_FACTS[id];
    if (fact?.oneLiner) return fact.oneLiner;
    const entry = ids[id];
    if (entry && entry.occurrences.length > 0) {
      const t = entry.occurrences[0].sectionTitle.replace(/^[#*\s]+/, "");
      if (t) return t;
    }
    return id;
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header — quiet, shows the active section context */}
      <div className="px-3 pt-3 pb-2 border-b shrink-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Context
        </div>
        {activeSection ? (
          <div className="mt-1">
            <div className="text-sm font-medium line-clamp-2 leading-snug">
              {activeSection.title.replace(/^[#*\s]+/, "")}
            </div>
            <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
              {activeFile?.fileName}:{activeSection.lineNumber}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">
            Click a section heading in the document to see its IDs and
            backlinks here.
          </p>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* ── On this page ─────────────────────────────────────────── */}
          <section className="px-3 py-3 border-b">
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                On this page
              </span>
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                · {sectionIds.length}
              </span>
            </div>

            {sectionIds.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic px-0.5">
                {activeSection
                  ? "No cross-reference IDs in this section."
                  : "No section selected."}
              </p>
            ) : (
              <div className="space-y-2.5">
                {KIND_ORDER.map((kind) => {
                  const items = grouped[kind];
                  if (!items || items.length === 0) return null;
                  const meta = kindMeta(kind);
                  return (
                    <div key={kind}>
                      <div className="flex items-center gap-1.5 mb-1 px-0.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                        <span className="text-[10px] text-muted-foreground/80">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50 font-mono">
                          {items.length}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {items.map(({ id }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => handleJumpToId(id)}
                            title={`Jump to ${id} · ${idShortTitle(id)}`}
                            className="w-full text-left flex items-start gap-2 px-2 py-1 rounded border-l-2 border-primary/40 hover:bg-accent/50 hover:border-primary/70 transition-colors"
                          >
                            <span className="text-[11px] font-mono text-foreground/80 shrink-0 leading-snug">
                              [{id}]
                            </span>
                            <span className="text-xs text-muted-foreground line-clamp-1 flex-1 leading-snug pt-px">
                              {idShortTitle(id)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Linked from ─────────────────────────────────────────── */}
          <section className="px-3 py-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Linked from
              </span>
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                · {backlinks.length}
              </span>
            </div>

            {backlinks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 italic px-0.5">
                No other sections reference these IDs.
              </p>
            ) : (
              <div className="space-y-0.5">
                {backlinks.map((bl, i) => (
                  <button
                    key={`${bl.docSlug}-${bl.sectionId}-${i}`}
                    type="button"
                    onClick={() => handleJumpToBacklink(bl)}
                    title={`${bl.docTitle} · L${bl.lineNumber}`}
                    className="w-full text-left px-2 py-1.5 rounded border-l-2 border-primary/40 hover:bg-accent/50 hover:border-primary/70 transition-colors"
                  >
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono">
                      <CornerDownRight className="h-2.5 w-2.5 shrink-0" />
                      <span className="line-clamp-1">{bl.docTitle}</span>
                    </div>
                    <div className="text-xs line-clamp-1 leading-snug mt-0.5 ml-3.5">
                      {bl.sectionTitle.replace(/^[#*\s]+/, "")}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1 ml-3.5">
                      {bl.referencedIds.slice(0, 6).map((id) => {
                        const meta = kindMeta(ids[id]?.kind ?? "");
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/80"
                          >
                            <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
                            {id}
                          </span>
                        );
                      })}
                      {bl.referencedIds.length > 6 && (
                        <span className="text-[9px] text-muted-foreground/50 font-mono">
                          +{bl.referencedIds.length - 6}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
