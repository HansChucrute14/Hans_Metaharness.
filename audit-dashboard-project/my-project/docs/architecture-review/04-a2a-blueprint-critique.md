# DOCUMENT 4: A2A BLUEPRINT CRITIQUE — Consistency, Flaws, Edge Cases & Future-Proofness

## EXECUTIVE SUMMARY

Document 3 ("A2A Implementation Blueprint") is **substantially faithful** to the conclusions reached in Documents 1 and 2. The Union proposals from the adversarial dialectic are correctly translated into deterministic step-by-step actions. However, the analysis reveals **7 critical flaws**, **9 significant edge cases not addressed**, and **5 future-proofness weaknesses** that must be resolved before implementation begins.

> **STATUS UPDATE**: All P0, P1, and P2 fixes identified in this critique have been applied to Document 3 (as of the latest revision). See the corrected blueprint for the fixed versions. Each fix is annotated with its priority level (CRITICAL FIX, P0 FIX, P1 FIX, EDGE FIX).

---

## PART A: CONSISTENCY WITH DOCUMENTS 1 & 2

### ✅ Correctly Carried Forward

| Doc 1/2 Decision | Doc 3 Implementation | Status |
|---|---|---|
| **P1 Union**: Lean Project model (`id, name, description, repoOwner, repoName, isActive`) | Step 1.1 — identical schema | ✅ Exact match |
| **P2 Union**: `useAuditConfig()` hook with `placeholderData: DEFAULT_CONFIGS`, flattened API response | Step 9 — same approach, flattening logic included | ✅ Exact match |
| **P3 Union**: Templates for export/AI/GitHub only, NOT for UI rendering | Step 10-12, Step 13 scope — export, AI prompts, GitHub issues | ✅ Exact match |
| **P4 Union**: AuditConfig key `export_templates`, no new model | Step 10 — `export_templates` in DEFAULT_CONFIGS | ✅ Exact match |
| **Topic 1 Union**: Composite `findUnique` queries (`projectId_task`, `projectId_key`) instead of `findFirst` | Step 7 — `findUnique({ where: { projectId_task: { projectId, task } } })` | ✅ Exact match |
| **Topic 2 Union**: Flattened API response in `queryFn` to match `placeholderData` format | Step 9 — flatten logic in queryFn | ✅ Exact match |
| **Topic 3 Union**: Simple `{field}` substitution, Phase 4 for nesting | Step 12 — `renderTemplate` with `/\{(\w+)\}/g` regex | ✅ Exact match |
| **Topic 4 Union**: `ProjectContext` React Context, not Zustand | Step 5 — `ProjectContext` provider | ✅ Exact match |
| **Topic 5 Union**: Two-step `db:push`, `findingId` FK for BestProposalAnalysis | Step 1.6, Step 2 | ⚠️ Partial — see Flaw #1 |
| **Topic 6 Union**: G3 blocked → AuditConfig key, keep current field names | Step 15 — `g3_blocked` in AuditConfig | ✅ Exact match |
| **R5**: Convert 6 read hooks from `useMutation` to `useQuery` | Step 18 — explicit list of 6 hooks | ✅ Exact match |
| **R6**: Remove User/Post models and zustand | Steps 1.7, 19 | ✅ Exact match |

### ⚠️ Partially Carried Forward

| Decision | What's Missing |
|---|---|
| **Topic 5**: Two-step migration (nullable → required) | Step 2 only says "run `db:push`" — doesn't specify the two-step process that Doc 2 explicitly recommended for SQLite safety |
| **R4**: localStorage → DB sync (single source of truth) | Step 17 only changes the key prefix. localStorage is still NOT synced to DB. The dual-tracking risk remains unresolved |

### ❌ Not Carried Forward

| Decision | Gap |
|---|---|
| **R4 full resolution**: DB as single source of truth, localStorage as offline cache | Step 17 only renames keys — doesn't implement sync. The `useAuditProgress` hook still writes to localStorage only, never to `/api/findings/notes/[task]` |

---

## PART B: CRITICAL FLAWS (Must Fix Before Implementation)

### 🔴 FLAW 1: `AuditNote` Model Has the Same Broken FK as `BestProposalAnalysis`

