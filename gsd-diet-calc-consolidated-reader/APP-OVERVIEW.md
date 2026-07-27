# APP SPECIFICATION — gsd-diet-calc Consolidated Reader

> **Document type:** Precision technical specification, optimized for ingestion by an AI Meta harness / super-app merger.
> Every interface, contract, regex, event, storage key, CSS variable, and constant is stated exactly as it exists in the codebase at the time of writing.
> **Consumer:** an autonomous agent (GLM/Claude/Cursor) that will integrate, wrap, or merge this application into a larger GSD-calculator meta-harness.
> **Convention:** `code spans` = exact identifiers / literals / paths. `→` = "produces" or "maps to".

---

## §0. Manifest

| Field | Value |
|---|---|
| App name (metadata) | `gsd-diet-calc — Consolidated Reader` |
| Internal package name | `nextjs_tailwind_shadcn_ts` |
| Version | `0.2.1` |
| Framework | Next.js `16.1.1` (App Router, Turbopack) |
| Runtime | Bun |
| Language | TypeScript 5 (strict) |
| React | `19.0.0` |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Radix UI primitives |
| State | Zustand `5.0.6` (persisted) |
| Markdown | `react-markdown 10.1.0` + `remark-gfm 4.0.1` + `rehype-highlight 7.0.2` |
| Diagrams | `mermaid 11.16.0` (client-rendered) |
| Theme | `next-themes 0.4.6` (4 themes + system) |
| Charts | `recharts 2.15.4` |
| Motion | `framer-motion 12.23.2` |
| Server ORM | Prisma `6.11.1` + `@prisma/client` (installed, **currently unused**) |
| Auth | `next-auth 4.24.11` (installed, **currently unused**) |
| AI SDK | `z-ai-web-dev-sdk 0.0.18` (available, server-only) |
| Dev port | `3000` (only exposed route) |
| Exposed user route | `/` (single route; all else is API or internal dialog) |
| Entry | `src/app/page.tsx` → `<ErrorBoundary label="the documentation reader"><DocReader /></ErrorBoundary>` |
| Root layout | `src/app/layout.tsx` → `<ThemeProvider attribute="class" defaultTheme="light" enableSystem themes={["light","dark","opencode","ergonomic"]} disableTransitionOnChange>` |
| Source-of-truth dir | `/home/z/my-project/consolidated-docs/` (10 `.md` files) |
| Dev log | `/home/z/my-project/dev.log` |
| Agent handover log | `/home/z/my-project/worklog.md` |
| Gateway | `Caddyfile` (single exposed port; `XTransformPort` query param for cross-service) |

---

## §1. System Boundary

### 1.1 What this app IS

A **server-light, client-heavy documentation reader** that turns 10 dense, heavily cross-referenced markdown files (a 4-part audit of a canine-diet LP solver) into a navigable, searchable, themeable, annotatable knowledge base with an interactive bug-dependency graph.

**Inputs (filesystem, read-only):**
- 10 `.md` files in `/home/z/my-project/consolidated-docs/`
- `BUG-DEPENDENCY-MAP.md` is also mined for its `§D` section content (raw reference text shown in the graph dialog)

**Inputs (client, per-user):**
- `localStorage` keys (see §14) for bookmarks, annotations, theme, reading mode, font size, visited docs/sections, sidebar collapse state, panel widths

**Outputs:**
- Rendered HTML at `/` (single page)
- JSON at `/api/docs`, `/api/docs?slug=X`, `/api/dependency-graph`
- No server-side writes anywhere. No database writes (Prisma is wired but unused).

### 1.2 What this app is NOT (hard scope boundary)

1. **NOT a diet calculator.** Zero LP solver code. Zero PuLP/CBC. Zero nutrition computation. The analyzed system (`gsd-diet-calc v10.4.0`) is a *separate Python repo* that this app's documents analyze.
2. **NOT a veterinary tool.** Documents stress: no diet from the analyzed system should be fed until P0 fixes land + DACVN/ECVCN sign-off.
3. **NOT a general markdown viewer.** Hard-coded to the 10 files. Parser, ID registry, glossary, and graph are all tailored to those documents' identifier namespaces.
4. **NOT a CMS.** No authoring UI. Documents are files on disk; re-read on every request in dev.
5. **NOT multi-user.** No auth, no server-side per-user state. All state is per-browser `localStorage`.

### 1.3 Integration surface for a meta-harness

A meta-harness integrating this app has these hookpoints:
- **Embed the route** — mount `/` as a sub-route; the app is self-contained (no cross-route navigation).
- **Read its API** — `GET /api/docs` and `GET /api/dependency-graph` return stable JSON (see §3).
- **Drive it via custom events** — dispatch `graph:open-at-node`, `doc:jump`, `doc:jumpto` on `window` (see §9).
- **Read its state** — `useDocStore.getState()` exposes the full Zustand store (see §7).
- **Extend the docs** — add `.md` files to `consolidated-docs/`; the parser auto-discovers them (order inferred from filename; see §4.3).
- **Extend the graph** — edit `NODE_TABLE` / `EDGE_TABLE` in `src/lib/dependency-graph.ts` (see §5).
- **Extend the bug-facts** — edit `BUG_FACTS` in `src/lib/bug-facts.ts` (see §6).
- **Swap storage** — replace the Zustand `persist` storage adapter (currently `localStorage`) with a server-backed adapter for multi-user sync.

---

## §2. Filesystem Layout (exact)

```
/home/z/my-project/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root: ThemeProvider + Geist fonts + Toaster
│   │   ├── page.tsx                # the one user route → <DocReader/>
│   │   ├── globals.css             # 990 lines; 4 themes in oklch + hljs + animations
│   │   └── api/
│   │       ├── route.ts            # health check
│   │       ├── docs/route.ts       # GET /api/docs[?slug=X]
│   │       └── dependency-graph/route.ts  # GET /api/dependency-graph
│   ├── components/
│   │   ├── docs/
│   │   │   ├── doc-reader.tsx              # ~1673 lines — orchestrator
│   │   │   ├── markdown-renderer.tsx       # ~1050 lines — react-markdown + ID linkify
│   │   │   ├── dependency-graph.tsx        # ~3661 lines — SVG graph dialog
│   │   │   ├── top-bar.tsx                 # ~402 lines
│   │   │   ├── doc-sidebar.tsx             # ~486 lines
│   │   │   ├── search-dialog.tsx
│   │   │   ├── toc-dialog.tsx
│   │   │   ├── comparison-view.tsx
│   │   │   ├── xref-split-view.tsx
│   │   │   ├── audit-checklist.tsx         # ~185 lines
│   │   │   ├── backlinks-panel.tsx
│   │   │   ├── reading-progress.tsx
│   │   │   ├── progress-dialog.tsx
│   │   │   ├── command-palette.tsx
│   │   │   ├── annotations.tsx
│   │   │   ├── mini-toc.tsx
│   │   │   ├── mermaid-diagram.tsx
│   │   │   └── resizable-panels.tsx        # ~495 lines — ResizableAside + useResizable
│   │   ├── ui/                     # shadcn/ui (40+ primitives)
│   │   ├── error-boundary.tsx
│   │   └── theme-provider.tsx
│   ├── lib/
│   │   ├── docs-parser.ts          # server-only markdown parser + ID registry
│   │   ├── dependency-graph.ts     # curated 36-node/32-edge graph data
│   │   ├── doc-store.ts            # Zustand store (persisted)
│   │   ├── api-utils.ts            # rate limiter + slug validator
│   │   ├── bug-facts.ts            # client-safe ID → fact registry (~116 lines)
│   │   ├── annotation-highlights.ts # TreeWalker-based <mark> insertion
│   │   ├── window-globals.ts       # ambient Window augmentation
│   │   ├── db.ts                   # Prisma client (unused)
│   │   └── utils.ts                # cn() class merger
│   └── hooks/
│       ├── use-toast.ts
│       └── use-mobile.ts
├── consolidated-docs/              # THE 10 SOURCE FILES (see §3.1)
├── prisma/schema.prisma            # available, unused
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── Caddyfile
├── worklog.md                      # agent handover log
├── ADVERSARIAL-REVIEW.md           # prior review findings
└── APP-OVERVIEW.md                 # this file
```

---

## §3. API Contract

All routes are `export const dynamic = "force-dynamic"`. All routes call `rateLimit(request)` first (see §15.1).

### 3.1 `GET /api/docs`

**Request:** no params → list view; `?slug=<slug>` → single-file view.

