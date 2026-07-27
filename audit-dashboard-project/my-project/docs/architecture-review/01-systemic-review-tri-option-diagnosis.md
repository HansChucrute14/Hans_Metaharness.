# DOCUMENT 1: SYSTEMIC REVIEW & TRI-OPTION DIAGNOSIS

## 1. ARCHITECTURAL BASELINE SUMMARY

**Repository**: `/home/z/my-project` — Next.js 16 App Router, SQLite via Prisma, TanStack Query v5

**Total Source**: ~15,000 lines across 30+ custom components, 12 API routes, 8 lib files

**Critical Hardcoding Points (18 occurrences across 8 files)**:

| # | File | Line(s) | Hardcoded Value | Impact |
|---|------|---------|-----------------|--------|
| H1 | `audit-data.ts` | 48-1268 | 24-findings array (1220 lines) — titles, claims, evidence, affectedFiles, proposals, codeSnippets | **Root cause**: entire dataset immutable at runtime |
| H2 | `audit-data.ts` | 1665-1828 | BEST_PROPOSAL_ANALYSIS — 24 entries | Duplicates task keys from FINDINGS |
| H3 | `audit-data.ts` | 1832-1922 | UNIFIED_EXECUTION_MODULES — 5 modules | Domain-specific module IDs |
| H4 | `audit-data.ts` | 1926-1946 | G3_BLOCKED_FINDINGS — 2 items | Same data in 3 other locations |
| H5 | `audit-data.ts` | 1-2 | "Hans-GSD-Raw-Calculator", "HansChucrte14" | Project identity locked |
| H6 | `config/route.ts` | 10-65 | DEFAULT_CONFIGS — severity, tier, categories, module_ids, repo_info | **Third copy** of config data |
| H7 | `config/route.ts` | 59-64 | repo_info: owner/name/url/description | Project identity hardcode #2 |
| H8 | `github-config.ts` | 39-40 | 'HansChucrte14', 'Hans-GSD-Raw-Calculator' | Fallback defaults |
| H9 | `data.ts` | 132-151 | getG3Blocked() — hardcoded return | **Third copy** of G3 blocked data |
| H10 | `findings/modules/route.ts` | 31-48 | g3Blocked — hardcoded inline | **Fourth copy** |
| H11 | `dashboard-constants.ts` | 11-88 | severity/tier/module color+order maps | **Second copy** of config |
| H12 | `use-findings.ts` | 751 | 'gsd-activity-log' localStorage key | Project-specific prefix |
| H13 | `use-audit-progress.ts` | 6-7 | 'gsd-audit-statuses-v1', 'gsd-audit-notes-v1' | Project-specific prefix |
| H14 | `dashboard-client.tsx` | 754,934 | "Hans-GSD-Raw-Calculator" | Display text |
| H15 | `layout.tsx` | 19,27 | "Hans-GSD-Raw-Calculator — Comprehensive Audit" | Page title |
| H16 | `ai/analyze/route.ts` | 19 | "Hans-GSD-Raw-Calculator project" in AI prompt | AI context locked |
| H17 | `github/issue/route.ts` | 43 | "Hans-GSD-Raw-Calculator Comprehensive Audit Dashboard" | Issue title |
| H18 | `admin-tab.tsx` | 266-267,1299,1306 | Default state: "HansChucrte14", "Hans-GSD-Raw-Calculator" | Admin UI defaults |

---

## 2. SYSTEMIC RISK ANALYSIS

### Risk R1: Triple-Quadruple Config Duplication → Config Drift

**Severity**: CRITICAL
**Evidence**: severity/tier/category/status configs exist in 3 independent files:
1. `audit-data.ts` L1271-1509 (severityConfig, tierLabels, effortConfig, riskConfig, auditStatusConfig, etc.)
2. `dashboard-constants.ts` L11-88 (severityOrder, tierOrder, tierColors, severityColors, moduleColorMap)
3. `config/route.ts` L10-65 (DEFAULT_CONFIGS)

**Systemic Risk**: Any change to severity colors, tier labels, or category definitions requires manual synchronization across 3 files. If one file is updated but another is not, the UI will show inconsistent colors/labels. The config/route.ts DB-backed system already provides override capability, but audit-data.ts and dashboard-constants.ts still import their own hardcoded copies.

