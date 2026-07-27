/**
 * Schema-driven dependency graph — replaces the hand-curated NODE_TABLE /
 * EDGE_TABLE with a single validated YAML source block parsed from
 * BUG-DEPENDENCY-MAP.md §D-DATA.
 *
 * Design: DEPENDENCY-GRAPH-SCHEMA-DESIGN.md
 *   - One YAML block inside the existing .md is the source of truth.
 *   - Zod schema validates shape; a post-validation pass enforces referential
 *     integrity (edge endpoints exist, lane refs resolve, no dup ids).
 *   - Lane-based auto-layout (x = lane order, y = intra-lane topo rank) with
 *     optional per-node x/y overrides — day-1 migration seeds every existing
 *     curated coordinate as an override, so the visual is pixel-identical.
 *   - Module-level cache. NOT re-parsed per request (unlike docs-parser's 60s
 *     TTL). Re-parsed only on cold start or when a human clicks "Sync graph"
 *     (POST /api/dependency-graph/sync → invalidateDependencyGraphCache()).
 *   - Fail-closed: a bad edit validates to 422 and the previously cached graph
 *     keeps serving; never breaks live traffic.
 *
 * `DependencyGraph` / `GraphNode` / `GraphEdge` shapes are backward-compatible
 * with the prior hand-curated module, so the 3.9k-line dialog component needs
 * zero changes. `GraphNode` is EXTENDED with optional bug-fact fields
 * (subsystem / oneLiner / repairs / blockedBy / onCriticalPath) so the graph
 * payload is self-describing; the legacy `bug-facts.ts` stays as a client-safe
 * mirror for doc-reader popovers (its callers can't call fs / the API directly).
 */

import { readFileSync } from "fs";
import { z } from "zod";
import { load as yamlLoad } from "js-yaml";
import { getBugMapPath } from "@/lib/paths";

// ---------- public types (backward-compatible) ----------

export type NodeKind = "task" | "gate" | "priority";
export type Severity = "P0" | "P1" | "P2" | "P3" | null;
export type EdgeKind = "blocks" | "pending" | "recommended" | "backstops";

export interface GraphNode {
  id: string;          // e.g. "B7", "G3"
  label: string;       // short label shown on the node
  kind: NodeKind;
  severity: Severity;
  description: string; // longer tooltip text
  status?: "pending" | "resolved" | "urgent" | "independent" | null;
  x: number;
  y: number;
  namespace?: "task" | "gate";
  lane?: string;
  // ---- bug-fact fields (optional; populated from §D-DATA when present) ----
  subsystem?: string;
  oneLiner?: string;
  repairs?: string[];
  blockedBy?: string[];
  onCriticalPath?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sectionContent: string; // raw §D prose (ASCII graph) for reference
  generatedAt: string;
}

// ---------- zod schema (mirrors the JSON Schema in the design doc §2) ----------

const laneSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, "lane id must be kebab-case"),
  label: z.string(),
  order: z.number().int().min(0),
});

const nodeSchema = z.object({
  id: z
    .string()
    .regex(
      /^(B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5]|G[1-3])$/,
      "node id must match the app's ID-registry regex (APP-OVERVIEW §4.4)"
    ),
  namespace: z.enum(["task", "gate"]),
  kind: z.enum(["task", "gate", "priority"]),
  severity: z.enum(["P0", "P1", "P2", "P3"]).nullable().default(null),
  status: z
    .enum(["pending", "resolved", "urgent", "independent"])
    .nullable()
    .default(null),
  label: z.string(),
  description: z.string(),
  lane: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  repairs: z.array(z.string()).default([]),
  blockedBy: z.array(z.string()).default([]),
  onCriticalPath: z.boolean().default(false),
  subsystem: z.string().optional(),
  oneLiner: z.string().optional(),
});

const edgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(["blocks", "pending", "recommended", "backstops"]),
  label: z.string().optional(),
});

/**
 * SCHEMA VERSIONING & MIGRATION PATTERN
 * --------------------------------------
 * Today: schemaVersion is z.literal("1.0.0"). A block declaring any other
 * version hard-fails (correct — we can't silently misread).
 *
 * When a v1.1.0 is needed, follow this pattern (do NOT pre-scaffold — YAGNI):
 *
 *   1. Define v1_1_0 = v1_0_0.extend({ schemaVersion: z.literal("1.1.0"), ...newFields }).
 *   2. Define a TYPED migrator map:
 *        const MIGRATORS = {
 *          "1.0.0": {
 *            from: v1_0_0, to: v1_1_0,
 *            fn: (s: z.infer<typeof v1_0_0>): z.infer<typeof v1_1_0> => ({ ...s, schemaVersion: "1.1.0", ... })
 *          },
 *        } as const;
 *   3. migrate(source): walk MIGRATORS chain. Guard with MAX_MIGRATIONS=10 to
 *      prevent infinite loops if a migrator forgets to bump schemaVersion.
 *   4. Bump CURRENT_SCHEMA_VERSION. parseGraphSource() calls migrate() before
 *      the final v1_1_0 parse.
 *   5. Fail-closed: on migration error, throw GraphValidationError; cache
 *      untouched (same contract as reparseDependencyGraphNow at line 495).
 *
 * The migrator map is TYPED (z.infer in/out) — no `any`. An unused scaffold
 * today would be dead code; this comment is the scaffold.
 */
const graphSourceSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  lanes: z.array(laneSchema),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});

export type Lane = z.infer<typeof laneSchema>;
export type GraphSourceNode = z.infer<typeof nodeSchema>;
export type GraphSourceEdge = z.infer<typeof edgeSchema>;
export type GraphSource = z.infer<typeof graphSourceSchema>;

// ---------- validation error ----------

export interface GraphValidationIssue {
  path: string;
  message: string;
}

export class GraphValidationError extends Error {
  issues: GraphValidationIssue[];
  constructor(issues: GraphValidationIssue[]) {
    super(
      `dependency-graph validation failed: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join("; ")}`
    );
    this.name = "GraphValidationError";
    this.issues = issues;
  }
}

// ---------- §D-DATA YAML extractor ----------
//
// Finds the "## §D-DATA." heading, then the first ```yaml ... ``` fenced block
// inside it. Mirrors the existing extractSectionD shape so it's not a new
// mental model.

export function extractGraphDataBlock(rawMarkdown: string): string {
  const lines = rawMarkdown.split("\n");
  const startIdx = lines.findIndex((l) => /^##\s+§D-DATA\./.test(l));
  if (startIdx === -1) {
    throw new GraphValidationError([
      {
        path: "§D-DATA",
        message:
          "missing '## §D-DATA.' heading in BUG-DEPENDENCY-MAP.md — cannot find machine-readable graph block",
      },
    ]);
  }
  // find the section end (next ## heading)
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const section = lines.slice(startIdx, endIdx);
  // find the first ```yaml fence inside the section
  const fenceStart = section.findIndex((l) => /^```ya?ml\s*$/i.test(l));
  if (fenceStart === -1) {
    throw new GraphValidationError([
      {
        path: "§D-DATA/code-fence",
        message:
          "found §D-DATA heading but no ```yaml fenced block inside it",
      },
    ]);
  }
  let fenceEnd = -1;
  for (let i = fenceStart + 1; i < section.length; i++) {
    if (/^```\s*$/.test(section[i])) {
      fenceEnd = i;
      break;
    }
  }
  if (fenceEnd === -1) {
    throw new GraphValidationError([
      {
        path: "§D-DATA/code-fence",
        message: "yaml code fence opened but never closed",
      },
    ]);
  }
  return section.slice(fenceStart + 1, fenceEnd).join("\n");
}

// ---------- referential-integrity pass (rules the JSON Schema can't express) ----------

function checkReferentialIntegrity(source: GraphSource): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const laneIds = new Set(source.lanes.map((l) => l.id));

  // rule 3: no duplicate (namespace, id) pairs
  const seen = new Set<string>();
  for (const n of source.nodes) {
    const key = `${n.namespace}:${n.id}`;
    if (seen.has(key)) {
      issues.push({
        path: `nodes[${n.namespace}:${n.id}]`,
        message: `duplicate (namespace, id) pair — collision`,
      });
    }
    seen.add(key);
  }

  // rule 2: every node.lane must exist in lanes[].id
  for (const n of source.nodes) {
    if (!laneIds.has(n.lane)) {
      issues.push({
        path: `nodes[${n.id}].lane`,
        message: `lane "${n.lane}" is not defined in lanes[] (known: ${[...laneIds].join(", ")})`,
      });
    }
  }

  // Build an id → count index for edge-endpoint resolution.
  // IDs are namespace-scoped per the design; we resolve edges by bare id and
  // require global uniqueness of the id string among nodes (true for our data;
  // if a future finding-kind node shares an id with a task, the design's
  // namespace scoping kicks in and edges would need a namespace-qualified form
  // — flagged here as an error so it can't silently misresolve).
  const idCounts = new Map<string, number>();
  for (const n of source.nodes) {
    idCounts.set(n.id, (idCounts.get(n.id) ?? 0) + 1);
  }

  // rule 1: every edges[].from / .to must exist in nodes[].id
  for (let i = 0; i < source.edges.length; i++) {
    const e = source.edges[i];
    for (const [field, val] of [
      ["from", e.from],
      ["to", e.to],
    ] as const) {
      const cnt = idCounts.get(val);
      if (cnt === undefined) {
        issues.push({
          path: `edges[${i}].${field}`,
          message: `"${val}" does not match any node id`,
        });
      } else if (cnt > 1) {
        issues.push({
          path: `edges[${i}].${field}`,
          message: `"${val}" matches ${cnt} nodes (namespace-scoped collision) — edges require globally-unique node ids`,
        });
      }
    }
  }

  // sanity: lane orders must be unique
  const orderSeen = new Set<number>();
  for (const l of source.lanes) {
    if (orderSeen.has(l.order)) {
      issues.push({
        path: `lanes[${l.id}].order`,
        message: `lane order ${l.order} is used by more than one lane`,
      });
    }
    orderSeen.add(l.order);
  }

  return issues;
}

// ---------- parse pipeline ----------

export function parseGraphSource(yamlText: string): GraphSource {
  let parsed: unknown;
  try {
    parsed = yamlLoad(yamlText);
  } catch (e) {
    throw new GraphValidationError([
      {
        path: "yaml",
        message: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
      },
    ]);
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new GraphValidationError([
      {
        path: "root",
        message: "YAML parsed to a non-object (expected a graph document)",
      },
    ]);
  }
  const result = graphSourceSchema.safeParse(parsed);
  if (!result.success) {
    throw new GraphValidationError(
      result.error.issues.map((iss) => ({
        path: iss.path.join(".") || "(root)",
        message: iss.message,
      }))
    );
  }
  const integrityIssues = checkReferentialIntegrity(result.data);
  if (integrityIssues.length > 0) {
    throw new GraphValidationError(integrityIssues);
  }
  return result.data;
}

// ---------- auto-layout (§3 of the design) ----------

const LANE_WIDTH = 220;
const LANE_PADDING_X = 140; // x of lane with order 0
const NODE_HEIGHT = 180;
const LANE_PADDING_Y = 100; // y of rank 0 within a lane

/**
 * Compute (x, y) for every node. If a node has explicit `x`/`y` in the source,
 * those override the computed values (escape hatch for crowded lanes). The
 * computed layout is:
 *   x = LANE_PADDING_X + laneIndex(node.lane) * LANE_WIDTH
 *   y = LANE_PADDING_Y + withinLaneRank(node) * NODE_HEIGHT
 * where withinLaneRank is a topological sort restricted to intra-lane `blocks`
 * edges, falling back to source order for nodes with no intra-lane edges.
 */
function computeLayout(source: GraphSource): GraphNode[] {
  const lanesByOrder = [...source.lanes].sort((a, b) => a.order - b.order);
  const laneIndex = new Map<string, number>();
  lanesByOrder.forEach((l, i) => laneIndex.set(l.id, i));

  // group nodes by lane, preserving source order
  const byLane = new Map<string, GraphSourceNode[]>();
  for (const n of source.nodes) {
    const arr = byLane.get(n.lane) ?? [];
    arr.push(n);
    byLane.set(n.lane, arr);
  }

  // For each lane, compute a within-lane rank via topo sort on intra-lane
  // `blocks` edges. Nodes with no intra-lane predecessors keep their source
  // order; this stabilises the layout for lanes that have no internal edges
  // (the independents lane, the regression lane).
  const rankById = new Map<string, number>();

  for (const lane of lanesByOrder) {
    const members = byLane.get(lane.id) ?? [];
    if (members.length === 0) continue;
    const memberIds = new Set(members.map((m) => m.id));
    // adjacency: predecessor list (who blocks me, within this lane)
    const preds = new Map<string, string[]>();
    const succs = new Map<string, string[]>();
    for (const m of members) {
      preds.set(m.id, []);
      succs.set(m.id, []);
    }
    for (const e of source.edges) {
      if (e.kind !== "blocks") continue;
      if (!memberIds.has(e.from) || !memberIds.has(e.to)) continue;
      preds.get(e.to)!.push(e.from);
      succs.get(e.from)!.push(e.to);
    }
    // Kahn's algorithm seeded by source order (stable)
    const inDeg = new Map<string, number>();
    for (const m of members) inDeg.set(m.id, preds.get(m.id)!.length);
    const queue = members.filter((m) => inDeg.get(m.id) === 0).map((m) => m.id);
    const ordered: string[] = [];
    const seenInQueue = new Set(queue);
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(id);
      // push successors whose in-degree drops to 0; preserve source order
      const nextSuccs = succs
        .get(id)!
        .filter((s) => !seenInQueue.has(s))
        .sort(
          (a, b) =>
            members.findIndex((m) => m.id === a) -
            members.findIndex((m) => m.id === b)
        );
      for (const s of nextSuccs) {
        seenInQueue.add(s);
        inDeg.set(s, (inDeg.get(s) ?? 1) - 1);
        if (inDeg.get(s) === 0) queue.push(s);
      }
    }
    // any nodes not reached (cycle?) get appended in source order
    for (const m of members) {
      if (!ordered.includes(m.id)) ordered.push(m.id);
    }
    ordered.forEach((id, rank) => rankById.set(id, rank));
  }

  return source.nodes.map((n) => {
    const li = laneIndex.get(n.lane) ?? 0;
    const rank = rankById.get(n.id) ?? 0;
    const computedX = LANE_PADDING_X + li * LANE_WIDTH;
    const computedY = LANE_PADDING_Y + rank * NODE_HEIGHT;
    return {
      id: n.id,
      label: n.label,
      kind: n.kind,
      severity: n.severity,
      status: n.status,
      description: n.description,
      x: n.x ?? computedX,
      y: n.y ?? computedY,
      namespace: n.namespace,
      lane: n.lane,
      subsystem: n.subsystem,
      oneLiner: n.oneLiner,
      repairs: n.repairs,
      blockedBy: n.blockedBy,
      onCriticalPath: n.onCriticalPath,
    } satisfies GraphNode;
  });
}

// ---------- §D prose extractor (kept for sectionContent backward-compat) ----------

function extractSectionD(rawMarkdown: string): string {
  const lines = rawMarkdown.split("\n");
  const startIdx = lines.findIndex((l) => /^##\s+§D\./.test(l));
  if (startIdx === -1) return "";
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  // stop §D at the §D-DATA heading if it appears inside (so sectionContent
  // holds only the human-readable prose, not the machine block)
  const dataIdx = lines
    .slice(startIdx, endIdx)
    .findIndex((l) => /^##\s+§D-DATA\./.test(l));
  if (dataIdx !== -1) {
    return lines.slice(startIdx, startIdx + dataIdx).join("\n");
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

// ---------- module-level cache (manual-sync, NOT per-request) ----------

let cachedGraph: DependencyGraph | null = null;
let cachedAt: number | null = null;

export function invalidateDependencyGraphCache(): void {
  cachedGraph = null;
  cachedAt = null;
}

export function getDependencyGraph(): DependencyGraph {
  if (cachedGraph && cachedAt) return cachedGraph;
  const raw = readFileSync(getBugMapPath(), "utf-8");
  const yamlText = extractGraphDataBlock(raw);
  const source = parseGraphSource(yamlText);
  const nodes = computeLayout(source);
  const edges: GraphEdge[] = source.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    label: e.label,
  }));
  const sectionContent = extractSectionD(raw);
  cachedGraph = {
    nodes,
    edges,
    sectionContent,
    generatedAt: new Date().toISOString(),
  };
  cachedAt = Date.now();
  return cachedGraph;
}

/**
 * Backward-compatible alias. The prior module wrapped this in React `cache()`
 * (request-scoped); the new module uses a module-level cache that persists
 * across requests until explicitly invalidated via the sync button. This is
 * the intended behaviour change — see DEPENDENCY-GRAPH-SCHEMA-DESIGN.md §5.
 */
export const parseDependencyGraph = getDependencyGraph;

/**
 * Re-parse from disk right now, bypassing and refreshing the cache. Returns
 * the fresh graph on success. On validation failure throws GraphValidationError
 * and leaves the previously-cached graph intact (fail-closed) so live traffic
 * keeps serving stale-but-valid data until a human fixes the YAML.
 */
export function reparseDependencyGraphNow(): DependencyGraph {
  const raw = readFileSync(getBugMapPath(), "utf-8");
  const yamlText = extractGraphDataBlock(raw);
  const source = parseGraphSource(yamlText); // throws on bad YAML — cache untouched
  const nodes = computeLayout(source);
  const edges: GraphEdge[] = source.edges.map((e) => ({
    from: e.from,
    to: e.to,
    kind: e.kind,
    label: e.label,
  }));
  const sectionContent = extractSectionD(raw);
  const fresh: DependencyGraph = {
    nodes,
    edges,
    sectionContent,
    generatedAt: new Date().toISOString(),
  };
  cachedGraph = fresh;
  cachedAt = Date.now();
  return fresh;
}

/** Epoch-ms of the last successful cache population, or null if cold. */
export function getDependencyGraphCachedAt(): number | null {
  return cachedAt;
}

// ---------- serialization helper (for JSON response) ----------

export function serializeDependencyGraph(graph: DependencyGraph) {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    sectionContent: graph.sectionContent,
    generatedAt: graph.generatedAt,
  };
}
