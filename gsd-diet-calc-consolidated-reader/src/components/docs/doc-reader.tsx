"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import "@/lib/window-globals"; // ambient Window interface augmentation
import { useDocStore, signalDocJumpTo, signalDocJumpToOccurrence } from "@/lib/doc-store";
import { TopBar } from "@/components/docs/top-bar";
import { DocSidebar } from "@/components/docs/doc-sidebar";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { SearchDialog } from "@/components/docs/search-dialog";
import { BacklinksPanel } from "@/components/docs/backlinks-panel";
import { ReadingProgressBar } from "@/components/docs/reading-progress";
import { XrefSplitView } from "@/components/docs/xref-split-view";
import { AuditChecklist } from "@/components/docs/audit-checklist";
import { ProgressDialog } from "@/components/docs/progress-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronLeft, ChevronRight, Loader2, Keyboard, FileText, BookOpen, Network, Star, Clock, ArrowUp, Filter, Highlighter, Download, Printer, Share2, Check, Bug, AlertTriangle, CheckSquare, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DependencyGraphDialog } from "@/components/docs/dependency-graph";
import { TocDialog } from "@/components/docs/toc-dialog";
import { ComparisonViewDialog } from "@/components/docs/comparison-view";
import { CommandPalette } from "@/components/docs/command-palette";
import { AnnotationsPanel, SelectionToolbar, AnnotationsInlinePopover } from "@/components/docs/annotations";
import { MiniToc } from "@/components/docs/mini-toc";
import { ResizableAside } from "@/components/docs/resizable-panels";
import { useAnnotationHighlights } from "@/lib/annotation-highlights";
import { ErrorBoundary } from "@/components/error-boundary";

interface FullFile {
  slug: string;
  fileName: string;
  title: string;
  type: "part" | "appendix" | "map";
  order: number;
  totalLines: number;
  blurb: string;
  sections: {
    id: string;
    level: number;
    title: string;
    lineNumber: number;
    endLine: number;
    children: string[];
  }[];
  rawMarkdown: string;
}

function typeBadge(type: FullFile["type"]) {
  if (type === "part") return <Badge variant="outline" className="text-[10px] text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800">PART</Badge>;
  if (type === "map") return <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800">MAP</Badge>;
  return <Badge variant="outline" className="text-[10px] text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800">APX</Badge>;
}

function typeLabel(type: FullFile["type"]): string {
  if (type === "part") return "Part";
  if (type === "map") return "Bug Map";
  return "Appendix";
}

// Strip the first H1 heading (and its following blank line) from the markdown
// so the rendered content doesn't duplicate the title shown in the page header.
function stripFirstH1(md: string): string {
  const lines = md.split("\n");
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+/.test(lines[i])) { h1Idx = i; break; }
  }
  if (h1Idx === -1) return md;
  // remove the H1 line + any immediately following blank lines
  let end = h1Idx + 1;
  while (end < lines.length && lines[end].trim() === "") end++;
  return lines.slice(end).join("\n");
}

