'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Button,
} from '@/components/ui/button'
import {
  Input,
} from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle2, Search, Filter, ChevronsDownUp, Expand,
  FileJson, FileText, CheckSquare, GitCompare, X,
  ShieldAlert, FileSpreadsheet, BookmarkCheck,
  Layers, ListChecks,
} from 'lucide-react'
import type { Severity, Tier, AuditStatus } from '@/lib/audit-types'
import {
  severityConfig, verificationConfig, tierLabels, auditStatusConfig, AUDIT_STATUS_ORDER,
} from '@/lib/audit-data'
import {
  type Finding, type BestProposalAnalysis,
} from '@/lib/data'
import {
  type GitHubIssueResult, type GitHubTokenStatus, type GitHubProjectResult, addActivityEntry,
} from '@/lib/use-findings'
import { FindingCard } from '@/components/finding-card'
import { SearchResultsPreview } from '@/components/search-enhancement'
import { FilterPresets, BUILT_IN_PRESETS, FILTER_PRESETS_STORAGE_KEY, type FilterPreset } from '@/components/filter-presets'
import { SavedViewsButton, type SavedViewFilters } from '@/components/saved-views'
import { exportJSONEnhanced, exportMarkdownEnhanced, exportCSV, type ProjectExportInfo } from '@/components/export-enhancements'
import { useProject } from '@/lib/project-context'
import { toast } from 'sonner'
import { severityOrder, tierColors } from '@/lib/dashboard-constants'
import dynamic from 'next/dynamic'

const TierSeverityBar = dynamic(
  () => import('./charts').then(m => m.TierSeverityBar),
  { ssr: false, loading: () => <div className="h-[8px]" /> },
)

export interface FindingsTabProps {
  findings: Finding[]
  filteredFindings: Finding[]
  analysisMap: Record<string, BestProposalAnalysis | undefined>
  // Filter state
  search: string
  setSearch: (s: string) => void
  severityFilter: string
  setSeverityFilter: (s: string) => void
  verificationFilter: string
  setVerificationFilter: (s: string) => void
  categoryFilter: string
  setCategoryFilter: (s: string) => void
  statusFilter: string
  setStatusFilter: (s: string) => void
  sortBy: string
  setSortBy: (s: string) => void
  // Bookmark state
  showBookmarkedOnly: boolean
  setShowBookmarkedOnly: (b: boolean) => void
  bookmarks: Set<string | number>
  toggleBookmark: (task: string | number) => void
  // Expand state
  expandedAll: Set<string | number>
  setExpandedAll: (s: Set<string | number>) => void
  toggleExpandAll: () => void
  // Bulk selection
  bulkSelectMode: boolean
  bulkSelected: Set<string | number>
  toggleBulkSelected: (task: string | number) => void
  selectAllVisible: (tasks: (string | number)[]) => void
  clearBulkSelection: () => void
  // Compare
  compareSelected: (string | number)[]
  toggleCompare: (task: string | number) => void
  addToCompare: (task: string | number) => void
  // Focus
  focusedFindingIndex: number
  // Deep dive
  deepDive: { severity: Severity; impact: number; count: number } | null
  setDeepDive: (d: { severity: Severity; impact: number; count: number } | null) => void
  impactLabelMap: Record<number, string>
  // Dialog
  openDetails: (finding: Finding) => void
  // Audit progress
  statuses: Record<string, string>
  setStatus: (task: string, status: AuditStatus) => void
  getNote: (task: string) => string
  setNote: (task: string, note: string) => void
  progressStats: {
    percentComplete: number
    resolved: number
    total: number
    counts: Record<string, number>
  }
  // Presets
  activePresetName: string | null
  setActivePresetName: (name: string | null) => void
  // GitHub
  githubTokenStatus: GitHubTokenStatus | null
  handleCreateIssue: (finding: Finding) => void
  creatingIssue: boolean
  githubIssueResults: Record<string, GitHubIssueResult | null>
  githubProjectNumber: number | null
  handleAddToProject: (issueNodeId: string, projectNumber: number) => void
  addingToProject: boolean
  handleCreateIssueAndLink: (finding: Finding) => void
  creatingAndLinking: Record<string, boolean>
}

