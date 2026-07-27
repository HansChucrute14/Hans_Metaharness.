# EXECUTIVE REMEDIATION ROADMAP
### Verified Remediation Synthesis — `Hans-GSD-Raw-Calculator` (gsd-diet-calc v10.4.0)

**Synthesized from:** `SYSTEMATIC_REVIEW_REPORT.md` + `REMEDIATION_PLAN.md` + **live repo verification** (jsonschema 4.26.0, pydantic 2.13.4, executed against `github.com/HansChucrute14/Hans-GSD-Raw-Calculator`).
**Method:** Superpowers — TDD (Red/Green before steps) · Systematic root-cause tracing · DTSTTCPW · Evidence over claims · Radical YAGNI.
**Mode:** PLANNING ONLY — no repo file is modified by this document. Every task carries an executable Verification Manifest.
**Safety non-negotiable:** until Execution Phase 1 is complete AND a board-certified veterinary nutritionist signs off, **no diet from this system may be fed to an animal**; every `SAFE_TO_FEED` and every hardcoded `"adequate"` is treated as invalid.

> **Empirical Red baseline (captured by execution this session):** DB→schema **21 errors**; `lp_parameters_data`→its schema **3 errors**; `import gsd.validation.pipeline.orchestrator` → **`ModuleNotFoundError: …validators._shared`**; `solver.py:1225` hardcodes `"status":"adequate"`; `constraints.json` declares `HARD_FAIL_INFEASIBLE` **60×** while `solver.py:425` builds antagonisms "with slack"; **no** `calcium_g <=` ceiling; `objective_weights` referenced **0×** in `solver.py` (`CRITICALITY_WEIGHT` at `:17` is authoritative); `core.py:205–207` `SCENARIO_K_MAP` k=1.2 "recommended" / k=2.0 "discouraged"; `ci.yml` has **no** schema/MAPA gate.

---

## 0. Phase-1 Decision Gates (Grill-Me self-resolution — codebase-first)

Per the protocol, ambiguities were resolved from the codebase first; only genuine product/safety-policy forks are surfaced as gates, each with a recommended default (accept with "yes").

| Gate | Contradiction (report ↔ code) | Codebase evidence | Recommended default (lowest-complexity, safest) | Status |
|---|---|---|---|---|
| **G1 — Antagonisms: hard vs soft** | Config declares `HARD_FAIL_INFEASIBLE`; solver implements soft slack | `constraints.json` `HARD_FAIL_INFEASIBLE` ×60 vs `solver.py:425,434,467,472` slack | **HONOR HARD** in Level 1 (violation ⇒ infeasible ⇒ `DO_NOT_FEED`); honest penalized+exposed slack in L2/L3. Matches declared intent + safety. Tradeoff: some high-bone selections become infeasible (the tool got *safer*, not broken). | **PENDING — the single confirmation question** |
| **G2 — `objective_weights.json`: delete vs wire-in** | README/docs imply it governs the LP; solver never reads it | `grep -c objective_weights src/gsd/solver.py` = **0**; `CRITICALITY_WEIGHT` (`solver.py:17`) used at `:772,:791` | **DELETE** `objective_weights.json` + its loaders; document the real objective (YAGNI/DTSTTCPW — remove dead config). Choose wire-in only if the asymmetric/gonadal penalties are a proven product need. | **Resolved by default = DELETE** |
| **G3 — Numeric safety values** (Ca/P ceilings, growth-energy taper, Cu/Fe/I/Mn/Zn SULs) | Report flags values unverified | `toxicological_limits.json` (SULs), `constraints.json` (no Ca/P max), `core.py:205` (k=1.2) | Use commonly-cited defaults as **verify-first** placeholders (Ca ≈ 1.8% DM ≈ 4.5 g/1000 kcal AAFCO Large-Breed-Growth max; growth ≈ 2–3×RER tapering with age); **confirm against AAFCO/NRC/FEDIAF primary sources + vet review** before merge. | **Verify-first + vet gate** |

**Domain/terminology contradictions explicitly resolved:**
- *"Hard constraint"* in docs = config `solver_behavior`; in code = slack-penalized. Resolution: G1 (make code honor the config term, or relabel config — recommended: honor hard).
- *"Validated"* (README badge) = false; DB fails schema (21 errors). Resolution: Task B6 makes the badge truthful + CI-gated.
- *"Adequate"* (output) = hardcoded placeholder, not computed. Resolution: Task B1.
- *"Recommended"* growth scenario = the *under-feeding* one (k=1.2). Resolution: Task B4 relabels + fixes the taper.
- *Nutrient min/max* are fragmented: **mins** in `scenarios.json` `targets`, **maxs (SULs)** in `toxicological_limits.json`; `NUTRIENT_REGISTRY` carries only `{constraint_tier, clinical_criticality, display_name, unit, basis}` (no numeric min/max). Resolution: Task B7 makes the registry the single source (adds numeric min/max), which Task B1 consumes.

---

## 1. Scope Exclusions (YAGNI & DTSTTCPW Pruning)

Excluded/deferred/rejected after the pruning ladder (Criticality Gate → Root-Cause → DTSTTCPW → Speculative-Abstraction Tax):

