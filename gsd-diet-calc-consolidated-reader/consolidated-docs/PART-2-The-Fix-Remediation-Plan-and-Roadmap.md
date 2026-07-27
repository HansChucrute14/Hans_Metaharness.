# PART 2 — The Remediation Program

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Layer:** Treatment (Part 2 of a 3-part consolidation: Diagnosis → Treatment → Synthesis)
**Mode:** PLANNING ONLY — no repository file is modified by this document. Every task below is a proposed PR-sized packet requiring approval before implementation. Every task carries an executable Verification Manifest (Red/Green + Evidence).

---

## Orientation

This is the **treatment layer** of the consolidated documentation set. Part 1 (Diagnosis) establishes what is wrong — the full catalog of defects across the LP solver, the nutrition model, the ingredient database, the validation pipeline, the output contract, and the test suite — integrated with the as-built code reality. This document (Part 2) presents the complete, sequenced, dependency-ordered remediation program that addresses every defect. Part 3 (Synthesis) distills the diagnosis and this program into a single verified top-level view.

The program is organized around a single canonical task catalog (§4) that reconciles every task identifier into one system. The amendment's empirical findings — most critically that Level 1 (`SAFE_TO_FEED`) is structurally unreachable, that recommendation severity is invisible, and that the validation package's missing `_shared.py` module is breaking the entire CI pipeline — are folded in as the current truth throughout. Tasks B2a and B2b (the split of the original B2 into hardening and severity-scaled recommendation) and the new tasks B11 (Level-1 infeasibility diagnosis) and B12 (arginine canonicalization) are presented as established task definitions, not as corrections to an earlier plan. A global ID key (`APPENDIX-ID-KEY.md` in this directory) disambiguates the finding-namespace and task-namespace C-series (which share the `C` prefix but refer to different objects — findings in Part 1, tasks in Part 2 §6–§7) and maps the non-monotonic `P0-N` numbering to the canonical `B-series` task IDs used throughout this catalog.

**Safety non-negotiable (governs everything below):** This is a canine diet formulation system. Until the P0 safety and truthfulness defects are fixed AND a board-certified veterinary nutritionist (DACVN/ECVCN) signs off, **no diet produced by this system may be fed to an animal**, every `SAFE_TO_FEED` is suspect, every hardcoded `"adequate"` is invalid, every soft constraint declared hard is a safety defect, and the missing absolute Ca/P ceiling is a large-breed-growth safety defect. YAGNI applies to *complexity*; it never applies to truthful output, hard safety constraints, schema validity, deterministic reproduction, regression tests for safety defects, importability of safety-critical packages, canonical nutrient namespace, correct units, correct solver-status handling, or correct feeding-recommendation logic. The veterinary sign-off process and user-facing safety disclaimer that operationalize this non-negotiable are specified in `APPENDIX-SAFETY-PROCESS.md`.

**Empirical Red baseline (captured by live execution against the repository):** DB→schema produces **21 errors**; `lp_parameters_data`→its schema produces **3 errors**; `import gsd.validation.pipeline.orchestrator` raises **`ModuleNotFoundError: …validators._shared`**; `solver.py:1225` hardcodes `"status":"adequate"`; `constraints.json` declares `HARD_FAIL_INFEASIBLE` **60 times** while `solver.py:425` builds antagonisms "with slack"; **no** `calcium_g <=` ceiling exists; `objective_weights` is referenced **0 times** in `solver.py` (`CRITICALITY_WEIGHT` at `:17` is authoritative); `core.py:205–207` `SCENARIO_K_MAP` maps k=1.2 to "recommended" and k=2.0 to "discouraged"; `ci.yml` has **no** schema/MAPA gate. These findings are fully diagnosed in Part 1; the items below remediate them.

---

## §1. Decision Gates and Scope Resolution

Three decision gates governed the program's design. All three are now resolved.

### Gate G1 — Mineral Antagonisms: Hard vs. Soft

**Resolution: HARD at Level 1** (violation ⇒ infeasible ⇒ `DO_NOT_FEED`), plus a mandatory severity-scaled feeding recommendation at every level.

The configuration declares `solver_behavior: HARD_FAIL_INFEASIBLE` for all antagonism constraints. The solver, however, builds them "with slack for goal programming" — a config↔code contradiction that lets ratio violations pass silently. The resolution honors the declared intent: at Level 1, antagonism ratios (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg) are enforced as hard constraints with no slack. At Levels 2 and 3 (relaxation/diagnostic), slack is permitted but penalized and its magnitude is exposed in the output. The severity-scaled recommendation is mandatory regardless of the hard/soft decision — it is the decisive protection that makes the system safe today, given that Level 1 is currently unreachable.

### Gate G2 — objective_weights.json: Wire In or Delete

**Resolution: DELETE.**

The solver builds its objective from `CRITICALITY_WEIGHT` (defined at `solver.py:17`, used at `:772` and `:791`). The `objective_weights.json` file — containing priority tiers, asymmetric penalties (`PEN_CA_POS ≠ PEN_CA_NEG`), and gonadal multipliers — is consumed only by doc generators and has zero references in the solver. Deleting it removes dead, misleading config and documents the real objective. The alternative (wiring the JSON into the solver) would be a larger change justified only if those features are genuinely wanted, which has not been demonstrated.

### Gate G3 — Numeric Safety Values: Ca/P Ceilings, Growth Taper, SULs

**Resolution: Verify-first against AAFCO/NRC/FEDIAF primary sources + veterinary review before merge.**

This is a verification gate, not an engineering decision. The exact calcium ceiling, phosphorus ceiling, growth-energy taper schedule, and mineral SULs (Cu, Fe, I, Mn, Zn) must be confirmed against primary nutritional sources and reviewed by a board-certified veterinary nutritionist before any numeric safety value enters production. This is the only gate that depends on expertise outside the engineering process.

### Scope Exclusions (YAGNI & DTSTTCPW Pruning)

The following items are explicitly excluded from the program to maintain focus on safety and truthfulness:

- **Second solver backend for differential testing:** CBC is not suspected; the LP mathematics is verified sound and the defects are in wiring, data, and output. A second solver adds complexity without addressing any known defect.
- **Autonomous triage/patch loops, continuous mutation testing, nightly CI, full RunManifest machinery:** No current trigger exists for any of these. They remain parked unless a concrete need appears.
- **God-module decomposition of `solver.py` (1661 lines):** Parked unless a P0 fix becomes difficult to make safely within the current structure. Speculative refactoring threatens safety work.
- **Type-model consolidation (frozen dataclasses/pydantic at boundaries, circular-import split):** Parked unless it demonstrably reduces bugs.
- **Documentation-generation curbing (`mapa.py`/`doc_introspector.py`):** Frozen at current functionality; no new features. Stale references cleaned in Phase 6 only.
- **Mojibake in display names, note maxLength, AA key overlap documentation, hardcoded counts:** P2/P3 debt items, deferred until after safety work.

**Retained (confirmed applicable):** Cheap differential testing by recomputing LP feasibility, executable specs/schema invariants, zero-trust deterministic execution, minimal PR-gated CI, and proof discipline.

---

## §2. Analytical Foundation

### Context Ingestion

The program is built on a verified evidence base: the full systematic review (all findings A1–E23, cross-referenced against live repository execution), the five raw reviewer streams, the 9 code deep-dives (solver.py, mapa.py, nutrition.py, core.py, type_definitions/doc_introspector/cli, validation/ 28 files, data/ JSONs, tests/+scripts/, docs/), and the systemic analysis of part interactions. Every Critical finding has been confirmed against the current repository — either by static code reading or by live execution (PuLP 3.3.2 + CBC + jsonschema).

### Interrogation Findings (Grill-Me)

The interrogation log resolved thirteen ambiguities, all from the codebase rather than by assumption:

- **Q1 (severity taxonomy):** the review's A/B/C/D/E severities map to P0/P1/P2/P3 priorities (Critical→P0, High→P1, Medium→P2, Low→P3).
- **Q2 (finding-to-task mapping):** every finding has at least one remediating task; no orphan findings.
- **Q3 (duplicate IDs):** the R-01..R-09 legacy scheme and the A1–E23 scheme overlap; a canonical cross-map is Task C15.
- **Q4–Q6 (data governance):** three naming schemes coexist; the schema matches by pattern+count, not enumeration; unit is not bound to key suffix.
- **Q7–Q9 (validation pipeline):** `_shared.py` is missing; the package cannot be imported; the 28-file subsystem is dead-on-arrival.
- **Q10–Q11 (solver internals):** `objective_weights.json` is unused; `CRITICALITY_WEIGHT` is authoritative; the lexicographic stage order puts the non-fixed stage in the middle, nullifying category goals and tie-break.
- **Q12 (min/max source):** `NUTRIENT_REGISTRY` lacks numeric min/max; targets are fragmented across `scenarios.json` (mins) and `toxicological_limits.json` (maxs).
- **Q13 (moisture/ash):** `nutrition.py` hardcodes 72% moisture / 1% ash for all 28 ingredients because the DB stores no per-ingredient moisture/ash.

### YAGNI Filter Applied to Inherited Methods

The following inherited methods were evaluated and either retained or rejected:

**Retained (confirmed applicable):** cheap differential testing by recomputing LP feasibility in pure Python; executable specs/schema invariants; zero-trust deterministic execution; minimal PR-gated CI; proof discipline (fixed seed, byte-identical replay, failure-evidence format).

**Rejected (not triggered):** expensive differential testing with a second solver backend (CBC not suspected; LP math verified sound); AST/CFG-aware context retrieval; autonomous triage/patch loops; continuous mutation testing; nightly CI; full RunManifest machinery.

---

## §3. Finding-to-Task Reconciliation

Every defect catalogued in Part 1 maps to at least one remediating task. The master reconciliation is organized by severity cluster.

### Critical Safety Triad

The three most grave defects — the hardcoded `nutrient_results` placeholder (A3/E1), the soft antagonism constraints declared hard (A2/A14), and the missing absolute Ca/P ceiling (B2/B3) — form the critical safety triad. They are remediated by Task B1 (truthful nutrient results), Task B2a (hard antagonisms at Level 1) + Task B2b (severity-scaled recommendation), and Task B3 (Ca/P ceilings). The safety freeze (Task B0) backstops all three until the real fixes land.

### LP / Config Truthfulness

Defects A1 (lexicographic stage order), A4 (antagonism penalty units mismatch), A5 (objective_weights.json unused), A6 (config-driven recommendation), A7 (clinical floor relaxation unimplemented), A8 (status collapse), A9 (Big-M fallback), A10 (tie-break auto-scale), A11 (sanity assertion ignores bioavailability), A13 (rounded grams not re-validated), A17 (fix_optimum tolerance), A18 (coefficient range), A19 (dead code), A20 (inclusion relaxation) are remediated by Tasks B10, C1, B9, B2b, C16, C2, and the P2/P3 debt items.

### Data Governance

Defects C1 (schema non-conformance), C2 (no canonical enumeration), C3 (namespace fragmentation), C4 (orphaned schema), C5 (duplicate entries), C6 (no numeric bounds), C7 (unit not bound to key), C8 (missing additionalProperties), C10 (source_ref divergence), C11 (no min≤max invariant), C12 (id pattern inconsistency), C13 (3-state collapse), C16 (mojibake), C19 (note maxLength), C20 (AA key overlap), C21 (bioavailability factors), C22 (hardcoded counts) are remediated by Tasks B7, B8, B6, C5, and the P2/P3 items.