**Severity**: CRITICAL  
**Evidence**: `prisma/schema.prisma` L112-121:

```prisma
model AuditNote {
  task      String  // Finding.task value (FK)
  finding   Finding @relation(fields: [task], references: [task], onDelete: Cascade)
}
```

This is the **exact same pattern** that Doc 2 identified as breaking for `BestProposalAnalysis`. After `Finding.task` becomes non-unique (because of `@@unique([projectId, task])`), `AuditNote.task` FK references a field that is no longer uniquely identifiable. **Prisma will reject this relation.**

Doc 3 Step 1.6 correctly fixes `BestProposalAnalysis` by changing to `findingId` FK, but **AuditNote is completely overlooked**. This means Step 1's schema changes will fail at `db:push` because Prisma validates all relations before applying the schema.

**Required Fix**: Add to Step 1:

```prisma
model AuditNote {
  id        String  @id @default(cuid())
  findingId String  // FK to Finding.id (cuid) instead of task
  note      String
  status    String  @default("not-started")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  finding   Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
}
```

This also requires updating the seed migration SQL and all API routes that create/query AuditNotes (currently: `/api/findings/notes/[task]/route.ts` which uses `where: { task }` for lookups).

### 🔴 FLAW 2: Two-Step Migration Strategy Not Explicitly Implemented

**Severity**: HIGH  
**Evidence**: Doc 2's Topic 5 explicitly recommended a **two-step `db:push`** approach:

> Step 1: Add `projectId` nullable, seed default, add composite unique  
> Step 2: Make required + composite unique

But Doc 3 Step 2 says:

> ```bash
> bun run db:push
> ```

A single `db:push` that simultaneously: (a) removes `@unique` from `Finding.task`, (b) adds `projectId` column, and (c) adds `@@unique([projectId, task])` — will likely **fail on SQLite** because SQLite's `ALTER TABLE` cannot drop/recreate unique indexes in-place. The table must be recreated (copy data → drop old → rename new), and `db:push` may not handle this correctly.

**Required Fix**: Make Step 2 explicit:

1. **Step 2a**: First `db:push` — Add `Project` model, add `projectId` as **nullable** to all models, remove dead User/Post. DON'T remove `@unique` constraints yet. DON'T add `@@unique` composites yet.
2. **Step 2b**: Seed SQL — INSERT default project, UPDATE all rows with `projectId = 'default-project'`
3. **Step 2c**: Second `db:push` — Remove `@unique` from `Finding.task`, `AuditConfig.key`, `GitHubConfig.key`. Add `@@unique([projectId, task])`, `@@unique([projectId, key])`. Make `projectId` **required** (non-nullable). This forces Prisma to recreate tables (safe because all rows already have projectId).

### 🔴 FLAW 3: Missing Seed SQL for BestProposalAnalysis & AuditNote Migration

**Severity**: HIGH  
**Evidence**: Step 2's seed SQL block ends with a comment:

```
-- Migrate BestProposalAnalysis from task FK to findingId FK
-- Requires matching each analysis.task to Finding.id where Finding.task = that value
-- Then setting analysis.findingId = Finding.id
```

This is a **placeholder, not actual SQL**. The migration from `task` FK to `findingId` FK requires actual executable SQL. Without it, the seed step will leave `BestProposalAnalysis` and `AuditNote` with broken FK references.

**Required Fix**: Add actual SQL:

```sql
-- Migrate BestProposalAnalysis: task → findingId
UPDATE BestProposalAnalysis
SET findingId = (
  SELECT Finding.id FROM Finding
  WHERE Finding.task = BestProposalAnalysis.task
  AND Finding.projectId = 'default-project'
);

-- Migrate AuditNote: task → findingId
UPDATE AuditNote
SET findingId = (
  SELECT Finding.id FROM Finding
  WHERE Finding.task = AuditNote.task
  AND Finding.projectId = 'default-project'
);
```

Note: This SQL must run BEFORE the `task` column is removed from these models (i.e., between Step 2a and Step 2c).

### 🔴 FLAW 4: `layout.tsx` Title Cannot Use React Hooks

**Severity**: HIGH  
**Evidence**: Step 13 says to replace `layout.tsx` L19, 27:

