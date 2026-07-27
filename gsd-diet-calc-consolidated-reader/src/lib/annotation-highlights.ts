"use client";

import { useEffect, useState, useCallback } from "react";
import { EVT, dispatchDocEvent } from "@/lib/contracts";

// =============================================================================
// Types
// =============================================================================

export type AnnotationColor = "yellow" | "rose" | "emerald" | "sky" | "violet";
export type AnnotationStatus = "open" | "resolved";

export interface Annotation {
  id: string;
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  text: string;          // the highlighted text
  note: string;          // user's note (markdown allowed)
  color: AnnotationColor;
  tags: string[];        // free-form tags (lowercased, deduped)
  status: AnnotationStatus;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Pre-migration shape (v1) — used by the migrator only. */
interface AnnotationV1 {
  id: string;
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  note: string;
  color: AnnotationColor;
  createdAt: number;
  // v2 fields may be absent:
  tags?: string[];
  status?: AnnotationStatus;
  pinned?: boolean;
  updatedAt?: number;
}

export interface AnnotationStats {
  total: number;
  byColor: Record<AnnotationColor, number>;
  byStatus: Record<AnnotationStatus, number>;
  byDoc: Record<string, number>;
  byTag: Record<string, number>;
  pinned: number;
  recent7d: number;
  withNotes: number;
}

export type ExportFormat = "json" | "markdown" | "csv";

// =============================================================================
// Constants
// =============================================================================

export const STORAGE_KEY = "gsd-doc-annotations";
export const TRASH_KEY = "gsd-doc-annotations-trash";
export const SCHEMA_VERSION_KEY = "gsd-doc-annotations-schema-version";
export const CURRENT_SCHEMA_VERSION = 2;

export const MAX_ANNOTATIONS = 500;
export const UNDO_WINDOW_MS = 6000; // 6 seconds to undo a delete
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS_PER_ANNOTATION = 8;
export const MAX_NOTE_LENGTH = 4000;

export const MARK_ATTR = "data-ann-id";
export const MARK_CLASS = "annotation-highlight";

// =============================================================================
// Color styles (applied to <mark> imperatively)
// =============================================================================

const COLOR_STYLES: Record<AnnotationColor, string> = {
  yellow:  "background: rgba(250, 204, 21, 0.45); border-bottom: 1px solid rgba(202, 138, 4, 0.6);",
  rose:    "background: rgba(244, 63, 94, 0.30);  border-bottom: 1px solid rgba(225, 29, 72, 0.7);",
  emerald: "background: rgba(16, 185, 129, 0.30); border-bottom: 1px solid rgba(5, 150, 105, 0.7);",
  sky:     "background: rgba(14, 165, 233, 0.30); border-bottom: 1px solid rgba(2, 132, 199, 0.7);",
  violet:  "background: rgba(139, 92, 246, 0.30); border-bottom: 1px solid rgba(124, 58, 237, 0.7);",
};

const DARK_COLOR_STYLES: Record<AnnotationColor, string> = {
  yellow:  "background: rgba(250, 204, 21, 0.22); border-bottom: 1px solid rgba(250, 204, 21, 0.55);",
  rose:    "background: rgba(244, 63, 94, 0.22);  border-bottom: 1px solid rgba(244, 63, 94, 0.55);",
  emerald: "background: rgba(16, 185, 129, 0.22); border-bottom: 1px solid rgba(16, 185, 129, 0.55);",
  sky:     "background: rgba(14, 165, 233, 0.22); border-bottom: 1px solid rgba(14, 165, 233, 0.55);",
  violet:  "background: rgba(139, 92, 246, 0.22); border-bottom: 1px solid rgba(139, 92, 246, 0.55);",
};

function isDark(): boolean {
  return document.documentElement.classList.contains("dark");
}

// =============================================================================
// Migration
// =============================================================================

function migrateV1toV2(legacy: AnnotationV1): Annotation {
  return {
    id: legacy.id,
    docSlug: legacy.docSlug,
    sectionId: legacy.sectionId,
    sectionTitle: legacy.sectionTitle,
    text: legacy.text,
    note: legacy.note ?? "",
    color: legacy.color,
    tags: dedupeTags(legacy.tags ?? []),
    status: legacy.status ?? "open",
    pinned: legacy.pinned ?? false,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt ?? legacy.createdAt,
  };
}

function ensureMigrated(): void {
  if (typeof window === "undefined") return;
  const version = Number(window.localStorage.getItem(SCHEMA_VERSION_KEY) || "1");
  if (version >= CURRENT_SCHEMA_VERSION) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
      return;
    }
    const parsed = JSON.parse(raw) as AnnotationV1[];
    const migrated = parsed.map(migrateV1toV2);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    window.localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  } catch {
    // Corrupt store — reset to empty v2
    window.localStorage.setItem(STORAGE_KEY, "[]");
    window.localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION));
  }
}

