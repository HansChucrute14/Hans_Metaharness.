'use client'

import { motion } from 'framer-motion'
import { useProject } from '@/lib/project-context'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Separator,
} from '@/components/ui/separator'
import {
  Alert, AlertDescription, AlertTitle,
} from '@/components/ui/alert'
import {
  ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2,
  Wrench, FileText, AlertCircle, Clock, Zap,
  Activity, GitBranch, TrendingUp, Gauge,
  FileCode2, BarChart3, Layers,
} from 'lucide-react'
import {
  severityConfig, verificationConfig, tierLabels, effortConfig, riskConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
} from '@/lib/audit-data'
import {
  type Finding, type UnifiedModule,
} from '@/lib/data'
import { AnimatedStatCard } from '@/components/animated-counter'
import { HealthScoreGauge, useHealthScore } from '@/components/health-score-gauge'
import { QuickWinsPanel, useQuickWins } from '@/components/quick-wins-panel'
import { RemediationVelocity, useRemediationVelocity } from '@/components/remediation-velocity'
import { AuditProgressSection } from '@/components/audit-progress'
import { RiskMatrix, RiskScoreSummary } from '@/components/risk-matrix'
import dynamic from 'next/dynamic'

/* Lazy-loaded chart components — keep recharts out of this module's SSR path */
const SeverityDonut = dynamic(
  () => import('./charts').then(m => m.SeverityDonut),
  { ssr: false, loading: () => <div className="h-[180px]" /> },
)
const VerificationBar = dynamic(
  () => import('./charts').then(m => m.VerificationBar),
  { ssr: false, loading: () => <div className="h-[180px]" /> },
)
const EffortDistribution = dynamic(
  () => import('./charts').then(m => m.EffortDistribution),
  { ssr: false, loading: () => <div className="h-[180px]" /> },
)
const CategoryBreakdown = dynamic(
  () => import('./charts').then(m => m.CategoryBreakdown),
  { ssr: false, loading: () => <div className="h-[220px]" /> },
)
const TierSeverityStack = dynamic(
  () => import('./charts').then(m => m.TierSeverityStack),
  { ssr: false, loading: () => <div className="h-[220px]" /> },
)
const AffectedFilesHeatmap = dynamic(
  () => import('./charts').then(m => m.AffectedFilesHeatmap),
  { ssr: false, loading: () => <div className="h-[220px]" /> },
)

export interface OverviewTabProps {
  findings: Finding[]
  modules: UnifiedModule[]
  stats: {
    totalProposals: number
    criticalCount: number
    highCount: number
    execCount: number
    readCount: number
    logicalCount: number
    affectedFilesCount: number
  }
  healthScore: ReturnType<typeof useHealthScore>
  quickWins: ReturnType<typeof useQuickWins>
  remediationVelocity: ReturnType<typeof useRemediationVelocity>
  progressStats: {
    percentComplete: number
    resolved: number
    total: number
    counts: Record<string, number>
  }
  statuses: Record<string, string>
  openDetails: (finding: Finding) => void
  setActiveTab: (tab: string) => void
  setSearch: (s: string) => void
  setStatusFilter: (s: string) => void
  setSeverityFilter: (s: string) => void
  setCategoryFilter: (s: string) => void
  setVerificationFilter: (s: string) => void
  setShowBookmarkedOnly: (b: boolean) => void
  setDeepDive: (d: { severity: 'critical' | 'high' | 'medium' | 'low'; impact: number; count: number } | null) => void
  resetAll: () => void
}

