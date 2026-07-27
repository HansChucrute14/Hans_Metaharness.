"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useDocStore, signalDocJump, signalDocJumpTo, signalDocJumpToOccurrence, type IdIndexEntry, type ReadingMode } from "@/lib/doc-store";
import { EVT, dispatchDocEvent } from "@/lib/contracts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link, Copy, Check, Hash, AlertTriangle, Shield, CheckSquare, Zap, Bug, ChevronRight, Lightbulb, Network } from "lucide-react";
import { getBugFact, severityBadgeClass } from "@/lib/bug-facts";
import { useGraphNode, useGraphNodesStatus } from "@/hooks/use-graph-node";
import { MermaidDiagram } from "@/components/docs/mermaid-diagram";

// ---------- ID detection ----------

// Patterns must be tried in order — most specific first.
// Each returns the captured id (group 1).
const ID_MATCHERS: { regex: RegExp; kind: IdIndexEntry["kind"]; group: 1 | 0 }[] = [
  // Appendix file refs: APPENDIX-ID-KEY.md
  { regex: /\b(APPENDIX-[A-Z-]+(?:\.md)?)\b/g, kind: "appendix-ref", group: 1 },
  // Section refs: §9.1, §A.A3, §10.1, §9.3
  { regex: /§\s*([A-Z]\.[A-Z][0-9]+(?:[a-z])?|[0-9]+\.[0-9]+)/g, kind: "section", group: 1 },
  // Legacy R-01..R-09
  { regex: /\b(R-0[1-9])\b/g, kind: "legacy", group: 1 },
  // "Task B2a" / "Task C1" / "Task R5" — capture the id, linkify the id only
  { regex: /\bTask\s+(B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5])\b/g, kind: "task", group: 1 },
  // Gates G1, G2, G3
  { regex: /\b(G[1-3])\b/g, kind: "gate", group: 1 },
  // Priority tags: P0, P1, P2, P3 — must come before findings so they get correct kind
  { regex: /\b(P[0-3])\b/g, kind: "priority", group: 1 },
  // Findings: A1-A20, B1-B18, C1-C22, D1-D22, E1-E23 (with optional lowercase suffix a/b)
  { regex: /\b([ABCE](?:[0-9]|1[0-9]|2[0-3])[ab]?)\b/g, kind: "finding", group: 1 },
];

interface LinkifiedTextProps {
  text: string;
}

interface Token {
  type: "text" | "id" | "glossary";
  value: string;
  kind?: IdIndexEntry["kind"];
}

function tokenize(text: string): Token[] {
  // find all id matches across all patterns, then split
  interface Match {
    start: number;
    end: number;
    id: string;
    kind: IdIndexEntry["kind"];
  }
  const matches: Match[] = [];

  for (const { regex, kind, group } of ID_MATCHERS) {
    const re = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const id = group === 1 ? m[1] : m[0];
      // for "Task B2a" matches, the full match includes "Task "; we want to linkify
      // the id part only, so adjust start
      const fullMatch = m[0];
      let start = m.index;
      let end = m.index + fullMatch.length;
      if (fullMatch.startsWith("Task ")) {
        // linkify only the id portion (after "Task ")
        start = m.index + 5;
      }
      matches.push({ start, end, id, kind });
    }
  }

  // sort by start position, drop overlaps (keep earliest)
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  const filtered: Match[] = [];
  let lastEnd = 0;
  for (const mt of matches) {
    if (mt.start >= lastEnd) {
      filtered.push(mt);
      lastEnd = mt.end;
    }
  }

  // build tokens
  const tokens: Token[] = [];
  let cursor = 0;
  for (const mt of filtered) {
    if (mt.start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, mt.start) });
    }
    tokens.push({ type: "id", value: mt.id, kind: mt.kind });
    cursor = mt.end;
  }
  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }
  return applyGlossary(tokens);
}

// second pass: scan text tokens for glossary terms and split into glossary tokens
function applyGlossary(tokens: Token[]): Token[] {
  const glossary = useDocStore.getState().glossary;
  if (!glossary || Object.keys(glossary).length === 0) return tokens;

  const terms = Object.keys(glossary);
  // build a regex that matches any glossary term as a whole word
  const termRegex = new RegExp(`\\b(${terms.sort((a, b) => b.length - a.length).join("|")})\\b`, "g");

  const result: Token[] = [];
  for (const token of tokens) {
    if (token.type !== "text") {
      result.push(token);
      continue;
    }
    const text = token.value;
    const matches: { start: number; end: number; term: string }[] = [];
    const re = new RegExp(termRegex.source, termRegex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, term: m[1] });
    }
    if (matches.length === 0) {
      result.push(token);
      continue;
    }
    let cursor = 0;
    for (const mt of matches) {
      if (mt.start > cursor) {
        result.push({ type: "text", value: text.slice(cursor, mt.start) });
      }
      result.push({ type: "glossary", value: mt.term });
      cursor = mt.end;
    }
    if (cursor < text.length) {
      result.push({ type: "text", value: text.slice(cursor) });
    }
  }
  return result;
}

