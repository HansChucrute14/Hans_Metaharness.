'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Alert, AlertDescription, AlertTitle,
} from '@/components/ui/alert'
import {
  Plus, Trash2, Save, Upload, FileJson, AlertCircle, CheckCircle2,
  XCircle, Edit3, X, ChevronDown, ChevronUp, Copy, LoaderCircle,
  ShieldAlert, Zap, FileCode2, Github, ExternalLink, Key, RefreshCw,
  Kanban, Hash, Lock, Eye, TriangleAlert,
} from 'lucide-react'
import {
  useCreateFinding, useUpdateFinding,
  useDeleteFinding, useBatchImport,
  type Finding, type Severity, type Tier, type VerificationStatus,
  type AuditStatus, type UnifiedModule, type G3BlockedItem,
  type BestProposalAnalysis,
  useSaveGitHubToken, useGitHubTokenStatus, useGitHubIssues,
  useVerifyGitHubProject, useDeleteGitHubToken,
  useGitHubConfig, useSaveGitHubConfigValue,
  type GitHubTokenStatus, type GitHubIssuesSync, type GitHubProjectVerifyResult,
  type GitHubConfigResponse,
} from '@/lib/use-findings'
import { useProject } from '@/lib/project-context'
import type { UnifiedModuleId } from '@/lib/audit-types'
import {
  severityConfig, tierLabels, verificationConfig, effortConfig, riskConfig,
  auditStatusConfig, severityWeight, tierImpact,
} from '@/lib/audit-data'
import { AIConnectorPanel } from '@/components/ai-connector-panel'
import { OpencodePanel } from '@/components/opencode-panel'
import { GitHubSyncPanel } from '@/components/github-sync-panel'
import { AuditConfigEditor } from '@/components/audit-config-editor'
import { ProjectSection } from '@/components/project-section'

