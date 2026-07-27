import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { EVT, dispatchDocEvent, dispatchDocEventChecked } from "@/lib/contracts";
import type { GraphNode } from "@/lib/dependency-graph";

// §12.2: graph payload fetch status
export type GraphNodesStatus = "idle" | "loading" | "ready" | "error";

export interface IdIndexEntry {
  id: string;
  kind: "finding" | "task" | "gate" | "section" | "legacy" | "priority" | "appendix-ref";
  occurrences: {
    docSlug: string;
    sectionId: string;
    sectionTitle: string;
    lineNumber: number;
    context: string;
  }[];
}

export interface DocFileMeta {
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
}

export interface BookmarkEntry {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  docTitle: string;
  addedAt: number;
}

export interface RecentlyViewedEntry {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  docTitle: string;
  viewedAt: number;
}

export type ReadingMode = "linear" | "xref" | "focus" | "audit";

export interface XrefDestination {
  docSlug: string;
  sectionId: string;
}

/**
 * Signal that the next activeSectionId change should be treated as a "jump"
 * (originating from a click, not from passive scroll-spy). Components deep in
 * the tree (e.g. cross-ref popovers inside the markdown renderer) can call
 * this before navigating; the top-level DocReader listens for the event and
 * sets a "jump pending" flag so the destination heading flashes briefly.
 */
export function signalDocJump(): void {
  if (typeof window === "undefined") return;
  dispatchDocEvent(EVT.DocJump);
}

/**
 * Signal a jump to a SPECIFIC section id, with the actual destination known.
 * This is more reliable than signalDocJump() (which fires before navigation
 * completes) because it carries the target sectionId and can be re-dispatched
 * after the destination heading has actually rendered. The DocReader listens
 * for this event and briefly highlights the matching heading.
 */
export function signalDocJumpTo(sectionId: string): void {
  if (typeof window === "undefined") return;
  dispatchDocEvent(EVT.DocJumpTo, { sectionId });
}

/**
 * Signal a jump to a SPECIFIC occurrence of an ID token (e.g. the first "B7"
 * rendered inside a section). Carries the id + occurrence index so the
 * DocReader can locate the exact IdLink button in the DOM (via
 * [data-id-link="<id>"]), scroll it into the center of the viewport, and apply
 * a prominent sustained highlight — so the user immediately sees *which* token
 * they jumped to, not just the surrounding section heading.
 *
 * occurrenceIndex is 0-based and matches the order of entries in
 * IdIndexEntry.occurrences (which the docs-parser stores in document order).
 */
export function signalDocJumpToOccurrence(id: string, occurrenceIndex: number = 0): void {
  if (typeof window === "undefined") return;
  dispatchDocEvent(EVT.DocJumpToOccurrence, { id, occurrenceIndex });
}

interface DocState {
  // list of all files (metadata only)
  files: DocFileMeta[];
  // id index (id -> entry)
  ids: Record<string, IdIndexEntry>;
  // glossary (term -> definition)
  glossary: Record<string, string>;
  // §12.5/T3.4: doc registry validation warnings (session-only, from /api/docs)
  warnings: string[];
  // currently active doc slug
  activeSlug: string | null;
  // currently active section id within the doc (for scroll-spy)
  activeSectionId: string | null;
  // loading / error states
  loading: boolean;
  error: string | null;
  // theme
  theme: "light" | "dark";
  // sidebar visibility (mobile)
  sidebarOpen: boolean;
  // active id popover (when user clicks an id link)
  activeIdPopover: string | null;
  // set of doc slugs the user has visited (reading progress tracking)
  visitedDocs: Set<string>;
  // bookmarks (persisted to localStorage)
  bookmarks: BookmarkEntry[];
  // recently viewed sections (most recent first, max 8)
  recentlyViewed: RecentlyViewedEntry[];
  // reading mode
  readingMode: ReadingMode;
  // xref split destination (null = no split)
  xrefDestination: XrefDestination | null;
  // visited section ids (for progress tracking)
  visitedSections: Set<string>;
  // font size for prose content
  fontSize: number;

  setFiles: (files: DocFileMeta[]) => void;
  setIds: (ids: Record<string, IdIndexEntry>) => void;
  setActiveSlug: (slug: string) => void;
  setActiveSectionId: (id: string | null) => void;
  setLoading: (b: boolean) => void;
  setError: (e: string | null) => void;
  setTheme: (t: "light" | "dark") => void;
  toggleSidebar: () => void;
  setSidebarOpen: (b: boolean) => void;
  setActiveIdPopover: (id: string | null) => void;
  markDocVisited: (slug: string) => void;
  setGlossary: (g: Record<string, string>) => void;
  setWarnings: (w: string[]) => void;
  // bookmark actions
  toggleBookmark: (entry: Omit<BookmarkEntry, "addedAt">) => void;
  isBookmarked: (docSlug: string, sectionId: string) => boolean;
  removeBookmark: (docSlug: string, sectionId: string) => void;
  // recently viewed actions
  trackRecentView: (entry: Omit<RecentlyViewedEntry, "viewedAt">) => void;
  clearRecentViews: () => void;
  // reading mode actions
  setReadingMode: (mode: ReadingMode) => void;
  setXrefDestination: (dest: XrefDestination | null) => void;
  // visited sections actions
  addVisitedSection: (sectionId: string) => void;
  // font size actions
  setFontSize: (size: number) => void;

