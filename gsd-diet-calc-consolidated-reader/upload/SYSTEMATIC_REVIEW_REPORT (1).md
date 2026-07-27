# Systematic Adversarial Review — `Hans-GSD-Raw-Calculator` (gsd-diet-calc v10.4.0)
## Consolidated Master Report (all five reviewer streams unified)

**Subject:** LP solver engine for raw canine diet formulation (German Shepherd, AAFCO Large Breed Growth).
**Repository:** `github.com/HansChucrute14/Hans-GSD-Raw-Calculator` (active Python engine; archived TypeScript predecessor `-gsd-diet-calc`).
**Scale:** 63 Python files (~22.3k LOC; 5,881 LOC in `src/gsd`), 34 JSON files, 4 JSON Schemas, PuLP 3.3.2 / CBC, jsonschema, requests, mypy-strict.
**Review mode:** Read-only adversarial systematic review. Five independent reviewers — **(A) LP/OR**, **(B) Canine Nutrition**, **(C) Data Modeling / JSON-Schema**, **(D) Validation-Pipeline Engineering**, **(E) Cross-cutting Architecture** — examined every subsystem; the parent independently re-verified all Critical claims against source (`grep`/`sed`/live JSON parse) and the LP reviewer **empirically installed PuLP 3.3.2** to disprove false positives.
**Date:** 2026-07-25.

> **Evidence honesty.** Code/data findings cite exact `file:line` / JSON paths and were re-verified by the parent. Nutritional comparisons were checked against the AAFCO Dog Nutrient Profiles, NRC (2006) *Nutrient Requirements of Dogs and Cats*, and USDA/FDC; values flagged **"verify"** (notably the numeric NRC safe-upper-limit table for Cu/Zn, and the FEDIAF 2025 PDF which did not parse cleanly) should be re-confirmed against primary documents before remediation. The LP reviewer **disproved** several crash hypotheses empirically (see §10) — those are *not* defects. The validation reviewer could **not** runtime-execute the broken import because `pydantic` is absent in the review sandbox; that finding is nonetheless statically conclusive (the module file does not exist and the symbol is defined nowhere in `src/`).

---

## 0. Executive summary

The project is **ambitious, partially sophisticated, and not production-ready**. The LP core is *sounder than the documentation suggests*: it is a **correct sequential lexicographic (fix-optimum) goal-programming cascade**, with tight per-ingredient Big-M coefficients, normalized deviation terms, a deterministic tie-break guarded against corrupting optimality, and a solver that **fails closed** (every non-`Optimal` status → `DO_NOT_FEED`, `allocations=None`). The test suite runs **real JSONs through real CBC** (not mocks), and several genuine correctness tests exist. The static nutrient-requirement layer is credible (AAFCO per-1000-kcal minimums, Ca:P hard-bounded 1.1–1.3, modified-Atwater energy, RER `70·BW^0.75`), and the ingredient values match USDA/FDC almost exactly.

But the system has **nine Critical defects**, several safety-critical for the animal and several meaning **the system is not what its documentation claims**:

| # | Critical defect | Where |
|---|---|---|
| C1 | Per-nutrient output **hardcoded `"adequate"`**, null gap % — completely untested | `solver.py:1203–1227` |
| C2 | **Mineral-antagonism constraints soft at every level** vs declared `HARD_FAIL_INFEASIBLE` | `solver.py:426–477` |
| C3 | **No absolute calcium maximum** (Large-Breed-Growth DOD safeguard missing) | `constraints.json` / `toxicological_limits.json` |
| C4 | **Flat `k = 1.2 × RER` growth energy**, age-independent; labels inverted | `core.py:199–207` |
| C5 | Ingredient DB **fails its own schema (21 errors)**; no CI schema gate | `DB_ingredientes.json` |
| C6 | **No canonical nutrient namespace**; schema blind to typos/wrong units | `db_ingredientes.schema.json` |
| C7 | `validation/validators/_shared.py` **missing** → package cannot import | `validation/*` |
| C8 | `objective_weights.json` (322 lines) **never wired into the LP** | `solver.py` (0 refs) |
| C9 | `lp_parameters.schema.json` (44 KB) **orphaned**; real config unschema'd | `lp_parameters.schema.json` |

**The safety triad (most dangerous):** C1 + C2 + C3 combine into *"the solver returns `SAFE_TO_FEED` for a diet that violates mineral ratios / exceeds calcium, and the user cannot tell."* Antagonisms are soft (C2), the recommendation is config-driven not violation-driven, and the per-nutrient table is hardcoded "adequate" (C1) with no test covering it — a direct mineral toxicity / developmental-orthopedic-disease risk for growing large-breed dogs.

**Overall verdict:** *Prototype / pre-alpha.* **No diet produced by this system should be fed to an animal until the P0 items are fixed and an independent board-certified veterinary nutritionist signs off.**

**Finding counts (deduplicated across streams):** 9 Critical · 27 High · 30 Medium · 11 Low ≈ **77 unique findings**, plus 6 empirically-cleared hypotheses and an explicit strengths list.

---

## 1. Methodology & evidence base

1. **Discovery & inventory** — cloned the repo; 63 `.py` / 34 `.json`; identified the core (`solver.py` 1661, `core.py` 606, `nutrition.py` 376), the `validation/` subsystem (~6.4k LOC), and the doc generators (`mapa.py` 1391, `doc_introspector.py` 1105).
2. **Five parallel adversarial reviewers** (LP/OR; canine nutrition; data-modeling/JSON-Schema; validation engineering; cross-cutting architecture), each instructed to assume hidden bugs and cite exact `file:line` / JSON paths in the 7-field format.
3. **Parent re-verification** of every Critical claim via `grep`/`sed`/live `jsonschema` parse (e.g. confirmed `_shared.py` absent; `objective_weights.json` has 0 references in `solver.py`; `nutrient_results` hardcoded verbatim; `SCENARIO_K_MAP` `k=1.2`; no calcium max in `constraints.json`).
4. **Empirical LP falsification** — installed PuLP 3.3.2 and tested crash hypotheses (§10).
5. **Consolidation** — the five full reviewer reports (provided in `Relatorio dos subagentes.txt`) were unified into this master report, deduplicated, and cross-referenced. Original reviewer finding IDs are preserved in parentheses for traceability.

---

# SUBSYSTEM A — LP MODEL & SOLVER
**Scope:** `src/gsd/solver.py` (1661 LOC), `src/gsd/core.py` (+`nutrition.py` glue), `data/{constraints,objective_weights,lp_parameters_data,formulation_rules,scenarios}.json`. PuLP pinned 3.3.2 (verified installed). **20 findings.**

## A-CRITICAL

### A1 (LP-F1) — Level 1 & 2 lexicographic stage order is broken (tie-break + category goals discarded)
- **Location:** `solver.py:611–684` (`call_lp_solver` loop); `lp_parameters_data.json` `solve_cascade` Level 1/2 `objective_stages`.
- **Severity:** Critical · **Priority:** P0
- **Root cause:** In preemptive GP the **last** stage must be the non-fixed (tie-break) stage and all higher-priority stages fixed. The config puts the non-fixed stage in the **middle**: L1 = `[goal_deviation(fix), category_preferences(NO fix), minimize_absolute_der_deviation(fix)]`; L2 analogous.
- **Evidence:** The loop adds a fixing constraint only `if fix_opt:` (`solver.py:670–680`: `bound = optimal_obj*(1+tol_rel)+tol_abs; prob += obj_expr <= bound`). Stage 2 (category) has `fix_optimum=False` → no constraint added. Stage 3 then `prob.setObjective(DER)` and re-optimizes over only `{goal_deviation <= bound1}`.
- **Impact:** The final allocation (read after the last solve, `solver.py:687`) optimizes DER deviation subject to goal_deviation only. **Category (BARF/PMR template) preferences and the deterministic tie-break have ZERO effect on Level 1/2 allocations.** Reported `template_adherence` (`solver.py:1290+`) is computed from grams never optimized for category goals.
- **Fix:** Reorder stages so the non-fixed tie-break stage is **last** (move DER before category, or fix category and make it the final free stage). Better: drive stage order/priority from a single explicit `priority` field and **assert at build time that the free stage is last**.

### A2 (LP-F2) — Mineral-antagonism constraints are SOFT at every level, contradicting `solver_behavior=HARD_FAIL_INFEASIBLE`
- **Location:** `solver.py:426–477` (antagonism slack), `:464–471`, `:516`; `data/constraints.json` / `formulation_rules.json` (`solver_behavior=HARD_FAIL_INFEASIBLE`).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Antagonism constraints (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg) were given slack variables that are penalized only in Level 1 and **unbounded + unpenalized in Levels 2–3**, while the JSON still declares hard-fail. The config author's note shows they *believed* it was hard.
- **Evidence:** Antagonism slack creation at `solver.py:426–477`; README "Reality check" admits antagonisms are soft; LP reviewer confirmed L2/L3 slack unpenalized; JSON `solver_behavior=HARD_FAIL_INFEASIBLE` contradicts the implementation.
- **Impact:** A diet with a violated Ca:P or Zn:Cu ratio can be returned as `SAFE_TO_FEED` (L1) or `FEED_WITH_CAUTION` (L2) with **no penalty and no flag**. Combined with C1 (fake "adequate") this is the core safety triad — **`SAFE_TO_FEED` with violated mineral ratios, undetectable** — a direct toxicity/deficiency risk for growing large-breed dogs.
- **Fix:** Make code match the true contract. If antagonisms are safety-critical (Ca:P/Zn:Cu are), enforce them as **hard constraints in Level 1** (no slack) so violation ⇒ infeasible ⇒ `DO_NOT_FEED`. If a relaxed view is wanted, expose the slack magnitude in the output and force `FEED_WITH_CAUTION`/`DO_NOT_FEED` when any antagonism slack > tolerance. Remove the lying `HARD_FAIL_INFEASIBLE` flag or implement it.

### A3 (LP-F5) — `nutrient_results.status` is hardcoded `"adequate"`; `pct_of_min`/`pct_of_sul` always null
- **Location:** `solver.py:1203–1228` (`build_output_contract`); validated by `validate_output` `solver.py:1505–1512`.
- **Severity:** Critical · **Priority:** P0
- **Root cause:** A placeholder ("simplified") implementation shipped and never completed; the output validator only checks that keys exist, not that values are meaningful. (Also reported as Cross-cutting F-CONTRACT-1 and F-TEST-2.)
- **Evidence (verbatim):**
  ```python
  # This is simplified - real implementation computes min/max from scenarios/matrix
  nutrient_results.append({ ... "target_max": None, "pct_of_min": None,
      "pct_of_sul": None, "status": "adequate", ... })
  ```
  Also `value = targets_per_day.get(nid, 0)` silently defaults a missing nutrient to `0`; `target_min` is set to `sul_value` only when `tier=="safety_hard"` else `None`.
