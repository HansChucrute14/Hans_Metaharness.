# Spec: Canonize IDs + one-time corpus reconciliation script

## Problem Statement

The GSD audit unification (see CONTEXT.md, ADR-0001 through ADR-0006) requires a single canonical ID system for findings across the Audit Dashboard (`audit-dashboard-project/my-project/prisma/schema.prisma`) and the Consolidated Reader (`gsd-diet-calc-consolidated-reader/consolidated-docs/`). Currently:

- Two incompatible ID namespaces exist: the Finding namespace (A/B/C/D/E series, 107 raw IDs) and the Task namespace (B-series, C-series, R-series regression, MAPA 2.0 labels, legacy R-01..R-09).
- Four documented namespace collisions exist: `C4` (finding vs task), `C7` (finding vs task), `C16` (finding vs task), `R1` (finding/governance vs regression task vs legacy `R-01`). These are disambiguated in `APPENDIX-ID-KEY.md §6`.
- The plan's historical "121 raw IDs → 77 unique defects" count is superseded by the post-AUDIT_DELTA authoritative count from BUG-DEPENDENCY-MAP.md §A: **107 raw finding IDs → 79 unique defects** (+2 from E24/E25 per AUDIT_DELTA).
- The existing reader graph (`dependency-graph.ts`) excludes A-series and E-series findings from its node-ID regex; the Dashboard bundles findings under `task.findingIds` (JSON array). Both need reconciliation to work with a unified `GraphNode` overlay.

The user (a senior SWE reviewing the repo) confirmed that the foundational work is to build the mapping table, resolve the 4 documented collisions, and write the one-time scripted rewrite (plan step D8 / G7). The decision gates G1 and G2 are resolved; G3 (numeric safety values — vet sign-off) is the single open gate that blocks tasks but does NOT block the ID reconciliation itself.

## Solution

From the user's perspective:

A single migration script (`reconcile-gsd-ids`) reads the source corpus (`APPENDIX-ID-KEY.md` as the hand-key reference, `BUG-DEPENDENCY-MAP.md` §A for the authoritative count, `bug-facts.ts` for existing graph node references, and the 10 `consolidated-docs/*.md` files), produces a deterministic `mapping.json`, validates it against the 107→79 count assertion, and applies a dry-run diff showing exactly what string substitutions would occur in each of the 10 published files. Once validated (`--apply`), the script writes the canonical IDs to the DB (`Finding.canonicalId`), drops `dependsOn` (replaced by `GraphEdge`) and `findingIds` (replaced by `UnifiedExecutionModule.addresses`), and generates a static JSON export to replace the `BUG_FACTS` fallback.

The user will review the diff, confirm the 4 collision resolutions match `APPENDIX-ID-KEY.md §6`, and approve the script run.

## User Stories

The spec produces a deliverable spec document and a working script. User stories cover all actors:

