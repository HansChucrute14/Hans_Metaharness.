'use client'

import { useMemo, useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Button,
} from '@/components/ui/button'
import {
  Card, CardContent,
} from '@/components/ui/card'
import {
  Search, X, FileCode2, AlertTriangle, ShieldAlert, Bug, Layers,
  Highlighter,
} from 'lucide-react'
import type { Finding, Severity } from '@/lib/audit-types'
import {
  severityConfig, verificationConfig, tierLabels, getCategoryColor,
} from '@/lib/audit-data'

const severityColors: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

/**
 * HighlightSearchText: Renders text with search matches highlighted.
 */
export function HighlightSearchText({
  text,
  query,
  maxLines = 3,
}: {
  text: string
  query: string
  maxLines?: number
}) {
  if (!query.trim()) {
    const lines = text.split('\n').slice(0, maxLines)
    return <>{lines.join('\n')}</>
  }

  const q = query.toLowerCase()
  const parts: { text: string; isMatch: boolean }[] = []
  let remaining = text
  let searchIndex = 0

  while (remaining.length > 0) {
    const idx = remaining.toLowerCase().indexOf(q, searchIndex)
    if (idx === -1) {
      parts.push({ text: remaining, isMatch: false })
      break
    }
    if (idx > 0) {
      parts.push({ text: remaining.slice(0, idx), isMatch: false })
    }
    parts.push({ text: remaining.slice(idx, idx + q.length), isMatch: true })
    remaining = remaining.slice(idx + q.length)
    searchIndex = 0
  }

  return (
    <>
      {parts.map((part, i) =>
        part.isMatch ? (
          <mark key={i} className="bg-amber-400/30 dark:bg-amber-400/50 text-inherit rounded px-0.5 font-semibold">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

/**
 * SearchResultsPreview: Shows a preview of search results with match counts per field.
 */
export function SearchResultsPreview({
  findings,
  query,
  onJumpToFinding,
}: {
  findings: Finding[]
  query: string
  onJumpToFinding: (finding: Finding) => void
}) {
  const q = query.toLowerCase()

  const matchData = useMemo(() => {
    if (!query.trim()) return []

    return findings.map(f => {
      const matches: { field: string; count: number; preview: string }[] = []

      // Title
      if (f.title.toLowerCase().includes(q)) {
        matches.push({ field: 'Title', count: 1, preview: f.title })
      }

      // Summary
      const summaryMatches = (f.summary.toLowerCase().match(new RegExp(q, 'g')) ?? []).length
      if (summaryMatches > 0) {
        matches.push({ field: 'Summary', count: summaryMatches, preview: f.summary })
      }

      // Claim
      const claimMatches = (f.claim.toLowerCase().match(new RegExp(q, 'g')) ?? []).length
      if (claimMatches > 0) {
        matches.push({ field: 'Claim', count: claimMatches, preview: f.claim })
      }

      // Evidence
      const evidenceMatches = (f.evidence.toLowerCase().match(new RegExp(q, 'g')) ?? []).length
      if (evidenceMatches > 0) {
        matches.push({ field: 'Evidence', count: evidenceMatches, preview: f.evidence })
      }

      // Category
      if (f.category.toLowerCase().includes(q)) {
        matches.push({ field: 'Category', count: 1, preview: f.category })
      }

      // Finding IDs
      if (f.findingIds.some(id => id.toLowerCase().includes(q))) {
        matches.push({ field: 'Finding IDs', count: f.findingIds.filter(id => id.toLowerCase().includes(q)).length, preview: f.findingIds.join(', ') })
      }

      // Task number
      if (String(f.task).toLowerCase().includes(q)) {
        matches.push({ field: 'Task', count: 1, preview: `Task ${f.task}` })
      }

      // Affected files
      const fileMatches = f.affectedFiles.filter(file => file.toLowerCase().includes(q))
      if (fileMatches.length > 0) {
        matches.push({ field: 'Affected Files', count: fileMatches.length, preview: fileMatches.join(', ') })
      }

      // Proposals
      const proposalMatches = f.proposals.filter(p =>
        p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      )
      if (proposalMatches.length > 0) {
        matches.push({ field: 'Proposals', count: proposalMatches.length, preview: proposalMatches.map(p => p.title).join(', ') })
      }

      // Code snippets
      const snippetMatches = (f.codeSnippets ?? []).filter(s => s.code.toLowerCase().includes(q))
      if (snippetMatches.length > 0) {
        matches.push({ field: 'Code', count: snippetMatches.length, preview: snippetMatches[0].code })
      }

      const totalMatches = matches.reduce((sum, m) => sum + m.count, 0)

      return { finding: f, matches, totalMatches }
    }).filter(d => d.totalMatches > 0)
      .sort((a, b) => b.totalMatches - a.totalMatches)
      .slice(0, 8)
  }, [findings, query])

  if (!query.trim() || matchData.length === 0) return null

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Highlighter className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Search Matches ({matchData.length} findings)
          </span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-custom">
          {matchData.map(({ finding, matches, totalMatches }) => (
            <motion.button
              key={String(finding.task)}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full text-left p-2 rounded-md border bg-card/50 hover:bg-card/80 transition-colors flex items-start gap-2"
              onClick={() => onJumpToFinding(finding)}
            >
              <div className="flex-shrink-0">
                <Badge
                  className={`${severityConfig[finding.severity].bg} ${severityConfig[finding.severity].text} text-[9px] border`}
                >
                  Task {finding.task}
                </Badge>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">
                  <HighlightSearchText text={finding.title} query={query} maxLines={1} />
                </div>
                <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                  <Badge variant="secondary" className="text-[9px] h-4 px-1">
                    {totalMatches} matches
                  </Badge>
                  {matches.slice(0, 3).map(m => (
                    <span key={m.field} className="text-[9px]">
                      {m.field}: {m.count}
                    </span>
                  ))}
                </div>
                {/* Show first matching preview */}
                {matches[0] && (
                  <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                    <HighlightSearchText text={matches[0].preview} query={query} maxLines={2} />
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
