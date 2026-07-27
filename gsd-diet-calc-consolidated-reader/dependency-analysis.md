# Dependency Analysis — gsd-diet-calc v10.4.0

**Source corpus:** the 10-file `consolidated-docs/` set (BUG-DEPENDENCY-MAP, PART-1 Diagnosis, PART-2 Treatment, PART-3 Synthesis, PART-4 Meta-Critique, and 5 appendices: ID-KEY, SAFETY-PROCESS, VERIFICATION-LOG, GLOSSARY, PUBLIC-HEALTH-AND-REGULATORY). Every ID, severity, dependency, and edge in this document is grep-verified against those source files; "not found in source" is recorded honestly where the documents are silent.

**Verification anchor:** every runtime claim is anchored to commit `c932a21` (2026-07-25) via `APPENDIX-VERIFICATION-LOG.md`.

**Scope of this analysis.** This is the deep cross-reference of bugs → tasks → gates → edges → critical-path → UI layout. It supersedes the prior `src/lib/dependency-graph.ts` only insofar as it documents discrepancies that should be folded back into the next revision of that file.

---

## Section 1 — Bug Catalog Complete Cross-Reference

The diagnosis catalogs **77 deduplicated findings** (9 Critical / 27 High / 30 Medium / 11 Low) across 5 subsystems (A/B/C/D/E). Six additional empirically-cleared hypotheses are *not* defects (Part 1 §10.2). The legacy self-review carried **9 legacy IDs (`R-01..R-09`)** and **7 governance deviations (`R1..R7`)** — these are not new findings; they alias the A/B/C/D/E findings. Where the same defect carries multiple IDs (e.g. `A3 / E1 / E2 / R4 / R-04 / R-09`), all aliases are listed in the same row.

The total ID surface is therefore: **A1–A20** (20 IDs) · **B1–B18** (18 IDs) · **C1–C22** (22 IDs) · **D1–D22** (22 IDs) · **E1–E23** (23 IDs) · **R-01..R-09** (9 legacy) · **R1..R7** (7 governance) = **121 distinct IDs** collapsing to **77 unique defects**.

### 1.1 A-series — LP / OR Solver (A1–A20)

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **A1** (LP-F1) | Critical (P0) | LP | Lexicographic stage order inverted (L1/L2 swapped; non-fixed category/tie-break stage in middle, has zero effect) | **B10** | Part 1 §3.5, §9.2; BUG-MAP §A.1 #10 |
| **A2** (LP-F2, A14, governance R1, legacy R-01) | Critical (P0) | LP | 5 mineral-antagonism constraints (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg) declared `HARD_FAIL_INFEASIBLE` but soft (slack-penalized L1, unpenalized L2/L3) | **B2a** (harden) + **B2b** (severity visibility) | Part 1 §3.7, §9.1; BUG-MAP §A.1 #1 |
| **A3** (LP-F5, E1, E2, governance R4, legacy R-04 / R-09) | Critical (P0) | Solver / contract / tests | `nutrient_results` hardcoded `"adequate"` with `pct_of_min:None` for every nutrient — the fake output layer | **B1** | Part 1 §3.7, §9.1; BUG-MAP §A.1 #2 |
| **A4** | High (P1) | LP | Antagonism penalty unit mismatch (~500×) — raw-gram penalty dominates normalized objective | **C1** | Part 1 §3.4; BUG-MAP §A.2 |
| **A5** (LP-F4) | Critical→High (P0) | LP / config | `objective_weights.json` (322 lines, 29 weights) never read by `solver.py` (0 refs); real objective is `CRITICALITY_WEIGHT` | **B9** (G2 = DELETE) | Part 1 §2.6, §3.5; BUG-MAP §A.1 #9 |
| **A6** (governance R5) | High (P1) | Solver | Recommendation is config-driven (cascade-level only), ignores realized violation magnitudes; `_MIN` IDs forced `adequacy_soft` | **B2b** | Part 1 §3.7; BUG-MAP §A.2 |
| **A7** | High (P1) | LP | Floor-relaxation fallback documented but unimplemented; `validate_output` check #9 is dead | **C16** | Part 1 §3; BUG-MAP §A.2 |
| **A8** (E3, F-CONTRACT-2) | High (P1) | Solver | All non-`Optimal` statuses collapse to `"infeasible"` (fail-closed but masks Unbounded/Undefined/timeout; discards MILP incumbents) | **C2** | Part 1 §1.4; BUG-MAP §A.2 |
| **A9** | Medium (P2) | LP | Big-M fallback 10000 g weakens MILP relaxation | P2/P3 debt — *not in B0–R5 task catalog* | Part 1 §10.1 |
| **A10** (LP-F10) | Medium (P2) | LP | Tie-break auto-scaled below tolerance can become numerically useless | P2 debt | Part 1 §2.7, §10.1 |
| **A11** | Medium (P2) | LP | Sanity assertion ignores bioavailability factor | P2 debt | Part 1 §2.3, §10.1 |
| **A12** (C21) | Medium (P2) | LP / Data | Bioavailability factors keyed by generic names never match real `ingredient_id`s → `bio` always 1.0 | **R5** (P3 cleanup) / C21 P2 debt | Part 1 §4.7, §10.1 |
| **A13** | Medium (P2) | LP | Rounded grams never re-validated against hard constraints | P2 debt | Part 1 §10.1 |
| **A14** | (alias of A2) | LP | (alias — see A2) | (see A2) | APPENDIX-ID-KEY §1.1 |
| **A15** | Medium (P2) | LP | Latent duplicate-named-variable corruption | P2 debt | Part 1 §10.1 |
| **A16** | Medium (P2) | LP | `caloric_density` target is fixed scenario constant, not derived | P2 debt | Part 1 §10.1 |
| **A17** | Medium (P2) | LP | `fix_optimum` bound over-constrains near-zero objectives | P2 debt | Part 1 §10.1 |
| **A18** | Medium (P2) | LP | Wide coefficient range (~1e8) causes CBC numerical stress | P2 debt | Part 1 §10.1 |
| **A19** | Medium (P3) | LP | `weighted_normalized_deviation` helper unreferenced (dead code) | **R5** (P3) | Part 1 §10.1; Part 2 §8 |
| **A20** | Medium (P3) | LP | Inclusion constraints relaxed only at L3 via boolean flag (extensibility concern) | P3 (parked per Part 3 §5.5) | Part 1 §10.1; Part 3 §5.5 |

### 1.2 B-series — Canine Nutrition (B1–B18)

⚠ **ID collision** (APPENDIX-ID-KEY §6): `B1`, `B2`, `B5`, `B7`, `B11`, `B12` are *also* task IDs in Part 2 §4. "Finding B1" = flat growth energy; "Task B1" = real reporting layer. "Finding B12" = cobalamin unit/bound; "Task B12" = arginine reframed. The table below lists the **finding** meaning.

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **B1** (NUTR-F1, aliased with B11) | Critical (P0) | Nutrition | Flat `k = 1.2 × RER` growth energy (no age taper); scenario labels inverted (k=2.0 "discouraged" vs k=1.2 "recommended") | **B4** | Part 1 §4.3; BUG-MAP §A.1 #4 |
| **B2** (NUTR-F3) | Critical (P0) | Nutrition / LP | No absolute calcium maximum (DOD safeguard for large-breed growth missing) | **B3** | Part 1 §4.4, §9.1; BUG-MAP §A.1 #3 |
| **B3** | High (P1) | Nutrition | No phosphorus maximum | **B3** (same task) | Part 1 §4.4; BUG-MAP §A.2 |
| **B4** | High (P1) | Nutrition | Hardcoded 72% moisture / 1% ash denominator (DM not computed from data) | **C3** | Part 1 §4.6; BUG-MAP §A.2 |
| **B5** | High (P1) | Nutrition | No age tapering in growth-energy model | **B4** (task) | Part 1 §4.3; BUG-MAP §A.2 |
| **B6** | High (verify) (P1) | Nutrition | Copper SUL too permissive (400 mg/kg DM) | **C4** | Part 1 §4.10; BUG-MAP §A.2 |
| **B7** (finding — *not* the task B7) | High (verify) (P1) | Nutrition | Iron SUL — confirm vs NRC | **C4** | Part 1 §4.10; BUG-MAP §A.2 |
| **B8** | High (verify) (P1) | Nutrition | Iodine SUL may exceed AAFCO max | **C4** | Part 1 §4.10; BUG-MAP §A.2 |
| **B9** (finding — *not* the task B9) | High (verify) (P1) | Nutrition | Manganese SUL possibly too tight | **C4** | Part 1 §4.10; BUG-MAP §A.2 |
| **B10** (finding — *not* the task B10) | High (verify) (P1) | Nutrition | Zinc SUL — confirm vs NRC | **C4** | Part 1 §4.10; BUG-MAP §A.2 |
| **B11** (NUTR-F2, alias of B1) | Critical (P0) | Nutrition | (alias — see B1) | **B4** | APPENDIX-ID-KEY §1.1 |
| **B12** (finding) | Medium (P2) | Nutrition | Cobalamin (B₁₂) unit/bound likely off by ~1000× | P2 debt — *not in B0–R5 task catalog* | Part 1 §4.11, §10.1 |
| **B13** | Medium (P3) | Nutrition | Vitamin-A plausibility bound rejects cod-liver-oil | P3 debt | Part 1 §10.1 |
| **B14** | Medium (P2) | Nutrition | Bone Ca:P ≈ 1.94 slightly low; intra-ingredient Ca inconsistency | P2 debt | Part 1 §10.1 |
| **B15** | Medium (P2) | Nutrition | Taurine absent from nutrient set (breed-relevant for GSD) | P2 debt | Part 1 §10.1 |
| **B16** | Medium (P2) | Nutrition | Vitamin-D minimum not represented in matrix | P2 debt | Part 1 §10.1 |
| **B17** | Medium (P2) | Nutrition | Vitamin-A / Fe SUL mislabeled; Zn SUL slightly permissive | **C4** (task) | Part 1 §10.1; BUG-MAP §C.3 |
| **B18** | Medium (P2) | Nutrition | Nutrient-count inconsistency (41 / 43 / 46 / 54 across files) | **B7** (task) | Part 1 §1.2, §10.1; BUG-MAP §C.2 |