**Slug validation:** `isValidSlug(slug)` = `/^[a-z0-9-]+$/` && `slug.length <= 80`. Rejects path traversal. Invalid → `404 { error: "invalid slug" }`.

**Rate limit:** token-bucket per IP, 60 req/min. Exceeded → `429 { error: "rate limited" }` with header `Retry-After: 60`.

**Response headers (both modes):** `Cache-Control: public, max-age=60, s-maxage=300`

#### 3.1.1 List view (`GET /api/docs`)

Returns `serializeDocs(parsed, includeContent=false)`:

```jsonc
{
  "files": [
    {
      "slug": "part-1-diagnosis-findings-and-as-built-reality",
      "fileName": "PART-1-Diagnosis-Findings-and-As-Built-Reality.md",
      "title": "PART 1 — The System and Its Defects: A Unified Diagnosis",
      "type": "part",            // "part" | "appendix" | "map"
      "order": 1,                // 1..10
      "totalLines": 1486,
      "blurb": "**Subject:** `Hans-GSD-Raw-Calculator`...",
      "sections": [
        { "id": "s14-1-system-purpose-and-scope", "level": 2, "title": "§1. System Purpose and Scope", "lineNumber": 14, "endLine": 43, "children": ["s16-11-the-declared-job", "..."] }
        // NOTE: list view omits "content" — only metadata
      ]
    }
    // ...10 files
  ],
  "ids": [
    ["A3", { "id": "A3", "kind": "finding", "description": undefined, "occurrences": [{ "docSlug": "...", "sectionId": "...", "sectionTitle": "...", "lineNumber": 123, "context": "..." }] }],
    ["B7", { "id": "B7", "kind": "task", ... }],
    // ...every ID across all docs
  ],
  "glossary": [ ["AAFCO", "Association of American Feed Control Officials..."], ... ],
  "generatedAt": "2026-07-25T12:34:56.789Z"
}
```

**Payload size:** ~30KB (metadata only; no `rawMarkdown`, no `section.content`).

#### 3.1.2 Single-file view (`GET /api/docs?slug=X`)

```jsonc
{
  "file": {
    "slug": "...",
    "fileName": "...",
    "title": "...",
    "type": "part",
    "order": 1,
    "totalLines": 1486,
    "blurb": "...",
    "sections": [
      { "id": "...", "level": 2, "title": "...", "lineNumber": 14, "endLine": 43, "children": [...], "content": "..." }
      // NOTE: single-file view INCLUDES "content" (section body markdown)
    ],
    "rawMarkdown": "# PART 1 — ...\n\n..."   // the full file
  },
  "ids": [...]   // same ID registry as list view
}
```

### 3.2 `GET /api/dependency-graph`

**Rate limit + Cache-Control:** same as `/api/docs`.

```jsonc
{
  "nodes": [
    { "id": "G3", "label": "G3 · vet sign-off", "kind": "gate", "severity": null, "description": "Numeric safety values: Ca/P ceilings...", "status": "pending", "x": 140, "y": 100 },
    // ...36 nodes total
  ],
  "edges": [
    { "from": "G3", "to": "B3", "kind": "pending", "label": undefined },
    // ...32 edges total
  ],
  "sectionContent": "## §D. ...",   // raw §D section from BUG-DEPENDENCY-MAP.md
  "generatedAt": "2026-07-25T12:34:56.789Z"
}
```

### 3.3 Health check (`GET /` and `/api`)

`/` returns the rendered HTML SPA. `/api` (route.ts) returns a health-check response.

---

## §4. Parser Specification (`src/lib/docs-parser.ts`)

Server-only. Uses `fs.readFileSync`. Cached via React `cache()` (per-request dedupe) + a 60s TTL cache in production (`parseDocsCached()`).

### 4.1 Core types

```typescript
type DocType = "part" | "appendix" | "map";

interface DocSection {
  id: string;          // "s{lineNumber}-{slugify(title)}"
  level: number;       // 1..4 (heading depth)
  title: string;       // raw heading text (after "# ")
  lineNumber: number;  // 1-based
  endLine: number;     // last line of section content
  content: string;     // markdown body (excludes heading line)
  children: string[];  // ids of direct child sections
}

interface DocFile {
  slug: string;
  fileName: string;
  title: string;       // H1 text, or derived from filename
  type: DocType;
  order: number;       // 1..10
  totalLines: number;
  rawMarkdown: string;
  sections: DocSection[];
  blurb: string;       // first substantive paragraph after H1
}

interface IdOccurrence {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  lineNumber: number;
  context: string;     // ~120 chars surrounding the match
}

interface IdEntry {
  id: string;
  kind: "finding" | "task" | "gate" | "section" | "legacy" | "priority" | "appendix-ref";
  description?: string;
  occurrences: IdOccurrence[];
}

interface ParsedDocs {
  files: DocFile[];
  ids: Map<string, IdEntry>;
  glossary: Map<string, string>;
  generatedAt: string;  // ISO timestamp
}
```

### 4.2 Section parser algorithm (`parseSections`)

1. Split `rawMarkdown` by `\n`.
2. Scan lines for `^(#{1,4})\s+(.*)$` → record `{ line, level, title }`.
3. For each heading `i`, find `endLine`: the line before the next heading `j` where `headingIdx[j].level <= h.level` (or EOF).
4. `content` = `lines.slice(h.line, endLine).join("\n")` (excludes the heading line itself).
5. `id` = `"s" + h.line + "-" + slugify(h.title)`.
6. Populate `children`: for each section `i`, walk forward; section `j` is a direct child if `j.level > i.level` and no intermediate section `k` (`i<k<j`) has `k.level <= i.level`.

`slugify(s)` = `s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)`.

### 4.3 File metadata inference

| Field | Rule |
|---|---|
| `type` | `fileName.startsWith("PART-")` → `part`; `.startsWith("APPENDIX-")` → `appendix`; `.startsWith("BUG-")` → `map`; else `appendix` |
| `order` | `PART-1`→1, `PART-2`→2, `PART-3`→3, `PART-4`→4, `BUG-`→5; appendices: `id-key`→6, `verification`→7, `public-health`→8, `safety-process`→9, `glossary`→10; else 99 |
| `slug` | `fileName.replace(/\.md$/,"").toLowerCase()` (preserves `part-`/`appendix-`/`bug-` prefixes) |
| `title` | first `# ` heading, else filename-derived |
| `blurb` | first non-empty non-`---` line after H1 (first 200 chars); prefers lines starting with `**Role:**` |

### 4.4 ID registry — regex priority table

Patterns tried **in this order** (first match wins on overlap). Each has exactly one capture group for the ID.

| # | Regex | Kind | Example |
|---|---|---|---|
| 1 | `\b(APPENDIX-[A-Z-]+\.md)\b` | `appendix-ref` | `APPENDIX-ID-KEY.md` |
| 2 | `§\s*([A-Z]\.[A-Z][0-9]+[a-z]?\|[0-9]+\.[0-9]+)` | `section` | `§9.1`, `§A.A3` |
| 3 | `\b(R-0[1-9])\b` | `legacy` | `R-04` |
| 4 | `\bTask\s+((?:B(?:[0-9]\|1[0-2])[ab]?\|C(?:[0-9]\|1[0-6])\|R[1-5]))\b` | `task` | `Task B2a` |
| 5 | `\b(G[1-3])\b` | `gate` | `G3` |
| 6 | `\b(P[0-3])\b` | `priority` | `P0` |
| 7 | `\b([ABCE](?:[0-9]\|1[0-9]\|2[0-3])[ab]?)\b` | `finding` | `A3`, `B2b`, `E23` |

**Normalization:** `appendix-ref` IDs have `.md` stripped for the canonical key. All other IDs are stored as-captured.

**Occurrence context:** `lines.slice(i-1, i+2).join(" ").slice(0, 120)` (the matched line ± 1 line, truncated to 120 chars).

### 4.5 Glossary parser (`buildGlossary`)

