# Shared graph library for dependency-graph logic

## Status

Accepted

## Context

The Consolidated Reader has an advanced, production-grade graph engine (Zod validation, referential integrity checks, Kahn's-algorithm auto-layout, fail-closed caching, schema versioning). The Audit Dashboard has no equivalent — its dependency tracking is a flat `dependsOn` string. Both apps need graph capabilities after unification, but duplicating the reader's logic in the dashboard would create two diverging implementations.

## Decision

Extract the graph engine into a **shared library** that both apps import. The library owns:

- `GraphNode` / `GraphEdge` type definitions (canonical shapes)
- Graph validation (Zod schema + referential integrity — ported from the reader's `dependency-graph.ts`)
- Auto-layout computation (Kahn's algorithm — ported from the reader)
- `GraphRepository` interface: `getNode()`, `getGraph()`, `getUnblocked()`, `upsertNode()`, `upsertEdge()`, `deleteNode()`
- Critical Path algorithm (CPM) for `onCriticalPath` derivation
- `pipelineTier` computation (DP longest-distance from root)

## Considered options

- **Dashboard owns all graph logic; reader calls dashboard API.** Rejected — adds HTTP latency; the reader already has the better graph engine; rewriting it in the dashboard is wasted effort.
- **Reader keeps its graph engine; dashboard builds its own from scratch.** Rejected — guaranteed divergence; two implementations of the same algorithm that will drift.
- **Shared library in a workspace package.** Chosen — single implementation, single test suite, both apps get bug fixes and improvements simultaneously.

## Consequences

- The reader's existing `dependency-graph.ts` code is the starting point for the library — not a rewrite.
- The library lives in a location both apps can reference (workspace package or symlinked module).
- The reader's `readFileSync`-based graph loading is replaced with the `GraphRepository` interface backed by Prisma/DB queries.
- The library is versioned independently; both apps declare their dependency explicitly.
