# ROADMAP AMENDMENT — Gate G1 Resolution + Empirical Findings
### Amends `EXECUTIVE_REMEDIATION_ROADMAP.md` · `Hans-GSD-Raw-Calculator`

**Date:** 2026-07-25 (rev. 2 — precision corrections to §B-iii/§B-iv/Task B12 after deeper DB inspection).
**Status:** authoritative for the sections it touches.
**Supersedes:** §0 (Decision Gates), §2 Task **B2**, and §3 (Dependency Tree) of `EXECUTIVE_REMEDIATION_ROADMAP.md`. All other tasks (B0, B1, B3–B10, C1–C16, R1–R5) stand unchanged.
**Mode:** PLANNING ONLY — no repo file modified. New/revised tasks carry executable TDD Red/Green + Evidence Manifests.

---

## A. Decision record (Phase-1 gates — all resolved)

| Gate | Decision | Basis |
|---|---|---|
| **G1 — Antagonisms hard vs soft** | **HARD at Level 1** (violation ⇒ infeasible ⇒ `DO_NOT_FEED`) **+ mandatory severity-scaled feeding recommendation** at every level | **User-confirmed 2026-07-25** (recommended default). Config declares `HARD_FAIL_INFEASIBLE`; hardening is free today (Level 1 unreachable), truthful, and future-proofs `SAFE_TO_FEED`. The severity-scaled recommendation is the decisive protection and is mandatory regardless. |
| **G2 — `objective_weights.json`** | **DELETE** (+ document the real `CRITICALITY_WEIGHT` objective) | Resolved by default (YAGNI/DTSTTCPW — dead config; `solver.py` has 0 references). |
| **G3 — Numeric safety values** (Ca/P ceilings, growth taper, SULs) | **Verify-first** against AAFCO/NRC/FEDIAF primary sources + **veterinary review** before merge | Verification gate, not a user decision. |

---

## B. New empirical findings (from running the live solver, PuLP 3.3.2, and direct DB inspection)

These reframe Task B2 and add two tasks (B11, B12).

### B-i. Level 1 (`SAFE_TO_FEED`) is effectively unreachable
Five selections (5-ingredient realistic / high-bone / no-bone, 10-ingredient broad) under **both** scenarios (`SCN_A_RAPID_GROWTH`, `SCN_B_SLOW_GROWTH`) **all cascade to Level 2** (`solver_status="suboptimal"` → `FEED_WITH_CAUTION`). **None** achieves Level 1. The top safety tier is currently dead — the system never says `SAFE_TO_FEED`.

| Selection | Level | Ca:P | Ca:Mg | Zn:Cu | Reported |
|---|---|---|---|---|---|
| Realistic PMR (meaty bone+muscle+liver+fish) | 2 | 1.084 (−1.5%) | 8.44 (−30%) | 6.2 ✓ | `FEED_WITH_CAUTION` |
| High-bone (2 meaty bones+muscle+liver) | 2 | 1.881 (**+45%**) | 131.5 (**+631%**) | 10.2 ✓ | `FEED_WITH_CAUTION` |
| No bone (organs+muscle+fish) | 2 | 0.097 (**−91%**) | 0.894 (−93%) | 47.5 (**+296%**) | `FEED_WITH_CAUTION` |
| Broad 10-ingredient | 2 | 1.823 (+40%) | 105.8 (+488%) | 7.3 ✓ | `FEED_WITH_CAUTION` |
| Broad 10-ing, rapid-growth scenario | 2 | 1.823 (+40%) | 105.8 (+488%) | 7.3 ✓ | `FEED_WITH_CAUTION` |

### B-ii. Recommendation severity is invisible (the real danger)
`FEED_WITH_CAUTION` is emitted **identically** for a Ca:P that is **1.5% off** and a Ca:Mg that is **631% off** (calcium overload in the DOD-risk zone). There is no `DO_NOT_FEED` tier for large violations, and the per-nutrient table is hardcoded `"adequate"` on top (Task B1). The recommendation is driven by **cascade level**, not by **realized violation magnitude** (finding A6). **This is the decisive defect to fix.**

