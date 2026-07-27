/**
 * Shared dashboard constants.
 *
 * Extracted from dashboard-client.tsx so charts.tsx and finding-card.tsx
 * can import them without creating a circular dependency back into the
 * main client module.
 *
 * Pattern: existing static exports remain as fallback defaults.
 * New function-based exports accept AuditConfigData to derive values
 * from project-specific config. Components that have useAuditConfig()
 * should prefer the function-based version.
 */
import type { Severity, Tier, UnifiedModuleId } from '@/lib/audit-types'
import type { AuditConfigData } from '@/lib/use-audit-config'

/* ── STATIC DEFAULTS (kept for backwards compatibility) ── */

/** Sort order for severities (lower = more severe). */
export const severityOrder: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** Sort order for tiers (lower = higher priority). */
export const tierOrder: Record<Tier, number> = {
  tier0: 0,
  tier1: 1,
  tier2: 2,
  additional: 3,
  deferred: 4,
}

/** Solid color used for the tier accent bar / dots. */
export const tierColors: Record<Tier, string> = {
  tier0: '#dc2626',
  tier1: '#f97316',
  tier2: '#eab308',
  additional: '#10b981',
  deferred: '#6b7280',
}

/** Solid color used for severity donuts / bars / accents. */
export const severityColors: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

/** Solid color used for verification method bars. */
export const verificationColors: Record<string, string> = {
  'confirmed-execution': '#10b981',
  'confirmed-reading': '#0ea5e9',
  'confirmed-logical': '#14b8a6',
  'needs-execution-confirmation': '#f59e0b',
  partial: '#eab308',
}

/** Tailwind class bundle per unified module id (used in module breakdowns). */
export const moduleColorMap: Record<
  UnifiedModuleId,
  { color: string; bg: string; border: string; text: string }
> = {
  nutrient_report: {
    color: '#10b981',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  module_integrity: {
    color: '#0ea5e9',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    text: 'text-sky-700 dark:text-sky-300',
  },
  lp_solver_refactor: {
    color: '#f97316',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-700 dark:text-orange-300',
  },
  pipeline_integrity: {
    color: '#8b5cf6',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    text: 'text-violet-700 dark:text-violet-300',
  },
  data_integrity: {
    color: '#14b8a6',
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-700 dark:text-teal-300',
  },
}

/* ── CONFIG-DERIVED FUNCTION EXPORTS ── */

/** Derive severity sort order from config weights (lower weight = more severe → lower sort position). */
export function getSeverityOrder(config: AuditConfigData): Record<Severity, number> {
  const sl = config.severity_levels
  const entries: [Severity, number][] = (['critical', 'high', 'medium', 'low'] as Severity[])
    .map(s => [s, sl[s]?.weight ?? severityOrder[s]])
  // Sort by weight descending (higher weight = more severe = lower sort number)
  entries.sort((a, b) => b[1] - a[1])
  // Assign sort positions: 0, 1, 2, 3
  const result: Record<string, number> = {}
  entries.forEach(([key], idx) => { result[key] = idx })
  return result as Record<Severity, number>
}

/** Derive tier sort order from config weights (lower weight = lower priority → higher sort position). */
export function getTierOrder(config: AuditConfigData): Record<Tier, number> {
  const tl = config.tier_labels
  const entries: [Tier, number][] = (['tier0', 'tier1', 'tier2', 'additional', 'deferred'] as Tier[])
    .map(t => [t, tl[t]?.weight ?? tierOrder[t]])
  // Sort by weight descending (higher weight = higher priority = lower sort number)
  entries.sort((a, b) => b[1] - a[1])
  // Assign sort positions: 0, 1, 2, 3, 4
  const result: Record<string, number> = {}
  entries.forEach(([key], idx) => { result[key] = idx })
  return result as Record<Tier, number>
}

/** Derive severity colors from config. */
export function getSeverityColors(config: AuditConfigData): Record<Severity, string> {
  const sl = config.severity_levels
  return {
    critical: sl.critical?.color ?? severityColors.critical,
    high:     sl.high?.color     ?? severityColors.high,
    medium:   sl.medium?.color   ?? severityColors.medium,
    low:      sl.low?.color      ?? severityColors.low,
  }
}

/** Derive tier colors from config. */
export function getTierColors(config: AuditConfigData): Record<Tier, string> {
  const tl = config.tier_labels
  return {
    tier0:      tl.tier0?.color     ?? tierColors.tier0,
    tier1:      tl.tier1?.color     ?? tierColors.tier1,
    tier2:      tl.tier2?.color     ?? tierColors.tier2,
    additional: tl.additional?.color ?? tierColors.additional,
    deferred:   tl.deferred?.color   ?? tierColors.deferred,
  }
}

/** Derive verification colors from config. */
export function getVerificationColors(config: AuditConfigData): Record<string, string> {
  const vs = config.verification_statuses
  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(vs)) {
    // Use badge color from config; fall back to static defaults
    result[key] = (val as { badge?: string; color?: string })?.badge
      ?? (val as { badge?: string; color?: string })?.color
      ?? verificationColors[key]
      ?? '#6b7280'
  }
  // Preserve any static keys that aren't in config
  for (const [key, color] of Object.entries(verificationColors)) {
    if (!result[key]) result[key] = color
  }
  return result
}

/** Derive module color map from config module_ids, falling back to static defaults. */
export function getModuleColorMap(config: AuditConfigData): Record<string, { color: string; bg: string; border: string; text: string }> {
  // The config module_ids only provides title/short, not color info.
  // For now, return the static defaults merged with config module key names.
  // When the config schema adds color data for modules, this can be extended.
  const result: Record<string, { color: string; bg: string; border: string; text: string }> = {}
  for (const [moduleId, _val] of Object.entries(config.module_ids)) {
    if (moduleColorMap[moduleId as UnifiedModuleId]) {
      result[moduleId] = moduleColorMap[moduleId as UnifiedModuleId]
    } else {
      // Default color for new modules not in the static map
      result[moduleId] = { color: '#6b7280', bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-700 dark:text-gray-300' }
    }
  }
  // Also include all static entries not covered by config
  for (const [moduleId, val] of Object.entries(moduleColorMap)) {
    if (!result[moduleId]) result[moduleId] = val
  }
  return result
}