1. As an engineer maintaining the GSD audit corpus, I want a deterministic script (`reconcile-gsd-ids --dry-run`) that produces a reproducible `mapping.json`, so that I can review the exact collision resolutions before applying them.
2. As an engineer, I want the script to assert the 107→79 count and detect any orphaned canonical IDs (canonical IDs that trace back to zero raw IDs, or raw IDs that map to multiple canonical IDs), so that the D8 reconciliation is provably complete.
3. As a developer on the Consolidated Reader, I want the 10 published files (`consolidated-docs/*.md`) rewritten with canonical IDs instead of legacy task IDs, so that `BUG-DEPENDENCY-MAP.md`'s YAML block can import into the shared `GraphNode` schema without namespace translation.
4. As a developer on the Audit Dashboard, I want the Prisma schema updated (`Finding.canonicalId`, `Project.slug`, removal of `findingIds` and `dependsOn`, new `GraphNode` and `GraphEdge` tables) so the DB can host the unified graph overlay.
5. As a user of the `GraphRepository` interface (`getUnblocked()`), I want `GraphNode.id` to reference `Finding.canonicalId` directly (opaque, persistent IDs per ADR-0004), so that the graph query doesn't depend on mutable properties.
6. As an engineer running the migration, I want the script to be idempotent (running twice produces the same output, no double-substitution), so that I can rerun safely during review.
7. As a senior engineer reviewing the work, I want a verified `APPENDIX-ID-KEY.md §6` reference document preserved in the docs (not deleted), so that future maintainers can trace why `gsd:C4` means the finding (not the task) and why `gsd:R1` does not exist as a standalone canonical finding.
8. As an agent-automation user (G3, G4, G5, G6), I want the `pipelineTier` computed from a graph where every finding (A–E, all series) is a real `GraphNode` with `dependencyConfidence` (`"documented"` or `"discovered"` per F2/F3), so that the agent's pickup query (`getUnblocked()` ordered by `pipelineTier` then `canonicalId` ASC) returns a deterministic dispatch sequence.
9. As an engineer maintaining the `dependency-graph.ts` module, I want the existing `readFileSync` + `extractGraphDataBlock()` + `parseGraphSource()` pipeline preserved as the YAML import validator (fail-closed: bad YAML leaves DB untouched), so that the YAML ↔ DB bidirectional sync (ADR-0005) can reuse existing validation logic.
10. As an engineer tracking open gates, I want the spec to document that G3 (numeric safety verification — vet sign-off) is the only remaining open gate blocking tasks B3, B4, and B2b-thresholds, but does NOT block this ID-reconciliation work, so that implementation sequencing is unambiguous.
11. As an engineer verifying the migration, I want the `G7` count assertion script (`assert-unification`) to run independently of the rewrite script, comparing the DB's `Finding` table count against `APPENDIX-ID-KEY.md`'s 107 raw IDs and asserting no orphans exist, so that G7's verification-of-unification-itself is a standalone, reviewable artifact.
12. As a user reviewing the ADRs, I want ADR-0006 (this reconciliation record) and the updated CONTEXT.md to reference the real 107→79 count (not the historical 121→77) and document the 4 collision rules explicitly, so that documentation and code stay aligned.

## Implementation Decisions

These decisions are synthesized from the grilling session (domain modeling / `grill-with-docs` skill), the data archaeology (reading APPENDIX-ID-KEY.md, BUG-DEPENDENCY-MAP.md, INDEX.yml, the 10 `consolidated-docs/*.md` files, and the existing `prisma/schema.prisma`), and the 6 ADRs (0001–0006) plus `CONTEXT.md`. They respect the domain vocabulary established there.

### The feature being specified

This spec covers the **canonical-ID reconciliation and one-time corpus rewrite** — not the full agent loop (G3/G4/G5/G8), not the discovery pass (D9 — that is a separate spec), and not the full `GraphRepository` interface (F5 — the interface design exists in ADR-0003 but its full method-body implementation is separate). It includes only the schema migrations required for the reconciliation to have a place to live.

### Schema changes (FULL F1-F7 — user confirmed expanded scope: F1-F7 full schema, agent deferred per G8)

The `audit-dashboard-project/my-project/prisma/schema.prisma` schema must be updated as the full F1-F7 layer (user confirmed: not minimal — full schema). This includes the reconciliation fields, the graph overlay, the sync infrastructure, and the repository interface contracts. Only the agent-loop wiring (G3-G8) and the discovery-pass LLM (D9) are deferred; everything else in F1-F7 lives in this spec.

- **`Finding.canonicalId`** — new String field, unique per project, non-null after migration, format `{project}:{series}{number}`. The existing `task` field becomes nullable (legacy label only, kept through D8 migration window, then dropped in a future migration). The `findingIds` JSON array is removed; cross-finding grouping moves exclusively to `UnifiedExecutionModule.addresses`. The `dependsOn` string is removed; dependency information lives in `GraphEdge`.
- **`Finding.approvedProposalIndex`** — new nullable Int. Required for G6 (agent only picks findings where this is non-null) and F3 (discovered-edge exception). Out of scope for this spec but must exist before agent loop wiring.
- **`Project.slug`** — new String, unique, kebab-case (`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`), immutable after creation. Used as the `{project}` prefix in canonical IDs (F6 / ADR-0002).
- **`Finding.tier` (String `"tier0"` etc.) replaced by `Finding.pipelineTier` (Int)** — out of scope for this spec's script, but the schema field must be added so `GraphNode.pipelineTier` has a source. The script sets `pipelineTier` via a derived computation (DP longest-distance from root nodes) only after `GraphNode` exists; the initial value during reconciliation is `0` (to be computed in a follow-up spec).
- **`Finding.verificationStatus`** extended enum — out of scope for this spec's script, but the existing field (`"confirmed-execution"` default) must gain the agent-verified vs human-verified distinction (G3). The spec notes this but doesn't implement it.

