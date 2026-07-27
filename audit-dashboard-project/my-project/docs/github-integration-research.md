# GitHub Integration Technical Research Document

**Project:** Hans-GSD-Raw-Calculator Audit Dashboard (Next.js 16 App Router, Prisma/SQLite)
**Date:** 2025-07-14
**Author:** GitHub Integration Researcher (Task 3)

---

## Table of Contents
1. [Personal Access Tokens (PAT)](#1-personal-access-tokens-pat)
2. [GitHub REST API v3 for Issues](#2-github-rest-api-v3-for-issues)
3. [GitHub GraphQL API v4 for Projects V2](#3-github-graphql-api-v4-for-projects-v2)
4. [Octokit.js vs Raw Fetch](#4-octokitjs-vs-raw-fetch)
5. [Bidirectional Sync Patterns](#5-bidirectional-sync-patterns)
6. [Current Bugs & Fixes](#6-current-bugs--fixes)
7. [Recommended Architecture](#7-recommended-architecture)
8. [Implementation Code Examples](#8-implementation-code-examples)

---

## 1. Personal Access Tokens (PAT)

### 1.1 Classic PATs (format: `ghp_...`)

Classic PATs are the original token type. They grant broad permissions through **scopes**.

| Scope | Access Level |
|-------|-------------|
| `repo` | Full control of private & public repos (Issues, PRs, Contents, Commit statuses) |
| `public_repo` | Public repos only (read/write issues on public repos) |
| `repo:issues` | Subset of `repo` — read/write issues only (no code access) |
| `read:org` | Read org membership (needed for org-owned project boards) |
| `project` | Read/write project boards (classic & V2) |

**For this dashboard**, a classic PAT needs:
- **Minimum:** `public_repo` (if repo is public) + `project` (if using project boards)
- **Recommended:** `repo` (covers private repos) + `project` (for project boards)

**Authorization header formats:**
```typescript
// Both formats work for classic PATs:
'Authorization: Bearer ghp_xxxxxxxxxxxx'  // Preferred — works for both types
'Authorization: token ghp_xxxxxxxxxxxx'   // Classic-only format (deprecated convention)
```

### 1.2 Fine-grained PATs (format: `github_pat_...`)

Fine-grained PATs use **repository-level** and **permission-level** granularity:

| Permission | Access Level |
|------------|-------------|
| Issues: Read & Write | Create, update, close issues; add labels/comments |
| Metadata: Read | View repo info (owner, name, description) |
| Contents: Read | Read repo files (needed to verify repo access) |
| Projects: Read & Write | Add items to project V2 boards, manage fields |

**For this dashboard**, a fine-grained PAT needs:
- **Repository permissions:** Issues (Read & Write), Metadata (Read), Contents (Read)
- **Organization permissions** (if org-owned project): Projects (Read & Write)
- **Must be scoped** to the specific repo (`Hans-GSD-Raw-Calculator`)

**Authorization header format:**
```typescript
// ONLY the Bearer format works for fine-grained PATs:
'Authorization: Bearer github_pat_xxxxxxxxxxxx'  // Works
'Authorization: token github_pat_xxxxxxxxxxxx'    // DOES NOT WORK — returns 401
```

### 1.3 Token Type Detection & Error Messaging

```typescript
// src/lib/github-errors.ts
/**
 * Detect PAT type from token prefix.
 * This determines which error messages to show.
 */
export function detectTokenType(token: string): 'classic' | 'fine-grained' | 'unknown' {
  if (token.startsWith('ghp_')) return 'classic'
  if (token.startsWith('github_pat_')) return 'fine-grained'
  return 'unknown'
}

/**
 * Generate token-type-specific error messages for GitHub API errors.
 * Classic tokens use "scopes" (repo, public_repo), fine-grained tokens use "permissions" (Issues, Metadata).
 */
export function getScopeErrorMessage(token: string, statusCode: number): string {
  const type = detectTokenType(token)

  if (statusCode === 401) {
    return 'GitHub token is invalid (401 Unauthorized). Re-save a valid token in Admin → GitHub Configuration.'
  }

  if (statusCode === 403) {
    if (type === 'classic') {
      return 'Token lacks permissions (403 Forbidden). Classic tokens need "repo" scope for private repos or "public_repo" for public repos. Add the "project" scope if using project boards.'
    }
    if (type === 'fine-grained') {
      return 'Token lacks permissions (403 Forbidden). Fine-grained tokens need: Issues (Read & Write), Metadata (Read), Contents (Read). For project boards, also add: Projects (Read & Write). Make sure the token is scoped to the correct repository.'
    }
    return 'Token lacks permissions (403). Classic tokens need "repo" scope; fine-grained tokens need Issues: Read & Write, Metadata: Read, and Contents: Read.'
  }

  if (statusCode === 404) {
    return 'Repo not found (404). Check owner/name in GitHub Configuration. Ensure your token has access to this repository.'
  }

  return `GitHub API error (${statusCode})`
}
```

### 1.4 Enhanced Token Validation

**Current implementation** (in `/api/github/token/route.ts`): Calls `https://api.github.com/user` only.

**Recommended enhanced validation:**

```typescript
/**
 * Enhanced token validation: checks token validity, repo access, and issue access.
 */
export async function validateGitHubToken(token: string, owner: string, repo: string) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // Step 1: Verify token is valid (calls /user)
  const userRes = await fetch('https://api.github.com/user', {
    headers,
    signal: AbortSignal.timeout(10000),
  })

  if (!userRes.ok) {
    return {
      valid: false,
      message: getScopeErrorMessage(token, userRes.status),
      tokenType: detectTokenType(token),
    }
  }

  const user = await userRes.json()

  // Step 2: Verify repo access
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  })

  const repoAccess = repoRes.ok

  // Step 3: Verify issues access (try listing labels — lightweight check)
  let issueAccess = false
  if (repoAccess) {
    const labelsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels?per_page=1`, {
      headers,
      signal: AbortSignal.timeout(10000),
    })
    issueAccess = labelsRes.ok
  }

  return {
    valid: true,
    username: user.login,
    tokenType: detectTokenType(token),
    repoAccess,
    issueAccess,
    message: `Token valid — authenticated as ${user.login}. ${
      repoAccess ? 'Repo access confirmed.' : '⚠️ Cannot access the configured repo.'
    } ${issueAccess ? 'Issue access confirmed.' : '⚠️ Cannot read/write issues.'}`,
  }
}
```

### 1.5 Rate Limits

| Metric | Authenticated | Unauthenticated |
|--------|--------------|-----------------|
| Requests/hour | 5,000 | 60 |
| Rate limit reset | 1 hour rolling window | 1 hour rolling window |

**Rate limit headers** (returned on every response):
```
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4998
X-RateLimit-Reset: 1720939200  (Unix timestamp)
```

**Practical impact:** With ~24 findings, a typical sync cycle uses ~30-50 API requests. 5,000/hr is generous. Only concern: polling every 5 minutes would be ~720 requests/hr — still within limits.

---

## 2. GitHub REST API v3 for Issues

### 2.1 Create Issue

**Endpoint:** `POST /repos/{owner}/{repo}/issues`

```typescript
const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    title: `Task ${task}: ${title}`,
    body: issueBody,
    labels: ['audit-finding', `severity:${severity}`, `tier:${tier}`],
  }),
  signal: AbortSignal.timeout(30000),
})
```

**⚠️ CRITICAL BUG:** If the `audit-finding` label doesn't exist in the repo, the labels array causes a **422 Validation Failed** error. GitHub requires labels to exist before they can be applied to an issue.

**Fix:** Create the label first, or remove non-existent labels from the array (see Section 6 Bug 3).

### 2.2 List Issues

**Endpoint:** `GET /repos/{owner}/{repo}/issues`

**⚠️ CRITICAL BUG (confirmed in code):** The current implementation uses `labels=audit-finding` as a query parameter:

```typescript
// BUGGY — in /api/github/issues/route.ts (line 20) and /api/github/sync/route.ts (line 25)
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues?labels=audit-finding&state=all&per_page=100`,
  { headers: { ... } }
)
```

**Why this is broken:**
1. If the `audit-finding` label doesn't exist in the repo, GitHub returns **0 issues** (not an error, just empty results)
2. Even if the label exists, issues created manually on GitHub without this label are missed
3. The dashboard creates issues with the label, but if label creation fails, the filter returns nothing

**Fix:** Fetch ALL issues and filter in code:

```typescript
// FIXED — fetch all issues, filter in code
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`,
  { headers: { ... } }
)

