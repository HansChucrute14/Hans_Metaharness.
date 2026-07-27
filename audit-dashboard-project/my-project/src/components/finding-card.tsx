'use client'

/**
 * FindingCard and its private dependencies (CodeBlock, StatusDropdown,
 * NotesEditor, Icon, StatusIcon) extracted from dashboard-client.tsx.
 *
 * This file is lazy-loaded by the main dashboard client to avoid bundling
 * the heavy card / code-highlighting logic on the initial server render.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Button,
} from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Checkbox,
} from '@/components/ui/checkbox'
import {
  Textarea,
} from '@/components/ui/textarea'
import {
  ShieldAlert, AlertTriangle, Bug, FileWarning,
  Eye, Scale, ShieldQuestion, ChevronDown,
  CheckCircle2, XCircle, Circle, LoaderCircle,
  Code, FileCode2, Copy, Check, Maximize2,
  Bookmark, BookmarkCheck, GitCompare, Target, Wrench, Zap,
  TrendingUp, Lock, Layers, Gauge, StickyNote, Save,
  Github, ExternalLink, Rocket, Kanban, Link2, FileText,
} from 'lucide-react'
import type { Severity, AuditStatus } from '@/lib/audit-types'
import {
  severityConfig, verificationConfig, tierLabels, effortConfig, riskConfig,
  getCategoryColor,
  getRiskScore, getRiskLevel, riskLevelConfig, auditStatusConfig, AUDIT_STATUS_ORDER,
  severityWeight, tierImpact,
} from '@/lib/audit-data'
import {
  severityColors,
} from '@/lib/dashboard-constants'
import {
  type Finding, type BestProposalAnalysis,
} from '@/lib/data'
import {
  type GitHubIssueResult, type GitHubTokenStatus,
  addActivityEntry, type ActivityType,
} from '@/lib/use-findings'
import { AIAnalysisPanel } from '@/components/ai-analysis-panel'

/* ─── HELPERS ─── */
/* Render an icon by name without creating a component during render */
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

function StatusIcon({ status, className, style }: { status: AuditStatus; className?: string; style?: React.CSSProperties }) {
  switch (status) {
    case 'not-started': return <Circle className={className} style={style} />
    case 'in-progress': return <LoaderCircle className={`${className ?? ''} animate-spin-slow`} style={style} />
    case 'fixed': return <CheckCircle2 className={className} style={style} />
    case 'wont-fix': return <XCircle className={className} style={style} />
  }
}