No `GraphNode` or `GraphEdge` tables are added by this spec — they are out of scope but listed under "Further Notes" as prerequisites for the agent loop.

### The reconciliation script (`reconcile-gsd-ids`)

A Python CLI script (not a bash script — it requires JSON parsing, YAML extraction, and Zod-style validation) that lives at the repo root (e.g., `scripts/reconcile-gsd-ids.py`). It is the single deliverable of this spec.

**Inputs (seams — the highest point possible):**
- `gsd-diet-calc-consolidated-reader/consolidated-docs/APPENDIX-ID-KEY.md` (the hand-key reference with collision rules in §6, MAPA 2.0 mapping in §7, and alias chains in §1.1)
- `gsd-diet-calc-consolidated-reader/consolidated-docs/BUG-DEPENDENCY-MAP.md` (the authoritative 107→79 count in §A, the namespace note in §A.0 with the 4 documented collisions, and the graph data in §D with 45 edges)
- `gsd-diet-calc-consolidated-reader/consolidated-docs/INDEX.yml` (the 10-file registry confirming corpus completeness)
- `gsd-diet-calc-consolidated-reader/src/lib/bug-facts.ts` (the 107-entry `BUG_FACTS` record, the `getBugFact()` lookup, the `blockedBy`/`repairs` arrays that seed the dependency graph)
- `audit-dashboard-project/my-project/prisma/schema.prisma` (the target DB schema, confirming which fields exist for the migration to apply to)

These are the **only** inputs. The script does NOT read the 10 published `.md` files' full prose content — it uses `APPENDIX-ID-KEY.md` as the authoritative key and applies the string-substitution rules derived from the collision disambiguation table (§6) to the 10 files. The substitution rules are: for each of the 4 documented collisions, replace all occurrences of the legacy task ID (when it appears as a task reference) with the renamed task identifier, and replace finding IDs with their canonical form (`gsd:{series}{number}`). The exact string-substitution rules are derived from the mapping produced by the script's analysis phase, not hardcoded.

**Output (seam):**
- A deterministic `docs/reconciliation/mapping.json` file (not `mapping.json` at repo root — to avoid polluting the workspace; the directory is new). The file has the shape: `{ "source_version": "post-AUDIT_DELTA (v10.4.0+E24+E25)", "raw_ids": 107, "canonical_ids": 79, "collision_resolutions": { ... }, "mapa_2_0_remap": { ... }, "alias_chains": { ... }, "migration_applied": false }`. When `--apply` is run, `"migration_applied"` becomes `true` and a `docs/reconciliation/diff/` directory is written showing line-level diffs for each of the 10 published files.
- The DB migration script (`prisma/migrations/reconcile-gsd-ids/`) that applies `Finding.canonicalId`, `Project.slug`, removes `findingIds`/`dependsOn`, and sets initial `pipelineTier` to `0` (derived computation deferred to follow-up spec).

**Idempotency contract:** Running `reconcile-gsd-ids --dry-run` twice produces byte-identical `mapping.json`. Running `--apply` twice produces byte-identical DB state (the second run sees `canonicalId` already present and exits with a `"already_applied"` flag set in `mapping.json`).

**Validation (G7 verification — separate script):**
- `assert-unification` script (`scripts/assert-unification.py`) runs independently of the rewrite script. It queries the DB (`SELECT COUNT(DISTINCT canonicalId)`, asserts 79, asserts no `canonicalId` with zero incoming `GraphNode` references once `GraphNode` exists — out of scope for this spec), asserts no raw `task` value appears in a `Finding` that has no corresponding `canonicalId`, and asserts the 4 collision resolutions match `APPENDIX-ID-KEY.md §6` by comparing `mapping.json`'s `collision_resolutions` dict. This is the **second test seam**.

### Implementation decisions (architecture-level only, no file paths for code internals)

**Decision 1 — The script lives at repo root as a CLI tool (`reconcile-gsd-ids`).** Reason: the migration must be reviewable, reproducible, and runnable from any clean clone (not hidden inside the dashboard or reader apps). It uses the domain vocabulary (`canonicalId`, `GraphNode`, `GraphEdge`, `pipelineTier`, `dependencyConfidence`) defined in `CONTEXT.md`.

