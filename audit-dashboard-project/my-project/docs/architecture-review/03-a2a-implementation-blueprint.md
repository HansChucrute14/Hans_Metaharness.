# DOCUMENT 3: DETERMINISTIC A2A IMPLEMENTATION BLUEPRINT

## FORMAT: A2A machine-readable. Minimal prose. Zero conversational filler. Highly context-compressed.

---

## STEP 1: PRISMA SCHEMA — Add `Project` model, add `projectId` FKs, fix `BestProposalAnalysis` & `AuditNote` FKs, add `projectId` to `GitHubSyncLog` & `OpencodeAction`

**Target file**: `/home/z/my-project/prisma/schema.prisma`

### ACTION 1.1: ADD Project model AFTER line 11 (after datasource block)

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  repoOwner   String
  repoName    String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  findings         Finding[]
  auditConfigs     AuditConfig[]
  githubConfigs    GitHubConfig[]
  opencodeSettings OpencodeSetting[]
  auditNotes       AuditNote[]
  syncLogs         GitHubSyncLog[]
  actions          OpencodeAction[]
}
```

### ACTION 1.2: Add projectId to Finding model

After existing fields, before createdAt. Remove `@unique` from `task` field (line 35: `task String @unique` → `task String`). Add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, task])
```

### ACTION 1.3: Add projectId to AuditConfig model

Remove `@unique` from `key` field (line 176: `key String @unique` → `key String`). Add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, key])
```

### ACTION 1.4: Add projectId to GitHubConfig model

Remove `@unique` from `key` field (line 188: `key String @unique` → `key String`). Add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, key])
```

### ACTION 1.5: Add projectId to OpencodeSetting model

After existing fields, before createdAt. Add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId])
```

> **Fix**: Added `@@unique([projectId])` — each project has exactly one OpencodeSetting row, so this prevents duplicates. Previously missing uniqueness constraint.

### ACTION 1.6: Fix BestProposalAnalysis — change task FK to findingId FK

Replace entire model (lines 86-95):

```prisma
model BestProposalAnalysis {
  id             String  @id @default(cuid())
  findingId      String  @unique
  bestSoloIndex  Int
  bestSoloReason String
  hybridNote     String?
  unifiedModuleId String?

  finding        Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
}
```

### ACTION 1.7: Fix AuditNote — change task FK to findingId FK

> **CRITICAL FIX**: AuditNote had `task` FK referencing `Finding.task`, which becomes non-unique after multi-project migration. Same broken-FK pattern as BestProposalAnalysis, but was completely missed in original blueprint. Changed to `findingId` (cuid-based FK) for consistency.

Replace the `task` FK field in AuditNote model with `findingId`. Remove `task String` field from AuditNote if it was used as a domain FK. Add:

```prisma
model AuditNote {
  id              String   @id @default(cuid())
  findingId       String
  note            String
  author          String   @default("")
  severityOverride String?
  createdAt       DateTime @default(now())

  finding         Finding  @relation(fields: [findingId], references: [id], onDelete: Cascade)
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  projectId       String
}
```

> **Note**: If AuditNote already has a `projectId` field (from another source), merge this with that. The key change is: `task` domain FK → `findingId` cuid FK + `projectId` FK with cascade.

### ACTION 1.8: Add projectId to GitHubSyncLog model

> **EDGE FIX**: After multi-project migration, `task` references in GitHubSyncLog are ambiguous — which project's task? Adding `projectId` disambiguates and enables cascade deletes.

After existing fields, add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

### ACTION 1.9: Add projectId to OpencodeAction model

> **EDGE FIX**: Same ambiguity issue as GitHubSyncLog. Adding `projectId` ensures actions are scoped to a project and cascade-deleted properly.

After existing fields, add:

```prisma
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

### ACTION 1.10: Remove dead User and Post models (lines 13-29)

Delete lines 13-29 entirely.

---

## STEP 2: TWO-STEP DB MIGRATION — nullable → seed → required (SQLite-safe)

> **CRITICAL FIX**: Original blueprint just said `bun run db:push`. Doc 2 recommended nullable→seed→required approach. SQLite cannot add required columns to existing tables with data. This two-step migration prevents `Cannot add a required column with a default value` errors.

### ACTION 2a: First db:push — all new `projectId` columns as OPTIONAL (nullable)

**Modify schema temporarily**: All `projectId String` fields become `projectId String?` (nullable). All `@@unique` constraints still applied (Prisma allows nullable in composites for existing rows). All `onDelete: Cascade` relations kept.

```prisma
// TEMPORARY — Step 2a only. Revert after seed.
model Finding {
  // ... existing fields ...
  projectId String?   // nullable for migration
  project   Project?  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, task])
}
// Same pattern for AuditConfig, GitHubConfig, OpencodeSetting, AuditNote, GitHubSyncLog, OpencodeAction
```

**Command**:
```bash
bun run db:push
```

This adds the columns as nullable, so existing rows get `NULL` values — no constraint violation.

### ACTION 2b: Seed default project + migrate all existing FK references

**Execute seed SQL** (via `prisma db execute` or direct SQLite commands):