**Remediation**: Consolidate to single source — `/api/config` + `AuditConfig` DB table. Components fetch config from API, not from static imports. `audit-data.ts` config exports become dead code after migration.

---

### Risk R2: 2,024-Line Monolith in Runtime Module Graph

**Severity**: HIGH
**Evidence**: `audit-data.ts` (2,024 lines) is imported by 26 files. Even after seeding, the full 24-finding array with all code snippets and proposals remains in the module graph because `dashboard-constants.ts` imports types from it (L1: `import { Severity, Tier, UnifiedModuleId } from '@/lib/audit-data'`), and many components import config values like `severityConfig`, `auditStatusConfig`, etc.

**Systemic Risk**: Every client-side import of `audit-data.ts` pulls the entire 1,220-line FINDINGS array into the bundle. Even though components don't use `FINDINGS` directly (they fetch from `/api/findings`), the bundler can't tree-shake it because it's a top-level `export const`. This increases client bundle size and memory footprint.

**Remediation**: Split `audit-data.ts` into two files:
- `audit-types.ts` (~50 lines) — pure type exports (Severity, Tier, VerificationStatus, Finding interface, etc.)
- `audit-seed-data.ts` — FINDINGS, BEST_PROPOSAL_ANALYSIS, etc. (only imported by `prisma/seed.ts`)
- Config functions (severityConfig, etc.) → moved to `/api/config` response, consumed by components via hooks

---

### Risk R3: No Project Model — Single-Project Lock

**Severity**: CRITICAL
**Evidence**: No `Project` model exists in `prisma/schema.prisma`. All findings, modules, analyses, configs are implicitly scoped to the single "Hans-GSD-Raw-Calculator" project. The `Finding.task` field uses `@unique` constraint, meaning you can't have Task "1" for two different projects.

**Systemic Risk**: Adding a second project is impossible without breaking the unique constraint on `Finding.task`. The `AuditConfig` table has no project scope, so one project's config overrides would affect all projects. The `GitHubConfig` table has no project scope either.

**Remediation**: Add `Project` model with `id`, `name`, `repoOwner`, `repoName`, `description`, `createdAt`. Add `projectId` FK to `Finding`, `AuditConfig`, `GitHubConfig`, `OpencodeSetting`. Make `Finding.task` unique per project (composite unique: `[projectId, task]`).

---

### Risk R4: Dual Progress Tracking — Data Split Brain

**Severity**: MEDIUM
**Evidence**: Two independent progress systems:
1. `use-audit-progress.ts` (L12-120) — localStorage keys `gsd-audit-statuses-v1` / `gsd-audit-notes-v1`
2. `/api/findings/notes/[task]` → `AuditNote` model in SQLite

These never synchronize. localStorage changes don't persist to DB. DB changes don't update localStorage. A user who clears their browser loses all progress, while a user who switches browsers sees no progress at all.

**Remediation**: Make DB the single source of truth. `useAuditProgress` hook should call `/api/findings/notes/[task]` for reads and writes, with localStorage as an optional offline cache that syncs on mount.

---

### Risk R5: Reads Implemented as Mutations — No Query Caching

**Severity**: MEDIUM
**Evidence**: 6 hooks in `use-findings.ts` use `useMutation` for GET operations:
- `useGitHubIssues` (L284), `useGitHubTokenStatus` (L302), `useAIConnectorStatus` (L422), `useOpencodeStatus` (L545), `useGitHubPullSync` (L650), `useGitHubConfig` (L715)

**Systemic Risk**: No TanStack Query cache → no background refetching, no stale-while-revalidate, no deduplication. Every component mount triggers a fresh API call. With 5-minute staleTime configured in `query-provider.tsx`, these hooks should be using `useQuery` to benefit from caching.

**Remediation**: Convert the 6 read hooks to `useQuery` with appropriate query keys. Keep mutation hooks for actual POST/PUT/DELETE operations. Use `invalidateQueries` in mutation `onSuccess` instead of `router.refresh()`.

---

### Risk R6: Dead Code — User/Post Models, Zustand

**Severity**: LOW
**Evidence**:
- `User` and `Post` models in `prisma/schema.prisma` L13-29 — never referenced in any source file
- `zustand@5.0.6` in `package.json` — never imported in any `src/` file

