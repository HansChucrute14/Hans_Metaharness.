import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GraphValidationError, parseGraphSource, extractGraphDataBlock } from "@/lib/dependency-graph";
import { readFileSync } from "fs";
import { getBugMapPath } from "@/lib/paths";
import { rateLimit } from "@/lib/api-utils";
import { invalidateDependencyGraphCache as invalidateDbCache } from "@/lib/dependency-graph-db";

export const dynamic = "force-dynamic";

const REPO_SLUG = "gsd-diet-calc";

async function ensureProject(): Promise<string> {
  const existing = await (db as any).project.findFirst({ where: { slug: REPO_SLUG }, select: { id: true } });
  if (existing) return existing.id;
  const ts = new Date().toISOString();
  const proj = await (db as any).project.create({
    data: {
      id: `proj-${REPO_SLUG}`,
      name: "GSD Diet Calculator",
      description: "YAML-synced graph data",
      slug: REPO_SLUG,
      repoOwner: "gsd",
      repoName: "diet-calc",
      createdAt: ts,
      updatedAt: ts,
    },
  });
  return proj.id;
}

export async function POST(request: Request) {
  if (!rateLimit(request, 10)) {
    return NextResponse.json({ ok: false, error: "rate limited" }, { status: 429, headers: { "Retry-After": "60" } });
  }

  try {
    const raw = readFileSync(getBugMapPath(), "utf-8");
    const yamlText = extractGraphDataBlock(raw);
    const source = parseGraphSource(yamlText);

    const projectId = await ensureProject();

    // Upsert Findings + GraphNodes
    let findingsCreated = 0;
    let findingsUpdated = 0;
    let nodesCreated = 0;

    for (const node of source.nodes) {
      const findingId = `find-yaml-${node.id.toLowerCase()}`;
      const ts = new Date().toISOString();

      const existing = await (db as any).finding.findUnique({ where: { id: findingId } });
      if (existing) {
        await (db as any).finding.update({
          where: { id: findingId },
          data: {
            task: node.id,
            canonicalId: node.id,
            title: node.label,
            tier: node.severity === "P0" ? "tier0" : node.severity === "P1" ? "tier1" : "tier2",
            severity: node.severity === "P0" ? "critical" : node.severity === "P1" ? "high" : "medium",
            category: node.subsystem ?? "unclassified",
            summary: node.description,
            claim: node.oneLiner ?? "",
            updatedAt: ts,
          },
        });
        findingsUpdated++;
      } else {
        await (db as any).finding.create({
          data: {
            id: findingId,
            task: node.id,
            canonicalId: node.id,
            findingIds: JSON.stringify([node.id]),
            title: node.label,
            tier: node.severity === "P0" ? "tier0" : node.severity === "P1" ? "tier1" : "tier2",
            severity: node.severity === "P0" ? "critical" : node.severity === "P1" ? "high" : "medium",
            category: node.subsystem ?? "unclassified",
            summary: node.description,
            claim: node.oneLiner ?? "",
            evidence: "",
            dependsOn: "None",
            affectedFiles: "[]",
            projectId,
            createdAt: ts,
            updatedAt: ts,
          },
        });
        findingsCreated++;
      }

      const gnExisting = await (db as any).graphNode.findUnique({ where: { findingId } });
      if (gnExisting) {
        await (db as any).graphNode.update({
          where: { findingId },
          data: { canonicalId: node.id, dependencyConfidence: "documented" },
        });
      } else {
        await (db as any).graphNode.create({
          data: {
            canonicalId: node.id,
            projectId,
            findingId,
            pipelineTier: 0,
            dependencyConfidence: "documented",
          },
        });
        nodesCreated++;
      }
    }

    // Upsert GraphEdges
    let edgesCreated = 0;
    for (const edge of source.edges) {
      const fromNode = await (db as any).graphNode.findUnique({ where: { canonicalId: edge.from } });
      const toNode = await (db as any).graphNode.findUnique({ where: { canonicalId: edge.to } });
      if (!fromNode || !toNode) continue;

      const kind = edge.kind === "blocks" ? "blockedBy" : edge.kind;
      const existing = await (db as any).graphEdge.findFirst({
        where: { fromId: fromNode.id, toId: toNode.id, kind },
      });
      if (!existing) {
        await (db as any).graphEdge.create({
          data: { fromId: fromNode.id, toId: toNode.id, kind },
        });
        edgesCreated++;
      }
    }

    // Compute pipeline tiers (longest-path DP)
    const allNodes = await (db as any).graphNode.findMany({ where: { projectId } });
    const allEdges = await (db as any).graphEdge.findMany({
      where: { kind: "blockedBy", fromNode: { projectId } },
    });

    const nodeIds = new Set(allNodes.map((n: any) => n.id));
    const adj = new Map<string, string[]>();
    for (const n of allNodes) adj.set(n.id, []);
    for (const e of allEdges) {
      if (nodeIds.has(e.toId) && nodeIds.has(e.fromId)) {
        adj.get(e.toId)!.push(e.fromId);
      }
    }

    const dp = new Map<string, number>();
    function dfs(id: string): number {
      if (dp.has(id)) return dp.get(id)!;
      let best = 0;
      for (const pred of adj.get(id) ?? []) {
        best = Math.max(best, dfs(pred) + 1);
      }
      dp.set(id, best);
      return best;
    }
    for (const n of allNodes) dfs(n.id);
    for (const n of allNodes) {
      const tier = dp.get(n.id) ?? 0;
      if (n.pipelineTier !== tier) {
        await (db as any).graphNode.update({ where: { id: n.id }, data: { pipelineTier: tier } });
      }
    }
    const maxTier = Math.max(...dp.values(), 0);

    invalidateDbCache();

    return NextResponse.json({
      ok: true,
      stats: {
        findingsCreated,
        findingsUpdated,
        nodesCreated,
        nodesTotal: allNodes.length,
        edgesCreated,
        edgesTotal: allEdges.length,
        maxPipelineTier: maxTier,
      },
      yamlSource: {
        nodes: source.nodes.length,
        edges: source.edges.length,
        schemaVersion: source.schemaVersion,
      },
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json({ ok: false, error: "validation_failed", issues: e.issues }, { status: 422 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "POST to sync YAML → DB" });
}