- **A12 / C21 — bioavailability framework:** bio factors are keyed by generic tokens that never match real `ingredient_id`s, so `bio` is always 1.0 (dead). **DTSTTCPW = DELETE the dead machinery** (fold into Phase-3 cleanup) unless a real need is proven. Do **not** build a bioavailability abstraction.
- **E12 — decompose `solver.py` (1661-LOC god module):** speculative structural refactor; no current safety need. **PARK.** Revisit only if a Phase-1 fix cannot be made safely inside it.
- **E10 / E13 — consolidate the type model / move to pydantic-at-boundaries:** speculative; the "circular-import split" is a smell but not a defect. **PARK.**
- **E9 — split `core.py` grab-bag:** cosmetic reorganization. **PARK.**
- **E11 — 42% doc-generation (`mapa.py`/`doc_introspector.py`):** **curb** (freeze new features; delete stale `build_pipeline.py` refs in cleanup); do not rewrite. **Defer.**
- **C16 — mojibake `display_name`s (17/28):** display-only, does not affect LP coefficients. **Defer to backlog.**
- **C19 — `note` maxLength (1 entry):** cosmetic. **Defer** (fixed incidentally in B6 if trivial).
- **C20 — overlapping amino-acid keys:** documentation-only. **Defer to backlog.**
- **C22 — hardcoded nutrient/ingredient counts:** cosmetic; absorbed as a side-effect of the B7 registry (no standalone task).
- **E15 / E20 — argparse refactor / `build_pipeline.py` branding:** cosmetic/low-impact. **Defer to backlog.**
- **A9 (Big-M 10000 g fallback), A10 (tie-break degeneracy), A15 (latent dup-variable), A16 (caloric-density constant), A17 (fix-optimum tolerance), A18 (~1e8 coefficient range), A20 (relaxation boolean):** robustness/numerical hardening, not safety-critical; CBC handles current cases deterministically (seed=12345). **Defer to backlog** (monitor; A15 add a uniqueness assertion only if cheap).
- **A19 — unreferenced `weighted_normalized_deviation`:** dead code → **DELETE** in Phase-3 cleanup.
- **A7 — unimplemented floor-relaxation fallback + dead `validate_output` check #9:** **DTSTTCPW = DELETE** the dead doc/check unless the fallback is wanted (Phase-2 cleanup).
- **B12 (B12 unit/bound), B13 (vit-A plausibility bound), B14 (bone Ca:P 1.94), B15 (taurine), B16 (vit-D min representation), B17 (SUL mislabels):** low/medium data-correctness; **defer to Phase 2/backlog** (B17 folds into the B-SUL verification task).
- **C14 (Draft-07 `definitions`), C15 (nutrient_safety schema gaps), C17 (count contradiction), C18 (registry schema open):** schema hygiene; **fold into B7/B8** or defer; no standalone tasks.
- **D9 (EXDEV swap), D10 (stale flag dropped), D11 (backup collision/verify), D13 (no User-Agent), D14–D16 (OCP/DIP/Liskov refactors), D18 (type holes):** robustness/refactor; **defer to Phase 2/backlog** (D14–D16 are speculative refactors — **PARK**).
- **D19–D22 — low/dead code:** **DELETE** dead code (`GitError`-never-raised after D8, `verify_backup`-never-called, unused `FDC_RATE_LIMIT_DELAY_S`) in Phase-3 cleanup.
- **Verification-method speculation (from Document 2 list):** property-based, metamorphic, model-based, invariant-mining → **PARK** (no current oracle demands). Second-solver differential → **REJECT** (CBC not suspected; LP math verified sound). AST/CFG retrieval → **REJECT**. Autonomous triage/patch loops → **REJECT**. Continuous/nightly mutation testing & nightly CI → **REJECT** (allow **one manual mutation spot-check** only if a regression escapes).

**Kept** = the 9 Criticals + A1 (Phase 1), a focused root-cause Phase 2, and a regression-locking Phase 3. Everything else is excluded, deferred, or deleted.

---

## 2. Actionable Remediation Sequence

### Execution Phase 1 — Blockers & Stability
*Critical safety/truthfulness/buildability fixes. Order matters; respect `Blocked by`.*

#### Task B0: Fail-closed safety freeze (interim guard)
- **Target Finding:** A3, A2, B2, C1, D1 (interim containment for all).
- **Root Cause Analysis:** The system can currently emit `SAFE_TO_FEED`/`"adequate"` while multiple safety defects are live; there is no honest top-level "do not feed" gate.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** a probe over the current repo shows the guard's trip conditions are all true (placeholder `adequate`+null `pct`; antagonism slack present; no Ca max; DB fails schema; validation import fails).
  - **Green Condition:** on the current repo the guard forces `feeding_rec="DO_NOT_FEED"` and `feed_safe=false` with a `safety_warning`; after B1–B6 land, the corresponding trip conditions clear.
  - **Defense-in-Depth Guardrail:** the guard is independent of the fixes — it re-detects each original defect until the real fix lands; a test asserts it trips on the un-fixed repo.
- **Minimal Action Steps (DTSTTCPW):**
  1. Add `src/gsd/safety_guard.py` with pure checks: (a) any `nutrient_results[i].status=="adequate"` while `pct_of_min is None` ⇒ trip; (b) any antagonism slack > tol ⇒ trip; (c) no absolute Ca max in config ⇒ trip for growth scenarios; (d) DB fails schema ⇒ trip; (e) validation package import fails ⇒ mark unvalidated.
  2. Call it in `build_output_contract` (`solver.py:1157+`); on trip set `feeding_rec="DO_NOT_FEED"`, `feed_safe=false`, `safety_warning="PRE-ALPHA — DO NOT FEED…"`.
  3. Print the warning in `cli.py`.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_safety_guard.py -v`
  - **Assert Output:** `1 passed` — guard asserts `feeding_rec == "DO_NOT_FEED"` and `feed_safe is False` on the current repo.
- **Blocked by:** none. (Reversible: delete `safety_guard.py` + call sites.)

#### Task B1: Fix hardcoded `nutrient_results` placeholder
- **Target Finding:** A3 / E1 / E2.
- **Root Cause Analysis:** A placeholder ("simplified") shipped; `validate_output` checks key presence, not value truth; per-nutrient min/max are fragmented (mins in `scenarios.json`, maxs in `toxicological_limits.json`).
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -n '"status": "adequate"' src/gsd/solver.py` → `1225:            "status": "adequate",` and `grep -n 'This is simplified' src/gsd/solver.py` → `1213`. (Captured.)
  - **Green Condition:** a known-**deficient** fixture yields that nutrient's `status=="below_min"` and `pct_of_min<100`; a known-**excess** fixture yields `status=="above_sul"` and `pct_of_sul>100`; a nutrient absent from the solution yields `status=="unknown"` (never `0`/`"adequate"`).
  - **Defense-in-Depth Guardrail:** `validate_output` (`solver.py:1505–1512`) asserts `status` is consistent with `value` vs `(target_min,target_max)` within tolerance and that no `status=="adequate"` has null `pct_of_min` when a min exists; B0 independently re-detects the placeholder.