### B-iii. Level-1 infeasibility is NOT caused by the scenario minimum targets (corrected)
Each scenario carries **17 targets**: `caloric_density, protein_g, fat_g, calcium_g, phosphorus_g, ca_p_ratio, linoleic_acid_g, ala_alpha_linolenic_acid_g, ara_arachidonic_acid_g, epa_plus_dha_g, magnesium_g, sodium_g, vitamin_a_iu, vitamin_d3_iu, zinc_mg, lysine_g, methionine_plus_cystine_g`. For the broad 10-ingredient selection at Level 2, **15 of the 17 (the real-nutrient targets) are met**; the other 2 — `caloric_density` and `ca_p_ratio` — are **composite/derived quantities, not solution nutrients** (they appear as "not in solution"; this is finding LP-F16). The Level-2 solution still violates the *hard* Ca:P bound (realized 1.823 vs `[1.1,1.3]`).

**Conclusion:** the Level-1 blocker is **not** the 17 scenario targets. The LP's hard `_MIN` adequacy floors are a **much larger AAFCO set** (built from `NUTRIENT_REGISTRY` / `nutrient_set_minimal.json`, ~40+ nutrients) than the 17 scenario targets. **Narrowed candidates for the Level-1 infeasibility:** an AAFCO `_MIN` floor that no 5–10-ingredient combination can meet, the **clinical-floor MILP** (`x=0 OR x≥floor`), the **DER constraint** (the `k=1.2` energy, Task B4), or a **SUL max**. → Task **B11** (IIS diagnosis).

### B-iv. Arginine is in the DB but misplaced and untracked → Lys:Arg unevaluable (corrected)
`arginine_g` **is present** in the DB `bromatological_profile` — `beef_muscle_raw = 1.32 g` (as-fed, measured, `source_ref REF_USDA_FDC_170196`), `beef_liver_raw = 1.241 g`, `chicken_neck_raw = 0.975 g` (inferred). **But** it sits as a **top-level `bromatological_profile` key**, *not* under the canonical `bp["nutrients"]` dict where `lysine_g` lives. The solver reads `bp["nutrients"]`, so it reports `arginine_g = 0`. Additionally, `arginine_g` is **absent from the 17 scenario targets** (which include `lysine_g`). The **Lys:Arg antagonism is therefore unevaluable** for a double reason: arginine is a **misplaced/drift key** (the canonical-namespace defect, C2/C3) **and** it is not a tracked scenario nutrient. → Task **B12** (folds into B7).
*(Side confirmations: the `chicken_neck_raw` arginine `note` contains mojibake `Ã—` → C16; its `source_ref 170196` with a "re-aligned to FDC 169483" note is the C10 `beef_muscle` provenance contradiction.)*

---

## C. Revised Task B2 → split into B2a + B2b

### Task B2a: Harden mineral antagonisms at Level 1
- **Target Finding:** A2 / A14 (G1 = HARD).
- **Root Cause Analysis:** Config declares `solver_behavior:HARD_FAIL_INFEASIBLE` (60×) but the solver builds the ratios "with slack for goal programming" (`solver.py:425,434,467,472`), unpenalized in L2/L3 — a config↔code contradiction that lets ratio violations pass silently.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` → `60` while `grep -n 'with slack for goal programming' src/gsd/solver.py` → `425`. (Captured.)
  - **Green Condition:** a fixture engineered to violate Zn:Cu returns Level-1 **infeasible / `DO_NOT_FEED`** (hard, no slack); in Levels 2/3 the slack is penalized (normalized) and its magnitude is exposed in the output.
  - **Defense-in-Depth Guardrail:** assertion that **no Level-1 allocation violates any ratio bound**; the B0 safety freeze trips on any antagonism slack > tolerance.
- **Minimal Action Steps (DTSTTCPW):**
  1. In `build_lp_problem`, branch on `constraint.solver_behavior`: `HARD_FAIL_INFEASIBLE` ⇒ add the ratio bound from `lp_coefficients.bounds` with **no slack** at Level 1.
  2. For Levels 2/3 keep slack but **penalize** it (normalized — see C1) and **record** `antagonism_slack` per constraint in `raw_result`.
  3. Remove the lying soft implementation at Level 1 (config already says hard; make code honor it).
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_antagonism_hard.py -v`
  - **Assert Output:** `1 passed` — Zn:Cu-violating fixture asserts Level-1 result is infeasible/`DO_NOT_FEED`.
- **Blocked by:** none (G1 resolved). Pairs with C1 (normalization) and B2b (recommendation).

