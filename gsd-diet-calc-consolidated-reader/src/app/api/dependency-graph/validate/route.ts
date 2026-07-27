// src/app/api/dependency-graph/validate/route.ts
// T4: Dry-run validation endpoint (two verbs).
// §12.7: RegistryResult-shaped JSON for unified result contract.
import { NextResponse } from "next/server";
import {
  parseGraphSource,
  GraphValidationError,
  extractGraphDataBlock,
} from "@/lib/dependency-graph";
import { getBugMapPath } from "@/lib/paths";
import { rateLimit } from "@/lib/api-utils";
import { readFileSync } from "fs";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024; // 256KB cap (Persona B Attack 2)

/**
 * POST — validates a proposed YAML body (dry-run, no cache mutation).
 * §12.7: returns RegistryResult shape { ok, entries, warnings }.
 */
export async function POST(request: Request) {
  if (!rateLimit(request, 20)) {
    return NextResponse.json(
      { ok: false, entries: [], warnings: ["rate limited"] },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  // Read raw text, cap size BEFORE parsing JSON (Persona B Attack 1+2).
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        entries: [],
        warnings: [`body exceeds ${MAX_BODY_BYTES} bytes`],
      },
      { status: 413 }
    );
  }
  let body: unknown;
  try {
    body = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    return NextResponse.json(
      { ok: false, entries: [], warnings: ["invalid JSON body"] },
      { status: 400 }
    );
  }
  if (typeof (body as { yaml?: unknown })?.yaml !== "string") {
    return NextResponse.json(
      { ok: false, entries: [], warnings: ["body must be { yaml: string }"] },
      { status: 400 }
    );
  }
  const yamlText = (body as { yaml: string }).yaml;
  try {
    const parsed = parseGraphSource(yamlText); // pure — no cache mutation
    // §12.7: RegistryResult shape. entries = parsed nodes (caller derives count via entries.length).
    return NextResponse.json({
      ok: true,
      entries: parsed.nodes,
      warnings: [],
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json(
        {
          ok: false,
          entries: [],
          warnings: e.issues.map((i) => `${i.path}: ${i.message}`),
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        entries: [],
        warnings: [e instanceof Error ? e.message : String(e)],
      },
      { status: 500 }
    );
  }
}

/**
 * GET — re-validates the on-disk BUG-DEPENDENCY-MAP.md file.
 * §12.7: RegistryResult shape. No `source` field (Decision 5 Z — the verb IS the source).
 */
export async function GET(request: Request) {
  if (!rateLimit(request, 20)) {
    return NextResponse.json(
      { ok: false, entries: [], warnings: ["rate limited"] },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  try {
    const raw = readFileSync(getBugMapPath(), "utf-8");
    const yamlText = extractGraphDataBlock(raw);
    const parsed = parseGraphSource(yamlText);
    return NextResponse.json({
      ok: true,
      entries: parsed.nodes,
      warnings: [],
    });
  } catch (e) {
    if (e instanceof GraphValidationError) {
      return NextResponse.json(
        {
          ok: false,
          entries: [],
          warnings: e.issues.map((i) => `${i.path}: ${i.message}`),
        },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        entries: [],
        warnings: [e instanceof Error ? e.message : String(e)],
      },
      { status: 500 }
    );
  }
}
