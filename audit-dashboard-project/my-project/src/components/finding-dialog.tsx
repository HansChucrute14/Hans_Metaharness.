'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Separator,
} from '@/components/ui/separator'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import {
  ShieldAlert, AlertTriangle, Bug, FileWarning, Eye, Scale, ShieldQuestion,
  ChevronDown, Lock, Code, Wrench, FileCode2, FileText, Copy, Check,
  TrendingUp, XCircle, Zap, Target, Layers, CheckCircle2, GitBranch,
  ArrowRight, ThumbsUp, ThumbsDown, AlertCircle, Sparkles,
} from 'lucide-react'
import type { Finding, Proposal } from '@/lib/audit-types'
import { severityConfig, verificationConfig,
  effortConfig, riskConfig, getCategoryColor,
} from '@/lib/audit-data'
import { useState, useCallback } from 'react'

/* Icon renderer (avoids creating components during render) */
function Icon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case 'ShieldAlert': return <ShieldAlert className={className} />
    case 'AlertTriangle': return <AlertTriangle className={className} />
    case 'Bug': return <Bug className={className} />
    case 'FileWarning': return <FileWarning className={className} />
    case 'Eye': return <Eye className={className} />
    case 'Scale': return <Scale className={className} />
    case 'ShieldQuestion': return <ShieldQuestion className={className} />
    case 'ChevronDown': return <ChevronDown className={className} />
    default: return <ShieldAlert className={className} />
  }
}

/* Code block with copy button */
function CodeBlock({ file, lines, language, code }: {
  file: string
  lines: string
  language: string
  code: string
}) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="rounded-md border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/60">
        <div className="flex items-center gap-2 text-xs">
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono font-medium">{file}</span>
          <span className="text-muted-foreground">:{lines}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{language}</Badge>
        </div>
        <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground" aria-label="Copy code">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre className="code-block scrollbar-custom !border-0 !bg-transparent">
        {code.split('\n').map((line, i) => (
          <div key={i} className="hover:bg-foreground/5">
            <span className="select-none text-muted-foreground/60 inline-block w-8 text-right pr-3">
              {i + 1}
            </span>
            {line.trim().startsWith('#') || line.trim().startsWith('//') ? (
              <span className="text-muted-foreground italic">{line || ' '}</span>
            ) : (
              line || ' '
            )}
          </div>
        ))}
      </pre>
    </div>
  )
}

/* Pros/cons for a proposal (heuristically derived) */
function getProsCons(proposal: Proposal): { pros: string[]; cons: string[] } {
  const pros: string[] = []
  const cons: string[] = []

  if (proposal.effort === 'low') pros.push('Low implementation effort')
  else if (proposal.effort === 'medium') cons.push('Moderate implementation effort')
  else cons.push('High implementation effort')

  if (proposal.risk === 'low') pros.push('Low risk of regression')
  else if (proposal.risk === 'medium') cons.push('Medium regression risk')
  else cons.push('High regression risk — needs careful review')

  if (proposal.reversible) pros.push('Fully reversible')
  else cons.push('Irreversible — cannot be undone easily')

  const desc = proposal.description.toLowerCase()
  if (desc.includes('independent') || desc.includes('dedicated')) pros.push('Independently testable')
  if (desc.includes('clean') || desc.includes('cleanest')) pros.push('Clean architecture')
  if (desc.includes('simple') || desc.includes('minimal')) pros.push('Simple, minimal change')
  if (desc.includes('flexible') || desc.includes('configurable')) pros.push('Flexible / configurable')
  if (desc.includes('robust') || desc.includes('comprehensive')) pros.push('Robust / comprehensive')
  if (desc.includes('refactor') || desc.includes('rewrit')) cons.push('Requires refactoring')
  if (desc.includes('infrastructure') || desc.includes('deploy')) cons.push('Requires infrastructure change')
  if (desc.includes('dependency') && !desc.includes('eliminat')) cons.push('Adds dependency')
  if (desc.includes('calibrat') || desc.includes('tun')) cons.push('Requires parameter tuning')
  if (desc.includes('organizational') || desc.includes('process change')) cons.push('Requires process change')

  return { pros, cons }
}