**Remediation**: Remove both. Dead code increases cognitive overhead for a solo maintainer.

---

## 3. TRI-OPTION ANALYSIS

### Proposal P1: Project Model & Multi-Project Support

**Option 1 (X — Ponytail Engineer)**: Minimal `Project` model. Just `id`, `name`, `repoOwner`, `repoName`. Add `projectId` to `Finding`, `AuditConfig`, `GitHubConfig`. Use composite unique `[projectId, task]`. Onboarding: simple form in Admin tab → "Add Project" → enter repo owner/name → done.

```typescript
// Minimal Project model
model Project {
  id        String   @id @default(cuid())
  name      String
  repoOwner String
  repoName  String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  
  findings      Finding[]
  auditConfigs  AuditConfig[]
  githubConfigs GitHubConfig[]
}

// Finding gets projectId
model Finding {
  // ...existing fields...
  projectId String
  project   Project @relation(fields: [projectId], references: [id])
  
  @@unique([projectId, task])  // Composite unique instead of task alone
}
```

**Pros**: Surgical, minimal schema change, backward-compatible (existing data gets `projectId = default-project-id`), low cognitive overhead.
**Cons**: No description, no URL, no onboarding flow beyond admin form. Project switching UX not addressed.

**Option 2 (Y — Adversarial Architect)**: Full `Project` model with rich metadata + onboarding wizard. Add `description`, `repoUrl`, `defaultBranch`, `labels`, `createdAt`, `updatedAt`, `settings` (JSON). Create a dedicated `/onboarding` route with multi-step wizard. Use a project selector dropdown in the header.

```typescript
model Project {
  id           String   @id @default(cuid())
  name         String   @unique
  description  String   @default("")
  repoOwner    String
  repoName     String
  repoUrl      String   @default("")
  defaultBranch String  @default("main")
  labels       String   @default("[]")  // JSON array of GitHub label names
  settings     String   @default("{}")  // JSON project-level settings
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  findings      Finding[]
  auditConfigs  AuditConfig[]
  githubConfigs GitHubConfig[]
  opencodeSettings OpencodeSetting[]
}
```

**Pros**: Rich metadata, proper onboarding UX, project switching in header, extensible settings.
**Cons**: Over-engineered for solo dev. `labels` and `settings` JSON fields add complexity. Multi-step wizard adds 3+ new components. `@unique` on `name` constrains project naming.

**Option 3 (Union — Optimal Synthesis)**: Lean `Project` model with essential fields only + lightweight onboarding inside existing Admin tab (no new route). Add `description`, `repoUrl` (computed from owner+name), `isActive`. Use existing Admin tab to add a "Projects" section with a simple form. Project switching via a dropdown in the existing header bar (already has theme toggle, can add project selector).

```typescript
model Project {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  repoOwner   String
  repoName    String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  findings      Finding[]
  auditConfigs  AuditConfig[]
  githubConfigs GitHubConfig[]
  opencodeSettings OpencodeSetting[]
}
```

**Why this is the Union**: X's minimalism keeps cognitive overhead low. Y's `description` field is useful (not over-engineered). Y's dedicated onboarding route is rejected (violates Solo Maintainer rule — adds route + 3 components). X's admin-form approach is kept. Y's project selector dropdown is adopted (minimal UI addition). Composite unique `[projectId, task]` from X is kept. Y's `labels` and `settings` JSON are rejected (over-engineered, should come from `/api/config` if needed).

---

### Proposal P2: Config Consolidation (Triple Duplication Elimination)

**Option 1 (X — Ponytail Engineer)**: Delete config exports from `audit-data.ts` and `dashboard-constants.ts`. Make `/api/config` the single source. Create a `useAuditConfig` hook that fetches from `/api/config` and provides all config maps. Components replace static imports with hook calls.

```typescript
// New: src/lib/use-audit-config.ts
export function useAuditConfig() {
  return useQuery({
    queryKey: ['audit-config'],
    queryFn: () => fetch('/api/config').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })
}
// Components: const { data: config } = useAuditConfig()
// config.severity_levels, config.tier_labels, etc.
```

