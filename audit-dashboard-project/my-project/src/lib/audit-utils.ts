/* Utility functions with config-as-parameter pattern.
 *
 * These functions were originally in audit-data.ts where they read from
 * hardcoded constants (severityWeight, tierImpact, FINDINGS). Now they
 * accept config and findings as parameters, making them project-scoped
 * and reusable by any consumer that has the config data.
 *
 * Import types from @/lib/audit-types (the shared type contract).
 * Import AuditConfigData from @/lib/use-audit-config (the flat config interface).
 */

import type { Severity, Tier, RiskLevel, Finding } from '@/lib/audit-types'
import type { AuditConfigData } from '@/lib/use-audit-config'

// ── Risk scoring ──

/** Compute risk score (0–6) from severity + tier using config weights. */
export function getRiskScore(config: AuditConfigData, tier: Tier, severity: Severity): number {
  const severityW = config.severity_levels[severity]?.weight ?? 0
  const tierW = config.tier_labels[tier]?.weight ?? 0
  return severityW + tierW
}

/** Classify a numeric risk score into a RiskLevel bucket. */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 6) return 'critical'
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

// ── Risk matrix ──

export interface RiskMatrixCell {
  severity: Severity
  impactLevel: number
  findings: Finding[]
}

export type RiskMatrixData = Record<string, RiskMatrixCell>

/** Build a 4×4 risk matrix from config weights + findings. */
export function getRiskMatrix(config: AuditConfigData, findings: Finding[]): RiskMatrixData {
  const grid: RiskMatrixData = {}
  const severities: Severity[] = ['low', 'medium', 'high', 'critical']
  const impacts = [0, 1, 2, 3]

  severities.forEach(s => {
    impacts.forEach(imp => {
      const sW = config.severity_levels[s]?.weight ?? 0
      grid[`${sW}-${imp}`] = { severity: s, impactLevel: imp, findings: [] }
    })
  })

  findings.forEach(f => {
    const sW = config.severity_levels[f.severity]?.weight ?? 0
    const tW = config.tier_labels[f.tier]?.weight ?? 0
    const key = `${sW}-${tW}`
    if (grid[key]) grid[key].findings.push(f)
  })

  return grid
}

// ── File & category stats ──

export interface AffectedFileStats {
  file: string
  count: number
  severities: Record<Severity, number>
  findings: (number | string)[]
}

export type AffectedFilesStats = AffectedFileStats[]

/** Compute per-file statistics from a findings array. */
export function getAffectedFilesStats(findings: Finding[]): AffectedFilesStats {
  const fileMap: Record<string, { count: number; severities: Record<Severity, number>; findings: (number | string)[] }> = {}

  findings.forEach(f => {
    f.affectedFiles.forEach(file => {
      if (!fileMap[file]) {
        fileMap[file] = { count: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 }, findings: [] }
      }
      fileMap[file].count++
      fileMap[file].severities[f.severity]++
      fileMap[file].findings.push(f.task)
    })
  })

  return Object.entries(fileMap)
    .map(([file, stats]) => ({ file, ...stats }))
    .sort((a, b) => b.count - a.count)
}

export interface CategoryStat {
  category: string
  count: number
  color: string
}

export type CategoryStats = CategoryStat[]

/** Compute per-category statistics from a findings array. */
export function getCategoryStats(findings: Finding[]): CategoryStats {
  const catMap: Record<string, number> = {}
  findings.forEach(f => {
    catMap[f.category] = (catMap[f.category] ?? 0) + 1
  })
  return Object.entries(catMap)
    .map(([category, count]) => ({ category, count, color: '#6b7280' }))
    .sort((a, b) => b.count - a.count)
}

// ── Template rendering ──

/** Simple template renderer with null/undefined → empty string (NOT "null"). */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const val = data[key]
    if (val === null || val === undefined) return ''
    return String(val)
  })
}
