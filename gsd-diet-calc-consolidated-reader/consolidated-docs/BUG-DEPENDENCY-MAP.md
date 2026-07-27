# BUG / DEPENDENCY MAP — gsd-diet-calc v10.4.0

**Role.** A standalone reference map of every software defect catalogued in Parts 1–3 of the consolidated documentation set, the tasks that repair them, the decision gates that govern the fixes, and the dependency relationships between all of the above. This is the navigational companion to the three-part reading arc: Part 1 is the diagnosis (what's broken), Part 2 is the treatment (how to fix it), Part 3 is the synthesis (the verified bottom line). This map is the graph view — it shows how the bugs relate to each other, which ones block which, and in what order they must be fixed.

**How to use this map.**
- **§A** is the complete bug catalog — 107 raw finding IDs across 5 subsystems (A/B/C/D/E) — was 105, +2 = E24/E25 per AUDIT_DELTA. Part 1 §9.2 aggressively deduplicates these to **79 unique findings** (was 77; +2 from AUDIT_DELTA — merging cross-referenced defects like A3/E1, A2/A14, B1/B11, C2/C3/C5/C7); the master priority table (§10.1) lists them as ~98 individual rows (was ~96; +2 = E24+E25 per AUDIT_DELTA). Organized by severity (P0 → P3), then cross-cutting concerns, integration points, systemic patterns, and probe numbers.
- **§B** is the 3 decision gates (G1/G2/G3) plus the 10-point implementation-readiness checklist.
- **§C** is the complete fix-task catalog — **35 formal tasks** (B0–B12, C1–C16, R1–R5) across 4 phases, plus **12 P2/P3 debt items** not assigned formal task IDs (was 11; +1 = E25 per AUDIT_DELTA).
- **§D** is the dependency graph (45 edges; was 44 — +1 = E24-fix co-requisite for B5 DoD per AUDIT_DELTA) with the critical chain highlighted.
- **§E** is the safety relationships — the verdict fusion, the three seams, the "contracts in name only" pattern, the B0 containment layer, and the decisive protection (B1 + B2b).
- **§F** is the execution order — 4 phases, with the critical chain and the G3-parallel lane.
- **§G** is the verified-facts appendix — 28 execution-verified facts (was 27; +1 = E24 per AUDIT_DELTA), the 6 empirically-cleared non-defects, and the legacy review reconciliation.
- **§H** is the one-sentence verdict and its operational consequence.

**Source of truth.** Part 1 §9–§10 (findings + probe numbers), Part 2 §4 + §10 + §13 + §15 (tasks + dependency tree + doc-drift + readiness gates), Part 3 §1–§12 (gates + B5 escalation + B12 reframing + verified facts + verdict).

**Verification baseline.** Commit `c932a21` (2026-07-25). `pulp==3.3.2`, CBC MILP backend, `jsonschema` Draft 2020-12. The direct-execution verification found **zero hallucinations** in the Critical findings.

---

## §A.0 Namespace note — read before using any ID

Four namespace collisions exist in this documentation set and are disambiguated in `APPENDIX-ID-KEY.md`:

| Token | Meaning 1 | Meaning 2 | Meaning 3 |
|---|---|---|---|
| **C4** | Finding C4 (DATA-F4, Critical P0): `lp_parameters.schema.json` orphaned — validates no real file | Task C4 (P1, SUL verification for Cu/Fe/I/Mn/Zn, blocked by G3+vet) | — |
| **C7** | Finding C7 (DATA-F7, High P1): unit not bound to nutrient key | Task C7 (D3 empty-200 validation fix) | — |
| **C16** | Finding C16 (DATA-F16, Medium P2): mojibake in 17/28 display names | Task C16 (dead floor-relaxation doc + file-handle leak) | — |
| **R1** | Governance review R1 (= A2 antagonism slack) | Regression task R1 (tautological assertions) | Legacy REVIEW.md R-01 (= A2) |

The finding-vs-task distinction is determined by context. When a row in §C says "C7 repairs D3," C7 is the **task**. When §A.2 lists "C7" among findings, C7 is the **finding**.

**AUDIT_DELTA note (E24/E25 — no new namespace collisions):** The two new finding IDs **E24** (pydantic undeclared, F-PKG-2) and **E25** (`mapa.py` `tests/` import, F-PKG-3) are **finding-only IDs — no task collision**. E24-fix is scope-expanded into B5 + C14 (no new task ID); E25-fix is added as §C.5 debt item #12 (no task ID). The 4 existing namespace collisions (C4/C7/C16/R1) are unchanged.

---

## §A. The Bug Catalog — 107 raw findings, 5 subsystems, 79 deduplicated (Part 1 §9.2; +2 raw / +2 dedup = E24+E25 per AUDIT_DELTA)

The 107 raw finding IDs organize into 5 subsystems (the A/B/C/D/E series). Part 1 uses a dual-namespace: each finding has both a subsystem-letter ID (A1–A20, B1–B18, C1–C22, D1–D22, E1–E25) **and** a machine tag (`LP-F*`, `NUTR-F*`, `DATA-F*`, `VAL-F*`, `F-CONTRACT-*`, `F-ARCH-*`, `F-TEST-*`, `F-CLI-*`, `F-CII-*`, `F-DOC-*`, `F-TYPE-*`, **`F-PKG-*`** [AUDIT_DELTA — added for E24/E25 packaging defects]).

**Severity → priority mapping** (base case): Critical → P0, High → P1, Medium → P2, Low → P3.

**Decoupling exceptions** (severity and priority are independent axes):
- **A5**: rated Critical in initial review, **downgraded to High**, but **retained at P0** — the `objective_weights.json` wiring gap is a trustworthiness defect and maintenance trap regardless of severity.
- **B6, B7, B8, B9, B10**: flagged **High (verify)** — the values are suspicious (the FEDIAF 2025 PDF did not parse cleanly during review); they must be re-confirmed against primary sources before merge, not treated as definitively wrong.
- **A19, A20, B13**: Medium severity but **P3 priority** (not P2) — dead/cosmetic/rejected-bounds defects that don't impact correctness or safety.

### A.1 The 11 P0 / Critical bugs (the safety-critical core) — was 10; +1 = E24 per AUDIT_DELTA

| # | ID(s) | Machine tag(s) | Subsystem | The bug | Why it's Critical |
|---|---|---|---|---|---|
| 1 | **A2** / **A14** / R1 / R-01 | LP-F2 / LP-F14 | LP solver | 5 mineral-antagonism constraints (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg) declared `HARD_FAIL_INFEASIBLE` but implemented with slack — soft at every cascade level. A14 is the L2/L3 half (unbounded + unpenalized). | Diet that violates ratios can be returned `SAFE_TO_FEED`. The `HARD_FAIL_INFEASIBLE` flag appears 60 times in `constraints.json` (5 antagonism + 55 nutrient minimums/limits); all 5 antagonisms are silently soft. |
| 2 | **A3** / **E1** / **E2** / R4 / R-09 | LP-F5 / F-CONTRACT-1 / F-TEST-2 | Output contract + tests | `nutrient_results` hardcoded `"adequate"` with `pct_of_min: None` for every nutrient, regardless of solver output (**A3/E1**). No test verifies `nutrient_results` correctness — only `len >= 41` is asserted (**E2**). | User cannot see any defect — the report lies, and no test catches the lie. |
| 3 | **B2** | NUTR-F3 | Nutrition | No absolute calcium maximum; only ratio constraints (Ca:P 1.1–1.3, Ca:Mg 12–18). AAFCO LBG ceiling (~4.5 g/1000 kcal) missing. | Ca + P scale together past safe ceiling → developmental orthopedic disease in large-breed puppies. |
| 4 | **B1** / **B11** | NUTR-F1 / NUTR-F2 | Nutrition | Flat `k=1.2×RER` growth energy (no age taper); scenario labels inverted (`rapid_growth_discouraged`=2.0 is steered away from; `slow_growth_recommended`=1.2 is default). | Puppies underfed ~40–60%. |
| 5 | **C1** | DATA-F1 | Data/CI | `DB_ingredientes.json` fails its own schema (21 errors: 20 measured entries missing `unit`; 1 `note` 208 > maxLength 200); no CI gate catches it. | LP can ingest 1000×-off mineral value silently — silent-poisoning vector. |
| 6 | **C2** / **C3** / **C5** / **C7** | DATA-F2/F3/F5/F7 | Data/Schema | No canonical nutrient namespace; 3 competing schemes (DB `_mg`/`_ug`, solver `_g`, drift unit-less); duplicate conflicting units (`chicken_blood_raw` Mg 20.5 vs 5.0 mg); unit not bound to key (`chloride_mg` with `unit:"g"` passes). | Typos silently match wrong nutrients. Zero overlap in key naming across the 3 schemes. |
| 7 | **C4** | DATA-F4 | Schema | `lp_parameters.schema.json` (44 KB) orphaned — validates no real file; describes obsolete `breed`/`domains` shape; actual config (`NUTRIENT_REGISTRY`/`solve_cascade`) fails 3 errors. | 44 KB dead artifact; real config unchecked. |
| 8a | **E24** *(AUDIT_DELTA / NEW-1)* | F-PKG-2 | Packaging/import | `pydantic` imported at runtime (`schemas.py:10`) but never declared in `pyproject.toml` / `requirements.txt` / CI install line. `types-pydantic` (stub-only) listed; real `pydantic` absent. | **Upstream of D1, not parallel.** `orchestrator.py:37` (`from ..schemas import (...)` [pydantic]) fires BEFORE `orchestrator.py:54` (D1) — in a clean `pip install -e ".[test]"` venv, line 37 fails first and D1 is never reached to be diagnosed. **B5's DoD still fails post-B5 until E24 ships too.** Independently satisfies B0 trip-condition-5 (accidentally). **C14 scope gap:** "remove dead `types-pydantic`" never adds real `pydantic` — fixed by scope-expanding B5 + C14 (no new task ID). |
| 8 | **D1** | VAL-F1 | Validation | `validators/_shared.py` missing → entire validation package `ModuleNotFoundError`. 4 importers cannot import. | **CI is RED today** — breaks pytest *collection* (`collected 150 items / 3 errors` in phase1/phase5/phase6, `Interrupted: 3 errors during collection`, no test runs in a clean `pip install -e ".[test]"` env). **AUDIT_DELTA / NEW-2 correction:** the earlier "191 tests collected, 1 error in 1.96s" transcript was captured with `pydantic` pre-installed in the review sandbox and masked **E24**. Verdict unchanged — D1 still real, B5 still right, CI still RED. Blocks all verification (Part 3 §9 escalation). |
| 9 | **A5** (Critical→High, retains P0) | LP-F4 | LP/config | `objective_weights.json` (322 lines, 29 weights) never read by `solver.py` (0 refs; solver uses hardcoded `CRITICALITY_WEIGHT` at `solver.py:16`). | System optimizes different objective than docs claim — trustworthiness gap + maintenance trap. |
| 10 | **A1** | LP-F1 | LP solver | Lexicographic stage order inverted (L1/L2 swapped): non-fixed stage is in the middle, so category goals and tie-break have ZERO effect on Level 1/2 allocations. | Level-1 allocation is not what config intended; nullifies category goals. |

### A.2 The 30 High / P1 bugs

Part 1 §10.1 enumerates 30 P1 rows. The prior version of this map listed only 23 (omitting 7 C-series schema findings). The complete list:

#### A.2.a LP objective-truthfulness cluster (4 findings)

| ID(s) | Machine tag | The bug |
|---|---|---|
| **A4** | LP-F3 | Antagonism penalty unit mismatch: raw g/mg slack × 5000–7000 dominates dimensionless normalized objective by ~500×. |
| **A6** / R5-mechanism | LP-F6 | `solver_status`/`feeding_recommendation` purely config-driven (which level solved), never conditioned on realized slack magnitude. No path to escalate on realized violations. |
| **A7** | LP-F7 | Documented clinical-floor relaxation fallback (`clinical_floor_relaxed`) never set; `validate_output` assertion #9 is dead code. |
| **A8** / **E3** | LP-F8 / F-CONTRACT-2 | All non-`Optimal` CBC statuses collapse to `"infeasible"`; fails closed but conflates Unbounded/Undefined/timeout. |

#### A.2.b Nutrition SUL cluster (8 findings, all "verify")

| ID | Machine tag | The bug |
|---|---|---|
| **B3** | NUTR-F4 | No phosphorus maximum; P can scale up with Ca, perturbing Ca:P. |
| **B4** | NUTR-F5 | Hardcoded 72% moisture / 1% ash denominator — fabricated dry-matter fraction biases all DM conversions. |
| **B5** | NUTR-F6 | No age tapering (the age-tapering half of B1's growth-energy defect). |
| **B6** *(verify)* | NUTR-F7 | Copper SUL = 100 mg/1000 kcal (~400 mg/kg DM) too permissive; GSD copper-storage propensity; hepatotoxicity risk. |
| **B7** *(verify)* | NUTR-F8 | Iron SUL = 130 mg/1000 kcal — confirm vs NRC. |
| **B8** *(verify)* | NUTR-F9 | Iodine SUL = 2.5 mg/1000 kcal may exceed AAFCO max (~5 mg/kg DM) → thyroid risk. |
| **B9** *(verify)* | NUTR-F10 | Manganese SUL = 15 mg/1000 kcal possibly too tight (~1000 mg/kg real ceiling) → infeasibility risk. |
| **B10** *(verify)* | NUTR-F11 | Zinc SUL = 300 mg/1000 kcal (~1200 mg/kg DM) — confirm vs NRC. |

#### A.2.c Data/Schema cluster (7 findings — **previously missing from this map**)

| ID | Machine tag | The bug |
|---|---|---|
| **C6** | DATA-F6 | No numeric bounds on any nutrient value; negative values and `1e9` pass validation. |
| **C8** | DATA-F8 | `additionalProperties: false` missing on 7 object types → silent typo'd keys. |
| **C9** | DATA-F9 | UTF-8 BOM makes 2 files unloadable by strict parsers (`nutrient_set_minimal.json`, `nutrient_safety.schema.json`). |
| **C10** | DATA-F10 | DB↔registry FDC-id referential integrity broken (18 DB `source_ref`s not in registry; 12 registry IDs never cited; `beef_muscle` 170196 vs 169483). |
| **C11** | DATA-F11 | `lp_constraints` has no upper bound and no `min ≤ max` invariant. |
| **C12** | DATA-F12 | Identity rules inconsistent across schemas (`ingredient_id` pattern + FDC-id type). |
| **C13** | DATA-F13 | 3-state contract collapses: `missing` used 0 times, 48 `measured=0` conflate "0" with "unknown", 36 `not_applicable`. |

#### A.2.d Validation pipeline cluster (7 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **D2** | VAL-F2 | FDC API key leaked in URL query string and `str(exc)` to persisted audit/logs. |
| **D3** | VAL-F3 | Empty FDC "200 with no nutrients" accepted as clean validation (empty-200 → `CLEAN` not `MISSING`). |
| **D4** | VAL-F4 | Audit trail overwrite-mode, mutable, not tamper-evident; second-resolution timestamps collide. |
| **D5** | VAL-F5 | Circuit-breaker countermeasure gate defeatable by editing a JSON field. |
| **D6** | VAL-F6 | CoFID checksum pinning bypassed once CSV is cached (cache poisoning / silent drift). |
| **D7** | VAL-F7 | Uncaught exceptions in fetch loop crash entire run; `int(Retry-After)` raises `ValueError` on HTTP-date; no partial-failure isolation. |
| **D8** | VAL-F8 | Failed git provenance commit silently swallowed after live DB already swapped; `commit_validation_run` returns `None` instead of raising `GitError`. |

#### A.2.e Cross-cutting cluster (4 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **E4** | F-CONTRACT-3 | `--runtime` input unvalidated ad-hoc dict; `AnimalInput(**dict)` constructed directly from `runtime_request.json`. |
| **E5** | F-TEST-1 | `test_solver_timeout_returns_result` is a stub that never runs solver; passes unconditionally. |
| **E6** | F-CII-1 | CI does not run schema/MAPA gates README advertises; single Python 3.12 (no matrix vs `requires-python>=3.10`); dead `types-pydantic` dep. |
| **E7** | F-DOC-1 | Three mutually inconsistent bug-numbering schemes (`R-01..R-09` in REVIEW.md, `R-01/R1..R-06/R7` in README/amendment, `F1..F6`/`D1..D2` amendment list). |

**P1 total: 4 + 8 + 7 + 7 + 4 = 30 findings.** ✓ matches Part 1 §10.1.

### A.3 The Medium / P2 bugs (43 findings per master table post-AUDIT_DELTA; was 42, +1 = E25; Part 1 §9.2 dedup count = 30)

#### A.3.a LP numerical-robustness (A9–A18, 10 findings; A14 counted in P0 above, A19/A20 are P3)

| ID | Machine tag | The bug |
|---|---|---|
| **A9** | LP-F9 | Big-M fallback to 10000 g when `EM_i` unavailable; M/floor ratio ~1e5 weakens MILP relaxation. |
| **A10** | LP-F10 | Tie-break auto-scale rule can scale weight below simplex precision floor → numerically invisible, degenerate tie-breaking. (Legacy R-03.) |
| **A11** | LP-F11 | Sanity assertion compares raw vs converted nutrients WITHOUT bioavailability factor → real bio-factor bug passes. |
| **A12** / **C21** | LP-F12 / DATA-F21 | Bioavailability-factor lookup keys are generic tokens (`"muscle"`, `"liver"`) that never match real `ingredient_id`s → bio always 1.0; entire bioavailability machinery is dead. |
| **A13** | LP-F13 | Rounded grams never re-validated against hard constraints → rounding can push delivered diet marginally out of spec. |
| **A15** | LP-F15 | PuLP silently creates two variables with the same name → latent duplicate-named-variable corruption. |
| **A16** | LP-F16 | `calorical_density` target is fixed scenario constant (`4500 kcal/kg_DM`), not a derived variable. |
| **A17** | LP-F17 | `fix_optimum` bound `optimal_obj*(1+tol_rel)+tol_abs` over-constrains near-zero objectives → infeasibility risk for later stages. |
| **A18** | LP-F18 | Wide coefficient range (~1e8) in objective and constraints → CBC numerical stress, simplex precision loss. |

#### A.3.b Nutrition correctness (B12, B14–B18, 6 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **B12** | NUTR-F12 | `cobalamin_b12_mg` unit/bound likely off by ~1000× (`hard_max 500` for mg-scale nutrient). |
| **B14** | NUTR-F14 | Bone Ca:P ≈ 1.94 slightly low vs hydroxyapatite (~2.0–2.2); `chicken_neck` Ca disagrees ~2.7× between `DB_ingredientes` and `bone_mineral_mix`. |
| **B15** | NUTR-F15 | Taurine absent from nutrient set (breed-relevant for DCM concerns). |
| **B16** | NUTR-F16 | Vitamin-D AAFCO minimum not represented in matrix (still enforced via another path). |
| **B17** | NUTR-F17 | Vitamin-A and iron SULs mislabeled in notes; Zn SUL slightly permissive. |
| **B18** | NUTR-F18 | Nutrient-count inconsistency: 41 (solver) / 43 (DB claim) / 46 (`core.py` comment) / 54 (`nutrient_set_minimal.json`). |

#### A.3.c Schema completeness (C14–C18, 5 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **C14** | DATA-F14 | `lp_parameters.schema.json` uses Draft-07 `definitions` under Draft 2020-12 dialect; bounds sparse. |
| **C15** | DATA-F15 | `nutrient_safety.schema.json`: no coverage requirement, no `$id`, not closed, BOM. |
| **C16** *(finding)* | DATA-F16 | Mojibake in 17/28 `display_name`s (double-encoded UTF-8). *(Note: "C16" is also a task ID — see §A.0.)* |
| **C17** | DATA-F17 | Schema self-contradiction on nutrient count (46 vs 43). |
| **C18** | DATA-F18 | `ingredient_registry.schema.json`: not closed, no `$id`, sub-objects open. |

#### A.3.d Validation hardening (D9–D18, 10 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **D9** | VAL-F9 | `atomic_swap` uses `os.replace` from `/tmp` → cross-device `EXDEV` failure mid-apply; no fallback. |
| **D10** | VAL-F10 | `CachedFetcher` staleness flag computed and discarded; `FetchResult` has no metadata field. |
| **D11** | VAL-F11 | Backup timestamp collision (second-resolution) + `verify_backup` defined but never called before swap. |
| **D12** | VAL-F12 | `int(Retry-After)` and 429 retry contradict documented "no retry" rule. |
| **D13** | VAL-F13 | No `User-Agent` on any outbound HTTP (FDC + CoFID). |
| **D14** | VAL-F14 | Open/Closed + DIP violations: `isinstance` routing and concrete-fetcher coupling. |
| **D15** | VAL-F15 | Encapsulation breach: orchestrator imports deviation's private helpers. |
| **D16** | VAL-F16 | `LocalFdcFetcher` breaks parent invariants (Liskov) with `/dev/null` and `None` rate_limiter. |
| **D17** | VAL-F17 | Registry schema validation silently skipped when `jsonschema` absent (degrade-silent anti-pattern). |
| **D18** | VAL-F18 | Type-safety holes despite mypy-strict policy (`type:ignore` and `Any` leaks). |

#### A.3.e Architecture/types/CLI/tests/packaging (E8–E19 + E25, 13 findings) — was 12; +1 = E25 per AUDIT_DELTA

| ID | Machine tag | The bug |
|---|---|---|
| **E8** | F-CONTRACT-4 | Solver output written with leaked file handle (`json.dump` without `with`/close). |
| **E9** | F-ARCH-1 | `core.py` grab-bag mixing infrastructure/domain/documentation (594 lines). |
| **E10** | F-ARCH-2 | Type model split across two modules (`type_definitions.py` + `core.py`) "to avoid circular imports" — layering smell. |
| **E11** | F-ARCH-3 | 42% of package is doc-gen machinery (`mapa.py` 1422 + `doc_introspector.py` 1106 = 2496 of 5881 LOC); MAPA has shipped false "NOT IMPLEMENTED" claims. |
| **E12** | F-ARCH-4 | `solver.py` 1661-LOC god module; `build_lp_problem` alone is 474 lines. |
| **E13** | F-TYPE-1 | `TypedDict(total=False)` everywhere = no runtime enforcement; documentation-only type model. |
| **E14** | F-TYPE-2 | Duplicate, weakly-typed type-guard helpers (9 guards overlap with Literal types and each other). |
| **E15** | F-CLI-1 | No `argparse`; hand-rolled `sys.argv` parsing with no proper exit codes. |
| **E16** | F-TEST-3 | Tautological assertions that pass even if LP is wrong (`solver_status in (...)` is true by construction). |
| **E17** | F-TEST-4 | `audit_test_result` logs pass/fail but never asserts; mutates committed file `test_audit_log.md`. |
| **E18** | F-TEST-5 | Lexicographic *dominance* not actually verified — test checks stage names/order, not that each stage's optimum is preserved. (Legacy R-02.) |
| **E19** | Packaging | `requirements.txt` missing `requests`; `jsonschema` unpinned; `pulp==3.3.2` pinned only; no lockfile. |
| **E25** *(AUDIT_DELTA / NEW-3)* | F-PKG-3 | `src/gsd/mapa.py:988` imports `from tests.reference_cases import ...` — `tests/` is not packaged (`pyproject.toml` `[tool.setuptools.packages.find] where=["src"]`). Blocks `--gate-mapa` live-evidence only under a wheel (non-editable) install; low-probability today (`license = "Private project — not for distribution"`). **Independent node — not on critical path.** Adjacent-uncovered by C14 and debt item #6 (E19). Fix: move `reference_cases` into `src/gsd/` OR graceful-skip on `ImportError`. |

**P2 total: 9 + 6 + 5 + 10 + 13 = 43 findings** (Part 1 §10.1 master-table baseline was 42; AUDIT_DELTA added **E25** as a P2 packaging defect → §A.3.e now 13 findings, total 43). Part 1 §9.2's headline "30 Medium" uses a more aggressive dedup (merging cross-referenced defects); the master-table count was 42, now 43 post-AUDIT_DELTA.

### A.4 The Low / P3 bugs (14 findings)

| ID | Machine tag | The bug |
|---|---|---|
| **A19** | LP-F19 | `weighted_normalized_deviation` helper unreferenced (dead/parallel code). *(Medium severity, P3 priority — decoupled.)* |
| **A20** | LP-F20 | Inclusion constraints relaxed only at L3 via level-equality boolean rather than declarative config. *(Medium severity, P3 priority — decoupled.)* |
| **B13** | NUTR-F13 | Vitamin-A plausibility `hard_max 500000 IU/100g` rejects legitimate cod-liver-oil (~1.8M IU/100g). *(Medium severity, P3 priority — decoupled.)* |
| **C19** | DATA-F19 | `note` exceeds `maxLength: 200` (1 entry: `pork_fat_raw/ara_arachidonic_acid_g`, 208 chars). |
| **C20** | DATA-F20 | Overlapping amino-acid keys risk double-counting (`methionine_g` + `methionine_plus_cystine_g`). |
| **C22** | DATA-F22 | Hardcoded nutrient/ingredient counts duplicated across schema + metadata (extensibility tax). |
| **D19** | VAL-F19 | `check_working_tree_clean` matches allowed files by basename, not path. |
| **D20** | VAL-F20 | `git diff --cached --quiet` lacks the timeout/exception guard other git calls have. |
| **D21** | VAL-F21 | CoFID download failure degrades to silent empty dataset; trust-on-first-use checksum. |
| **D22** | VAL-F22 | Dead/overlapping code: `GitError` (never raised), `verify_backup` (never called), unused `FDC_RATE_LIMIT_DELAY_S`. |
| **E20** | F-CLI-2 | Stale "build_pipeline.py" branding in `gsd` console script. |
| **E21** | F-CLI-3 | `--build-recipes` exits 0 while unimplemented; sets global mutable `_NO_LIVE_EVIDENCE` flag. |
| **E22** | Doc-drift | README "11 JSON files" / "208 tests / 15 files" slightly off (true: 26+ JSONs, ~207 tests / 12 files). |
| **E23** | Debug | `[DEBUG]` prints left in solver (legacy R-06, still present; 40+ lines of noise in production stdout). |

**P3 total: 14 findings.** Part 1 §10.1 enumerates 14 P3 rows.

### A.5 Cross-cutting concerns (Part 1 §2.7 — 9 concerns)

These span multiple modules and are the connective tissue the flat catalog above misses:

| # | Concern | Primary module(s) | Consumers | Related defects |
|---|---|---|---|---|
| 1 | Tie-Break System | `solver.py:20-103` | All cascade levels | A10 (legacy R-03) |
| 2 | Category Goals | `solver.py:_build_stage_objective` | Lexicographic cascade | A1 (stage order), A6 |
| 3 | Clinical Criticality | `solver.py:16` (`CRITICALITY_WEIGHT`) | Objective weighting | A5 (objective_weights dead) |
| 4 | 3-State Nutrient Contract | `DB_ingredientes.json` → `nutrition.py` → `solver.py` → output | Data integrity chain | C13, A3 |
| 5 | Constraint Tier | `constraints.json` (`HARD_FAIL_INFEASIBLE` / soft) | All cascade levels | A2/A14 |
| 6 | Unit Rename System | `nutrition.py` (DB `_mg`/`_ug` → solver `_g`) | build_matrix | C2/C3/C7, B4 |
| 7 | State Marker | `compute_state_marker()` | Validation provenance | D1, D4 |
| 8 | Circuit Breaker | `orchestrator.py` | Validation pipeline | D5 |
| 9 | MAPA Sentinel System | `mapa.py`, `doc_introspector.py` | Doc generation | E11 |

### A.6 Named integration points (Part 1 §2.11 + §8.8 — 12 points, 6 violated)

| # | Integration point | Provider → Consumers | Contract | Violated by |
|---|---|---|---|---|
| 1 | `load_all_jsons()` | core.py → solver, validation | All JSON loads succeed | C1 (schema), C9 (BOM) |
| 2 | `build_matrix()` | nutrition.py → solver | Nutrient matrix with correct units + bio factors | A12/C21 (bio dead), B4 (DM) |
| 3 | `solve_cascade()` | solver.py → output | Lexicographic 3-level solve | A1 (order), A2 (antagonism soft) |
| 4 | `CrossRefIndex` | doc_introspector.py → MAPA | Cross-reference integrity | E11 (false "NOT IMPLEMENTED") |
| 5 | `validate_ingredients_against_schema()` | validation → CI | Schema gate | C1, E6 (no CI gate) |
| 6 | `compute_state_marker()` | validation → audit | Provenance marker | D1 (import broken) |
| 7 | `check_structure_contracts()` | solver → output | Structural assertions | A13 (rounding), A11 (bio) |
| 8 | `ImplIntrospector.check()` | mapa → docs | Implementation claims | E11 (false claims) |
| 9 | `classify_deviation()` | validation → audit | Deviation classification | D3 (empty-200) |
| 10 | `atomic_swap()` | staging → live DB | Atomic DB replacement | D9 (EXDEV) |
| 11 | `CandidateWriter` | solver → staging | Candidate solution output | E8 (file handle) |
| 12 | `extract_db_value` | `_shared.py` → validators | 3-state nutrient extraction | D1 (missing) |

### A.7 Systemic patterns (Part 1 §8.1–§8.6 — 6 patterns)

| # | Pattern | Instance findings |
|---|---|---|
| 1 | **Contracts that exist in name only** | A3, A2, C4, C1 (unified in Part 3 §3.1 — see §E.3) |
| 2 | **No single source of truth for nutrients** | B18, C2, C3, C5, C7 (3 competing schemes, zero overlap) |
| 3 | **Level 1 structurally unreachable in practice** | B-i (amendment, Part 3 §7) — forces B2b as decisive protection |
| 4 | **Documentation outpaces reality** | A5, C4, E11, E7, E22, E20, E6 (objective_weights, orphaned schema, MAPA, numbering, README, CLI branding, CI) |
| 5 | **Fail-closed is good; fail-honest is missing** | A8/E3, A3 (fails closed but lies about the result) |
| 6 | **Strong foundations, weak seams** | All findings — the LP core is verified correct; defects are in wiring/data/output/validation/import-packaging seams. **E24** (undeclared `pydantic` — `schemas.py:10`) and **E25** (`mapa.py:988` imports from `tests/`) extend this pattern to the import/packaging seam (AUDIT_DELTA). |

### A.8 Structural-vs-surgical split (Part 1 §9.3)

Part 1 explicitly distinguishes **structural defects** (need design principles, multi-layer fixes in order) from **surgical defects** (localized fixes):

**Structural (20 findings, or 19 if A3/E1 merged per Part 1 dedup):** A2, A3, A5, A12, B1, B2, C1, C2, C3, C5, C7, C4, C13, D1, D8, E1, E2, E6, E7, **E24** (AUDIT_DELTA — packaging/import-boundary sibling of D1; co-blocks B5's DoD).

**Surgical (the rest):** everything not in the structural list. **E25** (AUDIT_DELTA — `mapa.py:988` tests/ import) stays surgical: localized fix (move `reference_cases` into `src/gsd/` OR graceful-skip on `ImportError`), no multi-layer coordination required.

### A.9 Probe-numbers reference (Part 1 §10.6)

Concrete data-quality metrics grounding the findings above:

| Metric | Value |
|---|---|
| Ingredients in DB | 28 |
| Distinct nutrient key-sets across 28 ingredients | 9 |
| Union of all keys | 48 |
| Intersection of all keys | 43 |
| Schema errors in `DB_ingredientes.json` | 21 |
| Schema errors in `lp_parameters_data.json` vs schema | 3 |
| Map ↔ DB key overlap | 0 |
| `measured=0` entries (conflate "0" with "unknown") | 48 |
| `not_applicable` entries | 36 |
| `missing` entries (should exist per 3-state contract) | 0 |
| Mojibake display names | 17 / 28 |
| BOM-corrupted files | 2 |
| DB `source_ref`s not in registry | 18 |
| Registry IDs never cited in DB | 12 |
| `chicken_blood_raw` Mg conflict | 20.5 vs 5.0 mg |
| `HARD_FAIL_INFEASIBLE` total in `constraints.json` | 60 (5 antagonism + 55 nutrient min/limits) |
| `objective_weights` refs in `solver.py` | 0 |
| `solver.py` LOC | 1,661 (`build_lp_problem` alone = 474) |
| Doc-gen machinery share of package | 42% (2,496 / 5,881 LOC) |
| Validation package LOC | ~6,400 |

---

## §B. Decision Gates + Implementation-Readiness Checklist

### §B.1 The 3 Decision Gates

| Gate | Question | Resolution | Status | Blocks | Source |
|---|---|---|---|---|---|
| **G1** | Mineral antagonisms: hard or soft? | **HARD at Level 1** (violation ⇒ infeasible ⇒ `DO_NOT_FEED`); severity-scaled rec at every level. Direct execution confirmed feasibility. | ✅ Resolved | Unblocks B2a, B2b | Part 3 §2 |
| **G2** (= task **B9**) | `objective_weights.json`: wire in or delete? | **DELETE** (0 solver refs — `grep -c objective_weights src/gsd/solver.py` → 0; `CRITICALITY_WEIGHT` at `solver.py:17` is authoritative). | ✅ Resolved | Unblocks B9 (= G2) | Part 3 §2, §7 |
| **G3** | Numeric safety values (Ca/P ceilings, growth taper, SULs, severity thresholds) | **Verify-first against AAFCO 2024 / NRC 2006 / FEDIAF 2024 primary sources + board-certified veterinary nutritionist (DACVN or ECVCN) review before merge.** | ❌ **PENDING** — the only non-engineering gate; the single project bottleneck | Blocks **B3, B4, B2b-thresholds** | Part 3 §2, §6 |

**G3 disambiguation (C4 finding vs C4 task):** G3 does NOT block the fix for **FINDING C4** (orphaned `lp_parameters.schema.json`, repaired by tasks C5/C9 per Part 3 §5.4 — that fix is G3-independent). G3 DOES block **TASK C4** (SUL verification for Cu/Fe/I/Mn/Zn, per Part 2 §4/§10 — that task requires vet-verified numeric values). See §A.0 for the C4 namespace collision.

**G3 sub-steps** (Part 3 §6):
1. Primary-source lookup (AAFCO 2024 dog food nutrient profiles, NRC 2006, FEDIAF 2024)
2. Breed-specific adjustment for GSD (adult weight range and growth trajectory — not just lifted from generic large-breed table)
3. Veterinary review by DACVN or ECVCN ("the genuinely slow step")

**G3 is the single project bottleneck.** Everything else can proceed in parallel while G3 awaits veterinary sign-off. "The project is not blocked. It is gated, at exactly one point, on a non-engineering input." (Part 3 §6.)

### §B.2 Implementation-Readiness Checklist (Part 2 §15 — 10 items)

Not decision gates, but readiness conditions confirmed before execution begins:

| # | Condition | Status |
|---|---|---|
| 1 | Findings reconciled (3 numbering schemes → 1 cross-map) | ✅ |
| 2 | Critical defects have P0 plans | ✅ |
| 3 | Decision gates resolved (G1/G2 resolved; G3 methodology resolved, values pending) | ✅ |
| 4 | Dependency tree explicit (45 edges, this map §D; was 44, +1 = E24-fix co-requisite per AUDIT_DELTA) | ✅ |
| 5 | Verification protocol defined (per-task `Execute` → `Assert Output`) | ✅ |
| 6 | Empirical findings folded in (B12 reframed, B5 escalated) | ✅ |
| 7 | B12 reframed (arginine already correctly placed) | ✅ |
| 8 | Risk pre-mortem complete | ✅ |
| 9 | Documentation drift catalogued (9 items, Part 2 §13) | ✅ |
| 10 | Missing context identified (7 items, Part 2 §15) | ✅ |

---

## §C. The Fix Task Catalog — 35 formal tasks + 12 P2/P3 debt items (was 11, +1 = E25 per AUDIT_DELTA)

### C.1 Phase 0 — Safety Freeze (1 task)

| Task | Repairs | Blocked by | Description |
|---|---|---|---|
| **B0** | A3, A2, B2, C1, D1 (interim containment for all 5) | none — first commit | Add `safety_guard.py` with 5 pure checks → forces `DO_NOT_FEED` + `feed_safe=false` + visible banner. A **guard, not a fix** — re-detects each original defect until the real fix lands. Fully deletable once P0-1 through P0-6 land + vet signs off. |

**B0's 5 trip conditions** (Part 2 §5 — *not* Part 3 §1 as a prior version cited):
1. Any `nutrient_results[i].status == "adequate"` while `pct_of_min is None` → detects **A3**
2. Any antagonism slack > tolerance → detects **A2** (and B2a's prerequisite)
3. No absolute Ca max in config → detects **B2** (for growth scenarios)
4. DB fails schema → detects **C1** (and B6's prerequisite)
5. Validation package import fails → detects **D1** (and B5's prerequisite). **AUDIT_DELTA / NEW-1 note:** also accidentally detects **E24** (undeclared `pydantic`) — `orchestrator.py:37` (`from ..schemas import (...)` [pydantic]) fires BEFORE `orchestrator.py:54` (D1) in a clean `pip install -e ".[test]"` venv, so B0 trip-5 catches both the D1 import-smoke failure AND the E24 undeclared-pydantic failure with the same import attempt. **B5's DoD does NOT clear until E24 ships too** (E24-fix is scope-expanded into B5 + C14; no new task ID).

### C.2 Phase 1 — Blockers & Stability (13 P0 tasks)

| Task | Repairs | Blocked by | Blocks | Description |
|---|---|---|---|---|
| **B1** | A3, E1, E2 | B7 *(master table)* / none *(detailed def — "pairs with B7")* — internal Part 2 inconsistency | B12 (reporting layer) | Replace hardcoded `status:"adequate"` placeholder with real computation of value/target_min/target_max/pct_of_min/pct_of_sul/status. Absent nutrients → "unknown", never 0/adequate. Strengthen `validate_output`. DoD: `pytest tests/test_nutrient_results.py -v` → 3 passed. **Safety-chain task (Part 3 §5.2).** |
| **B2a** | A2, A14 | none (G1 resolved) | C1, B2b (needs exposed slack) | Branch on `HARD_FAIL_INFEASIBLE` to add ratio bound with NO slack at Level 1. Levels 2/3 keep slack but penalize (normalized — C1) and record `antagonism_slack`. DoD: `pytest tests/test_antagonism_hard.py -v` → 1 passed. |
| **B2b** | A6, B-i, B-ii | B2a + G3 thresholds + vet | (none — terminal safety task) | Replace level-only `feeding_map` with severity function based on realized violation magnitudes (Ca:P outside [0.5,1.8], Ca:Mg outside [~6,~24], any SUL exceeded ⇒ DO_NOT_FEED). Emit `violations[]` array. **Mechanism can ship now with placeholder thresholds; thresholds wait on G3.** **THE decisive protection (Part 3 §3.3, §5.2) — not B2a.** DoD: `pytest tests/test_recommendation_severity.py -v` → 2 passed. |
| **B3** | B2, B3 | **G3 + vet** | (none) | Add Ca and P as `HARD_INEQUALITY_MAX` entries in `toxicological_limits.json` (Ca ≈ 4.5 g/1000 kcal per AAFCO LBG ~1.8% DM). DoD: `pytest tests/test_ca_p_ceiling.py -v` → 1 passed. |
| **B4** | B1, B5, B11 | **G3 + vet** | (none) | Add `growth_energy_schedule` (age/weight-band → k); replace `SCENARIO_K_MAP` lookup; relabel `scenarios.json`. DoD: `pytest tests/test_growth_energy.py -v` → 1 passed. **B11 should run before B4 ships.** |
| **B5** | D1, **E24** *(scope-expanded per AUDIT_DELTA / NEW-1)* | B7 *(recommended, not hard)* — **URGENT: CI is RED today** | C7, C8, C9, C10, C11, C12, C14 (all 7 depend on B5 for import-smoke); **E24-fix is co-required for B5's DoD** | Create `validators/_shared.py` implementing `extract_db_value` honoring 3-state contract; add `tests/test_imports.py` + CI import-smoke step. **E24-fix sub-step (AUDIT_DELTA): add real `pydantic` to `pyproject.toml`/`requirements.txt`/CI install line; remove dead `types-pydantic` stub.** `orchestrator.py:37` (`schemas`/pydantic) fires BEFORE `orchestrator.py:54` (D1) in a clean env, so B5's DoD `import gsd.validation.pipeline.orchestrator` → `OK` **still fails post-B5 until E24 ships too**. DoD: `PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator; print('OK')"` → `OK` (must be from a clean `pip install -e ".[test]"` env — NOT a review sandbox with `pydantic` pre-installed, which masked E24 per NEW-2). **The single most important next action (Part 3 §12). Hidden critical-path accelerator — implicitly blocks verification of B6, B1, B2a.** |
| **B6** | C1, C9, C13 | B7 *(recommended, ideally sequenced first)* | C5 (recommended), C14 (blocks) | Add `unit` to 20 measured entries; trim over-long `note`; strip BOM; enforce 3-state contract; add CI `schema-gate` job. DoD: `--validate-db` → `ERROR COUNT: 0`. |
| **B7** | C2, C3, C5, C7, B18, C6 | `chicken_blood_raw` Mg source value (verify FDC — external, not a task) | B1, B5, B6, B8, B12, C5 (all recommended/blocks) | Promote `NUTRIENT_REGISTRY` to single canonical registry; `propertyNames:{enum:[...43 keys...]}` + `required` + `additionalProperties:false`; bind unit to key suffix; dedupe DB; resolve Mg conflict. **The single most architecturally meaningful task (Part 3 §3.2).** DoD: `pytest tests/test_namespace.py -v` → 4 passed. |
| **B8** | C4, C11 | B7 | C5 | Rewrite `lp_parameters.schema.json` to match real top-level keys, or split into `nutrient_registry.schema.json` + `solve_cascade.schema.json`; add upper bounds + `min≤max` invariant. DoD: jsonschema validate → `ERROR COUNT: 0`. *(Note: Part 3 never mentions B8 — it attributes C4 fix to C5/C9. This map retains B8 per Part 2.)* |
| **B9** (= **G2**) | A5 | none (G2 resolved) | (none) | Delete `data/objective_weights.json` + its loaders (`core.py:60/419`, `mapa.py:530/533/1270`, `doc_introspector.py:703`); document real objective. DoD: `grep -rc objective_weights src/ data/` → `0`. |
| **B10** | A1 | none | (none) | Reorder `solve_cascade` `objective_stages` so free tie-break/category stage is LAST; add build-time assertion. DoD: `pytest tests/test_lexicographic_order.py -v` → 2 passed. *(Note: Part 3 never mentions B10 — retained per Part 2.)* |
| **B11** | B-i, B-iii (Level-1 unreachable — new empirical finding) | none (diagnostic) | Informs B3, B4 (should run before they ship) | Build Level-1 LP; add slack to all Level-1 constraints; minimize total slack; inspect which slacks are non-zero; binary-search by constraint group; record IIS. Do NOT change bounds. **"The largest open structural unknown in the project" (Part 3 §3.3).** DoD: diagnosis names ≥1 blocking constraint. |
| **B12** | B-iv (reframed — Part 3 §8) | B7 + B1 *(master table says B7 only; detailed def says B7+B1 — internal Part 2 inconsistency)* | (none) | **REFRAMED:** "confirm B1 fixes arginine display," NOT "relocate arginine key." Arginine already correctly placed in all 28 ingredients, in `NUTRIENT_REGISTRY` line 20, AAFCO min ≥2.5, `build_matrix` carries it (beef→6.86, chicken→11.94), Lys:Arg constraint built correctly. Only A3 reporting layer is broken. DoD: `pytest tests/test_arginine_tracked.py -v` → 1 passed. |

### C.3 Phase 2 — P1 Hardening (16 C-series tasks)

| Task | Repairs | Blocked by | Description |
|---|---|---|---|
| **C1** | A4 | B2a | Normalize antagonism slack (`slack/target_ratio`) before weighting so all L1 terms are dimensionless. |
| **C2** | A8, E3 | none | Branch on `prob.status` → `unbounded/timeout/numerical/infeasible`, all → `DO_NOT_FEED` but diagnosable; surface a `Not Solved` incumbent. |
| **C3** | B4 | moisture/ash data in DB (external) | Store measured moisture/ash per ingredient; compute DM from data instead of hardcoded 72%/1%. |
| **C4** | B6–B10, B17 | **G3 + vet** | Verify & correct each SUL (Cu/Fe/I/Mn/Zn) against cited AAFCO/NRC/FEDIAF source; fix mislabels; every SUL carries a resolving `source_ref`. |
| **C5** | C6, C8, C10, C11, C12, C13 | **B7, B8** (B6 recommended, not blocks) | Schema hardening: numeric bounds, unit-key binding, `additionalProperties:false` on 7 object types, `source_ref ∈ registry`, `min≤max`, 3-state enforcement. |
| **C6** | D2 | none (security; do early) | FDC API key in header (not URL param); scrub `str(exc)`; **rotate the key** (presume leaked). |
| **C7** | D3 | **B5** | Treat empty FDC nutrient list as `MISSING`/error, not zero. |
| **C8** | D4 | **B5** | Append-only, hash-chained audit log; ms timestamps; no rewrite of prior entries. |
| **C9** | D5 | **B5** | Make the countermeasure gate non-trivially defeatable (tie to git identity/signed marker). *(Note: Part 3 §5.4 classifies C9 as a schema-fix task paired with C5 — different from Part 2's validation-fix classification. Retained per Part 2 here.)* |
| **C10** | D6 | **B5** | Verify CoFID sha256 on every load, not just first download. |
| **C11** | D7, D12 | **B5** | Wrap each fetcher call in try/except; parse `Retry-After` defensively (fallback; HTTP-date). |
| **C12** | D8 | **B5** | Commit before/atomically-with the swap, or treat failed commit as hard error → rollback; actually `raise GitError`. |
| **C13** | E4 | none | Validate `runtime_request.json` against a schema/TypedDict before `AnimalInput(**dict)`. |
| **C14** | E6, E19, **E24** *(scope-expanded per AUDIT_DELTA / NEW-1)* | **B5, B6** | CI `schema-gate` + `import-smoke` + Python 3.10–3.12 matrix; fix `requirements.txt`; add lockfile; remove dead `types-pydantic`; **ADD real `pydantic` to deps (scope gap closed per AUDIT_DELTA — original C14 task text omitted this, leaving E24 unfixed).** C14 now repairs E6 + E19 + E24. |
| **C15** | E7, **NEW-2** *(scope-expanded per AUDIT_DELTA)* | none (documentation) | Create one canonical bug-numbering scheme; cross-map legacy R/F/D IDs once (don't rewrite history). **Scope extended to evidence-transcript reconciliation (AUDIT_DELTA / NEW-2):** correct the §A.1 row 8 / §G.4 pt.1 / §G.8 transcript from "191 tests collected, 1 error in 1.96s" → `collected 150 items / 3 errors` (clean `pip install -e ".[test]"` env), and document that the original transcript was captured with `pydantic` pre-installed (masking E24). Same discipline as bug-numbering — both are "evidence vs reality" reconciliation. Verdict unchanged (D1 real, B5 right, CI RED). |
| **C16** | A7, E8 | none | Delete dead floor-relaxation doc + `validate_output` check #9 (or implement if wanted); use `with open(...)` for file handle. *(Note: "C16" is also a finding ID = mojibake — see §A.0.)* |

### C.4 Phase 3 — Regression Suite (5 R-series tasks)

| Task | Repairs | Blocked by | Green condition |
|---|---|---|---|
| **R1** | E16 | after fixes they lock | Assert the **specific** expected status for a deterministic (seeded) selection; a perturbed expectation fails. |
| **R2** | E17 | after fixes | `assert passed` (or delete helper); logs go to `tmp_path`; a forced failure now fails the test; working tree stays clean. |
| **R3** | E18, E5 | after fixes | Capture per-stage objective bounds and assert non-degradation within tolerance; force a real timeout (tiny `time_limit`/monkeypatched CBC `maxSeconds`) and assert a safe result object. |
| **R4** | proof discipline | after fixes | For a fixed fixture+seed the output contract is byte-identical across two runs; each P0/P1 fix has a minimal 2–3-ingredient regression fixture. |
| **R5** | A19, D22, A12 | **R1–R4 (LAST)** | Deletions land with `pytest`+`mypy` green and no remaining references. Includes `GitError`-never-raised, `verify_backup`-never-called, unused `FDC_RATE_LIMIT_DELAY_S`, unreferenced `weighted_normalized_deviation`, `[DEBUG]` prints (E23/R-06). |

### C.5 P2/P3 Debt Items (12 items not assigned formal task IDs — was 11, +1 = E25 per AUDIT_DELTA; Part 2 §9 enumerates 15 total — 4 folded into R1/R2/R3/R5)

Part 2 §15 headline count is "15 P2/P3 debt items." This section lists the 12 that are NOT assigned formal B/C/R task IDs — 11 from Part 2 §9 + **E25** added by AUDIT_DELTA. The other 4 (E16→R1, E17→R2, E18→R3, D22/A19→R5) are folded into the regression suite. Several of the 12 also overlap with R5 (noted).

| # | Repairs finding(s) | Item | Priority | Note |
|---|---|---|---|---|
| 1 | E23, R-06 | Remove `[DEBUG]` prints from `solver.py:301,323` | P3 | Overlaps R5 |
| 2 | E11 | Curb doc-gen overengineering: freeze `mapa.py`/`doc_introspector.py`; delete stale `build_pipeline.py` references | P2 | |
| 3 | E12 | Decompose `solver.py` (1,661 lines) | P3/park | YAGNI-parked unless a P0 fix becomes hard |
| 4 | E10, E13 | Consolidate type model (frozen dataclasses/pydantic at boundaries; resolve circular-import split) | P3/park | YAGNI-parked unless it demonstrably reduces bugs |
| 5 | E15, E20, E21 | Fix CLI: use `argparse`; non-zero exit for unimplemented modes; fix `build_pipeline.py` branding; remove global `_NO_LIVE_EVIDENCE` | P2 | |
| 6 | E19 | Fix packaging: add `requests` to `requirements.txt`; pin `jsonschema`; add lockfile | P2 | Partial overlap with C14 |
| 7 | C16 *(finding)* | Fix mojibake: re-encode the 17 `display_name`s from source | P2 | |
| 8 | C19 | Fix `note` maxLength: trim the 1 over-long note (or raise limit deliberately) | P3 | |
| 9 | C20 | Document AA key overlap: which amino-acid keys are independent vs composite; prevent summing both | P3 | |
| 10 | C21, A12 | Validate bioavailability factors: key by real `ingredient_id`; assert every ingredient resolves; else delete the dead machinery | P2 | Overlaps R5 |
| 11 | C22 | Remove hardcoded counts: derive nutrient/ingredient counts; single source (registry) | P3 | |
| 12 | **E25** *(AUDIT_DELTA / NEW-3)* | Fix packaging: `src/gsd/mapa.py:988` imports `from tests.reference_cases import ...` — move `reference_cases` into `src/gsd/` OR graceful-skip on `ImportError` (wheel-install only) | P2 | Adjacent-uncovered by C14 and item #6 (E19 packaging); independent — not on critical path. Blocks only `--gate-mapa` live-evidence under wheel install. Low-probability today (`license = "Private project — not for distribution"`). |

### C.6 Documentation-drift reconciliation (Part 2 §13 — 9 items, gated by code fixes)

| Code fix | Gates doc-update |
|---|---|
| B1, B6 | README.md (remove "schema-validated", "SAFE_TO_FEED") |
| B9 | Delete `objective_weights.json` + document real objective |
| B2a | `constraints.json` `HARD_FAIL_INFEASIBLE` honored |
| B4 | `scenarios.json` relabel |
| C15 | Bug-numbering schemes reconciliation |
| B7 | Nutrient counts (41/43/46/54) → single count |
| B6, B8 | Schema badges reflect green gates |
| B5 | Validation pipeline status "restored" |
| (Phase 6, undefined) | `MAPA_COMPLETO_*.md` / `mapa.py` regen |

---

## §D. The Dependency Graph — 45 edges (was 44, +1 = E24-fix co-requisite for B5 DoD per AUDIT_DELTA), with the critical chain highlighted

```
                        ┌─────────────────────────────────────┐
                        │  G3 (PENDING) — vet + primary       │
                        │  sources for Ca/P/taper/SULs        │
                        └──────┬──────────┬──────────┬────────┘
                               │          │          │
                            ┌──▼──┐    ┌──▼──┐    ┌──▼──────┐
                            │ B3  │    │ B4  │    │ B2b-thr │
                            │(Ca/P)│   │(growth)│  │(+B2a+G3)│
                            └─────┘    └─────┘    └─────────┘

  B0 (safety freeze) ── independent; backstops EVERYTHING; first commit
     └─ trip-conditions re-detect A3, A2, B2, C1, D1 until each real fix lands

  B7 (canonical namespace) ──┬─> B1  (nutrient_results: clean min/max) [recommended]
   the keystone ─────────────┼─> B5  (import: canonical units) [recommended, URGENT]
                              ├─> B6  (DB conformance) [recommended] ─> C14 (CI gates) [+B5]
                              ├─> B8  (lp_parameters schema) [blocks]
                              │         │
                              │         └─> C5 (schema hardening) [+B7, +B6-rec]
                              ├─> B12 (arginine — reframed) [blocks] <+ B1>
                              └─> C5  (schema hardening) [blocks]

  B2a (harden antagonisms L1) ── G1 resolved; independent
       │
       ├─> C1 (penalty normalization) [blocks]
       │
       └─> B2b (severity-scaled rec) [blocks] <+ G3 thresholds + vet>
                                               ║
                                               ║  THE DECISIVE PROTECTION (Part 3 §3.3)
                                               ║  paired with B1 as the safety chain (§5.2)
                                               ▼

  E24-fix (add real pydantic to deps) ── co-required for B5 DoD (AUDIT_DELTA / NEW-1)
       │   [precedes D1 in failure chain: orchestrator.py:37 [pydantic] fires before :54 [D1]]
       │   [no separate task ID — scope-expanded into B5 + C14]
       ▼
  B5 (restore _shared.py) ──┬─> C7  (D3 empty-200)        [CI RED TODAY —
   [URGENT — single most     ├─> C8  (D4 audit trail)      blocks verification
    important next action]   ├─> C9  (D5 circuit-breaker)   of B6, B1, B2a
   [+ E24-fix co-required    ├─> C10 (D6 CoFID checksum)   implicitly]
    for B5 DoD per           ├─> C11 (D7/D12 fetch isolation)
    AUDIT_DELTA]             ├─> C12 (D8 atomic commit)
                              └─> C14 (CI gates) [+B6, +E24-scope-expansion]

  B6 (schema gate) ─> C5 (schema hardening) [recommended, not blocks; +B7, +B8]
  B6 ─> C14 (CI gates) [+B5]

  B11 (diagnose L1) ── informs B3, B4 (should run before they ship)

  Independent (can start now): B0, B2a, B9(=G2), B10, B11, C2, C6, C13, C15, C16, **E25-fix** *(AUDIT_DELTA / NEW-3 — independent P2 packaging fix; debt item #12 in §C.5)*

  R1–R5 (regression suite) ── after the fixes they lock; R5 is LAST (blocked by R1–R4)
```

**Edge summary (45 total — was 44, +1 co-requisite per AUDIT_DELTA):**
- **23 task→task blocking edges** (B7→{B8,B12,C5} hard-blocks + B7→{B1,B5,B6} recommended, B2a→{B2b,C1}, B5→{C7,C8,C9,C10,C11,C12,C14}, B6→C14, B8→C5, B1→B12, R1→R5, R2→R5, R3→R5, R4→R5, + B6→C5 recommended)
- **4 gate→task edges** (G3→B3, G3→B4, G3→B2b-thresholds, G3→**Task C4**) — *Note: G3 blocks TASK C4 (SUL verification); G3 does NOT block the fix for FINDING C4 (orphaned schema, repaired by C5/C9 per Part 3 §5.4). See §A.0 C4 namespace collision.*
- **3 external prerequisite edges** (chicken_blood_raw Mg→B7, moisture/ash data→C3, "after fixes"→R1–R4)
- **1 informational edge** (B11 informs B3/B4)
- **9 doc-update gating edges** (§C.6)
- **4 B0 backstop edges** (B0→{B1,B3,B5,B6} per Part 2 §5 trip conditions; B0 also detects A2 but B2a is independent so B0→B2a is an additional backstop)
- **1 co-requisite edge (AUDIT_DELTA / NEW-1):** E24-fix (add real `pydantic` to deps) is co-required for B5's DoD — `orchestrator.py:37` [pydantic] fires before `orchestrator.py:54` [D1] in a clean env, so B5's `import gsd.validation.pipeline.orchestrator → OK` still fails post-B5 until E24 ships. E24-fix has no separate task ID; it is scope-expanded into B5 + C14. E24 also "precedes D1 in failure chain" (annotated in the graph above, not a separate fix-edge — D1's existing edges already capture that dependency). E25 is independent and adds no edges.

**The critical path** (Part 2 §10, confirmed Part 3 §10): `G1/G2/G3 decisions → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3`. B3/B4 run in parallel once G3 + vet land. **AUDIT_DELTA note (NEW-1):** B5 on the critical path now co-requires **E24-fix** (add real `pydantic` to deps) — B5's DoD does not pass until E24 ships. E24-fix is scope-expanded into B5+C14 (no new task ID); see edge summary above. E25 is NOT on the critical path (independent P2 debt item #12).

**The safety chain** (Part 3 §5.2 — *not* the critical path): `B1 + B2b`. Both must ship; neither alone is sufficient. "Without B2b, B1 just shows the user the bad numbers under a SAFE_TO_FEED label; with B2b, the label itself reflects the severity."

---

## §D-DATA. Machine-Readable Graph (authoritative)

> This section is the **single source of truth** for the dependency graph
> rendered in the app. The prose in §D above is human narrative; the YAML block
> below is what the app's parser reads. Keep them adjacent so a reviewer sees
> both in one screen.
>
> **Schema:** `gsd-dependency-graph.schema.json` v1.0.0 (see
> `DEPENDENCY-GRAPH-SCHEMA-DESIGN.md` §2). The app validates shape with zod,
> then runs a referential-integrity pass (edge endpoints must exist, lane refs
> must resolve, no duplicate node ids).
>
> **Layout:** `lanes[].order` drives `x`; an intra-lane topological sort drives
> `y`. Optional per-node `x`/`y` overrides are the escape hatch — on day-1
> every node carries its curated coordinate so the visual is pixel-identical to
> the prior hand-coded table; overrides get deleted opportunistically as the
> auto-layout is trusted.
>
> **Syncing:** edit the YAML, then click **"Sync graph"** in the app's
> dependency-graph dialog to re-parse. A bad edit validates to HTTP 422 and the
> previously cached graph keeps serving (fail-closed) — a typo degrades to
> "stale until fixed", never "broken for everyone".

```yaml
schemaVersion: "1.0.0"

lanes:
  - id: gate
    label: "G3 + pending-gate children (B3, B4, B2b, C4)"
    order: 0
  - id: antagonism
    label: "B2a + C1 + C3 (antagonism / penalty lane)"
    order: 1
  - id: namespace
    label: "B7 hub + direct children (B1, B5, B6)"
    order: 2
  - id: schema
    label: "B8, B12, C5 (schema hardening)"
    order: 3
  - id: validation
    label: "C7-C12, C14 (validation cluster + CI)"
    order: 4
  - id: regression
    label: "R1-R5 regression suite"
    order: 5
  - id: independent
    label: "Independent sidebar (B0, B9-B11, C2, C6, C13, C15, C16)"
    order: 6

nodes:
  # ===== Lane 0 (gate): G3 + its 4 pending-gate children =====
  - id: G3
    namespace: gate
    kind: gate
    severity: null
    status: pending
    label: "G3 · vet sign-off"
    description: "Numeric safety values: Ca/P ceilings, growth taper, SULs, severity thresholds. Verify-first against AAFCO/NRC/FEDIAF primary sources + veterinary review before merge. PENDING — the only non-engineering gate. The single project bottleneck."
    lane: gate
    x: 140
    y: 100
    repairs: []
    blockedBy: []
    onCriticalPath: true
    subsystem: "Decision gate"
    oneLiner: "Numeric safety values (Ca/P ceilings, growth taper, SULs) → PENDING: vet sign-off required. THE PROJECT BOTTLENECK."

  - id: B3
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B3 · Ca/P ceilings"
    description: "Ca/P ceilings. Blocked by G3 + vet. Repairs B2, B3 findings (no absolute calcium maximum)."
    lane: gate
    x: 140
    y: 280
    repairs: ["B2"]
    blockedBy: ["G3"]
    onCriticalPath: false
    subsystem: "Nutrition"
    oneLiner: "Ca/P ceilings — blocked by G3 + vet sign-off"

  - id: B4
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B4 · growth energy"
    description: "Growth energy + labels. Blocked by G3 + vet. Repairs B1, B5, B11 (flat k=1.2×RER; scenario labels inverted)."
    lane: gate
    x: 140
    y: 460
    repairs: ["B1", "B5", "B11"]
    blockedBy: ["G3"]
    onCriticalPath: false
    subsystem: "Nutrition"
    oneLiner: "Growth energy + labels — blocked by G3 + vet"

  - id: B2b
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B2b · severity-scaled rec"
    description: "Severity-scaled recommendation. Blocked by B2a + G3 thresholds + vet. The decisive protection that actually protects the animal today (Level-1 unreachable)."
    lane: gate
    x: 140
    y: 640
    repairs: ["A6"]
    blockedBy: ["B2a", "G3"]
    onCriticalPath: true
    subsystem: "LP solver"
    oneLiner: "Severity-scaled recommendation — the decisive protection that actually protects the animal today"

  - id: C4
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C4 · SUL verification"
    description: "Safe Upper Level verification for Cu/Fe/I/Mn/Zn. Blocked by G3 + vet. Repairs B6–B10, B17."
    lane: gate
    x: 140
    y: 820
    repairs: ["B6", "B10"]
    blockedBy: ["G3"]
    onCriticalPath: false
    subsystem: "Nutrition"
    oneLiner: "SUL verification for Cu/Fe/I/Mn/Zn — blocked by G3 + vet"

  # ===== Lane 1 (antagonism): B2a + C1 + C3 =====
  - id: B2a
    namespace: task
    kind: task
    severity: P0
    status: independent
    label: "B2a · harden antagonisms L1"
    description: "Harden antagonisms at Level 1 (violation ⇒ infeasible ⇒ DO_NOT_FEED). G1 resolved; independent. Repairs A2, A14. Parent of B2b and C1."
    lane: antagonism
    x: 360
    y: 460
    repairs: ["A2", "A14"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "LP solver"
    oneLiner: "Harden antagonisms at Level 1 (violation ⇒ infeasible ⇒ DO_NOT_FEED). G1 resolved; INDEPENDENT."

  - id: C1
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C1 · penalty normalization"
    description: "Antagonism penalty normalization (~500× unit mismatch). Blocked by B2a. Repairs A4."
    lane: antagonism
    x: 360
    y: 640
    repairs: ["A4"]
    blockedBy: ["B2a"]
    onCriticalPath: true
    subsystem: "LP solver"
    oneLiner: "Antagonism penalty normalization (~500× unit mismatch)"

  - id: C3
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C3 · dry matter from data"
    description: "Dry matter from data (currently hardcoded 72% moisture / 1% ash). Blocked by external moisture/ash data in DB. Repairs B4. Part of the B7 namespace work but tracked separately because of the external data dependency."
    lane: antagonism
    x: 360
    y: 820
    repairs: ["B4"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Nutrition"
    oneLiner: "Dry matter from data (hardcoded 72% moisture / 1% ash)"

  # ===== Lane 2 (namespace): B7 hub + B1, B5, B6 =====
  - id: B7
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B7 · canonical namespace"
    description: "Canonical nutrient namespace. Single most-connected node — feeds B1, B5, B6, B8, B12, C5. Repairs C2, C3, C5, C7, B18, C6."
    lane: namespace
    x: 580
    y: 460
    repairs: ["C2", "C3", "C5", "C7"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Data/Schema"
    oneLiner: "Canonical nutrient namespace — single most-connected node, feeds B1/B5/B6/B8/B12/C5"

  - id: B1
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B1 · nutrient_results"
    description: "Real nutrient_results (clean min/max). Blocked by B7 (clean min/max source). Repairs A3, E1, E2."
    lane: namespace
    x: 580
    y: 640
    repairs: ["A3", "E1", "E2"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Nutrition"
    oneLiner: "Real nutrient_results (clean min/max) — blocked by B7 (recommended)"

  - id: B5
    namespace: task
    kind: task
    severity: P0
    status: urgent
    label: "B5 · restore _shared.py [URGENT]"
    description: "Restore validators/_shared.py. CI is RED TODAY — breaks pytest collection (191 tests collected, then ModuleNotFoundError). Hidden critical-path accelerator. Blocked by B7 (recommended, not hard)."
    lane: namespace
    x: 580
    y: 280
    repairs: ["D1"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "Restore _shared.py — CI RED TODAY, hidden critical-path accelerator. URGENT."

  - id: B6
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B6 · DB schema gate"
    description: "DB conformance / schema gate. Prevents data drift recurring. Blocked by B7. Repairs C1, C9, C13. Feeds C5 (recommended) and C14 (blocks)."
    lane: namespace
    x: 580
    y: 820
    repairs: ["C1", "C9", "C13"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Data/Schema"
    oneLiner: "DB conformance / schema gate — prevents data drift recurring"

  # ===== Lane 3 (schema): B8, B12, C5 =====
  - id: B8
    namespace: task
    kind: task
    severity: P0
    status: null
    label: "B8 · lp_parameters schema"
    description: "lp_parameters schema — registry shape. Blocked by B7. Repairs C4, C11. Feeds B12 and C5."
    lane: schema
    x: 800
    y: 820
    repairs: ["C4", "C11"]
    blockedBy: ["B7"]
    onCriticalPath: true
    subsystem: "Schema"
    oneLiner: "lp_parameters schema — registry shape, validates real config"

  - id: B12
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "B12 · arginine (reframed)"
    description: "Arginine — REFRAMED in Part 3 §8. Direct inspection showed arginine is already correctly placed; only the reporting layer (A3) is broken. So B12 became 'confirm B1 fixes arginine display.' Blocked by B7 + B1."
    lane: schema
    x: 800
    y: 640
    repairs: []
    blockedBy: ["B7", "B1"]
    onCriticalPath: true
    subsystem: "Nutrition"
    oneLiner: "Arginine — REFRAMED in Part 3 §8, only reporting layer (A3) is broken"

  - id: C5
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C5 · schema hardening"
    description: "Schema hardening. Blocked by B7 + B8. Repairs C6, C8, C10–C13. B6 feeds C5 (recommended, not blocks)."
    lane: schema
    x: 800
    y: 460
    repairs: ["C6", "C8", "C10", "C11", "C12", "C13"]
    blockedBy: ["B7", "B8"]
    onCriticalPath: true
    subsystem: "Schema"
    oneLiner: "Schema hardening — blocked by B7 + B8, repairs C6/C8/C10-C13"

  # ===== Lane 4 (validation): C7-C12, C14 =====
  - id: C7
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C7 · D3 empty-200"
    description: "D3 empty-200 accepted as zero-nutrient. Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 100
    repairs: ["D3"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D3 empty-200 accepted as zero-nutrient"

  - id: C8
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C8 · D4 audit trail"
    description: "D4 audit trail not tamper-evident. Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 220
    repairs: ["D4"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D4 audit trail not tamper-evident"

  - id: C9
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C9 · D5 circuit-breaker"
    description: "D5 circuit-breaker defeatable. Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 340
    repairs: ["D5"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D5 circuit-breaker defeatable"

  - id: C10
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C10 · D6 CoFID checksum"
    description: "D6 CoFID checksum bypassed when cached. Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 460
    repairs: ["D6"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D6 CoFID checksum bypassed when cached"

  - id: C11
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C11 · D7/D12 fetch isolation"
    description: "D7/D12 fetch loop crashes on int(Retry-After). Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 580
    repairs: ["D7", "D12"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D7/D12 fetch loop crashes on int(Retry-After)"

  - id: C12
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C12 · D8 atomic commit"
    description: "D8 commit swallows failures. Blocked by B5. Validation pipeline fix."
    lane: validation
    x: 1020
    y: 700
    repairs: ["D8"]
    blockedBy: ["B5"]
    onCriticalPath: true
    subsystem: "Validation"
    oneLiner: "D8 commit swallows failures"

  - id: C14
    namespace: task
    kind: task
    severity: P1
    status: null
    label: "C14 · CI gates + Python"
    description: "CI gates + Python matrix. Blocked by B5 + B6. Repairs E6, E19."
    lane: validation
    x: 1020
    y: 820
    repairs: ["E6", "E19"]
    blockedBy: ["B5", "B6"]
    onCriticalPath: true
    subsystem: "CI"
    oneLiner: "CI gates + Python matrix — blocked by B5 + B6"

  # ===== Lane 5 (regression): R1-R5 =====
  - id: R1
    namespace: task
    kind: task
    severity: P2
    status: null
    label: "R1 · tautological assertions"
    description: "Tautological assertions. After fixes they lock. Phase 3 regression suite."
    lane: regression
    x: 1240
    y: 460
    repairs: ["E16"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Regression"
    oneLiner: "Tautological assertions — after fixes they lock (Phase 3)"

  - id: R2
    namespace: task
    kind: task
    severity: P2
    status: null
    label: "R2 · audit_test_result"
    description: "audit_test_result never asserts. After fixes. Phase 3 regression suite."
    lane: regression
    x: 1240
    y: 580
    repairs: ["E17"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Regression"
    oneLiner: "audit_test_result never asserts (Phase 3)"

  - id: R3
    namespace: task
    kind: task
    severity: P2
    status: null
    label: "R3 · lex dominance; timeout"
    description: "Lex dominance; real timeout test (currently a stub, always passes). After fixes. Phase 3 regression suite."
    lane: regression
    x: 1240
    y: 700
    repairs: ["E18", "E5"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Regression"
    oneLiner: "Lex dominance; real timeout test (Phase 3)"

  - id: R4
    namespace: task
    kind: task
    severity: P2
    status: null
    label: "R4 · proof discipline"
    description: "Proof discipline (byte-identical replay). After fixes. Phase 3 regression suite."
    lane: regression
    x: 1240
    y: 820
    repairs: []
    blockedBy: []
    onCriticalPath: true
    subsystem: "Regression"
    oneLiner: "Proof discipline (byte-identical replay) (Phase 3)"

  - id: R5
    namespace: task
    kind: task
    severity: P2
    status: null
    label: "R5 · dead code, DEBUG prints"
    description: "Dead code, DEBUG prints (legacy R-06 / E23). LAST in the regression suite — blocked by R1–R4. Repairs A19, D22, A12."
    lane: regression
    x: 1240
    y: 940
    repairs: ["A19", "D22", "A12"]
    blockedBy: ["R1", "R2", "R3", "R4"]
    onCriticalPath: true
    subsystem: "Regression"
    oneLiner: "Dead code, DEBUG prints — LAST in regression suite, blocked by R1-R4"

  # ===== Lane 6 (independent): B0, B9-B11, C2, C6, C13, C15, C16 =====
  - id: B0
    namespace: task
    kind: task
    severity: P0
    status: independent
    label: "B0 · safety freeze"
    description: "Safety freeze. Backstops EVERYTHING. First commit. Forces DO_NOT_FEED + visible banner when any of 5 trip conditions is true. Independent of the fixes — re-detects each original defect (A3, A2, B2, C1, D1) until the real fix lands."
    lane: independent
    x: 1460
    y: 100
    repairs: ["A3", "A2", "B2", "C1", "D1"]
    blockedBy: []
    onCriticalPath: true
    subsystem: "Safety freeze"
    oneLiner: "Safety freeze — first commit, backstops EVERYTHING, forces DO_NOT_FEED + banner on 5 trip conditions"

  - id: B9
    namespace: task
    kind: task
    severity: P0
    status: independent
    label: "B9 · delete obj_weights"
    description: "Delete objective_weights.json (0 solver refs; CRITICALITY_WEIGHT is authoritative). G2 resolved. Removes dead config."
    lane: independent
    x: 1460
    y: 220
    repairs: ["A5"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "LP/config"
    oneLiner: "Delete objective_weights.json — G2 resolved, removes dead config"

  - id: B10
    namespace: task
    kind: task
    severity: P0
    status: independent
    label: "B10 · fix stage order"
    description: "Fix lexicographic stage order (L1/L2 were swapped). Independent. Repairs A1 — level-1 allocation was not what config intended."
    lane: independent
    x: 1460
    y: 340
    repairs: ["A1"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "LP solver"
    oneLiner: "Fix lexicographic stage order — L1/L2 were swapped"

  - id: B11
    namespace: task
    kind: task
    severity: P0
    status: independent
    label: "B11 · diagnose L1"
    description: "Diagnose Level-1 infeasibility. Independent, cheap, high-info; informs B4/C3."
    lane: independent
    x: 1460
    y: 460
    repairs: []
    blockedBy: []
    onCriticalPath: false
    subsystem: "Nutrition"
    oneLiner: "Diagnose Level-1 infeasibility — independent, cheap, high-info; informs B4/C3"

  - id: C2
    namespace: task
    kind: task
    severity: P1
    status: independent
    label: "C2 · status branching"
    description: "Status branching — all non-Optimal statuses collapsed to 'infeasible'. Independent. Repairs A8, E3."
    lane: independent
    x: 1460
    y: 580
    repairs: ["A8", "E3"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Output"
    oneLiner: "Status branching — all non-Optimal collapsed to 'infeasible'. INDEPENDENT."

  - id: C6
    namespace: task
    kind: task
    severity: P1
    status: independent
    label: "C6 · FDC key in header"
    description: "FDC API key leaked in URLs — move to header. Independent. Security, do early. Repairs D2."
    lane: independent
    x: 1460
    y: 700
    repairs: ["D2"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Security"
    oneLiner: "FDC API key leaked in URLs — move to header. INDEPENDENT."

  - id: C13
    namespace: task
    kind: task
    severity: P1
    status: independent
    label: "C13 · runtime validation"
    description: "Runtime input validation (--runtime unvalidated). Independent. Repairs E4."
    lane: independent
    x: 1460
    y: 820
    repairs: ["E4"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Cross-cutting"
    oneLiner: "Runtime input validation unvalidated. INDEPENDENT."

  - id: C15
    namespace: task
    kind: task
    severity: P1
    status: independent
    label: "C15 · bug-numbering"
    description: "Bug-numbering reconciliation (3 inconsistent schemes). Independent. Repairs E7."
    lane: independent
    x: 1460
    y: 940
    repairs: ["E7"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Process"
    oneLiner: "Bug-numbering reconciliation (3 inconsistent schemes). INDEPENDENT."

  - id: C16
    namespace: task
    kind: task
    severity: P1
    status: independent
    label: "C16 · dead floor-relaxation"
    description: "Dead floor-relaxation code; file handle leak. Independent. Repairs A7, E8."
    lane: independent
    x: 1460
    y: 1060
    repairs: ["A7", "E8"]
    blockedBy: []
    onCriticalPath: false
    subsystem: "Cross-cutting"
    oneLiner: "Dead floor-relaxation code; file handle leak. INDEPENDENT."

edges:
  # ===== G3 (PENDING gate) — all dashed/pending =====
  - { from: G3, to: B3, kind: pending }
  - { from: G3, to: B4, kind: pending }
  - { from: G3, to: B2b, kind: pending, label: "G3 thresholds" }
  - { from: G3, to: C4, kind: pending }

  # ===== B2a chain (independent, but feeds B2b and C1) =====
  - { from: B2a, to: B2b, kind: blocks }
  - { from: B2a, to: C1, kind: blocks }

  # ===== B7 chain (canonical namespace — central hub) =====
  - { from: B7, to: B1, kind: recommended, label: "clean min/max source" }
  - { from: B7, to: B5, kind: recommended, label: "recommended" }
  - { from: B7, to: B6, kind: recommended, label: "schema tightening" }
  - { from: B7, to: B8, kind: blocks }
  - { from: B7, to: B12, kind: blocks }
  - { from: B7, to: C5, kind: blocks }

  # B1 → B12 (reporting layer)
  - { from: B1, to: B12, kind: blocks }

  # B8 → C5 (schema hardening, alongside B7)
  - { from: B8, to: C5, kind: blocks }

  # B6 → C5 (recommended, NOT blocks — per §C.3 only B7+B8 hard-block C5)
  - { from: B6, to: C5, kind: recommended }

  # ===== B5 → C7-C12, C14 (all 6 validation fixes + CI gates) =====
  - { from: B5, to: C7, kind: blocks }
  - { from: B5, to: C8, kind: blocks }
  - { from: B5, to: C9, kind: blocks }
  - { from: B5, to: C10, kind: blocks }
  - { from: B5, to: C11, kind: blocks }
  - { from: B5, to: C12, kind: blocks }
  - { from: B5, to: C14, kind: blocks }

  # B6 → C14 (CI gates also needs B6, alongside B5)
  - { from: B6, to: C14, kind: blocks }

  # ===== B0 backstops (the §E.4 5 trip conditions) =====
  - { from: B0, to: B1, kind: backstops, label: "detects A3" }
  - { from: B0, to: B2a, kind: backstops, label: "detects A2" }
  - { from: B0, to: B3, kind: backstops, label: "detects B2" }
  - { from: B0, to: B5, kind: backstops, label: "detects D1" }
  - { from: B0, to: B6, kind: backstops, label: "detects C1" }

  # ===== R1-R4 → R5 (regression suite, R5 is LAST) =====
  - { from: R1, to: R5, kind: blocks }
  - { from: R2, to: R5, kind: blocks }
  - { from: R3, to: R5, kind: blocks }
  - { from: R4, to: R5, kind: blocks }

  # ===== B11 diagnosis → informs B4 / C3 (recommended, NOT blocks) =====
  - { from: B11, to: B4, kind: recommended, label: "informs L1 diagnosis" }
  - { from: B11, to: C3, kind: recommended, label: "informs L1 diagnosis" }
```

---

## §E. The Safety Relationships — how the worst bugs combine

### E.1 The verdict fusion (A2 + A3) — *the single most dangerous combination*

Part 3 §1 explicitly fuses **two** defects (not three — B2 is implicit in the risk but not in the verdict sentence):

```
  A2 (antagonisms soft)  ──┐
                            ├──> solver returns SAFE_TO_FEED
  A3 (hardcoded "adequate")──┤     for a diet that:
                                • violates Ca:P / Zn:Cu ratios (A2)
                                • may exceed safe Ca ceiling (B2, implicit)
                                • reports every nutrient as "adequate" (A3)
                                • NO test catches it (E2)
                          = mineral-toxicity / developmental-orthopedic-disease
                            risk for growing large-breed dogs
```

> "The two defects the sentence fuses are: 1. **Fake output (A3, the reporting layer)**. 2. **A 'hard' constraint that is actually soft (A2, the antagonism layer)**." (Part 3 §1)

**The 631% figure** is not arbitrary — it is the worst-case observed excursion: the most extreme Ca:Mg imbalance that the solver's penalty mechanism allows to be silently accepted.

**This is why the verdict is "pre-alpha — no diet may be fed."** (Part 1 §9.1, Part 3 §1, §12.)

### E.2 The three seams framing (Part 3 §4)

Part 3 reframes the defects as **three seam failures**, each a seam-version of the "contracts in name only" pattern (§E.3):

| Seam | Between | Findings | The failure |
|---|---|---|---|
| **Config ↔ Solver** | declared config ↔ implemented solver | A2, A5 (+ A1, A4, A6 implicit) | Config declares hard antagonisms; solver implements them soft. Config declares an objective-weights file; solver ignores it. |
| **Data ↔ Schema** | data file ↔ schema | C1, C4 | Data declares itself schema-conformant; schema declares data non-conformant (21 errors); no gate connects them. Schema expects fields data doesn't contain. |
| **Solution ↔ Output** | solver solution ↔ output layer | A3 | Solver computes a real solution with real nutrient values; output layer reports "adequate" for everything regardless. |

**"The defects are in the seams, not the motor."** (Part 3 §4) — the LP mathematical core is verified correct and stays; the seams are broken and must be repaired.

### E.3 The "contracts in name only" pattern (Part 3 §3.1 — ONE pattern, not 4 bugs)

Part 3 §3.1 explicitly unifies **A3 + A2 + C4 + C1** as **one structural pattern**, not four separate bugs:

> "not four bugs; it is one missing design principle. The project does not have a mechanism that forces 'what the code says it does' to match 'what the code actually does.'"

The fix is one design principle — **verified contracts** — implemented collectively by:
- **B6** (CI schema gate) + **B7** (canonical registry) + **C5/C9** (schema hardening) + **B1** (real output)

*(A prior version of this map split these into separate clusters — "Safety triad", "Schema conformance C1/C4/C13", "Output contract A3/E1/E2". That split lost the unification insight. C13 is a related data-contract finding but is not part of the core pattern.)*

### E.4 The containment layer — B0 (the safety freeze)

B0 is a **guard, not a fix**. It makes the system honest *today* by forcing `DO_NOT_FEED` + `feed_safe=false` + a visible banner whenever any of 5 trip conditions is true (Part 2 §5):

1. Any `nutrient_results[i].status == "adequate"` while `pct_of_min is None` → detects **A3**
2. Any antagonism slack > tolerance → detects **A2** (and B2a's prerequisite)
3. No absolute Ca max in config → detects **B2** (for growth scenarios)
4. DB fails schema → detects **C1** (and B6's prerequisite)
5. Validation package import fails → detects **D1** (and B5's prerequisite). **AUDIT_DELTA / NEW-1 note:** also accidentally detects **E24** (undeclared `pydantic`) — `orchestrator.py:37` (`from ..schemas import (...)` [pydantic]) fires BEFORE `orchestrator.py:54` (D1) in a clean `pip install -e ".[test]"` venv, so B0 trip-5 catches both the D1 import-smoke failure AND the E24 undeclared-pydantic failure with the same import attempt. **B5's DoD does NOT clear until E24 ships too** (E24-fix is scope-expanded into B5 + C14; no new task ID).

**B0 is independent of the fixes** — it re-detects each original defect until the real fix lands. As each P0 task completes, its trip condition clears. B0 is fully deletable once P0-1 through P0-6 land + vet signs off.

### E.5 The decisive protection — B1 + B2b (Part 3 §5.2, §3.3)

Since Level 1 (`SAFE_TO_FEED`) is **structurally unreachable** (verified by execution — Part 3 §7, see §G.1), the decisive protection that actually protects the animal today is the **B1 + B2b safety chain** — *not* the "B2a → B2b chain" as a prior version of this map stated.

| Task | What it does | Why it's decisive |
|---|---|---|
| **B1** | Replaces hardcoded "adequate" with real nutrient values + statuses | Without B1, the user sees nothing. B1 tells the user the truth. |
| **B2b** | Makes the feeding recommendation reflect realized violation magnitudes (severity-scaled), not just cascade level | Without B2b, B1 just shows the user the bad numbers under a SAFE_TO_FEED label. B2b makes the label itself reflect the severity. |

> "**B2b, not B2a**, is described as 'the decisive protection': B2a makes Level 1 honest, but Level 1 is unreachable; B2b makes Level 2 honest, and Level 2 is what the user actually receives." (Part 3 §3.3)

**B2a is in Part 3 §5.1 blockers; B2b is in Part 3 §5.2 safety chain. They are in DIFFERENT lanes.** B2a is a prerequisite of B2b (B2b needs the exposed slack that B2a produces), but B2a alone does not protect the animal because Level 1 is unreachable.

**B2b's mechanism can ship now** with placeholder thresholds; the actual threshold values wait on G3 + vet.

### E.6 The structural defect clusters (require multi-layer fixes in order)

| Cluster | Findings | Why structural |
|---|---|---|
| Verdict fusion (§E.1) | A2, A3 (+ B2 implicit, E2 test gap) | Cascade-level interaction; can't fix one layer alone |
| Contracts in name only (§E.3) | A3, A2, C4, C1 | One missing design principle; fixed collectively by B1+B2a+B6+B7+C5/C9 |
| Objective-trustworthiness | A5, A7 | Config↔solver contract; fix together (B9 deletes; C16 removes dead code) |
| Canonical namespace | B18, C2, C3, C5, C7 | Must exist BEFORE schema can enforce it (B7) |
| Schema conformance | C1, C4, C13 | Must be enforced BEFORE test can assert it (B6, B8, C5) |
| Validation import boundary | D1 | Must be repaired BEFORE any validation fix can be tested (B5) |
| Validation trust boundary | D4, D5, D8 | Must be repaired BEFORE validation outputs can be trusted (C8, C9, C12) |
| Output contract + test gap | A3/E1, E2 | Must be fixed together (B1) |
| CI gate gap | E6 | Must be repaired BEFORE any fix can be gated (C14) |
| Bug-numbering | E7 | Must be repaired BEFORE team can reliably triage (C15) |

### E.7 Reinforcements (make the verdict fusion worse, not part of it)

| Reinforcement | Effect |
|---|---|
| **A6** | Config-driven recommendation has no path to escalate on realized violations |
| **A1** | Broken lexicographic stage order → even Level-1's allocation isn't what config intended |
| **A4** | Antagonism penalty units mismatch (~500×) → distorts the Level-1 trade-off |

*(Note: The "reinforcements" framing originates in Part 1 §9.1, which explicitly states: "The triad is reinforced by three compounding defects: A6, A1, A4." Part 3 does not separately re-group them.)*

---

## §F. The Execution Order — 4 phases, with the critical chain highlighted

### Phase 0 (now): B0 — safety freeze
First commit. Backstops everything. Makes system honest today. 5 trip conditions re-detect A3, A2, B2, C1, D1.

### Phase 1 (now, G3-independent — 7 tasks can start in parallel)

**Recommended start order** (Part 2 §6, §10):
1. **B0** (safety freeze) — first commit
2. **B5** (restore `_shared.py`) — **CI is RED today; unblocks entire pipeline; the single most important next action** (Part 3 §9, §12)
3. **B6** (schema gate) — prevents data drift recurring
4. **B11** (Level-1 diagnosis) — cheap, high-info; **should run before B3/B4 ship**
5. **B2a** (harden antagonisms) — G1 resolved; independent
6. **B9** (= G2, delete objective_weights.json) — G2 resolved; removes dead config
7. **B10** (fix stage order) — independent

**AUDIT_DELTA note (NEW-3 / E25):** **E25-fix** (`src/gsd/mapa.py:988` imports `from tests.reference_cases import ...` — move `reference_cases` into `src/gsd/` OR graceful-skip on `ImportError`) is an independent P2 debt item that can also start now. Adjacent-uncovered by C14 and §C.5 item #6 (E19 packaging); blocks only `--gate-mapa` live-evidence under wheel install. Listed in §C.5 as debt item #12. Not on the critical path.

**Awaiting G3 + vet** (parallel lane, starts when G3 lands): B3 (Ca/P), B4 (growth), B2b-thresholds

**Awaiting B7** (dependency chain): B1, B5-ideal, B6-ideal, B8, B12

**Safety chain** (Part 3 §5.2 — the tasks that actually protect the dog): **B1 + B2b** (both must ship; neither alone sufficient)

### Phase 2 (after Phase 1): C1–C16 — P1 hardening
C-series fixes the 30 High bugs. C7–C12 all blocked by B5; C5 blocked by B7+B8; C4 blocked by G3+vet.

### Phase 3 (after Phase 2): R1–R5 — regression suite
Locks in the fixes so the test suite catches regressions, not just passes. R5 (dead code + DEBUG prints) is last — blocked by R1–R4.

### P2/P3 Debt (after Phase 3): 12 items from §C.5 (+1 = E25 from AUDIT_DELTA)
Mojibake fix, CLI argparse, packaging lockfile, doc-gen freeze, bioavailability validation, etc. YAGNI-parked items (solver.py split, type model consolidation) only if a P0 fix becomes hard.

---

## §G. Verified Facts Appendix

### G.1 Verified-by-execution findings (Part 3 §7 — 10 findings confirmed by direct execution; was 9, +1 = E24 from AUDIT_DELTA)

| # | Finding | Evidence | Verdict |
|---|---|---|---|
| 1 | **A3** — nutrient_results is a hardcoded fake | `solve_cascade()` with two real selections: `arginine_g` returned `value=0`, `status="adequate"`, `target_min=None`. "Not a code-reading inference — actual solver output." | Confirmed |
| 2 | **A2** — Mineral antagonisms are soft, not hard | `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` → **60 total** (5 mineral-antagonism: Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg; 55 nutrient minimums + toxicological limits). All 5 antagonisms silently soft. | Confirmed |
| 3 | **C1** — Ingredient bank fails its own schema | `jsonschema.Draft202012Validator` live against data file → **21 errors** (exactly as reported). | Confirmed |
| 4 | **D1** — `_shared.py` missing, validation package unimportable | `import gsd.validation.pipeline.orchestrator` → real `ModuleNotFoundError`. | Confirmed |
| 5 | **A5** — `objective_weights.json` is dead | `grep -c objective_weights src/gsd/solver.py` → **0**. | Confirmed |
| 6 | **C4** — `lp_parameters.schema.json` orphaned | Validated `lp_parameters_data.json` against schema → **3 errors** (fields `breed`, `domains` mismatch; 44 KB dead artifact). | Confirmed |
| 7 | **B-i** — Level 1 (`SAFE_TO_FEED`) effectively unreachable | Ran full cascade with 5-ingredient reference selection AND 10-ingredient broad selection. **Both** stopped at `cascade_level=2` / `solver_status="suboptimal"`. Neither reached Level 1. Original amendment: 5 selections × 2 scenarios = 10 runs, all stopped at Level 2. | Confirmed |
| 8 | **E23** — `[DEBUG]` prints in production stdout | Inspected real solver output → **40+ lines** of `[DEBUG]` noise. Known issue R-06, remains present. | Confirmed |
| 9 | **E5** — Timeout test is a stub | Test body's own comment: *"Hard to test without mocking; document expected behavior"*; body only calls `audit_test_result` with fixed dict — never invokes solver. Passes unconditionally. | Confirmed |
| 10 | **E24** — `pydantic` undeclared *(AUDIT_DELTA / NEW-1)* | Clean venv, `master@c932a21`, `pip install -e ".[test]"` (CI-exact): `orchestrator.py:37` (`from ..schemas import (...)` [pydantic]) fails with `ModuleNotFoundError: No module named 'pydantic'` BEFORE `orchestrator.py:54` (D1) is reached. `pydantic` absent from `pyproject.toml`/`requirements.txt`/CI; `types-pydantic` (stub-only) listed. The originally-cited D1 transcript ("191 tests / 1 error / 1.96s") was captured with `pydantic` pre-installed in the review sandbox, masking E24 (NEW-2). | Confirmed (NEW-1) |

**Static-confirmation note (E25, AUDIT_DELTA / NEW-3):** `src/gsd/mapa.py:988` `from tests.reference_cases import ...` is statically confirmed (import statement present; `tests/` excluded from `[tool.setuptools.packages.find] where=["src"]`). Wheel-install execution failure is "low-probability today, not zero" per AUDIT_DELTA — not added to the execution-verified count above (E24 is execution-verified; E25 is statically confirmed only), but listed in §C.5 as debt item #12.

**"The direct-execution verification found zero hallucinations in the Critical findings."** (Part 3 §7, §10)

### G.2 The LP core is verified correct (Part 3 §4, §7 — 7 components)

The following are **verified by direct execution** and **stay** — the defects are in the seams, not the motor:

1. **Lexicographic cascade** (3-level priority ordering) — correct
2. **Fix-optimum mechanism** (each level fixes previous level's optimum as bound before relaxing) — correct
3. **Per-ingredient Big-M formulation** — correct
4. **Normalized-deviation objective** — correct
5. **Resting Energy Requirement (RER)** — `70·BW^0.75`, the standard veterinary formula — correct
6. **Modified Atwater energy** (canine-appropriate ME formula, distinct from human-food Atwater factors) — correct
7. **AAFCO per-1000-kcal normalization** (matching AAFCO 2024 dog food nutrient profiles) — correct

### G.3 B12 reframing evidence (Part 3 §8 — 5 sub-observations)

Direct inspection showed arginine is already correctly placed — B12 became "confirm B1 fixes arginine display," not a data-model relocation:

1. `arginine_g` already in `bp["nutrients"]` for all 28 ingredients (zero top-level occurrences)
2. `arginine_g` already in `NUTRIENT_REGISTRY` at `lp_parameters_data.json` line 20, correctly typed
3. `arginine_g` already has AAFCO minimum constraint: `arginine_g >= 2.5` (energy-normalized)
4. `build_matrix()` carries arginine with correct non-zero values: `beef_muscle_raw → 6.86`, `chicken_muscle_raw → 11.94`
5. Lys:Arg constraint built correctly: `1.0 * arginine_g <= lysine_g <= 1.4 * arginine_g`

**A3 mechanism explained:** `arginine_g` is not among the 17 nutrients in the scenario-target list in `scenarios.json` → `targets_per_day.get(nid, 0)` falls through to default 0 → reports `value=0` / `status="adequate"`. Any nutrient not in scenario targets is affected, not just arginine.

### G.4 B5 escalation evidence (Part 3 §9 — 4 sub-observations; was 3 — AUDIT_DELTA extends pt.1 + adds pt.4)

1. `pytest tests/ -v` (the exact CI command) fails at **collection phase**: `collected 150 items / 3 errors` (phase1, phase5, phase6) → `Interrupted: 3 errors during collection`. **AUDIT_DELTA correction (NEW-2):** the originally-cited "191 tests collected, 1 error in 1.96s" transcript was captured with `pydantic` pre-installed in the review sandbox; a clean `pip install -e ".[test]"` reproduces 150 items / 3 collection errors. **Verdict unchanged** — CI is still RED today, the failure is still at collection, B5 is still the right fix.
2. Failure is at collection, not execution — pytest collects 150 items, then encounters 3 collection errors (phase1/phase5/phase6 import from the validation package, which cannot import because `validators/_shared.py` is missing AND `pydantic` is undeclared [E24]), and aborts. **No test runs.**
3. CI is **RED today**, not yellow, not "missing coverage" — red.
4. **(AUDIT_DELTA / NEW-1) E24 co-blocks B5's DoD:** `orchestrator.py:37` (`from ..schemas import (...)` [pydantic]) fires BEFORE `orchestrator.py:54` (D1) in a clean env — B5's DoD `import gsd.validation.pipeline.orchestrator → OK` **still fails post-B5 until E24 ships too**. E24-fix (add real `pydantic` to deps) is scope-expanded into B5 + C14; no new task ID.

**B5 implicitly blocks verification of B6, B1, B2a** (specifically named in Part 3 §9) — any task whose verification includes "run the test suite and confirm green" is implicitly blocked on B5.

### G.5 Gate resolutions (Part 3 §2 — direct-execution-verified)

| Gate | Resolution | Evidence |
|---|---|---|
| **G1** | HARD at Level 1 | Direct execution of the cascade confirmed that hard-enforcing antagonism infeasibility at Level 1 is feasible and correct for the model. |
| **G2** | DELETE | `grep -c objective_weights src/gsd/solver.py` → **0**. `CRITICALITY_WEIGHT` at `solver.py:17` is authoritative. |
| **G3** | PENDING | Methodology resolved (verify-first + vet review); values not yet supplied. Requires AAFCO 2024, NRC 2006, FEDIAF 2024 + DACVN/ECVCN. |

### G.6 The 6 empirically-cleared non-defects (Part 1 §10.2 — all enumerated)

These must NOT be "fixed" — Part 2 §2 YAGNI filter explicitly protects them:

| # | Hypothesis (cleared) | Why it's not a defect |
|---|---|---|
| 1 | Level-2/3 unbounded antagonism slack makes the objective unbounded | Slack is bounded by gram/constraint structure; in L2 it is simply free, not objective-unbounding. The defect A2 is that the slack is *unpenalized*, not that it makes the objective unbounded. |
| 2 | `prob.add_variable(...)` and `pulp.apis.coin_api.PULP_CBC_CMD.pulp_cbc_path` are invalid PuLP 3.3.2 APIs | Both are valid PuLP 3.3.2 APIs; dis-proven by direct installation and invocation. |
| 3 | Inclusion constraints on as-fed basis and nutrient-per-gram matrix compilation are wrong | The conversion `nutrient_per_gram = a_ij × em_per_g / 1000.0` is the right formula; unit handling is correct. |
| 4 | The fix-optimum lexicographic mechanism itself is broken | The mechanism is correct. The bug A1 is the *stage ordering* in the config (non-fixed stage is in the middle, not the end), not the `fix_optimum` mechanism itself. |
| 5 | The static requirement layer has errors (RER, Atwater, AAFCO mins, Ca:P 1.1–1.3, Vit D SUL, EPA+DHA, DB values) | All correct/strong. Diagnosis does not challenge any of these. |
| 6 | Validation pipeline has fundamental design flaws | List-form `subprocess` with timeouts (no `shell=True`/injection), `pydantic` config models, `BaseFetcher` interface, token-bucket rate limiting, CoFID checksum *intent*, and correct 404 → `MISSING` handling are all correct/strong. |

### G.7 Legacy review reconciliation (Part 1 §7.7 — 3 numbering schemes)

#### G.7.a REVIEW.md scheme (R-01..R-09)

| Legacy ID | Description | Status | Current ID |
|---|---|---|---|
| R-01 | Antagonism slack soft | **STILL PRESENT** | = A2 |
| R-02 | Level-3 SUL/DER not fixed | **FIXED** | (none — `fix_optimum=True` on L3) |
| R-03 | Hash-based tie-break perturbation | **FIXED** | (none — hash removed) |
| R-04 | Nutrient placeholder (pct_of_min/pct_of_sul null) | **STILL PRESENT** | = A3 / E1 (Critical P0) |
| R-05 | `_MIN` → `adequacy_soft` | **STILL PRESENT** | = A6 mechanism |
| R-06 | `[DEBUG]` prints | **STILL PRESENT** | = E23 (cosmetic Low P3) |
| R-09 | Nutrient placeholder (alternative ID) | **STILL PRESENT** | = A3 / E1 |
| R-01 "mitigation" | (overstated fix) | **OVERSTATED** | silent `.get` defaults remain |

#### G.7.b Governance docs scheme (R1..R7 — different from R-01..R-09)

| Legacy ID | Description | Status | Current ID |
|---|---|---|---|
| R1 | Antagonism unbounded slack | **STILL PRESENT** | = A2 |
| R2 | Level-3 SUL fix | **FIXED** | (none) |
| R3 | Tie-break hash removal | **FIXED** | (none) |
| R4 | pct_of_min/pct_of_sul null | **STILL PRESENT** | = A3 / E1 |
| R5 | `_MIN` forced `adequacy_soft` | **STILL PRESENT** | = A6 mechanism |
| R6 | `[DEBUG]` prints | **STILL PRESENT** | = E23 |
| R7 | pytest passes (37 tests) | **STILL PRESENT** (positive — 37 tests pass) | (none — verification, not defect) |

#### G.7.c Amendment list (F1..F6, D1..D2 — all FIXED)

| Legacy ID | Status |
|---|---|
| F1–F6 | **ALL FIXED** (per cross-cutting grep) |
| D1–D2 (amendment) | **ALL FIXED** (different namespace from validation D1–D22 — see §A.0) |

**The legacy self-review (R-01..R-09 / R1..R7) missed the safety-critical bugs.** The team's own reviews checked whether docs matched code, not whether the LP/nutrition/data are scientifically correct. R1 (=A2), R4 (=A3), R5 (=A6 mechanism) were known but unfixed; R2, R3 were fixed; R6 (DEBUG prints = E23) is cosmetic and still present.

### G.8 Execution environment

- **Commit:** `c932a21` (2026-07-25)
- **Solver:** `pulp==3.3.2`, CBC MILP backend (`randomSeed=12345`, `threads=1` for determinism)
- **Schema:** `jsonschema` Draft 2020-12
- **Test count:** `collected 150 items / 3 errors` in a clean `pip install -e ".[test]"` env (phase1/phase5/phase6 collection errors; **AUDIT_DELTA / NEW-2 correction** — originally cited as "191 collected / 1 error" but that transcript was captured with `pydantic` pre-installed, masking E24); ~207 tests across 12 files (README's doc-drift claim — see E22; this is the "expected total if collection succeeded" count, distinct from the 150 items actually collected before abort)
- **Validation package:** ~6,400 LOC
- **Total package:** 5,881 LOC (42% doc-gen)

### G.9 The deferred backlog (Part 3 §4.2, §5.5 — 8 items YAGNI-parked)

| # | Item | Parked because |
|---|---|---|
| 1 | `solver.py` split (1,661 lines) | YAGNI — unless a P0 fix becomes hard to make safely |
| 2 | `core.py` split (594-line grab-bag) | YAGNI — unless it demonstrably reduces bugs |
| 3 | Type-model consolidation (frozen dataclasses/pydantic) | YAGNI — unless it demonstrably reduces bugs |
| 4 | Doc-gen machinery cut (42% of package) | Frozen at current functionality; no new features |
| 5 | Mojibake fix (17/28 display names) | P2 debt — deferred until after safety work |
| 6 | Continuous mutation testing | Not triggered |
| 7 | Second solver for differential testing | CBC not suspected; LP math verified sound |
| 8 | Property-based tests (Hypothesis) | Not triggered |

---

## §H. The One-Sentence Verdict + Operational Consequence

> **Today the system can return `SAFE_TO_FEED` for a diet with a Ca:Mg ratio 631% out of range, with no way for the user to perceive this.** (Part 3 §1, §12)

That sentence is the reason no diet from the current code should be fed to any dog, and the reason the remediation program is a **safety** program, not a quality program. The math is correct and stays; the seams are broken and must be repaired in dependency order; G3 (vet sign-off) is the single non-engineering gate.

**Operational consequence** (Part 3 §12): The single most important next action is **Task B5: restore `validators/_shared.py`**. It is the first commit of the remediation, it is the most urgent G3-independent task, and it is the only task whose absence is currently breaking the entire CI pipeline. Until B5 ships, no other task's verification protocol can run.

**"Nothing has been corrected yet."** (Part 3 §2) — Every defect cataloged in Part 1, every task sequenced in Part 2, and every claim advanced in Part 3 is, as of commit `c932a21`, planning only. Not a single file in the repository has been touched in response to the remediation program. The planning layer is internally consistent; the diagnosis, the remediation plan, the executive roadmap, and the empirical amendment do not contradict one another. The verification against the live repository confirms that the diagnosis is trustworthy and that two refinements (B12 reframed, B5 escalated) are folded in as the current truth.

---

*End of bug/dependency map. This map is the graph view of the consolidated documentation set (Parts 1–4 + appendices). For the narrative treatment, read Part 1 (diagnosis), Part 2 (treatment), Part 3 (synthesis). For identifier disambiguation, see `APPENDIX-ID-KEY.md`. For runtime verification evidence, see `APPENDIX-VERIFICATION-LOG.md`.*

*Map version: 2.1 — AUDIT_DELTA integrated: **E24** (pydantic undeclared, Critical/P0, F-PKG-2, upstream of D1, co-blocks B5 — scope-expanded into B5+C14, no new task ID), **E25** (`mapa.py:988` imports `tests/`, Medium/P2, F-PKG-3, independent — new debt item #12 in §C.5), **NEW-2** (evidence-transcript correction: `collected 150 items / 3 errors` in clean env, not `191/1`; verdict unchanged — C15 scope extended to evidence reconciliation), **COR-1** (PART-1 D1 parenthetical factual-error corrected — no map edit, awareness only). Count deltas: raw findings 105→107, dedup 77→79, P0 10→11, P2 42→43, edges 44→45 (+1 = E24-fix co-requisite for B5 DoD), debt items 11→12, verified-by-execution 9→10. v2.0 baseline (105 raw / 77 dedup, 35 formal tasks + 11 debt items, 44 edges, 27 verified facts, 6 non-defects, 3 legacy numbering schemes) preserved; C4 finding-vs-task disambiguation, B2a→B2b decisive-protection framing, and G3→Task C4 gate edge all retained.*