**Pros**: Single source of truth, DB-overridable, proper query caching.
**Cons**: Every component needs to call the hook → config loading state on every render. Initial page load slower (needs API call before rendering). Components can't use config in static contexts (e.g., module-level color maps).

**Option 2 (Y — Adversarial Architect)**: Keep `audit-data.ts` config exports as immutable defaults. Make `dashboard-constants.ts` merge defaults with DB overrides at build time via a server component that pre-fetches config. Pass merged config as props from server → client.

```typescript
// Server component pre-fetches config
export default async function DashboardPage() {
  const config = await getAuditConfig() // DB-first with defaults
  return <ClientOnlyDashboard initialConfig={config} />
}
```

**Pros**: No loading state, config available at render time, backward-compatible.
**Cons**: Server component must be changed (currently uses `ssr: false` for OOM reasons). Pre-fetching config in SSR adds ~50ms latency. Config changes require page refresh (no real-time updates).

**Option 3 (Union — Optimal Synthesis)**: Hybrid approach. Keep type definitions and default values in a new lean `audit-types.ts` file. Create `useAuditConfig` as a `useQuery` hook with 5-min staleTime. On first render, use the defaults from `audit-types.ts` (instant, no loading). When API response arrives, merge DB overrides on top. This gives zero-loading-state UX + DB-overridability.

```typescript
// audit-types.ts: DEFAULT_SEVERITY_CONFIG, DEFAULT_TIER_LABELS, etc.
// useAuditConfig.ts:
export function useAuditConfig() {
  return useQuery({
    queryKey: ['audit-config'],
    queryFn: async () => {
      const res = await fetch('/api/config')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_CONFIGS, // Instant defaults, no loading
  })
}
```

**Why this is the Union**: X's API-as-source gives DB-overridability. Y's server-pre-fetch gives instant rendering. Union uses `placeholderData` (TanStack Query v5 feature) to provide defaults immediately, then overlays DB overrides when they arrive. No loading state, no SSR overhead, single source of truth in DB + defaults file.

---

### Proposal P3: Template-Based Narratives (DB-Driven)

**Option 1 (X — Ponytail Engineer)**: Move findings, proposals, code snippets, and analyses entirely to the DB (they already are via Prisma models). The `audit-data.ts` FINDINGS array becomes a seed-only file. Narrative templates come from `AuditConfig` — e.g., `finding_template` config key with a markdown template that components render dynamically.

```typescript
// AuditConfig key: "finding_template"
// Value: {
//   header: "## {title} ({severity})",
//   body: "{claim}\n\n**Evidence**: {evidence}",
//   footer: "Affected files: {affectedFiles}"
// }
```

**Pros**: Simple, uses existing AuditConfig infrastructure. Templates overridable per project.
**Cons**: Markdown template strings are fragile — `{affectedFiles}` needs to know it's an array. No validation on template variables. Hard for a solo dev to maintain template syntax.

**Option 2 (Y — Adversarial Architect)**: Create a `NarrativeTemplate` Prisma model with structured fields: `section`, `templateText`, `variables` (JSON), `projectId`. Add a template engine that validates variable references against Finding fields. Add a template editor UI in Admin tab.

```typescript
model NarrativeTemplate {
  id          String @id @default(cuid())
  projectId   String
  section     String  // "finding_header", "proposal", "evidence_summary"
  templateText String
  variables   String  // JSON: ["title", "severity", "affectedFiles"]
  isActive    Boolean @default(true)
  project     Project @relation(fields: [projectId], references: [id])
}
```

**Pros**: Structured, validated, per-project, editable via UI.
**Cons**: New model, new API route, new admin UI component, template engine — too much for solo dev.

**Option 3 (Union — Optimal Synthesis)**: Use `AuditConfig` table (already exists) for template storage. Add 2-3 config keys: `narrative_templates`, `export_templates`. Templates are simple JSON objects with field references, not markdown strings. Components use a lightweight `renderTemplate(template, finding)` function that substitutes `{field}` with `finding[field]`. No new Prisma model, no new API route, no new admin UI beyond the existing config editor.

```typescript
// AuditConfig key: "narrative_templates"
// Value: {
//   finding_header: "{task}: {title} — {severity} ({tier})",
//   finding_summary: "{claim}\nEvidence: {evidence}\nFiles: {affectedFiles}",
//   proposal_card: "{title} — Effort: {effort}, Risk: {risk}"
// }
```

