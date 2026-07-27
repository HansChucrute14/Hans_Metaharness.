'use client'

import { useCallback } from 'react'
import type { Finding, Severity, Tier } from '@/lib/audit-types'
import {
  severityConfig, verificationConfig, tierLabels, effortConfig, riskConfig,
  getRiskScore, getRiskLevel, riskLevelConfig,
} from '@/lib/audit-data'

/* ─── CSV EXPORT ─── */
export function exportCSV(findingsSubset: Finding[], allFindings: Finding[]) {
  const findingsToExport = findingsSubset.length > 0 ? findingsSubset : allFindings

  const headers = [
    'Task', 'Finding IDs', 'Title', 'Tier', 'Severity', 'Category',
    'Verification Status', 'Depends On', 'Risk Score', 'Risk Level',
    'Summary', 'Claim', 'Evidence', 'Verification Note',
    'Affected Files', 'Proposal 1 Title', 'Proposal 1 Effort',
    'Proposal 1 Risk', 'Proposal 1 Reversible',
    'Proposal 2 Title', 'Proposal 2 Effort',
    'Proposal 2 Risk', 'Proposal 2 Reversible',
    'Proposal 3 Title', 'Proposal 3 Effort',
    'Proposal 3 Risk', 'Proposal 3 Reversible',
  ]

  const rows = findingsToExport.map(f => {
    const riskScore = getRiskScore(f.severity, f.tier)
    const riskLevel = getRiskLevel(riskScore)
    const proposals = f.proposals.slice(0, 3)
    const proposalData: string[] = []
    for (let i = 0; i < 3; i++) {
      const p = proposals[i]
      if (p) {
        proposalData.push(
          p.title, p.effort, p.risk, String(p.reversible)
        )
      } else {
        proposalData.push('', '', '', '')
      }
    }

    return [
      String(f.task),
      f.findingIds.join(';'),
      f.title,
      tierLabels[f.tier].full,
      severityConfig[f.severity].label,
      f.category,
      verificationConfig[f.verificationStatus].label,
      f.dependsOn,
      String(riskScore),
      riskLevelConfig[riskLevel].label,
      f.summary.replace(/\n/g, ' '),
      f.claim.replace(/\n/g, ' '),
      f.evidence.replace(/\n/g, ' '),
      (f.verificationNote ?? '').replace(/\n/g, ' '),
      f.affectedFiles.join(';'),
      ...proposalData,
    ]
  })

  // CSV escaping
  const escapeCSV = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csvLines = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ]

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── PDF EXPORT (Browser Print) ─── */
export function exportPDF() {
  // Hide non-printable elements, show printable ones, trigger print dialog
  window.print()
}

export interface ProjectExportInfo {
  repoOwner: string
  repoName: string
  projectName: string
}

