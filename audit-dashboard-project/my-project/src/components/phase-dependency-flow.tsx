'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Layers, ArrowRight, AlertTriangle, Route } from 'lucide-react'
import { PHASES } from '@/components/timeline-view'
import type { Severity, Finding } from '@/lib/audit-types'
import {
  severityConfig,
} from '@/lib/audit-data'

/* Severity → hex (kept in sync with dashboard-client severityColors) */
const SEVERITY_HEX: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

/* Phase flow color palette (emerald → teal → sky → amber → orange)
   Avoids indigo/blue; sky is kept subtle via low-opacity backgrounds. */
const FLOW_COLORS = ['#10b981', '#14b8a6', '#0ea5e9', '#f59e0b', '#f97316']

/* Critical path: the longest dependency chain through the phases
   Phase 1 → Phase 2 → Phase 4 → Phase 5
   (Phase 3 is parallel with Phase 2, not on the blocking chain) */
const CRITICAL_PATH_PHASE_IDS = [1, 2, 4, 5]

/* Critical findings on the critical path */
const CRITICAL_PATH_TASKS = ['1', '2', '3', '8', '11', '19', '10']

/**
 * Phase Dependency Flow — horizontal visualization showing the 5 remediation
 * phases as rounded rectangles connected by arrows, with the top critical
 * findings listed beneath each phase box. Uses framer-motion entrance
 * animations staggered by 0.1s.
 *
 * When "Show Critical Path" is toggled on:
 * - Arrows on the critical path become thick, bright red
 * - Phase boxes on the critical path get a red border pulse animation
 * - Critical findings on the path are highlighted
 */
