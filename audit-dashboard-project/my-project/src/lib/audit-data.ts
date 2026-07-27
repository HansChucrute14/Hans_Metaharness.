/* Audit findings data — seeded from project-specific config
 * Source: Independent verification against live repo code
 * All 24 findings confirmed by execution, reading, or logical derivation.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Tier = 'tier0' | 'tier1' | 'tier2' | 'deferred' | 'additional'
export type VerificationStatus =
  | 'confirmed-execution'
  | 'confirmed-reading'
  | 'confirmed-logical'
  | 'needs-execution-confirmation'
  | 'partial'

export interface Proposal {
  title: string
  description: string
  effort: 'low' | 'medium' | 'high'
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
}

export interface CodeSnippet {
  file: string
  lines: string
  language: string
  code: string
}

export interface Finding {
  task: number | string
  findingIds: string[]
  title: string
  tier: Tier
  severity: Severity
  summary: string
  claim: string
  evidence: string
  verificationStatus: VerificationStatus
  verificationNote?: string
  dependsOn: string
  proposals: Proposal[]
  codeSnippets?: CodeSnippet[]
  category: string
  affectedFiles: string[]
}

export const FINDINGS: Finding[] = [
  /* ── TIER 0: IMMEDIATE THREATS ── */
  {
    task: 1,
    findingIds: ['A3', 'A2', 'B2'],
    title: 'Fail-closed safety freeze',
    tier: 'tier0',
    severity: 'critical',
    category: 'Safety Guard',
    summary:
      'No top-level "do not feed" gate exists. The solver can emit SAFE_TO_FEED for a diet 631% out of range on Ca:Mg, with every nutrient hardcoded "adequate". All five trip conditions are simultaneously true today.',
    claim:
      'All trip conditions simultaneously true: nutrient_results[i].status=="adequate" with pct_of_min=None; antagonism slack unpenalized outside L1; no absolute Ca ceiling; DB_ingredientes.json fails its own schema; no safety_guard.py exists.',
    evidence:
      'solver.py:1203-1227 hardcodes status="adequate" + pct_of_min=None; solver.py:813-820 penalizes antag slack only at L1; constraints.json has only ratio + min for Ca; toxicological_limits.json has 0 Ca entries; jsonschema validation → 61 errors on DB_ingredientes.json; glob for safety_guard → 0 files.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'All 5 trip conditions independently confirmed by code inspection + schema validation execution.',
    dependsOn: 'None',
    affectedFiles: ['src/gsd/solver.py', 'data/constraints.json', 'data/toxicological_limits.json', 'data/DB_ingredientes.json'],
    codeSnippets: [
      {
        file: 'src/gsd/solver.py',
        lines: '1209-1228',
        language: 'python',
        code: `# Every nutrient result is hardcoded "adequate"
"pct_of_min": None,           # line 1223
"status": "adequate",         # line 1225 — UNCONDITIONAL`,
      },
    ],
    proposals: [
      {
        title: 'Add independent safety_guard.py module',
        description:
          'Create src/gsd/safety_guard.py with pure check functions for each trip condition. Call from build_output_contract (solver.py:1157+). On trip, force feeding_rec="DO_NOT_FEED", feed_safe=false, and emit safety_warning string. Independent of underlying fixes — re-detects each original defect condition until Tasks 3/4/6 land.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Decorator-based constraint validation gate',
        description:
          'Add a @validate_safety_contract decorator on solve_cascade that checks pre/post conditions: antag slack bounded, nutrient_results non-placeholder, Ca has ceiling. If violated, wraps result in SafetyViolation container forcing DO_NOT_FEED. Less code duplication than a separate module, but couples the gate to the solver API.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'External audit-mode CLI command',
        description:
          'Add gsd.cli --audit-safety flag that loads a solved result JSON and independently evaluates all trip conditions, producing a pass/fail report. Does not modify solver behavior — purely a post-hoc verification tool. Useful for CI and for users to validate stored results, but does not actively prevent a bad recommendation from being emitted.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 2,
    findingIds: ['D1'],
    title: 'Restore validators/_shared.py (D1) + declare pydantic dependency',
    tier: 'tier0',
    severity: 'critical',
    category: 'Module Integrity',
    summary:
      'Four modules import extract_db_value from validators/_shared.py, which does not exist. This breaks CI test collection (191 tests / 1 error). Additionally, gsd.validation.schemas imports pydantic, but pydantic is not declared in pyproject.toml or requirements.txt — only types-pydantic (a stub) appears in CI.',
    claim:
      'ModuleNotFoundError: No module named "gsd.validation.validators._shared" at 4 import sites (orchestrator.py:54, bone_validator.py:39, cofid_validator.py:33, fdc_validator.py:36). pytest tests/ -v → 191 items / 1 error. schemas.py imports pydantic but pydantic not in dependencies.',
    evidence:
      'Direct import attempt confirmed. pytest collection aborts on test_validation_phase5.py. pip install -e . does not pull in pydantic. Only jsonschema, pulp, requests declared in pyproject.toml.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Independently confirmed by running import attempt + pytest. Additional pydantic dependency gap discovered during verification.',
    dependsOn: 'None',
    affectedFiles: [
      'src/gsd/validation/pipeline/orchestrator.py',
      'src/gsd/validation/validators/bone_validator.py',
      'src/gsd/validation/validators/cofid_validator.py',
      'src/gsd/validation/validators/fdc_validator.py',
      'src/gsd/validation/schemas.py',
      'pyproject.toml',
    ],
    codeSnippets: [
      {
        file: 'Import attempt',
        lines: 'N/A',
        language: 'bash',
        code: `$ PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator"
ModuleNotFoundError: No module named 'gsd.validation.validators._shared'

$ pytest tests/ -v
191 tests collected, 1 error in 1.96s
ERROR: collection aborts at tests/test_validation_phase5.py`,
      },
    ],
    proposals: [
      {
        title: 'Create _shared.py + add pydantic to pyproject.toml',
        description:
          'Create src/gsd/validation/validators/_shared.py implementing extract_db_value(nutrient_id, db_ingredient) with 3-state contract (missing/not_applicable → None, never silently 0). Add pydantic>=2.0 to pyproject.toml dependencies. Add tests/test_imports.py using importlib.import_module over every gsd.* module. Wire into CI as required job.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Refactor: inline extract_db_value into each validator',
        description:
          'Instead of creating the missing module, move the function into each validator that needs it, or into a shared utils module at a different path that already exists. Avoids the module-not-found pattern but creates 4 copies of the same logic (or 1 new module with a different name). Less clean architecturally but gets CI running fastest.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Replace pydantic models with plain dataclasses in schemas.py',
        description:
          'If pydantic is not desired as a runtime dependency, rewrite the 11 BaseModel classes in schemas.py as plain dataclasses or TypedDict classes (which require no runtime dependency beyond the stdlib). This eliminates the undeclared dependency entirely. However, this loses pydantic\'s runtime validation, which may be desirable for the validation pipeline.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 3,
    findingIds: ['A2'],
    title: 'Harden mineral antagonisms at Level 1',
    tier: 'tier0',
    severity: 'critical',
    category: 'LP Constraint',
    summary:
      'constraints.json declares 5 antagonisms as HARD_FAIL_INFEASIBLE, but solver.py implements every one as a slack variable penalized only at Level 1 and unbounded/unpenalized at Levels 2/3. Config contract and actual behavior have never matched.',
    claim:
      '60 HARD_FAIL_INFEASIBLE declarations in constraints.json (5 antagonism + 55 nutrient minimums). solver.py:425 adds "with slack for goal programming". Antagonism slack only penalized at L1 (solver.py:813-820), not at L2 (solver.py:824-842).',
    evidence:
      'grep HARD_FAIL_INFEASIBLE → 60 matches. solver.py:425 "with slack for goal programming". L1 objective adds antag slack (813-820). L2 weighted_normalized_slack has no antag slack refs (824-842).',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Confirmed by user: antagonism_slack_vars only added under goal_deviation kind (L1); L2 weighted_normalized_slack never references them.',
    dependsOn: 'None (Gate G1 resolved)',
    affectedFiles: ['src/gsd/solver.py', 'data/constraints.json'],
    codeSnippets: [
      {
        file: 'src/gsd/solver.py',
        lines: '813-820',
        language: 'python',
        code: `# Add antagonism slack terms to Level 1 objective ONLY
expr += slack_var * penalty_weight  # ← L1 only

# Lines 824-842 (Level 2) have NO antag slack references
# weighted_normalized_slack ignores antagonism_slack_vars entirely`,
      },
    ],
    proposals: [
      {
        title: 'Branch on solver_behavior: HARD_FAIL_INFEASIBLE → no slack at L1',
        description:
          'In build_lp_problem, add conditional logic: when constraint.solver_behavior == "HARD_FAIL_INFEASIBLE", add the ratio bound with NO slack variable at Level 1 (hard constraint). For L2/3, keep slack but penalize it normalized. Remove or truthfully re-scope the HARD_FAIL_INFEASIBLE flag. This matches config intent with solver behavior.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Retain slack at all levels but add escalating penalties',
        description:
          'Keep slack variables at all levels (preserving solver flexibility), but apply exponential penalty scaling: L1 penalty × 10, L2 × 5, L3 × 1. This ensures slack is always driven toward zero while allowing the solver to find feasible solutions. Less risky than removing slack entirely (which could cause infeasibility), but the penalty magnitudes need tuning.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Separate HARD_FAIL constraints into their own constraint group',
        description:
          'Create a new constraint category "hard_safety_bounds" distinct from the goal-programming "adequacy_soft" group. The solver treats them as immutable bounds at every cascade level — no slack ever. All other constraints retain their current goal-programming behavior. This is the cleanest semantic separation but requires solver.py refactoring of the constraint ingestion pipeline.',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 4,
    findingIds: ['A3', 'E1', 'E2'],
    title: 'Fix hardcoded nutrient_results placeholder',
    tier: 'tier0',
    severity: 'critical',
    category: 'Output Contract',
    summary:
      'build_output_contract\'s per-nutrient reporting (solver.py:1203-1227) is entirely fictional: every entry hardcoded "status":"adequate" with pct_of_min/pct_of_sul both None. The # This is simplified comment at :1213 confirms this is an unfinished placeholder. Calcium at 631% out of range still reports "adequate".',
    claim:
      'grep "status":"adequate" solver.py → 1225. "This is simplified" → 1213. Unconditional, not just edge cases. solve_cascade on 10-ingredient selection: all 41 nutrient_results → status:"adequate" including Ca/Mg at 20:1 ratio.',
    evidence:
      'solver.py:1213 "# This is simplified", 1220-1221 target_min only for safety_hard tier, 1223 pct_of_min=None, 1225 status="adequate". value = targets_per_day.get(nid, 0) at 1211 defaults to 0.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Independently confirmed by running solve_cascade(): all 41 results → "adequate", including Ca:Mg 20:1.',
    dependsOn: 'None (recommended after Task 9)',
    affectedFiles: ['src/gsd/solver.py'],
    codeSnippets: [
      {
        file: 'src/gsd/solver.py',
        lines: '1203-1227',
        language: 'python',
        code: `# Line 1211: missing nutrients get value 0, not flagged as unknown
value = targets_per_day.get(nid, 0)

# Line 1213: self-admitted placeholder
# This is simplified - real implementation computes min/max

# Line 1220-1225: ALL nutrients hardcoded
"target_min": target_min,   # None for arginine
"pct_of_min": None,         # never computed
"status": "adequate",       # UNCONDITIONAL`,
      },
    ],
    proposals: [
      {
        title: 'Real computation from scenario targets + SUL table',
        description:
          'Add nutrient_bounds_for(scenario_id, nid, data, der_info) returning (target_min, target_max) from active scenario targets and SUL table. Replace placeholder block (solver.py:1213-1225) with real pct_of_min, pct_of_sul, and derived status ("below_min", "adequate", "above_sul", "unknown"). Remove value=targets_per_day.get(nid, 0) fallback; mark missing nutrients "unknown". Strengthen validate_output with consistency assertion.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Two-phase: first patch status from compute_gaps(), then full rewrite',
        description:
          'Quick patch: repurpose the existing compute_gaps() results (solver.py:1035) to populate nutrient_results status and pct_of_min. Gaps already compute pct_of_min = achieved/target_min*100. Map gap_pct < 100 → "below_min", 100-150 → "adequate", >SUL_pct → "above_sul". Then do full rewrite later. Gets correct statuses out immediately with minimal code change.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Nutrient results as separate post-processing module',
        description:
          'Extract nutrient_results generation into a dedicated module (nutrient_report.py) with clear input/output contract: takes SolverResult + scenario config, produces NutrientResult[] with computed values. Makes the reporting layer independently testable and decoupled from solver internals. Higher effort but cleanest architecture.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 5,
    findingIds: ['A6'],
    title: 'Severity-scaled feeding recommendation',
    tier: 'tier0',
    severity: 'critical',
    category: 'Recommendation Logic',
    summary:
      'feeding_rec derived purely from cascade level (solver.py:1170-1177). A Ca:P deviation of 1.5% and a Ca:Mg deviation of 631% both map to identical FEED_WITH_CAUTION. Level 2 offers zero severity protection. No severity computation function exists anywhere.',
    claim:
      'Static feeding_map at solver.py:1170-1177: optimal→SAFE_TO_FEED, suboptimal→FEED_WITH_CAUTION. No severity function. Level 2 always says "caution" regardless of magnitude.',
    evidence:
      'solver.py:1170-1177 static feeding_map dict. grep def.*severity → 0 results. Level 2 result_status="suboptimal" always maps to FEED_WITH_CAUTION.',
    verificationStatus: 'confirmed-logical',
    verificationNote:
      'Logic confirmed: since Level 2 always produces result_status="suboptimal" → always FEED_WITH_CAUTION regardless of violation magnitude.',
    dependsOn: 'Task 3 (needs antagonism slack exposed)',
    affectedFiles: ['src/gsd/solver.py'],
    codeSnippets: [
      {
        file: 'src/gsd/solver.py',
        lines: '1170-1177',
        language: 'python',
        code: `feeding_map = {
    "optimal": "SAFE_TO_FEED",
    "suboptimal": "FEED_WITH_CAUTION",     # ← Always for Level 2
    "unsafe_diagnostic": "DO_NOT_FEED",
    "structurally_infeasible": "DO_NOT_FEED",
    "data_incomplete": "DO_NOT_FEED",
}
feeding_rec = feeding_map.get(result_status, "DO_NOT_FEED")`,
      },
    ],
    proposals: [
      {
        title: 'Threshold-based severity function with violations[] array',
        description:
          'In build_output_contract, compute violation magnitudes from raw_result (antagonism slack from Task 3; adequacy slack; SUL excess). Replace level-only feeding_map with a severity function reading a threshold table. Emit violations[] array (nutrient · type · realized · bound · severity_pct). Ship conservative placeholder thresholds now; tighten after G3 closes.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Three-band scoring: compliant / caution / do-not-feed',
        description:
          'Define three severity bands based on max(violation_pct across all constraints): <5% → SAFE_TO_FEED, 5-50% → FEED_WITH_CAUTION, >50% → DO_NOT_FEED. Simple, predictable, clinically intuitive. The 50% threshold catches the 488%/631% Ca:Mg violations. Adjustable per-nutrient if needed later.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Weighted multi-criteria severity score',
        description:
          'Compute a composite severity score = Σ(clinical_criticality_weight × violation_pct) across all violated constraints. Map score to recommendation via configurable thresholds. Allows fine-grained control: a single high-criticality violation (e.g., Ca) can outweigh multiple low-criticality ones. Most flexible but requires careful threshold calibration and clinical review.',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 6,
    findingIds: ['B2', 'B3'],
    title: 'Absolute calcium and phosphorus ceilings',
    tier: 'tier0',
    severity: 'critical',
    category: 'Nutrient Bounds',
    summary:
      'No absolute calcium maximum exists — only ratio bounds (Ca:P, Ca:Mg) and a minimum (calcium_g >= 3.0). Ca and P can scale together past safe levels, creating developmental orthopedic disease (DOD) risk. nutrient_bounds.json\'s hard_max 30 is a per-100g plausibility bound, not a dietary ceiling.',
    claim:
      'No calcium_g <= X in constraints.json or toxicological_limits.json. Only ratio + min constraints. nutrient_bounds.json hard_max 30 is per-100g ingredient composition, not dietary ceiling.',
    evidence:
      'constraints.json: only Ca:P ratio (:7), Ca:Mg ratio (:90), Ca minimum (:1251). toxicological_limits.json: 0 grep hits for "calcium". nutrient_bounds.json:20 hard_max 30 with note "Bone ingredients can reach ~20g/100g".',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'All grep searches confirmed. toxicological_limits.json contains 8 entries (copper, iron, sodium, vitA, vitD3, iodine, zinc, manganese) — no calcium.',
    dependsOn: 'None for mechanism; blocked on primary-source values (Gate G3)',
    affectedFiles: ['data/constraints.json', 'data/toxicological_limits.json', 'data/nutrient_bounds.json'],
    proposals: [
      {
        title: 'Add Ca/P as HARD_INEQUALITY_MAX in toxicological_limits.json',
        description:
          'Add calcium_g and phosphorus_g as HARD_INEQUALITY_MAX entries in toxicological_limits.json, energy-normalized (~4.5 g/1000kcal for Ca per AAFCO LBG). Register both in NUTRIENT_REGISTRY with unit/basis bound. Confirm existing SUL-as-hard-max ingestion at L1 applies. VALUES PENDING G3 — do not merge with unverified numbers.',
        effort: 'medium',
        risk: 'high',
        reversible: true,
      },
      {
        title: 'Computed ceiling from DER envelope',
        description:
          'Instead of a fixed numeric ceiling, derive the Ca/P max from the DER envelope: max_calcium = max_Ca_pct_DM × daily_kcal / 1000. This auto-adjusts with energy requirement and age. Requires the growth-energy schedule (Task 7) to be correct first. More robust but more dependencies.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Dual ceiling: absolute + ratio-composite',
        description:
          'Implement both an absolute ceiling (g/1000kcal) AND a ratio-composite ceiling (max Ca = min(absolute_ceiling, ratio_upper × companion_nutrient)). The ratio-composite catches cases where one ratio nutrient is also high; the absolute catches cases where both scale together. Belt-and-suspenders approach. Most protection, most complexity.',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 7,
    findingIds: ['B1', 'B11'],
    title: 'Fix growth-energy model and scenario labels',
    tier: 'tier0',
    severity: 'critical',
    category: 'Energy Model',
    summary:
      'SCN_B_SLOW_GROWTH ("recommended") uses k=1.2×RER (adult-maintenance range), while SCN_A_RAPID_GROWTH ("discouraged") uses k=2.0×RER (actual growth range). NRC 2006 puts young large-breed puppy at 2.0-3.0×RER. The "recommended" scenario underfeeds a growing GSD puppy by ~40-60%. No age tapering exists.',
    claim:
      'SCENARIO_K_MAP (core.py:205-208): SCN_B→"slow_growth_recommended" k=1.2, SCN_A→"rapid_growth_discouraged" k=2.0. nutrition.py:170-175 DER=k×RER with no age adjustment. growth_energy_skeletal.json confirms values.',
    evidence:
      'core.py:205-208 SCENARIO_K_MAP. growth_energy_skeletal.json:876-879 slow_growth_recommended.value=[1.2,1.5]. :887-889 rapid_growth_discouraged.value=[2.0,3.0]. nutrition.py:170 ter=70*(bw^0.75) static RER. 0 grep hits for age_taper/band/schedule.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'All values and labels confirmed. k=1.2 is even below adult_working_active (1.5) — truly energy-restricted.',
    dependsOn: 'None for mechanism; blocked on primary-source values (Gate G3)',
    affectedFiles: ['src/gsd/core.py', 'src/gsd/nutrition.py', 'data/growth_energy_skeletal.json', 'data/scenarios.json'],
    codeSnippets: [
      {
        file: 'src/gsd/core.py',
        lines: '205-208',
        language: 'python',
        code: `SCENARIO_K_MAP: Dict[str, str] = {
    "SCN_B_SLOW_GROWTH": "slow_growth_recommended",       # k=1.2 ← "recommended"
    "SCN_A_RAPID_GROWTH": "rapid_growth_discouraged",     # k=2.0 ← "discouraged"
}
# growth_energy_skeletal.json:
#   slow_growth_recommended.value = [1.2, 1.5]
#   rapid_growth_discouraged.value = [2.0, 3.0]   ← actual growth range`,
      },
    ],
    proposals: [
      {
        title: 'Age-banded growth-energy schedule replacing flat k',
        description:
          'Add growth_energy_schedule (age/weight-band → k) to data. Replace SCENARIO_K_MAP flat lookup with schedule interpolation in calculate_der_and_envelope (nutrition.py:173-178). Relabel scenarios: "controlled_growth" (mineral management) vs "standard_growth" (age-appropriate energy). VALUES PENDING G3. Ship mechanism with placeholder bands; tighten after veterinary review.',
        effort: 'high',
        risk: 'high',
        reversible: true,
      },
      {
        title: 'Swap scenario labels + adjust k ranges',
        description:
          'Immediate label fix: rename slow_growth_recommended → growth_energy_restricted, rapid_growth_discouraged → growth_standard_recommended. Adjust k: SCN_B (restricted) = 1.2-1.5 for adult/maintenance; SCN_A (recommended) = 2.0-3.0 for growth. This makes the labels truthful without changing the DER computation — still flat k, but the "recommended" scenario now uses the growth-appropriate value.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Three-tier scenario system with age-gated switching',
        description:
          'Replace the binary SCN_A/B with three scenarios: (1) puppy_growth (k=2.0-3.0, age 0-6mo), (2) adolescent_growth (k=1.6-2.0, age 6-12mo), (3) adult_maintenance (k=1.2-1.5, age >12mo). Auto-select based on AnimalInput.age_months. Gives the most clinically appropriate energy per life stage. Requires AnimalInput to carry age field (currently optional/missing).',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },

  /* ── TIER 1: STRUCTURAL CAUSES ── */
  {
    task: 8,
    findingIds: ['New (Part 2 §9.2)'],
    title: 'Diagnose Level-1 structural unreachability',
    tier: 'tier1',
    severity: 'high',
    category: 'Solver Diagnostic',
    summary:
      'Direct execution of solve_cascade() against both the 5-ingredient REFERENCE_SELECTION and a 10-ingredient broad selection produced cascade_level=2 / solver_status="suboptimal" every time. Level 1 was never reached. This means Task 3\'s L1 hardening has no floor to protect — users always land on Level 2.',
    claim:
      'solve_cascade(broad_selection) → solver_status="suboptimal" (Level 2). Direct L1-only solve → infeasible. Confirmed across two independent test rounds.',
    evidence:
      'Both reference and broad selections land at cascade_level_used=2, solver_status="suboptimal", feeding_recommendation=FEED_WITH_CAUTION.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Independently confirmed by user running solve_cascade on both selections.',
    dependsOn: 'None (diagnostic only)',
    affectedFiles: ['src/gsd/solver.py'],
    proposals: [
      {
        title: 'IIS (Irreducible Infeasible Subset) analysis',
        description:
          'Build the Level-1 LP for the broad selection; add slack to all L1 constraints, minimize total slack, and inspect which slacks are non-zero. Binary-search by constraint group (AAFCO _MIN floors / clinical-floor MILP / DER / SUL maxes) to localize the blocker. Record findings in docs/governance/level1_infeasibility_diagnosis.md. No bound changes in this task.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Relax-and-record diagnostic mode',
        description:
          'Add a --diagnose-infeasibility flag to solve_cascade that runs each constraint group individually (all others relaxed) and reports which group(s) cause infeasibility. Faster than full IIS but less precise. Produces a ranked list of constraint groups by infeasibility contribution. Good for quick triage before full IIS.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Constraint sensitivity profiling via parameter perturbation',
        description:
          'For each L1 constraint, perturb its RHS by ±10% and record whether the solution becomes feasible. Constraints whose perturbation changes feasibility are the binding ones. Build a sensitivity heatmap. Most informative but requires multiple solver runs (~N constraints × 2 perturbations). Good complement to IIS.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 9,
    findingIds: ['C2', 'C3'],
    title: 'Canonical nutrient registry',
    tier: 'tier1',
    severity: 'high',
    category: 'Data Schema',
    summary:
      'Three nutrient-naming schemes coexist with zero key overlap (FDC, CoFID, solver/bank). No single registry maps between them. DB schema validates by patternProperties + bare minProperties count, not enumerated key set. Adversarial typo\'d key produces 0 validation errors. 28 ingredients yield 9 distinct key-sets. chicken_blood_raw reports Mg as both 5.0 and 20.51 mg.',
    claim:
      'Adversarial typo → 0 errors; 28 ingredients → 9 key-sets (48-key union / 43-key intersection); chicken_blood_raw Mg conflict: magnesium_mg: 5.0 vs magnesium_g: 0.02051 (=20.51 mg).',
    evidence:
      'DB_ingredientes.json chicken_blood_raw: magnesium_mg:5.0, magnesium_g:0.02051. db_ingredientes.schema.json uses patternProperties + minProperties, no propertyNames enum. 28 ingredients confirmed.',
    verificationStatus: 'confirmed-execution',
    verificationNote: 'Confirmed by user: exact Mg conflict, 28 ingredients, 9 key-sets.',
    dependsOn: 'None (recommended before Tasks 4/12)',
    affectedFiles: ['data/DB_ingredientes.json', 'data/db_ingredientes.schema.json', 'data/lp_parameters_data.json'],
    codeSnippets: [
      {
        file: 'data/DB_ingredientes.json',
        lines: 'chicken_blood_raw',
        language: 'json',
        code: `// CONFLICTING MAGNESIUM VALUES
"magnesium_mg": { "value": 5.0,    "unit": "mg" }   // = 5.0 mg
"magnesium_g":  { "value": 0.02051,"unit": "g"  }   // = 20.51 mg  ← CONFLICT`,
      },
    ],
    proposals: [
      {
        title: 'Promote NUTRIENT_REGISTRY to canonical + strict schema',
        description:
          'Promote lp_parameters_data.json\'s NUTRIENT_REGISTRY to sole canonical registry. Add min/max (from scenarios.json + toxicological_limits.json). Rewrite db_ingredientes.schema.json: propertyNames:{enum:[exact 43 keys]} + required + additionalProperties:false. Bind each *_mg/*_ug/*_g/*_iu key to required unit. Dedupe DB entries; resolve chicken_blood_raw Mg conflict to one FDC-sourced value.',
        effort: 'high',
        risk: 'medium',
        reversible: false,
      },
      {
        title: 'Bridge mapping file between naming schemes',
        description:
          'Create nutrient_name_map.json mapping FDC IDs → CoFID IDs → solver/bank IDs via the registry. Each data file references its own scheme, but the bridge file enables cross-validation. Less disruptive than mandating a single scheme, but adds a new coordination file that must stay synchronized.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Automated key-set reconciliation tool',
        description:
          'Build a script that reads all 28 ingredients, extracts their key-sets, computes the union and intersection, flags any key appearing in <28 ingredients, and resolves unit conflicts (e.g., magnesium_mg vs magnesium_g). Run as CI gate (--validate-db). Reconciles the current mess without requiring all ingredients to adopt the same key-set immediately.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 10,
    findingIds: ['C1', 'C4'],
    title: 'CI schema gate + repair both broken schemas',
    tier: 'tier1',
    severity: 'high',
    category: 'CI / Schema',
    summary:
      'DB_ingredientes.json fails its own schema (61 errors: 60 missing fields + 1 over-length note). lp_parameters.schema.json validates zero real files — describes obsolete shape (breed/domains) while actual data uses NUTRIENT_REGISTRY/solve_cascade, producing 3 errors. No schema gate exists in CI.',
    claim:
      'jsonschema → 21 errors on DB_ingredientes (roadmap doc), actually 61 confirmed. lp_parameters → 3 errors: "breed is required", "domains is required", additionalProperties. grep validate-db/jsonschema in ci.yml → 0 matches.',
    evidence:
      'DB_ingredientes.json: 60+ missing-field violations + 1 note-length. lp_parameters_data.json vs schema: breed required, domains required, additionalProperties. ci.yml: no schema validation job.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Roadmap claimed 21 errors; actual execution found 61 (more severe than documented). The 3 lp_parameters errors confirmed exactly with identical messages.',
    dependsOn: 'None (ideally after Task 9)',
    affectedFiles: ['data/DB_ingredientes.json', 'data/lp_parameters.schema.json', '.github/workflows/ci.yml'],
    codeSnippets: [
      {
        file: 'Schema validation',
        lines: 'N/A',
        language: 'bash',
        code: `$ jsonschema DB_ingredientes.json → 61 errors   # Roadmap said 21!
$ jsonschema lp_parameters_data.json → 3 errors
  - 'breed' is a required property
  - 'domains' is a required property
  - additional-properties violation`,
      },
    ],
    proposals: [
      {
        title: 'Repair both schemas + add required CI schema-gate job',
        description:
          'Add unit to 20 measured DB entries; trim over-long note. Strip UTF-8 BOM from nutrient_set_minimal.json and nutrient_safety.schema.json. Rewrite lp_parameters.schema.json to match real top-level keys (or split into nutrient_registry.schema.json + solve_cascade.schema.json). Add CI job running jsonschema against every data↔schema pair. Required, non-skippable.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Generate schemas from data (schema-from-data approach)',
        description:
          'Instead of hand-maintaining schemas, write a script that generates .schema.json files from the actual data files + NUTRIENT_REGISTRY. Run as a CI pre-step: if generated schema differs from committed schema, CI fails. Eliminates schema-data drift permanently. But requires the data to be correct first (circular dependency with Task 9).',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Pydantic-based runtime validation replacing JSON Schema',
        description:
          'Replace JSON Schema validation with Pydantic models that validate data at load time in core.py. Pydantic gives runtime enforcement + type safety + better error messages. But this adds pydantic as a hard dependency (which needs to be declared — see Task 2 addendum). And it doesn\'t validate pure JSON files without loading them through Python.',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 11,
    findingIds: ['A5'],
    title: 'Delete objective_weights.json (Gate G2 — resolved: DELETE)',
    tier: 'tier1',
    severity: 'medium',
    category: 'Dead Code',
    summary:
      'objective_weights.json\'s 29 entries (priority tiers, asymmetric penalties, gonadal multipliers) are consumed only by documentation generators (mapa.py, doc_introspector.py) and core.py loader — never by the solver. The solver\'s objective is built entirely from hardcoded CRITICALITY_WEIGHT map (solver.py:17). The file misleads readers who assume it governs LP behavior.',
    claim: 'grep -c objective_weights solver.py → 0. Only consumed by mapa.py, doc_introspector.py, core.py (loader).',
    evidence:
      '0 references in solver.py. CRITICALITY_WEIGHT at solver.py:17 (:772,:791) is the real objective source. objective_weights.json → 29 entries read by doc-gen only.',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Confirmed by user: zero references in solver.py; only consumed by doc generators and core.py loader.',
    dependsOn: 'None',
    affectedFiles: ['data/objective_weights.json', 'src/gsd/core.py', 'src/gsd/mapa.py', 'src/gsd/doc_introspector.py'],
    proposals: [
      {
        title: 'Delete file + all loaders + add coefficient-match test',
        description:
          'Delete data/objective_weights.json. Remove loaders (core.py:60/419, mapa.py:530/533/1270, doc_introspector.py:703). Document real objective (CRITICALITY_WEIGHT map + stage structure) in its place. Add tests/test_objective_source.py asserting LP coefficients equal CRITICALITY_WEIGHT. Trivially restorable from git history.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Keep file but rename + add README disclaimer',
        description:
          'Rename objective_weights.json → objective_weights_doc_reference.json. Add prominent README: "This file is for documentation/reference only and does NOT govern the LP solver objective. The real objective source is CRITICALITY_WEIGHT in solver.py." Less disruptive to doc-gen pipeline but leaves a misleading file in the repo.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Migrate objective_weights.json values into CRITICALITY_WEIGHT',
        description:
          'If any of the 29 entries in objective_weights.json represent desired behavior that CRITICALITY_WEIGHT doesn\'t capture (e.g., asymmetric penalties, gonadal multipliers), migrate those values into the solver\'s actual objective computation. Then delete the file. This is only viable if the values are clinically correct — otherwise it propagates bad weights into the solver.',
        effort: 'medium',
        risk: 'high',
        reversible: true,
      },
    ],
  },
  {
    task: 12,
    findingIds: ['B12 (reframed)'],
    title: 'Confirm arginine display after Task 4',
    tier: 'tier1',
    severity: 'medium',
    category: 'Data Validation',
    summary:
      'Earlier claim that arginine_g was misplaced in bromatological_profile was DISPROVEN by direct execution. arginine_g is correctly in bp["nutrients"] for all 28 ingredients, is in NUTRIENT_REGISTRY, and has AAFCO minimum constraint CSTR_NB_ARGININE_G_MIN ≥ 2.5. The real defect is Task 4\'s hardcoded "adequate" output layer.',
    claim:
      'arginine_g correctly placed in bp["nutrients"] for all 28 ingredients. In NUTRIENT_REGISTRY. Has AAFCO minimum ≥ 2.5. Hardcoded output reports value=0, status="adequate".',
    evidence:
      'DB_ingredientes.json: 28 arginine_g entries in nutrients dict. lp_parameters_data.json:20-26: arginine_g in registry. constraints.json:504-526: CSTR_NB_ARGININE_G_MIN ≥ 2.5. solver.py:1211 value=0 default, 1225 status="adequate".',
    verificationStatus: 'confirmed-execution',
    verificationNote:
      'Data placement confirmed correct. The "relocate arginine" framing from earlier documents is explicitly disproven.',
    dependsOn: 'Task 4',
    affectedFiles: ['src/gsd/solver.py', 'data/DB_ingredientes.json'],
    proposals: [
      {
        title: 'Verify arginine appears with real values after Task 4 lands',
        description:
          'After Task 4 ships real computation, verify arginine_g appears in nutrient_results with its true computed value and status derived from Lys:Arg constraint satisfaction. Add tests/test_arginine_tracked.py asserting arginine_g > 0 and finite Lys:Arg ratio for an arginine-bearing selection. No relocation of arginine key is required.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Add arginine to scenario targets as explicit follow-up',
        description:
          'If Task 4 alone doesn\'t produce arginine tracking (e.g., arginine not in the active scenario\'s target list), add arginine_g to the scenario\'s nutrient targets with AAFCO minimum value. This ensures arginine is always evaluated, not just when it happens to appear in an antagonism ratio. Small follow-up, low risk.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Load-time assertion for antagonism nutrient coverage',
        description:
          'Add a load-time assertion that every antagonism\'s variables_referenced nutrients are present in NUTRIENT_REGISTRY. This prevents a future unevaluable antagonism from shipping silently. Generalizes the arginine case to all ratio-bound nutrients. Runs at solver initialization, not just in tests.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 13,
    findingIds: ['D8'],
    title: 'Fix silently-swallowed git commit after DB swap',
    tier: 'tier1',
    severity: 'high',
    category: 'Pipeline Integrity',
    summary:
      'commit_validation_run returns None on every failure path instead of raising GitError. GitError class (git_manager.py:22) is defined but never raised (0 grep matches). Atomic DB swap (orchestrator step 6, line 534) happens BEFORE git commit (step 7, line 553). Pipeline reports live_db_modified=True independent of git_commit outcome.',
    claim:
      '4 return-None paths in commit_validation_run. GitError defined but never raised. Swap before commit. live_db_modified=True independent of commit success.',
    evidence:
      'git_manager.py:210,224,232,244 return None. GitError class at :22, 0 raise GitError matches. orchestrator.py:534 swap, :553 commit. :574 live_db_modified=not dry_run and bool(corrections).',
    verificationStatus: 'confirmed-reading',
    verificationNote:
      'Category (b) evidence — verified by static code reading. Needs execution confirmation: force a commit failure after swap and confirm pipeline still reports live_db_modified=True.',
    dependsOn: 'Task 2 (D1)',
    affectedFiles: ['src/gsd/validation/pipeline/git_manager.py', 'src/gsd/validation/pipeline/orchestrator.py'],
    codeSnippets: [
      {
        file: 'orchestrator.py ordering',
        lines: '530-560',
        language: 'python',
        code: `# STEP 6: Atomic DB swap (line 534) — OVERWRITES LIVE DB
with CandidateWriter... atomic_swap(cw.candidate_path, config.db_path)

# STEP 7: Git commit attempt (line 553) — too late if commit fails!
commit_validation_run(...)   # returns None on failure, never raises`,
      },
    ],
    proposals: [
      {
        title: 'Raise GitError on failure + reorder swap-after-commit',
        description:
          'Change commit_validation_run to actually raise GitError on failure. Reorder orchestrator: commit happens before, or atomically with, the swap. If commit fails → hard error triggering rollback from backup. Add tests/test_git_commit_failure_rollback.py injecting a commit failure post-swap. Most thorough fix but requires orchestrator restructuring.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Swap-first with mandatory rollback on commit failure',
        description:
          'Keep current swap-first order but add a rollback step: if commit_validation_run returns None, immediately restore from backup_before_swap and set live_db_modified=False. Simpler restructure than full reorder. The swap is still attempted first (useful for dry-run testing), but a failed commit guarantees rollback.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Two-phase commit: staged swap + confirmed activation',
        description:
          'Split atomic_swap into two phases: (1) stage: write candidate to a .staging path (not live); (2) activate: move staging to live ONLY after successful git commit. This is the classic Candidate→Check→Commit pattern the pipeline was designed to enforce but currently violates. Cleanest architecture but most code change.',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 14,
    findingIds: ['D5'],
    title: 'Make circuit-breaker gate non-trivially defeatable',
    tier: 'tier1',
    severity: 'medium',
    category: 'Pipeline Security',
    summary:
      'The circuit-breaker countermeasure gate is satisfied by editing an ordinary JSON field (orchestrator.py:136: if record.get("countermeasure_note")). No content validation, no signature, no review — any truthy string passes. The gate is trivially bypassed by direct JSON editing.',
    claim:
      'Gate check: record.get("countermeasure_note") — any truthy value passes. No signature, hash, or review required. _add_countermeasure_note writes any string.',
    evidence:
      'orchestrator.py:132-137: if record.get("countermeasure_note") → proceed. :146-166: writes any string as countermeasure_note. No integrity protection on audit JSON files.',
    verificationStatus: 'confirmed-reading',
    verificationNote:
      'Category (b) — verified by static reading. Needs execution confirmation: edit JSON directly and confirm pipeline resumes.',
    dependsOn: 'Task 2 (D1)',
    affectedFiles: ['src/gsd/validation/pipeline/orchestrator.py'],
    proposals: [
      {
        title: 'Git-identity-bound gate marker',
        description:
          'Replace plain-JSON-field gate with a marker that includes git committer identity + timestamp + SHA of the review artifact. The gate checks that the marker\'s git identity matches the current committer and the SHA matches a real review document in the repo. Cannot be produced by editing JSON directly. Low-complexity but requires git access.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Signed HMAC marker with shared secret',
        description:
          'Generate an HMAC-SHA256 of the countermeasure note content using a secret stored in environment variable (not in the repo). The gate validates HMAC before accepting the note. A direct JSON edit cannot produce a valid HMAC without the secret. Simple cryptographically but requires secret management infrastructure.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'External review-approval system',
        description:
          'Require a separate approval file (e.g., countermeasure_approval.json) signed by a different git identity than the one that tripped the breaker. The gate checks: (1) approval file exists, (2) approver ≠ breaker, (3) approval timestamp > breaker timestamp. Most robust — enforces actual two-person review. But requires organizational process change.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },

  /* ── TIER 2: GUARDRAILS ── */
  {
    task: 15,
    findingIds: ['D1 (guardrail)'],
    title: 'CI import-smoke test',
    tier: 'tier2',
    severity: 'medium',
    category: 'CI',
    summary:
      'No tests/test_imports.py exists. No CI step imports every gsd.* module. The _shared.py absence broke CI collection with no prior warning. An import-smoke test closes that whole class of failure.',
    claim: 'No test_imports.py. No CI import-smoke step.',
    evidence:
      'tests/ directory has 14 test files, none named test_imports.py. ci.yml has pytest + mypy jobs, no import iteration.',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Task 2',
    affectedFiles: ['tests/', '.github/workflows/ci.yml'],
    proposals: [
      {
        title: 'Importlib-based smoke test + required CI job',
        description:
          'Add tests/test_imports.py using importlib.import_module over every gsd.* module (dynamically enumerated from package structure). Wire as required, non-skippable CI job. Fast to run (<1s), catches any missing module file permanently.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Pytest collection-phase hook',
        description:
          'Add a pytest plugin/conftest.py hook that runs at collection start, importing all gsd modules before any test is collected. If any import fails, collection aborts with a clear error. Integrated into existing pytest flow — no separate job needed. But less visible in CI than a dedicated job.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Package-level __init__.py import check',
        description:
          'In each gsd subpackage\'s __init__.py, add a top-level block that imports all sibling modules. If any is missing, the package itself fails to import, which pytest immediately catches. Simple but pollutes __init__.py with maintenance-heavy import lists.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 16,
    findingIds: ['E6'],
    title: 'CI schema-gate as required job',
    tier: 'tier2',
    severity: 'medium',
    category: 'CI',
    summary:
      'ci.yml runs pytest and mypy but no --validate-db schema gate, no --gate-mapa. Single Python 3.12 job against requires-python>=3.10. Schema/doc drift ships uncaught. types-pydantic is a dead dependency in CI (runtime pydantic not installed).',
    claim: '0 mentions of validate-db/gate-mapa/jsonschema in ci.yml. Python 3.12 only, no matrix. types-pydantic installed but pydantic runtime not.',
    evidence:
      'ci.yml: 2 jobs (test + type-check), both python 3.12. pyproject.toml requires-python>=3.10. grep validate-db → 0. scripts/validate_db.py exists but never called by CI.',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Task 10',
    affectedFiles: ['.github/workflows/ci.yml', 'pyproject.toml'],
    proposals: [
      {
        title: 'Add schema-gate + --gate-mapa as required CI jobs + Python matrix',
        description:
          'Add validate-db and gate-mapa as required CI jobs. Add 3.10-3.12 Python matrix. Remove dead types-pydantic dependency (or replace with real pydantic per Task 2). Add branch protection requiring schema-gate job to pass before merge.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Pre-commit hook for schema validation',
        description:
          'Add a pre-commit hook that runs jsonschema validation on every commit touching data/*.json files. Faster feedback than CI job (runs locally), but doesn\'t catch CI-only drift. Good complement to CI gate, not a replacement.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Makefile-style task runner with schema + import + test gates',
        description:
          'Create a Makefile or just script that defines: make validate (schema gate), make imports (smoke test), make test (pytest), make all (all three). CI runs make all. Developers run individual targets locally. Single entry point, clear ordering, easy to extend. But requires maintaining the Makefile alongside ci.yml.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 17,
    findingIds: ['D2'],
    title: 'Stop leaking the FDC API key',
    tier: 'tier2',
    severity: 'high',
    category: 'Security',
    summary:
      'fdc_fetcher.py:260 and :367 pass API key as URL query parameter (params={"api_key": self._api_key}). Exception handler at :272 captures raw str(exc) — which can contain the full URL with key — into persisted audit/logs on any RequestException. The secret leaks into every persisted artifact downstream.',
    claim:
      'params={"api_key": self._api_key} at lines 260/367. Exception handler at :272 captures raw str(exc) into result dict that gets persisted.',
    evidence:
      'fdc_fetcher.py:260 params dict, :367 same pattern, :272 str(exc) persisted. No URL scrubbing. No header-based key transport.',
    verificationStatus: 'confirmed-reading',
    verificationNote:
      'Confirmed by user. Category (b) — needs execution confirmation: trigger RequestException and confirm key in persisted artifact.',
    dependsOn: 'Task 2',
    affectedFiles: ['src/gsd/validation/fetchers/fdc_fetcher.py'],
    codeSnippets: [
      {
        file: 'src/gsd/validation/fetchers/fdc_fetcher.py',
        lines: '260, 272, 367',
        language: 'python',
        code: `# Line 260 / 367 — KEY IN URL (leaks in logs, browser history, etc.)
params = {"api_key": self._api_key}

# Line 272 — raw exception string persisted (contains full URL with key!)
except requests.RequestException as exc:
    result["error"] = str(exc)   # ← KEY LEAKS HERE`,
      },
    ],
    proposals: [
      {
        title: 'Move key to header + scrub exceptions + rotate',
        description:
          'Move API key from params to request header (X-API-Key or Authorization). Scrub key from any exception string before persisting (regex replace api_key=VALUE or &api_key=VALUE). Rotate currently-exposed key. Add test asserting no persisted log/audit artifact contains the literal key value after forced fetch failure.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Environment-variable-only key + no URL embedding',
        description:
          'Require API key via environment variable (FDC_API_KEY), never accept it as constructor parameter. Never embed in URL. Send only via header. If env var missing → hard error, not silent. Most secure pattern but requires deployment configuration change.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Request-signing proxy service',
        description:
          'Deploy a lightweight proxy service that holds the API key and signs FDC requests. The fetcher calls the proxy, which adds the key and forwards to FDC. The key never appears in the gsd codebase at all. Most secure but requires infrastructure (proxy deployment, networking). Overkill for a single API key unless the system handles many external services.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 18,
    findingIds: ['D4'],
    title: 'Make audit trail append-only and tamper-evident',
    tier: 'tier2',
    severity: 'medium',
    category: 'Audit Integrity',
    summary:
      'audit_logger.py uses overwrite-mode logging ("w" at lines 44/49). Second-resolution timestamps collide (strftime %Y%m%dT%H%M%SZ). orchestrator._add_countermeasure_note:163 rewrites prior entries in "w" mode. No hash-chaining or append-only mechanism exists.',
    claim:
      'audit_logger.py:44/49 open("w"). Timestamp format %Y%m%dT%H%M%S (second-resolution). orchestrator.py:163 overwrites audit JSON. No hash-chaining.',
    evidence:
      'audit_logger.py:44 open(json_path,"w"), :49 open(md_path,"w"). :35 strftime("%Y%m%dT%H%M%SZ"). orchestrator.py:146-166 reads + overwrites audit JSON. 0 grep hits for hash_chain/append_only/sha256.',
    verificationStatus: 'confirmed-reading',
    verificationNote:
      'Category (b) — needs execution confirmation: run two events in same second and confirm overwrite.',
    dependsOn: 'Task 2',
    affectedFiles: ['src/gsd/validation/pipeline/audit_logger.py', 'src/gsd/validation/pipeline/orchestrator.py'],
    proposals: [
      {
        title: 'Append-only hash-chained log with millisecond timestamps',
        description:
          'Replace overwrite-mode logging with append-only file (open("a")). Add millisecond timestamps (%Y%m%dT%H%M%S%fZ). Each entry includes SHA-256 hash of (previous_hash + current_content), forming a hash chain. _add_countermeasure_note appends a new entry rather than rewriting. Test: assert prior bytes never change across two same-second events.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'SQLite audit database instead of JSON files',
        description:
          'Replace JSON audit files with a SQLite database (append-only by design — INSERT only, no UPDATE/DELETE). Each row auto-incremented with millisecond timestamp. Hash chain via row-level SHA-256. SQLite is zero-config, single-file, and tamper-evident via WAL mode. Migration from JSON is straightforward.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Git-backed audit trail (commit-per-event)',
        description:
          'Instead of separate audit files, write each audit event as a git commit to a dedicated audit branch. Git commits are append-only by design, hash-chained, and tamper-evident. Requires git access from the pipeline. Most robust integrity but requires git operations for every audit event (potentially slow).',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
    ],
  },
  {
    task: 19,
    findingIds: ['A1'],
    title: 'Fix lexicographic stage ordering',
    tier: 'tier2',
    severity: 'medium',
    category: 'LP Objective',
    summary:
      'solve_cascade\'s objective stages place the free (tie-break/category) stage in the MIDDLE, but the fix-optimum loop reads the final allocation after the last (fixed DER) stage. Category preferences and tie-break currently have zero effect on Level 1/2 allocations.',
    claim:
      'category_preferences (fix_optimum: false) sits in middle of objective_stages for both L1 and L2, not last. Fix-optimum loop reads post-last-stage allocation.',
    evidence:
      'lp_parameters_data.json objective_stages: category_preferences at middle position. solver.py fix_optimum loop: fixes if fix_opt=true, reads final allocation after last stage.',
    verificationStatus: 'confirmed-execution',
    verificationNote: 'Confirmed by user at config level.',
    dependsOn: 'None',
    affectedFiles: ['src/gsd/solver.py', 'data/lp_parameters_data.json'],
    proposals: [
      {
        title: 'Reorder stages: free tie-break/category last + add priority field',
        description:
          'Reorder objective_stages so the free (fix_optimum: false) tie-break/category stage runs last. Add explicit priority field per stage. Add build-time assertion that exactly one stage is non-fixed and it is last. Two tests: (1) category preference shifts allocation among ties, (2) later stages don\'t worsen fixed objectives beyond tolerance.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Keep current order but fix the allocation read position',
        description:
          'Instead of reordering stages, change the fix-optimum loop to read the allocation after the category-preference stage (the free stage), not after the final fixed stage. This gives category preferences effect without changing stage order. However, subsequent fixed stages may override the preference-optimized allocation, which is the whole point of lexicographic ordering — so this may not fully solve the problem.',
        effort: 'low',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Two-phase solve: strict objectives first, then preference optimization',
        description:
          'Split the solve into two phases: Phase 1 solves with all fixed objectives (nutrient adequacy, DER, safety). Phase 2 re-solves with category preferences as additional soft constraints, starting from Phase 1\'s solution. Phase 2 cannot worsen Phase 1 objectives. Cleaner than reordering stages within the existing cascade, but requires a new solver mode.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 20,
    findingIds: ['E2'],
    title: 'Regression test for nutrient_results correctness',
    tier: 'tier2',
    severity: 'medium',
    category: 'Test Coverage',
    summary:
      'Only current assertion on nutrient_results is assert len(...) >= 41 (test_cascade_integration.py:193). No assertion checks status=="deficient" or pct_of_min non-null. The most safety-relevant output in the system has zero correctness coverage.',
    claim:
      'Only len >= 41 assertion. 0 assertions for status/pct_of_min correctness. pct_of_min is always None in current code.',
    evidence:
      'test_cascade_integration.py:193 assert len >= 41. grep status.*deficient → 0. grep pct_of_min → 0 in test files. solver.py:1223 pct_of_min=None hardcoded.',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Task 4',
    affectedFiles: ['tests/test_cascade_integration.py', 'src/gsd/solver.py'],
    proposals: [
      {
        title: 'Comprehensive nutrient_results test suite (with Task 4)',
        description:
          'Land alongside Task 4: (1) deficient fixture → status=="below_min" + pct_of_min<100, (2) excess fixture → status=="above_sul" + pct_of_sul>100, (3) absent nutrient → status=="unknown" (never 0/"adequate"). Covers all three status categories. First-class deliverable, not afterthought.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Golden-file comparison test',
        description:
          'Create a golden JSON file with expected nutrient_results for a known ingredient selection. Test asserts actual results match golden within tolerance. Easy to maintain (update golden when behavior intentionally changes). But requires golden file management and may miss edge cases not in the golden selection.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Property-based testing with Hypothesis',
        description:
          'Use Hypothesis to generate random ingredient selections and assert invariant properties: (1) every nutrient has non-null status, (2) no status=="adequate" with null pct_of_min when min target exists, (3) value > 0 for present nutrients. Most thorough coverage but slow to run and requires Hypothesis dependency.',
        effort: 'high',
        risk: 'low',
        reversible: true,
      },
    ],
  },

  /* ── ADDITIONAL FINDING ── */
  {
    task: 'X1',
    findingIds: ['New'],
    title: 'Undeclared pydantic runtime dependency',
    tier: 'additional',
    severity: 'high',
    category: 'Dependencies',
    summary:
      'gsd.validation.schemas imports pydantic (from pydantic import BaseModel, Field at line 10). 11 classes inherit BaseModel. But pydantic is not declared in pyproject.toml or requirements.txt — only types-pydantic (a mypy stub) appears in CI. pip install -e . does not pull in pydantic. Task 2\'s fix won\'t make the validation package importable without also declaring pydantic.',
    claim:
      'schemas.py:10 imports pydantic. 11 BaseModel classes. pyproject.toml: only jsonschema, pulp, requests. requirements.txt: only jsonschema, pulp. CI installs types-pydantic but not pydantic runtime.',
    evidence:
      'schemas.py:10 from pydantic import BaseModel, Field. 11 class definitions inherit BaseModel. pyproject.toml deps: jsonschema>=4.17, pulp==3.3.2, requests>=2.28 — no pydantic. requirements.txt: jsonschema, pulp==3.3.2.',
    verificationStatus: 'confirmed-execution',
    verificationNote: 'Discovered during independent verification. Not in original roadmap.',
    dependsOn: 'Task 2 (sub-step)',
    affectedFiles: ['src/gsd/validation/schemas.py', 'pyproject.toml', 'requirements.txt'],
    codeSnippets: [
      {
        file: 'src/gsd/validation/schemas.py',
        lines: '10',
        language: 'python',
        code: `from pydantic import BaseModel, Field   # ← NOT in pyproject.toml!

class IngredientRecord(BaseModel):           # 11 classes inherit BaseModel
    ...
    
# pyproject.toml [project.dependencies]:
#   jsonschema>=4.17
#   pulp==3.3.2
#   requests>=2.28
# (NO pydantic)`,
      },
    ],
    proposals: [
      {
        title: 'Add pydantic>=2.0 to pyproject.toml dependencies',
        description:
          'Add pydantic>=2.0 to pyproject.toml [project.dependencies] and requirements.txt. This makes pip install -e . pull in pydantic, enabling schemas.py to import successfully. Minimal change, matches the code\'s actual dependency. Should be a sub-step of Task 2.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Replace pydantic with dataclasses + runtime validation',
        description:
          'Rewrite schemas.py\'s 11 BaseModel classes as @dataclass classes with a post_init validation method. Eliminates the undeclared dependency entirely. However, loses pydantic\'s rich validation ecosystem (custom validators, serialization, schema generation). Viable if the validation pipeline doesn\'t heavily rely on pydantic features.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Make pydantic optional with import guard',
        description:
          'Add an import guard: try: from pydantic import BaseModel, Field; except ImportError: BaseModel = object (fallback base). schemas.py works without pydantic but loses validation. Add pydantic as an optional extra: [project.optional-dependencies] validation = ["pydantic>=2.0"]. CI installs with pip install -e .[validation,test]. Allows running without pydantic but with reduced functionality.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },

  /* ── DEFERRED ITEMS ── */
  {
    task: 'D-E12',
    findingIds: ['E12'],
    title: 'solver.py 1,661-line god module',
    tier: 'deferred',
    severity: 'low',
    category: 'Maintainability',
    summary:
      'solver.py is exactly 1,661 lines. Maintenance hazard, not a correctness or safety hazard. Contains LP construction, solve logic, output contract, validation, cascade management — all in one file.',
    claim: 'solver.py is 1,661 lines.',
    evidence: 'wc -l solver.py → 1661.',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Deferred',
    affectedFiles: ['src/gsd/solver.py'],
    proposals: [
      {
        title: 'Incremental module extraction (solve_engine + output_contract)',
        description:
          'Extract build_output_contract (~200 lines) into nutrient_report.py. Extract build_lp_problem (~250 lines) into lp_builder.py. Extract solve_cascade orchestration into cascade_solver.py. Each extraction is independently reviewable. solver.py shrinks to ~600 lines (configuration + dispatch).',
        effort: 'high',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Class-based solver with method decomposition',
        description:
          'Keep solver.py as a single file but refactor into a DietSolver class with clear method boundaries: build_problem(), solve_level(), build_report(), validate(). Each method <150 lines. No import changes needed. Improves readability without module fragmentation.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Leave as-is, add section markers + navigation aid',
        description:
          'Add clear section comments ("""=== LP CONSTRUCTION ===""", etc.) and a top-level table of contents. No code changes. Minimal effort, improves navigation. The god-module problem is maintenance overhead, not a bug — defer until Tier 0-2 are proven closed.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 'D-C16',
    findingIds: ['C16'],
    title: 'Mojibake in 17/28 ingredient display_names',
    tier: 'deferred',
    severity: 'low',
    category: 'Data Quality',
    summary:
      'Exactly 17 of 28 ingredients have UTF-8 double-encoded Portuguese characters in display_name (Ãº for ú, Ã© for é, Ã§ for ç, etc.). The remaining 11 have clean ASCII names. Cosmetic issue — does not affect LP or safety surface.',
    claim: '17/28 display_names have mojibake. UTF-8 double-encoding of Portuguese.',
    evidence:
      'beef_muscle_raw: "MÃºsculo Bovino Cru". beef_heart_raw: "CoraÃ§Ã£o Bovino Cru". beef_liver_raw: "FÃ­gado Bovino Cru".',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Deferred',
    affectedFiles: ['data/DB_ingredientes.json'],
    proposals: [
      {
        title: 'One-shot UTF-8 re-encoding fix',
        description:
          'Write a script that reads each display_name, detects mojibake (bytes that look like UTF-8 read as Latin-1), and re-encodes correctly. Apply to all 28 ingredients. Single data fix, no code change.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Add display_name encoding validation to schema',
        description:
          'Add a CI check that validates display_names contain only printable Unicode characters with no double-encoding patterns. Prevents future mojibake. Run as part of --validate-db gate.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Source all display_names from a separate localization file',
        description:
          'Move display_names out of DB_ingredientes.json into a dedicated display_names.json with proper UTF-8 encoding. DB_ingredientes.json references by ingredient_id. Separates data from display, enables localization. But adds a new file that must stay synchronized.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
  {
    task: 'D-A12',
    findingIds: ['A12'],
    title: 'Bioavailability factors keyed by generic names (always 1.0)',
    tier: 'deferred',
    severity: 'low',
    category: 'Dead Code',
    summary:
      'formulation_rules.json has 5 bioavailability_factor entries keyed by generic names (kelp, raw_bone, viscera_organs) that never match real ingredient_ids (beef_muscle_raw, etc.). get_bioavailability_factor() does exact-match, so every lookup returns default 1.0. Bioavailability has zero effect on computed values.',
    claim: '5 entries keyed by generic names. 0 matches with actual ingredient_ids. Every lookup → 1.0.',
    evidence:
      'formulation_rules.json: kelp, raw_bone, viscera_organs. DB_ingredientes.json: beef_muscle_raw, chicken_liver_raw, etc. nutrition.py:245-260 exact match comparison.',
    verificationStatus: 'confirmed-execution',
    dependsOn: 'Deferred',
    affectedFiles: ['data/formulation_rules.json', 'src/gsd/nutrition.py'],
    proposals: [
      {
        title: 'Delete dead bioavailability machinery (DTSTTCPW)',
        description:
          'Per Part 2 recommendation: delete the 5 entries, the lookup function, and the factor application code. bioavailability is always 1.0, so removing it produces identical results with less code. If a real need emerges later, re-implement with correct ingredient_id matching. Interaction with L1 infeasibility should be checked as evidence in Task 8, not fixed independently.',
        effort: 'low',
        risk: 'low',
        reversible: true,
      },
      {
        title: 'Re-key bioavailability factors to match real ingredient_ids',
        description:
          'Replace generic keys (kelp, raw_bone) with actual ingredient_ids from DB_ingredientes.json. Add real bioavailability values from literature (e.g., iron bioavailability from muscle vs liver). Makes the machinery functional. But requires sourcing correct bioavailability values — don\'t guess.',
        effort: 'medium',
        risk: 'medium',
        reversible: true,
      },
      {
        title: 'Category-based bioavailability mapping',
        description:
          'Instead of per-ingredient matching, define bioavailability by ingredient category (muscle, organ, bone, plant). Each DB ingredient declares its category. The lookup matches category → factor. This is how the current generic names were intended to work but didn\'t. Requires adding category field to DB_ingredientes.',
        effort: 'medium',
        risk: 'low',
        reversible: true,
      },
    ],
  },
]

/* ─── HELPER CONSTANTS ─── */
export const severityConfig: Record<
  Severity,
  { label: string; color: string; bg: string; border: string; text: string; icon: string }
> = {
  critical: {
    label: 'Critical',
    color: 'red',
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-red-500/40',
    text: 'text-red-700 dark:text-red-300',
    icon: 'ShieldAlert',
  },
  high: {
    label: 'High',
    color: 'orange',
    bg: 'bg-orange-500/10 dark:bg-orange-500/20',
    border: 'border-orange-500/40',
    text: 'text-orange-700 dark:text-orange-300',
    icon: 'AlertTriangle',
  },
  medium: {
    label: 'Medium',
    color: 'yellow',
    bg: 'bg-yellow-500/10 dark:bg-yellow-500/20',
    border: 'border-yellow-500/40',
    text: 'text-yellow-700 dark:text-yellow-300',
    icon: 'Bug',
  },
  low: {
    label: 'Low',
    color: 'gray',
    bg: 'bg-gray-500/10 dark:bg-gray-500/20',
    border: 'border-gray-500/40',
    text: 'text-gray-700 dark:text-gray-300',
    icon: 'FileWarning',
  },
}

export const verificationConfig: Record<
  VerificationStatus,
  { label: string; bg: string; text: string; icon: string }
> = {
  'confirmed-execution': {
    label: 'Execution',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    icon: 'CheckCircle2',
  },
  'confirmed-reading': {
    label: 'Reading',
    bg: 'bg-sky-500/15',
    text: 'text-sky-700 dark:text-sky-300',
    icon: 'Eye',
  },
  'confirmed-logical': {
    label: 'Logical',
    bg: 'bg-teal-500/15',
    text: 'text-teal-700 dark:text-teal-300',
    icon: 'Scale',
  },
  'needs-execution-confirmation': {
    label: 'Pending',
    bg: 'bg-amber-500/15',
    text: 'text-amber-700 dark:text-amber-300',
    icon: 'ShieldQuestion',
  },
  partial: {
    label: 'Partial',
    bg: 'bg-yellow-500/15',
    text: 'text-yellow-700 dark:text-yellow-300',
    icon: 'ChevronDown',
  },
}

export const tierLabels: Record<Tier, { short: string; full: string; color: string }> = {
  tier0: { short: 'Tier 0', full: 'Tier 0 — Immediate Threats', color: 'red' },
  tier1: { short: 'Tier 1', full: 'Tier 1 — Structural Causes', color: 'orange' },
  tier2: { short: 'Tier 2', full: 'Tier 2 — Guardrails', color: 'yellow' },
  deferred: { short: 'Deferred', full: 'Deferred', color: 'gray' },
  additional: { short: 'Additional', full: 'Additional Findings', color: 'emerald' },
}

export const effortConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Effort', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  medium: { label: 'Medium Effort', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30' },
  high: { label: 'High Effort', color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
}

export const riskConfig: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Risk', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
  medium: { label: 'Medium Risk', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30' },
  high: { label: 'High Risk', color: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30' },
}

/* Category color palette for charts and badges */
export const categoryColors: Record<string, string> = {
  'Safety Guard': '#dc2626',
  'Module Integrity': '#b91c1c',
  'LP Constraint': '#ea580c',
  'Output Contract': '#f97316',
  'Recommendation Logic': '#f59e0b',
  'Nutrient Bounds': '#d97706',
  'Energy Model': '#ca8a04',
  'Solver Diagnostic': '#65a30d',
  'Data Schema': '#16a34a',
  'CI / Schema': '#0d9488',
  'Dead Code': '#0891b2',
  'Data Validation': '#0284c7',
  'Pipeline Integrity': '#2563eb',
  'Pipeline Security': '#4f46e5',
  'CI': '#7c3aed',
  'Security': '#9333ea',
  'Audit Integrity': '#a21caf',
  'LP Objective': '#c026d3',
  'Test Coverage': '#db2777',
  'Dependencies': '#e11d48',
  'Maintainability': '#64748b',
  'Data Quality': '#6b7280',
}

export function getCategoryColor(category: string): string {
  return categoryColors[category] ?? '#6b7280'
}

/* Compute affected files statistics */
export function getAffectedFilesStats() {
  const fileMap: Record<string, { count: number; severities: Record<Severity, number>; findings: (number | string)[] }> = {}
  FINDINGS.forEach(f => {
    f.affectedFiles.forEach(file => {
      if (!fileMap[file]) {
        fileMap[file] = { count: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 }, findings: [] }
      }
      fileMap[file].count++
      fileMap[file].severities[f.severity]++
      fileMap[file].findings.push(f.task)
    })
  })
  return Object.entries(fileMap)
    .map(([file, stats]) => ({ file, ...stats }))
    .sort((a, b) => b.count - a.count)
}

/* Compute category statistics */
export function getCategoryStats() {
  const catMap: Record<string, number> = {}
  FINDINGS.forEach(f => {
    catMap[f.category] = (catMap[f.category] ?? 0) + 1
  })
  return Object.entries(catMap)
    .map(([category, count]) => ({ category, count, color: getCategoryColor(category) }))
    .sort((a, b) => b.count - a.count)
}

/* Compute tier × severity matrix */
export function getTierSeverityMatrix() {
  const matrix: Record<Tier, Record<Severity, number>> = {
    tier0: { critical: 0, high: 0, medium: 0, low: 0 },
    tier1: { critical: 0, high: 0, medium: 0, low: 0 },
    tier2: { critical: 0, high: 0, medium: 0, low: 0 },
    additional: { critical: 0, high: 0, medium: 0, low: 0 },
    deferred: { critical: 0, high: 0, medium: 0, low: 0 },
  }
  FINDINGS.forEach(f => { matrix[f.tier][f.severity]++ })
  return matrix
}

/* ─── AUDIT PROGRESS TRACKING ─── */
export type AuditStatus = 'not-started' | 'in-progress' | 'fixed' | 'wont-fix'

export const auditStatusConfig: Record<
  AuditStatus,
  {
    label: string
    shortLabel: string
    icon: string
    color: string // hex for charts
    badgeClass: string // tailwind classes
    dotClass: string
    description: string
  }
> = {
  'not-started': {
    label: 'Not Started',
    shortLabel: 'Todo',
    icon: 'Circle',
    color: '#94a3b8',
    badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
    dotClass: 'bg-slate-400',
    description: 'No remediation work started yet',
  },
  'in-progress': {
    label: 'In Progress',
    shortLabel: 'Doing',
    icon: 'LoaderCircle',
    color: '#3b82f6',
    badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
    dotClass: 'bg-blue-500 animate-pulse',
    description: 'Remediation is currently underway',
  },
  fixed: {
    label: 'Fixed',
    shortLabel: 'Done',
    icon: 'CheckCircle2',
    color: '#10b981',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    dotClass: 'bg-emerald-500',
    description: 'Finding has been remediated and verified',
  },
  'wont-fix': {
    label: "Won't Fix",
    shortLabel: 'Skip',
    icon: 'XCircle',
    color: '#ef4444',
    badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
    dotClass: 'bg-red-500',
    description: 'Remediation will not be performed (documented decision)',
  },
}

export const AUDIT_STATUS_ORDER: AuditStatus[] = [
  'not-started', 'in-progress', 'fixed', 'wont-fix',
]

/* ─── RISK MATRIX (severity × impact) ─── */
/* Impact is derived from tier — tier0 = highest impact, deferred = lowest */
export const tierImpact: Record<Tier, number> = {
  tier0: 3,      // critical impact
  tier1: 2,      // high impact
  tier2: 1,      // medium impact
  additional: 1, // medium impact (additional findings are real issues)
  deferred: 0,   // low impact (deferred to later phase)
}

export const severityWeight: Record<Severity, number> = {
  critical: 3, // critical severity
  high: 2,     // high severity
  medium: 1,   // medium severity
  low: 0,      // low severity
}

export const impactLabels = ['Low Impact', 'Medium Impact', 'High Impact', 'Critical Impact']
export const severityAxisLabels = ['Low', 'Medium', 'High', 'Critical']

/* Get risk score: 0 (low) to 9 (highest) */
export function getRiskScore(severity: Severity, tier: Tier): number {
  return severityWeight[severity] + tierImpact[tier]
}

/* Risk level classification for color coding */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 6) return 'critical'
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

export const riskLevelConfig: Record<RiskLevel, { color: string; bgClass: string; label: string }> = {
  low: { color: '#10b981', bgClass: 'bg-emerald-500/20', label: 'Low Risk' },
  medium: { color: '#eab308', bgClass: 'bg-yellow-500/20', label: 'Medium Risk' },
  high: { color: '#f97316', bgClass: 'bg-orange-500/20', label: 'High Risk' },
  critical: { color: '#dc2626', bgClass: 'bg-red-500/20', label: 'Critical Risk' },
}

/* Build a 4×4 risk matrix: rows = severity (low→critical), cols = impact (low→critical) */
export function getRiskMatrix() {
  // 4×4 grid indexed [severityWeight][tierImpact]
  const grid: Record<string, { severity: Severity; impactLevel: number; findings: Finding[] }> = {}
  ;(['low', 'medium', 'high', 'critical'] as Severity[]).forEach(s => {
    ;([0, 1, 2, 3]).forEach(imp => {
      grid[`${severityWeight[s]}-${imp}`] = { severity: s, impactLevel: imp, findings: [] }
    })
  })
  FINDINGS.forEach(f => {
    const key = `${severityWeight[f.severity]}-${tierImpact[f.tier]}`
    grid[key].findings.push(f)
  })
  return grid
}

/* ─── COMPARISON HELPERS ─── */
/* For comparing two findings side-by-side */
export interface ComparisonField {
  label: string
  getValue: (f: Finding) => string
  icon?: string
}

export const comparisonFields: ComparisonField[] = [
  { label: 'Task', icon: 'Hash', getValue: f => `Task ${f.task}` },
  { label: 'Title', getValue: f => f.title },
  { label: 'Tier', icon: 'Layers', getValue: f => tierLabels[f.tier].full },
  { label: 'Severity', icon: 'ShieldAlert', getValue: f => severityConfig[f.severity].label },
  { label: 'Category', icon: 'FolderTree', getValue: f => f.category },
  { label: 'Depends on', icon: 'Lock', getValue: f => f.dependsOn },
  { label: 'Verification', icon: 'CheckCircle2', getValue: f => verificationConfig[f.verificationStatus].label },
  { label: 'Finding IDs', icon: 'Tag', getValue: f => f.findingIds.join(', ') },
  { label: 'Affected Files', icon: 'FileText', getValue: f => `${f.affectedFiles.length} file(s)` },
  { label: 'Proposals', icon: 'Wrench', getValue: f => `${f.proposals.length} solution(s)` },
  { label: 'Risk Score', icon: 'Gauge', getValue: f => {
    const score = getRiskScore(f.severity, f.tier)
    const level = getRiskLevel(score)
    return `${score}/6 — ${riskLevelConfig[level].label}`
  } },
  { label: 'Summary', getValue: f => f.summary },
]

/* ─── EFFORT ESTIMATION ─── */
/* Rough estimate of person-hours per effort level */
export const effortHours: Record<'low' | 'medium' | 'high', number> = {
  low: 4,     // ~half day
  medium: 16, // ~2-3 days
  high: 40,   // ~1 week
}

export function getTotalEffortHours(): number {
  // Use the lowest-effort proposal per finding as a baseline estimate
  return FINDINGS.reduce((sum, f) => {
    const efforts = f.proposals.map(p => effortHours[p.effort])
    return sum + Math.min(...efforts)
  }, 0)
}

export function getEffortBreakdown() {
  const buckets = { low: 0, medium: 0, high: 0 }
  FINDINGS.forEach(f => {
    // Pick the recommended (lowest effort + lowest risk) proposal
    const sorted = f.proposals.slice().sort((a, b) => {
      const effOrder = { low: 0, medium: 1, high: 2 }
      const riskOrder = { low: 0, medium: 1, high: 2 }
      const effDiff = effOrder[a.effort] - effOrder[b.effort]
      if (effDiff !== 0) return effDiff
      return riskOrder[a.risk] - riskOrder[b.risk]
    })
    if (sorted[0]) buckets[sorted[0].effort]++
  })
  return buckets
}

/* ═══════════════════════════════════════════════════════════════
   SOLUTION ANALYSIS LAYER
   Comprehensive per-finding best proposal analysis, unified execution
   modules, gate-blocked findings, and deferred items.
   ═══════════════════════════════════════════════════════════════ */

/* ─── TYPES ─── */

export type UnifiedModuleId =
  | 'nutrient_report'
  | 'module_integrity'
  | 'lp_solver_refactor'
  | 'pipeline_integrity'
  | 'data_integrity'

export interface BestProposalAnalysis {
  /** Index (0,1,2) into the finding's proposals array — best standalone solution */
  bestSoloIndex: number
  /** 1-2 sentence explanation of why this is the best solo choice, referencing the actual pipeline */
  bestSoloReason: string
  /** Optional note if combining with another proposal or finding creates a better outcome */
  hybridNote?: string
  /** Which unified execution module this finding belongs to */
  unifiedModuleId: UnifiedModuleId
}

export interface UnifiedExecutionModule {
  id: UnifiedModuleId
  title: string
  subtitle: string
  addresses: (number | string)[]
  coreIdea: string
  fixes: string[]
  effort: 'low' | 'medium' | 'high'
  risk: 'low' | 'medium' | 'high'
  keyInsight: string
}

export interface G3BlockedFinding {
  task: number | string
  title: string
  canShipNow: string
  needsReview: string
}

export interface DeferredItem {
  task: number | string
  title: string
  bestSoloIndex: number
  bestSoloReason: string
  note: string
}

/* ─── 1. PER-FINDING BEST PROPOSAL ANALYSIS ─── */

export const BEST_PROPOSAL_ANALYSIS: Record<number | string, BestProposalAnalysis> = {
  1: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (safety_guard.py) is the best standalone fix — a 3-line assertion wrapper that independently checks all trip conditions and forces DO_NOT_FEED on violation. It re-detects each defect until the underlying fixes land.',
    hybridNote:
      'P1 serves as a temporary guard → becomes a thin assertion wrapper once nutrient_report.py ships (Module 1). The guard is 3 lines: assert not any(r.status=="adequate" and r.pct_of_min is None for r in results).',
    unifiedModuleId: 'nutrient_report',
  },
  2: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (create _shared.py + pydantic) is the clear winner — it directly fixes the ModuleNotFoundError by creating the missing module and declaring the undeclared dependency. P2 (inline) creates code duplication across 4 validators. P3 (dataclasses) loses pydantic\'s runtime validation.',
    unifiedModuleId: 'module_integrity',
  },
  3: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (escalating penalties) is the best solo choice because Task 8 shows L1 is structurally infeasible — removing slack entirely (P1) would make the solver completely unsolvable. P2 preserves feasibility while driving antagonism slack toward zero with exponential penalty scaling.',
    hybridNote:
      'Combines with Task 8\'s IIS diagnostic (P2 first, then P1) and Task 19\'s stage reorder. All three are in solver.py\'s LP construction — one refactor addresses all.',
    unifiedModuleId: 'lp_solver_refactor',
  },
  4: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (patch from compute_gaps first) is the safest quick fix with minimal code change — it patches build_output_contract to use real computed values from the existing compute_gaps pipeline. But the ARCHITECTURAL TARGET is P3 (separate module, index 2) — this is the key to the entire unified solution.',
    hybridNote:
      'Patch first for safety (P2), then extract into nutrient_report.py (P3). This is the single highest-impact change in the entire audit — it\'s the ROOT CAUSE of 5/7 critical findings.',
    unifiedModuleId: 'nutrient_report',
  },
  5: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (three-band scoring) is simple and clinically intuitive — it catches the 631% Ca:Mg violation by mapping real pct_of_min values into adequate/marginal/deficient bands. It naturally derives from nutrient_report.py\'s real computed values.',
    hybridNote:
      'Derives directly from nutrient_report.py\'s real pct_of_min values. Without real data (Task 4), three-band scoring would still be fictional.',
    unifiedModuleId: 'nutrient_report',
  },
  6: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (computed ceiling from DER) auto-adjusts with energy level and age, tying into Task 7\'s growth-energy schedule. The mechanism can ship now, but the exact ceiling values PENDING G3 (veterinary review).',
    unifiedModuleId: 'nutrient_report',
  },
  7: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (swap labels + adjust k) is the most obvious fix — the labels in constraints.json are literally inverted ("max" on a minimum constraint and "min" on a maximum). Swapping them corrects the inverted logic immediately.',
    hybridNote:
      'The mechanism (label swap) can ship now. The exact coefficient values for growth-energy adjustment need G3 (veterinary review). P1/P3 are the architectural targets after G3.',
    unifiedModuleId: 'nutrient_report',
  },
  8: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (relax-and-record diagnostic) provides quick triage first — it relaxes hard constraints incrementally and records which ones cause infeasibility. Then P1 (IIS mode) provides precision diagnostics. The result directly informs Task 3 and Task 19.',
    hybridNote:
      'The diagnostic result directly informs Task 3\'s penalty tuning and Task 19\'s stage reorder. All three are in solver.py\'s LP construction.',
    unifiedModuleId: 'lp_solver_refactor',
  },
  9: {
    bestSoloIndex: 2,
    bestSoloReason:
      'P3 (automated reconciliation tool) is the most practical — it reconciles the current messy key-set mismatch without forcing one naming scheme. It generates a mapping table between constraint IDs, target IDs, and DB IDs. P1 (unified naming) is the long-term target.',
    hybridNote:
      'P1 (unified naming) is the architectural target, but P3 is the pragmatic bridge. After schema repair (Task 10), reconciliation becomes easier.',
    unifiedModuleId: 'data_integrity',
  },
  10: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (repair schemas + CI gate) is the direct fix — repair both broken JSON schemas (DB_ingredientes.json and constraints.json) and add a CI schema-gate job that validates all data files against their schemas. P2 (schema-from-data) has a circular dependency with Task 9.',
    unifiedModuleId: 'data_integrity',
  },
  11: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (delete + remove loaders) is straightforward — objective_weights.json is dead code (solver.py never loads it). git preserves history. Just delete the file and remove the 2 loader references.',
    unifiedModuleId: 'data_integrity',
  },
  12: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (verify after Task 4) is simple and direct — wait for nutrient_report.py to produce real arginine values, then verify they appear in the output contract. No independent code change needed.',
    hybridNote:
      'P3 (load-time assertion) is the elegant generalization — add an assertion at solver load time that arginine is present in targets. But this depends on Task 4\'s nutrient_report.py first.',
    unifiedModuleId: 'nutrient_report',
  },
  13: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (rollback on commit failure) is a 5-line fix: if git commit fails, restore the backup file. Simple, safe, and prevents the current behavior where a failed commit leaves the repository in an inconsistent state.',
    unifiedModuleId: 'pipeline_integrity',
  },
  14: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (git-identity-bound marker) uses existing git infrastructure — it stamps each result file with the git identity (author + commit hash) that produced it, creating an audit trail that ties results to the exact pipeline version.',
    unifiedModuleId: 'pipeline_integrity',
  },
  15: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (importlib smoke test + CI) is the most visible and reliable approach — it uses importlib.import_module to verify every gsd.* module can be imported without error, and wires it as a required CI job. This would have caught the _shared.py ModuleNotFoundError immediately.',
    unifiedModuleId: 'module_integrity',
  },
  16: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (schema-gate + matrix) makes the schema validation a mandatory CI gate — every PR must pass jsonschema validation on all data files. This prevents broken schemas from ever reaching the solver again.',
    unifiedModuleId: 'data_integrity',
  },
  17: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (header + scrub + rotate) is a 3-line code change — move the API key from URL query parameter to HTTP header, scrub API keys from exception messages, and implement key rotation. Minimal change, maximum security improvement.',
    unifiedModuleId: 'pipeline_integrity',
  },
  18: {
    bestSoloIndex: 1,
    bestSoloReason:
      'P2 (SQLite audit) is naturally append-only and zero-config — SQLite provides structured queryability, crash safety (WAL mode), and atomic writes. No need for JSON file management or custom append logic.',
    unifiedModuleId: 'pipeline_integrity',
  },
  19: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (reorder stages) is a config change, not a code rewrite — move the free-feeding objective stage to run last in the cascade, so the solver first satisfies safety constraints before optimizing for cost. Simple reorder of objective_stages in solver.py.',
    hybridNote:
      'Combines with Task 3\'s penalty tuning and Task 8\'s IIS diagnostics. All three affect the LP construction in solver.py.',
    unifiedModuleId: 'lp_solver_refactor',
  },
  20: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (comprehensive test with Task 4) is simple and direct — write integration tests that verify the output contract contains real nutrient values (not placeholders). Depends on Task 4\'s nutrient_report.py providing real data.',
    unifiedModuleId: 'nutrient_report',
  },
  X1: {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (add pydantic>=2.0) — just declare the dependency in pyproject.toml. This is the same fix as Task 2\'s P1. The dependency is already used at runtime but never declared, causing CI-only environments to fail.',
    unifiedModuleId: 'module_integrity',
  },
  'D-E12': {
    bestSoloIndex: 2,
    bestSoloReason:
      'P3 (section markers first) is the phased approach: add section markers → class decomposition → module extraction. This incremental strategy avoids a big-bang refactor of the 640-line solver.py.',
    unifiedModuleId: 'nutrient_report', // tagged for context but doesn't unify
  },
  'D-C16': {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (one-shot re-encode) is a single script that re-encodes all non-UTF-8 data files to UTF-8. One script, one fix, zero ongoing maintenance.',
    unifiedModuleId: 'data_integrity', // tagged for context but doesn't unify
  },
  'D-A12': {
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (delete dead machinery) — the antagonism_multiplier always returns 1.0 regardless of input. DTSTTCPW (Do The Simplest Thing That Could Possibly Work): delete the dead code.',
    unifiedModuleId: 'data_integrity', // tagged for context but doesn't unify
  },
}

/* ─── 2. UNIFIED EXECUTION MODULES ─── */

export const UNIFIED_EXECUTION_MODULES: UnifiedExecutionModule[] = [
  {
    id: 'nutrient_report',
    title: 'The Output Contract Fix',
    subtitle: 'nutrient_report.py — compute real results from targets + SUL data',
    addresses: [1, 4, 5, 12, 20],
    coreIdea:
      'Create nutrient_report.py (~150 lines) that computes real nutrient results from targets and SUL data, replacing the hardcoded "adequate" placeholder in build_output_contract. This single module simultaneously fixes 5 findings: the fail-closed safety guard (Task 1) gets real data to guard on, the placeholder output (Task 4) becomes real computation, three-band severity scoring (Task 5) derives from real pct_of_min values, arginine display (Task 12) reports real values, and output testability (Task 20) becomes possible.',
    fixes: [
      'Fixes the hardcoded "adequate" placeholder — real computation replaces fictional status (Task 4)',
      'Enables fail-closed safety guard because real pct_of_min data exists to guard on (Task 1)',
      'Enables three-band severity scoring → real feeding recommendations from actual values (Task 5)',
      'Reports real arginine values instead of None (Task 12)',
      'Makes output testable — integration tests can verify real data appears (Task 20)',
    ],
    effort: 'medium',
    risk: 'medium',
    keyInsight:
      'The placeholder output is the ROOT CAUSE of 5/7 critical findings. Fixing it is the single highest-impact change in the entire audit.',
  },
  {
    id: 'module_integrity',
    title: 'The Import Fix',
    subtitle: '_shared.py + pydantic declaration + import smoke test — one commit',
    addresses: [2, 'X1', 15],
    coreIdea:
      'Create the missing _shared.py module with extract_db_value, declare pydantic>=2.0 in pyproject.toml, and add an importlib-based import smoke test in CI. One commit fixes all three findings — they share the same root cause (missing modules and undeclared dependencies).',
    fixes: [
      'Creates the missing _shared.py module with extract_db_value function (Task 2)',
      'Declares pydantic>=2.0 in pyproject.toml dependencies (Task 2 + X1)',
      'Adds importlib-based import smoke test as required CI job (Task 15)',
    ],
    effort: 'low',
    risk: 'low',
    keyInsight:
      'All three findings share the same root cause: missing modules/dependencies. One commit fixes all.',
  },
  {
    id: 'lp_solver_refactor',
    title: 'The Solver Hardening',
    subtitle: 'Escalating penalties + reorder objective stages + IIS diagnostic mode',
    addresses: [3, 8, 19],
    coreIdea:
      'Escalating penalty weights for antagonism slack at L2/L3 (preserving feasibility while driving slack toward zero), reorder objective_stages so the free stage runs last (safety-first cascade), and add a --diagnose-infeasibility IIS mode for precision diagnostics. All three changes are in solver.py\'s LP construction — one refactor addresses all.',
    fixes: [
      'Escalating penalty weights for antagonism slack at L2/L3 (Task 3 — P2 hybrid)',
      'Reorder objective_stages so free stage runs last (Task 19 — P1)',
      'Add --diagnose-infeasibility IIS diagnostic mode (Task 8 — P2 first, P1 later)',
    ],
    effort: 'medium',
    risk: 'low',
    keyInsight:
      'All three are in solver.py\'s LP construction. One refactor addresses all.',
  },
  {
    id: 'pipeline_integrity',
    title: 'The Validation Pipeline Fix',
    subtitle: 'Four targeted fixes in the validation pipeline — one integrity pass commit',
    addresses: [13, 14, 17, 18],
    coreIdea:
      'Four independent but related fixes that can ship as one "pipeline integrity pass" commit: raise GitError on failure + rollback on commit failure, add git-identity-bound circuit breaker gate, move API key to header + scrub exceptions, and replace JSON audit with SQLite.',
    fixes: [
      'GitError raised on failure + rollback on commit failure (Task 13 — P2)',
      'Git-identity-bound circuit breaker gate (Task 14 — P1)',
      'Move API key to header + scrub exceptions (Task 17 — P1)',
      'Replace JSON audit with SQLite (Task 18 — P2)',
    ],
    effort: 'medium',
    risk: 'low',
    keyInsight:
      'Independent fixes but can ship as one \'pipeline integrity pass\' commit.',
  },
  {
    id: 'data_integrity',
    title: 'The Schema & Registry Fix',
    subtitle: 'Schema repair + nutrient reconciliation + delete dead code + CI gates',
    addresses: [9, 10, 11, 16],
    coreIdea:
      'Repair both broken schemas and add a CI schema-gate, create an automated key-set reconciliation tool, delete objective_weights.json dead code, and add schema-gate as a required CI job. All data integrity problems — fix schemas, reconcile names, delete dead weight, gate CI.',
    fixes: [
      'Repair both broken schemas + add CI schema-gate (Task 10 — P1)',
      'Automated key-set reconciliation tool (Task 9 — P3)',
      'Delete objective_weights.json dead code (Task 11 — P1)',
      'Add schema-gate as required CI job (Task 16 — P1)',
    ],
    effort: 'medium',
    risk: 'low',
    keyInsight:
      'All data integrity problems. Fix schemas → reconcile names → delete dead weight → gate CI.',
  },
]

/* ─── 3. FINDINGS BLOCKED ON GATE G3 ─── */
// SEED-ONLY — This data is seeded into AuditConfig (key: g3_blocked) on project creation.
// Runtime reads should always come from AuditConfig, not this constant.

export const G3_BLOCKED_FINDINGS: G3BlockedFinding[] = [
  {
    task: 6,
    title: 'Add absolute Ca ceiling',
    canShipNow:
      'The mechanism (computed ceiling from DER) can ship now — the code that calculates a ceiling from daily energy requirements is implementable without veterinary input.',
    needsReview:
      'The exact ceiling VALUES (mg Ca per kg body weight per day) require veterinary review at Gate G3. Ship the mechanism with placeholder values marked PENDING_G3.',
  },
  {
    task: 7,
    title: 'Fix inverted Ca constraint labels',
    canShipNow:
      'The label swap mechanism can ship now — "max" and "min" are literally inverted in constraints.json. Swapping them corrects the logic regardless of the exact coefficient values.',
    needsReview:
      'The exact growth-energy adjustment coefficient (k) values require veterinary review at Gate G3. Ship the label swap with current k values, adjust k after review.',
  },
]

/* ─── 4. DEFERRED INDEPENDENT ITEMS ─── */

export const DEFERRED_INDEPENDENT: DeferredItem[] = [
  {
    task: 'D-E12',
    title: 'Split solver.py into modules',
    bestSoloIndex: 2,
    bestSoloReason:
      'P3 (section markers first) is the phased approach: add section markers → class decomposition → module extraction. Incremental strategy avoids a big-bang refactor of the 640-line solver.py.',
    note: 'Does not unify with any execution module. Purely a code organization improvement — defer to post-critical phase.',
  },
  {
    task: 'D-C16',
    title: 'Fix encoding inconsistencies',
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (one-shot re-encode) is a single script that re-encodes all non-UTF-8 data files to UTF-8. One script, one fix, zero ongoing maintenance.',
    note: 'Does not unify with any execution module. Independent data hygiene fix — defer to post-critical phase.',
  },
  {
    task: 'D-A12',
    title: 'Delete antagonism_multiplier dead code',
    bestSoloIndex: 0,
    bestSoloReason:
      'P1 (delete dead machinery) — the antagonism_multiplier always returns 1.0 regardless of input. DTSTTCPW: delete the dead code.',
    note: 'Does not unify with any execution module. Pure dead code removal — defer to post-critical phase.',
  },
]

/* ─── 5. THE ELEGANT INSIGHT ─── */

export const ELEGANT_INSIGHT =
  'The hardcoded placeholder output in build_output_contract (solver.py:1203-1227) is the ROOT CAUSE of 5 out of 7 critical findings. A single ~150-line nutrient_report.py module would simultaneously fix the fail-closed gate, the placeholder, the severity-blind recommendation, the arginine display, and the test coverage gap. This is the highest-ROI single change in the entire audit.'

/* ─── HELPER: Get unified module for a finding ─── */
export function getUnifiedModuleForTask(task: number | string): UnifiedExecutionModule | undefined {
  const analysis = BEST_PROPOSAL_ANALYSIS[task]
  if (!analysis) return undefined
  return UNIFIED_EXECUTION_MODULES.find(m => m.id === analysis.unifiedModuleId)
}

/* ─── HELPER: Get all findings belonging to a module ─── */
export function getFindingsForModule(moduleId: UnifiedModuleId): Finding[] {
  const execModule = UNIFIED_EXECUTION_MODULES.find(m => m.id === moduleId)
  if (!execModule) return []
  return FINDINGS.filter(f => execModule.addresses.includes(f.task))
}

/* ─── HELPER: Get best proposal for a finding ─── */
export function getBestProposalForTask(task: number | string): Proposal | undefined {
  const analysis = BEST_PROPOSAL_ANALYSIS[task]
  if (!analysis) return undefined
  const finding = FINDINGS.find(f => f.task === task)
  if (!finding) return undefined
  return finding.proposals[analysis.bestSoloIndex]
}

/* ─── HELPER: Module coverage stats ─── */
export interface ModuleCoverageStats {
  moduleId: UnifiedModuleId
  title: string
  findingCount: number
  criticalCount: number
  totalEffortHours: number
  findingTasks: (number | string)[]
}

export function getModuleCoverageStats(): ModuleCoverageStats[] {
  return UNIFIED_EXECUTION_MODULES.map(execModule => {
    const findings = getFindingsForModule(execModule.id)
    return {
      moduleId: execModule.id,
      title: execModule.title,
      findingCount: findings.length,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      totalEffortHours: effortHours[execModule.effort],
      findingTasks: execModule.addresses,
    }
  })
}