function kindColor(kind: IdIndexEntry["kind"]): string {
  switch (kind) {
    case "finding": return "text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 ring-1 ring-inset ring-rose-200/60 dark:ring-rose-800/40";
    case "task": return "text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50 ring-1 ring-inset ring-emerald-200/60 dark:ring-emerald-800/40";
    case "gate": return "text-violet-700 dark:text-violet-300 bg-violet-50/70 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/50 ring-1 ring-inset ring-violet-200/60 dark:ring-violet-800/40";
    case "section": return "text-sky-700 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/30 hover:bg-sky-100 dark:hover:bg-sky-950/50 ring-1 ring-inset ring-sky-200/60 dark:ring-sky-800/40";
    case "legacy": return "text-amber-700 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 ring-1 ring-inset ring-amber-200/60 dark:ring-amber-800/40";
    case "priority": return "text-slate-700 dark:text-slate-300 bg-slate-100/70 dark:bg-slate-800/40 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 ring-1 ring-inset ring-slate-200/60 dark:ring-slate-700/40";
    case "appendix-ref": return "text-teal-700 dark:text-teal-300 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100 dark:hover:bg-teal-950/50 ring-1 ring-inset ring-teal-200/60 dark:ring-teal-800/40";
    default: return "text-foreground hover:bg-accent";
  }
}