- **Impact:** Every nutrient is reported "adequate" with no quantified gap/excess regardless of the true solution. The user has **no way to detect a deficiency or excess**. No test catches it (only `len >= 41` at `test_cascade_integration.py:193`).
- **Fix:** Compute `target_min`/`target_max` from the active scenario + matrix; `pct_of_min = value/target_min`, `pct_of_sul = value/sul`; derive `status` from real thresholds (`below_min`/`adequate`/`above_sul`). Make `validate_output` assert `status` is consistent with `value` vs bounds. Add a regression test feeding a known-deficient solution and asserting `status != "adequate"`.

## A-HIGH

### A4 (LP-F3) — Antagonism penalty has a units mismatch and dominates the normalized objective by ~500×
- **Location:** `solver.py:813–822` (esp. `:817–820`); penalty weights 7000/5000/5000/5000/3000.
- **Severity:** High · **Priority:** P1
- **Root cause:** Level-1 objective adds **raw g/mg antagonism slack × 5000–7000** alongside **dimensionless normalized** terms (`slack/target`, `v/sul`).
- **Evidence:** `solver.py:817–820` adds `penalty_weight × antagonism_slack` (grams/mg) while adequacy/SUL terms are normalized; "1 g Ca:P violation costs 7000 vs ≤10 for a missed nutrient goal."
- **Impact:** ~500× relative dominance of the antagonism term distorts the Level-1 trade-off; the solver over-prioritizes ratio centering relative to true nutrient adequacy.
- **Fix:** Normalize antagonism slack (e.g. `slack / target_ratio`) before weighting so all Level-1 terms are dimensionless and comparable.

### A5 (LP-F4) — `objective_weights.json` (asymmetric penalties, priority tiers, gonadal multipliers) is NOT used by the LP
- **Location:** `data/objective_weights.json` (322 lines, 29 entries); loaded only at `core.py:60/419` (`idx.weight_index`) and consumed by `mapa.py:530/533/1270` + `doc_introspector.py:703`. `solver.py` uses the hardcoded `CRITICALITY_WEIGHT` map at `solver.py:16`.
- **Severity:** High (correctness-of-intent / trust) · **Priority:** P0
- **Root cause:** The LP objective is built from the `clinical_criticality → weight` map and the `lp_parameters_data.json` stage definitions; the elaborate `objective_weights.json` is consumed only by the doc generators.
- **Evidence:** `grep -rn objective_weights src` returns only `core.py` (load + report) and the doc generators; `solver.py` never reads it. The asymmetric `PEN_CA_POS=10000` vs `PEN_CA_NEG=5000` and the `neutered_early ×1.5` gonadal multiplier are therefore **absent from the actual optimization**.
- **Impact:** The documented goal-programming priority structure does **not** influence the optimization. The system optimizes a different objective than the one described to users/reviewers — a fundamental trustworthiness gap and a maintenance trap (editing the weights file changes nothing).
- **Fix:** Either (a) wire `objective_weights.json` into `_build_stage_objective` as the authoritative source (delete the parallel `CRITICALITY_WEIGHT` map), or (b) delete `objective_weights.json` and document the real objective. One source of truth, covered by a test asserting objective coefficients match config.

### A6 (LP-F6) — `solver_status`/`feeding_recommendation` is purely config-driven, never conditioned on actual slack
- **Location:** `solver.py:1167`, `:1171–1177`; `result_status` L1=`optimal` / L2=`suboptimal` / L3=`unsafe_diagnostic`.
- **Severity:** High · **Priority:** P1
- **Root cause:** The feeding label is derived from which cascade level produced a solution (config-driven feasibility), not from the magnitude of realized violations.
- **Evidence:** `solver.py:1171–1177` maps level → status; no branch inspects antagonism/SUL/adequacy slack values.
- **Impact:** A solution with large antagonism slack (Level 1) can still map to `SAFE_TO_FEED`; a Level-2 solution with tiny slack maps to `FEED_WITH_CAUTION` regardless of severity.
- **Fix:** Derive the recommendation from realized violations: any hard slack > tol ⇒ at most `FEED_WITH_CAUTION`; any SUL slack > 0 or antagonism slack > tol ⇒ `DO_NOT_FEED`.

### A7 (LP-F7) — Documented clinical-floor relaxation fallback is unimplemented (`clinical_floor_relaxed` never set)
- **Location:** `solver.py:524–556`, `:719`, `:928–932`; `validate_output` check #9 (`relaxation_note`) is dead.
- **Severity:** High · **Priority:** P1
- **Root cause:** The Level-2/3 floor-relaxation path described in docs was never implemented; the flag is never assigned.
- **Evidence:** `clinical_floor_relaxed` is never set; `validate_output`'s relaxation-note check can never fire.
- **Impact:** Documented behavior is absent; reviewers/users expect a relaxation fallback that does not exist.
- **Fix:** Implement the relaxation path or remove the documentation and the dead validation check.

### A8 (LP-F8) — All non-`Optimal` CBC statuses collapse to `"infeasible"`
- **Location:** `solver.py:659–661`; solver config `cbc_time_limit_seconds=30`, `gapRel=0.01`.
- **Severity:** High · **Priority:** P1
- **Root cause:** A single `if status != "Optimal": return {"status":"infeasible"}` branch.
- **Evidence:** `solver.py:659–661`. PuLP statuses include Optimal / Not Solved / Infeasible / Unbounded / Undefined.
- **Impact:** This **fails closed** (→ `DO_NOT_FEED`, `allocations=None` — the *safe* direction, confirmed by Cross-cutting F-CONTRACT-2), but it conflates **Unbounded / Undefined / timeout** with infeasibility, masking modeling bugs and discarding MILP incumbents (a feasible-but-suboptimal solution at timeout is thrown away).
- **Fix:** Branch on `prob.status` → distinct `unbounded`/`timeout`/`numerical`/`infeasible` results, all mapping to `DO_NOT_FEED` but with different diagnostics; surface a `Not Solved` incumbent when available.

## A-MEDIUM

### A9 (LP-F9) — Big-M fallback `10000 g` weakens the MILP relaxation
- **Location:** `solver.py:178–181` (tight `M_i = DER/EM×100`), `:549–555` (clinical-floor `x ≤ M·y`, `x ≥ floor·y`); fallback `10000 g` when `EM_i` unavailable; supplement floor `0.1 g`.
- **Severity:** Medium · **Priority:** P2
- **Root cause:** A huge constant fallback when the per-ingredient energy density is missing; `M/floor` ratio can reach ~1e5.
- **Impact:** Weak LP relaxation, slower branch-and-bound, numerical stress.
- **Fix:** Derive a tight per-ingredient M or refuse to add the floor (raise) rather than fall back to a huge M.

### A10 (LP-F10) — Tie-break auto-scaled below tolerance can become numerically useless
- **Location:** `solver.py:25–103`, `:622–646`; `tie_break_weight=5e-6`; `randomSeed=12345`.
- **Severity:** Medium · **Priority:** P2
- **Root cause:** The tie weight is auto-scaled so its max contribution stays below the smallest tolerated primary difference; it can be scaled so small it never breaks ties.
- **Impact:** Degenerate tie-breaking; non-deterministic-looking selections among true optima.
- **Fix:** Set the tie weight to a meaningful fraction of the smallest tolerated primary difference and assert it is non-degenerate.

### A11 (LP-F11) — Sanity assertion ignores the bioavailability factor
- **Location:** `solver.py:195–234` (esp. `:212–217`) vs `nutrition.py:300–303` (`:302`).
- **Severity:** Medium · **Priority:** P2
- **Root cause:** The matrix-build sanity check compares raw vs converted nutrients without the bio factor that the conversion applies.
- **Impact:** A real bio-factor bug could pass the sanity assertion.
- **Fix:** Include the bio factor in the assertion (or assert the round-trip with bio applied).

### A12 (LP-F12) — Bioavailability factors keyed by generic names never match real `ingredient_id`s → `bio` always 1.0
- **Location:** `nutrition.py:248–262` (`:262`); `formulation_rules.json` `bioavailability_factors` keyed by generic tokens.
- **Severity:** Medium · **Priority:** P2
- **Root cause:** The bio-factor lookup keys (e.g. generic "muscle", "liver") never equal the real `ingredient_id`s, so the lookup always misses and defaults to 1.0.
- **Impact:** The entire bioavailability machinery is dead; nutrients are treated as 100% bioavailable regardless of source.
- **Fix:** Key bio factors by real `ingredient_id` (or a mapped category) and assert at load time that every ingredient resolves to a factor.

### A13 (LP-F13) — Rounded grams are never re-validated against hard constraints
- **Location:** `solver.py:1197`, `:1204–1228`, `:1494–1499` (`_unrounded_total_g`).
- **Severity:** Medium · **Priority:** P2
- **Root cause:** Grams are rounded for display/output but the rounded values are not re-checked against the hard constraints.
- **Impact:** Rounding can push the *delivered* diet marginally out of spec (e.g. just under a minimum or over a ceiling) while the report shows the rounded numbers as if compliant.
- **Fix:** Re-check (or round-and-repair) after rounding; report both raw and rounded totals.

### A14 (LP-F14) — Level 2/3 antagonism ignored (unpenalized slack)
- **Location:** `solver.py:463–471`, `:824–843`.
- **Severity:** Medium (compounds A2) · **Priority:** P1
- **Root cause:** In Levels 2/3 the antagonism slack is unpenalized, so violated ratios carry no cost.
- **Impact:** Reinforces the safety triad; ratio violations invisible in relaxed levels.
- **Fix:** Penalize or hard-bound antagonism slack at every level (see A2).

### A15 (LP-F15) — Latent duplicate-named-variable corruption
- **Location:** `solver.py:760–762`, `:782–783`, `:801–802`; PuLP `add_variable` dup-name behavior (empirically verified).
- **Severity:** Medium · **Priority:** P2
- **Root cause:** PuLP silently creates two variables with the same name; a future refactor could trigger silent objective corruption.
- **Impact:** Latent — currently safe, but a refactor that reuses a name silently breaks the model.
- **Fix:** Assert variable-name uniqueness at build time.

