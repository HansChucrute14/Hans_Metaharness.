-- reconcile-gsd-ids: FULL F1-F7 schema migration
-- Generated: 2026-07-29T01:50:36.569894+00:00
-- Conforms to: ADR-0001-ADR-0006, spec-gsd-id-canonization.md
-- Agent-loop wiring (G3-G8) and discovery-pass LLM (D9) deferred.
-- pipelineTier initialised to 0 (DP longest-distance computation deferred).

-- ---- F1 + F6: Finding concretisation + Project slug ----

ALTER TABLE "Project" ADD COLUMN "slug" TEXT UNIQUE;
-- slug is kebab-case: [a-z][a-z0-9]*(?:-[a-z0-9]+)*
-- Application-layer validation; empty string allowed during migration window.

ALTER TABLE "Finding" ADD COLUMN "canonicalId" TEXT UNIQUE;
-- Format: "project.slug":"series""number" — validated by application layer.
-- Non-null after migration; column added as nullable for backfill then NOT NULL.

ALTER TABLE "Finding" ADD COLUMN "approvedProposalIndex" INTEGER;

ALTER TABLE "Finding" ADD COLUMN "pipelineTier" INTEGER DEFAULT 0;
-- Replaces tier (String "tier0"/"tier1"/etc.).  Initial value 0;
-- DP longest-distance computation deferred to agent-loop spec.

ALTER TABLE "Finding" ADD COLUMN "dependencyConfidence" TEXT DEFAULT 'documented';
-- Enum: "documented" | "discovered".  Default "documented".
-- Required for F3 (discovered-edge exception).

ALTER TABLE "Finding" RENAME COLUMN "findingIds" TO "findingIds_legacy";
-- Legacy column preserved during migration window; removed in follow-up.
-- Grouping moves to UnifiedExecutionModule.addresses per D3/ADR-0001.

ALTER TABLE "Finding" RENAME COLUMN "dependsOn" TO "dependsOn_legacy";
-- Legacy column preserved during migration window; removed in follow-up.
-- Dependency tracking moves to GraphEdge per F2/ADR-0003.

ALTER TABLE "Finding" RENAME COLUMN "task" TO "task_legacy";
-- Legacy label preserved through D8 migration window; dropped in future migration.
-- canonicalId becomes the primary identifier.

-- ---- F2: GraphNode / GraphEdge overlay ----

CREATE TABLE IF NOT EXISTS "GraphNode" (
    "id"                TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "canonicalId"       TEXT NOT NULL UNIQUE REFERENCES "Finding"("canonicalId"),
    "projectId"         TEXT NOT NULL REFERENCES "Project"("id"),
    "findingId"         TEXT NOT NULL UNIQUE REFERENCES "Finding"("id"),
    "pipelineTier"      INTEGER NOT NULL DEFAULT 0,
    "dependencyConfidence" TEXT NOT NULL DEFAULT 'documented',
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "GraphEdge" (
    "id"                TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "fromId"            TEXT NOT NULL REFERENCES "GraphNode"("id"),
    "toId"              TEXT NOT NULL REFERENCES "GraphNode"("id"),
    "kind"              TEXT NOT NULL DEFAULT 'blockedBy',
    "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "GraphEdge_from_to_kind_unique" ON "GraphEdge"("fromId", "toId", "kind");
CREATE INDEX IF NOT EXISTS "GraphEdge_toId_idx" ON "GraphEdge"("toId");

-- ---- F4: Sync infrastructure ----

CREATE TABLE IF NOT EXISTS "DomainEvent" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "entityType"    TEXT NOT NULL CHECK ("entityType" IN ('Finding', 'GraphNode', 'GraphEdge')),
    "entityId"      TEXT NOT NULL,
    "operation"     TEXT NOT NULL CHECK ("operation" IN ('create', 'update', 'delete')),
    "payload"       TEXT NOT NULL DEFAULT '{}',
    "status"        TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'retried', 'failed', 'completed')),
    "retryCount"    INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt"   DATETIME,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DomainEvent_status_idx" ON "DomainEvent"("status");
CREATE INDEX IF NOT EXISTS "DomainEvent_nextRetryAt_idx" ON "DomainEvent"("nextRetryAt");

CREATE TABLE IF NOT EXISTS "DeadLetterQueue" (
    "id"            TEXT NOT NULL PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    "eventId"       TEXT NOT NULL REFERENCES "DomainEvent"("id"),
    "failureReason" TEXT NOT NULL,
    "retryHistory"  TEXT NOT NULL DEFAULT '[]',
    "escalated"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterQueue_eventId_unique" ON "DeadLetterQueue"("eventId");

-- ---- F5: GraphRepository interface contract ----
-- The following comment documents the interface contract implemented by this schema.
-- Full method-body implementation is deferred to the agent-loop spec.
--
-- interface GraphRepository {
--   getNode(canonicalId: string): GraphNode | null;
--   getGraph(projectId: string): nodes: GraphNode[], edges: GraphEdge[];
--   getUnblocked(projectId: string): GraphNode[]; // ordered by pipelineTier ASC, canonicalId ASC
--   upsertNode(node: GraphNodeInput): GraphNode;
--   upsertEdge(edge: GraphEdgeInput): GraphEdge;
--   deleteNode(canonicalId: string): void;
-- }

-- ---- F7: OpencodeSetting validation ----
-- Startup/config validation: workspacePath git remote matches
-- GitHubConfig.repoOwner/repoName for same Project.
-- Full implementation deferred to agent-loop spec.  Schema unchanged.

-- ---- Indexes for graph queries ----
CREATE INDEX IF NOT EXISTS "GraphNode_canonicalId_idx" ON "GraphNode"("canonicalId");
CREATE INDEX IF NOT EXISTS "GraphNode_projectId_idx" ON "GraphNode"("projectId");
CREATE INDEX IF NOT EXISTS "GraphNode_pipelineTier_idx" ON "GraphNode"("pipelineTier");