### Task B2b: Severity-scaled feeding recommendation (the decisive protection)
- **Target Finding:** A6 (+ makes B-i/B-ii safe).
- **Root Cause Analysis:** `feeding_rec` is mapped only from `result_status`/cascade level (`solver.py:1170–1177`), so a 631% Ca:Mg overload and a 1.5% Ca:P deviation both yield `FEED_WITH_CAUTION`. Severity is discarded.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** the broad 10-ingredient solve (Ca:P=1.82 +40%, Ca:Mg=105.8 +488%) returns `FEED_WITH_CAUTION`. (Captured.)
  - **Green Condition:** `feeding_rec` is a function of **realized violation magnitudes** across antagonism ratios + adequacy shortfalls + SUL excesses:
    - `DO_NOT_FEED` if any **critical** violation — e.g. Ca:P outside `[0.5, 1.8]`, Ca:Mg outside `[~6, ~24]`, **any SUL exceeded**, or any critical adequacy nutrient below its minimum by more than a tolerance (exact thresholds **verify-first / vet**, G3);
    - `FEED_WITH_CAUTION` if any **moderate** violation (ratio slightly out of `[lo,hi]`, mild shortfall);
    - `SAFE_TO_FEED` only if Level-1 optimal **and** no violation beyond a tiny tolerance.
    The output gains a `violations[]` array (`nutrient · type · realized · bound · severity_pct`).
  - **Defense-in-Depth Guardrail:** a regression test asserting the broad-selection case (Ca:Mg +488%) maps to `DO_NOT_FEED`, and a near-compliant case maps to `FEED_WITH_CAUTION`/`SAFE_TO_FEED`; the B0 freeze backstops until B2b lands.
- **Minimal Action Steps (DTSTTCPW):**
  1. In `build_output_contract`, compute violation magnitudes from `raw_result` (antagonism slack from B2a; adequacy slack; SUL excess `v_plus`).
  2. Replace the level-only `feeding_map` with a severity function (threshold table in config, values verify-first).
  3. Emit `violations[]` in the output contract.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_recommendation_severity.py -v`
  - **Assert Output:** `2 passed` — overload case → `DO_NOT_FEED`; near-compliant case → `FEED_WITH_CAUTION`/`SAFE_TO_FEED`; `violations[]` populated with correct `severity_pct`.
- **Blocked by:** B2a (antagonism slack exposed). Threshold values **verify-first** (G3) + vet review.

---

## D. New tasks

### Task B11: Diagnose Level-1 infeasibility (IIS / constraint relaxation)
- **Target Finding:** new (B-i / B-iii).
- **Root Cause Analysis:** Level 1 is unreachable for every tested selection, so `SAFE_TO_FEED` is dead and the Level-1 hardening (B2a) is currently moot. The blocker is **not** the 17 scenario targets (15 met; 2 are composite); it is a harder constraint Level 2 relaxes, drawn from the larger AAFCO `_MIN` floor set / clinical-floor MILP / DER / SULs.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** `solve_cascade(broad_selection, …)` returns `solver_status="suboptimal"` (Level 2); a direct Level-1 solve returns infeasible. (Captured.)
  - **Green Condition:** a diagnosis identifies the **minimal unsatisfiable constraint subset** — the specific constraint(s) that make Level 1 infeasible — and a recommended fix mapped to an existing task (e.g. DER/`k=1.2` → B4; moisture bias → C3; an over-strict `_MIN` floor → adjust with citation; clinical-floor MILP → relax/repair).
  - **Defense-in-Depth Guardrail:** after the implicated fix lands, re-run the broad selection and assert Level 1 becomes reachable (`SAFE_TO_FEED`) for at least one compliant selection.
- **Minimal Action Steps (DTSTTCPW):**
  1. Build the Level-1 LP for the broad selection; add slack to **all** Level-1 constraints, minimize total slack, and inspect which slacks are non-zero (the violated constraints).
  2. Binary-search by constraint group (AAFCO `_MIN` floors / clinical-floor MILP / DER / SUL maxes) to localize the blocker.
  3. Record the IIS + the recommended fix; do **not** change bounds in this task (diagnosis only).
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_level1_diagnosis.py -v` (a diagnostic that prints the non-zero-slack constraints)
  - **Assert Output:** the diagnosis names ≥1 specific blocking constraint with its slack magnitude; report written to `docs/governance/level1_infeasibility_diagnosis.md`.
