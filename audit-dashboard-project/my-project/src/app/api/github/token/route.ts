import { NextRequest, NextResponse } from 'next/server'
import {
  getGitHubConfig,
  saveGitHubConfigValue,
  deleteGitHubConfigValue,
  invalidateGitHubConfigCache,
  listGitHubConfigValues,
} from '@/lib/github-config'
import { getTokenErrorMessage, githubApiHeaders, detectTokenType, verifyTokenFullAccess } from '@/lib/github-utils'
import { getActiveProjectId } from '@/lib/get-active-project'

// GET: Check if token is configured and valid (3-step verification)
export async function GET(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)

  if (!config.token) {
    return NextResponse.json({
      configured: false,
      valid: false,
      message: 'No GitHub token configured. Save one in Admin → GitHub Configuration, or set GITHUB_TOKEN in .env.',
      source: 'none',
    })
  }

  // 3-step verification: user auth → repo access → issue access
  const verification = await verifyTokenFullAccess(config.token, config.owner, config.repo)

  // Also get the list of all config values for the admin UI
  const configValues = await listGitHubConfigValues(activeId)

  return NextResponse.json({
    configured: true,
    valid: verification.valid,
    username: verification.username,
    message: verification.message,
    source: 'database',
    repoOwner: config.owner,
    repoName: config.repo,
    projectNumber: config.projectNumber,
    configValues,
    tokenType: verification.tokenType,
    repoAccess: verification.repoAccess,
    issueAccess: verification.issueAccess,
    verificationSteps: verification.steps,
  })
}

// PUT: Save GitHub token to DATABASE — takes effect immediately
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { token, projectId } = body as { token: string; projectId?: string }

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token must be a non-empty string' }, { status: 400 })
  }

  const activeId = projectId ?? await getActiveProjectId(request)

  // Save the token to the database first
  await saveGitHubConfigValue('github_token', token, activeId)

  // Get config for repo context
  const config = await getGitHubConfig(activeId)

  // Full 3-step verification
  const verification = await verifyTokenFullAccess(token, config.owner, config.repo)

  // Invalidate cache so the new token is picked up immediately
  invalidateGitHubConfigCache()

  if (!verification.valid) {
    return NextResponse.json({
      saved: true,
      valid: false,
      username: verification.username,
      message: verification.message,
      hint: 'The token is stored and will be used immediately. Fix the token and re-save to resolve this issue.',
      tokenType: verification.tokenType,
      repoAccess: verification.repoAccess,
      issueAccess: verification.issueAccess,
      verificationSteps: verification.steps,
    })
  }

  return NextResponse.json({
    saved: true,
    valid: true,
    username: verification.username,
    message: verification.message,
    tokenType: verification.tokenType,
    repoAccess: verification.repoAccess,
    issueAccess: verification.issueAccess,
    verificationSteps: verification.steps,
  })
}

// DELETE: Remove the GitHub token from database
export async function DELETE(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  await deleteGitHubConfigValue('github_token', activeId)
  invalidateGitHubConfigCache()
  return NextResponse.json({
    removed: true,
    message: 'GitHub token removed from database. Any .env GITHUB_TOKEN is still available as fallback.',
  })
}
