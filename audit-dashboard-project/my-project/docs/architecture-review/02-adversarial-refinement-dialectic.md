# DOCUMENT 2: DUAL-PERSONA ADVERSARIAL DIALECTIC

## DIALOGUE RULES
- Every argument grounded in REAL repository files with exact line numbers
- For each major decision, 3 options evaluated: X (Persona A), Y (Persona B), Union (synthesis)

---

### TOPIC 1: Project Model — Composite Unique vs. Soft Scope

**PERSONA A (Ponytail Engineer)**:

The Union proposal from Document 1 is correct. Add `Project` model with `id, name, description, repoOwner, repoName, isActive`. Add `projectId` FK to `Finding`, `AuditConfig`, `GitHubConfig`, `OpencodeSetting`. Use `@@unique([projectId, task])` on `Finding` so task IDs can exist across projects.

Migration path: Seed a default project (`id: "default-project"`, name: "Hans-GSD-Raw-Calculator") so existing data doesn't break. Every existing Finding gets `projectId = "default-project"` in the migration SQL.

Mock code for the Prisma schema change:

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
  
  findings        Finding[]
  auditConfigs    AuditConfig[]
  githubConfigs   GitHubConfig[]
  opencodeSettings OpencodeSetting[]
}

// Finding: change @unique(task) to @@unique([projectId, task])
model Finding {
  // ...existing fields...
  projectId String
  project   Project @relation(fields: [projectId], references: [id])
  
  @@unique([projectId, task])
}
```

**PERSONA B (Adversarial Architect)**:

Three problems with this:

**Problem 1**: `@@unique([projectId, task])` breaks the existing `@unique` on `Finding.task` (schema.prisma L35). Prisma doesn't support migrating from `@unique` to `@@unique` cleanly — you need a custom migration SQL that drops the old unique index and creates the new composite one. If the migration fails midway, all Finding queries that rely on `task` uniqueness (like `/api/findings/[task]/route.ts` L1 which uses `findUnique({ where: { task } })`) will break because `task` is no longer a unique field.

**Evidence**: `/api/findings/[task]/route.ts` L1-55 uses `where: { task }` for `findUnique`. After `@@unique([projectId, task])`, this query will FAIL because `task` alone is not unique anymore. It needs `where: { projectId_task: { projectId, task } }` or `findFirst({ where: { task, projectId } })`.

**Problem 2**: `AuditConfig.key` is currently `@unique` (schema.prisma L176). Adding `projectId` means `key` alone isn't unique anymore — different projects can have the same config key with different values. So `AuditConfig` also needs `@@unique([projectId, key])`. Same breaking change for all `findUnique({ where: { key } })` calls in `config/route.ts` L74, L122.

**Problem 3**: The `GitHubConfig.key` is `@unique` (schema.prisma L188). Same issue — needs `@@unique([projectId, key])`. The `getGitHubConfig()` function in `github-config.ts` L28-45 does `db.gitHubConfig.findMany()` without any project filter. After adding `projectId`, this query returns configs from ALL projects, not just the active one. It needs `where: { projectId: activeProjectId }`.

Mock code for the breaking queries:

```typescript
// BEFORE (works with @unique on task):
const finding = await db.finding.findUnique({ where: { task } })

// AFTER (task alone is NOT unique — must use composite):
const finding = await db.finding.findFirst({ 
  where: { task, projectId: activeProjectId } 
})

// BEFORE (AuditConfig findUnique by key):
const dbConfig = await db.auditConfig.findUnique({ where: { key } })

