# REMEDIATION PLAN — `Hans-GSD-Raw-Calculator` (gsd-diet-calc v10.4.0)
## YAGNI + Grill-Me + Superpowers plan to fix `SYSTEMATIC_REVIEW_REPORT.md`

**Mode:** PLANNING ONLY. No code is modified, no docs rewritten, no repo changed by this document. Every fix below is a *proposed* PR-sized packet requiring your approval before implementation.
**Role:** Principal Verification Engineer / YAGNI auditor / grill-me interviewer / remediation planner.
**Date:** 2026-07-25 · **Project shape:** solo hobby project → bias to small, reversible, boring, deletable steps.
**Companion artifact:** `SYSTEMATIC_REVIEW_REPORT.md` (the findings this plan remediates; IDs A/B/C/D/E preserved).

> **Safety non-negotiable (governs everything below):** This is a canine diet formulation system. Until the P0 safety + truthfulness defects are fixed AND a board-certified veterinary nutritionist (DACVN/ECVCN) signs off, **no diet produced by this system may be fed to an animal**, every `SAFE_TO_FEED` is suspect, every hardcoded `"adequate"` is invalid, every soft constraint declared hard is a safety defect, and the missing absolute Ca/P ceiling is a large-breed-growth safety defect. YAGNI applies to *complexity*; it never applies to truthful output, hard safety constraints, schema validity, deterministic reproduction, regression tests for safety defects, importability of safety-critical packages, canonical nutrient namespace, correct units, correct solver-status handling, or correct feeding-recommendation logic.

---

## 1. Context ingestion report

**Files read (verified this session, read-only):**
- Findings: `SYSTEMATIC_REVIEW_REPORT.md` (consolidated master, 79 KB) and the five raw reviewer reports (`Relatorio dos subagentes.txt`, `LP_ADVERSARIAL_REVIEW.md`).
- Code: `src/gsd/solver.py` (1661 LOC; key spans 15–16, 25–103, 178–181, 426–477, 524–556, 611–684, 760–843, 1150–1235, 1494–1512), `src/gsd/core.py` (606; 54, 60, 102–140, 199–207, 395, 419, 427–433), `src/gsd/nutrition.py` (376; 173–178, 248–262, 300–303), `src/gsd/cli.py`, `src/gsd/type_definitions.py` (204–206), `src/gsd/doc_introspector.py` (306).
- Data: `data/constraints.json` (mineral_antagonisms 2–352), `data/scenarios.json` (2 scenarios + targets), `data/lp_parameters_data.json` (keys `$schema, schema_version, description, NUTRIENT_REGISTRY, solve_cascade, solver_params, mineral_antagonisms`; 512–521), `data/toxicological_limits.json`, `data/nutrient_bounds.json`, `data/nutrient_safety.json`, `data/nutrient_set_minimal.json`, `data/objective_weights.json`, `data/DB_ingredientes.json` (via reviewer probes), `data/db_ingredientes.schema.json`, `data/lp_parameters.schema.json`.
- Validation subsystem (`src/gsd/validation/**`) via reviewer (orchestrator.py:54/163/607/708, fdc_fetcher.py:260/272/291/367, cofid_fetcher.py:209–226, git_manager.py:22, staging.py:55/199, cached_fetcher.py:178/219–225, base.py:31–44, backup_manager.py:52/105, fdc_validator.py:36/76/90/143, bone_validator.py:39, cofid_validator.py:33).
- Build/CI/tests: `.github/workflows/ci.yml`, `pyproject.toml`, `tests/` listing (12 test files + `fixtures/` + committed `test_audit_log.md`).

**Files ignored (out of scope):** the archived TypeScript predecessor `-gsd-diet-calc` (predecessor, not the active engine); `data/audit_provenance.json.backup`, `data/orphan_refs_manifest.json`, `data/fdc_realignment_plan.json`, `data/literature_cache.json` (provenance/ops artifacts, not load-bearing for the P0 fixes); `docs/archive/FEDIAF-Nutritional-Guidelines_2025-ONLINE.pdf` (did not parse cleanly — see missing context).

**Secrets avoided:** the USDA FDC API key (finding D2 notes it is passed in the URL query and echoed into logs). I did **not** read, print, or persist the key value or any environment variable. Remediation D2 includes key **rotation** as a required step because it must be presumed leaked.

**Missing context (high-leverage — see §15):** the full **"Document 2: Applicability & Tradeoff Synthesis"** (only its verification-method list, embedded in the task prompt, was available); the animal **age/weight-band schedule** and the **authoritative NRC/FEDIAF growth-energy taper** and **AAFCO Large-Breed-Growth Ca/P ceilings** (needed to finalize P0-3/P0-4 numeric values); the intended **source-of-truth decisions** where code and docs conflict (objective_weights, antagonisms, scenario labels); a **veterinary nutritionist** for sign-off.

**Evidence quality summary:**
- **High (parent-verified via grep/sed/live JSON parse this session):** A3/E1 (hardcoded nutrient_results), A2 (antagonisms soft vs `HARD_FAIL_INFEASIBLE` config), A5 (objective_weights unused; `CRITICALITY_WEIGHT` authoritative), B1/B11 (k=1.2 + scenario inversion, confirmed in `core.py` *and* `scenarios.json`), B2 (no Ca max), C1 (DB fails schema, 21 errors), C4 (orphaned lp_parameters schema), C2/C5 (no namespace; conflicting Mg values), D1 (`_shared.py` absent), A1 (stage order), E6 (CI has no schema gate), determinism (CBC `randomSeed=12345`, `threads=1`).
- **High (reviewer-verified, parent-cross-checked):** all LP F1–F20, Validation F1–F22, Data F1–F22, Cross-cutting findings.
- **Medium (statically conclusive, not runtime-executed):** D1 — the validation package import was not executed because `pydantic` is absent in the review sandbox; the module file's absence + the symbol being defined nowhere in `src/` is nonetheless conclusive.
- **Verify-first (numeric, need primary sources):** B6–B10 (Cu/Fe/I/Mn/Zn SULs), B2/B3 exact Ca/P ceiling values, B1/B5 growth-energy taper values.

---

## 2. Interrogation log (grill-me)

For each major assumption: assumption · why risky · question asked · answer (evidence) · status.

| # | Assumption | Why risky | Question | Answer (evidence) | Status |
|---|-----------|-----------|----------|-------------------|--------|
| Q1 | "`nutrient_results` reports real adequacy." | It is the user's only per-nutrient safety signal. | Does the code compute status from value vs bounds? | **No.** `solver.py:1213–1224` hardcodes `"status":"adequate"`, `pct_of_min/pct_of_sul/target_max=None`, comment *"This is simplified…"*; `value=targets_per_day.get(nid,0)` silently defaults missing→0. | **Verified (false claim)** |
| Q2 | "Mineral antagonisms are hard constraints." | Ca:P/Zn:Cu violations are toxicity/deficiency risks. | Does the solver enforce `HARD_FAIL_INFEASIBLE`? | **No.** `constraints.json` declares `solver_behavior:HARD_FAIL_INFEASIBLE` for CSTR_CA_P/ZN_CU/FE_ZN/CA_MG/LYS_ARG (:34,59,84,117,150), but `solver.py:426–477` adds slack; L2/L3 slack is unpenalized (:824–843). Config intent = hard; code = soft. | **Verified (conflicting; config says hard)** |
| Q3 | "`objective_weights.json` defines the LP objective." | Reviewers/users believe the documented priority tiers/gonadal multipliers govern optimization. | Does `solver.py` read it? | **No.** `grep objective_weights src` → only `core.py:60/419` (load+report) and doc generators; `solver.py` has **0** refs and uses `CRITICALITY_WEIGHT` (`solver.py:16`). | **Verified (false claim)** |
| Q4 | "The recommended growth scenario feeds the puppy enough energy." | Underfeeding a growing GSD is a welfare defect. | What multiplier does "recommended" use? | `core.py:199–207` `SCENARIO_K_MAP`: `SCN_B_SLOW_GROWTH→k=1.2` ("recommended"), `SCN_A_RAPID_GROWTH→k=2.0` ("discouraged"); `scenarios.json` marks SCN_A `status:WARNING_DO_NOT_OPTIMIZE` "Desaconselhado". NRC growth ≈ 2–3×RER tapering. 1.2×RER is adult-maintenance range. | **Verified (inverted + too low)** |
| Q5 | "Calcium has an absolute ceiling." | Excess Ca → developmental orthopedic disease in large-breed puppies. | Is there a `calcium_g <= X` dietary constraint? | **No.** `constraints.json` has only `calcium_g>=3.0` (min) + Ca:P 1.1–1.3 + Ca:Mg 12–18; `toxicological_limits.json` has no Ca/P entry. (`nutrient_bounds.json calcium_g hard_max 30` is a per-100g *ingredient* bound, not a dietary ceiling.) | **Verified (missing)** |
| Q6 | "The DB is schema-validated." | The README badge implies conformance. | Does the DB pass its schema? | **No.** Live `jsonschema` → **21 errors** (20 measured entries missing `unit`, e.g. `cobalamin_b12_mg={value:0.00381,status:measured}`; 1 `pork_fat_raw/ara_arachidonic_acid_g` note 208>maxLength 200). | **Verified (false claim)** |
| Q7 | "`lp_parameters.schema.json` governs the LP config." | It is the largest schema (44 KB). | Does it validate any data file? | **No.** It expects `breed`+`domains`; `lp_parameters_data.json` has `NUTRIENT_REGISTRY/solve_cascade` and **fails with 3 errors**. It validates **zero** files. | **Verified (orphaned)** |
| Q8 | "The validation pipeline runs." | It is ~6.4k LOC of safety tooling. | Can it be imported? | **No (statically conclusive).** `validators/_shared.py` does not exist; `extract_db_value` defined nowhere; imported by `orchestrator.py:54`, `bone_validator.py:39`, `cofid_validator.py:33`, `fdc_validator.py:36`. (Runtime not executed — `pydantic` absent in sandbox.) | **Verified statically; runtime inferred** |
| Q9 | "The solver is deterministic / replayable." | Proof discipline needs reproducible failures. | Is randomness seeded? | **Yes.** CBC `randomSeed=12345` + `threads=1` (`solver.py:657`, `doc_introspector.py:306`); `fix_optimum_tolerance_abs=0.01`, `rel=1e-6`, `cbc_time_limit_seconds=30` (`lp_parameters_data.json:512–516`); tie-break `5e-6` with runtime bound enforcement. No `np.random`/unseeded randomness found in `src/gsd`. | **Verified (true)** |
| Q10 | "CI enforces schema/MAPA gates and a Python matrix." | README implies validated data + multi-version support. | What does CI actually run? | `ci.yml`: `test` (`pytest tests/ -v`, py3.12) + `type-check` (`mypy --package gsd`). **No `--validate-db`, no `--gate-mapa`, single Python 3.12** (vs `requires-python>=3.10`), dead `types-pydantic` dep. | **Verified (gates absent)** |
| Q11 | "Tests verify the safety output." | A safety tool needs oracle tests on its safety output. | Does any test assert `nutrient_results` correctness? | **No.** Only `len>=41` (`test_cascade_integration.py:193`); `test_solver_timeout` is a stub that never calls the solver (:332–336); enum asserts are tautological (:191–192). Genuine tests exist elsewhere (real CBC, seeded). | **Verified (untested)** |
| Q12 | "Per-nutrient numeric min/max live in one place." | P0-1 needs to compute target_min/target_max. | Where are dietary mins and maxs? | **Split.** Mins/targets in `scenarios.json` `targets` (e.g. lysine 2.25 g = AAFCO min); maxs (SULs) in `toxicological_limits.json`. `NUTRIENT_REGISTRY` entries carry only `{constraint_tier, clinical_criticality, display_name, unit, basis}` — **no numeric min/max**. | **Verified (fragmented → informs P0-1/P0-5)** |
| Q13 | "Document 2 supplies the verification methods." | §3 must YAGNI-filter Document 2 methods. | Do I have Document 2? | **Partial.** Only the method list embedded in the task prompt is available; the full "Applicability & Tradeoff Synthesis" was not provided. | **Assumed (embedded list = Document 2 proxy); flagged** |

