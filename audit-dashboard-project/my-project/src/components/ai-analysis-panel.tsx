'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent,
} from '@/components/ui/card'
import {
  Button,
} from '@/components/ui/button'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Skeleton,
} from '@/components/ui/skeleton'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BrainCircuit, RefreshCw, Copy, Check, ChevronDown,
  Search, AlertTriangle, Wrench, FlaskConical, GitBranch,
  Clock,
} from 'lucide-react'
import { type Finding, useAIAnalysis } from '@/lib/use-findings'

/* ─── Parsed section renderer ─── */
interface AnalysisSection {
  title: string
  icon: React.ReactNode
  content: string
}

function parseAnalysisSections(raw: string): AnalysisSection[] {
  const iconMap: Record<string, React.ReactNode> = {
    'Root Cause Analysis': <Search className="h-4 w-4" />,
    'Impact Assessment': <AlertTriangle className="h-4 w-4" />,
    'Recommended Fix Strategy': <Wrench className="h-4 w-4" />,
    'Testing Strategy': <FlaskConical className="h-4 w-4" />,
    'Dependency Risks': <GitBranch className="h-4 w-4" />,
  }

  const sections: AnalysisSection[] = []

  // Split by numbered bold headers (1. **Title**: or 1. **Title**)
  const lines = raw.split('\n')
  let currentTitle = ''
  let currentContent: string[] = []

  for (const line of lines) {
    // Check for section headers like "1. **Title**:" or "**1. Title**:"
    const headerMatch = line.match(/^\d+\.\s*\*{1,2}(.*?)\*{1,2}\s*:/)
    if (headerMatch) {
      if (currentTitle && currentContent.length > 0) {
        sections.push({
          title: currentTitle,
          icon: iconMap[currentTitle] ?? <BrainCircuit className="h-4 w-4" />,
          content: currentContent.join('\n').trim(),
        })
      }
      currentTitle = headerMatch[1].trim()
      currentContent = []
    } else {
      currentContent.push(line)
    }
  }

  // Push the last section
  if (currentTitle && currentContent.length > 0) {
    sections.push({
      title: currentTitle,
      icon: iconMap[currentTitle] ?? <BrainCircuit className="h-4 w-4" />,
      content: currentContent.join('\n').trim(),
    })
  }

  // If parsing failed (no sections found), return the raw text as a single section
  if (sections.length === 0) {
    sections.push({
      title: 'AI Analysis',
      icon: <BrainCircuit className="h-4 w-4" />,
      content: raw.trim(),
    })
  }

  return sections
}

const SECTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'Root Cause Analysis': { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-700 dark:text-orange-300' },
  'Impact Assessment': { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-700 dark:text-red-300' },
  'Recommended Fix Strategy': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-700 dark:text-emerald-300' },
  'Testing Strategy': { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-700 dark:text-teal-300' },
  'Dependency Risks': { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-700 dark:text-amber-300' },
}

/* ─── Main AI Analysis Panel ─── */
export function AIAnalysisPanel({
  finding,
  onAnalysisComplete,
}: {
  finding: Finding
  onAnalysisComplete?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [cachedAnalysis, setCachedAnalysis] = useState<string | null>(null)
  const [cachedTimestamp, setCachedTimestamp] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const aiMutation = useAIAnalysis()

  // Load cached analysis from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(`ai-analysis-${finding.task}`)
      if (cached) {
        const data = JSON.parse(cached) as { analysis: string; timestamp: string }
        requestAnimationFrame(() => {
          setCachedAnalysis(data.analysis)
          setCachedTimestamp(data.timestamp)
        })
      }
    } catch { /* ignore */ }
  }, [finding.task])

  // Save analysis to localStorage when mutation succeeds
  useEffect(() => {
    if (aiMutation.isSuccess && aiMutation.data) {
      const analysisText = aiMutation.data.analysis
      const timestamp = new Date().toISOString()
      requestAnimationFrame(() => {
        setCachedAnalysis(analysisText)
        setCachedTimestamp(timestamp)
      })
      try {
        localStorage.setItem(`ai-analysis-${finding.task}`, JSON.stringify({ analysis: analysisText, timestamp }))
      } catch { /* ignore quota errors */ }
      onAnalysisComplete?.()
    }
  }, [aiMutation.isSuccess, aiMutation.data, finding.task, onAnalysisComplete])

  const handleAnalyze = useCallback(() => {
    aiMutation.mutate({
      task: finding.task,
      title: finding.title,
      claim: finding.claim,
      evidence: finding.evidence,
      proposals: finding.proposals,
      affectedFiles: finding.affectedFiles,
      severity: finding.severity,
      tier: finding.tier,
    })
  }, [aiMutation, finding])

  const handleRefresh = useCallback(() => {
    // Clear cache and re-run
    try {
      localStorage.removeItem(`ai-analysis-${finding.task}`)
    } catch { /* ignore */ }
    setCachedAnalysis(null)
    setCachedTimestamp(null)
    handleAnalyze()
  }, [handleAnalyze, finding.task])

  const handleCopy = useCallback(async () => {
    const textToCopy = cachedAnalysis ?? ''
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* fallback */ }
  }, [cachedAnalysis])

  const displayAnalysis = cachedAnalysis ?? (aiMutation.isPending ? null : aiMutation.data?.analysis ?? null)
  const isLoading = aiMutation.isPending && !cachedAnalysis
  const hasError = aiMutation.isError && !cachedAnalysis
  const hasAnalysis = !!displayAnalysis

  const sections = hasAnalysis ? parseAnalysisSections(displayAnalysis) : []

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-3">
      <div className="flex items-center gap-1.5 no-print">
        <CollapsibleTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[11px] border-teal-500/40 text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <BrainCircuit className="h-3 w-3" />
            🤖 AI Analysis
            {hasAnalysis && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 ml-1">
                Cached
              </Badge>
            )}
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>

        {hasAnalysis && isOpen && (
          <div className="flex items-center gap-1 ml-auto">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => { e.stopPropagation(); handleRefresh() }}
                    disabled={aiMutation.isPending}
                  >
                    <RefreshCw className={`h-3 w-3 ${aiMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh analysis</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => { e.stopPropagation(); handleCopy() }}
                  >
                    {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? 'Copied!' : 'Copy analysis'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      <CollapsibleContent>
        <AnimatePresence mode="wait">
          {isLoading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-2"
            >
              <Card className="border-teal-500/20 bg-teal-500/5">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit className="h-4 w-4 text-teal-600 animate-pulse" />
                    <span className="text-sm font-medium text-teal-700 dark:text-teal-300">Analyzing with AI...</span>
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {hasError && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-2"
            >
              <Card className="border-red-500/30 bg-red-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Analysis failed</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {aiMutation.error?.message ?? 'An unexpected error occurred. Please try again.'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-6 text-[11px]"
                    onClick={(e) => { e.stopPropagation(); handleAnalyze() }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Retry
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {!hasAnalysis && !isLoading && !hasError && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-2"
            >
              <Card className="border-teal-500/20 bg-teal-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <BrainCircuit className="h-5 w-5 text-teal-600" />
                    <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
                      AI-Powered Analysis
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Get intelligent insights about this finding — root cause analysis, impact assessment, recommended fix strategy, testing strategy, and dependency risks.
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                    onClick={(e) => { e.stopPropagation(); handleAnalyze() }}
                    disabled={aiMutation.isPending}
                  >
                    {aiMutation.isPending ? (
                      <>
                        <BrainCircuit className="h-3 w-3 mr-1 animate-pulse" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <BrainCircuit className="h-3 w-3 mr-1" />
                        Analyze with AI
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {hasAnalysis && !isLoading && (
            <motion.div
              key="analysis"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-2"
            >
              <Card className="border-teal-500/20 bg-teal-500/5">
                <CardContent className="p-4 space-y-3">
                  {/* Header with timestamp */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-teal-600" />
                      <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
                        AI Analysis
                      </span>
                    </div>
                    {cachedTimestamp && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(cachedTimestamp).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Render parsed sections */}
                  {sections.map((section, idx) => {
                    const colors = SECTION_COLORS[section.title] ?? { bg: 'bg-muted/60', border: 'border-border', text: '' }
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={`${colors.bg} ${colors.border} border rounded-md p-3`}
                      >
                        <div className={`text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${colors.text}`}>
                          {section.icon}
                          {section.title}
                        </div>
                        <div className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                          {section.content}
                        </div>
                      </motion.div>
                    )
                  })}

                  {/* Actions footer */}
                  <div className="flex items-center gap-2 pt-2 border-t border-teal-500/10">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px] border-teal-500/30 text-teal-700 hover:bg-teal-500/10"
                      onClick={(e) => { e.stopPropagation(); handleRefresh() }}
                      disabled={aiMutation.isPending}
                    >
                      <RefreshCw className={`h-3 w-3 mr-0.5 ${aiMutation.isPending ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); handleCopy() }}
                    >
                      {copied ? <Check className="h-3 w-3 mr-0.5 text-emerald-500" /> : <Copy className="h-3 w-3 mr-0.5" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </CollapsibleContent>
    </Collapsible>
  )
}