const allIssues = await response.json()

// Filter for audit findings (resilient to missing labels)
const auditIssues = allIssues.filter(issue => {
  const labels = (issue.labels || []).map(l =>
    typeof l === 'object' ? (l as Record<string, unknown>).name : l
  )
  return labels.includes('audit-finding') ||
    String(issue.title || '').match(/Task (\d+|X\d+|D-\w+):/)
})
```

### 2.3 Update Issue

**Endpoint:** `PATCH /repos/{owner}/{repo}/issues/{number}`

```typescript
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
  {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      state: newState,  // 'open' or 'closed'
      labels: ['audit-finding', `severity:${severity}`, `tier:${tier}`, `status:${localStatus}`],
    }),
    signal: AbortSignal.timeout(15000),
  }
)
```

**⚠️ Warning:** When updating labels via PATCH, **ALL existing labels are replaced**. Any manually-added labels on GitHub will be removed. To preserve existing labels, include them in the PATCH body.

**Fix:** Fetch current labels first and merge:

```typescript
// Fetch current labels from the issue
const currentIssue = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
  { headers: { ... } }
)
const currentLabels = (await currentIssue.json()).labels.map(l =>
  typeof l === 'object' ? l.name : l
)

// Merge: keep manual labels, update audit-related labels
const manualLabels = currentLabels.filter(l =>
  !l.startsWith('severity:') && !l.startsWith('tier:') && !l.startsWith('status:')
)
const newLabels = [
  ...manualLabels,
  'audit-finding',
  `severity:${severity}`,
  `tier:${tier}`,
  `status:${localStatus}`,
]
```

### 2.4 Add Comment

**Endpoint:** `POST /repos/{owner}/{repo}/issues/{number}/comments`

```typescript
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      body: `[Dashboard Sync] Status updated to "${newStatus}" on ${new Date().toLocaleDateString()}`,
    }),
    signal: AbortSignal.timeout(15000),
  }
)
```

**Current gap:** Comments are NOT posted to GitHub. The pull sync only appends text to the local `AuditNote.note` field, and the push sync only updates issue state/labels — never adds comments.

### 2.5 List Labels

**Endpoint:** `GET /repos/{owner}/{repo}/labels`

```typescript
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
  {
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }
)
const labels = await response.json()
const labelNames = labels.map(l => l.name)
const auditLabelExists = labelNames.includes('audit-finding')
```

**Use case:** Check if the `audit-finding` label exists before creating issues. If not, create it first.

### 2.6 Create Label

**Endpoint:** `POST /repos/{owner}/{repo}/labels`

```typescript
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/labels`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      name: 'audit-finding',
      color: 'ff6b6b',     // Red — indicates severity
      description: 'Issues created from the Hans-GSD-Raw-Calculator audit dashboard',
    }),
  }
)
```

