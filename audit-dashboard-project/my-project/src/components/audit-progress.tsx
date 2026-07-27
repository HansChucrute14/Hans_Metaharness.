'use client'

import { motion } from 'framer-motion'
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip'
import {
  CheckCircle2, LoaderCircle, Circle, XCircle, ListChecks, RotateCcw,
  TrendingUp, Clock, Gauge,
} from 'lucide-react'
import type { AuditStatus, Finding } from '@/lib/audit-types'
import {
  FINDINGS, auditStatusConfig, AUDIT_STATUS_ORDER,
  getTotalEffortHours, getEffortBreakdown, effortHours,
} from '@/lib/audit-data'

function StatusIcon({ status, className }: { status: AuditStatus; className?: string }) {
  switch (status) {
    case 'not-started': return <Circle className={className} />
    case 'in-progress': return <LoaderCircle className={`${className ?? ''} animate-spin-slow`} />
    case 'fixed': return <CheckCircle2 className={className} />
    case 'wont-fix': return <XCircle className={className} />
  }
}

export function AuditProgressSection({
  stats,
  statuses,
  onReset,
  onJumpToTask,
}: {
  stats: {
    counts: Record<AuditStatus, number>
    total: number
    resolved: number
    percentComplete: number
    percentInProgress: number
    remaining: number
  }
  statuses: Record<string, AuditStatus>
  onReset: () => void
  onJumpToTask?: (task: string | number) => void
}) {
  const inProgressFindings = FINDINGS.filter(f => statuses[String(f.task)] === 'in-progress')
  const totalHours = getTotalEffortHours()
  const effortBreakdown = getEffortBreakdown()
  const estimatedHours =
    effortBreakdown.low * effortHours.low +
    effortBreakdown.medium * effortHours.medium +
    effortBreakdown.high * effortHours.high

  const donutData = AUDIT_STATUS_ORDER.map(s => ({
    name: auditStatusConfig[s].label,
    value: stats.counts[s],
    color: auditStatusConfig[s].color,
  }))

  return (
    <Card className="border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-600" />
            Audit Remediation Progress
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={onReset}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset all progress (cannot be undone)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>
          Track remediation status per finding &middot; saved to your browser
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Big % bar */}
        <div className="space-y-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-4xl font-bold text-emerald-600 tabular-nums">
                {stats.percentComplete}%
              </div>
              <div className="text-xs text-muted-foreground">
                {stats.resolved} of {stats.total} findings resolved
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-0.5">
              <div className="flex items-center justify-end gap-1">
                <TrendingUp className="h-3 w-3" /> {stats.percentInProgress}% touched
              </div>
              <div className="flex items-center justify-end gap-1">
                <Clock className="h-3 w-3" /> {stats.remaining} remaining
              </div>
            </div>
          </div>
          <Progress
            value={stats.percentComplete}
            className="h-3 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-500"
          />
          <Progress
            value={stats.percentInProgress}
            className="h-1.5 -mt-1 opacity-40 [&>div]:bg-blue-500"
          />
        </div>

        {/* Donut + status grid */}
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4">
          <div className="flex items-center justify-center">
            <div className="relative">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donutData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-2xl font-bold tabular-nums">{stats.resolved}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Resolved</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 content-center">
            {AUDIT_STATUS_ORDER.map(s => {
              const cfg = auditStatusConfig[s]
              const count = stats.counts[s]
              const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
              return (
                <motion.div
                  key={s}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * AUDIT_STATUS_ORDER.indexOf(s) }}
                  className={`rounded-md border p-2.5 ${cfg.badgeClass} border`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <StatusIcon status={s} className="h-3.5 w-3.5" />
                    <span className="text-xs font-semibold">{cfg.label}</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums">{count}</div>
                  <div className="text-[10px] opacity-70">{pct}% of total</div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Effort estimate row */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center p-2 rounded-md bg-muted/40">
            <Gauge className="h-4 w-4 mx-auto mb-1 text-orange-500" />
            <div className="text-lg font-bold tabular-nums">{totalHours}h</div>
            <div className="text-[10px] text-muted-foreground">Min effort (lowest proposal)</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/40">
            <Clock className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <div className="text-lg font-bold tabular-nums">{estimatedHours}h</div>
            <div className="text-[10px] text-muted-foreground">Recommended proposal</div>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/40">
            <TrendingUp className="h-4 w-4 mx-auto mb-1 text-emerald-500" />
            <div className="text-lg font-bold tabular-nums">
              {effortBreakdown.low + effortBreakdown.medium + effortBreakdown.high}
            </div>
            <div className="text-[10px] text-muted-foreground">Findings tracked</div>
          </div>
        </div>

        {/* In-progress list */}
        {inProgressFindings.length > 0 && (
          <div className="pt-2 border-t">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin-slow text-blue-500" />
              Currently in progress ({inProgressFindings.length})
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-custom pr-1">
              {inProgressFindings.map(f => (
                <button
                  key={String(f.task)}
                  onClick={() => onJumpToTask?.(f.task)}
                  className="w-full text-left p-2 rounded-md border bg-blue-500/5 border-blue-500/30 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                >
                  <Badge variant="outline" className="font-mono text-[10px]">Task {f.task}</Badge>
                  <span className="text-xs font-medium truncate flex-1">{f.title}</span>
                  <Badge variant="outline" className={`text-[9px] ${auditStatusConfig['in-progress'].badgeClass}`}>
                    {auditStatusConfig['in-progress'].shortLabel}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {stats.resolved === 0 && stats.counts['in-progress'] === 0 && (
          <div className="pt-2 border-t text-center text-xs text-muted-foreground">
            Tip: Use the status dropdown on each finding card to track your remediation work.
            Progress is saved to your browser only.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
