'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Gauge, ShieldCheck, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Severity, Tier, AuditStatus } from '@/lib/audit-types'
import {
  severityConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
  severityWeight, tierImpact,
} from '@/lib/audit-data'
import type { Finding } from '@/lib/data'

/* ─── HEALTH SCORE COMPUTATION ─── */

export interface HealthScoreResult {
  /** Overall health score 0–100 (higher = healthier) */
  score: number
  /** Letter grade: A+ through F */
  grade: string
  /** Grade color for display */
  gradeColor: string
  /** Short description of the grade */
  gradeDescription: string
  /** Breakdown: sub-scores contributing to the overall */
  breakdown: {
    severityPenalty: number       // How much severity hurts the score (0–100 scale inverted)
    remediationProgress: number   // How much remediation has been done (0–100)
    verificationStrength: number  // How strong the verification methods are (0–100)
    dependencyRisk: number        // How much dependency risk exists (0–100 scale inverted)
  }
  /** Comparison to "ideal" state (all fixed, all verified) */
  idealGap: number
  /** Trend direction — always "baseline" on first render since we have no history */
  trend: 'baseline' | 'improving' | 'declining'
  /** Quick summary sentence */
  summary: string
  /** Top 3 risk factors dragging the score down */
  riskFactors: string[]
}