### 1.3 C-series — Data Modeling / JSON Schema (C1–C22)

⚠ **ID collision** (APPENDIX-ID-KEY §6, PART-4 §3.6): `C1`–`C16` are *also* task IDs in Part 2 §6/§7. The table below lists the **finding** meaning.

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **C1** (DATA-F1) | Critical (P0) | Data / CI | `DB_ingredientes.json` fails own schema (21 errors); no CI gate | **B6** (task) | Part 1 §5.2; BUG-MAP §A.1 #5 |
| **C2** (DATA-F2) | Critical (P0) | Data / Schema | No canonical nutrient enumeration; typo-blind | **B7** (task) | Part 1 §5.3; BUG-MAP §A.1 #6 |
| **C3** (DATA-F3) | Critical (P0) | Data / Schema | 3 competing namespace schemes; map↔DB overlap = 0 | **B7** (task) | Part 1 §5.3; BUG-MAP §A.1 #6 |
| **C4** (DATA-F4) | Critical (P0) | Schema | `lp_parameters.schema.json` orphaned (validates no real file; expects `breed`/`domains`); 44 KB dead artifact | **B8** (task) | Part 1 §5.2; BUG-MAP §A.1 #7 |
| **C5** (DATA-F5) | Critical (P0) | Data / Schema | Duplicate conflicting units (`chicken_blood_raw` Mg 20.5 vs 5.0 mg) | **B7** (task) | Part 1 §5.3; BUG-MAP §A.1 #6 |
| **C6** | High (P1) | Data / Schema | No numeric bounds on nutrient values | **B7** (task; folded) / **C5** (task) | Part 1 §5.4; BUG-MAP §C.2 |
| **C7** (DATA-F7, finding — *not* task C7) | Critical (P0) | Data / Schema | Unit not bound to key (`chloride_mg` with `unit:"g"` passes) | **B7** (task) | Part 1 §5.3; BUG-MAP §A.1 #6 |
| **C8** | High (P1) | Data / Schema | `additionalProperties:false` missing on 7 object types | **C5** (task) | Part 1 §5.4 |
| **C9** | High (P1) | Data / Schema | UTF-8 BOM × 2 files unloadable by strict parsers | **B6** (task) | Part 1 §5.4 |
| **C10** | High (P1) | Data / Schema | DB↔registry FDC-id referential integrity broken | **C5** (task) | Part 1 §5.4 |
| **C11** | High (P1) | Data / Schema | `lp_constraints` no upper bound, no `min≤max` invariant | **B8** (task) / **C5** (task) | Part 1 §5.4 |
| **C12** | High (P1) | Data / Schema | Identity rules inconsistent across schemas | **C5** (task) | Part 1 §5.4 |
| **C13** | High (P1) | Data / Schema | 3-state contract collapses (`missing` unused; 48 `measured=0` conflate 0 with unknown) | **B6** (task) / **C5** (task) | Part 1 §4.8, §5.4 |
| **C14** | Medium (P2) | Schema | `lp_parameters.schema.json` Draft-07 `definitions` under 2020-12 dialect | **B8** (task) / P2 debt | Part 1 §5.5 |
| **C15** | Medium (P2) | Schema | `nutrient_safety.schema.json` no coverage requirement, no `$id`, not closed, BOM | P2 debt | Part 1 §5.5 |
| **C16** | Medium (P2) | Schema | Mojibake in 17/28 `display_name`s | P2 debt (Part 2 §9) | Part 1 §5.5 |
| **C17** | Medium (P2) | Schema | Self-contradiction on nutrient count (46 vs 43) | **B7** (task, indirectly) / P2 debt | Part 1 §5.5 |
| **C18** | Medium (P2) | Schema | `ingredient_registry.schema.json` not closed, no `$id` | P2 debt | Part 1 §5.5 |
| **C19** (grouped) | Low (P3) | Data | Note length exceeds `maxLength` | P3 debt (Part 2 §9) | Part 1 §10.1 |
| **C20** (grouped) | Low (P3) | Data | AA double-count (amino-acid key overlap) | P3 debt | Part 1 §10.1 |
| **C21** (= A12) | Medium (P2) | Data | (alias — see A12; bioavailability unvalidated) | **R5** / P2 debt | Part 1 §10.1 |
| **C22** (grouped) | Low (P3) | Data | Hardcoded counts (43/46/54 not derived) | P3 debt | Part 1 §10.1 |

### 1.4 D-series — Validation Pipeline (D1–D22)

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **D1** (VAL-F1) | Critical (P0) | Validation | `validators/_shared.py` missing → entire validation package `ModuleNotFoundError` (CI RED today) | **B5** | Part 1 §6.1, Part 3 §9; BUG-MAP §A.1 #8 |
| **D2** | High (P1) | Validation | FDC API key in URL + leaked to logs | **C6** (task) | Part 1 §6.5; BUG-MAP §A.2 |
| **D3** | High (P1) | Validation | Empty-200 accepted as 0-nutrient validation | **C7** (task) | Part 1 §6.5; BUG-MAP §A.2 |
| **D4** | High (P1) | Validation | Audit trail not append-only / not tamper-evident | **C8** (task) | Part 1 §6.6; BUG-MAP §A.2 |
| **D5** | High (P1) | Validation | Circuit-breaker gate defeatable (edit JSON field) | **C9** (task) | Part 1 §6.6; BUG-MAP §A.2 |
| **D6** | High (P1) | Validation | CoFID checksum bypassed when cached | **C10** (task) | Part 1 §6.5; BUG-MAP §A.2 |
| **D7** | High (P1) | Validation | Fetch loop no try/except; `int(Retry-After)` crashes run | **C11** (task) | Part 1 §6.5; BUG-MAP §A.2 |
| **D8** | High (P1) | Validation | Commit swallows failures after DB swap | **C12** (task) | Part 1 §6.6; BUG-MAP §A.2 |
| **D9** | Medium (P2) | Validation | `atomic_swap` `EXDEV` failure risk, no fallback | P2 debt | Part 1 §6.6, §10.1 |
| **D10** | Medium (P2) | Validation | `CachedFetcher` staleness flag computed and discarded | P2 debt | Part 1 §10.1 |
| **D11** | Medium (P2) | Validation | Backup timestamp collision + never verified before swap | P2 debt | Part 1 §10.1 |
| **D12** | Medium (P2) | Validation | `int(Retry-After)` and 429 retry contradict "no retry" rule | **C11** (task, paired with D7) | Part 1 §10.1 |
| **D13** | Medium (P2) | Validation | No `User-Agent` on outbound HTTP | P2 debt | Part 1 §10.1 |
| **D14** | Medium (P2) | Validation | Open/Closed + DIP violations: `isinstance` routing | P2 debt | Part 1 §10.1 |
| **D15** | Medium (P2) | Validation | Encapsulation breach: orchestrator imports deviation privates | P2 debt | Part 1 §10.1 |
| **D16** | Medium (P2) | Validation | `LocalFdcFetcher` breaks parent invariants (Liskov) | P2 debt | Part 1 §10.1 |
| **D17** | Medium (P2) | Validation | Registry schema validation silently skipped when `jsonschema` absent | P2 debt | Part 1 §6.2, §10.1 |
| **D18** | Medium (P2) | Validation | Type-safety holes despite mypy-strict | P2 debt | Part 1 §6.4, §10.1 |
| **D19** (grouped) | Low (P3) | Validation | Basename allowlist | P3 debt | Part 1 §10.1 |
| **D20** (grouped) | Low (P3) | Validation | git-diff guard | P3 debt | Part 1 §10.1 |
| **D21** (grouped) | Low (P3) | Validation | CoFID silent-empty | P3 debt | Part 1 §10.1 |
| **D22** (grouped) | Low (P3) | Validation | Dead code in validation package | **R5** (task, P3) | Part 1 §10.1; Part 2 §8 |