### Validation Pipeline

Defects D1 (broken import), D2 (FDC API key leak), D3 (empty-200 accepted), D4 (audit trail not tamper-evident), D5 (defeatable gate), D6 (CoFID checksum only on first download), D7 (no fetch isolation), D8 (non-atomic provenance commit), D12 (Retry-After crash) are remediated by Tasks B5, C6–C12.

*Audit-delta additions (AUDIT_DELTA v2):* **E24** (`F-PKG-2`, Critical/P0, NEW-1) — `pydantic` imported at runtime (`schemas.py:10`) but never declared as a runtime dep; in a clean venv the `pydantic` ImportError at `orchestrator.py:37` fires **before** D1's `ModuleNotFoundError` at `orchestrator.py:54`, so D1 is never reached to be diagnosed until E24 is also fixed. **E24 is remediated by Task B5 (scope-expanded — see §4 B5 step 4) co-delivered with Task C14 (scope-expanded — see §7 C14 row)**; both must ship together for B5's import DoD to pass. Independently satisfies B0 trip-condition-5 (by accident, not design). **E25** (`F-PKG-3`, Medium/P2, NEW-3) — `src/gsd/mapa.py:988` imports from `tests/`, excluded from any built distribution; **remediated by a new P2/P3 debt item (see §9 table)**. Not on critical path; independent node. NEW-2 (methodology, no finding ID) — the previously-cited "191 tests / 1 error" D1/B5 evidence transcript is not reproducible from a clean checkout (clean venv: `150 items / 3 errors`); corrected by **C15 scope-expansion** (see §7 C15 row).

### Nutrition Science

Defects B1 (growth DER k=1.2 flat), B4 (hardcoded moisture/ash), B5 (no age tapering), B6–B10 (SULs permissive/unverified), B11 (scenario labels inverted), B12 (cobalamin unit), B13 (Vit-A plausibility), B14 (bone Ca:P), B15 (taurine absent), B16 (Vit-D min), B17 (SUL mislabel), B18 (nutrient-count inconsistency) are remediated by Tasks B4, C3, C4, and P1 items.

### Cross-Cutting

Defects E1–E23 (output contract, architecture, tests, CLI, packaging, documentation, types) are remediated by Tasks B1, B10, C13–C16, R1–R5, and P2/P3 items.

---

## §4. Canonical Task Catalog

The program uses a single canonical task system. The original work was labeled under two parallel schemes — P0-1 through P0-10 (finding-cluster plans) and B0 through B10 (executive task form) — plus the amendment's additions (B2a, B2b, B11, B12), the P1 hardening tasks (C1–C16), and the Phase 3 regression tasks (R1–R5). The master reconciliation table below maps every identifier to its canonical name, the defect(s) it repairs, its priority, and its dependencies.

### Master Task Reconciliation

| Canonical ID | Aliases | Defects Repaired (Part 1 finding IDs) | Priority | Blocked By |
|---|---|---|---|---|
| **B0** | §5 safety freeze | A3, A2, B2, C1, D1 (interim containment) | P0 | none |
| **B1** | P0-1 | A3, E1, E2 | P0 | B7 (clean min/max source) |
| **B2a** | P0-2 (split) | A2, A14 | P0 | none (G1 resolved) |
| **B2b** | P0-2 (split) | A6, B-i, B-ii | P0 | B2a; G3 (thresholds) + vet |
| **B3** | P0-3 | B2, B3 | P0 | G3 (Ca/P values) + vet |
| **B4** | P0-4 | B1, B5, B11 | P0 | G3 (taper values) + vet |
| **B5** | P0-8 | D1 | P0 | B7 (canonical units, recommended) |
| **B6** | P0-6 | C1, C9, C13 | P0 | B7 (schema tightening) |
| **B7** | P0-5 | C2, C3, C5, C7, B18, C6 | P0 | chicken_blood_raw Mg source (verify FDC) |
| **B8** | P0-7 | C4, C11 | P0 | B7 (registry shape) |
| **B9** | P0-9 | A5 | P0 | G2 (resolved: DELETE) |
| **B10** | P0-10 | A1 | P0 | none |
| **B11** | (new) | B-i, B-iii (Level-1 infeasibility) | P0 | none (diagnostic) |
| **B12** | (new) | B-iv (arginine; folds into B7) | P0 | B7 (registry/namespace) |
| **C1** | P1-A4 | A4 | P1 | B2a |
| **C2** | P1-A8 | A8, E3 | P1 | none |
| **C3** | P1-B4 | B4 | P1 | moisture/ash data in DB |
| **C4** | P1-B6..B10 | B6–B10, B17 | P1 | G3 + vet |
| **C5** | P1-C6..C13 | C6, C8, C10, C11, C12, C13 | P1 | B7, B8 |
| **C6** | P1-D2 | D2 | P1 | none (security; do early) |
| **C7** | P1-D3 | D3 | P1 | B5 |
| **C8** | P1-D4 | D4 | P1 | B5 |
| **C9** | P1-D5 | D5 | P1 | B5 |
| **C10** | P1-D6 | D6 | P1 | B5 |
| **C11** | P1-D7 | D7, D12 | P1 | B5 |
| **C12** | P1-D8 | D8 | P1 | B5 |
| **C13** | P1-E4 | E4 | P1 | none |
| **C14** | P1-E6 | E6, E19 | P1 | B5, B6 |
| **C15** | P1-E7 | E7 | P1 | none (documentation) |
| **C16** | P1-A7 | A7, E8 | P1 | none |
| **R1** | — | E16 | P2 | after fixes they lock |
| **R2** | — | E17 | P2 | after fixes |
| **R3** | — | E18, E5 | P2 | after fixes |
| **R4** | — | proof discipline | P2 | after fixes |
| **R5** | — | A19, D22, A12 | P3 | R1–R4 |

### Detailed Task Definitions

Each task below carries its full definition: the defect it repairs, root cause, the TDD Red/Green verification criterion, the defense-in-depth guardrail, the minimal action steps (DTSTTCPW), the required evidence manifest, and dependencies.

---

#### Task B0: Fail-Closed Safety Freeze (Interim Guard)

**Repairs:** A3, A2, B2, C1, D1 (interim containment for all).
**Root Cause:** The system can currently emit `SAFE_TO_FEED` and `"adequate"` while multiple safety defects are live; there is no honest top-level "do not feed" gate.

**TDD Red/Green:**
- **Red:** A probe over the current repository shows the guard's trip conditions are all true: placeholder `adequate` + null `pct`; antagonism slack present; no Ca max; DB fails schema; validation import fails.
- **Green:** On the current repository the guard forces `feeding_rec="DO_NOT_FEED"` and `feed_safe=false` with a `safety_warning`. After B1–B6 land, the corresponding trip conditions clear.

**Defense-in-Depth Guardrail:** The guard is independent of the fixes — it re-detects each original defect until the real fix lands. A test asserts it trips on the un-fixed repository.

**Minimal Action Steps:**
1. Add `src/gsd/safety_guard.py` with pure checks: (a) any `nutrient_results[i].status=="adequate"` while `pct_of_min is None` ⇒ trip; (b) any antagonism slack > tolerance ⇒ trip; (c) no absolute Ca max in config ⇒ trip for growth scenarios; (d) DB fails schema ⇒ trip; (e) validation package import fails ⇒ mark unvalidated. *(Audit-delta note: trip-condition (e) is overloaded — it now covers BOTH D1 (`validators/_shared.py` missing) AND E24 (`pydantic` undeclared as a runtime dep, `F-PKG-2`). In a clean venv, `orchestrator.py:37`'s `from ..schemas import (...)` fires the `pydantic` ImportError BEFORE `orchestrator.py:54`'s `from ..validators._shared import extract_db_value` can fire the D1 `ModuleNotFoundError`. The guard wraps the import generically, so it re-detects whichever import fails first in the given environment — by accident, not by design. Both failures are real; both must be fixed (B5 + C14, scope-expanded — see §4 B5 and §7 C14).)*
2. Call it in `build_output_contract` (`solver.py:1157+`); on trip set `feeding_rec="DO_NOT_FEED"`, `feed_safe=false`, `safety_warning="PRE-ALPHA — DO NOT FEED. Outputs are not verified feed-safe."`.
3. Print the warning in `cli.py`. Add a visible banner to every output contract: `"feed_safe": false` and the safety warning string until P0-1 through P0-4 land and a vet signs off.
4. Process gate: README + CLI print "human review + veterinary nutritionist sign-off required before feeding."

**Evidence Manifest:**
- **Execute:** `pytest tests/test_safety_guard.py -v`
- **Assert Output:** `1 passed` — the guard trips on the current repo, forcing `DO_NOT_FEED`/`feed_safe=false`.

**Type:** operational safeguard + tiny code fix. **Files:** new `src/gsd/safety_guard.py`; call sites in `solver.py:build_output_contract`, `cli.py`. **Rollback:** delete `safety_guard.py` + call sites. **Priority:** P0 (Phase 0). **Estimate:** small. **Blocked by:** none.

---

#### Task B1: Fix Hardcoded `nutrient_results` Placeholder

**Repairs:** A3, E1, E2.
**Root Cause:** `solver.py:1213–1224` hardcodes `status:"adequate"` for all nutrients; `target_min` is set to `sul_value if safety_hard else None`; `value=targets_per_day.get(nid,0)` silently zeroes any nutrient absent from the scenario targets. The output validator checks keys, not values. Mins/maxs are fragmented across files.

**TDD Red/Green:**
- **Red:** A solve with arginine-bearing ingredients reports `arginine_g: value=0, status="adequate", target_min=None` — the placeholder signature.
- **Green:** Every nutrient's `value`, `target_min`, `target_max`, `pct_of_min`, `pct_of_sul`, and `status` are computed from real data. `target_min` comes from the active scenario's `targets` (`data["scenarios.json"]` matched by `animal.scenario_id`); `target_max` comes from `toxicological_limits.json` SUL (energy-normalized → per-day via `der_info`). `pct_of_min=value/target_min`, `pct_of_sul=value/target_max`. `status` is derived from real thresholds. A nutrient absent from the solution is marked `"unknown"`, never `0`/`"adequate"`.

**Defense-in-Depth Guardrail:** `validate_output` (`solver.py:1505–1512`) is strengthened to assert `status` is consistent with `value` vs `target_min/target_max` (within tolerance) and that no `status=="adequate"` has null `pct_of_min` when a min exists.

**Minimal Action Steps:**
1. Add a helper `nutrient_bounds_for(scenario_id, nid, data, der_info) -> (target_min, target_max)`.
2. Replace the placeholder block in `build_output_contract` with real computation.
3. Strengthen `validate_output` to assert status/value consistency.

**Files/Functions:** `src/gsd/solver.py` (`build_output_contract`, `validate_output`, new helper). **Data (read-only):** `scenarios.json`, `toxicological_limits.json`, `lp_parameters_data.json:NUTRIENT_REGISTRY`.

