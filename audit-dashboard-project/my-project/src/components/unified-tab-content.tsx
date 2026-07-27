'use client'

import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import {
  ShieldAlert, Zap, CheckCircle2, AlertCircle, AlertTriangle,
  Lock, Clock, Code, ListChecks, Layers,
} from 'lucide-react'
import type { UnifiedModuleId } from '@/lib/audit-types'
import {
  severityConfig, tierLabels, effortConfig, riskConfig,
  ELEGANT_INSIGHT, DEFERRED_INDEPENDENT,
} from '@/lib/audit-data'
import {
  type Finding, type UnifiedModule, type BestProposalAnalysis, type G3BlockedItem,
} from '@/lib/data'
import { severityColors, moduleColorMap } from '@/lib/dashboard-constants'

export interface UnifiedTabProps {
  findings: Finding[]
  modules: UnifiedModule[]
  analysisMap: Record<string, BestProposalAnalysis | undefined>
  moduleMap: Record<string, UnifiedModule | undefined>
  g3Blocked: G3BlockedItem[]
}

export function UnifiedTabContent(props: UnifiedTabProps) {
  const { findings, modules, analysisMap, moduleMap, g3Blocked } = props

  return (
    <div className="space-y-6 tab-content-enter">

      {/* a) ELEGANT INSIGHT BANNER */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-2 border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40">
                <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-amber-800 dark:text-amber-200">The Elegant Insight</CardTitle>
                <CardDescription className="text-amber-700/80 dark:text-amber-300/80">
                  Key strategic finding — single highest-ROI change
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed font-medium">
                {ELEGANT_INSIGHT}
              </p>
            </div>
            <div className="flex items-center gap-3 mt-3 text-xs text-amber-700/70 dark:text-amber-300/70">
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" /> 5 of 7 critical findings
              </span>
              <span className="flex items-center gap-1">
                <Code className="h-3.5 w-3.5" /> ~150 lines of code
              </span>
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> One module: nutrient_report.py
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* b) MODULE COVERAGE STATS */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4" /> Module Coverage Overview
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {modules.map((mod, idx) => {
            const stat = {
              moduleId: mod.id as UnifiedModuleId,
              title: mod.title,
              findingCount: findings.filter(f => String(f.task) === String(mod.addresses?.[idx ?? -1]) || mod.addresses?.includes(String(f.task))).length,
              criticalCount: findings.filter(f => mod.addresses?.includes(String(f.task)) && f.severity === 'critical').length,
            }
            const mColors = moduleColorMap[stat.moduleId]
            return (
              <motion.div
                key={stat.moduleId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
              >
                <Card className={`overflow-hidden ${mColors.border} border`}>
                  <CardContent className="p-4 text-center">
                    <div
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full mb-2"
                      style={{ backgroundColor: `${mColors.color}20`, border: `1px solid ${mColors.color}40` }}
                    >
                      <Zap className="h-4 w-4" style={{ color: mColors.color }} />
                    </div>
                    <div className={`font-semibold text-sm ${mColors.text}`}>{stat.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {stat.findingCount} findings &bull; {stat.criticalCount} critical
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-2">
                      <Badge className={`${effortConfig[moduleMap[stat.moduleId]?.effort ?? 'medium'].color} text-[10px] border`}>
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        {effortConfig[moduleMap[stat.moduleId]?.effort ?? 'medium'].label}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] border ${riskConfig[moduleMap[stat.moduleId]?.risk ?? 'low'].color}`}>
                        {riskConfig[moduleMap[stat.moduleId]?.risk ?? 'low'].label}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2">
                      {moduleMap[stat.moduleId]?.keyInsight}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* c) UNIFIED EXECUTION MODULES — Detailed */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Unified Execution Modules — Detailed Plans
        </h3>
        <div className="space-y-4">
          {modules.map((mod, idx) => {
            const mColors = moduleColorMap[mod.id as UnifiedModuleId]
            const modFindings = findings.filter(f => mod.addresses?.includes(String(f.task)))
            return (
              <motion.div
                key={mod.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.08 }}
              >
                <Card className={`overflow-hidden ${mColors.border}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-full"
                        style={{ backgroundColor: `${mColors.color}20`, border: `1px solid ${mColors.color}40` }}
                      >
                        <Zap className="h-4 w-4" style={{ color: mColors.color }} />
                      </div>
                      <div className="flex-1">
                        <CardTitle className={`text-base ${mColors.text}`}>{mod.title}</CardTitle>
                        <CardDescription className="text-xs">{mod.subtitle}</CardDescription>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <Badge className={`${effortConfig[mod.effort].color} text-[10px] border`}>
                          <Zap className="h-2.5 w-2.5 mr-0.5" /> {effortConfig[mod.effort].label}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] border ${riskConfig[mod.risk].color}`}>
                          {riskConfig[mod.risk].label}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-4">
                    {/* Core idea */}
                    <div className={`p-3 rounded-md ${mColors.bg} ${mColors.border} border`}>
                      <p className="text-sm text-muted-foreground leading-relaxed">{mod.coreIdea}</p>
                    </div>

                    {/* Finding tasks with severity */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> Addresses {mod.addresses.length} Findings
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {modFindings.map(f => (
                          <div
                            key={f.task}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs"
                            style={{ borderLeftColor: severityColors[f.severity], borderLeftWidth: '3px' }}
                          >
                            <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">Task {f.task}</Badge>
                            <Badge className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} text-[9px] border ${severityConfig[f.severity].border} px-1 py-0`}>
                              {severityConfig[f.severity].label}
                            </Badge>
                            <span className="text-muted-foreground truncate max-w-[140px]">{f.title}</span>
                            {analysisMap[String(f.task)]?.bestSoloIndex !== undefined && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 text-[9px] border-emerald-500/30 ml-0.5 px-1 py-0">
                                ★ Best: P{analysisMap[String(f.task)]!.bestSoloIndex + 1}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fixes list */}
                    <div className="space-y-1">
                      {mod.fixes.map((fix, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{fix}</span>
                        </div>
                      ))}
                    </div>

                    {/* Key Insight + Best Proposal — accordion for compactness */}
                    <Accordion type="multiple" className="w-full">
                      <AccordionItem value={`insight-${mod.id}`} className="border-0">
                        <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5" style={{ color: mColors.color }} /> Key Insight
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="text-xs pb-2">
                          <div className={`p-3 rounded-md ${mColors.bg} ${mColors.border} border`}>
                            <p className={`leading-relaxed ${mColors.text}`}>{mod.keyInsight}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value={`best-${mod.id}`} className="border-0">
                        <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                          <span className="flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5" style={{ color: mColors.color }} /> Best Proposal per Finding
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="text-xs pb-2 space-y-2">
                          {modFindings.map(f => {
                            const analysis = analysisMap[String(f.task)]
                            if (!analysis) return null
                            const bestProposal = f.proposals[analysis.bestSoloIndex]
                            return (
                              <div key={f.task} className={`p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">Task {f.task}</Badge>
                                  <span className="font-medium text-emerald-700 dark:text-emerald-300">
                                    Best: {bestProposal?.title ?? '—'}
                                  </span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed">{analysis.bestSoloReason}</p>
                                {analysis.hybridNote && (
                                  <p className="text-orange-600 dark:text-orange-400 mt-1">
                                    Hybrid: {analysis.hybridNote}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>

                    {/* Visual connecting diagram */}
                    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30 border">
                      <div
                        className="flex items-center justify-center w-12 h-12 rounded-lg font-bold text-sm"
                        style={{ backgroundColor: `${mColors.color}30`, color: mColors.color, border: `2px solid ${mColors.color}` }}
                      >
                        {mod.id.split('_').map(w => w[0]).join('').toUpperCase()}
                      </div>
                      <div className="flex items-center gap-1">
                        {modFindings.map((f, i) => (
                          <div key={f.task} className="flex items-center gap-1">
                            {i > 0 && <span className="text-muted-foreground">→</span>}
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: severityColors[f.severity] }}
                            >
                              T{f.task}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground ml-2">
                        ← One module addresses {modFindings.length} findings
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* d) G3 BLOCKED FINDINGS */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <Card className="border-2 border-red-500/30 bg-red-500/5 dark:bg-red-500/10">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40">
                <Lock className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <CardTitle className="text-base text-red-800 dark:text-red-200">
                  Gate G3 Blocked Findings
                </CardTitle>
                <CardDescription className="text-red-700/80 dark:text-red-300/80 text-xs">
                  Tasks 6 & 7 — mechanism can ship now, values need veterinary review
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {g3Blocked.map(blocked => {
              const f = findings.find(f => f.task === blocked.task)
              return (
                <div key={blocked.task} className="p-4 rounded-md bg-red-500/5 border border-red-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono text-xs font-semibold px-2">Task {blocked.task}</Badge>
                    <span className="font-semibold text-sm">{blocked.title}</span>
                    {f && (
                      <Badge className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} text-[10px] border ${severityConfig[f.severity].border}`}>
                        {severityConfig[f.severity].label}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Can Ship Now (Mechanism)
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{blocked.canShipNow}</p>
                    </div>
                    <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Needs G3 Review (Values)
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{blocked.needsReview}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </motion.div>

      {/* e) DEFERRED INDEPENDENT ITEMS */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
        <Card className="border-gray-500/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <CardTitle className="text-base">Deferred Independent Items</CardTitle>
              <CardDescription className="text-xs">
                Don&apos;t unify with any execution module — defer to post-critical phase
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {DEFERRED_INDEPENDENT.map(item => {
                const f = findings.find(f => f.task === item.task)
                const bestTitle = f?.proposals[item.bestSoloIndex]?.title ?? '—'
                return (
                  <div key={item.task} className="p-3 rounded-md bg-muted/30 border">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">{item.task}</Badge>
                      <span className="font-semibold text-sm">{item.title}</span>
                      <Badge variant="outline" className="text-[10px] text-gray-600 border-gray-500/30 px-1 py-0">
                        Deferred
                      </Badge>
                    </div>
                    <div className="p-2 rounded-md bg-emerald-500/5 border border-emerald-500/20 mt-1.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Zap className="h-3 w-3 text-emerald-600" />
                        <span className="font-medium text-emerald-700 dark:text-emerald-300">
                          Best: {bestTitle}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{item.bestSoloReason}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 italic">{item.note}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* f) BEST SOLUTION SUMMARY TABLE */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> Best Solution Summary — All 24 Findings
            </CardTitle>
            <CardDescription className="text-xs">
              Every finding mapped to its best solo solution and unified execution module
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-96 overflow-y-auto rounded-md border scrollbar-custom">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background border-b z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Task</th>
                    <th className="px-3 py-2 text-left font-semibold">Title</th>
                    <th className="px-3 py-2 text-left font-semibold">Best Solo</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                    <th className="px-3 py-2 text-left font-semibold">Module</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map(f => {
                    const analysis = analysisMap[String(f.task)]
                    const bestProposal = analysis ? f.proposals[analysis.bestSoloIndex] : undefined
                    const unifiedMod = analysis?.unifiedModuleId ? moduleMap[analysis.unifiedModuleId] : undefined
                    const mColors = unifiedMod ? moduleColorMap[unifiedMod.id as UnifiedModuleId] : undefined
                    return (
                      <tr key={f.task} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">{f.task}</Badge>
                        </td>
                        <td className="px-3 py-2 max-w-[120px] truncate">{f.title}</td>
                        <td className="px-3 py-2">
                          {bestProposal ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[100px] inline-block">
                              {bestProposal.title}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                          {analysis?.bestSoloReason ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          {mColors ? (
                            <Badge className={`${mColors.bg} ${mColors.text} ${mColors.border} text-[9px] px-1.5 py-0`}>
                              {unifiedMod?.title ?? '—'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-500 text-[9px] px-1.5 py-0">Independent</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

    </div>
  )
}