### A16 (LP-F16) — `caloric_density` target is a fixed scenario constant, not a derived variable
- **Location:** `solver.py:236–243` (`:241–243`); `scenarios.json` `caloric_density=4500 kcal/kg_DM`.
- **Severity:** Medium · **Priority:** P2
- **Root cause:** The caloric-density goal uses a hardcoded scenario constant rather than a value derived from the animal/scenario biology.
- **Impact:** The DER-proximity goal targets a possibly-arbitrary density; `PEN_CALORIC_POS` references a quantity that "is not a simple LP variable."
- **Fix:** Derive the target density from the scenario/animal model and document the source.

### A17 (LP-F17) — `fix_optimum` bound uses a relative+absolute tolerance that can over-constrain later stages
- **Location:** `solver.py:671–680` (`:679`); `fix_optimum_tolerance_abs=0.01`.
- **Severity:** Medium · **Priority:** P2
- **Root cause:** The fixing bound `optimal_obj*(1+tol_rel)+tol_abs` may be tighter than intended for near-zero objectives, risking infeasibility of later stages.
- **Impact:** Later lexicographic stages can be over-constrained → false infeasibility.
- **Fix:** Use a tolerance scaled to the objective magnitude; guard against near-zero `optimal_obj`.

### A18 (LP-F18) — Wide coefficient range (~1e8) in the objective/constraints
- **Location:** `solver.py:768–822` (`:805–820`).
- **Severity:** Medium · **Priority:** P2
- **Root cause:** Mixing raw gram/mg coefficients with normalized terms and large penalty weights produces a ~1e8 coefficient range.
- **Impact:** CBC numerical stress, potential precision loss in the simplex.
- **Fix:** Scale all terms to comparable magnitude (full normalization); keep coefficient range < ~1e4.

### A19 (LP-F19) — `weighted_normalized_deviation` helper appears unreferenced (dead/parallel code)
- **Location:** `solver.py:768–808`.
- **Severity:** Medium · **Priority:** P3
- **Root cause:** A deviation helper that is defined but not called by the active objective path.
- **Impact:** Confusion about which deviation formulation is authoritative; maintenance debt.
- **Fix:** Remove or wire in; document the authoritative deviation formulation.

### A20 (LP-F20) — Inclusion constraints relaxed only at Level 3 via a boolean flag
- **Location:** `solver.py:370`, `:516`; `add_inclusion_constraints(relax=(cascade_level==3))`.
- **Severity:** Medium · **Priority:** P3
- **Root cause:** Relaxation is controlled by a level-equality boolean rather than declarative config.
- **Impact:** Hard to extend (a 4th level or per-constraint relaxation policy requires code changes).
- **Fix:** Make relaxation policy declarative per constraint/level in config.

**LP single most dangerous issue:** the **A2 + A3 + A6 triad** — `SAFE_TO_FEED` for a diet that violates mineral-antagonism ratios, undetectable because the recommendation is config-driven and the nutrient table is hardcoded "adequate."

---

# SUBSYSTEM B — CANINE NUTRITION SCIENCE
**Scope:** `src/gsd/nutrition.py` (376 LOC), `data/{nutrient_bounds,nutrient_safety,nutrient_set_minimal,toxicological_limits,growth_energy_skeletal,bone_mineral_mix,lp_parameters_data}.json`, `DB_ingredientes.json` spot-checks. Verified against AAFCO Dog Nutrient Profiles, NRC (2006), USDA/FDC. **18 findings.**

## B-CRITICAL

### B1 (NUTR-F1) — Growth DER multiplier `k = 1.2 × RER`, flat & age-independent (and labels inverted)
- **Location:** `core.py:199–207` (`SCENARIO_K_MAP`), `nutrition.py:173–178` (DER = RER × k), `growth_energy_skeletal.json` (`k_multipliers`).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** A single hard-coded multiplier ("LP model default: 1.2") applied to the *recommended* slow-growth scenario, no age tapering; the higher multiplier labeled "discouraged".
- **Evidence (verbatim):**
  ```python
  SCENARIO_K_MAP = {
      "SCN_B_SLOW_GROWTH": "slow_growth_recommended",   # k = 1.2
      "SCN_A_RAPID_GROWTH": "rapid_growth_discouraged", # k = 2.0
  }
  ```
- **Impact:** NRC (2006) growth energy is ~2–3 × RER tapering with age (large breeds grow longer). `1.2 × RER` is in the **adult-maintenance / weight-control range**; feeding a young GSD puppy at 1.2 × RER **underfeeds it by ~40–60%**. Labeling is inverted (the multiplier closer to a real growth requirement, 2.0, is "strongly discouraged"). The likely authorial intent — "restrict energy to slow growth" — is the *wrong mechanism*: growth rate is managed via mineral balance and *amount fed*, not by dropping below the energy requirement.
- **Fix:** Replace flat `k` with an age/weight-band schedule from NRC/FEDIAF (e.g. ~3×RER < 4 mo tapering toward ~2×RER by ~12–18 mo for large breeds), keyed to the animal's age/weight in `AnimalInput`; relabel scenarios; unit-test DER against published requirement tables.

### B2 (NUTR-F3) — No absolute calcium maximum (Large-Breed-Growth DOD safeguard missing)
- **Location:** `constraints.json` (calcium: `calcium_g_AAFCO_min` `calcium_g >= 3.0`; Ca:P `1.1·P ≤ Ca ≤ 1.3·P`; Ca:Mg `12·Mg ≤ Ca ≤ 18·Mg`); `toxicological_limits.json` (no calcium entry).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Only a calcium *minimum* and *ratio* constraints modeled; the absolute *ceiling* omitted. (`nutrient_bounds.json` `calcium_g hard_max 30` is a per-100 g *ingredient-composition* plausibility bound, **not** a dietary ceiling.)
- **Evidence:** `grep calcium constraints.json` shows min + ratios only; no `calcium_g <= X`. AAFCO Large Breed Growth sets a Ca ceiling (~1.8% DM ≈ 4.5 g/1000 kcal).
- **Impact:** **Excess calcium causes developmental orthopedic disease** (osteochondrosis, hypertrophic osteodystrophy) in large-breed puppies — the single most important breed-specific safeguard, unenforced. With only a ratio constraint, Ca and P can scale up together (ratio satisfied) past the safe absolute level.
- **Fix:** Add hard `calcium_g <= 4.5 g/1000kcal` (AAFCO Large Breed Growth max) and a phosphorus maximum; encode in `toxicological_limits.json`/`constraints.json` as `HARD_INEQUALITY_MAX`. Verify exact AAFCO/FEDIAF ceilings against current primary documents.

## B-HIGH

### B3 (NUTR-F4) — No phosphorus maximum
- **Location:** `constraints.json` (P bounded only by Ca:P ratio + a P minimum); `toxicological_limits.json` (no P entry).
- **Severity:** High · **Priority:** P1
- **Root cause:** P max omitted alongside Ca max.
- **Impact:** P can scale up with Ca; excess P perturbs Ca:P and mineral balance.
- **Fix:** Add a P ceiling consistent with AAFCO/FEDIAF.

### B4 (NUTR-F5) — Energy/density denominator hardcodes 72% moisture / 1% ash for all 28 ingredients
- **Location:** `nutrition.py` (dry-matter / energy-normalization conversion); DB stores no moisture/ash.
- **Severity:** High · **Priority:** P1
- **Root cause:** A fabricated dry-matter fraction is used for every ingredient because the DB stores no moisture/ash.
- **Impact:** Every nutrient-density (per-1000-kcal / per-kg-DM) conversion is biased; ingredients with very different real moisture (e.g. egg ~75%, bone meal ~10%) are all treated as 72% water.
- **Fix:** Store measured moisture/ash per ingredient and compute DM from data.

### B5 (NUTR-F6) — No age tapering of energy or nutrient requirements across growth
- **Location:** `nutrition.py` / `growth_energy_skeletal.json`.
- **Severity:** High · **Priority:** P1
- **Root cause:** Requirements are static across the growth window (compounds B1).
- **Impact:** A 2-month and a 14-month GSD get identical per-kg requirements; large-breed growth needs tapering energy and shifting Ca/P.
- **Fix:** Age/weight-band the requirement schedule.

