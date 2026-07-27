import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { cache } from "react";
import { load as yamlLoad } from "js-yaml";
import {
  DocMeta,
  type DocMetaEntry,
  DocRegistry,
  validateRegistry,
} from "@/lib/contracts";
import { getDocsDir, resolveDocPath } from "@/lib/paths";

export type DocType = "part" | "appendix" | "map" | "unlisted";

export interface DocSection {
  id: string;          // slugified section id, e.g. "s3-7"
  level: number;       // heading level (1-4)
  title: string;       // raw heading text
  lineNumber: number;  // line where heading appears (1-based)
  endLine: number;     // last line of section content
  content: string;     // markdown body of this section (excluding the heading line)
  children: string[];  // ids of child sections
}

export interface DocFile {
  slug: string;        // e.g. "part-1", "appendix-id-key", "bug-dependency-map"
  fileName: string;    // e.g. "PART-1-Diagnosis-Findings-and-As-Built-Reality.md"
  title: string;       // human title
  type: DocType;
  order: number;       // sort order
  totalLines: number;
  rawMarkdown: string;
  sections: DocSection[];
  // first paragraph after the H1, used as a subtitle/blurb
  blurb: string;
}

export interface IdOccurrence {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  lineNumber: number;
  context: string;     // ~80 chars around the match
}

export interface IdEntry {
  id: string;          // e.g. "A3", "B2a", "G1", "§9.1"
  kind: "finding" | "task" | "gate" | "section" | "legacy" | "priority" | "appendix-ref";
  description?: string;// one-line description if we can extract it
  occurrences: IdOccurrence[];
}

export interface ParsedDocs {
  files: DocFile[];
  ids: Map<string, IdEntry>;   // keyed by canonical id
  glossary: Map<string, string>; // term → definition (from APPENDIX-GLOSSARY.md)
  warnings: string[];           // §12.5/T3.2: registry validation warnings (never-throw)
  generatedAt: string;
}

// ---------- slug helpers ----------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function inferDocType(fileName: string): DocType {
  if (fileName.startsWith("PART-")) return "part";
  if (fileName.startsWith("APPENDIX-")) return "appendix";
  if (fileName.startsWith("BUG-")) return "map";
  return "appendix";
}

function inferOrder(fileName: string): number {
  if (fileName.startsWith("PART-1")) return 1;
  if (fileName.startsWith("PART-2")) return 2;
  if (fileName.startsWith("PART-3")) return 3;
  if (fileName.startsWith("PART-4")) return 4;
  if (fileName.startsWith("BUG-")) return 5;
  // appendices after the bug map
  const name = fileName.toLowerCase();
  if (name.includes("id-key")) return 6;
  if (name.includes("verification")) return 7;
  if (name.includes("public-health")) return 8;
  if (name.includes("safety-process")) return 9;
  if (name.includes("glossary")) return 10;
  return 99;
}

function inferTitle(fileName: string, firstHeading: string): string {
  // use the H1 if present, else derive from filename
  if (firstHeading) return firstHeading;
  return fileName.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function inferBlurb(lines: string[]): string {
  // find first non-empty, non-heading, non-marker line after the H1
  let sawH1 = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) { sawH1 = true; continue; }
    if (!sawH1) continue;
    if (!trimmed) continue;
    if (trimmed.startsWith("---")) continue;
    if (trimmed.startsWith("**Role:**")) return trimmed;
    if (trimmed.length > 10) return trimmed.slice(0, 200);
  }
  return "";
}

// ---------- section parser ----------

function parseSections(rawMarkdown: string, docSlug: string): DocSection[] {
  const lines = rawMarkdown.split("\n");
  const sections: DocSection[] = [];

  // collect all heading lines first
  const headingIdx: { line: number; level: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      headingIdx.push({
        line: i + 1,
        level: m[1].length,
        title: m[2].trim(),
      });
    }
  });

  // build sections with content ranges
  for (let i = 0; i < headingIdx.length; i++) {
    const h = headingIdx[i];
    // find end: next heading at same or higher level, OR next H1, OR EOF
    let endLine = lines.length;
    for (let j = i + 1; j < headingIdx.length; j++) {
      if (headingIdx[j].level <= h.level) {
        endLine = headingIdx[j].line - 1;
        break;
      }
    }
    const contentLines = lines.slice(h.line, endLine);
    const sectionId = `s${h.line}-${slugify(h.title)}`;
    sections.push({
      id: sectionId,
      level: h.level,
      title: h.title,
      lineNumber: h.line,
      endLine,
      content: contentLines.join("\n"),
      children: [],
    });
  }

  // populate children
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level > sections[i].level) {
        // direct child if no intermediate
        let isDirect = true;
        for (let k = i + 1; k < j; k++) {
          if (sections[k].level <= sections[i].level) { isDirect = false; break; }
        }
        if (isDirect) {
          sections[i].children.push(sections[j].id);
        }
      } else break;
    }
  }

  return sections;
}

