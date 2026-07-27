'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Zap, Target, Clock, ArrowUpRight, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Severity, Tier } from '@/lib/audit-types'
import {
  severityConfig, tierLabels, effortConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
  severityWeight, tierImpact,
} from '@/lib/audit-data'
import type { Finding } from '@/lib/data'

/* ─── QUICK WIN COMPUTATION ─── */

interface QuickWin {
  task: number
  title: string
  severity: Severity
  tier: Tier
  riskScore: number
  riskLevel: string
  bestProposal: string
  effort: string
  quickWinScore: number
  reasoning: string
}

export function useQuickWins(
  findings: Finding[],
  statuses: Record<string, string>,
): QuickWin[] {
  return useMemo(() => {
    // Filter out already-fixed findings
    const actionable = findings.filter(f => {
      const status = statuses[String(f.task)] ?? 'not-started'
      return status !== 'fixed' && status !== 'wont-fix'
    })

    const effortRank: Record<string, number> = { low: 1, medium: 2, high: 3 }
    const reversibilityBonus: Record<string, number> = { true: 1, false: 0, yes: 1, no: 0 }

    const scored = actionable.map(f => {
      const bestProposal = f.proposals[0] // first proposal is typically simplest
      const tierImpactVal = tierImpact[f.tier]
      const sevWeightVal = severityWeight[f.severity]
      const effortVal = effortRank[bestProposal.effort] ?? 2
      const reverseVal = reversibilityBonus[String(bestProposal.reversible)] ?? 0

      // Quick Win Score: higher tier impact + higher severity = higher priority
      // BUT lower effort + reversible = more actionable
      // Formula: (tierImpact * 2 + severityWeight) * (3 / effortRank) + reversibilityBonus
      const quickWinScore = (tierImpactVal * 2 + sevWeightVal) * (3 / effortVal) + reverseVal

      return {
        task: f.task,
        title: f.title,
        severity: f.severity,
        tier: f.tier,
        riskScore: getRiskScore(f.severity, f.tier),
        riskLevel: getRiskLevel(getRiskScore(f.severity, f.tier)),
        bestProposal: bestProposal.title,
        effort: bestProposal.effort,
        quickWinScore,
        reasoning: `${severityConfig[f.severity].label} severity, ${tierLabels[f.tier].short} tier — ${effortConfig[bestProposal.effort].label} effort, reversible: ${bestProposal.reversible}`,
      }
    })

    // Sort by quickWinScore descending, take top 5
    return scored.sort((a, b) => b.quickWinScore - a.quickWinScore).slice(0, 5)
  }, [findings, statuses])
}

/* ─── MAIN COMPONENT ─── */

interface QuickWinsPanelProps {
  quickWins: QuickWin[]
  onNavigateToFinding: (task: number) => void
}

export function QuickWinsPanel({ quickWins, onNavigateToFinding }: QuickWinsPanelProps) {
  if (quickWins.length === 0) {
    return (
      <Card className="glass-card card-hover-enhanced">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Quick Wins — Recommended First Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            All findings are resolved — no quick wins remaining. Great work!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="glass-card card-hover-enhanced overflow-hidden">
      {/* Amber gradient accent strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-500" />

      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Quick Wins — Recommended First Actions
        </CardTitle>
        <CardDescription className="text-xs">
          Top 5 findings with highest impact-to-effort ratio — start here for maximum progress
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 space-y-2">
        {quickWins.map((win, i) => (
          <motion.div
            key={win.task}
            className="group p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-all cursor-pointer"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            onClick={() => onNavigateToFinding(win.task)}
          >
            <div className="flex items-start gap-3">
              {/* Rank number */}
              <div className="flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-full bg-amber-500/20 border border-amber-500/30">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">{i + 1}</span>
              </div>

              {/* Finding info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge variant="outline" className="font-mono text-[10px] px-1 py-0 font-semibold">
                    Task {win.task}
                  </Badge>
                  <Badge className={`${severityConfig[win.severity].bg} ${severityConfig[win.severity].text} text-[10px] border ${severityConfig[win.severity].border}`}>
                    {severityConfig[win.severity].label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1 py-0" style={{ borderColor: riskLevelConfig[win.riskLevel].color, color: riskLevelConfig[win.riskLevel].color }}>
                    {riskLevelConfig[win.riskLevel].label}
                  </Badge>
                </div>
                <p className="text-sm font-medium leading-snug line-clamp-1">{win.title}</p>

                {/* Solution & reasoning */}
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                    <Target className="h-3 w-3" />
                    {win.bestProposal}
                  </div>
                  <Badge className={`${effortConfig[win.effort].color} text-[10px] border`}>
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    {effortConfig[win.effort].label}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{win.reasoning}</p>
              </div>

              {/* Navigate button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onNavigateToFinding(win.task) }}
                aria-label={`View Task ${win.task} details`}
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  )
}