// =============================================================================
// Tag helpers
// =============================================================================

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").slice(0, MAX_TAG_LENGTH);
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const n = normalizeTag(t);
    if (n && !seen.has(n) && out.length < MAX_TAGS_PER_ANNOTATION) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

// =============================================================================
// Core persistence
// =============================================================================

export function loadAnnotations(): Annotation[] {
  if (typeof window === "undefined") return [];
  ensureMigrated();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AnnotationV1[];
    return parsed.map(migrateV1toV2);
  } catch {
    return [];
  }
}

export function saveAnnotations(anns: Annotation[]): void {
  if (typeof window === "undefined") return;
  ensureMigrated();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(anns));
    dispatchAnnotationsUpdated();
  } catch (err) {
    // Likely quota exceeded
    console.warn("[annotations] save failed:", err);
  }
}

/** Notify listeners (panel, highlight hook, top-bar count) that the store changed. */
export function dispatchAnnotationsUpdated(): void {
  if (typeof window === "undefined") return;
  dispatchDocEvent(EVT.AnnotationsUpdated);
}

export function getAllAnnotations(): Annotation[] {
  return loadAnnotations();
}

export function getAnnotation(id: string): Annotation | undefined {
  return loadAnnotations().find((a) => a.id === id);
}

export function getAnnotationCount(): number {
  return loadAnnotations().length;
}

// =============================================================================
// CRUD
// =============================================================================

export interface CreateAnnotationInput {
  docSlug: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  note?: string;
  color?: AnnotationColor;
  tags?: string[];
  status?: AnnotationStatus;
  pinned?: boolean;
}

export function addAnnotation(input: CreateAnnotationInput): Annotation {
  const now = Date.now();
  const ann: Annotation = {
    id: `ann-${now}-${Math.random().toString(36).slice(2, 8)}`,
    docSlug: input.docSlug,
    sectionId: input.sectionId,
    sectionTitle: input.sectionTitle,
    text: input.text,
    note: (input.note ?? "").slice(0, MAX_NOTE_LENGTH),
    color: input.color ?? "yellow",
    tags: dedupeTags(input.tags ?? []),
    status: input.status ?? "open",
    pinned: input.pinned ?? false,
    createdAt: now,
    updatedAt: now,
  };
  const all = loadAnnotations();
  const next = [ann, ...all].slice(0, MAX_ANNOTATIONS);
  saveAnnotations(next);
  return ann;
}

/** Check if an annotation with the same text+docSlug+sectionId already exists. */
export function findDuplicate(input: CreateAnnotationInput): Annotation | undefined {
  return loadAnnotations().find(
    (a) =>
      a.docSlug === input.docSlug &&
      a.sectionId === input.sectionId &&
      a.text === input.text
  );
}

export function updateAnnotation(
  id: string,
  updates: Partial<Omit<Annotation, "id" | "createdAt">>
): Annotation | undefined {
  const all = loadAnnotations();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  const merged: Annotation = {
    ...all[idx],
    ...updates,
    tags: updates.tags ? dedupeTags(updates.tags) : all[idx].tags,
    note: updates.note !== undefined ? updates.note.slice(0, MAX_NOTE_LENGTH) : all[idx].note,
    updatedAt: Date.now(),
  };
  all[idx] = merged;
  saveAnnotations(all);
  return merged;
}

export function togglePinned(id: string): void {
  const ann = getAnnotation(id);
  if (ann) updateAnnotation(id, { pinned: !ann.pinned });
}

export function toggleStatus(id: string): void {
  const ann = getAnnotation(id);
  if (ann) updateAnnotation(id, { status: ann.status === "open" ? "resolved" : "open" });
}