**Decision 2 — The mapping is derived from `APPENDIX-ID-KEY.md`, not from scraping the 10 `.md` files' prose.** Reason: the hand-key (`APPENDIX-ID-KEY.md`) is the authoritative source of truth for disambiguation (§6, §7, §1.1); the 10 files are derived artifacts. Scraping prose would be fragile (markdown formatting changes). The substitution rules are generated by parsing the `collision_resolutions` and `mapa_2_0_remap` sections of the key file, then applied deterministically.

**Decision 3 — The 4 documented collisions are resolved in favor of the finding namespace.** Reason: per ADR-0006 and `APPENDIX-ID-KEY.md §6`, the finding namespace (systematic review IDs) is the canonical namespace for defects; the task namespace describes executable work (`UnifiedExecutionModule` per D3 / ADR-0001), not the defect identity. The task namespace IDs become the `UnifiedExecutionModule.addresses` grouping mechanism, not `Finding.task` replacements. `gsd:R1` does not exist as a canonical finding; its content (antagonism slack = A2) lives under `gsd:A2`.

**Decision 4 — Schema migration is included but minimal.** Reason: `canonicalId`, `Project.slug`, and the removal of `findingIds`/`dependsOn` are prerequisites for the mapping table to have a persistent storage target. The full `GraphNode`/`GraphEdge`/`PipelineTier` computation and `DomainEvent` middleware are deferred to a follow-up spec (they are out of scope). Only the fields needed for the reconciliation to persist are added.

**Decision 5 — The `pipelineTier` field is initialized to `0` by the script.** Reason: per D7, `pipelineTier` is computed as DP longest-distance from root nodes; the graph nodes don't fully exist yet (`GraphNode` table is out of scope). The initial `0` is a placeholder; the follow-up spec (agent loop / `getUnblocked()`) will compute and update it synchronously via the `GraphRepository` interface per F5 / ADR-0003.

**Decision 6 — The `BUG_FACTS` fallback (`bug-facts.ts`) is preserved during reconciliation but marked as deprecated.** Reason: per D9 and ADR-0005, the static JSON export mechanism (replacing `BUG_FACTS`) is a separate spec step (step 7 in the original kickoff). The reconciliation script notes in `mapping.json` that `BUG_FACTS` entries with IDs in the `collision_resolutions` set must be remapped to canonical IDs before the static export is generated. The script does NOT delete `bug-facts.ts`; it writes a `docs/reconciliation/bug-facts-replacement-plan.md` describing the remapping rules.

**Decision 7 — The G3 open gate is explicitly excluded from blocking this spec.** Reason: the reconciliation script operates purely on identity mapping (D4 / D8 / G7), not on numeric values or safety verification. G3 (numeric safety verification — vet sign-off) is documented in CONTEXT.md and ADR-0001 but is a separate engineering workstream that does not affect ID mapping. The spec notes this separation clearly so implementation sequencing is unambiguous.

**Decision 8 — The `APPENDIX-ID-KEY.md` file is preserved and enhanced.** Reason: the key is a reference document, not a script input to be discarded. After reconciliation, it is enhanced with a `## §9. Canonical mapping reference` section that references `docs/reconciliation/mapping.json` (generated by the script). The original `§6` collision disambiguation table remains unchanged (it describes the pre-reconciliation state for historical traceability).

### Schema references (FULL F1-F7 — user confirmed expanded scope)

All fields below come from the audit-dashboard Prisma schema (`audit-dashboard-project/my-project/prisma/schema.prisma`). The agent-loop wiring (G3-G8 state-machine progression, agent loop body) and dependency-discovery LLM (D9) remain deferred per the spec's scope decision; everything else in F1-F7 lives here.

From the audit-dashboard Prisma schema (`audit-dashboard-project/my-project/prisma/schema.prisma`):