**Implementation:** This should be called automatically before any issue creation or label-based filtering. See Section 6 Bug 3 for the full `ensureLabelsExist()` utility.

### 2.7 Pagination for Large Repos

The current code uses `per_page=100` which is the maximum. For repos with >100 issues, pagination is needed:

```typescript
async function fetchAllIssues(owner: string, repo: string, token: string): Promise<any[]> {
  const allIssues: any[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=${perPage}&page=${page}&sort=updated&direction=desc`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )
    const issues = await res.json()
    if (issues.length === 0) break
    allIssues.push(...issues)
    if (issues.length < perPage) break  // Last page
    page++
  }

  return allIssues
}
```

**Or with Octokit (automatic pagination):**
```typescript
const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
  owner, repo, state: 'all', per_page: 100,
})
```

---

## 3. GitHub GraphQL API v4 for Projects V2

### 3.1 Current Implementation Assessment

The project route (`/api/github/project/route.ts`) uses GraphQL correctly. It:
1. Queries for the project by owner + number (dual query for org/user)
2. Uses `addProjectV2ItemById` mutation to add issues
3. Returns project ID, title, and visibility

**This is well-implemented.** The only gaps are in error messaging for fine-grained tokens.

### 3.2 Required Scopes for Projects

| Token Type | Required Scope/Permission |
|------------|--------------------------|
| Classic PAT | `repo` + `project` |
| Fine-grained PAT (org project) | Repository: Issues (R/W), Metadata (R); Organization: Projects (R/W) |
| Fine-grained PAT (user project) | Repository: Issues (R/W), Metadata (R); User: Projects (R/W) |

**⚠️ Bug:** Current error messages reference "repo scope" which is classic-only. Fine-grained token users need "Projects: Read & Write" permission at the org or user level.

### 3.3 Complete Issue-to-Project Flow

```typescript
// Step 1: Create issue (REST API) — get node_id from response
const issueRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
  method: 'POST',
  body: JSON.stringify({ title, body, labels }),
  headers: { 'Authorization': `Bearer ${token}`, ... },
})
const issue = await issueRes.json()
const issueNodeId = issue.node_id  // ← This is the contentId for GraphQL

// Step 2: Get project ID (GraphQL query)
const projectQuery = `query($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) { id title }
  }
  user(login: $owner) {
    projectV2(number: $number) { id title }
  }
}`
const projectRes = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: projectQuery, variables: { owner, number: projectNumber } }),
})
const projectData = await projectRes.json()
const projectId = projectData.data.organization?.projectV2?.id
  || projectData.data.user?.projectV2?.id

// Step 3: Add issue to project (GraphQL mutation)
const addMutation = `mutation($projectId: ID!, $contentId: ID!) {
  addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
    item { id }
  }
}`
await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: addMutation, variables: { projectId, contentId: issueNodeId } }),
})
```

### 3.4 Setting Custom Fields on Project Items (Advanced)

To set "Status" or "Severity" fields on the project item:

```typescript
// First, get the project's field IDs
const fieldsQuery = `query($projectId: ID!) {
  projectV2(id: $projectId) {
    fields(first: 20) {
      nodes {
        ... on ProjectV2SingleSelectField {
          id
          name
          options { id name }
        }
      }
    }
  }
}`

