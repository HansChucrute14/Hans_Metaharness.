'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useProject } from '@/lib/project-context'

// Types matching the server-side data module — re-exported for convenience
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Tier = 'tier0' | 'tier1' | 'tier2' | 'deferred' | 'additional'
export type VerificationStatus = 'confirmed-execution' | 'confirmed-reading' | 'confirmed-logical' | 'needs-execution-confirmation' | 'partial'
export type AuditStatus = 'not-started' | 'in-progress' | 'fixed' | 'wont-fix'

export interface Proposal {
  id: string
  findingId: string
  index: number
  title: string
  description: string
  effort: string
  risk: string
  reversible: boolean
}

export interface CodeSnippet {
  id: string
  findingId: string
  file: string
  lines: string
  language: string
  code: string
}

export interface BestProposalAnalysis {
  id: string
  task: string
  bestSoloIndex: number
  bestSoloReason: string
  hybridNote: string | null
  unifiedModuleId: string | null
}

export interface UnifiedModule {
  id: string
  title: string
  subtitle: string
  coreIdea: string
  addresses: string[]
  fixes: string[]
  effort: string
  risk: string
  keyInsight: string
  elegantSolution: string
}

export interface Finding {
  id: string
  task: string
  findingIds: string[]
  title: string
  tier: Tier
  severity: Severity
  category: string
  summary: string
  claim: string
  evidence: string
  verificationStatus: VerificationStatus
  verificationNote: string | null
  dependsOn: string
  affectedFiles: string[]
  proposals: Proposal[]
  codeSnippets: CodeSnippet[]
  bestAnalysis: BestProposalAnalysis | null
  module: UnifiedModule | null
  unifiedModuleId: string | null
  githubIssueUrl: string | null
  githubIssueNumber: number | null
  githubSyncedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface G3BlockedItem {
  task: string
  title: string
  canShipNow: string
  needsReview: string
}

// ── Helper: Append projectId query param to a URL if activeProjectId is available ──

function withProjectId(base: string, activeProjectId: string | null): string {
  if (!activeProjectId) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}projectId=${activeProjectId}`
}

// ── MUTATION HOOKS ──
// After mutations succeed, we invalidate related TanStack Query caches
// so the UI refreshes automatically instead of relying on router.refresh().

// Create new finding
export function useCreateFinding() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (finding: Partial<Finding>) => {
      const res = await fetch(withProjectId('/api/findings', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create finding')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// Update finding
export function useUpdateFinding() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ task, data }: { task: string; data: Partial<Finding> }) => {
      const res = await fetch(withProjectId(`/api/findings/${task}`, activeProjectId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update finding')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// Delete finding
export function useDeleteFinding() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (task: string) => {
      const res = await fetch(withProjectId(`/api/findings/${task}`, activeProjectId), { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete finding')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// Batch import
export function useBatchImport() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (findings: Partial<Finding>[]) => {
      const res = await fetch(withProjectId('/api/findings/batch', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findings }),
      })
      if (!res.ok) throw new Error('Failed to batch import')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// Save audit note
export function useSaveNote() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ task, note, status }: { task: string; note: string; status: AuditStatus }) => {
      const res = await fetch(withProjectId(`/api/findings/notes/${task}`, activeProjectId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, status }),
      })
      if (!res.ok) throw new Error('Failed to save note')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// ── GITHUB INTEGRATION HOOKS ──

export interface GitHubIssueResult {
  issueUrl: string
  issueNumber: number
  issueId: number
  message?: string
}

export interface GitHubProjectResult {
  success: boolean
  projectId: string
  projectTitle: string
  projectNumber: number
}

export interface GitHubIssuesSync {
  issues: Array<{
    issueNumber: number
    issueUrl: string
    nodeId: string
    task: string | null
    state: string
    labels: string[]
    createdAt: string
    updatedAt: string
  }>
  sync: {
    totalFindings: number
    findingsWithIssues: number
    githubIssuesFound: number
    unmatched: Array<{ issueNumber: number; issueUrl: string; task: null }>
  }
}

export interface GitHubTokenStatus {
  configured: boolean
  valid?: boolean
  username?: string
  message: string
  // DB-based config fields (new)
  source?: string       // "database" or "none"
  repoOwner?: string
  repoName?: string
  projectNumber?: number
  configValues?: Array<{ key: string; value: string; valueMasked: string; updatedAt: string }>
  // Token type detection (classic vs fine-grained)
  tokenType?: 'classic' | 'fine-grained' | 'unknown'
  // 3-step verification results
  repoAccess?: boolean
  issueAccess?: boolean
  verificationSteps?: {
    userCheck: 'pass' | 'fail' | 'skip'
    repoCheck: 'pass' | 'fail' | 'skip'
    issueCheck: 'pass' | 'fail' | 'skip'
  }
}

// Create GitHub issue from a finding
export function useCreateGitHubIssue() {
  const router = useRouter()
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (finding: Partial<Finding>) => {
      const res = await fetch(withProjectId('/api/github/issue', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to create issue')
      }
      return res.json() as Promise<GitHubIssueResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-issues'] })
      router.refresh()
    },
  })
}

// Add issue to GitHub project
export function useAddToProject() {
  const { activeProjectId } = useProject()
  return useMutation({
    mutationFn: async ({ issueNodeId, projectNumber }: { issueNodeId: string; projectNumber: number }) => {
      const res = await fetch(withProjectId('/api/github/project', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueNodeId, projectNumber }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to add to project')
      }
      return res.json() as Promise<GitHubProjectResult>
    },
  })
}

// Fetch existing GitHub issues for sync — useQuery (read-only)
export function useGitHubIssues() {
  const { activeProjectId } = useProject()
  return useQuery({
    queryKey: ['github-issues', activeProjectId],
    queryFn: async () => {
      const res = await fetch(withProjectId('/api/github/issues', activeProjectId))
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to fetch issues')
      }
      return res.json() as Promise<GitHubIssuesSync>
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeProjectId,
  })
}

// Check GitHub token status — useQuery (read-only)
export function useGitHubTokenStatus() {
  const { activeProjectId } = useProject()
  return useQuery({
    queryKey: ['github-token-status', activeProjectId],
    queryFn: async () => {
      const res = await fetch(withProjectId('/api/github/token', activeProjectId))
      if (!res.ok) throw new Error('Failed to check token')
      return res.json() as Promise<GitHubTokenStatus>
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeProjectId,
  })
}

// Save GitHub token
export function useSaveGitHubToken() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch(withProjectId('/api/github/token', activeProjectId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error('Failed to save token')
      return res.json() as Promise<{ saved: boolean; valid: boolean; username?: string; message: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-token-status'] })
    },
  })
}

// Verify GitHub project exists
export interface GitHubProjectVerifyResult {
  exists: boolean
  projectId?: string
  projectTitle?: string
  projectNumber?: number
  projectVisibility?: string
  projectOwnerType?: string
  owner?: string
  error?: string
}

export function useVerifyGitHubProject() {
  const { activeProjectId } = useProject()
  return useMutation({
    mutationFn: async (projectNumber: number) => {
      const res = await fetch(withProjectId(`/api/github/project?projectNumber=${projectNumber}`, activeProjectId))
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to verify project')
      }
      return res.json() as Promise<GitHubProjectVerifyResult>
    },
  })
}

// Delete GitHub token from .env
export function useDeleteGitHubToken() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(withProjectId('/api/github/token', activeProjectId), { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete token')
      return res.json() as Promise<{ removed: boolean; message: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-token-status'] })
    },
  })
}

// ── AI ANALYSIS HOOK ──

export interface AIAnalysisResult {
  analysis: string
}

// AI-powered finding analysis
export function useAIAnalysis() {
  const { activeProjectId } = useProject()
  return useMutation({
    mutationFn: async (finding: Partial<Finding>) => {
      const res = await fetch(withProjectId('/api/ai/analyze', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to analyze')
      }
      return res.json() as Promise<AIAnalysisResult>
    },
  })
}

// ── AI CONNECTOR HOOKS ──
// NOTE: AIConnector is global (not project-scoped) — do NOT add projectId to /api/ai/connector routes

export interface AIConnectorData {
  id: string
  name: string
  type: string          // "ollama", "openai-compatible", "custom"
  endpointUrl: string
  modelName: string | null
  temperature: number
  maxTokens: number
  isActive: boolean
  lastPingAt: string | null
  status: string        // "connected", "disconnected", "error"
  createdAt: string
  updatedAt: string
}

export interface AIConnectorListResult {
  connectors: AIConnectorData[]
}

export interface AIConnectorTestResult {
  success: boolean
  message: string
  models?: string[]
  endpointUrl: string
}

export interface AIConnectorModelsResult {
  models: string[]
  connectorName: string
  endpointUrl: string
}

// Fetch all connectors (GET) — useQuery (read-only), global (no projectId)
export function useAIConnectorStatus() {
  return useQuery({
    queryKey: ['ai-connectors'],
    queryFn: async () => {
      const res = await fetch('/api/ai/connector')
      if (!res.ok) throw new Error('Failed to fetch connectors')
      return res.json() as Promise<AIConnectorListResult>
    },
    staleTime: 5 * 60 * 1000,
  })
}

// Test connection to a local LLM endpoint (POST)
export function useTestAIConnector() {
  return useMutation({
    mutationFn: async ({ endpointUrl, type }: { endpointUrl: string; type: string }) => {
      const res = await fetch('/api/ai/connector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointUrl, type }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Connection test failed')
      }
      return res.json() as Promise<AIConnectorTestResult>
    },
  })
}

// Save/update connector settings (PUT)
export function useSaveAIConnector() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      type: string
      endpointUrl: string
      modelName?: string
      temperature?: number
      maxTokens?: number
      isActive?: boolean
    }) => {
      const res = await fetch('/api/ai/connector', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to save connector')
      }
      return res.json() as Promise<{ connector: AIConnectorData }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-connectors'] })
    },
  })
}

// List available models from a connected endpoint (GET with action=list-models)
export function useListAIModels() {
  return useMutation({
    mutationFn: async (connectorName: string) => {
      const res = await fetch(`/api/ai/connector?action=list-models&connector=${connectorName}`)
      if (!res.ok) {
        const error = await res.json()
        throw new Error((error as Record<string, string>).error || 'Failed to list models')
      }
      return res.json() as Promise<AIConnectorModelsResult>
    },
  })
}

// Delete a connector (DELETE)
export function useDeleteAIConnector() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/ai/connector?name=${name}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete connector')
      return res.json() as Promise<{ deleted: boolean }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-connectors'] })
    },
  })
}

// ── ACTIVITY LOG ──

export type ActivityType = 'status_change' | 'note_save' | 'bookmark' | 'issue_create' | 'filter_change' | 'ai_analysis' | 'export' | 'github_sync' | 'opencode_action'

// ── OPENCODE HARNESS HOOKS ──

export interface OpencodeSettings {
  id: string
  binaryPath: string
  workspacePath: string
  model: string
  endpointUrl: string
  autoReview: boolean
  syncToGithub: boolean
  isActive: boolean
}

export interface OpencodeActionResult {
  live: boolean
  queued: boolean
  action: string
  task: string | null
  prompt: string
  message: string
  sessionId?: string
  manualCommand?: string
  instructions?: {
    manualCommand: string
    autoSync: string
  }
}

// Check Opencode status — useQuery (read-only)
export function useOpencodeStatus() {
  const { activeProjectId } = useProject()
  return useQuery({
    queryKey: ['opencode-status', activeProjectId],
    queryFn: async () => {
      const res = await fetch(withProjectId('/api/opencode', activeProjectId))
      if (!res.ok) throw new Error('Failed to check Opencode status')
      return res.json() as Promise<{
        configured: boolean
        available: boolean
        serverReachable?: boolean
        healthData?: Record<string, unknown> | null
        message: string
        settings?: OpencodeSettings
      }>
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeProjectId,
  })
}

export function useSendToOpencode() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ action, task, context }: { action: string; task?: string; context?: Record<string, unknown> }) => {
      const res = await fetch(withProjectId('/api/opencode', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, task, context }),
      })
      if (!res.ok) {
        const error = await res.json() as Record<string, string>
        throw new Error(error.error || 'Failed to send to Opencode')
      }
      return res.json() as Promise<OpencodeActionResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opencode-status'] })
    },
  })
}

export function useSaveOpencodeSettings() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (settings: Partial<OpencodeSettings>) => {
      const res = await fetch(withProjectId('/api/opencode', activeProjectId), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save Opencode settings')
      return res.json() as Promise<{ settings: OpencodeSettings }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opencode-status'] })
    },
  })
}

export function useDeleteOpencodeSettings() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(withProjectId('/api/opencode', activeProjectId), { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete Opencode settings')
      return res.json() as Promise<{ deleted: boolean }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opencode-status'] })
    },
  })
}

// ── BIDIRECTIONAL GITHUB SYNC HOOKS ──

export interface GitHubSyncResult {
  syncResults: Array<{
    task: string
    issueNumber: number
    changeType: string
    details: string
    localUpdated: boolean
  }>
  summary: {
    totalGitHubIssues: number
    matchedFindings: number
    unmatchedIssues: number
    syncedFindings: number
    findingsWithoutIssues: number
    errors: number
  }
  timestamp: string
}

export interface GitHubPushResult {
  results: Array<{
    task: string
    success: boolean
    message: string
  }>
  summary: {
    total: number
    success: number
    failed: number
  }
  timestamp: string
}

// Pull sync — useMutation (triggers a POST-like sync action)
export function useGitHubPullSync() {
  const { activeProjectId } = useProject()
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(withProjectId('/api/github/sync', activeProjectId))
      if (!res.ok) {
        const error = await res.json() as Record<string, string>
        throw new Error(error.error || 'Failed to pull GitHub sync')
      }
      return res.json() as Promise<GitHubSyncResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-issues'] })
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// Push sync — useMutation (POST action)
export function useGitHubPushSync() {
  const { activeProjectId } = useProject()
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ tasks, action }: { tasks: string[]; action: 'create-issue' | 'update-status' | 'add-comment'; comment?: string }) => {
      const res = await fetch(withProjectId('/api/github/sync', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks, action }),
      })
      if (!res.ok) {
        const error = await res.json() as Record<string, string>
        throw new Error(error.error || 'Failed to push GitHub sync')
      }
      return res.json() as Promise<GitHubPushResult>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-issues'] })
      queryClient.invalidateQueries({ queryKey: ['findings'] })
      router.refresh()
    },
  })
}

// ── GitHub Config Hooks (DB-based, not .env) ──
// These hooks manage GitHub configuration stored in the database,
// which takes effect immediately without server restart.

export interface GitHubConfigValue {
  key: string
  value: string
  valueMasked: string
  isEnvFallback: boolean
  updatedAt: string
}

export interface GitHubConfigResponse {
  effective: {
    hasToken: boolean
    owner: string
    repo: string
    projectNumber: number | null
  }
  storedValues: GitHubConfigValue[]
  envFallback: {
    owner: boolean
    repo: boolean
    token: boolean
  }
}

// Fetch GitHub config — useQuery (read-only)
export function useGitHubConfig() {
  const { activeProjectId } = useProject()
  return useQuery({
    queryKey: ['github-config', activeProjectId],
    queryFn: async () => {
      const res = await fetch(withProjectId('/api/github/config', activeProjectId))
      if (!res.ok) throw new Error('Failed to fetch GitHub config')
      return res.json() as Promise<GitHubConfigResponse>
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!activeProjectId,
  })
}

export function useSaveGitHubConfigValue() {
  const { activeProjectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(withProjectId('/api/github/config', activeProjectId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (!res.ok) throw new Error('Failed to save GitHub config')
      return res.json() as Promise<{ saved: boolean; key: string; value: string; message: string }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-config'] })
    },
  })
}

export interface ActivityEntry {
  id: string
  timestamp: string
  type: ActivityType
  task?: string
  description: string
}

const OLD_ACTIVITY_LOG_KEY = 'gsd-activity-log'
const MAX_ENTRIES = 100

/** Build project-scoped activity log key */
function activityLogKey(activeProjectId: string | null): string {
  return `activity-log-${activeProjectId ?? 'default'}`
}

export function getActivityLog(activeProjectId?: string | null): ActivityEntry[] {
  const key = activityLogKey(activeProjectId)
  try {
    // ── One-time migration: move old key to project-scoped key ──
    const oldData = localStorage.getItem(OLD_ACTIVITY_LOG_KEY)
    if (oldData) {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, oldData)
      }
      localStorage.removeItem(OLD_ACTIVITY_LOG_KEY)
    }
    const raw = localStorage.getItem(key)
    if (!raw) return []
    return JSON.parse(raw) as ActivityEntry[]
  } catch {
    return []
  }
}

export function addActivityEntry(entry: Omit<ActivityEntry, 'id' | 'timestamp'>, activeProjectId?: string | null): ActivityEntry {
  const key = activityLogKey(activeProjectId)
  const full: ActivityEntry = {
    ...entry,
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  }
  const log = getActivityLog(activeProjectId)
  log.unshift(full)
  // Keep only the most recent MAX_ENTRIES
  const trimmed = log.slice(0, MAX_ENTRIES)
  try {
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch { /* ignore quota errors */ }
  return full
}

export function clearActivityLog(activeProjectId?: string | null): void {
  try {
    localStorage.removeItem(activityLogKey(activeProjectId))
  } catch { /* ignore */ }
}

export function exportActivityLog(activeProjectId?: string | null): string {
  return JSON.stringify(getActivityLog(activeProjectId), null, 2)
}
