'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useProject } from '@/lib/project-context'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Tabs, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Button,
} from '@/components/ui/button'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ShieldAlert, ShieldCheck, Sun, Moon, CheckSquare,
  GitCompare, BookmarkCheck, Keyboard, Command, Github,
  Activity, Bug, GitBranch, Zap, FolderTree, Network, Edit3,
  ArrowUp, FileJson, FileText, FileSpreadsheet, Printer,
  ChevronDown, FolderOpen, Check, Archive,
} from 'lucide-react'
import type { Severity, Tier, AuditStatus, UnifiedModuleId } from '@/lib/audit-types'
import {
  severityConfig, getRiskScore,
} from '@/lib/audit-data'
import {
  type Finding, type UnifiedModule, type BestProposalAnalysis, type G3BlockedItem,
} from '@/lib/data'
import {
  useCreateGitHubIssue, useAddToProject, useGitHubTokenStatus,
  type GitHubIssueResult, type GitHubTokenStatus, type GitHubProjectResult,
  addActivityEntry, type ActivityType,
} from '@/lib/use-findings'
import { useAuditProgress } from '@/lib/use-audit-progress'
import { useHealthScore } from '@/components/health-score-gauge'
import { useQuickWins } from '@/components/quick-wins-panel'
import { useRemediationVelocity } from '@/components/remediation-velocity'
import { toast } from 'sonner'
import {
  severityOrder, tierOrder, severityColors,
} from '@/lib/dashboard-constants'
import dynamic from 'next/dynamic'

/* ─── LAZY-LOADED TAB CONTENT (ssr: false) ───
 * Each tab content is loaded only when the user switches to that tab.
 * This dramatically reduces SSR memory footprint because the server
 * never needs to import or render the heavy sub-components. */

const OverviewTabContent = dynamic(
  () => import('./overview-tab-content').then(m => m.OverviewTabContent),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading overview...</div> },
)
const FindingsTabContent = dynamic(
  () => import('./findings-tab-content').then(m => m.FindingsTabContent),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading findings...</div> },
)
const RoadmapTabContent = dynamic(
  () => import('./roadmap-tab-content').then(m => m.RoadmapTabContent),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading roadmap...</div> },
)
const UnifiedTabContent = dynamic(
  () => import('./unified-tab-content').then(m => m.UnifiedTabContent),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading unified modules...</div> },
)

/* ─── LAZY-LOADED SUB-COMPONENTS (ssr: false) ───
 * Floating panels, dialogs, and tab-specific components that only
 * render conditionally — keep them out of the SSR path entirely. */

const FileTreeView = dynamic(
  () => import('./file-tree-view').then(m => m.FileTreeView),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading file tree...</div> },
)
const DependencyGraph = dynamic(
  () => import('./dependency-graph').then(m => m.DependencyGraph),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading dependency graph...</div> },
)
const AdminTab = dynamic(
  () => import('./admin-tab').then(m => m.AdminTab),
  { ssr: false, loading: () => <div className="min-h-[200px] flex items-center justify-center text-muted-foreground text-sm animate-pulse">Loading admin panel...</div> },
)
const FindingDetailDialog = dynamic(
  () => import('./finding-dialog').then(m => m.FindingDetailDialog),
  { ssr: false },
)
const FloatingStats = dynamic(
  () => import('./floating-stats').then(m => m.FloatingStats),
  { ssr: false },
)
const CompareDrawer = dynamic(
  () => import('./compare-drawer').then(m => m.CompareDrawer),
  { ssr: false },
)
const BatchActionsToolbar = dynamic(
  () => import('./batch-actions-toolbar').then(m => m.BatchActionsToolbar),
  { ssr: false },
)
const KeyboardShortcutsDialog = dynamic(
  () => import('./keyboard-shortcuts').then(m => m.KeyboardShortcutsDialog),
  { ssr: false },
)
const FindingsStatsPanel = dynamic(
  () => import('./findings-stats-panel').then(m => m.FindingsStatsPanel),
  { ssr: false },
)
const AIChatPanel = dynamic(
  () => import('./ai-chat-panel').then(m => m.AIChatPanel),
  { ssr: false },
)
const CommandPalette = dynamic(
  () => import('./command-palette').then(m => m.CommandPalette),
  { ssr: false },
)
const ActivityLog = dynamic(
  () => import('./activity-log').then(m => m.ActivityLog),
  { ssr: false },
)

/* ─── THEME TOGGLE ─── */
function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])
  if (!mounted) return <div className="w-9 h-9" />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}</TooltipContent>
    </Tooltip>
  )
}