export function DocReader() {
  const files = useDocStore((s) => s.files);
  const ids = useDocStore((s) => s.ids);
  const activeSlug = useDocStore((s) => s.activeSlug);
  const setActiveSlug = useDocStore((s) => s.setActiveSlug);
  const setActiveSectionId = useDocStore((s) => s.setActiveSectionId);
  const sidebarOpen = useDocStore((s) => s.sidebarOpen);
  const setSidebarOpen = useDocStore((s) => s.setSidebarOpen);
  const loading = useDocStore((s) => s.loading);
  const setFiles = useDocStore((s) => s.setFiles);
  const setIds = useDocStore((s) => s.setIds);
  const setGlossary = useDocStore((s) => s.setGlossary);
  const setWarnings = useDocStore((s) => s.setWarnings);
  const setLoading = useDocStore((s) => s.setLoading);
  const setError = useDocStore((s) => s.setError);
  const activeSectionId = useDocStore((s) => s.activeSectionId);
  const readingMode = useDocStore((s) => s.readingMode);
  const setReadingMode = useDocStore((s) => s.setReadingMode);
  const addVisitedSection = useDocStore((s) => s.addVisitedSection);
  const visitedDocs = useDocStore((s) => s.visitedDocs);
  const fontSize = useDocStore((s) => s.fontSize);

  const [fullFile, setFullFile] = useState<FullFile | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphFocusNode, setGraphFocusNode] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [depGraphSectionVisible, setDepGraphSectionVisible] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [jumpHighlightId, setJumpHighlightId] = useState<string | null>(null);
  const [hiddenSeverities, setHiddenSeverities] = useState<Set<string>>(new Set());
  // F-09: mobile right-panel Sheet (backlinks/related-IDs) — desktop shows it
  // inline via ResizableAside; mobile gets a bottom Sheet triggered by a FAB.
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);

  // Apply annotation highlights to the prose whenever the active doc changes
  const annotationCount = useAnnotationHighlights(fullFile?.slug);

  // compute stats for badges
  const totalFindings = Object.values(ids).filter(e => e.kind === "finding").length;
  const p0Count = Object.values(ids).filter(e => e.kind === "priority" && e.id === "P0").length > 0 ? 10 : 0;
  // count P0 occurrences from priority entries
  const p0Entry = ids["P0"];
  const p0OccCount = p0Entry ? p0Entry.occurrences.length : 0;

  // navigate prev/next file (declared early so the keyboard handler can depend on it)
  const goToAdjacent = useCallback(
    (dir: -1 | 1) => {
      if (!activeSlug || files.length === 0) return;
      const idx = files.findIndex((f) => f.slug === activeSlug);
      if (idx === -1) return;
      const next = files[idx + dir];
      if (next) setActiveSlug(next.slug);
    },
    [activeSlug, files, setActiveSlug]
  );

  // keyboard shortcut for search (Cmd+K) + section navigation (j/k) + ? for shortcuts
  // + 'f' for focus mode + 'p' for progress + Cmd+P for command palette
  //
  // F-10: single-letter shortcuts also skip when focus is on a BUTTON, A,
  // SELECT, or contenteditable — so that screen-reader / keyboard users
  // navigating by tab don't accidentally trigger actions (e.g. pressing 'b'
  // while focused on a button expecting browser back-history).
  useEffect(() => {
    const isInteractiveTarget = (): boolean => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A") {
        return true;
      }
      // contenteditable (RichText editors, Slack-style inputs, etc.)
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Cmd+P or Cmd+Shift+P opens command palette
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (e.key === "?") {
        if (isInteractiveTarget()) return;
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        return;
      }
      // 'f' toggles focus mode
      if (e.key === "f") {
        if (isInteractiveTarget()) return;
        if (searchOpen || showShortcuts || graphOpen || tocOpen || progressOpen) return;
        e.preventDefault();
        setReadingMode(readingMode === "focus" ? "linear" : "focus");
        return;
      }
      // 'p' opens the progress dialog
      if (e.key === "p") {
        if (isInteractiveTarget()) return;
        if (searchOpen || showShortcuts || graphOpen || tocOpen) return;
        e.preventDefault();
        setProgressOpen(prev => !prev);
        return;
      }
      // 'g' opens the dependency graph (only when no input/textarea is focused)
      if (e.key === "g") {
        if (isInteractiveTarget()) return;
        // also avoid intercepting if a dialog/popover is open (searchOpen, showShortcuts)
        if (searchOpen || showShortcuts || tocOpen || progressOpen || comparisonOpen) return;
        e.preventDefault();
        setGraphOpen(true);
        return;
      }
      // 'v' opens the comparison view
      if (e.key === "v") {
        if (isInteractiveTarget()) {
          // If focus is inside a closing dialog's input, blur it so shortcuts work
          const activeEl = document.activeElement as HTMLElement | null;
          const inDialog = activeEl?.closest("[role=dialog]");
          if (inDialog) {
            activeEl?.blur();
          } else {
            return;
          }
        }
        if (searchOpen || showShortcuts || graphOpen || tocOpen || progressOpen || comparisonOpen || commandPaletteOpen) return;
        e.preventDefault();
        setComparisonOpen(true);
        return;
      }
      // 'n' opens the annotations panel
      if (e.key === "n") {
        if (isInteractiveTarget()) return;
        if (searchOpen || showShortcuts || graphOpen || tocOpen || progressOpen || comparisonOpen || commandPaletteOpen) return;
        e.preventDefault();
        setAnnotationsOpen(prev => !prev);
        return;
      }
      // 't' opens the table of contents dialog
      if (e.key === "t") {
        if (isInteractiveTarget()) return;
        if (searchOpen || showShortcuts || graphOpen || progressOpen) return;
        e.preventDefault();
        setTocOpen(true);
        return;
      }
      // 'b' bookmarks the current section
      if (e.key === "b") {
        if (isInteractiveTarget()) return;
        if (searchOpen || showShortcuts || graphOpen || tocOpen || progressOpen) return;
        if (!activeSlug || !activeSectionId) return;
        e.preventDefault();
        const file = files.find((f) => f.slug === activeSlug);
        const section = file?.sections.find((s) => s.id === activeSectionId);
        if (file && section) {
          useDocStore.getState().toggleBookmark({
            docSlug: file.slug,
            sectionId: section.id,
            sectionTitle: section.title.replace(/^[#*\s]+/, ""),
            docTitle: file.title,
          });
        }
        return;
      }
      // ← / → previous/next document (only when no input/textarea is focused
      // and no dialog/popover is open)
      if (isInteractiveTarget()) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // also skip if a dialog is open
        if (searchOpen || showShortcuts || graphOpen || tocOpen || progressOpen) return;
        e.preventDefault();
        goToAdjacent(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      // j/k section navigation (only when no input/textarea is focused)
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const headings = Array.from(document.querySelectorAll("[data-heading-id]"));
        if (headings.length === 0) return;
        // find current scroll position
        const viewport = document.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
        if (!viewport) return;
        const scrollTop = viewport.scrollTop;
        // find the heading closest to current scroll
        let currentIdx = 0;
        for (let i = 0; i < headings.length; i++) {
          const h = headings[i] as HTMLElement;
          const top = h.offsetTop - viewport.offsetTop;
          if (top <= scrollTop + 100) currentIdx = i;
        }
        const nextIdx = e.key === "j" ? Math.min(currentIdx + 1, headings.length - 1) : Math.max(currentIdx - 1, 0);
        const nextHeading = headings[nextIdx] as HTMLElement;
        nextHeading.scrollIntoView({ behavior: "smooth", block: "start" });
        setActiveSectionId(nextHeading.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveSectionId, searchOpen, showShortcuts, graphOpen, tocOpen, progressOpen, comparisonOpen, commandPaletteOpen, annotationsOpen, activeSlug, activeSectionId, files, goToAdjacent, readingMode, setReadingMode]);

  // Listen for annotation-clicked events (when user clicks a <mark> in prose).
  // The AnnotationsInlinePopover component handles this event itself and shows
  // an inline editor at the mark's position. We no longer open the side panel
  // on mark click — that was the old behavior. The side panel can still be
  // opened via the "My annotations" button or the 'n' keyboard shortcut.
  // (No handler needed here — AnnotationsInlinePopover is mounted below.)

  // initial load: fetch file list + id index
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/docs");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setFiles(data.files);
        setIds(Object.fromEntries(data.ids));
        setGlossary(Object.fromEntries(data.glossary));
        setWarnings(data.warnings ?? []);
        // pick a default: prefer URL hash doc, else bug map, else first file
        if (!activeSlug && data.files.length > 0) {
          const hash = window.location.hash.replace(/^#/, "");
          const hashSlug = decodeURIComponent(hash.split(":")[0] || hash);
          const hashSection = hash.includes(":") ? hash.split(":")[1] : null;
          const matched = hashSlug ? data.files.find((f: FullFile) => f.slug === hashSlug) : null;
          const bugMap = data.files.find((f: FullFile) => f.type === "map");
          const initialSlug = matched?.slug ?? bugMap?.slug ?? data.files[0].slug;
          setActiveSlug(initialSlug);
          // Defer section scroll until after content loads (handled in separate effect below)
          if (hashSection) {
            window.__pendingHashSection = hashSection;
          }
        }
        setLoading(false);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // §12.2: eager-fetch the graph payload on page mount.
  // The graph payload IS the canonical bug DB (nodeSchema carries status/subsystem/
  // oneLiner/repairs/blockedBy/onCriticalPath). Eager-fetch ensures popovers have
  // data on cold start, before the user opens the graph dialog.
  useEffect(() => {
    useDocStore.getState().fetchGraphNodes();
  }, []);

  // Hash navigation: when activeSlug changes and a pending hash section exists, scroll to it
  useEffect(() => {
    const pending = window.__pendingHashSection;
    if (fullFile && pending) {
      window.__pendingHashSection = null;
      const t = setTimeout(() => {
        const el = document.getElementById(pending);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("quick-jump-flash");
          setTimeout(() => el.classList.remove("quick-jump-flash"), 1200);
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [fullFile]);

  // Listen for hashchange events (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const parts = hash.split(":");
      const hashSlug = decodeURIComponent(parts[0]);
      const hashSection = parts[1];
      // If hash doc differs from active, switch
      if (hashSlug && hashSlug !== activeSlug) {
        const allFiles = useDocStore.getState().files;
        if (allFiles.some((f) => f.slug === hashSlug)) {
          setActiveSlug(hashSlug);
          if (hashSection) {
            window.__pendingHashSection = hashSection;
          }
        }
      } else if (hashSection && fullFile?.slug === hashSlug) {
        const el = document.getElementById(hashSection);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.classList.add("quick-jump-flash");
          setTimeout(() => el.classList.remove("quick-jump-flash"), 1200);
        }
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [activeSlug, fullFile, setActiveSlug]);

  // fetch full file content when active slug changes
  useEffect(() => {
    if (!activeSlug) return;
    let cancelled = false;
    setFileLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/docs?slug=${encodeURIComponent(activeSlug)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setFullFile(data.file);
        // set initial active section to the first H2 (or first section at level >= 2)
        const firstSection = data.file.sections.find((s: { level: number }) => s.level >= 2);
        if (firstSection) setActiveSectionId(firstSection.id);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeSlug]);

  // scroll-spy: track which section is in view + mark visited sections
  useEffect(() => {
    if (!fullFile) return;
    // small delay to ensure heading IDs are assigned by the other effect
    const timer = setTimeout(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          // pick the topmost intersecting heading
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible.length > 0) {
            const id = visible[0].target.id;
            if (id) {
              setActiveSectionId(id);
              addVisitedSection(id);
              // Update __currentVisibleSectionId for share-with-section feature
              window.__currentVisibleSectionId = id;
            }
          }
        },
        { rootMargin: "-80px 0px -50% 0px", threshold: 0 }
      );
      const headings = document.querySelectorAll("[data-heading-id]");
      headings.forEach((h) => observer.observe(h));
      // store observer for cleanup
      window.__scrollSpyObserver = observer;
    }, 100);
    return () => {
      clearTimeout(timer);
      const obs = window.__scrollSpyObserver;
      if (obs) obs.disconnect();
    };
  }, [fullFile, addVisitedSection]);

  // assign section ids to rendered heading elements so scroll-spy + cross-ref
  // jumps work. Match by normalized title text (strips markdown formatting).
  //
  // F-08 fix: previously this used a Map<title, section> that only kept the
  // FIRST section per title — so duplicate-titled headings (e.g. "Summary"
  // appearing in multiple parts) all got the same ID, breaking their anchors.
  // Now we keep a QUEUE per title and pop in document order, so each heading
  // gets its own unique ID (the parser already generates unique IDs via
  // `s${lineNumber}-${slugify(title)}`).
  useEffect(() => {
    if (!fullFile) return;
    const container = document.getElementById("md-container");
    if (!container) return;

    const assignIds = () => {
      // build a lookup: normalized title -> queue of sections (headings at
      // level >= 2, since the H1 is stripped from the rendered body)
      const sectionsByTitle = new Map<string, typeof fullFile.sections[number][]>();
      for (const s of fullFile.sections) {
        if (s.level < 2) continue; // skip H1 (stripped)
        const normalized = s.title
          .replace(/^[#*\s]+/, "")
          .replace(/\*+/g, "")
          .replace(/`/g, "")
          .trim()
          .toLowerCase();
        const queue = sectionsByTitle.get(normalized);
        if (queue) {
          queue.push(s);
        } else {
          sectionsByTitle.set(normalized, [s]);
        }
      }

      const headings = container.querySelectorAll("h2, h3, h4");
      let assigned = 0;
      headings.forEach((h) => {
        // Skip headings that already have an ID assigned (e.g. by a prior run)
        if (h.id) { assigned++; return; }
        const headingText = (h.textContent || "")
          .replace(/\*+/g, "")
          .replace(/`/g, "")
          .trim()
          .toLowerCase();
        const queue = sectionsByTitle.get(headingText);
        if (queue && queue.length > 0) {
          // Pop in document order — first heading with this title gets the
          // first section, second heading gets the second, etc.
          const section = queue.shift()!;
          h.id = section.id;
          h.setAttribute("data-heading-id", section.id);
          h.classList.add("scroll-mt-20");
          assigned++;
        }
      });
      return assigned;
    };

    // Try immediately (in case ReactMarkdown already rendered synchronously)
    const initialCount = assignIds();
    // Set up retries for slow-rendering docs (Part 1 is 1486 lines and can
    // take 1–2s for ReactMarkdown to fully render). The intervals are tuned
    // to cover the typical render window without being too chatty.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (ms: number) => timers.push(setTimeout(assignIds, ms));
    if (initialCount === 0) {
      // No headings rendered yet — try increasingly longer waits
      schedule(50);
      schedule(150);
      schedule(400);
      schedule(900);
      schedule(1800);
      schedule(3500);
    } else {
      // Initial pass worked — schedule one more pass to catch any late renders
      schedule(300);
      schedule(1200);
    }

    // Also use a MutationObserver as a robust fallback: if new headings appear
    // in #md-container after the initial pass, the observer will trigger another
    // assignment pass. This handles lazy rendering and async content.
    const observer = new MutationObserver((mutations) => {
      let hasNewHeadings = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.matches?.("h2, h3, h4") || el.querySelector?.("h2, h3, h4")) {
              hasNewHeadings = true;
              break;
            }
          }
        }
        if (hasNewHeadings) break;
      }
      if (hasNewHeadings) {
        // Defer slightly so React can finish committing the new nodes
        const t = setTimeout(assignIds, 50);
        timers.push(t);
      }
    });
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      timers.forEach(clearTimeout);
      observer.disconnect();
    };
  }, [fullFile]);

  // detect when the §D Dependency Graph section is in view (Bug Map doc) —
  // used to surface the floating "View as interactive graph" button.
  // Uses a single IntersectionObserver (no polling) to avoid scroll jank.
  useEffect(() => {
    if (!fullFile || fullFile.type !== "map") {
      setDepGraphSectionVisible(false);
      return;
    }
    let observer: IntersectionObserver | null = null;
    let target: Element | null = null;
    let lastVisible: boolean | null = null;
    const setup = () => {
      // find the heading element whose text matches the §D heading.
      const headings = Array.from(document.querySelectorAll("h2, h3, h4"));
      target = headings.find((h) => {
        const txt = (h.textContent || "").toLowerCase();
        return txt.includes("§d") || txt.includes("dependency graph");
      }) || null;
      if (!target) return false;

      const scrollArea = document.getElementById("main-scroll");
      const viewport = scrollArea?.querySelector("[data-radix-scroll-area-viewport]") as Element | null;
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          const visible = entry.isIntersecting;
          // only fire state update when the boolean actually flips
          if (visible !== lastVisible) {
            lastVisible = visible;
            setDepGraphSectionVisible(visible);
          }
        },
        {
          root: viewport || null,
          rootMargin: "0px 0px -50% 0px",
          threshold: 0,
        }
      );
      observer.observe(target);
      return true;
    };
    // try setup after a short delay (let ReactMarkdown render), retry if heading not found yet
    const timer = setTimeout(() => {
      if (!setup()) {
        // retry once after another delay
        const retry = setTimeout(setup, 800);
        window.__depGraphRetry = retry;
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      if (window.__depGraphRetry) clearTimeout(window.__depGraphRetry);
      if (observer) observer.disconnect();
    };
  }, [fullFile]);

  // reading progress tracking — throttled with requestAnimationFrame and
  // only updates React state when the value meaningfully changes, so that
  // scrolling a 4000-line document does NOT re-render the entire reader
  // (and the non-memoized markdown tree) on every animation frame.
  useEffect(() => {
    const scrollArea = document.getElementById("main-scroll");
    if (!scrollArea) return;
    const viewport = scrollArea.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    let rafId = 0;
    let lastPct = -1;
    let lastBackToTop: boolean | null = null;

    const handleScroll = () => {
      if (rafId) return; // one frame at a time
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const { scrollTop, scrollHeight, clientHeight } = viewport as HTMLElement;
        if (scrollHeight <= clientHeight) {
          if (lastPct !== 0) { lastPct = 0; setReadProgress(0); }
          return;
        }
        const pct = Math.min(100, (scrollTop / (scrollHeight - clientHeight)) * 100);
        const backToTop = scrollTop > clientHeight * 0.5 && pct > 5;
        // only fire state updates on meaningful change (>0.5% delta or toggle flip)
        if (Math.abs(pct - lastPct) > 0.5) {
          lastPct = pct;
          setReadProgress(pct);
        }
        if (backToTop !== lastBackToTop) {
          lastBackToTop = backToTop;
          setShowBackToTop(backToTop);
        }
      });
    };
    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [fullFile]);

  // section jump highlight: when a jump fires (cross-ref click, ToC select,
  // breadcrumb click, etc.) the dispatcher calls signalDocJumpTo(sectionId),
  // which we listen for here and apply a one-shot ring+pulse animation to
  // the destination heading.
  const jumpPendingRef = useRef(false);

  // listen for cross-component jump signals (dispatched by signalDocJump() in
  // nested components like the cross-ref popover inside MarkdownRenderer).
  useEffect(() => {
    const onJump = () => { jumpPendingRef.current = true; };
    window.addEventListener("doc:jump", onJump);
    return () => window.removeEventListener("doc:jump", onJump);
  }, []);

  // listen for "jump to specific section" events — these are more reliable
  // because they carry the actual destination sectionId.
  useEffect(() => {
    const onJumpTo = (e: Event) => {
      const sectionId = (e as CustomEvent).detail?.sectionId;
      if (!sectionId) return;
      setJumpHighlightId(sectionId);
      // also set jump-pending so that if the heading isn't rendered yet, the
      // activeSectionId-change effect can fire the highlight when it appears.
      jumpPendingRef.current = true;
    };
    window.addEventListener("doc:jumpto", onJumpTo as EventListener);
    return () => window.removeEventListener("doc:jumpto", onJumpTo as EventListener);
  }, []);

  // clear the highlight after 4s whenever jumpHighlightId changes.
  // The longer window accommodates slow doc switches where ReactMarkdown
  // takes 1–2s to render and the destination heading's id is assigned late.
  useEffect(() => {
    if (!jumpHighlightId) return;
    const t = setTimeout(() => setJumpHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [jumpHighlightId]);

  // ── occurrence-level jump highlight ──────────────────────────────────────
  // Listens for "doc:jumpto-occurrence" events (dispatched by
  // signalDocJumpToOccurrence). Unlike the heading ring above, this targets
  // the EXACT IdLink token (e.g. the literal "B7" button) the user jumped to.
  //
  // Flow:
  //   1. receive { id, occurrenceIndex }
  //   2. poll the #md-container for [data-id-link="<id>"] elements (the doc
  //      may still be rendering after a slug switch — retry up to ~8s)
  //   3. pick the Nth match, scrollIntoView({ block: "center" }), add the
  //      `occurrence-jump-target` class (sustained ~4.5s amber flash — see
  //      globals.css), and clear it after 5s
  //
  // Why a poll instead of a single querySelector: ReactMarkdown assigns
  // heading IDs in a useEffect AFTER render, and IdLink buttons inside table
  // cells / nested lists can take an extra tick to mount. Polling guarantees
  // we find the token regardless of when it appears.
  const occurrenceJumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const onJumpToOccurrence = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { id: string; occurrenceIndex?: number }
        | undefined;
      if (!detail?.id) return;
      const { id, occurrenceIndex = 0 } = detail;

      // clear any prior occurrence highlight still in flight (both tiers)
      document
        .querySelectorAll(".occurrence-jump-target, .occurrence-jump-block")
        .forEach((el) => {
          el.classList.remove("occurrence-jump-target", "occurrence-jump-block");
        });
      if (occurrenceJumpTimerRef.current) {
        clearTimeout(occurrenceJumpTimerRef.current);
        occurrenceJumpTimerRef.current = null;
      }

      const applyHighlight = (el: HTMLElement) => {
        // Clear any prior highlights (both tiers) — handles the case where
        // applyHighlight is called directly (not just via the event pre-clear).
        document
          .querySelectorAll(".occurrence-jump-target, .occurrence-jump-block")
          .forEach((n) => {
            n.classList.remove("occurrence-jump-target", "occurrence-jump-block");
          });

        // ── Tier 1: highlight the containing SENTENCE/block ──────────────
        // Walk up from the token to find the nearest sentence-bearing block
        // element (paragraph, list item, table cell, blockquote, etc.). This
        // gives the user the FULL SENTENCE the ID appears in — not just the
        // token — so they can immediately read the context without scanning.
        //
        // Headings are EXCLUDED because they're already covered by the
        // separate jumpHighlightId ring effect (animate-pulse-highlight), and
        // highlighting a heading as a "block" would be redundant. If the token
        // is inside a heading, only the token marker fires (the heading ring
        // already provides the sentence-level context for a heading).
        const isInHeading = !!el.closest("h1, h2, h3, h4, h5, h6");
        const block = isInHeading
          ? null
          : el.closest<HTMLElement>(
              "p, li, td, th, dd, dt, blockquote, figcaption, caption"
            );
        if (block && block !== el) {
          block.classList.add("occurrence-jump-block");
        }

        // ── Tier 2: highlight the exact ID token ─────────────────────────
        // Force a reflow so the animation restarts on rapid re-jumps.
        void el.offsetWidth;
        el.classList.add("occurrence-jump-target");

        if (occurrenceJumpTimerRef.current) clearTimeout(occurrenceJumpTimerRef.current);
        occurrenceJumpTimerRef.current = setTimeout(() => {
          el.classList.remove("occurrence-jump-target");
          if (block) block.classList.remove("occurrence-jump-block");
          occurrenceJumpTimerRef.current = null;
        }, 5000);
      };

      let attempt = 0;
      const tryFind = () => {
        if (attempt > 32) return; // ~8s @ 250ms
        attempt++;
        const container = document.getElementById("md-container");
        if (!container) {
          setTimeout(tryFind, 250);
          return;
        }
        const all = Array.from(
          container.querySelectorAll<HTMLElement>(`[data-id-link="${CSS.escape(id)}"]`)
        );
        const target = all[occurrenceIndex] ?? all[0];
        if (target) {
          // Scroll the exact token to the CENTER of the viewport.
          //
          // Use behavior:"auto" (instant) instead of "smooth" because:
          //   - handleGraphNodeClick's tryScroll loop ALSO calls scrollIntoView
          //     on the section heading (smooth, block:"start") and races with
          //     this call when the doc finishes rendering. With two competing
          //     smooth scrolls, whichever fires LAST wins — and the heading
          //     scroll often fires after the token scroll (because tryScroll
          //     polls every 250ms and can land just after the occurrence
          //     listener), re-scrolling away from the token.
          //   - Instant scroll commits in a single frame, so the token lands
          //     where we want it. The heading's smooth scroll then fires but
          //     only nudges a few px (heading is near the token), and our
          //     follow-up re-scrolls below correct it.
          const scrollTokenToCenter = () => {
            target.scrollIntoView({ behavior: "auto", block: "center" });
          };
          scrollTokenToCenter();
          // Re-scroll at increasing intervals to win the race against the
          // heading's tryScroll loop (which can fire up to ~8s after click).
          // Each re-scroll is instant and idempotent.
          const reScrollTimes = [120, 350, 700, 1200, 2000];
          reScrollTimes.forEach((ms) => setTimeout(scrollTokenToCenter, ms));
          // small delay so the first scroll commits before the flash fires
          // (otherwise the browser sometimes drops the paint frame)
          setTimeout(() => applyHighlight(target), 80);
          return;
        }
        setTimeout(tryFind, 250);
      };
      tryFind();
    };
    window.addEventListener("doc:jumpto-occurrence", onJumpToOccurrence as EventListener);
    return () => {
      window.removeEventListener("doc:jumpto-occurrence", onJumpToOccurrence as EventListener);
      if (occurrenceJumpTimerRef.current) {
        clearTimeout(occurrenceJumpTimerRef.current);
        // Also clean up any lingering highlight classes so a hot-unmount
        // doesn't leave orphaned .occurrence-jump-block / .occurrence-jump-target
        // elements in the DOM.
        document
          .querySelectorAll(".occurrence-jump-target, .occurrence-jump-block")
          .forEach((el) => {
            el.classList.remove("occurrence-jump-target", "occurrence-jump-block");
          });
      }
    };
  }, []);

  // helper to mark the next activeSectionId change as a "jump" (so it gets the highlight)
  const flagJump = useCallback(() => {
    jumpPendingRef.current = true;
  }, []);

  // apply severity filter to rendered tables
  useEffect(() => {
    if (!fullFile) return;
    const container = document.getElementById("md-container");
    if (!container) return;
    // small delay so ReactMarkdown + useSeverityRowColors have time to apply their classes first
    const t = setTimeout(() => {
      // first, clear any prior severity-hidden class on every row
      container.querySelectorAll("tr.severity-hidden").forEach((tr) => tr.classList.remove("severity-hidden"));

      if (hiddenSeverities.size === 0) return;

      const headings = Array.from(container.querySelectorAll("h2, h3, h4, h5"));
      for (const heading of headings) {
        const text = heading.textContent || "";
        let sev: string | null = null;
        for (const p of ["P0", "P1", "P2", "P3"]) {
          if (text.includes(p)) { sev = p; break; }
        }
        if (!sev || !hiddenSeverities.has(sev)) continue;
        const headingLevel = parseInt(heading.tagName[1]);
        // walk forward through siblings until same-or-higher-level heading
        let sibling = heading.nextElementSibling;
        while (sibling) {
          if (sibling.tagName.startsWith("H") && parseInt(sibling.tagName[1]) <= headingLevel) break;
          if (sibling.tagName === "TABLE") {
            const rows = sibling.querySelectorAll("tr");
            rows.forEach((row, idx) => {
              if (idx === 0) return; // skip header row
              row.classList.add("severity-hidden");
            });
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }, 80);
    return () => clearTimeout(t);
  }, [fullFile, hiddenSeverities]);

  // handle graph node click: jump to first occurrence of the ID
  // Adds a brief 200ms fade-out delay before closing the dialog so the
  // transition feels organic rather than abrupt.
  //
  // Two coordinated highlights fire after the destination renders:
  //   1. signalDocJumpTo(first.sectionId)  → subtle 1.6s ring on the section
  //      heading (context — "you are in §X.Y")
  //   2. signalDocJumpToOccurrence(node.id, 0) → sustained 4.5s amber flash on
  //      the EXACT IdLink token (the literal "B7"/"G3"/etc. button) so the
  //      user sees precisely which occurrence they jumped to, not just the
  //      surrounding heading. This is the fix for the "it jumps and it's
  //      confusing" complaint — without it, the heading lights up but the
  //      actual token can be 50+ lines down and invisible.
  const handleGraphNodeClick = useCallback(
    (node: { id: string }) => {
      const entry = ids[node.id];
      if (!entry || entry.occurrences.length === 0) {
        // fallback: open the Bug Map doc
        const bugMap = files.find((f) => f.type === "map");
        if (bugMap) setActiveSlug(bugMap.slug);
        // Brief delay before close for organic transition
        window.setTimeout(() => setGraphOpen(false), 200);
        return;
      }
      const first = entry.occurrences[0];
      flagJump();
      setActiveSlug(first.docSlug);
      // Wait for the doc to load + ReactMarkdown to render + heading IDs to be assigned.
      // Retry until the element appears (up to ~8 seconds).
      const tryScroll = (attempt: number) => {
        if (attempt > 32) return;
        setTimeout(() => {
          const el = document.getElementById(first.sectionId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            tryScroll(attempt + 1);
          }
        }, 250);
      };
      tryScroll(0);
      // also dispatch the jumpto event so the heading ring fires (after scroll)
      setTimeout(() => signalDocJumpTo(first.sectionId), 300);
      // ── the key addition: highlight the exact ID token, not just the heading ──
      // Slightly later than the heading signal so the heading ring paints first
      // (anchoring context), then the amber occurrence flash draws the eye to
      // the precise token. The occurrence listener in the effect above handles
      // the actual DOM lookup + scrollIntoView(center) + class toggle, retrying
      // until the token mounts.
      setTimeout(() => signalDocJumpToOccurrence(node.id, 0), 450);
      // Brief delay before close for organic transition (lets the user see
      // the node was selected before the dialog fades)
      window.setTimeout(() => setGraphOpen(false), 200);
    },
    [ids, files, setActiveSlug, flagJump]
  );

  // ---- open the graph centered on a specific node (organic mode integration) ----
  // Called when the user clicks a "View in graph" affordance from prose ID links.
  const openGraphAtNode = useCallback((nodeId: string) => {
    setGraphFocusNode(nodeId);
    setGraphOpen(true);
  }, []);

  // ---- listen for "graph:open-at-node" custom events (dispatched by IdLink) ----
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id) openGraphAtNode(detail.id);
    };
    window.addEventListener("graph:open-at-node", handler as EventListener);
    return () => window.removeEventListener("graph:open-at-node", handler as EventListener);
  }, [openGraphAtNode]);

  // ---- clear graphFocusNode when the dialog closes (so re-open doesn't re-focus) ----
  useEffect(() => {
    if (!graphOpen) {
      // small delay so the close transition isn't interrupted
      const t = window.setTimeout(() => setGraphFocusNode(null), 300);
      return () => window.clearTimeout(t);
    }
  }, [graphOpen]);

  // generic "jump to section" helper for breadcrumb / back-to-top / etc.
  const jumpToSection = useCallback(
    (sectionId: string) => {
      flagJump();
      setActiveSectionId(sectionId);
      // smooth scroll
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      // also dispatch the jumpto event so the highlight fires
      signalDocJumpTo(sectionId);
    },
    [flagJump, setActiveSectionId]
  );

  const jumpToTop = useCallback(() => {
    const scrollArea = document.getElementById("main-scroll");
    const viewport = scrollArea?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    viewport?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // toggle a severity in the hidden-severities set
  const toggleSeverity = useCallback((sev: string) => {
    setHiddenSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  }, []);

  // compute word count + reading time for the current doc (declared before any
  // early return so the hook order stays stable)
  const wordCount = useMemo(() => {
    if (!fullFile) return 0;
    // strip markdown noise (code, headers, tables) for a closer-to-prose word count
    const text = fullFile.rawMarkdown
      .replace(/```[\s\S]*?```/g, " ")        // fenced code blocks
      .replace(/`[^`]*`/g, " ")                // inline code
      .replace(/[#>*_~|]/g, " ")               // markdown punctuation
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> label
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
  }, [fullFile]);
  const readingTimeMin = Math.max(1, Math.round(wordCount / 220));

  // Memoize the stripped markdown so MarkdownRenderer's React.memo doesn't
  // break (stripFirstH1 returns a new string each call -> would bypass memo).
  const strippedMarkdown = useMemo(
    () => (fullFile ? stripFirstH1(fullFile.rawMarkdown) : ""),
    [fullFile]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading documentation...</p>
        </div>
      </div>
    );
  }

  const activeIdx = files.findIndex((f) => f.slug === activeSlug);
  const prevFile = activeIdx > 0 ? files[activeIdx - 1] : null;
  const nextFile = activeIdx >= 0 && activeIdx < files.length - 1 ? files[activeIdx + 1] : null;
  const activeFile = files.find((f) => f.slug === activeSlug);
  const activeSection = activeFile?.sections.find((s) => s.id === activeSectionId);

  // build breadcrumb path
  const breadcrumbItems: { label: string; slug?: string; sectionId?: string }[] = [];
  if (fullFile) {
    breadcrumbItems.push({ label: typeLabel(fullFile.type), slug: fullFile.slug });
    // find parent section path for the active section
    if (activeSection && activeFile) {
      // build path from root to current section
      const pathSections = buildSectionPath(activeFile.sections, activeSection.id);
      for (const ps of pathSections) {
        breadcrumbItems.push({
          label: ps.title.replace(/^[#*\s]+/, "").slice(0, 40),
          slug: fullFile.slug,
          sectionId: ps.id,
        });
      }
    }
  }

  function buildSectionPath(sections: { id: string; level: number; lineNumber: number; title: string; children: string[] }[], targetId: string): { id: string; level: number; lineNumber: number; title: string; children: string[] }[] {
    // find the path from root section to the target section
    const target = sections.find(s => s.id === targetId);
    if (!target) return [];

    // build ancestor chain by walking up levels
    const ancestors: { id: string; level: number; lineNumber: number; title: string; children: string[] }[] = [];
    let currentLevel = target.level;
    let currentLine = target.lineNumber;

    for (let i = sections.length - 1; i >= 0; i--) {
      const s = sections[i];
      if (s.level < currentLevel && s.lineNumber < currentLine) {
        ancestors.unshift(s);
        currentLevel = s.level;
        currentLine = s.lineNumber;
      }
    }

    ancestors.push(target);
    // only include sections at level >= 2 (skip H1 which is stripped)
    return ancestors.filter(s => s.level >= 2);
  }

  // determine layout based on reading mode
  const isFocus = readingMode === "focus";
  const isAudit = readingMode === "audit";
  const isXref = readingMode === "xref";

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar
        onOpenSearch={() => setSearchOpen(true)}
        onOpenGraph={() => setGraphOpen(true)}
        onOpenToc={() => setTocOpen(true)}
        onOpenProgress={() => setProgressOpen(true)}
        onOpenComparison={() => setComparisonOpen(true)}
        onOpenAnnotations={() => setAnnotationsOpen(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* keyboard shortcuts overlay */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowShortcuts(false)}>
          <div className="bg-background border rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Keyboard className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Keyboard Shortcuts</h3>
            </div>
            <div className="space-y-2 text-sm">
              {[
                { keys: "⌘K", desc: "Open search dialog" },
                { keys: "⌘P", desc: "Open command palette (all tools, docs, IDs)" },
                { keys: "t", desc: "Open table of contents" },
                { keys: "g", desc: "Open dependency graph (Bug Map §D)" },
                { keys: "v", desc: "Open document comparison view" },
                { keys: "n", desc: "Open my annotations panel" },
                { keys: "b", desc: "Bookmark the current section" },
                { keys: "f", desc: "Toggle focus reading mode" },
                { keys: "p", desc: "Open reading progress dashboard" },
                { keys: "j / k", desc: "Next / previous section" },
                { keys: "← / →", desc: "Previous / next document" },
                { keys: "Esc", desc: "Close dialog / popover" },
                { keys: "?", desc: "Show this shortcuts panel" },
              ].map(({ keys, desc }) => (
                <div key={keys} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-muted-foreground">{desc}</span>
                  <kbd className="px-2 py-0.5 rounded border bg-muted text-xs font-mono">{keys}</kbd>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setShowShortcuts(false)}>
              Close
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* desktop sidebar — hidden in focus mode. Organic drag-to-resize. */}
        {!isFocus && (
          <ResizableAside
            side="left"
            initialWidth={288}
            minWidth={220}
            maxWidth={480}
            storageKey="doc-sidebar-width"
            hiddenOnMobile
          >
            <DocSidebar />
          </ResizableAside>
        )}

        {/* mobile sidebar — hidden in focus mode */}
        {!isFocus && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-72 p-0">
              <DocSidebar onSelectSection={() => setSidebarOpen(false)} />
            </SheetContent>
          </Sheet>
        )}

        {/* main reading pane */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* breadcrumb bar — hidden in focus mode */}
          {!isFocus && (
            <div className="border-b px-4 py-2 bg-muted/20 backdrop-blur">
              <div className="flex items-center gap-3">
                <Breadcrumb>
                  <BreadcrumbList className="text-xs">
                    {breadcrumbItems.map((item, i) => (
                      <React.Fragment key={i}>
                        <BreadcrumbItem>
                          {i === breadcrumbItems.length - 1 ? (
                            <BreadcrumbPage className="text-xs font-medium line-clamp-1">
                              {item.label}
                            </BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink
                              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                              onClick={() => {
                                if (item.slug && item.slug !== activeSlug) {
                                  setActiveSlug(item.slug);
                                }
                                if (item.sectionId) {
                                  // jump within current doc — use jumpToSection for highlight
                                  if (item.slug === activeSlug) {
                                    jumpToSection(item.sectionId);
                                  } else {
                                    // doc-switch path: flag jump for when section becomes active
                                    flagJump();
                                    const targetId = item.sectionId;
                                    setTimeout(() => {
                                      const el = document.getElementById(targetId);
                                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                                      signalDocJumpTo(targetId);
                                    }, 300);
                                  }
                                }
                              }}
                            >
                              {item.label}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                        {i < breadcrumbItems.length - 1 && <BreadcrumbSeparator />}
                      </React.Fragment>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
                {fullFile && (
                  <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    {/* bookmark current section */}
                    {activeSection && (
                      <BookmarkToggleButton
                        docSlug={fullFile.slug}
                        sectionId={activeSection.id}
                        sectionTitle={activeSection.title.replace(/^[#*\s]+/, "")}
                        docTitle={fullFile.title}
                      />
                    )}
                    {typeBadge(fullFile.type)}
                    <span className="font-mono hidden sm:inline">{fullFile.fileName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <ReadingProgressBar />

          {/* severity filter bar — only for the Bug Map doc, which is organized by P0/P1/P2/P3 */}
          {!isFocus && fullFile?.type === "map" && (
            <SeverityFilterBar
              hiddenSeverities={hiddenSeverities}
              onToggle={toggleSeverity}
            />
          )}

          {/* floating "View as interactive graph" button when §D section is visible — reduced visual weight per VLM feedback */}
          {depGraphSectionVisible && fullFile?.type === "map" && !isFocus && (
            <button
              onClick={() => setGraphOpen(true)}
              className="fixed bottom-20 right-8 z-30 flex items-center gap-2 px-3 py-2 rounded-full border bg-background/95 backdrop-blur shadow-md text-xs font-medium hover:bg-accent transition-all hover:scale-105"
              title="View as interactive graph (g)"
            >
              <Network className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <span className="hidden sm:inline text-foreground">Interactive graph</span>
              <span className="sm:hidden text-foreground">Graph</span>
              <kbd className="ml-1 hidden sm:inline-flex h-4 items-center gap-0.5 rounded bg-muted px-1 text-[10px] font-mono text-muted-foreground">g</kbd>
            </button>
          )}

          {/* inline callout above §D section: hint at the interactive graph */}
          {depGraphSectionVisible && fullFile?.type === "map" && !isFocus && (
            <div className="px-4 sm:px-8 py-2 border-b bg-gradient-to-r from-violet-50/80 to-emerald-50/80 dark:from-violet-950/30 dark:to-emerald-950/30">
              <button
                onClick={() => setGraphOpen(true)}
                className="mx-auto max-w-3xl xl:max-w-4xl flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 hover:underline"
              >
                <Network className="h-3.5 w-3.5" />
                <span>The ASCII graph below is also available as an <strong>interactive dependency graph</strong> with minimap, inspector, and critical-path toggle.</span>
                <span className="ml-auto font-mono text-[10px]">Open →</span>
              </button>
            </div>
          )}

          {/* back-to-top floating button */}
          <button
            type="button"
            onClick={jumpToTop}
            aria-label="Back to top"
            title="Back to top"
            className={cn(
              "fixed bottom-20 left-6 z-30 h-10 w-10 rounded-full shadow-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex items-center justify-center transition-all hover:scale-110",
              showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>

          {/* xref mode: split the content area */}
          <div className={cn("flex-1 flex min-h-0", isXref ? "flex-row" : "flex-col")}>
            <ScrollArea className="flex-1 min-h-0 relative" id="main-scroll">
              <div className={cn("mx-auto px-4 sm:px-8 py-6 pb-24", isFocus ? "max-w-3xl" : "max-w-3xl xl:max-w-4xl")}>
                {fileLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fullFile ? (
                  <>
                    {/* focus mode: show minimal header */}
                    {isFocus && (
                      <div className="mb-4 text-xs text-muted-foreground flex items-center gap-2">
                        <span className="font-mono">{fullFile.fileName}</span>
                        <span className="text-border">·</span>
                        <span>{fullFile.sections.length} sections</span>
                        <span className="text-border">·</span>
                        <span>{readingTimeMin} min read</span>
                        <Button variant="outline" size="sm" className="h-6 text-[10px] ml-auto gap-1" onClick={() => setReadingMode("linear")}>
                          Exit Focus
                        </Button>
                      </div>
                    )}
                    {/* Document Header Gradient Card */}
                    <div className={cn(
                      "mb-8 rounded-xl overflow-hidden relative",
                      "border shadow-sm",
                      fullFile.type === "part" ? "border-rose-200/60 dark:border-rose-800/40" :
                      fullFile.type === "map" ? "border-amber-200/60 dark:border-amber-800/40" :
                      "border-sky-200/60 dark:border-sky-800/40"
                    )}>
                      {/* Gradient background */}
                      <div className={cn(
                        "px-5 sm:px-6 py-5 relative",
                        fullFile.type === "part" ? "bg-gradient-to-br from-rose-50 via-rose-25 to-background dark:from-rose-950/30 dark:via-rose-950/15 dark:to-background" :
                        fullFile.type === "map" ? "bg-gradient-to-br from-amber-50 via-amber-25 to-background dark:from-amber-950/30 dark:via-amber-950/15 dark:to-background" :
                        "bg-gradient-to-br from-sky-50 via-sky-25 to-background dark:from-sky-950/30 dark:via-sky-950/15 dark:to-background"
                      )}>
                        {/* Decorative gradient orb */}
                        <div className={cn(
                          "absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-20 blur-xl pointer-events-none",
                          fullFile.type === "part" ? "bg-gradient-to-br from-rose-400 to-pink-600" :
                          fullFile.type === "map" ? "bg-gradient-to-br from-amber-400 to-orange-600" :
                          "bg-gradient-to-br from-sky-400 to-cyan-600"
                        )} />
                        {/* Decorative dots pattern */}
                        <div className="absolute bottom-2 right-4 opacity-[0.08] pointer-events-none">
                          <svg width="60" height="60" viewBox="0 0 60 60">
                            <circle cx="10" cy="10" r="2" fill="currentColor" />
                            <circle cx="25" cy="10" r="2" fill="currentColor" />
                            <circle cx="40" cy="10" r="2" fill="currentColor" />
                            <circle cx="10" cy="25" r="2" fill="currentColor" />
                            <circle cx="25" cy="25" r="2" fill="currentColor" />
                            <circle cx="40" cy="25" r="2" fill="currentColor" />
                            <circle cx="10" cy="40" r="2" fill="currentColor" />
                            <circle cx="25" cy="40" r="2" fill="currentColor" />
                            <circle cx="40" cy="40" r="2" fill="currentColor" />
                          </svg>
                        </div>

                        <div className="flex items-start gap-4">
                          {/* Icon in rounded square container */}
                          <div className={cn(
                            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm",
                            fullFile.type === "part" ? "bg-gradient-to-br from-rose-100 to-rose-200 dark:from-rose-900/50 dark:to-rose-800/60 text-rose-600 dark:text-rose-400 ring-1 ring-rose-300/50 dark:ring-rose-700/40" :
                            fullFile.type === "map" ? "bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/50 dark:to-amber-800/60 text-amber-600 dark:text-amber-400 ring-1 ring-amber-300/50 dark:ring-amber-700/40" :
                            "bg-gradient-to-br from-sky-100 to-sky-200 dark:from-sky-900/50 dark:to-sky-800/60 text-sky-600 dark:text-sky-400 ring-1 ring-sky-300/50 dark:ring-sky-700/40"
                          )}>
                            {fullFile.type === "part" ? <BookOpen className="h-6 w-6" /> :
                             fullFile.type === "map" ? <Bug className="h-6 w-6" /> :
                             <FileText className="h-6 w-6" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* Title row with type badge */}
                            <div className="flex items-center gap-2 mb-1">
                              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
                                {fullFile.title}
                              </h1>
                              {typeBadge(fullFile.type)}
                            </div>
                            {/* Blurb */}
                            {fullFile.blurb && (
                              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                                {fullFile.blurb}
                              </p>
                            )}
                            {/* Stats row with pills */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                                fullFile.type === "part" ? "bg-rose-100/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300" :
                                fullFile.type === "map" ? "bg-amber-100/80 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" :
                                "bg-sky-100/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
                              )}>
                                <FileText className="h-3 w-3" />
                                {fullFile.totalLines.toLocaleString()} lines · {fullFile.sections.length} §
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted/60 text-muted-foreground font-medium">
                                <BookOpen className="h-3 w-3" />
                                {wordCount.toLocaleString()} words
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-muted/60 text-muted-foreground font-medium">
                                <Clock className="h-3 w-3" />
                                {readingTimeMin} min read
                              </span>
                              {/* Findings / P0 / Tasks stat pills — only show for map type */}
                              {fullFile.type === "map" && totalFindings > 0 && (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-rose-100/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                                    <Bug className="h-3 w-3" />
                                    {totalFindings} findings
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-rose-100/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium ring-1 ring-rose-300/50 dark:ring-rose-700/40">
                                    <AlertTriangle className="h-3 w-3" />
                                    10 P0
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-emerald-100/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium">
                                    <CheckSquare className="h-3 w-3" />
                                    {Object.values(ids).filter(e => e.kind === "task").length} tasks
                                  </span>
                                </>
                              )}
                              {/* Part doc: show P0 count + critical path */}
                              {fullFile.type === "part" && p0OccCount > 0 && (
                                <>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-rose-100/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-medium">
                                    <AlertTriangle className="h-3 w-3" />
                                    {p0OccCount} P0 refs
                                  </span>
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-orange-100/80 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 font-medium">
                                    <Zap className="h-3 w-3" />
                                    Critical path
                                  </span>
                                </>
                              )}
                              {/* Appendix doc: show reference count */}
                              {fullFile.type === "appendix" && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-sky-100/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-medium">
                                  <FileText className="h-3 w-3" />
                                  Reference
                                </span>
                              )}
                            </div>
                            {/* Action bar — contained row with light bg, separated from stats */}
                            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/40 dark:bg-muted/20 border border-border/60 px-2 py-1.5">
                              <DocActions fullFile={fullFile} />
                              {/* Quick-jump section navigator (sticky pills §A-§H) */}
                              <QuickJumpNav sections={fullFile.sections} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div id="md-container" data-doc-content={fullFile.slug} style={{ fontSize: `${fontSize}px` }}>
                      <ErrorBoundary label="the markdown content">
                        <MarkdownRenderer content={strippedMarkdown} highlightId={jumpHighlightId} />
                      </ErrorBoundary>
                      {/* Floating Mini-TOC */}
                      {!isFocus && fullFile.sections.length > 0 && (
                        <MiniToc sections={fullFile.sections} activeSectionId={activeSectionId} />
                      )}
                    </div>
                  </>
                ) : (
                  <div className="py-20 text-center text-muted-foreground">
                    No document loaded.
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* xref split view right pane */}
            {isXref && <XrefSplitView />}
          </div>

          {/* sticky footer with prev/next — hidden in focus mode */}
          {!isFocus && (
            <footer className="mt-auto border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
              {/* Reading progress bar */}
              {readProgress > 0 && (
                <div className="h-1 bg-muted/40">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(100, readProgress)}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!prevFile}
                  onClick={() => goToAdjacent(-1)}
                  className="h-8 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {prevFile ? (
                    <span className="hidden sm:inline line-clamp-1 max-w-[200px]">
                      {prevFile.title}
                    </span>
                  ) : (
                    <span className="hidden sm:inline">Previous</span>
                  )}
                </Button>

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {fullFile && (
                    <span className="font-mono line-clamp-1 max-w-[150px] hidden sm:inline">
                      {fullFile.title.slice(0, 30)}
                    </span>
                  )}
                  <span className="font-mono">
                    {activeIdx >= 0 ? `${activeIdx + 1} / ${files.length}` : ""}
                  </span>
                  {readProgress > 0 && (
                    <span className="text-xs font-mono tabular-nums">
                      {Math.round(readProgress)}%
                    </span>
                  )}
                  <span className="hidden sm:inline text-xs">
                    {visitedDocs.size} of {files.length} docs visited
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded border bg-muted text-[9px] font-mono cursor-pointer" onClick={() => setShowShortcuts(true)}>
                    ?
                  </kbd>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!nextFile}
                  onClick={() => goToAdjacent(1)}
                  className="h-8 text-xs gap-1"
                >
                  {nextFile ? (
                    <span className="hidden sm:inline line-clamp-1 max-w-[200px]">
                      {nextFile.title}
                    </span>
                  ) : (
                    <span className="hidden sm:inline">Next</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="text-center text-[10px] text-muted-foreground/60 pb-1">
                gsd-diet-calc Consolidated Reader · v10.4.0 · Documentation for reference only
              </div>
            </footer>
          )}
        </main>

        {/* right backlinks panel — desktop only, hidden in focus/audit mode.
            Organic drag-to-resize. */}
        {!isFocus && !isAudit && (
          <ResizableAside
            side="right"
            initialWidth={288}
            minWidth={240}
            maxWidth={520}
            storageKey="backlinks-panel-width"
            hiddenOnMobile
          >
            <BacklinksPanel />
          </ResizableAside>
        )}

        {/* F-09: mobile right-panel FAB + bottom Sheet. Desktop shows the panel
            inline (above); mobile users get a floating button that opens the
            same BacklinksPanel in a swipe-up Sheet. Hidden in focus/audit mode. */}
        {!isFocus && !isAudit && (
          <>
            <button
              type="button"
              aria-label="Open related IDs and backlinks"
              onClick={() => setMobileRightPanelOpen(true)}
              className="lg:hidden fixed bottom-4 right-4 z-30 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              <Network className="h-5 w-5" />
            </button>
            <Sheet open={mobileRightPanelOpen} onOpenChange={setMobileRightPanelOpen}>
              <SheetContent side="bottom" className="h-[60vh] p-0 overflow-auto">
                <div className="sticky top-0 bg-background border-b px-4 py-2 flex items-center justify-between z-10">
                  <span className="text-sm font-medium">Related IDs &amp; Backlinks</span>
                  <Button variant="ghost" size="sm" onClick={() => setMobileRightPanelOpen(false)}>
                    Close
                  </Button>
                </div>
                <div className="p-3">
                  <BacklinksPanel />
                </div>
              </SheetContent>
            </Sheet>
          </>
        )}
      </div>

      {/* audit mode: floating checklist */}
      {isAudit && <AuditChecklist />}

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <TocDialog open={tocOpen} onOpenChange={setTocOpen} />
      <ErrorBoundary label="the dependency graph">
        <DependencyGraphDialog
          open={graphOpen}
          onOpenChange={setGraphOpen}
          onNodeClick={handleGraphNodeClick}
          initialFocusNodeId={graphFocusNode ?? undefined}
        />
      </ErrorBoundary>
      <ProgressDialog open={progressOpen} onOpenChange={setProgressOpen} />
      <ComparisonViewDialog open={comparisonOpen} onOpenChange={setComparisonOpen} />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenGraph={() => setGraphOpen(true)}
        onOpenToc={() => setTocOpen(true)}
        onOpenProgress={() => setProgressOpen(true)}
        onOpenComparison={() => setComparisonOpen(true)}
        onOpenShortcuts={() => setShowShortcuts(true)}
      />
      <AnnotationsPanel open={annotationsOpen} onClose={() => setAnnotationsOpen(false)} />
      <SelectionToolbar />
      <AnnotationsInlinePopover />
    </div>
  );
}

// ---------- Quick-jump section navigator (sticky pills §A-§H) ----------
function QuickJumpNav({ sections }: { sections: FullFile["sections"] }) {
  // Show only top-level (level <= 2) sections, limited to first 12
  const topSections = useMemo(() => {
    return sections
      .filter((s) => s.level <= 2)
      .slice(0, 12)
      .map((s) => ({
        id: s.id,
        // Short label: prefer §X format from id (e.g., "a-catalog" → "§A")
        short: (() => {
          const m = s.id.match(/^([a-z0-9]+)-/i);
          if (m) {
            const prefix = m[1].toUpperCase();
            // If prefix looks like a single letter or single number, use §X format
            if (/^[A-Z0-9]+$/.test(prefix) && prefix.length <= 3) return `§${prefix}`;
          }
          // Fallback: first 2-3 chars of title
          const titleMatch = s.title.match(/^\s*([A-Z0-9]+)/);
          if (titleMatch) return `§${titleMatch[1]}`;
          return s.title.slice(0, 8);
        })(),
        title: s.title,
      }));
  }, [sections]);

  if (topSections.length === 0) return null;

  return (
    <nav
      className="flex items-center gap-0.5 overflow-x-auto max-w-[60%] lg:max-w-[60%] scrollbar-thin"
      aria-label="Quick jump to section"
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono mr-1 shrink-0">Jump</span>
      {topSections.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          onClick={(e) => {
            e.preventDefault();
            const el = document.getElementById(s.id);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              // Briefly highlight
              el.classList.add("quick-jump-flash");
              setTimeout(() => el.classList.remove("quick-jump-flash"), 1200);
            }
          }}
          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-muted-foreground hover:text-foreground hover:bg-background/80 dark:hover:bg-background/40 transition-colors"
          title={s.title}
        >
          {s.short}
        </a>
      ))}
    </nav>
  );
}

// ---------- Document action buttons (download, print, share) ----------
function DocActions({ fullFile }: { fullFile: FullFile }) {
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  const handleDownload = useCallback(() => {
    const blob = new Blob([fullFile.rawMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fullFile.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fullFile]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    // Include the currently-visible section if available, for deep-linking
    const visibleSection = window.__currentVisibleSectionId;
    url.hash = visibleSection ? `${fullFile.slug}:${visibleSection}` : fullFile.slug;
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 1800);
    } catch {
      // fallback: select address bar
      window.location.hash = fullFile.slug;
    }
  }, [fullFile.slug]);

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
        onClick={handleDownload}
        title={`Download ${fullFile.fileName}`}
        aria-label="Download source markdown"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Source</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
        onClick={handlePrint}
        title="Print or save as PDF"
        aria-label="Print document"
      >
        <Printer className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Print</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
        onClick={handleShare}
        title="Copy shareable link"
        aria-label="Copy shareable link"
      >
        {shareState === "copied" ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span className="hidden sm:inline text-emerald-600 dark:text-emerald-400">Copied</span>
          </>
        ) : (
          <>
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </>
        )}
      </Button>
    </div>
  );
}

// ---------- Bookmark toggle button (in breadcrumb bar) ----------
function BookmarkToggleButton({
  docSlug,
  sectionId,
  sectionTitle,
  docTitle,
}: {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  docTitle: string;
}) {
  const isBookmarked = useDocStore((s) => s.isBookmarked);
  const toggleBookmark = useDocStore((s) => s.toggleBookmark);
  const bookmarked = isBookmarked(docSlug, sectionId);
  return (
    <button
      type="button"
      onClick={() =>
        toggleBookmark({ docSlug, sectionId, sectionTitle, docTitle })
      }
      className={cn(
        "h-6 w-6 flex items-center justify-center rounded transition-all hover:bg-accent",
        bookmarked
          ? "text-amber-500"
          : "text-muted-foreground hover:text-amber-500"
      )}
      title={bookmarked ? "Remove bookmark (b)" : "Bookmark this section (b)"}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this section"}
    >
      <Star className={cn("h-3.5 w-3.5", bookmarked && "fill-current")} />
    </button>
  );
}

// ---------- Severity filter bar (Bug Map doc) ----------
const SEVERITY_CONFIG = [
  { id: "P0", label: "P0 · Critical", color: "rose", dot: "bg-rose-500", active: "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800" },
  { id: "P1", label: "P1 · High", color: "orange", dot: "bg-orange-500", active: "bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800" },
  { id: "P2", label: "P2 · Medium", color: "yellow", dot: "bg-yellow-500", active: "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800" },
  { id: "P3", label: "P3 · Low", color: "gray", dot: "bg-gray-400", active: "bg-gray-100 dark:bg-gray-800/40 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700" },
] as const;

function SeverityFilterBar({
  hiddenSeverities,
  onToggle,
}: {
  hiddenSeverities: Set<string>;
  onToggle: (sev: string) => void;
}) {
  const activeCount = SEVERITY_CONFIG.length - hiddenSeverities.size;
  return (
    <div className="border-b bg-muted/20 px-4 py-2 flex items-center gap-2 flex-wrap text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
        <Filter className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Severity filter:</span>
        <span className="sm:hidden">Filter:</span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {SEVERITY_CONFIG.map((sev) => {
          const visible = !hiddenSeverities.has(sev.id);
          return (
            <button
              key={sev.id}
              type="button"
              onClick={() => onToggle(sev.id)}
              className={cn(
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-mono font-medium transition-all",
                visible
                  ? cn(sev.active, "shadow-sm")
                  : "bg-muted/40 text-muted-foreground/60 border-border/60 line-through opacity-60 hover:opacity-100"
              )}
              aria-pressed={visible}
              title={visible ? `Hide ${sev.label} rows` : `Show ${sev.label} rows`}
            >
              <span className={cn("h-2 w-2 rounded-full", sev.dot, !visible && "opacity-50")} />
              {sev.id}
            </button>
          );
        })}
      </div>
      <div className="ml-auto text-[10px] text-muted-foreground/80 font-mono">
        {activeCount}/{SEVERITY_CONFIG.length} shown
      </div>
    </div>
  );
}
