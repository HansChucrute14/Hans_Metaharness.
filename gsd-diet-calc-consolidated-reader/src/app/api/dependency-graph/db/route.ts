import { NextResponse } from "next/server";
import { getDependencyGraph } from "@/lib/dependency-graph-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const graph = await getDependencyGraph();
    return NextResponse.json(graph, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load graph from DB" },
      { status: 503 },
    );
  }
}
