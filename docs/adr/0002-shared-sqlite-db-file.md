# Shared SQLite DB file between Audit Dashboard and Consolidated Reader

## Status

Accepted

## Context

The metaharness has two applications (Audit Dashboard, Consolidated Reader) that need to read from the same data layer. The plan originally called for "two separate applications, interlinked via a shared data layer" without specifying the mechanism. Options included each app having its own DB and syncing, the reader calling the dashboard's REST API for all data, or both pointing to the same SQLite file.

## Decision

Both applications point to the **same SQLite database file** via their respective Prisma clients. The Audit Dashboard owns writes (findings, proposals, graph mutations, agent actions). The Consolidated Reader is read-only — it never writes to the DB directly. The two apps share one Prisma schema (defined in a location both can reference).

## Considered options

- **Dashboard REST API as data layer.** Rejected — adds HTTP latency, requires maintaining an API surface that maps to every query the reader needs, and introduces a deployment dependency between the two apps.
- **Each app has its own DB, synced periodically.** Rejected — introduces sync windows, conflict resolution, and two potential sources of truth. The whole point of unification is eliminating this.
- **Static export only.** Rejected — the reader's graph dialog is 3,900 lines of interactive components that need live data, not a snapshot.
- **Shared package with Prisma client, same DB file.** Chosen — simplest, lowest latency, single source of truth.

## Consequences

- The reader's current Prisma schema (User/Post scaffold) is replaced with the unified schema.
- The reader's `getDependencyGraph()` switches from `readFileSync` to Prisma queries against the shared DB.
- Both apps must be on the same filesystem (or the DB path must be a network mount).
- Schema migrations run from one app (the dashboard) and the reader picks them up on next cold start.
- No HTTP API surface to maintain for data access — the shared schema IS the contract.
