# APPENDIX — Global ID Key

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Role:** A standalone reference appendix to the four-part consolidated documentation set (Part 1 Diagnosis, Part 2 Treatment, Part 3 Synthesis, Part 4 Meta-Critique). This document maps every identifier namespace used anywhere in the consolidated set to its referent, and disambiguates the collisions that arise because multiple namespaces share the same prefixes (`B`, `C`, `R`, `D`, `F`).

**How to use this key.** If you encounter an ID in any of the four parts and are unsure what it refers to, find its namespace below. Where the same literal ID (e.g. `C7`, `R1`) means different things in different namespaces, the collision is called out explicitly in §6 with guidance on how to resolve it from context.

---

## §1. The Finding Namespace (Systematic Review)

The primary finding namespace comes from the five-reviewer systematic adversarial review. Each finding has a stable ID, a severity (Critical / High / Medium / Low), a priority (P0 / P1 / P2 / P3), a location (file:line), a root cause, evidence, an impact, and a fix. Findings are prefixed by the subsystem that owns them:

| Prefix | Subsystem | Range | Part 1 section |
|--------|-----------|-------|----------------|
| **A** | LP / OR solver | A1–A20 | §3 (LP Solver) |
| **B** | Canine Nutrition | B1–B18 | §4 (Canine Nutrition) |
| **C** | Data Modeling / JSON Schema | C1–C22 | §5 (Ingredient Database) |
| **D** | Validation Pipeline | D1–D22 | §6 (Validation Pipeline) |
| **E** | Cross-cutting Architecture / Tests / CLI | E1–E23 | §7 (Output Contract / Tests / Tooling) |

### 1.1 The Critical findings (P0), with aliases

Several Critical findings carry multiple IDs because they were identified independently by more than one reviewer stream, or because they overlap with legacy bug IDs. The master priority table (Part 1 §10.1) deduplicates these into single rows:

| Canonical ID | Aliases | Defect (one-line) |
|---|---|---|
| **A3** | E1 (F-CONTRACT-1), E2, R4 (legacy) | `nutrient_results` hardcoded `"adequate"` with null gaps — the fake output layer |
| **A2** | A14 (LP-F14), R1 (governance) | Antagonism constraints declared `HARD_FAIL_INFEASIBLE` but soft at every cascade level |
| **B2** | — | No absolute calcium maximum (DOD safeguard for large-breed growth) |
| **B1** | B11 (NUTR-F2) | Flat `k = 1.2 × RER` growth-energy multiplier; scenario labels inverted |
| **C1** | — (DATA-F1) | DB fails own schema (21 errors); no CI gate |
| **C2 / C3 / C5 / C7** | DATA-F2 / F3 / F5 / F7 | No canonical nutrient namespace; typo-blind; duplicate conflicting units (Mg 20.5 vs 5.0); unit not bound to key |
| **C4** | — (DATA-F4) | `lp_parameters.schema.json` orphaned (validates no real file); config unschema'd |
| **D1** | — (VAL-F1) | `validators/_shared.py` missing → validation package cannot import |
| **A5** | — (LP-F4) | `objective_weights.json` unused by the LP (severity: Critical→High; see §5 below) |
| **A1** | — (LP-F1) | Lexicographic stage order inverted (L1/L2) |

### 1.2 The raw reviewer IDs (F-prefixed)

Underneath the A/B/C/D/E deduplication, each finding preserves its raw reviewer-stream ID, shown in parentheses at first mention. These are:

| Raw prefix | Reviewer stream | Example |
|---|---|---|
| `LP-F*` | LP / OR reviewer | LP-F2 = A2 (soft antagonisms) |
| `NUTR-F*` | Canine Nutrition reviewer | NUTR-F1 = B1 (flat growth energy) |
| `DATA-F*` | Data Modeling reviewer | DATA-F1 = C1 (DB schema failure) |
| `VAL-F*` | Validation Pipeline reviewer | VAL-F1 = D1 (_shared.py missing) |
| `F-CONTRACT-*` | Output-contract findings | F-CONTRACT-1 = A3/E1 (fake output) |
| `F-ARCH-*` | Architectural findings | F-ARCH-4 = E12 (god module) |
| `F-TYPE-*` | Type-system findings | F-TYPE-1 = E13 (TypedDict total=False) |
| `F-CLI-*` | CLI findings | F-CLI-1 = E15 (no argparse) |
| `F-TEST-*` | Test findings | F-TEST-1 = E5 (timeout stub) |
| `F-CII-*` | CI / packaging findings | F-CII-1 = E6 (no schema gate) |
| `F-DOC-*` | Documentation findings | F-DOC-1 = E11 (doc-gen bulk) |