```sql
-- Create default project
INSERT INTO Project (id, name, description, repoOwner, repoName, isActive, createdAt, updatedAt)
VALUES ('default-project', 'Hans-GSD-Raw-Calculator', 'GSD dog diet formulation tool using linear programming', 'HansChucrte14', 'Hans-GSD-Raw-Calculator', 1, datetime('now'), datetime('now'));

-- Update all existing records with projectId (nullable → filled)
UPDATE Finding SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE AuditConfig SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE GitHubConfig SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE OpencodeSetting SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE AuditNote SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE GitHubSyncLog SET projectId = 'default-project' WHERE projectId IS NULL;
UPDATE OpencodeAction SET projectId = 'default-project' WHERE projectId IS NULL;

-- Migrate BestProposalAnalysis from task FK to findingId FK
-- Match each analysis row's task value to Finding.id where Finding.task = that value
UPDATE BestProposalAnalysis
SET findingId = (
  SELECT f.id FROM Finding f
  WHERE f.task = BestProposalAnalysis.task
  AND f.projectId = 'default-project'
  LIMIT 1
)
WHERE findingId IS NULL;

-- Migrate AuditNote from task FK to findingId FK
-- Match each AuditNote row's task value to Finding.id where Finding.task = that value
UPDATE AuditNote
SET findingId = (
  SELECT f.id FROM Finding f
  WHERE f.task = AuditNote.task
  AND f.projectId = 'default-project'
  LIMIT 1
)
WHERE findingId IS NULL;

-- Remove old task FK columns from BestProposalAnalysis and AuditNote AFTER migration
-- (These columns may still exist temporarily; they get removed in Step 2c schema change)
```

> **CRITICAL FIX**: Original blueprint had only placeholder comments for FK migration. This adds actual UPDATE SQL for both BestProposalAnalysis AND AuditNote (AuditNote was completely missed).

### ACTION 2c: Second db:push — make all `projectId` columns REQUIRED (non-null)

**Revert schema**: All `projectId String?` → `projectId String` (required). Remove old `task` FK fields from BestProposalAnalysis and AuditNote models (they now use `findingId`).

```prisma
// FINAL — Step 2c. All projectId fields required.
model Finding {
  // ... existing fields ...
  projectId String    // required — all rows seeded
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  @@unique([projectId, task])
}
// Same for all other models — projectId String (required)
```

**Command**:
```bash
bun run db:push
```

Now all rows have valid `projectId` values, so making the column required succeeds without data loss.

**Schema for default project**:
```typescript
interface SeedProject {
  id: 'default-project'
  name: 'Hans-GSD-Raw-Calculator'
  description: 'GSD dog diet formulation tool using linear programming'
  repoOwner: 'HansChucrte14'
  repoName: 'Hans-GSD-Raw-Calculator'
  isActive: true
}
```

---

## STEP 3: ADD `active_project` AUDITCONFIG KEY

**Target**: `/home/z/my-project/src/app/api/config/route.ts` L10-65

**Action**: Add to `DEFAULT_CONFIGS`:

```typescript
active_project: {
  projectId: 'default-project',
  projectName: 'Hans-GSD-Raw-Calculator',
},
```

---

## STEP 4: CREATE `/api/project` ROUTE

**New file**: `/home/z/my-project/src/app/api/project/route.ts`

**Schema**:

```typescript
// GET /api/project — list all projects, include active project info
interface ProjectListResponse {
  projects: Array<{
    id: string
    name: string
    description: string
    repoOwner: string
    repoName: string
    isActive: boolean
    createdAt: string
    updatedAt: string
    findingCount: number
  }>
  activeProjectId: string | null
}

// POST /api/project — create new project
interface CreateProjectRequest {
  name: string        // required
  repoOwner: string   // required
  repoName: string    // required
  description?: string
}
interface CreateProjectResponse {
  project: {
    id: string
    name: string
    // ... all Project fields
  }
  seeded: boolean  // whether default configs were seeded
}

// PUT /api/project — set active project
interface SetActiveProjectRequest {
  projectId: string  // required
}

// DELETE /api/project?id=xxx — delete project and all its data
```

**Implementation**:
- GET: `db.project.findMany()` + include `_count` for findings. Read `active_project` from `AuditConfig` or fallback to first project.
- POST: `db.project.create()`. Then seed default configs for this project (copy from DEFAULT_CONFIGS with `projectId = new project id`). Set `active_project` config to new project.
- PUT: Upsert `AuditConfig` key `active_project` with `projectId`. Invalidate all query caches.
- DELETE: `db.project.delete()` with cascading deletes for all related data (all relations have `onDelete: Cascade` from Step 1).

---

## STEP 5: CREATE `ProjectContext` PROVIDER

**New file**: `/home/z/my-project/src/lib/project-context.tsx`

**Schema**:

```typescript
interface ProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string) => void
  projects: ProjectSummary[]
  activeProject: ProjectSummary | null
  isLoading: boolean
}

interface ProjectSummary {
  id: string
  name: string
  description: string
  repoOwner: string
  repoName: string
  isActive: boolean
  findingCount: number
}

// Implementation:
// - useQuery(['projects']) to fetch project list
// - useState for activeProjectId (initialized from API response)
// - useMutation for setActiveProjectId → PUT /api/project → invalidateQueries
// - CRITICAL: setActiveProjectId must also call queryClient.clear() 
//   to prevent stale data from previous project being displayed during refetch
```

> **EDGE FIX**: On project switch, call `queryClient.clear()` (not just `invalidateQueries`) to prevent race conditions where stale data from the previous project briefly appears while new data is being fetched.

**Integration point**: Wrap `<DashboardClient>` in `<ProjectProvider>` in `/home/z/my-project/src/components/client-only-dashboard.tsx` L14-29.

> **EDGE FIX**: Provider nesting order MUST be: `<QueryClientProvider>` → `<ProjectProvider>` → `<DashboardClient>`. ProjectProvider uses `useQuery` internally, so it must be inside QueryClientProvider. Verify this order in the wrapping code.

---

## STEP 6: ADD PROJECT SELECTOR TO HEADER

**Target**: `/home/z/my-project/src/components/dashboard-client.tsx` L131-200 (header area)

