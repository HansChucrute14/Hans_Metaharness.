import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getGitHubConfig } from '@/lib/github-config'
import { getActiveProjectId } from '@/lib/get-active-project'
import { getTokenErrorMessage, githubApiHeaders, ensureLabelsExist } from '@/lib/github-utils'

// ── Bidirectional GitHub Sync ──
// Pulls changes from GitHub (issue state changes, comments, labels)
// back into the local audit findings, creating true bidirectional sync.
// Now supports multi-project filtering.

// GET: Pull recent changes from GitHub issues and sync with local findings
export async function GET(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json({
      error: 'GitHub token not configured. Save one in Admin → GitHub Configuration, or set GITHUB_TOKEN in .env.',
      hint: 'Unlike the old approach (writing to .env requiring server restart), the token is now stored in the database and takes effect immediately.',
    }, { status: 400 })
  }

  const owner = config.owner
  const repo = config.repo

  try {
    // 1. Fetch all issues from the repo
    const issuesRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`,
      {
        headers: githubApiHeaders(config.token),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!issuesRes.ok) {
      const errorBody = await issuesRes.json() as Record<string, string>
      const errorMessage = getTokenErrorMessage(issuesRes.status, config.token) || errorBody.message || 'Failed to fetch issues from GitHub'
      return NextResponse.json(
        { error: errorMessage },
        { status: issuesRes.status }
      )
    }

    const allIssues = await issuesRes.json() as Record<string, unknown>[]

    // Filter: only include issues that are audit-related
    const issues = allIssues.filter(issue => {
      const labels = ((issue.labels as Record<string, unknown>[] || [])).map(l => String((l as Record<string, unknown>).name ?? l))
      const title = String(issue.title || '')
      return labels.includes('audit-finding') || title.includes('[audit-finding]')
    })

    // 2. Fetch all local findings with GitHub data (filtered by project)
    const findings = await db.finding.findMany({
      where: { projectId: activeId },
      select: {
        id: true,
        task: true,
        title: true,
        githubIssueUrl: true,
        githubIssueNumber: true,
        githubSyncedAt: true,
      },
    })

    const syncResults: Array<{
      task: string
      issueNumber: number
      changeType: string
      details: string
      localUpdated: boolean
    }> = []

    // 3. Map GitHub changes to local findings
    for (const issue of issues) {
      const title = String(issue.title || '')
      const taskMatch = title.match(/Task (\d+|X\d+|D-\w+):/)
      const task = taskMatch ? taskMatch[1] : null
      const issueNumber = Number(issue.number)
      const issueState = String(issue.state)
      const issueLabels = ((issue.labels as Record<string, unknown>[] || [])).map(l => String(l.name || l))
      const updatedAt = String(issue.updated_at)

      // Match to local finding
      const matchingFinding = findings.find(f =>
        f.githubIssueNumber === issueNumber ||
        (task && f.task === task)
      )

      if (!matchingFinding) {
        syncResults.push({
          task: task ?? `issue-${issueNumber}`,
          issueNumber,
          changeType: 'unmatched',
          details: `GitHub issue #${issueNumber} does not match any local finding`,
          localUpdated: false,
        })
        continue
      }

      // Check if there are updates since last sync
      const lastSync = matchingFinding.githubSyncedAt
      const githubUpdated = new Date(updatedAt)
      const needsSync = !lastSync || githubUpdated > new Date(lastSync)

      if (!needsSync) {
        continue
      }

      // Sync issue state → finding status
      let newStatus: string | null = null
      if (issueState === 'closed') {
        if (issueLabels.includes('wont-fix')) {
          newStatus = 'wont-fix'
        } else {
          newStatus = 'fixed'
        }
      } else if (issueState === 'open') {
        if (issueLabels.includes('in-progress')) {
          newStatus = 'in-progress'
        }
      }

      // Update local finding
      const updateData: Record<string, unknown> = {
        githubSyncedAt: new Date(),
      }

      if (!matchingFinding.githubIssueUrl) {
        updateData.githubIssueUrl = String(issue.html_url)
        updateData.githubIssueNumber = issueNumber
      }

      try {
        await db.finding.update({
          where: { id: matchingFinding.id },
          data: updateData,
        })

        if (newStatus) {
          // AuditNote uses findingId FK (not task)
          const existingNote = await db.auditNote.findFirst({
            where: { findingId: matchingFinding.id },
          })

          if (existingNote) {
            if (existingNote.status !== newStatus) {
              await db.auditNote.update({
                where: { id: existingNote.id },
                data: {
                  status: newStatus,
                  note: existingNote.note
                    ? `${existingNote.note}\n\n[GitHub Sync] Issue #${issueNumber} state changed to "${issueState}" on ${new Date(updatedAt).toLocaleDateString()}`
                    : `[GitHub Sync] Issue #${issueNumber} state changed to "${issueState}" on ${new Date(updatedAt).toLocaleDateString()}`,
                },
              })
            }
          } else {
            await db.auditNote.create({
              data: {
                findingId: matchingFinding.id,
                status: newStatus,
                note: `[GitHub Sync] Created from GitHub issue #${issueNumber} state "${issueState}"`,
              },
            })
          }
        }

        syncResults.push({
          task: matchingFinding.task,
          issueNumber,
          changeType: 'synced',
          details: `GitHub issue #${issueNumber} synced. State: ${issueState}${newStatus ? `, Status updated to: ${newStatus}` : ', No status change needed'}`,
          localUpdated: true,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update finding'
        syncResults.push({
          task: matchingFinding.task,
          issueNumber,
          changeType: 'error',
          details: `Failed to update finding: ${message}`,
          localUpdated: false,
        })
      }
    }

    // Check for local findings without GitHub issues
    const findingsWithoutIssues = findings.filter(f => !f.githubIssueUrl && !f.githubIssueNumber)
    for (const finding of findingsWithoutIssues) {
      syncResults.push({
        task: finding.task,
        issueNumber: 0,
        changeType: 'no-issue',
        details: `Finding Task ${finding.task}: "${finding.title}" has no linked GitHub issue`,
        localUpdated: false,
      })
    }

    return NextResponse.json({
      syncResults,
      summary: {
        totalGitHubIssues: issues.length,
        matchedFindings: findings.filter(f => f.githubIssueUrl).length,
        unmatchedIssues: syncResults.filter(r => r.changeType === 'unmatched').length,
        syncedFindings: syncResults.filter(r => r.localUpdated).length,
        findingsWithoutIssues: findingsWithoutIssues.length,
        errors: syncResults.filter(r => r.changeType === 'error').length,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST: Push local finding changes to GitHub (create/update issues)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { tasks, action, projectId } = body as { tasks?: string[]; action?: string; projectId?: string }

  if (!tasks || !action) {
    return NextResponse.json({ error: 'tasks and action are required' }, { status: 400 })
  }

  const activeId = projectId ?? await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json({
      error: 'GitHub token not configured. Save one in Admin → GitHub Configuration.',
      hint: 'Token is stored in database and takes effect immediately — no server restart needed.',
    }, { status: 400 })
  }

  const owner = config.owner
  const repo = config.repo

  // Resolve 'all' pseudo-task to all actual finding task IDs
  let resolvedTasks = tasks
  if (tasks.includes('all')) {
    const allFindings = await db.finding.findMany({ where: { projectId: activeId }, select: { task: true } })
    resolvedTasks = allFindings.map(f => f.task)
  }

  // Resolve project name for issue footer
  const project = activeId ? await db.project.findUnique({ where: { id: activeId } }) : null
  const projectName = project?.name ?? 'Audit'

  const results: Array<{ task: string; success: boolean; message: string }> = []

  for (const task of resolvedTasks) {
    // Use composite unique projectId_task for finding lookup
    const finding = await db.finding.findUnique({
      where: { projectId_task: { projectId: activeId, task } },
      include: { proposals: { orderBy: { index: 'asc' } } },
    })

    if (!finding) {
      results.push({ task, success: false, message: `Finding ${task} not found` })
      continue
    }

    if (action === 'create-issue') {
      if (finding.githubIssueUrl) {
        results.push({ task, success: false, message: `Finding ${task} already has GitHub issue #${finding.githubIssueNumber}` })
        continue
      }

      // Ensure all labels exist before creating the issue
      const requiredLabels = ['audit-finding', `severity:${finding.severity}`, `tier:${finding.tier}`]
      const labelResult = await ensureLabelsExist(owner, repo, config.token, requiredLabels)
      const validLabels = requiredLabels.filter(name => !labelResult.failed.includes(name))

      const issueBody = [
        `## Audit Finding: Task ${finding.task}`,
        '',
        `**Severity:** ${finding.severity}`,
        `**Tier:** ${finding.tier}`,
        `**Category:** ${finding.category}`,
        `**Verification:** ${finding.verificationStatus}`,
        '',
        `### Claim`,
        finding.claim,
        '',
        `### Evidence`,
        finding.evidence,
        '',
        `### Affected Files`,
        finding.affectedFiles ? JSON.parse(finding.affectedFiles).join('\n') : 'N/A',
        '',
        `### Solution Proposals`,
        ...finding.proposals.map((p, i) =>
          `${i + 1}. **${p.title}** (Effort: ${p.effort}, Risk: ${p.risk})\n   ${p.description}`
        ),
        '',
        '---',
        `*This issue was auto-created from the ${projectName ?? 'Audit'} dashboard.*`,
      ].join('\n')

      const createRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues`,
        {
          method: 'POST',
          headers: githubApiHeaders(config.token, true),
          body: JSON.stringify({
            title: `Task ${finding.task}: ${finding.title} [audit-finding]`,
            body: issueBody,
            labels: validLabels,
          }),
          signal: AbortSignal.timeout(30000),
        }
      )

      if (!createRes.ok) {
        const err = await createRes.json() as Record<string, string>
        const errorMessage = getTokenErrorMessage(createRes.status, config.token) || err.message || 'Failed to create issue'
        results.push({ task, success: false, message: errorMessage })
        continue
      }

      const issueData = await createRes.json() as Record<string, unknown>
      const issueNumber = Number(issueData.number)
      const issueUrl = String(issueData.html_url)

      // Update finding using its id (not composite unique)
      await db.finding.update({
        where: { id: finding.id },
        data: {
          githubIssueUrl: issueUrl,
          githubIssueNumber: issueNumber,
          githubSyncedAt: new Date(),
        },
      })

      try {
        await db.githubSyncLog.create({
          data: {
            direction: 'push',
            action: 'create-issue',
            task,
            issueNumber,
            details: `Created issue #${issueNumber}: ${issueUrl}`,
            success: true,
            projectId: activeId,
          },
        })
      } catch { /* ignore */ }

      results.push({ task, success: true, message: `Created issue #${issueNumber}: ${issueUrl}` })
    } else if (action === 'update-status') {
      if (!finding.githubIssueNumber) {
        results.push({ task, success: false, message: `Finding ${task} has no linked GitHub issue` })
        continue
      }

      // AuditNote uses findingId FK (not task)
      const auditNote = await db.auditNote.findFirst({
        where: { findingId: finding.id },
      })
      const localStatus = auditNote?.status ?? 'not-started'

      let newState: string
      if (localStatus === 'fixed' || localStatus === 'wont-fix') {
        newState = 'closed'
      } else {
        newState = 'open'
      }

      // Ensure all labels exist before updating the issue with labels
      const updateLabels = ['audit-finding', `severity:${finding.severity}`, `tier:${finding.tier}`, `status:${localStatus}`]
      const labelResult = await ensureLabelsExist(owner, repo, config.token, updateLabels)
      const validUpdateLabels = updateLabels.filter(name => !labelResult.failed.includes(name))

      const updateRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${finding.githubIssueNumber}`,
        {
          method: 'PATCH',
          headers: githubApiHeaders(config.token, true),
          body: JSON.stringify({
            state: newState,
            labels: validUpdateLabels,
          }),
          signal: AbortSignal.timeout(15000),
        }
      )

      if (!updateRes.ok) {
        const err = await updateRes.json() as Record<string, string>
        const errorMessage = getTokenErrorMessage(updateRes.status, config.token) || err.message || 'Failed to update issue'
        results.push({ task, success: false, message: errorMessage })
        continue
      }

      await db.finding.update({
        where: { id: finding.id },
        data: { githubSyncedAt: new Date() },
      })

      results.push({ task, success: true, message: `Updated issue #${finding.githubIssueNumber} state to "${newState}"` })
    }
  }

  return NextResponse.json({
    results,
    summary: {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    },
    timestamp: new Date().toISOString(),
  })
}
