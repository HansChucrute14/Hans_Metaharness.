/**
 * Typed augmentations for the global `window` object.
 *
 * Before this module existed, the codebase used `(window as Record<string, unknown>).__foo`
 * patterns as a cross-component event bus. That worked but:
 *   - produced 5+ TypeScript errors (`Conversion of type 'Window & typeof globalThis'
 *     to type 'Record<string, unknown>' may be a mistake`)
 *   - had no type safety on the values stored
 *
 * This file declares the known window globals in one place so all access sites
 * can use `window.__foo` directly with full type checking.
 *
 * F-06 of the adversarial review tracks the longer-term goal of removing most
 * of these globals entirely (in favor of refs / Zustand / WeakMap). Until that
 * refactor lands, this module keeps the existing pattern type-safe.
 */

export interface WindowGlobals {
  /** Pending section id to scroll to after a doc swap finishes rendering. */
  __pendingHashSection?: string | null;
  /** The currently-visible section id (mirrors Zustand's activeSectionId). */
  __currentVisibleSectionId?: string | null;
  /** The IntersectionObserver instance driving scroll-spy, for cleanup. */
  __scrollSpyObserver?: IntersectionObserver | null;
  /** A setTimeout handle for retrying dep-graph section-visibility setup. */
  __depGraphRetry?: ReturnType<typeof setTimeout> | null;
  /** A cleanup function for the dep-graph section-visibility observer. */
  __depGraphCleanup?: (() => void) | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends WindowGlobals {}
}

export {};
