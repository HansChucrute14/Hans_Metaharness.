'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BarChart3,
  X,
  TrendingUp,
  TrendingDown,
  ChevronsUpDown,
  Sigma,
  Gauge,
  Activity,
  AlertOctagon,
  Zap,
  Clock,
  Target,
  Crown,
  ChevronRight,
} from 'lucide-react'
import { type Finding } from '@/lib/data'
import type { Severity, Tier } from '@/lib/audit-types'
import {
  getRiskScore,
  getRiskLevel,
  riskLevelConfig,
  tierImpact,
  severityWeight,
} from '@/lib/audit-data'
import { getActivityLog, type ActivityEntry } from '@/lib/use-findings'

/* ─── TYPES ─── */
export interface FindingsStatsResult {
  /** Distribution of risk scores across all findings */
  riskScoreDistribution: {
    min: number
    max: number
    mean: number
    median: number
    count: number
  }
  /** How many findings were moved to "fixed" status in the last 7 days */
  completionVelocity: {
    last7Days: number
    totalFixed: number
  }
  /** The task that has the most other findings depending on it */
  bottleneck: {
    task: string | null
    title: string | null
    blockedByCount: number
  }
  /** Top 3 findings with lowest effort but highest impact (quick wins) */
  quickWins: Array<{
    task: string | number
    title: string
    severity: Severity
    tier: Tier
    riskScore: number
    effort: 'low' | 'medium' | 'high'
  }>
  /** Findings with no activity log entry for more than 14 days */
  staleFindings: Array<{
    task: string | number
    title: string
    daysSinceUpdate: number
  }>
}

/* ─── DEFAULTS (returned during SSR / before client mount) ─── */
const DEFAULT_STATS: FindingsStatsResult = {
  riskScoreDistribution: { min: 0, max: 0, mean: 0, median: 0, count: 0 },
  completionVelocity: { last7Days: 0, totalFixed: 0 },
  bottleneck: { task: null, title: null, blockedByCount: 0 },
  quickWins: [],
  staleFindings: [],
}

/* ─── HOOK ─── */
/**
 * Compute advanced statistics insights from findings + activity log.
 * Returns memoized stats; safe to call on every render.
 *
 * NOTE: The computation reads `Date.now()` and `getActivityLog()` (which
 * accesses localStorage). Both produce different values on the server and
 * the client, which would cause a React hydration mismatch. To avoid this,
 * we gate the computation behind a `clientReady` flag that only becomes
 * `true` inside a `useEffect` (i.e. after hydration on the client). Until
 * then we return `DEFAULT_STATS` so the server-rendered HTML matches the
 * first client render.
 */