---

## 3. YAGNI filter for methods inherited from Document 2

Decision key: **keep now** / **defer** / **reject** / **parking lot**. Hard rules applied: no second solver unless CBC is suspected; no AST/CFG infra unless the agent repeatedly retrieves wrong context; no autonomous patch merging; no continuous mutation testing; no nightly CI without a concrete trigger; no tests without an oracle + current risk justification.

| Method | Repo risk it addresses | Evidence | Smallest viable step | Cost | FP risk | Do-nothing cost | Decision |
|---|---|---|---|---|---|---|---|
| **Executable specs / schema-based invariants** | C1/C4/C6/C7 — data/schema drift ships uncaught | DB fails schema (21 err); orphaned schema; CI has no gate | Add a CI step running `jsonschema` validation of every data file against its schema (reuse `--validate-db`) | Low | Low | High (silent drift) | **Keep now** |
| **Cheap differential testing by recomputing LP feasibility** | A3/A2/A13 — output claims not checked against constraints | nutrient_results hardcoded; rounded grams never re-validated | After a solve, re-substitute the returned grams into the hard constraints and assert satisfaction (pure Python, no new solver) | Low | Low | High (false "adequate"/"SAFE") | **Keep now** |
| **Zero-trust deterministic execution** | Proof discipline; replayable failures | Already largely present (Q9): seed=12345, threads=1, tolerances pinned | Freeze time in tests; assert byte-identical output contract for a fixed fixture+seed | Low | Low | Medium | **Keep now** (mostly done; add time-freeze + replay assertion) |
| **Shrinking / minimal counterexamples** | Make failures located & justified | Tests use full DB; failures are hard to localize | Hand-author 2–3 ingredient minimal fixtures (already a pattern: `test_level1_optimal_synthetic`) for each P0 regression test | Low | Low | Medium | **Keep now** (light) |
| **Qualitative + quantitative proof discipline** | Avoid "AI says fixed" trust gaps | Whole effort | Require every fix PR to carry command+seed+expected/actual artifact (§10) | Low | Low | High | **Keep now** (process) |
| **Minimal PR-gated CI** | Gate schema + smoke import | CI exists but lacks gates | Add 2 jobs/steps: schema-gate, import-smoke; keep `pytest`+`mypy` | Low | Low | High | **Keep now** |
| **Property-based testing** | A18 coefficient range, unit conversions | No current oracle demands it; conversions are few & table-driven | — | Medium | Medium (shrinking noise) | Low | **Defer** (revisit if a conversion bug recurs) |
| **Metamorphic testing** | LP monotonicity (more of a limiting nutrient shouldn't worsen status) | Interesting but no current defect requires it | — | Medium | Medium | Low | **Parking lot** |
| **Stateful / model-based testing** | Pipeline orchestration states | Validation pkg can't even import yet (D1) | — | High | Medium | Low (until D1 fixed) | **Defer** (after D1; only if orchestration bugs appear) |
| **Invariant mining** | Discover hidden invariants | Speculative for a solo project | — | Medium | Medium | Low | **Parking lot** |
| **Mutation testing** | Test-suite strength | No concrete trigger; tautological tests are already known & fixable directly | — | High | High (noise) | Low | **Reject as continuous**; allow **one manual spot-check** only if a regression escapes (§10) |
| **Expensive differential testing (2nd solver backend)** | Cross-check CBC | **CBC is not suspected** — the LP math is verified sound; bugs are in wiring/data/output, not the solver | — | High | Medium | None | **Reject** (hard rule: no 2nd solver unless CBC suspected) |
| **AST/CFG-aware context retrieval** | Agent retrieves wrong context | No evidence of repeated wrong-context retrieval | — | High | — | None | **Reject** (hard rule) |
| **Autonomous triage / patch loops** | Auto-fix | Safety-critical domain; human approval required | — | High | High | None | **Reject** (hard rule: no autonomous patch merging) |

**Net:** keep the cheap, high-leverage, already-mostly-present methods (schema invariants, cheap LP-feasibility differential, deterministic replay, minimal fixtures, proof discipline, PR-gated CI). Park/reject the speculative and enterprise-grade ones. This is the YAGNI line.

---

## 4. Finding reconciliation (report ↔ current repo)

Status key: **confirmed / partially confirmed / stale / invalid / duplicate / conflicting / unknown**. Disposition key: **fix now / simplify now / test now / document now / verify first / defer / reject / park**.

### Critical safety triad
| ID(s) | Title | Subsystem | Sev/Pri | Current repo evidence | Status | YAGNI class | Disposition | Rationale |
|---|---|---|---|---|---|---|---|---|
| A3/E1/E2 | `nutrient_results` hardcoded `"adequate"`, null gaps, untested | Solver/contract/tests | Crit/P0 | `solver.py:1213–1224`; `test_cascade_integration.py:193` | **Confirmed** | safety-critical fix + test fix | **Fix now** | User's only per-nutrient signal is fake; no oracle. |
| A2/A14 | Antagonisms soft at all levels vs `HARD_FAIL_INFEASIBLE` | LP | Crit/P0 | `constraints.json:34,59,84,117,150` vs `solver.py:426–477,824–843` | **Confirmed (conflicting config↔code)** | safety-critical fix + source-of-truth | **Fix now** | Config intent is hard; code is soft → silent ratio violations. |
| B2 | No absolute calcium maximum | Nutrition/LP | Crit/P0 | `constraints.json` (min+ratios only); `toxicological_limits.json` (no Ca) | **Confirmed** | safety-critical fix | **Fix now** (value verify-first) | DOD safeguard; value needs AAFCO/FEDIAF confirmation. |
| B1/B11 | Flat `k=1.2×RER` growth energy; labels inverted | Nutrition | Crit/P0 | `core.py:199–207`; `scenarios.json` SCN_A `WARNING_DO_NOT_OPTIMIZE` | **Confirmed** | safety-critical fix | **Fix now** (value verify-first + vet) | Underfeeds young puppy ~40–60%; needs NRC taper. |

### LP / config truthfulness
| ID(s) | Title | Sev/Pri | Evidence | Status | YAGNI class | Disposition | Rationale |
|---|---|---|---|---|---|---|---|
| A1 | Lexicographic stage order inverted (L1/L2) | Crit/P0 | `solver.py:611–684,670–680,687` | **Confirmed** | correctness fix | **Fix now** | Category goals + tie-break have zero effect on allocations. |
| A5 | `objective_weights.json` unused by LP | Crit→P0 | `solver.py:16` (CRITICALITY_WEIGHT); 0 refs to objective_weights | **Confirmed** | source-of-truth + overengineering removal | **Fix now** (decision gate) | Documented objective ≠ real objective; pick one source. |
| A6 | Recommendation config-driven, ignores violations | High/P1 | `solver.py:1170–1177` | **Confirmed** | safety-critical fix | **Fix now** (with A2) | `SAFE_TO_FEED` can coexist with slack violations. |
| A8/E3 | All non-Optimal → "infeasible" | High/P1 | `solver.py:660–662` | **Confirmed** | correctness fix | **Fix now** | Fails closed (safe) but masks Unbounded/timeout; loses incumbents. |

### Data governance
| ID(s) | Title | Sev/Pri | Evidence | Status | YAGNI class | Disposition |
|---|---|---|---|---|---|---|
| C1 | DB fails own schema (21 errors); no CI gate | Crit/P0 | live jsonschema=21; `ci.yml` no gate | **Confirmed** | data governance + CI fix | **Fix now** |
| C2/C3/C5/C7 (+B18,C6) | No canonical nutrient namespace; typo-blind; conflicting units (Mg 20.5 vs 5.0) | Crit/P0 | 9 key-sets; overlap 0; `chicken_blood_raw` Mg | **Confirmed** | data governance fix | **Fix now** |
| C4 (+C11) | `lp_parameters.schema.json` orphaned; config unschema'd | Crit/P0 | fails 3 errors; validates nothing | **Confirmed** | schema fix | **Fix now** |
| C6–C13 | numeric bounds, unit-key binding, additionalProperties, referential integrity, min≤max, identity, 3-state | High/P1 | reviewer probes | **Confirmed** | schema/data governance | **Fix now** (C6/C7/C13 with P0-5/6; rest P1) |

### Validation pipeline
| ID(s) | Title | Sev/Pri | Evidence | Status | YAGNI class | Disposition |
|---|---|---|---|---|---|---|
| D1 | `_shared.py` missing → package cannot import | Crit/P0 | `orchestrator.py:54` + 3 validators; file absent | **Confirmed (static)** | correctness/buildability fix | **Fix now** |
| D2 | FDC API key in URL + leaked to logs | High/P1 | `fdc_fetcher.py:260,272,367` | **Confirmed** | operational safeguard (security) | **Fix now** (+ rotate key) |
| D3 | Empty-200 accepted as 0-nutrient validation | High/P1 | `fdc_validator.py:76,90,143` | **Confirmed** | correctness fix | **Fix now** |
| D4 | Audit trail not append-only/tamper-evident | High/P1 | `audit_logger.py`; `orchestrator:163` | **Confirmed** | correctness fix | **Fix now** |
| D5 | Circuit-breaker gate defeatable | High/P1 | orchestrator gate | **Confirmed** | operational safeguard | **Fix now** |
| D6 | CoFID checksum bypassed when cached | High/P1 | `cofid_fetcher.py:209–212 vs 226` | **Confirmed** | correctness fix | **Fix now** |
| D7 | Fetch loop no try/except; `int(Retry-After)` crashes | High/P1 | `fdc_fetcher.py:291` | **Confirmed** | correctness fix | **Fix now** |
| D8 | Commit swallows failures after DB swap | High/P1 | `git_manager.py:22`; orchestrator step 6<7 | **Confirmed** | correctness fix | **Fix now** |

### Cross-cutting
| ID(s) | Title | Sev/Pri | Evidence | Status | YAGNI class | Disposition |
|---|---|---|---|---|---|---|
| E4 | `--runtime` input unvalidated | High/P1 | `cli.py` `AnimalInput(**dict)` | **Confirmed** | correctness fix | **Fix now** |
| E5 | Timeout test is a stub | High/P1 | `test_cascade_integration.py:332–336` | **Confirmed** | test fix | **Fix now** |
| E6 | CI lacks schema/MAPA gates + matrix | High/P1 | `ci.yml` | **Confirmed** | CI fix | **Fix now** |
| E7 | Three inconsistent bug-numbering schemes | High/P1 | REVIEW.md vs README vs F/D | **Confirmed** | documentation fix | **Fix now** (cross-map; don't rewrite history) |

### Nutrition SUL verification
| ID(s) | Title | Sev/Pri | Evidence | Status | YAGNI class | Disposition |
|---|---|---|---|---|---|---|
| B3 | No phosphorus maximum | High/P1 | `constraints.json`/`toxicological_limits.json` | **Confirmed** | safety-critical fix | **Fix now** (with B2; value verify-first) |
| B4 | Hardcoded 72% moisture/1% ash denominator | High/P1 | `nutrition.py` | **Confirmed** | correctness fix | **Fix now** (needs per-ingredient data) |
| B5 | No age tapering | High/P1 | `nutrition.py`/`growth_energy_skeletal.json` | **Confirmed** | safety-critical fix | **Fix now** (with B1) |
| B6–B10 | Cu/Fe/I/Mn/Zn SULs (Cu permissive; Mn possibly tight) | High/P1 | `toxicological_limits.json` | **Confirmed values; numeric verify-first** | correctness fix | **Verify first**, then fix |

### Medium / low debt
| ID(s) | Disposition | YAGNI note |
|---|---|---|
| A4 (penalty unit mismatch ~500×) | **Fix now (P1)** | cheap normalization, real distortion |
| A7 (floor-relaxation unimplemented) | **Simplify now**: remove the dead doc/check unless the fallback is wanted | YAGNI: delete unless needed |
| A9–A20 | **Defer / park** except A13 (re-validate rounded grams → **fix now P1**, safety-adjacent) and A12 (bio factors dead → **fix or delete P2**) | mostly robustness/debt |
| B12–B18 | **Verify first / fix P2** (B12 B12 unit/bound, B14 bone Ca:P, B18 count drift folded into P0-5) | small data fixes |
| C14–C22 | **Fix P2/P3** (mojibake C16, note length C19, AA double-count C20 doc, bio unvalidated C21, hardcoded counts C22) | small, prefer deletion |
| D9–D22 | **Fix P2/P3** (EXDEV swap D9, stale flag D10, backup D11, User-Agent D13, OCP/DIP D14–D16, silent schema-skip D17, type holes D18; dead code D22 **delete**) | small robustness; prefer deletion |
| E8–E23 | **Fix P2/P3** (leaked handle E8, god-module E12 **only if needed**, 42% doc-gen E11 **curb**, tautological tests E16/E17/E18 **fix**, CLI E15/E20/E21, packaging E19, debug prints E23 **delete**) | prefer deletion/simplification |

---

## 5. P0 safety freeze plan (interim, minimal, reversible — do FIRST)

**Goal:** make the system *honest and fail-closed* before any deep fix, so nothing unsafe can be silently emitted. This is a guard, not a feature. One small module + a few `fail-closed` checks. Reversible by deleting the module.

**Smallest viable implementation (a single `safety_guard.py` + call sites):**
1. **Visible banner:** every output contract gains `"feed_safe": false` and `"safety_warning": "PRE-ALPHA — DO NOT FEED. Outputs are not verified feed-safe."` until P0-1..P0-4 land and a vet signs off. (`build_output_contract`, `solver.py:1157+`.)
2. **Fail closed on hardcoded/incomplete nutrient_results:** if any `nutrient_results[i].status == "adequate"` while `pct_of_min is None` (the placeholder signature), force `feeding_rec = "DO_NOT_FEED"` and set `feed_safe=false`. (Detects A3 without fixing it yet.)
3. **Fail closed on antagonism slack:** if any antagonism slack variable > tolerance (read from the raw result), force `DO_NOT_FEED`. (Detects A2.)
4. **Fail closed on missing Ca/P ceiling:** if `toxicological_limits.json`/`constraints.json` has no absolute Ca max (and P max), force `DO_NOT_FEED` for any growth scenario. (Detects B2/B3.)
5. **Fail closed on schema-invalid DB:** call schema validation at `--runtime` start; on failure, refuse to solve and emit `DO_NOT_FEED` + reason. (Detects C1.)
6. **Fail closed on non-importable validation package:** wrap the validation import; on `ImportError`, mark validation unavailable and never claim validated provenance. (Detects D1.)
7. **Process gate:** README + CLI print "human review + veterinary nutritionist sign-off required before feeding."

**Type:** operational safeguard + code fix (tiny). **Files:** new `src/gsd/safety_guard.py`; call sites in `solver.py:build_output_contract`, `cli.py`. **Oracle:** a test asserting that, on the *current* repo, the guard forces `DO_NOT_FEED`/`feed_safe=false` (i.e. the guard actually trips on the known defects). **Command:** `pytest tests/test_safety_guard.py -v`. **Rollback:** delete `safety_guard.py` + call sites. **YAGNI:** this is the *minimum* honest guard; it adds no product surface and is fully deletable once P0-1..P0-6 land. **Priority:** P0 (Phase 0). **Estimate:** small. **Blocked-by:** none.

---

## 6. Remediation plans by finding cluster (P0)

Each plan: ID · linked findings · goal · why now · safety impact · root cause · evidence · type · smallest viable fix · implementation steps · files/functions/data/schemas touched · tests · oracle/acceptance · command · expected artifact · regression risk · rollback · FP risk · maintenance burden · complexity Δ · YAGNI justification · priority · estimate · dependencies · blocked-by.

### P0-1 — Fix hardcoded `nutrient_results` placeholder
- **Linked:** A3/E1/E2.
- **Goal:** report truthful per-nutrient `value`, `target_min`, `target_max`, `pct_of_min`, `pct_of_sul`, `status`.
- **Why now:** it is the user's only per-nutrient safety signal and is currently always "adequate".
- **Safety impact:** Critical — removes the fake "everything is adequate" output.
- **Root cause:** placeholder shipped; output validator checks keys not values; mins/maxs fragmented (Q12).
- **Evidence:** `solver.py:1213–1224` (hardcoded), `:1206–1212` (registry/targets/suls; `target_min=sul_value if safety_hard else None`), `value=targets_per_day.get(nid,0)`.
- **Type:** code fix + test addition.
- **Smallest viable fix:** in `build_output_contract`, compute `target_min` from the **active scenario's `targets`** (`data["scenarios.json"]` matched by `animal.scenario_id`) and `target_max` from **`toxicological_limits.json`** SUL (energy-normalized → per-day via `der_info`); derive `pct_of_min=value/target_min`, `pct_of_sul=value/target_max`; set `status` from real thresholds; **remove** the hardcoded `"adequate"` and the silent `get(nid,0)` (mark a nutrient absent from the solution as `"unknown"`, never `0`/`"adequate"`).
- **Implementation steps:** (1) add a helper `nutrient_bounds_for(scenario_id, nid, data, der_info) -> (target_min, target_max)`; (2) replace the placeholder block; (3) strengthen `validate_output` (`solver.py:1505–1512`) to assert `status` is consistent with `value` vs `target_min/target_max` (within tolerance) and that no `status=="adequate"` has null `pct_of_min` when a min exists.
- **Files/functions:** `src/gsd/solver.py` (`build_output_contract`, `validate_output`, new helper). **Data:** reads `scenarios.json`, `toxicological_limits.json`, `lp_parameters_data.json:NUTRIENT_REGISTRY` (read-only).
- **Tests:** (a) **deficient** fixture (2–3 ingredients known to undersupply lysine) → assert that nutrient's `status=="below_min"` and `pct_of_min<100`; (b) **excess** fixture (oversupply a SUL nutrient) → assert `status=="above_sul"` and `pct_of_sul>100`; (c) **missing** nutrient → assert `status=="unknown"`, not `0`/`adequate`. Oracle = the recomputed value vs the scenario target/SUL (cheap differential, §3).
- **Oracle/acceptance:** for a fixed seeded fixture, every nutrient's `status` equals an independent Python recomputation of `value` vs `(target_min,target_max)`.
- **Command:** `pytest tests/test_nutrient_results.py -v` (fixed seed via CBC `randomSeed=12345`).
- **Expected artifact:** a JSON diff showing `status`/`pct_*` non-null and matching the recomputation; the deficient fixture reports `below_min`.
- **Regression risk:** Medium — changes the output contract shape consumers may read; mitigated by keeping field names, only filling values.
- **Rollback:** revert the `build_output_contract` change; the safety guard (§5) re-detects the placeholder.
- **FP risk:** Low (deterministic, seeded). **Maintenance burden:** Low. **Complexity Δ:** net neutral (replaces a placeholder with real logic + 1 helper).
- **YAGNI justification:** no abstraction beyond one helper; uses data already loaded; directly removes a safety defect.
- **Priority:** P0 · **Estimate:** small · **Deps:** none (but pairs with P0-5 for clean min/max source) · **Blocked-by:** none (numeric mins already in `scenarios.json`).

### P0-2 — Make mineral antagonisms honest and safe
- **Linked:** A2/A14, A6.
- **Goal:** the declared contract and the solver behavior agree, and ratio violations can never be emitted as `SAFE_TO_FEED` invisibly.
- **Why now:** core of the safety triad.
- **Safety impact:** Critical.
- **Root cause:** config declares `HARD_FAIL_INFEASIBLE`; solver added slack and never penalized it in L2/L3; recommendation ignores slack.
- **Evidence:** `constraints.json:34,59,84,117,150` (`solver_behavior:HARD_FAIL_INFEASIBLE`); `solver.py:426–477` (slack), `:824–843` (unpenalized L2/L3); `:1170–1177` (config-driven rec).
- **Type:** source-of-truth reconciliation + code fix.
- **Source-of-truth decision (recommended):** honor the **declared intent = hard**. In **Level 1**, enforce Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg as **hard constraints (no slack)** so a violation ⇒ infeasible ⇒ `DO_NOT_FEED`. In Levels 2/3 (relaxation/diagnostic), allow slack **but** (a) penalize it and (b) **expose its magnitude** in the output and **force** `FEED_WITH_CAUTION`/`DO_NOT_FEED` when any antagonism slack > tolerance. If you instead want them soft everywhere, then **change the config** to `solver_behavior:SOFT_PENALIZED` (truthful) — but that is the less safe choice and needs explicit risk acceptance.
- **Implementation steps:** (1) in `build_lp_problem`, branch on `constraint.solver_behavior`: `HARD_FAIL_INFEASIBLE` ⇒ add the ratio bound with **no slack** at Level 1; (2) for L2/L3 keep slack but add it to the objective (normalized — see A4) and record `antagonism_slack` in `raw_result`; (3) in `build_output_contract`, set `feeding_rec` from realized slack (any antagonism slack>tol ⇒ at most `FEED_WITH_CAUTION`; >hard tol ⇒ `DO_NOT_FEED`); (4) remove or truthfully implement the `HARD_FAIL_INFEASIBLE` flag.
- **Files/functions:** `solver.py` (`build_lp_problem`, antagonism block 426–477, objective 824–843, `build_output_contract`). **Data:** `constraints.json` (only if choosing the soft option).
- **Tests:** fixture engineered to violate Zn:Cu → assert Level-1 result is `DO_NOT_FEED`/infeasible (hard option) and that the output's `antagonism_slack` is non-zero and the recommendation is not `SAFE_TO_FEED`.
- **Oracle/acceptance:** a diet with a violated ratio is never labeled `SAFE_TO_FEED`; the reported slack matches the constraint residual (recomputed).
- **Command:** `pytest tests/test_antagonism_honesty.py -v`.
- **Expected artifact:** the violating fixture's output with `feeding_rec != SAFE_TO_FEED` and `antagonism_slack` populated.
- **Regression risk:** Medium — making ratios hard can turn some previously "feasible" selections infeasible (that is the *intended* safety effect); ensure Level 2/3 still provide a diagnostic path.
- **Rollback:** revert; safety guard (§5 step 3) re-detects slack.
- **FP risk:** Low. **Maintenance burden:** Low. **Complexity Δ:** removes the lying flag; small net add (slack reporting).
- **YAGNI justification:** matches declared intent; no new machinery; deletes a falsehood.
- **Priority:** P0 · **Estimate:** small–medium · **Deps:** pairs with A4 (normalization) and A6 (rec logic) · **Blocked-by:** the hard-vs-soft source-of-truth decision (recommend hard).

### P0-3 — Add absolute calcium and phosphorus ceilings
- **Linked:** B2, B3.
- **Goal:** enforce hard absolute Ca and P maxima for Large Breed Growth so ratio-only scaling cannot exceed safe absolutes.
- **Why now:** excess Ca is the classic large-breed DOD cause; currently unenforced.
- **Safety impact:** Critical.
- **Root cause:** only Ca min + ratios modeled; ceilings omitted.
- **Evidence:** `constraints.json` (Ca≥3.0, Ca:P 1.1–1.3, Ca:Mg 12–18; no `calcium_g<=X`); `toxicological_limits.json` (no Ca/P).
- **Type:** data fix + code fix (constraint ingestion) + test.
- **Smallest viable fix:** add Ca and P as `HARD_INEQUALITY_MAX` entries in `toxicological_limits.json` on the `energy_normalized` basis (the solver already ingests SULs as hard maxes in Level 1), e.g. Ca ≈ **4.5 g/1000 kcal** (≈ AAFCO Large Breed Growth 1.8% DM) and a defensible P max — **values verify-first against AAFCO/NRC/FEDIAF primary sources**.
- **Implementation steps:** (1) add the two entries with `source_ref` + `note` citing the primary source; (2) confirm the solver applies them as hard maxes in Level 1 (it applies SULs hard); (3) add to the canonical registry (P0-5) so unit/basis is bound.
- **Files/data:** `data/toxicological_limits.json`, `data/lp_parameters_data.json:NUTRIENT_REGISTRY` (register Ca/P max). **Code:** likely none if SUL ingestion already handles `HARD_INEQUALITY_MAX` (verify); else `solver.py` SUL constraint builder.
- **Tests:** fixture where Ca:P is correct (1.2) but absolute Ca is high → assert the solver refuses (infeasible) or the output flags `above_sul`; assert ratio-only scaling cannot exceed the ceiling.
- **Oracle/acceptance:** delivered diet Ca ≤ ceiling (recomputed from grams × matrix); a constructed over-Ca selection is rejected.
- **Command:** `pytest tests/test_ca_p_ceiling.py -v`.
- **Expected artifact:** infeasible/`above_sul` result for the over-Ca fixture.
- **Regression risk:** Medium — may make some high-bone selections infeasible (intended). **Rollback:** remove the two entries.
- **FP risk:** Low. **Maintenance burden:** Low. **Complexity Δ:** +2 data entries.
- **YAGNI justification:** two data rows + a test; no new code path.
- **Priority:** P0 · **Estimate:** tiny–small · **Deps:** P0-5 (registry) ideally · **Blocked-by:** **verify-first** exact AAFCO/FEDIAF Ca/P ceilings + vet review.

### P0-4 — Fix growth energy model and scenario labels
- **Linked:** B1/B5/B11.
- **Goal:** DER uses an age/weight-band growth-energy taper from a defensible source; scenario labels are correct; "controlled growth" is separated from "energy restriction".
- **Why now:** the recommended scenario underfeeds a young puppy ~40–60%.
- **Safety impact:** Critical (welfare).
- **Root cause:** flat `k=1.2` hardcoded; `scenarios.json` lacks `k_multiplier_ref` (per `core.py:199–200` comment); labels inverted.
- **Evidence:** `core.py:199–207` `SCENARIO_K_MAP`; `nutrition.py:173–178` (DER=RER×k); `scenarios.json` SCN_A `WARNING_DO_NOT_OPTIMIZE`/k=2.0, SCN_B recommended/k=1.2.
- **Type:** code fix + data fix + source-of-truth + test.
- **Smallest viable fix:** move the multiplier out of the hardcoded map into a **schedule keyed to the animal's age/weight-band** (the `core.py` comment already says it "must eventually live" in `scenarios.json`/data). Use an NRC/FEDIAF-defensible taper (e.g. ~3×RER <4 mo → ~2×RER by ~12–18 mo for large breeds) — **values verify-first**. Relabel scenarios so the growth-appropriate energy is not flagged "discouraged"; rename to separate *controlled growth* (mineral/amount management) from *energy restriction*.
- **Implementation steps:** (1) add `growth_energy_schedule` (age/weight-band → k) to data; (2) ensure `AnimalInput` carries age/weight-band; (3) replace `SCENARIO_K_MAP` lookup with schedule interpolation; (4) relabel `scenarios.json` `name`/`status`; (5) unit-test DER against a published requirement table.
- **Files/functions:** `core.py` (`SCENARIO_K_MAP`, `calculate_der_and_envelope`), `nutrition.py:173–178`, `data/scenarios.json`, `data/growth_energy_skeletal.json`, `type_definitions.py` (`AnimalInput`).
- **Tests:** young vs older large-breed windows → assert DER decreases with age and matches the reference table within tolerance; assert the "recommended" scenario is the growth-appropriate one.
- **Oracle/acceptance:** DER for a 3-mo GSD ≈ NRC/FEDIAF requirement (±tol); monotonic taper with age.
- **Command:** `pytest tests/test_growth_energy.py -v`.
- **Expected artifact:** a DER-vs-age table matching the cited reference.
- **Regression risk:** High — changes every growth diet's totals; **requires vet review**. **Rollback:** restore `SCENARIO_K_MAP`.
- **FP risk:** Medium (reference values). **Maintenance burden:** Low once scheduled. **Complexity Δ:** replaces a constant with a small table.
- **YAGNI justification:** a small data table + interpolation; no framework.
- **Priority:** P0 · **Estimate:** small–medium · **Deps:** none · **Blocked-by:** **verify-first** NRC/FEDIAF taper values + **vet review** before merge.

### P0-5 — Create canonical nutrient namespace and unit binding
- **Linked:** C2/C3/C5/C7, B18, C6/C7.
- **Goal:** one canonical nutrient registry (`id`+`unit`+`basis`+min+max) referenced by DB, solver, maps, and schemas; schema enumerates exact keys, binds unit to key suffix, rejects `additionalProperties`; conflicting duplicate entries removed.
- **Why now:** root of the silent 1000× mineral-error vector (Mg 20.5 vs 5.0).
- **Safety impact:** Critical (data integrity → correct LP coefficients).
- **Root cause:** three naming schemes; pattern+count matching; no unit/key binding.
- **Evidence:** 9 key-sets / 48 union / 43 intersection; map↔DB overlap 0; `chicken_blood_raw` Mg 20.5 vs 5.0; `db_ingredientes.schema.json` `patternProperties`+`minProperties:43`; `NUTRIENT_REGISTRY` lacks numeric min/max (Q12).
- **Type:** data governance + schema fix + data fix.
- **Smallest viable fix:** (1) promote `lp_parameters_data.json:NUTRIENT_REGISTRY` to the **single canonical registry**, adding `unit`+`basis` (already present) and numeric `min`/`max` (pull mins from `scenarios.json` targets, maxs from `toxicological_limits.json`) — this also gives P0-1 a clean source; (2) in `db_ingredientes.schema.json` use `propertyNames:{enum:[...exact keys...]}` + `required` + `additionalProperties:false`, and bind each `*_mg/*_ug/*_g/*_iu` key to its required `unit`; (3) dedupe DB entries; resolve `chicken_blood_raw` Mg to one sourced value; (4) make maps reference registry IDs.
- **Implementation steps:** as above; add a load-time assertion that every DB nutrient key ∈ registry and every measured entry has a unit matching its key suffix.
- **Files/data/schemas:** `data/lp_parameters_data.json` (registry), `data/db_ingredientes.schema.json`, `data/DB_ingredientes.json`, `data/*_nutrient_map.json`.
- **Tests:** schema must **reject** (a) a typo'd key, (b) a wrong unit (`chloride_mg` with `unit:g`), (c) a duplicate nutrient with conflicting values; must **accept** the corrected DB.
- **Oracle/acceptance:** adversarial typo/wrong-unit/duplicate records fail validation; the real DB passes; registry is the only place defining the 43 keys+units.
- **Command:** `python -m gsd.cli --validate-db` (and a `pytest tests/test_namespace.py`).
- **Expected artifact:** validation errors on the 3 adversarial records; clean pass on the repaired DB.
- **Regression risk:** Medium — tightening the schema may surface more latent DB errors (intended). **Rollback:** revert schema + registry additions.
- **FP risk:** Low. **Maintenance burden:** Low (single source). **Complexity Δ:** net negative (removes 2 redundant naming schemes).
- **YAGNI justification:** consolidates, doesn't add; eliminates a safety vector.
- **Priority:** P0 · **Estimate:** medium · **Deps:** none · **Blocked-by:** the `chicken_blood_raw` Mg source value (verify against FDC).

### P0-6 — Repair DB schema conformance and add CI schema gate
- **Linked:** C1, C9(part), C13.
- **Goal:** DB passes its schema; CI blocks merges on any schema-validation failure; 3-state contract enforced.
- **Why now:** the "validated" badge is false; drift ships uncaught.
- **Safety impact:** High (data integrity gate).
- **Root cause:** 21 errors shipped; no CI gate; `missing` never used (48 ambiguous `measured:0`).
- **Evidence:** live jsonschema=21 (20 measured missing `unit`; 1 note 208>200); `ci.yml` has no schema step; 0 `missing`, 48 `measured=0`.
- **Type:** data fix + CI gate.
- **Smallest viable fix:** (1) add `unit` to the 20 measured entries; trim the over-long note; (2) strip BOM from `nutrient_set_minimal.json` + `nutrient_safety.schema.json` (C9); (3) enforce measured/not_applicable/missing — require explicit `missing`/`not_applicable`, forbid ambiguous `measured:0` for safety nutrients; (4) add a CI step running schema validation as a required check.
- **Implementation steps:** repair data; add CI job `schema-gate` (`python -m gsd.cli --validate-db` or a small `jsonschema` script over all data↔schema pairs).
- **Files/data:** `data/DB_ingredientes.json`, `data/nutrient_set_minimal.json`, `data/nutrient_safety.schema.json`; `.github/workflows/ci.yml`.
- **Tests:** the schema-gate itself is the test; plus a negative test that a deliberately broken record fails.
- **Oracle/acceptance:** `--validate-db` exits 0 on the repaired DB and non-zero on a broken one; CI is red on drift.
- **Command:** `python -m gsd.cli --validate-db`; `pytest tests/test_schema_gate.py`.
- **Expected artifact:** green schema-gate; a red run on an injected error.
- **Regression risk:** Low. **Rollback:** revert data edits + remove CI step.
- **FP risk:** Low. **Maintenance burden:** Low. **Complexity Δ:** +1 CI step.
- **YAGNI justification:** a gate that already half-exists (`--validate-db`); enforces truthfulness.
- **Priority:** P0 · **Estimate:** small · **Deps:** P0-5 (schema tightening) · **Blocked-by:** none.

### P0-7 — Fix orphaned `lp_parameters` schema
- **Linked:** C4, C11.
- **Goal:** the LP config is governed by a working schema (or the obsolete schema is deleted).
- **Why now:** the most safety-relevant config is unschema'd while a 44 KB schema governs nothing.
- **Safety impact:** High (config integrity).
- **Root cause:** schema describes obsolete `breed`+`domains`; data uses `NUTRIENT_REGISTRY/solve_cascade/solver_params/mineral_antagonisms`.
- **Evidence:** `lp_parameters_data.json` keys vs schema; 3 validation errors.
- **Type:** schema fix.
- **Smallest viable fix:** rewrite `lp_parameters.schema.json` to match the real top-level keys (`NUTRIENT_REGISTRY`, `solve_cascade`, `solver_params`, `mineral_antagonisms`) — or split into `nutrient_registry.schema.json` + `solve_cascade.schema.json`; add upper bounds and a `min≤max` invariant; validate the live file in CI. (Alternative: archive the obsolete schema if you prefer the split.)
- **Files/schemas:** `data/lp_parameters.schema.json` (rewrite/split), `data/lp_parameters_data.json` (validated, unchanged), `ci.yml`.
- **Tests:** the live `lp_parameters_data.json` validates; a record with `min>max` fails.
- **Oracle/acceptance:** `jsonschema` pass on live config; fail on `min>max`/missing required key.
- **Command:** `python -c "import json,jsonschema;..."` (script in §11) folded into the schema-gate.
- **Expected artifact:** green validation of the live config.
- **Regression risk:** Low. **Rollback:** revert schema. **FP risk:** Low. **Maintenance burden:** Low. **Complexity Δ:** neutral.
- **YAGNI justification:** makes an existing artifact truthful; no new system.
- **Priority:** P0 · **Estimate:** small · **Deps:** P0-5 (registry shape) · **Blocked-by:** none.

### P0-8 — Restore validation package importability
- **Linked:** D1.
- **Goal:** `gsd.validation` imports; `--validate-db`'s pipeline tier can start.
- **Why now:** ~6.4k LOC of safety tooling is dead-on-arrival.
- **Safety impact:** High (the validation/provenance subsystem cannot run).
- **Root cause:** `validators/_shared.py` missing; `extract_db_value` defined nowhere; 4 importers.
- **Evidence:** `orchestrator.py:54`, `bone_validator.py:39`, `cofid_validator.py:33`, `fdc_validator.py:36`; `find`/`grep` empty.
- **Type:** code fix + test + CI gate.
- **Smallest viable fix:** create `src/gsd/validation/validators/_shared.py` implementing `extract_db_value(nutrient_id, db_ingredient)` with correct unit handling (read the `NutrientEntry` `{value,unit,status}`, return the numeric value in the canonical unit, honoring the 3-state contract — `missing`/`not_applicable` → `None`, not `0`). Add unit tests. Add a CI **import-smoke** test that imports every public module.
- **Implementation steps:** (1) write `_shared.py`; (2) unit-test `extract_db_value` for measured/missing/not_applicable + unit conversion; (3) add `tests/test_imports.py` (`importlib.import_module` over all `gsd.*` modules); (4) add CI step.
- **Files/functions:** new `src/gsd/validation/validators/_shared.py`; `tests/test_imports.py`; `ci.yml`.
- **Tests:** `extract_db_value` returns correct value/unit; `None` for missing; import-smoke passes.
- **Oracle/acceptance:** `python -c "import gsd.validation.pipeline.orchestrator"` exits 0; `pytest tests/test_imports.py` green.
- **Command:** `python -c "import gsd.validation.pipeline.orchestrator"`; `pytest tests/test_imports.py -v`.
- **Expected artifact:** successful import; green smoke test.
- **Regression risk:** Low (additive). **Rollback:** delete the module (re-breaks import — but that's the current state).
- **FP risk:** Low. **Maintenance burden:** Low. **Complexity Δ:** +1 small module (restores intended design).
- **YAGNI justification:** restores a referenced, intended helper; minimal.
- **Priority:** P0 · **Estimate:** small · **Deps:** P0-5 (canonical units) for correct unit handling · **Blocked-by:** none (runtime confirmation needs `pydantic` installed).

### P0-9 — Fix objective source of truth
- **Linked:** A5.
- **Goal:** exactly one authoritative objective-weight source, wired into the LP, matching the docs.
- **Why now:** the documented objective ≠ the optimized objective (trust + maintenance trap).
- **Safety impact:** Medium-High (correctness-of-intent; the gonadal/asymmetric penalties are currently silently absent).
- **Root cause:** `solver.py` uses `CRITICALITY_WEIGHT` (`:16`); `objective_weights.json` (priority tiers, asymmetric PEN_CA_POS≠PEN_CA_NEG, gonadal ×1.5) is consumed only by doc generators.
- **Evidence:** `grep objective_weights src` → `core.py:60/419` + mapa/doc_introspector only; `solver.py` 0 refs.
- **Type:** source-of-truth reconciliation + code fix **or** deletion.
- **Decision gate (you choose):**
  - **Option A (YAGNI recommendation):** keep the working `CRITICALITY_WEIGHT` path; **delete** `objective_weights.json`; update docs to describe the real objective. Smallest, lowest-risk, removes dead config.
  - **Option B:** wire `objective_weights.json` into `_build_stage_objective` as authoritative (honor priority tiers, asymmetric penalties, gonadal multipliers); delete `CRITICALITY_WEIGHT`. Larger; only choose if those features are genuinely wanted (a product decision).
- **Implementation steps (A):** delete the file + its loaders (`core.py:60/419`, doc generators); document the real objective; add a test asserting the objective coefficients equal the `CRITICALITY_WEIGHT` map. **(B):** build the objective from the JSON; delete the parallel map; test coefficients match the JSON.
- **Files/functions:** `solver.py:16` + `_build_stage_objective`; `core.py:60/419`; `data/objective_weights.json`; `mapa.py`/`doc_introspector.py`.
- **Tests:** assert the LP objective's per-nutrient coefficients equal the chosen source (catches future divergence).
- **Oracle/acceptance:** one source of truth; a test fails if code and config diverge.
- **Command:** `pytest tests/test_objective_source.py -v`.
- **Expected artifact:** coefficient-match test green.
- **Regression risk:** Option A Low (deletion); Option B Medium (changes the objective → changes solutions). **Rollback:** revert.
- **FP risk:** Low. **Maintenance burden:** Low after. **Complexity Δ:** A = negative (deletion); B = neutral.
- **YAGNI justification:** A is pure deletion of dead config; B only if the features are needed (prove need first).
- **Priority:** P0 · **Estimate:** A tiny / B medium · **Deps:** none · **Blocked-by:** **your A/B decision**.

### P0-10 — Fix lexicographic stage order
- **Linked:** A1.
- **Goal:** the non-fixed (tie-break/category) stage is last; category goals and tie-break actually affect Level 1/2 allocations; later stages never worsen earlier fixed objectives beyond tolerance.
- **Why now:** currently category/template preferences and the tie-break have **zero** effect on allocations.
- **Safety impact:** Medium (correctness of the documented lexicographic behavior; template_adherence is computed from grams never optimized for category).
- **Root cause:** config puts the non-fixed stage in the middle; the loop fixes only `if fix_opt` (`solver.py:670–680`) and reads the allocation after the last (fixed DER) stage (`:687`).
- **Evidence:** `solver.py:611–684`; `lp_parameters_data.json solve_cascade` L1/L2 `objective_stages`.
- **Type:** code/config fix + test.
- **Smallest viable fix:** reorder `objective_stages` so the **free tie-break/category stage is last** (move `minimize_absolute_der_deviation` before category, or fix category and make category the final free stage). Better: add an explicit `priority` field per stage and **assert at build time that exactly one stage is non-fixed and it is last**.
- **Implementation steps:** (1) edit `solve_cascade` stage order (or add `priority`); (2) add a build-time assertion; (3) add tests.
- **Files/data:** `data/lp_parameters_data.json` (`solve_cascade`), `solver.py:611–684` (assertion).
- **Tests:** (a) a fixture where category goals should shift the allocation → assert the final grams reflect category preference (non-zero effect); (b) assert each later stage's fixed objective is not worsened beyond `fix_optimum_tolerance_abs` by subsequent stages.
- **Oracle/acceptance:** category preference changes the chosen optimum among ties; lexicographic non-degradation holds (recomputed objective values monotonic within tolerance).
- **Command:** `pytest tests/test_lexicographic_order.py -v`.
- **Expected artifact:** per-stage objective values showing non-degradation; allocation reflecting category goals.
- **Regression risk:** Medium — changes which optimum is selected (intended). **Rollback:** revert stage order.
- **FP risk:** Low (seeded). **Maintenance burden:** Low. **Complexity Δ:** small (reorder + 1 assertion).
- **YAGNI justification:** fixes the method's correctness with a reorder + assertion; no new machinery.
- **Priority:** P0 · **Estimate:** small · **Deps:** none · **Blocked-by:** none.

---

## 7. P1 correctness-hardening remediation plans (compact)

| Plan | Linked | Smallest viable fix | Files | Test / oracle | Command | Rollback | Pri/Est |
|---|---|---|---|---|---|---|---|
| **P1-A4** | A4 | Normalize antagonism slack (`slack/target_ratio`) before weighting so all L1 terms are dimensionless | `solver.py:813–822` | objective terms same order of magnitude; a 1-unit ratio violation ≈ a 1-unit adequacy violation | `pytest tests/test_objective_scaling.py` | revert | P1/small |
| **P1-A7** | A7 | **Delete** the dead floor-relaxation doc + `validate_output` check #9 unless the fallback is wanted (then implement) | `solver.py:524–556,719,928–932,1505–1512` | no dangling `clinical_floor_relaxed` reference; doc matches code | `grep clinical_floor_relaxed` | revert | P1/tiny (delete) |
| **P1-A8** | A8/E3 | Branch on `prob.status` → `unbounded/timeout/numerical/infeasible`, all → `DO_NOT_FEED` but diagnosable; surface a `Not Solved` incumbent | `solver.py:660–662` | a forced timeout returns `timeout`+`DO_NOT_FEED` (not "infeasible") | `pytest tests/test_status_taxonomy.py` | revert | P1/small |
| **P1-B4** | B4 | Store measured moisture/ash per ingredient; compute DM from data instead of 72%/1% | `nutrition.py`; `DB_ingredientes.json` | density for a high-DM ingredient (bone meal) differs from a wet one (egg) | `pytest tests/test_dry_matter.py` | revert | P1/medium (needs data) |
| **P1-B6** | B6 | Lower Cu SUL to a defensible value with citation | `toxicological_limits.json` | Cu ceiling ≤ cited safe upper | `pytest tests/test_sul.py` | revert | P1/tiny (**verify-first**) |
| **P1-B7..B10** | B7–B10 | Verify Fe/I/Mn/Zn SULs vs NRC/AAFCO; correct (Mn possibly too tight → infeasibility risk) | `toxicological_limits.json` | each SUL matches cited source; Mn-rich fixture stays feasible | `pytest tests/test_sul.py` | revert | P1/small (**verify-first**) |
| **P1-C6** | C6 | Add numeric `minimum`/`maximum` per nutrient in schema | `db_ingredientes.schema.json` | negative & `1e9` rejected | schema-gate | revert | P1/small |
| **P1-C7** | C7 | Bind key suffix → required unit in schema | `db_ingredientes.schema.json` | `chloride_mg`+`unit:g` rejected | schema-gate | revert | P1/small (with P0-5) |
| **P1-C8** | C8 | `additionalProperties:false` on the 7 object types | `db_ingredientes.schema.json` | typo'd key rejected | schema-gate | revert | P1/small (with P0-5) |
| **P1-C10** | C10 | Enforce DB `source_ref` ∈ registry; fix `beef_muscle` 170196→169483 | `DB_ingredientes.json`, `ingredient_registry.json` | referential-integrity check passes | `pytest tests/test_refs.py` | revert | P1/small |
| **P1-C11** | C11 | Add upper bounds + `min≤max` invariant to `lp_constraints` | `lp_parameters.schema.json` | `min>max` rejected | schema-gate | revert | P1/small (with P0-7) |
| **P1-C12** | C12 | Unify `ingredient_id` pattern + FDC-id type across schemas | both schemas | cross-schema id consistency check | `pytest tests/test_ids.py` | revert | P1/small |
| **P1-C13** | C13 | Require explicit `missing`/`not_applicable`; forbid ambiguous `measured:0` for safety nutrients | `DB_ingredientes.json`, schema | safety nutrient with `measured:0` flagged | schema-gate | revert | P1/small (with P0-6) |
| **P1-D2** | D2 | Send FDC key in a header; scrub `str(exc)`; **rotate the key** | `fdc_fetcher.py:260,272,367` | no `api_key` in any persisted artifact; key rotated | `grep -ri api_key data/ logs/` | revert | P1/small (security) |
| **P1-D3** | D3 | Treat empty FDC nutrient list as `MISSING`/error, not zero | `fdc_validator.py:76,90,143` | empty-200 fixture → `MISSING` | `pytest tests/test_fdc_empty.py` | revert | P1/small |
| **P1-D4** | D4 | Append-only, hash-chained audit log; ms timestamps; no rewrite of prior entries | `audit_logger.py`, `orchestrator:163` | tampering with a prior entry breaks the chain | `pytest tests/test_audit_chain.py` | revert | P1/medium |
| **P1-D5** | D5 | Make the countermeasure gate non-trivially defeatable (tie to git identity/signed marker) | `orchestrator.py` | editing the JSON field no longer satisfies the gate | `pytest tests/test_gate.py` | revert | P1/small |
| **P1-D6** | D6 | Verify CoFID sha256 on **every** load, not just first download | `cofid_fetcher.py:209–226` | a tampered cached CSV fails checksum | `pytest tests/test_cofid_checksum.py` | revert | P1/small |
| **P1-D7** | D7 | Wrap each fetcher call in try/except; parse `Retry-After` defensively (fallback; HTTP-date) | `fdc_fetcher.py:291` | a bad `Retry-After` isolates the source, doesn't crash the run | `pytest tests/test_fetch_isolation.py` | revert | P1/small |
| **P1-D8** | D8 | Commit before/atomically-with the swap, or treat failed commit as hard error → rollback from backup; actually `raise GitError` | `git_manager.py:22`, orchestrator step order | a failed commit triggers rollback; no unaudited swap | `pytest tests/test_provenance_atomic.py` | revert | P1/medium |
| **P1-E4** | E4 | Validate `runtime_request.json` against a schema/TypedDict before `AnimalInput(**dict)` | `cli.py` | malformed request → clean error, not `TypeError` | `pytest tests/test_runtime_input.py` | revert | P1/small |
| **P1-E5** | E5 | Replace the timeout stub with a real deterministic test (tiny `time_limit` or monkeypatched CBC `maxSeconds`) | `test_cascade_integration.py:332–336` | a forced timeout returns a safe result object | `pytest tests/test_cascade_integration.py -k timeout` | revert | P1/small |
| **P1-E6** | E6 | Add CI `schema-gate` + `import-smoke`; add Python 3.10–3.12 matrix; remove dead `types-pydantic` | `ci.yml` | CI red on schema drift / import failure / on 3.10 | CI run | revert | P1/small |
| **P1-E7** | E7 | Create one canonical bug-numbering scheme; cross-map legacy R/F/D IDs once (don't rewrite history) | `docs/governance/*` | a single index maps every legacy ID | doc review | revert | P1/small (doc) |

---

## 8. P2/P3 debt & simplification plans (YAGNI-constrained; prefer deletion; each needs no-regression proof)

| Item | Linked | Action (small) | No-regression proof | Pri |
|---|---|---|---|---|
| Remove dead code | D22, A19 | Delete `GitError`-never-raised (after D8), `verify_backup`-never-called (or wire in per D11), unused `FDC_RATE_LIMIT_DELAY_S`, unreferenced `weighted_normalized_deviation` (`solver.py:768–808`) | `pytest`+`mypy` green; `grep` shows no refs | P3 |
| Remove debug prints | E23/R-06 | Delete `solver.py:301,323` `[DEBUG]` prints (or gate behind `--verbose`) | tests green; no stdout noise | P3 |
| Fix tautological tests | E16 | Assert the **specific** expected status for seeded selections | the test fails on a perturbed expectation | P2 |
| Fix `audit_test_result` theater | E17 | `assert passed` (or delete helper); write logs to `tmp_path`, not the committed `test_audit_log.md` | a forced failure now fails the test; working tree stays clean | P2 |
| Add lexicographic proof | E18 | (covered by P0-10 test) assert per-stage objective non-degradation | proof test green | P2 |
| Curb doc-gen overengineering | E11 | Freeze `mapa.py`/`doc_introspector.py`; delete stale `build_pipeline.py` references; generate from the same source of truth as code (no new features) | `--gate-mapa` green; no false "NOT IMPLEMENTED" claims | P2 |
| Decompose `solver.py` | E12 | **Only if** needed for a P0 fix's safety/maintainability; otherwise **park** (YAGNI) | n/a unless triggered | P3/park |
| Consolidate type model | E10/E13 | **Only if** it reduces bugs; move to frozen dataclasses/pydantic at boundaries; resolve the "circular import" split | tests green | P3/park |
| Fix CLI exit codes + argparse | E15/E20/E21 | Use `argparse`; non-zero exit for unimplemented modes; fix `build_pipeline.py` branding; remove global `_NO_LIVE_EVIDENCE` | `gsd --bad` exits non-zero; `--help` works | P2 |
| Fix packaging | E19 | Add `requests` to `requirements.txt`; pin `jsonschema`; add a lockfile | `pip install -r requirements.txt` resolves; CI install reproducible | P2 |
| Fix mojibake names | C16 | Re-encode the 17 `display_name`s from source | names render correctly; tests green | P2 |
| Fix note maxLength | C19 | Trim the 1 over-long note (or raise limit deliberately) | schema-gate green | P3 |
| Document AA key overlap | C20 | Document which amino-acid keys are independent vs composite; prevent summing both | doc + a guard test | P3 |
| Validate bioavailability factors | C21/A12 | Key bio factors by real `ingredient_id`; assert every ingredient resolves; else **delete** the dead machinery | `bio != 1.0` for a known factor, or machinery removed | P2 |
| Remove hardcoded counts | C22 | Derive nutrient/ingredient counts; single source (registry) | counts match registry | P3 |

---

## 9. Consolidated roadmap (Phases 0–6)

**Phase 0 — Safety freeze + source-of-truth decisions + verify critical unknowns**
- **Goal:** make the system honest/fail-closed and settle decisions before deep work.
- **Plans:** §5 safety guard; **decisions:** P0-9 (A/B), P0-2 (hard vs soft antagonisms); **verify-first:** B2/B3 Ca/P ceilings, B1/B5 growth taper, B6–B10 SULs (primary sources); confirm D1 runtime (install `pydantic`).
- **Why first:** nothing unsafe should be emittable while we fix; decisions unblock P0-2/P0-9; numeric verification unblocks P0-3/P0-4.
- **Expected proof:** safety guard trips `DO_NOT_FEED`/`feed_safe=false` on the current repo; decision records written; numeric values cited.
- **Exit criteria:** guard merged; decisions recorded; verify-first values confirmed (or accepted-risk written).
- **Rollback:** delete the guard; decisions are reversible records.
- **Remaining risks:** numeric values still pending vet review (P0-4 especially).

**Phase 1 — Truthfulness + hard safety constraints**
- **Plans:** P0-1 (A3/E1/E2), P0-9 (A5), P0-10 (A1) — truthfulness; P0-2 (A2/A14/A6), P0-3 (B2/B3), P0-4 (B1/B5/B11) — hard safety.
- **Why this order:** truthful output + honest constraints are the safety core; A5/A1 are cheap and remove false claims.
- **Expected proof:** deficient/excess fixtures report correct status; ratio violation ⇒ not `SAFE_TO_FEED`; over-Ca fixture rejected; DER taper matches reference.
- **Exit criteria:** all P0-1..P0-4 tests green; safety guard's placeholder/slack/Ca checks no longer trip.
- **Rollback:** per-plan reverts; guard remains as backstop.
- **Remaining risks:** P0-4 needs vet sign-off before real use.

**Phase 2 — Data governance**
- **Plans:** P0-5 (C2/C3/C5/C7), P0-6 (C1/C9/C13), P0-7 (C4/C11), P1-C6..C13, BOM, duplicate units.
- **Why:** a truthful solver needs a canonical, schema-valid, unit-bound dataset.
- **Expected proof:** schema-gate green; adversarial typo/wrong-unit/duplicate records rejected; registry is the single source.
- **Exit criteria:** DB + all configs validate; CI schema-gate required.
- **Rollback:** revert data/schema edits.
- **Remaining risks:** tightening surfaces latent DB errors (intended; triage them).

**Phase 3 — Buildability**
- **Plans:** P0-8 (D1), import-smoke test, CI schema gate wiring.
- **Why:** the validation subsystem must import and run before its own fixes matter.
- **Expected proof:** `import gsd.validation.pipeline.orchestrator` OK; `tests/test_imports.py` green in CI.
- **Exit criteria:** `--validate-db` pipeline tier can start.
- **Rollback:** delete `_shared.py` (re-breaks — current state).
- **Remaining risks:** none significant.

**Phase 4 — Correctness hardening**
- **Plans:** P1-A4, P1-A8/E3, P1-B4, P1-B6..B10, P1-D2..D8, P1-E4/E5/E6/E7.
- **Why:** after the safety core, harden status taxonomy, real moisture/ash, verified SULs, validation security/robustness, CI gates, input validation.
- **Expected proof:** distinct status taxonomy; SULs match sources; key rotated; audit chain tamper-evident; CI gates red-on-drift.
- **Exit criteria:** all P1 tests green; security grep clean.
- **Rollback:** per-plan reverts.
- **Remaining risks:** D4/D8 are medium-effort; sequence after D1.

**Phase 5 — Test quality & proof**
- **Plans:** replace tautological tests (E16/E17), add lexicographic proof (E18/P0-10), deterministic replay (§10), regression fixtures.
- **Why:** make the suite able to *catch* regressions, not just pass.
- **Expected proof:** a perturbed expectation fails the relevant test; replay is byte-identical.
- **Exit criteria:** no tautological asserts; committed `test_audit_log.md` no longer mutated.
- **Rollback:** revert test edits.
- **Remaining risks:** low.

**Phase 6 — Debt & simplification**
- **Plans:** §8 items (dead code, debug prints, doc-gen curb, CLI/packaging, refactors **only if justified**).
- **Why:** last, because deletions are safest once behavior is pinned by Phase 5 tests.
- **Expected proof:** `pytest`+`mypy` green after each deletion; LOC down.
- **Exit criteria:** no dead code/debug prints; packaging reproducible.
- **Rollback:** revert deletions.
- **Remaining risks:** god-module/type-model refactors stay **parked** unless a concrete need appears.

---

## 10. Verification & proof plan

- **Fixed seed policy:** CBC `randomSeed=12345`, `threads=1` (already set, `solver.py:657`); **freeze time** in tests (inject a fixed `datetime`, never `now()`); no unseeded randomness (none found in `src/gsd`); deterministic dict ordering where output is compared.
- **Reproducible command format:** `python -m pytest <test> -v` with the fixture path + seed in the test name; for the CLI: `python -m gsd.cli --runtime --request <fixture.json>` producing a JSON contract diffed against a golden file.
- **Minimal counterexample format:** 2–3 ingredient fixtures (pattern already in `test_level1_optimal_synthetic`) — the smallest selection that triggers the invariant.
- **Failure evidence format (required for every fix):** `test name · stated invariant · file/module · function · minimal input · seed · expected · actual · reproducible command`.
- **Cheap differential oracle (primary):** re-substitute returned grams into the hard constraints / recompute `value` vs `(target_min,target_max)` in pure Python and assert agreement (used by P0-1, P0-2, P0-3, A13).
- **Changed-line coverage policy:** *optional*, only if a P0 fix touches a complex function (`build_lp_problem`); not a blanket requirement (YAGNI).
- **Manual mutation spot-check policy:** *only if* a regression escapes the suite; one targeted manual mutation (e.g. flip a `>=` to `>` in a safety constraint) to confirm a test catches it. Not continuous.
- **Zero-tolerance flake policy:** any test that fails intermittently is a bug; root-cause (usually time/order/seed) before re-enabling.
- **Near-zero false-positive policy:** a test must fail for the *right* reason; assert the specific invariant, not a broad disjunction (fixes E16).
- **Storing regression evidence:** each fix PR records the failure-evidence block + the golden output in `tests/fixtures/`; CI re-runs the reproducibility re-check.
- **Avoiding "AI says fixed":** every claim of "fixed" must cite a green test + seed + artifact; the safety guard (§5) independently re-detects the original defect until the real fix lands.

---

## 11. Commands (copy-paste; bash confirmed in this Linux sandbox — Python fallback noted)

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

# 3. Import smoke test (P0-8 / CI)
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
python -m pytest tests/test_cascade_integration.py -q            # seeded CBC → reproducible
python -m pytest tests/test_cascade_integration.py::test_LEVEL1_OPTIMAL_SYNTHETIC -q   # replay specific case

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
**Python fallback (if bash unavailable):** every command above is already `python - <<'PY' …` or `python -m pytest …`; run them via `python -c` / a `.py` script. **Tell me your environment** if it isn't Linux/bash and I'll adjust (e.g. Windows PowerShell here-strings).

---

## 12. Documentation & source-of-truth reconciliation plan (planning only — no rewrites until approved)

| Doc path | Drift type | Evidence (current repo) | Update doc to match code? | Code wrong vs intended spec? | Recommended update | Pri | Blocks remediation? | Source-of-truth decision needed? |
|---|---|---|---|---|---|---|---|---|
| `README.md` ("schema-validated", "SAFE_TO_FEED") | overstates maturity | DB fails schema (21 err); nutrient_results hardcoded | Yes (after P0-1/P0-6) | Code is wrong (fixing in P0) | Add pre-alpha warning; remove "validated" until gate green | P0 | Yes (warning = §5) | No (code fix pending) |
| `data/objective_weights.json` vs solver objective | doc/config ≠ code | solver uses `CRITICALITY_WEIGHT`; JSON unused | Depends on P0-9 decision | **Decision needed** | P0-9 Option A: delete JSON + document real objective; B: wire in | P0 | Yes (P0-9) | **Yes (A/B)** |
| `constraints.json` `HARD_FAIL_INFEASIBLE` vs soft antagonisms | config ≠ code | solver adds slack (`solver.py:426–477`) | Depends on P0-2 decision | **Decision needed** | P0-2: honor hard (recommended) or relabel config soft | P0 | Yes (P0-2) | **Yes (hard/soft)** |
| `scenarios.json` labels ("Desaconselhado"/k=2.0 vs recommended/k=1.2) | inverted labels | `core.py:199–207`; NRC growth ≈2–3×RER | After P0-4 | Code is wrong (fixing) | Relabel per P0-4 | P0 | Yes (P0-4) | **Yes (vet-reviewed taper)** |
| Bug-numbering schemes (R/F/D) | 3 inconsistent schemes | REVIEW.md vs README vs amendment | Cross-map once | n/a | One canonical index (P1-E7) | P1 | No | No |
| `MAPA_COMPLETO_*.md` / `mapa.py` claims | false "NOT IMPLEMENTED" | team's own self-review found drift | Regenerate from source of truth | Doc-gen output stale | Curb doc-gen; regenerate (Phase 6) | P2 | No | No |
| Nutrient counts (41/43/46/54) | inconsistent | bounds 41 / DB 43 / core 46 / minimal 54 | After P0-5 | Fragmentation | Single count from registry (P0-5/B18) | P1 | No (folded into P0-5) | No |
| Schema badges | claim > reality | orphaned lp_parameters schema; DB fails | After P0-6/P0-7 | Code/data wrong | Badges reflect green gates only | P1 | No | No |
| Validation pipeline status | implied working | `_shared.py` missing → can't import | After P0-8 | Code broken (fixing) | State "pipeline restored" only after import-smoke green | P0 | Yes (P0-8) | No |

**Rule honored:** no documentation is rewritten by this plan; each row is a *decision + recommended update* awaiting your approval.

---

## 13. Risk & pre-mortem (for the remediation effort itself)

- **What could go wrong:** (a) P0-3/P0-4 numeric values chosen without primary-source verification → "fixed" but scientifically wrong; (b) making antagonisms hard (P0-2) and adding Ca/P ceilings (P0-3) makes many selections infeasible → user perceives "the tool broke" (it got *safer*); (c) P0-5 schema tightening surfaces a wave of latent DB errors; (d) P0-9 Option B silently changes every solution.
- **Fixes that could introduce regressions:** P0-1 (output-contract shape), P0-2 (feasibility set shrinks), P0-4 (all growth totals change), P0-10 (which optimum is selected), P1-D8 (swap/commit ordering).
- **Simplifications that could remove hidden behavior:** deleting `objective_weights.json` (P0-9A) removes the *documented* gonadal/asymmetric penalties — confirm they aren't silently relied on by docs/users; deleting dead code (Phase 6) only after Phase 5 tests pin behavior.
- **Doc updates that could mask unresolved spec conflicts:** relabeling scenarios (P0-4) or updating README before the code fix lands would hide the defect — sequence code-fix → doc-update.
- **Parked items that could become urgent:** second-solver differential (if CBC ever suspected), model-based pipeline tests (after D1, if orchestration bugs appear), `solver.py` decomposition (if a P0 fix becomes hard to make safely in the god-module).
- **Early-warning signals to escalate:** any infeasibility spike after P0-2/P0-3; any non-deterministic output (breaks proof discipline); any schema-gate that can't go green without large rewrites; any SUL value that can't be cited.
- **Fixes requiring veterinary nutritionist review before merge:** **P0-3** (Ca/P ceilings), **P0-4** (growth-energy taper + labels), **P1-B6..B10** (SULs), and final sign-off before any real-world feeding.

---

## 14. Document 2 change requests

The full "Document 2: Applicability & Tradeoff Synthesis" was **not provided**; only its verification-method list (embedded in the task prompt) was available, so these requests address that list against repo evidence:
- **Expensive differential testing with a second solver backend** — Document 2 likely lists this as an option. **Conflicting evidence:** CBC is *not* suspected; the LP math is verified sound and the bugs are in wiring/data/output. **Recommended change:** mark it **not triggered / reject** for this project. **Severity:** Low. **Pause?** No.
- **AST/CFG-aware context retrieval**, **autonomous triage/patch loops**, **continuous mutation testing**, **nightly CI**, **full RunManifest machinery** — **Conflicting evidence:** no current trigger (hard rules). **Recommended change:** mark **parking lot / reject** unless a concrete trigger appears. **Severity:** Low. **Pause?** No.
- **Cheap differential testing by recomputing LP feasibility**, **executable specs/schema invariants**, **zero-trust deterministic execution**, **minimal PR-gated CI**, **proof discipline** — **Confirmed applicable**; keep. No change needed.

If the full Document 2 contains scope/applicability claims beyond this method list, provide it and I'll reconcile precisely. **Otherwise: no further Document 2 change requests.**

---

## 15. Missing context list (high-leverage only)

1. **Full "Document 2: Applicability & Tradeoff Synthesis"** — to reconcile scope precisely (I filtered the embedded method list as a proxy).
2. **Source-of-truth decisions** (you must make): P0-9 **A/B** (objective source); P0-2 **hard vs soft** antagonisms; whether code or docs wins for scenario labels (P0-4).
3. **Authoritative numeric values** (verify-first, ideally vet-supplied): AAFCO Large-Breed-Growth **Ca and P ceilings** (P0-3); **NRC/FEDIAF growth-energy taper** by age/weight-band (P0-4); **Cu/Fe/I/Mn/Zn SULs** (P1-B6..B10).
4. **The animal model:** the intended age/weight-band range for the GSD growth scenarios (needed to shape P0-4's schedule).
5. **`chicken_blood_raw` magnesium true value** (20.5 vs 5.0 mg) — which FDC/source value is correct (P0-5).
6. **FDC API key rotation** confirmation (D2 — presume leaked).
7. **Veterinary nutritionist** contact for the mandatory sign-off gates.
8. **Environment confirmation** if not Linux/bash (affects §11 commands).

---

## 16. Decision gates — when is this plan ready for implementation?

| Gate | Status |
|---|---|
| Findings reconciled against current repo evidence | ✅ Done (§2, §4 — all Critical confirmed; D1 static; SUL numerics verify-first) |
| Critical safety defects have P0 remediation plans | ✅ P0-1..P0-10 + §5 safety freeze |
| Every accepted plan is PR-sized | ✅ (each plan = one small PR; P0-5/P0-4 are the largest, still single-concern) |
| Every fix has proof or explicit accepted risk | ✅ (oracle + command + artifact per plan; §10) |
| Every YAGNI violation has a cleanup decision | ✅ (§3 filter; §8 deletions; A7/E12/E10 park-or-delete) |
| Every stale doc has a reconciliation decision | ✅ (§12) |
| No speculative infrastructure in the "fix now" set | ✅ (2nd solver, AST/CFG, autonomous patch, continuous mutation, nightly CI all rejected/parked) |
| No unbuilt planned component treated as built | ✅ (all fixes are proposed; safety guard detects defects until real fixes land) |
| No safety-critical item deferred without risk acceptance + interim safeguard | ✅ (§5 fail-closed guard covers A2/A3/B2/C1/D1 until P0 fixes) |
| The plan fits a solo hobby project | ✅ (small, reversible, deletion-biased; no enterprise infra) |
| Independent veterinary nutritionist sign-off included before real-world use | ⚠️ **Required gate** — P0-3/P0-4/SULs need vet review; final sign-off before feeding (§13) |
| **Open decisions blocking start of Phase 1** | ⚠️ P0-9 A/B; P0-2 hard/soft; verify-first numerics (P0-3/P0-4/B6–B10) |

**Plan status: DRAFT — ready for your review.** Phase 0 (safety freeze + decisions + verification) can start immediately; Phase 1 starts once the two source-of-truth decisions (P0-9, P0-2) are made and the verify-first numerics are confirmed.

---

*Prepared as a planning artifact only. No code, data, schema, or documentation in the repository was modified. All repo-specific claims are backed by `grep`/`sed`/live-JSON evidence gathered this session; numeric nutrition values marked "verify-first" require primary-source/veterinary confirmation before implementation.*