- **Minimal Action Steps (DTSTTCPW):**
  1. Add helper `nutrient_bounds_for(scenario_id, nid, data, der_info) -> (target_min, target_max)`: `target_min` from the active scenario's `targets` (`data["scenarios.json"]` matched by `animal.scenario_id`); `target_max` from `toxicological_limits.json` SUL (energy-normalized → per-day via `der_info`).
  2. In `build_output_contract`, replace the placeholder block (`solver.py:1213–1225`): compute `pct_of_min=value/target_min`, `pct_of_sul=value/target_max`, derive `status` from thresholds.
  3. Remove `value = targets_per_day.get(nid, 0)`; mark a nutrient missing from the solution as `"unknown"`.
  4. Strengthen `validate_output` per the guardrail.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_nutrient_results.py -v`
  - **Assert Output:** `3 passed` (deficient→below_min, excess→above_sul, missing→unknown) AND `grep -c '"status": "adequate"' src/gsd/solver.py` → `0`.
- **Blocked by:** B7 (clean min/max source) recommended but not hard (can read scenarios/toxicological_limits directly first).

#### Task B2: Make mineral antagonisms honest and safe
- **Target Finding:** A2 / A14 / A6.
- **Root Cause Analysis:** Config declares `solver_behavior:HARD_FAIL_INFEASIBLE` but the solver adds slack (unpenalized in L2/L3), and the feeding recommendation is derived from cascade level, not realized violations.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` → `60` while `grep -n 'with slack for goal programming' src/gsd/solver.py` → `425`. (Captured — config↔code contradiction.)
  - **Green Condition:** a fixture engineered to violate Zn:Cu returns Level-1 `DO_NOT_FEED`/infeasible (hard) and the output's `antagonism_slack` is non-zero; `feeding_rec != "SAFE_TO_FEED"` whenever any antagonism slack > tol.
  - **Defense-in-Depth Guardrail:** assertion that no Level-1 allocation violates any ratio bound; B0 trips on antagonism slack > tol.
- **Minimal Action Steps (DTSTTCPW):** *(assumes G1 = HARD)*
  1. In `build_lp_problem`, branch on `constraint.solver_behavior`: `HARD_FAIL_INFEASIBLE` ⇒ add the ratio bound with **no slack** at Level 1.
  2. For L2/L3 keep slack but **penalize** it (normalized — see Task C1) and **record** `antagonism_slack` in `raw_result`.
  3. In `build_output_contract`, derive `feeding_rec` from realized slack (any antagonism slack > tol ⇒ at most `FEED_WITH_CAUTION`; > hard tol ⇒ `DO_NOT_FEED`).
  4. Remove or truthfully implement the `HARD_FAIL_INFEASIBLE` flag (no lying config).
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_antagonism_honesty.py -v`
  - **Assert Output:** `1 passed` — violating fixture asserts `feeding_rec != "SAFE_TO_FEED"` and `antagonism_slack > 0`.
- **Blocked by:** **Gate G1** (hard vs soft; recommended HARD). Pairs with C1 (normalization).

#### Task B3: Add absolute calcium and phosphorus ceilings
- **Target Finding:** B2 / B3.
- **Root Cause Analysis:** Only a Ca *minimum* and *ratio* constraints exist; the absolute ceiling (the Large-Breed-Growth DOD safeguard) was omitted.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -nE 'calcium_g.*<=' data/constraints.json data/toxicological_limits.json` → only ratio bounds (`1.1*P ≤ Ca ≤ 1.3*P`, `12*Mg ≤ Ca ≤ 18*Mg`); **no** absolute `calcium_g <= X`. (Captured.)
  - **Green Condition:** a fixture with a correct Ca:P (1.2) but absolute Ca above the ceiling is rejected (infeasible/`above_sul`); ratio-only scaling cannot exceed the ceiling.
  - **Defense-in-Depth Guardrail:** assertion that delivered Ca (recomputed from grams × matrix) ≤ ceiling; B0 trips if no Ca max is present.
- **Minimal Action Steps (DTSTTCPW):**
  1. Add Ca and P as `HARD_INEQUALITY_MAX` entries in `toxicological_limits.json` on the `energy_normalized` basis (the solver already ingests SULs as hard maxes in Level 1) — Ca ≈ **4.5 g/1000 kcal** (AAFCO LBG ~1.8% DM), plus a defensible P max. **Values verify-first (G3).**
  2. Register both in `NUTRIENT_REGISTRY` (unit/basis bound).
  3. Confirm the solver applies them as hard maxes in Level 1 (no code change expected if SUL ingestion handles `HARD_INEQUALITY_MAX`).
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_ca_p_ceiling.py -v`
  - **Assert Output:** `1 passed` — over-Ca fixture asserts result is infeasible or `status=="above_sul"`.
- **Blocked by:** **G3** verify-first Ca/P values + **vet review** before merge.

#### Task B4: Fix growth-energy model and scenario labels
- **Target Finding:** B1 / B5 / B11.
- **Root Cause Analysis:** A flat `k=1.2×RER` is hardcoded for the "recommended" scenario; `scenarios.json` lacks a `k_multiplier_ref` (per `core.py:199–200`); labels are inverted (the growth-appropriate multiplier is "discouraged").
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -n SCENARIO_K_MAP src/gsd/core.py` → `205–207` with `SCN_B_SLOW_GROWTH→slow_growth_recommended` (k=1.2) and `SCN_A_RAPID_GROWTH→rapid_growth_discouraged` (k=2.0). (Captured.)
  - **Green Condition:** DER for a ~3-mo large-breed puppy ≈ NRC/FEDIAF requirement (±tol) and decreases monotonically with age; the "recommended" scenario is the growth-appropriate one.
  - **Defense-in-Depth Guardrail:** unit test asserting DER matches a published requirement table at ≥3 age bands; scenario labels no longer flag the growth-appropriate energy as "discouraged".