Reads `APPENDIX-GLOSSARY.md`. Matches table rows `/^\|\s*\*\*([A-Z]+)\*\*\s*\|\s*(.+?)\s*\|/`. Strips `*` and `` ` `` from definitions. Truncates to 200 chars (+`…`). Keyed by uppercase term.

### 4.6 Caching

- `parseDocs = cache(parseDocsInternal)` — React `cache()`, dedupes within a single request.
- `parseDocsCached()`:
  - Dev (`NODE_ENV !== "production"`): always calls `parseDocsInternal()` (live edits).
  - Prod: 60s TTL (`PARSED_TTL_MS = 60_000`). `cachedParsed` + `cachedAt` module-level.
- `invalidateDocsCache()` — clears the TTL cache (for future CMS hooks).

### 4.7 Serialization (`serializeDocs`)

```typescript
serializeDocs(parsed: ParsedDocs, includeContent = false): SerializedDocs
```

- `files[].sections[]`: includes `content` only if `includeContent`.
- `files[].rawMarkdown`: included only if `includeContent`.
- `ids`: `Array.from(parsed.ids.entries())` → `[key, { id, kind, description, occurrences }]`.
- `glossary`: `Array.from(parsed.glossary.entries())`.

---

## §5. Dependency Graph Data (`src/lib/dependency-graph.ts`)

Server-only. **Curated by hand** (not parsed from files), verified against `BUG-DEPENDENCY-MAP.md` §C and §E.4.

### 5.1 Types

```typescript
type NodeKind = "task" | "gate" | "priority";
type Severity = "P0" | "P1" | "P2" | "P3" | null;
type EdgeKind = "blocks" | "pending" | "recommended" | "backstops";

interface GraphNode {
  id: string;          // "B7", "G3", "R5"
  label: string;       // "B7 · canonical namespace"
  kind: NodeKind;
  severity: Severity;
  description: string; // tooltip text
  status?: "pending" | "resolved" | "urgent" | "independent" | null;
  x: number;           // curated layout coordinate
  y: number;
}

interface GraphEdge {
  from: string;        // "from" blocks "to" (from is prerequisite)
  to: string;
  kind: EdgeKind;
  label?: string;
}

interface DependencyGraph {
  nodes: GraphNode[];   // 36 nodes
  edges: GraphEdge[];   // 32 edges
  sectionContent: string;  // raw §D from BUG-DEPENDENCY-MAP.md
  generatedAt: string;
}
```

### 5.2 NODE_TABLE (36 nodes) — semantic lane layout

World bounds: `x ∈ [80, 1500]` (width 1420), `y ∈ [80, 1180]` (height 1100). Aspect ~1.29:1. 6 lanes:

| Lane | x | Nodes |
|---|---|---|
| 1 (pending-gate) | 140 | G3, B3, B4, B2b, C4 |
| 2 (antagonisms/penalty) | 360 | B2a, C1, C3 |
| 3 (B7 hub + children) | 580/800 | B7, B1, B5, B6, B8, B12 |
| 4 (validation cluster) | 800/1020 | C5, C7, C8, C9, C10, C11, C12, C14 |
| 5 (regression suite) | 1240 | R1, R2, R3, R4, R5 |
| 6 (independents) | 1460 | B0, B9, B10, B11, C2, C6, C13, C15, C16 |

Node tuple shape: `[id, label, kind, severity, status, description, x, y]`.

### 5.3 EDGE_TABLE (32 edges) — full list

| from | to | kind | label? |
|---|---|---|---|
| G3 | B3 | pending | |
| G3 | B4 | pending | |
| G3 | B2b | pending | "G3 thresholds" |
| G3 | C4 | pending | |
| B2a | B2b | blocks | |
| B2a | C1 | blocks | |
| B7 | B1 | recommended | "clean min/max source" |
| B7 | B5 | recommended | "recommended" |
| B7 | B6 | recommended | "schema tightening" |
| B7 | B8 | blocks | |
| B7 | B12 | blocks | |
| B7 | C5 | blocks | |
| B1 | B12 | blocks | |
| B8 | C5 | blocks | |
| B6 | C5 | recommended | |
| B5 | C7 | blocks | |
| B5 | C8 | blocks | |
| B5 | C9 | blocks | |
| B5 | C10 | blocks | |
| B5 | C11 | blocks | |
| B5 | C12 | blocks | |
| B5 | C14 | blocks | |
| B6 | C14 | blocks | |
| B0 | B1 | backstops | "detects A3" |
| B0 | B2a | backstops | "detects A2" |
| B0 | B3 | backstops | "detects B2" |
| B0 | B5 | backstops | "detects D1" |
| B0 | B6 | backstops | "detects C1" |
| R1 | R5 | blocks | |
| R2 | R5 | blocks | |
| R3 | R5 | blocks | |
| R4 | R5 | blocks | |
| B11 | B4 | recommended | "informs L1 diagnosis" |
| B11 | C3 | recommended | "informs L1 diagnosis" |

### 5.4 §D section extractor

`extractSectionD(rawMarkdown)`: finds first line matching `/^##\s+§D\./`, slices to next `^##\s+` or EOF. Used for the graph dialog's raw reference panel.

### 5.5 Caching

`parseDependencyGraph = cache(parseDependencyGraphInternal)` — React `cache()`, per-request dedupe. No TTL (data is curated constants + one file read).

---

## §6. Bug-Facts Registry (`src/lib/bug-facts.ts`)

Client-safe (no `fs`). Powers the Quick-Reference Cards in ID popovers.

```typescript
interface BugFact {
  id: string;
  subsystem: string;          // "LP solver" | "Nutrition" | "Data/Schema" | ...
  severity: "P0" | "P1" | "P2" | "P3";
  oneLiner: string;
  repairs: string[];          // IDs this task repairs
  blockedBy: string[];        // IDs that block this task
  onCriticalPath?: boolean;
}

const BUG_FACTS: Record<string, BugFact>;
```

**Lookup:** `getBugFact(id)` — tries `BUG_FACTS[id]`, then `BUG_FACTS[id + "_task"]` (disambiguates finding-namespace vs task-namespace C-series).

**Severity badge CSS:** `severityBadgeClass(severity)`:
- `P0` → `bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-800`
- `P1` → `bg-orange-100 ... orange`
- `P2` → `bg-amber-100 ... amber`
- `P3` → `bg-gray-100 ... gray`

**Registry contents:** ~60 entries covering all P0 findings (A1, A2, A3, A5, A14, B1, B2, B11, C1, C2, C4, D1), all P0 tasks (B0, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B12), P1 tasks (C1–C16), gates (G1, G2, G3), regression (R1–R5), and P1 findings (A4, A6, A7, A8, E1, E3, E4, E6, E7, D2–D8).

---

## §7. State Management (`src/lib/doc-store.ts`)

Single Zustand store with `persist` middleware. SSR-safe (noop storage on server).

### 7.1 Full state shape + actions

```typescript
interface DocState {
  // --- transient (not persisted) ---
  files: DocFileMeta[];
  ids: Record<string, IdIndexEntry>;
  glossary: Record<string, string>;
  activeSlug: string | null;
  activeSectionId: string | null;
  loading: boolean;
  error: string | null;
  theme: "light" | "dark";              // legacy; superseded by next-themes
  sidebarOpen: boolean;                 // mobile
  activeIdPopover: string | null;
  xrefDestination: XrefDestination | null;

  // --- persisted (via partialize) ---
  visitedDocs: Set<string>;
  visitedSections: Set<string>;
  bookmarks: BookmarkEntry[];
  recentlyViewed: RecentlyViewedEntry[];
  readingMode: ReadingMode;
  fontSize: number;

  // --- actions ---
  setFiles(files: DocFileMeta[]): void;
  setIds(ids: Record<string, IdIndexEntry>): void;
  setGlossary(g: Record<string, string>): void;
  setActiveSlug(slug: string): void;          // also adds to visitedDocs, resets activeSectionId
  setActiveSectionId(id: string | null): void; // equality-guarded; tracks recentlyViewed
  setLoading(b: boolean): void;
  setError(e: string | null): void;
  setTheme(t: "light" | "dark"): void;
  toggleSidebar(): void;
  setSidebarOpen(b: boolean): void;
  setActiveIdPopover(id: string | null): void;
  markDocVisited(slug: string): void;
  toggleBookmark(entry: Omit<BookmarkEntry, "addedAt">): void;  // max 50
  isBookmarked(docSlug, sectionId): boolean;
  removeBookmark(docSlug, sectionId): void;
  trackRecentView(entry: Omit<RecentlyViewedEntry, "viewedAt">): void;  // max 8, dedup
  clearRecentViews(): void;
  setReadingMode(mode: ReadingMode): void;
  setXrefDestination(dest: XrefDestination | null): void;
  addVisitedSection(sectionId: string): void;  // equality-guarded
  setFontSize(size: number): void;
}
```

### 7.2 Supporting types

