'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip'
import {
  Clock, Calendar, ArrowRight, ChevronDown, ChevronUp, Zap, Gauge,
  ListChecks, BarChart3, AlertTriangle,
} from 'lucide-react'
import type { Severity, Tier, Finding } from '@/lib/audit-types'
import {
  severityConfig, tierLabels, effortConfig, riskConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
} from '@/lib/audit-data'

/* Phase data for the 5 remediation phases */
export const PHASES = [
  {
    id: 1,
    title: 'Now — Parallel, No Deps',
    color: '#dc2626',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/30',
    tasks: ['1', '2', '3', '8', '11', '19'],
    description: 'Safety freeze, restore _shared.py, harden antagonisms, diagnose L1, delete dead code, fix stage order',
    weeksEstimate: '1–2 weeks',
  },
  {
    id: 2,
    title: 'After Task 2',
    color: '#f97316',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/30',
    tasks: ['13', '14', '15', '17', '18'],
    description: 'Validation pipeline gated fixes: git commit, circuit breaker, import smoke, FDC key, audit trail',
    weeksEstimate: '2–3 weeks',
  },
  {
    id: 3,
    title: 'Parallel with above',
    color: '#eab308',
    bgClass: 'bg-yellow-500/10',
    borderClass: 'border-yellow-500/30',
    tasks: ['4', '20', '5', '12'],
    description: 'Real nutrient reporting + tests, severity recommendations, arginine confirmation',
    weeksEstimate: '2–4 weeks',
  },
  {
    id: 4,
    title: 'Slower, high-value',
    color: '#10b981',
    bgClass: 'bg-emerald-500/10',
    borderClass: 'border-emerald-500/30',
    tasks: ['9', '10', '16'],
    description: 'Canonical registry, schema gate + repair, CI schema-gate job',
    weeksEstimate: '3–5 weeks',
  },
  {
    id: 5,
    title: 'After Gate G3',
    color: '#6b7280',
    bgClass: 'bg-gray-500/10',
    borderClass: 'border-gray-500/30',
    tasks: ['6', '7'],
    description: 'Ca/P ceilings, growth-energy curve (requires veterinary review)',
    weeksEstimate: '4–8 weeks',
  },
]

/* Severity → hex map for dots & legend (kept in sync with dashboard-client severityColors) */
const SEVERITY_HEX: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

/* Week-based timeline layout for the Gantt chart */
const WEEK_SCALE = 28 // px per week unit
const PHASE_START_WEEKS = [0, 2, 2, 5, 8]
const PHASE_DURATION_WEEKS = [2, 3, 4, 5, 4]
const LABEL_WIDTH = 120 // px reserved on the left for phase labels

