# Bidirectional YAML ↔ DB graph editing with DB as source of truth

## Status

Accepted

## Context

The Consolidated Reader's graph data currently lives in a YAML block inside `BUG-DEPENDENCY-MAP.md`, validated by a Zod schema, and parsed at runtime. The Audit Dashboard will soon have GraphNode/GraphEdge tables in the DB. Both surfaces have legitimate use cases: power users want YAML for bulk edits and version-controlled diffs; casual users want a UI. Neither should be the sole editor.

## Decision

The graph has two editing surfaces, with the **DB as the canonical source of truth**:

1. **Dashboard UI** — form-based editing of individual nodes/edges. Writes directly to the DB.
2. **BUG-DEPENDENCY-MAP.md YAML** — version-controlled export of the DB. Human-editable for bulk operations.

A **validated import command** (reusing the reader's existing Zod schema + fail-closed pattern) reads YAML, validates it, and writes to the DB. A **generation script** exports the DB back to YAML. The YAML carries a provenance header:

```
# Generated from DB: 2026-07-28T21:00:00Z — manual edits will be lost on next export
```

or after a manual edit:

```
# Edited manually — run 'sync-graph' to write to DB
```

The import is **fail-closed**: bad YAML validation leaves the DB untouched (same pattern as the reader's existing `reparseDependencyGraphNow()`).

## Considered options

- **YAML file as sole editor, synced to DB.** Rejected — excludes dashboard users who prefer UI; YAML is intimidating for non-technical users.
- **Dashboard UI as sole editor; YAML deleted.** Rejected — loses version-controlled diff, bulk-editing capability, and the existing validated-YAML workflow.
- **Both, DB is source of truth, with provenance header.** Chosen — no ambiguity about which state is canonical; each surface serves its audience.

## Consequences

- The reader's existing Zod validation and fail-closed caching are reused as the import gate — no new validation code needed.
- The import script must be idempotent — running it twice with the same YAML produces the same DB state.
- The provenance header prevents confusion about which version is current.
- Any YAML file can be checked into git and later imported, enabling branch-based graph changes.
- The sync/import command becomes a new entry point in both apps (CLI command or UI button).