/* ─── PROJECT SELECTOR ─── */
function ProjectSelector() {
  const { activeProjectId, setActiveProjectId, projects, activeProject, isLoading } = useProject()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded" />
        <ChevronDown className="h-4 w-4 text-muted-foreground opacity-50" />
      </div>
    )
  }

  if (projects.length === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background hover:bg-accent/50 transition-colors text-sm font-medium truncate max-w-[200px] sm:max-w-[280px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Select project"
        >
          <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{activeProject?.name ?? 'Select project'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => setActiveProjectId(project.id)}
            className="flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2 min-w-0">
              {project.id === activeProjectId && (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              {project.id !== activeProjectId && <span className="w-3.5" />}
              <span className="truncate">{project.name}</span>
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
              {project.findingCount}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ─── READING PROGRESS ─── */
function ReadingProgress({ mounted }: { mounted: boolean }) {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (!mounted) return
    const handler = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      const current = window.scrollY
      setProgress(total > 0 ? Math.min(100, (current / total) * 100) : 0)
    }
    window.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => window.removeEventListener('scroll', handler)
  }, [mounted])
  if (!mounted) {
    return <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-transparent pointer-events-none" />
  }
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-1 bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}

/* ─── MAIN DASHBOARD CLIENT ─── */
export function DashboardClient({
  initialFindings,
  initialModules,
  initialAnalyses,
  initialG3Blocked,
}: {
  initialFindings?: Finding[]
  initialModules?: UnifiedModule[]
  initialAnalyses?: BestProposalAnalysis[]
  initialG3Blocked?: G3BlockedItem[]
} = {}) {
  const router = useRouter()
  const { activeProjectId, activeProject } = useProject()
  const [mounted, setMounted] = useState(false)
  // ── Client-side data fetching (fallback when SSR props aren't provided) ──
  const [findingsData, setFindingsData] = useState<Finding[]>(initialFindings ?? [])
  const [modulesData, setModulesData] = useState<UnifiedModule[]>(initialModules ?? [])
  const [analysesData, setAnalysesData] = useState<BestProposalAnalysis[]>(initialAnalyses ?? [])
  const [g3BlockedData, setG3BlockedData] = useState<G3BlockedItem[]>(initialG3Blocked ?? [])
  const [dataLoaded, setDataLoaded] = useState<boolean>(Boolean(initialFindings?.length))

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    if (!mounted) return // Wait for hydration before fetching data
    if (dataLoaded) return // Already have data from SSR props
    // Fetch data from API routes when no SSR data is available
    const fetchData = async () => {
      try {
        const findingsRes = await fetch('/api/findings')
        if (findingsRes.ok) {
          const findingsJson = await findingsRes.json() as { findings: Finding[]; analyses: BestProposalAnalysis[]; g3Blocked?: G3BlockedItem[] }
          setFindingsData(findingsJson.findings)
          setAnalysesData(findingsJson.analyses ?? [])
        }
        const modulesRes = await fetch('/api/findings/modules')
        if (modulesRes.ok) {
          const modulesJson = await modulesRes.json() as { modules: UnifiedModule[]; g3Blocked?: G3BlockedItem[] }
          setModulesData(modulesJson.modules)
          if (modulesJson.g3Blocked) setG3BlockedData(modulesJson.g3Blocked)
        }
        setDataLoaded(true)
      } catch (err) {
        console.error('Failed to fetch data:', err)
      }
    }
    fetchData()
  }, [mounted, dataLoaded])
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [verificationFilter, setVerificationFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('tier')
  const [expandedAll, setExpandedAll] = useState<Set<string | number>>(new Set())
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bookmarks, setBookmarks] = useState<Set<string | number>>(new Set())
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activePresetName, setActivePresetName] = useState<string | null>(null)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [adminSection, setAdminSection] = useState<string>('none')
  const [aiChatOpen, setAiChatOpen] = useState(false)

  const { theme, setTheme } = useTheme()

  // Deep dive banner state
  const [deepDive, setDeepDive] = useState<{ severity: Severity; impact: number; count: number } | null>(null)
  const impactLabelMap: Record<number, string> = { 0: 'Low Impact', 1: 'Medium Impact', 2: 'High Impact', 3: 'Critical Impact' }

  // Bulk selection + compare drawer
  const [bulkSelectMode, setBulkSelectMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string | number>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSelected, setCompareSelected] = useState<(string | number)[]>([])

  // GitHub integration state
  const createGitHubIssueMutation = useCreateGitHubIssue()
  const addToProjectMutation = useAddToProject()
  const checkTokenQuery = useGitHubTokenStatus()
  const [githubTokenStatus, setGithubTokenStatus] = useState<GitHubTokenStatus | null>(null)
  const [githubIssueResults, setGithubIssueResults] = useState<Record<string, GitHubIssueResult | null>>({})
  const [githubProjectNumber, setGithubProjectNumber] = useState<number | null>(null)
  const [creatingAndLinking, setCreatingAndLinking] = useState<Record<string, boolean>>({})

  // Gate all client-only side effects on `mounted` to prevent hydration mismatch
  // The mounted flag is set in a requestAnimationFrame after initial render,
  // ensuring the first render cycle produces stable, predictable HTML that
  // matches what the client expects — then data-fetching effects fire.
  useEffect(() => {
    if (!mounted) return
    if (checkTokenQuery.data) {
      setGithubTokenStatus(checkTokenQuery.data)
      if (checkTokenQuery.data.projectNumber) {
        setGithubProjectNumber(checkTokenQuery.data.projectNumber)
      }
    } else if (checkTokenQuery.error) {
      setGithubTokenStatus({ configured: false, message: 'Failed to check token' })
    }
  }, [mounted, checkTokenQuery.data, checkTokenQuery.error])

  useEffect(() => {
    if (!mounted) return
    try {
      const saved = localStorage.getItem(`github-project-number-${activeProjectId ?? 'default'}`)
      if (saved && !githubProjectNumber) {
        setGithubProjectNumber(Number(saved))
      }
    } catch { /* ignore */ }
  }, [mounted, activeProjectId])

  const handleCreateIssue = useCallback((finding: Finding) => {
    if (finding.githubIssueUrl) return
    createGitHubIssueMutation.mutate(finding, {
      onSuccess: (data) => {
        setGithubIssueResults(prev => ({ ...prev, [finding.task]: data }))
        addActivityEntry({ type: 'issue_create', task: String(finding.task), description: `Created GitHub issue #${data.issueNumber} for Task ${finding.task}: ${finding.title}` })
      },
      onError: (err) => {
        console.error('Failed to create GitHub issue:', err.message)
      },
    })
  }, [createGitHubIssueMutation])

  const handleAddToProject = useCallback((issueNodeId: string, projectNumber: number) => {
    addToProjectMutation.mutate({ issueNodeId, projectNumber })
  }, [addToProjectMutation])

  const handleCreateIssueAndLink = useCallback(async (finding: Finding) => {
    if (finding.githubIssueUrl) return
    if (!githubProjectNumber) return
    setCreatingAndLinking(prev => ({ ...prev, [finding.task]: true }))
    try {
      const issueRes = await fetch('/api/github/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finding),
      })
      if (!issueRes.ok) {
        const err = await issueRes.json()
        throw new Error((err as Record<string, string>).error || 'Failed to create issue')
      }
      const issueData = await issueRes.json() as GitHubIssueResult
      setGithubIssueResults(prev => ({ ...prev, [finding.task]: issueData }))
      addActivityEntry({ type: 'issue_create', task: String(finding.task), description: `Created GitHub issue #${issueData.issueNumber} for Task ${finding.task}: ${finding.title}` })

      const projectRes = await fetch('/api/github/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueNodeId: String(issueData.issueId), projectNumber: githubProjectNumber }),
      })
      if (!projectRes.ok) {
        const err = await projectRes.json()
        console.error('Failed to add to project:', (err as Record<string, string>).error)
        addActivityEntry({ type: 'issue_create', task: String(finding.task), description: `Issue #${issueData.issueNumber} created but failed to link to Project #${githubProjectNumber}: ${(err as Record<string, string>).error}` })
      } else {
        const projectData = await projectRes.json() as GitHubProjectResult
        addActivityEntry({ type: 'issue_create', task: String(finding.task), description: `Created issue #${issueData.issueNumber} and linked to Project #${githubProjectNumber} "${projectData.projectTitle}"` })
      }
    } catch (err) {
      console.error('Create & Link failed:', (err as Error).message)
    } finally {
      setCreatingAndLinking(prev => ({ ...prev, [finding.task]: false }))
      router.refresh()
    }
  }, [githubProjectNumber, addActivityEntry, router])

  const findings = findingsData
  const modules = modulesData
  const analyses = analysesData
  const g3Blocked = g3BlockedData

  const analysisMap = useMemo(() => {
    const map: Record<string, BestProposalAnalysis | undefined> = {}
    analyses.forEach(a => { map[a.task] = a })
    return map
  }, [analyses])

  const moduleMap = useMemo(() => {
    const map: Record<string, UnifiedModule | undefined> = {}
    modules.forEach(m => { map[m.id] = m })
    return map
  }, [modules])

  const {
    statuses, notes, setStatus, setNote, getNote, resetAll, stats: progressStats,
  } = useAuditProgress(findings.map(f => String(f.task)))

  useEffect(() => {
    if (!mounted) return
    try {
      const saved = localStorage.getItem(`audit-bookmarks-${activeProjectId ?? 'default'}`)
      if (saved) {
        const arr = JSON.parse(saved) as (string | number)[]
        setBookmarks(new Set(arr))
      }
    } catch { /* ignore */ }
  }, [mounted, activeProjectId])

  useEffect(() => {
    try {
      localStorage.setItem(`audit-bookmarks-${activeProjectId ?? 'default'}`, JSON.stringify(Array.from(bookmarks)))
    } catch { /* ignore */ }
  }, [bookmarks, activeProjectId])

  useEffect(() => {
    if (!mounted) return
    const handler = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', handler, { passive: true })
    handler()
    return () => window.removeEventListener('scroll', handler)
  }, [mounted])

  const toggleBookmark = useCallback((task: string | number) => {
    setBookmarks(prev => {
      const next = new Set(prev)
      const isAdding = !next.has(task)
      if (isAdding) next.add(task)
      else next.delete(task)
      addActivityEntry({ type: 'bookmark', task: String(task), description: isAdding ? `Bookmarked Task ${task}` : `Removed bookmark for Task ${task}` })
      return next
    })
  }, [])

  const openDetails = useCallback((finding: Finding) => {
    setSelectedFinding(finding)
    setDialogOpen(true)
  }, [])

  const navigateToFinding = useCallback((task: number | string) => {
    const finding = findings.find(f => f.task === task)
    if (finding) {
      openDetails(finding)
    }
  }, [findings, openDetails])

  const applyPresetByName = useCallback((name: string) => {
    import('./filter-presets').then(({ BUILT_IN_PRESETS, FILTER_PRESETS_STORAGE_KEY }) => {
      let customPresets: any[] = []
      try {
        const stored = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            customPresets = parsed.filter((p: any) => !p.isBuiltIn)
          }
        }
      } catch { /* ignore */ }

      const all = [...BUILT_IN_PRESETS, ...customPresets]
      const preset = all.find((p: any) => p.name === name)
        ?? all.find((p: any) => p.name.toLowerCase() === name.toLowerCase())
        ?? all.find((p: any) => p.name.toLowerCase().includes(name.toLowerCase()))

      if (!preset) {
        toast.error(`No preset named "${name}"`, { duration: 2000 })
        return
      }

      setSearch(preset.search)
      setSeverityFilter(preset.severityFilter)
      setVerificationFilter(preset.verificationFilter)
      setCategoryFilter(preset.categoryFilter)
      setStatusFilter(preset.statusFilter)
      setShowBookmarkedOnly(preset.showBookmarkedOnly)
      setActivePresetName(preset.name)
      setDeepDive(null)
      setActiveTab('findings')
      toast.success(`Applied preset: ${preset.name}`, { duration: 2000 })
    })
  }, [])

  const toggleThemeAction = useCallback(() => {
    if (!mounted) return
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme, mounted])

  const handlePaletteExport = useCallback((format: 'json' | 'csv' | 'markdown') => {
    import('./export-enhancements').then(({ exportJSONEnhanced, exportMarkdownEnhanced, exportCSV }) => {
      const projectInfo = activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined
      if (format === 'json') exportJSONEnhanced([], findings, statuses as Record<string, string>, projectInfo)
      else if (format === 'csv') exportCSV([], findings)
      else exportMarkdownEnhanced([], findings, statuses as Record<string, string>, projectInfo)
      toast.success(`Exported findings as ${format.toUpperCase()}`, { duration: 2000 })
    })
  }, [findings, statuses, activeProject])

  const toggleExpandAll = useCallback(() => {
    setExpandedAll(prev => {
      if (prev.size > 0) return new Set()
      return new Set(findings.map(f => f.task))
    })
  }, [findings])

  const toggleBulkSelected = useCallback((task: string | number) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(task)) next.delete(task)
      else next.add(task)
      return next
    })
  }, [])

  const selectAllVisible = useCallback((tasks: (string | number)[]) => {
    setBulkSelected(new Set(tasks))
  }, [])

  const clearBulkSelection = useCallback(() => {
    setBulkSelected(new Set())
  }, [])

  const toggleCompare = useCallback((task: string | number) => {
    setCompareSelected(prev => {
      if (prev.includes(task)) return prev.filter(t => t !== task)
      if (prev.length >= 3) return prev
      return [...prev, task]
    })
  }, [])

  const addToCompare = useCallback((task: string | number) => {
    setCompareSelected(prev => {
      if (prev.includes(task)) return prev
      if (prev.length >= 3) return prev
      return [...prev, task]
    })
  }, [])

  const removeFromCompare = useCallback((task: string | number) => {
    setCompareSelected(prev => prev.filter(t => t !== task))
  }, [])

  // Keyboard shortcuts
  const [keyBuffer, setKeyBuffer] = useState<string | null>(null)
  const [focusedFindingIndex, setFocusedFindingIndex] = useState<number>(-1)
  const filteredFindingsRef = useRef<Finding[]>([])

  useEffect(() => {
    if (!keyBuffer) return
    const timer = setTimeout(() => setKeyBuffer(null), 500)
    return () => clearTimeout(timer)
  }, [keyBuffer])

  useEffect(() => {
    const list = filteredFindingsRef.current
    if (focusedFindingIndex < 0 || focusedFindingIndex >= list.length) return
    const task = String(list[focusedFindingIndex].task)
    const el = document.querySelector(`[data-finding-task="${task}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusedFindingIndex])

  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setCmdPaletteOpen(v => !v)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setActiveTab('admin')
        setAdminSection('ai-connector')
        toast.success('Opened AI Connector settings', { duration: 1500 })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'G' || e.key === 'g')) {
        e.preventDefault()
        setActiveTab('admin')
        setAdminSection('github-sync')
        toast.success('Opened GitHub Sync panel', { duration: 1500 })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'O' || e.key === 'o')) {
        e.preventDefault()
        setActiveTab('admin')
        setAdminSection('opencode')
        toast.success('Opened Opencode Harness panel', { duration: 1500 })
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault()
        const list = filteredFindingsRef.current
        if (focusedFindingIndex >= 0 && focusedFindingIndex < list.length) {
          setActiveTab('admin')
          setAdminSection('opencode')
          toast.success(`Sending Task ${list[focusedFindingIndex].task} to Opencode`, { duration: 1500 })
        } else {
          setActiveTab('admin')
          setAdminSection('opencode')
          toast.info('Opencode panel opened — select a task to send', { duration: 1500 })
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault()
        setActiveTab('admin')
        setAdminSection('opencode')
        toast.info('Opencode Review mode', { duration: 2000 })
        return
      }
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault()
        setActiveTab('admin')
        setAdminSection('audit-config')
        toast.success('Opened Audit Config editor', { duration: 1500 })
        return
      }
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setAiChatOpen(v => !v)
        return
      }
      if (keyBuffer === 'G') {
        e.preventDefault()
        const tabMap: Record<string, string> = {
          'o': 'overview', 'O': 'overview', 'f': 'findings', 'F': 'findings',
          'r': 'roadmap', 'R': 'roadmap', 'u': 'unified', 'U': 'unified',
          'l': 'files', 'L': 'files', 'd': 'dependencies', 'D': 'dependencies',
          'a': 'admin', 'A': 'admin',
        }
        if (tabMap[e.key]) {
          setActiveTab(tabMap[e.key])
          toast.success(`Navigated to ${tabMap[e.key]} tab`, { duration: 1500 })
        }
        setKeyBuffer(null)
        return
      }
      if (e.key === 'g' || e.key === 'G') {
        if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); setKeyBuffer('G'); return }
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault(); setShowShortcuts(s => !s); return
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null
        searchInput?.focus()
        return
      }
      if (e.key === 'Escape') {
        if (cmdPaletteOpen) setCmdPaletteOpen(false)
        else if (compareOpen) setCompareOpen(false)
        else if (dialogOpen) setDialogOpen(false)
        else if (showShortcuts) setShowShortcuts(false)
        else if (keyBuffer) setKeyBuffer(null)
        else if (focusedFindingIndex >= 0) setFocusedFindingIndex(-1)
        return
      }
      if (e.key === 'j' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setFocusedFindingIndex(prev => { const next = prev + 1; return next < filteredFindingsRef.current.length ? next : prev })
        return
      }
      if (e.key === 'k' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setFocusedFindingIndex(prev => { const next = prev - 1; return next >= 0 ? next : -1 })
        return
      }
      if (e.key === 'Enter') {
        const list = filteredFindingsRef.current
        if (focusedFindingIndex >= 0 && focusedFindingIndex < list.length) {
          e.preventDefault()
          const task = list[focusedFindingIndex].task
          setExpandedAll(prev => { const next = new Set(prev); if (next.has(task)) next.delete(task); else next.add(task); return next })
          return
        }
      }
      if (e.key === 'x' && !e.ctrlKey && !e.metaKey) {
        const list = filteredFindingsRef.current
        if (focusedFindingIndex >= 0 && focusedFindingIndex < list.length) {
          e.preventDefault()
          addToCompare(list[focusedFindingIndex].task)
          toast.success(`Added Task ${list[focusedFindingIndex].task} to compare tray`, { duration: 1500 })
          return
        }
      }
      if (e.key === 't' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleThemeAction(); return }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowBookmarkedOnly(v => !v); return }
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setCompareOpen(v => !v); return }
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setBulkSelectMode(v => !v); if (!bulkSelectMode) setBulkSelected(new Set()); return }
      if (e.key === 'e' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleExpandAll(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mounted, dialogOpen, showShortcuts, toggleExpandAll, compareOpen, bulkSelectMode, keyBuffer, focusedFindingIndex, cmdPaletteOpen, toggleThemeAction, addToCompare])

  // Filter + sort
  const filteredFindings = useMemo(() => {
    let result = findings.slice()
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(f =>
        f.title.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q) ||
        f.claim.toLowerCase().includes(q) || f.evidence.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) || f.findingIds.some(id => id.toLowerCase().includes(q)) ||
        String(f.task).toLowerCase().includes(q) || f.affectedFiles.some(file => file.toLowerCase().includes(q))
      )
    }
    if (severityFilter !== 'all') result = result.filter(f => f.severity === severityFilter)
    if (verificationFilter !== 'all') result = result.filter(f => f.verificationStatus === verificationFilter)
    if (categoryFilter !== 'all') result = result.filter(f => f.category === categoryFilter)
    if (statusFilter !== 'all') result = result.filter(f => (statuses[String(f.task)] ?? 'not-started') === statusFilter)
    if (showBookmarkedOnly) result = result.filter(f => bookmarks.has(f.task))
    if (sortBy === 'severity') result.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    else if (sortBy === 'tier') result.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier])
    else if (sortBy === 'risk') result.sort((a, b) => getRiskScore(b.severity, b.tier) - getRiskScore(a.severity, a.tier))
    return result
  }, [findings, search, severityFilter, verificationFilter, categoryFilter, statusFilter, showBookmarkedOnly, bookmarks, sortBy, statuses])

  filteredFindingsRef.current = filteredFindings

  // Stats (lightweight computation, no heavy imports needed)
  const stats = useMemo(() => {
    const totalProposals = findings.reduce((sum, f) => sum + f.proposals.length, 0)
    const criticalCount = findings.filter(f => f.severity === 'critical').length
    const highCount = findings.filter(f => f.severity === 'high').length
    const execCount = findings.filter(f => f.verificationStatus === 'confirmed-execution').length
    const readCount = findings.filter(f => f.verificationStatus === 'confirmed-reading').length
    const logicalCount = findings.filter(f => f.verificationStatus === 'confirmed-logical').length
    const affectedFilesCount = new Set(findings.flatMap(f => f.affectedFiles)).size
    return { totalProposals, criticalCount, highCount, execCount, readCount, logicalCount, affectedFilesCount }
  }, [findings])

  // Computed values for Overview tab — hooks called here (lightweight), results passed to lazy-loaded tab
  const healthScore = useHealthScore(findings, statuses as Record<string, string>)
  const quickWins = useQuickWins(findings, statuses as Record<string, string>)
  const remediationVelocity = useRemediationVelocity(findings, statuses as Record<string, string>)

  const scrollToTop = () => { window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // Show skeleton while data is loading from API
  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background bg-gradient-mesh">
        <div className="flex flex-col items-center gap-4">
          <ShieldAlert className="h-10 w-10 text-red-600 animate-pulse" />
          <div className="text-lg font-semibold">Loading Audit Data...</div>
          <div className="text-muted-foreground text-sm">Fetching findings, proposals, and analyses from the server</div>
          <div className="flex gap-1">
            <div className="h-2 w-2 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="h-2 w-2 bg-orange-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="h-2 w-2 bg-yellow-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background bg-gradient-mesh">
      <ReadingProgress mounted={mounted} />

      {/* HEADER */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50 no-print header-gradient-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative">
                <ShieldAlert className="h-8 w-8 text-red-600" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600" />
                </span>
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate">
                  {activeProject?.name ?? 'Audit Dashboard'} — Audit
                </h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Independent fact-check verification &bull; {findings.length} findings &bull; {stats.totalProposals} proposals
                </p>
              </div>
            </div>
            <ProjectSelector />
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={bulkSelectMode ? 'default' : 'outline'} size="icon" onClick={() => { setBulkSelectMode(v => !v); if (bulkSelectMode) setBulkSelected(new Set()) }} aria-label="Toggle bulk selection" className="relative">
                      <CheckSquare className="h-4 w-4" />
                      {bulkSelected.size > 0 && <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">{bulkSelected.size}</span>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Bulk selection mode (s)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={compareOpen ? 'default' : 'outline'} size="icon" onClick={() => setCompareOpen(v => !v)} aria-label="Open compare drawer" className="relative">
                      <GitCompare className="h-4 w-4" />
                      {compareSelected.length > 0 && <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">{compareSelected.length}</span>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Compare findings (c) — {compareSelected.length}/3 selected</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={showBookmarkedOnly ? 'default' : 'outline'} size="icon" onClick={() => setShowBookmarkedOnly(v => !v)} aria-label="Toggle bookmarks filter" className="relative">
                      <BookmarkCheck className="h-4 w-4" />
                      {bookmarks.size > 0 && <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">{bookmarks.size}</span>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{showBookmarkedOnly ? 'Showing bookmarked only' : 'Show bookmarked only'} ({bookmarks.size})</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" onClick={() => setShowShortcuts(s => !s)} aria-label="Keyboard shortcuts"><Keyboard className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="btn-subtle-hover" onClick={() => { import('./export-enhancements').then(m => m.exportJSONEnhanced([], findings, statuses as Record<string, string>, activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined)) }} aria-label="Export Enhanced JSON"><FileJson className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Export as Enhanced JSON</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="btn-subtle-hover" onClick={() => { import('./export-enhancements').then(m => m.exportMarkdownEnhanced([], findings, statuses as Record<string, string>, activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined)) }} aria-label="Export Enhanced Markdown"><FileText className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Export as Enhanced Markdown</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="btn-subtle-hover" onClick={() => { import('./export-enhancements').then(m => m.exportCSV([], findings)) }} aria-label="Export CSV"><FileSpreadsheet className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Export as CSV</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="btn-subtle-hover" onClick={() => { import('./export-enhancements').then(m => m.exportPDF()) }} aria-label="Print / PDF"><Printer className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Print / Save as PDF</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="btn-subtle-hover border-violet-500/40 text-violet-600"
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = '/api/download'
                        a.download = 'audit-dashboard-project.zip'
                        a.click()
                        toast.success('Project archive download started — all source files, configs, DB & docs packed into .zip')
                      }}
                      aria-label="Download project as ZIP"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Download project as .zip</TooltipContent>
                </Tooltip>
                <ThemeToggle />
                <Tooltip>
                  <TooltipTrigger asChild><Button variant="outline" size="icon" className="relative btn-subtle-hover border-emerald-500/40 text-emerald-600" onClick={() => setCmdPaletteOpen(true)} aria-label="Open command palette"><Command className="h-4 w-4" /></Button></TooltipTrigger>
                  <TooltipContent>Command palette (⌘K)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" className={`relative ${githubTokenStatus?.valid ? 'border-teal-500/40 text-teal-600' : 'border-orange-500/40 text-orange-500'}`} onClick={() => setActiveTab('admin')} aria-label="GitHub integration status">
                      <Github className="h-4 w-4" />
                      {findings.some(f => f.githubIssueUrl) && <span className="absolute -top-1 -right-1 bg-teal-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">{findings.filter(f => f.githubIssueUrl).length}</span>}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {githubTokenStatus?.valid ? `GitHub connected (${githubTokenStatus.username}) — ${findings.filter(f => f.githubIssueUrl).length} issues created` : githubTokenStatus?.configured ? 'GitHub token set but invalid' : 'No GitHub token — click to configure'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full">
        <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); if (tab !== 'admin') setAdminSection('none'); }} className="space-y-4">
          <TabsList className="grid grid-cols-7 w-full max-w-3xl mx-auto h-auto no-print">
            <TabsTrigger value="overview" className="text-xs sm:text-sm py-2 btn-subtle-hover"><Activity className="h-3.5 w-3.5 sm:mr-1.5" /> Overview</TabsTrigger>
            <TabsTrigger value="findings" className="text-xs sm:text-sm py-2 btn-subtle-hover"><Bug className="h-3.5 w-3.5 sm:mr-1.5" /> Findings</TabsTrigger>
            <TabsTrigger value="roadmap" className="text-xs sm:text-sm py-2 btn-subtle-hover"><GitBranch className="h-3.5 w-3.5 sm:mr-1.5" /> Roadmap</TabsTrigger>
            <TabsTrigger value="unified" className="text-xs sm:text-sm py-2 btn-subtle-hover"><Zap className="h-3.5 w-3.5 sm:mr-1.5" /> Unified</TabsTrigger>
            <TabsTrigger value="files" className="text-xs sm:text-sm py-2 btn-subtle-hover"><FolderTree className="h-3.5 w-3.5 sm:mr-1.5" /> Files</TabsTrigger>
            <TabsTrigger value="dependencies" className="text-xs sm:text-sm py-2 btn-subtle-hover"><Network className="h-3.5 w-3.5 sm:mr-1.5" /> Deps</TabsTrigger>
            <TabsTrigger value="admin" className="text-xs sm:text-sm py-2 btn-subtle-hover"><Edit3 className="h-3.5 w-3.5 sm:mr-1.5" /> Admin</TabsTrigger>
          </TabsList>

          {/* ─── OVERVIEW TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'overview' && (
            <OverviewTabContent
              findings={findings} modules={modules} stats={stats}
              healthScore={healthScore} quickWins={quickWins} remediationVelocity={remediationVelocity}
              progressStats={progressStats} statuses={statuses as Record<string, string>}
              openDetails={openDetails} setActiveTab={setActiveTab} setSearch={setSearch}
              setStatusFilter={setStatusFilter} setSeverityFilter={setSeverityFilter}
              setCategoryFilter={setCategoryFilter} setVerificationFilter={setVerificationFilter}
              setShowBookmarkedOnly={setShowBookmarkedOnly} setDeepDive={setDeepDive} resetAll={resetAll}
            />
          )}

          {/* ─── FINDINGS TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'findings' && (
            <FindingsTabContent
              findings={findings} filteredFindings={filteredFindings} analysisMap={analysisMap}
              search={search} setSearch={setSearch} severityFilter={severityFilter} setSeverityFilter={setSeverityFilter}
              verificationFilter={verificationFilter} setVerificationFilter={setVerificationFilter}
              categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter}
              statusFilter={statusFilter} setStatusFilter={setStatusFilter}
              sortBy={sortBy} setSortBy={setSortBy}
              showBookmarkedOnly={showBookmarkedOnly} setShowBookmarkedOnly={setShowBookmarkedOnly}
              bookmarks={bookmarks} toggleBookmark={toggleBookmark}
              expandedAll={expandedAll} setExpandedAll={setExpandedAll} toggleExpandAll={toggleExpandAll}
              bulkSelectMode={bulkSelectMode} bulkSelected={bulkSelected} toggleBulkSelected={toggleBulkSelected}
              selectAllVisible={selectAllVisible} clearBulkSelection={clearBulkSelection}
              compareSelected={compareSelected} toggleCompare={toggleCompare} addToCompare={addToCompare}
              focusedFindingIndex={focusedFindingIndex}
              deepDive={deepDive} setDeepDive={setDeepDive} impactLabelMap={impactLabelMap}
              openDetails={openDetails} statuses={statuses as Record<string, string>}
              setStatus={setStatus} getNote={getNote} setNote={setNote} progressStats={progressStats}
              activePresetName={activePresetName} setActivePresetName={setActivePresetName}
              githubTokenStatus={githubTokenStatus} handleCreateIssue={handleCreateIssue}
              creatingIssue={createGitHubIssueMutation.isPending}
              githubIssueResults={githubIssueResults} githubProjectNumber={githubProjectNumber}
              handleAddToProject={handleAddToProject} addingToProject={addToProjectMutation.isPending}
              handleCreateIssueAndLink={handleCreateIssueAndLink} creatingAndLinking={creatingAndLinking}
            />
          )}

          {/* ─── ROADMAP TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'roadmap' && <RoadmapTabContent findings={findings} />}

          {/* ─── UNIFIED TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'unified' && (
            <UnifiedTabContent findings={findings} modules={modules} analysisMap={analysisMap} moduleMap={moduleMap} g3Blocked={g3Blocked} />
          )}

          {/* ─── FILES TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'files' && (
            <FileTreeView
              findings={findings}
              onNavigateToFinding={(f) => openDetails(f)}
              bookmarks={bookmarks}
              onToggleBookmark={(task) => { toggleBookmark(task); addActivityEntry({ type: 'bookmark', task: String(task), description: `Toggled bookmark for Task ${task} from Files tab` }) }}
              findingStatuses={statuses}
              onStatusChange={(task, status) => { setStatus(task, status as AuditStatus); addActivityEntry({ type: 'status_change', task: String(task), description: `Changed status of Task ${task} to ${status} from Files tab` }) }}
            />
          )}

          {/* ─── DEPENDENCIES TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'dependencies' && <DependencyGraph onNavigateToFinding={navigateToFinding} />}

          {/* ─── ADMIN TAB (lazy-loaded, ssr:false) ─── */}
          {activeTab === 'admin' && <AdminTab findings={findings} modules={modules} focusSection={adminSection} />}
        </Tabs>
      </main>

      {/* SCROLL TO TOP */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="fixed bottom-6 right-6 z-40 no-print">
            <Button size="icon" onClick={scrollToTop} className="rounded-full shadow-lg" aria-label="Scroll to top"><ArrowUp className="h-4 w-4" /></Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FLOATING / CONDITIONAL PANELS (all lazy-loaded, ssr:false) */}
      <FindingDetailDialog finding={selectedFinding} open={dialogOpen} onOpenChange={setDialogOpen} />
      <FloatingStats filteredCount={filteredFindings.length} totalCount={findings.length} bookmarkCount={bookmarks.size} progressPercent={progressStats.percentComplete} resolvedCount={progressStats.resolved} />
      <CompareDrawer open={compareOpen} onOpenChange={setCompareOpen} selectedTasks={compareSelected} onAddTask={addToCompare} onRemoveTask={removeFromCompare} onClear={() => setCompareSelected([])} statuses={statuses as Record<string, string>} />
      {bulkSelectMode && <BatchActionsToolbar selectedTasks={bulkSelected} findings={findings} statuses={statuses as Record<string, string>} onSetStatus={(task, status) => { setStatus(task, status as AuditStatus) }} onClearSelection={clearBulkSelection} onSelectAll={selectAllVisible} onCompareSelected={(tasks) => { setCompareSelected(tasks); setCompareOpen(true) }} />}
      <KeyboardShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />

      {/* FOOTER */}
      <footer className="mt-auto border-t bg-card/80 backdrop-blur-sm py-4 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium">{activeProject?.name ?? 'Audit Dashboard'} Comprehensive Audit</span>
          </div>
          <div>
            Independent Fact-Check Verification &bull; {mounted ? new Date().toISOString().split('T')[0] : '—'} &bull; {findings.length} findings verified &bull; {stats.totalProposals} proposals
            {bookmarks.size > 0 && <span className="ml-2 text-amber-600">&bull; {bookmarks.size} bookmarked</span>}
            {progressStats.resolved > 0 && <span className="ml-2 text-emerald-600">&bull; {progressStats.percentComplete}% remediated ({progressStats.resolved}/{progressStats.total})</span>}
            {compareSelected.length > 0 && <span className="ml-2 text-purple-600">&bull; {compareSelected.length} in compare</span>}
            {findings.some(f => f.githubIssueUrl) && <span className="ml-2 text-teal-600">&bull; {findings.filter(f => f.githubIssueUrl).length} GitHub issues</span>}
          </div>
          <div className="mt-1 text-[10px] opacity-70">All claims confirmed against live repo code &bull; Press <kbd className="px-1 py-0.5 bg-muted border rounded">?</kbd> for shortcuts</div>
        </div>
      </footer>

      <ActivityLog />
      <FindingsStatsPanel findings={findings} />
      <AIChatPanel open={aiChatOpen} onOpenChange={setAiChatOpen} focusedFinding={focusedFindingIndex >= 0 && focusedFindingIndex < filteredFindings.length ? filteredFindings[focusedFindingIndex] : null} />
      <CommandPalette findings={findings} onNavigateToFinding={openDetails} onSwitchTab={setActiveTab} onApplyPreset={applyPresetByName} onToggleTheme={toggleThemeAction} onExport={handlePaletteExport} open={cmdPaletteOpen} onOpenChange={setCmdPaletteOpen} auditStatuses={statuses as Record<string, string>} />
    </div>
  )
}
