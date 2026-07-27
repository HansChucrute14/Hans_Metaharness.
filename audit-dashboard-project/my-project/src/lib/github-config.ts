import { db } from '@/lib/db'

/**
 * GitHub Configuration Helper
 * 
 * Reads GitHub token, repo owner/name, project number from the DATABASE first,
 * then falls back to .env environment variables. This means tokens saved via
 * the admin UI take effect IMMEDIATELY — no server restart needed.
 * 
 * Now requires projectId for all operations — all callers must resolve
 * the active project before calling these functions.
 */

// Cache config in memory for 60 seconds to avoid hitting DB on every API call
interface CachedConfig {
  token: string | null
  owner: string
  repo: string
  projectNumber: number | null
  fetchedAt: number
  projectId: string
}

let cached: CachedConfig | null = null
const CACHE_TTL_MS = 60_000 // 60 seconds

async function getFreshConfig(projectId: string): Promise<CachedConfig> {
  const configs = await db.gitHubConfig.findMany({ where: { projectId } })

  const getValue = (key: string): string | null => {
    const row = configs.find(c => c.key === key)
    return row?.value ?? null
  }

  // Resolve project-level defaults for repo owner/name
  const project = await db.project.findUnique({ where: { id: projectId } })

  return {
    // DB-first, .env fallback, project record fallback
    token: getValue('github_token') ?? process.env.GITHUB_TOKEN ?? null,
    owner: getValue('repo_owner') ?? process.env.GITHUB_REPO_OWNER ?? project?.repoOwner ?? '',
    repo: getValue('repo_name') ?? process.env.GITHUB_REPO_NAME ?? project?.repoName ?? '',
    projectNumber: getValue('project_number')
      ? Number(getValue('project_number'))
      : null,
    fetchedAt: Date.now(),
    projectId,
  }
}

export async function getGitHubConfig(projectId: string): Promise<CachedConfig> {
  // Use cache if still fresh AND for the same project
  if (cached && (Date.now() - cached.fetchedAt < CACHE_TTL_MS) && cached.projectId === projectId) {
    return cached
  }
  cached = await getFreshConfig(projectId)
  return cached
}

// Force cache invalidation after saving a new token
export function invalidateGitHubConfigCache() {
  cached = null
}

/**
 * Save a GitHub config value to the database.
 * Upserts using composite unique projectId_key.
 * Requires projectId — all callers must resolve the active project first.
 */
export async function saveGitHubConfigValue(key: string, value: string, projectId: string): Promise<void> {
  await db.gitHubConfig.upsert({
    where: { projectId_key: { projectId, key } },
    update: { value, updatedAt: new Date() },
    create: { key, value, projectId },
  })
  invalidateGitHubConfigCache()
}

/**
 * Delete a GitHub config value from the database.
 * Scoped by projectId — required parameter.
 */
export async function deleteGitHubConfigValue(key: string, projectId: string): Promise<void> {
  await db.gitHubConfig.deleteMany({ where: { projectId, key } })
  invalidateGitHubConfigCache()
}

/**
 * Get all GitHub config values from the database.
 * Masks the token value for security (shows only first 4 + last 4 chars).
 * Scoped by projectId — required parameter.
 */
export async function listGitHubConfigValues(projectId: string): Promise<Array<{
  key: string
  value: string
  valueMasked: string
  isEnvFallback: boolean
  updatedAt: Date
}>> {
  const configs = await db.gitHubConfig.findMany({ where: { projectId }, orderBy: { key: 'asc' } })

  const maskToken = (val: string): string => {
    if (val.length <= 8) return '****'
    return val.slice(0, 4) + '...' + val.slice(-4)
  }

  const maskValue = (key: string, val: string): string => {
    if (key === 'github_token') return maskToken(val)
    return val
  }

  return configs.map(c => ({
    key: c.key,
    value: c.value,
    valueMasked: maskValue(c.key, c.value),
    isEnvFallback: false,
    updatedAt: c.updatedAt,
  }))
}
