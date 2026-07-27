'use client'

import { motion } from 'framer-motion'
import type { Severity, Finding } from '@/lib/audit-types'
import { FINDINGS, getRiskMatrix, getRiskScore, getRiskLevel, riskLevelConfig, severityAxisLabels, impactLabels } from '@/lib/audit-data'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { ShieldAlert } from 'lucide-react'

const severityColors: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

/* 4×4 risk matrix: rows = severity (low→critical, bottom→top), cols = impact (low→critical, left→right) */
export function RiskMatrix({ onCellClick }: { onCellClick?: (severity: Severity, impact: number, findings: Finding[]) => void }) {
  const grid = getRiskMatrix()

  // Render top-to-bottom: critical → low (so highest severity at top)
  const severityRows: { sev: Severity; weight: number }[] = [
    { sev: 'critical', weight: 3 },
    { sev: 'high', weight: 2 },
    { sev: 'medium', weight: 1 },
    { sev: 'low', weight: 0 },
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3">
        {/* Deep dive hint */}
        {onCellClick && (
          <div className="text-[10px] text-muted-foreground text-center mb-1 flex items-center justify-center gap-1">
            <span className="opacity-70">💡 Click any cell with findings to deep-dive in the Findings tab</span>
          </div>
        )}
        <div className="flex items-start gap-3">
          {/* Y-axis label */}
          <div className="flex flex-col items-center justify-center pt-2">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Severity →
            </span>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1">
              {/* Empty top-left corner */}
              <div />

              {/* X-axis labels at the top */}
              {impactLabels.map((label, i) => (
                <div key={label} className="text-center text-[10px] font-semibold text-muted-foreground pb-1">
                  {label}
                </div>
              ))}

              {/* 4 rows: top-to-bottom = critical→low */}
              {severityRows.map(({ sev, weight }) => (
                <RowRenderer
                  key={sev}
                  sev={sev}
                  weight={weight}
                  grid={grid}
                  onCellClick={onCellClick}
                />
              ))}
            </div>

            {/* X-axis bottom label */}
            <div className="text-center text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">
              Impact (derived from tier) →
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] justify-center pt-2 border-t">
          {(['critical', 'high', 'medium', 'low'] as const).map(level => (
            <div key={level} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: riskLevelConfig[level].color, opacity: 0.7 }}
              />
              <span className="text-muted-foreground">{riskLevelConfig[level].label}</span>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

function RowRenderer({
  sev,
  weight,
  grid,
  onCellClick,
}: {
  sev: Severity
  weight: number
  grid: ReturnType<typeof getRiskMatrix>
  onCellClick?: (severity: Severity, impact: number, findings: Finding[]) => void
}) {
  return (
    <>
      {/* Y-axis label for this row */}
      <div className="flex items-center justify-end pr-2 text-[10px] font-semibold text-muted-foreground">
        <span style={{ color: severityColors[sev] }}>{severityAxisLabels[weight]}</span>
      </div>

      {/* 4 cells per row (impact = 0..3) */}
      {[0, 1, 2, 3].map(imp => {
        const cell = grid[`${weight}-${imp}`]
        const findings = cell.findings
        const count = findings.length
        const score = weight + imp
        const level = getRiskLevel(score)
        const cfg = riskLevelConfig[level]
        const sevColor = severityColors[sev]
        const clickable = onCellClick && count > 0

        return (
          <Tooltip key={`${weight}-${imp}`}>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (weight * 4 + imp) * 0.02 }}
                whileHover={clickable ? { scale: 1.03 } : undefined}
                onClick={() => {
                  if (onCellClick && count > 0) {
                    onCellClick(sev, imp, findings)
                  }
                }}
                className={`relative aspect-square min-h-[60px] rounded-md border ${clickable ? 'risk-cell-clickable' : ''} ${cfg.bgClass} border-${level === 'critical' ? 'red' : level === 'high' ? 'orange' : level === 'medium' ? 'yellow' : 'emerald'}-500/40 flex items-center justify-center ${clickable ? 'cursor-pointer' : 'cursor-default'} overflow-hidden`}
                style={{
                  backgroundColor: count > 0 ? `${cfg.color}25` : undefined,
                  borderColor: count > 0 ? `${cfg.color}55` : undefined,
                  boxShadow: count > 0 ? 'inset 0 0 8px rgba(0,0,0,0.08)' : undefined,
                }}
              >
                {/* Severity color dot in corner */}
                {count > 0 && (
                  <div
                    className="absolute top-1 left-1 w-2 h-2 rounded-full"
                    style={{ backgroundColor: sevColor }}
                  />
                )}
                {/* Count in the middle */}
                <div className="text-center">
                  <div
                    className="text-xl font-extrabold leading-none"
                    style={{ color: count > 0 ? cfg.color : 'var(--muted-foreground)' }}
                  >
                    {count}
                  </div>
                  {count > 0 && (
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      {count === 1 ? 'finding' : 'findings'}
                    </div>
                  )}
                </div>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <div className="font-semibold text-xs flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3" />
                  {severityAxisLabels[weight]} Severity × {impactLabels[imp]}
                </div>
                <div className="text-[10px] opacity-90">
                  Risk score: <strong>{score}/6</strong> — {cfg.label}
                </div>
                {count > 0 ? (
                  <>
                    <div className="text-[10px] opacity-90 mt-1">
                      {count} {count === 1 ? 'finding' : 'findings'}:
                    </div>
                    <ul className="text-[10px] space-y-0.5 mt-0.5">
                      {findings.slice(0, 5).map(f => (
                        <li key={String(f.task)} className="truncate max-w-[200px]">
                          • Task {f.task}: {f.title}
                        </li>
                      ))}
                      {findings.length > 5 && (
                        <li className="italic opacity-70">+ {findings.length - 5} more…</li>
                      )}
                    </ul>
                    {onCellClick && (
                      <div className="text-[10px] opacity-70 mt-1">Click to inspect in Findings tab</div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] opacity-70">No findings in this cell</div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </>
  )
}

/* Compact summary card showing risk distribution */
export function RiskScoreSummary() {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  FINDINGS.forEach(f => {
    const score = getRiskScore(f.severity, f.tier)
    counts[getRiskLevel(score)]++
  })
  const total = FINDINGS.length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {(['critical', 'high', 'medium', 'low'] as const).map(level => {
        const cfg = riskLevelConfig[level]
        const count = counts[level]
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div
            key={level}
            className={`rounded-md border p-2 ${cfg.bgClass} border-${level === 'critical' ? 'red' : level === 'high' ? 'orange' : level === 'medium' ? 'yellow' : 'emerald'}-500/30`}
          >
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{cfg.label}</div>
            <div className="text-xl font-bold" style={{ color: cfg.color }}>{count}</div>
            <div className="text-[10px] text-muted-foreground">{pct}% of findings</div>
          </div>
        )
      })}
    </div>
  )
}