- **Minimal Action Steps (DTSTTCPW):**
  1. Add a `growth_energy_schedule` (age/weight-band → k) to data (the `core.py` comment already says it "must eventually live" there).
  2. Ensure `AnimalInput` carries age/weight-band; replace the `SCENARIO_K_MAP` lookup with schedule interpolation in `calculate_der_and_envelope` (`nutrition.py:173–178`).
  3. Relabel `scenarios.json` (`name`/`status`); separate *controlled growth* (mineral/amount management) from *energy restriction*.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_growth_energy.py -v`
  - **Assert Output:** `1 passed` — DER-vs-age table matches the cited reference within tolerance and is monotonic.
- **Blocked by:** **G3** verify-first NRC/FEDIAF taper + **vet review** before merge.

#### Task B5: Restore validation package importability
- **Target Finding:** D1.
- **Root Cause Analysis:** `validators/_shared.py` does not exist and `extract_db_value` is defined nowhere, while four modules import it — the package cannot be imported.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator"` → `ModuleNotFoundError: No module named 'gsd.validation.validators._shared'` (at `bone_validator.py:39`). **(Captured by execution.)**
  - **Green Condition:** the same command exits 0 and prints `OK`; `tests/test_imports.py` is green.
  - **Defense-in-Depth Guardrail:** a CI **import-smoke** step that imports every `gsd.*` module so a missing file can never merge again.
- **Minimal Action Steps (DTSTTCPW):**
  1. Create `src/gsd/validation/validators/_shared.py` implementing `extract_db_value(nutrient_id, db_ingredient)` — read the `NutrientEntry` `{value,unit,status}`, return the numeric value in the canonical unit, honoring the 3-state contract (`missing`/`not_applicable` → `None`, never `0`).
  2. Unit-test it for measured/missing/not_applicable + a unit conversion.
  3. Add `tests/test_imports.py` (`importlib.import_module` over all `gsd.*` modules) + a CI step.
- **Required Evidence Manifest:**
  - **Execute:** `PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator; print('OK')"`
  - **Assert Output:** `OK` (exit code 0).
- **Blocked by:** B7 (canonical units) for correct unit handling (recommended, not hard).

#### Task B6: Repair DB schema conformance + add CI schema gate
- **Target Finding:** C1 / C9 / C13.
- **Root Cause Analysis:** 21 schema errors shipped; no CI gate enforces conformance; the 3-state contract collapses (`missing` used 0×; 48 ambiguous `measured:0`).
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** jsonschema validation of `DB_ingredientes.json` → `ERROR COUNT: 21` (20× missing `unit`, 1× `status`). **(Captured by execution.)** `grep -nE 'validate-db|jsonschema|schema' .github/workflows/ci.yml` → none.
  - **Green Condition:** jsonschema validation → `ERROR COUNT: 0`; CI schema-gate is red on an injected broken record.
  - **Defense-in-Depth Guardrail:** a required CI `schema-gate` job; a negative test asserting a deliberately broken record fails.
- **Minimal Action Steps (DTSTTCPW):**
  1. Add `unit` to the 20 measured entries; trim the one over-long `note` (`pork_fat_raw/ara_arachidonic_acid_g`, 208>200).
  2. Strip the UTF-8 BOM from `nutrient_set_minimal.json` + `nutrient_safety.schema.json` (C9).
  3. Enforce the 3-state contract: require explicit `missing`/`not_applicable`; forbid ambiguous `measured:0` for safety nutrients.
  4. Add a CI `schema-gate` job running `python -m gsd.cli --validate-db` (or a small jsonschema script over all data↔schema pairs).
- **Required Evidence Manifest:**
  - **Execute:** `python - <<'PY' …jsonschema validate DB… PY` (the §-11 probe)
  - **Assert Output:** `ERROR COUNT: 0`.
- **Blocked by:** B7 (schema tightening) ideally sequenced first.

#### Task B7: Create canonical nutrient namespace + unit binding
- **Target Finding:** C2 / C3 / C5 / C7 / B18 / C6.
- **Root Cause Analysis:** Three naming schemes coexist; the schema matches by pattern+count (not an enumerated key set); unit is not bound to key; a real conflicting duplicate exists (`chicken_blood_raw` Mg 20.5 vs 5.0).
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** an adversarial typo'd nutrient key validates with **0 errors**; the 28 ingredients yield **9 distinct key-sets** (48-union/43-intersection); map↔DB nutrient-key overlap = **0**; `chicken_blood_raw` magnesium appears as both 20.5 and 5.0 mg.
  - **Green Condition:** the schema **rejects** (a) a typo'd key, (b) a wrong unit (`chloride_mg` with `unit:g`), (c) a duplicate nutrient with conflicting values; the repaired DB **passes**; the registry is the only place defining the 43 keys+units.
  - **Defense-in-Depth Guardrail:** a load-time assertion that every DB nutrient key ∈ registry and every measured entry's unit matches its key suffix; enforced by the B6 CI gate.
