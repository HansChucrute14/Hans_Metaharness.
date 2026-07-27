import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGitHubConfig } from '@/lib/github-config'
import { getActiveProjectId } from '@/lib/get-active-project'
import { getTokenErrorMessage, githubApiHeaders } from '@/lib/github-utils'

// GET: List existing issues from the repo that match audit findings
export async function GET(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json({
      error: 'GitHub token not configured. Save one in Admin → GitHub Configuration.',
      hint: 'Token is stored in database and works immediately — no server restart needed.',
    }, { status: 400 })
  }

  const owner = config.owner
  const repo = config.repo

  // Fetch all issues and filter in code — using labels=audit-finding in the query
  // returns empty results if the label doesn't exist in the repo yet
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`,
    {
      headers: githubApiHeaders(config.token),
      signal: AbortSignal.timeout(30000),
    }
  )

  if (!response.ok) {
    const error = await response.json() as Record<string, string>
    const errorMessage = getTokenErrorMessage(response.status, config.token) || error.message || 'Failed to fetch issues from GitHub'
    return NextResponse.json(
      { error: errorMessage },
      { status: response.status }
    )
  }

  const allIssues = await response.json() as Record<string, unknown>[]

  // Filter: only include issues that are audit-related (have audit-finding label or [audit-finding] in title)
  const issues = allIssues.filter(issue => {
    const labels = ((issue.labels as Record<string, unknown>[] || [])).map(l => String((l as Record<string, unknown>).name ?? l))
    const title = String(issue.title || '')
    return labels.includes('audit-finding') || title.includes('[audit-finding]')
  })

  // Map issues to finding tasks by parsing title
  const mapped = issues.map(issue => {
    const title = String(issue.title || '')
    const taskMatch = title.match(/Task (\d+|X\d+|D-\w+):/)
    return {
      issueNumber: Number(issue.number),
      issueUrl: String(issue.html_url),
      nodeId: String(issue.node_id),
      task: taskMatch ? taskMatch[1] : null,
      state: String(issue.state),
      labels: ((issue.labels as Record<string, unknown>[] || [])).map(l => String((l as Record<string, unknown>).name ?? l)),
      createdAt: String(issue.created_at),
      updatedAt: String(issue.updated_at),
    }
  })

  // Cross-reference with findings in DB
  const findings = await db.finding.findMany({
    where: { projectId: activeId },
    select: { task: true, githubIssueUrl: true, githubIssueNumber: true },
  })

  const findingsWithIssues = findings.filter(f => f.githubIssueUrl !== null).length
  const totalFindings = findings.length

  return NextResponse.json({
    issues: mapped,
    sync: {
      totalFindings,
      findingsWithIssues,
      githubIssuesFound: mapped.length,
      unmatched: mapped.filter(i => !findings.some(f => f.githubIssueNumber === i.issueNumber)),
    },
  })
}