export function addTag(id: string, tag: string): void {
  const ann = getAnnotation(id);
  if (!ann) return;
  const next = dedupeTags([...ann.tags, tag]);
  updateAnnotation(id, { tags: next });
}

export function removeTag(id: string, tag: string): void {
  const ann = getAnnotation(id);
  if (!ann) return;
  updateAnnotation(id, { tags: ann.tags.filter((t) => t !== tag) });
}

// =============================================================================
// Soft-delete + Undo
//
// Delete moves to a separate trash key. Within UNDO_WINDOW_MS the annotation
// can be restored. After the window, it can be permanently cleared.
// =============================================================================

interface TrashedAnnotation extends Annotation {
  trashedAt: number;
}

function loadTrash(): TrashedAnnotation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRASH_KEY);
    return raw ? (JSON.parse(raw) as TrashedAnnotation[]) : [];
  } catch {
    return [];
  }
}

function saveTrash(trash: TrashedAnnotation[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRASH_KEY, JSON.stringify(trash));
}

/** Soft-delete: move to trash. Returns a restore handle. */
export function deleteAnnotation(id: string): void {
  const all = loadAnnotations();
  const ann = all.find((a) => a.id === id);
  if (!ann) return;
  const next = all.filter((a) => a.id !== id);
  saveAnnotations(next);
  const trash = loadTrash();
  trash.push({ ...ann, trashedAt: Date.now() });
  saveTrash(trash);
}

/** Restore an annotation from trash (within undo window). */
export function restoreAnnotation(id: string): Annotation | undefined {
  const trash = loadTrash();
  const idx = trash.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  const { trashedAt: _trashedAt, ...ann } = trash[idx];
  void _trashedAt;
  trash.splice(idx, 1);
  saveTrash(trash);
  const all = loadAnnotations();
  // Restore at original position is hard — prepend for visibility
  const next = [ann, ...all].slice(0, MAX_ANNOTATIONS);
  saveAnnotations(next);
  return ann;
}

/** Permanently remove from trash (called after undo window expires). */
export function purgeFromTrash(id: string): void {
  const trash = loadTrash().filter((t) => t.id !== id);
  saveTrash(trash);
}

/** Clear all trashed annotations (manual cleanup). */
export function clearTrash(): void {
  saveTrash([]);
}

export function getTrashedCount(): number {
  return loadTrash().length;
}

/** Auto-purge trashed annotations older than UNDO_WINDOW_MS. Call periodically. */
export function purgeExpiredTrash(): number {
  const trash = loadTrash();
  const now = Date.now();
  const remaining = trash.filter((t) => now - t.trashedAt < UNDO_WINDOW_MS);
  const purged = trash.length - remaining.length;
  if (purged > 0) saveTrash(remaining);
  return purged;
}

// =============================================================================
// Duplicate
// =============================================================================