- `Finding.canonicalId`: `String @unique`, non-null after migration; format validated by application layer (`{project}:{series}{number}` regex: `^[a-z][a-z0-9-]*:[A-MX][0-9]+$` with series letters A-M and X only, numbers sequential within series). (F1 / ADR-0004)
- `Finding.approvedProposalIndex`: `Int?`, nullable. Required for G6 (agent only picks findings where non-null) and F3 (discovered-edge exception). Out of scope for the agent-loop wiring in this spec, but the field must exist before agent loop activation. (F1 / G6 / F3)
- `Project.slug`: `String @unique`, kebab-case (`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`), immutable after creation. Used as the `{project}` prefix in canonical IDs (F6 / ADR-0002).
- `Finding.tier` (existing `String` `"tier0"` etc.): deprecated; new `Finding.pipelineTier`: `Int`, default `0`, computed by CPM + LLM confirmation loop (D7 / ADR-0003; initial value `0` set by this migration, full computation deferred to agent-loop spec). (F1 / F5 / D7)
- `Finding.findingIds`: removed (migration deletes column; grouping moves exclusively to `UnifiedExecutionModule.addresses`, per D3 / ADR-0001). (F1 / D3)
- `Finding.dependsOn`: removed (migration deletes column; dependency tracking moves to `GraphEdge` table, per F2 / ADR-0003 / F3). (F1 / F2 / F3)
- `Finding.dependencyConfidence`: `String` enum (`"documented"` / `"discovered"`), default `"documented"`. Required for F3 (auto-merge holds for discovered edges without human confirmation) and for the dependency-discovery pass tagging (D9 — out of scope for this spec, but the field must exist). (F2 / F3 / D9 / ADR-0003 / ADR-0005)
- `Finding.verificationStatus`: extended enum (existing `String` default `"confirmed-execution"` must gain agent-verified vs human-verified distinction per G3; this spec notes but does not fully implement the enum extension — agent-loop spec completes it). (F1 / G3)
- **`GraphNode`** (new table, F2 / ADR-0003): `id` (`String` @default(uuid) or cuid), `canonicalId` (`String` @unique — references `Finding.canonicalId`), `projectId` (`String`), `findingId` (`String` @unique — FK reference to `Finding.id`), `pipelineTier` (`Int`), `dependencyConfidence` (`String`, default `"documented"`). (F2 / ADR-0003 / D7 / F3)
- **`GraphEdge`** (new table, F2 / ADR-0003): `id` (`String`), `fromId` (`String` FK reference to `GraphNode.id`), `toId` (`String` FK reference to `GraphNode.id`), `kind` (`String`, default `"blockedBy"`). Default kind is `"blockedBy"` — the target node is blocked by the source node. (F2 / ADR-0003 / D3 / F3)
- **`DomainEvent`** (new table, F4 / D11 / ADR-0002): `id`, `entityType` (`"Finding"` / `"GraphNode"` / `"GraphEdge"`), `entityId` (`String`), `operation` (`"create"` / `"update"` / `"delete"`), `payload` (`String` JSON), `status` (`"pending"` / `"retried"` / `"failed"` / `"completed"`), `retryCount` (`Int` default 0), `nextRetryAt` (`DateTime?`), `createdAt`, `updatedAt`. Triggers: Prisma middleware on `Finding` mutations emits this; async worker upserts overlay. Retry schedule: 0s / 5s / 30s / 5min (F4). (F4 / D11 / ADR-0002)
- **`DeadLetterQueue`** (new table, F4 / D11 / ADR-0002): `id`, `eventId` (`String` FK to `DomainEvent.id`), `failureReason` (`String`), `retryHistory` (`String` JSON array of retry timestamps), `escalated` (`Boolean` default false), `createdAt`, `updatedAt`. Retries at 0s/5s/30s/5min, then escalates to issue-only popup (D11). (F4 / D11)
- **`GraphRepository` interface contract** (F5 / ADR-0003 / ADR-0006): interface definition (`getNode(canonicalId)`, `getGraph(projectId)`, `getUnblocked(projectId)` ordered by `pipelineTier` + `canonicalId` ASC — G4 dispatch query — `upsertNode(...)`, `upsertEdge(...)`, `deleteNode(...)`). Full method-body implementation deferred; this spec defines the data model the repository operates on (`GraphNode.id` = `canonicalId`; `GraphEdge.fromId`/`toId` = `GraphNode.id`). (F5 / ADR-0003)
- **`AuditConfig` adjustments**: no structural change required; `pipelineTier` is a derived computed field (D7), not a configurable label. Existing adaptive `tier` labels (`tier0` / `tier1` etc.) remain but are superseded by the computed Int. (F4 / D7 — no model change to `AuditConfig`)
- **`OpencodeAction`** (G3-G6 / F1 / F5): existing model extended — `status` field gains full state-machine progression (`queued` -> `implementing` -> `pr_open` -> `testing` -> `merging` -> `completed` / `failed`). `task` (`String?`) links to `Finding.task` (legacy). `contextJson` carries `GraphNode`/`GraphEdge` context. `approvedProposalIndex` (new `Finding` field) is read; `contextJson` references `GraphRepository.getUnblocked()` output. Agent-loop body deferred; schema supports it. (G3-G6 / F1 / F5)
- **`OpencodeSetting`** (F7 / ADR-0002 / F6): no schema change; startup/config validation (`workspacePath` git remote matches `GitHubConfig.repoOwner`/`repoName` for same `Project`) deferred to agent-loop spec; contract noted. (F7 — deferred implementation, schema unchanged)

