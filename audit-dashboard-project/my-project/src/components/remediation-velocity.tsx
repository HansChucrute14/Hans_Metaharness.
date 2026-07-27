'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus, Clock, CheckCircle2, BarChart3 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { AuditStatus } from '@/lib/audit-types'
import {
  severityConfig,
  AUDIT_STATUS_ORDER,
  auditStatusConfig,
} from '@/lib/audit-data'
import type { Finding } from '@/lib/data'

/* ─── VELOCITY COMPUTATION ─── */

interface VelocityResult {
  /** Total findings */
  total: number
  /** Findings resolved (fixed + wont-fix) */
  resolved: number
  /** Findings in progress */
  inProgress: number
  /** Findings not started */
  notStarted: number
  /** Percentage resolved */
  percentResolved: number
  /** Percentage in progress */
  percentInProgress: number
  /** Velocity category: accelerating, steady, or stalled */
  velocityCategory: 'accelerating' | 'steady' | 'stalled' | 'not-started'
  /** Velocity description */
  velocityDescription: string
  /** Status distribution for bar chart */
  statusDistribution: { status: AuditStatus; count: number; percent: number; color: string; label: string }[]
  /** Estimated completion (if steady pace) */
  estimatedWeeks: number | null
  /** Severity breakdown of remaining work */
  remainingBySeverity: { severity: string; count: number; color: string }[]
}

export function useRemediationVelocity(
  findings: Finding[],
  statuses: Record<string, string>,
): VelocityResult {
  return useMemo(() => {
    const total = findings.length
    const statusCounts: Record<string, number> = {}
    AUDIT_STATUS_ORDER.forEach(s => { statusCounts[s] = 0 })
    findings.forEach(f => {
      const status = statuses[String(f.task)] ?? 'not-started'
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })

    const resolved = (statusCounts['fixed'] || 0) + (statusCounts['wont-fix'] || 0)
    const inProgress = statusCounts['in-progress'] || 0
    const notStarted = statusCounts['not-started'] || 0
    const percentResolved = Math.round((resolved / total) * 100)
    const percentInProgress = Math.round((inProgress / total) * 100)

    // Velocity category based on status distribution
    let velocityCategory: VelocityResult['velocityCategory']
    let velocityDescription: string

    if (percentResolved >= 80) {
      velocityCategory = 'accelerating'
      velocityDescription = 'Near completion — majority of findings resolved'
    } else if (percentResolved > 0 && percentInProgress > 0) {
      velocityCategory = 'steady'
      velocityDescription = `Active remediation: ${inProgress} in progress, ${resolved} resolved`
    } else if (percentResolved > 0 && inProgress === 0) {
      velocityCategory = 'stalled'
      velocityDescription = `Progress stalled: ${resolved} resolved but nothing currently in progress`
    } else {
      velocityCategory = 'not-started'
      velocityDescription = 'No remediation started — all findings awaiting action'
    }

    const statusDistribution = AUDIT_STATUS_ORDER.map(status => ({
      status,
      count: statusCounts[status] || 0,
      percent: Math.round(((statusCounts[status] || 0) / total) * 100),
      color: auditStatusConfig[status].color,
      label: auditStatusConfig[status].label,
    }))

    // Estimated weeks (assuming 1 finding per week for steady pace)
    const remaining = total - resolved
    const estimatedWeeks = velocityCategory === 'not-started' ? null : remaining > 0 ? Math.ceil(remaining / 2) : 0

    // Remaining by severity
    const remainingFindings = findings.filter(f => {
      const status = statuses[String(f.task)] ?? 'not-started'
      return status !== 'fixed' && status !== 'wont-fix'
    })
    const sevCounts: Record<string, number> = {}
    remainingFindings.forEach(f => {
      sevCounts[f.severity] = (sevCounts[f.severity] || 0) + 1
    })
    const remainingBySeverity = Object.entries(sevCounts)
      .map(([severity, count]) => ({
        severity,
        count,
        color: severityConfig[severity as keyof typeof severityConfig]?.color ?? '#6b7280',
      }))
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        return (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
      })

    return {
      total, resolved, inProgress, notStarted,
      percentResolved, percentInProgress,
      velocityCategory, velocityDescription,
      statusDistribution, estimatedWeeks, remainingBySeverity,
    }
  }, [findings, statuses])
}

