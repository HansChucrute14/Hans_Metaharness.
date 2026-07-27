'use client'

/**
 * Lazy-loaded chart components extracted from dashboard-client.tsx to keep
 * the main client bundle small. These are imported via Next.js `dynamic()`
 * with `ssr: false`, so they only execute on the client after hydration —
 * this keeps the heavy `recharts` library out of the server-render path.
 */
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, Legend,
} from 'recharts'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import type { Severity, Tier } from '@/lib/audit-types'
import {
  severityConfig, verificationConfig, tierLabels,
} from '@/lib/audit-data'
import {
  severityColors, verificationColors,
} from '@/lib/dashboard-constants'
import type { Finding } from '@/lib/data'

/* ─── SEVERITY DONUT CHART ─── */
export function SeverityDonut({ findings }: { findings: Finding[] }) {
  const data = useMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    findings.forEach(f => { counts[f.severity]++ })
    return (['critical', 'high', 'medium', 'low'] as Severity[]).map(s => ({
      name: severityConfig[s].label,
      value: counts[s],
      color: severityColors[s],
    }))
  }, [findings])

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
          stroke="none"
        >
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Pie>
        <RechartsTooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ─── VERIFICATION BAR CHART ─── */
export function VerificationBar({ findings }: { findings: Finding[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {
      'confirmed-execution': 0,
      'confirmed-reading': 0,
      'confirmed-logical': 0,
      'needs-execution-confirmation': 0,
      partial: 0,
    }
    findings.forEach(f => { counts[f.verificationStatus]++ })
    return Object.entries(counts).map(([k, v]) => ({
      name: verificationConfig[k as keyof typeof verificationConfig].label,
      count: v,
      color: verificationColors[k],
    }))
  }, [findings])

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={80} />
        <RechartsTooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── PROPOSALS BY EFFORT CHART ─── */
export function EffortDistribution({ findings }: { findings: Finding[] }) {
  const data = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0 }
    findings.forEach(f => f.proposals.forEach(p => { counts[p.effort]++ }))
    return [
      { name: 'Low Effort', value: counts.low, color: '#10b981' },
      { name: 'Medium Effort', value: counts.medium, color: '#eab308' },
      { name: 'High Effort', value: counts.high, color: '#dc2626' },
    ]
  }, [findings])

  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
          stroke="none"
          label={(entry) => `${entry.value}`}
          labelLine={false}
        >
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Pie>
        <RechartsTooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/* ─── CATEGORY BREAKDOWN CHART ─── */