// ---------- ID registry ----------

// ID patterns to detect and linkify. Order matters for matching.
// Each pattern MUST have exactly one capture group (group 1) for the full ID.
const ID_PATTERNS: { regex: RegExp; kind: IdEntry["kind"] }[] = [
  // Appendix refs: APPENDIX-ID-KEY.md — must come first (longest match)
  { regex: /\b(APPENDIX-[A-Z-]+\.md)\b/g, kind: "appendix-ref" },
  // Section refs like §9.1, §A.A3, §10.1
  { regex: /§\s*([A-Z]\.[A-Z][0-9]+[a-z]?|[0-9]+\.[0-9]+)/g, kind: "section" },
  // Legacy: R-01..R-09 — must come before findings (R is not in [ABCE] but just in case)
  { regex: /\b(R-0[1-9])\b/g, kind: "legacy" },
  // Tasks: "Task B2a" / "Task C1" / "Task R5" — capture the id after "Task "
  { regex: /\bTask\s+((?:B(?:[0-9]|1[0-2])[ab]?|C(?:[0-9]|1[0-6])|R[1-5]))\b/g, kind: "task" },
  // Gates: G1, G2, G3
  { regex: /\b(G[1-3])\b/g, kind: "gate" },
  // Priority tags: P0, P1, P2, P3
  { regex: /\b(P[0-3])\b/g, kind: "priority" },
  // Findings: A1-A20, B1-B18, C1-C22, D1-D22, E1-E23 (with optional a/b suffix)
  { regex: /\b([ABCE](?:[0-9]|1[0-9]|2[0-3])[ab]?)\b/g, kind: "finding" },
];

function extractId(line: string, regex: RegExp): string | null {
  const m = regex.exec(line);
  regex.lastIndex = 0;
  if (!m) return null;
  return m[1] || m[0];
}

function buildIdRegistry(files: DocFile[]): Map<string, IdEntry> {
  const ids = new Map<string, IdEntry>();

  const addOccurrence = (id: string, kind: IdEntry["kind"], occ: IdOccurrence) => {
    // normalize: strip .md from appendix refs
    let normalized = id;
    if (kind === "appendix-ref") {
      normalized = id.replace(/\.md$/, "");
    }
    if (!ids.has(normalized)) {
      ids.set(normalized, { id: normalized, kind, occurrences: [] });
    }
    const entry = ids.get(normalized)!;
    entry.occurrences.push(occ);
  };

  for (const file of files) {
    const lines = file.rawMarkdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      // find which section this line belongs to
      let section = file.sections[0];
      for (const s of file.sections) {
        if (s.lineNumber <= lineNumber && s.endLine >= lineNumber) {
          if (s.level >= (section?.level ?? 0) || section === file.sections[0]) {
            // pick the most specific (highest level) section containing this line
            if (!section || s.lineNumber >= section.lineNumber) {
              section = s;
            }
          }
        }
      }
      const sectionTitle = section?.title ?? "";
      const sectionId = section?.id ?? "";
      const contextStart = Math.max(0, i - 1);
      const contextEnd = Math.min(lines.length, i + 2);
      const context = lines.slice(contextStart, contextEnd).join(" ").slice(0, 120);

      for (const { regex, kind } of ID_PATTERNS) {
        const globalRegex = new RegExp(regex.source, regex.flags);
        let m: RegExpExecArray | null;
        while ((m = globalRegex.exec(line)) !== null) {
          const id = m[1] || m[0];
          addOccurrence(id, kind, {
            docSlug: file.slug,
            sectionId,
            sectionTitle,
            lineNumber,
            context,
          });
        }
      }
    }
  }

  return ids;
}

// ---------- doc registry loader (INDEX.yml → validated entries) ----------
// §12.5: validate schemaVersion via top-level DocRegistry schema.
// §12.7: use validateRegistry<T>() for unified result shape.
// §12.5: exact-case file-existence gate (existsSync is case-insensitive on macOS).