**Action**: Add `<ProjectSelector>` dropdown between the title and theme toggle. Uses `useProject()` context. Dropdown shows project list, changes `activeProjectId` on selection.

**Schema**:

```typescript
// ProjectSelector component
// - Reads projects from useProject()
// - Dropdown with project names
// - On change: setActiveProjectId(newId)
// - CRITICAL: setActiveProjectId calls queryClient.clear() internally
//   (see Step 5) to flush stale cache before refetch
// - Triggers full data refetch for new project
```

---

## STEP 7: UPDATE ALL DB QUERY CALLS TO USE `projectId`

**Files to modify** (with exact line ranges):

| File | Lines | Change |
|------|-------|--------|
| `/api/findings/route.ts` | L7-15 | `db.finding.findMany({ where: { projectId: activeId }, include: {...}, orderBy: { task: 'asc' } })` |
| `/api/findings/[task]/route.ts` | L1-55 | `findUnique({ where: { projectId_task: { projectId: activeId, task } } })` |
| `/api/findings/batch/route.ts` | L1-67 | Add `projectId` to each created finding |
| `/api/findings/notes/[task]/route.ts` | L1-30 | `findFirst({ where: { task, projectId: activeId } })` for finding lookup → then `findUnique({ where: { projectId_task } })` |
| `/api/findings/modules/route.ts` | L8-17 | `db.unifiedExecutionModule.findMany({ where: { findings: { every: { projectId: activeId } } } })` |
| `/api/config/route.ts` | L74, L122 | `findUnique({ where: { projectId_key: { projectId: activeId, key } } })` |
| `/api/github/config/route.ts` | L1-75 | All queries add `where: { projectId: activeId }` |
| `/api/github/token/route.ts` | L1-102 | Same |
| `/api/github/issue/route.ts` | L1-151 | Finding lookup adds `projectId` |
| `/api/github/sync/route.ts` | L1-405 | Finding queries add `projectId` |
| `/api/github/project/route.ts` | L1-187 | Config queries add `projectId` |
| `/api/opencode/route.ts` | L1-440 | All queries add `where: { projectId: activeId }` |
| `/lib/github-config.ts` | L28-45 | `db.gitHubConfig.findMany({ where: { projectId: activeId } })` |
| `/lib/data.ts` | L82-107 | `getFindings()` adds `where: { projectId }` |

**Helper function**: See **Step 24** — `/lib/get-active-project.ts` with `getActiveProjectId()` (3-level fallback with `try/catch` on JSON.parse) and `validateProjectId()` (project existence check). All API routes use this helper.

---

## STEP 8: SPLIT `audit-data.ts` INTO 3 FILES

**Target**: `/home/z/my-project/src/lib/audit-data.ts` (2,024 lines)

### ACTION 8.1: Create `/home/z/my-project/src/lib/audit-types.ts` (~60 lines)

Extract: type Severity, Tier, VerificationStatus, AuditStatus, RiskLevel
Extract: interface Proposal, CodeSnippet, Finding, BestProposalAnalysis, UnifiedExecutionModule, G3BlockedFinding, DeferredItem, ComparisonField
Extract: type UnifiedModuleId, ModuleCoverageStats
Source lines: 6-46, 1438, 1520, 1618-1664, 2003-2010

### ACTION 8.2: Create `/home/z/my-project/src/lib/audit-defaults.ts` (~100 lines)

Extract: DEFAULT_SEVERITY_CONFIG (from severityConfig L1271-1308)
Extract: DEFAULT_TIER_LABELS (from tierLabels L1345-1352)
Extract: DEFAULT_EFFORT_CONFIG (from effortConfig L1353-1358)
Extract: DEFAULT_RISK_CONFIG (from riskConfig L1359-1363)
Extract: DEFAULT_AUDIT_STATUS_CONFIG (from auditStatusConfig L1440-1488)
Extract: DEFAULT_VERIFICATION_CONFIG (from verificationConfig L1309-1343)
Extract: DEFAULT_CATEGORY_COLORS (from categoryColors L1366-1389)
Extract: DEFAULT_TIER_IMPACT (from tierImpact L1496-1502)
Extract: DEFAULT_SEVERITY_WEIGHT (from severityWeight L1504-1509)
Extract: DEFAULT_EFFORT_HOURS (from effortHours L1580-1584)
This becomes the flat config object used by useAuditConfig's placeholderData

### ACTION 8.3: Create `/home/z/my-project/src/lib/audit-utils.ts` (~80 lines)

Extract: getRiskScore(), getRiskLevel(), getRiskMatrix()
Change signature: each function takes config as parameter
```typescript
export function getRiskScore(config: AuditConfigData, tier: Tier, severity: Severity): number
```
Extract: getAffectedFilesStats(), getCategoryStats(), getTierSeverityMatrix()
Add NEW: renderTemplate(template: string, data: Record<string, any>): string

### ACTION 8.4: Keep `/home/z/my-project/src/lib/audit-data.ts` as seed-only file

FINDINGS array (L48-1268), BEST_PROPOSAL_ANALYSIS (L1665-1828), UNIFIED_EXECUTION_MODULES (L1832-1922) stay here.
Add comment: `// SEED-ONLY FILE — not imported at runtime`

### ACTION 8.5: Update all 26 import sites

```typescript
// BEFORE: import { Severity, Tier, Finding } from '@/lib/audit-data'
// AFTER:  import { Severity, Tier, Finding } from '@/lib/audit-types'

// BEFORE: import { severityConfig, auditStatusConfig } from '@/lib/audit-data'
// AFTER:  const { data: config } = useAuditConfig()
//         config.severity_levels, config.audit_statuses, etc.

// BEFORE: import { getRiskScore } from '@/lib/audit-data'
// AFTER:  import { getRiskScore } from '@/lib/audit-utils'
//         getRiskScore(config, tier, severity) // takes config as param
```

