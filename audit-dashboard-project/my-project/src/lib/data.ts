import { db } from '@/lib/db'
import type { Severity, Tier, VerificationStatus, AuditStatus, UnifiedModuleId } from './audit-types'

// Types matching the processed (deserialized) data — what the client receives
export interface Proposal {
  id: string
  findingId: string
  index: number
  title: string
  description: string
  effort: string
  risk: string
  reversible: boolean
}

export interface CodeSnippet {
  id: string
  findingId: string
  file: string
  lines: string
  language: string
  code: string
}

export interface BestProposalAnalysis {
  id: string
  findingId: string    // FK to Finding.id (cuid) instead of task
  bestSoloIndex: number
  bestSoloReason: string
  hybridNote: string | null
  unifiedModuleId: string | null
}

export interface UnifiedModule {
  id: string
  title: string
  subtitle: string
  coreIdea: string
  addresses: string[]
  fixes: string[]
  effort: string
  risk: string
  keyInsight: string
  elegantSolution: string
}

export interface Finding {
  id: string
  task: string
  findingIds: string[]
  title: string
  tier: Tier
  severity: Severity
  category: string
  summary: string
  claim: string
  evidence: string
  verificationStatus: VerificationStatus
  verificationNote: string | null
  dependsOn: string
  affectedFiles: string[]
  proposals: Proposal[]
  codeSnippets: CodeSnippet[]
  bestAnalysis: BestProposalAnalysis | null
  module: UnifiedModule | null
  unifiedModuleId: string | null
  githubIssueUrl: string | null
  githubIssueNumber: number | null
  githubSyncedAt: string | null
  createdAt: string
  updatedAt: string
  projectId: string
}

// Fetch all findings with related data (server-side only)
// projectId is required — callers must resolve the active project first
export async function getFindings(projectId: string): Promise<Finding[]> {
  if (!projectId) return []

  const findings = await db.finding.findMany({
    where: { projectId },
    include: {
      proposals: { orderBy: { index: 'asc' } },
      codeSnippets: true,
      bestAnalysis: true,
      module: true,
    },
    orderBy: { task: 'asc' },
  })

  // Deserialize JSON fields back to arrays
  return findings.map(f => ({
    ...f,
    findingIds: JSON.parse(f.findingIds),
    affectedFiles: JSON.parse(f.affectedFiles),
    module: f.module ? {
      ...f.module,
      addresses: JSON.parse(f.module.addresses),
      fixes: JSON.parse(f.module.fixes),
    } : null,
    bestAnalysis: f.bestAnalysis ? {
      ...f.bestAnalysis,
    } : null,
  }))
}

// Fetch unified modules with their findings
// projectId is required — callers must resolve the active project first
export async function getModules(projectId: string): Promise<UnifiedModule[]> {
  if (!projectId) return []

  const modules = await db.unifiedExecutionModule.findMany({
    include: {
      findings: {
        where: { projectId },
        include: {
          proposals: { orderBy: { index: 'asc' } },
          bestAnalysis: true,
        },
      },
    },
  })

  return modules.map(m => ({
    ...m,
    addresses: JSON.parse(m.addresses),
    fixes: JSON.parse(m.fixes),
  }))
}

// Fetch best proposal analyses
// projectId is required — callers must resolve the active project first
export async function getAnalyses(projectId: string): Promise<BestProposalAnalysis[]> {
  if (!projectId) return []

  const findings = await db.finding.findMany({
    where: { projectId },
    select: { id: true },
  })
  const findingIds = findings.map(f => f.id)

  return db.bestProposalAnalysis.findMany({
    where: { findingId: { in: findingIds } },
  })
}

// Get audit configuration from DB (adaptive/config-driven architecture)
// projectId is required — callers must resolve the active project first
export async function getAuditConfig(key?: string, projectId: string): Promise<Record<string, { value: object; isDefault: boolean }>> {
  if (!projectId) return {}

  if (key) {
    const config = await db.auditConfig.findUnique({
      where: { projectId_key: { projectId, key } },
    })
    if (config) {
      return { [key]: { value: JSON.parse(config.value), isDefault: config.isDefault } }
    }
  }

  const configs = await db.auditConfig.findMany({ where: { projectId } })
  const result: Record<string, { value: object; isDefault: boolean }> = {}

  for (const config of configs) {
    result[config.key] = { value: JSON.parse(config.value), isDefault: config.isDefault }
  }

  return result
}

// Get Opencode settings — projectId is required
export async function getOpencodeSettings(projectId: string) {
  if (!projectId) return null

  return db.opencodeSetting.findUnique({
    where: { projectId },
  })
}

// Get GitHub sync logs — projectId is required
export async function getGitHubSyncLogs(limit = 20, projectId: string) {
  if (!projectId) return []

  return db.gitHubSyncLog.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