/* ─── Enhanced JSON Export ─── */
export function exportJSONEnhanced(findingsSubset: Finding[], allFindings: Finding[], statuses: Record<string, string>, projectInfo?: ProjectExportInfo) {
  const findingsToExport = findingsSubset.length > 0 ? findingsSubset : allFindings
  const repoOwner = projectInfo?.repoOwner ?? ''
  const repoName = projectInfo?.repoName ?? ''
  const projectName = projectInfo?.projectName ?? 'Audit Dashboard'

  const data = {
    metadata: {
      auditDate: new Date().toISOString(),
      repo: `github.com/${repoOwner}/${repoName}`,
      totalFindings: findingsToExport.length,
      totalProposals: findingsToExport.reduce((sum, f) => sum + f.proposals.length, 0),
      criticalCount: findingsToExport.filter(f => f.severity === 'critical').length,
      highCount: findingsToExport.filter(f => f.severity === 'high').length,
      mediumCount: findingsToExport.filter(f => f.severity === 'medium').length,
      lowCount: findingsToExport.filter(f => f.severity === 'low').length,
      affectedFiles: new Set(findingsToExport.flatMap(f => f.affectedFiles)).size,
    },
    statistics: {
      severityDistribution: {
        critical: findingsToExport.filter(f => f.severity === 'critical').length,
        high: findingsToExport.filter(f => f.severity === 'high').length,
        medium: findingsToExport.filter(f => f.severity === 'medium').length,
        low: findingsToExport.filter(f => f.severity === 'low').length,
      },
      verificationMethods: {
        confirmedExecution: findingsToExport.filter(f => f.verificationStatus === 'confirmed-execution').length,
        confirmedReading: findingsToExport.filter(f => f.verificationStatus === 'confirmed-reading').length,
        confirmedLogical: findingsToExport.filter(f => f.verificationStatus === 'confirmed-logical').length,
        needsExecutionConfirmation: findingsToExport.filter(f => f.verificationStatus === 'needs-execution-confirmation').length,
        partial: findingsToExport.filter(f => f.verificationStatus === 'partial').length,
      },
      categories: (() => {
        const catMap: Record<string, number> = {}
        findingsToExport.forEach(f => { catMap[f.category] = (catMap[f.category] ?? 0) + 1 })
        return catMap
      })(),
      remediationProgress: {
        notStarted: findingsToExport.filter(f => (statuses[String(f.task)] ?? 'not-started') === 'not-started').length,
        inProgress: findingsToExport.filter(f => statuses[String(f.task)] === 'in-progress').length,
        fixed: findingsToExport.filter(f => statuses[String(f.task)] === 'fixed').length,
        wontFix: findingsToExport.filter(f => statuses[String(f.task)] === 'wont-fix').length,
      },
    },
    findings: findingsToExport.map(f => ({
      task: f.task,
      findingIds: f.findingIds,
      title: f.title,
      tier: tierLabels[f.tier].full,
      severity: severityConfig[f.severity].label,
      category: f.category,
      verification: verificationConfig[f.verificationStatus].label,
      riskScore: getRiskScore(f.severity, f.tier),
      riskLevel: riskLevelConfig[getRiskLevel(getRiskScore(f.severity, f.tier))].label,
      dependsOn: f.dependsOn,
      summary: f.summary,
      claim: f.claim,
      evidence: f.evidence,
      verificationNote: f.verificationNote,
      affectedFiles: f.affectedFiles,
      remediationStatus: statuses[String(f.task)] ?? 'not-started',
      proposals: f.proposals.map(p => ({
        title: p.title,
        description: p.description,
        effort: p.effort,
        risk: p.risk,
        reversible: p.reversible,
      })),
      codeSnippets: f.codeSnippets?.map(s => ({
        file: s.file,
        lines: s.lines,
        language: s.language,
        code: s.code,
      })) ?? [],
    })),
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName ?? 'audit'}-enhanced-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/* ─── Enhanced Markdown Export ─── */
export function exportMarkdownEnhanced(findingsSubset: Finding[], allFindings: Finding[], statuses: Record<string, string>, projectInfo?: ProjectExportInfo) {
  const findingsToExport = findingsSubset.length > 0 ? findingsSubset : allFindings
  const repoOwner = projectInfo?.repoOwner ?? ''
  const repoName = projectInfo?.repoName ?? ''
  const projectName = projectInfo?.projectName ?? 'Audit Dashboard'
  const lines: string[] = []

  lines.push(`# ${projectName} — Comprehensive Audit Report`)
  lines.push('')
  lines.push(`**Audit Date:** ${new Date().toISOString().split('T')[0]}`)
  lines.push(`**Repository:** github.com/${repoOwner}/${repoName}`)
  lines.push(`**Total Findings:** ${findingsToExport.length}`)
  lines.push(`**Critical:** ${findingsToExport.filter(f => f.severity === 'critical').length}`)
  lines.push(`**High:** ${findingsToExport.filter(f => f.severity === 'high').length}`)
  lines.push(`**Medium:** ${findingsToExport.filter(f => f.severity === 'medium').length}`)
  lines.push(`**Low:** ${findingsToExport.filter(f => f.severity === 'low').length}`)
  lines.push('')

  // Summary table
  lines.push('## Summary Statistics')
  lines.push('')
  lines.push('| Severity | Count | Verification | Count |')
  lines.push('|----------|-------|--------------|-------|')
  const severities: Severity[] = ['critical', 'high', 'medium', 'low']
  const verStatuses = ['confirmed-execution', 'confirmed-reading', 'confirmed-logical', 'needs-execution-confirmation', 'partial'] as const
  for (let i = 0; i < Math.max(severities.length, verStatuses.length); i++) {
    const sev = severities[i]
    const ver = verStatuses[i]
    const sevCol = sev ? `${severityConfig[sev].label} | ${findingsToExport.filter(f => f.severity === sev).length}` : '|'
    const verCol = ver ? `${verificationConfig[ver].label} | ${findingsToExport.filter(f => f.verificationStatus === ver).length}` : '|'
    lines.push(`| ${sevCol.split('|')[0]} | ${sevCol.split('|')[1]} | ${verCol.split('|')[0]} | ${verCol.split('|')[1]} |`)
  }
  lines.push('')

  // Remediation progress
  lines.push('## Remediation Progress')
  lines.push('')
  lines.push('| Status | Count | Percentage |')
  lines.push('|--------|-------|------------|')
  const total = findingsToExport.length
  const notStarted = findingsToExport.filter(f => (statuses[String(f.task)] ?? 'not-started') === 'not-started').length
  const inProgress = findingsToExport.filter(f => statuses[String(f.task)] === 'in-progress').length
  const fixed = findingsToExport.filter(f => statuses[String(f.task)] === 'fixed').length
  const wontFix = findingsToExport.filter(f => statuses[String(f.task)] === 'wont-fix').length
  lines.push(`| Not Started | ${notStarted} | ${Math.round(notStarted / total * 100)}% |`)
  lines.push(`| In Progress | ${inProgress} | ${Math.round(inProgress / total * 100)}% |`)
  lines.push(`| Fixed | ${fixed} | ${Math.round(fixed / total * 100)}% |`)
  lines.push(`| Won't Fix | ${wontFix} | ${Math.round(wontFix / total * 100)}% |`)
  lines.push('')

  lines.push('---')
  lines.push('')

  // Detailed findings
  const tiers: Tier[] = ['tier0', 'tier1', 'tier2', 'additional', 'deferred']
  for (const tier of tiers) {
    const inTier = findingsToExport.filter(f => f.tier === tier)
    if (inTier.length === 0) continue
    lines.push(`## ${tierLabels[tier].full}`)
    lines.push('')

    inTier.forEach(f => {
      const riskScore = getRiskScore(f.severity, f.tier)
      const riskLevel = getRiskLevel(riskScore)
      lines.push(`### Task ${f.task}: ${f.title}`)
      lines.push('')
      lines.push(`| Field | Value |`)
      lines.push(`|-------|-------|`)
      lines.push(`| Finding IDs | ${f.findingIds.join(', ')} |`)
      lines.push(`| Severity | ${severityConfig[f.severity].label} |`)
      lines.push(`| Verification | ${verificationConfig[f.verificationStatus].label} |`)
      lines.push(`| Category | ${f.category} |`)
      lines.push(`| Tier | ${tierLabels[f.tier].full} |`)
      lines.push(`| Depends on | ${f.dependsOn} |`)
      lines.push(`| Risk Score | ${riskScore}/6 (${riskLevelConfig[riskLevel].label}) |`)
      lines.push(`| Status | ${statuses[String(f.task)] ?? 'not-started'} |`)
      lines.push(`| Affected Files | ${f.affectedFiles.join(', ')} |`)
      lines.push('')

      lines.push(`**Summary:** ${f.summary}`)
      lines.push('')
      lines.push(`**Claim:** ${f.claim}`)
      lines.push('')
      lines.push(`**Evidence:** ${f.evidence}`)
      lines.push('')
      if (f.verificationNote) {
        lines.push(`**Verification Note:** ${f.verificationNote}`)
        lines.push('')
      }

      lines.push('#### Solution Proposals')
      lines.push('')
      lines.push('| # | Title | Effort | Risk | Reversible | Description |')
      lines.push('|---|-------|--------|------|------------|-------------|')
      f.proposals.forEach((p, i) => {
        lines.push(`| ${i + 1} | ${p.title} | ${p.effort} | ${p.risk} | ${p.reversible ? '✓' : '✗'} | ${p.description.slice(0, 80)}… |`)
      })
      lines.push('')

      if (f.codeSnippets && f.codeSnippets.length > 0) {
        lines.push('#### Code Evidence')
        lines.push('')
        f.codeSnippets.forEach(s => {
          lines.push(`**${s.file}:${s.lines}** (${s.language})`)
          lines.push('')
          lines.push('```' + s.language)
          lines.push(s.code)
          lines.push('```')
          lines.push('')
        })
      }

      lines.push('---')
      lines.push('')
    })
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName ?? 'audit'}-enhanced-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}