- **Minimal Action Steps (DTSTTCPW):**
  1. Promote `lp_parameters_data.json:NUTRIENT_REGISTRY` to the single canonical registry; add numeric `min`/`max` (mins from `scenarios.json` targets, maxs from `toxicological_limits.json`) — this also gives B1 a clean source.
  2. In `db_ingredientes.schema.json`: `propertyNames:{enum:[…exact 43 keys…]}` + `required` + `additionalProperties:false`; bind each `*_mg/*_ug/*_g/*_iu` key to its required `unit`.
  3. Dedupe DB entries; resolve `chicken_blood_raw` Mg to one FDC-sourced value (verify).
  4. Make the FDC/COFID maps reference registry IDs.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_namespace.py -v`
  - **Assert Output:** `4 passed` — 3 adversarial records rejected + repaired DB accepted.
- **Blocked by:** the `chicken_blood_raw` Mg source value (verify against FDC).

#### Task B8: Fix orphaned `lp_parameters` schema
- **Target Finding:** C4 / C11.
- **Root Cause Analysis:** The schema describes an obsolete shape (`breed`+`domains`); the data uses `NUTRIENT_REGISTRY/solve_cascade/solver_params/mineral_antagonisms`. It validates **zero** files.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** jsonschema validation of `lp_parameters_data.json` → `ERROR COUNT: 3` (`'breed' is a required property`, `'domains' is a required property`, `Additional properties are not allowed ('$schema','NUTRIENT_REGISTRY',…)`). **(Captured by execution.)**
  - **Green Condition:** the live `lp_parameters_data.json` validates with `0 errors`; a record with `min>max` fails.
  - **Defense-in-Depth Guardrail:** the B6 CI schema-gate covers this file; a `min≤max` schema invariant.
- **Minimal Action Steps (DTSTTCPW):**
  1. Rewrite `lp_parameters.schema.json` to match the real top-level keys (`NUTRIENT_REGISTRY`, `solve_cascade`, `solver_params`, `mineral_antagonisms`) — or split into `nutrient_registry.schema.json` + `solve_cascade.schema.json`.
  2. Add upper bounds + a `min≤max` invariant.
  3. Validate the live file in the CI gate.
- **Required Evidence Manifest:**
  - **Execute:** `python - <<'PY' …jsonschema validate lp_parameters_data… PY`
  - **Assert Output:** `ERROR COUNT: 0`.
- **Blocked by:** B7 (registry shape).

#### Task B9: Fix objective source of truth
- **Target Finding:** A5.
- **Root Cause Analysis:** The solver builds the objective from `CRITICALITY_WEIGHT` (`solver.py:17`, used `:772,:791`); `objective_weights.json` (priority tiers, asymmetric penalties, gonadal multipliers) is consumed only by doc generators.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -c objective_weights src/gsd/solver.py` → `0`; `grep -n CRITICALITY_WEIGHT src/gsd/solver.py` → `17`, `772`, `791`. (Captured.)
  - **Green Condition:** exactly one authoritative objective source; a test asserts the LP objective's per-nutrient coefficients equal that source.
  - **Defense-in-Depth Guardrail:** the coefficient-match test fails if code and config ever diverge.
- **Minimal Action Steps (DTSTTCPW):** *(Gate G2 = DELETE)*
  1. Delete `data/objective_weights.json` and its loaders (`core.py:60/419`, `mapa.py:530/533/1270`, `doc_introspector.py:703`).
  2. Document the real objective (`CRITICALITY_WEIGHT` map + stage structure).
  3. Add `tests/test_objective_source.py` asserting objective coefficients == `CRITICALITY_WEIGHT`.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_objective_source.py -v && grep -rc objective_weights src/ data/`
  - **Assert Output:** `1 passed` and `0` remaining references.
- **Blocked by:** **Gate G2** (resolved by default = DELETE; choose wire-in only with proven need).

#### Task B10: Fix lexicographic stage order
- **Target Finding:** A1.
- **Root Cause Analysis:** The non-fixed (tie-break/category) stage sits in the **middle**; the loop fixes only `if fix_opt` (`solver.py:670–680`) and reads the allocation after the last (fixed DER) stage (`:687`) — so category goals and the tie-break have **zero** effect on Level 1/2 allocations.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** a fixture where category goals should shift the allocation currently shows **no** shift (final grams are independent of category preference); `template_adherence` is computed from grams never optimized for category.
  - **Green Condition:** category preference changes the chosen optimum among ties; each later stage's fixed objective is not worsened beyond `fix_optimum_tolerance_abs` (0.01) by subsequent stages.
  - **Defense-in-Depth Guardrail:** a build-time assertion that exactly one stage is non-fixed and it is last (drive order from an explicit `priority` field).
- **Minimal Action Steps (DTSTTCPW):**
  1. Reorder `solve_cascade` `objective_stages` so the free tie-break/category stage is **last** (move `minimize_absolute_der_deviation` before category, or fix category and make category the final free stage).
  2. Add an explicit `priority` per stage + the build-time assertion.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_lexicographic_order.py -v`
  - **Assert Output:** `2 passed` — category effect non-zero AND per-stage objectives non-degrading within tolerance.
- **Blocked by:** none.

---

### Execution Phase 2 — Core Remediation & Defense-in-Depth
*Root-cause architectural fixes + structural guardrails. Each task: Target · Root cause · Red · Green · Guardrail · Evidence.*

#### Task C1: Normalize antagonism penalty units
- **Target Finding:** A4. **Root Cause:** Level-1 objective adds raw g/mg antagonism slack × 5000–7000 alongside dimensionless normalized terms (`solver.py:813–822`). **Red:** a 1 g Ca:P violation costs ~7000 vs ≤10 for a missed nutrient goal. **Green:** all Level-1 terms dimensionless and same order of magnitude. **Guardrail:** objective-coefficient range assertion (< ~1e4). **Steps:** normalize antagonism slack (`slack/target_ratio`) before weighting.
  - **Execute:** `pytest tests/test_objective_scaling.py -v` · **Assert:** `1 passed`. **Blocked by:** B2.

#### Task C2: Honest solver-status taxonomy (fail-closed but diagnosable)
- **Target Finding:** A8 / E3. **Root Cause:** `solver.py:660–662` collapses every non-`Optimal` status to `"infeasible"`. **Red:** a forced timeout/unbounded returns `"infeasible"`. **Green:** distinct `unbounded/timeout/numerical/infeasible`, all → `DO_NOT_FEED`; a `Not Solved` incumbent surfaced when available. **Guardrail:** `validate_output` asserts the mapping; B0 backstop. **Steps:** branch on `prob.status`.
  - **Execute:** `pytest tests/test_status_taxonomy.py -v` · **Assert:** `1 passed` (forced timeout → `timeout`+`DO_NOT_FEED`). **Blocked by:** none.