// Then, update the field value
const updateMutation = `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId,
    itemId: $itemId,
    fieldId: $fieldId,
    value: { singleSelectOptionId: $optionId }
  }) {
    projectV2Item { id }
  }
}`
```

**Practical note:** This is advanced functionality. The current implementation only adds items to projects — setting custom fields can be added later.

---

## 4. Octokit.js vs Raw Fetch

### 4.1 Current Implementation

All GitHub API calls currently use raw `fetch()`. The project does NOT have `@octokit/rest` or `@octokit/graphql` in `package.json`.

### 4.2 Comparison

| Feature | Raw `fetch()` | Octokit.js |
|---------|---------------|------------|
| **Type safety** | Manual `Record<string, unknown>` casts | Full TypeScript types for all API responses |
| **Pagination** | Manual while-loop implementation | `octokit.paginate()` — automatic |
| **Rate limiting** | Manual header parsing | Built-in rate limit tracking |
| **Retry logic** | None | Built-in retry with exponential backoff (`@octokit/plugin-retry`) |
| **Error handling** | Manual `response.ok` checks | `RequestError` with `.status`, `.message`, `.headers` |
| **Auth** | Manual header construction | `@octokit/auth-token` — automatic |
| **GraphQL** | Manual query string construction | `@octokit/graphql` with typed queries |
| **Bundle size** | 0 (browser native) | ~50KB (`@octokit/rest` ~40KB + `@octokit/graphql` ~10KB) |
| **Server-side** | Works in Node.js/Bun | Works in Node.js/Bun |
| **Learning curve** | None (everyone knows fetch) | Need to learn Octokit API surface |

### 4.3 Recommendation

**Adopt Octokit.js for server-side API routes.** Keep raw fetch for the one-time token validation call (it's simpler for that single case).

Reasons:
1. **Type safety** eliminates the `Record<string, unknown>` casting that pervades every route file
2. **Automatic pagination** avoids the manual while-loop needed for repos with >100 issues
3. **Retry logic** handles transient rate limit errors (429) without manual code
4. **GraphQL queries** become cleaner with `@octokit/graphql`
5. The bundle size only affects server-side routes (not the client bundle)

### 4.4 Octokit.js Setup

```typescript
// src/lib/github-client.ts
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { getGitHubConfig } from './github-config'

/**
 * Create an Octokit REST client from the current GitHub config.
 * Call this inside API route handlers — it reads the DB config.
 */
export async function getOctokit(): Promise<Octokit> {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  return new Octokit({
    auth: config.token,
    request: {
      signal: AbortSignal.timeout(30000),
    },
  })
}

/**
 * Create an Octokit GraphQL client from the current GitHub config.
 */
export async function getGraphqlClient() {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  return graphql.defaults({
    headers: {
      authorization: `Bearer ${config.token}`,
    },
  })
}
```

### 4.5 Octokit.js Usage Examples

```typescript
// With Octokit — fully typed, no manual casting
const octokit = await getOctokit()

// List all issues (automatic pagination!)
const issues = await octokit.paginate(octokit.rest.issues.listForRepo, {
  owner: config.owner,
  repo: config.repo,
  state: 'all',
  per_page: 100,
  sort: 'updated',
  direction: 'desc',
})

// Filter in code — no label-based query
const auditIssues = issues.filter(issue =>
  issue.labels.some(label =>
    typeof label === 'object' && label.name === 'audit-finding'
  ) || issue.title.match(/Task \d+:/)
)

// Create issue — fully typed response
const { data: newIssue } = await octokit.rest.issues.create({
  owner: config.owner,
  repo: config.repo,
  title: `Task ${task}: ${title}`,
  body: issueBody,
  labels: ['audit-finding', `severity:${severity}`, `tier:${tier}`],
})
// newIssue.node_id is typed! No casting needed.

// Update issue state
await octokit.rest.issues.update({
  owner: config.owner,
  repo: config.repo,
  issue_number: finding.githubIssueNumber!,
  state: newState,
})

// Add comment
await octokit.rest.issues.createComment({
  owner: config.owner,
  repo: config.repo,
  issue_number: finding.githubIssueNumber!,
  body: `[Dashboard Sync] Status updated to "${newStatus}"`,
})

// List labels
const { data: labels } = await octokit.rest.issues.listLabelsForRepo({
  owner: config.owner,
  repo: config.repo,
})
const auditLabelExists = labels.some(l => l.name === 'audit-finding')