- **Blocked by:** none (diagnostic). Informs whether B4/C3 restore Level 1.

### Task B12: Make arginine canonical + tracked so Lys:Arg is evaluable
- **Target Finding:** new (B-iv; folds into B7).
- **Root Cause Analysis:** `arginine_g` exists in the DB (`beef_muscle_raw = 1.32 g` as-fed) but as a **top-level `bromatological_profile` key**, not under the canonical `bp["nutrients"]` dict the solver reads; it is also **absent from the 17 scenario targets**. So the solver reports `arginine_g = 0` and the Lys:Arg antagonism cannot be evaluated.
- **Verification Criterion (TDD Red/Green):**
  - **Red Condition:** a solve with arginine-bearing ingredients reports `arginine_g = 0`; `arginine_g` is a top-level `bromatological_profile` key, not in `bp["nutrients"]`; `arginine_g` ∉ scenario targets. (Captured.)
  - **Green Condition:** `arginine_g` lives under `bp["nutrients"]` (canonical), is in `NUTRIENT_REGISTRY` + the active scenario targets; a solve with arginine-bearing ingredients reports `arginine_g > 0` and a finite Lys:Arg ratio.
  - **Defense-in-Depth Guardrail:** a load-time assertion that (a) every nutrient sits under `bp["nutrients"]` (no top-level drift keys) and (b) every antagonism `variables_referenced` nutrient is present in `NUTRIENT_REGISTRY` — prevents future unevaluable antagonisms.
- **Minimal Action Steps (DTSTTCPW):**
  1. Relocate `arginine_g` from top-level `bromatological_profile` into `bp["nutrients"]` for all ingredients that carry it (this is an instance of the B7 canonical-namespace fix).
  2. Add `arginine_g` to `NUTRIENT_REGISTRY` (unit/basis) and to the scenario targets (AAFCO minimum, verify-first).
  3. Confirm the Lys:Arg constraint builds and the output reports the ratio.
- **Required Evidence Manifest:**
  - **Execute:** `pytest tests/test_arginine_tracked.py -v`
  - **Assert Output:** `1 passed` — solve reports `arginine_g > 0` and a finite Lys:Arg ratio; no top-level drift nutrient keys remain.
- **Blocked by:** B7 (canonical registry/namespace). Small.

---

## E. Updated dependency tree (changes only)

```
B2a (harden antagonisms L1) ── G1 resolved (HARD); independent
B2b (severity-scaled rec)  ── Blocked by B2a (needs exposed slack); thresholds verify-first (G3) + vet
B11 (diagnose L1 infeasibility) ── independent diagnostic; informs whether B4/C3 restore Level 1
B12 (arginine canonical + tracked) ── Blocked by B7 (registry/namespace)
```
**Critical-path update:** B2a → B2b is now the **highest-value safety chain** (it is what actually protects the animal today, since Level 1 is unreachable). B11 runs early (cheap, high-information) to confirm whether the energy/moisture fixes (B4/C3) will make Level 1 — and thus the B2a hardening — meaningful. B0 (safety freeze) still backstops everything until B1/B2b land.

**Recommended Phase-1 start order (independent, high-value, can begin now):** B0 (safety freeze) · B5 (restore import) · B6 (schema gate) · B11 (Level-1 diagnosis) — none blocked by G3/vet. B2a follows immediately; B2b/B3/B4 await the verify-first numeric values + vet review.

---

### Revision notes (rev. 2)
- **§B-iii corrected:** 17 scenario targets (not 16); 15 real-nutrient targets met at Level 2; `caloric_density` + `ca_p_ratio` are composite/derived (LP-F16), not solution nutrients; the LP hard floors are a larger AAFCO set, so the Level-1 blocker is among those, not the scenario targets.
- **§B-iv corrected:** arginine value is **1.32 g** (beef_muscle_raw), not 1.276; root cause refined to a **misplaced top-level `bromatological_profile` key** (not under `bp["nutrients"]`) **plus** absence from the 17 scenario targets; B12 updated accordingly (relocate + track; folds into B7).

*Planning artifact only — no repository file modified. Red conditions captured by execution this session; Green conditions are target assertions. Numeric thresholds marked verify-first (G3) require AAFCO/NRC/FEDIAF primary-source confirmation + veterinary review before implementation.*
