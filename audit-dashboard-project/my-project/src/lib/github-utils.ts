/**
 * GitHub Integration Utilities
 *
 * Shared helpers for GitHub API routes: token type detection,
 * type-specific error messages, label auto-creation, and
 * 3-step token verification (user + repo + issue access).
 */

// ── Token Type Detection ──

export type TokenType = 'classic' | 'fine-grained' | 'unknown'

export function detectTokenType(token: string): TokenType {
  if (token.startsWith('ghp_')) return 'classic'
  if (token.startsWith('github_pat_')) return 'fine-grained'
  return 'unknown'
}

// ── Type-Specific Error Messages ──

export function getTokenErrorMessage(status: number, token: string): string {
  const type = detectTokenType(token)
  if (status === 401) {
    if (type === 'fine-grained') {
      return 'Token is invalid (401). Fine-grained tokens (github_pat_...) need "Issues: Read & Write", "Metadata: Read", and "Contents: Read" repository permissions. Make sure the token is scoped to the correct repository.'
    }
    if (type === 'classic') {
      return 'Token is invalid (401). Classic tokens (ghp_...) need "repo" scope for full repository access.'
    }
    return 'Token is invalid (401). Check that it is a valid Personal Access Token with the correct scope/permissions.'
  }
  if (status === 403) {
    if (type === 'fine-grained') {
      return 'Token lacks sufficient permissions (403). Fine-grained tokens need "Issues: Read & Write" and "Contents: Read" permissions on this repository.'
    }
    if (type === 'classic') {
      return 'Token lacks sufficient permissions (403). Classic tokens need "repo" scope (full control of private repos) or "public_repo" scope (for public repos).'
    }
    return 'Token lacks sufficient permissions (403). Ensure your token has the appropriate scope or permissions for this operation.'
  }
  if (status === 404) {
    if (type === 'fine-grained') {
      return 'Resource not found (404). Fine-grained PATs must be scoped to the exact repository. Check the repository owner/name and ensure the token has access to this specific repo.'
    }
    return 'Resource not found (404). Check the repository owner/name and ensure your token has access to this repo.'
  }
  return `GitHub API error (${status})`
}

// ── GitHub API Headers ──

export function githubApiHeaders(token: string, includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }
  return headers
}

// ── 3-Step Token Verification ──
// Step 1: GET /user → confirms token is valid and gets username
// Step 2: GET /repos/{owner}/{repo} → confirms repo access (critical for fine-grained PATs)
// Step 3: GET /repos/{owner}/{repo}/labels?per_page=1 → confirms issue access

export interface TokenVerificationResult {
  valid: boolean
  username?: string
  tokenType: TokenType
  repoAccess: boolean
  issueAccess: boolean
  message: string
  steps: {
    userCheck: 'pass' | 'fail' | 'skip'
    repoCheck: 'pass' | 'fail' | 'skip'
    issueCheck: 'pass' | 'fail' | 'skip'
  }
}