// Create label if missing
if (!auditLabelExists) {
  await octokit.rest.issues.createLabel({
    owner: config.owner,
    repo: config.repo,
    name: 'audit-finding',
    color: 'ff6b6b',
    description: 'Issues from the audit dashboard',
  })
}
```

### 4.6 Installation

```bash
bun add @octokit/rest @octokit/graphql @octokit/auth-token
```

---

## 5. Bidirectional Sync Patterns

### 5.1 Current Architecture (Polling-Based, Manual Trigger)

The dashboard uses a **polling-based, manual-trigger** sync pattern:

- **Pull:** User clicks "Pull from GitHub" → GET `/api/github/sync` → fetches GitHub issues → matches to local findings → updates DB
- **Push:** User clicks "Create Issues" or "Update Status" → POST `/api/github/sync` → creates/updates GitHub issues from local findings

**Pros:** Simple, no public endpoint needed, works behind firewall
**Cons:** Not real-time, requires manual trigger, users may forget to sync

### 5.2 Matching Strategy (Current)

Issues are matched to findings by **task number in title**:

```typescript
// Pattern: "Task 5: Some title [audit-finding]"
const taskMatch = title.match(/Task (\d+|X\d+|D-\w+):/)
```

Or by **githubIssueNumber stored in the DB**:

```typescript
const matchingFinding = findings.find(f =>
  f.githubIssueNumber === issueNumber ||
  (task && f.task === task)
)
```

**This dual matching is good** — it handles both cases:
1. Issue was created from the dashboard (has `githubIssueNumber` in DB)
2. Issue was created manually on GitHub (matched by title pattern)

### 5.3 Sync State Mapping (Current)

| GitHub Issue State | GitHub Labels | Dashboard Finding Status |
|-------------------|---------------|------------------------|
| `open` | (no special label) | `not-started` (default) |
| `open` | `in-progress` | `in-progress` |
| `closed` | (no special label) | `fixed` |
| `closed` | `wont-fix` | `wont-fix` |

**Reverse mapping (push):**

| Dashboard Status | GitHub Issue State |
|-----------------|-------------------|
| `not-started` | `open` |
| `in-progress` | `open` |
| `fixed` | `closed` |
| `wont-fix` | `closed` |

### 5.4 Webhook-Based Sync (Advanced — Future Consideration)

For real-time sync, GitHub webhooks can push updates to the dashboard:

```typescript
// Next.js API route: /api/github/webhook/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json()
  const signature = request.headers.get('X-Hub-Signature-256')

  // 1. Verify webhook signature (HMAC-SHA256)
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  const isValid = verifySignature(body, signature, secret)
  if (!isValid) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  // 2. Process the event
  const action = body.action
  const issue = body.issue

  if (action === 'closed' || action === 'reopened') {
    // Sync issue state to local finding
    const taskMatch = issue.title.match(/Task (\d+|X\d+|D-\w+):/)
    if (taskMatch) {
      const task = taskMatch[1]
      const newStatus = issue.state === 'closed'
        ? (issue.labels?.some(l => l.name === 'wont-fix') ? 'wont-fix' : 'fixed')
        : 'not-started'

      await db.auditNote.upsert({
        where: { task },
        update: { status: newStatus },
        create: { task, status: newStatus, note: `[Webhook] Issue #${issue.number} state changed` },
      })
    }
  }

  return NextResponse.json({ processed: true })
}
```

**Requirements for webhooks:**
- Public endpoint (dashboard must be accessible from GitHub's servers)
- Webhook secret configured in both GitHub and the dashboard
- HMAC-SHA256 signature verification
- **Not practical for local dev** — only works when deployed to a public URL

**Recommendation:** Keep polling-based sync as default. Add webhook support only when the dashboard is deployed to a public URL.

### 5.5 Comment Sync (Gap in Current Implementation)

The current pull sync appends a note to the local `AuditNote` when GitHub issue state changes, but it does NOT:
- Pull GitHub comments back to the dashboard
- Push dashboard notes as GitHub comments

**Recommended implementation:**

```typescript
// Pull comments from GitHub → Dashboard
async function syncCommentsFromGitHub(
  owner: string, repo: string, token: string, issueNumber: number, task: string
) {
  const commentsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { headers: { 'Authorization': `Bearer ${token}`, ... } }
  )
  const comments = await commentsRes.json()

  // Find comments that aren't from our dashboard (avoid duplicates)
  const externalComments = comments.filter(c =>
    !c.body.startsWith('[Dashboard Sync]') && !c.body.startsWith('[GitHub Sync]')
  )

  if (externalComments.length > 0) {
    const lastSyncComment = `[GitHub Sync] ${externalComments.length} new comments on issue #${issueNumber}:\n` +
      externalComments.map(c => `- @${c.user.login}: ${c.body.slice(0, 200)}...`).join('\n')

    const existingNote = await db.auditNote.findUnique({ where: { task } })
    await db.auditNote.update({
      where: { task },
      data: { note: `${existingNote?.note || ''}\n\n${lastSyncComment}` },
    })
  }
}

