# APPENDIX — Verification Log

**Project:** Hans-GSD-Raw-Calculator (gsd-diet-calc v10.4.0)
**Role:** A standalone reference appendix to the four-part consolidated documentation set. This log preserves the exact commands and outputs that constitute the ecosystem's runtime-verified evidence (epistemological tier (a) in Part 4 §1.1) — the load-bearing subset of claims whose strength rests on direct execution against the live repository, not on static code reading. It exists so that the strongest claims in Part 1 are auditable by reading rather than by re-running.

**How to use this log.** Each entry in §2 records one executed command, the observed output, and the finding it confirms. §3 records same-session `file:line` confirmations that are strong but not runtime. §4 is explicit about what this log does *not* contain, so that a reader does not mistake the absence of a transcript for the absence of a defect.

---

## §1. Provenance

- **Repository:** `github.com/HansChucrute14/Hans-GSD-Raw-Calculator`
- **Commit:** `c932a21`
- **Date of verification:** 2026-07-25
- **Environment:** repository clone with `pulp==3.3.2`, the CBC MILP backend, and `jsonschema` (Draft 2020-12) installed
- **Method:** direct execution against the live repository — not static reading, not inference from code structure

The verification was performed twice, independently, by two execution passes that arrived at the same numbers:

1. The `EXECUTIVE_REMEDIATION_ROADMAP` §0 "Empirical Red baseline (captured by execution this session)" — the first pass.
2. The `MAPA_DO_PROJETO_2.0` "Clonei o repo, instalei `pulp==3.3.2` + CBC + `jsonschema`, e rodei o solver de verdade" verification table — the second pass, performed by a second agent in a second environment.

Independent re-verification by a second agent in a second environment is the strongest evidence pattern in the ecosystem. The two passes agree byte-for-byte on every shared claim: 21 schema errors, 3 schema errors, the `ModuleNotFoundError`, the 60 `HARD_FAIL_INFEASIBLE` count, the 0 `objective_weights` reference count, the hardcoded `"adequate"` placeholder, and the cascade stopping at Level 2.

---

## §2. Runtime-Verified Commands (Tier a — Strongest Evidence)

Each command below was executed against the live repository at commit `c932a21`. The transcript preserves the exact command, the observed output, and the finding it confirms. Working-directory paths, shell prompts, and exact timestamps were not preserved by the original execution session; this is a known limit recorded in §4.

### 2.1 `solve_cascade()` direct execution — confirms A3

**Command (Python, executed interactively):**

```python
from gsd.solver import solve_cascade
# Two real ingredient selections were exercised:
#   (1) a 5-ingredient reference selection
#   (2) a 10-ingredient broad selection
result = solve_cascade(selection, ...)
```

**Observed output (both selections, identical pattern):**

- `cascade_level = 2`
- `solver_status = "suboptimal"`
- For `arginine_g` in `nutrient_results`: `value=0`, `status="adequate"`, `target_min=None`

**Conclusion.** The hardcoded `"adequate"` status is emitted for a nutrient the report itself shows as zero with no target. Level 1 (`SAFE_TO_FEED`) was never reached in either selection; the solver stops at Level 2 every time. This is not a code-reading inference — it is actual solver output. Confirms Part 1 §A.A3 (LP-F5, F-CONTRACT-1, legacy R4).

### 2.2 `grep -c HARD_FAIL_INFEASIBLE data/constraints.json` — confirms A2

**Command:**

```
grep -c HARD_FAIL_INFEASIBLE data/constraints.json
```

**Observed output:** `60`

**Conclusion.** Sixty `HARD_FAIL_INFEASIBLE` declarations exist in `constraints.json`. Of these, 5 are mineral-antagonism constraints (Ca:P, Zn:Cu, Fe:Zn, Ca:Mg, Lys:Arg) at `constraints.json:34, 59, 84, 117, 150`; the remaining 55 are nutrient minimums, toxicological limits, and inclusion constraints. The solver builds the 5 antagonism constraints as soft (slack-penalized in Level 1, unpenalized in Levels 2 and 3) at `solver.py:425–477, 824–843`. The config↔code contradiction is real; the 60-vs-soft framing sometimes used in shorthand refers to the 60 declarations, of which only the 5 antagonisms are mis-enforced. Confirms Part 1 §A.A2 (LP-F2, A14, governance R1).