interface RegistryResult {
  entries: DocMetaEntry[];
  warnings: string[];
}

export function loadDocRegistry(): RegistryResult {
  const indexPath = resolveDocPath("INDEX.yml");
  const warnings: string[] = [];
  const docsDir = getDocsDir();

  // INDEX.yml unreadable → fall back to legacy startsWith scan (never throw).
  if (!existsSync(indexPath)) {
    warnings.push("INDEX.yml missing — falling back to filename heuristics. Add INDEX.yml.");
    return { entries: legacyScan(), warnings };
  }

  let rawYaml: unknown;
  try {
    rawYaml = yamlLoad(readFileSync(indexPath, "utf-8"));
  } catch (e) {
    warnings.push(`INDEX.yml YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
    return { entries: legacyScan(), warnings };
  }

  // §12.5: validate top-level schema (makes schemaVersion load-bearing).
  const topCheck = DocRegistry.safeParse(rawYaml);
  if (!topCheck.success) {
    const verIssue = topCheck.error.issues.find((i) => i.path.join(".") === "schemaVersion");
    warnings.push(
      verIssue
        ? `INDEX.yml schemaVersion must be exactly "1.0.0" (got ${JSON.stringify(
            (rawYaml as Record<string, unknown>)?.schemaVersion
          )}) — see T5 migration pattern`
        : `INDEX.yml schema validation failed: ${topCheck.error.issues.map((i) => i.message).join("; ")}`
    );
    return { entries: legacyScan(), warnings };
  }

  // §12.7: use validateRegistry for entry-level validation + reference checks.
  const onDisk = new Set(readdirSync(docsDir));
  const result = validateRegistry<DocMetaEntry>({
    schema: DocMeta,
    raw: rawYaml,
    listKey: "docs",
    referenceCheck: (entry) => {
      // §12.5: existsSync is case-insensitive on macOS — exact-case gate.
      if (!existsSync(resolveDocPath(entry.file))) {
        return `INDEX.yml references missing file: ${entry.file}`;
      }
      if (!onDisk.has(entry.file)) {
        return `INDEX.yml entry "${entry.file}" does not exact-case-match any file on disk (existsSync is case-insensitive on macOS). Check casing.`;
      }
      return null;
    },
  });

  warnings.push(...result.warnings);
  let entries = result.entries;

  // auto-discover unlisted .md files ONLY in explicit dev mode
  if (process.env.DOCS_DEV_MODE === "1") {
    const listed = new Set(entries.map((e) => e.file));
    for (const f of readdirSync(docsDir).filter(
      (f) => f.endsWith(".md") && f !== "INDEX.yml"
    )) {
      if (!listed.has(f)) {
        warnings.push(`unlisted .md auto-discovered (dev mode): ${f} — add to INDEX.yml`);
        entries.push({ file: f, type: "unlisted", order: 999, title: f.replace(/\.md$/, "") });
      }
    }
  }

  entries.sort((a, b) => a.order - b.order);
  return { entries, warnings };
}

// legacyScan() = the OLD startsWith logic, preserved verbatim as fallback.
function legacyScan(): DocMetaEntry[] {
  const fileNames = readdirSync(getDocsDir())
    .filter((f) => f.endsWith(".md") && f !== "INDEX.yml");
  const entries: DocMetaEntry[] = [];
  for (const fileName of fileNames) {
    entries.push({
      file: fileName,
      type: inferDocType(fileName),
      order: inferOrder(fileName),
      title: fileName.replace(/\.md$/, "").replace(/[-_]/g, " "),
    });
  }
  entries.sort((a, b) => a.order - b.order);
  return entries;
}

// ---------- main parse function ----------

function parseDocsInternal(): ParsedDocs {
  const files: DocFile[] = [];
  const { entries, warnings } = loadDocRegistry();
  const docsDir = getDocsDir();

  for (const entry of entries) {
    const fileName = entry.file;
    const fullPath = join(docsDir, fileName);
    if (!existsSync(fullPath)) continue; // warning already pushed by loadDocRegistry
    const rawMarkdown = readFileSync(fullPath, "utf-8");
    const lines = rawMarkdown.split("\n");
    const firstHeading = lines.find((l) => l.startsWith("# "))?.replace(/^#\s+/, "").trim() ?? "";
    const slug = fileName
      .replace(/\.md$/, "")
      .toLowerCase()
      .replace(/^part-/, "part-")
      .replace(/^appendix-/, "appendix-")
      .replace(/^bug-/, "bug-");
    const sections = parseSections(rawMarkdown, slug);
    const blurb = inferBlurb(lines);

    files.push({
      slug,
      fileName,
      title: firstHeading || entry.title,
      type: entry.type,
      order: entry.order,
      totalLines: lines.length,
      rawMarkdown,
      sections,
      blurb,
    });
  }

  files.sort((a, b) => a.order - b.order);
  const ids = buildIdRegistry(files);
  const glossary = buildGlossary(files);

  return {
    files,
    ids,
    glossary,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// Cache for the duration of a request (revalidate on each new request in dev
// because we want live edits; in production this is effectively build-time).
export const parseDocs = cache(parseDocsInternal);

// ---------- TTL cache (production) ----------
//
// In production (NODE_ENV=production) we cache the fully-parsed docs for 60s
// to avoid re-reading + re-parsing 10 markdown files on every API request.
// `cache()` from React only dedupes WITHIN a request, not across requests —
// so without this layer, `/api/docs?slug=X` paid the full parse cost (~50-150ms)
// per call, and the list endpoint re-serialized the full ID registry every time.
//
// In dev we keep `force-dynamic` + no cache so live edits are picked up.

let cachedParsed: ParsedDocs | null = null;
let cachedAt = 0;
const PARSED_TTL_MS = 60_000; // 60s

export function parseDocsCached(): ParsedDocs {
  if (process.env.NODE_ENV !== "production") {
    return parseDocsInternal();
  }
  const now = Date.now();
  if (cachedParsed && now - cachedAt < PARSED_TTL_MS) {
    return cachedParsed;
  }
  cachedParsed = parseDocsInternal();
  cachedAt = now;
  return cachedParsed;
}

/** Invalidate the TTL cache (e.g. when a docs file changes via a future CMS hook). */
export function invalidateDocsCache(): void {
  cachedParsed = null;
  cachedAt = 0;
}

// ---------- glossary parser ----------

function buildGlossary(files: DocFile[]): Map<string, string> {
  const glossary = new Map<string, string>();
  const glossaryFile = files.find(f => f.fileName.toLowerCase().includes("glossary"));
  if (!glossaryFile) return glossary;

  const lines = glossaryFile.rawMarkdown.split("\n");
  // parse markdown table rows: | **TERM** | Definition |
  for (const line of lines) {
    const m = /^\|\s*\*\*([A-Z]+)\*\*\s*\|\s*(.+?)\s*\|/.exec(line);
    if (m) {
      const term = m[1];
      const def = m[2].replace(/\*+/g, "").replace(/`[^`]+`/g, "").trim();
      // truncate long definitions for tooltip display
      glossary.set(term, def.length > 200 ? def.slice(0, 197) + "…" : def);
    }
  }
  return glossary;
}

