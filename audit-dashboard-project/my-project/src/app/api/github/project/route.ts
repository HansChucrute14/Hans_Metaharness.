import { NextRequest, NextResponse } from 'next/server'
import { getGitHubConfig } from '@/lib/github-config'
import { getActiveProjectId } from '@/lib/get-active-project'

// GET: Verify a GitHub Project board exists and return its details
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectNumber = searchParams.get('projectNumber')

  if (!projectNumber) {
    return NextResponse.json({ error: 'projectNumber query parameter is required' }, { status: 400 })
  }

  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json({ error: 'GitHub token not configured. Save one in Admin → GitHub Configuration.' }, { status: 400 })
  }

  const owner = config.owner

  // Query GraphQL for project details (including visibility)
  const projectQuery = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) { id title visibility }
        }
        user(login: $owner) {
          projectV2(number: $number) { id title visibility }
        }
      }`,
      variables: { owner, number: Number(projectNumber) },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const projectResult = await projectQuery.json() as Record<string, unknown>
  const data = projectResult.data as Record<string, unknown> | null

  if (projectResult.errors) {
    return NextResponse.json(
      { error: 'GraphQL query failed', details: projectResult.errors },
      { status: 400 }
    )
  }

  let projectId: string | null = null
  let projectTitle: string | null = null
  let projectVisibility: string | null = null
  let projectOwnerType: string | null = null

  if (data) {
    const org = data.organization as Record<string, unknown> | null
    const usr = data.user as Record<string, unknown> | null

    if (org?.projectV2) {
      const orgProject = org.projectV2 as Record<string, unknown>
      projectId = String(orgProject.id)
      projectTitle = String(orgProject.title)
      projectVisibility = String(orgProject.visibility ?? 'PRIVATE')
      projectOwnerType = 'organization'
    } else if (usr?.projectV2) {
      const usrProject = usr.projectV2 as Record<string, unknown>
      projectId = String(usrProject.id)
      projectTitle = String(usrProject.title)
      projectVisibility = String(usrProject.visibility ?? 'PRIVATE')
      projectOwnerType = 'user'
    }
  }

  if (!projectId) {
    return NextResponse.json(
      { error: `Project #${projectNumber} not found for owner "${owner}". Make sure the project exists and the token has access.`, exists: false },
      { status: 404 }
    )
  }

  return NextResponse.json({
    exists: true,
    projectId,
    projectTitle,
    projectNumber: Number(projectNumber),
    projectVisibility,
    projectOwnerType,
    owner,
  })
}

// POST: Add an issue to a GitHub Project board
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { issueNodeId, projectNumber } = body as { issueNodeId: string; projectNumber: number }

  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }
  const config = await getGitHubConfig(activeId)
  if (!config.token) {
    return NextResponse.json({ error: 'GitHub token not configured. Save one in Admin → GitHub Configuration.' }, { status: 400 })
  }

  const owner = config.owner

  // Step 1: Get the project node ID via GraphQL
  const projectQuery = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `query($owner: String!, $number: Int!) {
        organization(login: $owner) {
          projectV2(number: $number) { id title }
        }
        user(login: $owner) {
          projectV2(number: $number) { id title }
        }
      }`,
      variables: { owner, number: Number(projectNumber) },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const projectResult = await projectQuery.json() as Record<string, unknown>
  const data = projectResult.data as Record<string, unknown> | null

  let projId: string | null = null
  let projTitle: string | null = null

  if (data) {
    const org = data.organization as Record<string, unknown> | null
    const usr = data.user as Record<string, unknown> | null

    if (org?.projectV2) {
      const orgProject = org.projectV2 as Record<string, unknown>
      projId = String(orgProject.id)
      projTitle = String(orgProject.title)
    } else if (usr?.projectV2) {
      const usrProject = usr.projectV2 as Record<string, unknown>
      projId = String(usrProject.id)
      projTitle = String(usrProject.title)
    }
  }

  if (!projId) {
    return NextResponse.json(
      { error: `Project #${projectNumber} not found for owner "${owner}". Make sure the project exists and the token has access.` },
      { status: 404 }
    )
  }

  // Step 2: Add issue to project using addProjectV2ItemById mutation
  const addMutation = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }`,
      variables: { projectId: projId, contentId: String(issueNodeId) },
    }),
    signal: AbortSignal.timeout(15000),
  })

  const addResult = await addMutation.json() as Record<string, unknown>

  if (addResult.errors) {
    return NextResponse.json(
      { error: 'Failed to add item to project', details: addResult.errors },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    projectId: projId,
    projectTitle: projTitle,
    projectNumber,
  })
}