### 1.5 E-series — Cross-cutting Architecture / Tests / CLI / Docs (E1–E23)

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **E1** (F-CONTRACT-1, alias of A3) | Critical (P0) | Solver / contract | (alias — see A3) | **B1** (task) | APPENDIX-ID-KEY §1.1 |
| **E2** | Critical (P0) | Tests | Test gap — no test catches the A3 placeholder | **B1** (task) | Part 1 §10.1; BUG-MAP §A.1 #2 |
| **E3** (alias of A8) | High (P1) | Solver | (alias — see A8) | **C2** (task) | APPENDIX-ID-KEY §1 |
| **E4** (F-CONTRACT-3) | High (P1) | CLI | `--runtime` input dict unvalidated before `AnimalInput(**dict)` | **C13** (task) | Part 1 §2.3, §7.1; BUG-MAP §A.2 |
| **E5** (F-TEST-1) | High (P1) | Tests | Timeout test is a stub that always passes (never invokes solver) | **R3** (task) | Part 1 §7.5, §10.1; Part 3 §7 |
| **E6** (F-CII-1) | High (P1) | CI | No schema/MAPA gate; single Python 3.12; dead `types-pydantic` dep | **C14** (task) | Part 1 §7.6, §10.1; BUG-MAP §A.2 |
| **E7** (F-DOC-?) | High (P1) | Docs | Three inconsistent bug-numbering schemes (R-01..R-09 / R1..R7 / F1..F6 / D1..D2) | **C15** (task) | Part 1 §7.7, §10.1; BUG-MAP §A.2 |
| **E8** | Medium (P2) | CLI | Solver output written with leaked file handle (no `with open(...)`) | **C16** (task) | Part 1 §7.1, §10.1 |
| **E9** (F-ARCH-1) | Medium (P2) | Architecture | `core.py` grab-bag mixing infra/domain/doc concerns | P2 debt (Part 3 §5.5 parks) | Part 1 §7.8, §10.1 |
| **E10** (F-ARCH-2) | Medium (P2) | Architecture | Type model split across two modules "to avoid circular imports" | P2 debt (parked) | Part 1 §2.2, §7.2, §10.1 |
| **E11** (F-DOC-1) | Medium (P2) | Architecture | 42% of package is doc-generation machinery; MAPA drifts from code | P2 debt | Part 1 §7.3, §10.1 |
| **E12** (F-ARCH-4) | Medium (P2) | Architecture | `solver.py` 1661-LOC god module; `build_lp_problem` 474 lines | P2 debt (parked) | Part 1 §7.8, §10.1 |
| **E13** (F-TYPE-1) | Medium (P2) | Types | `TypedDict(total=False)` everywhere = no runtime enforcement | P2 debt (parked) | Part 1 §7.2, §10.1 |
| **E14** (F-TYPE-2) | Medium (P2) | Types | Duplicate, weakly-typed type-guard helpers | P2 debt | Part 1 §10.1 |
| **E15** (F-CLI-1) | Medium (P2) | CLI | No `argparse`; hand-rolled `sys.argv` parsing | P2 debt | Part 1 §7.4, §10.1 |
| **E16** (F-TEST-2) | Medium (P2) | Tests | Tautological assertions that pass even if LP is wrong | **R1** (task) | Part 1 §7.5, §10.1; Part 2 §8 |
| **E17** (F-TEST-3) | Medium (P2) | Tests | `audit_test_result` logs pass/fail but never asserts; mutates committed file | **R2** (task) | Part 1 §7.5, §10.1; Part 2 §8 |
| **E18** (F-TEST-4) | Medium (P2) | Tests | Lexicographic *dominance* not actually verified | **R3** (task) | Part 1 §7.5, §10.1; Part 2 §8 |
| **E19** (F-CII-2) | Medium (P2) | Packaging | `requirements.txt` missing `requests`; `jsonschema` unpinned; no lockfile | **C14** (task) | Part 1 §7.6, §10.1 |
| **E20** (grouped, F-CLI-2) | Low (P3) | All | CLI branding/exit; `build_pipeline.py` stale branding | P3 debt | Part 1 §10.1 |
| **E21** (grouped, F-CLI-3) | Low (P3) | All | `--build-recipes` is a stub that prints "not yet implemented" and exits 0 | P3 debt | Part 1 §1.3, §10.1 |
| **E22** (grouped) | Low (P3) | All | Doc-drift markers | P3 debt | Part 1 §10.1 |
| **E23** (F-?, legacy R-06, MAPA L5) | Low (P3) | All | `[DEBUG]` prints in production stdout (40+ lines noise) | **R5** (task) | Part 1 §7.6, §10.1; Part 3 §7 |

### 1.6 R-series — Legacy (`R-01..R-09`) and Governance (`R1..R7`)

⚠ Three R-namespaces coexist (APPENDIX-ID-KEY §3, PART-4 §3.6): **legacy** (`R-01..R-09`, dash-prefixed, from earlier `REVIEW.md`), **governance** (`R1..R7`, no dash, from `validation-current-state.md`), and **regression tasks** (`R1..R5`, no dash, from Part 2 §8). The user's "R1-R9" range corresponds to the legacy namespace (9 IDs). All three are tabulated below.

#### 1.6.1 Legacy `R-01..R-09` (from earlier REVIEW.md)

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **R-01** (= governance R1 = A2) | Critical (P0) | LP | Mineral antagonisms unbounded slack (= A2) | **B2a** + **B2b** | APPENDIX-ID-KEY §3.1; Part 1 §7.7 |
| **R-02** (= governance R2) | (FIXED) | LP | Level-3 SUL optimum not fixed before DER stage | (already fixed — `fix_optimum: true` on `sul_violation` stage; `solver.py:667–680`) | Part 1 §2.4, §7.7 |
| **R-03** (= governance R3) | (FIXED) | LP | Tie-break hash-perturbation can dominate nutrition | (already fixed — hash-perturbation removed, current form is flat `tie_weight × var`) | Part 1 §2.4, §7.7 |
| **R-04** (= governance R4 = A3 / E1) | Critical (P0) | Solver / contract | Nutrient_results incomplete (`pct_of_min`/`pct_of_sul` null) | **B1** (task) | APPENDIX-ID-KEY §3.1; Part 1 §7.7 |
| **R-05** (= governance R5 = A6 mechanism) | High (P1) | Solver | `_MIN` IDs forced `adequacy_soft` (temporary workaround became permanent) | **B2b** (task) | APPENDIX-ID-KEY §3.2; Part 1 §7.7 |
| **R-06** (= governance R6 = E23) | Low (P3) | All | `[DEBUG]` prints in stdout (cosmetic, still present) | **R5** (task) | APPENDIX-ID-KEY §3.1; Part 1 §7.7, §10.1 |
| **R-07** | — | — | **not found in source** (Part 1 §1 mentions "R-01..R-09" as a range; individual descriptions of R-07 are absent from the consolidated docs) | — | — |
| **R-08** | — | — | **not found in source** (same — listed in the range but not individually described) | — | — |
| **R-09** (= A3 / E1) | Critical (P0) | Solver / contract | Nutrient placeholder (same defect as R-04 / A3 / E1) | **B1** (task) | Part 1 §7.7 |

#### 1.6.2 Governance `R1..R7` (from `validation-current-state.md`)

| ID | Severity | Subsystem | One-line | Repair Task | Source |
|---|---|---|---|---|---|
| **R1** (gov) | Critical (P0) | LP | Mineral antagonisms unbounded slack (= A2) | **B2a** + **B2b** | APPENDIX-ID-KEY §3.2; Part 1 §2.8 |
| **R2** (gov) | (FIXED) | LP | Level-3 SUL optimum not fixed | (already fixed) | APPENDIX-ID-KEY §3.2 |
| **R3** (gov) | (FIXED) | LP | Tie-break hash removal | (already fixed) | APPENDIX-ID-KEY §3.2 |
| **R4** (gov) | Critical (P0) | Solver | `nutrient_results` incomplete (= A3) | **B1** (task) | APPENDIX-ID-KEY §3.2 |
| **R5** (gov) | High (P1) | Solver | `_MIN` forced `adequacy_soft` (= A6 mechanism) | **B2b** (task) | APPENDIX-ID-KEY §3.2 |
| **R6** (gov) | Low (P3) | All | Noise (`[DEBUG]` prints = E23) | **R5** (task) | APPENDIX-ID-KEY §3.2 |
| **R7** (gov) | (VERIFIED) | All | Verified (37 tests pass) | — (no defect) | APPENDIX-ID-KEY §3.2 |

#### 1.6.3 Regression `R1..R5` (from Part 2 §8 — *task* IDs, not bug IDs)

These are **task IDs**, not findings. See Section 2.3 below. They are mentioned here only to disambiguate the namespace collision.

### 1.7 Bug-count summary

| Subsystem | Range | Critical | High | Medium | Low | Total |
|---|---|---|---|---|---|---|
| A (LP / OR) | A1–A20 | 4 (A1, A2, A3, A5) | 4 (A4, A6, A7, A8) | 11 (A9–A18, A19, A20) | — | 20 (with A14 alias) |
| B (Nutrition) | B1–B18 | 2 (B1+B11, B2) | 8 (B3–B10) | 7 (B12–B18) | — | 18 |
| C (Data / Schema) | C1–C22 | 6 (C1, C2, C3, C4, C5, C7) | 7 (C6, C8–C13) | 5 (C14–C18) | 4 (C19–C22) | 22 |
| D (Validation) | D1–D22 | 1 (D1) | 7 (D2–D8) | 10 (D9–D18) | 4 (D19–D22) | 22 |
| E (Cross-cutting) | E1–E23 | 2 (E1, E2 aliased with A3) | 5 (E3 aliased with A8, E4–E7) | 12 (E8–E19) | 4 (E20–E23) | 23 |
| **Total (deduplicated)** | — | **9** | **27** | **30** | **11** | **77** |

Plus 6 empirically-cleared non-defects (Part 1 §10.2) that must **not** be "fixed": Level-2/3 unbounded antagonism slack is bounded; `prob.add_variable`/`pulp_cbc_path` are valid PuLP 3.3.2 APIs; inclusion-constraint unit handling is correct; `fix_optimum` mechanism is sound (only the *stage order* in A1 is broken); RER/Atwater/AAFCO basis are correct; validation positives (subprocess list-form, pydantic, BaseFetcher, token-bucket, CoFID intent, 404→MISSING) are correct.

---

## Section 2 — Task Catalog Complete