/* ─── NOTIFICATION SYSTEM ─── */
interface Notification {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

function NotificationBar({ notifications, onDismiss }: { notifications: Notification[]; onDismiss: (id: string) => void }) {
  return (
    <AnimatePresence>
      {notifications.map(n => (
        <motion.div
          key={n.id}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`mb-2 p-3 rounded-md border flex items-center gap-2 text-sm ${
            n.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' :
            n.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300' :
            'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300'
          }`}
        >
          {n.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
          {n.type === 'error' && <AlertCircle className="h-4 w-4" />}
          {n.type === 'info' && <FileJson className="h-4 w-4" />}
          <span className="flex-1">{n.message}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onDismiss(n.id)}>
            <X className="h-3 w-3" />
          </Button>
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

/* ─── PROPOSAL SUB-FORM ─── */
interface ProposalDraft {
  title: string
  description: string
  effort: string
  risk: string
  reversible: boolean
}

function ProposalSubForm({ proposal, index, onChange }: {
  proposal: ProposalDraft
  index: number
  onChange: (p: ProposalDraft) => void
}) {
  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs font-mono">P{index + 1}</Badge>
        <span className="text-sm font-semibold">Proposal #{index + 1}</span>
      </div>
      <Input
        placeholder="Proposal title"
        value={proposal.title}
        onChange={e => onChange({ ...proposal, title: e.target.value })}
        className="text-sm"
      />
      <Textarea
        placeholder="Proposal description"
        value={proposal.description}
        onChange={e => onChange({ ...proposal, description: e.target.value })}
        className="text-sm min-h-[60px]"
      />
      <div className="grid grid-cols-2 gap-2">
        <Select value={proposal.effort} onValueChange={v => onChange({ ...proposal, effort: v })}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Effort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low Effort</SelectItem>
            <SelectItem value="medium">Medium Effort</SelectItem>
            <SelectItem value="high">High Effort</SelectItem>
          </SelectContent>
        </Select>
        <Select value={proposal.risk} onValueChange={v => onChange({ ...proposal, risk: v })}>
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low Risk</SelectItem>
            <SelectItem value="medium">Medium Risk</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={proposal.reversible}
          onCheckedChange={v => onChange({ ...proposal, reversible: v === true })}
        />
        <span className="text-sm text-muted-foreground">Reversible</span>
      </div>
    </div>
  )
}

/* ─── CODE SNIPPET SUB-FORM ─── */
interface SnippetDraft {
  file: string
  lines: string
  language: string
  code: string
}

function SnippetSubForm({ snippet, index, onChange, onRemove }: {
  snippet: SnippetDraft
  index: number
  onChange: (s: SnippetDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="border rounded-md p-3 bg-muted/30 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <FileCode2 className="h-3.5 w-3.5" /> Snippet #{index + 1}
        </span>
        <Button variant="ghost" size="icon" className="h-5 w-5 text-red-600" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="File path"
          value={snippet.file}
          onChange={e => onChange({ ...snippet, file: e.target.value })}
          className="text-sm"
        />
        <Input
          placeholder="Lines (e.g. 120-145)"
          value={snippet.lines}
          onChange={e => onChange({ ...snippet, lines: e.target.value })}
          className="text-sm"
        />
        <Select value={snippet.language} onValueChange={v => onChange({ ...snippet, language: v })}>
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="javascript">JavaScript</SelectItem>
            <SelectItem value="toml">TOML</SelectItem>
            <SelectItem value="yaml">YAML</SelectItem>
            <SelectItem value="markdown">Markdown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Textarea
        placeholder="Code content"
        value={snippet.code}
        onChange={e => onChange({ ...snippet, code: e.target.value })}
        className="text-sm min-h-[80px] font-mono"
      />
    </div>
  )
}

/* ─── MAIN ADMIN TAB ─── */
export function AdminTab({
  findings,
  modules,
  focusSection,
}: {
  findings: Finding[]
  modules: UnifiedModule[]
  focusSection?: string
}) {
  // Scroll to the focused section when focusSection changes
  useEffect(() => {
    if (!focusSection || focusSection === 'none') return
    const sectionMap: Record<string, string> = {
      'project': 'admin-section-project',
      'ai-connector': 'admin-section-ai-connector',
      'opencode': 'admin-section-opencode',
      'github-sync': 'admin-section-github-sync',
      'github-config': 'admin-section-github-config',
      'audit-config': 'admin-section-audit-config',
    }
    const el = document.getElementById(sectionMap[focusSection])
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusSection])
  const createMutation = useCreateFinding()
  const updateMutation = useUpdateFinding()
  const deleteMutation = useDeleteFinding()
  const batchMutation = useBatchImport()

  // Notification state (declared first since handlers depend on it)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const addNotification = useCallback((type: Notification['type'], message: string) => {
    const id = Date.now().toString()
    setNotifications(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }, [])
  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // GitHub integration mutations & state
  const { activeProject } = useProject()
  const saveTokenMutation = useSaveGitHubToken()
  const checkTokenQuery = useGitHubTokenStatus()
  const syncIssuesQuery = useGitHubIssues()
  const verifyProjectMutation = useVerifyGitHubProject()
  const deleteTokenMutation = useDeleteGitHubToken()
  const githubConfigQuery = useGitHubConfig()
  const saveConfigMutation = useSaveGitHubConfigValue()
  const [githubToken, setGithubToken] = useState('')
  const [githubTokenStatus, setGithubTokenStatus] = useState<GitHubTokenStatus | null>(null)
  const [githubProjectNumber, setGithubProjectNumber] = useState('')
  const [githubRepoOwner, setGithubRepoOwner] = useState(activeProject?.repoOwner ?? '')
  const [githubRepoName, setGithubRepoName] = useState(activeProject?.repoName ?? '')
  const [githubSyncResult, setGithubSyncResult] = useState<GitHubIssuesSync | null>(null)
  const [projectVerifyResult, setProjectVerifyResult] = useState<GitHubProjectVerifyResult | null>(null)

  const handleSaveToken = useCallback(() => {
    if (!githubToken.trim()) {
      addNotification('error', 'Token cannot be empty')
      return
    }
    saveTokenMutation.mutate(githubToken.trim(), {
      onSuccess: (data) => {
        addNotification(data.valid ? 'success' : 'error', data.message)
        if (data.valid) setGithubToken('')
        setGithubTokenStatus({
          configured: true,
          valid: data.valid,
          username: data.username,
          message: data.message,
        })
      },
      onError: (err) => {
        addNotification('error', `Token save failed: ${err.message}`)
      },
    })
  }, [githubToken, saveTokenMutation, addNotification])

  const handleVerifyToken = useCallback(() => {
    checkTokenQuery.refetch().then((result) => {
      if (result.data) {
        const data = result.data
        setGithubTokenStatus(data)
        // Also load repo config from the response
        if (data.repoOwner) setGithubRepoOwner(data.repoOwner)
        if (data.repoName) setGithubRepoName(data.repoName)
        if (data.projectNumber) setGithubProjectNumber(String(data.projectNumber))
        addNotification(data.valid ? 'success' : 'error', data.message)
      }
      if (result.error) {
        setGithubTokenStatus({ configured: false, message: `Failed: ${result.error.message}` })
        addNotification('error', `Token check failed: ${result.error.message}`)
      }
    })
  }, [checkTokenQuery, addNotification])

  const handleSyncIssues = useCallback(() => {
    syncIssuesQuery.refetch().then((result) => {
      if (result.data) {
        setGithubSyncResult(result.data)
        addNotification('success', `Synced: ${result.data.sync.githubIssuesFound} GitHub issues found, ${result.data.sync.findingsWithIssues}/${result.data.sync.totalFindings} findings linked`)
      }
      if (result.error) {
        addNotification('error', `Sync failed: ${result.error.message}`)
      }
    })
  }, [syncIssuesQuery, addNotification])

  const handleSaveProjectNumber = useCallback(() => {
    if (githubProjectNumber.trim()) {
      saveConfigMutation.mutate(
        { key: 'project_number', value: githubProjectNumber.trim() },
        {
          onSuccess: (data) => {
            addNotification('success', data.message)
          },
          onError: (err) => {
            addNotification('error', `Failed to save project number: ${err.message}`)
          },
        },
      )
    }
  }, [githubProjectNumber, saveConfigMutation, addNotification])

  const handleSaveRepoConfig = useCallback(() => {
    // Save owner and repo name to database
    saveConfigMutation.mutate(
      { key: 'repo_owner', value: githubRepoOwner.trim() },
      {
        onSuccess: () => {
          saveConfigMutation.mutate(
            { key: 'repo_name', value: githubRepoName.trim() },
            {
              onSuccess: (data) => {
                addNotification('success', 'Repository config saved. Changes take effect immediately.')
              },
              onError: (err) => {
                addNotification('error', `Failed to save repo name: ${err.message}`)
              },
            },
          )
        },
        onError: (err) => {
          addNotification('error', `Failed to save repo owner: ${err.message}`)
        },
      },
    )
  }, [githubRepoOwner, githubRepoName, saveConfigMutation, addNotification])

  const handleVerifyProject = useCallback(() => {
    const num = Number(githubProjectNumber)
    if (!num || num <= 0) {
      addNotification('error', 'Enter a valid project number first')
      return
    }
    setProjectVerifyResult(null)
    verifyProjectMutation.mutate(num, {
      onSuccess: (data) => {
        setProjectVerifyResult(data)
        if (data.exists) {
          addNotification('success', `Project #${num} verified: "${data.projectTitle}" (${data.projectVisibility}, ${data.projectOwnerType})`)
        } else {
          addNotification('error', data.error ?? `Project #${num} not found`)
        }
      },
      onError: (err) => {
        setProjectVerifyResult({ exists: false, error: err.message })
        addNotification('error', `Project verification failed: ${err.message}`)
      },
    })
  }, [githubProjectNumber, verifyProjectMutation, addNotification])

  const handleDeleteToken = useCallback(() => {
    deleteTokenMutation.mutate(undefined, {
      onSuccess: (data) => {
        addNotification('success', data.message)
        setGithubTokenStatus({ configured: false, message: 'Token removed' })
        setGithubToken('')
      },
      onError: (err) => {
        addNotification('error', `Failed to delete token: ${err.message}`)
      },
    })
  }, [deleteTokenMutation, addNotification])

  // ── ADD FINDING FORM STATE ──
  const [formTask, setFormTask] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formTier, setFormTier] = useState<Tier>('tier2')
  const [formSeverity, setFormSeverity] = useState<Severity>('medium')
  const [formCategory, setFormCategory] = useState('')
  const [formSummary, setFormSummary] = useState('')
  const [formClaim, setFormClaim] = useState('')
  const [formEvidence, setFormEvidence] = useState('')
  const [formVerificationStatus, setFormVerificationStatus] = useState<VerificationStatus>('confirmed-execution')
  const [formVerificationNote, setFormVerificationNote] = useState('')
  const [formDependsOn, setFormDependsOn] = useState('')
  const [formFindingIds, setFormFindingIds] = useState('')
  const [formAffectedFiles, setFormAffectedFiles] = useState('')
  const [formModuleId, setFormModuleId] = useState<string>('none')
  const [formProposals, setFormProposals] = useState<ProposalDraft[]>([
    { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
    { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
    { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
  ])
  const [formSnippets, setFormSnippets] = useState<SnippetDraft[]>([])

  const resetForm = useCallback(() => {
    setFormTask('')
    setFormTitle('')
    setFormTier('tier2')
    setFormSeverity('medium')
    setFormCategory('')
    setFormSummary('')
    setFormClaim('')
    setFormEvidence('')
    setFormVerificationStatus('confirmed-execution')
    setFormVerificationNote('')
    setFormDependsOn('')
    setFormFindingIds('')
    setFormAffectedFiles('')
    setFormModuleId('none')
    setFormProposals([
      { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
      { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
      { title: '', description: '', effort: 'medium', risk: 'medium', reversible: true },
    ])
    setFormSnippets([])
  }, [])

  const handleCreateFinding = useCallback(() => {
    if (!formTask.trim() || !formTitle.trim() || !formCategory.trim() || !formSummary.trim()) {
      addNotification('error', 'Missing required fields: Task ID, Title, Category, Summary')
      return
    }
    const payload: Partial<Finding> = {
      task: formTask.trim(),
      title: formTitle.trim(),
      tier: formTier,
      severity: formSeverity,
      category: formCategory.trim(),
      summary: formSummary.trim(),
      claim: formClaim.trim(),
      evidence: formEvidence.trim(),
      verificationStatus: formVerificationStatus,
      verificationNote: formVerificationNote.trim() || null,
      dependsOn: formDependsOn.trim() || 'None',
      findingIds: formFindingIds.split(',').map(s => s.trim()).filter(Boolean),
      affectedFiles: formAffectedFiles.split(',').map(s => s.trim()).filter(Boolean),
      unifiedModuleId: formModuleId === 'none' ? null : formModuleId,
      proposals: formProposals.map(p => ({
        title: p.title,
        description: p.description,
        effort: p.effort,
        risk: p.risk,
        reversible: p.reversible,
      })),
      codeSnippets: formSnippets.map(s => ({
        file: s.file,
        lines: s.lines,
        language: s.language,
        code: s.code,
      })),
    }
    createMutation.mutate(payload, {
      onSuccess: () => {
        addNotification('success', `Finding Task ${formTask} created successfully!`)
        resetForm()
      },
      onError: (err) => {
        addNotification('error', `Failed to create: ${err.message}`)
      },
    })
  }, [formTask, formTitle, formTier, formSeverity, formCategory, formSummary, formClaim,
    formEvidence, formVerificationStatus, formVerificationNote, formDependsOn,
    formFindingIds, formAffectedFiles, formModuleId, formProposals, formSnippets,
    createMutation, addNotification, resetForm])

  // ── BULK IMPORT STATE ──
  const [bulkJson, setBulkJson] = useState('')
  const [bulkPreview, setBulkPreview] = useState<Partial<Finding>[] | null>(null)
  const [bulkPreviewOpen, setBulkPreviewOpen] = useState(false)

  const handleBulkPreview = useCallback(() => {
    try {
      const parsed = JSON.parse(bulkJson)
      if (!Array.isArray(parsed)) {
        addNotification('error', 'JSON must be an array of findings')
        return
      }
      setBulkPreview(parsed)
      setBulkPreviewOpen(true)
      addNotification('info', `Parsed ${parsed.length} findings — review before importing`)
    } catch {
      addNotification('error', 'Invalid JSON — please check your input')
    }
  }, [bulkJson, addNotification])

  const handleBulkImport = useCallback(() => {
    if (!bulkPreview) return
    batchMutation.mutate(bulkPreview, {
      onSuccess: (result) => {
        addNotification('success', `Imported: ${result.created} created, ${result.skipped} skipped`)
        setBulkJson('')
        setBulkPreview(null)
        setBulkPreviewOpen(false)
      },
      onError: (err) => {
        addNotification('error', `Batch import failed: ${err.message}`)
      },
    })
  }, [bulkPreview, batchMutation, addNotification])

  // ── EXISTING FINDINGS EDITOR STATE ──
  const [editingTask, setEditingTask] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editSeverity, setEditSeverity] = useState<Severity>('medium')
  const [editTier, setEditTier] = useState<Tier>('tier2')
  const [editCategory, setEditCategory] = useState('')
  const [editSummary, setEditSummary] = useState('')

  const startEditing = useCallback((f: Finding) => {
    setEditingTask(f.task)
    setEditTitle(f.title)
    setEditSeverity(f.severity)
    setEditTier(f.tier)
    setEditCategory(f.category)
    setEditSummary(f.summary)
  }, [])

  const cancelEditing = useCallback(() => {
    setEditingTask(null)
  }, [])

  const handleUpdateFinding = useCallback(() => {
    if (!editingTask) return
    updateMutation.mutate({
      task: editingTask,
      data: {
        title: editTitle,
        severity: editSeverity,
        tier: editTier,
        category: editCategory,
        summary: editSummary,
      },
    }, {
      onSuccess: () => {
        addNotification('success', `Task ${editingTask} updated successfully`)
        setEditingTask(null)
      },
      onError: (err) => {
        addNotification('error', `Update failed: ${err.message}`)
      },
    })
  }, [editingTask, editTitle, editSeverity, editTier, editCategory, editSummary,
    updateMutation, addNotification])

  const handleDeleteFinding = useCallback((task: string) => {
    if (!confirm(`Are you sure you want to delete finding Task ${task}?`)) return
    deleteMutation.mutate(task, {
      onSuccess: () => {
        addNotification('success', `Task ${task} deleted`)
      },
      onError: (err) => {
        addNotification('error', `Delete failed: ${err.message}`)
      },
    })
  }, [deleteMutation, addNotification])

  const isCreating = createMutation.isPending
  const isUpdating = updateMutation.isPending
  const isDeleting = deleteMutation.isPending
  const isImporting = batchMutation.isPending

  return (
    <div className="space-y-6">
      {/* NOTIFICATIONS */}
      <div className="sticky top-0 z-10">
        <NotificationBar notifications={notifications} onDismiss={dismissNotification} />
      </div>

      {/* ── 1. ADD NEW FINDING FORM ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-2 border-emerald-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                <Plus className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base text-emerald-800 dark:text-emerald-200">Add New Finding</CardTitle>
                <CardDescription className="text-xs">Create a new audit finding with proposals and code snippets</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ── Section: Core Identification ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Hash className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">Core Identification</span>
                <span className="text-[10px] text-muted-foreground">Required fields to define the finding</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Task ID *</label>
                      <Input
                        placeholder="e.g. 25, X2, D-A15"
                        value={formTask}
                        onChange={e => setFormTask(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Unique identifier for the finding. Can be numeric or alphanumeric.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Title *</label>
                      <Input
                        placeholder="Finding title"
                        value={formTitle}
                        onChange={e => setFormTitle(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Short descriptive title for what the finding documents.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Tier *</label>
                      <Select value={formTier} onValueChange={v => setFormTier(v as Tier)}>
                        <SelectTrigger className="text-sm btn-subtle-hover">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tier0">Tier 0 — Immediate Threats</SelectItem>
                          <SelectItem value="tier1">Tier 1 — Structural Causes</SelectItem>
                          <SelectItem value="tier2">Tier 2 — Guardrails</SelectItem>
                          <SelectItem value="deferred">Deferred</SelectItem>
                          <SelectItem value="additional">Additional Findings</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Remediation priority tier: Tier 0 = immediate, Tier 2 = guardrails, Deferred = post-critical.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Severity *</label>
                      <Select value={formSeverity} onValueChange={v => setFormSeverity(v as Severity)}>
                        <SelectTrigger className="text-sm btn-subtle-hover">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Impact severity: Critical = immediate safety/data risk, High = structural issue, Medium = guardrail, Low = cosmetic.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Category *</label>
                      <Input
                        placeholder="e.g. Safety Guard, Data Schema"
                        value={formCategory}
                        onChange={e => setFormCategory(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Thematic category grouping (e.g. Safety Guard, Data Schema, Pipeline Integrity).</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Verification Status</label>
                      <Select value={formVerificationStatus} onValueChange={v => setFormVerificationStatus(v as VerificationStatus)}>
                        <SelectTrigger className="text-sm btn-subtle-hover">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="confirmed-execution">Confirmed by Execution</SelectItem>
                          <SelectItem value="confirmed-reading">Confirmed by Reading</SelectItem>
                          <SelectItem value="confirmed-logical">Confirmed by Logic</SelectItem>
                          <SelectItem value="needs-execution-confirmation">Needs Execution Confirmation</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>How the finding was verified: (a) execution = pytest/command, (b) reading = static analysis, (c) logical = inference.</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <Separator />

            {/* ── Section: Claim & Evidence ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldAlert className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">Claim & Evidence</span>
                <span className="text-[10px] text-muted-foreground">What the finding claims and supporting evidence</span>
              </div>
              <div className="space-y-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Summary *</label>
                      <Textarea
                        placeholder="One-sentence summary of the finding"
                        value={formSummary}
                        onChange={e => setFormSummary(e.target.value)}
                        className="text-sm min-h-[40px]"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Concise one-sentence summary describing the finding.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Claim</label>
                      <Textarea
                        placeholder="What this finding claims about the code"
                        value={formClaim}
                        onChange={e => setFormClaim(e.target.value)}
                        className="text-sm min-h-[40px]"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>The specific assertion about the codebase that this finding documents.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Evidence</label>
                      <Textarea
                        placeholder="Evidence supporting the claim"
                        value={formEvidence}
                        onChange={e => setFormEvidence(e.target.value)}
                        className="text-sm min-h-[60px]"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Live code evidence that confirms or refutes the claim.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Verification Note (optional)</label>
                      <Textarea
                        placeholder="Any additional verification notes"
                        value={formVerificationNote}
                        onChange={e => setFormVerificationNote(e.target.value)}
                        className="text-sm min-h-[40px]"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Optional note explaining how the verification was performed.</TooltipContent>
                </Tooltip>
              </div>
            </div>

            <Separator />

            {/* ── Section: Relationships ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">Relationships & Files</span>
                <span className="text-[10px] text-muted-foreground">Connections to other findings and affected files</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Finding IDs (comma-separated)</label>
                      <Input
                        placeholder="e.g. A3, A2, B2"
                        value={formFindingIds}
                        onChange={e => setFormFindingIds(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Reference IDs from the original roadmap (e.g. A3, A2, B2).</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Affected Files (comma-separated)</label>
                      <Input
                        placeholder="e.g. solver.py, constraints.json"
                        value={formAffectedFiles}
                        onChange={e => setFormAffectedFiles(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Source files that are affected by this finding.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Depends On</label>
                      <Input
                        placeholder="e.g. Task 2, Task 4"
                        value={formDependsOn}
                        onChange={e => setFormDependsOn(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Which other tasks must be completed before this one can be fixed.</TooltipContent>
                </Tooltip>
              </div>

              {/* Unified Module selector */}
              <div className="space-y-1.5 mt-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="text-xs font-semibold text-muted-foreground">Unified Execution Module</label>
                  </TooltipTrigger>
                  <TooltipContent>Assign this finding to a unified execution module for grouped remediation, or leave as Independent.</TooltipContent>
                </Tooltip>
                <Select value={formModuleId} onValueChange={v => setFormModuleId(v)}>
                  <SelectTrigger className="text-sm btn-subtle-hover">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Independent)</SelectItem>
                    {modules.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Proposals sub-forms */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-orange-600" /> 3 Solution Proposals
                </span>
              </div>
              <div className="space-y-2">
                {formProposals.map((p, i) => (
                  <ProposalSubForm
                    key={i}
                    proposal={p}
                    index={i}
                    onChange={updated => {
                      const next = [...formProposals]
                      next[i] = updated
                      setFormProposals(next)
                    }}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Code Snippets (add more dynamically) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <FileCode2 className="h-4 w-4 text-sky-600" /> Code Snippets
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setFormSnippets(prev => [...prev, { file: '', lines: '', language: 'python', code: '' }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Snippet
                </Button>
              </div>
              {formSnippets.length === 0 && (
                <div className="text-xs text-muted-foreground italic">No code snippets added. Click "Add Snippet" to add one.</div>
              )}
              <div className="space-y-2">
                {formSnippets.map((s, i) => (
                  <SnippetSubForm
                    key={i}
                    snippet={s}
                    index={i}
                    onChange={updated => {
                      const next = [...formSnippets]
                      next[i] = updated
                      setFormSnippets(next)
                    }}
                    onRemove={() => setFormSnippets(prev => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Submit button */}
            <div className="flex items-center gap-2">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreateFinding}
                disabled={isCreating}
              >
                {isCreating ? <LoaderCircle className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Create Finding
              </Button>
              <Button variant="outline" onClick={resetForm} disabled={isCreating}>
                Reset Form
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── 2. BULK IMPORT SECTION ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-2 border-sky-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-sky-500/20 border border-sky-500/40">
                <Upload className="h-4 w-4 text-sky-600" />
              </div>
              <div>
                <CardTitle className="text-base text-sky-800 dark:text-sky-200">Bulk Import</CardTitle>
                <CardDescription className="text-xs">Paste a JSON array of findings to import multiple at once</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder='Paste JSON array of findings here, e.g. [{"task":"25","title":"...","tier":"tier2","severity":"medium",...}]'
              value={bulkJson}
              onChange={e => setBulkJson(e.target.value)}
              className="text-sm min-h-[120px] font-mono"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="border-sky-500/40 text-sky-700 hover:bg-sky-500/10"
                onClick={handleBulkPreview}
                disabled={!bulkJson.trim() || isImporting}
              >
                <FileJson className="h-4 w-4 mr-1" /> Preview JSON
              </Button>
              {bulkPreviewOpen && bulkPreview && (
                <Button
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={handleBulkImport}
                  disabled={isImporting}
                >
                  {isImporting ? <LoaderCircle className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  Import {bulkPreview.length} Findings
                </Button>
              )}
            </div>

            {/* Preview section */}
            <AnimatePresence>
              {bulkPreviewOpen && bulkPreview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Separator className="my-2" />
                  <div className="text-sm font-semibold mb-2">Preview — {bulkPreview.length} findings</div>
                  <div className="max-h-64 overflow-y-auto rounded-md border scrollbar-custom">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Task</th>
                          <th className="px-3 py-2 text-left font-semibold">Title</th>
                          <th className="px-3 py-2 text-left font-semibold">Tier</th>
                          <th className="px-3 py-2 text-left font-semibold">Severity</th>
                          <th className="px-3 py-2 text-left font-semibold">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkPreview.map((f, i) => (
                          <tr key={i} className="border-b hover:bg-muted/30">
                            <td className="px-3 py-1.5 font-mono">{f.task ?? '—'}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate">{f.title ?? '—'}</td>
                            <td className="px-3 py-1.5">{f.tier ?? '—'}</td>
                            <td className="px-3 py-1.5">{f.severity ?? '—'}</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate">{f.category ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── 3. EXISTING FINDINGS EDITOR ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40">
                <Edit3 className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <CardTitle className="text-base">Existing Findings Editor</CardTitle>
                <CardDescription className="text-xs">
                  {findings.length} findings in database — inline edit or delete
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>

            {findings.length > 0 && (
              <div className="max-h-[500px] overflow-y-auto rounded-md border scrollbar-custom">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Task</th>
                      <th className="px-3 py-2 text-left font-semibold">Title</th>
                      <th className="px-3 py-2 text-left font-semibold">Severity</th>
                      <th className="px-3 py-2 text-left font-semibold">Tier</th>
                      <th className="px-3 py-2 text-left font-semibold">Category</th>
                      <th className="px-3 py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.id} className={`border-b hover:bg-muted/30 transition-colors ${editingTask === f.task ? 'bg-sky-500/10' : ''}`}>
                        <td className="px-3 py-2 font-mono font-semibold">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">{f.task}</Badge>
                        </td>
                        {editingTask === f.task ? (
                          <>
                            <td className="px-3 py-2">
                              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-xs h-7" />
                            </td>
                            <td className="px-3 py-2">
                              <Select value={editSeverity} onValueChange={v => setEditSeverity(v as Severity)}>
                                <SelectTrigger className="text-xs h-7 w-[90px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="critical">Critical</SelectItem>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Select value={editTier} onValueChange={v => setEditTier(v as Tier)}>
                                <SelectTrigger className="text-xs h-7 w-[90px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="tier0">Tier 0</SelectItem>
                                  <SelectItem value="tier1">Tier 1</SelectItem>
                                  <SelectItem value="tier2">Tier 2</SelectItem>
                                  <SelectItem value="deferred">Deferred</SelectItem>
                                  <SelectItem value="additional">Additional</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <Input value={editCategory} onChange={e => setEditCategory(e.target.value)} className="text-xs h-7" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={handleUpdateFinding}
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                </Button>
                                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEditing}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 max-w-[200px] truncate">{f.title}</td>
                            <td className="px-3 py-2">
                              <Badge className={`${severityConfig[f.severity as Severity]?.bg || ''} ${severityConfig[f.severity as Severity]?.text || ''} text-[10px] border`}>
                                {severityConfig[f.severity as Severity]?.label || f.severity}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{tierLabels[f.tier as Tier]?.short || f.tier}</td>
                            <td className="px-3 py-2 max-w-[120px] truncate">{f.category}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center gap-1 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-sky-700 hover:bg-sky-500/10"
                                  onClick={() => startEditing(f)}
                                >
                                  <Edit3 className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-red-700 hover:bg-red-500/10"
                                  onClick={() => handleDeleteFinding(f.task)}
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {findings.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No findings in database. Use the form above to create one, or bulk import.
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── PROJECT MANAGEMENT ── */}
      <ProjectSection />

      {/* ── AI CONNECTOR ── */}
      <div id="admin-section-ai-connector">
        <AIConnectorPanel />
      </div>

      {/* ── OPENCODE HARNESS ── */}
      <div id="admin-section-opencode">
        <OpencodePanel />
      </div>

      {/* ── BIDIRECTIONAL GITHUB SYNC ── */}
      <div id="admin-section-github-sync">
        <GitHubSyncPanel />
      </div>

      {/* ── AUDIT CONFIG EDITOR ── */}
      <div id="admin-section-audit-config">
        <AuditConfigEditor />
      </div>

      {/* ── GITHUB CONFIGURATION ── */}
      <motion.div id="admin-section-github-config" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Card className="border-2 border-teal-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-500/20 border border-teal-500/40">
                <Github className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <CardTitle className="text-base text-teal-800 dark:text-teal-200">GitHub Integration Settings</CardTitle>
                <CardDescription className="text-xs">Token stored in database — takes effect immediately (no server restart needed)</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Token Configuration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Personal Access Token</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx or github_pat_xxxxx"
                  value={githubToken}
                  onChange={e => setGithubToken(e.target.value)}
                  className="text-sm flex-1"
                />
                <Button
                  variant="default"
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
                  disabled={saveTokenMutation.isPending || !githubToken.trim()}
                  onClick={handleSaveToken}
                >
                  {saveTokenMutation.isPending ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={checkTokenQuery.isFetching}
                  onClick={handleVerifyToken}
                >
                  {checkTokenQuery.isFetching ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Verify
                </Button>
                {githubTokenStatus?.configured && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs border-red-500/40 text-red-700 hover:bg-red-500/10"
                    disabled={deleteTokenMutation.isPending}
                    onClick={handleDeleteToken}
                  >
                    {deleteTokenMutation.isPending ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </Button>
                )}
              </div>
              {githubTokenStatus && (
                <div className={`p-2 rounded-md border text-xs ${
                  githubTokenStatus.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : githubTokenStatus.configured
                      ? 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-300'
                      : 'bg-muted border text-muted-foreground'
                }`}>
                  {githubTokenStatus.valid ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <AlertCircle className="h-3 w-3 mr-1 inline" />}
                  {githubTokenStatus.message}
                  {githubTokenStatus.username && (
                    <span className="ml-2 opacity-70">(user: {githubTokenStatus.username})</span>
                  )}
                  {githubTokenStatus.tokenType && (
                    <span className="ml-2 opacity-70">
                      ({githubTokenStatus.tokenType === 'classic' ? 'Classic PAT (ghp_…)' : githubTokenStatus.tokenType === 'fine-grained' ? 'Fine-grained PAT (github_pat_…)' : 'Unknown type'})
                    </span>
                  )}
                </div>
              )}
              {/* Token type-specific guidance */}
              <div className="p-2 rounded-md border border-dashed text-xs text-muted-foreground bg-muted/30">
                {githubToken && githubToken.startsWith('github_pat_') ? (
                  <>
                    <span className="font-medium text-teal-700 dark:text-teal-300">Fine-grained PAT detected.</span> Required repository permissions:
                    Issues (Read & Write), Metadata (Read), Contents (Read). If creating labels, also need Contents (Read & Write).
                  </>
                ) : githubToken && githubToken.startsWith('ghp_') ? (
                  <>
                    <span className="font-medium text-teal-700 dark:text-teal-300">Classic PAT detected.</span> Required scope: <code className="px-1 py-0.5 bg-muted rounded">repo</code> (full control of private repos) or <code className="px-1 py-0.5 bg-muted rounded">public_repo</code> (for public repos only).
                  </>
                ) : (
                  <>
                    Enter a Personal Access Token: Classic (<code className="px-1 py-0.5 bg-muted rounded">ghp_…</code>) needs <code className="px-1 py-0.5 bg-muted rounded">repo</code> scope. Fine-grained (<code className="px-1 py-0.5 bg-muted rounded">github_pat_…</code>) needs Issues, Metadata & Contents permissions.
                  </>
                )}
              </div>
            </div>

            <Separator />

            {/* Repository Configuration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repository</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The GitHub repo where issues will be created. Defaults to the active project's repository settings.
                Change this if you want to create issues in your own fork or a different repo.
                Saved to database — takes effect immediately.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Owner (e.g. repo-owner)"
                  value={githubRepoOwner}
                  onChange={e => setGithubRepoOwner(e.target.value)}
                  className="text-sm w-44"
                />
                <span className="text-xs text-muted-foreground">/</span>
                <Input
                  type="text"
                  placeholder="Repo name"
                  value={githubRepoName}
                  onChange={e => setGithubRepoName(e.target.value)}
                  className="text-sm w-52"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleSaveRepoConfig}
                  disabled={saveConfigMutation.isPending || !githubRepoOwner.trim() || !githubRepoName.trim()}
                >
                  {saveConfigMutation.isPending ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save Repo
                </Button>
                <a
                  href={`https://github.com/${githubRepoOwner}/${githubRepoName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-teal-600 hover:text-teal-700 underline flex items-center gap-0.5"
                >
                  <ExternalLink className="h-2.5 w-2.5" /> View Repo
                </a>
              </div>
            </div>

            <Separator />

            {/* Project Board Configuration */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Kanban className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project Board Number</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Saved to database — takes effect immediately. Create a GitHub Project first, then enter its number.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="e.g. 1 (your project number)"
                  value={githubProjectNumber}
                  onChange={e => setGithubProjectNumber(e.target.value)}
                  className="text-sm w-32"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={handleSaveProjectNumber}
                  disabled={!githubProjectNumber.trim()}
                >
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  disabled={verifyProjectMutation.isPending || !githubProjectNumber.trim()}
                  onClick={handleVerifyProject}
                >
                  {verifyProjectMutation.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                  Verify Project
                </Button>
              </div>
              {projectVerifyResult && (
                <div className={`p-2 rounded-md border text-xs ${
                  projectVerifyResult.exists
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                }`}>
                  {projectVerifyResult.exists ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="font-semibold">Project #{projectVerifyResult.projectNumber} verified</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {projectVerifyResult.projectTitle}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {projectVerifyResult.projectVisibility}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {projectVerifyResult.projectOwnerType}
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-3 w-3" />
                      <span>{projectVerifyResult.error ?? 'Project not found or token lacks access'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Sync Issues */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Issue Sync</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={syncIssuesQuery.isFetching}
                onClick={handleSyncIssues}
              >
                {syncIssuesQuery.isFetching ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Sync Existing Issues
              </Button>
              {githubSyncResult && (
                <div className="p-2 rounded-md border bg-muted/60 text-xs space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">
                      {githubSyncResult.sync.githubIssuesFound} GitHub issues found
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {githubSyncResult.sync.findingsWithIssues}/{githubSyncResult.sync.totalFindings} findings linked
                    </Badge>
                    {githubSyncResult.sync.unmatched.length > 0 && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-orange-500/10 border border-orange-500/30 text-orange-700 dark:text-orange-300">
                        <TriangleAlert className="h-2.5 w-2.5 mr-0.5" /> {githubSyncResult.sync.unmatched.length} unmatched
                      </Badge>
                    )}
                  </div>
                  {/* Matched issues with finding titles */}
                  {githubSyncResult.issues.filter(i => i.task).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">Matched Issues</span>
                      <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                        {githubSyncResult.issues.filter(i => i.task).map(issue => {
                          const matchingFinding = findings.find(f => String(f.task) === issue.task)
                          return (
                            <div key={issue.issueNumber} className="flex items-center gap-2 text-[10px]">
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                #{issue.issueNumber}
                              </Badge>
                              <Badge className={`text-[10px] px-1 py-0 ${
                                issue.state === 'open' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'
                              }`}>
                                {issue.state}
                              </Badge>
                              <span className="text-muted-foreground truncate max-w-[200px]">
                                {matchingFinding ? matchingFinding.title : `Task ${issue.task}`}
                              </span>
                              <a
                                href={issue.issueUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-teal-600 hover:text-teal-700 underline"
                              >
                                View
                              </a>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {/* Unmatched issues with warning style */}
                  {githubSyncResult.sync.unmatched.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">Unmatched Issues</span>
                      <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                        {githubSyncResult.sync.unmatched.map(issue => (
                          <div key={issue.issueNumber} className="flex items-center gap-2 text-[10px] bg-orange-500/5 border border-orange-500/20 rounded px-1 py-0.5">
                            <TriangleAlert className="h-2.5 w-2.5 text-orange-500" />
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-orange-500/30 text-orange-700">
                              #{issue.issueNumber}
                            </Badge>
                            <span className="text-orange-700 dark:text-orange-300 truncate">
                              No matching finding in dashboard
                            </span>
                            <a
                              href={issue.issueUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-600 hover:text-teal-700 underline"
                            >
                              View
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
