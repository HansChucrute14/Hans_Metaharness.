import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGitHubConfig } from '@/lib/github-config'
import { getActiveProjectId } from '@/lib/get-active-project'
import { getTokenErrorMessage, githubApiHeaders, ensureAuditFindingLabel } from '@/lib/github-utils'
import { renderTemplate } from '@/lib/audit-utils'

function buildIssueMarkdown(body: Record<string, unknown>, projectName?: string): string {
  const { task, severity, tier, category, claim, evidence, verificationStatus, proposals, affectedFiles } = body
  const lines: string[] = []

  lines.push(`## 🔍 Audit Finding: Task ${task}`)
  lines.push('')
  lines.push(`**Severity:** ${severity} | **Tier:** ${tier} | **Category:** ${category}`)
  lines.push(`**Verification:** ${verificationStatus}`)
  lines.push('')
  lines.push('### Claim')
  lines.push(String(claim || '—'))
  lines.push('')
  lines.push('### Evidence')
  lines.push(String(evidence || '—'))
  lines.push('')

  if (affectedFiles && Array.isArray(affectedFiles) && affectedFiles.length > 0) {
    lines.push('### Affected Files')
    for (const f of affectedFiles) {
      lines.push(`- ${f}`)
    }
    lines.push('')
  }

  if (proposals && Array.isArray(proposals) && proposals.length > 0) {
    lines.push('### Solution Proposals')
    lines.push('')
    for (let i = 0; i < proposals.length; i++) {
      const p = proposals[i] as Record<string, unknown>
      lines.push(`**Proposal ${i + 1}:** ${p.title || '—'}`)
      lines.push(String(p.description || '—'))
      lines.push(`Effort: ${p.effort || '—'} | Risk: ${p.risk || '—'} | Reversible: ${p.reversible ? 'Yes' : 'No'}`)
      lines.push('')
    }
  }

  lines.push('---')
  lines.push(`*Auto-generated from ${projectName ?? 'Audit'} Comprehensive Audit Dashboard*`)

  return lines.join('\n')
}

// POST: Create a GitHub issue from a finding
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { task, title, severity, tier, category } = body as Record<string, unknown>

  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json(
      { error: 'GitHub token not configured. Save one in Admin → GitHub Configuration, or set GITHUB_TOKEN in .env.' },
      { status: 400 }
    )
  }

  const owner = config.owner
  const repo = config.repo

  // Check if an issue already exists for this task (idempotency)
  // Use composite unique projectId_task for finding lookup
  const existing = await db.finding.findUnique({ where: { projectId_task: { projectId: activeId, task: String(task) } } })

  if (existing?.githubIssueUrl) {
    return NextResponse.json({
      issueUrl: existing.githubIssueUrl,
      issueNumber: existing.githubIssueNumber,
      message: 'Issue already exists for this task',
    })
  }

  // Resolve project name for issue footer
  const project = activeId ? await db.project.findUnique({ where: { id: activeId } }) : null
  const projectName = project?.name ?? 'Audit'

  // Build issue body in markdown
  const issueBody = buildIssueMarkdown(body, projectName)

  // Build labels from finding metadata
  const labels = [
    `severity:${severity}`,
    `tier:${tier}`,
    `category:${category}`,
    'audit-finding',
  ]

  // Ensure the audit-finding label exists in the repo before creating the issue
  // GitHub returns 422 if a label doesn't exist, which breaks issue creation
  await ensureAuditFindingLabel(owner, repo, config.token)

  // Call GitHub API
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: githubApiHeaders(config.token, true),
    body: JSON.stringify({
      title: `Task ${task}: ${title}`,
      body: issueBody,
      labels,
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const error = await response.json() as Record<string, string>
    let errorMessage = error.message || 'Failed to create issue'

    // Add helpful context for common errors
    if (response.status === 401 || response.status === 403) {
      errorMessage = getTokenErrorMessage(response.status, config.token)
    } else if (response.status === 404) {
      errorMessage = `Repo ${owner}/${repo} not found (404). Check repo owner/name in GitHub Configuration. Make sure your token has access to this repo.`
    } else if (response.status === 422) {
      errorMessage = `Validation error (422): ${error.message || 'Issue creation failed. Check that labels exist in the repo.'}`
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    )
  }

  const issue = await response.json() as Record<string, unknown>

  // Update the finding in DB with GitHub issue info
  // Use composite unique if we have projectId, otherwise use id
  if (existing) {
    await db.finding.update({
      where: { id: existing.id },
      data: {
        githubIssueUrl: String(issue.html_url),
        githubIssueNumber: Number(issue.number),
        githubSyncedAt: new Date(),
      },
    })
  }

  // Log the sync event
  try {
    await db.githubSyncLog.create({
      data: {
        direction: 'push',
        action: 'create-issue',
        task: String(task),
        issueNumber: Number(issue.number),
        details: `Created GitHub issue #${issue.number} for Task ${task}`,
        success: true,
        projectId: activeId,
      },
    })
  } catch { /* ignore if model doesn't exist */ }

  return NextResponse.json({
    issueUrl: issue.html_url,
    issueNumber: issue.number,
    issueId: issue.id,
  })
}