```typescript
type ReadingMode = "linear" | "xref" | "focus" | "audit";

interface DocFileMeta {
  slug: string; fileName: string; title: string;
  type: "part" | "appendix" | "map"; order: number;
  totalLines: number; blurb: string;
  sections: { id: string; level: number; title: string; lineNumber: number; endLine: number; children: string[] }[];
}

interface IdIndexEntry {
  id: string;
  kind: "finding" | "task" | "gate" | "section" | "legacy" | "priority" | "appendix-ref";
  occurrences: { docSlug: string; sectionId: string; sectionTitle: string; lineNumber: number; context: string }[];
}

interface BookmarkEntry { docSlug: string; sectionId: string; sectionTitle: string; docTitle: string; addedAt: number; }
interface RecentlyViewedEntry { docSlug: string; sectionId: string; sectionTitle: string; docTitle: string; viewedAt: number; }
interface XrefDestination { docSlug: string; sectionId: string; }
```

### 7.3 Persistence config

```typescript
persist(/* ... */, {
  name: "gsd-doc-reader-storage",
  storage: createJSONStorage(() => typeof window === "undefined" ? noopStorage : window.localStorage),
  partialize: (state) => ({
    bookmarks: state.bookmarks,
    recentlyViewed: state.recentlyViewed,
    visitedDocs: Array.from(state.visitedDocs),
    visitedSections: Array.from(state.visitedSections),
    theme: state.theme,
    readingMode: state.readingMode,
    fontSize: state.fontSize,
  }),
  merge: (persisted, current) => ({
    ...current, ...persisted,
    visitedDocs: new Set(p.visitedDocs ?? []),
    visitedSections: new Set(p.visitedSections ?? []),
  }),
})
```

### 7.4 Equality guards (performance-critical)

- `setActiveSectionId(id)`: `if (get().activeSectionId === id) return;` — prevents redundant re-renders from IntersectionObserver firing on the same section.
- `addVisitedSection(id)`: `if (s.visitedSections.has(id)) return s;` — avoids new Set allocation.
- `trackRecentView`: dedups by `(docSlug, sectionId)`; caps at 8.
- `toggleBookmark`: caps at 50.

### 7.5 Cross-component navigation signals

```typescript
export function signalDocJump(): void      // dispatches window event "doc:jump" (no payload)
export function signalDocJumpTo(sectionId: string): void  // dispatches "doc:jumpto" with { detail: { sectionId } }
```

---

## §8. Custom Event Bus (window events)

All events dispatched on `window`. Listeners are in `DocReader`, `MarkdownRenderer`, `annotation-highlights`, `DependencyGraphDialog`.

| Event name | Payload (`detail`) | Dispatcher | Listener(s) | Purpose |
|---|---|---|---|---|
| `doc:jump` | none | `signalDocJump()` | DocReader (sets jump-pending flag) | Signal an upcoming navigation |
| `doc:jumpto` | `{ sectionId: string }` | `signalDocJumpTo(id)` | DocReader (flash heading), annotation-highlights (re-apply marks after re-render) | Carry the actual jump target |
| `graph:open-at-node` | `{ id: string }` | `IdLink` popover "View in dependency graph" button | `DependencyGraphDialog` (centers graph on node) | Open graph focused on a node |
| `annotations-updated` | none | `saveAnnotations()`, `updateAnnotation()`, `deleteAnnotation()` | `useAnnotationCount`, `useAnnotationHighlights` | Notify store changed |
| `annotation-clicked` | `{ id: string }` | `<mark>` click handler in `useAnnotationHighlights` | DocReader (opens annotations panel) | User clicked a highlight |
| `hashchange` | (native) | browser | DocReader (back/forward nav) | URL hash routing |
| `storage` | (native) | browser (cross-tab) | `useAnnotationCount`, `useAnnotationHighlights` | Cross-tab sync |

### 8.1 Window globals (`src/lib/window-globals.ts`)

Ambient augmentation of `Window`:

```typescript
interface WindowGlobals {
  __pendingHashSection?: string | null;            // pending section to scroll to after doc swap
  __currentVisibleSectionId?: string | null;       // mirrors Zustand activeSectionId
  __scrollSpyObserver?: IntersectionObserver | null;
  __depGraphRetry?: ReturnType<typeof setTimeout> | null;
  __depGraphCleanup?: (() => void) | null;
}
```

---

## §9. Keyboard Shortcut Contract

Single `keydown` listener on `window` (in `DocReader`). **Guard:** all single-letter shortcuts are suppressed when `document.activeElement` is `INPUT`, `TEXTAREA`, `SELECT`, `BUTTON`, `A`, or `isContentEditable` (the `isInteractiveTarget()` check). Modal-suppression: most shortcuts also skip if any dialog is open.

| Key | Action | Guards |
|---|---|---|
| `Cmd/Ctrl+K` | Open Search | always (preventDefault) |
| `Cmd/Ctrl+P` | Open Command Palette | always (preventDefault) |
| `?` | Toggle shortcuts dialog | skip if interactive target |
| `f` | Toggle Focus mode (`linear` ↔ `focus`) | skip if interactive; skip if any dialog open |
| `p` | Toggle Progress dialog | skip if interactive; skip if search/shortcuts/graph/toc open |
| `g` | Open Dependency Graph | skip if interactive; skip if search/shortcuts/toc/progress/comparison open |
| `v` | Open Comparison view | skip if interactive (unless focus is inside a closing dialog); skip if any dialog open |
| `n` | Toggle Annotations panel | skip if interactive; skip if any dialog open |
| `t` | Open TOC dialog | skip if interactive; skip if search/shortcuts/graph/progress open |
| `b` | Bookmark current section | skip if interactive; skip if any dialog open; requires `activeSlug` + `activeSectionId` |
| `j` | Next heading (scroll) | always (preventDefault) |
| `k` | Previous heading (scroll) | always (preventDefault) |
| `ArrowLeft` | Previous document | skip if interactive; skip if any dialog open |
| `ArrowRight` | Next document | skip if interactive; skip if any dialog open |

**`j`/`k` implementation:** queries `document.querySelectorAll("[data-heading-id]")`, finds current heading via `[data-radix-scroll-area-viewport]` scrollTop, scrolls next/prev into view with `behavior:"smooth", block:"start"`.

---

## §10. localStorage Key Registry

| Key | Type | Owner | Purpose |
|---|---|---|---|
| `gsd-doc-reader-storage` | JSON | Zustand `persist` | bookmarks, recentlyViewed, visitedDocs, visitedSections, theme, readingMode, fontSize |
| `gsd-doc-annotations` | JSON array | `annotation-highlights.ts` | All user annotations (`Annotation[]`) |
| `doc-sidebar-collapsed-groups` | JSON array | `doc-sidebar.tsx` | Which sidebar groups (part/map/appendix) are collapsed |
| `sidebar-w` (or similar, per `storageKey` prop) | string number | `resizable-panels.tsx` | Left sidebar width (px) |
| `right-panel-w` (per `storageKey` prop) | string number | `resizable-panels.tsx` | Right panel width (px) |

**Annotation shape:**
```typescript
interface Annotation {
  id: string;
  docSlug: string;
  text: string;          // the highlighted text (min 3 chars to apply)
  note: string;
  color: "yellow" | "rose" | "emerald" | "sky" | "violet";
  createdAt: number;
}
```

---

## §11. Theme System

### 11.1 Themes

4 themes + system, via `next-themes`. Applied as `class` on `<html>`.

| Theme | Class | Base | Vibe |
|---|---|---|---|
| Light | (default, `:root`) | light | bright, high-contrast |
| Dark | `.dark` | dark | low-glare |
| OpenCode | `.opencode` | dark (also gets `.dark`) | terminal / Claude-Code aesthetic; warm charcoal + Anthropic terracotta |
| Ergonomic | `.ergonomic` | light | warm sepia, science-tuned, serif body |
| System | follows OS | — | `prefers-color-scheme` |

### 11.2 CSS variable contract (oklch)

All themes define the same set of CSS variables. Values below are the **exact** oklch literals from `globals.css`.

