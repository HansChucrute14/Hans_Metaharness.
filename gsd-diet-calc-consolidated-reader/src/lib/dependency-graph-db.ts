import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type Severity = "P0" | "P1" | "P2" | "P3" | null;

export interface GraphNode {
  id: string;
  label: string;
  kind: "task" | "gate" | "priority";
  severity: Severity;
  description: string;
  status?: string | null;
  x: number;
  y: number;
  namespace?: string | null;
  lane?: string | null;
  subsystem?: string | null;
  oneLiner?: string | null;
  repairs?: string[];
  blockedBy?: string[];
  onCriticalPath?: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  label?: string;
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  sectionContent: string;
  generatedAt: string;
}

const REPO_SLUG = "gsd-diet-calc";
const LANE_WIDTH = 220;
const LANE_PADDING_X = 140;
const NODE_HEIGHT = 180;
const LANE_PADDING_Y = 100;

function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const byLane = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    const lane = n.lane ?? "default";
    const arr = byLane.get(lane) ?? [];
    arr.push(n);
    byLane.set(lane, arr);
  }
  const laneIds = [...byLane.keys()].sort();
  const laneIndex = new Map(laneIds.map((id, i) => [id, i]));
  const rankById = new Map<string, number>();
  for (const lane of laneIds) {
    const members = byLane.get(lane) ?? [];
    if (members.length === 0) continue;
    const memberIds = new Set(members.map((m) => m.id));
    const preds = new Map<string, string[]>();
    const succs = new Map<string, string[]>();
    for (const m of members) { preds.set(m.id, []); succs.set(m.id, []); }
    for (const e of edges) {
      if (e.kind !== "blocks") continue;
      if (!memberIds.has(e.from) || !memberIds.has(e.to)) continue;
      preds.get(e.to)!.push(e.from);
      succs.get(e.from)!.push(e.to);
    }
    const inDeg = new Map<string, number>();
    for (const m of members) inDeg.set(m.id, preds.get(m.id)!.length);
    const queue = members.filter((m) => inDeg.get(m.id) === 0).map((m) => m.id);
    const ordered: string[] = [];
    const seenInQueue = new Set(queue);
    while (queue.length > 0) {
      const id = queue.shift()!;
      ordered.push(id);
      const next = succs.get(id)!.filter((s) => !seenInQueue.has(s))
        .sort((a, b) => members.findIndex((m) => m.id === a) - members.findIndex((m) => m.id === b));
      for (const s of next) { seenInQueue.add(s); inDeg.set(s, (inDeg.get(s) ?? 1) - 1); if (inDeg.get(s) === 0) queue.push(s); }
    }
    for (const m of members) { if (!ordered.includes(m.id)) ordered.push(m.id); }
    ordered.forEach((id, rank) => rankById.set(id, rank));
  }
  return nodes.map((n) => {
    const li = laneIndex.get(n.lane ?? "default") ?? 0;
    const rank = rankById.get(n.id) ?? 0;
    return { ...n, x: LANE_PADDING_X + li * LANE_WIDTH, y: LANE_PADDING_Y + rank * NODE_HEIGHT };
  });
}

function severityFromTier(tier?: string | null): Severity {
  if (!tier) return null;
  if (tier === "tier0") return "P0";
  if (tier === "tier1") return "P1";
  if (tier === "tier2") return "P2";
  return null;
}

let cachedGraph: DependencyGraph | null = null;
let cachedAt: number | null = null;

export function invalidateDependencyGraphCache(): void {
  cachedGraph = null;
  cachedAt = null;
}

export async function getDependencyGraph(): Promise<DependencyGraph> {
  if (cachedGraph && cachedAt) return cachedGraph;

  const proj = await (db as any).project.findFirst({ where: { slug: REPO_SLUG }, select: { id: true } });
  if (!proj) throw new Error(`Project "${REPO_SLUG}" not found`);

  const [dbNodes, dbEdges] = await Promise.all([
    (db as any).graphNode.findMany({ where: { projectId: proj.id }, include: { finding: true } }),
    (db as any).graphEdge.findMany({
      where: { OR: [{ fromNode: { projectId: proj.id } }, { toNode: { projectId: proj.id } }] },
    }),
  ]);

  const nodes: GraphNode[] = dbNodes.map((n: any) => ({
    id: n.canonicalId,
    label: n.finding?.title ?? n.canonicalId,
    kind: n.finding?.tier === "gate" ? "gate" : "task",
    severity: severityFromTier(n.finding?.tier),
    description: n.finding?.summary ?? "",
    status: n.finding?.verificationStatus ?? null,
    x: 0, y: 0,
    namespace: null, lane: null,
    subsystem: n.finding?.category ?? null,
    oneLiner: n.finding?.claim ?? null,
    repairs: [],
    blockedBy: [],
    onCriticalPath: n.pipelineTier === 0,
  }));

  const edges: GraphEdge[] = dbEdges.map((e: any) => ({
    from: e.fromId,
    to: e.toId,
    kind: e.kind === "blockedBy" ? "blocks" : e.kind,
  }));

  const laidOut = computeLayout(nodes, edges);
  cachedGraph = { nodes: laidOut, edges, sectionContent: "", generatedAt: new Date().toISOString() };
  cachedAt = Date.now();
  return cachedGraph;
}

export function getDependencyGraphCachedAt(): number | null {
  return cachedAt;
}