The remediation program defines **35 tasks**: 14 B-series (Phase 0 + Phase 1, including the B2a/B2b split), 16 C-series (Phase 2), 5 R-series (Phase 3). The detailed task definitions appear in Part 2 §4; the dependency tree in Part 2 §10; the curated catalog in BUG-MAP §C.

⚠ **C-series collision** (PART-4 §3.6): task C1 (normalize antagonism penalty units) ≠ finding C1 (DB fails schema). Task IDs are scoped to Part 2 §4–§8. The table below is **tasks only**.

### 2.1 Phase 0 — Safety Freeze (1 task)

| Task | Severity | Repairs | Blocked-by (hard) | Blocked-by (soft) | Blocks (downstream) | Independent? | Status |
|---|---|---|---|---|---|---|---|
| **B0** | P0 | A3, A2, B2, C1, D1 (interim containment for all 5) | none | — | nothing in the *blocks* sense; **backstops** B1, B2a, B3, B5, B6 | ✅ Yes (first commit) | independent; re-detects each original defect until the real fix lands; fully deletable once P0-1 through P0-6 + vet sign-off | Part 2 §5; BUG-MAP §C.1, §E.4 |

### 2.2 Phase 1 — Blockers & Stability (13 B-series tasks, after the B2 split)

| Task | Severity | Repairs | Blocked-by (hard) | Blocked-by (soft / recommended) | Blocks (downstream) | Independent? | Status notes |
|---|---|---|---|---|---|---|---|
| **B1** | P0 | A3, E1, E2 (real nutrient_results) | — (per Part 2 §4 B1 detailed: "Blocked by: none… pairs with B7 for clean min/max source") | **B7** (clean min/max source) | **B12** (task; "confirm B1 fixes arginine display") | ✅ Yes — may start before B7 using existing fragmented sources | Part 2 §4; BUG-MAP §C.2 |
| **B2a** | P0 | A2, A14 (harden antagonisms L1) | — (G1 resolved) | — | **B2b** (exposed slack), **C1** (task; penalty normalization) | ✅ Yes | G1 = HARD; independent; BUG-MAP §C.2 |
| **B2b** | P0 | A6, B-i, B-ii (severity-scaled rec) | **B2a** (needs exposed slack) | **G3** (thresholds) + vet | — | ❌ No — decisive protection; *the task that actually protects the dog today* (Level-1 unreachable) | Part 2 §4; Part 3 §5.2 |
| **B3** | P0 | B2, B3 (Ca/P ceilings) | **G3** + vet | — | — | ❌ No | Part 2 §4; BUG-MAP §C.2 |
| **B4** | P0 | B1, B5, B11 (growth energy + labels) | **G3** + vet | **B11** (task; "informs whether B4 restores Level 1") | — | ❌ No — high regression risk; requires vet review | Part 2 §4; BUG-MAP §C.2 |
| **B5** | P0 | D1 (restore `_shared.py`) | — | **B7** (canonical units, recommended only) | **C7, C8, C9, C10, C11, C12, C14** (all 6 validation fixes + CI gates) | ✅ Yes — *most urgent G3-independent task; CI is RED today* | Part 2 §4; Part 3 §9 |
| **B6** | P0 | C1, C9, C13 (DB schema gate) | — | **B7** (schema tightening; "ideally sequenced first") | **C5** (task; recommended only), **C14** (task; hard blocks) | ✅ Yes — may ship a less-than-ideal version without B7 | Part 2 §4; BUG-MAP §C.2 |
| **B7** | P0 | C2, C3, C5, C7, B18, C6 (canonical namespace) | external: `chicken_blood_raw` Mg source (verify FDC) | — | **B1** (recommended), **B5** (recommended), **B6** (recommended), **B8** (blocks), **B12** (blocks), **C5** (blocks) | ❌ No — central hub; has external data dependency | Part 2 §4; BUG-MAP §C.2 |
| **B8** | P0 | C4, C11 (orphaned schema) | **B7** (registry shape) | — | **B12** (recommended via B7), **C5** (blocks) | ❌ No | Part 2 §4; BUG-MAP §C.2 |
| **B9** | P0 | A5 (delete `objective_weights.json`) | — (G2 resolved) | — | — | ✅ Yes — cheapest task; single commit | Part 2 §4; BUG-MAP §C.2 |
| **B10** | P0 | A1 (fix stage order) | — | — | — | ✅ Yes | Part 2 §4; BUG-MAP §C.2 |
| **B11** | P0 | B-i, B-iii (diagnose L1 infeasibility) | — | — | **B4**, **C3** (recommended — "informs whether B4/C3 restore Level 1") | ✅ Yes — diagnostic, cheap, high-info; should run early | Part 2 §4; BUG-MAP §C.2 |
| **B12** | P0 (reframed) | B-iv (arginine; reframed in Part 3 §8) | **B7** (registry/namespace) + **B1** (reporting layer) | — | — | ❌ No — but reframe eliminates most of the original work | Part 2 §4; Part 3 §8 |

### 2.3 Phase 2 — P1 Hardening (16 C-series tasks)

| Task | Severity | Repairs | Blocked-by (hard) | Blocked-by (soft / recommended) | Blocks (downstream) | Independent? | Status notes |
|---|---|---|---|---|---|---|---|
| **C1** (task) | P1 | A4 (penalty normalization) | **B2a** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C2** (task) | P1 | A8, E3 (status branching) | — | — | — | ✅ Yes | Part 2 §7; BUG-MAP §C.3 |
| **C3** (task) | P1 | B4 (dry matter from data) | external: moisture/ash data in DB | **B11** (task; "informs whether C3 restores Level 1") | — | ❌ No (external data dependency) | Part 2 §7; BUG-MAP §C.3 |
| **C4** (task) | P1 | B6–B10, B17 (SUL verification) | **G3** + vet | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C5** (task) | P1 | C6, C8, C10, C11, C12, C13 (schema hardening) | **B7**, **B8** | **B6** (recommended only — per §C.3 only B7+B8 hard-block) | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C6** (task) | P1 | D2 (FDC key in header) | — | — | — | ✅ Yes — security; do early | Part 2 §7; BUG-MAP §C.3 |
| **C7** (task) | P1 | D3 (empty-200) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C8** (task) | P1 | D4 (audit trail) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C9** (task) | P1 | D5 (circuit-breaker) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C10** (task) | P1 | D6 (CoFID checksum) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C11** (task) | P1 | D7, D12 (fetch isolation) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C12** (task) | P1 | D8 (atomic commit) | **B5** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C13** (task) | P1 | E4 (runtime validation) | — | — | — | ✅ Yes | Part 2 §7; BUG-MAP §C.3 |
| **C14** (task) | P1 | E6, E19 (CI gates + Python matrix) | **B5**, **B6** | — | — | ❌ No | Part 2 §7; BUG-MAP §C.3 |
| **C15** (task) | P1 | E7 (bug-numbering reconciliation) | — | — | — | ✅ Yes | Part 2 §7; BUG-MAP §C.3 |
| **C16** (task) | P1 | A7, E8 (dead floor-relaxation; file handle) | — | — | — | ✅ Yes | Part 2 §7; BUG-MAP §C.3 |

### 2.4 Phase 3 — Regression Suite (5 R-series tasks)

| Task | Severity | Repairs | Blocked-by (hard) | Blocked-by (soft / recommended) | Blocks (downstream) | Independent? | Status notes |
|---|---|---|---|---|---|---|---|
| **R1** | P2 | E16 (tautological assertions) | "after fixes they lock" (the B-series fixes must land first) | — | **R5** (R5 is LAST) | ❌ No (implicit dep on B-series) | Part 2 §8 |
| **R2** | P2 | E17 (`audit_test_result` never asserts) | "after fixes" | — | **R5** | ❌ No | Part 2 §8 |
| **R3** | P2 | E18, E5 (lex dominance; real timeout test) | "after fixes" | — | **R5** | ❌ No | Part 2 §8 |
| **R4** | P2 | proof discipline (byte-identical replay) | "after fixes" | — | **R5** | ❌ No | Part 2 §8 |
| **R5** | P3 | A19, D22, A12 (dead code, DEBUG prints) | **R1, R2, R3, R4** (LAST in regression suite) | — | — | ❌ No — terminal node | Part 2 §8 |

---

## Section 3 — Gates

Three Phase-1 decision gates (G1/G2/G3) surface policy forks the codebase cannot resolve itself. Full ADR-style records appear in APPENDIX-ID-KEY §4; the bottleneck analysis is in Part 3 §6.

| Gate | Question | Resolution | Status | Unblocks | Bottleneck? |
|---|---|---|---|---|---|
| **G1** | Mineral antagonisms: hard or soft? | **HARD at Level 1** (violation ⇒ infeasible ⇒ `DO_NOT_FEED`); severity-scaled rec at every level | ✅ Resolved (user-confirmed 2026-07-25) | B2a, B2b (B2b also awaits G3 thresholds) | No — engineering only |
| **G2** | `objective_weights.json`: wire in or delete? | **DELETE** (0 solver refs; `CRITICALITY_WEIGHT` is authoritative) | ✅ Resolved (YAGNI/DTSTTCPW default) | B9 | No — engineering only |
| **G3** | Numeric safety values (Ca/P ceilings, growth taper, SULs, severity thresholds) | **Verify-first** against AAFCO 2024 / NRC 2006 / FEDIAF 2024 primary sources + board-certified vet (DACVN/ECVCN) review before merge | ❌ **PENDING** — the *only* non-engineering gate | B3 (Ca/P ceilings), B4 (growth taper), B2b (severity thresholds), C4 (SULs) | **YES — the single project bottleneck** |

