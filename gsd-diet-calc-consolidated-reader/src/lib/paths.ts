// src/lib/paths.ts
// Server-only path resolution (uses fs — MUST NOT be imported by client components).
// Split from contracts.ts so client components can import EVT/dispatchDocEvent
// without pulling the fs module into the browser bundle.
import path from "path";
import { existsSync, readdirSync } from "fs";

// §12.3: env-var override FIRST (true portability — no cwd assumption).
let _docsDir: string | null = null;
export function getDocsDir(): string {
  if (_docsDir) return _docsDir;
  const dir = process.env.DOCS_DIR
    ? path.resolve(process.env.DOCS_DIR)
    : path.resolve(process.cwd(), "consolidated-docs");
  if (!existsSync(dir)) {
    throw new Error(
      `paths: DOCS_DIR missing at ${dir} (cwd=${process.cwd()}). ` +
        `Set DOCS_DIR env var or run from repo root.`
    );
  }
  _docsDir = dir;
  return dir;
}
export function getBugMapPath(): string {
  return path.resolve(getDocsDir(), "BUG-DEPENDENCY-MAP.md");
}
export function resolveDocPath(fileName: string): string {
  return path.resolve(getDocsDir(), fileName);
}

// §12.5: exact-case file-existence check (existsSync is case-insensitive on macOS).
export function exactCaseFileExists(
  dir: string,
  fileName: string
): boolean {
  try {
    const onDisk = readdirSync(dir);
    return onDisk.includes(fileName);
  } catch {
    return false;
  }
}
