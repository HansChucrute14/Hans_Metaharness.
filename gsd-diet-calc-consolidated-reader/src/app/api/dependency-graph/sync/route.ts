import { NextResponse } from "next/server";
import {
  reparseDependencyGraphNow,
  serializeDependencyGraph,
  GraphValidationError,
  getDependencyGraphCachedAt,
} from "@/lib/dependency-graph";
import { rateLimit } from "@/lib/api-utils";

/**
 * POST /api/dependency-graph/sync
 *
 * Manual re-parse of BUG-DEPENDENCY-MAP.md §D-DATA. Re-reads from disk,
 * validates with zod + referential-integrity pass, and on success replaces the
 * module-level cache with the fresh graph.
 *
 * Fail-closed: if validation fails, returns 422 with the zod/integrity issues
 * and the previously-cached graph keeps serving live traffic. A typo in the
 * YAML degrades to "stale until fixed", never "broken for everyone".
 *
 * Tighter rate-limit bucket than GET (capacity=10 vs 60) — this is an explicit
 * human action, not passive polling, so we don't want it hammered.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!rateLimit(request, 10)) {
    return NextResponse.json(
      {
        ok: false,
        error: "rate limited",
        message:
          "Too many sync requests. Wait a minute and try again — sync is a manual action, not a polling loop.",
      },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  try {
    const graph = reparseDependencyGraphNow();
    return NextResponse.json({
      ok: true,
      graph: serializeDependencyGraph(graph),
      generatedAt: graph.generatedAt,
      cachedAt: getDependencyGraphCachedAt(),
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          message:
            "Graph validation failed — the previously cached graph is still serving. Fix the issues below and sync again.",
          issues: e.issues,
          cachedAt: getDependencyGraphCachedAt(),
        },
        { status: 422 }
      );
    }
    // Unexpected error (fs read failure, etc.)
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: e instanceof Error ? e.message : String(e),
        cachedAt: getDependencyGraphCachedAt(),
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dependency-graph/sync
 *
 * Lightweight status probe — returns the current cache timestamp without
 * re-parsing. Lets the UI show "last synced X ago" without triggering a sync.
 */
export async function GET(request: Request) {
  if (!rateLimit(request, 30)) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  const cachedAt = getDependencyGraphCachedAt();
  return NextResponse.json({
    ok: true,
    cachedAt,
    cachedAtIso: cachedAt ? new Date(cachedAt).toISOString() : null,
  });
}