| Variable | Light (`:root`) | Dark (`.dark`) | OpenCode (`.opencode`) | Ergonomic (`.ergonomic`) |
|---|---|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` | `oklch(0.17 0.004 70)` | `oklch(0.95 0.014 85)` |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | `oklch(0.91 0.008 80)` | `oklch(0.30 0.012 55)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | `oklch(0.20 0.005 70)` | `oklch(0.96 0.012 85)` |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | `oklch(0.68 0.14 55)` | `oklch(0.45 0.06 50)` |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | `oklch(0.23 0.005 70)` | `oklch(0.92 0.012 85)` |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | `oklch(0.28 0.006 70)` | `oklch(0.88 0.014 80)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | `oklch(0.65 0.20 25)` | `oklch(0.52 0.16 30)` |
| `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` | `oklch(0.68 0.14 55)` | `oklch(0.45 0.06 50)` |
| `--radius` | `0.625rem` | (inherited) | (inherited) | (inherited) |
| `--chart-1` | `oklch(0.646 0.222 41.116)` | `oklch(0.488 0.243 264.376)` | `oklch(0.68 0.14 55)` | `oklch(0.50 0.10 45)` |

(Plus `--popover`, `--accent`, `--secondary`, `--muted-foreground`, `--input`, `--sidebar*`, `--chart-2..5` — all defined per theme.)

### 11.3 Tailwind variant wiring

```css
@custom-variant dark (&:is(.dark *, .opencode *));
```
Makes Tailwind's `dark:` apply to both `.dark` and `.opencode` (both are dark backgrounds). `.ergonomic` does NOT get `.dark`.

### 11.4 Theme-specific typography

- **Ergonomic `.prose`:** `font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, serif; font-size: 1.02em; line-height: 1.78; letter-spacing: 0.002em`. Headings: Georgia. Paragraphs: `line-height: 1.8; hyphens: auto`.
- **OpenCode:** `font-family: var(--font-geist-sans), ui-monospace, "SF Mono", "Cascadia Code", monospace`. Subtle terminal texture via `body::before` radial-gradient dots (3px grid, 1.8% opacity). Code blocks: `font-feature-settings: "calt" 1, "liga" 0`.

### 11.5 Selection colors

```css
::selection { background: oklch(0.68 0.14 55 / 0.28); }
.dark ::selection, .opencode ::selection { background: oklch(0.68 0.14 55 / 0.35); }
.ergonomic ::selection { background: oklch(0.45 0.10 50 / 0.25); }
.prose ::selection { background: oklch(0.80 0.15 90 / 0.55); }  /* highlighter feel */
```

### 11.6 highlight.js theme

GitHub-light base in light mode; overridden under `.dark` for dark/github-dark colors. Defined inline in `globals.css` (not a separate stylesheet).

---

## §12. Component Contract

### 12.1 `DocReader` (`src/components/docs/doc-reader.tsx`, ~1673 lines)

**Role:** Top-level orchestrator. Owns layout, mode switching, all dialog open-state, scroll-spy, keyboard shortcuts, hash routing, fetch orchestration.

**Props:** none.

**Local state (useState):**
```typescript
fullFile: FullFile | null           // the currently-loaded full doc (with rawMarkdown)
fileLoading: boolean
searchOpen: boolean
showShortcuts: boolean
readProgress: number                // 0..1
graphOpen: boolean
graphFocusNode: string | null       // node to center when graph opens
tocOpen: boolean
progressOpen: boolean
comparisonOpen: boolean
commandPaletteOpen: boolean
annotationsOpen: boolean
depGraphSectionVisible: boolean
showBackToTop: boolean
jumpHighlightId: string | null      // heading to flash after a jump
hiddenSeverities: Set<string>
mobileRightPanelOpen: boolean
```

**Effects:**
1. Initial fetch: `GET /api/docs` → `setFiles`, `setIds`, `setGlossary`. Picks initial slug from URL hash → bug-map → first file. Sets `window.__pendingHashSection` if hash has `:section`.
2. Hash navigation: `hashchange` listener; `#slug:section` format.
3. File fetch: when `activeSlug` changes → `GET /api/docs?slug=X` → `setFullFile`.
4. Scroll-spy: `IntersectionObserver` on `[data-heading-id]` elements → `setActiveSectionId`.
5. Reading progress: rAF-throttled scroll handler → `setReadProgress`.
6. Keyboard shortcuts: single `keydown` listener (see §9).
7. Annotation-clicked listener → opens annotations panel.

**Layout structure (simplified):**
```
<div min-h-screen flex flex-col>
  <ReadingProgressBar />                  // top, sticky
  <TopBar />                              // sticky
  <div flex flex-1>
    <ResizableAside side="left" hidden={focusMode}>  // sidebar
      <DocSidebar />
    </ResizableAside>
    <main flex-1>
      <Breadcrumb />
      <ScrollArea>                        // data-radix-scroll-area-viewport
        <MarkdownRenderer content={strippedMarkdown} highlightId={jumpHighlightId} />
      </ScrollArea>
      <Footer />                          // sticky bottom: prev/next + progress
    </main>
    <ResizableAside side="right" hidden={focusMode || xrefDestination==null}>
      {readingMode === "xref" ? <XrefSplitView /> :
       readingMode === "audit" ? <AuditChecklist /> :
       <BacklinksPanel />}
    </ResizableAside>
  </div>
  <Sheet (mobile sidebar)>...
  {dialogs: Search, Graph, TOC, Progress, Comparison, CommandPalette, Annotations, Shortcuts}
</div>
```

**`stripFirstH1(md)`:** removes the first `^#\s+` line + trailing blank lines so the rendered content doesn't duplicate the page header.

### 12.2 `MarkdownRenderer` (`src/components/docs/markdown-renderer.tsx`, ~1050 lines)

**Role:** Renders markdown with ID linkification, glossary tooltips, severity coloring, Mermaid diagrams, code copy buttons, heading anchors, jump highlighting.

**Props:**
```typescript
interface MarkdownRendererProps {
  content: string;        // markdown (H1 already stripped)
  highlightId?: string | null;  // heading id to flash
}
```

**Wrapped in `React.memo`** with comparator: `(prev, next) => prev.content === next.content && prev.highlightId === next.highlightId`.

**ID linkification pipeline (client-side, mirrors server parser §4.4):**

`ID_MATCHERS` array (same 7 patterns, same order). `tokenize(text)`:
1. Find all matches across all patterns (adjust `start` for `Task ` prefix matches).
2. Sort by `start`, drop overlaps (keep earliest, `lastEnd` tracking).
3. Build tokens: `{ type: "text" | "id" | "glossary", value, kind? }`.
4. Second pass `applyGlossary(tokens)`: scan text tokens for glossary terms (`\b(term1|term2|...)\b`, longest-first), split into glossary tokens.

**`<IdLink id kind>`:** 
- For `appendix-ref`: renders a plain button that calls `setActiveSlug(targetSlug)` (target = `id.replace(/\.md$/,"").toLowerCase()`).
- For `priority` (`P0`/`P1`/`P2`/`P3`): always sets `data-priority={id}` attribute (used by severity coloring).
- Otherwise: `<Popover>` with `<PopoverTrigger asChild><button>`. Popover content:
  - **Quick-Reference Card** (if `getBugFact(id)` exists): id, kind badge, severity badge, subsystem badge, critical-path badge, `oneLiner`, `blockedBy` list, `repairs` list (max 4 + "+N more"), occurrence count.
  - **Occurrences list:** `<ScrollArea className="h-48">` of clickable buttons → each calls `signalDocJump()` + `setActiveSlug(occ.docSlug)` + 250ms-delayed `scrollIntoView` + `signalDocJumpTo(occ.sectionId)`. In `xref` mode: calls `setXrefDestination({ docSlug, sectionId })` instead.
  - **"View in dependency graph"** button (if `isGraphNodeId(id)`): dispatches `graph:open-at-node` event.

**`isGraphNodeId(id)`:** `/^(B(?:0|[1-9]|1[0-2])[ab]?|C(?:[1-9]|1[0-6])|R[1-5]|G3)$/`

**`<GlossaryTooltip term>`:** `<Tooltip>` (300ms delay) showing term + definition + "View in glossary →" (calls `setActiveSlug("appendix-glossary")`).

**`<LangAwareText text>`:** F-13 a11y. Wraps words containing Portuguese chars (`[ãõéçáíóúâêôÃÕÉÇÁÍÓÚÂÊÔà]`) in `<span lang="pt-BR">` for screen readers.

**`useSeverityRowColors(content)`:** post-render DOM scan. Finds `[data-priority]` elements, applies severity classes to parent `<tr>` + colored left border on first `<td>`. Also scans plain-text `P0`/`P1`/`P2`/`P3` in `<td>` as fallback. Re-runs on content change.

**Severity → class map:**
| Priority | bg | darkBg | border-l |
|---|---|---|---|
| P0 | `bg-rose-50/80` | `dark:bg-rose-950/30` | `border-l-rose-500` |
| P1 | `bg-orange-50/60` | `dark:bg-orange-950/20` | `border-l-orange-500` |
| P2 | `bg-yellow-50/40` | `dark:bg-yellow-950/15` | `border-l-yellow-500` |
| P3 | `bg-gray-50/40` | `dark:bg-gray-950/15` | `border-l-gray-400` |

### 12.3 `DependencyGraphDialog` (`src/components/docs/dependency-graph.tsx`, ~3661 lines)

