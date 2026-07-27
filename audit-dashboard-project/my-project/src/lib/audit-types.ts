/* Pure type and interface exports for the audit system.
 *
 * These types are the shared contract used by 26+ files across the project.
 * They were originally defined in audit-data.ts (a 2024-line file containing
 * seed data, runtime configs, and utility functions). This file extracts ONLY
 * the type/interface definitions so that consumer modules can import types
 * without pulling in the entire seed data module.
 *
 * audit-data.ts remains unchanged — it still contains FINDINGS, configs,
 * and helper functions needed by prisma/seed.ts.
 */

// ── Primitive type aliases ──

export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Tier = 'tier0' | 'tier1' | 'tier2' | 'deferred' | 'additional'
export type VerificationStatus =
  | 'confirmed-execution'
  | 'confirmed-reading'
  | 'confirmed-logical'
  | 'needs-execution-confirmation'
  | 'partial'
export type AuditStatus = 'not-started' | 'in-progress' | 'fixed' | 'wont-fix'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type UnifiedModuleId =
  | 'nutrient_report'
  | 'module_integrity'
  | 'lp_solver_refactor'
  | 'pipeline_integrity'
  | 'data_integrity'

// ── Seed-data interfaces (used by audit-data.ts and seed.ts) ──

export interface Proposal {
  title: string
  description: string
  effort: 'low' | 'medium' | 'high'
  risk: 'low' | 'medium' | 'high'
  reversible: boolean
}

export interface CodeSnippet {
  file: string
  lines: string
  language: string
  code: string
}

export interface Finding {
  task: number | string
  findingIds: string[]
  title: string
  tier: Tier
  severity: Severity
  summary: string
  claim: string
  evidence: string
  verificationStatus: VerificationStatus
  verificationNote?: string
  dependsOn: string
  proposals: Proposal[]
  codeSnippets?: CodeSnippet[]
  category: string
  affectedFiles: string[]
}

export interface BestProposalAnalysis {
  bestSoloIndex: number
  bestSoloReason: string
  hybridNote?: string
  unifiedModuleId: UnifiedModuleId
}

export interface UnifiedExecutionModule {
  id: UnifiedModuleId
  title: string
  subtitle: string
  addresses: (number | string)[]
  coreIdea: string
  fixes: string[]
  effort: 'low' | 'medium' | 'high'
  risk: 'low' | 'medium' | 'high'
  keyInsight: string
}

export interface G3BlockedItem {
  task: number | string
  title: string
  canShipNow: string
  needsReview: string
}

export interface DeferredItem {
  task: number | string
  title: string
  bestSoloIndex: number
  bestSoloReason: string
  note: string
}

export interface ComparisonField {
  label: string
  getValue: (f: Finding) => string
  icon?: string
}

export interface ModuleCoverageStats {
  moduleId: UnifiedModuleId
  title: string
  findingCount: number
  criticalCount: number
  totalEffortHours: number
  findingTasks: (number | string)[]
}