/* ─── MAIN COMPONENT ─── */

export function RemediationVelocity({ result }: { result: VelocityResult }) {
  const {
    total, resolved, inProgress, notStarted,
    percentResolved, percentInProgress,
    velocityCategory, velocityDescription,
    statusDistribution, estimatedWeeks, remainingBySeverity,
  } = result

  const velocityIcon = velocityCategory === 'accelerating' ? TrendingUp
    : velocityCategory === 'steady' ? Minus
    : velocityCategory === 'stalled' ? TrendingDown
    : Clock

  const velocityColor = velocityCategory === 'accelerating' ? 'text-emerald-600 dark:text-emerald-300'
    : velocityCategory === 'steady' ? 'text-amber-600 dark:text-amber-300'
    : velocityCategory === 'stalled' ? 'text-orange-600 dark:text-orange-300'
    : 'text-red-600 dark:text-red-300'

  const VelocityIcon = velocityIcon

  return (
    <Card className="glass-card card-hover-enhanced overflow-hidden">
      {/* Gradient strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-teal-500 via-cyan-500 to-sky-500" />

      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-teal-500" />
          Remediation Velocity
        </CardTitle>
        <CardDescription className="text-xs">
          Progress tracking and estimated completion timeline
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* Velocity indicator */}
        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 border">
          <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center border ${
            velocityCategory === 'accelerating' ? 'bg-emerald-500/20 border-emerald-500/30'
            : velocityCategory === 'steady' ? 'bg-amber-500/20 border-amber-500/30'
            : velocityCategory === 'stalled' ? 'bg-orange-500/20 border-orange-500/30'
            : 'bg-red-500/20 border-red-500/30'
          }`}>
            <VelocityIcon className={`h-5 w-5 ${velocityColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] font-semibold ${velocityColor}`}>
                {velocityCategory === 'accelerating' ? 'Accelerating'
                : velocityCategory === 'steady' ? 'Steady'
                : velocityCategory === 'stalled' ? 'Stalled'
                : 'Not Started'}
              </Badge>
              {estimatedWeeks !== null && estimatedWeeks > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                  ~{estimatedWeeks} weeks remaining
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{velocityDescription}</p>
          </div>
        </div>

        {/* Status distribution bar */}
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Status Distribution
          </div>
          {/* Stacked bar */}
          <div className="h-6 rounded-md overflow-hidden flex bg-muted/20 border">
            {statusDistribution.filter(s => s.count > 0).map((s, i) => (
              <motion.div
                key={s.status}
                className="h-full flex items-center justify-center relative"
                style={{ backgroundColor: s.color }}
                initial={{ width: 0 }}
                animate={{ width: `${s.percent}%` }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                {s.percent >= 8 && (
                  <span className="text-[10px] font-bold text-white drop-shadow-sm whitespace-nowrap">
                    {s.count}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 flex-wrap">
            {statusDistribution.filter(s => s.count > 0).map(s => (
              <div key={s.status} className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Remaining work breakdown */}
        {remainingBySeverity.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Remaining Work by Severity
            </div>
            <div className="space-y-1.5">
              {remainingBySeverity.map((item, i) => (
                <motion.div
                  key={item.severity}
                  className="flex items-center gap-2"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-muted-foreground flex-1">
                    {severityConfig[item.severity as keyof typeof severityConfig]?.label ?? item.severity}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">{item.count}</span>
                  <div className="h-1.5 w-20 rounded-full bg-muted/30 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.round((item.count / total) * 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-center">
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{resolved}</div>
            <div className="text-[10px] text-muted-foreground">Resolved</div>
          </div>
          <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-center">
            <div className="text-sm font-bold text-amber-700 dark:text-amber-300">{inProgress}</div>
            <div className="text-[10px] text-muted-foreground">In Progress</div>
          </div>
          <div className="p-2 rounded-md bg-red-500/10 border border-red-500/20 text-center">
            <div className="text-sm font-bold text-red-700 dark:text-red-300">{notStarted}</div>
            <div className="text-[10px] text-muted-foreground">Not Started</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