---

## STEP 9: CREATE `useAuditConfig` HOOK

**New file**: `/home/z/my-project/src/lib/use-audit-config.ts`

**Schema**:

```typescript
import { useQuery } from '@tanstack/react-query'
import { DEFAULT_CONFIGS } from '@/lib/audit-defaults'

interface AuditConfigData {
  severity_levels: Record<string, SeverityConfigEntry>
  tier_labels: Record<string, TierConfigEntry>
  categories: string[]
  audit_statuses: Record<string, AuditStatusConfigEntry>
  verification_statuses: Record<string, VerificationConfigEntry>
  effort_levels: Record<string, EffortConfigEntry>
  risk_levels: Record<string, RiskConfigEntry>
  module_ids: Record<string, ModuleConfigEntry>
  repo_info: RepoInfo
  narrative_templates: NarrativeTemplates
  export_templates: ExportTemplates
  g3_blocked: G3BlockedItem[]
  active_project: { projectId: string; projectName: string }
}

export function useAuditConfig() {
  const { activeProjectId } = useProject()
  
  return useQuery({
    queryKey: ['audit-config', activeProjectId],
    queryFn: async () => {
      const res = await fetch(`/api/config?projectId=${activeProjectId ?? 'default-project'}`)
      const data = await res.json()
      // Flatten { configs: { key: { value, isDefault } } } to flat config object
      const flat: Record<string, object> = {}
      for (const [k, v] of Object.entries(data.configs)) {
        flat[k] = (v as any).value
      }
      return flat as AuditConfigData
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_CONFIGS,
  })
}
```

---

## STEP 10: ADD NARRATIVE & EXPORT TEMPLATE CONFIG KEYS

**Target**: `/home/z/my-project/src/app/api/config/route.ts` L10-65 DEFAULT_CONFIGS

Add 2 new keys:

```typescript
narrative_templates: {
  finding_header: '{task}: {title} — {severity} ({tier})',
  finding_summary: '{claim}\nEvidence: {evidence}\nFiles: {affectedFiles}',
  proposal_card: '{title} — Effort: {effort}, Risk: {risk}',
  module_header: '{id}: {title} — {subtitle}',
  module_coverage: '{coreIdea}\nFixes: {fixes}',
  ai_prompt_prefix: 'Analyze the following finding for the {repoName} project:',
  github_issue_title: '{repoName} Audit: {task} — {title}',
  github_issue_body: '**Severity**: {severity}\n**Tier**: {tier}\n**Category**: {category}\n\n{claim}\n\n**Evidence**: {evidence}\n\n**Affected Files**: {affectedFiles}',
},

export_templates: {
  csv_columns: ['task', 'title', 'severity', 'tier', 'category', 'summary', 'verificationStatus', 'affectedFiles'],
  csv_headers: ['Task', 'Title', 'Severity', 'Tier', 'Category', 'Summary', 'Verification', 'Files'],
  markdown_sections: ['header', 'summary_table', 'findings_detail', 'module_summary', 'g3_blocked'],
  json_fields: ['task', 'title', 'severity', 'tier', 'category', 'summary', 'claim', 'evidence', 'affectedFiles', 'proposals'],
},
```

---

## STEP 11: ADD TEMPLATE VALIDATION TO CONFIG PUT HANDLER

**Target**: `/home/z/my-project/src/app/api/config/route.ts` L108-141 PUT handler

Add validation before upsert:

```typescript
// Known template variable set (from Finding + Module fields)
const KNOWN_TEMPLATE_VARS = new Set([
  'task', 'title', 'severity', 'tier', 'category', 'summary', 'claim',
  'evidence', 'verificationStatus', 'affectedFiles', 'repoName', 'repoOwner',
  'id', 'subtitle', 'coreIdea', 'fixes', 'effort', 'risk',
  'findingIds', 'dependsOn', 'verificationNote',
])

function validateTemplates(key: string, value: object): string[] {
  if (key !== 'narrative_templates' && key !== 'export_templates') return []
  const errors: string[] = []
  if (key === 'narrative_templates') {
    for (const [section, template] of Object.entries(value as Record<string, string>)) {
      const vars = [...template.matchAll(/\{(\w+)\}/g)].map(m => m[1])
      for (const v of vars) {
        if (!KNOWN_TEMPLATE_VARS.has(v)) {
          errors.push(`Section "${section}" has unknown variable "{${v}}"`)
        }
      }
    }
  }
  return errors
}
```

---

## STEP 12: ADD `renderTemplate` FUNCTION

**Target**: `/home/z/my-project/src/lib/audit-utils.ts` (new file from Step 8.3)

```typescript
export function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key]
    if (val === undefined) return `{${key}}`  // Keep original placeholder if missing
    if (val === null) return ''                // Render null as empty string, NOT "null"
    if (Array.isArray(val)) return val.join(', ')
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}
```

> **P1 FIX**: Added `if (val === null) return ''` BEFORE the `typeof val === 'object'` check. Original blueprint had `typeof null === 'object'` → `JSON.stringify(null)` → `"null"` literal string rendered in templates. This edge case would cause visible "null" text in UI (e.g., finding headers showing "null" instead of empty).

---

## STEP 13: REPLACE HARDCODED PROJECT STRINGS WITH TEMPLATE/CONFIG REFERENCES

**Files and specific line-level changes**:

