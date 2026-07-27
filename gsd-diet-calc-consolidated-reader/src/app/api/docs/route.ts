import { NextResponse } from "next/server";
import { serializeDocs } from "@/lib/docs-parser";
import { parseDocsCached } from "@/lib/docs-parser";
import { rateLimit, isValidSlug } from "@/lib/api-utils";

// In dev, Next.js does not cache route handlers by default, so each request
// re-reads the .md files — exactly what we want for live edits.
// In production, parseDocsCached() applies a 60s TTL cache.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // F-05: rate-limit to prevent cheap DoS amplification.
  if (!rateLimit(request)) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("slug");

  // F-05: validate slug against allow-list regex.
  if (slug !== null && !isValidSlug(slug)) {
    return NextResponse.json({ error: "invalid slug" }, { status: 404 });
  }

  const parsed = parseDocsCached();

  if (slug) {
    // return a single file with its raw markdown for rendering
    const file = parsed.files.find((f) => f.slug === slug);
    if (!file) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json(
      {
        file: {
          slug: file.slug,
          fileName: file.fileName,
          title: file.title,
          type: file.type,
          order: file.order,
          totalLines: file.totalLines,
          blurb: file.blurb,
          sections: file.sections.map((s) => ({
            id: s.id,
            level: s.level,
            title: s.title,
            lineNumber: s.lineNumber,
            endLine: s.endLine,
            children: s.children,
          })),
          rawMarkdown: file.rawMarkdown,
        },
        ids: serializeDocs(parsed).ids,
      },
      // F-04/F-05: cacheable for 60s client-side, 5min on the edge.
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
    );
  }

  // list view — all files metadata + id index, no raw markdown (smaller payload)
  return NextResponse.json(serializeDocs(parsed), {
    headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
  });
}