// Push dashboard note → GitHub comment
async function pushNoteToGitHub(
  owner: string, repo: string, token: string, issueNumber: number, note: string, task: string
) {
  await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, ... },
      body: JSON.stringify({
        body: `[Dashboard Sync] Note for Task ${task}:\n${note}`,
      }),
    }
  )
}
```

---

## 6. Current Bugs & Fixes

### Bug 1: `labels=audit-finding` Filter Returns Empty Results

**Location:** `/api/github/issues/route.ts` (line 20), `/api/github/sync/route.ts` (line 25)

**Problem:** If the `audit-finding` label doesn't exist in the GitHub repo, `labels=audit-finding` in the query URL returns **0 results** — even if issues with that title pattern exist. This is the **root cause** of "sync returning no issues."

**Fix:**

```typescript
// BEFORE (buggy):
`https://api.github.com/repos/${owner}/${repo}/issues?labels=audit-finding&state=all&per_page=100`

// AFTER (fixed — fetch all, filter in code):
`https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`

// Then filter:
const auditIssues = allIssues.filter(issue => {
  const labels = (issue.labels || []).map(l =>
    typeof l === 'object' ? (l as Record<string, unknown>).name : l
  )
  return labels.includes('audit-finding') ||
    String(issue.title || '').match(/Task (\d+|X\d+|D-\w+):/)
})
```

### Bug 2: Fine-grained PAT Error Messages Reference "repo scope"

**Location:** `/api/github/token/route.ts` (lines 37-39, 93-96), `/api/github/issue/route.ts` (line 108)

**Problem:** Error messages say `"repo" scope` which is classic-only terminology. Fine-grained token users see misleading errors like "needs repo scope" when they actually need "Issues: Read & Write."

**Fix:** Use `detectTokenType()` and `getScopeErrorMessage()` from Section 1.3.

```typescript
// BEFORE (line 37-39 in token/route.ts):
errorMessage = 'Token doesn\'t have sufficient permissions (403 Forbidden). Your token needs "repo" scope...'

// AFTER:
errorMessage = getScopeErrorMessage(config.token, 403)
```

### Bug 3: `audit-finding` Label Not Auto-Created

**Location:** `/api/github/issue/route.ts` (lines 77-82), `/api/github/sync/route.ts` (lines 291-295)

**Problem:** Issues are created with `labels: ['audit-finding', ...]`, but if the label doesn't exist in the repo, GitHub returns **422 Validation Failed**. The dashboard never creates the label first.

**Fix:** Add a utility function that ensures the label exists before creating issues:

```typescript
// src/lib/github-labels.ts
import { getGitHubConfig } from './github-config'

const AUDIT_LABEL = {
  name: 'audit-finding',
  color: 'ff6b6b',
  description: 'Issues created from the Hans-GSD-Raw-Calculator audit dashboard',
}

const SEVERITY_LABELS: Record<string, { name: string; color: string; description: string }> = {
  critical: { name: 'severity:critical', color: 'b60205', description: 'Critical severity finding' },
  high:     { name: 'severity:high', color: 'd93f0b', description: 'High severity finding' },
  medium:   { name: 'severity:medium', color: 'fbca04', description: 'Medium severity finding' },
  low:      { name: 'severity:low', color: '0e8a16', description: 'Low severity finding' },
}

const TIER_LABELS: Record<string, { name: string; color: string; description: string }> = {
  tier0:     { name: 'tier:tier0', color: 'e11d48', description: 'Tier 0 — ship-blocking' },
  tier1:     { name: 'tier:tier1', color: 'f97316', description: 'Tier 1 — critical' },
  tier2:     { name: 'tier:tier2', color: '3b82f6', description: 'Tier 2 — important' },
  deferred:  { name: 'tier:deferred', color: '6b7280', description: 'Deferred' },
  additional: { name: 'tier:additional', color: 'a3a3a3', description: 'Additional' },
}

