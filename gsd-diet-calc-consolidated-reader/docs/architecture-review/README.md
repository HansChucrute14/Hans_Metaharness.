# Architecture Review — GSD Doc Reader

> A four-document, read-only architectural review of the GSD doc-reader codebase
> (Next.js 16 App Router), produced by the **Staff Backend Architect / Read-Only
> Planning Agent** workflow. Every claim is grounded in an exact `file:line`
> citation. Every major decision is stress-tested by a dual-persona adversarial
> debate. The final document is a deterministic, A2A-machine-readable
> implementation plan.

## Read order (strict)

| # | Document | Phase | Purpose |
|---|---|---|---|
| 1 | [`01-research.md`](./01-research.md) | Phase 1 — Context Gathering & Research | Codebase audit (hardcoded paths, untyped event bus, monolith, unfinished `bug-facts.ts` migration), AI-agent integration map, protocol definition, baseline metrics. Includes §1.7 + §1.8 recheck amendments, §1.9 critical re-audit correction, and **§1.10 cross-cutting recheck** (back-propagation of `04 §12`). |
| 2 | [`02-document1-systemic-review.md`](./02-document1-systemic-review.md) | Phase 2 — Systemic Review & Tri-Option Diagnosis | For each of 8 issues: systemic-risk analysis, remediation, **3 options (X/Y/Union)**, over-engineering audit, priority ordering. Includes §2.9 recheck amendment (2 reversals + 2 refinements) and **§2.10 cross-cutting recheck** (issue-by-issue §12 propagation + self-recheck). |
| 3 | [`03-document2-adversarial-dialectic.md`](./03-document2-adversarial-dialectic.md) | Phase 3 — Dual-Persona Adversarial Dialectic | Persona A (lazy genius) vs Persona B (adversarial senior engineer) debate over 6 structural decisions. Every attack cites `file:line`. Union verdicts synthesize leverage + safety. Includes **recheck amendment** back-propagating §12 through all 6 decisions (Decision 6's premise proved FALSE; Decisions 1/2/3/4/5 hardened). |
| 4 | [`04-document3-implementation-blueprint.md`](./04-document3-implementation-blueprint.md) | Phase 4 — Deterministic A2A Blueprint | Zero-ambiguity execution plan: 8 tasks (T1–T8) with exact `file:line` targets, type signatures, verification steps. Includes §11 final recheck amendment with coverage matrix, and **§12 cross-cutting (5th-pass) recheck** with one BLOCKING regression + 5 amendments + 1 consolidation. |

## The recheck chain (workflow rule)

The workflow mandates: *after each phase, re-check all previous documents and
revise if gaps are found.* This chain is preserved inline so the audit trail is
visible:

- **After Doc 1** → `01-research.md §1.7` (3 refinements surfaced).
- **After Doc 2** → `01-research.md §1.8` (2 reversal impacts) + `02-document1 §2.9` (2 reversals, 2 refinements).
- **After Doc 3** → `04-document3 §11` (coverage matrix, determinism gaps, cross-doc consistency check).
- **Cross-cutting (5th pass)** → `04-document3 §12` (bird's-eye audit). The four documents above are *sequential*; §12 is the cross-cutting pass that spans task boundaries they structurally cannot. It found one **BLOCKING** regression (§12.2: `bug-facts.ts` deletion would ship empty popovers on cold page load) plus 5 high/medium gaps and one consolidation. Every finding is verified against actual `file:line`. §12 amendments are normative — an executing agent MUST apply them.
- **Back-propagation of §12** (audit-chain completeness) → the §12 findings are propagated back through the sequential chain so every document is self-consistent: `01-research.md §1.10` (5 refinements + 1 partial reversal of §1.9's "deletion unblocked"), `02-document1-systemic-review.md §2.10` (issue-by-issue propagation table + self-recheck), `03-document2-adversarial-dialectic.md` recheck amendment (Decision 6's Union-verdict premise proved FALSE at render time; Decisions 1/2/3/4/5 each hardened). §12 remains the normative source for task-level amendments; the earlier-doc amendments are the audit trail of *why*.

## Key findings (TL;DR)

The schema-driven dependency-graph feature (YAML → zod → referential-integrity →
auto-layout → manual-sync) is **complete and verified**. The review targets the
*surrounding* architecture that the feature exposed as rigid/hardcoded:

1. **Untyped CustomEvent bus** (CRITICAL) — 7 event literals scattered across 6 files. Fix: one `src/lib/contracts.ts` registry + `dispatchDocEvent()` + eslint ban on raw dispatch.
2. **Hardcoded absolute paths** — `DOCS_DIR`, `BUG_MAP_PATH`. Fix: lazy `getDocsDir()`/`getBugMapPath()` in `contracts.ts`, fail-fast on missing dir.
3. **Filename-as-schema** — `startsWith("PART-")` heuristics. Fix: `INDEX.yml` registry + never-throw parser + `DOCS_DEV_MODE` auto-discovery + amber warnings banner.
4. **Monolithic `dependency-graph.tsx`** (3661 lines). Fix: 3-phase incremental split, Phase C behind `NEXT_PUBLIC_GRAPH_SPLIT=v1` feature flag with `LegacyCanvas` fallback, ref-not-closure to kill stale-closure bugs.
5. **No dry-run validation** — agent can't validate a proposed YAML edit without risking a cache clobber. Fix: `POST /api/dependency-graph/validate` (body, 256KB cap) + `GET` (re-validate disk), two verbs, no `source` field.
6. **`bug-facts.ts` dual source of truth** — unfinished migration. Fix: one-shot dev script verifies YAML completeness, then repoint call sites to graph payload, then delete. No runtime bridge (sync-fetch is impossible in browser).
7. **No schema-migration path** — `z.literal("1.0.0")` hard-fails 1.1.0. Fix: **defer** (YAGNI); document the typed-migrator pattern in a comment above the schema. Re-open when a v1.1.0 is actually needed.

## Execution order (from Doc 3, amended by §12)

```
T1 (contracts.ts)  →  T2 (wire modules)  →  T3 (INDEX.yml + parser)
                                          →  T4 (validate endpoint)
                                          →  T5 (schema-migration comment)
                                          →  T6a/T6b (monolith Phase A+B)
                                          →  T6c (Phase C, flagged)
                                          →  T7 (eslint rule)
                                          →  T8a/T8b (bug-facts)  →  T8c (delete)  ← GATED
```

T5 and T7 are parallel-safe after T2. T8 is strictly last (multi-PR).

> 🚫 **T8c is BLOCKING-gated on §12.2.** Do NOT delete `bug-facts.ts` until the
> §12.2 fetch-strategy is implemented and cold-start-verified (fresh page load,
> dialog never opened, popover still renders). Without it, every ID-link popover
> renders empty on cold start — the exact regression Decision 6 was written to
> prevent. See `04-document3 §12.2` for the full protocol.
>
> §12 also amends T1 (env-var path override, dispatchDocEvent boolean, validateRegistry),
> T3 (schemaVersion validation + exact-case gate), T6c (target-check popover fix +
> Playwright regression gate), and T8b (Map-based O(1) lookup). Read §12 before
> executing any of those tasks.

## What this review deliberately does NOT do

- No new framework (stays Next.js 16 / Zustand / zod).
- No auth layer (app has none; sync/validate only re-read disk).
- No database (app is file-backed by design; graph cache is in-memory).
- No full rewrite of `docs-parser.ts` (only the hardcoded `DOCS_DIR` + `startsWith` heuristics change).
- No pre-scaffolding of unused abstractions (schema-migration migrator, runtime bug-facts bridge — both deferred per the solo-maintainer rule).

## Status

**Review complete.** Documents are ready for A2A execution. No code was written
during this review (read-only planning agent constraint). The next session may
pick up Document 3 task T1 and proceed — **applying the §12 cross-cutting
amendments** (env-var paths, dispatchDocEvent boolean decision, validateRegistry,
schemaVersion validation, exact-case gate, target-check popover fix, Playwright
gate, and the §12.2 fetch-strategy that gates T8c).
