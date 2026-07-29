# Area-of-issue taxonomy is a fixed, project-agnostic component axis (A-M, X)

## Status

Accepted

## Context

The GSD unification effort needs a way to classify findings by area that survives contact with future, unrelated projects. The doc-reader's original scheme used series letters (A, B, C...) to mean GSD-specific subsystems: A = LP/OR-Solver, B = Nutrition, etc. That mapping is meaningless outside this one project — a future project has no LP solver and no nutrition domain, so its "A" and "B" would mean something entirely different, defeating the point of a canonical, cross-project ID scheme.

## Decision

Series letters A-M plus X are redefined as a fixed taxonomy of **issue area**, identical in every project the metaharness is ever used against:

A=Architecture, B=Data & Schema, C=Data Quality, D=Data Pipeline, E=Validation & Logic, F=API & Integration, G=UI/UX, H=Testing & QA, I=Build & Tooling, J=Infra & DevOps, K=Security, L=Performance, M=Documentation, X=Cross-cutting.

X is deliberately non-sequential — it reads as "other," not "one more category" — so it doesn't imply a false ordering relative to A-M.

GSD's existing findings are re-letter-mapped to this taxonomy as part of the same scripted reconciliation pass that assigns canonical IDs.

## Considered options

- **Keep GSD's original per-project letter meanings, add a separate cross-project category field.** Rejected — doubles the taxonomy (one for display, one for real classification) for no benefit; the letter itself is supposed to be load-bearing in the canonical ID.
- **Adopt IBM's Orthogonal Defect Classification (ODC) categories.** Rejected — ODC classifies defect *mechanism* (function, interface, checking, algorithm, timing...), not *component/area*. That's a different, orthogonal axis to what's needed here.
- **No fixed taxonomy — let each project define its own letters.** This is the status quo being replaced. Rejected because it's exactly what makes the current corpus project-specific and blocks multi-project support.

## Consequences

- Every finding's canonical ID now carries stable meaning across projects: `gsd:C7` means "GSD's 7th Data-Quality finding"; a future `otherproject:C3` means the analogous thing.
- GSD's findings must be re-letter-mapped as part of the reconciliation pass — real work, not a separate migration.
- The taxonomy is a cross-project contract. Adding/removing/redefining a letter becomes a breaking change across every project built on the metaharness.
- 13 categories is a bet on granularity — if a future project's findings don't fit cleanly, revisit rather than force-fit.