/* Single proposal card with pros/cons */
function ProposalDetail({ proposal, idx }: { proposal: Proposal; idx: number }) {
  const { pros, cons } = getProsCons(proposal)
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: `var(--chart-${(idx % 5) + 1})` }}
            >
              {idx + 1}
            </span>
            {proposal.title}
          </CardTitle>
          <div className="flex gap-1 flex-wrap">
            <Badge className={`${effortConfig[proposal.effort].color} text-[10px] border`}>
              <Zap className="h-2.5 w-2.5 mr-0.5" />
              {effortConfig[proposal.effort].label}
            </Badge>
            <Badge variant="outline" className={`text-[10px] border ${riskConfig[proposal.risk].color}`}>
              {riskConfig[proposal.risk].label}
            </Badge>
            {proposal.reversible ? (
              <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> Reversible
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-red-700 dark:text-red-300 border-red-500/30">
                <XCircle className="h-2.5 w-2.5 mr-0.5" /> Irreversible
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">{proposal.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300 mb-1">
              <ThumbsUp className="h-3 w-3" /> Pros
            </div>
            <ul className="space-y-0.5">
              {pros.map((p, i) => (
                <li key={i} className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-start gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-red-700 dark:text-red-300 mb-1">
              <ThumbsDown className="h-3 w-3" /> Cons
            </div>
            <ul className="space-y-0.5">
              {cons.map((c, i) => (
                <li key={i} className="text-[11px] text-red-700 dark:text-red-300 flex items-start gap-1">
                  <AlertCircle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* Recommendation badge — picks the "best" proposal heuristically */
function Recommendation({ proposals }: { proposals: Proposal[] }) {
  // Score: low effort +2, low risk +2, medium effort/risk +1, reversible +1, has 'simple' or 'independent' or 'minimal' +1
  const scores = proposals.map((p, i) => {
    let score = 0
    if (p.effort === 'low') score += 2
    else if (p.effort === 'medium') score += 1
    if (p.risk === 'low') score += 2
    else if (p.risk === 'medium') score += 1
    if (p.reversible) score += 1
    const desc = p.description.toLowerCase()
    if (desc.includes('simple') || desc.includes('minimal')) score += 1
    if (desc.includes('independent')) score += 1
    if (desc.includes('clean')) score += 1
    return { idx: i, score }
  })
  scores.sort((a, b) => b.score - a.score)
  const best = scores[0]
  if (!best) return null

  return (
    <div className="flex items-center gap-2 text-xs">
      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
      <span className="text-muted-foreground">Recommended starting point:</span>
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
        Proposal #{best.idx + 1}
      </Badge>
    </div>
  )
}

/* Main dialog */
export function FindingDetailDialog({
  finding,
  open,
  onOpenChange,
}: {
  finding: Finding | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!finding) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-custom">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge variant="outline" className="font-mono text-xs font-semibold">
              Task {finding.task}
            </Badge>
            {finding.findingIds.map(id => (
              <Badge key={id} variant="secondary" className="text-xs">{id}</Badge>
            ))}
            <Badge
              className={`${severityConfig[finding.severity].bg} ${severityConfig[finding.severity].text} ${severityConfig[finding.severity].border} border text-xs`}
            >
              <Icon name={severityConfig[finding.severity].icon} className="h-3.5 w-3.5" />
              <span className="ml-1">{severityConfig[finding.severity].label}</span>
            </Badge>
            <Badge
              className={`${verificationConfig[finding.verificationStatus].bg} ${verificationConfig[finding.verificationStatus].text} text-xs border border-transparent`}
            >
              <Icon name={verificationConfig[finding.verificationStatus].icon} className="h-3.5 w-3.5" />
              <span className="ml-1">Confirmed ({verificationConfig[finding.verificationStatus].label})</span>
            </Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: getCategoryColor(finding.category) }}>
              <Layers className="h-3 w-3 mr-1" style={{ color: getCategoryColor(finding.category) }} />
              {finding.category}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Depends: {finding.dependsOn}
            </Badge>
          </div>
          <DialogTitle className="text-lg sm:text-xl leading-tight">{finding.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{finding.summary}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Claim + Evidence */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                <Target className="h-3.5 w-3.5 text-orange-600" /> Claim
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">{finding.claim}</div>
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="text-xs font-semibold mb-1 flex items-center gap-1">
                <Bug className="h-3.5 w-3.5 text-red-600" /> Evidence (Live Code)
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed font-mono text-[11px]">{finding.evidence}</div>
            </div>
          </div>

          {finding.verificationNote && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Verification Note
              </div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">{finding.verificationNote}</div>
            </div>
          )}

          {/* Code snippets */}
          {finding.codeSnippets && finding.codeSnippets.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <FileCode2 className="h-3.5 w-3.5" /> Code Evidence
              </div>
              {finding.codeSnippets.map((snip, i) => (
                <CodeBlock key={i} {...snip} />
              ))}
            </div>
          )}

          {/* Affected files */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Affected Files ({finding.affectedFiles.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {finding.affectedFiles.map(f => (
                <Badge key={f} variant="outline" className="text-[10px] font-mono">
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Proposals comparison */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <Wrench className="h-4 w-4" /> Solution Proposals — Side-by-Side Comparison
              </div>
            </div>
            <div className="mb-3">
              <Recommendation proposals={finding.proposals} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {finding.proposals.map((p, i) => (
                <ProposalDetail key={i} proposal={p} idx={i} />
              ))}
            </div>
          </div>

          {/* Comparison summary table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> At-a-Glance Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="overflow-x-auto scrollbar-custom">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2 font-semibold">Criterion</th>
                      {finding.proposals.map((_, i) => (
                        <th key={i} className="text-center py-1.5 px-2 font-semibold">Proposal {i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">Effort</td>
                      {finding.proposals.map((p, i) => (
                        <td key={i} className="text-center py-1.5 px-2">
                          <Badge className={`${effortConfig[p.effort].color} text-[10px] border`}>
                            {p.effort}
                          </Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">Risk</td>
                      {finding.proposals.map((p, i) => (
                        <td key={i} className="text-center py-1.5 px-2">
                          <Badge variant="outline" className={`text-[10px] border ${riskConfig[p.risk].color}`}>
                            {p.risk}
                          </Badge>
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b">
                      <td className="py-1.5 px-2 font-medium">Reversible</td>
                      {finding.proposals.map((p, i) => (
                        <td key={i} className="text-center py-1.5 px-2">
                          {p.reversible ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600 mx-auto" />
                          )}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-1.5 px-2 font-medium">Title</td>
                      {finding.proposals.map((p, i) => (
                        <td key={i} className="text-left py-1.5 px-2 text-[11px]">{p.title}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