| File | Line(s) | Hardcoded | Replacement |
|------|---------|-----------|-------------|
| `layout.tsx` | 19, 27 | `"Hans-GSD-Raw-Calculator — Comprehensive Audit"` | **See Step 25 — use `generateMetadata()` async function** (layout.tsx is a server component, cannot use `useAuditConfig()` hook) |
| `dashboard-client.tsx` | 754, 934 | `"Hans-GSD-Raw-Calculator"` | `activeProject?.name ?? 'Audit Dashboard'` |
| `overview-tab-content.tsx` | 453 | `"github.com/HansChucrte14/Hans-GSD-Raw-Calculator"` | `config.repo_info.owner + "/" + config.repo_info.name` |
| `admin-tab.tsx` | 266-267 | Default: `"HansChucrte14"`, `"Hans-GSD-Raw-Calculator"` | Default: `activeProject?.repoOwner ?? ''`, `activeProject?.repoName ?? ''` |
| `admin-tab.tsx` | 1299, 1306 | Same defaults | Same replacement |
| `ai/analyze/route.ts` | 19 | `"Hans-GSD-Raw-Calculator project"` | `renderTemplate(config.narrative_templates.ai_prompt_prefix, { repoName: project.repoName })` |
| `github/issue/route.ts` | 43 | `"Hans-GSD-Raw-Calculator Comprehensive Audit Dashboard"` | `renderTemplate(config.narrative_templates.github_issue_title, { repoName: project.repoName, task: finding.task, title: finding.title })` |
| `github/sync/route.ts` | 293 | `"Hans-GSD-Raw-Calculator audit dashboard"` | Same template-based replacement |
| `export-enhancements.tsx` | 97, 179, 182 | `repo: 'github.com/HansChucrte14/Hans-GSD-Raw-Calculator'` | `repo: config.repo_info.owner + "/" + config.repo_info.name` |
| `opencode-panel.tsx` | 360 | `/path/to/Hans-GSD-Raw-Calculator` | Placeholder text from config or generic |
| `github-config.ts` | 39-40 | `'HansChucrte14'`, `'Hans-GSD-Raw-Calculator'` | Read from `getActiveProjectId()` → Project record |

> **P0 FIX**: layout.tsx entry changed — original blueprint said to use `useAuditConfig()` hook in layout.tsx, but layout.tsx is a **server component** that cannot use React hooks. This is now deferred to Step 25 which uses `generateMetadata()`.

---

## STEP 14: ADD PROJECT SECTION TO ADMIN TAB

**Target**: `/home/z/my-project/src/components/admin-tab.tsx` (1,511 lines)

Extract admin sections into separate components, then add `<ProjectSection />`:
- Create `src/components/admin/github-config-section.tsx` (extract from admin-tab.tsx L~200-400)
- Create `src/components/admin/ai-connector-section.tsx` (extract from admin-tab.tsx L~400-700)
- Create `src/components/admin/opencode-section.tsx` (extract from admin-tab.tsx L~700-1000)
- Create `src/components/admin/audit-config-section.tsx` (extract from admin-tab.tsx L~1000-1300)
- Create `src/components/admin/project-section.tsx` (NEW ~200 lines)

`ProjectSection` schema:

```typescript
interface ProjectSectionProps {
  // uses useProject() context internally
}

// UI:
// - List of projects (table/cards)
// - "Add Project" button → form modal
// - "Set Active" toggle per project
// - "Delete" button per project (with confirmation)
// - Form fields: name, repoOwner, repoName, description
```

`admin-tab.tsx` becomes: Simple tab navigator that renders extracted sections.

---

## STEP 15: REMOVE G3 BLOCKED HARDCODING FROM 3 LOCATIONS

| File | Lines | Action |
|------|-------|--------|
| `data.ts` | 132-151 | Delete `getG3Blocked()` function. Replace with DB read: `db.auditConfig.findFirst({ where: { key: 'g3_blocked', projectId } })` → JSON.parse value |
| `findings/modules/route.ts` | 31-48 | Delete inline `g3Blocked` array. Read from `getAuditConfigValue('g3_blocked', projectId)` |
| `audit-data.ts` | 1926-1946 | Keep for seed reference only, add `// SEED-ONLY` comment |

Add `g3_blocked` to DEFAULT_CONFIGS in `config/route.ts`:

```typescript
g3_blocked: [
  { task: '6', title: 'Absolute calcium and phosphorus ceilings', canShipNow: 'Mechanism: computed ceiling from DER envelope', needsReview: 'Values: Ca/P g/1000kcal ceilings need AAFCO + veterinary review' },
  { task: '7', title: 'Fix growth-energy model and scenario labels', canShipNow: 'Mechanism: age-banded schedule structure + label swap', needsReview: 'Values: k-multipliers per age band need NRC 2006 + veterinary review' },
],
```

---

## STEP 16: REPLACE `dashboard-constants.ts` HARDCODED CONFIG

**Target**: `/home/z/my-project/src/lib/dashboard-constants.ts` (89 lines)

Replace all hardcoded maps with config-driven values. Each export becomes a function that takes `AuditConfigData` as parameter:

```typescript
// BEFORE: export const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
// AFTER:  export function getSeverityOrder(config: AuditConfigData) {
//           return Object.fromEntries(
//             Object.entries(config.severity_levels)
//               .sort((a, b) => b[1].weight - a[1].weight)
//               .map(([k, v], i) => [k, i])
//           )
//         }

// BEFORE: export const severityColors = { critical: '#dc2626', ... }
// AFTER:  export function getSeverityColors(config: AuditConfigData) {
//           return Object.fromEntries(
//             Object.entries(config.severity_levels)
//               .map(([k, v]) => [k, v.color])
//           )
//         }
```

Same pattern for `tierOrder`, `tierColors`, `verificationColors`, `moduleColorMap`.

**Consumers**: All components that import from `dashboard-constants.ts` get config from `useAuditConfig()` and call these functions with the config data.