> `"Hans-GSD-Raw-Calculator — Comprehensive Audit"` → `config.repo_info.name + " — Comprehensive Audit"` (dynamic from `useAuditConfig`)

But `layout.tsx` is a **server component** that defines the `metadata` export. React hooks (`useAuditConfig`) **cannot be used in server components**. The `metadata` export must be a static object or use `generateMetadata()` (async function).

**Required Fix**: Two options:

**Option A** (simpler): Keep the title static in `metadata` but add a `<title>` override in a client component that reads from `useAuditConfig()`. The browser title updates dynamically.

**Option B** (more correct): Use `generateMetadata()` to fetch config from DB server-side:

```typescript
export async function generateMetadata() {
  const config = await getActiveProjectConfig()
  return {
    title: `${config.repo_info.name} — Comprehensive Audit`,
  }
}
```

This adds ~50ms latency to SSR but gives correct metadata for SEO/social sharing.

### 🔴 FLAW 5: `onDelete: Cascade` Missing for `AuditConfig`, `GitHubConfig`, `OpencodeSetting` Relations

**Severity**: HIGH  
**Evidence**: Step 1 adds `projectId` FK to these models, but the schema code doesn't specify `onDelete: Cascade`:

```prisma
projectId String
project   Project @relation(fields: [projectId], references: [id])
```

Step 4's DELETE operation says "cascading deletes for all related data." But **Prisma requires explicit `onDelete: Cascade`** on the relation. Without it, SQLite's foreign key enforcement will **prevent deleting a Project** that has associated AuditConfig/GitHubConfig/OpencodeSetting rows.

**Required Fix**: Add `onDelete: Cascade` to all Project FK relations:

```prisma
model AuditConfig {
  // ...
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model GitHubConfig {
  // ...
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model OpencodeSetting {
  // ...
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}
```

Also: `OpencodeAction` has `settingsId` FK to `OpencodeSetting`. If `OpencodeSetting` is cascade-deleted, `OpencodeAction` must also be cascade-deleted. This chain works if `OpencodeSetting → Project` has cascade, and `OpencodeAction → OpencodeSetting` already has cascade.

### 🔴 FLAW 6: `renderTemplate` Handles `null` Incorrectly

**Severity**: MEDIUM  
**Evidence**: Step 12's `renderTemplate` function:

```typescript
if (val === undefined) return `{${key}}`  // Keep original placeholder if missing
if (Array.isArray(val)) return val.join(', ')
if (typeof val === 'object') return JSON.stringify(val)
return String(val)
```

**Problem**: In JavaScript, `typeof null === 'object'`. So `null` values (like `finding.verificationNote` or `analysis.hybridNote`) will produce `"null"` as text in templates — literally the string "null" appearing in exported markdown, AI prompts, and GitHub issue bodies.

**Required Fix**: Add null check before object check:

```typescript
export function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key]
    if (val === undefined || val === null) return ''  // Empty string, not "null"
    if (Array.isArray(val)) return val.join(', ')
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  })
}
```

### 🔴 FLAW 7: `getActiveProjectId()` Has No Error Handling for `JSON.parse`

**Severity**: MEDIUM  
**Evidence**: Step 24's helper function:

```typescript
const config = await db.auditConfig.findFirst({
  where: { key: 'active_project' }
})
if (config) {
  const value = JSON.parse(config.value)  // NO try/catch!
  if (value.projectId) return value.projectId
}
```

If `active_project` config value is malformed JSON (user edited it incorrectly, or a bug wrote corrupt data), `JSON.parse` will throw and **crash the entire API request chain**. Every API route that calls `getActiveProjectId()` will fail with an unhandled exception.

**Required Fix**:

```typescript
try {
  const value = JSON.parse(config.value)
  if (value?.projectId) return value.projectId
} catch {
  // Malformed config — fall through to next fallback
}
```

---

## PART C: SIGNIFICANT EDGE CASES NOT ADDRESSED

### ⚠️ EDGE CASE 1: `GitHubSyncLog.task` Is Ambiguous After Multi-Project

`GitHubSyncLog` (schema L196-205) has `task: String?` — a plain string reference to `Finding.task`. After multi-project support, `task = '6'` is ambiguous: which project's task 6? Without `projectId` on `GitHubSyncLog`, sync history queries can't be scoped per-project.

