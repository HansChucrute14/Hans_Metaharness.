import { NextRequest, NextResponse } from 'next/server'
import {
  getGitHubConfig,
  saveGitHubConfigValue,
  deleteGitHubConfigValue,
  listGitHubConfigValues,
} from '@/lib/github-config'
import { getActiveProjectId } from '@/lib/get-active-project'

// GET: Return all GitHub configuration values (token masked for security)
export async function GET(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  const configValues = await listGitHubConfigValues(activeId)

  return NextResponse.json({
    // Current effective config (from DB + .env fallback)
    effective: {
      hasToken: config.token !== null,
      owner: config.owner,
      repo: config.repo,
      projectNumber: config.projectNumber,
    },
    // All stored DB values (token masked)
    storedValues: configValues,
    // Also note which values are from .env fallback vs DB
    envFallback: {
      owner: !configValues.find(c => c.key === 'repo_owner') && process.env.GITHUB_REPO_OWNER ? true : false,
      repo: !configValues.find(c => c.key === 'repo_name') && process.env.GITHUB_REPO_NAME ? true : false,
      token: !configValues.find(c => c.key === 'github_token') && process.env.GITHUB_TOKEN ? true : false,
    },
  })
}

// POST: Save a GitHub config value to the database
// Body: { key: "repo_owner" | "repo_name" | "project_number", value: string, projectId?: string }
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { key, value, projectId } = body as { key: string; value: string; projectId?: string }

  const allowedKeys = ['repo_owner', 'repo_name', 'project_number']
  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: `Invalid key "${key}". Allowed: ${allowedKeys.join(', ')}` }, { status: 400 })
  }

  if (!value || typeof value !== 'string') {
    return NextResponse.json({ error: 'value must be a non-empty string' }, { status: 400 })
  }

  const activeId = projectId ?? await getActiveProjectId(request)
  await saveGitHubConfigValue(key, value, activeId)

  return NextResponse.json({
    saved: true,
    key,
    value,
    message: `GitHub config "${key}" saved. Changes take effect immediately.`,
  })
}

// DELETE: Remove a specific config value from the database
// Query param: key=repo_owner|repo_name|project_number
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) {
    return NextResponse.json({ error: 'key parameter is required' }, { status: 400 })
  }

  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  await deleteGitHubConfigValue(key, activeId)

  return NextResponse.json({
    deleted: true,
    key,
    message: `Config "${key}" removed from database. Environment variable fallback will be used if available.`,
  })
}
