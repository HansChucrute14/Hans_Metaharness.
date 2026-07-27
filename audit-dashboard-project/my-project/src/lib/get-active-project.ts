import { db } from '@/lib/db'
import { NextRequest } from 'next/server'

// ── Active Project Resolution ──
// 3-level fallback chain:
//   1. Query param `projectId` on the request URL
//   2. AuditConfig key `active_project` stored in the database
//   3. First active Project record in the database

// ── In-memory cache with 60-second TTL (same pattern as github-config.ts) ──
interface CachedProjectId {
  projectId: string | null
  fetchedAt: number
}

let cached: CachedProjectId | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

/**
 * Resolve the active project ID using a 3-level fallback chain:
 * 1. `projectId` query param on the request URL
 * 2. AuditConfig key `active_project` in the database
 * 3. First active Project record in the database
 *
 * Includes try/catch around JSON.parse for robustness.
 * Caches result in memory for 60 seconds to avoid hitting DB on every call.
 */
export async function getActiveProjectId(request?: NextRequest): Promise<string | null> {
  // ── Level 1: Query param ──
  if (request) {
    const url = new URL(request.url)
    const queryProjectId = url.searchParams.get('projectId')
    if (queryProjectId) {
      return queryProjectId
    }
  }

  // ── Use cache if still fresh ──
  if (cached && (Date.now() - cached.fetchedAt < CACHE_TTL_MS)) {
    return cached.projectId
  }

  // ── Level 2: AuditConfig active_project key ──
  let resolvedId: string | null = null

  try {
    // Try composite unique lookup — need a projectId for the composite key,
    // but since we don't have one yet, use findFirst instead
    const activeConfig = await db.auditConfig.findFirst({
      where: { key: 'active_project' },
    })

    if (activeConfig) {
      try {
        const parsed = JSON.parse(activeConfig.value)
        // The value could be a plain string ID or an object { projectId: "..." }
        if (typeof parsed === 'string') {
          resolvedId = parsed
        } else if (parsed && typeof parsed === 'object' && 'projectId' in parsed) {
          resolvedId = String((parsed as Record<string, unknown>).projectId)
        }
      } catch {
        // JSON.parse failed — treat value as raw string ID
        resolvedId = activeConfig.value
      }
    }

    // ── Level 3: First active Project ──
    if (!resolvedId) {
      const firstActive = await db.project.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      resolvedId = firstActive?.id ?? null
    }
  } catch (err) {
    console.error('Failed to resolve active project:', err instanceof Error ? err.message : err)
    resolvedId = null
  }

  // ── Update cache ──
  cached = { projectId: resolvedId, fetchedAt: Date.now() }

  return resolvedId
}

/**
 * Force cache invalidation — call when the active project changes
 * (e.g., after PUT /api/project to set a new active project).
 */
export function invalidateActiveProjectCache(): void {
  cached = null
}
