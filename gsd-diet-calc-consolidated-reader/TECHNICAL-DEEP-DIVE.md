# gsd-diet-calc Consolidated Reader — Deep Technical Specification

> **Audience:** the engineering team that will integrate this software with another. Every wire, every contract, every engine is documented here with exact file paths. Read top-to-bottom for full context, or jump to §15 (Integration Contract Summary) for the surface area you can depend on.
>
> **Verification baseline:** Next.js 16.1.1, React 19.0.0, TypeScript 5 (strict), Bun runtime. App confirmed serving HTTP 200 with full UI render. All file paths are relative to `/home/z/my-project/` unless prefixed otherwise.

---

## Table of Contents

1. [What this project IS (and is NOT)](#1-what-this-project-is-and-is-not)
2. [System Topology & System Boundary](#2-system-topology--system-boundary)
3. [Build & Runtime Stack](#3-build--runtime-stack)
4. [Configuration & Environment](#4-configuration--environment)
5. [App Router Shell](#5-app-router-shell)
6. [Gateway & Networking](#6-gateway--networking)
7. [Operations Layer — Daemon & Watchdog](#7-operations-layer--daemon--watchdog)
8. [Database Layer](#8-database-layer)
9. [Data Sources — The File System](#9-data-sources--the-file-system)
10. [Library Layer (`src/lib/`)](#10-library-layer-srclib)
11. [HTTP API Surface (`src/app/api/`)](#11-http-api-surface-srcappapi)
12. [Frontend Orchestrator — `DocReader`](#12-frontend-orchestrator--docreader)
13. [Frontend Component Catalog (`src/components/docs/`)](#13-frontend-component-catalog-srccomponentsdocs)
14. [Dependency Graph Subsystem](#14-dependency-graph-subsystem)
15. [Hooks (`src/hooks/`)](#15-hooks-srchooks)
16. [Event System — The A2A Contract Layer](#16-event-system--the-a2a-contract-layer)
17. [Persistence Layer](#17-persistence-layer)
18. [Styling & Theming](#18-styling--theming)
19. [Documentation Corpus](#19-documentation-corpus)
20. [Architecture Review System](#20-architecture-review-system)
21. [Integration Contract Summary](#21-integration-contract-summary)
22. [Known Gaps & Risks](#22-known-gaps--risks)

---

## 1. What this project IS (and is NOT)

### 1.1 What it IS

A **single-page, server-light / client-heavy documentation reader**. It takes 10 dense Markdown files describing the defects of an unrelated Python project (an LP raw-diet calculator for German Shepherd Dogs) and turns them into a navigable, searchable, themeable, annotatable knowledge base with an interactive bug-dependency graph.

- **Internal package name:** `nextjs_tailwind_shadcn_ts` (v0.2.1)
- **User-facing name:** `gsd-diet-calc — Consolidated Reader · v10.4.0`
- **Single user-visible route:** `/` (everything else is API)
- **Entry point:** `src/app/page.tsx` → `<ErrorBoundary><DocReader /></ErrorBoundary>`

### 1.2 What it is NOT

| Claimed capability | Reality |
|---|---|
| Diet calculator | ❌ No LP/PuLP/CBC/nutrition code. The corpus *describes* a diet calculator; the app *renders the description*. |
| Veterinary tool | ❌ The corpus references DACVN/ECVCN sign-off; the app does not enforce it. |
| Multi-user / collaborative | ❌ Single-user, browser-local state. No auth wired (next-auth is installed but no `/api/auth` route exists). |
| CMS | ❌ Documents are read-only files on disk. Edits happen via filesystem; the app re-parses on cache invalidation. |
| General markdown viewer | ❌ Hardcoded to `consolidated-docs/` (overridable via `DOCS_DIR` env var — see §4). The parser is purpose-built for the project's ID conventions. |

### 1.3 The subject-vs-host distinction (CRITICAL for integration)

The **corpus documents a different codebase than the one running it**:

- **Host app** (this project): Next.js 16 / TypeScript at `/home/z/my-project/`
- **Subject of the corpus**: Python LP solver at `github.com/HansChucrute14/Hans-GSD-Raw-Calculator`, commit `c932a21`

The reader app has zero LP/nutrition code. It is a viewing layer over an audit.

---

## 2. System Topology & System Boundary

### 2.1 The complete request path

```
External client
    │  HTTP
    ▼
Caddy gateway  (Caddyfile, listens :81)        ← only externally-exposed HTTP port
    │
    ├─ if ?XTransformPort=<N> present → reverse_proxy localhost:<N>   (sidecar mini-service)
    │
    └─ default                            → reverse_proxy localhost:3000   (Next.js dev server)
            │
            ▼
      Next.js 16 (Turbopack)  managed by dev-daemon.py (PID 1 child, watchdog-supervised)
            │
            ├─  GET /                       →  src/app/page.tsx (SSR React)
            │       └─ <DocReader />  orchestrates 27 components
            │
            ├─  GET /api                    →  health check
            ├─  GET /api/docs[?slug=]       →  filesystem read of consolidated-docs/
            ├─  GET /api/dependency-graph   →  filesystem read of BUG-DEPENDENCY-MAP.md §D-DATA
            ├─  POST/GET /api/dependency-graph/sync       →  re-parse + cache invalidate
            └─  POST/GET /api/dependency-graph/validate   →  dry-run zod validation
            │
            ▼
      Filesystem  (consolidated-docs/)
            ├─ INDEX.yml                 (doc registry, schemaVersion 1.0.0)
            ├─ PART-1..4-*.md            (4 substantive documents)
            ├─ BUG-DEPENDENCY-MAP.md     (graph source: §D-DATA YAML block)
            └─ APPENDIX-*.md             (5 reference appendices)
```

### 2.2 Sidecar channel (for future mini-services)

`mini-services/` exists but is **empty** today. The `examples/websocket/` directory contains a reference Socket.IO server (`server.ts`, port 3003) and client (`frontend.tsx`) demonstrating the pattern: the client connects via `io('/?XTransformPort=3003')` and Caddy's `@transform_port_query` matcher forwards the upgrade to localhost:3003.

---

## 3. Build & Runtime Stack

### 3.1 `package.json` (verbatim scripts)

```json
{
  "name": "nextjs_tailwind_shadcn_ts",
  "version": "0.2.1",
  "scripts": {
    "dev": "next dev -p 3000 2>&1 | tee dev.log",
    "build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/",
    "start": "NODE_ENV=production bun .next/standalone/server.js 2>&1 | tee server.log",
    "lint": "eslint .",
    "db:push": "prisma db push --accept-data-loss",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset"
  }
}
```

> ⚠️ **Do NOT use `bun run dev` in this sandbox.** The `| tee dev.log` pipeline makes `next` a subprocess of a shell, which the sandbox reaps when the launching Bash call returns. Use `python3 dev-daemon.py` instead (see §7).

### 3.2 Runtime dependencies (37, all versions in `package.json`)

Highlights:

| Category | Packages |
|---|---|
| Framework | `next@^16.1.1`, `react@^19.0.0`, `react-dom@^19.0.0` |
| Styling | `tailwindcss@^4`, `tw-animate-css`, `@tailwindcss/typography` |
| UI primitives | 28 `@radix-ui/react-*` packages, `lucide-react@^0.525.0`, `cmdk@^1.1.1`, `vaul@^1.1.2`, `embla-carousel-react` |
| State | `zustand@^5.0.6`, `@tanstack/react-query@^5.82.0`, `@tanstack/react-table` |
| Markdown | `react-markdown@^10.1.0`, `remark-gfm@^4.0.1`, `rehype-highlight@^7.0.2`, `highlight.js@^11.11.1`, `mermaid@^11.16.0` |
| Forms / validation | `react-hook-form@^7.60.0`, `zod@^4.0.2`, `@hookform/resolvers` |
| Sanitization | `dompurify@^3.4.12` (mermaid SVG defense-in-depth) |
| Charts | `recharts@^2.15.4` |
| Motion | `framer-motion@^12.23.2` |
| Date | `date-fns@^4.1.0` |
| ORM | `prisma@^6.11.1`, `@prisma/client@^6.11.1` (SQLite) |
| Auth | `next-auth@^4.24.11` (installed, **not wired**) |
| i18n | `next-intl@^4.3.4` (installed, **not wired**) |
| Themes | `next-themes@^0.4.6` |
| AI SDK | `z-ai-web-dev-sdk@^0.0.18` (server-only) |
| Other | `uuid`, `sharp`, `react-resizable-panels`, `react-syntax-highlighter`, `@mdxeditor/editor`, `@dnd-kit/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner` |

### 3.3 `next.config.ts`

```ts
const nextConfig = {
  output: "standalone",                      // self-contained server bundle
  typescript: { ignoreBuildErrors: true },   // build proceeds on TS errors
  reactStrictMode: false,
  devIndicators: false,
  allowedDevOrigins: ["http://0.0.0.0:81", "http://21.0.12.130:3000", "http://0.0.0.0:3000"],
};
```

### 3.4 Toolchain configs

- **`tsconfig.json`**: `strict: true` but `noImplicitAny: false`; single alias `@/* → ./src/*`; `moduleResolution: "bundler"`; `jsx: "react-jsx"`.
- **`tailwind.config.ts`**: `darkMode: "class"`; theme tokens bound to `hsl(var(--*))` CSS vars. Tailwind v4 is in use, so this config is mostly legacy compat (real config is in `globals.css`).
- **`postcss.config.mjs`**: single plugin `@tailwindcss/postcss`.
- **`eslint.config.mjs`**: flat config. **T7 enforcement rule** bans raw `window.dispatchEvent(new CustomEvent(...))` outside `src/lib/contracts.ts` (see §16). All `e2e/`, `examples/`, `skills/` are ignored.
- **`components.json`**: shadcn/ui New York style, 57 primitives under `src/components/ui/`.

---

## 4. Configuration & Environment

### 4.1 `.env` (full)

```
DATABASE_URL=file:/home/z/my-project/db/custom.db
```

Single key. Points Prisma at the local SQLite file.

### 4.2 Env vars referenced in source

| Var | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | `prisma/schema.prisma` | SQLite file URL |
| `NODE_ENV` | `src/lib/db.ts`, `src/lib/docs-parser.ts` | gates Prisma singleton caching + 60s docs TTL |
| `DOCS_DIR` | `src/lib/paths.ts` | **Override for docs root** (default `process.cwd()/consolidated-docs`). Set this when integrating at a non-`/home/z/my-project` path. |
| `DOCS_DEV_MODE` | `src/lib/docs-parser.ts` | `"1"` enables auto-discovery of unlisted `.md` files (dev aid only) |
| `NEXT_PUBLIC_GRAPH_SPLIT` | `src/components/docs/dependency-graph.tsx` | `"v1"` activates the T6c split-canvas path; unset → LegacyCanvas (default) |

### 4.3 Portability caveat for integration teams

The default docs root is `process.cwd()/consolidated-docs`. If you mount this app at a different path, **set `DOCS_DIR=<absolute path to your consolidated-docs>`** in the environment before starting the server. `paths.getDocsDir()` will resolve it.

---

## 5. App Router Shell

### 5.1 `src/app/layout.tsx` (full)

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono  = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "gsd-diet-calc — Consolidated Reader",
  description: "Interactive reader for the consolidated documentation of gsd-diet-calc v10.4.0...",
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          themes={["light", "dark", "opencode", "ergonomic"]}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

**Key facts:**
- **2 fonts:** Geist (sans, → `--font-geist-sans`) + Geist_Mono (→ `--font-geist-mono`).
- **1 provider:** `ThemeProvider` (next-themes). No React Query provider, no SessionProvider, no next-intl provider at root.
- **4 themes registered:** `light`, `dark`, `opencode`, `ergonomic` + implicit `system`.
- **`suppressHydrationWarning`** on `<html>` (required by next-themes — theme class is set pre-hydration).
- **`<Toaster />`** is the Radix-based shadcn toaster (NOT sonner), mounted inside ThemeProvider so it inherits theme.

### 5.2 `src/app/page.tsx` (full)

```tsx
import { DocReader } from "@/components/docs/doc-reader";
import { ErrorBoundary } from "@/components/error-boundary";

export default function Home() {
  return (
    <ErrorBoundary label="the documentation reader">
      <DocReader />
    </ErrorBoundary>
  );
}
```

The entire application is one route. `<DocReader />` (1,843 lines) orchestrates everything.

---

## 6. Gateway & Networking

### 6.1 `Caddyfile` (full, 23 lines)

```caddy
:81 {
    @transform_port_query {
        query XTransformPort=*
    }
    handle @transform_port_query {
        reverse_proxy localhost:{query.XTransformPort} {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }
    handle {
        reverse_proxy localhost:3000 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
            header_up X-Real-IP {remote_host}
        }
    }
}
```

**How traffic flows:**
1. **Caddy listens on `:81`** — the only externally-exposed HTTP port.
2. **`@transform_port_query` matcher** fires on any request with `?XTransformPort=<N>`.
3. If matcher fires → reverse proxy to `localhost:<N>` (sidecar mini-service port).
4. Default `handle` → reverse proxy to `localhost:3000` (Next.js).

### 6.2 The `XTransformPort` mechanism

Any sidecar service can be reached by appending `?XTransformPort=<port>` to the gateway URL. The frontend MUST use relative paths only — never `http://localhost:<port>`.

```ts
// Permitted:
fetch('/api/test?XTransformPort=3030')
io('/?XTransformPort=3003')

// FORBIDDEN:
fetch('http://localhost:3030/api/test')
io('http://localhost:3003')
```

### 6.3 WebSocket reference pattern (`examples/websocket/`)

- **`server.ts`** (port 3003): Socket.IO server, `path: '/'`, in-memory `users: Map`. Events: `test`, `join`, `message`, `disconnect`.
- **`frontend.tsx`**: connects via `io('/?XTransformPort=3003', { transports: ['websocket','polling'] })`.

---

## 7. Operations Layer — Daemon & Watchdog

This sandbox has two constraints that required a custom ops layer:
1. **Process reaping** — the sandbox kills background processes whose parent shell has exited. `nohup`, `setsid &`, `disown` all fail.
2. **4 GB cgroup memory limit** — Turbopack compile uses ~1.9 GB RSS; combined with anything else it can OOM.

### 7.1 `dev-daemon.py` (the active launcher, 89 lines)

A **Python double-fork daemon** that:
1. Forks twice so the surviving grandchild is reparented to **PID 1 (init)** — outside the sandbox's reap scope.
2. Detaches std FDs to `/dev/null`.
3. Writes its PID to `.dev-daemon.pid`.
4. Runs a **watchdog loop** that execs `next dev -p 3000` directly (bypassing the `| tee` pipeline), and restarts it on any exit with a 3-second backoff.
5. Uses `preexec_fn=os.setsid` so `next` runs in its own process group — when the watchdog kills it, all of next's children die too.

**To start the server:**
```bash
python3 /home/z/my-project/dev-daemon.py
```

**To check status:**
```bash
cat /home/z/my-project/.dev-daemon.pid          # watchdog PID
ss -tlnp 2>/dev/null | grep 3000                # is next listening?
tail -20 /home/z/my-project/dev-watchdog.log    # boot/exit history
tail -40 /home/z/my-project/dev.log             # next stdout
```

**To restart:**
- Soft (next only, watchdog recovers in ~13s): `pkill -f next-server`
- Full (watchdog + next): `pkill -f dev-daemon && python3 /home/z/my-project/dev-daemon.py`

### 7.2 `start-dev.sh` (alternative, 20 lines)

Shell-only equivalent watchdog. Self-protects from OOM via `echo -1000 > /proc/self/oom_score_adj`. Does NOT double-fork — so it's only useful for foreground debugging. **`dev-daemon.py` is the one actually running.**

---

## 8. Database Layer

### 8.1 `prisma/schema.prisma` (full)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 8.2 ⚠️ CRITICAL: Prisma is unused scaffolding

The `User` and `Post` models are the **default Next.js + Prisma scaffold**. None of the actual application domain — docs, bug map, annotations, graph, progress, bookmarks — is DB-backed. All of that lives in:

| Domain entity | Backing | Location |
|---|---|---|
| Docs (10 files) | **Markdown files** | `consolidated-docs/*.md` |
| Doc registry | **`INDEX.yml`** | `consolidated-docs/INDEX.yml` |
| Bug dependency graph | **YAML block in markdown** | `consolidated-docs/BUG-DEPENDENCY-MAP.md` §D-DATA |
| Bug facts (client mirror) | **Static TS object** | `src/lib/bug-facts.ts` `BUG_FACTS` |
| Annotations | **localStorage** | key `gsd-doc-annotations` |
| Bookmarks, recently-viewed, visited, theme, reading mode, font size | **localStorage** (Zustand persist) | key `gsd-doc-reader-storage` |

**If your integration requires cross-device sync of annotations/bookmarks/progress, you must extend the Prisma schema and migrate `annotation-highlights.ts` / `doc-store.ts` from localStorage to API-backed persistence.** This is greenfield work — the schema today has no `Annotation`, `Bookmark`, or `UserProgress` models.

### 8.3 `src/lib/db.ts` (full)

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['query'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
```

Standard HMR-safe singleton pattern. Import as `import { db } from "@/lib/db"`.

---

## 9. Data Sources — The File System

The authoritative data layer is the filesystem. **Only `consolidated-docs/` is read by any API route** (11 entries):

```
consolidated-docs/
├── INDEX.yml                                  (doc registry, schemaVersion 1.0.0)
├── PART-1-Diagnosis-Findings-and-As-Built-Reality.md  (1,494 lines, 224 KB)
├── PART-2-The-Fix-Remediation-Plan-and-Roadmap.md     (979 lines, 86 KB)
├── PART-3-Synthesis-Unified-Verified-Project-Map.md   (369 lines, 69 KB)
├── PART-4-Meta-Critique-of-the-Documents.md           (296 lines, 46 KB)
├── BUG-DEPENDENCY-MAP.md                              (1,487 lines, 99 KB — graph source)
├── APPENDIX-SAFETY-PROCESS.md                         (74 lines)
├── APPENDIX-VERIFICATION-LOG.md                       (182 lines)
├── APPENDIX-GLOSSARY.md                               (58 lines)
├── APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md           (68 lines)
└── APPENDIX-ID-KEY.md                                 (234 lines)
```

> **Note:** `upload/` (11 more `.md` files) is the upstream source-document staging area. **No API route references it.** It is meta-documentation, not served content.

The `INDEX.yml` registry is the authoritative list of what gets rendered. Schema (validated by `DocRegistry` zod):

```yaml
schemaVersion: "1.0.0"     # load-bearing (§12.5)
docs:
  - file: "PART-1-Diagnosis-Findings-and-As-Built-Reality.md"
    type: "part"           # "part" | "appendix" | "map" | "unlisted"
    order: 1
    title: "Part 1 — Diagnosis, Findings, and As-Built Reality"
  # ... 9 more
```

---

## 10. Library Layer (`src/lib/`)

11 files. This is the engine room. Listed in dependency order (leaf → composite).

### 10.1 `src/lib/contracts.ts` — A2A Event Contract Layer (146 lines)

**Client-safe leaf module.** Single source of truth for event names, cross-module payload schemas, doc-registry schemas, and unified validation. Imports only `zod`. No `fs`/`path` (those live in `paths.ts`).

**Exports:**
- `EVT` — constant registry of 7 event names:
  ```ts
  export const EVT = {
    DocJump: "doc:jump",
    DocJumpTo: "doc:jumpto",
    DocJumpToOccurrence: "doc:jumpto-occurrence",
    GraphSynced: "graph:synced",
    GraphOpenAtNode: "graph:open-at-node",
    AnnotationClicked: "annotation-clicked",
    AnnotationsUpdated: "annotations-updated",
  } as const;
  ```
- `CROSS_MODULE_PAYLOADS` — zod schemas for the 3 typed cross-module events (`graph:synced`, `graph:open-at-node`, `doc:jumpto-occurrence`). The other 4 events are intra-module and intentionally untyped.
- `DocMeta`, `DocRegistry` — zod schemas for `INDEX.yml` (with `schemaVersion: z.literal("1.0.0")`).
- `dispatchDocEvent(name, detail?): void` — **default fire-and-forget.** Validates typed payloads, logs rejection to `console.error`, never throws.
- `dispatchDocEventChecked(name, detail?): boolean` — **opt-in.** Returns `false` on SSR/rejection. Only ONE wired site: `graph:synced` in `doc-store.ts` (§12.4 mitigation).
- `RegistryResult<T>` interface + `validateRegistry<T>()` function — unified validation contract (§12.7). Never throws. Consumed by docs parser + graph validate endpoint.

**ESLint enforcement (T7):** raw `window.dispatchEvent(new CustomEvent(...))` outside this file is **banned**. All event dispatch MUST go through `dispatchDocEvent` / `dispatchDocEventChecked`.

### 10.2 `src/lib/paths.ts` — Server-Only Path Resolution (43 lines)

**The only lib module that imports `fs`.** Split from `contracts.ts` so client components can import EVT without pulling `fs` into the browser bundle.

```ts
export function getDocsDir(): string            // process.env.DOCS_DIR ?? process.cwd()/consolidated-docs
export function getBugMapPath(): string         // = getDocsDir() + "/BUG-DEPENDENCY-MAP.md"
export function resolveDocPath(fileName): string // = getDocsDir() + "/" + fileName
export function exactCaseFileExists(dir, fileName): boolean  // readdirSync-based (macOS case-insensitivity fix)
```

**All path resolution flows through these functions.** No hardcoded paths anywhere else in `src/`.

### 10.3 `src/lib/doc-store.ts` — Zustand Store (427 lines)

The single global client-side store. `create<DocState>()(persist(...))`.

**State slices (28 fields):**

| Slice | Type | Persisted? |
|---|---|---|
| `files` | `DocFileMeta[]` | ✅ |
| `ids` | `Record<string, IdIndexEntry>` | ✅ |
| `glossary` | `Record<string,string>` | ✅ |
| `warnings` | `string[]` | ❌ (session) |
| `activeSlug`, `activeSectionId` | `string \| null` | ✅ |
| `loading`, `error` | bool/string | ❌ |
| `sidebarOpen` | bool | ❌ |
| `visitedDocs`, `visitedSections` | `Set<string>` | ✅ (serialized as array) |
| `bookmarks` | `BookmarkEntry[]` (cap 50) | ✅ |
| `recentlyViewed` | `RecentlyViewedEntry[]` (cap 8) | ✅ |
| `readingMode` | `"linear" \| "xref" \| "focus" \| "audit"` | ✅ |
| `xrefDestination` | `{docSlug, sectionId} \| null` | ❌ |
| `fontSize` | number | ✅ |
| `graphSyncStatus` | `"idle" \| "syncing" \| "error"` | ❌ |
| `graphSyncedAt` | `string \| null` (ISO) | ✅ |
| `graphSyncErrors` | `string[] \| null` | ❌ |
| `graphNodes` | `GraphNode[]` | ❌ |
| `graphNodesStatus` | `"idle" \| "loading" \| "ready" \| "error"` | ❌ |

**Storage key:** `"gsd-doc-reader-storage"`. SSR-safe storage factory.

**Key actions:** `setActiveSlug`, `setActiveSectionId` (idempotent guard), `toggleBookmark`/`isBookmarked`, `trackRecentView`, `setReadingMode`, `fetchGraphNodes(force?)` (idempotent, §12.2), `syncDependencyGraph()` (POST `/api/dependency-graph/sync`, dispatches `graph:synced` via the **checked** variant).

**Signal helpers (thin wrappers around `dispatchDocEvent`):**
- `signalDocJump()` → `EVT.DocJump`
- `signalDocJumpTo(sectionId)` → `EVT.DocJumpTo`
- `signalDocJumpToOccurrence(id, occurrenceIndex=0)` → `EVT.DocJumpToOccurrence`

### 10.4 `src/lib/docs-parser.ts` — Markdown Pipeline (506 lines)

Server-only filesystem parser. Reads `INDEX.yml`, validates via `DocRegistry`/`validateRegistry`, parses each `.md` into sections + ID registry + glossary.

**Two caching layers:**
1. `cache(parseDocsInternal)` — React per-request dedup.
2. `parseDocsCached()` — 60s TTL in production only; dev re-parses every request.

**`parseSections(rawMarkdown, docSlug)`** — scans H1–H4 headings, computes `endLine` per section, builds `children[]` via O(n²) ancestor walk. Section IDs are `"s<lineNumber>-<slugify(title)"` (collision-free).

**ID registry (`ID_PATTERNS`)** — 7 regex patterns in priority order:
1. `APPENDIX-[A-Z-]+\.md` → `appendix-ref`
2. `§<section-ref>` → `section`
3. `R-0[1-9]` → `legacy`
4. `Task (B|C|R)<n>` → `task`
5. `G[1-3]` → `gate`
6. `P[0-3]` → `priority`
7. `[ABCE]<n>[ab]?` → `finding` (A1–A23, B1–B23, C1–C23, E1–E23)

`buildIdRegistry(files)` walks every line of every file, extracts ~120-char context per occurrence, normalizes appendix-refs (strips `.md`).

**`serializeDocs(parsed, includeContent=false)`** — TWO MODES:
- **List mode** (`includeContent=false`): no `rawMarkdown`, no `section.content`. Used by `GET /api/docs` (no slug).
- **Single-file mode** (`includeContent=true`): adds `rawMarkdown` + `section.content`. Used by `GET /api/docs?slug=X`.

IDs serialized as `[key, IdEntry][]` tuples; glossary as `[term, definition][]` tuples.

### 10.5 `src/lib/dependency-graph.ts` — Schema-Driven Graph (558 lines)

Replaces hand-curated `NODE_TABLE`/`EDGE_TABLE` with a **schema-validated YAML block** embedded in `BUG-DEPENDENCY-MAP.md §D-DATA`.

**Public types:**
```ts
type NodeKind = "task" | "gate" | "priority";
type Severity = "P0" | "P1" | "P2" | "P3" | null;
type EdgeKind = "blocks" | "pending" | "recommended" | "backstops";

interface GraphNode {
  id: string; label: string; kind: NodeKind; severity: Severity;
  description: string; status?: "pending"|"resolved"|"urgent"|"independent"|null;
  x: number; y: number; namespace?: "task"|"gate"; lane?: string;
  // bug-fact fields (optional, from §D-DATA):
  subsystem?: string; oneLiner?: string; repairs?: string[];
  blockedBy?: string[]; onCriticalPath?: boolean;
}

interface GraphEdge { from: string; to: string; kind: EdgeKind; label?: string; }
```

**Zod schema** (`graphSourceSchema`): `schemaVersion: z.literal("1.0.0")`, `lanes[]`, `nodes[]` (id regex `^(B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5]|G[1-3])$`), `edges[]`.

**`extractGraphDataBlock(rawMarkdown)`** — finds `## §D-DATA.` heading, extracts the ```` ```yaml ```` fenced block.

**`checkReferentialIntegrity(source)`** — 4 rules:
1. No duplicate `(namespace, id)` pairs.
2. Every `node.lane` exists in `lanes[].id`.
3. Every `edges[].from`/`to` exists in `nodes[].id` AND node ids are globally unique.
4. Lane `order` values are unique.

**`computeLayout(source)`** — lane-based auto-layout:
- `LANE_WIDTH=220`, `LANE_PADDING_X=140`, `NODE_HEIGHT=180`, `LANE_PADDING_Y=100`.
- Per-lane Kahn's topological sort on `blocks` edges (intra-lane only).
- `x = LANE_PADDING_X + laneIndex * LANE_WIDTH`, `y = LANE_PADDING_Y + rank * NODE_HEIGHT`.
- Explicit `x`/`y` in YAML override computed.

**Module-level cache** (no TTL, manual sync only): `cachedGraph` + `cachedAt`. **Fail-closed:** bad YAML → 422, cache keeps serving live traffic.

**`reparseDependencyGraphNow()`** — always re-reads disk, validates, and on success replaces cache. On throw, cache untouched.

### 10.6 `src/lib/bug-facts.ts` — Client-Safe Bug Fact Mirror (116 lines)

Static `BUG_FACTS: Record<string, BugFact>` — ~60 entries mirroring §D-DATA so client components (popover Quick-Reference Cards) can render bug-fact cards without an API call.

**IDs covered:** P0 findings (A1, A2, A3, A5, A14, B1, B2, B11, C1, C2, C4, D1), P0 tasks (B0–B10), P1 tasks (B12, C3–C16), gates (G1–G3), regression tests (R1–R5), P1 findings (A4, A6–A8, E1, E3, E4, E6, E7, D2–D8).

**`getBugFact(id)`** — `Record` lookup O(1), with `_task` suffix disambiguation for C-series (e.g. `C1` finding vs `C1_task` task).

> **Status:** Explicitly a **fallback** for finding IDs (A/D/E series) NOT in the graph. T8c (deletion) is BLOCKING-gated on §12.2 cold-start verification. Today it is load-bearing.

### 10.7 `src/lib/api-utils.ts` — API Helpers (78 lines)

```ts
export function getClientIp(request: Request): string  // x-forwarded-for → x-real-ip → "unknown"
export function rateLimit(request: Request, capacity = 60): boolean  // token-bucket per IP, 60s window
export function isValidSlug(slug: string): boolean  // /^[a-z0-9-]+$/, ≤80 chars
```

**Rate limiter:** in-memory `Map<ip, Bucket>`, 60s window, proportional refill, periodic eviction every 2 minutes (buckets unused >5 windows). Single-instance only (no Redis).

### 10.8 `src/lib/window-globals.ts` — Typed `window` Augmentation (37 lines)

Declares 5 optional `window.__*` globals so all access sites get type checking:
1. `__pendingHashSection` — section to scroll to after doc swap renders.
2. `__currentVisibleSectionId` — mirrors Zustand `activeSectionId`.
3. `__scrollSpyObserver` — the IntersectionObserver (for cleanup).
4. `__depGraphRetry` — setTimeout handle for dep-graph retry.
5. `__depGraphCleanup` — cleanup fn for dep-graph observer.

> **Tech debt (F-06):** plan is to migrate these to refs/Zustand/WeakMap.

### 10.9 `src/lib/annotation-highlights.ts` — Annotation Data Model + DOM Logic (877 lines)

**Full client-side annotation system.** localStorage-backed CRUD with v1→v2 migrator, soft-delete/trash with 6s undo window, bulk operations, search/filter, stats, JSON/CSV/Markdown export, JSON import, and a React hook `useAnnotationHighlights(docSlug)` that applies `<mark>` highlights to the prose DOM.

**Types:**
```ts
type AnnotationColor = "yellow" | "rose" | "emerald" | "sky" | "violet";
type AnnotationStatus = "open" | "resolved";

interface Annotation {
  id: string; docSlug: string; sectionId: string; sectionTitle: string;
  text: string; note: string; color: AnnotationColor; tags: string[];
  status: AnnotationStatus; pinned: boolean; createdAt: number; updatedAt: number;
}
```

**Constants:** `STORAGE_KEY="gsd-doc-annotations"`, `TRASH_KEY="gsd-doc-annotations-trash"`, `SCHEMA_VERSION_KEY="gsd-doc-annotations-schema-version"`, `CURRENT_SCHEMA_VERSION=2`, `MAX_ANNOTATIONS=500`, `UNDO_WINDOW_MS=6000`, `MARK_ATTR="data-ann-id"`, `MARK_CLASS="annotation-highlight"`.

**CRUD API:** `loadAnnotations`, `saveAnnotations`, `addAnnotation`, `updateAnnotation`, `deleteAnnotation` (soft), `restoreAnnotation`, `duplicateAnnotation`, `findDuplicate`.

**Bulk:** `bulkUpdate`, `bulkDelete`, `bulkAddTag`, `bulkSetStatus`, `bulkSetPinned`.

**Search:** `searchAnnotations(filters: SearchFilters)` — pipeline filters: docSlug → colors → tags (AND) → tagsAny (OR) → status → pinnedOnly → hasNote → query (AND across whitespace-split terms).

**Export/Import:** `serializeAnnotations(anns, "json"|"markdown"|"csv")`, `importFromJSON(jsonText)`.

**DOM highlight logic:** `highlightInNode(root, needle, annId, color)` — TreeWalker over text nodes, rejects `mark`/`script`/`style`/`code`/`pre` parents, `Range.surroundContents(<mark>)` per match. `clearAllMarks(root)` removes them. Resolved → opacity 0.55 + line-through. Pinned → inset box-shadow.

**`useAnnotationHighlights(docSlug)` hook** — returns count of applied annotations. Re-applies on: `docSlug` change (250ms delay), `annotations-updated` event, `storage` event, theme change (MutationObserver on `<html>.class`), `doc:jump`/`doc:jumpto` events (300ms delay). Click handler on `[data-doc-content]` dispatches `EVT.AnnotationClicked` with `{id, rect}`.

### 10.10 `src/lib/utils.ts` (6 lines)

Standard shadcn `cn()` — `clsx` + `tailwind-merge`.

### 10.11 `src/lib/db.ts` — Prisma singleton (13 lines, see §8.3)

---

## 11. HTTP API Surface (`src/app/api/`)

5 route files, 7 HTTP handlers. All declare `export const dynamic = "force-dynamic"`.

### 11.1 Route inventory

| Method | Path | Rate limit (req/min/IP) | Cache-Control |
|---|---|---|---|
| GET | `/api` | none | none |
| GET | `/api/docs` (list) | 60 | `public, max-age=60, s-maxage=300` |
| GET | `/api/docs?slug=X` (single) | 60 | `public, max-age=60, s-maxage=300` |
| GET | `/api/dependency-graph` | 60 | `public, max-age=60, s-maxage=300` |
| POST | `/api/dependency-graph/sync` | **10** | none |
| GET | `/api/dependency-graph/sync` | 30 | none |
| POST | `/api/dependency-graph/validate` | 20 | none |
| GET | `/api/dependency-graph/validate` | 20 | none |

### 11.2 `GET /api/docs` — list mode (no slug)

**Response (200):**
```ts
{
  files: Array<{
    slug: string; fileName: string; title: string;
    type: "part" | "appendix" | "map" | "unlisted";
    order: number; totalLines: number; blurb: string;
    sections: Array<{ id: string; level: number; title: string;
                      lineNumber: number; endLine: number; children: string[] }>;
    // NO rawMarkdown, NO section.content
  }>;
  ids: Array<[string, IdEntry]>;        // tuple-array (Map.entries)
  glossary: Array<[string, string]>;    // tuple-array
  warnings: string[];                   // §12.5 registry validation warnings
  generatedAt: string;                  // ISO
}
```

### 11.3 `GET /api/docs?slug=X` — single-file mode

Validates slug via `isValidSlug` (`/^[a-z0-9-]+$/`, ≤80 chars). Returns:
```ts
{
  file: {
    slug, fileName, title, type, order, totalLines, blurb,
    sections: Array<{ id, level, title, lineNumber, endLine, children }>,
    rawMarkdown: string;                // full file markdown — used for rendering
  };
  ids: Array<[string, IdEntry]>;
  // NOTE: no glossary, no warnings in single-file mode
}
```

**Errors:** 404 `{error:"invalid slug"}` (regex fail) | 404 `{error:"not found"}` (valid slug, no file) | 429 `{error:"rate limited"}` + `Retry-After: 60`.

> **`section.content` is NEVER in the JSON**, even in single-file mode. Renderers use `rawMarkdown`.

### 11.4 `GET /api/dependency-graph` — graph payload

**Response (200):**
```ts
{
  nodes: GraphNode[];       // 36 nodes
  edges: GraphEdge[];       // 34 edges
  sectionContent: string;   // §D prose (excludes §D-DATA YAML block)
  generatedAt: string;      // ISO
}
```

⚠️ Does NOT catch `GraphValidationError` — if `BUG-DEPENDENCY-MAP.md` is corrupt on cold start, this route 500s and cache stays empty. Recovery: POST `/sync`.

### 11.5 `POST /api/dependency-graph/sync` — manual re-parse

**Behavior:** Re-reads `BUG-DEPENDENCY-MAP.md §D-DATA` from disk, validates (zod + referential integrity), and on success replaces the module-level cache. **Fail-closed:** on validation failure returns 422, cache keeps serving.

**Success (200):** `{ ok: true, graph: <DependencyGraph>, generatedAt: string, cachedAt: number }`

**Validation failure (422):** `{ ok: false, error: "validation_failed", message: string, issues: GraphValidationIssue[], cachedAt: number }`

**Internal error (500):** `{ ok: false, error: "internal_error", message: string, cachedAt: number }`

**Rate-limited (429):** `{ ok: false, error: "rate limited", message: "Too many sync requests..." }` + `Retry-After: 60`

### 11.6 `GET /api/dependency-graph/sync` — status probe

Lightweight cache timestamp probe (no disk reads, no validation). Returns `{ ok: true, cachedAt: number|null, cachedAtIso: string|null }`.

### 11.7 `POST /api/dependency-graph/validate` — dry-run validation

**256 KB body cap** (`MAX_BODY_BYTES = 256 * 1024`), checked BEFORE `JSON.parse` (blocks JSON.parse DoS + huge-YAML DoS).

**Request body:** `{ yaml: string }`

**Success (200), §12.7 RegistryResult shape:** `{ ok: true, entries: GraphSourceNode[], warnings: [] }`

**Validation failure (422):** `{ ok: false, entries: [], warnings: ["<path>: <message>", ...] }`

**Errors:** 413 (body too large) | 400 (invalid JSON / wrong body shape) | 429 (rate limited) | 500 (unexpected)

### 11.8 `GET /api/dependency-graph/validate` — on-disk re-validation

Re-reads `BUG-DEPENDENCY-MAP.md` directly (NOT the cache). Same response shape as POST. Per §12.7 Decision 5Z: "the verb IS the source" — GET implies on-disk file, POST implies submitted YAML body.

### 11.9 Status code matrix

| Route | 200 | 400 | 404 | 413 | 422 | 429 | 500 |
|---|---|---|---|---|---|---|---|
| `GET /api` | ✓ | | | | | | |
| `GET /api/docs` | ✓ | | ✓ | | | ✓ | |
| `GET /api/dependency-graph` | ✓ | | | | | ✓ | (uncaught throw) |
| `POST /api/dependency-graph/sync` | ✓ | | | | ✓ | ✓ | ✓ |
| `GET /api/dependency-graph/sync` | ✓ | | | | | ✓ | |
| `POST /api/dependency-graph/validate` | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ |
| `GET /api/dependency-graph/validate` | ✓ | | | | ✓ | ✓ | ✓ |

### 11.10 API integration notes

1. **No auth anywhere.** All routes public; rate-limiting is the only abuse protection.
2. **No CORS headers.** Same-origin only.
3. **`ids` and `glossary` are tuple-arrays** (`[key, value][]`), NOT objects — `Map.entries()` serialized directly. Reconstruct with `new Map(json.ids)`.
4. **Single-file mode omits `glossary` and `warnings`** — call list view separately if you need them.
5. **`section.content` is never serialized.** Use `rawMarkdown` for rendering.
6. **Check `response.status === 429`** rather than parsing the body — rate-limit response shapes are inconsistent across routes.

---

## 12. Frontend Orchestrator — `DocReader`

**File:** `src/components/docs/doc-reader.tsx` (1,843 lines). The heart of the application.

### 12.1 Export

```ts
export function DocReader()   // no props — root of the reader UI
```

### 12.2 Local state (17 `useState`)

| State | Default | Purpose |
|---|---|---|
| `fullFile` | `null` | current doc body |
| `fileLoading` | `false` | doc-fetch spinner |
| `searchOpen` | `false` | SearchDialog |
| `showShortcuts` | `false` | shortcuts overlay |
| `readProgress` | `0` | scroll % (footer bar) |
| `graphOpen` | `false` | DependencyGraphDialog |
| `graphFocusNode` | `null` | node to center graph on |
| `tocOpen` | `false` | TocDialog |
| `progressOpen` | `false` | ProgressDialog |
| `comparisonOpen` | `false` | ComparisonViewDialog |
| `commandPaletteOpen` | `false` | CommandPalette |
| `annotationsOpen` | `false` | AnnotationsPanel |
| `depGraphSectionVisible` | `false` | true when §D heading in viewport |
| `showBackToTop` | `false` | floating ↑ |
| `jumpHighlightId` | `null` | section to pulse |
| `hiddenSeverities` | `∅` | disabled P0–P3 filters (Bug Map only) |
| `mobileRightPanelOpen` | `false` | mobile Sheet for BacklinksPanel |

### 12.3 `useEffect`s (17, listed in source order)

1. **Keyboard shortcut handler** — `keydown` on `window`.
2. **Initial fetch `/api/docs`** (mount-once) — populates `files`, `ids`, `glossary`, `warnings`. Picks initial slug from URL `#slug:section` hash → first `map` file → first file.
3. **§12.2 eager-fetch graph** — `useDocStore.getState().fetchGraphNodes()` on mount.
4. **Pending hash section scroll** — waits for `fullFile`, scrolls 400ms later.
5. **hashchange listener** — back/forward nav.
6. **Fetch `GET /api/docs?slug=<activeSlug>`** when `activeSlug` changes.
7. **Scroll-spy IntersectionObserver** — `rootMargin:"-80px 0px -50% 0px"`, sets `activeSectionId`.
8. **Heading ID assignment** — builds `Map<normalizedTitle, section[]>`, walks `h2/h3/h4` in `#md-container`, assigns `id` + `data-heading-id`. Retry timers at 50/150/400/900/1800/3500ms. MutationObserver fallback. (F-08 fix.)
9. **§D section visibility detector** (Bug Map only).
10. **Reading progress + back-to-top** — RAF-throttled scroll, only fires setState on >0.5% delta.
11. **Listen `EVT.DocJump`** — sets `jumpPendingRef.current = true`.
12. **Listen `EVT.DocJumpTo`** — sets `jumpHighlightId`.
13. **Auto-clear `jumpHighlightId`** after 4s.
14. **Listen `EVT.DocJumpToOccurrence`** — polls `[data-id-link="<id>"]` up to 32×250ms, applies `.occurrence-jump-target` + `.occurrence-jump-block` for 5s, scrolls token to center.
15. **Severity filter** — walks `#md-container` for `h2..h5` containing P0/P1/P2/P3, adds `.severity-hidden` to `<tr>` rows.
16. **Listen `EVT.GraphOpenAtNode`** → `openGraphAtNode(detail.id)`.
17. **Clear `graphFocusNode` when graph closes** (300ms delay).

### 12.4 Keyboard shortcuts

| Key | Action | Guard |
|---|---|---|
| `⌘K` / `Ctrl+K` | open SearchDialog | always |
| `⌘P` / `Ctrl+P` | open CommandPalette | always |
| `?` | toggle shortcuts overlay | skip if interactive |
| `f` | toggle `readingMode` ↔ `focus` | skip if dialog open |
| `p` | toggle ProgressDialog | skip if dialog open |
| `g` | open DependencyGraphDialog | skip if dialog open |
| `v` | open ComparisonViewDialog | skip if dialog open |
| `n` | toggle AnnotationsPanel | skip if dialog open |
| `t` | open TocDialog | skip if dialog open |
| `b` | bookmark current section | requires activeSlug + activeSectionId |
| `←` / `→` | previous/next doc | skip if dialog open |
| `j` / `k` | next/prev heading | requires non-interactive |

### 12.5 Layout tree (rendered)

```
<div flex flex-col h-screen overflow-hidden>                    // root
├─ <TopBar />                                                   // sticky header
├─ {showShortcuts && <ShortcutsOverlay/>}
├─ <div flex flex-1 min-h-0>                                    // 3-column body
│   ├─ {!isFocus && <ResizableAside side=left> <DocSidebar/> </ResizableAside>}
│   ├─ {!isFocus && <Sheet> <DocSidebar/> </Sheet>}             // mobile
│   ├─ <main flex-1 min-w-0 flex flex-col>
│   │   ├─ {!isFocus && <BreadcrumbBar/> + <BookmarkToggleButton/>}
│   │   ├─ <ReadingProgressBar/>
│   │   ├─ {!isFocus && fullFile?.type==="map" && <SeverityFilterBar/>}
│   │   ├─ {depGraphSectionVisible && <FloatingGraphButton/> + <InlineGraphCallout/>}
│   │   ├─ <BackToTopButton/>
│   │   ├─ <div flex-1 flex (flex-row if isXref else flex-col)>
│   │   │   ├─ <ScrollArea id="main-scroll">
│   │   │   │   └─ <div max-w-3xl xl:max-w-4xl>
│   │   │   │       ├─ <DocumentHeroGradientCard> <h1/> + stats + <DocActions/> + <QuickJumpNav/> </...>
│   │   │   │       ├─ <div id="md-container" data-doc-content={slug}>
│   │   │   │       │   └─ <ErrorBoundary label="the markdown content">
│   │   │   │       │       <MarkdownRenderer content={strippedMarkdown} highlightId={jumpHighlightId} />
│   │   │   │       │   </ErrorBoundary>
│   │   │   │       │   {!isFocus && <MiniToc/>}
│   │   │   │       └─ {none && <NoDocPlaceholder/>}
│   │   │   └─ {isXref && <XrefSplitView/>}
│   │   ├─ {!isFocus && <StickyFooter/>}                        // gradient progress + prev/next + attribution
│   ├─ {!isFocus && !isAudit && <ResizableAside side=right> <BacklinksPanel/> </ResizableAside>}
│   └─ {!isFocus && !isAudit && <MobileRightPanelFAB/> + <Sheet side=bottom>}
├─ {isAudit && <AuditChecklist/>}                               // floating
└─ (Dialogs — always mounted, visibility-controlled)
    ├─ <SearchDialog/>
    ├─ <TocDialog/>
    ├─ <ErrorBoundary label="the dependency graph">
    │   └─ <DependencyGraphDialog onNodeClick={handleGraphNodeClick} initialFocusNodeId={graphFocusNode} />
    │   </ErrorBoundary>
    ├─ <ProgressDialog/>
    ├─ <ComparisonViewDialog/>
    ├─ <CommandPalette/>
    ├─ <AnnotationsPanel/>                                      // Sheet
    ├─ <SelectionToolbar/>                                      // always mounted
    └─ <AnnotationsInlinePopover/>                              // always mounted
```

### 12.6 Reading modes (`ReadingMode`)

| Mode | Behavior |
|---|---|
| `linear` (default) | Full 3-column chrome: sidebar + main + backlinks |
| `xref` | Adds `<XrefSplitView/>` right pane (flex-row instead of flex-col). Clicking an ID link sets `xrefDestination` instead of navigating. |
| `focus` | Hides sidebar, breadcrumb, footer, right panel, mini-TOC. Constrain content to `max-w-3xl`. |
| `audit` | Hides right backlinks panel. Shows floating `<AuditChecklist/>`. |

### 12.7 Document switching & progress tracking

- `setActiveSlug` is the single entry point. The store action adds slug to `visitedDocs` and clears `activeSectionId`.
- Effect #6 fetches the new file, sets `activeSectionId` to first level≥2 section.
- Scroll-spy (effect #7) calls `addVisitedSection(id)` on heading enter.
- Share button sets `window.location.hash = "<slug>:<sectionId>"`.

### 12.8 In-file sub-components

- `QuickJumpNav({sections})` — sticky pills `§A`–`§H` (up to 12 top-level sections).
- `DocActions({fullFile})` — Source (download .md Blob), Print (`window.print()`), Share (clipboard deep-link).
- `BookmarkToggleButton` — star icon, reads `isBookmarked` + `toggleBookmark`.
- `SeverityFilterBar` — four toggle buttons (P0 rose, P1 orange, P2 yellow, P3 gray).

---

## 13. Frontend Component Catalog (`src/components/docs/`)

17 components. Listed with one-line purpose; full detail in §13 sub-sections below.

| # | File | LOC | Purpose |
|---|---|---|---|
| 1 | `doc-reader.tsx` | 1,843 | Orchestrator (see §12) |
| 2 | `top-bar.tsx` | 401 | Sticky header: tabs, modes, tools, theme |
| 3 | `doc-sidebar.tsx` | 532 | Left sidebar: doc list + bookmarks + recent |
| 4 | `markdown-renderer.tsx` | 1,110 | ReactMarkdown with IdLink popovers, glossary, callouts, mermaid |
| 5 | `backlinks-panel.tsx` | 350 | Right panel: section IDs + backlinks |
| 6 | `reading-progress.tsx` | 81 | Top progress bar with section ticks |
| 7 | `search-dialog.tsx` | 372 | ⌘K full-text search (cmdk) |
| 8 | `command-palette.tsx` | 499 | ⌘P command palette (custom Dialog, NOT cmdk) |
| 9 | `comparison-view.tsx` | 196 | Side-by-side doc comparison |
| 10 | `audit-checklist.tsx` | 184 | Floating panel for `audit` mode |
| 11 | `toc-dialog.tsx` | 352 | Table-of-contents dialog (cmdk) |
| 12 | `mini-toc.tsx` | 154 | Floating outline navigator |
| 13 | `progress-dialog.tsx` | 403 | 3-tab reading progress dialog |
| 14 | `resizable-panels.tsx` | 494 | `useResizable` hook + `ResizableAside` wrapper |
| 15 | `xref-split-view.tsx` | 163 | Split-pane cross-reference viewer |
| 16 | `annotations.tsx` | 2,098 | AnnotationsPanel + SelectionToolbar + AnnotationsInlinePopover |
| 17 | `mermaid-diagram.tsx` | 152 | Mermaid renderer (securityLevel strict + DOMPurify) |
| — | `dependency-graph.tsx` | 3,782 | Graph dialog orchestrator (see §14) |

### 13.1 `top-bar.tsx`

**Props:** `{ onOpenSearch, onOpenGraph, onOpenToc, onOpenProgress, onOpenComparison, onOpenAnnotations, onOpenShortcuts }` (all `() => void`).

**Store reads:** `files, ids, activeSlug, setActiveSlug, toggleSidebar, bookmarks, readingMode, setReadingMode, fontSize, setFontSize`.

**Other hooks:** `useTheme()` (next-themes), `useAnnotationCount()`.

**Rendered structure:** sticky header with logo + title + Part tabs (1-4) + Bug Map button + Appendices dropdown + Reading Mode dropdown + Font Size dropdown + Stats badges (findings/P0 refs/tasks) + Tool cluster (Progress/TOC/Graph/Compare/Annotations) + Search button + ? button + bookmarks badge + Theme dropdown.

### 13.2 `doc-sidebar.tsx`

**Props:** `{ onSelectSection?: (sectionId: string) => void }`.

**Store reads:** `files, ids, activeSlug, setActiveSlug, visitedDocs, bookmarks, recentlyViewed, removeBookmark, clearRecentViews, warnings`.

**State:** `searchTerm`, `collapsed: Set<GroupKey>` (persisted to `localStorage["doc-sidebar-collapsed-groups"]`), `showBookmarks`, `showRecent`, `warningsDismissed`, `warningsExpanded`.

**Rendered:** Header (Library + count + filter input) → optional §12.5 warnings banner → ScrollArea with 3 Collapsibles (PARTS, MAP, APPENDICES) each with DocRow items → optional Bookmarks collapsible → optional Recent collapsible → Footer stats.

### 13.3 `markdown-renderer.tsx` — the prose engine

**Export:** `React.memo(MarkdownRendererImpl, (prev, next) => prev.content === next.content && prev.highlightId === next.highlightId)`.

**Props:** `{ content: string; highlightId?: string | null }`.

> **Memoization is critical:** prevents re-parsing markdown + re-running syntax highlighting on every `readProgress` state update. Any new prop MUST be added to the comparator.

**Plugins:** `remarkGfm`, `rehypeHighlight` (`{ detect: true, ignoreMissing: true }`).

**Component overrides:**
- `h1-h4` → `<SectionHeading>` (uses `HighlightContext`, callback ref + WeakMap cleanup + MutationObserver for ID resolution)
- `p, li, td, th, strong, em` → `<LinkifiedText>` (tokenize → applyGlossary → LangAwareText / GlossaryTooltip / IdLink)
- `blockquote` → `<StyledBlockquote>` (callout detector: ⚠️/💡/✅/🔴 + P0-P3 + Gate Gx)
- `code` → `<StyledCode>` (inline vs fenced; `lang==="mermaid"` → `<MermaidBlock>`)
- `pre` → `<CodeBlockWrapper>` (detects `MERMAID_FLAG`, unwraps; else `<pre>` + copy button)

**ID linkification pipeline (`ID_MATCHERS`, 7 patterns in priority order):**
1. `APPENDIX-[A-Z-]+(\.md)?` → `appendix-ref`
2. `§<section-ref>` → `section`
3. `R-0[1-9]` → `legacy`
4. `Task (B|C|R)<n>` → `task`
5. `G[1-3]` → `gate`
6. `P[0-3]` → `priority`
7. `[ABCE]<n>[ab]?` → `finding`

**`IdLink` component** (the popover):
- Reads `useGraphNode(id)` (primary, §12.8 O(1) Map) + `useGraphNodesStatus()` + `getBugFact(id)` (fallback).
- **Unified fact:** coerces both sources into `{severity, subsystem, oneLiner, repairs[], blockedBy[], onCriticalPath?}`.
- **Render branches:** (a) appendix-ref → simple nav button; (b) priority without entry → styled span; (c) unknown id → plain span; (d) known id → `<Popover>` with Quick-Reference Card.
- **Popover content:** severity/subsystem/critical-path badges + oneLiner + repairs/blockedBy chips + occurrences list (click → jump or set xrefDestination) + "View in dependency graph" button (gated by `isGraphNodeId(id)` regex).
- The `data-id-link="<id>"` attribute is **load-bearing** — `DocReader`'s `doc:jumpto-occurrence` listener queries `[data-id-link="<id>"]` and picks the Nth match.

**`useSeverityRowColors(content)` hook** — re-runs on `content` change only. Colors `<tr>` rows based on `data-priority` attributes set by `IdLink`. Fallback scans `<td>` for `\bP[0-3]\b`. Propagates severity to heading sections.

### 13.4 `backlinks-panel.tsx`

**Store reads:** `files, ids, activeSlug, activeSectionId, setActiveSlug, graphNodes`.

**Computed:** `sectionIds` (IDs whose first occurrence is in current section), `backlinks` (other sections referencing these IDs, capped at 30, sorted by referenced count desc).

**Rendered:** Header + "On this page" (grouped by kind: finding/task/gate/priority/section/legacy/appendix-ref) + "Linked from" (backlink rows).

### 13.5 `search-dialog.tsx` (cmdk-based)

Lazy-loads all docs' `rawMarkdown` on first open via `Promise.all(files.map(f => fetch("/api/docs?slug=" + f.slug)))`. AND search across whitespace-split tokens. Returns top 50 by score. `⌘Enter` opens active result in new tab via `window.open`.

**Persistence:** `localStorage["gsd-doc-recent-searches"]` (top 5).

### 13.6 `command-palette.tsx` (custom Dialog, NOT cmdk)

**Commands:** Tools (6: Search/TOC/Graph/Compare/Progress/Shortcuts) + Settings (4 reading modes) + Documents (N) + Bugs & IDs (top 40 most-referenced, hybrid lookup).

**Persistence:** `localStorage["gsd-cmd-recent"]` (top 5, separate from search).

**Keyboard:** ↑↓ navigate, ↵ select, Esc close.

### 13.7 `comparison-view.tsx`

Two `<Select>` dropdowns (left/right slug) + two `<MarkdownRenderer>` side-by-side in 95vw × 92vh Dialog. Uses local `stripFirstH1`.

### 13.8 `audit-checklist.tsx`

Floating panel (fixed bottom-4 right-4) shown only in `audit` mode. Lists IDs in current section, marks each visited/unvisited, jump handler.

### 13.9 `toc-dialog.tsx` (cmdk-based)

Scope toggle (current doc / all docs). Per-section reading-time estimate `max(1, round(sectionLines / 60))`. ProgressRing SVG showing current doc read %.

### 13.10 `mini-toc.tsx`

Floating outline (fixed top-24 right-4 lg:right-[304px], 256px wide). Fades in when `scrollTop > 300`. Indents by level (2=0, 3=12px, 4=24px).

### 13.11 `progress-dialog.tsx`

3-tab Dialog: Overview (ProgressRing + Findings Coverage + Critical Path Coverage + Recommended Next Read) / By Document (per-doc progress bars) / Findings (all findings sorted by id with viewed/unviewed status).

**`CRITICAL_PATH_IDS = ["B0","B7","B1","B5","B6","B8","C5","C7","C8","C9","C10","C11","C12","C14"]`**

### 13.12 `resizable-panels.tsx`

**`useResizable(opts)` hook** — `{ initialWidth, minWidth=200, maxWidth=600, storageKey, side, maxViewportFraction=0.5 }`. Returns `{ width, isDragging, isHovering, onPointerDown, onHoverChange, onDoubleClick, onKeyDown, reset }`.

- Width persisted to `localStorage[storageKey]` (debounced 150ms).
- Re-clamps on `window.resize`.
- Pointer events with RAF-throttled setState. `document.body.style.userSelect="none"` + `cursor="col-resize"` during drag.
- Arrow keys: ±8px (±32px with Shift), Home resets.

**`ResizeHandle`** — 16px hit area, `role="separator"`, `tabIndex=0`, `aria-orientation="vertical"`. Three visual states (idle 1px / hover 4px / drag 8px) with gradient + grip dots.

**`ResizableAside`** — wrapper used by DocReader for sidebar (`storageKey="doc-sidebar-width"`, init 288) and backlinks (`storageKey="backlinks-panel-width"`, init 288).

### 13.13 `xref-split-view.tsx`

Right pane in `xref` mode. Fetches `destFile` via `GET /api/docs?slug=xrefDestination.docSlug`. Renders `<MarkdownRenderer>` with `highlightId={xrefDestination.sectionId}`. Swap button swaps current doc ↔ destination. Close button clears `xrefDestination`.

### 13.14 `annotations.tsx` (2,098 lines, 3 exports)

**`AnnotationsPanel({ open, onClose })`** — Sheet (right side). Stats bar (total/pinned/recent7d + color distribution + status grid + top tags). Filter row (query + colors + tags + status + pinned + hasNote). Sort row (pinned/newest/oldest/updated/document/alpha). Bulk actions bar. List of AnnotationCards (color stripe + text blockquote + section link + note + tags + status toggle + edit/duplicate/copy/delete). Footer with Import/Export (JSON/Markdown/CSV).

**`SelectionToolbar()`** — always mounted. Listens to `document.selectionchange`. Floating toolbar at selection rect. Compact mode: color picker + note button + highlight button. Expanded mode: textarea + TagInput + color picker + status/pin + Cancel/Save. `⌘Enter` saves, `Esc` cancels.

**`AnnotationsInlinePopover()`** — always mounted. Listens to `EVT.AnnotationClicked`. Opens at mark position. View/edit modes. 6s Undo toast on delete.

### 13.15 `mermaid-diagram.tsx`

**Props:** `{ chart: string }`.

**Security contract:** `mermaid.initialize({ securityLevel: "strict" })` + `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`. **Do NOT change `securityLevel` to `"loose"` without re-auditing** — the SVG is injected via `dangerouslySetInnerHTML`.

**Theme sync:** MutationObserver on `document.documentElement.class`. Dark if `.dark` or `.opencode` present.

---

## 14. Dependency Graph Subsystem

The graph feature was the subject of a 5-pass adversarial review. Files:

| File | LOC | Role |
|---|---|---|
| `src/components/docs/dependency-graph.tsx` | 3,782 | Orchestrator (LegacyCanvas inline + GraphCanvas split) |
| `src/components/docs/graph/graph-canvas.tsx` | 276 | Split-canvas SVG (T6c, flag-gated) |
| `src/components/docs/graph/use-graph-viewport.ts` | 195 | Pan/zoom hook (ref-not-closure) |
| `src/components/docs/graph/graph-constants.ts` | 65 | Shared color/style constants |
| `src/components/docs/graph/graph-toolbar.tsx` | 182 | Sync + layout toggle + search |
| `src/components/docs/graph/graph-legend.tsx` | 163 | Collapsible legend |

### 14.1 Feature flag

```ts
// dependency-graph.tsx:304
const USE_SPLIT_CANVAS = process.env.NEXT_PUBLIC_GRAPH_SPLIT === "v1";
```

**Default: OFF** (`NEXT_PUBLIC_GRAPH_SPLIT` unset in `.env`). The byte-identical "LegacyCanvas" inline `<svg>` is the active path. `GraphCanvas` is verified-dormant.

### 14.2 `graph-canvas.tsx` (split path)

**Rendering:** SVG (`<svg viewBox>` + `<g transform="translate scale">`), NOT `<canvas>`.

**Constants:** `NODE_WIDTH=168`, `NODE_HEIGHT=56`, `VIEWBOX_PAD=60`.

**Render algorithm:**
1. `nodesRef` bridge — mirrors `nodes` into a ref on every render so `useGraphViewport`'s wheel handler reads latest (§12.6 stale-closure fix).
2. `viewBox` memo — `computeViewBox(nodes)` (min/max of node x/y ± NODE_WIDTH/2/2, padded 60).
3. `nodesById` memo — `Map<string,GraphNode>` for O(1) edge endpoint resolution.
4. `<svg>` with `<defs>`: 4 arrowhead markers (one per EdgeKind, namespaced `gc-`) + dot grid pattern (`gc-grid-dots`).
5. Background `<rect>` (pan target).
6. Pan/zoom `<g>`: edges as `<line>` (straight, dashed per kind) + nodes as `<g>` with `<rect>` + severity accent bar + ID `<text>` + 2-line label `<text>`.

**§12.6 target-check popover fix:** `GraphCanvas` stamps `data-graph-node={n.id}` on every node `<g>`. The orchestrator registers a **capture-phase window click listener** that checks `target.closest("[data-graph-node]")` — if hit, keep popover open; else close. Removes the `stopPropagation` ordering dependency.

### 14.3 `use-graph-viewport.ts`

**Constants:** `MIN_SCALE=0.3`, `MAX_SCALE=3`, `ZOOM_STEP=1.2`.

**State:** `scale`, `translateX`, `translateY` (each with a ref mirror).

**Wheel handler math:** Center-anchored zoom (anchor = data center, mean of min/max node x/y). `ratio = newScale / prevScale`. `newTx = anchorX - (anchorX - prevTx) * ratio`. NOT cursor-anchored (sufficient for the regression gate).

**Pan:** primary button only, `setPointerCapture`, `document.body.style.userSelect="none"`. `onPointerDown` bails if `target.closest("[data-graph-node]")` (let the node handle it).

**Bounds:** scale clamped `[0.3, 3]`; translate NOT clamped (unbounded pan).

### 14.4 `graph-constants.ts`

All colors in **oklch** for theme portability. `CV` (CSS-var references) resolved at render time — makes the graph theme-adaptive across all 4 themes WITHOUT a `useTheme()` call.

| Constant | Type |
|---|---|
| `SEVERITY_COLOR` | `Record<P0\|P1\|P2\|P3, string>` (rose/amber/emerald/slate) |
| `EDGE_COLOR` | `Record<EdgeKind, string>` (emerald/sky/amber/rose) |
| `EDGE_DASH` | `Record<EdgeKind, string>` (none/"8 4"/"6 4"/"3 4") |
| `EDGE_WIDTH` | `Record<EdgeKind, number>` (2.0/1.5/1.8/1.4) |
| `KIND_ACCENT` | `Record<NodeKind, string>` (violet/emerald/slate) |
| `STATUS_COLOR` | `Record<status, string>` (amber/rose/slate/emerald) |
| `CV` | 13 `var(--token)` strings |

### 14.5 `graph-toolbar.tsx`

**Store-backed** (Decision 3Z): subscribes to `graphSyncStatus`, `graphSyncedAt`, `graphSyncErrors`, `syncDependencyGraph`.

**`handleSyncGraph`** — calls `syncDependencyGraph()`, reads post-call store state via `useDocStore.getState()`, shows success/error toast (sonner, NOT the local use-toast system).

**Controls:** Sync button (RefreshCw, spins while syncing, destructive variant on error) + Layout toggle (GitBranch, aria-pressed) + Search input.

> Zoom in/out/reset/fit are NOT here — they live in the orchestrator's own toolbar JSX (not extracted).

### 14.6 `graph-legend.tsx`

Collapsible overlay (bottom-left). Sections: Node kind (3 swatches) + Severity (4 rings) + Edge kind (4 lines) + Status badges (3: PENDING/URGENT/INDEP — **RESOLVED omitted**) + Hub weighting + Semantic zoom thresholds.

### 14.7 §12.2 eager-fetch contract

```ts
// doc-reader.tsx:347-350
useEffect(() => {
  useDocStore.getState().fetchGraphNodes();
}, []);
```

`fetchGraphNodes(force?)` is idempotent — no-op if `"ready"` or `"loading"` unless `force`. GET `/api/dependency-graph`, sets `graphNodes` from `json.nodes`.

### 14.8 The `graph:synced` event flow

`GraphToolbar` click → `syncDependencyGraph` → POST `/api/dependency-graph/sync` → on success dispatches `EVT.GraphSynced` via **`dispatchDocEventChecked`** (the §12.4 boolean-returning variant — if dispatch fails on SSR/bad payload, store flips to `graphSyncStatus: "error"`). The orchestrator's listener clears `graphDataCache` + calls `fetchData(true)`. **The Zustand `graphNodes` slice is NOT auto-refreshed by `graph:synced` today** — only the dialog-local `data` state is. (Known gap, see §22.)

---

## 15. Hooks (`src/hooks/`)

### 15.1 `use-graph-node.ts` (§12.8 O(1) Map lookup, 41 lines)

```ts
const _byId = new Map<string, GraphNode>();
let _lastRef: GraphNode[] | null = null;

function rebuildMap(nodes: GraphNode[]): void {
  _byId.clear();
  for (const n of nodes) _byId.set(n.id, n);
  _lastRef = nodes;
}

export function useGraphNode(id: string | null): GraphNode | null {
  const nodes = useDocStore((s) => s.graphNodes);
  if (_lastRef !== nodes) rebuildMap(nodes);
  if (id === null) return null;
  return _byId.get(id) ?? null;
}

export function useGraphNodesStatus(): "idle" | "loading" | "ready" | "error" {
  return useDocStore((s) => s.graphNodesStatus);
}
```

**Why O(1) amortized:** `useDocStore((s) => s.graphNodes)` returns the same array reference until the store replaces it (Zustand identity equality). So `_lastRef !== nodes` is `false` on most renders → `rebuildMap` skipped → only `_byId.get(id)` per render (O(1)).

**Hybrid with bug-facts:** `useGraphNode` returns `null` for finding IDs (A/D/E series) not in graph. Consumers (`IdLink`) fall back to `getBugFact(id)`.

### 15.2 `use-toast.ts` (194 lines)

Classic shadcn toast pattern — tiny external store + reducer, NOT React Context.

- `TOAST_LIMIT = 1` (newest replaces older)
- `TOAST_REMOVE_DELAY = 1000000` (~16.7 min)
- Module-scoped `listeners: Array<(state) => void>` + `memoryState: State`
- `dispatch(action)` → `reducer` → notify all listeners
- `useToast()` subscribes via `useEffect`; returns `{ toasts, toast, dismiss }`
- Also exports bare `toast()` for use outside React

> **Note:** `GraphToolbar` uses `sonner`, not this system. Other components (annotations) use this one.

### 15.3 `use-mobile.ts` (20 lines)

```ts
const MOBILE_BREAKPOINT = 768;
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}
```

SSR-safe: initial `undefined` → `!!undefined === false` avoids hydration mismatch.

---

## 16. Event System — The A2A Contract Layer

### 16.1 Event registry (`EVT`)

| Constant | String | Payload schema | Dispatched by | Listened by |
|---|---|---|---|---|
| `EVT.DocJump` | `doc:jump` | (none) | IdLink, SearchDialog, TocDialog, BacklinksPanel, AuditChecklist, AnnotationsPanel, AnnotationsInlinePopover | DocReader (sets jumpPendingRef), useAnnotationHighlights |
| `EVT.DocJumpTo` | `doc:jumpto` | `{sectionId}` (untyped, intra-module) | IdLink, SearchDialog, TocDialog, BacklinksPanel, AuditChecklist, AnnotationsPanel, AnnotationsInlinePopover, XrefSplitView, DocReader | DocReader (sets jumpHighlightId, cleared after 4s), useAnnotationHighlights |
| `EVT.DocJumpToOccurrence` | `doc:jumpto-occurrence` | `{id, occurrenceIndex}` (TYPED) | IdLink, BacklinksPanel, DocReader.handleGraphNodeClick | DocReader (polls `[data-id-link]`, scrolls, applies 5s highlight) |
| `EVT.GraphSynced` | `graph:synced` | `{generatedAt}` (TYPED) | doc-store.syncDependencyGraph (via `dispatchDocEventChecked`) | dependency-graph.tsx (clears cache, re-fetches) |
| `EVT.GraphOpenAtNode` | `graph:open-at-node` | `{id}` (TYPED) | IdLink "View in dependency graph" button | DocReader (openGraphAtNode → setGraphFocusNode + setGraphOpen) |
| `EVT.AnnotationClicked` | `annotation-clicked` | `{id, rect}` (untyped, intra-module) | useAnnotationHighlights click handler, SelectionToolbar toast action | AnnotationsInlinePopover (opens at mark position) |
| `EVT.AnnotationsUpdated` | `annotations-updated` | (none) | `dispatchAnnotationsUpdated()` (called by every mutation in annotation-highlights.ts) | AnnotationsPanel, StatsBar, useAnnotationHighlights, useAnnotationCount |

### 16.2 Tiered dispatch (§12.4 mitigation)

Two functions, one decision rule:

- **`dispatchDocEvent(name, detail?): void`** — default. Fire-and-forget. Validates typed payloads, logs rejection, never throws. Use for ALL call sites.
- **`dispatchDocEventChecked(name, detail?): boolean`** — opt-in. Returns `false` on SSR/rejection. Caller MUST handle `false`. Use only where silent failure causes visible UI staleness.

**Exactly ONE site uses the checked variant:** `doc-store.ts syncDependencyGraph()` success branch (GraphSynced is the one event whose silent failure causes visible UI staleness).

**Verify the contract:**
```bash
grep -rn "dispatchDocEventChecked" src/ | wc -l    # EXPECT exactly 1
grep -rn "dispatchDocEvent(" src/ | grep -v Checked | wc -l   # EXPECT ≥ 5
```

### 16.3 ESLint enforcement (T7)

Raw `window.dispatchEvent(new CustomEvent(...))` outside `src/lib/contracts.ts` is **banned** by `eslint.config.mjs`:

```js
"no-restricted-syntax": [{
  selector: "CallExpression[callee.object.property.name='dispatchEvent'][arguments.0.callee.name='CustomEvent']",
  message: "Use dispatchDocEvent() from @/lib/contracts instead of raw window.dispatchEvent(new CustomEvent(...))."
}]
```

`src/lib/contracts.ts` is exempt.

---

## 17. Persistence Layer

Three localStorage keys + one Prisma SQLite file (unused by domain).

### 17.1 `gsd-doc-reader-storage` (Zustand persist)

**Persisted fields:** `bookmarks`, `recentlyViewed`, `visitedDocs` (as array), `visitedSections` (as array), `theme`, `readingMode`, `fontSize`, `graphSyncedAt`.

**On rehydrate:** `visitedDocs` and `visitedSections` converted back to `Set`.

### 17.2 `gsd-doc-annotations` (Annotation[])

JSON array of `Annotation` (v2 schema). v1→v2 migrator adds `tags`, `status`, `pinned`, `updatedAt`.

### 17.3 `gsd-doc-annotations-trash` (Array<Annotation & {trashedAt}>)

Soft-deleted annotations. `purgeExpiredTrash()` removes entries older than `UNDO_WINDOW_MS = 6000`.

### 17.4 `gsd-doc-annotations-schema-version` (`"2"`)

Triggers migration on next load if `< CURRENT_SCHEMA_VERSION`.

### 17.5 `gsd-doc-recent-searches` (string[], top 5)

SearchDialog recent queries.

### 17.6 `gsd-cmd-recent` (string[], top 5)

CommandPalette recent IDs (separate from search).

### 17.7 `doc-sidebar-collapsed-groups` (string[])

DocSidebar collapsed group keys.

### 17.8 `doc-sidebar-width` / `backlinks-panel-width` (number)

ResizableAside widths.

### 17.9 Prisma SQLite (`db/custom.db`)

`User` + `Post` models only (default scaffold). **No domain entity is DB-backed.**

---

## 18. Styling & Theming

### 18.1 `src/app/globals.css` (1,072 lines, 4 logical sections)

**Section 1 — Imports + custom dark variant:**
```css
@import "tailwindcss";
@import "tw-animate-css";
@plugin "@tailwindcss/typography";
@custom-variant dark (&:is(.dark *, .opencode *));
```

The `@custom-variant dark` rule extends `dark:` to also fire under `.opencode` — lets OpenCode (dark-based) reuse all dark-mode utilities.

**Section 2 — `@theme inline` block:** Binds Tailwind v4 tokens to `hsl(var(--*))` CSS vars (`--color-background`, `--font-sans` → `--font-geist-sans`, sidebar tokens, semantic tokens, `chart-1..5`, radius).

**Section 3 — Theme blocks (4 + system):**

| Theme | Class | Aesthetic | Background |
|---|---|---|---|
| Light | `:root` | Pure white | `oklch(1 0 0)` |
| Dark | `.dark` | Near-black | `oklch(0.145 0 0)` |
| OpenCode | `.opencode` | Terminal-inspired (Claude Code) | `oklch(0.17 0.004 70)` (deep warm charcoal) |
| Ergonomic | `.ergonomic` | Warm sepia reading | `oklch(0.95 0.014 85)` (blue-light-reducing) |

OpenCode receives `.dark` class too (via the `@custom-variant` rule). Ergonomic does NOT.

**Section 4 — `@layer base`:** border-border, outline-ring/50, body styling, tabular-nums mono, theme-aware `::selection`, ergonomic serif prose typography, opencode mono UI + subtle dot-grid texture.

**highlight.js theme:** GitHub-light compatible with `.dark .hljs-*` overrides.

**Custom scrollbar:** `.scroll-area-thumb`, `[data-radix-scroll-area-viewport]`, `.scrollbar-thin`.

**Animation keyframes (14+):** `fade-in`, `slide-in-left`, `pop-in`, `shimmer`, `pulse-highlight`, `occurrence-jump-block-flash`, `occurrence-jump-token-flash`, `page-enter`, `content-enter`, `p0-pulse`, `critical-glow`, `quick-jump-flash-anim`.

**`prefers-reduced-motion`** disables all animations.

**Print styles** hide nav/sidebar, expand main, invert colors, `page-break-after: avoid` on h1/h2.

**`#md-container`** uses `--doc-font-size` variable (default 14px) — drives the font-size slider.

### 18.2 `src/components/theme-provider.tsx` (21 lines)

Thin wrapper around `next-themes`'s `NextThemesProvider`. Actual config at call site in `layout.tsx`.

### 18.3 `src/components/error-boundary.tsx` (110 lines)

Class component (React error-boundary API). Props: `children`, `label?`, `fallback?` (render-prop), `onReset?`. Default fallback: rose-tinted alert card with `role="alert"` + `aria-live="assertive"`, Retry + Go home buttons.

**Three usage levels:** top-level (`page.tsx`), around `<MarkdownRenderer>`, around `<DependencyGraphDialog>`.

---

## 19. Documentation Corpus

### 19.1 The 10 served documents (`consolidated-docs/`)

| # | File | Type | Order | Lines | KB | Role |
|---|---|---|---|---|---|---|
| 1 | PART-1-Diagnosis-Findings-and-As-Built-Reality.md | part | 1 | 1,494 | 224 | Unified diagnosis: 107 raw → 79 dedup findings fused with as-built Python reality |
| 2 | PART-2-The-Fix-Remediation-Plan-and-Roadmap.md | part | 2 | 979 | 86 | Remediation program: 35 tasks (B0–B12, C1–C16, R1–R5), 4 phases, gates G1/G2/G3 |
| 3 | PART-3-Synthesis-Unified-Verified-Project-Map.md | part | 3 | 369 | 69 | Capstone synthesis: one-sentence verdict, structural vs surgical defects |
| 4 | PART-4-Meta-Critique-of-the-Documents.md | part | 4 | 296 | 46 | Critic's stance on the docs themselves: 4-tier epistemology, omissions |
| 5 | BUG-DEPENDENCY-MAP.md | map | 20 | 1,487 | 99 | Navigational graph companion: §A–§H (graph source: §D-DATA YAML) |
| 6 | APPENDIX-SAFETY-PROCESS.md | appendix | 10 | 74 | 7 | DACVN/ECVCN sign-off spec + safety disclaimer surface |
| 7 | APPENDIX-VERIFICATION-LOG.md | appendix | 11 | 182 | 12 | Runtime evidence: exact commands + outputs |
| 8 | APPENDIX-GLOSSARY.md | appendix | 12 | 58 | 6 | Domain acronyms (AAFCO, DER, DOD, FEDIAF, NRC, RER, SUL, etc.) |
| 9 | APPENDIX-PUBLIC-HEALTH-AND-REGULATORY.md | appendix | 13 | 68 | 9 | AVMA/FDA/MAPA regulatory dimension |
| 10 | APPENDIX-ID-KEY.md | appendix | 14 | 234 | 20 | Global ID-key (121 distinct IDs → 77 unique defects) |

### 19.2 The ID taxonomy (load-bearing)

The corpus uses a structured ID convention that the reader's parser + renderer depend on:

- **A-series** (A1–A20): LP/OR Solver findings
- **B-series** (B1–B18): Canine Nutrition findings
- **C-series** (C1–C22): Data/Schema findings
- **D-series** (D1–D22): Validation findings
- **E-series** (E1–E23): Cross-cutting findings
- **Task IDs**: B0–B12 (Phase 1), C1–C16 (Phase 2), R1–R5 (Phase 3)
- **Gates**: G1, G2, G3
- **Legacy**: R-01..R-09
- **Governance**: R1..R7

**4 documented collisions** (C4, C7, C16, R1) where finding-IDs and task-IDs share prefixes — disambiguated in APPENDIX-ID-KEY.

### 19.3 The bug-dependency graph (36 nodes / 34 edges)

Embedded in `BUG-DEPENDENCY-MAP.md §D-DATA` as a schema-validated YAML block. Lanes: `intake`, `fix`, `verify` (kebab-case). Node ID regex: `^(B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5]|G[1-3])$`.

---

## 20. Architecture Review System

The reader app itself was reviewed by a 4-document system in `docs/architecture-review/`:

| # | File | Lines | Phase | Format |
|---|---|---|---|---|
| 0 | README.md | 85 | Index | Prose |
| 1 | 01-research.md | 593 | Phase 1: Context Gathering | Prose + code-blocks |
| 2 | 02-document1-systemic-review.md | 718 | Phase 2: Systemic Review (8 issues, 3 options each) | Prose + TS code-blocks |
| 3 | 03-document2-adversarial-dialectic.md | 1,021 | Phase 3: Dual-Persona Debate (6 decisions) | Debate prose + code-blocks |
| 4 | 04-document3-implementation-blueprint.md | 1,479 | Phase 4: A2A Blueprint (T1–T8c) | **A2A code-fenced** |

### 20.1 The 8-task execution plan (T1–T8c)

| Task | What | Status |
|---|---|---|
| T1 | Create `src/lib/contracts.ts` | ✅ Complete |
| T2 | Wire existing modules to contracts | ✅ Complete |
| T3 | `INDEX.yml` registry + never-throw parser | ✅ Complete |
| T4 | `POST`+`GET /api/dependency-graph/validate` | ✅ Complete |
| T5 | Schema-migration pattern (comment-only) | ✅ Complete |
| T6a | Extract `GraphLegend` | ✅ Complete |
| T6b | Extract `GraphToolbar` | ✅ Complete |
| T6c | Extract `GraphCanvas` + `useGraphViewport` (flag-gated) | ✅ Complete |
| T7 | ESLint rule banning raw dispatchEvent | ✅ Complete |
| T8a | Coverage script (deleted after verification) | ✅ Complete |
| T8b | Replace `BUG_FACTS` call sites with `useGraphNode` hybrid | ✅ Complete |
| T8c | Delete `bug-facts.ts` | ⛔ **BLOCKING-gated on §12.2 cold-start verification** |

### 20.2 §12 cross-cutting amendments (5 amendments + 1 consolidation)

- **§12.2 BLOCKING** — eager-fetch `graphNodes` on page mount (Strategy A; Strategy B lazy deleted).
- **§12.3** — env-var override for path resolution (`DOCS_DIR`).
- **§12.4** — tiered dispatch (`dispatchDocEvent` default + `dispatchDocEventChecked` opt-in).
- **§12.5** — validate `schemaVersion`; exact-case file existence gate.
- **§12.6** — robust popover-close fix (`target.closest` instead of `stopPropagation`) + Playwright regression gate.
- **§12.7** — `validateRegistry<T>()` consolidation.
- **§12.8** — `useGraphNode` O(1) Map lookup.

---

## 21. Integration Contract Summary

> **This is the section the integration team should depend on.** Everything above is descriptive; this section is the contract.

### 21.1 Stable imports you can depend on

**From `@/lib/contracts`:**
- `EVT` — event name registry (7 names, stable).
- `dispatchDocEvent(name, detail?)` — fire-and-forget dispatch.
- `dispatchDocEventChecked(name, detail?)` — boolean dispatch.
- `DocMeta`, `DocRegistry`, `DocMetaEntry`, `DocRegistryFile` — registry schemas.
- `RegistryResult<T>` interface + `validateRegistry<T>()` function.
- `CROSS_MODULE_PAYLOADS` — the 3 typed payload schemas.

**From `@/lib/paths` (server-only):**
- `getDocsDir()`, `getBugMapPath()`, `resolveDocPath(fileName)`, `exactCaseFileExists(dir, fileName)`.

**From `@/lib/doc-store`:**
- `useDocStore` hook (Zustand).
- All state slices + actions listed in §10.3.
- `signalDocJump()`, `signalDocJumpTo(sectionId)`, `signalDocJumpToOccurrence(id, occurrenceIndex)`.

**From `@/lib/dependency-graph`:**
- `GraphNode`, `GraphEdge`, `DependencyGraph`, `GraphValidationIssue`, `GraphValidationError`.
- `getDependencyGraph()`, `reparseDependencyGraphNow()`, `invalidateDependencyGraphCache()`, `getDependencyGraphCachedAt()`, `serializeDependencyGraph()`.
- `graphSourceSchema`, `parseGraphSource(yamlText)`, `extractGraphDataBlock(rawMarkdown)`, `checkReferentialIntegrity(source)`, `computeLayout(source)`.

**From `@/lib/bug-facts` (T8c-gated, may be deleted):**
- `BUG_FACTS`, `BugFact`, `getBugFact(id)`, `severityBadgeClass(severity)`.

**From `@/lib/api-utils`:**
- `rateLimit(request, capacity?)`, `isValidSlug(slug)`, `getClientIp(request)`.

**From `@/lib/annotation-highlights`:**
- Full CRUD: `loadAnnotations`, `saveAnnotations`, `addAnnotation`, `updateAnnotation`, `deleteAnnotation`, `restoreAnnotation`, `duplicateAnnotation`, `findDuplicate`.
- Bulk: `bulkUpdate`, `bulkDelete`, `bulkAddTag`, `bulkSetStatus`, `bulkSetPinned`.
- Search/stats: `searchAnnotations(filters)`, `getStats()`, `getAllTags()`.
- Export/import: `serializeAnnotations(anns, format)`, `importFromJSON(jsonText)`.
- Hooks: `useAnnotationHighlights(docSlug)`, `useAnnotationCount()`.
- Constants: `STORAGE_KEY`, `TRASH_KEY`, `MAX_ANNOTATIONS`, `UNDO_WINDOW_MS`, `MARK_ATTR`, `MARK_CLASS`.

**From `@/hooks/use-graph-node`:**
- `useGraphNode(id)`, `useGraphNodesStatus()`.

**From `@/lib/db`:**
- `db` (Prisma client singleton).

### 21.2 HTTP API contract (stable)

See §11 for full detail. Key endpoints:

- `GET /api/docs` — list (metadata-only, no `rawMarkdown`, no `section.content`).
- `GET /api/docs?slug=X` — single file (includes `rawMarkdown`).
- `GET /api/dependency-graph` — `{nodes, edges, sectionContent, generatedAt}`.
- `POST /api/dependency-graph/sync` — re-parse + cache invalidate. Fail-closed (422 on bad YAML, cache preserved).
- `GET /api/dependency-graph/sync` — cache timestamp probe.
- `POST /api/dependency-graph/validate` — dry-run validation (256KB cap, §12.7 RegistryResult shape).
- `GET /api/dependency-graph/validate` — on-disk re-validation.

### 21.3 Event contract (stable)

See §16.1 for the full event table. All 7 events are stable; payload schemas for the 3 typed events (`graph:synced`, `graph:open-at-node`, `doc:jumpto-occurrence`) are zod-enforced.

### 21.4 Persistence contract (stable)

See §17. All localStorage keys are documented. Annotation v2 schema is the current version; migrator handles v1→v2.

### 21.5 Integration hookpoints (from APP-OVERVIEW.md)

The app is designed to be embedded/wrapped/merged:

1. **Embed the route** — mount `/` in an iframe or webview.
2. **Read its API** — the 7 HTTP endpoints (§11).
3. **Drive via custom events** — dispatch `EVT.*` events on `window` (must go through `dispatchDocEvent`).
4. **Read its state** — subscribe to the Zustand store via `useDocStore` selectors.
5. **Extend docs/graph/bug-facts** — add files to `consolidated-docs/`, update `INDEX.yml`, edit `BUG-DEPENDENCY-MAP.md §D-DATA`.
6. **Swap storage** — replace localStorage in `annotation-highlights.ts` / `doc-store.ts` with API-backed persistence (requires extending Prisma schema).

### 21.6 What is NOT a stable contract

- The internal layout of `dependency-graph.tsx` (3,782 lines) — the orchestrator is mid-refactor (T6c split pending flag flip).
- The exact DOM structure of `MarkdownRenderer`'s output (depends on `react-markdown` version).
- The `BUG_FACTS` object (T8c-gated for deletion).
- The `window.__*` globals (F-06 tech debt, planned migration to refs/Zustand/WeakMap).
- The LegacyCanvas inline `<svg>` (will be deleted when `NEXT_PUBLIC_GRAPH_SPLIT=v1` becomes default).

---

## 22. Known Gaps & Risks

### 22.1 Architecture-level

1. **Prisma schema is unused scaffolding.** No domain entity is DB-backed. Cross-device sync of annotations/bookmarks/progress requires greenfield schema extension.
2. **`Post.authorId` has no `@relation`** to `User` — no referential integrity at DB layer.
3. **`DocFileMeta.type`** in `doc-store.ts` is `"part" | "appendix" | "map"` (no `"unlisted"`), but `contracts.DocMeta.type` and `docs-parser.DocType` include `"unlisted"`. Type mismatch if an unlisted doc reaches the client.
4. **`api-utils.ts` has no response wrappers or Cache-Control helpers** — handlers compose primitives manually.
5. **Rate limiter is in-memory + single-instance only.** Multi-instance deployment needs `@upstash/ratelimit` or similar.
6. **No auth anywhere.** All API routes public.

### 22.2 Graph subsystem

1. **`graph:synced` does NOT auto-refresh the Zustand `graphNodes` slice.** After a manual sync, ID-link popovers show stale data until next page mount. Most impactful gap. Fix: wire a listener in `doc-reader.tsx` or `doc-store.ts` that calls `fetchGraphNodes(true)` on `EVT.GraphSynced`.
2. **`GraphToolbar` lacks zoom in/out/reset/fit buttons.** Only `resetView` is exposed by `useGraphViewport`; the orchestrator's LegacyCanvas has its own inline zoom controls.
3. **`RESOLVED` status omitted from legend** even though `STATUS_COLOR.resolved` exists.
4. **T8c (delete `bug-facts.ts`) is BLOCKING-gated.** Still load-bearing for finding IDs (A1–A14, D1–D8, E1–E7) not in graph.
5. **`use-graph-viewport.ts` uses data-center zoom, not cursor-anchored zoom.** Sufficient for regression gate but not what users expect.
6. **`GET /api/dependency-graph` does NOT catch `GraphValidationError`.** Cold-start corrupt YAML → 500, cache stays empty.

### 22.3 Frontend

1. **`MarkdownRenderer` memoization is on `content + highlightId` only.** New props must be added to the comparator.
2. **`useSeverityRowColors` only re-runs on `content` change.** Runtime severity toggles require bumping `content`.
3. **Heading IDs assigned by `DocReader` effect #8, NOT by `ReactMarkdown`.** Components scrolling to headings must use retry loops.
4. **`data-id-link="<id>"` is load-bearing.** `doc:jumpto-occurrence` queries `[data-id-link="<id>"]` and picks the Nth match.
5. **Annotation marks applied imperatively** by `useAnnotationHighlights`, NOT by `MarkdownRenderer`. Changes to `data-doc-content` attribute or container structure break highlighting silently.
6. **Three annotation components always mounted** (not conditionally) — event listeners always active.
7. **`MermaidDiagram`'s `securityLevel: "strict"` + DOMPurify is a security contract.** Do NOT change to `"loose"` without re-auditing.

### 22.4 Operational

1. **`dev` script's `| tee` pipeline** causes sandbox process-reaping death. Use `dev-daemon.py`.
2. **4 GB cgroup memory limit** — Turbopack compile (~1.9 GB) + chrome (~1.1 GB) can OOM. Warm routes with `curl` before opening agent-browser; close browser promptly.
3. **No swap** (no passwordless sudo to create it).
4. **No Playwright installed** — `e2e/graph-canvas.spec.ts` is a SPEC ARTIFACT, not executable.
5. **`docs-parser.ts` imports `statSync` but never uses it** — dead import.
6. **`bug-facts.ts` is a static mirror** — can drift from §D-DATA.

### 22.5 Documentation

1. **3 numeric reconciliation discrepancies** (per `verification-report.md`): (a) "77 findings" headline vs §10.1's 88 rows; (b) "28 tasks" headline vs Part 2 §15's "35 tasks"; (c) graph `NODE_TABLE` missing C3 + edge deltas vs §E.4.
2. **Hardcoded path portability** — set `DOCS_DIR` env var when integrating at a non-default path.

### 22.6 Recommended next-phase priorities

1. **Wire `graph:synced` → `fetchGraphNodes(true)`** (highest impact, lowest effort).
2. **Extend Prisma schema** for `Annotation`, `Bookmark`, `UserProgress` models; migrate `annotation-highlights.ts` and `doc-store.ts` from localStorage to API-backed persistence (enables cross-device sync).
3. **Add response wrappers** (`jsonResponse`, `errorResponse`, `withCache`) to `api-utils.ts`.
4. **Wire next-auth** — `next-auth@^4.24.11` is installed but no `/api/auth` route exists.
5. **Pass §12.2 cold-start verification** and ship T8c (delete `bug-facts.ts`).
6. **Flip `NEXT_PUBLIC_GRAPH_SPLIT=v1`** default after pixel-diff verification; delete LegacyCanvas.
7. **Install Playwright** and activate `e2e/graph-canvas.spec.ts`.
8. **Migrate `window.__*` globals** to refs/Zustand/WeakMap (F-06).

---

*End of specification. Generated from a 6-agent parallel reconnaissance of the codebase; every claim verified against source. For the integration team: depend on §21 (Integration Contract Summary) for stable surfaces; consult §22 (Known Gaps) before extending.*