export function CategoryBreakdown({ findings }: { findings: Finding[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const data = useMemo(() => {
    const catMap: Record<string, number> = {}
    findings.forEach(f => {
      catMap[f.category] = (catMap[f.category] ?? 0) + 1
    })
    const sorted = Object.entries(catMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
    // Emerald gradient: brighter in dark mode for contrast
    return sorted.map((entry, idx) => {
      const opacity = isDark
        ? 1.0 - (idx / Math.max(sorted.length - 1, 1)) * 0.5  // brighter in dark
        : 1.0 - (idx / Math.max(sorted.length - 1, 1)) * 0.7
      // Compute emerald shade: use brighter teal/emerald range in dark mode
      const r = isDark
        ? 16 + Math.round(idx * (94 - 16) / Math.max(sorted.length - 1, 1))
        : 16 + Math.round(idx * (209 - 16) / Math.max(sorted.length - 1, 1))
      const g = isDark
        ? 185 + Math.round(idx * (230 - 185) / Math.max(sorted.length - 1, 1))
        : 185 + Math.round(idx * (213 - 185) / Math.max(sorted.length - 1, 1))
      const b = isDark
        ? 129 + Math.round(idx * (200 - 129) / Math.max(sorted.length - 1, 1))
        : 129 + Math.round(idx * (219 - 129) / Math.max(sorted.length - 1, 1))
      const color = `rgba(${r}, ${g}, ${b}, ${opacity.toFixed(2)})`
      return { ...entry, color }
    })
  }, [findings, isDark])
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 22)}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis
          type="category"
          dataKey="category"
          stroke="var(--muted-foreground)"
          fontSize={10}
          width={110}
          tick={{ fill: 'var(--muted-foreground)' }}
        />
        <RechartsTooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── TIER × SEVERITY STACKED BAR ─── */
export function TierSeverityStack({ findings }: { findings: Finding[] }) {
  const matrix = useMemo(() => {
    const m: Record<Tier, Record<Severity, number>> = {
      tier0: { critical: 0, high: 0, medium: 0, low: 0 },
      tier1: { critical: 0, high: 0, medium: 0, low: 0 },
      tier2: { critical: 0, high: 0, medium: 0, low: 0 },
      additional: { critical: 0, high: 0, medium: 0, low: 0 },
      deferred: { critical: 0, high: 0, medium: 0, low: 0 },
    }
    findings.forEach(f => { m[f.tier][f.severity]++ })
    return m
  }, [findings])
  const data = (['tier0', 'tier1', 'tier2', 'additional', 'deferred'] as Tier[]).map(t => ({
    tier: tierLabels[t].short,
    Critical: matrix[t].critical,
    High: matrix[t].high,
    Medium: matrix[t].medium,
    Low: matrix[t].low,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="tier" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
        <RechartsTooltip
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ fontSize: '11px' }} />
        <Bar dataKey="Critical" stackId="a" fill={severityColors.critical} />
        <Bar dataKey="High" stackId="a" fill={severityColors.high} />
        <Bar dataKey="Medium" stackId="a" fill={severityColors.medium} />
        <Bar dataKey="Low" stackId="a" fill={severityColors.low} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ─── AFFECTED FILES HEATMAP ─── */
export function AffectedFilesHeatmap({ findings }: { findings: Finding[] }) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const data = useMemo(() => {
    const fileMap: Record<string, { count: number; severities: Record<Severity, number>; findings: string[] }> = {}
    findings.forEach(f => {
      f.affectedFiles.forEach(file => {
        if (!fileMap[file]) {
          fileMap[file] = { count: 0, severities: { critical: 0, high: 0, medium: 0, low: 0 }, findings: [] }
        }
        fileMap[file].count++
        fileMap[file].severities[f.severity]++
        fileMap[file].findings.push(String(f.task))
      })
    })
    return Object.entries(fileMap)
      .map(([file, stats]) => ({ file, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
  }, [findings])
  const maxCount = data[0]?.count ?? 1
  return (
    <div className="space-y-1">
      {data.map((item, idx) => {
        const intensity = item.count / maxCount
        const isHot = item.severities.critical > 0
        return (
          <motion.div
            key={item.file}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            className="flex items-center gap-2 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono truncate flex-1" title={item.file}>
                  {item.file}
                </span>
                {isHot && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[9px] text-red-600 dark:text-red-400 font-bold">CRIT</span>
                    </TooltipTrigger>
                    <TooltipContent>Affects critical findings</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div className="relative h-5 bg-muted rounded overflow-hidden mt-0.5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(intensity * 100, 8)}%` }}
                  transition={{ delay: idx * 0.03 + 0.1, duration: 0.4 }}
                  className={`h-full rounded min-w-[40px] ${isHot ? (isDark ? 'bg-gradient-to-r from-red-400 to-orange-400' : 'bg-gradient-to-r from-red-500 to-orange-500') : (isDark ? 'bg-gradient-to-r from-teal-400 to-sky-400' : 'bg-gradient-to-r from-sky-500 to-teal-500')}`}
                />
                <div className="absolute inset-0 flex items-center px-2 min-w-[40px]">
                  <span className="text-[10px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {item.count} finding{item.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/* ─── TIER SEVERITY BAR (visualizes severity distribution per tier) ─── */
export function TierSeverityBar({ tier, findings }: { tier: Tier; findings: Finding[] }) {
  const tierFindings = findings.filter(f => f.tier === tier)
  const total = tierFindings.length
  if (total === 0) return null
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  tierFindings.forEach(f => { counts[f.severity]++ })

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex h-2 rounded-full overflow-hidden flex-1 min-w-[160px] max-w-[280px] border">
        {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => {
          const pct = (counts[s] / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={s}
              style={{ width: `${pct}%`, backgroundColor: severityColors[s] }}
              className="h-full transition-all"
              title={`${severityConfig[s].label}: ${counts[s]} (${Math.round(pct)}%)`}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s =>
          counts[s] > 0 && (
            <span key={s} className="flex items-center gap-0.5">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: severityColors[s] }}
              />
              {counts[s]}
            </span>
          )
        )}
      </div>
    </div>
  )
}