**Role:** Full-screen SVG canvas. 36 nodes, 32 edges. The most complex single component.

**Props:** `open: boolean`, `onOpenChange`, `focusNode?: string | null` (centers graph on this node when opened).

**Features (exact, from header comment):**
1. Semantic zoom: `<0.5×` = hub-only skeleton; `0.5–0.8×` = all nodes, no edge labels; `≥0.8×` = full detail. Edge labels also on hover.
2. Smooth pan (drag background, momentum-decayed) + cursor-anchored wheel zoom, clamp `[0.3, 3]`.
3. Deterministic force-directed layout: pure-TS O(n²) charge + spring + centering + circle-circle collision. Seeded by curated `NODE_TABLE` positions. Cached at module level (runs once per data-shape).
4. Curved cubic-bezier edges with radial fan-out at hubs. Variable stroke width by edge kind. Edge-bundling-lite for collapsed clusters.
5. Collapsible cluster mega-nodes (7 lanes from curated x positions). Click mega-node → expand; click lane badge → collapse.
6. Hub visual weighting: degree badge (top-right), thicker border for hubs (≥4 edges), outer glow for mega-hubs (≥6 edges).
7. Adaptive readability: collision detection in sim; descriptions hidden `<0.6×`; degree badges hidden `<0.6×`; edge labels in pills only on hover or `≥0.8×`.
8. Mini-map (bottom-right) with viewport rect + click-to-pan.
9. Search + severity/status toggle chips (highlight matches, dim others).
10. `React.memo` on `NodeView`/`EdgeView`/`MegaNodeView`. Layout + degree maps memoized.

**Additional QoL features:**
- Hover-dimming of non-related nodes/edges
- BFS shortest-path between any two nodes (visual highlight)
- Node drag (edges follow)
- Right-click context menu (jump to doc, find path from here, highlight critical path)
- Effects toggle (edge particle flow via SVG `<animateMotion>`); respects `prefers-reduced-motion`
- Critical-path highlighting
- `graph:open-at-node` event listener → centers on node
- Edge-label visibility toggle
- Fit-to-view reset

**Listens for:** `graph:open-at-node` `{ detail: { id } }`.

### 12.4 `TopBar` (`src/components/docs/top-bar.tsx`, ~402 lines)

**Props:** `onOpenSearch, onOpenGraph, onOpenToc, onOpenProgress, onOpenComparison, onOpenAnnotations, onOpenShortcuts` (all `() => void`).

**Contains:**
- Mobile hamburger (`toggleSidebar`)
- Logo + "gsd-diet-calc / Consolidated Reader · v10.4.0"
- Document tabs: Part 1–4 buttons (rose underline), Bug Map button (amber underline), Appendices dropdown
- Reading mode dropdown (4 modes, each with icon + label + desc)
- Font size dropdown (13/14/16/18px)
- Stats badges (hidden in focus mode): `{findingsCount} findings`, `{p0Mentions} P0 refs`, `{tasksCount} tasks` — all clickable → open bug map
- Tool cluster: Progress (`p`), TOC (`t`), Graph (`g`), Comparison (`v`), Annotations (`n` with count badge)
- Search button (with `⌘K` kbd hint)
- Shortcuts button (`?`)
- Bookmarks count badge
- Theme dropdown (5 options: Light/Dark/OpenCode/Ergonomic/System)

### 12.5 `DocSidebar` (`src/components/docs/doc-sidebar.tsx`, ~486 lines)

**Role:** File tree grouped by type (Parts / Bug Map / Appendices) in `Collapsible`s. Bookmarks + Recently Viewed panels. Mini stats card.

**Collapse persistence:** `localStorage["doc-sidebar-collapsed-groups"]` = `GroupKey[]` where `GroupKey = "part" | "map" | "appendix"`.

**Group accents:** part=`border-rose-500`, map=`border-amber-500`, appendix=`border-sky-500`.

### 12.6 Other components (file + role)

| Component | File | Role |
|---|---|---|
| `SearchDialog` | `search-dialog.tsx` | Full-text search across all 10 docs |
| `TocDialog` | `toc-dialog.tsx` | Active doc's table of contents (modal) |
| `ComparisonViewDialog` | `comparison-view.tsx` | Side-by-side diff of any two docs |
| `XrefSplitView` | `xref-split-view.tsx` | Split pane for xref mode |
| `AuditChecklist` | `audit-checklist.tsx` (~185 lines) | ID checklist for audit mode; colored underlines |
| `BacklinksPanel` | `backlinks-panel.tsx` | Sections linking to active section |
| `ReadingProgressBar` | `reading-progress.tsx` | Top progress bar |
| `ProgressDialog` | `progress-dialog.tsx` | Visited docs/sections, reading-time, bookmarks |
| `CommandPalette` | `command-palette.tsx` | `Cmd/Ctrl+K`/`Cmd/Ctrl+P` palette |
| `AnnotationsPanel` + `SelectionToolbar` | `annotations.tsx` | User highlights/notes CRUD |
| `MiniToc` | `mini-toc.tsx` | Compact in-page TOC |
| `MermaidDiagram` | `mermaid-diagram.tsx` | Client-side Mermaid rendering |
| `ResizableAside` + `useResizable` + `ResizeHandle` | `resizable-panels.tsx` (~495 lines) | Drag-to-resize panel system |
| `ErrorBoundary` | `error-boundary.tsx` | Catches render errors |

### 12.7 `ResizableAside` API (`src/components/docs/resizable-panels.tsx`)

```typescript
interface ResizableAsideProps {
  side: "left" | "right";
  initialWidth: number;
  minWidth?: number;          // default 200
  maxWidth?: number;          // default 600
  storageKey: string;
  hidden?: boolean;           // hide entirely (e.g., focus mode)
  hiddenOnMobile?: boolean;   // CSS `hidden md:flex`
  className?: string;
  children: React.ReactNode;
}
```

**`useResizable` hook behavior:**
- Pointer-capture-based drag; `requestAnimationFrame`-throttled `pointermove` for 60fps.
- `clampWidth(w) = Math.max(minWidth, Math.min(Math.min(maxWidth, innerWidth * maxViewportFraction), w))` where `maxViewportFraction` default `0.5`.
- Persists width to `localStorage[storageKey]` (150ms debounce).
- Double-click handle → reset to `initialWidth`.
- Keyboard: `ArrowLeft`/`ArrowRight` = ±8px; `Shift+Arrow` = ±32px; `Home` = reset.
- Visual states: idle (1px), hover (4px gradient + col-resize cursor), drag (8px solid + glow + grabbing + "Resize me" tooltip).
- 16px-wide invisible hit area for touch.
- Body-level `cursor: col-resize` + `user-select: none` during drag.
- Recomputes clamp on window resize.

---

## §13. Annotation System (`src/lib/annotation-highlights.ts`)

**Storage:** `localStorage["gsd-doc-annotations"]` = `Annotation[]` JSON.

**Mark attributes:** `data-ann-id={id}`, `data-ann-color={color}`, `class="annotation-highlight"`.

**Color styles (light):**
| Color | Background | Border-bottom |
|---|---|---|
| yellow | `rgba(250, 204, 21, 0.45)` | `rgba(202, 138, 4, 0.6)` |
| rose | `rgba(244, 63, 94, 0.30)` | `rgba(225, 29, 72, 0.7)` |
| emerald | `rgba(16, 185, 129, 0.30)` | `rgba(5, 150, 105, 0.7)` |
| sky | `rgba(14, 165, 233, 0.30)` | `rgba(2, 132, 199, 0.7)` |
| violet | `rgba(139, 92, 246, 0.30)` | `rgba(124, 58, 237, 0.7)` |

Dark variants use 0.22 alpha backgrounds + 0.55 borders.

**Highlight algorithm (`highlightInNode`):**
1. `document.createTreeWalker(root, NodeFilter.SHOW_TEXT, ...)`.
2. `acceptNode`: REJECT if parent is `mark`/`script`/`style`/`code`/`pre` or has `data-ann-id`; ACCEPT if `nodeValue.includes(needle)` (needle min length 3).
3. Collect all match indices per text node.
4. For each: `document.createRange()`, `range.setStart`/`setEnd`, create `<mark>`, set attributes + inline style, `range.surroundContents(mark)`. Catches exceptions (range crossing element boundaries).

**`useAnnotationHighlights(docSlug)` hook:**
- Returns `count` of applied annotations.
- Applies marks to `[data-doc-content]` container, 250ms after doc change.
- Re-applies on: `annotations-updated` event, `storage` event (cross-tab), `documentElement` class mutation (theme change), `doc:jumpto`/`doc:jump` events (300ms delay — React re-render may wipe marks).
- Click handler on marks → dispatches `annotation-clicked` event.