#### Task C3: Real dry-matter denominator (replace hardcoded 72% moisture / 1% ash)
- **Target Finding:** B4 (nutrition). **Root Cause:** `nutrition.py` uses a fabricated DM fraction because the DB stores no moisture/ash. **Red:** a high-DM ingredient (bone meal) and a wet one (egg) get the same DM fraction. **Green:** density computed from per-ingredient measured moisture/ash. **Guardrail:** assertion that DM fractions differ across ingredients with different moisture. **Steps:** store measured moisture/ash per ingredient; compute DM from data.
  - **Execute:** `pytest tests/test_dry_matter.py -v` · **Assert:** `1 passed`. **Blocked by:** moisture/ash data added to DB.

#### Task C4: Verify & correct SULs (Cu/Fe/I/Mn/Zn)
- **Target Finding:** B6–B10 (+B17 labels). **Root Cause:** SULs set "pragmatically"; some permissive (Cu 100 mg/1000 kcal ≈ 400 mg/kg DM), one possibly too tight (Mn 15 → infeasibility risk). **Red:** Cu ceiling exceeds commonly-cited NRC safe upper; Mn-rich fixture (mussel/bone) risks infeasibility. **Green:** each SUL matches a cited AAFCO/NRC/FEDIAF source; Mn-rich fixture stays feasible. **Guardrail:** every SUL entry carries a `source_ref` resolving to a primary citation. **Steps:** verify each value (G3); correct; fix mislabels.
  - **Execute:** `pytest tests/test_sul.py -v` · **Assert:** `1 passed` + all SUL `source_ref`s resolve. **Blocked by:** **G3** verify-first + vet review.

#### Task C5: Schema hardening (bounds, unit-key binding, additionalProperties, integrity, 3-state)
- **Target Finding:** C6 / C8 / C10 / C11 / C12 / C13. **Root Cause:** no numeric bounds; unit not bound to key; `additionalProperties:false` missing on 7 object types; DB↔registry FDC-id divergence (18/12; `beef_muscle` 170196 vs 169483); identity rules inconsistent; 3-state collapses. **Red:** negative & `1e9` pass; `chloride_mg`+`unit:g` passes; typo'd key passes; `beef_muscle` contradiction. **Green:** all rejected; referential integrity holds; `min≤max` enforced; safety-nutrient `measured:0` flagged. **Guardrail:** CI schema-gate (B6) + load-time integrity assertions. **Steps:** add numeric `minimum/maximum`; bind unit to suffix; close the 7 object types; enforce `source_ref ∈ registry` + fix `beef_muscle`; unify id pattern/FDC-id type; require explicit `missing`.
  - **Execute:** `pytest tests/test_schema_hardening.py -v` · **Assert:** `6 passed`. **Blocked by:** B7, B8.

#### Task C6: Validation security — FDC API key handling
- **Target Finding:** D2. **Root Cause:** key passed as URL query param (`fdc_fetcher.py:260,367`) and echoed via `str(exc)` (`:272`) into persisted artifacts. **Red:** `grep -ri api_key` finds the key in a persisted result/URL. **Green:** key sent in a header; no `api_key` in any persisted artifact; **key rotated**. **Guardrail:** a test/grep asserting no `api_key` substring in `data/`/logs. **Steps:** header auth; scrub exception strings; rotate key.
  - **Execute:** `grep -ri 'api_key=' data/ || echo CLEAN` · **Assert:** `CLEAN`. **Blocked by:** none (security — do early).

#### Task C7: Reject empty-200 FDC responses as zero-nutrient validation
- **Target Finding:** D3. **Root Cause:** `fdc_validator.py:76,90,143` accepts an empty nutrient list as a clean validation. **Red:** the `pork_rib_100088_empty.json` fixture validates as all-zeros. **Green:** empty nutrient list ⇒ `MISSING`/error. **Guardrail:** regression test on the empty fixture. **Steps:** treat empty list as `MISSING`.
  - **Execute:** `pytest tests/test_fdc_empty.py -v` · **Assert:** `1 passed` (empty → `MISSING`). **Blocked by:** B5.

#### Task C8: Tamper-evident append-only audit trail
- **Target Finding:** D4. **Root Cause:** overwrite-mode logging, second-resolution timestamps, orchestrator rewrites prior entries (`orchestrator:163`). **Red:** rewriting a prior audit entry succeeds undetected. **Green:** append-only hash-chained log; tampering breaks the chain; ms timestamps. **Guardrail:** chain-verification test. **Steps:** hash-chain entries; ms timestamps; forbid rewrite.
  - **Execute:** `pytest tests/test_audit_chain.py -v` · **Assert:** `1 passed`. **Blocked by:** B5.

#### Task C9: Non-defeatable countermeasure gate
- **Target Finding:** D5. **Root Cause:** the gate is satisfied by editing a JSON field. **Red:** editing the field satisfies the gate. **Green:** gate tied to git identity / signed marker; editing the field no longer satisfies it. **Guardrail:** regression test. **Steps:** bind gate to a non-editable marker.
  - **Execute:** `pytest tests/test_gate.py -v` · **Assert:** `1 passed`. **Blocked by:** B5.

#### Task C10: Verify CoFID checksum on every load
- **Target Finding:** D6. **Root Cause:** sha256 verified only on first download, not when cached (`cofid_fetcher.py:209–212 vs 226`). **Red:** a tampered cached CSV loads without checksum failure. **Green:** checksum verified on every load; tampered cache fails. **Guardrail:** regression test. **Steps:** verify checksum on every load.
  - **Execute:** `pytest tests/test_cofid_checksum.py -v` · **Assert:** `1 passed`. **Blocked by:** B5.

