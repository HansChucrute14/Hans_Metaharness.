# GSD-CALC AUDIT DELTA

Findings absent from `PART-1`/`PART-2`/`PART-3` + `BUG-DEPENDENCY-MAP`.

**Verified:** clean venv, `master@c932a21`, `pip install -e ".[test]"` (CI-exact command).

| ID | Sev | Location | Finding | Evidence |
|---|---|---|---|---|
| NEW-1 | Critical | `pyproject.toml`, `requirements.txt`, `.github/workflows/ci.yml` | `pydantic` used at runtime, never declared as dependency. Upstream of D1 — blocks import before `_shared.py` is even reached. | `schemas.py:10` `from pydantic import BaseModel, Field`. Not in `dependencies=[]`, not in `requirements.txt`, not in CI install line (`pip install -e .[test] mypy typing-extensions types-requests types-pydantic` — `types-pydantic` is stub-only, installs no runtime pkg). |
| NEW-2 | — (methodology) | Docs' own "ground truth" execution | Docs' D1 evidence transcript ("191 tests collected, 1 error") is not reproducible from a clean checkout — meaning their review sandbox had `pydantic` pre-installed, contaminating the "ground truth" run. | Reran `pytest tests/ -v` in fresh venv, exact CI install cmd: `collected 150 items / 3 errors` (phase1, phase5, phase6), `Interrupted: 3 errors during collection`. Docs report 1 error, 191 collected. Delta unexplained by any doc. |
| NEW-3 | Medium | `src/gsd/mapa.py:988` | Production package imports from `tests/`, which is excluded from any built distribution. Breaks under `pip install` of a wheel/sdist (not just `git clone` + editable install). | `from tests.reference_cases import REFERENCE_ANIMAL, REFERENCE_SELECTION`. `pyproject.toml`: `[tool.setuptools.packages.find] where=["src"]` — `tests/` not packaged. Not covered by E15 (argparse) or E19 (requirements.txt sync) — neither mentions this line or this failure mode. |
| COR-1 | — (factual error in docs) | `PART-1` line ~903, D1 finding | Parenthetical claim is false: "`validators/__init__.py` exports list *does* reference `_shared`'s `SOLVER_TO_DB_NUTRIENT`, `DB_TO_SOLVER_FACTOR`..." | `find src/gsd -name __init__.py` → empty (whole `gsd` tree is an implicit namespace package, no `__init__.py` anywhere). `grep -rn "SOLVER_TO_DB_NUTRIENT\|DB_TO_SOLVER_FACTOR" src/` → no hits. Symbols don't exist; file doesn't exist. |

## Confirmed accurate (re-verified against live code, not restated in full — delta only per request)

A2, A3, B2, D1-core-claim.

## Not exhaustively re-audited

Remaining ~73 findings, C/E-series in full, nutrition-science claims, schema-drift counts. Scope of this pass = import/dependency/packaging surface only.
