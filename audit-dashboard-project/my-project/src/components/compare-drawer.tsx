'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  X, GitCompare, Trash2, Plus, FileJson, FileText, Layers, ShieldAlert,
  Lock, CheckCircle2, Tag, FileText as FileIcon, Wrench, Gauge, Hash, FolderTree,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Finding, Severity } from '@/lib/audit-types'
import {
  FINDINGS, comparisonFields, severityConfig, tierLabels, auditStatusConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
} from '@/lib/audit-data'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const severityHexColors: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

function CompIcon({ name, className }: { name?: string; className?: string }) {
  switch (name) {
    case 'Hash': return <Hash className={className} />
    case 'Layers': return <Layers className={className} />
    case 'ShieldAlert': return <ShieldAlert className={className} />
    case 'Lock': return <Lock className={className} />
    case 'CheckCircle2': return <CheckCircle2 className={className} />
    case 'Tag': return <Tag className={className} />
    case 'FileText': return <FileIcon className={className} />
    case 'Wrench': return <Wrench className={className} />
    case 'Gauge': return <Gauge className={className} />
    case 'FolderTree': return <FolderTree className={className} />
    default: return null
  }
}

/** Generate a side-by-side markdown comparison export */
function generateComparisonMarkdown(findings: Finding[]): string {
  const lines: string[] = []
  lines.push('# Finding Comparison')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString().split('T')[0]}`)
  lines.push(`Findings compared: ${findings.map(f => `Task ${f.task}`).join(', ')}`)
  lines.push('')
  lines.push('---')
  lines.push('')

  // Side-by-side table
  const fields = comparisonFields
  lines.push('| Field | ' + findings.map(f => `Task ${f.task}`).join(' | ') + ' |')
  lines.push('| --- | ' + findings.map(() => '---').join(' | ') + ' |')
  for (const field of fields) {
    const values = findings.map(f => field.getValue(f).replace(/\n/g, ' '))
    lines.push(`| ${field.label} | ${values.join(' | ')} |`)
  }
  lines.push('')
  lines.push('---')
  lines.push('')

  // Detailed sections per finding
  for (const f of findings) {
    lines.push(`## Task ${f.task}: ${f.title}`)
    lines.push('')
    lines.push(`- **Severity:** ${severityConfig[f.severity].label}`)
    lines.push(`- **Category:** ${f.category}`)
    lines.push(`- **Tier:** ${tierLabels[f.tier].full}`)
    lines.push(`- **Risk Score:** ${getRiskScore(f.severity, f.tier)}/6 (${riskLevelConfig[getRiskLevel(getRiskScore(f.severity, f.tier))].label})`)
    lines.push('')
    lines.push(`**Summary:** ${f.summary}`)
    lines.push('')
    lines.push(`**Claim:** ${f.claim}`)
    lines.push('')
    lines.push(`**Proposals:**`)
    f.proposals.forEach((p, i) => {
      lines.push(`${i + 1}. **${p.title}** (Effort: ${p.effort}, Risk: ${p.risk}, Reversible: ${p.reversible})`)
      lines.push(`   ${p.description}`)
      lines.push('')
    })
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