No `BUG_FACTS` static JSON export mechanism is implemented by this spec — out of scope per D9 / ADR-0005. The reconciliation script writes `docs/reconciliation/bug-facts-replacement-plan.md` describing the remapping rules but does NOT generate the static JSON file. That is the separate spec step 7 from the original kickoff and is out of scope.

No code snippets from `bug-facts.ts` are embedded in this spec (the interface changes are described in prose; the prototype snippet from `dependency-graph.ts` — the `GraphNode` interface shape — is noted as coming from the existing reader graph module and referenced by ADR-0003, not inlined). The script's `mapping.json` shape is described in prose; no JSON snippet is embedded.

### API contracts / interactions (the user's original decision log points to these, summarized in prose)

From the user's decision log (D-series, G-series, F-series):

- **D1 / Architecture shape:** Two separate applications (`Consolidated Reader`, `Audit Dashboard`), interlinked via shared SQLite DB (ADR-0002). Confirmed.
- **D2 / Source of truth:** DB-backed (`Audit Dashboard`'s Prisma/SQLite). Confirmed.
- **D3 / Atomic unit:** Raw finding ID (`Finding.canonicalId`), not `task` (which bundles multiple findings via JSON array). Confirmed; this spec implements the removal of `findingIds`.
- **D4 / Canonical ID:** New system `{project}:{series}{number}`; full reconciliation required. Confirmed; this spec implements it.
- **D5 / Scope trajectory:** Project-agnostic design; letter taxonomy (A-M, X) fixed (ADR-0001). Confirmed; `Project.slug` supports multi-project namespacing (F6 / ADR-0004).
- **D6 / App responsibilities:** `Audit Dashboard` owns pipeline/progress state; `Consolidated Reader` is presentation-only. Confirmed.
- **D7 / Pipeline-tier representation:** `pipelineTier` Int, computed synchronously, derived `onCriticalPath`, never on status change. Confirmed; initial value `0` set by this spec.
- **D8 / Corpus migration mechanics:** One-time scripted rewrite (this spec's `reconcile-gsd-ids` script). Confirmed.
- **D9 / Dependency discovery:** Active LLM-based discovery pass; `BUG_FACTS` fallback deleted once all findings are graph nodes. Confirmed; `BUG_FACTS` is deprecated (not deleted by this spec) and the discovery pass is out of scope (noted in Further Notes).
- **D10 / Area taxonomy:** ADR-0001 defines A-M, X fixed taxonomy. Confirmed.
- **D11 / Storage/graph technology:** Self-Healing Hybrid (`GraphNode`/`GraphEdge` overlay + Prisma middleware + DLQ + health monitor). Confirmed as follow-up spec (this spec only prepares the schema).
- **G1–G5 / Consumption layer:** Confirmed; this spec enables G6 (`Finding.approvedProposalIndex`) via the schema addition, but does not wire the agent loop.
- **F1 / Finding concretization:** This spec implements the core field (`canonicalId`). Confirmed.
- **F2 / GraphNode/GraphEdge overlay:** Out of scope (follow-up spec). Confirmed in Further Notes.
- **F3 / Discovered-edge exception:** Out of scope but referenced in CONTEXT.md (`dependencyConfidence` field definition). Confirmed.
- **F4 / Sync infrastructure:** Out of scope. Confirmed.
- **F5 / GraphRepository interface:** Out of scope (interface defined in ADR-0003, implementation deferred). Confirmed.
- **F6 / Multi-project namespacing:** Implemented by this spec (`Project.slug`). Confirmed.
- **F7 / Target-repo alignment:** Out of scope. Confirmed.
- **F8 / Agent query interface:** Out of scope. Confirmed.

No internal module interfaces are specified (only the external `reconcile-gsd-ids` CLI interface: `--dry-run`, `--apply`, `--verify`). No file-level implementation details are embedded (the `mapping.json` shape is described in prose, not as code). The prototype reference (`GraphNode` interface from `dependency-graph.ts`) is noted as coming from the existing reader module per ADR-0003, not inlined.

## Testing Decisions

### What makes a good test (testing philosophy)

Only test external behavior: the `reconcile-gsd-ids` script's `--dry-run` output and the `assert-unification` script's assertions. Do NOT test internal functions (the mapping logic, regex parsing, file reading) in isolation — they are implementation details that will change. The seam is the script's public CLI contract (`--dry-run`, `--apply`, `--verify`) and the `mapping.json` + `docs/reconciliation/diff/` artifacts.

### Test seams (two seams — user confirmed)

**Seam 1: Migration script dry-run (`reconcile-gsd-ids --dry-run`).**

This is the highest possible seam — the script's CLI interface and its output artifacts (`mapping.json`, `diff/`). It tests the entire reconciliation logic without touching the DB or source files (idempotent, safe to run in CI).

Tests include:
- Idempotency: `python scripts/reconcile-gsd-ids.py --dry-run` run twice produces byte-identical `docs/reconciliation/mapping.json`.
- Count assertion (G7): `mapping.json` reports `"raw_ids": 107`, `"canonical_ids": 79` (matching BUG-DEPENDENCY-MAP.md §A and superseding the historical 121→77 count from the original plan). The script validates this by cross-referencing `APPENDIX-ID-KEY.md §1.1` (finding namespace ranges) against the `BUG_FACTS` record count (107).
- Collision resolution: `mapping.json` contains `"collision_resolutions"` with entries for the 4 documented collisions (C4, C7, C16, R1) matching `APPENDIX-ID-KEY.md §6` exactly. The test asserts that `gsd:C4` resolves to the finding namespace (not the task namespace), `gsd:C7` resolves to the finding namespace, `gsd:C16` resolves to the finding namespace, and `gsd:R1` does NOT appear as a standalone canonical finding (its content lives under `gsd:A2`, per the governance namespace rules in APPENDIX-ID-KEY.md §3.2).
- Alias chain completeness: `mapping.json`'s `"alias_chains"` includes `gsd:A3` tracing back to `E1`, `E2`, `R4` governance, and `R-09` legacy (per §1.1); `gsd:A2` tracing back to `A14`, `R1` governance, `R-01` legacy; `gsd:B1` tracing back to `B11`; `gsd:A5` tracing back to `LP-F4`. The test asserts that each alias chain's canonical target is consistent with the mapping table.
- No orphans: no canonical ID in `mapping.json` has zero incoming raw IDs; no raw ID is mapped to more than one canonical ID (except alias chains, where multiple raw IDs map to one canonical — that is the intended behavior, validated separately).
- MAPA 2.0 reconciliation: `mapping.json`'s `"mapa_2_0_remap"` contains the 8 reconciled labels (C1→A3, C2→A2, C5→C1, C7→D1, C8→A5, C9→C4, H14→E5, L5→E23) matching `APPENDIX-ID-KEY.md §7`.
- Idempotency / reversibility: the `--apply` run writes `docs/reconciliation/diff/*.patch` files showing the substitution rules applied to each of the 10 published `.md` files. The test asserts that applying the patches produces files whose ID usage is consistent with `mapping.json`.

**Prior art for this test:** The reader's existing `dependency-graph.ts` module uses `parseGraphSource()` (Zod validation + referential integrity checks) that throws `GraphValidationError`. The migration script's validation logic should reuse this pattern: bad mapping data (duplicate canonical IDs, orphaned raw IDs, invalid series letters) throws a typed error (`ReconciliationError`), not a silent failure. The test asserts that feeding deliberately corrupt data (e.g., mapping `C4` to both finding and task namespaces simultaneously) raises the error.

**Seam 2: Schema migration (`assert-unification` — DB-level assertion).**

This tests the schema changes (F1: `Finding.canonicalId`, `Project.slug`; removal of `findingIds`, `dependsOn`) independently of the script. It asserts the DB state after migration.

Tests include:
- Schema assertion: after the Prisma migration runs (`prisma migrate dev` or `prisma db push`), the `Finding` model has the new fields (`canonicalId` non-null with unique constraint, `approvedProposalIndex` nullable, `task` nullable, no `findingIds` column, no `dependsOn` column) and the `Project` model has `slug` (unique, non-null).
- Count assertion (post-DB load): after loading the `mapping.json` data into the DB (a separate test fixture load), the number of `Finding` rows equals the number of canonical IDs in `mapping.json` (79), and each has a `canonicalId` matching the format `{project.slug}:{series}{number}`.
- No orphan `GraphNode`: this is deferred to the follow-up spec (`GraphNode` table does not exist yet), but the test asserts that when `GraphNode` exists (simulated via a mock table in the test fixture), every `GraphNode.canonicalId` references an existing `Finding.canonicalId`.
- G3 independence: the test asserts that `Finding.verificationStatus` remains unchanged during ID reconciliation (the reconciliation does not modify verification status, only identity mapping).

**Prior art for this test:** The Dashboard's existing `prisma/schema.prisma` defines `Project`, `Finding`, `Proposal`, etc. The test uses `prisma/client` queries (as the Dashboard's source code does) rather than raw SQL — this respects the existing data-access pattern and avoids testing implementation details.

### Out of scope for testing (explicit exclusions)

- The agent loop (`G3` agent job, `G4` prioritization, `G5` autonomy boundary, `G8` agent query interface) — out of scope for this spec.
- The dependency-discovery LLM pass (`D9`) — out of scope; the spec defines `dependencyConfidence` values (`"documented"`, `"discovered"`) but does not implement the LLM pass that generates discovered edges.
- The full `GraphRepository` interface (`F5`) — out of scope; the interface shape is documented in ADR-0003 but its implementation and the CPM algorithm for `onCriticalPath` are deferred.
- The sync middleware (`F4`: `DomainEvent`, `DeadLetterQueue`, health check) — out of scope.
- The `BUG_FACTS` static JSON export mechanism (replacing `bug-facts.ts`) — out of scope; the reconciliation script notes it in the `docs/reconciliation/bug-facts-replacement-plan.md` artifact but does not implement it.
- The discovery confirmation UX (`F3`: popup approve/reject for discovered edges) — out of scope but noted in CONTEXT.md.
- The `pipelineTier` computation — this spec sets `pipelineTier = 0` initially; the DP longest-distance computation that updates it synchronously on graph mutations is deferred to the agent loop / `GraphRepository` spec.
- The `DomainEvent` row shape — deferred; this spec does not define event emission rules.

### Further notes (from the user's original vision and the session's resolved work)

This spec is the **first implementation spec** derived from the `/grilling` session (domain modeling using `/domain-modeling` skill) that produced `CONTEXT.md` (16 terms) and ADR-0001 through ADR-0006. The `grill-with-docs` session confirmed the domain model, sharpened fuzzy language (`Finding` vs `Task` vs `Canonical ID` vs `Series letter`), and resolved tensions (D3 atomic unit = finding not task, D4 opaque IDs, D7 pipelineTier derived, D8 one-time rewrite, D9 active discovery, D11 self-healing hybrid). The `to-spec` skill requires no user interview — the conversation context (the user's decision log, the APPENDIX-ID-KEY.md data archaeology, the schema inspection, the 5 resolved questions about graph editor UX / dependsOn fate / count source / data access / discovery method) provides sufficient synthesis material.

The `docs/agents/` setup (issue tracker = GitHub via `gh` with `GH_TOKEN`, triage labels = 5 canonical roles, domain docs = single-context `CONTEXT.md` + `docs/adr/`) is complete. This spec will be published to GitHub Issues on `HansChucrute14/Hans_Metaharness` with the `ready-for-agent` label.

The `pipelineTier = 0` placeholder is explicitly called out as a deferred computation; the agent loop (G1–G5, F1–F7) depends on the `GraphRepository` interface and the computed `pipelineTier`; this separation ensures this spec's scope remains bounded (ID reconciliation + schema migration only) without over-committing to unready agent-workflow features.

The user's confirmation of the two test seams (dry-run + schema migration) is recorded; the spec does not propose additional seams (following the skill's instruction: "fewer seams — ideal number is one"; the user explicitly added a second for schema coverage, which is the total).