---

## STEP 17: FIX localStorage `gsd-` PREFIXES + ADD MIGRATION LOGIC

**Target files**:

| File | Line | Change |
|------|------|--------|
| `use-audit-progress.ts` | 6 | `'gsd-audit-statuses-v1'` → `'audit-statuses-v1-${activeProjectId}'` |
| `use-audit-progress.ts` | 7 | `'gsd-audit-notes-v1'` → `'audit-notes-v1-${activeProjectId}'` |
| `use-findings.ts` | 751 | `'gsd-activity-log'` → `'activity-log-${activeProjectId}'` |

**Dependency**: `useAuditProgress` and `useFindings` hooks need access to `activeProjectId`. Use `useProject()` context.

### ACTION 17.5: Add localStorage migration useEffect

> **EDGE FIX**: Original blueprint only renamed keys, but didn't handle migration of existing data. Users with `gsd-*` keys would lose all audit progress/notes on first load after migration.

**New code** (add to `ProjectProvider` or a dedicated `useLocalStorageMigration` hook):

```typescript
// In ProjectProvider or a separate migration hook, run on mount:
useEffect(() => {
  const MIGRATION_MAP: Record<string, string> = {
    'gsd-audit-statuses-v1': `audit-statuses-v1-default-project`,
    'gsd-audit-notes-v1': `audit-notes-v1-default-project`,
    'gsd-activity-log': `activity-log-default-project`,
  }
  
  for (const [oldKey, newKey] of Object.entries(MIGRATION_MAP)) {
    const oldValue = localStorage.getItem(oldKey)
    if (oldValue !== null) {
      // Only migrate if new key doesn't already exist (prevent overwrite)
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldValue)
      }
      // Remove old key after successful migration
      localStorage.removeItem(oldKey)
    }
  }
}, []) // Run once on mount

// When project switches, also check for project-specific keys:
// On setActiveProjectId(newId), no migration needed — 
// new project starts fresh or has its own existing keys.
```

---

## STEP 18: CONVERT READ HOOKS FROM `useMutation` TO `useQuery` (except `useGitHubPullSync`)

**Target**: `/home/z/my-project/src/lib/use-findings.ts`

| Hook | Current (L) | New |
|------|-------------|-----|
| `useGitHubIssues` | 284-299 | `useQuery({ queryKey: ['github-issues', projectId], queryFn: ... })` |
| `useGitHubTokenStatus` | 302-310 | `useQuery({ queryKey: ['github-token-status', projectId], ... })` |
| `useAIConnectorStatus` | 422-434 | `useQuery({ queryKey: ['ai-connectors', projectId], ... })` |
| `useOpencodeStatus` | 545-560 | `useQuery({ queryKey: ['opencode-status', projectId], ... })` |
| `useGitHubPullSync` | 650-665 | **KEEP as `useMutation`** — this triggers a sync action (POST), not a passive read |
| `useGitHubConfig` | 715-723 | `useQuery({ queryKey: ['github-config', projectId], ... })` |

> **EDGE FIX**: `useGitHubPullSync` must remain `useMutation` because it triggers an active sync operation (POST to `/api/github/sync`). Converting it to `useQuery` would cause automatic refetching that triggers unwanted syncs. The original blueprint incorrectly listed it for conversion to `useQuery`.

**Mutation hooks**: Keep `useMutation` for POST/PUT/DELETE. In `onSuccess`, use `invalidateQueries` instead of `router.refresh()`.

---

## STEP 19: REMOVE ZUSTAND FROM package.json

```bash
bun remove zustand
```

---

## STEP 20: REMOVE `User` AND `Post` MODELS

Done in Step 1.10 — lines 13-29 of `prisma/schema.prisma` deleted.

---

## STEP 21: UPDATE `prisma/seed.ts`

**Target**: `/home/z/my-project/prisma/seed.ts`

**Actions**:
1. Import from `audit-data.ts` (still seed-only file)
2. First: create default Project record
3. Then: create Findings with `projectId = 'default-project'`
4. Then: create AuditConfig entries with `projectId = 'default-project'` (including `active_project` key)
5. Then: create GitHubConfig entries with `projectId = 'default-project'`
6. Then: create BestProposalAnalysis entries using `findingId` (Finding.id cuid) instead of `task`
7. Then: create AuditNote entries using `findingId` (Finding.id cuid) instead of `task` domain FK

> **Fix**: Added step 7 for AuditNote seed — was missing in original blueprint.

---

## STEP 22: UPDATE `/api/config/route.ts` TO USE `projectId`

**Target**: `/home/z/my-project/src/app/api/config/route.ts` (188 lines)

**Changes**:
- GET: Accept `projectId` query param. Use `getActiveProjectId()` helper if not provided.
- PUT: Accept `projectId` in body. Validate templates.
- All `findUnique({ where: { key } })` → `findUnique({ where: { projectId_key: { projectId, key } } })`
- POST (reset): Scope to specific `projectId`

---

## STEP 23: ADD `projectId` QUERY PARAM TO ALL CLIENT API FETCHES

**Target**: `/home/z/my-project/src/lib/use-findings.ts` — all `fetch()` calls

**Pattern**: Every API fetch URL gets `?projectId=${activeProjectId}` appended.

```typescript
// BEFORE: fetch('/api/findings')
// AFTER:  fetch(`/api/findings?projectId=${activeProjectId}`)

// BEFORE: fetch(`/api/findings/${task}`, { method: 'PUT', ... })
// AFTER:  fetch(`/api/findings/${task}?projectId=${activeProjectId}`, { method: 'PUT', ... })
```

---

