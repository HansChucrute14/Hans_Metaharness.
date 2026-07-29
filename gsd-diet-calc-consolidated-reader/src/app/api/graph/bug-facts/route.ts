import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const PROJECT_SLUG = "gsd-diet-calc";
  const project = await (db as any).project.findFirst({
    where: { slug: PROJECT_SLUG },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({}, { status: 200 });
  }

  const nodes = await (db as any).graphNode.findMany({
    where: { projectId: project.id },
    include: { finding: true },
  });

  const facts: Record<string, any> = {};
  for (const n of nodes) {
    const f = n.finding;
    if (!f) continue;
    facts[n.canonicalId] = {
      id: n.canonicalId,
      label: f.title ?? n.canonicalId,
      severity: f.severity === "critical" ? "P0" : f.severity === "high" ? "P1" : "P2",
      kind: "task",
      description: f.summary ?? "",
      status: "open",
      subsystem: f.category ?? "unclassified",
      oneLiner: f.claim ?? "",
      repairs: [],
      blockedBy: [],
      onCriticalPath: false,
      pipelineTier: n.pipelineTier ?? 0,
    };
  }

  return NextResponse.json(facts, {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