export function useHealthScore(
  findings: Finding[],
  statuses: Record<string, string>,
): HealthScoreResult {
  return useMemo(() => {
    const total = findings.length
    if (total === 0) {
      return {
        score: 100, grade: 'A+', gradeColor: 'text-emerald-600 dark:text-emerald-300',
        gradeDescription: 'No findings — perfect health', breakdown: { severityPenalty: 100, remediationProgress: 100, verificationStrength: 100, dependencyRisk: 100 },
        idealGap: 0, trend: 'baseline', summary: 'No audit findings recorded.', riskFactors: [],
      }
    }

    // 1. Severity penalty (critical findings drag score down)
    // Weighted average severity score: each finding contributes severityWeight[f.severity] * tierImpact[f.tier]
    // Max possible weighted severity sum = all findings are critical tier0 = 3*3=9 per finding → 9*total
    const maxSeverityImpact = 9 * total
    const actualSeverityImpact = findings.reduce((sum, f) => {
      return sum + severityWeight[f.severity] * tierImpact[f.tier]
    }, 0)
    // Invert: lower severity impact = higher score
    const severityPenalty = Math.round((1 - actualSeverityImpact / maxSeverityImpact) * 100)

    // 2. Remediation progress
    const fixedCount = Object.values(statuses).filter(s => s === 'fixed').length
    const wontFixCount = Object.values(statuses).filter(s => s === 'wont-fix').length
    const resolvedCount = fixedCount + wontFixCount
    const remediationProgress = Math.round((resolvedCount / total) * 100)

    // 3. Verification strength
    // Execution-confirmed = best (100%), reading = 80%, logical = 70%, partial = 40%, pending = 20%
    const verificationWeights: Record<string, number> = {
      'confirmed-execution': 1.0,
      'confirmed-reading': 0.8,
      'confirmed-logical': 0.7,
      'needs-execution-confirmation': 0.4,
      'partial': 0.3,
    }
    const verificationStrength = Math.round(
      (findings.reduce((sum, f) => sum + (verificationWeights[f.verificationStatus] ?? 0.2), 0) / total) * 100
    )

    // 4. Dependency risk (findings with many dependencies = higher risk)
    // Parse dependsOn strings, count references
    const depReferenceCounts: Record<number, number> = {}
    findings.forEach(f => {
      const matches = f.dependsOn.match(/Task\s+(\d+)/gi)
      if (matches) {
        matches.forEach(m => {
          const taskNum = parseInt(m.replace(/Task\s+/i, ''), 10)
          depReferenceCounts[taskNum] = (depReferenceCounts[taskNum] || 0) + 1
        })
      }
    })
    // Max dependency risk = all findings depend on 1 task → that task blocks everything
    const maxBlocked = Math.max(...Object.values(depReferenceCounts), 0)
    // Score: fewer blocked dependencies = better
    const dependencyRisk = Math.round(Math.max(0, 100 - (maxBlocked / total) * 50))

    // Overall score = weighted average of sub-scores
    // Severity is most important (40%), remediation (25%), verification (20%), dependency (15%)
    const score = Math.round(
      severityPenalty * 0.40 +
      remediationProgress * 0.25 +
      verificationStrength * 0.20 +
      dependencyRisk * 0.15
    )

    // Grade mapping
    const gradeMap: [number, string, string, string][] = [
      [90, 'A+', 'text-emerald-600 dark:text-emerald-300', 'Excellent — nearly all risks mitigated'],
      [80, 'A', 'text-emerald-500 dark:text-emerald-400', 'Very Good — most risks addressed'],
      [70, 'B+', 'text-teal-600 dark:text-teal-300', 'Good — solid progress on remediation'],
      [60, 'B', 'text-teal-500 dark:text-teal-400', 'Above Average — notable progress'],
      [50, 'C+', 'text-amber-600 dark:text-amber-300', 'Fair — half of risks mitigated'],
      [40, 'C', 'text-amber-500 dark:text-amber-400', 'Below Average — significant work needed'],
      [30, 'D', 'text-orange-600 dark:text-orange-300', 'Poor — most risks unaddressed'],
      [20, 'D-', 'text-red-600 dark:text-red-300', 'Very Poor — critical risks dominant'],
      [0, 'F', 'text-red-700 dark:text-red-200', 'Critical — immediate action required'],
    ]
    const [_, grade, gradeColor, gradeDescription] = gradeMap.find(([threshold]) => score >= threshold) ?? gradeMap[gradeMap.length - 1]

    const idealGap = 100 - score

    // Risk factors — top 3
    const riskFactors: string[] = []
    if (severityPenalty < 50) riskFactors.push(`${findings.filter(f => f.severity === 'critical').length} critical-severity findings unresolved`)
    if (remediationProgress < 30) riskFactors.push(`Only ${resolvedCount}/${total} findings resolved (${remediationProgress}%)`)
    if (verificationStrength < 60) riskFactors.push(`Weak verification: ${findings.filter(f => f.verificationStatus !== 'confirmed-execution').length} findings not execution-verified`)
    if (dependencyRisk < 70) {
      const bottleneckTask = Object.entries(depReferenceCounts).sort((a, b) => b[1] - a[1])[0]
      if (bottleneckTask) riskFactors.push(`Bottleneck: Task ${bottleneckTask[0]} blocks ${bottleneckTask[1]} other findings`)
    }
    if (riskFactors.length < 3) {
      if (idealGap > 30) riskFactors.push(`${idealGap} points gap from ideal health (100)`)
    }

    // Summary sentence
    const summary = score >= 80
      ? `Project health is ${grade} (${score}/100). Most risks are mitigated — focus on remaining ${total - resolvedCount} findings.`
      : score >= 50
      ? `Project health is ${grade} (${score}/100). Moderate risk — ${findings.filter(f => f.severity === 'critical').length} critical findings need immediate attention.`
      : `Project health is ${grade} (${score}/100). High risk — critical findings dominate and remediation is minimal.`

    return {
      score,
      grade,
      gradeColor,
      gradeDescription,
      breakdown: { severityPenalty, remediationProgress, verificationStrength, dependencyRisk },
      idealGap,
      trend: 'baseline' as const,
      summary,
      riskFactors: riskFactors.slice(0, 3),
    }
  }, [findings, statuses])
}

/* ─── SVG GAUGE COMPONENT ─── */

