'use client'

import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Clock, Lock, Wrench, FileText, GitBranch, ListChecks,
} from 'lucide-react'
import {
  severityConfig, tierLabels,
} from '@/lib/audit-data'
import {
  type Finding,
} from '@/lib/data'
import { TimelineView } from '@/components/timeline-view'
import { PhaseDependencyFlow } from '@/components/phase-dependency-flow'
import { severityColors } from '@/lib/dashboard-constants'

export interface RoadmapTabProps {
  findings: Finding[]
}

export function RoadmapTabContent({ findings }: RoadmapTabProps) {
  return (
    <div className="space-y-4 tab-content-enter">
      {/* Timeline View (Gantt chart with sidebar + legend) */}
      <TimelineView findings={findings} />

      {/* Phase Dependency Flow — horizontal phase → phase visualization */}
      <PhaseDependencyFlow findings={findings} />

      <Card className="glass-card card-hover-enhanced">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 heading-section">
            <ListChecks className="h-4 w-4" /> Remediation Roadmap — All 24 Tasks
          </CardTitle>
          <CardDescription>
            Sequential view of all tasks with dependencies, severity, and verification status
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="space-y-2">
            {findings.map((f, idx) => (
              <motion.div
                key={f.task}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/30 transition-colors"
              >
                <div
                  className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: severityColors[f.severity] }}
                >
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">Task {f.task}: {f.title}</span>
                    <Badge
                      className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} text-[10px] border ${severityConfig[f.severity].border}`}
                    >
                      {severityConfig[f.severity].label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {tierLabels[f.tier].short}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.summary}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-0.5">
                      <Lock className="h-3 w-3" /> Depends: {f.dependsOn}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Wrench className="h-3 w-3" /> {f.proposals.length} proposals
                    </span>
                    <span className="flex items-center gap-0.5">
                      <FileText className="h-3 w-3" /> {f.affectedFiles.length} files
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* PHASES TIMELINE */}
      <Card className="glass-card card-hover-enhanced">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 heading-section">
            <Clock className="h-4 w-4" /> Phased Timeline
          </CardTitle>
          <CardDescription className="text-muted-foreground dark:text-muted-foreground/90">
            Detailed phase-by-phase breakdown with task lists
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="relative space-y-3">
            <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-border" />
            {[
              { phase: 1, title: 'Now — Parallel, No Deps', tasks: 'Tasks 1, 2, 3, 8, 11, 19', color: '#dc2626', desc: 'Safety freeze, restore _shared.py, harden antagonisms, diagnose L1, delete dead code, fix stage order' },
              { phase: 2, title: 'After Task 2', tasks: 'Tasks 13, 14, 15, 17, 18', color: '#f97316', desc: 'Validation pipeline gated fixes: git commit, circuit breaker, import smoke, FDC key, audit trail' },
              { phase: 3, title: 'Parallel with above', tasks: 'Tasks 4, 20, 5, 12', color: '#eab308', desc: 'Real nutrient reporting + tests, severity recommendations, arginine confirmation' },
              { phase: 4, title: 'Slower, high-value', tasks: 'Tasks 9, 10, 16', color: '#10b981', desc: 'Canonical registry, schema gate + repair, CI schema-gate job' },
              { phase: 5, title: 'After Gate G3', tasks: 'Tasks 6, 7', color: '#6b7280', desc: 'Ca/P ceilings, growth-energy curve (requires veterinary review)' },
            ].map((p, i) => (
              <motion.div
                key={p.phase}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="relative pl-10"
              >
                <div
                  className="absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ring-4 ring-background"
                  style={{ backgroundColor: p.color }}
                >
                  {p.phase}
                </div>
                <div
                  className="rounded-md border p-3 hover:bg-muted/30 transition-colors"
                  style={{ borderLeftColor: p.color, borderLeftWidth: 3 }}
                >
                  <div className="font-semibold text-sm">{p.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono">{p.tasks}</div>
                  <div className="text-xs text-muted-foreground mt-1">{p.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