export function TimelineView({ findings }: { findings: Finding[] }) {
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null)
  const [hoveredTask, setHoveredTask] = useState<string | null>(null)

  const findingsByTask = useMemo(() => {
    const map = new Map<string, Finding>()
    findings.forEach(f => map.set(String(f.task), f))
    return map
  }, [findings])

  const phaseStats = useMemo(() => {
    return PHASES.map(phase => {
      const phaseFindings = phase.tasks
        .map(t => findingsByTask.get(t))
        .filter((f): f is Finding => Boolean(f))
      const totalEffort = phaseFindings.reduce((sum, f) => {
        const bestProposal = f.proposals.slice().sort((a, b) => {
          const effOrd: Record<string, number> = { low: 0, medium: 1, high: 2 }
          return effOrd[a.effort] - effOrd[b.effort]
        })[0]
        const effHours: Record<string, number> = { low: 4, medium: 16, high: 40 }
        return sum + (bestProposal ? effHours[bestProposal.effort] : 16)
      }, 0)
      const criticalCount = phaseFindings.filter(f => f.severity === 'critical').length
      const avgRiskScore = phaseFindings.length > 0
        ? phaseFindings.reduce((s, f) => s + getRiskScore(f.severity, f.tier), 0) / phaseFindings.length
        : 0
      return {
        ...phase,
        findings: phaseFindings,
        totalEffort,
        criticalCount,
        avgRiskScore: Math.round(avgRiskScore * 10) / 10,
      }
    })
  }, [findingsByTask])

  const totalWeeks = PHASE_START_WEEKS.reduce((max, start, i) =>
    Math.max(max, start + PHASE_DURATION_WEEKS[i]), 0)

  // Total effort across all phases (used for sidebar progress bars)
  const grandTotalEffort = phaseStats.reduce((s, p) => s + p.totalEffort, 0) || 1
  // Major gridlines: every 2 weeks → W0, W2, W4, ... (5–7 lines for a 12-week timeline)
  const majorWeeks = Array.from(
    { length: Math.floor(totalWeeks / 2) + 1 },
    (_, i) => i * 2,
  )

  const ganttWidth = totalWeeks * WEEK_SCALE + LABEL_WIDTH

  return (
    <Card className="border-2 border-purple-500/20 overflow-hidden bg-gradient-to-br from-emerald-500/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-purple-600" />
          Remediation Timeline — Gantt View
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground dark:text-muted-foreground/90">
          Visual timeline showing 5 phases of remediation with estimated effort &middot; hover for details &middot; click to expand
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {/* 2-COLUMN LAYOUT: Gantt (lg:col-span-2) + Phase sidebar (lg:col-span-1) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ─── LEFT: GANTT CHART (spans 2 cols) ─── */}
          <div className="lg:col-span-2 space-y-3">
            <TooltipProvider delayDuration={200}>
              <div
                className="overflow-x-auto scrollbar-custom pb-2 rounded-lg border border-border/40 bg-gradient-to-br from-emerald-500/5 to-transparent p-3"
              >
                <div className="relative" style={{ width: `${ganttWidth}px`, minWidth: '560px' }}>
                  {/* Top axis: week labels (only major gridline weeks) */}
                  <div className="relative h-5 mb-1" style={{ width: `${ganttWidth}px` }}>
                    {majorWeeks.map(w => (
                      <div
                        key={`label-${w}`}
                        className="absolute text-[10px] font-mono text-muted-foreground dark:text-muted-foreground/80 -translate-x-1/2"
                        style={{ left: `${LABEL_WIDTH + w * WEEK_SCALE}px`, top: 0 }}
                      >
                        W{w}
                      </div>
                    ))}
                  </div>

                  {/* Phase bars + gridlines container */}
                  <div
                    className="relative space-y-3"
                    style={{ minHeight: `${phaseStats.length * 56}px` }}
                  >
                    {/* Major vertical dashed gridlines (every 2 weeks — W0, W2, W4, etc.) */}
                    {majorWeeks.map(w => (
                      <div
                        key={`grid-major-${w}`}
                        className="absolute top-0 bottom-0 w-px"
                        style={{
                          left: `${LABEL_WIDTH + w * WEEK_SCALE}px`,
                          background: `repeating-linear-gradient(to bottom, var(--border) 0px, var(--border) 4px, transparent 4px, transparent 8px)`,
                          opacity: 0.5,
                        }}
                      />
                    ))}
                    {/* Minor dotted gridlines (every week) */}
                    {Array.from({ length: totalWeeks + 1 }).map((_, w) => (
                      w % 2 === 0 ? null : (
                        <div
                          key={`grid-minor-${w}`}
                          className="absolute top-0 bottom-0 border-l border-dashed border-border/15 dark:border-border/20"
                          style={{ left: `${LABEL_WIDTH + w * WEEK_SCALE}px` }}
                        />
                      )
                    ))}

                    {phaseStats.map((phase, i) => {
                      const left = PHASE_START_WEEKS[i] * WEEK_SCALE + LABEL_WIDTH
                      const width = PHASE_DURATION_WEEKS[i] * WEEK_SCALE
                      const isExpanded = expandedPhase === phase.id
                      // Reserve space for badges on the right (e.g. "2 crit" + "4.2/6 avg")
                      // so the title flexes and truncates cleanly instead of overlapping.
                      const showBadges = phase.criticalCount > 0 || phase.avgRiskScore > 0

                      return (
                        <div key={phase.id} className="relative h-14">
                          {/* Phase label (left) */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute left-0 top-0 w-[116px] flex items-center gap-1 cursor-pointer group"
                                onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                              >
                                <div
                                  className="w-2 h-8 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: phase.color }}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold truncate group-hover:text-foreground transition-colors">
                                    Phase {phase.id}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {phase.findings.length} tasks &middot; {phase.totalEffort}h
                                  </div>
                                </div>
                                {isExpanded ? (
                                  <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <div className="space-y-0.5">
                                <div className="font-semibold text-xs">Phase {phase.id}: {phase.title}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {phase.findings.length} findings &middot; {phase.criticalCount} critical &middot; {phase.totalEffort}h
                                </div>
                                <div className="text-[10px] text-muted-foreground">{phase.weeksEstimate}</div>
                              </div>
                            </TooltipContent>
                          </Tooltip>

                          {/* Phase bar */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <motion.div
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width, opacity: 1 }}
                                transition={{ duration: 0.6, delay: i * 0.12 }}
                                className="absolute top-2 h-10 rounded-lg cursor-pointer overflow-hidden"
                                style={{ left, backgroundColor: `${phase.color}25`, borderColor: `${phase.color}50` }}
                                onClick={() => setExpandedPhase(isExpanded ? null : phase.id)}
                              >
                                {/* Gradient fill */}
                                <div
                                  className="absolute inset-0 rounded-lg"
                                  style={{
                                    background: `linear-gradient(90deg, ${phase.color}40, ${phase.color}15)`,
                                  }}
                                />
                                {/* Border */}
                                <div
                                  className="absolute inset-0 rounded-lg border-2"
                                  style={{ borderColor: `${phase.color}60` }}
                                />

                                {/* Bar content: title flexes + truncates, badges pin to right */}
                                <div className="absolute inset-0 flex items-center px-2.5 gap-1.5 min-w-0">
                                  <span
                                    className="text-[10px] leading-tight font-semibold whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-shrink"
                                    style={{ color: phase.color }}
                                    title={`Phase ${phase.id}: ${phase.title}`}
                                  >
                                    {phase.title}
                                  </span>
                                  {showBadges && (
                                    <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                                      {phase.criticalCount > 0 && (
                                        <Badge className="text-[8px] h-4 px-1 bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30 border">
                                          {phase.criticalCount} crit
                                        </Badge>
                                      )}
                                      <Badge variant="outline" className="text-[8px] h-4 px-1" style={{ borderColor: phase.color, color: phase.color }}>
                                        <Gauge className="h-2 w-2 mr-0.5" />
                                        {phase.avgRiskScore}/6
                                      </Badge>
                                    </div>
                                  )}
                                </div>

                                {/* Task markers inside bar */}
                                <div className="absolute bottom-0.5 left-2 right-2 flex items-center gap-0.5">
                                  {phase.findings.map(f => {
                                    const isHovered = hoveredTask === String(f.task)
                                    return (
                                      <Tooltip key={String(f.task)}>
                                        <TooltipTrigger asChild>
                                          <motion.div
                                            className="w-2.5 h-2.5 rounded-full cursor-pointer transition-transform"
                                            style={{
                                              backgroundColor: SEVERITY_HEX[f.severity],
                                              transform: isHovered ? 'scale(1.5)' : 'scale(1)',
                                            }}
                                            onMouseEnter={() => setHoveredTask(String(f.task))}
                                            onMouseLeave={() => setHoveredTask(null)}
                                          />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <div className="space-y-1">
                                            <div className="font-semibold text-xs">Task {f.task}: {f.title}</div>
                                            <div className="text-[10px] flex items-center gap-1">
                                              <span style={{ color: SEVERITY_HEX[f.severity] }}>
                                                {severityConfig[f.severity].label}
                                              </span>
                                              &middot;
                                              <span>{tierLabels[f.tier].short}</span>
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    )
                                  })}
                                </div>
                              </motion.div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <div className="space-y-1">
                                <div className="font-semibold text-xs">Phase {phase.id}: {phase.title}</div>
                                <div className="text-[10px] text-muted-foreground">{phase.description}</div>
                                <div className="flex items-center gap-2 text-[10px]">
                                  <span className="flex items-center gap-0.5">
                                    <AlertTriangle className="h-2.5 w-2.5" style={{ color: SEVERITY_HEX.critical }} />
                                    <span style={{ color: SEVERITY_HEX.critical }}>{phase.criticalCount} critical</span>
                                  </span>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span>W{PHASE_START_WEEKS[i]}–W{PHASE_START_WEEKS[i] + PHASE_DURATION_WEEKS[i]}</span>
                                  <span className="text-muted-foreground/50">·</span>
                                  <span>{phase.totalEffort}h effort</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )
                    })}
                  </div>

                  {/* Dependency arrows */}
                  <div className="relative h-8 mt-1" style={{ width: `${ganttWidth}px` }}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.7 }}
                      transition={{ delay: 0.8 }}
                      className="absolute flex items-center gap-1"
                      style={{
                        left: `${(PHASE_START_WEEKS[0] + PHASE_DURATION_WEEKS[0]) * WEEK_SCALE + LABEL_WIDTH}px`,
                        top: 0,
                      }}
                    >
                      <ArrowRight className="h-4 w-4 text-red-500" />
                      <span className="text-[9px] text-muted-foreground">Task 2 blocks P2</span>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.7 }}
                      transition={{ delay: 1.0 }}
                      className="absolute flex items-center gap-1"
                      style={{
                        left: `${(PHASE_START_WEEKS[3] + PHASE_DURATION_WEEKS[3]) * WEEK_SCALE + LABEL_WIDTH}px`,
                        top: 0,
                      }}
                    >
                      <ArrowRight className="h-4 w-4 text-emerald-500" />
                      <span className="text-[9px] text-muted-foreground">Gate G3 → P5</span>
                    </motion.div>
                  </div>
                </div>
              </div>
            </TooltipProvider>

            {/* Legend for colored dots + gridlines */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground/80">Severity:</span>
                {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => (
                  <div key={s} className="flex items-center gap-1">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: SEVERITY_HEX[s] }}
                    />
                    <span>{severityConfig[s].label}</span>
                  </div>
                ))}
              </div>
              <div className="h-3 w-px bg-border/40" />
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground/80">Grid:</span>
                <span className="inline-block w-3 h-px border-t border-border/60" />
                <span>Week</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ArrowRight className="h-3 w-3 text-red-500" />
                <span>Blocks</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-muted-foreground" />
                <span>Avg risk score (0–6)</span>
              </div>
            </div>
          </div>

          {/* ─── RIGHT: PHASE SUMMARY SIDEBAR (1 col) ─── */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
              <BarChart3 className="h-3 w-3" />
              Phase Effort Breakdown
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-custom pr-1">
              {phaseStats.map((phase, i) => {
                const effortPct = Math.round((phase.totalEffort / grandTotalEffort) * 100)
                const isActive = expandedPhase === phase.id
                return (
                  <motion.div
                    key={phase.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`relative rounded-md border p-3 cursor-pointer transition-all hover:shadow-sm ${phase.bgClass} ${phase.borderClass} ${isActive ? 'ring-2 ring-offset-1 ring-offset-background' : ''}`}
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: phase.color,
                      ...(isActive ? { boxShadow: `0 0 0 2px ${phase.color}40` } : {}),
                    }}
                    onClick={() => setExpandedPhase(isActive ? null : phase.id)}
                  >
                    {/* Phase number + name */}
                    <div className="flex items-start gap-2 mb-2">
                      <div
                        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: phase.color }}
                      >
                        {phase.id}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate" title={phase.title}>
                          {phase.title}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {phase.weeksEstimate}
                        </div>
                      </div>
                    </div>

                    {/* Findings count + hours */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="rounded bg-background/60 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Findings</div>
                        <div className="text-xs font-semibold tabular-nums">
                          <span className="text-red-600 dark:text-red-400">{phase.criticalCount}</span>
                          <span className="text-muted-foreground/60"> / </span>
                          <span>{phase.findings.length}</span>
                        </div>
                      </div>
                      <div className="rounded bg-background/60 px-2 py-1">
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Hours</div>
                        <div className="text-xs font-semibold tabular-nums" style={{ color: phase.color }}>
                          {phase.totalEffort}h
                        </div>
                      </div>
                    </div>

                    {/* Effort progress bar */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                        <span>Effort share</span>
                        <span className="tabular-nums">{effortPct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-background/80 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${effortPct}%` }}
                          transition={{ duration: 0.6, delay: 0.2 + i * 0.05 }}
                          className="h-full rounded-full"
                          style={{
                            background: `linear-gradient(90deg, ${phase.color}, ${phase.color}aa)`,
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Expanded phase detail (full width) */}
        <AnimatePresence>
          {expandedPhase !== null && (() => {
            const phase = phaseStats.find(p => p.id === expandedPhase)
            if (!phase) return null
            return (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className={`rounded-lg border p-4 ${phase.bgClass} ${phase.borderClass}`}
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: phase.color }} />
                  <h3 className="text-sm font-semibold">Phase {phase.id}: {phase.title}</h3>
                  <Badge variant="outline" className="text-[10px]" style={{ borderColor: phase.color, color: phase.color }}>
                    {phase.weeksEstimate}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <Zap className="h-2.5 w-2.5 mr-0.5" />
                    {phase.totalEffort}h total effort
                  </Badge>
                  {phase.criticalCount > 0 && (
                    <Badge className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 border">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                      {phase.criticalCount} critical
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{phase.description}</p>

                {/* Task cards within phase */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {phase.findings.map(f => {
                    const bestProposal = f.proposals.slice().sort((a, b) => {
                      const effOrd: Record<string, number> = { low: 0, medium: 1, high: 2 }
                      return effOrd[a.effort] - effOrd[b.effort]
                    })[0]
                    const riskScore = getRiskScore(f.severity, f.tier)
                    const riskLevel = getRiskLevel(riskScore)
                    return (
                      <motion.div
                        key={String(f.task)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-md border p-3 bg-card/80"
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Badge variant="outline" className="font-mono text-[10px]">Task {f.task}</Badge>
                          <Badge className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} ${severityConfig[f.severity].border} border text-[9px]`}>
                            {severityConfig[f.severity].label}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]" style={{ borderColor: riskLevelConfig[riskLevel].color, color: riskLevelConfig[riskLevel].color }}>
                            <Gauge className="h-2 w-2 mr-0.5" /> {riskScore}/6
                          </Badge>
                        </div>
                        <div className="text-xs font-semibold mb-1">{f.title}</div>
                        <div className="text-[10px] text-muted-foreground line-clamp-2">{f.summary}</div>
                        {bestProposal && (
                          <div className="mt-2 flex items-center gap-1 text-[10px]">
                            <Badge className={`${effortConfig[bestProposal.effort].color} text-[9px] border`}>
                              <Zap className="h-2 w-2 mr-0.5" />
                              {effortConfig[bestProposal.effort].label}
                            </Badge>
                            <Badge variant="outline" className={`text-[9px] border ${riskConfig[bestProposal.risk].color}`}>
                              {riskConfig[bestProposal.risk].label}
                            </Badge>
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            )
          })()}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
