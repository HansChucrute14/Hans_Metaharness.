# Domain Docs

This repo uses a **single-context** layout — one `CONTEXT.md` and one `docs/adr/` directory at the repo root. No `CONTEXT-MAP.md` exists.

## Consumer rules

Any skill that touches this repo's code or data MUST:

1. **Read `CONTEXT.md` first.** Use the vocabulary defined there. If a term you're about to use isn't in the glossary, propose adding it rather than inventing an untraceable synonym.
2. **Honor ADRs.** Before making a decision that contradicts an ADR, surface the contradiction and propose superseding the ADR (don't silently override it). Use the ADR's `Status` field (`proposed`, `accepted`, `deprecated`, `superseded by ADR-NNNN`) to determine weight.
3. **Update `CONTEXT.md` lazily.** Only add a term when it's resolved — not speculatively. Never write implementation details into the glossary; it's a pure vocabulary record.
4. **Create ADRs sparingly.** Only when all three are true: hard to reverse, surprising without context, result of a real trade-off (`docs/adr/NNNN-slug.md`).

## Where things live

- `CONTEXT.md` — project glossary (Domain, Data Models, Graph Model, Data Flow, Decision Gates, Agent Workflow, Critical Path, Legacy ID Namespaces)
- `docs/adr/` — Architecture Decision Records, numbered sequentially:
  - `0001-area-of-issue-taxonomy.md`
  - `0002-shared-sqlite-db-file.md`
  - `0003-shared-graph-library.md`
  - `0004-opaque-canonical-ids.md`
  - `0005-bidirectional-yaml-db-graph-editing.md`
  - `0006-gsd-id-reconciliation.md`
- `docs/agents/` — this directory; per-skill configuration (issue tracker, triage labels, this domain docs file)