**Tests:** (a) deficient fixture (2–3 ingredients known to undersupply lysine) → assert `status=="below_min"` and `pct_of_min<100`; (b) excess fixture (oversupply a SUL nutrient) → assert `status=="above_sul"` and `pct_of_sul>100`; (c) missing nutrient → assert `status=="unknown"`, not `0`/`adequate`.

**Evidence Manifest:**
- **Execute:** `pytest tests/test_nutrient_results.py -v` (fixed seed via CBC `randomSeed=12345`)
- **Assert Output:** `3 passed` — deficient → `below_min`; excess → `above_sul`; missing → `unknown`. A JSON diff shows `status`/`pct_*` non-null and matching recomputation.

**Regression Risk:** Medium — changes the output contract shape consumers may read; mitigated by keeping field names, only filling values. **Rollback:** revert `build_output_contract`; the safety guard re-detects the placeholder. **Priority:** P0. **Estimate:** small. **Blocked by:** none (numeric mins already in `scenarios.json`); pairs with B7 for clean min/max source.

---

#### Task B2a: Harden Mineral Antagonisms at Level 1

**Repairs:** A2, A14.
**Root Cause:** Config declares `solver_behavior:HARD_FAIL_INFEASIBLE` (60 times in `constraints.json`) but the solver builds the ratios "with slack for goal programming" (`solver.py:425,434,467,472`), unpenalized in L2/L3 — a config↔code contradiction that lets ratio violations pass silently.

**TDD Red/Green:**
- **Red:** `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` → `60` while `grep -n 'with slack for goal programming' src/gsd/solver.py` → `425`. (Captured.)
- **Green:** A fixture engineered to violate Zn:Cu returns Level-1 **infeasible / `DO_NOT_FEED`** (hard, no slack). In Levels 2/3 the slack is penalized (normalized — see Task C1) and its magnitude is exposed in the output as `antagonism_slack`. `feeding_rec` is never `SAFE_TO_FEED` when any antagonism slack > tolerance.

**Defense-in-Depth Guardrail:** Assertion that no Level-1 allocation violates any ratio bound. The B0 safety freeze trips on any antagonism slack > tolerance.

**Minimal Action Steps:**
1. In `build_lp_problem`, branch on `constraint.solver_behavior`: `HARD_FAIL_INFEASIBLE` ⇒ add the ratio bound from `lp_coefficients.bounds` with **no slack** at Level 1.
2. For Levels 2/3 keep slack but **penalize** it (normalized — see C1) and **record** `antagonism_slack` per constraint in `raw_result`.
3. In `build_output_contract`, derive `feeding_rec` from realized slack: any antagonism slack > tol ⇒ at most `FEED_WITH_CAUTION`; > hard tol ⇒ `DO_NOT_FEED`.
4. Remove or truthfully implement the `HARD_FAIL_INFEASIBLE` flag (no lying config).

**Files/Functions:** `solver.py` (`build_lp_problem`, antagonism block 426–477, objective 824–843, `build_output_contract`). **Data:** `constraints.json` (only if choosing the soft option, which is not chosen).

**Evidence Manifest:**
- **Execute:** `pytest tests/test_antagonism_hard.py -v`
- **Assert Output:** `1 passed` — Zn:Cu-violating fixture asserts Level-1 result is infeasible/`DO_NOT_FEED`; `antagonism_slack` is non-zero; `feeding_rec != "SAFE_TO_FEED"`.

**Regression Risk:** Medium — making ratios hard can turn some previously "feasible" selections infeasible (that is the intended safety effect); ensure Level 2/3 still provide a diagnostic path. **Rollback:** revert; safety guard re-detects slack. **Priority:** P0. **Estimate:** small–medium. **Blocked by:** none (G1 resolved). Pairs with C1 (normalization) and B2b (recommendation).

---

#### Task B2b: Severity-Scaled Feeding Recommendation (The Decisive Protection)

**Repairs:** A6, B-i, B-ii.
**Root Cause:** `feeding_rec` is mapped only from `result_status`/cascade level (`solver.py:1170–1177`), so a 631% Ca:Mg overload and a 1.5% Ca:P deviation both yield `FEED_WITH_CAUTION`. Severity is discarded. This is the decisive defect to fix: because Level 1 is structurally unreachable (every tested selection cascades to Level 2), the severity-scaled recommendation is what actually protects the animal today.

**Empirical evidence (five selections, two scenarios, all cascade to Level 2):**

| Selection | Level | Ca:P | Ca:Mg | Zn:Cu | Reported |
|---|---|---|---|---|---|
| Realistic PMR (meaty bone+muscle+liver+fish) | 2 | 1.084 (−1.5%) | 8.44 (−30%) | 6.2 ✓ | `FEED_WITH_CAUTION` |
| High-bone (2 meaty bones+muscle+liver) | 2 | 1.881 (**+45%**) | 131.5 (**+631%**) | 10.2 ✓ | `FEED_WITH_CAUTION` |
| No bone (organs+muscle+fish) | 2 | 0.097 (**−91%**) | 0.894 (−93%) | 47.5 (**+296%**) | `FEED_WITH_CAUTION` |
| Broad 10-ingredient | 2 | 1.823 (+40%) | 105.8 (+488%) | 7.3 ✓ | `FEED_WITH_CAUTION` |
| Broad 10-ing, rapid-growth scenario | 2 | 1.823 (+40%) | 105.8 (+488%) | 7.3 ✓ | `FEED_WITH_CAUTION` |

All five return the identical recommendation regardless of violation magnitude. The +631% Ca:Mg overload (calcium in the DOD-risk zone) and the −1.5% Ca:P deviation are treated identically.

**TDD Red/Green:**
- **Red:** The broad 10-ingredient solve (Ca:P=1.82 +40%, Ca:Mg=105.8 +488%) returns `FEED_WITH_CAUTION`. (Captured.)
- **Green:** `feeding_rec` is a function of **realized violation magnitudes** across antagonism ratios + adequacy shortfalls + SUL excesses:
  - `DO_NOT_FEED` if any **critical** violation — e.g. Ca:P outside `[0.5, 1.8]`, Ca:Mg outside `[~6, ~24]`, **any SUL exceeded**, or any critical adequacy nutrient below its minimum by more than a tolerance (exact thresholds verify-first per G3 + vet);
  - `FEED_WITH_CAUTION` if any **moderate** violation (ratio slightly out of `[lo,hi]`, mild shortfall);
  - `SAFE_TO_FEED` only if Level-1 optimal **and** no violation beyond a tiny tolerance.
  The output gains a `violations[]` array (`nutrient · type · realized · bound · severity_pct`).

**Defense-in-Depth Guardrail:** A regression test asserting the broad-selection case (Ca:Mg +488%) maps to `DO_NOT_FEED`, and a near-compliant case maps to `FEED_WITH_CAUTION`/`SAFE_TO_FEED`. The B0 freeze backstops until B2b lands.

**Minimal Action Steps:**
1. In `build_output_contract`, compute violation magnitudes from `raw_result` (antagonism slack from B2a; adequacy slack; SUL excess `v_plus`).
2. Replace the level-only `feeding_map` with a severity function (threshold table in config, values verify-first per G3).
3. Emit `violations[]` in the output contract.

**Files/Functions:** `solver.py:build_output_contract` (`:1170–1177` replacement). **Data:** threshold table (verify-first values).

**Evidence Manifest:**
- **Execute:** `pytest tests/test_recommendation_severity.py -v`
- **Assert Output:** `2 passed` — overload case → `DO_NOT_FEED`; near-compliant case → `FEED_WITH_CAUTION`/`SAFE_TO_FEED`; `violations[]` populated with correct `severity_pct`.

**Regression Risk:** Medium — changes the recommendation for many existing selections (intended). **Rollback:** revert. **Priority:** P0. **Estimate:** small–medium. **Blocked by:** B2a (antagonism slack exposed). Threshold values verify-first (G3) + vet review.

---

#### Task B3: Add Absolute Calcium and Phosphorus Ceilings

**Repairs:** B2, B3.
**Root Cause:** Only a Ca *minimum* and *ratio* constraints exist (`constraints.json`: Ca≥3.0, Ca:P 1.1–1.3, Ca:Mg 12–18); the absolute ceiling (the Large-Breed-Growth DOD safeguard) was omitted. `toxicological_limits.json` has no Ca/P entries.

**TDD Red/Green:**
- **Red:** `grep -nE 'calcium_g.*<=' data/constraints.json data/toxicological_limits.json` → only ratio bounds; **no** absolute `calcium_g <= X`. (Captured.)
- **Green:** A fixture with a correct Ca:P (1.2) but absolute Ca above the ceiling is rejected (infeasible/`above_sul`); ratio-only scaling cannot exceed the ceiling.

**Defense-in-Depth Guardrail:** Assertion that delivered Ca (recomputed from grams × matrix) ≤ ceiling. B0 trips if no Ca max is present.

**Minimal Action Steps:**
1. Add Ca and P as `HARD_INEQUALITY_MAX` entries in `toxicological_limits.json` on the `energy_normalized` basis (the solver already ingests SULs as hard maxes in Level 1) — Ca ≈ **4.5 g/1000 kcal** (AAFCO LBG ~1.8% DM), plus a defensible P max. **Values verify-first (G3).**
2. Register both in `NUTRIENT_REGISTRY` (unit/basis bound — Task B7).
3. Confirm the solver applies them as hard maxes in Level 1 (no code change expected if SUL ingestion handles `HARD_INEQUALITY_MAX`).

**Files/Data:** `data/toxicological_limits.json`, `data/lp_parameters_data.json:NUTRIENT_REGISTRY`. **Code:** likely none if SUL ingestion already handles the type.

**Evidence Manifest:**
- **Execute:** `pytest tests/test_ca_p_ceiling.py -v`
- **Assert Output:** `1 passed` — over-Ca fixture asserts result is infeasible or `status=="above_sul"`.

**Regression Risk:** Medium — may make some high-bone selections infeasible (intended). **Rollback:** remove the two entries. **Priority:** P0. **Estimate:** tiny–small. **Blocked by:** G3 verify-first Ca/P values + vet review before merge.

---

#### Task B4: Fix Growth-Energy Model and Scenario Labels

**Repairs:** B1, B5, B11.
**Root Cause:** A flat `k=1.2×RER` is hardcoded for the "recommended" scenario (`core.py:199–207` `SCENARIO_K_MAP`); `scenarios.json` lacks a `k_multiplier_ref` (the `core.py` comment itself says it "must eventually live" in data); labels are inverted (the growth-appropriate multiplier k=2.0 is labeled "discouraged" while the underfeeding k=1.2 is labeled "recommended"). The recommended scenario underfeeds a young puppy ~40–60%.

**TDD Red/Green:**
- **Red:** `grep -n SCENARIO_K_MAP src/gsd/core.py` → `205–207` with `SCN_B_SLOW_GROWTH→slow_growth_recommended` (k=1.2) and `SCN_A_RAPID_GROWTH→rapid_growth_discouraged` (k=2.0). (Captured.)
- **Green:** DER for a ~3-mo large-breed puppy ≈ NRC/FEDIAF requirement (±tol) and decreases monotonically with age. The "recommended" scenario is the growth-appropriate one. Labels separate *controlled growth* (mineral/amount management) from *energy restriction*.

**Defense-in-Depth Guardrail:** Unit test asserting DER matches a published requirement table at ≥3 age bands; scenario labels no longer flag the growth-appropriate energy as "discouraged".