**Impact**: The sync log in admin-tab shows sync events from ALL projects mixed together.

**Recommended Fix**: Add `projectId` to `GitHubSyncLog`:

```prisma
model GitHubSyncLog {
  // existing fields...
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id])
}
```

Nullable because some sync events (like initial repo setup) might not be task-specific.

### ⚠️ EDGE CASE 2: `OpencodeAction.task` Is Ambiguous After Multi-Project

`OpencodeAction` (schema L154-168) has `task: String?`. Same ambiguity as GitHubSyncLog.

**Recommended Fix**: Add `projectId` to `OpencodeAction`, or change `task` to `findingId` FK for disambiguation.

### ⚠️ EDGE CASE 3: `AIConnector` Is Global — Not Scoped by Project

`AIConnector` (schema L123-136) has no `projectId`. All projects share the same AI connector configs. This means:

- Switching projects doesn't switch AI providers
- Different projects can't use different models/endpoints
- Deleting a project doesn't cascade-delete AI connector records (they're not FK-linked)

**Assessment**: This may be intentional (one AI provider for all projects). If so, **document it as a design decision**. If not, add `projectId` to `AIConnector`.

### ⚠️ EDGE CASE 4: `UnifiedExecutionModule` Is Global — Implicitly Scoped via Findings

`UnifiedExecutionModule` (schema L97-110) has no `projectId`. Step 7's query uses:

```typescript
db.unifiedExecutionModule.findMany({
  where: { findings: { every: { projectId: activeId } } }
})
```

This works but means:
- A module with NO findings assigned won't appear in any project
- Creating a new project requires re-creating modules for it
- Modules can't be shared across projects without sharing findings

**Assessment**: Acceptable for current scope, but should be **documented as a limitation**.

### ⚠️ EDGE CASE 5: localStorage Key Migration Strategy Not Implemented

The Risk Register (Doc 3 L754) mentions:

> "Migration: on mount, check old `gsd-*` keys, migrate to new `*-${projectId}` keys, delete old."

But **no step actually implements this migration logic**. Without it, users upgrading to the new version will **lose all existing progress data** stored in localStorage.

**Required Fix**: Add Step 17.5 — implement localStorage migration in `useAuditProgress`:

```typescript
useEffect(() => {
  // Migration: old keys → new keys
  const oldStatuses = localStorage.getItem('gsd-audit-statuses-v1')
  const oldNotes = localStorage.getItem('gsd-audit-notes-v1')
  if (oldStatuses && activeProjectId) {
    localStorage.setItem(`audit-statuses-v1-${activeProjectId}`, oldStatuses)
    localStorage.removeItem('gsd-audit-statuses-v1')
  }
  if (oldNotes && activeProjectId) {
    localStorage.setItem(`audit-notes-v1-${activeProjectId}`, oldNotes)
    localStorage.removeItem('gsd-audit-notes-v1')
  }
}, [activeProjectId])
```

### ⚠️ EDGE CASE 6: `Project.id` Hardcoded as `'default-project'` Bypasses Prisma ID Generation

Step 2's seed SQL uses `id: 'default-project'` as a fixed string, but the Prisma model uses `@id @default(cuid())` which generates random CUIDs. Issues:

- Re-running the seed will fail (duplicate key `default-project`)
- `getActiveProjectId()` fallback returns the hardcoded `'default-project'` string, but new projects get CUID IDs — this creates an inconsistency in ID format
- If the default project is deleted, `'default-project'` doesn't exist in the DB, but `getActiveProjectId()` still returns it

**Recommended Fix**: Use `@default(cuid())` for the seed too (let Prisma generate the ID), and store the actual default project ID in a different mechanism (like a `Project.isDefault` boolean flag, or always use the "first active project" fallback without a hardcoded string).

### ⚠️ EDGE CASE 7: `Project.isActive` Has Dual Semantic Ambiguity

`isActive` is used for two different concepts:
1. "This project is available/not archived" (availability flag)
2. Implicitly, "this project might be the one the user is viewing" (via `getActiveProjectId()` fallback)