export async function verifyTokenFullAccess(
  token: string,
  owner?: string,
  repo?: string,
): Promise<TokenVerificationResult> {
  const tokenType = detectTokenType(token)
  const result: TokenVerificationResult = {
    valid: false,
    tokenType,
    repoAccess: false,
    issueAccess: false,
    message: '',
    steps: { userCheck: 'skip', repoCheck: 'skip', issueCheck: 'skip' },
  }

  // Step 1: Verify user authentication
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: githubApiHeaders(token),
      signal: AbortSignal.timeout(10000),
    })

    if (!userRes.ok) {
      result.steps.userCheck = 'fail'
      result.message = getTokenErrorMessage(userRes.status, token)
      return result
    }

    const user = await userRes.json() as Record<string, unknown>
    result.username = String(user.login ?? 'unknown')
    result.steps.userCheck = 'pass'
  } catch (err) {
    result.steps.userCheck = 'fail'
    result.message = `Authentication check failed: ${err instanceof Error ? err.message : 'network error'}`
    return result
  }

  // Step 2: Verify repo access (if owner/repo provided)
  if (owner && repo) {
    try {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: githubApiHeaders(token),
        signal: AbortSignal.timeout(10000),
      })

      if (!repoRes.ok) {
        result.steps.repoCheck = 'fail'
        if (repoRes.status === 404) {
          result.message = tokenType === 'fine-grained'
            ? `Repository "${owner}/${repo}" not found (404). Fine-grained PATs must be scoped to the exact repository. Check your token's repository access permissions.`
            : `Repository "${owner}/${repo}" not found (404). Check the owner/name and ensure your token has access.`
        } else {
          result.message = getTokenErrorMessage(repoRes.status, token)
        }
        result.valid = false
        return result
      }

      result.repoAccess = true
      result.steps.repoCheck = 'pass'
    } catch (err) {
      result.steps.repoCheck = 'fail'
      result.message = `Repository access check failed: ${err instanceof Error ? err.message : 'network error'}`
      return result
    }

    // Step 3: Verify issue access (lightweight probe)
    try {
      const labelsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels?per_page=1`, {
        headers: githubApiHeaders(token),
        signal: AbortSignal.timeout(10000),
      })

      if (labelsRes.ok) {
        result.issueAccess = true
        result.steps.issueCheck = 'pass'
      } else if (labelsRes.status === 403 || labelsRes.status === 404) {
        result.steps.issueCheck = 'fail'
        result.issueAccess = false
        // Still valid overall — just can't create/manage issues
      } else {
        result.steps.issueCheck = 'fail'
      }
    } catch {
      result.steps.issueCheck = 'fail'
    }
  } else {
    result.steps.repoCheck = 'skip'
    result.steps.issueCheck = 'skip'
  }

  // Build final message
  result.valid = true
  const parts = [`Authenticated as ${result.username}`]
  if (result.repoAccess) parts.push(`has access to ${owner}/${repo}`)
  if (result.issueAccess) parts.push('can create/manage issues')
  if (!result.issueAccess && result.repoAccess) parts.push('⚠️ cannot manage issues — check token permissions')
  result.message = parts.join(', ')

  return result
}

// ── Label Definitions ──
// All labels that the audit dashboard may create on GitHub issues.

const AUDIT_LABELS: Record<string, { color: string; description: string }> = {
  'audit-finding': { color: 'ff0000', description: 'Issue created from audit dashboard finding' },
  'severity:critical': { color: 'b60205', description: 'Critical severity audit finding' },
  'severity:high': { color: 'd93f0b', description: 'High severity audit finding' },
  'severity:medium': { color: 'fbca04', description: 'Medium severity audit finding' },
  'severity:low': { color: '0e8a16', description: 'Low severity audit finding' },
  'tier:tier0': { color: 'e11d48', description: 'Tier 0 — must-fix before release' },
  'tier:tier1': { color: 'f97316', description: 'Tier 1 — should-fix before release' },
  'tier:tier2': { color: '3b82f6', description: 'Tier 2 — fix before public launch' },
  'tier:deferred': { color: '6b7280', description: 'Deferred — fix later' },
  'tier:additional': { color: '9ca3af', description: 'Additional — nice to have' },
  'status:fixed': { color: '0e8a16', description: 'Finding has been remediated' },
  'status:wont-fix': { color: '6b7280', description: 'Finding will not be fixed' },
  'status:in-progress': { color: 'fbca04', description: 'Finding is being worked on' },
  'status:not-started': { color: 'd93f0b', description: 'Finding has not been addressed yet' },
}

export function getAuditLabelDefinitions(): Record<string, { color: string; description: string }> {
  return AUDIT_LABELS
}

// ── Ensure audit-finding Label Exists ──

export async function ensureAuditFindingLabel(owner: string, repo: string, token: string): Promise<boolean> {
  const headers = githubApiHeaders(token)

  // Check if label already exists
  const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels/audit-finding`, {
    headers,
    signal: AbortSignal.timeout(5000),
  })

  if (checkRes.ok) return true // label exists

  // Create the label
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(AUDIT_LABELS['audit-finding']),
    signal: AbortSignal.timeout(5000),
  })

  return createRes.ok
}

// ── Ensure All Required Labels Exist ──
// Before creating/updating a GitHub issue, ensure that all labels
// referenced in the issue (severity, tier, status) exist in the repo.
// This prevents 404/422 errors when PATCH-ing issues with labels that
// don't exist.

export async function ensureLabelsExist(
  owner: string,
  repo: string,
  token: string,
  labelNames: string[],
): Promise<{ created: string[]; existing: string[]; failed: string[] }> {
  const headers = githubApiHeaders(token)
  const result = { created: [], existing: [], failed: [] }

  for (const name of labelNames) {
    // Check if label exists
    const checkRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, {
      headers,
      signal: AbortSignal.timeout(5000),
    })

    if (checkRes.ok) {
      result.existing.push(name)
      continue
    }

    // Label doesn't exist — create it with our definition or a default
    const definition = AUDIT_LABELS[name] ?? { color: 'ededed', description: `Audit dashboard label: ${name}` }
    const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        color: definition.color,
        description: definition.description,
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (createRes.ok) {
      result.created.push(name)
    } else {
      // For fine-grained PATs, label creation might require "Issues: Write" permission
      // If we can't create labels, we'll just skip them (issue creation still works)
      result.failed.push(name)
    }
  }

  return result
}