**Why this is the Union**: X uses existing infrastructure (good). Y's structured model is over-engineered (rejected). Union uses AuditConfig (zero schema change) with simple JSON template format. The `renderTemplate` function is ~20 lines. No new routes, no new models, no new admin UI sections.

---

### Proposal P4: Configurable Export Templates

**Option 1 (X — Ponytail Engineer)**: The existing `export-enhancements.tsx` (296 lines) already has export logic. Add an `AuditConfig` key `export_templates` that defines CSV/JSON columns and markdown sections. The export component reads from config instead of hardcoded field lists.

**Option 2 (Y — Adversarial Architect)**: Create a full template engine with variable interpolation, conditional sections, and per-format (CSV, JSON, Markdown, PDF) template definitions stored in a new `ExportTemplate` model with a preview renderer.

**Option 3 (Union)**: Use `AuditConfig` key `export_templates` with simple column/section definitions. Export component reads from config. Preview shows rendered output. No new model. ~50 lines of template rendering logic added to existing `export-enhancements.tsx`.

**Solo Maintainer Verdict**: All Union options win. AuditConfig exists, is DB-backed, is overridable per-project (once Project model is added). Zero schema changes needed for P3 and P4.

---

## 4. OVER-ENGINEERING AUDIT

| Proposal | Over-Engineered? | Verdict |
|----------|------------------|---------|
| P1 (Project Model) | Option Y is over-engineered (8+ fields, JSON settings, dedicated route). Option X is too minimal (no description). **Union is balanced.** | ✅ Adopt Union |
| P2 (Config Consolidation) | Option Y (server pre-fetch) violates OOM constraint (ssr:false is required). Option X (API-only) has loading state. **Union (placeholderData) solves both.** | ✅ Adopt Union |
| P3 (Template Narratives) | Option Y (NarrativeTemplate model + engine + editor) is 3x over-engineered. **Union (AuditConfig key + renderTemplate function) is correct.** | ✅ Adopt Union |
| P4 (Export Templates) | Option Y (ExportTemplate model) is over-engineered. **Union (AuditConfig key) is correct.** | ✅ Adopt Union |

**Eliminated**: Dedicated `/onboarding` route, `NarrativeTemplate` model, `ExportTemplate` model, `labels`/`settings` JSON on Project, server-side config pre-fetch (OOM risk).

---

## 5. SOTA RESEARCH INSIGHTS (Applied to Architecture)

### Anthropic Context Engineering (Sep 2025)
**Key Insight**: "Context is a critical but finite resource for AI agents. Finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome."

**Application**: The 2,024-line `audit-data.ts` monolith floods the client bundle with low-signal data (24 full findings with code snippets). After migration, only the types (high-signal, ~60 lines) and defaults (high-signal, ~100 lines) remain in the runtime module graph. Seed data is excluded entirely.

### Addy Osmani Agentic Code Review (Jun 2026)
**Key Insight**: "Cheap deterministic gates and AI reviewers... adversarial review argument demonstrated on a real codebase."

**Application**: Template validation in Step 11 is a deterministic gate — it prevents invalid template variables from being saved to the DB. The `renderTemplate` function is deterministic — same inputs always produce same outputs. This eliminates the class of AI execution errors where a downstream agent might construct malformed template references.

### DeepSeek R1 Self-Verification (Jan 2025)
**Key Insight**: "R1-Zero demonstrates self-verification, reflection, and generating long CoTs."

**Application**: The adversarial dialectic in Document 2 is a manual self-verification loop — each proposal is tested by an adversarial persona that identifies edge cases and breaking changes, then a synthesis is produced that resolves both. This mirrors the self-verification pattern: propose → critique → refine.

### Structured Outputs (Anthropic/OpenAI 2025-2026)
**Key Insight**: "Schema-constrained outputs ensure valid, parseable output for downstream processing."

**Application**: The `AuditConfig` keys `narrative_templates` and `export_templates` are schema-constrained — template variables must match the `KNOWN_TEMPLATE_VARS` set. The PUT handler validates before saving. This prevents downstream AI agents from producing malformed template references.