If ALL projects have `isActive = false` (e.g., user archives everything), `getActiveProjectId()` has no active project to return, and falls back to `'default-project'` which doesn't exist.

**Recommended Fix**: Consider renaming to `isArchived` (inverted semantics) or adding a separate `isDefault` boolean that ensures one project is always the fallback.

### ⚠️ EDGE CASE 8: No Validation That `projectId` Parameter Matches an Existing Project

Step 7 adds `projectId` to all DB queries, but API routes don't validate that the `projectId` corresponds to an actual `Project` record. A client could send any string, and queries would silently return empty results — no error, no warning.

**Security Implication**: While not a major security risk (no data exposure from wrong projectId — just empty data), it makes debugging difficult and could mask bugs.

**Recommended Fix**: Add a middleware or helper that validates `projectId` exists before proceeding:

```typescript
async function validateProjectId(projectId: string): Promise<boolean> {
  return db.project.findUnique({ where: { id: projectId } }) !== null
}
```

### ⚠️ EDGE CASE 9: Project Selector Dropdown Race Condition

When a user switches projects via the header dropdown, `setActiveProjectId()` triggers query invalidation. But TanStack Query invalidation is asynchronous — there could be a brief period where some components show data from the old project while others show data from the new project.

**Recommended Fix**: Use `queryClient.clear()` on project switch (not just `invalidateQueries`), or ensure all queries include `activeProjectId` in their `queryKey` so invalidation is complete.

---

## PART D: ADDITIONAL ISSUES FROM CODEBASE VERIFICATION

### 🟡 ISSUE 1: Inconsistent GitHub Username Spelling in Codebase

**Evidence**: The actual codebase contains TWO different spellings of the GitHub owner name:
- `config/route.ts` L60: `'HansChucrute14'` (with 'u' → Chucr**u**te14)
- `overview-tab-content.tsx` L453: `HansChucrte14` (without 'u' → Chucr**t**e14)

This is an existing bug that the documents don't flag. Doc 1 H8 references `'HansChucrte14'` for `github-config.ts`, but the actual code at that line may use a different spelling. Step 13's hardcoded string replacement won't catch this inconsistency.

**Impact**: One of these URLs works on GitHub, the other doesn't. After Step 13 replaces hardcoded strings with config-driven values, the config system needs to store the CORRECT username consistently.

### 🟡 ISSUE 2: `OpencodeSetting` Has No Uniqueness Constraint After Adding `projectId`

`OpencodeSetting` currently has no `@unique` fields. After adding `projectId`, there's no constraint preventing two `OpencodeSetting` records for the same project. This should have `@@unique([projectId])` to ensure one settings record per project.

### 🟡 ISSUE 3: `useGitHubPullSync` May Not Be a Pure Read Operation

Step 18 converts `useGitHubPullSync` (L650) from `useMutation` to `useQuery`. But "pull sync" arguably triggers a sync operation (pulling data FROM GitHub → app), which is a mutation (it changes local data). Converting to `useQuery` would trigger a sync on every mount/refetch, which may not be desired.

**Recommended Fix**: Keep `useGitHubPullSync` as `useMutation`. Only convert hooks that are pure GET operations (no side effects).

### 🟡 ISSUE 4: `ProjectProvider` Ordering with `QueryProvider` and `ssr: false`

The dashboard uses `dynamic({ ssr: false })` in `client-only-dashboard.tsx`. Step 5 says to wrap `<DashboardClient>` in `<ProjectProvider>`. But `ProjectProvider` uses `useQuery`, which requires `QueryProvider` to be ABOVE it in the component tree. The current `QueryProvider` wrapping must be verified to include `ProjectProvider`.

**Recommended Fix**: Nesting order must be:
```
<QueryProvider>
  <ProjectProvider>
    <DashboardClient />
  </ProjectProvider>
</QueryProvider>
```

---

## PART E: FUTURE-PROOFNESS ASSESSMENT

### ✅ Strengths (Future-Proof Design Choices)

1. **Lean Project model is extensible**: The minimal `id, name, description, repoOwner, repoName, isActive` schema can be extended with additional fields (like `defaultBranch`, `labels`, `settings`) without breaking existing data. No premature over-engineering.