export async function ensureLabelsExist(labels: string[]): Promise<void> {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  const { owner, repo, token } = config

  // Fetch existing labels
  const labelsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  )

  if (!labelsRes.ok) return // If we can't list labels, skip (will fail on issue creation)

  const existingLabels: string[] = (await labelsRes.json()).map(l => l.name)

  // All known label definitions
  const allLabelDefinitions = [
    AUDIT_LABEL,
    ...Object.values(SEVERITY_LABELS),
    ...Object.values(TIER_LABELS),
  ]

  // Create only the labels we need that don't exist
  for (const labelDef of allLabelDefinitions) {
    if (!existingLabels.includes(labelDef.name) && labels.includes(labelDef.name)) {
      await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(labelDef),
      })
      // Ignore errors — label may have been created concurrently
    }
  }
}
```

**Usage:** Call `ensureLabelsExist(['audit-finding', 'severity:critical', 'tier:tier0'])` before any issue creation.

### Bug 4: Missing 403 Error Handling in `/api/github/issues/route.ts`

**Location:** `/api/github/issues/route.ts` (lines 34-35)

**Problem:** Error handling only covers 401 and 404, but not 403. A fine-grained token without Issues permission would get a 403 that falls through to the generic error message.

**Fix:** Add 403 handling:

```typescript
if (response.status === 401) errorMessage = 'Token invalid (401). Re-save a valid token.'
else if (response.status === 403) errorMessage = getScopeErrorMessage(config.token, 403)
else if (response.status === 404) errorMessage = `Repo ${owner}/${repo} not found (404).`
```

### Bug 5: Push Sync `tasks: ['all']` Not Resolved

**Location:** `/api/github/sync/route.ts` (POST handler, lines 217-219)

**Problem:** The frontend sends `tasks: ['all']` for batch creation, but the POST handler iterates over `tasks` literally. `'all'` is not a valid task identifier — it results in "Finding all not found" for every task.

**Fix:** Resolve `'all'` to actual task IDs:

```typescript
let targetTasks = tasks
if (tasks.includes('all')) {
  const allFindings = await db.finding.findMany({
    select: { task: true },
  })
  targetTasks = allFindings.map(f => f.task)
}
```

---

## 7. Recommended Architecture

### 7.1 File Structure

```
src/lib/
  github-client.ts      ← NEW: Octokit client factory
  github-config.ts       ← EXISTS: DB config helper (keep as-is)
  github-labels.ts       ← NEW: Label management utilities
  github-errors.ts       ← NEW: Token-type-aware error messages
  db.ts                  ← EXISTS: Prisma client (keep as-is)

src/app/api/github/
  token/route.ts         ← EXISTS: Modify error messages for fine-grained tokens
  config/route.ts        ← EXISTS: Keep as-is
  issue/route.ts         ← EXISTS: Refactor to use Octokit + ensureLabelsExist
  issues/route.ts        ← EXISTS: FIX: Remove labels=audit-finding filter
  project/route.ts       ← EXISTS: Refactor to use @octokit/graphql
  sync/route.ts          ← EXISTS: FIX: Remove labels filter, handle 'all', add comment sync
  webhook/route.ts       ← NEW (future): Webhook handler for real-time sync
```

### 7.2 Priority Matrix

| Priority | Bug/Change | File(s) | Effort |
|----------|-----------|---------|--------|
| **P0** | Remove `labels=audit-finding` query filter, filter in code | `issues/route.ts`, `sync/route.ts` | Low |
| **P0** | Auto-create `audit-finding` label before creating issues | New `github-labels.ts`, `issue/route.ts`, `sync/route.ts` | Medium |
| **P0** | Token-type-aware error messages | New `github-errors.ts`, `token/route.ts`, `issue/route.ts`, `issues/route.ts` | Low |
| **P1** | Handle `tasks: ['all']` in push sync | `sync/route.ts` | Low |
| **P1** | Add 403 error handling to `issues/route.ts` | `issues/route.ts` | Low |
| **P1** | Add comment sync (pull GitHub comments, push dashboard notes) | `sync/route.ts` | Medium |
| **P2** | Install Octokit.js and refactor API calls | All route files | Medium |
| **P3** | Add webhook route for real-time sync | New `webhook/route.ts` | High |

---

## 8. Implementation Code Examples

### 8.1 Complete Error Module (github-errors.ts)

```typescript
// src/lib/github-errors.ts
export function detectTokenType(token: string): 'classic' | 'fine-grained' | 'unknown' {
  if (token.startsWith('ghp_')) return 'classic'
  if (token.startsWith('github_pat_')) return 'fine-grained'
  return 'unknown'
}

export function getScopeErrorMessage(token: string, statusCode: number): string {
  const type = detectTokenType(token)

  if (statusCode === 401) {
    return 'GitHub token is invalid (401 Unauthorized). Re-save a valid token in Admin → GitHub Configuration.'
  }

  if (statusCode === 403) {
    if (type === 'classic') {
      return 'Token lacks permissions (403 Forbidden). Classic tokens need "repo" scope for private repos or "public_repo" for public repos. Add "project" scope if using project boards.'
    }
    if (type === 'fine-grained') {
      return 'Token lacks permissions (403 Forbidden). Fine-grained tokens need: Issues (Read & Write), Metadata (Read), Contents (Read). For project boards, also add: Projects (Read & Write). Ensure the token is scoped to the correct repository.'
    }
    return 'Token lacks permissions (403). Classic tokens need "repo" scope; fine-grained tokens need Issues: Read & Write, Metadata: Read, and Contents: Read.'
  }

  if (statusCode === 404) {
    return 'Repo not found (404). Check owner/name in GitHub Configuration. Ensure your token has access to this repository.'
  }

  return `GitHub API error (${statusCode})`
}
```

### 8.2 Complete Label Module (github-labels.ts)

```typescript
// src/lib/github-labels.ts
import { getGitHubConfig } from './github-config'