export function CompareDrawer({
  open,
  onOpenChange,
  selectedTasks,
  onAddTask,
  onRemoveTask,
  onClear,
  statuses,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTasks: (string | number)[]
  onAddTask: (task: string | number) => void
  onRemoveTask: (task: string | number) => void
  onClear: () => void
  statuses: Record<string, string>
}) {
  const selectedFindings = selectedTasks
    .map(t => FINDINGS.find(f => String(f.task) === String(t)))
    .filter((f): f is Finding => Boolean(f))

  const availableFindings = FINDINGS.filter(f => !selectedTasks.includes(f.task))

  const exportJSON = () => {
    const data = {
      comparedAt: new Date().toISOString(),
      findings: selectedFindings,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comparison-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportMarkdown = () => {
    const md = generateComparisonMarkdown(selectedFindings)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `comparison-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Compare a field value across findings — determine if same or different */
  const getDiffClass = (fieldLabel: string, findings: Finding[]): string => {
    if (findings.length < 2) return ''
    const values = findings.map(f => {
      const field = comparisonFields.find(cf => cf.label === fieldLabel)
      return field ? field.getValue(f) : ''
    })
    const allSame = values.every(v => v === values[0])
    // Only highlight for key comparison fields (severity, category, tier, risk)
    const highlightFields = ['Severity', 'Category', 'Tier', 'Risk Score']
    if (!highlightFields.includes(fieldLabel)) return ''
    return allSame ? 'compare-diff-same' : 'compare-diff-different'
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-stretch justify-end no-print"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            className="bg-background border-l shadow-2xl w-full max-w-7xl h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-transparent">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-md bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                  <GitCompare className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Finding Comparison</h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedFindings.length} of 3 max selected &middot; side-by-side analysis with diff highlighting
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportJSON}
                      disabled={selectedFindings.length === 0}
                      className="text-xs btn-subtle-hover"
                    >
                      <FileJson className="h-3.5 w-3.5 mr-1" /> JSON
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export comparison as JSON</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportMarkdown}
                      disabled={selectedFindings.length === 0}
                      className="text-xs btn-subtle-hover"
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Markdown
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download comparison as Markdown</TooltipContent>
                </Tooltip>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClear}
                  disabled={selectedFindings.length === 0}
                  className="text-xs"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close drawer">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Add-finding selector */}
            {selectedFindings.length < 3 && (
              <div className="p-3 border-b bg-muted/30">
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Add a finding to compare ({selectedFindings.length}/3):
                </label>
                <Select onValueChange={(v) => onAddTask(v)}>
                  <SelectTrigger className="w-full btn-subtle-hover">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    <SelectValue placeholder="Select a finding to add…" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFindings.map(f => (
                      <SelectItem key={String(f.task)} value={String(f.task)}>
                        Task {f.task} — {f.title} ({severityConfig[f.severity].label})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Body: comparison view */}
            <ScrollArea className="flex-1">
              {selectedFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-12 text-center text-muted-foreground">
                  <GitCompare className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm font-medium mb-1">No findings selected for comparison</p>
                  <p className="text-xs">Use the selector above to add up to 3 findings.</p>
                </div>
              ) : (
                <div className="p-4">
                  {/* ─── SIDE-BY-SIDE FINDING OVERVIEW ─── */}
                  {selectedFindings.length >= 2 && (
                    <div className="mb-4">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Layers className="h-3 w-3" /> Overview Comparison
                      </div>
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: `repeat(${selectedFindings.length}, minmax(0, 1fr))` }}
                      >
                        {selectedFindings.map(f => {
                          const score = getRiskScore(f.severity, f.tier)
                          const level = getRiskLevel(score)
                          return (
                            <div
                              key={String(f.task)}
                              className="compare-glass-panel p-3 space-y-2 relative"
                              style={{ borderLeftColor: severityHexColors[f.severity], borderLeftWidth: 3 }}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-1 right-1 h-6 w-6 btn-subtle-hover"
                                onClick={() => onRemoveTask(f.task)}
                                aria-label="Remove from comparison"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                              <Badge variant="outline" className="font-mono text-[10px]">Task {f.task}</Badge>
                              <Badge
                                className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} severity-badge-${f.severity} text-[10px] border ${severityConfig[f.severity].border}`}
                              >
                                {severityConfig[f.severity].label}
                              </Badge>
                              <div className="font-semibold text-xs leading-tight pr-4">{f.title}</div>
                              <Separator />
                              <div className="text-[10px] text-muted-foreground leading-relaxed">{f.claim}</div>
                              <div className="flex items-center gap-1 flex-wrap mt-1">
                                <Badge variant="outline" className="text-[9px]">{tierLabels[f.tier].short}</Badge>
                                <Badge
                                  variant="outline"
                                  className="text-[9px]"
                                  style={{ borderColor: riskLevelConfig[level].color, color: riskLevelConfig[level].color }}
                                >
                                  <Gauge className="h-2.5 w-2.5 mr-0.5" /> {score}/6
                                </Badge>
                                {statuses[String(f.task)] && statuses[String(f.task)] !== 'not-started' && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] ${auditStatusConfig[statuses[String(f.task)] as keyof typeof auditStatusConfig]?.badgeClass}`}
                                  >
                                    {auditStatusConfig[statuses[String(f.task)] as keyof typeof auditStatusConfig]?.shortLabel}
                                  </Badge>
                                )}
                              </div>
                              {/* Proposals summary */}
                              <Separator />
                              <div className="space-y-1">
                                <div className="text-[10px] font-semibold text-muted-foreground">Proposals</div>
                                {f.proposals.map((p, i) => (
                                  <div key={i} className="text-[10px] text-muted-foreground">
                                    <span className="font-medium">{p.title}</span>
                                    <span className="ml-1 opacity-70">({p.effort}/{p.risk})</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ─── DIFF TABLE (detailed row-by-row) ─── */}
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" /> Detailed Comparison &middot;
                      <span className="ml-1">
                        <span className="compare-diff-same inline-block px-1 rounded text-[9px]">same</span>
                        <span className="compare-diff-different inline-block px-1 rounded text-[9px] ml-1">different</span>
                      </span>
                    </div>
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: `140px repeat(${selectedFindings.length}, minmax(0, 1fr))` }}
                    >
                      {/* Header row */}
                      <div />
                      {selectedFindings.map(f => {
                        const score = getRiskScore(f.severity, f.tier)
                        const level = getRiskLevel(score)
                        return (
                          <div
                            key={`header-${f.task}`}
                            className="rounded-md border p-2 space-y-1 relative"
                            style={{ borderLeftColor: severityHexColors[f.severity], borderLeftWidth: 3 }}
                          >
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="font-mono text-[10px]">Task {f.task}</Badge>
                              <Badge
                                className={`${severityConfig[f.severity].bg} ${severityConfig[f.severity].text} severity-badge-${f.severity} text-[10px] border ${severityConfig[f.severity].border}`}
                              >
                                {severityConfig[f.severity].label}
                              </Badge>
                            </div>
                          </div>
                        )
                      })}

                      {/* Comparison rows with diff highlighting */}
                      {comparisonFields.map(field => {
                        const diffClass = getDiffClass(field.label, selectedFindings)
                        return (
                          <ComparisonRow
                            key={field.label}
                            field={field}
                            findings={selectedFindings}
                            diffClass={diffClass}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </ScrollArea>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ComparisonRow({
  field,
  findings,
  diffClass,
}: {
  field: typeof comparisonFields[number]
  findings: Finding[]
  diffClass: string
}) {
  return (
    <>
      <div className={`flex items-start gap-1.5 text-xs font-semibold text-muted-foreground pt-2 border-t ${diffClass}`}>
        {field.icon && <CompIcon name={field.icon} className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
        <span>{field.label}</span>
      </div>
      {findings.map(f => {
        const value = field.getValue(f)
        const isLong = value.length > 80
        return (
          <div
            key={`${f.task}-${field.label}`}
            className={`text-xs pt-2 border-t ${isLong ? 'leading-relaxed' : 'font-medium'} ${diffClass}`}
          >
            {value}
          </div>
        )
      })}
    </>
  )
}