These raw IDs are preserved for traceability to the original reviewer streams but are not the primary reference; the A/B/C/D/E canonical IDs are.

---

## §2. The Task Namespace

The remediation program (Part 2) uses three task sub-namespaces, each corresponding to an execution phase. **These are TASK IDs, not finding IDs** — they describe work to be done, not defects found.

### 2.1 Phase-1 blocker / safety tasks (B-series)

| Task ID | Source | What it is | Target finding(s) |
|---|---|---|---|
| **B0** | Safety freeze | Force `DO_NOT_FEED` while defects are uncorrected | A3, A2, B2, C1, D1 (interim containment) |
| **B1** | P0-1 | Real reporting layer (fixes fake output) | A3 / E1 |
| **B2a** | P0-2a (amendment split) | Harden mineral antagonisms at Level 1 | A2 / A14 / R1 |
| **B2b** | P0-2b (amendment split) | Severity-scaled feeding recommendation | A2 (severity visibility) |
| **B3** | P0-3 | Absolute Ca/P ceilings | B2, B3 |
| **B4** | P0-4 | Growth-energy curve (age-banded) | B1 / B11 |
| **B5** | P0-8 | Restore `validators/_shared.py` | D1 |
| **B6** | P0-6 | CI schema gate | C1, C4 (E6) |
| **B7** | P0-5 | Canonical nutrient registry | C2, C3, C5, C7, B18, C6 |
| **B8** | P0-7 | SUL verification + correction | B6–B10, B17 |
| **B9** | P0-9 | Delete `objective_weights.json` | A5 (G2 resolution) |
| **B10** | P0-10 | Lexicographic stage-order fix | A1 |
| **B11** | Amendment (new) | Level-1 infeasibility diagnosis (IIS) | B-i (amendment finding) |
| **B12** | Amendment (new, reframed) | Confirm B1 fixes arginine display (originally: relocate arginine key — unnecessary) | §8 of Part 3 |

### 2.2 Phase-2 hardening tasks (C-series, Part 2 §6 / §7)

`C1` through `C16` are **task** IDs in Part 2's Phase-2 hardening lane. They are distinct from the finding-namespace C-series (§1 above) despite sharing the prefix. Examples: Task C1 = normalize antagonism penalty units; Task C5 = correct the ingredient-bank schema; Task C9 = correct the orphaned LP-parameters schema. The collision is disambiguated in §6 below.

### 2.3 Phase-3 regression tasks (R-series, Part 2 §8)

`R1` through `R5` are **regression-test** task IDs in Part 2's Phase-3 lane: R1 = replace tautological tests; R2 = fix audit-test-result theater; R3 = real lexicographic-dominance proof + real timeout test; R4 = deterministic replay + regression fixtures; R5 = cleanup deletions + manual mutation spot-check. These are distinct from the governance R-series and the legacy R-series (§3, §6).

### 2.4 The P0-N cross-mapping

The detailed remediation plan uses a `P0-1 … P0-10` numbering that maps non-monotonically to the B-series:

| P0-N | B-series | Defect cluster |
|---|---|---|
| P0-1 | B1 | Fake output (A3) |
| P0-2 | B2a / B2b | Soft antagonisms (A2) |
| P0-3 | B3 | No Ca ceiling (B2) |
| P0-4 | B4 | Growth energy (B1/B11) |
| P0-5 | B7 | Canonical namespace (C2/C3/C5/C7) |
| P0-6 | B6 | CI schema gate (C1/C4) |
| P0-7 | B8 | SUL verification (B6–B10) |
| P0-8 | B5 | Restore _shared.py (D1) |
| P0-9 | B9 | Delete objective_weights (A5) |
| P0-10 | B10 | Stage order (A1) |