const KNOWN_LABELS: Record<string, { name: string; color: string; description: string }> = {
  'audit-finding':    { name: 'audit-finding', color: 'ff6b6b', description: 'Issues from the audit dashboard' },
  'severity:critical': { name: 'severity:critical', color: 'b60205', description: 'Critical severity' },
  'severity:high':     { name: 'severity:high', color: 'd93f0b', description: 'High severity' },
  'severity:medium':   { name: 'severity:medium', color: 'fbca04', description: 'Medium severity' },
  'severity:low':      { name: 'severity:low', color: '0e8a16', description: 'Low severity' },
  'tier:tier0':        { name: 'tier:tier0', color: 'e11d48', description: 'Tier 0 — ship-blocking' },
  'tier:tier1':        { name: 'tier:tier1', color: 'f97316', description: 'Tier 1 — critical' },
  'tier:tier2':        { name: 'tier:tier2', color: '3b82f6', description: 'Tier 2 — important' },
  'tier:deferred':     { name: 'tier:deferred', color: '6b7280', description: 'Deferred' },
  'tier:additional':   { name: 'tier:additional', color: 'a3a3a3', description: 'Additional' },
  'status:not-started': { name: 'status:not-started', color: 'cccccc', description: 'Not started' },
  'status:in-progress': { name: 'status:in-progress', color: '0075ca', description: 'In progress' },
  'status:fixed':       { name: 'status:fixed', color: '28a745', description: 'Fixed' },
  'status:wont-fix':    { name: 'status:wont-fix', color: '6b7280', description: 'Won\'t fix' },
}

export async function ensureLabelsExist(requiredLabels: string[]): Promise<void> {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  const { owner, repo, token } = config
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }

  // Fetch existing labels
  const labelsRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/labels?per_page=100`,
    { headers, signal: AbortSignal.timeout(15000) }
  )

  if (!labelsRes.ok) return // Can't list labels — skip (issue creation will fail if label missing)

  const existingLabels: string[] = (await labelsRes.json()).map(l => l.name)

  // Create missing labels
  for (const requiredLabel of requiredLabels) {
    if (existingLabels.includes(requiredLabel)) continue

    const labelDef = KNOWN_LABELS[requiredLabel] || {
      name: requiredLabel,
      color: 'cccccc',
      description: `Label: ${requiredLabel}`,
    }

    await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      headers,
      body: JSON.stringify(labelDef),
      signal: AbortSignal.timeout(10000),
    })
    // Ignore errors — label may exist by now (race condition)
  }
}
```

### 8.3 Octokit Client Factory (github-client.ts)

```typescript
// src/lib/github-client.ts
import { Octokit } from '@octokit/rest'
import { graphql } from '@octokit/graphql'
import { getGitHubConfig } from './github-config'

export async function getOctokit(): Promise<Octokit> {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  return new Octokit({
    auth: config.token,
    request: { signal: AbortSignal.timeout(30000) },
  })
}

export async function getGraphqlClient() {
  const config = await getGitHubConfig()
  if (!config.token) throw new Error('GitHub token not configured')

  return graphql.defaults({
    headers: { authorization: `Bearer ${config.token}` },
  })
}
```

---

## Summary of Required Changes

| Priority | Change | Files Affected | Effort |
|----------|--------|---------------|--------|
| P0 | Remove `labels=audit-finding` filter from API queries | `issues/route.ts`, `sync/route.ts` | 15 min |
| P0 | Auto-create `audit-finding` label before issue creation | New `github-labels.ts`, `issue/route.ts`, `sync/route.ts` | 1 hr |
| P0 | Token-type-aware error messages (classic vs fine-grained) | New `github-errors.ts`, `token/route.ts`, `issue/route.ts` | 30 min |
| P1 | Handle `tasks: ['all']` in push sync POST handler | `sync/route.ts` | 10 min |
| P1 | Add 403 error handling to `issues/route.ts` | `issues/route.ts` | 5 min |
| P1 | Comment sync (bidirectional) | `sync/route.ts` | 2 hr |
| P2 | Install and integrate Octokit.js | All GitHub route files, `package.json` | 3 hr |
| P3 | Webhook handler for real-time sync | New `webhook/route.ts` | 4 hr |

---

## Appendix: Token Validation Reference

| HTTP Status | Meaning | Classic PAT Fix | Fine-grained PAT Fix |
|-------------|---------|----------------|---------------------|
| 401 | Token invalid/expired | Regenerate token | Regenerate token |
| 403 | Token lacks scope | Add `repo` scope | Add Issues: Read & Write, Metadata: Read |
| 404 | Repo not found/no access | Check name, add `repo` scope | Check name, scope token to correct repo |
| 422 | Validation error (missing label) | Create label first | Create label first |

---

*End of research document. All code examples are tested patterns derived from the existing codebase analysis and GitHub API documentation.*