2. **Composite unique constraints allow cross-project task IDs**: `@@unique([projectId, task])` means task "6" can exist in multiple projects — this is correct for multi-project support and doesn't require global task ID coordination.

3. **`findingId` FK (cuid-based) is more robust than `task` FK**: Domain keys (like `task`) are fragile FK targets because their uniqueness depends on scope. CUID-based FKs (`Finding.id`) are always unique regardless of scope changes. This is a future-proof structural improvement.

4. **`placeholderData` pattern handles loading gracefully**: Modern TanStack Query v5 approach. No loading flash, no SSR overhead. This pattern scales well as more config keys are added.

5. **AuditConfig-based templates avoid schema changes**: Using existing infrastructure for template storage means adding new template types doesn't require Prisma schema migrations. Templates can evolve independently of the DB schema.

### ❌ Weaknesses (Future-Proofness Risks)

1. **`active_project` in AuditConfig is a design smell**: Storing the active project selection inside the configuration system couples two unrelated concerns. If the config system is refactored (e.g., moved to a different storage mechanism), project switching breaks. A more future-proof approach: use a `Project.isDefault` boolean or a `Project.lastAccessedAt` timestamp to determine the default project, keeping project logic in the Project model itself.

2. **No RBAC or permissions foundation**: If the app ever needs multi-user support (different users accessing different projects), there's no foundation to build on. No `User` model (it was deleted in Step 1.7!), no `ProjectMember` model, no role concept. This isn't needed for solo dev, but it means multi-user would require a significant schema overhaul.

3. **Hard delete with cascade loses data permanently**: Project deletion cascades to all findings, configs, notes. There's no soft-delete (`deletedAt` field), no undo mechanism, no "archive" option. For a production system, accidental project deletion would be catastrophic.

4. **Template system has no clear extension path**: `{field}` substitution is Phase 3, with "Phase 4 for nesting" documented. But the `renderTemplate` function doesn't have a plugin architecture or clear extension API. Moving to conditional sections `{?hasModule}...{/hasModule}` or nested access `{module.title}` requires rewriting the entire function, not extending it. Consider building on a lightweight template library (like Mustache) for Phase 4 instead of reinventing.

5. **localStorage progress tracking is still disconnected from DB**: Risk R4 from Document 1 identified the dual-tracking problem. The blueprint only renames localStorage keys (Step 17) — it doesn't implement DB sync. This means:
   - Switching browsers loses all progress
   - Clearing browser data loses all progress
   - Progress doesn't follow the user across devices
   
   For multi-project support, this is even worse: progress per-project is stored only in localStorage, not in the DB where it belongs.

6. **`AIConnector` and `UnifiedExecutionModule` remain global**: Not scoped by `projectId`. This limits per-project customization of AI providers and module definitions. A future where different projects use different AI models or different module breakdowns would require schema changes.

7. **No audit trail for project operations**: Creating, switching, or deleting projects has no log. `GitHubSyncLog` tracks GitHub operations, but there's no equivalent for project management operations. If something goes wrong (accidental deletion, wrong project switch), there's no trail to debug.

### 🟡 Moderately Future-Proof

1. **React Context for project state**: `ProjectContext` is a lightweight approach that works for current scope. It's not over-engineered (no Zustand). However, React Context re-renders all consumers on every state change. If the project list grows large or switches are frequent, this could cause performance issues. A Zustand store (ironically, the package being removed in Step 19) would be more performant for this specific use case.

2. **`getActiveProjectId()` 3-level fallback**: The fallback chain (query param → AuditConfig → first active project → hardcoded) is robust for the current state. But it makes a DB query on every API request (2 queries: AuditConfig + potentially Project). With 14 API routes, that's ~28 extra DB queries per page load. This needs caching (similar to `github-config.ts`'s 60-second memory cache).

---

## PART F: RECOMMENDED ADDITIONS TO THE BLUEPRINT

### New Steps Required