export function PhaseDependencyFlow({ findings }: { findings: Finding[] }) {
  const [showCriticalPath, setShowCriticalPath] = useState(false)

  const phaseData = useMemo(() => {
    const byTask = new Map<string, Finding>()
    findings.forEach(f => byTask.set(String(f.task), f))

    return PHASES.map((phase, idx) => {
      const phaseFindings = phase.tasks
        .map(t => byTask.get(t))
        .filter((f): f is Finding => Boolean(f))
      const criticalCount = phaseFindings.filter(f => f.severity === 'critical').length
      // Top 3 critical findings (fill with high-severity if fewer than 3 criticals)
      const criticals = phaseFindings.filter(f => f.severity === 'critical')
      const highs = phaseFindings.filter(f => f.severity === 'high')
      const topFindings = [...criticals, ...highs].slice(0, 3)
      const isOnCriticalPath = CRITICAL_PATH_PHASE_IDS.includes(phase.id)
      const hasCriticalPathTask = phase.tasks.some(t => CRITICAL_PATH_TASKS.includes(t))
      return {
        ...phase,
        color: FLOW_COLORS[idx % FLOW_COLORS.length],
        findings: phaseFindings,
        criticalCount,
        topFindings,
        isOnCriticalPath,
        hasCriticalPathTask,
      }
    })
  }, [findings])

  // Determine which arrows are on the critical path
  // Arrow between phase i and phase i+1 is on critical path if both phases are on the path
  const criticalPathArrows = useMemo(() => {
    const arrows = new Map<number, boolean>() // phase.id → is its outgoing arrow critical
    for (let i = 0; i < phaseData.length - 1; i++) {
      const current = phaseData[i]
      const next = phaseData[i + 1]
      const isCritical = current.isOnCriticalPath && next.isOnCriticalPath
      arrows.set(current.id, isCritical)
    }
    return arrows
  }, [phaseData])

  return (
    <Card className="glass-card card-hover-enhanced">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2 heading-section">
              <Layers className="h-4 w-4" /> Phase Dependency Flow
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground dark:text-muted-foreground/90">
              Sequential flow of the 5 remediation phases with top critical findings per phase
            </CardDescription>
          </div>
          {/* Critical Path Toggle */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="critical-path-toggle"
              checked={showCriticalPath}
              onCheckedChange={(checked) => setShowCriticalPath(checked === true)}
              className="data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500"
            />
            <label
              htmlFor="critical-path-toggle"
              className="text-xs font-medium cursor-pointer flex items-center gap-1.5 select-none"
            >
              <Route className="h-3.5 w-3.5 text-red-500" />
              Show Critical Path
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex flex-col lg:flex-row items-stretch gap-2 overflow-x-auto scrollbar-custom pb-2">
          {phaseData.map((phase, i) => {
            const isLast = i === phaseData.length - 1
            const isCriticalArrow = criticalPathArrows.get(phase.id) ?? false
            return (
              <div
                key={phase.id}
                className="flex flex-col lg:flex-row items-stretch gap-2 lg:gap-1 min-w-[200px] lg:min-w-0 lg:flex-1"
              >
                {/* Phase box */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    ...(showCriticalPath && phase.isOnCriticalPath && phase.hasCriticalPathTask
                      ? { borderColor: SEVERITY_HEX.critical }
                      : {}),
                  }}
                  transition={{ delay: i * 0.1, duration: 0.4, type: 'spring', stiffness: 120 }}
                  whileHover={{ y: -2 }}
                  className={`flex-1 min-w-0 rounded-lg border bg-card overflow-hidden ${
                    showCriticalPath && phase.isOnCriticalPath && phase.hasCriticalPathTask
                      ? 'critical-path-pulse'
                      : ''
                  }`}
                  style={{
                    borderColor: showCriticalPath && phase.isOnCriticalPath
                      ? `${SEVERITY_HEX.critical}80`
                      : `${phase.color}60`,
                    background: showCriticalPath && phase.isOnCriticalPath
                      ? `linear-gradient(135deg, ${SEVERITY_HEX.critical}10, ${phase.color}08, transparent)`
                      : `linear-gradient(135deg, ${phase.color}10, transparent)`,
                  }}
                >
                  {/* Phase header */}
                  <div
                    className="flex items-center gap-2 p-3 border-b"
                    style={{
                      borderColor: showCriticalPath && phase.isOnCriticalPath
                        ? `${SEVERITY_HEX.critical}30`
                        : `${phase.color}30`,
                      background: showCriticalPath && phase.isOnCriticalPath
                        ? `${SEVERITY_HEX.critical}08`
                        : `${phase.color}10`,
                    }}
                  >
                    <div
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                        showCriticalPath && phase.isOnCriticalPath && phase.hasCriticalPathTask ? 'critical-path-node-pulse' : ''
                      }`}
                      style={{
                        backgroundColor: showCriticalPath && phase.isOnCriticalPath
                          ? SEVERITY_HEX.critical
                          : phase.color,
                      }}
                    >
                      {phase.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate" title={phase.title}>
                        {phase.title}
                        {showCriticalPath && phase.isOnCriticalPath && (
                          <span className="text-red-600 ml-1 font-bold">⚡</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>{phase.findings.length} findings</span>
                        {phase.criticalCount > 0 && (
                          <>
                            <span className="text-muted-foreground/50">·</span>
                            <span
                              className={`inline-flex items-center gap-0.5 font-medium ${
                                showCriticalPath && phase.isOnCriticalPath ? 'text-red-600' : ''
                              }`}
                              style={{ color: showCriticalPath && phase.isOnCriticalPath ? SEVERITY_HEX.critical : SEVERITY_HEX.critical }}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {phase.criticalCount} crit
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top critical findings list */}
                  <div className="p-2.5 space-y-1 min-h-[88px]">
                    {phase.topFindings.length > 0 ? (
                      phase.topFindings.map(f => {
                        const isCriticalPathTask = CRITICAL_PATH_TASKS.includes(String(f.task))
                        return (
                          <div
                            key={String(f.task)}
                            className={`flex items-center gap-1.5 text-[10px] ${
                              showCriticalPath && isCriticalPathTask
                                ? 'font-semibold text-red-700 dark:text-red-300'
                                : ''
                            }`}
                            title={`Task ${f.task}: ${f.title}`}
                          >
                            <span
                              className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
                                showCriticalPath && isCriticalPathTask ? 'critical-path-dot-pulse' : ''
                              }`}
                              style={{
                                backgroundColor: showCriticalPath && isCriticalPathTask
                                  ? SEVERITY_HEX.critical
                                  : SEVERITY_HEX[f.severity],
                              }}
                            />
                            <span
                              className="font-mono text-muted-foreground flex-shrink-0"
                              style={{ fontSize: '9px' }}
                            >
                              T{f.task}
                            </span>
                            <span className="truncate text-foreground/80">
                              {f.title}
                            </span>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-[10px] text-muted-foreground italic py-2 text-center">
                        No critical/high findings
                      </div>
                    )}
                    {/* Week estimate footer */}
                    <div className="pt-1.5 mt-1 border-t border-border/30">
                      <Badge
                        variant="outline"
                        className="text-[9px] font-normal"
                        style={{
                          borderColor: showCriticalPath && phase.isOnCriticalPath
                            ? `${SEVERITY_HEX.critical}50`
                            : `${phase.color}50`,
                          color: showCriticalPath && phase.isOnCriticalPath
                            ? SEVERITY_HEX.critical
                            : phase.color,
                        }}
                      >
                        {phase.weeksEstimate}
                      </Badge>
                    </div>
                  </div>
                </motion.div>

                {/* Arrow between phases (horizontal on lg, vertical on mobile) */}
                {!isLast && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="flex items-center justify-center flex-shrink-0"
                    aria-hidden="true"
                  >
                    {/* Horizontal arrow (lg+) */}
                    {showCriticalPath && isCriticalArrow ? (
                      <motion.div
                        animate={{ x: [0, 2, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <ArrowRight
                          className="hidden lg:block h-6 w-6"
                          style={{ color: SEVERITY_HEX.critical, strokeWidth: 2.5 }}
                        />
                      </motion.div>
                    ) : (
                      <ArrowRight
                        className="hidden lg:block h-5 w-5 text-muted-foreground"
                        style={{ color: phase.color }}
                      />
                    )}
                    {/* Vertical arrow (mobile) */}
                    {showCriticalPath && isCriticalArrow ? (
                      <motion.div
                        animate={{ y: [0, 2, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <ArrowRight
                          className="lg:hidden h-5 w-5 rotate-90"
                          style={{ color: SEVERITY_HEX.critical, strokeWidth: 2.5 }}
                        />
                      </motion.div>
                    ) : (
                      <ArrowRight
                        className="lg:hidden h-4 w-4 text-muted-foreground rotate-90"
                        style={{ color: phase.color }
                        }
                      />
                    )}
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>

        {/* Flow legend / caption */}
        <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Sequence direction
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_HEX.critical }} />
            Critical
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SEVERITY_HEX.high }} />
            High
          </span>
          {showCriticalPath && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <Route className="h-3 w-3" />
              Critical path: P1 → P2 → P4 → P5
            </span>
          )}
          <span className="text-muted-foreground/70 italic">
            Top 3 critical/high findings shown per phase
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