### B6 (NUTR-F7) — Copper SUL = 100 mg/1000 kcal (≈ 400 mg/kg DM) is permissive
- **Location:** `toxicological_limits.json` (`copper_mg.sul.value = 100`, `basis=energy_normalized`); note claims "AAFCO não estabelece formalmente limite superior para cobre."
- **Severity:** High · **Priority:** P1 (value **verify** vs NRC safe upper ~250 mg/kg DM)
- **Root cause:** A "pragmatic" SUL set high; AAFCO max for Cu in dog food (~25 mg/kg DM) not applied.
- **Impact:** GSDs can be copper-storage prone; 400 mg/kg DM is well above commonly-cited safe uppers → hepatotoxicity risk (the note's own Fenton-reaction rationale argues for a *lower* ceiling).
- **Fix:** Lower to a defensible SUL with citation; reconcile the "no formal limit" claim against current AAFCO profiles.

### B7 (NUTR-F8) — Iron SUL 130 mg/1000 kcal (≈ 520 mg/kg DM) — verify
- **Location:** `toxicological_limits.json` (`iron_mg.sul.value = 130`).
- **Severity:** High · **Priority:** P1 (**verify**)
- **Impact:** Plausible-ish but should be confirmed against NRC safe upper.
- **Fix:** Confirm vs NRC (2006) safe upper limit table.

### B8 (NUTR-F9) — Iodine SUL 2.5 mg/1000 kcal (≈ 10 mg/kg DM) may exceed AAFCO max
- **Location:** `toxicological_limits.json` (`iodine_mg.sul.value = 2.5`).
- **Severity:** High · **Priority:** P1 (**verify** — AAFCO dog I max ~5 mg/kg DM)
- **Impact:** If AAFCO max is 5 mg/kg DM, 10 mg/kg DM exceeds it → thyroid risk.
- **Fix:** Verify and lower if needed.

### B9 (NUTR-F10) — Manganese SUL 15 mg/1000 kcal may be too tight
- **Location:** `toxicological_limits.json` (`manganese_mg.sul.value = 15`).
- **Severity:** High · **Priority:** P1 (**verify**)
- **Impact:** Mn safe upper is usually far higher (~1000 mg/kg); 15 mg/1000 kcal could cause **infeasibility** with Mn-rich ingredients (mussel, bone) while not reflecting a real toxicity ceiling.
- **Fix:** Re-derive from NRC; distinguish requirement from safe-upper.

### B10 (NUTR-F11) — Zinc SUL 300 mg/1000 kcal (≈ 1200 mg/kg DM) — verify
- **Location:** `toxicological_limits.json` (`zinc_mg.sul.value = 300`).
- **Severity:** High · **Priority:** P1 (**verify**)
- **Impact:** High; note says no formal AAFCO limit, based on Zn–Cu antagonism + NRC 2006. Confirm.
- **Fix:** Confirm vs NRC and the Zn:Cu antagonism constraint.

### B11 (NUTR-F2) — Scenario energy labels are inverted relative to nutritional correctness
- **Location:** `core.py:199–207`, `scenarios.json`.
- **Severity:** High · **Priority:** P1
- **Root cause:** The higher (more growth-appropriate) multiplier is flagged "discouraged"; the too-low one "recommended".
- **Impact:** Users are steered toward the under-feeding scenario.
- **Fix:** Relabel per B1; separate "controlled growth" (mineral/amount management) from "energy restriction."

## B-MEDIUM

### B12 (NUTR-F12) — `cobalamin_b12_mg` unit/bound likely off by ~1000×
- **Location:** `nutrient_bounds.json` (`cobalamin_b12_mg hard_max 500`); DB values in mg (e.g. `0.00381`).
- **Severity:** Medium · **Priority:** P2
- **Root cause:** B12 is physiologically a µg-scale nutrient; a 500 mg/100 g hard_max is ~1000× too high for the named unit.
- **Impact:** Either the unit label is wrong (should be µg) or the bound is meaningless; risks a silent unit error.
- **Fix:** Confirm the unit (µg vs mg) and set a physiologically sane bound; bind unit to the key suffix (see C6).

### B13 (NUTR-F13) — Vitamin-A plausibility `hard_max 500000 IU/100g` rejects legitimate cod-liver-oil
- **Location:** `nutrient_bounds.json` (`vitamin_a_iu hard_max 500000`); note acknowledges cod-liver-oil ~1.8 M IU/100g.
- **Severity:** Medium · **Priority:** P3
- **Impact:** A legitimate ingredient is rejected by the plausibility bound (treated as supplement).
- **Fix:** Raise the bound or whitelist supplement-class ingredients.

### B14 (NUTR-F14) — Bone Ca:P ≈ 1.94 is slightly low vs hydroxyapatite (~2.0–2.2)
- **Location:** `bone_mineral_mix.json`; `chicken_neck` Ca disagrees ~2.7× between DB and `bone_mineral_mix.json`.
- **Severity:** Medium · **Priority:** P2
- **Impact:** Slightly low bone Ca:P biases the mineral model; intra-ingredient Ca inconsistency.
- **Fix:** Reconcile bone Ca:P to ~2.0–2.2 and align DB vs bone-mix values.

### B15 (NUTR-F15) — Taurine absent from the nutrient set (breed-relevant)
- **Location:** `nutrient_set_minimal.json` / DB nutrient keys.
- **Severity:** Medium · **Priority:** P2
- **Impact:** AAFCO doesn't require taurine for dogs, but it is breed-relevant (DCM concerns in some lines); not modeled.
- **Fix:** Add taurine as a tracked (informational or soft) nutrient.

### B16 (NUTR-F16) — Vitamin-D AAFCO *minimum* not represented in the matrix
- **Location:** nutrient matrix / `nutrient_bounds.json`.
- **Severity:** Medium · **Priority:** P2
- **Impact:** The solver still enforces the 125 IU minimum via another path, but the matrix representation is incomplete.
- **Fix:** Represent the vit-D minimum explicitly in the matrix.

### B17 (NUTR-F17) — Vitamin-A / Fe SUL mislabeled; Zn SUL slightly permissive
- **Location:** `toxicological_limits.json` notes/labels.
- **Severity:** Medium · **Priority:** P2
- **Impact:** Mislabeling obscures the regulatory basis; minor permissiveness.
- **Fix:** Correct labels; tighten where appropriate.

### B18 (NUTR-F18) — Nutrient-count inconsistency across files (41 / 43 / 46 / 54)
- **Location:** `nutrient_bounds.json` (41), DB claim (43), `core.py` comment (46), `nutrient_set_minimal.json` (54).
- **Severity:** Medium · **Priority:** P2
- **Impact:** No single authoritative nutrient count; risk of nutrients modeled in one place but not another.
- **Fix:** One canonical nutrient registry (see C6) that all files reference.

**Nutrition strengths (verified):** RER `70·BW^0.75` correct; modified-Atwater factors 3.5/8.5/3.5 correct; AAFCO per-1000-kcal minimums correct basis; Ca:P hard-bounded 1.1–1.3 (stricter than AAFCO 1:1–2:1, appropriate); vitamin-D SUL = AAFCO max; EPA+DHA minimum present; **DB ingredient values match USDA/FDC almost exactly** (spot-checks of chicken muscle, liver, bone, egg, fish).

---

# SUBSYSTEM C — INGREDIENT DATABASE & JSON SCHEMAS
**Scope:** `DB_ingredientes.json` + 4 schemas + 4 maps. Method: `jsonschema` Draft 2020-12 validation + Python profiling (read-only). **22 findings (5 Critical, 8 High, 5 Medium, 4 Low).**

**Headline probe numbers:** 28 ingredients (6 categories) · **9 distinct nutrient key-sets** (not 1 uniform 43) · 48-key union / 43-key intersection · DB→schema validation = **21 errors** · `lp_parameters_data.json`→its schema = **3 errors** · map↔DB nutrient-key overlap = **0** · 20 measured entries missing `unit` · 48 measured=0 / 36 not_applicable / **0 missing** · 17/28 mojibake names · 2 BOM-corrupted files.

## C-CRITICAL

### C1 (DATA-F1) — The DB does NOT validate against its own schema (the "validated" claim is false)
- **Location:** `data/DB_ingredientes.json` vs `data/db_ingredientes.schema.json` (whole doc).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Data shipped in a state that violates the schema it claims to be "validated against"; no CI gate.
- **Evidence:** `Draft202012Validator(schema).iter_errors(db)` → **21 errors**. 20 are drift-key entries with `status:"measured"` but **no `unit` key** (e.g. `protein_sources/bovinos/ingredients/1/.../cobalamin_b12_mg` → `{'value': 0.00381, 'status': 'measured'} is not valid under any of the given schemas`); 1 is `pork_fat_raw/ara_arachidonic_acid_g` whose `note` is 208 chars > `maxLength:200`.
- **Impact:** The "validated against JSON Schema Draft 2020-12" guarantee is currently untrue; any consumer trusting the badge ingests unvalidated data.
- **Fix:** Run validation in CI and block merges on failure; repair the 20 unit-less measured entries and the over-long note.

### C2 (DATA-F2) — No canonical nutrient-key enumeration → schema is blind to typos and wrong key-sets
- **Location:** `data/db_ingredientes.schema.json` (`patternProperties` + `minProperties:43`).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Nutrients matched by free-text key *patterns* with a *count* constraint, not an enumerated canonical key set.
- **Evidence:** An adversarial typo'd nutrient key produced **0 validation errors**; the 28 ingredients yield **9 distinct key-sets** (48-key union / 43-key intersection).
- **Impact:** A misspelled nutrient key passes silently; the schema cannot tell a wrong key-set from a right one.
- **Fix:** Use `propertyNames: {enum: [...exact 43 keys...]}` + `required`; reject `additionalProperties`.

### C3 (DATA-F3) — No single canonical nutrient namespace (three conflicting naming schemes)
- **Location:** DB (`_mg`/`_ug` keys) vs solver (`_g`) vs unit-less "drift" keys; `data/*_nutrient_map.json`.
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Three naming schemes coexist with no registry binding them.
- **Evidence:** map↔DB nutrient-key overlap = **0**; duplicate nutrients in mixed units.
- **Impact:** The same nutrient can appear under different keys/units in different layers; the LP may ingest the wrong coefficient.
- **Fix:** One canonical nutrient registry (`id` + `unit` + `basis`) referenced by all files (see B18).

### C4 (DATA-F4) — The 44 KB `lp_parameters.schema.json` is orphaned: it validates ZERO data files
- **Location:** `data/lp_parameters.schema.json` vs `data/lp_parameters_data.json`.
- **Severity:** Critical · **Priority:** P0
- **Root cause:** The schema describes an obsolete shape (`breed` + `domains`); the data uses `NUTRIENT_REGISTRY` + `solve_cascade`.
- **Evidence:** `lp_parameters_data.json` fails `lp_parameters.schema.json` with **3 errors** (expected `breed`/`domains`, found `NUTRIENT_REGISTRY`/`solve_cascade`). The schema validates **no** data file.
- **Impact:** The most safety-relevant config (cascade, nutrient registry, SULs, clinical criticality) is governed by **no working schema**, while a 44 KB schema governs nothing.
- **Fix:** Rewrite the schema to match the real data (or split into `nutrient_registry.schema.json` + `solve_cascade.schema.json`); validate it in CI against the live file.

### C5 (DATA-F5) — Duplicate nutrient entries with omitted `unit` and conflicting values
- **Location:** `DB_ingredientes.json` (e.g. `chicken_blood_raw` magnesium).
- **Severity:** Critical · **Priority:** P0
- **Root cause:** The same nutrient appears twice for an ingredient with different units/values; the schema's count-only check doesn't catch it.
- **Evidence:** `chicken_blood_raw` magnesium **20.5 vs 5.0 mg** (a real value conflict, not just a key typo).
- **Impact:** The LP ingests whichever value wins the duplicate — a **silent 1000×-class mineral error** → a direct silent-poisoning vector for puppies.
- **Fix:** Deduplicate; enforce one entry per nutrient per ingredient with a bound unit.

## C-HIGH

### C6 (DATA-F6) — No numeric bounds on any nutrient value (negatives & absurd magnitudes pass)
- **Location:** `db_ingredientes.schema.json` (nutrient value schema).
- **Severity:** High · **Priority:** P1
- **Evidence:** Negative values and `1e9` pass validation.
- **Fix:** Add per-nutrient `minimum`/`maximum` (or at least `minimum: 0` + sane maxima).

### C7 (DATA-F7) — Unit is not bound to the nutrient key (wrong-unit values pass)
- **Location:** `db_ingredientes.schema.json`.
- **Severity:** High · **Priority:** P1
- **Evidence:** `chloride_mg` with `unit:"g"` passes.
- **Fix:** Bind each key suffix to its required unit (`*_mg` ⇒ `unit:"mg"`).

### C8 (DATA-F8) — `additionalProperties:false` missing on 7 object types (silent typo'd keys)
- **Location:** `db_ingredientes.schema.json` (7 object definitions).
- **Severity:** High · **Priority:** P1
- **Fix:** Close all object types with `additionalProperties:false`.

### C9 (DATA-F9) — UTF-8 BOM makes two files unloadable by strict parsers
- **Location:** `nutrient_set_minimal.json`, `nutrient_safety.schema.json`.
- **Severity:** High · **Priority:** P1
- **Evidence:** Files begin with `` (BOM); strict `json.load` raises "Expecting value".
- **Fix:** Strip BOM; load with `utf-8-sig`; add a CI check.

### C10 (DATA-F10) — DB↔registry FDC-id referential integrity is broken; intra-record provenance contradicts itself
- **Location:** `DB_ingredientes.json` `source_ref` vs `ingredient_registry.json`.
- **Severity:** High · **Priority:** P1
- **Evidence:** 18 DB `source_ref`s not in the registry; 12 registry ids never cited; `beef_muscle` `source_ref 170196` contradicts its own note + registry `169483`.
- **Fix:** Enforce referential integrity (every DB `source_ref` ∈ registry); fix `beef_muscle`.

### C11 (DATA-F11) — `lp_constraints` has no upper bound and no min≤max invariant
- **Location:** `lp_parameters.schema.json` / `lp_parameters_data.json` `lp_constraints`.
- **Severity:** High · **Priority:** P1
- **Fix:** Add upper bounds and a `min ≤ max` schema invariant.

### C12 (DATA-F12) — Identity rules inconsistent across schemas (id pattern + FDC-id type)
- **Location:** `db_ingredientes.schema.json` vs `ingredient_registry.schema.json`.
- **Severity:** High · **Priority:** P1
- **Fix:** Unify the `ingredient_id` pattern and FDC-id type across schemas.

### C13 (DATA-F13) — The 3-state contract collapses in practice: `missing` never used; 48 measured-zeros conflate "0" with "unknown"
- **Location:** `DB_ingredientes.json` nutrient entries.
- **Severity:** High · **Priority:** P1
- **Evidence:** `missing` used **0 times**; **48 `measured = 0`** entries; 36 `not_applicable`.
- **Impact:** A mineral could be treated as 0 when it is actually unmeasured → silent deficiency in the LP.
- **Fix:** Require an explicit `missing`/`not_applicable` state; forbid ambiguous `measured:0` for safety nutrients.

## C-MEDIUM

### C14 (DATA-F14) — `lp_parameters.schema.json` uses Draft-07 `definitions` under a Draft 2020-12 dialect; bounds sparse
- **Severity:** Medium · **Priority:** P2 · **Fix:** Use `$defs`; add bounds.

### C15 (DATA-F15) — `nutrient_safety.schema.json`: no coverage requirement, no `$id`, not closed, BOM
- **Severity:** Medium · **Priority:** P2 · **Fix:** Add `$id`, close it, require coverage of all safety nutrients, strip BOM.

### C16 (DATA-F16) — Mojibake in 17/28 `display_name`s (double-encoded UTF-8)
- **Severity:** Medium · **Priority:** P2 · **Evidence:** 17/28 names are double-encoded UTF-8. **Fix:** Re-encode from the original source.

### C17 (DATA-F17) — Schema self-contradiction on the nutrient count (46 vs 43)
- **Severity:** Medium · **Priority:** P2 · **Fix:** Reconcile to the canonical count (see B18/C3).

### C18 (DATA-F18) — `ingredient_registry.schema.json`: not closed, no `$id`, sub-objects open
- **Severity:** Medium · **Priority:** P2 · **Fix:** Add `$id`, close sub-objects.

## C-LOW

### C19 (DATA-F19) — `note` exceeds `maxLength:200` (1 entry: `pork_fat_raw/ara_arachidonic_acid_g`, 208 chars)
- **Priority:** P3 · **Fix:** Trim or raise the limit.

### C20 (DATA-F20) — Overlapping amino-acid keys risk double-counting
- **Priority:** P3 · **Evidence:** e.g. `methionine_g` + `methionine_plus_cystine_g`, `phenylalanine_g` + `phenylalanine_plus_tyrosine_g`. **Fix:** Document which are independent vs composite; prevent summing both.

### C21 (DATA-F21) — `bioavailability_factors` is fully unvalidated
- **Priority:** P3 · **Fix:** Schema-validate it (compounds A12).

### C22 (DATA-F22) — Hardcoded nutrient/ingredient counts duplicated across schema + metadata (extensibility tax)
- **Priority:** P3 · **Fix:** Derive counts; single source of truth.

**Data strengths:** `NutrientEntry` `oneOf` (measured/not_applicable/missing) is well-designed; **DB↔registry `ingredient_id` integrity is perfect (28 = 28)**.

**Data single worst risk:** the absence of a canonical, enumerated nutrient namespace combined with no unit/key binding (C2+C3+C7) — it lets the *same nutrient appear twice in conflicting units* (`chicken_blood_raw` Mg 20.5 vs 5.0) and lets a typo'd/wrong-unit nutrient pass silently, so the LP can ingest a 1000×-off mineral value with no error — a direct silent-poisoning vector for puppies (P0).

---

# SUBSYSTEM D — VALIDATION PIPELINE
**Scope:** `src/gsd/validation/` (23 files, ~6.4k LOC): `config`, `registry_loader`, `safety`, `schemas`, `fetchers/{base,cached,cofid,fdc,local_fdc}`, `pipeline/{orchestrator(764),staging,git_manager,backup_manager,audit_logger,diff_generator}`, `validators/{bone,cofid,coverage_analyzer,deviation(661),fdc,fusion,plausibility,source_searcher(574)}`. Read-only. **22 findings.**

## D-CRITICAL

### D1 (VAL-F1) — Package cannot be imported: `_shared` module is missing (broken import)
- **Location:** `pipeline/orchestrator.py:54`; `validators/bone_validator.py:39`; `validators/cofid_validator.py:33`; `validators/fdc_validator.py:36`.
- **Severity:** Critical · **Priority:** P0
- **Root cause:** Four modules do `from ._shared import extract_db_value` (or `..validators._shared`), but `validators/_shared.py` does not exist and `def extract_db_value` is defined nowhere in `src/` (verified with `find` + `grep -rn "def extract_db_value"`).
- **Evidence:** `orchestrator.py:54 from ..validators._shared import extract_db_value`; `fdc_validator.py:36 from ._shared import extract_db_value as _extract_db_value`; `cofid_validator.py:33 …`; `bone_validator.py:39 … as _extract_db_value_solver`; `find . -name '_shared*'` → *(empty)*; `grep -rn "def extract_db_value" src/` → *(empty)*.
- **Impact:** `import gsd.validation.pipeline.orchestrator` (and any of the three validators) raises `ModuleNotFoundError` at import time. The entire validation pipeline is **dead on arrival** — no run can start. *Scope:* the `--runtime` formulation path does not import `gsd.validation`, so diet solving still runs; but `--validate-db`'s pipeline tier and all FDC/COFID validation cannot execute. (Runtime import not executed here — `pydantic` absent in the review sandbox — but the file's absence is statically conclusive.)
- **Fix:** Restore/create `validators/_shared.py` implementing `extract_db_value(nutrient_id, db_ingredient)` (the G5 helper the comments reference) with unit tests. Add a CI smoke test that imports every public module so a missing file can never merge again.