function ScoreGauge({ score, grade, gradeColor }: { score: number; grade: string; gradeColor: string }) {
  // SVG arc gauge — 180° arc from left to right
  const radius = 80
  const cx = 100
  const cy = 95
  const startAngle = -180 // left side (180°)
  const endAngle = 0      // right side (0°)
  const sweepAngle = 180

  // Score position on arc
  const scoreAngle = startAngle + (score / 100) * sweepAngle
  const scoreRad = (scoreAngle * Math.PI) / 180
  const scoreX = cx + radius * Math.cos(scoreRad)
  const scoreY = cy + radius * Math.sin(scoreRad)

  // Arc path helper
  const arcPath = (start: number, end: number, r: number) => {
    const startRad = (start * Math.PI) / 180
    const endRad = (end * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
  }

  // Color gradient based on score
  const scoreColor = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
  const scoreColorEnd = score >= 80 ? '#34d399' : score >= 50 ? '#fbbf24' : '#f87171'

  return (
    <svg viewBox="0 0 200 120" className="w-full max-w-[200px]">
      {/* Background arc */}
      <path
        d={arcPath(startAngle, endAngle, radius)}
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
        className="text-muted/30"
      />
      {/* Score arc (animated) */}
      <motion.path
        d={arcPath(startAngle, scoreAngle, radius)}
        fill="none"
        stroke={scoreColor}
        strokeWidth="12"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }}
      />
      {/* Score indicator dot */}
      <motion.circle
        cx={scoreX}
        cy={scoreY}
        r="6"
        fill={scoreColorEnd}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 1 }}
      />
      {/* Center text */}
      <motion.text
        x={cx}
        y={cy - 15}
        textAnchor="middle"
        className={`font-bold ${gradeColor}`}
        fontSize="32"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {grade}
      </motion.text>
      <motion.text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        className="fill-muted-foreground"
        fontSize="14"
        fontWeight="600"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
      >
        {score}/100
      </motion.text>
      {/* Scale labels */}
      <text x={cx - radius - 5} y={cy + 18} textAnchor="middle" className="fill-muted-foreground" fontSize="9">0</text>
      <text x={cx + radius + 5} y={cy + 18} textAnchor="middle" className="fill-muted-foreground" fontSize="9">100</text>
    </svg>
  )
}

/* ─── BREAKDOWN BAR ─── */

function BreakdownBar({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          {icon}
          {label}
        </span>
        <span className="font-semibold tabular-nums">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

/* ─── MAIN COMPONENT ─── */

export function HealthScoreGauge({ result }: { result: HealthScoreResult }) {
  const { score, grade, gradeColor, gradeDescription, breakdown, idealGap, summary, riskFactors } = result

  return (
    <Card className="glass-card card-hover-enhanced overflow-hidden">
      {/* Gradient accent strip at top */}
      <div className="h-1.5 w-full" style={{
        background: score >= 80
          ? 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)'
          : score >= 50
          ? 'linear-gradient(90deg, #f59e0b, #fbbf24, #fde68a)'
          : 'linear-gradient(90deg, #ef4444, #f87171, #fca5a5)',
      }} />

      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4" style={{ color: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444' }} />
          Project Health Score
        </CardTitle>
        <CardDescription className="text-xs">
          Composite score based on severity, remediation, verification & dependencies
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center gap-6">
          {/* Gauge */}
          <div className="flex-shrink-0">
            <ScoreGauge score={score} grade={grade} gradeColor={gradeColor} />
          </div>

          {/* Breakdown */}
          <div className="flex-1 min-w-0 space-y-3">
            <BreakdownBar
              label="Severity Risk"
              value={breakdown.severityPenalty}
              color={breakdown.severityPenalty >= 70 ? '#10b981' : breakdown.severityPenalty >= 40 ? '#f59e0b' : '#ef4444'}
              icon={<ShieldCheck className="h-3 w-3" />}
            />
            <BreakdownBar
              label="Remediation"
              value={breakdown.remediationProgress}
              color={breakdown.remediationProgress >= 70 ? '#10b981' : breakdown.remediationProgress >= 40 ? '#f59e0b' : '#ef4444'}
              icon={<TrendingUp className="h-3 w-3" />}
            />
            <BreakdownBar
              label="Verification"
              value={breakdown.verificationStrength}
              color={breakdown.verificationStrength >= 70 ? '#0ea5e9' : breakdown.verificationStrength >= 40 ? '#f59e0b' : '#ef4444'}
              icon={<AlertTriangle className="h-3 w-3" />}
            />
            <BreakdownBar
              label="Dependency Safety"
              value={breakdown.dependencyRisk}
              color={breakdown.dependencyRisk >= 70 ? '#14b8a6' : breakdown.dependencyRisk >= 40 ? '#f59e0b' : '#ef4444'}
              icon={<Gauge className="h-3 w-3" />}
            />
          </div>
        </div>

        {/* Summary + Risk Factors */}
        <div className="mt-4 space-y-2">
          <div className="p-3 rounded-md bg-muted/30 border">
            <p className="text-xs font-medium leading-relaxed">{summary}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className={`text-[10px] font-semibold ${gradeColor}`}>
                {grade} — {gradeDescription}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />
                Gap: {idealGap} pts from ideal
              </Badge>
            </div>
          </div>

          {riskFactors.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                Top Risk Factors
              </div>
              {riskFactors.map((factor, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {factor}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
