# GSD ID reconciliation: 107 raw IDs → 79 canonical IDs, with documented disambiguation rules

## Status

Accepted

## Context

The GSD audit corpus accumulated four overlapping ID namespaces across two apps:

1. **Finding namespace** (systematic review): A1–A20, B1–B18, C1–C22, D1–D22, E1–E25 = 107 raw finding IDs (per BUG-DEPENDENCY-MAP §A, post-AUDIT_DELTA).
2. **Task namespace** (remediation plan): B0–B12, C1–C16 (as tasks), R1–R5 (regression), P0-1…P0-10.
3. **Legacy/governance namespace**: R-01…R-09 (REVIEW.md), governance R1…R7 (validation-current-state.md), amendment F1–F6 / D1–D2.
4. **MAPA 2.0 labels** (Portuguese synthesis): C1–C9, H14, L5.

These namespaces share prefixes (B, C, R, D, F), causing the same literal ID (e.g., `C7`, `R1`) to mean different things in different documents. The plan's historical "121 raw IDs → 77 unique defects" was from a pre-AUDIT_DELTA baseline; the current authoritative count is **107 raw finding IDs → 79 unique defects**.

## Decision

Build a one-time mapping table that assigns every legacy ID (across all four namespaces) to a single canonical ID of the form `{project}:{series}{number}` per ADR-0004. The mapping is deterministic, traced to `APPENDIX-ID-KEY.md`, and verified by the G7 count assertion.

### The 4 documented collisions (APPENDIX-ID-KEY.md §A.0)

| Literal | Finding meaning | Task/legacy meaning | Resolution rule |
|---|---|---|---|
| **C4** | `lp_parameters.schema.json` orphaned (DATA-F4, P0 Critical) | SUL verification for Cu/Fe/I/Mn/Zn (P1 task, blocked by G3+vet) | `gsd:C4` = the **finding**. The task is renamed (it's no longer C4 in the canonical scheme). G3 blocks the task, not the finding's fix (which is C5/C9). |
| **C7** | Unit not bound to nutrient key (DATA-F7, P1) | D3 empty-200 validation fix (Phase-2 task) | `gsd:C7` = the **finding**. The task is renamed. "Task C7 repairs D3" no longer reads as `gsd:C7`. |
| **C16** | Mojibake in display names (DATA-F16, P2) | Dead floor-relaxation doc + file-handle leak (Phase-2 task) | `gsd:C16` = the **finding**. The task is renamed. |
| **R1** | Governance: mineral antagonism slack (= A2) | Regression: replace tautological tests | Legacy R-01 (with dash) = A2. The regression task is renamed; the governance deviation is folded into A2's canonical record; `gsd:R1` does not exist as a standalone canonical ID — its semantic content lives under `gsd:A2`. |

### The 8 additional namespace overlaps (resolvable by document context)

| Literal | Overlap | Resolution |
|---|---|---|
| C1, C2, C5, C9 | Finding (Part 1/Part 3) vs Task ID (Part 2 §6/§7) | `gsd:C1` etc. = the **finding**. Tasks renamed (the rewrite pass replaces `C1` in Part 2 task-columns with the renamed task ID). |
| B1, B2, B5, B7 | Finding (Part 1) vs Task (Part 2 §5.2; B2 always carries a/b suffix as task) | `gsd:B1` etc. = the **finding**. Tasks like `B2a`/`B2b` keep their suffix letter as a task-only namespace (not a canonical Finding ID — they map to the parent finding). |

### MAPA 2.0 label reconciliation (APPENDIX-ID-KEY.md §7)

All MAPA 2.0 labels collapse to canonical IDs:
- MAPA C1 → `gsd:A3`
- MAPA C2 → `gsd:A2`
- MAPA C5 → `gsd:C1`
- MAPA C7 → `gsd:D1`
- MAPA C8 → `gsd:A5`
- MAPA C9 → `gsd:C4`
- MAPA H14 → `gsd:E5`
- MAPA L5 → `gsd:E23`

### Alias chains (APPENDIX-ID-KEY.md §1.1)

Critical findings with multiple historical IDs:
- `gsd:A3` ← E1, E2, R4 governance, R-09 legacy (fake output)
- `gsd:A2` ← A14, R1 governance, R-01 legacy (soft antagonisms)
- `gsd:B1` ← B11 (NUTR-F2) (growth energy)
- `gsd:A5` ← LP-F4 (critical→high severity downgrade)

## Considered options

- **Preserve all legacy IDs in the canonical ID itself (e.g., `gsd:A2+A14+R1`).** Rejected — IDs become fragile and unstable (alias chains change over time); violates ADR-0004's opaque-ID principle.
- **Adopt one namespace wholesale (e.g., the finding namespace) and ignore the others.** Rejected — the task namespace has different work items that don't map 1:1 to findings, and the governance/deviation namespace captures distinct information.
- **Build a one-time mapping table with documented disambiguation rules; rewrite the corpus once.** Chosen — the legacy mess is a one-project, one-time artifact (D8 in the plan); future projects never accumulate it.

## Consequences

- The D8 scripted corpus rewrite runs over the 10 published files in `consolidated-docs/` plus `bug-facts.ts` and the Dashboard's `Finding.task` field, replacing legacy IDs with the canonical form.
- The G7 count assertion checks: 107 raw → 79 canonical, no orphans, every canonical traces back to ≥1 raw.
- The 4 collision hand-key (`APPENDIX-ID-KEY.md §6`) is preserved as the human-readable reference even after migration — it documents *why* each collision was resolved the way it was.
- The `ID_MATCHERS` regex in the reader's graph code collapses from a 7-pattern disambiguator to a single canonical-ID pattern (per D8 in the plan).
- Future projects never need this pass — they start with canonical IDs from day one.

## Open items

- The exact mapping for each of the 79 canonical IDs to its raw IDs is authored in the migration script (step 3 of the implementation kickoff), validated by G7's count assertion, and reviewed as a diff before the D8 rewrite of the 10 published files.
- The task-only namespace (B0–B12, C1–C16, R1–R5) does not become canonical Finding IDs — it becomes the `UnifiedExecutionModule.addresses` field, which is the sole grouping mechanism (D3 in the plan). Tasks become executable modules, not findings.