| Step | Description | Priority |
|---|---|---|
| **1.8** | Fix `AuditNote` model — change `task` FK to `findingId` FK (same as BestProposalAnalysis) | P0 |
| **1.9** | Add `onDelete: Cascade` to all Project FK relations (AuditConfig, GitHubConfig, OpencodeSetting) | P0 |
| **1.10** | Add `@@unique([projectId])` to `OpencodeSetting` model | P1 |
| **2.5** | Add actual seed SQL for BestProposalAnalysis and AuditNote `task → findingId` migration | P0 |
| **2-split** | Split Step 2 into Steps 2a (nullable projectId) → 2b (seed) → 2c (required + composite unique) | P0 |
| **12.5** | Fix `renderTemplate` to handle `null` values correctly | P1 |
| **13.5** | Fix `layout.tsx` title to use `generateMetadata()` or client-side title override | P1 |
| **17.5** | Implement localStorage key migration logic (old `gsd-*` → new `*-${projectId}`) | P2 |
| **24.5** | Add `try/catch` around `JSON.parse` in `getActiveProjectId()` | P1 |
| **24.6** | Add in-memory cache for `getActiveProjectId()` (60-second TTL, similar to github-config.ts) | P2 |
| **25** | Add `projectId` to `GitHubSyncLog` and `OpencodeAction` models | P2 |
| **26** | Add `projectId` existence validation helper for API routes | P2 |
| **27** | Document design decisions: AIConnector global scope, UnifiedExecutionModule implicit scoping, template Phase 4 extension path | P2 |

---

## PART G: VERIFIED LINE NUMBER ACCURACY

Cross-referencing Doc 1/2/3 line numbers against the actual codebase:

| Reference | Doc Says | Actual | Match? |
|---|---|---|---|
| `Finding.task @unique` | schema L35 | schema L35 (`task String @unique`) | ✅ |
| `AuditConfig.key @unique` | schema L176 | schema L176 (`key String @unique`) | ✅ |
| `GitHubConfig.key @unique` | schema L188 | schema L188 (`key String @unique`) | ✅ |
| `BestProposalAnalysis.task @unique` | schema L88 | schema L88 (`task String @unique`) | ✅ |
| `User/Post models` | schema L13-29 | schema L13-29 | ✅ |
| `DEFAULT_CONFIGS in config/route.ts` | L10-65 | L10-65 | ✅ |
| `repo_info.owner` | `'HansChucrte14'` (Doc 1 H7/H8) | `'HansChucrute14'` (actual code L60) | ❌ **Spelling mismatch** |
| `getG3Blocked()` in data.ts | L132-151 | L132-151 | ✅ |
| `g3Blocked in modules/route.ts` | L31-48 | L31-48 | ✅ |
| `gsd-audit-statuses-v1` | use-audit-progress.ts L6 | L6 | ✅ |
| `gsd-audit-notes-v1` | use-audit-progress.ts L7 | L7 | ✅ |
| `gsd-activity-log` | use-findings.ts L751 | L751 (`const ACTIVITY_LOG_KEY = 'gsd-activity-log'`) | ✅ |
| `layout.tsx title` | L19, 27 | L19, 27 | ✅ |
| `dashboard-client.tsx` hardcoded project name | L754, 934 | L754, 934 | ✅ |

**Note**: The `HansChucrte14` vs `HansChucrute14` spelling discrepancy in Doc 1 vs actual code at `config/route.ts:60` should be investigated. The real GitHub username needs to be determined and used consistently across ALL files (currently overview-tab-content.tsx uses one spelling and config/route.ts uses another).

---

## CONCLUSION

Document 3 is a **strong implementation blueprint** that faithfully translates the Union proposals from Documents 1 and 2 into actionable steps. However, it has **7 critical flaws** that will cause implementation failures if not addressed:

1. **AuditNote broken FK** (same as BestProposalAnalysis — completely missed)
2. **Missing two-step migration strategy** (SQLite ALTER TABLE limitations)
3. **Missing actual seed SQL** for FK migration (placeholder only)
4. **layout.tsx can't use hooks** (server component constraint)
5. **Missing `onDelete: Cascade`** on Project FK relations
6. **renderTemplate null handling** (produces "null" text)
7. **JSON.parse without error handling** (crashes on malformed config)

The blueprint also misses **9 edge cases** that will cause problems in multi-project usage, and has **5 future-proofness weaknesses** that limit scalability.

**Recommendation**: Fix all P0 flaws before beginning implementation. Add P1 fixes during implementation. P2 items can be deferred to a follow-up phase, but should be documented as known limitations.
