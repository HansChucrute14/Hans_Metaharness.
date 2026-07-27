# GSD Audit Dashboard — Complete Technical Specification

> **Version**: Multi-Project Architecture (post-blueprint implementation)
> **Framework**: Next.js 16 App Router + TypeScript 5 + Prisma ORM (SQLite)
> **Purpose**: Exhaustive reference for software integration. Every component, every data flow, every interface is documented.

---

## TABLE OF CONTENTS

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Database Layer (Prisma/SQLite)](#2-database-layer-prismasqlite)
3. [Server-Side Infrastructure](#3-server-side-infrastructure)
4. [API Routes — Complete Endpoint Reference](#4-api-routes--complete-endpoint-reference)
5. [Client-Side Data Layer (Hooks)](#5-client-side-data-layer-hooks)
6. [Client-Side State Management](#6-client-side-state-management)
7. [Component Architecture](#7-component-architecture)
8. [Multi-Project System](#8-multi-project-system)
9. [Audit Configuration Engine](#9-audit-configuration-engine)
10. [AI Integration Engine](#10-ai-integration-engine)
11. [GitHub Integration Engine](#11-github-integration-engine)
12. [Opencode Harness Engine](#12-opencode-harness-engine)
13. [Export & Reporting System](#13-export--reporting-system)
14. [Keyboard Shortcuts & Command Palette](#14-keyboard-shortcuts--command-palette)
15. [localStorage & Migration](#15-localstorage--migration)
16. [Caching Architecture](#16-caching-architecture)
17. [Rendering Pipeline & SSR Strategy](#17-rendering-pipeline--ssr-strategy)
18. [Security Model](#18-security-model)
19. [Integration Points for External Software](#19-integration-points-for-external-software)
20. [Current Feature Inventory](#20-current-feature-inventory)
21. [UI/UX Design System](#21-uiux-design-system)
22. [Tab-by-Tab User Experience Flows](#22-tab-by-tab-user-experience-flows)
23. [Component UX Reference — Detailed Component Catalog](#23-component-ux-reference--detailed-component-catalog)
24. [Health Score & Metrics Algorithms](#24-health-score--metrics-algorithms)
25. [Search, Filter & Navigation Engine](#25-search-filter--navigation-engine)
26. [Comparison & Batch Operations System](#26-comparison--batch-operations-system)
27. [Chart & Visualization System](#27-chart--visualization-system)
28. [Modal, Dialog & Panel Systems](#28-modal-dialog--panel-systems)
29. [Forms & Input Systems](#29-forms--input-systems)
30. [Toast & Notification System](#30-toast--notification-system)
31. [CSS Animation & Motion System](#31-css-animation--motion-system)
32. [Responsive Design Architecture](#32-responsive-design-architecture)
33. [Error, Loading & Empty State Patterns](#33-error-loading--empty-state-patterns)
34. [shadcn/ui Component Library Reference](#34-shadcnui-component-library-reference)
35. [Package Dependencies & Third-Party Libraries](#35-package-dependencies--third-party-libraries)

---

## 1. SYSTEM ARCHITECTURE OVERVIEW

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ React 19     │  │ TanStack     │  │ Framer Motion         │  │
│  │ Components   │←→│ Query v5     │←→│ (animations)          │  │
│  │ (30 custom)  │  │ (cache layer)│  │                       │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘  │
│                           │                                      │
│  ┌──────────────┐  ┌──────┴───────┐  ┌──────────────────────┐  │
│  │ Project      │  │ localStorage │  │ shadcn/ui +          │  │
│  │ Context      │  │ (progress,   │  │ Lucide icons          │  │
│  │ (provider)   │  │  activity)   │  │ (40 primitives)       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                           │                                      │
│                     fetch('/api/*?projectId=X')                  │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                     NEXT.JS SERVER                               │
│                           │                                      │
│  ┌──────────┐  ┌─────────┴──────────┐  ┌──────────────────────┐ │
│  │ layout   │  │ API Routes (16)     │  │ Server Utilities     │ │
│  │ (server  │  │ /api/findings/*     │  │ getActiveProjectId() │ │
│  │  comp)   │  │ /api/project        │  │ getGitHubConfig()    │ │
│  │          │  │ /api/config          │  │ validateProjectId()  │ │
│  │ generate │  │ /api/ai/*           │  │ github-utils         │ │
│  │ Metadata │  │ /api/github/*       │  │ renderTemplate()     │ │
│  └──────────┘  │ /api/opencode       │  └──────────────────────┘ │
│                └─────────┬──────────┘                            │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────────────────┐  │
│  │              PRISMA ORM (SQLite)                           │  │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │  │
│  │  │Projec│ │Findin│ │AuditC│ │GitHub│ │OpenCo│ │AIConn│  │  │
│  │  │  t   │ │  g   │ │onfig │ │Config│ │deSet │ │ector │  │  │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │                                       │
│  ┌───────────────────────┴───────────────────────────────────┐  │
│  │              EXTERNAL SERVICES                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │  │
│  │  │ GitHub   │ │ Local    │ │ Opencode │ │ z-ai SDK │     │  │
│  │  │ REST/    │ │ LLM      │ │ HTTP API │ │ (cloud   │     │  │
│  │  │ GraphQL  │ │ (Ollama/ │ │ (port    │ │ fallback │     │  │
│  │  │ API      │ │  llama/  │ │  4096)   │ │ for AI)  │     │  │
│  │  │          │ │  custom) │ │          │ │          │     │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Summary

```
User Action → React Component → TanStack Query/Mutation hook
  → fetch('/api/...?projectId=X') → Next.js API Route
  → getActiveProjectId(request) → resolve projectId
  → Prisma query (where: { projectId }) → SQLite
  → JSON response → TanStack Query cache → React re-render
```

For mutations:
```
User Action → React Component → TanStack Mutation hook
  → fetch('/api/...?projectId=X', { method: POST/PUT/DELETE })
  → API Route → Prisma write → SQLite
  → onSuccess: invalidateQueries(['findings', 'projects', ...])
  → router.refresh() → TanStack Query refetch → React re-render
```

### 1.3 Provider Nesting Order (CRITICAL for integration)

```
<ThemeProvider>          ← next-themes (class-based dark mode)
  <QueryProvider>        ← TanStack Query (QueryClientProvider)
    <ProjectProvider>    ← ProjectContext (active project state)
      <DashboardClient>  ← Main app component
```

**Why this order matters**: `ProjectProvider` uses `useQueryClient()` from `QueryProvider`. `DashboardClient` uses `useProject()` from `ProjectProvider`. Reversing this order crashes the app.

---

## 2. DATABASE LAYER (Prisma/SQLite)

### 2.1 Database Configuration

| Property | Value |
|----------|-------|
| Engine | SQLite (file: `db/custom.db`) |
| ORM | Prisma Client JS |
| Client location | `src/lib/db.ts` (singleton) |
| Schema location | `prisma/schema.prisma` |
| Seed script | `prisma/seed.ts` |
| Migration command | `bun run db:push` (schema push, no migration files) |
| Seed command | `bun run prisma:seed` |

### 2.2 Prisma Models — Complete Schema

#### Project (Root Entity)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `name` | `String` | required | Display name (e.g., "Hans-GSD-Raw-Calculator") |
| `description` | `String` | `@default("")` | Project description |
| `repoOwner` | `String` | required | GitHub repo owner (e.g., "HansChucrte14") |
| `repoName` | `String` | required | GitHub repo name (e.g., "Hans-GSD-Raw-Calculator") |
| `isActive` | `Boolean` | `@default(true)` | Whether project is active (can be switched) |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |

**Relations (all `onDelete: Cascade`)**:
- `findings Finding[]`
- `auditConfigs AuditConfig[]`
- `githubConfigs GitHubConfig[]`
- `opencodeSettings OpencodeSetting[]`
- `auditNotes AuditNote[]`
- `gitHubSyncLogs GitHubSyncLog[]`
- `opencodeActions OpencodeAction[]`

#### Finding (Core Audit Entity)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `task` | `String` | required | Task identifier ("1", "2", "X1", "D-E12") — NOT globally unique |
| `findingIds` | `String` | required | JSON array of finding IDs: `["A3","A2","B2"]` |
| `title` | `String` | required | Finding title |
| `tier` | `String` | required | Tier: "tier0", "tier1", "tier2", "deferred", "additional" |
| `severity` | `String` | required | Severity: "critical", "high", "medium", "low" |
| `category` | `String` | required | Category: "Data Integrity", "Input Validation", etc. |
| `summary` | `String` | required | One-sentence finding summary |
| `claim` | `String` | `@default("")` | What the finding claims about the code |
| `evidence` | `String` | `@default("")` | Evidence supporting the claim |
| `verificationStatus` | `String` | `@default("confirmed-execution")` | Verification method |
| `verificationNote` | `String?` | optional | Additional verification notes |
| `dependsOn` | `String` | `@default("None")` | Dependencies on other tasks |
| `affectedFiles` | `String` | required | JSON array: `["solver.py", "constraints.json"]` |
| `unifiedModuleId` | `String?` | optional FK | FK to `UnifiedExecutionModule.id` |
| `githubIssueUrl` | `String?` | optional | URL of the created GitHub issue |
| `githubIssueNumber` | `Int?` | optional | GitHub issue number |
| `githubSyncedAt` | `DateTime?` | optional | Last sync timestamp |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` with `onDelete: Cascade` |

**Unique Constraints**:
- `@@unique([projectId, task])` — task is unique within a project, NOT globally

**Relations**:
- `project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)`
- `proposals Proposal[]` (cascade on finding delete)
- `codeSnippets CodeSnippet[]` (cascade on finding delete)
- `bestAnalysis BestProposalAnalysis?` (cascade on finding delete)
- `auditNotes AuditNote[]` (cascade on finding delete)
- `module UnifiedExecutionModule? @relation(fields: [unifiedModuleId], references: [id])` (no cascade — module is global)

#### Proposal (Remediation Option)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `findingId` | `String` | required FK | FK to `Finding.id` (cascade delete) |
| `index` | `Int` | required | Proposal position: 0, 1, 2 |
| `title` | `String` | required | Proposal title |
| `description` | `String` | required | Proposal description |
| `effort` | `String` | required | Effort: "low", "medium", "high" |
| `risk` | `String` | required | Risk: "low", "medium", "high" |
| `reversible` | `Boolean` | `@default(true)` | Whether the fix is reversible |

#### CodeSnippet (Code Evidence)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `findingId` | `String` | required FK | FK to `Finding.id` (cascade delete) |
| `file` | `String` | required | File path (e.g., "solver.py") |
| `lines` | `String` | required | Line range (e.g., "45-67") |
| `language` | `String` | `@default("python")` | Programming language |
| `code` | `String` | required | The actual code snippet |

#### BestProposalAnalysis (Best Proposal Decision)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `findingId` | `String` | `@unique`, required FK | FK to `Finding.id` (cuid) — ALWAYS unique, NOT task string |
| `bestSoloIndex` | `Int` | required | Index of best solo proposal (0, 1, 2) |
| `bestSoloReason` | `String` | required | Why this proposal is best |
| `hybridNote` | `String?` | optional | Hybrid proposal explanation |
| `unifiedModuleId` | `String?` | optional | Which unified module this maps to |

**Critical Design Decision**: `findingId` uses `Finding.id` (cuid), NOT `Finding.task` (string). This ensures uniqueness across projects since `task` is only unique per-project.

#### UnifiedExecutionModule (Cross-Finding Fix Group)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key (also semantic: "nutrient_report", "module_integrity", etc.) |
| `title` | `String` | required | Module title |
| `subtitle` | `String` | required | Module subtitle |
| `coreIdea` | `String` | required | The core idea of the unified fix |
| `addresses` | `String` | required | JSON array of task strings this module addresses |
| `fixes` | `String` | required | JSON array of fix descriptions |
| `effort` | `String` | required | Effort: "low", "medium", "high" |
| `risk` | `String` | required | Risk: "low", "medium", "high" |
| `keyInsight` | `String` | required | Key insight about the fix |
| `elegantSolution` | `String` | required | Elegant solution description |

**Design Decision**: `UnifiedExecutionModule` is a GLOBAL entity — no `projectId` FK. Modules are shared across projects because they represent abstract fix patterns, not project-specific findings.

#### AuditNote (Progress Tracking)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `findingId` | `String` | required FK | FK to `Finding.id` (cuid) — NOT task string |
| `note` | `String` | required | Free-text note |
| `status` | `String` | `@default("not-started")` | Status: "not-started", "in-progress", "fixed", "wont-fix" |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade delete) |

**Critical Design Decision**: `AuditNote` has TWO FK relations — `findingId → Finding.id` AND `projectId → Project.id`. Both have `onDelete: Cascade`. This ensures notes are cleaned up if either the finding or the project is deleted.

#### AIConnector (Local LLM Configuration — GLOBAL, no projectId)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `name` | `String` | `@unique` | Connector name ("ollama", "lmstudio", "custom") |
| `type` | `String` | required | Type: "ollama", "openai-compatible", "custom" |
| `endpointUrl` | `String` | required | URL: "http://localhost:11434" |
| `modelName` | `String?` | optional | Model: "llama3", "codellama" |
| `temperature` | `Float` | `@default(0.7)` | LLM temperature |
| `maxTokens` | `Int` | `@default(4096)` | Max response tokens |
| `isActive` | `Boolean` | `@default(false)` | Whether this is the active connector (only one at a time) |
| `lastPingAt` | `DateTime?` | optional | Last successful connection test |
| `status` | `String` | `@default("disconnected")` | Status: "connected", "disconnected", "error" |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |

**Design Decision**: `AIConnector` has NO `projectId` — it's a global entity. LLM connectors are shared across all projects because they represent a system resource (local inference server), not project-specific configuration.

#### OpencodeSetting (Per-Project Opencode Configuration)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `binaryPath` | `String` | `@default("opencode")` | Path to opencode binary |
| `workspacePath` | `String` | `@default("")` | Working directory |
| `model` | `String` | `@default("claude-sonnet-4-20250514")` | Default model |
| `endpointUrl` | `String` | `@default("http://localhost:4096")` | HTTP API endpoint |
| `autoReview` | `Boolean` | `@default(false)` | Auto-review on file changes |
| `syncToGithub` | `Boolean` | `@default(true)` | Auto-sync changes to GitHub |
| `isActive` | `Boolean` | `@default(false)` | Whether Opencode is active |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade) |

**Unique Constraint**: `@@unique([projectId])` — one OpencodeSetting per project.

#### OpencodeAction (AI Action Log)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `action` | `String` | required | Action type: "analyze", "fix", "review", "test", "refactor" |
| `task` | `String?` | optional | Finding.task if related |
| `prompt` | `String` | required | The prompt sent to Opencode |
| `contextJson` | `String` | `@default("{}")` | JSON context data |
| `status` | `String` | `@default("queued")` | Status: "queued", "running", "completed", "failed" |
| `sessionId` | `String?` | optional | Opencode session ID |
| `result` | `String?` | optional | Output from Opencode |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `settingsId` | `String` | required FK | FK to `OpencodeSetting.id` (cascade) |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade) |

#### AuditConfig (Per-Project Configurable Audit Parameters)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `key` | `String` | required | Config key: "severity_levels", "tier_labels", "categories", etc. |
| `value` | `String` | required | JSON string containing the config data |
| `isDefault` | `Boolean` | `@default(true)` | Whether this is unmodified default config |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade) |

**Unique Constraint**: `@@unique([projectId, key])` — each config key is unique within a project.

**All possible `key` values**: `severity_levels`, `tier_labels`, `categories`, `audit_statuses`, `verification_statuses`, `effort_levels`, `risk_levels`, `module_ids`, `repo_info`, `g3_blocked`, `narrative_templates`, `export_templates`, `active_project`

#### GitHubConfig (Per-Project GitHub Configuration)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `key` | `String` | required | Key: "github_token", "repo_owner", "repo_name", "project_number" |
| `value` | `String` | required | The actual value (token, owner, etc.) |
| `isEncrypted` | `Boolean` | `@default(false)` | Whether stored encrypted (future feature) |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `updatedAt` | `DateTime` | `@updatedAt` | Auto-updated timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade) |

**Unique Constraint**: `@@unique([projectId, key])`

#### GitHubSyncLog (Sync History)

| Field | Type | Constraints | Purpose |
|-------|------|-------------|---------|
| `id` | `String` | `@id @default(cuid())` | Primary key |
| `direction` | `String` | required | "pull" (GitHub→app) or "push" (app→GitHub) |
| `action` | `String` | required | "sync", "create-issue", "update-status", "add-comment" |
| `task` | `String?` | optional | Finding.task if related |
| `issueNumber` | `Int?` | optional | GitHub issue number |
| `details` | `String` | `@default("")` | Human-readable details |
| `success` | `Boolean` | `@default(true)` | Whether the sync succeeded |
| `createdAt` | `DateTime` | `@default(now())` | Creation timestamp |
| `projectId` | `String` | required FK | FK to `Project.id` (cascade) |

### 2.3 Cascade Delete Chain

When a `Project` is deleted, ALL child records are atomically removed:

```
Project DELETE → Cascade:
  ├── Finding[] DELETE → Cascade:
  │   ├── Proposal[] DELETE
  │   ├── CodeSnippet[] DELETE
  │   ├── BestProposalAnalysis? DELETE
  │   └── AuditNote[] DELETE
  ├── AuditConfig[] DELETE
  ├── GitHubConfig[] DELETE
  ├── OpencodeSetting DELETE → Cascade:
  │   └── OpencodeAction[] DELETE
  ├── AuditNote[] DELETE (direct FK)
  ├── GitHubSyncLog[] DELETE
  └── OpencodeAction[] DELETE (direct FK)
```

**UnifiedExecutionModule** and **AIConnector** are NOT cascaded — they are global entities.

---

## 3. SERVER-SIDE INFRACTION

### 3.1 Active Project Resolution (`get-active-project.ts`)

**Location**: `src/lib/get-active-project.ts`

**Function**: `getActiveProjectId(request?: NextRequest) → Promise<string | null>`

**3-Level Fallback Chain** (executed in order):

| Level | Source | Logic |
|-------|--------|-------|
| 1 | Query param | `request.url → searchParams.get('projectId')` — explicit override |
| 2 | DB AuditConfig | `db.auditConfig.findFirst({ where: { key: 'active_project' } })` → try/catch on `JSON.parse(value)` → handles both string and `{projectId: "..."}` object formats |
| 3 | DB Project record | `db.project.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })` — first active project |

**In-Memory Cache**: 60-second TTL. Variable: `cached: CachedProjectId | null`. Invalidation: `invalidateActiveProjectCache()` — called after PUT /api/project.

**Error Handling**: All DB operations wrapped in try/catch. JSON.parse failures fall through to Level 3. Returns `null` if no project can be resolved.

### 3.2 GitHub Configuration Resolution (`github-config.ts`)

**Location**: `src/lib/github-config.ts`

**Function**: `getGitHubConfig(projectId: string) → Promise<CachedConfig>`

**Resolution Chain** (per key, DB-first):

| Key | DB Source | .env Fallback | Project Record Fallback |
|-----|-----------|---------------|------------------------|
| `github_token` | `GitHubConfig` row | `process.env.GITHUB_TOKEN` | none |
| `repo_owner` | `GitHubConfig` row | `process.env.GITHUB_REPO_OWNER` | `Project.repoOwner` |
| `repo_name` | `GitHubConfig` row | `process.env.GITHUB_REPO_NAME` | `Project.repoName` |
| `project_number` | `GitHubConfig` row | none | none |

**In-Memory Cache**: 60-second TTL, keyed by `projectId`. Cache is invalidated when projectId changes or `invalidateGitHubConfigCache()` is called.

**Token Masking**: `listGitHubConfigValues()` masks `github_token` to first 4 + last 4 characters (`ghp_...abcd`).

### 3.3 GitHub Utilities (`github-utils.ts`)

**Location**: `src/lib/github-utils.ts`

| Function | Purpose | Returns |
|----------|---------|---------|
| `detectTokenType(token)` | Detects classic (`ghp_`) vs fine-grained (`github_pat_`) vs unknown | `TokenType` |
| `verifyTokenFullAccess(token, owner, repo)` | 3-step verification: user auth → repo access → issue access | `TokenVerificationResult` with pass/fail/skip per step |
| `githubApiHeaders(token, includeContentType)` | Standard GitHub API headers (Bearer, Accept, X-GitHub-Api-Version) | `Record<string, string>` |
| `getAuditLabelDefinitions()` | Returns 12 predefined audit label definitions (severity, tier, status) | `Record<string, {color, description}>` |
| `ensureAuditFindingLabel(owner, repo, token)` | Creates `audit-finding` label in repo if missing | `boolean` |
| `ensureLabelsExist(owner, repo, token, labelNames)` | Ensures all referenced labels exist; creates missing ones | `{created, existing, failed}` |

### 3.4 Template Rendering (`audit-utils.ts`)

**Location**: `src/lib/audit-utils.ts`

**Function**: `renderTemplate(template: string, data: Record<string, unknown>) → string`

**Mechanism**: Simple `{key}` substitution. Finds all `{variable}` patterns in the template string and replaces with the corresponding value from `data`.

**Null Handling** (critical edge case): `null` and `undefined` are replaced with empty string `""`, NOT `"null"` text. This prevents `typeof null === 'object' → JSON.stringify(null) → "null"` bug.

**Available Template Variables** (validated by config PUT handler):

| Variable | Source | Type |
|----------|--------|------|
| `{task}` | `Finding.task` | string |
| `{title}` | `Finding.title` | string |
| `{severity}` | `Finding.severity` | string |
| `{tier}` | `Finding.tier` | string |
| `{category}` | `Finding.category` | string |
| `{claim}` | `Finding.claim` | string |
| `{evidence}` | `Finding.evidence` | string |
| `{verificationStatus}` | `Finding.verificationStatus` | string |
| `{verificationNote}` | `Finding.verificationNote` | string |
| `{dependsOn}` | `Finding.dependsOn` | string |
| `{affectedFiles}` | `Finding.affectedFiles` (joined) | string |
| `{findingIds}` | `Finding.findingIds` (joined) | string |
| `{summary}` | `Finding.summary` | string |
| `{proposalCount}` | `Finding.proposals.length` | number |
| `{moduleTitle}` | `UnifiedExecutionModule.title` | string |
| `{moduleSubtitle}` | `UnifiedExecutionModule.subtitle` | string |
| `{repoOwner}` | `Project.repoOwner` | string |
| `{repoName}` | `Project.repoName` | string |
| `{repoUrl}` | Computed from owner+name | string |
| `{projectName}` | `Project.name` | string |
| `{projectId}` | `Project.id` | string |

---

## 4. API ROUTES — COMPLETE ENDPOINT REFERENCE

All routes are under `/api/`. All require `projectId` resolution (except `AIConnector` routes and `/api` root).

### 4.1 Project Management — `/api/project`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/project` | None (uses cookie/header) | `{projects: ProjectSummary[], activeProjectId: string|null}` | `db.project.findMany` with `_count.findings` |
| POST | `/api/project` | `{name, repoOwner, repoName, description?}` (body) | `{project: {...}}` (201) | `db.project.create` + `db.auditConfig.create` (×11 default configs) + `db.gitHubConfig.create` (×2) |
| PUT | `/api/project` | `{projectId}` (body) | `{activeProjectId, project, message}` | `db.project.findUnique` + `db.auditConfig.upsert` (key: `active_project`) |
| DELETE | `/api/project` | `?projectId=X` (query) | `{deleted, projectId, projectName, message}` | `db.project.findUnique` + `db.project.delete` (cascade) |

**POST creates 13 DB rows**: 1 Project + 11 AuditConfig defaults + 2 GitHubConfig defaults (repo_owner, repo_name).

### 4.2 Findings CRUD — `/api/findings`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/findings` | None (uses `getActiveProjectId`) | `{findings: Finding[], analyses: BestProposalAnalysis[]}` | `db.finding.findMany` (include: proposals, codeSnippets, bestAnalysis, module) |
| POST | `/api/findings` | Full Finding object (body) + optional `projectId` | `{finding: {...}}` (201) | `db.finding.create` (nested: proposals, codeSnippets) |

**JSON serialization**: `findingIds` and `affectedFiles` are stringified on write, parsed on read.

**Error handling**: Prisma P2002 → 409 Conflict (duplicate `projectId_task`).

### 4.3 Single Finding — `/api/findings/[task]`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| PUT | `/api/findings/[task]` | `task` (URL segment) + partial Finding (body) | `{finding: {...}}` | `db.finding.update({ where: { projectId_task } })` |
| DELETE | `/api/findings/[task]` | `task` (URL segment) | `{success: true}` | `db.finding.delete({ where: { projectId_task } })` |

**Composite unique**: `where: { projectId_task: { projectId, task } }` — task is NOT globally unique.

### 4.4 Batch Import — `/api/findings/batch`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| POST | `/api/findings/batch` | `{findings: Finding[], projectId?}` (body) | `{created: number, skipped: number, errors: string[]}` (201) | For each: `db.finding.findUnique({ where: { projectId_task } })` → skip if exists → `db.finding.create` |

**Idempotent**: Skips findings that already exist by `projectId_task`.

### 4.5 Audit Notes — `/api/findings/notes/[task]`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| PUT | `/api/findings/notes/[task]` | `task` (URL) + `{note?, status?}` (body) | `{note: {...}}` | Find by `projectId_task` → `db.auditNote.findFirst({ where: { findingId } })` → create or update |

**Two-step lookup**: First resolves `Finding.id` from `task` via composite unique, then finds/upserts `AuditNote` by `findingId` FK.

### 4.6 Execution Modules — `/api/findings/modules`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/findings/modules` | None (uses `getActiveProjectId`) | `{modules: UnifiedModule[], analyses: BestProposalAnalysis[], g3Blocked: G3BlockedItem[]}` | `db.unifiedExecutionModule.findMany` + `db.bestProposalAnalysis.findMany` + `db.auditConfig.findUnique` (key: `g3_blocked`) |

**g3_blocked** is read from `AuditConfig` table (NOT hardcoded).

### 4.7 AI Analysis — `/api/ai/analyze`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| POST | `/api/ai/analyze` | `{task, title, severity?, ...}` (body) + optional `projectId` | `{analysis: string, source: "cloud"|"local:<name>", projectId}` | `db.project.findUnique` + `db.aIConnector.findFirst({ where: { isActive: true } })` |

**Fallback chain**: Active local LLM → `proxyToLocalLLM()` → cloud AI via `z-ai-web-dev-sdk`.

**Local LLM protocol support**: Ollama (`/api/chat`), OpenAI-compatible (`/v1/chat/completions`).

### 4.8 AI Connector Management — `/api/ai/connector`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/ai/connector` | None (or `?action=list-models&connector=<name>`) | `{connectors: AIConnectorData[]}` or `{models: string[], connectorName, endpointUrl}` | `db.aIConnector.findMany` or `db.aIConnector.findUnique` → `fetchAvailableModels()` |
| POST | `/api/ai/connector` | Test: `{endpointUrl, type}` or Chat: `{action: "chat", messages, connectorName?, model?}` | Test: `{success, message, models}` or Chat: `{reply, connectorName, model, source}` | `db.aIConnector.updateMany` (test: updates status) or `db.aIConnector.findUnique` (chat: resolves connector) |
| PUT | `/api/ai/connector` | `{name, type, endpointUrl, modelName?, temperature?, maxTokens?, isActive?}` | `{connector: {...}}` | If `isActive`: deactivate all others → `db.aIConnector.upsert({ where: { name } })` |
| DELETE | `/api/ai/connector` | `?name=X` (query) | `{deleted: true}` | `db.aIConnector.delete({ where: { name } })` |

**Connector type support**: Ollama, llama.cpp, Ik_Llama.cpp, Opencode Desktop, OpenAI-compatible, custom.

**Single active connector rule**: Only one `isActive: true` connector at a time. PUT with `isActive: true` deactivates all others.

### 4.9 Audit Configuration — `/api/config`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/config` | None (or `?key=X`) | All configs: `{configs: {key: {value, isDefault}}}` or Single: `{key, value, isDefault}` | `db.auditConfig.findMany` or `db.auditConfig.findUnique` (with DEFAULT_CONFIGS fallback) |
| PUT | `/api/config` | `{key, value, projectId?}` (body) | `{config: {...}}` | `db.auditConfig.upsert({ where: { projectId_key } })` |
| DELETE | `/api/config` | `?key=X` (query) | `{deleted: true, revertedTo: object|null, message}` | `db.auditConfig.delete({ where: { projectId_key } })` |
| POST | `/api/config` | None | `{reset: true, seeded: number, projectId, message}` | `db.auditConfig.deleteMany` + `db.auditConfig.create` (×all defaults) |

**Dynamic injection**: `repo_info` and `active_project` are injected from Project record, not stored in AuditConfig.

**Template validation**: PUT for `narrative_templates` or `export_templates` keys validates `{variable}` patterns against `KNOWN_TEMPLATE_VARS` whitelist.

### 4.10 Opencode Harness — `/api/opencode`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/opencode` | None (uses `getActiveProjectId`) | `{configured, available, message, settings?, serverReachable?, healthData?}` | `db.opencodeSetting.findUnique({ where: { projectId } })` |
| POST | `/api/opencode` | `{action, task?, context?, projectId?}` (body) | Sync (analyze/review): `{live, sessionId, reply, message}` or Async: `{live, queued, prompt, message}` | `db.opencodeSetting.findUnique` → `db.opencodeAction.create` + Optional Opencode HTTP API calls |
| PUT | `/api/opencode` | `{binaryPath?, model?, endpointUrl?, ...}` (body) | `{settings: {...}}` | `db.opencodeSetting.findUnique` → update or create |
| DELETE | `/api/opencode` | None (uses `getActiveProjectId`) | `{deleted: true}` | `db.opencodeSetting.findUnique` → delete if exists |

**Opencode HTTP API integration**:
- Session creation: `POST /session` → `{id}`
- Prompt submission: `POST /session/{id}/message` → response
- Health check: `GET /global/health` (5s timeout)
- Sync mode (analyze/review): waits for AI response
- Async mode (fix/test/refactor): queued, returns manual command as fallback

### 4.11 GitHub Token — `/api/github/token`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/github/token` | None (uses `getActiveProjectId`) | `{configured, valid?, username?, message, source?, repoOwner?, repoName?, ...}` | Uses `getGitHubConfig` + `verifyTokenFullAccess` |
| PUT | `/api/github/token` | `{token, projectId?}` (body) | `{saved, valid?, username?, message, ...}` | `saveGitHubConfigValue('github_token', token)` |
| DELETE | `/api/github/token` | None | `{removed, message}` | `deleteGitHubConfigValue('github_token')` |

### 4.12 GitHub Issues — `/api/github/issues`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/github/issues` | None (uses `getActiveProjectId`) | `{issues: [...], sync: {totalFindings, findingsWithIssues, ...}}` | `db.finding.findMany` (local) + GitHub REST API (remote) |

### 4.13 GitHub Issue Creation — `/api/github/issue`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| POST | `/api/github/issue` | `{task, title, severity?, ...}` (body) | `{issueUrl, issueNumber, issueId}` | `db.finding.findUnique` → GitHub REST create → `db.finding.update` (save URL) + `db.githubSyncLog.create` |

**Idempotent**: Returns existing issue URL if `githubIssueUrl` already stored on the finding.

### 4.14 GitHub Project Board — `/api/github/project`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/github/project` | `?projectNumber=N` (query) | `{exists, projectId?, projectTitle?, ...}` | Uses `getGitHubConfig` → GitHub GraphQL |
| POST | `/api/github/project` | `{issueNodeId, projectNumber}` (body) | `{success, projectId, projectTitle, projectNumber}` | GitHub GraphQL `addProjectV2ItemById` mutation |

### 4.15 GitHub Bidirectional Sync — `/api/github/sync`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/github/sync` | None (uses `getActiveProjectId`) | `{syncResults: [...], summary: {...}, timestamp}` | `db.finding.findMany` → GitHub API → `db.finding.update` + `db.auditNote.create/update` |
| POST | `/api/github/sync` | `{tasks: string[], action: "create-issue"|"update-status", projectId?}` (body) | `{results: [...], summary, timestamp}` | Per task: `db.finding.findUnique` → GitHub API → `db.finding.update` + `db.githubSyncLog.create` |

**Pull mode** (GET): Fetches all audit-related GitHub issues, matches to local findings by issue number or task regex, syncs issue state into AuditNote (closed→fixed/wont-fix, open+in-progress→in-progress).

**Push mode** (POST): Creates GitHub issues from findings, or pushes local status to GitHub (close for fixed/wont-fix, reopen for others).

### 4.16 GitHub Configuration — `/api/github/config`

| Method | Path | Request | Response | DB Ops |
|--------|------|---------|----------|--------|
| GET | `/api/github/config` | None (uses `getActiveProjectId`) | `{effective: {hasToken, owner, repo, projectNumber}, storedValues, envFallback}` | `listGitHubConfigValues` |
| POST | `/api/github/config` | `{key, value, projectId?}` (body) | `{saved, key, value, message}` | `saveGitHubConfigValue` |
| DELETE | `/api/github/config` | `?key=X` (query) | `{deleted, key, message}` | `deleteGitHubConfigValue` |

---

## 5. CLIENT-SIDE DATA LAYER (Hooks)

### 5.1 TanStack Query v5 Configuration

**Provider**: `src/components/query-provider.tsx`

```typescript
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,  // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
})
```

### 5.2 useQuery Hooks (Read-Only, Cached)

| Hook | queryKey | Endpoint | staleTime | Return Type |
|------|----------|----------|-----------|-------------|
| `useAuditConfig()` | `['audit-config', activeProjectId]` | `GET /api/config` | 5min | `AuditConfigData` (flattened) |
| `useAIConnectorStatus()` | `['ai-connectors']` | `GET /api/ai/connector` | 5min | `AIConnectorListResult` |
| `useOpencodeStatus()` | `['opencode-status', activeProjectId]` | `GET /api/opencode` | 5min | `{configured, available, ...}` |
| `useGitHubTokenStatus()` | `['github-token-status', activeProjectId]` | `GET /api/github/token` | 5min | `GitHubTokenStatus` |
| `useGitHubIssues()` | `['github-issues', activeProjectId]` | `GET /api/github/issues` | 5min | `GitHubIssuesSync` |
| `useGitHubConfig()` | `['github-config', activeProjectId]` | `GET /api/github/config` | 5min | `GitHubConfigResponse` |

**Pattern**: Read hooks use `useQuery` with `placeholderData` for smooth transitions. Data is cached for 5 minutes. Queries are disabled (`enabled: !!activeProjectId`) when no project is selected.

**`useAuditConfig` special**: Flattens `{key: {value, isDefault}}` → `{key: value}` via `flattenConfigResponse()`. Uses `DEFAULT_CONFIGS` as `placeholderData` so the UI never shows empty configs.

### 5.3 useMutation Hooks (Write Operations)

| Hook | Endpoint | Method | Invalidates | Special |
|------|----------|--------|-------------|---------|
| `useCreateFinding()` | `/api/findings` | POST | `['findings']` + `router.refresh()` | |
| `useUpdateFinding()` | `/api/findings/[task]` | PUT | `['findings']` + `router.refresh()` | |
| `useDeleteFinding()` | `/api/findings/[task]` | DELETE | `['findings']` + `router.refresh()` | |
| `useBatchImport()` | `/api/findings/batch` | POST | `['findings']` + `router.refresh()` | |
| `useSaveNote()` | `/api/findings/notes/[task]` | PUT | `['findings']` + `router.refresh()` | |
| `useCreateGitHubIssue()` | `/api/github/issue` | POST | `['github-issues']` + `router.refresh()` | |
| `useAddToProject()` | `/api/github/project` | POST | none | |
| `useSaveGitHubToken()` | `/api/github/token` | PUT | `['github-token-status']` | |
| `useVerifyGitHubProject()` | `/api/github/project` | GET-like | none | |
| `useDeleteGitHubToken()` | `/api/github/token` | DELETE | `['github-token-status']` | |
| `useAIAnalysis()` | `/api/ai/analyze` | POST | none | |
| `useTestAIConnector()` | `/api/ai/connector` | POST | none | Global (no projectId) |
| `useSaveAIConnector()` | `/api/ai/connector` | PUT | `['ai-connectors']` | Global |
| `useListAIModels()` | `/api/ai/connector` | GET-like | none | Global |
| `useDeleteAIConnector()` | `/api/ai/connector` | DELETE | `['ai-connectors']` | Global |
| `useSendToOpencode()` | `/api/opencode` | POST | `['opencode-status']` | |
| `useSaveOpencodeSettings()` | `/api/opencode` | PUT | `['opencode-status']` | |
| `useDeleteOpencodeSettings()` | `/api/opencode` | DELETE | `['opencode-status']` | |
| `useGitHubPullSync()` | `/api/github/sync` | GET-like | `['github-issues']`, `['findings']` + `router.refresh()` | **useMutation** (POST sync, not useQuery) |
| `useGitHubPushSync()` | `/api/github/sync` | POST | `['github-issues']`, `['findings']` + `router.refresh()` | |
| `useSaveGitHubConfigValue()` | `/api/github/config` | POST | `['github-config']` | |

### 5.4 Helper Function: `withProjectId()`

**Location**: `src/lib/use-findings.ts`

```typescript
function withProjectId(base: string, activeProjectId: string | null): string
```

Appends `?projectId={id}` or `&projectId={id}` to a URL. Used by all mutation hooks to scope API requests to the active project.

### 5.5 Activity Log (localStorage-based)

| Function | Purpose | Storage Key |
|----------|---------|-------------|
| `getActivityLog(activeProjectId?)` | Read activity entries | `activity-log-{projectId}` |
| `addActivityEntry(entry, activeProjectId?)` | Add entry (max 100) | `activity-log-{projectId}` |
| `clearActivityLog(activeProjectId?)` | Clear all entries | `activity-log-{projectId}` |
| `exportActivityLog(activeProjectId?)` | JSON export | `activity-log-{projectId}` |

**Activity types**: `status_change`, `note_save`, `bookmark`, `issue_create`, `filter_change`, `ai_analysis`, `export`, `github_sync`, `opencode_action`

---

## 6. CLIENT-SIDE STATE MANAGEMENT

### 6.1 Provider Architecture

| Provider | Location | Wraps | Purpose |
|----------|----------|-------|---------|
| `ThemeProvider` | `src/components/theme-provider.tsx` | `QueryProvider` | next-themes (class-based, light/dark/system) |
| `QueryProvider` | `src/components/query-provider.tsx` | `ProjectProvider` | TanStack Query client (5min staleTime) |
| `ProjectProvider` | `src/lib/project-context.tsx` | `DashboardClient` | Active project state + localStorage migration |

### 6.2 ProjectContext (`src/lib/project-context.tsx`)

**Exports**:
- `ProjectProvider` — React context provider
- `useProject()` — context consumer hook (throws if outside provider)

**Context Value**:

```typescript
interface ProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string) => void  // calls queryClient.clear() before switching
  projects: ProjectSummary[]
  activeProject: ProjectSummary | null
  isLoading: boolean
}
```

**Internal hooks**:
- `useQuery(['projects'])` — fetches project list from `/api/project` (5min staleTime)
- `useMutation` — `PUT /api/project` to set active project; on success invalidates `['projects']`, `['audit-config']`, `['findings']`

**Race condition fix**: `setActiveProjectId()` calls `queryClient.clear()` BEFORE switching project to prevent stale data from previous project briefly appearing during refetch.

**localStorage migration**: On mount, migrates old `gsd-*` keys to new project-scoped keys (one-time).

### 6.3 Audit Progress (`src/lib/use-audit-progress.ts`)

**NOT a TanStack Query hook** — pure React `useState`/`useEffect` with localStorage.

**Hook**: `useAuditProgress(findingTasks: string[])`

**Returns**:

```typescript
{
  statuses: StatusMap,     // Record<string, AuditStatus>
  notes: NotesMap,        // Record<string, string>
  loaded: boolean,
  setStatus: (task, status) => void,
  setNote: (task, note) => void,
  getNote: (task) => string,
  resetAll: () => void,
  stats: {
    counts: Record<AuditStatus, number>,
    total: number,
    resolved: number,
    percentComplete: number,
    percentInProgress: number,
    remaining: number,
  }
}
```

**localStorage keys**: `audit-statuses-v1-{projectId}`, `audit-notes-v1-{projectId}`

---

## 7. COMPONENT ARCHITECTURE

### 7.1 Rendering Pipeline

```
layout.tsx (Server Component)
  → generateMetadata() → DB lookup for dynamic title
  → <ThemeProvider>
    → <QueryProvider>
      → page.tsx (force-dynamic)
        → <ClientOnlyDashboard>
          → dynamic import with ssr:false
            → <DashboardMount>
              → requestAnimationFrame → setMounted(true)
                → <DashboardClient> (the full dashboard)
                  → <ProjectProvider>
                    → All dashboard tabs + panels
```

**Why this pipeline**: `layout.tsx` is a server component (can't use hooks). `generateMetadata()` handles the dynamic title. `ClientOnlyDashboard` uses `dynamic({ ssr: false })` to avoid server-side rendering of the massive client dashboard. `DashboardMount` adds a requestAnimationFrame delay to prevent hydration mismatches.

### 7.2 Core Components

| Component | Lines | Purpose | Key Hooks |
|-----------|-------|---------|-----------|
| `dashboard-client.tsx` | ~945 | Main dashboard shell: tabs, header, keyboard shortcuts, floating stats | `useProject`, `useAuditConfig`, `useHealthScore`, `useQuickWins`, TanStack hooks |
| `overview-tab-content.tsx` | ~600 | Overview tab: summary cards, health gauge, quick wins, charts | `useAuditProgress`, `useHealthScore`, `useQuickWins` |
| `findings-tab-content.tsx` | ~500 | Findings list with filters, sorting, bulk actions | `useAuditProgress`, finding mutations |
| `unified-tab-content.tsx` | ~400 | Unified execution modules view | Module data, bestAnalysis |
| `roadmap-tab-content.tsx` | ~300 | Phase roadmap + dependency flow | `useAuditProgress` |
| `admin-tab.tsx` | ~1520 | Admin panel: finding CRUD, GitHub, AI, Opencode, project, config | All admin mutations |
| `finding-card.tsx` | ~300 | Individual finding card with expand/collapse | `useAuditProgress` |
| `finding-dialog.tsx` | ~400 | Full finding detail modal | Finding data, proposals, snippets |

### 7.3 Specialized Components

| Component | Purpose | Mechanism |
|-----------|---------|-----------|
| `health-score-gauge.tsx` | 0-100 health score visualization | `useHealthScore` hook: weighted calculation from finding statuses + severity/tier |
| `quick-wins-panel.tsx` | Quick win suggestions (low effort, high impact) | `useQuickWins` hook: filters findings by effort=low + tier≥tier1 |
| `risk-matrix.tsx` | 4×4 severity×tier risk matrix | `getRiskMatrix()` from `audit-utils.ts` using config weights |
| `remediation-velocity.tsx` | Remediation velocity chart | `useAuditProgress.stats` → progress tracking |
| `phase-dependency-flow.tsx` | Dependency graph visualization | Finding `dependsOn` field → directed edges |
| `dependency-graph.tsx` | Interactive dependency graph | Same data, interactive visualization |
| `activity-log.tsx` | Recent activity timeline | `getActivityLog()` from localStorage |
| `audit-progress.tsx` | Progress bar + stats | `useAuditProgress.stats` |
| `audit-config-editor.tsx` | Edit audit configuration in admin | `useAuditConfig` + config mutations |
| `ai-analysis-panel.tsx` | AI analysis of findings | `useAIAnalysis` mutation |
| `ai-connector-panel.tsx` | Local LLM connector management | `useAIConnectorStatus` (useQuery) + connector mutations |
| `ai-chat-panel.tsx` | Floating AI chat window | `useAIChat` (local) + `useAIConnectorStatus` (useQuery for status) |
| `github-sync-panel.tsx` | Bidirectional GitHub sync UI | `useGitHubPullSync`, `useGitHubPushSync` (both useMutation) |
| `opencode-panel.tsx` | Opencode harness management | `useOpencodeStatus` (useQuery) + opencode mutations |
| `command-palette.tsx` | ⌘K command palette | Custom state + keyboard events |
| `project-section.tsx` | Project management in admin | `useProject` + project mutations |
| `project-selector.tsx` | Header dropdown for project switching | `useProject` |
| `keyboard-shortcuts.tsx` | Global keyboard shortcut handler | `useEffect` + keydown events |
| `compare-drawer.tsx` | Side-by-side finding comparison | `comparisonFields` from audit-types |
| `batch-actions-toolbar.tsx` | Bulk status changes | `useAuditProgress.setStatus` |
| `filter-presets.tsx` | Saved filter presets | localStorage |
| `saved-views.tsx` | Saved view configurations | localStorage |
| `file-tree-view.tsx` | Affected files tree view | `getAffectedFilesStats()` |
| `search-enhancement.tsx` | Enhanced finding search | Client-side search over findings |
| `export-enhancements.tsx` | JSON/CSV/Markdown/PDF export | `renderTemplate()` + client-side generation |
| `floating-stats.tsx` | Sticky summary stats bar | `useAuditProgress.stats` |
| `animated-counter.tsx` | Animated number counter | Framer Motion number animation |
| `timeline-view.tsx` | Timeline-based finding view | `useAuditProgress` + finding data |

---

## 8. MULTI-PROJECT SYSTEM

### 8.1 Architecture

The app supports unlimited projects, each with independent:
- Findings, proposals, code snippets
- Audit configuration (severity, tiers, categories, templates)
- GitHub configuration (token, repo, project board)
- Opencode settings (model, endpoint, harness)
- Audit notes, sync logs, action logs
- localStorage progress data

### 8.2 Project Resolution Chain

**Server-side** (every API route):
1. Query param `projectId=X` → immediate return
2. AuditConfig `active_project` key → `JSON.parse` with try/catch → handles both string and `{projectId: "..."}` object
3. First active `Project` record → `findFirst({ where: { isActive: true } })`

**Client-side** (ProjectProvider):
1. `useQuery(['projects'])` fetches project list + `activeProjectId` from `/api/project`
2. `activeProjectId` initialized from API response on first load
3. `setActiveProjectId(id)` → `queryClient.clear()` → state update → `PUT /api/project` mutation

### 8.3 Project Lifecycle

| Action | Flow | Side Effects |
|--------|------|--------------|
| **Create** | POST `/api/project` → `db.project.create` + seed 13 default configs | `invalidateActiveProjectCache()` |
| **Switch** | PUT `/api/project` → `db.auditConfig.upsert` (key: `active_project`) | `queryClient.clear()` on client; invalidate `['projects']`, `['audit-config']`, `['findings']` |
| **Delete** | DELETE `/api/project?projectId=X` → `db.project.delete` (cascade) | ALL child records deleted atomically; `invalidateActiveProjectCache()` |

---

## 9. AUDIT CONFIGURATION ENGINE

### 9.1 Config Keys and Their Shapes

| Key | Value Shape | Purpose |
|-----|------------|---------|
| `severity_levels` | `Record<Severity, {label, weight, color, border}>` | Severity display + risk scoring weights |
| `tier_labels` | `Record<Tier, {short, full, color, weight}>` | Tier display + risk scoring weights |
| `categories` | `string[]` | Available finding categories |
| `audit_statuses` | `Record<string, {label, color, bg, icon}>` | Audit workflow statuses |
| `verification_statuses` | `Record<string, {label, color, badge}>` | Verification method labels |
| `effort_levels` | `Record<string, {label, hours, color}>` | Effort level definitions |
| `risk_levels` | `Record<string, {label, reversible, color}>` | Risk level definitions |
| `module_ids` | `Record<string, {title, short}>` | Unified module definitions |
| `repo_info` | `{owner, name, url, description}` | Repository metadata (dynamically injected from Project record) |
| `g3_blocked` | `Array<{task, title, canShipNow, needsReview}>` | Gate-3 blocked items (config-driven, NOT hardcoded) |
| `narrative_templates` | `Record<string, string>` | Display format templates with `{variable}` substitution |
| `export_templates` | `Record<string, string|string[]>` | Export format templates |
| `active_project` | `{projectId, projectName}` or plain string | Active project reference |

### 9.2 Config Resolution Flow

```
Client: useAuditConfig() → useQuery(['audit-config', projectId])
  → GET /api/config → API Route
  → db.auditConfig.findMany({ where: { projectId } })
  → Merge DB values over DEFAULT_CONFIGS fallbacks
  → Inject repo_info + active_project from Project record
  → flattenConfigResponse(): {key: {value, isDefault}} → {key: value}
  → Return AuditConfigData
```

### 9.3 Config Mutation Flow

```
Client: AuditConfigEditor → save
  → PUT /api/config {key, value}
  → API validates key exists in DEFAULT_CONFIGS
  → If key is narrative_templates or export_templates: validateTemplateVars()
  → db.auditConfig.upsert({ where: { projectId_key }, data: {value, isDefault: false} })
  → Return updated config
```

---

## 10. AI INTEGRATION ENGINE

### 10.1 Local LLM Proxy Architecture

**Supported connector types**:

| Type | Default Port | Chat Protocol | Model List Protocol |
|------|-------------|---------------|---------------------|
| Ollama | 11434 | `POST /api/chat` | `GET /api/tags` |
| llama.cpp | 8080 | `POST /v1/chat/completions` | `GET /v1/models` |
| Ik_Llama.cpp | 8081 | `POST /v1/chat/completions` | `GET /v1/models` |
| OpenAI-compatible | varies | `POST /v1/chat/completions` | `GET /v1/models` |
| Opencode Desktop | varies | Opencode SDK | `GET /provider` |
| Custom | varies | Configurable | Configurable |

### 10.2 AI Chat Panel Engine

**Component**: `src/components/ai-chat-panel.tsx`

**Hook**: `useAIChat()` (defined inside the component, NOT exported)

**Chat flow**:
```
User types message → sendMessage()
  → Build outbound: strip local-only fields (timestamp, pending, error)
  → POST /api/ai/connector { action: "chat", messages, connectorName, model }
  → Server resolves active connector → proxyChatToConnector()
  → Returns {reply, connectorName, model, source}
  → Append assistant message to local messages array
```

**Status resolution**: `useAIConnectorStatus()` (useQuery) → `statusQuery.data` → `useMemo` derives matched connector.

### 10.3 AI Analysis Engine

**Component**: `src/components/ai-analysis-panel.tsx`

**Hook**: `useAIAnalysis()` (useMutation)

**Flow**:
```
User clicks "Analyze" → useAIAnalysis.mutate({task, title, severity, ...})
  → POST /api/ai/analyze
  → Server: check active local LLM → proxyToLocalLLM() → fallback to z-ai-web-dev-sdk
  → Return {analysis, source}
  → Display analysis result
```

### 10.4 Single Active Connector Rule

Only one `AIConnector` can have `isActive: true` at a time. When a connector is activated via `PUT /api/ai/connector` with `isActive: true`, the server first runs `db.aIConnector.updateMany({ where: { isActive: true }, data: { isActive: false } })` to deactivate all others, then upserts the target.

---

## 11. GITHUB INTEGRATION ENGINE

### 11.1 Architecture

```
GitHubConfig (DB) ──── token, repo_owner, repo_name, project_number
     │
     ├── .env fallback ── GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME
     │
     └── Project record fallback ── repoOwner, repoName

getGitHubConfig(projectId) ──── resolves all 4 values with 60s cache
     │
     ├── REST API ──── issue CRUD, label management
     │
     └── GraphQL API ──── project board operations (addProjectV2ItemById)
```

### 11.2 Bidirectional Sync

**Pull (GET `/api/github/sync`)**:
- Fetch all audit-related issues from GitHub (`audit-finding` label or `[audit-finding]` in title)
- Match to local findings by issue number OR task ID regex
- Sync issue state → AuditNote status (closed→fixed/wont-fix, open+in-progress→in-progress)
- Create AuditNote if none exists

**Push (POST `/api/github/sync`)**:
- `create-issue`: Create GitHub issue from local finding + label it
- `update-status`: Push local status to GitHub (close for fixed/wont-fix, reopen for others)
- Supports `"all"` pseudo-task to operate on all findings

### 11.3 Issue Creation Format

**Labels applied**: `severity:{severity}`, `tier:{tier}`, `category:{category}`, `audit-finding`

**Issue body**: Generated via `buildIssueMarkdown()` → includes severity, tier, claim, evidence, affected files, proposals

**Idempotency**: If `finding.githubIssueUrl` already exists, returns existing URL instead of creating duplicate.

---

## 12. OPENCODE HARNESS ENGINE

### 12.1 Opencode HTTP API Integration

**Session-based interaction**:

```
1. Create session: POST {baseUrl}/session → {id: sessionId}
2. Send prompt: POST {baseUrl}/session/{sessionId}/message → {response}
3. Retrieve results: GET {baseUrl}/session/{sessionId}/messages
```

### 12.2 Action Modes

| Action | Mode | Returns | Purpose |
|--------|------|---------|---------|
| `analyze` | Synchronous | AI reply text | Analyze a finding |
| `review` | Synchronous | AI reply text | Review code changes |
| `fix` | Asynchronous | Manual command fallback | Generate fix code |
| `test` | Asynchronous | Manual command fallback | Generate tests |
| `refactor` | Asynchronous | Manual command fallback | Refactor code |

**Fallback when server unreachable**: Action is logged in DB (`OpencodeAction.status: "queued"`), manual `opencode run` command provided as fallback.

---

## 13. EXPORT & REPORTING SYSTEM

### 13.1 Export Formats

| Format | Mechanism | Template Source |
|--------|-----------|----------------|
| Enhanced JSON | Client-side JSON.stringify with custom fields | `export_templates.json_fields` |
| Enhanced Markdown | Client-side Markdown generation | `export_templates.markdown_sections` + `narrative_templates` |
| CSV | Client-side CSV generation | `export_templates.csv_columns` + `export_templates.csv_headers` |
| Print/PDF | Browser `window.print()` | Print CSS in `globals.css` (`.no-print` hidden) |

### 13.2 Template-Driven Export

All export formats use `renderTemplate()` from `audit-utils.ts`:

```typescript
renderTemplate(template: string, data: Record<string, unknown>): string
// Example: renderTemplate('{task}: {title} — {severity}', {task: '1', title: '...', severity: 'critical'})
// → "1: Data Integrity Issue — critical"
```

Null/undefined values → empty string (not "null").

---

## 14. KEYBOARD SHORTCUTS & COMMAND PALETTE

### 14.1 Global Keyboard Shortcuts

| Shortcut | Action | Component |
|----------|--------|-----------|
| `j/k` | Navigate findings (next/prev) | `keyboard-shortcuts.tsx` |
| `1-6` | Switch tabs (Overview, Findings, Roadmap, Unified, Files, Deps, Admin) | `keyboard-shortcuts.tsx` |
| `s` | Toggle sort order | `keyboard-shortcuts.tsx` |
| `f` | Focus filter | `keyboard-shortcuts.tsx` |
| `b` | Toggle bookmark on focused finding | `keyboard-shortcuts.tsx` |
| `a` | Set status to "in-progress" | `keyboard-shortcuts.tsx` |
| `x` | Set status to "fixed" | `keyboard-shortcuts.tsx` |
| `w` | Set status to "wont-fix" | `keyboard-shortcuts.tsx` |
| `r` | Reset status to "not-started" | `keyboard-shortcuts.tsx` |
| `⌘K` / `Ctrl+K` | Open command palette | `command-palette.tsx` |
| `Shift+A` | Open AI chat panel | `ai-chat-panel.tsx` |
| `Escape` | Close dialog/panel | Various components |

### 14.2 Command Palette

**Component**: `src/components/command-palette.tsx`

**Trigger**: `⌘K` / `Ctrl+K`

**Actions available**: Switch tabs, navigate findings, change statuses, export data, open admin sections, toggle theme.

---

## 15. LOCALSTORAGE & MIGRATION

### 15.1 Key Registry

| Key Pattern | Module | Data Stored |
|-------------|--------|-------------|
| `audit-statuses-v1-{projectId}` | `use-audit-progress.ts` | `Record<string, AuditStatus>` |
| `audit-notes-v1-{projectId}` | `use-audit-progress.ts` | `Record<string, string>` |
| `activity-log-{projectId}` | `use-findings.ts` | `ActivityEntry[]` (max 100) |

### 15.2 Migration Strategy

**One-time migration on mount** (in `ProjectProvider`):

| Old Key | New Key | Migration Logic |
|---------|---------|-----------------|
| `gsd-audit-statuses-v1` | `audit-statuses-v1-default` | Copy value → delete old key |
| `gsd-audit-notes-v1` | `audit-notes-v1-default` | Copy value → delete old key |
| `gsd-activity-log` | `activity-log-default` | Copy value → delete old key |

**Prevention**: Only migrates if new key doesn't already exist (prevent overwrite).

---

## 16. CACHING ARCHITECTURE

### 16.1 Server-Side In-Memory Caches

| Module | Variable | TTL | Invalidation Trigger |
|--------|----------|-----|---------------------|
| `get-active-project.ts` | `cached: CachedProjectId` | 60s | `invalidateActiveProjectCache()` (after PUT/DELETE /api/project) |
| `github-config.ts` | `cached: CachedConfig` | 60s | `invalidateGitHubConfigCache()` (after token/config save/delete) |

### 16.2 Client-Side TanStack Query Caches

| queryKey | staleTime | Refetch Trigger |
|----------|-----------|-----------------|
| `['projects']` | 5min | `setActiveMutation` onSuccess |
| `['audit-config', projectId]` | 5min | `setActiveMutation` onSuccess |
| `['findings']` | 5min | Create/Update/Delete/Batch/Note mutations |
| `['github-issues', projectId]` | 5min | Create issue, pull/push sync |
| `['github-token-status', projectId]` | 5min | Save/delete token |
| `['ai-connectors']` | 5min | Save/delete connector |
| `['opencode-status', projectId]` | 5min | Send/save/delete opencode |
| `['github-config', projectId]` | 5min | Save config value |

**Full cache clear**: `queryClient.clear()` on project switch (race condition fix).

---

## 17. RENDERING PIPELINE & SSR STRATEGY

### 17.1 Server Components

| Component | Role | Hooks? | Data Source |
|-----------|------|--------|-------------|
| `layout.tsx` | Root layout + metadata | No (server) | `generateMetadata()` → direct DB query |
| `page.tsx` | Route entry point | No (server) | None (delegates to client) |

### 17.2 Client Components

| Component | SSR? | Hydration Strategy |
|-----------|------|---------------------|
| `ClientOnlyDashboard` | No (`dynamic({ ssr: false })`) | Loads entirely client-side |
| `DashboardMount` | No | `requestAnimationFrame` delay prevents hydration mismatch |
| `DashboardClient` | No | Full client-side rendering |
| All other components | No | Rendered within `DashboardClient` |

### 17.3 Why No SSR for Dashboard

The dashboard is ~2000+ lines of interactive React with TanStack Query, localStorage, Framer Motion animations, and project context. SSR would cause:
- Hydration mismatches (client state vs server state)
- Slow server renders (massive component tree)
- localStorage not available on server

Instead, `page.tsx` uses `force-dynamic` + `ClientOnlyDashboard` with `ssr: false`. The server only renders a tiny loading spinner, and the full dashboard loads client-side.

---

## 18. SECURITY MODEL

### 18.1 Authentication

No built-in authentication. All API routes are open. Security relies on:
- Network-level access control (Caddy reverse proxy)
- GitHub token stored in DB (masked in responses)
- No user model (removed in blueprint Step 1.10)

### 18.2 Input Validation

| Route | Validation | Method |
|-------|-----------|--------|
| `/api/project` POST | Required fields: `name`, `repoOwner`, `repoName` | Manual check |
| `/api/findings` POST | Required fields: `task`, `title`, `tier`, `severity`, `category`, `summary` | Manual check |
| `/api/config` PUT | Key must exist in `DEFAULT_CONFIGS`; template variable validation | `validateTemplateVars()` |
| `/api/github/config` POST | Key restricted to: `repo_owner`, `repo_name`, `project_number` | Whitelist check |
| `/api/github/token` PUT | Token validated via `verifyTokenFullAccess()` | 3-step GitHub API check |

### 18.3 Token Security

- GitHub tokens stored in `GitHubConfig` table (DB-first, `.env` fallback)
- Token masking in responses: `ghp_...abcd` (first 4 + last 4)
- `isEncrypted` field exists but not yet implemented (future feature)

---

## 19. INTEGRATION POINTS FOR EXTERNAL SOFTWARE

### 19.1 API Integration (REST)

All endpoints are RESTful JSON. To integrate:

1. **Resolve active project**: Call `GET /api/project` → get `activeProjectId`
2. **Scope all requests**: Add `?projectId={activeProjectId}` to all subsequent calls
3. **Authentication**: None required (open API). Add your own auth layer via middleware.

**Key endpoints for integration**:

| Purpose | Endpoint | Method |
|---------|----------|--------|
| Get all findings | `/api/findings?projectId=X` | GET |
| Create a finding | `/api/findings?projectId=X` | POST |
| Update a finding | `/api/findings/{task}?projectId=X` | PUT |
| Delete a finding | `/api/findings/{task}?projectId=X` | DELETE |
| Batch import | `/api/findings/batch?projectId=X` | POST |
| Get audit config | `/api/config?key=severity_levels&projectId=X` | GET |
| Update audit config | `/api/config` | PUT |
| Get modules | `/api/findings/modules?projectId=X` | GET |
| Get notes | `/api/findings/notes/{task}?projectId=X` | PUT |
| Create GitHub issue | `/api/github/issue?projectId=X` | POST |
| Pull GitHub sync | `/api/github/sync?projectId=X` | GET |
| Push GitHub sync | `/api/github/sync?projectId=X` | POST |
| AI analysis | `/api/ai/analyze?projectId=X` | POST |
| AI chat | `/api/ai/connector` | POST |
| Project CRUD | `/api/project` | GET/POST/PUT/DELETE |

### 19.2 Database Integration (Prisma)

To integrate directly with the database:

1. **Schema file**: `prisma/schema.prisma`
2. **Client**: `src/lib/db.ts` (PrismaClient singleton)
3. **Database file**: `db/custom.db` (SQLite)
4. **Migration**: `bun run db:push` (schema push)
5. **Seed**: `bun run prisma:seed` (default data)

**Key models for integration**:
- `Project` → root entity, all others reference `projectId`
- `Finding` → core audit data, composite unique `@@unique([projectId, task])`
- `AuditConfig` → configuration engine, composite unique `@@unique([projectId, key])`
- `GitHubConfig` → GitHub settings, composite unique `@@unique([projectId, key])`

### 19.3 Template System Integration

To use the template system from external software:

1. **Read templates**: `GET /api/config?key=narrative_templates&projectId=X`
2. **Render**: Use `renderTemplate(template, data)` logic — find `{variable}` patterns, substitute with data values, null→empty string
3. **Validated variables**: 24 known template variables (see Section 3.4)
4. **Validate**: `PUT /api/config` validates `{variable}` patterns against `KNOWN_TEMPLATE_VARS` whitelist

### 19.4 WebSocket Integration

**Not currently implemented** but architecture supports it via mini-services pattern:
- Create a new Bun project in `mini-services/` directory
- Use socket.io with specific port
- Frontend connects via `io("/?XTransformPort={Port}")`
- Caddy gateway proxies WebSocket connections

### 19.5 External AI Integration

**Two paths**:

1. **Local LLM proxy**: Configure an `AIConnector` via `PUT /api/ai/connector` → the server proxies requests to your local LLM endpoint
2. **Cloud AI**: The `z-ai-web-dev-sdk` provides cloud AI as fallback when no local connector is active

**Supported protocols**: Ollama `/api/chat`, OpenAI `/v1/chat/completions`, custom endpoints.

### 19.6 GitHub Integration

**Requirements**: GitHub personal access token (classic or fine-grained) with repo + issue permissions.

**Setup**:
1. Save token: `PUT /api/github/token {token: "ghp_..."}?projectId=X`
2. Configure repo: `POST /api/github/config {key: "repo_owner", value: "owner"}?projectId=X`
3. Verify: `GET /api/github/token?projectId=X` → 3-step verification

**GraphQL operations**: Project board items via `addProjectV2ItemById` mutation.

---

---

## 20. CURRENT FEATURE INVENTORY

This section enumerates every feature the application currently contains — what exists right now, as deployed.

### 20.1 Dashboard Shell

| Feature | Location | Status |
|---------|----------|--------|
| 7-tab navigation (Overview, Findings, Roadmap, Unified, Files, Dependencies, Admin) | `dashboard-client.tsx` | ✅ Live |
| Sticky header with project selector, theme toggle, 12 toolbar buttons | `dashboard-client.tsx` | ✅ Live |
| Reading progress bar (gradient red→orange→yellow, width = scroll %) | `dashboard-client.tsx` | ✅ Live |
| Scroll-to-top button (appears at 400px scroll) | `dashboard-client.tsx` | ✅ Live |
| Footer with project stats | `dashboard-client.tsx` | ✅ Live |
| Multi-project selector (dropdown menu) | `project-selector.tsx` | ✅ Live |
| Light/Dark/System theme toggle | `dashboard-client.tsx` → next-themes | ✅ Live |
| Command palette (⌘K) | `command-palette.tsx` | ✅ Live |
| Keyboard shortcuts (20+ bindings) | `keyboard-shortcuts.tsx` | ✅ Live |
| Loading skeleton (animated ShieldAlert + 3 bouncing dots) | `dashboard-client.tsx` | ✅ Live |

### 20.2 Overview Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| 4 animated stat cards (Total Verified, Critical Issues, Solution Proposals, Affected Files) | `overview-tab-content.tsx` → `animated-counter.tsx` | ✅ Live |
| Health Score gauge (0–100, SVG arc, letter grade A+ through F) | `health-score-gauge.tsx` | ✅ Live |
| Remediation Velocity tracker (accelerating/steady/stalled/not-started) | `remediation-velocity.tsx` | ✅ Live |
| Quick Wins panel (top 5 by impact-to-effort ratio) | `quick-wins-panel.tsx` | ✅ Live |
| Audit Progress tracker (donut chart, status grid, effort estimate) | `audit-progress.tsx` | ✅ Live |
| 6 chart cards (Severity Donut, Verification Bar, Effort Distribution, Category Breakdown, Tier×Severity Stack, Affected Files Heatmap) | `charts.tsx` | ✅ Live |
| Interactive 4×4 Risk Matrix (clickable cells → deep dive) | `risk-matrix.tsx` | ✅ Live |
| Risk Score Summary (top-5 riskiest findings) | `overview-tab-content.tsx` | ✅ Live |
| Key Corrections Alert (amber-themed, 3 numbered items) | `overview-tab-content.tsx` | ✅ Live |
| Sequencing Summary (5 phase cards + Critical Next Action banner) | `overview-tab-content.tsx` | ✅ Live |
| Verification Methodology card | `overview-tab-content.tsx` | ✅ Live |

### 20.3 Findings Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| Search input with "/" shortcut | `findings-tab-content.tsx` | ✅ Live |
| 4 filter dropdowns (Severity, Verification, Category, Status) with counts | `findings-tab-content.tsx` | ✅ Live |
| 3 built-in filter presets (Critical Only, Ready to Fix, In Progress) | `filter-presets.tsx` | ✅ Live |
| Custom filter preset save/delete | `filter-presets.tsx` → localStorage | ✅ Live |
| Saved views (save/apply/delete/export/import JSON) | `saved-views.tsx` → localStorage | ✅ Live |
| Sort by tier/severity/risk score | `findings-tab-content.tsx` | ✅ Live |
| Tier sub-tabs (All + 5 tier-specific tabs with counts) | `findings-tab-content.tsx` | ✅ Live |
| Deep dive banner (from Risk Matrix cell click) | `findings-tab-content.tsx` | ✅ Live |
| Bulk select mode (checkboxes on each card) | `findings-tab-content.tsx` + `finding-card.tsx` | ✅ Live |
| Quick stats banner (TierSeverityBar per tier) | `findings-tab-content.tsx` | ✅ Live |
| Expand/collapse all toggle | `findings-tab-content.tsx` | ✅ Live |
| Finding cards with expandable accordion | `finding-card.tsx` | ✅ Live |
| Status dropdown per finding (not-started/in-progress/fixed/wont-fix) | `finding-card.tsx` | ✅ Live |
| Notes editor per finding (amber-themed, inline textarea) | `finding-card.tsx` | ✅ Live |
| Bookmark toggle per finding (heart icon, amber color) | `finding-card.tsx` | ✅ Live |
| Compare tray checkbox per finding (purple color) | `finding-card.tsx` | ✅ Live |
| GitHub issue creation/linking per finding | `finding-card.tsx` | ✅ Live |
| AI analysis per finding | `ai-analysis-panel.tsx` | ✅ Live |
| Finding detail dialog (full-screen, proposals comparison) | `finding-dialog.tsx` | ✅ Live |
| Search results preview with match highlighting | `search-enhancement.tsx` | ✅ Live |
| Filter chips (active filter badges with X dismiss) | `findings-tab-content.tsx` | ✅ Live |
| Search enhancement (highlight matches, field-specific search) | `search-enhancement.tsx` | ✅ Live |

### 20.4 Roadmap Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| Gantt-style Timeline view (5 phases, sidebar legend, week scale) | `timeline-view.tsx` | ✅ Live |
| Phase Dependency Flow (horizontal, critical path toggle) | `phase-dependency-flow.tsx` | ✅ Live |
| All 24 Tasks card (staggered animation list) | `roadmap-tab-content.tsx` | ✅ Live |
| Phased Timeline card (vertical timeline, 5 phase circles) | `roadmap-tab-content.tsx` | ✅ Live |

### 20.5 Unified Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| Elegant Insight Banner (amber gradient, Zap icon, stats row) | `unified-tab-content.tsx` | ✅ Live |
| 5 Module Coverage cards (emerald/sky/orange/violet/teal) | `unified-tab-content.tsx` | ✅ Live |
| Detailed Module Plans (accordion: Key Insight + Best Proposal) | `unified-tab-content.tsx` | ✅ Live |
| G3 Blocked Findings section (Can Ship Now vs Needs Review) | `unified-tab-content.tsx` | ✅ Live |
| Deferred Independent Items section | `unified-tab-content.tsx` | ✅ Live |
| Best Solution Summary Table (scrollable, tier-grouped) | `unified-tab-content.tsx` | ✅ Live |

### 20.6 Files Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| Hierarchical file tree of affected files | `file-tree-view.tsx` | ✅ Live |
| Finding count per file node | `file-tree-view.tsx` | ✅ Live |
| Severity indicators per file node (colored dots) | `file-tree-view.tsx` | ✅ Live |
| Tree search/sort (by name, count, severity) | `file-tree-view.tsx` | ✅ Live |
| Expand/collapse tree directories | `file-tree-view.tsx` | ✅ Live |

### 20.7 Dependencies Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| SVG dependency graph (task→task relationships) | `dependency-graph.tsx` | ✅ Live |
| Tier-colored background bands | `dependency-graph.tsx` | ✅ Live |
| Critical path visualization (longest dependency chain) | `dependency-graph.tsx` | ✅ Live |
| Hover highlighting (2-level transitive connections) | `dependency-graph.tsx` | ✅ Live |
| Zoom controls + legend | `dependency-graph.tsx` | ✅ Live |
| Graph statistics (totalNodes, totalEdges, most-depended-on, independence count) | `dependency-graph.tsx` | ✅ Live |

### 20.8 Admin Tab Features

| Feature | Location | Status |
|---------|----------|--------|
| Add New Finding form (15+ fields, 3 proposal sub-forms, code snippet sub-forms) | `admin-tab.tsx` | ✅ Live |
| Bulk Import (JSON textarea, preview, import) | `admin-tab.tsx` | ✅ Live |
| Existing Findings Editor (inline edit/delete) | `admin-tab.tsx` | ✅ Live |
| Project Section (add/switch/delete projects) | `project-section.tsx` | ✅ Live |
| Audit Config Editor (9 expandable categories, JSON editor, save/revert/discard) | `audit-config-editor.tsx` | ✅ Live |
| GitHub Configuration (token save/verify/delete, repo owner/name, project number) | `admin-tab.tsx` | ✅ Live |
| GitHub Sync Panel (pull/push bidirectional) | `github-sync-panel.tsx` | ✅ Live |
| AI Connector Panel (6 connector types, test/save/delete) | `ai-connector-panel.tsx` | ✅ Live |
| Opencode Harness Panel (CLI/Desktop mode, settings, actions) | `opencode-panel.tsx` | ✅ Live |
| AI Analysis Panel (per-finding AI analysis display) | `ai-analysis-panel.tsx` | ✅ Live |
| Findings Stats Panel (floating, risk score distribution, quick wins, stale findings) | `findings-stats-panel.tsx` | ✅ Live |

### 20.9 Floating/Overlay Features

| Feature | Location | Status |
|---------|----------|--------|
| AI Chat Panel (floating toggle, expandable window, connector status) | `ai-chat-panel.tsx` | ✅ Live |
| Activity Log (floating toggle, timeline of actions) | `activity-log.tsx` | ✅ Live |
| Findings Stats Panel (floating, left-side) | `findings-stats-panel.tsx` | ✅ Live |
| Floating Stats Bar (scroll-triggered, pin/unpin toggle) | `floating-stats.tsx` | ✅ Live |
| Batch Actions Toolbar (bottom-center, status change/compare/export) | `batch-actions-toolbar.tsx` | ✅ Live |
| Compare Drawer (right-side, side-by-side up to 3 findings) | `compare-drawer.tsx` | ✅ Live |
| Keyboard Shortcuts Dialog | `keyboard-shortcuts.tsx` | ✅ Live |
| Command Palette (⌘K) | `command-palette.tsx` | ✅ Live |

### 20.10 Export Features

| Feature | Location | Status |
|---------|----------|--------|
| Enhanced JSON export (metadata + statistics + findings) | `export-enhancements.tsx` | ✅ Live |
| Enhanced Markdown export (full report with tier-grouped sections) | `export-enhancements.tsx` | ✅ Live |
| CSV export (all fields + 3 proposals) | `export-enhancements.tsx` | ✅ Live |
| Print/PDF export (browser print dialog + print CSS) | `export-enhancements.tsx` | ✅ Live |
| Activity log export (JSON download) | `activity-log.tsx` | ✅ Live |
| Saved views export/import (JSON) | `saved-views.tsx` | ✅ Live |
| Comparison export (JSON + Markdown from compare drawer) | `compare-drawer.tsx` | ✅ Live |

---

## 21. UI/UX DESIGN SYSTEM

### 21.1 Color Architecture

The application uses a **dual-layer color system**:

**Layer 1 — Structural UI Colors (CSS Variables, oklch-based, theme-switchable)**

All structural UI colors (background, foreground, card, primary, secondary, muted, accent, destructive, border, input, ring) use CSS custom properties defined in `oklch()` color space. These automatically invert between light and dark modes:

| Variable | Light | Dark | Purpose |
|----------|-------|------|---------|
| `--background` | `oklch(1 0 0)` (white) | `oklch(0.145 0 0)` (near-black) | Page background |
| `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` | Primary text |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0 0)` | Card backgrounds |
| `--primary` | `oklch(0.205 0 0)` | `oklch(0.922 0 0)` | Primary actions |
| `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` | Muted backgrounds |
| `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` | Muted text |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` | Error/destructive |
| `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` | Borders |
| `--chart-1` through `--chart-5` | Warm palette (hue 41°–84°) | Cool palette (hue 16°–264°) | Chart data colors |

**Layer 2 — Domain-Specific Data Colors (Hardcoded Hex Constants, Tailwind-aligned)**

Domain colors represent audit concepts and are defined as hex constants in `dashboard-constants.ts`:

| Domain Concept | Color | Hex | Tailwind Equivalent |
|---------------|-------|-----|---------------------|
| Severity: critical | Red | `#dc2626` | `red-600` |
| Severity: high | Orange | `#f97316` | `orange-500` |
| Severity: medium | Yellow | `#eab308` | `yellow-500` |
| Severity: low | Gray | `#6b7280` | `gray-500` |
| Tier: tier0 | Red | `#dc2626` | `red-600` |
| Tier: tier1 | Orange | `#f97316` | `orange-500` |
| Tier: tier2 | Yellow | `#eab308` | `yellow-500` |
| Tier: additional | Emerald | `#10b981` | `emerald-500` |
| Tier: deferred | Gray | `#6b7280` | `gray-500` |
| Verification: confirmed-execution | Emerald | `#10b981` | `emerald-500` |
| Verification: confirmed-reading | Sky | `#0ea5e9` | `sky-500` |
| Verification: confirmed-logical | Teal | `#14b8a6` | `teal-500` |
| Verification: needs-execution-confirmation | Amber | `#f59e0b` | `amber-500` |
| Verification: partial | Yellow | `#eab308` | `yellow-500` |
| Module: nutrient_report | Emerald | `#10b981` | `emerald-500` |
| Module: module_integrity | Sky | `#0ea5e9` | `sky-500` |
| Module: lp_solver_refactor | Orange | `#f97316` | `orange-500` |
| Module: pipeline_integrity | Violet | `#8b5cf6` | `violet-500` |
| Module: data_integrity | Teal | `#14b8a6` | `teal-500` |

**Config Override System**: Domain colors can be overridden per-project via `AuditConfig` keys (`severity_levels[x].color`, `tier_labels[x].color`). The `getSeverityColors(config)`, `getTierColors(config)`, `getVerificationColors(config)`, and `getModuleColorMap(config)` functions merge config overrides over static defaults.

**Semantic Color Map (UI/UX specific)**:

| Semantic Meaning | Color Family | Usage Examples |
|-----------------|-------------|----------------|
| Success/Fixed/Verified | Emerald (green) | Fixed status, verified findings, best proposals, "Can Ship Now" |
| Danger/Critical/Blocked | Red | Critical severity, G3 blocked, alerts, health score <50 |
| Warning/In-Progress/Quick Win | Amber (gold) | Bookmarks, notes, quick wins, key corrections, recommendations |
| Info/Affected Files/Cloud | Sky (light blue) | Affected files stats, info notifications, cloud AI |
| GitHub Connected | Teal | GitHub token valid, Create & Link button |
| AI/Violet | Violet | AI chat panel, connector panel, focused finding ring |
| Compare Selection | Purple | Compare tray, compare drawer |
| Bulk Selection | Blue | Bulk select checkboxes, batch toolbar |
| Deferred/Neutral | Gray | Deferred items, low severity, phase 5 |

### 21.2 Theme System

**Implementation**: `next-themes` library with `attribute="class"` (`.dark` class on `<html>`)

**Light mode**: Default. White backgrounds, dark text, light borders.

**Dark mode**: Near-black backgrounds (`oklch(0.145-0.269)`), near-white text (`oklch(0.985)`), white-at-low-opacity borders (10-15%), brighter domain colors (e.g., `#f97316` → `#fb923c`).

**Dark mode specifics**:
- Glass cards: Higher contrast — `card` bg at 50% opacity (vs 70% light), white 8% inset shadow
- Borders: `oklch(1 0 0 / 10%)` — white at 10% opacity
- Chart palette shifts: Warm hues (41°-84°) → Cool hues (16°-264°)
- Domain colors get brighter variants: `text-emerald-300 dark:text-emerald-300`, `text-red-200 dark:text-red-200`
- Text: Every component uses `dark:text-X` variants paired with light variants

**Switching**: Header toolbar Sun/Moon icon button with CSS transition (`rotate-0→rotate-90`, `scale-100→scale-0`)

### 21.3 Glass-morphism Pattern

Applied consistently across cards, panels, and floating elements:

**`.glass-card` CSS class**:
```css
backdrop-filter: blur(12px) saturate(180%);
background: color-mix(in oklch, var(--card) 70%, transparent);
box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--border) 50%, transparent);
/* Dark mode: card at 50%, white inset shadow at 8% */
```

**`.card-hover-enhanced`**: Adds -4px lift + shadow + border-color transition on hover (25ms).
**`.card-hover-lift`**: Simpler -2px lift on hover.
**`.card-accent-top`**: 3px colored top border + hover shadow.
**`.card-accent-critical/high/medium/low`**: Severity-colored top accents.

**Usage**: Overview stat cards, roadmap cards, unified module cards, floating stats panel, compare drawer.

### 21.4 Typography System

| Class | Weight | Tracking | Line Height | Usage |
|-------|--------|----------|-------------|-------|
| `.heading-hero` | 800 | -0.025em | 1.1 | Main titles |
| `.heading-section` | 700 | -0.015em | 1.2 | Section headers |
| `.heading-card` | 600 | -0.01em | 1.3 | Card titles |
| `.code-block` | — (Geist Mono) | — | — | 0.75rem monospace code |
| `.kbd-key` | — (Geist Mono) | — | — | Keyboard shortcut badges, min-width 1.5rem |

**Font stack**: Geist (sans) + Geist_Mono (monospace), loaded via `next/font/local` in `layout.tsx`.

### 21.5 Icon System

**Library**: Lucide React (`lucide-react` v0.525.0)

**Usage pattern**: Every interactive element and status indicator uses a Lucide icon. Icons are color-themed per domain concept (see Semantic Color Map above).

**Key icons and their associations**:

| Icon | Semantic | Domain |
|------|----------|--------|
| `ShieldAlert` | Audit/security | Header logo, severity badge, risk score |
| `BrainCircuit` | AI | Chat panel, connector, analysis |
| `Github` | GitHub | Token status, issue creation |
| `Terminal` | Opencode | CLI mode, actions |
| `Zap` | Quick win/insight | Quick wins panel, elegant insight, best proposal |
| `BookmarkCheck` | Bookmark | Bookmark toggle |
| `GitCompare` | Comparison | Compare tray |
| `CheckSquare` | Bulk selection | Batch mode |
| `Activity` | Overview tab | Tab icon |
| `Bug` | Findings tab | Tab icon |
| `Gauge` | Health/velocity | Health score, risk score |
| `FileCode2` | Code | Code snippets, affected files |
| `TrendingUp/Down` | Velocity | Remediation velocity, stats |
| `Heart` | Bookmark | Finding card bookmark |

---

## 22. TAB-BY-TAB USER EXPERIENCE FLOWS

### 22.1 Overview Tab UX Flow

**Entry**: User clicks "Overview" tab or presses `G+O` or `1`.

**What the user sees (top-to-bottom)**:

1. **4 Animated Stat Cards** — Numbers count up from 0 on tab entry. Staggered delays (0, 0.05, 0.1, 0.15s). Colors: emerald, red, orange, sky. Glass-morphism with gradient bottom accent bars.

2. **Health Score Gauge** — Left side of 2-column grid. SVG arc animates from 0→score (1.2s easeOut). Letter grade fades in after. Breakdown bars animate width 0→value% (0.8s, 0.3s delay). Gradient accent strip at top matches score level (emerald/amber/red).

3. **Remediation Velocity** — Right side. Teal-cyan-sky gradient strip. Velocity icon changes based on category (TrendingUp/Minus/TrendingDown/Clock). Status distribution stacked bar animates segment widths. Remaining work bars per severity.

4. **Quick Wins Panel** — Amber gradient strip. Top 5 findings with rank badges (1-5), severity/risk badges, effort badges. Hover reveals "Navigate" button that jumps to that finding.

5. **Audit Progress** — Emerald-themed card. Large percentage number. Donut chart with resolved count overlay. Status grid (4 statuses). Effort estimate row. In-progress list with clickable jump buttons. Reset button.

6. **Charts Row 1** — 3-column grid: SeverityDonut, VerificationBar, EffortDistribution. Each inside glass-card. All lazy-loaded.

7. **Charts Row 2** — 2-column grid: TierSeverityStack, CategoryBreakdown. Glass-card wrappers.

8. **Affected Files Heatmap** — Full-width card. Top 15 most-affected files. Red→orange gradient for files with critical findings; teal→sky for others. CRIT badge for files touched by criticals.

9. **Risk Matrix + Risk Distribution** — Left: Interactive 4×4 grid. Cells show finding count + severity dots. Clicking a cell: sets activeTab='findings', applies severity filter, enters deep dive mode. Right: Top-5 riskiest findings with risk score badges (clickable → open detail dialog).

10. **Key Corrections Alert** — Amber-themed Alert with 3 numbered correction items.

11. **Sequencing Summary** — 5 phase cards colored red→orange→yellow→emerald→gray. "Critical Next Action" red banner at bottom.

12. **Verification Methodology** — Emerald left-bordered card with methodology text.

**Key interactions**: Risk Matrix cell click → Findings tab deep dive. Quick Wins "Navigate" → Finding detail dialog. Audit Progress jump → Findings tab with search. Risk score badge click → Finding detail dialog.

### 22.2 Findings Tab UX Flow

**Entry**: User clicks "Findings" tab or presses `G+F` or `2`.

**What the user sees**:

1. **Deep Dive Banner** (conditional) — If user clicked a Risk Matrix cell, an emerald banner appears at top showing the severity/impact of the deep dive. Dismiss with ✕.

2. **Search Results Preview** (conditional) — If search is active, shows preview cards with highlighted matches.

3. **Bulk Selection Toolbar** (conditional) — If in bulk select mode, a blue-themed card appears showing selection count, export buttons, compare button.

4. **Search + Filters Card** — Sticky card at top. Row 1: Search input (pl-9, "/" shortcut), FilterPresets dropdown, Sort select, Expand/Collapse button, SavedViews button. Row 2: 4 filter dropdowns (Severity, Verification, Category with counts, Status with counts). Row 3: Result count + Clear filters + active filter chips.

5. **Tier Sub-tabs** — 6 tabs: All + 5 tier tabs. Each shows finding count badge. Grid layout: 3 columns on mobile, 6 on sm+.

6. **Quick Stats Banner** — 3 TierSeverityBar inline progress bars for tier0/tier1/tier2.

7. **Finding Cards** — Each card: severity-colored left border, task badge, finding ID badges, status dropdown, risk score badge (with tooltip showing breakdown), action buttons (compare purple, bookmark amber, details maximize). Title, meta badges (severity, verification, tier, category, dependsOn). Expandable accordion: Claim+Evidence section, 3 Proposals section. Best Proposal indicator (emerald). Notes editor (amber). GitHub integration section. AI analysis button.

8. **Empty State** — If no findings match filters: Search icon + "No findings match your filters."

**Key interactions**: Search → filters findings. Filter dropdowns → narrows results. Tier sub-tabs → shows subset. Status dropdown → changes status + activity log entry. Bookmark toggle → amber ring. Compare checkbox → purple ring. "Open Detailed Comparison View" → FindingDialog. Create GitHub Issue → POST /api/github/issue. Bulk toolbar → batch status change, export, compare.

### 22.3 Roadmap Tab UX Flow

**Entry**: User clicks "Roadmap" tab or presses `G+R` or `3`.

**What the user sees**:

1. **Timeline View** — Gantt-style horizontal timeline. 5 phases with task bars (severity-colored fills). Sidebar legend. Week scale gridlines. Expand/collapse per phase.

2. **Phase Dependency Flow** — 5 horizontal phase boxes connected by arrows. "Show Critical Path" checkbox toggles: red border pulse on critical phases, animated arrows on critical connections, ⚡ badge on critical phase titles.

3. **All 24 Tasks Card** — Glass-card with staggered-animated task list. Each item: severity-colored circle (task number inside), severity badge, tier badge, hover effect.

4. **Phased Timeline Card** — Vertical timeline with 5 phase circles (ring-4 ring-background). Phase items with colored left borders. Connecting vertical line.

### 22.4 Unified Tab UX Flow

**Entry**: User clicks "Unified" tab or presses `G+U` or `4`.

**What the user sees**:

1. **Elegant Insight Banner** — Amber gradient card. Zap icon in amber circle. Title + insight text. Stats row.

2. **5 Module Coverage Cards** — Color-coded grid (emerald/sky/orange/violet/teal). Each card: module icon circle, title, subtitle, finding count, effort/risk badges.

3. **Detailed Module Plans** — Per module: header, core idea box, finding task pills (severity-colored left borders), fixes list (emerald checkmarks), Accordion (Key Insight + Best Proposal per finding).

4. **G3 Blocked Findings** — Red-themed card. Lock icon. Two-column: "Can Ship Now" (emerald) vs "Needs G3 Review" (red).

5. **Deferred Items** — Gray-themed card. Clock icon. Per item: task badge + best proposal in emerald box.

6. **Best Solution Summary Table** — Sticky header table. Columns: Task, Title, Best Solo, Reason, Module. Scrollable (max-h-96, scrollbar-custom).

### 22.5 Files Tab UX Flow

**Entry**: User clicks "Files" tab or presses `G+L` (for "Files") or `5`.

**What the user sees**: Hierarchical file tree with folder/file icons, severity-colored dots, finding count badges per node. Search filter, sort dropdown (name/count/severity). Expand/collapse directories. Click a file → shows associated findings.

### 22.6 Dependencies Tab UX Flow

**Entry**: User clicks "Dependencies" tab or presses `G+D` or `6`.

**What the user sees**: SVG dependency graph. Task nodes as circles (severity-colored). Dependency arrows between nodes. Tier-colored background bands. Zoom controls. Legend. Statistics bar (totalNodes, totalEdges, critical path length). Hover on node → highlights 2-level transitive connections.

### 22.7 Admin Tab UX Flow

**Entry**: User clicks "Admin" tab or presses `G+A` or `7`. Can also jump directly to sub-sections via ⌘⇧A/G/O/T/R/C.

**What the user sees** (8 sub-sections):

1. **Add New Finding** — Emerald-bordered card. Multi-section form: Core Identification (Task ID, Title, Tier, Severity, Category, Verification), Claim & Evidence (Summary, Claim, Evidence, Verification Note), Relationships & Files (Finding IDs, Affected Files, Depends On, Module), 3 Proposal sub-forms, Code Snippet sub-forms (dynamic add/remove).

2. **Bulk Import** — Card with JSON textarea, Preview button, Import button.

3. **Existing Findings** — Card with inline edit/delete per finding.

4. **AI Connector** — Expandable card. Connector type selector, endpoint URL, model selector, test connection, temperature slider, max tokens input, save/delete.

5. **Opencode Harness** — Expandable card. CLI vs Desktop mode cards, settings form, action selector, send button.

6. **GitHub Sync** — Pull/Push two-card layout. Sync result stats.

7. **Audit Config** — Cyan-bordered card. 9 expandable config categories. JSON textarea editor per category. Save/revert/discard buttons.

8. **Project Section** — Project table/list. Add project dialog. Switch active project. Delete with confirmation.

---

## 23. COMPONENT UX REFERENCE — DETAILED COMPONENT CATALOG

### 23.1 Dashboard Shell Components

#### `dashboard-client.tsx` (~2690 lines)

**Role**: Central orchestrator — holds ALL application state, renders header/tabs/footer, manages keyboard shortcuts, command palette, floating panels.

**Visual Design**: `min-h-screen flex flex-col bg-background bg-gradient-mesh`. Sticky header with `bg-card/80 backdrop-blur-sm header-gradient-border` (gradient border-image red→orange→yellow). ShieldAlert logo with pulsing red dot (`animate-ping`). 12 icon buttons in toolbar. 7-tab TabsList `grid-cols-7 max-w-3xl mx-auto`.

**State (40+ useState variables)**: mounted, findingsData, dataLoaded, search, severityFilter, verificationFilter, categoryFilter, statusFilter, sortBy, expandedAll, activeTab, showScrollTop, selectedFinding, dialogOpen, bookmarks (Set), showBookmarkedOnly, showShortcuts, activePresetName, cmdPaletteOpen, adminSection, aiChatOpen, deepDive, bulkSelectMode, bulkSelected (Set), compareOpen, compareSelected (array, max 3), githubTokenStatus, githubIssueResults, creatingAndLinking, keyBuffer, focusedFindingIndex.

**Hooks**: useProject, useRouter, useTheme, useAuditProgress, useHealthScore, useQuickWins, useRemediationVelocity, useCreateGitHubIssue, useAddToProject, useGitHubTokenStatus.

#### `client-only-dashboard.tsx`

**Role**: SSR-bypass wrapper. Uses `dynamic()` with `ssr:false` to avoid OOM during SSR. Wraps DashboardClient in ProjectProvider.

**Visual**: Spinner "Loading audit dashboard..." during initial load.

#### `dashboard-mount.tsx`

**Role**: Lightweight mount with `requestAnimationFrame` delay to prevent hydration mismatches.

### 23.2 Finding Components

#### `finding-card.tsx` (~900 lines)

**Visual**: Card with `card-hover-lift overflow-hidden border-l-4`. Left border color = `severityColors[severity]`. Header row: bulk checkbox (blue when checked), task badge, finding IDs, status dropdown, risk score badge (borderColor/textColor from riskLevelConfig), action buttons. Title row. Meta badges row (severity, verification, tier, category with getCategoryColor, dependsOn). Status indicator bar. Expandable accordion: Claim+Evidence, 3 Proposals. Best Proposal indicator (emerald). Notes editor (amber-themed). GitHub section at bottom.

**Interactive**: Status dropdown → setStatus + addActivityEntry. Bookmark toggle → toggleBookmark. Compare checkbox → toggleCompare. View details → openDetails dialog. Notes editor → setNote + addActivityEntry. Create GitHub Issue → handleCreateIssue. Code block copy button (Check/Copy swap, 2s timeout).

**Focus states**: `ring-2 ring-violet-500/80` (focused), `ring-2 ring-amber-400/50` (bookmarked), `ring-2 ring-blue-400/70` (bulk selected).

#### `finding-dialog.tsx` (~410 lines)

**Visual**: Dialog `max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-custom`. Badge row (task, IDs, severity, verification, category, dependsOn). Claim+Evidence 2-column grid. Verification note (emerald). Code snippets. Proposals comparison: 3-column grid with numbered circles (`backgroundColor: var(--chart-${(idx%5)+1})`), pros (emerald ThumbsUp), cons (red ThumbsDown). Recommendation badge (amber Sparkles). Comparison table (sticky header, scrollable).

### 23.3 Overview Components

#### `health-score-gauge.tsx`

**Visual**: 180° SVG arc gauge (radius 80, viewBox 0 0 200 120). Score arc animates `pathLength:0→1` (1.2s). Indicator dot `scale:0→1` (0.5s delayed). Center score number + letter grade. 4 breakdown bars (severity/remediation/verification/dependency, width animated 0→value%). Gradient accent strip at top matching score level. Glass-card wrapper.

**Score colors**: ≥80 emerald, ≥50 amber, <50 red.

#### `quick-wins-panel.tsx`

**Visual**: Amber gradient accent strip (`from-amber-500 via-yellow-500 to-orange-500`). Top 5 items with rank badges (7×7 amber circles), severity/risk/effort badges. Hover reveals "Navigate" button (`opacity:0→group-hover:opacity:100`). Glass-card wrapper.

#### `remediation-velocity.tsx`

**Visual**: Teal-cyan-sky gradient strip. Velocity icon + category badge. Status distribution stacked bar (animated segment widths). Remaining work mini progress bars per severity. 3 quick stats cells. Glass-card wrapper.

#### `risk-matrix.tsx`

**Visual**: 4×4 grid. Each cell shows finding count + severity-colored dots. Tooltip on hover (finding list). Clickable cells (`risk-cell-clickable` CSS — hover scale(1.08), brightness(1.1), ring, shadow; active scale(0.98)).

#### `audit-progress.tsx`

**Visual**: Emerald-themed card. 4xl bold percentage. Donut chart (Recharts PieChart, 180×180px, innerRadius 50, outerRadius 75) with resolved count overlay. Status grid (4 cells with icons + count + percent). Effort estimate row. In-progress list (clickable buttons). Reset button.

#### `animated-counter.tsx`

**Visual**: Glass-card + card-hover-enhanced. requestAnimationFrame count-up (0→value, 1200ms, cubic ease-out). Framer-motion entrance (`opacity:0.3→1`, 0.3s delayed). `tabular-nums` for stable width. Gradient bottom accent bar.

### 23.4 Roadmap Components

#### `timeline-view.tsx` (~700 lines)

**Visual**: Gantt-style horizontal timeline. 5 phases. Task bars with severity-colored fills. Sidebar legend. Week scale (WEEK_SCALE=28px/unit). Major gridlines every 2 weeks, minor every 1 week. Expand/collapse per phase.

#### `phase-dependency-flow.tsx`

**Visual**: 5 horizontal phase boxes connected by arrows. Critical path toggle: red border pulse (`critical-path-pulse` CSS), animated arrows (`flowPulse` CSS), ⚡ badge. Non-critical arrows in phase colors.

### 23.5 Unified Components

All in `unified-tab-content.tsx` — see Section 22.4 for detailed UX flow.

### 23.6 File/Dependency Components

#### `file-tree-view.tsx` (~650 lines)

**Visual**: Tree with folder/file Lucide icons. Severity-colored dots on nodes. Finding count badges. Search input. Sort dropdown. Expand/collapse directories.

**Algorithm**: `buildTree()` — recursive directory/file creation from affectedFiles paths. `aggregate()` — bottom-up finding accumulation. `sortTree()` — 3 sort modes (name, count, severity). `filterTree()` — query-based pruning preserving context.

#### `dependency-graph.tsx` (~700 lines)

**Visual**: SVG graph. Task nodes as circles (severity-colored). Dependency arrows. Tier-colored background bands. Zoom controls. Legend. Statistics bar.

**Algorithm**: `parseDependsOn()` — regex `/Task\s+(\d+|X\d+|D-\w+)/gi`. `computeCriticalPath()` — BFS topological sort + DP longest distance. `getConnectedNodes()` — 2-level transitive highlighting.

### 23.7 Admin Components

#### `admin-tab.tsx` (~2000 lines)

**Visual**: 8 sub-sections in space-y-6. Notification bar at top (AnimatePresence, auto-dismiss 5s). Add Finding: emerald-bordered card with multi-section form. Bulk Import: JSON textarea + preview. Existing Findings: inline edit/delete. AI Connector, Opencode, GitHub Sync, Audit Config, Project Section as sub-components.

**State (25+ local useState)**: notifications, githubToken, githubTokenStatus, githubProjectNumber, form fields (15+), formProposals (3 sub-forms), formSnippets (dynamic), bulkJson, bulkPreview, editingTask, edit fields.

#### `project-section.tsx`

**Visual**: Mobile: card layout. Desktop: table layout. Active project highlighted emerald. "Add Project" button (violet-600). "Set Active" button (emerald). "Delete" button (red). Add Project Dialog: 4 fields (name, repoOwner, repoName, description). Delete AlertDialog: confirmation with "cannot be undone" warning.

### 23.8 Floating/Overlay Components

#### `ai-chat-panel.tsx` (~640 lines)

**Visual**: Floating toggle button (bottom-4 right-4, BrainCircuit icon, violet-themed). Expandable window (fixed bottom-16 right-4, width min(380px, calc(100vw-2rem)), backdrop-blur-md). Header with connector status badge. "Analyze Finding" button. Message bubbles (user=violet right-aligned, AI=muted left-aligned, error=red, pending=spinning). Input area with Enter/Shift+Enter hints.

**Hook**: useAIChat — manages messages[], isLoading, error, retryPayload, inputText. Auto-scroll on new messages. sendMessage() → POST /api/ai/connector { action: "chat" }. retry() → replay last failed message.

#### `activity-log.tsx`

**Visual**: Floating toggle button (bottom-4 right-4, History icon, teal-themed). Expandable panel (w-80 sm:w-96). Type-colored icon rows. Timestamp HH:MM:SS. Export/clear buttons. Polls every 3s.

**Entry types**: status_change (emerald), note_save (amber), bookmark (orange), issue_create (teal), filter_change (violet), ai_analysis (teal), export (sky).

#### `findings-stats-panel.tsx`

**Visual**: Floating toggle (bottom-4 left-4, BarChart3 icon, violet-themed). Expandable panel (left side). Sections: Risk Score Distribution (min/max/mean/median), Completion Velocity (7-day + all-time fixed), Bottleneck Detection, Quick Wins (top 3), Stale Findings (>14d orange, >30d red).

#### `floating-stats.tsx`

**Visual**: Appears at scrollY>300. Pin/unpin toggle. 3-column grid: filtered count, bookmark count, progress percent. Mini progress bar (emerald→teal gradient, 1.5px).

#### `batch-actions-toolbar.tsx`

**Visual**: Fixed bottom-center. Amber gradient strip. Select all/clear. Status dropdown. Export buttons (CSV/JSON/MD). Compare button (requires 2-3 selected).

#### `compare-drawer.tsx`

**Visual**: Full-height right-side drawer. Up to 3 findings side-by-side. 12 comparison fields. Diff highlighting: same=green (`compare-diff-same`), different=red (`compare-diff-different`). Add-finding selector. Export (JSON/Markdown).

#### `command-palette.tsx` (~900 lines)

**Visual**: Dialog using cmdk (Command) component. Grouped sections: Navigation (6 tabs), Presets (3), Actions (theme, scroll, export). Structured search with `severity:`, `status:`, `tier:`, `category:`, `verification:` syntax. Recent commands (localStorage, max 5).

---

## 24. HEALTH SCORE & METRICS ALGORITHMS

### 24.1 Health Score Computation (`useHealthScore` hook)

**Location**: `src/components/health-score-gauge.tsx`

**Overall formula** (weighted average of 4 sub-scores, each 0–100):

```
overallScore = severityPenalty × 0.40 + remediationProgress × 0.25 + verificationStrength × 0.20 + dependencyRisk × 0.15
```

**Edge case**: If `total === 0` (no findings), returns score=100, grade=A+.

#### Sub-score 1: Severity Penalty (weight 0.40)

- Each finding contributes `severityWeight[f.severity] × tierImpact[f.tier]`
- Constants: `severityWeight` = {critical:3, high:2, medium:1, low:0}, `tierImpact` = {tier0:3, tier1:2, tier2:1, additional:1, deferred:0}
- `maxSeverityImpact = 9 × total` (worst case: every finding is critical+tier0 = 3×3=9)
- `actualSeverityImpact = Σ(severityWeight × tierImpact)` across all findings
- **Inverted** (lower severity = better score): `severityPenalty = round((1 - actualSeverityImpact / maxSeverityImpact) × 100)`

#### Sub-score 2: Remediation Progress (weight 0.25)

- `resolvedCount = fixedCount + wontFixCount`
- `remediationProgress = round(resolvedCount / total × 100)`

#### Sub-score 3: Verification Strength (weight 0.20)

- Weight per verification status: confirmed-execution=1.0, confirmed-reading=0.8, confirmed-logical=0.7, needs-execution-confirmation=0.4, partial=0.3, unlisted=0.2
- `verificationStrength = round((Σ(verificationWeight[f.verificationStatus]) / total) × 100)`

#### Sub-score 4: Dependency Risk (weight 0.15)

- Parse `f.dependsOn` with regex `/Task\s+(\d+)/gi`
- Count references per task (`depReferenceCounts`)
- `maxBlocked = max(referenceCounts)`
- **Inverted**: `dependencyRisk = round(max(0, 100 - (maxBlocked / total) × 50))`

#### Grade Assignment

| Threshold | Grade | Color | Description |
|-----------|-------|-------|-------------|
| ≥90 | A+ | emerald | Excellent — nearly all risks mitigated |
| ≥80 | A | emerald | Very Good — most risks addressed |
| ≥70 | B+ | teal | Good — solid progress |
| ≥60 | B | teal | Above Average |
| ≥50 | C+ | amber | Fair — half mitigated |
| ≥40 | C | amber | Below Average |
| ≥30 | D | orange | Poor |
| ≥20 | D- | red | Very Poor |
| ≥0 | F | red | Critical — immediate action required |

### 24.2 Quick Wins Computation (`useQuickWins` hook)

**Location**: `src/components/quick-wins-panel.tsx`

**Formula**:

```
quickWinScore = (tierImpact × 2 + severityWeight) × (3 / effortRank) + reversibilityBonus
```

Where: tierImpact={tier0:3, tier1:2, tier2:1, additional:1, deferred:0}, severityWeight={critical:3, high:2, medium:1, low:0}, effortRank={low:1, medium:2, high:3}, reversibilityBonus={true:1, false:0}.

**Logic**: High tier+severity increases priority; low effort gets 3× multiplier, medium 1.5×, high 1×. Reversibility adds +1 bonus.

**Filtering**: Excludes 'fixed' and 'wont-fix' statuses. Uses first proposal as "best proposal".

**Ranking**: Sort by quickWinScore descending, take top 5.

### 24.3 Remediation Velocity Computation (`useRemediationVelocity` hook)

**Location**: `src/components/remediation-velocity.tsx`

**Category determination**:

| Condition | Category |
|-----------|----------|
| percentResolved ≥ 80 | accelerating |
| percentResolved > 0 && inProgress > 0 | steady |
| percentResolved > 0 && inProgress === 0 | stalled |
| percentResolved === 0 | not-started |

**Metrics**: resolved=fixed+wont-fix, percentResolved=round(resolved/total×100), estimatedWeeks=ceil(remaining/2) (assumes 2 findings/week pace).

### 24.4 Risk Score Computation

**Location**: `src/lib/audit-utils.ts`

```
riskScore = severityWeight[severity] + tierImpact[tier]
```

**Range**: 0–6 (with current weights). NOT 0–9 as commented in audit-data.ts.

**Risk Level from Score**: ≥6=critical(red), ≥4=high(orange), ≥2=medium(yellow), <2=low(emerald).

### 24.5 Risk Matrix Construction

**4×4 grid**: severity weights (low=0, medium=1, high=2, critical=3) × tier impacts (0, 1, 2, 3). Each cell keyed `"severityWeight-tierImpact"`. Findings placed into cells. Cell rendering shows count + severity-colored dots.

### 24.6 Dependency Graph Algorithms

**Critical Path**: BFS topological sort + DP longest distance. Reconstruct path via parent pointers. Returns `{length, path}`.

**Connected Nodes**: 2-level transitive highlighting — direct connections + what those connections depend on/are depended by.

### 24.7 File Tree Algorithms

**buildTree**: Recursive directory/file creation from affectedFiles paths. Bottom-up aggregation of findings per node.

**sortTree**: 3 modes — name (localeCompare), count (descending), severity (max severity weight first).

**filterTree**: Query-based pruning. If node name matches → keep all its findings. If only findings match → keep only matching findings.

---

## 25. SEARCH, FILTER & NAVIGATION ENGINE

### 25.1 Search System

**Component**: `search-enhancement.tsx`

**Search scope** (10 fields per finding): Title, Summary, Claim, Evidence, Category, Finding IDs, Task number, Affected Files, Proposals, Code Snippets.

**Match algorithm**: Case-insensitive `indexOf` across all fields. `HighlightSearchText` wraps matches in `<mark>` with amber highlight (`search-highlight` CSS class — amber 40%/50% bg tint, bold weight).

**Search Results Preview**: Aggregates `totalMatches` per finding across all fields. Sorts by totalMatches descending. Caps at 8 results.

### 25.2 Filter System

**4 dropdown filters**: Severity (4 options + all), Verification (5 options + all), Category (dynamic from findings data + all, shows counts), Status (4 options + all, shows counts from progressStats).

**Active filter chips**: Per active filter, shows `<span className="filter-chip">` with X dismiss button.

**Clear all**: Button resets all filters + deep dive state.

### 25.3 Filter Presets

**3 built-in presets**: Critical Only (severity=critical), Ready to Fix (status=not-started), In Progress (status=in-progress).

**Custom presets**: Stored in localStorage key `audit-filter-presets`. Snapshots all 6 filter dimensions + search + bookmark toggle. Can save/apply/delete.

### 25.4 Saved Views

**Storage**: localStorage key `saved-views`. Structure: `{ id, name, createdAt, lastAppliedAt, search, severityFilter, verificationFilter, categoryFilter, statusFilter, sortBy }`.

**Operations**: save (case-insensitive dedup), apply, delete, export (JSON download), import (JSON parse + merge with dedup).

### 25.5 Command Palette Search

**Structured search syntax**: 5 recognized filter keys with colon prefix: `severity:`, `status:`, `tier:`, `category:`, `module:`.

**Parsing**: Split by whitespace. Colon tokens → filter Map. Unrecognized → free text. Partial values tracked for autocomplete.

**Matching**: Per filter, `includes()` check on respective finding field. Free text: concatenate task+title+summary+claim+category+findingIds into haystack, `includes()` check. Results capped at 8.

**Recent commands**: localStorage key `cmd-recent`, max 5, format: `finding:{task}`, `tab:{value}`, `preset:{name}`, `action:{id}`.

---

## 26. COMPARISON & BATCH OPERATIONS SYSTEM

### 26.1 Compare Drawer

**Component**: `compare-drawer.tsx`

**Capacity**: Up to 3 findings side-by-side.

**12 comparison fields**: Task, Title, Tier, Severity, Category, Depends on, Verification, Finding IDs, Affected Files, Proposals, Risk Score, Summary.

**Diff highlighting**: Only highlights 4 key fields (Severity, Category, Tier, Risk Score). If all values identical → `compare-diff-same` (green #10b981). If any differs → `compare-diff-different` (red #ef4444).

**Export**: JSON (raw findings + metadata) or Markdown (side-by-side table + per-finding details).

### 26.2 Batch Actions Toolbar

**Component**: `batch-actions-toolbar.tsx`

**Operations**: Batch status change (dropdown with 4 statuses), Compare (requires 2-3 selected), Export (CSV/JSON/Markdown of selected only), Select All, Clear Selection.

**Visual**: Fixed bottom-center. Amber gradient strip. `batch-toolbar-shadow` CSS.

---

## 27. CHART & VISUALIZATION SYSTEM

### 27.1 Chart Components (all in `src/components/charts.tsx`)

All charts use **Recharts** library (`recharts` v2.15.4). All are **lazy-loaded** via `next/dynamic { ssr: false }`.

| Chart | Type | Data Source | Colors | Special Features |
|-------|------|-------------|--------|------------------|
| SeverityDonut | PieChart (innerRadius=45, outerRadius=75) | Counts per severity | severityColors map | Donut style, 180px height |
| VerificationBar | BarChart (vertical) | Counts per verification status | verificationColors map | Rounded bars (radius=[0,4,4,0]), category Y-axis |
| EffortDistribution | PieChart (donut with labels) | Proposal effort counts across all findings | Low=emerald, Medium=yellow, High=red | Label shows count, includes Legend |
| CategoryBreakdown | BarChart (vertical) | Findings by category, sorted descending | Dynamic emerald gradient per entry | Height grows with categories: `max(220, data.length × 22)` |
| TierSeverityStack | BarChart (horizontal, stacked) | 5 tier groups × 4 severity counts | Per severity colors | Stacked bars, rounded top corners |
| AffectedFilesHeatmap | Custom HTML/CSS (NOT Recharts) | Top 15 most-affected files | Critical files: red→orange; Others: teal→sky | Intensity = count/maxCount, CRIT badge for criticals, min bar width 8% or 40px |
| TierSeverityBar | Custom HTML progress bar | Per-tier severity proportions | Per severity colors | Inline in findings tab, legend with count per severity |

---

## 28. MODAL, DIALOG & PANEL SYSTEMS

### 28.1 Dialog Systems

| Dialog | Component | Trigger | Content |
|--------|-----------|---------|---------|
| FindingDetailDialog | `finding-dialog.tsx` | Click "Maximize2" on finding card | Full finding details, proposals comparison, code snippets |
| AddProjectDialog | `project-section.tsx` | "Add Project" button | 4-field form (name, repoOwner, repoName, description) |
| DeleteProjectDialog | `project-section.tsx` | Red Trash2 button | Confirmation with "cannot be undone" warning |
| CommandPalette | `command-palette.tsx` | ⌘K / Ctrl+K | Structured search, navigation, presets, actions |
| KeyboardShortcutsDialog | `keyboard-shortcuts.tsx` | Keyboard button or `?` key | 6 categories of shortcuts, kbd elements |
| SavedViewsDialog | `saved-views.tsx` | Saved Views button | Save/apply/delete/export/import filter views |

### 28.2 Panel Systems

| Panel | Component | Position | Trigger |
|-------|-----------|----------|---------|
| AI Chat | `ai-chat-panel.tsx` | Fixed bottom-4 right-4 (toggle) → bottom-16 right-4 (panel) | BrainCircuit button or Shift+A |
| Activity Log | `activity-log.tsx` | Fixed bottom-4 right-4 (toggle) → bottom-16 right-4 (panel) | History button |
| Findings Stats | `findings-stats-panel.tsx` | Fixed bottom-4 left-4 (toggle) → bottom-16 left-4 (panel) | BarChart3 button |
| Floating Stats | `floating-stats.tsx` | Fixed bottom after scrollY>300 | Automatic scroll trigger |
| Batch Toolbar | `batch-actions-toolbar.tsx` | Fixed bottom-center | Bulk select mode activation |
| Compare Drawer | `compare-drawer.tsx` | Full-height right-side | 2+ findings in compare tray |

**Common panel pattern**: Floating toggle button (40×40px circle, spring animation scale 0→1), badge indicator on closed state (unread count, stale count, connection status), expandable panel via AnimatePresence with spring transitions, backdrop-blur-md + translucent background, theme-colored borders.

### 28.3 Inline Panels (in Admin tab)

| Panel | Component | Collapse | Content |
|-------|-----------|---------|---------|
| AI Connector Panel | `ai-connector-panel.tsx` | ChevronUp/Down toggle | 6 connector types, endpoint URL, model selector, test/save/delete |
| Opencode Panel | `opencode-panel.tsx` | Part of admin tab | CLI/Desktop mode cards, settings form, action selector |
| GitHub Sync Panel | `github-sync-panel.tsx` | Part of admin tab | Pull/Push cards, sync result stats |
| Audit Config Editor | `audit-config-editor.tsx` | 9 accordion categories | JSON textarea per category, save/revert/discard |

---

## 29. FORMS & INPUT SYSTEMS

### 29.1 Add New Finding Form (Admin Tab)

**Fields (15+)**:

| Section | Fields | Input Type | Validation |
|---------|--------|------------|------------|
| Core Identification | Task ID, Title, Tier, Severity, Category, Verification Status | Input + Select dropdowns | All required except Category |
| Claim & Evidence | Summary, Claim, Evidence, Verification Note | Textarea (min-h 40-60px) | Summary required |
| Relationships & Files | Finding IDs, Affected Files, Depends On, Module | Input (comma-separated) + Select | Optional |
| Proposals (3) | Title, Description, Effort, Risk, Reversible | Input + Textarea + Select + Checkbox | Title required |
| Code Snippets (dynamic) | File, Lines, Language, Code | Input + Input + Select + Textarea | File + Code required |

**Dynamic sub-forms**: Proposals (3 fixed), Code Snippets (add/remove with Plus/Trash2 buttons).

### 29.2 Bulk Import Form

**Input**: JSON textarea (font-mono, min-h 120px). **Actions**: Preview (parses JSON, shows count), Import (batch POST). **Validation**: JSON parse check, duplicate skip.

### 29.3 Project Creation Form

**Fields**: Name* (Input), Repo Owner* (Input), Repo Name* (Input), Description (Textarea, min-h 60px). **Validation**: Name, repoOwner, repoName required. Button disabled until all filled.

### 29.4 GitHub Configuration Forms

**Token form**: Token input + Save/Verify/Delete buttons. 3-step verification (user auth → repo access → issue access).

**Config form**: Repo Owner input, Repo Name input, Project Number input. Save buttons chain multiple config saves.

### 29.5 AI Connector Form

**Fields**: Connector Type (Select, 6 options), Endpoint URL (Input, auto-populated per type), Model (Select dropdown if models discovered, Input otherwise), Temperature (Slider 0.0-2.0, step 0.05), Max Tokens (Number input 128-32768), Active toggle. **Actions**: Test Connection, Save, Delete, List Models.

### 29.6 Opencode Settings Form

**Fields**: Mode (CLI/Desktop card selector), Binary Path, Workspace Path, Endpoint URL (with inline Test Connection), AI Model (Select, 7 options), Auto-Review (Switch), GitHub Sync (Switch), Active (Switch). **Actions**: Check Status, Save, Delete, Send Action.

### 29.7 Audit Config Editor Form

**9 expandable categories**: Severity Levels, Tier Labels, Categories, Audit Statuses, Verification Statuses, Effort Levels, Risk Levels, Module IDs, Repository Info. Each: JSON textarea (monospace, min-h 120px, max-h 400px), live validation (green/red badge), Save/Revert/Discard buttons. Dirty state tracking per category.

### 29.8 Inline Finding Interactions

**Status dropdown**: 4 options (not-started, in-progress, fixed, wont-fix). Size variants: sm (130px), xs (110px).

**Notes editor**: Add/Edit button → inline Textarea (min-h 60px, resize-y). Save button (amber-600 bg). Cancel button.

**Bookmark toggle**: Heart/BookmarkCheck icon, amber when active.

**Compare checkbox**: Checkbox, purple when in compare tray.

---

## 30. TOAST & NOTIFICATION SYSTEM

### 30.1 Toast System (Sonner)

**Library**: `sonner` v2.0.6, configured in `layout.tsx` via `<Toaster />`.

**Usage pattern**: `toast.success(message, { duration: 2000-3000 })`, `toast.error(message, { duration: 3000 })`, `toast.info(message, { duration: 2500 })`.

**Common toast triggers**: Finding create/update/delete, status change, note save, bookmark toggle, GitHub issue create/link, GitHub sync pull/push, AI analysis, AI connector save/test/delete, Opencode save/send/delete, project create/switch/delete, config save/revert/reset, export complete, batch operation complete.

### 30.2 Admin Notification Bar

**Component**: In `admin-tab.tsx`. AnimatePresence stack of notification cards. 3 types: success (emerald), error (red), info (sky). Auto-dismiss after 5000ms. Dismiss button (X icon).

### 30.3 Activity Log

**Storage**: localStorage key `activity-log-{projectId}`, max 100 entries.

**Types**: status_change, note_save, bookmark, issue_create, filter_change, ai_analysis, export, github_sync, opencode_action.

**Polling**: Every 3 seconds. Unread badge on closed panel.

---

## 31. CSS ANIMATION & MOTION SYSTEM

### 31.1 Animation Architecture

**Two-layer system**: Framer Motion for React component-level animations (entrance, stagger, hover, exit); CSS keyframes for infinite/structural animations (pulses, shimmers, spins, glows).

### 31.2 All CSS Keyframe Animations

| Name | Keyframes | Duration | Purpose |
|------|-----------|----------|---------|
| `fadeIn` | translateY(8px)+opacity:0 → 0,1 | 0.4s ease-out | Element entrance |
| `slideIn` | translateX(-12px)+opacity:0 → 0,1 | 0.3s ease-out | Horizontal entrance |
| `spinSlow` | rotate 0→360deg | 3s linear infinite | Spinner icon |
| `pulseGlow` | box-shadow 0→4px red glow→0 | 2s ease-in-out infinite | Red danger pulse |
| `critical-path-box-pulse` | box-shadow 0→8px red→0 | 2s ease-in-out infinite | Critical path nodes |
| `critical-path-node-pulse` | scale(1→1.1→1) | 1.5s ease-in-out infinite | Critical path bounce |
| `critical-path-dot-pulse` | opacity 1→0.7 + scale 1→1.3→1 | 1.5s ease-in-out infinite | Critical path dot |
| `stripeMove` | background-position 0→200% | 2s linear infinite | Striped progress |
| `tabContentEnter` | translateY(12px)+scale(0.98)+opacity:0 → 0,1,1 | 0.35s ease-out | Tab content transition |
| `skeletonPulse` | background-position 200%→-200% | 1.5s ease-in-out infinite | Skeleton shimmer |
| `borderPulseActive` | border-color primary@30%→50%→30% | 2s ease-in-out infinite | Active border |
| `toastSlideIn` | translateY(16px)+scale(0.95)+opacity:0 → 0,1,1 | 0.35s ease-out | Toast enter |
| `connectorPing` | scale(1→1.8) + opacity(0.8→0) | 1.5s ease-out infinite | Connected status ping |
| `velocityPulse` | opacity 1→0.8→1 | 2s ease-in-out infinite | Velocity indicator |
| `badgePulse` | scale(1→1.1→1) | 2s ease-in-out infinite | Notification badge |
| `syncShimmer` | background-position 200%→-200% | 1.5s linear infinite | GitHub sync bar |
| `flowPulse` | opacity 0.6→1→0.6 | 2s ease-in-out infinite | Flow step connector |

### 31.3 CSS Utility Classes (Key Categories)

**Glass-morphism**: `glass-card`, `card-hover-enhanced`, `card-hover-lift`, `card-accent-top`, `card-accent-critical/high/medium/low`, `card-print`, `floating-stats-panel`, `compare-glass-panel`.

**Animations**: `.animate-fade-in`, `.animate-slide-in`, `.animate-spin-slow`, `.pulse-glow`, `.critical-path-pulse`, `.velocity-pulse`, `.notification-badge`, `.tab-content-enter`, `.tab-crossfade`.

**Interactive**: `.btn-ripple` (CSS radial-gradient ripple), `.btn-subtle-hover` (0.15s bg+color transition), `.focus-ring-glow` (double ring 3px+6px), `.border-animate-active`, `.shimmer-hover`, `.dep-node-hover`, `.cmd-result-glow`, `.risk-cell`, `.risk-cell-clickable`, `.kpi-card-interactive`, `.filter-chip`, `.finding-card-accent`.

**Data viz**: `.gradient-progress-bar` (emerald→teal→sky), `.gradient-progress-bar-critical` (red→orange), `.compare-diff-same` (green), `.compare-diff-different` (red), `.section-divider` (2px gradient), `.status-bar-segment` (width transition 0.6s).

**Typography**: `.heading-hero` (800 weight), `.heading-section` (700), `.heading-card` (600), `.code-block` (Geist Mono, syntax token classes), `.kbd-key` (keyboard shortcut badge), `.integration-desc-block`.

**Decorative**: `.bg-gradient-mesh` (3-4 radial gradients), `.header-gradient-border` (red→orange→yellow), `.filter-bar-accent` (purple→blue 4px left border), `.tab-indicator-active` (red→orange 3px bottom bar).

**Connector/Status**: `.connector-status-dot` (8px circle with `.connected`/`.disconnected`/`.error` variants), `.sync-status-bar` (3px bar with `.syncing` shimmer variant).

**Scrollbar**: `.scrollbar-custom` (8px, border-colored), `.scrollbar-styled` (6px, primary-tinted), `.custom-scrollbar` (6px, muted-foreground-tinted).

**Print**: `.no-print` (hidden in print), `.print-block` (shown in print), `.card-print` (break-inside: avoid).

---

## 32. RESPONSIVE DESIGN ARCHITECTURE

### 32.1 Breakpoint Strategy

**Mobile-first** with Tailwind responsive prefixes. The app targets 4 key breakpoints:

| Breakpoint | Tailwind Prefix | Min Width | Typical Device |
|------------|----------------|-----------|----------------|
| Default | (none) | 0px | Mobile phone |
| sm | `sm:` | 640px | Large phone / small tablet |
| md | `md:` | 768px | Tablet |
| lg | `lg:` | 1024px | Desktop |

### 32.2 Per-Component Responsive Patterns

**Dashboard Header**: `flex-wrap` on mobile → single row on sm+. Title: `text-lg sm:text-2xl`. Project selector: `max-w-[200px] sm:max-w-[280px]`. Tab labels: `text-xs sm:text-sm` with `sm:mr-1.5` icon spacing.

**Overview Tab**: Stats grid: `grid-cols-2 → sm:grid-cols-4`. Health+Velocity: `grid-cols-1 → lg:grid-cols-2`. Charts Row 1: `grid-cols-1 → md:grid-cols-3`. Charts Row 2: `grid-cols-1 → lg:grid-cols-2`. Risk section: `grid-cols-1 → lg:grid-cols-[1fr_320px]`. Sequencing: `grid-cols-1 → sm:grid-cols-2`.

**Findings Tab**: Search+Filters: `flex-col → sm:flex-row`. Filter dropdowns: `grid-cols-2 → sm:grid-cols-4`. Tier tabs: `grid-cols-3 → sm:grid-cols-6`. Stats banner: `grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-3`. Button labels: `hidden sm:inline`.

**Finding Card**: Header row: `flex-wrap → sm:flex-nowrap`. Title: `text-base → sm:text-lg`.

**Finding Dialog**: Title: `text-lg → sm:text-xl`. Claim+Evidence: `grid-cols-1 → md:grid-cols-2`. Proposals: `grid-cols-1 → lg:grid-cols-3`.

**Unified Tab**: Module coverage: `grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-5`. G3 blocked inner: `grid-cols-1 → sm:grid-cols-2`.

**Phase Dependency Flow**: `flex-col → lg:flex-row`.

**Admin Tab**: Core Identification: `grid-cols-1 → sm:grid-cols-2`. Relationships: `grid-cols-1 → sm:grid-cols-3`.

**Activity Log Panel**: `w-80 → sm:w-96`.

**AI Chat Panel**: Width `min(380px, calc(100vw - 2rem))`.

### 32.3 Mobile-Specific Adaptations

- Touch-friendly: Minimum 44px touch targets on interactive elements
- `hidden sm:inline` for button labels (icon-only on mobile)
- `flex-wrap` for badge rows and toolbar buttons
- Compare drawer: vertical layout on mobile, horizontal on desktop
- Phase dependency flow: column layout on mobile, row on desktop
- Floating panels: narrower on mobile (w-80 vs sm:w-96)

---

## 33. ERROR, LOADING & EMPTY STATE PATTERNS

### 33.1 Loading States

| Context | Pattern | Visual |
|---------|---------|--------|
| Initial dashboard load | Full-screen skeleton | `bg-gradient-mesh`, ShieldAlert pulse, "Loading Audit Data...", 3 bouncing dots (red/orange/yellow, staggered animationDelay) |
| Chart lazy-load | Height placeholder | `<div className="h-[180px]">` / `<div className="h-[220px]">` during dynamic import |
| Tab content lazy-load | Pulse placeholder | `<div className="animate-pulse">` with skeleton content |
| Mutation in progress | Spinner icon | `LoaderCircle className="animate-spin"` on buttons |
| AI chat pending | Inline spinner | "Thinking…" text + LoaderCircle spinning |
| Project list loading | Pulse placeholder | `<div className="animate-pulse">` in ProjectSelector |

### 33.2 Error States

| Context | Pattern | Visual |
|---------|---------|--------|
| Mutation failure | Toast error | `toast.error(message)` with red styling |
| Admin operation failure | Notification bar | Red-bordered card with AlertCircle, auto-dismiss 5s |
| GitHub token invalid | Status indicator | Orange border/text on GitHub button, error AlertCircle |
| AI connector disconnected | Status dot | `.connector-status-dot.disconnected` gray circle |
| AI connector error | Status dot | `.connector-status-dot.error` red circle |
| AI chat error | Error message bubble | Red-500/10 bg with red border in chat |
| JSON validation error | Inline error | Red mono text in bordered box below textarea |
| API conflict (P2002) | HTTP 409 | "Finding already exists for this project" |

### 33.3 Empty States

| Context | Pattern | Visual |
|---------|---------|--------|
| No findings match filters | Centered card | `<Search className="opacity-40" />` + "No findings match your filters" |
| No findings for comparison | Empty drawer | "No findings selected for comparison" |
| No saved views | Dialog with star icon | "No saved views yet" + Star icon |
| All findings resolved | Quick wins message | "All findings resolved — no quick wins available" |
| No AI connector | WifiOff icon | "No AI connector configured" + WifiOff icon |
| No GitHub token | Orange badge | "No Token" badge with orange border + tooltip |
| No Opencode settings | Not configured state | "Not configured" status indicator |

---

## 34. SHADCN/UI COMPONENT LIBRARY REFERENCE

### 34.1 Library Configuration

**Style**: New York (RSC-compatible)
**Base color**: Neutral
**CSS variables**: Yes
**Icons**: Lucide React
**Config location**: `components.json`

### 34.2 Available Components (47 primitives)

| # | Component | Key Variants | Location |
|---|-----------|-------------|----------|
| 1 | accordion | single/multi expand | `src/components/ui/accordion.tsx` |
| 2 | alert | default/destructive | `src/components/ui/alert.tsx` |
| 3 | alert-dialog | Radix dialog overlay | `src/components/ui/alert-dialog.tsx` |
| 4 | aspect-ratio | Radix aspect-ratio | `src/components/ui/aspect-ratio.tsx` |
| 5 | avatar | Image + fallback | `src/components/ui/avatar.tsx` |
| 6 | badge | default/secondary/destructive/outline | `src/components/ui/badge.tsx` |
| 7 | breadcrumb | Link/separator/ellipsis | `src/components/ui/breadcrumb.tsx` |
| 8 | button | default/destructive/outline/secondary/ghost/link · sizes: default/sm/lg/icon | `src/components/ui/button.tsx` |
| 9 | calendar | Date picker grid | `src/components/ui/calendar.tsx` |
| 10 | card | Card/Header/Title/Description/Action/Content/Footer | `src/components/ui/card.tsx` |
| 11 | carousel | Embla-based | `src/components/ui/carousel.tsx` |
| 12 | chart | Recharts wrapper + tooltip/legend | `src/components/ui/chart.tsx` |
| 13 | checkbox | Radix checkbox | `src/components/ui/checkbox.tsx` |
| 14 | collapsible | Radix collapsible | `src/components/ui/collapsible.tsx` |
| 15 | command | cmdk-based palette | `src/components/ui/command.tsx` |
| 16 | context-menu | Radix context menu | `src/components/ui/context-menu.tsx` |
| 17 | dialog | Radix dialog overlay | `src/components/ui/dialog.tsx` |
| 18 | drawer | vaul-based bottom drawer | `src/components/ui/drawer.tsx` |
| 19 | dropdown-menu | Radix dropdown | `src/components/ui/dropdown-menu.tsx` |
| 20 | form | React Hook Form integration | `src/components/ui/form.tsx` |
| 21 | hover-card | Radix hover card | `src/components/ui/hover-card.tsx` |
| 22 | input | Styled input | `src/components/ui/input.tsx` |
| 23 | input-otp | OTP input | `src/components/ui/input-otp.tsx` |
| 24 | label | Radix label | `src/components/ui/label.tsx` |
| 25 | menubar | Radix menubar | `src/components/ui/menubar.tsx` |
| 26 | navigation-menu | Radix nav menu | `src/components/ui/navigation-menu.tsx` |
| 27 | pagination | Page navigation | `src/components/ui/pagination.tsx` |
| 28 | popover | Radix popover | `src/components/ui/popover.tsx` |
| 29 | progress | Radix progress bar | `src/components/ui/progress.tsx` |
| 30 | radio-group | Radix radio | `src/components/ui/radio-group.tsx` |
| 31 | resizable | react-resizable-panels | `src/components/ui/resizable.tsx` |
| 32 | scroll-area | Radix scroll area | `src/components/ui/scroll-area.tsx` |
| 33 | select | Radix select | `src/components/ui/select.tsx` |
| 34 | separator | Radix separator | `src/components/ui/separator.tsx` |
| 35 | sheet | Radix side panel | `src/components/ui/sheet.tsx` |
| 36 | sidebar | Full sidebar system | `src/components/ui/sidebar.tsx` |
| 37 | skeleton | Loading skeleton | `src/components/ui/skeleton.tsx` |
| 38 | slider | Radix slider | `src/components/ui/slider.tsx` |
| 39 | sonner | Sonner toast integration | `src/components/ui/sonner.tsx` |
| 40 | switch | Radix switch | `src/components/ui/switch.tsx` |
| 41 | table | HTML table components | `src/components/ui/table.tsx` |
| 42 | tabs | Tabs/List/Trigger/Content | `src/components/ui/tabs.tsx` |
| 43 | textarea | Styled textarea | `src/components/ui/textarea.tsx` |
| 44 | toast | Toast state management | `src/components/ui/toast.tsx` |
| 45 | toaster | Toast renderer | `src/components/ui/toaster.tsx` |
| 46 | toggle/toggle-group | Radix toggle | `src/components/ui/toggle.tsx` |
| 47 | tooltip | Radix tooltip | `src/components/ui/tooltip.tsx` |

---

## 35. PACKAGE DEPENDENCIES & THIRD-P PARTY LIBRARIES

### 35.1 Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^16.1.1 | App Router framework |
| `react` | ^19.0.0 | UI library |
| `react-dom` | ^19.0.0 | React DOM renderer |

### 35.2 UI & Styling

| Package | Version | Purpose |
|---------|---------|---------|
| `tailwindcss` | ^4 | CSS framework |
| `@tailwindcss/postcss` | ^4 | PostCSS integration |
| `tailwindcss-animate` | — | Animation utilities plugin |
| `tw-animate-css` | — | Animation CSS |
| `framer-motion` | ^12.23.2 | React animation library |
| `lucide-react` | ^0.525.0 | Icon library |
| `class-variance-authority` | — | Component variant system |
| `clsx` | — | Class name utility |
| `tailwind-merge` | — | Tailwind class merge utility |
| `next-themes` | ^0.4.6 | Dark/light theme system |
| `sonner` | ^2.0.6 | Toast notification library |

### 35.3 Data & State

| Package | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | ^5.82.0 | Server state management + caching |
| `@tanstack/react-table` | ^8.21.3 | Table component logic |
| `@prisma/client` | ^6.11.1 | Database ORM client |
| `prisma` | ^6.11.1 | Database ORM + CLI |

### 35.4 Charts & Visualization

| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | ^2.15.4 | Chart library (PieChart, BarChart, etc.) |

### 35.5 Forms & Validation

| Package | Version | Purpose |
|---------|---------|---------|
| `react-hook-form` | ^7.60.0 | Form state management |
| `@hookform/resolvers` | ^5.1.1 | Form validation resolvers |
| `zod` | ^4.0.2 | Schema validation |

### 35.6 Command Palette

| Package | Version | Purpose |
|---------|---------|---------|
| `cmdk` | ^1.1.1 | Command palette component (used by shadcn/ui Command) |

### 35.7 Authentication

| Package | Version | Purpose |
|---------|---------|---------|
| `next-auth` | ^4.24.11 | Authentication library (available, not currently used) |

### 35.8 AI Integration

| Package | Version | Purpose |
|---------|---------|---------|
| `z-ai-web-dev-sdk` | ^0.0.18 | Cloud AI SDK (fallback for local LLM) |

### 35.9 Drag & Drop

| Package | Version | Purpose |
|---------|---------|---------|
| `@dnd-kit/core` | ^6.3.1 | Drag and drop core |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable drag and drop |

### 35.10 Markdown & Code Display

| Package | Version | Purpose |
|---------|---------|---------|
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `react-syntax-highlighter` | ^15.6.1 | Code syntax highlighting |
| `@mdxeditor/editor` | ^3.39.1 | MDX editor (available) |

### 35.11 Internationalization

| Package | Version | Purpose |
|---------|---------|---------|
| `next-intl` | ^4.3.4 | Internationalization (available, not currently active) |

### 35.12 Utilities

| Package | Version | Purpose |
|---------|---------|---------|
| `date-fns` | ^4.1.0 | Date formatting/utility |
| `uuid` | ^11.1.0 | UUID generation |
| `sharp` | ^0.34.3 | Image processing |
| `vaul` | ^1.1.2 | Bottom drawer component |
| `@reactuses/core` | ^6.0.5 | React utility hooks |

---

*End of Technical Specification. This document covers every model, every API endpoint, every hook, every component, every cache, every data flow, every UX pattern, every visual design decision, every algorithm, every animation, every responsive breakpoint, every error/loading/empty state, every form, every dialog, every panel, every toast, every chart, every color, every icon, every package dependency, and every integration point in the GSD Audit Dashboard.*