export function useFindingsStats(findings: Finding[]): FindingsStatsResult {
  const [clientReady, setClientReady] = useState(false)

  useEffect(() => {
    // Defer to next frame to ensure we run after hydration completes
    const id = requestAnimationFrame(() => setClientReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return useMemo<FindingsStatsResult>(() => {
    // Bail out during SSR / before the client has hydrated so server-rendered
    // HTML matches the first client render.
    if (typeof window === 'undefined' || !clientReady) {
      return DEFAULT_STATS
    }

    /* ── Risk score distribution ── */
    const scores = findings.map(f => getRiskScore(f.severity, f.tier))
    const sortedScores = [...scores].sort((a, b) => a - b)
    const sum = scores.reduce((acc, s) => acc + s, 0)
    const mean = scores.length > 0 ? sum / scores.length : 0
    const median =
      sortedScores.length > 0
        ? sortedScores.length % 2 === 0
          ? (sortedScores[sortedScores.length / 2 - 1]! +
              sortedScores[sortedScores.length / 2]!) /
            2
          : sortedScores[Math.floor(sortedScores.length / 2)]!
        : 0

    const riskScoreDistribution = {
      min: sortedScores.length > 0 ? sortedScores[0]! : 0,
      max: sortedScores.length > 0 ? sortedScores[sortedScores.length - 1]! : 0,
      mean: Math.round(mean * 100) / 100,
      median,
      count: scores.length,
    }

    /* ── Completion velocity (last 7 days) ── */
    const activityLog = getActivityLog()
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000

    const fixedEntriesLast7Days = activityLog.filter(
      entry =>
        entry.type === 'status_change' &&
        entry.description.endsWith('to fixed') &&
        new Date(entry.timestamp).getTime() >= sevenDaysAgo
    )
    // Unique tasks that moved to fixed (deduplicated in case of multiple status changes)
    const uniqueTasksFixedLast7Days = new Set(
      fixedEntriesLast7Days.map(e => e.task).filter(Boolean)
    ).size

    const allFixedEntries = activityLog.filter(
      entry =>
        entry.type === 'status_change' && entry.description.endsWith('to fixed')
    )
    const totalFixedTasks = new Set(
      allFixedEntries.map(e => e.task).filter(Boolean)
    ).size

    const completionVelocity = {
      last7Days: uniqueTasksFixedLast7Days,
      totalFixed: totalFixedTasks,
    }

    /* ── Bottleneck detection: most-depended-on task ── */
    // Parse dependsOn strings for "Task N" patterns across all findings
    const taskPattern = /Task\s+(\d+)/gi
    const dependencyCounts: Record<string, number> = {}
    const findingByTask: Record<string, Finding> = {}
    for (const f of findings) {
      const taskKey = String(f.task)
      findingByTask[taskKey] = f
    }
    for (const f of findings) {
      if (!f.dependsOn) continue
      let match: RegExpExecArray | null
      taskPattern.lastIndex = 0
      while ((match = taskPattern.exec(f.dependsOn)) !== null) {
        const depTask = match[1]!
        dependencyCounts[depTask] = (dependencyCounts[depTask] ?? 0) + 1
      }
    }
    let bottleneckTask: string | null = null
    let bottleneckCount = 0
    for (const [task, count] of Object.entries(dependencyCounts)) {
      if (count > bottleneckCount) {
        bottleneckCount = count
        bottleneckTask = task
      }
    }
    const bottleneck = {
      task: bottleneckTask,
      title: bottleneckTask ? findingByTask[bottleneckTask]?.title ?? null : null,
      blockedByCount: bottleneckCount,
    }

    /* ── Quick wins: lowest effort + highest impact ── */
    // Impact = tierImpact (3=tier0/critical-impact, 0=deferred/low-impact)
    // Effort = effort string from first proposal (low/medium/high)
    const effortRank: Record<string, number> = { low: 0, medium: 1, high: 2 }

    const scored = findings
      .map(f => {
        const firstProposal = f.proposals?.[0]
        const effortStr = firstProposal?.effort ?? 'medium'
        const effort: 'low' | 'medium' | 'high' =
          effortStr === 'low' || effortStr === 'medium' || effortStr === 'high'
            ? effortStr
            : 'medium'
        const impact = tierImpact[f.tier]
        // Quick-win score = (impact * 2) - effortRank
        // Higher = better quick win candidate
        const quickWinScore = impact * 2 - effortRank[effort]
        return {
          task: f.task,
          title: f.title,
          severity: f.severity,
          tier: f.tier,
          riskScore: getRiskScore(f.severity, f.tier),
          effort,
          _quickWinScore: quickWinScore,
        }
      })
      .sort((a, b) => b._quickWinScore - a._quickWinScore)
      .slice(0, 3)
      .map(({ _quickWinScore: _drop, ...rest }) => rest)

    const quickWins = scored

    /* ── Stale findings: no activity log entry in last 14 days ── */
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000
    // Build a map of task -> most recent activity timestamp
    const lastActivityByTask: Record<string, number> = {}
    for (const entry of activityLog) {
      if (!entry.task) continue
      const ts = new Date(entry.timestamp).getTime()
      if (!lastActivityByTask[entry.task] || ts > lastActivityByTask[entry.task]!) {
        lastActivityByTask[entry.task] = ts
      }
    }

    const staleFindings = findings
      .map(f => {
        const taskKey = String(f.task)
        const lastTs = lastActivityByTask[taskKey]
        // If no activity ever recorded, treat finding.createdAt (or now) as stale
        const referenceTs = lastTs ?? new Date(f.createdAt ?? Date.now()).getTime()
        const daysSinceUpdate = Math.floor(
          (Date.now() - referenceTs) / (24 * 60 * 60 * 1000)
        )
        return {
          task: f.task,
          title: f.title,
          daysSinceUpdate,
        }
      })
      .filter(item => item.daysSinceUpdate > 14)
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 5)

    return {
      riskScoreDistribution,
      completionVelocity,
      bottleneck,
      quickWins,
      staleFindings,
    }
  }, [findings, clientReady])
}

/* ─── Small helper sub-components ─── */
function StatRow({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: React.ElementType
  iconClass: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center bg-muted/60">
        <Icon className={`h-3 w-3 ${iconClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            {label}
          </span>
          <span className="text-xs font-bold text-foreground tabular-nums">
            {value}
          </span>
        </div>
        {hint && (
          <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5 line-clamp-1">
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

function QuickWinRow({
  task,
  title,
  severity,
  effort,
  riskScore,
}: {
  task: string | number
  title: string
  severity: Severity
  effort: 'low' | 'medium' | 'high'
  riskScore: number
}) {
  const sevColor: Record<Severity, string> = {
    critical: 'text-red-600',
    high: 'text-orange-600',
    medium: 'text-yellow-600',
    low: 'text-gray-600',
  }
  const effortBadge: Record<string, string> = {
    low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
    medium: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
    high: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  }
  const level = getRiskLevel(riskScore)
  return (
    <div className="flex items-start gap-1.5 py-1 text-xs border-b border-border/40 last:border-0">
      <Zap className="h-3 w-3 mt-0.5 text-emerald-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
            Task {task}
          </Badge>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 border ${effortBadge[effort]}`}>
            {effort} effort
          </Badge>
          <Badge variant="outline" className={`text-[9px] px-1 py-0 ${sevColor[severity]}`}>
            {severity}
          </Badge>
        </div>
        <p className="text-muted-foreground leading-snug mt-0.5 line-clamp-1">
          {title}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <Gauge className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            Risk score: {riskScore} ({riskLevelConfig[level].label})
          </span>
        </div>
      </div>
    </div>
  )
}

function StaleRow({
  task,
  title,
  daysSinceUpdate,
}: {
  task: string | number
  title: string
  daysSinceUpdate: number
}) {
  const isVeryStale = daysSinceUpdate > 30
  return (
    <div className="flex items-start gap-1.5 py-1 text-xs border-b border-border/40 last:border-0">
      <Clock className={`h-3 w-3 mt-0.5 flex-shrink-0 ${isVeryStale ? 'text-red-500' : 'text-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
            Task {task}
          </Badge>
          <Badge
            variant="outline"
            className={`text-[9px] px-1 py-0 ${
              isVeryStale
                ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
            }`}
          >
            {daysSinceUpdate}d stale
          </Badge>
        </div>
        <p className="text-muted-foreground leading-snug mt-0.5 line-clamp-1">
          {title}
        </p>
      </div>
    </div>
  )
}

/* ─── MAIN PANEL COMPONENT ─── */
export interface FindingsStatsPanelProps {
  findings: Finding[]
}

export function FindingsStatsPanel({ findings }: FindingsStatsPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Use a tick state to force stats recomputation when the panel opens
  // (since getActivityLog reads from localStorage which may change between renders)
  const [tick, setTick] = useState(0)
  const stats = useFindingsStats(findings)

  // Refresh stats when opening the panel
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setTick(t => t + 1))
      return () => cancelAnimationFrame(id)
    }
  }, [isOpen])

  // Poll periodically to refresh when panel is open
  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(interval)
  }, [isOpen])

  // tick is referenced so the linter doesn't complain — stats depends on findings
  // but we want to re-read localStorage when tick changes.
  void tick

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  const totalFindings = findings.length
  const staleCount = stats.staleFindings.length
  const criticalCount = findings.filter(f => f.severity === 'critical').length

  return (
    <>
      {/* Floating toggle button — left side bottom */}
      <motion.div
        className="fixed bottom-4 left-4 z-40 no-print"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.6, type: 'spring' }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-10 w-10 rounded-full shadow-lg backdrop-blur-md border-2 transition-all ${
                  isOpen
                    ? 'bg-violet-600 text-white border-violet-500 shadow-violet-500/20'
                    : 'bg-background/80 border-border hover:border-violet-500/50 hover:bg-violet-500/10'
                }`}
                onClick={handleToggle}
                aria-label="Findings statistics insights"
              >
                <BarChart3 className="h-4 w-4" />
                {staleCount > 0 && !isOpen && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1 animate-pulse">
                    {staleCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Insights &amp; Statistics</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>

      {/* Expandable panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-16 left-4 z-40 no-print w-80 sm:w-96"
          >
            <div className="rounded-lg border shadow-xl backdrop-blur-md bg-background/95 border-violet-500/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b bg-violet-500/5">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                    Insights
                  </h3>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {totalFindings} findings
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close insights panel"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Body */}
              <div className="max-h-[28rem] overflow-y-auto p-3 custom-scrollbar">
                {/* Section: Risk Score Distribution */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ChevronsUpDown className="h-3 w-3 text-violet-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                      Risk Score Distribution
                    </span>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/50 p-2 space-y-0">
                    <StatRow
                      icon={TrendingDown}
                      iconClass="text-emerald-600"
                      label="Min"
                      value={String(stats.riskScoreDistribution.min)}
                    />
                    <StatRow
                      icon={TrendingUp}
                      iconClass="text-red-600"
                      label="Max"
                      value={String(stats.riskScoreDistribution.max)}
                    />
                    <StatRow
                      icon={Sigma}
                      iconClass="text-violet-600"
                      label="Mean"
                      value={stats.riskScoreDistribution.mean.toFixed(2)}
                    />
                    <StatRow
                      icon={Activity}
                      iconClass="text-teal-600"
                      label="Median"
                      value={String(stats.riskScoreDistribution.median)}
                    />
                  </div>
                </div>

                {/* Section: Completion Velocity */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <TrendingUp className="h-3 w-3 text-emerald-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Completion Velocity
                    </span>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/50 p-2">
                    <div className="flex items-center justify-between py-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Activity className="h-3 w-3" /> Fixed in last 7 days
                      </span>
                      <span className="text-sm font-bold text-emerald-600 tabular-nums">
                        {stats.completionVelocity.last7Days}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-t border-border/40">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Crown className="h-3 w-3" /> Total fixed (all-time)
                      </span>
                      <span className="text-sm font-bold text-foreground tabular-nums">
                        {stats.completionVelocity.totalFixed}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Section: Bottleneck Detection */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertOctagon className="h-3 w-3 text-orange-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                      Bottleneck Detection
                    </span>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/50 p-2">
                    {stats.bottleneck.task ? (
                      <>
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                            Task {stats.bottleneck.task}
                          </Badge>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30">
                            {stats.bottleneck.blockedByCount} blocked
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                          {stats.bottleneck.title ?? 'Title unavailable'}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-1">
                          Most findings depend on this task — prioritise unblocking it.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground py-1">
                        No cross-task dependencies detected.
                      </p>
                    )}
                  </div>
                </div>

                {/* Section: Quick Wins */}
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Zap className="h-3 w-3 text-emerald-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Quick Wins
                      <span className="ml-1 text-muted-foreground font-normal normal-case">
                        · low effort, high impact
                      </span>
                    </span>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/50 p-2">
                    {stats.quickWins.length > 0 ? (
                      stats.quickWins.map(qw => (
                        <QuickWinRow key={String(qw.task)} {...qw} />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground py-1">
                        No quick wins identified.
                      </p>
                    )}
                  </div>
                </div>

                {/* Section: Stale Findings */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Clock className="h-3 w-3 text-amber-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Stale Findings
                      <span className="ml-1 text-muted-foreground font-normal normal-case">
                        · no activity in &gt;14 days
                      </span>
                    </span>
                  </div>
                  <div className="rounded-md border border-border/50 bg-card/50 p-2">
                    {stats.staleFindings.length > 0 ? (
                      stats.staleFindings.map(item => (
                        <StaleRow key={String(item.task)} {...item} />
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground py-1 flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 text-emerald-500" />
                        All findings have recent activity.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-2 border-t text-[10px] text-center text-muted-foreground/60">
                Computed from {totalFindings} findings · {criticalCount} critical
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* Re-export for convenience */
export type { ActivityEntry }