export function duplicateAnnotation(id: string): Annotation | undefined {
  const ann = getAnnotation(id);
  if (!ann) return undefined;
  const now = Date.now();
  const clone: Annotation = {
    ...ann,
    id: `ann-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text: ann.text,
    note: ann.note,
    createdAt: now,
    updatedAt: now,
    pinned: false, // don't auto-pin duplicates
  };
  const all = loadAnnotations();
  const next = [clone, ...all].slice(0, MAX_ANNOTATIONS);
  saveAnnotations(next);
  return clone;
}

// =============================================================================
// Bulk operations
// =============================================================================

export function bulkUpdate(ids: string[], updates: Partial<Omit<Annotation, "id" | "createdAt">>): void {
  const all = loadAnnotations();
  const idSet = new Set(ids);
  const now = Date.now();
  const next = all.map((a) =>
    idSet.has(a.id)
      ? {
          ...a,
          ...updates,
          tags: updates.tags ? dedupeTags(updates.tags) : a.tags,
          note: updates.note !== undefined ? updates.note.slice(0, MAX_NOTE_LENGTH) : a.note,
          updatedAt: now,
        }
      : a
  );
  saveAnnotations(next);
}

export function bulkDelete(ids: string[]): void {
  const idSet = new Set(ids);
  const all = loadAnnotations();
  const keep = all.filter((a) => !idSet.has(a.id));
  const trashed = all.filter((a) => idSet.has(a.id));
  if (trashed.length === 0) return;
  saveAnnotations(keep);
  const trash = loadTrash();
  const now = Date.now();
  for (const a of trashed) trash.push({ ...a, trashedAt: now });
  saveTrash(trash);
}

export function bulkAddTag(ids: string[], tag: string): void {
  const normalized = normalizeTag(tag);
  if (!normalized) return;
  const all = loadAnnotations();
  const idSet = new Set(ids);
  const now = Date.now();
  const next = all.map((a) =>
    idSet.has(a.id)
      ? { ...a, tags: dedupeTags([...a.tags, normalized]), updatedAt: now }
      : a
  );
  saveAnnotations(next);
}

export function bulkSetStatus(ids: string[], status: AnnotationStatus): void {
  bulkUpdate(ids, { status });
}

export function bulkSetPinned(ids: string[], pinned: boolean): void {
  bulkUpdate(ids, { pinned });
}

// =============================================================================
// Search + Filter
// =============================================================================

export interface SearchFilters {
  query?: string;            // full-text on text+note+tags
  colors?: AnnotationColor[];// empty/undefined = all
  tags?: string[];           // empty/undefined = all (AND across tags)
  tagsAny?: string[];        // OR across tags (alternative)
  status?: AnnotationStatus | "all";
  pinnedOnly?: boolean;
  hasNote?: boolean;         // true = only with notes, false = only without
  docSlug?: string;          // filter by document
}

export function searchAnnotations(filters: SearchFilters): Annotation[] {
  let result = loadAnnotations();
  if (filters.docSlug && filters.docSlug !== "all") {
    result = result.filter((a) => a.docSlug === filters.docSlug);
  }
  if (filters.colors && filters.colors.length > 0) {
    const set = new Set(filters.colors);
    result = result.filter((a) => set.has(a.color));
  }
  if (filters.tags && filters.tags.length > 0) {
    const set = new Set(filters.tags);
    result = result.filter((a) => filters.tags!.every((t) => a.tags.includes(t)));
    void set;
  }
  if (filters.tagsAny && filters.tagsAny.length > 0) {
    const set = new Set(filters.tagsAny);
    result = result.filter((a) => a.tags.some((t) => set.has(t)));
  }
  if (filters.status && filters.status !== "all") {
    result = result.filter((a) => a.status === filters.status);
  }
  if (filters.pinnedOnly) {
    result = result.filter((a) => a.pinned);
  }
  if (filters.hasNote !== undefined) {
    result = result.filter((a) =>
      filters.hasNote ? a.note.trim().length > 0 : a.note.trim().length === 0
    );
  }
  if (filters.query && filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    result = result.filter((a) => {
      const hay = `${a.text} ${a.note} ${a.tags.join(" ")} ${a.sectionTitle}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  return result;
}

// =============================================================================
// Stats
// =============================================================================

export function getStats(): AnnotationStats {
  const all = loadAnnotations();
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const stats: AnnotationStats = {
    total: all.length,
    byColor: { yellow: 0, rose: 0, emerald: 0, sky: 0, violet: 0 },
    byStatus: { open: 0, resolved: 0 },
    byDoc: {},
    byTag: {},
    pinned: 0,
    recent7d: 0,
    withNotes: 0,
  };
  for (const a of all) {
    stats.byColor[a.color]++;
    stats.byStatus[a.status]++;
    stats.byDoc[a.docSlug] = (stats.byDoc[a.docSlug] ?? 0) + 1;
    for (const t of a.tags) stats.byTag[t] = (stats.byTag[t] ?? 0) + 1;
    if (a.pinned) stats.pinned++;
    if (a.createdAt >= weekAgo) stats.recent7d++;
    if (a.note.trim().length > 0) stats.withNotes++;
  }
  return stats;
}

export function getAllTags(): { tag: string; count: number }[] {
  const counts = getStats().byTag;
  return Object.entries(counts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// =============================================================================
// Export / Import
// =============================================================================

export function serializeAnnotations(anns: Annotation[], format: ExportFormat): string {
  if (format === "json") {
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), schemaVersion: CURRENT_SCHEMA_VERSION, count: anns.length, annotations: anns },
      null,
      2
    );
  }
  if (format === "csv") {
    const header = ["id", "docSlug", "sectionId", "sectionTitle", "color", "status", "pinned", "tags", "createdAt", "updatedAt", "text", "note"];
    const rows = anns.map((a) => [
      a.id,
      a.docSlug,
      a.sectionId,
      csvEscape(a.sectionTitle),
      a.color,
      a.status,
      String(a.pinned),
      csvEscape(a.tags.join("|")),
      new Date(a.createdAt).toISOString(),
      new Date(a.updatedAt).toISOString(),
      csvEscape(a.text),
      csvEscape(a.note),
    ]);
    return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  }
  // markdown
  const lines: string[] = [];
  lines.push(`# Annotations Export`);
  lines.push("");
  lines.push(`_Exported: ${new Date().toISOString()}_  `);
  lines.push(`_Count: ${anns.length}_`);
  lines.push("");
  lines.push(`---`);
  lines.push("");
  for (const a of anns) {
    lines.push(`## ${a.sectionTitle}`);
    lines.push("");
    lines.push(`- **Color:** ${a.color}`);
    lines.push(`- **Status:** ${a.status}`);
    if (a.pinned) lines.push(`- **Pinned:** yes`);
    if (a.tags.length > 0) lines.push(`- **Tags:** ${a.tags.map((t) => `\`${t}\``).join(", ")}`);
    lines.push(`- **Created:** ${new Date(a.createdAt).toISOString()}`);
    if (a.updatedAt !== a.createdAt) lines.push(`- **Updated:** ${new Date(a.updatedAt).toISOString()}`);
    lines.push("");
    lines.push(`> ${a.text.replace(/\n/g, "\n> ")}`);
    lines.push("");
    if (a.note) {
      lines.push(`**Note:**`);
      lines.push("");
      lines.push(a.note);
      lines.push("");
    }
    lines.push(`---`);
    lines.push("");
  }
  return lines.join("\n");
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function copyAnnotationAsMarkdown(id: string): string {
  const ann = getAnnotation(id);
  if (!ann) return "";
  const md = [
    `> ${ann.text.replace(/\n/g, "\n> ")}`,
    "",
    ann.note ? `**Note:** ${ann.note}` : "",
    ann.tags.length > 0 ? `**Tags:** ${ann.tags.map((t) => `#${t}`).join(" ")}` : "",
    `*— ${ann.sectionTitle} · ${ann.color}*`,
  ].filter(Boolean).join("\n");
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(md).catch(() => {});
  }
  return md;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function importFromJSON(jsonText: string): ImportResult {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    result.errors.push(`Invalid JSON: ${(err as Error).message}`);
    return result;
  }
  // Accept either an array or { annotations: [...] }
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : (parsed as { annotations?: unknown[] })?.annotations ?? [];
  if (!Array.isArray(arr)) {
    result.errors.push("Expected an array or { annotations: [...] }");
    return result;
  }
  const all = loadAnnotations();
  for (const raw of arr) {
    try {
      const a = raw as AnnotationV1;
      if (!a || typeof a !== "object" || !a.text || !a.docSlug) {
        result.skipped++;
        continue;
      }
      const ann = migrateV1toV2(a);
      // Avoid re-importing the same id
      if (all.some((x) => x.id === ann.id)) {
        ann.id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      all.unshift(ann);
      result.imported++;
    } catch {
      result.skipped++;
    }
  }
  saveAnnotations(all.slice(0, MAX_ANNOTATIONS));
  return result;
}

// =============================================================================
// DOM: highlight application
// =============================================================================

function highlightInNode(root: Node, needle: string, annId: string, color: AnnotationColor): HTMLElement[] {
  const created: HTMLElement[] = [];
  if (!needle || needle.length < 3) return created;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      if (tag === "mark" || tag === "script" || tag === "style" || tag === "code" || tag === "pre") {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.hasAttribute(MARK_ATTR)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.includes(needle)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: { node: Text; index: number }[] = [];
  let current: Node | null;
  while ((current = walker.nextNode())) {
    const textNode = current as Text;
    const value = textNode.nodeValue || "";
    let idx = value.indexOf(needle);
    while (idx !== -1) {
      targets.push({ node: textNode, index: idx });
      idx = value.indexOf(needle, idx + needle.length);
    }
  }

  const dark = isDark();
  const styleStr = dark ? DARK_COLOR_STYLES[color] : COLOR_STYLES[color];
  const resolvedOpacity = ""; // resolved handled via class

  for (const { node, index } of targets) {
    try {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const mark = document.createElement("mark");
      mark.setAttribute(MARK_ATTR, annId);
      mark.setAttribute("data-ann-color", color);
      mark.className = MARK_CLASS + resolvedOpacity;
      mark.setAttribute("style", styleStr);
      mark.title = "Annotation — click to view";
      range.surroundContents(mark);
      created.push(mark);
    } catch {
      // surroundContents can fail if range crosses element boundaries — skip
    }
  }
  return created;
}

function clearAllMarks(root: Node) {
  const marks = (root as HTMLElement).querySelectorAll(`mark[${MARK_ATTR}]`);
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
}

/** Get the DOM mark element for a given annotation id (first match). */
export function getMarkElementForAnnotation(annId: string): HTMLElement | null {
  return document.querySelector(`mark[${MARK_ATTR}="${annId}"]`);
}

/**
 * Hook that applies annotation highlights to the prose container for the given doc slug.
 * Returns the count of currently-applied annotations.
 */
export function useAnnotationHighlights(docSlug: string | undefined) {
  const [count, setCount] = useState(0);

  const apply = useCallback(() => {
    const container = document.querySelector("[data-doc-content]");
    if (!container || !docSlug) {
      setCount(0);
      return;
    }
    clearAllMarks(container);
    const all = loadAnnotations();
    const forThisDoc = all.filter((a) => a.docSlug === docSlug);
    let applied = 0;
    // Pinned first so their marks win boundary conflicts
    const ordered = [...forThisDoc].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    for (const ann of ordered) {
      const created = highlightInNode(container, ann.text, ann.id, ann.color);
      if (created.length > 0) {
        applied++;
        // Dim resolved annotations
        if (ann.status === "resolved") {
          for (const m of created) {
            const cur = m.getAttribute("style") || "";
            m.setAttribute("style", cur + " opacity: 0.55; text-decoration: line-through; text-decoration-thickness: 1px;");
          }
        }
        // Pinned: thicker underline
        if (ann.pinned) {
          for (const m of created) {
            const cur = m.getAttribute("style") || "";
            m.setAttribute("style", cur + " box-shadow: inset 0 -2px 0 0 currentColor;");
          }
        }
      }
    }
    setCount(applied);
  }, [docSlug]);

  useEffect(() => {
    const t = setTimeout(apply, 250);
    return () => clearTimeout(t);
  }, [apply]);

  useEffect(() => {
    const handler = () => apply();
    window.addEventListener("annotations-updated", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("annotations-updated", handler);
      window.removeEventListener("storage", handler);
    };
  }, [apply]);

  useEffect(() => {
    const observer = new MutationObserver(() => apply());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [apply]);

  useEffect(() => {
    const handler = () => {
      setTimeout(apply, 300);
    };
    window.addEventListener("doc:jumpto", handler);
    window.addEventListener("doc:jump", handler);
    return () => {
      window.removeEventListener("doc:jumpto", handler);
      window.removeEventListener("doc:jump", handler);
    };
  }, [apply]);

  // Click handler for marks: dispatch annotation-clicked with id AND position
  useEffect(() => {
    const container = document.querySelector("[data-doc-content]");
    if (!container) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "MARK" && target.hasAttribute(MARK_ATTR)) {
        const id = target.getAttribute(MARK_ATTR);
        if (!id) return;
        const rect = target.getBoundingClientRect();
        dispatchDocEvent(EVT.AnnotationClicked, {
          id, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left },
        });
      }
    };
    container.addEventListener("click", handler);
    return () => container.removeEventListener("click", handler);
  }, [docSlug]);

  // Periodic trash purge
  useEffect(() => {
    purgeExpiredTrash();
    const interval = setInterval(() => purgeExpiredTrash(), 60_000);
    return () => clearInterval(interval);
  }, []);

  return count;
}

export function useAnnotationCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(getAnnotationCount());
    update();
    window.addEventListener("annotations-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("annotations-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return count;
}

// Re-export legacy names for any consumer that imported them from here
export {
  loadAnnotations as getAllAnnotationsAlias,
};