## STEP 24: ADD `getActiveProjectId` HELPER + `validateProjectId` TO API ROUTES

**New file**: `/home/z/my-project/src/lib/get-active-project.ts`

```typescript
import { db } from '@/lib/db'

export async function getActiveProjectId(request?: Request): Promise<string> {
  // 1. Check query param
  if (request) {
    const url = new URL(request.url)
    const param = url.searchParams.get('projectId')
    if (param) {
      // Validate that the projectId actually exists in the database
      const project = await db.project.findUnique({ where: { id: param } })
      if (project) return param
      // If invalid projectId, fall through to defaults rather than crash
    }
  }
  
  // 2. Check AuditConfig
  const config = await db.auditConfig.findFirst({
    where: { key: 'active_project' }
  })
  if (config) {
    try {
      const value = JSON.parse(config.value)
      if (value.projectId) return value.projectId
    } catch {
      // Malformed JSON — skip this fallback
      console.warn('Malformed active_project config, skipping AuditConfig fallback')
    }
  }
  
  // 3. Fallback: first active project
  const project = await db.project.findFirst({ where: { isActive: true } })
  return project?.id ?? 'default-project'
}

/**
 * Validate projectId exists in database. Throws if invalid.
 * Use in API routes that require a valid project context.
 */
export async function validateProjectId(projectId: string): Promise<void> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) {
    throw new Error(`Invalid projectId: ${projectId}. Project does not exist.`)
  }
}
```

> **P1 FIX**: Added `try/catch` around `JSON.parse(config.value)` — prevents SyntaxError crash when config JSON is malformed.

> **EDGE FIX**: Added `validateProjectId()` helper and validation in `getActiveProjectId` — if a `projectId` query param is provided but doesn't exist in the database, we fall through to defaults instead of returning a non-existent ID that would cause empty results or errors in downstream queries.

---

## STEP 25: FIX `layout.tsx` DYNAMIC TITLE (server component approach)

> **P0 FIX**: Original blueprint (Step 13) said to use `useAuditConfig()` hook in `layout.tsx`, but `layout.tsx` is a **server component** that cannot call React hooks. This new step provides the correct server-side approach.

**Target**: `/home/z/my-project/src/app/layout.tsx`

**Option A — `generateMetadata()` async function** (recommended):

```typescript
import { db } from '@/lib/db'
import { getActiveProjectId } from '@/lib/get-active-project'

export async function generateMetadata() {
  const projectId = await getActiveProjectId()
  const project = await db.project.findUnique({ where: { id: projectId } })
  const name = project?.name ?? 'Audit Dashboard'
  return {
    title: `${name} — Comprehensive Audit`,
    // ... other metadata
  }
}
```

**Option B — Client-side title override** (if generateMetadata is impractical):

Create a thin client component `<DynamicTitle />`:

```typescript
'use client'
import { useProject } from '@/lib/project-context'
import { useEffect } from 'react'

export function DynamicTitle() {
  const { activeProject } = useProject()
  useEffect(() => {
    document.title = `${activeProject?.name ?? 'Audit Dashboard'} — Comprehensive Audit`
  }, [activeProject?.name])
  return null  // renders nothing, just updates document.title
}
```

Then import and render `<DynamicTitle />` inside the client wrapper in `layout.tsx`.

**Recommendation**: Use Option A (`generateMetadata`) as primary approach. It's more correct for Next.js App Router and doesn't require an extra component. Option B is the fallback if `generateMetadata` conflicts with other metadata needs.

---

## EXECUTION ORDER (DETERMINISTIC)

| Step | Priority | Depends On | Estimated LOC Change |
|------|----------|------------|---------------------|
| 1 | P0 | — | Schema: +50 lines (added AuditNote, GitHubSyncLog, OpencodeAction changes), -17 lines (User/Post removal) |
| 2a | P0 | Step 1 | Temp nullable schema + db:push |
| 2b | P0 | Step 2a | Seed SQL: ~25 lines of actual SQL (not placeholder comments) |
| 2c | P0 | Step 2b | Final required schema + db:push |
| 3 | P0 | Step 2c | config/route.ts: +3 lines |
| 4 | P0 | Step 3 | New file: ~100 lines |
| 5 | P0 | Step 4 | New file: ~60 lines (added queryClient.clear note, provider nesting note) |
| 6 | P1 | Step 5 | dashboard-client.tsx: +30 lines |
| 7 | P0 | Step 4, 5 | 14 files, ~5 lines each (~70 lines total) |
| 8 | P1 | — | 3 new files (~140 lines), refactor 26 imports |
| 9 | P1 | Step 8 | New file: ~60 lines |
| 10 | P1 | Step 3 | config/route.ts: +25 lines |
| 11 | P1 | Step 10 | config/route.ts: +30 lines |
| 12 | P1 | Step 8.3 | audit-utils.ts: +12 lines (added null check) |
| 13 | P1 | Step 12 | 11 files, ~2 lines each (~22 lines) |
| 14 | P2 | Step 5 | 5 new component files, admin-tab refactor (~600 lines split) |
| 15 | P1 | Step 3 | 3 files, -30 lines, config/route.ts +5 lines |
| 16 | P1 | Step 9 | dashboard-constants.ts: ~89 → ~89 lines (different format) |
| 17 | P2 | Step 5 | 3 files, ~6 lines total |
| 17.5 | P2 | Step 17 | ProjectProvider: +20 lines (migration useEffect) |
| 18 | P2 | Step 7 | use-findings.ts: ~25 lines refactored (useGitHubPullSync stays useMutation) |
| 19 | P2 | — | 1 command |
| 20 | P0 | — | Done in Step 1.10 |
| 21 | P0 | Step 1 | seed.ts: ~25 lines modified (added AuditNote seed step) |
| 22 | P0 | Step 4, 7 | config/route.ts: ~10 lines |
| 23 | P1 | Step 5 | use-findings.ts: ~25 lines |
| 24 | P0 | Step 2c | New file: ~35 lines (added try/catch + validateProjectId) |
| 25 | P0 | Step 13 | layout.tsx: ~15 lines (generateMetadata or DynamicTitle) |