## D-HIGH

### D2 (VAL-F2) — FDC API key transported in URL query string + leaked via `str(exc)`
- **Location:** `fetchers/fdc_fetcher.py:260`, `:367` (key in `params`); `:272` (`str(exc)` stored in result).
- **Severity:** High · **Priority:** P1
- **Root cause:** The key is passed as `params={"api_key": self._api_key}`, landing in the request URL; on any `requests.RequestException`, raw `str(exc)` (which can contain the URL) is captured into the persisted result/audit.
- **Impact:** The secret leaks into persisted audit/logs and any committed artifact.
- **Fix:** Send the key in a header; scrub it from exception strings/logs; rotate the key. Best because it removes the secret from every persisted artifact at once.

### D3 (VAL-F3) — Empty FDC "200 with no nutrients" is accepted as a clean validation
- **Location:** `validators/fdc_validator.py:76/90/143`; fixture `pork_rib_100088_empty.json`.
- **Severity:** High · **Priority:** P1
- **Impact:** An ingredient can "validate" as all-zeros, silently emptying its nutrient profile.
- **Fix:** Treat an empty nutrient list as `MISSING`/error, not zero.

### D4 (VAL-F4) — Audit trail is overwrite-mode, mutable, and not tamper-evident
- **Location:** `pipeline/audit_logger.py`; `orchestrator._add_countermeasure_note:163`.
- **Severity:** High · **Priority:** P1
- **Root cause:** Overwrite-mode logging, second-resolution timestamps (collisions), and the orchestrator rewrites prior audit entries.
- **Impact:** Provenance integrity is weak; the audit trail is not append-only/tamper-evident.
- **Fix:** Append-only, hash-chained log with ms timestamps; never rewrite prior entries.

### D5 (VAL-F5) — Circuit-breaker countermeasure gate is satisfied by an editable JSON field
- **Location:** `pipeline/orchestrator.py` (countermeasure gate).
- **Severity:** High · **Priority:** P1
- **Impact:** The safety gate is defeatable by editing a JSON field.
- **Fix:** Make the gate non-trivially defeatable (e.g. tie to git identity / signed marker).

### D6 (VAL-F6) — CoFID checksum pinning is bypassed once the CSV is cached
- **Location:** `fetchers/cofid_fetcher.py:209–212` vs `:226`.
- **Severity:** High · **Priority:** P1
- **Impact:** A cached CSV is trusted without re-verifying its sha256 → cache poisoning / silent drift.
- **Fix:** Verify the checksum on every load, not just first download.

### D7 (VAL-F7) — Uncaught exceptions in the fetch loop crash the entire run (no partial-failure isolation)
- **Location:** `fetchers/fdc_fetcher.py:291` (`int(Retry-After)` → `ValueError`); fetch loop has no `try/except`.
- **Severity:** High · **Priority:** P1
- **Impact:** One bad fetcher/header crashes the whole pipeline (the documented intent is per-source isolation).
- **Fix:** Wrap each fetcher call; parse `Retry-After` defensively (fall back to default; handle HTTP-date). Converts total outages into isolated, auditable per-source failures.

### D8 (VAL-F8) — Failed git provenance commit is silently swallowed after the live DB is already swapped
- **Location:** `pipeline/git_manager.py` (`commit_validation_run` returns `None`; `GitError` defined `:22` never raised); `orchestrator.py` (`atomic_swap` step 6 precedes `commit_validation_run` step 7).
- **Severity:** High · **Priority:** P1
- **Impact:** The live diet DB can change with no git provenance while the pipeline reports `live_db_modified=True` as success — an unaudited, uncommitted mutation of safety-critical data.
- **Fix:** Commit before/atomically-with the swap, or treat a failed commit as a hard error triggering rollback from the just-made backup; actually `raise GitError` instead of returning `None`.