function kindBadgeColor(kind: IdIndexEntry["kind"]): string {
  switch (kind) {
    case "finding": return "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300";
    case "task": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300";
    case "gate": return "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300";
    case "section": return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300";
    case "legacy": return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300";
    case "priority": return "bg-slate-100 text-slate-700 dark:bg-slate-950/50 dark:text-slate-300";
    case "appendix-ref": return "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function prioritySeverity(id: string): { bg: string; darkBg: string; border: string; text: string } {
  switch (id) {
    case "P0": return { bg: "bg-rose-50/80", darkBg: "dark:bg-rose-950/30", border: "border-l-rose-500", text: "text-rose-700 dark:text-rose-300" };
    case "P1": return { bg: "bg-orange-50/60", darkBg: "dark:bg-orange-950/20", border: "border-l-orange-500", text: "text-orange-700 dark:text-orange-300" };
    case "P2": return { bg: "bg-yellow-50/40", darkBg: "dark:bg-yellow-950/15", border: "border-l-yellow-500", text: "text-yellow-700 dark:text-yellow-300" };
    case "P3": return { bg: "bg-gray-50/40", darkBg: "dark:bg-gray-950/15", border: "border-l-gray-400", text: "text-gray-600 dark:text-gray-300" };
    default: return { bg: "", darkBg: "", border: "", text: "" };
  }
}

// Graph node ID pattern: B0-B12 (with a/b suffix), C1-C16, R1-R5, G3.
// Used to decide whether to show a "View in graph" affordance in IdLink popovers.
const GRAPH_NODE_ID_RE = /^(B(?:0|[1-9]|1[0-2])[ab]?|C(?:[1-9]|1[0-6])|R[1-5]|G3)$/;
function isGraphNodeId(id: string): boolean {
  return GRAPH_NODE_ID_RE.test(id);
}

function IdLink({ id, kind }: { id: string; kind: IdIndexEntry["kind"] }) {
  const ids = useDocStore((s) => s.ids);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const readingMode = useDocStore((s) => s.readingMode);
  const setXrefDestination = useDocStore((s) => s.setXrefDestination);
  // T8b §12.2: prefer the eager-fetched graph node (from the Zustand store) as
  // the primary source for the Quick-Reference Card. Fall back to getBugFact
  // for finding IDs (A1-A14, D1-D8, E1-E7) that are NOT in the graph — T8c
  // will handle finding-node migration separately. Hooks MUST be called before
  // any early returns (Rules of Hooks); the lookup result is consumed in the
  // IIFEs below.
  const graphNode = useGraphNode(id);
  const graphNodesStatus = useGraphNodesStatus();
  const entry = ids[id];
  const canViewInGraph = isGraphNodeId(id);

  // Unified fact-like object: GraphNode has optional fields, BugFact has
  // required ones. We coerce both into a single shape so the JSX below can
  // render either source identically.
  const bugFact = getBugFact(id);
  const fact: {
    severity: string;
    subsystem: string;
    oneLiner: string;
    repairs: string[];
    blockedBy: string[];
    onCriticalPath?: boolean;
  } | null = graphNode
    ? {
        severity: graphNode.severity ?? "",
        subsystem: graphNode.subsystem ?? "",
        oneLiner: graphNode.oneLiner ?? graphNode.description ?? "",
        repairs: graphNode.repairs ?? [],
        blockedBy: graphNode.blockedBy ?? [],
        onCriticalPath: graphNode.onCriticalPath,
      }
    : bugFact
      ? { ...bugFact }
      : null;
  // §12.2 popover render contract:
  //   - both sources null && graph not ready → "loading…"
  //   - both sources null && graph ready     → existing "no fact" fallback
  const factLoading = !fact && graphNodesStatus !== "ready";

  // for appendix-ref ids like "APPENDIX-ID-KEY.md", resolve to the file slug
  const targetSlug = useMemo(() => {
    if (kind === "appendix-ref") {
      const base = id.replace(/\.md$/, "").toLowerCase();
      return base;
    }
    return null;
  }, [id, kind]);

  if (targetSlug) {
    return (
      <button
        type="button"
        onClick={() => setActiveSlug(targetSlug)}
        className={cn(
          "font-mono text-[0.85em] px-1 py-0.5 rounded underline-offset-2 hover:underline transition-colors",
          kindColor(kind)
        )}
      >
        {id}
      </button>
    );
  }

  // Priority tags: always add data-priority regardless of entry existence
  const isPriority = kind === "priority";

  if (!entry || entry.occurrences.length === 0) {
    // unknown id — render as styled text, add data-priority for P0/P1/P2/P3
    return (
      <span
        className={cn(
          "font-mono text-[0.85em] px-1 py-0.5 rounded transition-colors",
          isPriority && cn(prioritySeverity(id).text, "ring-1 ring-inset ring-current/20"),
          !isPriority && "text-muted-foreground bg-muted/40"
        )}
        data-priority={isPriority ? id : undefined}
      >
        {id}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "font-mono text-[0.85em] px-1 py-0.5 rounded underline-offset-2 hover:underline transition-colors cursor-pointer",
            kindColor(kind)
          )}
          data-id-link={id}
          data-priority={isPriority ? id : undefined}
        >
          {id}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        {/* Quick-Reference Card header — T8b: `fact` is the unified graph-node
            or BugFact object computed at the top of IdLink (graphNode primary,
            getBugFact fallback). */}
        {(() => {
          if (!fact) return null;
          return (
            <div className="border-b px-3 py-2.5 bg-muted/30">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-sm font-bold">{id}</span>
                <Badge variant="outline" className={cn("text-[10px] uppercase", kindBadgeColor(kind))}>{kind}</Badge>
                {fact.severity && (
                  <Badge className={cn("text-[10px] h-5 font-mono font-bold", severityBadgeClass(fact.severity))}>{fact.severity}</Badge>
                )}
                {fact.subsystem && (
                  <Badge variant="outline" className="text-[10px] h-5">{fact.subsystem}</Badge>
                )}
                {fact.onCriticalPath && (
                  <Badge className="text-[10px] h-5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-0">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />Critical path
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {entry.occurrences.length} occurrence{entry.occurrences.length === 1 ? "" : "s"}
                </span>
              </div>
              {fact.oneLiner && (
                <p className="text-xs leading-relaxed text-foreground/90">{fact.oneLiner}</p>
              )}
              {(fact.repairs.length > 0 || fact.blockedBy.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-1.5 text-[10px]">
                  {fact.blockedBy.length > 0 && (
                    <span className="text-muted-foreground">
                      Blocked by: {fact.blockedBy.map((b, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-muted-foreground">+</span>}
                          <span className="font-mono text-foreground/80">{b}</span>
                        </React.Fragment>
                      ))}
                    </span>
                  )}
                  {fact.repairs.length > 0 && (
                    <span className="text-muted-foreground ml-2">
                      Repairs: {fact.repairs.slice(0, 4).map((r, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && <span className="text-muted-foreground">+</span>}
                          <span className="font-mono text-foreground/80">{r}</span>
                        </React.Fragment>
                      ))}
                      {fact.repairs.length > 4 && <span className="text-muted-foreground">+{fact.repairs.length - 4} more</span>}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        {/* §12.2 popover render contract: when both graphNode and BugFact are
            null, show "loading…" if the graph payload isn't ready yet, else
            fall back to the default header (no fact available). */}
        {(() => {
          if (fact) return null; // already shown above
          if (factLoading) {
            return (
              <div className="border-b px-3 py-2.5 bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{id}</span>
                  <Badge variant="outline" className={cn("text-[10px] uppercase", kindBadgeColor(kind))}>{kind}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto animate-pulse">loading…</span>
                </div>
              </div>
            );
          }
          return (
            <div className="border-b px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{id}</span>
                <Badge variant="outline" className={cn("text-[10px] uppercase", kindBadgeColor(kind))}>{kind}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  {entry.occurrences.length} occurrence{entry.occurrences.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          );
        })()}
        <ScrollArea className="h-48">
          <div className="divide-y">
            {entry.occurrences.map((occ, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  // xref mode: open split view instead of scrolling
                  if (readingMode === "xref") {
                    setXrefDestination({ docSlug: occ.docSlug, sectionId: occ.sectionId });
                  } else {
                    signalDocJump();
                    setActiveSlug(occ.docSlug);
                    // defer scroll + highlight until after render
                    setTimeout(() => {
                      const el = document.getElementById(occ.sectionId);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      signalDocJumpTo(occ.sectionId);
                      // Highlight the EXACT occurrence token the user picked
                      // from this list — `i` matches the DOM order because
                      // docs-parser stores occurrences in document order and
                      // ReactMarkdown renders them in the same order.
                      signalDocJumpToOccurrence(id, i);
                    }, 250);
                  }
                }}
                className="w-full text-left px-3 py-2 hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-muted-foreground">
                    {occ.docSlug}:{occ.lineNumber}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {occ.sectionTitle}
                </div>
                <div className="text-xs mt-1 line-clamp-2 font-mono">
                  {occ.context}
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
        {canViewInGraph && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => {
                dispatchDocEvent(EVT.GraphOpenAtNode, { id });
              }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] font-medium px-2 py-1.5 rounded border bg-background hover:bg-accent transition-colors text-foreground"
            >
              <Network className="h-3 w-3 text-violet-600 dark:text-violet-400" />
              View in dependency graph
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function GlossaryTooltip({ term }: { term: string }) {
  const glossary = useDocStore((s) => s.glossary);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const definition = glossary[term];

  if (!definition) {
    return <span className="font-semibold text-[0.85em]">{term}</span>;
  }

  const handleJumpToGlossary = () => {
    const glossarySlug = "appendix-glossary";
    setActiveSlug(glossarySlug);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="font-semibold text-[0.85em] cursor-help text-foreground hover:text-primary transition-colors"
            style={{ textDecoration: "underline dotted", textDecorationSkipInk: "none", textUnderlineOffset: "2px" }}
          >
            {term}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs p-3" side="top">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-sm">{term}</span>
            <Badge variant="outline" className="text-[9px] uppercase bg-muted/50">GLOSSARY</Badge>
          </div>
          <p className="text-xs leading-relaxed">{definition}</p>
          <button
            type="button"
            onClick={handleJumpToGlossary}
            className="mt-2 text-[10px] text-primary hover:underline font-medium"
          >
            View in glossary →
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function LinkifiedText({ text }: LinkifiedTextProps) {
  // include glossary in the memo dependency so it re-tokenizes when glossary loads
  const glossary = useDocStore((s) => s.glossary);
  const tokens = useMemo(() => tokenize(text), [text, glossary]);
  return (
    <>
      {tokens.map((tok, i) =>
        tok.type === "text" ? (
          <LangAwareText key={i} text={tok.value} />
        ) : tok.type === "glossary" ? (
          <GlossaryTooltip key={i} term={tok.value} />
        ) : (
          <IdLink key={i} id={tok.value} kind={tok.kind!} />
        )
      )}
    </>
  );
}

/**
 * F-13: Wrap runs of text containing Portuguese characters (ã/õ/é/ç/á/í/ó/ú/â/ê/ô)
 * in <span lang="pt-BR"> so screen readers announce them with Portuguese
 * pronunciation instead of English phonetics. The docs contain terms like
 * "DB_ingredientes.json", "nutrientes", "cálculo", etc.
 *
 * Splits on word boundaries: words WITH Portuguese chars get wrapped, words
 * without are passed through as plain strings (no extra DOM nodes).
 */
const PT_CHAR_RE = /[ãõéçáíóúâêôÃÕÉÇÁÍÓÚÂÊÔà]/;
function LangAwareText({ text }: { text: string }) {
  // Fast path: if no Portuguese chars at all, return a single span (matches
  // prior behavior — no extra DOM cost for the common case).
  if (!PT_CHAR_RE.test(text)) {
    return <span>{text}</span>;
  }
  // Split into words while preserving whitespace.
  const parts = text.split(/(\s+)/);
  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^\s+$/.test(part)) return part;
        return PT_CHAR_RE.test(part) ? (
          <span key={i} lang="pt-BR">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

// ---------- post-render severity coloring ----------
// After markdown renders, scan DOM for P0/P1/P2/P3 priority tags
// inside table cells, and apply severity-colored backgrounds to the entire row.
// Also scans for plain text P0/P1/P2/P3 as a fallback.
// Re-runs when content changes.
function useSeverityRowColors(content: string) {
  useEffect(() => {
    const container = document.getElementById("md-container");
    if (!container) return;

    const severityClasses: Record<string, { bg: string; darkBg: string }> = {
      P0: { bg: "bg-rose-50/80", darkBg: "dark:bg-rose-950/30" },
      P1: { bg: "bg-orange-50/60", darkBg: "dark:bg-orange-950/20" },
      P2: { bg: "bg-yellow-50/40", darkBg: "dark:bg-yellow-950/15" },
      P3: { bg: "bg-gray-50/40", darkBg: "dark:bg-gray-950/15" },
    };

    const allSevClasses = Object.values(severityClasses).flatMap(s => [s.bg, s.darkBg]);

    // Primary method: find elements with data-priority attribute
    const priorityElements = container.querySelectorAll("[data-priority]");
    for (const el of priorityElements) {
      const priority = el.getAttribute("data-priority");
      if (!priority || !severityClasses[priority]) continue;
      // find the parent <tr> for table rows
      const tr = el.closest("tr");
      if (tr) {
        // remove any previous severity class
        allSevClasses.forEach(c => tr.classList.remove(c));
        const sev = severityClasses[priority];
        tr.classList.add(sev.bg, sev.darkBg);
        // also add a colored left border to the first td
        const firstTd = tr.querySelector("td:first-child");
        if (firstTd) {
          firstTd.classList.add("border-l-4", priority === "P0" ? "border-l-rose-500" : priority === "P1" ? "border-l-orange-500" : priority === "P2" ? "border-l-yellow-500" : "border-l-gray-400");
        }
      }
      // also color parent headings/paragraphs for non-table contexts
      const parentDiv = el.closest("h2, h3, h4, h5");
      if (parentDiv) {
        const sev = severityClasses[priority];
        parentDiv.classList.add(sev.bg, sev.darkBg, "px-2", "py-1", "rounded-md");
      }
    }

    // Fallback method: scan <td> elements for plain text P0/P1/P2/P3
    const tableCells = container.querySelectorAll("td");
    for (const td of tableCells) {
      const text = td.textContent || "";
      for (const priority of ["P0", "P1", "P2", "P3"]) {
        // check if this text contains the priority token (exact match, not part of finding like "P0" in "A20P0b")
        const regex = new RegExp(`\\b${priority}\\b`);
        if (regex.test(text)) {
          const tr = td.closest("tr");
          if (tr) {
            allSevClasses.forEach(c => tr.classList.remove(c));
            const sev = severityClasses[priority];
            tr.classList.add(sev.bg, sev.darkBg);
            const firstTd = tr.querySelector("td:first-child");
            if (firstTd) {
              firstTd.classList.add("border-l-4", priority === "P0" ? "border-l-rose-500" : priority === "P1" ? "border-l-orange-500" : priority === "P2" ? "border-l-yellow-500" : "border-l-gray-400");
            }
          }
          break; // highest severity wins
        }
      }
    }

    // Also scan headings for severity text and color table rows in their sections
    const headings = container.querySelectorAll("h2, h3, h4, h5");
    for (const heading of headings) {
      const text = heading.textContent || "";
      let highestPriority: string | null = null;
      for (const p of ["P0", "P1", "P2", "P3"]) {
        if (text.includes(p)) {
          highestPriority = p;
          break;
        }
      }
      if (highestPriority) {
        const sev = severityClasses[highestPriority];
        // Add background to heading (only if not already done by the data-priority loop)
        if (!heading.querySelector("[data-priority]")) {
          heading.classList.add(sev.bg, sev.darkBg, "px-2", "py-1", "rounded-md");
          // add a severity indicator badge (only when no IdLink P0/P1/P2/P3 button is present)
          const badge = document.createElement("span");
          badge.className = cn(
            "ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold",
            highestPriority === "P0" ? "bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200" :
            highestPriority === "P1" ? "bg-orange-200 text-orange-800 dark:bg-orange-900 dark:text-orange-200" :
            highestPriority === "P2" ? "bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" :
            "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
          );
          badge.textContent = highestPriority;
          heading.appendChild(badge);
        }

        // Color all table rows that appear between this heading and the next heading
        // at the same or higher level (i.e., tables within this severity section)
        // This applies regardless of whether the heading has data-priority elements
        const headingLevel = parseInt(heading.tagName[1]);
        let sibling = heading.nextElementSibling;
        while (sibling) {
          // Stop if we hit another heading at the same or higher level
          if (sibling.tagName.startsWith("H") && parseInt(sibling.tagName[1]) <= headingLevel) break;
          // Color tables within this section
          if (sibling.tagName === "TABLE") {
            const rows = sibling.querySelectorAll("tr");
            rows.forEach((row, rowIdx) => {
              if (rowIdx === 0) return; // skip header row
              allSevClasses.forEach(c => row.classList.remove(c));
              row.classList.add(sev.bg, sev.darkBg);
              const firstTd = row.querySelector("td:first-child");
              if (firstTd) {
                firstTd.classList.add("border-l-4", highestPriority === "P0" ? "border-l-rose-500" : highestPriority === "P1" ? "border-l-orange-500" : highestPriority === "P2" ? "border-l-yellow-500" : "border-l-gray-400");
              }
            });
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }
  }, [content]);
}

// ---------- Copy button for headings ----------

// Context: carries the currently-highlighted section id from the parent
// DocReader down to SectionHeading instances WITHOUT going through
// ReactMarkdown's `components` prop (which doesn't reliably re-render
// custom components when only their props change).
const HighlightContext = createContext<string | null>(null);

/**
 * WeakMap storing cleanup handles for MutationObserver + timers attached to
 * heading elements by SectionHeading's callback ref. Using a WeakMap (vs the
 * old `(el as any).__headingCleanup` pattern) avoids:
 *   - TypeScript `any` casts
 *   - DOM property pollution
 *   - Stale references after element GC (WeakMap entries are collected with the key)
 */
interface HeadingCleanup {
  observer: MutationObserver;
  timer: ReturnType<typeof setTimeout>;
}
const headingCleanupMap = new WeakMap<HTMLElement, HeadingCleanup>();

function SectionHeading({ level, children, node, ...props }: any) {
  const highlightId = useContext(HighlightContext);
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Use React.ElementType for the dynamic tag — `keyof JSX.IntrinsicElements`
  // produces a union too complex for TS to represent when combined with `...props`.
  // Heading levels are h2/h3/h4 (validated by ReactMarkdown's `components` map).
  const Tag: React.ElementType = `h${level}` as React.ElementType;
  const isHighlighted = highlightId && resolvedId === highlightId;

  // Use MutationObserver to detect when the parent doc-reader assigns an id
  // to this heading element via its useEffect (ReactMarkdown doesn't pass id to headings).
  const headingRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const tryResolve = () => {
      const id = el.id || el.getAttribute("data-heading-id");
      if (id && id !== "undefined") {
        setResolvedId(id);
        return true;
      }
      return false;
    };

    // Try immediately (parent effect might have already assigned)
    if (tryResolve()) {
      return;
    }

    // Watch for mutations (parent effect will set id/data-heading-id)
    const observer = new MutationObserver(() => {
      if (tryResolve()) observer.disconnect();
    });
    observer.observe(el, { attributes: true, attributeFilter: ["id", "data-heading-id"] });

    // Fallback: try again after a short delay
    const timer = setTimeout(() => {
      if (tryResolve()) observer.disconnect();
    }, 300);

    // Store for cleanup (callback refs don't have cleanup)
    headingCleanupMap.set(el, { observer, timer });
  }, []);

  // Cleanup mutation observers when component unmounts
  useEffect(() => {
    return () => {
      const container = document.getElementById("md-container");
      if (!container) return;
      container.querySelectorAll("h2, h3, h4").forEach((h) => {
        const cleanup = headingCleanupMap.get(h as HTMLElement);
        if (cleanup) {
          cleanup.observer.disconnect();
          clearTimeout(cleanup.timer);
          headingCleanupMap.delete(h as HTMLElement);
        }
      });
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (resolvedId) {
      navigator.clipboard.writeText(resolvedId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [resolvedId]);

  return (
    <Tag
      ref={headingRef}
      data-resolved-id={resolvedId ?? ""}
      data-highlight-id={highlightId ?? ""}
      data-is-highlighted={isHighlighted ? "true" : "false"}
      className={cn(
        "scroll-mt-20 group relative transition-all",
        isHighlighted && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background rounded-md px-2 -mx-2 animate-pulse-highlight"
      )}
      {...props}
    >
      {children}
      {resolvedId && (
        <button
          type="button"
          onClick={handleCopy}
          className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-accent"
          aria-label={`Copy section ID: ${resolvedId}`}
          title={`Copy "${resolvedId}"`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
      )}
      {resolvedId && (
        <a
          href={`#${resolvedId}`}
          className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label={`Anchor link to ${resolvedId}`}
          onClick={(e) => { e.preventDefault(); document.getElementById(resolvedId)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
        >
          <Hash className="h-3.5 w-3.5" />
        </a>
      )}
    </Tag>
  );
}

// ---------- enhanced blockquote ----------

function StyledBlockquote({ children, ...props }: any) {
  // extract text from nested children
  const fullText = extractTextFromChildren(children);

  // Detect callout type based on content prefix
  // ⚠️ or WARNING → warning callout (red)
  // 💡 or NOTE → info callout (blue-ish, but using sky/teal since indigo/blue is restricted)
  // ✅ or VERIFIED → success callout (green)
  // P0/critical → danger callout (rose)
  // P1/high → warning-ish (orange)
  // P2/medium → caution (yellow)
  // P3/low → note (gray)
  // Default → regular blockquote styling

  let calloutType: "warning" | "info" | "success" | "danger" | "caution" | "note" | "default" = "default";
  let calloutIcon: React.ReactNode = null;
  let borderColor = "border-muted-foreground/30";
  let bgColor = "bg-muted/40";
  let iconColor = "text-muted-foreground";

  // Check for emoji/keyword prefixes first (highest priority)
  if (fullText.startsWith("⚠️") || fullText.startsWith("WARNING") || fullText.startsWith("Warning") || fullText.startsWith("warning:") || fullText.startsWith("CAUTION") || fullText.startsWith("Caution")) {
    calloutType = "warning";
    borderColor = "border-l-red-500 dark:border-l-red-400";
    bgColor = "bg-red-50/60 dark:bg-red-950/25";
    iconColor = "text-red-600 dark:text-red-400";
    calloutIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
  } else if (fullText.startsWith("💡") || fullText.startsWith("NOTE") || fullText.startsWith("Note") || fullText.startsWith("note:") || fullText.startsWith("TIP") || fullText.startsWith("Tip") || fullText.startsWith("tip:") || fullText.startsWith("INFO") || fullText.startsWith("Info")) {
    calloutType = "info";
    borderColor = "border-l-teal-500 dark:border-l-teal-400";
    bgColor = "bg-teal-50/60 dark:bg-teal-950/25";
    iconColor = "text-teal-600 dark:text-teal-400";
    calloutIcon = <Lightbulb className="h-4 w-4 shrink-0" />;
  } else if (fullText.startsWith("✅") || fullText.startsWith("VERIFIED") || fullText.startsWith("Verified") || fullText.startsWith("verified:") || fullText.startsWith("RESOLVED") || fullText.startsWith("Resolved") || fullText.startsWith("SUCCESS") || fullText.startsWith("Success")) {
    calloutType = "success";
    borderColor = "border-l-emerald-500 dark:border-l-emerald-400";
    bgColor = "bg-emerald-50/60 dark:bg-emerald-950/25";
    iconColor = "text-emerald-600 dark:text-emerald-400";
    calloutIcon = <CheckSquare className="h-4 w-4 shrink-0" />;
  } else if (fullText.startsWith("🔴") || fullText.startsWith("DANGER") || fullText.startsWith("Danger") || fullText.startsWith("CRITICAL") || fullText.startsWith("Critical")) {
    calloutType = "danger";
    borderColor = "border-l-rose-600 dark:border-l-rose-500";
    bgColor = "bg-rose-50/70 dark:bg-rose-950/30";
    iconColor = "text-rose-700 dark:text-rose-400";
    calloutIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
  }
  // Gate detection: "Gate G1", "G3 Gate", "Gate 3", etc.
  else if (/\bGate\s+G?[1-9]\b/i.test(fullText.substring(0, 50)) || /^G[1-9]\s+Gate\b/i.test(fullText.substring(0, 30))) {
    calloutType = "info";
    borderColor = "border-l-violet-500 dark:border-l-violet-400";
    bgColor = "bg-violet-50/40 dark:bg-violet-950/20";
    iconColor = "text-violet-600 dark:text-violet-400";
    calloutIcon = <Shield className="h-4 w-4 shrink-0" />;
  }
  // Severity-based detection (lower priority than explicit callout markers)
  else if (fullText.includes("P0") || fullText.toLowerCase().includes("critical")) {
    borderColor = "border-l-rose-500 dark:border-l-rose-400";
    bgColor = "bg-rose-50/50 dark:bg-rose-950/20";
    iconColor = "text-rose-600 dark:text-rose-400";
    calloutIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
    calloutType = "danger";
  } else if (fullText.includes("P1") || fullText.toLowerCase().includes("high severity")) {
    borderColor = "border-l-orange-500 dark:border-l-orange-400";
    bgColor = "bg-orange-50/50 dark:bg-orange-950/20";
    iconColor = "text-orange-600 dark:text-orange-400";
    calloutIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
    calloutType = "warning";
  } else if (fullText.includes("P2") || fullText.toLowerCase().includes("medium")) {
    borderColor = "border-l-yellow-500 dark:border-l-yellow-400";
    bgColor = "bg-yellow-50/50 dark:bg-yellow-950/20";
    iconColor = "text-yellow-600 dark:text-yellow-400";
    calloutIcon = <AlertTriangle className="h-4 w-4 shrink-0" />;
    calloutType = "caution";
  } else if (fullText.includes("P3") || fullText.toLowerCase().includes("low")) {
    borderColor = "border-l-gray-400 dark:border-l-gray-500";
    bgColor = "bg-gray-50/50 dark:bg-gray-950/20";
    calloutType = "note";
  }

  // For callout types with icons, render as a callout card
  if (calloutType !== "default" && calloutIcon) {
    return (
      <div className={cn("callout-card not-italic rounded-md my-4 border-l-[3px]", borderColor, bgColor)}>
        <div className="flex items-start gap-2.5 px-4 py-2.5">
          <span className={cn("mt-0.5 shrink-0", iconColor)}>{calloutIcon}</span>
          <div className="flex-1 min-w-0 prose-callout-content">
            {linkifyChildren(children)}
          </div>
        </div>
      </div>
    );
  }

  // Default blockquote (no special callout type)
  return (
    <blockquote className={cn("not-italic rounded-md px-4 py-2 my-4 border-l-[3px]", borderColor, bgColor)} {...props}>
      {linkifyChildren(children)}
    </blockquote>
  );
}

// ---------- enhanced code block ----------

// Marker prop set on the wrapper div rendered for mermaid code blocks.
// CodeBlockWrapper inspects its child for this prop and, if present, skips the
// <pre>/copy-button chrome so the mermaid SVG can render cleanly.
const MERMAID_FLAG = "data-mermaid-block";

function MermaidBlock({ chart }: { chart: string }) {
  return (
    <div {...{ [MERMAID_FLAG]: "true" }} className="mermaid-block-wrapper">
      <MermaidDiagram chart={chart} />
    </div>
  );
}

function StyledCode({ children, className, ...props }: any) {
  // inline code (no language class)
  if (!className) {
    return <code className="bg-muted px-1.5 py-0.5 rounded text-[0.85em] font-mono before:content-none after:content-none" {...props}>{children}</code>;
  }
  // extract language from className (e.g., "language-typescript")
  const lang = className.replace("language-", "").replace("hljs ", "").trim();

  // Mermaid: render the diagram instead of a syntax-highlighted code block.
  if (lang === "mermaid") {
    const code = extractTextFromChildren(children);
    return <MermaidBlock chart={code} />;
  }

  return (
    <div className="relative my-4">
      {lang && (
        <div className="absolute top-2 right-2 text-[10px] font-mono text-muted-foreground bg-muted/80 px-2 py-0.5 rounded z-10">
          {lang}
        </div>
      )}
      <code className={className} {...props}>{children}</code>
    </div>
  );
}

function StyledPre({ children, ...props }: any) {
  return (
    <pre className="bg-muted/50 border rounded-lg overflow-x-auto p-4 my-4" {...props}>
      {children}
    </pre>
  );
}

// ---------- Copy button for code blocks ----------
function CopyCodeButton({ preRef }: { preRef: React.RefObject<HTMLPreElement | null> }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    const pre = preRef.current;
    if (!pre) return;
    const text = pre.textContent || "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback: select text
      const range = document.createRange();
      range.selectNodeContents(pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [preRef]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn("code-block-copy", copied && "copied")}
      aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
      title={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

// Wrapper: renders <pre> + copy button as a positioned unit.
// For mermaid blocks (where the `code` override returned a <MermaidBlock> with
// the MERMAID_FLAG data attribute), skip the <pre> wrapper entirely and just
// render the diagram block.
function CodeBlockWrapper({ children, ...props }: any) {
  const preRef = useRef<HTMLPreElement>(null);
  const child = Array.isArray(children) ? children[0] : children;
  const childProps = (child && typeof child === "object" && "props" in child) ? child.props : null;
  if (childProps && childProps[MERMAID_FLAG]) {
    return <>{child}</>;
  }
  return (
    <div className="code-block-wrapper my-4">
      <pre ref={preRef} className="bg-muted/50 border rounded-lg overflow-x-auto p-4" {...props}>
        {children}
      </pre>
      <CopyCodeButton preRef={preRef} />
    </div>
  );
}

// ---------- markdown renderer ----------

interface MarkdownRendererProps {
  content: string;
  /** Optional id of a heading that should briefly flash (used by section-jump highlight). */
  highlightId?: string | null;
}

function MarkdownRendererImpl({ content, highlightId }: MarkdownRendererProps) {
  useSeverityRowColors(content);

  return (
    <HighlightContext.Provider value={highlightId ?? null}>
      <div className="prose prose-slate dark:prose-invert max-w-none
        prose-headings:scroll-mt-24 prose-headings:font-semibold
        prose-h1:text-3xl prose-h1:mt-8 prose-h1:mb-4
        prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border/50
        prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3
        prose-h4:text-lg prose-h4:mt-4 prose-h4:mb-2
        prose-p:leading-relaxed prose-p:my-3
        prose-a:text-primary prose-a:underline prose-a:decoration-primary/30 prose-a:hover:decoration-primary
        prose-strong:font-semibold
        prose-code:before:hidden prose-code:after:hidden
        prose-pre:bg-transparent prose-pre:border-0 prose-pre:p-0
        prose-blockquote:border-l-4
        prose-table:text-[13px] prose-table:border-collapse prose-table:w-full prose-table:my-6 prose-table:overflow-hidden prose-table:rounded-md prose-table:border prose-table:border-border/60
        prose-thead:bg-muted/40 prose-thead:sticky prose-thead:top-[60px] prose-thead:z-[5]
        prose-th:bg-muted/80 prose-th:px-3 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:border prose-th:border-border/60 prose-th:text-[11px] prose-th:uppercase prose-th:tracking-wider prose-th:text-muted-foreground
        prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border/40 prose-td:align-top
        prose-tr:transition-colors prose-tr:hover:bg-muted/40
        prose-li:my-1
        prose-hr:my-6 prose-hr:border-border/50
        prose-img:rounded-lg prose-img:border"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={{
            h1: ({ children, ...props }) => <SectionHeading level={1} {...props}>{linkifyChildren(children)}</SectionHeading>,
            h2: ({ children, ...props }) => <SectionHeading level={2} {...props}>{linkifyChildren(children)}</SectionHeading>,
            h3: ({ children, ...props }) => <SectionHeading level={3} {...props}>{linkifyChildren(children)}</SectionHeading>,
            h4: ({ children, ...props }) => <SectionHeading level={4} {...props}>{linkifyChildren(children)}</SectionHeading>,
            // linkify ids in text nodes recursively (not in code blocks)
            p: ({ children, ...props }) => <p {...props}>{linkifyChildren(children)}</p>,
            li: ({ children, ...props }) => <li {...props}>{linkifyChildren(children)}</li>,
            td: ({ children, ...props }) => <td {...props}>{linkifyChildren(children)}</td>,
            th: ({ children, ...props }) => <th {...props}>{linkifyChildren(children)}</th>,
            strong: ({ children, ...props }) => <strong {...props}>{linkifyChildren(children)}</strong>,
            em: ({ children, ...props }) => <em {...props}>{linkifyChildren(children)}</em>,
            a: ({ children, ...props }) => <a {...props}>{children}</a>,
            blockquote: StyledBlockquote,
            // enhanced code blocks
            code: StyledCode,
            pre: CodeBlockWrapper,
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </HighlightContext.Provider>
  );
}

// Memoized so that parent re-renders (e.g. scroll-driven state updates like
// readProgress) do NOT re-parse the entire markdown document + re-run syntax
// highlighting on every frame. This is the single biggest scroll-performance
// win for large docs (4000+ lines).
export const MarkdownRenderer = React.memo(
  MarkdownRendererImpl,
  (prev, next) =>
    prev.content === next.content && prev.highlightId === next.highlightId
);

// recursively linkify text nodes, leaving elements alone
function linkifyChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return <LinkifiedText text={children} />;
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return <LinkifiedText key={i} text={child} />;
      }
      return child;
    });
  }
  return children;
}

// extract raw text from React children tree (for severity detection in table rows)
function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren((children as any).props?.children ?? "");
  }
  return "";
}