### Bottleneck analysis (Part 3 §6)

G3 requires three things, in increasing difficulty:

1. **Primary-source lookup** (bounded work — published documents).
2. **Breed-specific adjustment** (GSD is large-breed but not the largest; Ca/P and growth numbers must be GSD-adjusted, not generic-large-breed lifted).
3. **Veterinary review** (DACVN/ECVCN sign-off) — *the genuinely slow step*: requires finding a nutritionist, scheduling a review, incorporating feedback. The only step depending on a person outside engineering.

**Per Part 3 §6: "the project is not blocked. It is gated, at exactly one point, on a non-engineering input. Every other workstream can and should proceed."** All G3-dependent tasks (B3, B4, B2b-thresholds, C4) can ship their *mechanism* now with placeholder values; only the numbers wait on G3.

---

## Section 4 — Edge Classification (for graph rendering)

Every dependency edge in the system, classified by kind. Edge kinds:

- **`blocks`** — hard prerequisite. The "to" task cannot start (or cannot ship) until "from" lands.
- **`pending`** — waiting on a gate (G3). Mechanism can ship now; numbers wait.
- **`recommended`** — soft ordering. "to" can start before "from" but is better sequenced after.
- **`backstops`** — safety-net relationship. B0 re-detects the original defect until the real fix lands; clears automatically as each P0 task completes.

### 4.1 Verified edge table (32 edges)

| # | FROM → TO | kind | label | source-ref |
|---|---|---|---|---|
| 1 | G3 → B3 | pending | — | Part 2 §10; BUG-MAP §B, §C.2 |
| 2 | G3 → B4 | pending | — | Part 2 §10; BUG-MAP §B, §C.2 |
| 3 | G3 → B2b | pending | G3 thresholds | Part 2 §10; BUG-MAP §B, §C.2 |
| 4 | G3 → C4 | pending | — | Part 2 §10; BUG-MAP §B, §C.3 |
| 5 | B2a → B2b | blocks | exposed slack | Part 2 §4 B2b, §10; BUG-MAP §D |
| 6 | B2a → C1 | blocks | — | Part 2 §4 C1, §10; BUG-MAP §D |
| 7 | B7 → B1 | **recommended** ⚠ | clean min/max source | Part 2 §4 B1 detailed ("Blocked by: none… pairs with B7"), §10 ("B7 → B1 clean min/max source") |
| 8 | B7 → B5 | recommended | canonical units | Part 2 §4 B5, §10; BUG-MAP §D |
| 9 | B7 → B6 | **recommended** ⚠ | schema tightening | Part 2 §4 B6 detailed ("ideally sequenced first"), §10 ("recommended after B7") |
| 10 | B7 → B8 | blocks | registry shape | Part 2 §4 B8, §10; BUG-MAP §D |
| 11 | B7 → B12 | blocks | registry/namespace | Part 2 §4 B12, §10; BUG-MAP §D |
| 12 | B7 → C5 | blocks | — | Part 2 §10; BUG-MAP §D |
| 13 | B1 → B12 | blocks | reporting layer | Part 2 §4 B12, §10; BUG-MAP §D |
| 14 | B8 → C5 | blocks | — | Part 2 §10; BUG-MAP §D |
| 15 | B6 → C5 | recommended | — | Part 2 §10 (B6 → C5 in ASCII) + §C.3 (only B7+B8 hard-block C5) |
| 16 | B5 → C7 | blocks | — | Part 2 §10; BUG-MAP §D |
| 17 | B5 → C8 | blocks | — | Part 2 §10; BUG-MAP §D |
| 18 | B5 → C9 | blocks | — | Part 2 §10; BUG-MAP §D |
| 19 | B5 → C10 | blocks | — | Part 2 §10; BUG-MAP §D |
| 20 | B5 → C11 | blocks | — | Part 2 §10; BUG-MAP §D |
| 21 | B5 → C12 | blocks | — | Part 2 §10; BUG-MAP §D |
| 22 | B5 → C14 | blocks | import-smoke | Part 2 §10; BUG-MAP §D |
| 23 | B6 → C14 | blocks | schema-gate | Part 2 §10; BUG-MAP §D |
| 24 | B0 → B1 | backstops | detects A3 | Part 2 §5; BUG-MAP §E.4 |
| 25 | B0 → B2a | backstops | detects A2 | Part 2 §5; BUG-MAP §E.4 |
| 26 | B0 → B3 | backstops | detects B2 | Part 2 §5; BUG-MAP §E.4 |
| 27 | B0 → B5 | backstops | detects D1 | Part 2 §5; BUG-MAP §E.4 |
| 28 | B0 → B6 | backstops | detects C1 | Part 2 §5; BUG-MAP §E.4 |
| 29 | R1 → R5 | blocks | — | Part 2 §8; BUG-MAP §D |
| 30 | R2 → R5 | blocks | — | Part 2 §8; BUG-MAP §D |
| 31 | R3 → R5 | blocks | — | Part 2 §8; BUG-MAP §D |
| 32 | R4 → R5 | blocks | — | Part 2 §8; BUG-MAP §D |

### 4.2 Edges MISSING from current `src/lib/dependency-graph.ts` EDGE_TABLE

| FROM → TO | kind | label | source-ref |
|---|---|---|---|
| **B11 → B4** | recommended | "informs whether B4 restores Level 1" | Part 2 §4 B11 ("Informs whether B4/C3 restore Level 1"), §6, §10 |
| **B11 → C3** | recommended | "informs whether C3 restores Level 1" | Part 2 §4 B11, §10 |

These are soft "informs" edges — B11 is a diagnostic that should run *before* B3/B4 ship so they are not blind fixes. They are missing from the current EDGE_TABLE.

### 4.3 Edges that exist in EDGE_TABLE but with WRONG classification

| FROM → TO | EDGE_TABLE says | Should be | Justification |
|---|---|---|---|
| **B7 → B1** | `blocks` | `recommended` | Part 2 §4 B1 detailed: *"Blocked by: none (numeric mins already in `scenarios.json`); pairs with B7 for clean min/max source."* B1 can start before B7; B7 is the cleaner source, not a hard prereq. |
| **B7 → B6** | `blocks` | `recommended` | Part 2 §4 B6 detailed: *"Blocked by: B7 (schema tightening) ideally sequenced first."* + §10: *"B6 (schema gate) ── recommended after B7 (schema tightening)"*. B6 can ship a less-than-ideal version without B7. |

### 4.4 Edges that exist in EDGE_TABLE and are CORRECTLY classified

All other 30 edges (G3 → B3/B4/B2b/C4 as `pending`; B2a → B2b/C1 as `blocks`; B7 → B5/B8/B12/C5; B1 → B12; B8 → C5; B6 → C5 as `recommended`; B5 → C7–C12, C14 as `blocks`; B6 → C14 as `blocks`; B0 → B1/B2a/B3/B5/B6 as `backstops`; R1–R4 → R5 as `blocks`) are correctly classified per the source docs.

### 4.5 External dependencies (not graph-encodable)

Two tasks have external (non-task) dependencies that the graph cannot represent as node-to-node edges:

| Task | External dependency | Source |
|---|---|---|
| **B7** | `chicken_blood_raw` Mg true value (20.5 vs 5.0 mg) — verify against FDC | Part 2 §4 B7, §15 |
| **C3** (task) | moisture/ash data per ingredient in DB | Part 2 §4 C3, §10 |

Both should be rendered as *external-anchor* nodes or as dashed-edge labels in the UI.

---

## Section 5 — Critical Path & Timeline

### 5.1 The four phases

| Phase | Tasks | Goal | What unblocks the next phase |
|---|---|---|---|
| **Phase 0 — Safety Freeze** | B0 | Make the system honest today. Force `DO_NOT_FEED` while defects are uncorrected. | B0 lands → Phase 1 can begin (and stays in force until P0-1 through P0-6 + vet sign-off) |
| **Phase 1 — Blockers & Stability** | B1, B2a, B2b, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12 (13 tasks) | Repair all 9 Critical findings + 1 amendment-cluster. Truthfulness + safety + buildability. | All non-G3 Phase 1 tasks land → Phase 2 can begin. G3 lands → B3, B4, B2b-thresholds ship |
| **Phase 2 — P1 Hardening** | C1–C16 (16 tasks) | Repair the 27 High findings. Correctness hardening across LP objective, status taxonomy, dry-matter, SULs, schema, validation security, runtime input, CI gates, bug-numbering, dead code. | All Phase 2 tasks land → Phase 3 can begin |
| **Phase 3 — Regression Suite** | R1, R2, R3, R4, R5 (5 tasks) | Lock in the fixes so the suite catches regressions, not just passes. | R5 is the terminal node — completes the program |

### 5.2 The critical path (one sentence)

**Per Part 2 §10:** `G1/G2/G3 decisions → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3`. B3/B4/B2b-thresholds run in parallel once G3 + vet land.

### 5.3 Parallelization opportunities

The system has 4 parallel lanes that can all proceed in parallel (per Part 3 §5 + Part 2 §6):

#### Lane A — Immediate G3-independent (7 tasks, all start now)

B0 (first commit) → B5 (CI red) → B6 (schema gate) → B11 (Level-1 diagnosis) → B2a (harden antagonisms) → B9 (delete dead config) → B10 (fix stage order)

#### Lane B — Safety chain (decisive protection, can begin immediately, G3-independent for *mechanism*)

B1 (real reporting layer) + B2b (severity-scaled rec, mechanism with placeholder thresholds)