export function FindingsTabContent(props: FindingsTabProps) {
  const { activeProject } = useProject()
  const {
    findings, filteredFindings, analysisMap,
    search, setSearch, severityFilter, setSeverityFilter,
    verificationFilter, setVerificationFilter, categoryFilter, setCategoryFilter,
    statusFilter, setStatusFilter, sortBy, setSortBy,
    showBookmarkedOnly, setShowBookmarkedOnly, bookmarks, toggleBookmark,
    expandedAll, setExpandedAll, toggleExpandAll,
    bulkSelectMode, bulkSelected, toggleBulkSelected, selectAllVisible, clearBulkSelection,
    compareSelected, toggleCompare, addToCompare,
    focusedFindingIndex,
    deepDive, setDeepDive, impactLabelMap,
    openDetails,
    statuses, setStatus, getNote, setNote, progressStats,
    activePresetName, setActivePresetName,
    githubTokenStatus, handleCreateIssue, creatingIssue,
    githubIssueResults, githubProjectNumber, handleAddToProject, addingToProject,
    handleCreateIssueAndLink, creatingAndLinking,
  } = props

  return (
    <div className="space-y-4 tab-content-enter">
      {/* Deep dive banner */}
      <AnimatePresence>
        {deepDive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                🔍 Deep dive: {severityConfig[deepDive.severity]?.label ?? deepDive.severity} severity × {impactLabelMap[deepDive.impact] ?? `Impact ${deepDive.impact}`} — {deepDive.count} findings
              </span>
              <button
                onClick={() => {
                  setDeepDive(null)
                  setSeverityFilter('all')
                  setCategoryFilter('all')
                  setVerificationFilter('all')
                  setStatusFilter('all')
                  setSearch('')
                  setShowBookmarkedOnly(false)
                }}
                className="ml-auto text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 transition-colors"
                aria-label="Close deep dive banner"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Search Results Preview */}
      <SearchResultsPreview
        findings={findings}
        query={search}
        onJumpToFinding={(f) => openDetails(f)}
      />
      {/* BULK SELECTION TOOLBAR (only shown when in bulk mode) */}
      <AnimatePresence>
        {bulkSelectMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="border-blue-500/40 bg-blue-500/5 no-print">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckSquare className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">
                      {bulkSelected.size} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => selectAllVisible(filteredFindings.map(f => f.task))}
                    >
                      Select all visible ({filteredFindings.length})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={clearBulkSelection}
                      disabled={bulkSelected.size === 0}
                    >
                      Clear selection
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const subset = findings.filter(f => bulkSelected.has(f.task))
                        const projectInfo: ProjectExportInfo | undefined = activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined
                        exportJSONEnhanced(subset, findings, statuses, projectInfo)
                      }}
                      disabled={bulkSelected.size === 0}
                    >
                      <FileJson className="h-3.5 w-3.5 mr-1" /> Export JSON ({bulkSelected.size})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const subset = findings.filter(f => bulkSelected.has(f.task))
                        const projectInfo: ProjectExportInfo | undefined = activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined
                        exportMarkdownEnhanced(subset, findings, statuses, projectInfo)
                      }}
                      disabled={bulkSelected.size === 0}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" /> Export MD ({bulkSelected.size})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const subset = findings.filter(f => bulkSelected.has(f.task))
                        exportCSV(subset, findings)
                      }}
                      disabled={bulkSelected.size === 0}
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export CSV ({bulkSelected.size})
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        const subset = findings.filter(f => bulkSelected.has(f.task))
                        subset.forEach(f => addToCompare(f.task))
                      }}
                      disabled={bulkSelected.size === 0 || compareSelected.length >= 3}
                    >
                      <GitCompare className="h-3.5 w-3.5 mr-1" /> Add to compare
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SEARCH + FILTERS (sticky) */}
      <Card className="no-print sticky-filters shadow-md">
        <CardContent className="p-3 sm:p-4">
          {/* Row 1: search + presets + sort + expand */}
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search findings, IDs, files, evidence... (/ to focus)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* Filter Presets */}
            <FilterPresets
              search={search}
              severityFilter={severityFilter}
              verificationFilter={verificationFilter}
              categoryFilter={categoryFilter}
              statusFilter={statusFilter}
              showBookmarkedOnly={showBookmarkedOnly}
              onSearchChange={setSearch}
              onSeverityFilterChange={setSeverityFilter}
              onVerificationFilterChange={setVerificationFilter}
              onCategoryFilterChange={setCategoryFilter}
              onStatusFilterChange={setStatusFilter}
              onShowBookmarkedOnlyChange={setShowBookmarkedOnly}
              activePresetName={activePresetName}
              onActivePresetNameChange={setActivePresetName}
            />
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[140px] btn-subtle-hover">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier">Sort: By Tier</SelectItem>
                  <SelectItem value="severity">Sort: By Severity</SelectItem>
                  <SelectItem value="risk">Sort: By Risk Score</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleExpandAll}
                className="flex-shrink-0"
              >
                {expandedAll.size > 0 ? (
                  <><ChevronsDownUp className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">Collapse All</span></>
                ) : (
                  <><Expand className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">Expand All</span></>
                )}
              </Button>
              <SavedViewsButton
                currentFilters={{
                  search,
                  severityFilter,
                  verificationFilter,
                  categoryFilter,
                  statusFilter,
                  sortBy,
                }}
                onApplyView={(filters: SavedViewFilters) => {
                  setSearch(filters.search)
                  setSeverityFilter(filters.severityFilter)
                  setVerificationFilter(filters.verificationFilter)
                  setCategoryFilter(filters.categoryFilter)
                  setStatusFilter(filters.statusFilter)
                  setSortBy(filters.sortBy)
                  toast.success('Saved view applied')
                }}
              />
            </div>
          </div>

          {/* Row 2: filter dropdowns (4 columns on desktop, 2x2 on mobile) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-full btn-subtle-hover">
                <Filter className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verificationFilter} onValueChange={setVerificationFilter}>
              <SelectTrigger className="w-full btn-subtle-hover">
                <Filter className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Verification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verifications</SelectItem>
                <SelectItem value="confirmed-execution">By execution</SelectItem>
                <SelectItem value="confirmed-reading">By reading</SelectItem>
                <SelectItem value="confirmed-logical">By logic</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full btn-subtle-hover">
                <Layers className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">All categories</SelectItem>
                {(() => {
                  const catMap: Record<string, number> = {}
                  findings.forEach(f => { catMap[f.category] = (catMap[f.category] ?? 0) + 1 })
                  return Object.entries(catMap)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <SelectItem key={cat} value={cat}>
                        {cat} ({count})
                      </SelectItem>
                    ))
                })()}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full btn-subtle-hover">
                <ListChecks className="h-3.5 w-3.5 mr-1 flex-shrink-0" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {AUDIT_STATUS_ORDER.map(s => (
                  <SelectItem key={s} value={s}>
                    {auditStatusConfig[s].label} ({progressStats.counts[s]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Row 3: filter chips + count + clear */}
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground flex-wrap gap-2">
            <span>
              Showing <strong className="text-foreground">{filteredFindings.length}</strong> of {findings.length} findings
              {showBookmarkedOnly && <span className="ml-1 text-amber-600">&bull; bookmarked only</span>}
              {bulkSelected.size > 0 && <span className="ml-1 text-blue-600">&bull; {bulkSelected.size} selected</span>}
            </span>
            {(search || severityFilter !== 'all' || verificationFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || showBookmarkedOnly) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  setSeverityFilter('all')
                  setVerificationFilter('all')
                  setCategoryFilter('all')
                  setStatusFilter('all')
                  setShowBookmarkedOnly(false)
                  setDeepDive(null)
                }}
                className="h-6 text-xs"
              >
                <X className="h-3 w-3 mr-1" /> Clear filters
              </Button>
            )}
          </div>

          {/* Filter chips row (visible when any filter is active) */}
          {(search || severityFilter !== 'all' || verificationFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || showBookmarkedOnly) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mr-1">
                Active:
              </span>
              {search && (
                <span className="filter-chip">
                  <Search className="h-2.5 w-2.5" />
                  "{search.length > 18 ? search.slice(0, 18) + '…' : search}"
                  <button onClick={() => setSearch('')} aria-label="Clear search filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {severityFilter !== 'all' && (
                <span className="filter-chip">
                  <ShieldAlert className="h-2.5 w-2.5" />
                  {severityConfig[severityFilter as Severity]?.label ?? severityFilter}
                  <button onClick={() => setSeverityFilter('all')} aria-label="Clear severity filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {verificationFilter !== 'all' && (
                <span className="filter-chip">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {verificationConfig[verificationFilter as keyof typeof verificationConfig]?.label ?? verificationFilter}
                  <button onClick={() => setVerificationFilter('all')} aria-label="Clear verification filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {categoryFilter !== 'all' && (
                <span className="filter-chip">
                  <Layers className="h-2.5 w-2.5" />
                  {categoryFilter}
                  <button onClick={() => setCategoryFilter('all')} aria-label="Clear category filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="filter-chip">
                  <ListChecks className="h-2.5 w-2.5" />
                  {auditStatusConfig[statusFilter as AuditStatus]?.label ?? statusFilter}
                  <button onClick={() => setStatusFilter('all')} aria-label="Clear status filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
              {showBookmarkedOnly && (
                <span className="filter-chip">
                  <BookmarkCheck className="h-2.5 w-2.5" />
                  Bookmarked only
                  <button onClick={() => setShowBookmarkedOnly(false)} aria-label="Clear bookmark filter">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* TIER SUBTABS */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full h-auto no-print">
          <TabsTrigger value="all" className="text-xs py-2 flex-col gap-0.5 h-auto">
            <span className="flex items-center gap-1">
              All
              <Badge variant="secondary" className="text-[10px]">{findings.length}</Badge>
            </span>
          </TabsTrigger>
          {(['tier0', 'tier1', 'tier2', 'additional', 'deferred'] as Tier[]).map(tier => {
            const count = findings.filter(f => f.tier === tier).length
            return (
              <TabsTrigger key={tier} value={tier} className="text-xs py-2 flex-col gap-0.5 h-auto">
                <span className="flex items-center gap-1">
                  {tierLabels[tier].short}
                  <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* ALL FINDINGS (filtered) */}
        <TabsContent value="all" className="space-y-3">
          {/* Quick stats banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 no-print">
            {(['tier0', 'tier1', 'tier2'] as Tier[]).map(tier => (
              <div key={tier} className="rounded-md border p-2 bg-card/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {tierLabels[tier].short}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {findings.filter(f => f.tier === tier).length} findings
                  </span>
                </div>
                <TierSeverityBar tier={tier} findings={findings} />
              </div>
            ))}
          </div>

          <AnimatePresence mode="popLayout">
            {filteredFindings.map((finding, idx) => (
              <FindingCard
                key={finding.task}
                finding={finding}
                focused={focusedFindingIndex === idx}
                expanded={expandedAll.has(finding.task)}
                onToggle={() => {
                  const next = new Set(expandedAll)
                  if (next.has(finding.task)) next.delete(finding.task)
                  else next.add(finding.task)
                  setExpandedAll(next)
                }}
                isBookmarked={bookmarks.has(finding.task)}
                onBookmark={() => toggleBookmark(finding.task)}
                onViewDetails={() => openDetails(finding)}
                status={statuses[String(finding.task)] ?? 'not-started'}
                onStatusChange={(s) => { setStatus(finding.task, s); addActivityEntry({ type: 'status_change', task: String(finding.task), description: `Changed status of Task ${finding.task} to ${s}` }) }}
                note={getNote(finding.task)}
                onSaveNote={(note) => { setNote(finding.task, note); addActivityEntry({ type: 'note_save', task: String(finding.task), description: `Saved note for Task ${finding.task}` }) }}
                bulkSelectMode={bulkSelectMode}
                isSelected={bulkSelected.has(finding.task)}
                onToggleSelect={() => toggleBulkSelected(finding.task)}
                isInCompare={compareSelected.includes(finding.task)}
                onToggleCompare={() => toggleCompare(finding.task)}
                analysisMap={analysisMap}
                githubTokenStatus={githubTokenStatus}
                onCreateIssue={handleCreateIssue}
                creatingIssue={creatingIssue}
                githubIssueResult={githubIssueResults[finding.task]}
                githubProjectNumber={githubProjectNumber}
                onAddToProject={handleAddToProject}
                addingToProject={addingToProject}
                onCreateIssueAndLink={handleCreateIssueAndLink}
                creatingAndLinking={creatingAndLinking[finding.task] ?? false}
              />
            ))}
          </AnimatePresence>
          {filteredFindings.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <div>No findings match your filters.</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TIER-SPECIFIC */}
        {(['tier0', 'tier1', 'tier2', 'additional', 'deferred'] as Tier[]).map(tier => (
          <TabsContent key={tier} value={tier} className="space-y-3">
            <div className="rounded-md border p-3 bg-card/50 no-print">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-1 h-6 rounded-full"
                  style={{ backgroundColor: tierColors[tier] }}
                />
                <h2 className="text-lg font-bold flex-1">{tierLabels[tier].full}</h2>
                <Badge variant="outline" className="text-[10px]">
                  {findings.filter(f => f.tier === tier).length} total
                </Badge>
              </div>
              <TierSeverityBar tier={tier} findings={findings} />
            </div>
            {findings
              .filter(f => f.tier === tier)
              .filter(f => {
                // Apply same filters
                if (search.trim()) {
                  const q = search.toLowerCase()
                  if (!(f.title.toLowerCase().includes(q) || f.summary.toLowerCase().includes(q) || f.claim.toLowerCase().includes(q) || f.evidence.toLowerCase().includes(q) || f.category.toLowerCase().includes(q) || f.findingIds.some(id => id.toLowerCase().includes(q)) || String(f.task).toLowerCase().includes(q) || f.affectedFiles.some(file => file.toLowerCase().includes(q)))) return false
                }
                if (severityFilter !== 'all' && f.severity !== severityFilter) return false
                if (verificationFilter !== 'all' && f.verificationStatus !== verificationFilter) return false
                if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
                if (statusFilter !== 'all' && (statuses[String(f.task)] ?? 'not-started') !== statusFilter) return false
                if (showBookmarkedOnly && !bookmarks.has(f.task)) return false
                return true
              })
              .map(finding => (
                <FindingCard
                  key={finding.task}
                  finding={finding}
                  expanded={expandedAll.has(finding.task)}
                  onToggle={() => {
                    const next = new Set(expandedAll)
                    if (next.has(finding.task)) next.delete(finding.task)
                    else next.add(finding.task)
                    setExpandedAll(next)
                  }}
                  isBookmarked={bookmarks.has(finding.task)}
                  onBookmark={() => toggleBookmark(finding.task)}
                  onViewDetails={() => openDetails(finding)}
                  status={statuses[String(finding.task)] ?? 'not-started'}
                  onStatusChange={(s) => { setStatus(finding.task, s); addActivityEntry({ type: 'status_change', task: String(finding.task), description: `Changed status of Task ${finding.task} to ${s}` }) }}
                  note={getNote(finding.task)}
                  onSaveNote={(note) => { setNote(finding.task, note); addActivityEntry({ type: 'note_save', task: String(finding.task), description: `Saved note for Task ${finding.task}` }) }}
                  bulkSelectMode={bulkSelectMode}
                  isSelected={bulkSelected.has(finding.task)}
                  onToggleSelect={() => toggleBulkSelected(finding.task)}
                  isInCompare={compareSelected.includes(finding.task)}
                  onToggleCompare={() => toggleCompare(finding.task)}
                  analysisMap={analysisMap}
                  githubTokenStatus={githubTokenStatus}
                  onCreateIssue={handleCreateIssue}
                  creatingIssue={creatingIssue}
                  githubIssueResult={githubIssueResults[finding.task]}
                  githubProjectNumber={githubProjectNumber}
                  onAddToProject={handleAddToProject}
                  addingToProject={addingToProject}
                  onCreateIssueAndLink={handleCreateIssueAndLink}
                  creatingAndLinking={creatingAndLinking[finding.task] ?? false}
                />
              ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