## D-MEDIUM

### D9 (VAL-F9) — `atomic_swap` uses `os.replace` from `/tmp` → cross-device (`EXDEV`) failure risk, no fallback
- **Location:** `pipeline/staging.py:180–200` (`os.replace` at `:199`); candidate created in `tempfile.TemporaryDirectory` (`:55`).
- **Severity:** Medium · **Priority:** P2
- **Impact:** On common Linux layouts (tmpfs `/tmp` vs `data/`) the swap raises `EXDEV` mid-apply, leaving the run half-applied.
- **Fix:** Create the staging temp dir on the same filesystem (`tempfile.mkdtemp(dir=live_path.parent)`), or catch `EXDEV` and fall back to write-temp-in-target-dir + `os.replace`.

### D10 (VAL-F10) — `CachedFetcher` computes a staleness flag but never propagates it (broken promise)
- **Location:** `fetchers/cached_fetcher.py:178,191–196,219–225`; `fetchers/base.py:31–44`.
- **Severity:** Medium · **Priority:** P2
- **Evidence:** `any_stale` computed and discarded; `FetchResult` (base.py) has **no metadata field at all**.
- **Impact:** Stale literature values are served indistinguishably from fresh ones.
- **Fix:** Add `metadata: dict[str, Any]` (or `is_stale: bool`) to `FetchResult` and populate it.

### D11 (VAL-F11) — Backups: second-resolution timestamp collision + never verified before swap
- **Location:** `pipeline/backup_manager.py:52,59–60` (collision); `:105` (`verify_backup` defined, never called).
- **Severity:** Medium · **Priority:** P2
- **Fix:** Use ms/µs timestamps; call `verify_backup` on the fresh backup before `atomic_swap`, aborting on failure.

### D12 (VAL-F12) — `int(Retry-After)` and a 429 retry that contradicts the "no retry" rule
- **Location:** `fetchers/fdc_fetcher.py` (Retry-After handling).
- **Severity:** Medium · **Priority:** P2
- **Fix:** Reconcile the retry policy with the documented "no retry" rule; parse defensively.

### D13 (VAL-F13) — No `User-Agent` on any outbound HTTP (FDC + CoFID)
- **Severity:** Medium · **Priority:** P2
- **Fix:** Set a descriptive `User-Agent` (some APIs throttle/blank anonymous clients).

### D14 (VAL-F14) — Open/Closed + DIP violations: `isinstance` routing and concrete-fetcher coupling
- **Severity:** Medium · **Priority:** P2
- **Fix:** Route via a registry/factory keyed by source type; depend on the `BaseFetcher` abstraction. A single `Session` also centralizes headers/retries for D2/D7/D12.

### D15 (VAL-F15) — Encapsulation breach: orchestrator imports deviation's private helpers
- **Location:** `pipeline/orchestrator.py:708`.
- **Severity:** Medium · **Priority:** P2
- **Fix:** Promote the needed helpers to a public API.

### D16 (VAL-F16) — `LocalFdcFetcher` breaks parent invariants (Liskov) with `/dev/null` and `None`
- **Location:** `fetchers/local_fdc_fetcher.py` (`/dev/null`, `None` rate_limiter, `type:ignore`).
- **Severity:** Medium · **Priority:** P2
- **Fix:** Honor the parent contract (real rate limiter, valid paths) or refactor the interface.

### D17 (VAL-F17) — Registry schema validation silently skipped when `jsonschema` is absent
- **Severity:** Medium · **Priority:** P2
- **Fix:** Make `jsonschema` a hard dependency for validation runs; fail loudly if absent.

### D18 (VAL-F18) — Type-safety holes despite mypy-strict policy
- **Severity:** Medium · **Priority:** P2
- **Evidence:** `type:ignore` / `Any` leaks.
- **Fix:** Remove `type:ignore`; tighten `Any`.

## D-LOW

### D19 (VAL-F19) — `check_working_tree_clean` matches allowed files by basename, not path
- **Severity:** Low · **Priority:** P3 · **Fix:** Match by full path.

### D20 (VAL-F20) — `git diff --cached --quiet` lacks the timeout/exception guard the other git calls have
- **Severity:** Low · **Priority:** P3 · **Fix:** Add the same timeout/exception guard.

### D21 (VAL-F21) — CoFID download failure degrades to silent empty dataset; trust-on-first-use checksum
- **Severity:** Low · **Priority:** P3 · **Fix:** Fail loudly on download error; pin checksum out-of-band.

### D22 (VAL-F22) — Dead/overlapping code & over-engineering signals
- **Severity:** Low · **Priority:** P3 · **Evidence:** `GitError` (never raised), `verify_backup` (never called), unused `FDC_RATE_LIMIT_DELAY_S`. **Fix:** Remove or wire in.

**Validation strengths:** list-form `subprocess` with timeouts (**no `shell=True` / no command injection**); `pydantic` config models; a `BaseFetcher` interface; token-bucket rate limiting; CoFID checksum *intent*; correct **404 → MISSING** handling.

---

# SUBSYSTEM E — CROSS-CUTTING ARCHITECTURE, CLI, TYPES, TESTS, CI
**Scope:** `cli.py`, `type_definitions.py`, `mapa.py`, `doc_introspector.py`, `tests/`, `.github/workflows/ci.yml`, packaging, and reconciliation of the team's self-review docs. Read-only. **~26 findings.**

**Executive snapshot:** The LP cascade core is sounder than the docs suggest (fails closed; tie-break and Level-3 lexicographic bugs genuinely fixed; tests run real JSONs through real CBC). But three things are seriously wrong: **(1)** the user-facing per-nutrient output is a hardcoded placeholder reporting *every* nutrient `adequate` with null percentages — a safety-relevant correctness bug that is also completely untested; **(2)** the project carries **three mutually inconsistent bug-numbering schemes** so the team cannot reliably triage "R-04"; **(3)** 42% of the package is doc-generation machinery that must be hand-synced to code. CI enforces pytest+mypy but **not** the schema/MAPA gates the README advertises.

## E-CRITICAL

### E1 (F-CONTRACT-1) — Output-contract `nutrient_results` are hardcoded placeholders
- **Location:** `solver.py:1203–1227` (`build_output_contract`).
- **Severity:** Critical · **Priority:** P0
- **Evidence:** `"target_max": None, "pct_of_min": None, "pct_of_sul": None, "status": "adequate"` for **every** nutrient, with comment `# This is simplified - real implementation computes min/max from scenarios/matrix` (`solver.py:1213–1224`). *(Same defect as A3/C1 — the canonical Critical.)*

### E2 (F-TEST-2) — No test verifies `nutrient_results` correctness (the placeholder bug is untested)
- **Location:** `tests/test_cascade_integration.py:193` (only `assert len(...nutrient_results...) >= 41`).
- **Severity:** Critical · **Priority:** P0 (with E1)
- **Evidence:** No assertion anywhere that a deficient nutrient reports `status=="deficient"` or that `pct_of_min` is non-null. The suite passes with E1's hardcoded `"adequate"`/nulls.
- **Impact:** The single most safety-relevant output has **zero correctness coverage** — the most important untested behavior in the repo.
- **Fix:** Add a test feeding a selection known to be deficient in a specific nutrient and assert that nutrient's `status`/`pct_of_min` reflect the deficit; pair with the E1 fix.

## E-HIGH

### E3 (F-CONTRACT-2) — LP status → feeding label mapping is sound but masks modeling errors
- **Location:** `solver.py:660–662`, `:1171–1177`; `feeding_map` defaults `DO_NOT_FEED`; `validate_output` asserts the mapping.
- **Severity:** High · **Priority:** P1
- **Evidence:** All non-`Optimal` PuLP statuses (Unbounded/Undefined/timeout) collapse to `infeasible → DO_NOT_FEED` with `allocations=None`.
- **Impact:** **Fails closed correctly** (safe), but masks Unbounded modeling bugs and loses MILP incumbents. *(Same as A8.)*
- **Fix:** Distinct status taxonomy (all → `DO_NOT_FEED` but diagnosable).

### E4 (F-CONTRACT-3) — `--runtime` input is an unvalidated ad-hoc dict
- **Location:** `cli.py` (`AnimalInput(**dict)` from `runtime_request.json`).
- **Severity:** High · **Priority:** P1
- **Impact:** A malformed `runtime_request.json` can `TypeError`; no schema/validation at the boundary.
- **Fix:** Validate the runtime request against a schema/TypedDict before constructing `AnimalInput`.

### E5 (F-TEST-1) — `test_solver_timeout_returns_result` is a stub that never runs the solver
- **Location:** `tests/test_cascade_integration.py:332–336`.
- **Severity:** High · **Priority:** P1
- **Evidence:** Body is only `audit_test_result("test_solver_timeout_returns_result", {"timeout_handled": True}, "timeout_handled")` with comment *"Hard to test without mocking; document expected behavior."* It passes unconditionally.
- **Impact:** Timeout handling (a real fail-closed path) is **untested** despite README's "real PuLP, real CBC solver" claim (README:114).
- **Fix:** Set `solver_params["time_limit"]` to a tiny value (or monkeypatch CBC `maxSeconds`) and assert a result object is still returned with a safe status.

### E6 (F-CII-1) — CI does not run the schema/MAPA gates the README advertises
- **Location:** `.github/workflows/ci.yml`.
- **Severity:** High · **Priority:** P1
- **Evidence:** CI runs pytest+mypy (genuinely gating) but **no `--validate-db` schema gate**, **no `--gate-mapa`**, a **single Python 3.12** (no matrix vs `requires-python>=3.10`), and a dead `types-pydantic` dep.
- **Impact:** Schema drift (C1/C4) and doc drift ship uncaught; 3.10/3.11 compatibility untested.
- **Fix:** Add `--validate-db` and `--gate-mapa` as required gates; add a 3.10–3.12 matrix; remove the dead dep.

### E7 (F-DOC-1) — Three mutually inconsistent bug-numbering schemes; same ID "R-04" means different bugs
- **Location:** `docs/archive/REVIEW.md` (`R-01..R-09`) vs README/amendment (`R-01/R1..R-06/R7`) vs `F1..F6/D1..D2`.
- **Severity:** High · **Priority:** P1
- **Impact:** The team cannot reliably triage "R-04" — it denotes different defects in different docs.
- **Fix:** One canonical issue tracker / numbering; cross-map the legacy IDs once.

