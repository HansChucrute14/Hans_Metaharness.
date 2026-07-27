# GSD-CALC AUDIT DELTA — v2 (graph-correlated)

Findings absent from `PART-1`/`PART-2`/`PART-3` + `BUG-DEPENDENCY-MAP`, positioned against `BUG-DEPENDENCY-MAP` §C/§D/§G node IDs.
Verified: clean venv, `master@c932a21`, `pip install -e ".[test]"` (CI-exact).

## Findings

| ID | Sev | Location | Finding | Evidence | Graph position |
|---|---|---|---|---|---|
| NEW-1 | Critical | `pyproject.toml`, `requirements.txt`, `ci.yml` | `pydantic` used at runtime, never declared. | `schemas.py:10`. Absent from `dependencies=[]`, `requirements.txt`, CI install line (`types-pydantic` = stub only, no runtime pkg). | **Upstream of D1, not parallel to it.** `orchestrator.py:37 from ..schemas import (...)` [pydantic] fires before `orchestrator.py:54 from ..validators._shared import extract_db_value` [D1] — line 37 always fails first in a clean env, so D1 is never reached to be diagnosed. Sits strictly before **B5** in the actual failure chain: B5's DoD (`import gsd.validation.pipeline.orchestrator` → `OK`) will **still fail post-B5** until NEW-1 is fixed too. Inherits B5's full blocks-set: **C7, C8, C9, C10, C11, C12, C14**. Independently satisfies **B0 trip-condition-5** (import fails) — B0 backstop already covers this by accident, not by design. **C14 scope gap**: C14's task text ("remove dead `types-pydantic`") never adds real `pydantic` — C14 as currently scoped ships without fixing NEW-1. |
| NEW-2 | — (methodology) | `PART-3 §7/§9`, map `G.4`, `G.8` | Docs' cited D1/B5 evidence transcript is not reproducible from a clean checkout. | Reran the exact CI command in a fresh venv: `collected 150 items / 3 errors` (phase1, phase5, phase6), `Interrupted: 3 errors during collection`. Docs report `191 tests collected, 1 error in 1.96s` (map §A.1 row 8, §G.4 pt.1, §G.8 test count). | **Corrects evidence values, not the verdict.** D1 = still real, B5 = still the right fix, "CI is RED today" = still true — but understated: 3 collection errors not 1, 150 items not 191 before abort. Implies the review sandbox had `pydantic` pre-installed (masking NEW-1), so the "191/1" transcript in §G.4/§G.8/§A.1-row-8 was not captured from `pip install -e ".[test]"` as stated. Flag for **C15** (bug-numbering/evidence reconciliation) — same discipline, extended to evidence transcripts. |
| NEW-3 | Medium | `src/gsd/mapa.py:988` | Production package imports from `tests/`, excluded from any built distribution. | `from tests.reference_cases import REFERENCE_ANIMAL, REFERENCE_SELECTION`. `pyproject.toml` `[tool.setuptools.packages.find] where=["src"]` — `tests/` not packaged. | **Independent node — not on critical path.** Same lane as B0/B2a/B9/B11 (§F Phase 1 "can start now" list) but not in it. Adjacent to but uncovered by **C14** (CI/requirements.txt) and **debt item #6** (E19 packaging) — neither task's described scope mentions the `src/` ⊥ `tests/` boundary. Blocks only `mapa.py`'s `--gate-mapa` "Live Execution Evidence" section, and only under a non-editable/wheel install (current `license = "Private project — not for distribution"` makes this low-probability today, not zero). No edge into G3, B5, or the safety chain (B1+B2b). |
| COR-1 | — (factual error in docs) | `PART-1` D1 finding, ~line 903 | False parenthetical: `validators/__init__.py` "does reference `_shared`'s `SOLVER_TO_DB_NUTRIENT`, `DB_TO_SOLVER_FACTOR`..." | `find src/gsd -name __init__.py` → empty (whole tree is an implicit namespace package). `grep -rn "SOLVER_TO_DB_NUTRIENT\|DB_TO_SOLVER_FACTOR" src/` → no hits. | **No graph impact.** B5's task definition (create `_shared.py` implementing `extract_db_value`) is correct and unaffected — the false claim is decorative prose in Part 1, not load-bearing for any task DoD. |

## New/corrected edges (extends map §D)

```
NEW-1 (pydantic undeclared) ──> [precedes] D1 ──> B5
                              ├─> inherits B5's blocks: C7,C8,C9,C10,C11,C12,C14
                              ├─> satisfies B0 trip-condition-5 (accidental, not designed-for)
                              └─> C14 (scope gap: task text omits adding `pydantic`)

NEW-2 (evidence correction) ──> annotates G.4-pt.1, G.8 test-count, §A.1 row 8
                              └─> C15 (bug-numbering/evidence reconciliation — same class of fix)

NEW-3 (mapa.py/tests import) ── independent; no inbound/outbound edge to G1/G2/G3 or safety chain
                              └─> adjacent-uncovered by C14, debt-item #6 (neither scopes it in)

COR-1 ── no edge; corrects PART-1 prose only, B5's DoD unaffected
```

## Not exhaustively re-audited

Remaining ~73 findings, C/E-series in full, nutrition-science claims, schema-drift counts. Scope of this pass = import/dependency/packaging surface only.