### 2.3 `jsonschema.Draft202012Validator` against `DB_ingredientes.json` — confirms C1

**Command (Python):**

```python
import json, jsonschema
schema = json.load(open("data/db_ingredientes.schema.json"))
data  = json.load(open("data/DB_ingredientes.json"))
errors = list(jsonschema.Draft202012Validator(schema).iter_errors(data))
print(len(errors))
```

**Observed output:** `21`

**Breakdown (from the same error set).** 20 measured entries are missing the required `unit` field (e.g. `cobalamin_b12_mg = {"value": 0.00381, "status": "measured"}`); 1 note-length violation (`pork_fat_raw/ara_arachidonic_acid_g` note length 208 > maxLength 200).

**Conclusion.** The data file is non-conformant with its own governing schema, and no CI gate catches the divergence. Confirms Part 1 §A.C1 (DATA-F1).

### 2.4 `import gsd.validation.pipeline.orchestrator` — confirms D1

**Command:**

```
PYTHONPATH=src python -c "import gsd.validation.pipeline.orchestrator"
```

**Observed output (verbatim):**

```
ModuleNotFoundError: No module named 'gsd.validation.validators._shared'
```

Raised at `bone_validator.py:39` — the first importer encountered during collection.

**Exit code:** non-zero.

**Conclusion.** `validators/_shared.py` does not exist; the symbol `extract_db_value` is defined nowhere in `src/`; four modules import from it (`pipeline/orchestrator.py:54`, `validators/bone_validator.py:39`, `validators/cofid_validator.py:33`, `validators/fdc_validator.py:36`). The validation package is dead on arrival — no validation run can start. (The `--runtime` formulation path does not import `gsd.validation`, so diet solving still runs; `--validate-db`'s pipeline tier and all FDC/COFID validation cannot.) Confirms Part 1 §A.D1 (VAL-F1). The original systematic review inferred this statically without `pydantic` available; direct execution confirmed the inference.

### 2.5 `grep -c objective_weights src/gsd/solver.py` — confirms A5

**Command:**

```
grep -c objective_weights src/gsd/solver.py
```

**Observed output:** `0`

**Conclusion.** The solver never reads `objective_weights.json`. The file (322 lines) is pure dead config that misleads readers; the real objective is `CRITICALITY_WEIGHT` at `solver.py:17`, used at `:772` and `:791`. Confirms Part 1 §A.A5 (LP-F4).

### 2.6 `jsonschema.Draft202012Validator` against `lp_parameters_data.json` — confirms C4

**Command (Python):**

```python
import json, jsonschema
schema = json.load(open("data/lp_parameters.schema.json"))
data  = json.load(open("data/lp_parameters_data.json"))
errors = list(jsonschema.Draft202012Validator(schema).iter_errors(data))
print(len(errors))
```

**Observed output:** `3`

**Breakdown.** The schema expects `breed` and `domains` fields; the data contains `NUTRIENT_REGISTRY` and `solve_cascade` fields. The 44 KB schema validates zero real data files.

**Conclusion.** The most safety-relevant config (cascade, nutrient registry, SULs, clinical criticality) is governed by no working schema, while a 44 KB schema governs nothing. Confirms Part 1 §A.C4 (DATA-F4).

### 2.7 `pytest tests/ -v` (the exact CI command from `ci.yml`) — confirms D1's CI-pipeline escalation

**Command:**

```
pytest tests/ -v
```

(This is the exact command in the `test` job of `ci.yml`.)

**Observed output:**

- `191` tests collected successfully.
- `1` error during collection: `tests/test_validation_phase5.py` raises `ModuleNotFoundError` because it transitively imports from the validation package, which cannot import because `validators/_shared.py` is missing.
- No tests run.

**Exit code:** non-zero (collection error).

**Conclusion.** The `test` job in CI is red today, not yellow, not "missing coverage" — red. This is the only piece of evidence in the entire ecosystem that the CI pipeline is currently failing; everything else is static inference. It escalates Task B5 (Part 2 §5.2) from "restore an import in an isolated subsystem" to "unblock the entire CI pipeline" (Part 3 §9).

---

## §3. Same-Session Static-Line Confirmations (Tier b — Strong, Not Runtime)

The same execution session that produced §2 also captured the following `file:line` confirmations by direct code reading. These are not runtime executions, but they were captured in the same session as the §2 commands and are reported here for completeness so that the boundary between tier (a) and tier (b) is auditable in one place.

| Claim | Source | Confirms |
|---|---|---|
| `solver.py:1225` hardcodes `"status":"adequate"` | `EXECUTIVE_REMEDIATION_ROADMAP` §0 baseline | A3 at the source-line level |
| `solver.py:425` builds antagonisms "with slack for goal programming" | `EXECUTIVE_REMEDIATION_ROADMAP` §0; Task B2 Red Condition | A2 at the source-line level |
| No `calcium_g <=` ceiling in `constraints.json` or `toxicological_limits.json` | `EXECUTIVE_REMEDIATION_ROADMAP` §0 | B2 |
| `CRITICALITY_WEIGHT` at `solver.py:17` is authoritative; `objective_weights.json` has 0 references in `solver.py` | `EXECUTIVE_REMEDIATION_ROADMAP` §0; `REMEDIATION_PLAN` Q3 | A5 wiring |
| `core.py:205–207` `SCENARIO_K_MAP`: `SCN_B_SLOW_GROWTH → k=1.2` ("recommended"), `SCN_A_RAPID_GROWTH → k=2.0` ("discouraged") | `EXECUTIVE_REMEDIATION_ROADMAP` §0; `REMEDIATION_PLAN` Q4 | B1 / B11 (growth-energy inversion) |
| `ci.yml` runs `pytest tests/ -v` (py3.12) + `mypy --package gsd`; no `--validate-db`, no `--gate-mapa`, no schema/MAPA gate, single Python 3.12 vs `requires-python>=3.10` | `REMEDIATION_PLAN` Q10 | E6 (CI gates absent) |
| CBC `randomSeed=12345` + `threads=1` (`solver.py:657`); `fix_optimum_tolerance_abs=0.01`, `rel=1e-6`, `cbc_time_limit_seconds=30` (`lp_parameters_data.json:512–516`) | `REMEDIATION_PLAN` Q9 | Determinism (a non-defect — empirically cleared) |

---

## §4. What This Log Does Not Contain

This log preserves the runtime-verification evidence for the seven claims in §2 and the same-session static confirmations in §3. It does *not* contain transcripts for:

- **The D2–D22 validation-pipeline findings.** These are confirmed by static code reading with `file:line` citations in Part 1 §6 and §8. The `_shared.py` import (§2.4 above) is the only D-series finding that has been runtime-verified; the rest are static.
- **The E-series cross-cutting findings.** Same: static reading, not runtime. The one exception is §2.7 above (the `pytest` collection failure), which is the runtime confirmation that E6's "CI does not gate" claim has the downstream consequence of a red pipeline.
- **The B-series nutrition findings** other than the `solve_cascade()` execution in §2.1. The B-series claims (B2 no Ca max, B1/B11 growth-energy inversion) rest on `file:line` citations plus the §3 confirmations, not on runtime nutritional output.
- **Working-directory paths, shell prompts, exit codes, or exact timestamps** for the §2 commands. The original execution session preserved the commands and their outputs but not the surrounding shell metadata. Future verification sessions should preserve the full shell transcript (with `pwd`, `date`, and explicit exit-code capture) so that this log can be extended rather than reconstructed.

The boundary between what is runtime-verified (§2) and what is statically confirmed (§3, plus the rest of Part 1) is the same boundary Part 1 §10.1 draws in its "Two notes on this table" paragraph: a load-bearing subset is confirmed by direct execution; the remainder is confirmed by static code reading. This log exists to make the first subset auditable by reading rather than by re-running, and to be explicit about where the runtime evidence ends.

---

*End of Appendix. This is a reference document; it preserves runtime evidence and does not propose changes to the software.*