**API:**
```typescript
loadAnnotations(): Annotation[]
saveAnnotations(anns): void          // also dispatches "annotations-updated"
getAllAnnotations(): Annotation[]
getAnnotation(id): Annotation | undefined
updateAnnotation(id, updates): void
deleteAnnotation(id): void
getAnnotationCount(): number
useAnnotationCount(): number         // reactive hook
useAnnotationHighlights(docSlug): number  // reactive hook
```

---

## §14. Security & Robustness

### 14.1 Rate limiter (`src/lib/api-utils.ts`)

Token-bucket per client IP. In-memory `Map<string, Bucket>`.

| Param | Value |
|---|---|
| Window | `60_000` ms (1 min) |
| Capacity | `60` requests/window/IP |
| Refill | proportional to elapsed time |
| Eviction | buckets idle > `WINDOW_MS * 5` (5 min) evicted every `WINDOW_MS * 2` (2 min); `setInterval(...).unref?.()` |

`getClientIp(request)`: `x-forwarded-for` first IP → `x-real-ip` → `"unknown"`.

`rateLimit(request, capacity=60)`: returns `false` when bucket empty (→ `429` with `Retry-After: 60`).

### 14.2 Slug validation

`isValidSlug(slug)`: `/^[a-z0-9-]+$/` && `length <= 80`. Rejects path traversal, uppercase, special chars, over-long.

### 14.3 HTML sanitization

`react-markdown` does not render raw HTML by default (safe-by-default). `dompurify 3.4.12` installed and available.

### 14.4 Error boundary

`src/components/error-boundary.tsx` wraps `<DocReader>`. Render errors in any sub-component show a fallback UI (not a white screen).

### 14.5 SSR-safe persistence

Zustand `persist` storage: `typeof window === "undefined"` → noop storage (`getItem: () => null`, `setItem: () => {}`). No hydration mismatches.

### 14.6 Hydration

`<html lang="en" suppressHydrationWarning>` — `next-themes` sets class on client; suppresses server/client mismatch warning.

### 14.7 Cache headers

All API responses: `Cache-Control: public, max-age=60, s-maxage=300` (60s browser, 5min edge).

### 14.8 Server cache

`parseDocsCached()`: 60s TTL in production; no cache in dev (`force-dynamic`).

---

## §15. Performance Budgets & Optimizations

### 15.1 Rendering

- `MarkdownRenderer`: `React.memo` with comparator `(prev, next) => prev.content === next.content && prev.highlightId === next.highlightId`. Only re-renders when doc or jump target changes.
- `NodeView`/`EdgeView`/`MegaNodeView` (graph): `React.memo`.
- `useMemo`: `strippedMarkdown` (H1 stripping), graph layout, degree maps, force-directed sim result (module-level cache — runs once per data-shape).

### 15.2 Scroll

- `requestAnimationFrame` throttle on scroll handler — max one invocation per frame.
- Delta guards — skip if scroll position unchanged.
- `IntersectionObserver` for scroll-spy (browser-native, not a scroll-position calculator).

### 15.3 State

- Zustand equality guards on `setActiveSectionId` (hottest path) and `addVisitedSection`.
- `partialize` — only 7 fields persist to localStorage; transient state stays in memory.

### 15.4 Network

- List view: metadata only (~30KB vs ~400KB with content).
- Single-file view: `rawMarkdown` only for requested file.
- `Cache-Control: public, max-age=60, s-maxage=300`.
- Server: 60s TTL cache (prod), `force-dynamic` (dev).

### 15.5 Graph

- SVG `<animateMotion>` for edge particle flow (GPU-friendly, declarative) — not JS `requestAnimationFrame`.
- `prefers-reduced-motion` disables animations.
- Semantic zoom collapses detail (`<0.5×` skeleton, `<0.8×` no edge labels).

### 15.6 Observed latencies (from dev.log)

- `GET /` : 30–62ms
- `GET /api/docs` : 30–157ms
- `GET /api/docs?slug=X` : 28–168ms
- `GET /api/dependency-graph` : 4–10ms

---

## §16. ID Cross-Reference Resolution Algorithm (exact)

When the user clicks an ID token (e.g. `B7`) in rendered prose:

1. **Tokenization** (at render time): `tokenize(paragraphText)` has split the text. `B7` matched by `\b([ABCE](?:[0-9]|1[0-9]|2[0-3])[ab]?)\b` → token `{ type: "id", value: "B7", kind: "finding" }`.

2. **Render**: `<IdLink id="B7" kind="finding">` renders a `<Popover>` with a `<button>` trigger. `kindColor("finding")` = `text-rose-700 ... bg-rose-50/70 ... ring-rose-200/60`. `data-priority` unset (not a priority tag).

3. **`isGraphNodeId("B7")`** = `true` → "View in dependency graph" button will show.

4. **Popover open**: 
   - `getBugFact("B7")` → returns the B7 task fact (oneLiner, severity P0, repairs, blockedBy, onCriticalPath).
   - Renders Quick-Reference Card header + occurrences list (`entry.occurrences`, each with `docSlug:lineNumber`, `sectionTitle`, `context`).

5. **Occurrence click**:
   - If `readingMode === "xref"`: `setXrefDestination({ docSlug, sectionId })` → split pane opens.
   - Else: `signalDocJump()` + `setActiveSlug(occ.docSlug)` (triggers file fetch if needed) + 250ms timeout → `document.getElementById(occ.sectionId).scrollIntoView({behavior:"smooth",block:"start"})` + `signalDocJumpTo(occ.sectionId)`.

6. **Jump highlight**: DocReader listens for `doc:jumpto`, sets `jumpHighlightId = sectionId`, passes to `MarkdownRenderer` as `highlightId` prop. The matching heading (`[data-heading-id={id}]`) gets a CSS flash animation (`.quick-jump-flash`, 1200ms).

7. **"View in graph" click**: `window.dispatchEvent(new CustomEvent("graph:open-at-node", { detail: { id: "B7" } }))`. `DependencyGraphDialog` listener centers the graph on B7.

### 16.1 Backlinks (reverse cross-reference)

`BacklinksPanel` (right panel, Linear mode) queries the ID registry for every ID that appears in the active section, then finds all *other* sections whose `content` references those IDs. Renders clickable links back.

---

## §17. Subject Matter Context (for the meta-harness)

The 10 documents analyze a **separate Python project**: `Hans-GSD-Raw-Calculator` (`gsd-diet-calc v10.4.0`).

### 17.1 The analyzed system

- **Purpose:** formulate a raw canine diet (grams/ingredient) meeting AAFCO Large Breed Growth profile for German Shepherds, with SUL compliance, mineral-antagonism ratio compliance, energy-target compliance, and a `SAFE_TO_FEED`/`FEED_WITH_CAUTION`/`DO_NOT_FEED` recommendation.
- **Engine:** 3-level preemptive/lexicographic goal-programming cascade on PuLP 3.3.2 / CBC (`timeLimit=30`, `gapRel=0.01`, `randomSeed=12345`). Level 1 (all hard) → Level 2 (adequacy relaxed) → Level 3 (SULs relaxed, diagnostic).
- **Scale:** 63 Python files (~22.3k LOC, 5,881 in `src/gsd/`), 34 JSON files, 4 JSON Schemas, 191 tests.
- **Verdict:** pre-alpha; no diet should be fed until P0 fixes + DACVN/ECVCN sign-off.

### 17.2 The safety triad (A2 + A3 + B2)

- **A2**: 5 mineral-antagonism constraints declared `HARD_FAIL_INFEASIBLE` but soft at every cascade level.
- **A3** (=E1, =R4): `nutrient_results` hardcoded `"adequate"` with `pct_of_min: None`.
- **B2**: no absolute calcium maximum.

**One-sentence verdict (Part 3):** *"Today the system can return `SAFE_TO_FEED` for a diet with a Ca:Mg ratio 631% out of range, with no way for the user to perceive this."*

### 17.3 The 10 source documents