Note the non-monotonicity: B5 ↔ P0-8, B6 ↔ P0-6, B7 ↔ P0-5, B8 ↔ P0-7. When citing a task, prefer the B-series ID (used in Part 2's canonical catalog) and add the P0-N in parentheses on first mention if the remediation plan's sequencing is relevant.

---

## §3. The Legacy and Governance Namespace

Three additional R/F/D namespaces exist for historical and governance reasons:

### 3.1 Legacy REVIEW.md bug IDs: `R-01 … R-09`

These are the project's own self-tracked bug IDs from an earlier `REVIEW.md` file. They predate the systematic review. The systematic review's §8 reconciliation table and Part 1 §7.7 map them to the canonical finding IDs. Notable: R-04 / R-09 = the nutrient-results placeholder = A3; R-06 = debug prints = E23; R-01 = mineral antagonisms = A2.

### 3.2 Governance deviation IDs: `R1 … R7` (validation-current-state.md)

These track known deviations from declared governance rules in the validation layer: R1 = mineral antagonisms unbounded slack (same as A2); R2 = fixed; R3 = fixed; R4 = incomplete (nutrient_results nulls); R5 = temporary (_MIN forced adequacy_soft); R6 = noise; R7 = verified. **R1, R4, R5 here are governance deviations, not regression tasks and not legacy bugs** — see §6 for the collision.

### 3.3 Amendment legacy IDs: `F1 … F6, D1 … D2`

The G1 amendment references a small set of legacy IDs (F1–F6 amendment list, D1–D2) that overlap with the systematic review's D-series. These are preserved in Part 2 §1 (gate context) for traceability but are not the primary reference.

---

## §4. The Decision Gates: `G1, G2, G3`

Three Phase-1 decision gates surface policy forks the codebase cannot resolve itself. Each is recorded below in ADR-style (context, decision, status, consequences, provenance) so that a future maintainer can revisit the reasoning, not just the outcome.

### G1 — Mineral antagonisms: hard vs. soft

- **Context.** `constraints.json` declares `solver_behavior: HARD_FAIL_INFEASIBLE` for the 5 mineral-antagonism constraints (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg), but `solver.py:425–477` implements them as slack-penalized soft constraints (unpenalized in Levels 2/3). The config↔code contradiction is the root of finding A2 (Part 1 §A.A2).
- **Decision.** **HARD, at Level 1.** Enforce the 5 antagonism constraints as hard infeasibility at Level 1 (violation ⇒ infeasible ⇒ `DO_NOT_FEED`); keep penalized + exposed slack in Levels 2/3.
- **Status.** Accepted.
- **Consequences.** Unblocks Task B2a (harden antagonisms at Level 1) immediately. Side effect: some high-bone selections that currently return `SAFE_TO_FEED` at Level 2 will become infeasible at Level 1 — the tool gets safer, not broken.
- **Provenance.** User-confirmed 2026-07-25 (recommended default). Config declares `HARD_FAIL_INFEASIBLE`; hardening is free today (Level 1 is structurally unreachable — Part 3 §3.3), truthful, and future-proofs `SAFE_TO_FEED`. See Part 2 §1 (Gate G1).

### G2 — `objective_weights.json`: delete vs. wire-in

- **Context.** `objective_weights.json` (322 lines, 29 penalty entries) is documented as governing the LP objective, but `grep -c objective_weights src/gsd/solver.py` → `0` (verified by execution — see `APPENDIX-VERIFICATION-LOG.md` §2.5). The solver uses `CRITICALITY_WEIGHT` (`solver.py:17`) as the real objective.
- **Decision.** **DELETE.** Remove `objective_weights.json` and its loaders; document the real `CRITICALITY_WEIGHT` objective.
- **Status.** Accepted (resolved by default).
- **Consequences.** Unblocks Task B9 (delete the file). Removes a maintenance trap where readers believe the elaborate weight file governs the objective when it does not.
- **Provenance.** Resolved by YAGNI/DTSTTCPW default — dead config; the solver references it zero times. See Part 2 §1 (Gate G2).

### G3 — Numeric safety values: Ca/P ceilings, growth curve, SULs, severity thresholds

- **Context.** The safety-critical numeric values in the system (absolute Ca ceiling, growth-energy taper, Cu/Fe/I/Mn/Zn SULs, severity thresholds for B2b) are not verified against primary sources. Findings B2 (no Ca max), B1/B11 (flat growth energy), and B6–B10 (SULs needing verification) all depend on these values.
- **Decision.** **PENDING.** Use commonly-cited defaults as verify-first placeholders; confirm against AAFCO/NRC/FEDIAF primary sources + veterinary review before merge.
- **Status.** Pending — the only gate outside engineering control.
- **Consequences.** Blocks Task B3 (Ca/P ceilings), B4 (growth-energy curve), and B2b (severity-scaled recommendation thresholds) until verified. This is the project's single bottleneck (Part 3 §6): every other workstream can proceed, but the safety-critical numeric layer cannot ship until G3 is resolved.
- **Provenance.** Verify-first gate, not a user decision. Requires primary-source verification (AAFCO, NRC 2006, FEDIAF) + board-certified veterinary nutritionist (DACVN/ECVCN) sign-off. See Part 2 §1 (Gate G3); Part 3 §6 (the bottleneck).

---

## §5. Severity Conventions

- **Critical / High / Medium / Low** — the finding's severity, reflecting the potential impact on the dog's safety and on the system's trustworthiness.
- **P0 / P1 / P2 / P3** — the remediation priority, reflecting the order in which fixes must ship. P0 = safety/blocker; P1 = correctness hardening; P2 = medium debt; P3 = low debt.
- **The "Critical→High" marker on A5** is the sole severity downgrade in the catalog. A5 was rated Critical in the initial review pass and downgraded to High (the `objective_weights.json` wiring gap is a trustworthiness defect, not a direct safety failure on the order of the triad A2 + A3 + B2), while retaining P0 priority. The "9 Critical" headline in Part 1 §1 reflects A5 at its original Critical rating; the downgrade is recorded in Part 1 §10.1's master priority table for accuracy.
- **Grouped severity** — in the master priority table, several findings are grouped under one severity (e.g. `C2 / C3 / C5 / C7` grouped as Critical). The grouped severity reflects the collective impact of the cluster; individual members may carry a lower severity in their own finding headers (e.g. C7 the data finding is High in its own header, Critical when grouped). This is a defensible editorial convention, not an inconsistency.

---

## §6. Cross-Namespace Collision Disambiguation

The same literal ID can mean different things in different namespaces. The table below lists every collision and how to resolve it from context.

| Literal ID | Namespace 1 (meaning) | Namespace 2 (meaning) | Namespace 3 (meaning) | How to disambiguate |
|---|---|---|---|---|
| **C1** | Finding: DB fails own schema (Critical, §A.C1) | Task: normalize antagonism penalty units (Part 2 §6) | — | Findings appear in Part 1 / Part 3; tasks appear in Part 2 §6–§7. Context: "finding C1" vs "Task C1." |
| **C2** | Finding: no canonical nutrient namespace (§A.C2) | Task: honest solver-status taxonomy (Part 2 §6) | — | Same as above. |
| **C5** | Finding: duplicate conflicting units (§A.C5) | Task: correct ingredient-bank schema (Part 2 §6) | — | Same as above. |
| **C7** | Finding: unit not bound to key (§A.C7, DATA-F7) | Task: (Phase-2 hardening, Part 2 §6) | MAPA 2.0 label for D1 (now reconciled — see §7) | The MAPA 2.0 label has been eliminated from Part 3; "C7" now consistently means the data finding. |
| **C9** | Finding: BOM × 2 files unloadable (§A.C9) | Task: correct orphaned LP-parameters schema (Part 2 §6) | — | Same as C1/C2 above. |
| **D1** | Finding: _shared.py missing (§A.D1, VAL-F1) | Amendment legacy ID (§3.3) | — | The amendment legacy D1–D2 is preserved only in Part 2 §1 gate context; elsewhere D1 = the _shared.py finding. |
| **R1** | Finding/governance: mineral antagonisms unbounded slack (= A2) | Task: replace tautological tests (Part 2 §8, Phase-3 regression) | Legacy R-01 (different format, no dash) | R1 with no dash = governance or regression-task; R-01 with dash = legacy. Governance R1 appears in Part 1 §2.8/§8.7; regression R1 appears in Part 2 §8. |
| **R4** | Governance: nutrient_results incomplete (= A3) | Task: deterministic replay fixtures (Part 2 §8) | Legacy R-04 / R-09 (nutrient placeholder) | Same as R1. |
| **R5** | Governance: _MIN forced adequacy_soft | Task: cleanup deletions (Part 2 §8) | Legacy R-05 | Same as R1. |
| **B1** | Finding: flat growth energy (§A.B1, NUTR-F1) | Task: real reporting layer (Part 2 §5.2) | — | Findings in Part 1; tasks in Part 2. "Finding B1" vs "Task B1." |
| **B2** | Finding: no Ca max (§A.B2) | Task: B2a/B2b (split, Part 2 §9.3) | — | The task is always written B2a or B2b (with suffix); the finding is B2 (no suffix). |
| **B5** | Finding: no age tapering (§A.B5) | Task: restore _shared.py (Part 2 §5.2) | — | Same as B1. |
| **B7** | Finding: Cu SUL too permissive (§A.B7) | Task: canonical nutrient registry (Part 2 §5.2) | — | Same as B1. |

**Rule of thumb:** if the ID appears in Part 1 or Part 3, it is a finding. If it appears in Part 2 §5–§9, it is a task. If it appears in Part 2 §8, an R-prefixed ID is a regression task. If it appears in Part 1 §2.8 or §8.7, an R-prefixed ID is a governance deviation. Legacy IDs always carry a dash (`R-01`) or are explicitly labeled as legacy.

---

## §7. MAPA 2.0 Label Reconciliation

The MAPA 2.0 verification pass (a Portuguese synthesis document that fed Part 3) used a compact local labeling (C1–C9, H14, L5) for the findings it confirmed by execution. These labels collided with the systematic review's canonical C-series. Part 3 has been standardized to use the canonical IDs throughout; the MAPA 2.0 labels are preserved here for traceability to the original verification pass.

| MAPA 2.0 label | Canonical ID | Defect | Verification method |
|---|---|---|---|
| C1 | **A3** | `nutrient_results` hardcoded "adequate" | Ran `solve_cascade()`; inspected live output |
| C2 | **A2** | Antagonism constraints soft | `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` → 60 |
| C5 | **C1** | DB fails own schema (21 errors) | `jsonschema.Draft202012Validator` live |
| C7 | **D1** | `_shared.py` missing → package unimportable | `import gsd.validation.pipeline.orchestrator` → `ModuleNotFoundError` |
| C8 | **A5** | `objective_weights.json` dead | `grep -c objective_weights src/gsd/solver.py` → 0 |
| C9 | **C4** | `lp_parameters.schema.json` orphaned | Validated data against schema → 3 errors |
| H14 | **E5** | Timeout test is a stub | Read test body; never invokes solver |
| L5 | **E23** | `[DEBUG]` prints in stdout | Inspected real solver output; 40+ lines of noise |

A reader who encounters any of the MAPA 2.0 labels in the original Portuguese source documents should use this table to map them to the canonical IDs used throughout the consolidated set.

---

## §8. Quick-Reference: Finding → Task → Synthesis Chain

For the P0 (Critical) findings, the chain from diagnosis (Part 1) to treatment (Part 2) to synthesis (Part 3) is complete and traceable:

| Finding (Part 1) | Task (Part 2) | Synthesis (Part 3) |
|---|---|---|
| A3 (fake output) | B1 (real reporting layer) | §1 verdict, §3.1, §5.2, §8 |
| A2 (soft antagonisms) | B2a (harden) + B2b (severity) | §1 verdict, §3.1, §5.1, §5.2 |
| B2 (no Ca max) | B3 (Ca/P ceilings) | §3.4, §5.3 (G3-dependent) |
| B1/B11 (growth energy) | B4 (age-banded curve) | §3.4, §5.3 (G3-dependent) |
| C1 (DB schema) | B6 (CI gate) + C5 (schema fix) | §3.1, §3.4, §5.1, §5.4 |
| C2/C3/C5/C7 (namespace) | B7 (canonical registry) | §3.2, §5.4 |
| C4 (orphaned schema) | C9 (schema fix) | §3.1, §5.4 |
| D1 (_shared.py) | B5 (restore file) | §3.4, §5.1, §9 (CI red today) |
| A5 (objective_weights) | B9 / G2 (delete) | §2 gate G2, §5.1 |
| A1 (stage order) | B10 (fix ordering) | — (P0, not in §5 blockers list) |

For P1/P2/P3 findings, the chain is complete from Part 1 (finding) to Part 2 (task) but the Part 3 synthesis covers only the P0 + structural items; P1/P2/P3 items are aggregated into "deferred refactors" (Part 3 §4.2, §5.5).

---

*End of Appendix. This is a reference document; it does not propose changes to the software, only to the navigation of the documentation that describes it.*