export function OverviewTabContent(props: OverviewTabProps) {
  const { activeProject } = useProject()
  const {
    findings, stats, healthScore, quickWins, remediationVelocity,
    progressStats, statuses, openDetails, setActiveTab, setSearch,
    setStatusFilter, setSeverityFilter, setCategoryFilter,
    setVerificationFilter, setShowBookmarkedOnly, setDeepDive, resetAll,
  } = props

  return (
    <div className="space-y-6 tab-content-enter">
      {/* SUMMARY STATS GRID — Animated glass-morphism cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AnimatedStatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={findings.length}
          label={`${findings.length}/${findings.length} Verified`}
          color="#10b981"
          accentColor="#10b981"
          delay={0}
        />
        <AnimatedStatCard
          icon={<ShieldAlert className="h-5 w-5" />}
          value={stats.criticalCount}
          label="Critical Issues"
          color="#dc2626"
          accentColor="#dc2626"
          delay={0.05}
        />
        <AnimatedStatCard
          icon={<Wrench className="h-5 w-5" />}
          value={stats.totalProposals}
          label="Solution Proposals"
          color="#f97316"
          accentColor="#f97316"
          delay={0.1}
        />
        <AnimatedStatCard
          icon={<FileText className="h-5 w-5" />}
          value={stats.affectedFilesCount}
          label="Affected Files"
          color="#0ea5e9"
          accentColor="#0ea5e9"
          delay={0.15}
        />
      </div>

      {/* Section divider */}
      <div className="section-divider" />

      {/* HEALTH SCORE + REMEDIATION VELOCITY — side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HealthScoreGauge result={healthScore} />
        <RemediationVelocity result={remediationVelocity} />
      </div>

      {/* Section divider */}
      <div className="section-divider" />

      {/* QUICK WINS — recommended first actions */}
      <QuickWinsPanel
        quickWins={quickWins}
        onNavigateToFinding={(task) => {
          const finding = findings.find(f => f.task === task)
          if (finding) openDetails(finding)
        }}
      />

      {/* Section divider */}
      <div className="section-divider" />

      {/* AUDIT PROGRESS SECTION */}
      <AuditProgressSection
        stats={progressStats}
        statuses={statuses}
        onReset={resetAll}
        onJumpToTask={(task) => {
          setActiveTab('findings')
          setSearch(`Task ${task}`)
          setStatusFilter('all')
          setSeverityFilter('all')
          setVerificationFilter('all')
          setCategoryFilter('all')
          setShowBookmarkedOnly(false)
        }}
      />

      {/* CHARTS — Glass-morphism cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600" /> Severity Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              {stats.criticalCount} critical &bull; {stats.highCount} high
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <SeverityDonut findings={findings} />
          </CardContent>
        </Card>

        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Verification Methods
            </CardTitle>
            <CardDescription className="text-xs">
              {stats.execCount} by execution &bull; {stats.readCount} by reading &bull; {stats.logicalCount} by logic
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <VerificationBar findings={findings} />
          </CardContent>
        </Card>

        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-orange-600" /> Proposal Effort Mix
            </CardTitle>
            <CardDescription className="text-xs">
              Across {stats.totalProposals} proposals
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <EffortDistribution findings={findings} />
          </CardContent>
        </Card>
      </div>

      {/* SECOND ROW: Tier × Severity + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-600" /> Tier × Severity Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Stacked severity counts per remediation tier
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <TierSeverityStack findings={findings} />
          </CardContent>
        </Card>

        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-teal-600" /> Findings by Category
            </CardTitle>
            <CardDescription className="text-xs">
              {new Set(findings.map(f => f.category)).size} distinct categories
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <CategoryBreakdown findings={findings} />
          </CardContent>
        </Card>
      </div>

      {/* THIRD ROW: Affected Files Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-orange-600" /> Most Affected Files (Top 15)
          </CardTitle>
          <CardDescription className="text-xs">
            Files appearing across multiple findings &mdash; red gradient = critical findings present
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-96 overflow-y-auto scrollbar-custom pr-1">
            <AffectedFilesHeatmap findings={findings} />
          </div>
        </CardContent>
      </Card>

      {/* FOURTH ROW: Risk Matrix + Risk Score Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <Card className="border-2 border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gauge className="h-4 w-4 text-red-600" /> Risk Matrix (Severity × Impact)
            </CardTitle>
            <CardDescription className="text-xs">
              2D view: each cell shows finding count at that severity × impact level &mdash; top-right = highest risk
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <RiskMatrix onCellClick={(severity, impact, cellFindings) => {
              setActiveTab('findings')
              setSeverityFilter(severity)
              setCategoryFilter('all')
              setSearch('')
              setVerificationFilter('all')
              setStatusFilter('all')
              setShowBookmarkedOnly(false)
              setDeepDive({ severity, impact, count: cellFindings.length })
            }} />
          </CardContent>
        </Card>

        <Card className="glass-card card-hover-enhanced">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" /> Risk Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Findings grouped by composite risk score
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <RiskScoreSummary />
            <Separator className="my-3" />
            <div className="space-y-1.5">
              {findings
                .slice()
                .sort((a, b) => getRiskScore(b.severity, b.tier) - getRiskScore(a.severity, a.tier))
                .slice(0, 5)
                .map(f => {
                  const score = getRiskScore(f.severity, f.tier)
                  const level = getRiskLevel(score)
                  return (
                    <button
                      key={String(f.task)}
                      onClick={() => openDetails(f)}
                      className="w-full text-left p-1.5 rounded border hover:bg-muted/40 transition-colors flex items-center gap-1.5"
                    >
                      <Badge
                        variant="outline"
                        className="text-[9px] font-mono px-1 py-0"
                        style={{ borderColor: riskLevelConfig[level].color, color: riskLevelConfig[level].color }}
                      >
                        {score}
                      </Badge>
                      <span className="text-[11px] font-medium truncate flex-1">Task {f.task}: {f.title}</span>
                    </button>
                  )
                })}
              <div className="text-[10px] text-muted-foreground text-center pt-1">
                Top 5 highest-risk findings &mdash; click to view details
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KEY CORRECTIONS */}
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-1">
          <AlertCircle className="h-4 w-4" /> Key Corrections to Original Roadmap
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-200 space-y-2 mt-2">
          <div className="text-xs">
            <strong>1. Task 10 (Schema Errors):</strong> Roadmap claimed <code className="bg-amber-500/20 px-1 rounded">21 errors</code> on DB_ingredientes.json. Independent execution found <strong className="text-red-700 dark:text-red-300">61 errors</strong> (60 missing-field violations + 1 over-length note) — significantly worse than documented.
          </div>
          <div className="text-xs">
            <strong>2. Deferred E11 (Doc-gen %):</strong> Roadmap claimed <code className="bg-amber-500/20 px-1 rounded">42% of package is doc-generation machinery</code>. Actual measurement: <strong>~20.3%</strong> (2,496 / 12,268 lines). The claim was inflated.
          </div>
          <div className="text-xs">
            <strong>3. New Finding X1 (Pydantic Dependency):</strong> Discovered during verification — <code className="bg-amber-500/20 px-1 rounded">pydantic</code> is imported by <code className="bg-amber-500/20 px-1 rounded">schemas.py</code> but not declared in <code className="bg-amber-500/20 px-1 rounded">pyproject.toml</code>. Not in original roadmap.
          </div>
        </AlertDescription>
      </Alert>

      {/* SEQUENCING SUMMARY */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" /> Recommended Sequencing
          </CardTitle>
          <CardDescription>Priority order for remediation tasks</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border rounded-md p-3 bg-red-500/5 border-red-500/30">
              <div className="font-semibold text-red-800 dark:text-red-300 mb-1 text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Phase 1 — Now (parallel, no deps)
              </div>
              <div className="text-xs text-red-700 dark:text-red-300">
                Task 1 (safety freeze) &bull; Task 2 (_shared.py + pydantic) &bull; Task 3 (harden antagonisms) &bull; Task 8 (diagnose L1) &bull; Task 11 (delete objective_weights) &bull; Task 19 (stage order)
              </div>
            </div>
            <div className="border rounded-md p-3 bg-orange-500/5 border-orange-500/30">
              <div className="font-semibold text-orange-800 dark:text-orange-300 mb-1 text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Phase 2 — After Task 2
              </div>
              <div className="text-xs text-orange-700 dark:text-orange-300">
                Tasks 13, 14, 15, 17, 18 (everything gated on validation package importable)
              </div>
            </div>
            <div className="border rounded-md p-3 bg-yellow-500/5 border-yellow-500/30">
              <div className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1 text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Phase 3 — Parallel with above
              </div>
              <div className="text-xs text-yellow-700 dark:text-yellow-300">
                Task 4 (real reporting) + Task 20 (test) → Task 5 (needs Task 3 slack) → Task 12 (confirm arginine)
              </div>
            </div>
            <div className="border rounded-md p-3 bg-emerald-500/5 border-emerald-500/30">
              <div className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1 text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Phase 4 — Slower, high-value
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300">
                Task 9 (canonical registry) &bull; Task 10 (schema gate + repair) &bull; Task 16 (CI schema-gate job)
              </div>
            </div>
            <div className="border rounded-md p-3 bg-gray-500/5 border-gray-500/30 sm:col-span-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1 text-sm flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Phase 5 — After Gate G3 (veterinary review)
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300">
                Task 6 (Ca/P ceilings) &bull; Task 7 (growth-energy curve) &bull; Task 5 placeholder thresholds → validated values
              </div>
            </div>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3">
            <div className="font-semibold text-red-800 dark:text-red-300 text-sm flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Critical Next Action
            </div>
            <div className="text-xs text-red-700 dark:text-red-300 mt-1">
              <strong>Task 2</strong> must land first — until it ships, no other task&apos;s pytest-based proof can run (CI collection itself is broken).
              <strong> Task 1</strong> should land in the same window as a pure backstop.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* METHODOLOGY */}
      <Card className="bg-muted/30 border-l-4 border-l-emerald-500">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Verification Methodology
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 text-sm text-muted-foreground space-y-2">
          <p>
            This audit follows the <strong>standing-theory protocol</strong>: every claim from the Executive Remediation Roadmap was independently verified against the live repository code, data files, and test execution — not by re-reading the document&apos;s own evidence.
          </p>
          <p>Verification categories per Part 4 §1.1:</p>
          <ul className="list-disc pl-5 space-y-1 text-xs">
            <li>
              <strong>Category (a) — Confirmed by execution:</strong> Command run, output captured, matches claim exactly. <strong>{stats.execCount} findings.</strong>
            </li>
            <li>
              <strong>Category (b) — Confirmed by reading:</strong> Static code analysis confirms structural claim. <strong>{stats.readCount} findings.</strong> Execution confirmation recommended but not yet performed.
            </li>
            <li>
              <strong>Category (c) — Confirmed by logical derivation:</strong> Inference from confirmed (a) claims. <strong>{stats.logicalCount} finding.</strong>
            </li>
          </ul>
          <p className="text-xs pt-2 border-t">
            <strong>Repo source:</strong> github.com/{activeProject?.repoOwner ?? ''}/{activeProject?.repoName ?? ''} (cloned and inspected locally).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