  // ---- dependency-graph manual sync (schema-driven graph, see lib/dependency-graph.ts) ----
  graphSyncStatus: "idle" | "syncing" | "error";
  graphSyncedAt: string | null;   // ISO timestamp of last successful sync
  graphSyncErrors: string[] | null; // human-readable zod/integrity issues on failure
  syncDependencyGraph: () => Promise<void>;
  clearGraphSyncError: () => void;

  // ---- §12.2 graph payload (eager-fetch on page mount) ----
  graphNodes: GraphNode[];
  graphNodesStatus: GraphNodesStatus;
  setGraphNodes: (nodes: GraphNode[], status: GraphNodesStatus) => void;
  fetchGraphNodes: (force?: boolean) => Promise<void>;
}

export const useDocStore = create<DocState>()(
  persist(
    (set, get) => ({
      files: [],
      ids: {},
      glossary: {},
      warnings: [],
      activeSlug: null,
      activeSectionId: null,
      loading: true,
      error: null,
      theme: "light",
      sidebarOpen: false,
      activeIdPopover: null,
      visitedDocs: new Set<string>(),
      bookmarks: [],
      recentlyViewed: [],
      readingMode: "linear",
      xrefDestination: null,
      visitedSections: new Set<string>(),
      fontSize: 14,

      setFiles: (files) => set({ files }),
      setIds: (ids) => set({ ids }),
      setActiveSlug: (slug) =>
        set((s) => ({
          activeSlug: slug,
          activeSectionId: null,
          visitedDocs: new Set([...s.visitedDocs, slug]),
        })),
      setActiveSectionId: (id) => {
        // Guard: skip the store update entirely if the id hasn't changed.
        // The scroll-spy IntersectionObserver can fire repeatedly with the
        // same topmost heading while scrolling within a section; without
        // this guard each fire would trigger a full subscriber re-render.
        if (get().activeSectionId === id) return;
        set({ activeSectionId: id });
        // track recently viewed when section changes (debounced via state)
        const state = get();
        if (id && state.activeSlug) {
          const file = state.files.find((f) => f.slug === state.activeSlug);
          const section = file?.sections.find((s) => s.id === id);
          if (file && section) {
            // avoid spamming: only add if different from the most recent entry
            const last = state.recentlyViewed[0];
            if (last && last.docSlug === file.slug && last.sectionId === id) return;
            const entry: RecentlyViewedEntry = {
              docSlug: file.slug,
              sectionId: id,
              sectionTitle: section.title.replace(/^[#*\s]+/, ""),
              docTitle: file.title,
              viewedAt: Date.now(),
            };
            const filtered = state.recentlyViewed.filter(
              (r) => !(r.docSlug === entry.docSlug && r.sectionId === entry.sectionId)
            );
            set({ recentlyViewed: [entry, ...filtered].slice(0, 8) });
          }
        }
      },
      setLoading: (b) => set({ loading: b }),
      setError: (e) => set({ error: e }),
      setTheme: (t) => set({ theme: t }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (b) => set({ sidebarOpen: b }),
      setActiveIdPopover: (id) => set({ activeIdPopover: id }),
      markDocVisited: (slug) =>
        set((s) => ({ visitedDocs: new Set([...s.visitedDocs, slug]) })),
      setGlossary: (glossary) => set({ glossary }),
      setWarnings: (warnings) => set({ warnings }),

      toggleBookmark: (entry) =>
        set((s) => {
          const exists = s.bookmarks.some(
            (b) => b.docSlug === entry.docSlug && b.sectionId === entry.sectionId
          );
          if (exists) {
            return {
              bookmarks: s.bookmarks.filter(
                (b) =>
                  !(b.docSlug === entry.docSlug && b.sectionId === entry.sectionId)
              ),
            };
          }
          return {
            bookmarks: [
              { ...entry, addedAt: Date.now() },
              ...s.bookmarks,
            ].slice(0, 50), // cap at 50 bookmarks
          };
        }),

      isBookmarked: (docSlug, sectionId) =>
        get().bookmarks.some(
          (b) => b.docSlug === docSlug && b.sectionId === sectionId
        ),

      removeBookmark: (docSlug, sectionId) =>
        set((s) => ({
          bookmarks: s.bookmarks.filter(
            (b) => !(b.docSlug === docSlug && b.sectionId === sectionId)
          ),
        })),

      trackRecentView: (entry) =>
        set((s) => {
          const filtered = s.recentlyViewed.filter(
            (r) => !(r.docSlug === entry.docSlug && r.sectionId === entry.sectionId)
          );
          return {
            recentlyViewed: [
              { ...entry, viewedAt: Date.now() },
              ...filtered,
            ].slice(0, 8),
          };
        }),

      clearRecentViews: () => set({ recentlyViewed: [] }),

      setReadingMode: (mode) => set({ readingMode: mode }),
      setXrefDestination: (dest) => set({ xrefDestination: dest }),
      addVisitedSection: (sectionId) =>
        set((s) => {
          if (s.visitedSections.has(sectionId)) return s;
          return { visitedSections: new Set([...s.visitedSections, sectionId]) };
        }),
      setFontSize: (size) => set({ fontSize: size }),

      // ---- dependency-graph manual sync ----
      // Posts to /api/dependency-graph/sync which re-parses BUG-DEPENDENCY-MAP.md
      // §D-DATA from disk, validates with zod + referential-integrity, and on
      // success replaces the server-side cache. On failure the cached graph
      // keeps serving (fail-closed) and we surface the validation issues.
      graphSyncStatus: "idle",
      graphSyncedAt: null,
      graphSyncErrors: null,

      syncDependencyGraph: async () => {
        set({ graphSyncStatus: "syncing", graphSyncErrors: null });
        try {
          const res = await fetch("/api/dependency-graph/sync", {
            method: "POST",
          });
          const body = await res.json();
          if (res.ok && body.ok) {
            set({
              graphSyncStatus: "idle",
              graphSyncedAt: body.generatedAt,
              graphSyncErrors: null,
            });
            // Notify the graph dialog (and any other consumer) that fresh data
            // is available so it can re-fetch from GET /api/dependency-graph.
            // §12.4: checked variant — silent dispatch failure causes visible UI staleness.
            const dispatched = dispatchDocEventChecked(
              EVT.GraphSynced,
              { generatedAt: body.generatedAt }
            );
            if (!dispatched) {
              console.warn("[doc-store] graph:synced dispatch rejected (SSR or bad payload)");
              set({
                graphSyncStatus: "error",
                graphSyncErrors: ["sync succeeded but event dispatch failed"],
              });
            }
          } else {
            // 422 = validation failed; 429 = rate limited; 5xx = internal
            const issues: string[] = body.issues
              ? body.issues.map(
                  (i: { path?: string; message?: string }) =>
                    `${i.path ?? "(root)"}: ${i.message ?? "invalid"}`
                )
              : [body.message ?? `HTTP ${res.status}`];
            set({
              graphSyncStatus: "error",
              graphSyncErrors: issues,
            });
          }
        } catch (e) {
          set({
            graphSyncStatus: "error",
            graphSyncErrors: [
              e instanceof Error ? e.message : String(e),
            ],
          });
        }
      },

      clearGraphSyncError: () =>
        set({ graphSyncStatus: "idle", graphSyncErrors: null }),

      // §12.2: graph payload — eager-fetched on page mount (doc-reader.tsx).
      // Idempotent: no-op if status is "ready" or "loading" unless force=true.
      graphNodes: [],
      graphNodesStatus: "idle",
      setGraphNodes: (nodes, status) =>
        set({ graphNodes: nodes, graphNodesStatus: status }),
      fetchGraphNodes: async (force) => {
        const { graphNodesStatus } = get();
        if (!force && (graphNodesStatus === "ready" || graphNodesStatus === "loading")) return;
        set({ graphNodesStatus: "loading" });
        try {
          const res = await fetch("/api/dependency-graph");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          set({ graphNodes: json.nodes ?? [], graphNodesStatus: "ready" });
        } catch {
          set({ graphNodesStatus: "error" });
        }
      },
    }),
    {
      name: "gsd-doc-reader-storage",
      storage: createJSONStorage(() => {
        // SSR-safe: fall back to a noop storage on the server
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      // only persist bookmarks + recentlyViewed + fontSize (not files/ids/loading/etc.)
      partialize: (state) => ({
        bookmarks: state.bookmarks,
        recentlyViewed: state.recentlyViewed,
        visitedDocs: Array.from(state.visitedDocs),
        visitedSections: Array.from(state.visitedSections),
        theme: state.theme,
        readingMode: state.readingMode,
        fontSize: state.fontSize,
        graphSyncedAt: state.graphSyncedAt,
      }),
      // rehydrate: convert visitedDocs array back to Set
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DocState> & { visitedDocs?: string[]; visitedSections?: string[] };
        return {
          ...current,
          ...p,
          visitedDocs: new Set(p.visitedDocs ?? []),
          visitedSections: new Set(p.visitedSections ?? []),
        };
      },
    }
  )
);