## E-MEDIUM

### E8 (F-CONTRACT-4) — Solver output written with a leaked file handle
- **Location:** `cli.py:253` (`json.dump` without `with`/close).
- **Severity:** Medium · **Priority:** P2 · **Fix:** Use a `with open(...)` context manager.

### E9 (F-ARCH-1) — `core.py` is a grab-bag mixing infra, domain, and doc concerns
- **Severity:** Medium · **Priority:** P2 · **Fix:** Split into `data_loading`, `domain`, and move markdown/doc-index concerns out.

### E10 (F-ARCH-2) — Type model split across two modules "to avoid circular imports"
- **Location:** `type_definitions.py` + `core.py`.
- **Severity:** Medium · **Priority:** P2 · **Impact:** A layering smell masking a dependency-cycle problem. **Fix:** Resolve the cycle (dependency inversion) and unify the type model.

### E11 (F-ARCH-3) — 42% of the package is doc-generation machinery (over-engineered / maintenance hazard)
- **Location:** `mapa.py` (1391) + `doc_introspector.py` (1105) = 2496/5881 LOC.
- **Severity:** Medium · **Priority:** P2
- **Evidence:** Docstrings reference the defunct `build_pipeline.py` monolith, though `ImplIntrospector` is correctly fed live `src/gsd` at `mapa.py:863`. The team's own self-review found MAPA falsely claiming items "NOT IMPLEMENTED".
- **Fix:** Reduce/curb doc-gen; generate docs from the same source of truth the code uses; delete stale monolith references.

### E12 (F-ARCH-4) — `solver.py` is a 1661-LOC god module; `build_lp_problem` alone is 474 lines
- **Severity:** Medium · **Priority:** P2 · **Fix:** Decompose into variable-build / constraint-build / objective-build / output-contract modules.

### E13 (F-TYPE-1) — `TypedDict(total=False)` everywhere = no runtime enforcement
- **Location:** `type_definitions.py`.
- **Severity:** Medium · **Priority:** P2 · **Fix:** Use frozen dataclasses / pydantic at boundaries for runtime validation.

### E14 (F-TYPE-2) — Duplicate, weakly-typed type-guard helpers
- **Severity:** Medium · **Priority:** P2 · **Fix:** Consolidate; type precisely.

### E15 (F-CLI-1) — No `argparse`; hand-rolled `sys.argv` parsing
- **Location:** `cli.py`.
- **Severity:** Medium · **Priority:** P2 · **Fix:** Use `argparse`/`click` with proper exit codes.

### E16 (F-TEST-3) — Tautological assertions that pass even if the LP is wrong
- **Location:** `tests/test_cascade_integration.py:191–192, 357–358`.
- **Severity:** Medium · **Priority:** P2
- **Evidence:** `assert result["solver_status"] in ("optimal","suboptimal","unsafe_diagnostic","structurally_infeasible")` — true by construction; `test_structurally_infeasible…` accepts *either* `unsafe_diagnostic` *or* `structurally_infeasible`, so it cannot distinguish the two code paths.
- **Fix:** Assert the *specific* expected status for a deterministic (seeded) selection.

### E17 (F-TEST-4) — `audit_test_result` logs pass/fail but never asserts; mutates a committed file
- **Location:** `tests/test_cascade_integration.py:62–77`.
- **Severity:** Medium · **Priority:** P2
- **Evidence:** Computes `passed = ... == expected` then only `f.write(...)` to `tests/test_audit_log.md`; returns `passed` but callers ignore it; tests append to a committed `.md` on every run.
- **Impact:** "AAA+A audit" is theater — the verdict is written to disk, not enforced; test runs dirty the working tree (non-idempotent).
- **Fix:** Either `assert passed` or delete the helper; use `tmp_path` if a log is wanted.

### E18 (F-TEST-5) — Lexicographic *dominance* is not actually verified
- **Location:** `tests/test_cascade_integration.py:231–243`.
- **Severity:** Medium · **Priority:** P2
- **Evidence:** `test_level3_lexicographic_order_validated` inspects `solver_metadata.lexicographic_stages_used` (stage *names/order*), not that each stage's optimum is preserved (non-degrading) by later stages.
- **Impact:** The R-02 guarantee rests on `fix_optimum` config but has no test asserting objective values are actually lexicographically ordered.
- **Fix:** Capture per-stage objective bounds and assert later stages do not worsen earlier fixed objectives beyond tolerance.

### E19 (Packaging) — `requirements.txt` missing `requests`; `jsonschema` unpinned; no lockfile
- **Severity:** Medium · **Priority:** P2
- **Evidence:** `requests` is a pyproject dep used by fetchers but absent from `requirements.txt`; `pulp==3.3.2` pinned while `jsonschema`/`requests` are not; no lockfile.
- **Fix:** Sync `requirements.txt`; pin all runtime deps; add a lockfile.

## E-LOW

### E20 (F-CLI-2) — Stale "build_pipeline.py" branding in the `gsd` console script
- **Location:** `cli.py` (`print("Usage: build_pipeline.py …")`); entry point is `gsd = gsd.cli:main`.
- **Severity:** Low · **Priority:** P3 · **Fix:** Replace with `gsd`.

### E21 (F-CLI-3) — `--build-recipes` exits 0 while unimplemented; global mutable flag
- **Location:** `cli.py:30,44,264–266`.
- **Severity:** Low · **Priority:** P3
- **Evidence:** `print("Build-recipes mode: not implemented…"); sys.exit(0)`; `global _NO_LIVE_EVIDENCE`.
- **Fix:** Exit non-zero (or a documented reserved code) for unimplemented modes; pass the flag as a parameter.

### E22 (Doc-drift) — README "11 JSON files" / "208 tests / 15 files" slightly off
- **Severity:** Low · **Priority:** P3
- **Evidence:** "11 JSON" is true only for the runtime subset (`core.py:54 JSON_FILES = 11`) while `data/` holds 26+; ~207 tests / 12 files collected, not 208/15.
- **Fix:** Clarify runtime-subset vs total; refresh counts.

### E23 (Debug) — `[DEBUG]` prints left in solver (known issue R-06, still present)
- **Location:** `solver.py:301,323`.
- **Severity:** Low · **Priority:** P3 · **Fix:** Remove or gate behind a verbose flag.

**Test strengths (F-TEST-6):** genuine correctness tests exist and use real data — `test_level1_optimal_synthetic` (`test_cascade_integration.py:573+`) hand-builds 2-ingredient coefficients to *prove* the L1 path satisfies all hard constraints independent of DB; `test_tie_break_permutation.py` (permutation-invariance), `test_dimensional_pipeline.py` (102 asserts), `test_category_goals_fix.py` (sum-to-100); tests call `load_all_jsons()`/`build_matrix`/`solve_cascade` on **real JSONs**, not mocks (only the validation-phase tests mock network fetchers). The foundation is credible; the gaps (E2/E5/E16/E18) are fixable on top of it.

---

## 7. Master priority table (deduplicated)

| ID | Sev | Subsystem | One-line summary | Pri |
|----|-----|-----------|------------------|-----|
| A3/E1/E2 | Critical | Solver/contract/tests | `nutrient_results` hardcoded `"adequate"`, null gaps, **untested** | **P0** |
| A2/A14 | Critical | LP | Antagonism constraints soft at all levels vs `HARD_FAIL` | **P0** |
| B2 | Critical | Nutrition/LP | No absolute calcium maximum (DOD safeguard) | **P0** |
| B1/B11 | Critical | Nutrition | Flat `k=1.2×RER` growth energy; labels inverted | **P0** |
| C1 | Critical | Data/CI | DB fails own schema (21 errors); no CI gate | **P0** |
| C2/C3/C5/C7 | Critical | Data/Schema | No canonical nutrient namespace; typo-blind; duplicate conflicting units (Mg 20.5 vs 5.0) | **P0** |
| C4 | Critical | Schema | `lp_parameters.schema.json` orphaned; config unschema'd | **P0** |
| D1 | Critical | Validation | `_shared.py` missing → package cannot import | **P0** |
| A5 | Critical→High | LP/config | `objective_weights.json` unused by the LP | **P0** |
| A1 | Critical | LP | Lexicographic stage order inverted (L1/L2) | **P0** |
| A4 | High | LP | Antagonism penalty unit mismatch (~500×) | P1 |
| A6 | High | Solver | Recommendation config-driven, ignores violations | P1 |
| A7 | High | LP | Floor-relaxation fallback unimplemented | P1 |
| A8/E3 | High | Solver | Non-Optimal statuses all → "infeasible" (fail-closed but masks bugs) | P1 |
| B3 | High | Nutrition | No phosphorus maximum | P1 |
| B4 | High | Nutrition | Hardcoded 72% moisture/1% ash denominator | P1 |
| B5 | High | Nutrition | No age tapering | P1 |
| B6–B10 | High | Nutrition | Cu/Fe/I/Mn/Zn SULs — verify vs NRC/AAFCO (Cu too permissive, Mn possibly too tight) | P1 |
| C6–C13 | High | Data/Schema | No numeric bounds; unit not bound to key; `additionalProperties` open ×7; BOM ×2; FDC-id divergence; no min≤max; identity inconsistency; 3-state collapse | P1 |
| D2 | High | Validation | FDC API key in URL + leaked to logs | P1 |
| D3 | High | Validation | Empty-200 accepted as 0-nutrient validation | P1 |
| D4 | High | Validation | Audit trail not append-only/tamper-evident | P1 |
| D5 | High | Validation | Circuit-breaker gate defeatable | P1 |
| D6 | High | Validation | CoFID checksum bypassed when cached | P1 |
| D7 | High | Validation | Fetch loop no try/except; `int(Retry-After)` crashes run | P1 |
| D8 | High | Validation | Commit swallows failures after DB swap | P1 |
| E4 | High | CLI | `--runtime` input unvalidated | P1 |
| E5 | High | Tests | Timeout test is a stub that always passes | P1 |
| E6 | High | CI | No schema/MAPA gate; single Python; dead dep | P1 |
| E7 | High | Docs | Three inconsistent bug-numbering schemes | P1 |
| A9–A20 | Medium | LP | Big-M fallback; tie-break degenerate; bio assertion; dead bio factors; no re-validation; dup-var latent; caloric constant; fix-optimum tolerance; coefficient range; dead helper; relaxation flag | P2/P3 |
| B12–B18 | Medium | Nutrition | B12 unit/bound; vit-A bound; bone Ca:P; taurine absent; vit-D min; SUL mislabels; nutrient-count drift | P2/P3 |
| C14–C18 | Medium | Schema | Draft-07 `definitions`; nutrient_safety schema gaps; mojibake ×17; count contradiction; registry schema open | P2 |
| D9–D18 | Medium | Validation | EXDEV swap; stale flag dropped; backup collision/unverified; Retry-After; no User-Agent; OCP/DIP; encapsulation; Liskov; silent schema-skip; type holes | P2 |
| E8–E19 | Medium | Arch/CLI/tests | Leaked handle; core grab-bag; type split; 42% doc-gen; god module; TypedDict no enforcement; dup guards; no argparse; tautological tests; audit theater; lexicographic untested; packaging | P2 |
| C19–C22, D19–D22, E20–E23 | Low | All | note length; AA double-count; bio unvalidated; hardcoded counts; basename allowlist; git-diff guard; CoFID silent-empty; dead code; CLI branding/exit; doc-drift; debug prints | P3 |

