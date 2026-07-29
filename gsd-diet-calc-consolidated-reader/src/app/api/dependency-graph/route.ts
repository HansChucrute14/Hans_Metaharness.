import { NextResponse } from "next/server";
import {
  parseDependencyGraph,
  serializeDependencyGraph,
} from "@/lib/dependency-graph";
import { getDependencyGraph as getDbGraph } from "@/lib/dependency-graph-db";
import { rateLimit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!rateLimit(request)) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "yaml";

  if (source === "db") {
    try {
      const graph = await getDbGraph();
      return NextResponse.json(graph, {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "DB graph unavailable" },
        { status: 503 },
      );
    }
  }

  const graph = parseDependencyGraph();
  return NextResponse.json(serializeDependencyGraph(graph), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