// ---------- serialization helper (Map → array for JSON) ----------

export function serializeDocs(parsed: ParsedDocs, includeContent = false) {
  return {
    files: parsed.files.map(f => {
      // List view: exclude rawMarkdown and section content to reduce payload
      // Single-file view: include rawMarkdown for rendering
      const base: Record<string, unknown> = {
        slug: f.slug,
        fileName: f.fileName,
        title: f.title,
        type: f.type,
        order: f.order,
        totalLines: f.totalLines,
        blurb: f.blurb,
        sections: f.sections.map(s =>
          includeContent
            ? { id: s.id, level: s.level, title: s.title, lineNumber: s.lineNumber, endLine: s.endLine, content: s.content, children: s.children }
            : { id: s.id, level: s.level, title: s.title, lineNumber: s.lineNumber, endLine: s.endLine, children: s.children }
        ),
      };
      if (includeContent) {
        base.rawMarkdown = f.rawMarkdown;
      }
      return base;
    }),
    ids: Array.from(parsed.ids.entries()).map(([k, v]) => [k, {
      id: v.id,
      kind: v.kind,
      description: v.description,
      occurrences: v.occurrences,
    }]),
    glossary: Array.from(parsed.glossary.entries()),
    warnings: parsed.warnings, // §12.5/T3.3: registry validation warnings surfaced to UI
    generatedAt: parsed.generatedAt,
  };
}