// AFTER (composite unique):
const dbConfig = await db.auditConfig.findFirst({ 
  where: { key, projectId: activeProjectId } 
})
```

**PERSONA A rebuttal**:

Good catches. But they're all fixable in the migration:

1. `findUnique({ where: { task } })` → `findFirst({ where: { task, projectId } })` is a 2-word change per file. The affected files are: `/api/findings/[task]/route.ts`, `/api/findings/notes/[task]/route.ts`, and `data.ts` `getFindings()`. That's 3 files, ~5 query calls.

2. `AuditConfig` and `GitHubConfig` composite unique: Same pattern, same fix. `config/route.ts` and `github-config.ts` need `findFirst` instead of `findUnique`.

3. The "active project" context: We need a way to know which project is currently active. Two options:
   - **Option A**: Store `activeProjectId` in `AuditConfig` as a special key `active_project`
   - **Option B**: The client sends `projectId` in API request headers/params

Option A is simpler (server-side, no client changes). Option B is more RESTful but requires client-side state.

**PERSONA B counter**:

Option A creates a chicken-and-egg problem: you need to know the active project to query `AuditConfig`, but `active_project` is stored in `AuditConfig`. If the DB has no `active_project` key yet (fresh install), the query fails. You need a fallback: if no `active_project` config exists, use the first `Project` record, or a hardcoded default.

Also, `findFirst` is semantically different from `findUnique`: `findFirst` returns the FIRST matching record, which means if there are duplicates (bug in data), it silently returns one instead of throwing. This is a data integrity risk. Better to use the composite unique field explicitly:

```typescript
// Correct: use composite unique field
const finding = await db.finding.findUnique({ 
  where: { projectId_task: { projectId: activeProjectId, task } } 
})
```

Prisma generates the composite unique field name as `{field1}_{field2}` by default. This is deterministic and type-safe.

**PERSONA A final**:

Agreed. Use composite `where` clauses. The migration SQL needs:
1. Drop existing unique index on `Finding.task`
2. Create composite unique index on `[projectId, task]`
3. Add `projectId` column to `Finding` with default value "default-project-id"
4. Same for `AuditConfig.key` → `[projectId, key]`
5. Same for `GitHubConfig.key` → `[projectId, key]`

The seed creates the default project first, then all existing data gets its `projectId`.

**OPTION EVALUATION**:

| | Option 1 (X) | Option 2 (Y) | Option 3 (Union) |
|---|---|---|---|
| Approach | Minimal Project model, `findFirst` queries | Rich Project model, composite `findUnique` queries | Lean Project model, composite `findUnique` queries, `active_project` config key with fallback |
| Breaking changes | `findUnique({ where: { task } })` → `findFirst` (silent duplicates risk) | Same + new route + 3 components | `findUnique({ where: { task } })` → `findUnique({ where: { projectId_task: { projectId, task } } })` (type-safe) |
| Active project | Client sends projectId in params | Server-side session/cookie | `AuditConfig.active_project` key with fallback to first Project record |
| Solo dev overhead | Low (3 files, ~5 queries) | High (new route, wizard, 3 components) | Low (3 files, ~5 queries, 1 config key) |

**Union wins**: Composite `findUnique` queries (Y's type safety), lean model (X's simplicity), `active_project` config key with fallback (neither X nor Y's approach alone).

---

### TOPIC 2: Config Consolidation — `placeholderData` vs. Context Provider

**PERSONA A**:

The Union from Document 1 uses `useAuditConfig()` hook with `placeholderData: DEFAULT_CONFIGS`. Components call this hook and get instant defaults, then DB overrides overlay when the API responds.

Mock implementation:

```typescript
// src/lib/use-audit-config.ts
import { useQuery } from '@tanstack/react-query'

const DEFAULT_CONFIGS = {
  severity_levels: {
    critical: { label: 'Critical', weight: 4, color: '#dc2626' },
    high: { label: 'High', weight: 3, color: '#f97316' },
    medium: { label: 'Medium', weight: 2, color: '#eab308' },
    low: { label: 'Low', weight: 1, color: '#6b7280' },
  },
  tier_labels: {
    tier0: { short: 'T0', full: 'Tier 0 — Immediate Threats', color: '#dc2626', weight: 3 },
    // ... etc
  },
  // ... (from current config/route.ts DEFAULT_CONFIGS)
}

