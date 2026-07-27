import { NextResponse } from "next/server";
import {
  parseDependencyGraph,
  serializeDependencyGraph,
} from "@/lib/dependency-graph";
import { rateLimit } from "@/lib/api-utils";

// In dev, Next.js does not cache route handlers by default, so each request
// re-reads the .md files — exactly what we want for live edits.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // F-05: rate-limit to prevent cheap DoS amplification.
  if (!rateLimit(request)) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const graph = parseDependencyGraph();
  return NextResponse.json(serializeDependencyGraph(graph), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