**Total estimated LOC**: +1,300 new, -300 removed, ~170 refactored

---

## RISK REGISTER & SAFEGUARDS

| Risk | Safeguard |
|------|-----------|
| `@@unique` migration breaks SQLite | **Two-step db:push**: nullable (2a) → seed (2b) → required (2c). Backup DB before Step 2a. |
| BestProposalAnalysis FK change loses data | Seed script migrates `task` → `findingId` by matching. **Actual UPDATE SQL provided** (not placeholder). Dry-run on copy first. |
| AuditNote FK change loses data | Same safeguard as BestProposalAnalysis — **UPDATE SQL provided** in Step 2b. Was completely missing in original blueprint. |
| Components flash when config loads from API vs. defaults | `placeholderData: DEFAULT_CONFIGS` — instant defaults, ~100ms overlay. Acceptable. |
| 26-file import refactor introduces type mismatches | TypeScript compiler catches all. Run `bun run lint` after Step 8. |
| Active project chicken-and-egg (no config → no project) | Fallback: first active project, or 'default-project'. `getActiveProjectId()` has 3-level fallback chain **with try/catch on JSON.parse**. |
| `findFirst` vs `findUnique` semantic difference | Use composite `findUnique({ where: { projectId_task: ... } })` — type-safe, no silent duplicates. |
| localStorage key change loses existing progress | **Migration useEffect** (Step 17.5): on mount, check old `gsd-*` keys, migrate to new `*-${projectId}` keys, delete old. |
| layout.tsx cannot use hooks (server component) | **Step 25**: Use `generateMetadata()` async function (server-side) or `<DynamicTitle />` client component. Original blueprint incorrectly suggested `useAuditConfig()` hook. |
| Project switch shows stale data from previous project | **queryClient.clear()** on switch (Step 5) — flushes entire cache before refetch, prevents brief display of wrong-project data. |
| Malformed config JSON crashes API routes | **try/catch** around `JSON.parse(config.value)` in `getActiveProjectId()` (Step 24). Logs warning, falls through to next fallback level. |
| `renderTemplate` renders `null` as literal "null" string | **Null check** before `typeof === 'object'` check (Step 12). `null` → empty string, not `"null"`. |
| Invalid projectId query param causes empty/broken results | **validateProjectId** helper + validation in `getActiveProjectId` (Step 24). Falls through to defaults if projectId doesn't exist. |
| `onDelete: Cascade` missing on FK relations | **All relations now have `onDelete: Cascade`** (Step 1.2-1.9). Deleting a project cleanly cascades to all related data. |
| `useGitHubPullSync` wrongly converted to `useQuery` | **Keep as `useMutation`** (Step 18). It triggers a POST sync action; auto-refetching would cause unwanted syncs. |

---

## POST-IMPLEMENTATION VERIFICATION

1. `bun run db:push` (Step 2a) — nullable schema applied without errors
2. Seed SQL executed (Step 2b) — all rows have valid `projectId`, all FK migrations complete
3. `bun run db:push` (Step 2c) — required schema applied without errors
4. `bun run lint` — zero new errors
5. Open `/` route in browser → dashboard loads
6. Page title shows project name (from `generateMetadata`) — not hardcoded
7. Project selector in header → shows "Hans-GSD-Raw-Calculator" (default)
8. "Add Project" in admin → creates new project, appears in dropdown
9. Switch project → **no stale data flash** (queryClient.clear()), all findings/config/GitHub data refreshes
10. Export → uses template from config (not hardcoded strings)
11. AI analysis → prompt prefix from template (not hardcoded project name)
12. GitHub issue → title/body from template (not hardcoded strings)
13. Config editor → narrative/export templates editable, validated on save
14. Delete project → all related data cascade-deleted cleanly
15. localStorage migration → old `gsd-*` keys migrated on first load, old keys removed

---

## APPENDIX A: DESIGN DECISIONS (EXPLICIT)

These are deliberate architectural choices that may appear as "issues" but are intentional:

| Decision | Rationale |
|----------|-----------|
| **AIConnector is global, not scoped by `projectId`** | AI connectors (API keys, model configs) are shared infrastructure. A single OpenAI key or Claude endpoint serves all projects. Scoping per-project would require duplicating API keys across projects, which is wasteful and confusing. If per-project AI connectors are needed in the future, add `projectId` to AIConnector model at that time. |
| **`Project.isActive` dual semantics** | `isActive` currently serves two purposes: (1) "this project exists and is not archived" and (2) "this is the project the user is currently working on". In the current implementation, only one project can be "active" at a time, and the active project is tracked via the `active_project` AuditConfig key. The `isActive` boolean on the Project model means "not archived/deleted". **Future improvement**: Consider renaming to `isArchived` (inverse) or adding a separate `isDefault` field to decouple the semantics. For now, the dual meaning is manageable because `getActiveProjectId()` uses the AuditConfig key as the authoritative source, not `Project.isActive`. |
| **`useGitHubPullSync` remains `useMutation`** | This hook triggers a POST request that initiates a GitHub sync operation. It is NOT a passive read — it causes side effects (creating GitHub issues, updating sync logs). Converting it to `useQuery` would cause TanStack Query to auto-refetch it, triggering unwanted sync operations. `useMutation` is the correct pattern. |