#### Task C11: Isolate fetch failures + defensive Retry-After
- **Target Finding:** D7 (+D12). **Root Cause:** fetch loop has no try/except; `int(Retry-After)` raises `ValueError` on non-numeric (`fdc_fetcher.py:291`), crashing the whole run. **Red:** a bad `Retry-After` header crashes the run. **Green:** one bad source is isolated (auditable per-source failure); `Retry-After` parsed defensively (fallback; HTTP-date). **Guardrail:** regression test. **Steps:** wrap each fetcher call; parse defensively.
  - **Execute:** `pytest tests/test_fetch_isolation.py -v` · **Assert:** `1 passed`. **Blocked by:** B5.

#### Task C12: Atomic provenance commit (no unaudited DB swap)
- **Target Finding:** D8. **Root Cause:** `commit_validation_run` returns `None` on failure (`GitError` defined `git_manager.py:22` never raised) while `atomic_swap` (step 6) precedes the commit (step 7). **Red:** a failed commit leaves the live DB swapped with no provenance, reported as success. **Green:** commit before/atomically-with the swap, or failed commit ⇒ hard error ⇒ rollback from backup; `GitError` actually raised. **Guardrail:** regression test asserting rollback on failed commit. **Steps:** reorder/atomicize; raise on failure.
  - **Execute:** `pytest tests/test_provenance_atomic.py -v` · **Assert:** `1 passed`. **Blocked by:** B5.

#### Task C13: Validate `--runtime` input
- **Target Finding:** E4. **Root Cause:** `cli.py` does `AnimalInput(**dict)` on an unvalidated `runtime_request.json` (can `TypeError`). **Red:** a malformed request raises `TypeError`. **Green:** malformed request ⇒ clean validation error, not `TypeError`. **Guardrail:** schema/TypedDict validation at the boundary. **Steps:** validate before constructing `AnimalInput`.
  - **Execute:** `pytest tests/test_runtime_input.py -v` · **Assert:** `1 passed`. **Blocked by:** none.

#### Task C14: CI gates + Python matrix + packaging
- **Target Finding:** E6 (+E19). **Root Cause:** CI runs only `pytest`+`mypy` on py3.12; no schema/MAPA gate; `requirements.txt` missing `requests`; `jsonschema` unpinned; no lockfile; dead `types-pydantic`. **Red:** `grep -nE 'validate-db|gate-mapa' .github/workflows/ci.yml` → none; single `python-version: "3.12"`. **Green:** CI has `schema-gate` + `import-smoke` + a 3.10–3.12 matrix; `requirements.txt` complete & pinned; lockfile present. **Guardrail:** CI is red on schema drift / import failure / on py3.10. **Steps:** add jobs/steps + matrix; fix requirements; add lockfile; remove dead dep.
  - **Execute:** `grep -nE 'schema-gate|import-smoke|3.10' .github/workflows/ci.yml` · **Assert:** matches present. **Blocked by:** B5 (import-smoke), B6 (schema-gate).

#### Task C15: One canonical bug-numbering scheme
- **Target Finding:** E7. **Root Cause:** three inconsistent schemes (REVIEW.md `R-01..R-09` vs README/amendment `R-01/R1..R-06/R7` vs `F1..F6/D1..D2`); `R-04` means different bugs in different docs. **Red:** `R-04` resolves to different defects across docs. **Green:** a single canonical index cross-maps every legacy ID once (history not rewritten). **Guardrail:** the index is the only place new IDs are minted. **Steps:** create the cross-map index.
  - **Execute:** `test -f docs/governance/ISSUE_INDEX.md && echo PRESENT` · **Assert:** `PRESENT`. **Blocked by:** none (documentation).

#### Task C16: Delete dead floor-relaxation doc/check + leaked file handle
- **Target Finding:** A7 (+E8). **Root Cause:** `clinical_floor_relaxed` never set; `validate_output` check #9 dead; `cli.py:253` `json.dump` leaks a file handle. **Red:** dangling `clinical_floor_relaxed` reference; unclosed file handle. **Green:** dead doc/check removed (or fallback implemented if wanted); `with open(...)` used. **Guardrail:** `grep clinical_floor_relaxed` empty (if deleted). **Steps:** delete dead code or implement; use context manager.
  - **Execute:** `grep -rc clinical_floor_relaxed src/` · **Assert:** `0` (if deletion path chosen). **Blocked by:** none.

---

### Execution Phase 3 — Automated Regression Suite
*Lock in automated assertions for every remediated item; make the suite able to **catch** regressions, not just pass.*

#### Task R1: Replace tautological tests with specific assertions
- **Target Finding:** E16. **Root Cause:** `assert result["solver_status"] in (…all enum values…)` is true by construction (`test_cascade_integration.py:191–192,357–358`); `test_structurally_infeasible` accepts either of two statuses. **Red:** the assert passes for any status. **Green:** assert the **specific** expected status for a deterministic (seeded) selection; a perturbed expectation fails. **Guardrail:** mutation spot-check (flip a `>=`→`>`) confirms the test catches it.
  - **Execute:** `pytest tests/test_cascade_integration.py -v` · **Assert:** specific-status asserts pass; a deliberately perturbed expectation fails.

#### Task R2: Fix `audit_test_result` theater
- **Target Finding:** E17. **Root Cause:** computes `passed` then only writes to a committed `.md`; callers ignore the return; tests dirty the working tree (`test_cascade_integration.py:62–77`). **Red:** a forced failure does not fail the test; `git status` shows modified `test_audit_log.md`. **Green:** `assert passed` (or delete the helper); logs go to `tmp_path`. **Guardrail:** a forced failure now fails the test; working tree stays clean.
  - **Execute:** `pytest tests/test_cascade_integration.py -v && git status --porcelain tests/test_audit_log.md` · **Assert:** tests pass and `git status` output is empty for that file.