---

## 8. Known-issue reconciliation (team's self-review vs code)

The project has an unusually rich self-review history, but uses **three inconsistent numbering schemes** (so `R-04` means different things in different docs — itself E7). Verified against the code:

| Admitted issue | Status | Evidence |
|---|---|---|
| R-02 (Level-3 SUL/DER not fixed) | **FIXED** | `fix_optimum=True` on L3 stages |
| R-03 (hash-based tie-break perturbation) | **FIXED** | hash removed (`solver.py:37–39`); flat `tie_weight×var` with tolerance guard |
| F1–F6 (amendment list) | **FIXED** | per cross-cutting grep |
| R-01 (antagonism slack soft) | **STILL PRESENT** | `solver.py:426–477` (= A2) |
| R-05 (`_MIN` → `adequacy_soft`) | **STILL PRESENT** | `solver.py:313–317` |
| R-06 (`[DEBUG]` prints) | **STILL PRESENT** | `solver.py:301,323` (= E23) |
| R-04 / R-09 (nutrient placeholder) | **STILL PRESENT** | `solver.py:1213–1227` (= A3/E1, Critical) |
| REVIEW R-01 "mitigation" | **OVERSTATED** | silent `.get` defaults remain (`solver.py:741–743,772`) |

**Takeaway:** the team's self-reviews focused heavily on *documentation/MAPA drift* and fixed several solver issues, but the **safety-critical defects (A2/A3/B1/B2) and the data-governance defects (C1–C5) were not surfaced by their own reviews** — those reviews checked whether docs matched code, not whether the LP/nutrition/data are scientifically and numerically correct.

---

## 9. Cross-cutting themes

1. **"Hard" things are soft, and "validated" things aren't.** Antagonism constraints declared hard are soft (A2); the DB declared schema-validated fails its schema (C1); the largest schema validates nothing (C4); the output declared per-nutrient adequacy is hardcoded (A3). The recurring failure mode is **a contract/assertion that exists in name but not in effect** — validators that check *structure* (keys present) rather than *semantics* (values true).
2. **No single source of truth for nutrients.** Three+ namespaces, no canonical registry, unit not bound to key (C2/C3/C7/B18). Root of the worst data-integrity risk (silent 1000× mineral error).
3. **Documentation outpaces reality.** 42% of code is doc-generation (E11); `objective_weights.json` describes an objective the solver doesn't use (A5); three bug-numbering schemes disagree (E7). MAPA has already shipped false "NOT IMPLEMENTED" claims.
4. **Fail-closed is good; fail-honest is missing.** The solver correctly maps bad statuses to `DO_NOT_FEED` (safe, E3), but mislabels *why* (A8) and fakes the per-nutrient detail (A3) — failures are safe but undiagnosable.
5. **Strong foundations, weak integration.** The LP math (fix-optimum lexicographic, tight Big-M, normalized deviations), the `NutrientEntry` schema, the real CBC tests, and the USDA-accurate ingredient values are all good — defects cluster at the **seams**: config↔solver wiring (A5), data↔schema conformance (C1/C4), solution↔output reporting (A3).

---

## 10. Examined & cleared (rigor — not defects)

To avoid false positives, the LP reviewer **empirically installed PuLP 3.3.2** and tested hypotheses. The following are **not** bugs:
- Level-2/3 **unbounded antagonism slack does NOT make the objective unbounded** (slack is bounded by the gram/constraint structure; in L2 it is simply free, not objective-unbounding).
- `prob.add_variable(...)` and `pulp.apis.coin_api.PULP_CBC_CMD.pulp_cbc_path` are **valid** PuLP 3.3.2 APIs (no AttributeError).
- Inclusion constraints on an **as-fed basis** and the nutrient-per-gram matrix compilation are **correct**.
- The **fix-optimum lexicographic mechanism itself is correct** (the bug is the *stage ordering* in A1, not the method).
- **RER `70·BW^0.75`**, **modified-Atwater 3.5/8.5/3.5**, **AAFCO per-1000-kcal minimums**, **Ca:P hard-bounded 1.1–1.3**, **vitamin-D SUL = AAFCO max**, **EPA+DHA minimum present**, and **DB ingredient values matching USDA/FDC almost exactly** are all **correct/strong**.
- Validation positives: **list-form `subprocess` with timeouts (no `shell=True`/injection)**, **pydantic** config models, a **`BaseFetcher` interface**, **token-bucket rate limiting**, CoFID checksum *intent*, and correct **404 → MISSING** handling.

---

## 11. Overall assessment

| Dimension | Rating | Rationale |
|---|---|---|
| **Maturity** | Pre-alpha / prototype | Core solver works; surrounded by fake outputs, soft "hard" constraints, an orphaned schema layer, and a non-importable validation package. |
| **Robustness** | Weak | Fail-closed status mapping is good, but fake `nutrient_results`, config-driven recommendations, no re-validation after rounding, and the D2–D8 cluster undermine it. |
| **Scientific validity** | Mixed | Static requirement layer credible (AAFCO mins, Ca:P, energy formulas, USDA-accurate data); **energy layer broken for growth (B1)** and **calcium ceiling missing (B2)** — the two most important large-breed-growth safeguards. |
| **Numerical robustness** | Moderate | Good tight Big-M and normalized deviations; undermined by the unit-mismatch penalty (A4), 10000 g Big-M fallback (A9), ~1e8 coefficient range (A18), and status conflation (A8). |
| **Data integrity** | Weak | DB fails its schema; no canonical namespace; conflicting units; orphaned schema; BOM/duplicate keys. |
| **Maintainability** | Weak | 1661-LOC god module; 42% doc-gen; three bug-numbering schemes; config that doesn't drive the code (A5). |
| **Production readiness** | **Not ready** | Must not be used to feed an animal until P0 items are fixed and an independent canine-nutrition sign-off is obtained. |

### Recommended remediation roadmap
1. **P0 — Safety & truthfulness (block everything else):** A3/E1+E2 (real `nutrient_results` + a test), A2/A14 (harden antagonisms or honest output), B2+B3 (Ca & P ceilings), B1+B5+B11 (real growth-energy schedule + relabel), A5 (one objective source of truth), A1 (fix stage order).
2. **P0 — Data governance:** C2/C3/C5/C7 (canonical nutrient registry + `propertyNames` enum + unit binding + dedupe conflicting units), C1 (repair DB + CI schema gate), C4 (fix `lp_parameters` schema), C13/C9 (3-state, BOM).
3. **P0 — Buildability:** D1 (restore `_shared.py` + import smoke test).
4. **P1 — Correctness hardening:** A4 (penalty normalization), A6 (violation-driven recommendation), A8/E3 (honest status taxonomy), B4 (real moisture/ash), B6–B10 (verify/tighten SULs), D2–D8 (validation security/robustness), E4/E5/E6 (validate runtime input, real timeout test, CI gates), E7 (one bug-numbering scheme).
5. **P2/P3 — Debt:** refactor `solver.py` (E12), consolidate the type model (E10/E13), cut/curb doc-gen (E11), fix CLI/packaging (E15/E19), reconcile bug numbering, remove dead code/debug prints (D22/E23).
6. **Gate:** independent review by a board-certified veterinary nutritionist (DACVN/ECVCN) of the requirement tables and energy model before any real-world use.

---

## Appendix A — Probe numbers & data-quality metrics
- 28 ingredients (6 categories); **9 distinct nutrient key-sets** (48-key union / 43-key intersection).
- DB → `db_ingredientes.schema.json`: **21 errors** (20 measured entries missing `unit`; 1 note 208 > maxLength 200).
- `lp_parameters_data.json` → `lp_parameters.schema.json`: **3 errors** (expects `breed`/`domains`; data has `NUTRIENT_REGISTRY`/`solve_cascade`).
- map ↔ DB nutrient-key overlap: **0**.
- 3-state usage: **48 measured=0**, **36 not_applicable**, **0 missing**.
- **17/28** mojibake `display_name`s; **2** BOM-corrupted files.
- FDC-id divergence: **18** DB refs not in registry; **12** registry ids never cited; `beef_muscle` `170196` vs registry `169483`.
- Real mixed-unit value conflict: `chicken_blood_raw` magnesium **20.5 vs 5.0 mg**.
- LOC: `src/gsd` 5,881; doc-gen (`mapa.py`+`doc_introspector.py`) 2,496 (**42%**); `solver.py` 1,661 (`build_lp_problem` 474).
- Solver config: `cbc_time_limit_seconds=30`, `gapRel=0.01`, `randomSeed=12345`, `tie_break_weight=5e-6`, `fix_optimum_tolerance_abs=0.01`.

## Appendix B — Source reviewer reports
- **A — LP/Solver:** `LP_ADVERSARIAL_REVIEW.md` (F1–F20 + verified non-issues).
- **B — Canine Nutrition:** NUTR-F1–F18 (vs AAFCO / NRC 2006 / USDA-FDC).
- **C — Data Modeling / JSON-Schema:** DATA-F1–F22 (5C/8H/5M/4L) + probe numbers.
- **D — Validation Pipeline:** VAL-F1–F22 (1C/7H/10M/4L) + strengths.
- **E — Cross-cutting Architecture:** F-CONTRACT-1..4, F-ARCH-1..4, F-TYPE-1..2, F-CLI-1..3, F-TEST-1..6, F-CII-1, F-DOC-1 + reconciliation table.
- All five reports consolidated from `Relatorio dos subagentes.txt` and parent re-verification.

*Method: 5 parallel adversarial reviewers + parent re-verification of all Critical claims via grep/sed/live JSON parse; LP reviewer empirically installed PuLP 3.3.2 to disprove false positives. ~77 unique findings (9 Critical, 27 High, 30 Medium, 11 Low) + 6 cleared hypotheses. Read-only; no files in the reviewed repository were modified.*