export function useAuditConfig() {
  return useQuery({
    queryKey: ['audit-config'],
    queryFn: async () => {
      const res = await fetch('/api/config')
      if (!res.ok) throw new Error('Failed to fetch config')
      const data = await res.json()
      return data.configs // { severity_levels: { value, isDefault }, ... }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_CONFIGS,
  })
}
```

Every component that currently imports from `audit-data.ts` or `dashboard-constants.ts` would instead call `useAuditConfig()`. The hook returns merged config (defaults + DB overrides).

**PERSONA B**:

Two critical problems:

**Problem 1**: `placeholderData` in TanStack Query v5 is NOT `initialData`. `placeholderData` is shown while the query is loading, but once the real data arrives, it's REPLACED entirely. This means if the API returns `{ configs: { severity_levels: { value: {...}, isDefault: false } } }`, the component needs to unwrap the `value` wrapper. The `placeholderData` format (flat `{ critical: {...} }`) is DIFFERENT from the API response format (`{ value: { critical: {...} }, isDefault: false }`). This format mismatch causes a rendering flash: defaults render first, then the entire UI re-renders with the unwrapped API format.

**Evidence**: `config/route.ts` L90-104 returns `{ configs: { severity_levels: { value: {...}, isDefault: true/false } } }`. The `DEFAULT_CONFIGS` in my mock above are flat objects (`{ critical: {...} }`). These are structurally different.

**Fix**: The `placeholderData` must match the API response structure, OR the `queryFn` must flatten the response to match the defaults format.

```typescript
// Option A: queryFn flattens the response
queryFn: async () => {
  const data = await res.json()
  // Flatten { configs: { key: { value, isDefault } } } to { key: value }
  const flat: Record<string, object> = {}
  for (const [k, v] of Object.entries(data.configs)) {
    flat[k] = (v as any).value
  }
  return flat
}
// Now placeholderData format matches: DEFAULT_CONFIGS is also flat
```

**Problem 2**: 26 components import from `audit-data.ts`. Changing all 26 to call `useAuditConfig()` means every component becomes a hook consumer. This is fine for React components, but some imports are used in non-hook contexts:
- `dashboard-constants.ts` L1 imports `Severity, Tier, UnifiedModuleId` as TYPE imports — these don't need the hook, they need the type file.
- `use-findings.ts` L6-9 imports `Severity, Tier, VerificationStatus, AuditStatus` as TYPE imports — same.
- Helper functions like `getRiskScore()`, `getRiskLevel()` in `audit-data.ts` L1515-1526 use `tierImpact` and `severityWeight` constants — these need VALUES, not types.

**PERSONA A rebuttal**:

Problem 1 is a real format mismatch. The fix is simple: flatten the API response in `queryFn`. 5 lines of code.

Problem 2: Split `audit-data.ts` into:
- `audit-types.ts` — pure type exports (Severity, Tier, Finding interface, etc.) → imported by 26 files for TYPE only
- `audit-defaults.ts` — DEFAULT_CONFIGS flat object → imported by `use-audit-config.ts` as `placeholderData`
- Helper functions (`getRiskScore`, etc.) → moved to `audit-utils.ts` that takes config as parameter

```typescript
// audit-utils.ts — functions that accept config as parameter
export function getRiskScore(
  config: AuditConfigData, 
  tier: Tier, severity: Severity
): number {
  return config.tier_labels[tier].weight + config.severity_levels[severity].weight
}
```

This makes functions pure and config-driven instead of reading from global constants.

**PERSONA B counter**:

The `getRiskScore` function is called inside `health-score-gauge.tsx` and `risk-matrix.tsx` during render. If config hasn't loaded yet (even with `placeholderData`, the first render might use defaults), the risk scores will be calculated with default weights, then recalculated with DB weights when the API responds. This causes a visual flash: health score changes from e.g. 42 to 45 when config loads.

This is acceptable for a solo dev app — the flash is ~100ms. But document it as a known UX trade-off.

**OPTION EVALUATION**:

| | Option 1 (X) | Option 2 (Y) | Option 3 (Union) |
|---|---|---|---|
| Approach | `useAuditConfig()` hook with `placeholderData`, 26 component refactor | React Context provider that injects config once, components read from context | `useAuditConfig()` hook + `placeholderData` with flattened API response, `audit-types.ts` split, `audit-utils.ts` with config-as-param |
| Loading flash | Yes (~100ms) | No (context populated before render) | Yes (~100ms, acceptable) |
| Type safety | Type imports from `audit-types.ts` | Same | Same |
| Over-engineering? | No | Context provider adds indirection layer for solo dev | No — cleanest separation |
| Bundle size impact | Removes 2024-line `audit-data.ts` from runtime bundle | Same | Same |

**Union wins**: Hook approach (X's simplicity), flattened response (B's format fix), type split (B's structural fix), config-as-param utils (B's purity fix). Context provider rejected (over-engineered for solo dev).

---

### TOPIC 3: Template-Based Narratives — AuditConfig vs. Dedicated Model

**PERSONA A**:

Use `AuditConfig` keys `narrative_templates` and `export_templates`. Simple JSON objects. `renderTemplate(template, data)` function (~20 lines). No schema changes.

```typescript
// AuditConfig key: "narrative_templates"  
// Value: {
//   finding_header: "{task}: {title} — {severity}",
//   finding_summary: "{claim}\nEvidence: {evidence}",
//   proposal_card: "{title} — Effort: {effort}, Risk: {risk}",
//   module_header: "{id}: {title} — {subtitle}",
//   module_coverage: "{coreIdea}\nFixes: {fixes}"
// }

function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key]
    if (Array.isArray(val)) return val.join(', ')
    return String(val ?? `{${key}:NOT_FOUND}`)
  })
}
```

**PERSONA B**:

**Problem 1**: `{affectedFiles}` is an array. `join(', ')` loses the per-file granularity that the current UI provides (each file is a clickable link in `finding-card.tsx`). Templates produce plain text, but the UI needs structured rendering (links, badges, color-coded severity).

**Evidence**: `finding-card.tsx` renders `affectedFiles` as clickable file links (lines where it maps over `finding.affectedFiles` with `<a>` tags). A plain-text template like `"Files: {affectedFiles}"` can't produce clickable links.

**Fix**: Templates should produce REACT COMPONENTS, not plain text. Or, templates should be used ONLY for export (CSV/Markdown/PDF), while the UI continues to use structured components.

**Problem 2**: `{fixes}` in module templates is also an array of strings, but the current `unified-tab-content.tsx` renders them as a styled list with icons. Plain-text template loses this.

**Problem 3**: The `NOT_FOUND` fallback `{affectedFiles:NOT_FOUND}` is a runtime error that will show in the UI if a template variable doesn't match a finding field. This is a bad UX. Better to validate templates at save time (in the PUT handler).

**PERSONA A rebuttal**:

Problem 1 and 2 are valid. Templates are for EXPORT and AI prompt construction, NOT for UI rendering. The UI components continue to render structured data as they do now. The template system replaces:
1. The hardcoded strings in `export-enhancements.tsx` (L97, L179, L182) — `repo: 'github.com/HansChucrte14/Hans-GSD-Raw-Calculator'`
2. The hardcoded AI prompt in `ai/analyze/route.ts` L19 — `"Hans-GSD-Raw-Calculator project"`
3. The hardcoded issue title in `github/issue/route.ts` L43

For UI rendering, components already use `finding.title`, `finding.severity`, etc. — no templates needed.

Problem 3: Add validation in the PUT handler. Check that all `{variable}` references exist in the known Finding/Module field list. Reject saves with unknown variables.

**PERSONA B**:

Good, but I want to stress one more thing: the `renderTemplate` function's `/\{(\w+)\}/g` regex only matches simple field names like `{title}`, `{severity}`. It can't handle nested access like `{module.title}` or conditional sections like `{?hasModule}Module: {module.title}{/?hasModule}`.

For Phase 3 scope, simple field substitution is sufficient. But document this as a limitation: nested/conditional templates are Phase 4.

**OPTION EVALUATION**:

| | Option 1 (X) | Option 2 (Y) | Option 3 (Union) |
|---|---|---|---|
| Scope | Templates for UI rendering | Templates for export + AI prompts only, UI stays structured | Templates for export + AI prompts + GitHub issue titles, UI stays structured |
| Validation | None (runtime `NOT_FOUND` fallback) | Save-time validation in PUT handler | Save-time validation + runtime fallback `{key:NOT_FOUND}` for safety |
| Nesting | Simple `{field}` only | Full template engine with conditionals | Simple `{field}` only, document Phase 4 for nesting |
| Storage | AuditConfig key | AuditConfig key | AuditConfig key `narrative_templates` + `export_templates` |

**Union wins**: Templates for export/AI/GitHub (not UI), save-time validation, simple `{field}` syntax with Phase 4 nesting documented.

---

### TOPIC 4: Onboarding Flow — Admin Tab Section vs. Dedicated Route

**PERSONA A**:

Add a "Projects" section to the existing `admin-tab.tsx` (1,511 lines). It already has sections for GitHub config, AI connectors, Opencode, and audit config. Adding a project list + "Add Project" form is natural. No new route needed.

The form: name, repoOwner, repoName, description. On submit: POST to `/api/project` → creates Project + seeds default configs. After creation, the project appears in the header dropdown.

**PERSONA B**:

**Problem 1**: `admin-tab.tsx` is already 1,511 lines. Adding another section (project list + form + edit + delete) adds ~200 lines, making it 1,711 lines. This is a cognitive overload risk for a solo maintainer.

**Evidence**: `admin-tab.tsx` L1-1511 already manages 4 config sections with complex state (useState for each section's data, useEffect for fetching, mutation hooks for saving). Adding a 5th section with its own state management adds more useState/useEffect hooks, increasing the risk of state bugs.

**Fix**: Extract each admin section into its own component. `admin-tab.tsx` becomes a tab navigator that renders `<GitHubConfigSection />`, `<AIConnectorSection />`, `<OpencodeSection />`, `<AuditConfigSection />`, `<ProjectSection />`. Each section is ~200-300 lines, independently manageable.

**Problem 2**: The project selector in the header. `dashboard-client.tsx` L131-130 already has a complex header with theme toggle, keyboard shortcuts button, and activity log. Adding a project selector dropdown needs state: `activeProjectId`. This state must be accessible by all tab content components (they need to know which project's data to fetch).

**Evidence**: `dashboard-client.tsx` L131-200 manages `activeTab`, `theme`, `commandOpen`, `compareOpen`, `selectedFinding`, `batchMode`. Adding `activeProjectId` as another state variable in the same component increases the state surface.

**Fix**: Use a lightweight project context (not Zustand — it's unused and adding it now is over-engineering). Create `ProjectContext` with `activeProjectId` and `setActiveProjectId`. Wrap the dashboard in `<ProjectProvider>`. All tab components read `activeProjectId` from context.

```typescript
// src/lib/project-context.tsx
const ProjectContext = createContext<{
  activeProjectId: string | null
  setActiveProjectId: (id: string) => void
  projects: Project[]
}>({ activeProjectId: null, setActiveProjectId: () => {}, projects: [] })

