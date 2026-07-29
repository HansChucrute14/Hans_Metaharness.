# Canonical IDs are opaque and persistent; properties are separate

## Status

Accepted

## Context

The unification needs a new canonical ID system that works across projects. The natural instinct is to encode semantics into the ID — severity, priority, area, dependency depth — so the ID is self-describing. But encoding mutable properties into an identifier creates instability: if severity changes, either the ID changes (breaking every reference) or the ID lies about its own properties.

## Decision

Canonical IDs follow a simple, opaque, persistent format: `{project}:{series}{number}` (e.g., `gsd:C7`). All other dimensions — severity, pipeline tier, title, description, dependency edges, critical-path status, verification status — are queryable **properties** stored in the Finding record and graph overlay. The ID itself encodes nothing except project scope and area-of-issue series letter.

Properties auto-update when the graph mutates (pipeline tier, critical path) or when a human edits them (severity, verification status). The ID never changes for the lifetime of the Finding.

## Considered options

- **Rich/encoded IDs** (e.g., `gsd:C7-P3-T2-CRITICAL`). Rejected — severity changes would require ID migration; old documents become stale; adds parsing complexity for no benefit over querying properties.
- **UUIDs.** Rejected — human-unfriendly; the series+number pattern aids quick reference in discussions.
- **Sequential integers per project (no series letter).** Rejected — the series letter groups findings by area, which is valuable for scanning and triage without a query.
- **Opaque `{project}:{series}{number}` format. Chosen.**

## Consequences

- The ID never causes a cascading update if a finding's properties change.
- The mapping table (legacy → canonical) is built once and never needs updating.
- The ID is human-readable and scannable.
- External references (documents, GitHub issues, commit messages) are stable across the lifetime of the finding.
- The `dependencyConfidence` system (discovered vs. documented edges) has stable node references regardless of graph recomputation.