/* ─── CODE BLOCK ─── */
export function CodeBlock({ file, lines, language, code }: {
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

  // Parse referenced line numbers from lines string (e.g. "120-145" → range)
  const referencedLines = useMemo(() => {
    const rangeMatch = lines.match(/(\d+)-(\d+)/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1])
      const end = parseInt(rangeMatch[2])
      const set = new Set<number>()
      for (let i = start; i <= end; i++) set.add(i)
      return set
    }
    const singleMatch = lines.match(/(\d+)/)
    if (singleMatch) return new Set([parseInt(singleMatch[1])])
    return new Set<number>()
  }, [lines])

  // Enhanced token highlighting
  const highlight = (line: string, lineNum: number, isReferenced: boolean) => {
    // Full-line comment
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) {
      return <span className="tok-comment">{line}</span>
    }

    // Tokenize the line with regex patterns
    const tokens: { text: string; className: string }[] = []
    let remaining = line
    let offset = 0

    // Process patterns in order of priority
    const patterns: { regex: RegExp; className: string }[] = [
      // Decorators (@...)
      { regex: /@\w+(\.\w+)*\(/, className: 'tok-decorator' },
      // Strings (single/double/triple quotes)
      { regex: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*"|f'(?:[^'\\]|\\.)*'/, className: 'tok-string' },
      // Keywords
      { regex: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|async|await|yield|lambda|not|and|or|is|in|pass|break|continue|raise|assert|global|nonlocal|const|let|var|function|return|export|default|interface|type|enum|extends|implements|new|this|super|static|public|private|protected|abstract|virtual|override|void|int|float|bool|string|array|map|set|true|false|null|None|True|False)\b/, className: 'tok-keyword' },
      // Numbers
      { regex: /\b\d+(\.\d+)?\b/, className: 'tok-number' },
      // Builtins
      { regex: /\b(print|len|range|list|dict|set|tuple|str|int|float|bool|type|isinstance|hasattr|getattr|setattr|open|sorted|enumerate|zip|map|filter|abs|max|min|sum|round|super|property|classmethod|staticmethod|input|format|append|extend|keys|values|items|pop|remove|clear|copy|update|get|join|split|strip|replace|find|index|count|startswith|endswith|lower|upper|title|encode|decode|read|write|close|seek|flush|json|yaml|os|sys|path|re|math|datetime|collections|itertools|functools|logging|argparse|subprocess|shutil|copy|tempfile|hashlib|uuid|random|struct|socket|threading|multiprocessing|queue|time|signal|errno|io|abc|contextlib|dataclass|typing|enum|csv|sqlite3|http|urllib|requests|pytest|unittest)\b/, className: 'tok-builtin' },
      // Inline comments
      { regex: /#.*$|\/\/.*$/, className: 'tok-comment' },
    ]

    // Simple approach: try each pattern and wrap matches
    let result: React.ReactNode[] = []
    let processedLine = line

    // Replace inline comments first
    const commentMatch = processedLine.match(/(#.*$|\/\/.*$)/)
    let commentPart = ''
    let codePart = processedLine
    if (commentMatch) {
      const idx = processedLine.indexOf(commentMatch[0])
      codePart = processedLine.slice(0, idx)
      commentPart = processedLine.slice(idx)
    }

    // Process code part with patterns
    let highlighted = codePart
    // We'll use a simple approach: apply patterns and wrap with spans
    const fragmentParts: React.ReactNode[] = []

    // Split code part into segments by applying keyword/builtin/number/string/decorator patterns
    // Simple approach: regex match and replace sequentially
    let tempStr = codePart
    const replacements: { start: number; end: number; text: string; cls: string }[] = []

    for (const pat of patterns) {
      if (pat.className === 'tok-comment') continue // handled separately
      const regex = new RegExp(pat.regex.source, pat.regex.flags)
      let match: RegExpExecArray | null
      while ((match = regex.exec(tempStr)) !== null) {
        replacements.push({ start: match.index, end: match.index + match[0].length, text: match[0], cls: pat.className })
        if (match.index + match[0].length >= tempStr.length) break
        // Prevent infinite loops
        const nextIdx = match.index + 1
        const rest = tempStr.slice(nextIdx)
        const nextMatch = regex.exec(rest)
        if (!nextMatch) break
      }
    }

    // Sort replacements by position and deduplicate
    replacements.sort((a, b) => a.start - b.start)
    const deduped: typeof replacements = []
    let lastEnd = -1
    for (const r of replacements) {
      if (r.start >= lastEnd) {
        deduped.push(r)
        lastEnd = r.end
      }
    }

    // Build the output from deduped replacements
    if (deduped.length === 0) {
      result.push(<span key="code">{codePart}</span>)
    } else {
      let pos = 0
      for (const r of deduped) {
        if (r.start > pos) {
          result.push(<span key={`pre-${pos}`}>{codePart.slice(pos, r.start)}</span>)
        }
        result.push(<span key={`tok-${r.start}`} className={r.cls}>{r.text}</span>)
        pos = r.end
      }
      if (pos < codePart.length) {
        result.push(<span key={`post-${pos}`}>{codePart.slice(pos)}</span>)
      }
    }

    // Add comment part if exists
    if (commentPart) {
      result.push(<span key="comment" className="tok-comment">{commentPart}</span>)
    }

    // If the result is just plain text with no highlighting, return the raw line
    if (result.length === 1 && typeof result[0] === 'object' && 'key' in result[0] && result[0].key === 'code') {
      return line
    }

    return result
  }

  return (
    <div className="rounded-md border bg-muted/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/60">
        <div className="flex items-center gap-2 text-xs">
          <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-mono font-medium">{file}</span>
          <span className="text-muted-foreground">:{lines}</span>
          <Badge variant="outline" className="text-[10px] uppercase">{language}</Badge>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 transition-transform duration-150"
              onClick={handleCopy}
            >
              <span className={`inline-flex items-center transition-transform duration-150 ${copied ? 'scale-1.1' : 'scale-1'}`}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy code'}</TooltipContent>
        </Tooltip>
      </div>
      <pre className="code-block scrollbar-custom !border-0 !bg-transparent">
        {code.split('\n').map((line, i) => {
          const isReferenced = referencedLines.has(i + 1)
          return (
            <div
              key={i}
              className={`hover:bg-foreground/5 ${isReferenced ? 'tok-line-highlight' : ''}`}
            >
              <span className="select-none text-muted-foreground/60 inline-block w-8 text-right pr-3">
                {i + 1}
              </span>
              {highlight(line, i + 1, isReferenced) || ' '}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

/* ─── STATUS DROPDOWN ─── */
function StatusDropdown({
  value,
  onChange,
  size = 'sm',
}: {
  value: AuditStatus
  onChange: (s: AuditStatus) => void
  size?: 'sm' | 'xs'
}) {
  const cfg = auditStatusConfig[value]
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AuditStatus)}>
      <SelectTrigger
        className={`h-7 ${size === 'xs' ? 'w-[110px] text-[10px]' : 'w-[130px] text-xs'} ${cfg.badgeClass} border font-medium`}
        onClick={(e) => e.stopPropagation()}
      >
        <StatusIcon status={value} className="h-3 w-3 flex-shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {AUDIT_STATUS_ORDER.map(s => {
          const c = auditStatusConfig[s]
          return (
            <SelectItem key={s} value={s} className="text-xs">
              <div className="flex items-center gap-1.5">
                <StatusIcon status={s} className="h-3 w-3" style={{ color: c.color }} />
                <span>{c.label}</span>
              </div>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

/* ─── NOTES INLINE EDITOR ─── */
function NotesEditor({
  task,
  note,
  onSave,
}: {
  task: string | number
  note: string
  onSave: (note: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [editing])

  const handleSave = useCallback(() => {
    onSave(draft)
    setEditing(false)
  }, [draft, onSave])

  const handleCancel = useCallback(() => {
    setDraft(note)
    setEditing(false)
  }, [note])

  if (!editing) {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-md p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
            <StickyNote className="h-3 w-3" /> My Notes
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 px-1.5"
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          >
            <StickyNote className="h-2.5 w-2.5 mr-0.5" /> {note ? 'Edit' : 'Add note'}
          </Button>
        </div>
        {note ? (
          <div className="text-xs text-amber-900 dark:text-amber-200 mt-1.5 whitespace-pre-wrap leading-relaxed">
            {note}
          </div>
        ) : (
          <div className="text-[11px] text-amber-700/60 dark:text-amber-400/60 italic mt-1">
            Click "Add note" to record your thoughts about this finding (saved to your browser).
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
          <StickyNote className="h-3 w-3" /> Editing note for Task {task}
        </div>
      </div>
      <Textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Record observations, ownership, status context, links to PRs…"
        className="text-xs min-h-[60px] resize-y bg-background/80"
        onClick={(e) => e.stopPropagation()}
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px]"
          onClick={(e) => { e.stopPropagation(); handleCancel() }}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-6 text-[11px] bg-amber-600 hover:bg-amber-700 text-white"
          onClick={(e) => { e.stopPropagation(); handleSave() }}
        >
          <Save className="h-2.5 w-2.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  )
}

/* ─── FINDING CARD ─── */
export function FindingCard({
  finding,
  focused,
  expanded,
  onToggle,
  isBookmarked,
  onBookmark,
  onViewDetails,
  status,
  onStatusChange,
  note,
  onSaveNote,
  bulkSelectMode,
  isSelected,
  onToggleSelect,
  isInCompare,
  onToggleCompare,
  analysisMap,
  githubTokenStatus,
  onCreateIssue,
  creatingIssue,
  githubIssueResult,
  githubProjectNumber,
  onAddToProject,
  addingToProject,
  onCreateIssueAndLink,
  creatingAndLinking,
}: {
  finding: Finding
  focused?: boolean
  expanded: boolean
  onToggle: () => void
  isBookmarked: boolean
  onBookmark: () => void
  onViewDetails: () => void
  status: AuditStatus
  onStatusChange: (s: AuditStatus) => void
  note: string
  onSaveNote: (note: string) => void
  bulkSelectMode: boolean
  isSelected: boolean
  onToggleSelect: () => void
  isInCompare: boolean
  onToggleCompare: () => void
  analysisMap: Record<string, BestProposalAnalysis | undefined>
  githubTokenStatus: GitHubTokenStatus | null
  onCreateIssue: (finding: Finding) => void
  creatingIssue: boolean
  githubIssueResult: GitHubIssueResult | null
  githubProjectNumber: number | null
  onAddToProject: (issueNodeId: string, projectNumber: number) => void
  addingToProject: boolean
  onCreateIssueAndLink: (finding: Finding) => void
  creatingAndLinking: boolean
}) {
  const riskScore = getRiskScore(finding.severity, finding.tier)
  const riskLevel = getRiskLevel(riskScore)
  const statusCfg = auditStatusConfig[status]
  const hasIssue = !!finding.githubIssueUrl || !!githubIssueResult

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -2 }}
      data-finding-task={String(finding.task)}
      className={focused ? 'ring-2 ring-violet-500/80 ring-offset-2 ring-offset-background rounded-lg shadow-lg shadow-violet-500/20' : ''}
    >
      <Card
        className={`card-print card-hover-lift overflow-hidden border-l-4 transition-all ${severityConfig[finding.severity].border} ${isBookmarked ? 'ring-2 ring-amber-400/50' : ''} ${isSelected ? 'ring-2 ring-blue-400/70' : ''} ${status === 'fixed' ? 'opacity-75' : ''}`}
        style={{ borderLeftColor: severityColors[finding.severity] }}
      >
        <CardHeader className="pb-2">
          {/* Top row: checkbox + task + IDs + actions */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {bulkSelectMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggleSelect}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select Task ${finding.task}`}
                className="data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
              />
            )}
            <Badge variant="outline" className="font-mono text-xs font-semibold shrink-0">
              Task {finding.task}
            </Badge>
            {finding.findingIds.length > 0 && (
              <div className="flex items-center gap-1 shrink-0">
                {finding.findingIds.slice(0, 2).map(id => (
                  <Badge key={id} variant="secondary" className="text-[10px] px-1 py-0">{id}</Badge>
                ))}
                {finding.findingIds.length > 2 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    +{finding.findingIds.length - 2}
                  </Badge>
                )}
              </div>
            )}

            {/* Status dropdown */}
            <StatusDropdown value={status} onChange={onStatusChange} size="xs" />

            {/* Risk score badge */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono px-1 py-0"
                  style={{ borderColor: riskLevelConfig[riskLevel].color, color: riskLevelConfig[riskLevel].color }}
                >
                  <Gauge className="h-2.5 w-2.5 mr-0.5" />
                  {riskScore}/6
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Risk Score: {riskScore}/6 ({riskLevelConfig[riskLevel].label})
                <br />
                <span className="text-[10px] opacity-70">
                  Severity weight ({severityWeight[finding.severity]}) + Tier impact ({tierImpact[finding.tier]})
                </span>
              </TooltipContent>
            </Tooltip>

            <div className="ml-auto flex items-center gap-1 no-print">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${isInCompare ? 'text-purple-500' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onToggleCompare() }}
                    aria-label={isInCompare ? 'Remove from comparison' : 'Add to comparison'}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isInCompare ? 'Remove from comparison' : 'Add to comparison'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); onBookmark() }}
                    aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                  >
                    {isBookmarked ? (
                      <BookmarkCheck className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Bookmark className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isBookmarked ? 'Remove bookmark' : 'Bookmark this finding'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); onViewDetails() }}
                    aria-label="View details"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open detailed view</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Second row: title — with gradient mask for truncation in collapsed state */}
          <div className="flex items-start gap-2 mt-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <CardTitle
                  className={`text-base sm:text-lg leading-tight flex-1 min-w-0 ${expanded ? '' : 'finding-title-mask'}`}
                  title={finding.title}
                >
                  {status === 'fixed' && <CheckCircle2 className="inline h-3.5 w-3.5 mr-1 text-emerald-500" />}
                  {status === 'wont-fix' && <XCircle className="inline h-3.5 w-3.5 mr-1 text-red-500" />}
                  {expanded ? finding.title : finding.title}
                </CardTitle>
              </TooltipTrigger>
              <TooltipContent>{finding.title}</TooltipContent>
            </Tooltip>
          </div>

          {/* Compact meta row: severity + verification + tier + category */}
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <Badge
              className={`${severityConfig[finding.severity].bg} ${severityConfig[finding.severity].text} ${severityConfig[finding.severity].border} border text-[10px] px-1.5 py-0 severity-badge-${finding.severity}`}
            >
              <Icon name={severityConfig[finding.severity].icon} className="h-3 w-3" />
              <span className="ml-0.5 dark:font-bold">{severityConfig[finding.severity].label}</span>
            </Badge>
            <Badge
              className={`${verificationConfig[finding.verificationStatus].bg} ${verificationConfig[finding.verificationStatus].text} text-[10px] border border-transparent px-1.5 py-0`}
            >
              <Icon name={verificationConfig[finding.verificationStatus].icon} className="h-3 w-3" />
              <span className="ml-0.5">{verificationConfig[finding.verificationStatus].label}</span>
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {tierLabels[finding.tier].short}
            </Badge>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ borderColor: getCategoryColor(finding.category) }}>
              <Layers className="h-2.5 w-2.5 mr-0.5" style={{ color: getCategoryColor(finding.category) }} />
              {finding.category}
            </Badge>
            {finding.dependsOn !== 'None' && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0" title={`Depends on: ${finding.dependsOn}`}>
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                {finding.dependsOn}
              </Badge>
            )}
          </div>

          {/* Status indicator bar when not default */}
          {status !== 'not-started' && (
            <div className={`mt-1.5 px-2 py-1 rounded text-[10px] flex items-center gap-1.5 ${statusCfg.badgeClass} border`}>
              <StatusIcon status={status} className="h-3 w-3" />
              <span className="font-semibold">{statusCfg.label}:</span>
              <span className="opacity-80">{statusCfg.description}</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{finding.summary}</p>

          {/* Inline notes editor */}
          <div className="mb-3">
            <NotesEditor task={finding.task} note={note} onSave={onSaveNote} />
          </div>

          <Accordion
            type="multiple"
            value={expanded ? [`claim-${finding.task}`, `proposals-${finding.task}`] : []}
            onValueChange={onToggle}
          >
            <AccordionItem value={`claim-${finding.task}`} className="border-0">
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-1.5">
                  <Code className="h-3.5 w-3.5" /> Verified Claim & Evidence
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-xs space-y-2 pb-2">
                <div className="bg-muted/60 p-3 rounded-md border">
                  <div className="font-semibold mb-1 flex items-center gap-1">
                    <Target className="h-3 w-3" /> Claim:
                  </div>
                  <div className="text-muted-foreground leading-relaxed">{finding.claim}</div>
                </div>
                <div className="bg-muted/60 p-3 rounded-md border">
                  <div className="font-semibold mb-1 flex items-center gap-1">
                    <Bug className="h-3 w-3" /> Evidence (Live Code):
                  </div>
                  <div className="text-muted-foreground leading-relaxed font-mono text-[11px]">
                    {finding.evidence}
                  </div>
                </div>
                {finding.verificationNote && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-md">
                    <div className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Verification Note:
                    </div>
                    <div className="text-emerald-700 dark:text-emerald-300 leading-relaxed">{finding.verificationNote}</div>
                  </div>
                )}
                {finding.codeSnippets && finding.codeSnippets.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                      <FileCode2 className="h-3 w-3" /> Code Snippets
                    </div>
                    {finding.codeSnippets.map((snip, i) => (
                      <CodeBlock key={i} {...snip} />
                    ))}
                  </div>
                )}
                {finding.affectedFiles.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
                      <FileText className="h-3 w-3" /> Affected Files ({finding.affectedFiles.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {finding.affectedFiles.map(f => (
                        <Badge key={f} variant="outline" className="text-[10px] font-mono">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value={`proposals-${finding.task}`} className="border-0">
              <AccordionTrigger className="text-xs font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> 3 Solution Proposals
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pb-2">
                {finding.proposals.map((proposal, idx) => (
                  <div key={idx} className="border rounded-md p-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                      <span className="font-semibold text-sm flex-1">
                        <span className="text-muted-foreground mr-1">#{idx + 1}</span>
                        {proposal.title}
                        {analysisMap[String(finding.task)]?.bestSoloIndex === idx && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] border-emerald-500/30 ml-1">★ Best</Badge>
                        )}
                      </span>
                      <div className="flex items-center gap-1 flex-wrap">
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
                    <p className="text-xs text-muted-foreground leading-relaxed">{proposal.description}</p>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={onViewDetails}
                >
                  <Maximize2 className="h-3 w-3 mr-1" /> Open Detailed Comparison View
                </Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Best Proposal Indicator */}
          {analysisMap[String(finding.task)] && (
            <div className="mt-2 p-2 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex items-center gap-1.5 text-xs">
                <Zap className="h-3 w-3 text-emerald-600" />
                <span className="font-medium text-emerald-700 dark:text-emerald-300">
                  Best: {finding.proposals[analysisMap[String(finding.task)]!.bestSoloIndex]?.title ?? '—'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {analysisMap[String(finding.task)]!.bestSoloReason}
              </p>
              {analysisMap[String(finding.task)]!.hybridNote && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  Hybrid: {analysisMap[String(finding.task)]!.hybridNote}
                </p>
              )}
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Layers className="h-3 w-3" /> Module: {finding.module?.title ?? 'Independent'}
              </div>
            </div>
          )}

          {/* AI Analysis Panel */}
          <AIAnalysisPanel finding={finding} onAnalysisComplete={() => {
            addActivityEntry({ type: 'ai_analysis' as ActivityType, task: String(finding.task), description: `AI analysis completed for Task ${finding.task}: ${finding.title}` })
          }} />

          {/* GitHub Integration Section */}
          <div className="mt-3 pt-2 border-t flex items-center gap-2 flex-wrap">
            {hasIssue ? (
              <>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
                  <Github className="h-2.5 w-2.5 mr-0.5" /> Issue #{finding.githubIssueNumber ?? githubIssueResult?.issueNumber ?? '—'}
                </Badge>
                <a
                  href={finding.githubIssueUrl ?? githubIssueResult?.issueUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-emerald-600 hover:text-emerald-700 underline flex items-center gap-0.5"
                >
                  <ExternalLink className="h-2.5 w-2.5" /> View on GitHub
                </a>
                {/* Show "Add to Project" only when issue was created previously but NOT yet linked */}
                {githubProjectNumber && !finding.githubIssueUrl && githubIssueResult && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 text-[10px]"
                    disabled={addingToProject}
                    onClick={(e) => {
                      e.stopPropagation()
                      onAddToProject(String(githubIssueResult.issueId), githubProjectNumber)
                    }}
                  >
                    {addingToProject ? <LoaderCircle className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Kanban className="h-2.5 w-2.5 mr-0.5" />}
                    Add to Project #{githubProjectNumber}
                  </Button>
                )}
              </>
            ) : (
              <>
                {githubTokenStatus?.configured && githubTokenStatus.valid ? (
                  <>
                    {/* Smart single-button: Create & Link when projectNumber is set, otherwise just Create Issue */}
                    {githubProjectNumber ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 text-[10px] border-teal-500/40 text-teal-700 hover:bg-teal-500/10"
                        disabled={creatingAndLinking}
                        onClick={(e) => {
                          e.stopPropagation()
                          onCreateIssueAndLink(finding)
                        }}
                      >
                        {creatingAndLinking ? <LoaderCircle className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Link2 className="h-2.5 w-2.5 mr-0.5" />}
                        Create & Link to #{githubProjectNumber}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-5 text-[10px] border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                        disabled={creatingIssue}
                        onClick={(e) => {
                          e.stopPropagation()
                          onCreateIssue(finding)
                        }}
                      >
                        {creatingIssue ? <LoaderCircle className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Rocket className="h-2.5 w-2.5 mr-0.5" />}
                        Create Issue
                      </Button>
                    )}
                  </>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-500/40 text-orange-600">
                        <Github className="h-2.5 w-2.5 mr-0.5" /> No Token
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      Set your GitHub token in Admin → GitHub Settings to create issues
                    </TooltipContent>
                  </Tooltip>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