export function useProject() {
  return useContext(ProjectContext)
}
```

**PERSONA A rebuttal**:

Extracting admin sections into separate components is a good refactor, but it's not Phase 3 scope — it's a code quality improvement that can happen independently. For Phase 3, adding the Project section inline is fine. The 200-line addition is manageable.

Project context is also a good idea, but React Context for a single string (`activeProjectId`) is minimal overhead. I agree with this approach.

**OPTION EVALUATION**:

| | Option 1 (X) | Option 2 (Y) | Option 3 (Union) |
|---|---|---|---|
| Onboarding location | Inline in `admin-tab.tsx` | Dedicated `/onboarding` route + multi-step wizard | "Projects" section in `admin-tab.tsx`, extracted into `<ProjectSection />` component |
| Project switching | Header dropdown with useState | Dedicated project selector page | Header dropdown + `ProjectContext` provider |
| State management | `useState` in `dashboard-client.tsx` | Zustand store | React Context (`ProjectContext`) |
| Cognitive overhead | Low (inline addition) | High (new route, wizard, 3 components) | Medium (extracted section, context provider) |

**Union wins**: Extracted `<ProjectSection />` component (Y's structural hygiene), inline in admin tab (X's no-new-route), React Context for project state (Y's accessibility, X's simplicity vs Zustand).

---

### TOPIC 5: Data Migration Strategy — Default Project Seed

**PERSONA A**:

Migration steps:
1. Add `Project` model to schema
2. Add `projectId` to `Finding`, `AuditConfig`, `GitHubConfig`, `OpencodeSetting`
3. Run `bun run db:push` (Prisma will create migration)
4. Seed: create default project, update all existing records with `projectId = default`
5. Drop `@unique` on `Finding.task`, add `@@unique([projectId, task])`
6. Same for `AuditConfig.key` and `GitHubConfig.key`

**PERSONA B**:

**Problem 1**: `db:push` doesn't handle `@unique` → `@@unique` migration cleanly. Prisma push recreates the schema, but SQLite doesn't support dropping/recreating indexes in-place. You might need to:
1. Create a new DB with the updated schema
2. Migrate data from old DB to new DB
3. Or use a custom migration SQL

**Evidence**: SQLite limitation — `ALTER TABLE` only supports adding columns, not dropping constraints or modifying unique indexes. To change `Finding.task` from `@unique` to `@@unique([projectId, task])`, you need to:
- Create a new table with the composite unique
- Copy data from old table
- Drop old table
- Rename new table

This is risky. If data copy fails, you lose the entire findings table.

**Fix**: Use Prisma's `prisma migrate` instead of `db:push` for this specific migration. Write a custom migration SQL file. Or, simpler: just add `projectId` as a nullable field first, seed the default value, then make it required + composite unique in a second step.

**Problem 2**: The `BestProposalAnalysis` model uses `task` as both `@unique` AND a FK to `Finding.task` (schema.prisma L88-95). After `Finding.task` becomes non-unique (composite), `BestProposalAnalysis.task` FK breaks because it references a field that's no longer uniquely identifiable.

**Evidence**: `BestProposalAnalysis` L88-95:
```prisma
model BestProposalAnalysis {
  task           String  @unique
  finding        Finding @relation(fields: [task], references: [task], onDelete: Cascade)
}
```

After `Finding` gets `@@unique([projectId, task])`, the `references: [task]` no longer points to a unique field. Prisma will reject this relation.

**Fix**: `BestProposalAnalysis` also needs `projectId` + composite relation. OR, use `findingId` (the Finding's `id` cuid) as the FK instead of `task`.

```prisma
model BestProposalAnalysis {
  id             String  @id @default(cuid())
  findingId      String  @unique  // FK to Finding.id (cuid) instead of task
  bestSoloIndex  Int
  bestSoloReason String
  hybridNote     String?
  finding        Finding @relation(fields: [findingId], references: [id], onDelete: Cascade)
}
```

This is cleaner — `Finding.id` is always unique regardless of project scope. But it changes the current `task`-based relation to `id`-based, which affects:
- `data.ts` `getAnalyses()` L127 — currently joins via `task`
- `findings/route.ts` GET L30 — currently fetches analyses separately by `task`
- `findings/modules/route.ts` GET L30 — same

**PERSONA A**:

The `BestProposalAnalysis` FK issue is the hardest migration problem. Using `findingId` instead of `task` is the right fix — `Finding.id` (cuid) is always unique. The `task` field was a poor FK choice from the original schema design (it's a domain identifier, not a stable primary key).

For the migration, I agree with B's two-step approach:
1. Step 1: Add `projectId` nullable, seed default, add composite unique
2. Step 2: Migrate `BestProposalAnalysis` from `task` FK to `findingId` FK

**OPTION EVALUATION**:

| | Option 1 (X) | Option 2 (Y) | Option 3 (Union) |
|---|---|---|---|
| Migration tool | `db:push` (schema recreation) | `prisma migrate` with custom SQL | Two-step `db:push`: Step 1 add nullable `projectId`, Step 2 make required + composite unique |
| BestProposalAnalysis FK | Keep `task` FK, add `projectId` composite | Change to `findingId` FK (cuid-based) | Change to `findingId` FK + data migration script |
| Risk | SQLite constraint changes may fail | Custom SQL is error-prone | Two-step reduces risk — each step is simple |
| Solo dev overhead | Low (one push) | Medium (custom migration) | Low (two pushes, each simple) |

**Union wins**: Two-step `db:push` (X's simplicity + Y's safety), `findingId` FK for `BestProposalAnalysis` (Y's structural correctness), cuid-based relation (future-proof regardless of project scope).

---

### TOPIC 6: G3 Blocked Triple-Quadruple Hardcoding Elimination

**PERSONA A**:

Move G3 blocked data to `AuditConfig` key `g3_blocked`. Delete from `audit-data.ts` L1926-1946, `data.ts` L132-151, `findings/modules/route.ts` L31-48.

```typescript
// AuditConfig key: "g3_blocked"
// Value: [
//   { task: '6', title: 'Absolute calcium and phosphorus ceilings', canShipNow: '...', needsReview: '...' },
//   { task: '7', title: 'Fix growth-energy model and scenario labels', canShipNow: '...', needsReview: '...' }
// ]
```

`/api/findings/modules` reads from `AuditConfig` instead of hardcoding.

**PERSONA B**:

**Problem**: G3 blocked items reference `task` values ('6', '7'). After multi-project support, these task values are project-specific. A different project might have different G3 blocked tasks. The `AuditConfig` key `g3_blocked` needs to be scoped by `projectId` (which Union Proposal P1 already handles — `AuditConfig` gets `projectId` FK).

But the current G3 blocked data format (`canShipNow`, `needsReview`) is domain-specific to the pet nutrition calculator. For a different project, the fields might be `blockingReason`, `resolutionPath`, etc. Making this generic requires defining the G3 blocked schema in config, not just the data.

**Fix**: Define `g3_blocked_schema` as an AuditConfig key that specifies the fields. Then `g3_blocked_data` provides values matching that schema. This is over-engineering for solo dev — just keep the current field names and accept that different projects will have different data shapes.

**PERSONA A**:

Agreed. Keep the current field names. Different projects just have different data in the same `g3_blocked` config key. If a project has no G3 blocked items, the value is `[]`.

**Union**: Move G3 blocked to `AuditConfig.g3_blocked` (scoped by `projectId`), keep current field names, accept per-project data variance.