| # | File | Type | Order | Role |
|---|---|---|---|---|
| 1 | `PART-1-Diagnosis-Findings-and-As-Built-Reality.md` | part | 1 | Diagnosis: what's broken + as-built code reality (~1486 lines) |
| 2 | `PART-2-The-Fix-Remediation-Plan-and-Roadmap.md` | part | 2 | Treatment: sequenced remediation program (~974 lines) |
| 3 | `PART-3-Synthesis-Unified-Verified-Project-Map.md` | part | 3 | Synthesis: verified bottom line (~356 lines) |
| 4 | `PART-4-Meta-Critique-of-the-Documents.md` | part | 4 | Meta-critique of the doc set |
| 5 | `BUG-DEPENDENCY-MAP.md` | map | 5 | Graph view: §A bugs, §B gates, §C tasks, §D graph, §E safety, §F order, §G facts, §H verdict |
| 6 | `APPENDIX-ID-KEY.md` | appendix | 6 | Global ID key + collision disambiguation |
| 7 | `APPENDIX-VERIFICATION-LOG.md` | appendix | 7 | Verification evidence trail |
| 8 | `APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md` | appendix | 8 | Public-health/regulatory dimensions |
| 9 | `APPENDIX-SAFETY-PROCESS.md` | appendix | 9 | Vet sign-off process + safety disclaimer |
| 10 | `APPENDIX-GLOSSARY.md` | appendix | 10 | Domain acronym glossary |

### 17.4 Identifier namespaces (what the app linkifies)

| Namespace | Range | Kind |
|---|---|---|
| Findings (LP) | A1–A20 | finding |
| Findings (Nutrition) | B1–B18 | finding |
| Findings (Data) | C1–C22 | finding |
| Findings (Validation) | D1–D22 | finding |
| Findings (Cross-cutting) | E1–E23 | finding |
| Tasks | B0–B12, C1–C16, R1–R5 | task |
| Gates | G1–G3 | gate |
| Priorities | P0–P3 | priority |
| Section refs | §9.1, §A.A3 | section |
| Legacy | R-01–R-09 | legacy |
| Appendix refs | APPENDIX-*.md | appendix-ref |

**Known collisions** (disambiguated by context / `APPENDIX-ID-KEY.md`): finding `C7` vs task `C7`; governance `R1` vs regression-task `R1` vs legacy `R-01`.

### 17.5 Defect counts

77 unique defects: 9 Critical (P0), 27 High (P1), 30 Medium (P2), 11 Low (P3). Plus 6 empirically-cleared non-defects.

### 17.6 The 3 decision gates

| Gate | Question | Status |
|---|---|---|
| G1 | Mineral antagonisms hard or soft? | ✅ Resolved: HARD at Level 1 |
| G2 | `objective_weights.json` wire in or delete? | ✅ Resolved: DELETE |
| G3 | Numeric safety values (Ca/P ceilings, growth taper, SULs) | ❌ PENDING — vet sign-off required. **The single project bottleneck.** |

---

## §18. Development & Operations

### 18.1 Commands

```bash
bun run dev        # next dev -p 3000, tee to dev.log, live .md reloading
bun run lint       # eslint .
bun run build      # next build + copy static/public to standalone
bun run start      # NODE_ENV=production bun .next/standalone/server.js
bun run db:push    # prisma db push --accept-data-loss
bun run db:generate
bun run db:migrate
bun run db:reset
```

### 18.2 Dev server

- Port 3000 (only exposed route).
- `bun run dev` runs in background; avoid duplicate instances.
- Log: `/home/z/my-project/dev.log` (read tail for errors).
- `next.config.ts` may need `allowedDevOrigins` for cross-origin preview.

### 18.3 Gateway

`Caddyfile` — single exposed port. Cross-service requests use `?XTransformPort=<port>` query param. WebSocket: `io("/?XTransformPort={Port}")`, path always `/`.

### 18.4 Editing the docs

Edit `.md` files in `consolidated-docs/`. In dev, the next API request re-reads them (no restart). ID registry, glossary, section tree all rebuild automatically.

### 18.5 Editing the graph

Curated in `src/lib/dependency-graph.ts` (`NODE_TABLE`, `EDGE_TABLE`). Changes take effect on next API request.

### 18.6 Editing bug-facts

Curated in `src/lib/bug-facts.ts` (`BUG_FACTS`). Client-side; changes take effect on next page load.

---

## §19. Known Limitations & Extension Points

### 19.1 Limitations

1. **No auth / multi-user.** NextAuth v4 installed but unused. All state per-browser.
2. **No server-side persistence.** Annotations/bookmarks in `localStorage` only. Prisma wired but unused.
3. **Single-document main pane.** Xref split shows two; no multi-tab.
4. **Graph is curated, not derived.** Must manually sync with `BUG-DEPENDENCY-MAP.md` §C/§D.
5. **No export** (PDF, annotations export).
6. **No collaborative features** (sharing, comments, real-time).
7. **Mobile graph** is cramped; no dedicated mobile graph view.
8. **Mermaid** can be slow on large diagrams; no lazy hydration.
9. **Search** is full-text, not fuzzy; no ranking; no regex.
10. **A11y:** semantic HTML + ARIA throughout, but full WCAG 2.1 AA audit pending.

### 19.2 Extension points (for the meta-harness)

| Extension | How |
|---|---|
| Add a document | Drop `.md` in `consolidated-docs/`; parser auto-discovers (order via filename, see §4.3) |
| Add a graph node/edge | Edit `NODE_TABLE`/`EDGE_TABLE` in `src/lib/dependency-graph.ts` |
| Add a bug-fact | Edit `BUG_FACTS` in `src/lib/bug-facts.ts` |
| Add a reading mode | Extend `ReadingMode` union in `doc-store.ts`; add to `MODE_ITEMS` in `top-bar.tsx`; add right-panel branch in `doc-reader.tsx` |
| Add a theme | Add CSS block in `globals.css`; add to `themes` array in `layout.tsx`; add to `themeOptions` in `top-bar.tsx` |
| Add an API route | New file in `src/app/api/*/route.ts`; call `rateLimit(request)` first |
| Server-backed state | Replace Zustand `persist` storage adapter with a fetch-backed one |
| Embed in meta-app | Mount `/` as a sub-route; the app is self-contained (no cross-route nav) |
| Drive graph externally | Dispatch `window.dispatchEvent(new CustomEvent("graph:open-at-node", { detail: { id } }))` |
| Drive doc navigation externally | Call `useDocStore.getState().setActiveSlug(slug)` + `signalDocJumpTo(sectionId)` |
| Read all IDs | `useDocStore.getState().ids` (the full registry) |
| Read all files | `useDocStore.getState().files` |
| Add an annotation | Call `saveAnnotations([...loadAnnotations(), newAnn])` |
| Listen for jumps | `window.addEventListener("doc:jumpto", e => e.detail.sectionId)` |

---

## §20. Specification Compliance Checklist

For a meta-harness ingesting this document, verify:

- [ ] **API contract** — `GET /api/docs` returns `{ files, ids, glossary, generatedAt }` with `ids` as `[key, entry][]`; `GET /api/docs?slug=X` returns `{ file: { ..., rawMarkdown }, ids }`; `GET /api/dependency-graph` returns `{ nodes, edges, sectionContent, generatedAt }`.
- [ ] **Rate limit** — 60 req/min/IP token bucket; `429` + `Retry-After: 60` when exceeded.
- [ ] **Slug validation** — `/^[a-z0-9-]+$/`, max 80 chars.
- [ ] **ID registry** — 7-pattern priority table (§4.4); canonical key strips `.md` from appendix-refs.
- [ ] **Graph** — 36 nodes, 32 edges, 6 lanes, curated coords (§5.2/5.3).
- [ ] **State** — Zustand store with `partialize` persisting only 7 fields (§7.3); equality guards on `setActiveSectionId` + `addVisitedSection`.
- [ ] **Events** — 5 custom events: `doc:jump`, `doc:jumpto`, `graph:open-at-node`, `annotations-updated`, `annotation-clicked` (§8).
- [ ] **Keyboard** — 14 shortcuts with `isInteractiveTarget()` guard + modal-suppression (§9).
- [ ] **localStorage** — 5 keys: `gsd-doc-reader-storage`, `gsd-doc-annotations`, `doc-sidebar-collapsed-groups`, + 2 panel-width keys (§10).
- [ ] **Themes** — 4 themes + system; oklch variables; `.dark` variant covers `.opencode` (§11).
- [ ] **Performance** — `React.memo` on MarkdownRenderer + graph nodes; rAF scroll throttle; IntersectionObserver scroll-spy; payload split (list vs single-file) (§15).
- [ ] **Security** — rate limit, slug validation, no raw HTML in markdown, SSR-safe persist, error boundary (§14).

---

*End of specification. This document is the source of truth for the app's technical contract as of the writing date. For runtime verification, see `/home/z/my-project/worklog.md` and `/home/z/my-project/dev.log`.*