#### Task R3: Real lexicographic-dominance proof + timeout test
- **Target Finding:** E18 (+E5). **Root Cause:** `test_level3_lexicographic_order_validated` checks stage-name metadata, not objective preservation (`:231–243`); `test_solver_timeout_returns_result` never calls the solver (`:332–336`). **Red:** lexicographic test passes even if later stages worsen earlier objectives; timeout test passes unconditionally. **Green:** capture per-stage objective bounds and assert non-degradation within tolerance; force a real timeout (tiny `time_limit`/monkeypatched CBC `maxSeconds`) and assert a safe result object. **Guardrail:** both tests fail on a regression.
  - **Execute:** `pytest tests/test_cascade_integration.py -k "lexicographic or timeout" -v` · **Assert:** `2 passed` with real assertions.

#### Task R4: Deterministic replay + regression fixtures for every P0/P1 fix
- **Target Finding:** proof discipline (§10). **Root Cause:** fixes need reproducible, located, justified failure evidence. **Red:** n/a (process). **Green:** for a fixed fixture+seed the output contract is byte-identical across two runs; each P0/P1 fix has a minimal 2–3-ingredient regression fixture in `tests/fixtures/`. **Guardrail:** zero-tolerance flake policy; near-zero false-positive policy (assert the specific invariant). **Steps:** add fixtures; add the replay diff check.
  - **Execute:** `python -m gsd.cli --runtime --request tests/fixtures/<case>.json > /tmp/r1.json && … > /tmp/r2.json && diff /tmp/r1.json /tmp/r2.json` · **Assert:** `diff` empty (`DETERMINISTIC`).

#### Task R5: Cleanup deletions (dead code) + manual mutation spot-check policy
- **Target Finding:** A19, D22 (+A12 deletion if chosen). **Root Cause:** dead code (`GitError`-never-raised after C12, `verify_backup`-never-called, unused `FDC_RATE_LIMIT_DELAY_S`, unreferenced `weighted_normalized_deviation` `solver.py:768–808`); `[DEBUG]` prints (`solver.py:301,323`). **Red:** `grep` finds unreferenced symbols / debug prints. **Green:** deletions land with `pytest`+`mypy` green and no remaining references. **Guardrail:** delete only after R1–R4 pin behavior; one manual mutation spot-check confirms a test catches a seeded fault.
  - **Execute:** `pytest -q && mypy --package gsd && grep -rc '\[DEBUG\]' src/gsd/solver.py` · **Assert:** tests+mypy green and `0` debug prints.

---

## 3. Dependency Tree (explicit Blocked-by)

```
B0 (safety freeze) ── independent; backstops everything
B7 (namespace) ──┬─> B1 (nutrient_results: clean min/max source)
                 ├─> B5 (import: canonical units)
                 ├─> B6 (DB conformance: schema tightening) ─> C5 (schema hardening)
                 └─> B8 (lp_parameters schema)
B2 (antagonisms) ── Blocked by G1 (hard/soft) ─> C1 (penalty normalization)
B3 (Ca/P ceilings) ── Blocked by G3 (verify values) + vet review
B4 (growth energy) ── Blocked by G3 (verify taper) + vet review
B9 (objective source) ── Blocked by G2 (delete/wire; default delete)
B10 (stage order) ── independent
C2,C13,C15,C16 ── independent
C3 (dry matter) ── Blocked by moisture/ash data in DB
C4 (SULs) ── Blocked by G3 + vet review
C6 (FDC key) ── independent (security; do early)
C7-C12 (validation) ── Blocked by B5 (import)
C14 (CI gates) ── Blocked by B5 (import-smoke) + B6 (schema-gate)
R1-R5 (regression suite) ── after the fixes they lock in (R5 last)
```
**Critical path:** G1/G2/G3 decisions → B7 → {B1,B5,B6,B8} → {B2,C1},{C5},{C7–C12},{C14} → Phase 3. B3/B4 run in parallel once G3 values + vet review land.

---

## 4. Verification & Evidence Protocol (applies to every task)

- **Fixed seed policy:** CBC `randomSeed=12345`, `threads=1` (already set, `solver.py:657`); freeze time in tests; no unseeded randomness (none found in `src/gsd`).
- **Failure evidence format (required for every "fixed" claim):** `test name · stated invariant · file/module · function · minimal input · seed · expected · actual · reproducible command`.
- **Cheap differential oracle (primary):** re-substitute returned grams into the hard constraints / recompute `value` vs `(target_min,target_max)` in pure Python and assert agreement (used by B1, B2, B3, R4).
- **Completion Gate rule:** *Mark a task completed ONLY when its `Execute` command produces its `Assert Output`.* No "AI says fixed" — every claim cites a green test + seed + artifact.
- **Zero-flake / near-zero-FP:** any intermittent failure is a bug (root-cause before re-enabling); assert the specific invariant, never a broad disjunction.
- **Mutation spot-check:** one manual mutation only if a regression escapes (R1/R5).

---

## OPERATIONAL RULES
- **Single Question Output:** Phase-1 interrogation surfaces **one** question with **one** recommended default (Gate G1 below). G2 is resolved by default (DELETE); G3 is a verify-first/vet gate, not a user question.
- **Zero Vibe Statements:** every task above is concrete, atomic, and programmatically testable (Red/Green + Evidence Manifest). No "ensure robust handling."
- **Strict Dependency Tree:** prerequisites stated inline (`Blocked by …`) and in §3 to prevent out-of-order execution.
- **Completion Gate:** a task is done only when its Evidence Manifest's `Execute` yields its `Assert Output`.

---

## Copy-paste verification commands (Linux/bash confirmed; Python fallback inline)

```bash
cd /home/user/repos/Hans-GSD-Raw-Calculator

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

*Planning artifact only — no repository file modified. Red conditions above were captured by execution this session; Green conditions are the target assertions. Numeric safety values marked verify-first (G3) require AAFCO/NRC/FEDIAF primary-source confirmation + veterinary review before implementation.*