**Minimal Action Steps:**
1. Add a `growth_energy_schedule` (age/weight-band → k) to data.
2. Ensure `AnimalInput` carries age/weight-band; replace the `SCENARIO_K_MAP` lookup with schedule interpolation in `calculate_der_and_envelope` (`nutrition.py:173–178`). Use an NRC/FEDIAF-defensible taper (e.g. ~3×RER <4 mo → ~2×RER by ~12–18 mo for large breeds). **Values verify-first (G3).**
3. Relabel `scenarios.json` (`name`/`status`); rename to separate *controlled growth* from *energy restriction*.

**Files/Functions:** `core.py` (`SCENARIO_K_MAP`, `calculate_der_and_envelope`), `nutrition.py:173–178`, `data/scenarios.json`, `data/growth_energy_skeletal.json`, `type_definitions.py` (`AnimalInput`).

**Evidence Manifest:**
- **Execute:** `pytest tests/test_growth_energy.py -v`
- **Assert Output:** `1 passed` — DER-vs-age table matches the cited reference within tolerance and is monotonic.

**Regression Risk:** High — changes every growth diet's totals; requires vet review. **Rollback:** restore `SCENARIO_K_MAP`. **Priority:** P0. **Estimate:** small–medium. **Blocked by:** G3 verify-first NRC/FEDIAF taper values + vet review before merge.

---

#### Task B5: Restore Validation Package Importability

**Repairs:** D1, **E24** (`F-PKG-2`, scope-expanded per AUDIT_DELTA NEW-1).
**Root Cause:** Two distinct upstream failures, both of which break `import gsd.validation.pipeline.orchestrator` in a clean environment: (1) **D1** — `validators/_shared.py` does not exist and `extract_db_value` is defined nowhere, while four modules import it (`orchestrator.py:54`, `bone_validator.py:39`, `cofid_validator.py:33`, `fdc_validator.py:36`); (2) **E24** — `pydantic` is imported at runtime (`schemas.py:10`, transitively pulled by `orchestrator.py:37 from ..schemas import (...)`) but is never declared as a runtime dependency: it is absent from `pyproject.toml` `dependencies=[]`, `requirements.txt`, and the CI install line; only `types-pydantic` (stub-only) is listed. In a clean venv, **`orchestrator.py:37`'s pydantic import fires BEFORE `orchestrator.py:54`'s `_shared.py` import** — so D1 is never reached to be diagnosed until E24 is also fixed. The package cannot be imported either way. This is not merely an isolated buildability issue — `pytest tests/ -v` (the exact command the CI pipeline runs) fails at **collection phase**, meaning **the CI is red today**. B5 is elevated from "restore import" to "unblock the entire CI pipeline," and its DoD cannot pass without simultaneously fixing E24.

**TDD Red/Green:**
- **Red:** `PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator"` → in a **clean venv** (`pip install -e ".[test]"`, CI-exact), the first failure is the `pydantic` `ImportError` at `orchestrator.py:37` (E24); in a sandbox with `pydantic` pre-installed, the failure is `ModuleNotFoundError: No module named 'gsd.validation.validators._shared'` at `bone_validator.py:39` (D1). **Red evidence must be captured in a clean venv to surface E24 as the primary failure.** Additionally, `pytest tests/ -v` fails at collection phase. *(Audit-delta caveat — NEW-2: the transcript below, `191 tests collected / 1 error in 1.96s`, was captured in a review sandbox with `pydantic` pre-installed and is **not reproducible from a clean checkout**. A clean `pip install -e ".[test]"` + `pytest tests/ -v` yields `collected 150 items / 3 errors` (phase1, phase5, phase6) and `Interrupted: 3 errors during collection`. The verdict — D1 is real, B5 is the right fix, CI is RED today — stands; the previously-cited counts were understated because the sandbox masked E24. Both transcripts are preserved for evidence provenance.)*
  ```
  ERROR tests/test_validation_phase5.py
  !!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
  191 tests collected, 1 error in 1.96s
  ```
- **Green:** The same command exits 0 and prints `OK` (requires both `_shared.py` to exist AND `pydantic` declared as a runtime dep in `pyproject.toml` `dependencies=[]` + `requirements.txt`); `tests/test_imports.py` is green; `pytest tests/ -v` collects all tests without error.

**Defense-in-Depth Guardrail:** A CI **import-smoke** step that imports every `gsd.*` module so a missing file or undeclared runtime dep can never merge again. The smoke step must run against a CI install line that mirrors `pip install -e ".[test]"` exactly — not against a sandbox with extras pre-installed (this is the gap that allowed E24 to ship undetected).

**Minimal Action Steps:**
1. Create `src/gsd/validation/validators/_shared.py` implementing `extract_db_value(nutrient_id, db_ingredient)` — read the `NutrientEntry` `{value,unit,status}`, return the numeric value in the canonical unit, honoring the 3-state contract (`missing`/`not_applicable` → `None`, never `0`). *(Repairs D1.)*
2. Unit-test it for measured/missing/not_applicable + a unit conversion.
3. Add `tests/test_imports.py` (`importlib.import_module` over all `gsd.*` modules) + a CI step.
4. **E24 fix (scope-expanded per AUDIT_DELTA NEW-1):** add `pydantic` to `pyproject.toml`'s `dependencies=[]` and to `requirements.txt`; remove `types-pydantic` from runtime deps and move it to a `dev`/`test` extra (it is a stub-only package, not a runtime dep). Verify the CI install line installs the runtime `pydantic` (e.g. `pip install -e ".[test]"` resolves `pydantic` from `dependencies`). This step **must ship together with steps 1–3** — B5's DoD (`import …orchestrator` → `OK`) does not pass until both D1 and E24 are fixed.

**Files/Functions:** new `src/gsd/validation/validators/_shared.py`; `tests/test_imports.py`; `ci.yml`; `pyproject.toml` (`dependencies=[]`, `[project.optional-dependencies]` dev/test extras); `requirements.txt`.

**Evidence Manifest:**
- **Execute:** `PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator; print('OK')"`
- **Assert Output:** `OK` (exit code 0). Additionally: `pip install -e ".[test]"` in a fresh venv resolves `pydantic` from `dependencies=[]` (no pre-install masking); `grep -E '^pydantic' requirements.txt` returns a hit.

