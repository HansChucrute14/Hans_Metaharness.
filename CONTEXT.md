# Metaharness

The structural substrate for agentic-AI reasoning over a personal knowledge graph spanning life, work, projects, and future plans. The GSD audit unification is this system's first concrete instantiation.

## Language

### System scope

**Metaharness**:
The overarching system that unifies multiple project-audit tools (Consolidated Reader, Audit Dashboard) under one canonical schema, one ID system, and one graph overlay. Not to be confused with any single app within it.

**Target project**:
The external repository being audited (e.g., `Hans-GSD-Raw-Calculator`). The metaharness does not own or modify the target; it observes, analyzes, and tracks fixes.
_Avoid_: Source repo, audited repo

### Data models

**Finding**:
A single, atomic defect or issue in the target project. Each Finding has one canonical ID, one title, one set of dependency edges, and optionally links to proposals and solutions.
_Avoid_: Task, bug report (Finding is the atomic unit; a task is a legacy grouping concept)

**Canonical ID**:
An opaque, persistent, project-scoped identifier of the form `{project}:{series}{number}` (e.g., `gsd:C7`). Stable for the lifetime of the Finding — severity, pipeline tier, and other mutable properties are stored separately, not encoded in the ID.

**Series letter**:
A fixed, project-agnostic taxonomy of issue area: A=Architecture, B=Data & Schema, C=Data Quality, D=Data Pipeline, E=Validation & Logic, F=API & Integration, G=UI/UX, H=Testing & QA, I=Build & Tooling, J=Infra & DevOps, K=Security, L=Performance, M=Documentation, X=Cross-cutting. Same meaning in every project.

### Legacy ID namespaces (GSD-specific, to be reconciled)

**Finding namespace**:
The systematic-review IDs (A1–A20, B1–B18, C1–C22, D1–D22, E1–E25). Each finding also carries a raw reviewer-stream tag (LP-F*, NUTR-F*, DATA-F*, VAL-F*, F-CONTRACT-*, F-ARCH-*, F-TYPE-*, F-CLI-*, F-TEST-*, F-CII-*, F-DOC-*, F-PKG-*). Total raw finding IDs: 107.

**Task namespace**:
The remediation program IDs (B0–B12, C1–C16 as tasks, R1–R5 as regression tasks, P0-1 through P0-10 as the monotonically-numbered plan that maps non-monotonically to B-series). Total: 35 formal tasks + 12 P2/P3 debt items.

**Legacy/governance namespace**:
Three legacy R/F/D namespaces: `R-01…R-09` (REVIEW.md bug IDs), governance `R1…R7` (validation-current-state.md deviations), amendment legacy `F1…F6, D1…D2`.

**MAPA 2.0 labels**:
Compact Portuguese-synthesis labels (C1–C9, H14, L5) that collided with the systematic review's C-series. All reconciled to canonical IDs in `APPENDIX-ID-KEY.md §7` (e.g., MAPA C7 → D1).

**ID collapse (GSD corpus)**:
107 raw finding IDs deduplicate to **79 unique defects** (per BUG-DEPENDENCY-MAP §A). Reconciliation rules are codified in `APPENDIX-ID-KEY.md §6` for the 4 documented collisions (C4, C7, C16, R1) and 8 additional namespace overlaps (C1, C2, C5, C9, B1, B2, B5, B7) resolvable by context. The plan's historical "121→77" count is superseded by the post-AUDIT_DELTA 107→79 count.
_Avoid_: 121→77 (stale pre-AUDIT_DELTA count)

**Proposal**:
A proposed solution for a Finding, carrying an effort/risk/reversible assessment. A Finding may have multiple Proposals.

**UnifiedExecutionModule**:
A cross-finding grouping that bundles multiple related Findings under one module for coordinated resolution. The single place where multiple Finding IDs get grouped.

### Graph model

**GraphNode**:
A node in the dependency graph. One-to-one with Finding via the canonical ID. Carries `pipelineTier` (computed) and `dependencyConfidence` ("documented" or "discovered").

**GraphEdge**:
A directed dependency edge between two GraphNodes. Default kind is `blockedBy` — the target node is blocked by the source node.

**pipelineTier**:
The computed topological distance of a GraphNode from the root of its project's dependency graph (DP longest-distance algorithm). Recomputed automatically on every graph mutation. Determines dispatch order.

**dependencyConfidence**:
Whether a GraphNode's dependency edges were author-documented ("documented") or found by automated discovery ("discovered"). Discovered edges require one human confirmation before they are trusted for auto-merge.

**Shared graph library**:
A single code module (portable between apps) containing the graph data model, validation (Zod), auto-layout (Kahn's algorithm), and query interface (`getUnblocked`, `getGraph`, etc.). Both the Consolidated Reader and Audit Dashboard import it.

### Data flow

**Source of truth**:
The DB-backed side (Audit Dashboard's Prisma/SQLite). The Consolidated Reader is presentation-only for the graph and findings; it does not own pipeline state. Both apps point to the same SQLite file via their Prisma client. The reader is read-only.

**Flat files**:
The Consolidated Reader's `consolidated-docs/` files are a rendered export of the DB, not the primary data store. Editing the DB regenerates them.

**BUG-DEPENDENCY-MAP.md**:
A version-controlled YAML export of the DB's graph state. Generated from the DB, checked into git, and human-editable. Editing the YAML and running a validated import (reusing the reader's Zod schema + fail-closed pattern) writes changes back to the DB. The DB always wins on conflict; the YAML carries a provenance header (`# Generated from DB:` or `# Edited manually — pending sync`).

### Decision gates

**Decision gate (G-series)**:
A policy fork the codebase cannot resolve itself. GSD has three: G1 (antagonisms hard vs soft — RESOLVED: hard at L1), G2 (objective_weights.json wire in vs delete — RESOLVED: delete), G3 (numeric safety values pending vet sign-off — PENDING, the only non-engineering gate, the single project bottleneck). Blocks specific tasks but not findings.

**G3 vs namespace C4**:
G3 blocks **Task C4** (SUL verification for Cu/Fe/I/Mn/Zn) and tasks B3, B4, B2b-thresholds — all of which require vet-verified numeric values. G3 does NOT block the fix for **Finding C4** (orphaned `lp_parameters.schema.json`, repaired by tasks C5/C9). The task-vs-finding C4 disambiguation is in `APPENDIX-ID-KEY.md §6`.

### Agent workflow

**OpencodeAction status machine**:
A single OpencodeAction row progresses through states: `queued` → `implementing` → `pr_open` → `testing` → `merging` → `completed` / `failed`. Each transition is a `status` update on the same row.

**Autonomy boundary**:
The agent only implements pre-approved solutions (where `Finding.approvedProposalIndex` is non-null). The judgment call (which solution is correct) happens upstream at proposal-review time. Auto-merge on green is uniform, except where `dependencyConfidence = "discovered"` edges trigger a human confirmation hold.

### Critical path

**onCriticalPath**:
Derived via the full Critical Path algorithm (CPM) plus an LLM confirmation loop. Not manually set. The shared graph library computes it from the graph topology and confirms/refines it via LLM analysis of Finding text.