#### Lane C — G3-pending (mechanism now, numbers later)

B3, B4, B2b-thresholds, C4 — all four ship their *mechanism* immediately with placeholder values; the *numbers* wait on G3 + vet sign-off.

#### Lane D — Structural, slower, high-value (parallel with above)

B7 (canonical registry) + B12 (reframed arginine) + C5/C9 (schema fixes) — proceed in parallel; B7 feeds B1/B5/B6/B8/B12/C5 (mostly as `recommended`, not `blocks`).

#### Lane E — Validation chain (after B5)

B5 → {C7, C8, C9, C10, C11, C12, C14} — 7 tasks unblocked simultaneously by B5.

### 5.4 The single bottleneck

**G3 — veterinary sign-off (DACVN/ECVCN) on the safety-critical numeric values** (Part 3 §6). All G3-dependent tasks (B3, B4, B2b-thresholds, C4) cannot ship to production with placeholder values. This is the *only* non-engineering gate; everything else can proceed in parallel while G3 awaits veterinary review.

The G3 path has three sub-steps (Part 3 §6): primary-source lookup → breed-specific adjustment → veterinary review. The veterinary-review step is the genuinely slow one — it requires finding a nutritionist, scheduling, and incorporating feedback. It depends on a person outside the engineering team.

---

## Section 6 — Pipeline Visualization (text)

A cleaner, more legible ASCII diagram than BUG-DEPENDENCY-MAP §D. Lanes are vertical columns with semantic meaning. Solid arrows = `blocks`; dashed arrows = `recommended`; dotted arrows = `pending` (gate); tilde arrows = `backstops`.

```
                                                     gsd-diet-calc v10.4.0 — Remediation Pipeline
                                                     ─────────────────────────────────────────────
 Lane 1            Lane 2          Lane 3          Lane 4          Lane 5          Lane 6
 G3-pending        B2a chain       B7 hub          B5 validation   Regression      Independents
                                                   cluster

 ┌──────────┐
 │ G3 ❌    │  (the single bottleneck — vet sign-off)
 │ PENDING  │
 └─┬─┬─┬─┬──┘
   │ │ │ │  (all 4 edges are "pending")
   │ │ │ └───────────────┐
   │ │ └─────────┐        │
   │ │           │        │
   ▼ ▼           ▼        ▼
 ┌────┐ ┌────┐ ┌─────┐ ┌─────┐
 │ B3 │ │ B4 │ │ B2b │ │ C4  │     ◄── G3-dependent lane (mechanism now, numbers later)
 └────┘ └─▲──┘ └──▲──┘ └─────┘
          │B11     │B2a
          │(rec)   │(blocks)
          │        │
 ┌──────┐ │        │      ┌──────────┐
 │ B11  │─┘        │      │   B0     │ ◄───────────── BACKSTOP LAYER ─────────────┐
 │ diag │          │      │  safety  │                                              │
 └──┬───┘          │      │  freeze  │──┐                                           │
    │              │      └────┬─────┘  │ B0 detects A3/A2/B2/C1/D1 in the         │
    │ B11 informs │           │        │ current repo until each real fix lands:  │
    │ C3 too (rec)│           │        │                                           │
    ▼             │           │        │   B0 ~> B1   (detects A3)                 │
 ┌─────┐          │           │        │   B0 ~> B2a  (detects A2)                 │
 │ C3  │          │           │        │   B0 ~> B3   (detects B2)                 │
 │DM   │          │           │        │   B0 ~> B5   (detects D1)                 │
 └─────┘          │           │        │   B0 ~> B6   (detects C1)                 │
                  │           │        │                                           │
 ┌──────┐         │           │        │                                           │
 │ B2a  │◄────────┘           │        │                                           │
 │harden│                     │        │                                           │
 │  L1  │──┬──► B2b (blocks)  │        │                                           │
 └──────┘  │                   │        │                                           │
           │                   │        │                                           │
           └──► C1 (blocks)    │        │                                           │
                               │        │                                           │
                    ┌──────────┴────────┴──────────────────────────────────────┐   │
                    │                                                  │   │
                    ▼                                                  ▼   │
              ┌─────────┐                                       ┌────────────┐│
              │   B7    │ ◄── central hub                       │    B5      ││
              │canonical│                                       │ restore    ││
              │namespace│──┬─► B1  (recommended, clean src) ──► │ _shared.py ││
              └─────────┘  │                                    │ [URGENT —  ││
                           │                                    │  CI RED]   ││
                           ├─► B5  (recommended, canonical units)│            ││
                           │                                    └─────┬──────┘│
                           ├─► B6  (recommended, schema tighten) │       │
                           │                                    │       │
                           ├─► B8  (blocks, registry shape) ─┐  │       │
                           │                                 │  │       │
                           ├─► B12 (blocks, registry/ns) ◄──┐│  │       │
                           │   ▲                            ││  │       │
                           │   │  B1 → B12 (blocks,         ││  │       │
                           │   │  reporting layer)          ││  │       │
                           │   │                            ▼│  │       │
                           │   │                          ┌────┐│       │
                           │   │                          │ B12││       │
                           │   │                          │arg ││       │
                           │   │                          │(ref)│       │
                           │   │                          └────┘│       │
                           │   │                                │       │
                           │   │                          ┌────┐│       │
                           │   └─────────────► B8 ───────► │ C5 ││ ◄─ B7 (blocks)┐
                           │                              │schema│ ◄─ B8 (blocks)│
                           │                              │harden│ ◄─ B6 (rec)   │
                           │                              └────┘│              │
                           │                                    │              │
                           └─► C5 (blocks) ─────────────────────┘              │
                                                                              │
                                                                              │
                                                              ┌───────────────┘
                                                              ▼
                                              ┌───────────────────────────────┐
                                              │  B5 ─► C7  (D3 empty-200)     │
                                              │  B5 ─► C8  (D4 audit trail)   │
                                              │  B5 ─► C9  (D5 circuit-break) │
                                              │  B5 ─► C10 (D6 CoFID checksum)│
                                              │  B5 ─► C11 (D7/D12 fetch iso) │
                                              │  B5 ─► C12 (D8 atomic commit) │
                                              │  B5 ─► C14 (CI gates)         │
                                              │  B6 ─► C14 (CI gates)         │
                                              └───────────────────────────────┘
                                                              │
                                                              ▼
                                              ┌───────────────────────────────┐
                                              │  R1 ─► R5 (tautological tests)│
                                              │  R2 ─► R5 (audit_test_result) │
                                              │  R3 ─► R5 (lex dom; timeout)  │
                                              │  R4 ─► R5 (proof discipline)  │
                                              │         R5 (LAST — dead code) │
                                              └───────────────────────────────┘


 Independents column (no blockers — can start now):
 ┌─────────────────────────────────────────────────────────────┐
 │  B0  (safety freeze — also backstops lane above)            │
 │  B9  (delete objective_weights.json — G2 resolved)          │
 │  B10 (fix lexicographic stage order — A1)                   │
 │  B11 (diagnose L1 — informs B4/C3)                          │
 │  C2  (status branching — A8/E3)                              │
 │  C6  (FDC key in header — D2; security, do early)           │
 │  C13 (runtime validation — E4)                              │
 │  C15 (bug-numbering reconciliation — E7)                    │
 │  C16 (dead floor-relaxation — A7/E8)                        │
 └─────────────────────────────────────────────────────────────┘

 Legend:
   ──►  blocks (hard prerequisite)
   ──┐  recommended (soft ordering)
   ~~►  backstops (B0 re-detects original defect)
   -►   pending (gate G3; mechanism now, numbers later)
```

---

## Section 7 — Key Insights (non-obvious)

These are the insights the source docs themselves flag as "non-obvious" (BUG-MAP §G, Part 3 §3, §4, §7, §8, §9) plus additional insights surfaced by this cross-reference.

### 7.1 B5 is the hidden critical-path accelerator (Part 3 §9)

The worklog-style framing calls B5 "restore an import." Part 3 §9 escalated it: the missing `_shared.py` breaks `pytest` *collection* (not execution) — `191 tests collected, then ModuleNotFoundError aborts everything`. CI is **red**, not yellow. **Every task whose verification says "run the test suite" is implicitly blocked on B5.** This makes B5 the *real* first commit of the remediation program in practice, even though B0 is logically first.

### 7.2 B12 was reframed by live execution (Part 3 §8)

The original task was "relocate `arginine_g` into `bp["nutrients"]`." Direct inspection showed arginine is *already correctly placed* — the LP respects Lys:Arg internally (verified: `beef_muscle_raw → 6.86`, `chicken_muscle_raw → 11.94` energy-normalized). The only broken thing is the reporting layer (A3). So B12 became "confirm B1 fixes arginine display," not a data-model relocation. **This avoids engineering effort on a non-existent problem.**

### 7.3 The safety triad A2 + A3 + B2 (Part 1 §9.1, BUG-MAP §E.1)

The single most dangerous combination. Combined effect: the solver can return `SAFE_TO_FEED` for a diet that:
- violates Ca:P / Zn:Cu ratios (A2 — antagonisms soft)
- exceeds the safe calcium ceiling (B2 — no Ca max)
- reports every nutrient as "adequate" (A3 — fake output)
- *no test catches it* (E2)

= **mineral-toxicity / developmental-orthopedic-disease risk for growing large-breed dogs.** This is *why* the verdict is "pre-alpha — no diet may be fed."

### 7.4 B0 is a guard, not a fix (Part 2 §5, BUG-MAP §E.4)