**Regression Risk:** Low (additive). **Rollback:** delete the module + revert `pyproject.toml`/`requirements.txt` (re-breaks import — but that's the current state). **Priority:** P0. **Estimate:** small. **Blocked by:** B7 (canonical units) for correct unit handling (recommended, not hard). **Co-requisite:** E24-fix (delivered here as step 4 — both D1 and E24 must ship together for the import DoD). This is the most urgent G3-independent task.

---

#### Task B6: Repair DB Schema Conformance and Add CI Schema Gate

**Repairs:** C1, C9, C13.
**Root Cause:** 21 schema errors shipped (20 measured entries missing `unit`; 1 note exceeding 200-char `maxLength`); no CI gate enforces conformance; the 3-state contract collapses (`missing` used 0 times; 48 ambiguous `measured:0`).

**TDD Red/Green:**
- **Red:** jsonschema validation of `DB_ingredientes.json` → `ERROR COUNT: 21`. **(Captured by execution.)** `grep -nE 'validate-db|jsonschema|schema' .github/workflows/ci.yml` → none.
- **Green:** jsonschema validation → `ERROR COUNT: 0`; CI schema-gate is red on an injected broken record.

**Defense-in-Depth Guardrail:** A required CI `schema-gate` job; a negative test asserting a deliberately broken record fails.

**Minimal Action Steps:**
1. Add `unit` to the 20 measured entries; trim the one over-long `note` (`pork_fat_raw/ara_arachidonic_acid_g`, 208>200).
2. Strip the UTF-8 BOM from `nutrient_set_minimal.json` + `nutrient_safety.schema.json` (C9).
3. Enforce the 3-state contract: require explicit `missing`/`not_applicable`; forbid ambiguous `measured:0` for safety nutrients.
4. Add a CI `schema-gate` job running `python -m gsd.cli --validate-db` (or a small jsonschema script over all data↔schema pairs).

**Files/Data:** `data/DB_ingredientes.json`, `data/nutrient_set_minimal.json`, `data/nutrient_safety.schema.json`; `.github/workflows/ci.yml`.

**Evidence Manifest:**
- **Execute:** `python -m gsd.cli --validate-db`
- **Assert Output:** `ERROR COUNT: 0`; a red run on an injected error.

**Regression Risk:** Low. **Rollback:** revert data edits + remove CI step. **Priority:** P0. **Estimate:** small. **Blocked by:** B7 (schema tightening) ideally sequenced first.

---

#### Task B7: Create Canonical Nutrient Namespace and Unit Binding

**Repairs:** C2, C3, C5, C7, B18, C6.
**Root Cause:** Three naming schemes coexist; the schema matches by pattern+count (not an enumerated key set); unit is not bound to key; a real conflicting duplicate exists (`chicken_blood_raw` Mg 20.5 vs 5.0 mg). The 28 ingredients yield 9 distinct key-sets (48-union/43-intersection); map↔DB nutrient-key overlap = 0. A typo passes the schema undetected.

**TDD Red/Green:**
- **Red:** An adversarial typo'd nutrient key validates with **0 errors**; `chicken_blood_raw` magnesium appears as both 20.5 and 5.0 mg. (Captured.)
- **Green:** The schema **rejects** (a) a typo'd key, (b) a wrong unit (`chloride_mg` with `unit:g`), (c) a duplicate nutrient with conflicting values; the repaired DB **passes**; the registry is the only place defining the 43 keys+units.

**Defense-in-Depth Guardrail:** A load-time assertion that every DB nutrient key ∈ registry and every measured entry's unit matches its key suffix; enforced by the B6 CI gate.

**Minimal Action Steps:**
1. Promote `lp_parameters_data.json:NUTRIENT_REGISTRY` to the **single canonical registry**, adding `unit`+`basis` (already present) and numeric `min`/`max` (mins from `scenarios.json` targets, maxs from `toxicological_limits.json`) — this also gives B1 a clean source.
2. In `db_ingredientes.schema.json`: use `propertyNames:{enum:[...exact 43 keys...]}` + `required` + `additionalProperties:false`; bind each `*_mg/*_ug/*_g/*_iu` key to its required `unit`.
3. Dedupe DB entries; resolve `chicken_blood_raw` Mg to one FDC-sourced value (verify).
4. Make the FDC/COFID maps reference registry IDs.

**Files/Data/Schemas:** `data/lp_parameters_data.json` (registry), `data/db_ingredientes.schema.json`, `data/DB_ingredientes.json`, `data/*_nutrient_map.json`.

**Evidence Manifest:**
- **Execute:** `pytest tests/test_namespace.py -v`
- **Assert Output:** `4 passed` — 3 adversarial records rejected + repaired DB accepted.

**Regression Risk:** Medium — tightening the schema may surface more latent DB errors (intended). **Rollback:** revert schema + registry additions. **Priority:** P0. **Estimate:** medium. **Blocked by:** the `chicken_blood_raw` Mg source value (verify against FDC).

---

#### Task B8: Fix Orphaned `lp_parameters` Schema

**Repairs:** C4, C11.
**Root Cause:** The 44 KB `lp_parameters.schema.json` describes an obsolete shape (`breed`+`domains`); the data uses `NUTRIENT_REGISTRY/solve_cascade/solver_params/mineral_antagonisms`. It validates **zero** files.

**TDD Red/Green:**
- **Red:** jsonschema validation of `lp_parameters_data.json` → `ERROR COUNT: 3` (`'breed' is a required property`, `'domains' is a required property`, `Additional properties are not allowed`). **(Captured by execution.)**
- **Green:** The live `lp_parameters_data.json` validates with `0 errors`; a record with `min>max` fails.

**Defense-in-Depth Guardrail:** The B6 CI schema-gate covers this file; a `min≤max` schema invariant.

**Minimal Action Steps:**
1. Rewrite `lp_parameters.schema.json` to match the real top-level keys (`NUTRIENT_REGISTRY`, `solve_cascade`, `solver_params`, `mineral_antagonisms`) — or split into `nutrient_registry.schema.json` + `solve_cascade.schema.json`.
2. Add upper bounds + a `min≤max` invariant.
3. Validate the live file in the CI gate.

**Files/Schemas:** `data/lp_parameters.schema.json` (rewrite/split), `data/lp_parameters_data.json` (validated, unchanged), `ci.yml`.

**Evidence Manifest:**
- **Execute:** `python - <<'PY' …jsonschema validate lp_parameters_data… PY`
- **Assert Output:** `ERROR COUNT: 0`.

**Regression Risk:** Low. **Rollback:** revert schema. **Priority:** P0. **Estimate:** small. **Blocked by:** B7 (registry shape).

---

#### Task B9: Fix Objective Source of Truth

**Repairs:** A5.
**Root Cause:** The solver builds the objective from `CRITICALITY_WEIGHT` (`solver.py:17`, used `:772,:791`); `objective_weights.json` (priority tiers, asymmetric penalties, gonadal multipliers) is consumed only by doc generators. The documented objective ≠ the optimized objective.

**TDD Red/Green:**
- **Red:** `grep -c objective_weights src/gsd/solver.py` → `0`; `grep -n CRITICALITY_WEIGHT src/gsd/solver.py` → `17`, `772`, `791`. (Captured.)
- **Green:** Exactly one authoritative objective source; a test asserts the LP objective's per-nutrient coefficients equal that source.

**Defense-in-Depth Guardrail:** The coefficient-match test fails if code and config ever diverge.

**Minimal Action Steps (G2 = DELETE):**
1. Delete `data/objective_weights.json` and its loaders (`core.py:60/419`, `mapa.py:530/533/1270`, `doc_introspector.py:703`).
2. Document the real objective (`CRITICALITY_WEIGHT` map + stage structure).
3. Add `tests/test_objective_source.py` asserting objective coefficients == `CRITICALITY_WEIGHT`.

**Files/Functions:** `solver.py:16` + `_build_stage_objective`; `core.py:60/419`; `data/objective_weights.json`; `mapa.py`/`doc_introspector.py`.

**Evidence Manifest:**
- **Execute:** `pytest tests/test_objective_source.py -v && grep -rc objective_weights src/ data/`
- **Assert Output:** `1 passed` and `0` remaining references.

**Regression Risk:** Low (deletion). **Rollback:** revert. **Priority:** P0. **Estimate:** tiny. **Blocked by:** none (G2 resolved: DELETE).

---

#### Task B10: Fix Lexicographic Stage Order

**Repairs:** A1.
**Root Cause:** The non-fixed (tie-break/category) stage sits in the **middle**; the loop fixes only `if fix_opt` (`solver.py:670–680`) and reads the allocation after the last (fixed DER) stage (`:687`) — so category goals and the tie-break have **zero** effect on Level 1/2 allocations. `template_adherence` is computed from grams never optimized for category.

**TDD Red/Green:**
- **Red:** A fixture where category goals should shift the allocation currently shows **no** shift (final grams are independent of category preference). (Captured.)
- **Green:** Category preference changes the chosen optimum among ties; each later stage's fixed objective is not worsened beyond `fix_optimum_tolerance_abs` (0.01) by subsequent stages.

**Defense-in-Depth Guardrail:** A build-time assertion that exactly one stage is non-fixed and it is last (drive order from an explicit `priority` field).

**Minimal Action Steps:**
1. Reorder `solve_cascade` `objective_stages` so the free tie-break/category stage is **last** (move `minimize_absolute_der_deviation` before category, or fix category and make category the final free stage).
2. Add an explicit `priority` per stage + the build-time assertion.

**Files/Data:** `data/lp_parameters_data.json` (`solve_cascade`), `solver.py:611–684` (assertion).

**Evidence Manifest:**
- **Execute:** `pytest tests/test_lexicographic_order.py -v`
- **Assert Output:** `2 passed` — category effect non-zero AND per-stage objectives non-degrading within tolerance.

**Regression Risk:** Medium — changes which optimum is selected (intended). **Rollback:** revert stage order. **Priority:** P0. **Estimate:** small. **Blocked by:** none.

---

#### Task B11: Diagnose Level-1 Infeasibility (IIS / Constraint Relaxation)

**Repairs:** B-i, B-iii (new empirical finding).
**Root Cause:** Level 1 is unreachable for every tested selection (5 selections × 2 scenarios, all cascade to Level 2), so `SAFE_TO_FEED` is dead and the Level-1 hardening (B2a) is currently moot. The blocker is **not** the 17 scenario targets (15 of 17 real-nutrient targets are met at Level 2; the other 2 — `caloric_density` and `ca_p_ratio` — are composite/derived quantities, not solution nutrients). The LP's hard `_MIN` adequacy floors are a much larger AAFCO set (~40+ nutrients, built from `NUTRIENT_REGISTRY` / `nutrient_set_minimal.json`) than the 17 scenario targets. The Level-1 blocker is among: an AAFCO `_MIN` floor that no 5–10-ingredient combination can meet, the clinical-floor MILP (`x=0 OR x≥floor`), the DER constraint (the `k=1.2` energy, Task B4), or a SUL max.

**TDD Red/Green:**
- **Red:** `solve_cascade(broad_selection, …)` returns `solver_status="suboptimal"` (Level 2); a direct Level-1 solve returns infeasible. (Captured.)
- **Green:** A diagnosis identifies the **minimal unsatisfiable constraint subset** (IIS) — the specific constraint(s) that make Level 1 infeasible — and a recommended fix mapped to an existing task (e.g. DER/`k=1.2` → B4; moisture bias → C3; an over-strict `_MIN` floor → adjust with citation; clinical-floor MILP → relax/repair).

**Defense-in-Depth Guardrail:** After the implicated fix lands, re-run the broad selection and assert Level 1 becomes reachable (`SAFE_TO_FEED`) for at least one compliant selection.

**Minimal Action Steps:**
1. Build the Level-1 LP for the broad selection; add slack to **all** Level-1 constraints, minimize total slack, and inspect which slacks are non-zero (the violated constraints).
2. Binary-search by constraint group (AAFCO `_MIN` floors / clinical-floor MILP / DER / SUL maxes) to localize the blocker.
3. Record the IIS + the recommended fix; do **not** change bounds in this task (diagnosis only).

**Evidence Manifest:**
- **Execute:** `pytest tests/test_level1_diagnosis.py -v` (a diagnostic that prints the non-zero-slack constraints)
- **Assert Output:** The diagnosis names ≥1 specific blocking constraint with its slack magnitude; report written to `docs/governance/level1_infeasibility_diagnosis.md`.

**Regression Risk:** None (diagnostic). **Rollback:** n/a. **Priority:** P0. **Estimate:** small. **Blocked by:** none (diagnostic). Informs whether B4/C3 restore Level 1. This is a cheap, high-information task that should run early.

---

#### Task B12: Make Arginine Canonical and Tracked So Lys:Arg Is Evaluable

**Repairs:** B-iv (folds into B7).
**Root Cause:** `arginine_g` exists in the DB (`beef_muscle_raw = 1.32 g` as-fed, measured, `source_ref REF_USDA_FDC_170196`; `beef_liver_raw = 1.241 g`; `chicken_neck_raw = 0.975 g` inferred) but as a **top-level `bromatological_profile` key**, not under the canonical `bp["nutrients"]` dict the solver reads. It is also **absent from the 17 scenario targets** (which include `lysine_g`). So the solver reports `arginine_g = 0` and the Lys:Arg antagonism cannot be evaluated.

However, direct verification against the live repository established that `arginine_g` is **already correctly placed** under `bp["nutrients"]` for all 28 ingredients, is in `NUTRIENT_REGISTRY` (`lp_parameters_data.json:20`), has its own AAFCO minimum constraint in `constraints.json` (`arginine_g >= 2.5`), and `build_matrix()` carries it correctly (e.g. `beef_muscle_raw → 6.86`, `chicken_muscle_raw → 11.94`, energy-normalized). The Lys:Arg constraint (`1.0*arginine_g <= lysine_g <= 1.4*arginine_g`) is built with the correct value. The actual defect is the **reporting layer** (the C1/B1 defect): `arginine_g` is not among the 17 scenario targets, so `targets_per_day.get(nid, 0)` defaults to `0` — the same mechanism as C1, not an arginine-specific problem.

**Reframed Task:** B12 is reframed as "confirm that fixing B1 (the `nutrient_results` placeholder) also corrects arginine display," rather than "relocate the arginine key." The LP already respects Lys:Arg internally; only the output reporting layer is broken.

**TDD Red/Green:**
- **Red:** A solve with arginine-bearing ingredients reports `arginine_g = 0` in `nutrient_results` because it is not among the 17 scenario targets. (Captured.)
- **Green:** After B1 lands, `arginine_g` reports a real value (> 0) and a finite Lys:Arg ratio in the output. A load-time assertion confirms (a) every nutrient sits under `bp["nutrients"]` (no top-level drift keys) and (b) every antagonism `variables_referenced` nutrient is present in `NUTRIENT_REGISTRY`.

**Defense-in-Depth Guardrail:** A load-time assertion that every nutrient sits under `bp["nutrients"]` and every antagonism-referenced nutrient is in `NUTRIENT_REGISTRY` — prevents future unevaluable antagonisms.

**Minimal Action Steps:**
1. Confirm `arginine_g` is under `bp["nutrients"]` for all ingredients (already verified — no relocation needed).
2. Add `arginine_g` to the scenario targets (AAFCO minimum, verify-first) so the reporting layer computes its real value.
3. Add the load-time assertion for antagonism-referenced nutrients.
4. Confirm the B1 fix also corrects arginine display.

**Evidence Manifest:**
- **Execute:** `pytest tests/test_arginine_tracked.py -v`
- **Assert Output:** `1 passed` — solve reports `arginine_g > 0` and a finite Lys:Arg ratio; no top-level drift nutrient keys remain.

**Regression Risk:** None. **Rollback:** n/a. **Priority:** P0. **Estimate:** small. **Blocked by:** B7 (canonical registry/namespace) and B1 (reporting-layer fix). Side confirmations: the `chicken_neck_raw` arginine `note` contains mojibake `Ã—` (C16); its `source_ref 170196` with a "re-aligned to FDC 169483" note is the C10 `beef_muscle` provenance contradiction.

---

## §5. The Safety Freeze (Task B0 — Phase 0)

Task B0 is the first to execute and the last to leave. It makes the system honest and fail-closed before any deep fix, so nothing unsafe can be silently emitted. It is a guard, not a feature: one small module (`safety_guard.py`) plus a few fail-closed check call sites. It is fully reversible by deleting the module.

The guard trips (forcing `DO_NOT_FEED` and `feed_safe=false`) on any of five conditions, each of which corresponds to a known defect:

1. **Hardcoded/incomplete `nutrient_results`:** if any `nutrient_results[i].status == "adequate"` while `pct_of_min is None` (the placeholder signature), force `DO_NOT_FEED`. (Detects A3/B1.)
2. **Antagonism slack:** if any antagonism slack variable > tolerance (read from the raw result), force `DO_NOT_FEED`. (Detects A2/B2a.)
3. **Missing Ca/P ceiling:** if `toxicological_limits.json`/`constraints.json` has no absolute Ca max (and P max), force `DO_NOT_FEED` for any growth scenario. (Detects B2/B3.)
4. **Schema-invalid DB:** call schema validation at `--runtime` start; on failure, refuse to solve and emit `DO_NOT_FEED` + reason. (Detects C1/B6.)
5. **Non-importable validation package:** wrap the validation import; on `ImportError`, mark validation unavailable and never claim validated provenance. (Detects D1/B5 — and, by accident not design, also E24: in a clean venv the `pydantic` ImportError at `orchestrator.py:37` fires before the `_shared.py` `ModuleNotFoundError` at `orchestrator.py:54`. The guard re-detects whichever import fails first; B5 + C14 (both scope-expanded per AUDIT_DELTA) clear both.)

The guard is independent of the fixes — it re-detects each original defect until the real fix lands. As each P0 task completes, its corresponding trip condition clears. The guard is fully deletable once P0-1 through P0-6 land and a vet signs off.

---

## §6. Execution Sequence — Blockers and Stability (Phase 1)

Phase 1 contains the critical safety, truthfulness, and buildability fixes. Order matters; respect the dependency tree (§10). All Phase 1 tasks that do not depend on G3 can begin immediately.

**Recommended Phase-1 start order (independent, high-value, can begin now):**

1. **B0 (safety freeze)** — independent; backstops everything. First commit.
2. **B5 (restore import)** — the CI is red today; this unblocks the entire pipeline. Most urgent G3-independent task.
3. **B6 (schema gate)** — prevents data drift from recurring.
4. **B11 (Level-1 diagnosis)** — cheap, high-information; informs whether B4/C3 restore Level 1.
5. **B2a (harden antagonisms)** — G1 resolved (HARD); independent.
6. **B9 (delete objective_weights.json)** — G2 resolved (DELETE); removes dead config.
7. **B10 (fix stage order)** — independent.

These seven tasks have no G3/vet dependency and can all proceed in parallel (subject to the B7 → B5/B6/B8 dependency chain for ideal sequencing).

**Tasks awaiting G3 or vet review:**
- **B3 (Ca/P ceilings)** — blocked by G3 verify-first Ca/P values + vet review.
- **B4 (growth energy)** — blocked by G3 verify-first NRC/FEDIAF taper + vet review.
- **B2b (severity thresholds)** — blocked by B2a + G3 threshold values + vet review.

**Tasks awaiting B7 (canonical namespace):**
- **B1 (nutrient_results)** — pairs with B7 for clean min/max source (can start before B7 using existing fragmented sources).
- **B5 (import)** — B7 provides canonical units for correct handling (recommended, not hard).
- **B6 (schema gate)** — B7 provides schema tightening (ideally sequenced first).
- **B8 (lp_parameters schema)** — B7 provides registry shape.
- **B12 (arginine)** — B7 provides canonical registry.

---

## §7. Execution Sequence — Core Remediation and Defense-in-Depth (Phase 2)

Phase 2 contains the root-cause architectural fixes and structural guardrails. Each task carries its full TDD Red/Green + Evidence Manifest (preserved in §4's detailed definitions). The tasks are organized by their target findings.

### Truthfulness Tasks

- **B1** — truthful `nutrient_results` (repairs A3/E1/E2). See §4.
- **B9** — objective source of truth (repairs A5). See §4.
- **B10** — lexicographic stage order (repairs A1). See §4.

### Hard Safety Tasks

- **B2a** — hard antagonisms at Level 1 (repairs A2/A14). See §4.
- **B2b** — severity-scaled recommendation, the decisive protection (repairs A6/B-i/B-ii). See §4.
- **B3** — absolute Ca/P ceilings (repairs B2/B3). See §4. Blocked by G3 + vet.
- **B4** — growth-energy model and scenario labels (repairs B1/B5/B11). See §4. Blocked by G3 + vet.

### Data Governance Tasks

- **B7** — canonical nutrient namespace and unit binding (repairs C2/C3/C5/C7/B18/C6). See §4.
- **B6** — DB schema conformance + CI gate (repairs C1/C9/C13). See §4.
- **B8** — orphaned lp_parameters schema (repairs C4/C11). See §4.
- **B12** — arginine canonical and tracked (repairs B-iv). See §4.

### Buildability Tasks

- **B5** — restore validation package importability (repairs D1). See §4.

### Diagnosis Task

- **B11** — diagnose Level-1 infeasibility (repairs B-i/B-iii). See §4.

### P1 Hardening Tasks (C-series)

| Task | Repairs | Smallest Viable Fix | Blocked By |
|---|---|---|---|
| **C1** | A4 | Normalize antagonism slack (`slack/target_ratio`) before weighting so all L1 terms are dimensionless | B2a |
| **C2** | A8, E3 | Branch on `prob.status` → `unbounded/timeout/numerical/infeasible`, all → `DO_NOT_FEED` but diagnosable; surface a `Not Solved` incumbent | none |
| **C3** | B4 | Store measured moisture/ash per ingredient; compute DM from data instead of 72%/1% | moisture/ash data in DB |
| **C4** | B6–B10, B17 | Verify & correct each SUL against cited AAFCO/NRC/FEDIAF source; fix mislabels; every SUL carries a resolving `source_ref` | G3 + vet |
| **C5** | C6, C8, C10, C11, C12, C13 | Schema hardening: numeric bounds, unit-key binding, `additionalProperties:false` on 7 object types, `source_ref ∈ registry`, `min≤max`, 3-state enforcement | B7, B8 |
| **C6** | D2 | FDC API key in header (not URL param); scrub `str(exc)`; **rotate the key** | none (security; do early) |
| **C7** | D3 | Treat empty FDC nutrient list as `MISSING`/error, not zero | B5 |
| **C8** | D4 | Append-only, hash-chained audit log; ms timestamps; no rewrite of prior entries | B5 |
| **C9** | D5 | Make the countermeasure gate non-trivially defeatable (tie to git identity/signed marker) | B5 |
| **C10** | D6 | Verify CoFID sha256 on every load, not just first download | B5 |
| **C11** | D7, D12 | Wrap each fetcher call in try/except; parse `Retry-After` defensively (fallback; HTTP-date) | B5 |
| **C12** | D8 | Commit before/atomically-with the swap, or treat failed commit as hard error → rollback; actually `raise GitError` | B5 |
| **C13** | E4 | Validate `runtime_request.json` against a schema/TypedDict before `AnimalInput(**dict)` | none |
| **C14** | E6, E19, **E24** | CI `schema-gate` + `import-smoke` + Python 3.10–3.12 matrix; fix `requirements.txt`; add lockfile; **add real `pydantic` to `pyproject.toml` `dependencies=[]` + `requirements.txt`** (not just remove dead `types-pydantic` — move `types-pydantic` to a dev/test extra). *AUDIT_DELTA NEW-1 scope gap: C14's prior task text ("remove dead `types-pydantic`") never added the real `pydantic` package, so C14 as previously scoped would ship without fixing E24. C14 is scope-expanded to repair E6 + E19 + E24.* | B5, B6 |
| **C15** | E7 | Create one canonical bug-numbering scheme; cross-map legacy R/F/D IDs once (don't rewrite history). **Scope-expanded per AUDIT_DELTA NEW-2:** apply the same reconciliation discipline to **runtime evidence transcripts** — the previously-cited "191 tests / 1 error in 1.96s" transcript (Part 3 §9, map §G.4/§G.8/§A.1-row-8, Part 2 §4 B5 Red) was not reproducible from a clean checkout (clean venv yields `collected 150 items / 3 errors`); C15 must reconcile the two transcripts, annotate which environment produced which, and pin a reproducible-clean-venv transcript as canonical going forward. | none |
| **C16** | A7, E8 | Delete dead floor-relaxation doc + `validate_output` check #9 (or implement if wanted); use `with open(...)` for file handle | none |

Each C-series task carries a Red/Green + Evidence Manifest in the same format as the B-series tasks (Execute command + Assert Output).

---

## §8. Execution Sequence — Automated Regression Suite (Phase 3)

Phase 3 locks in automated assertions for every remediated item, making the suite able to **catch** regressions, not just pass.

| Task | Repairs | Root Cause | Green Condition |
|---|---|---|---|
| **R1** | E16 | `assert result["solver_status"] in (…all enum values…)` is true by construction | Assert the **specific** expected status for a deterministic (seeded) selection; a perturbed expectation fails |
| **R2** | E17 | `audit_test_result` computes `passed` then only writes to a committed `.md`; callers ignore the return; tests dirty the working tree | `assert passed` (or delete helper); logs go to `tmp_path`; a forced failure now fails the test; working tree stays clean |
| **R3** | E18, E5 | Lexicographic test checks stage-name metadata, not objective preservation; timeout test never calls the solver | Capture per-stage objective bounds and assert non-degradation within tolerance; force a real timeout (tiny `time_limit`/monkeypatched CBC `maxSeconds`) and assert a safe result object |
| **R4** | proof discipline | Fixes need reproducible, located, justified failure evidence | For a fixed fixture+seed the output contract is byte-identical across two runs; each P0/P1 fix has a minimal 2–3-ingredient regression fixture in `tests/fixtures/` |
| **R5** | A19, D22, A12 | Dead code (`GitError`-never-raised, `verify_backup`-never-called, unused `FDC_RATE_LIMIT_DELAY_S`, unreferenced `weighted_normalized_deviation`); `[DEBUG]` prints | Deletions land with `pytest`+`mypy` green and no remaining references; delete only after R1–R4 pin behavior |

**Phase 3 sequence:** R1–R4 after the fixes they lock in; R5 last (dead-code deletion only after behavior is pinned by R1–R4).

---

## §9. P1 Correctness-Hardening and P2/P3 Debt

### P1 Hardening (C-series — detailed in §7)

The 16 C-series tasks (C1–C16) address correctness hardening across the LP objective, solver-status taxonomy, dry-matter denominator, SUL verification, schema hardening, validation security (FDC key, empty responses, audit trail, countermeasure gate, CoFID checksum, fetch isolation, provenance atomicity), runtime input validation, CI gates, bug-numbering canonicalization, and dead-code removal. Each is P1 priority, small-to-medium estimate, with full Red/Green + Evidence Manifest.

### P2/P3 Debt and Simplification (YAGNI-constrained; prefer deletion; each needs no-regression proof)

| Item | Repairs | Action | No-Regression Proof | Pri |
|---|---|---|---|---|
| Remove dead code | D22, A19 | Delete `GitError`-never-raised (after C12), `verify_backup`-never-called, unused `FDC_RATE_LIMIT_DELAY_S`, unreferenced `weighted_normalized_deviation` (`solver.py:768–808`) | `pytest`+`mypy` green; `grep` shows no refs | P3 |
| Remove debug prints | E23, R-06 | Delete `solver.py:301,323` `[DEBUG]` prints (or gate behind `--verbose`) | tests green; no stdout noise | P3 |
| Fix tautological tests | E16 | Assert the **specific** expected status for seeded selections | the test fails on a perturbed expectation | P2 |
| Fix `audit_test_result` theater | E17 | `assert passed` (or delete helper); write logs to `tmp_path`, not the committed `test_audit_log.md` | a forced failure now fails the test; working tree stays clean | P2 |
| Add lexicographic proof | E18 | (covered by B10 test) assert per-stage objective non-degradation | proof test green | P2 |
| Curb doc-gen overengineering | E11 | Freeze `mapa.py`/`doc_introspector.py`; delete stale `build_pipeline.py` references; generate from the same source of truth as code | `--gate-mapa` green; no false "NOT IMPLEMENTED" claims | P2 |
| Decompose `solver.py` | E12 | **Only if** needed for a P0 fix's safety/maintainability; otherwise **park** (YAGNI) | n/a unless triggered | P3/park |
| Consolidate type model | E10, E13 | **Only if** it reduces bugs; move to frozen dataclasses/pydantic at boundaries; resolve the "circular import" split | tests green | P3/park |
| Fix CLI exit codes + argparse | E15, E20, E21 | Use `argparse`; non-zero exit for unimplemented modes; fix `build_pipeline.py` branding; remove global `_NO_LIVE_EVIDENCE` | `gsd --bad` exits non-zero; `--help` works | P2 |
| Fix packaging | E19 | Add `requests` to `requirements.txt`; pin `jsonschema`; add a lockfile | `pip install -r requirements.txt` resolves; CI install reproducible | P2 |
| Fix `src/` ⊥ `tests/` boundary in `mapa.py` | **E25** (`F-PKG-3`, AUDIT_DELTA NEW-3) | `src/gsd/mapa.py:988` does `from tests.reference_cases import REFERENCE_ANIMAL, REFERENCE_SELECTION` — a production-package import from `tests/`, which `pyproject.toml`'s `[tool.setuptools.packages.find] where=["src"]` excludes from any built distribution. Either (a) move `tests/reference_cases.py` (or the needed constants) into `src/gsd/` as a non-test module, or (b) make `mapa.py`'s `--gate-mapa` "Live Execution Evidence" section gracefully skip on `ImportError` when `tests/` is absent. Blocks only the live-evidence section, only under a non-editable/wheel install; low probability today (`license = "Private project — not for distribution"`), not zero. **Overlaps** debt item 6 (E19 packaging) and is **adjacent-uncovered** by C14 (neither C14 nor E19's described scope mentions the `src/` ⊥ `tests/` boundary). | `python -m gsd.cli --gate-mapa` runs under both editable and wheel installs without `ImportError`; or the live-evidence section is provably skipped when `tests/` is absent | P2 |
| Fix mojibake names | C16 | Re-encode the 17 `display_name`s from source | names render correctly; tests green | P2 |
| Fix note maxLength | C19 | Trim the 1 over-long note (or raise limit deliberately) | schema-gate green | P3 |
| Document AA key overlap | C20 | Document which amino-acid keys are independent vs composite; prevent summing both | doc + a guard test | P3 |
| Validate bioavailability factors | C21, A12 | Key bio factors by real `ingredient_id`; assert every ingredient resolves; else **delete** the dead machinery | `bio != 1.0` for a known factor, or machinery removed | P2 |
| Remove hardcoded counts | C22 | Derive nutrient/ingredient counts; single source (registry) | counts match registry | P3 |

---

## §10. The Dependency Tree

The full Blocked-by dependency tree, with amendment changes applied as the current truth:

```
B0 (safety freeze) ── independent; backstops everything
B7 (namespace) ──┬─> B1 (nutrient_results: clean min/max source)
                 ├─> B5 (import: canonical units)
                 ├─> B6 (DB conformance: schema tightening) ─> C5 (schema hardening)
                 └─> B8 (lp_parameters schema)
B2a (harden antagonisms L1) ── G1 resolved (HARD); independent
B2b (severity-scaled rec)  ── Blocked by B2a (needs exposed slack); thresholds verify-first (G3) + vet
B3 (Ca/P ceilings) ── Blocked by G3 (verify values) + vet review
B4 (growth energy) ── Blocked by G3 (verify taper) + vet review
B5 (restore import) ── recommended after B7 (canonical units); URGENT (CI is red today). **Co-requisite: E24-fix** (AUDIT_DELTA NEW-1) — `pydantic` undeclared as runtime dep; in a clean venv `orchestrator.py:37`'s pydantic import fails BEFORE `orchestrator.py:54`'s `_shared.py` import, so B5's import DoD cannot pass without simultaneously fixing E24. E24-fix is delivered IN-BAND as B5 step 4 (declare `pydantic` in `pyproject.toml` + `requirements.txt`) and co-delivered by C14 (scope-expanded). B5 now inherits the full blocks-set {C7, C8, C9, C10, C11, C12, C14} for both D1 and E24.
B6 (schema gate) ── recommended after B7 (schema tightening)
B9 (objective source) ── G2 resolved (DELETE); independent
B10 (stage order) ── independent
B11 (diagnose L1 infeasibility) ── independent diagnostic; informs whether B4/C3 restore Level 1
E25 (mapa.py/tests import boundary) ── independent; AUDIT_DELTA NEW-3 (`F-PKG-3`, Medium/P2). `src/gsd/mapa.py:988` imports from `tests/`, which is excluded from any built distribution by `where=["src"]`. Not on critical path; can-start-now lane (same lane as B0/B2a/B9/B10/B11). Blocks only `mapa.py`'s `--gate-mapa` "Live Execution Evidence" section under non-editable/wheel install. Repaired by §9 P2/P3 debt item (not a formal B/C/R task). Adjacent-uncovered by C14 and E19 packaging debt — neither scopes the `src/` ⊥ `tests/` boundary in.
B12 (arginine canonical + tracked) ── Blocked by B7 (registry/namespace) and B1 (reporting layer)
C1 (penalty normalization) ── Blocked by B2a
C2,C13,C15,C16 ── independent
C3 (dry matter) ── Blocked by moisture/ash data in DB
C4 (SULs) ── Blocked by G3 + vet review
C5 (schema hardening) ── Blocked by B7, B8
C6 (FDC key) ── independent (security; do early)
C7-C12 (validation) ── Blocked by B5 (import)
C14 (CI gates) ── Blocked by B5 (import-smoke) + B6 (schema-gate)
R1-R5 (regression suite) ── after the fixes they lock in (R5 last)
```

**Critical path:** G1/G2/G3 decisions → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3. B3/B4 run in parallel once G3 values + vet review land.

**Highest-value safety chain (what actually protects the animal today, since Level 1 is unreachable):** B2a → B2b. This is the decisive protection — it makes the recommendation reflect the realized violation magnitude rather than just the cascade level.

**Recommended Phase-1 start order (independent, high-value, can begin now):** B0 (safety freeze) · B5 (restore import — unblocks CI) · B6 (schema gate) · B11 (Level-1 diagnosis) · B2a (harden antagonisms) · B9 (delete dead config) · B10 (fix stage order) — none blocked by G3/vet.

---

## §11. Verification and Evidence Protocol

This protocol applies to every task in the program.

### Fixed Seed Policy
CBC `randomSeed=12345`, `threads=1` (already set, `solver.py:657`). Freeze time in tests (inject a fixed `datetime`, never `now()`). No unseeded randomness (none found in `src/gsd`). Deterministic dict ordering where output is compared.

### Failure Evidence Format (required for every "fixed" claim)
`test name · stated invariant · file/module · function · minimal input · seed · expected · actual · reproducible command`

### Cheap Differential Oracle (primary verification method)
Re-substitute returned grams into the hard constraints / recompute `value` vs `(target_min, target_max)` in pure Python and assert agreement. Used by B1, B2a, B3, R4. This is the primary proof mechanism — it independently recomputes the LP result rather than trusting the solver's output.

### Reproducible Command Format
`python -m pytest <test> -v` with the fixture path + seed in the test name; for the CLI: `python -m gsd.cli --runtime --request <fixture.json>` producing a JSON contract diffed against a golden file.

### Minimal Counterexample Format
2–3 ingredient fixtures (pattern already in `test_level1_optimal_synthetic`) — the smallest selection that triggers the invariant.

### Completion Gate Rule
Mark a task completed **ONLY** when its `Execute` command produces its `Assert Output`. No "AI says fixed" — every claim cites a green test + seed + artifact. The safety guard (B0) independently re-detects the original defect until the real fix lands.

### Zero-Tolerance Flake Policy
Any test that fails intermittently is a bug; root-cause (usually time/order/seed) before re-enabling.

### Near-Zero False-Positive Policy
A test must fail for the *right* reason; assert the specific invariant, not a broad disjunction (fixes E16).

### Changed-Line Coverage Policy
*Optional*, only if a P0 fix touches a complex function (`build_lp_problem`); not a blanket requirement (YAGNI).

### Manual Mutation Spot-Check Policy
*Only if* a regression escapes the suite; one targeted manual mutation (e.g. flip a `>=` to `>` in a safety constraint) to confirm a test catches it. Not continuous.

### Storing Regression Evidence
Each fix PR records the failure-evidence block + the golden output in `tests/fixtures/`; CI re-runs the reproducibility re-check.

### Copy-Paste Verification Commands (Linux/bash confirmed; Python fallback inline)

```bash
cd /home/user/repos/Hans-GSD-Raw-Calculator

# 1. Inspect structure
find src data tests -type f | sort
wc -l src/gsd/solver.py

# 2. Validate every data file against its schema (schema-gate core)
python - <<'PY'
import json, jsonschema, pathlib
pairs = [
  ("data/DB_ingredientes.json","data/db_ingredientes.schema.json"),
  ("data/lp_parameters_data.json","data/lp_parameters.schema.json"),
  ("data/ingredient_registry.json","data/ingredient_registry.schema.json"),
]
for data_p, schema_p in pairs:
    d=json.load(open(data_p)); s=json.load(open(schema_p))
    errs=list(jsonschema.Draft202012Validator(s).iter_errors(d))
    print(f"{data_p}: {len(errs)} errors")
    for e in errs[:5]: print("  -", list(e.absolute_path), e.message[:120])
PY
# (or use the app's own gate once it exists:)
python -m gsd.cli --validate-db

# 3. Import smoke test (B5 Red/Green)
python - <<'PY'
import importlib, pkgutil, gsd
mods=[m.name for m in pkgutil.walk_packages(gsd.__path__, "gsd.")]
bad=[]
for m in mods:
    try: importlib.import_module(m)
    except Exception as e: bad.append((m, repr(e)))
print("IMPORT FAILURES:", bad or "none")
PY

# 4. Fast tests (deterministic; CBC seed=12345, threads=1)
python -m pytest tests/ -x -q

# 5./6. Fixed seed / replay a failing seed (seed is in the solver, not pytest)
python -m pytest tests/test_cascade_integration.py -q
python -m pytest tests/test_cascade_integration.py::test_LEVEL1_OPTIMAL_SYNTHETIC -q

# 7. Reproducibility re-check (byte-identical output for a fixed fixture)
python -m gsd.cli --runtime --request tests/fixtures/<case>.json > /tmp/run1.json
python -m gsd.cli --runtime --request tests/fixtures/<case>.json > /tmp/run2.json
diff /tmp/run1.json /tmp/run2.json && echo "DETERMINISTIC" || echo "NON-DETERMINISTIC"

# 8. Schema gate (CI step) — same as #2; exit non-zero on any error
# 9. MAPA/doc gate (if applicable)
python -m gsd.cli --gate-mapa

# 10. Optional changed-line coverage (only if a P0 fix touches build_lp_problem)
python -m pytest tests/ --cov=gsd.solver --cov-report=term-missing -q

# 11. One manual mutation spot-check (ONLY if a regression escapes) — example:
#   temporarily flip a safety '>=' to '>' in solver.py, confirm a test FAILS, then revert.
```

**Red baseline re-check (compact):**

```bash
# Red baseline re-check (schema errors)
python - <<'PY'
import json, jsonschema
for d,s in [("data/DB_ingredientes.json","data/db_ingredientes.schema.json"),
            ("data/lp_parameters_data.json","data/lp_parameters.schema.json")]:
    errs=list(jsonschema.Draft202012Validator(json.load(open(s))).iter_errors(json.load(open(d))))
    print(d, "ERROR COUNT:", len(errs))
PY

# Import smoke (B5 Red/Green)
PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator; print('OK')"

# Fast tests (deterministic; CBC seed=12345)
python -m pytest tests/ -x -q

# Reproducibility re-check (R4)
python -m gsd.cli --runtime --request tests/fixtures/<case>.json > /tmp/r1.json
python -m gsd.cli --runtime --request tests/fixtures/<case>.json > /tmp/r2.json
diff /tmp/r1.json /tmp/r2.json && echo DETERMINISTIC || echo NON-DETERMINISTIC

# Schema gate (B6/C14) and MAPA gate
python -m gsd.cli --validate-db
python -m gsd.cli --gate-mapa
```

---

## §12. Operational Rules

- **Single Question Output:** Phase-1 interrogation surfaces **one** question with **one** recommended default. G1 was the only genuine user question (resolved: HARD). G2 is resolved by default (DELETE). G3 is a verify-first/vet gate, not a user question.
- **Zero Vibe Statements:** every task is concrete, atomic, and programmatically testable (Red/Green + Evidence Manifest). No "ensure robust handling." No "improve reliability." Every claim is an executable assertion.
- **Strict Dependency Tree:** prerequisites stated inline (`Blocked by …`) and in §10 to prevent out-of-order execution. No task begins before its blockers clear.
- **Completion Gate:** a task is done only when its Evidence Manifest's `Execute` yields its `Assert Output`. A green test + seed + artifact is the only acceptable proof.

---

## §13. Documentation and Source-of-Truth Reconciliation

The following documentation drift items must be reconciled. No documentation is rewritten by this plan until the corresponding code fix lands; each row is a decision + recommended update awaiting approval.

| Doc / Config | Drift Type | Evidence | Update After | Recommended Update | Pri |
|---|---|---|---|---|---|
| `README.md` ("schema-validated", "SAFE_TO_FEED") | overstates maturity | DB fails schema (21 err); nutrient_results hardcoded | B1, B6 | Add pre-alpha warning; remove "validated" until gate green | P0 |
| `data/objective_weights.json` vs solver objective | doc/config ≠ code | solver uses `CRITICALITY_WEIGHT`; JSON unused (0 refs) | B9 (DELETE) | Delete JSON + document real objective | P0 |
| `constraints.json` `HARD_FAIL_INFEASIBLE` vs soft antagonisms | config ≠ code | solver adds slack (`solver.py:426–477`) | B2a | Honor hard (G1 resolved) | P0 |
| `scenarios.json` labels (k=2.0 "discouraged" vs k=1.2 "recommended") | inverted labels | `core.py:199–207`; NRC growth ≈2–3×RER | B4 | Relabel per B4 | P0 |
| Bug-numbering schemes (R/F/D) | 3 inconsistent schemes | REVIEW.md vs README vs amendment | C15 | One canonical index (cross-map legacy IDs once) | P1 |
| `MAPA_COMPLETO_*.md` / `mapa.py` claims | false "NOT IMPLEMENTED" | team's own self-review found drift | Phase 6 | Curb doc-gen; regenerate from source of truth | P2 |
| Nutrient counts (41/43/46/54) | inconsistent | bounds 41 / DB 43 / core 46 / minimal 54 | B7 | Single count from registry | P1 |
| Schema badges | claim > reality | orphaned lp_parameters schema; DB fails | B6, B8 | Badges reflect green gates only | P1 |
| Validation pipeline status | implied working | `_shared.py` missing → can't import | B5 | State "pipeline restored" only after import-smoke green | P0 |

**Rule honored:** no documentation is rewritten until the corresponding code fix lands. Sequence: code-fix → doc-update. Updating docs before the code fix would hide the defect.

---

## §14. Risk and Pre-mortem (for the remediation effort itself)

### What Could Go Wrong
- **P0-3/P0-4 numeric values chosen without primary-source verification** → "fixed" but scientifically wrong. Mitigated by G3 gate (verify-first + vet review).
- **Making antagonisms hard (B2a) and adding Ca/P ceilings (B3) makes many selections infeasible** → user perceives "the tool broke" (it got *safer*). Mitigated by Level 2/3 diagnostic path and clear user communication.
- **B7 schema tightening surfaces a wave of latent DB errors** → triage burden. Mitigated by B6 CI gate catching them incrementally.
- **B2b threshold values wrong** → wrong recommendation severity. Mitigated by G3 + vet review.

### Fixes That Could Introduce Regressions
- B1 (output-contract shape change) — mitigated by keeping field names, only filling values.
- B2a (feasibility set shrinks) — intended safety effect; Level 2/3 still provide diagnostic path.
- B4 (all growth totals change) — high regression risk; requires vet review.
- B10 (which optimum is selected) — intended correctness effect.
- C12 (swap/commit ordering) — medium effort; sequence after B5.

### Simplifications That Could Remove Hidden Behavior
- Deleting `objective_weights.json` (B9) removes the *documented* gonadal/asymmetric penalties — confirm they aren't silently relied on by docs/users (they are not; the solver has 0 references).
- Deleting dead code (Phase 6 / R5) only after Phase 5 tests pin behavior.

### Doc Updates That Could Mask Unresolved Spec Conflicts
- Relabeling scenarios (B4) or updating README before the code fix lands would hide the defect. Sequence: code-fix → doc-update.

### Parked Items That Could Become Urgent
- Second-solver differential (if CBC ever suspected) — currently not triggered.
- Model-based pipeline tests (after B5, if orchestration bugs appear).
- `solver.py` decomposition (if a P0 fix becomes hard to make safely in the god-module).

### Early-Warning Signals to Escalate
- Any infeasibility spike after B2a/B3.
- Any non-deterministic output (breaks proof discipline).
- Any schema-gate that can't go green without large rewrites.
- Any SUL value that can't be cited.

### Fixes Requiring Veterinary Nutritionist Review Before Merge
- **B3** (Ca/P ceilings)
- **B4** (growth-energy taper + labels)
- **C4** (Cu/Fe/I/Mn/Zn SULs)
- Final sign-off before any real-world feeding.

---

## §15. Decision Gates for Implementation Readiness

| Gate | Status |
|---|---|
| Findings reconciled against current repo evidence | ✅ Done — all Critical confirmed; D1 confirmed by execution; SUL numerics verify-first |
| Critical safety defects have P0 remediation plans | ✅ B0–B12 (14 tasks) |
| Decision gates resolved | ✅ G1 (HARD), G2 (DELETE), G3 (verify-first + vet) |
| Dependency tree explicit | ✅ §10 — all Blocked-by stated |
| Verification protocol defined | ✅ §11 — Red/Green + Evidence Manifest per task |
| Empirical findings folded in | ✅ B-i/B-ii/B-iii/B-iv addressed by B2a/B2b/B11/B12 |
| B12 reframed per live verification | ✅ Arginine already correctly placed; reframe as "confirm B1 fixes display" |
| Risk pre-mortem complete | ✅ §14 |
| Documentation drift catalogued | ✅ §13 |
| Missing context identified | ✅ See below |

### Missing Context (high-leverage only)
1. **Source-of-truth decisions** (resolved): G1 HARD, G2 DELETE, G3 verify-first.
2. **Authoritative numeric values** (verify-first, ideally vet-supplied): AAFCO Large-Breed-Growth **Ca and P ceilings** (B3); **NRC/FEDIAF growth-energy taper** by age/weight-band (B4); **Cu/Fe/I/Mn/Zn SULs** (C4); **B2b severity thresholds**.
3. **The animal model:** the intended age/weight-band range for the GSD growth scenarios (needed to shape B4's schedule).
4. **`chicken_blood_raw` magnesium true value** (20.5 vs 5.0 mg) — which FDC/source value is correct (B7).
5. **FDC API key rotation** confirmation (C6 — presume leaked).
6. **Veterinary nutritionist** contact for the mandatory sign-off gates.
7. **Environment confirmation** if not Linux/bash (affects §11 commands).
8. **CI install line re-verification against a clean venv** (AUDIT_DELTA NEW-2). The previously-cited D1/B5 evidence transcript (`191 tests collected / 1 error in 1.96s`, Part 3 §9, map §G.4/§G.8/§A.1-row-8, Part 2 §4 B5 Red) was captured in a review sandbox with `pydantic` pre-installed and is **not reproducible from a clean checkout**. A clean `pip install -e ".[test]"` + `pytest tests/ -v` yields `collected 150 items / 3 errors` (phase1, phase5, phase6) and `Interrupted: 3 errors during collection`. The verdict (D1 real, B5 right, CI RED today) is correct; the test/error counts were understated because the sandbox masked E24. Before B5 ships, the CI install line in `.github/workflows/ci.yml` must be re-verified against a fresh venv (no pre-installed `pydantic`) to confirm the install mirrors `pip install -e ".[test]"` exactly. C15 (scope-expanded) reconciles the two transcripts.

---

## Bridge to Part 3

This document presents the complete remediation program: 14 P0 tasks (B0–B12), 16 P1 hardening tasks (C1–C16), 5 regression-suite tasks (R1–R5), and 15 P2/P3 debt items, all reconciled into a single canonical task system with an explicit dependency tree and a verification protocol that demands executable proof for every claim. The program is ready for implementation: all decision gates are resolved, the critical path is identified, and the safety freeze (B0) can land immediately to make the system honest while the deeper fixes proceed.

Part 3 synthesizes the diagnosis (Part 1) and this remediation program into a single verified top-level view — the bottom-line verdict on where the project stands, what needs to happen first, and what the real bottleneck is.

---

*Planning artifact only — no repository file modified. Red conditions were captured by live execution; Green conditions are target assertions. Numeric safety values marked verify-first (G3) require AAFCO/NRC/FEDIAF primary-source confirmation + veterinary review before implementation.*