B0 is the *first to execute and the last to leave*. It's a small module (`safety_guard.py`) plus a few fail-closed call sites. It re-detects each original defect (A3, A2, B2, C1, D1) until the real fix lands. It is fully deletable once P0-1 through P0-6 + vet sign-off. **It is not a fix; it is a containment layer that buys time for every other task without exposing any user to a dangerous diet.**

### 7.5 The LP core is verified correct — bugs are in the seams (Part 3 §4, §7)

The lexicographic cascade, the fix-optimum mechanism, the per-ingredient Big-M, the normalized-deviation objective, RER `70·BW^0.75`, Modified Atwater `3.5/8.5/3.5`, AAFCO per-1000-kcal normalization, Ca:P hard-bounded 1.1–1.3 — **all verified by direct execution**. They *stay*. The bugs are in the *seams* (wiring, data, output, validation), not the math. This is why the rewrite verdict is **"No"** — the math is sound; the seams must be repaired in dependency order.

### 7.6 Level 1 is structurally unreachable → B2a→B2b is the decisive protection (Part 3 §3.3, §5.2; BUG-MAP §E.5)

Direct execution of the cascade against two real selections (5-ingredient reference + 10-ingredient broad) produced the same result both times: `cascade_level=2`, `solver_status="suboptimal"`. Level 1 was never reached. This means:
- `SAFE_TO_FEED` is *dead code* in practice.
- The Level-1 hardening (B2a) is currently *moot* (Level 1 doesn't fire).
- The protection that actually exists at Level 2 today is *nothing* — `feeding_rec` always emits `FEED_WITH_CAUTION` regardless of severity.
- Therefore **B2a → B2b is the decisive protection that actually protects the dog today.** B2b makes the recommendation reflect the *realized violation magnitude* (severity-scaled), not just the cascade level. Without B2b, B1 just shows the user the bad numbers under a misleading label.

### 7.7 Six empirically-cleared non-defects must NOT be "fixed" (Part 1 §10.2)

The diagnosis disproved its own crash hypotheses:
- Level-2/3 unbounded antagonism slack does **not** make the objective unbounded (slack is bounded by gram/constraint structure).
- `prob.add_variable(...)` and `pulp.apis.coin_api.PULP_CBC_CMD.pulp_cbc_path` are valid PuLP 3.3.2 APIs (no `AttributeError`).
- Inclusion-constraint unit handling is correct.
- The `fix_optimum` mechanism itself is sound (only the *stage ordering* in A1 is broken).
- RER/Atwater/AAFCO basis are correct.
- Validation positives (subprocess list-form, pydantic, BaseFetcher, token-bucket, CoFID intent, 404→MISSING) are correct.

**Part 2 §2 YAGNI filter explicitly protects these.** "Fixing" them would be wasted effort.

### 7.8 The legacy self-review missed the safety-critical bugs (Part 1 §9.4, BUG-MAP §G.5)

The team's own reviews (R-01..R-09 / R1..R7 / F1..F6 / D1..D2) checked whether docs matched code, *not whether the LP/nutrition/data are scientifically correct*. R1 (=A2), R4 (=A3), R5 (=A6 mechanism) were known but unfixed; R2, R3 were fixed; R6 (DEBUG prints = E23) is cosmetic and still present. The diagnosis's contribution is to surface exactly the safety-critical defects the team's own reviews missed.

### 7.9 Two external dependencies break the graph's completeness (NEW insight)

B7 has an external dependency on resolving the `chicken_blood_raw` Mg true value (20.5 vs 5.0 mg) via FDC verification (Part 2 §4 B7, §15). C3 has an external dependency on moisture/ash data per ingredient in DB. **Neither is a node in the current graph; both are real blockers that should be rendered as external-anchor nodes.** This is a structural gap in the current `dependency-graph.ts` — these dependencies are invisible in the UI today.

### 7.10 The ID-collision problem is a navigational defect, not a software defect (PART-4 §3.6, APPENDIX-ID-KEY §6)

The same literal ID can mean different things in different namespaces:
- `B1` = finding (flat growth energy) **OR** task (real reporting layer)
- `B2` = finding (no Ca max) **OR** task-prefix (B2a/B2b)
- `B5` = finding (no age tapering) **OR** task (restore _shared.py)
- `B7` = finding (Cu SUL too permissive) **OR** task (canonical namespace)
- `B12` = finding (cobalamin unit off) **OR** task (arginine reframed)
- `C1`–`C16` = findings (data/schema defects) **OR** tasks (Phase-2 hardening)
- `R1`–`R7` = governance deviations **OR** regression tasks **OR** legacy R-01..R-09 (with dash)
- `C7` = finding (unit not bound to key) **OR** task (D3 empty-200) **OR** (formerly) MAPA 2.0 label for D1
- `D1` = finding (_shared.py missing) **OR** amendment legacy ID

The current UI does not disambiguate these collisions. Hover/click should show the namespace context.

### 7.11 A5 is the sole severity downgrade in the catalog (Part 1 §10.1 note, APPENDIX-ID-KEY §5)

A5 was rated Critical in the initial review pass and downgraded to High — the `objective_weights.json` wiring gap is a *trustworthiness* defect (the system optimizes a different objective than the one its configuration advertises), not a direct *safety* failure on the order of the triad A2 + A3 + B2. It retains P0 priority because the wiring gap is a maintenance trap regardless of severity. This is the only severity-vs-priority asymmetry in the catalog.

### 7.12 B6 → C5 is recommended, NOT blocks (BUG-MAP §C.3, Part 2 §10)

The BUG-DEPENDENCY-MAP §C.3 task catalog lists C5 as "Blocked by: B7, B8" — *only* B7 and B8. B6 *feeds* C5 (it provides the schema-gate that C5 hardens) but does not hard-block it. The current EDGE_TABLE correctly downgrades B6 → C5 to `recommended`. This is the only place where the ASCII diagram (BUG-MAP §D) is more aggressive than the table (§C.3); the table is authoritative.

### 7.13 B7's "central hub" role is partly soft, not all hard (Part 2 §4 detailed task definitions)

Although B7 feeds 6 tasks (B1, B5, B6, B8, B12, C5), only **3 of those 6 edges are hard blocks** (B7 → B8, B7 → B12, B7 → C5). The other 3 (B7 → B1, B7 → B5, B7 → B6) are `recommended` per the detailed task definitions. The current EDGE_TABLE marks B7 → B1 and B7 → B6 as `blocks` — **this is wrong**. Treating all 6 as `blocks` over-constrains the critical path and makes B7 look like a harder bottleneck than it actually is.

---

## Section 8 — Recommended Graph Layout (for the reworked UI)

### 8.1 World bounds and lane philosophy

**World: 1600 × 1200.** Six vertical lanes, each with semantic meaning. Lane x-coordinates are evenly spaced at 240px intervals starting at x=120 (lanes at x=120, 360, 600, 840, 1080, 1320; right margin 280 for legend).

```
Lane 1 (x=120):   G3 + G3-pending children (B3, B4, B2b, C4)
Lane 2 (x=360):   B2a chain + B11 diagnostic + C3 (dry matter)
Lane 3 (x=600):   B7 central hub + direct children (B1, B5, B6, B8, B12)
Lane 4 (x=840):   C5 + B5's validation children (C7-C12, C14)
Lane 5 (x=1080):  R1-R5 regression suite (vertical chain)
Lane 6 (x=1320):  Independents sidebar (B0 at top, then B9, B10, B11, C2, C6, C13, C15, C16)
```

### 8.2 Node coordinates (1600 × 1200 world)

| Node | x | y | Lane | Notes |
|---|---|---|---|---|
| **G3** | 120 | 80 | 1 | Pending gate — top of pipeline |
| **B3** | 120 | 280 | 1 | G3-pending |
| **B4** | 120 | 460 | 1 | G3-pending |
| **B2b** | 120 | 640 | 1 | G3-pending (also blocked by B2a) |
| **C4** (task) | 120 | 820 | 1 | G3-pending |
| **B2a** | 360 | 280 | 2 | Independent (G1 resolved) — feeds B2b, C1 |
| **C1** (task) | 360 | 460 | 2 | Blocked by B2a |
| **B11** (task) | 360 | 640 | 2 | Independent diagnostic — informs B4, C3 (recommended edges) |
| **C3** (task) | 360 | 820 | 2 | External dep (moisture/ash data) |
| **B7** | 600 | 460 | 3 | Central hub — 3 blocks + 3 recommended edges out |
| **B1** (task) | 600 | 280 | 3 | Recommended-after-B7; blocks B12 |
| **B5** (task) | 600 | 640 | 3 | Recommended-after-B7; URGENT (CI red) |
| **B6** (task) | 600 | 820 | 3 | Recommended-after-B7 |
| **B8** (task) | 840 | 820 | 3/4 border | Blocked by B7; blocks C5 |
| **B12** (task) | 840 | 640 | 3/4 border | Blocked by B7 + B1 |
| **C5** (task) | 840 | 460 | 4 | Blocked by B7 + B8; recommended from B6 |
| **C7** (task) | 1080 | 100 | 4 | Blocked by B5 |
| **C8** (task) | 1080 | 200 | 4 | Blocked by B5 |
| **C9** (task) | 1080 | 300 | 4 | Blocked by B5 |
| **C10** (task) | 1080 | 400 | 4 | Blocked by B5 |
| **C11** (task) | 1080 | 500 | 4 | Blocked by B5 |
| **C12** (task) | 1080 | 600 | 4 | Blocked by B5 |
| **C14** (task) | 1080 | 700 | 4 | Blocked by B5 + B6 |
| **R1** | 1320 | 100 | 5 | Phase 3 regression |
| **R2** | 1320 | 220 | 5 | Phase 3 regression |
| **R3** | 1320 | 340 | 5 | Phase 3 regression |
| **R4** | 1320 | 460 | 5 | Phase 3 regression |
| **R5** | 1320 | 580 | 5 | Terminal — blocked by R1–R4 |
| **B0** | 1520 | 80 | 6 | Backstop layer — top of independents |
| **B9** | 1520 | 200 | 6 | Independent (G2) |
| **B10** | 1520 | 320 | 6 | Independent |
| **C2** (task) | 1520 | 560 | 6 | Independent |
| **C6** (task) | 1520 | 680 | 6 | Independent (security) |
| **C13** (task) | 1520 | 800 | 6 | Independent |
| **C15** (task) | 1520 | 920 | 6 | Independent |
| **C16** (task) | 1520 | 1040 | 6 | Independent |

**Total: 36 nodes** (matches current count).

### 8.3 Edge rendering rules (prominent vs. fade)

| Edge kind | Stroke | Color | Width | Z-order | Tooltip |
|---|---|---|---|---|---|
| `blocks` | solid | `#dc2626` (red) | 2.5px | top | "Hard prerequisite" |
| `pending` (G3 gate) | dashed | `#f59e0b` (amber) | 2.5px | top | "Pending G3 vet sign-off" |
| `recommended` | dotted | `#3b82f6` (blue) | 1.5px | middle | "Soft ordering" |
| `backstops` | wave / tilde | `#10b981` (green) | 1.5px | middle | "B0 re-detects original defect" |
| Missing edges to add (B11→B4, B11→C3) | dotted | `#3b82f6` | 1.5px | middle | "B11 informs this task" |
| External deps (B7→Mg-source, C3→moisture-data) | dashed | `#94a3b8` (slate) | 1px | bottom | "External data dependency" |

**Fade rules**: edges going *into* a node whose status is `independent` should fade to 50% opacity (those nodes don't need their incoming edges emphasized). Edges from `B0` (backstops) should render in a separate "backstop overlay" toggle, off by default — they are visually noisy and most users want to see the *forward* dependency flow.

### 8.4 Cluster/lane semantic meaning

- **Lane 1** (G3-pending): "Waiting on vet sign-off." Visually distinguished by amber pending-edges. Should pulse subtly to indicate "this is the bottleneck."
- **Lane 2** (B2a chain): "Decisive safety chain (Level-1 unreachable)." Visually grouped with a subtle background fill.
- **Lane 3** (B7 hub): "Canonical namespace — the architectural center." B7 should be visually larger / heavier weight than other task nodes.
- **Lane 4** (B5 validation cluster): "Validation pipeline fixes." Tightly grouped because B5 unblocks all 7.
- **Lane 5** (R1–R5): "Regression suite (Phase 3 — terminal)." Linear chain, faded unless Phase 1/2 are complete.
- **Lane 6** (Independents): "Can start now." Green-tinted background; these are the recommended starting points.

### 8.5 Interaction patterns

| Pattern | Behavior |
|---|---|
| **Hover** (node) | Tooltip: full description + severity + status + repair target + source-ref (e.g. "Part 2 §4 B5"). Show namespace disambiguation if ID is collision-prone (e.g. "Task B5 — restore _shared.py. *Not* the finding B5 (no age tapering).") |
| **Hover** (edge) | Tooltip: edge kind, source-ref, and (for backstops) the original defect detected |
| **Click** (node) | Open a side panel with: full task definition (Part 2 §4), TDD Red/Green, Evidence Manifest, files/functions touched, all aliases (finding IDs repaired), dependency tree excerpt |
| **Click** (gate node G3) | Open a side panel with: G3 sub-steps (primary-source lookup → breed-specific adjustment → veterinary review), what each unblocks, current status, contact-process pointer to APPENDIX-SAFETY-PROCESS.md §1 |
| **Drag** (node) | Allow free repositioning within lane constraints (preserve x-coordinate, allow y). Persist to localStorage so user layouts survive refresh. |
| **Drag** (canvas) | Pan the viewport. |
| **Wheel** | Zoom in/out (centered on cursor). Min zoom 0.3, max zoom 3.0. |
| **Right-click** (node) | Context menu: "Highlight critical path to this node", "Show only this node's subgraph", "Copy ID", "Open source-ref in new tab" |
| **Filter toggle** (top bar) | Toggles: "Show backstops" (off by default), "Show recommended edges" (on), "Show pending edges" (on), "Show only P0", "Show only Critical-path", "Show only G3-blocked" |
| **Search** (top bar) | Filter by ID, alias, severity, status, or task-description text. Highlight matches; dim non-matches. |
| **Legend** (always visible, bottom-right) | Color/stroke key for edge kinds; severity color key for nodes; phase color key for lanes. |

### 8.6 Special nodes

- **G3** (gate): Render as a diamond, not a rectangle. Color: amber when pending, green when resolved. Pulse animation when pending. Tooltip should prominently display "Single project bottleneck — Part 3 §6."
- **B0** (safety freeze): Render with a distinct "shield" icon. Color: green (independent + protective). Tooltip: "Guard, not a fix — fully deletable once P0-1..P0-6 + vet sign-off."
- **B5** (CI red): Render with a "warning" badge. Color: red-tinted. Tooltip: "URGENT — CI is red today; 191 tests collected, then ModuleNotFoundError."
- **B7** (central hub): Render 1.5× the size of other task nodes. Color: blue (architectural). Tooltip: "Single most-connected node — 3 blocks + 3 recommended edges out."
- **R5** (terminal): Render with a "stop" icon. Tooltip: "LAST task in the program — Phase 3 terminal."

---

## Summary

### Verified counts

- **Nodes:** 36 in current `src/lib/dependency-graph.ts` (the prompt said 35; actual is 36 — 14 B-series tasks + 16 C-series tasks + 5 R-series tasks + 1 G3 gate = 36).
- **Edges:** 32 in current EDGE_TABLE (the prompt said 30; actual is 32 — 4 G3-pending + 2 B2a-chain + 6 B7-chain + 1 B1→B12 + 1 B8→C5 + 1 B6→C5-recommended + 7 B5-chain + 1 B6→C14 + 5 B0-backstops + 4 R-series = 32).
- **Bugs:** 77 deduplicated findings across 5 subsystems (121 distinct IDs including aliases).
- **Tasks:** 35 (B0 + B1–B12 with B2a/B2b split = 14 + C1–C16 = 16 + R1–R5 = 5).
- **Gates:** 3 (G1 ✅, G2 ✅, G3 ❌ pending).

### Discrepancies vs. current `src/lib/dependency-graph.ts` EDGE_TABLE

1. **B7 → B1**: EDGE_TABLE classifies as `blocks`; should be `recommended` (Part 2 §4 B1 detailed: "Blocked by: none… pairs with B7").
2. **B7 → B6**: EDGE_TABLE classifies as `blocks`; should be `recommended` (Part 2 §4 B6 detailed: "ideally sequenced first"; §10: "recommended after B7").
3. **B11 → B4** edge MISSING. Should be `recommended` ("informs whether B4 restores Level 1").
4. **B11 → C3** edge MISSING. Should be `recommended` ("informs whether C3 restores Level 1").
5. B0 → B2a backstop is *correctly* included (detects A2 — yes, A2's repair task B2a is independent, but B0 still backstops it because B0 detects the *defect*, not the *task*).
6. B6 → C5 is *correctly* downgraded to `recommended` (per BUG-MAP §C.3 — only B7+B8 hard-block C5).
7. All other 30 edges are correctly classified per the source docs.

**Additional structural gap**: B7's external dependency (chicken_blood_raw Mg verification) and C3's external dependency (moisture/ash data in DB) are not represented as nodes — should be added as external-anchor nodes for completeness.

### Critical path (one sentence)

`G1/G2/G3 → B7 → {B1, B5, B6, B8} → {B2a, C1}, {C5}, {C7–C12}, {C14} → Phase 3` (per Part 2 §10); B3/B4/B2b-thresholds run in parallel once G3 + vet land.

### The single bottleneck

**G3 — veterinary sign-off (DACVN/ECVCN) on the safety-critical numeric values** (Ca/P ceilings, growth-energy taper, Cu/Fe/I/Mn/Zn SULs, B2b severity thresholds). The *only* non-engineering gate. Blocks B3, B4, B2b-thresholds, C4. All other workstreams can proceed in parallel while G3 awaits veterinary review.

### Top 3 insights worth surfacing in the reworked graph UI

1. **B5 is the hidden critical-path accelerator** — CI is red today; every task whose verification says "run the test suite" is implicitly blocked on B5. Render B5 with a warning badge + "URGENT" tag.
2. **B2a → B2b is the decisive protection that actually protects the dog today** — Level-1 is structurally unreachable, so B2b (severity-scaled recommendation) is the only mechanism that distinguishes a slightly-off Level-2 solution from a catastrophically-off one. Render the B2a → B2b edge as the visually-heaviest "safety chain" in the graph.
3. **B7's "central hub" role is partly soft** — only 3 of its 6 out-edges are hard `blocks`; the other 3 (B7 → B1, B7 → B5, B7 → B6) are `recommended`. The current EDGE_TABLE over-constrains the critical path by marking all 6 as `blocks`. Fixing this in the UI reveals that B7 is *less* of a bottleneck than it appears — B1, B5, B6 can all start before B7 lands.
